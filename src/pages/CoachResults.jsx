import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, AlertCircle, Heart, Moon, Utensils, HandMetal, Smile, BarChart2, LayoutGrid } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import HelpButton from '../components/HelpButton';
import { fetchAllData } from '../api';

// MOCK HISTORY DATA FOR CHARTS (Will wire to api.js in Phase 2)
const generateMockHistory = () => [
  { date: 'Mon', grip: 42, sleep: 7.5, soreness: 5, nutrition: 8, feeling: 7 },
  { date: 'Tue', grip: 43, sleep: 8.0, soreness: 4, nutrition: 8, feeling: 8 },
  { date: 'Wed', grip: 44, sleep: 7.0, soreness: 6, nutrition: 7, feeling: 6 },
  { date: 'Thu', grip: 42, sleep: 6.5, soreness: 7, nutrition: 7, feeling: 5 },
  { date: 'Fri', grip: 45, sleep: 8.5, soreness: 3, nutrition: 9, feeling: 9 },
  { date: 'Sat', grip: 46, sleep: 8.0, soreness: 4, nutrition: 8, feeling: 8 },
  { date: 'Sun', grip: 45, sleep: 7.5, soreness: 5, nutrition: 8, feeling: 7 },
];

export default function CoachResults() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real Athletes from Database
  const [wellnessRoster, setWellnessRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chart States
  const [activeMetric, setActiveMetric] = useState('grip');
  const [selectedChartUser, setSelectedChartUser] = useState('team');

  useEffect(() => {
    async function loadWellnessAthletes() {
      try {
        const data = await fetchAllData();
        const athletes = data.athletes || [];
        const roster = [];
        
        // Skip header row
        for (let i = 1; i < athletes.length; i++) {
          const row = athletes[i];
          const name = String(row[0] || '').trim();
          const pods = String(row[11] || '').toLowerCase(); // Column L (Index 11)
          
          if (name && pods.includes('wellness')) {
            // Generate mock scores for Phase 1 visual testing
            const randomScore = () => Math.floor(Math.random() * 5) + 5; // 5 to 9
            roster.push({
              id: i,
              name: name,
              grip: 40 + Math.random() * 10,
              feeling: randomScore(),
              soreness: randomScore(),
              sleep: 5 + Math.random() * 4,
              nutrition: randomScore(),
              status: Math.random() > 0.8 ? 'fatigued' : 'normal',
              history: generateMockHistory()
            });
          }
        }
        setWellnessRoster(roster.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error("Failed to load athletes", err);
      }
      setLoading(false);
    }
    loadWellnessAthletes();
  }, []);

  const getColorClass = (val, type) => {
    if (type === 'grip') {
      if (val >= 45) return 'status-green';
      if (val <= 40) return 'status-red';
      return 'status-amber';
    }
    if (type === 'sleep') {
      if (val >= 7.5) return 'status-green';
      if (val <= 5.5) return 'status-red';
      return 'status-amber';
    }
    if (val >= 8) return 'status-green';
    if (val <= 4) return 'status-red';
    return 'status-amber';
  };

  const filteredRoster = wellnessRoster.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Chart Data Logic
  const getChartData = () => {
    if (selectedChartUser === 'team') {
      // Return default mock team data for now
      return generateMockHistory();
    }
    const athlete = wellnessRoster.find(a => a.id.toString() === selectedChartUser);
    return athlete ? athlete.history : generateMockHistory();
  };

  const baseChartData = getChartData();
  const currentAvgGrip = (baseChartData.reduce((acc, curr) => acc + curr.grip, 0) / 7).toFixed(1);
  const currentAvgSoreness = (baseChartData.reduce((acc, curr) => acc + curr.soreness, 0) / 7).toFixed(1);
  const currentAvgSleep = (baseChartData.reduce((acc, curr) => acc + curr.sleep, 0) / 7).toFixed(1);
  const currentAvgNutrition = (baseChartData.reduce((acc, curr) => acc + curr.nutrition, 0) / 7).toFixed(1);
  const currentAvgFeeling = (baseChartData.reduce((acc, curr) => acc + curr.feeling, 0) / 7).toFixed(1);

  return (
    <div className="cr-container">
      <style>{`
        .cr-container { padding: 20px; max-width: 1200px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
        .cr-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .cr-title-box { display: flex; align-items: center; gap: 12px; }
        .cr-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        
        .cr-toggle-bg { display: flex; background: #e2e8f0; padding: 4px; border-radius: 8px; }
        .cr-toggle-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; background: transparent; border-radius: 6px; font-weight: 600; font-size: 14px; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .cr-toggle-btn.active { background: #fff; color: #008ed3; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        
        .cr-search-box { display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; width: 300px; }
        .cr-search-box input { border: none; outline: none; margin-left: 8px; width: 100%; font-size: 14px; }
        
        .cr-grid-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow-x: auto; }
        .cr-table { width: 100%; border-collapse: collapse; text-align: center; }
        .cr-table th { padding: 16px; background: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0; }
        .cr-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 15px; }
        .cr-athlete-name { display: flex; align-items: center; gap: 12px; text-align: left; font-weight: 700; color: #0f172a; font-size: 15px; }
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
        .cr-metric-card.active-soreness { background: #fef2f2; border-color: #fecaca; box-shadow: 0 0 0 2px #ef4444; }
        .cr-metric-card.active-sleep { background: #eef2ff; border-color: #e0e7ff; box-shadow: 0 0 0 2px #6366f1; }
        .cr-metric-card.active-nutrition { background: #ecfdf5; border-color: #d1fae5; box-shadow: 0 0 0 2px #10b981; }
        .cr-metric-card.active-feeling { background: #e0f2fe; border-color: #bae6fd; box-shadow: 0 0 0 2px #0ea5e9; }
        
        .cr-metric-label { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
        .cr-metric-value { font-size: 24px; font-weight: 900; color: #0f172a; }
        .cr-metric-unit { font-size: 14px; font-weight: 500; color: #94a3b8; margin-left: 4px; }
        
        .cr-chart-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .cr-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .cr-chart-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
        .cr-select { padding: 8px 16px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 14px; font-weight: 600; cursor: pointer; outline: none; }
      `}</style>

      <div className="cr-header">
        <div className="cr-title-box">
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0 }}>
            <ArrowLeft size={28} />
          </button>
          <h1 className="cr-title">Wellness Dashboard</h1>
        </div>
        
        <div className="cr-toggle-bg">
          <button className={`cr-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
            <LayoutGrid size={16} /> Traffic Light
          </button>
          <button className={`cr-toggle-btn ${viewMode === 'charts' ? 'active' : ''}`} onClick={() => setViewMode('charts')}>
            <BarChart2 size={16} /> Deep Analysis
          </button>
        </div>
        
        {viewMode === 'grid' && (
          <div className="cr-search-box">
            <Search size={18} color="#94a3b8" />
            <input type="text" placeholder="Search athlete..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading Active Wellness Roster...</div>
      ) : viewMode === 'grid' ? (
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
              {filteredRoster.map(athlete => {
                const isAlert = athlete.status === 'fatigued';
                return (
                  <tr key={athlete.id} className={isAlert ? 'cr-alert-row' : ''}>
                    <td>
                      <div className="cr-athlete-name">
                        <div className="cr-avatar">{athlete.name.charAt(0)}</div>
                        {athlete.name}
                        {isAlert && <AlertCircle size={16} color="#dc2626" title="Fatigue Warning" />}
                      </div>
                    </td>
                    <td><span className={`status-badge ${getColorClass(athlete.grip, 'grip')}`}>{athlete.grip.toFixed(1)}</span></td>
                    <td><span className={`status-badge ${getColorClass(athlete.feeling, 'feeling')}`}>{athlete.feeling}/10</span></td>
                    <td><span className={`status-badge ${getColorClass(athlete.soreness, 'soreness')}`}>{athlete.soreness}/10</span></td>
                    <td><span className={`status-badge ${getColorClass(athlete.sleep, 'sleep')}`}>{athlete.sleep.toFixed(1)}h</span></td>
                    <td><span className={`status-badge ${getColorClass(athlete.nutrition, 'nutrition')}`}>{athlete.nutrition}/10</span></td>
                  </tr>
                );
              })}
              {filteredRoster.length === 0 && <tr><td colSpan="6" style={{ padding: '32px', color: '#64748b' }}>No athletes found with Wellness access.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cr-charts-view">
          <div className="cr-metrics">
            <button className={`cr-metric-card ${activeMetric === 'grip' ? 'active-grip' : ''}`} onClick={() => setActiveMetric('grip')}>
              <div className="cr-metric-label"><HandMetal size={16} color={activeMetric === 'grip' ? '#3b82f6' : 'currentColor'} /> Grip</div>
              <div className="cr-metric-value">{currentAvgGrip}<span className="cr-metric-unit">kg</span></div>
            </button>
            <button className={`cr-metric-card ${activeMetric === 'feeling' ? 'active-feeling' : ''}`} onClick={() => setActiveMetric('feeling')}>
              <div className="cr-metric-label"><Smile size={16} color={activeMetric === 'feeling' ? '#0ea5e9' : 'currentColor'} /> Feeling</div>
              <div className="cr-metric-value">{currentAvgFeeling}<span className="cr-metric-unit">/10</span></div>
            </button>
            <button className={`cr-metric-card ${activeMetric === 'soreness' ? 'active-soreness' : ''}`} onClick={() => setActiveMetric('soreness')}>
              <div className="cr-metric-label"><Heart size={16} color={activeMetric === 'soreness' ? '#ef4444' : 'currentColor'} /> Soreness</div>
              <div className="cr-metric-value">{currentAvgSoreness}<span className="cr-metric-unit">/10</span></div>
            </button>
            <button className={`cr-metric-card ${activeMetric === 'sleep' ? 'active-sleep' : ''}`} onClick={() => setActiveMetric('sleep')}>
              <div className="cr-metric-label"><Moon size={16} color={activeMetric === 'sleep' ? '#6366f1' : 'currentColor'} /> Sleep</div>
              <div className="cr-metric-value">{currentAvgSleep}<span className="cr-metric-unit">hrs</span></div>
            </button>
            <button className={`cr-metric-card ${activeMetric === 'nutrition' ? 'active-nutrition' : ''}`} onClick={() => setActiveMetric('nutrition')}>
              <div className="cr-metric-label"><Utensils size={16} color={activeMetric === 'nutrition' ? '#10b981' : 'currentColor'} /> Nutrition</div>
              <div className="cr-metric-value">{currentAvgNutrition}<span className="cr-metric-unit">/10</span></div>
            </button>
          </div>

          <div className="cr-chart-card">
            <div className="cr-chart-header">
              <h3 className="cr-chart-title">7-Day {selectedChartUser === 'team' ? 'Team Trend' : 'Player Trend'}</h3>
              <select value={selectedChartUser} onChange={(e) => setSelectedChartUser(e.target.value)} className="cr-select">
                <option value="team">Team Average</option>
                <optgroup label="Active Roster">
                  {wellnessRoster.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              </select>
            </div>
            
            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={baseChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold' }} formatter={(value) => [value.toFixed(1), '']} />
                  
                  {activeMetric === 'grip' && <Line type="monotone" dataKey="grip" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'feeling' && <Line type="monotone" dataKey="feeling" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'soreness' && <Line type="monotone" dataKey="soreness" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'sleep' && <Line type="monotone" dataKey="sleep" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  {activeMetric === 'nutrition' && <Line type="monotone" dataKey="nutrition" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      <HelpButton pageName="Coach Results" position="bottom-right" />
    </div>
  );
}
