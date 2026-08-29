import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchAllData, fetchSchedule, saveScheduleSession } from '../api';
import { ArrowLeft, Calendar, BarChart2, Plus, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function CoachSchedule() {
  const { userEmail, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState([]);
  const [scheduleLogs, setScheduleLogs] = useState([]);
  const [expandedAthlete, setExpandedAthlete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Propose Session Modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ athlete: 'All Athletes', date: '', type: 'Field Practice', duration: 60, rpe: 7, location: '', notes: '' });

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
        const name = String(athletes[i][0] || '').trim();
        const pods = String(athletes[i][11] || '').toLowerCase();
        if (name && pods.includes('schedule')) validRoster.push({ name });
      }
      setRoster(validRoster.sort((a, b) => a.name.localeCompare(b.name)));

      const rawLogs = schedData.data || [];
      if (rawLogs.length > 1) {
        const parsed = [];
        rawLogs.slice(1).forEach(r => {
          if (!r[0]) return;
          let d = new Date(r[0]);
          if (isNaN(d.getTime())) d = new Date();
          parsed.push({
            rawDate: d,
            athlete: String(r[2]).trim(),
            type: r[3], duration: Number(r[4]), rpe: Number(r[5]), load: Number(r[6]),
            status: String(r[9] || 'Actual').trim()
          });
        });
        setScheduleLogs(parsed);
      }
    } catch (e) {}
    setLoading(false);
  }

  const rosterWithLoads = useMemo(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
    const twentyEightDaysAgo = new Date(today); twentyEightDaysAgo.setDate(today.getDate() - 28);

    return roster.map(ath => {
      const athLogs = scheduleLogs.filter(l => l.athlete === ath.name && l.status === 'Actual');
      
      const acuteLoad = athLogs.filter(l => l.rawDate >= sevenDaysAgo).reduce((sum, l) => sum + l.load, 0);
      const chronicTotal = athLogs.filter(l => l.rawDate >= twentyEightDaysAgo).reduce((sum, l) => sum + l.load, 0);
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
        if(chartMap[dStr] !== undefined) chartMap[dStr] += l.load;
      });
      const chartData = Object.keys(chartMap).map(k => ({ date: k, load: chartMap[k] }));

      return { ...ath, acuteLoad, chronicLoad, acwr, chartData };
    });
  }, [roster, scheduleLogs]);

  const getAcwrStatus = (acwr) => {
    if (acwr === 0) return { text: 'No Data', color: '#64748b', bg: '#f1f5f9' };
    if (acwr < 0.8) return { text: 'Under-Training', color: '#0ea5e9', bg: '#e0f2fe' };
    if (acwr <= 1.3) return { text: 'Sweet Spot', color: '#16a34a', bg: '#dcfce3' };
    if (acwr <= 1.5) return { text: 'Caution', color: '#f59e0b', bg: '#fef3c7' };
    return { text: 'Danger Zone', color: '#dc2626', bg: '#fef2f2' };
  };

  async function handlePropose() {
    if (!form.date) return alert("Please select a date.");
    setSaving(true);
    try {
      if (form.athlete === 'All Athletes') {
        for (const ath of roster) {
          const payload = {
            email: coachEmail, athlete: ath.name, type: form.type, duration: form.duration,
            rpe: form.rpe, load: form.duration * form.rpe, location: form.location, notes: form.notes, status: 'Proposed'
          };
          await saveScheduleSession(payload);
        }
      } else {
        const payload = {
          email: coachEmail, athlete: form.athlete, type: form.type, duration: form.duration,
          rpe: form.rpe, load: form.duration * form.rpe, location: form.location, notes: form.notes, status: 'Proposed'
        };
        await saveScheduleSession(payload);
      }
      setShowModal(false);
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
        .cs-table { width: 100%; border-collapse: collapse; text-align: left; }
        .cs-table th { padding: 12px; background: #f8fafc; color: #64748b; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
        .cs-table td { padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 15px; color: #0f172a; }
        .cs-badge { padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 800; display: inline-block; text-align: center; }
        
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 16px; }
        .modal-content { background: white; border-radius: 16px; width: 100%; max-width: 450px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .modal-input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; font-size: 14px; outline: none; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3' }}><ArrowLeft size={28} /></button>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Team Load Engine (ACWR)</h1>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <Plus size={18}/> Propose Session
        </button>
      </div>

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
                                    <Line type="monotone" dataKey="load" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
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

      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px 0' }}>Propose Session</h2>
            
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Assign To</label>
            <select className="modal-input" value={form.athlete} onChange={e=>setForm({...form, athlete: e.target.value})}>
              <option value="All Athletes">All Athletes (Entire Roster)</option>
              {roster.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Date</label>
                <input type="date" className="modal-input" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Type</label>
                 <select className="modal-input" value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
                    <option value="Field Practice">Field Practice</option>
                    <option value="Match / Game">Match / Game</option>
                    <option value="Conditioning / Running">Conditioning</option>
                    <option value="Rehab / Recovery">Rehab / Recovery</option>
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

            <button onClick={handlePropose} disabled={saving} style={{ width: '100%', background: '#16a34a', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' }}>
              {saving ? 'Saving...' : `Send Proposed Load (${form.duration * form.rpe} AU)`}
            </button>
          </div>
        </div>
      )}
      <HelpButton pageName="Coach Schedule" position="bottom-right" />
    </div>
  );
}
