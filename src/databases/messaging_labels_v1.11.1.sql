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
--
-- ORDER MATTERS: the RLS policy msg_thread_select_athlete depends on
-- athlete_visible_staff(), so the policy is dropped first, the function
-- replaced, and the policy recreated at the end (the signature changes —
-- adds staff_role — so Postgres requires a drop before replace).
drop policy if exists msg_thread_select_athlete on public.message_threads;
drop function if exists public.athlete_visible_staff();

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

-- Recreate the athlete-side threads read policy (it was dropped above
-- because it references athlete_visible_staff()).
create policy msg_thread_select_athlete on public.message_threads for select
  using (
    athlete_id = (select public.current_athlete_id())
    and exists (select 1 from public.athlete_visible_staff() vs
                where vs.staff_id = message_threads.staff_id)
  );
