-- =====================================================================
-- Messaging admins v1.11.2 — include club admins in messaging
-- =====================================================================
-- v1.11.0 scoped messaging to the athlete's coach_user_id + active team
-- coaches (the pod org predicate). Club admins (club_memberships
-- role='admin') were deliberately excluded; this migration adds them using
-- the SAME club-wide visibility admins already have on every pod
-- (athletes.primary_club_id in the admin's clubs). Admins can now message
-- one/many/all club athletes, see club-scoped threads, and athletes can
-- message or reply to their club admins. Labels stay role-derived
-- ('Coach'/'Therapist') — admins are coach-promotions, so no new label.
-- Updates the two scoping functions from v1.11.0/v1.11.1. Idempotent.
-- Run in the Supabase SQL editor.
-- =====================================================================

-- staff_can_see_athlete(): coach_user_id OR active team coach OR club admin
-- of the athlete's primary club.
create or replace function public.staff_can_see_athlete(p_staff uuid, p_athlete_id uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (
        a.coach_user_id = p_staff
        or exists (
          select 1
          from public.athlete_team_memberships atm
          join public.team_memberships tm on tm.team_id = atm.team_id
          where atm.athlete_id = a.id
            and atm.is_active
            and tm.user_id = p_staff
            and tm.left_at is null
        )
        or exists (
          select 1
          from public.club_memberships cm
          where cm.user_id = p_staff
            and cm.role = 'admin'
            and cm.club_id = a.primary_club_id
        )
      )
  );
$function$;

-- athlete_visible_staff(): adds the admins of the athlete's primary club
-- as messageable staff (name + role label for the picker/thread headers).
create or replace function public.athlete_visible_staff()
returns table (staff_id uuid, staff_name text, staff_role text)
language sql stable security definer
set search_path to ''
as $function$
  select a.coach_user_id, s.name, s.role
  from public.athletes a
  join public.athletes s on s.user_id = a.coach_user_id
  where a.user_id = (select auth.uid())
    and a.coach_user_id is not null
    and a.coach_user_id <> (select auth.uid())
  union
  select tm.user_id, s2.name, s2.role
  from public.athletes a
  join public.athlete_team_memberships atm on atm.athlete_id = a.id and atm.is_active
  join public.team_memberships tm on tm.team_id = atm.team_id
  join public.athletes s2 on s2.user_id = tm.user_id
  where a.user_id = (select auth.uid())
    and tm.user_id <> (select auth.uid())
  union
  select cm.user_id, s3.name, s3.role
  from public.athletes a
  join public.club_memberships cm on cm.club_id = a.primary_club_id and cm.role = 'admin'
  join public.athletes s3 on s3.user_id = cm.user_id
  where a.user_id = (select auth.uid())
    and a.primary_club_id is not null
    and cm.user_id <> (select auth.uid())
$function$;
