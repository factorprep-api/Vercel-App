import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Save, ArrowUp, ArrowDown, Trash2, UserCheck, Hammer, CheckCircle, X, Search, Users } from 'lucide-react';
import { supabase } from '../supabase';
import { fetchAllData, saveFullProgram, assignProgramBulk } from '../api';
import './program-builder.css';
export default function ProgramBuilder() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [library, setLibrary] = useState([]);
  const [activeTab, setActiveTab] = useState('builder');
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', notes: '', phase: 'Work Block', exercise: '', sets: '', reps: '', intensity: '', tempo: '', rest: '', privacyLevel: 'PRIVATE' });
  const [selectedAthletes, setSelectedAthletes] = useState(new Set());
  const [athleteSearch, setAthleteSearch] = useState('');
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [coachEmail, setCoachEmail] = useState('');
  const draftRef = useRef(null);
  useEffect(() => { loadCoachEmail(); loadData(); }, []);
  useEffect(() => { if (draftRef.current) draftRef.current.scrollTop = draftRef.current.scrollHeight; }, [draft]);
  async function loadCoachEmail() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { setCoachEmail(user.email); }
  }
  async function loadData() {
    try {
      const allData = await fetchAllData();
      if (allData.error) { setError(allData.error); setLoading(false); return; }
      setAthletes(allData.athletes || []);
      setPrograms(allData.programs || []);
      setLibrary(allData.library || []);
      setLoading(false);
    } catch (err) {
      setError('Failed to load data.'); setLoading(false);
    }
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
  const athleteOptions = useMemo(() => {
    if (!athletes.length) return [];
    const headers = athletes[0] || [];
    let roleCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === 'role') { roleCol = i; break; }
    }
    return athletes.slice(1)
      .map((row, i) => ({ row: i + 1, name: String(row[0] || '').trim(), rawData: row }))
      .filter(a => {
        if (!a.name) return false;
        if (roleCol !== -1) {
          const role = String(a.rawData[roleCol] || '').trim().toLowerCase();
          return role !== 'coach';
        }
        return true;
      })
      .map(a => ({ row: a.row, name: a.name }));
  }, [athletes]);
  const filteredAthletes = useMemo(() => {
    if (!athleteSearch.trim()) return athleteOptions;
    const q = athleteSearch.toLowerCase();
    return athleteOptions.filter(a => a.name.toLowerCase().includes(q));
  }, [athleteOptions, athleteSearch]);
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
    const rows = draft.map(i => [form.name, form.category, i.phase, i.exercise, i.sets, i.reps, i.intensity, i.tempo, i.rest, form.notes, form.privacyLevel, coachEmail]);
    try {
      const res = await saveFullProgram(rows);
      if (res.status === 'Success') {
        showToast(`Program saved! (${res.rowCount} rows)`);
        setDraft([]);
        setForm(f => ({ ...f, name: '', notes: '', privacyLevel: 'PRIVATE' }));
        await loadData();
      } else { showToast('Save failed: ' + (res.message || 'Unknown error'), true); }
    } catch (err) { showToast('Network error', true); }
    setSaving(false);
  }
  function toggleAthlete(rowNum) {
    setSelectedAthletes(prev => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum); else next.add(rowNum);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelectedAthletes(prev => {
      const next = new Set(prev);
      filteredAthletes.forEach(a => next.add(a.row));
      return next;
    });
  }
  function deselectAllFiltered() {
    setSelectedAthletes(prev => {
      const next = new Set(prev);
      filteredAthletes.forEach(a => next.delete(a.row));
      return next;
    });
  }
  function clearAthleteSelection() {
    setSelectedAthletes(new Set());
  }
  async function handleAssign() {
    if (selectedAthletes.size === 0) { showToast('Select at least one athlete.', true); return; }
    if (selectedPrograms.length === 0) { showToast('Select at least one program.', true); return; }
    const headers = athletes[0] || [];
    let assignCol = -1;
    for (let c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').trim().toLowerCase() === 'program assignment') { assignCol = c; break; }
    }
    if (assignCol === -1) { showToast('Program Assignment column not found.', true); return; }
    const rows = Array.from(selectedAthletes);
    try {
      const res = await assignProgramBulk(rows, selectedPrograms.join(', '), assignCol);
      if (res.status === 'Success') {
        showToast(`Assigned to ${res.rowsUpdated} athlete(s)`);
        setSelectedAthletes(new Set());
        setSelectedPrograms([]);
      } else { showToast('Assignment failed', true); }
    } catch (err) { showToast('Network error', true); }
  }
  const phaseColors = { 'Warm Up': '#fd7e14', 'Work Block': '#008ed3', 'Cool Down': '#0dcaf0' };
  const tabs = [
    { id: 'builder', label: '1. Build Program', icon: Hammer },
    { id: 'assign', label: '2. Assign To Athletes', icon: Users }
  ];
  return (
    <div className="pb-wrapper">
      <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Program Builder</h2>
      <div className="pb-tabs">
        {tabs.map(tab => (
          <button key={tab.id} className={`pb-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <tab.icon size={14} style={{ display: 'inline', marginRight: 6 }} />
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'builder' && !loading && !error && (
        <div className="pb-panel-container">
          <div className="pb-left">
            <h3 className="pb-section-title">1. Categorize & Name</h3>
            <div className="pb-field-row" >
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
              <label className="pb-label">Coach's Notes (Optional):</label>
              <textarea className="pb-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="e.g. Focus on tempo today." />
            </div>
            <div className="pb-field-group">
              <label className="pb-label">Privacy Level:</label>
              <select className="pb-select" value={form.privacyLevel} onChange={e => setForm({...form, privacyLevel: e.target.value})}>
                <option value="PRIVATE">Private (only you can see)</option>
                <option value="ASSIGNED">Assigned (specific athletes only)</option>
                <option value="PUBLIC">Public (free for all athletes)</option>
              </select>
              <p className="pb-hint" style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {form.privacyLevel === 'PRIVATE' && 'Only visible to you, can assign to athletes manually.'}
                {form.privacyLevel === 'ASSIGNED' && 'Shows in Public Programs but requires explicit assignment.'}
                {form.privacyLevel === 'PUBLIC' && 'Appears in Public Programs for all athletes to access.'}
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
      {activeTab === 'assign' && !loading && !error && (
        <div style={{ background: '#f9f9f9', padding: 20, borderRadius: 8, border: '1px solid #ddd' }}>
          <h3 className="pb-section-title">Assign Programs To Athletes</h3>
          <div className="pb-assign-grid">
            <div className="pb-assign-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, color: '#555', fontSize: 14 }}>Step 1: Select Athlete(s)</h4>
                <span style={{ fontSize: 12, color: '#008ed3', fontWeight: 'bold' }}>{selectedAthletes.size} selected</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                  <input
                    className="pb-input"
                    style={{ paddingLeft: 32 }}
                    value={athleteSearch}
                    onChange={e => setAthleteSearch(e.target.value)}
                    placeholder="Search athletes..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
                <button onClick={selectAllFiltered} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 'bold', background: '#e3f2fd', color: '#008ed3', border: '1px solid #008ed3', borderRadius: 4, cursor: 'pointer' }}>Select All Visible</button>
                <button onClick={deselectAllFiltered} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 'bold', background: '#fafafa', color: '#666', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Clear Visible</button>
                <button onClick={clearAthleteSelection} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 'bold', background: '#fee', color: '#dc3545', border: '1px solid #fcc', borderRadius: 4, cursor: 'pointer' }}>Clear All</button>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
                {filteredAthletes.length === 0 ? (
                  <p style={{ padding: 16, color: '#888', textAlign: 'center' }}>No athletes found.</p>
                ) : filteredAthletes.map(a => (
                  <label
                    key={a.row}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                      background: selectedAthletes.has(a.row) ? '#e3f2fd' : 'transparent',
                      transition: 'background 0.1s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAthletes.has(a.row)}
                      onChange={() => toggleAthlete(a.row)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 14, color: '#333' }}>{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="pb-assign-card">
              <h4 style={{ margin: '0 0 15px 0', color: '#555', fontSize: 14 }}>Step 2: Select Program(s)</h4>
              <label className="pb-label">Available Programs:</label>
              <select
                className="pb-multi-select"
                multiple
                value={selectedPrograms}
                onChange={e => setSelectedPrograms(Array.from(e.target.selectedOptions).map(o => o.value))}
              >
                {uniqueProgramNames.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <p className="pb-hint">Hold Ctrl/Cmd to select multiple programs.</p>
            </div>
          </div>
          <button className="pb-save-btn" style={{ marginTop: 25, background: '#008ed3' }} onClick={handleAssign}>
            <UserCheck size={18} /> Assign to {selectedAthletes.size} Athlete(s)
          </button>
        </div>
      )}
      {loading && <p className="pb-placeholder">Loading...</p>}
      {error && <p className="pb-placeholder" style={{ color: '#dc3545' }}>{error}</p>}
      {toast && (
        <div className={`pb-toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <X size={16} /> : <CheckCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
