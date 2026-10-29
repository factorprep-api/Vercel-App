#!/usr/bin/env node
// =====================================================================
// FactorPrep v1.9.0 — SEED MEAL ARCHETYPES
//
// Upserts the ten reviewed archetypes into public.meal_archetypes over
// PostgREST, using the service role. Why a script instead of SQL in the
// migration: the component arrays are ten long uuid[] literals, and the
// Supabase SQL editor's paste buffer mangled them twice. This is also
// idempotent on `slug` and deliberately does NOT touch `active`, so an
// archetype the owner switches off stays off across re-seeds.
//
//   node scripts/resolve_archetypes.mjs     # produce data/archetype_resolution.json (review it)
//   node scripts/seed_archetypes.mjs        # write those rows to the database
//
// Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
// The schema (tables, view, RLS) must already exist:
//   paste src/databases/nutrition_archetypes_v1.9.0.sql first.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';

const RES = 'data/archetype_resolution.json';

function loadEnv(file = '.env') {
  try {
    for (const line of fs.readFileSync(path.resolve(file), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* .env optional — vars may come from the shell */ }
}
loadEnv();

async function main() {
  if (!fs.existsSync(RES)) {
    console.error(`Missing ${RES} — run: node scripts/resolve_archetypes.mjs`);
    process.exit(1);
  }
  const res = JSON.parse(fs.readFileSync(RES, 'utf8'));

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  };

  const rows = res.archetypes.map((a, i) => {
    const missing = a.components.filter(c => !c.food_id);
    if (missing.length) {
      throw new Error(`${a.slug}: unresolved component "${missing[0].label}" — re-run resolve_archetypes.mjs`);
    }
    return {
      slug: a.slug,
      name: a.name,
      component_food_ids: a.components.map(c => c.food_id),
      component_weights: a.components.map(c => c.weight),
      component_labels: a.components.map(c => c.label),
      meal_slots: a.slots,
      context_tags: a.tags,
      display_order: i + 1,
      // NOTE: `active` intentionally omitted — merge-duplicates keeps the
      // existing value on update and the column default on insert.
    };
  });

  const post = await fetch(`${url}/rest/v1/meal_archetypes?on_conflict=slug`, {
    method: 'POST', headers, body: JSON.stringify(rows),
  });
  if (!post.ok) {
    const body = await post.text();
    if (post.status === 404 || /relation .* does not exist/i.test(body)) {
      console.error('Table public.meal_archetypes does not exist yet — paste src/databases/nutrition_archetypes_v1.9.0.sql first.');
    }
    console.error(`[seed] FAILED ${post.status}: ${body}`);
    process.exit(1);
  }
  const written = await post.json();
  console.log(`[seed] upserted ${written.length} archetypes, ${rows.reduce((s, r) => s + r.component_food_ids.length, 0)} components`);

  // Read back through the view so the numbers are the ones the app will see.
  const check = await fetch(
    `${url}/rest/v1/v_archetype_scores?select=slug,component_count,scored_components,percentile_score&order=display_order.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (check.ok) {
    const view = await check.json();
    console.log('\n[verify] v_archetype_scores');
    for (const v of view) {
      const flag = v.scored_components === v.component_count ? '' : '  <-- UNSCORED COMPONENT';
      console.log(`  ${String(v.percentile_score ?? '—').padStart(6)}  ${v.scored_components}/${v.component_count}  ${v.slug}${flag}`);
    }
  } else {
    console.log('[verify] view not readable yet — run it in the SQL editor instead');
  }
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
