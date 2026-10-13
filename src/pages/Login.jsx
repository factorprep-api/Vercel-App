import { useState } from 'react';
import { supabase } from '../supabase';
import { createAthlete } from '../api';
import { Eye, EyeOff } from 'lucide-react';

const WAIVER_TEXT = `Assumption of Risk & Liability Waiver

1. Inherent Risks of Exercise. I understand that physical exercise, strength training and athletic conditioning involve inherent risks, including muscle strains, joint injuries, falls, equipment failure and other injuries that may be serious or permanent. I knowingly and voluntarily accept all such risks.

2. Calculated Load Values. I understand that this app calculates load values, training recommendations and prescribed weights based solely on the data I enter. Inaccurate, incomplete or outdated inputs will produce inaccurate — and potentially unsafe — calculated loads. I agree that the accuracy of all data I enter is my responsibility, and I must verify any calculated value against my own ability before use.

3. Responsibility for Loads. I accept full and sole responsibility for any load or weight I choose to put on, attach to or lift with any machine or equipment, and for checking that machines and equipment are set up correctly and in safe working order before use. The app and its operators are not responsible for how I load or operate any equipment.

4. Health. I confirm I am physically fit to train, have no medical condition that makes training unsafe, and have consulted a doctor where appropriate. I will stop immediately if I experience pain, dizziness, shortness of breath or discomfort.

I have read this waiver carefully and voluntarily agree to it.`;

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        if (!waiverAccepted) {
          setError('You must read and accept the Waiver & Assumption of Risk before creating an account.');
          setLoading(false);
          return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              waiver_accepted: true,
              waiver_accepted_at: new Date().toISOString()
            }
          }
        });

        if (signUpError) throw signUpError;

        createAthlete({ email, name })
          .then(result => console.log('Sheets sync result:', result))
          .catch(err => console.error('Background Sheets sync failed:', err));

      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) throw signInError;
        // App.jsx onAuthStateChange will detect session, fetch role from Google Sheets, and route accordingly
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
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    required 
                    minLength={6} 
                    style={{ 
                      width: '100%', 
                      padding: '12px 45px 12px 12px', 
                      border: '2px solid #ddd', 
                      borderRadius: '6px', 
                      fontSize: '16px', 
                      boxSizing: 'border-box' 
                    }} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#666',
                      padding: 0,
                      display: 'flex'
                    }}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555', fontSize: '14px' }}>
                    Waiver &amp; Assumption of Risk
                  </label>
                  <div style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    border: '2px solid #ddd',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    color: '#555',
                    whiteSpace: 'pre-wrap',
                    marginBottom: '10px'
                  }}>
                    {WAIVER_TEXT}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#555', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={waiverAccepted}
                      onChange={(e) => setWaiverAccepted(e.target.checked)}
                      style={{ marginTop: '2px', width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span>I have read and agree to the above Waiver &amp; Assumption of Risk, including that I accept full responsibility for the load I put on machines.</span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (isSignUp && !waiverAccepted)}
                style={{ width: '100%', padding: '14px', background: (loading || (isSignUp && !waiverAccepted)) ? '#9ca3af' : '#008ed3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: (loading || (isSignUp && !waiverAccepted)) ? 'not-allowed' : 'pointer', marginBottom: '20px' }}>
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
