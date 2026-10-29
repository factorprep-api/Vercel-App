-- =====================================================================
-- FactorPrep v1.8.2 — NUTRITION SCORE REBUILD (incremental migration)
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
--
-- Brings the live database to the agreed scoring design. Two parts:
--
-- 1) NEW COLUMNS on public.foods — the plan §4.1 scoring nutrients that
--    were missing: fatty-acid profile (mono, poly, ω-6 linoleic, ω-3 ALA),
--    B vitamins (thiamin, riboflavin, niacin), phosphorus, iodine, and
--    folate TOTAL (the existing folate_ug holds DFE, which §4.1
--    deliberately excludes — kept as informational).
--
-- 2) v_food_scores rebuilt with TWO scores (plan §4.6):
--      percentile_score (primary, 0–100) — 17 axes: the 14 vitamins/
--        minerals + 3 fatty-acid QUALITY axes (saturated share of fat,
--        lower = better; ALA ω-3, higher = better; ω-6:ω-3 balance, lower
--        = better). Macronutrients never score — they display in the
--        totals bar. Each axis is ranked against the foods that REPORT it
--        (not all 9,365), and the score is the mean of the axes that food
--        actually has (available case — see the view comment).
--      score_axes — how many axes that food was scored on (UI shows 16/17).
--      raw_score (§4.2 legacy) — plain sum of the 19 native-unit values,
--        missing → 0. Audit/continuity only: it is NOT a ranking, and it
--        is never sent to the browser.
--      rank_position — 1-based rank of percentile_score across all foods.
--
-- ORDER OF OPERATIONS (matters):
--   1. run this migration                      → columns exist, all NULL
--   2. node scripts/nutrition_etl.mjs --import --source FNDDS
--      node scripts/nutrition_etl.mjs --import --source AUSNUT
--      Run them back-to-back: scores are meaningless between the two,
--      because half the foods would still have NULL nutrients.
--   3. refresh_nutrition_scores() runs automatically at the end of each
--      import (the ETL calls the RPC) — no manual step needed.
--
-- Safe to re-run. CREATE MATERIALIZED VIEW populates immediately.
-- =====================================================================

-- ============ 1. NEW COLUMNS (plan §4.1 scoring nutrients) ============
alter table public.foods add column if not exists fat_mono_g numeric;
alter table public.foods add column if not exists fat_poly_g numeric;
alter table public.foods add column if not exists linoleic_g numeric;
alter table public.foods add column if not exists ala_g numeric;
alter table public.foods add column if not exists thiamin_mg numeric;
alter table public.foods add column if not exists riboflavin_mg numeric;
alter table public.foods add column if not exists niacin_mg numeric;
alter table public.foods add column if not exists phosphorus_mg numeric;
alter table public.foods add column if not exists iodine_ug numeric;
alter table public.foods add column if not exists folate_total_ug numeric;

