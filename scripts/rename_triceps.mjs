// One-off: rename all exercise names containing "Tricep" (no S) to "Triceps".
// Safe to re-run: rows already containing "Triceps" are excluded.
// Uses service-role key from .env; targets only names with bare "Tricep".
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
      exercise_name: 'ilike.*tricep*', select: 'id,exercise_name',
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

const rows = await fetchMatches();
const targets = rows.filter(r => /triceps/i.test(r.exercise_name) === false);
console.log('Rows containing tricep: ' + rows.length + ' | to rename (no S): ' + targets.length);

let ok = 0, fail = 0, skipped = 0;
for (const r of targets) {
  const newName = r.exercise_name.split('Tricep').join('Triceps');
  if (newName === r.exercise_name) { skipped++; console.log('SKIP (no change): ' + r.exercise_name); continue; }
  const url = base + '?' + new URLSearchParams({ exercise_name: 'eq.' + r.exercise_name }).toString();
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ exercise_name: newName })
  });
  if (res.ok) {
    const back = await res.json();
    if (Array.isArray(back) === false || back.length === 0) {
      fail++; console.log('NO-MATCH (0 rows updated): ' + JSON.stringify(r.exercise_name));
    } else {
      ok++; console.log('OK: ' + JSON.stringify(r.exercise_name) + ' -> ' + JSON.stringify(back[0].exercise_name) + ' (updated ' + back.length + ' row(s))');
    }
  } else {
    fail++;
    console.log('FAIL ' + res.status + ': ' + JSON.stringify(r.exercise_name) + ' - ' + await res.text());
  }
}
console.log('\nPatch summary: ' + ok + ' renamed, ' + fail + ' failed, ' + skipped + ' skipped');

const after = await fetchMatches();
const stillNoS = after.filter(r => /triceps/i.test(r.exercise_name) === false);
console.log('\nVerification: with-S = ' + (after.length - stillNoS.length) + ', still without-S = ' + stillNoS.length);
if (stillNoS.length) stillNoS.forEach(r => console.log('  REMAINING: ' + JSON.stringify(r.exercise_name)));
