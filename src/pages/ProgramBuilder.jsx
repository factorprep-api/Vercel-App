import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Save, ArrowUp, ArrowDown, Trash2, Hammer, CheckCircle, X, Library as LibIcon, Settings, ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchPrograms, fetchLibrary, saveFullProgram, updateProgram, getMediaType } from '../api';
import './program-builder.css';
import HelpButton from '../components/HelpButton';
import { useNavigate } from 'react-router-dom';

function MediaPlayer({ url, compact = false }) {
  if (!url) return null;
  const isImg = url.toLowerCase().includes('.png') || url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg');
  const mediaType = getMediaType(url);
  
  return (
    <div className={compact ? 'media-player-compact' : 'media-player'}>
      {isImg ? (
        <img src={url} alt="Program Media" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />
      ) : mediaType === 'video' ? (
        <video controls preload="metadata" className="media-video" controlsList="nodownload" style={{ width: '100%', borderRadius: '4px' }}>
          <source src={url} type="video/mp4" />
        </video>
      ) : (
        <audio src={url} controls preload="metadata" className="media-audio" />
      )}
    </div>
  );
}

const DEFAULT_ADVANCED = {
  execution: 'bilateral', 
  setType: 'standard',    
  metrics: { weight: true, time: false, distance: false },
  targets: { weight: '', time: '', distance: '' }
};

