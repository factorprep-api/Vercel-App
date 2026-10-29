-- =====================================================================
-- FactorPrep v1.9.6 - PUBLIC EXERCISE LIBRARY (paste into Supabase SQL Editor)
-- Run ONCE. Idempotent (drop policy if exists / create policy).
--
-- Lets the shop admin (crusty@hotmail.com, via is_shop_admin()) publish
-- exercises to the shared public library from the app's Add Exercise modal:
--   is_public = true, owner_user_id = null -> visible to EVERYONE (ex_select).
-- Every other account is still restricted by the existing ex_insert policy
-- (owner_user_id = auth.uid() and is_public = false), so coach libraries
-- stay private.
--
-- NOTE: public rows have no owner, so ex_write / ex_delete still block
-- in-app edits of published exercises. Fixing a published exercise's video
-- link is a SQL Editor job, e.g.:
--   update public.exercises set video_url = '...' where exercise_name = '...';
-- =====================================================================

drop policy if exists ex_admin_public_insert on public.exercises;
create policy ex_admin_public_insert on public.exercises for insert
  with check (
    public.is_shop_admin()
    and is_public = true
    and owner_user_id is null
  );

-- DONE. Verify:
--   1) select policyname from pg_policies where tablename = 'exercises'
--      and policyname = 'ex_admin_public_insert';  -- 1 row
--   2) In the app as crusty@hotmail.com: Add Exercise -> choose "Public
--      Library" -> exercise appears for all coaches/athletes (no Coach
--      badge). As any other coach, "Public Library" is not offered.
