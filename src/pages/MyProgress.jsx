import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import {
  fetchLogbookByAthlete,
  getAthleteByEmail,
  fetchMyPods,
  fetchEntitledPods,
  fetchWellnessLogs,
  fetchLibrary,
  fetchPrograms,
  getMediaType,
  updateLogbookEntry,
  getLatestMaxes,
  saveAthleteMax,
  fetchCycleLogs,
  fetchAthleteBodyData,
  saveAthleteProfile,
  saveBodyWeight
} from '../api';
import { getCycleContext, PHASE_STATUS, buildCycleChartData } from '../utils/cycleMath';
import {
  ArrowLeft,
  ChevronLeft,
  Dumbbell,
  Clock,
  Activity,
  Smile,
  Zap,
  Moon,
  Utensils,
  Video,
  Image as ImageIcon,
  Pencil,
  X,
  CheckCircle,
  AlertCircle,
  Droplet,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import './my-progress.css';

function normalizeString(str) {
  return String(str || '').toLowerCase().replace(/\./g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getLibraryRowName(lib) {
  if (!lib) return '';
  if (Array.isArray(lib)) return String(lib[0] || '');
  if (typeof lib === 'object') return String(lib.name || '');
  return '';
}
function getLibraryCalcType(lib) {
  if (!lib || !Array.isArray(lib)) return '';
  return String(lib[3] || '').trim();
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

// ===== HELPER FUNCTION FOR METRIC CLASSIFICATION =====
function classifyMetricValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;

  const trimmed = String(value).trim();

  const distMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(m|km)$/i);
  if (distMatch) {
    return { type: 'distance', value: trimmed, label: 'Distance' };
  }

  const secMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*s$/i);
  if (secMatch) {
    return { type: 'time', value: trimmed, label: 'Time' };
  }
  const timeMatch = trimmed.match(/^(\d+):(\d+)$/);
  if (timeMatch) {
    return { type: 'time', value: trimmed, label: 'Time' };
  }

  const numVal = parseFloat(trimmed);
  if (!isNaN(numVal)) {
    return { type: 'reps', value: trimmed, label: 'Reps' };
  }

  return null;
}

const editButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '5px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#64748b',
  fontSize: '11px',
  fontWeight: '700',
  cursor: 'pointer'
};

