// src/pages/Whiteboard.jsx
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Group } from 'react-konva';
import { addExerciseToLibrary } from '../api.js';

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const DESIGN = {
  primaryBlue: '#008ed3',
  darkText: '#333',
  bodyGray: '#666',
  lightBackground: '#f5f5f5',
  cardBackground: '#f8fafc',
};

const TOOLBAR_WIDTH = 220;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;

const DRAWING_TOOLS = ['select', 'line', 'arrow', 'rect', 'circle', 'text', 'player'];

const FIELD_TEMPLATES = [
  { name: 'Blank Canvas', id: 'blank' },
  { name: 'Football/Soccer Field', id: 'football' },
  { name: 'Basketball Court', id: 'basketball' },
];

const PLAYER_COLORS = [
  { name: 'Red', hex: '#dc2626' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Green', hex: '#22c55e' },
];

const DRILL_TYPES = [
  'Offensive Play',
  'Defensive Setup',
  'Warm-up',
  'Skill Drill',
  'Conditioning',
  'Game Situation',
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function getEmptyShape(type, config = {}) {
  switch (type) {
    case 'line':
      return {
        id: `${Date.now()}-${Math.random()}`,
        type: 'line',
        points: config.points || [],
        stroke: config.stroke || '#000',
        strokeWidth: config.strokeWidth || 2,
        lineCap: 'round',
      };
    case 'arrow':
      return {
        id: `${Date.now()}-${Math.random()}`,
        type: 'arrow',
        points: config.points || [],
        stroke: config.stroke || '#000',
        strokeWidth: config.strokeWidth || 2,
        pointerLength: 10,
        pointerWidth: 10,
      };
    case 'rect':
      return {
        id: `${Date.now()}-${Math.random()}`,
        type: 'rect',
        x: config.x || 0,
        y: config.y || 0,
        width: config.width || 50,
        height: config.height || 50,
        fill: config.fill || '#000',
        opacity: config.opacity ?? 0.3,
        stroke: config.stroke || '#000',
        strokeWidth: 2,
        cornerRadius: 0,
      };
    case 'circle':
      return {
        id: `${Date.now()}-${Math.random()}`,
        type: 'circle',
        x: config.x || 0,
        y: config.y || 0,
        radius: config.radius || 25,
        fill: config.fill || '#000',
        opacity: config.opacity ?? 0.3,
        stroke: config.stroke || '#000',
        strokeWidth: 2,
      };
    case 'text':
      return {
        id: `${Date.now()}-${Math.random()}`,
        type: 'text',
        x: config.x || 0,
        y: config.y || 0,
        text: config.text || '',
        fontSize: config.fontSize || 16,
        fontFamily: "'Roboto Flex', sans-serif",
        fill: config.fill || '#000',
        fontStyle: 'normal',
      };
    case 'player':
      return {
        id: `${Date.now()}-${Math.random()}`,
        type: 'player',
        x: config.x || 0,
        y: config.y || 0,
        teamColor: config.teamColor || PLAYER_COLORS[0].hex,
        number: config.number || '',
      };
    default:
      return null;
  }
}

// ============================================
// SPORT TEMPLATES (BACKGROUND LAYERS)
// ============================================

function FootballFieldTemplate() {
  return (
    <Layer listening={false}>
      {/* Green field */}
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#2d5016" />
      {/* White boundary lines */}
      <Rect x={10} y={10} width={CANVAS_WIDTH - 20} height={CANVAS_HEIGHT - 20} stroke="white" strokeWidth={3} fill="none" />
      {/* Center line */}
      <Line points={[CANVAS_WIDTH / 2, 10, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10]} stroke="white" strokeWidth={3} />
      {/* Center circle */}
      <Circle x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} radius={CANVAS_HEIGHT * 0.15} stroke="white" strokeWidth={3} fill="none" />
      {/* Penalty boxes */}
      <Rect x={10} y={CANVAS_HEIGHT / 2 - CANVAS_HEIGHT * 0.15} width={CANVAS_WIDTH * 0.12} height={CANVAS_HEIGHT * 0.3} stroke="white" strokeWidth={3} fill="none" />
      <Rect x={CANVAS_WIDTH - 10 - CANVAS_WIDTH * 0.12} y={CANVAS_HEIGHT / 2 - CANVAS_HEIGHT * 0.15} width={CANVAS_WIDTH * 0.12} height={CANVAS_HEIGHT * 0.3} stroke="white" strokeWidth={3} fill="none" />
      {/* Goals */}
      <Rect x={0} y={CANVAS_HEIGHT / 2 - CANVAS_HEIGHT * 0.08} width={10} height={CANVAS_HEIGHT * 0.16} fill="white" opacity={0.5} />
      <Rect x={CANVAS_WIDTH - 10} y={CANVAS_HEIGHT / 2 - CANVAS_HEIGHT * 0.08} width={10} height={CANVAS_HEIGHT * 0.16} fill="white" opacity={0.5} />
      {/* Corner arcs */}
      <Line points={[10, 10, 50, 10, 10, 50]} stroke="white" strokeWidth={3} />
      <Line points={[CANVAS_WIDTH - 10, 10, CANVAS_WIDTH - 50, 10, CANVAS_WIDTH - 10, 50]} stroke="white" strokeWidth={3} />
      <Line points={[10, CANVAS_HEIGHT - 10, 50, CANVAS_HEIGHT - 10, 10, CANVAS_HEIGHT - 50]} stroke="white" strokeWidth={3} />
      <Line points={[CANVAS_WIDTH - 10, CANVAS_HEIGHT - 10, CANVAS_WIDTH - 50, CANVAS_HEIGHT - 10, CANVAS_WIDTH - 10, CANVAS_HEIGHT - 50]} stroke="white" strokeWidth={3} />
    </Layer>
  );
}

function BasketballCourtTemplate() {
  return (
    <Layer listening={false}>
      {/* Court floor */}
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#f5deb3" />
      {/* Boundary lines */}
      <Rect x={10} y={10} width={CANVAS_WIDTH - 20} height={CANVAS_HEIGHT - 20} stroke="#333" strokeWidth={3} fill="none" />
      {/* Center line */}
      <Line points={[CANVAS_WIDTH / 2, 10, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10]} stroke="#333" strokeWidth={3} />
      {/* Center circle */}
      <Circle x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} radius={40} stroke="#333" strokeWidth={3} fill="none" />
      {/* Keys (paint areas) */}
      <Rect x={10} y={CANVAS_HEIGHT / 2 - 80} width={CANVAS_WIDTH * 0.15} height={160} stroke="#333" strokeWidth={3} fill="none" />
      <Rect x={CANVAS_WIDTH - 10 - CANVAS_WIDTH * 0.15} y={CANVAS_HEIGHT / 2 - 80} width={CANVAS_WIDTH * 0.15} height={160} stroke="#333" strokeWidth={3} fill="none" />
      {/* Three-point arcs */}
      <Line points={[CANVAS_WIDTH * 0.15, CANVAS_HEIGHT / 2 - 200, CANVAS_WIDTH * 0.15 + 150, CANVAS_HEIGHT / 2 - 200, CANVAS_WIDTH * 0.15 + 150, CANVAS_HEIGHT / 2 + 200, CANVAS_WIDTH * 0.15, CANVAS_HEIGHT / 2 + 200]} stroke="#333" strokeWidth={3} />
      <Line points={[CANVAS_WIDTH - CANVAS_WIDTH * 0.15, CANVAS_HEIGHT / 2 - 200, CANVAS_WIDTH - CANVAS_WIDTH * 0.15 - 150, CANVAS_HEIGHT / 2 - 200, CANVAS_WIDTH - CANVAS_WIDTH * 0.15 - 150, CANVAS_HEIGHT / 2 + 200, CANVAS_WIDTH - CANVAS_WIDTH * 0.15, CANVAS_HEIGHT / 2 + 200]} stroke="#333" strokeWidth={3} />
      {/* Hoops */}
      <Circle x={CANVAS_WIDTH * 0.15 + 20} y={CANVAS_HEIGHT / 2} radius={15} stroke="#333" strokeWidth={2} fill="#ff6600" />
      <Circle x={CANVAS_WIDTH - CANVAS_WIDTH * 0.15 - 20} y={CANVAS_HEIGHT / 2} radius={15} stroke="#333" strokeWidth={2} fill="#ff6600" />
    </Layer>
  );
}

