-- =====================================================================
-- Helper Functions — Exercise/Team Management App
-- Version: v1.10.0 (medical staff gatekeepers (15)/(16) added —
-- medical_staff_logging_v1.10.0.sql mirrors them for existing DBs)
-- Source: pg_proc dump from production
-- =====================================================================

-- (1) current_athlete_id()
create or replace function public.current_athlete_id()
returns uuid
language sql
stable security definer
set search_path to ''
as $function$
  select id from public.athletes where user_id = (select auth.uid())
$function$;

-- (2) get_user_admin_club_ids()
create or replace function public.get_user_admin_club_ids()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $function$
  select club_id from public.club_memberships
  where user_id = (select auth.uid()) and role = 'admin'
$function$;

-- (3) get_user_team_ids()
create or replace function public.get_user_team_ids()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $function$
  select team_id from public.team_memberships where user_id = (select auth.uid())
$function$;

-- (4) prevent_athlete_user_id_change()
create or replace function public.prevent_athlete_user_id_change()
returns trigger
language plpgsql
as $function$
begin
  if new.user_id <> old.user_id then
    raise exception 'athletes.user_id is immutable.';
  end if;
  return new;
end;
$function$;

-- (5) protect_athlete_admin_fields()
create or replace function public.protect_athlete_admin_fields()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.role is distinct from old.role
     or new.primary_club_id is distinct from old.primary_club_id then
    -- v1.5.0: the paddle-webhook Edge Function runs as service_role (no
    -- user JWT, auth.uid() is NULL). It must be able to elevate an athlete
    -- to 'coach' on Coaching Kit subscribe and demote on cancel.
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    if not exists (
      select 1 from public.club_memberships
      where user_id = (select auth.uid()) and role = 'admin'
    ) then
      raise exception 'role and primary_club_id are admin-controlled fields.';
    end if;
  end if;
  return new;
end;
$function$;

-- (6) protect_record_fingerprint()
create or replace function public.protect_record_fingerprint()
returns trigger
language plpgsql
as $function$
begin
  if new.athlete_id is distinct from old.athlete_id then
    raise exception '%.athlete_id is immutable.', tg_table_name;
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception '%.created_at is immutable.', tg_table_name;
  end if;
  return new;
end;
$function$;

-- (7) protect_session_log_retagging()
create or replace function public.protect_session_log_retagging()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.team_id is distinct from old.team_id then
    if new.team_id is null then
      return new;
    end if;
    if exists (select 1 from public.team_memberships
               where user_id = (select auth.uid()) and team_id = new.team_id)
       or exists (select 1 from public.teams t
                  join public.club_memberships cm
                    on cm.club_id = t.club_id and cm.role = 'admin'
                  where t.id = new.team_id
                    and cm.user_id = (select auth.uid()))
    then
      return new;
    end if;
    raise exception 'session_logs.team_id can only be changed by a coach or admin.';
  end if;
  return new;
end;
$function$;

-- (8) user_is_team_coach()
create or replace function public.user_is_team_coach(p_team_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (select 1 from public.team_memberships
                 where user_id = (select auth.uid()) and team_id = p_team_id)
$function$;

-- (9) viewer_has_active_assignment()
create or replace function public.viewer_has_active_assignment(p_program_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from assignments a
    join athletes ath on ath.id = a.athlete_id
    where a.program_id = p_program_id
      and ath.user_id = auth.uid()
      and a.status = 'active'
      and (a.expires_at is null or a.expires_at > now())
  );
$function$;

-- (10) write_audit_row()
create or replace function public.write_audit_row()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.audit_logs (table_name, record_id, changed_by, old_data, new_data)
  values (tg_table_name, new.id, (select auth.uid()), to_jsonb(old), to_jsonb(new));
  return new;
end;
$function$;

-- (11) archive_session_assignment()
-- Fires on session_logs insert (Branch 1: athlete completes a proposed
-- session — via the attached program's popup or the normal audit popup).
-- Archives the transient assignment created when a coach attached a
-- program to that proposal, so it drops off the athlete's "My Programs".
create or replace function public.archive_session_assignment()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.session_id is not null then
    update public.assignments
      set status = 'archived'
      where source_session_id = new.session_id
        and status = 'active';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_archive_session_assignment on public.session_logs;
create trigger trg_archive_session_assignment
  after insert on public.session_logs
  for each row execute function public.archive_session_assignment();

-- =====================================================================
-- SHOP HELPERS (v1.5.0) — Paddle entitlement checks
-- =====================================================================

-- (12) viewer_has_entitlement(p_product_id uuid)
-- TRUE when the logged-in athlete holds an active or lifetime entitlement
-- for the given shop product. SECURITY DEFINER so it can be called from
-- other policies without RLS on user_entitlements blocking the check.
create or replace function public.viewer_has_entitlement(p_product_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from user_entitlements e
    join athletes a on a.id = e.athlete_id
    where a.user_id = auth.uid()
      and e.product_id = p_product_id
      and e.status in ('active', 'lifetime')
  );
$function$;

-- (13) viewer_has_program_entitlement(p_program_id uuid)
-- TRUE when the logged-in athlete bought (or holds an active subscription
-- covering) a shop product linked to the given program. Used by the
-- prg_select / pe_select policies to unlock purchased rehab plans.
create or replace function public.viewer_has_program_entitlement(p_program_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from user_entitlements e
    join athletes a on a.id = e.athlete_id
    join shop_products sp on sp.id = e.product_id
    where a.user_id = auth.uid()
      and sp.linked_program_id = p_program_id
      and e.status in ('active', 'lifetime')
  );
$function$;

-- (14) viewer_entitled_pods()
-- Pod names ('wellness', 'medical', 'schedule') unlocked purely by
-- purchase (active subscription or lifetime one-time). The frontend
-- unions this with the admin-granted athlete_team_memberships.active_pods.
create or replace function public.viewer_entitled_pods()
returns setof text
language sql
stable security definer
set search_path to 'public'
as $function$
  select unnest(sp.grants_pods)
  from user_entitlements e
  join athletes a on a.id = e.athlete_id
  join shop_products sp on sp.id = e.product_id
  where a.user_id = auth.uid()
    and sp.grants_pods is not null
    and e.status in ('active', 'lifetime')
$function$;
-- =====================================================================
-- MEDICAL STAFF GATEKEEPERS (v1.10.0)
-- Referenced by policies.sql (ml_select / ml_update / ml_insert /
-- al_select). SECURITY DEFINER + stable so RLS policies can call them
-- without recursive RLS checks. Both resolve the CALLER's role for one
-- target athlete: team coach = team_memberships; admin = club anchored
-- to the athlete's primary club or a team they sit on; therapist =
-- club_therapists + treated bookings from treatment_pod_v1.7.0.sql.
-- (Mirrored in medical_staff_logging_v1.10.0.sql for existing DBs.)
-- =====================================================================

-- (15) viewer_is_medical_staff(p_athlete_id uuid)
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

-- (16) viewer_can_log_medical(p_athlete_id uuid)
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
