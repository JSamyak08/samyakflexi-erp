import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

await register(new URL('../scripts/resolve-js-hook.mjs', import.meta.url));

const {
  BARCODE_SOURCE,
  PRINT_STATUS,
  collectBarcodes,
  filterBarcodeRows,
  mergeBarcodeRows,
  sourceModuleForCode,
  stickerPrintLogs,
  withPrintStatus,
} = await import('../src/utils/barcodeRegistry.js');
const {
  BARCODE_REGISTRY_ROLES,
  SYSTEM_ROLES,
  applyBarcodePermissionDefaults,
  generateFullRolePermissions,
} = await import('../src/factoryStore.js');
const { roleHasModule, roleNeedsAny, cachesToDrop, BOOT_NEEDS } = await import('../src/bootAccess.js');

const sample = {
  inventoryRolls: [
    {
      barcodeId: 'RM-BC-GRN-1-L2-R1',
      itemName: 'PET 12µ',
      grnNo: 'SIL/GRN/26-27/1',
      status: 'In Stock',
      locationBay: 'Bay A',
      inwardDatetime: '2026-10-20T08:00:00.000Z',
      inputBarcodeIds: ['RM-BC-PARENT'],
    },
    {
      barcodeId: 'SFG-BC-ORD-1-R02',
      rollType: 'SFG',
      itemName: 'Printed child',
      orderId: 'ORD-1',
      parentSfgBatchCode: 'SFG-BC-ORD-1',
      status: 'In Stock',
      locationBay: 'Bay B',
    },
  ],
  sfgGoods: [
    {
      sfgBatchCode: 'SFG-BC-ORD-1',
      jobName: 'Atta pouch',
      orderId: 'ORD-1',
      status: 'In Stock (WIP)',
      storageBay: 'Bay B',
      createdAt: '2026-10-21T09:00:00.000Z',
    },
    {
      sfgBatchCode: 'FG-BC-ORD-1',
      sfgType: 'Finished Goods (FG)',
      jobName: 'Atta pouch',
      orderId: 'ORD-1',
      status: 'Ready for Dispatch',
      storageBay: 'FG Warehouse',
    },
  ],
  grns: [
    {
      id: 'GRN-1',
      grnNo: 'SIL/GRN/26-27/1',
      itemName: 'PET 12µ',
      lineItems: [{ rolls: [{ barcodeId: 'CON-BC-GRN-1-1', itemName: 'Solvent' }] }],
    },
  ],
  dispatchShipments: [
    {
      dispatchId: 'PL-1',
      orderId: 'ORD-1',
      jobName: 'Atta pouch',
      items: [{ barcodeId: 'FG-DISP-100001-1', jobName: 'Atta pouch', netWeightKg: 20 }],
    },
  ],
  deliveryChallans: [
    { challanNo: 'DC-1', items: [{ barcodeId: 'FG-DISP-100001-1', description: 'Reel' }] },
  ],
  productionRecords: [
    {
      id: 'REC-1',
      orderId: 'ORD-1',
      jobName: 'Atta pouch',
      materialsList: [{ barcode: 'RM-BC-GRN-1-L2-R1', itemName: 'PET 12µ' }],
      sfgConsumptions: [{ substrate2: { barcode: 'RM-SUB2-1', filmType: 'METPET' } }],
    },
  ],
  inventory: [
    { id: '11111111-1111-1111-1111-111111111111', itemName: 'Core', barcode: '' },
    { id: 'INV-1', itemName: 'Ink drum', barcode: 'CON-BC-INK-1', location: 'Ink room' },
  ],
  cylinders: [
    { id: 'CYL-2026-001', sku: 'SKU-CYL-001', jobName: 'Atta pouch', status: 'Active', assignedPress: 'Press 1' },
  ],
  customBarcodes: [{ id: 'TX-1', barcode: 'BAR-TX-1' }],
  stockAdjustments: [{ id: 'ADJ-1', itemName: 'PET 12µ', barcode: 'ADJ-1000', type: 'Add' }],
  qcHoldItems: [{ barcodeId: 'QCHOLD-100001', jobName: 'Atta pouch', status: 'QC Hold' }],
  scrapItems: [{ holdTagId: 'QCHOLD-100001', id: 'SCRAP-1' }],
  pelletInwards: [{ id: 'PEL-1', grnNo: 'SIL/GRN/26-27/9', barcode: 'should-not-list' }],
};

