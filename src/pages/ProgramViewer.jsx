import { useState, useEffect, useMemo } from 'react';
import { Play, ChevronDown, ChevronUp, Video, Image as ImageIcon, Save, CheckCircle, MessageSquare, UserPlus, Globe } from 'lucide-react';
import { getYouTubeId } from '../utils/helpers';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, getAthleteByEmail, saveSession, getMediaType } from '../api';
import HelpButton from '../components/HelpButton';
import './program-viewer.css';

function normalizeString(str) {
  return String(str).toLowerCase().replace(/\./g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function extractMediaUrl(rawVid) {
  if (!rawVid) return '';
  let match = String(rawVid).match(/https:\/\/[^"'\s<>]+/i);
  if (match) {
    let cleanUrl = match[0];
    if (cleanUrl.includes('b-cdn.net') && !cleanUrl.toLowerCase().match(/\.(mp4|png|jpe?g|gif|webp|mp3|wav|m4a|webm|mov)$/i)) cleanUrl += '.mp4';
    return cleanUrl;
  }
  if (String(rawVid).includes('youtube') || String(rawVid).includes('youtu.be')) return String(rawVid);
  match = String(rawVid).match(/http:\/\/[^"'\s<>]+/i);
  if (match) {
    let cleanUrl = match[0];
    if (cleanUrl.includes('b-cdn.net') && !cleanUrl.toLowerCase().match(/\.(mp4|png|jpe?g|gif|webp|mp3|wav|m4a|webm|mov)$/i)) cleanUrl += '.mp4';
    return cleanUrl;
  }
  if (String(rawVid).match(/^www\./) || String(rawVid).match(/\.com|\.net|\.be/)) {
    let url = 'https://' + String(rawVid).trim();
    if (url.includes('b-cdn.net') && !url.toLowerCase().match(/\.(mp4|png|jpe?g|gif|webp|mp3|wav|m4a|webm|mov)$/i)) url += '.mp4';
    return url;
  }
  return '';
}


function calculateTargetLoad(athletesData, athleteRowIndex, baseLift, multiplier, exerciseName, reps, intensity) {
  if (!intensity || isNaN(parseFloat(intensity)) || parseFloat(intensity) <= 0) return 'Auto';
  if (!baseLift || baseLift.toLowerCase() === 'none') return 'Auto';
  const headers = athletesData[0] || [];
  let colIndex = -1;
  for (let i = 0; i < headers.length; i++) {
    if (normalizeString(headers[i]) === normalizeString(baseLift)) { colIndex = i; break; }
  }
  if (colIndex === -1) return 'Missing ' + baseLift;
  if (athleteRowIndex === null || athleteRowIndex >= athletesData.length) return 'Select athlete';
  const athleteRowData = athletesData[athleteRowIndex] || [];
  const athlete1RM = parseFloat(athleteRowData[colIndex]);
  if (isNaN(athlete1RM) || athlete1RM <= 0) return 'No Max Logged';
  const safeMultiplier = parseFloat(multiplier) || 1.0;
  const safeReps = parseFloat(reps) || 1;
  const modified1RM = athlete1RM * safeMultiplier;
  const target = modified1RM * (1.0278 - (0.0278 * safeReps)) * (parseFloat(intensity) / 100);
  if (isNaN(target)) return 'Auto';
  return target.toFixed(1) + ' kg';
}

function findAthleteRowByEmail(athletesData, email) {
  if (!athletesData.length || !email) return null;
  const headers = athletesData[0] || [];
  let emailCol = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim().toLowerCase();
    if (h === 'email' || h === 'e-mail') { emailCol = i; break; }
  }
  if (emailCol === -1) return null;
  for (let i = 1; i < athletesData.length; i++) {
    if (String((athletesData[i] || [])[emailCol] || '').trim().toLowerCase() === email.toLowerCase()) return i;
  }
  return null;
}

export default function ProgramViewer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [athletesData, setAthletesData] = useState([]);
  const [programData, setProgramData] = useState([]);
  const [libraryData, setLibraryData] = useState([]);
  const [athleteRowIndex, setAthleteRowIndex] = useState(null);
  const [athleteName, setAthleteName] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [expandedVideos, setExpandedVideos] = useState(new Set());
  const [inputValues, setInputValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showProgramMedia, setShowProgramMedia] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { userEmail, isLoading: authLoading } = useAuth();

  useEffect(() => { if (userEmail) loadData(true); }, [userEmail]);

  async function loadData(useCache = false) {
    try {
      if (!userEmail) { setError('Not authenticated'); setLoading(false); return; }
      
      const cached = localStorage.getItem('fp_program_data');
      if (useCache && cached) {
        try {
          const parsed = JSON.parse(cached);
          setAthletesData(parsed.athletes);
          setProgramData(parsed.programs);
          setLibraryData(parsed.library);
          setDataLoaded(true);
          setLoading(false);
          const athleteCached = localStorage.getItem('fp_athlete_data');
          if (athleteCached) {
            try {
              const pAthlete = JSON.parse(athleteCached);
              if (pAthlete.name) setAthleteName(pAthlete.name);
              if (pAthlete.rowIndex !== undefined) setAthleteRowIndex(pAthlete.rowIndex);
            } catch {}
          }
          refreshData();
          return;
        } catch {}
      }
      
      const allData = await fetchAllData();
      if (allData.error) { setError(allData.error); setLoading(false); return; }
      setAthletesData(allData.athletes);
      setProgramData(allData.programs);
      setLibraryData(allData.library);
      
      localStorage.setItem('fp_program_data', JSON.stringify({
        athletes: allData.athletes,
        programs: allData.programs,
        library: allData.library,
        cachedAt: new Date().toISOString()
      }));
      setDataLoaded(true);
      setLoading(false);

      const athleteResult = await getAthleteByEmail(userEmail);
      let rowIndex = null;
      if (athleteResult.status === 'Success' && athleteResult.rowIndex) {
        rowIndex = parseInt(athleteResult.rowIndex);
      } else {
        rowIndex = findAthleteRowByEmail(allData.athletes, userEmail);
      }
      setAthleteRowIndex(rowIndex);
      let name = '';
      if (rowIndex !== null && allData.athletes[rowIndex]) {
        name = String(allData.athletes[rowIndex][0] || '').trim();
      } else {
        name = athleteResult.athleteName || athleteResult.name || userEmail.split('@')[0];
      }
      setAthleteName(name);
    } catch (err) {
      setError('Failed to load data. Please refresh.');
      setLoading(false);
    }
  }

  async function refreshData() {
    try {
      const allData = await fetchAllData();
      if (!allData.error) {
        setAthletesData(allData.athletes);
        setProgramData(allData.programs);
        setLibraryData(allData.library);
        localStorage.setItem('fp_program_data', JSON.stringify({
          athletes: allData.athletes, programs: allData.programs, library: allData.library, cachedAt: new Date().toISOString()
        }));
      }
    } catch {}
  }

  const assignedPrograms = useMemo(() => {
    if (athleteRowIndex === null || !athletesData.length) return [];
    const headers = athletesData[0] || [];
    let assignColIndex = -1;
    for (let c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').trim().toLowerCase() === 'program assignment') { assignColIndex = c; break; }
    }
    if (assignColIndex === -1) return [];
    const assignedStr = String((athletesData[athleteRowIndex] || [])[assignColIndex] || '').trim();
    if (!assignedStr) return [];
    return assignedStr.split(',').map(s => s.trim()).filter(Boolean);
  }, [athletesData, athleteRowIndex]);

  const publicPrograms = useMemo(() => {
    if (!programData.length) return [];
    const map = {};
    programData.slice(1).forEach(row => {
      const name = String(row[0] || '').trim();
      const privacy = String(row[10] || '').trim().toUpperCase();
      if (!name) return;
      if (privacy === 'PUBLIC' && !map[name]) {
        map[name] = { name, exercises: new Set(), phases: new Set() };
      }
      if (map[name]) {
        const ex = String(row[3] || '').trim();
        if (ex) map[name].exercises.add(ex);
        map[name].phases.add(String(row[2] || 'Work Block').trim());
      }
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [programData]);

  const coachNote = useMemo(() => {
    if (!selectedProgram || !programData.length) return '';
    const rows = programData.slice(1).filter(r => String(r[0] || '').trim() === selectedProgram);
    if (!rows.length) return '';
    const note = String(rows[0][9] || '').trim();
    return note && note.toLowerCase() !== 'undefined' ? note : '';
  }, [selectedProgram, programData]);

  const programMediaUrl = useMemo(() => {
    if (!selectedProgram || !programData.length) return '';
    const rows = programData.slice(1).filter(r => String(r[0] || '').trim() === selectedProgram);
    if (!rows.length) return '';
    const url = String(rows[0][12] || '').trim();
    return url && url.toLowerCase() !== 'undefined' ? url : '';
  }, [selectedProgram, programData]);

  const workoutGroups = useMemo(() => {
    if (!selectedProgram || !programData.length) return [];
    let rows = programData.slice(1).filter(r => String(r[0] || '').trim() === selectedProgram);
    if (!rows.length) return [];
    const groups = [];
    let currentGroup = null;
    
    rows.forEach((row, index) => {
      const phase = String(row[2] || '').trim() || 'Work Block';
      const name = String(row[3] || '').trim() || 'Unknown Exercise';
      const numSets = parseInt(String(row[4] || '').trim(), 10) || 1; 
      const reps = String(row[5] || '').trim() || '1';
      const intensity = String(row[6] || '').trim();
      const tempo = String(row[7] || '').trim();
      const rest = String(row[8] || '').trim();
      
      if (!currentGroup || currentGroup.name !== name || currentGroup.phase !== phase) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { id: 'ex_' + index, phase, name, details: [], baseLift: '', multiplier: 1.0, videoUrl: '', ytId: null };
      }
      
      // Multiply out the sets so the athlete UI shows individual input rows for tracking
      for (let s = 0; s < numSets; s++) {
        currentGroup.details.push({ sets: '1', reps, intensity, tempo, rest });
      }
    });

    if (currentGroup) groups.push(currentGroup);
    
    const libMap = new Map();
    for (let k = 1; k < libraryData.length; k++) {
      const libRow = libraryData[k];
      if (!libRow) continue;
      const libName = normalizeString(libRow[0]);
      if (libName && !libMap.has(libName)) { libMap.set(libName, libRow); }
    }
    
    groups.forEach(group => {
      const normalizedName = normalizeString(group.name);
      const libRow = libMap.get(normalizedName);
      if (libRow) {
        group.baseLift = libRow.length > 3 ? String(libRow[3] || '').trim() : '';
        group.multiplier = (libRow.length > 4 && String(libRow[4] || '').trim() !== '') ? parseFloat(libRow[4]) : 1.0;
        const rawVid = String(libRow[1] || '').trim();
        group.videoUrl = extractMediaUrl(rawVid); 
        group.ytId = getYouTubeId(rawVid);
      }
    });
    return groups;
  }, [selectedProgram, programData, libraryData]);

  const phaseSections = useMemo(() => {
    const phaseMap = {
      'warm up': 'Warm Up', 'warmup': 'Warm Up',
      'work block': 'Work Block', 'workblock': 'Work Block',
      'cool down': 'Cool Down', 'cooldown': 'Cool Down'
    };
        const sections = [
      { title: 'Warm Up', items: [], color: '#fd7e14' },      // Orange
      { title: 'Work Block', items: [], color: '#22c55e' },   // Green
      { title: 'Other Content', items: [], color: '#888888' },
      { title: 'Cool Down', items: [], color: '#ef4444' },    // Light Red
    ];
    
    workoutGroups.forEach(g => {
      const phaseKey = String(g.phase || '').toLowerCase().trim();
      const normalizedPhaseTitle = phaseMap[phaseKey] || 'Other Content';
      const section = sections.find(s => s.title === normalizedPhaseTitle);
      if (section) section.items.push(g);
    });
    return sections.filter(s => s.items.length > 0);
  }, [workoutGroups]);

  function handleProgramChange(progName) {
    setSelectedProgram(progName);
    setInputValues({});
    setSaveSuccess(false);
    setShowProgramMedia(false);
  }

  function toggleMedia(groupId) {
    setExpandedVideos(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      // Create completely new Set instance
      return new Set(next);
    });
  }

  function handleInputChange(groupId, detailIdx, field, value) {
    const key = groupId + '_' + detailIdx;
    setInputValues(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handleSaveSession() {
    if (!workoutGroups.length) return;
    setSaving(true);
    const loggedProgStr = selectedProgram;
    const setsToLog = [];
    const maxUpdates = {};
    workoutGroups.forEach(group => {
      const isCore = group.baseLift && group.baseLift.toLowerCase() !== 'none' && group.name.toLowerCase() === group.baseLift.toLowerCase();
      group.details.forEach((set, idx) => {
        const key = group.id + '_' + idx;
        const input = inputValues[key] || {};
        const target = calculateTargetLoad(athletesData, athleteRowIndex, group.baseLift, group.multiplier, group.name, set.reps, set.intensity);
        const targetNum = target.replace(' kg', '');
        const wt = input.wt || (isNaN(parseFloat(targetNum)) ? '' : targetNum);
        const rp = input.reps || set.reps;
        if (!wt || wt === '--' || !rp) return;
        const wtNum = parseFloat(wt);
        const rpNum = parseFloat(rp);
        if (wtNum > 0 && rpNum > 0) {
          setsToLog.push({ exercise: group.name, weight: wtNum, reps: rpNum });
          if (isCore && group.baseLift && group.baseLift !== 'none') {
            const e1rm = Math.round(wtNum / (1.0278 - (0.0278 * rpNum)));
            if (!maxUpdates[group.baseLift] || e1rm > maxUpdates[group.baseLift]) maxUpdates[group.baseLift] = e1rm;
          }
        }
      });
    });
    if (!setsToLog.length && !Object.keys(maxUpdates).length) {
      alert('Nothing to save.');
      setSaving(false);
      return;
    }
    const payload = { athlete: athleteName, prog: loggedProgStr, sets: setsToLog, maxUpdates };
    try {
      const res = await saveSession(payload);
      if (res.status === 'Success') { setSaveSuccess(true); } else { alert('Save failed. Please try again.'); }
    } catch (err) {
      alert('Network error. Please try again.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="pv-container">
        <div className="pv-body">
          <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Today's Workout</h2>
          <p className="pv-placeholder">Loading program data...</p>
        </div>
        <HelpButton pageName="Program View" position="bottom-right" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="pv-container">
        <div className="pv-body">
          <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Today's Workout</h2>
          <p className="pv-error">{error}</p>
        </div>
        <HelpButton pageName="Program View" position="bottom-right" />
      </div>
    );
  }

  return (
    <div className="pv-container">
      <div className="pv-body">
        <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Today's Workout</h2>
        {athleteName && <p style={{ color: '#666', fontSize: '15px', marginBottom: '20px' }}>Welcome, {athleteName}</p>}

        <div className="pv-search-box">
          <input type="text" placeholder="Search programs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <div className="pv-panels">
          <div className="pv-panel">
            <div className="pv-panel-header">
              <h3 className="pv-panel-title" style={{ color: '#008ed3' }}>
                <UserPlus size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                My Programs
              </h3>
              <span className="pv-count-badge">{assignedPrograms.length}</span>
            </div>
            {assignedPrograms.length === 0 ? (
              <p className="pv-panel-empty">No programs assigned yet.</p>
            ) : (
              <div className="pv-program-buttons">
                {assignedPrograms.filter(prog => prog.toLowerCase().includes(searchQuery.toLowerCase())).map(prog => (
                  <button key={prog} className={`pv-program-btn ${selectedProgram === prog ? 'active' : ''}`} onClick={() => handleProgramChange(prog)}>
                    <Play size={16} /> {prog}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pv-panel">
            <div className="pv-panel-header">
              <h3 className="pv-panel-title" style={{ color: '#2e7d32' }}>
                <Globe size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                Public Programs
              </h3>
              <span className="pv-count-badge">{publicPrograms.length}</span>
            </div>
            {publicPrograms.length === 0 ? (
              <p className="pv-panel-empty">No public programs available.</p>
            ) : (
              <div className="pv-program-buttons">
                {publicPrograms.filter(prog => prog.name.toLowerCase().includes(searchQuery.toLowerCase())).map(prog => (
                  <button key={prog.name} className={`pv-program-btn ${selectedProgram === prog.name ? 'active' : ''}`} onClick={() => handleProgramChange(prog.name)}>
                    <Play size={16} /> {prog.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {(coachNote || programMediaUrl) && (
          <div className="pv-coach-note" style={{ marginBottom: '20px', borderTopColor: '#6d4aff' }}>
            <div className="pv-coach-note-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4><MessageSquare size={14} /> Coach's Notes</h4>
              {programMediaUrl && (
                <button className="pv-media-inline-btn" onClick={() => setShowProgramMedia(!showProgramMedia)}>
                  {getMediaType(programMediaUrl) === 'audio' ? '🎙️' : '🎬'} {showProgramMedia ? 'Hide' : 'Play'}
                </button>
              )}
            </div>
            {coachNote && <p style={{ color: '#6d4aff', fontStyle: 'italic', marginLeft: '4px' }}>{coachNote}</p>}
            {programMediaUrl && showProgramMedia && (
              <div className="pv-media-player-wrap">
                {getYouTubeId(programMediaUrl) ? (
                  <iframe src={'https://www.youtube.com/embed/' + getYouTubeId(programMediaUrl) + '?autoplay=1&rel=0'} allowFullScreen title="Coach Program Media" className="pv-media-iframe" />
                ) : (programMediaUrl.toLowerCase().includes('.png') || programMediaUrl.toLowerCase().includes('.jpg')) ? (
                  <img src={programMediaUrl} alt="Program Media" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px' }} />
                ) : getMediaType(programMediaUrl) === 'audio' ? (
                  <audio src={programMediaUrl} controls preload="metadata" className="pv-media-audio" />
                ) : (
                  <video src={programMediaUrl} controls playsInline preload="metadata" className="pv-media-video" />
                )}
              </div>
            )}
          </div>
        )}

        {workoutGroups.length === 0 && selectedProgram && (
          <p className="pv-placeholder">No exercises found for this program.</p>
        )}

        {!selectedProgram && (
          <p className="pv-placeholder">Select a program from above to view your workout.</p>
        )}

       {phaseSections.map(section => (
          <div key={section.title} className="pv-phase-card" style={{ borderTopColor: section.color }}>
            <div className="pv-phase-header" style={{ backgroundColor: section.color, color: '#fff' }}>
              {section.title}
            </div>

            <div className="pv-phase-body" style={{ "--phase-color": section.color }}>
              {section.items.map(group => {
                const hasMedia = group.videoUrl || group.ytId;
                const isImage = group.videoUrl && (group.videoUrl.toLowerCase().includes('.png') || group.videoUrl.toLowerCase().includes('.jpg'));
                
                return (
                  <div key={group.id}>
                    <div className="pv-exercise-header">
                      <h4 className="pv-exercise-name">{group.name}</h4>
                      {hasMedia && (
                        <button className="pv-video-toggle" style={{ color: section.color, borderColor: section.color, background: `${section.color}0D` }} onClick={() => toggleMedia(group.id)}>
                          {isImage ? <ImageIcon size={12} /> : <Video size={12} />} Media
                        </button>
                      )}
                    </div>
                    
                    {hasMedia && expandedVideos.has(group.id) && (
                      <div className="pv-video-container" style={{ padding: isImage ? '10px' : '0' }}>
                        {group.ytId ? (
                          <iframe src={`https://www.youtube.com/embed/${group.ytId}?autoplay=1&rel=0`} allowFullScreen title={group.name} />
                        ) : isImage ? (
                          <img src={group.videoUrl} alt={group.name} style={{ width: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: '4px' }} />
                                                ) : (
                          <video key={group.videoUrl} src={group.videoUrl} autoPlay controls playsInline preload="metadata" controlsList="nodownload" style={{ width: '100%', borderRadius: '4px' }}></video>
                        )}
                      </div>
                    )}
                    
                    {group.details.map((set, idx) => {
                      const target = calculateTargetLoad(athletesData, athleteRowIndex, group.baseLift, group.multiplier, group.name, set.reps, set.intensity);
                      const targetNum = target.replace(' kg', '');
                      const inputKey = group.id + '_' + idx;
                      const input = inputValues[inputKey] || {};
                      return (
                        <div key={idx} className="pv-set-row">
                          <div className="pv-set-info">
                            <div className="pv-set-label"><strong>Set {idx + 1}:</strong> {set.reps} reps {set.intensity ? '@ ' + set.intensity + '%' : ''}</div>
                            {(set.tempo || set.rest) && (
                              <div className="pv-set-meta">
                                {set.tempo && <>Tempo: <span style={{ color: '#555' }}>{set.tempo}</span>{set.rest ? ' | ' : ''}</>}
                                {set.rest && <>Rest: <span style={{ color: '#555' }}>{set.rest}</span></>}
                              </div>
                            )}
                            <div className="pv-target">Target: <span className="pv-target-value" style={{ color: section.color }}>{targetNum ? targetNum + 'kg' : target}</span></div>
                          </div>
                          <div className="pv-inputs">
                            <div className="pv-input-group">
                              <span className="pv-input-label">kg</span>
                              <input type="number" className="pv-input" placeholder={targetNum || '--'} value={input.wt || ''} onChange={e => handleInputChange(group.id, idx, 'wt', e.target.value)} />
                            </div>
                            <div className="pv-input-group">
                              <span className="pv-input-label">reps</span>
                              <input type="number" className="pv-input" placeholder={set.reps} value={input.reps || ''} onChange={e => handleInputChange(group.id, idx, 'reps', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {workoutGroups.length > 0 && !saveSuccess && (
          <div className="pv-tracker">
            <button className="pv-save-btn" onClick={handleSaveSession} disabled={saving}>
              <Save size={18} /> {saving ? 'SAVING...' : 'SAVE & COMPLETE WORKOUT'}
            </button>
          </div>
        )}

        {saveSuccess && (
          <div className="pv-tracker">
            <p className="pv-success-msg"><CheckCircle size={18} /> Excellent work! Data logged to your history.</p>
          </div>
        )}
      </div>
      <HelpButton pageName="Program View" position="bottom-right" />
    </div>
  );
}

