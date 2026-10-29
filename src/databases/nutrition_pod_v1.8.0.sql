-- =====================================================================
-- FactorPrep v1.8.0 — NUTRITION POD MIGRATION (paste into Supabase SQL Editor)
-- Run ONCE, top to bottom. Safe to re-run by accident:
-- table/index use IF NOT EXISTS, policies are dropped first.
--
-- Do NOT re-run the full schema.sql / policies.sql — those are canonical
-- dumps of the live database and are not idempotent.
--
-- Two-tier data model (nutrition pod plan §3/§4):
--   foods            → REFERENCE data: public read for authenticated users,
--                      written only by the ETL script (service role, bypasses
--                      RLS). Contains NO athlete data, so it is safe to
--                      aggregate in a materialized view.
--   nutrition_logs   → ATHLETE data: athlete CRUD, coach-of-athlete read
--                      (exactly the cycle_logs access shape). Daily rollups
--                      are computed CLIENT-SIDE from RLS-filtered rows —
--                      materialized views bypass RLS and would leak every
--                      athlete's data to any coach, so we never put athlete
--                      data in a view.
--
-- Nutrients are stored wide (one column per nutrient, per 100g) rather than
-- a long food_nutrients table: the scoring view reads columns directly and
-- the ETL pivots the source CSVs before import.
-- =====================================================================

-- ============ 1. TABLES ============

-- Reference food database (FNDDS + AUSNUT import; see scripts/nutrition_etl.mjs)
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('FNDDS', 'AUSNUT', 'OTHER')),
  source_code text not null,               -- FDC/NDB number or AUSNUT food id
  description text not null,
  category text,                           -- WWEIA food category (FNDDS) or AUSNUT survey group
  portion_label text,                      -- default portion descriptor, e.g. '1 medium apple'
  portion_grams numeric,                   -- default portion weight in grams
  -- per-100g nutrient values. The density score (v_food_scores) scores 17
  -- axes: the 14 vitamins/minerals from plan §4.1 + 3 fatty-acid QUALITY
  -- axes (saturated share of fat, ALA ω-3, ω-6:ω-3 balance). Macronutrients
  -- (kJ, protein, carbs, sugars, fibre, total fat, cholesterol) and vitamin A
  -- are informational — they display in the app's totals bar; quality
  -- (processing level) is the quality tier's domain, not the score's.
  energy_kj numeric,
  protein_g numeric,
  carbohydrate_g numeric,
  sugars_g numeric,
  fibre_g numeric,
  fat_total_g numeric,
  fat_sat_g numeric,
  cholesterol_mg numeric,
  calcium_mg numeric,
  iron_mg numeric,
  magnesium_mg numeric,
  potassium_mg numeric,
  sodium_mg numeric,
  zinc_mg numeric,
  vitamin_a_ug_rae numeric,
  vitamin_c_mg numeric,
  vitamin_d_ug numeric,
  vitamin_e_mg numeric,
  folate_ug numeric,                       -- DFE (informational)
  -- plan §4.1 scoring nutrients (v1.8.2): fatty-acid profile + B vitamins
  -- + phosphorus + iodine + folate TOTAL (not DFE)
  fat_mono_g numeric,
  fat_poly_g numeric,
  linoleic_g numeric,
  ala_g numeric,
  thiamin_mg numeric,
  riboflavin_mg numeric,
  niacin_mg numeric,
  phosphorus_mg numeric,
  iodine_ug numeric,
  folate_total_ug numeric,
  created_at timestamptz not null default now(),
  unique (source, source_code)
);

-- Athlete meal logs. items = JSON array of {food_id, grams} (client-validated).
-- session_log_id links a refuel entry to the session that triggered it
-- (plan §7.1 session-anchored logging); nullable for free-form entries.
create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  entry_date date not null,
  session_log_id uuid references public.session_logs(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ 2. INDEXES ============

create index if not exists idx_fd_source_code on public.foods(source, source_code);
create index if not exists idx_fd_description on public.foods(description);
create index if not exists idx_nl_athlete_date on public.nutrition_logs(athlete_id, entry_date);
create index if not exists idx_nl_session      on public.nutrition_logs(session_log_id);

-- ============ 3. RLS ============

alter table public.foods enable row level security;
alter table public.nutrition_logs enable row level security;

-- ============ 4. FOODS POLICIES (reference data) ============
-- Read for any authenticated user (foods are public reference data).
-- Writes happen ONLY via the ETL service role (bypasses RLS), so there are
-- deliberately no insert/update/delete policies for client roles.

drop policy if exists fd_select on public.foods;
create policy fd_select on public.foods for select
  using (auth.role() = 'authenticated');

-- ============ 5. NUTRITION_LOGS POLICIES (mirror cycle_logs access) ============
-- Athlete CRUD via current_athlete_id(); coaches can read only for athletes
-- they actually coach; club admins can read/delete for their club.

drop policy if exists nl_delete on public.nutrition_logs;
create policy nl_delete on public.nutrition_logs for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists nl_insert on public.nutrition_logs;
create policy nl_insert on public.nutrition_logs for insert
  with check (athlete_id = current_athlete_id());

drop policy if exists nl_select on public.nutrition_logs;
create policy nl_select on public.nutrition_logs for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = nutrition_logs.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = nutrition_logs.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

drop policy if exists nl_update on public.nutrition_logs;
create policy nl_update on public.nutrition_logs for update
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());

