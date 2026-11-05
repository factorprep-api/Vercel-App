-- =====================================================================
-- FactorPrep v1.10.0 — MEDICAL STAFF LOGGING + AUDIT TRAIL
-- =====================================================================
-- Idempotent migration. Safe to re-run. For EXISTING databases run
-- after treatment_pod_v1.7.0.sql (the gatekeepers read the treatment
-- tables). Fresh installs get the same objects from schema.sql +
-- functions.sql (15)/(16) + policies.sql instead of this file.
--
-- UNTIL NOW medical_entries were athlete-entered ONLY (ml_insert /
-- ml_update required athlete_id = current_athlete_id()). This migration
-- opens staff logging while keeping a strict split of powers:
--
--   Athlete                   — log new injuries + update their own
--                               (Medical Vault, unchanged)
--   Team coach / team manager — log new injuries + update (Clinical File
--                               in the coach view)
--   Club admin                — log new injuries + update + delete
--   Club therapist (physio)   — CANNOT log new injuries. Can VIEW and
--                               UPDATE (training status, clinical notes,
--                               mark resolved) only for athletes they
--                               have actually treated (a
--                               treatment_bookings row links them).
--
-- AUDIT TRAIL (two layers):
--   1. medical_entries.logged_by — WHO originally logged the entry.
--      Stored as an athletes.id FK (trigger-set from auth.uid(), never
--      trusted from the client) and resolved to a name at read time via
--      a PostgREST embed.
--   2. audit_logs                — every UPDATE to medical_entries is
--      captured (full old/new row images + changed_by auth uid) by the
--      same append-only audit trigger that already covers session_logs
--      and schedule_sessions. The audit_logs table_name check constraint
--      is widened to admit 'medical_entries'.
--
-- Single gatekeeper functions keep later tightening trivial: if a club
-- decides only the head physio may log injuries, edit
-- viewer_can_log_medical() — every RLS policy follows it.
-- =====================================================================

-- ============ 1. logged_by column (who logged the entry) ============

alter table public.medical_entries
  add column if not exists logged_by uuid references public.athletes(id)
    on delete set null;

