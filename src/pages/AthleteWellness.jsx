import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Heart, Moon, Utensils, Smile, HandMetal, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';

export default function AthleteWellness() {
  const { userEmail } = useAuth();
  const navigate = useNavigate();

  // The 5 Metrics
  const [grip, setGrip] = useState('');
  const [feeling, setFeeling] = useState(5);
  const [soreness, setSoreness] = useState(5);
  const [sleep, setSleep] = useState(7.5);
  const [nutrition, setNutrition] = useState(5);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // MOCK SAVE
  async function handleSave() {
    if (!grip) { alert("Please enter your Grip Strength."); return; }
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => navigate(-1), 1500);
  }

  if (saveSuccess) {
    return (
      <div className="aw-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <CheckCircle size={64} color="#10b981" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: '#0f172a', margin: 0 }}>Logged Successfully!</h2>
        <p style={{ color: '#64748b' }}>Your coach has received your data.</p>
      </div>
    );
  }

  return (
    <div className="aw-container">
      <style>{`
        .aw-container { padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 100px; }
        .aw-header { display: flex; align-items: center; margin-bottom: 24px; }
        .aw-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        .aw-subtitle { color: #64748b; font-size: 14px; margin-top: 4px; margin-bottom: 24px; }
        
        .aw-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .aw-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .aw-card-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; color: #334155; margin: 0; }
        .aw-card-value { font-size: 20px; font-weight: 900; }
        
        .aw-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; outline: none; margin: 10px 0; }
        .aw-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 2px solid; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .aw-slider::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 2px solid; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        
        .slider-feeling { background: #e0f2fe; }
        .slider-feeling::-webkit-slider-thumb { border-color: #0ea5e9; }
        .slider-soreness { background: #fecaca; }
        .slider-soreness::-webkit-slider-thumb { border-color: #ef4444; }
        .slider-sleep { background: #e0e7ff; }
        .slider-sleep::-webkit-slider-thumb { border-color: #6366f1; }
        .slider-nutrition { background: #d1fae5; }
        .slider-nutrition::-webkit-slider-thumb { border-color: #10b981; }
        
        .aw-slider-labels { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #94a3b8; margin-top: 4px; }
        
        .aw-input-grip { width: 100%; padding: 12px; font-size: 18px; font-weight: 700; color: #0f172a; border: 2px solid #e2e8f0; border-radius: 8px; text-align: center; outline: none; transition: border-color 0.2s; }
        .aw-input-grip:focus { border-color: #3b82f6; }
        
        .aw-save-btn { width: 100%; background-color: #008ed3; color: white; border: none; padding: 16px; font-size: 16px; font-weight: 700; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; box-shadow: 0 4px 12px rgba(0, 142, 211, 0.3); transition: background-color 0.2s; }
      `}</style>

      <div className="aw-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <h1 className="aw-title">Daily Readiness</h1>
        </div>
      </div>
      <p className="aw-subtitle">Log your morning metrics to help us optimize your training load today.</p>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><HandMetal size={20} color="#3b82f6" /> Grip Strength (Dyno)</h3>
        </div>
        <input 
          type="number" step="0.1" 
          className="aw-input-grip" 
          placeholder="Enter kg (e.g. 45.2)" 
          value={grip} onChange={(e) => setGrip(e.target.value)} 
        />
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Smile size={20} color="#0ea5e9" /> 1. How are you feeling?</h3>
          <span className="aw-card-value" style={{ color: '#0ea5e9' }}>{feeling}/10</span>
        </div>
        <input 
          type="range" min="1" max="10" step="1" 
          className="aw-slider slider-feeling" 
          value={feeling} onChange={(e) => setFeeling(e.target.value)} 
        />
        <div className="aw-slider-labels"><span>1 (Terrible)</span><span>10 (Prime)</span></div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Heart size={20} color="#ef4444" /> 2. Muscle Soreness</h3>
          <span className="aw-card-value" style={{ color: '#ef4444' }}>{soreness}/10</span>
        </div>
        <input 
          type="range" min="1" max="10" step="1" 
          className="aw-slider slider-soreness" 
          value={soreness} onChange={(e) => setSoreness(e.target.value)} 
        />
        <div className="aw-slider-labels"><span>1 (Extreme)</span><span>10 (None)</span></div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Moon size={20} color="#6366f1" /> 3. How was your Sleep?</h3>
          <span className="aw-card-value" style={{ color: '#6366f1' }}>{sleep} hrs</span>
        </div>
        <input 
          type="range" min="0" max="12" step="0.5" 
          className="aw-slider slider-sleep" 
          value={sleep} onChange={(e) => setSleep(e.target.value)} 
        />
        <div className="aw-slider-labels"><span>0 hrs</span><span>12 hrs</span></div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <h3 className="aw-card-title"><Utensils size={20} color="#10b981" /> 4. How was your Nutrition?</h3>
          <span className="aw-card-value" style={{ color: '#10b981' }}>{nutrition}/10</span>
        </div>
        <input 
          type="range" min="1" max="10" step="1" 
          className="aw-slider slider-nutrition" 
          value={nutrition} onChange={(e) => setNutrition(e.target.value)} 
        />
        <div className="aw-slider-labels"><span>1 (Poor)</span><span>10 (Perfect)</span></div>
      </div>

      <button className="aw-save-btn" onClick={handleSave} disabled={saving}>
        <Save size={20} /> {saving ? 'SAVING...' : 'SAVE LOG'}
      </button>

      <HelpButton pageName="Wellness Input" position="bottom-right" />
    </div>
  );
}
