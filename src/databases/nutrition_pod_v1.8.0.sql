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

-- ============ 6. FOOD SCORES (materialized view — reference data only) ============
-- TWO scores per food, both pure functions of stored data (plan §4.6):
--
--   percentile_score (primary, 0–100) — 17 directional axes. The 14
--     vitamins/minerals from §4.1 (ranked DESC nulls last: rank 1 = highest
--     value) plus 3 fatty-acid QUALITY axes. Fat AMOUNT never scores:
--       * satShare = saturated ÷ total fat, lower = better; foods with
--         < 1 g/100 g total fat are NEUTRAL (50) — fat quality, not quantity
--       * ala_g    = ω-3 amount, higher = better
--       * w63      = ω-6 ÷ ω-3 balance, lower = better; ω-6 present with
--         no ω-3 = worst; neither present = neutral (50)
--     Contribution per axis = (100 − r) where r = 100·rank/N: best earns
--     100, worst earns 0, missing ranks worst (§4.4). Score = mean, 2dp.
--     A high score ALWAYS means nutritionally better.
--
--   raw_score (§4.2 legacy) — plain sum of the plan's 19 nutrient values
--     per 100 g in native units. The §4.2 worked examples (cider ≈121.46,
--     blackcurrant ≈639.67) validate the ETL against this.
--
-- NO athlete data touches this view, so the RLS bypass of a materialized
-- view is safe. NEVER add athlete rollups here.
drop materialized view if exists public.v_food_scores;
create materialized view public.v_food_scores as
with base as (
  select f.*,
    case when f.fat_total_g >= 1
         then coalesce(f.fat_sat_g, 0) / nullif(f.fat_total_g, 0) end  as sat_share,
    case when coalesce(f.ala_g, 0) > 0
         then coalesce(f.linoleic_g, 0) / f.ala_g
         when coalesce(f.linoleic_g, 0) > 0 then 1000000000
    end as w63
  from public.foods f
),
ranked as (
  select b.*,
    100.0 * rank() over (order by b.thiamin_mg desc nulls last) / count(*) over ()        as r_thiamin,
    100.0 * rank() over (order by b.riboflavin_mg desc nulls last) / count(*) over ()     as r_ribo,
    100.0 * rank() over (order by b.niacin_mg desc nulls last) / count(*) over ()         as r_niacin,
    100.0 * rank() over (order by b.vitamin_c_mg desc nulls last) / count(*) over ()      as r_vit_c,
    100.0 * rank() over (order by b.vitamin_e_mg desc nulls last) / count(*) over ()      as r_vit_e,
    100.0 * rank() over (order by b.folate_total_ug desc nulls last) / count(*) over ()   as r_folate,
    100.0 * rank() over (order by b.vitamin_d_ug desc nulls last) / count(*) over ()      as r_vit_d,
    100.0 * rank() over (order by b.calcium_mg desc nulls last) / count(*) over ()        as r_calcium,
    100.0 * rank() over (order by b.iron_mg desc nulls last) / count(*) over ()           as r_iron,
    100.0 * rank() over (order by b.magnesium_mg desc nulls last) / count(*) over ()      as r_magnesium,
    100.0 * rank() over (order by b.phosphorus_mg desc nulls last) / count(*) over ()     as r_phos,
    100.0 * rank() over (order by b.potassium_mg desc nulls last) / count(*) over ()      as r_potassium,
    100.0 * rank() over (order by b.zinc_mg desc nulls last) / count(*) over ()           as r_zinc,
    100.0 * rank() over (order by b.iodine_ug desc nulls last) / count(*) over ()         as r_iodine,
    100.0 * rank() over (order by b.ala_g desc nulls last) / count(*) over ()             as r_ala,
    100.0 * rank() over (order by b.sat_share asc nulls last) / count(*) over ()          as r_satshare,
    100.0 * rank() over (order by b.w63 asc nulls last) / count(*) over ()                as r_w63
  from base b
)
select id, source, description, category,
  round((
    -- 14 vitamins/minerals (§4.1): rank 1 = highest value → (100 - r) = 100
    (100 - coalesce(r_thiamin,50)) + (100 - coalesce(r_ribo,50)) + (100 - coalesce(r_niacin,50))
    + (100 - coalesce(r_vit_c,50)) + (100 - coalesce(r_vit_e,50)) + (100 - coalesce(r_folate,50))
    + (100 - coalesce(r_vit_d,50)) + (100 - coalesce(r_calcium,50)) + (100 - coalesce(r_iron,50))
    + (100 - coalesce(r_magnesium,50)) + (100 - coalesce(r_phos,50)) + (100 - coalesce(r_potassium,50))
    + (100 - coalesce(r_zinc,50)) + (100 - coalesce(r_iodine,50))
    -- 3 fatty-acid QUALITY axes (fat amount never scores)
    + (100 - coalesce(r_ala,50))
    + case when sat_share is null then 50 else (100 - coalesce(r_satshare,50)) end
    + case when w63 is null then 50 else (100 - coalesce(r_w63,50)) end
  ) / 17.0, 2) as percentile_score,
  -- §4.2 legacy raw score: the plan's 19 values in native units
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
from ranked;

create index if not exists idx_fs_score on public.v_food_scores(percentile_score desc);
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


