import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, Square, Plus, Trash2, Save, Activity, Coffee, Volume2, VolumeX, ArrowLeft, ArrowUp, ArrowDown, X, Copy, Repeat, PlusCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';

// Audio URLs
const SOUNDS = {
  work: 'https://assets.mixkit.co/active_storage/sfx/1003/1003-preview.mp3', 
  rest: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', 
  finish: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3' 
};

export default function IntervalTimer() {
  const navigate = useNavigate();
  const { userEmail } = useAuth();
  
  const storageKey = `fp_intervals_${userEmail || 'guest'}`;

  // ==========================================
  // STATE
  // ==========================================
  const [presets, setPresets] = useState([]);
  const [activeSequence, setActiveSequence] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedAthleteId] = useState('');
  const [isLooping, setIsLooping] = useState(false);
  
  // Timer State
  const [timerState, setTimerState] = useState('idle'); 
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loopCount, setLoopCount] = useState(1);

  // Builder Inputs
  const [inputMin, setInputMin] = useState('');
  const [inputSec, setInputSec] = useState('');

  const audioRefs = useRef({});

  // ==========================================
  // INITIALIZATION
  // ==========================================
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setPresets(JSON.parse(saved)); } catch (e) {}
    }
    
    audioRefs.current = {
      work: new Audio(SOUNDS.work),
      rest: new Audio(SOUNDS.rest),
      finish: new Audio(SOUNDS.finish)
    };
  }, [storageKey]);

  // ==========================================
  // TIMER TICK LOGIC
  // ==========================================
  useEffect(() => {
    let interval = null;

    if (timerState === 'running' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timerState === 'running' && timeLeft === 0) {
      
      if (currentStepIndex < activeSequence.length - 1) {
        // Next Step in Sequence
        const nextIndex = currentStepIndex + 1;
        const nextStep = activeSequence[nextIndex];
        setCurrentStepIndex(nextIndex);
        setTimeLeft(nextStep.duration);
        playSound(nextStep.type);
      } else {
        // End of Sequence reached
        if (isLooping) {
          // INFINITE LOOP: Reset to step 0, increment round counter
          setLoopCount(prev => prev + 1);
          setCurrentStepIndex(0);
          setTimeLeft(activeSequence[0].duration);
          playSound(activeSequence[0].type);
        } else {
          // FINISHED
          setTimerState('finished');
          playSound('finish');
        }
      }
    }

    return () => clearInterval(interval);
  }, [timerState, timeLeft, currentStepIndex, activeSequence, isLooping]);

  // ==========================================
  // HELPERS
  // ==========================================
  const playSound = (type) => {
    if (!soundEnabled) return;
    try {
      if (audioRefs.current[type]) {
        audioRefs.current[type].currentTime = 0;
        audioRefs.current[type].play().catch(() => {});
      }
    } catch (e) {}
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getTotalTime = (sequence) => {
    const totalSecs = sequence.reduce((acc, step) => acc + step.duration, 0);
    return formatTime(totalSecs);
  };

  // ==========================================
  // BUILDER CONTROLS
  // ==========================================
  const addStep = (type) => {
    const m = parseInt(inputMin) || 0;
    const s = parseInt(inputSec) || 0;
    const duration = (m * 60) + s;
    
    if (duration <= 0) { alert("Please enter a valid time."); return; }

    setActiveSequence([...activeSequence, { id: Date.now() + Math.random(), type, duration }]);
    setInputMin('');
    setInputSec('');
  };

  const removeStep = (idToRemove) => {
    setActiveSequence(activeSequence.filter(s => s.id !== idToRemove));
  };

  const moveStep = (index, direction) => {
    const newSeq = [...activeSequence];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newSeq.length) return;
    [newSeq[index], newSeq[targetIndex]] = [newSeq[targetIndex], newSeq[index]];
    setActiveSequence(newSeq);
  };

  const addOneRound = () => {
    if (activeSequence.length === 0) return;
    
    const lastWork = [...activeSequence].reverse().find(s => s.type === 'work');
    const lastRest = [...activeSequence].reverse().find(s => s.type === 'rest');
    
    const newSteps = [];
    if (lastWork) newSteps.push({ id: Date.now() + Math.random(), type: 'work', duration: lastWork.duration });
    if (lastRest) newSteps.push({ id: Date.now() + Math.random() + 1, type: 'rest', duration: lastRest.duration });
    
    setActiveSequence([...activeSequence, ...newSteps]);
  };

  const duplicateSequence = () => {
    if (activeSequence.length === 0) return;
    const duplicated = activeSequence.map(step => ({ ...step, id: Date.now() + Math.random() }));
    setActiveSequence([...activeSequence, ...duplicated]);
  };

  // ==========================================
  // PRESET CONTROLS
  // ==========================================
  const savePreset = () => {
    if (!presetName.trim()) { alert("Please name your preset."); return; }
    if (activeSequence.length === 0) { alert("Add some intervals first!"); return; }

    const newPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      sequence: activeSequence,
      isLooping: isLooping
    };

    let updatedPresets = [...presets.filter(p => p.name !== newPreset.name), newPreset];
    if (updatedPresets.length > 10) updatedPresets = updatedPresets.slice(updatedPresets.length - 10);

    setPresets(updatedPresets);
    localStorage.setItem(storageKey, JSON.stringify(updatedPresets));
    setSelectedAthleteId(newPreset.id);
    alert("Timer saved!");
  };

  const loadPreset = (id) => {
    setSelectedAthleteId(id);
    if (!id) {
      setActiveSequence([]);
      setPresetName('');
      setIsLooping(false);
      return;
    }
    const preset = presets.find(p => p.id === id);
    if (preset) {
      setActiveSequence([...preset.sequence]);
      setPresetName(preset.name);
      setIsLooping(preset.isLooping || false);
    }
  };

  const deletePreset = (id) => {
    if (!confirm("Delete this preset?")) return;
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (selectedPresetId === id) {
      setSelectedAthleteId('');
      setActiveSequence([]);
      setPresetName('');
      setIsLooping(false);
    }
  };

  // ==========================================
  // TIMER CONTROLS
  // ==========================================
  const startTimer = () => {
    if (activeSequence.length === 0) return;
    
    if (soundEnabled) {
      Object.values(audioRefs.current).forEach(audio => {
        audio.play().then(() => audio.pause()).catch(() => {});
      });
    }

    setLoopCount(1);
    setCurrentStepIndex(0);
    setTimeLeft(activeSequence[0].duration);
    setTimerState('running');
    playSound(activeSequence[0].type); 
  };

  const stopTimer = () => {
    setTimerState('idle');
    setCurrentStepIndex(0);
    setTimeLeft(0);
    setLoopCount(1);
  };

  // ==========================================
  // RENDER: RUNNING TIMER (FULL SCREEN)
  // ==========================================
  if (timerState !== 'idle') {
    const isFinished = timerState === 'finished';
    const currentStep = activeSequence[currentStepIndex];
    const isWork = currentStep?.type === 'work';
    
    const bgColor = isFinished ? '#22c55e' : (isWork ? '#0ea5e9' : '#f59e0b');
    
    return (
      <div style={{ backgroundColor: bgColor, minHeight: '100vh', display: 'flex', flexDirection: 'column', color: 'white', fontFamily: '"SF Pro Display", sans-serif', transition: 'background-color 0.4s' }}>
        
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={stopTimer} style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: 'white', padding: '12px', borderRadius: '50%', cursor: 'pointer' }}>
            <X size={28} />
          </button>
          
          <div style={{ flex: 1 }}></div>

          <button onClick={() => setSoundEnabled(!soundEnabled)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            {soundEnabled ? <Volume2 size={28} /> : <VolumeX size={28} />}
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          
          {/* MASSIVE ROUND COUNTER FOR COACH VISIBILITY */}
          {isLooping && !isFinished && (
            <div style={{ fontSize: '56px', fontWeight: '900', letterSpacing: '4px', margin: '0 0 24px 0', padding: '12px 40px', backgroundColor: 'rgba(255, 255, 255, 0.25)', borderRadius: '24px', textShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              ROUND {loopCount}
            </div>
          )}

          <h2 style={{ fontSize: '32px', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 10px 0', opacity: 0.9 }}>
            {isFinished ? 'Workout Complete!' : `${isWork ? 'WORK' : 'REST'} INTERVAL`}
          </h2>
          
          {!isFinished && (
            <p style={{ fontSize: '20px', margin: '0 0 40px 0', opacity: 0.8, fontWeight: '600' }}>
              Step {currentStepIndex + 1} of {activeSequence.length}
            </p>
          )}

          <div style={{ fontSize: '130px', fontWeight: '800', lineHeight: 1, textShadow: '0 8px 32px rgba(0,0,0,0.2)', fontVariantNumeric: 'tabular-nums' }}>
            {isFinished ? 'DONE' : formatTime(timeLeft)}
          </div>
          
          {!isFinished && (
            <div style={{ marginTop: '60px', display: 'flex', gap: '20px' }}>
              <button 
                onClick={() => setTimerState(timerState === 'running' ? 'paused' : 'running')}
                style={{ 
                  backgroundColor: 'white', color: bgColor, border: 'none', borderRadius: '50px', 
                  padding: '20px 40px', fontSize: '24px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                }}
              >
                {timerState === 'running' ? <><Pause size={28}/> PAUSE</> : <><Play size={28}/> RESUME</>}
              </button>
            </div>
          )}
          
          {isFinished && (
            <button onClick={stopTimer} style={{ marginTop: '60px', backgroundColor: 'white', color: bgColor, border: 'none', borderRadius: '50px', padding: '20px 40px', fontSize: '24px', fontWeight: '700', cursor: 'pointer' }}>
              BACK TO MENU
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: BUILDER VIEW
  // ==========================================
  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto', fontFamily: '"Roboto Flex", sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', position: 'relative' }}>
      
      {/* HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          Interval Timer
        </h2>
      </div>

      {/* PRESET LOAD */}
      {presets.length > 0 && (
        <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Load Saved Timer (Max 10)</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select 
              value={selectedPresetId} 
              onChange={(e) => loadPreset(e.target.value)}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
            >
              <option value="">-- Create New Timer --</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({getTotalTime(p.sequence)}) {p.isLooping ? '🔁' : ''}</option>
              ))}
            </select>
            {selectedPresetId && (
              <button onClick={() => deletePreset(selectedPresetId)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* BUILDER INPUTS */}
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Add Interval Step</h3>
        
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Minutes</label>
            <input type="number" min="0" value={inputMin} onChange={e => setInputMin(e.target.value)} placeholder="0" style={{ width: '100%', padding: '12px', fontSize: '20px', textAlign: 'center', borderRadius: '8px', border: '2px solid #e2e8f0' }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#cbd5e1', alignSelf: 'center', marginTop: '16px' }}>:</div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Seconds</label>
            <input type="number" min="0" max="59" value={inputSec} onChange={e => setInputSec(e.target.value)} placeholder="0" style={{ width: '100%', padding: '12px', fontSize: '20px', textAlign: 'center', borderRadius: '8px', border: '2px solid #e2e8f0' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => addStep('work')} style={{ flex: 1, backgroundColor: '#e0f2fe', color: '#0284c7', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} /> Add WORK
          </button>
          <button onClick={() => addStep('rest')} style={{ flex: 1, backgroundColor: '#ffedd5', color: '#d97706', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <Coffee size={18} /> Add REST
          </button>
        </div>
      </div>

      {/* ACTIVE SEQUENCE LIST */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Sequence</h3>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#0ea5e9' }}>{isLooping ? '∞' : 'Total:'} {getTotalTime(activeSequence)}</span>
        </div>

        {activeSequence.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
            No intervals added yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeSequence.map((step, index) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: 'white', borderRadius: '8px', borderLeft: `4px solid ${step.type === 'work' ? '#0ea5e9' : '#f59e0b'}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '16px' }}>
                  <button onClick={() => moveStep(index, -1)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#cbd5e1' }} disabled={index === 0}><ArrowUp size={16} /></button>
                  <button onClick={() => moveStep(index, 1)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#cbd5e1' }} disabled={index === activeSequence.length - 1}><ArrowDown size={16} /></button>
                </div>
                
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '16px', color: step.type === 'work' ? '#0284c7' : '#d97706', textTransform: 'uppercase' }}>{step.type}</span>
                  <span style={{ fontSize: '18px', fontWeight: '600', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{formatTime(step.duration)}</span>
                </div>
                
                <button onClick={() => removeStep(step.id)} style={{ background: 'none', border: 'none', color: '#ef4444', padding: '8px', marginLeft: '12px', cursor: 'pointer' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {/* DUPLICATE BUTTONS */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button 
                onClick={addOneRound}
                style={{ flex: 1, padding: '12px', backgroundColor: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#475569', fontWeight: '600', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <PlusCircle size={16} /> +1 Round
              </button>
              <button 
                onClick={duplicateSequence}
                style={{ flex: 1, padding: '12px', backgroundColor: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#475569', fontWeight: '600', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <Copy size={16} /> x2 Duplicate All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SAVE / START CONTROLS */}
      {activeSequence.length > 0 && (
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              value={presetName} 
              onChange={e => setPresetName(e.target.value)} 
              placeholder="Name to save preset..." 
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
            />
            <button onClick={savePreset} style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '0 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={18} /> Save
            </button>
          </div>

          {/* INFINITE LOOP TOGGLE */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: isLooping ? '#e0f2fe' : '#f8fafc', border: `1px solid ${isLooping ? '#bae6fd' : '#e2e8f0'}`, borderRadius: '8px', marginBottom: '24px', cursor: 'pointer', transition: 'all 0.2s' }}>
            <input 
              type="checkbox" 
              checked={isLooping} 
              onChange={(e) => setIsLooping(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '15px', fontWeight: '600', color: isLooping ? '#0284c7' : '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Repeat size={18} /> Loop Continuously
            </span>
          </label>

          <button 
            onClick={startTimer}
            style={{ width: '100%', backgroundColor: '#10b981', color: 'white', border: 'none', padding: '18px', borderRadius: '12px', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
          >
            <Play size={24} fill="currentColor" /> Start Workout
          </button>
        </div>
      )}
      
      <HelpButton pageName="Interval Timer" position="bottom-right" />
    </div>
  );
}
