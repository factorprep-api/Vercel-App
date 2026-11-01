-- =====================================================================
-- FactorPrep — shop_pod_cleanup_v1.9.23.sql
-- One-time cleanup: make the SHOP the single source of truth for pods.
--
-- Context: athlete pod access is the union of two sources
--   1) legacy   -> athlete_team_memberships.active_pods (admin CLI / old grants)
--   2) shop     -> user_entitlements -> shop_products.grants_pods
--                  (status in ('active','lifetime'), mirroring the
--                  viewer_entitled_pods() DB function exactly)
-- After every athlete's pods have been granted in the shop
-- (Manage Shop -> Grants), the legacy source is redundant and confusing.
-- This script empties active_pods so ONLY the shop grants access.
--
-- RUN ORDER (run in the Supabase SQL editor):
--   STEP 1 (read-only check)  -> MUST return 0 rows before continuing.
--   STEP 2 (backup)           -> snapshot, in case anything needs restoring.
--   STEP 3 (cleanup)          -> clears active_pods. Re-runnable.
--   STEP 4 (verify)           -> confirms the roster legacy column is empty.
--
-- Nothing in the app changes: fetchMyPods still unions granted + purchased,
-- so athletes keep identical access, now sourced 100% from the shop.
-- =====================================================================

-- ---------------------------------------------------------------
-- STEP 1 — SAFETY CHECK (read-only). MUST return 0 rows.
-- Lists every legacy pod NOT already granted to that athlete in the
-- shop. If any rows appear, grant those pods in the shop FIRST
-- (Manage Shop -> Grants), then re-run this check.
-- ---------------------------------------------------------------
select
  m.id                                   as membership_id,
  a.name                                 as athlete_name,
  a.email                                as athlete_email,
  t.name                                 as team_name,
  m.active_pods                          as legacy_pods,
  coalesce((
    select array_agg(distinct lower(x))
    from user_entitlements e
    join shop_products sp on sp.id = e.product_id
    cross join unnest(sp.grants_pods) as x
    where e.athlete_id = m.athlete_id
      and e.status in ('active', 'lifetime')
      and sp.grants_pods is not null
  ), '{}')                               as shop_pods,
  coalesce((
    select array_agg(p)
    from unnest(m.active_pods) as p
    where not exists (
      select 1
      from user_entitlements e
      join shop_products sp on sp.id = e.product_id
      cross join unnest(sp.grants_pods) as x
      where e.athlete_id = m.athlete_id
        and e.status in ('active', 'lifetime')
        and sp.grants_pods is not null
        and lower(x) = lower(p)
    )
  ), '{}')                               as pods_missing_from_shop
from athlete_team_memberships m
join athletes a on a.id = m.athlete_id
join teams t on t.id = m.team_id
where m.active_pods is not null
  and array_length(m.active_pods, 1) > 0
  and exists (
    select 1
    from unnest(m.active_pods) as p
    where not exists (
      select 1
      from user_entitlements e
      join shop_products sp on sp.id = e.product_id
      cross join unnest(sp.grants_pods) as x
      where e.athlete_id = m.athlete_id
        and e.status in ('active', 'lifetime')
        and sp.grants_pods is not null
        and lower(x) = lower(p)
    )
  );

-- ---------------------------------------------------------------
-- STEP 2 — BACKUP SNAPSHOT (safety net). Run once.
-- Restoring: update athlete_team_memberships m set active_pods =
--   b.active_pods from active_pods_backup_20261101 b where b.id = m.id;
-- ---------------------------------------------------------------
create table if not exists active_pods_backup_20261101 as
select
  m.id,
  m.athlete_id,
  m.team_id,
  m.active_pods,
  now() as backed_up_at
from athlete_team_memberships m
where m.active_pods is not null
  and array_length(m.active_pods, 1) > 0;

-- ---------------------------------------------------------------
-- STEP 3 — CLEANUP (destructive, re-runnable).
-- Clears legacy pods from every membership whose pods are fully
-- covered by the athlete's shop entitlements. Anything NOT covered
-- (STEP 1 rows) is deliberately left untouched so nobody loses access.
-- ---------------------------------------------------------------
update athlete_team_memberships m
set active_pods = '{}'
where m.active_pods is not null
  and array_length(m.active_pods, 1) > 0
  and not exists (
    select 1
    from unnest(m.active_pods) as p
    where not exists (
      select 1
      from user_entitlements e
      join shop_products sp on sp.id = e.product_id
      cross join unnest(sp.grants_pods) as x
      where e.athlete_id = m.athlete_id
        and e.status in ('active', 'lifetime')
        and sp.grants_pods is not null
        and lower(x) = lower(p)
    )
  );

-- ---------------------------------------------------------------
-- STEP 4 — VERIFY (read-only). Should show 0 rows / 0 legacy pods.
-- ---------------------------------------------------------------
select
  count(*) filter (where coalesce(array_length(m.active_pods, 1), 0) > 0) as memberships_still_with_legacy_pods,
  count(*)                                                                as total_memberships
from athlete_team_memberships m;
