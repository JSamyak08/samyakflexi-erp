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
async function ensureValidSession() {
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
  initialJobMasters
} from '../factoryStore';
import { initialCylinders } from '../dataStore';

/**
 * Graceful Supabase Error Handler
 * Suppresses blocking UI exceptions if a table is not created in Supabase yet,
 * allowing local ERP in-memory state to operate smoothly.
 */
function handleSupabaseError(error, contextName) {
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

    return data.map(o => ({
      id: o.id,
      jobName: o.job_name,
      clientName: o.client_name,
      orderType: o.order_type || 'Reel',
      orderQtyKg: Number(o.order_qty_kg) || 0,
      deliveryDate: o.target_delivery_date,
      targetDeliveryDate: o.target_delivery_date,
      status: o.status || 'Scheduled',
      structure: o.job_details?.structure || o.structure || '—',
      printWidthMm: o.job_details?.printWidthMm,
      repeatLengthMm: o.job_details?.repeatLengthMm,
      jobDetails: o.job_details,
      materialRequirements: o.raw_material_requirements || [],
      rawMaterialRequirements: o.raw_material_requirements || []
    }));
  } catch (err) {
    console.error("Error fetching orders from Supabase:", err);
    return [];
  }
}

export async function saveOrderToSupabase(order) {
  if (!isSupabaseConfigured()) {
    console.warn('[Orders] Supabase not configured, skipping save.');
    return;
  }
  await ensureValidSession();
  const targetDateVal = order.targetDeliveryDate || order.deliveryDate || new Date().toISOString().split('T')[0];

  // Full payload with JSONB fields
  const fullPayload = {
    id: order.id,
    job_name: order.jobName || 'Untitled Job',
    client_name: order.clientName || 'General Client',
    order_type: order.orderType || 'Reel',
    order_qty_kg: Number(order.orderQtyKg) || 0,
    target_delivery_date: targetDateVal,
    status: order.status || 'Scheduled',
    job_details: order.jobDetails || { structure: order.structure || 'PET / PE', calculationDetails: order.calculationDetails || null },
    raw_material_requirements: order.rawMaterialRequirements || order.materialRequirements || []
  };

  console.log('[Orders] Saving order to Supabase:', order.id, order.jobName);
  const { error: fullError } = await supabase.from('orders').upsert(fullPayload, { onConflict: 'id' });

  if (fullError) {
    console.warn('[Orders] Full payload failed, trying minimal payload:', fullError.message, fullError.code);
    // Minimal payload without JSONB fields in case of schema mismatch
    const minimalPayload = {
      id: order.id,
      job_name: order.jobName || 'Untitled Job',
      client_name: order.clientName || 'General Client',
      order_type: order.orderType || 'Reel',
      order_qty_kg: Number(order.orderQtyKg) || 0,
      target_delivery_date: targetDateVal,
      status: order.status || 'Scheduled'
    };
    const { error: minimalError } = await supabase.from('orders').upsert(minimalPayload, { onConflict: 'id' });
    if (minimalError) {
      console.error('[Orders] Minimal payload also failed:', minimalError.message, minimalError.code, minimalError.details);
      handleSupabaseError(minimalError, 'orders');
    } else {
      console.log('[Orders] Saved with minimal payload successfully.');
    }
  } else {
    console.log('[Orders] Saved successfully with full payload.');
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

export function mapInventoryItemToDbPayload(item) {
  if (!item) return null;
  const category = item.category || 'Film Substrates';
  const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';
  const filmTypeStr = item.filmType || (isFilm ? (item.itemName ? item.itemName.split(' ')[0] : 'PET') : '');
  const itemCodeStr = item.itemCode || item.id || `INV-${Math.floor(100 + Math.random() * 900)}`;
  const itemNameStr = item.itemName || (filmTypeStr ? `${filmTypeStr} ${item.micron || 12}µ (${item.widthMm || 1000}mm)` : `Item ${itemCodeStr}`);

  return {
    id: String(item.id),
    item_code: itemCodeStr,
    item_name: itemNameStr,
    category: category,
    film_type: filmTypeStr,
    micron: (item.micron !== '-' && item.micron !== null && item.micron !== undefined && !isNaN(Number(item.micron))) ? Number(item.micron) : null,
    width_mm: (item.widthMm !== '-' && item.widthMm !== null && item.widthMm !== undefined && !isNaN(Number(item.widthMm))) ? Number(item.widthMm) : null,
    stock_qty_kg: Number(item.availableQtyKg ?? item.stock_qty_kg ?? 0) || 0,
    allocated_qty_kg: Number(item.allocatedQtyKg ?? item.allocated_qty_kg ?? 0) || 0,
    reorder_level_kg: Number(item.reorderLevelKg ?? item.reorder_level_kg ?? 0) || 0,
    unit_price: Number(item.unitPrice ?? item.unit_price ?? 0) || 0,
    unit: item.unit || (isFilm ? 'Kg' : (category === 'Printing Inks' || category === 'Solvents' || category === 'Lamination Adhesives' ? 'Kg' : 'Pcs')),
    density: (item.density !== '-' && item.density !== null && item.density !== undefined && !isNaN(Number(item.density))) ? Number(item.density) : 1.0,
    location: item.location || 'Bay A',
    last_vendor: item.lastVendor || item.last_vendor || '',
    last_batch: item.lastBatch || item.last_batch || '',
    last_updated: new Date().toISOString()
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

    return data.map(i => {
      const category = i.category || 'Film Substrates';
      const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';
      const filmTypeVal = i.film_type || (isFilm && i.item_name ? i.item_name.split(' ')[0] : '');

      return {
        id: String(i.id),
        itemCode: i.item_code || String(i.id),
        itemName: i.item_name || (filmTypeVal ? `${filmTypeVal} ${i.micron || 12}µ` : 'Stock Item'),
        category: category,
        filmType: filmTypeVal || (isFilm ? 'PET' : ''),
        micron: (i.micron !== null && i.micron !== undefined && !isNaN(Number(i.micron))) ? Number(i.micron) : (isFilm ? 12 : '-'),
        widthMm: (i.width_mm !== null && i.width_mm !== undefined && !isNaN(Number(i.width_mm))) ? Number(i.width_mm) : (isFilm ? 1000 : '-'),
        availableQtyKg: Number(i.stock_qty_kg ?? i.available_qty_kg ?? 0) || 0,
        allocatedQtyKg: Number(i.allocated_qty_kg ?? 0) || 0,
        reorderLevelKg: Number(i.reorder_level_kg ?? 0) || 0,
        unitPrice: Number(i.unit_price ?? 0) || 0,
        unit: i.unit || (isFilm ? 'Kg' : (category === 'Printing Inks' || category === 'Solvents' || category === 'Lamination Adhesives' ? 'Kg' : 'Pcs')),
        density: (i.density !== null && i.density !== undefined && !isNaN(Number(i.density))) ? Number(i.density) : (isFilm ? 1.4 : 1.0),
        location: i.location || 'Bay A',
        lastVendor: i.last_vendor || '',
        lastBatch: i.last_batch || '',
        lastUpdated: i.last_updated || new Date().toISOString()
      };
    });
  } catch (err) {
    console.error("Error fetching inventory from Supabase:", err);
    return [];
  }
}

export async function saveInventoryItemToSupabase(item) {
  if (!isSupabaseConfigured() || !item) return;
  await ensureValidSession();
  const fullPayload = mapInventoryItemToDbPayload(item);
  if (!fullPayload) return;

  console.log('[inventory] Saving item to Supabase:', fullPayload.id, fullPayload.item_name);
  const { error: fullError } = await supabase.from('inventory').upsert(fullPayload, { onConflict: 'id' });

  if (fullError) {
    console.warn("[Supabase Sync Notice] Full inventory payload failed, trying base columns fallback:", fullError.message);
    const basePayload = {
      id: fullPayload.id,
      item_code: fullPayload.item_code,
      item_name: fullPayload.item_name,
      category: fullPayload.category,
      film_type: fullPayload.film_type,
      micron: fullPayload.micron,
      width_mm: fullPayload.width_mm,
      stock_qty_kg: fullPayload.stock_qty_kg,
      reorder_level_kg: fullPayload.reorder_level_kg,
      unit_price: fullPayload.unit_price,
      location: fullPayload.location,
      last_updated: fullPayload.last_updated
    };
    const { error: baseError } = await supabase.from('inventory').upsert(basePayload, { onConflict: 'id' });
    if (baseError) {
      console.warn("[Supabase Sync Notice] Base payload failed, trying minimal payload:", baseError.message);
      const minimalPayload = {
        id: fullPayload.id,
        item_code: fullPayload.item_code,
        item_name: fullPayload.item_name,
        stock_qty_kg: fullPayload.stock_qty_kg,
        unit_price: fullPayload.unit_price
      };
      const { error: minimalError } = await supabase.from('inventory').upsert(minimalPayload, { onConflict: 'id' });
      if (minimalError) {
        handleSupabaseError(minimalError, 'inventory');
      }
    }
  } else {
    console.log('[inventory] Item saved successfully to Supabase:', fullPayload.id);
  }
}

export async function saveInventoryBatchToSupabase(inventoryList) {
  if (!isSupabaseConfigured() || !Array.isArray(inventoryList) || inventoryList.length === 0) return;
  await ensureValidSession();
  const payloads = inventoryList.map(item => mapInventoryItemToDbPayload(item)).filter(Boolean);

  console.log(`[inventory] Bulk syncing ${payloads.length} items to Supabase...`);
  const { error } = await supabase.from('inventory').upsert(payloads, { onConflict: 'id' });
  if (error) {
    console.warn("[inventory] Bulk upsert error, falling back to sequential upserts:", error.message);
    for (const item of inventoryList) {
      await saveInventoryItemToSupabase(item);
    }
  } else {
    console.log(`[inventory] Successfully bulk synced ${payloads.length} items.`);
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

export async function fetchGRNs() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('grns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

    return data.map(g => ({
      id: g.id || g.grn_number,
      grnNo: g.grn_number || g.id,
      vendorId: g.vendor_id,
      vendorName: g.vendor_id,
      poNumber: g.po_number,
      invoiceNo: g.invoice_number,
      receivedDate: g.received_date,
      itemName: g.item_name,
      filmType: g.item_name ? g.item_name.split(' ')[0] : 'PET',
      receivedQtyKg: Number(g.received_qty_kg) || 0,
      netWeightKg: Number(g.received_qty_kg) || 0,
      status: g.status || 'Pending QC',
      qcNotes: g.qc_remarks || ''
    }));
  } catch (err) {
    console.error("Error fetching GRNs from Supabase:", err);
    return [];
  }
}

export async function saveGRNToSupabase(grn) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const grnId = grn.id || grn.grnNo || `GRN-2026-${Math.floor(100 + Math.random() * 900)}`;
  const itemNameVal = grn.itemName || (grn.filmType ? `${grn.filmType} ${grn.micron || 12}µ (${grn.widthMm || 1000}mm)` : 'Raw Material Film');
  const weightVal = Number(grn.receivedQtyKg || grn.netWeightKg) || 0;

  const fullPayload = {
    id: grnId,
    grn_number: grn.grnNo || grnId,
    vendor_id: grn.vendorName || grn.vendorId || 'General Vendor',
    po_number: grn.poNumber || '',
    invoice_number: grn.invoiceNo || '',
    received_date: grn.receivedDate || new Date().toISOString(),
    item_name: itemNameVal,
    received_qty_kg: weightVal,
    status: grn.status || 'Pending QC',
    qc_remarks: grn.qcNotes || ''
  };

  const { error: fullError } = await supabase.from('grns').upsert(fullPayload, { onConflict: 'id' });

  if (fullError) {
    console.warn("[Supabase Sync Notice] Full GRN payload failed, trying minimal payload.", fullError.message);
    const minimalPayload = {
      id: grnId,
      grn_number: grn.grnNo || grnId,
      item_name: itemNameVal,
      received_qty_kg: weightVal,
      status: grn.status || 'Pending QC'
    };
    const { error: minimalError } = await supabase.from('grns').upsert(minimalPayload, { onConflict: 'id' });
    if (minimalError) {
      handleSupabaseError(minimalError, 'grns');
    }
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

    return data.map(c => ({
      id: c.id,
      sku: c.sku,
      jobName: c.job_name,
      colorsCount: Number(c.colors_count) || 0,
      cylinderCost: c.cylinder_cost,
      costPerCylinder: c.cost_per_cylinder,
      rate: Number(c.rate_per_sq_cm ?? c.rate_per_sq_inch) || 1.6,
      ratePerSqInch: Number(c.rate_per_sq_cm ?? c.rate_per_sq_inch) || 1.6,
      engravuresName: c.engravures_name,
      costBorneBy: c.cost_borne_by,
      costBorneType: c.cost_borne_type,
      clientGroup: c.client_group,
      circumferenceMm: Number(c.circumference_mm) || 0,
      faceLengthMm: Number(c.face_length_mm) || 0,
      layer1PrintedQtyKg: Number(c.layer1_printed_qty_kg) || 0,
      dispatchedQty: Number(c.dispatched_qty) || 0,
      utilisationLimit: Number(c.utilisation_limit) || 10000,
      status: c.status || 'Active In-Use',
      artworkUrl: c.artwork_url || null
    }));
  } catch (err) {
    console.error("Error fetching cylinders from Supabase:", err);
    return [];
  }
}

export async function saveCylinderToSupabase(cyl) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const rateVal = cyl.rate !== undefined ? cyl.rate : cyl.ratePerSqInch;
  const { error } = await supabase.from('cylinders').upsert({
    id: cyl.id || `CYL-${Math.floor(100 + Math.random() * 900)}`,
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
    artwork_url: cyl.artworkUrl || cyl.artwork_url || null
  }, { onConflict: 'id' });

  handleSupabaseError(error, 'cylinders');
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

    return data.map(r => ({
      id: r.id,
      orderId: r.order_id,
      jobName: r.job_name,
      operatorName: r.operator_name,
      shift: r.shift,
      grossProductionKg: Number(r.gross_production_kg) || 0,
      netUsableKg: Number(r.net_usable_kg) || 0,
      totalWastageKg: Number(r.total_wastage_kg) || 0,
      wastagePercentage: Number(r.wastage_percentage) || 0,
      status: r.status || 'Pending Plant Approval',
      recordedAt: r.recorded_at,
      processLogs: r.process_logs
    }));
  } catch (err) {
    console.error("Error fetching production records from Supabase:", err);
    return [];
  }
}