export default function MyProgress() {
  const { userEmail, athleteName: authAthleteName, role: userRole } = useAuth();
  const navigate = useNavigate();
  const loadedRef = useRef(false);

  // Active Pods & Permissions
  const [activePods, setActivePods] = useState(() => {
    try {
      const lower = (userEmail || '').toLowerCase();
      const raw = localStorage.getItem(`fp_athlete_pods_${lower}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    // v1.5.0: start empty — pods appear once confirmed (granted or bought)
    return [];
  });

  // Corrected fix — looks up athlete_id from auth user
useEffect(() => {
  const fetchFreshPods = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get athlete record first
      const { data: athlete } = await supabase
        .from('athletes')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!athlete) return;

      // v1.5.0: final pods = granted (admin) ∪ purchased (entitlements)
      const podsRes = await fetchMyPods().catch(() => ({ pods: [] }));
      const pods = podsRes.pods || [];
      setActivePods(pods);
      try {
        localStorage.setItem(`fp_athlete_pods_${user.email.toLowerCase()}`, JSON.stringify(pods));
      } catch {}
    } catch (err) {
      console.error('Failed to refresh active_pods:', err);
    } finally {
      setPodsLoaded(true);
    }
  };

  fetchFreshPods();
}, []);

  const hasWellnessPod = activePods.includes('wellness');

  // Active Tab: 'wellness' | 'maxes' | 'history'
  // v1.11.3: always opens on Wellness — athletes without the wellness pod
  // are switched to Metrics once the pods list settles (see sync effect).
  const [activeTab, setActiveTab] = useState('wellness');
  const [podsLoaded, setPodsLoaded] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('Grip');
  // v1.11.3: wellness view modes — 'single' (one metric), 'all' (every line
  // overlaid, pills toggle lines), 'cycle' (cycle reporting pill).
  const [wellnessView, setWellnessView] = useState('single');
  const [allLines, setAllLines] = useState(['grip', 'feeling', 'soreness', 'sleep', 'nutrition']);

  // Data states
  const [, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [athleteName, setAthleteName] = useState(authAthleteName || '');
  const [maxes, setMaxes] = useState([]);

  // ADD 1RM MODAL STATE (athlete self-service)
  const [showMaxModal, setShowMaxModal] = useState(false);
  const [maxExerciseSel, setMaxExerciseSel] = useState('');
  const [maxValueInput, setMaxValueInput] = useState('');
  const [maxDateInput, setMaxDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [maxSaving, setMaxSaving] = useState(false);
  // Exercise picker search (same algorithm as the Exercise Library)
  const [maxSearchQuery, setMaxSearchQuery] = useState('');
  const [debouncedMaxSearch, setDebouncedMaxSearch] = useState('');
  const [showMaxDropdown, setShowMaxDropdown] = useState(false);

  // ADD BW MODAL STATE (v1.9.5, athlete self-service). bodyData holds the
  // athlete's profile (sex/birth_year/height_cm) and latest weight.
  const [showBwModal, setShowBwModal] = useState(false);
  const [bwSaving, setBwSaving] = useState(false);
  const [bwWeight, setBwWeight] = useState('');
  const [bwDate, setBwDate] = useState(new Date().toISOString().split('T')[0]);
  const [bwSex, setBwSex] = useState('');
  const [bwBirthYear, setBwBirthYear] = useState('');
  const [bwHeight, setBwHeight] = useState('');
  const [bodyData, setBodyData] = useState(null);
  const [history, setHistory] = useState([]);
  const [programsData, setProgramsData] = useState([]);
  const [libraryData, setLibraryData] = useState([]);
  const [wellnessLogs, setWellnessLogs] = useState([]);

  // ---- Cycle tracking (v1.6.0, opt-in) — full management lives here ----
  const [cycleLogs, setCycleLogs] = useState([]); // [{ date, kind, id }]

  const loadCycleLogs = async () => {
    try {
      const res = await fetchCycleLogs();
      const rows = (res.data || []).slice(1).filter(r =>
        String(r[1] || '').trim().toLowerCase() === userEmail.toLowerCase() ||
        String(r[2] || '').trim().toLowerCase() === (athleteName || '').toLowerCase()
      );
      setCycleLogs(rows.map(r => ({ date: String(r[0]).split('T')[0], kind: r[3] || 'period_start', id: r[4] })));
    } catch { setCycleLogs([]); }
  };

  useEffect(() => { if (userEmail) loadCycleLogs(); }, [userEmail]);

  const cycleCtx = getCycleContext(cycleLogs.map(c => ({ entryKind: c.kind, entryDate: c.date })));
  const cycleStatusInfo = cycleCtx ? PHASE_STATUS[cycleCtx.status] : null;
  // v1.11.3: reusable cycle reporting block — hormone curve chart + status
  // + warnings + privacy note. Used by the Cycle pill view and the All view.
  const cycleChartBlock = (
    <div>
      {cycleCtx && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 200, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={buildCycleChartData(cycleCtx)} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis domain={[0, 110]} hide />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  labelFormatter={(d) => `Day ${d}`}
                  formatter={(val, name) => [val, { estrogen: 'Estrogen', progesterone: 'Progesterone', testosterone: 'Testosterone' }[name] || name]}
                />
                <ReferenceLine x={cycleCtx.cycleDay} stroke="#0f172a" strokeDasharray="4 4" label={{ value: 'You', position: 'top', fill: '#0f172a', fontSize: 11, fontWeight: 700 }} />
                <Line type="monotone" dataKey="estrogen" stroke="#ec4899" strokeWidth={2.5} dot={false} name="estrogen" />
                <Line type="monotone" dataKey="progesterone" stroke="#8b5cf6" strokeWidth={2.5} dot={false} name="progesterone" />
                <Line type="monotone" dataKey="testosterone" stroke="#f97316" strokeWidth={2} dot={false} name="testosterone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0 0', textAlign: 'center' }}>
            Estrogen <span style={{ color: '#ec4899' }}>—</span> · Progesterone <span style={{ color: '#8b5cf6' }}>—</span> · Testosterone <span style={{ color: '#f97316' }}>—</span> · population-average curves for orientation
          </p>
        </div>
      )}

      {cycleCtx && cycleStatusInfo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: cycleStatusInfo.bg, border: `1px solid ${cycleStatusInfo.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: cycleStatusInfo.color }}>Day {cycleCtx.cycleDay} of ~{Math.round(cycleCtx.cycleLength)} · {cycleStatusInfo.label}</span>
          {!cycleCtx.overdue && !cycleCtx.noCycle && !cycleCtx.missedFlagged && cycleCtx.daysUntilNext != null && (
            <span style={{ fontSize: 12, color: '#64748b' }}>Next predicted start in ~{cycleCtx.daysUntilNext} day{cycleCtx.daysUntilNext === 1 ? '' : 's'}</span>
          )}
        </div>
      )}

      {(cycleCtx?.missedFlagged || cycleCtx?.noCycle || cycleCtx?.irregular) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          {cycleCtx.missedFlagged && <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 6px 0' }}><b>Cycle marked as delayed/absent.</b> In training athletes, missed cycles can signal over-training or low energy availability — worth raising with your coach or a medical professional.</p>}
          {!cycleCtx.missedFlagged && cycleCtx.noCycle && <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 6px 0' }}><b>No period logged in {cycleCtx.cycleDay} days.</b> In training athletes, this can signal over-training or low energy availability — worth raising with your coach or a medical professional.</p>}
          {cycleCtx.irregular && <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>Your logged intervals vary quite a bit — phase estimates are rough. Regular logging makes them sharper.</p>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
        <AlertCircle size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.45 }}>
          Private by design: your coach sees your current phase and a low-hormone indicator — never your dates or notes. Hormone curves are population averages for orientation, not individual measurements.
        </p>
      </div>
    </div>
  );




  const [selectedSession, setSelectedSession] = useState(null);
  const [exerciseFilter, setExerciseFilter] = useState('All');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedMediaMap, setExpandedMediaMap] = useState({});

  // ===== STEP B: EDIT STATE =====
  const [editingSet, setEditingSet] = useState(null); // { exerciseName, setNumber, field, currentValue, metricLabel }
  const [editValueInput, setEditValueInput] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  // Sync tab if user does not have wellness pod
  // v1.11.3: only after the pods list has settled — the pods load async,
  // so an early check would bounce wellness-pod athletes to Metrics.
  useEffect(() => {
    if (podsLoaded && !hasWellnessPod && activeTab === 'wellness') {
      setActiveTab('maxes');
    }
  }, [podsLoaded, hasWellnessPod, activeTab]);

  useEffect(() => {
    if (userEmail && !loadedRef.current) {
      loadedRef.current = true;
      loadData();
    }
  }, [userEmail]);

  // v1.9.5: body data (profile + latest weight) for the Metrics tab —
  // refetches whenever the resolved athlete name settles.
  useEffect(() => {
    let alive = true;
    if (!athleteName) return;
    fetchAthleteBodyData(athleteName)
      .then(res => {
        if (alive && res.status === 'Success') {
          setBodyData({ sex: res.sex, birthYear: res.birthYear, heightCm: res.heightCm, weightKg: res.weightKg, weightDate: res.weightDate });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [athleteName]);


  async function loadData() {
    const cached = localStorage.getItem('fp_progress_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.athleteName) {
          setAthleteName(parsed.athleteName);
          if (Array.isArray(parsed.maxes)) setMaxes(parsed.maxes);
          if (Array.isArray(parsed.history)) {
            setHistory(parsed.history);
            setHistoryLoaded(true);
            setLoading(false);
          }
          if (Array.isArray(parsed.programs)) setProgramsData(parsed.programs);
          if (Array.isArray(parsed.library)) setLibraryData(parsed.library);
          if (Array.isArray(parsed.wellness)) setWellnessLogs(parsed.wellness);
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

      // Resolve the athlete — 2 attempts total
      let athleteResult = { status: 'Error' };
      for (let attempt = 0; attempt < 2; attempt++) {
        const tryRes = await getAthleteByEmail(userEmail).catch(() => ({ status: 'Error' }));
        if (tryRes.status === 'Success') { athleteResult = tryRes; break; }
      }
      let name = authAthleteName || '';
      if (athleteResult.status === 'Success') {
        name = athleteResult.athleteName || athleteResult.name || athleteResult.coachName || name || userEmail.split('@')[0];
      } else if (!name) {
        name = userEmail.split('@')[0];
      }
      setAthleteName(name);

      // Athlete's own row supplies pods (Column L) and core maxes — no roster fetch
      const headers = Array.isArray(athleteResult.headers) ? athleteResult.headers : [];
      const athleteRow = (athleteResult.status === 'Success' && Array.isArray(athleteResult.rowData)) ? athleteResult.rowData : null;

      if (athleteRow) {
        // v1.5.0: union granted pods with purchased pods — no defaults
        const granted = String(athleteRow[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        const entRes = await fetchEntitledPods().catch(() => ({ pods: [] }));
        const pods = Array.from(new Set([...granted, ...(entRes.pods || [])]));
        if (pods.length > 0) {
          setActivePods(pods);
          try {
            localStorage.setItem(`fp_athlete_pods_${lowerEmail}`, JSON.stringify(pods));
          } catch {}
        }
      }

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

      // Refresh maxes from the real athlete_maxes table (source of truth).
      // Legacy profile maxes are only kept for lifts the table doesn't have.
      try {
        const maxesResp = await getLatestMaxes(name);
        if (maxesResp.status === 'Success' && maxesResp.maxes) {
          const merged = [...parsedMaxes];
          Object.entries(maxesResp.maxes).forEach(([n, w]) => {
            const idx = merged.findIndex(m => normalizeString(m.name) === normalizeString(n));
            const entry = { name: n, weight: w };
            if (idx > -1) merged[idx] = entry; else merged.push(entry);
          });
          setMaxes(merged);
        }
      } catch {}

      // History, wellness (filtered server-side), library, programs — all in parallel
      const [logResult, wellnessRes, libRes, progRes] = await Promise.all([
        fetchLogbookByAthlete(name).catch(() => ({ data: [] })),
        fetchWellnessLogs(name, lowerEmail).catch(() => ({ data: [] })),
        fetchLibrary().catch(() => ({ library: [] })),
        fetchPrograms().catch(() => ({ programs: [] }))
      ]);

      const logData = Array.isArray(logResult.data) ? logResult.data : [];
      const formattedHistory = logData.map(item => ({
        date: String(item.date || '').split('T')[0],
        prog: item.prog || '',
        ex: item.ex || '',
        intensity: item.intensity || '',
        wt: (item.wt === null || item.wt === undefined) ? '' : item.wt,
        reps: (item.reps === null || item.reps === undefined) ? '' : item.reps
      }));
      setHistory(formattedHistory);
      setHistoryLoaded(true);
      setLoading(false);

      const programs = Array.isArray(progRes.programs) ? progRes.programs : [];
      const library = (Array.isArray(libRes) && libRes.length) ? libRes : ((libRes && libRes.library) || []);

      setProgramsData(programs);
      setLibraryData(library);

      // Parse Wellness Logs for athlete (client-side filter kept as belt-and-braces)
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

  // Epley-enabled exercises (weight/1RM formula in the library) — the only
  // exercises that can take a manually entered 1RM value. Name + muscle/category
  // are kept so the picker search matches exactly like the Exercise Library.
  const epleyExercises = useMemo(() => {
    return (Array.isArray(libraryData) ? libraryData : [])
      .filter(r => Array.isArray(r) && ['yes', 'weight'].includes(String(r[3] || '').trim().toLowerCase()))
      .map(r => ({
        name: String(r[0] || '').trim(),
        muscle: (r[2] && String(r[2]).trim()) ? String(r[2]).trim() : 'Other'
      }))
      .filter(e => e.name);
  }, [libraryData]);

  // 300ms debounce — same timing as the exercise library
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMaxSearch(maxSearchQuery), 300);
    return () => clearTimeout(t);
  }, [maxSearchQuery]);

  // Multi-token AND search (name OR muscle), exactly like the Exercise Library
  const filteredMaxExercises = useMemo(() => {
    if (debouncedMaxSearch.length < 2) return epleyExercises;
    const tokens = debouncedMaxSearch.toLowerCase().split(/\s+/);
    return epleyExercises.filter(e => {
      const n = e.name.toLowerCase();
      const m = e.muscle.toLowerCase();
      return tokens.every(t => n.includes(t) || m.includes(t));
    });
  }, [debouncedMaxSearch, epleyExercises]);

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

  // ===== PROGRAM-JOIN RECONSTRUCTION (Step A) =====
  const sessionSections = useMemo(() => {
    if (!selectedSession) return [];

    const programDefinitionRows = (Array.isArray(programsData) ? programsData : []).slice(1).filter(
      r => String(r[0] || '').trim() === selectedSession.prog
    );

    // FALLBACK: If program doesn't exist anymore, use logbook-only rendering
    if (programDefinitionRows.length === 0) {
      const exGroups = {};
      history.forEach(item => {
        if (item.prog !== selectedSession.prog) return;
        if (String(item.date || '').split('T')[0] !== String(selectedSession.date || '').split('T')[0]) return;
        const key = normalizeString(item.ex);
        if (!exGroups[key]) {
          exGroups[key] = {
            name: item.ex,
            sets: [],
            phase: null,
            mediaUrl: exerciseMediaMap[key] || ''
          };
        }
        exGroups[key].sets.push(item);
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
        const lookupKey = normalizeString(selectedSession.prog) + '|' + normalizeString(group.name);
        group.phase = phaseLookup[lookupKey] || 'Other Content';
        const phaseTitle = phaseMapping[group.phase?.toLowerCase()] || group.phase;
        const section = sections.find(s => s.title === phaseTitle);
        if (section) section.items.push(group);
      });

      return sections.filter(s => s.items.length > 0);
    }

    // FULL RECONSTRUCTION: Program definition drives the skeleton
    const exGroups = {};
    let orderCounter = 0;

    programDefinitionRows.forEach((row, programOrder) => {
      const phase = String(row[2] || '').trim() || 'Work Block';
      const exName = String(row[3] || '').trim();
      if (!exName) return;

      const key = normalizeString(exName);
      if (!exGroups[key]) {
        const tempo = String(row[7] || '').trim();
        const rest = String(row[8] || '').trim();
        let advanced = null;
        try {
          if (row.length > 13 && row[13]) {
            advanced = JSON.parse(String(row[13]));
          }
        } catch {}

        exGroups[key] = {
          name: exName,
          phase: phase,
          sets: [],
          mediaUrl: exerciseMediaMap[key] || '',
          libraryRow: (Array.isArray(libraryData) ? libraryData.find(lib => normalizeString(getLibraryRowName(lib)) === key) : null) || null,
          programRowIndices: [programOrder],
          order: orderCounter++,
          tempo: tempo,
          rest: rest,
          advanced: advanced
        };
      } else {
        exGroups[key].programRowIndices.push(programOrder);
      }
    });

    // Join logbook data onto program structure
    const sessionLogbookEntries = history.filter(h => h.prog === selectedSession.prog && String(h.date || '').split('T')[0] === String(selectedSession.date || '').split('T')[0]);

    Object.keys(exGroups).forEach(key => {
      const group = exGroups[key];
      const matchingLogEntries = sessionLogbookEntries.filter(h => normalizeString(h.ex) === key);

      if (matchingLogEntries.length === 0) {
        group.hasData = false;
        group.sets = [];
      } else {
        group.sets = matchingLogEntries;
        group.hasData = true;
      }
    });

    const orderedGroupKeys = Object.keys(exGroups).sort((a, b) => exGroups[a].order - exGroups[b].order);

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

    orderedGroupKeys.forEach(key => {
      const group = exGroups[key];
      const phaseTitle = phaseMapping[group.phase?.toLowerCase()] || group.phase;
      const section = sections.find(s => s.title === phaseTitle);
      if (section) section.items.push(group);
    });

    return sections.filter(s => s.items.length > 0);
  }, [selectedSession, sessions, programsData, libraryData, history, exerciseMediaMap, phaseLookup]);

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
      label: 'Dyno',
      unit: 'kg',
      color: '#0284c7',
      icon: Dumbbell,
      description: 'Max handgrip dynamometer peak output'
    },
    Feeling: {
      label: 'Feeling',
      unit: '/10',
      color: '#16a34a',
      icon: Smile,
      description: 'Subjective systemic readiness and energy level'
    },
    Soreness: {
      label: 'Soreness',
      unit: '/10',
      color: '#ea580c',
      icon: Zap,
      description: 'Physical DOMS and localized muscular stiffness'
    },
    Sleep: {
      label: 'Sleep',
      unit: 'hrs',
      color: '#8b5cf6',
      icon: Moon,
      description: 'Total restorative sleep logged overnight'
    },
    Nutrition: {
      label: 'Nutrition',
      unit: '/10',
      color: '#10b981',
      icon: Utensils,
      description: 'Hydration and macro fuel compliance'
    }
  };

  const currentMetricConfig = metricConfigs[selectedMetric] || metricConfigs.Grip;
  const activeMetricKey = selectedMetric.toLowerCase();

  // v1.11.3: pill behaviour per view mode.
  const WELLNESS_LINE_KEYS = ['grip', 'feeling', 'soreness', 'sleep', 'nutrition'];
  function handleAllPill() {
    if (wellnessView === 'all') {
      setWellnessView('single');
      setSelectedMetric('Grip');
    } else {
      setWellnessView('all');
      setAllLines([...WELLNESS_LINE_KEYS]);
    }
  }
  function handleMetricPill(key) {
    if (wellnessView === 'all') {
      const k = key.toLowerCase();
      setAllLines(prev => {
        if (prev.includes(k)) {
          if (prev.length === 1) { showToast('Keep at least one line on the chart.', true); return prev; }
          return prev.filter(x => x !== k);
        }
        return [...prev, k];
      });
    } else {
      setWellnessView('single');
      setSelectedMetric(key);
    }
  }
  function handleCyclePill() {
    setWellnessView(wellnessView === 'cycle' ? 'single' : 'cycle');
  }

  const currentMetricStats = useMemo(() => {
    if (!last7DaysWellness.length) return { avg: null, min: null, max: null, latest: null };
    const key = selectedMetric.toLowerCase();
    const validValues = last7DaysWellness
      .map(d => d[key])
      .filter(v => v !== null && !isNaN(v) && (key === 'soreness' ? v >= 0 : v > 0));

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

  // ===== ADD 1RM HANDLERS (athlete self-service) =====
  async function handleSaveMax() {
    if (!maxExerciseSel) { showToast('Please select an exercise.', true); return; }
    const val = parseFloat(maxValueInput);
    if (!Number.isFinite(val) || val <= 0) { showToast('Please enter a valid 1RM value.', true); return; }
    setMaxSaving(true);
    try {
      const res = await saveAthleteMax(athleteName, maxExerciseSel, val, maxDateInput);
      if (res.status === 'Success') {
        setMaxes(prev => {
          const next = [...prev];
          const idx = next.findIndex(m => normalizeString(m.name) === normalizeString(maxExerciseSel));
          const entry = { name: maxExerciseSel, weight: val };
          if (idx > -1) next[idx] = entry; else next.push(entry);
          return next;
        });
        setShowMaxModal(false);
        setMaxExerciseSel('');
        setMaxValueInput('');
        setMaxSearchQuery('');
        setDebouncedMaxSearch('');
        showToast('1RM saved successfully.');
      } else {
        showToast('Save failed: ' + (res.message || 'Unknown error'), true);
      }
    } catch {
      showToast('Network error. Please try again.', true);
    }
    setMaxSaving(false);
  }

  // ===== ADD BW HANDLER (v1.9.5, athlete self-service) =====
  // First entry must complete the profile: sex is male/female only (product
  // decision — no third option), and without sex/age/height there is no
  // honest BMR, so the energy gauge simply doesn't render until it's set.
  async function handleSaveBw() {
    const kg = parseFloat(bwWeight);
    if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) { showToast('Please enter a valid body weight in kg.', true); return; }
    if (!bwDate) { showToast('Please pick a date.', true); return; }
    // Profile fields are always visible (prefilled from the saved profile), so
    // athletes can also correct sex / birth year / height later. The profile is
    // validated and sent on every save - the athletes-row update is idempotent.
    let profile = null;
    {
      const y = parseInt(bwBirthYear, 10);
      const h = parseFloat(bwHeight);
      if (!bwSex) { showToast('Please select male or female.', true); return; }
      if (!Number.isFinite(y) || y < 1930 || y > 2020) { showToast('Please enter a valid birth year.', true); return; }
      if (!Number.isFinite(h) || h < 100 || h > 250) { showToast('Please enter a valid height in cm.', true); return; }
      profile = { sex: bwSex, birthYear: y, heightCm: h };
    }
    setBwSaving(true);
    try {
      if (profile) {
        const profRes = await saveAthleteProfile(athleteName, profile);
        if (profRes.status !== 'Success') {
          showToast('Could not save profile: ' + (profRes.message || 'Unknown error'), true);
          setBwSaving(false);
          return;
        }
      }
      const res = await saveBodyWeight(athleteName, kg, bwDate);
      if (res.status === 'Success') {
        setBodyData(prev => ({
          sex: profile ? profile.sex : prev?.sex ?? null,
          birthYear: profile ? profile.birthYear : prev?.birthYear ?? null,
          heightCm: profile ? profile.heightCm : prev?.heightCm ?? null,
          weightKg: kg,
          weightDate: bwDate
        }));
        setShowBwModal(false);
        setBwWeight('');
        setBwDate(new Date().toISOString().split('T')[0]);
        showToast('Body weight saved.');
      } else {
        showToast('Save failed: ' + (res.message || 'Unknown error'), true);
      }
    } catch {
      showToast('Network error. Please try again.', true);
    }
    setBwSaving(false);
  }

  // ===== STEP B: EDIT HANDLERS =====
  const openEditModal = (exerciseName, setNumber, field, currentValue, metricLabel) => {
    setEditingSet({ exerciseName, setNumber, field, currentValue, metricLabel });
    setEditValueInput(currentValue === null || currentValue === undefined ? '' : String(currentValue));
    setEditMessage(null);
  };

  const closeEditModal = () => {
    setEditingSet(null);
    setEditValueInput('');
    setEditSaving(false);
    setEditMessage(null);
  };

  async function handleEditSubmit() {
    if (!editingSet || !selectedSession) return;

    const trimmedValue = String(editValueInput).trim() === '' ? '0' : String(editValueInput).trim();
    if (trimmedValue === String(editingSet.currentValue ?? '')) {
      setEditMessage('Value unchanged — nothing to update.');
      return;
    }

    setEditSaving(true);
    setEditMessage(null);

    const result = await updateLogbookEntry({
      athlete: athleteName,
      sessionDate: selectedSession.date,
      program: selectedSession.prog,
      exercise: editingSet.exerciseName,
      setNumber: editingSet.setNumber,
      field: editingSet.field,
      newValue: trimmedValue,
      editorEmail: userEmail,
      editorRole: userRole === 'coach' ? 'coach' : 'athlete'
    });

    setEditSaving(false);

    if (result.status === 'Success') {
      // Update the local history copy so the screen refreshes instantly (no reload)
      const historyCopy = history.map(item => ({ ...item }));
      let matchCount = 0;
      for (let i = 0; i < historyCopy.length; i++) {
        const item = historyCopy[i];
        if (item.date === selectedSession.date &&
            item.prog === selectedSession.prog &&
            normalizeString(item.ex) === normalizeString(editingSet.exerciseName)) {
          matchCount++;
          if (matchCount === editingSet.setNumber) {
            if (editingSet.field === 'weight') item.wt = trimmedValue;
            if (editingSet.field === 'reps') item.reps = trimmedValue;
            break;
          }
        }
      }
      setHistory(historyCopy);
      try {
        const cached = localStorage.getItem('fp_progress_data');
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.history = historyCopy;
          localStorage.setItem('fp_progress_data', JSON.stringify(parsed));
        }
      } catch {}
      closeEditModal();
      showToast('Set updated successfully!');
    } else {
      setEditMessage('Update failed: ' + (result.message || 'Unknown error'));
    }
  }

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
                <Dumbbell size={16} /> Metrics
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
                {/* Metric Selector Chips — v1.11.3: All pill + toggleable lines + Cycle pill */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '8px' }}>
                  <button
                    onClick={handleAllPill}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '999px',
                      border: wellnessView === 'all' ? '2px solid #008ed3' : '1px solid #cbd5e1',
                      background: wellnessView === 'all' ? '#008ed315' : '#ffffff',
                      color: wellnessView === 'all' ? '#008ed3' : '#475569',
                      fontWeight: wellnessView === 'all' ? '800' : '600', fontSize: '13px',
                      cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s ease'
                    }}
                  >
                    <Layers size={15} />
                    <span>All</span>
                  </button>
                  {Object.keys(metricConfigs).map(key => {
                    const conf = metricConfigs[key];
                    const IconComponent = conf.icon;
                    const isSelected = wellnessView === 'all'
                      ? allLines.includes(key.toLowerCase())
                      : (wellnessView === 'single' && selectedMetric === key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleMetricPill(key)}
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
                  {cycleCtx && (
                    <button
                      onClick={handleCyclePill}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '999px',
                        border: wellnessView === 'cycle' ? '2px solid #8b5cf6' : '1px solid #cbd5e1',
                        background: wellnessView === 'cycle' ? '#8b5cf615' : '#ffffff',
                        color: wellnessView === 'cycle' ? '#8b5cf6' : '#475569',
                        fontWeight: wellnessView === 'cycle' ? '800' : '600', fontSize: '13px',
                        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s ease'
                      }}
                    >
                      <Droplet size={15} />
                      <span>Cycle</span>
                    </button>
                  )}
                </div>

                {/* Quick Stat Highlights — v1.11.3: metric bars in single mode,
                    cycle bars in cycle mode, hidden in All mode (mixed units). */}
                {wellnessView === 'single' && (
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
                )}
                {wellnessView === 'cycle' && cycleCtx && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase' }}>Cycle Day</p>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', color: cycleStatusInfo ? cycleStatusInfo.color : '#8b5cf6', margin: '4px 0 0 0' }}>
                      {cycleCtx.cycleDay} <span style={{ fontSize: '14px', color: '#64748b' }}>of ~{Math.round(cycleCtx.cycleLength)}</span>
                    </h3>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase' }}>Phase</p>
                    <h3 style={{ fontSize: '16px', fontWeight: '800', color: cycleStatusInfo ? cycleStatusInfo.color : '#8b5cf6', margin: '8px 0 0 0' }}>
                      {cycleStatusInfo ? cycleStatusInfo.label.split(' — ')[0] : '—'}
                    </h3>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase' }}>Next Predicted Start</p>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#334155', margin: '8px 0 0 0' }}>
                      {cycleCtx.daysUntilNext != null ? `~${cycleCtx.daysUntilNext} days` : '—'}
                    </h3>
                  </div>
                </div>
                )}
                {wellnessView === 'all' && (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 10px 0' }}>
                    All metrics overlaid — tap a pill above to add or remove a line.
                  </p>
                )}

                {/* 7-Day Trendline Recharts Card */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        {wellnessView === 'all' ? 'All Wellness Metrics' : wellnessView === 'cycle' ? 'Menstrual Cycle' : `${currentMetricConfig.label} Trendline`}
                      </h2>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
                        {wellnessView === 'all'
                          ? 'Every metric overlaid on one chart — tap a pill to add or remove lines.'
                          : wellnessView === 'cycle'
                            ? 'Your position in your cycle, relative to population-average hormone curves.'
                            : currentMetricConfig.description}
                      </p>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: wellnessView === 'all' ? '#008ed3' : wellnessView === 'cycle' ? '#8b5cf6' : currentMetricConfig.color, background: wellnessView === 'all' ? '#008ed315' : wellnessView === 'cycle' ? '#8b5cf615' : `${currentMetricConfig.color}15`, padding: '4px 10px', borderRadius: '999px' }}>
                      {wellnessView === 'all' ? 'All Lines' : wellnessView === 'cycle' ? 'Cycle View' : '7-Day Trend'}
                    </span>
                  </div>

                  {wellnessView === 'single' && (last7DaysWellness.length > 0 ? (
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
                  ))}

                  {wellnessView === 'all' && (last7DaysWellness.length > 0 ? (
                    <>
                      <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={last7DaysWellness} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="dateStr" stroke="#94a3b8" fontSize={12} tickLine={false} />
                            <YAxis yAxisId="ten" domain={[0, 10]} hide />
                            <YAxis yAxisId="free" orientation="right" hide />
                            <Tooltip
                              contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                              labelStyle={{ color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                            {WELLNESS_LINE_KEYS.filter(k => allLines.includes(k)).map(k => {
                              const conf = metricConfigs[k.charAt(0).toUpperCase() + k.slice(1)];
                              return (
                                <Line
                                  key={k}
                                  yAxisId={(k === 'grip' || k === 'sleep') ? 'free' : 'ten'}
                                  type="monotone"
                                  dataKey={k}
                                  name={conf.label}
                                  stroke={conf.color}
                                  strokeWidth={3}
                                  dot={{ r: 4, fill: conf.color, stroke: '#ffffff', strokeWidth: 2 }}
                                  activeDot={{ r: 6, fill: conf.color, stroke: '#ffffff', strokeWidth: 2 }}
                                />
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {cycleCtx && (
                        <div style={{ marginTop: '14px' }}>
                          {cycleChartBlock}
                        </div>
                      )}
                    </>
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
                  ))}

                  {wellnessView === 'cycle' && (cycleCtx ? cycleChartBlock : null)}
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
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                              {entry.feeling != null && <span>Feeling: <b style={{ color: '#0f172a' }}>{entry.feeling}/10</b></span>}
                              {entry.soreness != null && <span>Soreness: <b style={{ color: '#0f172a' }}>{entry.soreness}/10</b></span>}
                              {entry.sleep != null && <span>Sleep: <b style={{ color: '#0f172a' }}>{entry.sleep}h</b></span>}
                              {entry.nutrition != null && <span>Nutrition: <b style={{ color: '#0f172a' }}>{entry.nutrition}/10</b></span>}
                            </div>
                          </div>

                          {entry.grip != null && (
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Grip Peak</span>
                              <p style={{ fontSize: '16px', fontWeight: '800', color: '#0284c7', margin: 0 }}>
                                {entry.grip} kg
                              </p>
                            </div>
                          )}
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
                <div className="mp-maxes-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Current Core Maxes</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { setBwDate(new Date().toISOString().split('T')[0]); setBwSex(bodyData?.sex ?? ''); setBwBirthYear(bodyData?.birthYear != null ? String(bodyData.birthYear) : ''); setBwHeight(bodyData?.heightCm != null ? String(bodyData.heightCm) : ''); setShowBwModal(true); }} style={{ background: '#008ed3', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ Add BW</button>
                    <button onClick={() => { setMaxSearchQuery(''); setDebouncedMaxSearch(''); setShowMaxDropdown(false); setShowMaxModal(true); }} style={{ background: '#008ed3', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ Add 1RM</button>
                  </div>
                </div>
                <div className="mp-maxes-grid">
                  {maxes.length === 0 && bodyData?.weightKg == null ? (
                    <p className="mp-placeholder">No metrics recorded yet.</p>
                  ) : (
                    <>
                      {bodyData?.weightKg != null && (
                        <div className="mp-max-item">
                          <div className="mp-max-label">Body Weight</div>
                          <div className="mp-max-value">{bodyData.weightKg} <span className="mp-max-unit">kg</span></div>
                        </div>
                      )}
                      {maxes.map((max, i) => (
                        <div key={i} className="mp-max-item">
                          <div className="mp-max-label">{max.name}</div>
                          <div className="mp-max-value">{max.weight} <span className="mp-max-unit">kg</span></div>
                        </div>
                      ))}
                    </>
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

                                {/* Exercise Header with Program-Fidelity Markers */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                  <h4 style={{ fontSize: '15px', color: '#0f172a', margin: 0, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {group.name}

                                    {/* Superset marker */}
                                    {group.advanced && group.advanced.setType === 'superset' && <span title="Superset">🔗</span>}

                                    {/* Drop set marker */}
                                    {group.advanced && group.advanced.setType === 'drop' && (
                                      <img src="/drop-set-icon.png" alt="Drop Set 📉" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display='none'; e.target.insertAdjacentText('afterend', '📉'); }} />
                                    )}

                                    {/* Unilateral markers */}
                                    {group.advanced && group.advanced.execution === 'uni-both' && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5', color: 'white', fontWeight: '800', fontSize: '10px', width: '16px', height: '16px', borderRadius: '50%' }}>U</span>
                                    )}
                                    {group.advanced && group.advanced.execution === 'uni-left' && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5', color: 'white', fontWeight: '800', fontSize: '10px', width: '16px', height: '16px', borderRadius: '50%' }}>L</span>
                                    )}
                                    {group.advanced && group.advanced.execution === 'uni-right' && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5', color: 'white', fontWeight: '800', fontSize: '10px', width: '16px', height: '16px', borderRadius: '50%' }}>R</span>
                                    )}
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
                                        border: `1px solid ${section.color}`,
                                        background: isMediaOpen ? section.color : `${section.color}10`,
                                        color: isMediaOpen ? '#ffffff' : section.color,
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

                                {/* ===== SET RENDERING LOOP WITH EDIT BUTTONS (Step A + B) ===== */}
                                {group.sets.length > 0 ? (
                                  <div style={{ padding: '8px 12px' }}>
                                    {group.sets.map((set, idx) => {
                                      // Parse the joined reps field
                                      const repsString = String(set.reps || '');
                                      const parts = repsString.split(' | ').filter(Boolean);
                                      const classified = parts.map(part => classifyMetricValue(part));

                                      const intensityPercent = set.intensity ? `@ ${set.intensity}%` : '';

                                      // Determine what metrics this exercise should show (from library configuration)
                                      let showWeight = true, showTime = false, showDistance = false;

                                      if (group.libraryRow) {
                                        const calcType = getLibraryCalcType(group.libraryRow).toLowerCase();

                                        if (calcType === 'weight' || calcType === 'yes' || calcType === '') {
                                          showWeight = true;
                                          showTime = false;
                                          showDistance = false;
                                        } else if (calcType === 'time') {
                                          showWeight = false;
                                          showTime = true;
                                          showDistance = false;
                                        } else if (calcType === 'distance') {
                                          showWeight = false;
                                          showTime = false;
                                          showDistance = true;
                                        }
                                      }

                                      const weightVal = (set.wt === null || set.wt === undefined || String(set.wt).trim() === '') ? '0' : String(set.wt);
                                      const timeVal = classified.find(c => c.type === 'time')?.value || '—';
                                      const distanceVal = classified.find(c => c.type === 'distance')?.value || '—';
                                      const repsVal = classified.find(c => c.type === 'reps' && c.label === 'Reps')?.value || '—';

                                      // Label for the value field edit button, based on metric type
                                      const valueFieldLabel = showTime ? 'Time (as logged)' : (showDistance ? 'Distance (as logged)' : 'Reps / Value (as logged)');

                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            padding: '8px 10px',
                                            borderBottom: idx === group.sets.length - 1 ? 'none' : '1px solid #e2e8f0',
                                            fontSize: '14px'
                                          }}
                                        >
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                              Set {idx + 1}: {set.reps} {intensityPercent}
                                            </div>
                                            {(set.tempo || set.rest || (group.tempo || group.rest)) && (
                                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                                {(set.tempo || group.tempo) && <>Tempo: <span style={{ color: '#008ed3' }}>{set.tempo || group.tempo}</span></>}
                                                {(set.tempo || group.tempo) && (set.rest || group.rest) && ' | '}
                                                {(set.rest || group.rest) && <>Rest: <span style={{ color: '#008ed3' }}>{set.rest || group.rest}</span></>}
                                              </div>
                                            )}
                                          </div>

                                          <div style={{ textAlign: 'right', minWidth: '100px' }}>
                                            {/* Metric lines */}
                                            {showWeight && (
                                              <div style={{ fontWeight: '700', color: '#008ed3', marginBottom: '2px' }}>
                                                {weightVal} <span style={{ color: '#64748b', fontWeight: '400' }}>kg</span>
                                              </div>
                                            )}
                                            {showTime && (
                                              <div style={{ fontWeight: '700', color: '#008ed3', marginBottom: '2px' }}>
                                                {timeVal}
                                              </div>
                                            )}
                                            {showDistance && (
                                              <div style={{ fontWeight: '700', color: '#008ed3', marginBottom: '2px' }}>
                                                {distanceVal}
                                              </div>
                                            )}
                                            {repsVal && repsVal !== '—' && (
                                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                x {repsVal}
                                              </div>
                                            )}

                                            {/* ===== STEP B: EDIT BUTTONS ===== */}
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                                              {showWeight && (
                                                <button
                                                  onClick={() => openEditModal(group.name, idx + 1, 'weight', set.wt, 'Weight (kg)')}
                                                  title="Edit weight for this set"
                                                  style={editButtonStyle}
                                                >
                                                  <Pencil size={11} /> kg
                                                </button>
                                              )}
                                              <button
                                                onClick={() => openEditModal(group.name, idx + 1, 'reps', set.reps, valueFieldLabel)}
                                                title="Edit the logged value for this set"
                                                style={editButtonStyle}
                                              >
                                                <Pencil size={11} /> value
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div style={{ padding: '12px', fontStyle: 'italic', color: '#94a3b8' }}>
                                    No sets logged for this exercise
                                  </div>
                                )}
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

      {/* ===== STEP B: EDIT MODAL ===== */}
      {editingSet && selectedSession && (
        <div
          onClick={() => { if (!editSaving) closeEditModal(); }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '420px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Edit Set</h3>
              <button onClick={() => { if (!editSaving) closeEditModal(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}>
                <X size={22} />
              </button>
            </div>

            <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
              {selectedSession.prog}
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
              {editingSet.exerciseName} — Set {editingSet.setNumber} · Field: {editingSet.metricLabel}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' }}>Current</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#334155' }}>
                  {editingSet.currentValue === '' || editingSet.currentValue === null || editingSet.currentValue === undefined ? '(blank)' : String(editingSet.currentValue)}
                </div>
              </div>
              <div style={{ fontSize: '20px', color: '#94a3b8' }}>→</div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>New</label>
                <input
                  type="text"
                  autoFocus
                  value={editValueInput}
                  onChange={e => setEditValueInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !editSaving) handleEditSubmit(); }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '18px',
                    fontWeight: '700',
                    textAlign: 'center',
                    borderRadius: '8px',
                    border: '2px solid #008ed3',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {editingSet.field === 'reps' && (
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                This is the value exactly as it was saved (e.g. "8" or "45s | 800m"). Enter the corrected version in the same format.
              </p>
            )}

            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#d97706' }}>
              ⚠ Edits are permanent and recorded in the audit log. Corrected values feed into future target-load calculations.
            </p>

            {editMessage && (
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>
                {editMessage}
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { if (!editSaving) closeEditModal(); }}
                disabled={editSaving}
                style={{ flex: 1, padding: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: '700', color: '#475569', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={editSaving}
                style={{ flex: 1, padding: '13px', borderRadius: '8px', border: 'none', background: '#008ed3', color: '#ffffff', fontWeight: '800', cursor: 'pointer' }}
              >
                {editSaving ? 'Saving...' : 'Confirm Edit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD 1RM MODAL (athlete self-service) ===== */}
      {showMaxModal && (
        <div onClick={() => { if (!maxSaving) setShowMaxModal(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ fontSize: '18px', color: '#0f172a', fontWeight: '800', margin: 0 }}>Add 1RM</h3>
              <button onClick={() => { if (!maxSaving) setShowMaxModal(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#d97706' }}>
              The 1RM is used by the Epley formula to calculate loads in the Program Viewer for 1RM (weight) exercises.
            </p>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>
              Exercise (1RM enabled)
            </label>
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <input
                type="text"
                value={maxSearchQuery}
                onChange={(e) => { setMaxSearchQuery(e.target.value); setMaxExerciseSel(''); setShowMaxDropdown(true); }}
                onFocus={() => setShowMaxDropdown(true)}
                onBlur={() => setShowMaxDropdown(false)}
                autoComplete="off"
                placeholder="Type to search exercises..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
              {showMaxDropdown && (
                <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, margin: '4px 0 0 0', padding: '4px 0', listStyle: 'none', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto', zIndex: 10 }}>
                  {filteredMaxExercises.length === 0 ? (
                    <li style={{ padding: '10px 12px', color: '#64748b', fontSize: '14px' }}>No exercises found.</li>
                  ) : (
                    filteredMaxExercises.map((ex) => (
                      <li
                        key={ex.name}
                        onMouseDown={(e) => { e.preventDefault(); setMaxExerciseSel(ex.name); setMaxSearchQuery(ex.name); setShowMaxDropdown(false); }}
                        style={{ padding: '10px 12px', fontSize: '14px', color: '#0f172a', cursor: 'pointer' }}
                      >
                        {ex.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            {maxExerciseSel && maxes.some(m => normalizeString(m.name) === normalizeString(maxExerciseSel)) && (
              <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: '700', margin: '-8px 0 14px 0' }}>
                Current: {maxes.find(m => normalizeString(m.name) === normalizeString(maxExerciseSel)).weight} kg
              </p>
            )}
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>1RM (kg)</label>
            <input type="number" min="0" step="0.5" value={maxValueInput} onChange={(e) => setMaxValueInput(e.target.value)} placeholder="e.g. 120" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '14px', fontSize: '14px' }} />
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>Date</label>
            <input type="date" value={maxDateInput} onChange={(e) => setMaxDateInput(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '20px', fontSize: '14px' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { if (!maxSaving) setShowMaxModal(false); }} disabled={maxSaving} style={{ flex: 1, padding: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: '700', color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSaveMax} disabled={maxSaving} style={{ flex: 1, padding: '13px', borderRadius: '8px', border: 'none', background: '#008ed3', color: '#ffffff', fontWeight: '800', cursor: maxSaving ? 'wait' : 'pointer' }}>
                {maxSaving ? 'Saving...' : 'Save 1RM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD BW MODAL (v1.9.5, athlete self-service) ===== */}
      {showBwModal && (
        <div onClick={() => { if (!bwSaving) setShowBwModal(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ fontSize: '18px', color: '#0f172a', fontWeight: '800', margin: 0 }}>Add Body Weight</h3>
              <button onClick={() => { if (!bwSaving) setShowBwModal(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#d97706' }}>
              Your weight feeds the energy-balance view on the Nutrition page. Coaches of your team can see your weight — that's expected.
            </p>
            <>
                <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  These feed your daily energy needs on the Nutrition page. Only sex, birth year and height are stored - you can update them anytime.
                </p>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Sex</label>
                <select
                  value={bwSex}
                  onChange={(e) => setBwSex(e.target.value)}
                  disabled={bwSaving}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginBottom: '12px', background: '#fff' }}
                >
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Birth year</label>
                <input
                  type="number"
                  value={bwBirthYear}
                  onChange={(e) => setBwBirthYear(e.target.value)}
                  disabled={bwSaving}
                  placeholder="e.g. 2001"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginBottom: '12px' }}
                />
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Height (cm)</label>
                <input
                  type="number"
                  value={bwHeight}
                  onChange={(e) => setBwHeight(e.target.value)}
                  disabled={bwSaving}
                  placeholder="e.g. 180"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginBottom: '12px' }}
                />
            </>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Body weight (kg)</label>
            <input
              type="number"
              value={bwWeight}
              onChange={(e) => setBwWeight(e.target.value)}
              disabled={bwSaving}
              placeholder="e.g. 72.5"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginBottom: '12px' }}
            />
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Date</label>
            <input
              type="date"
              value={bwDate}
              onChange={(e) => setBwDate(e.target.value)}
              disabled={bwSaving}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { if (!bwSaving) setShowBwModal(false); }}
                disabled={bwSaving}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#f1f5f9', color: '#334155', border: 'none', fontSize: '14px', fontWeight: 600, cursor: bwSaving ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBw}
                disabled={bwSaving}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: bwSaving ? '#94a3b8' : '#008ed3', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, cursor: bwSaving ? 'not-allowed' : 'pointer' }}
              >
                {bwSaving ? 'Saving...' : 'Save Weight'}
              </button>
            </div>
          </div>
        </div>
      )}
      <HelpButton pageName="My Progress" position="bottom-right" />
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: toast.isError ? '#dc2626' : '#16a34a',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '14px',
          fontWeight: '700',
          zIndex: 10000,
          animation: 'fadeIn 0.3s ease-out'
        }}>
          {toast.isError ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}