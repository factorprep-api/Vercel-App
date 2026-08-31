import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Building, Lock, CheckCircle2, AlertCircle, ShieldCheck, Ticket } from 'lucide-react';
import HelpButton from '../components/HelpButton';

const PLANS = [
  { id: 'free', name: 'Lite', monthly: 0, annual: 0, tag: 'Free Forever', features: ['Core Logbook Access', 'Epley 1RM Engine', 'Program Viewer'] },
  { id: 'pro', name: 'Pro Team', monthly: 49, annual: 490, tag: 'Most Popular', features: ['Wellness Pod Access', 'Injury Tracking', 'Advanced Analytics'], popular: true }
];

export default function Shop() {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState('annual');
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [paymentType, setPaymentType] = useState('po');
  const [isSuccess, setIsSuccess] = useState(false);
  const [showCoupons, setShowCoupons] = useState(false);

  // Form State
  const [poName, setPoName] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');

  const handleCheckout = (e) => {
    e.preventDefault();
    setIsSuccess(true);
  };

  const handleApplyPromo = (e) => {
    e.preventDefault();
    if (promoCode.toUpperCase() === 'COACH20') setPromoMsg('20% Discount Applied!');
    else setPromoMsg('Invalid Code');
  };

  return (
    <div className="shop-container">
      <style>{`
        .shop-container { padding: 20px; max-width: 1000px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
        .shop-header { display: flex; align-items: center; margin-bottom: 24px; gap: 12px; }
        .shop-title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; }
        
        .billing-toggle { display: inline-flex; background: #e2e8f0; padding: 4px; border-radius: 12px; margin: 0 auto 32px auto; }
        .billing-btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s; }
        .billing-btn.active { background: #008ed3; color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .billing-btn.inactive { background: transparent; color: #64748b; }

        .plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 32px; }
        .plan-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; position: relative; display: flex; flex-direction: column; }
        .plan-card.popular { border: 2px solid #008ed3; box-shadow: 0 8px 24px rgba(0,142,211,0.15); }
        .plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #008ed3; color: white; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 99px; }
        
        .plan-name { font-size: 20px; font-weight: 900; color: #0f172a; margin-bottom: 8px; }
        .plan-price { font-size: 36px; font-weight: 900; color: #0f172a; margin-bottom: 24px; }
        .plan-features { list-style: none; padding: 0; margin: 0 0 24px 0; flex-grow: 1; }
        .plan-features li { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #475569; margin-bottom: 12px; font-weight: 500; }
        
        .checkout-btn { width: 100%; padding: 12px; border-radius: 8px; font-weight: 800; border: none; cursor: pointer; transition: 0.2s; }
        .checkout-btn.primary { background: #008ed3; color: white; }
        .checkout-btn.secondary { background: #f1f5f9; color: #0f172a; }
        .checkout-btn:hover { opacity: 0.9; }

        /* Checkout Modal */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 16px; }
        .modal-content { background: white; border-radius: 24px; width: 100%; max-width: 500px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .modal-header { background: #0f172a; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 24px; }
        .input-group { margin-bottom: 16px; }
        .input-group label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 4px; text-transform: uppercase; }
        .input-group input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-weight: 600; outline: none; }
        .input-group input:focus { border-color: #008ed3; }
        
        .promo-box { display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .promo-box input { flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
        .promo-box button { padding: 10px 16px; background: #e2e8f0; border: none; border-radius: 8px; font-weight: 800; cursor: pointer; }
      `}</style>

      <div className="shop-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0 }}><ArrowLeft size={28} /></button>
        <h1 className="shop-title">FactorPrep Plans & Billing</h1>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div className="billing-toggle">
          <button className={`billing-btn ${billingCycle === 'monthly' ? 'active' : 'inactive'}`} onClick={() => setBillingCycle('monthly')}>Monthly</button>
          <button className={`billing-btn ${billingCycle === 'annual' ? 'active' : 'inactive'}`} onClick={() => setBillingCycle('annual')}>Annual (Save 20%)</button>
        </div>
      </div>

      <div className="plans-grid">
        {PLANS.map(plan => (
          <div key={plan.id} className={`plan-card ${plan.popular ? 'popular' : ''}`}>
            {plan.popular && <div className="plan-badge"><Sparkles size={12} style={{ display:'inline', marginRight:4 }}/> Most Popular</div>}
            <div className="plan-name">{plan.name}</div>
            <div className="plan-price">${billingCycle === 'annual' ? plan.annual : plan.monthly} <span style={{fontSize:14, color:'#64748b'}}>/ {billingCycle === 'annual' ? 'yr' : 'mo'}</span></div>
            <ul className="plan-features">
              {plan.features.map((f, i) => (
                <li key={i}><ShieldCheck size={16} color="#008ed3"/> {f}</li>
              ))}
            </ul>
            <button className={`checkout-btn ${plan.popular ? 'primary' : 'secondary'}`} onClick={() => setCheckoutPlan(plan)}>
              {plan.id === 'free' ? 'Current Plan' : 'Select Plan'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ background: '#0f172a', borderRadius: '16px', padding: '24px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', display: 'flex', gap: '8px', alignItems: 'center' }}><Ticket size={20} color="#008ed3"/> Have a Coupon Code?</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>Redeem promotional codes and vouchers granted by FactorPrep Admin.</p>
        </div>
        <button onClick={() => setShowCoupons(true)} style={{ background: '#008ed3', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>Redeem</button>
      </div>

      {checkoutPlan && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div style={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={18} color="#008ed3"/> Secure Checkout</div>
              <button onClick={() => setCheckoutPlan(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            </div>
            
            <div className="modal-body">
              {isSuccess ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <CheckCircle2 size={64} color="#10b981" style={{ margin: '0 auto 16px auto' }} />
                  <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Payment Authorized</h2>
                  <p style={{ color: '#64748b', fontSize: '14px' }}>Invoice has been generated. Your Pods will be unlocked by an Admin shortly.</p>
                  <button className="checkout-btn secondary" style={{ marginTop: 24 }} onClick={() => { setCheckoutPlan(null); setIsSuccess(false); }}>Close</button>
                </div>
              ) : (
                <form onSubmit={handleCheckout}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                    <div style={{ flex: 1, padding: 12, border: '2px solid #008ed3', borderRadius: 8, background: '#eff6ff', color: '#008ed3', fontWeight: 800, fontSize: 12, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <Building size={20} /> Direct PO / Net-30
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Athletic Department / School Name</label>
                    <input type="text" required placeholder="e.g. Stanford Athletics" value={poName} onChange={e => setPoName(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Purchase Order (PO) Number</label>
                    <input type="text" required placeholder="PO-2026-99" value={poNumber} onChange={e => setPoNumber(e.target.value)} />
                  </div>

                  <div className="promo-box">
                    <input type="text" placeholder="Promo Code" value={promoCode} onChange={e => setPromoCode(e.target.value)} />
                    <button type="button" onClick={handleApplyPromo}>Apply</button>
                  </div>
                  {promoMsg && <p style={{ fontSize: 12, color: promoMsg.includes('Applied') ? '#10b981' : '#ef4444', marginTop: 8, fontWeight: 700 }}>{promoMsg}</p>}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: '2px dashed #e2e8f0' }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>Total Due:</span>
                    <span style={{ fontSize: 24, fontWeight: 900, color: '#008ed3' }}>${billingCycle === 'annual' ? checkoutPlan.annual : checkoutPlan.monthly}</span>
                  </div>

                  <button type="submit" className="checkout-btn primary" style={{ marginTop: 24 }}>Generate Invoice</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {showCoupons && (
        <div className="modal-overlay" onClick={() => setShowCoupons(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: 32, textAlign: 'center' }}>
            <AlertCircle size={48} color="#f59e0b" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Coupon Engine</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: 24 }}>The admin Coupon Generator is restricted to Desktop view for security.</p>
            <button className="checkout-btn secondary" onClick={() => setShowCoupons(false)}>Close</button>
          </div>
        </div>
      )}

      <HelpButton pageName="Shop" position="bottom-right" />
    </div>
  );
}
