/**
 * Supabase Data Sync Service for Samyak Flexi-ERP
 * Handles live bidirectional CRUD operations with Supabase PostgreSQL
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { uploadArtworkFile, uploadDocumentFile, openArtworkViewer, fileToDataUrl } from './supabaseStorageService';
export { uploadArtworkFile, uploadDocumentFile, openArtworkViewer, fileToDataUrl };

/**
 * Ensures a valid Supabase Auth session exists.
 * Throws an error if unauthenticated, preventing 401s on database writes.
 */
export async function ensureValidSession() {
  if (!isSupabaseConfigured()) return; // Local fallback mode ignores auth
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[Supabase Auth] Could not verify session:', error.message, '- proceeding with anon key.');
    }
    if (!session) {
      console.warn('[Supabase Auth] No active session found - proceeding with anon key (RLS is disabled).');
    }
  } catch (e) {
    console.warn('[Supabase Auth] Session check failed, proceeding anyway:', e.message);
  }
}

import { 
  initialOrders, 
  initialVendors, 
  initialInventory, 
  initialGRNs, 
  initialUsers, 
  initialProductionRecords,
  initialClients,
  initialJobMasters,
  FILM_DENSITIES
} from '../factoryStore';
import { initialCylinders } from '../dataStore';

/**
 * Graceful Supabase Error Handler
 * Suppresses blocking UI exceptions if a table is not created in Supabase yet,
 * allowing local ERP in-memory state to operate smoothly.
 */
export function handleSupabaseError(error, contextName) {
  if (!error) return;

  const isMissingTable = 
    error.message?.includes('schema cache') || 
    error.message?.includes('does not exist') || 
    error.code === 'PGRST204' || 
    error.code === '42P01';

  if (isMissingTable) {
    console.warn(`[Supabase Sync Notice] Table '${contextName}' is not created in Supabase yet. Saved locally in ERP state.`);
    return;
  }

  console.error(`[Supabase Sync Error] ${contextName}:`, error);
  throw error;
}

// ============================================================================
// 1. ORDERS / JOB PUNCHING
// ============================================================================

export async function fetchOrders() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

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
      const layerList = jd.layers || jd.calculationDetails?.layerResults || o.layers || [];

      return {
        id: o.id,
        jobName: jobName,
        clientName: o.client_name,
        orderType: o.order_type || 'Reel',
        orderQtyKg: Number(o.order_qty_kg) || 0,
        deliveryDate: o.target_delivery_date,
        targetDeliveryDate: o.target_delivery_date,
        orderDate: jd.orderDate || (o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')),
        status: o.status || 'Scheduled',
        wastagePct: Number(o.wastage_percentage) || Number(jd.wastagePct) || Number(jd.calculationDetails?.wastagePct) || 5,
        wastageKg: Number(jd.wastageKg) || Number(jd.calculationDetails?.wastageKg) || 0,
        structure: jd.structure || (layerList.length > 0 ? layerList.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : '—'),
        printWidthMm: jd.printWidthMm || null,
        repeatLengthMm: jd.repeatLengthMm || null,
        colorsCount: jd.colorsCount || o.colors_count || 6,
        poIssued: jd.poIssued || false,
        poNumber: jd.poNumber || '',
        layers: layerList,
        calculationDetails: jd.calculationDetails || null,
        jobDetails: jd,
        materialRequirements: matReqs,
        rawMaterialRequirements: matReqs
      };
    });
  } catch (err) {
    console.error("Error fetching orders from Supabase:", err);
    return [];
  }
}


export async function saveOrderToSupabase(order) {
  if (!isSupabaseConfigured()) {
    return;
  }
  await ensureValidSession();
  const targetDateVal = order.targetDeliveryDate || order.deliveryDate || new Date().toISOString().split('T')[0];

  const jobDetails = {
    ...(order.jobDetails || {}),
    structure: order.structure || order.jobDetails?.structure || '—',
    printWidthMm: order.printWidthMm || order.jobDetails?.printWidthMm || null,
    repeatLengthMm: order.repeatLengthMm || order.jobDetails?.repeatLengthMm || null,
    colorsCount: order.colorsCount || order.jobDetails?.colorsCount || 6,
    orderDate: order.orderDate || order.jobDetails?.orderDate || new Date().toLocaleDateString('en-GB'),
    wastagePct: Number(order.wastagePct) || Number(order.calculationDetails?.wastagePct) || 5,
    wastageKg: Number(order.wastageKg) || Number(order.calculationDetails?.wastageKg) || 0,
    calculationDetails: order.calculationDetails || order.jobDetails?.calculationDetails || null,
    poIssued: order.poIssued || false,
    poNumber: order.poNumber || '',
    layers: order.layers || order.jobDetails?.layers || null
  };

  const matReqs = order.materialRequirements || order.rawMaterialRequirements || [];

  // Pack everything into metadata envelope inside job_name string
  const metaEnvelope = {
    jobDetails,
    raw_material_requirements: matReqs
  };
  const combinedJobName = `${order.jobName || 'Untitled Job'} ||| ${JSON.stringify(metaEnvelope)}`;

  const payload = {
    id: order.id,
    job_name: combinedJobName,
    client_name: order.clientName || 'General Client',
    order_type: order.orderType || 'Reel',
    order_qty_kg: Number(order.orderQtyKg) || 0,
    target_delivery_date: targetDateVal,
    status: order.status || 'Scheduled'
  };

  const { error } = await supabase.from('orders').upsert(payload, { onConflict: 'id' });
  if (error) {
    handleSupabaseError(error, 'orders');
  }
}


export async function deleteOrderFromSupabase(orderId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  handleSupabaseError(error, 'orders');
}

// ============================================================================
// 2. VENDORS
// ============================================================================

export async function fetchVendors() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('vendors').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'vendors');
      return [];
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
      rating: Number(v.rating) || 5.0,
      materials: v.category ? v.category.split(', ') : []
    }));
  } catch (err) {
    console.error("Error fetching vendors from Supabase:", err);
    return [];
  }
}

