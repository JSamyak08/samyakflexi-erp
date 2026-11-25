/**
 * Manual SFG / FG batch entry.
 *
 * One production record per order (PR-{orderId} when none exists).
 * Printing updates the existing SFG-LOT-{orderId}. Later passes write one
 * SFG- or FG- batch and reduce the parent lot. Film, ink, and adhesive
 * become materials_list lines the production-record ledger trigger already
 * posts. There is no second ledger and no inventory master for the batch.
 *
 * Opening balance is stock that was already in the plant before this ERP
 * inventory. It is listed on PR-{orderId} for audit only. It does not change
 * materials_list, input_rolls_list, sfg_consumptions, process quantity,
 * meters, or wastage, and it does not reduce a parent lot.
 */

import { planPrintingSfgLot, printingSfgLotCode } from './printingSfgLot.js';
import { roundFilmKg } from './printingFilmIssue.js';

export const LEDGER_SOURCE = 'sfg-fg-batch';

export const SLITTED_FG_TYPE = 'Slitted Rolls';

export const OPENING_BALANCE_BADGE = 'Opening balance';

export const OPENING_BALANCE_TOGGLE_LABEL = 'Opening balance (stock from before ERP inventory, no inventory deductions)';

/** Kilograms allowed above metres × width × micron × density + recorded waste. */
export const FILM_MASS_TOLERANCE_KG = 0.5;

export function filmMassCeilingKg({ meters, widthMm, micron, density, wasteKg, toleranceKg = FILM_MASS_TOLERANCE_KG } = {}) {
  const length = kg(meters);
  const width = kg(widthMm);
  const thick = kg(micron);
  const dens = kg(density);
  if (!(length > 0) || !(width > 0) || !(thick > 0) || !(dens > 0)) return null;
  const theoretical = (length * width * thick * dens) / 1000000;
  return roundFilmKg(theoretical + (kg(wasteKg) || 0) + (kg(toleranceKg) || 0));
}

/** Share printed metres across rolls by net weight. The last roll takes the remainder. */
export function shareMetersByWeight(rolls, meters) {
  const outputs = Array.isArray(rolls) ? rolls : [];
  const pool = kg(meters);
  const total = outputs.reduce((sum, roll) => sum + (kg(roll?.netWeightKg) || 0), 0);
  if (!(pool > 0) || !(total > 0) || outputs.length === 0) return outputs;
  let used = 0;
  return outputs.map((roll, index) => {
    if (index === outputs.length - 1) {
      return { ...roll, lengthMeters: roundFilmKg(Math.max(0, pool - used)) };
    }
    const share = roundFilmKg(((kg(roll.netWeightKg) || 0) / total) * pool);
    used = roundFilmKg(used + share);
    return { ...roll, lengthMeters: share };
  });
}

export function openingBalanceStoreLabel(item) {
  return item?.isOpeningBalance === true ? OPENING_BALANCE_BADGE : '';
}

export function processRecordBlockVisible({ selectedType, isOpeningBalance, processKind } = {}) {
  if (isOpeningBalance || !selectedType) return false;
  return processKind === 'printing' || processKind === 'lamination-1' || processKind === 'lamination-2';
}

const PROCESS_MEASURE_FIELDS = [
  'laminationMetersL1',
  'laminationMetersL2',
  'slittingMeters',
  'pouchingMeters',
  'actualAdhesiveGsmL2'
];

export function processKindForType(stageType) {
  const text = String(stageType || '');
  if (/printed/i.test(text)) return 'printing';
  if (/slit/i.test(text)) return 'slitting';
  if (/second pass/i.test(text)) return 'lamination-2';
  if (/first pass|laminat/i.test(text)) return 'lamination-1';
  return '';
}

export function productionRecordId(orderId, existing) {
  const current = String(existing?.id || '').trim();
  if (current) return current;
  return `PR-${String(orderId || '').trim()}`;
}

export function manualBatchCode({ mode, jobCode, orderId, now = Date.now() }) {
  const prefix = mode === 'FG' ? 'FG' : 'SFG';
  const clean = String(jobCode || orderId || 'JOB').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'JOB';
  const tail = String(now).slice(-4);
  return `${prefix}-${clean}-${tail}`;
}

function text(value) {
  return String(value ?? '').trim();
}

function kg(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? roundFilmKg(number) : null;
}

function requiredNumber(value, label, { allowZero = false } = {}) {
  const number = kg(value);
  if (number === null) return `${label} is required.`;
  if (number < 0) return `${label} cannot be negative.`;
  if (!allowZero && !(number > 0)) return `${label} must be greater than 0.`;
  return '';
}

function ledgerBarcode(raw) {
  const code = text(raw);
  if (!code) return '';
  if (/^(sfg-|fg-|mat-)/i.test(code)) return `stk-${code}`;
  return code;
}

function sameCode(left, right) {
  const a = text(left).toLowerCase();
  const b = text(right).toLowerCase();
  return Boolean(a) && a === b;
}

function findInventoryItem(inventory, itemId) {
  const id = text(itemId);
  if (!id) return null;
  return (inventory || []).find((item) => item && (sameCode(item.id, id) || sameCode(item.itemCode, id))) || null;
}

function findRoll(rolls, barcode) {
  const code = text(barcode);
  if (!code) return null;
  return (rolls || []).find((roll) => roll && (sameCode(roll.barcodeId, code) || sameCode(roll.id, code) || sameCode(roll.sfgBatchCode, code))) || null;
}

export function resolveConsumable({ inventory = [], inventoryRolls = [], barcode = '', itemId = '' } = {}) {
  const typed = text(barcode);
  const item = findInventoryItem(inventory, itemId)
    || (inventory || []).find((row) => row && (
      sameCode(row.id, typed)
      || sameCode(row.itemCode, typed)
      || sameCode(row.lastBatch, typed)
      || sameCode(row.barcodeId, typed)
    ));
  const roll = findRoll(inventoryRolls, typed);
  const rollItem = roll ? findInventoryItem(inventory, roll.itemId || roll.stockItemId) : null;
  const chosen = item || rollItem;
  const stockItemId = chosen?.id || text(roll?.itemId || roll?.stockItemId);
  const rawBarcode = typed || text(chosen?.itemCode) || text(chosen?.lastBatch) || text(chosen?.id) || text(roll?.barcodeId);
  return {
    item: chosen || null,
    stockItemId: stockItemId || '',
    barcode: ledgerBarcode(rawBarcode),
    rawBarcode,
    roll: roll || null
  };
}

function hasOwn(row, key) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, key);
}

function rollLines(rows) {
  return (rows || []).map((row) => {
    const before = kg(row?.initialKg ?? row?.initialWeightKg ?? row?.beforeKg);
    const hasBalance = hasOwn(row, 'balanceLeftKg') || hasOwn(row, 'balanceKg');
    const balanceLeft = hasBalance ? kg(row.balanceLeftKg ?? row.balanceKg) : null;
    let consumed = kg(row?.consumedKg ?? row?.consumedWeightKg);
    if (balanceLeft !== null && before !== null) consumed = roundFilmKg(before - balanceLeft);
    return {
      barcode: text(row?.barcode || row?.barcodeId),
      consumedKg: consumed,
      initialKg: before,
      balanceLeftKg: balanceLeft,
      balanceLeftMeters: kg(row?.balanceLeftMeters ?? row?.balanceMeters),
      balanceRequired: hasBalance
    };
  }).filter((row) => row.barcode || row.consumedKg !== null || row.balanceRequired);
}

function stockAvailableKg(resolved) {
  const item = resolved?.item;
  const fromItem = kg(item?.availableQtyKg ?? item?.stockQtyKg ?? item?.currentStock);
  if (fromItem !== null) return fromItem;
  const roll = resolved?.roll;
  return kg(roll?.availableWeightKg ?? roll?.availableKg ?? roll?.netWeightKg);
}

