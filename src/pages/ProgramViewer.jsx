import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronDown, ChevronUp, Video, Image as ImageIcon, Save, CheckCircle, MessageSquare, UserPlus, Globe, Timer, Pause, RotateCcw, Plus, Minus, X, ArrowLeft } from 'lucide-react';
import { getYouTubeId } from '../utils/helpers';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, getAthleteByEmail, saveSession, getMediaType, getLatestMaxes, fetchLogbookByAthlete } from '../api';
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

function parseTimeToSeconds(str) {
  if (!str) return 0;
  const colonMatch = str.match(/(\d+):(\d+)/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  const secMatch = str.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (secMatch) return parseFloat(secMatch[1]);
  const rawNum = parseFloat(str);
  if (!isNaN(rawNum)) return rawNum;
  return 0;
}

function formatSecondsToTime(sec) {
  if (sec < 60) return Math.round(sec * 10) / 10 + 's';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function parseDistance(str) {
  if (!str) return { val: 0, unit: 'm' };
  const match = str.match(/(\d+(?:\.\d+)?)\s*(m|km)/i);
  if (match) return { val: parseFloat(match[1]), unit: match[2].toLowerCase() };
  const rawNum = parseFloat(str);
  if (!isNaN(rawNum)) return { val: rawNum, unit: 'm' };
  return { val: 0, unit: 'm' };
}

function calculateTargetLoad(libraryData, athleteMaxes, lastWeights, exerciseName, reps, intensity) {
  if (!intensity || isNaN(parseFloat(intensity)) || parseFloat(intensity) <= 0) return { text: '', val: '', source: 'none', metric: '' };

  const safeReps = parseFloat(reps) || 1;
  const intensityDecimal = parseFloat(intensity) / 100;

  const exInfo = libraryData.find(ex => normalizeString(ex[0]) === normalizeString(exerciseName));
  
  let calcType = String(exInfo?.[3] || '').trim().toLowerCase();
  if (calcType === 'yes') calcType = 'weight';

  let source = 'none';
  let targetText = '';
  let targetVal = '';
  let metricType = calcType;

  if (calcType === 'time') {
    const lastEntry = lastWeights[normalizeString(exerciseName)];
    if (lastEntry && lastEntry.repsString) {
      let prevSeconds = parseTimeToSeconds(lastEntry.repsString);
      if (prevSeconds > 0) {
        const targetSeconds = prevSeconds / intensityDecimal; 
        targetText = formatSecondsToTime(targetSeconds);
        targetVal = targetText;
        source = 'history';
      }
    }
  } 
  else if (calcType === 'distance') {
    const lastEntry = lastWeights[normalizeString(exerciseName)];
    if (lastEntry && lastEntry.repsString) {
      let prevDist = parseDistance(lastEntry.repsString);
      if (prevDist.val > 0) {
        const targetDist = prevDist.val * intensityDecimal;
        targetText = (Math.round(targetDist * 10) / 10) + prevDist.unit;
        targetVal = targetText;
        source = 'history';
      }
    }
  }
  else if (calcType === 'weight') {
    let oneRM = 0;
    const maxEntry = athleteMaxes[normalizeString(exerciseName)];
    
    if (maxEntry && maxEntry.oneRM > 0) {
      oneRM = maxEntry.oneRM;
      source = '1rm';
    } else {
      const lastEntry = lastWeights[normalizeString(exerciseName)];
      if (lastEntry && lastEntry.weight > 0) {
        const lastWt = parseFloat(lastEntry.weight);
        let lastRepsNum = parseFloat(lastEntry.repsString) || 1;
        oneRM = lastWt * (1 + 0.0333 * lastRepsNum);
        source = 'history';
      }
    }
    
    if (oneRM > 0) {
      const repMax = oneRM / (1 + 0.0333 * safeReps);
      const target = repMax * intensityDecimal;
      targetVal = Math.round(target);
      targetText = targetVal + 'kg';
    }
  }

  return { text: targetText, val: targetVal, source: source, metric: metricType };
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
  const [targetCalcs, setTargetCalcs] = useState({});
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
  
  const [timerExpanded, setTimerExpanded] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90); 
  const [isEditingTimer, setIsEditingTimer] = useState(false);
  const [timerInputValue, setTimerInputValue] = useState('');
  
  const { userEmail, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let interval = null;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => { setTimeLeft((prev) => prev - 1); }, 1000);
    } else if (timerActive && timeLeft === 0) {
      setTimerActive(false);
      try { const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); audio.play(); } catch (e) {}
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const formatTimeStr = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const adjustTimer = (amount) => { setTimeLeft((prev) => Math.max(0, prev + amount)); };

  const handleTimerClick = () => {
    setTimerActive(false);
    setIsEditingTimer(true);
    setTimerInputValue(formatTimeStr(timeLeft));
  };

  const handleTimerSubmit = (e) => {
    e.preventDefault();
    let newSeconds = 0;
    if (timerInputValue.includes(':')) {
      const parts = timerInputValue.split(':');
      newSeconds = parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0);
    } else {
      newSeconds = parseInt(timerInputValue || 0);
    }
    if (!isNaN(newSeconds)) {
      setTimeLeft(newSeconds);
    }
    setIsEditingTimer(false);
  };
  
  useEffect(() => { if (userEmail) loadData(true); }, [userEmail]);

  async function loadData(useCache = false) {
    try {
      if (!userEmail) { setError('Not authenticated'); setLoading(false); return; }
      const cached = localStorage.getItem('fp_program_data');
      if (useCache && cached) {
        try {
          const parsed = JSON.parse(cached);
          setAthletesData(parsed.athletes); setProgramData(parsed.programs); setLibraryData(parsed.library);
          setDataLoaded(true); setLoading(false);
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
      
      let attempts = 0; let success = false; let allData = null;
      while (attempts < 3 && !success) {
        try {
          allData = await fetchAllData();
          if (allData.error) throw new Error(allData.error);
          success = true;
        } catch (err) {
          attempts++;
          if (attempts >= 3) { setError('Database connection is weak right now. Please refresh.'); setLoading(false); return; }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setAthletesData(allData.athletes); setProgramData(allData.programs); setLibraryData(allData.library);
      localStorage.setItem('fp_program_data', JSON.stringify({ athletes: allData.athletes, programs: allData.programs, library: allData.library, cachedAt: new Date().toISOString() }));
      setDataLoaded(true); setLoading(false);

      const athleteResult = await getAthleteByEmail(userEmail);
      let rowIndex = null;
      if (athleteResult.status === 'Success' && athleteResult.rowIndex) { rowIndex = parseInt(athleteResult.rowIndex); } 
      else { rowIndex = findAthleteRowByEmail(allData.athletes, userEmail); }
      setAthleteRowIndex(rowIndex);
      let name = '';
      if (rowIndex !== null && allData.athletes[rowIndex]) { name = String(allData.athletes[rowIndex][0] || '').trim(); } 
      else { name = athleteResult.athleteName || athleteResult.name || userEmail.split('@')[0]; }
      setAthleteName(name);
    } catch (err) { setError('Failed to load data.'); setLoading(false); }
  }

  async function refreshData() {
    try {
      const allData = await fetchAllData();
      if (!allData.error) {
        setAthletesData(allData.athletes); setProgramData(allData.programs); setLibraryData(allData.library);
        localStorage.setItem('fp_program_data', JSON.stringify({ athletes: allData.athletes, programs: allData.programs, library: allData.library, cachedAt: new Date().toISOString() }));
      }
    } catch {}
  }

  const assignedPrograms = useMemo(() => {
    if (athleteRowIndex === null || !athletesData.length) return [];
    const headers = athletesData[0] || []; let assignColIndex = -1;
    for (let c = 0; c < headers.length; c++) { if (String(headers[c] || '').trim().toLowerCase() === 'program assignment') { assignColIndex = c; break; } }
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
      if (privacy === 'PUBLIC' && !map[name]) { map[name] = { name, exercises: new Set(), phases: new Set() }; }
      if (map[name]) { const ex = String(row[3] || '').trim(); if (ex) map[name].exercises.add(ex); map[name].phases.add(String(row[2] || 'Work Block').trim()); }
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
    const groups = []; let currentGroup = null;
    
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
        let advanced = null;
        try { if (row.length > 13 && row[13]) { advanced = JSON.parse(String(row[13])); } } catch(e) {}
        currentGroup = { id: 'ex_' + index, phase, name, details: [], baseLift: '', multiplier: 1.0, videoUrl: '', ytId: null, advanced };
      }
      for (let s = 0; s < numSets; s++) { currentGroup.details.push({ sets: '1', reps, intensity, tempo, rest }); }
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

  useEffect(() => {
    if (!athleteName || !workoutGroups.length || !libraryData.length) return;
    let cancelled = false;
    
    async function fetchAndCalcTargets() {
      const maxesResp = await getLatestMaxes(athleteName);
      const athleteMaxes = {};
      if (maxesResp.status === 'Success' && maxesResp.maxes) {
        Object.keys(maxesResp.maxes).forEach(key => { athleteMaxes[normalizeString(key)] = { oneRM: maxesResp.maxes[key] }; });
      }
      
      const lastWeights = {};
      try {
        const logbookResp = await fetchLogbookByAthlete(athleteName);
        if (!cancelled && logbookResp.status === 'Success' && logbookResp.data) {
           const logData = logbookResp.data; 
           const uniqueExercises = [...new Set(workoutGroups.map(g => g.name))];
           uniqueExercises.forEach(exName => {
             const normEx = normalizeString(exName);
             const found = logData.find(entry => normalizeString(entry.ex) === normEx);
             if (found) { 
               lastWeights[normEx] = { 
                 weight: found.wt || 0, 
                 repsString: String(found.reps || '') 
               }; 
             }
           });
        }
      } catch (e) {}
      
      if (cancelled) return;
      
      const calcs = {};
      workoutGroups.forEach(group => {
        group.details.forEach((set, idx) => {
          const inputKey = group.id + '_' + idx;
          calcs[inputKey] = calculateTargetLoad(libraryData, athleteMaxes, lastWeights, group.name, set.reps, set.intensity);
        });
      });
      setTargetCalcs(calcs);
    }
    
    fetchAndCalcTargets();
    return () => { cancelled = true; };
  }, [athleteName, workoutGroups, libraryData]);

  const phaseSections = useMemo(() => {
    const phaseMap = { 'warm up': 'Warm Up', 'warmup': 'Warm Up', 'work block': 'Work Block', 'workblock': 'Work Block', 'cool down': 'Cool Down', 'cooldown': 'Cool Down' };
    const sections = [
      { title: 'Warm Up', items: [], color: '#fd7e14' },
      { title: 'Work Block', items: [], color: '#22c55e' },
      { title: 'Other Content', items: [], color: '#888888' },
      { title: 'Cool Down', items: [], color: '#ef4444' },
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
    setSelectedProgram(progName); setInputValues({}); setSaveSuccess(false); setShowProgramMedia(false);
    const restTimes = [];
    programData.slice(1).forEach(row => { if (String(row[0] || '').trim() === progName) { const rest = String(row[8] || '').trim(); if (rest) restTimes.push(rest); } });
    if (restTimes.length > 0) {
      const counts = {}; let maxCount = 0; let mostCommon = '90s';
      restTimes.forEach(rt => { counts[rt] = (counts[rt] || 0) + 1; if (counts[rt] > maxCount) { maxCount = counts[rt]; mostCommon = rt; } });
      const secMatch = mostCommon.match(/(\d+)/);
      if (secMatch) { let secs = parseInt(secMatch[1], 10); if (mostCommon.toLowerCase().includes('m')) secs *= 60; setTimeLeft(secs); }
    } else { setTimeLeft(90); }
  }

  function toggleMedia(groupId) {
    setExpandedVideos(prev => { const next = new Set(prev); if (next.has(groupId)) { next.delete(groupId); } else { next.add(groupId); } return new Set(next); });
  }

  function handleInputChange(groupId, detailIdx, field, value) {
    const key = groupId + '_' + detailIdx; setInputValues(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handleSaveSession() {
    if (!workoutGroups.length) return;
    setSaving(true);
    const loggedProgStr = selectedProgram;
    const setsToLog = [];
    
    workoutGroups.forEach(group => {
      const metrics = group.advanced?.metrics || { weight: true };
      const targets = group.advanced?.targets || {};

      group.details.forEach((set, idx) => {
        const key = group.id + '_' + idx;
        const input = inputValues[key] || {};
        
        const targetData = targetCalcs[key] || { val: '', metric: '' };
        
        const wt = input.wt || (metrics.weight ? (parseFloat(targets.weight) || (targetData.metric === 'weight' ? targetData.val : '')) : '');
        const rp = input.reps || set.reps || '';
        const tm = input.time || targets.time || (targetData.metric === 'time' ? targetData.val : '');
        const dst = input.dist || targets.distance || (targetData.metric === 'distance' ? targetData.val : '');

        if (!wt && !rp && !tm && !dst) return;

        const wtNum = parseFloat(wt) || 0;
        
        let finalReps = [];
        if (rp) finalReps.push(`${rp}`);
        if (tm) finalReps.push(`${tm}`);
        if (dst) finalReps.push(`${dst}`);
        const repsString = finalReps.join(' | ');

        if (wtNum > 0 || finalReps.length > 0) {
          setsToLog.push({ exercise: group.name, weight: wtNum, reps: repsString, intensity: set.intensity || '' });
        }
      });
    });

    if (!setsToLog.length) { alert('Nothing to save.'); setSaving(false); return; }
    const payload = { athlete: athleteName, prog: loggedProgStr, sets: setsToLog };
    
    try {
      const res = await saveSession(payload);
      if (res.status === 'Success') { setSaveSuccess(true); setTimeout(() => navigate('/athlete-hub'), 2000); } else { alert('Save failed: ' + (res.message || 'Unknown error')); }
    } catch (err) { alert('Network error. Please try again.'); }
    setSaving(false);
  }

  const getInputClass = (targetData, inputType, overrideExists) => {
    let base = "pv-input pv-input-text";
    if (inputType === 'weight') base = "pv-input pv-input-kg";
    
    if (targetData.metric === inputType && targetData.source !== 'none' && !overrideExists) {
      return `${base} ${targetData.source === 'history' ? 'pv-input-history' : 'pv-input-calc'}`;
    }
    return base;
  };

  if (loading) { return ( <div className="pv-container"><div className="pv-body"><h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Today's Workout</h2><p className="pv-placeholder">Loading program data...</p></div><HelpButton pageName="Program View" position="bottom-right" /></div> ); }
  if (error) { return ( <div className="pv-container"><div className="pv-body"><h2 style={{ fontSize: '24px', color: '#008ed3', marginBottom: '16px', fontWeight: '700' }}>Today's Workout</h2><p className="pv-error">{error}</p></div><HelpButton pageName="Program View" position="bottom-right" /></div> ); }

  return (
    <div className="pv-container" style={{ paddingBottom: '100px' }}>
      <style>{`
        .pv-input-kg::-webkit-outer-spin-button,
        .pv-input-kg::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pv-input-kg { -moz-appearance: textfield; width: 65px !important; text-align: center; }
        .pv-input-text { width: 80px !important; text-align: center; }
        
        .pv-input-history::placeholder { color: #1e293b; opacity: 1; font-weight: 700; }
        .pv-input-calc::placeholder { color: #94a3b8; font-weight: 500; }

        .uni-dot {
          display: inline-flex; align-items: center; justify-content: center;
          background-color: #4f46e5; color: white; font-weight: 800; font-size: 10px;
          width: 20px; height: 20px; border-radius: 50%; margin-left: 8px; vertical-align: middle;
        }
        .superset-bracket {
          position: absolute; left: -4px; top: -8px; bottom: -8px; width: 8px;
          border-left: 3px solid #008ed3; border-top: 3px solid #008ed3; border-bottom: 3px solid #008ed3; border-radius: 4px 0 0 4px;
        }
        
        .pv-floating-fab {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1); padding: 8px 16px; border-radius: 99px;
          display: flex; align-items: center; gap: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25); z-index: 9999; transition: all 0.3s ease;
        }
        .pv-floating-fab.is-active { box-shadow: 0 8px 32px rgba(0, 142, 211, 0.2); border-color: rgba(0, 142, 211, 0.3); }
        .pv-fab-collapsed { padding: 10px 24px; color: #f8fafc; font-size: 15px; font-weight: 600; cursor: pointer; border: none; background: transparent; display: flex; align-items: center; gap: 10px; }
        .pv-fab-collapsed:hover { color: #38bdf8; }
        .pv-timer-clock { font-family: 'SF Pro Display', -apple-system, monospace; font-size: 22px; font-weight: 600; min-width: 65px; text-align: center; color: #f8fafc; letter-spacing: 0.5px; transition: color 0.3s ease; }
        .pv-timer-clock.is-active-text { color: #38bdf8; }
        .pv-timer-clock.urgent { color: #ef4444; animation: pulse 1s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .pv-timer-btn { background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 50%; transition: all 0.2s; }
        .pv-timer-btn:hover { color: #ffffff; background-color: rgba(255, 255, 255, 0.1); }
        .pv-timer-play { background-color: #008ed3; color: white; padding: 10px; box-shadow: 0 4px 12px rgba(0, 142, 211, 0.3); }
        .pv-timer-play:hover { background-color: #0077b5; transform: scale(1.05); }
        .pv-timer-play.is-playing { background-color: #ef4444; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }
        .pv-timer-play.is-playing:hover { background-color: #dc2626; }
        .pv-timer-divider { width: 1px; height: 24px; background-color: rgba(255, 255, 255, 0.15); margin: 0 2px; }
      `}</style>

      {/* FAB TIMER */}
      <div className={`pv-floating-fab ${timerActive ? 'is-active' : ''}`}>
        {timerExpanded ? (
          <>
            <button className="pv-timer-btn" onClick={() => { setTimerExpanded(false); setTimerActive(false); }} title="Close Timer"><X size={18} /></button>
            <div className="pv-timer-divider"></div>
            <button className="pv-timer-btn" onClick={() => adjustTimer(-15)} title="-15s"><Minus size={16} /></button>
            
            {isEditingTimer ? (
              <form onSubmit={handleTimerSubmit} style={{ margin: 0, padding: 0, display: 'flex' }}>
                <input 
                  autoFocus
                  type="text" 
                  value={timerInputValue} 
                  onChange={e => setTimerInputValue(e.target.value)} 
                  onBlur={handleTimerSubmit}
                  style={{ width: '65px', background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '22px', fontWeight: '600', textAlign: 'center', outline: 'none', fontFamily: '"SF Pro Display", monospace' }} 
                />
              </form>
            ) : (
              <div 
                className={`pv-timer-clock ${timerActive ? 'is-active-text' : ''} ${timeLeft <= 10 && timeLeft > 0 && timerActive ? 'urgent' : ''}`} 
                onClick={handleTimerClick} 
                style={{ cursor: 'pointer' }}
                title="Click to edit time"
              >
                {formatTimeStr(timeLeft)}
              </div>
            )}

            <button className="pv-timer-btn" onClick={() => adjustTimer(15)} title="+15s"><Plus size={16} /></button>
            <div className="pv-timer-divider"></div>
            <button className={`pv-timer-btn pv-timer-play ${timerActive ? 'is-playing' : ''}`} onClick={() => setTimerActive(!timerActive)}>{timerActive ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}</button>
          </>
        ) : ( <button className="pv-fab-collapsed" onClick={() => setTimerExpanded(true)}><Timer size={20} color="#38bdf8" /> <span>Rest Timer</span></button> )}
      </div>

      <div className="pv-body">
        
        {/* NEW HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: '12px' }}>
            <ArrowLeft size={28} />
          </button>
          <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Today's Workout
          </h2>
        </div>

        {athleteName && <p style={{ color: '#666', fontSize: '15px', marginBottom: '20px', marginTop: '-8px' }}>Welcome, {athleteName}</p>}

        <div className="pv-search-box">
          <input type="text" placeholder="Search programs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <div className="pv-panels">
          <div className="pv-panel">
            <div className="pv-panel-header">
              <h3 className="pv-panel-title" style={{ color: '#008ed3' }}><UserPlus size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} /> My Programs</h3>
              <span className="pv-count-badge">{assignedPrograms.length}</span>
            </div>
            {assignedPrograms.length === 0 ? ( <p className="pv-panel-empty">No programs assigned yet.</p> ) : (
              <div className="pv-program-buttons">
                {assignedPrograms.filter(prog => prog.toLowerCase().includes(searchQuery.toLowerCase())).map(prog => (
                  <button key={prog} className={`pv-program-btn ${selectedProgram === prog ? 'active' : ''}`} onClick={() => handleProgramChange(prog)}><Play size={16} /> {prog}</button>
                ))}
              </div>
            )}
          </div>

          <div className="pv-panel">
            <div className="pv-panel-header">
              <h3 className="pv-panel-title" style={{ color: '#2e7d32' }}><Globe size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Public Programs</h3>
              <span className="pv-count-badge">{publicPrograms.length}</span>
            </div>
            {publicPrograms.length === 0 ? ( <p className="pv-panel-empty">No public programs available.</p> ) : (
              <div className="pv-program-buttons">
                {publicPrograms.filter(prog => prog.name.toLowerCase().includes(searchQuery.toLowerCase())).map(prog => (
                  <button key={prog.name} className={`pv-program-btn ${selectedProgram === prog.name ? 'active' : ''}`} onClick={() => handleProgramChange(prog.name)}><Play size={16} /> {prog.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {(coachNote || programMediaUrl) && (
          <div className="pv-coach-note" style={{ marginBottom: '20px' }}>
            <div className="pv-coach-note-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4><MessageSquare size={14} /> Coach's Notes</h4>
                        {programMediaUrl && showProgramMedia && (
              <div className="pv-media-player-wrap">
                {getYouTubeId(programMediaUrl) ? (
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px' }}>
                    <iframe src={'https://www.youtube.com/embed/' + getYouTubeId(programMediaUrl) + '?autoplay=1&rel=0'} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} allowFullScreen title="Coach Program Media" />
                  </div>
                ) : (programMediaUrl.toLowerCase().includes('.png') || programMediaUrl.toLowerCase().includes('.jpg')) ? (
                  <img src={programMediaUrl} alt="Program Media" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px' }} />
                ) : getMediaType(programMediaUrl) === 'audio' ? (
                  <audio src={programMediaUrl} controls preload="metadata" className="pv-media-audio" />
                ) : ( 
                  <video controls playsInline preload="metadata" controlsList="nodownload" style={{ width: '100%', borderRadius: '8px' }}>
                    <source src={programMediaUrl} type="video/mp4" />
                  </video> 
                )}
              </div>
            )}


        {workoutGroups.length === 0 && selectedProgram && ( <p className="pv-placeholder">No exercises found for this program.</p> )}
        {!selectedProgram && ( <p className="pv-placeholder">Select a program from above to view your workout.</p> )}

       {phaseSections.map(section => (
          <div key={section.title} className="pv-phase-card" style={{ borderTopColor: section.color }}>
            <div className="pv-phase-header" style={{ backgroundColor: section.color, color: '#fff' }}>{section.title}</div>
            <div className="pv-phase-body" style={{ "--phase-color": section.color }}>
              {section.items.map(group => {
                const hasMedia = group.videoUrl || group.ytId;
                const isImage = group.videoUrl && (group.videoUrl.toLowerCase().includes('.png') || group.videoUrl.toLowerCase().includes('.jpg'));
                const isSuperset = group.advanced?.setType === 'superset';
                const isDrop = group.advanced?.setType === 'drop';
                const exec = group.advanced?.execution;
                const metrics = group.advanced?.metrics || { weight: true };
                const targets = group.advanced?.targets || {};

                return (
                  <div key={group.id} style={{ position: 'relative' }}>
                    {isSuperset && <div className="superset-bracket"></div>}

                    <div className="pv-exercise-header">
                      <h4 className="pv-exercise-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSuperset && <span title="Superset">🔗</span>}
                        {group.name}
                        {isDrop && ( <img src="/drop-set-icon.png" alt="Drop Set 📉" style={{ width: '20px', height: '20px' }} onError={(e) => { e.target.style.display='none'; e.target.insertAdjacentText('afterend', '📉'); }} /> )}
                        
                        {exec === 'uni-both' && <span className="uni-dot" title="Unilateral">U</span>}
                        {exec === 'uni-left' && <span className="uni-dot" title="Left Only">L</span>}
                        {exec === 'uni-right' && <span className="uni-dot" title="Right Only">R</span>}
                      </h4>
                      {hasMedia && ( <button className="pv-video-toggle" style={{ color: section.color, borderColor: section.color, background: `${section.color}0D` }} onClick={() => toggleMedia(group.id)}>{isImage ? <ImageIcon size={12} /> : <Video size={12} />} Media</button> )}
                    </div>
                    
                                       {hasMedia && expandedVideos.has(group.id) && (
                      <div className="pv-video-container" style={{ padding: isImage ? '10px' : '0' }}>
                        {group.ytId ? ( 
                          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '4px' }}>
                            <iframe src={`https://www.youtube.com/embed/${group.ytId}?autoplay=1&rel=0`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} allowFullScreen title={group.name} />
                          </div>
                        ) : isImage ? ( <img src={group.videoUrl} alt={group.name} style={{ width: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: '4px' }} />
                        ) : ( 
                          <video key={group.videoUrl} autoPlay controls playsInline preload="metadata" controlsList="nodownload" style={{ width: '100%', borderRadius: '4px' }}>
                            <source src={group.videoUrl} type="video/mp4" />
                          </video> 
                        )}
                      </div>
                    )}
                    
                    {group.details.map((set, idx) => {
                      const inputKey = group.id + '_' + idx;
                      const input = inputValues[inputKey] || {};
                      
                      const targetData = targetCalcs[inputKey] || { text: '', val: '', source: 'none', metric: '' };
                      
                      let customTargetDisplay = '';
                      if (targets.weight) customTargetDisplay += `🏋️ ${targets.weight} `;
                      if (targets.time) customTargetDisplay += `⏱️ ${targets.time} `;
                      if (targets.distance) customTargetDisplay += `📏 ${targets.distance} `;

                      let calcDisplay = '';
                      if (targetData.text && !targets[targetData.metric]) {
                        if (targetData.metric === 'weight') calcDisplay = `🏋️ ${targetData.text}`;
                        if (targetData.metric === 'time') calcDisplay = `⏱️ ${targetData.text}`;
                        if (targetData.metric === 'distance') calcDisplay = `📏 ${targetData.text}`;
                      }

                      const finalTargetDisplay = (customTargetDisplay + calcDisplay).trim();

                      return (
                        <div key={idx} className="pv-set-row">
                          <div className="pv-set-info">
                            <div className="pv-set-label">
                              <strong>Set {idx + 1}:</strong> {set.reps} reps {set.intensity ? '@ ' + set.intensity + '%' : ''}
                            </div>
                            {(set.tempo || set.rest) && (
                              <div className="pv-set-meta">
                                {set.tempo && <>Tempo: <span style={{ color: '#555' }}>{set.tempo}</span>{set.rest ? ' | ' : ''}</>}
                                {set.rest && <>Rest: <span style={{ color: '#555' }}>{set.rest}</span></>}
                              </div>
                            )}
                            
                            {finalTargetDisplay && (
                              <div className="pv-target">
                                Target: <span className="pv-target-value" style={{ color: section.color }}>
                                  {finalTargetDisplay}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <div className="pv-inputs" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            
                            <div className="pv-input-group">
                              <span className="pv-input-label">reps</span>
                              <input type="text" className="pv-input pv-input-text" placeholder={set.reps || '--'} value={input.reps || ''} onChange={e => handleInputChange(group.id, idx, 'reps', e.target.value)} />
                            </div>

                            {metrics.distance && (
                              <div className="pv-input-group">
                                <span className="pv-input-label">dist</span>
                                <input type="text" className={getInputClass(targetData, 'distance', targets.distance)} placeholder={targets.distance || (targetData.metric === 'distance' ? targetData.val : '--')} value={input.dist || ''} onChange={e => handleInputChange(group.id, idx, 'dist', e.target.value)} />
                              </div>
                            )}

                            {metrics.time && (
                              <div className="pv-input-group">
                                <span className="pv-input-label">time</span>
                                <input type="text" className={getInputClass(targetData, 'time', targets.time)} placeholder={targets.time || (targetData.metric === 'time' ? targetData.val : '--')} value={input.time || ''} onChange={e => handleInputChange(group.id, idx, 'time', e.target.value)} />
                              </div>
                            )}

                            {metrics.weight && (
                              <div className="pv-input-group">
                                <span className="pv-input-label">kg</span>
                                <input type="number" className={getInputClass(targetData, 'weight', targets.weight)} placeholder={parseFloat(targets.weight) || (targetData.metric === 'weight' ? targetData.val : '--')} value={input.wt || ''} onChange={e => handleInputChange(group.id, idx, 'wt', e.target.value)} />
                              </div>
                            )}

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

