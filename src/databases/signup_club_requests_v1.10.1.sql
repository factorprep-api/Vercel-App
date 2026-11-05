-- =====================================================================
-- FactorPrep v1.10.1 — SELF-SERVE SIGNUPS + AUTOMATIC PURCHASES
-- =====================================================================
-- Idempotent migration. Safe to re-run. Run AFTER medical_staff_
-- logging_v1.10.0.sql. Fresh installs get the same objects from
-- schema.sql + functions.sql (5)/(17) + policies.sql instead of this
-- file.
--
-- PROBLEM: signing up never created the athletes row (createAthlete()
-- was a stub left over from the Google-Sheets era), and athletes_select
-- hid unanchored users from admins. A brand-new signup was therefore
-- invisible in every admin screen AND unmatchable by the Paddle webhook
-- (which links purchases to athletes via athletes.email) — so automatic
-- fulfilment silently did nothing for new users, and club anchoring
-- (primary_club_id) required hand-written SQL per user.
--
-- THIS MIGRATION:
--   1. athletes.requested_club_id — the club a user asked to join at
--      signup (Login form picker, optional). Pending signups become
--      visible to the admins of that club.
--   2. email / coach_user_id — added if missing, for fresh-install
--      parity with the live database (live queries and the webhook
--      depend on athletes.email; the old consolidated schema omitted it).
--   3. clubs becomes readable to every visitor (id + name are public
--      anyway — the shop sells club plans) so the signup form can offer
--      the club picker before login.
--   4. athletes_select widened: admins of the REQUESTED club see pending
--      signups; the shop admin sees any unanchored signup (safety net
--      for users who skipped the picker, incl. all legacy signups).
--   5. approve_club_request() RPC — one click anchors a pending signup
--      into the club (validates admin-of-target-club or shop admin).
--   6. protect_athlete_admin_fields() also lets the shop admin (via
--      is_shop_admin()) set role / primary_club_id.
--
-- THE CLIENT HALF SHIPS IN THE SAME VERSION (no SQL needed for it):
--   * createAthlete() inserts the athletes row at signup (RLS already
--     permits self-inserts) and stores requested_club_id.
--   * useAuth self-heals: any signed-in user missing their athletes row
--     gets one created on their next login — this heals EVERY signup
--     that predates this fix, with zero data migration.
--   * Login offers the club picker; Manage Shop → Teams gains the
--     "Pending club signups" list with one-click Approve.
--
-- PURCHASES NEED NO NEW SQL: the Paddle webhook already creates
-- entitlements and flips the coach role by itself
-- (supabase/functions/paddle-webhook/index.ts). It previously could not
-- match buyers whose athletes row was missing; once rows exist (with
-- email stored), the automation covers Coaching Kit -> coach role and
-- pod products -> their pods, automatically, with manual grants still
-- available in Manage Shop → Grants.
-- =====================================================================

-- ============ 1. SCHEMA ============

alter table public.athletes
  add column if not exists requested_club_id uuid
    references public.clubs(id) on delete set null;

-- Fresh-install parity: the live database carries email + coach_user_id
-- (added during the Google-Sheets migration era) but the consolidated
-- schema.sql did not. Every live query — the admin roster, coach email
-- resolution and the Paddle webhook's buyer matching — depends on both.
alter table public.athletes add column if not exists email text;
alter table public.athletes
  add column if not exists coach_user_id uuid references auth.users(id);

create index if not exists idx_athletes_requested_club
  on public.athletes(requested_club_id);

-- ============ 2. CLUBS READABLE FOR THE SIGNUP PICKER ============
-- Club names are public-facing (the shop sells club plans). The signup
-- form needs id + name before the user belongs to any club. The existing
-- clubs_select (admins) stays in force; this adds a read-everything
-- policy for anon + authenticated.

drop policy if exists clubs_signup_select on public.clubs;
create policy clubs_signup_select on public.clubs for select
  to anon, authenticated
  using (true);

-- ============ 3. PENDING SIGNUP VISIBILITY ============
-- athletes_select is replaced so admins of the requested club (and the
-- shop admin) can see unanchored signups. Matches policies.sql exactly.

drop policy if exists athletes_select on public.athletes;
create policy athletes_select on public.athletes for select
  using (
    (user_id = auth.uid())
    or primary_club_id in (select get_user_admin_club_ids())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = athletes.id
                 and (user_is_team_coach(m.team_id)
                   or exists (select 1 from teams t
                              where t.id = m.team_id
                                and t.club_id in (select get_user_admin_club_ids()))))
    -- v1.10.1: pending club requests — admins of the requested club
    or (primary_club_id is null
        and requested_club_id in (select get_user_admin_club_ids()))
    -- v1.10.1: safety net — the shop admin sees any unanchored signup
    or (primary_club_id is null and public.is_shop_admin())
  );

-- ============ 4. APPROVE RPC ============
-- One click: anchor a pending signup into their requested club (or an
-- explicitly chosen club for legacy strays who skipped the picker).
-- SECURITY DEFINER + explicit permission checks: club admin of the
-- target club, or the shop admin. Also clears requested_club_id.

create or replace function public.approve_club_request(p_athlete_id uuid, p_club_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.athletes%rowtype;
  v_club uuid;
begin
  select * into v_row from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Athlete not found.';
  end if;
  if v_row.primary_club_id is not null then
    raise exception 'Athlete already belongs to a club.';
  end if;
  -- Target club: explicit (shop admin anchoring a stray signup) or the
  -- athlete's own request.
  v_club := coalesce(p_club_id, v_row.requested_club_id);
  if v_club is null then
    raise exception 'No club was requested — pass the target club.';
  end if;
  -- Permission: club admin of the target club, or the shop admin.
  if not public.is_shop_admin()
     and v_club not in (select public.get_user_admin_club_ids()) then
    raise exception 'Only an admin of that club can approve this request.';
  end if;
  update public.athletes
    set primary_club_id = v_club,
        requested_club_id = null
    where id = p_athlete_id;
  return 'OK';
end;
$function$;

grant execute on function public.approve_club_request(uuid, uuid) to authenticated;

-- ============ 5. TRIGGER UPDATE ============
-- protect_athlete_admin_fields(): the shop admin may now also set
-- role / primary_club_id (they anchor stray signups through the RPC
-- above, which lands in this trigger).

create or replace function public.protect_athlete_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.role is distinct from old.role
     or new.primary_club_id is distinct from old.primary_club_id then
    -- v1.5.0: the paddle-webhook Edge Function runs as service_role (no
    -- user JWT, auth.uid() is NULL). It must be able to elevate an
    -- athlete to 'coach' on Coaching Kit subscribe and demote on cancel.
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    -- v1.10.1: the shop admin anchors stray signups (Manage Shop).
    if public.is_shop_admin() then
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

-- =====================================================================
-- VERIFY (paste into the Supabase SQL Editor after running):
--   select column_name from information_schema.columns
--     where table_name = 'athletes'
--       and column_name in ('requested_club_id', 'email', 'coach_user_id');
--   select policyname from pg_policies where tablename = 'athletes';
--   select proname from pg_proc
--     where proname in ('approve_club_request', 'protect_athlete_admin_fields');
-- NOTE: users who signed up BEFORE this fix have no athletes row. They
-- heal automatically at their next sign-in (client-side self-heal in
-- useAuth). No data migration is needed for them.
-- =====================================================================