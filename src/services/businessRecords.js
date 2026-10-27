/**
 * Business records that used to live in localStorage or system_settings blobs.
 * The database table is the store of record. A browser copy is only read once,
 * uploaded when the row is missing, then removed.
 */

import { toDatabaseTimestamp } from '../utils/dbDates.js';
import {
  applyScrapFilters,
  applyScrapServerPlan,
  buildScrapFilterContext,
  hasActiveScrapFilters,
  normalizeScrapFilters,
  planScrapServerQuery
} from '../utils/scrapStoreFilters.js';

export const PLANT_PRESS_ID = 'plant';

export const PAYLOAD_TABLES = [
  'stock_adjustments',
  'custom_barcodes',
  'po_discrepancy_resolutions',
  'sfg_qc_hold_items',
  'sfg_scrap_items',
  'material_indents',
  'machine_issues',
  'consumables',
  'store_issue_transactions',
  'erp_notifications'
];

const LOCAL_LIST_KEYS = {
  samyak_erp_stock_adjustments: 'stock_adjustments',
  samyak_cache_material_indents: 'material_indents',
  samyak_cache_machine_issues: 'machine_issues',
  samyak_cache_consumables: 'consumables',
  samyak_cache_store_issue_transactions: 'store_issue_transactions',
  samyak_erp_store_issue_transactions: 'store_issue_transactions',
  sfg_qc_hold_items: 'sfg_qc_hold_items',
  sfg_scrap_items: 'sfg_scrap_items',
  samyak_erp_notifications: 'erp_notifications'
};

const SETTING_LIST_KEYS = {
  stock_adjustments: 'stock_adjustments',
  samyak_erp_stock_adjustments: 'stock_adjustments',
  sfg_qc_hold_items: 'sfg_qc_hold_items',
  sfg_scrap_items: 'sfg_scrap_items',
  material_indents: 'material_indents',
  machine_issues: 'machine_issues',
  consumables: 'consumables',
  store_issue_transactions: 'store_issue_transactions'
};

export function stableLegacyId(prefix, value) {
  const text = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
  }
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}

export function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return [];
}

export function recordIdentity(record, fallbackPrefix) {
  if (!record || typeof record !== 'object') return null;
  const id = record.id || record.poNumber || record.po_number || record.quotationNo || record.dispatchId || record.challanNo;
  if (id) return String(id);
  return stableLegacyId(fallbackPrefix, record);
}

function pushUnique(bucket, record, prefix) {
  if (!record || typeof record !== 'object') return;
  const id = recordIdentity(record, prefix);
  if (!id || bucket.has(id)) return;
  bucket.set(id, { ...record, id: record.id || id });
}

function absorbList(bucket, value, prefix) {
  asArray(value).forEach((record) => pushUnique(bucket, record, prefix));
}

function absorbMap(bucket, value, prefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  Object.entries(value).forEach(([key, entry]) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      pushUnique(bucket, { ...entry, id: entry.id || key }, prefix);
    } else if (entry !== undefined && entry !== null) {
      pushUnique(bucket, { id: key, barcode: entry }, prefix);
    }
  });
}

/**
 * Merge browser copies and system_settings copies into the rows that still
 * need a table. Existing ids are kept once (first source wins: local, then settings).
 */
