import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  Key, 
  Globe, 
  Server, 
  ShieldCheck, 
  AlertCircle,
  FileCode,
  Check,
  Zap,
  Layers,
  ArrowRight,
  Trash2
} from 'lucide-react';
import { 
  isSupabaseConfigured, 
  checkSupabaseConnection, 
  saveSupabaseCredentials, 
  clearSupabaseCredentials,
  getSupabaseCredentials
} from '../services/supabaseClient';
import { seedAllDataToSupabase, clearAllSupabaseData } from '../services/supabaseDataService';

export default function SupabaseManagement() {
  const [urlInput, setUrlInput] = useState(() => {
    return getSupabaseCredentials().url || '';
  });
  const [keyInput, setKeyInput] = useState(() => {
    return getSupabaseCredentials().key || '';
  });

  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [connectionState, setConnectionState] = useState({
    checked: false,
    connected: false,
    message: '',
    error: null
  });

  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('status'); // 'status', 'config', 'schema', 'auth'

  const handleSeedData = async () => {
    setSeeding(true);
    setSeedResult(null);
    const res = await seedAllDataToSupabase();
    setSeeding(false);
    setSeedResult(res);
  };

  const handlePurgeSupabaseData = async () => {
    if (!window.confirm("Are you sure you want to purge all data from Supabase tables? This cannot be undone.")) return;
    setSeeding(true);
    setSeedResult(null);
    const res = await clearAllSupabaseData();
    setSeeding(false);
    setSeedResult(res);
  };

  const runConnectionCheck = async () => {
    setLoading(true);
    const result = await checkSupabaseConnection();
    setConnectionState({
      checked: true,
      connected: result.connected,
      message: result.message,
      error: result.error || null
    });
    setLoading(false);
  };

  useEffect(() => {
    runConnectionCheck();
  }, []);

  const handleSaveConfig = (e) => {
    e.preventDefault();
    saveSupabaseCredentials(urlInput, keyInput);
    runConnectionCheck();
  };

  const handleClearConfig = () => {
    clearSupabaseCredentials();
    setUrlInput('');
    setKeyInput('');
    setConnectionState({
      checked: true,
      connected: false,
      message: 'Credentials cleared. Configure Supabase credentials to reconnect.',
      error: null
    });
  };

  const sqlSchemaSnippet = `-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    order_type TEXT DEFAULT 'Reel',
    order_qty_kg NUMERIC,
    target_delivery_date DATE,
    status TEXT DEFAULT 'Scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    stock_qty_kg NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.orders FOR ALL USING (true);
CREATE POLICY "Public full access" ON public.inventory FOR ALL USING (true);`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlSchemaSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configured = isSupabaseConfigured();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner / Actions Bar */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', 
              padding: '14px', 
              borderRadius: '12px', 
              color: 'white',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
            }}>
              <Database size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Supabase Database Integration
                </h2>
                <span className={`badge ${connectionState.connected ? 'badge-us' : configured ? 'badge-warning' : 'badge-client'}`} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                  {connectionState.connected ? '● ONLINE' : configured ? '● UNVERIFIED' : '○ DISCONNECTED'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                Manage live PostgreSQL connection, API credentials, schema scripts, and cloud data synchronization
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={runConnectionCheck}
              disabled={loading}
              className="btn-primary"
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              onClick={handleSeedData}
              disabled={seeding || !isSupabaseConfigured()}
              className="btn-primary"
              style={{ background: '#4f46e5', borderColor: '#4f46e5', opacity: (!isSupabaseConfigured() || seeding) ? 0.6 : 1 }}
              title="Upload initial factory data to Supabase database"
            >
              <Zap size={16} />
              {seeding ? 'Syncing...' : 'Push Seed Data'}
            </button>

            <button
              onClick={handlePurgeSupabaseData}
              disabled={seeding || !isSupabaseConfigured()}
              className="btn-secondary"
              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', opacity: (!isSupabaseConfigured() || seeding) ? 0.6 : 1 }}
              title="Wipe all data from Supabase tables"
            >
              <Trash2 size={15} />
              Purge Remote Data
            </button>
          </div>
        </div>
      </div>

      {/* Seed Operation Notification */}
      {seedResult && (
        <div style={{
          padding: '14px 20px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyInBetween: 'space-between',
          background: seedResult.success ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${seedResult.success ? '#a7f3d0' : '#fecaca'}`,
          color: seedResult.success ? '#047857' : '#b91c1c'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', fontWeight: '500' }}>
            {seedResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{seedResult.message}</span>
          </div>
          <button 
            onClick={() => setSeedResult(null)} 
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'inherit', fontWeight: '600' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Subtab Navigation Pills */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveSubTab('status')}
          className={`tab-pill ${activeSubTab === 'status' ? 'active' : ''}`}
        >
          <Server size={16} />
          Connection Overview
        </button>
        <button
          onClick={() => setActiveSubTab('config')}
          className={`tab-pill ${activeSubTab === 'config' ? 'active' : ''}`}
        >
          <Key size={16} />
          Credentials & API Setup
        </button>
        <button
          onClick={() => setActiveSubTab('schema')}
          className={`tab-pill ${activeSubTab === 'schema' ? 'active' : ''}`}
        >
          <FileCode size={16} />
          SQL Schema Script
        </button>
        <button
          onClick={() => setActiveSubTab('auth')}
          className={`tab-pill ${activeSubTab === 'auth' ? 'active' : ''}`}
        >
          <ShieldCheck size={16} />
          Supabase Auth & Roles
        </button>
      </div>

      {/* SUBTAB 1: CONNECTION OVERVIEW */}
      {activeSubTab === 'status' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          
          {/* Main Status & Health Panel */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} style={{ color: '#059669' }} />
                Supabase Status & Health
              </h3>
            </div>

            {/* Status Alert Banner */}
            <div style={{
              padding: '16px 20px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              background: connectionState.connected ? '#ecfdf5' : configured ? '#fffbeb' : '#fef2f2',
              border: `1px solid ${connectionState.connected ? '#a7f3d0' : configured ? '#fde68a' : '#fecaca'}`
            }}>
              {connectionState.connected ? (
                <CheckCircle2 size={24} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
              ) : configured ? (
                <AlertCircle size={24} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <XCircle size={24} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ 
                    fontWeight: '700', 
                    fontSize: '0.95rem',
                    color: connectionState.connected ? '#047857' : configured ? '#b45309' : '#b91c1c' 
                  }}>
                    {connectionState.connected
                      ? 'Database Live & Connected'
                      : configured
                      ? 'Credentials Configured (Verification Pending)'
                      : 'Supabase Not Configured'}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  {connectionState.message || 'Configure your Supabase URL & API key to connect to PostgreSQL.'}
                </p>
              </div>
            </div>

            {/* Quick Details Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="glass-card" style={{ padding: '16px', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Project URL
                </span>
                <span style={{ 
                  display: 'block', 
                  marginTop: '6px', 
                  fontSize: '0.85rem', 
                  fontFamily: 'monospace', 
                  fontWeight: '600',
                  color: urlInput ? '#047857' : 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {urlInput || 'Not configured'}
                </span>
              </div>

              <div className="glass-card" style={{ padding: '16px', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Anon API Key Status
                </span>
                <span style={{ 
                  display: 'block', 
                  marginTop: '6px', 
                  fontSize: '0.85rem', 
                  fontFamily: 'monospace', 
                  fontWeight: '600',
                  color: keyInput ? 'var(--text-primary)' : 'var(--text-muted)'
                }}>
                  {keyInput ? `${keyInput.substring(0, 18)}...` : 'Not configured'}
                </span>
              </div>
            </div>

            {/* Setup Guide */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                Quick Setup Instructions
              </h4>
              <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <li>
                  Create a free project on <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: '600', textDecoration: 'none' }}>Supabase.com</a>.
                </li>
                <li>
                  Go to <strong>Project Settings &gt; API</strong> and copy your <strong>Project URL</strong> and <strong>anon public key</strong>.
                </li>
                <li>
                  Paste them in the <strong>Credentials & API Setup</strong> tab or add them to your <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>.env</code> file as <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>VITE_SUPABASE_URL</code> and <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>VITE_SUPABASE_ANON_KEY</code>.
                </li>
                <li>
                  Run the SQL schema provided under the <strong>SQL Schema Script</strong> tab in your Supabase SQL Editor.
                </li>
              </ol>
            </div>

          </div>

          {/* Side Info / Quick Links Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} style={{ color: '#059669' }} />
                Supabase Console Links
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Quick shortcuts to manage tables, users, security policies, and SQL editor in your Supabase project.
              </p>

              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ justifyContent: 'space-between', width: '100%', textDecoration: 'none' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ExternalLink size={16} style={{ color: '#059669' }} />
                  Supabase Dashboard
                </span>
                <ArrowRight size={14} style={{ opacity: 0.6 }} />
              </a>

              <a
                href="https://supabase.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ justifyContent: 'space-between', width: '100%', textDecoration: 'none' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCode size={16} style={{ color: '#0d9488' }} />
                  Documentation & API
                </span>
                <ArrowRight size={14} style={{ opacity: 0.6 }} />
              </a>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} style={{ color: '#4f46e5' }} />
                Synced ERP Modules
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['Orders & POs', 'Vendors', 'Inventory & Stock', 'GRN & QC', 'Cylinders', 'Production Logs', 'User Accounts', 'Job Data Sheets'].map((mod, idx) => (
                  <span key={idx} style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: '500', 
                    background: '#f1f5f9', 
                    border: '1px solid var(--border-color)', 
                    padding: '4px 8px', 
                    borderRadius: '6px',
                    color: 'var(--text-secondary)'
                  }}>
                    ✓ {mod}
                  </span>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* SUBTAB 2: CREDENTIALS SETUP */}
      {activeSubTab === 'config' && (
        <div className="glass-panel" style={{ padding: '28px', maxWidth: '800px' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={20} style={{ color: '#059669' }} />
              Configure Supabase Credentials
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Credentials saved here are stored securely in browser LocalStorage and override environment defaults immediately.
            </p>
          </div>

          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Supabase Project URL <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '400' }}>(VITE_SUPABASE_URL)</code>
              </label>
              <input
                type="text"
                placeholder="https://your-project-id.supabase.co"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Supabase Anon Public API Key <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '400' }}>(VITE_SUPABASE_ANON_KEY)</code>
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
              <button
                type="submit"
                className="btn-primary"
                style={{ background: '#059669', borderColor: '#059669' }}
              >
                <Check size={16} /> Save & Test Credentials
              </button>
              <button
                type="button"
                onClick={handleClearConfig}
                className="btn-secondary"
              >
                Reset to Defaults
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 3: SQL SCHEMA */}
      {activeSubTab === 'schema' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={20} style={{ color: '#059669' }} />
                Database Tables & DDL Initialization Script
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Copy and run this SQL script inside your Supabase project's <strong>SQL Editor</strong> tab to set up required tables & policies.
              </p>
            </div>
            <button
              onClick={copySqlToClipboard}
              className="btn-secondary"
            >
              {copied ? <Check size={16} style={{ color: '#059669' }} /> : <Copy size={16} />}
              {copied ? 'Copied to Clipboard!' : 'Copy SQL Script'}
            </button>
          </div>

          <pre style={{
            background: '#0f172a',
            color: '#34d399',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            fontSize: '0.82rem',
            fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
            lineHeight: '1.6',
            overflowX: 'auto',
            maxHeight: '400px'
          }}>
            {sqlSchemaSnippet}
          </pre>
        </div>
      )}

      {/* SUBTAB 4: SUPABASE AUTH & ROLES */}
      {activeSubTab === 'auth' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} style={{ color: '#059669' }} />
                Supabase Authentication & Role Sync
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Automated Cloud User Authentication, JWT Tokens, and PostgreSQL User Sync Triggers
              </p>
            </div>
            <span className={`badge ${isSupabaseConfigured() ? 'badge-us' : 'badge-warning'}`} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              {isSupabaseConfigured() ? '✓ Supabase Auth Enabled' : '⚠ Local Auth Mode Active'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} style={{ color: '#059669' }} />
                1. Enable Email / Password Provider
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                In your Supabase project dashboard, navigate to <strong>Authentication &rarr; Providers &rarr; Email</strong> and confirm that <em>Enable Email Provider</em> is toggled <strong>ON</strong>.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: '#4f46e5' }} />
                2. Automated User Sync Trigger
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                When users register or log in via Supabase Auth, PostgreSQL trigger <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>on_auth_user_created</code> synchronizes profile and RBAC roles to <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>public.users</code>.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PostgreSQL User Sync Trigger SQL Function
            </h4>
            <pre style={{
              background: '#0f172a',
              color: '#34d399',
              padding: '18px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              fontSize: '0.8rem',
              fontFamily: 'Consolas, Monaco, monospace',
              lineHeight: '1.5',
              overflowX: 'auto'
            }}>
{`CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, full_name, email, role, department, active)
  VALUES (
    NEW.id::text,
    LOWER(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Admin'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Executive Management'),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`}
            </pre>
          </div>

        </div>
      )}

    </div>
  );
}
