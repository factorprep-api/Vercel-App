-- =====================================================================
-- FactorPrep v1.9.5 — BODY DATA MIGRATION (Supabase SQL Editor)
-- Run ONCE, top to bottom. Safe to re-run by accident: columns and
-- table use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, policies dropped first.
--
-- Body data powers the athlete-facing energy balance (BMR + training load)
-- planned for the nutrition page:
--
--   athletes.sex / birth_year / height_cm  — profile, athlete-settable.
--     sex is male/female ONLY (product decision: no third option; if it
--     isn't set, the energy gauge does not render — no midpoint estimates).
--     Nullable in the DB because existing athletes have no value and we
--     do not backfill a guess; the app enforces completion on first
--     body-weight entry. The existing admin-field protection trigger only
--     guards role/primary_club_id, so these pass through untouched.
--
--   body_measurements — dated body weights, athlete-owned. Coaches of
--     teams the athlete is a member of can READ weights (product owner:
--     "coaches see the athletes' weights, athletes expect it"); admins of
--     the athlete's club can read/delete. Same access shape as
--     cycle_logs/wellness_logs. History is preserved: each entry is a
--     dated row, newest wins for display.
-- =====================================================================

-- ============ 1. ATHLETE PROFILE COLUMNS ============

alter table public.athletes add column if not exists sex text
  check (sex in ('male', 'female'));
alter table public.athletes add column if not exists birth_year int
  check (birth_year is null or birth_year between 1930 and 2100);
alter table public.athletes add column if not exists height_cm numeric
  check (height_cm is null or height_cm between 50 and 260);

-- ============ 2. TABLE ============

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  entry_date date not null,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ 3. INDEX ============

create index if not exists idx_bm_athlete_date
  on public.body_measurements(athlete_id, entry_date);

-- ============ 4. RLS ============

alter table public.body_measurements enable row level security;

-- ============ 5. POLICIES (mirror cycle_logs / wellness_logs shape) ============

drop policy if exists bm_delete on public.body_measurements;
create policy bm_delete on public.body_measurements for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists bm_insert on public.body_measurements;
create policy bm_insert on public.body_measurements for insert
  with check (athlete_id = current_athlete_id());

drop policy if exists bm_select on public.body_measurements;
create policy bm_select on public.body_measurements for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = body_measurements.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = body_measurements.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

drop policy if exists bm_update on public.body_measurements;
create policy bm_update on public.body_measurements for update
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());
