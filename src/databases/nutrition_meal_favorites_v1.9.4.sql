-- =====================================================================
-- FactorPrep v1.9.4 — MEAL FAVOURITES MIGRATION (Supabase SQL Editor)
-- Run ONCE. Idempotent like nutrition_favorites_v1.8.1.sql
-- (IF NOT EXISTS, policies dropped first).
--
-- meal_favorites: athlete-owned stars for Quick meals personalisation.
-- Rows are starred MEAL ARCHETYPES only. Starred FOODS keep living in
-- nutrition_favorites (v1.8.1) — that table already exists in production
-- and its star toggle sits in the search results — so Quick meals composes
-- meal stars from here plus food stars from there, one source of truth
-- per kind, no double writes.
-- Strictly athlete-owned: nobody can see or touch another athlete's meal
-- favourites (same access shape as nutrition_favorites, admin cleanup
-- included).
-- =====================================================================

-- ============ 1. TABLE ============

create table if not exists public.meal_favorites (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  archetype_id uuid not null references public.meal_archetypes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, archetype_id)      -- one star per meal per athlete
);

-- ============ 2. INDEX ============

create index if not exists idx_mf_athlete on public.meal_favorites(athlete_id);

-- ============ 3. RLS ============

alter table public.meal_favorites enable row level security;

-- ============ 4. POLICIES (athlete-owned only) ============

drop policy if exists mf_select on public.meal_favorites;
create policy mf_select on public.meal_favorites for select
  using (athlete_id = current_athlete_id());

drop policy if exists mf_insert on public.meal_favorites;
create policy mf_insert on public.meal_favorites for insert
  with check (athlete_id = current_athlete_id());

drop policy if exists mf_delete on public.meal_favorites;
create policy mf_delete on public.meal_favorites for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

-- No UPDATE policy: starring is insert/delete (toggle), never an edit.
