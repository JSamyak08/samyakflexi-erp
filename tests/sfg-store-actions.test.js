import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHref, parseLocation } from '../src/utils/slugRouter.js';
import {
  packingListSavedSummary,
  packingListsAwaitingChallan,
  packingSavedStepStates,
  planHasAction,
  sfgOrderHeaderPlan,
  sfgProgressLabel,
  sfgStoreRowPlan
} from '../src/utils/sfgStoreActions.js';

const base = {
  canConsume: true,
  canDispatch: true,
  canRework: false,
  shipments: [],
  challans: []
};

function sfg(extra = {}) {
  return {
    id: 'sfg-1',
    sfgBatchCode: 'SFG-BC-ORD-2026-219-1',
    sfgType: 'Printed Rolls',
    category: 'Semi-Finished Goods (SFG)',
    rollType: 'SFG',
    status: 'In Stock (WIP)',
    totalNetKg: 120,
    availableKg: 120,
    consumedKg: 0,
    dispatchedKg: 0,
    orderId: 'ORD-2026-219',
    jobName: 'Masti Atta 5 Kg',
    ...extra
  };
}

function fg(extra = {}) {
  return {
    id: 'fg-1',
    sfgBatchCode: 'FG-BC-ORD2026219-1',
    sfgType: 'Finished Goods (FG)',
    category: 'Finished Goods (FG)',
    rollType: 'FG',
    status: 'Ready for Dispatch',
    totalNetKg: 374,
    availableKg: 374,
    consumedKg: 0,
    dispatchedKg: 0,
    orderId: 'ORD-2026-219',
    jobName: 'Masti Atta 5 Kg',
    ...extra
  };
}

function ids(plan) {
  return (plan.actions || []).map((action) => action.id);
}

test('semi-finished rows keep consume and never get dispatch actions', () => {
  const printed = sfgStoreRowPlan(sfg(), base);
  assert.deepEqual(ids(printed), ['consume']);
  assert.equal(printed.actions[0].enabled, true);
  assert.equal(printed.stage, 'wip');
  assert.equal(printed.progress, null);

  const namedLikeFinished = sfgStoreRowPlan(sfg({
    status: 'Ready for Dispatch',
    sfgType: 'Semi-Finished Goods (SFG)',
    category: 'Semi-Finished Goods (SFG)'
  }), base);
  assert.deepEqual(ids(namedLikeFinished), ['consume']);

  const empty = sfgStoreRowPlan(sfg({ availableKg: 0, status: 'Fully Consumed' }), base);
  assert.deepEqual(ids(empty), ['consume']);
  assert.equal(empty.actions[0].enabled, false);
});

test('a view-only operator gets no actions on SFG or FG', () => {
  const operator = { ...base, canConsume: false, canDispatch: false, canRework: false };
  assert.deepEqual(ids(sfgStoreRowPlan(sfg(), operator)), []);
  assert.deepEqual(ids(sfgStoreRowPlan(fg(), operator)), []);
});

test('ready finished goods offer Create Packing List and not a challan', () => {
  const plan = sfgStoreRowPlan(fg(), base);
  assert.equal(plan.stage, 'fg-ready');
  assert.deepEqual(ids(plan), ['create-packing-list']);
  assert.equal(planHasAction(plan, 'continue-dc'), false);
  assert.equal(planHasAction(plan, 'consume'), false);

  const noDispatch = sfgStoreRowPlan(fg(), { ...base, canDispatch: false });
  assert.deepEqual(ids(noDispatch), []);
});

test('admin rework is a secondary action and only before a packing list', () => {
  const admin = { ...base, canRework: true };
  const ready = sfgStoreRowPlan(fg(), admin);
  assert.deepEqual(ids(ready), ['create-packing-list', 'rework']);

  const manager = sfgStoreRowPlan(fg(), { ...base, canRework: false });
  assert.equal(planHasAction(manager, 'rework'), false);

  const packed = sfgStoreRowPlan(fg(), {
    ...admin,
    shipments: [{
      dispatchId: 'PL-2026-10',
      items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1', netWeightKg: 374 }]
    }]
  });
  assert.equal(planHasAction(packed, 'rework'), false);
  assert.equal(planHasAction(packed, 'create-packing-list'), false);
});

