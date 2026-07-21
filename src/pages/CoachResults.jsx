import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchAllData, fetchLogbookByAthlete } from '../api.js';

const COLORS = {
  primaryBlue: '#008ed3',
  darkText: '#333',
  bodyGray: '#666',
  lightBg: '#f5f5f5',
  cardBg: '#f8fafc',
  border: '#e2e8f0',
  white: '#ffffff',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
  // Intensity zone colors (monochrome blue ramp)
  zone1: '#bae0ef', // <70%
  zone2: '#7cc0e3', // 70-80%
  zone3: '#3da0d7', // 80-85%
  zone4: '#008ed3', // 85-90%
  zone5: '#005d8a', // 90%+
};

const CACHE_KEY = 'fp_coach_results_v2';

// ── CORE Lift Definitions (exact sheet column names) ───────────────
const CORE_LIFTS = {
  backSquat: 'Back Squat With Barbell - (CORE)',
  deadlift: 'Deadlift With Barbell.v (CORE)',
  benchPress: 'Bench Press With Barbell - (CORE)',
  shoulderPress: 'Shoulder Press Seated With Barbell - (CORE)',
  barbellRow: 'Barbell Row On Bench - Back.v (CORE)',
  latPulldown: 'Lat Pulldown On Machine - Back (CORE)',
};

const CORE_KEYS = ['backSquat', 'deadlift', 'benchPress', 'shoulderPress', 'barbellRow', 'latPulldown'];

// Hardcoded multipliers (athlete PB × multiplier = estimated max for this exercise)
const MULTIPLIER_EXERCISES = {
  'Front Squat': 'backSquat',
  'Overhead Squat': 'backSquat',
  'Trap Bar Deadlift': 'deadlift',
  'Romanian Deadlift': 'deadlift',
  'Incline Bench Press': 'benchPress',
  'Push Press': 'shoulderPress',
  'Arnold Press': 'shoulderPress',
  'Bent-Over Row': 'barbellRow',
  'Pull-Up': 'latPulldown',
  'Chin-Up': 'latPulldown',
};

const MULTIPLIERS = {
  'Front Squat': 0.85,
  'Overhead Squat': 0.80,
  'Trap Bar Deadlift': 1.05,
  'Romanian Deadlift': 0.90,
  'Incline Bench Press': 0.85,
  'Push Press': 0.85,
  'Arnold Press': 0.80,
  'Bent-Over Row': 0.95,
  'Pull-Up': 0.75,
  'Chin-Up': 0.75,
};

// ── Helper Functions ───────────────────────────────────────────────
function getIntensityZone(pct) {
  const num = parseFloat(pct);
  if (isNaN(num)) return null;
  if (num < 70) return 0;
  if (num < 80) return 1;
  if (num < 85) return 2;
  if (num < 90) return 3;
  return 4;
}

const ZONE_LABELS = ['<70%', '70-80%', '80-85%', '85-90%', '90%+'];
const ZONE_COLORS = [COLORS.zone1, COLORS.zone2, COLORS.zone3, COLORS.zone4, COLORS.zone5];

function normalizeExerciseName(exercise) {
  if (!exercise) return '';
  const normalized = exercise.toLowerCase().replace(/[.-]/g, '').replace(/\s+/g, ' ').trim();
  return normalized;
}

function findCoreMatch(exercise) {
  if (!exercise) return null;
  const normalized = normalizeExerciseName(exercise);
  
  for (const [key, fullName] of Object.entries(CORE_LIFTS)) {
    const coreNormalized = normalizeExerciseName(fullName);
    if (normalized.includes(coreNormalized.split(' ')[0])) {
      return key;
    }
  }
  return null;
}

