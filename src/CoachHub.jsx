import { useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Wrench, BookOpen, Dumbbell } from 'lucide-react';

export default function CoachHub() {
  const navigate = useNavigate();
  const { athleteName, isLoading: authLoading } = useAuth();
  if (authLoading) return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <p>Loading...</p>
    </div>
  );



  const cards = [
    { title: 'Program Builder', desc: 'Create and edit training programs', icon: Wrench, path: '/program-builder', color: '#008ed3', bgImage: '/pb-card.png' },
    { title: 'Program Library', desc: 'View and manage all saved programs', icon: BookOpen, path: '/program-library', color: '#2e7d32', bgImage: '/pl-card.png' },
    { title: 'Exercise Library', desc: 'Search all exercise videos', icon: Dumbbell, path: '/exercise-library', color: '#d3ca17', bgImage: '/el-card.png' }
  ];

  return (
    <div style={{ fontFamily: '"Roboto Flex", sans-serif', padding: '4px', backgroundColor: '#f8fafc' }}>
      <div className="hub-title-wrapper" style={{ textAlign: 'center', paddingTop: '4px' }}>
        <h1 style={{ fontSize: '28px', color: '#333', marginBottom: '4px' }}>Coach Hub</h1>
        <p className="hub-welcome" style={{ color: '#666', fontSize: '15px' }}>Welcome, {athleteName || 'Coach'}</p>
      </div>

      <div className="hub-cards" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => navigate(card.path)}
            style={{
              flex: '1 1 250px',
              maxWidth: '300px',
              height: '240px',
              background: card.bgImage ? `url(${card.bgImage}) center top / cover` : 'white',
              border: '1px solid #ddd',
              borderRadius: '12px',
              padding: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end'
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
            {card.bgImage ? (
              <>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 60%)' }} />
                <div style={{ position: 'relative', zIndex: 1, textAlign: 'left' }}>
                  <h2 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '4px', fontWeight: '700', lineHeight: '1.2' }}>{card.title}</h2>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: '1.4' }}>{card.desc}</p>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: '50px', height: '50px', borderRadius: '50%', background: card.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <card.icon size={24} color="white" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '18px', color: '#333', marginBottom: '6px' }}>{card.title}</h2>
                <p style={{ fontSize: '13px', color: '#888' }}>{card.desc}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
