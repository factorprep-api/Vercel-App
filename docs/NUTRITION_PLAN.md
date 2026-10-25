# Nutrition Pod — Developer Specification

**Version:** 1.0 (Draft for review)
**Status:** Architecture approved by product owner; scoring engine finalized; tier modifiers and archetype list pending
**Target stack:** Supabase (PostgreSQL) with Row Level Security, integrating with existing wellness, schedule, and medical pods

> **Read this first.** Sections 1–10 are the product owner's specification, reproduced verbatim. The shipped implementation (v1.8.2) deliberately departs from it in eight places, all recorded in [Implementation amendments](#implementation-amendments-v182) at the end of this file. Those deviations are decisions, not defects — read the register before "correcting" the code to match this spec.

## 1. Product Philosophy

The Nutrition Pod helps athletes optimize fueling around training load. Its core premise differs from conventional macro-tracking apps:

- **Nutrient density over macronutrients.** Food quality is measured by nutrient concentration, not protein/carb/fat ratios. Macronutrients are still tracked — they appear as their own informational metrics — but the quality axis is nutrient density.
- **Estimation, not measurement.** No gram weighing, no ingredient-level logging. Athletes log meals through three taps: archetype → quality tier → portion size.
- **Density is one good thing among several.** A high density score indicates a food worth including, alongside other goods (fibre, natural dietary fats, phytonutrients). The score is a comparative index, not a completeness claim.

### Guiding principles

- Simple for the athlete, insightful for the coach.
- Estimation-based with tolerance for approximation; precision is not the goal.
- Quality tiers distinguish wholesome from processed foods — the density score deliberately does not.

## 2. Data Sources

All food-composition data is imported statically into Postgres. No live third-party APIs at runtime (avoids rate limits, API-key exposure, and latency).

| Source | Contents | License / cost | Status |
|---|---|---|---|
| USDA FNDDS | US survey foods incl. mixed dishes / meals | Public domain (CC0) | To be downloaded |
| AUSNUT (FSANZ, latest release) | Australian foods, ~50+ nutrients per food | Free download | To be downloaded |
| Swiss Food Composition Database | European coverage | Commercial use permitted with attribution | Optional; to be downloaded |

> **Important:** The spreadsheet reviewed during design (dated, per-food AUSNUT export with computed concentration scores) served as the design reference only — it validated the scoring formula. The production dataset must be freshly downloaded from the sources above before implementation of the import pipeline. Its scores must not be copied into production tables.

### Dataset merge rules (to be confirmed at import time)

- Each source carries its own nutrient naming and units. A canonical nutrients dimension table maps every source nutrient to a canonical nutrient with a canonical unit.
- Where multiple sources cover the same food (e.g., FNDDS vs AUSNUT overlap), source precedence must be configured — suggested default: prefer the regional dataset matching the deployment audience, fall back to others.
- Serving rows (per-measure) are stored in portions; per-100 g values are the canonical storage basis.

## 3. Database Schema

New tables (in addition to existing `wellness_logs`, `session_logs`, `schedule_sessions`, etc.):

### 3.1 foods

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| source_id | text | Original food ID from source dataset (e.g., AUSNUT survey ID) |
| source | text enum | `'fndds'` / `'ausnut'` / `'swiss'` |
| name | text | Human-readable food name |
| food_category | text | From source dataset where available |
| is_archetype | boolean | True for curated archetype entries (§6) |
| active | boolean | Soft-delete / dataset versioning flag |

Unique constraint: `(source, source_id)`.

### 3.2 nutrients

Canonical nutrient dimension. One row per nutrient:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| key | text unique | e.g., `'vitamin_c'`, `'potassium'`, `'sat_fat_total'` |
| display_name | text | |
| unit | text enum | `'g'` / `'mg'` / `'ug'` |
| in_density_score | boolean | True for the 19 scoring nutrients (§4.2) |

### 3.3 food_nutrients

