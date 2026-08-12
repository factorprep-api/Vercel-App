import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/AppShell';

// Lazy load pages for code splitting
const Login = lazy(() => import('./pages/Login'));
const AthleteHub = lazy(() => import('./pages/AthleteHub'));
const CoachHub = lazy(() => import('./pages/CoachHub'));
const MyProgress = lazy(() => import('./pages/MyProgress'));
const ProgramViewer = lazy(() => import('./pages/ProgramViewer'));
const ExerciseLibrary = lazy(() => import('./pages/ExerciseLibrary'));
const ProgramBuilder = lazy(() => import('./pages/ProgramBuilder'));
const ProgramLibrary = lazy(() => import('./pages/ProgramLibrary'));
const Shop = lazy(() => import('./pages/Shop'));
const Whiteboard = lazy(() => import('./pages/Whiteboard'));
const CoachResults = lazy(() => import('./pages/CoachResults'));

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: '"Roboto Flex", sans-serif' }}>
    <p>Loading...</p>
  </div>
);

function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  
  if (isLoading) return <LoadingFallback />;
  
  // FIX: Added 'replace' to prevent back-button traps
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(role)) return <Navigate to="/" replace />;
  
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: '"Roboto Flex", sans-serif' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          !isAuthenticated ? (
            <Suspense fallback={<LoadingFallback />}>
              <Login />
            </Suspense>
          ) : (
            // FIX: Added 'replace'
            <Navigate to="/" replace />
          )
        } />
        
        <Route path="/" element={
          isAuthenticated ? (
            <AppShell>
              <Suspense fallback={<LoadingFallback />}>
                {role === 'coach' ? <CoachHub /> : <AthleteHub />}
              </Suspense>
            </AppShell>
          ) : (
             // FIX: Added 'replace'
            <Navigate to="/login" replace />
          )
        } />
        <Route path="/athlete-hub" element={
          <ProtectedRoute allowedRoles={['athlete', 'coach']}>
            <Suspense fallback={<LoadingFallback />}><AthleteHub /></Suspense>
          </ProtectedRoute>
        } />

        <Route path="/progress" element={
          <ProtectedRoute allowedRoles={['athlete', 'coach']}>
            <Suspense fallback={<LoadingFallback />}><MyProgress /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/program-viewer" element={
          <ProtectedRoute allowedRoles={['athlete', 'coach']}>
            <Suspense fallback={<LoadingFallback />}><ProgramViewer /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/shop" element={
          <ProtectedRoute allowedRoles={['athlete', 'coach']}>
            <Suspense fallback={<LoadingFallback />}><Shop /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/exercise-library" element={
          <ProtectedRoute allowedRoles={['athlete', 'coach']}>
            <Suspense fallback={<LoadingFallback />}><ExerciseLibrary /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/program-builder" element={
          <ProtectedRoute allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><ProgramBuilder /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/program-library" element={
          <ProtectedRoute allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><ProgramLibrary /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/whiteboard" element={
          <ProtectedRoute allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><Whiteboard /></Suspense>
          </ProtectedRoute>
        } />

        <Route path="/coach-results" element={
          <ProtectedRoute allowedRoles={['coach']}>
            <Suspense fallback={<LoadingFallback />}><CoachResults /></Suspense>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

