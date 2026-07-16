import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

export default function AppShell({ children }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    localStorage.removeItem('fp_athlete_data');
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Roboto Flex", "Roboto", sans-serif'
    }}>
      <header style={{
        background: '#008ed3',
        color: 'white',
        padding: '4px 6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img 
            src="/logo.png" 
            alt="FactorPrep" 
            style={{ height: '18px', width: 'auto' }}
          />
          <h1 style={{ margin: 0, fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>FactorPrep</h1>
        </div>
        <button onClick={handleLogout} style={{
          background: 'transparent',
          border: '2px solid white',
          color: 'white',
          padding: '3px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '10px',
          fontWeight: 'bold',
          letterSpacing: '0.5px',
          transition: 'background 0.2s'
        }}>
          Logout
        </button>
      </header>

      <main style={{ flex: 1, padding: '4px 8px', background: '#f5f5f5' }}>
        {children}
      </main>

      <footer style={{
        background: '#333',
        color: 'white',
        textAlign: 'center',
        padding: '4px',
        fontSize: '9px'
      }}>
        © 2026 Exercise Program
      </footer>
    </div>
  );
}
