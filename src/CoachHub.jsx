import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { fetchAllData } from './api';

export default function CoachHub() {
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState([]);
  const [coachName, setCoachName] = useState('');

  useEffect(() => {
    const loadCoachHub = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const data = await fetchAllData();
        if (data.error) {
          setLoading(false);
          return;
        }

        const headers = data.athletes[0] || [];
        const athRows = data.athletes.slice(1);
        
        let emailCol = -1;
        for (let c = 0; c < headers.length; c++) {
          if (String(headers[c]).trim().toLowerCase() === 'email') {
            emailCol = c;
            break;
          }
        }
        
        const athleteList = athRows.map((row, idx) => ({
          id: idx,
          name: String(row[0]).trim(),
          email: emailCol >= 0 ? String(row[emailCol] || '').trim() : ''
        }));
        
        setAthletes(athleteList);
        setCoachName(user.user_metadata?.name || user.email.split('@')[0]);
        setLoading(false);
      } catch (err) {
        console.error('Coach hub load error:', err);
        setLoading(false);
      }
    };

    loadCoachHub();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        fontFamily: 'Roboto Flex, sans-serif'
      }}>
        <p>Loading coach dashboard...</p>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: 'Roboto Flex, sans-serif',
      padding: '20px',
      backgroundColor: '#f8fafc',
      minHeight: '100vh'
    }}>
      <h1 style={{ fontSize: '24px', color: '#333', marginBottom: '20px' }}>Coach Hub</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>Welcome, {coachName}</p>
      
      <div style={{
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{ marginBottom: '15px', color: '#111' }}>Assigned Athletes</h2>
        {athletes.length === 0 ? (
          <p style={{ color: '#888' }}>No athletes assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {athletes.map(a => (
              <div key={a.id} style={{
                padding: '12px',
                background: '#f4f6f8',
                borderRadius: '6px',
                borderBottom: '1px solid #e2e3e5'
              }}>
                <strong>{a.name}</strong>
                {a.email && <div style={{ fontSize: '13px', color: '#666' }}>{a.email}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <p style={{ marginTop: '20px', color: '#888', fontSize: '13px' }}>
        Phase 2: Add program management, athlete performance tracking, and messaging features.
      </p>
    </div>
  );
}
