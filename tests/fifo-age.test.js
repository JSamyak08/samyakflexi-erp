import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  acceptNewerBarcodeChoice,
  buildRollFifoIndex,
  fifoAgeForBarcode,
  formatConsumedFifoLabel,
  formatFifoAgeLabel,
  listInStockBarcodeFifos,
  newerBarcodeWarning,
  rollsByBarcode
} from '../src/utils/barcodeFifo.js';

const origin = new Date('2026-01-01T00:00:00.000Z');
const firstConsume = new Date('2026-01-08T00:00:00.000Z');
const secondConsume = new Date('2026-01-11T00:00:00.000Z');
const laterNow = new Date('2026-01-20T00:00:00.000Z');

function sfgBarcode(overrides = {}) {
  return {
    barcodeId: 'SFG-LOT-ORD-1',
    sfgBatchCode: 'SFG-LOT-ORD-1',
    orderId: 'ORD-1',
    sfgType: 'Printed Rolls',
    createdAt: origin.toISOString(),
    totalNetKg: 100,
    consumedKg: 0,
    availableKg: 100,
    consumptionHistory: [],
    ...overrides
  };
}

test('a fully consumed barcode freezes at origin → consume and does not age further', () => {
  const item = sfgBarcode({
    availableKg: 0,
    consumedKg: 100,
    consumptionHistory: [{
      id: 'full',
      consumedKg: 100,
      timestamp: firstConsume.toISOString(),
      remainingBalanceKg: 0
    }]
  });
  const atConsume = fifoAgeForBarcode(item, { now: firstConsume });
  const muchLater = fifoAgeForBarcode(item, { now: laterNow });

  assert.equal(atConsume.display.frozen, true);
  assert.equal(atConsume.display.ageDays, 7);
  assert.equal(muchLater.display.ageDays, 7);
  assert.equal(muchLater.display.frozen, true);
  assert.equal(muchLater.balance, null);
  assert.equal(formatFifoAgeLabel(muchLater), 'FIFO (7d, frozen)');
  assert.equal(muchLater.consumed[0].frozen, true);
  assert.equal(muchLater.consumed[0].ageDays, 7);
});

test('a partial consume freezes that quantity and the balance keeps the original origin', () => {
  const item = sfgBarcode({
    availableKg: 40,
    consumedKg: 60,
    consumptionHistory: [{
      id: 'partial',
      consumedKg: 60,
      timestamp: firstConsume.toISOString(),
      remainingBalanceKg: 40
    }]
  });
  const atTenDays = fifoAgeForBarcode(item, { now: secondConsume });
  const atNineteenDays = fifoAgeForBarcode(item, { now: laterNow });

  assert.equal(atTenDays.consumed[0].ageDays, 7);
  assert.equal(atTenDays.consumed[0].frozen, true);
  assert.equal(atTenDays.balance.frozen, false);
  assert.equal(atTenDays.balance.ageDays, 10);
  assert.equal(atTenDays.balance.origin.getTime(), origin.getTime());
  assert.notEqual(atTenDays.balance.origin.getTime(), firstConsume.getTime());

  assert.equal(atNineteenDays.consumed[0].ageDays, 7);
  assert.equal(atNineteenDays.balance.ageDays, 19);
  assert.equal(formatFifoAgeLabel(atNineteenDays), 'FIFO (19d)');
  assert.match(formatConsumedFifoLabel(atNineteenDays.consumed[0]), /frozen \(7d\)/);
});

test('the remaining balance freezes at the later consume, still from the original origin', () => {
  const item = sfgBarcode({
    availableKg: 0,
    consumedKg: 100,
    consumptionHistory: [
      { id: 'second', consumedKg: 40, timestamp: secondConsume.toISOString(), remainingBalanceKg: 0 },
      { id: 'first', consumedKg: 60, timestamp: firstConsume.toISOString(), remainingBalanceKg: 40 }
    ]
  });
  const closed = fifoAgeForBarcode(item, { now: laterNow });

  assert.equal(closed.display.frozen, true);
  assert.equal(closed.display.ageDays, 10);
  assert.equal(closed.origin.getTime(), origin.getTime());
  assert.equal(closed.consumed[0].qty, 60);
  assert.equal(closed.consumed[0].ageDays, 7);
  assert.equal(closed.consumed[1].qty, 40);
  assert.equal(closed.consumed[1].ageDays, 10);
  assert.equal(closed.consumed[0].frozen, true);
  assert.equal(closed.consumed[1].frozen, true);
});

