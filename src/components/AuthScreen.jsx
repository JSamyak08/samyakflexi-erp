import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  ArrowRight, 
  UserCheck, 
  Building2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function AuthScreen({ users = [], onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Standard Form Submit Handler
  const handleSubmit = (e) => {
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
    }, 400);
  };

  // Quick Demo Account Login Handler
  const handleQuickDemoLogin = (user) => {
    setError('');
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLogin(user);
    }, 300);
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-wrapper">
        {/* Left Branding / Company Info Banner */}
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
                <h4>Enterprise Role Access</h4>
                <p>Role-based security across plant, store, QC, and purchase teams.</p>
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

        {/* Right Sign-In Form Side */}
        <div className="auth-form-side">
          <div className="auth-form-header">
            <h3>Sign In to ERP System</h3>
            <p>Enter your credentials or select a demo role profile below</p>
          </div>

          {error && (
            <div className="auth-error-alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Credentials Login Form */}
          <form onSubmit={handleSubmit} className="auth-form">
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
              <label>Password</label>
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

          {/* Divider */}
          <div className="auth-divider">
            <span>OR QUICK DEMO LOGIN</span>
          </div>

          {/* Quick Demo Roles Cards */}
          <div className="demo-accounts-container">
            <p className="demo-hint-text">Select a team profile to sign in instantly:</p>
            <div className="demo-user-grid">
              {users.map((u) => (
                <div 
                  key={u.id} 
                  className="demo-user-card"
                  onClick={() => handleQuickDemoLogin(u)}
                >
                  <div className="demo-user-avatar">
                    {u.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="demo-user-info">
                    <span className="demo-user-name">{u.name}</span>
                    <span className="demo-user-role">{u.role}</span>
                  </div>
                  <UserCheck size={16} className="demo-user-action" />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
