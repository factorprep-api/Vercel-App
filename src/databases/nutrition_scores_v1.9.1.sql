-- =====================================================================
-- FactorPrep v1.9.1 - ADD density_per_kj TO v_food_scores
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
--
-- Adds a SECOND density column, measured per kilojoule instead of per 100 g:
--
--   percentile_score  (per 100 g)  "per portion of food, what do I get?"
--   density_per_kj    (per kJ)     "per calorie of energy budget, how much
--                                    micronutrition do I get?"
--
-- Both use the same 17 axes, the same directional percentile method and the
-- same available-case averaging. Only the denominator differs, so they are
-- complementary rather than competing: r = 0.49 across 9,293 foods.
--   - per 100 g favours dry / energy-dense food (pizza 66, lettuce 37)
--   - per kJ favours nutrient-per-calorie     (lettuce 81, pizza 58)
-- Neither is "meal quality": processing is the tier multiplier's job (spec
-- 5) and fueling adequacy is energy + protein per portion.
--
-- score_axes_kj is the per-kJ axis count, same purpose as score_axes.
-- Foods with no energy value (43 of 9,336) get density_per_kj = NULL.
--
-- This migration only re-reads public.foods, so it can run at any time and
-- needs no ETL re-import. The view is populated on creation.
--
-- percentile_score stays the PRIMARY column for now: evaluate density_per_kj
-- against real athlete data first, then decide whether to swap their order.
-- =====================================================================

drop materialized view if exists public.v_food_scores;
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
    end as w63,
    -- per-kJ denominators are undefined without energy
    case when f.energy_kj > 0 then f.energy_kj end as kj
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

