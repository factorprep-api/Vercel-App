// =====================================================================
// FactorPrep v1.8.0 — NUTRITION POD ETL SCAFFOLD (scripts/nutrition_etl.mjs)
// Local Node script — NEVER runs in the Vercel app. Usage:
//
//   node scripts/nutrition_etl.mjs --download              # fetch FNDDS zip → data/
//   node scripts/nutrition_etl.mjs --import --source FNDDS --dry-run
//   node scripts/nutrition_etl.mjs --import --source FNDDS --file data/FoodData_Central_survey_food_csv_2022-10-28/Food.csv
//
// Node 18+ (built-in fetch). Zero new dependencies.
// Validation gates (plan §4.2 worked examples) hard-fail the import if the
// computed values drift outside tolerance — see GATES below.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ---- .env loader (no dotenv dependency — the project doesn't use one) --
// Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. You add the service
// key to .env yourself — it must NEVER go to Vercel; .env is git-ignored.
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

const FNDDS_ZIP_URL =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2022-10-28.zip';
const DATA_DIR = path.resolve('data');
const UPSERT_CHUNK = 500;

// ---- SR-Legacy nutrient_id → canonical column (per-100g) ------------
// IMPORTANT: the FNDDS 2019-2020 FDC release stores nutrients with the
// classic SR-Legacy 3-digit IDs (NOT the FDC 4-digit IDs). Verified against
// nutrient.csv / food_nutrient.csv in the downloaded dataset.
const FDC_NUTRIENT_MAP = {
  208: 'energy_kj',           // Energy (kcal) — converted ×4.184 to kJ
  203: 'protein_g',
  205: 'carbohydrate_g',
  269: 'sugars_g',
  291: 'fibre_g',             // Fiber, total dietary
  204: 'fat_total_g',
  606: 'fat_sat_g',
  601: 'cholesterol_mg',
  301: 'calcium_mg',
  303: 'iron_mg',
  304: 'magnesium_mg',
  306: 'potassium_mg',
  307: 'sodium_mg',
  309: 'zinc_mg',
  320: 'vitamin_a_ug_rae',    // Vitamin A, RAE
  401: 'vitamin_c_mg',
  328: 'vitamin_d_ug',
  323: 'vitamin_e_mg',        // alpha-tocopherol
  435: 'folate_ug',           // Folate, DFE
};

// ---- Validation gates (plan §4.2 worked examples) -------------------
// Each gate: find the first food row whose description matches `match`,
// assert `field` equals `expected` within `tol`. Import ABORTS on failure.
// NOTE: the plan's worked examples (cider 121.46 kJ, blackcurrant 639.67 kJ)
// are AUSNUT-based — blackcurrant doesn't exist in FNDDS, so those gates are
// deferred to the Phase 2 AUSNUT import. For FNDDS the calibrated reference
// is Apple cider = 192.46 kJ (46.0 kcal × 4.184, verified from the dataset).
const GATES = [
  { name: 'apple-cider', match: /^Apple cider$/, field: 'energy_kj', expected: 192.46, tol: 0.5 },
  // Phase 2 (AUSNUT) gates:
  // { name: 'cider',        match: /cider/i,        field: 'energy_kj', expected: 121.46, tol: 0.5 },
  // { name: 'blackcurrant', match: /blackcurrant/i, field: 'energy_kj', expected: 639.67, tol: 0.5 },
];

// ---- Minimal RFC4180 CSV parser (quotes, embedded commas/newlines) --
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

// ---- Transform: pivot FNDDS long-format into wide foods rows --------
const round2 = (v) => Math.round(v * 100) / 100;
const NUTRIENT_KEYS = Object.values(FDC_NUTRIENT_MAP);

function loadFndds(dir) {
  const read = (name) => parseCsv(fs.readFileSync(path.join(dir, name), 'utf8'));
  const foods = read('food.csv');
  const fn = read('food_nutrient.csv');
  const portions = fs.existsSync(path.join(dir, 'food_portion.csv')) ? read('food_portion.csv') : [];
  const survey = new Map(read('survey_fndds_food.csv').map(s => [s.fdc_id, s]));
  const wweiaPath = path.join(dir, 'wweia_food_category.csv');
  const wweia = fs.existsSync(wweiaPath)
    ? new Map(read('wweia_food_category.csv').map(w => [w.wweia_food_category, w.wweia_food_category_description]))
    : new Map();

  const rows = new Map(); // fdc_id → wide row
  for (const f of foods) {
    if (f.data_type !== 'survey_fndds_food') continue; // FNDDS entries only
    const s = survey.get(f.fdc_id) || {};
    const n = {};
    for (const k of NUTRIENT_KEYS) n[k] = null;   // missing-as-zero per plan §4.4
    rows.set(f.fdc_id, {
      source: 'FNDDS',
      source_code: s.food_code || f.fdc_id, // WWEIA food_code = canonical FNDDS id
      description: f.description,
      category: wweia.get(s.wweia_category_number) || null,
      portion_label: null,
      portion_grams: null,
      nutrient: n,
    });
  }

  for (const r of fn) {
    const row = rows.get(r.fdc_id);
    if (!row) continue;
    const col = FDC_NUTRIENT_MAP[r.nutrient_id];
    if (!col) continue;
    let v = parseFloat(r.amount);
    if (Number.isNaN(v)) continue;
    if (col === 'energy_kj') v = v * 4.184;       // FDC energy is kcal → kJ
    row.nutrient[col] = round2(v);
  }

  // Default portion = the standard portion (seq_num 1), else the heaviest.
  // Label joins measure_unit.csv so it reads "1 cup", not a raw unit id.
  const muPath = path.join(dir, 'measure_unit.csv');
  const units = fs.existsSync(muPath)
    ? new Map(read('measure_unit.csv').map(m => [m.id, m.name || m.measure_unit_name]))
    : new Map();
  for (const p of portions) {
    const row = rows.get(p.fdc_id);
    if (!row) continue;
    const grams = parseFloat(p.gram_weight);
    if (Number.isNaN(grams) || grams <= 0) continue;
    if (row.portion_grams == null || p.seq_num === '1') {
      const unit = p.portion_description || units.get(p.measure_unit_id) || p.modifier || '';
      row.portion_grams = grams;
      row.portion_label = `${p.amount} ${unit}`.trim() || null;
    }
  }

  const all = [...rows.values()];
  console.log(`[transform] FNDDS: ${foods.length} food rows → ${all.length} FNDDS foods, ${fn.length} nutrient rows pivoted`);
  return all;
}

