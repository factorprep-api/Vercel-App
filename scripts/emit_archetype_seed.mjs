#!/usr/bin/env node
// =====================================================================
// FactorPrep v1.9.0 — ARCHETYPE SEED EMITTER
//
// Turns the reviewed resolution (data/archetype_resolution.json, produced
// by scripts/resolve_archetypes.mjs) into the INSERT block that lives in
// src/databases/nutrition_archetypes_v1.9.0.sql.
//
//   node scripts/resolve_archetypes.mjs        # resolve + review
//   node scripts/emit_archetype_seed.mjs       # write /tmp/seed.sql
//
// The emitted block is then spliced into the migration. Keeping this
// separate from hand-written SQL means the UUIDs in the migration can
// always be regenerated and diffed instead of being trusted.
//
// Refuses to emit if any component is unresolved, so a partial mapping can
// never reach the database.
// =====================================================================
import fs from 'node:fs';

const RES = 'data/archetype_resolution.json';
const OUT = process.argv[2] || '/tmp/seed.sql';

const res = JSON.parse(fs.readFileSync(RES, 'utf8'));
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const arr = (xs, cast) => `array[${xs.map(x =>
  cast === 'uuid' ? `${q(x)}::uuid` : cast === 'num' ? x : q(x)).join(', ')}]`;

let out = [];
out.push('-- Ten launch archetypes. Component order matches across the three arrays.');
out.push('insert into public.meal_archetypes');
out.push('  (slug, name, component_food_ids, component_weights, component_labels,');
out.push('   meal_slots, context_tags, display_order, active)');
out.push('values');

res.archetypes.forEach((a, i) => {
  const missing = a.components.filter(c => !c.food_id);
  if (missing.length) {
    throw new Error(`${a.slug}: unresolved component "${missing[0].label}" — run resolve_archetypes.mjs and review first`);
  }
  const ids = a.components.map(c => c.food_id);
  const weights = a.components.map(c => c.weight);
  const labels = a.components.map(c => c.label);
  out.push(
    `  (${q(a.slug)}, ${q(a.name)},\n` +
    `   ${arr(ids, 'uuid')},\n` +
    `   ${arr(weights, 'num')}::numeric[],\n` +
    `   ${arr(labels, 'text')},\n` +
    `   ${arr(a.slots, 'text')},\n` +
    `   ${arr(a.tags, 'text')},\n` +
    `   ${i + 1}, true)` + (i === res.archetypes.length - 1 ? '' : ',')
  );
});

out.push('on conflict (slug) do update set');
out.push('  name = excluded.name,');
out.push('  component_food_ids = excluded.component_food_ids,');
out.push('  component_weights = excluded.component_weights,');
out.push('  component_labels = excluded.component_labels,');
out.push('  meal_slots = excluded.meal_slots,');
out.push('  context_tags = excluded.context_tags,');
out.push('  display_order = excluded.display_order;');
out.push('-- `active` is deliberately NOT overwritten: an archetype the owner has');
out.push('-- switched off must stay off across re-seeds.');

fs.writeFileSync(OUT, out.join('\n') + '\n');
const comps = res.archetypes.reduce((s, a) => s + a.components.length, 0);
console.log(`[emit] ${res.archetypes.length} archetypes / ${comps} components → ${OUT}`);