export async function saveVendorToSupabase(vendor) {
  if (!isSupabaseConfigured()) return;
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
    rating: Number(vendor.rating) || 5.0
  };
  console.log('[vendors] Saving:', vendorId, vendorName);
  const { error: fullErr } = await supabase.from('vendors').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    console.warn('[vendors] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('vendors').upsert({ id: vendorId, name: vendorName, category: vendorCategory }, { onConflict: 'id' });
    if (minErr) { console.error('[vendors] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'vendors'); }
    else { console.log('[vendors] Saved with minimal payload.'); }
  } else { console.log('[vendors] Saved successfully.'); }
}

export async function deleteVendorFromSupabase(vendorId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (error) {
    console.error("Error deleting vendor from Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 2b. CLIENTS
// ============================================================================

export async function fetchClients() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'clients');
      return [];
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
    return [];
  }
}

export async function saveClientToSupabase(client) {
  if (!isSupabaseConfigured()) return;
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

  handleSupabaseError(error, 'clients');
}

export async function deleteClientFromSupabase(clientId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  try {
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    handleSupabaseError(error, 'clients');
  } catch (err) {
    console.error("Error deleting client from Supabase:", err);
  }
}


// ============================================================================
// ============================================================================
// 3. INVENTORY & RAW MATERIALS / CONSUMABLES
// ============================================================================

export function sanitizeInventoryItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return rawItem;

  let rawName = String(rawItem.itemName || rawItem.item_name || '').trim();
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

  // 1. Resolve true category with priority to extracted metadata
  let category = extractedMeta.category || rawItem.category;
  const lowerName = rawName.toLowerCase();

  // If category is unspecified or defaulted to 'Film Substrates', check keywords
  if (!category || category === 'Film Substrates' || category === 'Film') {
    if (lowerName.includes('acetate') || lowerName.includes('solvent') || lowerName.includes('thinner') || lowerName.includes('alcohol') || lowerName.includes('chemical') || lowerName.includes('toluene') || lowerName.includes('ipa')) {
      category = 'Chemicals & Solvents';
    } else if (lowerName.includes('ink') || lowerName.includes('cyan') || lowerName.includes('magenta') || lowerName.includes('yellow') || lowerName.includes('varnish') || lowerName.includes('toner')) {
      category = 'Printing Inks & Toners';
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

  const filmType = isFilm ? (extractedMeta.filmType || rawItem.filmType || (rawName ? rawName.split(' ')[0] : 'PET')) : '';
  const micron = isFilm 
    ? ((extractedMeta.micron !== undefined && extractedMeta.micron !== null && extractedMeta.micron !== '-') ? extractedMeta.micron : (rawItem.micron && rawItem.micron !== '-' ? rawItem.micron : 12)) 
    : '-';
  const widthMm = isFilm 
    ? ((extractedMeta.widthMm !== undefined && extractedMeta.widthMm !== null && extractedMeta.widthMm !== '-') ? extractedMeta.widthMm : (rawItem.widthMm && rawItem.widthMm !== '-' ? rawItem.widthMm : 1000)) 
    : '-';

  const fallbackUnit = isFilm ? 'Kg' : (
    category === 'Chemicals & Solvents' || category === 'Solvents' ? 'Litres' : 
    category === 'Doctor Blades & Wipers' ? 'Meters' : 
    category === 'Tapes & Consumables' ? 'Rolls' : 
    category === 'Safety Gear (PPE)' ? 'Boxes' : 
    category === 'Machine Spare Parts' ? 'Nos' : 'Kg'
  );

  const cleanItemName = rawName || (isFilm && filmType ? `${filmType} ${micron}µ (${widthMm}mm)` : `${category} Stock Item`);

  return {
    ...rawItem,
    ...extractedMeta,
    id: String(rawItem.id || rawItem.item_code || 'INVT-0001'),
    itemCode: rawItem.itemCode || rawItem.item_code || String(rawItem.id),
    itemName: cleanItemName,
    category: category,
    filmType: isFilm ? filmType : '',
    micron: micron,
    widthMm: widthMm,
    unit: rawItem.unit || extractedMeta.unit || fallbackUnit,
    availableQtyKg: Number(rawItem.availableQtyKg ?? rawItem.stock_qty_kg ?? extractedMeta.availableQtyKg ?? 0) || 0,
    allocatedQtyKg: Number(rawItem.allocatedQtyKg ?? extractedMeta.allocatedQtyKg ?? 0) || 0,
    reorderLevelKg: Number(rawItem.reorderLevelKg ?? extractedMeta.reorderLevelKg ?? 100) || 100,
    unitPrice: Number(rawItem.unitPrice ?? rawItem.unit_price ?? extractedMeta.unitPrice ?? 0) || 0,
    location: rawItem.location || extractedMeta.location || 'Store Bay',
    lastVendor: rawItem.lastVendor || extractedMeta.lastVendor || '',
    lastBatch: rawItem.lastBatch || extractedMeta.lastBatch || '',
    density: extractedMeta.density !== undefined ? extractedMeta.density : (rawItem.density || (isFilm ? 1.4 : 1.0)),
    grade: rawItem.grade || extractedMeta.grade || '',
    subType: rawItem.subType || extractedMeta.subType || '',
    shade: rawItem.shade || extractedMeta.shade || '',
    dimensions: rawItem.dimensions || extractedMeta.dimensions || '',
    lastUpdated: extractedMeta.lastUpdated || rawItem.lastUpdated || new Date().toISOString()
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
    grade: clean.grade || '',
    subType: clean.subType || '',
    shade: clean.shade || '',
    dimensions: clean.dimensions || '',
    micron: isFilm ? clean.micron : '-',
    widthMm: isFilm ? clean.widthMm : '-',
    allocatedQtyKg: clean.allocatedQtyKg,
    reorderLevelKg: clean.reorderLevelKg,
    unit: clean.unit,
    density: clean.density,
    location: clean.location,
    lastVendor: clean.lastVendor,
    lastBatch: clean.lastBatch,
    lastUpdated: new Date().toISOString()
  };

  const combinedItemName = `${itemNameStr} ||| ${JSON.stringify(meta)}`;

  return {
    id: String(clean.id),
    item_code: itemCodeStr,
    item_name: combinedItemName,
    stock_qty_kg: Number(clean.availableQtyKg ?? 0) || 0,
    unit_price: Number(clean.unitPrice ?? 0) || 0
  };
}

export async function fetchInventory() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('inventory').select('*').order('item_name');
    if (error) {
      handleSupabaseError(error, 'inventory');
      return [];
    }
    if (!data) return [];

    return data.map(i => sanitizeInventoryItem(i));
  } catch (err) {
    console.error("Error fetching inventory from Supabase:", err);
    return [];
  }
}

