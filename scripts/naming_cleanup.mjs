// Tier 1+2 naming cleanup (approved scope):
//   - trim leading/trailing whitespace (incl newlines/tabs)
//   - collapse internal double spaces
//   - remove trailing underscores
//   - typos: Pess->Press, Ezsy->Ezy, Stertch->Stretch, Giblet->Goblet,
//           Straighten3->Straighten, .M2Ts suffix, 'L- Test'->'L-Test'
// Collision-safe: if two different names would normalize to the same final
// name, the whole collision group is SKIPPED and reported (no silent merges).
// Read-only for untouched names; idempotent; service-role key from .env.
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
  let x = n;
  x = x.replace(/^\s+/, '').replace(/\s+$/, '');
  x = x.replace(/ {2,}/g, ' ');
  x = x.replace(/_+$/, '');
  x = x.split('Pess').join('Press');
  x = x.split('Ezsy').join('Ezy');
  x = x.split('Stertch').join('Stretch');
  x = x.split('Giblet').join('Goblet');
  x = x.split('Straighten3').join('Straighten');
  x = x.split('.M2Ts').join('');
  x = x.split('L- Test').join('L-Test');
  return x;
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

// Group rows by proposed final name to detect collisions
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
  if (originals.size > 1) {
    skippedCollisions.push({ finalName, originals: [...originals] });
  } else {
    changes.push({ row: rows[0], finalName });
  }
}
console.log('Rows to update: ' + changes.length);
console.log('Collision groups to SKIP (need manual review): ' + skippedCollisions.length);
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

// Post-verification
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
console.log('  whitespace-padded names: ' + names.filter(n => n !== n.trim()).length);
console.log('  double-space names: ' + names.filter(n => / {2,}/.test(n)).length);
console.log('  names ending with _: ' + names.filter(n => /_$/.test(n)).length);
console.log('  remaining typos (Pess/Ezsy/Stertch/Giblet/M2Ts/Straighten3): ' + names.filter(n => /Pess|Ezsy|Stertch|Giblet|M2Ts|Straighten3/.test(n)).length);
const counts = {};
names.forEach(n => { const k = n.toLowerCase().trim(); counts[k] = (counts[k] || 0) + 1; });
console.log('  duplicate names: ' + Object.values(counts).filter(c => c > 1).length);
