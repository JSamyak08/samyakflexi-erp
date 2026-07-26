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
  Check
} from 'lucide-react';
import { 
  isSupabaseConfigured, 
  checkSupabaseConnection, 
  saveSupabaseCredentials, 
  clearSupabaseCredentials 
} from '../services/supabaseClient';

export default function SupabaseManagement() {
  const [urlInput, setUrlInput] = useState(() => {
    return localStorage.getItem('samyak_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
  });
  const [keyInput, setKeyInput] = useState(() => {
    return localStorage.getItem('samyak_supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  });

  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState({
    checked: false,
    connected: false,
    message: '',
    error: null
  });
  
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('status'); // 'status', 'config', 'schema'

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
    <div className="p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-xl backdrop-blur-sm">
            <Database className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Supabase Database Integration</h1>
            <p className="text-emerald-200/80 text-sm mt-1">
              Connect your Samyak Flexi-ERP frontend to Supabase PostgreSQL database & Auth service
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runConnectionCheck}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md hover:shadow-emerald-600/30 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Testing Connection...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 gap-2">
        <button
          onClick={() => setActiveSubTab('status')}
          className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'status'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-4 h-4" />
          Connection Overview
        </button>
        <button
          onClick={() => setActiveSubTab('config')}
          className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'config'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          Credentials & API Setup
        </button>
        <button
          onClick={() => setActiveSubTab('schema')}
          className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'schema'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          SQL Database Schema
        </button>
      </div>

      {/* SUBTAB 1: STATUS OVERVIEW */}
      {activeSubTab === 'status' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Status Card */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Supabase Status & Health
            </h2>

            <div className="p-4 rounded-xl border bg-slate-950/60 flex items-start gap-4">
              {connectionState.connected ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
              ) : configured ? (
                <AlertCircle className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-100">
                    {connectionState.connected
                      ? 'Connected to Supabase'
                      : configured
                      ? 'Credentials Configured (Verification Needed)'
                      : 'Supabase Not Configured'}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      connectionState.connected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {connectionState.connected ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <p className="text-sm text-slate-300">
                  {connectionState.message || 'Check your Supabase URL & API Key configuration.'}
                </p>
              </div>
            </div>

            {/* Quick Details List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block font-medium">Project URL</span>
                <span className="text-sm font-mono text-emerald-400 truncate block mt-1">
                  {urlInput || 'Not configured'}
                </span>
              </div>
              <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block font-medium">Anon Key Status</span>
                <span className="text-sm font-mono text-slate-200 block mt-1">
                  {keyInput ? `${keyInput.substring(0, 15)}...` : 'Not configured'}
                </span>
              </div>
            </div>

            {/* Steps to setup */}
            <div className="border-t border-slate-800 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">Quick Setup Guide</h3>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
                <li>Create a free Supabase project at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">supabase.com</a>.</li>
                <li>Copy your <strong>Project URL</strong> and <strong>anon public API key</strong> from Project Settings &gt; API.</li>
                <li>Paste them under the <strong>Credentials & API Setup</strong> tab or into your project's <code className="text-emerald-300 bg-slate-800 px-1 py-0.5 rounded">.env</code> file as <code className="text-emerald-300 bg-slate-800 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="text-emerald-300 bg-slate-800 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>.</li>
                <li>Run the provided SQL Schema in Supabase SQL Editor to initialize all ERP tables.</li>
              </ol>
            </div>
          </div>

          {/* Useful Links & Actions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              Supabase Console
            </h2>

            <p className="text-xs text-slate-300 leading-relaxed">
              Manage your cloud database tables, user authentication, Realtime subscriptions, and storage buckets.
            </p>

            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full p-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-sm font-medium transition-all group"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-emerald-400" />
                Supabase Dashboard
              </span>
              <span className="text-xs text-slate-400 group-hover:text-emerald-400">Open &rarr;</span>
            </a>

            <a
              href="https://supabase.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full p-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-sm font-medium transition-all group"
            >
              <span className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-teal-400" />
                Supabase Documentation
              </span>
              <span className="text-xs text-slate-400 group-hover:text-teal-400">Open &rarr;</span>
            </a>
          </div>
        </div>
      )}

      {/* SUBTAB 2: CREDENTIALS SETUP */}
      {activeSubTab === 'config' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg max-w-3xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-400" />
              Configure Supabase Credentials
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Credentials saved here take immediate effect for this session and override environment defaults.
            </p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Supabase Project URL (VITE_SUPABASE_URL)
              </label>
              <input
                type="text"
                placeholder="https://your-project-ref.supabase.co"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Supabase Anon API Key (VITE_SUPABASE_ANON_KEY)
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md"
              >
                Save Credentials
              </button>
              <button
                type="button"
                onClick={handleClearConfig}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              >
                Reset to Defaults
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 3: SQL SCHEMA */}
      {activeSubTab === 'schema' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-emerald-400" />
                Database Tables & DDL Script
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Copy and run this script inside your Supabase project's SQL Editor to set up ERP tables.
              </p>
            </div>
            <button
              onClick={copySqlToClipboard}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>
          </div>

          <pre className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-96 leading-relaxed">
            {sqlSchemaSnippet}
          </pre>
        </div>
      )}
    </div>
  );
}
