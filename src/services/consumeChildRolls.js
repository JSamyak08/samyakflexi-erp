import { isSupabaseConfigured, supabase } from './supabaseClient';
import { buildSfgNotesEnvelope, ensureValidSession } from './supabaseDataService';

function childIsFg(outRoll, logEntry) {
  return outRoll?.outputType === 'FG'
    || logEntry?.targetProcess === 'Slitting & Rewinding'
    || logEntry?.targetProcess === 'Pouching / Bag Making';
}

/**
 * In-memory stock rows for each child output.
 * Barcode text is the batch code. The database row id is left for
 * gen_random_uuid() inside save_consume_child_rolls so the browser does not
 * invent a colliding id.
 */
export function buildChildStockRecords({ parentItem, logEntry, outputRolls, nowIso }) {
  const parentBatch = parentItem?.sfgBatchCode || parentItem?.id || '';
  const producedAt = nowIso || new Date().toISOString();
  return (outputRolls || []).map((outRoll) => {
    const isFG = childIsFg(outRoll, logEntry);
    const barcode = outRoll.barcode;
    const outputNetKg = Number(outRoll.netWeightKg) || 0;
    const outputGrossKg = Number(outRoll.grossWeightKg) || outputNetKg;
    const outputTareKg = Number(outRoll.tareWeightKg) || 0;
    const note = isFG
      ? `Finished Goods derived from ${logEntry.targetProcess} of ${parentBatch}`
      : `Produced from ${logEntry.targetProcess} of ${parentBatch}`;

    const sfg = {
      id: barcode,
      sfgBatchCode: barcode,
      sfgType: isFG ? 'Finished Goods (FG)' : 'Laminated / Processed Rolls',
      category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
      rollType: isFG ? 'FG' : 'SFG',
      orderId: parentItem?.orderId || logEntry?.orderId,
      jobCode: parentItem?.jobCode || '',
      jobName: parentItem?.jobName || 'Untitled Job',
      clientName: parentItem?.clientName || '',
      filmType: parentItem?.filmType || '',
      micron: parentItem?.micron || 0,
      widthMm: parentItem?.widthMm || 0,
      totalGrossKg: outputGrossKg,
      grossWeightKg: outputGrossKg,
      tareWeightKg: outputTareKg,
      totalNetKg: outputNetKg,
      consumedKg: 0,
      availableKg: outputNetKg,
      dispatchedKg: 0,
      pouchCount: Number(logEntry?.pouchCount) || Number(outRoll.pouchCount) || 0,
      rollsCount: 1,
      machineName: logEntry?.targetMachine || '',
      operatorName: logEntry?.operatorName || '',
      shift: logEntry?.shift || '',
      storageBay: outRoll.storageBay || (isFG ? 'FG Warehouse' : 'Bay A'),
      productionDate: logEntry?.date || producedAt.split('T')[0],
      status: isFG ? 'Ready for Dispatch' : 'In Stock (WIP)',
      notes: note,
      consumptionHistory: [],
      parentSfgBatchCode: parentBatch,
      parentBarcode: parentBatch
    };

    const roll = {
      id: barcode,
      barcodeId: barcode,
      rollType: isFG ? 'FINISHED_GOODS' : 'SEMI_FINISHED_GOODS',
      category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
      jobName: parentItem?.jobName || 'Untitled Job',
      jobCode: parentItem?.jobCode || '',
      orderId: parentItem?.orderId || logEntry?.orderId || '',
      clientName: parentItem?.clientName || '',
      customerName: parentItem?.clientName || '',
      filmType: parentItem?.filmType || '',
      micron: parentItem?.micron || 0,
      widthMm: parentItem?.widthMm || 0,
      grossWeightKg: outputGrossKg,
      tareWeightKg: outputTareKg,
      netWeightKg: outputNetKg,
      availableWeightKg: outputNetKg,
      dispatchedKg: 0,
      pouchCount: sfg.pouchCount,
      machineName: logEntry?.targetMachine || '',
      operatorName: logEntry?.operatorName || '',
      shift: logEntry?.shift || '',
      locationBay: outRoll.storageBay || (isFG ? 'FG Warehouse' : 'Bay A'),
      status: isFG ? 'Ready for Dispatch' : 'In Stock (SFG)',
      sfgType: isFG ? 'Finished Goods (FG)' : 'Laminated Rolls',
      remarks: isFG
        ? `Finished Goods derived from ${logEntry.targetProcess}`
        : `Produced from ${logEntry.targetProcess}`,
      inwardDatetime: producedAt,
      productionDate: sfg.productionDate,
      inputBarcodeIds: parentBatch ? [parentBatch] : [],
      parentSfgBatchCode: parentBatch,
      itemName: `${parentItem?.jobName || 'Untitled Job'} child roll`
    };

    return { sfg, roll };
  });
}

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
  if (!Array.isArray(records) || records.length < 2) {
    throw new Error('Child roll save expects at least two output rolls.');
  }
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