| Column | Type | Notes |
|---|---|---|
| food_id | uuid FK → foods | |
| nutrient_id | uuid FK → nutrients | |
| value_per_100g | numeric | Canonical storage basis; missing/unanalysed values stored as 0 (see §4.4) |

PK: `(food_id, nutrient_id)`.

### 3.4 portions

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| food_id | uuid FK → foods | |
| descriptor | text | e.g., 'cup', 'slice', 'bowl' |
| gram_weight | numeric | |
| source_of_measure | text | `'ausnut'` / `'imputed'` / `'custom'` |

### 3.5 meal_archetypes

Curated list (~50–150 rows initially) of the selectable meal options.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | Athlete-facing label (e.g., "Breakfast smoothie") |
| component_food_ids | uuid[] | Constituent foods from foods; weighted toward dominant ingredients |
| context_tags | text[] | e.g., 'breakfast', 'post-training', 'recovery', 'evening' |
| display_order | int | Curation control |

### 3.6 nutrition_logs

The transactional table — one row per logged meal. Anchored where possible to a `session_logs` save (see §7).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| athlete_id | uuid FK | |
| logged_at | timestamptz | |
| meal_slot | text enum | `'breakfast'` / `'lunch'` / `'dinner'` / `'snack'` / `'during_session'` / `'post_session'` |
| archetype_id | uuid FK → meal_archetypes | |
| quality_tier | text enum | `'processed'` / `'supermarket'` / `'fresh'` / `'local'` / `'homegrown'` (§5) |
| portion_size | text enum | `'small'` / `'normal'` / `'large'` |
| session_log_id | uuid FK → session_logs | Nullable; links post-session fueling |
| est_energy_kj | numeric | Populated at write time from derived archetype values |
| est_protein_g | numeric | Informational macro estimate |

### 3.7 quality_tier_modifiers

| Column | Type | Notes |
|---|---|---|
| tier | text PK | Matches `quality_tier` enum |
| score_multiplier | numeric | Pending product-owner definition (§5.2) |
| display_badge | text | UI badge label |

## 4. Scoring Engine

Two scores are computed per food, derived from the same `food_nutrients` rows via database views. Both are pure functions of stored data — no runtime computation in application code.

### 4.1 The 19 scoring nutrients

**Fatty acids (g):** saturated total, monounsaturated total, polyunsaturated total, linoleic acid (ω-6), alpha-linolenic acid (ALA, ω-3)
**Vitamins (mg):** thiamin, riboflavin, niacin equivalents, vitamin C, vitamin E
**Vitamins (µg):** folate total (not DFE), vitamin D
**Minerals (mg):** calcium, iron, magnesium, phosphorus, potassium, zinc
**Minerals (µg):** iodine

Deliberately excluded from the density score: sodium (scarce in athletic populations, heavily added to processed food — inclusion would corrupt tier separation), protein, total fat, carbohydrate, fibre (fibre is surfaced as its own informational metric), vitamin A, long-chain ω-3 EPA/DHA (see §9 — pending decision).

### 4.2 Raw concentration score (legacy score)

Plain arithmetic sum of the 19 nutrient values per 100 g, each in its native unit (g, mg, or µg as stored):

```
raw_score = Σ (value_per_100g[nutrient_i]) for i in 1..19
```

Verified against source spreadsheet during design phase:

- Cider, apple, non-alcoholic (per 100 g): `0.3 + 2 + 4 + 0.16 + 4 + 5 + 33 + 73 = 121.46` ✓
- Blackcurrant juice (per 100 g): fatty acids `0.44` + B vitamins `0.43` + vitamin C `171` + minerals `467.8` = `639.67` ✓

Known characteristics (accepted by design, not bugs): potassium, vitamin C, calcium, magnesium, and phosphorus dominate; µg-scale nutrients are near-invisible; summing across native units implicitly weights by unit scale. This score is kept as the supporting/detail metric and for continuity with the product owner's prior work.

### 4.3 Percentile density ranking (primary score)

