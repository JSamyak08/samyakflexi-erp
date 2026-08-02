/**
 * Supabase Data Sync Service for Samyak Flexi-ERP
 * Handles live bidirectional CRUD operations with Supabase PostgreSQL
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { 
  initialOrders, 
  initialVendors, 
  initialInventory, 
  initialGRNs, 
  initialUsers, 
  initialProductionRecords 
} from '../factoryStore';
import { initialCylinders } from '../dataStore';

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
      structure: o.job_details?.structure || 'PET / PE',
      printWidthMm: o.job_details?.printWidthMm,
      repeatLengthMm: o.job_details?.repeatLengthMm,
      jobDetails: o.job_details,
      rawMaterialRequirements: o.raw_material_requirements
    }));
  } catch (err) {
    console.error("Error fetching orders from Supabase:", err);
    return [];
  }
}

export async function saveOrderToSupabase(order) {
  if (!isSupabaseConfigured()) return;
  const targetDateVal = order.targetDeliveryDate || order.deliveryDate || new Date().toISOString().split('T')[0];

  const payload = {
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

  const { error } = await supabase.from('orders').upsert(payload, { onConflict: 'id' });
  
  if (error) {
    console.error("Error saving order to Supabase:", error);
    throw error;
  }
}

export async function deleteOrderFromSupabase(orderId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  if (error) {
    console.error("Error deleting order from Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 2. VENDORS
// ============================================================================

export async function fetchVendors() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('vendors').select('*').order('name');
    if (error) throw error;
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
  const vendorId = vendor.id || `VEND-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const vendorName = vendor.name || vendor.companyName || 'New Vendor';
  const vendorCategory = vendor.category || (Array.isArray(vendor.materials) ? vendor.materials.join(', ') : 'Flexible Packaging Supplier');

  const { error } = await supabase.from('vendors').upsert({
    id: vendorId,
    name: vendorName,
    category: vendorCategory,
    contact_person: vendor.contactPerson || vendor.contact_person || '',
    phone: vendor.phone || '',
    email: vendor.email || '',
    gstin: vendor.gstin || '',
    address: vendor.address || '',
    rating: Number(vendor.rating) || 5.0
  }, { onConflict: 'id' });

  if (error) {
    console.error("Error saving vendor to Supabase:", error);
    throw error;
  }
}

export async function deleteVendorFromSupabase(vendorId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (error) {
    console.error("Error deleting vendor from Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 3. INVENTORY & FILM STOCK
// ============================================================================

export async function fetchInventory() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('inventory').select('*').order('item_name');
    if (error) throw error;
    if (!data) return [];

    return data.map(i => ({
      id: i.id,
      itemCode: i.item_code,
      itemName: i.item_name,
      category: i.category,
      filmType: i.film_type,
      micron: Number(i.micron) || 0,
      widthMm: Number(i.width_mm) || 0,
      availableQtyKg: Number(i.stock_qty_kg) || 0,
      reorderLevelKg: Number(i.reorder_level_kg) || 0,
      unitPrice: Number(i.unit_price) || 0,
      location: i.location
    }));
  } catch (err) {
    console.error("Error fetching inventory from Supabase:", err);
    return [];
  }
}

export async function saveInventoryItemToSupabase(item) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('inventory').upsert({
    id: item.id,
    item_code: item.itemCode,
    item_name: item.itemName,
    category: item.category,
    film_type: item.filmType,
    micron: item.micron,
    width_mm: item.widthMm,
    stock_qty_kg: item.availableQtyKg,
    reorder_level_kg: item.reorderLevelKg,
    unit_price: item.unitPrice,
    location: item.location
  });

  if (error) {
    console.error("Error saving inventory item to Supabase:", error);
    throw error;
  }
}

export async function deleteInventoryItemFromSupabase(itemId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('inventory').delete().eq('id', itemId);
  if (error) {
    console.error("Error deleting inventory from Supabase:", error);
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
      id: g.id,
      grnNo: g.grn_number,
      vendorId: g.vendor_id,
      poNumber: g.po_number,
      invoiceNo: g.invoice_number,
      receivedDate: g.received_date,
      itemName: g.item_name,
      receivedQtyKg: Number(g.received_qty_kg) || 0,
      status: g.status || 'Pending QC',
      qcNotes: g.qc_remarks
    }));
  } catch (err) {
    console.error("Error fetching GRNs from Supabase:", err);
    return [];
  }
}

export async function saveGRNToSupabase(grn) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('grns').upsert({
    id: grn.id,
    grn_number: grn.grnNo,
    vendor_id: grn.vendorId,
    po_number: grn.poNumber,
    invoice_number: grn.invoiceNo,
    received_date: grn.receivedDate,
    item_name: grn.itemName,
    received_qty_kg: grn.receivedQtyKg,
    status: grn.status || 'Pending QC',
    qc_remarks: grn.qcNotes
  });

  if (error) {
    console.error("Error saving GRN to Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 5. CYLINDERS
// ============================================================================

export async function fetchCylinders() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('cylinders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

    return data.map(c => ({
      id: c.id,
      sku: c.sku,
      jobName: c.job_name,
      colorsCount: Number(c.colors_count) || 0,
      cylinderCost: c.cylinder_cost,
      engravuresName: c.engravures_name,
      costBorneBy: c.cost_borne_by,
      costBorneType: c.cost_borne_type,
      clientGroup: c.client_group,
      circumferenceMm: Number(c.circumference_mm) || 0,
      faceLengthMm: Number(c.face_length_mm) || 0,
      layer1PrintedQtyKg: Number(c.layer1_printed_qty_kg) || 0,
      dispatchedQty: Number(c.dispatched_qty) || 0,
      utilisationLimit: Number(c.utilisation_limit) || 10000,
      status: c.status || 'Active In-Use'
    }));
  } catch (err) {
    console.error("Error fetching cylinders from Supabase:", err);
    return [];
  }
}

export async function saveCylinderToSupabase(cyl) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('cylinders').upsert({
    id: cyl.id,
    sku: cyl.sku,
    job_name: cyl.jobName,
    colors_count: cyl.colorsCount,
    cylinder_cost: cyl.cylinderCost,
    engravures_name: cyl.engravuresName,
    cost_borne_by: cyl.costBorneBy,
    cost_borne_type: cyl.costBorneType,
    client_group: cyl.clientGroup,
    circumference_mm: cyl.circumferenceMm,
    face_length_mm: cyl.faceLengthMm,
    layer1_printed_qty_kg: cyl.layer1PrintedQtyKg,
    dispatched_qty: cyl.dispatchedQty,
    utilisation_limit: cyl.utilisationLimit,
    status: cyl.status || 'Active In-Use'
  });

  if (error) {
    console.error("Error saving cylinder to Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 6. PRODUCTION RECORDS
// ============================================================================

export async function fetchProductionRecords() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('production_records').select('*').order('recorded_at', { ascending: false });
    if (error) throw error;
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
  const { error } = await supabase.from('production_records').upsert({
    id: record.id,
    order_id: record.orderId,
    job_name: record.jobName,
    operator_name: record.operatorName,
    shift: record.shift,
    gross_production_kg: record.grossProductionKg,
    net_usable_kg: record.netUsableKg,
    total_wastage_kg: record.totalWastageKg,
    wastage_percentage: record.wastagePercentage,
    status: record.status || 'Pending Plant Approval',
    process_logs: record.processLogs || []
  });

  if (error) {
    console.error("Error saving production record to Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 7. USERS
// ============================================================================

export async function fetchUsers() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('users').select('*').order('full_name');
    if (error) throw error;
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
  const { error } = await supabase.from('users').upsert({
    id: user.id,
    username: user.email?.toLowerCase(),
    full_name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    active: user.status === 'Active'
  });

  if (error) {
    console.error("Error saving user to Supabase:", error);
    throw error;
  }
}


// ============================================================================
// 8. JOB DATA SHEETS
// ============================================================================

export async function fetchJobDataSheets() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('job_datasheets').select('*').order('created_at', { ascending: false });
    if (error) throw error;
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
  const { error } = await supabase.from('job_datasheets').upsert({
    id: sheet.id || `JDS-${Date.now()}`,
    job_id: sheet.jobId,
    job_name: sheet.jobName,
    client_name: sheet.clientName,
    completion_date: sheet.completionDate,
    selling_price_per_kg: sheet.sellingPricePerKg,
    pre_cost_per_kg: sheet.preCostPerKg,
    post_cost_per_kg: sheet.postCostPerKg,
    profit_margin_pct: sheet.profitMarginPct,
    actual_ink_consumed_kg: sheet.actualInkConsumedKg,
    actual_solvents_consumed_kg: sheet.actualSolventsConsumedKg,
    actual_adhesive_consumed_kg: sheet.actualAdhesiveConsumedKg,
    actual_scrap_wastage_kg: sheet.actualScrapWastageKg,
    operator_notes: sheet.operatorNotes,
    created_by: sheet.createdBy || 'Plant Manager'
  });

  if (error) {
    console.error("Error saving job datasheet to Supabase:", error);
    throw error;
  }
}

export async function deleteJobDataSheetFromSupabase(sheetId) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from('job_datasheets').delete().eq('id', sheetId);
  if (error) {
    console.error("Error deleting job data sheet from Supabase:", error);
    throw error;
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
    if (error) throw error;
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
  const { error } = await supabase.from('inventory_rolls').upsert({
    barcode_id: roll.barcodeId,
    roll_type: roll.rollType || 'RAW_MATERIAL',
    item_id: roll.itemId,
    item_name: roll.itemName,
    category: roll.category || 'Film',
    job_name: roll.jobName,
    order_id: roll.orderId,
    micron: roll.micron,
    width_mm: roll.widthMm,
    inward_datetime: roll.inwardDatetime || new Date().toISOString(),
    vendor_name: roll.vendorName,
    invoice_no: roll.invoiceNo,
    batch_no: roll.batchNo,
    net_weight_kg: roll.netWeightKg,
    available_weight_kg: roll.availableWeightKg,
    input_barcode_ids: roll.inputBarcodeIds || [],
    station_id: roll.stationId || 'SCALE_1_INWARD',
    location_bay: roll.locationBay || 'Bay A',
    status: roll.status || 'In Stock'
  });

  if (error) {
    console.error("Error saving inventory roll to Supabase:", error);
    throw error;
  }
}

// ============================================================================
// 10. DISPATCH SHIPMENTS & PACKING LISTS
// ============================================================================

export async function fetchDispatchShipments() {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('dispatch_shipments').select('*').order('dispatch_date', { ascending: false });
    if (error) throw error;
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
  const { error } = await supabase.from('dispatch_shipments').upsert({
    dispatch_id: shipment.dispatchId,
    order_id: shipment.orderId,
    job_name: shipment.jobName,
    client_name: shipment.clientName,
    vehicle_no: shipment.vehicleNo,
    lr_no: shipment.lrNo,
    dispatch_date: shipment.dispatchDate || new Date().toISOString(),
    total_rolls: shipment.totalRolls,
    total_net_weight_kg: shipment.totalNetWeightKg,
    total_gross_weight_kg: shipment.totalGrossWeightKg,
    items: shipment.items || []
  });

  if (error) {
    console.error("Error saving dispatch shipment to Supabase:", error);
    throw error;
  }
}

// ============================================================================
// ONE-CLICK SEED MIGRATION: SEED ALL INITIAL FACTORY DATA TO SUPABASE
// ============================================================================

export async function seedAllDataToSupabase() {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase credentials are not configured.' };
  }

  try {
    // 1. Seed Vendors
    for (const v of initialVendors) {
      await saveVendorToSupabase(v);
    }

    // 2. Seed Orders
    for (const o of initialOrders) {
      await saveOrderToSupabase(o);
    }

    // 3. Seed Inventory
    for (const i of initialInventory) {
      await saveInventoryItemToSupabase(i);
    }

    // 4. Seed GRNs
    for (const g of initialGRNs) {
      await saveGRNToSupabase(g);
    }

    // 5. Seed Cylinders
    for (const c of initialCylinders) {
      await saveCylinderToSupabase(c);
    }

    // 6. Seed Production Records
    for (const r of initialProductionRecords) {
      await saveProductionRecordToSupabase(r);
    }

    // 7. Seed Users
    for (const u of initialUsers) {
      await saveUserToSupabase(u);
    }

    return {
      success: true,
      message: 'Successfully populated all initial factory tables in Supabase PostgreSQL!'
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to seed data: ${err.message}`
    };
  }
}
