import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Calendar, Clock, Activity, CheckCircle, BarChart2, AlertTriangle, AlertCircle, Check } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { saveScheduleSession, fetchSchedule, fetchAllData, getAthleteByEmail } from '../api';

export default function AthleteSchedule() {
  const { userEmail, athleteName } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('log'); // 'log' or 'analytics'
  const [activePods, setActivePods] = useState([]);
  
  const [completedSessions, setCompletedSessions] = useState([]);
  const [proposedSessions, setProposedSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Manual Log State
  const [showManualLog, setShowManualLog] = useState(false);
  const [type, setType] = useState('Field Session');
  const [duration, setDuration] = useState(60);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');

  // Audit Modal State
  const [selectedProposed, setSelectedProposed] = useState(null);
  const [auditMode, setAuditMode] = useState(null); // 'exact', 'modified', 'injury'
  const [actualMins, setActualMins] = useState('');
  const [actualRpe, setActualRpe] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [userEmail, activeTab]);

  async function loadData() {
    setLoadingHistory(true);
    try {
      // 1. Check if they have the Medical Pod
      const athRes = await getAthleteByEmail(userEmail);
      const nameToMatch = athRes.status === 'Success' ? (athRes.athleteName || athRes.name || userEmail.split('@')[0]) : userEmail.split('@')[0];
      
      const allDataRes = await fetchAllData();
      const athletes = allDataRes.athletes || [];
      let userRow = athletes.find(r => String(r[0]).trim().toLowerCase() === nameToMatch.toLowerCase() || String(r[9]).trim().toLowerCase() === userEmail.toLowerCase());
      if (userRow) {
        setActivePods(String(userRow[11] || '').toLowerCase().split(',').map(s => s.trim()));
      }

      // 2. Load Schedule Data
      const res = await fetchSchedule();
      const logs = res.data || [];
      if (logs.length > 1) {
        const myLogs = [];
        logs.slice(1).forEach(r => {
          if (!r || !r[0]) return;
          const rEmail = String(r[1]).trim().toLowerCase();
          const rName = String(r[2]).trim().toLowerCase();
          if (rEmail === userEmail.toLowerCase() || rName === nameToMatch.toLowerCase()) {
            let d = new Date(r[0]);
            if (!isNaN(d.getTime())) {
              myLogs.push({
                rawDate: d,
                dateStr: d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}),
                type: r[3],
                proposedMins: Number(r[4]) || 0,
                proposedRpe: Number(r[5]) || 0,
                proposedLoad: Number(r[6]) || 0,
                actualMins: Number(r[7]) || 0,
                actualRpe: Number(r[8]) || 0,
                actualLoad: Number(r[9]) || 0,
                location: r[10] || '',
                notes: r[11] || '',
                status: String(r[12] || 'Actual').trim() // "Proposed", "Actual", "Modified", "Injury"
              });
            }
          }
        });

        const completed = myLogs.filter(s => s.status !== 'Proposed');
        const proposed = myLogs.filter(s => s.status === 'Proposed');

        // Hide proposed sessions if the athlete already logged a completed session for that exact type within 24 hours
        const activeGhostCards = proposed.filter(p => {
          return !completed.some(c => c.type === p.type && Math.abs(c.rawDate - p.rawDate) < 86400000 * 2);
        });

        setCompletedSessions(completed.sort((a,b) => a.rawDate - b.rawDate));
        setProposedSessions(activeGhostCards.reverse());
      }
    } catch (e) { setError("Failed to load history."); }
    setLoadingHistory(false);
  }

  const hasMedicalPod = activePods.includes('medical');

  async function handleSaveManual() {
    setSaving(true); setError(null);
    const nameToSave = athleteName || userEmail.split('@')[0];

    const payload = {
      email: userEmail, athlete: nameToSave, type: type,
      proposedMins: 0, proposedRpe: 0,
      actualMins: parseInt(duration), actualRpe: parseInt(rpe),
      location: 'Mobile Log', notes: notes, status: 'Actual'
    };

    try {
      const res = await saveScheduleSession(payload);
      if (res.status === 'Success') {
        setShowManualLog(false);
        setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setActiveTab('analytics'); }, 1500);
      } else { setError('Failed to log session.'); }
    } catch (err) { setError('Network error. Please try again.'); }
    setSaving(false);
  }

  async function handleSaveAudit() {
    if ((auditMode === 'modified' || auditMode === 'injury') && (!actualMins || !actualRpe)) {
      alert("Please enter your actual Minutes and RPE."); return;
    }
    setSaving(true); setError(null);
    const nameToSave = athleteName || userEmail.split('@')[0];
    
    let finalMins = selectedProposed.proposedMins;
    let finalRpe = selectedProposed.proposedRpe;
    let finalStatus = 'Actual';

    if (auditMode === 'modified') {
      finalMins = parseInt(actualMins); finalRpe = parseInt(actualRpe); finalStatus = 'Modified';
    } else if (auditMode === 'injury') {
      finalMins = parseInt(actualMins); finalRpe = parseInt(actualRpe); finalStatus = 'Injury';
    }

    const payload = {
      email: userEmail, athlete: nameToSave, type: selectedProposed.type,
      proposedMins: selectedProposed.proposedMins, proposedRpe: selectedProposed.proposedRpe,
      actualMins: finalMins, actualRpe: finalRpe,
      location: selectedProposed.location, notes: notes, status: finalStatus
    };

    try {
      const res = await saveScheduleSession(payload);
      if (res.status === 'Success') {
        setSelectedProposed(null); setAuditMode(null); setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setActiveTab('analytics'); }, 1500);
      } else { setError('Failed to log session.'); }
    } catch (err) { setError('Network error. Please try again.'); }
    setSaving(false);
  }

  const loadChartData = useMemo(() => {
    if (completedSessions.length === 0) return [];
    const dailyMap = {};
    completedSessions.forEach(s => {
      const dStr = s.dateStr;
      if (!dailyMap[dStr]) dailyMap[dStr] = { date: dStr, load: 0 };
      dailyMap[dStr].load += s.actualLoad;
    });
    return Object.values(dailyMap).slice(-14);
  }, [completedSessions]);

  const totalWeeklyLoad = useMemo(() => {
    if (completedSessions.length === 0) return 0;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return completedSessions.filter(s => s.rawDate >= oneWeekAgo).reduce((sum, s) => sum + s.actualLoad, 0);
  }, [completedSessions]);

  if (saveSuccess) {
    return (
      <div className="as-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <CheckCircle size={64} color="#16a34a" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: '#0f172a', margin: 0 }}>Session Logged!</h2>
        <p style={{ color: '#64748b' }}>Your coach has received the update.</p>
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
        .as-tab.active { background: #fff; color: #008ed3; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .as-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .ghost-card { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; transition: 0.2s; }
        .ghost-card:hover { border-color: #008ed3; background: #eff6ff; }
        .as-select, .as-input-num { width: 100%; padding: 12px; font-size: 16px; font-weight: 600; color: #0f172a; border: 2px solid #e2e8f0; border-radius: 8px; background: #fff; outline: none; }
        .as-input-num { font-size: 24px; font-weight: 900; text-align: center; }
        .rpe-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: #e2e8f0; outline: none; margin: 10px 0; }
        .rpe-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 3px solid #008ed3; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .notes-input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 80px; outline: none; }
        .save-btn { width: 100%; background-color: #008ed3; color: white; border: none; padding: 16px; font-size: 16px; font-weight: 800; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; box-shadow: 0 4px 12px rgba(0, 142, 211, 0.3); transition: 0.2s; }
        .save-btn:disabled { background-color: #94a3b8; cursor: not-allowed; box-shadow: none; }
        
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); display: flex; justify-content: center; align-items: flex-end; z-index: 1000; padding: 16px; }
        @media (min-width: 600px) { .modal-overlay { align-items: center; } }
        .modal-content { background: white; border-radius: 24px; width: 100%; max-width: 500px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .audit-btn { width: 100%; padding: 16px; border-radius: 12px; border: 2px solid #e2e8f0; background: #fff; font-size: 15px; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 12px; margin-bottom: 12px; cursor: pointer; text-align: left; }
        .audit-btn.green { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
        .audit-btn.orange { border-color: #f59e0b; background: #fffbeb; color: #b45309; }
        .audit-btn.red { border-color: #dc2626; background: #fef2f2; color: #b91c1c; }
      `}</style>

      <div className="as-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}><ArrowLeft size={28} /></button>
        <div><h1 className="as-title">Training Schedule</h1></div>
      </div>

      <div className="as-tabs">
        <button className={`as-tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => { setActiveTab('log'); setShowManualLog(false); setSelectedProposed(null); }}><Calendar size={18}/> Upcoming</button>
        <button className={`as-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}><BarChart2 size={18}/> Analytics</button>
      </div>

      {error && <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '14px' }}>{error}</div>}

      {activeTab === 'log' && !showManualLog && !selectedProposed && (
        <>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#0f172a' }}>Proposed Sessions</h3>
          {loadingHistory ? <p style={{ color: '#64748b' }}>Checking schedule...</p> : proposedSessions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1', marginBottom: '24px' }}>
              <Calendar size={48} color="#94a3b8" style={{ marginBottom: '12px' }} />
              <p style={{ margin: 0, color: '#64748b', fontWeight: '500' }}>No sessions assigned by your coach right now.</p>
            </div>
          ) : (
            proposedSessions.map((s, i) => (
              <div key={i} className="ghost-card" onClick={() => { setSelectedProposed(s); setAuditMode(null); setActualMins(s.proposedMins); setActualRpe(s.proposedRpe); setNotes(''); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '16px' }}>{s.type}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>{s.dateStr}</div>
                </div>
                <div style={{ fontSize: '14px', color: '#475569', marginBottom: '8px' }}>
                  <strong>Target:</strong> {s.proposedMins} mins @ RPE {s.proposedRpe} <span style={{ color: '#94a3b8' }}>({s.proposedLoad} AU)</span>
                </div>
                {s.location && <div style={{ fontSize: '12px', color: '#64748b' }}>📍 {s.location}</div>}
                <div style={{ marginTop: '12px', color: '#008ed3', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={16} /> Tap to Log Result
                </div>
              </div>
            ))
          )}

          <div style={{ display: 'flex', alignItems: 'center', margin: '32px 0 24px' }}>
            <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
            <span style={{ padding: '0 12px', color: '#64748b', fontSize: '12px', fontWeight: '700' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
          </div>

          <button onClick={() => setShowManualLog(true)} style={{ width: '100%', padding: '16px', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px', fontWeight: '700', color: '#334155', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            + Log Unplanned Session
          </button>
        </>
      )}

      {selectedProposed && (
        <div className="modal-overlay" onClick={() => !saving && setSelectedProposed(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Log {selectedProposed.type}</h2>
              <button onClick={() => setSelectedProposed(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24}/></button>
            </div>
            
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Coach Proposed:</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>{selectedProposed.proposedMins} mins @ RPE {selectedProposed.proposedRpe}</p>
            </div>

            <h3 style={{ fontSize: '15px', color: '#334155', marginBottom: '12px' }}>Did you complete this as planned?</h3>
            
            <button className={`audit-btn ${auditMode === 'exact' ? 'green' : ''}`} onClick={() => setAuditMode('exact')}>
              <CheckCircle size={20} color={auditMode === 'exact' ? '#16a34a' : '#94a3b8'} />
              Yes, completed exactly as planned
            </button>
            
            <button className={`audit-btn ${auditMode === 'modified' ? 'orange' : ''}`} onClick={() => setAuditMode('modified')}>
              <AlertTriangle size={20} color={auditMode === 'modified' ? '#f59e0b' : '#94a3b8'} />
              No, modified time or intensity
            </button>

            <button className={`audit-btn ${auditMode === 'injury' ? 'red' : ''}`} onClick={() => setAuditMode('injury')}>
              <AlertCircle size={20} color={auditMode === 'injury' ? '#dc2626' : '#94a3b8'} />
              No, stopped due to injury / incident
            </button>

            {(auditMode === 'modified' || auditMode === 'injury') && (
              <div style={{ marginTop: '20px', animation: 'fadeIn 0.3s' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Actual Mins</label>
                    <input type="number" className="as-input-num" style={{ fontSize: '18px', padding: '8px' }} value={actualMins} onChange={e => setActualMins(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Actual RPE</label>
                    <input type="number" min="1" max="10" className="as-input-num" style={{ fontSize: '18px', padding: '8px' }} value={actualRpe} onChange={e => setActualRpe(e.target.value)} />
                  </div>
                </div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Notes (Optional)</label>
                <textarea className="notes-input" placeholder="Why was it modified?" value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: '60px' }} />
                
                {auditMode === 'injury' && hasMedicalPod && (
                  <div style={{ marginTop: '12px', padding: '12px', background: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '13px', color: '#991b1b', display: 'flex', gap: '8px' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>Please remember to log this incident in the <strong>Medical Vault</strong> so your coach can review it.</span>
                  </div>
                )}
              </div>
            )}

            {auditMode && (
              <button className="save-btn" onClick={handleSaveAudit} disabled={saving}>
                {saving ? 'SAVING...' : 'SAVE RESULT'}
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'log' && showManualLog && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', cursor: 'pointer', color: '#64748b', fontWeight: '600' }} onClick={() => setShowManualLog(false)}>
            <ArrowLeft size={18} style={{ marginRight: '6px' }} /> Back to Upcoming
          </div>
          <div className="as-card">
            <div className="as-card-header"><h3 className="as-card-title"><Calendar size={20} color="#008ed3" /> Session Type</h3></div>
            <select className="as-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="Field Session">Field Session</option>
              <option value="Competition">Competition</option>
              <option value="Conditioning">Conditioning</option>
              <option value="Rehabilitation">Rehabilitation</option>
              <option value="Recovery">Recovery</option>
              <option value="Speed / Agility">Speed / Agility</option>
              <option value="Prehabilitation">Prehabilitation</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="as-card">
            <div className="as-card-header"><h3 className="as-card-title"><Clock size={20} color="#008ed3" /> Duration (Minutes)</h3></div>
            <input type="number" min="1" className="as-input-num" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="as-card">
            <div className="as-card-header">
              <h3 className="as-card-title"><Activity size={20} color="#008ed3" /> Session RPE</h3>
              <span className="as-card-value" style={{ color: '#008ed3' }}>{rpe}/10</span>
            </div>
            <input type="range" min="1" max="10" step="1" className="rpe-slider" value={rpe} onChange={(e) => setRpe(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', fontWeight: '600', marginTop: '4px' }}><span>1 (Light)</span><span>10 (Max)</span></div>
          </div>
          <button className="save-btn" onClick={handleSaveManual} disabled={saving}>
            <Save size={20} /> {saving ? 'LOGGING...' : `LOG MANUAL SESSION (${duration * rpe} AU)`}
          </button>
        </div>
      )}

      {activeTab === 'analytics' && (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1, backgroundColor: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>7-Day Total Load</div>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#008ed3' }}>{totalWeeklyLoad} <span style={{ fontSize: '14px', color: '#94a3b8' }}>AU</span></div>
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
                    <Line type="monotone" dataKey="load" stroke="#008ed3" strokeWidth={3} dot={{ r: 4, fill: '#008ed3', strokeWidth: 2, stroke: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#0f172a' }}>Recent Sessions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {completedSessions.length === 0 ? <p style={{ color: '#64748b', textAlign: 'center' }}>No sessions logged.</p> : 
              [...completedSessions].reverse().slice(0, 10).map((s, i) => {
                let statusColor = '#16a34a'; let StatusIcon = Check;
                if (s.status === 'Modified') { statusColor = '#f59e0b'; StatusIcon = AlertTriangle; }
                if (s.status === 'Injury') { statusColor = '#dc2626'; StatusIcon = AlertCircle; }
                
                return (
                  <div key={i} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {s.type}
                        {s.proposedLoad > 0 && <StatusIcon size={14} color={statusColor} title={`Status: ${s.status}`} />}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{s.dateStr} • {s.actualMins}m @ RPE {s.actualRpe}</div>
                    </div>
                    <div style={{ fontWeight: '900', color: '#008ed3' }}>{s.actualLoad} AU</div>
                  </div>
                );
              })
            }
          </div>
        </>
      )}

      <HelpButton pageName="Schedule Input" position="bottom-right" />
    </div>
  );
}
