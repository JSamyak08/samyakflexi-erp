import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isActiveOrderForRequirement,
  requirementAgainstOrders
} from '../src/utils/orderRequirementAgainstStock.js';

const pet = {
  id: 'INVT-0010',
  itemCode: 'INVT-0010',
  filmType: 'PET',
  itemName: 'PET-650-12',
  micron: 12,
  widthMm: 650,
  unit: 'Kg'
};

function order(id, status, qtyKg, extra = {}) {
  return {
    id,
    jobName: extra.jobName || `Job ${id}`,
    status,
    orderQtyKg: 0,
    materialRequirements: [{
      id: `REQ-${id}-1`,
      filmType: 'PET',
      micron: 12,
      widthMm: 650,
      qtyKg,
      ...extra.req
    }],
    ...extra.order
  };
}

function summary(overrides = {}) {
  return requirementAgainstOrders({
    item: pet,
    orders: overrides.orders || [],
    productionRecords: overrides.productionRecords || [],
    storeIssues: overrides.storeIssues || [],
    rollLedgerEntries: overrides.rollLedgerEntries || [],
    jobMasters: [],
    sfgGoods: overrides.sfgGoods || []
  });
}

test('an active order with nothing consumed contributes its full requirement', () => {
  const result = summary({
    orders: [order('ORD-2026-10', 'Scheduled', 248.42)]
  });
  assert.equal(result.totalKg, 248.42);
  assert.deepEqual(result.rows.map((row) => [row.orderId, row.unconsumedKg]), [
    ['ORD-2026-10', 248.42]
  ]);
  assert.equal(result.activeOrderRule, 'orderIsClosedOrCancelled');
});

test('partial consumption stays in the sum and a fully consumed order drops out', () => {
  const result = summary({
    orders: [
      order('ORD-2026-11', 'In Production', 100),
      order('ORD-2026-12', 'Scheduled', 80),
      order('ORD-2026-13', 'On Hold', 25)
    ],
    productionRecords: [
      {
        id: 'REC-11',
        orderId: 'ORD-2026-11',
        materialsList: [{ stockItemId: 'INVT-0010', filmType: 'PET', micron: 12, widthMm: 650, netConsumedQtyKg: 40 }]
      },
      {
        id: 'REC-12',
        orderId: 'ORD-2026-12',
        materialsList: [{ stockItemId: 'INVT-0010', filmType: 'PET', micron: 12, widthMm: 650, issueQtyKg: 80 }]
      }
    ]
  });
  assert.deepEqual(result.rows.map((row) => [row.orderId, row.unconsumedKg]), [
    ['ORD-2026-11', 60],
    ['ORD-2026-13', 25]
  ]);
  assert.equal(result.totalKg, 85);
});

