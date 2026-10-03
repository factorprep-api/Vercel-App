-- =====================================================================
-- FactorPrep v1.5.1 — SHOP ADMIN LOCKDOWN (paste into Supabase SQL Editor)
-- Run ONCE. Idempotent (create or replace / drop if exists).
--
-- Locks shop governance to a SINGLE account: crusty@hotmail.com.
-- Club admins (coach promotions) no longer imply shop powers.
-- The frontend Manage pill and /manage-shop page use the same function,
-- so frontend and database can never disagree.
--
-- To change the shop admin later: edit the email in is_shop_admin() below
-- and re-run this file.
-- =====================================================================

-- ============ 1. THE SHOP ADMIN FUNCTION ============
-- Matches the logged-in user's auth email (authoritative source) against
-- the one shop boss. SECURITY DEFINER so it can read auth.users from RLS
-- policies. Note: in the SQL Editor this returns false (no JWT) — test it
-- in the app, not here.
create or replace function public.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.athletes a
    join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and lower(u.email) = 'crusty@hotmail.com'
  );
$function$;

-- ============ 2. RE-ISSUE SHOP POLICIES ============
-- Same six policies as v1.5.0, but the admin check is now is_shop_admin()
-- instead of "any club admin". Athlete-facing policies (ent_select,
-- shop_select, programs, etc.) are untouched.

-- shop_products: only the shop admin manages the catalog
drop policy if exists shop_admin_write on public.shop_products;
create policy shop_admin_write on public.shop_products for all
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

-- user_entitlements: only the shop admin sees/manages everyone's grants
drop policy if exists ent_admin_select on public.user_entitlements;
create policy ent_admin_select on public.user_entitlements for select
  using (public.is_shop_admin());

drop policy if exists ent_admin_insert on public.user_entitlements;
create policy ent_admin_insert on public.user_entitlements for insert
  with check (public.is_shop_admin());

drop policy if exists ent_admin_update on public.user_entitlements;
create policy ent_admin_update on public.user_entitlements for update
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

drop policy if exists ent_admin_delete on public.user_entitlements;
create policy ent_admin_delete on public.user_entitlements for delete
  using (public.is_shop_admin());

-- paddle_webhook_events: only the shop admin can inspect
drop policy if exists whk_admin_select on public.paddle_webhook_events;
create policy whk_admin_select on public.paddle_webhook_events for select
  using (public.is_shop_admin());

-- =====================================================================
-- DONE. Verify:
--   1) select proname from pg_proc where proname = 'is_shop_admin';  -- 1 row
--   2) In the app as crusty@hotmail.com: Manage pill shows on both hubs,
--      /manage-shop loads. As any other account: pill hidden and
--      /manage-shop says "You are not a club admin".
-- =====================================================================