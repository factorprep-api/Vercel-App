import { useState, useRef, useCallback, useEffect } from 'react';

import { useAuth } from '../hooks/useAuth';
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Group } from 'react-konva';
import { addExerciseToLibrary } from '../api.js';

const DESIGN = { primaryBlue: '#008ed3', darkText: '#333', bodyGray: '#666', cardBackground: '#f8fafc', lightBackground: '#f5f5f5' };
const TOOLBAR_WIDTH = 240;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const DRAWING_TOOLS = ['select', 'line', 'arrow', 'rect', 'circle', 'text', 'player', 'cone'];
const FIELD_TEMPLATES = [{ name: 'Blank Canvas', id: 'blank', bgColor: '#ffffff' }, { name: 'Football/Soccer Field', id: 'football', bgColor: '#4a7c23' }, { name: 'Basketball Court', id: 'basketball', bgColor: '#d4a574' }];
const TEAM_COLORS = [{ name: 'Red', hex: '#dc2626' }, { name: 'Blue', hex: '#2563eb' }, { name: 'Yellow', hex: '#eab308' }, { name: 'Green', hex: '#22c55e' }, { name: 'Black', hex: '#000000' }];
const CONE_COLORS = ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7'];
const DRILL_TYPES = ['Offensive Play', 'Defensive Setup', 'Warm-up', 'Skill Drill', 'Conditioning', 'Game Situation'];

function PlayerMarker(props) {
  return (<Group x={props.x} y={props.y}><Line points={[0, -22, -14, 16, 14, 16, 0, -22]} closed fill={props.color} stroke="#fff" strokeWidth={2} />{props.text && (<Text text={props.text} fontSize={14} fontStyle="bold" fill="#fff" align="center" verticalAlign="middle" width={30} height={30} x={-15} y={-10} />)}</Group>);
}

function ConeMarker(props) {
  return (<Group x={props.x} y={props.y}><Circle radius={18} fill={props.coneColor} stroke="#000" strokeWidth={2} /><Circle radius={12} fill="#fff" stroke={props.coneColor} strokeWidth={1} /><Circle radius={6} fill={props.coneColor} /></Group>);
}

function FootballFieldLines() {
  return (
    <Layer listening={false}>
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#4a7c23" />
      <Rect x={10} y={10} width={CANVAS_WIDTH - 20} height={CANVAS_HEIGHT - 20} stroke="white" strokeWidth={3} fill="none" />
      <Line points={[CANVAS_WIDTH / 2, 10, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10]} stroke="white" strokeWidth={3} />
      <Circle x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} radius={CANVAS_HEIGHT * 0.15} stroke="white" strokeWidth={3} fill="none" />
      <Rect x={10} y={CANVAS_HEIGHT / 2 - CANVAS_HEIGHT * 0.15} width={CANVAS_WIDTH * 0.12} height={CANVAS_HEIGHT * 0.3} stroke="white" strokeWidth={2} fill="none" />
      <Rect x={CANVAS_WIDTH - 10 - CANVAS_WIDTH * 0.12} y={CANVAS_HEIGHT / 2 - CANVAS_HEIGHT * 0.15} width={CANVAS_WIDTH * 0.12} height={CANVAS_HEIGHT * 0.3} stroke="white" strokeWidth={2} fill="none" />
    </Layer>
  );
}

function BasketballCourtLines() {
  return (
    <Layer listening={false}>
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#d4a574" />
      <Rect x={10} y={10} width={CANVAS_WIDTH - 20} height={CANVAS_HEIGHT - 20} stroke="#333" strokeWidth={3} fill="none" />
      <Line points={[CANVAS_WIDTH / 2, 10, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10]} stroke="#333" strokeWidth={3} />
      <Circle x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} radius={45} stroke="#333" strokeWidth={3} fill="none" />
      <Rect x={10} y={CANVAS_HEIGHT / 2 - 85} width={CANVAS_WIDTH * 0.15} height={170} stroke="#333" strokeWidth={2} fill="none" />
      <Rect x={CANVAS_WIDTH - 10 - CANVAS_WIDTH * 0.15} y={CANVAS_HEIGHT / 2 - 85} width={CANVAS_WIDTH * 0.15} height={170} stroke="#333" strokeWidth={2} fill="none" />
    </Layer>
  );
}