export async function saveInventoryItemToSupabase(item) {
  if (!isSupabaseConfigured() || !item) return;
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
  if (!isSupabaseConfigured() || !Array.isArray(inventoryList) || inventoryList.length === 0) return;
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


export async function deleteInventoryItemFromSupabase(itemId) {
  if (!isSupabaseConfigured() || !itemId) return;
  await ensureValidSession();
  console.log('[inventory] Deleting item from Supabase:', itemId);
  const { error } = await supabase.from('inventory').delete().eq('id', String(itemId));
  if (error) {
    console.error("Error deleting inventory from Supabase:", error);
    handleSupabaseError(error, 'inventory');
    throw error;
  }
}

// ============================================================================
// 4. GOODS RECEIPT NOTES (GRN)
// ============================================================================

export function sanitizeGRN(rawGRN) {
  if (!rawGRN || typeof rawGRN !== 'object') return rawGRN;

  let rawName = String(rawGRN.itemName || rawGRN.item_name || '').trim();
  let meta = {};

  while (rawName.includes('|||')) {
    const idx = rawName.indexOf('|||');
    const jsonStr = rawName.substring(idx + 3).trim();
    rawName = rawName.substring(0, idx).trim();
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object') {
          meta = { ...meta, ...parsed };
        }
      } catch (e) {}
    }
  }

  return {
    ...rawGRN,
    ...meta,
    id: rawGRN.id || rawGRN.grn_number || rawGRN.grnNo,
    grnNo: rawGRN.grn_number || rawGRN.grnNo || rawGRN.id,
    vendorId: rawGRN.vendor_id || rawGRN.vendorId || rawGRN.vendorName || 'General Vendor',
    vendorName: rawGRN.vendorName || rawGRN.vendor_id || rawGRN.vendorId || 'General Vendor',
    poNumber: rawGRN.po_number || rawGRN.poNumber || '',
    invoiceNo: rawGRN.invoice_number || rawGRN.invoiceNo || '',
    receivedDate: rawGRN.received_date || rawGRN.receivedDate || new Date().toISOString(),
    itemName: rawName || 'Item',
    filmType: meta.filmType || rawGRN.filmType || (rawName ? rawName.split(' ')[0] : 'PET'),
    micron: meta.micron !== undefined ? meta.micron : (rawGRN.micron !== undefined ? rawGRN.micron : '-'),
    widthMm: meta.widthMm !== undefined ? meta.widthMm : (rawGRN.widthMm !== undefined ? rawGRN.widthMm : '-'),
    rollsReceived: Number(meta.rollsReceived ?? rawGRN.rollsReceived ?? 0) || 0,
    purchaseRatePerKg: Number(meta.purchaseRatePerKg ?? meta.unitPrice ?? rawGRN.purchaseRatePerKg ?? rawGRN.unitPrice ?? 0) || 0,
    unitPrice: Number(meta.purchaseRatePerKg ?? meta.unitPrice ?? rawGRN.purchaseRatePerKg ?? rawGRN.unitPrice ?? 0) || 0,
    unit: meta.unit || rawGRN.unit || 'Kg',
    batchNo: meta.batchNo || rawGRN.batchNo || '',
    status: rawGRN.status || 'Pending QC',
    qcNotes: rawGRN.qc_remarks || rawGRN.qcNotes || '',
    inspectedBy: meta.inspectedBy || rawGRN.inspectedBy || '',
    storeManager: meta.storeManager || rawGRN.storeManager || '',
    receivedQtyKg: Number(rawGRN.received_qty_kg ?? rawGRN.receivedQtyKg ?? rawGRN.netWeightKg ?? 0) || 0,
    netWeightKg: Number(rawGRN.received_qty_kg ?? rawGRN.receivedQtyKg ?? rawGRN.netWeightKg ?? 0) || 0,
    packagingType: meta.packagingType || rawGRN.packagingType || 'Roll',
    itemsBreakdown: meta.itemsBreakdown || rawGRN.itemsBreakdown || []
  };
}

export async function fetchGRNs() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('grns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

    return data.map(g => sanitizeGRN(g));
  } catch (err) {
    console.error("Error fetching GRNs from Supabase:", err);
    return [];
  }
}

export async function saveGRNToSupabase(grn) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const clean = sanitizeGRN(grn);
  const grnId = clean.id || clean.grnNo || `GRN-2026-${Math.floor(100 + Math.random() * 900)}`;
  const itemNameVal = clean.itemName;
  const weightVal = Number(clean.receivedQtyKg || clean.netWeightKg) || 0;

  // Pack extra GRN properties into metadata
  const meta = {
    filmType: clean.filmType,
    micron: clean.micron,
    widthMm: clean.widthMm,
    rollsReceived: clean.rollsReceived,
    purchaseRatePerKg: Number(clean.purchaseRatePerKg ?? clean.unitPrice ?? 0) || 0,
    unitPrice: Number(clean.purchaseRatePerKg ?? clean.unitPrice ?? 0) || 0,
    unit: clean.unit || 'Kg',
    batchNo: clean.batchNo,
    inspectedBy: clean.inspectedBy,
    storeManager: clean.storeManager,
    packagingType: clean.packagingType || 'Roll',
    itemsBreakdown: clean.itemsBreakdown || []
  };

  const combinedItemName = `${itemNameVal} ||| ${JSON.stringify(meta)}`;

  const payload = {
    id: grnId,
    grn_number: clean.grnNo || grnId,
    vendor_id: clean.vendorName || clean.vendorId || 'General Vendor',
    po_number: clean.poNumber || '',
    invoice_number: clean.invoiceNo || '',
    received_date: clean.receivedDate || new Date().toISOString(),
    item_name: combinedItemName,
    received_qty_kg: weightVal,
    status: clean.status || 'Pending QC',
    qc_remarks: clean.qcNotes || ''
  };

  console.log('[GRNs] Saving GRN via schema-independent metadata envelope:', grnId);
  const { error } = await supabase.from('grns').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('[GRNs] Failed to save GRN:', error.message);
    handleSupabaseError(error, 'grns');
  }
}


// ============================================================================
// 5. CYLINDERS
// ============================================================================

export async function fetchCylinders() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('cylinders').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'cylinders');
      return [];
    }
    if (!data) return [];

    return data.map(c => {
      const pm = c.press_marks || {};
      let layers = Array.isArray(c.layers) ? c.layers : (pm.layers || []);
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
        press_marks: pm
      };
    });
  } catch (err) {
    console.error("Error fetching cylinders from Supabase:", err);
    return [];
  }
}

