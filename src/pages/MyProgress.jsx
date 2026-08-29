import { useState, useEffect, useMemo, useRef } from 'react';
import { Dumbbell, Clock, ChevronLeft, ArrowLeft, Activity, HandMetal, Smile, Heart, Moon, Utensils } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, fetchLogbookByAthlete, getAthleteByEmail, fetchWellnessLogs } from '../api';
import HelpButton from '../components/HelpButton';
import './my-progress.css';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function normalizeString(str) { return String(str).toLowerCase().replace(/\./g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim(); }

export default function MyProgress() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxes, setMaxes] = useState([]);
  const [history, setHistory] = useState([]);
  const [programsData, setProgramsData] = useState([]);
  const [athleteName, setAthleteName] = useState('');
  
  const [activeTab, setActiveTab] = useState('maxes');
  const [wellnessMetric, setWellnessMetric] = useState('grip');
  const [activePods, setActivePods] = useState([]);
  const [wellnessLogs, setWellnessLogs] = useState([]);
  
  const [exerciseFilter, setExerciseFilter] = useState('All');
  const [selectedSession, setSelectedSession] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const { userEmail, isLoading: authLoading } = useAuth();
  const loadedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (userEmail && !loadedRef.current) {
      loadedRef.current = true;
      loadData();
    }
  }, [userEmail]);

  async function loadData() {
    try {
      if (!userEmail) { setError('Not authenticated'); setLoading(false); return; }

      const athleteResult = await getAthleteByEmail(userEmail);
      let name = athleteResult.status === 'Success' ? (athleteResult.athleteName || athleteResult.name || userEmail.split('@')[0]) : userEmail.split('@')[0];
      setAthleteName(name);

      const logResult = await fetchLogbookByAthlete(name);
      setHistory(logResult.data ? logResult.data.map(item => ({
        date: String(item.date || '').split('T')[0], prog: item.prog || '', ex: item.ex || '', intensity: item.intensity || '', wt: item.wt || '', reps: item.reps || ''
      })) : []);
      setHistoryLoaded(true);

      const [allData, wellnessData] = await Promise.all([
        fetchAllData(),
        fetchWellnessLogs()
      ]);

      const athletes = allData.athletes;
      setProgramsData(allData.programs || []);

      if (athletes && athletes.length) {
        const headers = athletes[0] || [];
        let athleteRow = null;
        for (let i = 1; i < athletes.length; i++) {
          if (String(athletes[i][9] || '').trim().toLowerCase() === userEmail.toLowerCase().trim() || 
              String(athletes[i][0] || '').trim().toLowerCase() === name.toLowerCase()) {
            athleteRow = athletes[i];
            break;
          }
        }
        
        if (athleteRow) {
          const podsString = String(athleteRow[11] || '').toLowerCase();
          setActivePods(podsString.split(',').map(s => s.trim()));

          const parsedMaxes = [];
          const skipCols = ['pin', 'email', 'role', 'coach', 'notes', 'phone', 'password', 'program assignment', 'active pods'];
          for (let c = 1; c < headers.length; c++) {
            const liftName = String(headers[c] || '').trim();
            if (!liftName || skipCols.includes(liftName.toLowerCase())) continue;
            const liftWeight = parseFloat(athleteRow[c]);
            if (!isNaN(liftWeight) && liftWeight > 0) parsedMaxes.push({ name: liftName, weight: liftWeight });
          }
          setMaxes(parsedMaxes);
        }
      }

      // Process Wellness Logs
      const rawLogs = wellnessData.data || [];
      if (rawLogs.length > 1) {
        const myLogs = rawLogs.slice(1)
          .filter(r => String(r[2]).trim().toLowerCase() === name.toLowerCase() || String(r[1]).trim().toLowerCase() === userEmail.toLowerCase())
          .map(r => ({
             date: new Date(r[0]).toLocaleDateString('en-US', {weekday: 'short'}),
             rawDate: new Date(r[0]),
             grip: Number(r[3]) || 0,
             feeling: Number(r[4]) || 0,
             soreness: Number(r[5]) || 0,
             sleep: Number(r[6]) || 0,
             nutrition: Number(r[7]) || 0
          }))
          .sort((a,b) => a.rawDate - b.rawDate)
          .slice(-7); // Keep only last 7 days
        setWellnessLogs(myLogs);
      }

      setLoading(false);
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
    return Object.values(map).sort((a, b) => a.date === b.date ? b.prog.localeCompare(a.prog) : b.date.localeCompare(a.date));
  }, [history]);

  const uniqueExercises = useMemo(() => [...new Set(history.map(h => h.ex).filter(Boolean))].sort(), [history]);
  const filteredHistory = useMemo(() => exerciseFilter === 'All' ? history : history.filter(h => h.ex === exerciseFilter), [history, exerciseFilter]);

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
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: '12px' }}><ArrowLeft size={28} /></button>
          <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0 }}>My Progress</h2>
        </div>

        {error ? <p className="mp-error">{error}</p> : (
          <>
            <div className="mp-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
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
                  {maxes.length === 0 ? <p className="mp-placeholder">No metrics recorded yet.</p> : maxes.map((max, i) => (
                    <div key={i} className="mp-max-item"><div className="mp-max-label">{max.name}</div><div className="mp-max-value">{max.weight} <span className="mp-max-unit">kg</span></div></div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="mp-history-card">
                               <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '18px', color: '#333', marginBottom: '12px' }}>Past Sessions</h3>
                  
                  <div className="mp-search-box" style={{ marginBottom: '16px' }}>
                    <input type="text" placeholder="Search exercises..." value={exerciseFilter} onChange={e => setExerciseFilter(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                  </div>

                  {!historyLoaded ? <p className="mp-placeholder">Loading sessions...</p> : filteredHistory.length === 0 ? <p className="mp-placeholder">No sessions recorded yet.</p> : (

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {sessions.map((session, i) => (
                        <div key={i} style={{ padding: '14px 16px', border: '1px solid #ddd', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div><div style={{ fontWeight: '700', fontSize: '16px', color: '#333' }}>{session.prog}</div><div style={{ color: '#888', fontSize: '13px' }}>{session.date} | {session.sets.length} sets</div></div>
                          <Clock size={18} color="#008ed3" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <HelpButton pageName="My Progress" position="bottom-right" />
    </div>
  );
}