-- Set automatically from the caller — the client NEVER supplies it.
create or replace function public.set_medical_logged_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.logged_by is null then
    select a.id into new.logged_by
      from public.athletes a
      where a.user_id = (select auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_medical_logged_by on public.medical_entries;
create trigger trg_medical_logged_by
  before insert on public.medical_entries
  for each row execute function public.set_medical_logged_by();

-- logged_by is part of the record fingerprint: never re-attributed.
create or replace function public.protect_medical_logged_by()
returns trigger
language plpgsql
as $$
begin
  if new.logged_by is distinct from old.logged_by then
    raise exception 'medical_entries.logged_by is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_medical_logged_by_guard on public.medical_entries;
create trigger trg_medical_logged_by_guard
  before update on public.medical_entries
  for each row execute function public.protect_medical_logged_by();

create index if not exists idx_me_logged_by
  on public.medical_entries(logged_by);

-- ============ 2. GATEKEEPER FUNCTIONS ============
-- SECURITY DEFINER + stable so RLS policies can call them without
-- recursive RLS checks. Both resolve the CALLER's role for one target
-- athlete, mirroring the access shapes already used across policies.sql
-- (team coach = team_memberships; admin = club anchored to the athlete's
-- primary club or a team they sit on; therapist = club_therapists +
-- treated bookings from treatment_pod_v1.7.0.sql).

-- Full staff access: read + update (self, coach, admin, treating therapist).
create or replace function public.viewer_is_medical_staff(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (
    p_athlete_id = public.current_athlete_id()
    or exists (
      select 1 from public.athlete_team_memberships m
      join public.team_memberships tm on tm.team_id = m.team_id
      where m.athlete_id = p_athlete_id
        and m.is_active
        and tm.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.athletes a
      where a.id = p_athlete_id
        and (
          a.primary_club_id in (select public.get_user_admin_club_ids())
          or exists (
            select 1 from public.athlete_team_memberships am
            join public.teams t on t.id = am.team_id
            where am.athlete_id = p_athlete_id
              and am.is_active
              and t.club_id in (select public.get_user_admin_club_ids())
          )
        )
    )
    -- treating therapist: active club therapist, same club as the
    -- athlete, with at least one treatment booking with them.
    or exists (
      select 1 from public.club_therapists ct
      join public.athletes tp on tp.id = ct.athlete_id
      join public.athletes ap on ap.id = p_athlete_id
      where ct.athlete_id = public.current_athlete_id()
        and ct.is_active
        and ap.primary_club_id = tp.primary_club_id
        and exists (
          select 1 from public.treatment_bookings tb
          where tb.athlete_id = p_athlete_id
            and exists (
              select 1 from public.therapist_slots ts
              where ts.id = tb.slot_id
                and ts.therapist_id = ct.id
            )
        )
    )
  )
$function$;

-- Injury LOGGING rights: athlete themself, team coach, or club admin.
-- Deliberately EXCLUDES the treating therapist (physios add treatment
-- detail + status to existing injuries, they do not open new ones).
create or replace function public.viewer_can_log_medical(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (
    p_athlete_id = public.current_athlete_id()
    or exists (
      select 1 from public.athlete_team_memberships m
      join public.team_memberships tm on tm.team_id = m.team_id
      where m.athlete_id = p_athlete_id
        and m.is_active
        and tm.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.athletes a
      where a.id = p_athlete_id
        and (
          a.primary_club_id in (select public.get_user_admin_club_ids())
          or exists (
            select 1 from public.athlete_team_memberships am
            join public.teams t on t.id = am.team_id
            where am.athlete_id = p_athlete_id
              and am.is_active
              and t.club_id in (select public.get_user_admin_club_ids())
          )
        )
    )
  )
$function$;

-- ============ 3. AUDIT TRAIL ============
-- The append-only audit_logs table gains 'medical_entries': every UPDATE
-- to a medical entry is captured by the same write_audit_row() trigger
-- that already covers session_logs and schedule_sessions.

-- Widen the table_name check (Postgres default constraint name).
alter table public.audit_logs drop constraint if exists audit_logs_table_name_check;
alter table public.audit_logs add constraint audit_logs_table_name_check
  check (table_name in ('session_logs', 'schedule_sessions', 'medical_entries'));

-- Audit clinical updates (coach / physio / athlete status changes).
drop trigger if exists trg_audit_medical_entries on public.medical_entries;
create trigger trg_audit_medical_entries
  after update on public.medical_entries
  for each row execute function public.write_audit_row();

-- ============ 4. RLS POLICIES ============
-- Drop/re-create so re-runs are safe. Matches policies.sql exactly.

-- Athlete may delete their own entry; club admins may delete any
-- (mirrors policies.sql ml_delete).
drop policy if exists ml_delete on public.medical_entries;
create policy ml_delete on public.medical_entries for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

-- Logging: athlete themself, team coach, or club admin — deliberately
-- NOT the treating therapist (they add detail to existing injuries).
drop policy if exists ml_insert on public.medical_entries;
create policy ml_insert on public.medical_entries for insert
  with check (viewer_can_log_medical(medical_entries.athlete_id));

-- Read + update: the full staff set (adds treating therapists).
drop policy if exists ml_select on public.medical_entries;
create policy ml_select on public.medical_entries for select
  using (viewer_is_medical_staff(medical_entries.athlete_id));

drop policy if exists ml_update on public.medical_entries;
create policy ml_update on public.medical_entries for update
  using (viewer_is_medical_staff(medical_entries.athlete_id))
  with check (viewer_is_medical_staff(medical_entries.athlete_id));

-- Audit visibility: the athlete and the medical staff who can already
-- see the entry itself (mirrors policies.sql al_select).
drop policy if exists al_select on public.audit_logs;
create policy al_select on public.audit_logs for select
  using (
    (table_name = 'session_logs'
      and exists (select 1 from session_logs sl
                  where sl.id = audit_logs.record_id
                    and (sl.athlete_id = current_athlete_id()
                      or exists (select 1 from athlete_team_memberships m
                                 where m.athlete_id = sl.athlete_id
                                   and m.is_active and user_is_team_coach(m.team_id))
                      or exists (select 1 from teams t
                                 join club_memberships cm on cm.club_id = t.club_id and cm.role = 'admin'
                                 where t.id = sl.team_id
                                   and cm.user_id = auth.uid()))))
    or (table_name = 'schedule_sessions'
      and exists (select 1 from schedule_sessions ss
                  where ss.id = audit_logs.record_id
                    and (user_is_team_coach(ss.team_id)
                      or exists (select 1 from teams t
                                 join club_memberships cm on cm.club_id = t.club_id and cm.role = 'admin'
                                 where t.id = ss.team_id
                                   and cm.user_id = auth.uid()))))
    or (table_name = 'medical_entries'
      and exists (select 1 from medical_entries me
                  where me.id = audit_logs.record_id
                    and viewer_is_medical_staff(me.athlete_id)))
  );
