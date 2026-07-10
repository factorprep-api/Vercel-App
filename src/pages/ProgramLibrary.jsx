import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Trash2, UserPlus, CheckCircle, X, Layers, Dumbbell, FolderClosed } from 'lucide-react';
import { fetchAllData, deleteProgram, updateAssignment } from '../api';
import './program-library.css';

export default function ProgramLibrary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programData, setProgramData] = useState([]);
  const [athletesData, setAthletesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProgram, setExpandedProgram] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [assignAthlete, setAssignAthlete] = useState('');
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);

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

  const programs = useMemo(() => {
    if (!programData.length) return [];
    const map = {};
    programData.slice(1).forEach(row => {
      const name = String(row[0] || '').trim();
      if (!name) return;
      if (!map[name]) {
        map[name] = { name, categories: new Set(), exercises: new Set(), phases: new Set(), rows: [] };
      }
      const cat = String(row[1] || '').trim();
      const phase = String(row[2] || '').trim() || 'Work Block';
      const ex = String(row[3] || '').trim();
      if (cat) map[name].categories.add(cat);
      if (ex) map[name].exercises.add(ex);
      map[name].phases.add(phase);
      map[name].rows.push(row);
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [programData]);

  const filteredPrograms = useMemo(() => {
    if (!searchQuery.trim()) return programs;
    const q = searchQuery.toLowerCase();
    return programs.filter(p => p.name.toLowerCase().includes(q));
  }, [programs, searchQuery]);

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

  function openAssignModal(programName) {
    setAssignModal(programName);
    setAssignAthlete('');
  }

  async function handleAssign() {
    if (!assignAthlete || !assignModal) return;
    try {
      const res = await updateAssignment(assignAthlete, assignModal);
      if (res.status === 'Success') {
        showToast(`"${assignModal}" assigned to ${assignAthlete}`);
        setAssignModal(null);
        setAssignAthlete('');
      } else {
        showToast('Assignment failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
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

  return (
    <div className="pl-container">
      <div className="pl-body">
        <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Program Library</h2>

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
                    </div>
                  </div>
                  <div className="pl-actions" onClick={e => e.stopPropagation()}>
                    <button className="pl-assign-btn" onClick={() => openAssignModal(program.name)}>
                      <UserPlus size={14} /> Assign
                    </button>
                    <button className="pl-delete-btn" onClick={() => handleDelete(program.name)} disabled={deleting === program.name}>
                      <Trash2 size={14} /> {deleting === program.name ? '...' : 'Delete'}
                    </button>
                    <ChevronDown className={`pl-chevron ${expandedProgram === program.name ? 'expanded' : ''}`} size={20} />
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

      {assignModal && (
        <div className="pl-assign-modal" onClick={() => setAssignModal(null)}>
          <div className="pl-assign-content" onClick={e => e.stopPropagation()}>
            <div className="pl-assign-title">Assign "{assignModal}"</div>
            <select className="pl-assign-select" value={assignAthlete} onChange={e => setAssignAthlete(e.target.value)}>
              <option value="">- Select Athlete -</option>
              {athleteNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <div className="pl-assign-actions">
              <button className="pl-assign-cancel" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="pl-assign-confirm" onClick={handleAssign} disabled={!assignAthlete}>Confirm Assign</button>
            </div>
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
