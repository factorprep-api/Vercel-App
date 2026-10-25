#!/usr/bin/env node
// =====================================================================
// FactorPrep v1.8.2 — OFFLINE NUTRITION SCORE SIMULATION
//
// Scores the LOCAL FNDDS + AUSNUT datasets with the exact logic of the
// v_food_scores materialized view, WITHOUT touching Supabase. Use it to
// sanity-check a scoring change before running any migration:
//
//   node scripts/simulate_scores.mjs            # full report
//   node scripts/simulate_scores.mjs --food lasagne
//
// What it reproduces (plan §4.3/§4.6 + the v1.8.2 amendments):
//  · 17 directional axes — 14 §4.1 vitamins/minerals + 3 fatty-acid
//    QUALITY axes (saturated share of fat, ALA, ω-6:ω-3 balance).
//  · Per-axis percentile restricted to rows that REPORT the axis:
//    contribution = 100 · (1 − (rank−1)/(n_present−1)), rank 1 = best.
//    Source-unique axes (iodine: AUSNUT only) are therefore not diluted
//    by the FNDDS rows that never report them.
//  · Available-case aggregation: percentile_score = mean of the axes the
//    food actually reports (null when it reports none), plus score_axes.
//  · raw_score = plain §4.2 sum of the 19 native-unit values (null → 0).
//
// It also recomputes the PRE-v1.8.2 score (fixed /17 denominator,
// count(*) denominators, nulls ranked last) so the before/after shift is
// visible rather than assumed.
//
// Zero dependencies — reuses the ETL's loaders.
// =====================================================================
import path from 'node:path';
import { loadFndds, loadAusnut } from './nutrition_etl.mjs';

const FNDDS_DIR = path.resolve('data/FoodData_Central_survey_food_csv_2022-10-28');
const AUSNUT_DIR = path.join(path.resolve('data'), 'ausnut', 'AUSNUT 2023 - All Files');

// plan §4.2 — the 19 nutrient values summed in native units
const RAW19_KEYS = ['fat_sat_g', 'fat_mono_g', 'fat_poly_g', 'linoleic_g', 'ala_g',
  'thiamin_mg', 'riboflavin_mg', 'niacin_mg', 'vitamin_c_mg', 'vitamin_e_mg',
  'folate_total_ug', 'vitamin_d_ug', 'calcium_mg', 'iron_mg', 'magnesium_mg',
  'phosphorus_mg', 'potassium_mg', 'zinc_mg', 'iodine_ug'];

// 14 §4.1 vitamins/minerals + 3 fatty-acid quality axes.
// dir 'desc' = higher is better, 'asc' = lower is better.
const AXES = [
  { key: 'thiamin_mg', dir: 'desc' },
  { key: 'riboflavin_mg', dir: 'desc' },
  { key: 'niacin_mg', dir: 'desc' },
  { key: 'vitamin_c_mg', dir: 'desc' },
  { key: 'vitamin_e_mg', dir: 'desc' },
  { key: 'folate_total_ug', dir: 'desc' },
  { key: 'vitamin_d_ug', dir: 'desc' },
  { key: 'calcium_mg', dir: 'desc' },
  { key: 'iron_mg', dir: 'desc' },
  { key: 'magnesium_mg', dir: 'desc' },
  { key: 'phosphorus_mg', dir: 'desc' },
  { key: 'potassium_mg', dir: 'desc' },
  { key: 'zinc_mg', dir: 'desc' },
  { key: 'iodine_ug', dir: 'desc' },
  { key: 'ala_g', dir: 'desc' },
  { key: 'sat_share', dir: 'asc' },
  { key: 'w63', dir: 'asc' },
];

const r2 = (v) => Math.round(v * 100) / 100;

// Derived fatty-acid quality inputs. Missing fat data must NOT be read as
// "0% saturated" (which would rank as best in the database): both the fat
// total and the numerator have to be reported for the axis to exist.
function derive(row) {
  const n = row.nutrient;
  const fatKnown = n.fat_total_g != null && n.fat_total_g >= 1;
  row.sat_share = fatKnown && n.fat_sat_g != null
    ? n.fat_sat_g / n.fat_total_g
    : null;
  row.w63 = fatKnown && n.ala_g != null && n.linoleic_g != null
    ? (n.ala_g > 0 ? n.linoleic_g / n.ala_g : (n.linoleic_g > 0 ? 1e9 : null))
    : null;
}

