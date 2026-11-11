function childIsFg(outRoll, logEntry) {
  return outRoll?.outputType === 'FG'
    || logEntry?.targetProcess === 'Slitting & Rewinding'
    || logEntry?.targetProcess === 'Pouching / Bag Making';
}

/**
 * In-memory stock rows for each output roll.
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

export function requireConsumeOutputRecords(records) {
  if (!Array.isArray(records) || records.length < 1) {
    throw new Error('Child roll save expects at least one output roll.');
  }
}

/**
 * Rolls a consume must persist as stock.
 * One filled output row and several child rows are the same write.
 * A row without a barcode or a net weight is not an output roll.
 */
export function rollsToPersist(logEntry) {
  const listed = Array.isArray(logEntry?.outputRolls)
    ? logEntry.outputRolls.filter((roll) => roll && Number(roll.netWeightKg) > 0 && String(roll.barcode || '').trim())
    : [];
  if (listed.length > 0) return listed;
  const one = logEntry?.outputRoll;
  const barcode = String(one?.barcode || one?.barcodeId || '').trim();
  if (one && Number(one.netWeightKg) > 0 && barcode) {
    return [{ ...one, barcode }];
  }
  return [];
}

/**
 * Write every output roll before the printed lot or Substrate 2 is deducted.
 * The caller stops when this throws, so a failed output write cannot post
 * a consumption that a later retry would deduct again.
 */
export async function persistConsumeOutputsBeforeStock({ parentItem, logEntry, saveOutputs, nowIso }) {
  const outputRolls = rollsToPersist(logEntry);
  if (outputRolls.length === 0) {
    return { outputRolls: [], records: [] };
  }
  const records = buildChildStockRecords({ parentItem, logEntry, outputRolls, nowIso });
  await saveOutputs(records);
  return { outputRolls, records };
}
