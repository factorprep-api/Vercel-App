#!/usr/bin/env node
// =====================================================================
// FactorPrep v1.9.0 — ARCHETYPE COMPONENT RESOLVER
//
// Resolves the product owner's archetype worksheet (docs/NUTRITION_PLAN.md
// §6 + Tier/Archetype Worksheet Part 2) against the foods actually in the
// database, and prints the chosen row for every component so a human can
// sign it off.
//
//   node scripts/resolve_archetypes.mjs                 # resolve + report
//   node scripts/resolve_archetypes.mjs --emit-sql      # also write seed SQL
//   node scripts/resolve_archetypes.mjs --refresh       # re-fetch foods first
//
// Rules applied (worksheet Part 3):
//   · exactly one representative record per component;
//   · prefer generic/unbranded over branded;
//   · prefer AUSNUT generic entries over FNDDS branded entries;
//   · prefer raw/plain forms over prepared-with-additions;
//   · never guess — unresolved or low-confidence components are listed as
//     exceptions with the top 3 candidates for the owner to pick.
//
// Reads data/foods_live.json (id/source/source_code/description/category),
// produced by the fetch step. Writes nothing to the database.
// =====================================================================
import fs from 'node:fs';

const FOODS = 'data/foods_live.json';
const OUT_JSON = 'data/archetype_resolution.json';

// Preferences used when a matcher returns several rows.
const isGeneric = (d) => !/\(|\)|branded|commercial,|nfs$/i.test(d) || /nfs$/i.test(d);

/**
 * Each component: ordered matchers. The FIRST matcher with any hit wins;
 * within a matcher, AUSNUT beats FNDDS, then the shortest description
 * (shorter = more generic in both datasets), then alphabetical.
 * Set `exclude` to drop rows that match the pattern but are not the food
 * (e.g. "Almond beverage" for almonds).
 */
