import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getAthleteByEmail } from './api';
import Login from './Login';
import AthleteHub from './AthleteHub';
import CoachHub from './CoachHub';
import AppShell from './components/AppShell';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);

  const checkRole = async (email) => {
    try {
      const result = await getAthleteByEmail(email);
      if (result.status === 'Success') {
        setRole(result.role || 'athlete');
      } else {
        setRole('unknown');
      }
    } catch (err) {
      setRole('unknown');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        await checkRole(session.user.email);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        setLoading(true);
        await checkRole(session.user.email);
        setLoading(false);
      } else {
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={!session ? <Login /> : <Navigate to="/" />} 
        />
        <Route 
          path="/" 
          element={session ? (
            role === 'athlete' ? (
              <AppShell><AthleteHub /></AppShell>
            ) : role === 'coach' ? (
              <AppShell><CoachHub /></AppShell>
            ) : (
              <AppShell>
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <h2>Profile Not Found</h2>
                  <p>No athlete or coach profile found for your account.</p>
                  <p>Contact your coach or administrator.</p>
                </div>
              </AppShell>
            )
          ) : <Navigate to="/login" />} 
        />
      </Routes>
    </Router>
  );
}
