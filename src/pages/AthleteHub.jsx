import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ClipboardList, TrendingUp, Dumbbell, Timer, Activity, AlertCircle, Calendar } from 'lucide-react';
import { fetchAllData, getAthleteByEmail } from '../api';

export default function AthleteHub() {
  const navigate = useNavigate();
  const { userEmail, athleteName, isLoading: authLoading } = useAuth();
  const [activePods, setActivePods] = useState([]);
  const [loadingPods, setLoadingPods] = useState(true);

  useEffect(() => {
    async function loadPods() {
      if (!userEmail) return;
      try {
        // 1. Get the exact name fallback just in case
        const athleteResult = await getAthleteByEmail(userEmail);
        const nameToMatch = athleteResult.status === 'Success' 
            ? (athleteResult.athleteName || athleteResult.name || userEmail.split('@')[0]) 
            : userEmail.split('@')[0];

        // 2. Fetch all rows
        const data = await fetchAllData();
        const athletes = data.athletes || [];
        
        // 3. Bulletproof Search: Check BOTH Name (Col A) and Email (Col J)
        let userRow = null;
        for (let i = 1; i < athletes.length; i++) {
          const rowName = String(athletes[i][0] || '').trim().toLowerCase();
          const rowEmail = String(athletes[i][9] || '').trim().toLowerCase();
          
          if (rowName === nameToMatch.toLowerCase() || (rowEmail !== '' && rowEmail === userEmail.toLowerCase())) {
            userRow = athletes[i];
            break;
          }
        }
        
        if (userRow) {
          const podsString = String(userRow[11] || '').toLowerCase(); // Column L
          const podsArray = podsString.split(',').map(s => s.trim());
          setActivePods(podsArray);
        }
      } catch (err) {
        console.error("Failed to load pods", err);
      }
      setLoadingPods(false);
    }
    loadPods();
  }, [userEmail]);

  const allCards = [
    { title: 'Wellness Center', desc: 'Daily readiness log', icon: Activity, path: '/athlete-wellness', color: '#0ea5e9', bgImage: '/athlete-wellness-card.png', podId: 'wellness' },
    { title: 'Medical Vault', desc: 'Report & track injuries', icon: AlertCircle, path: '/athlete-medical', color: '#dc2626', bgImage: '/medical-vault-card.png', podId: 'medical' },
    { title: 'Training Schedule', desc: 'Log field & track sessions', icon: Calendar, path: '/athlete-schedule', color: '#f59e0b', bgImage: '/schedule-card.png', podId: 'schedule' },
    { title: 'My Programs', desc: 'View assigned workouts', icon: ClipboardList, path: '/program-viewer', color: '#008ed3', bgImage: '/program-view-card.png', podId: null },
    { title: 'My Progress', desc: 'Track your workouts', icon: TrendingUp, path: '/progress', color: '#2e7d32', bgImage: '/my-progress-card.png', podId: null },
    { title: 'Interval Timer', desc: 'Custom work/rest intervals', icon: Timer, path: '/interval-timer', color: '#ef4444', bgImage: '/interval-timer-card.png', podId: null }
  ];

  const visibleCards = allCards.filter(card => !card.podId || activePods.includes(card.podId.toLowerCase()));

  if (authLoading || loadingPods) return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <p>Loading Hub...</p>
    </div>
  );

  return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '4px', backgroundColor: '#f8fafc', minHeight: 'calc(100vh - 60px)' }}>
      <div className="hub-title-wrapper" style={{ textAlign: 'center', paddingTop: '4px' }}>
        <h1 className="hub-title-mobile" style={{ fontSize: '22px', color: '#333', marginBottom: '4px', margin: '0', marginTop: '0' }}>Athlete Hub</h1>
        {athleteName && <p className="hub-welcome" style={{ color: '#666', fontSize: '15px' }}>Welcome, {athleteName}</p>}
      </div>

      <div className="hub-cards" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px' }}>
        {visibleCards.map((card, i) => (
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
          >
            {card.bgImage ? (
              <>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 60%)' }} />
                <div style={{ position: 'absolute', bottom: '20px', left: '24px', right: '24px', zIndex: 1 }}>
                  <h2 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '4px', fontWeight: '700' }}>{card.title}</h2>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>{card.desc}</p>
                </div>
              </>
            ) : (
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: `0 4px 12px ${card.color}40` }}>
                  <card.icon size={32} color="white" strokeWidth={2.5} />
                </div>
                <h2 style={{ fontSize: '20px', color: '#333', marginBottom: '6px', fontWeight: '700' }}>{card.title}</h2>
                <p style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>{card.desc}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

