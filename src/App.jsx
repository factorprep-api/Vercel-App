import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from './supabase';
import { getAthleteByEmail } from './api';
import AppShell from './components/AppShell';

// Lazy load pages for code splitting
const Login = lazy(() => import('./Login'));
const AthleteHub = lazy(() => import('./AthleteHub'));
const CoachHub = lazy(() => import('./CoachHub'));
const MyProgress = lazy(() => import('./MyProgress'));
const ProgramViewer = lazy(() => import('./pages/ProgramViewer'));
const ExerciseLibrary = lazy(() => import('./pages/ExerciseLibrary'));
const ProgramBuilder = lazy(() => import('./pages/ProgramBuilder'));
const ProgramLibrary = lazy(() => import('./pages/ProgramLibrary'));
const Shop = lazy(() => import('./pages/Shop'));
const Whiteboard = lazy(() => import('./pages/Whiteboard'));

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: '"Roboto Flex", sans-serif' }}>
    <p>Loading...</p>
  </div>
);

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
        <Route path="/login" element={!session ? <Suspense fallback={<LoadingFallback />}><Login /></Suspense> : <Navigate to="/" />} />
        
        <Route path="/" element={
          session ? (
            <AppShell>
              {role === 'coach' ? <Suspense fallback={<LoadingFallback />}><CoachHub /></Suspense> : <Suspense fallback={<LoadingFallback />}><AthleteHub /></Suspense>}
            </AppShell>
          ) : <Navigate to="/login" />}
        />

        <Route path="/progress" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <Suspense fallback={<LoadingFallback />}><MyProgress /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/program-viewer" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <Suspense fallback={<LoadingFallback />}><ProgramViewer /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/shop" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete']}>
            <Suspense fallback={<LoadingFallback />}><Shop /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/exercise-library" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['athlete', 'coach']}>
            <Suspense fallback={<LoadingFallback />}><ExerciseLibrary /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/program-builder" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><ProgramBuilder /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/program-library" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><ProgramLibrary /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/whiteboard" element={
          <ProtectedRoute session={session} role={role} allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><Whiteboard /></Suspense>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}
