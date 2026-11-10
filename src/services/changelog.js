import { supabase, isSupabaseConfigured } from './supabaseClient';
import { ensureValidSession, handleSupabaseError } from './supabaseDataService';
import { changelogLine, istInputToIso } from '../utils/changelog';

export function mapChangelogEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    implementedAt: row.implemented_at,
    entryType: row.entry_type || '',
    title: row.title || '',
    description: row.description || '',
    prNumber: row.pr_number ?? null,
    module: row.module || '',
    bugReportId: row.bug_report_id || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payloadFromDraft(draft) {
  const implementedAt = draft.implementedAtIso || istInputToIso(draft.implementedAt) || draft.implementedAt;
  const pr = String(draft.prNumber ?? '').trim();
  return {
    implemented_at: implementedAt,
    entry_type: draft.entryType,
    title: changelogLine(draft.title),
    description: changelogLine(draft.description),
    pr_number: pr ? Number(pr) : null,
    module: changelogLine(draft.module) || null,
    bug_report_id: draft.bugReportId || null,
  };
}

export async function listChangelogEntries() {
  if (!isSupabaseConfigured()) throw new Error('Supabase database connection is not available.');
  await ensureValidSession();
  const { data, error } = await supabase
    .from('changelog_entries')
    .select('*')
    .order('implemented_at', { ascending: false })
    .limit(500);
  if (error) handleSupabaseError(error, 'changelog_entries');
  return (data || []).map(mapChangelogEntry);
}

export async function saveChangelogEntry(draft) {
  if (!isSupabaseConfigured()) throw new Error('Supabase database connection is not available.');
  await ensureValidSession();
  const payload = payloadFromDraft(draft);
  const query = draft.id
    ? supabase.from('changelog_entries').update(payload).eq('id', draft.id)
    : supabase.from('changelog_entries').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) handleSupabaseError(error, 'changelog_entries');
  return mapChangelogEntry(data);
}