export default function ProgramBuilder() {
  const { userEmail: coachEmail, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [library, setLibrary] = useState([]);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState([]);
  
  const [form, setForm] = useState({ name: '', category: '', notes: '', phase: 'Work Block', exercise: '', sets: '', reps: '', intensity: '', tempo: '', rest: '', privacyLevel: 'PRIVATE' });
  const [advanced, setAdvanced] = useState(DEFAULT_ADVANCED);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [showExDropdown, setShowExDropdown] = useState(false);

  const [loadProgramName, setLoadProgramName] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [mediaInputDraft, setMediaInputDraft] = useState('');
  
  const draftRef = useRef(null);
  const setsInputRef = useRef(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { 
    if (draftRef.current) {
      draftRef.current.scrollTo({ top: draftRef.current.scrollHeight, behavior: 'smooth' });
    } 
  }, [draft]);

  async function loadData() {
    const cached = localStorage.getItem('fp_builder_data_v2');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setPrograms(parsed.programs || []);
        setLibrary(parsed.library || []);
        setLoading(false);
        refreshData();
        return;
      } catch {}
    }

    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      try {
        const [progRes, libRes] = await Promise.all([ fetchPrograms(), fetchLibrary() ]);
        if (progRes.error) throw new Error(progRes.error); 
        
        setPrograms(progRes.programs || []);
        setLibrary(libRes.library || []);
        setLoading(false);
        setError(null);
        success = true;
        
        localStorage.setItem('fp_builder_data_v2', JSON.stringify({
          programs: progRes.programs,
          library: libRes.library,
          cachedAt: new Date().toISOString()
        }));
      } catch (err) {
        attempts++;
        if (attempts >= 3) {
          setError('Database connection is weak right now. Please refresh the page.');
          setLoading(false);
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  async function refreshData() {
    try {
      const [progRes, libRes] = await Promise.all([ fetchPrograms(), fetchLibrary() ]);
      if (!progRes.error && !libRes.error) {
        setPrograms(progRes.programs || []);
        setLibrary(libRes.library || []);
        localStorage.setItem('fp_builder_data_v2', JSON.stringify({
          programs: progRes.programs, library: libRes.library, cachedAt: new Date().toISOString()
        }));
      }
    } catch {}
  }

  const exerciseList = useMemo(() => {
    if (!library.length) return [];
    const names = library.slice(1)
      .filter(row => {
        const owner = String(row[5] || '').trim();
        if (!owner) return true; 
        if (!coachEmail) return false; 
        return owner.toLowerCase() === coachEmail.toLowerCase(); 
      })
      .map(r => String(r[0] || '').trim())
      .filter(Boolean);
    return [...new Set(names)].sort();
  }, [library, coachEmail]);

  const filteredExercises = useMemo(() => {
    if (!form.exercise.trim()) return exerciseList.slice(0, 50);
    const tokens = form.exercise.toLowerCase().split(/\s+/);
    return exerciseList.filter(ex => tokens.every(t => ex.toLowerCase().includes(t))).slice(0, 50);
  }, [form.exercise, exerciseList]);

  const uniqueProgramNames = useMemo(() => {
    if (!programs.length) return [];
    const names = programs.slice(1).filter(row => {
      const owner = String(row[11] || '').trim();
      return owner === coachEmail;
    }).map(r => String(r[0] || '').trim()).filter(Boolean);
    return [...new Set(names)].sort();
  }, [programs, coachEmail]);

  function showToast(message, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  }

  function handleAdvancedMetricToggle(metric) {
    setAdvanced(prev => ({
      ...prev,
      metrics: { ...prev.metrics, [metric]: !prev.metrics[metric] }
    }));
  }

  function addDraftExercise() {
    if (!form.exercise) { showToast('Please select an exercise.', true); return; }
    if (!form.sets) { showToast('Sets are required.', true); return; }
    if (!form.reps && !advanced.metrics.time && !advanced.metrics.distance) { 
      showToast('Enter Reps or select Time/Distance in Advanced Options.', true); return; 
    }
    
    setDraft([...draft, {
      phase: form.phase, exercise: form.exercise, sets: form.sets,
      reps: form.reps, intensity: form.intensity, tempo: form.tempo, rest: form.rest,
      advanced: JSON.parse(JSON.stringify(advanced))
    }]);
    
    showToast('Added! Settings kept for next exercise.');
  }

  function moveItem(i, dir) {
    const newDraft = [...draft];
    const j = i + dir;
    if (j < 0 || j >= newDraft.length) return;
    [newDraft[i], newDraft[j]] = [newDraft[j], newDraft[i]];
    setDraft(newDraft);
  }

  function deleteItem(i) {
    setDraft(draft.filter((_, idx) => idx !== i));
  }

  async function handleSaveProgram() {
    if (!form.name) { showToast('Program Name is required.', true); return; }
    if (draft.length === 0) { showToast('Draft is empty. Add movements first.', true); return; }
    setSaving(true);
    
    const rows = draft.map(i => [
      form.name, form.category, i.phase, i.exercise, i.sets, i.reps, 
      i.intensity, i.tempo, i.rest, form.notes, form.privacyLevel, coachEmail, mediaUrl,
      JSON.stringify(i.advanced || DEFAULT_ADVANCED)
    ]);
    
    try {
      let res;
      if (loadProgramName && loadProgramName !== form.name) {
        if (uniqueProgramNames.includes(form.name)) { res = await updateProgram(form.name, rows); } 
        else { res = await saveFullProgram(rows); }
      } else {
        if (uniqueProgramNames.includes(form.name)) { res = await updateProgram(form.name, rows); } 
        else { res = await saveFullProgram(rows); }
      }

      if (res.status === 'Success') {
        localStorage.removeItem('fp_program_data');
        localStorage.removeItem('fp_builder_data_v2');

        showToast(loadProgramName && loadProgramName !== form.name ? 'Saved as new program!' : 'Program saved!');
        setDraft([]);
        setForm(f => ({ ...f, name: '', notes: '', privacyLevel: 'PRIVATE' }));
        setLoadProgramName('');
        setMediaUrl('');
        setAdvanced(DEFAULT_ADVANCED);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        await refreshData();
      } else { 
        showToast('Save failed', true); 
      }
    } catch (err) { 
      showToast('Network error', true); 
    }
    setSaving(false);
  }

  function handleLoadExisting() {
    if (!loadProgramName) { showToast('Select a program to edit.', true); return; }
    const programRows = programs.slice(1).filter(row => {
      const name = String(row[0] || '').trim();
      const owner = String(row[11] || '').trim();
      return name === loadProgramName && owner === coachEmail;
    });
    if (programRows.length === 0) { showToast('Program not found or not owned by you.', true); return; }
    
    const loadedDraft = programRows.map(row => {
      let loadedAdvanced = DEFAULT_ADVANCED;
      try {
        if (row.length > 13 && row[13]) { loadedAdvanced = JSON.parse(String(row[13])); }
      } catch (e) {}

      return {
        phase: String(row[2] || 'Work Block').trim(),
        exercise: String(row[3] || '').trim(),
        sets: String(row[4] || '1').trim(),
        reps: String(row[5] || '1').trim(),
        intensity: String(row[6] || '').trim(),
        tempo: String(row[7] || '').trim(),
        rest: String(row[8] || '').trim(),
        advanced: loadedAdvanced
      };
    });

    const firstRow = programRows[0];
    const loadedMediaUrl = (firstRow.length > 12 && String(firstRow[12]).trim()) ? String(firstRow[12]).trim() : '';
    
    setForm(f => ({
      ...f,
      name: String(firstRow[0] || '').trim(),
      category: String(firstRow[1] || '').trim(),
      notes: String(firstRow[9] || '').trim(),
      privacyLevel: String(firstRow[10] || 'PRIVATE').trim().toUpperCase() || 'PRIVATE'
    }));
    setDraft(loadedDraft);
    setMediaUrl(loadedMediaUrl);
    showToast(`Loaded "${loadProgramName}". Change the name to "Save As" a new program, or keep the name to edit.`);
  }

  const phaseColors = { 'Warm Up': '#fd7e14', 'Work Block': '#22c55e', 'Cool Down': '#ef4444' };

  if (authLoading) return <div className="pb-placeholder">Loading...</div>;
  if (!coachEmail) return <div className="pb-placeholder">Please log in.</div>;

  return (
    <div className="pb-wrapper">
      <style>{`
        .advanced-drawer {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin-top: 12px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }
        .uni-dot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background-color: #334155;
          color: white;
          font-weight: 800;
          font-size: 10px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          margin-left: 8px;
          vertical-align: middle;
        }
        .superset-bracket {
          position: absolute;
          left: -12px;
          top: -10px;
          bottom: -10px;
          width: 8px;
          border-left: 3px solid #008ed3;
          border-top: 3px solid #008ed3;
          border-bottom: 3px solid #008ed3;
          border-radius: 4px 0 0 4px;
        }
        .pb-custom-dropdown {
          position: absolute; top: 100%; left: 0; right: 0; z-index: 1000;
          background-color: #fff; border: 1px solid #cbd5e1; border-radius: 8px;
          max-height: 250px; overflow-y: auto; list-style: none; padding: 0; margin: 4px 0 0 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .pb-custom-dropdown li {
          padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; color: #0f172a;
        }
        .pb-custom-dropdown li:hover { background-color: #f8fafc; }
      `}</style>

      {/* NEW HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', marginTop: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          Program Builder
        </h2>
      </div>
      
      {error && <p style={{ color: '#dc3545', marginBottom: '16px', fontWeight: 'bold' }}>{error}</p>}
      
      <div className="pb-panel-container">
        <div className="pb-left">
          
          <div className="pb-load-section">
            <label className="pb-label">Load Existing Program (Your Own):</label>
            <div className="pb-load-row">
              <div>
                <select className="pb-select" value={loadProgramName} onChange={e => setLoadProgramName(e.target.value)} disabled={loading}>
                  {loading ? ( <option value="">— Loading your programs... —</option> ) : (
                    <>
                      <option value="">— Select a program to load —</option>
                      {uniqueProgramNames.map(p => <option key={p} value={p}>{p}</option>)}
                    </>
                  )}
                </select>
              </div>
              <button className="pb-load-btn" onClick={handleLoadExisting} disabled={loading}>Load</button>
            </div>
          </div>

          <h3 className="pb-section-title">1. Categorize and Name</h3>
          <div className="pb-field-row">
            <div style={{ flex: 2 }}>
              <label className="pb-label">Program Name (Required):</label>
              <input className="pb-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Push Workout A" />
            </div>
            <div style={{ flex: 1 }}>
              <label className="pb-label">Category (Optional):</label>
              <input className="pb-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="e.g. Hypertrophy" />
            </div>
          </div>
          
          <div className="pb-field-group">
            <div className="pb-label-row">
              <label className="pb-label">Coach's Notes (Optional):</label>
              <button type="button" className={`pb-media-inline-btn${mediaUrl ? ' has-media' : ''}`} onClick={() => { setMediaInputDraft(mediaUrl); setShowMediaInput(true); }}>
                {mediaUrl ? '✓ Media' : '+ Media'}
              </button>
            </div>
            <textarea className="pb-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="e.g. Focus on tempo today." />
            {mediaUrl && (
              <div className="pb-media-preview">
                <span className="pb-media-label">MEDIA LINKED:</span>
                <MediaPlayer url={mediaUrl} compact />
              </div>
            )}
          </div>

          <div className="pb-field-group">
            <label className="pb-label">Visibility:</label>
            <select className="pb-select" value={form.privacyLevel} onChange={e => setForm({...form, privacyLevel: e.target.value})}>
              <option value="PRIVATE">Private (only you can see)</option>
              <option value="PUBLIC">Public (all coaches can use as template)</option>
            </select>
          </div>

          <h3 className="pb-section-title">2. Add Movement</h3>
          <div className="pb-field-group">
            <label className="pb-label">Training Phase:</label>
            <select className="pb-select" value={form.phase} onChange={e => setForm({...form, phase: e.target.value})}>
              <option value="Warm Up">Warm Up</option>
              <option value="Work Block">Work Block</option>
              <option value="Cool Down">Cool Down</option>
            </select>
          </div>
          
          <div className="pb-field-group" style={{ position: 'relative' }}>
            <label className="pb-label">Select Exercise from Library:</label>
            <input
              className="pb-input"
              value={form.exercise}
              onFocus={() => { setForm({...form, exercise: ''}); setShowExDropdown(true); }}
              onBlur={() => setShowExDropdown(false)}
              onChange={e => {
                setForm({...form, exercise: e.target.value});
                setShowExDropdown(true);
              }}
              autoComplete="off"
              placeholder={loading ? "Loading exercise library..." : "Type to search exercises..."}
            />
            {showExDropdown && (
              <ul className="pb-custom-dropdown">
                {filteredExercises.length === 0 ? (
                  <li style={{ padding: '10px 12px', color: '#64748b' }}>No matches found</li>
                ) : (
                  filteredExercises.map(ex => (
                    <li 
                      key={ex} 
                      onMouseDown={(e) => {
                        e.preventDefault(); 
                        setForm({...form, exercise: ex});
                        setShowExDropdown(false);
                        setTimeout(() => setsInputRef.current?.focus(), 10);
                      }}
                    >
                      {ex}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          
          <div className="pb-field-row">
            <div><label className="pb-label">Sets:</label><input ref={setsInputRef} type="number" className="pb-input" value={form.sets} onChange={e => setForm({...form, sets: e.target.value})} placeholder="e.g. 1" /></div>
            <div><label className="pb-label">Reps:</label><input className="pb-input" value={form.reps} onChange={e => setForm({...form, reps: e.target.value})} placeholder="e.g. 5" /></div>
          </div>
          <div className="pb-field-row">
            <div><label className="pb-label">% (Opt):</label><input type="number" className="pb-input" value={form.intensity} onChange={e => setForm({...form, intensity: e.target.value})} placeholder="80" /></div>
            <div><label className="pb-label">Tempo:</label><input className="pb-input" value={form.tempo} onChange={e => setForm({...form, tempo: e.target.value})} placeholder="e.g. 30X0" /></div>
            <div><label className="pb-label">Rest:</label><input className="pb-input" value={form.rest} onChange={e => setForm({...form, rest: e.target.value})} placeholder="90s" /></div>
          </div>

          <div style={{ marginTop: '12px', marginBottom: '20px' }}>
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#64748b', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              <Settings size={16} /> {showAdvanced ? 'Hide Advanced Options' : 'Advanced Options (Supersets, Targets, Unilateral)'}
            </button>
            
            {showAdvanced && (
              <div className="advanced-drawer">
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="pb-label">Execution:</label>
                    <select className="pb-select" value={advanced.execution} onChange={e => setAdvanced({...advanced, execution: e.target.value})}>
                      <option value="bilateral">Bilateral (Standard)</option>
                      <option value="uni-both">Unilateral (Left & Right)</option>
                      <option value="uni-left">Unilateral (Left Only)</option>
                      <option value="uni-right">Unilateral (Right Only)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="pb-label">Set Type:</label>
                    <select className="pb-select" value={advanced.setType} onChange={e => setAdvanced({...advanced, setType: e.target.value})}>
                      <option value="standard">Standard Set</option>
                      <option value="superset">Superset (Links to above)</option>
                      <option value="drop">Drop Set</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="pb-label" style={{ marginBottom: '8px', display: 'block' }}>Metrics to Track (What the athlete logs):</label>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                    <label style={{ fontSize: '14px', color: '#334155' }}><input type="checkbox" checked={advanced.metrics.weight} onChange={() => handleAdvancedMetricToggle('weight')} /> Weight (kg)</label>
                    <label style={{ fontSize: '14px', color: '#334155' }}><input type="checkbox" checked={advanced.metrics.time} onChange={() => handleAdvancedMetricToggle('time')} /> Time</label>
                    <label style={{ fontSize: '14px', color: '#334155' }}><input type="checkbox" checked={advanced.metrics.distance} onChange={() => handleAdvancedMetricToggle('distance')} /> Distance</label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {advanced.metrics.weight && (
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label className="pb-label">Target Weight (e.g. "50kg"):</label>
                      <input className="pb-input" value={advanced.targets.weight} onChange={e => setAdvanced({...advanced, targets: {...advanced.targets, weight: e.target.value}})} placeholder="50kg" />
                    </div>
                  )}
                  {advanced.metrics.time && (
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label className="pb-label">Target Time (e.g. "10s"):</label>
                      <input className="pb-input" value={advanced.targets.time} onChange={e => setAdvanced({...advanced, targets: {...advanced.targets, time: e.target.value}})} placeholder="10s" />
                    </div>
                  )}
                  {advanced.metrics.distance && (
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label className="pb-label">Target Distance (e.g. "500m"):</label>
                      <input className="pb-input" value={advanced.targets.distance} onChange={e => setAdvanced({...advanced, targets: {...advanced.targets, distance: e.target.value}})} placeholder="500m" />
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          <button className="pb-add-btn" onClick={addDraftExercise}>
            <Plus size={16} /> Add to Draft
          </button>
        </div>
        
        <div className="pb-right">
          <h3 className="pb-section-title" style={{ textAlign: 'center', textTransform: 'uppercase', color: '#495057' }}>Live Draft View</h3>
           <div className="pb-draft-list" ref={draftRef} style={{ maxHeight: '600px', overflowY: 'auto', paddingLeft: '16px' }}>
            {draft.length === 0 ? (
              <p className="pb-draft-empty">Draft is empty.</p>
            ) : draft.map((item, i) => (
              <div key={i} className="pb-draft-card" style={{ position: 'relative' }}>
                
                {item.advanced?.setType === 'superset' && <div className="superset-bracket"></div>}

                <div className="pb-draft-info">
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="pb-phase-tag" style={{ background: phaseColors[item.phase] || '#008ed3', marginBottom: 0, marginRight: '8px' }}>{item.phase}</span>
                    
                    {item.advanced?.execution === 'uni-both' && <span className="uni-dot" title="Unilateral">U</span>}
                    {item.advanced?.execution === 'uni-left' && <span className="uni-dot" title="Left Only">L</span>}
                    {item.advanced?.execution === 'uni-right' && <span className="uni-dot" title="Right Only">R</span>}
                  </div>

                  <h4 className="pb-draft-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {item.advanced?.setType === 'superset' && <span title="Superset">🔗</span>}
                    {item.exercise}
                    {item.advanced?.setType === 'drop' && (
                      <img src="/drop-set-icon.png" alt="Drop Set 📉" style={{ width: '20px', height: '20px', marginLeft: '4px', verticalAlign: 'middle' }} onError={(e) => { e.target.style.display='none'; e.target.insertAdjacentText('afterend', '📉'); }} />
                    )}
                  </h4>
                  
                  <p className="pb-draft-detail">
                    {item.sets} Sets | {item.reps} Reps
                    {item.intensity ? ` | ${item.intensity}%` : ''}
                    {item.tempo ? ` | Tempo: ${item.tempo}` : ''}
                    {item.rest ? ` | Rest: ${item.rest}` : ''}
                  </p>
                  
                  {(item.advanced?.targets?.weight || item.advanced?.targets?.time || item.advanced?.targets?.distance) && (
                    <p style={{ fontSize: '12px', color: '#0ea5e9', fontWeight: '600', margin: '4px 0 0 0' }}>
                      Targets: 
                      {item.advanced.targets.weight && ` 🏋️ ${item.advanced.targets.weight}`}
                      {item.advanced.targets.time && ` ⏱️ ${item.advanced.targets.time}`} 
                      {item.advanced.targets.distance && ` 📏 ${item.advanced.targets.distance}`}
                    </p>
                  )}

                </div>
                <div className="pb-draft-controls">
                  <div className="pb-draft-btn-row">
                    <button className="pb-move-btn" onClick={() => moveItem(i, -1)} title="Move up"><ArrowUp size={12} /></button>
                    <button className="pb-move-btn" onClick={() => moveItem(i, 1)} title="Move down"><ArrowDown size={12} /></button>
                  </div>
                  <button className="pb-delete-btn" onClick={() => deleteItem(i)}>DELETE</button>
                </div>
              </div>
            ))}
          </div>
          <hr style={{ border: 0, borderTop: '1px solid #ccc', margin: '20px 0' }} />
          <button className="pb-save-btn" onClick={handleSaveProgram} disabled={saving}>
            <Save size={18} /> {saving ? 'Saving...' : 'Save Entire Program'}
          </button>
        </div>
      </div>

      {showMediaInput && (
        <div className="pb-media-modal-overlay" onClick={() => setShowMediaInput(false)}>
          <div className="pb-media-modal" onClick={e => e.stopPropagation()}>
            <h4>{mediaUrl ? 'Edit Media Link' : 'Add Media Link'}</h4>
            <input type="url" className="pb-media-input" placeholder="Paste video or audio file URL" value={mediaInputDraft} onChange={(e) => setMediaInputDraft(e.target.value)} />
            <div className="pb-media-input-actions">
              <button type="button" className="pb-media-save-btn" onClick={() => { setMediaUrl(mediaInputDraft.trim()); setShowMediaInput(false); }}>Set Link</button>
              {mediaUrl && <button type="button" className="pb-media-remove-btn" onClick={() => { setMediaUrl(''); setMediaInputDraft(''); setShowMediaInput(false); }}>Remove</button>}
              <button type="button" className="pb-media-cancel-btn" onClick={() => setShowMediaInput(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <HelpButton pageName="Program Builder" position="bottom-right" />
      {toast && (
        <div className={`pb-toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <X size={16} /> : <CheckCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
