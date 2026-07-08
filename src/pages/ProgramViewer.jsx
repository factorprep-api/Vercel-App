import { useNavigate } from 'react-router-dom';

export default function ProgramViewer() {
  const navigate = useNavigate();
  return (
    <div style={{ fontFamily: 'Roboto Flex, sans-serif', padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>← Back</button>
        <h1 style={{ fontSize: '24px', color: '#333' }}>Program Viewer</h1>
      </div>
      <div style={{ background: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <p style={{ color: '#888', fontSize: '16px' }}>Coming in Phase 2 — View your assigned training program with sets, reps, and video demos.</p>
      </div>
    </div>
  );
}