// Competition ranking (Postgres rank()) restricted to present values.
// Ties share the best rank, exactly like rank() OVER (ORDER BY …).
function rankAxis(rows, key, dir) {
  const present = rows.filter(r => r[key] != null);
  const sorted = [...present].sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]));
  const n = sorted.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1][key] === sorted[i][key]) j++;
    const c = n > 1 ? 100 * (1 - i / (n - 1)) : 100;
    for (let k = i; k <= j; k++) sorted[k][`c_${key}`] = c;
    i = j + 1;
  }
  return n;
}

// Pre-v1.8.2 behaviour: rank over ALL foods with nulls last, divided by
// count(*), fixed /17 denominator, missing sat_share/w63 → 50.
function oldScores(rows) {
  const N = rows.length;
  const contrib = {};
  for (const a of AXES) {
    const present = rows.filter(r => r[a.key] != null)
      .sort((x, y) => (a.dir === 'desc' ? y[a.key] - x[a.key] : x[a.key] - y[a.key]));
    const nPresent = present.length;
    present.forEach((r, idx) => {
      const rank = idx + 1;
      contrib[r.__i] = contrib[r.__i] || {};
      contrib[r.__i][a.key] = 100 - (100 * rank / N);
    });
    // null rows: rank = nPresent + 1 (nulls last, all tied)
    for (const r of rows) {
      if (r[a.key] != null) continue;
      contrib[r.__i] = contrib[r.__i] || {};
      contrib[r.__i][a.key] = (a.key === 'sat_share' || a.key === 'w63')
        ? 50
        : 100 - (100 * (nPresent + 1) / N);
    }
  }
  return rows.map(r => {
    const c = contrib[r.__i];
    return r2(AXES.reduce((s, a) => s + c[a.key], 0) / AXES.length);
  });
}

function loadAll() {
  const fndds = loadFndds(FNDDS_DIR);
  const ausnut = loadAusnut(AUSNUT_DIR);
  const all = [...fndds, ...ausnut];
  // Flatten the wide nutrient object onto the row so the axis helpers can
  // address r[key] uniformly (the DB view reads columns the same way).
  all.forEach((r, i) => {
    r.__i = i;
    Object.assign(r, r.nutrient);
    derive(r);
  });
  return all;
}

