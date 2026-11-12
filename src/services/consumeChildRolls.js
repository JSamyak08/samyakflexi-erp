import { isSupabaseConfigured, supabase } from './supabaseClient';
import { buildSfgNotesEnvelope, ensureValidSession } from './supabaseDataService';
import { buildChildStockRecords, requireConsumeOutputRecords } from './consumeOutputFirst';

export { buildChildStockRecords, requireConsumeOutputRecords };

export function childRecordsToRpcPayload(records, nowIso) {
  const updatedAt = nowIso || new Date().toISOString();
  return (records || []).map(({ sfg, roll }) => {
    const notes = buildSfgNotesEnvelope(sfg);
    return {
      parent_batch: sfg.parentSfgBatchCode,
      sfg: {
        sfg_batch_code: sfg.sfgBatchCode,
        sfg_type: sfg.sfgType,
        job_id: sfg.jobId || null,
        order_id: sfg.orderId || null,
        job_name: sfg.jobName || 'Untitled Job',
        job_code: sfg.jobCode || '',
        client_name: sfg.clientName || '',
        structure: sfg.structure || '',
        film_type: sfg.filmType || '',
        micron: Number(sfg.micron) || 0,
        width_mm: Number(sfg.widthMm) || 0,
        total_gross_kg: Number(sfg.totalGrossKg) || 0,
        gross_weight_kg: Number(sfg.grossWeightKg) || 0,
        tare_weight_kg: Number(sfg.tareWeightKg) || 0,
        total_net_kg: Number(sfg.totalNetKg) || 0,
        consumed_kg: 0,
        available_kg: Number(sfg.availableKg) || 0,
        total_meters: Number(sfg.totalMeters) || 0,
        rolls_count: 1,
        machine_name: sfg.machineName || '',
        operator_name: sfg.operatorName || '',
        shift: sfg.shift || '',
        storage_bay: sfg.storageBay || '',
        production_date: sfg.productionDate,
        status: sfg.status,
        notes,
        updated_at: updatedAt
      },
      roll: {
        barcode_id: roll.barcodeId,
        roll_type: roll.rollType,
        item_id: roll.itemId || '',
        item_name: roll.itemName || roll.jobName || 'Untitled Job',
        category: roll.category || '',
        job_name: roll.jobName || '',
        order_id: roll.orderId || '',
        micron: Number(roll.micron) || 0,
        width_mm: Number(roll.widthMm) || 0,
        inward_datetime: roll.inwardDatetime,
        production_date: roll.productionDate,
        vendor_name: '',
        invoice_no: '',
        batch_no: '',
        gross_weight_kg: Number(roll.grossWeightKg) || 0,
        tare_weight_kg: Number(roll.tareWeightKg) || 0,
        net_weight_kg: Number(roll.netWeightKg) || 0,
        available_weight_kg: Number(roll.availableWeightKg) || 0,
        length_meters: 0,
        joint_count: 0,
        qc_status: 'Approved',
        machine_name: roll.machineName || '',
        operator_name: roll.operatorName || '',
        shift: roll.shift || '',
        remarks: roll.remarks || '',
        core_dia: '',
        input_barcode_ids: roll.inputBarcodeIds || [],
        station_id: '',
        location_bay: roll.locationBay || '',
        status: roll.status || 'In Stock',
        sfg_type: roll.sfgType || '',
        job_code: roll.jobCode || '',
        client_name: roll.clientName || '',
        structure: '',
        metadata: {
          grnNo: '',
          packagingType: 'Roll',
          purchaseRatePerKg: 0,
          unitPrice: 0,
          unit: 'Kg',
          parentSfgBatchCode: roll.parentSfgBatchCode || ''
        }
      }
    };
  });
}

export async function saveConsumeChildRolls(records) {
  if (!isSupabaseConfigured()) {
    throw new Error('Cannot save child rolls: Supabase database connection is not available.');
  }
  requireConsumeOutputRecords(records);
  await ensureValidSession();
  const payload = childRecordsToRpcPayload(records);
  const { data, error } = await supabase.rpc('save_consume_child_rolls', { p_children: payload });
  if (error) {
    const err = new Error(error.message || 'Child rolls were not saved.');
    throw err;
  }
  if (Number(data) !== payload.length) {
    throw new Error(`Child roll save returned ${data}, expected ${payload.length}.`);
  }
  return data;
}
