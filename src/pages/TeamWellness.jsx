import { useState } from 'react';
import { Activity, TrendingDown, TrendingUp, AlertCircle, Heart, Moon, Utensils, HandMetal, Smile, ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useNavigate } from 'react-router-dom';
import HelpButton from '../components/HelpButton';

const MOCK_TEAM_DATA = [
  { date: 'Mon', grip: 45.2, sleep: 7.2, soreness: 4.1, nutrition: 8.5, mood: 7.5 },
  { date: 'Tue', grip: 44.8, sleep: 7.5, soreness: 5.2, nutrition: 8.2, mood: 8.0 },
  { date: 'Wed', grip: 45.5, sleep: 8.1, soreness: 3.8, nutrition: 8.8, mood: 8.5 },
  { date: 'Thu', grip: 43.1, sleep: 6.2, soreness: 6.5, nutrition: 7.5, mood: 6.5 },
  { date: 'Fri', grip: 42.5, sleep: 6.8, soreness: 7.1, nutrition: 7.9, mood: 6.0 },
  { date: 'Sat', grip: 41.2, sleep: 7.1, soreness: 8.2, nutrition: 8.5, mood: 6.5 },
  { date: 'Sun', grip: 43.8, sleep: 8.5, soreness: 4.5, nutrition: 9.0, mood: 8.0 },
];

const MOCK_PLAYER_DATA_MAP = {
  1: [
    { date: 'Mon', grip: 41.2, sleep: 7.5, soreness: 5.0, nutrition: 8.0, mood: 7.0 },
    { date: 'Tue', grip: 41.8, sleep: 8.0, soreness: 4.5, nutrition: 8.5, mood: 7.5 },
    { date: 'Wed', grip: 42.5, sleep: 8.2, soreness: 4.2, nutrition: 9.0, mood: 8.0 },
    { date: 'Thu', grip: 43.1, sleep: 7.8, soreness: 4.8, nutrition: 8.5, mood: 7.5 },
    { date: 'Fri', grip: 44.0, sleep: 8.5, soreness: 3.5, nutrition: 9.0, mood: 8.5 },
    { date: 'Sat', grip: 45.2, sleep: 8.8, soreness: 3.2, nutrition: 9.5, mood: 9.0 },
    { date: 'Sun', grip: 46.1, sleep: 9.0, soreness: 2.5, nutrition: 9.5, mood: 9.5 },
  ],
  2: [
    { date: 'Mon', grip: 44.5, sleep: 7.2, soreness: 4.0, nutrition: 8.5, mood: 8.0 },
    { date: 'Tue', grip: 44.2, sleep: 7.5, soreness: 4.2, nutrition: 8.2, mood: 8.0 },
    { date: 'Wed', grip: 44.8, sleep: 7.8, soreness: 3.8, nutrition: 8.8, mood: 8.5 },
    { date: 'Thu', grip: 44.1, sleep: 7.0, soreness: 4.5, nutrition: 8.0, mood: 7.5 },
    { date: 'Fri', grip: 44.5, sleep: 7.5, soreness: 4.0, nutrition: 8.5, mood: 8.0 },
    { date: 'Sat', grip: 43.9, sleep: 7.2, soreness: 4.8, nutrition: 8.0, mood: 7.5 },
    { date: 'Sun', grip: 44.6, sleep: 7.8, soreness: 3.5, nutrition: 8.8, mood: 8.5 },
  ]
};

const MOCK_PLAYERS = [
  { id: 1, name: 'Alex Johnson', readiness: 92, gripTrend: 'up', status: 'Optimal' },
  { id: 2, name: 'Marcus Smith', readiness: 85, gripTrend: 'stable', status: 'Good' },
  { id: 3, name: 'David Chen', readiness: 68, gripTrend: 'down', status: 'Monitor' },
  { id: 4, name: 'James Wilson', readiness: 54, gripTrend: 'down', status: 'At Risk' },
  { id: 5, name: 'Tom Hardy', readiness: 88, gripTrend: 'up', status: 'Optimal' },
];

