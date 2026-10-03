import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle, Check, Info } from 'lucide-react';
import HelpButton from '../components/HelpButton';
import { supabase } from '../supabase';
import { fetchShopProducts, fetchMyEntitlements } from '../api';

const PADDLE_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '';
const PADDLE_ENV = import.meta.env.VITE_PADDLE_ENV || 'production';

// ---------- Paddle.js (overlay checkout) ----------
let paddleReady = null;
function loadPaddle() {
  if (paddleReady) return paddleReady;
  paddleReady = new Promise((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle);
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = () => resolve(window.Paddle);
    s.onerror = () => reject(new Error('Could not load Paddle checkout'));
    document.body.appendChild(s);
  });
  return paddleReady;
}

let paddleInitialized = false;
async function initPaddle(onCompleted) {
  const Paddle = await loadPaddle();
  if (!paddleInitialized) {
    if (PADDLE_ENV === 'sandbox') Paddle.Environment.set('sandbox');
    Paddle.Initialize({
      token: PADDLE_TOKEN,
      eventCallback(ev) {
        if (ev && ev.name === 'checkout.completed') onCompleted();
      }
    });
    paddleInitialized = true;
  }
  return Paddle;
}

export default function Shop() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [ownedIds, setOwnedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(null); // {title, body, tone}
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    const [prodRes, entRes] = await Promise.all([
      fetchShopProducts().catch(() => ({ products: [] })),
      fetchMyEntitlements().catch(() => ({ entitlements: [] }))
    ]);
    setProducts(prodRes.products || []);
    setOwnedIds(new Set((entRes.entitlements || [])
      .filter(e => e.status === 'active' || e.status === 'lifetime')
      .map(e => e.product_id)));
    setLoadError(prodRes.error || entRes.error || '');
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onCheckoutCompleted = useCallback(async () => {
    try { sessionStorage.setItem('fp_pods_dirty', '1'); } catch {}
    // Fulfilment happens server-side via the Paddle webhook — poll until
    // the entitlement row lands (typically within seconds).
    for (const delay of [3000, 6000, 12000]) {
      await new Promise(r => setTimeout(r, delay));
      await refresh();
    }
  }, [refresh]);

  const buy = async (product) => {
    if (ownedIds.has(product.id)) {
      setModal({ title: 'Already active', body: `You already have access to ${product.name}.`, tone: 'info' });
      return;
    }
    if (product.fulfilment === 'manual') {
      setModal({
        title: product.name,
        body: 'This plan is set up personally by our team. Get in touch and we will onboard you within one business day.',
        tone: 'info'
      });
      return;
    }
    if (!PADDLE_TOKEN || !product.paddle_price_id) {
      setModal({
        title: 'Coming soon',
        body: 'Online billing is not switched on yet. This item is saved in the catalog and becomes purchasable as soon as Paddle is connected. Until then, your club admin can grant you access.',
        tone: 'demo'
      });
      return;
    }
    setBusyId(product.id);
    try {
      const Paddle = await initPaddle(onCheckoutCompleted);
      const { data: { user } } = await supabase.auth.getUser();
      Paddle.Checkout.open({
        items: [{ priceId: product.paddle_price_id, quantity: 1 }],
        customer: user && user.email ? { email: user.email } : undefined,
        customData: { product_slug: product.slug }
      });
    } catch (err) {
      setModal({ title: 'Checkout unavailable', body: String((err && err.message) || err), tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const subs = products.filter(p => p.product_type === 'subscription' && p.fulfilment === 'auto');
  const manual = products.filter(p => p.product_type === 'subscription' && p.fulfilment === 'manual');
  const plans = products.filter(p => p.product_type === 'one_time');
  const demoMode = !PADDLE_TOKEN;

  return (
    <div className="shop-container">
      <style>{`
        .shop-container { padding: 20px; max-width: 1000px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
        .shop-header { display: flex; align-items: center; margin-bottom: 8px; gap: 12px; }
        .shop-title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; }
        .shop-sub { color: #64748b; font-size: 14px; margin: 0 0 20px 0; }
        .demo-banner { background: #fef9c3; border: 1px solid #fde047; color: #854d0e; font-size: 13px; font-weight: 600; padding: 10px 14px; border-radius: 10px; margin-bottom: 20px; }
        .section-label { font-size: 13px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; margin: 24px 0 12px 0; }
        .plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .plan-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; position: relative; display: flex; flex-direction: column; }
        .plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #008ed3; color: white; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 99px; }
        .plan-badge.owned { background: #10b981; }
        .plan-name { font-size: 19px; font-weight: 900; color: #0f172a; margin-bottom: 6px; }
        .plan-price { font-size: 28px; font-weight: 900; color: #008ed3; margin-bottom: 10px; }
        .plan-blurb { font-size: 13px; color: #475569; margin: 0 0 16px 0; flex-grow: 1; }
        .checkout-btn { width: 100%; padding: 12px; border-radius: 8px; font-weight: 800; border: none; cursor: pointer; transition: 0.2s; }
        .checkout-btn.primary { background: #008ed3; color: white; }
        .checkout-btn.secondary { background: #f1f5f9; color: #0f172a; }
        .checkout-btn:disabled { opacity: 0.6; cursor: wait; }
        .free-list { list-style: none; padding: 0; margin: 0 0 16px 0; }
        .free-list li { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #475569; margin-bottom: 8px; font-weight: 500; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal-content { background: white; border-radius: 16px; padding: 28px; max-width: 420px; width: 100%; }
      `}</style>

      <div className="shop-header">
        <button className="checkout-btn secondary" style={{ width: 'auto', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="shop-title">Shop</h1>
      </div>
      <p className="shop-sub">Plans, Pods and specialized rehab programs. Payments are handled securely by Paddle.</p>

      {demoMode && (
        <div className="demo-banner">Demo mode — billing is not connected yet. The catalog is shown; checkouts go live once Paddle is linked.</div>
      )}
      {loadError && (
        <div className="demo-banner" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>Catalog error: {loadError}</div>
      )}

      <div className="section-label">Included Free</div>
      <div className="plans-grid">
        <div className="plan-card">
          <div className="plan-name">Lite</div>
          <div className="plan-price">Free Forever</div>
          <ul className="free-list">
            <li><Check size={16} color="#10b981" /> My Programs & Program Viewer</li>
            <li><Check size={16} color="#10b981" /> My Progress tracking</li>
            <li><Check size={16} color="#10b981" /> Interval Timer</li>
            <li><Check size={16} color="#10b981" /> Epley 1RM engine</li>
          </ul>
          <button className="checkout-btn secondary" disabled>Current Plan</button>
        </div>
      </div>

      {subs.length > 0 && (
        <>
          <div className="section-label">Subscriptions</div>
          <div className="plans-grid">
            {subs.map(p => {
              const owned = ownedIds.has(p.id);
              return (
                <div key={p.id} className="plan-card" style={owned ? { borderColor: '#10b981' } : undefined}>
                  {owned && <div className="plan-badge owned">Active</div>}
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-price">{p.price_display}</div>
                  <p className="plan-blurb">{p.blurb}</p>
                  <button
                    className={`checkout-btn ${owned ? 'secondary' : 'primary'}`}
                    disabled={busyId === p.id}
                    onClick={() => buy(p)}
                    style={{ marginTop: 'auto' }}
                  >
                    {busyId === p.id ? 'Opening checkout…' : owned ? 'Owned' : 'Get Started'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {manual.length > 0 && (
        <>
          <div className="section-label">Teams & Clubs</div>
          <div className="plans-grid">
            {manual.map(p => (
              <div key={p.id} className="plan-card">
                <div className="plan-name">{p.name}</div>
                <div className="plan-price" style={{ fontSize: 22 }}>{p.price_display}</div>
                <p className="plan-blurb">{p.blurb}</p>
                <button className="checkout-btn primary" onClick={() => buy(p)} style={{ marginTop: 'auto' }}>Contact Us</button>
              </div>
            ))}
          </div>
        </>
      )}

      {plans.length > 0 && (
        <>
          <div className="section-label">Rehab & Injury Prevention Plans</div>
          <div className="plans-grid">
            {plans.map(p => {
              const owned = ownedIds.has(p.id);
              return (
                <div key={p.id} className="plan-card" style={owned ? { borderColor: '#10b981' } : undefined}>
                  {owned && <div className="plan-badge owned">Owned</div>}
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-price">{p.price_display}</div>
                  <p className="plan-blurb">{p.blurb}</p>
                  <button
                    className={`checkout-btn ${owned ? 'secondary' : 'primary'}`}
                    disabled={busyId === p.id}
                    onClick={() => buy(p)}
                    style={{ marginTop: 'auto' }}
                  >
                    {busyId === p.id ? 'Opening checkout…' : owned ? 'Owned' : 'Buy Once'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {loading && <p style={{ color: '#64748b', fontSize: 14 }}>Loading catalog…</p>}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            {modal.tone === 'error'
              ? <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px auto' }} />
              : modal.tone === 'demo'
                ? <Info size={48} color="#f59e0b" style={{ margin: '0 auto 16px auto' }} />
                : <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px auto' }} />}
            <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>{modal.title}</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>{modal.body}</p>
            <button className="checkout-btn secondary" onClick={() => setModal(null)}>Close</button>
          </div>
        </div>
      )}

      <HelpButton pageName="Shop" position="bottom-right" />
    </div>
  );
}