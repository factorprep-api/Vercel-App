import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import HelpButton from '../components/HelpButton';
import { supabase } from '../supabase';
import {
  isClubAdmin, adminListShopProducts, adminUpsertShopProduct,
  adminDeleteShopProduct, adminListAthletes, adminListEntitlements,
  adminGrantEntitlement, adminRevokeEntitlement
} from '../api';

const EMPTY = {
  slug: '', name: '', blurb: '', product_type: 'one_time', fulfilment: 'auto',
  paddle_price_id: '', linked_program_id: '', price_display: '', price_usd: '',
  grants_coach_role: false, is_active: true, sort_order: 50
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

  const reload = useCallback(async () => {
    const [p, a, e, g] = await Promise.all([
      adminListShopProducts(),
      adminListAthletes(),
      adminListEntitlements(),
      supabase.from('programs').select('id, name').order('name')
    ]);
    setProducts(p.products || []);
    setAthletes(a.athletes || []);
    setEntitlements(e.entitlements || []);
    setPrograms(g.data || []);
  }, []);

  useEffect(() => {
    isClubAdmin().then(res => setIsAdmin(res.isAdmin)).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (isAdmin) reload();
  }, [isAdmin, reload]);

  const saveProduct = async () => {
    const payload = {
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
      sort_order: Number(form.sort_order) || 0
    };
    if (!payload.slug || !payload.name || !payload.price_display) {
      setMsg('Slug, name and price display are required.');
      return;
    }
    const res = await adminUpsertShopProduct(payload);
    setMsg(res.error ? `Error: ${res.error}` : `Saved "${payload.name}".`);
    if (!res.error) { setForm(EMPTY); reload(); }
  };

  const editProduct = (p) => {
    setForm({
      slug: p.slug, name: p.name, blurb: p.blurb || '',
      product_type: p.product_type, fulfilment: p.fulfilment,
      paddle_price_id: p.paddle_price_id || '', linked_program_id: p.linked_program_id || '',
      price_display: p.price_display, price_usd: p.price_usd == null ? '' : String(p.price_usd),
      grants_coach_role: !!p.grants_coach_role, is_active: !!p.is_active, sort_order: p.sort_order ?? 50
    });
    setTab('products');
    window.scrollTo({ top: 0 });
  };

  const removeProduct = async (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    const res = await adminDeleteShopProduct(p.id);
    setMsg(res.error ? `Error: ${res.error}` : 'Product deleted.');
    if (!res.error) reload();
  };

  const grant = async () => {
    if (!grantAthlete || !grantProduct) { setMsg('Pick an athlete and a product.'); return; }
    const res = await adminGrantEntitlement(grantAthlete, grantProduct);
    setMsg(res.error ? `Error: ${res.error}` : 'Entitlement granted (lifetime).');
    if (!res.error) reload();
  };

  const revoke = async (id) => {
    const res = await adminRevokeEntitlement(id);
    setMsg(res.error ? `Error: ${res.error}` : 'Entitlement revoked.');
    if (!res.error) reload();
  };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isAdmin === null) return <div style={{ padding: 40, fontFamily: 'system-ui' }}><p>Loading…</p></div>;
  if (!isAdmin) return <div style={{ padding: 40, fontFamily: 'system-ui' }}><p>You are not a club admin.</p></div>;

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="ms-btn ghost" onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Manage Shop</h1>
      </div>

      <div className="ms-tabs">
        <button className={`ms-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Products & Plans</button>
        <button className={`ms-tab ${tab === 'grants' ? 'active' : ''}`} onClick={() => setTab('grants')}>Grants</button>
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
                  <td>{p.name}</td>
                  <td>{p.slug}</td>
                  <td>{p.product_type}{p.grants_coach_role ? ' + coach' : ''}</td>
                  <td>{p.price_display}</td>
                  <td>{p.paddle_price_id ? '✓ linked' : '—'}</td>
                  <td>{p.is_active ? 'yes' : 'no'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ms-btn ghost" onClick={() => editProduct(p)}>Edit</button>{' '}
                    <button className="ms-btn danger" onClick={() => removeProduct(p)}><Trash2 size={13} /></button>
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
      <HelpButton pageName="Manage Shop" position="bottom-right" />
    </div>
  );
}