/**
 * Supabase Data Sync Service for Samyak Flexi-ERP
 * Handles live bidirectional CRUD operations with Supabase PostgreSQL
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { uploadArtworkFile, uploadDocumentFile, openArtworkViewer, fileToDataUrl } from './supabaseStorageService';
import { isMetalloceneEligibleFilm, getFilmTypeCode } from '../factoryStore';
import { assertPersistableMeasures } from '../utils/productionRecordQuality';
import { measureColumnsForSave, netUsableForSave } from '../utils/jobMasterGuardrails';
import { inventoryRollDateFields, toDatabaseDate, toDatabaseTimestamp } from '../utils/dbDates';
import { mergeConsumptionsIntoShipments, shipmentWithoutGainLoss } from '../utils/dispatchPacking';
import { assignedRolesOf, primaryRole } from '../assignedRoles';
import { mapInkMasterToRow, mapInkRowToMaster, readHsnCode } from '../utils/inkHsn';
export { uploadArtworkFile, uploadDocumentFile, openArtworkViewer, fileToDataUrl };

/**
 * Ensures a valid Supabase Auth session exists.
 * Throws an error if unauthenticated, preventing 401s on database writes.
 */
export async function ensureValidSession() {
  if (!isSupabaseConfigured()) {
    throw new Error('[Supabase Auth] Supabase URL or Key is not configured.');
  }
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[Supabase Auth] Session verification error:', error.message);
    }
  } catch (e) {
    console.warn('[Supabase Auth] Session check notice:', e.message);
  }
}

import { 
  FILM_DENSITIES,
  parseStandardDate,
  applyAuditLogBoundary
} from '../factoryStore';
import { buildEmployeeAttendanceRow, factoryCalendarDate, mapEmployeeAttendanceRow } from './employeeAttendance';
import { toSalaryAdvanceRow } from './salaryAdvance';
import { mapDirectoryUser } from '../utils/activeUserLabel';
import { buildOcnAmendment } from '../utils/ocnAmendment';
import { groupGrnLineItems, lineItemsForGrn, sanitizeGRN } from './grnLineItems';
import { linesForSave, normalizeInvoiceNo, stampLineIds } from './grnDocument';
import { pelletConsumptionFromRow, pelletInwardFromRow } from './pelletFuel';
import { inventoryDbColumns } from './bulkStockUpload.js';
import { revisionFieldsForStorage, revisionFromRow, revisionToRow } from '../utils/poAmendment';
import { deadlineFieldsFromRow } from '../utils/orderDeadlineReminder';
import { closeColumnsForOrderSave, closeDetail, explicitCloseMode, statusForOrderSave } from '../utils/orderCloseWrite';
export { sanitizeGRN };

/**
 * Strict Supabase Error Handler
 * Throws errors cleanly so UI can enter Database Disconnected / Read-Only mode.
 */
export function handleSupabaseError(error, contextName) {
  if (!error) return;
  console.error(`[Supabase Sync Error] ${contextName}:`, error);
  throw error;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

/**
 * PostgREST 404 / missing-relation errors. These must not be treated as fatal
 * during boot — the caller should degrade to an empty list.
 */
export function isMissingRelationError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || error.details || '').toLowerCase();
  return code === 'PGRST205' || code === '42P01' || code === 'PGRST204'
    || msg.includes('does not exist')
    || msg.includes('schema cache')
    || msg.includes('could not find the table')
    || msg.includes('not found');
}

/**
 * orders.id is the primary key. There is no orders.order_id column.
 * Return the id only when that order row exists, otherwise null so FK writes succeed.
 */
async function orderIdIfExists(orderId) {
  const id = orderId == null ? '' : String(orderId).trim();
  if (!id) return null;
  try {
    const { data, error } = await supabase.from('orders').select('id').eq('id', id).maybeSingle();
    if (error || !data?.id) return null;
    return data.id;
  } catch (err) {
    console.warn('[orders] Could not verify order id for foreign key:', err?.message || err);
    return null;
  }
}

// ============================================================================
// 1. ORDERS / JOB PUNCHING
// ============================================================================

export async function fetchOrders() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  console.log('[ORDERS][FETCH] Starting Supabase fetch');
  try {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || !Array.isArray(data)) return [];

    console.log(`[ORDERS][FETCH] Received ${data.length} records from Supabase`);

    return data.map(o => {
      let jobName = o.job_name || 'Untitled Job';
      let meta = {};
      if (jobName.includes(' ||| ')) {
        const parts = jobName.split(' ||| ');
        jobName = parts[0];
        try {
          meta = JSON.parse(parts[1]);
        } catch (e) {
          console.warn("Failed to parse metadata from job_name:", e.message);
        }
      }

      const jd = meta.jobDetails || o.job_details || {};
      const matReqs = meta.raw_material_requirements || o.raw_material_requirements || [];
      const layerList = Array.isArray(jd.layers) ? jd.layers : (Array.isArray(jd.calculationDetails?.layerResults) ? jd.calculationDetails.layerResults : (Array.isArray(o.layers) ? o.layers : []));
      const commentsVal = jd.orderComments || jd.comments || jd.notes || o.notes || o.comments || o.job_details?.orderComments || o.job_details?.comments || '';

      const parseGsm = (val, defaultVal = 1.5) => {
        if (val !== undefined && val !== null && val !== '') {
          const num = parseFloat(val);
          if (!isNaN(num)) return num;
        }
        return defaultVal;
      };

      const inkGsm = parseGsm(jd.inkGsm ?? jd.calculationDetails?.inkGsm ?? o.ink_gsm ?? o.inkGsm, 1.5);
      const adhesiveGsm = parseGsm(jd.adhesiveGsm ?? jd.calculationDetails?.adhesiveGsm ?? o.adhesive_gsm ?? o.adhesiveGsm, 1.5);

      const printingStatus = meta.printingStatus || jd.printingStatus || o.printing_status || (o.status === 'In Production' ? 'In Production' : 'Scheduled');
      const printingStartTime = meta.printingStartTime || jd.printingStartTime || o.printing_start_time || null;
      const printingEndTime = meta.printingEndTime || jd.printingEndTime || o.printing_end_time || null;
      const machineId = meta.machineId || jd.machineId || o.machine_id || null;
      const inputRollsList = meta.inputRollsList || jd.inputRollsList || [];
      const actualMetersPrinted = meta.actualMetersPrinted || jd.actualMetersPrinted || 0;
      const printedOutputKg = meta.printedOutputKg || jd.printedOutputKg || 0;
      const isPrintingCompleted = Boolean(meta.isPrintingCompleted || jd.isPrintingCompleted || false);

      return {
        id: o.id,
        jobName: jobName,
        clientName: o.client_name,
        orderType: o.order_type || 'Reel',
        orderQtyKg: Number(o.order_qty_kg) || 0,
        deliveryDate: o.target_delivery_date || o.delivery_date,
        targetDeliveryDate: o.target_delivery_date || o.delivery_date,
        ...deadlineFieldsFromRow(o),
        orderDate: jd.orderDate || (o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')),
        status: o.status || 'Scheduled',
        closedBy: o.closed_by || jd.closedBy || null,
        closedAt: o.closed_at || jd.closedAt || null,
        closeReason: o.close_reason || jd.closeReason || null,
        closeMode: o.close_mode || jd.closeMode || null,
        overDispatchWarning: o.over_dispatch_warning || jd.overDispatchWarning || null,
        reopenedBy: jd.reopenedBy || null,
        reopenedAt: jd.reopenedAt || null,
        reopenReason: jd.reopenReason || null,
        printingStatus,
        printingStartTime,
        printingEndTime,
        machineId,
        inputRollsList,
        actualMetersPrinted,
        printedOutputKg,
        isPrintingCompleted,
        wastagePct: Number(o.wastage_percentage) || Number(jd.wastagePct) || Number(jd.calculationDetails?.wastagePct) || 5,
        wastageKg: Number(jd.wastageKg) || Number(jd.calculationDetails?.wastageKg) || 0,
        structure: jd.structure || ((Array.isArray(layerList) && layerList.length > 0) ? layerList.filter(Boolean).map(l => `${l.filmType || ''} ${l.micron || ''}µ`).join(' / ') : '—'),
        printWidthMm: jd.printWidthMm || null,
        repeatLengthMm: jd.repeatLengthMm || null,
        colorsCount: jd.colorsCount || o.colors_count || 6,
        jobMasterId: o.job_master_id || jd.jobMasterId || '',
        skuCode: jd.skuCode || o.sku_code || '',
        jobCode: jd.jobCode || jd.skuCode || o.job_code || '',
        printedSfgUse: jd.printedSfgUse || null,
        poIssued: jd.poIssued || false,
        poNumber: jd.poNumber || '',
        inkGsm: inkGsm,
        adhesiveGsm: adhesiveGsm,
        hasVariants: Boolean(jd.hasVariants || o.hasVariants || (Array.isArray(jd.variants || o.variants) && (jd.variants || o.variants).length > 0)),
        variants: Array.isArray(jd.variants) ? jd.variants : (Array.isArray(o.variants) ? o.variants : []),
        orderComments: commentsVal,
        comments: commentsVal,
        notes: commentsVal,
        layers: layerList,
        calculationDetails: jd.calculationDetails || null,
        jobDetails: { 
          ...jd, 
          inkGsm: inkGsm,
          adhesiveGsm: adhesiveGsm,
          hasVariants: Boolean(jd.hasVariants || o.hasVariants || (Array.isArray(jd.variants || o.variants) && (jd.variants || o.variants).length > 0)),
          variants: Array.isArray(jd.variants) ? jd.variants : (Array.isArray(o.variants) ? o.variants : []),
          orderComments: commentsVal, 
          comments: commentsVal,
          printingStatus,
          printingStartTime,
          printingEndTime,
          machineId,
          inputRollsList,
          actualMetersPrinted,
          printedOutputKg,
          isPrintingCompleted
        },
        materialRequirements: matReqs,
        rawMaterialRequirements: matReqs
      };
    });
  } catch (err) {
    console.error("[ORDERS][FETCH] Error fetching orders from Supabase:", err);
    throw err;
  }
}


export async function saveOrderToSupabase(order) {
  if (!isSupabaseConfigured() || !order) {
    throw new Error("Cannot save order: Supabase database connection is not available.");
  }
  await ensureValidSession();
  console.log(`[ORDERS][DB WRITE] UPSERT orderId=${order.id}`);
  const parsedTarget = parseStandardDate(order.targetDeliveryDate || order.deliveryDate);
  const targetDateVal = parsedTarget ? parsedTarget.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const parseGsm = (val, defaultVal = 1.5) => {
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFloat(val);
      if (!isNaN(num)) return num;
    }
    return defaultVal;
  };

  const commentsVal = (order.orderComments || order.comments || order.notes || order.jobDetails?.orderComments || order.jobDetails?.comments || '').trim();
  const variants = Array.isArray(order.variants) ? order.variants : (Array.isArray(order.jobDetails?.variants) ? order.jobDetails?.variants : []);
  const hasVariants = Boolean(order.hasVariants || order.jobDetails?.hasVariants || (Array.isArray(variants) && variants.length > 0));
  const inkGsmVal = parseGsm(order.inkGsm ?? order.jobDetails?.inkGsm ?? order.calculationDetails?.inkGsm, 1.5);
  const adhesiveGsmVal = parseGsm(order.adhesiveGsm ?? order.jobDetails?.adhesiveGsm ?? order.calculationDetails?.adhesiveGsm, 1.5);

  const printingStatus = order.printingStatus || (order.status === 'In Production' ? 'In Production' : 'Scheduled');
  const printingStartTime = order.printingStartTime || order.jobDetails?.printingStartTime || null;
  const printingEndTime = order.printingEndTime || order.jobDetails?.printingEndTime || null;
  const machineId = order.machineId || order.jobDetails?.machineId || null;
  const inputRollsList = order.inputRollsList || order.jobDetails?.inputRollsList || [];
  const actualMetersPrinted = order.actualMetersPrinted || order.jobDetails?.actualMetersPrinted || 0;
  const printedOutputKg = order.printedOutputKg || order.jobDetails?.printedOutputKg || 0;
  const isPrintingCompleted = Boolean(order.isPrintingCompleted || order.jobDetails?.isPrintingCompleted || false);

  const jobDetails = {
    ...(order.jobDetails || {}),
    inkGsm: inkGsmVal,
    adhesiveGsm: adhesiveGsmVal,
    hasVariants,
    variants,
    structure: order.structure || order.jobDetails?.structure || '—',
    printWidthMm: order.printWidthMm || order.jobDetails?.printWidthMm || null,
    repeatLengthMm: order.repeatLengthMm || order.jobDetails?.repeatLengthMm || null,
    colorsCount: order.colorsCount || order.jobDetails?.colorsCount || 6,
    orderDate: order.orderDate || order.jobDetails?.orderDate || new Date().toISOString().split('T')[0],
    wastagePct: Number(order.wastagePct) || Number(order.calculationDetails?.wastagePct) || 5,
    wastageKg: Number(order.wastageKg) || Number(order.calculationDetails?.wastageKg) || 0,
    calculationDetails: order.calculationDetails || order.jobDetails?.calculationDetails || null,
    poIssued: order.poIssued || false,
    poNumber: order.poNumber || '',
    orderComments: commentsVal,
    comments: commentsVal,
    layers: order.layers || order.jobDetails?.layers || null,
    printingStatus,
    printingStartTime,
    printingEndTime,
    machineId,
    inputRollsList,
    actualMetersPrinted,
    printedOutputKg,
    isPrintingCompleted,
    closedBy: closeDetail(order, 'closedBy'),
    closedAt: closeDetail(order, 'closedAt'),
    closeReason: closeDetail(order, 'closeReason'),
    closeMode: explicitCloseMode(order),
    overDispatchWarning: closeDetail(order, 'overDispatchWarning'),
    reopenedBy: closeDetail(order, 'reopenedBy'),
    reopenedAt: closeDetail(order, 'reopenedAt'),
    reopenReason: closeDetail(order, 'reopenReason'),
    jobMasterId: order.jobMasterId || order.jobDetails?.jobMasterId || null,
    skuCode: order.skuCode || order.jobDetails?.skuCode || null,
    jobCode: order.jobCode || order.jobDetails?.jobCode || order.skuCode || null,
    printedSfgUse: order.printedSfgUse || order.jobDetails?.printedSfgUse || null
  };

  const matReqs = order.materialRequirements || order.rawMaterialRequirements || [];

  // Pack everything into metadata envelope inside job_name string
  const metaEnvelope = {
    jobDetails,
    raw_material_requirements: matReqs,
    printingStatus,
    printingStartTime,
    printingEndTime,
    machineId,
    inputRollsList,
    actualMetersPrinted,
    printedOutputKg,
    isPrintingCompleted
  };
  const combinedJobName = `${order.jobName || 'Untitled Job'} ||| ${JSON.stringify(metaEnvelope)}`;

  // Tier 1: Full payload with all enriched columns
  const fullPayload = {
    id: order.id,
    job_name: combinedJobName,
    client_name: order.clientName || 'General Client',
    order_type: order.orderType || 'Reel',
    order_qty_kg: Number(order.orderQtyKg) || 0,
    delivery_date: targetDateVal,
    target_delivery_date: targetDateVal,
    job_details: jobDetails,
    raw_material_requirements: matReqs
  };
  const statusForSave = statusForOrderSave(order);
  if (statusForSave) fullPayload.status = statusForSave;

  // orders has no order_id column (the primary key is id). Strip it if a caller spread it in.
  delete fullPayload.order_id;
  delete fullPayload.available_qty_kg;
  const closeColumns = closeColumnsForOrderSave(order) || {};
  const writeRow = {
    ...fullPayload,
    ...closeColumns,
    over_dispatch_warning: jobDetails.overDispatchWarning,
    job_master_id: jobDetails.jobMasterId || null
  };
  let { error: fullErr } = await supabase.from('orders').upsert(writeRow, { onConflict: 'id' });
  if (fullErr && /closed_by|close_mode|close_reason|closed_at|over_dispatch_warning|job_master_id|schema cache/i.test(fullErr.message || '')) {
    ({ error: fullErr } = await supabase.from('orders').upsert(fullPayload, { onConflict: 'id' }));
  }
  if (fullErr) {
    console.error(`[ORDERS][DB WRITE Error] orderId=${order.id}:`, fullErr);
    handleSupabaseError(fullErr, 'orders');
  }
  console.log(`[ORDERS][DB WRITE] Successfully saved orderId=${order.id}.`);
}


export async function deleteOrderFromSupabase(orderId) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  if (!orderId) {
    throw new Error("Cannot delete order: orderId is missing.");
  }
  await ensureValidSession();
  console.log(`[ORDERS][DELETE] Starting delete orderId=${orderId}`);

  try {
    // Clean up all dependent records across linked tables to prevent foreign key constraint violations
    await Promise.allSettled([
      supabase.from('production_records').delete().eq('order_id', orderId),
      supabase.from('job_datasheets').delete().eq('job_id', orderId),
      supabase.from('production_schedules').delete().eq('order_id', orderId),
      supabase.from('inventory_rolls').delete().eq('order_id', orderId),
      supabase.from('dispatch_shipments').delete().eq('order_id', orderId),
      supabase.from('certificate_of_analyses').delete().eq('order_id', orderId),
      supabase.from('delivery_challans').delete().eq('order_id', orderId)
    ]);
  } catch (e) {
    console.warn('[ORDERS][DELETE] Linked records cleanup notice:', e.message);
  }

  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  if (error) {
    console.error(`[ORDERS][DELETE] Supabase deletion failed for orderId=${orderId}:`, error);
    handleSupabaseError(error, 'orders');
  }

  console.log(`[ORDERS][DELETE] Supabase deletion successful orderId=${orderId}`);
  return { success: true };
}

export async function deleteAllOrdersFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('orders').delete().neq('id', '000');
  if (error) {
    handleSupabaseError(error, 'orders');
  }
  return { success: true };
}

// ============================================================================
// 2. VENDORS
// ============================================================================

export async function fetchVendors() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('vendors').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'vendors');
    }
    if (!data) return [];

    return data.map(v => ({
      id: v.id,
      name: v.name,
      companyName: v.name,
      category: v.category,
      contactPerson: v.contact_person,
      phone: v.phone,
      email: v.email,
      gstin: v.gstin,
      address: v.address,
      bankDetails: v.bank_details || v.bankDetails || '',
      bank_details: v.bank_details || v.bankDetails || '',
      paymentTerms: v.payment_terms || v.paymentTerms || '30 Days Net',
      payment_terms: v.payment_terms || v.paymentTerms || '30 Days Net',
      rating: Number(v.rating) || 5.0,
      materials: v.category ? v.category.split(', ') : []
    }));
  } catch (err) {
    console.error("Error fetching vendors from Supabase:", err);
    throw err;
  }
}

