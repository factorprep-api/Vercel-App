-- =====================================================================
-- FactorPrep v1.9.27 — COACH DAILY NUTRITION TOTALS (Supabase SQL Editor)
-- Run ONCE. Idempotent (CREATE OR REPLACE).
--
-- Purpose (plan §7.4 / Amendment A15): the coach sees ONLY daily energy (kJ)
-- and macronutrient totals per athlete — never food items, notes, per-food
-- scores or quality tiers. This view aggregates the denormalized `items`
-- jsonb snapshots server-side with gram-weighted math (Σ grams·per-100g / 100),
-- the exact formula the athlete page computes client-side.
--
-- Why a plain VIEW with security_invoker, not a materialized view (plan A9
-- rule): materialized views bypass RLS and would leak every athlete's rows
-- to any reader. `security_invoker = true` makes the view execute with the
-- CALLER's privileges, so nutrition_logs RLS (nl_select — athlete's own
-- rows, coach-of-athlete read, club-admin read) still governs exactly which
-- athletes' rows are visible. The view exposes only aggregates — no items.
--
-- Requires nutrition_pod_v1.8.0.sql (nutrition_logs with items jsonb).
-- =====================================================================

drop view if exists public.v_athlete_daily_nutrition;

create view public.v_athlete_daily_nutrition
with (security_invoker = true) as
select
  nl.athlete_id,
  a.name as athlete_name,
  nl.entry_date,
  count(*)::int as log_count,
  -- per item: grams · per-100g value / 100; a missing per-100g value
  -- contributes 0 (same tolerance the athlete page uses for null fields)
  sum( (it->>'grams')::numeric * coalesce((it->>'kj100')::numeric, 0) / 100 ) as total_kj,
  sum( (it->>'grams')::numeric * coalesce((it->>'protein100')::numeric, 0) / 100 ) as protein_g,
  sum( (it->>'grams')::numeric * coalesce((it->>'carbs100')::numeric, 0) / 100 ) as carbs_g,
  sum( (it->>'grams')::numeric * coalesce((it->>'fat100')::numeric, 0) / 100 ) as fat_g
from public.nutrition_logs nl
join public.athletes a on a.id = nl.athlete_id
cross join lateral jsonb_array_elements(
  -- items may be null or a non-array jsonb on legacy rows; the case guards
  -- both (a non-array yields no lateral rows and the log day drops out —
  -- correct, because there is nothing aggregate to show for it)
  case when jsonb_typeof(nl.items) = 'array' then nl.items else '[]'::jsonb end
) as it
where nl.deleted_at is null
group by nl.athlete_id, a.name, nl.entry_date;

grant select on public.v_athlete_daily_nutrition to authenticated;