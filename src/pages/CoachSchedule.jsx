import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchAllData, fetchSchedule, saveScheduleSession } from '../api';
import { ArrowLeft, Calendar, BarChart2, Plus, AlertCircle, CheckCircle, Clock, X, AlertTriangle, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CoachSchedule() {
  const { userEmail, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('acwr'); // 'acwr' or 'audit'
  
  const [roster, setRoster] = useState([]);
  const [scheduleLogs, setScheduleLogs] = useState([]);
  const [expandedAthlete, setExpandedAthlete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Propose Session Modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [form, setForm] = useState({ date: '', type: 'Field Session', duration: 60, rpe: 7, location: '', notes: '' });

  // Audit Modal
  const [selectedAuditSession, setSelectedAuditSession] = useState(null);

  const coachEmail = userEmail;

  useEffect(() => {
    if (coachEmail) loadData();
  }, [userEmail]);

  async function loadData() {
    try {
      const [allData, schedData] = await Promise.all([ fetchAllData(), fetchSchedule() ]);
      
      const athletes = allData.athletes || [];
      const validRoster = [];
      
      for (let i = 1; i < athletes.length; i++) {
        if (!athletes[i]) continue;
        const name = String(athletes[i][0] || '').trim();
        const pods = String(athletes[i][11] || '').toLowerCase();
        if (name && pods.includes('schedule')) validRoster.push({ name });
      }
      setRoster(validRoster.sort((a, b) => a.name.localeCompare(b.name)));

      const rawLogs = schedData.data || [];
      if (rawLogs.length > 1) {
        const parsed = [];
        rawLogs.slice(1).forEach(r => {
          if (!r || !r[0]) return;
          let d = new Date(r[0]);
          if (isNaN(d.getTime())) return;
          
          parsed.push({
            rawDate: d,
            dateStr: d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}),
            email: String(r[1]).trim(),
            athlete: String(r[2]).trim(),
            type: r[3] || '',
            proposedMins: Number(r[4]) || 0,
            proposedRpe: Number(r[5]) || 0,
            proposedLoad: Number(r[6]) || 0,
            actualMins: Number(r[7]) || 0,
            actualRpe: Number(r[8]) || 0,
            actualLoad: Number(r[9]) || 0,
            location: r[10] || '',
            notes: r[11] || '',
            status: String(r[12] || 'Actual').trim()
          });
        });
        setScheduleLogs(parsed.sort((a,b) => b.rawDate - a.rawDate)); // Newest first
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  // --- ACWR MATH ---
  const rosterWithLoads = useMemo(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
    const twentyEightDaysAgo = new Date(today); twentyEightDaysAgo.setDate(today.getDate() - 28);

    return roster.map(ath => {
      // Only count completed loads for ACWR
      const athLogs = scheduleLogs.filter(l => l.athlete === ath.name && (l.status === 'Actual' || l.status === 'Modified' || l.status === 'Injury'));
      
      const acuteLoad = athLogs.filter(l => l.rawDate >= sevenDaysAgo).reduce((sum, l) => sum + l.actualLoad, 0);
      const chronicTotal = athLogs.filter(l => l.rawDate >= twentyEightDaysAgo).reduce((sum, l) => sum + l.actualLoad, 0);
      const chronicLoad = chronicTotal / 4; 
      
      let acwr = 0;
      if (chronicLoad > 0) acwr = acuteLoad / chronicLoad;

      const chartMap = {};
      for(let i=13; i>=0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        chartMap[d.toLocaleDateString('en-US', {month:'short', day:'numeric'})] = 0;
      }
      
      athLogs.filter(l => l.rawDate >= new Date(today.getTime() - 14*24*60*60*1000)).forEach(l => {
        const dStr = l.rawDate.toLocaleDateString('en-US', {month:'short', day:'numeric'});
        if(chartMap[dStr] !== undefined) chartMap[dStr] += l.actualLoad;
      });
      const chartData = Object.keys(chartMap).map(k => ({ date: k, load: chartMap[k] }));

      return { ...ath, acuteLoad, chronicLoad, acwr, chartData };
    });
  }, [roster, scheduleLogs]);

  // --- SESSION AUDIT GROUPING ---
  const groupedAuditSessions = useMemo(() => {
    const groups = {};
    scheduleLogs.forEach(log => {
      // Create a unique key for the session event
      const key = `${log.dateStr}|${log.type}|${log.proposedLoad}`;
      if (!groups[key]) {
        groups[key] = {
          dateStr: log.dateStr,
          type: log.type,
          proposedMins: log.proposedMins,
          proposedRpe: log.proposedRpe,
          proposedLoad: log.proposedLoad,
          location: log.location,
          athletes: []
        };
      }
      groups[key].athletes.push(log);
    });
    // Filter out manual logs that didn't have a proposed load
    return Object.values(groups).filter(g => g.proposedLoad > 0);
  }, [scheduleLogs]);

  const getAcwrStatus = (acwr) => {
    if (acwr === 0) return { text: 'No Data', color: '#64748b', bg: '#f1f5f9' };
    if (acwr < 0.8) return { text: 'Under-Training', color: '#0ea5e9', bg: '#e0f2fe' };
    if (acwr <= 1.3) return { text: 'Sweet Spot', color: '#16a34a', bg: '#dcfce3' };
    if (acwr <= 1.5) return { text: 'Caution', color: '#f59e0b', bg: '#fef3c7' };
    return { text: 'Danger Zone', color: '#dc2626', bg: '#fef2f2' };
  };

  const handleToggleAthlete = (athName) => {
    if (selectedAthletes.includes(athName)) {
      setSelectedAthletes(selectedAthletes.filter(n => n !== athName));
    } else {
      setSelectedAthletes([...selectedAthletes, athName]);
    }
  };

  const selectAllAthletes = () => {
    if (selectedAthletes.length === roster.length) setSelectedAthletes([]);
    else setSelectedAthletes(roster.map(a => a.name));
  };

  async function handlePropose() {
    if (selectedAthletes.length === 0) return alert("Select at least one athlete.");
    if (!form.date) return alert("Please select a date.");
    setSaving(true);
    try {
      for (const athName of selectedAthletes) {
        const payload = {
          email: coachEmail, athlete: athName, type: form.type, 
          proposedMins: parseInt(form.duration), proposedRpe: parseInt(form.rpe), 
          actualMins: 0, actualRpe: 0, 
          location: form.location, notes: form.notes, status: 'Proposed'
        };
        await saveScheduleSession(payload);
      }
      setShowModal(false);
      setSelectedAthletes([]);
      setForm({ ...form, notes: '', location: '' }); 
      loadData(); 
    } catch(e) { alert("Failed to save."); }
    setSaving(false);
  }

  const filteredRoster = rosterWithLoads.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (authLoading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        .cs-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
        .cs-tabs { display: flex; gap: 8px; margin-bottom: 20px; background: #e2e8f0; padding: 4px; border-radius: 8px; width: fit-content; }
        .cs-tab { padding: 10px 20px; border: none; background: transparent; border-radius: 6px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
        .cs-tab.active { background: #fff; color: #008ed3; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .cs-table { width: 100%; border-collapse: collapse; text-align: left; }
        .cs-table th { padding: 12px; background: #f8fafc; color: #64748b; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
        .cs-table td { padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 15px; color: #0f172a; }
        .cs-badge { padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 800; display: inline-block; text-align: center; }
        
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 16px; }
        .modal-content { background: white; border-radius: 16px; width: 100%; max-width: 500px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .modal-input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; font-size: 14px; outline: none; }
        
        .roster-list { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; margin-top: 8px; background: #fff; max-height: 180px; overflow-y: auto; }
        .roster-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 4px; cursor: pointer; border-bottom: 1px solid #e2e8f0; }
        .roster-item:hover { background: #f1f5f9; }
        .roster-item:last-child { border-bottom: none; }

        .audit-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; transition: 0.2s; display: flex; justify-content: space-between; align-items: center; }
        .audit-card:hover { border-color: #008ed3; box-shadow: 0 4px 12px rgba(0,142,211,0.05); }
        .audit-status { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 700; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3' }}><ArrowLeft size={28} /></button>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Team Schedule</h1>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <Plus size={18}/> Propose Session
        </button>
      </div>

      <div className="cs-tabs">
        <button className={`cs-tab ${activeTab === 'acwr' ? 'active' : ''}`} onClick={() => setActiveTab('acwr')}><BarChart2 size={18}/> Load Engine (ACWR)</button>
        <button className={`cs-tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}><Users size={18}/> Session Audit</button>
      </div>

      {/* --- TAB 1: ACWR LOAD ENGINE --- */}
      {activeTab === 'acwr' && (
        <div className="cs-card">
          <input type="text" placeholder="Search athlete..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{ width: '100%', maxWidth: '300px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', outline: 'none' }} />
          
          {loading ? <p style={{ color: '#64748b' }}>Calculating ACWR metrics...</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>Athlete</th>
                    <th>Acute Load (7D)</th>
                    <th>Chronic Load (28D Avg)</th>
                    <th>ACWR Status</th>
                    <th>Analytics</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.length === 0 ? <tr><td colSpan="5" style={{ color: '#64748b', textAlign: 'center' }}>No athletes found with Schedule Pod active.</td></tr> : 
                    filteredRoster.map((ath, idx) => {
                    const status = getAcwrStatus(ath.acwr);
                    const isExpanded = expandedAthlete === ath.name;
                    return (
                      <React.Fragment key={idx}>
                        <tr>
                          <td>{ath.name}</td>
                          <td style={{ color: '#0ea5e9' }}>{Math.round(ath.acuteLoad)} AU</td>
                          <td style={{ color: '#64748b' }}>{Math.round(ath.chronicLoad)} AU</td>
                          <td>
                            <span className="cs-badge" style={{ backgroundColor: status.bg, color: status.color, minWidth: '100px' }}>
                              {ath.acwr > 0 ? ath.acwr.toFixed(2) : '-'} | {status.text}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => setExpandedAthlete(isExpanded ? null : ath.name)} style={{ background: isExpanded ? '#0f172a' : '#f1f5f9', color: isExpanded ? 'white' : '#475569', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <BarChart2 size={14}/> {isExpanded ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan="5" style={{ padding: 0, borderBottom: '2px solid #e2e8f0' }}>
                              <div style={{ background: '#f8fafc', padding: '20px', borderTop: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: '14px' }}>14-Day Load Trend</h4>
                                <div style={{ height: '200px', width: '100%' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={ath.chartData}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                      <Line type="monotone" dataKey="load" stroke="#008ed3" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: SESSION AUDIT --- */}
      {activeTab === 'audit' && (
        <div>
          <h2 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '16px' }}>Proposed Session History</h2>
          {loading ? <p style={{ color: '#64748b' }}>Loading sessions...</p> : groupedAuditSessions.length === 0 ? <p style={{ color: '#64748b' }}>No proposed sessions found.</p> : (
            groupedAuditSessions.map((session, i) => {
              const totalAssigned = session.athletes.length;
              const completed = session.athletes.filter(a => a.status !== 'Proposed').length;
              
              return (
                <div key={i} className="audit-card" onClick={() => setSelectedAuditSession(session)}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a' }}>{session.type}</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{session.dateStr} • Goal: {session.proposedLoad} AU</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: completed === totalAssigned ? '#16a34a' : '#f59e0b' }}>
                      {completed} / {totalAssigned} Logged
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Click to view audit</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* --- PROPOSE SESSION MODAL --- */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>Propose Session</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20}/></button>
            </div>
            
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Assign To:
              <button onClick={selectAllAthletes} style={{ background: 'none', border: 'none', color: '#008ed3', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {selectedAthletes.length === roster.length ? 'Deselect All' : 'Select All'}
              </button>
            </label>
            
            <div className="roster-list">
              {roster.map(a => (
                <div key={a.name} className="roster-item" onClick={() => handleToggleAthlete(a.name)}>
                  <input type="checkbox" checked={selectedAthletes.includes(a.name)} readOnly style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                  <span style={{ fontSize: '15px', color: '#0f172a', fontWeight: '500' }}>{a.name}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Date</label>
                <input type="date" className="modal-input" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Type</label>
                 <select className="modal-input" value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
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
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Mins</label>
                <input type="number" className="modal-input" value={form.duration} onChange={e=>setForm({...form, duration: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Target RPE</label>
                <input type="number" min="1" max="10" className="modal-input" value={form.rpe} onChange={e=>setForm({...form, rpe: e.target.value})} />
              </div>
            </div>

            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Location / Venue</label>
            <input type="text" className="modal-input" placeholder="e.g. Main Pitch" value={form.location} onChange={e=>setForm({...form, location: e.target.value})} />

            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Notes / Requirements</label>
            <textarea className="modal-input" placeholder="e.g. Bring cleats and running shoes." value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})} style={{ minHeight: '60px', resize: 'vertical' }} />

            <button onClick={handlePropose} disabled={saving || selectedAthletes.length === 0} style={{ width: '100%', background: '#16a34a', color: 'white', border: 'none', padding: '16px', borderRadius: '8px', fontSize: '16px', fontWeight: '800', cursor: (saving || selectedAthletes.length === 0) ? 'not-allowed' : 'pointer', marginTop: '8px', opacity: selectedAthletes.length === 0 ? 0.5 : 1 }}>
              {saving ? 'SAVING...' : `PROPOSE SESSION (${form.duration * form.rpe} AU)`}
            </button>
          </div>
        </div>
      )}

      {/* --- AUDIT SESSION MODAL --- */}
      {selectedAuditSession && (
        <div className="modal-overlay" onClick={() => setSelectedAuditSession(null)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()} style={{ maxWidth: '600px', padding: 0 }}>
            <div style={{ background: '#0f172a', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>{selectedAuditSession.type}</h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>{selectedAuditSession.dateStr} {selectedAuditSession.location && `• ${selectedAuditSession.location}`}</p>
              </div>
              <button onClick={() => setSelectedAuditSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24}/></button>
            </div>
            
            <div style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Target Load</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>{selectedAuditSession.proposedMins}m @ RPE {selectedAuditSession.proposedRpe} <span style={{ color: '#008ed3' }}>({selectedAuditSession.proposedLoad} AU)</span></span>
            </div>

            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {selectedAuditSession.athletes.map((ath, idx) => {
                let rowBg = '#fff';
                let Icon = null;
                let statusColor = '#94a3b8';
                let statusLabel = 'Missing';
                
                if (ath.status === 'Actual') {
                  Icon = CheckCircle; statusColor = '#16a34a'; statusLabel = 'Completed';
                } else if (ath.status === 'Modified') {
                  Icon = AlertTriangle; statusColor = '#f59e0b'; statusLabel = 'Modified'; rowBg = '#fffbeb';
                } else if (ath.status === 'Injury') {
                  Icon = AlertCircle; statusColor = '#dc2626'; statusLabel = 'Incident / Stopped'; rowBg = '#fef2f2';
                }

                return (
                  <div key={idx} style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: rowBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {ath.athlete}
                        {Icon && <span className="audit-status" style={{ color: statusColor, background: `${statusColor}15`, padding: '2px 6px', fontSize: '11px' }}><Icon size={12}/> {statusLabel}</span>}
                      </div>
                      {ath.notes && <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px', fontStyle: 'italic' }}>"{ath.notes}"</div>}
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      {ath.status === 'Proposed' ? (
                        <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>No Data</span>
                      ) : (
                        <>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: statusColor }}>{ath.actualLoad} AU</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{ath.actualMins}m @ RPE {ath.actualRpe}</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <HelpButton pageName="Coach Schedule" position="bottom-right" />
    </div>
  );
}
