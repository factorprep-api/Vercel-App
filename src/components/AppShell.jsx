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
      fontFamily: 'Roboto Flex, sans-serif'
    }}>
      <header style={{
        background: '#008ed3',
        color: 'white',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>FactorPrep</h1>
        <button onClick={handleLogout} style={{
          background: 'transparent',
          border: '2px solid white',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          Logout
        </button>
      </header>

      <main style={{ flex: 1, padding: '24px', background: '#f5f5f5' }}>
        {children}
      </main>

      <footer style={{
        background: '#333',
        color: 'white',
        textAlign: 'center',
        padding: '16px',
        fontSize: '14px'
      }}>
        © 2026 FactorPrep
      </footer>
    </div>
  );
}