test('consumption above the requirement does not leave a negative row', () => {
  const result = summary({
    orders: [order('ORD-2026-14', 'Scheduled', 30)],
    productionRecords: [{
      id: 'REC-14',
      orderId: 'ORD-2026-14',
      materialsList: [{ stockItemId: 'INVT-0010', netConsumedQtyKg: 45 }]
    }]
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.totalKg, 0);
});

test('completed, cancelled, closed, dispatched, and delivered orders are not active', () => {
  for (const status of ['Completed', 'Cancelled', 'Canceled', 'Closed', 'Dispatched', 'Delivered']) {
    assert.equal(isActiveOrderForRequirement(order('ORD-X', status, 10)), false, status);
    const result = summary({ orders: [order('ORD-X', status, 10)] });
    assert.equal(result.totalKg, 0, status);
  }
  assert.equal(isActiveOrderForRequirement(order('ORD-Y', 'On Hold', 10)), true);
  assert.equal(isActiveOrderForRequirement(order('ORD-Z', 'Scheduled', 10)), true);
});

test('another film and another width are not included', () => {
  const result = summary({
    orders: [{
      id: 'ORD-2026-15',
      status: 'Scheduled',
      orderQtyKg: 0,
      materialRequirements: [
        { id: 'a', filmType: 'PET', micron: 12, widthMm: 650, qtyKg: 20 },
        { id: 'b', filmType: 'PET', micron: 12, widthMm: 500, qtyKg: 90 },
        { id: 'c', filmType: 'METPET', micron: 12, widthMm: 650, qtyKg: 40 },
        { id: 'd', filmType: 'LD', micron: 35, widthMm: 650, qtyKg: 15 }
      ]
    }]
  });
  assert.equal(result.totalKg, 20);
  assert.equal(result.rows[0].orderId, 'ORD-2026-15');
});

test('two lines of the same item on one order are one row', () => {
  const result = summary({
    orders: [{
      id: 'ORD-2026-16',
      status: 'Scheduled',
      orderQtyKg: 0,
      materialRequirements: [
        { id: 'a', filmType: 'PET', micron: 12, widthMm: 650, qtyKg: 30 },
        { id: 'b', filmType: 'PET', micron: 12, widthMm: 650, qtyKg: 12.5 }
      ]
    }],
    productionRecords: [{
      id: 'REC-16',
      orderId: 'ORD-2026-16',
      materialsList: [{ stockItemId: 'INVT-0010', filmType: 'PET', micron: 12, widthMm: 650, netConsumedQtyKg: 10 }]
    }]
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].requiredKg, 42.5);
  assert.equal(result.rows[0].consumedKg, 10);
  assert.equal(result.rows[0].unconsumedKg, 32.5);
  assert.equal(result.totalKg, 32.5);
});

test('a posted roll issue is the consumed quantity and is not added again from the production line', () => {
  const result = summary({
    orders: [order('ORD-2026-17', 'In Production', 200)],
    rollLedgerEntries: [{
      entryKind: 'issue',
      barcode: 'RM-100',
      qtyKg: 80,
      consumedKg: 47.5,
      orderId: 'ORD-2026-17',
      stockItemId: 'INVT-0010'
    }],
    productionRecords: [{
      id: 'REC-17',
      orderId: 'ORD-2026-17',
      materialsList: [
        { barcode: 'RM-100', stockItemId: 'INVT-0010', filmType: 'PET', micron: 12, widthMm: 650, netConsumedQtyKg: 47.5 },
        { stockItemId: 'INVT-0010', filmType: 'PET', micron: 12, widthMm: 650, netConsumedQtyKg: 47.5 }
      ]
    }]
  });
  assert.equal(result.rows[0].consumedKg, 47.5);
  assert.equal(result.rows[0].unconsumedKg, 152.5);
});

test('a balance-roll receipt is not consumption, and a different barcode on the production record still counts', () => {
  const result = summary({
    orders: [order('ORD-2026-18', 'Scheduled', 100)],
    rollLedgerEntries: [
      {
        entryKind: 'issue',
        barcode: 'RM-200',
        qtyKg: 60,
        consumedKg: 20,
        orderId: 'ORD-2026-18',
        stockItemId: 'INVT-0010'
      },
      {
        entryKind: 'balance_receipt',
        barcode: 'RM-200-BAL',
        qtyKg: 40,
        orderId: 'ORD-2026-18',
        stockItemId: 'INVT-0010'
      }
    ],
    productionRecords: [{
      id: 'REC-18',
      orderId: 'ORD-2026-18',
      materialsList: [{ barcode: 'RM-201', stockItemId: 'INVT-0010', netConsumedQtyKg: 15 }]
    }]
  });
  assert.equal(result.rows[0].consumedKg, 35);
  assert.equal(result.rows[0].unconsumedKg, 65);
});

test('store issues count only when the order has no posted consumption, and a return reduces them', () => {
  const open = summary({
    orders: [order('ORD-2026-19', 'Scheduled', 50, { jobName: 'Mango Shots' })],
    storeIssues: [
      { itemId: 'INVT-0010', jobName: 'Mango Shots', issueType: 'issue', qtyKg: 18 },
      { itemId: 'INVT-0010', jobName: 'Mango Shots', issueType: 'return', qtyKg: 3 },
      { itemId: 'INVT-0099', jobName: 'Mango Shots', issueType: 'issue', qtyKg: 100 }
    ]
  });
  assert.equal(open.rows[0].consumedKg, 15);
  assert.equal(open.rows[0].unconsumedKg, 35);

  const posted = summary({
    orders: [order('ORD-2026-19', 'Scheduled', 50, { jobName: 'Mango Shots' })],
    productionRecords: [{
      id: 'REC-19',
      orderId: 'ORD-2026-19',
      materialsList: [{ stockItemId: 'INVT-0010', netConsumedQtyKg: 10 }]
    }],
    storeIssues: [
      { itemId: 'INVT-0010', jobName: 'Mango Shots', issueType: 'issue', qtyKg: 18 }
    ]
  });
  assert.equal(posted.rows[0].consumedKg, 10);
  assert.equal(posted.rows[0].unconsumedKg, 40);
});

test('a different order that shares a job code does not consume this order', () => {
  const result = summary({
    orders: [
      order('ORD-QA95-PRINT', 'In Production', 18.16, { order: { jobCode: 'JM-QA95', jobName: 'QA95 Meter Print Job' } }),
      order('ORD-VIEW-PRINT', 'In Production', 9.08, { order: { jobCode: 'JM-QA95', jobName: 'View Ledger Print Job' } })
    ],
    productionRecords: [{
      id: 'REC-ORD-VIEW-PRINT',
      orderId: 'ORD-VIEW-PRINT',
      jobCode: 'JM-QA95',
      jobName: 'View Ledger Print Job',
      materialsList: [{ stockItemId: 'INVT-0010', barcode: 'RM-QA95-A1-BAL', netConsumedQtyKg: 8.4 }]
    }]
  });
  const print = result.rows.find((row) => row.orderId === 'ORD-QA95-PRINT');
  const view = result.rows.find((row) => row.orderId === 'ORD-VIEW-PRINT');
  assert.equal(print.consumedKg, 0);
  assert.equal(print.unconsumedKg, 18.16);
  assert.equal(view.consumedKg, 8.4);
  assert.equal(view.unconsumedKg, 0.68);
});

test('consumption posted against another stock item stays on that item', () => {
  const result = summary({
    orders: [order('ORD-2026-30', 'Scheduled', 40)],
    productionRecords: [{
      id: 'REC-30',
      orderId: 'ORD-2026-30',
      materialsList: [{ stockItemId: 'INVT-OTHER', filmType: 'PET', micron: 12, widthMm: 650, netConsumedQtyKg: 40 }]
    }],
    rollLedgerEntries: [{
      entryKind: 'issue',
      orderId: 'ORD-2026-30',
      stockItemId: 'INVT-OTHER',
      barcode: 'RM-OTHER',
      qtyKg: 40,
      consumedKg: 40,
      filmType: 'PET',
      micron: 12,
      widthMm: 650
    }]
  });
  assert.equal(result.rows[0].consumedKg, 0);
  assert.equal(result.rows[0].unconsumedKg, 40);
});

test('a saved printed SFG allocation reduces the raw requirement before consumption', () => {
  const result = requirementAgainstOrders({
    item: pet,
    orders: [{
      id: 'ORD-2026-20',
      status: 'Scheduled',
      orderQtyKg: 0,
      jobName: 'Reuse',
      printedSfgUse: { mode: 'part', allocatedKg: 30, printLineId: 'REQ-print', baseQtyKg: 100 },
      materialRequirements: [{ id: 'REQ-print', filmType: 'PET', micron: 12, widthMm: 650, qtyKg: 100 }]
    }]
  });
  assert.equal(result.rows[0].requiredKg, 70);
  assert.equal(result.totalKg, 70);
});

test('the popup lists each open order, its unconsumed quantity, and the same total', async () => {
  const result = summary({
    orders: [
      order('ORD-2026-21', 'Scheduled', 40, { jobName: 'Alpha' }),
      order('ORD-2026-22', 'In Production', 15, { jobName: 'Beta' })
    ],
    productionRecords: [{
      id: 'REC-22',
      orderId: 'ORD-2026-22',
      materialsList: [{ stockItemId: 'INVT-0010', filmType: 'PET', micron: 12, widthMm: 650, netConsumedQtyKg: 5 }]
    }]
  });
  assert.equal(result.totalKg, 50);
  assert.equal(result.rows.reduce((sum, row) => sum + row.unconsumedKg, 0), result.totalKg);

  const React = (await import('react')).default;
  const { createServer } = await import('vite');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true }
  });
  try {
    const mod = await server.ssrLoadModule('/src/components/RequirementAgainstOrdersDialog.jsx');
    const html = renderToStaticMarkup(React.createElement(mod.default, {
      itemLabel: 'PET-650-12',
      itemCode: 'INVT-0010',
      unit: 'Kg',
      summary: result,
      onClose: () => {}
    }));
    assert.match(html, /Requirement Against Orders/);
    assert.match(html, /data-order-id="ORD-2026-21"/);
    assert.match(html, /data-requirement-kg="40"/);
    assert.match(html, /data-order-id="ORD-2026-22"/);
    assert.match(html, /data-requirement-kg="10"/);
    assert.match(html, /data-total-kg="50"/);
    assert.match(html, />Total</);
    assert.match(html, />Close</);
    assert.match(html, /data-testid="requirement-against-orders-dialog"/);
    assert.doesNotMatch(html, /RES-/);
    assert.doesNotMatch(html, /Reserved/);
  } finally {
    await server.close();
  }
});