export async function saveVendorToSupabase(vendor) {
  if (!isSupabaseConfigured() || !vendor) {
    throw new Error("Supabase database connection is not available.");
  }
  await ensureValidSession();
  const vendorId = vendor.id || `VEND-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const vendorName = vendor.name || vendor.companyName || 'New Vendor';
  const vendorCategory = vendor.category || (Array.isArray(vendor.materials) ? vendor.materials.join(', ') : 'Flexible Packaging Supplier');
  const fullPayload = {
    id: vendorId,
    name: vendorName,
    category: vendorCategory,
    contact_person: vendor.contactPerson || vendor.contact_person || '',
    phone: vendor.phone || '',
    email: vendor.email || '',
    gstin: vendor.gstin || '',
    address: vendor.address || '',
    bank_details: vendor.bankDetails || vendor.bank_details || '',
    payment_terms: vendor.paymentTerms || vendor.payment_terms || '30 Days Net',
    rating: Number(vendor.rating) || 5.0
  };
  console.log('[vendors] Saving:', vendorId, vendorName);
  const { error: fullErr } = await supabase.from('vendors').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    console.error('[vendors] Save failed:', fullErr.message);
    handleSupabaseError(fullErr, 'vendors');
  }
}

export async function deleteVendorFromSupabase(vendorId) {
  if (!isSupabaseConfigured() || !vendorId) {
    throw new Error("Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (error) {
    console.error("Error deleting vendor from Supabase:", error);
    handleSupabaseError(error, 'vendors');
  }
}

// ============================================================================
// 2b. CLIENTS
// ============================================================================

export async function fetchClients() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'clients');
    }
    if (!data) return [];

    return data.map(c => ({
      id: c.id,
      name: c.name,
      gstin: c.gstin,
      address: c.address,
      paymentTerms: c.payment_terms,
      contactPerson: c.contact_person,
      phone: c.phone
    }));
  } catch (err) {
    console.error("Error fetching clients from Supabase:", err);
    throw err;
  }
}

export async function saveClientToSupabase(client) {
  if (!isSupabaseConfigured() || !client) {
    throw new Error("Supabase database connection is not available.");
  }
  await ensureValidSession();
  const clientId = client.id || `CLI-${Math.floor(1000 + Math.random() * 9000)}`;

  const { error } = await supabase.from('clients').upsert({
    id: clientId,
    name: client.name || 'New Client',
    gstin: client.gstin || '',
    address: client.address || '',
    payment_terms: client.paymentTerms || '',
    contact_person: client.contactPerson || '',
    phone: client.phone || ''
  }, { onConflict: 'id' });

  if (error) {
    handleSupabaseError(error, 'clients');
  }
}

export async function deleteClientFromSupabase(clientId) {
  if (!isSupabaseConfigured() || !clientId) {
    throw new Error("Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) {
    console.error("Error deleting client from Supabase:", error);
    handleSupabaseError(error, 'clients');
  }
}


// ============================================================================
// 3. INVENTORY & RAW MATERIALS / CONSUMABLES
// ============================================================================

export function formatFilmItemName(filmType, widthMm, micron, rawName = '', metallocenePct = '') {
  let fType = String(filmType || '').trim();
  let width = String(widthMm || '').replace(/[^0-9.]/g, '');
  let mic = String(micron || '').replace(/[^0-9.]/g, '');
  let mPct = String(metallocenePct || '').trim();

  // If mPct was not explicitly passed, attempt to extract from rawName if film is eligible
  if (!mPct && rawName && isMetalloceneEligibleFilm(filmType || rawName)) {
    const pctMatch = String(rawName).match(/(\d{1,2}%)/);
    if (pctMatch) {
      mPct = pctMatch[1];
    }
  }

  if ((!fType || !width || !mic) && rawName) {
    const cleanRaw = String(rawName).replace(/µ/g, 'Micron');
    if (!fType) {
      const matchType = cleanRaw.match(/^(PET|BOPP|METPET|CPP|LDPE|LLDPE|POLY|BON|PVC|ALU|MATTA|NMET|MMET|MGP|NGP)/i);
      fType = matchType ? matchType[1].toUpperCase() : cleanRaw.split(/[\s-]/)[0].toUpperCase();
    }
    if (!width) {
      const matchWidth = cleanRaw.match(/(\d+)\s*(mm|width)/i);
      if (matchWidth) width = matchWidth[1];
    }
    if (!mic) {
      const matchMicron = cleanRaw.match(/(\d+)\s*(micron|mic|µ)/i);
      if (matchMicron) mic = matchMicron[1];
    }
  }

  const code = getFilmTypeCode(fType);
  width = width || '1000';
  mic = mic || '12';

  if (isMetalloceneEligibleFilm(fType || code) && mPct) {
    const formattedPct = mPct.endsWith('%') ? mPct : `${mPct}%`;
    return `${code}-${width}-${mic}-${formattedPct}`;
  }

  return `${code}-${width}-${mic}`;
}

export function normalizeFilmType(filmType) {
  if (!filmType) return '';
  return String(filmType)
    .toUpperCase()
    .replace(/film/gi, '')
    .replace(/substrates?/gi, '')
    .replace(/[^A-Z0-9]/gi, '')
    .trim();
}

export function findMatchingInventoryItem(inventoryList = [], target = {}) {
  if (!Array.isArray(inventoryList) || inventoryList.length === 0 || !target) return null;

  const { stockItemId, itemId, filmType, micron, widthMm, itemName, category } = target;

  // 1. Direct ID / itemCode match
  if (stockItemId || itemId) {
    const targetId = String(stockItemId || itemId);
    const directMatch = inventoryList.find(i => String(i.id) === targetId || String(i.itemCode) === targetId);
    if (directMatch) return directMatch;
  }

  const isFilm = (category === 'Film Substrates') || (filmType && filmType !== '-');
  const targetMicron = parseFloat(micron);
  const targetWidth = parseFloat(widthMm);

  if (isFilm && !isNaN(targetMicron) && !isNaN(targetWidth) && targetMicron > 0 && targetWidth > 0) {
    const normTargetFilm = normalizeFilmType(filmType);
    const formattedTargetName = formatFilmItemName(filmType, widthMm, micron).toLowerCase();

    const specMatch = inventoryList.find(i => {
      const normItemFilm = normalizeFilmType(i.filmType || i.substrateOrGrade || i.substrateGrade);
      const itemMicron = parseFloat(i.micron);
      const itemWidth = parseFloat(i.widthMm);

      if (normItemFilm === normTargetFilm && itemMicron === targetMicron && itemWidth === targetWidth) {
        return true;
      }
      const formattedItemName = formatFilmItemName(i.filmType || i.substrateOrGrade, i.widthMm, i.micron, i.itemName).toLowerCase();
      if (formattedItemName === formattedTargetName) {
        return true;
      }
      if ((i.itemName || '').trim().toLowerCase() === formattedTargetName) {
        return true;
      }
      return false;
    });

    if (specMatch) return specMatch;
  }

  // 2. Non-Film or Item Name Exact Match
  if (itemName && String(itemName).trim()) {
    const cleanTargetName = String(itemName).trim().replace(/µ/g, 'Micron').toLowerCase();
    const cleanTargetCat = (category || '').trim().toLowerCase();

    const nameMatch = inventoryList.find(i => {
      const cleanItemName = (i.itemName || '').trim().replace(/µ/g, 'Micron').toLowerCase();
      const cleanItemCat = (i.category || '').trim().toLowerCase();

      if (cleanItemName === cleanTargetName) {
        if (!cleanTargetCat || !cleanItemCat || cleanTargetCat === cleanItemCat) {
          return true;
        }
      }
      return false;
    });

    if (nameMatch) return nameMatch;
  }

  return null;
}


export function sanitizeInventoryItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return rawItem;

  // Make a shallow copy and delete transient grouped properties if present
  const cleanRaw = { ...rawItem };
  delete cleanRaw.subItems;
  delete cleanRaw.allInventoryIds;
  delete cleanRaw.allLocations;
  delete cleanRaw.allVendors;
  delete cleanRaw.allBatches;
  delete cleanRaw.primaryId;

  let rawName = String(cleanRaw.itemName || cleanRaw.item_name || '').trim();
  let extractedMeta = {};

  // Thoroughly unpack any ||| envelopes (single or nested)
  while (rawName.includes('|||')) {
    const idx = rawName.indexOf('|||');
    const jsonStr = rawName.substring(idx + 3).trim();
    rawName = rawName.substring(0, idx).trim();
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object') {
          extractedMeta = { ...extractedMeta, ...parsed };
        }
      } catch (e) {
        // Continue unpacking
      }
    }
  }

  // Handle case where rawName itself is a serialized JSON string
  if (rawName.startsWith('{') && rawName.endsWith('}')) {
    try {
      const parsed = JSON.parse(rawName);
      if (parsed && typeof parsed === 'object') {
        extractedMeta = { ...extractedMeta, ...parsed };
        rawName = parsed.itemName || parsed.name || '';
      }
    } catch (e) {}
  }

  delete extractedMeta.subItems;
  delete extractedMeta.allInventoryIds;
  delete extractedMeta.allLocations;
  delete extractedMeta.allVendors;
  delete extractedMeta.allBatches;
  delete extractedMeta.primaryId;

  // 1. Resolve true category with priority to extracted metadata
  let category = extractedMeta.category || cleanRaw.category;
  const lowerName = rawName.toLowerCase();

  // If category is unspecified or defaulted to 'Film Substrates', check keywords
  if (!category || category === 'Film Substrates' || category === 'Film') {
    if (lowerName.includes('acetate') || lowerName.includes('solvent') || lowerName.includes('thinner') || lowerName.includes('alcohol') || lowerName.includes('chemical') || lowerName.includes('toluene') || lowerName.includes('ipa')) {
      category = 'Chemicals & Solvents';
    } else if (lowerName.includes('ink') || lowerName.includes('cyan') || lowerName.includes('magenta') || lowerName.includes('yellow') || lowerName.includes('varnish') || lowerName.includes('toner')) {
      category = 'Printing Inks';
    } else if (lowerName.includes('adhesive') || lowerName.includes('hardener') || lowerName.includes('glue') || lowerName.includes('polyurethane')) {
      category = 'Adhesives & Hardener';
    } else if (lowerName.includes('blade') || lowerName.includes('wiper')) {
      category = 'Doctor Blades & Wipers';
    } else if (lowerName.includes('tape') || lowerName.includes('core') || lowerName.includes('packaging')) {
      category = 'Tapes & Consumables';
    } else if (lowerName.includes('sleeve') || lowerName.includes('roller')) {
      category = 'Rollers & Sleeves';
    } else if (lowerName.includes('oil') || lowerName.includes('lubricant') || lowerName.includes('grease')) {
      category = 'Lubricants & Oils';
    } else if (lowerName.includes('spare') || lowerName.includes('bearing') || lowerName.includes('gear') || lowerName.includes('sensor')) {
      category = 'Machine Spare Parts';
    } else if (lowerName.includes('glove') || lowerName.includes('mask') || lowerName.includes('ppe') || lowerName.includes('helmet')) {
      category = 'Safety Gear (PPE)';
    } else {
      category = category || 'Film Substrates';
    }
  }

  const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';

  const filmType = isFilm ? (extractedMeta.filmType || cleanRaw.filmType || (rawName ? rawName.split(/[\s-]/)[0] : 'PET')) : '';
  const micron = isFilm 
    ? ((extractedMeta.micron !== undefined && extractedMeta.micron !== null && extractedMeta.micron !== '-') ? extractedMeta.micron : (cleanRaw.micron && cleanRaw.micron !== '-' ? cleanRaw.micron : 12)) 
    : '-';
  const widthMm = isFilm 
    ? ((extractedMeta.widthMm !== undefined && extractedMeta.widthMm !== null && extractedMeta.widthMm !== '-') ? extractedMeta.widthMm : (cleanRaw.widthMm && cleanRaw.widthMm !== '-' ? cleanRaw.widthMm : 1000)) 
    : '-';
  const metallocenePct = isFilm 
    ? (extractedMeta.metallocenePct || cleanRaw.metallocene_pct || cleanRaw.metallocenePct || (rawName && isMetalloceneEligibleFilm(filmType) ? (rawName.match(/(\d{1,2}%)/)?.[1] || '') : ''))
    : '';

  const fallbackUnit = isFilm ? 'Kg' : (
    category === 'Chemicals & Solvents' || category === 'Solvents' ? 'Litres' : 
    category === 'Doctor Blades & Wipers' ? 'Meters' : 
    category === 'Tapes & Consumables' ? 'Rolls' : 
    category === 'Safety Gear (PPE)' ? 'Boxes' : 
    category === 'Machine Spare Parts' ? 'Nos' : 'Kg'
  );

  const resolvedUnit = cleanRaw.unit || cleanRaw.unit_of_measure || extractedMeta.unit || fallbackUnit;

  const keepGivenName = (extractedMeta.preserveItemName === true || cleanRaw.preserveItemName === true) && Boolean(rawName);
  const cleanItemName = keepGivenName
    ? rawName.replace(/µ/g, 'Micron')
    : (isFilm
      ? formatFilmItemName(filmType, widthMm, micron, rawName, metallocenePct)
      : (rawName ? rawName.replace(/µ/g, 'Micron') : `${category} Stock Item`));

  return {
    ...extractedMeta,
    ...cleanRaw,
    id: String(cleanRaw.id || cleanRaw.item_code || 'INVT-0001'),
    itemCode: cleanRaw.itemCode || cleanRaw.item_code || String(cleanRaw.id),
    itemName: cleanItemName,
    category: category,
    filmType: isFilm ? filmType : '',
    micron: micron,
    widthMm: widthMm,
    metallocenePct: metallocenePct,
    metallocene_pct: metallocenePct,
    unit: resolvedUnit,
    availableQtyKg: Number(cleanRaw.availableQtyKg ?? cleanRaw.stock_qty_kg ?? extractedMeta.availableQtyKg ?? 0) || 0,
    allocatedQtyKg: Number(cleanRaw.allocatedQtyKg ?? extractedMeta.allocatedQtyKg ?? 0) || 0,
    reorderLevelKg: Number(cleanRaw.reorderLevelKg ?? extractedMeta.reorderLevelKg ?? 100) || 100,
    unitPrice: Number(cleanRaw.unitPrice ?? cleanRaw.unit_price ?? extractedMeta.unitPrice ?? 0) || 0,
    location: cleanRaw.location || extractedMeta.location || 'Store Bay',
    lastVendor: cleanRaw.lastVendor || extractedMeta.lastVendor || '',
    lastBatch: cleanRaw.lastBatch || extractedMeta.lastBatch || '',
    density: cleanRaw.density !== undefined ? cleanRaw.density : (extractedMeta.density !== undefined ? extractedMeta.density : (isFilm ? 1.4 : 1.0)),
    substrateOrGrade: cleanRaw.substrateOrGrade || cleanRaw.substrate_grade || extractedMeta.substrateOrGrade || (isFilm ? filmType : (cleanRaw.grade || cleanRaw.subType || '')),
    grade: cleanRaw.grade || extractedMeta.grade || (isFilm ? filmType : ''),
    subType: cleanRaw.subType || extractedMeta.subType || '',
    shade: cleanRaw.shade || extractedMeta.shade || '',
    dimensions: cleanRaw.dimensions || extractedMeta.dimensions || '',
    lastUpdated: cleanRaw.lastUpdated || extractedMeta.lastUpdated || new Date().toISOString(),
    preserveItemName: keepGivenName || undefined,
    isActive: cleanRaw.isActive === false || cleanRaw.is_active === false || extractedMeta.isActive === false ? false : true,
    is_active: cleanRaw.isActive === false || cleanRaw.is_active === false || extractedMeta.isActive === false ? false : true,
    archivedAt: cleanRaw.archivedAt || cleanRaw.archived_at || extractedMeta.archivedAt || null,
    archivedBy: cleanRaw.archivedBy || cleanRaw.archived_by || extractedMeta.archivedBy || null,
    archiveReason: cleanRaw.archiveReason || cleanRaw.archive_reason || extractedMeta.archiveReason || null
  };
}

export function mapInventoryItemToDbPayload(item) {
  if (!item) return null;
  const clean = sanitizeInventoryItem(item);
  const category = clean.category || 'Film Substrates';
  const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';
  const filmTypeStr = isFilm ? (clean.filmType || (clean.itemName ? clean.itemName.split(' ')[0] : 'PET')) : '';
  const itemCodeStr = clean.itemCode || clean.id || 'INVT-0001';
  const itemNameStr = clean.itemName;

  // Pack clean metadata properties into serializable object
  const meta = {
    category: category,
    filmType: filmTypeStr,
    substrateOrGrade: clean.substrateOrGrade || clean.grade || filmTypeStr || '',
    grade: clean.grade || clean.substrateOrGrade || '',
    subType: clean.subType || '',
    shade: clean.shade || '',
    dimensions: clean.dimensions || '',
    micron: isFilm ? clean.micron : '-',
    widthMm: isFilm ? clean.widthMm : '-',
    metallocenePct: clean.metallocenePct || '',
    metallocene_pct: clean.metallocenePct || '',
    availableQtyKg: clean.availableQtyKg,
    allocatedQtyKg: clean.allocatedQtyKg,
    reorderLevelKg: clean.reorderLevelKg,
    unitPrice: clean.unitPrice,
    unit: clean.unit,
    density: clean.density,
    location: clean.location,
    lastVendor: clean.lastVendor,
    lastBatch: clean.lastBatch,
    lastUpdated: new Date().toISOString(),
    preserveItemName: clean.preserveItemName === true ? true : undefined,
    isActive: clean.isActive !== false
  };

  const combinedItemName = `${itemNameStr} ||| ${JSON.stringify(meta)}`;

  // Live inventory has stock_qty_kg, not available_qty_kg. Available quantity is stored there.
  return {
    id: String(clean.id),
    item_code: itemCodeStr,
    item_name: combinedItemName,
    metallocene_pct: clean.metallocenePct || null,
    stock_qty_kg: Number(clean.availableQtyKg ?? clean.stock_qty_kg ?? 0) || 0,
    unit_price: Number(clean.unitPrice ?? 0) || 0,
    is_active: clean.isActive !== false,
    archived_at: clean.archivedAt || null,
    archived_by: clean.archivedBy || null,
    archive_reason: clean.archiveReason || null,
    ...inventoryDbColumns(clean),
    last_updated: new Date().toISOString()
  };
}

export async function fetchInventory() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('inventory').select('*').order('item_name');
    if (error) {
      handleSupabaseError(error, 'inventory');
    }
    if (!data) return [];

    return data.map(i => sanitizeInventoryItem(i));
  } catch (err) {
    console.error("Error fetching inventory from Supabase:", err);
    throw err;
  }
}

export async function saveInventoryItemToSupabase(item) {
  if (!isSupabaseConfigured() || !item) {
    throw new Error("Cannot save inventory item: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const payload = mapInventoryItemToDbPayload(item);
  if (!payload) return;

  console.log('[inventory] Saving item via schema-independent metadata envelope:', payload.id);
  const { error } = await supabase.from('inventory').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('[inventory] Failed to save item:', error.message);
    handleSupabaseError(error, 'inventory');
  }
}

export async function saveInventoryBatchToSupabase(inventoryList) {
  if (!isSupabaseConfigured() || !Array.isArray(inventoryList) || inventoryList.length === 0) {
    throw new Error("Cannot save inventory batch: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const payloads = inventoryList.map(item => mapInventoryItemToDbPayload(item)).filter(Boolean);

  console.log(`[inventory] Bulk syncing ${payloads.length} items to Supabase via metadata envelopes...`);
  const { error } = await supabase.from('inventory').upsert(payloads, { onConflict: 'id' });
  if (error) {
    console.warn("[inventory] Bulk upsert error, falling back to sequential upserts:", error.message);
    for (const item of inventoryList) {
      await saveInventoryItemToSupabase(item);
    }
  }
}


function normalizeDeletedBarcode(row) {
  if (!row || typeof row !== 'object') return null;
  const barcode = String(row.barcode || '').trim();
  if (!barcode) return null;
  return {
    barcode,
    sourceModule: row.sourceModule || row.source_module || '',
    description: row.description || '',
    referenceNo: row.referenceNo || row.reference_no || '',
    createdAt: row.createdAt || row.created_at || '',
    status: String(row.status || 'Deleted').trim().toLowerCase() === 'written off' ? 'Written Off' : (row.status || 'Deleted'),
    location: row.location || '',
    sourceTable: row.sourceTable || row.source_table || 'deleted_barcodes',
    sourceColumn: row.sourceColumn || row.source_column || 'barcode',
    deletedReason: row.deletedReason || row.deleted_reason || '',
    deletedAt: row.deletedAt || row.deleted_at || '',
    deletedBy: row.deletedBy || row.deleted_by || ''
  };
}

export async function previewInventoryItemDelete(itemIds) {
  if (!isSupabaseConfigured()) {
    throw new Error('Cannot delete inventory item: Supabase database connection is not available.');
  }
  await ensureValidSession();
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Choose at least one stock item.');
  const { data, error } = await supabase.rpc('preview_delete_inventory_items', { p_item_ids: ids });
  if (error) handleSupabaseError(error, 'inventory');
  return data;
}

export async function deleteInventoryItemsFromSupabase(itemIds, reason) {
  if (!isSupabaseConfigured()) {
    throw new Error('Cannot delete inventory item: Supabase database connection is not available.');
  }
  const text = String(reason || '').trim();
  if (!text) throw new Error('A reason is required to delete a stock item.');
  await ensureValidSession();
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Choose at least one stock item.');
  const { data, error } = await supabase.rpc('delete_inventory_items', {
    p_item_ids: ids,
    p_reason: text
  });
  if (error) handleSupabaseError(error, 'inventory');
  return data;
}

export async function deleteInventoryItemFromSupabase(itemId, reason) {
  return deleteInventoryItemsFromSupabase(Array.isArray(itemId) ? itemId : [itemId], reason);
}

async function inventoryRpc(name, args) {
  if (!isSupabaseConfigured()) {
    throw new Error('Cannot update inventory item: Supabase database connection is not available.');
  }
  const reason = String(args.p_reason || '').trim();
  if (!reason) throw new Error('A reason is required.');
  await ensureValidSession();
  const { data, error } = await supabase.rpc(name, args);
  if (error) handleSupabaseError(error, 'inventory');
  return data;
}

export async function archiveInventoryItemsFromSupabase(itemIds, reason) {
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map((id) => String(id || '').trim()).filter(Boolean))];
  return inventoryRpc('archive_inventory_items', { p_item_ids: ids, p_reason: String(reason || '').trim() });
}

export async function reactivateInventoryItemsFromSupabase(itemIds, reason) {
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map((id) => String(id || '').trim()).filter(Boolean))];
  return inventoryRpc('reactivate_inventory_items', { p_item_ids: ids, p_reason: String(reason || '').trim() });
}

export async function writeOffInventoryItemsFromSupabase(itemIds, reason, barcodes = null, archive = false) {
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map((id) => String(id || '').trim()).filter(Boolean))];
  return inventoryRpc('write_off_inventory_items', {
    p_item_ids: ids,
    p_reason: String(reason || '').trim(),
    p_barcodes: barcodes,
    p_archive: Boolean(archive)
  });
}

export async function loadDeletedBarcodes() {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.rpc('list_deleted_barcodes');
  if (!error && Array.isArray(data)) {
    return data.map(normalizeDeletedBarcode).filter(Boolean);
  }
  const table = await supabase.from('deleted_barcodes').select('*');
  if (table.error || !Array.isArray(table.data)) return [];
  return table.data.map(normalizeDeletedBarcode).filter(Boolean);
}

export async function findDeletedBarcodeHits(codes) {
  if (!isSupabaseConfigured()) return [];
  const list = [...new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean))];
  if (!list.length) return [];
  const { data, error } = await supabase.rpc('deleted_barcode_hits', { p_codes: list });
  if (error || !Array.isArray(data)) return [];
  return data.map(normalizeDeletedBarcode).filter(Boolean);
}

// ============================================================================
// 4. GOODS RECEIPT NOTES (GRN)
// ============================================================================

export async function fetchGRNs() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('grns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

    let lineRows = [];
    const { data: lines, error: lineError } = await supabase
      .from('grn_line_items')
      .select('*')
      .order('line_no', { ascending: true });
    if (lineError) {
      console.warn('[GRNs] Line items are not available yet; each receipt is read as one line from its header:', lineError.message);
    } else if (Array.isArray(lines)) {
      lineRows = lines;
    }

    const grouped = groupGrnLineItems(lineRows);
    return data.map(g => sanitizeGRN({
      ...g,
      lineItems: lineItemsForGrn(grouped, g)
    }));
  } catch (err) {
    console.error("Error fetching GRNs from Supabase:", err);
    throw err;
  }
}

export async function saveGRNToSupabase(grn) {
  if (!isSupabaseConfigured() || !grn) {
    throw new Error("Cannot save GRN: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const clean = sanitizeGRN(grn);
  const grnId = clean.id || clean.grnNo || '';
  const itemNameVal = clean.itemName;
  const weightVal = Number(clean.receivedQtyKg || clean.netWeightKg) || 0;

  // Pack extra GRN properties into metadata
  const meta = {
    category: clean.category,
    stockItemId: clean.stockItemId,
    filmType: clean.filmType,
    micron: clean.micron,
    widthMm: clean.widthMm,
    metallocenePct: clean.metallocenePct || '',
    metallocene_pct: clean.metallocenePct || '',
    rollsReceived: clean.rollsReceived,
    purchaseRatePerKg: Number(clean.purchaseRatePerKg ?? clean.unitPrice ?? 0) || 0,
    unitPrice: Number(clean.purchaseRatePerKg ?? clean.unitPrice ?? 0) || 0,
    unit: clean.unit || 'Kg',
    batchNo: clean.batchNo,
    inspectedBy: clean.inspectedBy,
    storeManager: clean.storeManager,
    packagingType: clean.packagingType || 'Roll',
    itemsBreakdown: clean.itemsBreakdown || [],
    barcodes: clean.barcodes || [],
    barcodeId: clean.barcodeId || '',
    grossWeightKg: clean.grossWeightKg || 0,
    tareWeightKg: clean.tareWeightKg || 0,
    freightAmount: clean.freightAmount || 0,
    transporterName: clean.transporterName || '',
    itemRemarks: clean.itemRemarks || clean.remarks || clean.notes || '',
    remarks: clean.itemRemarks || clean.remarks || clean.notes || '',
    notes: clean.itemRemarks || clean.remarks || clean.notes || '',
    status: clean.status,
    qcStatus: clean.qcStatus || clean.status,
    location: clean.location,
    storeLocation: clean.storeLocation,
    poNumber: clean.poNumber,
    vendorName: clean.vendorName,
    vendorAddress: clean.vendorAddress || '',
    vendorGstin: clean.vendorGstin || '',
    vendorEmail: clean.vendorEmail || '',
    vendorPhone: clean.vendorPhone || '',
    vendorContact: clean.vendorContact || '',
    invoiceNo: clean.invoiceNo,
    receivedDate: clean.receivedDate,
    qcNotes: clean.qcNotes,
    hasVariation: Boolean(clean.hasVariation || clean.variations?.hasVariation),
    variations: clean.variations || null,
    variationSummary: clean.variationSummary || '',
    originalPoItemName: clean.originalPoItemName || '',
    orderedPoQtyKg: clean.orderedPoQtyKg || null,
    agreedPoRate: clean.agreedPoRate || null,
    vehicleNo: clean.vehicleNo || '',
    cancelledBy: clean.cancelledBy || '',
    cancelledAt: clean.cancelledAt || '',
    cancelReason: clean.cancelReason || '',
    editedBy: clean.editedBy || '',
    editedAt: clean.editedAt || ''
  };

  const combinedItemName = `${itemNameVal} ||| ${JSON.stringify(meta)}`;

  const parsedDate = parseStandardDate(clean.receivedDate);
  const dateVal = parsedDate ? parsedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  // Resolve valid vendor_id referencing public.vendors(id) to satisfy foreign key constraint grns_vendor_id_fkey
  let validVendorId = null;
  const targetVId = clean.vendorId || grn.vendorId;
  const targetVName = String(clean.vendorName || grn.vendorName || '').trim();

  try {
    const { data: allVendors } = await supabase.from('vendors').select('id, name');
    if (allVendors && allVendors.length > 0) {
      let match = null;
      if (targetVId) {
        match = allVendors.find(v => String(v.id) === String(targetVId));
      }
      if (!match && targetVName) {
        const cleanSearch = targetVName.toLowerCase();
        match = allVendors.find(v => {
          const vid = String(v.id || '').toLowerCase();
          const vname = String(v.name || '').toLowerCase();
          return vid === cleanSearch || vname === cleanSearch || cleanSearch.includes(vname) || vname.includes(cleanSearch);
        });
      }
      if (match) {
        validVendorId = match.id;
      }
    }
  } catch (err) {
    console.warn('[GRNs] Vendor lookup failed:', err);
  }

  // Same supplier and the same invoice is a second document. A different supplier may reuse the number.
  // The row being saved is not a duplicate of itself. save_grn_with_lines applies the same rule.
  const wantedInvoice = normalizeInvoiceNo(clean.invoiceNo);
  if (wantedInvoice && targetVName) {
    const { data: existingGrns, error: duplicateLookupError } = await supabase
      .from('grns')
      .select('id, grn_number, invoice_number, vendor_id, item_name, status');
    if (duplicateLookupError) {
      throw new Error(`Could not check for a duplicate GRN invoice: ${duplicateLookupError.message}`);
    }
    const wantedVendor = targetVName.toLowerCase();
    const match = (existingGrns || []).find((row) => {
      if (String(row.status || '').toLowerCase().includes('cancel')) return false;
      if (normalizeInvoiceNo(row.invoice_number) !== wantedInvoice) return false;
      const sameDocument = String(row.id) === String(grnId) || String(row.grn_number) === String(clean.grnNo || grnId);
      if (sameDocument) return false;
      if (validVendorId && String(row.vendor_id) === String(validVendorId)) return true;
      const rawName = String(row.item_name || '');
      const packed = rawName.includes('|||') ? rawName.split('|||').slice(1).join('|||') : '';
      let metaName = '';
      if (packed) {
        try { metaName = JSON.parse(packed).vendorName || ''; } catch { metaName = ''; }
      }
      return String(metaName).trim().toLowerCase() === wantedVendor;
    });
    if (match) {
      throw new Error(`Duplicate Inward GRN: A GRN (#${match.grn_number || match.id}) with Invoice #${clean.invoiceNo} already exists for this supplier.`);
    }
  }

  const lines = stampLineIds(grnId, linesForSave({ ...clean, id: grnId, grnNo: clean.grnNo || grnId }));
  const rollLinks = lines.flatMap((line) => (line.rolls || [])
    .filter((roll) => roll && roll.barcodeId)
    .map((roll) => ({
      barcodeId: roll.barcodeId,
      grnLineItemId: line.id,
      lineNo: line.lineNo,
      vendorRollNo: roll.vendorRollNo || '',
      unitNo: roll.unitNo || null
    })));

  const payload = {
    id: grnId,
    grnNo: clean.grnNo || grnId,
    grnPrefix: grn.grnPrefix || '',
    vendorId: validVendorId || '',
    vendorName: targetVName,
    poNumber: clean.poNumber || '',
    invoiceNo: clean.invoiceNo || '',
    receivedDate: dateVal,
    itemName: combinedItemName,
    receivedQtyKg: weightVal,
    status: clean.status || 'Pending QC Approval',
    qcRemarks: clean.qcNotes || '',
    metallocenePct: clean.metallocenePct || '',
    stockItemId: clean.stockItemId || '',
    masterItemId: clean.masterItemId || '',
    lineItems: lines,
    rolls: rollLinks
  };

  console.log('[GRNs] Saving GRN and its lines:', payload.grnNo || payload.id, lines.length);
  const { data, error } = await supabase.rpc('save_grn_with_lines', { p_grn: payload });
  if (error) {
    console.error('[GRNs] Failed to save GRN to Supabase:', error.message);
    throw new Error(error.message || `Database save error for GRN ${payload.grnNo || grnId}`);
  }
  const saved = data && typeof data === 'object' ? data : {};
  const savedId = saved.id || grnId;
  const savedNo = saved.grnNo || saved.grn_number || clean.grnNo || savedId;
  return {
    ...clean,
    id: savedId,
    grnNo: savedNo,
    lineItems: stampLineIds(savedId, lines)
  };
}

