// =====================================================================
// FactorPrep v1.8.2 — NUTRITION POD ETL (scripts/nutrition_etl.mjs)
// Local Node script — NEVER runs in the Vercel app. Usage:
//
//   node scripts/nutrition_etl.mjs --download              # fetch FNDDS zip → data/
//   node scripts/nutrition_etl.mjs --import --source FNDDS --dry-run
//   node scripts/nutrition_etl.mjs --import --source AUSNUT --dry-run
//   node scripts/nutrition_etl.mjs --import --source FNDDS   # then AUSNUT
//
// Node 18+ (built-in fetch). Zero new dependencies.
//
// Gates are LOCKED to values computed from the datasets actually shipped —
// see GATES for the provenance, including why plan §4.2's cider example
// became 117.96. A failing gate ABORTS the import; nothing is ever silently
// recalibrated.
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
const AUSNUT_DIR = path.join(path.resolve('data'), 'ausnut', 'AUSNUT 2023 - All Files');
const DATA_DIR = path.resolve('data');
const UPSERT_CHUNK = 500;

// ---- FNDDS nutrient_id → canonical column (per-100g) ----------------
// SR-Legacy 3-digit IDs — verified empirically from the dataset
// (food_nutrient.csv rows, e.g. fdc 2344813 "Apple cider"). Covers the
// plan §4.1 scoring nutrients (fatty-acid profile, B vitamins,
// phosphorus, folate TOTAL — not DFE) + informational macros. Iodine does
// not exist in FNDDS → stays null → 0 per plan §4.4.
const FDC_NUTRIENT_MAP = {
  208: 'energy_kj',           // Energy (kcal) — converted ×4.184 to kJ
  203: 'protein_g',
  205: 'carbohydrate_g',
  269: 'sugars_g',
  291: 'fibre_g',             // Fiber, total dietary
  204: 'fat_total_g',
  606: 'fat_sat_g',
  645: 'fat_mono_g',
  646: 'fat_poly_g',
  618: 'linoleic_g',          // ω-6
  619: 'ala_g',               // ω-3 ALA
  404: 'thiamin_mg',
  405: 'riboflavin_mg',
  406: 'niacin_mg',
  301: 'calcium_mg',
  303: 'iron_mg',
  304: 'magnesium_mg',
  305: 'phosphorus_mg',
  306: 'potassium_mg',
  307: 'sodium_mg',
  309: 'zinc_mg',
  320: 'vitamin_a_ug_rae',    // informational (§4.1 excludes vit A)
  401: 'vitamin_c_mg',
  323: 'vitamin_e_mg',
  328: 'vitamin_d_ug',
  417: 'folate_total_ug',     // §4.1: folate TOTAL, not DFE
  435: 'folate_ug',           // informational DFE
  601: 'cholesterol_mg',
};

// ---- Validation gates ------------------------------------------------
// LOCKED to values computed from the datasets we actually ship. Any failure
// aborts the import — a gate that only prints drift cannot protect the
// database from a column remap.
//
// Why plan §4.2's worked examples are not the gate values (plan §2 forbids
// copying the design spreadsheet into production). The cider example is
// provably the pear/perry row of an earlier AUSNUT release — every term
// reproduces to the cent except two:
//   sheet:  niacin 0.3 + folate 2 + vitC 4 + Fe 0.16 + Ca 4 + Mg 5
//           + P 33 + K 73 + Zn 0                                = 121.46
//   AUSNUT 2023 "Cider, pear (perry), alcoholic":
//           niacin 0.3 + folate 2 + vitC 0 + Fe 0.16 + Ca 4 + Mg 5
//           + P 33 + K 73 + Zn 0 + iodine 0.5                   = 117.96
// i.e. 121.46 − 4.0 (vitC) + 0.5 (iodine) = 117.96. The plan's blackcurrant
// example (639.67) reproduces no AUSNUT 2023 row at all: the nearest are
// "Cordial base, blackcurrant juice" 144.55 (a diluted cordial base) and
// "Currant, fresh" 534.17 — so it too is a different vintage.
const RAW19_KEYS = ['fat_sat_g','fat_mono_g','fat_poly_g','linoleic_g','ala_g',
  'thiamin_mg','riboflavin_mg','niacin_mg','vitamin_c_mg','vitamin_e_mg',
  'folate_total_ug','vitamin_d_ug','calcium_mg','iron_mg','magnesium_mg',
  'phosphorus_mg','potassium_mg','zinc_mg','iodine_ug'];