export function collectLegacyRecords({ local = {}, settings = {} } = {}) {
  const lists = {};
  PAYLOAD_TABLES.forEach((table) => { lists[table] = new Map(); });

  Object.entries(LOCAL_LIST_KEYS).forEach(([key, table]) => absorbList(lists[table], local[key], table));
  Object.entries(SETTING_LIST_KEYS).forEach(([key, table]) => absorbList(lists[table], settings[key], table));

  absorbMap(lists.custom_barcodes, local.samyak_erp_custom_barcodes, 'barcode');
  absorbMap(lists.custom_barcodes, settings.custom_barcodes, 'barcode');
  absorbMap(lists.custom_barcodes, settings.samyak_erp_custom_barcodes, 'barcode');
  absorbMap(lists.po_discrepancy_resolutions, local.samyak_po_discrepancy_resolutions, 'resolution');
  absorbMap(lists.po_discrepancy_resolutions, settings.po_discrepancy_resolutions, 'resolution');
  absorbMap(lists.po_discrepancy_resolutions, settings.samyak_po_discrepancy_resolutions, 'resolution');

  const purchaseOrders = new Map();
  absorbList(purchaseOrders, local.samyak_cache_purchase_orders, 'po');
  absorbList(purchaseOrders, settings.purchase_orders, 'po');
  absorbMap(purchaseOrders, local.samyak_erp_issued_pos, 'po');
  absorbMap(purchaseOrders, settings.samyak_erp_issued_pos, 'po');
  absorbMap(purchaseOrders, settings.issued_pos, 'po');

  const quotations = new Map();
  absorbList(quotations, local.samyak_erp_sales_quotations, 'qtn');

  const templates = new Map();
  asArray(local.samyak_coa_templates)
    .filter((tpl) => tpl && tpl.isBuiltIn !== true)
    .forEach((tpl) => pushUnique(templates, tpl, 'coa-tpl'));

  const scrap = new Map();
  absorbList(scrap, local.samyak_erp_scrap_disposals, 'scrap');
  absorbList(scrap, settings.scrap_disposals, 'scrap');
  absorbList(scrap, settings.samyak_erp_scrap_disposals, 'scrap');

  const dispatches = new Map();
  absorbList(dispatches, local.samyak_cache_dispatch_shipments, 'dispatch');
  absorbList(dispatches, settings.dispatch_shipments, 'dispatch');

  const challans = new Map();
  absorbList(challans, local.samyak_cache_delivery_challans, 'dc');
  absorbList(challans, settings.delivery_challans, 'dc');

  const certificates = new Map();
  absorbList(certificates, local.samyak_cache_certificate_of_analyses, 'coa');
  absorbList(certificates, settings.certificate_of_analyses, 'coa');

  const pelletInwards = new Map();
  absorbList(pelletInwards, local.samyak_cache_pellet_inwards, 'pellet-in');
  absorbList(pelletInwards, settings.pellet_inwards, 'pellet-in');

  const pelletConsumptions = new Map();
  absorbList(pelletConsumptions, local.samyak_cache_pellet_consumptions, 'pellet-out');
  absorbList(pelletConsumptions, settings.pellet_consumptions, 'pellet-out');

  const jobCards = new Map();
  Object.entries(local).forEach(([key, value]) => {
    if (key.startsWith('samyak_erp_jobcard_settings_') && value && typeof value === 'object') {
      pushUnique(jobCards, { ...value, id: key }, 'jobcard');
    }
  });
  Object.entries(settings).forEach(([key, value]) => {
    if (key.startsWith('jobcard_') && value && typeof value === 'object') {
      pushUnique(jobCards, { ...value, id: key }, 'jobcard');
    }
  });

  const press = {
    queueOrder: firstArray(local.samyak_cache_press_queue_order, settings.printing_press_queue_order),
    machineAssignments: firstObject(local.samyak_cache_press_machine_assignments, settings.printing_press_machine_assignments),
    activeRunningJob: local.samyak_cache_press_running_job || settings.printing_press_active_running_job || null
  };
  const hasPress = (press.queueOrder && press.queueOrder.length > 0)
    || (press.machineAssignments && Object.keys(press.machineAssignments).length > 0)
    || (press.activeRunningJob && typeof press.activeRunningJob === 'object');

  const vendors = new Map();
  absorbList(vendors, local.samyak_cache_vendors, 'vendor');

  const auditLogs = new Map();
  absorbList(auditLogs, local.samyak_erp_audit_logs, 'audit');
  absorbList(auditLogs, local.samyak_cache_audit_logs, 'audit');
  absorbList(auditLogs, settings.audit_logs, 'audit');

  return {
    lists: Object.fromEntries(Object.entries(lists).map(([table, map]) => [table, [...map.values()]])),
    purchaseOrders: [...purchaseOrders.values()],
    quotations: [...quotations.values()],
    templates: [...templates.values()],
    scrap: [...scrap.values()],
    dispatches: [...dispatches.values()],
    challans: [...challans.values()],
    certificates: [...certificates.values()],
    pelletInwards: [...pelletInwards.values()],
    pelletConsumptions: [...pelletConsumptions.values()],
    jobCards: [...jobCards.values()],
    press: hasPress ? press : null,
    vendors: [...vendors.values()],
    auditLogs: [...auditLogs.values()]
  };
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length > 0) || null;
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) || null;
}

