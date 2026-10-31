import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

await register(new URL('../scripts/resolve-js-hook.mjs', import.meta.url));

const { DEFAULT_ROLE_PERMISSIONS, getOrderStageInfo } = await import('../src/factoryStore.js');
const {
  OVERDUE_ORDER_CSV_HEADERS,
  PENDING_ORDER_CSV_HEADERS,
  buildOrderCsv,
  buildOrderReportRows,
  filterOrdersLikeManagement,
  isOverdueOrder,
  isPendingOrder,
  orderCsvFileName,
  usableOnHandKg,
} = await import('../src/utils/orderCsvReport.js');

const TODAY = '2026-10-30';

function order(overrides = {}) {
  return {
    id: 'ORD-1',
    jobName: 'Atta 5kg',
    clientName: 'Sharma Traders',
    orderQtyKg: 200,
    status: 'In Progress',
    orderDate: '2026-10-01',
    targetDeliveryDate: '2026-11-02',
    deliveryDate: '2026-11-02',
    structure: 'PET 12µ / LD 30µ',
    printWidthMm: 710,
    repeatLengthMm: 400,
    jobCode: 'JOB-44',
    priority: 'High',
    clientPoNumber: 'PO-CUST-9',
    ...overrides,
  };
}

function petLine(id, qtyKg) {
  return { id, filmType: 'PET', micron: 12, widthMm: 710, qtyKg, poIssued: false };
}

function parseCsv(csv) {
  const text = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function table(csv) {
  const [header, ...body] = parseCsv(csv);
  return body.filter((line) => line.length > 1 || line[0]).map((line) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = line[index];
    });
    return record;
  });
}

test('pending leaves out completed, dispatched, delivered, and cancelled orders', () => {
  const open = order();
  const closed = ['Completed', 'Dispatched', 'Delivered', 'Cancelled', 'canceled', 'Closed'].map((status, index) => (
    order({ id: `ORD-C-${index}`, status, targetDeliveryDate: '2020-01-01' })
  ));
  const dispatchedStage = order({
    id: 'ORD-STAGE',
    status: 'In Progress',
    orderQtyKg: 100,
    targetDeliveryDate: '2020-01-01',
  });
  const sfgGoods = [{
    orderId: 'ORD-STAGE',
    rollType: 'FG',
    sfgBatchCode: 'FG-1',
    totalNetKg: 100,
    netWeightKg: 100,
    dispatchedKg: 100,
    availableKg: 0,
    status: 'Dispatched',
  }];
  assert.equal(getOrderStageInfo(dispatchedStage, sfgGoods, []).stage, 'Dispatched');
  assert.equal(isPendingOrder(dispatchedStage, getOrderStageInfo(dispatchedStage, sfgGoods, [])), false);
  closed.forEach((row) => assert.equal(isPendingOrder(row, getOrderStageInfo(row, [], [])), false));

  const partial = order({ id: 'ORD-PART', orderQtyKg: 100, targetDeliveryDate: '2020-01-01' });
  const partialGoods = [{
    orderId: 'ORD-PART',
    rollType: 'FG',
    sfgBatchCode: 'FG-2',
    totalNetKg: 40,
    netWeightKg: 40,
    dispatchedKg: 40,
    availableKg: 0,
    status: 'Partially Dispatched',
  }];
  assert.equal(getOrderStageInfo(partial, partialGoods, []).stage, 'Partially Dispatched');
  assert.equal(isPendingOrder(partial, getOrderStageInfo(partial, partialGoods, [])), true);

  const rows = buildOrderReportRows({
    kind: 'pending',
    today: TODAY,
    orders: [open, ...closed, dispatchedStage, partial],
    sfgGoods: [...sfgGoods, ...partialGoods],
  });
  assert.deepEqual(rows.map((row) => row['Order No']), ['ORD-1', 'ORD-PART']);
});

