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

-- The ten archetype rows are seeded by SCRIPT, not pasted here:
--   node scripts/seed_archetypes.mjs
-- Long uuid[] literals were mangled by the SQL editor's paste buffer twice
-- already; the script upserts the same rows over PostgREST (service role),
-- is idempotent on slug, and never overwrites `active`.

-- ============ 4. ARCHETYPE SCORES (plan §4.6) ============
-- Weighted mean of the component foods' percentile scores using the same
-- weights as the archetype. Components not yet scored are skipped and
-- counted, so an archetype with an unscored component reports honestly
-- instead of quietly scoring low.
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