export async function allocateGrnNumber(prefix) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  await ensureValidSession();
  const { data, error } = await supabase.rpc('allocate_pellet_grn_number', {
    p_prefix: prefix || 'SIL/GRN/26-27/'
  });
  if (error) handleSupabaseError(error, 'allocate_pellet_grn_number');
  if (!data) throw new Error('The server did not return a GRN number.');
  return data;
}

/**
 * True when any GRN was already claimed for the QC digest on or after isoStart.
 * Returns null when escalated_at is not in the schema yet, so the caller must not email.
 */
export async function hasQcEscalationSince(isoStart) {
  const { data, error } = await supabase
    .from('grns')
    .select('id')
    .gte('escalated_at', isoStart)
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Stamp escalated_at only on rows that are still unclaimed.
 * The stamp is the once-per-GRN guard and must happen before the email is sent.
 * Returns null when the column is missing.
 */
export async function claimGrnEscalations(ids, claimedAt) {
  const uniqueIds = [...new Set((ids || []).map(id => String(id)).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const { data, error } = await supabase
    .from('grns')
    .update({ escalated_at: claimedAt })
    .in('id', uniqueIds)
    .is('escalated_at', null)
    .select('id, escalated_at');
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  return data || [];
}


// ============================================================================
// 5. CYLINDERS
// ============================================================================

export async function fetchCylinders() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('cylinders').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'cylinders');
    }
    if (!data) return [];

    return data.map(c => {
      const pm = c.press_marks || {};
      let layers = safeParseLayers(c.layers);
      if (layers.length === 0) layers = safeParseLayers(pm.layers);
      if (layers.length === 0 && c.structure && c.structure !== '—') {
        layers = parseStructureStringToLayers(c.structure);
      }

      return {
        id: c.id,
        sku: c.sku,
        jobName: c.job_name,
        colorsCount: Number(c.colors_count) || 0,
        cylinderCost: c.cylinder_cost || pm.cylinderCost || '',
        costPerCylinder: c.cost_per_cylinder || pm.costPerCylinder || '',
        rate: Number(c.rate_per_sq_cm ?? c.rate_per_sq_inch ?? pm.ratePerSqInch) || 1.6,
        ratePerSqInch: Number(c.rate_per_sq_cm ?? c.rate_per_sq_inch ?? pm.ratePerSqInch) || 1.6,
        engravuresName: c.engravures_name || pm.engravuresName || '',
        costBorneBy: c.cost_borne_by || pm.costBorneBy || 'Client (100%)',
        costBorneType: c.cost_borne_type || pm.costBorneType || 'client',
        clientGroup: c.client_group || pm.clientGroup || '',
        circumferenceMm: Number(c.circumference_mm || pm.circumferenceMm) || 0,
        faceLengthMm: Number(c.face_length_mm || pm.faceLengthMm) || 1050,
        printWidthMm: Number(c.print_width_mm || c.pouch_open_width || pm.printWidthMm) || 1000,
        layer1PrintedQtyKg: Number(c.layer1_printed_qty_kg) || 0,
        dispatchedQty: Number(c.dispatched_qty) || 0,
        utilisationLimit: Number(c.utilisation_limit || pm.utilisationLimit) || 10000,
        status: c.status || 'Active In-Use',
        artworkUrl: c.artwork_url || c.job_card_file_url || pm.artworkUrl || null,
        jobCardFileUrl: c.job_card_file_url || c.artwork_url || pm.jobCardFileUrl || '',
        jobCardFileName: c.job_card_file_name || pm.jobCardFileName || '',
        layers: layers,
        structure: c.structure || (layers.length > 0 ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : '—'),
        pouchOpenWidth: Number(c.pouch_open_width || pm.pouchOpenWidth) || 0,
        pouchHeight: Number(c.pouch_height || pm.pouchHeight) || 0,
        jobMasterId: c.job_master_id || pm.jobMasterId || '',
        assignedPress: c.assigned_press || pm.assignedPress || '',
        silLogo: c.sil_logo !== undefined && c.sil_logo !== null ? c.sil_logo : (pm.silLogo !== undefined && pm.silLogo !== null ? pm.silLogo : ''),
        arcMark: c.arc_mark || pm.arcMark || 'Yes',
        slittingMark: c.slitting_mark || pm.slittingMark || 'Yes',
        trackerLine: c.tracker_line || pm.trackerLine || 'Yes',
        specialInstructions: c.special_instructions || pm.specialInstructions || '',
        chkEyemark: c.chk_eyemark ?? pm.chkEyemark ?? false,
        chkBarcode: c.chk_barcode ?? pm.chkBarcode ?? false,
        chkOrientation: c.chk_orientation ?? pm.chkOrientation ?? false,
        chkClientApproval: c.chk_client_approval ?? pm.chkClientApproval ?? false,
        approvedByHead: c.approved_by_head ?? pm.approvedByHead ?? false,
        approvedHeadName: c.approved_head_name || pm.approvedHeadName || '',
        approvedHeadDate: c.approved_head_date || pm.approvedHeadDate || '',
        variant: c.variant || pm.variant || 'Standard',
        printing: c.printing || pm.printing || 'Reverse',
        invoiceTo: c.invoice_to || pm.invoiceTo || 'Samyak International Ltd',
        shellSize: c.shell_size || pm.shellSize || '',
        petSize: c.pet_size || pm.petSize || '',
        creationDate: c.creation_date || (c.created_at ? String(c.created_at).split('T')[0] : new Date().toISOString().split('T')[0]),
        isLocked: Boolean(c.is_locked ?? pm.isLocked),
        lockedBy: c.locked_by || pm.lockedBy || '',
        lockedAt: c.locked_at || pm.lockedAt || '',
        changelogs: Array.isArray(c.changelogs) ? c.changelogs : (Array.isArray(pm.changelogs) ? pm.changelogs : []),
        press_marks: pm
      };
    });
  } catch (err) {
    console.error("Error fetching cylinders from Supabase:", err);
    throw err;
  }
}