test('backdrop click does not close the popup, and Close or Escape does', async () => {
  const React = (await import('react')).default;
  const { createServer } = await import('vite');
  const { Window } = await import('happy-dom');
  const win = new Window();
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent
  };
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Node = win.Node;
  globalThis.Event = win.Event;
  globalThis.MouseEvent = win.MouseEvent;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true }
  });
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const { installModalDismissGuard } = await import('../src/utils/modalDismiss.js');
  installModalDismissGuard(win.document);

  let closes = 0;
  const host = win.document.createElement('div');
  win.document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const mod = await server.ssrLoadModule('/src/components/RequirementAgainstOrdersDialog.jsx');
    await act(async () => {
      root.render(React.createElement(mod.default, {
        itemLabel: 'PET-650-12',
        unit: 'Kg',
        summary: summary({ orders: [order('ORD-2026-23', 'Scheduled', 12)] }),
        onClose: () => { closes += 1; }
      }));
    });
    const dialog = win.document.querySelector('[data-testid="requirement-against-orders-dialog"]');
    dialog.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    dialog.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    dialog.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(closes, 0);
    assert.equal(dialog.querySelector('[data-order-id="ORD-2026-23"]').textContent, 'ORD-2026-23');
    assert.equal(dialog.querySelector('[data-requirement-kg]').getAttribute('data-requirement-kg'), '12');
    assert.equal(dialog.querySelector('[data-total-kg]').getAttribute('data-total-kg'), '12');

    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(closes, 1);

    dialog.querySelector('[data-testid="requirement-against-orders-close"]').click();
    assert.equal(closes, 2);
  } finally {
    await act(async () => { root.unmount(); });
    await server.close();
    Object.assign(globalThis, previous);
  }
});

test('stock views no longer hold usable stock against orders or mint RES barcodes', () => {
  const inventory = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  const orders = fs.readFileSync(new URL('../src/components/OrderManagement.jsx', import.meta.url), 'utf8');
  assert.match(inventory, /Requirement Against Orders/);
  assert.match(inventory, /requirementAgainstOrders/);
  assert.doesNotMatch(inventory, /Reserved for Active Orders/);
  assert.doesNotMatch(inventory, /Order Reservations/);
  assert.doesNotMatch(inventory, /category === 'reservation'/);
  assert.doesNotMatch(inventory, /usableFreeStock/);
  assert.doesNotMatch(inventory, /allocatedForOrders/);
  assert.doesNotMatch(inventory, /RES-\$\{/);
  assert.doesNotMatch(inventory, /calculateOrderStockReservations/);
  assert.doesNotMatch(orders, /Reserved for Order/);
  assert.doesNotMatch(orders, /Fully Reserved/);
  assert.doesNotMatch(orders, /In-Stock & Reserved/);
});