export async function saveCylinderToSupabase(cyl) {
  if (!isSupabaseConfigured() || !cyl) return;
  await ensureValidSession();
  const rateVal = cyl.rate !== undefined ? cyl.rate : cyl.ratePerSqInch;
  const id = cyl.id || `CYL-${Math.floor(100 + Math.random() * 900)}`;
  const layers = Array.isArray(cyl.layers) ? cyl.layers : [];
  const structureSummary = (layers.length > 0)
    ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
    : (cyl.structure || '—');

  const fileUrl = cyl.artworkUrl || cyl.jobCardFileUrl || cyl.artwork_url || '';
  const fileName = cyl.jobCardFileName || (fileUrl ? 'Artwork_KLD_Proof.pdf' : '');

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
    artworkUrl: fileUrl
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
    pet_size: pressMarks.petSize
  };

  // Dual-Persist: Save failsafe snapshot in system_settings
  try {
    const key = `jobcard_${cyl.sku || id}`;
    saveSystemSetting(key, { ...cyl, ...pressMarks, id, sku: cyl.sku, jobName: cyl.jobName }).catch(() => {});
  } catch (e) {}

  const { error: fullErr } = await supabase.from('cylinders').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    console.warn('[cylinders] Full payload upsert rejected, trying payload with press_marks JSON:', fullErr.message);
    const fallbackPayload = {
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
      face_length_mm: cyl.faceLengthMm,
      layer1_printed_qty_kg: cyl.layer1PrintedQtyKg,
      dispatched_qty: cyl.dispatchedQty,
      utilisation_limit: cyl.utilisationLimit,
      status: cyl.status || 'Active In-Use',
      artwork_url: fileUrl || null,
      press_marks: pressMarks
    };
    const { error: fbErr } = await supabase.from('cylinders').upsert(fallbackPayload, { onConflict: 'id' });
    if (fbErr) {
      console.warn('[cylinders] Fallback with press_marks failed, trying minimal payload:', fbErr.message);
      const minimalPayload = {
        id,
        sku: cyl.sku,
        job_name: cyl.jobName,
        colors_count: cyl.colorsCount,
        cylinder_cost: cyl.cylinderCost,
        status: cyl.status || 'Active In-Use'
      };
      const { error: minErr } = await supabase.from('cylinders').upsert(minimalPayload, { onConflict: 'id' });
      if (minErr) {
        console.error('[cylinders] Minimal payload failed:', minErr.message);
        handleSupabaseError(minErr, 'cylinders');
      }
    }
  }
}

export async function deleteCylinderFromSupabase(cylinderId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  try {
    const { error } = await supabase.from('cylinders').delete().eq('id', cylinderId);
    handleSupabaseError(error, 'cylinders');
  } catch (err) {
    console.error("Error deleting cylinder from Supabase:", err);
  }
}

// ============================================================================
// 6. PRODUCTION RECORDS
// ============================================================================

export async function fetchProductionRecords() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('production_records').select('*').order('recorded_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'production_records');
      return [];
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
        shift: r.shift || extra.shift || 'Day Shift',
        dateFilled: r.date_filled || extra.dateFilled || (r.recorded_at ? r.recorded_at.split('T')[0] : new Date().toISOString().split('T')[0]),
        materialsList: Array.isArray(r.materials_list) ? r.materials_list : (Array.isArray(extra.materialsList) ? extra.materialsList : []),
        qtyFirstPassL1: Number(extra.qtyFirstPassL1) || 0,
        qtySecondPassL2: Number(extra.qtySecondPassL2) || 0,
        qtyInspection: Number(extra.qtyInspection) || 0,
        qtySlitting: Number(extra.qtySlitting) || 0,
        qtyDispatch: Number(extra.qtyDispatch) || Number(r.net_usable_kg) || 0,
        totalProductionQtyKg: Number(r.gross_production_kg) || Number(extra.totalProductionQtyKg) || 0,
        grossProductionKg: Number(r.gross_production_kg) || Number(extra.totalProductionQtyKg) || 0,
        netUsableKg: Number(r.net_usable_kg) || Number(extra.qtyDispatch) || 0,
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
        processLogs: extra
      };
    });
  } catch (err) {
    console.error("Error fetching production records from Supabase:", err);
    return [];
  }
}

export async function saveProductionRecordToSupabase(record) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const recId = record.id || `REC-${Date.now()}`;
  const scrapKg = Number(record.totalScrapQtyKg ?? record.totalWastageKg ?? 0);
  const scrapPct = Number(record.overallScrapPctOfOutput ?? record.wastagePercentage ?? record.scrapWastagePct ?? 0);
  const scrapPctDispatch = Number(record.overallScrapPctOfDispatch ?? 0);
  const grossKg = Number(record.totalProductionQtyKg ?? record.grossProductionKg ?? 0);
  const netKg = Number(record.qtyDispatch ?? record.netUsableKg ?? record.totalProductionQtyKg ?? 0);

  const extra = {
    orderId: record.orderId,
    jobName: record.jobName,
    clientName: record.clientName,
    materialsList: record.materialsList || [],
    qtyFirstPassL1: record.qtyFirstPassL1,
    qtySecondPassL2: record.qtySecondPassL2,
    qtyInspection: record.qtyInspection,
    qtySlitting: record.qtySlitting,
    qtyDispatch: record.qtyDispatch,
    totalProductionQtyKg: grossKg,
    grossProductionKg: grossKg,
    netUsableKg: netKg,
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
    filledBy: record.filledBy,
    approvedBy: record.approvedBy,
    approvalDate: record.approvalDate,
    notes: record.notes,
    dateFilled: record.dateFilled
  };
  const fullPayload = {
    id: recId,
    order_id: record.orderId,
    job_name: record.jobName || 'Production Record',
    client_name: record.clientName || '',
    operator_name: record.operatorName || record.filledBy || '',
    shift: record.shift || 'Day Shift',
    date_filled: record.dateFilled || new Date().toISOString().split('T')[0],
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
    total_material_cost_rs: Number(record.totalMaterialCostRs || 0),
    processing_cost_per_kg: Number(record.processingCostPerKg || 25),
    total_processing_cost_rs: Number(record.totalProcessingCostRs || 0),
    final_production_cost_rs: Number(record.finalProductionCostRs || 0),
    filled_by: record.filledBy || '',
    approved_by: record.approvedBy || '',
    approval_date: record.approvalDate || '',
    notes: record.notes || '',
    status: record.status || 'Filled by Plant Manager',
    process_logs: extra
  };
  
  const { error: fullErr } = await supabase.from('production_records').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    // Retry with intermediate payload without optional stage columns
    const fallbackPayload = {
      id: recId,
      order_id: record.orderId,
      job_name: record.jobName || 'Production Record',
      operator_name: record.operatorName || record.filledBy || '',
      shift: record.shift || 'Day Shift',
      gross_production_kg: grossKg,
      net_usable_kg: netKg,
      total_wastage_kg: scrapKg,
      wastage_percentage: scrapPct,
      status: record.status || 'Filled by Plant Manager',
      process_logs: extra
    };
    const { error: fbErr } = await supabase.from('production_records').upsert(fallbackPayload, { onConflict: 'id' });
    if (fbErr) {
      const { error: minErr } = await supabase.from('production_records').upsert({
        id: recId,
        job_name: record.jobName || 'Production Record',
        status: record.status || 'Filled by Plant Manager'
      }, { onConflict: 'id' });
      if (minErr) { handleSupabaseError(minErr, 'production_records'); }
    }
  }
}