test('collects every stored barcode and keeps each module', () => {
  const rows = collectBarcodes(sample);
  const codes = rows.map((row) => `${row.sourceModule}|${row.barcode}`);

  assert.ok(codes.includes(`${BARCODE_SOURCE.rm}|RM-BC-GRN-1-L2-R1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.rm}|CON-BC-GRN-1-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.rm}|RM-BC-PARENT`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.child}|SFG-BC-ORD-1-R02`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.sfg}|SFG-BC-ORD-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.fg}|FG-BC-ORD-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.dispatch}|FG-DISP-100001-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.production}|RM-SUB2-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.production}|RM-BC-GRN-1-L2-R1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.inventory}|CON-BC-INK-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.cylinders}|SKU-CYL-001`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.cylinders}|CYL-2026-001`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.print}|BAR-TX-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.adjust}|ADJ-1000`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.hold}|QCHOLD-100001`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.scrap}|QCHOLD-100001`));
  assert.equal(codes.some((code) => code.endsWith('|should-not-list')), false);
  assert.equal(codes.some((code) => code.includes('11111111-1111')), false);

  const grnRoll = rows.find((row) => row.barcode === 'RM-BC-GRN-1-L2-R1' && row.sourceModule === BARCODE_SOURCE.rm);
  assert.equal(grnRoll.referenceNo, 'SIL/GRN/26-27/1');
  assert.equal(grnRoll.location, 'Bay A');
  assert.equal(sourceModuleForCode('RM-BC-GRN-1-L2-R1'), BARCODE_SOURCE.rm);
  assert.equal(sourceModuleForCode('SFG-BC-ORD-1-R02'), BARCODE_SOURCE.child);
});