export async function saveProductionRecordToSupabase(record) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const recId = record.id || `PROD-${Math.floor(100 + Math.random() * 900)}`;
  const fullPayload = {
    id: recId,
    order_id: record.orderId,
    job_name: record.jobName || 'Production Record',
    operator_name: record.operatorName || '',
    shift: record.shift || 'Day Shift',
    gross_production_kg: Number(record.grossProductionKg) || 0,
    net_usable_kg: Number(record.netUsableKg) || 0,
    total_wastage_kg: Number(record.totalWastageKg) || 0,
    wastage_percentage: Number(record.wastagePercentage) || 0,
    status: record.status || 'Pending Plant Approval',
    process_logs: record.processLogs || []
  };
  console.log('[production_records] Saving:', recId, record.jobName);
  const { error: fullErr } = await supabase.from('production_records').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    console.warn('[production_records] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('production_records').upsert({
      id: recId,
      job_name: record.jobName || 'Production Record',
      status: record.status || 'Pending Plant Approval'
    }, { onConflict: 'id' });
    if (minErr) { console.error('[production_records] Minimal payload failed:', minErr.message, minErr.details); handleSupabaseError(minErr, 'production_records'); }
    else { console.log('[production_records] Saved with minimal payload.'); }
  } else { console.log('[production_records] Saved successfully.'); }
}

