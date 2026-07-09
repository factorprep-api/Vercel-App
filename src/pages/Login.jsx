import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { createAthlete, getAthleteByEmail } from './api';

export default function Login() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  async function routeAfterLogin(userEmail) {
    try {
      const result = await getAthleteByEmail(userEmail);
      console.log('Athlete lookup result:', result);
      
      if (result.status === 'Success' && result.role === 'coach') {
        localStorage.setItem('fp_athlete_data', JSON.stringify({
          name: result.athleteName,
          email: userEmail,
          role: 'coach',
          rowIndex: result.rowIndex,
          headers: result.headers,
          rowData: result.rowData
        }));
        navigate('/program-builder');
      } else if (result.status === 'Success') {
        localStorage.setItem('fp_athlete_data', JSON.stringify({
          name: result.athleteName,
          email: userEmail,
          role: 'athlete',
          rowIndex: result.rowIndex,
          headers: result.headers,
          rowData: result.rowData
        }));
        navigate('/today');
      } else {
        // Not found in Athletes sheet — still signed in but no profile
        console.warn('User not found in Athletes sheet');
        setError('Account not found in athlete roster. Contact your coach.');
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Role check failed:', err);
      setError('Login succeeded but profile lookup failed. Please try again.');
      await supabase.auth.signOut();
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });

        if (signUpError) throw signUpError;

        createAthlete({ email, name })
          .then(result => console.log('Sheets sync result:', result))
          .catch(err => console.error('Background Sheets sync failed:', err));

        // New signups are always athletes
        navigate('/today');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) throw signInError;

        // Check role from Google Sheets and route accordingly
        await routeAfterLogin(email);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) throw resetError;
      setShowForgot(false);
      setEmail('');
      setLoading(false);
      alert('Password reset link sent to your email.');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '"Roboto Flex", "Roboto", sans-serif'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{ textAlign: 'center', color: '#008ed3', marginBottom: '30px', fontSize: '28px', fontWeight: '700' }}>FactorPrep</h1>

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {showForgot ? (
          <form onSubmit={handleForgotPassword}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555', fontSize: '14px' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#008ed3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '20px' }}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" onClick={() => { setShowForgot(false); setError(''); }} style={{ background: 'none', border: 'none', color: '#008ed3', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}>
                ← Back to Login
              </button>
            </div>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              {isSignUp && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555', fontSize: '14px' }}>Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }} />
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555', fontSize: '14px' }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555', fontSize: '14px' }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }} />
              </div>

              <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#008ed3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '20px' }}>
                {loading ? (isSignUp ? 'Creating Account...' : 'Signing In...') : (isSignUp ? 'Sign Up' : 'Sign In')}
              </button>
            </form>

            {!isSignUp && (
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <button type="button" onClick={() => { setShowForgot(true); setError(''); }} style={{ background: 'none', border: 'none', color: '#008ed3', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                  Forgot Password?
                </button>
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} style={{ background: 'none', border: 'none', color: '#008ed3', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}>
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