-- ============ FOOD SCORES (materialized view — reference data only) ============
-- TWO scores per food, both pure functions of stored data (plan §4.6).
-- NO athlete data touches this view, so the RLS bypass of a materialized
-- view is safe. NEVER add athlete rollups here.
--
--   percentile_score (primary, 0–100) — 17 directional axes: the 14 §4.1
--     vitamins/minerals + 3 fatty-acid QUALITY axes (fat AMOUNT never
--     scores). Contribution per axis = 100·(1 − (rank−1)/(n−1)), rank 1 =
--     best, where n = the number of foods that REPORT that axis —
--     count(col) OVER (), not the table size. Iodine exists only in AUSNUT;
--     dividing it by the full 9,365 squeezed every AUSNUT food's iodine
--     contribution into a 60–100 band. A row that does NOT report an axis
--     gets NULL for it (the CASE guard) and the axis is dropped from its
--     average — otherwise nulls would collect negative contributions.
--   score_axes — how many axes that food was actually scored on. Named, not
--     hidden: a 16/17 food is not compared like-for-like with a 17/17 one.
--   raw_score (§4.2 legacy) — plain sum of the plan's 19 nutrient values per
--     100 g in native units (missing → 0), kept for continuity and audit
--     ONLY. Potassium, phosphorus and calcium dominate it, and linoleic/ALA
--     are double-counted inside total polyunsaturated fat, so it must never
--     be used to rank foods.
--   rank_position — 1-based rank of percentile_score across all foods
--     (plan §4.6), for "top X%" display.
--
-- AMENDMENT to plan §4.4: missing values are NOT scored as 0. A food is
-- scored on the axes it actually reports (available case) and its
-- percentile_score is the mean of those contributions — NULL if it reports
-- none. Rationale: with 100% coverage of the 14 vitamin/mineral axes there
-- are no patchy foods to distort, and the 3 fat-quality axes are genuinely
-- undefined for <1 g/100 g fat foods rather than "bad".
drop materialized view if exists public.v_food_scores;
create materialized view public.v_food_scores as
with base as (
  select f.*,
    -- Saturated share of fat: needs real fat AND a reported sat-fat value.
    -- coalesce(fat_sat_g, 0) would score unanalysed foods as 0% saturated,
    -- i.e. best-in-database fat quality.
    case when f.fat_total_g >= 1 and f.fat_sat_g is not null
         then f.fat_sat_g / nullif(f.fat_total_g, 0) end as sat_share,
    -- ω-6:ω-3 balance, lower = better. Undefined (NULL → axis absent)
    -- unless BOTH fatty acids are reported; a reported ALA of 0 with ω-6
    -- present is genuinely the worst balance.
    case when f.fat_total_g >= 1 and f.ala_g is not null and f.linoleic_g is not null
         then case when f.ala_g > 0 then f.linoleic_g / f.ala_g
                   when f.linoleic_g > 0 then 1000000000
                   else null end
    end as w63
  from public.foods f
),
ranked as (
  select b.*,
    case when b.thiamin_mg is not null then 100.0 * (1 - (rank() over (order by b.thiamin_mg desc nulls last) - 1)::numeric / greatest(count(b.thiamin_mg) over () - 1, 1)) end as c_thiamin,
    case when b.riboflavin_mg is not null then 100.0 * (1 - (rank() over (order by b.riboflavin_mg desc nulls last) - 1)::numeric / greatest(count(b.riboflavin_mg) over () - 1, 1)) end as c_ribo,
    case when b.niacin_mg is not null then 100.0 * (1 - (rank() over (order by b.niacin_mg desc nulls last) - 1)::numeric / greatest(count(b.niacin_mg) over () - 1, 1)) end as c_niacin,
    case when b.vitamin_c_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_c_mg desc nulls last) - 1)::numeric / greatest(count(b.vitamin_c_mg) over () - 1, 1)) end as c_vit_c,
    case when b.vitamin_e_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_e_mg desc nulls last) - 1)::numeric / greatest(count(b.vitamin_e_mg) over () - 1, 1)) end as c_vit_e,
    case when b.folate_total_ug is not null then 100.0 * (1 - (rank() over (order by b.folate_total_ug desc nulls last) - 1)::numeric / greatest(count(b.folate_total_ug) over () - 1, 1)) end as c_folate,
    case when b.vitamin_d_ug is not null then 100.0 * (1 - (rank() over (order by b.vitamin_d_ug desc nulls last) - 1)::numeric / greatest(count(b.vitamin_d_ug) over () - 1, 1)) end as c_vit_d,
    case when b.calcium_mg is not null then 100.0 * (1 - (rank() over (order by b.calcium_mg desc nulls last) - 1)::numeric / greatest(count(b.calcium_mg) over () - 1, 1)) end as c_calcium,
    case when b.iron_mg is not null then 100.0 * (1 - (rank() over (order by b.iron_mg desc nulls last) - 1)::numeric / greatest(count(b.iron_mg) over () - 1, 1)) end as c_iron,
    case when b.magnesium_mg is not null then 100.0 * (1 - (rank() over (order by b.magnesium_mg desc nulls last) - 1)::numeric / greatest(count(b.magnesium_mg) over () - 1, 1)) end as c_magnesium,
    case when b.phosphorus_mg is not null then 100.0 * (1 - (rank() over (order by b.phosphorus_mg desc nulls last) - 1)::numeric / greatest(count(b.phosphorus_mg) over () - 1, 1)) end as c_phos,
    case when b.potassium_mg is not null then 100.0 * (1 - (rank() over (order by b.potassium_mg desc nulls last) - 1)::numeric / greatest(count(b.potassium_mg) over () - 1, 1)) end as c_potassium,
    case when b.zinc_mg is not null then 100.0 * (1 - (rank() over (order by b.zinc_mg desc nulls last) - 1)::numeric / greatest(count(b.zinc_mg) over () - 1, 1)) end as c_zinc,
    case when b.iodine_ug is not null then 100.0 * (1 - (rank() over (order by b.iodine_ug desc nulls last) - 1)::numeric / greatest(count(b.iodine_ug) over () - 1, 1)) end as c_iodine,
    case when b.ala_g is not null then 100.0 * (1 - (rank() over (order by b.ala_g desc nulls last) - 1)::numeric / greatest(count(b.ala_g) over () - 1, 1)) end as c_ala,
    case when b.sat_share is not null then 100.0 * (1 - (rank() over (order by b.sat_share asc nulls last) - 1)::numeric / greatest(count(b.sat_share) over () - 1, 1)) end as c_satshare,
    case when b.w63 is not null then 100.0 * (1 - (rank() over (order by b.w63 asc nulls last) - 1)::numeric / greatest(count(b.w63) over () - 1, 1)) end as c_w63
  from base b
),
-- Available case: keep only the contributions this food actually earned.
scored as (
  select b.*,
    array(select v from unnest(array[
      c_thiamin, c_ribo, c_niacin, c_vit_c, c_vit_e, c_folate, c_vit_d,
      c_calcium, c_iron, c_magnesium, c_phos, c_potassium, c_zinc,
      c_iodine, c_ala, c_satshare, c_w63
    ]) as t(v) where v is not null) as axes
  from ranked b
),
final as (
  select id, source, description, category,
    round((select avg(v) from unnest(axes) as t(v)), 2)    as percentile_score,
    (select count(*) from unnest(axes) as t(v))::int       as score_axes,
    round(
      coalesce(fat_sat_g,0) + coalesce(fat_mono_g,0) + coalesce(fat_poly_g,0)
      + coalesce(linoleic_g,0) + coalesce(ala_g,0)
      + coalesce(thiamin_mg,0) + coalesce(riboflavin_mg,0) + coalesce(niacin_mg,0)
      + coalesce(vitamin_c_mg,0) + coalesce(vitamin_e_mg,0)
      + coalesce(folate_total_ug,0) + coalesce(vitamin_d_ug,0)
      + coalesce(calcium_mg,0) + coalesce(iron_mg,0) + coalesce(magnesium_mg,0)
      + coalesce(phosphorus_mg,0) + coalesce(potassium_mg,0) + coalesce(zinc_mg,0)
      + coalesce(iodine_ug,0)
    , 2) as raw_score
  from scored
)
select f.*,
  rank() over (order by f.percentile_score desc nulls last) as rank_position
from final f;

create index if not exists idx_fs_score on public.v_food_scores(percentile_score desc);
grant select on public.v_food_scores to authenticated;

-- The ETL script calls this via rpc after every successful import.
create or replace function public.refresh_nutrition_scores()
returns void
language sql
security definer
set search_path to ''
as $$
  refresh materialized view public.v_food_scores;
$$;
-- =====================================================================
-- END v1.8.2 NUTRITION SCORE REBUILD
-- =====================================================================