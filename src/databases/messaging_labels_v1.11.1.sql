-- =====================================================================
-- Messaging labels v1.11.1 — show a staff member's role to athletes
-- =====================================================================
-- The athlete-facing staff picker and thread headers gain a role suffix
-- derived from the existing athletes.role ('coach' | 'therapist') — no new
-- data, nothing for anyone to configure. All therapist specialties
-- (physio, osteo, psychologist, acupuncturist, …) label as "Therapist".
-- Replaces the athlete_visible_staff() function from
-- messaging_v1.11.0.sql with one that also returns staff_role.
-- Run in the Supabase SQL editor.
-- =====================================================================

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
$function$;
