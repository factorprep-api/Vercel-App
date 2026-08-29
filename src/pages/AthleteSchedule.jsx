import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Calendar, Clock, Activity, CheckCircle, BarChart2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { saveScheduleSession, fetchSchedule } from '../api';

export default function AthleteSchedule() {
  const { userEmail, athleteName } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('log'); // 'log' or 'analytics'
  const [scheduleData, setScheduleData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [type, setType] = useState('Field Practice');
  const [duration, setDuration] = useState(60);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (activeTab === 'analytics') loadHistory();
  }, [activeTab]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetchSchedule();
      const logs = res.data || [];
      if (logs.length > 1) {
        const myLogs = logs.slice(1).filter(r => String(r[1]).trim().toLowerCase() === userEmail.toLowerCase() || String(r[2]).trim().toLowerCase() === (athleteName||'').toLowerCase());
        setScheduleData(myLogs.map(r => ({
          rawDate: new Date(r[0]),
          dateStr: new Date(r[0]).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}),
          type: r[3],
          duration: Number(r[4]),
          rpe: Number(r[5]),
          load: Number(r[6])
        })).sort((a,b) => a.rawDate - b.rawDate));
      }
    } catch (e) { setError("Failed to load history."); }
    setLoadingHistory(false);
  }

  async function handleSave() {
    setSaving(true); setError(null);
    const nameToSave = athleteName || userEmail.split('@')[0];
    const loadAU = duration * rpe; 

    const payload = {
      email: userEmail, athlete: nameToSave, type: type, duration: parseInt(duration),
      rpe: parseInt(rpe), load: loadAU, location: 'Mobile Log', notes: notes, status: 'Actual'
    };

    try {
      const res = await saveScheduleSession(payload);
      if (res.status === 'Success') {
        setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setActiveTab('analytics'); }, 1500);
      } else { setError('Failed to log session.'); }
    } catch (err) { setError('Network error. Please try again.'); }
    setSaving(false);
  }

  // Calculate Rolling Analytics
  const loadChartData = useMemo(() => {
    if (scheduleData.length === 0) return [];
    const dailyMap = {};
    scheduleData.forEach(s => {
      const dStr = s.dateStr;
      if (!dailyMap[dStr]) dailyMap[dStr] = { date: dStr, load: 0 };
      dailyMap[dStr].load += s.load;
    });
    return Object.values(dailyMap).slice(-14); // Show last 14 days
  }, [scheduleData]);

  const totalWeeklyLoad = useMemo(() => {
    if (scheduleData.length === 0) return 0;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return scheduleData.filter(s => s.rawDate >= oneWeekAgo).reduce((sum, s) => sum + s.load, 0);
  }, [scheduleData]);

  if (saveSuccess) {
    return (
      <div className="as-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <CheckCircle size={64} color="#f59e0b" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: '#0f172a', margin: 0 }}>Session Logged!</h2>
        <p style={{ color: '#64748b' }}>Load recorded: {duration * rpe} AU</p>
      </div>
    );
  }

  return (
    <div className="as-container">
      <style>{`
        .as-container { padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 100px; }
        .as-header { display: flex; align-items: center; margin-bottom: 20px; }
        .as-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        
        .as-tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #e2e8f0; padding: 4px; border-radius: 8px; }
        .as-tab { flex: 1; padding: 10px; border: none; background: transparent; border-radius: 6px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .as-tab.active { background: #fff; color: #f59e0b; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .as-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .as-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .as-card-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; color: #334155; margin: 0; }
        .as-card-value { font-size: 20px; font-weight: 900; color: #f59e0b; }
        
        .as-select { width: 100%; padding: 12px; font-size: 16px; font-weight: 600; color: #0f172a; border: 2px solid #e2e8f0; border-radius: 8px; background: #fff; outline: none; }
        .as-input-num { width: 100%; padding: 12px; font-size: 24px; font-weight: 900; color: #0f172a; border: 2px solid #e2e8f0; border-radius: 8px; text-align: center; outline: none; }
        .rpe-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: #fef3c7; outline: none; margin: 10px 0; }
        .rpe-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 3px solid #f59e0b; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .slider-labels { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #94a3b8; margin-top: 4px; }
        .notes-input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 80px; outline: none; }
        .save-btn { width: 100%; background-color: #f59e0b; color: white; border: none; padding: 16px; font-size: 16px; font-weight: 800; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); transition: 0.2s; }
        .save-btn:disabled { background-color: #94a3b8; cursor: not-allowed; box-shadow: none; }
      `}</style>

      <div className="as-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', display: 'flex', marginRight: '12px' }}><ArrowLeft size={28} /></button>
        <div><h1 className="as-title">Training Schedule</h1></div>
      </div>

      <div className="as-tabs">
        <button className={`as-tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}><Calendar size={18}/> Log Session</button>
        <button className={`as-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}><BarChart2 size={18}/> Load Analytics</button>
      </div>

      {error && <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '14px' }}>{error}</div>}

      {activeTab === 'log' ? (
        <>
          <div className="as-card">
            <div className="as-card-header"><h3 className="as-card-title"><Calendar size={20} color="#f59e0b" /> Session Type</h3></div>
            <select className="as-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="Field Practice">Field Practice</option>
              <option value="Match / Game">Match / Game</option>
              <option value="Conditioning / Running">Conditioning / Running</option>
              <option value="Rehab / Recovery">Rehab / Recovery</option>
              <option value="Other Sport">Other Sport / Activity</option>
            </select>
          </div>

          <div className="as-card">
            <div className="as-card-header"><h3 className="as-card-title"><Clock size={20} color="#f59e0b" /> Duration (Minutes)</h3></div>
            <input type="number" min="1" className="as-input-num" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>

          <div className="as-card">
            <div className="as-card-header">
              <h3 className="as-card-title"><Activity size={20} color="#f59e0b" /> Session RPE</h3>
              <span className="as-card-value">{rpe}/10</span>
            </div>
            <input type="range" min="1" max="10" step="1" className="rpe-slider" value={rpe} onChange={(e) => setRpe(e.target.value)} />
            <div className="slider-labels"><span>1 (Very Light)</span><span>10 (Max Effort)</span></div>
          </div>

          <button className="save-btn" onClick={handleSave} disabled={saving}>
            <Save size={20} /> {saving ? 'LOGGING...' : `LOG WORKOUT (${duration * rpe} AU)`}
          </button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1, backgroundColor: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>7-Day Total Load</div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#f59e0b' }}>{totalWeeklyLoad} <span style={{ fontSize: '14px', color: '#94a3b8' }}>AU</span></div>
            </div>
          </div>

          <div className="as-card" style={{ padding: '20px 10px 10px 0' }}>
            <h3 style={{ margin: '0 0 16px 20px', fontSize: '16px', color: '#0f172a' }}>Load Trend (14 Days)</h3>
            <div style={{ height: '220px', width: '100%' }}>
              {loadChartData.length === 0 ? <p style={{ textAlign: 'center', color: '#64748b', paddingTop: '40px' }}>No load data yet.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loadChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold' }} />
                    <Line type="monotone" dataKey="load" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#0f172a' }}>Recent Sessions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {scheduleData.length === 0 ? <p style={{ color: '#64748b', textAlign: 'center' }}>No sessions logged.</p> : 
              [...scheduleData].reverse().slice(0, 10).map((s, i) => (
                <div key={i} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#0f172a' }}>{s.type}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{s.dateStr} • {s.duration}m @ RPE {s.rpe}</div>
                  </div>
                  <div style={{ fontWeight: '900', color: '#f59e0b' }}>{s.load} AU</div>
                </div>
              ))
            }
          </div>
        </>
      )}

      <HelpButton pageName="Schedule Input" position="bottom-right" />
    </div>
  );
}