For each of the 19 nutrients, compute each food's percentile rank against all active foods in the dataset:

```
PERCENT_RANK() OVER (PARTITION BY nutrient_id ORDER BY value_per_100g)
```

Then sum the 19 percentile values per food:

```
percentile_score = Σ percentile_rank[nutrient_i] for i in 1..19
```

Theoretical range: 0–19 (sum of 19 values each in [0, 1]). For display, either present as rank position ("Top 5% of foods for nutrient density") derived from the composite, or rescale to 0–100 (`percentile_score / 19 * 100`).

Rationale (product-owner decision): normalizes all 19 nutrients onto one scale without reliance on Recommended Daily Intakes, which the product owner considers unverifiable and potentially biased. Percentiles are computed entirely within the dataset — a food exceptional in trace nutrients competes fairly with one exceptional in minerals.

No cap parameter is required — each nutrient's contribution is bounded by construction at 1.0.

### 4.4 Missing values

Source datasets distinguish "not detected," "not analysed," and imputed values. Per product-owner decision: all missing values are stored and treated as 0. A known consequence (accepted): foods with unanalysed nutrients score marginally below otherwise-identical foods; the bias is roughly uniform and does not materially distort rankings.

### 4.5 Recalculation rule

Percentile ranks are meaningful only against a single consistent population. Therefore:

- Whenever the active foods / food_nutrients set changes (import, update, activation/deactivation), the entire percentile scoring view is recomputed across the full active dataset. No incremental/per-food percentile updates. Mixed-population percentiles are a correctness defect.

Implementation: materialized view refreshed by trigger on food-table changes, or a scheduled refresh job. All foods are always contemporaneously comparable.

### 4.6 Recommended views

- `v_food_scores` — `food_id`, `raw_score`, `percentile_score` (0–100), `rank_position`
- `v_archetype_scores` — `archetype_id`, aggregated scores (weighted mean of component foods), estimated energy/protein per `portion_size`
- `v_athlete_daily_nutrition` — per athlete/day rollup of logged meals: count by tier, average density score, estimated energy, meal-slot breakdown

Aggregation of logs should occur after tier multiplication (§5.2), not before.

## 5. Quality Tiers

### 5.1 Definition

Discrete picker (not a slider — sliders invite calibration drift between users). Five tiers, worst → best:

`processed` → `supermarket` → `fresh` → `local` → `homegrown`

Each maps to a stored modifier applied to the archetype's density score at log time.

### 5.2 Modifier values — ⚠️ OPEN DECISION

The tier concept is approved; specific multiplier values are not yet defined by the product owner. No regulatory or scientific basis exists for these numbers — they encode the product owner's professional judgment. Suggested starting scaffold for discussion (illustrative only):

| Tier | Suggested multiplier | Basis |
|---|---|---|
| processed | 0.6 | Added fats/sodium/sugars degrade nutrient bioavailability and add anti-quality factors |
| supermarket | 0.8 | Storage/transport time reduces freshness-linked nutrients |
| fresh | 1.0 | Reference point |
| local | 1.1 | Shorter farm-to-table interval |
| homegrown | 1.15 | Peak ripeness harvest, known provenance |

The developer should implement modifiers as data (`quality_tier_modifiers` table), not code constants, so the product owner can tune them without deploys.

### 5.3 Interaction with scores

Final per-log quality value = `archetype_percentile_score × tier_multiplier`. Stored or computed on read; recommend storing the resolved modifier at log time (snapshot) so later tuning of the tier table doesn't retroactively rewrite history.

## 6. Meal Archetypes — ⚠️ OPEN DECISION (initial list pending)

The first ~10 archetypes must be drafted by the product owner before the coder can seed `meal_archetypes`. Target initial dataset: 50–150 total, launched with a curated subset. Candidate structure per archetype:

- Athlete-facing name (plain language, no jargon)
- 2–6 component foods drawn from imported foods
- Context tags for smart-defaulting by time of day and session proximity

