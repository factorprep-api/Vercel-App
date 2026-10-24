// =====================================================================
// FactorPrep — grant_pod.mjs (admin CLI, local only — never in the app)
// Grants a pod to an athlete via athlete_team_memberships.active_pods.
// Usage:  node scripts/grant_pod.mjs <athlete-name-or-email> <pod>
// e.g.:   node scripts/grant_pod.mjs crusty nutrition
// Requires SUPABASE_SERVICE_ROLE_KEY in .env (bypasses RLS, like the ETL).
// =====================================================================
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('[FATAL] Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const [who, pod] = process.argv.slice(2);
if (!who || !pod) {
  console.error('Usage: node scripts/grant_pod.mjs <athlete-name-or-email> <pod>');
  process.exit(1);
}

// Find the athlete by name (ilike) or email (ilike)
const athRes = await fetch(
  `${url}/rest/v1/athletes?or=(name.ilike.*${encodeURIComponent(who)}*,email.ilike.*${encodeURIComponent(who)}*)&select=id,name,email`,
  { headers }
);
const athletes = await athRes.json();
if (!Array.isArray(athletes) || athletes.length === 0) {
  console.error(`No athlete matched "${who}".`);
  process.exit(1);
}
console.log(`Matches for "${who}": ${athletes.map(a => `${a.name} <${a.email || 'no email'}>`).join('; ')}`);

for (const a of athletes) {
  const memRes = await fetch(
    `${url}/rest/v1/athlete_team_memberships?athlete_id=eq.${a.id}&select=id,team_id,active_pods`,
    { headers }
  );
  const mems = await memRes.json();
  if (!Array.isArray(mems) || mems.length === 0) {
    console.log(`${a.name}: has no team memberships — grant via shop entitlement instead (Manage Shop → Grants).`);
    continue;
  }
  for (const mem of mems) {
    const pods = Array.isArray(mem.active_pods) ? mem.active_pods : [];
    if (pods.includes(pod)) {
      console.log(`${a.name}: already has '${pod}' on team ${mem.team_id} [${pods.join(', ')}]`);
      continue;
    }
    const next = [...pods, pod];
    const patch = await fetch(
      `${url}/rest/v1/athlete_team_memberships?id=eq.${mem.id}`,
      { method: 'PATCH', headers, body: JSON.stringify({ active_pods: next }) }
    );
    if (patch.ok) {
      console.log(`${a.name}: team ${mem.team_id} pods ${pods.length ? pods.join(', ') : '(none)'} → ${next.join(', ')} ✓`);
    } else {
      console.error(`${a.name}: PATCH failed ${patch.status} ${await patch.text()}`);
    }
  }
}