export function vendorBlankPatch(localVendor, serverVendor) {
  if (!localVendor) return null;
  const patch = {};
  const fill = (column, ...candidates) => {
    const incoming = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    const current = serverVendor ? serverVendor[column] : null;
    if (incoming && (current === undefined || current === null || String(current).trim() === '')) {
      patch[column] = String(incoming).trim();
    }
  };
  fill('gstin', localVendor.gstin);
  fill('payment_terms', localVendor.paymentTerms, localVendor.payment_terms);
  fill('bank_details', localVendor.bankDetails, localVendor.bank_details);
  fill('contact_person', localVendor.contactPerson, localVendor.contact_person);
  fill('phone', localVendor.phone);
  fill('email', localVendor.email);
  fill('address', localVendor.address);
  if (!serverVendor && (localVendor.name || localVendor.companyName)) {
    return {
      id: localVendor.id,
      name: localVendor.name || localVendor.companyName,
      category: localVendor.category || '',
      ...patch
    };
  }
  return Object.keys(patch).length ? patch : null;
}

export function payloadRow(record, prefix) {
  const id = recordIdentity(record, prefix);
  return { id, payload: { ...record, id } };
}

export function rowsMissingFrom(existingIds, rows) {
  const have = new Set((existingIds || []).map((id) => String(id)));
  return rows.filter((row) => row && row.id && !have.has(String(row.id)));
}

async function existingIds(supabase, table, column = 'id') {
  const { data, error } = await supabase.from(table).select(column);
  if (error) throw error;
  return (data || []).map((row) => row[column]).filter(Boolean);
}

function dedupeBy(rows, key) {
  const seen = new Set();
  const unique = [];
  (rows || []).forEach((row) => {
    const id = row && row[key] != null ? String(row[key]) : '';
    if (!id || seen.has(id)) return;
    seen.add(id);
    unique.push(row);
  });
  return unique;
}

async function insertMissing(supabase, table, rows, onConflict = 'id') {
  const unique = dedupeBy(rows, onConflict);
  const missing = rowsMissingFrom(await existingIds(supabase, table, onConflict), unique.map((row) => ({
    ...row,
    id: row[onConflict] || row.id
  })));
  const payload = onConflict === 'id'
    ? missing
    : unique.filter((row) => missing.some((item) => String(item.id) === String(row[onConflict] || row.id)));
  if (!payload.length) return 0;
  const { error } = await supabase.from(table).upsert(payload, { onConflict, ignoreDuplicates: true });
  if (error) throw error;
  return payload.length;
}

export async function fetchPayloadRecords(supabase, table) {
  const { data, error } = await supabase.from(table).select('id, payload').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({ ...(row.payload || {}), id: row.payload?.id || row.id }));
}

async function countPayloadRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

function payloadRows(data) {
  return (data || []).map((row) => ({ ...(row.payload || {}), id: row.payload?.id || row.id }));
}

/**
 * Scrap store read. Equality, date, and high-scrap order filters run in
 * Postgres. The same rules run again in the browser so a wider server result
 * cannot show a row the screen should hide. A query the API rejects falls
 * back to loading the table and filtering it here.
 */
export async function fetchScrapStoreItems(supabase, filters = {}, context = buildScrapFilterContext()) {
  const normalized = normalizeScrapFilters(filters);
  let totalCount = null;
  try {
    totalCount = await countPayloadRows(supabase, 'sfg_scrap_items');
  } catch {
    totalCount = null;
  }
  const plan = planScrapServerQuery(normalized, context);
  if (plan.empty) {
    const applied = applyScrapFilters([], normalized, context);
    return { rows: applied.rows, summary: applied.summary, totalCount: totalCount ?? 0, source: 'server' };
  }
  const finish = (items, source) => {
    const applied = applyScrapFilters(items, normalized, context);
    return {
      rows: applied.rows,
      summary: applied.summary,
      totalCount: totalCount ?? items.length,
      source
    };
  };
  if (!plan.narrowed || !hasActiveScrapFilters(normalized)) {
    const rows = await fetchPayloadRecords(supabase, 'sfg_scrap_items');
    return finish(rows, 'all');
  }
  try {
    let query = supabase.from('sfg_scrap_items').select('id, payload').order('created_at', { ascending: false });
    query = applyScrapServerPlan(query, plan);
    const { data, error } = await query;
    if (error) throw error;
    return finish(payloadRows(data), 'server');
  } catch (err) {
    console.warn('[scrap store] server filter failed; filtering the full scrap store instead.', err?.message || err);
    const rows = await fetchPayloadRecords(supabase, 'sfg_scrap_items');
    return finish(rows, 'fallback');
  }
}