Suggested first drafts (for product owner to approve/edit): breakfast smoothie, oats/breakfast bowl, eggs breakfast, sandwich/lunch, rice-and-protein post-training meal, pasta dinner, salad, yogurt snack, recovery drink, takeaway/restaurant meal.

## 7. Integration With Existing Pods

### 7.1 Session-anchored logging (session_logs)

Primary entry point for post-training meals: when an athlete saves a session log, the UI offers a one-tap "What did you refuel with?" prompt. `nutrition_logs.session_log_id` carries the linkage. Goal: logging a meal should take <10 seconds.

### 7.2 Wellness pod (wellness_logs)

The existing nutrition slider in `wellness_logs` remains untouched for MVP. Roadmap: derive or correlate the slider against `nutrition_logs` density data to investigate replacing self-rated nutrition with logged reality.

### 7.3 Schedule pod (schedule_sessions) — planned-intake feedback loop

Scheduled sessions imply planned training load. The coach hub overlays:

- Planned intake (expected fueling given scheduled load — needs a load→fueling expectation function; ⚠️ open, even a coarse band model is acceptable for v1)
- Logged intake (density score and energy from `nutrition_logs`)
- Discrepancy flags: low density during high-load weeks, unfueled high-load sessions, tier degradation trends.

### 7.4 Coach hub visualization

Line/bar chart per athlete: rolling average nutrient density score overlaid on training load (sessions/week or duration). Correlation view between density trend and wellness pod metrics (sleep, soreness). Keep unit axes separate (density score is unitless; load is hours/RPE).

### 7.5 Weight handling

Bodyweight is an input for per-kg fueling estimates (energy, protein). It is a tunable variable: the app should adjust expectations when observed recovery/performance diverges from predictions, not assert a rigid per-kg target. Store weight history in the athlete profile; surface it in feedback-loop messaging softly.

### 7.6 Row Level Security

Follow existing project patterns:

- **Athletes:** full CRUD on their own `nutrition_logs`; read on `meal_archetypes`, `foods`, scoring views, `portions`.
- **Coaches/staff:** read access to `nutrition_logs` and derived views for athletes in their organization (same org-scoping predicate as existing pods).
- `foods`, `nutrients`, `food_nutrients`, `meal_archetypes`, `quality_tier_modifiers`: read-only to all authenticated app users; write restricted to service role (admin/ETL).

## 8. Build Sequence

| Phase | Deliverable | Depends on |
|---|---|---|
| 0 | Product owner downloads FNDDS + AUSNUT (+optional Swiss) datasets | — |
| 1 | Schema migration: tables, enums, RLS policies | This spec |
| 2 | ETL/import pipeline: source files → canonical nutrients → foods / food_nutrients / portions; source-precedence config | Phase 0 datasets |
| 3 | Scoring views: raw sum, percentile ranking, recomputation trigger | Phase 2 |
| 4 | Tier modifier seed + archetype seeding | Product owner inputs (§5.2, §6) |
| 5 | Athlete logging UI (3-tap flow), session-save hook | Phases 3–4 |
| 6 | Coach hub overlay, discrepancy flags | Phase 5 |
| 7 | Feedback loop: planned vs logged, weight-adjusted messaging | Phases 5–6 |

## 9. Open Decisions Register

| # | Decision | Owner | Status |
|---|---|---|---|
| 1 | Quality tier multiplier values | Product owner | **Resolved — 0.60 / 0.80 / 1.00 / 1.10 / 1.15**, seeded by `nutrition_archetypes_v1.9.0.sql` |
| 2 | Initial archetype list + component foods | Product owner | **Resolved — 10 archetypes / 39 components**, seeded by `nutrition_archetypes_v1.9.0.sql` |
| 3 | Load→fueling expectation model for planned-intake loop | Joint | Pending; coarse bands acceptable for v1 |
| 4 | Include long-chain ω-3 (EPA/DHA) in the 19? Currently excluded though present in source data | Product owner | Pending |
| 5 | Headline display format for percentile score (rank position vs 0–100 scale) | Product owner + UI | Pending |
| 6 | Dataset source precedence when foods overlap between FNDDS/AUSNUT/Swiss | Product owner | **Resolved: single global pool, no regional split** (see A6) |
| 7 | Fatty acids' role in raw score: currently included (they contribute negligibly at g-scale); remove for cleanliness or keep for fidelity? | Product owner | Pending; low priority |
| 8 | Replacement of wellness slider with logged nutrition data | Product owner | Roadmap, post-MVP |