test('raw-material barcodes follow the same freeze, and a -BAL balance does not restart', () => {
  const parent = {
    barcodeId: 'RM-100',
    itemId: 'INVT-PET',
    itemName: 'PET 12µ',
    inwardDatetime: origin.toISOString(),
    netWeightKg: 100,
    availableWeightKg: 0,
    category: 'Film Substrates'
  };
  const balance = {
    barcodeId: 'RM-100-BAL',
    parentBarcodeId: 'RM-100',
    itemId: 'INVT-PET',
    itemName: 'PET 12µ',
    inwardDatetime: firstConsume.toISOString(),
    createdAt: firstConsume.toISOString(),
    netWeightKg: 40,
    availableWeightKg: 40,
    category: 'Raw Material (RM)'
  };
  const openIndex = buildRollFifoIndex([parent, balance], { now: secondConsume });
  const parentFifo = openIndex.get('rm-100');
  const balanceFifo = openIndex.get('rm-100-bal');

  assert.equal(parentFifo.display.frozen, true);
  assert.equal(parentFifo.consumed[0].ageDays, 7);
  assert.equal(parentFifo.consumed[0].qty, 60);
  assert.equal(balanceFifo.display.frozen, false);
  assert.equal(balanceFifo.origin.getTime(), origin.getTime());
  assert.notEqual(balanceFifo.origin.getTime(), firstConsume.getTime());
  assert.equal(balanceFifo.balance.ageDays, 10);

  const stillOpen = buildRollFifoIndex([parent, balance], { now: laterNow });
  assert.equal(stillOpen.get('rm-100').display.ageDays, 7);
  assert.equal(stillOpen.get('rm-100-bal').balance.ageDays, 19);

  const closedIndex = buildRollFifoIndex(
    [parent, { ...balance, availableWeightKg: 0 }],
    {
      now: laterNow,
      issues: [{
        id: 'ISS-BAL',
        barcode: 'RM-100-BAL',
        issueType: 'issue',
        qtyKg: 40,
        date: secondConsume.toISOString()
      }]
    }
  );
  const closedBalance = closedIndex.get('rm-100-bal');
  assert.equal(closedBalance.display.frozen, true);
  assert.equal(closedBalance.display.ageDays, 10);
  assert.equal(closedBalance.origin.getTime(), origin.getTime());
  assert.equal(formatFifoAgeLabel(closedBalance), 'FIFO (10d, frozen)');

  // A roll the existing post closed (available 0) does not keep a live balance
  // just because the issue line is smaller than the original net.
  const closedParent = buildRollFifoIndex([{
    barcodeId: 'RM-CLOSED',
    itemId: 'INVT-PET',
    inwardDatetime: origin.toISOString(),
    netWeightKg: 100,
    availableWeightKg: 0
  }], {
    now: laterNow,
    issues: [{ barcode: 'RM-CLOSED', issueType: 'issue', qtyKg: 25, date: firstConsume.toISOString() }]
  }).get('rm-closed');
  assert.equal(closedParent.balanceQty, 0);
  assert.equal(closedParent.display.frozen, true);
  assert.equal(closedParent.display.ageDays, 7);
  assert.equal(closedParent.consumed[0].qty, 25);
});

