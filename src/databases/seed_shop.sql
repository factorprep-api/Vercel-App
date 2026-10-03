-- =====================================================================
-- Shop Catalog Seed — v1.5.0
-- Run AFTER schema.sql (v1.5.0 section) and policies.sql (v1.5.0 section).
--
-- Idempotent: re-running refreshes display data only; it never touches
-- user_entitlements.
--
-- paddle_price_id is intentionally NULL everywhere: fill it in via the
-- /manage-shop admin panel (or UPDATE below) once the Paddle account
-- exists and the products/prices are created in the dashboard. Shop.jsx
-- runs in demo mode while any purchasable row lacks a price id.
-- =====================================================================

-- Subscription: All-In Pods — $10/month, unlocks wellness/medical/schedule
insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('pods',
   'All-In Pods',
   'Unlock Wellness, Medical and Schedule tracking for your training.',
   'subscription', 'auto', '$10 / month', 10,
   array['wellness', 'medical', 'schedule'], false, 10)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  product_type = excluded.product_type,
  fulfilment = excluded.fulfilment,
  price_display = excluded.price_display,
  price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

-- Subscription: Coaching Kit — $15/month, coach features + all pods included
insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('coaching-kit',
   'Coaching Kit',
   'Program builder, own exercise library, assignments, sessions, Drill Designer and full analytics. Includes all three Pods.',
   'subscription', 'auto', '$15 / month', 15,
   array['wellness', 'medical', 'schedule'], true, 20)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  product_type = excluded.product_type,
  fulfilment = excluded.fulfilment,
  price_display = excluded.price_display,
  price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

-- Subscription: Team — $150/month per team (up to 5 coaches), admin-fulfilled
insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('team',
   'Team Plan',
   'One team, up to 5 coaches: full coaching tools and all Pods for every rostered athlete.',
   'subscription', 'manual', '$150 / month', 150,
   null, false, 30)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  product_type = excluded.product_type,
  fulfilment = excluded.fulfilment,
  price_display = excluded.price_display,
  price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

-- Subscription: Club — price on application, admin-fulfilled
insert into public.shop_products
  (slug, name, blurb, product_type, fulfilment, price_display, price_usd, grants_pods, grants_coach_role, sort_order)
values
  ('club',
   'Club Plan',
   'Multiple teams across a club, unlimited coaches, priority support. Get in touch for pricing.',
   'subscription', 'manual', 'Price on application', null,
   null, false, 40)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  product_type = excluded.product_type,
  fulfilment = excluded.fulfilment,
  price_display = excluded.price_display,
  price_usd = excluded.price_usd,
  grants_pods = excluded.grants_pods,
  grants_coach_role = excluded.grants_coach_role,
  sort_order = excluded.sort_order;

-- Rehab / prevention plans are added per-program via the /manage-shop admin
-- panel (they need a real programs.id). Template — run once you have the
-- program id, or just use the admin panel:
--
-- insert into public.shop_products
--   (slug, name, blurb, product_type, fulfilment, price_display, price_usd,
--    linked_program_id, sort_order)
-- values
--   ('rehab-knee-basic', 'Full Knee Rehab Protocol',
--    'Complete return-to-play program for knee injuries.',
--    'one_time', 'auto', '$20', 20,
--    '<programs.id uuid>', 50)
-- on conflict (slug) do update set
--   name = excluded.name,
--   blurb = excluded.blurb,
--   price_display = excluded.price_display,
--   price_usd = excluded.price_usd,
--   linked_program_id = excluded.linked_program_id,
--   sort_order = excluded.sort_order;