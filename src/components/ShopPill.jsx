import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Settings2 } from 'lucide-react';
import { isClubAdmin } from '../api';

// Discreet shop entry point, pinned below the app header on the hub pages.
// Shows a "Manage" shortcut only for club admins.
const pillStyle = (bg, color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 12px',
  borderRadius: '999px',
  border: '1px solid rgba(0,0,0,0.08)',
  background: bg,
  color,
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  transition: 'transform 0.15s, box-shadow 0.15s'
});

export default function ShopPill() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    isClubAdmin()
      .then(res => { if (mounted && res.isAdmin) setIsAdmin(true); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <div style={{ position: 'fixed', top: 68, right: 16, zIndex: 60, display: 'flex', gap: 8 }}>
      {isAdmin && (
        <button
          onClick={() => navigate('/manage-shop')}
          style={pillStyle('#f1f5f9', '#475569')}
          title="Manage shop products, plans and grants"
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <Settings2 size={13} /> Manage
        </button>
      )}
      <button
        onClick={() => navigate('/shop')}
        style={pillStyle('#008ed3', '#ffffff')}
        title="Shop — plans, Pods and rehab programs"
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <ShoppingBag size={13} /> Shop
      </button>
    </div>
  );
}