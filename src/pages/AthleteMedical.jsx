import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, CheckCircle, Activity, X, FileText } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { saveMedicalLog, fetchMedicalLogs } from '../api';

const BODY_PARTS = [
  'Head / Concussion', 'Neck', 'Left Shoulder', 'Right Shoulder', 'Left Elbow / Arm', 'Right Elbow / Arm',
  'Left Wrist / Hand', 'Right Wrist / Hand', 'Upper Back', 'Lower Back', 'Chest / Ribs', 'Abdomen / Core',
  'Left Hip / Groin', 'Right Hip / Groin', 'Left Quad / Thigh', 'Right Quad / Thigh', 'Left Hamstring', 'Right Hamstring',
  'Left Knee', 'Right Knee', 'Left Calf / Shin', 'Right Calf / Shin', 'Left Ankle / Foot', 'Right Ankle / Foot', 'General Illness / Other'
];

export default function AthleteMedical() {
  const { userEmail, athleteName } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('log'); // 'log' or 'history'
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [selectedPart, setSelectedPart] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const [pain, setPain] = useState(5);
  const [mechanism, setMechanism] = useState('Non-Contact');
  const [status, setStatus] = useState('Modified Training');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetchMedicalLogs();
      const logs = res.data || [];
      if (logs.length > 1) {
        const myLogs = logs.slice(1).filter(r => String(r[1]).trim().toLowerCase() === userEmail.toLowerCase() || String(r[2]).trim().toLowerCase() === (athleteName||'').toLowerCase());
        setMedicalHistory(myLogs.reverse());
      }
    } catch (e) { setError("Failed to load history."); }
    setLoadingHistory(false);
  }

  const handleSelectPart = (part) => {
    setSelectedPart(part); setPain(5); setMechanism('Non-Contact'); setStatus('Modified Training'); setNotes(''); setShowModal(true);
  };

  const handleUpdateExisting = (part) => {
    setSelectedPart(part); setPain(0); setMechanism('Treatment Update'); setStatus('Fully Fit (Cleared)'); setNotes(''); setShowModal(true);
  };

  async function handleSave() {
    setSaving(true); setError(null);
    const nameToSave = athleteName || userEmail.split('@')[0];
    const isResolved = status === 'Fully Fit (Cleared)' ? 'Yes' : 'No';

    const payload = {
      email: userEmail, athlete: nameToSave, bodyPart: selectedPart, pain: parseInt(pain), mechanism: mechanism,
      trainingStatus: status, notes: notes, isResolved: isResolved
    };

    try {
      const res = await saveMedicalLog(payload);
      if (res.status === 'Success') {
        setShowModal(false); setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setActiveTab('history'); }, 2000);
      } else { setError('Failed to log injury.'); }
    } catch (err) { setError('Network error. Please try again.'); }
    setSaving(false);
  }

  if (saveSuccess) {
    return (
      <div className="am-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <CheckCircle size={64} color="#dc2626" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: '#0f172a', margin: 0 }}>Medical Log Saved.</h2>
        <p style={{ color: '#64748b' }}>Your clinical file has been updated.</p>
      </div>
    );
  }

  return (
    <div className="am-container">
      <style>{`
        .am-container { padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 100px; }
        .am-header { display: flex; align-items: center; margin-bottom: 20px; }
        .am-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        
        .am-tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #e2e8f0; padding: 4px; border-radius: 8px; }
        .am-tab { flex: 1; padding: 10px; border: none; background: transparent; border-radius: 6px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .am-tab.active { background: #fff; color: #dc2626; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .anatomy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .anatomy-btn { background: #fff; border: 1px solid #e2e8f0; padding: 16px 12px; border-radius: 12px; font-weight: 600; color: #334155; font-size: 14px; text-align: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .anatomy-btn:hover { border-color: #dc2626; color: #dc2626; background: #fef2f2; }
        .anatomy-btn.full-width { grid-column: span 2; background: #f1f5f9; }

        .hist-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: flex-end; z-index: 1000; padding: 16px; }
        @media (min-width: 600px) { .modal-overlay { align-items: center; } }
        .modal-content { background: white; border-radius: 24px; width: 100%; max-width: 500px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out forwards; max-height: 90vh; overflow-y: auto; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        
        .modal-header { background: #dc2626; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
        .modal-body { padding: 24px; }
        
        .form-group { margin-bottom: 24px; }
        .form-label { display: block; font-weight: 700; color: #0f172a; margin-bottom: 8px; font-size: 15px; }
        
        .pain-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: #fecaca; outline: none; margin: 10px 0; }
        .pain-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 2px solid #dc2626; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .slider-labels { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #94a3b8; margin-top: 4px; }
        
        .pill-group { display: flex; flex-wrap: wrap; gap: 8px; }
        .pill-btn { padding: 10px 16px; border-radius: 99px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; }
        .pill-btn.active { background: #dc2626; color: white; border-color: #dc2626; }
        .pill-btn.active-green { background: #16a34a; color: white; border-color: #16a34a; }
        
        .notes-input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 80px; }
        .notes-input:focus { outline: none; border-color: #dc2626; }

        .save-btn { width: 100%; background-color: #dc2626; color: white; border: none; padding: 16px; font-size: 16px; font-weight: 700; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); transition: 0.2s; }
        .save-btn:disabled { background-color: #94a3b8; cursor: not-allowed; box-shadow: none; }
      `}</style>

      <div className="am-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', marginRight: '12px' }}><ArrowLeft size={28} /></button>
        <div><h1 className="am-title">Medical Vault</h1></div>
      </div>

      <div className="am-tabs">
        <button className={`am-tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}><Activity size={18}/> Log New Issue</button>
        <button className={`am-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}><FileText size={18}/> My Clinical File</button>
      </div>

      {error && <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '14px' }}>{error}</div>}

      {activeTab === 'log' ? (
        <div className="anatomy-grid">
          {BODY_PARTS.map((part, idx) => (
            <button key={idx} className={`anatomy-btn ${part.includes('Head') || part.includes('Neck') || part.includes('Back') || part.includes('Chest') || part.includes('Abdomen') || part.includes('Illness') ? 'full-width' : ''}`} onClick={() => handleSelectPart(part)}>{part}</button>
          ))}
        </div>
      ) : (
        <div>
          {loadingHistory ? <p style={{ textAlign: 'center', color: '#64748b' }}>Loading clinical file...</p> : medicalHistory.length === 0 ? <p style={{ textAlign: 'center', color: '#64748b' }}>No medical history recorded.</p> : (
            medicalHistory.map((log, i) => (
              <div key={i} className="hist-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>{log[3]}</h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{new Date(log[0]).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 8px', borderRadius: '4px', background: '#fef2f2', color: '#dc2626' }}>Pain: {log[4]}/10</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>{log[6]}</span>
                </div>
                {log[7] && <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 12px 0', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>"{log[7]}"</p>}
                
                <button onClick={() => handleUpdateExisting(log[3])} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: '600', color: '#334155', cursor: 'pointer' }}>
                  Add Treatment / Update Status
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={20} /> {selectedPart}</div>
              <button onClick={() => setShowModal(false)} disabled={saving} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            
            <div className="modal-body">
              
              <div className="form-group">
                <label className="form-label">1. Pain Level: <span style={{ color: '#dc2626', fontSize: '18px' }}>{pain}/10</span></label>
                <input type="range" min="0" max="10" step="1" className="pain-slider" value={pain} onChange={(e) => setPain(e.target.value)} />
                <div className="slider-labels"><span>0 (None)</span><span>10 (Severe)</span></div>
              </div>

              <div className="form-group">
                <label className="form-label">2. Mechanism / Action</label>
                <div className="pill-group">
                  {['Contact', 'Non-Contact', 'Gradual / Overuse', 'Illness', 'Treatment Update'].map(mech => (
                    <button key={mech} type="button" className={`pill-btn ${mechanism === mech ? 'active' : ''}`} onClick={() => setMechanism(mech)}>{mech}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">3. Current Training Status</label>
                <div className="pill-group">
                  {['Full Training', 'Modified Training', 'Cannot Train', 'Fully Fit (Cleared)'].map(stat => (
                    <button key={stat} type="button" className={`pill-btn ${status === stat ? (stat === 'Fully Fit (Cleared)' ? 'active-green' : 'active') : ''}`} onClick={() => setStatus(stat)}>{stat}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Clinical Notes / Physio Treatment</label>
                <textarea className="notes-input" placeholder="e.g. Saw physio. Did ultrasound and heat..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <button className="save-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'UPDATING FILE...' : 'SAVE MEDICAL LOG'}
              </button>

            </div>
          </div>
        </div>
      )}
      <HelpButton pageName="Medical Input" position="bottom-right" />
    </div>
  );
}
No, I never. 