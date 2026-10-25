-- =====================================================================
-- FactorPrep v1.9.2 — ARCHETYPE SERVE SIZES + PER-SERVING NUTRIENTS
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
--
-- The archetype's component weights are RELATIVE gram shares, not grams, so
-- they can produce a density score but not "this meal gives you 2,400 kJ".
-- This adds the missing anchor:
--
--   meal_archetypes.base_grams  — what one NORMAL serve of that meal weighs
--
-- and v_archetype_nutrients, which allocates base_grams across the
-- components in proportion to their weights and sums the per-100 g values.
-- portion_size_scalars (small 0.60 / normal 1.00 / large 1.40) then scales
-- from that normal serve, and the resolved scalar is snapshotted per log
-- row (spec §5.3).
--
-- PROVISIONAL: the ten base_grams values below are the coder's proposals for
-- product-owner sign-off, not measured data. They are data, so adjusting
-- them is an UPDATE, not a deploy.
--
-- Requires nutrition_archetypes_v1.9.0.sql (tables) and
-- nutrition_scores_v1.9.1.sql (v_food_scores with both density measures).
-- =====================================================================

alter table public.meal_archetypes add column if not exists base_grams numeric;
-- Per-component gram overrides. NULL means "take your share of base_grams in
-- proportion to weight"; a number pins that component to an absolute weight.
-- Needed because the weights are RELATIVE gram shares: oil at weight 1 of 8
-- in a 450 g pasta dinner allocates 56 g of oil (4 tablespoons), which is not
-- how anyone cooks. Preparation ingredients are amounts, not shares.
alter table public.meal_archetypes add column if not exists component_grams numeric[];

-- Proposed normal serves (grams or millilitres-equivalent).
update public.meal_archetypes a
   set base_grams = v.g
  from (values
    ('breakfast_smoothie', 450),
    ('oats_bowl',          400),
    ('eggs_breakfast',     350),
    ('sandwich_lunch',     250),
    ('rice_protein',       500),
    ('pasta_dinner',       450),
    ('salad_meal',         350),
    ('yogurt_snack',       200),
    ('recovery_drink',     400),
    ('takeaway_meal',      500)
  ) as v(slug, g)
 where a.slug = v.slug;

-- Pin the oil in the three meals that use it as a preparation ingredient.
-- Component order: see the seed in nutrition_archetypes_v1.9.0.sql.
update public.meal_archetypes set component_grams = array[null, null, null, 12]::numeric[]
 where slug = 'rice_protein';      -- rice, chicken, mixed veg, olive oil
update public.meal_archetypes set component_grams = array[null, null, null, null, 12]::numeric[]
 where slug = 'pasta_dinner';      -- pasta, beef mince, sauce, veg, olive oil
update public.meal_archetypes set component_grams = array[null, null, null, null, 12]::numeric[]
 where slug = 'salad_meal';        -- lettuce, tomato, chickpea, chicken, olive oil

-- Per-normal-serve nutrient totals. A component contributes either its
-- absolute override, or base_grams * (weight / total weight) grams.
create or replace view public.v_archetype_nutrients as
with c as (
  select a.id as archetype_id, a.slug, a.name, a.base_grams,
         coalesce(a.component_grams[u.ord],
                  u.weight / sum(u.weight) over (partition by a.id) * a.base_grams) as grams,
         f.energy_kj, f.protein_g, f.carbohydrate_g, f.fat_total_g, f.fibre_g
  from public.meal_archetypes a
  cross join lateral unnest(a.component_food_ids, a.component_weights)
    with ordinality as u(food_id, weight, ord)
  join public.foods f on f.id = u.food_id
)
select archetype_id, slug, name, base_grams,
  round(sum(coalesce(energy_kj, 0)      * grams) / 100, 0) as energy_kj,
  round(sum(coalesce(protein_g, 0)      * grams) / 100, 1) as protein_g,
  round(sum(coalesce(carbohydrate_g, 0) * grams) / 100, 1) as carbohydrate_g,
  round(sum(coalesce(fat_total_g, 0)    * grams) / 100, 1) as fat_g,
  round(sum(coalesce(fibre_g, 0)        * grams) / 100, 1) as fibre_g
from c
group by archetype_id, slug, name, base_grams;

grant select on public.v_archetype_nutrients to authenticated;

-- ============ VERIFY ============
-- select n.slug, n.base_grams, n.energy_kj, n.protein_g, s.density_per_kj
--   from public.v_archetype_nutrients n
--   join public.v_archetype_scores s using (archetype_id)
--  order by n.energy_kj desc;
--   expect: eggs ~2,100 kJ / ~28 g protein; rice_protein ~2,600 kJ / ~35 g;
--           takeaway ~3,900 kJ; yogurt_snack ~600 kJ.