function main() {
  const args = process.argv.slice(2);
  const foodArg = args.indexOf('--food') > -1 ? args[args.indexOf('--food') + 1] : null;
  const all = loadAll();

  for (const a of AXES) rankAxis(all, a.key, a.dir);
  for (const r of all) {
    const cs = AXES.map(a => r[`c_${a.key}`]).filter(v => v != null);
    r.score_axes = cs.length;
    r.percentile_score = cs.length ? r2(cs.reduce((s, v) => s + v, 0) / cs.length) : null;
    r.raw_score = r2(RAW19_KEYS.reduce((s, k) => s + (r.nutrient[k] ?? 0), 0));
  }
  const old = oldScores(all);

  const nF = all.filter(r => r.source === 'FNDDS').length;
  const nA = all.filter(r => r.source === 'AUSNUT').length;
  console.log(`\n[load] ${all.length} foods (${nF} FNDDS + ${nA} AUSNUT)\n`);

  // ---- Axis coverage: how many foods actually report each axis ----------
  console.log('=== axis coverage (# foods reporting the axis) ===');
  for (const a of AXES) {
    const n = all.filter(r => r[a.key] != null).length;
    console.log(`  ${a.key.padEnd(16)} ${String(n).padStart(5)}  (${(100 * n / all.length).toFixed(1)}%)`);
  }
  const hist = {};
  for (const r of all) hist[r.score_axes] = (hist[r.score_axes] || 0) + 1;
  console.log('  axes-per-food: ' + Object.keys(hist).sort((a, b) => a - b)
    .map(k => `${k}:${hist[k]}`).join('  '));

  // ---- §4.2 gate anchors ----------------------------------------------
  console.log('\n=== §4.2 gate anchors (raw19) ===');
  // Kept in sync with GATES in scripts/nutrition_etl.mjs so a remap shows up
  // in both places. FNDDS has no "Butter, salted" row — the fatty-acid anchor
  // there is "Peanut butter".
  const anchors = [
    [/^Cider, apple, alcoholic$/, 'AUSNUT'],
    [/^Cider, pear \(perry\), alcoholic$/, 'AUSNUT'],
    [/^Cordial base, blackcurrant juice$/, 'AUSNUT'],
    [/^Butter, plain, salted$/, 'AUSNUT'],
    [/^Egg, chicken, whole, raw$/, 'AUSNUT'],
    [/^Currant, fresh$/, 'AUSNUT'],
    [/^Peanut butter$/, 'FNDDS'],
    [/^Apple cider$/, 'FNDDS'],
  ];
  for (const [re, src] of anchors) {
    const hit = all.find(r => r.source === src && re.test(r.description));
    console.log(`  ${(src + ' ' + re.source).padEnd(58)} ${hit ? 'raw19=' + hit.raw_score.toFixed(2) : 'NOT FOUND'}`);
  }

  // ---- Distribution ---------------------------------------------------
  const dist = {};
  for (const r of all) {
    if (r.percentile_score == null) continue;
    const b = Math.min(90, Math.floor(r.percentile_score / 10) * 10);
    dist[b] = (dist[b] || 0) + 1;
  }
  console.log('\n=== percentile_score distribution (new, available-case) ===');
  for (const b of Object.keys(dist).map(Number).sort((a, b) => a - b)) {
    console.log(`  ${String(b).padStart(2)}-${b + 10}: ${String(dist[b]).padStart(5)}  ${'#'.repeat(Math.round(dist[b] / 40))}`);
  }
  const meanOf = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const newMean = meanOf(all.map(r => r.percentile_score).filter(v => v != null));
  const oldMean = meanOf(old);
  console.log(`  mean  new=${newMean.toFixed(2)}  old=${oldMean.toFixed(2)}`);

  // ---- Source separation (cross-source comparability check) -----------
  console.log('\n=== mean score by source ===');
  for (const src of ['FNDDS', 'AUSNUT']) {
    const idx = all.map((r, i) => (r.source === src ? i : -1)).filter(i => i >= 0);
    const ns = meanOf(idx.map(i => all[i].percentile_score).filter(v => v != null));
    const os = meanOf(idx.map(i => old[i]));
    console.log(`  ${src.padEnd(7)} n=${String(idx.length).padStart(4)}  new=${ns.toFixed(2)}  old=${os.toFixed(2)}`);
  }

  // ---- Lasagne / before-after spot check ------------------------------
  console.log('\n=== lasagne before/after ===');
  all.forEach((r, i) => {
    if (!/lasagne|lasagna/i.test(r.description)) return;
    console.log(`  ${(r.source + ' ' + r.description).slice(0, 60).padEnd(62)} old=${String(old[i]).padStart(6)} new=${String(r.percentile_score).padStart(6)} axes=${r.score_axes}`);
  });

  if (foodArg) {
    const re = new RegExp(foodArg, 'i');
    console.log(`\n=== --food ${foodArg} ===`);
    all.filter(r => re.test(r.description)).slice(0, 25).forEach((r) => {
      console.log(`  ${(r.source + ' ' + r.description).slice(0, 56).padEnd(58)} new=${String(r.percentile_score).padStart(6)} axes=${String(r.score_axes).padStart(2)} raw=${r.raw_score.toFixed(2)}`);
      console.log('     ' + AXES.map(a => `${a.key}=${r[`c_${a.key}`] != null ? r[`c_${a.key}`].toFixed(0) : '-'}`).join(' '));
    });
  }

  // ---- Extremes -------------------------------------------------------
  const ranked = all.filter(r => r.percentile_score != null).sort((a, b) => b.percentile_score - a.percentile_score);
  console.log('\n=== top 10 ===');
  ranked.slice(0, 10).forEach(r => console.log(`  ${r.percentile_score.toFixed(2).padStart(6)}  ${r.score_axes}/17  ${r.source}  ${r.description.slice(0, 46)}`));
  console.log('=== bottom 10 ===');
  ranked.slice(-10).forEach(r => console.log(`  ${r.percentile_score.toFixed(2).padStart(6)}  ${r.score_axes}/17  ${r.source}  ${r.description.slice(0, 46)}`));
  console.log('');
}

main();