test('two barcodes of one stock item keep separate ages and the newer one is warned', () => {
  const older = {
    barcodeId: 'RM-OLD',
    itemId: 'INVT-PET',
    inwardDatetime: origin.toISOString(),
    netWeightKg: 80,
    availableWeightKg: 80
  };
  const newer = {
    barcodeId: 'RM-NEW',
    itemId: 'INVT-PET',
    inwardDatetime: firstConsume.toISOString(),
    netWeightKg: 50,
    availableWeightKg: 50
  };
  const index = buildRollFifoIndex([older, newer], { now: secondConsume });
  assert.equal(index.get('rm-old').display.ageDays, 10);
  assert.equal(index.get('rm-new').display.ageDays, 3);
  assert.notEqual(index.size, 1);

  const map = rollsByBarcode([older, newer]);
  const warning = newerBarcodeWarning(newer, [older, newer], { rollsByCode: map, now: secondConsume });
  assert.equal(warning.olderBarcode, 'RM-OLD');
  assert.equal(warning.chosenBarcode, 'RM-NEW');
  assert.match(warning.message, /RM-OLD/);
  assert.equal(newerBarcodeWarning(older, [older, newer], { rollsByCode: map, now: secondConsume }), null);

  let asked = '';
  const declined = acceptNewerBarcodeChoice(newer, [older, newer], {
    rollsByCode: map,
    now: secondConsume,
    enforce: true,
    confirm: (message) => {
      asked = message;
      return false;
    }
  });
  assert.equal(declined.ok, false);
  assert.match(asked, /Continue with the newer barcode/);

  const allowed = acceptNewerBarcodeChoice(newer, [older, newer], {
    rollsByCode: map,
    now: secondConsume,
    enforce: false,
    confirm: () => {
      throw new Error('enforcement off must not ask');
    }
  });
  assert.equal(allowed.ok, true);
});

function mgpRoll(barcodeId, available, status, inward) {
  return {
    barcodeId,
    itemId: 'INVT-0127',
    itemName: 'MGP-1035-50',
    status,
    inwardDatetime: inward,
    netWeightKg: available,
    availableWeightKg: available
  };
}

test('a reversed 0 kg balance tag does not hide its in-stock parent', () => {
  const opening = '2026-10-29T13:24:06.493Z';
  const grn = '2026-11-23T10:20:21.632Z';
  const rolls = [
    mgpRoll('RM-BC-20261029-19458AZ0', 232.3, 'In Stock', opening),
    mgpRoll('RM-BC-20261029-194597VV', 234.9, 'In Stock', opening),
    mgpRoll('RM-BC-20261029-1945RHIZ', 237.3, 'In Stock', opening),
    mgpRoll('RM-BC-20261029-1945T0TO', 235.1, 'In Stock', opening),
    mgpRoll('RM-BC-SIL/GRN/26-27/215-L1-R1', 270.2, 'In Stock', grn),
    mgpRoll('RM-BC-SIL/GRN/26-27/215-L1-R2', 269.8, 'In Stock', grn),
    mgpRoll('RM-BC-SIL/GRN/26-27/215-L1-R3', 270.8, 'In Stock', grn),
    mgpRoll('RM-BC-SIL/GRN/26-27/215-L1-R4', 270.4, 'In Stock', grn),
    {
      barcodeId: 'RM-BC-SIL/GRN/26-27/215-L1-R2-BAL',
      parentBarcodeId: 'RM-BC-SIL/GRN/26-27/215-L1-R2',
      itemId: 'INVT-0127',
      status: 'Reversed',
      inwardDatetime: '2026-11-25T08:28:51.188Z',
      netWeightKg: 0,
      availableWeightKg: 0
    }
  ];
  const index = buildRollFifoIndex(rolls, { now: laterNow });
  const parent = index.get('rm-bc-sil/grn/26-27/215-l1-r2');
  assert.equal(parent.balanceQty, 269.8);
  assert.equal(parent.display.frozen, false);
  assert.equal(index.get('rm-bc-sil/grn/26-27/215-l1-r2-bal').balanceQty, 0);

  const listed = listInStockBarcodeFifos(['INVT-0127'], rolls, index);
  const codes = listed.map(({ roll }) => roll.barcodeId);
  assert.equal(listed.length, 8);
  assert.equal(codes.includes('RM-BC-SIL/GRN/26-27/215-L1-R2'), true);
  assert.equal(codes.includes('RM-BC-SIL/GRN/26-27/215-L1-R2-BAL'), false);
});

test('a reversed balance tag that still has a net weight does not zero the restored parent', () => {
  const parent = {
    barcodeId: 'RM-PARENT',
    itemId: 'INVT-0127',
    status: 'In Stock',
    inwardDatetime: origin.toISOString(),
    netWeightKg: 100,
    availableWeightKg: 100
  };
  const reversed = {
    barcodeId: 'RM-PARENT-BAL',
    parentBarcodeId: 'RM-PARENT',
    itemId: 'INVT-0127',
    status: 'Reversed',
    inwardDatetime: firstConsume.toISOString(),
    netWeightKg: 40,
    availableWeightKg: 0
  };
  const index = buildRollFifoIndex([parent, reversed], { now: laterNow });
  assert.equal(index.get('rm-parent').balanceQty, 100);
  const listed = listInStockBarcodeFifos(['INVT-0127'], [parent, reversed], index);
  assert.deepEqual(listed.map(({ roll }) => roll.barcodeId), ['RM-PARENT']);
});

