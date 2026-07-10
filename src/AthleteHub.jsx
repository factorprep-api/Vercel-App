import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { getAthleteByEmail } from './api';
import { ClipboardList, TrendingUp, Dumbbell } from 'lucide-react';

export default function AthleteHub() {
  const navigate = useNavigate();
  const [athleteName, setAthleteName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadName = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const result = await getAthleteByEmail(user.email);
          if (result.status === 'Success') {
            setAthleteName(result.athleteName || user.user_metadata?.name || 'Athlete');
          }
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    loadName();
  }, []);

  const cards = [
    { title: 'My Programs', desc: 'View assigned workouts', icon: ClipboardList, path: '/my-programs', color: '#008ed3', bgImage: '/av-card.png' },
    { title: 'Public Programs', desc: 'Browse free workouts', icon: TrendingUp, path: '/public-programs', color: '#2e7d32', bgImage: '/progress-card.png' },
    { title: 'Exercise Library', desc: 'Browse exercises with videos', icon: Dumbbell, path: '/exercise-library', color: '#d3ca17', bgImage: '/el-athlete-card.png' }
  ];

  return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#333', marginBottom: '4px' }}>Athlete Hub</h1>
        {athleteName && <p style={{ color: '#666', fontSize: '15px' }}>Welcome, {athleteName}</p>}
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => navigate(card.path)}
            style={{
              flex: '1 1 250px',
              maxWidth: '300px',
              height: '240px',
              background: card.bgImage ? `url(${card.bgImage}) center top / cover` : 'white',
              border: '1px solid #ddd',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
            }}
          >
            {card.bgImage ? (
              <>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 60%)' }} />
                <div style={{ position: 'absolute', bottom: '20px', left: '24px', right: '24px', zIndex: 1 }}>
                  <h2 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '4px', fontWeight: '700', lineHeight: '1.2' }}>{card.title}</h2>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: '1.4' }}>{card.desc}</p>
                </div>
              </>
            ) : (
              <div style={{ padding: '24px' }}>
                <div style={{
                  width: '50px', height: '50px', borderRadius: '50%', background: card.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <card.icon size={24} color="white" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '18px', color: '#333', marginBottom: '6px' }}>{card.title}</h2>
                <p style={{ fontSize: '13px', color: '#888' }}>{card.desc}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