## 10. Explicit Non-Goals (v1)

- Gram-level portion entry or recipe builder
- Barcode scanning
- Live third-party nutrient APIs
- Micronutrient adequacy claims ("this food provides X% of your needs") — the percentile score is presented strictly as a comparative index
- Social/sharing features

*Prepared from the architecture sessions conducted between the product owner (sports nutritionist) and Lumo. All formulas verified against the product owner's source spreadsheet during design (worked examples in §4.2).*

---

# Implementation amendments (v1.8.2)

The shipped system intentionally differs from the specification above. Each item states **what**, **why**, and **where**, so a future reader can tell a decision from a defect.

## A1. Wide `foods` table instead of normalised `nutrients` / `food_nutrients` / `portions` (§3.1–3.4)

**What:** One row per food with ~37 numeric columns (`thiamin_mg`, `calcium_mg`, …) plus `portion_label` / `portion_grams`. There is no `nutrients` dimension table, no `food_nutrients` long table, no `portions` table (each food carries a single default portion; the UI falls back to gram presets).

**Why:** The score is a column-wise operation — 17 window functions each ordering by one column. With a wide table Postgres reads it in a single scan; the long-table form needs 17 self-joins or a pivot. 9,365 × 19 is also small enough that normalisation buys nothing. Adding a nutrient is one `ALTER TABLE` plus one axis line.

**Where:** `src/databases/nutrition_pod_v1.8.0.sql` header; `scripts/nutrition_etl.mjs` (`FDC_NUTRIENT_MAP`, `AUSNUT_COL`).

## A2. 17 directional axes instead of §4.3's sum of 19 percentiles

**What:** Five fatty acids collapsed to three *quality* axes: saturated share of fat (lower better; `fat_total_g < 1` ⇒ axis absent), ALA (higher better), ω-6:ω-3 ratio (lower better). `percentile_score` = mean of present axis contributions × 100, not sum ÷ 19 × 100. Sodium, protein, carbohydrate, fibre, total fat and vitamin A never score.

**Why:** Summing raw fatty-acid grams rewards fat *quantity* — a stick of butter would outrank a lean fish on "quality". The product philosophy (§1) says the density score measures nutrient concentration and that tier handles processing; fat amount is informational.

**Where:** `v_food_scores` in both SQL files; `scripts/simulate_scores.mjs` (`AXES`).

## A3. Available case replaces §4.4 "missing = 0"

**What:** A food is scored only on the axes it reports. Per-axis `CASE` guard ⇒ NULL contribution; `percentile_score` is the mean over non-null contributions; `score_axes` exposes how many axes were used. NULL only if a food reports zero axes (none currently do).

**Why:** Measured coverage on the shipped data: 13 of 14 vitamin/mineral axes at 100%, iodine 39.8% (AUSNUT only), saturated share 78.3%, ω-6:ω-3 78.1%. The three fat axes are *undefined* for low-fat foods, not "bad", and 2,032 foods legitimately score on fewer than 16 axes. Padding those with 0 (or 50) would be a fabricated judgement.

**Where:** `v_food_scores`; UI shows `Score 62 · 16/17`.

## A4. Per-axis denominators are `count(col) OVER ()`, not table size

**What:** Each axis is ranked against the foods that report it, not all 9,365.

