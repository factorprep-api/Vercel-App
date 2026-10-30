-- =====================================================================
-- FactorPrep v1.9.15 — TIER MULTIPLIER RE-STAGGER (Supabase SQL Editor)
-- Run ONCE. Idempotent.
--
-- The pill ladder was reordered in v1.9.12 (processed → supermarket →
-- local → organic → homegrown) but the multipliers kept the OLD fresh-era
-- staggering (organic 1.00 < local 1.10), so the numbers no longer rise
-- with the ladder. This re-staggers them monotonically:
--   processed 0.60 → supermarket 0.80 → local 1.00 → organic 1.10 →
--   homegrown 1.20
--
-- HISTORY-SAFE BY DESIGN (§5.3): nutrition_logs.items snapshots the
-- resolved score_multiplier per logged item, so re-tuning the table
-- never rewrites logged history. Items logged before this change keep
-- their stored multiplier (local ×1.10, organic ×1.00, homegrown ×1.15);
-- only new logs use the new values.
-- =====================================================================

-- Idempotent single statement: sets each tier to its target multiplier.
update public.quality_tier_modifiers
  set score_multiplier = case tier
        when 'local'     then 1.00
        when 'organic'   then 1.10
        when 'homegrown' then 1.20
        else score_multiplier  -- processed 0.60 / supermarket 0.80 unchanged
      end,
      updated_at = now();

-- ============ VERIFY ============
-- select * from public.quality_tier_modifiers order by score_multiplier;
--   expect, low → high, exactly matching pill order:
--   processed 0.60 | supermarket 0.80 | local 1.00 | organic 1.10 | homegrown 1.20