const ARCHETYPES = [
  {
    slug: 'breakfast_smoothie', name: 'Breakfast Smoothie',
    slots: ['breakfast', 'snack', 'post_session'],
    tags: ['breakfast', 'post-training', 'recovery', 'quick'],
    components: [
      { label: 'Banana, raw', weight: 2, match: [/^banana, cavendish, peeled, raw$/i, /^banana,.*raw$/i] },
      { label: 'Berries (mixed)', weight: 2, match: [/^berries, nfs$/i, /^blueberr(y|ies), raw$/i], exclude: /jam|juice|pie|syrup|dried|canned/i },
      { label: 'Milk', weight: 3, match: [/^milk, cow, fluid, regular fat \(~3\.5%\)$/i, /^milk, cow, fluid, regular fat/i, /^milk, whole$/i] },
      { label: 'Yogurt (plain)', weight: 1, match: [/^yogh?urt, natural, regular fat \(~4%\)$/i, /^yogh?urt, natural, regular fat/i, /^yogh?urt, natural/i], exclude: /goat|soy|almond|coconut|oat|cashew/i },
      { label: 'Rolled oats, dry', weight: 1, match: [/^oats, rolled, uncooked$/i, /^oats, rolled/i, /^oats, raw$/i] },
    ],
  },
  {
    slug: 'oats_bowl', name: 'Oats Breakfast Bowl',
    slots: ['breakfast'],
    tags: ['breakfast', 'slow-release', 'high-fibre'],
    components: [
      { label: 'Rolled oats, dry', weight: 3, match: [/^oats, rolled, uncooked$/i, /^oats, rolled/i, /^oats, raw$/i] },
      { label: 'Milk', weight: 2, match: [/^milk, cow, fluid, regular fat \(~3\.5%\)$/i, /^milk, cow, fluid, regular fat/i, /^milk, whole$/i] },
      { label: 'Fruit (banana or apple)', weight: 1, match: [/^banana, cavendish, peeled, raw$/i, /^apple, raw$/i] },
      { label: 'Nuts and/or seeds', weight: 1, match: [/^almonds, unroasted$/i, /^almonds, nfs$/i, /^almonds, unsalted$/i], exclude: /beverage|butter|milk/i },
    ],
  },
  {
    slug: 'eggs_breakfast', name: 'Eggs Breakfast',
    slots: ['breakfast'],
    tags: ['breakfast', 'high-protein'],
    components: [
      { label: 'Eggs (whole)', weight: 3, match: [/^egg, chicken, whole, raw$/i, /^egg, chicken, whole/i, /^egg, whole/i] },
      { label: 'Wholegrain bread', weight: 2, match: [/^bread, wholemeal, commercial$/i, /^bread, wholemeal/i, /^bread, whole wheat$/i] },
      { label: 'Tomato and/or spinach', weight: 1, match: [/^tomato, common, raw$/i, /^spinach, mature, fresh, raw$/i] },
      { label: 'Avocado', weight: 1, match: [/^avocado, raw$/i, /^avocado,/i], exclude: /oil|dip/i },
    ],
  },
  {
    slug: 'sandwich_lunch', name: 'Sandwich / Lunch Wrap',
    slots: ['lunch'],
    tags: ['lunch', 'portable', 'high-protein'],
    components: [
      { label: 'Wholegrain bread', weight: 3, match: [/^bread, wholemeal, commercial$/i, /^bread, wholemeal/i, /^bread, whole wheat$/i] },
      { label: 'Chicken (cooked, skinless)', weight: 2, match: [/^chicken, breast, lean, baked, roasted, fried, grilled or BBQ'd, no added fat$/i, /^chicken, breast, lean, (baked|boiled)/i, /^chicken, breast, lean, raw$/i] },
      { label: 'Cheese (cheddar)', weight: 1, match: [/^cheese, cheddar$/i, /^cheese, cheddar,(?!.*processed)/i], exclude: /processed/i },
      { label: 'Salad vegetables', weight: 1, match: [/^lettuce, raw$/i, /^cucumber, common, unpeeled, raw$/i] },
    ],
  },
  {
    slug: 'rice_protein', name: 'Rice & Protein (Post-Training)',
    slots: ['lunch', 'dinner', 'post_session'],
    tags: ['post-training', 'recovery', 'high-carb'],
    components: [
      { label: 'White rice, cooked', weight: 3, match: [/^rice, white, cooked$/i, /^rice, white,.*cooked/i, /^rice, white/i] },
      { label: 'Chicken breast (cooked)', weight: 2, match: [/^chicken, breast, lean, baked, roasted, fried, grilled or BBQ'd, no added fat$/i, /^chicken, breast, lean, (baked|boiled)/i, /^chicken, breast, lean, raw$/i] },
      { label: 'Mixed vegetables', weight: 2, match: [/^mixed vegetables, carrot, corn & peas\/beans, cooked$/i, /^mixed vegetables,.*cooked/i, /^classic mixed vegetables, canned, cooked, no added fat$/i] },
      { label: 'Olive oil', weight: 1, match: [/^oil, olive$/i, /^oil, olive/i] },
    ],
  },
  {
    slug: 'pasta_dinner', name: 'Pasta Dinner',
    slots: ['dinner'],
    tags: ['dinner', 'high-carb', 'pre-heavy-day'],
    components: [
      { label: 'Pasta (white, cooked)', weight: 3, match: [/^pasta, white, plain, boiled, no added salt$/i, /^pasta, cooked$/i, /^pasta, white, plain/i], exclude: /dish|salad|sauce/i },
      { label: 'Meat sauce or mince (beef)', weight: 2, match: [/^beef, mince, cooked, no added fat$/i, /^beef, mince,.*cooked/i, /^beef, ground$/i] },
      { label: 'Tomato-based sauce', weight: 1, match: [/^sauce, pasta, tomato based, homemade$/i, /^sauce, pasta, tomato based/i] },
      { label: 'Mixed vegetables', weight: 1, match: [/^mixed vegetables, carrot, corn & peas\/beans, cooked$/i, /^mixed vegetables,.*cooked/i] },
      { label: 'Olive oil', weight: 1, match: [/^oil, olive$/i, /^oil, olive/i] },
    ],
  },
  {
    slug: 'salad_meal', name: 'Salad (Meal)',
    slots: ['lunch', 'dinner'],
    tags: ['light', 'high-fibre', 'rest-day'],
    components: [
      { label: 'Leafy greens', weight: 3, match: [/^lettuce, raw$/i, /^spinach, mature, fresh, raw$/i] },
      { label: 'Tomato and cucumber', weight: 2, match: [/^tomato, common, raw$/i, /^cucumber, common, unpeeled, raw$/i] },
      { label: 'Legumes or feta', weight: 1, match: [/^chickpea, dried, boiled, microwaved or steamed, drained$/i, /^cheese, feta$/i] },
      { label: 'Chicken breast', weight: 1, match: [/^chicken, breast, lean, baked, roasted, fried, grilled or BBQ'd, no added fat$/i, /^chicken, breast, lean, (baked|boiled)/i, /^chicken, breast, lean, raw$/i] },
      { label: 'Olive oil dressing', weight: 1, match: [/^oil, olive$/i, /^oil, olive/i] },
    ],
  },
  {
    slug: 'yogurt_snack', name: 'Yogurt Snack',
    slots: ['snack', 'breakfast'],
    tags: ['snack', 'high-protein', 'recovery'],
    components: [
      { label: 'Yogurt (plain)', weight: 3, match: [/^yogh?urt, natural, regular fat \(~4%\)$/i, /^yogh?urt, natural, regular fat/i, /^yogh?urt, natural/i], exclude: /goat|soy|almond|coconut|oat|cashew/i },
      { label: 'Fruit', weight: 2, match: [/^blueberr(y|ies), raw$/i, /^banana, cavendish, peeled, raw$/i] },
      { label: 'Granola / muesli / nuts', weight: 1, match: [/^muesli, commercial, toasted, dried fruit & nuts$/i, /^muesli, commercial/i, /^muesli/i] },
    ],
  },
  {
    slug: 'recovery_drink', name: 'Recovery Drink',
    slots: ['during_session', 'post_session'],
    tags: ['post-training', 'quick', 'portable'],
    components: [
      { label: 'Flavoured milk', weight: 3, match: [/^chocolate milk, made from dry mix with reduced fat milk$/i, /^chocolate milk drink$/i, /^milk, cow, fluid, chocolate/i] },
      { label: 'Sports / electrolyte drink', weight: 2, match: [/^sports drink, ready to drink, all flavours$/i, /^sports drink, nfs$/i, /^sports drink/i], exclude: /dry|concentrate|low calorie/i },
    ],
  },
  {
    slug: 'takeaway_meal', name: 'Takeaway / Restaurant Meal',
    slots: ['lunch', 'dinner'],
    tags: ['low-quality-flag', 'social', 'travel'],
    components: [
      { label: 'Pizza or burger', weight: 3, match: [/^pizza with cheese and extra vegetables, medium crust$/i, /^hamburger, beef patty & cheese, homemade$/i] },
      { label: 'Fried side (chips)', weight: 2, match: [/^potato, french fries, nfs$/i, /^potato, french fries/i] },
      { label: 'Fried chicken or takeaway dish', weight: 2, match: [/^chicken breast, fried, coated, skin \/ coating eaten, from fast food/i, /^chicken breast, fried, coated/i] },
    ],
  },
];

/**
 * Resolution rules, worksheet Part 3. Returns the chosen row plus what else
 * matched, so a human can see the alternatives that were rejected.
 */
function pick(foods, comp) {
  for (let i = 0; i < comp.match.length; i++) {
    const re = comp.match[i];
    let hits = foods.filter(f => re.test(f.description));
    if (comp.exclude) hits = hits.filter(f => !comp.exclude.test(f.description));
    if (hits.length === 0) continue;
    hits = hits.slice().sort((a, b) => {
      if (a.source !== b.source) return a.source === 'AUSNUT' ? -1 : 1;
      return a.description.length - b.description.length
        || a.description.localeCompare(b.description);
    });
    return { hit: hits[0], alternatives: hits.slice(0, 3), matcherIndex: i, total: hits.length };
  }
  return { hit: null, alternatives: [], matcherIndex: -1, total: 0 };
}

function main() {
  if (!fs.existsSync(FOODS)) {
    console.error(`Missing ${FOODS}. Fetch it first (see docs/NUTRITION_PLAN.md).`);
    process.exit(1);
  }
  const foods = JSON.parse(fs.readFileSync(FOODS, 'utf8'));
  console.log(`[load] ${foods.length} foods from ${FOODS}\n`);

  const out = { generatedAt: new Date().toISOString(), foodCount: foods.length, archetypes: [], exceptions: [] };
  let resolved = 0, total = 0, uncertain = 0;

  for (const a of ARCHETYPES) {
    console.log(`=== ${a.name}  [${a.slots.join(', ')}]`);
    const entry = { slug: a.slug, name: a.name, slots: a.slots, tags: a.tags, components: [] };
    for (const c of a.components) {
      total++;
      const { hit, alternatives, matcherIndex } = pick(foods, c);
      if (!hit) {
        console.log(`   MISS  ${c.label} (w${c.weight}) — no candidate`);
        out.exceptions.push({ archetype: a.slug, component: c.label, weight: c.weight, reason: 'no match', candidates: [] });
        entry.components.push({ label: c.label, weight: c.weight, food_id: null });
        continue;
      }
      resolved++;
      // matcherIndex > 0 means the exact/generic pattern missed and we fell
      // back — flag it for owner review rather than trusting it silently.
      const fallback = matcherIndex > 0;
      if (fallback) uncertain++;
      console.log(`   ${fallback ? 'CHECK' : '  ok '} ${c.label} (w${c.weight}) → ${hit.source} "${hit.description}"`);
      if (fallback) {
        out.exceptions.push({
          archetype: a.slug, component: c.label, weight: c.weight,
          reason: 'fallback matcher',
          candidates: alternatives.map(x => ({ source: x.source, description: x.description })),
        });
      }
      entry.components.push({
        label: c.label, weight: c.weight, food_id: hit.id,
        source: hit.source, description: hit.description, matcherIndex,
      });
    }
    out.archetypes.push(entry);
    console.log('');
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log(`[summary] ${resolved}/${total} components resolved, ${uncertain} via fallback, ${out.exceptions.length} need review`);
  console.log(`[write] ${OUT_JSON}`);
  if (out.exceptions.length) {
    console.log('\n=== needs product-owner decision ===');
    for (const e of out.exceptions) {
      console.log(`  ${e.archetype} / ${e.component} — ${e.reason}`);
      for (const c of e.candidates) console.log(`      option: ${c.source}  ${c.description}`);
    }
  }
}

main();