-- Same 17 axes and the same percentile method, but each amount is divided
-- by the food's energy (per 100 kJ) instead of by 100 g. Two ratio axes
-- (sat_share, w63) are energy-free, so they reuse the per-100 g contributions.
ranked_kj as (
  select b.*,
    case when b.kj is not null and b.thiamin_mg is not null then 100.0 * (1 - (rank() over (order by b.thiamin_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.thiamin_mg end) over () - 1, 1)) end as ck_thiamin_mg,
    case when b.kj is not null and b.riboflavin_mg is not null then 100.0 * (1 - (rank() over (order by b.riboflavin_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.riboflavin_mg end) over () - 1, 1)) end as ck_riboflavin_mg,
    case when b.kj is not null and b.niacin_mg is not null then 100.0 * (1 - (rank() over (order by b.niacin_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.niacin_mg end) over () - 1, 1)) end as ck_niacin_mg,
    case when b.kj is not null and b.vitamin_c_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_c_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.vitamin_c_mg end) over () - 1, 1)) end as ck_vitamin_c_mg,
    case when b.kj is not null and b.vitamin_e_mg is not null then 100.0 * (1 - (rank() over (order by b.vitamin_e_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.vitamin_e_mg end) over () - 1, 1)) end as ck_vitamin_e_mg,
    case when b.kj is not null and b.folate_total_ug is not null then 100.0 * (1 - (rank() over (order by b.folate_total_ug * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.folate_total_ug end) over () - 1, 1)) end as ck_folate_total_ug,
    case when b.kj is not null and b.vitamin_d_ug is not null then 100.0 * (1 - (rank() over (order by b.vitamin_d_ug * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.vitamin_d_ug end) over () - 1, 1)) end as ck_vitamin_d_ug,
    case when b.kj is not null and b.calcium_mg is not null then 100.0 * (1 - (rank() over (order by b.calcium_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.calcium_mg end) over () - 1, 1)) end as ck_calcium_mg,
    case when b.kj is not null and b.iron_mg is not null then 100.0 * (1 - (rank() over (order by b.iron_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.iron_mg end) over () - 1, 1)) end as ck_iron_mg,
    case when b.kj is not null and b.magnesium_mg is not null then 100.0 * (1 - (rank() over (order by b.magnesium_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.magnesium_mg end) over () - 1, 1)) end as ck_magnesium_mg,
    case when b.kj is not null and b.phosphorus_mg is not null then 100.0 * (1 - (rank() over (order by b.phosphorus_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.phosphorus_mg end) over () - 1, 1)) end as ck_phosphorus_mg,
    case when b.kj is not null and b.potassium_mg is not null then 100.0 * (1 - (rank() over (order by b.potassium_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.potassium_mg end) over () - 1, 1)) end as ck_potassium_mg,
    case when b.kj is not null and b.zinc_mg is not null then 100.0 * (1 - (rank() over (order by b.zinc_mg * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.zinc_mg end) over () - 1, 1)) end as ck_zinc_mg,
    case when b.kj is not null and b.iodine_ug is not null then 100.0 * (1 - (rank() over (order by b.iodine_ug * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.iodine_ug end) over () - 1, 1)) end as ck_iodine_ug,
    case when b.kj is not null and b.ala_g is not null then 100.0 * (1 - (rank() over (order by b.ala_g * 100.0 / b.kj desc nulls last) - 1)::numeric / greatest(count(case when b.kj is not null then b.ala_g end) over () - 1, 1)) end as ck_ala_g
  from ranked b
),
-- Available case: keep only the contributions this food actually earned.
scored as (
  select b.*,
    array(select v from unnest(array[
      c_thiamin, c_ribo, c_niacin, c_vit_c, c_vit_e, c_folate, c_vit_d,
      c_calcium, c_iron, c_magnesium, c_phos, c_potassium, c_zinc,
      c_iodine, c_ala, c_satshare, c_w63
    ]) as t(v) where v is not null) as axes,
    array(select v from unnest(array[
      ck_thiamin_mg, ck_riboflavin_mg, ck_niacin_mg, ck_vitamin_c_mg, ck_vitamin_e_mg,
      ck_folate_total_ug, ck_vitamin_d_ug, ck_calcium_mg, ck_iron_mg, ck_magnesium_mg,
      ck_phosphorus_mg, ck_potassium_mg, ck_zinc_mg, ck_iodine_ug, ck_ala_g,
      c_satshare, c_w63
    ]) as t(v) where v is not null) as axes_kj
  from ranked_kj b
),
final as (
  select id, source, description, category,
    round((select avg(v) from unnest(axes) as t(v)), 2)    as percentile_score,
    (select count(*) from unnest(axes) as t(v))::int       as score_axes,
    round((select avg(v) from unnest(axes_kj) as t(v)), 2) as density_per_kj,
    (select count(*) from unnest(axes_kj) as t(v))::int    as score_axes_kj,
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
create index if not exists idx_fs_kj    on public.v_food_scores(density_per_kj desc);
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

-- ============ ARCHETYPE SCORES: both measures ============
-- Same weights, both denominators. Requires the v1.9.0 tables to exist.
create or replace view public.v_archetype_scores as
with comp as (
  select a.id as archetype_id, a.slug, a.name, a.display_order,
         u.food_id, u.weight, s.percentile_score, s.density_per_kj
  from public.meal_archetypes a
  cross join lateral unnest(a.component_food_ids, a.component_weights)
    as u(food_id, weight)
  left join public.v_food_scores s on s.id = u.food_id
)
select archetype_id, slug, name, display_order,
  round(sum(percentile_score * weight)
        / nullif(sum(weight) filter (where percentile_score is not null), 0), 2)
    as percentile_score,
  round(sum(density_per_kj * weight)
        / nullif(sum(weight) filter (where density_per_kj is not null), 0), 2)
    as density_per_kj,
  count(*)                as component_count,
  count(percentile_score) as scored_components,
  round(sum(weight), 2)   as total_weight
from comp
group by archetype_id, slug, name, display_order;

grant select on public.v_archetype_scores to authenticated;