test('overdue is a pending order whose committed date is before today in India', () => {
  const future = order({ id: 'FUTURE', targetDeliveryDate: '2026-12-01', deliveryDate: '2026-12-01', status: 'Delayed' });
  const today = order({ id: 'TODAY', targetDeliveryDate: TODAY, deliveryDate: TODAY });
  const past = order({ id: 'PAST', targetDeliveryDate: '2026-10-28', deliveryDate: '2026-10-28' });
  const revisedOut = order({
    id: 'REVISED-OUT',
    targetDeliveryDate: '2026-10-01',
    deliveryDate: '2026-10-01',
    revisedDeadline: '2026-11-20',
  });
  const revisedIn = order({
    id: 'REVISED-IN',
    targetDeliveryDate: '2026-11-20',
    deliveryDate: '2026-11-20',
    revisedDeadline: '2026-10-01',
  });
  const noDate = order({ id: 'NONE', targetDeliveryDate: '', deliveryDate: '', orderDate: '' });
  const onHold = order({ id: 'HOLD', status: 'On Hold', targetDeliveryDate: '2026-10-01', deliveryDate: '2026-10-01' });
  const completed = order({ id: 'DONE', status: 'Completed', targetDeliveryDate: '2026-10-01' });

  assert.equal(isOverdueOrder(future, getOrderStageInfo(future, [], []), TODAY), false);
  assert.equal(isOverdueOrder(today, getOrderStageInfo(today, [], []), TODAY), false);
  assert.equal(isOverdueOrder(past, getOrderStageInfo(past, [], []), TODAY), true);
  assert.equal(isOverdueOrder(revisedOut, getOrderStageInfo(revisedOut, [], []), TODAY), false);
  assert.equal(isOverdueOrder(revisedIn, getOrderStageInfo(revisedIn, [], []), TODAY), true);
  assert.equal(isOverdueOrder(noDate, getOrderStageInfo(noDate, [], []), TODAY), false);
  assert.equal(isOverdueOrder(onHold, getOrderStageInfo(onHold, [], []), TODAY), true);
  assert.equal(isOverdueOrder(completed, getOrderStageInfo(completed, [], []), TODAY), false);

  const rows = buildOrderReportRows({
    kind: 'overdue',
    today: TODAY,
    orders: [future, today, past, revisedOut, revisedIn, noDate, onHold, completed],
  });
  assert.deepEqual(rows.map((row) => row['Order No']), ['PAST', 'REVISED-IN', 'HOLD']);
  const pastRow = rows.find((row) => row['Order No'] === 'PAST');
  assert.equal(pastRow['Days Remaining'], -2);
  assert.equal(pastRow['Days Overdue'], 2);
  assert.equal(pastRow['Delivery/Due Date'], '28/10/2026');
  assert.equal(rows.find((row) => row['Order No'] === 'REVISED-IN')['Delivery/Due Date'], '01/10/2026');
});

test('the csv is excel-friendly and the file name uses the India day', () => {
  const rows = [order({
    id: 'ORD-9',
    jobName: 'Atta, "5kg"',
    clientName: 'Sharma, Traders',
    orderDate: '2026-10-28',
    orderQtyKg: 200.5,
    materialRequirements: [petLine('REQ-1', 160)],
  })];
  const csv = buildOrderCsv({ kind: 'pending', today: TODAY, orders: rows, inventory: [] });
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /\r\n/);
  assert.equal(csv.includes('₹'), false);
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed[0], PENDING_ORDER_CSV_HEADERS);
  const record = table(csv)[0];
  assert.equal(record['Order No'], 'ORD-9');
  assert.equal(record['PO Ref'], 'PO-CUST-9');
  assert.equal(record['Order Date'], '28/10/2026');
  assert.equal(record.Customer, 'Sharma, Traders');
  assert.equal(record['Job Name'], 'Atta, "5kg"');
  assert.equal(record['Job No'], 'JOB-44');
  assert.equal(record.Structure, 'PET 12µ / LD 30µ');
  assert.equal(record.Size, '710 x 400 mm');
  assert.equal(record['Order Qty'], '200.5');
  assert.equal(record.Unit, 'kg');
  assert.equal(record['Delivery/Due Date'], '02/11/2026');
  assert.equal(record['Days Remaining'], '3');
  assert.equal(record.Priority, 'High');
  assert.equal(record['Current Status'], 'In Progress');
  assert.equal(record['Current Stage'], 'Pre-Production');
  assert.equal(record['Next Stage'], 'Printing');
  assert.equal(record['Stage Qty Produced (kg)'], '');
  assert.match(csv, /200\.5,/);
  assert.doesNotMatch(csv, /"200\.5"/);

  const overdue = buildOrderCsv({
    kind: 'overdue',
    today: TODAY,
    orders: [order({ id: 'LATE', targetDeliveryDate: '2026-10-28', deliveryDate: '2026-10-28', materialRequirements: [petLine('REQ-1', 160)] })],
  });
  assert.deepEqual(parseCsv(overdue)[0], OVERDUE_ORDER_CSV_HEADERS);
  assert.equal(table(overdue)[0]['Days Overdue'], '2');
  assert.equal(
    orderCsvFileName('pending', new Date('2026-10-30T20:30:00.000Z')),
    'Pending_Orders_2026-10-31.csv',
  );
  assert.equal(
    orderCsvFileName('overdue', new Date('2026-10-30T20:30:00.000Z')),
    'Overdue_Orders_2026-10-31.csv',
  );
});

