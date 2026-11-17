import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import HelpButton from '../components/HelpButton';
import { supabase } from '../supabase';
import {
  isShopAdmin, adminListShopProducts, adminUpsertShopProduct,
  adminDeleteShopProduct, adminArchiveShopProduct, adminListAthletes, adminListEntitlements,
  adminFetchProgramBundle, adminSetProgramBundle,
  adminListPendingSignups, adminApproveClubRequest,
  adminGrantEntitlement, adminRevokeEntitlement,
  adminListTeams, adminCreateTeam, adminListTeamMemberships,
  adminAddTeamMembership, adminRemoveTeamMembership, adminSetMembershipActive
} from '../api';

// Pods a product can grant. 'treatment' is withheld from the bundles for
// now (not ticked on pods/coaching-kit) — ticking it later launches the
// Treatment Room for every subscriber, no SQL needed.
const POD_OPTIONS = [
  { key: 'wellness', label: 'Wellness' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'medical', label: 'Medical' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'treatment', label: 'Treatment (withheld)' }
];

const EMPTY = {
  id: '', slug: '', name: '', blurb: '', product_type: 'one_time', fulfilment: 'auto',
  paddle_price_id: '', linked_program_id: '', price_display: '', price_usd: '',
  grants_coach_role: false, is_active: true, sort_order: 50, grants_pods: [],
  athlete_guidance: null, archived_at: null
};

// ---------- v1.13.0: guidance card helpers (ONE sheet per bundle product) ----------
// Authoring is four plain textareas, one bullet per line — the shape limits
// (20 bullets/section, 300 chars/bullet) are enforced again by
// valid_athlete_guidance() in the database, so a paste accident can never
// break the card layout.
const linesToArr = (t) => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);

const guidanceToDraft = (g) => ({
  dos: (g && Array.isArray(g.dos) ? g.dos : []).join('\n'),
  donts: (g && Array.isArray(g.donts) ? g.donts : []).join('\n'),
  red_flags: (g && Array.isArray(g.red_flags) ? g.red_flags : []).join('\n'),
  note: (g && g.note) || ''
});

const draftToGuidance = (d) => {
  if (!d) return null;
  const dos = linesToArr(d.dos);
  const donts = linesToArr(d.donts);
  const red_flags = linesToArr(d.red_flags);
  const note = String(d.note || '').trim();
  if (!dos.length && !donts.length && !red_flags.length && !note) return null;
  return { dos, donts, red_flags, note: note || null };
};

