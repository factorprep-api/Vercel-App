// One-off: rename "Hipflexor(s)" -> "Hip Flexor(s)" (approved scope).
// Collision-safe: fetches the whole library, groups by proposed final name,
// skips any group where two different originals would converge. Idempotent.
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

function fixName(n) {
  return n.split('Hipflexor').join('Hip Flexor');
}

let all = [], from = 0;
for (;;) {
  const p = new URLSearchParams({ select: 'id,exercise_name', order: 'exercise_name.asc', limit: '1000', offset: String(from) });
  const res = await fetch(base + '?' + p.toString(), { headers });
  const page = await res.json();
  if (Array.isArray(page) === false) throw new Error('fetch failed: ' + JSON.stringify(page));
  all = all.concat(page);
  if (page.length < 1000) break;
  from += 1000;
}
console.log('Total exercises: ' + all.length);

const byFinal = new Map();
for (const r of all) {
  const f = fixName(r.exercise_name);
  if (!byFinal.has(f)) byFinal.set(f, []);
  byFinal.get(f).push(r);
}

const changes = [], skippedCollisions = [];
for (const [finalName, rows] of byFinal) {
  const originals = new Set(rows.map(r => r.exercise_name));
  const needsChange = rows.some(r => r.exercise_name !== finalName);
  if (!needsChange) continue;
  if (originals.size > 1) skippedCollisions.push({ finalName, originals: [...originals] });
  else changes.push({ row: rows[0], finalName });
}
console.log('Rows to update: ' + changes.length);
console.log('Collision groups to SKIP: ' + skippedCollisions.length);
skippedCollisions.forEach(c => {
  console.log('  COLLISION on ' + JSON.stringify(c.finalName));
  c.originals.forEach(o => console.log('     ' + JSON.stringify(o)));
});

let ok = 0, fail = 0;
for (const { row, finalName } of changes) {
  const url = base + '?' + new URLSearchParams({ exercise_name: 'eq.' + row.exercise_name }).toString();
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ exercise_name: finalName })
  });
  if (res.ok) {
    const back = await res.json();
    if (Array.isArray(back) === false || back.length === 0) { fail++; console.log('NO-MATCH: ' + JSON.stringify(row.exercise_name)); }
    else { ok++; console.log('OK: ' + JSON.stringify(row.exercise_name) + ' -> ' + JSON.stringify(back[0].exercise_name) + ' (updated ' + back.length + ' row(s))'); }
  } else { fail++; console.log('FAIL ' + res.status + ': ' + JSON.stringify(row.exercise_name) + ' - ' + await res.text()); }
}
console.log('\nPatch summary: ' + ok + ' updated, ' + fail + ' failed, ' + skippedCollisions.length + ' collision rows skipped');

let after = [], from2 = 0;
for (;;) {
  const p = new URLSearchParams({ select: 'id,exercise_name', order: 'exercise_name.asc', limit: '1000', offset: String(from2) });
  const res = await fetch(base + '?' + p.toString(), { headers });
  const page = await res.json();
  if (Array.isArray(page) === false) throw new Error('verify fetch failed');
  after = after.concat(page);
  if (page.length < 1000) break;
  from2 += 1000;
}
const names = after.map(r => r.exercise_name);
console.log('\nVerification:');
console.log('  remaining "Hipflexor" (no space): ' + names.filter(n => /hipflexor/i.test(n)).length);
console.log('  "Hip Flexor" (spaced): ' + names.filter(n => /hip flexor/i.test(n)).length);
const counts = {};
names.forEach(n => { const k = n.toLowerCase().trim(); counts[k] = (counts[k] || 0) + 1; });
console.log('  duplicate names: ' + Object.values(counts).filter(c => c > 1).length);