**Why:** Iodine exists just in AUSNUT. Dividing its ranks by 9,365 gave the best AUSNUT food an iodine rank of `1/9365` but the worst only `3741/9365`, compressing every AUSNUT iodine contribution into a 60–100 band and penalising US foods for a nutrient FNDDS never analyses. This is a correctness fix, not a preference.

**Where:** the `ranked` CTE.

## A5. `raw_score` is view-only

**What:** Computed in `v_food_scores`, exposed to `scripts/debug_scores.mjs` and `scripts/simulate_scores.mjs`, never sent to the browser.

**Why:** §4.2 keeps it for continuity and audit, but it is not comparable between foods — native units are mixed, so potassium/phosphorus/calcium dominate, and linoleic/ALA are double-counted inside total polyunsaturated fat. Sending it to the client invites someone to display it.

**Where:** `src/api.js` header comment; §4.2 above.

## A6. One global pool — §9.6 resolved (no regional split)

**What:** Percentiles rank across the union of all sources (9,365 = 5,624 FNDDS + 3,741 AUSNUT), regardless of source. Source precedence is not applied and duplicates are not merged.

**Why:** The app serves athletes in many countries; a single comparable pool avoids "top 5% of what?" ambiguity and keeps one food list for search. AUSNUT was chosen for its mixed-dish/meal depth, FNDDS for US coverage.

**Consequence:** "Top X% of foods" means top of the *global union*, not of a national database — UI copy must not imply otherwise.

**Known cross-source bias:** FNDDS carries only nutrient `406` (preformed niacin); `407`, `409` and `501` have **zero rows** in the survey CSV, while AUSNUT column 35 reports niacin *equivalents*. US foods are therefore scored on a lower bound for that one axis (≤ ~5.9 points, concentrated in meat/dairy/egg). Not synthesised from protein — that would be inventing data. Fixing it properly means importing tryptophan for the same `fdc_id`s from USDA Foundation/SR-Legacy.

**Where:** §9.6 above; ETL `FDC_NUTRIENT_MAP` comment.

## A7. §4.5 recompute is an explicit call, not a trigger

**What:** `refresh materialized view public.v_food_scores` wrapped in `public.refresh_nutrition_scores()`, invoked by the ETL after each successful import (via RPC). No trigger on `foods`.

**Why:** §4.5 permits "a scheduled refresh job". A row trigger would fire 9,365 times per import and refresh a 9,365-row aggregate each time.

**Operational rule:** after *any* change to `foods`, call `select public.refresh_nutrition_scores();`. Imports do this automatically.

## A8. Denormalised `nutrition_logs.items` (§3.6)

**What:** `nutrition_logs` is `(athlete_id, entry_date, session_log_id, items jsonb, notes)` — one row per athlete per day, with `items` an array of `{food_id, grams, name, portionLabel, kj100, protein100, carbs100, fat100, fibre100, percentileScore, scoreAxes}`.

**Why:** Daily totals then need zero joins and no server round-trip (§1 "fast"). Each item snapshots the score at log time, so re-scoring the reference data never rewrites history — the same intent as §5.3's multiplier snapshot.

**Not yet built:** `meal_slot`, `archetype_id`, `quality_tier`, `portion_size`, `est_energy_kj` — these arrive with §5/§6 (see A9). `entry_date` replaces `logged_at` so logs sit on the athlete's local calendar day.

## A9. Not implemented yet (tracked, not forgotten)

| Spec | Status |
|---|---|
| §5 quality tiers + §5.2 multipliers | **Seeded** in `nutrition_archetypes_v1.9.0.sql` as data (`quality_tier_modifiers`) + `portion_size_scalars`. Picker UI and snapshot-on-log not built. |
| §6 meal archetypes (the 3-tap flow) | **Seeded**: 10 archetypes, 39 components resolved to real `food_id`s, plus `v_archetype_scores`. Picker UI not built; interim fast path is favourites + recents. |
| §7.1 "What did you refuel with?" prompt | Column + API parameter exist; no UI calls it. |
| §7.3 planned-vs-logged | Blocked on §9.3 (band model). |
| §7.4 coach density-vs-load chart | Not built. |
| §7.5 weight-adjusted messaging | Not built. |
| §4.6 `v_archetype_scores`, `v_athlete_daily_nutrition` | Not built. Athlete rollups **must not** be materialized views — matviews bypass RLS. Use a `security_invoker` view. |
| §9.4 EPA/DHA (AUSNUT cols 54–56, plus total LC ω-3 col 58) | Data already downloaded; excluded per spec until the owner decides. |