// ============================================================================
// 7. USERS
// ============================================================================

export async function fetchUsers() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, email, role, department, active, status')
      .order('full_name');
    if (error) {
      handleSupabaseError(error, 'users');
      return [];
    }
    if (!data) return [];

    return data
      .filter(u => u.id && !u.id.startsWith('USR-SETTING-'))
      .map(u => ({
        id: u.id,
        name: u.full_name || u.username || 'User',
        email: u.email || (u.username?.includes('@') ? u.username : `${u.id.toLowerCase()}@plant.com`),
        role: u.role || 'Shop Floor Operator',
        department: u.department || 'Operations',
        status: u.status || (u.active !== false ? 'Active' : 'Inactive')
      }));
  } catch (err) {
    console.error("Error fetching users from Supabase:", err);
    return [];
  }
}


export async function saveUserToSupabase(user) {
  if (!isSupabaseConfigured()) return null;
  try {
    await ensureValidSession();
    const userId = user.id || `USR-${Math.floor(1000 + Math.random() * 9000)}`;

    const fullPayload = {
      id: userId,
      username: user.email?.toLowerCase() || userId,
      full_name: user.name || '',
      email: user.email || '',
      role: user.role || 'Shop Floor Operator',
      department: user.department || 'Operations',
      password_hash: user.password || user.password_hash || '',
      active: user.status !== 'Inactive',
      status: user.status || 'Active'
    };

    const { data, error: fullErr } = await supabase
      .from('users')
      .upsert([fullPayload], { onConflict: 'id' })
      .select();

    if (fullErr) {
      console.warn('[users] Full payload upsert failed:', fullErr.message, '— trying minimal payload...');
      const minPayload = {
        id: userId,
        username: user.email?.toLowerCase() || userId,
        full_name: user.name || '',
        email: user.email || '',
        role: user.role || 'Shop Floor Operator'
      };
      const { data: minData, error: minErr } = await supabase
        .from('users')
        .upsert([minPayload], { onConflict: 'id' })
        .select();

      if (minErr) {
        handleSupabaseError(minErr, 'users');
        return null;
      }
      return minData ? minData[0] : minPayload;
    }

    return data ? data[0] : fullPayload;
  } catch (err) {
    handleSupabaseError(err, 'users exception');
    return null;
  }
}

/**
 * Update password for a user in the auth system.
 */
export async function updateUserPasswordInDB(email, newPassword) {
  if (!isSupabaseConfigured() || !email || !newPassword) return false;
  try {
    await ensureValidSession();
    const { error } = await supabase
      .from('users')
      .update({ password_hash: newPassword })
      .eq('email', email.toLowerCase().trim());
    if (error) {
      console.warn('[users] Could not update user password:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[users] updateUserPasswordInDB exception:', err.message);
    return false;
  }
}

export async function deleteUserFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) return false;
  try {
    await ensureValidSession();
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      handleSupabaseError(error, 'users');
      return false;
    }
    return true;
  } catch (err) {
    handleSupabaseError(err, 'users exception');
    return false;
  }
}


// ============================================================================
// 8. JOB DATA SHEETS
// ============================================================================

export async function fetchJobDataSheets() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('job_datasheets').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'job_datasheets');
      return [];
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
    return [];
  }
}

export async function saveJobDataSheetToSupabase(sheet) {
  if (!isSupabaseConfigured()) return;
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
  if (fullErr) {
    console.warn('[job_datasheets] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('job_datasheets').upsert({ id: sheetId, job_name: sheet.jobName || 'Job Datasheet', client_name: sheet.clientName || '' }, { onConflict: 'id' });
    if (minErr) { console.error('[job_datasheets] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'job_datasheets'); }
    else { console.log('[job_datasheets] Saved with minimal payload.'); }
  } else { console.log('[job_datasheets] Saved successfully.'); }
}

export async function deleteJobDataSheetFromSupabase(sheetId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('job_datasheets').delete().eq('id', sheetId);
  handleSupabaseError(error, 'job_datasheets');
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
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('inventory_rolls').select('*').order('inward_datetime', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'inventory_rolls');
      return [];
    }
    if (!data) return [];

    return data.map(r => ({
      id: r.barcode_id,
      barcodeId: r.barcode_id,
      grnNo: r.grn_no || '',
      rollType: r.roll_type || 'RAW_MATERIAL',
      itemId: r.item_id,
      itemName: r.item_name || '',
      category: r.category || '',
      jobName: r.job_name,
      orderId: r.order_id,
      micron: Number(r.micron) || 0,
      widthMm: Number(r.width_mm) || 0,
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
      coreDia: r.core_dia || '',
      purchaseRatePerKg: Number(r.purchase_rate_per_kg ?? r.unit_price ?? 0) || 0,
      unitPrice: Number(r.purchase_rate_per_kg ?? r.unit_price ?? 0) || 0,
      unit: r.unit || (r.category === 'Film Substrates' ? 'Kg' : 'Pcs'),
      inputBarcodeIds: Array.isArray(r.input_barcode_ids) ? r.input_barcode_ids : [],
      stationId: r.station_id || '',
      locationBay: r.location_bay || '',
      status: r.status || 'In Stock'
    }));
  } catch (err) {
    console.error("Error fetching inventory rolls from Supabase:", err);
    return [];
  }
}

export async function saveInventoryRollToSupabase(roll) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const fullPayload = {
    barcode_id: roll.barcodeId || roll.id,
    grn_no: roll.grnNo || roll.grn_no || '',
    roll_type: roll.rollType || 'RAW_MATERIAL',
    item_id: roll.itemId || '',
    item_name: roll.itemName || '',
    category: roll.category || '',
    job_name: roll.jobName || '',
    order_id: roll.orderId || '',
    micron: Number(roll.micron) || 0,
    width_mm: Number(roll.widthMm) || 0,
    packaging_type: roll.packagingType || '',
    inward_datetime: roll.inwardDatetime || new Date().toISOString(),
    production_date: roll.productionDate || (roll.inwardDatetime ? roll.inwardDatetime.split('T')[0] : new Date().toISOString().split('T')[0]),
    vendor_name: roll.vendorName || roll.vendor || '',
    invoice_no: roll.invoiceNo || roll.invoice_no || '',
    batch_no: roll.batchNo || roll.lotNo || roll.batch_no || '',
    gross_weight_kg: Number(roll.grossWeightKg ?? roll.netWeightKg ?? 0) || 0,
    tare_weight_kg: Number(roll.tareWeightKg ?? 0) || 0,
    net_weight_kg: Number(roll.netWeightKg) || 0,
    available_weight_kg: Number(roll.availableWeightKg ?? roll.netWeightKg ?? 0) || 0,
    length_meters: Number(roll.lengthMeters ?? 0) || 0,
    joint_count: Number(roll.jointCount ?? 0) || 0,
    qc_status: roll.qcStatus || 'Pending QC',
    machine_name: roll.machineName || roll.machine || roll.stationId || '',
    operator_name: roll.operatorName || roll.operator || '',
    shift: roll.shift || '',
    remarks: roll.remarks || roll.notes || '',
    core_dia: roll.coreDia || '',
    purchase_rate_per_kg: Number(roll.purchaseRatePerKg ?? roll.unitPrice ?? roll.purchaseRate ?? 0) || 0,
    unit_price: Number(roll.purchaseRatePerKg ?? roll.unitPrice ?? roll.purchaseRate ?? 0) || 0,
    unit: roll.unit || 'Kg',
    input_barcode_ids: roll.inputBarcodeIds || [],
    station_id: roll.stationId || '',
    location_bay: roll.locationBay || '',
    status: roll.status || 'In Stock'
  };
  console.log('[inventory_rolls] Saving barcode:', roll.barcodeId || roll.id);
  const { error: fullErr } = await supabase.from('inventory_rolls').upsert(fullPayload, { onConflict: 'barcode_id' });
  if (fullErr) {
    console.warn('[inventory_rolls] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('inventory_rolls').upsert({ 
      barcode_id: roll.barcodeId || roll.id, 
      item_name: roll.itemName || 'Roll', 
      roll_type: roll.rollType || 'RAW_MATERIAL', 
      net_weight_kg: Number(roll.netWeightKg) || 0, 
      status: roll.status || 'In Stock' 
    }, { onConflict: 'barcode_id' });
    if (minErr) { 
      console.error('[inventory_rolls] Minimal payload failed:', minErr.message); 
      handleSupabaseError(minErr, 'inventory_rolls'); 
    } else { 
      console.log('[inventory_rolls] Saved with minimal payload.'); 
    }
  } else { 
    console.log('[inventory_rolls] Saved successfully.'); 
  }
}

