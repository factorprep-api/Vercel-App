import { useState, useEffect, useMemo, useRef } from 'react';
import { Dumbbell, Clock, ChevronLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, fetchLogbookByAthlete, getAthleteByEmail } from '../api';
import './my-progress.css';

function normalizeString(str) {
  return String(str).toLowerCase().replace(/\./g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

export default function MyProgress() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxes, setMaxes] = useState([]);
  const [history, setHistory] = useState([]);
  const [programsData, setProgramsData] = useState([]);
  const [athleteName, setAthleteName] = useState('');
  const [activeTab, setActiveTab] = useState('maxes');
  const [exerciseFilter, setExerciseFilter] = useState('All');
  const [selectedSession, setSelectedSession] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const { userEmail, isLoading: authLoading } = useAuth();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (userEmail && !loadedRef.current) {
      loadedRef.current = true;
      loadData();
    }
  }, [userEmail]);

  async function loadData() {
    const cached = localStorage.getItem('fp_progress_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.athleteName) {
          setAthleteName(parsed.athleteName);
          if (parsed.maxes) setMaxes(parsed.maxes);
          if (parsed.history) {
            setHistory(parsed.history);
            setHistoryLoaded(true);
            setLoading(false);
          }
          if (parsed.programs) setProgramsData(parsed.programs);
        }
      } catch {}
    }

    try {
      if (!userEmail) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const athleteResult = await getAthleteByEmail(userEmail);
      let name = '';
      if (athleteResult.status === 'Success') {
        name = athleteResult.athleteName || athleteResult.name || athleteResult.coachName || userEmail.split('@')[0];
      } else {
        name = userEmail.split('@')[0];
      }
      setAthleteName(name);

      const logResult = await fetchLogbookByAthlete(name);
      const logData = logResult.data || [];
      const formattedHistory = logData.map(item => ({
        date: String(item.date || '').split('T')[0],
        prog: item.prog || '',
        ex: item.ex || '',
        intensity: item.intensity || '',
        wt: item.wt || '',
        reps: item.reps || ''
      }));
      setHistory(formattedHistory);
      setHistoryLoaded(true);
      setLoading(false);

      fetchAllData().then(allData => {
        const athletes = allData.athletes;
        const programs = allData.programs || [];
        setProgramsData(programs);

        if (!athletes || !athletes.length) return;
        const headers = athletes[0] || [];
        let athleteRow = null;
        for (let i = 1; i < athletes.length; i++) {
          if (String(athletes[i][0] || '').trim().toLowerCase() === name.toLowerCase()) {
            athleteRow = athletes[i];
            break;
          }
        }
        const parsedMaxes = [];
        if (athleteRow) {
          const skipCols = ['pin', 'email', 'role', 'coach', 'notes', 'phone', 'password', 'program assignment'];
          for (let c = 1; c < headers.length; c++) {
            const liftName = String(headers[c] || '').trim();
            if (!liftName || skipCols.includes(liftName.toLowerCase())) continue;
            const liftWeight = parseFloat(athleteRow[c]);
            if (!isNaN(liftWeight) && liftWeight > 0) {
              parsedMaxes.push({ name: liftName, weight: liftWeight });
            }
          }
        }
        setMaxes(parsedMaxes);
        localStorage.setItem('fp_progress_data', JSON.stringify({
          email: userEmail,
          athleteName: name,
          maxes: parsedMaxes,
          history: formattedHistory,
          programs: programs,
          cachedAt: new Date().toISOString()
        }));
      }).catch(() => {});
    } catch (err) {
      setError('Failed to load progress data. Please refresh.');
      setLoading(false);
    }
  }

  const sessions = useMemo(() => {
    const map = {};
    history.forEach(item => {
      const key = item.date + '|' + item.prog;
      if (!map[key]) map[key] = { date: item.date, prog: item.prog, sets: [] };
      map[key].sets.push(item);
    });
    return Object.values(map).sort((a, b) => {
      if (a.date === b.date) return b.prog.localeCompare(a.prog);
      return b.date.localeCompare(a.date);
    });
  }, [history]);

  const phaseLookup = useMemo(() => {
    const lookup = {};
    if (!programsData.length) return lookup;
    for (let i = 1; i < programsData.length; i++) {
      const row = programsData[i];
      const progName = String(row[0] || '').trim();
      const phase = String(row[2] || '').trim() || 'Work Block';
      const exName = String(row[3] || '').trim();
      if (progName && exName) {
        const key = normalizeString(progName) + '|' + normalizeString(exName);
        if (!lookup[key]) lookup[key] = phase;
      }
    }
    return lookup;
  }, [programsData]);

  const sessionSections = useMemo(() => {
    if (!selectedSession) return [];
    const session = sessions.find(s => s.date === selectedSession.date && s.prog === selectedSession.prog);
    if (!session) return [];

    // Build exercise lookup keyed by normalized name
    const exGroups = {};
    session.sets.forEach(set => {
      const key = normalizeString(set.ex);
      if (!exGroups[key]) exGroups[key] = { name: set.ex, sets: [], phase: null };
      exGroups[key].sets.push(set);
    });

    // Assign phases using program data
    Object.values(exGroups).forEach(group => {
      const lookupKey = normalizeString(selectedSession.prog) + '|' + normalizeString(group.name);
      group.phase = phaseLookup[lookupKey] || 'Other Content';
    });

    const sections = [
      { title: 'Warm Up', items: [], color: '#fd7e14' },
      { title: 'Work Block', items: [], color: '#22c55e' },
      { title: 'Other Content', items: [], color: '#888888' },
      { title: 'Cool Down', items: [], color: '#ef4444' },
    ];

    // Map raw phase names to section titles
    const phaseMapping = {
      'warm up': 'Warm Up', 'warmup': 'Warm Up',
      'work block': 'Work Block', 'workblock': 'Work Block',
      'cool down': 'Cool Down', 'cooldown': 'Cool Down'
    };

    Object.values(exGroups).forEach(group => {
      const phaseTitle = phaseMapping[group.phase?.toLowerCase()] || group.phase;
      const section = sections.find(s => s.title === phaseTitle);
      if (section) section.items.push(group);
    });

    return sections.filter(s => s.items.length > 0);
  }, [selectedSession, sessions, phaseLookup, programsData]);

  const uniqueExercises = useMemo(() => {
    return [...new Set(history.map(h => h.ex).filter(Boolean))].sort();
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (exerciseFilter === 'All') return history;
    return history.filter(h => h.ex === exerciseFilter);
  }, [history, exerciseFilter]);

  return (
    <div className="mp-container">
      <div className="mp-body">
        <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>My Progress</h2>

        {error ? (
          <p className="mp-error">{error}</p>
        ) : (
          <>
            <div className="mp-tabs">
              <button className={`mp-tab ${activeTab === 'maxes' ? 'active' : ''}`} onClick={() => setActiveTab('maxes')}>
                <Dumbbell size={16} /> Metrics (1RM)
              </button>
              <button className={`mp-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                <Clock size={16} /> History Vault
              </button>
            </div>

            {activeTab === 'maxes' && (
              <div className="mp-maxes-card">
                <div className="mp-maxes-header">Current Core Maxes</div>
                <div className="mp-maxes-grid">
                  {maxes.length === 0 ? (
                    <p className="mp-placeholder">No metrics recorded yet.</p>
                  ) : (
                    maxes.map((max, i) => (
                      <div key={i} className="mp-max-item">
                        <div className="mp-max-label">{max.name}</div>
                        <div className="mp-max-value">{max.weight} <span className="mp-max-unit">kg</span></div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="mp-history-card">
                {selectedSession ? (
                  <>
                    <div onClick={() => setSelectedSession(null)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', color: '#008ed3', fontWeight: '600', fontSize: '15px' }}>
                      <ChevronLeft size={18} /> Back to Sessions
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '20px', color: '#333', marginBottom: '4px' }}>{selectedSession.prog}</h3>
                      <p style={{ color: '#666', fontSize: '14px' }}>Completed: {selectedSession.date}</p>
                    </div>
                    {sessionSections.map(section => (
                      <div key={section.title} className="pv-phase-card" style={{ borderTopColor: section.color, borderTopStyle: 'solid', borderTopWidth: '4px', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                        <div className="pv-phase-header" style={{ backgroundColor: section.color, color: '#fff', padding: '8px 16px', fontWeight: '700', fontSize: '15px' }}>
                          {section.title}
                        </div>
                        <div style={{ padding: '12px' }}>
                          {section.items.map(group => (
                            <div key={group.name} style={{ marginBottom: '16px' }}>
                              <h4 style={{ fontSize: '16px', color: '#333', marginBottom: '8px', fontWeight: '600' }}>{group.name}</h4>
                              {group.sets.map((set, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: '14px' }}>
                                  <div>
                                    <strong>Set {idx + 1}:</strong> {set.reps} reps {set.intensity ? '@ ' + set.intensity + '%' : ''}
                                  </div>
                                  <div style={{ fontWeight: '600', color: '#008ed3' }}>
                                    {set.wt}kg x {set.reps}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', color: '#333', marginBottom: '12px' }}>Past Sessions</h3>
                      {!historyLoaded ? (
                        <p className="mp-placeholder">Loading sessions...</p>
                      ) : sessions.length === 0 ? (
                        <p className="mp-placeholder">No sessions recorded yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {sessions.map((session, i) => (
                            <div key={i} onClick={() => setSelectedSession(session)} style={{ cursor: 'pointer', padding: '14px 16px', border: '1px solid #ddd', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = '#008ed3'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,142,211,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.boxShadow = 'none'; }}>
                              <div>
                                <div style={{ fontWeight: '700', fontSize: '16px', color: '#333' }}>{session.prog}</div>
                                <div style={{ color: '#888', fontSize: '13px' }}>{session.date} | {session.sets.length} sets</div>
                              </div>
                              <Clock size={18} color="#008ed3" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '24px 0' }} />

                    <label className="mp-filter-label">Filter Past Workouts:</label>
                    <select className="mp-filter-select" value={exerciseFilter} onChange={e => setExerciseFilter(e.target.value)}>
                      <option value="All">All Movements</option>
                      {uniqueExercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                    </select>
                    <div className="mp-history-list">
                      {filteredHistory.length === 0 ? (
                        <p className="mp-placeholder">No records found.</p>
                      ) : (
                        filteredHistory.map((item, i) => (
                          <div key={i} className="mp-history-item">
                            <div>
                              <div className="mp-hist-date">{item.date} | <span className="mp-hist-prog">{item.prog}</span></div>
                              <div className="mp-hist-ex">{item.ex}</div>
                            </div>
                            <div>
                              <div className="mp-hist-weight">{item.wt} <span className="mp-max-unit">kg</span></div>
                              <div className="mp-hist-reps">x {item.reps} reps</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
