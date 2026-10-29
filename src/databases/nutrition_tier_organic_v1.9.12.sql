-- =====================================================================
-- FactorPrep v1.9.12 — RENAME QUALITY TIER 'fresh' → 'organic'
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
-- =====================================================================
-- v1.9.12 (2026-10-29): product decision — the 1.00 reference tier is
-- renamed from 'fresh' to 'organic' to match how athletes actually shop
-- and to keep the ladder purely about provenance/processing:
--   processed 0.60 · supermarket 0.80 · local 1.10 · organic 1.00 ·
--   homegrown 1.15, displayed as processed → supermarket → local →
--   organic → homegrown.
--
-- HISTORY-SAFE BY DESIGN (§5.3): nutrition_logs.items snapshots the
-- resolved score_multiplier per logged item, so this rename never
-- rewrites logged history. Items logged as 'fresh' keep their stored
-- ×1.00 multiplier — numerically identical to organic — so day-quality
-- math is unchanged. There is no FK into quality_tier_modifiers and no
-- constraint on the jsonb items, so the UPDATE below cannot fail on data.
-- =====================================================================

-- 1. Drop the tier list constraint (it still names 'fresh')
alter table public.quality_tier_modifiers
  drop constraint if exists quality_tier_modifiers_tier_check;

-- 2. Rename the row: same multiplier (1.00, the reference tier), new badge
update public.quality_tier_modifiers
  set tier = 'organic',
      display_badge = 'Organic',
      updated_at = now()
  where tier = 'fresh';

-- 3. Re-add the constraint with the new five-tier list
alter table public.quality_tier_modifiers
  add constraint quality_tier_modifiers_tier_check
    check (tier in ('processed', 'supermarket', 'local', 'organic', 'homegrown'));

-- ============ VERIFY ============
-- select * from public.quality_tier_modifiers order by score_multiplier;
--   expect 5 rows, no 'fresh':
--   processed 0.60 Processed | supermarket 0.80 Supermarket |
--   organic 1.00 Organic     | local 1.10 Local |
--   homegrown 1.15 Homegrown
