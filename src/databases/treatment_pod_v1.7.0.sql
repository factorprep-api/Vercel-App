-- =====================================================================
-- FactorPrep v1.7.0 — TREATMENT POD MIGRATION (paste into Supabase SQL Editor)
-- Run ONCE, top to bottom. Idempotent in the same spirit as
-- cycle_tracking_v1.6.0.sql: tables/indexes use IF NOT EXISTS, policies
-- and functions are dropped/re-created, the role check is replaced.
--
-- The Treatment Pod lets club athletes book physiotherapy / massage
-- appointments inside their club:
--
--   * Therapists are members with a NEW role value: 'therapist'. They
--     sign up like anyone else (athletes row), then a CLUB ADMIN does
--     the initial setup (Manage Therapists tab in the Treatment Room)
--     and the therapist manages their own availability from then on.
--   * club_therapists    — therapist profile (specialty, default duration)
--   * therapist_slots    — published availability; the therapist sets the
--                          TIME DURATION of each treatment session here
--   * treatment_bookings — athlete bookings; one booking per slot
--                          (unique), optionally linked to an injury row
--                          in medical_entries via injury_id.
--
-- Pod access: the frontend unions athlete_team_memberships.active_pods
-- with viewer_entitled_pods() (purchase). If the word 'treatment' is in
-- that pods area, the athlete gets the Treatment Room. No schema change
-- is needed for gating — active_pods / grants_pods are free-form text[].
-- =====================================================================

-- ============ 1. ROLE: add 'therapist' to athletes.role ============
-- The check constraint name is the Postgres default (athletes_role_check).
-- If your live DB named it differently, adjust the DROP below.

alter table public.athletes drop constraint if exists athletes_role_check;
alter table public.athletes add constraint athletes_role_check
  check (role in ('athlete', 'coach', 'therapist'));

-- Role changes remain admin-controlled via protect_athlete_admin_fields()
-- (functions.sql) — a club admin promotes the signed-up therapist:
--
--   update public.athletes set role = 'therapist' where email = 'therapist@club.com';
--
-- or from the Treatment Room "Manage Therapists" tab as a club admin.

-- ============ 2. TABLES ============