function BlankCanvasTemplate() {
  return (
    <Layer listening={false}>
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" stroke="#ddd" strokeWidth={2} />
    </Layer>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Whiteboard() {
  const { userEmail: coachEmail, isLoading: authLoading, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const stageRef = useRef(null);
  const [tool, setTool] = useState('select');
  const [selectedToolConfig, setSelectedToolConfig] = useState({ stroke: '#000', strokeWidth: 2, fill: '#000', teamColor: PLAYER_COLORS[0].hex });
  const [currentTemplate, setCurrentTemplate] = useState(FIELD_TEMPLATES[0].id);
  const [shapes, setShapes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // History for undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [drillType, setDrillType] = useState('Offensive Play');
  const [saving, setSaving] = useState(false);

  // Load cached session
  useEffect(() => {
    const cached = localStorage.getItem('fp_whiteboard_session');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setCurrentTemplate(parsed.template || 'blank');
      } catch (e) {
        console.error('Failed to parse cached session');
      }
    }
    setLoading(false);
  }, []);

  // Auth guards
  if (authLoading) return <div style={{ fontFamily: "'Roboto Flex', sans-serif", padding: '4px', backgroundColor: DESIGN.cardBackground }}>Loading...</div>;
  if (!coachEmail) return <div style={{ fontFamily: "'Roboto Flex', sans-serif", padding: '4px', backgroundColor: DESIGN.cardBackground }}>Please log in to access the whiteboard.</div>;
  if (role !== 'coach') return <div style={{ fontFamily: "'Roboto Flex', sans-serif", padding: '4px', backgroundColor: DESIGN.cardBackground }}>Coach access only.</div>;

  // ============================================
  // HISTORY MANAGEMENT
  // ============================================

  const addToHistory = (newShapes) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    localStorage.setItem('fp_whiteboard_session', JSON.stringify({
      shapes: newShapes,
      template: currentTemplate,
      tool,
      config: selectedToolConfig,
    }));
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setShapes(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setShapes(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  // Initialize history
  useEffect(() => {
    if (shapes.length > 0 && (history.length === 0 || history[historyIndex]?.length !== shapes.length)) {
      addToHistory(shapes);
    }
  }, [shapes]);

  // ============================================
  // CANVAS EVENTS
  // ============================================

  const handleMouseDown = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    
    if (tool === 'select') {
      if (clickedOnEmpty) {
        // Clear selection (future enhancement)
      }
      return;
    }

    if (!clickedOnEmpty) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    let newShape;

    if (tool === 'text') {
      const newText = window.prompt('Enter text:', '');
      if (newText) {
        newShape = getEmptyShape('text', { ...pos, text: newText, fill: selectedToolConfig.stroke });
        setShapes([...shapes, newShape]);
      }
    } else if (tool === 'player') {
      newShape = getEmptyShape('player', { 
        ...pos, 
        teamColor: selectedToolConfig.teamColor 
      });
      setShapes([...shapes, newShape]);
      setTool('select'); // Auto-switch to select after placing player
    } else {
      // Start drawing line, arrow, rect, or circle
      setIsDrawing(true);
      newShape = getEmptyShape(tool, { 
        ...pos, 
        stroke: selectedToolConfig.stroke, 
        strokeWidth: selectedToolConfig.strokeWidth,
        fill: selectedToolConfig.fill,
      });
      if (tool === 'rect' || tool === 'circle') {
        newShape.width = 0;
        newShape.height = 0;
        newShape.radius = 0;
      }
      setShapes([...shapes, newShape]);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !shapes.length) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const lastShape = shapes[shapes.length - 1];
    let updatedShape = { ...lastShape };

    if (lastShape.type === 'line' || lastShape.type === 'arrow') {
      updatedShape.points = [...lastShape.points.slice(0, 2), pos.x, pos.y];
    } else if (lastShape.type === 'rect') {
      updatedShape.width = pos.x - lastShape.x;
      updatedShape.height = pos.y - lastShape.y;
    } else if (lastShape.type === 'circle') {
      updatedShape.radius = Math.sqrt(Math.pow(pos.x - lastShape.x, 2) + Math.pow(pos.y - lastShape.y, 2));
    }

    setShapes([...shapes.slice(0, -1), updatedShape]);
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setTimeout(() => addToHistory(shapes), 0);
    }
  };

  const handleClear = () => {
    if (window.confirm('Clear all drawings?')) {
      setShapes([]);
      setTimeout(() => addToHistory([]), 0);
    }
  };

  const handleTemplateChange = (newTemplate) => {
    if (shapes.length > 0 && !window.confirm('Changing templates will clear drawings. Continue?')) {
      return;
    }
    setCurrentTemplate(newTemplate);
    setShapes([]);
  };

  // ============================================
  // SAVE FUNCTIONALITY
  // ============================================

  const handleSave = async () => {
    if (!exerciseTitle.trim()) {
      alert('Please enter a drill name');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Export canvas as PNG at higher resolution
      const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
      const base64Data = uri.split(',')[1];

      // Use existing API with mapped fields
      await addExerciseToLibrary({
        name: exerciseTitle,
        video: base64Data,
        muscle: currentTemplate,
        baseLift: drillType,
        multiplier: 1,
        ownerEmail: coachEmail,
        txtNotes: exerciseNotes,
      });

      // Success feedback
      localStorage.removeItem('fp_whiteboard_session');
      setShowSaveModal(false);
      setExerciseTitle('');
      setExerciseNotes('');
      alert('Drill saved to exercise library successfully!');
    } catch (err) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save drill.');
      alert(`Error: ${err.message || 'Failed to save drill.'}`);
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // RENDER HELPERS
  // ============================================

  const renderShapes = () => {
    return shapes.map((shape) => {
      switch (shape.type) {
        case 'line':
          return <Line key={shape.id} {...shape} />;
        case 'arrow':
          return <Arrow key={shape.id} {...shape} />;
        case 'rect':
          return <Rect key={shape.id} {...shape} />;
        case 'circle':
          return <Circle key={shape.id} {...shape} />;
        case 'text':
          return <Text key={shape.id} {...shape} />;
        case 'player':
          return (
            <Group key={shape.id} x={shape.x} y={shape.y}>
              <Circle radius={20} fill={shape.teamColor} stroke="#fff" strokeWidth={2} />
              {shape.number && (
                <Text 
                  text={shape.number} 
                  fontSize={16} 
                  fontWeight="bold"
                  fill="#fff"
                  x={-8}
                  y={-8}
                />
              )}
            </Group>
          );
        default:
          return null;
      }
    });
  };

  const getTemplateComponent = () => {
    switch (currentTemplate) {
      case 'football':
        return <FootballFieldTemplate />;
      case 'basketball':
        return <BasketballCourtTemplate />;
      default:
        return <BlankCanvasTemplate />;
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div style={{ fontFamily: "'Roboto Flex', sans-serif", display: 'flex', height: '100vh', backgroundColor: DESIGN.cardBackground }}>
      {/* SIDEBAR TOOLBAR */}
      <div style={{ width: TOOLBAR_WIDTH, backgroundColor: '#fff', borderRight: `1px solid ${DESIGN.bodyGray}`, display: 'flex', flexDirection: 'column', padding: '15px', overflowY: 'auto', boxSizing: 'border-box' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '18px', fontWeight: '700', color: DESIGN.darkText }}>Drill Designer</h2>
          <p style={{ margin: 0, fontSize: '12px', color: DESIGN.bodyGray }}>Create training drills</p>
        </div>

        {/* Sport Template */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>FIELD TEMPLATE</label>
          <select
            value={currentTemplate}
            onChange={(e) => handleTemplateChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${DESIGN.bodyGray}`,
              borderRadius: '4px',
              fontFamily: "'Roboto Flex', sans-serif",
            }}
          >
            {FIELD_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Drawing Tools */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>DRAW TOOLS</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
            {DRAWING_TOOLS.map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                style={{
                  padding: '8px 4px',
                  border: tool === t ? `2px solid ${DESIGN.primaryBlue}` : `1px solid #ddd`,
                  borderRadius: '4px',
                  backgroundColor: tool === t ? DESIGN.primaryBlue : '#fff',
                  color: tool === t ? '#fff' : DESIGN.darkText,
                  cursor: 'pointer',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  fontWeight: '600',
                }}
              >
                {t === 'player' ? 'Player' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Color Picker */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>COLOR</label>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {['#000', '#dc2626', '#2563eb', '#eab308', '#22c55e', '#a855f7', '#fff'].map((color) => (
              <button
                key={color}
                onClick={() => setSelectedToolConfig({ ...selectedToolConfig, stroke: color, fill: color })}
                style={{
                  width: '32px',
                  height: '32px',
                  border: selectedToolConfig.stroke === color ? `2px solid ${DESIGN.primaryBlue}` : '1px solid #ddd',
                  borderRadius: '50%',
                  backgroundColor: color,
                  cursor: 'pointer',
                }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Team Color for Players */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>TEAM COLOR</label>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {PLAYER_COLORS.map((tc) => (
              <button
                key={tc.name}
                onClick={() => setSelectedToolConfig({ ...selectedToolConfig, teamColor: tc.hex })}
                style={{
                  width: '32px',
                  height: '32px',
                  border: selectedToolConfig.teamColor === tc.hex ? `2px solid ${DESIGN.primaryBlue}` : '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: tc.hex,
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: '#fff',
                  fontWeight: 'bold',
                }}
                title={tc.name}
              >
                {tc.name[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Stroke Width */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: DESIGN.darkText, display: 'block', marginBottom: '8px' }}>THICKNESS: {selectedToolConfig.strokeWidth}px</label>
          <input
            type="range"
            min="1"
            max="10"
            value={selectedToolConfig.strokeWidth}
            onChange={(e) => setSelectedToolConfig({ ...selectedToolConfig, strokeWidth: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: historyIndex <= 0 ? '#ccc' : DESIGN.primaryBlue,
                color: '#fff',
                cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
              }}
            >
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: historyIndex >= history.length - 1 ? '#ccc' : DESIGN.primaryBlue,
                color: '#fff',
                cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
              }}
            >
              Redo
            </button>
          </div>
          
          <button
            onClick={handleClear}
            style={{
              padding: '10px',
              border: `1px solid ${DESIGN.bodyGray}`,
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#dc2626',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Clear All
          </button>

          <button
            onClick={() => setShowSaveModal(true)}
            style={{
              padding: '12px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: DESIGN.primaryBlue,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '14px',
            }}
          >
            Save to Library
          </button>
        </div>
      </div>

      {/* CANVAS AREA */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: DESIGN.lightBackground, position: 'relative' }}>
        <div style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <Stage
            ref={stageRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
          >
            {getTemplateComponent()}
            <Layer>{renderShapes()}</Layer>
          </Stage>
        </div>
      </div>

      {/* SAVE MODAL */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '25px',
            minWidth: '400px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: DESIGN.darkText }}>Save Drill</h3>
            
            {error && (
              <div style={{ padding: '10px', backgroundColor: '#fee', borderRadius: '4px', marginBottom: '15px', color: '#c00' }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: DESIGN.darkText }}>Drill Name *</label>
              <input
                type="text"
                value={exerciseTitle}
                onChange={(e) => setExerciseTitle(e.target.value)}
                placeholder="e.g., Zone Defense Formation"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${DESIGN.bodyGray}`,
                  borderRadius: '4px',
                  fontFamily: "'Roboto Flex', sans-serif",
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: DESIGN.darkText }}>Drill Type</label>
              <select
                value={drillType}
                onChange={(e) => setDrillType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${DESIGN.bodyGray}`,
                  borderRadius: '4px',
                  fontFamily: "'Roboto Flex', sans-serif",
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                {DRILL_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: DESIGN.darkText }}>Notes</label>
              <textarea
                value={exerciseNotes}
                onChange={(e) => setExerciseNotes(e.target.value)}
                placeholder="Describe the drill setup, objectives, or instructions..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${DESIGN.bodyGray}`,
                  borderRadius: '4px',
                  fontFamily: "'Roboto Flex', sans-serif",
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSaveModal(false)}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  border: `1px solid ${DESIGN.bodyGray}`,
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  color: DESIGN.darkText,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: saving ? '#aaa' : DESIGN.primaryBlue,
                  color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
              >
                {saving ? 'Saving...' : 'Save Drill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
