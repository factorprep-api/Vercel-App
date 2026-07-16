import { useState, useEffect, useMemo } from 'react';
import { Dumbbell, Clock } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { fetchAllData, fetchLogbookByAthlete, getAthleteByEmail } from './api';
import './my-progress.css';

export default function MyProgress() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxes, setMaxes] = useState([]);
  const [history, setHistory] = useState([]);
  const [athleteName, setAthleteName] = useState('');
  const [activeTab, setActiveTab] = useState('maxes');
  const [exerciseFilter, setExerciseFilter] = useState('All');
  const { userEmail, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (userEmail) loadData();
  }, [userEmail]);

  async function loadData() {
    const cached = localStorage.getItem('fp_progress_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.athleteName) {
          setAthleteName(parsed.athleteName);
          if (parsed.maxes && Array.isArray(parsed.maxes)) setMaxes(parsed.maxes);
          if (parsed.history && Array.isArray(parsed.history)) setHistory(parsed.history);
          setLoading(false);
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

      const allData = await fetchAllData();
      const athletes = allData.athletes;
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
        const skipCols = ['pin', 'email', 'role', 'coach', 'notes', 'phone', 'password'];
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

      const logResult = await fetchLogbookByAthlete(name);
      const logData = logResult.data || [];
      const formattedHistory = logData.map(item => ({
        date: String(item.date || '').split('T')[0],
        prog: item.prog || '',
        ex: item.ex || '',
        wt: item.wt || '',
        reps: item.reps || ''
      })).reverse();

      setHistory(formattedHistory);

      localStorage.setItem('fp_progress_data', JSON.stringify({
        email: userEmail,
        athleteName: name,
        maxes: parsedMaxes,
        history: formattedHistory,
        cachedAt: new Date().toISOString()
      }));

      setLoading(false);
    } catch (err) {
      setError('Failed to load progress data. Please refresh.');
      setLoading(false);
    }
  }

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
                  {loading && maxes.length === 0 ? (
                    <p className="mp-placeholder">Loading metrics...</p>
                  ) : maxes.length === 0 ? (
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
                <label className="mp-filter-label">Filter Past Workouts:</label>
                <select className="mp-filter-select" value={exerciseFilter} onChange={e => setExerciseFilter(e.target.value)}>
                  <option value="All">All Movements</option>
                  {uniqueExercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                </select>
                <div className="mp-history-list">
                  {loading && history.length === 0 ? (
                    <p className="mp-placeholder">Loading history...</p>
                  ) : filteredHistory.length === 0 ? (
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
