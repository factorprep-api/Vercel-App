-- =====================================================================
-- FactorPrep v1.9.0 — QUALITY TIERS, PORTION SCALARS, MEAL ARCHETYPES
-- (paste into Supabase SQL Editor; idempotent, safe to re-run)
--
-- Seeds the three data sets the product owner signed off in the
-- "Tier Seeds & Archetype Worksheet v1.0":
--
--   1. quality_tier_modifiers  — resolves §9.1 (five multipliers)
--   2. portion_size_scalars    — resolves the worksheet's Part 4
--   3. meal_archetypes         — resolves §9.2 (ten archetypes, 39
--                                components resolved to real food_id
--                                UUIDs by scripts/resolve_archetypes.mjs)
--
-- All three are DATA, not code: the owner tunes them without a deploy.
-- Reference data only — no athlete rows here, so RLS is read-only for
-- authenticated users and writes happen via the service role.
--
-- The component ids below are snapshots. Per worksheet Part 3 rule 4 they
-- are owner-curated and must NOT be silently re-resolved on a later
-- dataset import: re-run scripts/resolve_archetypes.mjs and review the
-- diff instead.
-- =====================================================================

-- ============ 1. QUALITY TIER MODIFIERS (§5.2) ============
-- Uneven spacing is deliberate: leverage sits at the bottom of the scale,
-- because the tier's job is to counter density scores that processed food
-- inflates through fortification and concentration. fresh = 1.00 is the
-- reference point. Revisit after launch using observed athlete data —
-- §5.3 snapshots the resolved multiplier on the log row, so tuning never
-- rewrites history.
create table if not exists public.quality_tier_modifiers (
  tier text primary key
    check (tier in ('processed', 'supermarket', 'fresh', 'local', 'homegrown')),
  score_multiplier numeric not null check (score_multiplier > 0),
  display_badge text not null,
  updated_at timestamptz not null default now()
);

insert into public.quality_tier_modifiers (tier, score_multiplier, display_badge) values
  ('processed',   0.60, 'Processed'),
  ('supermarket', 0.80, 'Supermarket'),
  ('fresh',       1.00, 'Fresh'),
  ('local',       1.10, 'Local'),
  ('homegrown',   1.15, 'Homegrown')
on conflict (tier) do update
  set score_multiplier = excluded.score_multiplier,
      display_badge = excluded.display_badge,
      updated_at = now();

-- ============ 2. PORTION SIZE SCALARS (worksheet Part 4) ============
-- Multipliers applied to the archetype's per-portion nutrient values.
-- Snapshot the resolved scalar on the log row, same treatment as §5.3.
create table if not exists public.portion_size_scalars (
  portion_size text primary key check (portion_size in ('small', 'normal', 'large')),
  multiplier numeric not null check (multiplier > 0),
  updated_at timestamptz not null default now()
);

insert into public.portion_size_scalars (portion_size, multiplier) values
  ('small',  0.60),
  ('normal', 1.00),
  ('large',  1.40)
on conflict (portion_size) do update
  set multiplier = excluded.multiplier,
      updated_at = now();

-- ============ 3. MEAL ARCHETYPES (§6) ============
-- component_food_ids / component_weights / component_labels are parallel
-- arrays in the same order. The spec (§3.5) defines only the uuid[]; the
-- weights and labels are additions so the UI can render "Banana, raw ×2"
-- without re-resolving, and so v_archetype_scores can weight components.
create table if not exists public.meal_archetypes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  component_food_ids uuid[] not null default '{}',
  component_weights numeric[] not null default '{}',
  component_labels text[] not null default '{}',
  meal_slots text[] not null default '{}',
  context_tags text[] not null default '{}',
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint archetype_arrays_aligned check (
    cardinality(component_food_ids) = cardinality(component_weights)
    and cardinality(component_food_ids) = cardinality(component_labels)
  )
);

-- Ten launch archetypes. Component order matches across the three arrays.
insert into public.meal_archetypes
  (slug, name, component_food_ids, component_weights, component_labels,
   meal_slots, context_tags, display_order, active)