## A10. Two density measures — per 100 g and per kJ

**What:** `v_food_scores` exposes two independent density scores over the same 17 axes:

| Column | Denominator | Question |
|---|---|---|
| `percentile_score` (primary) | per 100 g | "per portion of food, what do I get?" |
| `density_per_kj` | per kJ | "per calorie of energy budget, how much micronutrition?" |

`score_axes_kj` accompanies the second, mirroring `score_axes`. Both use the same directional percentile method and the same available-case averaging; only the denominator differs. Foods with no energy value (43 of 9,336) get `density_per_kj = NULL`.

**Why both:** they are complementary and both true. Across 9,293 foods the correlation is only **r = 0.49**, so this is not a rescaling. Per 100 g favours dry, energy-dense food (pizza 66, lettuce 37); per kJ favours nutrient-per-calorie (lettuce 81, pizza 58). An athlete eating a fixed weight and an athlete eating a fixed energy budget are asking different questions, and the body spends energy while the shop sells grams.

**Known trade-off:** per kJ *narrows* the processed-vs-homemade gap — lasagne homemade vs ready meal is 19.8 points apart per 100 g but only 4.5 apart per kJ, because processed meals are energy-dense and often fortified. Neither measure is "meal quality": processing is the tier multiplier's job (§5) and fueling adequacy is energy + protein per portion.

**Status:** per 100 g is displayed as the headline badge; per kJ is shown alongside (tooltip + detail line) and in `v_archetype_scores`. Evaluate against real athlete data before deciding whether to swap their prominence.

**Where:** `nutrition_scores_v1.9.1.sql`; `v_archetype_scores` in `nutrition_archetypes_v1.9.0.sql`; `scripts/simulate_scores.mjs --compare`.

---

# Verification

Two independent implementations of the scoring must agree.

```bash
node scripts/simulate_scores.mjs
```

That reads the local datasets, applies the same rules as the view, and writes nothing. Expected distribution, which matches the live database exactly:

| Metric | Value |
|---|---|
| foods | 9,336 (5,624 FNDDS + 3,712 AUSNUT) |
| unscored (`percentile_score` NULL) | 0 |
| axes 17 / 16 / <16 | 2,756 / 4,548 / 2,032 |
| mean score | 51.68 |

Live cross-check (after the v1.9 additive prune below):

```sql
select
  count(*) filter (where percentile_score is null) as null_scores,
  count(*) filter (where score_axes = 17)          as axes_17,
  count(*) filter (where score_axes = 16)          as axes_16,
  count(*) filter (where score_axes < 16)          as axes_lt_16,
  round(avg(percentile_score), 2)                  as mean_score
from public.v_food_scores;
```

# Known data issues

**AUSNUT additive records — excluded in v1.9.** 29 records in `Other additives` (9), `Intense sweeteners` (13), `Chemical raising agents and cooking ingredients` (5) and `Fibre supplements` (2) imported as nutrient isolates (`Protein`, `Thiamin`, `Vitamin C`, `Folic acid`) or kitchen chemicals (`Baking soda`, sweetener tablets). They clustered at both extremes — `Vegetable powder` scored 93.66 — and polluted search. `scripts/nutrition_etl.mjs` now skips those four categories (`AUSNUT_NON_FOOD_CATEGORIES`), so the ranking population and the browsable list stay the same set (§4.5). Existing rows need a one-off delete:

