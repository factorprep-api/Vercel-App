-- =====================================================================
-- Security fixes v1.11.3
-- =====================================================================
-- 1. athlete_profiles: this view joined athletes + auth.users (exposing
--    email) and was granted SELECT to anon. Views run with owner
--    privileges, so it BYPASSED the athletes RLS — anyone without an
--    account could scrape every athlete's email. The app does not use
--    the view; recreate it with security_invoker (runs with the CALLER's
--    privileges, so RLS applies) and grant to authenticated only.
--    Fail-closed: anon gets nothing.
-- 2. treatment_bookings tb_update: the USING clause limited which rows
--    could be updated, but WITH CHECK (true) let a participant rewrite
--    row contents (athlete_id / slot_id / club_id) after matching.
--    WITH CHECK now mirrors USING so participants can only keep the
--    booking anchored to themselves.
-- Idempotent. Run in the Supabase SQL editor.
-- =====================================================================

-- ---------- 1. athlete_profiles ----------

revoke select on public.athlete_profiles from anon;
drop view if exists public.athlete_profiles;

create view public.athlete_profiles
with (security_invoker = true) as
select
  a.id,
  a.name,
  a.role,
  a.primary_club_id,
  u.email
from public.athletes a
join auth.users u on a.user_id = u.id;

revoke select on public.athlete_profiles from anon;
grant select on public.athlete_profiles to authenticated;

-- ---------- 2. treatment_bookings tb_update ----------

drop policy if exists tb_update on public.treatment_bookings;
create policy tb_update on public.treatment_bookings for update
  using (
    (athlete_id = current_athlete_id())
    or exists (
      select 1 from public.therapist_slots ts
      join public.club_therapists ct on ct.id = ts.therapist_id
      where ts.id = treatment_bookings.slot_id
        and ct.athlete_id = public.current_athlete_id()
    )
    or (club_id in (select public.get_user_admin_club_ids()))
  )
  with check (
    (athlete_id = public.current_athlete_id())
    or exists (
      select 1 from public.therapist_slots ts
      join public.club_therapists ct on ct.id = ts.therapist_id
      where ts.id = treatment_bookings.slot_id
        and ct.athlete_id = public.current_athlete_id()
    )
    or (club_id in (select public.get_user_admin_club_ids()))
  );
