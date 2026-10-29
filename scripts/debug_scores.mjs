// =====================================================================
// debug_scores.mjs — check any food's scores straight from v_food_scores.
// Usage: node scripts/debug_scores.mjs <search-term>   e.g. lasagne
// Prints percentile_score (primary) + raw_score (§4.2 legacy) for every
// matching food — always in sync with the live DB.
// =====================================================================
import fs from 'node:fs';
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^[\"']|[\"']$/g, '');
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: 'Bearer ' + key };

const term = process.argv[2] || 'lasagne';
const r = await fetch(`${url}/rest/v1/v_food_scores?description=ilike.*${encodeURIComponent(term)}*&select=description,source,percentile_score,raw_score&order=percentile_score.desc`, { headers: h });
const rows = await r.json();
if (!Array.isArray(rows)) { console.log('query error:', JSON.stringify(rows)); process.exit(1); }

console.log(`${rows.length} food(s) matching "${term}":\n`);
for (const f of rows) {
  console.log(f.percentile_score != null ? String(f.percentile_score).padStart(6) : '   n/a',
    '| raw', String(f.raw_score ?? 'n/a').padStart(8),
    '|', `${f.description} (${f.source})`);
}