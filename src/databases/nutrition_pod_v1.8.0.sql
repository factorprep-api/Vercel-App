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
  -- per-100g nutrient values (19 scored nutrients)
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
  folate_ug numeric,
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
-- Directional percentile per nutrient (0–100, higher = better). The four
-- "limit" nutrients (sugars, sat fat, sodium, cholesterol) are inverted so a
-- high score ALWAYS means nutritionally better. Final score = mean of the
-- 19 directional percentiles, rounded to 2dp.
-- Missing nutrients are treated as zero (plan §4.4): 'desc nulls last' ranks
-- them worst for good nutrients; 'asc nulls first' ranks them best for the
-- inverted ones (zero sugar/sodium IS the best case).
-- NO athlete data touches this view, so the RLS bypass of a materialized
-- view is safe. NEVER add athlete rollups here.
drop materialized view if exists public.v_food_scores;
create materialized view public.v_food_scores as
with ranked as (
  select f.id, f.source, f.description, f.category,
    100.0 * rank() over (order by f.protein_g desc nulls last) / count(*) over ()       as r_protein,
    100.0 * rank() over (order by f.carbohydrate_g desc nulls last) / count(*) over ()  as r_carb,
    100.0 * rank() over (order by f.fibre_g desc nulls last) / count(*) over ()         as r_fibre,
    100.0 * rank() over (order by f.fat_total_g desc nulls last) / count(*) over ()     as r_fat,
    100.0 * rank() over (order by f.energy_kj desc nulls last) / count(*) over ()       as r_energy,
    100.0 * rank() over (order by f.calcium_mg desc nulls last) / count(*) over ()      as r_calcium,
    100.0 * rank() over (order by f.iron_mg desc nulls last) / count(*) over ()         as r_iron,
    100.0 * rank() over (order by f.magnesium_mg desc nulls last) / count(*) over ()    as r_magnesium,
    100.0 * rank() over (order by f.potassium_mg desc nulls last) / count(*) over ()    as r_potassium,
    100.0 * rank() over (order by f.zinc_mg desc nulls last) / count(*) over ()         as r_zinc,
    100.0 * rank() over (order by f.vitamin_a_ug_rae desc nulls last) / count(*) over () as r_vit_a,
    100.0 * rank() over (order by f.vitamin_c_mg desc nulls last) / count(*) over ()    as r_vit_c,
    100.0 * rank() over (order by f.vitamin_d_ug desc nulls last) / count(*) over ()    as r_vit_d,
    100.0 * rank() over (order by f.vitamin_e_mg desc nulls last) / count(*) over ()    as r_vit_e,
    100.0 * rank() over (order by f.folate_ug desc nulls last) / count(*) over ()       as r_folate,
    100.0 * rank() over (order by f.sugars_g asc nulls first) / count(*) over ()        as r_sugars,
    100.0 * rank() over (order by f.fat_sat_g asc nulls first) / count(*) over ()       as r_sat,
    100.0 * rank() over (order by f.sodium_mg asc nulls first) / count(*) over ()       as r_sodium,
    100.0 * rank() over (order by f.cholesterol_mg asc nulls first) / count(*) over ()  as r_chol
  from public.foods f
)
select id, source, description, category,
  round((
    coalesce(r_protein,50) + coalesce(r_carb,50) + coalesce(r_fibre,50) + coalesce(r_fat,50)
    + coalesce(r_energy,50) + coalesce(r_calcium,50) + coalesce(r_iron,50) + coalesce(r_magnesium,50)
    + coalesce(r_potassium,50) + coalesce(r_zinc,50) + coalesce(r_vit_a,50) + coalesce(r_vit_c,50)
    + coalesce(r_vit_d,50) + coalesce(r_vit_e,50) + coalesce(r_folate,50)
    + (100 - coalesce(r_sugars,50)) + (100 - coalesce(r_sat,50)) + (100 - coalesce(r_sodium,50))
    + (100 - coalesce(r_chol,50))
  ) / 19.0, 2) as score
from ranked;

create index if not exists idx_fs_score on public.v_food_scores(score desc);
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


