import { useState, useEffect, useMemo } from 'react';
import { Play, ChevronDown, ChevronUp, Video, Save, CheckCircle, X, MessageSquare, UserPlus, Globe } from 'lucide-react';
import { supabase } from '../supabase';
import { fetchAllData, getAthleteByEmail, saveSession, getMediaType } from '../api';
import './program-viewer.css';
import HelpButton from '../components/HelpButton';

function normalizeString(str) {
  return String(str)
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getYouTubeId(url) {
  const m = String(url).match(/(?:v=|v\/|vi=|vi\/|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function extractVideoUrl(rawVid) {
  if (!rawVid) return '';
  let match = String(rawVid).match(/https:\/\/[^"'\s<>]+/i);
  if (match) {
    let cleanUrl = match[0];
    if (cleanUrl.includes('b-cdn.net') && !cleanUrl.toLowerCase().endsWith('.mp4')) cleanUrl += '.mp4';
    return cleanUrl;
  }
  if (String(rawVid).includes('youtube') || String(rawVid).includes('youtu.be')) return String(rawVid);
  match = String(rawVid).match(/http:\/\/[^"'\s<>]+/i);
  if (match) {
    let cleanUrl = match[0];
    if (cleanUrl.includes('b-cdn.net') && !cleanUrl.toLowerCase().endsWith('.mp4')) cleanUrl += '.mp4';
    return cleanUrl;
  }
  if (String(rawVid).match(/^www\./) || String(rawVid).match(/\.com|\.net|\.be/)) {
    let url = 'https://' + String(rawVid).trim();
    if (url.includes('b-cdn.net') && !url.toLowerCase().endsWith('.mp4')) url += '.mp4';
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
  const [athletesData, setAthletesData] = useState([]);
  const [programData, setProgramData] = useState([]);
  const [libraryData, setLibraryData] = useState([]);
  const [athleteRowIndex, setAthleteRowIndex] = useState(null);
  const [athleteName, setAthleteName] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedVideos, setExpandedVideos] = useState(new Set());
  const [inputValues, setInputValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showProgramMedia, setShowProgramMedia] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); setLoading(false); return; }
      const allData = await fetchAllData();
      if (allData.error) { setError(allData.error); setLoading(false); return; }
      setAthletesData(allData.athletes);
      setProgramData(allData.programs);
      setLibraryData(allData.library);
      
      const athleteResult = await getAthleteByEmail(user.email);
      let rowIndex = null;
      if (athleteResult.status === 'Success' && athleteResult.rowIndex) {
        rowIndex = parseInt(athleteResult.rowIndex);
      } else {
        rowIndex = findAthleteRowByEmail(allData.athletes, user.email);
      }
      setAthleteRowIndex(rowIndex);
      let name = '';
      if (rowIndex !== null && allData.athletes[rowIndex]) {
        name = String(allData.athletes[rowIndex][0] || '').trim();
      } else if (athleteResult.status === 'Success') {
        name = athleteResult.athleteName || athleteResult.name || user.user_metadata?.name || user.email.split('@')[0];
      } else {
        name = user.user_metadata?.name || user.email.split('@')[0];
      }
      setAthleteName(name);
      setLoading(false);
    } catch (err) {
      setError('Failed to load data. Please refresh.');
      setLoading(false);
    }
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
        const cat = String(row[1] || '').trim();
        const ex = String(row[3] || '').trim();
        map[name] = { name, categories: new Set(), exercises: new Set(), phases: new Set() };
        if (cat) map[name].categories.add(cat);
        if (ex) map[name].exercises.add(ex);
        map[name].phases.add(String(row[2] || 'Work Block').trim());
      }
      if (map[name]) {
        const cat = String(row[1] || '').trim();
        const ex = String(row[3] || '').trim();
        if (cat) map[name].categories.add(cat);
        if (ex) map[name].exercises.add(ex);
        map[name].phases.add(String(row[2] || 'Work Block').trim());
      }
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [programData]);

  const categories = useMemo(() => {
    if (!selectedProgram || !programData.length) return [];
    return [...new Set(programData.slice(1).filter(r => String(r[0] || '').trim() === selectedProgram).map(r => String(r[1] || '').trim()))].filter(Boolean).sort();
  }, [selectedProgram, programData]);

  const coachNote = useMemo(() => {
    if (!selectedProgram || !programData.length) return '';
    const rows = programData.slice(1).filter(r => {
      if (String(r[0] || '').trim() !== selectedProgram) return false;
      if (selectedCategory && String(r[1] || '').trim() !== selectedCategory) return false;
      return true;
    });
    if (!rows.length) return '';
    const note = String(rows[0][9] || '').trim();
    return note && note.toLowerCase() !== 'undefined' ? note : '';
  }, [selectedProgram, selectedCategory, programData]);

  const programMediaUrl = useMemo(() => {
    if (!selectedProgram || !programData.length) return '';
    const rows = programData.slice(1).filter(r => {
      if (String(r[0] || '').trim() !== selectedProgram) return false;
      if (selectedCategory && String(r[1] || '').trim() !== selectedCategory) return false;
      return true;
    });
    if (!rows.length) return '';
    const url = String(rows[0][12] || '').trim();
    return url && url.toLowerCase() !== 'undefined' ? url : '';
  }, [selectedProgram, selectedCategory, programData]);

  const workoutGroups = useMemo(() => {
    if (!selectedProgram || !programData.length) return [];
    let rows = programData.slice(1).filter(r => String(r[0] || '').trim() === selectedProgram);
    if (selectedCategory) rows = rows.filter(r => String(r[1] || '').trim() === selectedCategory);
    if (!rows.length) return [];
    const groups = [];
    let currentGroup = null;
    rows.forEach((row, index) => {
      const phase = String(row[2] || '').trim() || 'Work Block';
      const name = String(row[3] || '').trim() || 'Unknown Exercise';
      const sets = String(row[4] || '').trim() || '1';
      const reps = String(row[5] || '').trim() || '1';
      const intensity = String(row[6] || '').trim();
      const tempo = String(row[7] || '').trim();
      const rest = String(row[8] || '').trim();
      if (!currentGroup || currentGroup.name !== name || currentGroup.phase !== phase) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { id: 'ex_' + index, phase, name, details: [], baseLift: '', multiplier: 1.0, videoUrl: '', ytId: null };
      }
      currentGroup.details.push({ sets, reps, intensity, tempo, rest });
    });
    if (currentGroup) groups.push(currentGroup);
    
    const libMap = new Map();
    for (let k = 1; k < libraryData.length; k++) {
      const libRow = libraryData[k];
      if (!libRow) continue;
      const libName = normalizeString(libRow[0]);
      if (libName && !libMap.has(libName)) {
        libMap.set(libName, libRow);
      }
    }
    
    groups.forEach(group => {
      const normalizedName = normalizeString(group.name);
      const libRow = libMap.get(normalizedName);
      if (libRow) {
        group.baseLift = libRow.length > 3 ? String(libRow[3] || '').trim() : '';
        group.multiplier = (libRow.length > 4 && String(libRow[4] || '').trim() !== '') ? parseFloat(libRow[4]) : 1.0;
        const rawVid = String(libRow[1] || '').trim();
        group.videoUrl = extractVideoUrl(rawVid);
        group.ytId = getYouTubeId(rawVid);
      }
    });
    return groups;
  }, [selectedProgram, selectedCategory, programData, libraryData]);

  const phaseSections = useMemo(() => {
    return [
      { title: 'Warm Up', items: workoutGroups.filter(g => g.phase === 'Warm Up'), color: '#d3ca17' },
      { title: 'Work Block', items: workoutGroups.filter(g => g.phase === 'Work Block'), color: '#008ed3' },
      { title: 'Other Content', items: workoutGroups.filter(g => g.phase !== 'Warm Up' && g.phase !== 'Work Block' && g.phase !== 'Cool Down'), color: '#888' },
      { title: 'Cool Down', items: workoutGroups.filter(g => g.phase === 'Cool Down'), color: '#dc3545' },
    ].filter(s => s.items.length > 0);
  }, [workoutGroups]);

  function handleProgramChange(progName) {
    setSelectedProgram(progName);
    setSelectedCategory('');
    setInputValues({});
    setSaveSuccess(false);
    setShowProgramMedia(false);
  }

  function toggleVideo(groupId) {
    setExpandedVideos(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  function handleInputChange(groupId, detailIdx, field, value) {
    const key = groupId + '_' + detailIdx;
    setInputValues(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handleSaveSession() {
    if (!workoutGroups.length) return;
    setSaving(true);
    const loggedProgStr = selectedCategory ? selectedProgram + ' (' + selectedCategory + ')' : selectedProgram;
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
        if (!wt && !rp) return;
        setsToLog.push({ exercise: group.name, weight: wt, reps: rp });
        if (isCore && wt && rp) {
          const val = parseFloat(wt);
          if (!maxUpdates[group.name] || val > maxUpdates[group.name]) {
            maxUpdates[group.name] = val;
          }
        }
      });
    });
    try {
      const res = await saveSession({
        athlete: athleteName,
        prog: loggedProgStr,
        sets: setsToLog,
        maxUpdates: maxUpdates
      });
      if (res.status === 'Success') {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('Save failed: ' + (res.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="pv-container">
        <div className="pv-body">
          <p className="pv-placeholder">Loading...</p>
        </div>
        <HelpButton pageName="Program View" position="bottom-right" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="pv-container">
        <div className="pv-body">
          <p className="pv-error-text">{error}</p>
        </div>
        <HelpButton pageName="Program View" position="bottom-right" />
      </div>
    );
  }

  const programMediaType = programMediaUrl ? getMediaType(programMediaUrl) : null;
  const programMediaYtId = programMediaUrl ? getYouTubeId(programMediaUrl) : null;

  return (
    <div className="pv-container">
      <div className="pv-body">
        <h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Program Viewer</h2>
        
        <div className="pv-athlete-info">
          <div className="pv-info-card">
            <span className="pv-info-label">Logged in as:</span>
            <span className="pv-info-value">{athleteName}</span>
          </div>
          <div className="pv-info-card">
            <span className="pv-info-label">Status:</span>
            <span className="pv-info-value">{athleteRowIndex !== null ? 'Rostered Athlete' : 'Unregistered Guest'}</span>
          </div>
        </div>

        {/* Two Panels: My Programs + Public Programs */}
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
                {assignedPrograms.map(prog => (
                  <button
                    key={prog}
                    className={'pv-program-btn' + (selectedProgram === prog ? ' active' : '')}
                    onClick={() => handleProgramChange(prog)}
                  >
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
                {publicPrograms.map(prog => (
                  <button
                    key={prog.name}
                    className={'pv-program-btn' + (selectedProgram === prog.name ? ' active' : '')}
                    onClick={() => handleProgramChange(prog.name)}
                  >
                    <Play size={16} /> {prog.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category filter if program selected */}
        {selectedProgram && categories.length > 0 && (
          <div className="pv-category-filter">
            <label>Category:</label>
            <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSaveSuccess(false); }}>
              <option value="">- All Categories -</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        )}

        {coachNote && (
          <div className="pv-note-box">
            <MessageSquare size={14} style={{ marginRight: 8, color: '#008ed3' }} />
            <strong>Coach's Note:</strong> {coachNote}
          </div>
        )}

        {programMediaUrl && (
          <div className="pv-media-container">
            <div className="pv-media-header" onClick={() => setShowProgramMedia(!showProgramMedia)} style={{ cursor: 'pointer' }}>
              <span className="pv-media-title">
                {programMediaType === 'audio' ? 'Voice Note' : 'Video'} - Coach Program Overview
              </span>
              <button className="pv-media-toggle-btn">
                {showProgramMedia ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showProgramMedia ? 'Hide' : 'Play'}
              </button>
            </div>
            {showProgramMedia && (
              <div className="pv-media-player-wrap">
                {programMediaYtId ? (
                  <iframe
                    src={'https://www.youtube.com/embed/' + programMediaYtId + '?rel=0'}
                    allowFullScreen
                    title="Coach Program Media"
                    className="pv-media-iframe"
                  />
                ) : programMediaType === 'audio' ? (
                  <audio src={programMediaUrl} controls preload="metadata" className="pv-media-audio" />
                ) : (
                  <video src={programMediaUrl} controls playsInline preload="metadata" className="pv-media-video" />
                )}
              </div>
            )}
          </div>
        )}

        {phaseSections.length > 0 ? (
          phaseSections.map(section => (
            <div key={section.title} className="pv-section">
              <div className="pv-section-header" style={{ borderLeft: '4px solid ' + section.color }}>
                <h3 className="pv-section-title" style={{ color: section.color }}>{section.title}</h3>
                <span className="pv-section-count">{section.items.length} exercise{section.items.length !== 1 ? 's' : ''}</span>
              </div>
              {section.items.map(group => (
                <div key={group.id} className="pv-workout-card">
                  <div className="pv-workout-main">
                    <div className="pv-ex-title">{group.name}</div>
                    <div className="pv-ex-meta">
                      {group.details.length} set{group.details.length !== 1 ? 's' : ''}
                      {group.baseLift && group.baseLift !== 'none' && (
                        <span className="pv-base-lift">(Base: {group.baseLift} | Mult: {group.multiplier}x)</span>
                      )}
                    </div>
                  </div>
                  {group.videoUrl && (
                    <div className="pv-video-action">
                      <button className="pv-video-toggle" onClick={() => toggleVideo(group.id)}>
                        {expandedVideos.has(group.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        {expandedVideos.has(group.id) ? 'Hide Video' : 'Show Video'}
                      </button>
                      {expandedVideos.has(group.id) && (
                        <div className="pv-video-container">
                          {group.ytId ? (
                            <iframe src={'https://www.youtube.com/embed/' + group.ytId + '?rel=0'} allowFullScreen title={group.name} />
                          ) : (
                            <video controls playsInline controlsList="nodownload">
                              <source src={group.videoUrl} type="video/mp4" />
                            </video>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="pv-details-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Set</th>
                          <th>% Intensity</th>
                          <th>Target Load</th>
                          <th>Tempo</th>
                          <th>Reps (Target)</th>
                          <th>Your Weight</th>
                          <th>Your Reps</th>
                          <th>Rest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.details.map((detail, dIdx) => {
                          const key = group.id + '_' + dIdx;
                          const input = inputValues[key] || {};
                          const target = calculateTargetLoad(athletesData, athleteRowIndex, group.baseLift, group.multiplier, group.name, detail.reps, detail.intensity);
                          return (
                            <tr key={dIdx}>
                              <td>{dIdx + 1}</td>
                              <td>{detail.intensity || '-'}</td>
                              <td className={target !== 'Auto' ? 'pv-target-cell' : ''}>{target}</td>
                              <td>{detail.tempo || '-'}</td>
                              <td>{detail.reps}</td>
                              <td><input className="pv-input-sm" type="number" placeholder="kg" value={input.wt || ''} onChange={e => handleInputChange(group.id, dIdx, 'wt', e.target.value)} /></td>
                              <td><input className="pv-input-sm" type="number" placeholder="" value={input.reps || ''} onChange={e => handleInputChange(group.id, dIdx, 'reps', e.target.value)} /></td>
                              <td>{detail.rest || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          selectedProgram && <p className="pv-placeholder">No exercises found for this program.</p>
        )}

        {!selectedProgram && (
          <p className="pv-placeholder">Select a program from above to view your workout.</p>
        )}

        {workoutGroups.length > 0 && (
          <div className="pv-save-section">
            <button className="pv-save-btn" onClick={handleSaveSession} disabled={saving}>
              <Save size={18} /> {saving ? 'Saving...' : 'Save Session'}
            </button>
            {saveSuccess && (
              <div className="pv-save-success">
                <CheckCircle size={18} style={{ color: '#28a745', marginRight: 8 }} />
                Session saved successfully!
              </div>
            )}
          </div>
        )}
      </div>
      <HelpButton pageName="Program View" position="bottom-right" />
    </div>
  );
}
