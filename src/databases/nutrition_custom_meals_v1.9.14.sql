-- =====================================================================
-- FactorPrep v1.9.14 — CUSTOM MEALS MIGRATION (Supabase SQL Editor)
-- Run ONCE. Idempotent like nutrition_meal_favorites_v1.9.4.sql
-- (IF NOT EXISTS, policies dropped first).
--
-- custom_meals: athlete-built meals (a daily smoothie, a go-to bowl)
-- that live alongside the ETL-generated meal_archetypes in Quick
-- meals and the unified food search. Strictly athlete-owned: nobody
-- can see or touch another athlete's meals (same access shape as
-- meal_favorites, admin cleanup included).
--
-- Design decisions (see docs/NUTRITION_PLAN.md §A13):
--   • items is a jsonb SNAPSHOT of the meal's foods at save time
--     ({ food_id, name, grams, kj100, protein100, carbs100, fat100,
--     fibre100, percentile_score, density_per_kj }). If the food
--     database is re-imported or a food disappears, saved meals keep
--     their numbers — a saved meal is a recipe card, not a live view.
--   • totals are resolved CLIENT-SIDE at save time (gram-weighted
--     means, same math as the archetype views) and snapshotted on the
--     row, so Quick meals cards never recompute from stale parts.
--   • starred is a boolean ON the row (not a separate favorites table)
--     — one source of truth per custom meal, no FK gymnastics.
--   • No UPDATE policy for items/name: saved meals are immutable
--     recipes (edit = build a new one, deliberate v1.9.14 scope cut).
--     Only the star toggles, via its own policy below.
-- =====================================================================

-- ============ 1. TABLE ============

create table if not exists public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,      -- [{food_id, name, grams, kj100, protein100, carbs100, fat100, fibre100, percentile_score, density_per_kj}]
  totals jsonb not null default '{}'::jsonb,     -- {base_grams, energy_kj, protein_g, carbs_g, fat_g, fibre_g, percentile_score, density_per_kj}
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ 2. INDEX ============

create index if not exists idx_cm_athlete on public.custom_meals(athlete_id);

-- ============ 3. RLS ============

alter table public.custom_meals enable row level security;

-- ============ 4. POLICIES (athlete-owned only) ============

drop policy if exists cm_select on public.custom_meals;
create policy cm_select on public.custom_meals for select
  using (athlete_id = current_athlete_id());

drop policy if exists cm_insert on public.custom_meals;
create policy cm_insert on public.custom_meals for insert
  with check (athlete_id = current_athlete_id());

drop policy if exists cm_delete on public.custom_meals;
create policy cm_delete on public.custom_meals for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

-- Star toggling only: athlete flips their own row's starred flag.
-- The API sends { id, starred } patches, so this policy can stay narrow.
drop policy if exists cm_star_update on public.custom_meals;
create policy cm_star_update on public.custom_meals for update
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());

-- No name/items/totals UPDATE policy: rows are immutable after save
-- (edit is out of scope for v1.9.14; only star/delete mutate a row).
