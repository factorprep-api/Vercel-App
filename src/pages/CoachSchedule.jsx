import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchAthletes, fetchSchedule, fetchWellnessLogs, saveScheduleSession } from '../api';
import { ArrowLeft, Calendar, BarChart2, Plus, AlertCircle, CheckCircle, Clock, X, AlertTriangle, Users, Layers } from 'lucide-react';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

const SQUAD_COLORS = ['#008ed3', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#64748b', '#a8a29e'];
// ===== SESSION TYPE COLORS (aligned with AthleteSchedule) =====
const TYPE_COLORS = {
  'Field Session': '#10b981',
  'Competition': '#dc2626',
  'Conditioning': '#f59e0b',
  'Rehabilitation': '#ec4899',
  'Recovery': '#06b6d4',
  'Speed / Agility': '#3b82f6',
  'Prehabilitation': '#f43f5e',
  'Gym Workout': '#8b5cf6',
  'Other': '#64748b'
};

// Intensity strip shading — green (low) → amber (moderate) → red (high)
const getIntensityColor = (rpe) => {
  if (rpe === null || rpe === undefined) return '#e2e8f0';
  if (rpe <= 5) return '#22c55e';
  if (rpe <= 7) return '#f59e0b';
  return '#dc2626';
};
export default function CoachSchedule() {
  const { userEmail, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('acwr'); // 'acwr' or 'audit'
  
  const [roster, setRoster] = useState([]);
  const [scheduleLogs, setScheduleLogs] = useState([]);
  const [wellnessLogs, setWellnessLogs] = useState([]);
  const [expandedAthlete, setExpandedAthlete] = useState(null);
  const [hoveredAthlete, setHoveredAthlete] = useState(null);
  const [drilledAthlete, setDrilledAthlete] = useState(null);

  const [squadAxis, setSquadAxis] = useState('rel');
  const [searchQuery, setSearchQuery] = useState('');
  const [squadSelection, setSquadSelection] = useState([]);

  const toggleSquadAthlete = (name) => {
    setSquadSelection(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };
  // Propose Session Modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [form, setForm] = useState({ date: '', type: 'Field Session', duration: 60, rpe: 7, location: '', notes: '' });

  // Audit Modal
  const [selectedAuditSession, setSelectedAuditSession] = useState(null);

  const coachEmail = userEmail;

  useEffect(() => {
    if (coachEmail) loadData();
  }, [userEmail]);

   async function loadData() {
    try {
      const [athRes, schedData, wellRes] = await Promise.all([ fetchAthletes(), fetchSchedule(), fetchWellnessLogs() ]);
      
      const athletes = athRes.athletes || [];
      const validRoster = [];
      
      for (let i = 1; i < athletes.length; i++) {
        if (!athletes[i]) continue;
        const name = String(athletes[i][0] || '').trim();
        const pods = String(athletes[i][11] || '').toLowerCase();
        if (name && pods.includes('schedule')) validRoster.push({ name, email: String(athletes[i][9] || '').trim().toLowerCase() });
      }
      setRoster(validRoster.sort((a, b) => a.name.localeCompare(b.name)));

      const rawLogs = schedData.data || [];
      if (rawLogs.length > 1) {
        const parsed = [];
        rawLogs.slice(1).forEach(r => {
          if (!r || !r[0]) return;
          let d = new Date(r[0]);
          if (isNaN(d.getTime())) return;

          const pMins = Number(r[4]) || 0;
          const pRpe = Number(r[5]) || 0;
          const pLoad = Number(r[6]) || (pMins * pRpe);
          const aMins = Number(r[7]) || 0;
          const aRpe = Number(r[8]) || 0;
          const aLoad = Number(r[9]) || (aMins * aRpe);
          const rowNotes = String(r[11] || '');

          // Dynamic Status Derivation across 12 columns
          let sessionStatus = 'Proposed';
          if (aMins > 0) {
            const lowerNotes = rowNotes.toLowerCase();
            if (lowerNotes.includes('injury') || lowerNotes.includes('incident')) {
              sessionStatus = 'Injury';
            } else if (lowerNotes.includes('modified') || (pMins > 0 && (aMins !== pMins || aRpe !== pRpe))) {
              sessionStatus = 'Modified';
            } else {
              sessionStatus = 'Actual';
            }
          }
          
          parsed.push({
            rawDate: d,
            dateStr: d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}),
            email: String(r[1]).trim(),
            athlete: String(r[2]).trim(),
            type: r[3] || '',
            proposedMins: pMins,
            proposedRpe: pRpe,
            proposedLoad: pLoad,
            actualMins: aMins,
            actualRpe: aRpe,
            actualLoad: aLoad,
            location: r[10] || '',
            notes: rowNotes,
            status: sessionStatus
          });
        });
setScheduleLogs(parsed.sort((a,b) => b.rawDate - a.rawDate)); // Newest first
       }
       
// Parse wellness data — defensive: verify header row to map columns
      const wellData = wellRes.data || [];
      if (wellData.length > 1) {
        const header = wellData[0] || [];
        console.log('[Wellness] Header row:', header);
        const col = {};
        header.forEach((h, i) => {
          const key = String(h || '').trim().toLowerCase();
          if (key === 'date') col.date = i;
          else if (key === 'email') col.email = i;
          else if (key === 'grip') col.grip = i;
          else if (key === 'feeling') col.feeling = i;
          else if (key === 'soreness') col.soreness = i;
          else if (key === 'sleep') col.sleep = i;
          else if (key === 'nutrition') col.nutrition = i;
        });
        console.log('[Wellness] Mapped column indices:', col);
        // Fallback to expected indices if header missing/unrecognized
        const idx = {
          date: col.date ?? 0,
          email: col.email ?? 1,
          grip: col.grip ?? 2,
          feeling: col.feeling ?? 3,
          soreness: col.soreness ?? 4,
          sleep: col.sleep ?? 5,
          nutrition: col.nutrition ?? 6,
        };
        console.log('[Wellness] Using indices:', idx);

        const parsedWellness = [];
        wellData.slice(1).forEach((r, i) => {
          if (!r || !r[idx.date]) return;
          let d = new Date(r[idx.date]);
          if (isNaN(d.getTime())) return;
          const gripVal = r[idx.grip];
          const feelingVal = r[idx.feeling];
          const sorenessVal = r[idx.soreness];
          const sleepVal = r[idx.sleep];
          const nutritionVal = r[idx.nutrition];
          const emailVal = String(r[idx.email] || '').trim().toLowerCase();
          if (i < 3) console.log('[Wellness] Sample row', i, ':', { raw: r, parsed: { date: d, email: emailVal, grip: gripVal, feeling: feelingVal, soreness: sorenessVal, sleep: sleepVal, nutrition: nutritionVal } });
          parsedWellness.push({
            rawDate: d,
            email: emailVal,
            grip: gripVal !== '' && gripVal != null ? Number(gripVal) : null,
            feeling: feelingVal !== '' && feelingVal != null ? Number(feelingVal) : null,
            soreness: sorenessVal !== '' && sorenessVal != null ? Number(sorenessVal) : null,
            sleep: sleepVal !== '' && sleepVal != null ? Number(sleepVal) : null,
            nutrition: nutritionVal !== '' && nutritionVal != null ? Number(nutritionVal) : null,
          });
        });
        console.log('[Wellness] Parsed', parsedWellness.length, 'entries');
        setWellnessLogs(parsedWellness.sort((a, b) => a.rawDate - b.rawDate));
      } else {
        console.log('[Wellness] No data or only header, wellData.length:', wellData.length);
      }
     } catch (e) {
       console.error(e);
     }
     setLoading(false);
   }

  // --- ACWR MATH ---
  const logsByAthlete = useMemo(() => {
    const map = {};
    scheduleLogs.forEach(l => {
      if (!map[l.athlete]) map[l.athlete] = [];
      map[l.athlete].push(l);
    });
    return map;
  }, [scheduleLogs]);

  // --- WELLNESS INDEX (email -> entries, ascending by date; mirrors logsByAthlete) ---
  const wellnessByEmail = useMemo(() => {
    const map = {};
    wellnessLogs.forEach(w => {
      if (!map[w.email]) map[w.email] = [];
      map[w.email].push(w);
    });
    // Debug: log roster emails vs wellness emails
    const rosterEmails = roster.map(a => a.email).filter(Boolean);
    const wellnessEmails = Object.keys(map);
    console.log('[Wellness] Roster emails:', rosterEmails);
    console.log('[Wellness] Wellness emails:', wellnessEmails);
    console.log('[Wellness] Intersection:', rosterEmails.filter(e => wellnessEmails.includes(e)));
    return map;
  }, [wellnessLogs]);

  const rosterWithLoads = useMemo(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
    const twentyEightDaysAgo = new Date(today); twentyEightDaysAgo.setDate(today.getDate() - 28);

    // Wellness windows keyed by calendar day so time-of-day never shifts a log's day
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const wellMin7 = startOfToday - 6 * DAY_MS;    // last 7 days incl. today
    const wellMin3 = startOfToday - 2 * DAY_MS;    // last 3 days incl. today
    const wellMin14 = startOfToday - 13 * DAY_MS;  // last 14 days incl. today
    const wellMin28 = startOfToday - 27 * DAY_MS;  // last 28 days incl. today

    return roster.map(ath => {
      const athLogs = logsByAthlete[ath.name] || [];
      const athLogsFiltered = athLogs.filter(l => l.status === 'Actual' || l.status === 'Modified' || l.status === 'Injury');

      // Build per-day load map once per athlete
      const dailyMap = {};
      athLogsFiltered.forEach(l => {
        const dayKey = new Date(l.rawDate.getFullYear(), l.rawDate.getMonth(), l.rawDate.getDate()).getTime();
        dailyMap[dayKey] = (dailyMap[dayKey] || 0) + l.actualLoad;
      });

      const dailyLoads = [];
      for (let i = 27; i >= 0; i--) {
        const dd = new Date(today); dd.setDate(today.getDate() - i);
        const dayKey = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate()).getTime();
        dailyLoads.push(dailyMap[dayKey] || 0);
      }

      const acuteLoad = dailyLoads.slice(-7).reduce((a, b) => a + b, 0);
      const chronicLoad = dailyLoads.reduce((a, b) => a + b, 0) / 4;

      let acwr = 0;
      if (chronicLoad > 0) acwr = acuteLoad / chronicLoad;

      // 14-Day Load by Session Type
      const chartMap = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        chartMap[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = { rpeSum: 0, loadSum: 0 };
      }

      athLogsFiltered.forEach(l => {
        if (l.rawDate < new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)) return;
        const dStr = l.rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const day = chartMap[dStr];
        if (!day) return;
        const type = l.type || 'Other';
        day[type] = (day[type] || 0) + l.actualLoad;
        day.loadSum += l.actualLoad;
        day.rpeSum += l.actualLoad * l.actualRpe;
      });

      const chartData = Object.values(chartMap).map((day, idx) => {
        const { rpeSum, loadSum, ...typeLoads } = day;
        return {
          date: Object.keys(chartMap)[idx],
          ...typeLoads,
          avgRpe: loadSum > 0 ? Math.round((rpeSum / loadSum) * 10) / 10 : null
        };
      });

      const chartTypes = [];
      chartData.forEach(day => {
        Object.keys(day).forEach(k => {
          if (k !== 'date' && k !== 'avgRpe' && !chartTypes.includes(k)) chartTypes.push(k);
        });
      });

      // Foster's weekly monotony & strain
      const last7 = dailyLoads.slice(-7);
      const meanLoad = last7.reduce((a, b) => a + b, 0) / (last7.length || 1);
      const stdLoad = Math.sqrt(last7.reduce((a, b) => a + Math.pow(b - meanLoad, 2), 0) / (last7.length || 1));
      const monotony = stdLoad > 0 ? meanLoad / stdLoad : 0;
      const weeklyLoad = last7.reduce((a, b) => a + b, 0);
      const strain = monotony > 0 ? Math.round(monotony * weeklyLoad) : 0;

      const sessions7d = athLogs.filter(l => l.rawDate >= sevenDaysAgo).length;

      const acwrHistory = [];
      for (let i = 13; i >= 0; i--) {
        const endIdx = dailyLoads.length - 1 - i;
        const acuteWin = dailyLoads.slice(Math.max(0, endIdx - 6), endIdx + 1).reduce((a, b) => a + b, 0);
        const chronicWin = dailyLoads.slice(Math.max(0, endIdx - 27), endIdx + 1).reduce((a, b) => a + b, 0) / 4;
        acwrHistory.push({ day: 13 - i, acwr: chronicWin > 0 ? Math.round((acuteWin / chronicWin) * 100) / 100 : null });
      }

      // --- WELLNESS (Wellness_Logs joined by email; missing components skipped, never zero) ---
      const wellEntries = wellnessByEmail[ath.email] || [];
      const wellDayComp = {}; // dayKey -> pooled { sum, count } for the 14-day series
      let well7Sum = 0, well7Count = 0;
      let grip28Sum = 0, grip28Count = 0;
      let latestGrip = null;
      let latestWellEntry = null;

      wellEntries.forEach(w => {
        const dk = new Date(w.rawDate.getFullYear(), w.rawDate.getMonth(), w.rawDate.getDate()).getTime();
        const invSoreness = w.soreness != null ? 11 - w.soreness : null; // soreness: higher = worse, invert before averaging
        let daySum = 0, dayCount = 0;
        if (w.feeling != null) { daySum += w.feeling; dayCount++; }
        if (invSoreness != null) { daySum += invSoreness; dayCount++; }
        if (w.sleep != null) { daySum += w.sleep; dayCount++; }
        if (w.nutrition != null) { daySum += w.nutrition; dayCount++; }

        if (dk >= wellMin14) {
          if (!wellDayComp[dk]) wellDayComp[dk] = { sum: 0, count: 0 };
          wellDayComp[dk].sum += daySum;
          wellDayComp[dk].count += dayCount;
        }
        if (dk >= wellMin7) {
          well7Sum += daySum;
          well7Count += dayCount;
          if (dayCount > 0) latestWellEntry = w; // entries ascending by date -> last qualifying wins
        }
        if (w.grip != null) {
          if (dk >= wellMin28) { grip28Sum += w.grip; grip28Count++; }
          if (dk >= wellMin3) latestGrip = w.grip; // raw force — never averaged into the composite
        }
      });

      let wellnessComposite = null;
      if (well7Count > 0) wellnessComposite = Math.round((well7Sum / well7Count) * 10) / 10;

      let gripPct = null;
      if (latestGrip != null && grip28Count > 0) {
        const gripAvg = grip28Sum / grip28Count;
        if (gripAvg > 0) gripPct = Math.round((latestGrip / gripAvg) * 1000) / 10;
      }

      const wellnessHistory = [];
      for (let i = 13; i >= 0; i--) {
        const c = wellDayComp[startOfToday - i * DAY_MS];
        wellnessHistory.push({ day: 13 - i, wellness: c && c.count > 0 ? Math.round((c.sum / c.count) * 10) / 10 : null });
      }
      const hasWellness = wellnessHistory.some(h => h.wellness != null);

      let wellnessTip = null;
      if (latestWellEntry) {
        const fmt = (v) => (v != null ? v : '—');
        wellnessTip = `Feel ${fmt(latestWellEntry.feeling)} · Sleep ${fmt(latestWellEntry.sleep)} · Sore ${fmt(latestWellEntry.soreness)}/10 · Nutri ${fmt(latestWellEntry.nutrition)}`;
      }

      const flags = [];
      if (acwr > 1.5) flags.push({ label: 'Spike', detail: 'ACWR in danger zone — rapid load increase', color: '#dc2626' });
      else if (acwr > 1.3) flags.push({ label: 'Caution', detail: 'ACWR elevated — monitor closely', color: '#f59e0b' });
      if (monotony >= 2.0) flags.push({ label: 'Monotony', detail: 'Weekly monotony ≥ 2.0 — same load every day, no variation/rest', color: '#dc2626' });
      if (acwr > 0 && acwr < 0.8) flags.push({ label: 'Undertraining', detail: 'ACWR below 0.8 — detraining risk', color: '#0ea5e9' });
      if (sessions7d === 0 && chronicLoad > 0) flags.push({ label: 'Inactive', detail: 'No sessions logged in the last 7 days', color: '#dc2626' });

      return { ...ath, acuteLoad, chronicLoad, acwr, chartData, chartTypes, monotony, strain, sessions7d, acwrHistory, flags, wellnessComposite, wellnessTip, gripPct, wellnessHistory, hasWellness };
    });
  }, [roster, logsByAthlete, wellnessByEmail]);

  // --- SESSION AUDIT GROUPING ---
  const groupedAuditSessions = useMemo(() => {
    const groups = {};
    scheduleLogs.forEach(log => {
      // Create a unique key for the session event
      const key = `${log.dateStr}|${log.type}|${log.proposedLoad}`;
      if (!groups[key]) {
        groups[key] = {
          dateStr: log.dateStr,
          type: log.type,
          proposedMins: log.proposedMins,
          proposedRpe: log.proposedRpe,
          proposedLoad: log.proposedLoad,
          location: log.location,
          athletes: []
        };
      }
      groups[key].athletes.push(log);
    });
    // Filter out manual logs that didn't have a proposed load
    return Object.values(groups).filter(g => g.proposedLoad > 0);
  }, [scheduleLogs]);

   const squadComparison = useMemo(() => {
    if (squadSelection.length === 0) return null;
    const rows = rosterWithLoads.filter(a => squadSelection.includes(a.name));
    let maxDaily = 0;
    rows.forEach(a => a.chartData.forEach(d => {
      Object.keys(d).forEach(k => { if (k !== 'date' && k !== 'avgRpe') maxDaily = Math.max(maxDaily, d[k]); });
    }));
    const dateLabels = rows.length ? rows[0].chartData.map(d => d.date) : [];

    // Team Composition: sum each type's load across all selected athletes per day
    const teamTotals = dateLabels.map((d, idx) => {
      const dayTotal = { date: d, rpeSum: 0, loadSum: 0 };
      rows.forEach(a => {
        const athleteDay = a.chartData[idx];
        Object.keys(athleteDay).forEach(k => {
          if (k === 'date' || k === 'avgRpe') return;
          dayTotal[k] = (dayTotal[k] || 0) + athleteDay[k];
          dayTotal.loadSum += athleteDay[k];
          dayTotal.rpeSum += athleteDay[k] * (athleteDay.avgRpe || 0);
        });
      });
      dayTotal.avgRpe = dayTotal.loadSum > 0 ? Math.round((dayTotal.rpeSum / dayTotal.loadSum) * 10) / 10 : null;
      return dayTotal;
    });
    const teamTypes = Object.keys(teamTotals.reduce((acc, t) => ({ ...acc, ...t }), {})).filter(k => k !== 'date' && k !== 'avgRpe' && k !== 'loadSum' && k !== 'rpeSum');

    return { rows, maxDaily, dateLabels, teamTotals, teamTypes };
  }, [squadSelection, rosterWithLoads]);

  const drilledAthleteData = drilledAthlete ? rosterWithLoads.find(a => a.name === drilledAthlete) : null;

  const squadLineData = useMemo(() => {
    if (!squadComparison) return [];
    return squadComparison.dateLabels.map((date, idx) => {
      const row = { date };
      squadComparison.rows.forEach(a => {
        let total = 0;
        const d = a.chartData[idx];
        Object.keys(d).forEach(k => { if (k !== 'date' && k !== 'avgRpe') total += d[k]; });
        row[a.name] = squadAxis === 'rel'
          ? (a.chronicLoad > 0 ? Math.round((total / (a.chronicLoad / 28)) * 100) : null)
          : Math.round(total);
      });
      return row;
    });
  }, [squadComparison, squadAxis]);

  const getAcwrStatus = (acwr) => {
    if (acwr === 0) return { text: 'No Data', color: '#64748b', bg: '#f1f5f9' };
    if (acwr < 0.8) return { text: 'Under-Training', color: '#0ea5e9', bg: '#e0f2fe' };
    if (acwr <= 1.3) return { text: 'Sweet Spot', color: '#16a34a', bg: '#dcfce3' };
    if (acwr <= 1.5) return { text: 'Caution', color: '#f59e0b', bg: '#fef3c7' };
    return { text: 'Danger Zone', color: '#dc2626', bg: '#fef2f2' };
  };

  // Wellness composite badge color: green >= 7, amber 5-6.9, red < 5, gray when no data
  const getWellnessColor = (v) => {
    if (v == null) return '#94a3b8';
    if (v >= 7) return '#16a34a';
    if (v >= 5) return '#f59e0b';
    return '#dc2626';
  };

  const handleToggleAthlete = (athName) => {
    if (selectedAthletes.includes(athName)) {
      setSelectedAthletes(selectedAthletes.filter(n => n !== athName));
    } else {
      setSelectedAthletes([...selectedAthletes, athName]);
    }
  };

  const selectAllAthletes = () => {
    if (selectedAthletes.length === roster.length) setSelectedAthletes([]);
    else setSelectedAthletes(roster.map(a => a.name));
  };

  async function handlePropose() {
    if (selectedAthletes.length === 0) return alert("Select at least one athlete.");
    if (!form.date) return alert("Please select a date.");
    setSaving(true);
    try {
      await Promise.all(selectedAthletes.map(athName => {
        const payload = {
          email: coachEmail, athlete: athName, type: form.type, 
          proposedMins: parseInt(form.duration), proposedRpe: parseInt(form.rpe), 
          actualMins: 0, actualRpe: 0, 
          location: form.location, notes: form.notes
        };
        return saveScheduleSession(payload);
      }));
      setShowModal(false);
      setSelectedAthletes([]);
      setForm({ ...form, notes: '', location: '' }); 
      loadData(); 
    } catch(e) { alert("Failed to save."); }
    setSaving(false);
  }

  const filteredRoster = rosterWithLoads.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (authLoading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        .cs-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
        .cs-tabs { display: flex; gap: 8px; margin-bottom: 20px; background: #e2e8f0; padding: 4px; border-radius: 8px; width: fit-content; }
        .cs-tab { padding: 10px 20px; border: none; background: transparent; border-radius: 6px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
        .cs-tab.active { background: #fff; color: #008ed3; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .cs-table { width: 100%; border-collapse: collapse; text-align: left; }
        .cs-table th { padding: 12px; background: #f8fafc; color: #64748b; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
        .cs-table td { padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 15px; color: #0f172a; }
        .cs-badge { padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 800; display: inline-block; text-align: center; }
        
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 16px; }
        .modal-content { background: white; border-radius: 16px; width: 100%; max-width: 500px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .modal-input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; font-size: 14px; outline: none; }
        
        .roster-list { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; margin-top: 8px; background: #fff; max-height: 180px; overflow-y: auto; }
        .roster-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 4px; cursor: pointer; border-bottom: 1px solid #e2e8f0; }
        .roster-item:hover { background: #f1f5f9; }
        .roster-item:last-child { border-bottom: none; }

        .audit-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; transition: 0.2s; display: flex; justify-content: space-between; align-items: center; }
        .audit-card:hover { border-color: #008ed3; box-shadow: 0 4px 12px rgba(0,142,211,0.05); }
        .audit-status { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 700; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3' }}><ArrowLeft size={28} /></button>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Team Schedule</h1>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <Plus size={18}/> Propose Session
        </button>
      </div>

      <div className="cs-tabs">
        <button className={`cs-tab ${activeTab === 'acwr' ? 'active' : ''}`} onClick={() => setActiveTab('acwr')}><BarChart2 size={18}/> Load Engine (ACWR)</button>
        <button className={`cs-tab ${activeTab === 'squad' ? 'active' : ''}`} onClick={() => setActiveTab('squad')}><Layers size={18}/> Squad Comparison</button>
        <button className={`cs-tab ${activeTab === 'composition' ? 'active' : ''}`} onClick={() => setActiveTab('composition')}><BarChart2 size={18}/> Team Composition</button>
        <button className={`cs-tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}><Users size={18}/> Session Audit</button>
      </div>

      {/* --- TAB 1: ACWR LOAD ENGINE --- */}
      {activeTab === 'acwr' && (
        <div className="cs-card">
          <input type="text" placeholder="Search athlete..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{ width: '100%', maxWidth: '300px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', outline: 'none' }} />
          
          {loading ? <p style={{ color: '#64748b' }}>Calculating ACWR metrics...</p> : (
            <div style={{ overflowX: 'auto' }}>
                           <table className="cs-table">
                <thead>
                  <tr>
                    <th>Athlete</th>
                    <th>Acute Load (7D)</th>
                    <th>Chronic Load (28D Avg)</th>
                    <th>Sessions (7D)</th>
                    <th>ACWR Status</th>
                    <th>Monotony</th>
                    <th>Strain</th>
                    <th>Wellness</th>
                    <th>Flags</th>
                    <th>Analytics</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.length === 0 ? <tr><td colSpan="10" style={{ color: '#64748b', textAlign: 'center' }}>No athletes found with Schedule Pod active.</td></tr> : 
                    filteredRoster.map((ath, idx) => {
                    const status = getAcwrStatus(ath.acwr);
                    const isExpanded = expandedAthlete === ath.name;
                    return (
                      <React.Fragment key={idx}>
                        <tr>
                          <td>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={squadSelection.includes(ath.name)}
                                onChange={() => toggleSquadAthlete(ath.name)}
                                title="Add to Squad Comparison"
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              {ath.name}
                            </label>
                          </td>
                          <td style={{ color: '#0ea5e9' }}>{Math.round(ath.acuteLoad)} AU</td>
                          <td style={{ color: '#64748b' }}>{Math.round(ath.chronicLoad)} AU</td>
                          <td style={{ color: ath.sessions7d === 0 ? '#dc2626' : '#475569', fontWeight: ath.sessions7d === 0 ? 800 : 600 }}>{ath.sessions7d}</td>
                          <td>
                            <span className="cs-badge" style={{ backgroundColor: status.bg, color: status.color, minWidth: '100px' }}>
                              {ath.acwr > 0 ? ath.acwr.toFixed(2) : '-'} | {status.text}
                            </span>
                          </td>
                          <td style={{ color: ath.monotony >= 2 ? '#dc2626' : '#475569', fontWeight: ath.monotony >= 2 ? 800 : 600 }}>
                            {ath.monotony > 0 ? ath.monotony.toFixed(1) : '-'}
                          </td>
                          <td style={{ color: '#475569' }}>
                            {ath.strain > 0 ? ath.strain.toLocaleString() : '-'}
                          </td>
                          <td>
                            {ath.wellnessComposite == null ? (
                              <span style={{ color: '#94a3b8', fontWeight: 700 }}>—</span>
                            ) : (
                              <span className="cs-badge" title={ath.wellnessTip || ''} style={{ backgroundColor: getWellnessColor(ath.wellnessComposite) + '15', color: getWellnessColor(ath.wellnessComposite), minWidth: '44px' }}>
                                {ath.wellnessComposite.toFixed(1)}
                              </span>
                            )}
                          </td>
                          <td>
                            {ath.flags.length === 0 ? (
                              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>✓ Clear</span>
                            ) : (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {ath.flags.map((f, fi) => (
                                  <span key={fi} title={f.detail} className="cs-badge" style={{ backgroundColor: f.color + '15', color: f.color, fontSize: '11px', whiteSpace: 'nowrap' }}>
                                    {f.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <button onClick={() => setExpandedAthlete(isExpanded ? null : ath.name)} style={{ background: isExpanded ? '#0f172a' : '#f1f5f9', color: isExpanded ? 'white' : '#475569', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <BarChart2 size={14}/> {isExpanded ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan="10" style={{ padding: 0, borderBottom: '2px solid #e2e8f0' }}>
                              <div style={{ background: '#f8fafc', padding: '20px', borderTop: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: '14px' }}>14-Day Load by Session Type</h4>
                                <div style={{ height: '200px', width: '100%' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={ath.chartData}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                      {ath.chartTypes.map(t => (
                                        <Bar key={t} dataKey={t} stackId="load" fill={TYPE_COLORS[t] || '#64748b'} />
                                      ))}
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                <h4 style={{ margin: '16px 0 8px 0', color: '#0f172a', fontSize: '14px' }}>Daily Intensity (Load-Weighted RPE)</h4>
                                <div style={{ height: '60px', width: '100%' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={ath.chartData}>
                                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={false} />
                                      <YAxis domain={[0, 10]} hide />
                                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                      <Bar dataKey="avgRpe" radius={[3, 3, 0, 0]}>
                                        {ath.chartData.map((d, i) => (
                                          <Cell key={i} fill={getIntensityColor(d.avgRpe)} />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                <h4 style={{ margin: '16px 0 8px 0', color: '#0f172a', fontSize: '14px' }}>ACWR Trend (Last 14 Days)</h4>
                                <div style={{ height: '80px', width: '100%' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={ath.acwrHistory}>
                                      <XAxis dataKey="day" hide />
                                      <YAxis domain={[0, 2]} hide />
                                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                      <Line type="monotone" dataKey="acwr" stroke="#64748b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                                {ath.hasWellness && (
                                  <>
                                    <h4 style={{ margin: '16px 0 8px 0', color: '#0f172a', fontSize: '14px' }}>Daily Wellness (14 Day)</h4>
                                    <div style={{ height: '80px', width: '100%' }}>
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={ath.wellnessHistory}>
                                          <XAxis dataKey="day" hide />
                                          <YAxis domain={[1, 10]} hide />
                                          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                          <Line type="monotone" dataKey="wellness" stroke="#64748b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                    {ath.gripPct != null && (
                                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', fontWeight: 700, color: ath.gripPct < 90 ? '#dc2626' : ath.gripPct < 95 ? '#f59e0b' : '#16a34a' }}>
                                        Grip: {Math.round(ath.gripPct)}% of 28d avg ({Math.round(ath.gripPct) - 100 >= 0 ? '+' : '−'}{Math.abs(Math.round(ath.gripPct) - 100)}%)
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

        {/* --- TAB 3: SQUAD COMPARISON (LINE VIEW) --- */}
      {activeTab === 'squad' && (
        <div className="cs-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '18px', color: '#0f172a', margin: 0, fontWeight: '800' }}>Squad Comparison</h2>
            <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '8px' }}>
              <button onClick={() => setSquadAxis('rel')} style={{ padding: '6px 14px', border: 'none', borderRadius: '6px', background: squadAxis === 'rel' ? '#fff' : 'transparent', color: squadAxis === 'rel' ? '#008ed3' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer', boxShadow: squadAxis === 'rel' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>% of Normal</button>
              <button onClick={() => setSquadAxis('au')} style={{ padding: '6px 14px', border: 'none', borderRadius: '6px', background: squadAxis === 'au' ? '#fff' : 'transparent', color: squadAxis === 'au' ? '#008ed3' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer', boxShadow: squadAxis === 'au' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Absolute AU</button>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
            Daily load per athlete. Hover a line or name chip to spotlight it; click a chip to open the detail view below.
            {squadAxis === 'rel' ? ' Values are % of each athlete\u2019s typical daily load \u2014 dashed red line marks 150%, the spike threshold.' : ' Values are raw training load in AU.'}
          </p>

          {squadSelection.length === 0 ? (
            <p style={{ color: '#64748b' }}>No athletes selected yet. Go to the Load Engine tab and tick checkboxes beside athlete names, then return here.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {squadComparison.rows.map((a, i) => {
                  const color = SQUAD_COLORS[i % SQUAD_COLORS.length];
                  const isSpot = hoveredAthlete === a.name || drilledAthlete === a.name;
                  const isDrilled = drilledAthlete === a.name;
                  return (
                    <button key={a.name} onMouseEnter={() => setHoveredAthlete(a.name)} onMouseLeave={() => setHoveredAthlete(null)} onClick={() => setDrilledAthlete(isDrilled ? null : a.name)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px', border: isDrilled ? `2px solid ${color}` : '1px solid #e2e8f0', background: isDrilled ? color + '15' : '#fff', color: isSpot ? '#0f172a' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }}></span>
                      {a.name}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: '340px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={squadLineData} onMouseLeave={() => setHoveredAthlete(null)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    {squadAxis === 'rel' && <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />}
                    {squadAxis === 'rel' && <ReferenceLine y={150} stroke="#dc2626" strokeDasharray="4 4" />}
                    {squadComparison.rows.map((a, i) => {
                      const color = SQUAD_COLORS[i % SQUAD_COLORS.length];
                      const isSpot = hoveredAthlete === a.name || drilledAthlete === a.name;
                      return (
                        <Line key={a.name} type="monotone" dataKey={a.name} stroke={isSpot ? color : '#cbd5e1'} strokeWidth={isSpot ? 3 : 1.5} dot={false} activeDot={{ r: 4 }} connectNulls onMouseOver={() => setHoveredAthlete(a.name)} />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {drilledAthlete && drilledAthleteData && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: '14px' }}>{drilledAthleteData.name} — 14-Day Load by Session Type</h4>
                  <div style={{ height: '200px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={drilledAthleteData.chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        {drilledAthleteData.chartTypes.map(t => (
                          <Bar key={t} dataKey={t} stackId="load" fill={TYPE_COLORS[t] || '#64748b'} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <h4 style={{ margin: '16px 0 8px 0', color: '#0f172a', fontSize: '14px' }}>Daily Intensity (Load-Weighted RPE)</h4>
                  <div style={{ height: '60px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={drilledAthleteData.chartData}>
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={false} />
                        <YAxis domain={[0, 10]} hide />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="avgRpe" radius={[3, 3, 0, 0]}>
                          {drilledAthleteData.chartData.map((d, i) => (
                            <Cell key={i} fill={getIntensityColor(d.avgRpe)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <h4 style={{ margin: '16px 0 8px 0', color: '#0f172a', fontSize: '14px' }}>ACWR Trend (Last 14 Days)</h4>
                  <div style={{ height: '80px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={drilledAthleteData.acwrHistory}>
                        <XAxis dataKey="day" hide />
                        <YAxis domain={[0, 2]} hide />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Line type="monotone" dataKey="acwr" stroke="#64748b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* --- TAB 4: TEAM COMPOSITION --- */}
      {activeTab === 'composition' && (
        <div className="cs-card">
          <h2 style={{ fontSize: '18px', color: '#0f172a', margin: '0 0 8px 0', fontWeight: '800' }}>Team Composition</h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
            Aggregated load by session type across all selected athletes. Shows what the squad's week is made of.
          </p>

          {squadSelection.length === 0 ? (
            <p style={{ color: '#64748b' }}>No athletes selected yet. Go to the Load Engine tab and tick checkboxes beside athlete names, then return here.</p>
          ) : squadComparison.teamTotals.length === 0 ? (
            <p style={{ color: '#64748b' }}>Selected athletes have no training data in the last 14 days.</p>
          ) : (
            <>
              <div style={{ height: '240px', width: '100%', marginBottom: '16px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={squadComparison.teamTotals}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    {squadComparison.teamTypes.map(t => (
                      <Bar key={t} dataKey={t} stackId="load" fill={TYPE_COLORS[t] || '#64748b'} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ height: '60px', width: '100%', marginBottom: '16px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={squadComparison.teamTotals}>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={false} />
                    <YAxis domain={[0, 10]} hide />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="avgRpe" radius={[3, 3, 0, 0]}>
                      {squadComparison.teamTotals.map((d, i) => (
                        <Cell key={i} fill={getIntensityColor(d.avgRpe)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                {squadComparison.teamTypes.map(type => (
                  <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: TYPE_COLORS[type] || '#64748b', display: 'inline-block' }}></span>
                    {type}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* --- TAB 2: SESSION AUDIT --- */}
      {activeTab === 'audit' && (
        <div>
          <h2 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '16px' }}>Proposed Session History</h2>
          {loading ? <p style={{ color: '#64748b' }}>Loading sessions...</p> : groupedAuditSessions.length === 0 ? <p style={{ color: '#64748b' }}>No proposed sessions found.</p> : (
            groupedAuditSessions.map((session, i) => {
              const totalAssigned = session.athletes.length;
              const completed = session.athletes.filter(a => a.status !== 'Proposed').length;
              
              return (
                <div key={i} className="audit-card" onClick={() => setSelectedAuditSession(session)}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a' }}>{session.type}</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{session.dateStr} • Goal: {session.proposedLoad} AU</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: completed === totalAssigned ? '#16a34a' : '#f59e0b' }}>
                      {completed} / {totalAssigned} Logged
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Click to view audit</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* --- PROPOSE SESSION MODAL --- */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>Propose Session</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20}/></button>
            </div>
            
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Assign To:
              <button onClick={selectAllAthletes} style={{ background: 'none', border: 'none', color: '#008ed3', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {selectedAthletes.length === roster.length ? 'Deselect All' : 'Select All'}
              </button>
            </label>
            
            <div className="roster-list">
              {roster.map(a => (
                <div key={a.name} className="roster-item" onClick={() => handleToggleAthlete(a.name)}>
                  <input type="checkbox" checked={selectedAthletes.includes(a.name)} readOnly style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                  <span style={{ fontSize: '15px', color: '#0f172a', fontWeight: '500' }}>{a.name}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Date</label>
                <input type="date" className="modal-input" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Type</label>
                 <select className="modal-input" value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
                    <option value="Field Session">Field Session</option>
                    <option value="Competition">Competition</option>
                    <option value="Conditioning">Conditioning</option>
                    <option value="Rehabilitation">Rehabilitation</option>
                    <option value="Recovery">Recovery</option>
                    <option value="Speed / Agility">Speed / Agility</option>
                    <option value="Prehabilitation">Prehabilitation</option>
                    <option value="Other">Other</option>
                 </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Mins</label>
                <input type="number" className="modal-input" value={form.duration} onChange={e=>setForm({...form, duration: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Target RPE</label>
                <input type="number" min="1" max="10" className="modal-input" value={form.rpe} onChange={e=>setForm({...form, rpe: e.target.value})} />
              </div>
            </div>

            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Location / Venue</label>
            <input type="text" className="modal-input" placeholder="e.g. Main Pitch" value={form.location} onChange={e=>setForm({...form, location: e.target.value})} />

            <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Notes / Requirements</label>
            <textarea className="modal-input" placeholder="e.g. Bring cleats and running shoes." value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})} style={{ minHeight: '60px', resize: 'vertical' }} />

            <button onClick={handlePropose} disabled={saving || selectedAthletes.length === 0} style={{ width: '100%', background: '#16a34a', color: 'white', border: 'none', padding: '16px', borderRadius: '8px', fontSize: '16px', fontWeight: '800', cursor: (saving || selectedAthletes.length === 0) ? 'not-allowed' : 'pointer', marginTop: '8px', opacity: selectedAthletes.length === 0 ? 0.5 : 1 }}>
              {saving ? 'SAVING...' : `PROPOSE SESSION (${form.duration * form.rpe} AU)`}
            </button>
          </div>
        </div>
      )}

      {/* --- AUDIT SESSION MODAL --- */}
      {selectedAuditSession && (
        <div className="modal-overlay" onClick={() => setSelectedAuditSession(null)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()} style={{ maxWidth: '600px', padding: 0 }}>
            <div style={{ background: '#0f172a', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>{selectedAuditSession.type}</h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>{selectedAuditSession.dateStr} {selectedAuditSession.location && `• ${selectedAuditSession.location}`}</p>
              </div>
              <button onClick={() => setSelectedAuditSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24}/></button>
            </div>
            
            <div style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Target Load</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>{selectedAuditSession.proposedMins}m @ RPE {selectedAuditSession.proposedRpe} <span style={{ color: '#008ed3' }}>({selectedAuditSession.proposedLoad} AU)</span></span>
            </div>

            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {selectedAuditSession.athletes.map((ath, idx) => {
                let rowBg = '#fff';
                let Icon = null;
                let statusColor = '#94a3b8';
                let statusLabel = 'Missing';
                
                if (ath.status === 'Actual') {
                  Icon = CheckCircle; statusColor = '#16a34a'; statusLabel = 'Completed';
                } else if (ath.status === 'Modified') {
                  Icon = AlertTriangle; statusColor = '#f59e0b'; statusLabel = 'Modified'; rowBg = '#fffbeb';
                } else if (ath.status === 'Injury') {
                  Icon = AlertCircle; statusColor = '#dc2626'; statusLabel = 'Incident / Stopped'; rowBg = '#fef2f2';
                }

                const proposedLoad = selectedAuditSession.proposedLoad;
                const ratio = proposedLoad > 0 ? ath.actualLoad / proposedLoad : 0;
                const deltaAU = ath.actualLoad - proposedLoad;
                const deltaPct = proposedLoad > 0 ? (deltaAU / proposedLoad) * 100 : 0;
                let deltaColor = '#64748b';
                if (deltaPct < -20) deltaColor = '#dc2626';
                else if (deltaPct > 20) deltaColor = '#2563eb';

                return (
                  <div key={idx} style={{ padding: '16px', paddingLeft: '20px', borderBottom: '1px solid #e2e8f0', borderLeft: `4px solid ${statusColor}`, background: rowBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {ath.athlete}
                        {Icon && <span className="audit-status" style={{ color: statusColor, background: `${statusColor}15`, padding: '2px 6px', fontSize: '11px' }}><Icon size={12}/> {statusLabel}</span>}
                      </div>
                      {ath.notes && <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px', fontStyle: 'italic' }}>"{ath.notes}"</div>}
                      {proposedLoad > 0 && ath.status !== 'Proposed' && (
                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: '100%', borderRadius: '3px', background: ratio >= 0.8 && ratio <= 1.2 ? '#16a34a' : ratio < 0.8 ? '#f59e0b' : '#dc2626' }} />
                        </div>
                      )}
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      {ath.status === 'Proposed' ? (
                        <>
                          <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>No Data</span>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>—</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: statusColor }}>{ath.actualLoad} AU</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{ath.actualMins}m @ RPE {ath.actualRpe}</div>
                          <div style={{ fontSize: '12px', color: deltaColor, marginTop: '4px', fontWeight: '600' }}>Δ {deltaAU >= 0 ? '+' : ''}{deltaAU} AU ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(0)}%)</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <HelpButton pageName="Coach Schedule" position="bottom-right" />
    </div>
  );
}
