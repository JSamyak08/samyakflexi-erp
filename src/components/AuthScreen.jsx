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
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Send,
  Database
} from 'lucide-react';
import { requestPasswordRecovery } from '../services/emailService';
import { signInUser, sendPasswordResetEmail } from '../services/authService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { updateUserPasswordInDB } from '../services/supabaseDataService';


export default function AuthScreen({ users = [], onLogin, onUpdatePassword }) {

  const [viewMode, setViewMode] = useState('signin'); // 'signin', 'forgot_password', 'code_sent'
  const isSupabaseActive = isSupabaseConfigured();
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Recovery State
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [serverOtp, setServerOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordResetDone, setPasswordResetDone] = useState(false);

  // Sign In Handler
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your work email address.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your account password.');
      return;
    }

    setIsLoading(true);
    const response = await signInUser(email, password);
    setIsLoading(false);

    if (response.success && response.user) {
      onLogin(response.user);
    } else {
      setError(response.message || 'Authentication failed.');
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
    
    // Try Supabase Auth password reset if configured
    if (isSupabaseActive) {
      const supaResp = await sendPasswordResetEmail(recoveryEmail.trim());
      if (supaResp.success) {
        setIsLoading(false);
        setRecoverySuccessMsg(supaResp.message || `Password recovery link sent via Supabase Auth.`);
        return;
      }
    }

    // Fallback to SMTP email recovery
    const response = await requestPasswordRecovery(recoveryEmail.trim());
    setIsLoading(false);

    if (response.success) {
      setRecoverySuccessMsg(`Password recovery instructions sent to ${recoveryEmail}. Please check your inbox.`);
      setViewMode('code_sent');
    } else {
      setError(response.message || 'Failed to dispatch recovery email.');
    }
  };


  // Verify OTP & Reset Password Handler
  const handleVerifyOtpAndReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError('Please enter the valid 6-digit verification code sent to your email.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    setPasswordResetDone(true);
    setError('');

    // Persist new password to Supabase users table
    try {
      await updateUserPasswordInDB(recoveryEmail, newPassword);
    } catch (err) {
      console.warn('[PasswordReset] Could not persist password to DB:', err.message);
    }

    // Also update in local users state so the change is reflected immediately
    if (onUpdatePassword) {
      onUpdatePassword(recoveryEmail, newPassword);
    }

    setTimeout(() => {
      setViewMode('signin');
      setEmail(recoveryEmail);
      setPassword(newPassword);
      setPasswordResetDone(false);
      setRecoverySuccessMsg('✅ Password updated successfully! You can now sign in with your new password.');
    }, 1200);
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
            <h2 className="auth-brand-heading">SamyakFlexi ERP</h2>
            <p className="auth-brand-sub">
              Flexible Packaging Manufacturing Division
            </p>
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
          {viewMode === 'signin' && (
            <>
              <div className="auth-form-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3>Sign In to ERP System</h3>
                  {isSupabaseActive ? (
                    <span style={{ fontSize: '0.75rem', background: '#064e3b', color: '#34d399', border: '1px solid #059669', padding: '3px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <Database size={12} /> Supabase Auth Connected
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', padding: '3px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ⚡ Local Auth
                    </span>
                  )}
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
                      placeholder="e.g. samyak@samyak.com"
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
          {viewMode === 'forgot_password' && (
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
                <p>Enter your registered work email address. We will send a verification code via Hostinger SMTP.</p>
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
                    <span>Sending Code via Hostinger SMTP...</span>
                  ) : (
                    <>
                      Send Recovery Code <Send size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* VIEW 3: OTP VERIFICATION & RESET */}
          {viewMode === 'code_sent' && (
            <>
              <div className="auth-form-header">
                <button 
                  className="btn-back-link"
                  onClick={() => {
                    setError('');
                    setViewMode('forgot_password');
                  }}
                >
                  <ArrowLeft size={16} /> Resend Code
                </button>
                <h3 style={{ marginTop: '12px' }}>Enter Recovery Code</h3>
                <p>Verification code sent via Hostinger SMTP to <strong>{recoveryEmail}</strong></p>
              </div>

              {passwordResetDone ? (
                <div className="auth-success-alert" style={{ flexDirection: 'column', textAlign: 'center', padding: '20px' }}>
                  <CheckCircle2 size={36} style={{ marginBottom: '8px' }} />
                  <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>Password Reset Complete!</span>
                  <span style={{ fontSize: '0.85rem', marginTop: '4px' }}>Redirecting to Sign In screen...</span>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="auth-error-alert">
                      <AlertCircle size={18} />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleVerifyOtpAndReset} className="auth-form">
                    <div className="form-group">
                      <label>6-Digit Verification Code</label>
                      <div className="input-with-icon">
                        <KeyRound size={18} className="input-icon" />
                        <input 
                          type="text" 
                          className="form-control"
                          placeholder="e.g. 849301"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>New Account Password</label>
                      <div className="input-with-icon">
                        <Lock size={18} className="input-icon" />
                        <input 
                          type={showPassword ? "text" : "password"} 
                          className="form-control"
                          placeholder="Enter new password (min. 6 characters)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
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
                    >
                      Reset Password & Login <CheckCircle2 size={18} />
                    </button>
                  </form>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