test('a live balance roll still owns the leftover and the parent stays off the in-stock list', () => {
  const parent = {
    barcodeId: 'RM-100',
    itemId: 'INVT-PET',
    status: 'In Stock',
    inwardDatetime: origin.toISOString(),
    netWeightKg: 100,
    availableWeightKg: 0
  };
  const balance = {
    barcodeId: 'RM-100-BAL',
    itemId: 'INVT-PET',
    status: 'In Stock',
    inwardDatetime: firstConsume.toISOString(),
    netWeightKg: 40,
    availableWeightKg: 40
  };
  const index = buildRollFifoIndex([parent, balance], { now: secondConsume });
  assert.equal(index.get('rm-100').balanceQty, 0);
  assert.equal(index.get('rm-100').display.frozen, true);
  const listed = listInStockBarcodeFifos(['INVT-PET'], [parent, balance], index);
  assert.deepEqual(listed.map(({ roll }) => roll.barcodeId), ['RM-100-BAL']);
});

test('written off, fully issued, and 0 kg rolls stay off the in-stock barcode list', () => {
  const rolls = [
    { barcodeId: 'RM-OPEN', itemId: 'INVT-PET', status: 'In Stock', inwardDatetime: origin.toISOString(), netWeightKg: 10, availableWeightKg: 10 },
    { barcodeId: 'RM-OFF', itemId: 'INVT-PET', status: 'Written Off', inwardDatetime: origin.toISOString(), netWeightKg: 8, availableWeightKg: 8 },
    { barcodeId: 'RM-ISSUED', itemId: 'INVT-PET', status: 'Fully Issued', inwardDatetime: origin.toISOString(), netWeightKg: 8, availableWeightKg: 8 },
    { barcodeId: 'RM-EMPTY', itemId: 'INVT-PET', status: 'In Stock', inwardDatetime: origin.toISOString(), netWeightKg: 8, availableWeightKg: 0 }
  ];
  const index = buildRollFifoIndex(rolls, { now: laterNow });
  const listed = listInStockBarcodeFifos(['INVT-PET'], rolls, index);
  assert.deepEqual(listed.map(({ roll }) => roll.barcodeId), ['RM-OPEN']);
});

test('SFG and raw-material screens show barcode FIFO and not one age on the stock item', () => {
  const sfg = fs.readFileSync(new URL('../src/components/SFGStoreManagement.jsx', import.meta.url), 'utf8');
  const inventory = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  const badge = sfg.slice(sfg.indexOf('data-testid="sfg-fifo-age"') - 400, sfg.indexOf('data-testid="sfg-fifo-age"') + 500);
  assert.match(sfg, /fifoAgeForBarcode\(item\)/);
  assert.match(sfg, /formatFifoAgeLabel/);
  assert.match(sfg, /data-testid="sfg-fifo-age"/);
  assert.doesNotMatch(badge, /getItemAgeInDays/);

  assert.match(inventory, /data-testid="ledger-barcode-fifo"/);
  assert.match(inventory, /Barcodes \(FIFO\)/);
  assert.match(inventory, /data-testid="barcode-fifo-line"/);
  assert.match(inventory, /buildRollFifoIndex/);
  assert.doesNotMatch(inventory, /FIFO Stock/);
  const stockRows = inventory.slice(inventory.indexOf('stockPagination.paginatedItems.map'), inventory.indexOf('TAB 2: INWARD'));
  assert.doesNotMatch(stockRows, /getItemAgeInDays\(/);
  assert.doesNotMatch(stockRows, /getItemInwardDate\(/);
  assert.doesNotMatch(stockRows, /data-testid="barcode-fifo-line"/);
  assert.doesNotMatch(stockRows, /data-testid="stock-barcode-fifo"/);
  const ledgerView = inventory.slice(inventory.indexOf('data-testid="ledger-barcode-fifo"'));
  assert.match(ledgerView, /FIFO consume first/);
  assert.match(ledgerView, /formatPlantDate\(fifo\.origin/);
});