// ---- Validation gates (plan §4.2) -----------------------------------
function runGates(payload) {
  let failed = 0;
  for (const g of GATES) {
    const hit = payload.find(r => g.match.test(r.description));
    if (!hit) {
      console.error(`[gate:FAIL] ${g.name}: no food description matched ${g.match}`);
      failed++;
      continue;
    }
    const v = hit.nutrient[g.field]; // nutrients are nested under .nutrient
    const ok = v != null && Math.abs(v - g.expected) <= g.tol;
    console.log(`[gate:${ok ? 'PASS' : 'FAIL'}] ${g.name} → ${g.field}=${v} (expected ${g.expected} ±${g.tol})`);
    if (!ok) failed++;
  }
  return failed;
}

// ---- Download & unzip ------------------------------------------------
function downloadFndds() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const zipName = FNDDS_ZIP_URL.split('/').pop();
  const zip = path.join(DATA_DIR, zipName);
  const inner = path.join(DATA_DIR, zipName.replace(/\.zip$/, ''));
  if (!fs.existsSync(zip)) {
    console.log(`[download] ${FNDDS_ZIP_URL}`);
    execSync(`curl -L --fail --retry 3 -o "${zip}" "${FNDDS_ZIP_URL}"`, { stdio: 'inherit' });
  } else {
    console.log(`[skip] ${zip} already exists`);
  }
  if (!fs.existsSync(path.join(inner, 'food.csv'))) {
    // NOTE: the zip already contains a root folder named after itself, so we
    // unzip into DATA_DIR (not inner) — the root lands exactly at `inner`.
    console.log(`[unzip] ${zip} → ${DATA_DIR}`);
    execSync(`unzip -o -q "${zip}" -d "${DATA_DIR}"`, { stdio: 'inherit' });
  }
  console.log(`[ok] dataset at ${inner}`);
  return inner;
}

// ---- Import (gates → upsert → refresh scores) ------------------------
async function importRows(all, dryRun) {
  const failedGates = runGates(all);
  if (failedGates > 0) {
    throw new Error(`${failedGates} validation gate(s) failed — import aborted.`);
  }
  const payload = all.map(r => ({
    source: r.source,
    source_code: r.source_code,
    description: r.description,
    category: r.category,
    portion_label: r.portion_label,
    portion_grams: r.portion_grams,
    ...r.nutrient,
  }));
  console.log(`[import] ${payload.length} foods ready${dryRun ? ' (DRY RUN — nothing written)' : ''}`);
  console.log(`[sample] ${JSON.stringify(payload[0])}`);
  if (dryRun) return;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — add the service key yourself, never to Vercel.');
  }
  // PostgREST directly via built-in fetch — supabase-js ≥2.109 requires a
  // WebSocket transport on Node < 22, and this script must stay zero-dependency.
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=ignore-duplicates,return=minimal',
  };

  for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
    const chunk = payload.slice(i, i + UPSERT_CHUNK);
    const res = await fetch(`${url}/rest/v1/foods?on_conflict=source,source_code`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Chunk at ${i}: ${res.status} ${await res.text()}`);
    process.stdout.write(`\r[upsert] ${Math.min(i + UPSERT_CHUNK, payload.length)}/${payload.length}`);
  }
  console.log('');
  const rpc = await fetch(`${url}/rest/v1/rpc/refresh_nutrition_scores`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: '{}',
  });
  if (!rpc.ok) throw new Error(`refresh_nutrition_scores: ${rpc.status} ${await rpc.text()}`);
  console.log('[done] foods imported + v_food_scores refreshed.');
}

// ---- Main ------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const get = (f) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : null; };

  if (has('--download')) { downloadFndds(); return; }
  if (has('--import')) {
    const source = (get('--source') || 'FNDDS').toUpperCase();
    if (source !== 'FNDDS') {
      console.error('Only FNDDS is scaffolded in Phase 1 (AUSNUT lands in Phase 2).');
      process.exit(1);
    }
    const dir = get('--dir') || downloadFndds();
    const foods = loadFndds(dir);
    await importRows(foods, has('--dry-run'));
    return;
  }
  console.log([
    'Usage:',
    '  node scripts/nutrition_etl.mjs --download',
    '  node scripts/nutrition_etl.mjs --import --dry-run',
    '  node scripts/nutrition_etl.mjs --import --source FNDDS --dir data/FoodData_Central_survey_food_csv_2022-10-28',
  ].join('\n'));
}
import { pathToFileURL } from 'node:url';

// CLI guard: only auto-run main() when executed directly, never on import
// (the app or tests may import parseCsv/loadFndds from this module).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });


