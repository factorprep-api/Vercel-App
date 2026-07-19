import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Save, ArrowUp, ArrowDown, Trash2, Hammer, CheckCircle, X, Library as LibIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, saveFullProgram, getMediaType } from '../api';
import './program-builder.css';
import HelpButton from '../components/HelpButton';

function MediaPlayer({ url, compact = false }) {
  if (!url) return null;
  const mediaType = getMediaType(url);
  return (
    <div className={compact ? 'media-player-compact' : 'media-player'}>
      {mediaType === 'video' ? (
        <video src={url} controls preload="metadata" className="media-video" />
      ) : (
        <audio src={url} controls preload="metadata" className="media-audio" />
      )}
    </div>
  );
}

export default function ProgramBuilder() {
  const { userEmail: coachEmail, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [library, setLibrary] = useState([]);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', notes: '', phase: 'Work Block', exercise: '', sets: '', reps: '', intensity: '', tempo: '', rest: '', privacyLevel: 'PRIVATE' });
  const [loadProgramName, setLoadProgramName] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [mediaInputDraft, setMediaInputDraft] = useState('');
  const draftRef = useRef(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (draftRef.current) draftRef.current.scrollTop = draftRef.current.scrollHeight; }, [draft]);

  async function loadData() {
    // Cache-first for instant load
    const cached = localStorage.getItem('fp_builder_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setAthletes(parsed.athletes || []);
        setPrograms(parsed.programs || []);
        setLibrary(parsed.library || []);
        setLoading(false);
        // Refresh in background
        refreshData();
        return;
      } catch {}
    }

    // No cache — fetch fresh
    try {
      const allData = await fetchAllData();
      if (allData.error) { setError(allData.error); setLoading(false); return; }
      setAthletes(allData.athletes || []);
      setPrograms(allData.programs || []);
      setLibrary(allData.library || []);
      setLoading(false);
      // Cache for next load
      localStorage.setItem('fp_builder_data', JSON.stringify({
        athletes: allData.athletes,
        programs: allData.programs,
        library: allData.library,
        cachedAt: new Date().toISOString()
      }));
    } catch (err) {
      setError('Failed to load data.'); setLoading(false);
    }
  }

  async function refreshData() {
    try {
      const allData = await fetchAllData();
      if (!allData.error) {
        setAthletes(allData.athletes || []);
        setPrograms(allData.programs || []);
        setLibrary(allData.library || []);
        localStorage.setItem('fp_builder_data', JSON.stringify({
          athletes: allData.athletes,
          programs: allData.programs,
          library: allData.library,
          cachedAt: new Date().toISOString()
        }));
      }
    } catch {}
  }

  const exerciseList = useMemo(() => {
    if (!library.length) return [];
    const names = library.slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);
    return [...new Set(names)].sort();
  }, [library]);

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

  function addDraftExercise() {
    if (!form.exercise) { showToast('Please select an exercise.', true); return; }
    if (!form.sets || !form.reps) { showToast('Sets and Reps are required.', true); return; }
    setDraft([...draft, {
      phase: form.phase, exercise: form.exercise, sets: form.sets,
      reps: form.reps, intensity: form.intensity, tempo: form.tempo, rest: form.rest
    }]);
    setForm(f => ({ ...f, exercise: '' }));
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
    const rows = draft.map(i => [form.name, form.category, i.phase, i.exercise, i.sets, i.reps, i.intensity, i.tempo, i.rest, form.notes, form.privacyLevel, coachEmail, mediaUrl]);
    try {
      const res = await saveFullProgram(rows);
      if (res.status === 'Success') {
        showToast(`Program saved! (${res.rowCount} rows)`);
        setDraft([]);
        setForm(f => ({ ...f, name: '', notes: '', privacyLevel: 'PRIVATE' }));
        setLoadProgramName('');
        setMediaUrl('');
        await refreshData();
      } else { showToast('Save failed: ' + (res.message || 'Unknown error'), true); }
    } catch (err) { showToast('Network error', true); }
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
    const loadedDraft = programRows.map(row => ({
      phase: String(row[2] || 'Work Block').trim(),
      exercise: String(row[3] || '').trim(),
      sets: String(row[4] || '1').trim(),
      reps: String(row[5] || '1').trim(),
      intensity: String(row[6] || '').trim(),
      tempo: String(row[7] || '').trim(),
      rest: String(row[8] || '').trim()
    }));
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
    showToast(`Loaded "${loadProgramName}" (${loadedDraft.length} movements). Edit and save — will overwrite if name matches.`);
  }

  const phaseColors = { 'Warm Up': '#fd7e14', 'Work Block': '#008ed3', 'Cool Down': '#0dcaf0' };

  if (authLoading) return <div className="pb-placeholder">Loading...</div>;
  if (!coachEmail) return <div className="pb-placeholder">Please log in.</div>;

  return (
    <div className="pb-wrapper">
      <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Program Builder</h2>
      {!loading && !error && (
        <div className="pb-panel-container">
          <div className="pb-left">
            <div className="pb-load-section">
              <label className="pb-label">Load Existing Program (Your Own):</label>
              <div className="pb-load-row">
                <div>
                  <select className="pb-select" value={loadProgramName} onChange={e => setLoadProgramName(e.target.value)}>
                    <option value="">— Select a program to edit —</option>
                    {uniqueProgramNames.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <button className="pb-load-btn" onClick={handleLoadExisting}>Load</button>
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
                <button
                  type="button"
                  className={`pb-media-inline-btn${mediaUrl ? ' has-media' : ''}`}
                  onClick={() => {
                    setMediaInputDraft(mediaUrl);
                    setShowMediaInput(true);
                  }}
                >
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
              <p className="pb-hint" style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {form.privacyLevel === 'PRIVATE' && 'Only visible to you. Use Program Library to assign to athletes.'}
                {form.privacyLevel === 'PUBLIC' && 'Visible to all coaches who can use it as a template.'}
              </p>
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
            <div className="pb-field-group">
              <label className="pb-label">Select Exercise from Library:</label>
              <input
                className="pb-input"
                list="pb-exercise-list"
                value={form.exercise}
                onChange={e => setForm({...form, exercise: e.target.value})}
                autoComplete="off"
                placeholder="Type to search exercises..."
              />
              <datalist id="pb-exercise-list">
                {filteredExercises.map(ex => <option key={ex} value={ex} />)}
              </datalist>
            </div>
            <div className="pb-field-row">
              <div><label className="pb-label">Sets:</label><input type="number" className="pb-input" value={form.sets} onChange={e => setForm({...form, sets: e.target.value})} placeholder="e.g. 1" /></div>
              <div><label className="pb-label">Reps:</label><input className="pb-input" value={form.reps} onChange={e => setForm({...form, reps: e.target.value})} placeholder="e.g. 5" /></div>
            </div>
            <div className="pb-field-row">
              <div><label className="pb-label">% (Opt):</label><input type="number" className="pb-input" value={form.intensity} onChange={e => setForm({...form, intensity: e.target.value})} placeholder="80" /></div>
              <div><label className="pb-label">Tempo:</label><input className="pb-input" value={form.tempo} onChange={e => setForm({...form, tempo: e.target.value})} placeholder="e.g. 30X0" /></div>
              <div><label className="pb-label">Rest:</label><input className="pb-input" value={form.rest} onChange={e => setForm({...form, rest: e.target.value})} placeholder="90s" /></div>
            </div>
            <button className="pb-add-btn" onClick={addDraftExercise}>
              <Plus size={16} /> Add to Draft
            </button>
          </div>
          <div className="pb-right">
            <h3 className="pb-section-title" style={{ textAlign: 'center', textTransform: 'uppercase', color: '#495057' }}>Live Draft View</h3>
            <div className="pb-draft-list" ref={draftRef}>
              {draft.length === 0 ? (
                <p className="pb-draft-empty">Draft is empty.</p>
              ) : draft.map((item, i) => (
                <div key={i} className="pb-draft-card">
                  <div className="pb-draft-info">
                    <span className="pb-phase-tag" style={{ background: phaseColors[item.phase] || '#008ed3' }}>{item.phase}</span>
                    <h4 className="pb-draft-name">{item.exercise}</h4>
                    <p className="pb-draft-detail">
                      {item.sets} Sets | {item.reps} Reps
                      {item.intensity ? ` | ${item.intensity}%` : ''}
                      {item.tempo ? ` | Tempo: ${item.tempo}` : ''}
                      {item.rest ? ` | Rest: ${item.rest}` : ''}
                    </p>
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
      )}
      {loading && <p className="pb-placeholder">Loading...</p>}
      {error && <p className="pb-placeholder" style={{ color: '#dc3545' }}>{error}</p>}
      {showMediaInput && (
        <div className="pb-media-modal-overlay" onClick={() => setShowMediaInput(false)}>
          <div className="pb-media-modal" onClick={e => e.stopPropagation()}>
            <h4>{mediaUrl ? 'Edit Media Link' : 'Add Media Link'}</h4>
            <input
              type="url"
              className="pb-media-input"
              placeholder="Paste video or audio file URL (e.g., https://...mp4)"
              value={mediaInputDraft}
              onChange={(e) => setMediaInputDraft(e.target.value)}
            />
            <div className="pb-media-input-actions">
              <button
                type="button"
                className="pb-media-save-btn"
                onClick={() => {
                  setMediaUrl(mediaInputDraft.trim());
                  setShowMediaInput(false);
                }}
              >
                Set Link
              </button>
              {mediaUrl && (
                <button
                  type="button"
                  className="pb-media-remove-btn"
                  onClick={() => {
                    setMediaUrl('');
                    setMediaInputDraft('');
                    setShowMediaInput(false);
                  }}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                className="pb-media-cancel-btn"
                onClick={() => setShowMediaInput(false)}
              >
                Cancel
              </button>
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