function BlankCanvasBorder() {
  return (<Layer listening={false}><Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" /><Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} stroke="#ddd" strokeWidth={2} fill="none" /></Layer>);
}

let shapeIdCounter = 0;
function nextId() { shapeIdCounter++; return `shape-${shapeIdCounter}`; }

export default function Whiteboard() {
  const { userEmail: coachEmail, isLoading: authLoading, role } = useAuth();
  const [error, setError] = useState(null);
  const stageRef = useRef(null);

  useEffect(() => {
    if (stageRef.current?.container()) {
      const bgColor = FIELD_TEMPLATES.find(t => t.id === currentTemplate)?.bgColor || '#ffffff';
      stageRef.current.container().style.backgroundColor = bgColor;
    }
  }, [currentTemplate]);

  const shapesRef = useRef([]);
  const historyRef = useRef([[]]);
  const historyIndexRef = useRef(0);
  const isDrawingRef = useRef(false);

  const [tool, setTool] = useState('select');
  const [strokeColor, setStrokeColor] = useState('#000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [teamColor, setTeamColor] = useState(TEAM_COLORS[0].hex);
  const [coneColor, setConeColor] = useState(CONE_COLORS[0]);
  const [playerNumber, setPlayerNumber] = useState('');
  const [currentTemplate, setCurrentTemplate] = useState(FIELD_TEMPLATES[0].id);
  const [, forceRender] = useState({});
  const rerender = useCallback(() => forceRender({}), []);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [drillType, setDrillType] = useState('Offensive Play');
  const [saving, setSaving] = useState(false);

  const templateObj = FIELD_TEMPLATES.find(t => t.id === currentTemplate) || FIELD_TEMPLATES[0];

  if (authLoading) return <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '20px', backgroundColor: DESIGN.cardBackground }}>Loading...</div>;
  if (!coachEmail) return <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '20px', backgroundColor: DESIGN.cardBackground }}>Please log in to access the whiteboard.</div>;
  if (role !== 'coach') return <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '20px', backgroundColor: DESIGN.cardBackground }}>Coach access only.</div>;

  const addToHistory = () => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(JSON.parse(JSON.stringify(shapesRef.current)));
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    rerender();
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      shapesRef.current = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
      rerender();
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      shapesRef.current = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
      rerender();
    }
  };

  const handleMouseDown = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (tool === 'select' || !clickedOnEmpty) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const id = nextId();
    if (tool === 'text') { const newText = window.prompt('Enter text:', ''); if (newText) { shapesRef.current = [...shapesRef.current, { id, type: 'text', x: pos.x, y: pos.y, text: newText, fontSize: 18, fontFamily: '"Roboto Flex", sans-serif', fill: strokeColor, fontStyle: 'bold' }]; addToHistory(); } }
    else if (tool === 'player') { shapesRef.current = [...shapesRef.current, { id, type: 'player', x: pos.x, y: pos.y, teamColor, number: playerNumber }]; addToHistory(); }
    else if (tool === 'cone') { shapesRef.current = [...shapesRef.current, { id, type: 'cone', x: pos.x, y: pos.y, coneColor }]; addToHistory(); }
    else { isDrawingRef.current = true; const newShape = { id, type: tool, stroke: strokeColor, strokeWidth, lineCap: 'round' }; if (tool === 'line' || tool === 'arrow') { newShape.points = [pos.x, pos.y, pos.x, pos.y]; if (tool === 'arrow') { newShape.pointerLength = 12; newShape.pointerWidth = 12; } } else if (tool === 'rect') { newShape.x = pos.x; newShape.y = pos.y; newShape.width = 0; newShape.height = 0; newShape.fill = strokeColor; newShape.opacity = 0.3; } else if (tool === 'circle') { newShape.x = pos.x; newShape.y = pos.y; newShape.radius = 0; newShape.fill = strokeColor; newShape.opacity = 0.3; } shapesRef.current = [...shapesRef.current, newShape]; rerender(); }
  };

  const handleMouseMove = (e) => {
    if (!isDrawingRef.current) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const current = shapesRef.current[shapesRef.current.length - 1];
    if (!current) return;
    const updated = { ...current };
    if (current.type === 'line' || current.type === 'arrow') updated.points = [current.points[0], current.points[1], pos.x, pos.y];
    else if (current.type === 'rect') { updated.width = pos.x - current.x; updated.height = pos.y - current.y; }
    else if (current.type === 'circle') updated.radius = Math.max(1, Math.sqrt(Math.pow(pos.x - current.x, 2) + Math.pow(pos.y - current.y, 2)));
    shapesRef.current = [...shapesRef.current.slice(0, -1), updated];
    rerender();
  };

  const handleMouseUp = () => { if (isDrawingRef.current) { isDrawingRef.current = false; addToHistory(); } };
  const handleClear = () => { if (window.confirm('Clear all drawings?')) { shapesRef.current = []; addToHistory(); } };

  const handleTemplateChange = (newTemplate) => { if (shapesRef.current.length > 0 && !window.confirm('Changing templates will clear drawings. Continue?')) return; setCurrentTemplate(newTemplate); shapesRef.current = []; historyRef.current = [[]]; historyIndexRef.current = 0; rerender(); };

  const handleSave = async () => {
    if (!exerciseTitle.trim()) { alert('Please enter a drill name'); return; }
    setSaving(true);
    setError(null);
    try {
      const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
      const base64Data = uri.split(',')[1];
      await addExerciseToLibrary({ name: exerciseTitle, video: base64Data, muscle: currentTemplate, baseLift: drillType, multiplier: 1, ownerEmail: coachEmail, txtNotes: exerciseNotes });
      setShowSaveModal(false);
      setExerciseTitle('');
      setExerciseNotes('');
      alert('Drill saved to exercise library successfully!');
    } catch (err) { console.error('Save error:', err); setError(err.message || 'Failed to save drill.'); alert(`Error: ${err.message || 'Failed to save drill.'}`); } finally { setSaving(false); }
  };

  const renderShapes = () => shapesRef.current.map((shape) => {
    switch (shape.type) { case 'line': return <Line key={shape.id} {...shape} />; case 'arrow': return <Arrow key={shape.id} {...shape} />; case 'rect': return <Rect key={shape.id} {...shape} />; case 'circle': return <Circle key={shape.id} {...shape} />; case 'text': return <Text key={shape.id} {...shape} />; case 'player': return <PlayerMarker key={shape.id} x={shape.x} y={shape.y} color={shape.teamColor} text={shape.number} />; case 'cone': return <ConeMarker key={shape.id} x={shape.x} y={shape.y} coneColor={shape.coneColor} />; default: return null; }
  });

  const getFieldLines = () => { if (currentTemplate === 'football') return <FootballFieldLines />; if (currentTemplate === 'basketball') return <BasketballCourtLines />; return <BlankCanvasBorder />; };
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', display: 'flex', height: '100vh', backgroundColor: DESIGN.cardBackground }}>
      <div style={{ width: TOOLBAR_WIDTH, backgroundColor: '#fff', borderRight: `1px solid ${DESIGN.bodyGray}`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}><h2 style={{ margin: '0 0 5px 0', fontSize: '18px', fontWeight: '700', color: DESIGN.darkText }}>Drill Designer</h2><p style={{ margin: 0, fontSize: '12px', color: DESIGN.bodyGray }}>Create training drills</p></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>FIELD TEMPLATE</label><select value={currentTemplate} onChange={(e) => handleTemplateChange(e.target.value)} style={{ width: '100%', padding: '8px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', fontFamily: '"Roboto Flex", sans-serif', fontSize: '13px' }}>{FIELD_TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>TOOLS</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>{DRAWING_TOOLS.map((t) => (<button key={t} onClick={() => setTool(t)} style={{ padding: '8px 4px', border: tool === t ? `2px solid ${DESIGN.primaryBlue}` : `1px solid #ddd`, borderRadius: '4px', backgroundColor: tool === t ? DESIGN.primaryBlue : '#fff', color: tool === t ? '#fff' : DESIGN.darkText, cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase', fontWeight: '600', minHeight: '32px' }}>{t}</button>))}</div><p style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>Drag to draw. Release to finish.</p></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>COLOR</label><div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>{['#000', '#dc2626', '#2563eb', '#eab308', '#22c55e', '#a855f7', '#ffffff'].map((color) => (<button key={color} onClick={() => setStrokeColor(color)} style={{ width: '32px', height: '32px', border: strokeColor === color ? `2px solid ${DESIGN.primaryBlue}` : '1px solid #ddd', borderRadius: '50%', backgroundColor: color, cursor: 'pointer' }} />))}</div></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>THICKNESS: {strokeWidth}px</label><input type="range" min="1" max="10" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} style={{ width: '100%' }} /></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>PLAYER COLOR</label><div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>{TEAM_COLORS.map((tc) => (<button key={tc.name} onClick={() => setTeamColor(tc.hex)} style={{ width: '32px', height: '32px', border: teamColor === tc.hex ? `2px solid ${DESIGN.primaryBlue}` : '1px solid #ddd', borderRadius: '4px', backgroundColor: tc.hex, cursor: 'pointer', fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>{tc.name[0]}</button>))}</div></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>PLAYER NUMBER</label><input type="text" value={playerNumber} onChange={(e) => setPlayerNumber(e.target.value.slice(0, 3))} placeholder="e.g. 1, 10, ST" maxLength={3} style={{ width: '100%', padding: '8px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', fontFamily: '"Roboto Flex", sans-serif', fontSize: '14px', boxSizing: 'border-box' }} /><p style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>Shown inside the player marker</p></div>
          <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>CONE COLOR</label><div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>{CONE_COLORS.map((color) => (<button key={color} onClick={() => setConeColor(color)} style={{ width: '32px', height: '32px', border: coneColor === color ? `2px solid ${DESIGN.primaryBlue}` : '1px solid #ddd', borderRadius: '4px', backgroundColor: color, cursor: 'pointer' }} />))}</div></div>
        </div>
        <div style={{ borderTop: `1px solid #eee`, padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px' }}><button onClick={handleUndo} disabled={!canUndo} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '4px', backgroundColor: !canUndo ? '#ccc' : DESIGN.primaryBlue, color: '#fff', cursor: !canUndo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px' }}>Undo</button><button onClick={handleRedo} disabled={!canRedo} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '4px', backgroundColor: !canRedo ? '#ccc' : DESIGN.primaryBlue, color: '#fff', cursor: !canRedo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px' }}>Redo</button></div>
          <button onClick={handleClear} style={{ padding: '10px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', backgroundColor: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Clear All</button>
          <button onClick={() => setShowSaveModal(true)} style={{ padding: '12px', border: 'none', borderRadius: '4px', backgroundColor: DESIGN.primaryBlue, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Save to Library</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: DESIGN.lightBackground, overflow: 'auto' }}><div style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.1)', backgroundColor: templateObj.bgColor }}><Stage ref={stageRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}>{getFieldLines()}<Layer>{renderShapes()}</Layer></Stage></div></div>
      {showSaveModal && (<div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}><div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '25px', minWidth: '400px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}><h3 style={{ margin: '0 0 20px 0', color: DESIGN.darkText }}>Save Drill</h3>{error && (<div style={{ padding: '10px', backgroundColor: '#fee', borderRadius: '4px', marginBottom: '15px', color: '#c00' }}>{error}</div>)}/>
<div style={{ marginBottom: '15px' }}><label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: DESIGN.darkText }}>Drill Name *</label><input type="text" value={exerciseTitle} onChange={(e) => setExerciseTitle(e.target.value)} placeholder="e.g., Zone Defense Formation" style={{ width: '100%', padding: '10px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', fontFamily: '"Roboto Flex", sans-serif', fontSize: '14px', boxSizing: 'border-box' }} autoFocus /></div>
<div style={{ marginBottom: '15px' }}><label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: DESIGN.darkText }}>Drill Type</label><select value={drillType} onChange={(e) => setDrillType(e.target.value)} style={{ width: '100%', padding: '10px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', fontFamily: '"Roboto Flex", sans-serif', fontSize: '14px', boxSizing: 'border-box' }}>{DRILL_TYPES.map((dt) => (<option key={dt} value={dt}>{dt}</option>))}</select></div>
<div style={{ marginBottom: '20px' }}><label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: DESIGN.darkText }}>Notes</label><textarea value={exerciseNotes} onChange={(e) => setExerciseNotes(e.target.value)} placeholder="Describe the drill setup, objectives, or instructions..." rows={4} style={{ width: '100%', padding: '10px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', fontFamily: '"Roboto Flex", sans-serif', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} /></div>
<div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button onClick={() => setShowSaveModal(false)} disabled={saving} style={{ padding: '10px 20px', border: `1px solid ${DESIGN.bodyGray}`, borderRadius: '4px', backgroundColor: '#fff', color: DESIGN.darkText, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>Cancel</button><button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: saving ? '#aaa' : DESIGN.primaryBlue, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>{saving ? 'Saving...' : 'Save Drill'}</button></div></div></div>)}
    </div>
  );
}
