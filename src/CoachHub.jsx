import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { getAthleteByEmail } from './api';

export default function CoachHub() {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadName = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const result = await getAthleteByEmail(user.email);
          if (result.status === 'Success' && result.role === 'coach') {
            setCoachName(result.coachName || user.user_metadata?.name || 'Coach');
          }
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    loadName();
  }, []);

  const cards = [
    {
      title: 'Program Builder',
      desc: 'Create and edit training programs',
      icon: '🔧',
      path: '/program-builder',
      color: '#008ed3'
    },
    {
      title: 'Program Library',
      desc: 'View and manage all saved programs',
      icon: '📚',
      path: '/program-library',
      color: '#2e7d32'
    },
    {
      title: 'Exercise Library',
      desc: 'Browse and add exercises with video demos',
      icon: '🏋️',
      path: '/exercise-library',
      color: '#d3ca17'
    }
  ];

  return (
    <div style={{
      fontFamily: 'Roboto Flex, sans-serif',
      padding: '20px',
      backgroundColor: '#f8fafc',
      minHeight: '100vh'
    }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', color: '#333', marginBottom: '4px' }}>Coach Hub</h1>
        {coachName && <p style={{ color: '#666', fontSize: '15px' }}>Welcome, {coachName}</p>}
      </div>

      <div style={{
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => navigate(card.path)}
            style={{
              flex: '1 1 250px',
              maxWidth: '300px',
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'transform 0.15s, box-shadow 0.15s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
            }}
          >
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              background: card.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '16px'
            }}>
              {card.icon}
            </div>
            <h2 style={{ fontSize: '18px', color: '#333', marginBottom: '6px' }}>{card.title}</h2>
            <p style={{ fontSize: '13px', color: '#888' }}>{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
