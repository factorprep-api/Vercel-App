import { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, UserPlus, CheckCircle, X, Layers, Dumbbell, FolderClosed, Lock, Globe, Eye } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, deleteProgram, updateAssignment, assignProgramBulk } from '../api';
import './program-library.css';

export default function ProgramLibrary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programData, setProgramData] = useState([]);
  const [athletesData, setAthletesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProgram, setExpandedProgram] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignAthletes, setAssignAthletes] = useState(new Set());
  const [assignPrograms, setAssignPrograms] = useState([]);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [privacyFilter, setPrivacyFilter] = useState('all');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const { userEmail, role, isLoading: authLoading } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const allData = await fetchAllData();
      if (allData.error) { setError(allData.error); setLoading(false); return; }
      setProgramData(allData.programs);
      setAthletesData(allData.athletes);
      setLoading(false);
    } catch (err) {
      setError('Failed to load programs. Please refresh.');
      setLoading(false);
    }
  }

  const athleteNames = useMemo(() => {
    if (!athletesData.length) return [];
    const headers = athletesData[0] || [];
    let roleCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === 'role') { roleCol = i; break; }
    }
    return athletesData.slice(1)
      .filter(row => {
        if (roleCol !== -1) {
          const role = String(row[roleCol] || '').trim().toLowerCase();
          return role !== 'coach';
        }
        return true;
      })
      .map(row => String(row[0] || '').trim())
      .filter(Boolean)
      .sort();
  }, [athletesData]);

  const athleteOptions = useMemo(() => {
    if (!athletesData.length) return [];
    const headers = athletesData[0] || [];
    let roleCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === 'role') { roleCol = i; break; }
    }
    return athletesData.slice(1)
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
  }, [athletesData]);

  const filteredAthletes = useMemo(() => {
    if (!athleteSearch.trim()) return athleteOptions;
    const q = athleteSearch.toLowerCase();
    return athleteOptions.filter(a => a.name.toLowerCase().includes(q));
  }, [athleteOptions, athleteSearch]);

  const ownedProgramNames = useMemo(() => {
    if (!programData.length) return [];
    const names = programData.slice(1).filter(row => {
      const owner = String(row[11] || '').trim();
      return owner === userEmail;
    }).map(r => String(r[0] || '').trim()).filter(Boolean);
    return [...new Set(names)].sort();
  }, [programData, userEmail]);

  const programs = useMemo(() => {
    if (!programData.length) return [];
    const map = {};
    programData.slice(1).forEach(row => {
      const name = String(row[0] || '').trim();
      if (!name) return;
      if (!map[name]) {
        map[name] = { name, categories: new Set(), exercises: new Set(), phases: new Set(), rows: [], privacyLevel: '', ownerEmail: '' };
      }
      const cat = String(row[1] || '').trim();
      const phase = String(row[2] || '').trim() || 'Work Block';
      const ex = String(row[3] || '').trim();
      if (cat) map[name].categories.add(cat);
      if (ex) map[name].exercises.add(ex);
      map[name].phases.add(phase);
      map[name].rows.push(row);
      const privacy = String(row[10] || '').trim().toUpperCase();
      const owner = String(row[11] || '').trim();
      if (privacy && !map[name].privacyLevel) map[name].privacyLevel = privacy;
      if (owner && !map[name].ownerEmail) map[name].ownerEmail = owner;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [programData]);

  const filteredPrograms = useMemo(() => {
    let result = programs;

    if (privacyFilter === 'private') {
      result = result.filter(p => p.privacyLevel === 'PRIVATE' && p.ownerEmail === userEmail);
    } else if (privacyFilter === 'public') {
      result = result.filter(p => p.privacyLevel === 'PUBLIC');
    } else {
      result = result.filter(p => p.ownerEmail === userEmail || p.privacyLevel === 'PUBLIC' || !p.privacyLevel);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q));
    }

    return result;
  }, [programs, privacyFilter, userEmail, searchQuery]);

  function toggleExpand(name) {
    setExpandedProgram(expandedProgram === name ? null : name);
  }

  function showToast(message, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleDelete(programName) {
    if (!confirm(`Delete "${programName}"? This removes all rows. This cannot be undone.`)) return;
    setDeleting(programName);
    try {
      const res = await deleteProgram(programName);
      if (res.status === 'Success') {
        showToast(`"${programName}" deleted (${res.deletedRows} rows)`);
        await loadData();
      } else {
        showToast('Delete failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
    setDeleting(null);
  }

  function toggleAthlete(rowNum) {
    setAssignAthletes(prev => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum); else next.add(rowNum);
      return next;
    });
  }

  function selectAllFiltered() {
    setAssignAthletes(prev => {
      const next = new Set(prev);
      filteredAthletes.forEach(a => next.add(a.row));
      return next;
    });
  }

  function clearAthleteSelection() {
    setAssignAthletes(new Set());
  }

  async function handleBulkAssign() {
    if (assignAthletes.size === 0) { showToast('Select at least one athlete.', true); return; }
    if (assignPrograms.length === 0) { showToast('Select at least one program.', true); return; }
    const headers = athletesData[0] || [];
    let assignCol = -1;
    for (let c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').trim().toLowerCase() === 'program assignment') { assignCol = c; break; }
    }
    if (assignCol === -1) { showToast('Program Assignment column not found.', true); return; }
    const rows = Array.from(assignAthletes);
    setBulkAssigning(true);
    try {
      const res = await assignProgramBulk(rows, assignPrograms.join(', '), assignCol);
      if (res.status === 'Success') {
        showToast(`Assigned to ${res.rowsUpdated} athlete(s)`);
        setAssignModalOpen(false);
        setAssignAthletes(new Set());
        setAssignPrograms([]);
      } else {
        showToast('Assignment failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
    setBulkAssigning(false);
  }

  function renderPrivacyBadge(program) {
    const level = program.privacyLevel || 'PRIVATE';
    if (level === 'PUBLIC') {
      return <span className="pl-privacy-badge pl-privacy-public"><Globe size={10} /> Public</span>;
    } else if (level === 'ASSIGNED') {
      return <span className="pl-privacy-badge pl-privacy-assigned"><UserPlus size={10} /> Assigned</span>;
    } else {
      return <span className="pl-privacy-badge pl-privacy-private"><Lock size={10} /> Private</span>;
    }
  }

  function renderProgramPreview(program) {
    const phases = {};
    program.rows.forEach(row => {
      const phase = String(row[2] || '').trim() || 'Work Block';
      const name = String(row[3] || '').trim() || 'Unknown';
      if (!phases[phase]) phases[phase] = {};
      if (!phases[phase][name]) phases[phase][name] = [];
      phases[phase][name].push({
        sets: String(row[4] || '').trim() || '1',
        reps: String(row[5] || '').trim() || '1',
        intensity: String(row[6] || '').trim(),
        tempo: String(row[7] || '').trim(),
        rest: String(row[8] || '').trim()
      });
    });

    const phaseOrder = ['Warm Up', 'Work Block', 'Cool Down'];
    const sortedPhases = Object.keys(phases).sort((a, b) => {
      const ia = phaseOrder.indexOf(a);
      const ib = phaseOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedPhases.map(phase => (
      <div key={phase} className="pl-phase-section">
        <div className="pl-phase-title">{phase}</div>
        {Object.entries(phases[phase]).map(([exName, sets]) => (
          <div key={exName} className="pl-exercise-row">
            <div>
              <div className="pl-ex-name">{exName}</div>
              {sets.map((s, i) => (
                <div key={i} className="pl-ex-detail">
                  Set {i + 1}: {s.reps} reps{s.intensity ? ` @ ${s.intensity}%` : ''}
                  {s.tempo ? ` | Tempo: ${s.tempo}` : ''}
                  {s.rest ? ` | Rest: ${s.rest}` : ''}
                </div>
              ))}
            </div>
            <div className="pl-ex-sets">{sets.length} set{sets.length > 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>
    ));
  }

  const privacyTabs = [
    { id: 'all', label: 'All Programs' },
    { id: 'private', label: 'Private' },
    { id: 'public', label: 'Public' }
  ];

  if (authLoading) {
    return (
      <div className="pl-container">
        <div className="pl-body">
          <p className="pl-placeholder">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-container">
      <div className="pl-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '24px', color: '#008ed3', fontWeight: '700', margin: 0 }}>Program Library</h2>
          <button className="pl-bulk-assign-btn" onClick={() => setAssignModalOpen(true)}>
            <UserPlus size={16} /> Assign Programs
          </button>
        </div>

        <div className="pl-privacy-tabs">
          {privacyTabs.map(tab => (
            <button
              key={tab.id}
              className={`pl-privacy-tab ${privacyFilter === tab.id ? 'active' : ''}`}
              onClick={() => setPrivacyFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="pl-search-wrapper">
          <Search className="pl-search-icon" size={18} />
          <input
            type="text"
            className="pl-search-box"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search programs..."
          />
        </div>

        {loading && <p className="pl-placeholder">Loading programs...</p>}
        {error && <p className="pl-error">{error}</p>}
        {!loading && !error && filteredPrograms.length === 0 && (
          <p className="pl-placeholder">No programs found.</p>
        )}

        {!loading && !error && (
          <div className="pl-program-list">
            {filteredPrograms.map(program => (
              <div key={program.name} className="pl-program-card">
                <div className="pl-program-header" onClick={() => toggleExpand(program.name)}>
                  <div>
                    <div className="pl-program-name">{program.name}</div>
                    <div className="pl-program-meta">
                      <span className="pl-meta-badge"><Layers size={10} /> {program.categories.size} categor{program.categories.size === 1 ? 'y' : 'ies'}</span>
                      <span className="pl-meta-badge"><Dumbbell size={10} /> {program.exercises.size} exercises</span>
                      <span className="pl-meta-badge"><FolderClosed size={10} /> {program.phases.size} phases</span>
                      {renderPrivacyBadge(program)}
                    </div>
                  </div>
                  <div className="pl-actions" onClick={e => e.stopPropagation()}>
                    {/* Only show Delete button for owned programs */}
                    {program.ownerEmail === userEmail && (
                      <button className="pl-delete-btn" onClick={() => handleDelete(program.name)} disabled={deleting === program.name}>
                        <Trash2 size={14} /> {deleting === program.name ? '...' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
                {expandedProgram === program.name && (
                  <div className="pl-expand">
                    {renderProgramPreview(program)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Assign Modal */}
      {assignModalOpen && (
        <div className="pl-assign-modal" onClick={() => setAssignModalOpen(false)}>
          <div className="pl-assign-content" onClick={e => e.stopPropagation()}>
            <button className="pl-assign-close" onClick={() => setAssignModalOpen(false)}><X size={20} /></button>
            <h3 className="pl-assign-title">Assign Programs To Athletes</h3>
            
            <div className="pl-assign-step">
              <h4>Step 1: Select Athlete(s)</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                  <input
                    type="text"
                    className="pl-input"
                    style={{ paddingLeft: 32 }}
                    value={athleteSearch}
                    onChange={e => setAthleteSearch(e.target.value)}
                    placeholder="Search athletes..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
                <button onClick={selectAllFiltered} className="pl-athlete-action-btn pl-athlete-select-all">Select All Visible</button>
                <button onClick={clearAthleteSelection} className="pl-athlete-action-btn pl-athlete-clear-all">Clear All</button>
              </div>
              <div className="pl-athlete-list-container">
                {filteredAthletes.length === 0 ? (
                  <p style={{ padding: 16, color: '#888', textAlign: 'center' }}>No athletes found.</p>
                ) : filteredAthletes.map(a => (
                  <label key={a.row} className={`pl-athlete-item ${assignAthletes.has(a.row) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={assignAthletes.has(a.row)} onChange={() => toggleAthlete(a.row)} className="pl-athlete-checkbox" />
                    <span className="pl-athlete-name">{a.name}</span>
                  </label>
                ))}
              </div>
              <p className="pl-selection-count">{assignAthletes.size} athlete(s) selected</p>
            </div>

            <div className="pl-assign-step">
              <h4>Step 2: Select Program(s)</h4>
              <label className="pl-program-label">Available Programs:</label>
              <select
                className="pl-multi-select"
                multiple
                value={assignPrograms}
                onChange={e => setAssignPrograms(Array.from(e.target.selectedOptions).map(o => o.value))}
              >
                {ownedProgramNames.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <p className="pl-multi-select-help">Hold Ctrl/Cmd to select multiple programs.</p>
            </div>

            <button className="pl-assign-confirm-btn" onClick={handleBulkAssign} disabled={bulkAssigning}>
              {bulkAssigning ? 'Assigning...' : `Assign to ${assignAthletes.size} Athlete(s)`}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`pl-toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <X size={16} /> : <CheckCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
