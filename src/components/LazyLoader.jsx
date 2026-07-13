import { Suspense, lazy } from 'react';

export function LazyLoader({ Component, fallback }) {
  return (
    <Suspense fallback={fallback || <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><p>Loading...</p></div>}>
      <Component />
    </Suspense>
  );
}

export default LazyLoader;
