import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchAuditLog } from '../api';
import { Search, Loader2, ShieldCheck } from 'lucide-react';

export default function AuditView() {
  const { role: userRole, userEmail } = useAuth();
  const navigate = useNavigate();
  const loadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);

  // Filter states (applied on demand, not on every keystroke)
  const [filterAthlete, setFilterAthlete] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  // Guard: this view is for coaches only
  useEffect(() => {
    if (userRole && userRole !== 'coach') {
      navigate('/');
    }
  }, [userRole, navigate]);

  async function loadAuditLog(filters = {}) {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog(filters);
      if (result.status === 'Success' || result.status === 'Empty') {
        setAuditEntries(result.data || []);
      } else {
        setError(result.message || 'Failed to load audit log.');
        setAuditEntries([]);
      }
    } catch (err) {
      setError('Connection error: ' + (err.message || 'unknown'));
      setAuditEntries([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (userEmail && !loadedRef.current) {
      loadedRef.current = true;
      loadAuditLog({});
    }
  }, [userEmail]);

  function handleApplyFilters() {
    const filters = {};
    if (filterAthlete.trim()) filters.athlete = filterAthlete.trim();
    if (filterProgram.trim()) filters.program = filterProgram.trim();
    if (filterDateStart) filters.dateStart = filterDateStart;
    if (filterDateEnd) filters.dateEnd = filterDateEnd;
    loadAuditLog(filters);
  }

  function handleClearFilters() {
    setFilterAthlete('');
    setFilterProgram('');
    setFilterDateStart('');
    setFilterDateEnd('');
    loadAuditLog({});
  }

  function formatTimestamp(raw) {
    if (!raw) return '—';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return String(raw);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(raw);
    }
  }

  return (
    <div className="mp-container">
      <div className="mp-body">

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Edit Audit Log
          </h2>
        </div>

        {/* Filter Panel */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', margin: '0 0 12px 0' }}>Filter Edits</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>Athlete</label>
              <input
                type="text"
                value={filterAthlete}
                onChange={e => setFilterAthlete(e.target.value)}
                placeholder="Name"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>Program</label>
              <input
                type="text"
                value={filterProgram}
                onChange={e => setFilterProgram(e.target.value)}
                placeholder="Program name"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>Session Date From</label>
              <input
                type="date"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>Session Date To</label>
              <input
                type="date"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleApplyFilters}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#008ed3', color: '#ffffff', fontWeight: '700', fontSize: '14px', cursor: loading ? 'wait' : 'pointer' }}
            >
              <Search size={15} /> Apply Filters
            </button>
            <button
              onClick={handleClearFilters}
              disabled={loading}
              style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontWeight: '700', fontSize: '14px', cursor: loading ? 'wait' : 'pointer' }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Status Line */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontWeight: '700', fontSize: '14px' }}>
            {error}
          </div>
        )}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontWeight: '600', fontSize: '14px', padding: '10px 0' }}>
            <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Loading audit entries...
          </div>
        )}
        {!loading && !error && (
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px 0' }}>
            {auditEntries.length} edit{auditEntries.length === 1 ? '' : 's'} found (most recent first)
          </p>
        )}

        {/* Entry List */}
        {!loading && !error && auditEntries.length === 0 && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '40px 20px', textAlign: 'center' }}>
            <ShieldCheck size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: 0 }}>
              No edits have been recorded yet. Edits made from the My Progress history vault will appear here.
            </p>
          </div>
        )}

        {!loading && auditEntries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {auditEntries.map((entry, i) => (
              <div key={i} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>
                    {entry.athlete} — {entry.exercise}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: entry.whoRole === 'coach' ? '#eef2ff' : '#f0fdf4',
                    color: entry.whoRole === 'coach' ? '#4f46e5' : '#16a34a',
                    textTransform: 'capitalize'
                  }}>
                    {entry.whoRole || 'unknown role'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#64748b' }}>
                  <div><b style={{ color: '#334155' }}>Edited:</b> {formatTimestamp(entry.date)} by {entry.whoEmail || 'unknown'}</div>
                  <div><b style={{ color: '#334155' }}>Session:</b> {entry.sessionDate} · {entry.program}</div>
                  <div><b style={{ color: '#334155' }}>Change:</b> Set {entry.setNumber}, {entry.fieldChanged} — <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>{String(entry.oldValue ?? '(blank)')}</span> <span style={{ color: '#94a3b8' }}>→</span> <span style={{ color: '#059669', fontWeight: '800' }}>{String(entry.newValue ?? '(blank)')}</span></div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>

      <HelpButton pageName="Audit Log" position="bottom-right" />
    </div>
  );
}