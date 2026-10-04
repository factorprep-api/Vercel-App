-- =====================================================================
-- FactorPrep v1.5.0 — SHOP MIGRATION (paste into Supabase SQL Editor)
-- Run ONCE, top to bottom, in a single query. Safe to re-run by accident:
-- tables/indexes use IF NOT EXISTS, functions are CREATE OR REPLACE,
-- policies are dropped first, seeding is upsert-by-slug.
--
-- Do NOT re-run the full schema.sql / policies.sql — those are canonical
-- dumps of the live database and are not idempotent. This file contains
-- everything new, in the right order.
-- =====================================================================

-- ============ 1. TABLES ============

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  blurb text,
  product_type text not null check (product_type in ('subscription', 'one_time')),
  fulfilment text not null default 'auto' check (fulfilment in ('auto', 'manual')),
  paddle_price_id text unique,
  linked_program_id uuid references public.programs(id) on delete set null,
  price_display text not null,
  price_usd numeric,
  grants_pods text[],
  grants_coach_role boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  product_id uuid not null references public.shop_products(id),
  paddle_subscription_id text unique,
  paddle_transaction_id text,
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled', 'lifetime')),
  purchased_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_at timestamptz,
  unique (athlete_id, product_id)
);

create table if not exists public.paddle_webhook_events (
  id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_shop_products_active on public.shop_products(is_active, sort_order);
create index if not exists idx_ent_athlete_status on public.user_entitlements(athlete_id, status);
create index if not exists idx_ent_product on public.user_entitlements(product_id);

alter table public.shop_products         enable row level security;
alter table public.user_entitlements     enable row level security;
alter table public.paddle_webhook_events enable row level security;

-- ============ 2. FUNCTIONS ============

-- Updated protect_athlete_admin_fields: lets the Paddle webhook
-- (service_role) elevate/demote roles on Coaching Kit subscribe/cancel.
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

-- (12) Does the signed-in athlete hold an active/lifetime entitlement?
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

-- (13) Did the signed-in athlete buy a product linked to this program?
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

-- (14) Pod names unlocked purely by purchase (frontend unions this with
-- the admin-granted athlete_team_memberships.active_pods).
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

-- ============ 3. POLICIES ============

-- shop_products
drop policy if exists shop_select on public.shop_products;
create policy shop_select on public.shop_products for select
  using (is_active);

drop policy if exists shop_admin_write on public.shop_products;
create policy shop_admin_write on public.shop_products for all
  using (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'));

-- user_entitlements (athletes: read own only; admins: manage; no client
-- insert/update/delete for athletes — webhook writes via service role)
drop policy if exists ent_select on public.user_entitlements;
create policy ent_select on public.user_entitlements for select
  using (athlete_id = current_athlete_id());

drop policy if exists ent_admin_select on public.user_entitlements;
create policy ent_admin_select on public.user_entitlements for select
  using (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'));

drop policy if exists ent_admin_insert on public.user_entitlements;
create policy ent_admin_insert on public.user_entitlements for insert
  with check (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'));

drop policy if exists ent_admin_update on public.user_entitlements;
create policy ent_admin_update on public.user_entitlements for update
  using (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'));

drop policy if exists ent_admin_delete on public.user_entitlements;
create policy ent_admin_delete on public.user_entitlements for delete
  using (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'));

-- paddle_webhook_events (admins can inspect; no client writes)
drop policy if exists whk_admin_select on public.paddle_webhook_events;
create policy whk_admin_select on public.paddle_webhook_events for select
  using (exists (select 1 from club_memberships
                 where user_id = auth.uid() and role = 'admin'));

-- programs / program_exercises: re-issued WITH the entitlement clause so
-- purchased rehab/prevention plans become visible via RLS.
drop policy if exists pe_select on public.program_exercises;
create policy pe_select on public.program_exercises for select
  using (
    exists (select 1 from programs p
            where p.id = program_exercises.program_id
              and (p.privacy = 'public'
                or p.owner_user_id = auth.uid()
                or viewer_has_active_assignment(p.id)
                or viewer_has_program_entitlement(p.id)))
  );

drop policy if exists prg_select on public.programs;
create policy prg_select on public.programs for select
  using (
    privacy = 'public'
    or owner_user_id = auth.uid()
    or viewer_has_active_assignment(id)
    or viewer_has_program_entitlement(id)
  );

-- ============ 4. SEED (your pricing) ============
-- Idempotent upsert-by-slug. paddle_price_id stays NULL until you create
-- the Paddle account and paste the price ids via /manage-shop.

insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('pods', 'All-In Pods',
   'Unlock Wellness, Medical and Schedule tracking for your training.',
   'subscription', 'auto', '$10 / month', 10,
   array['wellness', 'medical', 'schedule'], false, 10)
on conflict (slug) do update set
  name = excluded.name, blurb = excluded.blurb,
  product_type = excluded.product_type, fulfilment = excluded.fulfilment,
  price_display = excluded.price_display, price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('coaching-kit', 'Coaching Kit',
   'Program builder, own exercise library, assignments, sessions, Drill Designer and full analytics. Includes all three Pods.',
   'subscription', 'auto', '$15 / month', 15,
   array['wellness', 'medical', 'schedule'], true, 20)
on conflict (slug) do update set
  name = excluded.name, blurb = excluded.blurb,
  product_type = excluded.product_type, fulfilment = excluded.fulfilment,
  price_display = excluded.price_display, price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('team', 'Team Plan',
   'One team, up to 5 coaches: full coaching tools and all Pods for every rostered athlete.',
   'subscription', 'manual', '$150 / month', 150,
   null, false, 30)
on conflict (slug) do update set
  name = excluded.name, blurb = excluded.blurb,
  product_type = excluded.product_type, fulfilment = excluded.fulfilment,
  price_display = excluded.price_display, price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('club', 'Club Plan',
   'Multiple teams across a club, unlimited coaches, priority support. Get in touch for pricing.',
   'subscription', 'manual', 'Price on application', null,
   null, false, 40)
on conflict (slug) do update set
  name = excluded.name, blurb = excluded.blurb,
  product_type = excluded.product_type, fulfilment = excluded.fulfilment,
  price_display = excluded.price_display, price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

-- Rehab / prevention plans: add them yourself via /manage-shop (they need
-- a real programs.id). SQL template if you ever prefer:
--
-- insert into public.shop_products
--   (slug, name, blurb, product_type, fulfilment, price_display, price_usd, linked_program_id, sort_order)
-- values
--   ('rehab-knee-basic', 'Full Knee Rehab Protocol',
--    'Complete return-to-play program for knee injuries.',
--    'one_time', 'auto', '$20', 20, '<programs.id uuid>', 50)
-- on conflict (slug) do update set
--   name = excluded.name, blurb = excluded.blurb,
--   price_display = excluded.price_display, price_usd = excluded.price_usd,
--   linked_program_id = excluded.linked_program_id,
--   sort_order = excluded.sort_order;

-- =====================================================================
-- DONE. Verify with:
--   select slug, name, price_display, is_active from public.shop_products order by sort_order;
--   select count(*) from public.user_entitlements;   -- expect 0
-- =====================================================================