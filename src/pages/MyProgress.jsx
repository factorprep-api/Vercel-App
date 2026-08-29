import { useState, useEffect, useMemo, useRef } from 'react';
import { Dumbbell, Clock, ChevronLeft, Activity, HandMetal, Smile, Heart, Moon, Utensils } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, fetchLogbookByAthlete, getAthleteByEmail, fetchWellnessLogs } from '../api';
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
  
  // Wellness State
  const [wellnessMetric, setWellnessMetric] = useState('grip');
  const [activePods, setActivePods] = useState([]);
  const [wellnessLogs, setWellnessLogs] = useState([]);

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

      // Fetch All Data AND Wellness Data
      const [allData, wLogs] = await Promise.all([
        fetchAllData(),
        fetchWellnessLogs()
      ]);

      const athletes = allData.athletes;
      const programs = allData.programs || [];
      setProgramsData(programs);

      if (athletes && athletes.length) {
        const headers = athletes[0] || [];
        let athleteRow = null;
        for (let i = 1; i < athletes.length; i++) {
          if (String(athletes[i][0] || '').trim().toLowerCase() === name.toLowerCase() || 
              String(athletes[i][9] || '').trim().toLowerCase() === userEmail.toLowerCase()) {
            athleteRow = athletes[i];
            break;
          }
        }
        const parsedMaxes = [];
        if (athleteRow) {
          // Parse Active Pods
          const podsString = String(athleteRow[11] || '').toLowerCase();
          setActivePods(podsString.split(',').map(s => s.trim()));

          const skipCols = ['pin', 'email', 'role', 'coach', 'notes', 'phone', 'password', 'program assignment', 'active pods'];
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
      }

      // Parse Wellness Logs
      const rawLogs = wLogs.data || [];
      if (rawLogs.length > 1) {
        const myLogs = rawLogs.slice(1)
          .filter(r => String(r[2]).trim().toLowerCase() === name.toLowerCase() || String(r[1]).trim().toLowerCase() === userEmail.toLowerCase())
          .map(r => {
             let d = new Date(r[0]);
             if(isNaN(d.getTime())) d = new Date();
             return {
               date: d.toLocaleDateString('en-US', {weekday: 'short'}),
               rawDate: d,
               grip: Number(r[3]) || 0,
               feeling: Number(r[4]) || 0,
               soreness: Number(r[5]) || 0,
               sleep: Number(r[6]) || 0,
               nutrition: Number(r[7]) || 0
             };
          })
          .sort((a,b) => a.rawDate - b.rawDate)
          .slice(-7);
        setWellnessLogs(myLogs);
      }

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

    const exGroups = {};
    session.sets.forEach(set => {
      const key = normalizeString(set.ex);
      if (!exGroups[key]) exGroups[key] = { name: set.ex, sets: [], phase: null };
      exGroups[key].sets.push(set);
    });

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

  const hasWellness = activePods.includes('wellness');

  return (
    <div className="mp-container">
      <style>{`
        .mp-well-btns { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; scrollbar-width: none; }
        .mp-well-btns::-webkit-scrollbar { display: none; }
        .mp-well-btn { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 99px; border: 1px solid #e2e8f0; background: #fff; font-weight: 600; font-size: 13px; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .mp-well-btn.active-grip { background: #eff6ff; border-color: #bfdbfe; color: #3b82f6; }
        .mp-well-btn.active-feeling { background: #e0f2fe; border-color: #bae6fd; color: #0ea5e9; }
        .mp-well-btn.active-soreness { background: #fef2f2; border-color: #fecaca; color: #ef4444; }
        .mp-well-btn.active-sleep { background: #eef2ff; border-color: #e0e7ff; color: #6366f1; }
        .mp-well-btn.active-nutrition { background: #ecfdf5; border-color: #d1fae5; color: #10b981; }
        .mp-chart-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; height: 300px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      `}</style>
      <div className="mp-body">
        <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>My Progress</h2>

        {error ? (
          <p className="mp-error">{error}</p>
        ) : (
          <>
            <div className="mp-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '20px' }}>
              <button className={`mp-tab ${activeTab === 'maxes' ? 'active' : ''}`} onClick={() => setActiveTab('maxes')} style={{ flex: '0 0 auto' }}>
                <Dumbbell size={16} /> Metrics (1RM)
              </button>
              <button className={`mp-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')} style={{ flex: '0 0 auto' }}>
                <Clock size={16} /> History Vault
              </button>
              {hasWellness && (
                <button className={`mp-tab ${activeTab === 'wellness' ? 'active' : ''}`} onClick={() => setActiveTab('wellness')} style={{ flex: '0 0 auto' }}>
                  <Activity size={16} /> Wellness
                </button>
              )}
            </div>

            {activeTab === 'wellness' && hasWellness && (
              <div>
                <h3 style={{ fontSize: '18px', color: '#333', marginBottom: '16px' }}>My 7-Day Trend</h3>
                <div className="mp-well-btns">
                  <button className={`mp-well-btn ${wellnessMetric === 'grip' ? 'active-grip' : ''}`} onClick={() => setWellnessMetric('grip')}><HandMetal size={14} /> Grip</button>
                  <button className={`mp-well-btn ${wellnessMetric === 'feeling' ? 'active-feeling' : ''}`} onClick={() => setWellnessMetric('feeling')}><Smile size={14} /> Feeling</button>
                  <button className={`mp-well-btn ${wellnessMetric === 'soreness' ? 'active-soreness' : ''}`} onClick={() => setWellnessMetric('soreness')}><Heart size={14} /> Soreness</button>
                  <button className={`mp-well-btn ${wellnessMetric === 'sleep' ? 'active-sleep' : ''}`} onClick={() => setWellnessMetric('sleep')}><Moon size={14} /> Sleep</button>
                  <button className={`mp-well-btn ${wellnessMetric === 'nutrition' ? 'active-nutrition' : ''}`} onClick={() => setWellnessMetric('nutrition')}><Utensils size={14} /> Nutrition</button>
                </div>
                
                <div className="mp-chart-box">
                  {wellnessLogs.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8' }}>No logs recorded yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wellnessLogs} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold' }} formatter={(value) => [value.toFixed(1), '']} />
                        {wellnessMetric === 'grip' && <Line type="monotone" dataKey="grip" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {wellnessMetric === 'feeling' && <Line type="monotone" dataKey="feeling" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {wellnessMetric === 'soreness' && <Line type="monotone" dataKey="soreness" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {wellnessMetric === 'sleep' && <Line type="monotone" dataKey="sleep" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {wellnessMetric === 'nutrition' && <Line type="monotone" dataKey="nutrition" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

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

