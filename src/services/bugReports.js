import { supabase, isSupabaseConfigured } from './supabaseClient';
import { ensureValidSession, handleSupabaseError } from './supabaseDataService';
import {
  BUG_SCREENSHOT_BUCKET,
  bugScreenshotPath,
  normalizeImageMime,
} from '../utils/bugReport';

export function mapBugReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    reporterAuthId: row.reporter_auth_id,
    reporterUserId: row.reporter_user_id || '',
    reporterName: row.reporter_name || '',
    reporterRole: row.reporter_role || '',
    title: row.title || '',
    description: row.description || '',
    pageUrl: row.page_url || '',
    module: row.module || '',
    severity: row.severity || 'Medium',
    status: row.status || 'New',
    screenshotPaths: Array.isArray(row.screenshot_paths) ? row.screenshot_paths : [],
    userAgent: row.user_agent || '',
    screenWidth: row.screen_width,
    screenHeight: row.screen_height,
    appVersion: row.app_version || '',
    metadata: row.metadata || {},
    resolutionNote: row.resolution_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

async function authUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    throw new Error('Sign in before reporting a bug.');
  }
  return data.user.id;
}

export async function countNewBugReports() {
  if (!isSupabaseConfigured()) return 0;
  const { count, error } = await supabase
    .from('bug_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'New');
  if (error) handleSupabaseError(error, 'bug_reports');
  return Number(count) || 0;
}

export async function listBugReports() {
  if (!isSupabaseConfigured()) throw new Error('Supabase database connection is not available.');
  await ensureValidSession();
  const { data, error } = await supabase
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) handleSupabaseError(error, 'bug_reports');
  return (data || []).map(mapBugReport);
}

export async function bugScreenshotUrls(paths) {
  const urls = [];
  for (const path of paths || []) {
    const { data, error } = await supabase.storage.from(BUG_SCREENSHOT_BUCKET).createSignedUrl(path, 60 * 60);
    urls.push({
      path,
      url: data?.signedUrl || '',
      error: error?.message || '',
    });
  }
  return urls;
}

export async function submitBugReport({
  title,
  description,
  pageUrl,
  module,
  severity,
  images,
  metadata,
} = {}) {
  if (!isSupabaseConfigured()) throw new Error('Supabase database connection is not available.');
  await ensureValidSession();
  const userId = await authUserId();
  const reportId = crypto.randomUUID();
  const shots = Array.isArray(images) ? images : [];
  const paths = [];
  try {
    for (let i = 0; i < shots.length; i += 1) {
      const file = shots[i];
      const mime = normalizeImageMime(file?.type, file?.name);
      const path = bugScreenshotPath(userId, reportId, i + 1, mime);
      if (!path) throw new Error('Use a PNG, JPG, or WebP image.');
      const { error } = await supabase.storage.from(BUG_SCREENSHOT_BUCKET).upload(path, file, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw error;
      paths.push(path);
    }

    const { data, error } = await supabase
      .from('bug_reports')
      .insert({
        id: reportId,
        reporter_auth_id: userId,
        title: title?.trim() || null,
        description: String(description || '').trim(),
        page_url: String(pageUrl || '').trim(),
        module: module?.trim() || null,
        severity: severity || 'Medium',
        screenshot_paths: paths,
        user_agent: metadata?.userAgent || null,
        screen_width: metadata?.screenWidth || null,
        screen_height: metadata?.screenHeight || null,
        app_version: metadata?.appVersion || null,
        metadata: metadata || {},
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapBugReport(data);
  } catch (err) {
    if (paths.length) {
      await supabase.storage.from(BUG_SCREENSHOT_BUCKET).remove(paths);
    }
    throw err;
  }
}

export async function updateBugReportStatus(id, status, resolutionNote) {
  if (!isSupabaseConfigured()) throw new Error('Supabase database connection is not available.');
  await ensureValidSession();
  const { data, error } = await supabase
    .from('bug_reports')
    .update({
      status,
      resolution_note: resolutionNote?.trim() ? resolutionNote.trim() : null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) handleSupabaseError(error, 'bug_reports');
  return mapBugReport(data);
}