export default function ManageShop() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [entitlements, setEntitlements] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [grantAthlete, setGrantAthlete] = useState('');
  const [grantProduct, setGrantProduct] = useState('');
  // Teams tab state (v1.9.18)
  const [teams, setTeams] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [rosterTeam, setRosterTeam] = useState('');
  const [rosterAthlete, setRosterAthlete] = useState('');
  // v1.10.1: pending club signups (self-serve onboarding)
  const [pending, setPending] = useState([]);
  // v1.13.0: bundle + guidance editor state (one sheet per bundle product)
  const [bundle, setBundle] = useState([]);
  const [guidanceDraft, setGuidanceDraft] = useState({ dos: '', donts: '', red_flags: '', note: '' });

  const togglePod = (key) => setForm(f => ({
    ...f,
    grants_pods: f.grants_pods.includes(key)
      ? f.grants_pods.filter(x => x !== key)
      : [...f.grants_pods, key]
  }));

  const reload = useCallback(async () => {
    const [p, a, e, g, t, m] = await Promise.all([
      adminListShopProducts(),
      adminListAthletes(),
      adminListEntitlements(),
      supabase.from('programs').select('id, name').order('name'),
      adminListTeams(),
      adminListTeamMemberships()
    ]);
    setProducts(p.products || []);
    setAthletes(a.athletes || []);
    setEntitlements(e.entitlements || []);
    setPrograms(g.data || []);
    setTeams(t.teams || []);
    setMemberships(m.memberships || []);
  }, []);

  useEffect(() => {
    isShopAdmin().then(res => setIsAdmin(res.isAdmin)).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (isAdmin) reload();
  }, [isAdmin, reload]);

  const saveProduct = async () => {
    const payload = {
      id: form.id || undefined,
      slug: form.slug.trim(),
      name: form.name.trim(),
      blurb: form.blurb || null,
      product_type: form.product_type,
      fulfilment: form.fulfilment,
      paddle_price_id: form.paddle_price_id || null,
      linked_program_id: form.linked_program_id || null,
      price_display: form.price_display,
      price_usd: form.price_usd === '' ? null : Number(form.price_usd),
      grants_coach_role: form.grants_coach_role,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
      grants_pods: form.grants_pods.length > 0 ? form.grants_pods : null,
      athlete_guidance: draftToGuidance(guidanceDraft)
    };
    if (!payload.slug || !payload.name || !payload.price_display) {
      setMsg('Slug, name and price display are required.');
      return;
    }
    // v1.13.0: bundle rows without a chosen program are dropped silently
    const bundleRows = bundle.filter(b => b.program_id);
    const res = await adminUpsertShopProduct(payload);
    if (res.error) { setMsg(`Error: ${res.error}`); return; }
    const bundleRes = await adminSetProgramBundle(res.product.id, bundleRows);
    if (bundleRes.error) { setMsg(`Product saved, but the bundle failed to save: ${bundleRes.error}`); reload(); return; }
    // v1.13.0: stay in the editor (bundles need a saved product id anyway)
    setForm(f => ({ ...f, id: res.product.id }));
    setMsg(`Saved "${payload.name}" — bundle programs and guidance cards saved (${bundleRows.length} in bundle).`);
    reload();
  };

  const editProduct = (p) => {
    setForm({
      id: p.id,
      slug: p.slug, name: p.name, blurb: p.blurb || '',
      product_type: p.product_type, fulfilment: p.fulfilment,
      paddle_price_id: p.paddle_price_id || '', linked_program_id: p.linked_program_id || '',
      price_display: p.price_display, price_usd: p.price_usd == null ? '' : String(p.price_usd),
      grants_coach_role: !!p.grants_coach_role, is_active: !!p.is_active, sort_order: p.sort_order ?? 50,
      grants_pods: Array.isArray(p.grants_pods) ? [...p.grants_pods] : [],
      athlete_guidance: p.athlete_guidance || null, archived_at: p.archived_at || null
    });
    setGuidanceDraft(guidanceToDraft(p.athlete_guidance));
    // v1.13.0: load the saved bundle into the editor
    if (p.id) adminFetchProgramBundle(p.id).then(res => { if (!res.error) setBundle(res.bundle); });
    setTab('products');
    window.scrollTo({ top: 0 });
  };

  // v1.13.0: bundle list builder helpers — the editor list IS the ordering
  const updateBundleRow = (i, patch) => setBundle(b => b.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const moveBundle = (i, dir) => setBundle(b => {
    const j = i + dir;
    if (j < 0 || j >= b.length) return b;
    const next = [...b];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addBundleRow = () => setBundle(b => [...b, { program_id: '', stage_label: '', advance_criteria: '' }]);
  const removeBundleRow = (i) => setBundle(b => b.filter((_, idx) => idx !== i));

  // ---------- Teams tab actions (v1.9.18) ----------
  const createTeam = async () => {
    if (!newTeamName.trim()) { setMsg('Enter a team name first.'); return; }
    const res = await adminCreateTeam(newTeamName);
    setMsg(res.error ? `Error: ${res.error}` : `Team "${res.team?.name || newTeamName.trim()}" created.`);
    if (!res.error) { setNewTeamName(''); if (!res.team?.id) return; setRosterTeam(res.team.id); reload(); }
  };

  const addMember = async () => {
    if (!rosterTeam || !rosterAthlete) { setMsg('Pick a team and an athlete.'); return; }
    const res = await adminAddTeamMembership(rosterAthlete, rosterTeam);
    setMsg(res.error
      ? `Error: ${res.error}`
      : 'Athlete added to the team. Remember to grant their pods via the Grants tab.');
    if (!res.error) { setRosterAthlete(''); reload(); }
  };

  const removeMember = async (m) => {
    const name = m.athletes?.name || m.athlete_id;
    if (!window.confirm(`Remove ${name} from ${m.teams?.name || 'the team'}?`)) return;
    const res = await adminRemoveTeamMembership(m.id);
    setMsg(res.error ? `Error: ${res.error}` : `${name} removed from the team.`);
    if (!res.error) reload();
  };

  const toggleMemberActive = async (m) => {
    const res = await adminSetMembershipActive(m.id, !m.is_active);
    setMsg(res.error ? `Error: ${res.error}` : (m.is_active ? 'Membership deactivated.' : 'Membership reactivated.'));
    if (!res.error) reload();
  };

  // v1.10.1: one-click approve a pending signup into their requested club.
  const approvePending = async (p) => {
    const name = p.name || p.email || p.id;
    const club = p.requested_club_name ? ` into ${p.requested_club_name}` : '';
    if (!window.confirm(`Approve ${name}${club}? They get anchored to the club and become grantable.`)) return;
    const res = await adminApproveClubRequest(p.id, p.requested_club_id);
    setMsg(res.error ? `Error: ${res.error}` : `${name} approved. Grant their pods via the Grants tab.`);
    if (!res.error) reload();
  };

  const removeProduct = async (p) => {
    // v1.13.0: hard delete is blocked when any entitlement references the
    // product — sold plans must never silently vanish. Archive instead.
    if (entitlements.some(x => x.product_id === p.id)) {
      setMsg(`"${p.name}" has purchases and cannot be deleted. Archive it instead: existing buyers keep access, and it disappears from the shop and bundle building.`);
      return;
    }
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    const res = await adminDeleteShopProduct(p.id);
    setMsg(res.error ? `Error: ${res.error}` : 'Product deleted.');
    if (!res.error) reload();
  };

  // v1.13.0: archive / restore — hidden from shop front + bundle building,
  // existing entitlements keep working.
  const archiveProduct = async (p) => {
    const archiving = !p.archived_at;
    if (archiving && !window.confirm(`Archive "${p.name}"? It disappears from the shop; existing buyers keep access.`)) return;
    const res = await adminArchiveShopProduct(p.id, archiving);
    setMsg(res.error ? `Error: ${res.error}` : (archiving ? `"${p.name}" archived — existing buyers keep access.` : `"${p.name}" restored to the shop.`));
    if (!res.error) reload();
  };

  const grant = async () => {
    if (!grantAthlete || !grantProduct) { setMsg('Pick an athlete and a product.'); return; }
    const res = await adminGrantEntitlement(grantAthlete, grantProduct);
    // Mirrors the shop purchase path: coach-role products also elevate the
    // athlete to 'coach', so the message confirms it when that happens.
    setMsg(res.error
      ? `Error: ${res.error}`
      : res.roleChanged ? 'Entitlement granted (lifetime). Coach role applied.' : 'Entitlement granted (lifetime).');
    if (!res.error) reload();
  };

  const revoke = async (id) => {
    const res = await adminRevokeEntitlement(id);
    setMsg(res.error
      ? `Error: ${res.error}`
      : res.roleChanged ? 'Entitlement revoked. Coach role removed.' : 'Entitlement revoked.');
    if (!res.error) reload();
  };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isAdmin === null) return <div style={{ padding: 40, fontFamily: 'system-ui' }}><p>Loading…</p></div>;
  // Shop management exists for exactly one account (the shop admin).
  // Anyone else — including other club admins — is silently sent home:
  // no message, no trace. The page simply doesn't exist for them.
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="ms-container">
      <style>{`
        .ms-container { padding: 20px; max-width: 1100px; margin: 0 auto; background: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
        .ms-tabs { display: inline-flex; background: #e2e8f0; padding: 4px; border-radius: 10px; margin-bottom: 16px; }
        .ms-tab { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 700; font-size: 14px; cursor: pointer; background: transparent; color: #64748b; }
        .ms-tab.active { background: #008ed3; color: white; }
        .ms-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
        .ms-form label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; display: block; margin-bottom: 4px; }
        .ms-form input, .ms-form select, .ms-form textarea { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; }
        .ms-btn { padding: 10px 16px; border-radius: 8px; border: none; font-weight: 800; cursor: pointer; font-size: 13px; }
        .ms-btn.primary { background: #008ed3; color: white; }
        .ms-btn.ghost { background: #f1f5f9; color: #0f172a; }
        .ms-btn.danger { background: #fee2e2; color: #b91c1c; }
        .ms-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        .ms-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .ms-table td { padding: 10px 12px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9; }
        .ms-msg { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; font-size: 13px; font-weight: 600; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; }
        .ms-section-title { font-size: 14px; font-weight: 900; color: #0f172a; margin: 8px 0 10px 0; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: 12 }}>
          <ArrowLeft size={28} />
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>Manage Shop</h1>
      </div>

      <div className="ms-tabs">
        <button className={`ms-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Products & Plans</button>
        <button className={`ms-tab ${tab === 'grants' ? 'active' : ''}`} onClick={() => setTab('grants')}>Grants</button>
        <button className={`ms-tab ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>Teams & Signups</button>
      </div>

      {msg && <div className="ms-msg">{msg}</div>}
      {tab === 'products' && (
        <>
          <div className="ms-section-title">{form.slug ? 'Edit / Upsert Product' : 'Add Rehab / Prevention Plan or Product'}</div>
          <div className="ms-form">
            <div><label>Slug (unique key)</label><input value={form.slug} onChange={e => setF('slug', e.target.value)} placeholder="rehab-knee-basic" /></div>
            <div><label>Name</label><input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Full Knee Rehab Protocol" /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Blurb (shown on the shop card)</label><textarea rows={2} value={form.blurb} onChange={e => setF('blurb', e.target.value)} /></div>
            <div><label>Type</label>
              <select value={form.product_type} onChange={e => setF('product_type', e.target.value)}>
                <option value="one_time">One-time purchase</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>
            <div><label>Fulfilment</label>
              <select value={form.fulfilment} onChange={e => setF('fulfilment', e.target.value)}>
                <option value="auto">Automatic (webhook)</option>
                <option value="manual">Manual (admin/POA)</option>
              </select>
            </div>
            <div><label>Price display</label><input value={form.price_display} onChange={e => setF('price_display', e.target.value)} placeholder="$20" /></div>
            <div><label>Price USD (internal)</label><input type="number" value={form.price_usd} onChange={e => setF('price_usd', e.target.value)} placeholder="20" /></div>
            <div><label>Linked program</label>
              <select value={form.linked_program_id} onChange={e => setF('linked_program_id', e.target.value)}>
                <option value="">— none (not a plan) —</option>
                {programs.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </div>
            <div><label>Paddle price id</label><input value={form.paddle_price_id} onChange={e => setF('paddle_price_id', e.target.value)} placeholder="pri_… (leave empty until Paddle is live)" /></div>
            <div><label>Sort order</label><input type="number" value={form.sort_order} onChange={e => setF('sort_order', e.target.value)} /></div>
            <div><label>Options</label>
              <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                <label style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.grants_coach_role} onChange={e => setF('grants_coach_role', e.target.checked)} /> Grants coach role
                </label>
                <label style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} /> Active
                </label>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label>Grants pods (shop-managed pod access)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13 }}>
                {POD_OPTIONS.map(pod => (
                  <label key={pod.key} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={form.grants_pods.includes(pod.key)} onChange={() => togglePod(pod.key)} /> {pod.label}
                  </label>
                ))}
              </div>
            </div>
            {/* ---------- v1.13.0: BUNDLE BUILDER ---------- */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Bundle programs (any number — the athlete sees them in this order)</label>
              {bundle.length === 0 && (
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0' }}>
                  No bundle yet. Legacy single-program products can keep using the Linked program field above.
                </p>
              )}
              {bundle.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', width: 22 }}>{i + 1}.</span>
                  <select value={b.program_id} onChange={e => updateBundleRow(i, { program_id: e.target.value })}
                    style={{ flex: '2 1 180px', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }}>
                    <option value="">— choose a program —</option>
                    {programs.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </select>
                  <input placeholder="Stage label (display only)" value={b.stage_label}
                    onChange={e => updateBundleRow(i, { stage_label: e.target.value })}
                    style={{ flex: '1 1 150px', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }} />
                  <input placeholder="Advance criteria (blank = hidden)" value={b.advance_criteria}
                    onChange={e => updateBundleRow(i, { advance_criteria: e.target.value })}
                    style={{ flex: '2 1 180px', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }} />
                  <button className="ms-btn ghost" onClick={() => moveBundle(i, -1)} disabled={i === 0}>↑</button>
                  <button className="ms-btn ghost" onClick={() => moveBundle(i, 1)} disabled={i === bundle.length - 1}>↓</button>
                  <button className="ms-btn danger" onClick={() => removeBundleRow(i)}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="ms-btn ghost" onClick={addBundleRow}>+ Add program to bundle</button>
                {bundle.length > 0 && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {bundle.filter(b => b.program_id).length} program{bundle.filter(b => b.program_id).length === 1 ? '' : 's'} in bundle
                  </span>
                )}
              </div>
            </div>

            {/* ---------- v1.13.0: GUIDANCE CARDS (one sheet per bundle) ---------- */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Guidance cards — do's / don'ts / red flags (one bullet per line)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <textarea value={guidanceDraft.dos} onChange={e => setGuidanceDraft(d => ({ ...d, dos: e.target.value }))}
                    placeholder="DO'S — one per line, e.g. Keep sessions pain-free (max 3/10)" rows={5}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>Do's ({linesToArr(guidanceDraft.dos).length}/20)</span>
                </div>
                <div>
                  <textarea value={guidanceDraft.donts} onChange={e => setGuidanceDraft(d => ({ ...d, donts: e.target.value }))}
                    placeholder="DON'TS / can't-do — one per line, e.g. No pivoting or change-of-direction sports" rows={5}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
                  <span style={{ fontSize: 11, color: '#d97706', fontWeight: 700 }}>Don'ts ({linesToArr(guidanceDraft.donts).length}/20)</span>
                </div>
                <div>
                  <textarea value={guidanceDraft.red_flags} onChange={e => setGuidanceDraft(d => ({ ...d, red_flags: e.target.value }))}
                    placeholder="RED FLAGS (stop & seek advice) — one per line, e.g. Sudden swelling or giving way" rows={4}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
                  <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>Red flags ({linesToArr(guidanceDraft.red_flags).length}/20) — shows on the collapsed card</span>
                </div>
                <div>
                  <textarea value={guidanceDraft.note} onChange={e => setGuidanceDraft(d => ({ ...d, note: e.target.value }))}
                    placeholder="Short note — one paragraph of context" rows={4}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>Short note</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {products.filter(x => x.id !== form.id && x.athlete_guidance).length > 0 && (
                  <select value="" style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12 }}
                    onChange={e => {
                      const src = products.find(x => x.id === e.target.value);
                      if (src && src.athlete_guidance) {
                        setGuidanceDraft(guidanceToDraft(src.athlete_guidance));
                        setMsg(`Guidance pre-filled from "${src.name}" — edit freely and save; the copy is fully independent.`);
                      }
                    }}>
                    <option value="">Copy guidance from an existing bundle…</option>
                    {products.filter(x => x.id !== form.id && x.athlete_guidance).map(x => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                )}
                <span style={{ fontSize: 11.5, color: '#64748b' }}>
                  Previews exactly as the athlete sees them · limits (20 bullets / 300 chars) enforced by the database
                </span>
              </div>
              {(() => {
                const g = draftToGuidance(guidanceDraft);
                if (!g) return null;
                return (
                  <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '10px 12px', marginTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Live preview</span>
                    {g.red_flags.length > 0 && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', margin: '6px 0' }}>
                        <b style={{ fontSize: 12, color: '#b91c1c' }}>Red flags — stop &amp; seek advice</b>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0, color: '#b91c1c', fontSize: 12.5 }}>
                          {g.red_flags.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {g.donts.length > 0 && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 10px', margin: '6px 0' }}>
                        <b style={{ fontSize: 12, color: '#92400e' }}>Don'ts / can't-do</b>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0, color: '#92400e', fontSize: 12.5 }}>
                          {g.donts.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {g.dos.length > 0 && (
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', margin: '6px 0' }}>
                        <b style={{ fontSize: 12, color: '#0f172a' }}>Do's</b>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0, color: '#0f172a', fontSize: 12.5 }}>
                          {g.dos.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {g.note && <p style={{ margin: '6px 0 0 0', fontSize: 12.5, color: '#475569' }}>{g.note}</p>}
                  </div>
                );
              })()}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <button className="ms-btn primary" onClick={saveProduct}>Save Product</button>
            </div>
          </div>

          <div className="ms-section-title">Catalog ({products.length})</div>
          <table className="ms-table">
            <thead>
              <tr><th>Name</th><th>Slug</th><th>Type</th><th>Price</th><th>Paddle</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.name}{p.archived_at && <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>ARCHIVED</span>}</td>
                  <td>{p.slug}</td>
                  <td>{p.product_type}{p.grants_coach_role ? ' + coach' : ''}</td>
                  <td>{p.price_display}</td>
                  <td>{p.paddle_price_id ? '✓ linked' : '—'}</td>
                  <td>{p.is_active ? 'yes' : 'no'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ms-btn ghost" onClick={() => editProduct(p)}>Edit</button>{' '}
                    <button className="ms-btn ghost" onClick={() => archiveProduct(p)}>{p.archived_at ? 'Restore' : 'Archive'}</button>{' '}
                    {!entitlements.some(x => x.product_id === p.id) && (
                      <button className="ms-btn danger" onClick={() => removeProduct(p)}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {tab === 'grants' && (
        <>
          <div className="ms-section-title">Grant an entitlement (pods, plans, manual Team/Club)</div>
          <div className="ms-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'end' }}>
            <div><label>Athlete</label>
              <select value={grantAthlete} onChange={e => setGrantAthlete(e.target.value)}>
                <option value="">— pick an athlete —</option>
                {athletes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email || 'no email'})</option>)}
              </select>
            </div>
            <div><label>Product</label>
              <select value={grantProduct} onChange={e => setGrantProduct(e.target.value)}>
                <option value="">— pick a product —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><button className="ms-btn primary" onClick={grant}>Grant (lifetime)</button></div>
          </div>

          <div className="ms-section-title">Active grants & purchases ({entitlements.length})</div>
          <table className="ms-table">
            <thead>
              <tr><th>Athlete</th><th>Product</th><th>Status</th><th>Purchased</th><th></th></tr>
            </thead>
            <tbody>
              {entitlements.map(e => (
                <tr key={e.id}>
                  <td>{e.athletes ? e.athletes.name : e.athlete_id}</td>
                  <td>{e.shop_products ? e.shop_products.name : e.product_id}</td>
                  <td>{e.status}</td>
                  <td>{new Date(e.purchased_at).toLocaleDateString()}</td>
                  <td><button className="ms-btn danger" onClick={() => revoke(e.id)}>Revoke</button></td>
                </tr>
              ))}
              {entitlements.length === 0 && (
                <tr><td colSpan={5} style={{ color: '#64748b' }}>No entitlements yet.</td></tr>
              )}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
            Tip: to give someone pods by team membership instead, edit <code>athlete_team_memberships.active_pods</code> — the app unions both sources.
          </p>
        </>
      )}
      {tab === 'teams' && (
        <>
          {/* v1.10.1: pending club signups — no email chasing, one click */}
          <div className="ms-section-title">Pending club signups ({pending.length})</div>
          <table className="ms-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Requested club</th><th>Signed up</th><th></th></tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr><td colSpan={5}>No pending signups — everyone is anchored.</td></tr>
              )}
              {pending.map(p => (
                <tr key={p.id}>
                  <td>{p.name || '—'}</td>
                  <td>{p.email || '—'}</td>
                  <td>{p.requested_club_name || '— (skipped the picker)'}</td>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="ms-btn primary" onClick={() => approvePending(p)}>
                      {p.requested_club_name ? 'Approve' : 'Approve to…'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pending.some(p => !p.requested_club_id) && (
            <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 0' }}>
              Stray signups (no requested club) need a target club — pick one:
            </p>
          )}
          {pending.filter(p => !p.requested_club_id).map(p => (
            <div key={p.id} className="ms-form" style={{ margin: '8px 0', gridTemplateColumns: 'minmax(220px, 1fr) auto', alignItems: 'end' }}>
              <div><label>{p.name || p.email}</label>
                <select value={''} onChange={e => approvePending({ ...p, requested_club_id: e.target.value })}>
                  <option value="">— approve into —</option>
                  {teams.map(t => <option key={t.club_id || t.id} value={t.club_id || t.id}>{t.club_name || t.name}</option>)}
                </select>
              </div>
            </div>
          ))}
          <div className="ms-section-title">Create a team</div>
          <div className="ms-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'end' }}>
            <div><label>Team name</label>
              <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. Development Team" />
            </div>
            <div><button className="ms-btn primary" onClick={createTeam}>Create team</button></div>
          </div>

          <div className="ms-section-title">Add an athlete to a team</div>
          <div className="ms-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'end' }}>
            <div><label>Team</label>
              <select value={rosterTeam} onChange={e => setRosterTeam(e.target.value)}>
                <option value="">— pick a team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div><label>Athlete</label>
              <select value={rosterAthlete} onChange={e => setRosterAthlete(e.target.value)}>
                <option value="">— pick an athlete —</option>
                {athletes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email || 'no email'})</option>)}
              </select>
            </div>
            <div><button className="ms-btn primary" onClick={addMember}>Add to team</button></div>
          </div>

          <div className="ms-section-title">Roster ({memberships.length})</div>
          <table className="ms-table">
            <thead>
              <tr><th>Team</th><th>Athlete</th><th>Email</th><th>Joined</th><th>Team pods (legacy)</th><th>Shop pods</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {memberships.map(m => (
                <tr key={m.id}>
                  <td>{m.teams ? m.teams.name : m.team_id}</td>
                  <td>{m.athletes ? m.athletes.name : m.athlete_id}</td>
                  <td>{m.athletes?.email || '—'}</td>
                  <td>{new Date(m.joined_at).toLocaleDateString()}</td>
                  <td>{(m.active_pods || []).join(', ') || '—'}</td>
                  <td>{(() => {
                    // Shop pods = union of pods granted by this athlete's
                    // active/lifetime entitlements (shop_products.grants_pods).
                    // Mirrors the live union the app uses for hub access, so
                    // '—' here genuinely means "no pod access via the shop".
                    const shopPods = [];
                    entitlements.forEach(e => {
                      if (e.athlete_id !== m.athlete_id) return;
                      (e.shop_products?.grants_pods || []).forEach(p => {
                        if (!shopPods.includes(p)) shopPods.push(p);
                      });
                    });
                    return shopPods.join(', ') || '—';
                  })()}</td>
                  <td>{m.is_active ? 'yes' : 'no'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ms-btn ghost" onClick={() => toggleMemberActive(m)}>{m.is_active ? 'Deactivate' : 'Reactivate'}</button>{' '}
                    <button className="ms-btn danger" onClick={() => removeMember(m)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {memberships.length === 0 && (
                <tr><td colSpan={8} style={{ color: '#64748b' }}>No members yet — create a team above, then add athletes.</td></tr>
              )}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
            Membership is the coach-athlete link (lets coaches assign programs). Pods now come from the <b>Grants</b> tab — new members start with none until you grant their bundle. Legacy team-membership pods still work via the union.
          </p>
        </>
      )}
      <HelpButton pageName="Manage Shop" position="bottom-right" />
    </div>
  );
}