values
  ('breakfast_smoothie', 'Breakfast Smoothie',
   array['5521a445-5f8c-495c-8474-250309b780b2'::uuid, 'e382dfc4-ed40-4a23-9cb9-2fb7b3744db7'::uuid, 'b0e85f1d-f67f-4c89-a08c-c2d323f749c1'::uuid, 'ed40fc98-8e6e-4ee0-a1ec-64a040abff85'::uuid, 'e79902b6-f2f8-49a5-9837-aea4e1bdfe7f'::uuid],
   array[2, 2, 3, 1, 1]::numeric[],
   array['Banana, raw', 'Berries (mixed)', 'Milk', 'Yogurt (plain)', 'Rolled oats, dry'],
   array['breakfast', 'snack', 'post_session'],
   array['breakfast', 'post-training', 'recovery', 'quick'],
   1, true),
  ('oats_bowl', 'Oats Breakfast Bowl',
   array['e79902b6-f2f8-49a5-9837-aea4e1bdfe7f'::uuid, 'b0e85f1d-f67f-4c89-a08c-c2d323f749c1'::uuid, '5521a445-5f8c-495c-8474-250309b780b2'::uuid, '73df0dc8-fd34-4b85-82b0-23ef9340f179'::uuid],
   array[3, 2, 1, 1]::numeric[],
   array['Rolled oats, dry', 'Milk', 'Fruit (banana or apple)', 'Nuts and/or seeds'],
   array['breakfast'],
   array['breakfast', 'slow-release', 'high-fibre'],
   2, true),
  ('eggs_breakfast', 'Eggs Breakfast',
   array['8a2cf9cc-97e4-454b-ab31-9cc53ce866fc'::uuid, '1736f5cc-6b89-4fac-9691-b43ff3173d09'::uuid, 'dd4e3215-4129-4476-a203-51788b02a04b'::uuid, 'e9098298-963d-4f72-93e2-6e91e2bdb3c7'::uuid],
   array[3, 2, 1, 1]::numeric[],
   array['Eggs (whole)', 'Wholegrain bread', 'Tomato and/or spinach', 'Avocado'],
   array['breakfast'],
   array['breakfast', 'high-protein'],
   3, true),
  ('sandwich_lunch', 'Sandwich / Lunch Wrap',
   array['1736f5cc-6b89-4fac-9691-b43ff3173d09'::uuid, 'c747b070-9e51-40e2-b56f-4da5186a8895'::uuid, '82a47d72-fc85-45b7-9f68-3f179897a425'::uuid, '13d8ab4c-9386-47b6-9520-6050ba263b79'::uuid],
   array[3, 2, 1, 1]::numeric[],
   array['Wholegrain bread', 'Chicken (cooked, skinless)', 'Cheese (cheddar)', 'Salad vegetables'],
   array['lunch'],
   array['lunch', 'portable', 'high-protein'],
   4, true),
  ('rice_protein', 'Rice & Protein (Post-Training)',
   array['e4512a08-0c57-444c-8bf0-a0f6c714314f'::uuid, 'c747b070-9e51-40e2-b56f-4da5186a8895'::uuid, 'f1d2b128-359e-45e5-9a17-cc1ee2ad3b0c'::uuid, 'fd340bef-faf7-4fd2-b3a6-5b43a45bebaf'::uuid],
   array[3, 2, 2, 1]::numeric[],
   array['White rice, cooked', 'Chicken breast (cooked)', 'Mixed vegetables', 'Olive oil'],
   array['lunch', 'dinner', 'post_session'],
   array['post-training', 'recovery', 'high-carb'],
   5, true),
  ('pasta_dinner', 'Pasta Dinner',
   array['691a375f-c6ca-4c85-8e2a-fa75437d9353'::uuid, '9d3599ac-0f3d-48f9-8d13-8402420d9f0c'::uuid, '948f6064-c47e-4bae-a3b6-c81f45fd455f'::uuid, 'f1d2b128-359e-45e5-9a17-cc1ee2ad3b0c'::uuid, 'fd340bef-faf7-4fd2-b3a6-5b43a45bebaf'::uuid],
   array[3, 2, 1, 1, 1]::numeric[],
   array['Pasta (white, cooked)', 'Meat sauce or mince (beef)', 'Tomato-based sauce', 'Mixed vegetables', 'Olive oil'],
   array['dinner'],
   array['dinner', 'high-carb', 'pre-heavy-day'],
   6, true),
  ('salad_meal', 'Salad (Meal)',
   array['13d8ab4c-9386-47b6-9520-6050ba263b79'::uuid, 'dd4e3215-4129-4476-a203-51788b02a04b'::uuid, '7d290f51-b9d4-477f-8a35-01ffa9f1fe92'::uuid, 'c747b070-9e51-40e2-b56f-4da5186a8895'::uuid, 'fd340bef-faf7-4fd2-b3a6-5b43a45bebaf'::uuid],
   array[3, 2, 1, 1, 1]::numeric[],
   array['Leafy greens', 'Tomato and cucumber', 'Legumes or feta', 'Chicken breast', 'Olive oil dressing'],
   array['lunch', 'dinner'],
   array['light', 'high-fibre', 'rest-day'],
   7, true),
  ('yogurt_snack', 'Yogurt Snack',
   array['ed40fc98-8e6e-4ee0-a1ec-64a040abff85'::uuid, 'f979be17-d32e-4b1c-b03e-593a50c84e0e'::uuid, '61b42451-b86d-42ed-94e1-5702c5dddd75'::uuid],
   array[3, 2, 1]::numeric[],
   array['Yogurt (plain)', 'Fruit', 'Granola / muesli / nuts'],
   array['snack', 'breakfast'],
   array['snack', 'high-protein', 'recovery'],
   8, true),
  ('recovery_drink', 'Recovery Drink',
   array['75413d68-e984-418e-959e-80115d5a3ef0'::uuid, '222f60fd-50ac-4713-8bbb-13b998831b0b'::uuid],
   array[3, 2]::numeric[],
   array['Flavoured milk', 'Sports / electrolyte drink'],
   array['during_session', 'post_session'],
   array['post-training', 'quick', 'portable'],
   9, true),
  ('takeaway_meal', 'Takeaway / Restaurant Meal',
   array['94e2a285-8e0e-4027-842a-8e350153234f'::uuid, '3eaf750e-a526-494e-aeb1-4b98da87ae8c'::uuid, '5075e626-55bc-4a84-bed1-a9de6e5dfa66'::uuid],
   array[3, 2, 2]::numeric[],
   array['Pizza or burger', 'Fried side (chips)', 'Fried chicken or takeaway dish'],
   array['lunch', 'dinner'],
   array['low-quality-flag', 'social', 'travel'],
   10, true)