export default function TeamWellness() {
  const [activeMetric, setActiveMetric] = useState('grip');
  const [selectedView, setSelectedView] = useState('team');
  const navigate = useNavigate();

  const baseData = selectedView === 'team' ? MOCK_TEAM_DATA : MOCK_PLAYER_DATA_MAP[parseInt(selectedView)] || MOCK_TEAM_DATA;
  
  const currentAvgGrip = (baseData.reduce((acc, curr) => acc + curr.grip, 0) / 7).toFixed(1);
  const currentAvgSoreness = (baseData.reduce((acc, curr) => acc + curr.soreness, 0) / 7).toFixed(1);
  const currentAvgSleep = (baseData.reduce((acc, curr) => acc + curr.sleep, 0) / 7).toFixed(1);
  const currentAvgNutrition = (baseData.reduce((acc, curr) => acc + curr.nutrition, 0) / 7).toFixed(1);
  const currentAvgMood = (baseData.reduce((acc, curr) => acc + curr.mood, 0) / 7).toFixed(1);

  const calculateTrendData = (data, metric) => {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    data.forEach((point, i) => {
      const y = point[metric];
      sumX += i; sumY += y; sumXY += i * y; sumXX += i * i;
    });
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return data.map((point, i) => ({
      ...point,
      trend: slope * i + intercept
    }));
  };

  const chartData = selectedView === 'team' ? baseData : calculateTrendData(baseData, activeMetric);

  return (
    <div className="well-container">
      <style>{`
        .well-container { padding: 20px; max-width: 1200px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
        .well-header { display: flex; align-items: center; margin-bottom: 24px; }
        .well-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px; }
        .well-subtitle { color: #64748b; font-size: 14px; margin-top: 4px; margin-left: 40px; }
        
        .well-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
        @media (max-width: 1024px) { .well-grid { grid-template-columns: 1fr; } }
        
        .well-metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }
        @media (max-width: 768px) { .well-metrics { grid-template-columns: repeat(2, 1fr); } }
        
        .well-metric-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s ease; text-align: left; }
        .well-metric-card:hover { border-color: #cbd5e1; }
        .well-metric-card.active-grip { background: #eff6ff; border-color: #bfdbfe; box-shadow: 0 0 0 2px #3b82f6; }
        .well-metric-card.active-soreness { background: #fef2f2; border-color: #fecaca; box-shadow: 0 0 0 2px #ef4444; }
        .well-metric-card.active-sleep { background: #eef2ff; border-color: #e0e7ff; box-shadow: 0 0 0 2px #6366f1; }
        .well-metric-card.active-nutrition { background: #ecfdf5; border-color: #d1fae5; box-shadow: 0 0 0 2px #10b981; }
        .well-metric-card.active-mood { background: #fffbeb; border-color: #fef3c7; box-shadow: 0 0 0 2px #f59e0b; }
        
        .well-metric-label { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .well-metric-value { font-size: 24px; font-weight: 900; color: #0f172a; }
        .well-metric-unit { font-size: 14px; font-weight: 500; color: #94a3b8; margin-left: 4px; }
        
        .well-chart-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .well-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .well-chart-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
        .well-select { padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 14px; color: #334155; font-weight: 500; outline: none; cursor: pointer; }
        
        .well-roster-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); overflow: hidden; display: flex; flex-direction: column; }
        .well-roster-header { padding: 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; gap: 8px; font-weight: 700; color: #0f172a; }
        .well-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        .well-table th { padding: 12px 16px; background: #f8fafc; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
        .well-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
        .well-table tr:hover { background-color: #f8fafc; }
        
        .well-bar-bg { width: 100%; background: #f1f5f9; border-radius: 99px; height: 6px; max-width: 50px; }
        .well-bar-fill { height: 6px; border-radius: 99px; }
      `}</style>

      <div className="well-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <h1 className="well-title"><Activity size={24} color="#3b82f6" /> Team Wellness</h1>
          <p className="well-subtitle">7-Day trailing averages sourced from Athlete logs.</p>
        </div>
      </div>

      <div className="well-grid">
        <div className="well-left-col">
          
          <div className="well-metrics">
            <button className={`well-metric-card ${activeMetric === 'grip' ? 'active-grip' : ''}`} onClick={() => setActiveMetric('grip')}>
              <div className="well-metric-label"><HandMetal size={16} color={activeMetric === 'grip' ? '#3b82f6' : 'currentColor'} /> Grip</div>
              <div className="well-metric-value">{currentAvgGrip}<span className="well-metric-unit">kg</span></div>
            </button>
            <button className={`well-metric-card ${activeMetric === 'soreness' ? 'active-soreness' : ''}`} onClick={() => setActiveMetric('soreness')}>
              <div className="well-metric-label"><Heart size={16} color={activeMetric === 'soreness' ? '#ef4444' : 'currentColor'} /> Soreness</div>
              <div className="well-metric-value">{currentAvgSoreness}<span className="well-metric-unit">/10</span></div>
            </button>
            <button className={`well-metric-card ${activeMetric === 'sleep' ? 'active-sleep' : ''}`} onClick={() => setActiveMetric('sleep')}>
              <div className="well-metric-label"><Moon size={16} color={activeMetric === 'sleep' ? '#6366f1' : 'currentColor'} /> Sleep</div>
              <div className="well-metric-value">{currentAvgSleep}<span className="well-metric-unit">hrs</span></div>
            </button>
            <button className={`well-metric-card ${activeMetric === 'nutrition' ? 'active-nutrition' : ''}`} onClick={() => setActiveMetric('nutrition')}>
              <div className="well-metric-label"><Utensils size={16} color={activeMetric === 'nutrition' ? '#10b981' : 'currentColor'} /> Nutrition</div>
              <div className="well-metric-value">{currentAvgNutrition}<span className="well-metric-unit">/10</span></div>
            </button>
            <button className={`well-metric-card ${activeMetric === 'mood' ? 'active-mood' : ''}`} onClick={() => setActiveMetric('mood')}>
              <div className="well-metric-label"><Smile size={16} color={activeMetric === 'mood' ? '#f59e0b' : 'currentColor'} /> Mood</div>
              <div className="well-metric-value">{currentAvgMood}<span className="well-metric-unit">/10</span></div>
            </button>
          </div>

          <div className="well-chart-card">
            <div className="well-chart-header">
              <h3 className="well-chart-title">7-Day {selectedView === 'team' ? 'Team Trend' : 'Player Trend'}</h3>
              <select value={selectedView} onChange={(e) => setSelectedView(e.target.value)} className="well-select">
                <option value="team">Team Average</option>
                <optgroup label="Players">
                  {MOCK_PLAYERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              </select>
            </div>
            
            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold' }} formatter={(value) => [value.toFixed(1), '']} />
                  
                  {activeMetric === 'grip' && <Line type="monotone" dataKey="grip" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'soreness' && <Line type="monotone" dataKey="soreness" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'sleep' && <Line type="monotone" dataKey="sleep" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'nutrition' && <Line type="monotone" dataKey="nutrition" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'mood' && <Line type="monotone" dataKey="mood" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  
                  {selectedView !== 'team' && <Line type="monotone" dataKey="trend" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} />}
                  {activeMetric === 'grip' && <ReferenceLine y={44} stroke="#94a3b8" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Baseline', fill: '#94a3b8', fontSize: 12 }} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="well-roster-card">
          <div className="well-roster-header"><AlertCircle size={16} color="#64748b" /> Player Watchlist</div>
          <table className="well-table">
            <thead>
              <tr><th>Player</th><th>Readiness</th><th style={{ textAlign: 'right' }}>Trend</th></tr>
            </thead>
            <tbody>
              {MOCK_PLAYERS.map(player => (
                <tr key={player.id}>
                  <td>
                    <div style={{ fontWeight: 500, color: '#0f172a' }}>{player.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{player.status}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="well-bar-bg">
                        <div className="well-bar-fill" style={{ width: `${player.readiness}%`, backgroundColor: player.readiness >= 80 ? '#10b981' : player.readiness >= 60 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: player.readiness >= 80 ? '#059669' : player.readiness >= 60 ? '#d97706' : '#dc2626' }}>{player.readiness}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {player.gripTrend === 'up' && <TrendingUp size={16} color="#10b981" style={{ marginLeft: 'auto' }} />}
                    {player.gripTrend === 'down' && <TrendingDown size={16} color="#ef4444" style={{ marginLeft: 'auto' }} />}
                    {player.gripTrend === 'stable' && <div style={{ width: '16px', height: '2px', backgroundColor: '#cbd5e1', marginLeft: 'auto' }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <HelpButton pageName="Wellness" position="bottom-right" />
    </div>
  );
}