test('stage progress, next stage, and printing blockers come from the existing helpers', () => {
  const printing = order({
    id: 'ORD-PRINT',
    orderQtyKg: 200,
    targetDeliveryDate: '2026-11-02',
    materialRequirements: [petLine('REQ-P', 160)],
  });
  const productionRecords = [{
    orderId: 'ORD-PRINT',
    qtyFirstPassL1: 50,
    stages: { printing: { status: 'In Production' } },
    materialsList: [{ filmType: 'PET', issueQtyKg: 40, netConsumedQtyKg: 35 }],
  }];
  assert.equal(getOrderStageInfo(printing, [], productionRecords).stage, 'Printing (Pass 1)');
  const [row] = buildOrderReportRows({
    kind: 'pending',
    today: TODAY,
    orders: [printing],
    productionRecords,
    blockerContext: {
      inventory: [],
      inventoryChecked: true,
      jobMasters: [],
      jobMastersChecked: true,
      cylinders: [],
      cylindersChecked: true,
    },
  });
  assert.equal(row['Current Stage'], 'Printing (Pass 1)');
  assert.equal(row['Stage Qty Produced (kg)'], 50);
  assert.equal(row['Stage Percent Complete'], 25);
  assert.equal(row['Next Stage'], 'Lamination');
  assert.equal(row['RM Issued Kg'], 35);
  assert.match(row.Blockers, /Raw material PO not released/);
  assert.match(row.Blockers, /Job Master missing/);
  assert.match(row.Blockers, /Cylinder missing/);
});

test('available stock drops archived, QC hold, and retired barcodes, then reserves earlier orders', () => {
  const earlier = order({
    id: 'ORD-EARLY',
    jobName: 'Early job',
    targetDeliveryDate: '2026-10-01',
    deliveryDate: '2026-10-01',
    orderQtyKg: 100,
    materialRequirements: [petLine('REQ-E', 80)],
  });
  const later = order({
    id: 'ORD-LATE',
    jobName: 'Later job',
    clientName: 'Later Client',
    targetDeliveryDate: '2026-10-05',
    deliveryDate: '2026-10-05',
    orderQtyKg: 100,
    materialRequirements: [
      petLine('REQ-L', 80),
      { id: 'REQ-LD', filmType: 'LD', micron: 30, widthMm: 710, qtyKg: 50, poIssued: false },
    ],
  });
  const inventory = [
    { id: 'INV-HOLD', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 500, status: 'QC Hold', location: 'QC Hold Store' },
    { id: 'INV-PET', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 999, status: 'In Stock', isActive: true },
    { id: 'INV-ARCH', filmType: 'LD', micron: 30, widthMm: 710, availableQtyKg: 400, status: 'In Stock', isActive: false },
  ];
  const rolls = [
    { itemId: 'INV-PET', rollType: 'RAW_MATERIAL', barcodeId: 'RM-OK', status: 'In Stock', qcStatus: 'Approved', availableWeightKg: 100 },
    { itemId: 'INV-PET', rollType: 'RAW_MATERIAL', barcodeId: 'RM-HOLD', status: 'QC Hold', qcStatus: 'QC Hold', availableWeightKg: 80 },
    { itemId: 'INV-PET', rollType: 'RAW_MATERIAL', barcodeId: 'RM-OFF', status: 'In Stock', qcStatus: 'Approved', availableWeightKg: 40 },
    { itemId: 'INV-PET', rollType: 'RAW_MATERIAL', barcodeId: 'RM-PEND', status: 'In Stock', qcStatus: 'Pending QC', availableWeightKg: 25 },
  ];
  const retiredBarcodes = [
    { barcode: 'RM-OFF', status: 'Written Off' },
    { barcode: 'RM-GONE', status: 'Deleted' },
  ];
  assert.equal(usableOnHandKg(inventory[1], rolls, retiredBarcodes), 100);
  assert.equal(usableOnHandKg(inventory[0], rolls, retiredBarcodes), 0);
  assert.equal(usableOnHandKg(inventory[2], rolls, retiredBarcodes), 0);

  const [row] = buildOrderReportRows({
    kind: 'overdue',
    today: TODAY,
    orders: [earlier, later],
    includeOrders: [later],
    inventory,
    inventoryRolls: rolls,
    retiredBarcodes,
  });
  assert.equal(row['Order No'], 'ORD-LATE');
  assert.equal(row['RM Status'], 'Partially Available');
  assert.equal(row['RM Required Kg'], 130);
  assert.equal(row['RM Shortfall Kg'], 110);
  assert.match(row['Short Materials'], /PET 12µ x 710mm \(60 kg\)/);
  assert.match(row['Short Materials'], /LD 30µ x 710mm \(50 kg\)/);
  assert.match(row['Raw Materials'], /PET 12µ x 710mm: required 80 kg, issued 0 kg, stock 100 kg, short 60 kg/);
  assert.match(row['Raw Materials'], /; LD 30µ x 710mm: required 50 kg, issued 0 kg, stock 0 kg, short 50 kg/);
  assert.equal(row['Raw Materials'].includes('₹'), false);
});

