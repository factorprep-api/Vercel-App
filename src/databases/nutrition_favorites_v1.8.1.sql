-- =====================================================================
-- FactorPrep v1.8.1 — NUTRITION FAVOURITES MIGRATION (Supabase SQL Editor)
-- Run ONCE. Idempotent like nutrition_pod_v1.8.0.sql (IF NOT EXISTS,
-- policies dropped first).
--
-- Lets athletes star foods they eat all the time for one-tap access in the
-- nutrition logger. Strictly athlete-owned: nobody can see or touch another
-- athlete's favourites (same access shape as nutrition_logs, minus the
-- coach-read branch — favourites are personal, not training data).
-- =====================================================================

-- ============ 1. TABLE ============

create table if not exists public.nutrition_favorites (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, food_id)          -- one star per food per athlete
);

-- ============ 2. INDEX ============

create index if not exists idx_nf_athlete on public.nutrition_favorites(athlete_id);

-- ============ 3. RLS ============

alter table public.nutrition_favorites enable row level security;

-- ============ 4. POLICIES (athlete-owned only) ============

drop policy if exists nf_select on public.nutrition_favorites;
create policy nf_select on public.nutrition_favorites for select
  using (athlete_id = current_athlete_id());

drop policy if exists nf_insert on public.nutrition_favorites;
create policy nf_insert on public.nutrition_favorites for insert
  with check (athlete_id = current_athlete_id());

drop policy if exists nf_delete on public.nutrition_favorites;
create policy nf_delete on public.nutrition_favorites for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

-- No UPDATE policy: starring is insert/delete (toggle), never an edit.