function calcSetVolume(entry, maxesByAthlete = {}) {
  const sets = parseInt(entry.sets) || 0;
  const reps = parseInt(entry.reps) || 0;
  const pct = parseFloat(entry.percentIntensity || entry.intensity || 0) / 100;
  
  // Try to get weight from multiple possible fields
  let weightPerRep = parseFloat(entry.weight) || 0;
  
  // If weight not logged, calculate from % intensity × 1RM
  if (!weightPerRep && pct) {
    const exercise = entry.exercise || '';
    const athleteName = entry.name || '';
    const coreKey = findCoreMatch(exercise);
    
    let oneRM = 0;
    if (coreKey && maxesByAthlete[athleteName]?.[coreKey]) {
      // Core lift — use saved max directly
      oneRM = maxesByAthlete[athleteName][coreKey];
    } else if (MULTIPLIER_EXERCISES[exercise]) {
      // Multiplier lift — derive from related CORE
      const coreKey = MULTIPLIER_EXERCISES[exercise];
      const baseMax = maxesByAthlete[athleteName]?.[coreKey] || 0;
      oneRM = baseMax * (MULTIPLIERS[exercise] || 0.9);
    }
    
    if (oneRM) {
      weightPerRep = pct * oneRM;
    }
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

function fmt(n) {
  return Math.round(n).toLocaleString();
}

export default function CoachResults() {
  const { userEmail: coachEmail, role, isLoading: authLoading } = useAuth();

  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [maxes, setMaxes] = useState([]);
  const [logbook, setLogbook] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLogbook, setShowLogbook] = useState(false);

  // ── Load Data (cache-first + background refresh) ─────────────────
  useEffect(() => {
    if (!coachEmail) return;
    loadData();
  }, [coachEmail]);

  async function loadData() {
    setError(null);

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setAthletes(parsed.athletes || []);
        setMaxes(parsed.maxes || []);
        setLogbook(parsed.logbook || []);
        setLoading(false);
      }
    } catch (e) {
      console.warn('Cache read failed:', e);
    }

    try {
      const allData = await fetchAllData();
      const athleteList = allData.athletes || [];

      // Map maxes by athlete name for volume calculation
      const maxesByName = {};
      athleteList.forEach(a => {
        maxesByName[a.name] = {
          backSquat: parseFloat(a['Back Squat With Barbell - (CORE)']) || 0,
          deadlift: parseFloat(a['Deadlift With Barbell.v (CORE)']) || 0,
          benchPress: parseFloat(a['Bench Press With Barbell - (CORE)']) || 0,
          shoulderPress: parseFloat(a['Shoulder Press Seated With Barbell - (CORE)']) || 0,
          barbellRow: parseFloat(a['Barbell Row On Bench - Back.v (CORE)']) || 0,
          latPulldown: parseFloat(a['Lat Pulldown On Machine - Back (CORE)']) || 0,
        };
      });

      const results = await Promise.all(
        athleteList.map((a) =>
          fetchLogbookByAthlete(a.name)
            .then((res) => (res.data || []).map((e) => ({ ...e, name: a.name, maxes: maxesByName[a.name] })))
            .catch(() => [])
        )
      );
      const allLogbook = results.flat();

      setAthletes(athleteList);
      setMaxes(athleteList);
      setLogbook(allLogbook);
      setLoading(false);

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          athletes: athleteList,
          maxes: athleteList,
          logbook: allLogbook,
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      console.error('Failed to load coach results:', err);
      if (!logbook.length) setError('Unable to load results. Please try again.');
      setLoading(false);
    }
  }

  // ── Refetch logbook when athlete changes ─────────────────────────
  useEffect(() => {
    if (!coachEmail || !selectedAthlete) return;
    refreshLogbook();
  }, [selectedAthlete]);

  async function refreshLogbook() {
    if (selectedAthlete === 'all') return;
    try {
      const res = await fetchLogbookByAthlete(selectedAthlete);
      const tagged = (res.data || []).map((e) => ({ ...e, name: selectedAthlete }));
      setLogbook(tagged);
    } catch (err) {
      console.error('Logbook refresh failed:', err);
    }
  }

  // ── Filtered logbook ─────────────────────────────────────────────
  const filteredLogbook = useMemo(() => {
    let entries = logbook;
    if (selectedAthlete !== 'all') {
      entries = entries.filter((e) => e.name === selectedAthlete);
    }
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start ? new Date(dateRange.start) : null;
      const end = dateRange.end ? new Date(dateRange.end) : null;
      entries = entries.filter((e) => {
        const d = new Date(e.date);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }
    return entries;
  }, [logbook, selectedAthlete, dateRange]);

  // ── Filtered maxes ───────────────────────────────────────────────
  const filteredMaxes = useMemo(() => {
    if (selectedAthlete === 'all') return maxes;
    return maxes.filter((m) => m.name === selectedAthlete);
  }, [maxes, selectedAthlete]);

  // ── Build maxes-by-name lookup ───────────────────────────────────
  const maxesByAthlete = useMemo(() => {
    const map = {};
    filteredMaxes.forEach(a => {
      map[a.name] = {
        backSquat: parseFloat(a['Back Squat With Barbell - (CORE)']) || 0,
        deadlift: parseFloat(a['Deadlift With Barbell.v (CORE)']) || 0,
        benchPress: parseFloat(a['Bench Press With Barbell - (CORE)']) || 0,
        shoulderPress: parseFloat(a['Shoulder Press Seated With Barbell - (CORE)']) || 0,
        barbellRow: parseFloat(a['Barbell Row On Bench - Back.v (CORE)']) || 0,
        latPulldown: parseFloat(a['Lat Pulldown On Machine - Back (CORE)']) || 0,
      };
    });
    return map;
  }, [filteredMaxes]);

  // ── Summary metrics ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const entries = filteredLogbook;
    if (!entries.length) return { totalVolume: 0, sessions: 0, volAt85: 0, avgPerWeek: 0, weeksCovered: 0, zoneVolumes: [0,0,0,0,0] };

    const sessionDays = new Set(entries.map((e) => e.date));
    const zoneVolumes = [0, 0, 0, 0, 0];
    let totalVolume = 0;

    entries.forEach((e) => {
      const vol = calcSetVolume(e, maxesByAthlete);
      totalVolume += vol;
      const zone = getIntensityZone(e.percentIntensity || e.intensity);
      if (zone !== null) zoneVolumes[zone] += vol;
    });

    const volAt85Plus = zoneVolumes[3] + zoneVolumes[4];
    const pctAt85Plus = totalVolume > 0 ? (volAt85Plus / totalVolume) * 100 : 0;

    const weekKeys = new Set(entries.map((e) => getWeekKey(e.date)));
    const weeksCovered = weekKeys.size || 1;
    const avgPerWeek = sessionDays.size / weeksCovered;

    return {
      totalVolume,
      sessions: sessionDays.size,
      volAt85Plus,
      pctAt85Plus,
      avgPerWeek,
      weeksCovered,
      zoneVolumes,
    };
  }, [filteredLogbook, maxesByAthlete]);

  // ── Weekly frequency data ────────────────────────────────────────
  const weeklyFrequency = useMemo(() => {
    const weekMap = {};
    filteredLogbook.forEach((e) => {
      const wk = getWeekKey(e.date);
      if (!weekMap[wk]) weekMap[wk] = { week: wk, sessions: new Set(), volume: 0 };
      weekMap[wk].sessions.add(e.date);
      weekMap[wk].volume += calcSetVolume(e, maxesByAthlete);
    });
    return Object.values(weekMap)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({ ...w, sessionCount: w.sessions.size }));
  }, [filteredLogbook, maxesByAthlete]);

  // ── Max deltas ───────────────────────────────────────────────────
  const maxDeltas = useMemo(() => {
    return filteredMaxes.map((a) => {
      const deltas = {};
      CORE_KEYS.forEach((key) => {
        const colName = CORE_LIFTS[key];
        const current = parseFloat(a[colName]) || 0;
        // Previous max is typically stored as prev[key] or we compare to last week's snapshot
        // For now, assume no previous data until we implement history tracking
        deltas[key] = null;
      });
      return { name: a.name, deltas };
    });
  }, [filteredMaxes]);

  // ── Progression data (estimated 1RM over time per CORE lift) ─────
  const progressionData = useMemo(() => {
    const weekMap = {};
    filteredLogbook.forEach((e) => {
      const wk = getWeekKey(e.date);
      if (!wk) return;
      if (!weekMap[wk]) weekMap[wk] = { week: wk };

      const coreKey = findCoreMatch(e.exercise);
      if (coreKey) {
        const sets = parseInt(e.sets) || 0;
        const reps = parseInt(e.reps) || 0;
        const pct = parseFloat(e.percentIntensity || e.intensity || 0) / 100;
        
        // Estimate 1RM from working set: weight / (1 + 0.0333 × reps)
        if (sets && reps && pct) {
          const weightPerRep = parseFloat(e.weight) || (pct * (maxesByAthlete[e.name]?.[coreKey] || 0));
          if (weightPerRep) {
            const est1RM = weightPerRep / (1 + 0.0333 * reps);
            if (est1RM > (weekMap[wk][coreKey] || 0)) {
              weekMap[wk][coreKey] = est1RM;
            }
          }
        }
      }
    });
    return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  }, [filteredLogbook, maxesByAthlete]);

  // ── Athlete comparison matrix ────────────────────────────────────
  const comparisonMatrix = useMemo(() => {
    if (selectedAthlete !== 'all') return [];
    return athletes.map((a) => {
      const entries = filteredLogbook.filter((e) => e.name === a.name);
      const sessionDays = new Set(entries.map((e) => e.date));
      const weekKeys = new Set(entries.map((e) => getWeekKey(e.date)));
      const weeksCovered = weekKeys.size || 1;

      let totalVol = 0;
      let vol85 = 0;
      entries.forEach((e) => {
        const vol = calcSetVolume(e, maxesByAthlete);
        totalVol += vol;
        const pct = parseFloat(e.percentIntensity || e.intensity || 0);
        if (pct >= 85) vol85 += vol;
      });

      return {
        name: a.name,
        sessions: sessionDays.size,
        avgPerWeek: sessionDays.size / weeksCovered,
        totalVol,
        pctAt85: totalVol > 0 ? (vol85 / totalVol) * 100 : 0,
      };
    }).filter((a) => a.sessions > 0);
  }, [athletes, filteredLogbook, selectedAthlete, maxesByAthlete]);

  // ── Export CSV ───────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Athlete', 'Date', 'Exercise', 'Sets', 'Reps', '% Intensity', 'Tempo', 'Rest', 'Weight(kg)', 'Set Volume(kg)'];
    const rows = filteredLogbook.map((e) => [
      e.name || '',
      e.date || '',
      e.exercise || '',
      e.sets || '',
      e.reps || '',
      e.percentIntensity || e.intensity || '',
      e.tempo || '',
      e.rest || '',
      e.weight || '',
      Math.round(calcSetVolume(e, maxesByAthlete)),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factorprep_coach_results_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Guards AFTER all hooks ───────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ ...styles.page, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <p style={{ color: COLORS.bodyGray, fontSize: '15px' }}>Loading...</p>
      </div>
    );
  }

  if (!coachEmail) {
    return (
      <div style={{ ...styles.page, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <p style={{ color: COLORS.bodyGray, fontSize: '15px' }}>Please log in to view results.</p>
      </div>
    );
  }

  const maxFreq = Math.max(...weeklyFrequency.map((w) => w.sessionCount), 1);

  return (
    <div style={{ ...styles.page, fontFamily: '"Roboto Flex", "Roboto", sans-serif' }}>
      {/* ── Title Wrapper ─────────────────────────────────────────── */}
      <div style={styles.titleWrapper}>
        <h1 style={styles.h1}>Coach Results Dashboard</h1>
        <p style={styles.subtitle}>
          Track frequency, volume at intensity, and strength progression across all 6 CORE lifts.
        </p>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.filterRow}>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Athlete</label>
            <select
              value={selectedAthlete}
              onChange={(e) => setSelectedAthlete(e.target.value)}
              style={styles.select}
            >
              <option value="all">All Athletes</option>
              {athletes.map((a, i) => (
                <option key={i} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.label}>From</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.label}>To</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={{ ...styles.filterActions }}>
            <button style={styles.btnSecondary} onClick={exportCSV}>Export CSV</button>
            <button style={styles.btnSecondary} onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button style={styles.retryBtn} onClick={loadData}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={styles.card}>
          <p style={{ ...styles.body, textAlign: 'center', padding: '2rem' }}>Loading results…</p>
        </div>
      ) : (
        <>
          {/* ── 1. Summary Cards ────────────────────────────────────── */}
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Avg Sessions / Week</span>
              <span style={styles.summaryValue}>{summary.avgPerWeek.toFixed(1)}</span>
              <span style={styles.summarySub}>across {summary.weeksCovered} weeks</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Total Volume Lifted</span>
              <span style={styles.summaryValue}>{fmt(summary.totalVolume)} kg</span>
              <span style={styles.summarySub}>{summary.sessions} total sessions</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Volume at ≥85%</span>
              <span style={styles.summaryValue}>{summary.pctAt85Plus.toFixed(0)}%</span>
              <span style={styles.summarySub}>{fmt(summary.volAt85Plus)} kg heavy work</span>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>CORE Lifts Tracked</span>
              <span style={styles.summaryValue}>
                {CORE_KEYS.filter(key => summary.zoneVolumes.some(v => v > 0)).length > 0 ? 
                  '✓ Active' : '— No data'}
              </span>
              <span style={styles.summarySub}>6 CORE lifts monitored</span>
            </div>
          </div>

          {/* ── 2. Volume at Intensity Distribution ─────────────────── */}
          <div style={styles.card}>
            <h2 style={styles.h2}>Volume at Intensity Distribution</h2>
            <p style={{ ...styles.body, marginBottom: '1rem' }}>
              Where the workload lives — the most important metric. High percentage at ≥85% indicates adequate stimulus for strength.
            </p>
            <div style={styles.barChartContainer}>
              {summary.zoneVolumes.map((vol, i) => {
                const maxVol = Math.max(...summary.zoneVolumes, 1);
                const heightPct = (vol / maxVol) * 100;
                const pctOfTotal = summary.totalVolume > 0 ? (vol / summary.totalVolume) * 100 : 0;
                return (
                  <div key={i} style={styles.barCol}>
                    <div style={styles.barValueLabel}>{pctOfTotal.toFixed(0)}%</div>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          height: `${heightPct}%`,
                          backgroundColor: ZONE_COLORS[i],
                        }}
                      />
                    </div>
                    <div style={styles.barLabel}>{ZONE_LABELS[i]}</div>
                    <div style={styles.barSubLabel}>{fmt(vol)} kg</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. Frequency Map ────────────────────────────────────── */}
          <div style={styles.card}>
            <h2 style={styles.h2}>Training Frequency</h2>
            <p style={{ ...styles.body, marginBottom: '1rem' }}>
              Sessions per week — gaps may indicate missed training or planned deloads.
            </p>
            {weeklyFrequency.length === 0 ? (
              <p style={{ ...styles.body, textAlign: 'center', padding: '1rem' }}>No session data for this period.</p>
            ) : (
              <div style={styles.freqChart}>
                {weeklyFrequency.map((w, i) => (
                  <div key={i} style={styles.freqCol}>
                    <div style={styles.freqBarWrapper}>
                      <div
                        style={{
                          ...styles.freqBar,
                          height: `${(w.sessionCount / maxFreq) * 100}%`,
                        }}
                      >
                        <span style={styles.freqCount}>{w.sessionCount}</span>
                      </div>
                    </div>
                    <div style={styles.freqLabel}>
                      {new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 4. Strength Progression ─────────────────────────────── */}
          <div style={styles.card}>
            <h2 style={styles.h2}>CORE Lift Progression Over Time</h2>
            <p style={{ ...styles.body, marginBottom: '1rem' }}>
              Estimated 1RM trajectory from logged sets. Based on working set intensity — not replacement for max tests.
            </p>
            {progressionData.length < 2 ? (
              <p style={{ ...styles.body, textAlign: 'center', padding: '1rem' }}>
                Not enough data to plot progression yet — need at least 2 weeks of CORE lift sessions.
              </p>
            ) : (
              <ProgressionChart data={progressionData} weeklyData={weeklyFrequency} />
            )}
          </div>

          {/* ── 5. Athlete Comparison Matrix ────────────────────────── */}
          {selectedAthlete === 'all' && comparisonMatrix.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.h2}>Athlete Comparison Matrix</h2>
              <p style={{ ...styles.body, marginBottom: '1rem' }}>
                Compare training doses across the squad. Sort by heavy focus to see who's prioritizing high-intensity work.
              </p>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Athlete</th>
                      <th style={styles.th}>Sessions</th>
                      <th style={styles.th}>Avg / Wk</th>
                      <th style={styles.th}>Total Vol</th>
                      <th style={styles.th}>Vol ≥85%</th>
                      <th style={styles.th}>Heavy Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonMatrix
                      .sort((a, b) => b.pctAt85 - a.pctAt85)
                      .map((a, i) => (
                        <tr key={i} style={styles.tr}>
                          <td style={styles.td}>{a.name}</td>
                          <td style={styles.td}>{a.sessions}</td>
                          <td style={styles.td}>{a.avgPerWeek.toFixed(1)}</td>
                          <td style={styles.td}>{fmt(a.totalVol)} kg</td>
                          <td style={styles.td}>{a.pctAt85.toFixed(0)}%</td>
                          <td style={styles.td}>
                            <div style={styles.miniBarTrack}>
                              <div
                                style={{
                                  ...styles.miniBarFill,
                                  width: `${Math.min(a.pctAt85, 100)}%`,
                                  backgroundColor: a.pctAt85 >= 30 ? COLORS.zone4 : COLORS.zone2,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 6. Current Maxes ────────────────────────────────────── */}
          <div style={styles.card}>
            <h2 style={styles.h2}>Current CORE Lift Maxes</h2>
            {filteredMaxes.length === 0 ? (
              <p style={{ ...styles.body, textAlign: 'center', padding: '1.5rem' }}>No max data available.</p>
            ) : (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Athlete</th>
                      <th style={styles.th}>Back Squat</th>
                      <th style={styles.th}>Deadlift</th>
                      <th style={styles.th}>Bench</th>
                      <th style={styles.th}>OHP</th>
                      <th style={styles.th}>Row</th>
                      <th style={styles.th}>Lat Pulldown</th>
                    </tr>
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

          {/* ── 7. Logbook Detail ───────────────────────────────────── */}
          <div style={styles.card}>
            <div style={styles.collapsibleHeader} onClick={() => setShowLogbook(!showLogbook)}>
              <h2 style={{ ...styles.h2, margin: 0 }}>Logbook Detail</h2>
              <span style={styles.chevron}>{showLogbook ? '▼' : '▶'}</span>
            </div>
            {showLogbook && (
              <div style={{ marginTop: '1rem' }}>
                {filteredLogbook.length === 0 ? (
                  <p style={{ ...styles.body, textAlign: 'center', padding: '1.5rem' }}>
                    No logbook entries for the selected filters.
                  </p>
                ) : (
                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {['Date', 'Athlete', 'Exercise', 'Sets', 'Reps', '% Int.', 'Weight', 'Tempo', 'Rest', 'Set Vol'].map((h) => (
                            <th key={h} style={styles.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogbook.map((entry, i) => (
                          <tr key={i} style={styles.tr}>
                            <td style={styles.td}>{entry.date ? new Date(entry.date).toLocaleDateString() : '—'}</td>
                            <td style={styles.td}>{entry.name || '—'}</td>
                            <td style={styles.td}>{entry.exercise || '—'}</td>
                            <td style={styles.td}>{entry.sets || '—'}</td>
                            <td style={styles.td}>{entry.reps || '—'}</td>
                            <td style={styles.td}>{entry.percentIntensity || entry.intensity || '—'}</td>
                            <td style={styles.td}>{entry.weight ? `${entry.weight} kg` : '—'}</td>
                            <td style={styles.td}>{entry.tempo || '—'}</td>
                            <td style={styles.td}>{entry.rest || '—'}</td>
                            <td style={styles.td}>{fmt(calcSetVolume(entry, maxesByAthlete))} kg</td>
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
  );
}

// ── Sub-component: Progression Chart ───────────────────────────────
function ProgressionChart({ data, weeklyData }) {
  const width = 720;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const weeks = data.map((d) => d.week);
  const allValues = data.flatMap((d) => [d.backSquat, d.deadlift, d.benchPress].filter(Boolean));
  if (allValues.length === 0) return <p style={{ color: COLORS.bodyGray }}>No progression data.</p>;

  const minY = Math.min(...allValues) * 0.9;
  const maxY = Math.max(...allValues) * 1.05;

  const xScale = (i) => padding.left + (i / Math.max(weeks.length - 1, 1)) * chartW;
  const yScale = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

  const lifts = [
    { key: 'backSquat', label: 'Back Squat', color: COLORS.zone4 },
    { key: 'benchPress', label: 'Bench', color: COLORS.zone3 },
    { key: 'deadlift', label: 'Deadlift', color: COLORS.zone5 },
  ];

  const maxVol = Math.max(...weeklyData.map((w) => w.volume), 1);
  const volBarWidth = chartW / Math.max(weeklyData.length, 1) * 0.6;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + chartH * t;
          const val = maxY - (maxY - minY) * t;
          return (
            <g key={t}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={COLORS.border} strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={COLORS.bodyGray}>
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {weeklyData.map((w, i) => {
          const x = xScale(i) - volBarWidth / 2;
          const barH = (w.volume / maxVol) * chartH * 0.4;
          return (
            <rect key={`vol-${i}`} x={x} y={padding.top + chartH - barH} width={volBarWidth} height={barH} fill={COLORS.zone1} opacity="0.5" rx="2" />
          );
        })}

        {lifts.map((lift) => {
          const points = data.map((d, i) => (d[lift.key] ? `${xScale(i)},${yScale(d[lift.key])}` : null)).filter(Boolean);
          if (points.length < 2) return null;
          return (
            <g key={lift.key}>
              <polyline points={points.join(' ')} fill="none" stroke={lift.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => {
                const [px, py] = p.split(',').map(Number);
                return <circle key={i} cx={px} cy={py} r="3.5" fill={lift.color} />;
              })}
            </g>
          );
        })}

        {weeks.map((wk, i) => (
          <text key={wk} x={xScale(i)} y={height - padding.bottom + 18} textAnchor="middle" fontSize="10" fill={COLORS.bodyGray}>
            {new Date(wk).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}

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

// ── Styles ─────────────────────────────────────────────────────────
const styles = {
  page: {
    padding: '4px',
    backgroundColor: COLORS.cardBg,
    minHeight: 'calc(100vh - 120px)',
  },
  titleWrapper: {
    textAlign: 'center',
    paddingTop: '4px',
    marginBottom: '1.5rem',
  },
  h1: { fontSize: '28px', color: COLORS.darkText, fontWeight: '700', margin: '0 0 4px 0' },
  subtitle: { fontSize: '15px', color: COLORS.bodyGray, margin: 0 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: '12px',
    padding: '1.25rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: `1px solid ${COLORS.border}`,
  },
  h2: { fontSize: '18px', fontWeight: '700', color: COLORS.darkText, margin: '0 0 0.75rem 0' },
  body: { fontSize: '15px', color: COLORS.bodyGray },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  filterActions: { display: 'flex', gap: '0.5rem', marginLeft: 'auto' },
  label: { fontSize: '13px', fontWeight: '600', color: COLORS.darkText },
  select: {
    padding: '8px 12px', borderRadius: '8px', border: `1px solid ${COLORS.border}`,
    fontSize: '15px', color: COLORS.darkText, backgroundColor: COLORS.white, cursor: 'pointer', minWidth: '160px',
  },
  input: {
    padding: '8px 12px', borderRadius: '8px', border: `1px solid ${COLORS.border}`,
    fontSize: '15px', color: COLORS.darkText, backgroundColor: COLORS.white, cursor: 'pointer',
  },
  btnSecondary: {
    padding: '8px 16px', borderRadius: '8px', border: `1px solid ${COLORS.primaryBlue}`,
    backgroundColor: COLORS.white, color: COLORS.primaryBlue, fontSize: '13px', fontWeight: '600', cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1rem',
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: '12px',
    padding: '1.25rem',
    border: `1px solid ${COLORS.border}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  summaryLabel: { fontSize: '13px', color: COLORS.bodyGray, fontWeight: '600' },
  summaryValue: { fontSize: '26px', fontWeight: '700', color: COLORS.primaryBlue },
  summarySub: { fontSize: '12px', color: COLORS.bodyGray },
  barChartContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.75rem',
    height: '220px',
    paddingTop: '1.5rem',
  },
  barCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%' },
  barValueLabel: { fontSize: '13px', fontWeight: '700', color: COLORS.darkText, marginBottom: '4px' },
  barTrack: { flex: 1, width: '100%', maxWidth: '80px', display: 'flex', flexDirection: 'column-reverse' },
  barFill: { width: '100%', borderRadius: '6px 6px 0 0', minHeight: '4px', transition: 'height 0.3s ease' },
  barLabel: { fontSize: '13px', fontWeight: '600', color: COLORS.darkText, marginTop: '6px' },
  barSubLabel: { fontSize: '11px', color: COLORS.bodyGray },
  freqChart: { display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '180px', overflowX: 'auto', paddingTop: '0.5rem' },
  freqCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '48px', height: '100%' },
  freqBarWrapper: { flex: 1, width: '32px', display: 'flex', flexDirection: 'column-reverse' },
  freqBar: {
    width: '100%', backgroundColor: COLORS.primaryBlue, borderRadius: '6px 6px 0 0',
    minHeight: '8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '4px',
  },
  freqCount: { fontSize: '11px', fontWeight: '700', color: COLORS.white },
  freqLabel: { fontSize: '10px', color: COLORS.bodyGray, marginTop: '4px', textAlign: 'center' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '15px' },
  th: {
    textAlign: 'left', padding: '10px 12px', backgroundColor: COLORS.primaryBlue, color: COLORS.white,
    fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap',
  },
  tr: { borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: '10px 12px', color: COLORS.darkText, fontSize: '14px', whiteSpace: 'nowrap' },
  miniBarTrack: { width: '80px', height: '10px', backgroundColor: COLORS.lightBg, borderRadius: '5px', overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: '5px', transition: 'width 0.3s ease' },
  collapsibleHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
    userSelect: 'none',
  },
  chevron: { fontSize: '14px', color: COLORS.bodyGray },
  errorBanner: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
    padding: '12px 16px', marginBottom: '1rem', color: COLORS.red, fontSize: '14px',
  },
  retryBtn: {
    padding: '4px 12px', borderRadius: '6px', border: `1px solid ${COLORS.red}`,
    backgroundColor: COLORS.white, color: COLORS.red, fontSize: '13px', cursor: 'pointer', fontWeight: '600',
  },
};
