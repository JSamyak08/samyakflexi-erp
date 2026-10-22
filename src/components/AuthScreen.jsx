import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  ArrowRight, 
  Building2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Send
} from 'lucide-react';
import { signInUser, sendPasswordResetEmail, updateOwnPassword } from '../services/authService';


export default function AuthScreen({ onLogin, recoveryMode = false, onPasswordUpdated }) {

  const [viewMode, setViewMode] = useState('signin'); // 'signin' | 'forgot_password'
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Rate-limiting / Brute force protection state
  const [failedAttempts, setFailedAttempts] = useState(() => {
    try {
      return parseInt(sessionStorage.getItem('auth_failed_attempts') || '0', 10);
    } catch (e) { return 0; }
  });

  const [lockoutUntil, setLockoutUntil] = useState(() => {
    try {
      return parseInt(sessionStorage.getItem('auth_lockout_until') || '0', 10);
    } catch (e) { return 0; }
  });

  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Lockout countdown timer
  React.useEffect(() => {
    if (lockoutUntil <= Date.now()) {
      setLockoutSeconds(0);
      return;
    }
    const updateTimer = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutSeconds(0);
        setLockoutUntil(0);
        setFailedAttempts(0);
        try {
          sessionStorage.removeItem('auth_lockout_until');
          sessionStorage.removeItem('auth_failed_attempts');
        } catch (e) {}
      } else {
        setLockoutSeconds(remaining);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordResetDone, setPasswordResetDone] = useState(false);

  // Sign In Handler with Rate Limiting & Lockout Guard
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');

    // Check Lockout
    if (lockoutUntil > Date.now()) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`🔒 Login locked due to multiple failed attempts. Please try again in ${remaining}s.`);
      return;
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail) {
      setError('Please enter your work email address.');
      return;
    }
    if (!cleanPassword) {
      setError('Please enter your account password.');
      return;
    }

    setIsLoading(true);
    const response = await signInUser(cleanEmail, cleanPassword);
    setIsLoading(false);

    if (response.success && response.user) {
      // Clear brute-force counters on successful sign-in
      setFailedAttempts(0);
      setLockoutUntil(0);
      try {
        sessionStorage.removeItem('auth_failed_attempts');
        sessionStorage.removeItem('auth_lockout_until');
      } catch (e) {}
      onLogin(response.user);
    } else {
      const newCount = failedAttempts + 1;
      setFailedAttempts(newCount);
      try {
        sessionStorage.setItem('auth_failed_attempts', String(newCount));
      } catch (e) {}

      if (newCount >= 5) {
        const until = Date.now() + 5 * 60 * 1000; // 5-minute lockout
        setLockoutUntil(until);
        try {
          sessionStorage.setItem('auth_lockout_until', String(until));
        } catch (e) {}
        setError('🔒 Too many failed login attempts (5/5). Account sign-in locked for 5 minutes.');
      } else {
        setError(`${response.message || 'Authentication failed.'} (Failed attempt ${newCount}/5)`);
      }
    }
  };

  // Password Recovery Submit Handler
  const handlePasswordRecoverySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setRecoverySuccessMsg('');

    if (!recoveryEmail.trim()) {
      setError('Please enter your registered work email address.');
      return;
    }

    setIsLoading(true);
    const supaResp = await sendPasswordResetEmail(recoveryEmail.trim());
    setIsLoading(false);

    if (supaResp.success) {
      setRecoverySuccessMsg(supaResp.message || 'Password setup link sent.');
    } else {
      setError(supaResp.message || 'Failed to send the password setup email.');
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    setIsLoading(true);
    const result = await updateOwnPassword(newPassword);
    setIsLoading(false);
    if (!result.success) {
      setError(result.message || 'Could not update the password.');
      return;
    }
    setPasswordResetDone(true);
    if (onPasswordUpdated) await onPasswordUpdated();
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-wrapper">
        {/* Left Branding / Company Info Side */}
        <div className="auth-brand-side">
          <div>
            <div className="auth-logo-badge">
              <img 
                src="/samyak-logo.png" 
                alt="Samyak International Ltd" 
                className="auth-logo-img" 
              />
            </div>
            <h2 className="auth-brand-heading">Flexible Packaging Operations Center</h2>
          </div>

          <div className="auth-features-list">
            <div className="auth-feature-item">
              <ShieldCheck size={20} className="auth-feature-icon" />
              <div>
                <h4>Enterprise Role Security</h4>
                <p>Protected access for plant, store, QC, and purchase teams.</p>
              </div>
            </div>

            <div className="auth-feature-item">
              <Building2 size={20} className="auth-feature-icon" />
              <div>
                <h4>Indore Manufacturing Unit</h4>
                <p>GSTIN: 23AABCM3526F1ZY • Kheda Industrial Area, Pithampur</p>
              </div>
            </div>
          </div>

          <div className="auth-brand-footer">
            <span>© 2026 Samyak International Ltd. All rights reserved.</span>
          </div>
        </div>

        {/* Right Form Side */}
        <div className="auth-form-side">
          
          {/* VIEW 1: SIGN IN FORM */}
          {!recoveryMode && viewMode === 'signin' && (
            <>
              <div className="auth-form-header">
                <div>
                  <h3>Sign In to Operations Center</h3>
                </div>
                <p>Enter your authorized work email and password</p>
              </div>


              {recoverySuccessMsg && (
                <div className="auth-success-alert">
                  <CheckCircle2 size={18} />
                  <span>{recoverySuccessMsg}</span>
                </div>
              )}

              {error && (
                <div className="auth-error-alert">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSignIn} className="auth-form">
                <div className="form-group">
                  <label>Work Email Address</label>
                  <div className="input-with-icon">
                    <Mail size={18} className="input-icon" />
                    <input 
                      type="email" 
                      className="form-control"
                      placeholder="e.g. samyak@samyakinternational.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>Password</label>
                    <button 
                      type="button" 
                      className="forgot-password-link"
                      onClick={() => {
                        setError('');
                        setRecoverySuccessMsg('');
                        setRecoveryEmail(email);
                        setViewMode('forgot_password');
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="input-with-icon">
                    <Lock size={18} className="input-icon" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="form-control"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button 
                      type="button" 
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary auth-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      Sign In to Dashboard <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* VIEW 2: FORGOT PASSWORD REQUEST */}
          {!recoveryMode && viewMode === 'forgot_password' && (
            <>
              <div className="auth-form-header">
                <button 
                  className="btn-back-link"
                  onClick={() => {
                    setError('');
                    setViewMode('signin');
                  }}
                >
                  <ArrowLeft size={16} /> Back to Sign In
                </button>
                <h3 style={{ marginTop: '12px' }}>Password Recovery</h3>
                <p>Enter your registered work email. We will send a link to choose a new password.</p>
              </div>

              {error && (
                <div className="auth-error-alert">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handlePasswordRecoverySubmit} className="auth-form">
                <div className="form-group">
                  <label>Registered Work Email Address</label>
                  <div className="input-with-icon">
                    <Mail size={18} className="input-icon" />
                    <input 
                      type="email" 
                      className="form-control"
                      placeholder="e.g. admin@samyakinternational.in"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary auth-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span>Sending password link...</span>
                  ) : (
                    <>
                      Send Password Link <Send size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {recoveryMode && (
            <>
              <div className="auth-form-header">
                <h3>Choose a new password</h3>
                <p>This replaces the previous password. It is stored by Supabase Auth, not in the ERP database.</p>
              </div>
              {passwordResetDone ? (
                <div className="auth-success-alert">
                  <CheckCircle2 size={18} />
                  <span>Password updated. Opening your workspace...</span>
                </div>
              ) : (
                <form onSubmit={handleSetNewPassword} className="auth-form">
                  {error && (
                    <div className="auth-error-alert">
                      <AlertCircle size={18} />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className="form-group">
                    <label>New password</label>
                    <div className="input-with-icon">
                      <Lock size={18} className="input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn-primary auth-submit-btn" disabled={isLoading}>
                    {isLoading ? 'Saving password...' : 'Save password and continue'}
                  </button>
                </form>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
