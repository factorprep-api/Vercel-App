import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { fetchLogbookByAthlete } from './api';
import { ClipboardList, TrendingUp, Dumbbell } from 'lucide-react';

export default function AthleteHub() {
  const navigate = useNavigate();
  const [athleteName, setAthleteName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAndCache = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const cached = localStorage.getItem('fp_athlete_data');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.email === user.email) {
            setAthleteName(parsed.athleteName || '');
            setLoading(false);
            if (parsed.athleteName) {
              preloadData(user.email, parsed.athleteName);
            }
            return;
          }
        }

        const name = user.user_metadata?.name || user.email.split('@')[0];
        setAthleteName(name);
        setLoading(false);
        preloadData(user.email, name);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    const preloadData = async (email, name) => {
      if (!name) return;
      try {
        const logData = await fetchLogbookByAthlete(name);
        localStorage.setItem('fp_athlete_data', JSON.stringify({
          email,
          athleteName: name,
          history: logData.data || [],
          cachedAt: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Preload failed:', err);
      }
    };

    loadAndCache();
  }, []);

  const cards = [
    { title: 'Program Viewer', desc: 'View your assigned training program', icon: ClipboardList, path: '/program-viewer', color: '#008ed3' },
    { title: 'My Progress', desc: 'Track your maxes and workout history', icon: TrendingUp, path: '/progress', color: '#2e7d32' },
    { title: 'Exercise Library', desc: 'Browse exercises with video demos', icon: Dumbbell, path: '/exercise-library', color: '#d3ca17' }
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', fontFamily: '"Roboto Flex", sans-serif' }}>
        <p>Loading your hub...</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', color: '#333', marginBottom: '4px' }}>Athlete Hub</h1>
        {athleteName && <p style={{ color: '#666', fontSize: '15px' }}>Welcome, {athleteName}</p>}
      </div>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {cards.map((card, i) => (
          <div key={i} onClick={() => navigate(card.path)} style={{
            flex: '1 1 250px', maxWidth: '300px', background: 'white', border: '1px solid #ddd',
            borderRadius: '12px', padding: '24px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            transition: 'transform 0.15s, box-shadow 0.15s'
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
          >
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
        ))}
      </div>
    </div>
  );
}