-- ============ FOOD SCORES (materialized view — reference data only) ============
-- TWO scores per food, both pure functions of stored data (plan §4.6).
-- NO athlete data touches this view, so the RLS bypass of a materialized
-- view is safe. NEVER add athlete rollups here.
--
--   percentile_score (primary, 0–100) — 17 directional axes: the 14 §4.1
--     vitamins/minerals + 3 fatty-acid QUALITY axes (fat AMOUNT never
--     scores). Contribution per axis = 100·(1 − (rank−1)/(n−1)), rank 1 =
--     best, where n = the number of foods that REPORT that axis —
--     count(col) OVER (), not the table size. Iodine exists only in AUSNUT;
--     dividing it by the full 9,365 squeezed every AUSNUT food's iodine
--     contribution into a 60–100 band. A row that does NOT report an axis
--     gets NULL for it (the CASE guard) and the axis is dropped from its
--     average — otherwise nulls would collect negative contributions.
--   score_axes — how many axes that food was actually scored on. Named, not
--     hidden: a 16/17 food is not compared like-for-like with a 17/17 one.
--   raw_score (§4.2 legacy) — plain sum of the plan's 19 nutrient values per
--     100 g in native units (missing → 0), kept for continuity and audit
--     ONLY. Potassium, phosphorus and calcium dominate it, and linoleic/ALA
--     are double-counted inside total polyunsaturated fat, so it must never
--     be used to rank foods.
--   rank_position — 1-based rank of percentile_score across all foods
--     (plan §4.6), for "top X%" display.
--
-- AMENDMENT to plan §4.4: missing values are NOT scored as 0. A food is
-- scored on the axes it actually reports (available case) and its
-- percentile_score is the mean of those contributions — NULL if it reports
-- none. Rationale: with 100% coverage of the 14 vitamin/mineral axes there
-- are no patchy foods to distort, and the 3 fat-quality axes are genuinely
-- undefined for <1 g/100 g fat foods rather than "bad".
-- v_archetype_scores is a plain view over this matview, so it must be
-- dropped first: DROP MATERIALIZED VIEW fails while a dependent object
-- still exists, and CASCADE would drop it silently. It is recreated at
-- the end of this file.
drop view if exists public.v_archetype_scores;
drop materialized view if exists public.v_food_scores;
create materialized view public.v_food_scores as
with base as (
  select f.*,
    -- Saturated share of fat: needs real fat AND a reported sat-fat value.
    -- coalesce(fat_sat_g, 0) would score unanalysed foods as 0% saturated,
    -- i.e. best-in-database fat quality.
    case when f.fat_total_g >= 1 and f.fat_sat_g is not null
         then f.fat_sat_g / nullif(f.fat_total_g, 0) end as sat_share,
    -- ω-6:ω-3 balance, lower = better. Undefined (NULL → axis absent)
    -- unless BOTH fatty acids are reported; a reported ALA of 0 with ω-6
    -- present is genuinely the worst balance.
    case when f.fat_total_g >= 1 and f.ala_g is not null and f.linoleic_g is not null
         then case when f.ala_g > 0 then f.linoleic_g / f.ala_g
                   when f.linoleic_g > 0 then 1000000000
                   else null end
    end as w63,
    -- per-kJ denominators are undefined without energy
    case when f.energy_kj > 0 then f.energy_kj end as kj
  from public.foods f
),
ranked as (
  select b.*,
    case when b.thiamin_mg is not null then 100.0 * (1 - (rank() over (order by b.thiamin_mg desc nulls last) - 1)::numeric / greatest(count(b.thiamin_mg) over () - 1, 1)) end as c_thiamin,
    case when b.riboflavin_mg is not null then 100.0 * (1 - (rank() over (order by b.riboflavin_mg desc nulls last) - 1)::numeric / greatest(count(b.riboflavin_mg) over () - 1, 1)) end as c_ribo,
    case when b.niacin_mg is not null then 100.0 * (1 - (rank() over (order by b.niacin_mg desc nulls last) - 1)::numeric / greatest(count(b.niacin_mg) over () - 1, 1)) end as c_niacin,
    case when b.vitamin_c_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_c_mg desc nulls last) - 1)::numeric / greatest(count(b.vitamin_c_mg) over () - 1, 1)) end as c_vit_c,
    case when b.vitamin_e_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_e_mg desc nulls last) - 1)::numeric / greatest(count(b.vitamin_e_mg) over () - 1, 1)) end as c_vit_e,
    case when b.folate_total_ug is not null then 100.0 * (1 - (rank() over (order by b.folate_total_ug desc nulls last) - 1)::numeric / greatest(count(b.folate_total_ug) over () - 1, 1)) end as c_folate,
    case when b.vitamin_d_ug is not null then 100.0 * (1 - (rank() over (order by b.vitamin_d_ug desc nulls last) - 1)::numeric / greatest(count(b.vitamin_d_ug) over () - 1, 1)) end as c_vit_d,
    case when b.calcium_mg is not null then 100.0 * (1 - (rank() over (order by b.calcium_mg desc nulls last) - 1)::numeric / greatest(count(b.calcium_mg) over () - 1, 1)) end as c_calcium,
    case when b.iron_mg is not null then 100.0 * (1 - (rank() over (order by b.iron_mg desc nulls last) - 1)::numeric / greatest(count(b.iron_mg) over () - 1, 1)) end as c_iron,
    case when b.magnesium_mg is not null then 100.0 * (1 - (rank() over (order by b.magnesium_mg desc nulls last) - 1)::numeric / greatest(count(b.magnesium_mg) over () - 1, 1)) end as c_magnesium,
    case when b.phosphorus_mg is not null then 100.0 * (1 - (rank() over (order by b.phosphorus_mg desc nulls last) - 1)::numeric / greatest(count(b.phosphorus_mg) over () - 1, 1)) end as c_phos,
    case when b.potassium_mg is not null then 100.0 * (1 - (rank() over (order by b.potassium_mg desc nulls last) - 1)::numeric / greatest(count(b.potassium_mg) over () - 1, 1)) end as c_potassium,
    case when b.zinc_mg is not null then 100.0 * (1 - (rank() over (order by b.zinc_mg desc nulls last) - 1)::numeric / greatest(count(b.zinc_mg) over () - 1, 1)) end as c_zinc,
    case when b.iodine_ug is not null then 100.0 * (1 - (rank() over (order by b.iodine_ug desc nulls last) - 1)::numeric / greatest(count(b.iodine_ug) over () - 1, 1)) end as c_iodine,
    case when b.ala_g is not null then 100.0 * (1 - (rank() over (order by b.ala_g desc nulls last) - 1)::numeric / greatest(count(b.ala_g) over () - 1, 1)) end as c_ala,
    case when b.sat_share is not null then 100.0 * (1 - (rank() over (order by b.sat_share asc nulls last) - 1)::numeric / greatest(count(b.sat_share) over () - 1, 1)) end as c_satshare,
    case when b.w63 is not null then 100.0 * (1 - (rank() over (order by b.w63 asc nulls last) - 1)::numeric / greatest(count(b.w63) over () - 1, 1)) end as c_w63
  from base b
),

