-- =====================================================================
-- FactorPrep v1.8.2 — NUTRITION SCORE REBUILD (incremental migration)
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
--
-- Brings the live database to the agreed scoring design (v1.8.2):
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
--        lower = better, with <1 g total fat neutral; ALA ω-3, higher =
--        better; ω-6:ω-3 balance, lower = better). Macronutrients never
--        score — they display in the totals bar.
--      raw_score (§4.2 legacy) — plain sum of the 19 native-unit values;
--        the §4.2 worked examples (cider ≈121.46, blackcurrant ≈639.67)
--        validate the ETL against this.
--    Direction fixed: rank 1 = best → contribution (100 − r) = 100.
--    (The v1.8.0 view rewarded LOW protein/calcium/potassium — a
--    ready-meal lasagne scored 55 vs 42 for homemade.)
--
-- Safe to re-run. CREATE MATERIALIZED VIEW populates immediately.
-- After this, re-run the ETL imports so the new columns fill:
--   node scripts/nutrition_etl.mjs --import --source FNDDS
--   node scripts/nutrition_etl.mjs --import --source AUSNUT
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

-- ============ 2. REBUILD v_food_scores ============
drop materialized view if exists public.v_food_scores;
create materialized view public.v_food_scores as
with base as (
  select f.*,
    case when f.fat_total_g >= 1
         then coalesce(f.fat_sat_g, 0) / nullif(f.fat_total_g, 0) end  as sat_share,
    case when coalesce(f.ala_g, 0) > 0
         then coalesce(f.linoleic_g, 0) / f.ala_g
         when coalesce(f.linoleic_g, 0) > 0 then 1000000000
    end as w63
  from public.foods f
),
ranked as (
  select b.*,
    100.0 * rank() over (order by b.thiamin_mg desc nulls last) / count(*) over ()        as r_thiamin,
    100.0 * rank() over (order by b.riboflavin_mg desc nulls last) / count(*) over ()     as r_ribo,
    100.0 * rank() over (order by b.niacin_mg desc nulls last) / count(*) over ()         as r_niacin,
    100.0 * rank() over (order by b.vitamin_c_mg desc nulls last) / count(*) over ()      as r_vit_c,
    100.0 * rank() over (order by b.vitamin_e_mg desc nulls last) / count(*) over ()      as r_vit_e,
    100.0 * rank() over (order by b.folate_total_ug desc nulls last) / count(*) over ()   as r_folate,
    100.0 * rank() over (order by b.vitamin_d_ug desc nulls last) / count(*) over ()      as r_vit_d,
    100.0 * rank() over (order by b.calcium_mg desc nulls last) / count(*) over ()        as r_calcium,
    100.0 * rank() over (order by b.iron_mg desc nulls last) / count(*) over ()           as r_iron,
    100.0 * rank() over (order by b.magnesium_mg desc nulls last) / count(*) over ()      as r_magnesium,
    100.0 * rank() over (order by b.phosphorus_mg desc nulls last) / count(*) over ()     as r_phos,
    100.0 * rank() over (order by b.potassium_mg desc nulls last) / count(*) over ()      as r_potassium,
    100.0 * rank() over (order by b.zinc_mg desc nulls last) / count(*) over ()           as r_zinc,
    100.0 * rank() over (order by b.iodine_ug desc nulls last) / count(*) over ()         as r_iodine,
    100.0 * rank() over (order by b.ala_g desc nulls last) / count(*) over ()             as r_ala,
    100.0 * rank() over (order by b.sat_share asc nulls last) / count(*) over ()          as r_satshare,
    100.0 * rank() over (order by b.w63 asc nulls last) / count(*) over ()                as r_w63
  from base b
)
select id, source, description, category,
  round((
    -- 14 vitamins/minerals (§4.1): rank 1 = highest value → (100 - r) = 100
    (100 - coalesce(r_thiamin,50)) + (100 - coalesce(r_ribo,50)) + (100 - coalesce(r_niacin,50))
    + (100 - coalesce(r_vit_c,50)) + (100 - coalesce(r_vit_e,50)) + (100 - coalesce(r_folate,50))
    + (100 - coalesce(r_vit_d,50)) + (100 - coalesce(r_calcium,50)) + (100 - coalesce(r_iron,50))
    + (100 - coalesce(r_magnesium,50)) + (100 - coalesce(r_phos,50)) + (100 - coalesce(r_potassium,50))
    + (100 - coalesce(r_zinc,50)) + (100 - coalesce(r_iodine,50))
    -- 3 fatty-acid QUALITY axes (fat amount never scores)
    + (100 - coalesce(r_ala,50))
    + case when sat_share is null then 50 else (100 - coalesce(r_satshare,50)) end
    + case when w63 is null then 50 else (100 - coalesce(r_w63,50)) end
  ) / 17.0, 2) as percentile_score,
  -- §4.2 legacy raw score: the plan's 19 values in native units
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
from ranked;

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