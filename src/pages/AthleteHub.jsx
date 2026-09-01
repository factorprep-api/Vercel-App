import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ClipboardList, TrendingUp, Timer, Activity, AlertCircle, Calendar } from 'lucide-react';
import { fetchAthletes, getAthleteByEmail, fetchMedicalLogs } from '../api';

// Module-level in-memory cache for instantaneous route transitions (0ms navigation)
const memoryCache = {
  podsByEmail: {},
  medStatusByEmail: {},
  lastFetchedByEmail: {}
};

function resolveCachedPods(email) {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (memoryCache.podsByEmail[lower]) {
    return memoryCache.podsByEmail[lower];
  }

  // 1. Try email-specific localStorage key
  try {
    const raw = localStorage.getItem(`fp_athlete_pods_${lower}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCache.podsByEmail[lower] = parsed;
        return parsed;
      }
    }
  } catch {}

  // 2. Try fp_athlete_data (cached from login or ProgramViewer)
  try {
    const rawAth = localStorage.getItem('fp_athlete_data');
    if (rawAth) {
      const parsed = JSON.parse(rawAth);
      if (parsed.pods && Array.isArray(parsed.pods)) {
        memoryCache.podsByEmail[lower] = parsed.pods;
        return parsed.pods;
      }
    }
  } catch {}

  // 3. Try fp_program_data (which caches the full athletes table)
  try {
    const rawProg = localStorage.getItem('fp_program_data');
    if (rawProg) {
      const parsed = JSON.parse(rawProg);
      const athletes = parsed.athletes || [];
      for (let i = 1; i < athletes.length; i++) {
        const row = athletes[i];
        if (!row) continue;
        const rowEmail = String(row[9] || '').trim().toLowerCase();
        if (rowEmail === lower) {
          const pods = String(row[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          memoryCache.podsByEmail[lower] = pods;
          return pods;
        }
      }
    }
  } catch {}

  return null;
}

function resolveCachedMedStatus(email) {
  if (!email) return 'Fully Fit';
  const lower = email.toLowerCase();
  if (memoryCache.medStatusByEmail[lower]) {
    return memoryCache.medStatusByEmail[lower];
  }
  try {
    const raw = localStorage.getItem(`fp_athlete_med_status_${lower}`);
    if (raw) {
      memoryCache.medStatusByEmail[lower] = raw;
      return raw;
    }
  } catch {}
  return 'Fully Fit';
}

export default function AthleteHub() {
  const navigate = useNavigate();
  const { userEmail, athleteName: authAthleteName, isLoading: authLoading } = useAuth();
  
  // Instantaneous state initialization from memory or localStorage (0ms!)
  const [activePods, setActivePods] = useState(() => {
    const cached = resolveCachedPods(userEmail);
    // If cached, return it. If not yet known, default to showing standard pods so cards don't flash
    return cached !== null ? cached : ['wellness', 'medical', 'schedule'];
  });

  const [myMedicalStatus, setMyMedicalStatus] = useState(() => {
    return resolveCachedMedStatus(userEmail);
  });

  // Re-sync local cache whenever userEmail resolves
  useEffect(() => {
    if (!userEmail) return;
    const cached = resolveCachedPods(userEmail);
    if (cached !== null) {
      setActivePods(cached);
    }
    const cachedMed = resolveCachedMedStatus(userEmail);
    if (cachedMed) {
      setMyMedicalStatus(cachedMed);
    }
  }, [userEmail]);

  // Background silent sync (never blocks rendering!)
  useEffect(() => {
    if (!userEmail || authLoading) return;
    const lowerEmail = userEmail.toLowerCase();
    
    // If fetched in the last 2 minutes, skip re-fetch to keep navigation instantaneous
    const now = Date.now();
    const lastFetch = memoryCache.lastFetchedByEmail[lowerEmail] || 0;
    if (now - lastFetch < 120000 && memoryCache.podsByEmail[lowerEmail]) {
      return;
    }

    let isMounted = true;

    async function syncDataInBackground() {
      try {
        // Fetch athlete roster to determine pod permissions
        const athRes = await fetchAthletes().catch(() => ({ athletes: [] }));
        if (!isMounted) return;

        const athletes = athRes.athletes || [];
        let userRow = null;
        let athleteNameToMatch = (authAthleteName || '').trim().toLowerCase();

        for (let i = 1; i < athletes.length; i++) {
          const row = athletes[i];
          if (!row) continue;
          const rowName = String(row[0] || '').trim().toLowerCase();
          const rowEmail = String(row[9] || '').trim().toLowerCase();
          
          if (rowEmail === lowerEmail || (athleteNameToMatch && rowName === athleteNameToMatch)) {
            userRow = row;
            if (!athleteNameToMatch && rowName) {
              athleteNameToMatch = rowName;
            }
            break;
          }
        }

        let podsArray = [];
        if (userRow) {
          podsArray = String(userRow[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        } else {
          // If athlete row not found, keep all default pods active
          podsArray = ['wellness', 'medical', 'schedule'];
        }

        // Update memory and localStorage
        memoryCache.podsByEmail[lowerEmail] = podsArray;
        memoryCache.lastFetchedByEmail[lowerEmail] = now;
        try {
          localStorage.setItem(`fp_athlete_pods_${lowerEmail}`, JSON.stringify(podsArray));
        } catch {}

        if (isMounted) {
          setActivePods(podsArray);
        }

        // Check medical status ONLY if the athlete has access to the medical pod
        if (podsArray.includes('medical')) {
          const medRes = await fetchMedicalLogs().catch(() => ({ data: [] }));
          if (!isMounted) return;

          const medLogs = medRes.data || [];
          let currentStatus = 'Fully Fit';

          if (medLogs.length > 1) {
            // STRICT MATCH: Only match rows where Column C (index 2) is this specific athlete's name
            // Never match Column B (coach email) to prevent other athletes' injuries from highlighting your cards!
            const myLogs = medLogs.slice(1).filter(r => {
              if (!r || !r[0]) return false;
              const logAthlete = String(r[2] || '').trim().toLowerCase();
              return athleteNameToMatch && logAthlete && logAthlete === athleteNameToMatch;
            });

            myLogs.sort((a, b) => new Date(b[0]) - new Date(a[0]));

            if (myLogs.length > 0 && myLogs[0][8] !== 'Yes') {
              currentStatus = myLogs[0][6] || 'Fully Fit';
            }
          }

          memoryCache.medStatusByEmail[lowerEmail] = currentStatus;
          try {
            localStorage.setItem(`fp_athlete_med_status_${lowerEmail}`, currentStatus);
          } catch {}

          if (isMounted) {
            setMyMedicalStatus(currentStatus);
          }
        } else {
          memoryCache.medStatusByEmail[lowerEmail] = 'Fully Fit';
          if (isMounted) setMyMedicalStatus('Fully Fit');
        }
      } catch (err) {
        console.warn("Background sync notice:", err);
      }
    }

    syncDataInBackground();

    return () => { isMounted = false; };
  }, [userEmail, authLoading, authAthleteName]);

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

  // Only show a loader if auth is still actively verifying (matches CoachHub standard)
  if (authLoading) {
    return (
      <div style={{ fontFamily: '"Roboto Flex", sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <p style={{ color: '#64748b', fontSize: '15px' }}>Loading...</p>
      </div>
    );
  }

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