// One-off: rename all exercise names containing "Bicep" (no S) to "Biceps".
// Safe to re-run: rows already containing "Biceps" are excluded.
// Also trims leading/trailing whitespace on any matched name (bunny-upload bug class).
// Uses service-role key from .env.
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const base = env.VITE_SUPABASE_URL + '/rest/v1/exercises';
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
};

async function fetchMatches() {
  let all = [], from = 0;
  for (;;) {
    const p = new URLSearchParams({
      exercise_name: 'ilike.*bicep*', select: 'id,exercise_name',
      order: 'exercise_name.asc', limit: '1000', offset: String(from)
    });
    const res = await fetch(base + '?' + p.toString(), { headers });
    const page = await res.json();
    if (Array.isArray(page) === false) throw new Error('fetch failed: ' + JSON.stringify(page));
    all = all.concat(page);
    if (page.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function patchName(oldName, newName, tag) {
  const url = base + '?' + new URLSearchParams({ exercise_name: 'eq.' + oldName }).toString();
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ exercise_name: newName })
  });
  if (!res.ok) return { ok: false, detail: res.status + ' ' + await res.text() };
  const back = await res.json();
  if (Array.isArray(back) === false || back.length === 0) return { ok: false, detail: 'NO-MATCH (0 rows updated)' };
  return { ok: true, count: back.length, result: back[0].exercise_name };
}

const rows = await fetchMatches();
const targets = rows.filter(r => /biceps/i.test(r.exercise_name) === false);
console.log('Rows containing bicep: ' + rows.length + ' | to process (no S): ' + targets.length);

let ok = 0, fail = 0, skipped = 0;
for (const r of targets) {
  let newName = r.exercise_name.split('Bicep').join('Biceps');
  if (newName.trim() !== newName) console.log('TRIM: ' + JSON.stringify(r.exercise_name) + ' (has leading/trailing whitespace)');
  newName = newName.trim();
  if (newName === r.exercise_name) { skipped++; continue; }
  const out = await patchName(r.exercise_name, newName);
  if (out.ok) { ok++; console.log('OK: ' + JSON.stringify(r.exercise_name) + ' -> ' + JSON.stringify(out.result) + ' (updated ' + out.count + ' row(s))'); }
  else { fail++; console.log('FAIL: ' + JSON.stringify(r.exercise_name) + ' - ' + out.detail); }
}
console.log('\nPatch summary: ' + ok + ' renamed, ' + fail + ' failed, ' + skipped + ' skipped (already correct)');

const after = await fetchMatches();
const stillNoS = after.filter(r => /biceps/i.test(r.exercise_name) === false);
console.log('\nVerification: with-S = ' + (after.length - stillNoS.length) + ', still without-S = ' + stillNoS.length);
if (stillNoS.length) stillNoS.forEach(r => console.log('  REMAINING: ' + JSON.stringify(r.exercise_name)));
const stillPad = after.filter(r => r.exercise_name !== r.exercise_name.trim());
console.log('Names still with leading/trailing whitespace: ' + stillPad.length);
stillPad.forEach(r => console.log('  PADDED: ' + JSON.stringify(r.exercise_name)));
