import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeStorage';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { ensureValidSession, handleSupabaseError } from './supabaseDataService';

const AUDIT_LOGS_KEY = 'samyak_erp_audit_logs';
const RETENTION_DAYS = 180; // Minimum 6 months retention
const PLANT_TIME_ZONE = 'Asia/Kolkata';

export function formatAuditTimestamp(timestamp) {
  const dt = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now());
  const safe = Number.isNaN(dt.getTime()) ? new Date() : dt;
  return {
    dateStr: safe.toLocaleDateString('en-GB', { timeZone: PLANT_TIME_ZONE }),
    timeStr: `${safe.toLocaleTimeString('en-IN', {
      timeZone: PLANT_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })} IST`
  };
}

function mapAuditRow(d) {
  const ts = d.created_at || new Date().toISOString();
  const formatted = formatAuditTimestamp(ts);
  return {
    id: String(d.id),
    timestamp: ts,
    dateStr: formatted.dateStr,
    timeStr: formatted.timeStr,
    username: d.username || 'Admin',
    userRole: d.user_role || 'Admin',
    actionType: d.action_type || 'UPDATE',
    module: d.module || 'System',
    details: d.details || '',
    targetId: d.target_id || null
  };
}

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
    user_role: entry.userRole || 'Admin',
    action_type: entry.actionType || 'UPDATE',
    module: entry.module || 'System',
    details: entry.details || '',
    target_id: entry.targetId ? String(entry.targetId) : null,
    created_at: entry.timestamp || new Date().toISOString()
  };
}

/**
 * Fetch Audit Logs from Supabase with fallback to local storage
 */
export async function fetchAuditLogsPage({ limit = 100, offset = 0 } = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 100, 500));
  const start = Math.max(0, Number(offset) || 0);
  if (!isSupabaseConfigured()) {
    const local = pruneOldAuditLogs(safeLocalStorageGet(AUDIT_LOGS_KEY, []));
    return { logs: local.slice(start, start + pageSize), total: local.length };
  }
  try {
    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) {
      console.warn('[AuditLogs] Table fetch error, attempting fallback:', error.message);
      const { data: settingData } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'audit_logs')
        .single();

      if (settingData && settingData.setting_value) {
        try {
          const parsed = JSON.parse(settingData.setting_value);
          if (Array.isArray(parsed)) {
            const local = pruneOldAuditLogs(parsed);
            return { logs: local.slice(start, start + pageSize), total: local.length };
          }
        } catch (e) { /* ignore */ }
      }
      const local = pruneOldAuditLogs(safeLocalStorageGet(AUDIT_LOGS_KEY, []));
      return { logs: local.slice(start, start + pageSize), total: local.length };
    }

    const fetchedLogs = (data || []).map(mapAuditRow);
    return {
      logs: pruneOldAuditLogs(fetchedLogs),
      total: typeof count === 'number' ? count : fetchedLogs.length
    };
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    const local = pruneOldAuditLogs(safeLocalStorageGet(AUDIT_LOGS_KEY, []));
    return { logs: local.slice(start, start + pageSize), total: local.length };
  }
}

export async function fetchAuditLogsFromSupabase(limit = 100) {
  const page = await fetchAuditLogsPage({ limit, offset: 0 });
  return page.logs;
}

/**
 * Save Audit Log Entry to local storage and Supabase
 */
export async function saveAuditLogToSupabase(entry) {
  if (!entry) return;
  
  // 1. Update local storage immediately
  try {
    const existing = safeLocalStorageGet(AUDIT_LOGS_KEY, []);
    const updated = [entry, ...existing.filter(l => l.id !== entry.id)];
    const pruned = pruneOldAuditLogs(updated);
    safeLocalStorageSet(AUDIT_LOGS_KEY, pruned);
  } catch (e) {
    console.warn("Local storage audit log error:", e);
  }

  // 2. Async save to Supabase if active
  if (!isSupabaseConfigured()) return;
  try {
    await ensureValidSession();
    const payload = mapAuditLogToDbPayload(entry);
    
    // Attempt upsert to public.audit_logs
    const { error } = await supabase.from('audit_logs').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('[AuditLogs] Supabase direct insert notice:', error.message);
      // Fallback: save to system_settings envelope if table is missing
      const local = safeLocalStorageGet(AUDIT_LOGS_KEY, []);
      const pruned = pruneOldAuditLogs(local).slice(0, 500);
      await supabase.from('system_settings').upsert({
        setting_key: 'audit_logs',
        setting_value: JSON.stringify(pruned),
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });
    }
  } catch (err) {
    console.warn("Supabase audit log sync warning:", err);
  }
}

/**
 * Create a new Audit Log entry helper
 */
export function createAuditEntry(user, actionType, module, details, targetId = null) {
  const dt = new Date();
  const formatted = formatAuditTimestamp(dt);
  const username = typeof user === 'string' ? user : (user?.name || user?.full_name || user?.username || user?.email || 'Admin');
  const userRole = typeof user === 'object' && user ? (user?.role || 'Admin') : 'Admin';

  return {
    id: `LOG-2026-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    timestamp: dt.toISOString(),
    dateStr: formatted.dateStr,
    timeStr: formatted.timeStr,
    username,
    userRole,
    actionType: actionType ? actionType.toUpperCase() : 'UPDATE',
    module: module || 'System',
    details: details || '',
    targetId: targetId ? String(targetId) : null
  };
}
