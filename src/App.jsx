import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
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

  const getRole = (session) => {
    if (!session) return null;
    const metadataRole = session.user?.user_metadata?.role;
    return metadataRole || 'athlete';
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        setRole(getRole(session));
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setRole(getRole(session));
      } else {
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
              {role === 'coach' ? <CoachHub /> : <AthleteHub />}
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