test('a store issue is used when the production record has no material line', () => {
  const open = order({
    id: 'ORD-ISSUE',
    orderQtyKg: 100,
    materialRequirements: [petLine('REQ-I', 80)],
    targetDeliveryDate: '2026-11-02',
  });
  const [row] = buildOrderReportRows({
    kind: 'pending',
    today: TODAY,
    orders: [open],
    inventory: [{ id: 'INV-PET', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 80, status: 'In Stock' }],
    storeIssues: [
      { orderId: 'ORD-ISSUE', filmType: 'PET', issueType: 'issue', qtyKg: 30 },
      { orderId: 'ORD-ISSUE', filmType: 'PET', issueType: 'return', qtyKg: 5 },
      { orderId: 'ORD-OTHER', filmType: 'PET', issueType: 'issue', qtyKg: 100 },
    ],
  });
  assert.equal(row['RM Issued Kg'], 25);
  assert.equal(row['RM Status'], 'In Stock');
  assert.equal(row['RM Shortfall Kg'], 0);
  assert.equal(row['Short Materials'], '');
});

test('search and status filters select the same orders as the order list, with no page cut', () => {
  const orders = [
    order({ id: 'OPEN', clientName: 'Sharma Traders', structure: 'PET / METPET' }),
    order({ id: 'OTHER', clientName: 'Other Mills', jobName: 'Rice bag', structure: 'BOPP' }),
    order({ id: 'DONE', status: 'Completed', clientName: 'Sharma Traders' }),
    order({ id: 'LATE', clientName: 'Sharma Traders', targetDeliveryDate: '2020-01-01', deliveryDate: '2020-01-01' }),
    order({ id: 'HOLD', status: 'On Hold', clientName: 'Sharma Traders', targetDeliveryDate: '2020-01-01' }),
  ];
  const searched = filterOrdersLikeManagement(orders, { searchTerm: 'sharma' });
  assert.deepEqual(searched.map((row) => row.id), ['OPEN', 'LATE', 'HOLD']);
  const delayed = filterOrdersLikeManagement(orders, { statusFilter: 'DELAYED' });
  assert.deepEqual(delayed.map((row) => row.id), ['LATE']);
  const completed = filterOrdersLikeManagement(orders, { statusFilter: 'COMPLETED' });
  assert.deepEqual(completed.map((row) => row.id), ['DONE']);
  const pending = buildOrderReportRows({
    kind: 'pending',
    today: TODAY,
    orders,
    includeOrders: searched,
  });
  assert.equal(pending.length, 3);
  assert.deepEqual(pending.map((row) => row['Order No']), ['OPEN', 'LATE', 'HOLD']);
});

test('the order screen downloads the filtered list and stays behind the orders permission', () => {
  const screen = fs.readFileSync(new URL('../src/components/OrderManagement.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(screen, /data-testid="download-order-csv"/);
  assert.match(screen, /data-testid="download-pending-orders-csv"/);
  assert.match(screen, /data-testid="download-overdue-orders-csv"/);
  assert.match(screen, /includeOrders: filteredOrders/);
  assert.match(screen, /filterOrdersLikeManagement\(orders,/);
  assert.doesNotMatch(screen, /includeOrders: ordersPagination/);
  assert.match(app, /activeTab === 'orders'/);
  assert.match(app, /isTabAllowed\('orders'\)/);
  assert.match(app, /<Lock /);
  assert.match(app, /\n  Lock,\n/);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Admin.orders, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Sales Manager'].orders, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Plant Manager'].orders, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Store Manager'].orders, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Purchase Manager'].orders, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Printing Operator'].orders, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Shop Floor Operator'].orders, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS['QC Chemist'].orders, false);
});