export async function replacePayloadRecords(supabase, table, records) {
  const rows = (records || []).map((record) => ({
    ...payloadRow(record, table),
    updated_at: new Date().toISOString()
  }));
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  const keep = new Set(rows.map((row) => String(row.id)));
  const current = await existingIds(supabase, table);
  const remove = current.filter((id) => !keep.has(String(id)));
  if (remove.length) {
    const { error } = await supabase.from(table).delete().in('id', remove);
    if (error) throw error;
  }
  return rows.map((row) => row.payload);
}

export async function fetchPressBoard(supabase) {
  const { data, error } = await supabase.from('press_board').select('*').eq('id', PLANT_PRESS_ID).maybeSingle();
  if (error) throw error;
  if (!data) {
    return { queueOrder: [], machineAssignments: {}, activeRunningJob: null };
  }
  return {
    queueOrder: Array.isArray(data.queue_order) ? data.queue_order : [],
    machineAssignments: data.machine_assignments && typeof data.machine_assignments === 'object' ? data.machine_assignments : {},
    activeRunningJob: data.active_running_job || null
  };
}

export async function savePressBoard(supabase, patch) {
  const current = await fetchPressBoard(supabase);
  const next = {
    queueOrder: patch.queueOrder !== undefined ? patch.queueOrder : current.queueOrder,
    machineAssignments: patch.machineAssignments !== undefined ? patch.machineAssignments : current.machineAssignments,
    activeRunningJob: patch.activeRunningJob !== undefined ? patch.activeRunningJob : current.activeRunningJob
  };
  const { error } = await supabase.from('press_board').upsert({
    id: PLANT_PRESS_ID,
    queue_order: next.queueOrder || [],
    machine_assignments: next.machineAssignments || {},
    active_running_job: next.activeRunningJob,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
  return next;
}

export function describeSaveError(error) {
  if (!error) return 'Unknown database error';
  return error.message || error.details || String(error);
}

export function localKeysToClear(local = {}) {
  return Object.keys(local).filter((key) => (
    key.startsWith('samyak_cache_')
    || key.startsWith('samyak_erp_jobcard_settings_')
    || key in LOCAL_LIST_KEYS
    || key === 'samyak_erp_custom_barcodes'
    || key === 'samyak_po_discrepancy_resolutions'
    || key === 'samyak_erp_scrap_disposals'
    || key === 'samyak_erp_sales_quotations'
    || key === 'samyak_coa_templates'
    || key === 'samyak_erp_issued_pos'
    || key === 'samyak_erp_notifications'
    || key === 'samyak_erp_audit_logs'
    || key === 'samyak_cache_audit_logs'
  ));
}

/**
 * Upload browser and system_settings copies that are not already in their tables.
 * Does not overwrite an existing row. Returns the local keys that were fully read
 * so the caller can delete them only after this resolves.
 */
export async function importLegacyBusinessRecords({ supabase, local = {}, settings = {} }) {
  if (!supabase) throw new Error('Supabase client is not available.');
  const bundle = collectLegacyRecords({ local, settings });
  const imported = {};

  for (const table of PAYLOAD_TABLES) {
    const rows = bundle.lists[table].map((record) => payloadRow(record, table));
    imported[table] = await insertMissing(supabase, table, rows);
  }

  imported.job_card_specs = await insertMissing(
    supabase,
    'job_card_specs',
    bundle.jobCards.map((record) => payloadRow(record, 'jobcard'))
  );

  const poRows = bundle.purchaseOrders.map((po) => ({
    id: String(po.id || po.poNumber),
    po_number: String(po.poNumber || po.po_number || po.id),
    po_date: normalizeDate(po.poDate || po.po_date || po.date),
    delivery_date: po.deliveryDate || po.delivery_date ? normalizeDate(po.deliveryDate || po.delivery_date) : null,
    promised_delivery_date: po.promisedDeliveryDate || po.promised_delivery_date ? normalizeDate(po.promisedDeliveryDate || po.promised_delivery_date) : null,
    vendor_id: po.vendorId || po.vendor?.id || null,
    vendor_name: po.vendorName || po.vendor?.companyName || po.vendor?.name || 'Vendor',
    vendor_details: po.vendor || {},
    category: po.category || 'Film Substrates',
    items: Array.isArray(po.items) ? po.items : [],
    total_qty_kg: Number(po.totalQtyKg) || 0,
    subtotal: Number(po.subtotal) || 0,
    tax_amount: Number(po.taxAmount) || 0,
    total_amount: Number(po.totalAmount) || 0,
    payment_terms: po.paymentTerms || po.payment_terms || '30 Days Net',
    logistic_details: po.logisticDetails || null,
    notes: po.notes || null,
    remarks: po.remarks || null,
    status: po.status || 'Pending Delivery',
    source: po.source || 'Imported from browser copy',
    linked_order_id: po.linkedOrderId || null,
    linked_order_name: po.linkedOrderName || null,
    linked_requirements: Array.isArray(po.linkedRequirements) ? po.linkedRequirements : [],
    created_by: po.createdBy || null
  })).filter((row) => row.po_number);
  const uniquePoRows = dedupeBy(dedupeBy(poRows, 'po_number'), 'id');
  const existingPoNumbers = await existingIds(supabase, 'purchase_orders', 'po_number');
  const existingPoIds = await existingIds(supabase, 'purchase_orders', 'id');
  const newPos = uniquePoRows.filter((row) => !existingPoNumbers.map(String).includes(String(row.po_number)) && !existingPoIds.map(String).includes(String(row.id)));
  if (newPos.length) {
    const { error } = await supabase.from('purchase_orders').insert(newPos);
    if (error) throw error;
  }
  imported.purchase_orders = newPos.length;

  imported.sales_quotations = await insertMissing(supabase, 'sales_quotations', bundle.quotations.map(quotationToRow));
  imported.material_structure_templates = await insertMissing(supabase, 'material_structure_templates', bundle.templates.map(templateToRow));
  imported.scrap_disposals = await insertMissing(supabase, 'scrap_disposals', bundle.scrap.map(scrapToRow));
  imported.dispatch_shipments = await insertMissing(supabase, 'dispatch_shipments', bundle.dispatches.map(dispatchToRow), 'dispatch_id');
  imported.delivery_challans = await insertMissing(supabase, 'delivery_challans', bundle.challans.map(challanToRow));
  imported.certificate_of_analyses = await insertMissing(supabase, 'certificate_of_analyses', bundle.certificates.map(coaToRow));
  imported.pellet_inwards = await insertMissing(supabase, 'pellet_inwards', bundle.pelletInwards.map(pelletInToRow));
  imported.pellet_consumptions = await insertMissing(supabase, 'pellet_consumptions', bundle.pelletConsumptions.map(pelletOutToRow));
  imported.audit_logs = await insertMissing(supabase, 'audit_logs', bundle.auditLogs.map(auditToRow));

  if (bundle.press) {
    const { data, error } = await supabase.from('press_board').select('id').eq('id', PLANT_PRESS_ID).maybeSingle();
    if (error) throw error;
    if (!data) {
      await savePressBoard(supabase, bundle.press);
      imported.press_board = 1;
    } else {
      imported.press_board = 0;
    }
  }

  const { data: serverVendors, error: vendorError } = await supabase.from('vendors').select('*');
  if (vendorError) throw vendorError;
  const byId = new Map((serverVendors || []).map((vendor) => [String(vendor.id), vendor]));
  let vendorPatches = 0;
  for (const localVendor of bundle.vendors) {
    if (!localVendor.id) continue;
    const serverVendor = byId.get(String(localVendor.id));
    const patch = vendorBlankPatch(localVendor, serverVendor);
    if (!patch) continue;
    if (!serverVendor) {
      const { error } = await supabase.from('vendors').insert({
        id: localVendor.id,
        name: patch.name,
        category: patch.category || null,
        gstin: patch.gstin || null,
        payment_terms: patch.payment_terms || null,
        bank_details: patch.bank_details || null,
        contact_person: patch.contact_person || null,
        phone: patch.phone || null,
        email: patch.email || null,
        address: patch.address || null
      });
      if (error) throw error;
      vendorPatches += 1;
    } else {
      const { error } = await supabase.from('vendors').update(patch).eq('id', localVendor.id);
      if (error) throw error;
      vendorPatches += 1;
    }
  }
  imported.vendors = vendorPatches;
  return imported;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function snapshotBrowserStorage(storage) {
  const local = {};
  if (!storage) return local;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const raw = storage.getItem(key);
    if (raw == null) continue;
    try {
      local[key] = JSON.parse(raw);
    } catch {
      local[key] = raw;
    }
  }
  return local;
}

export function clearImportedLocalKeys(storage, keys) {
  (keys || []).forEach((key) => {
    try { storage.removeItem(key); } catch { /* the next boot retries the upload */ }
  });
}

function quotationToRow(q) {
  return {
    id: String(q.id || q.quotationNo),
    quotation_no: q.quotationNo || null,
    revision_no: q.revisionNo || 0,
    amendment_no: q.amendmentNo || 'Rev 00',
    enquiry_date: normalizeDate(q.enquiryDate),
    estimated_delivery_date: q.estimatedDeliveryDate ? normalizeDate(q.estimatedDeliveryDate) : null,
    sales_manager: q.salesManager || null,
    client_name: q.clientName || null,
    client_address: q.clientAddress || null,
    client_gstin: q.clientGstin || null,
    contact_person: q.contactPerson || null,
    contact_phone: q.contactPhone || null,
    contact_email: q.contactEmail || null,
    payment_terms: q.paymentTerms || null,
    cylinder_terms: q.cylinderTerms || null,
    transport_terms: q.transportTerms || null,
    status: q.status || 'Draft',
    ocn_ref_no: q.ocnRefNo || '',
    converted_date: q.convertedDate || '',
    items: q.items || [],
    terms_and_conditions: q.termsAndConditions || [],
    comments: q.comments || '',
    terms_template_key: q.termsTemplateKey || null
  };
}

function templateToRow(tpl) {
  return {
    id: String(tpl.id),
    name: tpl.name || 'Template',
    is_built_in: false,
    specification: tpl.specification || null,
    film_type: tpl.filmType || null,
    thickness_micron: tpl.thicknessMicron || null,
    parameters: tpl.parameters || []
  };
}

function scrapToRow(item) {
  return {
    id: String(item.id),
    category: item.category || 'Scrap',
    qty_kg: Number(item.qtyKg ?? item.qty_kg) || 0,
    vendor: item.vendor || 'Scrap Recycler',
    ref_no: item.refNo || item.ref_no || null,
    disposed_date: normalizeDate(item.date || item.disposedDate || item.disposed_date),
    disposed_by: item.disposedBy || item.disposed_by || null,
    notes: item.notes || null
  };
}

function dispatchToRow(item) {
  const id = String(item.dispatchId || item.id);
  const dispatchDate = toDatabaseTimestamp(item.dispatchDate);
  const stored = {
    ...item,
    dispatchDate,
    ...(item.createdAt ? { createdAt: toDatabaseTimestamp(item.createdAt) } : {})
  };
  return {
    dispatch_id: id,
    id,
    order_id: item.orderId || null,
    job_name: item.jobName || '—',
    client_name: item.clientName || '—',
    vehicle_no: item.vehicleNo || null,
    lr_no: item.lrNo || null,
    transporter_name: item.transporterName || null,
    po_no: item.poNo || null,
    invoice_no: item.invoiceNo || null,
    dispatch_date: dispatchDate,
    total_rolls: Number(item.totalRolls) || 0,
    total_net_weight_kg: Number(item.totalNetWeightKg) || 0,
    total_gross_weight_kg: Number(item.totalGrossWeightKg) || 0,
    items: item.items || [],
    hide_branding: Boolean(item.hideBranding),
    payload: stored
  };
}

function challanToRow(item) {
  return {
    id: String(item.id),
    challan_no: item.challanNo || null,
    client_name: item.clientName || item.partyName || null,
    payload: item
  };
}

function coaToRow(item) {
  return {
    id: String(item.id),
    coa_no: item.coaNo || null,
    job_name: item.jobName || null,
    customer_name: item.customerName || null,
    payload: item
  };
}

function pelletInToRow(item) {
  return {
    id: String(item.id),
    grn_no: item.grnNo || null,
    inward_date: normalizeDate(item.inwardDate),
    inward_qty_kg: Number(item.inwardQtyKg) || 0,
    unit_cost_per_kg: Number(item.unitCostPerKg) || 0,
    total_amount: Number(item.totalAmount) || 0,
    vehicle_no: item.vehicleNo || null,
    payload: item
  };
}

function pelletOutToRow(item) {
  return {
    id: String(item.id),
    consumption_date: normalizeDate(item.consumptionDate),
    consumed_qty_kg: Number(item.consumedQtyKg) || 0,
    operating_hours: Number(item.operatingHours) || 0,
    reference_printing_done_kg: Number(item.referencePrintingDoneKg) || 0,
    payload: item
  };
}

function auditToRow(item) {
  return {
    id: String(item.id),
    username: item.username || 'System',
    user_role: item.userRole || item.user_role || '',
    action_type: item.actionType || item.action_type || 'UPDATE',
    module: item.module || 'System',
    details: item.details || '',
    target_id: item.targetId || item.target_id || null,
    created_at: item.timestamp || item.created_at || new Date().toISOString()
  };
}

export async function fetchMaterialTemplates(supabase) {
  const { data, error } = await supabase.from('material_structure_templates').select('*').order('name');
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    isBuiltIn: Boolean(row.is_built_in),
    specification: row.specification || '',
    filmType: row.film_type || '',
    thicknessMicron: row.thickness_micron || '',
    parameters: row.parameters || []
  }));
}

