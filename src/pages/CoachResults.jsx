import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchAthletes, fetchLogbookByAthlete, fetchAllData, fetchWellnessLogs, fetchMedicalLogs, saveMedicalLog } from '../api';
import { ArrowLeft, Search, AlertCircle, Heart, Moon, Utensils, HandMetal, Smile, BarChart2, LayoutGrid, Dumbbell, Activity, ShieldAlert, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ==========================================
// PERFORMANCE TRACKING CONSTANTS
// ==========================================
const COLORS = {
  primaryBlue: '#008ed3', darkText: '#333', bodyGray: '#666', lightBg: '#f5f5f5', cardBg: '#f8fafc',
  border: '#e2e8f0', white: '#ffffff', green: '#16a34a', red: '#dc2626', amber: '#d97706',
  zone1: '#bae0ef', zone2: '#7cc0e3', zone3: '#3da0d7', zone4: '#008ed3', zone5: '#005d8a', 
};

const CACHE_KEY = 'fp_coach_results_v2';

const CORE_LIFTS = {
  backSquat: 'Back Squat With Barbell - (CORE)', deadlift: 'Deadlift With Barbell.v (CORE)', benchPress: 'Bench Press With Barbell - (CORE)',
  shoulderPress: 'Shoulder Press Seated With Barbell - (CORE)', barbellRow: 'Barbell Row On Bench - Back.v (CORE)', latPulldown: 'Lat Pulldown On Machine - Back (CORE)',
};
const CORE_KEYS = ['backSquat', 'deadlift', 'benchPress', 'shoulderPress', 'barbellRow', 'latPulldown'];

const MULTIPLIER_EXERCISES = {
  'Front Squat': 'backSquat', 'Overhead Squat': 'backSquat', 'Trap Bar Deadlift': 'deadlift', 'Romanian Deadlift': 'deadlift',
  'Incline Bench Press': 'benchPress', 'Push Press': 'shoulderPress', 'Arnold Press': 'shoulderPress', 'Bent-Over Row': 'barbellRow',
  'Pull-Up': 'latPulldown', 'Chin-Up': 'latPulldown',
};

const MULTIPLIERS = {
  'Front Squat': 0.85, 'Overhead Squat': 0.80, 'Trap Bar Deadlift': 1.05, 'Romanian Deadlift': 0.90, 'Incline Bench Press': 0.85,
  'Push Press': 0.85, 'Arnold Press': 0.80, 'Bent-Over Row': 0.95, 'Pull-Up': 0.75, 'Chin-Up': 0.75,
};

function getIntensityZone(pct) {
  const num = parseFloat(pct);
  if (isNaN(num)) return null;
  if (num < 70) return 0; if (num < 80) return 1; if (num < 85) return 2; if (num < 90) return 3; return 4;
}

const ZONE_LABELS = ['<70%', '70-80%', '80-85%', '85-90%', '90%+'];
const ZONE_COLORS = [COLORS.zone1, COLORS.zone2, COLORS.zone3, COLORS.zone4, COLORS.zone5];

function normalizeExerciseName(exercise) {
  if (!exercise) return ''; return exercise.toLowerCase().replace(/[.-]/g, '').replace(/\s+/g, ' ').trim();
}

function findCoreMatch(exercise) {
  if (!exercise) return null;
  const normalized = normalizeExerciseName(exercise);
  for (const [key, fullName] of Object.entries(CORE_LIFTS)) {
    const coreNormalized = normalizeExerciseName(fullName);
    if (normalized.includes(coreNormalized.split(' ')[0])) return key;
  }
  return null;
}

function calcSetVolume(entry, maxesByAthlete = {}) {
  const sets = parseInt(entry.sets) || 0;
  const reps = parseInt(entry.reps) || 0;
  const pct = parseFloat(entry.percentIntensity || entry.intensity || 0) / 100;
  let weightPerRep = parseFloat(entry.weight) || 0;
  
  if (!weightPerRep && pct) {
    const exercise = entry.exercise || '';
    const athleteName = entry.name || '';
    const coreKey = findCoreMatch(exercise);
    let oneRM = 0;
    if (coreKey && maxesByAthlete[athleteName]?.[coreKey]) {
      oneRM = maxesByAthlete[athleteName][coreKey];
    } else if (MULTIPLIER_EXERCISES[exercise]) {
      const coreKey = MULTIPLIER_EXERCISES[exercise];
      const baseMax = maxesByAthlete[athleteName]?.[coreKey] || 0;
      oneRM = baseMax * (MULTIPLIERS[exercise] || 0.9);
    }
    if (oneRM) weightPerRep = pct * oneRM;
  }
  if (!sets || !reps || !weightPerRep) return 0;
  return sets * reps * weightPerRep;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toISOString().split('T')[0];
}

function fmt(n) { return Math.round(n).toLocaleString(); }

export default function CoachResults() {
  const { userEmail: coachEmail, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [mainTab, setMainTab] = useState('performance'); 

  // PERFORMANCE STATE
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [maxes, setMaxes] = useState([]);
  const [logbook, setLogbook] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLogbook, setShowLogbook] = useState(false);

  // WELLNESS & MEDICAL STATE
  const [wellnessRoster, setWellnessRoster] = useState([]);
  const [teamWellnessHistory, setTeamWellnessHistory] = useState([]);
  const [wellnessLoading, setWellnessLoading] = useState(true);
  const [wellnessViewMode, setWellnessViewMode] = useState('grid');
  const [wellnessSearch, setWellnessSearch] = useState('');
  const [activeWellnessMetric, setActiveWellnessMetric] = useState('grip');
  const [selectedChartUser, setSelectedChartUser] = useState('team');
  
  // MEDICAL MODAL STATE
  const [medicalModalOpen, setMedicalModalOpen] = useState(false);
  const [selectedMedicalAthlete, setSelectedMedicalAthlete] = useState(null);
  const [medFormStatus, setMedFormStatus] = useState('');
  const [medFormNotes, setMedFormNotes] = useState('');
  const [medSaving, setMedSaving] = useState(false);

  useEffect(() => {
    if (!coachEmail) return;
    loadData();
  }, [coachEmail]);

  async function loadData() {
    setError(null);
    try {
      const athRes = await fetchAthletes();
      const rawAthletes = athRes.athletes || [];
      let athleteList = [];
      if (rawAthletes.length > 1) {
        const headers = rawAthletes[0].map(h => String(h).trim());
        const roleColIdx = headers.findIndex(h => h.toLowerCase() === 'role');
        athleteList = rawAthletes.slice(1).map(row => {
          const obj = {}; headers.forEach((h, i) => { obj[h] = row[i]; });
          obj.name = String(row[0] || '').trim();
          const roleData = roleColIdx > -1 ? String(row[roleColIdx] || '').trim().toLowerCase() : 'athlete';
          obj.isCoach = roleData === 'coach';
          return obj;
        }).filter(a => a.name && !a.isCoach);
      }

      const maxesByName = {};
      athleteList.forEach(a => {
        maxesByName[a.name] = {
          backSquat: parseFloat(a['Back Squat With Barbell - (CORE)']) || 0, deadlift: parseFloat(a['Deadlift With Barbell.v (CORE)']) || 0,
          benchPress: parseFloat(a['Bench Press With Barbell - (CORE)']) || 0, shoulderPress: parseFloat(a['Shoulder Press Seated With Barbell - (CORE)']) || 0,
          barbellRow: parseFloat(a['Barbell Row On Bench - Back.v (CORE)']) || 0, latPulldown: parseFloat(a['Lat Pulldown On Machine - Back (CORE)']) || 0,
        };
      });

      const results = await Promise.all( athleteList.map((a) => fetchLogbookByAthlete(a.name).then((res) => (res.data || []).map((e) => ({ ...e, name: a.name, maxes: maxesByName[a.name] }))).catch(() => [])) );
      setAthletes(athleteList); setMaxes(athleteList); setLogbook(results.flat()); setLoading(false);
    } catch (err) { setLoading(false); }
  }

  useEffect(() => {
    if (selectedAthlete !== 'all') {
      fetchLogbookByAthlete(selectedAthlete).then(res => {
        setLogbook((res.data || []).map((e) => ({ ...e, name: selectedAthlete })));
      });
    }
  }, [selectedAthlete]);

  // COMBINED WELLNESS & MEDICAL FETCH
  useEffect(() => {
    loadWellnessAndMedical();
  }, []);

  async function loadWellnessAndMedical() {
    setWellnessLoading(true);
    try {
      const [data, wellnessData, medicalData] = await Promise.all([ fetchAllData(), fetchWellnessLogs(), fetchMedicalLogs() ]);
      
      const rawAthletes = data.athletes || [];
      const logs = wellnessData.data || [];
      const medLogs = medicalData.data || [];
      
      // Parse Medical
      const medByAthlete = {};
      if (medLogs.length > 1) {
        medLogs.slice(1).forEach(m => {
          const athName = String(m[2]).trim();
          if(!medByAthlete[athName]) medByAthlete[athName] = [];
          medByAthlete[athName].push({
            dateStr: new Date(m[0]).toLocaleDateString(),
            rawDate: new Date(m[0]),
            bodyPart: m[3], pain: m[4], mechanism: m[5], status: m[6], notes: m[7], isResolved: m[8] === 'Yes'
          });
        });
      }

      // Parse Wellness
      const parsedLogs = logs.length > 1 ? logs.slice(1).map(r => ({
        date: new Date(r[0]).toLocaleDateString('en-US', {weekday: 'short'}),
        rawDate: new Date(r[0]), athlete: String(r[2]).trim(),
        grip: Number(r[3]) || 0, feeling: Number(r[4]) || 0, soreness: Number(r[5]) || 0, sleep: Number(r[6]) || 0, nutrition: Number(r[7]) || 0
      })) : [];

      const logsByAthlete = {};
      parsedLogs.forEach(l => { if (!logsByAthlete[l.athlete]) logsByAthlete[l.athlete] = []; logsByAthlete[l.athlete].push(l); });
      Object.values(logsByAthlete).forEach(arr => arr.sort((a,b) => a.rawDate - b.rawDate));

      const roster = [];
      for (let i = 1; i < rawAthletes.length; i++) {
        const row = rawAthletes[i];
        const name = String(row[0] || '').trim();
        const pods = String(row[11] || '').toLowerCase();
        
        if (name && pods.includes('wellness')) {
          const athLogs = logsByAthlete[name] || [];
          const latest = athLogs.length > 0 ? athLogs[athLogs.length - 1] : { grip: 0, feeling: 0, soreness: 0, sleep: 0, nutrition: 0 };
          let isFatigued = false;
          if (latest.feeling > 0 && (latest.feeling <= 4 || latest.soreness <= 4 || latest.sleep <= 5.5)) isFatigued = true;

          // Check Medical Status
          let medicalStatus = 'Fully Fit';
          let activeInjury = null;
          const athMed = medByAthlete[name] || [];
          athMed.sort((a,b) => b.rawDate - a.rawDate); // newest first
          
          if (athMed.length > 0 && !athMed[0].isResolved) {
            medicalStatus = athMed[0].status;
            activeInjury = athMed[0];
          }

          roster.push({
            id: i, name: name, grip: latest.grip, feeling: latest.feeling, soreness: latest.soreness, sleep: latest.sleep, nutrition: latest.nutrition,
            status: isFatigued ? 'fatigued' : 'normal',
            medicalStatus, activeInjury, medicalHistory: athMed,
            history: athLogs.slice(-7)
          });
        }
      }
      
      const sortedRoster = roster.sort((a, b) => a.name.localeCompare(b.name));
      setWellnessRoster(sortedRoster);
      if (sortedRoster.length > 0) setMainTab('wellness');

      const teamHistoryMap = {};
      parsedLogs.forEach(l => {
        const d = l.rawDate.toLocaleDateString();
        if(!teamHistoryMap[d]) teamHistoryMap[d] = { rawDate: l.rawDate, date: l.date, count: 0, grip: 0, feeling: 0, soreness: 0, sleep: 0, nutrition: 0 };
        teamHistoryMap[d].grip += l.grip; teamHistoryMap[d].feeling += l.feeling; teamHistoryMap[d].soreness += l.soreness; teamHistoryMap[d].sleep += l.sleep; teamHistoryMap[d].nutrition += l.nutrition; teamHistoryMap[d].count += 1;
      });
      const teamHistory = Object.values(teamHistoryMap).map(day => ({
        date: day.date, rawDate: day.rawDate, grip: day.grip / day.count, feeling: day.feeling / day.count, soreness: day.soreness / day.count, sleep: day.sleep / day.count, nutrition: day.nutrition / day.count,
      })).sort((a,b) => a.rawDate - b.rawDate).slice(-7);
      
      setTeamWellnessHistory(teamHistory);
    } catch (err) {}
    setWellnessLoading(false);
  }

  // --- PERFORMANCE MEMOS ---
  const filteredLogbook = useMemo(() => {
    let entries = logbook;
    if (selectedAthlete !== 'all') entries = entries.filter((e) => e.name === selectedAthlete);
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start ? new Date(dateRange.start) : null;
      const end = dateRange.end ? new Date(dateRange.end) : null;
      entries = entries.filter((e) => { const d = new Date(e.date); if (start && d < start) return false; if (end && d > end) return false; return true; });
    }
    return entries;
  }, [logbook, selectedAthlete, dateRange]);

  const filteredMaxes = useMemo(() => {
    if (selectedAthlete === 'all') return maxes;
    return maxes.filter((m) => m.name === selectedAthlete);
  }, [maxes, selectedAthlete]);

  const maxesByAthlete = useMemo(() => {
    const map = {};
    filteredMaxes.forEach(a => {
      map[a.name] = {
        backSquat: parseFloat(a['Back Squat With Barbell - (CORE)']) || 0, deadlift: parseFloat(a['Deadlift With Barbell.v (CORE)']) || 0, benchPress: parseFloat(a['Bench Press With Barbell - (CORE)']) || 0,
        shoulderPress: parseFloat(a['Shoulder Press Seated With Barbell - (CORE)']) || 0, barbellRow: parseFloat(a['Barbell Row On Bench - Back.v (CORE)']) || 0, latPulldown: parseFloat(a['Lat Pulldown On Machine - Back (CORE)']) || 0,
      };
    });
    return map;
  }, [filteredMaxes]);

  const summary = useMemo(() => {
    const entries = filteredLogbook;
    if (!entries.length) return { totalVolume: 0, sessions: 0, volAt85: 0, avgPerWeek: 0, weeksCovered: 0, zoneVolumes: [0,0,0,0,0] };
    const sessionDays = new Set(entries.map((e) => e.date));
    const zoneVolumes = [0, 0, 0, 0, 0];
    let totalVolume = 0;
    entries.forEach((e) => {
      const vol = calcSetVolume(e, maxesByAthlete); totalVolume += vol;
      const zone = getIntensityZone(e.percentIntensity || e.intensity); if (zone !== null) zoneVolumes[zone] += vol;
    });
    const volAt85Plus = zoneVolumes[3] + zoneVolumes[4];
    const pctAt85Plus = totalVolume > 0 ? (volAt85Plus / totalVolume) * 100 : 0;
    const weekKeys = new Set(entries.map((e) => getWeekKey(e.date)));
    const weeksCovered = weekKeys.size || 1;
    const avgPerWeek = sessionDays.size / weeksCovered;
    return { totalVolume, sessions: sessionDays.size, volAt85Plus, pctAt85Plus, avgPerWeek, weeksCovered, zoneVolumes };
  }, [filteredLogbook, maxesByAthlete]);

  const weeklyFrequency = useMemo(() => {
    const weekMap = {};
    filteredLogbook.forEach((e) => {
      const wk = getWeekKey(e.date);
      if (!weekMap[wk]) weekMap[wk] = { week: wk, sessions: new Set(), volume: 0 };
      weekMap[wk].sessions.add(e.date); weekMap[wk].volume += calcSetVolume(e, maxesByAthlete);
    });
    return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ ...w, sessionCount: w.sessions.size }));
  }, [filteredLogbook, maxesByAthlete]);

  const progressionData = useMemo(() => {
    const weekMap = {};
    filteredLogbook.forEach((e) => {
      const wk = getWeekKey(e.date);
      if (!wk) return;
      if (!weekMap[wk]) weekMap[wk] = { week: wk };
      const coreKey = findCoreMatch(e.exercise);
      if (coreKey) {
        const sets = parseInt(e.sets) || 0; const reps = parseInt(e.reps) || 0; const pct = parseFloat(e.percentIntensity || e.intensity || 0) / 100;
        if (sets && reps && pct) {
          const weightPerRep = parseFloat(e.weight) || (pct * (maxesByAthlete[e.name]?.[coreKey] || 0));
          if (weightPerRep) {
            const est1RM = weightPerRep / (1 + 0.0333 * reps);
            if (est1RM > (weekMap[wk][coreKey] || 0)) weekMap[wk][coreKey] = est1RM;
          }
        }
      }
    });
    return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  }, [filteredLogbook, maxesByAthlete]);

  const comparisonMatrix = useMemo(() => {
    if (selectedAthlete !== 'all') return [];
    return athletes.map((a) => {
      const entries = filteredLogbook.filter((e) => e.name === a.name);
      const sessionDays = new Set(entries.map((e) => e.date));
      const weekKeys = new Set(entries.map((e) => getWeekKey(e.date)));
      let totalVol = 0; let vol85 = 0;
      entries.forEach((e) => {
        const vol = calcSetVolume(e, maxesByAthlete); totalVol += vol;
        const pct = parseFloat(e.percentIntensity || e.intensity || 0); if (pct >= 85) vol85 += vol;
      });
      return { name: a.name, sessions: sessionDays.size, avgPerWeek: sessionDays.size / (weekKeys.size || 1), totalVol, pctAt85: totalVol > 0 ? (vol85 / totalVol) * 100 : 0 };
    }).filter((a) => a.sessions > 0);
  }, [athletes, filteredLogbook, selectedAthlete, maxesByAthlete]);

  function exportCSV() {
    const headers = ['Athlete', 'Date', 'Exercise', 'Sets', 'Reps', '% Intensity', 'Tempo', 'Rest', 'Weight(kg)', 'Set Volume(kg)'];
    const rows = filteredLogbook.map((e) => [ e.name || '', e.date || '', e.exercise || '', e.sets || '', e.reps || '', e.percentIntensity || e.intensity || '', e.tempo || '', e.rest || '', e.weight || '', Math.round(calcSetVolume(e, maxesByAthlete)) ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `factorprep_coach_results_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // --- WELLNESS LOGIC ---
  const getColorClass = (val, type) => {
    if (val === 0) return 'status-amber'; 
    if (type === 'grip') { if (val >= 45) return 'status-green'; if (val <= 40) return 'status-red'; return 'status-amber'; }
    if (type === 'sleep') { if (val >= 7.5) return 'status-green'; if (val <= 5.5) return 'status-red'; return 'status-amber'; }
    if (val >= 8) return 'status-green'; if (val <= 4) return 'status-red'; return 'status-amber';
  };

  const filteredWellnessRoster = wellnessRoster.filter(p => p.name.toLowerCase().includes(wellnessSearch.toLowerCase()));

  const getChartData = () => {
    if (selectedChartUser === 'team') return teamWellnessHistory;
    const athlete = wellnessRoster.find(a => a.id.toString() === selectedChartUser);
    return athlete ? athlete.history : [];
  };

  const wellnessChartData = getChartData();
  const avgGrip = wellnessChartData.length ? (wellnessChartData.reduce((acc, curr) => acc + curr.grip, 0) / wellnessChartData.length).toFixed(1) : 0;
  const avgFeeling = wellnessChartData.length ? (wellnessChartData.reduce((acc, curr) => acc + curr.feeling, 0) / wellnessChartData.length).toFixed(1) : 0;
  const avgSoreness = wellnessChartData.length ? (wellnessChartData.reduce((acc, curr) => acc + curr.soreness, 0) / wellnessChartData.length).toFixed(1) : 0;
  const avgSleep = wellnessChartData.length ? (wellnessChartData.reduce((acc, curr) => acc + curr.sleep, 0) / wellnessChartData.length).toFixed(1) : 0;
  const avgNutrition = wellnessChartData.length ? (wellnessChartData.reduce((acc, curr) => acc + curr.nutrition, 0) / wellnessChartData.length).toFixed(1) : 0;

  // --- MEDICAL HANDLERS ---
  const openMedicalModal = (athlete) => {
    setSelectedMedicalAthlete(athlete);
    setMedFormStatus(athlete.activeInjury ? athlete.activeInjury.status : 'Fully Fit (Cleared)');
    setMedFormNotes('');
    setMedicalModalOpen(true);
  };

  const handleSaveMedical = async () => {
    setMedSaving(true);
    const bodyPart = selectedMedicalAthlete.activeInjury ? selectedMedicalAthlete.activeInjury.bodyPart : 'General Update';
    const isResolved = medFormStatus === 'Fully Fit (Cleared)' ? 'Yes' : 'No';
    
    const payload = {
      email: coachEmail, athlete: selectedMedicalAthlete.name, bodyPart: bodyPart, pain: 0,
      mechanism: 'Coach/Physio Update', trainingStatus: medFormStatus, notes: medFormNotes, isResolved: isResolved
    };

    try {
      await saveMedicalLog(payload);
      setMedicalModalOpen(false);
      loadWellnessAndMedical(); // refresh
    } catch(e) {}
    setMedSaving(false);
  };

  if (authLoading) return <div style={{ ...styles.page, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><p style={{ color: COLORS.bodyGray }}>Loading...</p></div>;
  if (!coachEmail) return <div style={{ ...styles.page, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><p style={{ color: COLORS.bodyGray }}>Please log in.</p></div>;

  const maxFreq = Math.max(...weeklyFrequency.map((w) => w.sessionCount), 1);

  return (
    <div style={{ ...styles.page, fontFamily: '"Roboto Flex", "Roboto", sans-serif' }}>
      <style>{`
        .cr-toggle-bg { display: flex; background: #e2e8f0; padding: 4px; border-radius: 8px; margin-bottom: 24px; display: inline-flex; }
        .cr-toggle-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; background: transparent; border-radius: 6px; font-weight: 600; font-size: 14px; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .cr-toggle-btn.active { background: #fff; color: #008ed3; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .cr-search-box { display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; width: 300px; margin-bottom: 24px; }
        .cr-search-box input { border: none; outline: none; margin-left: 8px; width: 100%; font-size: 14px; }
        .cr-grid-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow-x: auto; margin-bottom: 24px; }
        .cr-table { width: 100%; border-collapse: collapse; text-align: center; }
        .cr-table th { padding: 16px; background: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0; }
        .cr-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 15px; }
        .cr-athlete-name { display: flex; align-items: center; gap: 12px; text-align: left; font-weight: 700; color: #0f172a; font-size: 15px; cursor: pointer; }
        .cr-avatar { width: 32px; height: 32px; border-radius: 50%; background: #008ed3; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; text-transform: uppercase; }
        .status-badge { display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; border-radius: 6px; font-weight: 700; width: 100%; }
        .status-green { background-color: #d1fae5; color: #059669; }
        .status-amber { background-color: #fef3c7; color: #d97706; }
        .status-red { background-color: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
        .cr-alert-row { background-color: #fff1f2 !important; }
        .cr-metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }
        @media (max-width: 768px) { .cr-metrics { grid-template-columns: repeat(2, 1fr); } }
        .cr-metric-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s ease; text-align: left; }
        .cr-metric-card:hover { border-color: #cbd5e1; }
        .cr-metric-card.active-grip { background: #eff6ff; border-color: #bfdbfe; box-shadow: 0 0 0 2px #3b82f6; }
        .cr-metric-card.active-feeling { background: #e0f2fe; border-color: #bae6fd; box-shadow: 0 0 0 2px #0ea5e9; }
        .cr-metric-card.active-soreness { background: #fef2f2; border-color: #fecaca; box-shadow: 0 0 0 2px #ef4444; }
        .cr-metric-card.active-sleep { background: #eef2ff; border-color: #e0e7ff; box-shadow: 0 0 0 2px #6366f1; }
        .cr-metric-card.active-nutrition { background: #ecfdf5; border-color: #d1fae5; box-shadow: 0 0 0 2px #10b981; }
        .cr-metric-label { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
        .cr-metric-value { font-size: 24px; font-weight: 900; color: #0f172a; }
        .cr-metric-unit { font-size: 14px; font-weight: 500; color: #94a3b8; margin-left: 4px; }
        .cr-chart-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .cr-select { padding: 8px 16px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 14px; font-weight: 600; cursor: pointer; outline: none; }
        
        /* Modal */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 16px; }
        .modal-content { background: white; border-radius: 16px; width: 100%; max-width: 500px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
      `}</style>

      <div style={styles.titleWrapper}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: '12px' }}>
            <ArrowLeft size={28} />
          </button>
          <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0 }}>Coach Results</h2>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button onClick={() => setMainTab('wellness')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', cursor: 'pointer', backgroundColor: mainTab === 'wellness' ? '#0ea5e9' : '#e2e8f0', color: mainTab === 'wellness' ? 'white' : '#64748b' }}>
            <Activity size={18} /> Wellness Center
          </button>
          <button onClick={() => setMainTab('performance')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', cursor: 'pointer', backgroundColor: mainTab === 'performance' ? '#008ed3' : '#e2e8f0', color: mainTab === 'performance' ? 'white' : '#64748b' }}>
            <Dumbbell size={18} /> Performance Engine
          </button>
        </div>
      </div>

      {/* PERFORMANCE ENGINE TAB */}
      {mainTab === 'performance' && (
        <div>
          <div style={styles.card}>
            <div style={styles.filterRow}>
              <div style={styles.filterGroup}>
                <label style={styles.label}>Athlete</label>
                <select value={selectedAthlete} onChange={(e) => setSelectedAthlete(e.target.value)} style={styles.select}>
                  <option value="all">All Athletes</option>
                  {athletes.map((a, i) => <option key={i} value={a.name}>{a.name}</option>)}
                </select>
              </div>
              <div style={styles.filterGroup}>
                <label style={styles.label}>From</label>
                <input type="date" value={dateRange.start} onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))} style={styles.input} />
              </div>
              <div style={styles.filterGroup}>
                <label style={styles.label}>To</label>
                <input type="date" value={dateRange.end} onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))} style={styles.input} />
              </div>
              <div style={styles.filterActions}>
                <button style={styles.btnSecondary} onClick={exportCSV}>Export CSV</button>
                <button style={styles.btnSecondary} onClick={() => window.print()}>Print</button>
              </div>
            </div>
          </div>

          {error && <div style={styles.errorBanner}><span>{error}</span><button style={styles.retryBtn} onClick={loadData}>Retry</button></div>}

          {loading ? (
            <div style={styles.card}><p style={{ ...styles.body, textAlign: 'center', padding: '2rem' }}>Loading results…</p></div>
          ) : (
            <>
              <div style={styles.summaryGrid}>
                <div style={styles.summaryCard}>
                  <span style={styles.summaryLabel}>Avg Sessions / Week</span>
                  <span style={styles.summaryValue}>{summary?.avgPerWeek != null ? summary.avgPerWeek.toFixed(1) : '—'}</span>
                  <span style={styles.summarySub}>across {summary.weeksCovered} weeks</span>
                </div>
                <div style={styles.summaryCard}>
                  <span style={styles.summaryLabel}>Total Volume Lifted</span>
                  <span style={styles.summaryValue}>{fmt(summary.totalVolume)} kg</span>
                  <span style={styles.summarySub}>{summary.sessions} total sessions</span>
                </div>
                <div style={styles.summaryCard}>
                  <span style={styles.summaryLabel}>Volume at ≥85%</span>
                  <span style={styles.summaryValue}>{summary?.pctAt85Plus != null ? summary.pctAt85Plus.toFixed(0) : '—'}%</span>
                  <span style={styles.summarySub}>{fmt(summary.volAt85Plus)} kg heavy work</span>
                </div>
                <div style={styles.summaryCard}>
                  <span style={styles.summaryLabel}>CORE Lifts Tracked</span>
                  <span style={styles.summaryValue}>{CORE_KEYS.filter(key => summary.zoneVolumes.some(v => v > 0)).length > 0 ? '✓ Active' : '— No data'}</span>
                  <span style={styles.summarySub}>6 CORE lifts monitored</span>
                </div>
              </div>

              <div style={styles.card}>
                <h2 style={styles.h2}>Volume at Intensity Distribution</h2>
                <div style={styles.barChartContainer}>
                  {summary.zoneVolumes.map((vol, i) => {
                    const maxVol = Math.max(...summary.zoneVolumes, 1);
                    const heightPct = (vol / maxVol) * 100;
                    const pctOfTotal = summary.totalVolume > 0 ? (vol / summary.totalVolume) * 100 : 0;
                    return (
                      <div key={i} style={styles.barCol}>
                        <div style={styles.barValueLabel}>{pctOfTotal != null ? pctOfTotal.toFixed(0) : '0'}%</div>
                        <div style={styles.barTrack}><div style={{ ...styles.barFill, height: `${heightPct}%`, backgroundColor: ZONE_COLORS[i] }}/></div>
                        <div style={styles.barLabel}>{ZONE_LABELS[i]}</div>
                        <div style={styles.barSubLabel}>{fmt(vol)} kg</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={styles.card}>
                <h2 style={styles.h2}>Training Frequency</h2>
                {weeklyFrequency.length === 0 ? <p style={styles.body}>No session data.</p> : (
                  <div style={styles.freqChart}>
                    {weeklyFrequency.map((w, i) => (
                      <div key={i} style={styles.freqCol}>
                        <div style={styles.freqBarWrapper}>
                          <div style={{ ...styles.freqBar, height: `${(w.sessionCount / maxFreq) * 100}%` }}><span style={styles.freqCount}>{w.sessionCount}</span></div>
                        </div>
                        <div style={styles.freqLabel}>{new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <h2 style={styles.h2}>CORE Lift Progression Over Time</h2>
                {progressionData.length < 2 ? <p style={styles.body}>Not enough data yet.</p> : <ProgressionChart data={progressionData} weeklyData={weeklyFrequency} />}
              </div>

              {selectedAthlete === 'all' && comparisonMatrix.length > 0 && (
                <div style={styles.card}>
                  <h2 style={styles.h2}>Athlete Comparison Matrix</h2>
                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr><th style={styles.th}>Athlete</th><th style={styles.th}>Sessions</th><th style={styles.th}>Avg / Wk</th><th style={styles.th}>Total Vol</th><th style={styles.th}>Vol ≥85%</th><th style={styles.th}>Heavy Focus</th></tr>
                      </thead>
                      <tbody>
                        {comparisonMatrix.sort((a, b) => b.pctAt85 - a.pctAt85).map((a, i) => (
                          <tr key={i} style={styles.tr}>
                            <td style={styles.td}>{a.name}</td><td style={styles.td}>{a.sessions}</td><td style={styles.td}>{a.avgPerWeek != null ? a.avgPerWeek.toFixed(1) : '—'}</td><td style={styles.td}>{fmt(a.totalVol)} kg</td><td style={styles.td}>{a.pctAt85 != null ? a.pctAt85.toFixed(0) : '—'}%</td>
                            <td style={styles.td}><div style={styles.miniBarTrack}><div style={{ ...styles.miniBarFill, width: `${Math.min(a.pctAt85, 100)}%`, backgroundColor: a.pctAt85 >= 30 ? COLORS.zone4 : COLORS.zone2 }} /></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={styles.card}>
                <h2 style={styles.h2}>Current CORE Lift Maxes</h2>
                {filteredMaxes.length === 0 ? <p style={styles.body}>No max data available.</p> : (
                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr><th style={styles.th}>Athlete</th><th style={styles.th}>Squat</th><th style={styles.th}>Deadlift</th><th style={styles.th}>Bench</th><th style={styles.th}>OHP</th><th style={styles.th}>Row</th><th style={styles.th}>Lat Pulldown</th></tr>
                      </thead>
                      <tbody>
                        {filteredMaxes.map((a, i) => (
                          <tr key={i} style={styles.tr}>
                            <td style={styles.td}>{a.name}</td>
                            <td style={styles.td}>{a['Back Squat With Barbell - (CORE)'] ? `${a['Back Squat With Barbell - (CORE)']} kg` : '—'}</td>
                            <td style={styles.td}>{a['Deadlift With Barbell.v (CORE)'] ? `${a['Deadlift With Barbell.v (CORE)']} kg` : '—'}</td>
                            <td style={styles.td}>{a['Bench Press With Barbell - (CORE)'] ? `${a['Bench Press With Barbell - (CORE)']} kg` : '—'}</td>
                            <td style={styles.td}>{a['Shoulder Press Seated With Barbell - (CORE)'] ? `${a['Shoulder Press Seated With Barbell - (CORE)']} kg` : '—'}</td>
                            <td style={styles.td}>{a['Barbell Row On Bench - Back.v (CORE)'] ? `${a['Barbell Row On Bench - Back.v (CORE)']} kg` : '—'}</td>
                            <td style={styles.td}>{a['Lat Pulldown On Machine - Back (CORE)'] ? `${a['Lat Pulldown On Machine - Back (CORE)']} kg` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <div style={styles.collapsibleHeader} onClick={() => setShowLogbook(!showLogbook)}>
                  <h2 style={{ ...styles.h2, margin: 0 }}>Logbook Detail</h2>
                  <span style={styles.chevron}>{showLogbook ? '▼' : '▶'}</span>
                </div>
                {showLogbook && (
                  <div style={{ marginTop: '1rem' }}>
                    {filteredLogbook.length === 0 ? <p style={styles.body}>No entries.</p> : (
                      <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                          <thead><tr>{['Date', 'Athlete', 'Exercise', 'Sets', 'Reps', '% Int.', 'Weight', 'Tempo', 'Rest', 'Set Vol'].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {filteredLogbook.map((entry, i) => (
                              <tr key={i} style={styles.tr}>
                                <td style={styles.td}>{entry.date ? new Date(entry.date).toLocaleDateString() : '—'}</td><td style={styles.td}>{entry.name || '—'}</td><td style={styles.td}>{entry.exercise || '—'}</td><td style={styles.td}>{entry.sets || '—'}</td><td style={styles.td}>{entry.reps || '—'}</td><td style={styles.td}>{entry.percentIntensity || entry.intensity || '—'}</td><td style={styles.td}>{entry.weight ? `${entry.weight} kg` : '—'}</td><td style={styles.td}>{entry.tempo || '—'}</td><td style={styles.td}>{entry.rest || '—'}</td><td style={styles.td}>{fmt(calcSetVolume(entry, maxesByAthlete))} kg</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* WELLNESS CENTER TAB */}
      {mainTab === 'wellness' && (
        <div>
          <div className="cr-toggle-bg">
            <button className={`cr-toggle-btn ${wellnessViewMode === 'grid' ? 'active' : ''}`} onClick={() => setWellnessViewMode('grid')}><LayoutGrid size={16} /> Readiness Grid</button>
            <button className={`cr-toggle-btn ${wellnessViewMode === 'charts' ? 'active' : ''}`} onClick={() => setWellnessViewMode('charts')}><BarChart2 size={16} /> Analytics</button>
          </div>
          
          {wellnessViewMode === 'grid' && (
            <div className="cr-search-box">
              <Search size={18} color="#94a3b8" />
              <input type="text" placeholder="Search roster..." value={wellnessSearch} onChange={(e) => setWellnessSearch(e.target.value)} />
            </div>
          )}

          {wellnessLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading Roster Data...</div>
          ) : wellnessViewMode === 'grid' ? (
            <div className="cr-grid-card">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Athlete</th>
                    <th><div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><HandMetal size={14}/> Dyno (kg)</div></th>
                    <th><div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><Smile size={14}/> Feeling</div></th>
                    <th><div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><Heart size={14}/> Soreness</div></th>
                    <th><div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><Moon size={14}/> Sleep</div></th>
                    <th><div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><Utensils size={14}/> Nutrition</div></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWellnessRoster.map(athlete => {
                    const isAlert = athlete.status === 'fatigued';
                    
                    // Medical Badge Logic
                    let medBadge = null;
                    if (athlete.medicalStatus === 'Cannot Train') {
                      medBadge = <span style={{ fontSize:'10px', background:'#fef2f2', color:'#dc2626', padding:'2px 6px', borderRadius:'4px', border:'1px solid #fca5a5', marginLeft:'8px', display:'flex', alignItems:'center', gap:'4px' }}><ShieldAlert size={10}/> OUT</span>;
                    } else if (athlete.medicalStatus === 'Modified Training') {
                      medBadge = <span style={{ fontSize:'10px', background:'#fffbeb', color:'#d97706', padding:'2px 6px', borderRadius:'4px', border:'1px solid #fcd34d', marginLeft:'8px' }}>MODIFIED</span>;
                    }

                    return (
                      <tr key={athlete.id} className={isAlert ? 'cr-alert-row' : ''}>
                        <td>
                          <div className="cr-athlete-name" onClick={() => openMedicalModal(athlete)}>
                            <div className="cr-avatar">{athlete.name.charAt(0)}</div>
                            {athlete.name}
                            {medBadge}
                            {isAlert && !medBadge && <AlertCircle size={16} color="#dc2626" title="Fatigue Warning" style={{marginLeft:'8px'}} />}
                          </div>
                        </td>
                        <td><span className={`status-badge ${getColorClass(athlete.grip, 'grip')}`}>{athlete.grip ? athlete.grip.toFixed(1) : '--'}</span></td>
                        <td><span className={`status-badge ${getColorClass(athlete.feeling, 'feeling')}`}>{athlete.feeling ? athlete.feeling + '/10' : '--'}</span></td>
                        <td><span className={`status-badge ${getColorClass(athlete.soreness, 'soreness')}`}>{athlete.soreness ? athlete.soreness + '/10' : '--'}</span></td>
                        <td><span className={`status-badge ${getColorClass(athlete.sleep, 'sleep')}`}>{athlete.sleep ? athlete.sleep.toFixed(1) + 'h' : '--'}</span></td>
                        <td><span className={`status-badge ${getColorClass(athlete.nutrition, 'nutrition')}`}>{athlete.nutrition ? athlete.nutrition + '/10' : '--'}</span></td>
                      </tr>
                    );
                  })}
                  {filteredWellnessRoster.length === 0 && <tr><td colSpan="6" style={{ padding: '32px', color: '#64748b' }}>No athletes found in active roster.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div className="cr-metrics">
                <button className={`cr-metric-card ${activeWellnessMetric === 'grip' ? 'active-grip' : ''}`} onClick={() => setActiveWellnessMetric('grip')}>
                  <div className="cr-metric-label"><HandMetal size={16} color={activeWellnessMetric === 'grip' ? '#3b82f6' : 'currentColor'} /> Grip</div>
                  <div className="cr-metric-value">{avgGrip}<span className="cr-metric-unit">kg</span></div>
                </button>
                <button className={`cr-metric-card ${activeWellnessMetric === 'feeling' ? 'active-feeling' : ''}`} onClick={() => setActiveWellnessMetric('feeling')}>
                  <div className="cr-metric-label"><Smile size={16} color={activeWellnessMetric === 'feeling' ? '#0ea5e9' : 'currentColor'} /> Feeling</div>
                  <div className="cr-metric-value">{avgFeeling}<span className="cr-metric-unit">/10</span></div>
                </button>
                <button className={`cr-metric-card ${activeWellnessMetric === 'soreness' ? 'active-soreness' : ''}`} onClick={() => setActiveWellnessMetric('soreness')}>
                  <div className="cr-metric-label"><Heart size={16} color={activeWellnessMetric === 'soreness' ? '#ef4444' : 'currentColor'} /> Soreness</div>
                  <div className="cr-metric-value">{avgSoreness}<span className="cr-metric-unit">/10</span></div>
                </button>
                <button className={`cr-metric-card ${activeWellnessMetric === 'sleep' ? 'active-sleep' : ''}`} onClick={() => setActiveWellnessMetric('sleep')}>
                  <div className="cr-metric-label"><Moon size={16} color={activeWellnessMetric === 'sleep' ? '#6366f1' : 'currentColor'} /> Sleep</div>
                  <div className="cr-metric-value">{avgSleep}<span className="cr-metric-unit">hrs</span></div>
                </button>
                <button className={`cr-metric-card ${activeWellnessMetric === 'nutrition' ? 'active-nutrition' : ''}`} onClick={() => setActiveWellnessMetric('nutrition')}>
                  <div className="cr-metric-label"><Utensils size={16} color={activeWellnessMetric === 'nutrition' ? '#10b981' : 'currentColor'} /> Nutrition</div>
                  <div className="cr-metric-value">{avgNutrition}<span className="cr-metric-unit">/10</span></div>
                </button>
              </div>

              <div className="cr-chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>7-Day Trend</h3>
                  <select value={selectedChartUser} onChange={(e) => setSelectedChartUser(e.target.value)} className="cr-select">
                    <option value="team">Team Average</option>
                    <optgroup label="Active Roster">
                      {wellnessRoster.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  </select>
                </div>
                
                <div style={{ height: '300px', width: '100%' }}>
                  {wellnessChartData.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8' }}>No logs recorded yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wellnessChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold' }} formatter={(value) => [value.toFixed(1), '']} />
                        
                        {activeWellnessMetric === 'grip' && <Line type="monotone" dataKey="grip" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {activeWellnessMetric === 'feeling' && <Line type="monotone" dataKey="feeling" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {activeWellnessMetric === 'soreness' && <Line type="monotone" dataKey="soreness" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {activeWellnessMetric === 'sleep' && <Line type="monotone" dataKey="sleep" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                        {activeWellnessMetric === 'nutrition' && <Line type="monotone" dataKey="nutrition" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MEDICAL CLINICAL FILE MODAL */}
      {medicalModalOpen && selectedMedicalAthlete && (
        <div className="modal-overlay" onClick={() => !medSaving && setMedicalModalOpen(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>{selectedMedicalAthlete.name} - Clinical File</h2>
              <button onClick={() => setMedicalModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24}/></button>
            </div>

            <div style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: '20px' }}>
              {selectedMedicalAthlete.medicalHistory.length === 0 ? <p style={{ color: '#64748b' }}>No medical history.</p> : 
                selectedMedicalAthlete.medicalHistory.map((m, i) => (
                  <div key={i} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: '#0f172a' }}>{m.bodyPart}</strong>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{m.dateStr}</span>
                    </div>
                    <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                      <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>Pain: {m.pain}</span>
                      <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', borderRadius: '4px' }}>{m.status}</span>
                    </div>
                    {m.notes && <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>"{m.notes}"</p>}
                  </div>
                ))
              }
            </div>

            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Update Treatment / Clearance</h4>
              
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>Status</label>
              <select value={medFormStatus} onChange={e=>setMedFormStatus(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '12px' }}>
                <option value="Cannot Train">Cannot Train (Full Rehab)</option>
                <option value="Modified Training">Modified Training</option>
                <option value="Fully Fit (Cleared)">Fully Fit (Cleared)</option>
              </select>

              <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>Clinical Notes</label>
              <textarea value={medFormNotes} onChange={e=>setMedFormNotes(e.target.value)} placeholder="e.g. Swelling reduced. Cleared for bike." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '16px', minHeight: '60px', resize: 'vertical' }} />

              <button onClick={handleSaveMedical} disabled={medSaving} style={{ width: '100%', padding: '12px', background: '#008ed3', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                {medSaving ? 'Saving...' : 'Save Clinical Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpButton pageName="Coach Results" position="bottom-right" />
    </div>
  );
}

function ProgressionChart({ data, weeklyData }) {
  const width = 720; const height = 280; const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right; const chartH = height - padding.top - padding.bottom;
  const weeks = data.map((d) => d.week);
  const allValues = data.flatMap((d) => [d.backSquat, d.deadlift, d.benchPress].filter(Boolean));
  if (allValues.length === 0) return <p style={{ color: COLORS.bodyGray }}>No progression data.</p>;

  const minY = Math.min(...allValues) * 0.9; const maxY = Math.max(...allValues) * 1.05;
  const xScale = (i) => padding.left + (i / Math.max(weeks.length - 1, 1)) * chartW;
  const yScale = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;
  const lifts = [ { key: 'backSquat', label: 'Back Squat', color: COLORS.zone4 }, { key: 'benchPress', label: 'Bench', color: COLORS.zone3 }, { key: 'deadlift', label: 'Deadlift', color: COLORS.zone5 } ];
  const maxVol = Math.max(...weeklyData.map((w) => w.volume), 1);
  const volBarWidth = chartW / Math.max(weeklyData.length, 1) * 0.6;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + chartH * t; const val = maxY - (maxY - minY) * t;
          return <g key={t}><line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={COLORS.border} strokeWidth="1" /><text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={COLORS.bodyGray}>{Math.round(val)}</text></g>;
        })}
        {weeklyData.map((w, i) => {
          const x = xScale(i) - volBarWidth / 2; const barH = (w.volume / maxVol) * chartH * 0.4;
          return <rect key={`vol-${i}`} x={x} y={padding.top + chartH - barH} width={volBarWidth} height={barH} fill={COLORS.zone1} opacity="0.5" rx="2" />;
        })}
        {lifts.map((lift) => {
          const points = data.map((d, i) => (d[lift.key] ? `${xScale(i)},${yScale(d[lift.key])}` : null)).filter(Boolean);
          if (points.length < 2) return null;
          return (
            <g key={lift.key}>
              <polyline points={points.join(' ')} fill="none" stroke={lift.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => { const [px, py] = p.split(',').map(Number); return <circle key={i} cx={px} cy={py} r="3.5" fill={lift.color} />; })}
            </g>
          );
        })}
        {weeks.map((wk, i) => <text key={wk} x={xScale(i)} y={height - padding.bottom + 18} textAnchor="middle" fontSize="10" fill={COLORS.bodyGray}>{new Date(wk).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>)}
        {lifts.map((lift, i) => (
          <g key={`legend-${lift.key}`}>
            <line x1={padding.left + i * 120} y1={8} x2={padding.left + i * 120 + 16} y2={8} stroke={lift.color} strokeWidth="2.5" />
            <text x={padding.left + i * 120 + 22} y={12} fontSize="11" fill={COLORS.darkText}>{lift.label}</text>
          </g>
        ))}
        <rect x={padding.left + 360} y={3} width={12} height={10} fill={COLORS.zone1} opacity="0.5" rx="2" />
        <text x={padding.left + 378} y={12} fontSize="11" fill={COLORS.darkText}>Weekly Volume</text>
      </svg>
    </div>
  );
}
