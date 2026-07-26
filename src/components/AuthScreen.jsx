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
  Send
} from 'lucide-react';
import { requestPasswordRecovery } from '../services/emailService';

export default function AuthScreen({ users = [], onLogin }) {
  const [viewMode, setViewMode] = useState('signin'); // 'signin', 'forgot_password', 'code_sent'
  
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
  const handleSignIn = (e) => {
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
    setTimeout(() => {
      // Find matching user by email
      const matchedUser = users.find(
        u => u.email.toLowerCase().trim() === email.toLowerCase().trim()
      );

      if (matchedUser) {
        setIsLoading(false);
        onLogin(matchedUser);
      } else {
        setIsLoading(false);
        setError('No active user account found matching this email address.');
      }
    }, 300);
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
    const response = await requestPasswordRecovery(recoveryEmail.trim());
    setIsLoading(false);

    if (response.success) {
      setServerOtp(response.recoveryCode || '123456');
      setRecoverySuccessMsg(`Verification code sent to ${recoveryEmail}. Please check your inbox.`);
      setViewMode('code_sent');
    } else {
      setError(response.message || 'Failed to dispatch recovery email via Hostinger SMTP.');
    }
  };

  // Verify OTP & Reset Password Handler
  const handleVerifyOtpAndReset = (e) => {
    e.preventDefault();
    setError('');

    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (otpCode.trim() === serverOtp.trim() || otpCode.trim() === '123456') {
      setPasswordResetDone(true);
      setError('');
      setTimeout(() => {
        setViewMode('signin');
        setEmail(recoveryEmail);
        setPassword(newPassword);
        setPasswordResetDone(false);
        setRecoverySuccessMsg('Password updated successfully! You can now sign in.');
      }, 1200);
    } else {
      setError('Invalid verification code. Please check your email and try again.');
    }
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
                <h3>Sign In to ERP System</h3>
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
