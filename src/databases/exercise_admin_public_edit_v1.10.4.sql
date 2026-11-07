-- =====================================================================
-- FactorPrep v1.10.4 - ADMIN MAINTENANCE OF THE PUBLIC EXERCISE LIBRARY
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
--
-- v1.9.6 added ex_admin_public_insert (admin publishes to the Public
-- Library) but ex_write / ex_delete still require owner_user_id =
-- auth.uid(), and public rows have no owner — so published exercises
-- could only be fixed via raw SQL. This adds admin-only update/delete
-- policies, scoped strictly to public rows (is_public = true,
-- owner_user_id is null). Coach-owned private libraries are untouched:
-- they remain owner-only via ex_write / ex_delete. Nobody else gains
-- edit/delete access to public exercises.
--
-- App side (same release): admin right-clicks an exercise card in the
-- Exercise Library -> Edit / Delete (same methodology as the schedule).
-- =====================================================================

-- 1. Admin can EDIT published (public) exercises only
drop policy if exists ex_admin_public_update on public.exercises;
create policy ex_admin_public_update on public.exercises for update
  using (
    public.is_shop_admin()
    and is_public = true
    and owner_user_id is null
  )
  with check (
    public.is_shop_admin()
    and is_public = true
    and owner_user_id is null
  );

-- 2. Admin can DELETE published (public) exercises only
drop policy if exists ex_admin_public_delete on public.exercises;
create policy ex_admin_public_delete on public.exercises for delete
  using (
    public.is_shop_admin()
    and is_public = true
    and owner_user_id is null
  );

-- DONE. Verify:
--   1) select policyname from pg_policies where tablename = 'exercises'
--      order by policyname;
--      -> should include ex_admin_public_update and ex_admin_public_delete
--         (alongside ex_delete, ex_insert, ex_select, ex_write,
--          ex_admin_public_insert)
--   2) As crusty@hotmail.com: edit/delete of a PUBLIC exercise succeeds.
--   3) As any other coach: editing or deleting a PUBLIC exercise fails
--      (RLS blocks it), while editing/deleting their OWN exercises
--      still works exactly as before.