test('a roll on a packing list without a challan points at Generate DC', () => {
  const plan = sfgStoreRowPlan(fg(), {
    ...base,
    shipments: [{
      dispatchId: 'PL-2026-10',
      orderId: 'ORD-2026-219',
      items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1', barcodeId: 'FG-BC-ORD2026219-1', netWeightKg: 374 }]
    }]
  });
  assert.equal(plan.stage, 'fg-packed');
  assert.deepEqual(ids(plan), ['continue-dc']);
  assert.equal(sfgProgressLabel(plan), 'In Packing List PL-2026-10 · Next: Generate DC');
  assert.equal(plan.progress.packingListId, 'PL-2026-10');

  const hidden = sfgStoreRowPlan(fg(), {
    ...base,
    canDispatch: false,
    shipments: [{
      dispatchId: 'PL-2026-10',
      items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1' }]
    }]
  });
  assert.deepEqual(ids(hidden), []);
  assert.match(sfgProgressLabel(hidden), /PL-2026-10/);
});

test('a consumption barcode also counts as being on the packing list', () => {
  const plan = sfgStoreRowPlan(fg(), {
    ...base,
    shipments: [{
      dispatchId: 'PL-2026-11',
      dispatchConsumptions: [{ id: 'c1', barcode: 'FG-BC-ORD2026219-1', consumedKg: 10 }]
    }]
  });
  assert.equal(plan.stage, 'fg-packed');
  assert.equal(plan.progress.packingListId, 'PL-2026-11');
});

test('a linked delivery challan shows Dispatched and drops add actions', () => {
  const plan = sfgStoreRowPlan(fg({ status: 'Dispatched', availableKg: 0, dispatchedKg: 374 }), {
    ...base,
    canRework: true,
    shipments: [{
      dispatchId: 'PL-2026-12',
      items: [{ sourceFgId: 'fg-1', netWeightKg: 374 }]
    }],
    challans: [{
      id: 'DC-ROW-1',
      challanNo: 'DC-2026-44',
      linkedPackingListIds: ['PL-2026-12']
    }]
  });
  assert.equal(plan.stage, 'fg-dispatched');
  assert.deepEqual(ids(plan), []);
  assert.equal(sfgProgressLabel(plan), 'Dispatched DC-2026-44');
  assert.equal(plan.progress.challanId, 'DC-ROW-1');
});