```sql
delete from public.foods
where source = 'AUSNUT'
  and btrim(category) in ('Other additives', 'Intense sweeteners',
                          'Chemical raising agents and cooking ingredients',
                          'Fibre supplements');
select public.refresh_nutrition_scores();
```

Expected: `DELETE 29`, then the population drops 9,365 → 9,336.

**Still a product decision — supplement powder dominance.** With the additives gone, the top 10 is still all supplement, meal-replacement and baby-cereal powders (`Nutritional powder mix, high protein`, `Oral supplement powder`, `Protein powder, plant based`, `Meal replacement powder`). Those are real products with real nutrient content and legitimate post-training use, so they were deliberately **not** removed. But if the browser is to present *meals*, the owner must decide whether they belong in the picker or in a separate "supplements" section.

**One leftover reference row.** `Ethanol 100%` (`29505004`) sits in `Other alcoholic beverages` — a real food category — so a category filter can't drop it without dropping actual drinks. It is a recipe-derivation reference row, scores 11.28, and is only findable by searching "ethanol".

**§4.2 worked examples are design-time only.** §2 forbids copying the design spreadsheet into production, so the ETL gates are locked to values computed from the shipped datasets. The cider example is provably the pear/perry row of an earlier AUSNUT release: seven of nine terms reproduce to the cent, and `121.46 − 4.0 (vitC) + 0.5 (iodine) = 117.96` in AUSNUT 2023. The blackcurrant example (639.67) reproduces no AUSNUT 2023 row at all (nearest: cordial base 144.55, fresh currant 534.17).

---

# Archetype resolution (v1.9.0)

Built from the owner's **Tier Seeds & Archetype Worksheet v1.0** by two scripts, so the mapping is reproducible and auditable rather than hand-typed into SQL:

```bash
node scripts/resolve_archetypes.mjs    # descriptions → real food_id UUIDs, writes data/archetype_resolution.json
node scripts/emit_archetype_seed.mjs   # that JSON → the seed block in nutrition_archetypes_v1.9.0.sql
```

`resolve_archetypes.mjs` reads `data/foods_live.json` (a snapshot of `public.foods`: id, source, source_code, description, category), applies the worksheet's Part 3 rules — one record per component, generic over branded, AUSNUT generic over FNDDS, raw/plain over prepared — and prints the chosen row for every component. Any component it cannot resolve, or can only resolve by falling back off its first (most specific) pattern, is emitted as an exception with the top three candidates and **never** seeded.

**Result: 39/39 components resolved, 0 fallbacks.** Seeded: 10 archetypes, 39 components, plus `v_archetype_scores` (weighted mean of component percentile scores).

## Resolution decisions worth a second look

These are consequences of the worksheet's own "one record per component" rule, where the worksheet offered alternatives. They are flagged rather than silently chosen:

| Component | Seeded as | Note |
|---|---|---|
| Salad → "Tomato and cucumber" (w2) | `Tomato, common, raw` | Only the tomato half; cucumber is a separate component waiting to be added (split as w1 + w1). |
| Eggs → "Tomato **and/or** spinach" (w1) | `Tomato, common, raw` | The "or" is a genuine either/or; seeded as tomato. |
| Salad → "Legumes **or** feta" (w1) | `Chickpea, dried, boiled…` | Seeded as chickpeas (the plant default). |
| Takeaway → "Pizza **or** burger" (w3) | `Pizza with cheese and extra vegetables, medium crust` | The worksheet calls this the broadest archetype; seeded as pizza. A burger variant would be an eleventh archetype. |
| Recovery Drink (w3 + w2) | Chocolate milk + sports drink | The worksheet says the components are **alternatives, not co-consumed**, and suggests a two-variant archetype. They are seeded as two weighted components, which reads as co-consumption. Needs an owner call before the picker ships. |

**Rule 4 stands:** do not re-resolve these silently after a dataset import. Re-run the scripts, diff `data/archetype_resolution.json`, and let the owner approve changes.








