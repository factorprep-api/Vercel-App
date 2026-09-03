import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import {
  fetchAthletes,
  fetchWellnessLogs,
  getLogbookByAthlete,
  getLatestMaxes,
  fetchAllData
} from '../api';
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  Award,
  History,
  Calendar,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  Heart,
  Moon,
  Utensils,
  Zap,
  Smile
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

export default function MyProgress() {
  const { userEmail, athleteName: authAthleteName, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Active Pods & Permissions
  const [activePods, setActivePods] = useState(() => {
    try {
      const lower = (userEmail || '').toLowerCase();
      const raw = localStorage.getItem(`fp_athlete_pods_${lower}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return ['wellness', 'medical', 'schedule'];
  });

  const [activeTab, setActiveTab] = useState('wellness'); // 'wellness' | 'metrics' | 'history'
  const [selectedMetric, setSelectedMetric] = useState('Grip'); // 'Grip' | 'Feeling' | 'Soreness' | 'Sleep' | 'Nutrition'

  // Data states
  const [loading, setLoading] = useState(true);
  const [resolvedAthleteName, setResolvedAthleteName] = useState(authAthleteName || '');
  const [wellnessLogs, setWellnessLogs] = useState([]);
  const [logbookEntries, setLogbookEntries] = useState([]);
  const [maxes, setMaxes] = useState({});
  const [error, setError] = useState(null);

  const hasWellnessPod = activePods.includes('wellness');

  // If user doesn't have wellness pod, default tab to metrics
  useEffect(() => {
    if (!hasWellnessPod && activeTab === 'wellness') {
      setActiveTab('metrics');
    }
  }, [hasWellnessPod, activeTab]);

  useEffect(() => {
    if (userEmail || authAthleteName) {
      loadData();
    }
  }, [userEmail, authAthleteName]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const lowerEmail = (userEmail || '').toLowerCase();
      let nameToUse = authAthleteName || '';

      // 1. Fetch athletes list to match name & pod permissions
      const [athRes, wellnessRes, allDataRes] = await Promise.all([
        fetchAthletes().catch(() => ({ athletes: [] })),
        fetchWellnessLogs().catch(() => ({ data: [] })),
        fetchAllData().catch(() => ({ athletes: [] }))
      ]);

      const athletes = athRes.athletes?.length ? athRes.athletes : (allDataRes.athletes || []);
      let userRow = null;

      for (let i = 1; i < athletes.length; i++) {
        const row = athletes[i];
        if (!row) continue;
        const rowName = String(row[0] || '').trim();
        const rowEmail = String(row[9] || '').trim().toLowerCase();
        if (rowEmail === lowerEmail || (nameToUse && rowName.toLowerCase() === nameToUse.toLowerCase())) {
          userRow = row;
          if (!nameToUse) nameToUse = rowName;
          break;
        }
      }

      if (userRow) {
        const pods = String(userRow[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        setActivePods(pods);
        try {
          localStorage.setItem(`fp_athlete_pods_${lowerEmail}`, JSON.stringify(pods));
        } catch {}
      }

      const finalAthleteName = nameToUse || userEmail.split('@')[0];
      setResolvedAthleteName(finalAthleteName);

      // 2. Parse Wellness logs
      const rawWellness = wellnessRes.data || [];
      if (rawWellness.length > 1) {
        const myWellness = [];
        const normName = finalAthleteName.toLowerCase().trim();

        // Header: [ "Date", "Email", "Athlete", "Grip", "Feeling", "Soreness", "Sleep", "Nutrition" ]
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
                timeStr: rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                grip: gripVal,
                feeling: feelingVal,
                soreness: sorenessVal,
                sleep: sleepVal,
                nutrition: nutritionVal
              });
            }
          }
        }

        // Sort chronologically ascending for chart
        myWellness.sort((a, b) => a.rawDate - b.rawDate);
        setWellnessLogs(myWellness);
      } else {
        setWellnessLogs([]);
      }

      // 3. Fetch Logbook and 1RM Maxes in parallel
      const [logbookRes, maxesRes] = await Promise.all([
        getLogbookByAthlete(finalAthleteName).catch(() => ({ data: [] })),
        getLatestMaxes(finalAthleteName).catch(() => ({ maxes: {} }))
      ]);

      if (logbookRes && Array.isArray(logbookRes.data)) {
        setLogbookEntries(logbookRes.data);
      }
      if (maxesRes && maxesRes.maxes) {
        setMaxes(maxesRes.maxes);
      }

    } catch (err) {
      console.warn("MyProgress load notice:", err);
      setError("Unable to sync latest metrics. Displaying cached data.");
    } finally {
      setLoading(false);
    }
  }

  // 7-day filtered data for trendlines
  const last7DaysWellness = useMemo(() => {
    if (!wellnessLogs.length) return [];
    // Take the last 7 logged entries or entries from the last 7-14 days
    return wellnessLogs.slice(-7);
  }, [wellnessLogs]);

  // Metric configs
  const metricConfigs = {
    Grip: {
      label: 'Grip Strength',
      unit: 'kg',
      color: '#0284c7', // Sky blue
      icon: Dumbbell,
      min: 0,
      max: 100,
      description: 'Max handgrip dynamometer peak output'
    },
    Feeling: {
      label: 'Overall Feeling',
      unit: '/10',
      color: '#16a34a', // Emerald green
      icon: Smile,
      min: 1,
      max: 10,
      description: 'Subjective systemic readiness and energy level'
    },
    Soreness: {
      label: 'Muscle Soreness',
      unit: '/10',
      color: '#ea580c', // Orange
      icon: Zap,
      min: 1,
      max: 10,
      description: 'Physical DOMS and localized muscular stiffness'
    },
    Sleep: {
      label: 'Sleep Duration',
      unit: 'hrs',
      color: '#8b5cf6', // Purple
      icon: Moon,
      min: 0,
      max: 14,
      description: 'Total restorative sleep logged overnight'
    },
    Nutrition: {
      label: 'Nutrition & Fuel',
      unit: '/10',
      color: '#10b981', // Teal
      icon: Utensils,
      min: 1,
      max: 10,
      description: 'Hydration and macro fuel compliance'
    }
  };

  const currentMetricConfig = metricConfigs[selectedMetric] || metricConfigs.Grip;

  // Compute 7-day average for active metric
  const currentMetricStats = useMemo(() => {
    if (!last7DaysWellness.length) return { avg: null, min: null, max: null, count: 0, latest: null };
    const key = selectedMetric.toLowerCase();
    const validValues = last7DaysWellness
      .map(d => d[key])
      .filter(v => v !== null && !isNaN(v) && v > 0);

    if (!validValues.length) return { avg: null, min: null, max: null, count: 0, latest: null };

    const sum = validValues.reduce((acc, v) => acc + v, 0);
    const avg = (sum / validValues.length).toFixed(1);
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const latest = validValues[validValues.length - 1];

    return { avg, min, max, count: validValues.length, latest };
  }, [last7DaysWellness, selectedMetric]);

  const activeMetricKey = selectedMetric.toLowerCase();

  return (
    <div style={{ fontFamily: '"Roboto Flex", system-ui, -apple-system, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', padding: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
      {/* Standard App Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px', padding: 0 }}
          title="Back"
        >
          <ArrowLeft size={28} />
        </button>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>My Progress</h1>
      </div>

      {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
          {hasWellnessPod && (
            <button
              onClick={() => setActiveTab('wellness')}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: activeTab === 'wellness' ? '#ffffff' : 'transparent',
                color: activeTab === 'wellness' ? '#008ed3' : '#64748b',
                boxShadow: activeTab === 'wellness' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Activity size={18} />
              <span>Wellness</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('metrics')}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: activeTab === 'metrics' ? '#ffffff' : 'transparent',
              color: activeTab === 'metrics' ? '#008ed3' : '#64748b',
              boxShadow: activeTab === 'metrics' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Award size={18} />
            <span>Metrics (1RM)</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: activeTab === 'history' ? '#ffffff' : 'transparent',
              color: activeTab === 'history' ? '#008ed3' : '#64748b',
              boxShadow: activeTab === 'history' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <History size={18} />
            <span>History Vault</span>
          </button>
        </div>

        {/* TAB 1: WELLNESS TRENDLINE ANALYSIS */}
        {activeTab === 'wellness' && (
          <div>
            {/* Metric Toggle Chips */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '8px', scrollbarWidth: 'none' }}>
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
        {activeTab === 'metrics' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0' }}>
              Estimated 1RM Maxes
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
              Calculated using standard Epley formulas from your heaviest logged sets.
            </p>

            {Object.keys(maxes).length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {Object.entries(maxes).map(([exercise, maxData], i) => (
                  <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', display: 'block', textTransform: 'capitalize' }}>
                      {exercise}
                    </span>
                    <h3 style={{ fontSize: '22px', fontWeight: '900', color: '#008ed3', margin: '6px 0 2px 0' }}>
                      {maxData.oneRM || maxData} kg
                    </h3>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Estimated Max</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px' }}>
                <Award size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                  No 1RM data recorded yet. Complete workout sessions in your program to calculate maxes.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HISTORY VAULT */}
        {activeTab === 'history' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0' }}>
              Training Logbook History
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
              Archive of all logged gym sets and workouts.
            </p>

            {logbookEntries.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {logbookEntries.slice(0, 20).map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 14px',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                        {entry.exercise || entry[2] || 'Workout Set'}
                      </span>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                        {entry.date || entry[0] || 'Logged Set'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#008ed3' }}>
                        {entry.weight ? `${entry.weight} kg` : ''} {entry.reps ? `× ${entry.reps}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px' }}>
                <History size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                  No training history found in your logbook yet.
                </p>
              </div>
            )}
          </div>
        )}

      <HelpButton pageName="My Progress" position="bottom-right" />
    </div>
  );
}
