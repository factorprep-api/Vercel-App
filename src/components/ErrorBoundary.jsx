import { Component } from 'react';

// Route-level error boundary. A single uncaught render exception inside a
// lazy page otherwise unmounts the ENTIRE React tree — the user sees a blank
// white page with no way back (this is exactly what happened on
// /athlete-nutrition in v1.9.16 and earlier). Wrapping each route's page
// means a crash degrades to a friendly error card on that page only; every
// other page and the hub navigation keep working. The user reloads or
// navigates to recover, and the error is logged to the console for support.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Full details for support / DevTools — the UI stays friendly.
    console.error('[ErrorBoundary] Page crashed:', error, info?.componentStack || '');
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24, fontFamily: '"Roboto Flex", sans-serif', textAlign: 'center' }}>
        <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '28px 24px', maxWidth: 420, width: '100%' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ fontSize: 18, color: '#334155', margin: '0 0 8px 0' }}>This page hit a snag</h2>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 16px 0' }}>
            Something went wrong on this page — everything else still works.
            Try reloading, and if it keeps happening let us know what you were doing.
          </p>
          <button
            onClick={this.handleReload}
            style={{ background: '#008ed3', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
