-- =====================================================================
-- Helper Functions — Exercise/Team Management App
-- Version: v1.4.6 (verified 2026-09-20 against live Supabase deployment)
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