test('a pending packing list wins over an older challan for the same roll', () => {
  const plan = sfgStoreRowPlan(fg(), {
    ...base,
    shipments: [
      { dispatchId: 'PL-OLD', items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1' }] },
      { dispatchId: 'PL-NEW', items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1' }] }
    ],
    challans: [{ id: 'dc-old', challanNo: 'DC-OLD', linkedPackingListIds: ['PL-OLD'] }]
  });
  assert.equal(plan.stage, 'fg-packed');
  assert.equal(plan.progress.packingListId, 'PL-NEW');
});

test('order header offers Create Packing List only when every roll is finished goods', () => {
  const mixed = sfgOrderHeaderPlan([sfg(), fg()], base);
  assert.equal(mixed.allFinishedGoods, false);
  assert.deepEqual(ids(mixed), []);
  assert.equal(mixed.step, null);

  const ready = sfgOrderHeaderPlan([fg(), fg({ id: 'fg-2', sfgBatchCode: 'FG-BC-2' })], base);
  assert.deepEqual(ids(ready), ['create-packing-list']);
  assert.equal(ready.step.number, 2);
  assert.equal(planHasAction(ready, 'continue-dc'), false);

  const operator = sfgOrderHeaderPlan([fg()], { ...base, canDispatch: false });
  assert.deepEqual(ids(operator), []);
  assert.equal(operator.allFinishedGoods, true);

  const packed = sfgOrderHeaderPlan([fg()], {
    ...base,
    shipments: [{ dispatchId: 'PL-2026-10', items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1' }] }]
  });
  assert.deepEqual(ids(packed), []);
  assert.equal(packed.step.number, 3);

  const done = sfgOrderHeaderPlan([fg({ status: 'Dispatched', availableKg: 0, dispatchedKg: 374 })], {
    ...base,
    shipments: [{ dispatchId: 'PL-2026-12', items: [{ sourceFgBarcode: 'FG-BC-ORD2026219-1' }] }],
    challans: [{ id: 'dc', challanNo: 'DC-1', items: [{ packingListId: 'PL-2026-12' }] }]
  });
  assert.equal(done.step.number, 4);
  assert.deepEqual(ids(done), []);
});

test('packing lists with no challan are counted, and the saved summary is the next-step card', () => {
  const waiting = packingListsAwaitingChallan([
    { dispatchId: 'PL-1', items: [] },
    { dispatchId: 'PL-2', items: [] },
    { id: 'PL-3', items: [] }
  ], [
    { linkedPackingListIds: ['PL-2'] },
    { items: [{ packingListId: 'PL-3' }] }
  ]);
  assert.deepEqual(waiting.map((row) => row.dispatchId || row.id), ['PL-1']);

  const steps = packingSavedStepStates();
  assert.deepEqual(steps.map((step) => [step.number, step.label, step.state]), [
    [1, 'Finished Goods', 'done'],
    [2, 'Packing List', 'done'],
    [3, 'Delivery Challan', 'current'],
    [4, 'Dispatched', 'upcoming']
  ]);

  const summary = packingListSavedSummary({
    dispatchId: 'PL-2026-20',
    totalNetWeightKg: 374,
    totalGrossWeightKg: 378.5,
    items: [{ netWeightKg: 374, grossWeightKg: 378.5 }]
  });
  assert.equal(summary.packingListId, 'PL-2026-20');
  assert.equal(summary.rollCount, 1);
  assert.equal(summary.netKg, 374);
  assert.equal(summary.grossKg, 378.5);
});

test('store deep links keep the job, order, roll, and packing list', () => {
  const packingHref = buildHref('dispatch', {
    section: 'packing-new',
    action: 'packing',
    orderId: 'ORD-2026-219',
    jobName: 'Masti Atta 5 Kg',
    code: 'FG-BC-ORD2026219-1'
  });
  const packing = parseLocation({
    pathname: packingHref.split('?')[0],
    search: packingHref.includes('?') ? packingHref.slice(packingHref.indexOf('?')) : ''
  });
  assert.equal(packing.tab, 'dispatch');
  assert.equal(packing.section, 'packing-new');
  assert.equal(packing.params.action, 'packing');
  assert.equal(packing.params.orderId, 'ORD-2026-219');
  assert.equal(packing.params.jobName, 'Masti Atta 5 Kg');
  assert.equal(packing.params.code, 'FG-BC-ORD2026219-1');

  const challanHref = buildHref('dispatch', {
    section: 'challan-new',
    action: 'challan',
    orderId: 'ORD-2026-219',
    jobName: 'Masti Atta 5 Kg',
    code: 'PL-2026-10'
  });
  const challan = parseLocation({
    pathname: challanHref.split('?')[0],
    search: challanHref.slice(challanHref.indexOf('?'))
  });
  assert.equal(challan.section, 'challan-new');
  assert.equal(challan.params.action, 'challan');
  assert.equal(challan.params.code, 'PL-2026-10');
  assert.equal(challan.params.orderId, 'ORD-2026-219');
});

test('the packing-list success dialog ignores a backdrop click and closes on Escape or Close', async () => {
  const { Window } = await import('happy-dom');
  const win = new Window({ url: 'http://localhost/dispatch' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node
  };
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Node = win.Node;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createServer } = await import('vite');
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true }
  });
  try {
    const mod = await server.ssrLoadModule('/src/components/PackingListSavedDialog.jsx');
    const Dialog = mod.default;
    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    const root = createRoot(host);
    let closed = 0;
    let generated = 0;
    const shipment = {
      dispatchId: 'PL-2026-20',
      totalNetWeightKg: 40,
      totalGrossWeightKg: 44.5,
      items: [{ netWeightKg: 40, grossWeightKg: 44.5 }]
    };

    await act(async () => {
      root.render(React.createElement(Dialog, {
        shipment,
        onClose: () => { closed += 1; },
        onGenerateDc: () => { generated += 1; }
      }));
    });

    const text = host.textContent;
    assert.match(text, /PL-2026-20/);
    assert.match(text, /40\.00 kg/);
    assert.match(text, /44\.50 kg/);
    assert.match(text, /Finished Goods/);
    assert.match(text, /Delivery Challan/);
    assert.equal(host.querySelector('[data-step="challan"]').getAttribute('data-state'), 'current');

    await act(async () => {
      host.querySelector('[data-testid="packing-saved-backdrop"]').click();
    });
    assert.equal(closed, 0);
    assert.equal(host.querySelector('[data-testid="packing-saved-dialog"]') != null, true);

    await act(async () => {
      win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(closed, 1);

    await act(async () => {
      host.querySelector('[data-testid="packing-saved-close"]').click();
    });
    assert.equal(closed, 2);

    await act(async () => {
      host.querySelector('[data-testid="packing-saved-later"]').click();
    });
    assert.equal(closed, 3);

    await act(async () => {
      host.querySelector('[data-testid="packing-saved-generate-dc"]').click();
    });
    assert.equal(generated, 1);
    assert.equal(closed, 3);

    await act(async () => { root.unmount(); });
  } finally {
    await server.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
  }
});