on conflict (slug) do update set
  name = excluded.name,
  component_food_ids = excluded.component_food_ids,
  component_weights = excluded.component_weights,
  component_labels = excluded.component_labels,
  meal_slots = excluded.meal_slots,
  context_tags = excluded.context_tags,
  display_order = excluded.display_order;
-- `active` is deliberately NOT overwritten: an archetype the owner has
-- switched off must stay off across re-seeds.

-- ============ 4. ARCHETYPE SCORES (plan §4.6) ============
-- Weighted mean of the component foods' percentile scores using the same
-- weights as the archetype. Components not yet scored are skipped and
-- counted, so an archetype with an unscored component reports honestly
-- instead of quietly scoring low.
create or replace view public.v_archetype_scores as
with comp as (
  select a.id as archetype_id, a.slug, a.name, a.display_order,
         u.food_id, u.weight, s.percentile_score
  from public.meal_archetypes a
  cross join lateral unnest(a.component_food_ids, a.component_weights)
    as u(food_id, weight)
  left join public.v_food_scores s on s.id = u.food_id
)
select archetype_id, slug, name, display_order,
  round(sum(percentile_score * weight)
        / nullif(sum(weight) filter (where percentile_score is not null), 0), 2)
    as percentile_score,
  count(*)                as component_count,
  count(percentile_score) as scored_components,
  round(sum(weight), 2)   as total_weight
from comp
group by archetype_id, slug, name, display_order;

grant select on public.v_archetype_scores to authenticated;

-- ============ 5. RLS (reference data: read-only) ============
alter table public.quality_tier_modifiers enable row level security;
alter table public.portion_size_scalars enable row level security;
alter table public.meal_archetypes      enable row level security;

drop policy if exists qtm_select on public.quality_tier_modifiers;
create policy qtm_select on public.quality_tier_modifiers for select
  using (auth.role() = 'authenticated');

drop policy if exists pss_select on public.portion_size_scalars;
create policy pss_select on public.portion_size_scalars for select
  using (auth.role() = 'authenticated');

drop policy if exists ma_select on public.meal_archetypes;
create policy ma_select on public.meal_archetypes for select
  using (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies: these tables are written only by the
-- service role (SQL editor / seeding scripts), exactly like public.foods.

-- ============ 6. VERIFY ============
-- select * from public.quality_tier_modifiers order by score_multiplier;
--   expect 5 rows: 0.60 / 0.80 / 1.00 / 1.10 / 1.15
-- select * from public.portion_size_scalars;
--   expect 3 rows: 0.60 / 1.00 / 1.40
-- select slug, name, cardinality(component_food_ids) as n,
--        percentile_score, component_count, scored_components
--   from public.v_archetype_scores order by display_order;
--   expect 10 archetypes, n = 2..5, and scored_components = component_count
--
-- Integrity: every component id must still exist in foods.
-- select a.slug, u.food_id
--   from public.meal_archetypes a
--   cross join lateral unnest(a.component_food_ids) as u(food_id)
--   left join public.foods f on f.id = u.food_id
--  where f.id is null;   -- must return 0 rows
