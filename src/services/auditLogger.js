import { isSupabaseConfigured, supabase } from './supabaseClient';
import { ensureValidSession, handleSupabaseError } from './supabaseDataService';

const RETENTION_DAYS = 180; // Minimum 6 months retention

/**
 * Filter out logs older than RETENTION_DAYS (180 days / 6 months)
 */
export function pruneOldAuditLogs(logs = []) {
  if (!Array.isArray(logs)) return [];
  const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return logs.filter(log => {
    if (!log || !log.timestamp) return true;
    const logTime = new Date(log.timestamp).getTime();
    return !isNaN(logTime) ? logTime >= cutoffTime : true;
  });
}

/**
 * Format Audit Log Payload for Supabase table or metadata
 */
export function mapAuditLogToDbPayload(entry) {
  if (!entry) return null;
  return {
    id: String(entry.id),
    username: entry.username || 'System',
    user_role: entry.userRole || '',
    action_type: entry.actionType || 'UPDATE',
    module: entry.module || 'System',
    details: entry.details || '',
    target_id: entry.targetId ? String(entry.targetId) : null,
    created_at: entry.timestamp || new Date().toISOString()
  };
}

/**
 * Fetch Audit Logs from the audit_logs table
 */
export async function fetchAuditLogsFromSupabase(limit = 100) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase database connection is not available.');
  }
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) handleSupabaseError(error, 'audit_logs');

  const fetchedLogs = (data || []).map(d => {
      const ts = d.created_at || new Date().toISOString();
      const dt = new Date(ts);
      return {
        id: String(d.id),
        timestamp: ts,
        dateStr: dt.toLocaleDateString('en-GB'),
        timeStr: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        username: d.username || 'Admin',
        userRole: d.user_role || 'Admin',
        actionType: d.action_type || 'UPDATE',
        module: d.module || 'System',
        details: d.details || '',
        targetId: d.target_id || null
      };
    });

  return pruneOldAuditLogs(fetchedLogs);
}

/**
 * Save Audit Log Entry to local storage and Supabase
 */
export async function saveAuditLogToSupabase(entry) {
  if (!entry) return;
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase database connection is not available.');
  }
  await ensureValidSession();
  const payload = mapAuditLogToDbPayload(entry);
  const { error } = await supabase.from('audit_logs').upsert(payload, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'audit_logs');
}

/**
 * Create a new Audit Log entry helper
 */
export function createAuditEntry(user, actionType, module, details, targetId = null) {
  const dt = new Date();
  const username = typeof user === 'string' ? user : (user?.name || user?.username || 'Admin');
  const userRole = typeof user === 'object' ? (user?.role || '') : '';

  return {
    id: `LOG-2026-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    timestamp: dt.toISOString(),
    dateStr: dt.toLocaleDateString('en-GB'),
    timeStr: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    username,
    userRole,
    actionType: actionType ? actionType.toUpperCase() : 'UPDATE',
    module: module || 'System',
    details: details || '',
    targetId: targetId ? String(targetId) : null
  };
}