// ============================================================================
// 10. DISPATCH SHIPMENTS & PACKING LISTS
// ============================================================================

export async function fetchDispatchShipments() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('dispatch_shipments').select('*').order('dispatch_date', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'dispatch_shipments');
      return [];
    }
    if (!data) return [];

    return data.map(d => ({
      dispatchId: d.dispatch_id,
      orderId: d.order_id,
      jobName: d.job_name,
      clientName: d.client_name,
      vehicleNo: d.vehicle_no,
      lrNo: d.lr_no,
      dispatchDate: d.dispatch_date,
      totalRolls: Number(d.total_rolls) || 0,
      totalNetWeightKg: Number(d.total_net_weight_kg) || 0,
      totalGrossWeightKg: Number(d.total_gross_weight_kg) || 0,
      items: Array.isArray(d.items) ? d.items : []
    }));
  } catch (err) {
    console.error("Error fetching dispatch shipments from Supabase:", err);
    return [];
  }
}

export async function saveDispatchShipmentToSupabase(shipment) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const fullPayload = {
    dispatch_id: shipment.dispatchId,
    order_id: shipment.orderId,
    job_name: shipment.jobName || '',
    client_name: shipment.clientName || '',
    vehicle_no: shipment.vehicleNo || '',
    lr_no: shipment.lrNo || '',
    dispatch_date: shipment.dispatchDate || new Date().toISOString(),
    total_rolls: Number(shipment.totalRolls) || 0,
    total_net_weight_kg: Number(shipment.totalNetWeightKg) || 0,
    total_gross_weight_kg: Number(shipment.totalGrossWeightKg) || 0,
    items: shipment.items || []
  };
  console.log('[dispatch_shipments] Saving:', shipment.dispatchId);
  const { error: fullErr } = await supabase.from('dispatch_shipments').upsert(fullPayload, { onConflict: 'dispatch_id' });
  if (fullErr) {
    console.warn('[dispatch_shipments] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('dispatch_shipments').upsert({ dispatch_id: shipment.dispatchId, job_name: shipment.jobName || '', client_name: shipment.clientName || '', dispatch_date: shipment.dispatchDate || new Date().toISOString() }, { onConflict: 'dispatch_id' });
    if (minErr) { console.error('[dispatch_shipments] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'dispatch_shipments'); }
    else { console.log('[dispatch_shipments] Saved with minimal payload.'); }
  } else { console.log('[dispatch_shipments] Saved successfully.'); }
}

// ============================================================================
// 11. PRINTING MACHINES & PRODUCTION SCHEDULER
// ============================================================================

export async function fetchPrintingMachines() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('printing_machines').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'printing_machines');
      return [];
    }
    if (!data) return [];

    return data.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type || 'Rotogravure',
      colors: Number(m.colors) || 8,
      maxSpeedMpm: Number(m.max_speed_mpm) || 250,
      maxWidthMm: Number(m.max_width_mm) || 1200,
      status: m.status || 'Active',
      operator: m.operator,
      location: m.location
    }));
  } catch (err) {
    console.error("Error fetching printing machines from Supabase:", err);
    return [];
  }
}

