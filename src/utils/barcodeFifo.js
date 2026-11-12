/**
 * Barcode-level FIFO age. This module stays free of app services so tests
 * can load it under Node. Age is per barcode, never per stock item.
 */

function parseDateFlexible(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  const d = new Date(rawDate);
  if (!Number.isNaN(d.getTime())) return d;
  if (typeof rawDate === 'string') {
    const parts = rawDate.split(/[/\-\s,:]+/);
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10) > 100 ? parseInt(parts[2], 10) : 2000 + parseInt(parts[2], 10);
      if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
        const parsed = new Date(year, month, day);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Timestamp fields that are this barcode's own creation or inward. Not lastUpdated. */
const TIMESTAMP_ORIGIN_FIELDS = [
  'inwardDatetime',
  'inward_datetime',
  'inwardDate',
  'createdAt',
  'created_at'
];

const DATE_ORIGIN_FIELDS = [
  'dateReceived',
  'receivedDate',
  'grnDate',
  'productionDate',
  'createdDate',
  'date'
];

/**
 * Whole days from origin to end. Never negative.
 * A missing bound returns null so the caller does not invent an age.
 */
export function ageDaysBetween(origin, end) {
  const start = origin instanceof Date ? origin : parseDateFlexible(origin);
  const stop = end instanceof Date ? end : parseDateFlexible(end);
  if (!start || !stop) return null;
  return Math.floor(Math.max(0, stop.getTime() - start.getTime()) / DAY_MS);
}

/** The barcode this row is. A stock item id is not a barcode. */
export function barcodeCode(record) {
  return String(record?.barcodeId || record?.barcode || record?.sfgBatchCode || '').trim();
}

export function isBalanceBarcode(code) {
  return String(code || '').trim().toUpperCase().endsWith('-BAL');
}

/** Parent code of a `-BAL` leftover. `RM-1-BAL-BAL` returns `RM-1-BAL`. */
export function balanceParentCode(code) {
  const text = String(code || '').trim();
  if (!isBalanceBarcode(text)) return '';
  return text.slice(0, -4);
}

function ownOriginDate(record) {
  if (!record) return null;
  for (const field of TIMESTAMP_ORIGIN_FIELDS) {
    const parsed = parseDateFlexible(record[field]);
    if (parsed) return parsed;
  }
  for (const field of DATE_ORIGIN_FIELDS) {
    const parsed = parseDateFlexible(record[field]);
    if (parsed) return parsed;
  }
  return null;
}

export function rollsByBarcode(rolls) {
  const map = new Map();
  (rolls || []).forEach((roll) => {
    const code = barcodeCode(roll);
    if (code) map.set(code.toLowerCase(), roll);
  });
  return map;
}

/**
 * Origin of one barcode. A leftover `-BAL` roll keeps the root barcode's
 * inward time. Its own inward time is the split, and must not restart the age.
 */
export function barcodeOriginDate(record, { rollsByCode, seen } = {}) {
  if (!record) return null;
  if (record.originAt) {
    const explicit = parseDateFlexible(record.originAt);
    if (explicit && !isBalanceBarcode(barcodeCode(record))) return explicit;
  }
  const code = barcodeCode(record);
  const key = code.toLowerCase();
  const trail = seen || new Set();
  if (key && trail.has(key)) return ownOriginDate(record);
  if (key) trail.add(key);

  const parentCode = String(
    record.parentBarcodeId || record.parentBarcode || balanceParentCode(code) || ''
  ).trim();
  if (parentCode && rollsByCode) {
    const parent = rollsByCode.get(parentCode.toLowerCase());
    if (parent && parent !== record) {
      const parentOrigin = barcodeOriginDate(parent, { rollsByCode, seen: trail });
      if (parentOrigin) return parentOrigin;
    }
  }
  if (record.originAt) {
    const explicit = parseDateFlexible(record.originAt);
    if (explicit) return explicit;
  }
  // No parent on file: do not treat the split timestamp as a new origin.
  if (isBalanceBarcode(code) && parentCode) return null;
  return ownOriginDate(record);
}

function eventTime(value) {
  return parseDateFlexible(value);
}

/** Positive consumption rows. A restore (negative kg) does not freeze age. */
export function consumptionEventsFromHistory(history) {
  const events = [];
  (history || []).forEach((log) => {
    if (!log || typeof log !== 'object') return;
    const rawQty = log.consumedKg ?? log.stockDeductedKg ?? log.weightKg;
    const qty = Number(rawQty);
    if (!(qty > 0)) return;
    const consumedAt = eventTime(log.timestamp || log.consumedAt || log.date);
    if (!consumedAt) return;
    events.push({ qty, consumedAt, id: log.id || '' });
  });
  return events;
}

function balanceQtyOf(record) {
  if (record?.availableKg !== undefined && record?.availableKg !== null && record?.availableKg !== '') {
    return Math.max(0, Number(record.availableKg) || 0);
  }
  if (record?.availableWeightKg !== undefined && record?.availableWeightKg !== null && record?.availableWeightKg !== '') {
    return Math.max(0, Number(record.availableWeightKg) || 0);
  }
  if (record?.availableQtyKg !== undefined && record?.availableQtyKg !== null && record?.availableQtyKg !== '') {
    return Math.max(0, Number(record.availableQtyKg) || 0);
  }
  const initial = Number(record?.totalNetKg ?? record?.netWeightKg ?? 0) || 0;
  const consumed = Number(record?.consumedKg ?? 0) || 0;
  if (initial > 0 || consumed > 0) return Math.max(0, initial - consumed);
  return null;
}

/**
 * FIFO age of one barcode.
 *
 * Balance still on the barcode keeps aging from its original origin.
 * Each consumed quantity freezes at the timestamp that consumption was recorded.
 * When nothing remains, the badge is the age of the quantity that finished it
 * (origin → that later consume), and it does not move when `now` moves.
 */
export function fifoAgeForBarcode(record, {
  now = new Date(),
  rollsByCode = null,
  events = null,
  balanceQty = null
} = {}) {
  const origin = barcodeOriginDate(record, { rollsByCode });
  const clock = now instanceof Date ? now : (parseDateFlexible(now) || new Date());
  const slices = (events || consumptionEventsFromHistory(record?.consumptionHistory))
    .map((event) => {
      const consumedAt = event?.consumedAt instanceof Date ? event.consumedAt : eventTime(event?.consumedAt || event?.timestamp || event?.date);
      const qty = Number(event?.qty ?? event?.consumedKg);
      if (!(qty > 0) || !consumedAt) return null;
      return {
        qty,
        consumedAt,
        id: event.id || '',
        ageDays: origin ? ageDaysBetween(origin, consumedAt) : null,
        frozen: true
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.consumedAt - b.consumedAt);

  const balance = balanceQty == null || Number.isNaN(Number(balanceQty))
    ? balanceQtyOf(record)
    : Math.max(0, Number(balanceQty) || 0);

  let display;
  if (!origin) {
    display = { ageDays: null, frozen: balance === 0, asOf: null };
  } else if (balance > 0) {
    display = { ageDays: ageDaysBetween(origin, clock), frozen: false, asOf: clock };
  } else if (slices.length) {
    const closing = slices[slices.length - 1];
    display = { ageDays: closing.ageDays, frozen: true, asOf: closing.consumedAt };
  } else {
    display = { ageDays: null, frozen: balance === 0, asOf: null };
  }

  return {
    barcode: barcodeCode(record),
    origin,
    balanceQty: balance,
    balance: balance > 0 && origin
      ? { qty: balance, ageDays: display.ageDays, frozen: false, asOf: clock, origin }
      : null,
    consumed: slices,
    display
  };
}

export function formatFifoAgeLabel(fifo) {
  if (!fifo?.display) return '';
  const days = fifo.display.ageDays;
  if (fifo.display.frozen) {
    return days == null ? 'FIFO frozen' : `FIFO (${days}d, frozen)`;
  }
  if (days == null) return '';
  return `FIFO (${days}d)`;
}

export function formatConsumedFifoLabel(slice) {
  if (!slice) return '';
  const qty = Number(slice.qty);
  const qtyText = Number.isFinite(qty) ? `${qty} kg` : 'qty';
  if (slice.ageDays == null) return `Consumed ${qtyText} frozen`;
  return `Consumed ${qtyText} frozen (${slice.ageDays}d)`;
}

/** Same substitutable material. Different jobs are not the same material. */
export function fifoMaterialKey(record) {
  const orderId = String(record?.orderId || '').trim();
  const batch = String(record?.sfgBatchCode || '').trim();
  const typed = record?.sfgType || record?.isPrintedLot;
  if (orderId && (typed || batch.startsWith('SFG-') || batch.startsWith('FG-'))) {
    return `sfg-order:${orderId}`;
  }
  const itemId = String(record?.itemId || record?.stockItemId || '').trim();
  if (itemId) return `item:${itemId}`;
  const name = String(record?.itemName || record?.filmType || '').trim().toLowerCase();
  if (!name) return '';
  return `spec:${name}|${record?.micron ?? ''}|${record?.widthMm ?? record?.width ?? ''}`;
}

function categoryThresholdDays(category, settings) {
  if (category && settings && settings[category] !== undefined && settings[category] !== null) {
    return Number(settings[category]) || 90;
  }
  return Number(settings?.defaultDays) || 90;
}

export function openBarcodeIsOverAged(fifo, category, settings) {
  if (!fifo || fifo.display?.frozen) return false;
  if (!(Number(fifo.balanceQty) > 0)) return false;
  if (fifo.display?.ageDays == null) return false;
  return fifo.display.ageDays > categoryThresholdDays(category, settings);
}

function childBalanceRoll(roll, rollsByCode) {
  const code = barcodeCode(roll);
  if (!code || !rollsByCode) return null;
  return rollsByCode.get(`${code}-BAL`.toLowerCase()) || null;
}

function roundKg(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Consumption timestamps already recorded against this barcode.
 * A `-BAL` child means the parent was split: the consumed part froze at the
 * child's inward time, and the child itself is the remaining balance.
 */
export function eventsForRawBarcode(roll, { issues = [], ledger = [], rollsByCode } = {}) {
  const code = barcodeCode(roll).toLowerCase();
  const events = [];
  (issues || []).forEach((tx) => {
    const kind = String(tx?.issueType || 'issue');
    if (kind !== 'issue') return;
    if (String(tx?.barcode || '').trim().toLowerCase() !== code) return;
    const consumedAt = eventTime(tx.date || tx.timestamp || tx.createdAt);
    const qty = Number(tx.qtyKg ?? tx.qty ?? 0);
    if (consumedAt && qty > 0) events.push({ qty, consumedAt, id: tx.id || '' });
  });
  (ledger || []).forEach((entry) => {
    const kind = entry.entryKind || entry.entry_kind;
    if (kind && kind !== 'issue') return;
    if (String(entry.barcode || '').trim().toLowerCase() !== code) return;
    const consumedAt = eventTime(entry.occurredAt || entry.occurred_at || entry.timestamp);
    const qty = Number(entry.consumedKg ?? entry.consumed_kg ?? entry.qtyKg ?? entry.qty_kg ?? 0);
    if (consumedAt && qty > 0) events.push({ qty, consumedAt, id: entry.id || '' });
  });
  if (events.length) return events;
  const child = childBalanceRoll(roll, rollsByCode);
  if (!child) return events;
  const initial = Number(roll.netWeightKg || roll.totalNetKg || 0);
  const kept = Number(child.netWeightKg ?? child.availableWeightKg ?? 0);
  const qty = roundKg(Math.max(0, initial - kept));
  const consumedAt = eventTime(child.inwardDatetime || child.createdAt);
  if (qty > 0 && consumedAt) events.push({ qty, consumedAt, id: `split-${barcodeCode(child)}` });
  return events;
}

function returnedQty(roll, issues) {
  const code = barcodeCode(roll).toLowerCase();
  return (issues || []).reduce((sum, tx) => {
    if (String(tx?.issueType || '') !== 'return') return sum;
    if (String(tx?.barcode || '').trim().toLowerCase() !== code) return sum;
    return sum + (Number(tx.qtyKg ?? tx.qty ?? 0) || 0);
  }, 0);
}

function rawBalanceQty(roll, events, issues, rollsByCode) {
  // The leftover lives on the -BAL barcode, so the parent balance is zero.
  if (childBalanceRoll(roll, rollsByCode)) return 0;
  const issued = events.reduce((sum, event) => sum + (Number(event.qty) || 0), 0);
  const returned = returnedQty(roll, issues);
  if (issued > 0 || returned > 0) {
    const net = Number(roll.netWeightKg || roll.totalNetKg || 0);
    const availableRaw = roll.availableWeightKg ?? roll.availableKg;
    const available = availableRaw === undefined || availableRaw === null || availableRaw === ''
      ? null
      : Number(availableRaw);
    const initial = net > 0 ? net : (Number.isFinite(available) ? available : 0);
    const fromEvents = roundKg(Math.max(0, initial - issued + returned));
    // The roll row is the quantity still on this barcode. A closed roll
    // (available 0, no -BAL child) must not keep aging a balance the post already removed.
    if (available != null && Number.isFinite(available)) {
      return roundKg(Math.min(Math.max(0, available), fromEvents));
    }
    return fromEvents;
  }
  return null;
}

/** One FIFO result per barcode. Does not collapse a stock item to a single age. */
export function buildRollFifoIndex(rolls, { issues = [], ledger = [], now = new Date() } = {}) {
  const rollsByCode = rollsByBarcode(rolls);
  const index = new Map();
  (rolls || []).forEach((roll) => {
    const code = barcodeCode(roll);
    if (!code) return;
    const events = eventsForRawBarcode(roll, { issues, ledger, rollsByCode });
    const balanceQty = rawBalanceQty(roll, events, issues, rollsByCode);
    index.set(code.toLowerCase(), fifoAgeForBarcode(roll, { now, rollsByCode, events, balanceQty }));
  });
  return index;
}

export function fifosForItemIds(itemIds, rolls, index) {
  const ids = new Set((itemIds || []).filter(Boolean).map((id) => String(id)));
  const rows = [];
  (rolls || []).forEach((roll) => {
    if (!ids.has(String(roll.itemId || ''))) return;
    const fifo = index?.get(barcodeCode(roll).toLowerCase());
    if (fifo) rows.push({ roll, fifo });
  });
  rows.sort((a, b) => {
    const aOpen = a.fifo.balanceQty > 0 ? 0 : 1;
    const bOpen = b.fifo.balanceQty > 0 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aMs = a.fifo.origin ? a.fifo.origin.getTime() : Number.MAX_SAFE_INTEGER;
    const bMs = b.fifo.origin ? b.fifo.origin.getTime() : Number.MAX_SAFE_INTEGER;
    if (aMs !== bMs) return aMs - bMs;
    return barcodeCode(a.roll).localeCompare(barcodeCode(b.roll));
  });
  return rows;
}

export function isFifoConsumeFirst(row, siblings) {
  if (!(row?.fifo?.balanceQty > 0) || !row.fifo.origin) return false;
  const open = (siblings || []).filter((sibling) => sibling?.fifo?.balanceQty > 0 && sibling.fifo.origin);
  if (open.length < 2) return false;
  const oldest = open.reduce((best, sibling) => (
    sibling.fifo.origin.getTime() < best.fifo.origin.getTime() ? sibling : best
  ));
  return barcodeCode(oldest.roll).toLowerCase() === barcodeCode(row.roll).toLowerCase();
}

/**
 * When this barcode is still in stock and an older barcode of the same
 * material is too, return a warning. Null means this choice is already oldest.
 */
export function newerBarcodeWarning(chosen, records, { rollsByCode = null, now = new Date() } = {}) {
  if (!chosen) return null;
  const map = rollsByCode || rollsByBarcode(records);
  const chosenFifo = fifoAgeForBarcode(chosen, { now, rollsByCode: map });
  if (!(chosenFifo.balanceQty > 0) || !chosenFifo.origin) return null;
  const key = fifoMaterialKey(chosen);
  if (!key) return null;
  const chosenCode = barcodeCode(chosen).toLowerCase();
  const older = (records || [])
    .filter((record) => record && barcodeCode(record).toLowerCase() !== chosenCode)
    .filter((record) => fifoMaterialKey(record) === key)
    .map((record) => ({ record, fifo: fifoAgeForBarcode(record, { now, rollsByCode: map }) }))
    .filter((row) => row.fifo.balanceQty > 0 && row.fifo.origin && row.fifo.origin.getTime() < chosenFifo.origin.getTime())
    .sort((a, b) => a.fifo.origin - b.fifo.origin);
  if (!older.length) return null;
  const first = older[0];
  const olderCode = barcodeCode(first.record);
  return {
    olderBarcode: olderCode,
    olderAgeDays: first.fifo.display.ageDays,
    chosenBarcode: barcodeCode(chosen),
    chosenAgeDays: chosenFifo.display.ageDays,
    message: `Older barcode ${olderCode} is still in stock at FIFO (${first.fifo.display.ageDays}d). Clear it before newer barcode ${barcodeCode(chosen)} (FIFO ${chosenFifo.display.ageDays}d).`
  };
}

/** Warning only. OK continues with the newer barcode. Cancel means the operator picked again. */
export function acceptNewerBarcodeChoice(chosen, records, {
  rollsByCode = null,
  now = new Date(),
  enforce = true,
  confirm
} = {}) {
  const warning = newerBarcodeWarning(chosen, records, { rollsByCode, now });
  if (!warning || enforce === false) return { ok: true, warning };
  const ask = typeof confirm === 'function'
    ? confirm
    : (message) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true);
  const ok = ask(`${warning.message}\n\nContinue with the newer barcode?`) !== false;
  return { ok, warning };
}