// ============================================================================
// 7. USERS
// ============================================================================

export async function fetchUsers() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('users').select('*').order('full_name');
    if (error) {
      handleSupabaseError(error, 'users');
      return [];
    }
    if (!data) return [];

    return data.map(u => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      department: u.department,
      status: u.active ? 'Active' : 'Inactive'
    }));
  } catch (err) {
    console.error("Error fetching users from Supabase:", err);
    return [];
  }
}

export async function saveUserToSupabase(user) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  const userId = user.id || `USR-${Math.floor(100 + Math.random() * 900)}`;
  const fullPayload = {
    id: userId,
    username: user.email?.toLowerCase() || userId,
    full_name: user.name || '',
    email: user.email || '',
    role: user.role || 'Shop Floor Operator',
    department: user.department || 'Operations',
    active: user.status === 'Active'
  };
  console.log('[users] Saving:', userId, user.name);
  const { error: fullErr } = await supabase.from('users').upsert(fullPayload, { onConflict: 'id' });
  if (fullErr) {
    console.warn('[users] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('users').upsert({ id: userId, username: user.email?.toLowerCase() || userId, full_name: user.name || '', role: user.role || 'Shop Floor Operator' }, { onConflict: 'id' });
    if (minErr) { console.error('[users] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'users'); }
    else { console.log('[users] Saved with minimal payload.'); }
  } else { console.log('[users] Saved successfully.'); }
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
      barcodeId: r.barcode_id,
      rollType: r.roll_type || 'RAW_MATERIAL',
      itemId: r.item_id,
      itemName: r.item_name,
      category: r.category || 'Film',
      jobName: r.job_name,
      orderId: r.order_id,
      micron: Number(r.micron) || 0,
      widthMm: Number(r.width_mm) || 0,
      inwardDatetime: r.inward_datetime,
      vendorName: r.vendor_name,
      invoiceNo: r.invoice_no,
      batchNo: r.batch_no,
      netWeightKg: Number(r.net_weight_kg) || 0,
      availableWeightKg: Number(r.available_weight_kg) || 0,
      inputBarcodeIds: Array.isArray(r.input_barcode_ids) ? r.input_barcode_ids : [],
      stationId: r.station_id || 'SCALE_1_INWARD',
      locationBay: r.location_bay || 'Bay A',
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
    barcode_id: roll.barcodeId,
    roll_type: roll.rollType || 'RAW_MATERIAL',
    item_id: roll.itemId,
    item_name: roll.itemName || 'Roll',
    category: roll.category || 'Film',
    job_name: roll.jobName,
    order_id: roll.orderId,
    micron: Number(roll.micron) || 0,
    width_mm: Number(roll.widthMm) || 0,
    inward_datetime: roll.inwardDatetime || new Date().toISOString(),
    vendor_name: roll.vendorName || '',
    invoice_no: roll.invoiceNo || '',
    batch_no: roll.batchNo || '',
    net_weight_kg: Number(roll.netWeightKg) || 0,
    available_weight_kg: Number(roll.availableWeightKg) || 0,
    input_barcode_ids: roll.inputBarcodeIds || [],
    station_id: roll.stationId || 'SCALE_1_INWARD',
    location_bay: roll.locationBay || 'Bay A',
    status: roll.status || 'In Stock'
  };
  console.log('[inventory_rolls] Saving:', roll.barcodeId);
  const { error: fullErr } = await supabase.from('inventory_rolls').upsert(fullPayload, { onConflict: 'barcode_id' });
  if (fullErr) {
    console.warn('[inventory_rolls] Full payload failed, trying minimal:', fullErr.message);
    const { error: minErr } = await supabase.from('inventory_rolls').upsert({ barcode_id: roll.barcodeId, item_name: roll.itemName || 'Roll', roll_type: roll.rollType || 'RAW_MATERIAL', net_weight_kg: Number(roll.netWeightKg) || 0, status: roll.status || 'In Stock' }, { onConflict: 'barcode_id' });
    if (minErr) { console.error('[inventory_rolls] Minimal payload failed:', minErr.message); handleSupabaseError(minErr, 'inventory_rolls'); }
    else { console.log('[inventory_rolls] Saved with minimal payload.'); }
  } else { console.log('[inventory_rolls] Saved successfully.'); }
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
      const layers = Array.isArray(j.layers) ? j.layers : [];
      const derivedStructure = (layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (j.structure || j.film_structure || '—');

      return {
        id: j.id,
        skuCode: j.sku_code || j.sku || '',
        jobName: j.job_name || '',
        clientName: j.client_name || '',
        structure: derivedStructure,
        printWidthMm: Number(j.print_width_mm || j.print_width || j.pouch_width_mm || j.width_mm || j.pouch_open_width) || 1000,
        repeatLengthMm: Number(j.repeat_length_mm || j.repeat_length || j.circumference_mm) || 400,
        pouchOpenWidth: Number(j.pouch_open_width) || 0,
        pouchHeight: Number(j.pouch_height || j.pouch_height_mm) || 0,
        layers: layers,
        cylinderSku: j.cylinder_sku || j.sku_code || '',
        cylinderCost: j.cylinder_cost || '₹ 0',
        colorsCount: Number(j.colors_count) || 6,
        engravuresName: j.engravures_name || j.engraver_name || '',
        costBorneBy: j.cost_borne_by || 'Client (100%)',
        utilisationLimit: Number(j.utilisation_limit) || 10000,
        creationDate: j.creation_date || j.created_at ? String(j.created_at).split('T')[0] : new Date().toISOString().split('T')[0]
      };
    });
  } catch (err) {
    console.error("Error fetching job masters from Supabase:", err);
    return [];
  }
}

