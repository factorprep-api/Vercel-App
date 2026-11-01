-- =====================================================================
-- Shop Nutrition Bundles + Teams Insert Policy — v1.9.18
--
-- (1) Adds the 'nutrition' pod to both paid subscription bundles:
--       pods          (All-In Pods, $10/month)
--       coaching-kit  (Coaching Kit, $15/month)
--     Why this is enough: viewer_entitled_pods() (functions.sql) joins
--     user_entitlements -> shop_products.grants_pods at read time, so every
--     existing subscriber of these bundles gets the nutrition pod
--     automatically — no per-user data changes needed. New purchases
--     inherit it too. Future pod management is shop-managed
--     (Manage Shop -> Products: Grants pods checkboxes).
--
-- (2) Adds the missing teams_insert policy: club admins may create teams
--     in their own club via the new Manage Shop -> Teams tab.
--     (teams_select / teams_update already existed; insert did not.)
--
-- Idempotent: appends 'nutrition' only if not already present; blurb
-- update is a constant so re-running is a no-op. Never removes a pod.
--
-- HOW TO APPLY (test + production):
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--
-- Verify:
--   select slug, grants_pods from shop_products where slug in ('pods','coaching-kit');
--   select policyname from pg_policies where tablename = 'teams';
-- =====================================================================

-- (1) bundles: append nutrition (never removes existing pods)
update public.shop_products set
  grants_pods = case
    when grants_pods is null then array['nutrition']
    when not ('nutrition' = any(grants_pods)) then grants_pods || array['nutrition']
    else grants_pods
  end,
  blurb = 'Unlock Wellness, Nutrition, Medical and Schedule tracking for your training.'
where slug = 'pods';

update public.shop_products set
  grants_pods = case
    when grants_pods is null then array['nutrition']
    when not ('nutrition' = any(grants_pods)) then grants_pods || array['nutrition']
    else grants_pods
  end,
  blurb = 'Program builder, own exercise library, assignments, sessions, Drill Designer and full analytics. Includes all four Pods.'
where slug = 'coaching-kit';

-- (2) club admins may create teams in their own club (for the Teams tab)
drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert
  with check (
    club_id in (select get_user_admin_club_ids())
  );

-- Verify (both should include 'nutrition'):
--   select slug, grants_pods from shop_products where slug in ('pods','coaching-kit');
--   select policyname from pg_policies where tablename = 'teams';
