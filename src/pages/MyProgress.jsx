import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import {
  fetchAllData,
  fetchAthletes,
  fetchLogbookByAthlete,
  getAthleteByEmail,
  fetchWellnessLogs,
  fetchLibrary,
  getMediaType
} from '../api';
import {
  ArrowLeft,
  ChevronLeft,
  Dumbbell,
  Clock,
  Activity,
  Award,
  Smile,
  Zap,
  Moon,
  Utensils,
  Video,
  Image as ImageIcon
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import './my-progress.css';

function normalizeString(str) {
  return String(str || '').toLowerCase().replace(/\./g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getYouTubeId(url) {
  if (!url) return null;
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
  return match ? match[1] : null;
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

export default function MyProgress() {
  const { userEmail, athleteName: authAthleteName } = useAuth();
  const navigate = useNavigate();
  const loadedRef = useRef(false);

  // Active Pods & Permissions
  const [activePods, setActivePods] = useState(() => {
    try {
      const lower = (userEmail || '').toLowerCase();
      const raw = localStorage.getItem(`fp_athlete_pods_${lower}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return ['wellness', 'medical', 'schedule'];
  });

  const hasWellnessPod = activePods.includes('wellness');

  // Active Tab: 'wellness' | 'maxes' | 'history'
  const [activeTab, setActiveTab] = useState(() => (hasWellnessPod ? 'wellness' : 'maxes'));
  const [selectedMetric, setSelectedMetric] = useState('Grip'); // 'Grip' | 'Feeling' | 'Soreness' | 'Sleep' | 'Nutrition'

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [athleteName, setAthleteName] = useState(authAthleteName || '');
  const [maxes, setMaxes] = useState([]);
  const [history, setHistory] = useState([]);
  const [programsData, setProgramsData] = useState([]);
  const [libraryData, setLibraryData] = useState([]);
  const [wellnessLogs, setWellnessLogs] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [exerciseFilter, setExerciseFilter] = useState('All');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedMediaMap, setExpandedMediaMap] = useState({});

  // Sync tab if user does not have wellness pod
  useEffect(() => {
    if (!hasWellnessPod && activeTab === 'wellness') {
      setActiveTab('maxes');
    }
  }, [hasWellnessPod, activeTab]);

  useEffect(() => {
    if (userEmail && !loadedRef.current) {
      loadedRef.current = true;
      loadData();
    }
  }, [userEmail]);

  async function loadData() {
    const cached = localStorage.getItem('fp_progress_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.athleteName) {
          setAthleteName(parsed.athleteName);
          if (parsed.maxes) setMaxes(parsed.maxes);
          if (parsed.history) {
            setHistory(parsed.history);
            setHistoryLoaded(true);
            setLoading(false);
          }
          if (parsed.programs) setProgramsData(parsed.programs);
          if (parsed.library) setLibraryData(parsed.library);
          if (parsed.wellness) setWellnessLogs(parsed.wellness);
        }
      } catch {}
    }

    try {
      if (!userEmail) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const lowerEmail = userEmail.toLowerCase().trim();

      // Resolve athlete name
      const athleteResult = await getAthleteByEmail(userEmail).catch(() => ({}));
      let name = authAthleteName || '';
      if (athleteResult && athleteResult.status === 'Success') {
        name = athleteResult.athleteName || athleteResult.name || athleteResult.coachName || name || userEmail.split('@')[0];
      } else if (!name) {
        name = userEmail.split('@')[0];
      }
      setAthleteName(name);

      // Fetch Logbook history
      const logResult = await fetchLogbookByAthlete(name).catch(() => ({ data: [] }));
      const logData = logResult.data || [];
      const formattedHistory = logData.map(item => ({
        date: String(item.date || '').split('T')[0],
        prog: item.prog || '',
        ex: item.ex || '',
        intensity: item.intensity || '',
        wt: item.wt || '',
        reps: item.reps || ''
      }));
      setHistory(formattedHistory);
      setHistoryLoaded(true);
      setLoading(false);

      // Fetch all supplemental data (Athletes, Programs, Library, Wellness) in parallel
      const [allData, wellnessRes, libRes] = await Promise.all([
        fetchAllData().catch(() => ({ athletes: [], programs: [], library: [] })),
        fetchWellnessLogs().catch(() => ({ data: [] })),
        fetchLibrary().catch(() => ({ library: [] }))
      ]);

      const athletes = allData.athletes || [];
      const programs = allData.programs || [];
      const library = (Array.isArray(libRes) && libRes.length) ? libRes : (libRes.library || allData.library || []);

      setProgramsData(programs);
      setLibraryData(library);

      // Match athlete in sheet for Column L pods & Column Maxes
      let athleteRow = null;
      let headers = athletes[0] || [];

      for (let i = 1; i < athletes.length; i++) {
        const row = athletes[i];
        if (!row) continue;
        const rowName = String(row[0] || '').trim();
        const rowEmail = String(row[9] || '').trim().toLowerCase();
        if (rowEmail === lowerEmail || (name && rowName.toLowerCase() === name.toLowerCase())) {
          athleteRow = row;
          if (!name) name = rowName;
          break;
        }
      }

      if (athleteRow) {
        const pods = String(athleteRow[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if (pods.length > 0) {
          setActivePods(pods);
          try {
            localStorage.setItem(`fp_athlete_pods_${lowerEmail}`, JSON.stringify(pods));
          } catch {}
        }
      }

      // Parse Core Maxes from athlete row
      const parsedMaxes = [];
      if (athleteRow && headers.length) {
        const skipCols = ['pin', 'email', 'role', 'coach', 'notes', 'phone', 'password', 'program assignment', 'pods'];
        for (let c = 1; c < headers.length; c++) {
          const liftName = String(headers[c] || '').trim();
          if (!liftName || skipCols.includes(liftName.toLowerCase())) continue;
          const liftWeight = parseFloat(athleteRow[c]);
          if (!isNaN(liftWeight) && liftWeight > 0) {
            parsedMaxes.push({ name: liftName, weight: liftWeight });
          }
        }
      }
      setMaxes(parsedMaxes);

      // Parse Wellness Logs for athlete
      const rawWellness = wellnessRes.data || [];
      let myWellness = [];
      if (rawWellness.length > 1) {
        const normName = name.toLowerCase().trim();
        for (let i = 1; i < rawWellness.length; i++) {
          const r = rawWellness[i];
          if (!r || !r[0]) continue;
          const rEmail = String(r[1] || '').trim().toLowerCase();
          const rName = String(r[2] || '').trim().toLowerCase();

          if (rEmail === lowerEmail || (normName && rName === normName)) {
            const rawDate = new Date(r[0]);
            if (!isNaN(rawDate.getTime())) {
              const gripVal = r[3] !== '' && r[3] !== null && !isNaN(Number(r[3])) ? Number(r[3]) : null;
              const feelingVal = r[4] !== '' && r[4] !== null && !isNaN(Number(r[4])) ? Number(r[4]) : null;
              const sorenessVal = r[5] !== '' && r[5] !== null && !isNaN(Number(r[5])) ? Number(r[5]) : null;
              const sleepVal = r[6] !== '' && r[6] !== null && !isNaN(Number(r[6])) ? Number(r[6]) : null;
              const nutritionVal = r[7] !== '' && r[7] !== null && !isNaN(Number(r[7])) ? Number(r[7]) : null;

              myWellness.push({
                rawDate,
                dateStr: rawDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                fullDateStr: rawDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                grip: gripVal,
                feeling: feelingVal,
                soreness: sorenessVal,
                sleep: sleepVal,
                nutrition: nutritionVal
              });
            }
          }
        }
        myWellness.sort((a, b) => a.rawDate - b.rawDate);
      }
      setWellnessLogs(myWellness);

      // Cache locally
      try {
        localStorage.setItem('fp_progress_data', JSON.stringify({
          email: userEmail,
          athleteName: name,
          maxes: parsedMaxes,
          history: formattedHistory,
          programs: programs,
          library: library,
          wellness: myWellness,
          cachedAt: new Date().toISOString()
        }));
      } catch {}

    } catch (err) {
      console.warn("MyProgress load warning:", err);
      setError('Failed to load progress data. Please refresh.');
      setLoading(false);
    }
  }

  // Build Media Map for exercise demos
  const exerciseMediaMap = useMemo(() => {
    const map = {};
    if (Array.isArray(libraryData)) {
      libraryData.forEach(item => {
        let name = '';
        let url = '';
        if (typeof item === 'object' && item.name) {
          name = item.name;
          url = item.rawUrl || item.url || '';
        } else if (Array.isArray(item)) {
          name = item[0] || '';
          url = item[1] || '';
        }
        if (name) {
          map[normalizeString(name)] = extractMediaUrl(url);
        }
      });
    }
    return map;
  }, [libraryData]);

  // Group history items into sessions
  const sessions = useMemo(() => {
    const map = {};
    history.forEach(item => {
      const key = item.date + '|' + item.prog;
      if (!map[key]) map[key] = { date: item.date, prog: item.prog, sets: [] };
      map[key].sets.push(item);
    });
    return Object.values(map).sort((a, b) => {
      if (a.date === b.date) return b.prog.localeCompare(a.prog);
      return b.date.localeCompare(a.date);
    });
  }, [history]);

  // Phase lookup map from programs data
  const phaseLookup = useMemo(() => {
    const lookup = {};
    if (!programsData.length) return lookup;
    for (let i = 1; i < programsData.length; i++) {
      const row = programsData[i];
      const progName = String(row[0] || '').trim();
      const phase = String(row[2] || '').trim() || 'Work Block';
      const exName = String(row[3] || '').trim();
      if (progName && exName) {
        const key = normalizeString(progName) + '|' + normalizeString(exName);
        if (!lookup[key]) lookup[key] = phase;
      }
    }
    return lookup;
  }, [programsData]);

  // Build structured Phase sections for selectedSession
  const sessionSections = useMemo(() => {
    if (!selectedSession) return [];
    const session = sessions.find(s => s.date === selectedSession.date && s.prog === selectedSession.prog);
    if (!session) return [];

    const exGroups = {};
    session.sets.forEach(set => {
      const key = normalizeString(set.ex);
      if (!exGroups[key]) {
        exGroups[key] = {
          name: set.ex,
          sets: [],
          phase: null,
          mediaUrl: exerciseMediaMap[key] || ''
        };
      }
      exGroups[key].sets.push(set);
    });

    Object.values(exGroups).forEach(group => {
      const lookupKey = normalizeString(selectedSession.prog) + '|' + normalizeString(group.name);
      group.phase = phaseLookup[lookupKey] || 'Other Content';
    });

    const sections = [
      { title: 'Warm Up', items: [], color: '#fd7e14' },
      { title: 'Work Block', items: [], color: '#22c55e' },
      { title: 'Other Content', items: [], color: '#888888' },
      { title: 'Cool Down', items: [], color: '#ef4444' },
    ];

    const phaseMapping = {
      'warm up': 'Warm Up', 'warmup': 'Warm Up',
      'work block': 'Work Block', 'workblock': 'Work Block',
      'cool down': 'Cool Down', 'cooldown': 'Cool Down'
    };

    Object.values(exGroups).forEach(group => {
      const phaseTitle = phaseMapping[group.phase?.toLowerCase()] || group.phase;
      const section = sections.find(s => s.title === phaseTitle);
      if (section) section.items.push(group);
    });

    return sections.filter(s => s.items.length > 0);
  }, [selectedSession, sessions, phaseLookup, programsData, exerciseMediaMap]);

  const uniqueExercises = useMemo(() => {
    return [...new Set(history.map(h => h.ex).filter(Boolean))].sort();
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (exerciseFilter === 'All') return history;
    return history.filter(h => h.ex === exerciseFilter);
  }, [history, exerciseFilter]);

  // Wellness Configurations & Metrics
  const last7DaysWellness = useMemo(() => {
    if (!wellnessLogs.length) return [];
    return wellnessLogs.slice(-7);
  }, [wellnessLogs]);

  const metricConfigs = {
    Grip: {
      label: 'Grip Strength',
      unit: 'kg',
      color: '#0284c7',
      icon: Dumbbell,
      description: 'Max handgrip dynamometer peak output'
    },
    Feeling: {
      label: 'Overall Feeling',
      unit: '/10',
      color: '#16a34a',
      icon: Smile,
      description: 'Subjective systemic readiness and energy level'
    },
    Soreness: {
      label: 'Muscle Soreness',
      unit: '/10',
      color: '#ea580c',
      icon: Zap,
      description: 'Physical DOMS and localized muscular stiffness'
    },
    Sleep: {
      label: 'Sleep Duration',
      unit: 'hrs',
      color: '#8b5cf6',
      icon: Moon,
      description: 'Total restorative sleep logged overnight'
    },
    Nutrition: {
      label: 'Nutrition & Fuel',
      unit: '/10',
      color: '#10b981',
      icon: Utensils,
      description: 'Hydration and macro fuel compliance'
    }
  };

  const currentMetricConfig = metricConfigs[selectedMetric] || metricConfigs.Grip;
  const activeMetricKey = selectedMetric.toLowerCase();

  const currentMetricStats = useMemo(() => {
    if (!last7DaysWellness.length) return { avg: null, min: null, max: null, latest: null };
    const key = selectedMetric.toLowerCase();
    const validValues = last7DaysWellness
      .map(d => d[key])
      .filter(v => v !== null && !isNaN(v) && v > 0);

    if (!validValues.length) return { avg: null, min: null, max: null, latest: null };

    const sum = validValues.reduce((acc, v) => acc + v, 0);
    const avg = (sum / validValues.length).toFixed(1);
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const latest = validValues[validValues.length - 1];

    return { avg, min, max, latest };
  }, [last7DaysWellness, selectedMetric]);

  const toggleMedia = (key) => {
    setExpandedMediaMap(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="mp-container">
      <div className="mp-body">
        
        {/* Standard App Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px', padding: 0 }}
            title="Back"
          >
            <ArrowLeft size={28} />
          </button>
          <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            My Progress
          </h2>
        </div>

        {error ? (
          <p className="mp-error">{error}</p>
        ) : (
          <>
            {/* Tabs */}
            <div className="mp-tabs">
              {hasWellnessPod && (
                <button
                  className={`mp-tab ${activeTab === 'wellness' ? 'active' : ''}`}
                  onClick={() => setActiveTab('wellness')}
                >
                  <Activity size={16} /> Wellness
                </button>
              )}
              <button
                className={`mp-tab ${activeTab === 'maxes' ? 'active' : ''}`}
                onClick={() => setActiveTab('maxes')}
              >
                <Dumbbell size={16} /> Metrics (1RM)
              </button>
              <button
                className={`mp-tab ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                <Clock size={16} /> History Vault
              </button>
            </div>

            {/* TAB 1: WELLNESS */}
            {activeTab === 'wellness' && hasWellnessPod && (
              <div>
                {/* Metric Selector Chips */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '8px' }}>
                  {Object.keys(metricConfigs).map(key => {
                    const conf = metricConfigs[key];
                    const IconComponent = conf.icon;
                    const isSelected = selectedMetric === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedMetric(key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          borderRadius: '999px',
                          border: isSelected ? `2px solid ${conf.color}` : '1px solid #cbd5e1',
                          background: isSelected ? `${conf.color}15` : '#ffffff',
                          color: isSelected ? conf.color : '#475569',
                          fontWeight: isSelected ? '800' : '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <IconComponent size={15} />
                        <span>{conf.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Stat Highlights */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase' }}>7-Day Average</p>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', color: currentMetricConfig.color, margin: '4px 0 0 0' }}>
                      {currentMetricStats.avg !== null ? `${currentMetricStats.avg} ${currentMetricConfig.unit}` : '—'}
                    </h3>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase' }}>Latest Log</p>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '4px 0 0 0' }}>
                      {currentMetricStats.latest !== null ? `${currentMetricStats.latest} ${currentMetricConfig.unit}` : '—'}
                    </h3>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase' }}>7-Day Range</p>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#334155', margin: '8px 0 0 0' }}>
                      {currentMetricStats.min !== null && currentMetricStats.max !== null
                        ? `${currentMetricStats.min} - ${currentMetricStats.max} ${currentMetricConfig.unit}`
                        : '—'}
                    </h3>
                  </div>
                </div>

                {/* 7-Day Trendline Recharts Card */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        {currentMetricConfig.label} Trendline
                      </h2>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
                        {currentMetricConfig.description}
                      </p>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: currentMetricConfig.color, background: `${currentMetricConfig.color}15`, padding: '4px 10px', borderRadius: '999px' }}>
                      7-Day Trend
                    </span>
                  </div>

                  {last7DaysWellness.length > 0 ? (
                    <div style={{ width: '100%', height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={last7DaysWellness} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="dateStr" stroke="#94a3b8" fontSize={12} tickLine={false} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={12}
                            domain={[
                              (dataMin) => Math.max(0, Math.floor(dataMin * 0.9)),
                              (dataMax) => Math.ceil(dataMax * 1.1)
                            ]}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                            labelStyle={{ color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}
                            formatter={(val) => [`${val} ${currentMetricConfig.unit}`, currentMetricConfig.label]}
                          />
                          {currentMetricStats.avg && (
                            <ReferenceLine
                              y={Number(currentMetricStats.avg)}
                              stroke="#cbd5e1"
                              strokeDasharray="4 4"
                              label={{ value: 'Avg', position: 'insideRight', fill: '#94a3b8', fontSize: 11 }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey={activeMetricKey}
                            name={currentMetricConfig.label}
                            stroke={currentMetricConfig.color}
                            strokeWidth={3}
                            dot={{ r: 5, fill: currentMetricConfig.color, stroke: '#ffffff', strokeWidth: 2 }}
                            activeDot={{ r: 7, fill: currentMetricConfig.color, stroke: '#ffffff', strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px' }}>
                      <Activity size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: 0 }}>
                        No wellness logs recorded yet in the last 7 days.
                      </p>
                      <button
                        onClick={() => navigate('/athlete-wellness')}
                        style={{ marginTop: '12px', background: '#008ed3', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
                      >
                        Log Today's Wellness
                      </button>
                    </div>
                  )}
                </div>

                {/* 7-Day Log Summary Table */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: '0 0 14px 0' }}>
                    Recent Wellness Entries
                  </h3>

                  {last7DaysWellness.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[...last7DaysWellness].reverse().map((entry, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            background: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{entry.fullDateStr}</span>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                              <span>Feeling: <b style={{ color: '#0f172a' }}>{entry.feeling || '—'}/10</b></span>
                              <span>Soreness: <b style={{ color: '#0f172a' }}>{entry.soreness || '—'}/10</b></span>
                              <span>Sleep: <b style={{ color: '#0f172a' }}>{entry.sleep ? `${entry.sleep}h` : '—'}</b></span>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Grip Peak</span>
                            <p style={{ fontSize: '16px', fontWeight: '800', color: '#0284c7', margin: 0 }}>
                              {entry.grip ? `${entry.grip} kg` : '—'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                      No recent wellness entries found.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: METRICS (1RM) */}
            {activeTab === 'maxes' && (
              <div className="mp-maxes-card">
                <div className="mp-maxes-header">Current Core Maxes</div>
                <div className="mp-maxes-grid">
                  {maxes.length === 0 ? (
                    <p className="mp-placeholder">No metrics recorded yet.</p>
                  ) : (
                    maxes.map((max, i) => (
                      <div key={i} className="mp-max-item">
                        <div className="mp-max-label">{max.name}</div>
                        <div className="mp-max-value">{max.weight} <span className="mp-max-unit">kg</span></div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: HISTORY VAULT */}
            {activeTab === 'history' && (
              <div className="mp-history-card">
                {selectedSession ? (
                  <>
                    <div
                      onClick={() => setSelectedSession(null)}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '16px',
                        color: '#008ed3',
                        fontWeight: '600',
                        fontSize: '15px'
                      }}
                    >
                      <ChevronLeft size={18} /> Back to Sessions
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '20px', color: '#0f172a', fontWeight: '800', marginBottom: '4px' }}>
                        {selectedSession.prog}
                      </h3>
                      <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                        Completed: {selectedSession.date}
                      </p>
                    </div>

                    {sessionSections.map(section => (
                      <div
                        key={section.title}
                        className="pv-phase-card"
                        style={{
                          borderTopColor: section.color,
                          borderTopStyle: 'solid',
                          borderTopWidth: '4px',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          marginBottom: '20px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderTop: `4px solid ${section.color}`
                        }}
                      >
                        <div
                          className="pv-phase-header"
                          style={{
                            backgroundColor: section.color,
                            color: '#fff',
                            padding: '8px 16px',
                            fontWeight: '700',
                            fontSize: '15px'
                          }}
                        >
                          {section.title}
                        </div>

                        <div style={{ padding: '14px' }}>
                          {section.items.map((group, gIdx) => {
                            const mediaKey = `${section.title}_${group.name}_${gIdx}`;
                            const hasMedia = Boolean(group.mediaUrl);
                            const isMediaOpen = Boolean(expandedMediaMap[mediaKey]);
                            const isImage = group.mediaUrl && (group.mediaUrl.toLowerCase().includes('.png') || group.mediaUrl.toLowerCase().includes('.jpg'));
                            const ytId = getYouTubeId(group.mediaUrl);

                            return (
                              <div key={group.name} style={{ marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                
                                {/* Exercise Header with Optional Media Toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                  <h4 style={{ fontSize: '15px', color: '#0f172a', margin: 0, fontWeight: '700' }}>
                                    {group.name}
                                  </h4>

                                  {hasMedia && (
                                    <button
                                      onClick={() => toggleMedia(mediaKey)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #008ed3',
                                        background: isMediaOpen ? '#008ed3' : '#008ed310',
                                        color: isMediaOpen ? '#ffffff' : '#008ed3',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      {isImage ? <ImageIcon size={13} /> : <Video size={13} />}
                                      <span>{isMediaOpen ? 'Hide Media' : 'Media'}</span>
                                    </button>
                                  )}
                                </div>

                                {/* Media Player */}
                                {hasMedia && isMediaOpen && (
                                  <div style={{ padding: '12px', background: '#000000', borderBottom: '1px solid #e2e8f0' }}>
                                    {ytId ? (
                                      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '6px' }}>
                                        <iframe
                                          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
                                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                                          allowFullScreen
                                          title={group.name}
                                        />
                                      </div>
                                    ) : isImage ? (
                                      <img src={group.mediaUrl} alt={group.name} style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '6px' }} />
                                    ) : getMediaType(group.mediaUrl) === 'audio' ? (
                                      <audio src={group.mediaUrl} controls preload="metadata" style={{ width: '100%' }} />
                                    ) : (
                                      <video controls playsInline preload="metadata" style={{ width: '100%', borderRadius: '6px', maxHeight: '350px' }}>
                                        <source src={group.mediaUrl} type="video/mp4" />
                                      </video>
                                    )}
                                  </div>
                                )}

                                {/* Sets */}
                                <div style={{ padding: '8px 12px' }}>
                                  {group.sets.map((set, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px 10px',
                                        borderBottom: idx === group.sets.length - 1 ? 'none' : '1px solid #e2e8f0',
                                        fontSize: '14px'
                                      }}
                                    >
                                      <div>
                                        <strong style={{ color: '#475569' }}>Set {idx + 1}:</strong> {set.reps} reps {set.intensity ? '@ ' + set.intensity + '%' : ''}
                                      </div>
                                      <div style={{ fontWeight: '700', color: '#008ed3' }}>
                                        {set.wt}kg x {set.reps}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', color: '#0f172a', fontWeight: '800', marginBottom: '12px' }}>
                        Past Sessions
                      </h3>

                      {!historyLoaded ? (
                        <p className="mp-placeholder">Loading sessions...</p>
                      ) : sessions.length === 0 ? (
                        <p className="mp-placeholder">No sessions recorded yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {sessions.map((session, i) => (
                            <div
                              key={i}
                              onClick={() => setSelectedSession(session)}
                              style={{
                                cursor: 'pointer',
                                padding: '14px 16px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#ffffff',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#008ed3';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,142,211,0.1)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>{session.prog}</div>
                                <div style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{session.date} | {session.sets.length} sets</div>
                              </div>
                              <Clock size={18} color="#008ed3" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />

                    <label className="mp-filter-label">Filter Past Workouts:</label>
                    <select
                      className="mp-filter-select"
                      value={exerciseFilter}
                      onChange={e => setExerciseFilter(e.target.value)}
                    >
                      <option value="All">All Movements</option>
                      {uniqueExercises.map(ex => (
                        <option key={ex} value={ex}>{ex}</option>
                      ))}
                    </select>

                    <div className="mp-history-list">
                      {filteredHistory.length === 0 ? (
                        <p className="mp-placeholder">No records found.</p>
                      ) : (
                        filteredHistory.map((item, i) => (
                          <div key={i} className="mp-history-item">
                            <div>
                              <div className="mp-hist-date">
                                {item.date} | <span className="mp-hist-prog">{item.prog}</span>
                              </div>
                              <div className="mp-hist-ex">{item.ex}</div>
                            </div>
                            <div>
                              <div className="mp-hist-weight">
                                {item.wt} <span className="mp-max-unit">kg</span>
                              </div>
                              <div className="mp-hist-reps">x {item.reps} reps</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <HelpButton pageName="My Progress" position="bottom-right" />
    </div>
  );
}