const raw19 = (row) => RAW19_KEYS.reduce((s, k) => s + (row.nutrient[k] ?? 0), 0);
const GATES = [
  // FNDDS: energy survives the kcal → kJ conversion (× 4.184)
  { name: 'fndds-apple-cider-energy', match: /^Apple cider$/, field: 'energy_kj', expected: 192.46, tol: 0.5, src: 'FNDDS' },
  // FNDDS: proves the SR-Legacy fatty-acid ids 645/646/618/619 are mapped
  { name: 'fndds-peanut-butter-raw19', match: /^Peanut butter$/, raw19: true, expected: 1294.04, tol: 0.5, src: 'FNDDS' },
  // AUSNUT: canonical cider row (vitC present, no B vitamins) — 75.53
  { name: 'ausnut-cider-apple-raw19', match: /^Cider, apple, alcoholic$/, raw19: true, expected: 75.53, tol: 0.5, src: 'AUSNUT' },
  // AUSNUT: the plan §4.2 cider row (pear/perry) — 117.96, not 121.46
  { name: 'ausnut-cider-perry-raw19', match: /^Cider, pear \(perry\), alcoholic$/, raw19: true, expected: 117.96, tol: 0.5, src: 'AUSNUT' },
  // AUSNUT: high-vitC row (the plan's blackcurrant analogue) — 144.55
  { name: 'ausnut-blackcurrant-cordial-base-raw19', match: /^Cordial base, blackcurrant juice$/, raw19: true, expected: 144.55, tol: 0.5, src: 'AUSNUT' },
  // AUSNUT: fat-heavy row — proves cols 50/51/52/53/57 map correctly
  { name: 'ausnut-butter-raw19', match: /^Butter, plain, salted$/, raw19: true, expected: 153.62, tol: 0.5, src: 'AUSNUT' },
  // AUSNUT: dense multi-axis row (B vitamins + folate + minerals)
  { name: 'ausnut-egg-raw19', match: /^Egg, chicken, whole, raw$/, raw19: true, expected: 568.39, tol: 0.5, src: 'AUSNUT' },
  // AUSNUT: the §4.2 blackcurrant row, nearest available in 2023 (534.17)
  { name: 'ausnut-currant-raw19', match: /^Currant, fresh$/, raw19: true, expected: 534.17, tol: 0.5, src: 'AUSNUT' },
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

export function loadFndds(dir) {
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

// ---- Minimal XLSX reader (zero-dependency; XLSX = zip of XML) --------
// Extracts parts via unzip -p, parses sharedStrings + workbook rels +
// sheet cells. Returns { sheetName: rows[] } where rows are arrays indexed
// by column number (1-based), preserving gaps.
const colIndex = (letters) => {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};
const xmlDecode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function readXlsx(xlsxPath) {
  const buf = (p) => execSync(`unzip -p "${xlsxPath}" "${p}"`, { maxBuffer: 128 * 1024 * 1024 }).toString('utf8');
  // shared strings
  const sst = [];
  const sstXml = buf('xl/sharedStrings.xml');
  for (const m of sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    sst.push([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => xmlDecode(x[1])).join(''));
  }
  // workbook: sheet name → target file (via rels)
  const relsXml = buf('xl/_rels/workbook.xml.rels');
  const rels = {};
  for (const r of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[r[1]] = r[2];
  const wbXml = buf('xl/workbook.xml');
  const targets = {};
  for (const s of wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    let t = rels[s[2]];
    if (!t) continue;
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
    targets[xmlDecode(s[1])] = t;
  }
  // sheets: rows of cells
  const out = {};
  for (const [name, target] of Object.entries(targets)) {
    const xml = buf(target);
    const rowMap = new Map();
    for (const rowM of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rNum = parseInt(rowM[1]);
      const cells = [];
      for (const cM of rowM[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (cM[1].match(/r="([A-Z]+)\d+"/) || [])[1];
        if (!ref) continue;
        const col = colIndex(ref);
        const type = (cM[1].match(/t="([^"]*)"/) || [])[1];
        const inner = cM[2] || '';
        let val = null;
        if (type === 's') {
          const idx = parseInt((inner.match(/<v>(\d+)<\/v>/) || [])[1] ?? '-1');
          val = sst[idx] ?? null;
        } else if (type === 'inlineStr') {
          val = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => xmlDecode(x[1])).join('');
        } else {
          const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (v != null) val = type === 'str' ? xmlDecode(v) : parseFloat(v);
        }
        cells[col] = val;
      }
      rowMap.set(rNum, cells);
    }
    const maxRow = Math.max(...rowMap.keys(), 0);
    const rows = [];
    for (let i = 1; i <= maxRow; i++) rows.push(rowMap.get(i) || []);
    out[name] = rows;
  }
  return out;
}

// ---- Probe: dump AUSNUT sheet layouts (before writing the transform) --
function probeAusnut() {
  const files = {
    details: path.join(AUSNUT_DIR, 'AUSNUT 2023 - Food details.xlsx'),
    nutrients: path.join(AUSNUT_DIR, 'AUSNUT 2023 - Food nutrient profiles.xlsx'),
    measures: path.join(AUSNUT_DIR, 'AUSNUT 2023 - Food measures.xlsx'),
    nutrientList: path.join(AUSNUT_DIR, 'AUSNUT 2023 - List of nutrients.xlsx'),
  };
  for (const [label, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) { console.log(`[probe] MISSING: ${label} → ${file}`); continue; }
    const wb = readXlsx(file);
    console.log(`\n===== ${label} — sheets: ${Object.keys(wb).map(s => `"${s}"(${wb[s].length}r)`).join(', ')}`);
    for (const [sheet, rows] of Object.entries(wb)) {
      if (rows.length === 0) continue;
      const last = rows[rows.length - 1];
      console.log(`--- "${sheet}": first 3 rows then last row (col#: value)`);
      for (const r of [...rows.slice(0, 3), last]) {
        const cells = r.map((v, i) => (v !== undefined && v !== null && v !== '') ? `${i}:"${String(v).slice(0, 40)}"` : null).filter(Boolean);
        console.log(`  [${cells.join(', ').slice(0, 400)}]`);
      }
    }
  }
}

// ---- Transform: AUSNUT 2023 → wide foods rows -----------------------
// Column layout verified by probe (Food nutrient profiles, row 3 headers):
//  1 Survey ID | 2 Public food key | 3 Derivation | 4 Food name
//  5 Energy with dietary fibre (kJ) | 8 Protein | 9 Total fat
// 10 Available carb w/ sugar alcohols | 13 Total sugars | 16 Dietary fibre
// 19 Calcium | 21 Iron | 22 Magnesium | 24 Potassium | 26 Sodium | 27 Zinc
// 31 Vitamin A retinol equivalents | 42 Vitamin C | 47 Vitamin D3 eq
// 49 Vitamin E | 40 Dietary folate equivalents | 61 Cholesterol
// AUSNUT profile sheet columns (verified from header dump); §4.1 wording
// matched: niacin EQUIVALENTS (35), folate TOTAL not DFE (39), vitamin D
// equivalents (47). folate_ug (40) = informational DFE.
const AUSNUT_COL = {
  surveyId: 1, foodKey: 2, foodName: 4,
  energy_kj: 5, protein_g: 8, fat_total_g: 9, carbohydrate_g: 10,
  sugars_g: 13, fibre_g: 16,
  calcium_mg: 19, iodine_ug: 20, iron_mg: 21, magnesium_mg: 22,
  phosphorus_mg: 23, potassium_mg: 24, sodium_mg: 26, zinc_mg: 27,
  vitamin_a_ug_rae: 31, thiamin_mg: 32, riboflavin_mg: 33,
  niacin_mg: 35,           // §4.1: niacin EQUIVALENTS
  folate_total_ug: 39,     // §4.1: folate TOTAL, not DFE (40)
  vitamin_c_mg: 42, vitamin_d_ug: 47, vitamin_e_mg: 49,
  fat_sat_g: 50, fat_mono_g: 51, linoleic_g: 52, ala_g: 53,
  fat_poly_g: 57, cholesterol_mg: 61,
  folate_ug: 40,           // informational DFE
};

export function loadAusnut(dir) {
  const profiles = readXlsx(path.join(dir, 'AUSNUT 2023 - Food nutrient profiles.xlsx'))['Food nutrient profiles'];
  const details = readXlsx(path.join(dir, 'AUSNUT 2023 - Food details.xlsx'))['Food details'];
  const measures = readXlsx(path.join(dir, 'AUSNUT 2023 - Food measures.xlsx'))['AUSNUT 2023'];

  // details: find the header row by locating 'Survey ID', then map
  // foodKey → {category: classification name (col 15), classCode (col 14)}
  const detHeaderIdx = details.findIndex(r => r[1] === 'Survey ID');
  if (detHeaderIdx < 0) throw new Error('Food details: header row not found');
  const det = new Map(); // surveyId → details row
  for (const r of details.slice(detHeaderIdx + 1)) {
    if (r && r[1]) det.set(String(r[1]), r);
  }

  // measures: header row similarly; default portion = first sensible row.
  // AUSNUT includes "density" conversion rows for liquids (grams per mL —
  // physics metadata, not a serving). Nobody eats "1 density", so those
  // rows are skipped when choosing the default portion. Foods with only a
  // density row simply get no default (the UI falls back to gram presets).
  const measHeaderIdx = measures.findIndex(r => r[1] === 'Survey ID');
  if (measHeaderIdx < 0) throw new Error('Food measures: header row not found');
  const meas = new Map(); // surveyId → default portion row
  for (const r of measures.slice(measHeaderIdx + 1)) {
    if (!r || !r[1] || r[10] == null) continue;
    const id = String(r[1]);
    if (meas.has(id)) continue;
    const desc = [r[6], r[7], r[8], r[9]].filter(Boolean).join(' ');
    if (/density/i.test(`${r[5] ?? ''} ${desc}`)) continue; // skip conversion rows
    const grams = parseFloat(r[10]);
    if (Number.isNaN(grams) || grams <= 0) continue;
    meas.set(id, { grams, label: `${r[5] ?? ''} ${desc}`.trim() || null });
  }

  const rows = [];
  for (const r of profiles.slice(3)) { // data starts row 4 (idx 3)
    if (!r || !r[1]) continue;
    const id = String(r[1]);
    const d = det.get(id) || [];
    const n = {};
    for (const [key, col] of Object.entries(AUSNUT_COL)) {
      if (['surveyId', 'foodKey', 'foodName'].includes(key)) continue;
      const v = parseFloat(r[col]);
      n[key] = Number.isNaN(v) ? null : round2(v);
    }
    const m = meas.get(id) || {};
    rows.push({
      source: 'AUSNUT',
      source_code: id,
      description: String(r[AUSNUT_COL.foodName] || '').trim(),
      category: d[15] || d[14] || null,
      portion_label: m.label ?? null,
      portion_grams: m.grams ?? null,
      nutrient: n,
    });
  }
  console.log(`[transform] AUSNUT: ${profiles.length} profile rows → ${rows.length} foods (details: ${det.size}, measures: ${meas.size})`);
  return rows;
}

// ---- Validation gates (plan §4.2) -----------------------------------
function runGates(payload, source) {
  let failed = 0;
  for (const g of GATES) {
    if (g.src && source && g.src !== source) continue; // gate scoped to a dataset
    const hits = payload.filter(r => g.match.test(r.description));
    if (hits.length === 0) {
      console.error(`[gate:FAIL] ${g.name}: no food description matched ${g.match}`);
      failed++;
      continue;
    }
    if (g.raw19) {
      // Locked §4.2 raw-sum gates. Description patterns are anchored, so the
      // first hit IS the intended row — a drift here means a column remap or
      // a dataset swap, and the import must abort.
      const hit = hits[0];
      const v = raw19(hit);
      const ok = Number.isFinite(v) && Math.abs(v - g.expected) <= g.tol;
      console.log(`[gate:${ok ? 'PASS' : 'FAIL'}] ${g.name} → raw19=${v.toFixed(2)} (expected ${g.expected} ±${g.tol})  [${hit.description.slice(0, 48)}]`);
      if (!ok) failed++;
      if (hits.length > 1) {
        console.log(`   note: ${hits.length} rows matched ${g.match}; gated on the first (${hit.description.slice(0, 40)})`);
      }
    } else {
      const hit = hits[0];
      const v = hit.nutrient[g.field]; // nutrients are nested under .nutrient
      const ok = v != null && Math.abs(v - g.expected) <= g.tol;
      console.log(`[gate:${ok ? 'PASS' : 'FAIL'}] ${g.name} → ${g.field}=${v} (expected ${g.expected} ±${g.tol})`);
      if (!ok) failed++;
    }
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
async function importRows(all, dryRun, source) {
  const failedGates = runGates(all, source);
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
  // merge-duplicates (not ignore-duplicates) so a re-import with fixed
  // logic actually REPAIRS existing rows instead of skipping them.
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
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

  if (has('--probe')) { probeAusnut(); return; }
  if (has('--download')) { downloadFndds(); return; }
  if (has('--import')) {
    const source = (get('--source') || 'FNDDS').toUpperCase();
    const dir = get('--dir') || (source === 'AUSNUT' ? AUSNUT_DIR : downloadFndds());
    const foods = source === 'AUSNUT' ? loadAusnut(dir) : loadFndds(dir);
    await importRows(foods, has('--dry-run'), source);
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


