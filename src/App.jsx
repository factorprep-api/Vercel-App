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

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: '"Roboto Flex", sans-serif' }}>
    <p>Loading...</p>
  </div>
);

function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  
  if (isLoading) return <LoadingFallback />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!allowedRoles.includes(role)) return <Navigate to="/" />;
  
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { isAuthenticated, isLoading, role } = useAuth();

  // Show loading spinner during auth check
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
            <Navigate to="/" />
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
            <Navigate to="/login" />
          )
        } />

        <Route path="/progress" element={
          <ProtectedRoute allowedRoles={['athlete']}>
            <Suspense fallback={<LoadingFallback />}><MyProgress /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/program-viewer" element={
          <ProtectedRoute allowedRoles={['athlete']}>
            <Suspense fallback={<LoadingFallback />}><ProgramViewer /></Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/shop" element={
          <ProtectedRoute allowedRoles={['athlete']}>
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
      </Routes>
    </Router>
  );
}