test('search and module filter narrow the barcode column', () => {
  const rows = collectBarcodes(sample);
  const byModule = filterBarcodeRows(rows, { sourceModule: BARCODE_SOURCE.dispatch });
  assert.deepEqual(byModule.map((row) => row.barcode), ['FG-DISP-100001-1']);

  const byQuery = filterBarcodeRows(rows, { query: 'atta' });
  assert.ok(byQuery.length > 0);
  assert.ok(byQuery.every((row) => `${row.description} ${row.referenceNo}`.toLowerCase().includes('atta') || row.barcode.toLowerCase().includes('atta')));

  const merged = mergeBarcodeRows(
    [{ barcode: 'RM-BC-1', sourceModule: BARCODE_SOURCE.rm, description: 'From view' }],
    [{ barcode: 'RM-BC-1', sourceModule: BARCODE_SOURCE.rm, description: 'From client' }, { barcode: 'SFG-BC-9', sourceModule: BARCODE_SOURCE.sfg }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((row) => row.barcode === 'RM-BC-1').description, 'From view');
});

test('barcodes permission follows inventory roles and leaves the other keys alone', () => {
  const defaults = generateFullRolePermissions(false);
  SYSTEM_ROLES.forEach((role) => {
    const expected = BARCODE_REGISTRY_ROLES.includes(role);
    assert.equal(defaults[role].barcodes, expected, role);
    assert.equal(roleHasModule(defaults, role, 'barcodes'), role === 'Admin' || expected, role);
  });
  assert.equal(defaults['Sales Manager'].dispatch, true);
  assert.equal(defaults['Sales Manager'].barcodes, false);
  assert.equal(defaults['Printing Operator'].barcodes, false);
  assert.equal(defaults['Shop Floor Operator'].barcodes, false);
  assert.equal(defaults['Store Manager'].inventory, true);
  assert.equal(defaults['Store Manager'].barcodes, true);
  assert.equal(defaults['HR & Payroll Manager'].barcodes, true);
  assert.equal(defaults['Production Manager'].audit_logs, false);

  const stored = {
    'Store Manager': { inventory: true, barcodes: false, dispatch: true },
    'Sales Manager': { sales: true, pellet_fuel: false },
  };
  const filled = applyBarcodePermissionDefaults(stored);
  assert.equal(filled['Store Manager'].barcodes, false);
  assert.equal(filled['Store Manager'].inventory, true);
  assert.equal(filled['Store Manager'].dispatch, true);
  assert.equal(filled['Sales Manager'].barcodes, false);
  assert.equal(filled['Sales Manager'].sales, true);
  assert.equal(filled['Sales Manager'].pellet_fuel, false);
  assert.equal(Object.keys(filled).includes('Admin'), false);

  assert.equal(roleNeedsAny(defaults, 'Sales Manager', BOOT_NEEDS.barcodes), false);
  assert.equal(roleNeedsAny(defaults, 'Store Manager', BOOT_NEEDS.barcodes), true);
  assert.ok(cachesToDrop(defaults, 'Sales Manager').includes('samyak_cache_barcode_registry'));
  assert.equal(cachesToDrop(defaults, 'Store Manager').includes('samyak_cache_barcode_registry'), false);
  assert.equal(roleHasModule({ 'Store Manager': { barcodes: 'true' } }, 'Store Manager', 'barcodes'), false);
});

test('print status is Printed only for a confirmed printer job', () => {
  const rows = [
    { barcode: 'RM-BC-1', sourceModule: BARCODE_SOURCE.rm, status: 'In Stock' },
    { barcode: 'FG-BC-2', sourceModule: BARCODE_SOURCE.fg, status: 'Ready' },
  ];
  const untouched = withPrintStatus(rows, []);
  assert.equal(untouched[0].printStatus, PRINT_STATUS.notPrinted);
  assert.equal(untouched[0].status, 'In Stock');
  assert.equal(untouched[1].printStatus, PRINT_STATUS.notPrinted);

  const ignored = withPrintStatus(rows, [
    { barcode: 'RM-BC-1', job_status: 'cancelled', job_id: 'job-cancel', printer: 'Zebra', printed_at: '2026-10-24T01:00:00Z' },
    { barcode: 'RM-BC-1', job_status: 'failed', job_id: 'job-fail', printer: 'Zebra', printed_at: '2026-10-24T02:00:00Z' },
    { barcode: 'rm-bc-1', job_status: 'afterprint', job_id: 'job-dialog', printer: 'Browser', printed_at: '2026-10-24T03:00:00Z' },
  ]);
  assert.equal(ignored[0].printStatus, PRINT_STATUS.notPrinted);

  const printed = withPrintStatus(rows, [
    { barcode: 'rm-bc-1', job_status: 'printed', job_id: 'job-old', printer: 'Zebra-1', printed_at: '2026-10-24T01:00:00Z', printed_by: 'A' },
    { barcode: 'RM-BC-1', job_status: 'success', job_id: 'job-new', printer: 'Zebra-2', printed_at: '2026-10-24T04:00:00Z', printed_by: 'Store Clerk' },
    { barcode: 'RM-BC-1', job_status: 'cancelled', job_id: 'job-later-cancel', printer: 'Zebra-2', printed_at: '2026-10-24T05:00:00Z' },
  ]);
  assert.equal(printed[0].printStatus, PRINT_STATUS.printed);
  assert.equal(printed[0].printJobId, 'job-new');
  assert.equal(printed[0].printer, 'Zebra-2');
  assert.equal(printed[0].printedBy, 'Store Clerk');
  assert.equal(printed[1].printStatus, PRINT_STATUS.notPrinted);
});

test('a sticker print flow records Printed, and stored barcodes without a log stay Not printed', () => {
  const logs = stickerPrintLogs([
    { barcodeId: 'RM-BC-1', sourceModule: BARCODE_SOURCE.rm },
    { id: '', barcode: '  ' },
    { barcodeId: 'FG-BC-2', sourceModule: BARCODE_SOURCE.fg },
  ], {
    printedBy: 'Store Clerk',
    printedAt: '2026-10-24T06:00:00.000Z',
    jobIds: ['browser-1', 'browser-2', 'browser-3'],
  });
  assert.equal(logs.length, 2);
  assert.equal(logs[0].printer, 'browser');
  assert.equal(logs[0].jobStatus, 'printed');
  assert.equal(logs[0].jobId, 'browser-1');
  assert.equal(logs[0].printedBy, 'Store Clerk');
  assert.equal(logs[1].jobId, 'browser-3');

  const rows = withPrintStatus([
    { barcode: 'RM-BC-1', sourceModule: BARCODE_SOURCE.rm },
    { barcode: 'BAR-TX-1', sourceModule: BARCODE_SOURCE.print },
  ], logs);
  assert.equal(rows[0].printStatus, PRINT_STATUS.printed);
  assert.equal(rows[0].printer, 'browser');
  assert.equal(rows[1].printStatus, PRINT_STATUS.notPrinted);
});
