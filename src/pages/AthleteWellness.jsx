import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Heart, Moon, Utensils, Smile, HandMetal, CheckCircle, Droplet, ChevronDown, ChevronUp, Trash2, Info } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { saveWellnessLog, saveCycleLog, fetchCycleLogs, deleteCycleLog } from '../api';
import { getCycleContext, PHASE_STATUS, ymd } from '../utils/cycleMath';

export default function AthleteWellness() {
  const { userEmail, athleteName } = useAuth();
  const navigate = useNavigate();

  // The 5 Metrics
  const [grip, setGrip] = useState('');
  const [feeling, setFeeling] = useState(5);
  const [soreness, setSoreness] = useState(5);
  const [sleep, setSleep] = useState(7.5);
  const [nutrition, setNutrition] = useState(5);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  // ---- Cycle tracking (v1.6.0, opt-in) ----
  const [cycleLogs, setCycleLogs] = useState([]); // [{ date, kind, id }]
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleDate, setCycleDate] = useState(ymd(new Date()));
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleMsg, setCycleMsg] = useState(null);

  const loadCycleLogs = async () => {
    try {
      const res = await fetchCycleLogs();
      const rows = (res.data || []).slice(1).filter(r =>
        String(r[1] || '').trim().toLowerCase() === userEmail.toLowerCase() ||
        String(r[2] || '').trim().toLowerCase() === (athleteName || '').toLowerCase()
      );
      setCycleLogs(rows.map(r => ({ date: String(r[0]).split('T')[0], kind: r[3] || 'period_start', id: r[4] })));
    } catch { setCycleLogs([]); }
  };

  useEffect(() => { if (userEmail) loadCycleLogs(); }, [userEmail]);

  const cycleCtx = getCycleContext(cycleLogs.map(c => ({ entryKind: c.kind, entryDate: c.date })));
  const cycleStatusInfo = cycleCtx ? PHASE_STATUS[cycleCtx.status] : null;

  const handleCycleLog = async (entryKind) => {
    if (!cycleDate) { setCycleMsg({ ok: false, text: 'Pick a date first.' }); return; }
    setCycleSaving(true);
    setCycleMsg(null);
    try {
      const res = await saveCycleLog({ entryKind, date: cycleDate, athlete: athleteName, email: userEmail });
      if (res.status === 'Success') {
        setCycleMsg({ ok: true, text: entryKind === 'missed_cycle' ? 'Marked as delayed/absent — thanks for keeping this current.' : 'Period start logged.' });
        await loadCycleLogs();
      } else {
        setCycleMsg({ ok: false, text: 'Could not save: ' + (res.message || 'unknown error') });
      }
    } catch { setCycleMsg({ ok: false, text: 'Network error. Please try again.' }); }
    setCycleSaving(false);
  };

  const handleCycleDelete = async (id) => {
    setCycleSaving(true);
    try { await deleteCycleLog(id); await loadCycleLogs(); } catch {}
    setCycleSaving(false);
  };


  async function handleSave() {
    if (!grip) { alert("Please enter your Grip Strength."); return; }
    
    setSaving(true);
    setError(null);

    const nameToSave = athleteName || userEmail.split('@')[0];

    const payload = {
      email: userEmail,
      athlete: nameToSave,
      grip: parseFloat(grip),
      feeling: parseInt(feeling),
      soreness: parseInt(soreness),
      sleep: parseFloat(sleep),
      nutrition: parseInt(nutrition)
    };

    try {
      const res = await saveWellnessLog(payload);
      if (res.status === 'Success') {
        setSaveSuccess(true);
        setTimeout(() => navigate(-1), 1500);
      } else {
        setError('Failed to save log. ' + (res.message || ''));
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setSaving(false);
  }

  if (saveSuccess) {
    return (
      <div className="aw-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <CheckCircle size={64} color="#10b981" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: '#0f172a', margin: 0 }}>Logged Successfully!</h2>
        <p style={{ color: '#64748b' }}>Your coach has received your data.</p>
      </div>
    );
  }

  return (
    <div className="aw-container">
      <style>{`
        .aw-container { padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 100px; }
        .aw-header { display: flex; align-items: center; margin-bottom: 24px; }
        .aw-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        .aw-subtitle { color: #64748b; font-size: 14px; margin-top: 4px; margin-bottom: 24px; }
        
        .aw-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .aw-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .aw-card-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; color: #334155; margin: 0; }
        .aw-card-value { font-size: 20px; font-weight: 900; }
        
        .aw-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; outline: none; margin: 10px 0; }
        .aw-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 2px solid; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .aw-slider::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 2px solid; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        
        .slider-feeling { background: #e0f2fe; }
        .slider-feeling::-webkit-slider-thumb { border-color: #0ea5e9; }
        .slider-soreness { background: #fecaca; }
        .slider-soreness::-webkit-slider-thumb { border-color: #ef4444; }
        .slider-sleep { background: #e0e7ff; }
        .slider-sleep::-webkit-slider-thumb { border-color: #6366f1; }
        .slider-nutrition { background: #d1fae5; }
        .slider-nutrition::-webkit-slider-thumb { border-color: #10b981; }
        
        .aw-slider-labels { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #94a3b8; margin-top: 4px; }
        
        .aw-input-grip { width: 100%; padding: 12px; font-size: 18px; font-weight: 700; color: #0f172a; border: 2px solid #e2e8f0; border-radius: 8px; text-align: center; outline: none; transition: border-color 0.2s; }
        .aw-input-grip:focus { border-color: #3b82f6; }
        
        .aw-save-btn { width: 100%; background-color: #008ed3; color: white; border: none; padding: 16px; font-size: 16px; font-weight: 700; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; box-shadow: 0 4px 12px rgba(0, 142, 211, 0.3); transition: background-color 0.2s; }
      `}</style>

      <div className="aw-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <h1 className="aw-title">Daily Readiness</h1>
        </div>
      </div>
      <p className="aw-subtitle">Log your morning metrics to help us optimize your training load today.</p>

      {error && <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '14px' }}>{error}</div>}

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><HandMetal size={20} color="#3b82f6" /> Grip Strength (Dyno)</h3>
        </div>
        <input type="number" step="0.1" className="aw-input-grip" placeholder="Enter kg (e.g. 45.2)" value={grip} onChange={(e) => setGrip(e.target.value)} />
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Smile size={20} color="#0ea5e9" /> 1. How are you feeling?</h3>
          <span className="aw-card-value" style={{ color: '#0ea5e9' }}>{feeling}/10</span>
        </div>
        <input type="range" min="0" max="10" step="1" className="aw-slider slider-feeling" value={feeling} onChange={(e) => setFeeling(e.target.value)} />
        <div className="aw-slider-labels"><span>0 (Terrible)</span><span>10 (Prime)</span></div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Heart size={20} color="#ef4444" /> 2. Muscle Soreness</h3>
          <span className="aw-card-value" style={{ color: '#ef4444' }}>{soreness}/10</span>
        </div>
        <input type="range" min="0" max="10" step="1" className="aw-slider slider-soreness" value={soreness} onChange={(e) => setSoreness(e.target.value)} />
        <div className="aw-slider-labels"><span>0 (None)</span><span>10 (Extreme)</span></div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Moon size={20} color="#6366f1" /> 3. How was your Sleep?</h3>
          <span className="aw-card-value" style={{ color: '#6366f1' }}>{sleep} hrs</span>
        </div>
        <input type="range" min="0" max="12" step="0.5" className="aw-slider slider-sleep" value={sleep} onChange={(e) => setSleep(e.target.value)} />
        <div className="aw-slider-labels"><span>0 hrs</span><span>12 hrs</span></div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Utensils size={20} color="#10b981" /> 4. How was your Nutrition?</h3>
          <span className="aw-card-value" style={{ color: '#10b981' }}>{nutrition}/10</span>
        </div>
        <input type="range" min="0" max="10" step="1" className="aw-slider slider-nutrition" value={nutrition} onChange={(e) => setNutrition(e.target.value)} />
        <div className="aw-slider-labels"><span>0 (Poor)</span><span>10 (Perfect)</span></div>
      </div>

      {/* ---- CYCLE TRACKING (v1.6.0) — collapsed & discreet by default ---- */}
      <div className="aw-card" style={{ padding: '14px 20px' }}>
        <div className="aw-card-header" onClick={() => setCycleOpen(!cycleOpen)} style={{ marginBottom: 0, cursor: 'pointer' }}>
          <h3 className="aw-card-title" style={{ fontSize: 14 }}><Droplet size={18} color="#8b5cf6" /> Cycle tracking</h3>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cycleCtx && cycleStatusInfo ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: cycleStatusInfo.color, background: cycleStatusInfo.bg, padding: '3px 10px', borderRadius: 999 }}>
                Day {cycleCtx.cycleDay} · {cycleStatusInfo.label.split(' — ')[0]}
              </span>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Optional</span>
            )}
            {cycleOpen ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
          </span>
        </div>

        {cycleOpen && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px 0', lineHeight: 1.5 }}>
              {cycleCtx
                ? 'Log each period start date — the cycle re-bases to it automatically. Edit anytime.'
                : 'Optional. Log a period start date and your training guidance adapts to your cycle phases. One date is all we need to begin.'}
            </p>

            {cycleCtx && cycleStatusInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: cycleStatusInfo.bg, border: `1px solid ${cycleStatusInfo.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: cycleStatusInfo.color }}>Day {cycleCtx.cycleDay} of ~{Math.round(cycleCtx.cycleLength)} · {cycleStatusInfo.label}</span>
                {!cycleCtx.overdue && !cycleCtx.noCycle && !cycleCtx.missedFlagged && cycleCtx.daysUntilNext != null && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>Next predicted start in ~{cycleCtx.daysUntilNext} day{cycleCtx.daysUntilNext === 1 ? '' : 's'}</span>
                )}
              </div>
            )}

            {(cycleCtx?.missedFlagged || cycleCtx?.noCycle || cycleCtx?.irregular) && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                {cycleCtx.missedFlagged && <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 6px 0' }}><b>Cycle marked as delayed/absent.</b> In training athletes, missed cycles can signal over-training or low energy availability — worth raising with your coach or a medical professional.</p>}
                {!cycleCtx.missedFlagged && cycleCtx.noCycle && <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 6px 0' }}><b>No period logged in {cycleCtx.cycleDay} days.</b> In training athletes, this can signal over-training or low energy availability — worth raising with your coach or a medical professional.</p>}
                {cycleCtx.irregular && <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>Your logged intervals vary quite a bit — phase estimates are rough. Regular logging makes them sharper.</p>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="date"
                value={cycleDate}
                max={ymd(new Date())}
                onChange={(e) => setCycleDate(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a', flex: '1 1 150px' }}
              />
              <button
                onClick={() => handleCycleLog('period_start')}
                disabled={cycleSaving}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Period started
              </button>
              <button
                onClick={() => handleCycleLog('missed_cycle')}
                disabled={cycleSaving}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Didn&apos;t come / late
              </button>
            </div>

            {cycleMsg && (
              <p style={{ fontSize: 13, marginTop: 10, marginBottom: 0, color: cycleMsg.ok ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{cycleMsg.text}</p>
            )}

            {cycleLogs.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px 0' }}>History</p>
                {[...cycleLogs].reverse().slice(0, 6).map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>
                      {c.date} — {c.kind === 'missed_cycle' ? <span style={{ color: '#d97706', fontWeight: 700 }}>marked delayed/absent</span> : 'period start'}
                    </span>
                    <button onClick={() => handleCycleDelete(c.id)} disabled={cycleSaving} title="Delete entry" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
              <Info size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.45 }}>
                Private by design: your coach sees your current phase and a low-hormone indicator — never your dates or notes. Hormone curves shown anywhere are population averages for orientation, not individual measurements.
              </p>
            </div>
          </div>
        )}
      </div>

      <button className="aw-save-btn" onClick={handleSave} disabled={saving}>
        <Save size={20} /> {saving ? 'SAVING...' : 'SAVE LOG'}
      </button>

      <HelpButton pageName="Wellness Input" position="bottom-right" />
    </div>
  );
}