export async function saveMaterialTemplate(supabase, template) {
  const row = templateToRow({ ...template, isBuiltIn: false });
  const { error } = await supabase.from('material_structure_templates').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row;
}

export async function deleteMaterialTemplate(supabase, id) {
  const { error } = await supabase.from('material_structure_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchScrapDisposals(supabase) {
  const { data, error } = await supabase.from('scrap_disposals').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    category: row.category,
    qtyKg: Number(row.qty_kg) || 0,
    vendor: row.vendor,
    refNo: row.ref_no,
    date: row.disposed_date,
    disposedBy: row.disposed_by,
    notes: row.notes
  }));
}

export async function saveScrapDisposal(supabase, item) {
  const row = scrapToRow(item);
  const { error } = await supabase.from('scrap_disposals').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return item;
}

export async function fetchJobCardSpec(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase.from('job_card_specs').select('payload').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.payload || null;
}

export async function saveJobCardSpec(supabase, id, payload) {
  const { error } = await supabase.from('job_card_specs').upsert({
    id,
    payload,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

/** Insert or update payload rows without deleting the rest of the table. */
export async function upsertPayloadRecords(supabase, table, records) {
  const rows = (records || []).filter(Boolean).map((record) => ({
    ...payloadRow(record, table),
    updated_at: new Date().toISOString()
  }));
  if (!rows.length) return [];
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return rows.map((row) => row.payload);
}

/**
 * Scrap store write used by End Job. Same sfg_scrap_items payload shape as the
 * SFG store. Zero quantities are skipped, and a retry upserts the same ids.
 */
export async function savePrintingScrapEntries(supabase, plan) {
  const deleteIds = (plan?.deleteIds || []).map(String).filter(Boolean);
  if (deleteIds.length) {
    const { error } = await supabase.from('sfg_scrap_items').delete().in('id', deleteIds);
    if (error) throw error;
  }
  return upsertPayloadRecords(supabase, 'sfg_scrap_items', plan?.upserts || []);
}

function isMissingRelation(error) {
  const code = error?.code || error?.cause?.code;
  const message = String(error?.message || error || '');
  return code === '42P01' || (/high_scrap_registry/i.test(message) && /does not exist|schema cache|could not find/i.test(message));
}

/**
 * Writes process-wastage scrap rows and the high-scrap registry row for one job.
 * A missing high_scrap_registry table (migration not applied yet) does not
 * block the scrap-store write. QC scrap rows are not in the delete list.
 */
export async function saveJobWastagePlan(supabase, plan) {
  const scrap = await savePrintingScrapEntries(supabase, plan?.scrap || plan);
  const deleteId = plan?.registry?.deleteId;
  const upsert = plan?.registry?.upsert;
  if (!deleteId && !upsert) return scrap;
  try {
    if (deleteId) {
      const { error } = await supabase.from('high_scrap_registry').delete().eq('id', deleteId);
      if (error) throw error;
    }
    if (upsert) {
      await upsertPayloadRecords(supabase, 'high_scrap_registry', [upsert]);
    }
  } catch (error) {
    if (isMissingRelation(error)) {
      console.warn('[high scrap] registry table is not available yet; scrap store rows were saved.');
      return scrap;
    }
    throw error;
  }
  return scrap;
}
