import fs from 'node:fs';
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: 'Bearer ' + key };

const r = await fetch(`${url}/rest/v1/foods?description=ilike.*lasagne*&select=description,source,portion_label,portion_grams,energy_kj,protein_g,carbohydrate_g,sugars_g,fibre_g,fat_total_g,fat_sat_g,cholesterol_mg,calcium_mg,iron_mg,magnesium_mg,potassium_mg,sodium_mg,zinc_mg,vitamin_a_ug_rae,vitamin_c_mg,vitamin_d_ug,vitamin_e_mg,folate_ug`, { headers: h });
const rows = await r.json();
if (!Array.isArray(rows)) { console.log('query error:', JSON.stringify(rows)); process.exit(1); }
console.log('found', rows.length, 'lasagne rows\n');

const NUTS = [
  ['energy_kj', 'kJ (higher=better)'],
  ['protein_g', 'protein (higher)'],
  ['carbohydrate_g', 'carbs (higher)'],
  ['fibre_g', 'fibre (higher)'],
  ['fat_total_g', 'total fat (higher)'],
  ['sugars_g', 'SUGARS (LIMIT - lower=better)'],
  ['fat_sat_g', 'SAT FAT (LIMIT - lower=better)'],
  ['sodium_mg', 'SODIUM (LIMIT - lower=better)'],
  ['cholesterol_mg', 'CHOLESTEROL (LIMIT - lower=better)'],
  ['calcium_mg', 'calcium (higher)'],
  ['iron_mg', 'iron (higher)'],
  ['magnesium_mg', 'magnesium (higher)'],
  ['potassium_mg', 'potassium (higher)'],
  ['zinc_mg', 'zinc (higher)'],
  ['vitamin_a_ug_rae', 'vit A (higher)'],
  ['vitamin_c_mg', 'vit C (higher)'],
  ['vitamin_d_ug', 'vit D (higher)'],
  ['vitamin_e_mg', 'vit E (higher)'],
  ['folate_ug', 'folate (higher)'],
];

const ready = rows.find(f => /ready meal/i.test(f.description));
const home = rows.find(f => /homemade/i.test(f.description));
if (!ready || !home) { console.log('could not find both entries', rows.map(f=>f.description)); process.exit(1); }

console.log('READY :', ready.description, `(${ready.source}, ${ready.portion_label || 'no default portion'})`);
console.log('HOME  :', home.description, `(${home.source}, ${home.portion_label || 'no default portion'})`);
console.log('');
console.log('NUTRIENT (per 100g)'.padEnd(34), 'READY'.padStart(9), ' | ', 'HOME'.padStart(9), ' | winner-for-score');
console.log('-'.repeat(85));
for (const [col, label] of NUTS) {
  const rv = ready[col], hv = home[col];
  const rn = rv == null ? 0 : Number(rv), hn = hv == null ? 0 : Number(hv);
  const isLimit = /LIMIT/.test(label);
  const readyWins = isLimit ? rn < hn : rn > hn;
  console.log(
    label.padEnd(34),
    String(rn.toFixed(1)).padStart(9), ' | ',
    String(hn.toFixed(1)).padStart(9), ' | ',
    readyWins ? 'READY (+)' : 'HOME (+)'
  );
}