-- Same 17 axes and the same percentile method, but each amount is divided
-- by the food's energy (per 100 kJ) instead of by 100 g. Two ratio axes
-- (sat_share, w63) are energy-free, so they reuse the per-100 g contributions.
ranked_kj as (
  select b.*,
    case when b.kj is not null and b.thiamin_mg is not null then 100.0 * (1 - (rank() over (order by b.thiamin_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.thiamin_mg end) over () - 1, 1)) end as ck_thiamin_mg,
    case when b.kj is not null and b.riboflavin_mg is not null then 100.0 * (1 - (rank() over (order by b.riboflavin_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.riboflavin_mg end) over () - 1, 1)) end as ck_riboflavin_mg,
    case when b.kj is not null and b.niacin_mg is not null then 100.0 * (1 - (rank() over (order by b.niacin_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.niacin_mg end) over () - 1, 1)) end as ck_niacin_mg,
    case when b.kj is not null and b.vitamin_c_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_c_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.vitamin_c_mg end) over () - 1, 1)) end as ck_vitamin_c_mg,
    case when b.kj is not null and b.vitamin_e_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_e_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.vitamin_e_mg end) over () - 1, 1)) end as ck_vitamin_e_mg,
    case when b.kj is not null and b.folate_total_ug is not null then 100.0 * (1 - (rank() over (order by b.folate_total_ug * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.folate_total_ug end) over () - 1, 1)) end as ck_folate_total_ug,
    case when b.kj is not null and b.vitamin_d_ug is not null then 100.0 * (1 - (rank() over (order by b.vitamin_d_ug * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.vitamin_d_ug end) over () - 1, 1)) end as ck_vitamin_d_ug,
    case when b.kj is not null and b.calcium_mg is not null then 100.0 * (1 - (rank() over (order by b.calcium_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.calcium_mg end) over () - 1, 1)) end as ck_calcium_mg,
    case when b.kj is not null and b.iron_mg is not null then 100.0 * (1 - (rank() over (order by b.iron_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.iron_mg end) over () - 1, 1)) end as ck_iron_mg,
    case when b.kj is not null and b.magnesium_mg is not null then 100.0 * (1 - (rank() over (order by b.magnesium_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.magnesium_mg end) over () - 1, 1)) end as ck_magnesium_mg,
    case when b.kj is not null and b.phosphorus_mg is not null then 100.0 * (1 - (rank() over (order by b.phosphorus_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.phosphorus_mg end) over () - 1, 1)) end as ck_phosphorus_mg,
    case when b.kj is not null and b.potassium_mg is not null then 100.0 * (1 - (rank() over (order by b.potassium_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.potassium_mg end) over () - 1, 1)) end as ck_potassium_mg,
    case when b.kj is not null and b.zinc_mg is not null then 100.0 * (1 - (rank() over (order by b.zinc_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.zinc_mg end) over () - 1, 1)) end as ck_zinc_mg,
    case when b.kj is not null and b.iodine_ug is not null then 100.0 * (1 - (rank() over (order by b.iodine_ug * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.iodine_ug end) over () - 1, 1)) end as ck_iodine_ug,
    case when b.kj is not null and b.ala_g is not null then 100.0 * (1 - (rank() over (order by b.ala_g * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.ala_g end) over () - 1, 1)) end as ck_ala_g
  from ranked b
),
-- Available case: keep only the contributions this food actually earned.
scored as (
  select b.*,
    array(select v from unnest(array[
      c_thiamin, c_ribo, c_niacin, c_vit_c, c_vit_e, c_folate, c_vit_d,
      c_calcium, c_iron, c_magnesium, c_phos, c_potassium, c_zinc,
      c_iodine, c_ala, c_satshare, c_w63
    ]) as t(v) where v is not null) as axes,
    array(select v from unnest(array[
      ck_thiamin_mg, ck_riboflavin_mg, ck_niacin_mg, ck_vitamin_c_mg, ck_vitamin_e_mg,
      ck_folate_total_ug, ck_vitamin_d_ug, ck_calcium_mg, ck_iron_mg, ck_magnesium_mg,
      ck_phosphorus_mg, ck_potassium_mg, ck_zinc_mg, ck_iodine_ug, ck_ala_g,
      c_satshare, c_w63
    ]) as t(v) where v is not null) as axes_kj
  from ranked_kj b
),
final as (
  select id, source, description, category,
    round((select avg(v) from unnest(axes) as t(v)), 2)    as percentile_score,
    (select count(*) from unnest(axes) as t(v))::int       as score_axes,
    round((select avg(v) from unnest(axes_kj) as t(v)), 2) as density_per_kj,
    (select count(*) from unnest(axes_kj) as t(v))::int    as score_axes_kj,
    round(
      coalesce(fat_sat_g,0) + coalesce(fat_mono_g,0) + coalesce(fat_poly_g,0)
      + coalesce(linoleic_g,0) + coalesce(ala_g,0)
      + coalesce(thiamin_mg,0) + coalesce(riboflavin_mg,0) + coalesce(niacin_mg,0)
      + coalesce(vitamin_c_mg,0) + coalesce(vitamin_e_mg,0)
      + coalesce(folate_total_ug,0) + coalesce(vitamin_d_ug,0)
      + coalesce(calcium_mg,0) + coalesce(iron_mg,0) + coalesce(magnesium_mg,0)
      + coalesce(phosphorus_mg,0) + coalesce(potassium_mg,0) + coalesce(zinc_mg,0)
      + coalesce(iodine_ug,0)
    , 2) as raw_score
  from scored
)
select f.*,
  rank() over (order by f.percentile_score desc nulls last) as rank_position
from final f;

create index if not exists idx_fs_score on public.v_food_scores(percentile_score desc);
create index if not exists idx_fs_kj    on public.v_food_scores(density_per_kj desc);
grant select on public.v_food_scores to authenticated;

-- The ETL script calls this via rpc after every successful import.
create or replace function public.refresh_nutrition_scores()
returns void
language sql
security definer
set search_path to ''
as $$
  refresh materialized view public.v_food_scores;
$$;