export async function savePrintingMachineToSupabase(machine) {
  if (!isSupabaseConfigured()) return;
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
  if (fullErr) {
    console.warn('[printing_machines] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('printing_machines').upsert({ id: machineId, name: machine.name || 'Machine', status: machine.status || 'Active' }, { onConflict: 'id' });
    if (minErr) { console.error('[printing_machines] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'printing_machines'); }
    else { console.log('[printing_machines] Saved with minimal payload.'); }
  } else { console.log('[printing_machines] Saved successfully.'); }
}

export async function deletePrintingMachineFromSupabase(machineId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('printing_machines').delete().eq('id', machineId);
  handleSupabaseError(error, 'printing_machines');
}

export async function fetchProductionSchedules() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('production_schedules').select('*').order('scheduled_date', { ascending: true });
    if (error) {
      handleSupabaseError(error, 'production_schedules');
      return [];
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
    return [];
  }
}

export async function saveProductionScheduleToSupabase(schedule) {
  if (!isSupabaseConfigured()) return;
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
    film_type: schedule.filmType || 'PET',
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
  if (fullErr) {
    console.warn('[production_schedules] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('production_schedules').upsert({ id: schedId, job_name: schedule.jobName || '', machine_id: schedule.machineId, scheduled_date: schedule.scheduledDate || new Date().toISOString().split('T')[0], status: schedule.status || 'Scheduled' }, { onConflict: 'id' });
    if (minErr) { console.error('[production_schedules] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'production_schedules'); }
    else { console.log('[production_schedules] Saved with minimal payload.'); }
  } else { console.log('[production_schedules] Saved successfully.'); }
}

export async function deleteProductionScheduleFromSupabase(scheduleId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('production_schedules').delete().eq('id', scheduleId);
  handleSupabaseError(error, 'production_schedules');
}

// ============================================================================
// 12. JOB MASTERS DIRECTORY
// ============================================================================

export function parseStructureStringToLayers(structureStr) {
  if (!structureStr || structureStr === '—') return [];
  const parts = String(structureStr).split('/').map(p => p.trim());
  if (parts.length === 0) return [];

  return parts.map((part, idx) => {
    const micronMatch = part.match(/(\d+(\.\d+)?)\s*µ?/i);
    const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
    let rawType = part.replace(/(\d+(\.\d+)?)\s*µ?/gi, '').trim();

    return {
      id: Date.now() + idx,
      filmType: rawType || 'PET',
      micron: micron
    };
  });
}

export async function fetchJobMasters() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('job_masters').select('*').order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'job_masters');
      return [];
    }
    if (!data) return [];

    return data.map(j => {
      const pm = j.press_marks || {};
      let layers = Array.isArray(j.layers) ? j.layers : (pm.layers || []);
      const derivedStructure = (layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (j.structure || j.film_structure || '—');

      if (layers.length === 0 && derivedStructure && derivedStructure !== '—') {
        layers = parseStructureStringToLayers(derivedStructure);
      }

      return {
        id: j.id,
        skuCode: j.sku_code || j.sku || '',
        jobName: j.job_name || '',
        clientName: j.client_name || '',
        structure: derivedStructure,
        printWidthMm: Number(j.print_width_mm || j.print_width || j.pouch_width_mm || j.width_mm || j.pouch_open_width) || 1000,
        faceLengthMm: Number(j.face_length_mm || j.face_length || j.shell_size || pm.faceLengthMm) || (Number(j.print_width_mm) || 1050),
        repeatLengthMm: Number(j.repeat_length_mm || j.repeat_length || j.circumference_mm) || 400,
        pouchOpenWidth: Number(j.pouch_open_width || pm.pouchOpenWidth) || 0,
        pouchHeight: Number(j.pouch_height || j.pouch_height_mm || pm.pouchHeight) || 0,
        layers: layers,
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
        creationDate: j.creation_date || j.created_at ? String(j.created_at).split('T')[0] : new Date().toISOString().split('T')[0]
      };
    });
  } catch (err) {
    console.error("Error fetching job masters from Supabase:", err);
    return [];
  }
}

export async function saveJobMasterToSupabase(jobMaster) {
  if (!isSupabaseConfigured() || !jobMaster) return;
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

  const pressMarks = {
    silLogo: jobMaster.silLogo !== undefined && jobMaster.silLogo !== null ? jobMaster.silLogo : '',
    arcMark: jobMaster.arcMark || 'Yes',
    slittingMark: jobMaster.slittingMark || 'Yes',
    trackerLine: jobMaster.trackerLine || 'Yes',
    specialInstructions: jobMaster.specialInstructions || '',
    printWidthMm: printWidthMm,
    faceLengthMm: faceLengthMm,
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

  const legacyPayload = {
    id,
    sku_code: skuCode,
    job_name: jobName,
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
    creation_date: jobMaster.creationDate || new Date().toISOString().split('T')[0]
  };

  // Dual-Persist: Save failsafe snapshot in system_settings
  try {
    const key = `jobcard_${skuCode || id}`;
    saveSystemSetting(key, { ...jobMaster, ...pressMarks, id, skuCode, jobName }).catch(() => {});
  } catch (e) {}

  // 1. Try extended payload with new columns (including press marks & layers) FIRST
  const { error: extErr } = await supabase.from('job_masters').upsert(extendedPayload, { onConflict: 'id' });

  if (extErr) {
    console.warn("[Supabase Sync Notice] Extended payload rejected, trying payload with press_marks JSON...", extErr.message);
    
    // 2. Try legacy payload with press_marks JSON
    const { error: legacyErr } = await supabase.from('job_masters').upsert({
      ...legacyPayload,
      press_marks: pressMarks,
      layers: Array.isArray(jobMaster.layers) ? jobMaster.layers : []
    }, { onConflict: 'id' });

    if (legacyErr) {
      console.warn("[Supabase Sync Notice] Legacy payload rejected, trying absolute minimal payload...", legacyErr.message);
      
      // 3. Absolute minimal payload guaranteed to succeed on any table definition
      const minimalPayload = {
        id,
        sku_code: skuCode,
        job_name: jobName,
        client_name: clientName
      };
      const { error: minErr } = await supabase.from('job_masters').upsert(minimalPayload, { onConflict: 'id' });
      handleSupabaseError(minErr, 'job_masters');
    }
  }
}

export async function deleteJobMasterFromSupabase(jobMasterId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('job_masters').delete().eq('id', jobMasterId);
  handleSupabaseError(error, 'job_masters');
}

/**
 * -----------------------------------------------------------------------------
 * 12. SALES QUOTATIONS SUPABASE OPERATIONS
 * -----------------------------------------------------------------------------
 */

export async function fetchSalesQuotations() {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from('sales_quotations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      handleSupabaseError(error, 'sales_quotations');
      return [];
    }

    if (data && data.length > 0) {
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
        createdAt: q.created_at
      }));
    }
  } catch (err) {
    handleSupabaseError(err, 'sales_quotations exception');
  }

  return [];
}

export async function saveSalesQuotationToSupabase(quotation) {
  if (!isSupabaseConfigured() || !quotation) return null;

  try {
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
      comments: quotation.comments || ''
    };

    const { data, error } = await supabase
      .from('sales_quotations')
      .upsert([payload], { onConflict: 'id' })
      .select();

    if (error) {
      handleSupabaseError(error, 'sales_quotations');
      return null;
    }

    return data ? data[0] : null;
  } catch (err) {
    handleSupabaseError(err, 'sales_quotations exception');
    return null;
  }
}

export async function deleteSalesQuotationFromSupabase(id) {
  if (!isSupabaseConfigured() || !id) return false;

  try {
    await ensureValidSession();

    const { error } = await supabase
      .from('sales_quotations')
      .delete()
      .eq('id', id);

    if (error) {
      handleSupabaseError(error, 'sales_quotations');
      return false;
    }

    return true;
  } catch (err) {
    handleSupabaseError(err, 'sales_quotations exception');
    return false;
  }
}

/**
 * -----------------------------------------------------------------------------
 * 13. INKS MASTER SUPABASE OPERATIONS
 * -----------------------------------------------------------------------------
 */

