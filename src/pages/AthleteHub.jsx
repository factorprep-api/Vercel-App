import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ClipboardList, TrendingUp, Timer, Activity, AlertCircle, Calendar } from 'lucide-react';
import { fetchAthletes, getAthleteByEmail, fetchMedicalLogs } from '../api';

export default function AthleteHub() {
  const navigate = useNavigate();
  const { userEmail, athleteName: authAthleteName, isLoading: authLoading } = useAuth();
  
  const podsStorageKey = `fp_athlete_pods_${userEmail || 'guest'}`;
  const medStatusStorageKey = `fp_athlete_med_status_${userEmail || 'guest'}`;

  // Instant render from local cache if available
  const [activePods, setActivePods] = useState(() => {
    try {
      const cached = localStorage.getItem(`fp_athlete_pods_${userEmail || 'guest'}`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [myMedicalStatus, setMyMedicalStatus] = useState(() => {
    try {
      return localStorage.getItem(`fp_athlete_med_status_${userEmail || 'guest'}`) || 'Fully Fit';
    } catch {
      return 'Fully Fit';
    }
  });

  const [loadingPods, setLoadingPods] = useState(() => {
    const cached = localStorage.getItem(`fp_athlete_pods_${userEmail || 'guest'}`);
    return !cached; // If cached, instant render with no blocking spinner!
  });

  useEffect(() => {
    if (!userEmail) return;
    let isMounted = true;

    async function loadData() {
      try {
        // Run lightweight requests in parallel instead of a slow waterfall
        const [athleteResult, athRes, medRes] = await Promise.all([
          getAthleteByEmail(userEmail).catch(() => ({ status: 'Error' })),
          fetchAthletes().catch(() => ({ athletes: [] })),
          fetchMedicalLogs().catch(() => ({ data: [] }))
        ]);

        if (!isMounted) return;

        // Resolve exact athlete name
        const resolvedName = athleteResult && athleteResult.status === 'Success'
          ? (athleteResult.athleteName || athleteResult.name || authAthleteName || '')
          : (authAthleteName || '');
        const nameToMatch = (resolvedName || userEmail.split('@')[0]).trim().toLowerCase();

        // 1. Resolve Pod Access from Athletes Sheet (Column L / Index 11)
        const athletes = athRes.athletes || [];
        let userRow = null;
        for (let i = 1; i < athletes.length; i++) {
          const row = athletes[i];
          if (!row) continue;
          const rowName = String(row[0] || '').trim().toLowerCase();
          const rowEmail = String(row[9] || '').trim().toLowerCase();
          
          if ((rowEmail && rowEmail === userEmail.toLowerCase()) || (nameToMatch && rowName === nameToMatch)) {
            userRow = row;
            break;
          }
        }

        let podsArray = [];
        if (userRow) {
          podsArray = String(userRow[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        }
        
        setActivePods(podsArray);
        try {
          localStorage.setItem(podsStorageKey, JSON.stringify(podsArray));
        } catch {}

        // 2. Resolve Medical Status: ONLY match against THIS athlete's name in Column C (index 2)
        // (Do NOT match coach email in Column B/index 1, as coaches log injuries for other athletes!)
        if (podsArray.includes('medical')) {
          const medLogs = medRes.data || [];
          if (medLogs.length > 1) {
            const myLogs = medLogs.slice(1).filter(r => {
              if (!r || !r[0]) return false;
              const logAthlete = String(r[2] || '').trim().toLowerCase();
              const logEmail = String(r[1] || '').trim().toLowerCase();
              
              // Direct match to athlete's name
              if (nameToMatch && logAthlete === nameToMatch) return true;
              
              // Only fallback to email if the row athlete name is blank and matches userEmail
              if (!logAthlete && logEmail && logEmail === userEmail.toLowerCase()) return true;
              
              return false;
            });

            // Sort newest first
            myLogs.sort((a, b) => new Date(b[0]) - new Date(a[0]));

            if (myLogs.length > 0 && myLogs[0][8] !== 'Yes') {
              const currentStatus = myLogs[0][6] || 'Fully Fit';
              setMyMedicalStatus(currentStatus);
              try { localStorage.setItem(medStatusStorageKey, currentStatus); } catch {}
            } else {
              setMyMedicalStatus('Fully Fit');
              try { localStorage.setItem(medStatusStorageKey, 'Fully Fit'); } catch {}
            }
          } else {
            setMyMedicalStatus('Fully Fit');
            try { localStorage.setItem(medStatusStorageKey, 'Fully Fit'); } catch {}
          }
        } else {
          setMyMedicalStatus('Fully Fit');
          try { localStorage.setItem(medStatusStorageKey, 'Fully Fit'); } catch {}
        }
      } catch (err) {
        console.error("Failed to load hub data", err);
      } finally {
        if (isMounted) setLoadingPods(false);
      }
    }

    loadData();

    return () => { isMounted = false; };
  }, [userEmail, authAthleteName, podsStorageKey, medStatusStorageKey]);

  const allCards = [
    { title: 'Wellness Center', desc: 'Daily readiness log', icon: Activity, path: '/athlete-wellness', color: '#0ea5e9', bgImage: '/athlete-wellness-card.png', podId: 'wellness' },
    { title: 'Medical Vault', desc: 'Report & track injuries', icon: AlertCircle, path: '/athlete-medical', color: '#dc2626', bgImage: '/medical-vault-card.png', podId: 'medical' },
    { title: 'Training Schedule', desc: 'Log field & track sessions', icon: Calendar, path: '/athlete-schedule', color: '#f59e0b', bgImage: '/schedule-card.png', podId: 'schedule' },
    { title: 'My Programs', desc: 'View assigned workouts', icon: ClipboardList, path: '/program-viewer', color: '#008ed3', bgImage: '/program-view-card.png', podId: null },
    { title: 'My Progress', desc: 'Track your workouts', icon: TrendingUp, path: '/progress', color: '#2e7d32', bgImage: '/my-progress-card.png', podId: null },
    { title: 'Interval Timer', desc: 'Custom work/rest intervals', icon: Timer, path: '/interval-timer', color: '#ef4444', bgImage: '/interval-timer-card.png', podId: null }
  ];

  const visibleCards = allCards.filter(card => !card.podId || activePods.includes(card.podId.toLowerCase()));

  const getCardStyle = (card) => {
    let style = {
      flex: '1 1 250px', maxWidth: '300px', height: '240px',
      background: card.bgImage ? `url(${card.bgImage}) center top / cover` : 'white',
      border: '1px solid #ddd', borderRadius: '12px', cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.15s, box-shadow 0.15s',
      position: 'relative', overflow: 'hidden'
    };

    // Red / Amber highlight ONLY if THIS athlete is injured or modified
    if ((card.podId === 'medical' || card.podId === 'wellness') && myMedicalStatus && myMedicalStatus.includes('Cannot Train')) {
      style.border = '2px solid #dc2626'; 
      style.boxShadow = '0 0 12px rgba(220, 38, 38, 0.4)';
    } else if ((card.podId === 'medical' || card.podId === 'wellness') && myMedicalStatus === 'Modified Training') {
      style.border = '2px solid #f59e0b'; 
      style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.4)';
    }
    return style;
  };

  if (authLoading || (loadingPods && activePods.length === 0)) return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <p style={{ color: '#64748b', fontSize: '15px' }}>Loading Hub...</p>
    </div>
  );

  return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '4px', backgroundColor: '#f8fafc', minHeight: 'calc(100vh - 60px)' }}>
      <div className="hub-title-wrapper" style={{ textAlign: 'center', paddingTop: '4px' }}>
        <h1 className="hub-title-mobile" style={{ fontSize: '22px', color: '#333', marginBottom: '4px', margin: '0', marginTop: '0' }}>Athlete Hub</h1>
        {authAthleteName && <p className="hub-welcome" style={{ color: '#666', fontSize: '15px' }}>Welcome, {authAthleteName}</p>}
      </div>

      <div className="hub-cards" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px' }}>
        {visibleCards.map((card, i) => (
          <div key={i} onClick={() => navigate(card.path)} style={getCardStyle(card)}>
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
