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

        // Load all athletes (coaches need to see everyone)
        const headers = data.athletes[0] || [];
        const athRows = data.athletes.slice(1);
        
        // Extract athlete names
        const athleteList = athRows.map((row, idx) => ({
          id: idx,
          name: String(row[0]).trim(),
          email: headers.some((h, c) => String(h).toLowerCase() === 'email') 
            ? row[headers.findIndex((h, c) => String(h).toLowerCase() === 'email')] 
            : ''
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
