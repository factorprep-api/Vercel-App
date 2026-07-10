import { useState, useEffect, useMemo } from 'react';
import { Search, Play, Layers, Dumbbell, FolderClosed } from 'lucide-react';
import { fetchAllData } from '../api';
import './program-library.css';

export default function MyPrograms() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [athletesData, setAthletesData] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProgram, setExpandedProgram] = useState(null);
  const [athleteName, setAthleteName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const allData = await fetchAllData();
      if (allData.error) { setError(allData.error); setLoading(false); return; }
      
      setAthletesData(allData.athletes);
      
      // Find athlete email from Supabase
      const { data: { user } } = await import('../supabase').then(m => m.supabase.auth.getUser());
      if (user) {
        setAthleteName(user.user_metadata?.name || user.email.split('@')[0]);
      }

      // Get all programs
      const programMap = {};
      allData.programs.slice(1).forEach(row => {
        const name = String(row[0] || '').trim();
        if (!name) return;
        if (!programMap[name]) {
          programMap[name] = { name, categories: new Set(), exercises: new Set(), phases: new Set(), rows: [] };
        }
        const phase = String(row[2] || '').trim() || 'Work Block';
        const ex = String(row[3] || '').trim();
        if (phase) programMap[name].phases.add(phase);
        if (ex) programMap[name].exercises.add(ex);
        programMap[name].rows.push(row);
      });
      setPrograms(Object.values(programMap));

      // Filter to only assigned programs for this athlete
      const assignedProgs = [];
      allData.assignments.slice(1).forEach(row => {
        if (user && String(row[0] || '').trim().toLowerCase() === user.email.toLowerCase()) {
          const progName = String(row[2] || '').trim();
          if (progName && programMap[progName]) {
            assignedProgs.push(programMap[progName]);
          }
        }
      });
      setAssignments(assignedProgs);
      setLoading(false);
    } catch (err) {
      setError('Failed to load programs. Please refresh.');
      setLoading(false);
    }
  }

  const filteredPrograms = useMemo(() => {
    if (!searchQuery.trim()) return assignments;
    const q = searchQuery.toLowerCase();
    return assignments.filter(p => p.name.toLowerCase().includes(q));
  }, [assignments, searchQuery]);

  function toggleExpand(name) {
    setExpandedProgram(expandedProgram === name ? null : name);
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
        <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>My Programs</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>Assigned workouts for {athleteName}</p>

        <div className="pl-search-wrapper">
          <Search className="pl-search-icon" size={18} />
          <input
            type="text"
            className="pl-search-box"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search my programs..."
          />
        </div>

        {loading && <p className="pl-placeholder">Loading programs...</p>}
        {error && <p className="pl-error">{error}</p>}
        {!loading && !error && filteredPrograms.length === 0 && (
          <p className="pl-placeholder">No programs assigned. Check with your coach!</p>
        )}

        {!loading && !error && (
          <div className="pl-program-list">
            {filteredPrograms.map(program => (
              <div key={program.name} className="pl-program-card">
                <div className="pl-program-header" onClick={() => toggleExpand(program.name)}>
                  <div>
                    <div className="pl-program-name">{program.name}</div>
                    <div className="pl-program-meta">
                      <span className="pl-meta-badge"><Layers size={10} /> {program.phases.size} phases</span>
                      <span className="pl-meta-badge"><Dumbbell size={10} /> {program.exercises.size} exercises</span>
                    </div>
                  </div>
                  <div className="pl-actions" onClick={e => e.stopPropagation()}>
                    <button className="pl-assign-btn" onClick={() => window.location.href = '/program-viewer?program=' + encodeURIComponent(program.name)}>
                      <Play size={14} /> Start
                    </button>
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
    </div>
  );
}