export async function saveCylinderToSupabase(cyl) {
  if (!isSupabaseConfigured() || !cyl) {
    throw new Error("Cannot save cylinder: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const rateVal = cyl.rate !== undefined ? cyl.rate : cyl.ratePerSqInch;
  const id = cyl.id || `CYL-${Math.floor(100 + Math.random() * 900)}`;
  const layers = Array.isArray(cyl.layers) ? cyl.layers : [];
  const structureSummary = (layers.length > 0)
    ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
    : (cyl.structure || '—');

  const fileUrl = cyl.artworkUrl || cyl.jobCardFileUrl || cyl.artwork_url || '';
  const fileName = cyl.jobCardFileName || (fileUrl ? 'Artwork_KLD_Proof.pdf' : '');

  const changelogsList = Array.isArray(cyl.changelogs) ? cyl.changelogs : [];

  const pressMarks = {
    silLogo: cyl.silLogo !== undefined && cyl.silLogo !== null ? cyl.silLogo : '',
    arcMark: cyl.arcMark || 'Yes',
    slittingMark: cyl.slittingMark || 'Yes',
    trackerLine: cyl.trackerLine || 'Yes',
    specialInstructions: cyl.specialInstructions || '',
    printWidthMm: Number(cyl.printWidthMm) || 1000,
    faceLengthMm: Number(cyl.faceLengthMm) || 1050,
    layers: layers,
    structure: structureSummary,
    pouchOpenWidth: Number(cyl.pouchOpenWidth) || 0,
    pouchHeight: Number(cyl.pouchHeight) || 0,
    jobMasterId: cyl.jobMasterId || '',
    assignedPress: cyl.assignedPress || '',
    chkEyemark: cyl.chkEyemark ?? false,
    chkBarcode: cyl.chkBarcode ?? false,
    chkOrientation: cyl.chkOrientation ?? false,
    chkClientApproval: cyl.chkClientApproval ?? false,
    approvedByHead: cyl.approvedByHead ?? false,
    approvedHeadName: cyl.approvedHeadName || '',
    approvedHeadDate: cyl.approvedHeadDate || '',
    variant: cyl.variant || 'Standard',
    printing: cyl.printing || 'Reverse',
    invoiceTo: cyl.invoiceTo || 'Samyak International Ltd',
    shellSize: cyl.shellSize || '',
    petSize: cyl.petSize || '',
    cylinderCost: cyl.cylinderCost || '',
    costPerCylinder: cyl.costPerCylinder || '',
    engravuresName: cyl.engravuresName || '',
    costBorneBy: cyl.costBorneBy || 'Client (100%)',
    costBorneType: cyl.costBorneType || 'client',
    clientGroup: cyl.clientGroup || '',
    circumferenceMm: Number(cyl.circumferenceMm) || 0,
    utilisationLimit: Number(cyl.utilisationLimit) || 10000,
    jobCardFileUrl: fileUrl,
    jobCardFileName: fileName,
    artworkUrl: fileUrl,
    isLocked: Boolean(cyl.isLocked),
    lockedBy: cyl.lockedBy || '',
    lockedAt: cyl.lockedAt || '',
    changelogs: changelogsList
  };

  const fullPayload = {
    id,
    sku: cyl.sku,
    job_name: cyl.jobName,
    colors_count: cyl.colorsCount,
    cylinder_cost: cyl.cylinderCost,
    cost_per_cylinder: cyl.costPerCylinder,
    rate_per_sq_inch: rateVal,
    engravures_name: cyl.engravuresName,
    cost_borne_by: cyl.costBorneBy,
    cost_borne_type: cyl.costBorneType,
    client_group: cyl.clientGroup,
    circumference_mm: cyl.circumferenceMm,
    face_length_mm: cyl.faceLengthMm || 1050,
    print_width_mm: Number(cyl.printWidthMm) || 1000,
    layer1_printed_qty_kg: cyl.layer1PrintedQtyKg,
    dispatched_qty: cyl.dispatchedQty,
    utilisation_limit: cyl.utilisationLimit,
    status: cyl.status || 'Active In-Use',
    artwork_url: fileUrl || null,
    job_card_file_url: fileUrl || null,
    job_card_file_name: fileName || null,
    structure: structureSummary,
    layers: layers,
    pouch_open_width: Number(cyl.pouchOpenWidth) || 0,
    pouch_height: Number(cyl.pouchHeight) || 0,
    job_master_id: cyl.jobMasterId || '',
    assigned_press: cyl.assignedPress || '',
    sil_logo: pressMarks.silLogo,
    arc_mark: pressMarks.arcMark,
    slitting_mark: pressMarks.slittingMark,
    tracker_line: pressMarks.trackerLine,
    special_instructions: pressMarks.specialInstructions,
    press_marks: pressMarks,
    chk_eyemark: pressMarks.chkEyemark,
    chk_barcode: pressMarks.chkBarcode,
    chk_orientation: pressMarks.chkOrientation,
    chk_client_approval: pressMarks.chkClientApproval,
    approved_by_head: pressMarks.approvedByHead,
    approved_head_name: pressMarks.approvedHeadName,
    approved_head_date: pressMarks.approvedHeadDate,
    variant: pressMarks.variant,
    printing: pressMarks.printing,
    invoice_to: pressMarks.invoiceTo,
    shell_size: pressMarks.shellSize,
    pet_size: pressMarks.petSize,
    is_locked: Boolean(cyl.isLocked),
    locked_by: cyl.lockedBy || '',
    locked_at: cyl.lockedAt || '',
    changelogs: changelogsList
  };

  const { error: fullErr } = await supabase.from('cylinders').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    console.error('[cylinders] Save failed:', fullErr.message);
    handleSupabaseError(fullErr, 'cylinders');
  }
}

export async function saveCylinderBatchToSupabase(cylList) {
  if (!isSupabaseConfigured() || !Array.isArray(cylList) || cylList.length === 0) {
    throw new Error("Cannot save cylinder batch: Supabase database connection is not available.");
  }
  await ensureValidSession();
  console.log(`[cylinders] Bulk syncing ${cylList.length} cylinder set(s) to Supabase...`);
  for (const cyl of cylList) {
    await saveCylinderToSupabase(cyl);
  }
}

export async function deleteCylinderFromSupabase(cylinderId) {
  if (!isSupabaseConfigured() || !cylinderId) {
    throw new Error("Cannot delete cylinder: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('cylinders').delete().eq('id', cylinderId);
  if (error) {
    console.error("Error deleting cylinder from Supabase:", error);
    handleSupabaseError(error, 'cylinders');
  }
}

// ============================================================================
// 6. PRODUCTION RECORDS
// ============================================================================

function storedMeasure(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

const GUARDRAIL_RECORD_COLUMNS = [
  'job_master_id',
  'print_film_type',
  'print_micron',
  'print_width_mm',
  'machine_name',
  'guardrail_warning_reason',
  'film_type_override_reason',
  'film_type_override_by',
  'qty_pouching_pcs',
  'zipper_consumed_m'
];

export async function fetchProductionRecords() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('production_records').select('*').order('recorded_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'production_records');
    }
    if (!data) return [];

    return data.map(r => {
      let extra = {};
      if (r.process_logs) {
        if (typeof r.process_logs === 'object') {
          extra = r.process_logs;
        } else if (typeof r.process_logs === 'string') {
          try { extra = JSON.parse(r.process_logs); } catch (e) {}
        }
      }
      return {
        id: r.id,
        orderId: r.order_id || extra.orderId,
        jobName: r.job_name || extra.jobName,
        clientName: r.client_name || extra.clientName || '',
        operatorName: r.operator_name || extra.operatorName || '',
        shift: r.shift || extra.shift || '',
        dateFilled: r.date_filled || extra.dateFilled || (r.recorded_at ? r.recorded_at.split('T')[0] : factoryCalendarDate()),
        jobCode: r.job_code || extra.jobCode || '',
        jobMasterId: r.job_master_id || extra.jobMasterId || '',
        printFilmType: r.print_film_type || extra.printFilmType || '',
        printMicron: r.print_micron ?? extra.printMicron ?? null,
        printWidthMm: r.print_width_mm ?? extra.printWidthMm ?? null,
        machineName: r.machine_name || extra.machineName || '',
        guardrailWarningReason: r.guardrail_warning_reason || extra.guardrailWarningReason || '',
        guardrailWarnings: extra.guardrailWarnings || [],
        filmTypeOverrideReason: r.film_type_override_reason || extra.filmTypeOverrideReason || '',
        filmTypeOverrideBy: r.film_type_override_by || extra.filmTypeOverrideBy || '',
        qtyPouchingPcs: storedMeasure(r.qty_pouching_pcs, extra.qtyPouchingPcs),
        zipperConsumedM: storedMeasure(r.zipper_consumed_m, extra.zipperConsumedM),
        materialsList: (Array.isArray(r.materials_list) && r.materials_list.length > 0) ? r.materials_list : (Array.isArray(extra.materialsList) ? extra.materialsList : []),
        qtyFirstPassL1: storedMeasure(extra.qtyFirstPassL1, extra.qtyPrinting, r.qty_first_pass_l1),
        qtyPrinting: storedMeasure(extra.qtyPrinting, extra.qtyFirstPassL1, r.qty_printing),
        qtyInspection: storedMeasure(extra.qtyInspection, r.qty_inspection),
        qtyLaminationL1: storedMeasure(extra.qtyLaminationL1, r.qty_lamination_l1),
        adhesiveConsumedL1Kg: Number(extra.adhesiveConsumedL1Kg || 0),
        qtySecondPassL2: storedMeasure(extra.qtySecondPassL2, r.qty_second_pass_l2),
        laminationPlainSubstrateWastageL2Kg: Number(r.lamination_plain_substrate_wastage_l2_kg) || Number(extra.laminationPlainSubstrateWastageL2Kg) || 0,
        adhesiveConsumedL2Kg: Number(extra.adhesiveConsumedL2Kg || 0),
        qtySlitting: storedMeasure(extra.qtySlitting, r.qty_slitting),
        paperCoreConsumedKg: Number(extra.paperCoreConsumedKg || 0),
        qtyPouching: storedMeasure(extra.qtyPouching, r.qty_pouching),
        zipperConsumedKg: Number(extra.zipperConsumedKg || 0),
        pouchingScrapKg: Number(r.pouching_scrap_kg) || Number(extra.pouchingScrapKg) || 0,
        slittingSettingWastageKg: Number(extra.slittingSettingWastageKg) || 0,
        excessFilmWastageKg: Number(extra.excessFilmWastageKg) || 0,
        excessFilmWastagePct: Number(extra.excessFilmWastagePct) || 0,
        actualInkGsm: Number(r.actual_ink_gsm ?? extra.actualInkGsm ?? 0),
        actualAdhesiveGsm: Number(r.actual_adhesive_gsm ?? extra.actualAdhesiveGsm ?? 0),
        targetInkGsm: Number(r.target_ink_gsm ?? extra.targetInkGsm ?? 1.5),
        targetAdhesiveGsm: Number(r.target_adhesive_gsm ?? extra.targetAdhesiveGsm ?? 1.5),
        qtyDispatch: storedMeasure(extra.qtyDispatch, r.qty_dispatch),
        totalProductionQtyKg: Number(r.gross_production_kg) || Number(extra.totalProductionQtyKg) || 0,
        grossProductionKg: Number(r.gross_production_kg) || Number(extra.totalProductionQtyKg) || 0,
        netUsableKg: storedMeasure(r.net_usable_kg, extra.netUsableKg),
        outputRolls: extra.outputRolls || extra.rollsBreakdown || [],
        rollsBreakdown: extra.rollsBreakdown || extra.outputRolls || [],
        inputRollsList: (Array.isArray(r.input_rolls_list) && r.input_rolls_list.length > 0) ? r.input_rolls_list : (extra.inputRollsList || []),
        createdBalanceRolls: extra.createdBalanceRolls || [],
        stages: extra.stages || {},
        actualMetersPrinted: storedMeasure(r.actual_meters_printed, extra.actualMetersPrinted),
        inkGsmInSpeed: Number(extra.inkGsmInSpeed || 0),
        printedOutputKg: Number(extra.printedOutputKg || 0),
        printingStartTime: extra.printingStartTime || null,
        printingEndTime: extra.printingEndTime || null,
        printingDurationMinutes: Number(extra.printingDurationMinutes || 0),
        printingDurationFormatted: extra.printingDurationFormatted || '',
        adhesiveCostPerKg: Number(extra.adhesiveCostPerKg ?? 270),
        paperCoreCostPerKg: Number(extra.paperCoreCostPerKg ?? 45),
        adhesiveCostRs: Number(extra.adhesiveCostRs ?? 0),
        paperCoreCostRs: Number(extra.paperCoreCostRs ?? 0),
        rawMaterialsTableCostRs: Number(extra.rawMaterialsTableCostRs ?? 0),
        totalMaterialCostRs: Number(r.total_material_cost_rs ?? extra.totalMaterialCostRs ?? 0),
        processingCostPerKg: Number(r.processing_cost_per_kg ?? extra.processingCostPerKg ?? 25),
        totalProcessingCostRs: Number(r.total_processing_cost_rs ?? extra.totalProcessingCostRs ?? 0),
        finalProductionCostRs: Number(r.final_production_cost_rs ?? extra.finalProductionCostRs ?? 0),
        printingPlainSettingWastageKg: Number(r.printing_plain_setting_wastage_kg ?? extra.printingPlainSettingWastageKg ?? 0),
        printingWastageKg: Number(r.printing_wastage_kg ?? extra.printingWastageKg ?? 0),
        laminationPlainSubstrateWastageKg: Number(r.lamination_plain_substrate_wastage_kg ?? extra.laminationPlainSubstrateWastageKg ?? 0),
        printedWastageKg: Number(r.printed_wastage_kg ?? extra.printedWastageKg ?? 0),
        laminateWastageKg: Number(r.laminate_wastage_kg ?? extra.laminateWastageKg ?? 0),
        trimWastageKg: Number(r.trim_wastage_kg ?? extra.trimWastageKg ?? 0),
        totalScrapQtyKg: Number(r.total_wastage_kg) || Number(extra.totalScrapQtyKg) || 0,
        totalWastageKg: Number(r.total_wastage_kg) || Number(extra.totalScrapQtyKg) || Number(extra.totalWastageKg) || 0,
        overallScrapPctOfOutput: Number(r.overall_scrap_pct_of_output) || Number(extra.overallScrapPctOfOutput) || Number(r.wastage_percentage) || 0,
        overallScrapPctOfDispatch: Number(r.overall_scrap_pct_of_dispatch) || Number(extra.overallScrapPctOfDispatch) || 0,
        wastagePercentage: Number(r.wastage_percentage) || Number(extra.wastagePercentage) || Number(extra.overallScrapPctOfOutput) || 0,
        scrapWastagePct: Number(r.wastage_percentage) || Number(extra.scrapWastagePct) || Number(extra.overallScrapPctOfOutput) || 0,
        status: r.status || extra.status || 'Filled by Plant Manager',
        filledBy: r.filled_by || extra.filledBy || r.operator_name || '',
        approvedBy: r.approved_by || extra.approvedBy || '',
        approvalDate: r.approval_date || extra.approvalDate || '',
        notes: r.notes || extra.notes || '',
        recordedAt: r.recorded_at,
        sfgConsumptions: Array.isArray(extra.sfgConsumptions) ? extra.sfgConsumptions : (Array.isArray(r.sfg_consumptions) ? r.sfg_consumptions : []),
        processLogs: extra
      };
    });
  } catch (err) {
    console.error("Error fetching production records from Supabase:", err);
    throw err;
  }
}

export async function saveProductionRecordToSupabase(record) {
  if (!isSupabaseConfigured() || !record) {
    throw new Error("Cannot save production record: Supabase database connection is not available.");
  }
  assertPersistableMeasures(record);
  await ensureValidSession();
  const recId = record.id || `REC-${Date.now()}`;
  // production_records.order_id references orders(id). A missing or blank id fails the insert.
  const linkedOrderId = await orderIdIfExists(record.orderId);
  const scrapKg = Number(record.totalScrapQtyKg ?? record.totalWastageKg ?? 0);
  const scrapPct = Number(record.overallScrapPctOfOutput ?? record.wastagePercentage ?? record.scrapWastagePct ?? 0);
  const scrapPctDispatch = Number(record.overallScrapPctOfDispatch ?? 0);
  const grossKg = Number(record.totalProductionQtyKg ?? record.grossProductionKg ?? 0);
  const netKg = netUsableForSave(record);
  const measures = measureColumnsForSave(record);

  const extra = {
    orderId: record.orderId,
    jobName: record.jobName,
    clientName: record.clientName,
    sfgConsumptions: Array.isArray(record.sfgConsumptions) ? record.sfgConsumptions : [],
    materialsList: record.materialsList || [],
    outputRolls: record.outputRolls || record.rollsBreakdown || [],
    rollsBreakdown: record.rollsBreakdown || record.outputRolls || [],
    inputRollsList: record.inputRollsList || [],
    createdBalanceRolls: record.createdBalanceRolls || [],
    stages: record.stages || {},
    actualMetersPrinted: measures.actual_meters_printed,
    inkGsmInSpeed: record.inkGsmInSpeed || 0,
    printedOutputKg: record.printedOutputKg || 0,
    printingStartTime: record.printingStartTime || null,
    printingEndTime: record.printingEndTime || null,
    printingDurationMinutes: record.printingDurationMinutes || 0,
    printingDurationFormatted: record.printingDurationFormatted || '',
    qtyFirstPassL1: measures.qty_first_pass_l1,
    qtyPrinting: measures.qty_printing,
    qtyInspection: measures.qty_inspection,
    qtyLaminationL1: measures.qty_lamination_l1,
    adhesiveConsumedL1Kg: record.adhesiveConsumedL1Kg,
    qtySecondPassL2: measures.qty_second_pass_l2,
    laminationPlainSubstrateWastageL2Kg: record.laminationPlainSubstrateWastageL2Kg,
    adhesiveConsumedL2Kg: record.adhesiveConsumedL2Kg,
    qtySlitting: measures.qty_slitting,
    paperCoreConsumedKg: record.paperCoreConsumedKg,
    qtyPouching: measures.qty_pouching,
    zipperConsumedKg: record.zipperConsumedKg,
    pouchingScrapKg: record.pouchingScrapKg,
    slittingSettingWastageKg: Number(record.slittingSettingWastageKg || 0),
    excessFilmWastageKg: Number(record.excessFilmWastageKg || 0),
    excessFilmWastagePct: Number(record.excessFilmWastagePct || 0),
    qtyDispatch: measures.qty_dispatch,
    qtyPouchingPcs: measures.qty_pouching_pcs,
    zipperConsumedM: measures.zipper_consumed_m,
    jobMasterId: record.jobMasterId || null,
    jobCode: record.jobCode || '',
    printFilmType: record.printFilmType || null,
    printMicron: record.printMicron ?? null,
    printWidthMm: record.printWidthMm ?? null,
    machineName: record.machineName || '',
    guardrailWarningReason: record.guardrailWarningReason || '',
    guardrailWarnings: record.guardrailWarnings || [],
    filmTypeOverrideReason: record.filmTypeOverrideReason || '',
    filmTypeOverrideBy: record.filmTypeOverrideBy || '',
    totalProductionQtyKg: grossKg,
    grossProductionKg: grossKg,
    netUsableKg: netKg,
    adhesiveCostPerKg: Number(record.adhesiveCostPerKg || 270),
    paperCoreCostPerKg: Number(record.paperCoreCostPerKg || 45),
    adhesiveCostRs: Number(record.adhesiveCostRs || 0),
    paperCoreCostRs: Number(record.paperCoreCostRs || 0),
    rawMaterialsTableCostRs: Number(record.rawMaterialsTableCostRs || 0),
    totalMaterialCostRs: record.totalMaterialCostRs,
    processingCostPerKg: record.processingCostPerKg,
    totalProcessingCostRs: record.totalProcessingCostRs,
    finalProductionCostRs: record.finalProductionCostRs,
    printingPlainSettingWastageKg: record.printingPlainSettingWastageKg,
    printingWastageKg: record.printingWastageKg,
    laminationPlainSubstrateWastageKg: record.laminationPlainSubstrateWastageKg,
    printedWastageKg: record.printedWastageKg,
    laminateWastageKg: record.laminateWastageKg,
    trimWastageKg: record.trimWastageKg,
    totalScrapQtyKg: scrapKg,
    totalWastageKg: scrapKg,
    overallScrapPctOfOutput: scrapPct,
    overallScrapPctOfDispatch: scrapPctDispatch,
    wastagePercentage: scrapPct,
    scrapWastagePct: scrapPct,
    actualInkGsm: Number(record.actualInkGsm || 0),
    actualAdhesiveGsm: Number(record.actualAdhesiveGsm || 0),
    targetInkGsm: Number(record.targetInkGsm || 1.5),
    targetAdhesiveGsm: Number(record.targetAdhesiveGsm || 1.5),
    filledBy: record.filledBy,
    approvedBy: record.approvedBy,
    approvalDate: record.approvalDate,
    notes: record.notes,
    dateFilled: record.dateFilled
  };
  const fullPayload = {
    id: recId,
    order_id: linkedOrderId,
    job_name: record.jobName || 'Production Record',
    job_code: record.jobCode || '',
    job_master_id: record.jobMasterId || null,
    print_film_type: record.printFilmType || null,
    print_micron: record.printMicron ?? null,
    print_width_mm: record.printWidthMm ?? null,
    machine_name: record.machineName || null,
    guardrail_warning_reason: record.guardrailWarningReason || null,
    film_type_override_reason: record.filmTypeOverrideReason || null,
    film_type_override_by: record.filmTypeOverrideBy || null,
    qty_pouching_pcs: measures.qty_pouching_pcs,
    zipper_consumed_m: measures.zipper_consumed_m,
    actual_meters_printed: measures.actual_meters_printed,
    qty_first_pass_l1: measures.qty_first_pass_l1,
    qty_printing: measures.qty_printing,
    qty_inspection: measures.qty_inspection,
    qty_lamination_l1: measures.qty_lamination_l1,
    qty_second_pass_l2: measures.qty_second_pass_l2,
    qty_slitting: measures.qty_slitting,
    qty_pouching: measures.qty_pouching,
    qty_dispatch: measures.qty_dispatch,
    adhesive_consumed_l1_kg: Number(record.adhesiveConsumedL1Kg || 0),
    adhesive_consumed_l2_kg: Number(record.adhesiveConsumedL2Kg || 0),
    zipper_consumed_kg: Number(record.zipperConsumedKg || 0),
    paper_core_consumed_kg: Number(record.paperCoreConsumedKg || 0),
    client_name: record.clientName || '',
    operator_name: record.operatorName || record.filledBy || '',
    shift: record.shift || '',
    date_filled: toDatabaseDate(record.dateFilled),
    actual_ink_gsm: Number(record.actualInkGsm || 0),
    actual_adhesive_gsm: Number(record.actualAdhesiveGsm || 0),
    target_ink_gsm: Number(record.targetInkGsm || 1.5),
    target_adhesive_gsm: Number(record.targetAdhesiveGsm || 1.5),
    gross_production_kg: grossKg,
    net_usable_kg: netKg,
    total_wastage_kg: scrapKg,
    wastage_percentage: scrapPct,
    overall_scrap_pct_of_output: scrapPct,
    overall_scrap_pct_of_dispatch: scrapPctDispatch,
    printing_plain_setting_wastage_kg: Number(record.printingPlainSettingWastageKg || 0),
    printing_wastage_kg: Number(record.printingWastageKg || 0),
    lamination_plain_substrate_wastage_kg: Number(record.laminationPlainSubstrateWastageKg || 0),
    printed_wastage_kg: Number(record.printedWastageKg || 0),
    laminate_wastage_kg: Number(record.laminateWastageKg || 0),
    trim_wastage_kg: Number(record.trimWastageKg || 0),
    lamination_plain_substrate_wastage_l2_kg: Number(record.laminationPlainSubstrateWastageL2Kg || 0),
    pouching_scrap_kg: Number(record.pouchingScrapKg || 0),
    total_material_cost_rs: Number(record.totalMaterialCostRs || 0),
    processing_cost_per_kg: Number(record.processingCostPerKg || 25),
    total_processing_cost_rs: Number(record.totalProcessingCostRs || 0),
    final_production_cost_rs: Number(record.finalProductionCostRs || 0),
    filled_by: record.filledBy || '',
    approved_by: record.approvedBy || '',
    approval_date: record.approvalDate || '',
    notes: record.notes || '',
    status: record.status || 'Filled by Plant Manager',
    materials_list: Array.isArray(record.materialsList) ? record.materialsList : [],
    input_rolls_list: Array.isArray(record.inputRollsList) ? record.inputRollsList : [],
    process_logs: extra
  };
  
  let payload = fullPayload;
  let { error: fullErr } = await supabase.from('production_records').upsert(payload, { onConflict: 'id' });
  if (fullErr && GUARDRAIL_RECORD_COLUMNS.some((column) => String(fullErr.message || '').includes(column))) {
    payload = { ...payload };
    GUARDRAIL_RECORD_COLUMNS.forEach((column) => { delete payload[column]; });
    ({ error: fullErr } = await supabase.from('production_records').upsert(payload, { onConflict: 'id' }));
  }
  const fkFailed = fullErr && (fullErr.code === '23503' || String(fullErr.message || '').toLowerCase().includes('foreign key'));
  if (fkFailed && linkedOrderId) {
    console.warn('[production_records] Order foreign key rejected; saving the full record with order_id cleared.');
    const { error: unlinkedErr } = await supabase.from('production_records').upsert({ ...payload, order_id: null }, { onConflict: 'id' });
    if (unlinkedErr) handleSupabaseError(unlinkedErr, 'production_records');
    return;
  }
  if (fullErr) handleSupabaseError(fullErr, 'production_records');
}

// ============================================================================
// 7. USERS
// ============================================================================

export async function fetchUsers() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, email, role, assigned_roles, department, active, status')
      .order('full_name');
    if (error) {
      handleSupabaseError(error, 'users');
    }
    if (!data) return [];

    return data
      .filter(u => u.id && !u.id.startsWith('USR-SETTING-'))
      .map(mapDirectoryUser);
  } catch (err) {
    console.error("Error fetching users from Supabase:", err);
    throw err;
  }
}


export async function saveUserToSupabase(user) {
  if (!isSupabaseConfigured() || !user) {
    throw new Error("Cannot save user: Supabase database connection is not available.");
  }
  try {
    await ensureValidSession();
    const userId = user.id || `USR-${Math.floor(1000 + Math.random() * 9000)}`;

    const roles = assignedRolesOf(user);
    const role = primaryRole(roles, user.role) || user.role || 'Shop Floor Operator';
    const fullPayload = {
      id: userId,
      username: user.email?.toLowerCase() || userId,
      full_name: user.name || '',
      email: user.email || '',
      role,
      assigned_roles: roles.length ? roles : [role],
      department: user.department || 'Operations',
      active: user.status !== 'Inactive',
      status: user.status || 'Active'
    };

    const { data, error: fullErr } = await supabase
      .from('users')
      .upsert([fullPayload], { onConflict: 'id' })
      .select();

    if (fullErr) {
      handleSupabaseError(fullErr, 'users');
    }

    return data ? data[0] : fullPayload;
  } catch (err) {
    handleSupabaseError(err, 'users exception');
  }
}

/**
 * Update password for a user in the auth system.
 */
export async function updateUserPasswordInDB() {
  throw new Error('Passwords are changed with Supabase Auth. Use the reset link or the signed-in password form.');
}

export async function deleteUserFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete user: Supabase database connection is not available.");
  }
  try {
    await ensureValidSession();
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      handleSupabaseError(error, 'users');
    }
    return true;
  } catch (err) {
    handleSupabaseError(err, 'users exception');
  }
}


// ============================================================================
// 8. JOB DATA SHEETS
// ============================================================================

export async function fetchJobDataSheets() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('job_datasheets').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'job_datasheets');
    }
    if (!data) return [];

    return data.map(s => ({
      id: s.id,
      jobId: s.job_id,
      jobName: s.job_name,
      clientName: s.client_name,
      completionDate: s.completion_date || s.created_at?.split('T')[0],
      sellingPricePerKg: Number(s.selling_price_per_kg) || 0,
      preCostPerKg: Number(s.pre_cost_per_kg) || 0,
      postCostPerKg: Number(s.post_cost_per_kg) || 0,
      profitMarginPct: Number(s.profit_margin_pct) || 0,
      actualInkConsumedKg: Number(s.actual_ink_consumed_kg) || 0,
      actualSolventsConsumedKg: Number(s.actual_solvents_consumed_kg) || 0,
      actualAdhesiveConsumedKg: Number(s.actual_adhesive_consumed_kg) || 0,
      actualScrapWastageKg: Number(s.actual_scrap_wastage_kg) || 0,
      operatorNotes: s.operator_notes,
      createdBy: s.created_by
    }));
  } catch (err) {
    console.error("Error fetching job datasheets from Supabase:", err);
    throw err;
  }
}