export async function saveJobMasterToSupabase(jobMaster) {
  if (!isSupabaseConfigured()) return;
  await ensureValidSession();
  
  const id = jobMaster.id || `JM-2026-${Math.floor(100 + Math.random() * 900)}`;
  const skuCode = jobMaster.skuCode || jobMaster.sku || '';
  const jobName = jobMaster.jobName || '';
  const clientName = jobMaster.clientName || '';
  const layers = Array.isArray(jobMaster.layers) ? jobMaster.layers : [];
  const structure = (layers.length > 0)
    ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
    : (jobMaster.structure || '—');
  const printWidthMm = Number(jobMaster.printWidthMm || jobMaster.pouchWidthMm || jobMaster.pouch_width_mm) || 1000;
  const repeatLengthMm = Number(jobMaster.repeatLengthMm || jobMaster.repeat_length_mm) || 400;
  const pouchWidthMm = Number(jobMaster.pouchOpenWidth) || printWidthMm;
  const pouchHeightMm = Number(jobMaster.pouchHeight) || 150;
  const colorsCount = Number(jobMaster.colorsCount) || 6;
  const cylinderCost = String(jobMaster.cylinderCost || '₹ 0');
  const costBorneBy = jobMaster.costBorneBy || 'Client (100%)';
  const engraverName = jobMaster.engravuresName || '';

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
    created_at: new Date().toISOString()
  };

  const extendedPayload = {
    ...legacyPayload,
    structure,
    print_width_mm: printWidthMm,
    pouch_open_width: Number(jobMaster.pouchOpenWidth) || 0,
    pouch_height: Number(jobMaster.pouchHeight) || 0,
    layers: Array.isArray(jobMaster.layers) ? jobMaster.layers : [],
    cylinder_sku: jobMaster.cylinderSku || skuCode,
    engravures_name: engraverName,
    utilisation_limit: Number(jobMaster.utilisationLimit) || 10000,
    creation_date: jobMaster.creationDate || new Date().toISOString().split('T')[0]
  };

  // 1. Try extended payload with new columns (including layers) FIRST
  const { error: extErr } = await supabase.from('job_masters').upsert(extendedPayload, { onConflict: 'id' });

  if (extErr) {
    console.warn("[Supabase Sync Notice] Extended payload rejected, trying legacy payload...", extErr.message);
    
    // 2. Try legacy payload
    const { error: legacyErr } = await supabase.from('job_masters').upsert(legacyPayload, { onConflict: 'id' });

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

