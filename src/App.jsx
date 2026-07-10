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
import PublicPrograms from './pages/PublicPrograms';
import Shop from './pages/Shop';
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

  async function fetchRoleFromSheets(email) {
    try {
      const result = await getAthleteByEmail(email);
      if (result.status === 'Success') {
        localStorage.setItem('fp_athlete_data', JSON.stringify({
          name: result.athleteName,
          email,
          role: result.role,
          rowIndex: result.rowIndex,
          headers: result.headers,
          rowData: result.rowData
        }));
        setRole(result.role);
      } else {
        setRole('athlete');
      }
    } catch (e) {
      console.error('Role fetch failed:', e);
      setRole('athlete');
    }
  }

  async function determineRole(session) {
    if (!session) {
      setRole(null);
      setLoading(false);
      return;
    }

    // Check localStorage cache first
    const cached = localStorage.getItem('fp_athlete_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.email === session.user.email && parsed.role) {
          setRole(parsed.role);
          setLoading(false);
          // Refresh in background to keep cache fresh
          fetchRoleFromSheets(session.user.email);
          return;
        }
      } catch (e) {}
    }

    // No cache — fetch from Google Sheets
    await fetchRoleFromSheets(session.user.email);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      determineRole(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setLoading(true);
        determineRole(session);
      } else {
        localStorage.removeItem('fp_athlete_data');
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: '"Roboto Flex", sans-serif' }}>
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
        <Route path="/public-programs" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <PublicPrograms />
          </ProtectedRoute>
        } />
        <Route path="/shop" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <Shop />
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