-- Therapist profile — one row per therapist athlete.
create table if not exists public.club_therapists (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes(id) on delete cascade,
  specialty text not null default 'Physiotherapist'
    check (specialty in ('Physiotherapist', 'Massage Therapist', 'Sports Therapist', 'Other')),
  default_duration_mins int not null default 45 check (default_duration_mins > 0),
  bio text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Published availability. The therapist chooses date, start time AND the
-- duration of the treatment session for each slot. One booking per slot.
create table if not exists public.therapist_slots (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.club_therapists(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  date date not null,
  start_time time not null,
  duration_mins int not null check (duration_mins > 0),
  status text not null default 'open' check (status in ('open', 'booked', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (therapist_id, date, start_time)      -- no duplicate slot times
);

-- Athlete bookings. slot_id is UNIQUE so a slot can never be double-booked.
-- injury_id links the booking to an injury in medical_entries (optional);
-- the link survives the injury being resolved/deleted (on delete set null).
create table if not exists public.treatment_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.therapist_slots(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  treatment_type text not null default 'Physiotherapy'
    check (treatment_type in ('Physiotherapy', 'Massage', 'Recovery', 'Assessment', 'Other')),
  injury_id uuid references public.medical_entries(id) on delete set null,
  notes text not null default '',
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ============ 3. INDEXES ============

create index if not exists idx_ct_athlete    on public.club_therapists(athlete_id);
create index if not exists idx_ts_therapist  on public.therapist_slots(therapist_id, date);
create index if not exists idx_ts_club_date  on public.therapist_slots(club_id, date, status);
create index if not exists idx_tb_athlete    on public.treatment_bookings(athlete_id, status);
create index if not exists idx_tb_club       on public.treatment_bookings(club_id, created_at);

-- ============ 4. HELPER FUNCTIONS ============

-- (T1) viewer_club_ids() — every club the signed-in user belongs to in any
-- capacity: club admin, coach (team_memberships), athlete (primary club).
create or replace function public.viewer_club_ids()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $function$
  select club_id from public.club_memberships where user_id = (select auth.uid())
  union
  select t.club_id from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = (select auth.uid())
  union
  select a.primary_club_id from public.athletes a
    where a.user_id = (select auth.uid()) and a.primary_club_id is not null
$function$;

-- (T2) viewer_is_therapist() — signed-in user has an active therapist profile.
create or replace function public.viewer_is_therapist()
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.club_therapists ct
    join public.athletes a on a.id = ct.athlete_id
    where a.user_id = (select auth.uid()) and ct.is_active
  )
$function$;

-- ============ 5. BOOKING RPCS (atomic, security definer) ============

-- (T3) book_treatment_slot — atomically flips an open slot to 'booked'
-- and inserts the booking. Returns the new booking id. Raises if the
-- slot is gone, in the past, outside the athlete's club, or already taken.
create or replace function public.book_treatment_slot(
  p_slot_id uuid,
  p_treatment_type text default 'Physiotherapy',
  p_injury_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slot therapist_slots%rowtype;
  v_athlete uuid;
  v_booking uuid;
begin
  select a.id into v_athlete from athletes a where a.user_id = (select auth.uid());
  if v_athlete is null then
    raise exception 'Not signed in as an athlete.';
  end if;

  select * into v_slot from therapist_slots
    where id = p_slot_id and status = 'open' and date >= current_date
    for update;
  if not found then
    raise exception 'That time is no longer available.';
  end if;

  -- Athlete must belong to the therapist's club (primary club or team).
  if not exists (
    select 1 from athletes a
    where a.id = v_athlete and a.primary_club_id = v_slot.club_id
  ) and not exists (
    select 1 from athlete_team_memberships m
    join teams t on t.id = m.team_id
    where m.athlete_id = v_athlete and m.is_active and t.club_id = v_slot.club_id
  ) then
    raise exception 'You can only book therapists at your own club.';
  end if;

  update therapist_slots set status = 'booked' where id = p_slot_id;

  insert into treatment_bookings (slot_id, athlete_id, club_id, treatment_type, injury_id, notes)
  values (p_slot_id, v_athlete, v_slot.club_id, coalesce(p_treatment_type, 'Physiotherapy'), p_injury_id, coalesce(p_notes, ''))
  returning id into v_booking;

  return v_booking;
end;
$function$;

-- (T4) cancel_treatment_booking — athlete cancels an upcoming booking;
-- the slot is re-opened for someone else.
create or replace function public.cancel_treatment_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slot uuid;
begin
  select b.slot_id into v_slot
  from treatment_bookings b
  where b.id = p_booking_id
    and b.athlete_id = (select current_athlete_id())
    and b.status = 'booked';
  if not found then
    raise exception 'Booking not found or already cancelled.';
  end if;

  update treatment_bookings set status = 'cancelled' where id = p_booking_id;
  update therapist_slots set status = 'open' where id = v_slot;
end;
$function$;

-- (T5) complete_treatment_booking — the therapist marks their session done.
create or replace function public.complete_treatment_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update treatment_bookings b
  set status = 'completed'
  where b.id = p_booking_id
    and b.status = 'booked'
    and exists (
      select 1 from therapist_slots ts
      join club_therapists ct on ct.id = ts.therapist_id
      where ts.id = b.slot_id and ct.athlete_id = (select current_athlete_id())
    );
  if not found then
    raise exception 'Booking not found or not yours to complete.';
  end if;
end;
$function$;

grant execute on function public.book_treatment_slot(uuid, text, uuid, text) to authenticated;
grant execute on function public.cancel_treatment_booking(uuid)              to authenticated;
grant execute on function public.complete_treatment_booking(uuid)            to authenticated;

-- ============ 6. RLS ============

alter table public.club_therapists    enable row level security;
alter table public.therapist_slots    enable row level security;
alter table public.treatment_bookings enable row level security;

-- ---------- club_therapists ----------

drop policy if exists ct_select on public.club_therapists;
create policy ct_select on public.club_therapists for select
  using (
    (athlete_id = current_athlete_id())
    or exists (
      select 1 from athletes a
      where a.id = club_therapists.athlete_id
        and a.primary_club_id in (select viewer_club_ids())
    )
  );

drop policy if exists ct_write on public.club_therapists;
create policy ct_write on public.club_therapists for all
  using (
    (athlete_id = current_athlete_id())
    or exists (
      select 1 from athletes a
      where a.id = club_therapists.athlete_id
        and a.primary_club_id in (select get_user_admin_club_ids())
    )
  )
  with check (
    (athlete_id = current_athlete_id())
    or exists (
      select 1 from athletes a
      where a.id = club_therapists.athlete_id
        and a.primary_club_id in (select get_user_admin_club_ids())
    )
  );

-- ---------- therapist_slots ----------

drop policy if exists ts_select on public.therapist_slots;
create policy ts_select on public.therapist_slots for select
  using (
    (club_id in (select viewer_club_ids()))
    or exists (
      select 1 from club_therapists ct
      where ct.id = therapist_slots.therapist_id
        and ct.athlete_id = current_athlete_id()
    )
  );

drop policy if exists ts_write on public.therapist_slots;
create policy ts_write on public.therapist_slots for all
  using (
    (club_id in (select get_user_admin_club_ids()))
    or exists (
      select 1 from club_therapists ct
      where ct.id = therapist_slots.therapist_id
        and ct.athlete_id = current_athlete_id()
    )
  )
  with check (
    (club_id in (select get_user_admin_club_ids()))
    or exists (
      select 1 from club_therapists ct
      where ct.id = therapist_slots.therapist_id
        and ct.athlete_id = current_athlete_id()
    )
  );

-- ---------- treatment_bookings ----------

drop policy if exists tb_select on public.treatment_bookings;
create policy tb_select on public.treatment_bookings for select
  using (
    (athlete_id = current_athlete_id())
    or (club_id in (select viewer_club_ids()))
    or exists (
      select 1 from athlete_team_memberships m
      where m.athlete_id = treatment_bookings.athlete_id
        and m.is_active and user_is_team_coach(m.team_id)
    )
  );

drop policy if exists tb_insert on public.treatment_bookings;
create policy tb_insert on public.treatment_bookings for insert
  with check (
    (athlete_id = current_athlete_id())
    and exists (
      select 1 from therapist_slots ts
      where ts.id = treatment_bookings.slot_id and ts.status = 'open'
    )
  );

drop policy if exists tb_update on public.treatment_bookings;
create policy tb_update on public.treatment_bookings for update
  using (
    (athlete_id = current_athlete_id())
    or exists (
      select 1 from therapist_slots ts
      join club_therapists ct on ct.id = ts.therapist_id
      where ts.id = treatment_bookings.slot_id
        and ct.athlete_id = current_athlete_id()
    )
    or (club_id in (select get_user_admin_club_ids()))
  )
  with check (true);

drop policy if exists tb_delete on public.treatment_bookings;
create policy tb_delete on public.treatment_bookings for delete
  using (club_id in (select get_user_admin_club_ids()));

-- =====================================================================
-- AFTER RUNNING THIS FILE:
--   1. A club admin opens the Treatment Room (Manage Therapists tab) and
--      adds therapists by email (the athlete must have signed up first).
--      That creates the club_therapists row and, when the admin has the
--      rights, promotes the athlete's role to 'therapist'.
--   2. Therapists sign in → they land on the Treatment Room → My
--      Availability tab → publish slots with their session durations.
--   3. Athletes with the 'treatment' pod see the Treatment Room card on
--      the Athlete Hub and book from published slots.
-- =====================================================================