export async function saveJobDataSheetToSupabase(sheet) {
  if (!isSupabaseConfigured() || !sheet) {
    throw new Error("Cannot save job datasheet: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const sheetId = sheet.id || `JDS-${Date.now()}`;
  const fullPayload = {
    id: sheetId,
    job_id: sheet.jobId,
    job_name: sheet.jobName || 'Job Datasheet',
    client_name: sheet.clientName || '',
    completion_date: sheet.completionDate,
    selling_price_per_kg: Number(sheet.sellingPricePerKg) || 0,
    pre_cost_per_kg: Number(sheet.preCostPerKg) || 0,
    post_cost_per_kg: Number(sheet.postCostPerKg) || 0,
    profit_margin_pct: Number(sheet.profitMarginPct) || 0,
    actual_ink_consumed_kg: Number(sheet.actualInkConsumedKg) || 0,
    actual_solvents_consumed_kg: Number(sheet.actualSolventsConsumedKg) || 0,
    actual_adhesive_consumed_kg: Number(sheet.actualAdhesiveConsumedKg) || 0,
    actual_scrap_wastage_kg: Number(sheet.actualScrapWastageKg) || 0,
    operator_notes: sheet.operatorNotes || '',
    created_by: sheet.createdBy || 'Plant Manager'
  };
  console.log('[job_datasheets] Saving:', sheetId, sheet.jobName);
  const { error: fullErr } = await supabase.from('job_datasheets').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) handleSupabaseError(fullErr, 'job_datasheets');
}

export async function deleteJobDataSheetFromSupabase(sheetId) {
  if (!isSupabaseConfigured() || !sheetId) return;
  await ensureValidSession();
  const { error } = await supabase.from('job_datasheets').delete().eq('id', sheetId);
  if (error) {
    handleSupabaseError(error, 'job_datasheets');
  }
}


// ============================================================================
// CLEAR ALL SUPABASE TABLES FUNCTION
// ============================================================================

export async function clearAllSupabaseData() {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase credentials are not configured.' };
  }

  try {
    await supabase.from('production_records').delete().neq('id', '000');
    await supabase.from('grns').delete().neq('id', '000');
    await supabase.from('orders').delete().neq('id', '000');
    await supabase.from('vendors').delete().neq('id', '000');
    await supabase.from('clients').delete().neq('id', '000');
    await supabase.from('inventory').delete().neq('id', '000');
    await supabase.from('cylinders').delete().neq('id', '000');

    return {
      success: true,
      message: 'All Supabase tables purged successfully!'
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to clear Supabase tables: ${err.message}`
    };
  }
}

// ============================================================================
// 9. INVENTORY ROLLS & BARCODES
// ============================================================================

export async function fetchInventoryRolls() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('inventory_rolls').select('*').order('inward_datetime', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'inventory_rolls');
    }
    if (!data) return [];

    return data.map(r => {
      const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
      return {
      id: r.barcode_id,
      barcodeId: r.barcode_id,
      grnNo: r.grn_no || meta.grnNo || '',
      grnId: r.grn_id || null,
      grnLineItemId: r.grn_line_item_id || null,
      lineNo: r.line_no === null || r.line_no === undefined ? null : Number(r.line_no),
      vendorRollNo: r.vendor_roll_no || '',
      unitNo: r.unit_no === null || r.unit_no === undefined ? null : Number(r.unit_no),
      rollType: r.roll_type || 'RAW_MATERIAL',
      itemId: r.item_id,
      itemName: r.item_name || '',
      category: r.category || '',
      jobName: r.job_name,
      orderId: r.order_id,
      micron: Number(r.micron) || 0,
      widthMm: Number(r.width_mm) || 0,
      metallocenePct: r.metallocene_pct || r.metallocenePct || '',
      metallocene_pct: r.metallocene_pct || r.metallocenePct || '',
      packagingType: r.packaging_type || '',
      inwardDatetime: r.inward_datetime,
      productionDate: r.production_date || (r.inward_datetime ? r.inward_datetime.split('T')[0] : ''),
      vendorName: r.vendor_name || '',
      invoiceNo: r.invoice_no || '',
      batchNo: r.batch_no || '',
      grossWeightKg: Number(r.gross_weight_kg ?? r.net_weight_kg) || 0,
      tareWeightKg: Number(r.tare_weight_kg ?? 0) || 0,
      netWeightKg: Number(r.net_weight_kg) || 0,
      availableWeightKg: Number(r.available_weight_kg ?? r.net_weight_kg) || 0,
      lengthMeters: Number(r.length_meters ?? 0) || 0,
      jointCount: Number(r.joint_count ?? 0) || 0,
      qcStatus: r.qc_status || 'Pending QC',
      machineName: r.machine_name || r.station_id || '',
      operatorName: r.operator_name || '',
      shift: r.shift || '',
      remarks: r.remarks || '',
      itemRemarks: r.remarks || '',
      notes: r.remarks || '',
      coreDia: r.core_dia || '',
      coreWeightKg: r.core_weight_kg === null || r.core_weight_kg === undefined
        ? (meta.coreWeightKg === undefined || meta.coreWeightKg === null ? undefined : (Number(meta.coreWeightKg) || 0))
        : (Number(r.core_weight_kg) || 0),
      purchaseRatePerKg: Number(r.purchase_rate_per_kg ?? r.unit_price ?? 0) || 0,
      unitPrice: Number(r.purchase_rate_per_kg ?? r.unit_price ?? 0) || 0,
      unit: r.unit || (r.category === 'Film Substrates' ? 'Kg' : 'Pcs'),
      inputBarcodeIds: Array.isArray(r.input_barcode_ids) ? r.input_barcode_ids : [],
      stationId: r.station_id || '',
      locationBay: r.location_bay || '',
      status: r.status || 'In Stock',
      filmType: r.film_type || meta.filmType || '',
      bulkUploadFingerprint: meta.bulkUploadFingerprint || '',
      ...(meta.parentSfgBatchCode ? { parentSfgBatchCode: meta.parentSfgBatchCode } : {})
    };
    });
  } catch (err) {
    console.error("Error fetching inventory rolls from Supabase:", err);
    throw err;
  }
}

export async function saveInventoryRollToSupabase(roll) {
  if (!isSupabaseConfigured() || !roll) {
    throw new Error("Cannot save inventory roll: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const netWeight = Number(roll.netWeightKg) || 0;
  const availableWeight = Number(roll.availableWeightKg ?? roll.availableKg ?? netWeight) || 0;

  const fullPayload = {
    barcode_id: roll.barcodeId || roll.id,
    roll_type: roll.rollType || 'RAW_MATERIAL',
    item_id: roll.itemId || '',
    item_name: roll.itemName || '',
    category: roll.category || '',
    job_name: roll.jobName || '',
    order_id: roll.orderId || '',
    micron: Number(roll.micron) || 0,
    width_mm: Number(roll.widthMm) || 0,
    metallocene_pct: roll.metallocenePct || roll.metallocene_pct || null,
    ...inventoryRollDateFields(roll),
    vendor_name: roll.vendorName || roll.vendor || '',
    invoice_no: roll.invoiceNo || roll.invoice_no || '',
    batch_no: roll.batchNo || roll.lotNo || roll.grnNo || roll.grn_no || '',
    gross_weight_kg: Number(roll.grossWeightKg ?? (netWeight > 0 ? netWeight + 0.5 : 0)) || 0,
    tare_weight_kg: Number(roll.tareWeightKg ?? 0.5) || 0,
    ...(roll.coreWeightKg !== undefined && roll.coreWeightKg !== null ? { core_weight_kg: Number(roll.coreWeightKg) || 0 } : {}),
    net_weight_kg: netWeight,
    available_weight_kg: availableWeight,
    length_meters: Number(roll.lengthMeters ?? 0) || 0,
    joint_count: Number(roll.jointCount ?? 0) || 0,
    film_type: roll.filmType && roll.filmType !== '-' ? roll.filmType : null,
    qc_status: roll.qcStatus || 'Approved',
    machine_name: roll.machineName || roll.machine || roll.stationId || '',
    operator_name: roll.operatorName || roll.operator || '',
    shift: roll.shift || '',
    remarks: roll.itemRemarks || roll.remarks || roll.notes || '',
    core_dia: roll.coreDia || '',
    input_barcode_ids: roll.inputBarcodeIds || [],
    station_id: roll.stationId || '',
    location_bay: roll.locationBay || '',
    status: roll.status || (availableWeight <= 0 ? 'Consumed' : 'In Stock'),
    sfg_type: roll.sfgType || (roll.rollType === 'SEMI_FINISHED_GOODS' ? 'Printed Rolls' : null),
    job_code: roll.jobCode || '',
    client_name: roll.customerName || roll.clientName || '',
    structure: roll.structure || '',
    grn_id: roll.grnId || roll.grn_id || null,
    grn_line_item_id: roll.grnLineItemId || roll.grn_line_item_id || null,
    line_no: roll.lineNo === 0 || roll.lineNo ? Number(roll.lineNo) : (roll.line_no === 0 || roll.line_no ? Number(roll.line_no) : null),
    vendor_roll_no: roll.vendorRollNo || roll.vendor_roll_no || null,
    unit_no: roll.unitNo === 0 || roll.unitNo ? Number(roll.unitNo) : (roll.unit_no === 0 || roll.unit_no ? Number(roll.unit_no) : null),
    metadata: {
      grnNo: roll.grnNo || roll.grn_no || '',
      grnLineItemId: roll.grnLineItemId || roll.grn_line_item_id || '',
      vendorRollNo: roll.vendorRollNo || roll.vendor_roll_no || '',
      packagingType: roll.packagingType || 'Roll',
      purchaseRatePerKg: Number(roll.purchaseRatePerKg ?? roll.unitPrice ?? roll.purchaseRate ?? 0) || 0,
      unitPrice: Number(roll.purchaseRatePerKg ?? roll.unitPrice ?? roll.purchaseRate ?? 0) || 0,
      unit: roll.unit || 'Kg',
      ...(roll.coreWeightKg !== undefined && roll.coreWeightKg !== null ? { coreWeightKg: Number(roll.coreWeightKg) || 0 } : {}),
      ...(roll.filmType && roll.filmType !== '-' ? { filmType: roll.filmType } : {}),
      ...(roll.bulkUploadFingerprint ? { bulkUploadFingerprint: roll.bulkUploadFingerprint } : {}),
      ...(roll.parentSfgBatchCode ? { parentSfgBatchCode: roll.parentSfgBatchCode } : {})
    }
  };
  console.log('[inventory_rolls] Saving barcode:', roll.barcodeId || roll.id);
  const { error: fullErr } = await supabase.from('inventory_rolls').upsert(fullPayload, { onConflict: 'barcode_id' });
  if (fullErr) handleSupabaseError(fullErr, 'inventory_rolls');
}

/** Sets available weight and status without replacing the rest of the roll. */
export async function setInventoryRollAvailability(barcodeId, { availableWeightKg, status } = {}) {
  if (!isSupabaseConfigured() || !barcodeId) {
    throw new Error('Cannot update inventory roll: Supabase database connection is not available.');
  }
  await ensureValidSession();
  const patch = { available_weight_kg: Number(availableWeightKg) || 0 };
  if (status) patch.status = status;
  const { error } = await supabase.from('inventory_rolls').update(patch).eq('barcode_id', barcodeId);
  if (error) handleSupabaseError(error, 'inventory_rolls');
}

// ============================================================================
// 10. DISPATCH SHIPMENTS & PACKING LISTS
// ============================================================================

export async function fetchDispatchShipments() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('dispatch_shipments').select('*').order('dispatch_date', { ascending: false });
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(d => {
          const columnStatus = d.packing_status ?? null;
          if (d.payload && typeof d.payload === 'object') {
            return {
              ...d.payload,
              id: d.payload.id || d.id || d.dispatch_id,
              dispatchId: d.payload.dispatchId || d.dispatch_id,
              packing_status: columnStatus
            };
          }
          return {
            id: d.id || d.dispatch_id,
            dispatchId: d.dispatch_id,
            orderId: d.order_id,
            jobName: d.job_name,
            clientName: d.client_name,
            vehicleNo: d.vehicle_no,
            lrNo: d.lr_no,
            transporterName: d.transporter_name || '',
            poNo: d.po_no || '',
            invoiceNo: d.invoice_no || '',
            dispatchDate: d.dispatch_date,
            totalRolls: Number(d.total_rolls) || 0,
            totalNetWeightKg: Number(d.total_net_weight_kg) || 0,
            totalGrossWeightKg: Number(d.total_gross_weight_kg) || 0,
            items: Array.isArray(d.items) ? d.items : [],
            hideBranding: d.hide_branding || false,
            packing_status: columnStatus,
            packingStatus: columnStatus
          };
        });
      } else if (error) {
        handleSupabaseError(error, 'dispatch_shipments');
      }
    } catch (err) {
      throw err;
    }

    tableRecords.sort((a, b) => {
      const timeA = new Date(a.dispatchDate || a.createdAt || 0).getTime();
      const timeB = new Date(b.dispatchDate || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
    let consumptionRows = [];
    try {
      const { data: rows, error: consumptionError } = await supabase.from('packing_list_consumptions').select('*');
      if (!consumptionError && Array.isArray(rows)) consumptionRows = rows;
    } catch (consumptionErr) {
      console.warn('[dispatch] packing list consumptions are not available yet:', consumptionErr?.message || consumptionErr);
    }
    return mergeConsumptionsIntoShipments(tableRecords, consumptionRows);
  } catch (err) {
    console.error("Error fetching dispatch shipments from Supabase:", err);
    throw err;
  }
}

export async function saveDispatchShipmentToSupabase(shipment) {
  if (!isSupabaseConfigured() || !shipment) {
    throw new Error("Cannot save dispatch shipment: Supabase database connection is not available.");
  }
  await ensureValidSession();

  const primaryKey = String(shipment.id || shipment.dispatchId || `DISP-PL-${Date.now()}`);
  const dispatchDate = toDatabaseTimestamp(shipment.dispatchDate);
  const storedShipment = shipmentWithoutGainLoss({
    ...shipment,
    dispatchDate,
    createdAt: shipment.createdAt ? toDatabaseTimestamp(shipment.createdAt) : dispatchDate
  });
  const fullPayload = {
    id: primaryKey,
    dispatch_id: shipment.dispatchId || primaryKey,
    order_id: shipment.orderId || '',
    job_name: shipment.jobName || '',
    client_name: shipment.clientName || '',
    vehicle_no: shipment.vehicleNo || '',
    lr_no: shipment.lrNo || '',
    transporter_name: shipment.transporterName || '',
    po_no: shipment.poNo || '',
    invoice_no: shipment.invoiceNo || '',
    dispatch_date: dispatchDate,
    total_rolls: Number(shipment.totalRolls) || 0,
    total_net_weight_kg: Number(shipment.totalNetWeightKg) || 0,
    total_gross_weight_kg: Number(shipment.totalGrossWeightKg) || 0,
    items: shipment.items || [],
    hide_branding: Boolean(shipment.hideBranding),
    packing_status: shipment.packingStatus || null,
    payload: storedShipment,
    updated_at: new Date().toISOString()
  };

  const { error: fullErr } = await supabase.from('dispatch_shipments').upsert(fullPayload, { onConflict: 'dispatch_id' });
  if (fullErr) handleSupabaseError(fullErr, 'dispatch_shipments');
}

export async function deleteDispatchShipmentFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete dispatch shipment: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('dispatch_shipments').delete().eq('dispatch_id', String(id));
  if (error) handleSupabaseError(error, 'dispatch_shipments');
}

// ============================================================================
// 11. PRINTING MACHINES & PRODUCTION SCHEDULER
// ============================================================================

export async function fetchPrintingMachines() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('printing_machines').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'printing_machines');
    }
    if (!data) return [];

    return data.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type || 'Rotogravure',
      colors: Number(m.colors) || 8,
      maxSpeedMpm: Number(m.max_speed_mpm) || 250,
      maxSpeedRecorded: Number(m.max_speed_mpm) > 0,
      maxWidthMm: Number(m.max_width_mm) || 1200,
      status: m.status || 'Active',
      operator: m.operator,
      location: m.location
    }));
  } catch (err) {
    console.error("Error fetching printing machines from Supabase:", err);
    throw err;
  }
}

export async function savePrintingMachineToSupabase(machine) {
  if (!isSupabaseConfigured() || !machine) {
    throw new Error("Cannot save printing machine: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const machineId = machine.id || `MAC-PRINT-${Math.floor(10 + Math.random() * 90)}`;
  const fullPayload = {
    id: machineId,
    name: machine.name || 'Machine',
    type: machine.type || 'Rotogravure',
    colors: Number(machine.colors) || 8,
    max_speed_mpm: Number(machine.maxSpeedMpm) || 250,
    max_width_mm: Number(machine.maxWidthMm) || 1200,
    status: machine.status || 'Active',
    operator: machine.operator || '',
    location: machine.location || 'Printing Hall'
  };
  console.log('[printing_machines] Saving:', machineId, machine.name);
  const { error: fullErr } = await supabase.from('printing_machines').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) handleSupabaseError(fullErr, 'printing_machines');
}

export async function deletePrintingMachineFromSupabase(machineId) {
  if (!isSupabaseConfigured() || !machineId) {
    throw new Error("Cannot delete printing machine: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('printing_machines').delete().eq('id', machineId);
  if (error) handleSupabaseError(error, 'printing_machines');
}

export async function fetchProductionSchedules() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('production_schedules').select('*').order('scheduled_date', { ascending: true });
    if (error) {
      handleSupabaseError(error, 'production_schedules');
    }
    if (!data) return [];

    return data.map(s => ({
      id: s.id,
      orderId: s.order_id,
      jobName: s.job_name,
      clientName: s.client_name,
      machineId: s.machine_id,
      shift: s.shift || 'Day Shift',
      scheduledDate: s.scheduled_date,
      startTime: s.start_time,
      orderQtyKg: Number(s.order_qty_kg) || 0,
      widthMm: Number(s.width_mm) || 0,
      micron: Number(s.micron) || 12,
      filmType: s.film_type || 'PET',
      maxSpeedMpm: Number(s.max_speed_mpm) || 250,
      totalLengthMeters: Number(s.total_length_meters) || 0,
      runTimeMins: Number(s.run_time_mins) || 0,
      rollChangeoverMins: Number(s.roll_changeover_mins) || 0,
      jobChangeoverMins: Number(s.job_changeover_mins) || 0,
      totalDurationMins: Number(s.total_duration_mins) || 0,
      endTime: s.end_time,
      status: s.status || 'Scheduled',
      priority: s.priority || 'Normal'
    }));
  } catch (err) {
    console.error("Error fetching production schedules from Supabase:", err);
    throw err;
  }
}

export async function saveProductionScheduleToSupabase(schedule) {
  if (!isSupabaseConfigured() || !schedule) {
    throw new Error("Cannot save production schedule: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const schedId = schedule.id || `SCHED-2026-${Math.floor(100 + Math.random() * 900)}`;
  const fullPayload = {
    id: schedId,
    order_id: schedule.orderId,
    job_name: schedule.jobName || '',
    client_name: schedule.clientName || '',
    machine_id: schedule.machineId,
    shift: schedule.shift || 'Day Shift',
    scheduled_date: schedule.scheduledDate || new Date().toISOString().split('T')[0],
    start_time: schedule.startTime || '08:00',
    order_qty_kg: Number(schedule.orderQtyKg) || 0,
    width_mm: Number(schedule.widthMm) || 0,
    micron: Number(schedule.micron) || 12,
    film_type: schedule.filmType || '',
    max_speed_mpm: Number(schedule.maxSpeedMpm) || 250,
    total_length_meters: Number(schedule.totalLengthMeters) || 0,
    run_time_mins: Number(schedule.runTimeMins) || 0,
    roll_changeover_mins: Number(schedule.rollChangeoverMins) || 0,
    job_changeover_mins: Number(schedule.jobChangeoverMins) || 0,
    total_duration_mins: Number(schedule.totalDurationMins) || 0,
    end_time: schedule.endTime || '',
    status: schedule.status || 'Scheduled',
    priority: schedule.priority || 'Normal'
  };
  console.log('[production_schedules] Saving:', schedId, schedule.jobName);
  const { error: fullErr } = await supabase.from('production_schedules').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) handleSupabaseError(fullErr, 'production_schedules');
}

export async function deleteProductionScheduleFromSupabase(scheduleId) {
  if (!isSupabaseConfigured() || !scheduleId) {
    throw new Error("Cannot delete production schedule: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('production_schedules').delete().eq('id', scheduleId);
  if (error) handleSupabaseError(error, 'production_schedules');
}

// ============================================================================
// 12. JOB MASTERS DIRECTORY
// ============================================================================

export function safeParseLayers(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      return [];
    }
  }
  return [];
}

export function parseStructureStringToLayers(structureStr) {
  if (!structureStr || structureStr === '—') return [];
  const parts = String(structureStr).split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return [];

  const filmKeys = Object.keys(FILM_DENSITIES);

  return parts.map((part, idx) => {
    const micronMatch = part.match(/(\d+(\.\d+)?)\s*(µ|mic|micron|u)?/i);
    const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
    let rawType = part.replace(/(\d+(\.\d+)?)\s*(µ|mic|micron|u)?/gi, '').trim();

    let matchedFilm = filmKeys.find(f => f.toLowerCase() === rawType.toLowerCase());
    if (!matchedFilm && filmKeys.length > 0) {
      matchedFilm = filmKeys.find(f => rawType.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(rawType.toLowerCase()));
    }
    if (!matchedFilm) {
      const upper = rawType.toUpperCase();
      if (upper.includes('METPET')) matchedFilm = 'METPET';
      else if (upper.includes('PET')) matchedFilm = 'PET';
      else if (upper.includes('BOPP')) matchedFilm = 'BOPP';
      else if (upper.includes('CPP')) matchedFilm = 'CPP';
      else if (upper.includes('NGP')) matchedFilm = 'NGP';
      else if (upper.includes('MGP')) matchedFilm = 'MGP';
      else if (upper.includes('MATTA')) matchedFilm = 'MATTA';
      else matchedFilm = rawType || 'PET';
    }

    return {
      id: Date.now() + idx,
      filmType: matchedFilm,
      micron: micron
    };
  });
}

export async function fetchJobMasters() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('job_masters').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'job_masters');
    }
    if (!data) return [];

    return data.map(j => {
      let rawJobName = j.job_name || '';
      let meta = {};
      if (rawJobName.includes(' ||| ')) {
        const parts = rawJobName.split(' ||| ');
        rawJobName = parts[0];
        try {
          meta = JSON.parse(parts[1]);
        } catch (e) {
          console.warn("Failed to parse metadata from job_name in fetchJobMasters:", e.message);
        }
      }

      const pm = { ...meta, ...(j.press_marks || {}), ...(meta.pressMarks || {}) };
      let layers = safeParseLayers(j.layers);
      if (layers.length === 0) layers = safeParseLayers(meta.layers);
      if (layers.length === 0) layers = safeParseLayers(pm.layers);

      const derivedStructure = (layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (j.structure || j.film_structure || '—');

      if (layers.length === 0 && derivedStructure && derivedStructure !== '—') {
        layers = parseStructureStringToLayers(derivedStructure);
      }

      const parseGsm = (val, defaultVal = 1.5) => {
        if (val !== undefined && val !== null && val !== '') {
          const num = parseFloat(val);
          if (!isNaN(num)) return num;
        }
        return defaultVal;
      };

      const inkGsm = parseGsm(j.ink_gsm ?? j.inkGsm ?? meta.inkGsm ?? pm.inkGsm ?? pm.ink_gsm, 1.5);
      const adhesiveGsm = parseGsm(j.adhesive_gsm ?? j.adhesiveGsm ?? meta.adhesiveGsm ?? pm.adhesiveGsm ?? pm.adhesive_gsm, 1.5);

      return {
        id: j.id,
        skuCode: j.sku_code || j.sku || meta.skuCode || '',
        jobName: rawJobName,
        clientName: j.client_name || meta.clientName || '',
        structure: derivedStructure,
        printWidthMm: Number(j.print_width_mm || j.print_width || j.pouch_width_mm || j.width_mm || j.pouch_open_width) || 1000,
        printWidthRecorded: Number(j.print_width_mm || j.print_width || j.pouch_width_mm || j.width_mm || j.pouch_open_width) > 0,
        wastagePercentage: Number(j.wastage_percentage ?? j.wastagePercentage) || null,
        faceLengthMm: Number(j.face_length_mm || j.face_length || j.shell_size || pm.faceLengthMm) || (Number(j.print_width_mm) || 1050),
        repeatLengthMm: Number(j.repeat_length_mm || j.repeat_length || j.circumference_mm) || 400,
        pouchOpenWidth: Number(j.pouch_open_width || pm.pouchOpenWidth) || 0,
        pouchHeight: Number(j.pouch_height || j.pouch_height_mm || pm.pouchHeight) || 0,
        layers: layers,
        inkGsm: inkGsm,
        adhesiveGsm: adhesiveGsm,
        cylinderSku: j.cylinder_sku || j.sku_code || '',
        cylinderCost: j.cylinder_cost || '₹ 0',
        colorsCount: Number(j.colors_count) || 6,
        engravuresName: j.engravures_name || j.engraver_name || '',
        costBorneBy: j.cost_borne_by || 'Client (100%)',
        utilisationLimit: Number(j.utilisation_limit) || 10000,
        jobCardFileName: j.job_card_file_name || (j.job_card_file_url || j.artwork_url ? 'Artwork_KLD_Proof.pdf' : ''),
        jobCardFileUrl: j.job_card_file_url || j.artwork_url || '',
        artworkUrl: j.artwork_url || j.job_card_file_url || '',
        silLogo: j.sil_logo !== undefined && j.sil_logo !== null ? j.sil_logo : (pm.silLogo !== undefined && pm.silLogo !== null ? pm.silLogo : ''),
        arcMark: j.arc_mark || pm.arcMark || 'Yes',
        slittingMark: j.slitting_mark || pm.slittingMark || 'Yes',
        trackerLine: j.tracker_line || pm.trackerLine || 'Yes',
        specialInstructions: j.special_instructions || pm.specialInstructions || '',
        chkEyemark: j.chk_eyemark ?? pm.chkEyemark ?? false,
        chkBarcode: j.chk_barcode ?? pm.chkBarcode ?? false,
        chkOrientation: j.chk_orientation ?? pm.chkOrientation ?? false,
        chkClientApproval: j.chk_client_approval ?? pm.chkClientApproval ?? false,
        approvedByHead: j.approved_by_head ?? pm.approvedByHead ?? false,
        approvedHeadName: j.approved_head_name || pm.approvedHeadName || '',
        approvedHeadDate: j.approved_head_date || pm.approvedHeadDate || '',
        variant: j.variant || pm.variant || 'Standard',
        printing: j.printing_process || j.printing || pm.printing || 'Reverse',
        invoiceTo: j.invoice_to || pm.invoiceTo || 'Samyak International Ltd',
        shellSize: j.shell_size || pm.shellSize || '',
        petSize: j.pet_size || pm.petSize || '',
        processRouting: Array.isArray(j.process_routing) ? j.process_routing : (Array.isArray(pm.processRouting) ? pm.processRouting : []),
        creationDate: j.creation_date || (j.created_at ? String(j.created_at).split('T')[0] : new Date().toISOString().split('T')[0])
      };
    });
  } catch (err) {
    console.error("Error fetching job masters from Supabase:", err);
    throw err;
  }
}

export async function saveJobMasterToSupabase(jobMaster) {
  if (!isSupabaseConfigured() || !jobMaster) {
    throw new Error("Cannot save job master: Supabase database connection is not available.");
  }
  await ensureValidSession();
  
  const id = jobMaster.id || `JM-2026-${Math.floor(100 + Math.random() * 900)}`;
  const skuCode = jobMaster.skuCode || jobMaster.sku || '';
  const jobName = jobMaster.jobName || '';
  const clientName = jobMaster.clientName || '';
  const layers = Array.isArray(jobMaster.layers) ? jobMaster.layers : [];
  const processRouting = Array.isArray(jobMaster.processRouting) ? jobMaster.processRouting : [];
  const structure = (layers.length > 0)
    ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
    : (jobMaster.structure || '—');
  const printWidthMm = Number(jobMaster.printWidthMm || jobMaster.pouchWidthMm || jobMaster.pouch_width_mm) || 1000;
  const faceLengthMm = Number(jobMaster.faceLengthMm || jobMaster.face_length_mm || jobMaster.shellSize || jobMaster.totalWidth) || (printWidthMm + 50);
  const repeatLengthMm = Number(jobMaster.repeatLengthMm || jobMaster.repeat_length_mm) || 400;
  const pouchWidthMm = Number(jobMaster.pouchOpenWidth) || printWidthMm;
  const pouchHeightMm = Number(jobMaster.pouchHeight) || 150;
  const colorsCount = Number(jobMaster.colorsCount) || 6;
  const cylinderCost = String(jobMaster.cylinderCost || '₹ 0');
  const costBorneBy = jobMaster.costBorneBy || 'Client (100%)';
  const engraverName = jobMaster.engravuresName || jobMaster.engraverName || '';
  const fileUrl = jobMaster.jobCardFileUrl || jobMaster.artworkUrl || '';
  const fileName = jobMaster.jobCardFileName || (fileUrl ? 'Artwork_KLD_Proof.pdf' : '');

  const parseGsm = (val, defaultVal = 1.5) => {
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFloat(val);
      if (!isNaN(num)) return num;
    }
    return defaultVal;
  };

  const inkGsmVal = parseGsm(jobMaster.inkGsm, 1.5);
  const adhesiveGsmVal = parseGsm(jobMaster.adhesiveGsm, 1.5);

  const pressMarks = {
    silLogo: jobMaster.silLogo !== undefined && jobMaster.silLogo !== null ? jobMaster.silLogo : '',
    arcMark: jobMaster.arcMark || 'Yes',
    slittingMark: jobMaster.slittingMark || 'Yes',
    trackerLine: jobMaster.trackerLine || 'Yes',
    specialInstructions: jobMaster.specialInstructions || '',
    printWidthMm: printWidthMm,
    faceLengthMm: faceLengthMm,
    inkGsm: inkGsmVal,
    adhesiveGsm: adhesiveGsmVal,
    ink_gsm: inkGsmVal,
    adhesive_gsm: adhesiveGsmVal,
    chkEyemark: jobMaster.chkEyemark ?? false,
    chkBarcode: jobMaster.chkBarcode ?? false,
    chkOrientation: jobMaster.chkOrientation ?? false,
    chkClientApproval: jobMaster.chkClientApproval ?? false,
    approvedByHead: jobMaster.approvedByHead ?? false,
    approvedHeadName: jobMaster.approvedHeadName || '',
    approvedHeadDate: jobMaster.approvedHeadDate || '',
    variant: jobMaster.variant || 'Standard',
    printing: jobMaster.printing || 'Reverse',
    invoiceTo: jobMaster.invoiceTo || 'Samyak International Ltd',
    shellSize: jobMaster.shellSize || `${faceLengthMm} mm`,
    petSize: jobMaster.petSize || `${faceLengthMm + 10} mm`,
    processRouting: processRouting
  };

  const metaEnvelope = {
    inkGsm: inkGsmVal,
    adhesiveGsm: adhesiveGsmVal,
    pressMarks,
    layers,
    processRouting,
    skuCode,
    clientName,
    jobName
  };
  const combinedJobName = `${jobName || 'Untitled Job'} ||| ${JSON.stringify(metaEnvelope)}`;

  const legacyPayload = {
    id,
    sku_code: skuCode,
    job_name: combinedJobName,
    client_name: clientName,
    film_structure: structure,
    pouch_width_mm: printWidthMm,
    pouch_height_mm: pouchHeightMm,
    repeat_length_mm: repeatLengthMm,
    colors_count: colorsCount,
    cylinder_cost: cylinderCost,
    cost_borne_by: costBorneBy,
    engraver_name: engraverName,
    job_card_file_url: fileUrl,
    artwork_url: fileUrl,
    created_at: new Date().toISOString()
  };

  const extendedPayload = {
    ...legacyPayload,
    structure,
    print_width_mm: printWidthMm,
    face_length_mm: faceLengthMm,
    pouch_open_width: Number(jobMaster.pouchOpenWidth) || 0,
    pouch_height: Number(jobMaster.pouchHeight) || 0,
    layers: Array.isArray(jobMaster.layers) ? jobMaster.layers : [],
    ink_gsm: inkGsmVal,
    adhesive_gsm: adhesiveGsmVal,
    process_routing: processRouting,
    cylinder_sku: jobMaster.cylinderSku || skuCode,
    engravures_name: engraverName,
    utilisation_limit: Number(jobMaster.utilisationLimit) || 10000,
    job_card_file_name: fileName,
    job_card_file_url: fileUrl,
    artwork_url: fileUrl,
    sil_logo: pressMarks.silLogo,
    arc_mark: pressMarks.arcMark,
    slitting_mark: pressMarks.slittingMark,
    tracker_line: pressMarks.trackerLine,
    special_instructions: pressMarks.specialInstructions,
    press_marks: pressMarks,
    chk_eyemark: pressMarks.chkEyemark,
    variant: pressMarks.variant,
    printing: pressMarks.printing,
    invoice_to: pressMarks.invoiceTo,
    shell_size: pressMarks.shellSize,
    pet_size: pressMarks.petSize,
    chk_barcode: pressMarks.chkBarcode,
    chk_orientation: pressMarks.chkOrientation,
    chk_client_approval: pressMarks.chkClientApproval,
    approved_by_head: pressMarks.approvedByHead,
    approved_head_name: pressMarks.approvedHeadName,
    approved_head_date: pressMarks.approvedHeadDate,
    creation_date: toDatabaseDate(jobMaster.creationDate)
  };

  // 1. Try extended payload with new columns (including press marks & layers) FIRST
  const { error: extErr } = await supabase.from('job_masters').upsert(extendedPayload, { onConflict: 'id' });
  if (extErr) handleSupabaseError(extErr, 'job_masters');
}

export async function deleteJobMasterFromSupabase(jobMasterId) {
  if (!isSupabaseConfigured() || !jobMasterId) {
    throw new Error("Cannot delete job master: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('job_masters').delete().eq('id', jobMasterId);
  if (error) handleSupabaseError(error, 'job_masters');
}

export async function saveJobMasterBatchToSupabase(jobMasterList) {
  if (!isSupabaseConfigured() || !Array.isArray(jobMasterList) || jobMasterList.length === 0) {
    throw new Error("Cannot save job master batch: Supabase database connection is not available.");
  }
  await ensureValidSession();
  console.log(`[job_masters] Bulk syncing ${jobMasterList.length} Job Master(s) to Supabase...`);
  for (const jm of jobMasterList) {
    await saveJobMasterToSupabase(jm);
  }
}

/**
 * -----------------------------------------------------------------------------
 * 12. SALES QUOTATIONS SUPABASE OPERATIONS
 * -----------------------------------------------------------------------------
 */

export async function fetchSalesQuotations() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from('sales_quotations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      handleSupabaseError(error, 'sales_quotations');
    }

    if (!data) return [];

    return data.map(q => ({
      id: q.id,
      quotationNo: q.quotation_no,
      revisionNo: q.revision_no || 0,
      amendmentNo: q.amendment_no || 'Rev 00',
      enquiryDate: q.enquiry_date,
      estimatedDeliveryDate: q.estimated_delivery_date,
      salesManager: q.sales_manager,
      clientName: q.client_name,
      clientAddress: q.client_address,
      clientGstin: q.client_gstin,
      contactPerson: q.contact_person,
      contactPhone: q.contact_phone,
      contactEmail: q.contact_email,
      paymentTerms: q.payment_terms,
      cylinderTerms: q.cylinder_terms,
      transportTerms: q.transport_terms,
      status: q.status,
      ocnRefNo: q.ocn_ref_no || '',
      convertedDate: q.converted_date || '',
      items: q.items || [],
      termsAndConditions: q.terms_and_conditions || [],
      comments: q.comments || '',
      termsTemplateKey: q.terms_template_key || '',
      createdAt: q.created_at
    }));
  } catch (err) {
    console.error("Error fetching sales quotations from Supabase:", err);
    throw err;
  }
}

export async function saveSalesQuotationToSupabase(quotation) {
  if (!isSupabaseConfigured() || !quotation) {
    throw new Error("Cannot save sales quotation: Supabase database connection is not available.");
  }

  await ensureValidSession();

  const payload = {
    id: quotation.id,
    quotation_no: quotation.quotationNo,
    revision_no: quotation.revisionNo || 0,
    amendment_no: quotation.amendmentNo || 'Rev 00',
    enquiry_date: quotation.enquiryDate,
    estimated_delivery_date: quotation.estimatedDeliveryDate,
    sales_manager: quotation.salesManager,
    client_name: quotation.clientName,
    client_address: quotation.clientAddress,
    client_gstin: quotation.clientGstin,
    contact_person: quotation.contactPerson,
    contact_phone: quotation.contactPhone,
    contact_email: quotation.contactEmail,
    payment_terms: quotation.paymentTerms,
    cylinder_terms: quotation.cylinderTerms,
    transport_terms: quotation.transportTerms,
    status: quotation.status,
    ocn_ref_no: quotation.ocnRefNo || '',
    converted_date: quotation.convertedDate || '',
    items: quotation.items || [],
    terms_and_conditions: quotation.termsAndConditions || [],
    comments: quotation.comments || '',
    terms_template_key: quotation.termsTemplateKey || null
  };

  const { data, error } = await supabase
    .from('sales_quotations')
    .upsert([payload], { onConflict: 'id' })
    .select();

  if (error) {
    handleSupabaseError(error, 'sales_quotations');
  }

  return data ? data[0] : null;
}

export async function deleteSalesQuotationFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete sales quotation: Supabase database connection is not available.");
  }

  await ensureValidSession();

  const { error } = await supabase
    .from('sales_quotations')
    .delete()
    .eq('id', id);

  if (error) {
    handleSupabaseError(error, 'sales_quotations');
  }

  return true;
}

/**
 * -----------------------------------------------------------------------------
 * 13. INKS MASTER SUPABASE OPERATIONS
 * -----------------------------------------------------------------------------
 */

export async function fetchInks() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from('inks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      handleSupabaseError(error, 'inks');
    }

    if (!data) return [];

    return data.map(mapInkRowToMaster);
  } catch (err) {
    console.error("Error fetching inks from Supabase:", err);
    throw err;
  }
}

export async function saveInkToSupabase(ink) {
  if (!isSupabaseConfigured() || !ink) {
    throw new Error("Cannot save ink: Supabase database connection is not available.");
  }

  await ensureValidSession();

  const payload = {
    ...mapInkMasterToRow(ink),
    last_updated: new Date().toISOString()
  };

  const { error } = await supabase.from('inks').upsert(payload, { onConflict: 'id' });
  if (error) {
    handleSupabaseError(error, 'inks');
  }
  return true;
}

export async function deleteInkFromSupabase(inkId) {
  if (!isSupabaseConfigured() || !inkId) {
    throw new Error("Cannot delete ink: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('inks').delete().eq('id', inkId);
  if (error) handleSupabaseError(error, 'inks');
}


// ============================================================================
// SYSTEM SETTINGS & ROLE PERMISSIONS & RBAC MATRIX (SCHEMA-INDEPENDENT)
// ============================================================================

const CLIENT_BLOCKED_SETTINGS = new Set([
  'employees',
  'employee_attendance',
  'salary_advances',
  'salary_payments',
  'email_settings',
  'role_permissions'
]);

const BUSINESS_RECORD_SETTINGS = new Set([
  'purchase_orders',
  'samyak_erp_issued_pos',
  'issued_pos',
  'stock_adjustments',
  'custom_barcodes',
  'po_discrepancy_resolutions',
  'scrap_disposals',
  'sfg_scrap_items',
  'sfg_qc_hold_items',
  'material_indents',
  'machine_issues',
  'consumables',
  'store_issue_transactions',
  'printing_press_queue_order',
  'printing_press_machine_assignments',
  'printing_press_active_running_job',
  'dispatch_shipments',
  'delivery_challans',
  'certificate_of_analyses',
  'pellet_inwards',
  'pellet_consumptions',
  'audit_logs',
  'email_templates'
]);

export async function saveSystemSetting(key, value) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase database connection is not available.');
  }
  const normalized = String(key || '');
  if (CLIENT_BLOCKED_SETTINGS.has(normalized.toLowerCase()) || BUSINESS_RECORD_SETTINGS.has(normalized) || normalized.startsWith('jobcard_')) {
    throw new Error(`'${key}' is stored in its own table, not system_settings.`);
  }
  await ensureValidSession();
  const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const { error: sysErr } = await supabase
    .from('system_settings')
    .upsert({ setting_key: key, setting_value: strVal, updated_at: new Date().toISOString() }, { onConflict: 'setting_key' });
  if (sysErr) handleSupabaseError(sysErr, 'system_settings');
}

export async function fetchAllSystemSettings() {
  if (!isSupabaseConfigured()) return {};
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value');
    if (error || !data) return {};
    const result = {};
    for (const item of data) {
      if (!item || !item.setting_key) continue;
      try {
        result[item.setting_key] = JSON.parse(item.setting_value);
      } catch (e) {
        result[item.setting_key] = item.setting_value;
      }
    }
    return result;
  } catch (err) {
    console.warn('[System Setting] Exception fetching all settings:', err?.message || err);
    return {};
  }
}

export async function fetchSystemSetting(key) {
  if (!isSupabaseConfigured()) return null;
  try {
    // 1. Fetch from system_settings table
    const { data: sysData, error: sysErr } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', key)
      .maybeSingle();

    if (sysData && sysData.setting_value) {
      try {
        return JSON.parse(sysData.setting_value);
      } catch (e) {
        return sysData.setting_value;
      }
    }
  } catch (err) {
    console.warn(`[System Setting] Exception fetching setting '${key}':`, err.message);
  }
  return null;
}

export async function fetchFilmSubstratesFromSupabase() {
  if (!isSupabaseConfigured()) return null;
  try {
    // 1. Dedicated film_substrates table
    const { data, error } = await supabase.from('film_substrates').select('*').order('name');
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(item => ({
        id: item.id || `sub-${item.name}`,
        name: item.name,
        density: Number(item.density) || 1.0,
        category: item.category || 'Film Substrates',
        description: item.description || ''
      }));
    }

    // 2. System settings key
    const settingVal = await fetchSystemSetting('film_substrates_master');
    if (settingVal) {
      const list = typeof settingVal === 'string' ? JSON.parse(settingVal) : settingVal;
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {
    console.warn("[Film Substrates] Exception fetching film substrates from Supabase:", e.message);
  }
  return null;
}

export async function saveFilmSubstratesToSupabase(substratesList) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase database connection is not available.');
  }
  if (!Array.isArray(substratesList)) {
    throw new Error('Film substrate list is invalid.');
  }
  try {
    await ensureValidSession();
    const payloads = substratesList.map(item => ({
      id: String(item.id || `sub-${item.name}`),
      name: item.name,
      density: Number(item.density) || 1.0,
      category: item.category || 'Film Substrates',
      description: item.description || '',
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabase.from('film_substrates').upsert(payloads, { onConflict: 'id' });
    if (error) handleSupabaseError(error, 'film_substrates');
  } catch (e) {
    if (e?.code || e?.message) throw e;
    handleSupabaseError(e, 'film_substrates');
  }
}

function enforceRoleBoundaries(role, permissions) {
  return applyAuditLogBoundary({ [role]: permissions })[role];
}

export async function saveRolePermissionsToSupabase(rolePermissions) {
  if (!isSupabaseConfigured() || !rolePermissions) {
    throw new Error('Supabase database connection is not available.');
  }
  await ensureValidSession();
  const rows = Object.entries(rolePermissions).map(([role, permissions]) => ({
    role,
    permissions: enforceRoleBoundaries(role, permissions),
    updated_at: new Date().toISOString()
  }));
  const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role' });
  if (error) handleSupabaseError(error, 'role_permissions');
}

export async function fetchRolePermissionsFromSupabase() {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.from('role_permissions').select('role, permissions');
  if (!error && Array.isArray(data) && data.length > 0) {
    const map = {};
    data.forEach(row => {
      if (row?.role) map[row.role] = row.permissions || {};
    });
    return map;
  }
  return null;
}

export async function saveEmailSettingsToSupabase(config) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase database connection is not available.');
  }
  try {
    await ensureValidSession();
    const payload = {
      id: 'default',
      smtp_host: config.smtpHost || 'smtp.hostinger.com',
      smtp_port: parseInt(config.smtpPort || 465, 10),
      smtp_secure: config.smtpSecure !== false,
      smtp_user: config.smtpUser || 'admin@samyakinternational.in',
      sender_name: config.senderName || 'Samyak International ERP',
      admin_email: config.adminEmail || 'admin@samyakinternational.in',
      plant_manager_email: config.plantManagerEmail || 'admin@samyakinternational.in',
      purchase_email: config.purchaseEmail || 'purchase@samyakinternational.in',
      dispatch_email: config.dispatchEmail || 'dispatch@samyakinternational.in',
      last_updated: new Date().toISOString()
    };
    const { error } = await supabase.from('email_settings').upsert(payload, { onConflict: 'id' });
    if (error) handleSupabaseError(error, 'email_settings');
  } catch (err) {
    if (err?.code || err?.message) throw err;
    handleSupabaseError(err, 'email_settings');
  }
}

export async function fetchEmailSettingsFromSupabase() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase.from('email_settings').select('*').eq('id', 'default').maybeSingle();
    if (data) {
      return {
        smtpHost: data.smtp_host,
        smtpPort: data.smtp_port,
        smtpSecure: data.smtp_secure,
        smtpUser: data.smtp_user,
        smtpPass: '',
        senderName: data.sender_name,
        adminEmail: data.admin_email,
        plantManagerEmail: data.plant_manager_email,
        purchaseEmail: data.purchase_email,
        dispatchEmail: data.dispatch_email
      };
    }
  } catch (e) {
    console.warn('[email_settings] Table fetch note:', e.message);
  }
  return null;
}

export async function saveEmailTemplatesToSupabase(templates) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase database connection is not available.');
  }
  if (!templates) throw new Error('Email templates are missing.');
  try {
    await ensureValidSession();
    const rows = Object.values(templates).map(t => ({
      key: t.key,
      name: t.name || t.key,
      event_title: t.eventTitle || '',
      subject: t.subject || '',
      badge_text: t.badgeText || '',
      badge_bg_color: t.badgeBgColor || '#0284c7',
      to_email: t.toEmail || '',
      cc_email: t.ccEmail || '',
      enabled: t.enabled !== false,
      content_html: t.contentHtml || '',
      footer_note: t.footerNote || '',
      last_updated: new Date().toISOString()
    }));

    const { error } = await supabase.from('email_templates').upsert(rows, { onConflict: 'key' });
    if (error) handleSupabaseError(error, 'email_templates');
  } catch (err) {
    if (err?.code || err?.message) throw err;
    handleSupabaseError(err, 'email_templates');
  }
}

export async function fetchEmailTemplatesFromSupabase() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase.from('email_templates').select('*');
    if (data && data.length > 0) {
      const templatesMap = {};
      data.forEach(r => {
        templatesMap[r.key] = {
          key: r.key,
          name: r.name,
          eventTitle: r.event_title,
          subject: r.subject,
          badgeText: r.badge_text,
          badgeBgColor: r.badge_bg_color,
          toEmail: r.to_email,
          ccEmail: r.cc_email,
          enabled: r.enabled,
          contentHtml: r.content_html,
          footerNote: r.footer_note
        };
      });
      return templatesMap;
    }
  } catch (e) {
    console.warn('[email_templates] Table fetch note:', e.message);
  }
  return await fetchSystemSetting('email_templates');
}

// ==========================================
// EMPLOYEES & PAYROLL SUPABASE INTEGRATION
// ==========================================

export async function fetchEmployeesFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(r => ({
          id: r.id,
          empCode: r.emp_code || r.empCode,
          fullName: r.full_name || r.fullName,
          gender: r.gender,
          dob: r.dob,
          phone: r.phone,
          email: r.email,
          department: r.department,
          designation: r.designation,
          joiningDate: r.joining_date || r.joiningDate,
          status: r.status,
          shiftDurationHours: Number(r.shift_duration_hours || r.shiftDurationHours) || 12,
          defaultShift: r.default_shift || r.defaultShift,
          address: r.address,
          aadharNo: r.aadhar_no || r.aadharNo,
          panNo: r.pan_no || r.panNo,
          uanNo: r.uan_no || r.uanNo,
          esicNo: r.esic_no || r.esicNo,
          emergencyContact: r.emergency_contact || r.emergencyContact,
          bankDetails: r.bank_details || r.bankDetails || {},
          salaryStructure: r.salary_structure || r.salaryStructure || {},
          offboarding: r.offboarding || {}
        }));
      } else if (error) {
        handleSupabaseError(error, 'employees');
      }
    } catch (err) {
      handleSupabaseError(err, 'employees');
    }

    return tableRecords;
  } catch (e) {
    console.error("Error fetching employees from Supabase:", e);
    throw e;
  }
}

export async function saveEmployeeToSupabase(employee) {
  if (!isSupabaseConfigured() || !employee) {
    throw new Error("Cannot save employee: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const row = {
    id: employee.id,
    emp_code: employee.empCode || employee.id,
    full_name: employee.fullName,
    gender: employee.gender,
    dob: employee.dob,
    phone: employee.phone,
    email: employee.email,
    department: employee.department,
    designation: employee.designation,
    joining_date: employee.joiningDate,
    status: employee.status,
    shift_duration_hours: employee.shiftDurationHours || 12,
    default_shift: employee.defaultShift,
    address: employee.address,
    aadhar_no: employee.aadharNo,
    pan_no: employee.panNo,
    uan_no: employee.uanNo,
    esic_no: employee.esicNo,
    emergency_contact: employee.emergencyContact,
    bank_details: employee.bankDetails || {},
    salary_structure: employee.salaryStructure || {},
    offboarding: employee.offboarding || {},
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('employees').upsert(row, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'employees');
}

export async function deleteEmployeeFromSupabase(employeeId) {
  if (!isSupabaseConfigured() || !employeeId) {
    throw new Error("Cannot delete employee: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('employees').delete().eq('id', employeeId);
  if (error) handleSupabaseError(error, 'employees');
  await supabase.from('employee_attendance').delete().eq('employee_id', employeeId);
  await supabase.from('salary_advances').delete().eq('employee_id', employeeId);
  await supabase.from('salary_payments').delete().eq('employee_id', employeeId);
}

export async function fetchEmployeeAttendanceFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('employee_attendance').select('*').order('date', { ascending: false });
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(mapEmployeeAttendanceRow).filter(Boolean);
      } else if (error) {
        handleSupabaseError(error, 'employee_attendance');
      }
    } catch (err) {
      handleSupabaseError(err, 'employee_attendance');
    }

    return tableRecords;
  } catch (e) {
    console.error("Error fetching employee attendance from Supabase:", e);
    throw e;
  }
}

export async function saveEmployeeAttendanceToSupabase(record) {
  if (!isSupabaseConfigured() || !record) {
    throw new Error("Cannot save employee attendance: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const row = buildEmployeeAttendanceRow(record);

  const { error } = await supabase.from('employee_attendance').upsert(row, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'employee_attendance');
}

export async function fetchSalaryAdvancesFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('salary_advances').select('*').order('request_date', { ascending: false });
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(r => ({
          id: r.id,
          employeeId: r.employee_id || r.employeeId,
          employeeName: r.employee_name || r.employeeName,
          department: r.department,
          requestDate: r.request_date || r.requestDate,
          advanceAmount: Number(r.advance_amount || r.advanceAmount) || 0,
          repaymentTenureMonths: Number(r.repayment_tenure_months || r.repaymentTenureMonths) || 1,
          monthlyEmiAmount: Number(r.monthly_emi_amount || r.monthlyEmiAmount) || 0,
          reason: r.reason || '',
          status: r.status,
          approvedBy: r.approved_by || r.approvedBy || '',
          approvedDate: r.approved_date || r.approvedDate || '',
          disbursedDate: r.disbursed_date || r.disbursedDate || '',
          disbursedBy: r.disbursed_by || r.disbursedBy || '',
          paymentReference: r.payment_reference || r.paymentReference || '',
          policyOverride: Boolean(r.policy_override ?? r.policyOverride),
          policyOverrideBy: r.policy_override_by || r.policyOverrideBy || '',
          policyOverrideAt: r.policy_override_at || r.policyOverrideAt || '',
          totalRecoveredAmount: Number(r.total_recovered_amount || r.totalRecoveredAmount) || 0,
          remainingBalance: Number(r.remaining_balance || r.remainingBalance) || 0,
          deductionHistory: r.deduction_history || r.deductionHistory || []
        }));
      } else if (error) {
        handleSupabaseError(error, 'salary_advances');
      }
    } catch (err) {
      handleSupabaseError(err, 'salary_advances');
    }

    return tableRecords;
  } catch (e) {
    console.error("Error fetching salary advances from Supabase:", e);
    throw e;
  }
}

export async function saveSalaryAdvanceToSupabase(adv) {
  if (!isSupabaseConfigured() || !adv) {
    throw new Error("Cannot save salary advance: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const row = toSalaryAdvanceRow(adv);

  const { error } = await supabase.from('salary_advances').upsert(row, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'salary_advances');
}

export async function fetchSalaryPaymentsFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('salary_payments').select('*').order('payment_timestamp', { ascending: false });
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(r => ({
          id: r.id,
          monthKey: r.month_key || r.monthKey,
          employeeId: r.employee_id || r.employeeId,
          employeeName: r.employee_name || r.employeeName,
          empCode: r.emp_code || r.empCode,
          department: r.department,
          netAmountPaid: Number(r.net_amount_paid || r.netAmountPaid) || 0,
          paymentDate: r.payment_date || r.paymentDate,
          paymentTime: r.payment_time || r.paymentTime,
          paymentTimestamp: r.payment_timestamp || r.paymentTimestamp,
          paymentMode: r.payment_mode || r.paymentMode || 'Bank Transfer (NEFT)',
          transactionReference: r.transaction_reference || r.transactionReference || '',
          bankName: r.bank_name || r.bankName || '',
          accountNumber: r.account_number || r.accountNumber || '',
          status: r.status || 'Paid',
          disbursedBy: r.disbursed_by || r.disbursedBy || '',
          notes: r.notes || '',
          createdAt: r.created_at || r.createdAt
        }));
      } else if (error) {
        handleSupabaseError(error, 'salary_payments');
      }
    } catch (err) {
      handleSupabaseError(err, 'salary_payments');
    }

    return tableRecords;
  } catch (e) {
    console.error("Error fetching salary payments from Supabase:", e);
    throw e;
  }
}

export async function saveSalaryPaymentToSupabase(payment) {
  if (!isSupabaseConfigured() || !payment) {
    throw new Error("Cannot save salary payment: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const row = {
    id: payment.id,
    month_key: payment.monthKey,
    employee_id: payment.employeeId,
    employee_name: payment.employeeName,
    emp_code: payment.empCode || '',
    department: payment.department || '',
    net_amount_paid: payment.netAmountPaid,
    payment_date: payment.paymentDate,
    payment_time: payment.paymentTime,
    payment_timestamp: payment.paymentTimestamp || `${payment.paymentDate}T${payment.paymentTime}`,
    payment_mode: payment.paymentMode || 'Bank Transfer (NEFT)',
    transaction_reference: payment.transactionReference || '',
    bank_name: payment.bankName || '',
    account_number: payment.accountNumber || '',
    status: payment.status || 'Paid',
    disbursed_by: payment.disbursedBy || '',
    notes: payment.notes || '',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('salary_payments').upsert(row, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'salary_payments');
}

export async function deleteGRNFromSupabase(grnId) {
  if (!isSupabaseConfigured() || !grnId) {
    throw new Error("Cannot delete GRN: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('grns').delete().eq('id', grnId);
  if (error) {
    handleSupabaseError(error, 'grns');
  }
}

export async function deleteProductionRecordFromSupabase(recId) {
  if (!isSupabaseConfigured() || !recId) {
    throw new Error("Cannot delete production record: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('production_records').delete().eq('id', recId);
  if (error) {
    handleSupabaseError(error, 'production_records');
  }
}

// ============================================================================
// SEMI-FINISHED GOODS (SFG) GOODS
// ============================================================================

export async function fetchSFGGoodsFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    const { data, error } = await supabase.from('sfg_goods').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'sfg_goods');
    }
    if (!data) return [];
    return data.map(item => {
      let extra = {};
      if (item.notes && item.notes.startsWith('{')) {
        try { extra = JSON.parse(item.notes); } catch (e) {}
      }
      const netKg = Number(item.total_net_kg ?? extra.totalNetKg ?? 0) || 0;
      const consumedKg = Number(extra.consumedKg ?? item.consumed_kg ?? 0) || 0;
      const dispatchedKg = Number(extra.dispatchedKg ?? 0) || 0;
      const availableKg = extra.availableKg !== undefined 
        ? Number(extra.availableKg) 
        : Math.max(0, netKg - consumedKg - dispatchedKg);
      
      let computedStatus = item.status || extra.status || 'In Stock (WIP)';
      if (item.status === 'Dispatched' || item.status === 'Partially Dispatched' || item.status === 'Ready for Dispatch') {
        computedStatus = item.status;
      } else if (extra.status === 'Dispatched' || extra.status === 'Partially Dispatched' || extra.status === 'Ready for Dispatch') {
        computedStatus = extra.status;
      } else if (consumedKg > 0) {
        computedStatus = availableKg <= 0 ? 'Fully Consumed' : 'Partially Consumed';
      }

      const isFg = item.sfg_type?.includes('Finished') || extra.rollType === 'FG' || extra.category?.includes('Finished') || (item.sfg_batch_code || '').startsWith('FG-');

      return {
        id: String(item.id),
        sfgBatchCode: item.sfg_batch_code || extra.sfgBatchCode || item.id,
        sfgType: item.sfg_type || extra.sfgType || (isFg ? 'Finished Goods (FG)' : 'Printed Rolls'),
        category: extra.category || (isFg ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)'),
        rollType: extra.rollType || (isFg ? 'FG' : 'SFG'),
        jobId: item.job_id || extra.jobId || '',
        orderId: item.order_id || extra.orderId || '',
        jobName: item.job_name || extra.jobName || 'Untitled Job',
        jobCode: item.job_code || extra.jobCode || '',
        clientName: item.client_name || extra.clientName || '',
        structure: item.structure || extra.structure || '',
        filmType: item.film_type || extra.filmType || '',
        micron: Number(item.micron ?? extra.micron ?? 0) || 0,
        widthMm: Number(item.width_mm ?? extra.widthMm ?? 0) || 0,
        totalGrossKg: Number(item.total_gross_kg ?? extra.totalGrossKg ?? 0) || 0,
        grossWeightKg: Number(extra.grossWeightKg ?? item.total_gross_kg ?? netKg) || 0,
        tareWeightKg: Number(extra.tareWeightKg ?? 0) || 0,
        totalNetKg: netKg,
        consumedKg: consumedKg,
        dispatchedKg: dispatchedKg,
        availableKg: availableKg,
        pouchCount: Number(extra.pouchCount || 0) || 0,
        totalMeters: Number(item.total_meters ?? extra.totalMeters ?? 0) || 0,
        rollsCount: Number(item.rolls_count ?? extra.rollsCount ?? 1) || 1,
        machineName: item.machine_name || extra.machineName || '',
        operatorName: item.operator_name || extra.operatorName || '',
        shift: item.shift || extra.shift || '',
        storageBay: item.storage_bay || extra.storageBay || 'Bay A',
        productionDate: item.production_date || extra.productionDate || new Date().toISOString().split('T')[0],
        unitValuationRate: Number(item.unit_valuation_rate ?? extra.unitValuationRate ?? 0) || 0,
        status: computedStatus,
        notes: extra.notesText || (item.notes && !item.notes.startsWith('{') ? item.notes : ''),
        consumptionHistory: Array.isArray(extra.consumptionHistory) ? extra.consumptionHistory : [],
        balanceReason: extra.balanceReason || '',
        balanceNote: extra.balanceNote || '',
        balanceKeptKg: Number(extra.balanceKeptKg) || 0,
        balanceQcHoldKg: Number(extra.balanceQcHoldKg) || 0,
        createdAt: item.created_at || new Date().toISOString(),
        ...(extra.parentSfgBatchCode ? {
          parentSfgBatchCode: extra.parentSfgBatchCode,
          parentBarcode: extra.parentBarcode || extra.parentSfgBatchCode
        } : {}),
        isPrintedLot: Boolean(extra.isPrintedLot) || String(item.sfg_batch_code || '').startsWith('SFG-LOT-'),
        childRolls: Array.isArray(extra.childRolls) ? extra.childRolls : [],
        inputBarcodeIds: Array.isArray(extra.inputBarcodeIds) ? extra.inputBarcodeIds : [],
        printedAllocations: Array.isArray(extra.printedAllocations) ? extra.printedAllocations : [],
        jobMasterId: extra.jobMasterId || ''
      };
    });
  } catch (err) {
    console.error('Error fetching SFG goods from Supabase:', err);
    throw err;
  }
}

export function buildSfgNotesEnvelope(item, overrides = {}) {
  const sfgBatchCode = overrides.sfgBatchCode ?? (item?.sfgBatchCode || item?.id || '');
  const netKg = overrides.netKg ?? (Number(item?.totalNetKg ?? item?.netWeightKg ?? 0) || 0);
  const consumedKg = overrides.consumedKg ?? (Number(item?.consumedKg ?? 0) || 0);
  const dispatchedKg = overrides.dispatchedKg ?? (Number(item?.dispatchedKg ?? 0) || 0);
  const availableKg = overrides.availableKg ?? (
    item?.availableKg !== undefined
      ? Number(item.availableKg)
      : Math.max(0, netKg - consumedKg - dispatchedKg)
  );
  let computedStatus = overrides.computedStatus;
  if (!computedStatus) {
    computedStatus = item?.status || 'In Stock (WIP)';
    if (item?.status === 'Dispatched' || item?.status === 'Partially Dispatched' || item?.status === 'Ready for Dispatch') {
      computedStatus = item.status;
    } else if (consumedKg > 0) {
      computedStatus = availableKg <= 0 ? 'Fully Consumed' : 'Partially Consumed';
    }
  }
  const isFg = overrides.isFg ?? (
    item?.sfgType?.includes('Finished') || item?.rollType === 'FG' || item?.category?.includes('Finished') || String(sfgBatchCode).startsWith('FG-')
  );
  const notesBody = {
    sfgBatchCode,
    sfgType: item?.sfgType || (isFg ? 'Finished Goods (FG)' : 'Printed Rolls'),
    category: item?.category || (isFg ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)'),
    rollType: item?.rollType || (isFg ? 'FG' : 'SFG'),
    jobId: item?.jobId,
    orderId: item?.orderId,
    jobName: item?.jobName,
    jobCode: item?.jobCode,
    clientName: item?.clientName,
    structure: item?.structure,
    filmType: item?.filmType,
    micron: item?.micron,
    widthMm: item?.widthMm,
    totalGrossKg: item?.totalGrossKg ?? item?.grossWeightKg ?? netKg,
    grossWeightKg: item?.grossWeightKg ?? item?.totalGrossKg ?? netKg,
    tareWeightKg: item?.tareWeightKg ?? 0,
    totalNetKg: netKg,
    consumedKg: consumedKg,
    dispatchedKg: dispatchedKg,
    availableKg: availableKg,
    pouchCount: Number(item?.pouchCount || 0),
    totalMeters: item?.totalMeters,
    rollsCount: item?.rollsCount,
    machineName: item?.machineName,
    operatorName: item?.operatorName,
    shift: item?.shift,
    storageBay: item?.storageBay,
    productionDate: item?.productionDate,
    status: computedStatus,
    notesText: item?.notes || '',
    consumptionHistory: item?.consumptionHistory || [],
    balanceReason: item?.balanceReason || '',
    balanceNote: item?.balanceNote || '',
    balanceKeptKg: Number(item?.balanceKeptKg) || 0,
    balanceQcHoldKg: Number(item?.balanceQcHoldKg) || 0,
    isPrintedLot: Boolean(item?.isPrintedLot),
    childRolls: Array.isArray(item?.childRolls) ? item.childRolls : [],
    inputBarcodeIds: Array.isArray(item?.inputBarcodeIds) ? item.inputBarcodeIds : [],
    printedAllocations: Array.isArray(item?.printedAllocations) ? item.printedAllocations : [],
    jobMasterId: item?.jobMasterId || item?.jobId || ''
  };
  if (item?.parentSfgBatchCode) {
    notesBody.parentSfgBatchCode = item.parentSfgBatchCode;
    notesBody.parentBarcode = item.parentBarcode || item.parentSfgBatchCode;
  }
  return JSON.stringify(notesBody);
}

export async function saveSFGGoodToSupabase(item) {
  if (!isSupabaseConfigured() || !item) {
    throw new Error("Cannot save SFG good: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const sfgBatchCode = item.sfgBatchCode || item.id || `SFG-${Date.now()}`;
  const netKg = Number(item.totalNetKg ?? item.netWeightKg ?? 0) || 0;
  const consumedKg = Number(item.consumedKg ?? 0) || 0;
  const dispatchedKg = Number(item.dispatchedKg ?? 0) || 0;
  const availableKg = item.availableKg !== undefined 
    ? Number(item.availableKg) 
    : Math.max(0, netKg - consumedKg - dispatchedKg);

  let computedStatus = item.status || 'In Stock (WIP)';
  if (item.status === 'Dispatched' || item.status === 'Partially Dispatched' || item.status === 'Ready for Dispatch') {
    computedStatus = item.status;
  } else if (consumedKg > 0) {
    computedStatus = availableKg <= 0 ? 'Fully Consumed' : 'Partially Consumed';
  }

  const isFg = item.sfgType?.includes('Finished') || item.rollType === 'FG' || item.category?.includes('Finished') || sfgBatchCode.startsWith('FG-');

  const notesEnvelope = buildSfgNotesEnvelope(item, {
    sfgBatchCode,
    isFg,
    netKg,
    consumedKg,
    dispatchedKg,
    availableKg,
    computedStatus
  });

  const payload = {
    sfg_batch_code: sfgBatchCode,
    sfg_type: item.sfgType || (isFg ? 'Finished Goods (FG)' : 'Printed Rolls'),
    job_id: item.jobId || item.jobMasterId || null,
    order_id: item.orderId || null,
    job_name: item.jobName || 'Untitled Job',
    job_code: item.jobCode || '',
    client_name: item.clientName || '',
    structure: item.structure || '',
    film_type: item.filmType || '',
    micron: Number(item.micron) || 0,
    width_mm: Number(item.widthMm) || 0,
    total_gross_kg: Number(item.totalGrossKg ?? item.grossWeightKg ?? netKg) || 0,
    gross_weight_kg: Number(item.grossWeightKg ?? item.totalGrossKg ?? netKg) || 0,
    tare_weight_kg: Number(item.tareWeightKg ?? 0) || 0,
    total_net_kg: netKg,
    consumed_kg: consumedKg,
    available_kg: availableKg,
    total_meters: Number(item.totalMeters) || 0,
    rolls_count: Number(item.rollsCount) || 1,
    machine_name: item.machineName || '',
    operator_name: item.operatorName || '',
    shift: item.shift || '',
    storage_bay: item.storageBay || (isFg ? 'FG Warehouse' : 'Bay A'),
    production_date: toDatabaseDate(item.productionDate),
    status: computedStatus,
    notes: notesEnvelope,
    updated_at: new Date().toISOString()
  };

  // sfg_goods.id is a uuid. A barcode such as SFG-BC-... must not be written into it.
  // Send the existing uuid, or a new one. The column default gen_random_uuid()
  // is only a backstop if id is omitted.
  payload.id = item.id && isUuid(item.id) ? item.id : crypto.randomUUID();

  console.log('[sfg_goods] Upserting item:', sfgBatchCode, 'Status:', computedStatus);
  const printedLot = Boolean(item.isPrintedLot) || String(sfgBatchCode).startsWith('SFG-LOT-');
  if (printedLot) {
    // Ending a print run writes this lot. The function keeps consumed and
    // dispatched kilograms when the caller only has view access to the store.
    const { error: rpcError } = await supabase.rpc('save_printing_sfg_lot', { p_item: payload });
    if (!rpcError) return;
    const rpcMessage = String(rpcError.message || rpcError.details || '');
    const missingFn = /save_printing_sfg_lot|schema cache|could not find the function|PGRST202/i.test(rpcMessage);
    if (!missingFn) handleSupabaseError(rpcError, 'sfg_goods');
  }
  const { error } = await supabase.from('sfg_goods').upsert(payload, { onConflict: 'sfg_batch_code' });
  if (error) {
    handleSupabaseError(error, 'sfg_goods');
  }
}

export async function deleteSFGGoodFromSupabase(idOrBatchCode) {
  if (!isSupabaseConfigured() || !idOrBatchCode) {
    throw new Error("Cannot delete SFG good: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const key = String(idOrBatchCode);
  // Comparing a barcode to the uuid primary key raises "invalid input syntax for type uuid".
  const query = isUuid(key)
    ? supabase.from('sfg_goods').delete().eq('id', key)
    : supabase.from('sfg_goods').delete().eq('sfg_batch_code', key);
  const { error } = await query;
  if (error) {
    handleSupabaseError(error, 'sfg_goods');
  }
}

// ============================================================================
// DELIVERY CHALLANS & COA SUPABASE PERSISTENCE (DUAL-LAYER ROBUST PERSISTENCE)
// ============================================================================

export async function fetchDeliveryChallansFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('delivery_challans').select('*');
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(r => r.payload || r.details || r);
      } else if (error) {
        handleSupabaseError(error, 'delivery_challans');
      }
    } catch (err) {
      throw err;
    }

    tableRecords.sort((a, b) => {
      const timeA = new Date(a.createdDate || a.dispatchDateTime || a.date || 0).getTime();
      const timeB = new Date(b.createdDate || b.dispatchDateTime || b.date || 0).getTime();
      return timeB - timeA;
    });
    return tableRecords;
  } catch (e) {
    console.error("Error fetching delivery challans from Supabase:", e);
    throw e;
  }
}

export async function saveDeliveryChallanToSupabase(dc) {
  if (!isSupabaseConfigured() || !dc) {
    throw new Error("Cannot save delivery challan: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('delivery_challans').upsert({
    id: String(dc.id),
    challan_no: dc.challanNo || '',
    client_name: dc.clientName || dc.partyName || '',
    payload: dc,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'delivery_challans');
}

export async function deleteDeliveryChallanFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete delivery challan: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('delivery_challans').delete().eq('id', String(id));
  if (error) handleSupabaseError(error, 'delivery_challans');
}

export async function fetchCertificatesOfAnalysisFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('certificate_of_analyses').select('*');
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(r => r.payload || r.details || r);
      } else if (error) {
        handleSupabaseError(error, 'certificate_of_analyses');
      }
    } catch (err) {
      throw err;
    }

    tableRecords.sort((a, b) => new Date(b.createdDate || b.testDate || 0) - new Date(a.createdDate || a.testDate || 0));
    return tableRecords;
  } catch (e) {
    console.error("Error fetching certificate of analyses from Supabase:", e);
    throw e;
  }
}

export async function saveCertificateOfAnalysisToSupabase(coa) {
  if (!isSupabaseConfigured() || !coa) {
    throw new Error("Cannot save certificate of analysis: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('certificate_of_analyses').upsert({
    id: String(coa.id),
    coa_no: coa.coaNo || '',
    job_name: coa.jobName || '',
    customer_name: coa.customerName || '',
    payload: coa,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'certificate_of_analyses');
}

export async function deleteCertificateOfAnalysisFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete certificate of analysis: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('certificate_of_analyses').delete().eq('id', String(id));
  if (error) handleSupabaseError(error, 'certificate_of_analyses');
}

// ============================================================================
// PELLET FUEL STOCK & BOILER CONSUMPTION MANAGEMENT
// ============================================================================

export async function fetchPelletInwardsFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('pellet_inwards').select('*');
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(pelletInwardFromRow);
      } else if (error) {
        handleSupabaseError(error, 'pellet_inwards');
      }
    } catch (err) {
      throw err;
    }
    tableRecords.sort((a, b) => new Date(b.inwardDate || b.createdDate || 0) - new Date(a.inwardDate || a.createdDate || 0));
    return tableRecords;
  } catch (e) {
    console.error("Error fetching pellet inwards from Supabase:", e);
    throw e;
  }
}

export async function savePelletInwardToSupabase(item) {
  if (!isSupabaseConfigured() || !item) {
    throw new Error("Cannot save pellet inward: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('pellet_inwards').upsert({
    id: String(item.id),
    grn_no: item.grnNo || '',
    inward_date: item.inwardDate || new Date().toISOString().split('T')[0],
    inward_qty_kg: Number(item.inwardQtyKg) || 0,
    unit_cost_per_kg: Number(item.unitCostPerKg) || 0,
    total_amount: Number(item.totalAmount) || 0,
    vehicle_no: item.vehicleNo || null,
    payload: item,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'pellet_inwards');
}

export async function deletePelletInwardFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete pellet inward: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('pellet_inwards').delete().eq('id', String(id));
  if (error) handleSupabaseError(error, 'pellet_inwards');
}

export async function fetchPelletConsumptionsFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  try {
    let tableRecords = [];
    try {
      const { data, error } = await supabase.from('pellet_consumptions').select('*');
      if (!error && Array.isArray(data)) {
        tableRecords = data.map(pelletConsumptionFromRow);
      } else if (error) {
        handleSupabaseError(error, 'pellet_consumptions');
      }
    } catch (err) {
      throw err;
    }
    tableRecords.sort((a, b) => new Date(b.consumptionDate || b.date || 0) - new Date(a.consumptionDate || a.date || 0));
    return tableRecords;
  } catch (e) {
    console.error("Error fetching pellet consumptions from Supabase:", e);
    throw e;
  }
}

export async function savePelletConsumptionToSupabase(item) {
  if (!isSupabaseConfigured() || !item) {
    throw new Error("Cannot save pellet consumption: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('pellet_consumptions').upsert({
    id: String(item.id),
    consumption_date: item.consumptionDate || new Date().toISOString().split('T')[0],
    consumed_qty_kg: Number(item.consumedQtyKg) || 0,
    operating_hours: Number(item.operatingHours) || 0,
    reference_printing_done_kg: Number(item.referencePrintingDoneKg) || 0,
    payload: item,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'pellet_consumptions');
}

export async function allocatePelletGrnNumber(prefix) {
  if (!isSupabaseConfigured()) {
    throw new Error('Cannot reserve a pellet GRN number: Supabase database connection is not available.');
  }
  await ensureValidSession();
  const { data, error } = await supabase.rpc('allocate_pellet_grn_number', {
    p_prefix: prefix || 'SIL/GRN/26-27/'
  });
  if (error) handleSupabaseError(error, 'allocate_pellet_grn_number');
  if (!data) {
    throw new Error('The database did not return a pellet GRN number.');
  }
  return data;
}

export async function savePelletInwardWithGrn(record) {
  if (!isSupabaseConfigured() || !record) {
    throw new Error('Cannot save pellet inward: Supabase database connection is not available.');
  }
  await ensureValidSession();
  const { data, error } = await supabase.rpc('save_pellet_inward_with_grn', {
    p_record: record
  });
  if (error) handleSupabaseError(error, 'save_pellet_inward_with_grn');
  return data;
}

export async function deletePelletConsumptionFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Cannot delete pellet consumption: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const { error } = await supabase.from('pellet_consumptions').delete().eq('id', String(id));
  if (error) handleSupabaseError(error, 'pellet_consumptions');
}

// ============================================================================
// 28. PURCHASE ORDERS (STANDALONE PO MANAGEMENT MODULE)
// ============================================================================

export function sanitizePurchaseOrder(raw) {
  if (!raw) return null;
  const id = String(raw.id || raw.po_number || raw.poNumber || `PO-2026-${Date.now().toString(36).toUpperCase()}`).trim();
  const poNumber = String(raw.po_number || raw.poNumber || id).trim();

  // Parse items
  let items = [];
  if (Array.isArray(raw.items)) {
    items = raw.items;
  } else if (typeof raw.items === 'string') {
    try { items = JSON.parse(raw.items); } catch(e) { items = []; }
  }

  const sanitizedItems = items.map((it, idx) => {
    const qty = Number(it.qtyKg ?? it.qty ?? it.quantity ?? 0) || 0;
    const rate = Number(it.rate ?? it.price ?? it.unitPrice ?? 0) || 0;
    const gstPct = Number(it.gstPct ?? it.gstRate ?? it.taxPct ?? 18) || 0;
    const lineAmount = Number(it.amount ?? (qty * rate)) || (qty * rate);

    return {
      id: it.id || `item-${idx + 1}`,
      itemId: it.itemId || it.itemCode || it.code || '',
      itemDesc: it.itemDesc || it.description || it.itemName || it.name || 'Raw Material',
      category: it.category || it.materialType || 'Film Substrates',
      filmType: it.filmType || '',
      micron: it.micron || '',
      widthMm: it.widthMm ? Number(it.widthMm) : null,
      make: it.make || it.brand || '',
      hsnCode: readHsnCode(it),
      unit: it.unit || 'Kg',
      qtyKg: qty,
      rate: rate,
      gstPct: gstPct,
      amount: lineAmount,
      spec: it.spec || '',
      orderId: it.orderId || null,
      notes: it.notes || ''
    };
  });

  const totalQtyKg = Number(raw.total_qty_kg ?? raw.totalQtyKg ?? sanitizedItems.reduce((acc, it) => acc + (it.qtyKg || 0), 0)) || 0;
  const subtotal = Number(raw.subtotal ?? sanitizedItems.reduce((acc, it) => acc + (it.amount || 0), 0)) || 0;
  const taxAmount = Number(raw.tax_amount ?? raw.taxAmount ?? (subtotal * 0.18)) || 0;
  const totalAmount = Number(raw.total_amount ?? raw.totalAmount ?? (subtotal + taxAmount)) || 0;

  // Vendor resolution
  let vendorObj = raw.vendor || raw.vendor_details || {};
  if (typeof vendorObj === 'string') {
    try { vendorObj = JSON.parse(vendorObj); } catch(e) { vendorObj = { companyName: vendorObj }; }
  }
  const vendorName = raw.vendor_name || raw.vendorName || vendorObj.companyName || vendorObj.name || 'Vendor';

  return {
    id,
    poNumber,
    poDate: raw.po_date || raw.poDate || raw.date || new Date().toISOString().split('T')[0],
    deliveryDate: raw.delivery_date || raw.deliveryDate || raw.promised_delivery_date || raw.promisedDeliveryDate || '',
    promisedDeliveryDate: raw.promised_delivery_date || raw.promisedDeliveryDate || raw.delivery_date || raw.deliveryDate || '',
    vendorId: raw.vendor_id || raw.vendorId || vendorObj.id || null,
    vendorName,
    vendor: {
      id: raw.vendor_id || raw.vendorId || vendorObj.id,
      companyName: vendorName,
      name: vendorName,
      contactPerson: vendorObj.contactPerson || vendorObj.contact_person || '',
      phone: vendorObj.phone || vendorObj.contactNo || '',
      email: vendorObj.email || '',
      gstin: vendorObj.gstin || '',
      address: vendorObj.address || ''
    },
    category: raw.category || 'Film Substrates',
    items: sanitizedItems,
    totalQtyKg,
    subtotal,
    taxAmount,
    totalAmount,
    paymentTerms: raw.payment_terms || raw.paymentTerms || raw.terms || '30 Days Net',
    logisticDetails: raw.logistic_details || raw.logisticDetails || raw.freight || 'Freight Included within Indore',
    notes: raw.notes || raw.remarks || '',
    remarks: raw.remarks || raw.notes || '',
    status: raw.status || 'Pending Delivery', // 'Pending Delivery', 'Partially Received', 'Received', 'Cancelled'
    source: raw.source || 'Direct PO Module',
    linkedOrderId: raw.linked_order_id || raw.linkedOrderId || null,
    linkedOrderName: raw.linked_order_name || raw.linkedOrderName || null,
    linkedRequirements: Array.isArray(raw.linked_requirements || raw.linkedRequirements) ? (raw.linked_requirements || raw.linkedRequirements) : [],
    createdBy: raw.created_by || raw.createdBy || 'Operations Desk',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    ...revisionFieldsForStorage(raw)
  };
}

function toSqlDate(value) {
  const parsed = parseStandardDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function fetchPurchaseOrders() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('po_date', { ascending: false });

  if (error) handleSupabaseError(error, 'purchase_orders');

  const list = (data || [])
    .map(row => sanitizePurchaseOrder(row))
    .filter(clean => clean && clean.poNumber);
  list.sort((a, b) => new Date(b.poDate || b.createdAt || 0) - new Date(a.poDate || a.createdAt || 0));
  return list;
}

export async function savePurchaseOrderToSupabase(po) {
  if (!isSupabaseConfigured() || !po) {
    throw new Error("Cannot save purchase order: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const clean = sanitizePurchaseOrder(po);
  if (!clean || !clean.poNumber) {
    throw new Error("Invalid purchase order data: PO number is required.");
  }

  const dbPayload = {
    id: clean.id,
    po_number: clean.poNumber,
    po_date: toSqlDate(clean.poDate) || new Date().toISOString().split('T')[0],
    delivery_date: toSqlDate(clean.deliveryDate),
    promised_delivery_date: toSqlDate(clean.promisedDeliveryDate),
    vendor_id: clean.vendorId || null,
    vendor_name: clean.vendorName,
    vendor_details: clean.vendor || {},
    category: clean.category || 'Film Substrates',
    items: clean.items || [],
    total_qty_kg: Number(clean.totalQtyKg) || 0,
    subtotal: Number(clean.subtotal) || 0,
    tax_amount: Number(clean.taxAmount) || 0,
    total_amount: Number(clean.totalAmount) || 0,
    payment_terms: clean.paymentTerms,
    logistic_details: clean.logisticDetails,
    notes: clean.notes,
    remarks: clean.remarks,
    status: clean.status || 'Pending Delivery',
    source: clean.source || 'Direct PO Module',
    linked_order_id: clean.linkedOrderId || null,
    linked_order_name: clean.linkedOrderName || null,
    linked_requirements: clean.linkedRequirements || [],
    created_by: clean.createdBy || 'Operations Desk',
    updated_at: new Date().toISOString()
  };

  // Leave revision columns off the write until an amendment sets them.
  // A routine GRN update of an original PO then matches the previous payload.
  if (clean.revisionNo != null || clean.amendmentNo || clean.amendedAt || clean.amendedBy || clean.amendmentReason) {
    dbPayload.revision_no = clean.revisionNo;
    dbPayload.amendment_no = clean.amendmentNo;
    dbPayload.amended_at = clean.amendedAt;
    dbPayload.amended_by = clean.amendedBy;
    dbPayload.amendment_reason = clean.amendmentReason;
  }

  const { error } = await supabase
    .from('purchase_orders')
    .upsert(dbPayload, { onConflict: 'po_number' });

  if (error) handleSupabaseError(error, 'purchase_orders');
  return clean;
}

export async function fetchPurchaseOrderRevisions(poNumber) {
  if (!isSupabaseConfigured() || !poNumber) return [];
  const { data, error } = await supabase
    .from('purchase_order_revisions')
    .select('*')
    .eq('po_number', String(poNumber))
    .order('revision_no', { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    handleSupabaseError(error, 'purchase_order_revisions');
  }
  return (data || []).map(revisionFromRow).filter(Boolean);
}

export async function savePurchaseOrderRevision(entry) {
  if (!isSupabaseConfigured() || !entry) {
    throw new Error('Cannot save the purchase order revision: Supabase database connection is not available.');
  }
  await ensureValidSession();
  const { error } = await supabase
    .from('purchase_order_revisions')
    .upsert(revisionToRow(entry), { onConflict: 'id' });
  if (error) handleSupabaseError(error, 'purchase_order_revisions');
  return entry;
}

/**
 * Writes the superseded snapshot before the live row changes, then the new revision.
 * The PO number is unchanged, so GRNs that point at it stay linked.
 */
export async function saveAmendedPurchaseOrderToSupabase(updated, superseded, current) {
  if (superseded) await savePurchaseOrderRevision(superseded);
  const saved = await savePurchaseOrderToSupabase(updated);
  if (current) await savePurchaseOrderRevision(current);
  return saved;
}

export async function deletePurchaseOrderFromSupabase(poIdOrNumber) {
  if (!isSupabaseConfigured() || !poIdOrNumber) {
    throw new Error("Cannot delete purchase order: Supabase database connection is not available.");
  }
  await ensureValidSession();
  const target = String(poIdOrNumber).trim();

  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .or(`id.eq.${target},po_number.eq.${target}`);
  if (error) handleSupabaseError(error, 'purchase_orders');
}

// ============================================================================
// SEED MIGRATION: SEED DATA PUSHES HAVE BEEN PERMANENTLY DISABLED
// ============================================================================

export async function seedAllDataToSupabase() {
  return {
    success: false,
    message: 'Seed data pushes and auto-seeding are permanently disabled in production.'
  };
}

export const seedInitialDataToSupabase = seedAllDataToSupabase;

function mapBarcodeRegistryRow(row) {
  return {
    barcode: row.barcode,
    sourceModule: row.source_module,
    description: row.description || '',
    referenceNo: row.reference_no || '',
    createdAt: row.created_at || '',
    status: row.status || '',
    location: row.location || '',
    sourceTable: row.source_table || '',
    sourceColumn: row.source_column || '',
    deletedReason: row.deleted_reason || '',
    deletedAt: row.deleted_at || '',
    deletedBy: row.deleted_by || ''
  };
}

/**
 * Read public.barcode_registry when the migration is applied.
 * Returns null when the view is missing so the screen can union the
 * tables already loaded for this role. An empty list means the view
 * answered and held no rows.
 */
export async function fetchBarcodeRegistry() {
  if (!isSupabaseConfigured()) return null;
  const pageSize = 1000;
  const rows = [];
  const baseColumns = 'barcode, source_module, description, reference_no, created_at, status, location, source_table, source_column';
  const columns = `${baseColumns}, deleted_reason, deleted_at, deleted_by`;
  let selectColumns = columns;
  for (let from = 0; from < 20000; from += pageSize) {
    let { data, error } = await supabase
      .from('barcode_registry')
      .select(selectColumns)
      .range(from, from + pageSize - 1);
    if (error && selectColumns !== baseColumns) {
      selectColumns = baseColumns;
      ({ data, error } = await supabase
        .from('barcode_registry')
        .select(selectColumns)
        .range(from, from + pageSize - 1));
    }
    if (error) {
      console.warn('[barcode_registry]', error.message || error);
      return rows.length ? rows : null;
    }
    const batch = Array.isArray(data) ? data.map(mapBarcodeRegistryRow) : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

// =========================================================================
// ORDER CONFIRMATION NOTES (OCN) & AMENDMENTS PERSISTENCE
// =========================================================================

const OCN_CACHE_KEY = 'samyak_cache_order_confirmations';

export function getCachedOrderConfirmations() {
  try {
    const raw = localStorage.getItem(OCN_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse cached order confirmations:', e);
    return [];
  }
}

export function cacheOrderConfirmations(list) {
  try {
    localStorage.setItem(OCN_CACHE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch (e) {
    console.warn('Failed to cache order confirmations in localStorage:', e);
  }
}

/**
 * Fetch all Order Confirmation Notes (from Supabase order_confirmations table merged with local cache)
 */
export async function fetchOrderConfirmations() {
  const cached = getCachedOrderConfirmations();
  if (!isSupabaseConfigured()) return cached;

  try {
    const { data, error } = await supabase
      .from('order_confirmations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[order_confirmations fetch]', error.message || error);
      return cached;
    }

    const remote = (data || []).map(row => {
      const payload = row.payload || {};
      return {
        ...payload,
        id: row.id || row.ocn_number,
        ocnNumber: row.ocn_number || row.id,
        orderId: row.order_id || payload.orderId || null,
        jobName: row.job_name || payload.jobName || '',
        clientName: row.client_name || payload.clientName || '',
        status: row.status || payload.status || 'Confirmed',
        revisionNo: row.revision_no ?? payload.revisionNo ?? 0,
        amendmentNo: row.amendment_no || payload.amendmentNo || 'Rev 00',
        amendedAt: row.amended_at || payload.amendedAt || null,
        amendedBy: row.amended_by || payload.amendedBy || null,
        amendmentReason: row.amendment_reason || payload.amendmentReason || null,
        createdAt: row.created_at || payload.createdAt,
        updatedAt: row.updated_at || payload.updatedAt
      };
    });

    const map = new Map();
    remote.forEach(item => map.set(item.id, item));
    cached.forEach(item => {
      if (!map.has(item.id)) map.set(item.id, item);
    });

    const merged = Array.from(map.values()).sort((a, b) => 
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    cacheOrderConfirmations(merged);
    return merged;
  } catch (err) {
    console.error('[fetchOrderConfirmations]', err);
    return cached;
  }
}

/**
 * Save or update an Order Confirmation Note in Supabase and cache
 */
export async function saveOrderConfirmation(ocn) {
  if (!ocn || !ocn.ocnNumber) {
    console.warn('Cannot save order confirmation without ocnNumber');
    return ocn;
  }

  const id = ocn.id || ocn.ocnNumber;
  const ocnNumber = ocn.ocnNumber || id;
  const fullOcn = {
    ...ocn,
    id,
    ocnNumber,
    status: ocn.status || 'Confirmed',
    revisionNo: ocn.revisionNo ?? 0,
    amendmentNo: ocn.amendmentNo || 'Rev 00',
    revisions: Array.isArray(ocn.revisions) ? ocn.revisions : [],
    createdAt: ocn.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 1. Update local cache immediately
  const existingList = getCachedOrderConfirmations();
  const idx = existingList.findIndex(x => x.id === id || x.ocnNumber === ocnNumber);
  if (idx >= 0) {
    existingList[idx] = fullOcn;
  } else {
    existingList.unshift(fullOcn);
  }
  cacheOrderConfirmations(existingList);

  // 2. Persist to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const row = {
        id,
        ocn_number: ocnNumber,
        order_id: fullOcn.orderId || null,
        job_name: fullOcn.jobName || '',
        client_name: fullOcn.clientName || '',
        status: fullOcn.status,
        revision_no: fullOcn.revisionNo,
        amendment_no: fullOcn.amendmentNo,
        amended_at: fullOcn.amendedAt || null,
        amended_by: fullOcn.amendedBy || null,
        amendment_reason: fullOcn.amendmentReason || null,
        payload: fullOcn,
        updated_at: fullOcn.updatedAt
      };

      const { error } = await supabase.from('order_confirmations').upsert(row, { onConflict: 'id' });
      if (error) {
        console.warn('[order_confirmations upsert error]', error.message || error);
        saveSystemSetting('samyak_cache_order_confirmations', existingList).catch(() => {});
      }
    } catch (err) {
      console.warn('[saveOrderConfirmation] remote save failed:', err);
    }
  }

  return fullOcn;
}

/**
 * Apply an amendment to an existing OCN with revision tracking
 */
export async function saveOrderConfirmationAmendment(ocnIdOrOptions, amendmentPatch = {}, amendedBy = 'Staff') {
  let ocnId = ocnIdOrOptions;
  let patch = amendmentPatch;
  let author = amendedBy;

  if (ocnIdOrOptions && typeof ocnIdOrOptions === 'object') {
    const opts = ocnIdOrOptions;
    ocnId = opts.originalOcn?.id || opts.originalOcn?.ocnNumber || opts.id || opts.ocnId || opts.ocnNumber;
    patch = { ...(opts.amendmentData || opts.patch || {}), amendmentReason: opts.amendmentReason || opts.amendmentData?.amendmentReason };
    author = opts.amendedBy || author;
  }

  const list = getCachedOrderConfirmations();
  let existing = list.find(x => x.id === ocnId || x.ocnNumber === ocnId);
  if (!existing) {
    const fresh = await fetchOrderConfirmations();
    existing = fresh.find(x => x.id === ocnId || x.ocnNumber === ocnId);
  }
  if (!existing) {
    throw new Error(`Order Confirmation Note "${ocnId}" not found to amend.`);
  }

  const amended = buildOcnAmendment(existing, patch, author);
  const saved = await saveOrderConfirmation(amended);

  // If there is an associated order in orders table, keep order in sync
  if (saved.orderId && isSupabaseConfigured()) {
    try {
      const orderPatch = {
        id: saved.orderId,
        orderQtyKg: saved.orderQtyKg,
        orderType: saved.orderType,
        jobName: saved.jobName,
        clientName: saved.clientName,
        targetDeliveryDate: saved.targetDeliveryDate,
        layers: saved.layers,
        structure: (saved.layers || []).map(l => `${l.filmType} ${l.micron}µ`).join(' / '),
        ocnNumber: saved.ocnNumber,
        ocnId: saved.id
      };
      saveOrderToSupabase(orderPatch).catch(e => console.warn('[sync order amendment error]', e));
    } catch (e) {
      console.warn('[sync order amendment]', e);
    }
  }

  return saved;
}

/**
 * Delete / cancel an Order Confirmation Note
 */
export async function deleteOrderConfirmation(ocnId) {
  const list = getCachedOrderConfirmations().filter(x => x.id !== ocnId && x.ocnNumber !== ocnId);
  cacheOrderConfirmations(list);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('order_confirmations').delete().eq('id', ocnId);
    } catch (e) {
      console.warn('[deleteOrderConfirmation]', e);
    }
  }
  return true;
}