function outputRollsOf(rolls) {
  return (rolls || []).map((roll) => {
    const gross = kg(roll?.grossWeightKg);
    const tare = kg(roll?.tareWeightKg) || 0;
    const net = kg(roll?.netWeightKg);
    const computedNet = net !== null ? net : (gross !== null ? roundFilmKg(Math.max(0, gross - tare)) : null);
    return {
      barcodeId: text(roll?.barcodeId || roll?.barcode),
      grossWeightKg: gross,
      tareWeightKg: tare,
      netWeightKg: computedNet,
      lengthMeters: kg(roll?.lengthMeters) || 0,
      jointCount: Number(roll?.jointCount) || 0
    };
  }).filter((roll) => roll.barcodeId && roll.netWeightKg > 0);
}

export function validateSfgFgEntry(entry = {}) {
  const errors = [];
  const process = entry.process || processKindForType(entry.stageType);
  const push = (message) => {
    if (message) errors.push(message);
  };

  if (!text(entry.orderId)) push('Select the job order. A production record needs an order.');
  if (!text(entry.stageType) || !process) push('Select the SFG or FG process type.');
  if (!text(entry.machineName)) push('Machine is required.');
  if (!text(entry.operatorName)) push('Operator is required.');
  if (!text(entry.shift)) push('Shift is required.');
  if (!text(entry.storageBay)) push('Storage bay is required.');
  const width = kg(entry.widthMm);
  const micron = kg(entry.micron);
  if (!(width > 0)) push('Roll width (mm) must be greater than 0.');
  if (!(micron > 0)) push('Film micron must be greater than 0.');

  const outputs = outputRollsOf(entry.outputRolls);
  if (outputs.length === 0) {
    push('Add at least one output roll with a gross weight and a net weight greater than 0.');
  }

  const opening = entry.isOpeningBalance === true;
  if (opening && !text(entry.productionDate)) {
    push('Production date is required for opening balance.');
  }
  if (!opening && process === 'slitting') {
    push('Slitted Rolls on Add Batch are opening-balance stock. Turn on Opening balance. In-process slitting stays on Consume.');
  }

  if (!opening && process === 'printing') {
    const inputs = rollLines(entry.inputRolls);
    if (inputs.length === 0 || inputs.every((row) => !row.barcode || !(row.consumedKg > 0))) {
      push('Scan or type each film roll barcode and the kilograms consumed. At least one film roll is required.');
    }
    inputs.forEach((row, index) => {
      if (!row.barcode) push(`Film roll ${index + 1}: barcode is required.`);
      if (row.balanceRequired && row.balanceLeftKg === null) {
        push(`Film roll ${row.barcode || index + 1}: Balance left on roll (kg) is required.`);
      }
      if (row.balanceLeftKg !== null && row.balanceLeftKg < 0) {
        push(`Film roll ${row.barcode || index + 1}: Balance left on roll (kg) cannot be negative.`);
      }
      if (row.initialKg !== null && row.balanceLeftKg !== null && row.balanceLeftKg > row.initialKg + 0.05) {
        push(`Film roll ${row.barcode}: balance left ${row.balanceLeftKg} kg is above the weight before use ${row.initialKg} kg.`);
      }
      if (row.barcode && row.balanceLeftKg !== null && !(row.consumedKg > 0)) {
        push(`Film roll ${row.barcode}: consumed kg must be greater than 0. Consumed is weight before use minus balance left.`);
      } else if (row.barcode && !row.balanceRequired && !(row.consumedKg > 0)) {
        push(`Film roll ${row.barcode}: consumed kg must be greater than 0.`);
      }
      if (row.consumedKg > 0 && row.initialKg !== null && row.consumedKg > row.initialKg + 0.05) {
        push(`Film roll ${row.barcode}: consumed ${row.consumedKg} kg is above the weight before use ${row.initialKg} kg.`);
      }
      if (row.barcode && Array.isArray(entry.inventoryRolls) && entry.inventoryRolls.length > 0 && !findRoll(entry.inventoryRolls, row.barcode)) {
        push(`Film roll ${row.barcode} was not found in inventory.`);
      }
    });
    const filmConsumed = roundFilmKg(inputs.reduce((sum, row) => sum + (row.consumedKg > 0 ? row.consumedKg : 0), 0));
    const ceiling = filmMassCeilingKg({
      meters: entry.actualMeters,
      widthMm: entry.widthMm,
      micron: entry.micron,
      density: entry.filmDensity || 1.4,
      wasteKg: (kg(entry.plainSettingKg) || 0) + (kg(entry.printingWastageKg) || 0)
    });
    if (ceiling !== null && filmConsumed > ceiling + 0.05 && entry.confirmFilmOverMass !== true) {
      push(`Film consumed ${filmConsumed} kg is above ${ceiling} kg (metres × width × micron × density + waste + ${FILM_MASS_TOLERANCE_KG} kg tolerance). Confirm this weight before saving.`);
    }
    push(requiredNumber(entry.actualMeters, 'Actual meters printed'));
    push(requiredNumber(entry.inkGsm, 'Ink GSM'));
    push(requiredNumber(entry.inkKg, 'Ink consumed (kg)'));
    push(requiredNumber(entry.plainSettingKg, 'Printing plain setting wastage (kg)', { allowZero: true }));
    push(requiredNumber(entry.printingWastageKg, 'Printing wastage (kg)', { allowZero: true }));
    const ink = resolveConsumable({
      inventory: entry.inventory,
      inventoryRolls: entry.inventoryRolls,
      barcode: entry.inkBarcode,
      itemId: entry.inkItemId
    });
    if (!ink.stockItemId) push('Choose the ink stock item, by barcode or item, so it posts to that item\'s existing ledger.');
    const inkNeed = kg(entry.inkKg);
    const inkOnHand = stockAvailableKg(ink);
    if (ink.stockItemId && inkNeed > 0 && inkOnHand !== null && inkNeed > inkOnHand + 0.05 && entry.confirmStockShortfall !== true) {
      push(`Ink stock has ${inkOnHand} kg available. This batch uses ${inkNeed} kg. Reduce the kilograms, or an Admin must confirm the shortfall.`);
    }
  }

  if (!opening && (process === 'lamination-1' || process === 'lamination-2')) {
    const pass = process === 'lamination-2' ? 'pass 2' : 'pass 1';
    if (!text(entry.parentBarcode)) push('Scan or type the parent lot barcode that this pass consumes.');
    push(requiredNumber(entry.parentConsumedKg, 'Parent lot consumed (kg)'));
    const parent = entry.parentLot || findRoll(entry.sfgGoods, entry.parentBarcode);
    if (text(entry.parentBarcode) && !parent) {
      push(`Parent lot ${text(entry.parentBarcode)} was not found in SFG / FG stock.`);
    }
    const substrates = rollLines(entry.substrateRolls);
    if (substrates.length === 0 || substrates.every((row) => !row.barcode || !(row.consumedKg > 0))) {
      push(`Scan or type the substrate barcode and kilograms for lamination ${pass}.`);
    }
    substrates.forEach((row, index) => {
      if (!row.barcode) push(`Substrate roll ${index + 1}: barcode is required.`);
      if (row.balanceRequired && row.balanceLeftKg === null) {
        push(`Substrate roll ${row.barcode || index + 1}: Balance left on roll (kg) is required.`);
      }
      if (row.balanceLeftKg !== null && row.balanceLeftKg < 0) {
        push(`Substrate roll ${row.barcode || index + 1}: Balance left on roll (kg) cannot be negative.`);
      }
      if (row.initialKg !== null && row.balanceLeftKg !== null && row.balanceLeftKg > row.initialKg + 0.05) {
        push(`Substrate roll ${row.barcode}: balance left ${row.balanceLeftKg} kg is above the weight before use ${row.initialKg} kg.`);
      }
      if (row.barcode && row.balanceLeftKg !== null && !(row.consumedKg > 0)) {
        push(`Substrate roll ${row.barcode}: consumed kg must be greater than 0. Consumed is weight before use minus balance left.`);
      } else if (row.barcode && !row.balanceRequired && !(row.consumedKg > 0)) {
        push(`Substrate roll ${row.barcode}: consumed kg must be greater than 0.`);
      }
      if (row.consumedKg > 0 && row.initialKg !== null && row.consumedKg > row.initialKg + 0.05) {
        push(`Substrate roll ${row.barcode}: consumed ${row.consumedKg} kg is above the weight before use ${row.initialKg} kg.`);
      }
      if (row.barcode && Array.isArray(entry.inventoryRolls) && entry.inventoryRolls.length > 0 && !findRoll(entry.inventoryRolls, row.barcode)) {
        push(`Substrate roll ${row.barcode} was not found in inventory.`);
      }
    });
    push(requiredNumber(entry.adhesiveKg, `Adhesive consumed (kg) for ${pass}`));
    push(requiredNumber(entry.adhesiveGsm, `Adhesive GSM for ${pass}`));
    push(requiredNumber(entry.stageMeters, `Meters for lamination ${pass}`));
    push(requiredNumber(entry.laminationPlainWastageKg, `Lamination plain substrate wastage (kg) for ${pass}`, { allowZero: true }));
    push(requiredNumber(entry.laminateWastageKg, `Laminate wastage (kg) for ${pass}`, { allowZero: true }));
    const adhesive = resolveConsumable({
      inventory: entry.inventory,
      inventoryRolls: entry.inventoryRolls,
      barcode: entry.adhesiveBarcode,
      itemId: entry.adhesiveItemId
    });
    if (!adhesive.stockItemId) push('Choose the adhesive stock item, by barcode or item, so it posts to that item\'s existing ledger.');
    const adhesiveNeed = kg(entry.adhesiveKg);
    const adhesiveOnHand = stockAvailableKg(adhesive);
    if (adhesive.stockItemId && adhesiveNeed > 0 && adhesiveOnHand !== null && adhesiveNeed > adhesiveOnHand + 0.05 && entry.confirmStockShortfall !== true) {
      push(`Adhesive stock has ${adhesiveOnHand} kg available. This batch uses ${adhesiveNeed} kg. Reduce the kilograms, or an Admin must confirm the shortfall.`);
    }
    if (parent && kg(entry.parentConsumedKg) > 0) {
      const room = parentRoomKg(parent, entry.batchCode);
      if (kg(entry.parentConsumedKg) > room + 0.05) {
        push(`Parent lot ${parent.sfgBatchCode || parent.barcodeId} has ${room} kg available. This batch consumes ${kg(entry.parentConsumedKg)} kg.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, process };
}

function parentRoomKg(parent, batchCode) {
  const total = kg(parent?.totalNetKg ?? parent?.netWeightKg) || 0;
  const consumed = kg(parent?.consumedKg) || 0;
  const dispatched = kg(parent?.dispatchedKg) || 0;
  const previous = previousParentKg(parent, batchCode);
  return roundFilmKg(Math.max(0, total - consumed - dispatched + previous));
}

function previousParentKg(parent, batchCode) {
  const history = Array.isArray(parent?.consumptionHistory) ? parent.consumptionHistory : [];
  const prior = history.find((row) => row && sameCode(row.batchCode, batchCode));
  return kg(prior?.consumedKg) || 0;
}

function replaceContribution(existingTotal, previous, next) {
  return roundFilmKg(Math.max(0, (kg(existingTotal) || 0) - (kg(previous) || 0) + (kg(next) || 0)));
}

function childFromOutput(roll, index) {
  return {
    barcodeId: roll.barcodeId,
    rollNo: index + 1,
    netWeightKg: roll.netWeightKg,
    grossWeightKg: roll.grossWeightKg ?? roll.netWeightKg,
    tareWeightKg: roll.tareWeightKg || 0,
    lengthMeters: roll.lengthMeters || 0,
    jointCount: roll.jointCount || 0
  };
}

function mergeChildren(existingChildren, outputs) {
  const map = new Map();
  (existingChildren || []).forEach((roll) => {
    const code = text(roll?.barcodeId || roll?.id);
    if (code) map.set(code, { ...roll, barcodeId: code, netWeightKg: kg(roll.netWeightKg) || 0 });
  });
  outputs.forEach((roll) => {
    map.set(roll.barcodeId, childFromOutput(roll, map.size));
  });
  return [...map.values()].map((roll, index) => ({ ...roll, rollNo: index + 1 }));
}

function ledgerLine({ orderId, batchCode, role, barcode, consumedKg, initialKg, stockItemId, itemName, stage, balanceLeftMeters }) {
  const safeBarcode = ledgerBarcode(barcode);
  const consumed = kg(consumedKg) || 0;
  const initial = kg(initialKg);
  return {
    id: `sfg-fg-batch:${batchCode}:${role}:${safeBarcode.toLowerCase()}`,
    ledgerSource: LEDGER_SOURCE,
    orderId,
    batchCode,
    role,
    stage,
    barcode: safeBarcode,
    itemId: stockItemId || '',
    stockItemId: stockItemId || '',
    itemName: itemName || role,
    issueQtyKg: consumed,
    returnQtyKg: roundFilmKg(Math.max(0, (initial !== null ? initial : consumed) - consumed)),
    balanceLeftMeters: kg(balanceLeftMeters),
    netConsumedQtyKg: consumed,
    consumedWeightKg: consumed,
    initialKg: initial !== null ? initial : consumed,
    initialWeightKg: initial !== null ? initial : consumed,
    unit: 'Kg'
  };
}

function batchLedgerLines(entry, batchCode, process) {
  const lines = [];
  const orderId = entry.orderId;
  if (process === 'printing') {
    rollLines(entry.inputRolls).forEach((row) => {
      if (!row.barcode || !(row.consumedKg > 0)) return;
      const resolved = resolveConsumable({
        inventory: entry.inventory,
        inventoryRolls: entry.inventoryRolls,
        barcode: row.barcode
      });
      lines.push(ledgerLine({
        orderId,
        batchCode,
        role: 'film',
        barcode: row.barcode,
        consumedKg: row.consumedKg,
        initialKg: row.initialKg,
        balanceLeftMeters: row.balanceLeftMeters,
        stockItemId: resolved.stockItemId,
        itemName: resolved.item?.itemName || 'Printing film',
        stage: 'Printing'
      }));
    });
    const ink = resolveConsumable({
      inventory: entry.inventory,
      inventoryRolls: entry.inventoryRolls,
      barcode: entry.inkBarcode,
      itemId: entry.inkItemId
    });
    if (ink.barcode && kg(entry.inkKg) > 0) {
      lines.push(ledgerLine({
        orderId,
        batchCode,
        role: 'ink',
        barcode: ink.rawBarcode || ink.barcode,
        consumedKg: entry.inkKg,
        initialKg: entry.inkKg,
        stockItemId: ink.stockItemId,
        itemName: ink.item?.itemName || 'Ink',
        stage: 'Printing'
      }));
    }
  }
  if (process === 'lamination-1' || process === 'lamination-2') {
    const stage = process === 'lamination-2' ? 'Lamination (Pass 2)' : 'Lamination (Pass 1)';
    rollLines(entry.substrateRolls).forEach((row) => {
      if (!row.barcode || !(row.consumedKg > 0)) return;
      const resolved = resolveConsumable({
        inventory: entry.inventory,
        inventoryRolls: entry.inventoryRolls,
        barcode: row.barcode
      });
      lines.push(ledgerLine({
        orderId,
        batchCode,
        role: 'substrate',
        barcode: row.barcode,
        consumedKg: row.consumedKg,
        initialKg: row.initialKg,
        balanceLeftMeters: row.balanceLeftMeters,
        stockItemId: resolved.stockItemId,
        itemName: resolved.item?.itemName || (process === 'lamination-2' ? 'Substrate 3' : 'Substrate 2'),
        stage
      }));
    });
    const adhesive = resolveConsumable({
      inventory: entry.inventory,
      inventoryRolls: entry.inventoryRolls,
      barcode: entry.adhesiveBarcode,
      itemId: entry.adhesiveItemId
    });
    if (adhesive.barcode && kg(entry.adhesiveKg) > 0) {
      lines.push(ledgerLine({
        orderId,
        batchCode,
        role: 'adhesive',
        barcode: adhesive.rawBarcode || adhesive.barcode,
        consumedKg: entry.adhesiveKg,
        initialKg: entry.adhesiveKg,
        stockItemId: adhesive.stockItemId,
        itemName: adhesive.item?.itemName || 'Adhesive',
        stage
      }));
    }
  }
  return lines;
}

/**
 * One materials_list line per barcode. Legacy kilograms for that barcode
 * are kept on the line so a later batch does not drop them or post them twice.
 */
export function mergeLedgerMaterials(existingMaterials, batches) {
  const existing = Array.isArray(existingMaterials) ? existingMaterials : [];
  const ownedIds = new Set();
  const legacyIncluded = new Map();
  existing.forEach((row) => {
    if (String(row?.id || '').startsWith('sfg-fg-ledger:')) {
      const code = text(row.barcode).toLowerCase();
      if (code) legacyIncluded.set(code, kg(row.includedLegacyKg) || 0);
      ownedIds.add(row.id);
    }
  });
  const legacy = existing.filter((row) => row && !ownedIds.has(row.id) && !String(row.id || '').startsWith('sfg-fg-batch:'));
  const sums = new Map();
  (batches || []).forEach((batch) => {
    (batch.ledgerLines || []).forEach((line) => {
      const code = text(line.barcode).toLowerCase();
      if (!code || !(kg(line.netConsumedQtyKg) > 0)) return;
      const current = sums.get(code) || {
        barcode: line.barcode,
        kg: 0,
        initialKg: 0,
        stockItemId: '',
        itemName: '',
        stage: line.stage || 'Production'
      };
      current.kg = roundFilmKg(current.kg + (kg(line.netConsumedQtyKg) || 0));
      current.initialKg = roundFilmKg(current.initialKg + (kg(line.initialKg ?? line.initialWeightKg ?? line.netConsumedQtyKg) || 0));
      current.stockItemId = current.stockItemId || line.stockItemId || line.itemId || '';
      current.itemName = current.itemName || line.itemName || '';
      current.stage = line.stage || current.stage;
      sums.set(code, current);
    });
  });

  const kept = [];
  legacy.forEach((row) => {
    const code = text(row.barcode || row.barcodeId).toLowerCase();
    if (code && sums.has(code)) {
      const sum = sums.get(code);
      const legacyKg = kg(row.netConsumedQtyKg ?? row.consumedWeightKg) || 0;
      sum.legacyKg = roundFilmKg((sum.legacyKg || 0) + legacyKg);
      sum.stockItemId = sum.stockItemId || row.stockItemId || row.itemId || '';
      sum.itemName = sum.itemName || row.itemName || '';
      return;
    }
    kept.push(row);
  });

  const owned = [];
  sums.forEach((sum, code) => {
    const fromLegacy = sum.legacyKg !== undefined ? sum.legacyKg : (legacyIncluded.get(code) || 0);
    const consumed = roundFilmKg(fromLegacy + sum.kg);
    owned.push({
      id: `sfg-fg-ledger:${text(batches[0]?.orderId || '')}:${code}`,
      ledgerSource: LEDGER_SOURCE,
      barcode: sum.barcode,
      itemId: sum.stockItemId,
      stockItemId: sum.stockItemId,
      itemName: sum.itemName,
      stage: sum.stage,
      issueQtyKg: consumed,
      returnQtyKg: roundFilmKg(Math.max(0, roundFilmKg(Math.max(sum.initialKg, consumed)) - consumed)),
      netConsumedQtyKg: consumed,
      consumedWeightKg: consumed,
      initialKg: roundFilmKg(Math.max(sum.initialKg, consumed)),
      initialWeightKg: roundFilmKg(Math.max(sum.initialKg, consumed)),
      includedLegacyKg: fromLegacy,
      unit: 'Kg'
    });
  });
  return kept.concat(owned);
}

export function planParentLotReduction(parent, { batchCode, consumedKg } = {}) {
  if (!parent) return null;
  const nextKg = kg(consumedKg) || 0;
  const previous = previousParentKg(parent, batchCode);
  const delta = roundFilmKg(nextKg - previous);
  const total = kg(parent.totalNetKg ?? parent.netWeightKg) || 0;
  const dispatched = kg(parent.dispatchedKg) || 0;
  const consumed = roundFilmKg(Math.max(0, (kg(parent.consumedKg) || 0) + delta));
  const available = roundFilmKg(Math.max(0, total - consumed - dispatched));
  const history = (Array.isArray(parent.consumptionHistory) ? parent.consumptionHistory : [])
    .filter((row) => !sameCode(row?.batchCode, batchCode));
  history.push({
    batchCode,
    consumedKg: nextKg,
    at: new Date().toISOString()
  });
  const locked = parent.status === 'Dispatched' || parent.status === 'Partially Dispatched' || parent.status === 'Ready for Dispatch';
  let status = parent.status;
  if (!locked) {
    if (consumed > 0 && available <= 0) status = 'Fully Consumed';
    else if (consumed > 0) status = 'Partially Consumed';
  }
  return {
    ...parent,
    consumedKg: consumed,
    availableKg: available,
    consumptionHistory: history,
    status
  };
}

function previousBatch(record, batchCode) {
  const batches = Array.isArray(record?.sfgFgBatches) ? record.sfgFgBatches : [];
  return batches.find((batch) => sameCode(batch?.batchCode, batchCode)) || null;
}

function consumptionEvent(entry, batch, outputs) {
  const substrates = rollLines(entry.substrateRolls).filter((row) => row.barcode && row.consumedKg > 0);
  const first = substrates[0] || null;
  const rolls = substrates.map((row) => ({
    barcode: row.barcode,
    consumedKg: row.consumedKg,
    initialKg: row.initialKg ?? row.consumedKg
  }));
  const pass2 = batch.process === 'lamination-2';
  return {
    id: `sfg-fg-batch:${batch.batchCode}`,
    batchCode: batch.batchCode,
    timestamp: new Date().toISOString(),
    shift: entry.shift,
    operatorName: entry.operatorName,
    machineName: entry.machineName,
    sfgBatchCode: text(entry.parentBarcode),
    consumedKg: kg(entry.parentConsumedKg) || 0,
    targetProcess: pass2 ? 'Lamination (Pass 2)' : 'Lamination (Pass 1)',
    substrate2: !pass2 && first ? first : null,
    substrate2Rolls: !pass2 ? rolls : [],
    substrate3: pass2 && first ? first : null,
    substrate3Rolls: pass2 ? rolls : [],
    scrapBreakdown: {
      laminationPlainSubstrateWastageKg: pass2 ? 0 : (kg(entry.laminationPlainWastageKg) || 0),
      laminationPlainSubstrateWastageL2Kg: pass2 ? (kg(entry.laminationPlainWastageKg) || 0) : 0,
      laminateWastageKg: kg(entry.laminateWastageKg) || 0,
      adhesiveConsumedL1Kg: pass2 ? 0 : (kg(entry.adhesiveKg) || 0),
      adhesiveConsumedL2Kg: pass2 ? (kg(entry.adhesiveKg) || 0) : 0
    },
    outputRolls: outputs.map((roll) => ({
      barcode: roll.barcodeId,
      netWeightKg: roll.netWeightKg,
      outputType: entry.mode === 'FG' ? 'FG' : 'SFG'
    })),
    outputRoll: outputs[0] ? {
      barcode: outputs[0].barcodeId,
      netWeightKg: outputs.reduce((sum, roll) => sum + roll.netWeightKg, 0),
      type: entry.mode === 'FG' ? 'FG' : 'SFG'
    } : null
  };
}

function buildRecord(entry, batch, outputs, printedLot) {
  const existing = entry.existingRecord || null;
  const prior = previousBatch(existing, batch.batchCode);
  const batches = (Array.isArray(existing?.sfgFgBatches) ? existing.sfgFgBatches : [])
    .filter((row) => !sameCode(row?.batchCode, batch.batchCode))
    .concat(batch);
  const net = outputs.reduce((sum, roll) => sum + roll.netWeightKg, 0);
  const isFG = entry.mode === 'FG';
  const record = {
    ...(existing || {}),
    id: productionRecordId(entry.orderId, existing),
    orderId: entry.orderId,
    jobName: entry.jobName || existing?.jobName || '',
    jobCode: entry.jobCode || existing?.jobCode || '',
    clientName: entry.clientName || existing?.clientName || '',
    machineName: entry.machineName,
    operatorName: entry.operatorName,
    shift: entry.shift,
    dateFilled: entry.productionDate || existing?.dateFilled || '',
    productionDate: entry.productionDate || existing?.productionDate || '',
    status: existing?.status || 'In Progress',
    sfgFgBatches: batches,
    outputRolls: mergeOutputHistory(existing?.outputRolls, outputs, batch.batchCode, isFG),
    notes: entry.notes || existing?.notes || ''
  };
  record.rollsBreakdown = record.outputRolls;

  if (batch.process === 'printing') {
    const lotNet = kg(printedLot?.totalNetKg) || net;
    record.qtyPrinting = lotNet;
    record.qtyFirstPassL1 = lotNet;
    record.printedOutputKg = lotNet;
    record.actualMetersPrinted = kg(entry.actualMeters);
    record.actualInkGsm = kg(entry.inkGsm);
    record.inkGsmInSpeed = kg(entry.inkGsm);
    record.printingPlainSettingWastageKg = replaceContribution(existing?.printingPlainSettingWastageKg, prior?.plainSettingKg, entry.plainSettingKg);
    record.printingWastageKg = replaceContribution(existing?.printingWastageKg, prior?.printingWastageKg, entry.printingWastageKg);
    record.materialsList = mergeLedgerMaterials(existing?.materialsList, batches.map((row) => ({ ...row, orderId: entry.orderId })));
    record.inputRollsList = printingInputRolls(existing?.inputRollsList, record.materialsList, batches);
  } else {
    record.qtyPouching = existing?.qtyPouching ?? null;
  }

  if (batch.process === 'lamination-1') {
    record.qtyLaminationL1 = replaceContribution(existing?.qtyLaminationL1, prior?.netKg, net);
    record.adhesiveConsumedL1Kg = replaceContribution(existing?.adhesiveConsumedL1Kg, prior?.adhesiveKg, entry.adhesiveKg);
    record.actualAdhesiveGsm = kg(entry.adhesiveGsm);
    record.laminationMetersL1 = replaceContribution(existing?.laminationMetersL1, prior?.meters, entry.stageMeters);
    record.laminationPlainSubstrateWastageKg = replaceContribution(existing?.laminationPlainSubstrateWastageKg, prior?.laminationPlainWastageKg, entry.laminationPlainWastageKg);
    record.laminateWastageKg = replaceContribution(existing?.laminateWastageKg, prior?.laminateWastageKg, entry.laminateWastageKg);
  }
  if (batch.process === 'lamination-2') {
    record.qtySecondPassL2 = replaceContribution(existing?.qtySecondPassL2, prior?.netKg, net);
    record.adhesiveConsumedL2Kg = replaceContribution(existing?.adhesiveConsumedL2Kg, prior?.adhesiveKg, entry.adhesiveKg);
    record.actualAdhesiveGsmL2 = kg(entry.adhesiveGsm);
    record.laminationMetersL2 = replaceContribution(existing?.laminationMetersL2, prior?.meters, entry.stageMeters);
    record.laminationPlainSubstrateWastageL2Kg = replaceContribution(existing?.laminationPlainSubstrateWastageL2Kg, prior?.laminationPlainWastageKg, entry.laminationPlainWastageKg);
    record.laminateWastageKg = replaceContribution(existing?.laminateWastageKg, prior?.laminateWastageKg, entry.laminateWastageKg);
  }
  if (isFG) {
    const fgNet = batches.filter((row) => row.isFG).reduce((sum, row) => sum + (kg(row.netKg) || 0), 0);
    const priorFg = (Array.isArray(existing?.sfgFgBatches) ? existing.sfgFgBatches : [])
      .filter((row) => row.isFG)
      .reduce((sum, row) => sum + (kg(row.netKg) || 0), 0);
    record.qtyDispatch = replaceContribution(existing?.qtyDispatch, priorFg, fgNet);
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'qtyDispatch')) {
    record.qtyDispatch = existing.qtyDispatch;
  }

  const consumptions = (Array.isArray(existing?.sfgConsumptions) ? existing.sfgConsumptions : [])
    .filter((log) => !sameCode(log?.batchCode, batch.batchCode) && !sameCode(log?.id, `sfg-fg-batch:${batch.batchCode}`));
  if (batch.process !== 'printing') consumptions.push(consumptionEvent(entry, batch, outputs));
  record.sfgConsumptions = consumptions;
  if (batch.process !== 'printing') {
    record.materialsList = mergeLedgerMaterials(existing?.materialsList, batches.map((row) => ({ ...row, orderId: entry.orderId })));
  }
  const scrap = [
    record.printingPlainSettingWastageKg,
    record.printingWastageKg,
    record.laminationPlainSubstrateWastageKg,
    record.laminationPlainSubstrateWastageL2Kg,
    record.laminateWastageKg,
    record.printedWastageKg,
    record.trimWastageKg,
    record.pouchingScrapKg
  ].reduce((sum, value) => sum + (kg(value) || 0), 0);
  record.totalScrapQtyKg = roundFilmKg(scrap);
  record.totalWastageKg = record.totalScrapQtyKg;
  return record;
}

function mergeOutputHistory(existingRolls, outputs, batchCode, isFG) {
  const kept = (existingRolls || []).filter((roll) => !sameCode(roll?.batchCode, batchCode));
  return kept.concat(outputs.map((roll) => ({
    ...roll,
    batchCode,
    rollType: isFG ? 'FG' : 'SFG',
    category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)'
  })));
}

function printingInputRolls(existing, materialsList, batches) {
  const filmCodes = new Set();
  (batches || []).forEach((batch) => {
    (batch.ledgerLines || []).forEach((line) => {
      if (line.role === 'film') filmCodes.add(text(line.barcode).toLowerCase());
    });
  });
  const others = (existing || []).filter((roll) => !filmCodes.has(text(roll?.barcodeId || roll?.barcode).toLowerCase()));
  const ours = (materialsList || []).filter((line) => filmCodes.has(text(line.barcode).toLowerCase())).map((line) => ({
    barcodeId: line.barcode,
    barcode: line.barcode,
    consumedWeightKg: line.netConsumedQtyKg,
    consumedKg: line.netConsumedQtyKg,
    initialWeightKg: line.initialKg,
    initialKg: line.initialKg,
    itemId: line.stockItemId,
    stockItemId: line.stockItemId,
    stage: 'Printing'
  }));
  return others.concat(ours);
}

function outputBatchFrom(entry, batchCode, outputs) {
  const net = roundFilmKg(outputs.reduce((sum, roll) => sum + roll.netWeightKg, 0));
  const gross = roundFilmKg(outputs.reduce((sum, roll) => sum + (roll.grossWeightKg ?? roll.netWeightKg), 0));
  const tare = roundFilmKg(outputs.reduce((sum, roll) => sum + (roll.tareWeightKg || 0), 0));
  const meters = kg(entry.stageMeters) || roundFilmKg(outputs.reduce((sum, roll) => sum + (roll.lengthMeters || 0), 0));
  const isFG = entry.mode === 'FG';
  return {
    sfgBatchCode: batchCode,
    sfgType: entry.stageType,
    category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
    rollType: isFG ? 'FG' : 'SFG',
    isPrintedLot: false,
    orderId: entry.orderId,
    jobId: entry.jobMasterId || '',
    jobName: entry.jobName || '',
    jobCode: entry.jobCode || '',
    clientName: entry.clientName || '',
    structure: entry.structure || '',
    filmType: entry.filmType || '',
    micron: kg(entry.micron) || 0,
    widthMm: kg(entry.widthMm) || 0,
    totalGrossKg: gross,
    grossWeightKg: gross,
    tareWeightKg: tare,
    totalNetKg: net,
    netWeightKg: net,
    consumedKg: 0,
    availableKg: net,
    totalMeters: meters,
    rollsCount: outputs.length,
    machineName: entry.machineName,
    operatorName: entry.operatorName,
    shift: entry.shift,
    storageBay: entry.storageBay,
    productionDate: entry.productionDate || '',
    status: isFG ? 'In Stock (Ready for Dispatch)' : 'In Stock (WIP)',
    notes: entry.notes || '',
    childRolls: outputs.map(childFromOutput),
    parentSfgBatchCode: text(entry.parentBarcode)
  };
}

function openingAuditRecord(existing, entry, batch) {
  const batches = (Array.isArray(existing?.sfgFgBatches) ? existing.sfgFgBatches : [])
    .filter((row) => !sameCode(row?.batchCode, batch.batchCode))
    .concat(batch);
  const record = {
    ...(existing || {}),
    id: productionRecordId(entry.orderId, existing),
    orderId: entry.orderId,
    jobName: existing?.jobName || entry.jobName || '',
    jobCode: existing?.jobCode || entry.jobCode || '',
    clientName: existing?.clientName || entry.clientName || '',
    sfgFgBatches: batches
  };
  if (!existing) {
    record.status = 'In Progress';
    record.materialsList = [];
    record.inputRollsList = [];
    record.sfgConsumptions = [];
    record.outputRolls = [];
    record.machineName = entry.machineName || '';
    record.operatorName = entry.operatorName || '';
    record.shift = entry.shift || '';
    record.dateFilled = entry.productionDate || '';
    record.productionDate = entry.productionDate || '';
    record.notes = entry.notes || '';
  }
  return record;
}

export const EARLIER_ORDER_LOT_MESSAGE = 'A lot from an earlier order with this number exists. It was not merged.';

export const ROLL_METRE_DRIFT_LIMIT = 0.1;

/**
 * A printed lot may be updated only when it is this order row's lot.
 * The batch code SFG-LOT-{orderId} is not enough: a deleted order can leave
 * that code behind, and a later order must not absorb its rolls.
 */
export function lotBelongsToOrder(lot, order = {}) {
  if (!lot) return true;
  const orderId = text(order.id || order.orderId);
  if (!orderId) return false;
  const lotOrder = text(lot.orderId);
  if (lotOrder && lotOrder.toLowerCase() !== orderId.toLowerCase()) return false;

  const lotCreated = Date.parse(lot.createdAt || lot.created_at || '');
  const orderCreated = Date.parse(order.createdAt || order.created_at || '');
  if (Number.isFinite(lotCreated) && Number.isFinite(orderCreated) && lotCreated < orderCreated) {
    return false;
  }

  const lotJob = text(lot.jobMasterId || lot.jobId);
  const orderJob = text(order.jobMasterId || order.jobId);
  if (lotJob && orderJob && lotJob !== orderJob) return false;

  const lotCode = text(lot.jobCode).toUpperCase();
  const orderCode = text(order.jobCode).toUpperCase();
  if (lotCode && orderCode && lotCode !== orderCode) return false;

  const lotName = text(lot.jobName).toLowerCase();
  const orderName = text(order.jobName).toLowerCase();
  const sameMaster = Boolean(lotJob && orderJob && lotJob === orderJob);
  const sameJobCode = Boolean(lotCode && orderCode && lotCode === orderCode);
  if (lotName && orderName && lotName !== orderName && !sameMaster && !sameJobCode) return false;
  return true;
}

function orderIdentity(entry) {
  return {
    id: entry?.orderId,
    createdAt: entry?.orderCreatedAt || entry?.createdAt,
    jobMasterId: entry?.jobMasterId,
    jobCode: entry?.jobCode,
    jobName: entry?.jobName
  };
}

function resolveOwnedPrintedLot(entry) {
  const code = printingSfgLotCode(entry?.orderId).toLowerCase();
  const listed = (entry?.sfgGoods || []).find((item) => text(item?.sfgBatchCode).toLowerCase() === code) || null;
  const passed = entry?.existingLot || null;
  const passedCode = text(passed?.sfgBatchCode).toLowerCase();
  let candidate = null;
  if (listed && passed && passedCode === code) {
    candidate = {
      ...listed,
      ...passed,
      createdAt: listed.createdAt || passed.createdAt,
      created_at: listed.created_at || passed.created_at,
      orderId: listed.orderId || passed.orderId,
      jobCode: listed.jobCode || passed.jobCode,
      jobName: listed.jobName || passed.jobName,
      jobMasterId: listed.jobMasterId || passed.jobMasterId || listed.jobId || passed.jobId,
      jobId: listed.jobId || passed.jobId,
      childRolls: passed.childRolls || listed.childRolls,
      totalMeters: listed.totalMeters ?? passed.totalMeters,
      id: passed.id || listed.id
    };
  } else if (listed) {
    candidate = listed;
  } else if (passed && (passedCode === code || !passedCode)) {
    candidate = passed;
  }
  if (!candidate) return { lot: null };
  if (!lotBelongsToOrder(candidate, orderIdentity(entry))) {
    return { error: EARLIER_ORDER_LOT_MESSAGE };
  }
  return { lot: candidate };
}

/** Lot metres are the rolls already on the lot plus this batch, not this batch alone. */
export function sumPrintedLotMeters({ existingLot, children, batchMeters = 0, previousBatchMeters = 0 } = {}) {
  const rolls = Array.isArray(children) ? children : [];
  const childSum = rolls.reduce((sum, roll) => sum + (Number(roll?.lengthMeters) || 0), 0);
  const everyRollHasMeters = rolls.length > 0 && rolls.every((roll) => Number(roll?.lengthMeters) > 0);
  if (everyRollHasMeters) return roundFilmKg(childSum);
  const kept = Math.max(0, (Number(existingLot?.totalMeters) || 0) - (Number(previousBatchMeters) || 0));
  return roundFilmKg(Math.max(childSum, kept + (Number(batchMeters) || 0)));
}

/** Metres implied by kilograms, width, micron, and density. Null when the inputs are incomplete. */
export function expectedRollMeters({ netKg, widthMm, micron, density } = {}) {
  const weight = Number(netKg);
  const width = Number(widthMm);
  const thick = Number(micron);
  const dens = Number(density);
  if (!(weight > 0) || !(width > 0) || !(thick > 0) || !(dens > 0)) return null;
  return Math.round((weight * 1000000) / (width * thick * dens));
}

export function rollMetreWarnings(rolls, spec = {}) {
  const warnings = [];
  (rolls || []).forEach((roll) => {
    const actual = Number(roll?.lengthMeters);
    const expected = expectedRollMeters({
      netKg: roll?.netWeightKg,
      widthMm: roll?.widthMm || spec.widthMm,
      micron: roll?.micron || spec.micron,
      density: spec.density
    });
    if (!(actual > 0) || expected == null || !(expected > 0)) return;
    const gap = Math.abs(actual - expected) / expected;
    if (gap <= ROLL_METRE_DRIFT_LIMIT) return;
    warnings.push({
      barcodeId: roll.barcodeId || roll.id || '',
      actual,
      expected,
      percent: Math.round(gap * 100)
    });
  });
  return warnings;
}

function openingPrintedLot(entry, outputs, enteredBy, enteredAt) {
  const existingLot = entry.existingLot || null;
  const children = mergeChildren(existingLot?.childRolls, outputs);
  const openingCodes = new Set(outputs.map((roll) => roll.barcodeId));
  const printedLot = planPrintingSfgLot({
    orderId: entry.orderId,
    jobName: entry.jobName,
    jobCode: entry.jobCode,
    jobMasterId: entry.jobMasterId,
    clientName: entry.clientName,
    filmType: entry.filmType,
    micron: entry.micron,
    widthMm: entry.widthMm,
    outputRolls: children,
    inputRolls: (existingLot?.inputBarcodeIds || []).map((barcodeId) => ({ barcodeId })),
    meters: null,
    existingLot
  });
  printedLot.childRolls = (printedLot.childRolls || []).map((child) => {
    const source = children.find((roll) => roll.barcodeId === child.barcodeId);
    const opening = openingCodes.has(child.barcodeId) || Boolean(source?.isOpeningBalance);
    const next = source
      ? { ...child, grossWeightKg: source.grossWeightKg, tareWeightKg: source.tareWeightKg }
      : { ...child };
    if (opening) next.isOpeningBalance = true;
    return next;
  });
  if (existingLot?.id) printedLot.id = existingLot.id;
  printedLot.machineName = existingLot?.machineName || entry.machineName;
  printedLot.operatorName = existingLot?.operatorName || entry.operatorName;
  printedLot.shift = existingLot?.shift || entry.shift;
  printedLot.storageBay = entry.storageBay || existingLot?.storageBay || '';
  printedLot.productionDate = entry.productionDate || existingLot?.productionDate || '';
  printedLot.structure = entry.structure || existingLot?.structure || '';
  printedLot.isOpeningBalance = true;
  printedLot.openingBalanceEnteredBy = text(existingLot?.openingBalanceEnteredBy) || enteredBy;
  printedLot.openingBalanceEnteredAt = text(existingLot?.openingBalanceEnteredAt) || enteredAt;
  const addedMeters = outputs.reduce((sum, roll) => sum + (Number(roll.lengthMeters) || 0), 0);
  printedLot.totalMeters = sumPrintedLotMeters({
    existingLot,
    children: printedLot.childRolls,
    batchMeters: addedMeters
  });
  const previousGross = kg(existingLot?.totalGrossKg) || kg(existingLot?.totalNetKg) || 0;
  const addedGross = outputs.reduce((sum, roll) => sum + (roll.grossWeightKg ?? roll.netWeightKg), 0);
  printedLot.totalGrossKg = roundFilmKg(Math.max(printedLot.totalNetKg, previousGross + addedGross));
  printedLot.grossWeightKg = printedLot.totalGrossKg;
  printedLot.category = existingLot?.category || 'Semi-Finished Goods (SFG)';
  printedLot.rollType = existingLot?.rollType || 'SFG';
  return printedLot;
}

function buildOpeningBalancePlan(entry, process, batchCode) {
  const outputs = outputRollsOf(entry.outputRolls);
  const net = roundFilmKg(outputs.reduce((sum, roll) => sum + roll.netWeightKg, 0));
  const gross = roundFilmKg(outputs.reduce((sum, roll) => sum + (roll.grossWeightKg ?? roll.netWeightKg), 0));
  const isFG = process === 'slitting' || entry.mode === 'FG';
  const enteredAt = text(entry.enteredAt) || new Date().toISOString();
  const enteredBy = text(entry.enteredBy);
  const batch = {
    batchCode,
    orderId: entry.orderId,
    process,
    isFG,
    isOpeningBalance: true,
    stageType: entry.stageType,
    netKg: net,
    grossKg: gross,
    meters: 0,
    plainSettingKg: 0,
    printingWastageKg: 0,
    laminationPlainWastageKg: 0,
    laminateWastageKg: 0,
    adhesiveKg: 0,
    adhesiveGsm: null,
    inkGsm: null,
    inkKg: 0,
    parentBarcode: '',
    parentConsumedKg: 0,
    ledgerLines: [],
    outputRolls: outputs,
    enteredBy,
    enteredAt,
    productionDate: text(entry.productionDate)
  };
  const productionRecord = openingAuditRecord(entry.existingRecord || null, entry, batch);
  let printedLot = null;
  let outputBatch = null;
  if (process === 'printing') {
    printedLot = openingPrintedLot(entry, outputs, enteredBy, enteredAt);
  } else {
    outputBatch = outputBatchFrom({
      ...entry,
      mode: isFG ? 'FG' : entry.mode,
      parentBarcode: '',
      stageMeters: ''
    }, batchCode, outputs);
    outputBatch.isOpeningBalance = true;
    outputBatch.openingBalanceEnteredBy = enteredBy;
    outputBatch.openingBalanceEnteredAt = enteredAt;
    delete outputBatch.parentSfgBatchCode;
    delete outputBatch.parentBarcode;
  }
  return {
    ok: true,
    errors: [],
    process,
    batchCode,
    inventoryMaster: null,
    printedLot,
    outputBatch,
    parentLot: null,
    productionRecord,
    outputRolls: outputs,
    stockRows: [printedLot, outputBatch].filter(Boolean),
    createsInventoryMaster: false
  };
}

export function buildSfgFgBatchPlan(entry = {}) {
  const process = entry.process || processKindForType(entry.stageType);
  const batchCode = text(entry.batchCode) || manualBatchCode({
    mode: process === 'slitting' ? 'FG' : entry.mode,
    jobCode: entry.jobCode,
    orderId: entry.orderId,
    now: entry.now
  });
  const checked = validateSfgFgEntry({ ...entry, process, batchCode });
  if (!checked.ok) {
    return {
      ok: false,
      errors: checked.errors,
      process,
      batchCode,
      inventoryMaster: null,
      stockRows: []
    };
  }

  if (process === 'printing') {
    const owned = resolveOwnedPrintedLot(entry);
    if (owned.error) {
      return {
        ok: false,
        errors: [owned.error],
        process,
        batchCode,
        inventoryMaster: null,
        stockRows: []
      };
    }
    entry = { ...entry, existingLot: owned.lot };
  }

  if (entry.isOpeningBalance === true) {
    return buildOpeningBalancePlan(entry, process, batchCode);
  }

  const meterPool = process === 'printing' ? entry.actualMeters : entry.stageMeters;
  const outputs = shareMetersByWeight(outputRollsOf(entry.outputRolls), meterPool);
  const net = roundFilmKg(outputs.reduce((sum, roll) => sum + roll.netWeightKg, 0));
  const gross = roundFilmKg(outputs.reduce((sum, roll) => sum + (roll.grossWeightKg ?? roll.netWeightKg), 0));
  const ledgerLines = batchLedgerLines({ ...entry, process }, batchCode, process);
  const batch = {
    batchCode,
    orderId: entry.orderId,
    process,
    isFG: entry.mode === 'FG',
    stageType: entry.stageType,
    netKg: net,
    grossKg: gross,
    meters: process === 'printing' ? (kg(entry.actualMeters) || 0) : (kg(entry.stageMeters) || 0),
    plainSettingKg: kg(entry.plainSettingKg) || 0,
    printingWastageKg: kg(entry.printingWastageKg) || 0,
    laminationPlainWastageKg: kg(entry.laminationPlainWastageKg) || 0,
    laminateWastageKg: kg(entry.laminateWastageKg) || 0,
    adhesiveKg: kg(entry.adhesiveKg) || 0,
    adhesiveGsm: kg(entry.adhesiveGsm),
    inkGsm: kg(entry.inkGsm),
    inkKg: kg(entry.inkKg) || 0,
    parentBarcode: text(entry.parentBarcode),
    parentConsumedKg: kg(entry.parentConsumedKg) || 0,
    ledgerLines
  };

  let printedLot = null;
  let outputBatch = null;
  if (process === 'printing') {
    const existingLot = entry.existingLot || null;
    const children = mergeChildren(existingLot?.childRolls, outputs);
    printedLot = planPrintingSfgLot({
      orderId: entry.orderId,
      jobName: entry.jobName,
      jobCode: entry.jobCode,
      jobMasterId: entry.jobMasterId,
      clientName: entry.clientName,
      filmType: entry.filmType,
      micron: entry.micron,
      widthMm: entry.widthMm,
      outputRolls: children,
      inputRolls: rollLines(entry.inputRolls).map((row) => ({ barcodeId: row.barcode })),
      meters: null,
      existingLot
    });
    printedLot.childRolls = (printedLot.childRolls || []).map((child) => {
      const source = children.find((roll) => roll.barcodeId === child.barcodeId);
      return source ? { ...child, grossWeightKg: source.grossWeightKg, tareWeightKg: source.tareWeightKg } : child;
    });
    if (existingLot?.id) printedLot.id = existingLot.id;
    printedLot.machineName = entry.machineName;
    printedLot.operatorName = entry.operatorName;
    printedLot.shift = entry.shift;
    printedLot.storageBay = entry.storageBay;
    printedLot.productionDate = entry.productionDate || printedLot.productionDate;
    printedLot.structure = entry.structure || '';
    const previousGross = previousBatch(entry.existingRecord, batchCode)?.grossKg || 0;
    const grossTotal = roundFilmKg((kg(existingLot?.totalGrossKg) || kg(existingLot?.totalNetKg) || 0) + gross - previousGross);
    printedLot.totalGrossKg = roundFilmKg(Math.max(printedLot.totalNetKg, grossTotal));
    printedLot.grossWeightKg = printedLot.totalGrossKg;
    const batchMeters = kg(entry.actualMeters) || outputs.reduce((sum, roll) => sum + (Number(roll.lengthMeters) || 0), 0);
    printedLot.totalMeters = sumPrintedLotMeters({
      existingLot,
      children: printedLot.childRolls,
      batchMeters,
      previousBatchMeters: previousBatch(entry.existingRecord, batchCode)?.meters
    });
  } else {
    outputBatch = outputBatchFrom(entry, batchCode, outputs);
  }

  const parentSource = entry.parentLot || findRoll(entry.sfgGoods, entry.parentBarcode);
  const parentLot = process === 'printing'
    ? null
    : planParentLotReduction(parentSource, { batchCode, consumedKg: entry.parentConsumedKg });

  const productionRecord = buildRecord(entry, batch, outputs, printedLot);
  const stockRows = [printedLot, outputBatch].filter(Boolean);

  const parentCode = printedLot?.sfgBatchCode || outputBatch?.sfgBatchCode || batchCode;
  const childInventoryRolls = outputs.map((roll, index) => childInventoryRoll(entry, roll, index, parentCode));
  const balanceRolls = rollLines(process === 'printing' ? entry.inputRolls : entry.substrateRolls)
    .filter((row) => row.barcode && row.balanceLeftKg > 0)
    .map((row) => ({
      parentBarcodeId: row.barcode,
      balanceBarcodeId: `${row.barcode}-BAL`,
      balanceKg: row.balanceLeftKg,
      balanceMeters: row.balanceLeftMeters
    }));

  return {
    ok: true,
    errors: [],
    process,
    batchCode,
    inventoryMaster: null,
    printedLot,
    outputBatch,
    parentLot,
    productionRecord,
    outputRolls: outputs,
    stockRows,
    childInventoryRolls,
    balanceRolls,
    createsInventoryMaster: false
  };
}

function childInventoryRoll(entry, roll, index, parentCode) {
  const isFG = entry.mode === 'FG';
  return {
    barcodeId: roll.barcodeId,
    id: roll.barcodeId,
    rollType: isFG ? 'FG' : 'SEMI_FINISHED_GOODS',
    itemName: `${entry.stageType || (isFG ? 'FG' : 'SFG')} - ${entry.jobName || 'Job'} (Roll #${index + 1})`,
    category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
    jobName: entry.jobName || '',
    orderId: entry.orderId || '',
    jobCode: entry.jobCode || '',
    clientName: entry.clientName || '',
    filmType: entry.filmType || '',
    micron: kg(entry.micron) || 0,
    widthMm: kg(entry.widthMm) || 0,
    netWeightKg: roll.netWeightKg,
    availableWeightKg: roll.netWeightKg,
    grossWeightKg: roll.grossWeightKg ?? roll.netWeightKg,
    tareWeightKg: roll.tareWeightKg || 0,
    lengthMeters: roll.lengthMeters || 0,
    status: isFG ? 'In Stock (Ready for Dispatch)' : 'In Stock (SFG)',
    qcStatus: 'Approved',
    sfgType: entry.stageType || '',
    locationBay: entry.storageBay || '',
    machineName: entry.machineName || '',
    operatorName: entry.operatorName || '',
    shift: entry.shift || '',
    productionDate: entry.productionDate || '',
    parentSfgBatchCode: parentCode,
    structure: entry.structure || ''
  };
}

export function carryProcessMeasures(record) {
  if (!record) return {};
  const carried = {};
  if (Array.isArray(record.sfgFgBatches)) carried.sfgFgBatches = record.sfgFgBatches;
  PROCESS_MEASURE_FIELDS.forEach((field) => {
    if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
      carried[field] = record[field];
    }
  });
  return carried;
}

export async function commitSfgFgBatch({ plan, saveProductionRecord, saveSfgGood, saveInventoryRoll } = {}) {
  if (!plan?.ok) {
    throw new Error((plan?.errors || ['This batch is not ready to save.']).join('\n'));
  }
  if (typeof saveProductionRecord !== 'function') {
    throw new Error('This screen cannot write the job production record.');
  }
  if (typeof saveSfgGood !== 'function') {
    throw new Error('This screen cannot write SFG / FG stock.');
  }
  const savedRecord = await saveProductionRecord(plan.productionRecord);
  if (plan.printedLot) await saveSfgGood(plan.printedLot);
  if (plan.outputBatch) await saveSfgGood(plan.outputBatch);
  if (plan.parentLot) await saveSfgGood(plan.parentLot);
  const childRolls = Array.isArray(plan.childInventoryRolls) ? plan.childInventoryRolls : [];
  if (childRolls.length > 0 && typeof saveInventoryRoll === 'function') {
    for (const roll of childRolls) {
      await saveInventoryRoll(roll);
    }
  }
  const warnings = Array.isArray(savedRecord?.consumptionWarnings) ? savedRecord.consumptionWarnings : [];
  return {
    ...plan,
    savedRecord: savedRecord || null,
    consumptionWarnings: warnings,
    appliedLines: (plan.productionRecord?.materialsList || []).filter((row) => row?.ledgerSource === LEDGER_SOURCE || String(row?.id || '').startsWith('sfg-fg-ledger:'))
  };
}
