-- =====================================================================
-- FactorPrep v1.6.0 — CYCLE TRACKING MIGRATION (paste into Supabase SQL Editor)
-- Run ONCE, top to bottom. Safe to re-run by accident:
-- table/index use IF NOT EXISTS, policies are dropped first.
--
-- Do NOT re-run the full schema.sql / policies.sql — those are canonical
-- dumps of the live database and are not idempotent. This file contains
-- everything new, in the right order.
--
-- Opt-in menstrual cycle tracking: athletes log period start dates (and
-- optionally flag a missed/absent cycle). Coaches of teams the athlete
-- belongs to can READ phase-level context only. Raw dates stay owned by
-- the athlete — the UI never surfaces them to coaches beyond phase/day
-- offsets. See src/utils/cycleMath.js for the computation.
-- =====================================================================

-- ============ 1. TABLE ============

create table if not exists public.cycle_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  entry_kind text not null default 'period_start'
    check (entry_kind in ('period_start', 'missed_cycle')),
                                              -- 'period_start' = a period began
                                              -- on entry_date; 'missed_cycle' =
                                              -- athlete flagged a cycle as
                                              -- delayed/absent on entry_date
                                              -- (over-training signal)
  entry_date date not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ 2. INDEX ============

create index if not exists idx_cl_athlete_date
  on public.cycle_logs(athlete_id, entry_date);

-- ============ 3. RLS ============

alter table public.cycle_logs enable row level security;

-- ============ 4. POLICIES (mirror wellness_logs access shape) ============

drop policy if exists cy_delete on public.cycle_logs;
create policy cy_delete on public.cycle_logs for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists cy_insert on public.cycle_logs;
create policy cy_insert on public.cycle_logs for insert
  with check (athlete_id = current_athlete_id());

drop policy if exists cy_select on public.cycle_logs;
create policy cy_select on public.cycle_logs for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = cycle_logs.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = cycle_logs.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

drop policy if exists cy_update on public.cycle_logs;
create policy cy_update on public.cycle_logs for update
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());

