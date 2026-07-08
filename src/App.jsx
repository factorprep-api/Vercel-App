import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getAthleteByEmail } from './api';
import Login from './Login';
import AthleteHub from './AthleteHub';
import CoachHub from './CoachHub';
import MyProgress from './MyProgress';
import ProgramViewer from './pages/ProgramViewer';
import ExerciseLibrary from './pages/ExerciseLibrary';
import ProgramBuilder from './pages/ProgramBuilder';
import ProgramLibrary from './pages/ProgramLibrary';
import AppShell from './components/AppShell';

function ProtectedRoute({ session, role, allowedRoles, children }) {
  if (!session) return <Navigate to="/login" />;
  if (!allowedRoles.includes(role)) return <Navigate to="/" />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);

  const checkRole = async (email, retry = 0) => {
    try {
      const result = await getAthleteByEmail(email);
      if (result.status === 'Success') {
        setRole(result.role || 'athlete');
      } else if (result.status === 'NotFound' && retry < 3) {
        // Race condition: Sheets row may not be written yet — retry after 2s
        setTimeout(() => checkRole(email, retry + 1), 2000);
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
        setRole(null);
        await checkRole(session.user.email);
        setLoading(false);
      } else {
        // Logged out — clear everything
        localStorage.removeItem('fp_athlete_data');
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
        
        <Route path="/" element={
          session ? (
            <AppShell>
              {role === 'athlete' ? <AthleteHub /> :
               role === 'coach' ? <CoachHub /> :
               <div style={{ padding: '40px', textAlign: 'center' }}>
                 <h2>Profile Not Found</h2>
                 <p>No athlete or coach profile found for your account.</p>
                 <p>Contact your coach or administrator.</p>
               </div>}
            </AppShell>
          ) : <Navigate to="/login" />}
        />

        <Route path="/progress" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <MyProgress />
          </ProtectedRoute>
        } />
        <Route path="/program-viewer" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <ProgramViewer />
          </ProtectedRoute>
        } />
        <Route path="/exercise-library" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete', 'coach']}>
            <ExerciseLibrary />
          </ProtectedRoute>
        } />
        <Route path="/program-builder" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['coach']}>
            <ProgramBuilder />
          </ProtectedRoute>
        } />
        <Route path="/program-library" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['coach']}>
            <ProgramLibrary />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}