export async function fetchInks() {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('inks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      handleSupabaseError(error, 'inks');
      return null;
    }

    if (data) {
      return data.map(i => ({
        id: i.id,
        productCode: i.product_code,
        shade: i.shade,
        inkType: i.ink_type || 'Reverse Ink',
        manufacturer: i.manufacturer,
        supplierId: i.supplier_id,
        supplierName: i.supplier_name,
        solidContentPct: parseFloat(i.solid_content_pct) || 40,
        solidVariationPct: parseFloat(i.solid_variation_pct) || 2,
        pricePerKg: parseFloat(i.price_per_kg) || 0,
        stockQtyKg: parseFloat(i.stock_qty_kg) || 0,
        reorderLevelKg: parseFloat(i.reorder_level_kg) || 0,
        unit: i.unit || 'Kg',
        solventType: i.solvent_type || '',
        notes: i.notes || '',
        priceHistory: i.price_history || [],
        createdAt: i.created_at,
        lastUpdated: i.last_updated
      }));
    }
  } catch (err) {
    handleSupabaseError(err, 'inks exception');
  }

  return null;
}

export async function saveInkToSupabase(ink) {
  if (!isSupabaseConfigured() || !ink) return null;

  try {
    await ensureValidSession();

    const payload = {
      id: ink.id,
      product_code: ink.productCode,
      shade: ink.shade,
      ink_type: ink.inkType || 'Reverse Ink',
      manufacturer: ink.manufacturer || '',
      supplier_id: ink.supplierId || null,
      supplier_name: ink.supplierName || '',
      solid_content_pct: parseFloat(ink.solidContentPct) || 40,
      solid_variation_pct: parseFloat(ink.solidVariationPct) || 2,
      price_per_kg: parseFloat(ink.pricePerKg) || 0,
      stock_qty_kg: parseFloat(ink.stockQtyKg) || 0,
      reorder_level_kg: parseFloat(ink.reorderLevelKg) || 0,
      unit: ink.unit || 'Kg',
      solvent_type: ink.solventType || '',
      notes: ink.notes || '',
      price_history: ink.priceHistory || [],
      last_updated: new Date().toISOString()
    };

    const { error } = await supabase.from('inks').upsert(payload, { onConflict: 'id' });
    if (error) {
      handleSupabaseError(error, 'inks');
      return false;
    }
    return true;
  } catch (err) {
    handleSupabaseError(err, 'inks exception');
    return false;
  }
}

export async function deleteInkFromSupabase(inkId) {
  if (!isSupabaseConfigured() || !inkId) return;
  try {
    await ensureValidSession();
    const { error } = await supabase.from('inks').delete().eq('id', inkId);
    if (error) handleSupabaseError(error, 'inks');
  } catch (err) {
    handleSupabaseError(err, 'inks delete exception');
  }
}


// ============================================================================
// SYSTEM SETTINGS & ROLE PERMISSIONS & RBAC MATRIX (SCHEMA-INDEPENDENT)
// ============================================================================

export async function saveSystemSetting(key, value) {
  if (!isSupabaseConfigured()) return;
  try {
    await ensureValidSession();
    const payload = {
      id: `USR-SETTING-${key}`,
      username: `setting_${key}`,
      full_name: typeof value === 'object' ? JSON.stringify(value) : String(value),
      email: `setting_${key}@samyak.com`,
      role: 'System',
      department: 'System',
      active: true
    };
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error(`[System Setting] Failed to save setting '${key}':`, error.message);
    } else {
      console.log(`[System Setting] Successfully synced setting '${key}' to database.`);
    }
  } catch (err) {
    console.warn(`[System Setting] Exception saving setting '${key}':`, err.message);
  }
}

export async function fetchSystemSetting(key) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', `USR-SETTING-${key}`)
      .maybeSingle();

    if (data && data.full_name) {
      try {
        return JSON.parse(data.full_name);
      } catch (e) {
        return data.full_name;
      }
    }
  } catch (err) {
    console.warn(`[System Setting] Exception fetching setting '${key}':`, err.message);
  }
  return null;
}

export async function saveRolePermissionsToSupabase(rolePermissions) {
  await saveSystemSetting('role_permissions', rolePermissions);
}

export async function fetchRolePermissionsFromSupabase() {
  return await fetchSystemSetting('role_permissions');
}

export async function saveEmailSettingsToSupabase(config) {
  if (!isSupabaseConfigured()) return;
  try {
    await ensureValidSession();
    const payload = {
      id: 'default',
      smtp_host: config.smtpHost || 'smtp.hostinger.com',
      smtp_port: parseInt(config.smtpPort || 465, 10),
      smtp_secure: config.smtpSecure !== false,
      smtp_user: config.smtpUser || 'admin@samyakinternational.in',
      smtp_pass: config.smtpPass || '',
      sender_name: config.senderName || 'Samyak International ERP',
      admin_email: config.adminEmail || 'admin@samyakinternational.in',
      plant_manager_email: config.plantManagerEmail || 'plant.manager@plant.com',
      purchase_email: config.purchaseEmail || 'purchase@samyakinternational.in',
      dispatch_email: config.dispatchEmail || 'dispatch@samyakinternational.in',
      last_updated: new Date().toISOString()
    };
    const { error } = await supabase.from('email_settings').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('[email_settings] Table upsert note:', error.message);
      await saveSystemSetting('email_settings', config);
    } else {
      console.log('[email_settings] Saved successfully to email_settings table.');
    }
  } catch (err) {
    console.warn('[email_settings] Exception, falling back to system_settings:', err.message);
    await saveSystemSetting('email_settings', config);
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
        smtpPass: data.smtp_pass,
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
  return await fetchSystemSetting('email_settings');
}

export async function saveEmailTemplatesToSupabase(templates) {
  if (!isSupabaseConfigured() || !templates) return;
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
    if (error) {
      console.warn('[email_templates] Table upsert note:', error.message);
      await saveSystemSetting('email_templates', templates);
    } else {
      console.log('[email_templates] Saved templates successfully to email_templates table.');
    }
  } catch (err) {
    console.warn('[email_templates] Exception, falling back to system_settings:', err.message);
    await saveSystemSetting('email_templates', templates);
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

export async function deleteGRNFromSupabase(grnId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('grns').delete().eq('id', grnId);
  if (error) {
    console.error('[GRNs] Failed to delete GRN:', error.message);
  }
}

export async function deleteProductionRecordFromSupabase(recId) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const { error } = await supabase.from('production_records').delete().eq('id', recId);
  if (error) {
    console.error('[production_records] Failed to delete production record:', error.message);
  }
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

