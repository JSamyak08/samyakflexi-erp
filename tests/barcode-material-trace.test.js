import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EMPTY_TRACE_MESSAGE,
  exactGrnMatch,
  readablePlantDate,
  resolveBarcodeMaterials,
  shipmentDispatchDate,
  shipmentLr,
  shipmentVehicle
} from '../src/utils/barcodeMaterialTrace.js';

const PET_GRN = {
  id: 'SIL/GRN/26-27/204',
  grnNo: 'SIL/GRN/26-27/204',
  itemName: 'PET 12µ',
  vendorName: 'Aster Polyfilms',
  invoiceNo: 'A26-27/1228',
  batchNo: 'A26-27/1228',
  receivedDate: '2026-11-12',
  received_date: '2026-11-12',
  qcStatus: 'Approved',
  category: 'Film Substrates'
};

const MGP_GRN = {
  id: 'SIL/GRN/26-27/301',
  grnNo: 'SIL/GRN/26-27/301',
  itemName: 'MGP 30µ',
  vendorName: 'Metro Films',
  invoiceNo: 'INV-MGP-9',
  batchNo: 'LOT-MGP-9',
  receivedDate: '2026-11-02',
  received_date: '2026-11-02',
  qcStatus: 'Approved',
  category: 'Film Substrates'
};

const OTHER_GRN = {
  id: 'SIL/GRN/26-27/105',
  grnNo: 'SIL/GRN/26-27/105',
  itemName: 'PET-800-12',
  vendorName: 'General Vendor',
  invoiceNo: 'QA-INV2-24893',
  batchNo: 'QA-BATCH-2',
  receivedDate: '2026-10-21',
  received_date: '2026-10-21',
  qcStatus: 'Approved',
  category: 'Film Substrates'
};

function grnNos(result) {
  return result.materialsUsed.map((row) => row.grnNo);
}

test('a readable date is not a raw ISO timestamp', () => {
  const formatted = readablePlantDate('2026-11-13T07:24:08.890Z');
  assert.equal(formatted.includes('T07:24'), false);
  assert.match(formatted, /2026/);
  assert.equal(readablePlantDate('22 Oct 2026, 01:52:08 am'), '22 Oct 2026, 01:52:08 am');
  assert.equal(readablePlantDate(''), '');
  assert.equal(shipmentDispatchDate({ dispatchDate: '2026-11-13T17:31:10.714Z' }).includes('T17:31'), false);
  assert.equal(shipmentVehicle({ vehicle_no: 'MH12QA1234' }), 'MH12QA1234');
  assert.equal(shipmentVehicle({ vehicleNo: 'QA-SM-01' }), 'QA-SM-01');
  assert.equal(shipmentLr({}), '');
  assert.equal(shipmentLr({ lr_no: 'LR-55' }), 'LR-55');
});

test('GRN lookup is by id or number, never by material name', () => {
  assert.equal(exactGrnMatch([PET_GRN, MGP_GRN], 'SIL/GRN/26-27/301')?.id, MGP_GRN.id);
  assert.equal(exactGrnMatch([PET_GRN, MGP_GRN], 'PET 12µ'), null);
  assert.equal(exactGrnMatch([PET_GRN], 'SIL/GRN/26-27/20'), null);
});

test('an FG with no consumption does not borrow the first GRNs or a planned structure', () => {
  const result = resolveBarcodeMaterials({
    barcode: 'FG-QA-PR',
    dispatchItem: {
      barcodeId: 'FG-QA-PR',
      jobName: 'QA Pack Roll Fail',
      orderId: 'QA-PW-PR',
      rollType: 'FG_DISPATCH'
    },
    shipment: { jobName: 'QA Pack Roll Fail', orderId: 'QA-PW-PR', vehicleNo: 'MH12QA1234', dispatchDate: '2026-10-22T01:52:08.000Z' },
    inventoryRolls: [{
      barcodeId: 'FG-QA-PR',
      rollType: 'FINISHED_GOODS',
      itemName: 'QA Pack Roll Fail FG',
      jobName: 'QA Pack Roll Fail',
      orderId: 'QA-PW-PR'
    }],
    grns: [PET_GRN, MGP_GRN, OTHER_GRN],
    productionRecords: [],
    orders: [{
      id: 'QA-PW-PR',
      jobName: 'QA Pack Roll Fail',
      orderDate: '2026-11-03',
      materialRequirements: [
        { filmType: 'PET', micron: 12 },
        { filmType: 'MGP', micron: 30 }
      ]
    }]
  });
  assert.deepEqual(result.materialsUsed, []);
  assert.equal(result.dateOfPrinting, null);
  assert.equal(result.traceabilityChecked, true);
  assert.equal(EMPTY_TRACE_MESSAGE, 'No consumption records linked');
});

test('two jobs keep the input roll and GRN that each one actually consumed', () => {
  const rolls = [
    {
      barcodeId: 'RM-PET-A',
      rollType: 'RAW_MATERIAL',
      itemName: 'PET 12µ',
      category: 'Film Substrates',
      grnId: PET_GRN.id,
      grnNo: PET_GRN.grnNo,
      vendorName: 'Aster Polyfilms',
      invoiceNo: 'A26-27/1228',
      batchNo: 'A26-27/1228',
      qcStatus: 'Approved',
      inwardDatetime: '2026-11-12T08:00:00.000Z'
    },
    {
      barcodeId: 'RM-MGP-B',
      rollType: 'RAW_MATERIAL',
      itemName: 'MGP 30µ',
      category: 'Film Substrates',
      grnId: MGP_GRN.id,
      grnNo: MGP_GRN.grnNo,
      vendorName: 'Metro Films',
      invoiceNo: 'INV-MGP-9',
      batchNo: 'LOT-MGP-9',
      qcStatus: 'Pending QC',
      inwardDatetime: '2026-11-02T08:00:00.000Z'
    },
    {
      barcodeId: 'SFG-JOB-A',
      rollType: 'SEMI_FINISHED_GOODS',
      itemName: 'Job A printed',
      jobName: 'Job A',
      orderId: 'ORD-A'
    },
    {
      barcodeId: 'SFG-JOB-B',
      rollType: 'SEMI_FINISHED_GOODS',
      itemName: 'Job B printed',
      jobName: 'Job B',
      orderId: 'ORD-B'
    }
  ];
  const records = [
    {
      id: 'REC-A',
      orderId: 'ORD-A',
      jobName: 'Job A',
      printingStartTime: '2026-11-09T11:05:32.190Z',
      outputRolls: [{ barcodeId: 'SFG-JOB-A' }],
      inputRollsList: [{ barcodeId: 'RM-PET-A', filmType: 'PET', micron: 12, consumedWeightKg: 8.4 }],
      materialsList: [{ barcode: 'RM-PET-A', itemName: 'PET 12µ', ledgerSource: 'printing-input-roll' }],
      sfgConsumptions: []
    },
    {
      id: 'REC-B',
      orderId: 'ORD-B',
      jobName: 'Job B',
      printingStartTime: '2026-11-10T06:00:00.000Z',
      outputRolls: [{ barcodeId: 'SFG-JOB-B' }],
      inputRollsList: [{ barcodeId: 'RM-MGP-B', filmType: 'MGP', micron: 30, consumedWeightKg: 4 }],
      materialsList: [{ barcode: 'RM-MGP-B', itemName: 'MGP 30µ' }],
      sfgConsumptions: []
    }
  ];
  const jobA = resolveBarcodeMaterials({
    barcode: 'SFG-JOB-A',
    inventoryRolls: rolls,
    grns: [PET_GRN, MGP_GRN],
    productionRecords: records
  });
  const jobB = resolveBarcodeMaterials({
    barcode: 'SFG-JOB-B',
    inventoryRolls: rolls,
    grns: [PET_GRN, MGP_GRN],
    productionRecords: records
  });
  assert.deepEqual(grnNos(jobA), [PET_GRN.grnNo]);
  assert.equal(jobA.materialsUsed[0].vendorName, 'Aster Polyfilms');
  assert.equal(jobA.materialsUsed[0].invoiceNo, 'A26-27/1228');
  assert.equal(jobA.materialsUsed[0].batchNo, 'A26-27/1228');
  assert.equal(jobA.materialsUsed[0].qcStatus, 'Approved');
  assert.equal(jobA.materialsUsed[0].barcode, 'RM-PET-A');
  assert.equal(jobA.materialsUsed[0].receivedDate.includes('T08:00'), false);
  assert.notEqual(jobA.dateOfPrinting, '2026-11-09T11:05:32.190Z');
  assert.match(jobA.dateOfPrinting, /2026/);
  assert.deepEqual(grnNos(jobB), [MGP_GRN.grnNo]);
  assert.equal(jobB.materialsUsed[0].vendorName, 'Metro Films');
  assert.equal(jobB.materialsUsed[0].qcStatus, 'Pending QC');
  assert.equal(jobA.materialsUsed[0].grnNo === jobB.materialsUsed[0].grnNo, false);
});

test('one production record with two outputs does not give both the same substrates', () => {
  const rolls = [
    { barcodeId: 'RM-MB-LAM-A', rollType: 'RAW_MATERIAL', itemName: 'METPET lot 1 A', grnNo: 'SIL/GRN/1', qcStatus: 'Approved', category: 'Film Substrates' },
    { barcodeId: 'RM-MB-LAM-B', rollType: 'RAW_MATERIAL', itemName: 'METPET lot 1 B', grnNo: 'SIL/GRN/1', qcStatus: 'Approved', category: 'Film Substrates' },
    { barcodeId: 'RM-MB-LAM2-A', rollType: 'RAW_MATERIAL', itemName: 'METPET lot 2 A', grnNo: 'SIL/GRN/2', qcStatus: 'Approved', category: 'Film Substrates' },
    { barcodeId: 'RM-MB-LAM2-B', rollType: 'RAW_MATERIAL', itemName: 'METPET lot 2 B', grnNo: 'SIL/GRN/2', qcStatus: 'Approved', category: 'Film Substrates' },
    { barcodeId: 'SFG-BC-LOT1', rollType: 'SEMI_FINISHED_GOODS', itemName: 'Lot 1', orderId: 'ORD-MB', jobName: 'Mass Balance', inputBarcodeIds: ['SFG-LOT-1'] },
    { barcodeId: 'SFG-BC-LOT2', rollType: 'SEMI_FINISHED_GOODS', itemName: 'Lot 2', orderId: 'ORD-MB', jobName: 'Mass Balance', inputBarcodeIds: ['SFG-LOT-2'] }
  ];
  const grns = [
    { id: 'SIL/GRN/1', grnNo: 'SIL/GRN/1', vendorName: 'Vendor One', invoiceNo: 'INV-1', batchNo: 'B1', qcStatus: 'Approved', received_date: '2026-11-01' },
    { id: 'SIL/GRN/2', grnNo: 'SIL/GRN/2', vendorName: 'Vendor Two', invoiceNo: 'INV-2', batchNo: 'B2', qcStatus: 'Approved', received_date: '2026-11-02' }
  ];
  const record = {
    id: 'REC-MB',
    orderId: 'ORD-MB',
    jobName: 'Mass Balance',
    dateFilled: '2026-11-10',
    inputRollsList: [],
    materialsList: [
      { barcode: 'RM-MB-LAM-A', itemName: 'METPET lot 1 A' },
      { barcode: 'RM-MB-LAM-B', itemName: 'METPET lot 1 B' },
      { barcode: 'RM-MB-LAM2-A', itemName: 'METPET lot 2 A' },
      { barcode: 'RM-MB-LAM2-B', itemName: 'METPET lot 2 B' }
    ],
    sfgConsumptions: [
      {
        id: 'LOG-1',
        sfgBatchCode: 'SFG-LOT-1',
        outputRoll: { barcode: 'SFG-BC-LOT1' },
        substrate2Rolls: [
          { barcode: 'RM-MB-LAM-A', filmType: 'METPET' },
          { barcode: 'RM-MB-LAM-B', filmType: 'METPET' }
        ]
      },
      {
        id: 'LOG-2',
        sfgBatchCode: 'SFG-LOT-2',
        outputRoll: { barcode: 'SFG-BC-LOT2' },
        substrate2Rolls: [
          { barcode: 'RM-MB-LAM2-A', filmType: 'METPET' },
          { barcode: 'RM-MB-LAM2-B', filmType: 'METPET' }
        ]
      }
    ]
  };
  const lot1 = resolveBarcodeMaterials({ barcode: 'SFG-BC-LOT1', inventoryRolls: rolls, grns, productionRecords: [record] });
  const lot2 = resolveBarcodeMaterials({ barcode: 'SFG-BC-LOT2', inventoryRolls: rolls, grns, productionRecords: [record] });
  assert.deepEqual(lot1.materialsUsed.map((row) => row.barcode).sort(), ['RM-MB-LAM-A', 'RM-MB-LAM-B']);
  assert.deepEqual(lot2.materialsUsed.map((row) => row.barcode).sort(), ['RM-MB-LAM2-A', 'RM-MB-LAM2-B']);
  assert.deepEqual(grnNos(lot1), ['SIL/GRN/1', 'SIL/GRN/1']);
  assert.deepEqual(new Set(grnNos(lot2)), new Set(['SIL/GRN/2']));
});

test('a balance roll follows its parent to the original inward GRN', () => {
  const rolls = [
    {
      barcodeId: 'RM-ROOT',
      rollType: 'RAW_MATERIAL',
      itemName: 'PET 12µ',
      category: 'Film Substrates',
      grnNo: 'SIL/GRN/26-27/204',
      vendorName: 'Aster Polyfilms',
      invoiceNo: 'A26-27/1228',
      batchNo: 'A26-27/1228',
      qcStatus: 'Approved',
      inwardDatetime: '2026-11-12T00:00:00.000Z'
    },
    {
      barcodeId: 'RM-ROOT-BAL',
      rollType: 'RAW_MATERIAL',
      itemName: 'PET roll - Remaining Balance Roll',
      parentBarcodeId: 'RM-ROOT',
      orderId: 'ORD-A',
      jobName: 'Job A'
    },
    {
      barcodeId: 'RM-ROOT-BAL-BAL',
      rollType: 'RAW_MATERIAL',
      itemName: 'PET roll - Remaining Balance Roll',
      parentBarcodeId: 'RM-ROOT-BAL',
      metadata: { parentBarcodeId: 'RM-ROOT-BAL' }
    }
  ];
  const result = resolveBarcodeMaterials({
    barcode: 'RM-ROOT-BAL-BAL',
    inventoryRolls: rolls,
    grns: [PET_GRN, MGP_GRN],
    productionRecords: [{
      id: 'REC-OTHER',
      orderId: 'ORD-A',
      jobName: 'Job A',
      inputRollsList: [{ barcodeId: 'RM-MGP-NOT-PARENT' }],
      materialsList: [{ barcode: 'RM-MGP-NOT-PARENT', itemName: 'MGP 30µ' }]
    }]
  });
  assert.equal(result.materialsUsed.length, 1);
  assert.equal(result.materialsUsed[0].barcode, 'RM-ROOT');
  assert.equal(result.materialsUsed[0].grnNo, 'SIL/GRN/26-27/204');
  assert.equal(result.materialsUsed[0].vendorName, 'Aster Polyfilms');
  assert.equal(result.materialsUsed[0].invoiceNo, 'A26-27/1228');
  assert.equal(result.dateOfPrinting, null);
});

test('a raw-material roll shows its own inward receipt', () => {
  const result = resolveBarcodeMaterials({
    barcode: 'RM-BC-20261021-6490FR56',
    inventoryRolls: [{
      barcodeId: 'RM-BC-20261021-6490FR56',
      rollType: 'RAW_MATERIAL',
      itemName: 'PET-800-12',
      category: 'Film Substrates',
      grnId: OTHER_GRN.id,
      invoiceNo: 'QA-INV2-24893',
      batchNo: 'QA-BATCH-2',
      qcStatus: 'Approved',
      inwardDatetime: '2026-10-21T19:32:06.491Z'
    }],
    grns: [PET_GRN, MGP_GRN, OTHER_GRN],
    productionRecords: [{
      id: 'REC-X',
      jobName: 'Some Other Job',
      inputRollsList: [{ barcodeId: 'RM-PET-A' }]
    }]
  });
  assert.equal(result.materialsUsed.length, 1);
  assert.equal(result.materialsUsed[0].grnNo, 'SIL/GRN/26-27/105');
  assert.equal(result.materialsUsed[0].invoiceNo, 'QA-INV2-24893');
  assert.equal(result.materialsUsed[0].batchNo, 'QA-BATCH-2');
  assert.equal(result.materialsUsed[0].vendorName, 'General Vendor');
  assert.equal(result.materialsUsed[0].qcStatus, 'Approved');
  assert.equal(result.dateOfPrinting, null);
});

test('a store issue supplies the consumed roll when the production record has no input list', () => {
  const result = resolveBarcodeMaterials({
    barcode: 'FG-DISP-545847-1',
    dispatchItem: {
      barcodeId: 'FG-DISP-545847-1',
      jobName: 'QA Deep Pouch Run',
      orderId: 'ORD-2026-101'
    },
    inventoryRolls: [{
      barcodeId: 'RM-BC-20261021-6490FR56',
      rollType: 'RAW_MATERIAL',
      itemName: 'PET-800-12',
      category: 'Film Substrates',
      grnId: 'SIL/GRN/26-27/105',
      invoiceNo: 'QA-INV2-24893',
      batchNo: 'QA-BATCH-2',
      qcStatus: 'Approved',
      inwardDatetime: '2026-10-21T19:32:06.491Z'
    }],
    grns: [PET_GRN, OTHER_GRN],
    productionRecords: [{
      id: 'PR-ORD-2026-101',
      orderId: 'ORD-2026-101',
      jobName: 'QA Deep Pouch Run',
      dateFilled: '2026-10-21',
      inputRollsList: [],
      materialsList: [],
      sfgConsumptions: []
    }],
    storeIssues: [{
      id: 'ISS-1',
      barcode: 'RM-BC-20261021-6490FR56',
      grnNo: 'SIL/GRN/26-27/105',
      jobName: 'QA Deep Pouch Run',
      orderId: '',
      itemName: 'PET-800-12',
      batchNo: 'QA-BATCH-2',
      vendorName: 'General Vendor'
    }]
  });
  assert.deepEqual(grnNos(result), ['SIL/GRN/26-27/105']);
  assert.equal(result.materialsUsed[0].barcode, 'RM-BC-20261021-6490FR56');
  const otherJob = resolveBarcodeMaterials({
    barcode: 'FG-OTHER',
    dispatchItem: { barcodeId: 'FG-OTHER', jobName: 'Unrelated Job', orderId: 'ORD-OTHER' },
    inventoryRolls: [],
    grns: [PET_GRN, OTHER_GRN],
    productionRecords: [],
    storeIssues: [{ barcode: 'RM-BC-20261021-6490FR56', grnNo: 'SIL/GRN/26-27/105', jobName: 'QA Deep Pouch Run' }]
  });
  assert.deepEqual(otherJob.materialsUsed, []);
});

test('a ledger issue is used and a synthetic GRN number that is not a receipt is not shown', () => {
  const result = resolveBarcodeMaterials({
    barcode: 'SFG-STEPS',
    inventoryRolls: [
      { barcodeId: 'SFG-STEPS', rollType: 'SEMI_FINISHED_GOODS', orderId: 'ORD-STEPS', jobName: 'QA Steps All Finished' },
      {
        barcodeId: 'FIFOQA-RM-OLD',
        rollType: 'RAW_MATERIAL',
        itemName: 'PET-410-12',
        category: 'Film Substrates',
        qcStatus: 'Approved',
        inwardDatetime: '2026-10-30T12:26:54.920Z'
      }
    ],
    grns: [PET_GRN],
    productionRecords: [{ id: 'REC-STEPS', orderId: 'ORD-STEPS', jobName: 'QA Steps All Finished', inputRollsList: [], materialsList: [] }],
    ledgerEntries: [{
      entry_kind: 'issue',
      barcode: 'FIFOQA-RM-OLD',
      order_id: 'ORD-STEPS',
      production_record_id: 'REC-STEPS',
      job_name: 'QA Steps All Finished',
      item_name: 'PET-410-12',
      grn_no: 'GRN-FIFOQA-RM-OLD',
      vendor_name: 'Verified Supplier'
    }, {
      entry_kind: 'balance_receipt',
      barcode: 'FIFOQA-RM-OLD-BAL',
      order_id: 'ORD-STEPS',
      parent_barcode: 'FIFOQA-RM-OLD'
    }]
  });
  assert.equal(result.materialsUsed.length, 1);
  assert.equal(result.materialsUsed[0].barcode, 'FIFOQA-RM-OLD');
  assert.equal(result.materialsUsed[0].grnNo, 'N/A');
  assert.equal(result.materialsUsed[0].vendorName, 'Verified Supplier');
  assert.equal(result.materialsUsed[0].qcStatus, 'Approved');
});

test('a reverted consumption is ignored and a missing QC status stays blank', () => {
  const result = resolveBarcodeMaterials({
    barcode: 'SFG-REV',
    inventoryRolls: [
      { barcodeId: 'SFG-REV', rollType: 'SEMI_FINISHED_GOODS', orderId: 'ORD-REV', jobName: 'Revert Job' },
      { barcodeId: 'RM-REV', rollType: 'RAW_MATERIAL', itemName: 'PET revert', grnNo: 'SIL/GRN/9' }
    ],
    grns: [{ id: 'SIL/GRN/9', grnNo: 'SIL/GRN/9', vendorName: 'Revert Vendor', invoiceNo: 'INV-R', batchNo: 'B-R', received_date: '2026-11-01' }],
    productionRecords: [{
      id: 'REC-REV',
      orderId: 'ORD-REV',
      jobName: 'Revert Job',
      sfgConsumptions: [{
        status: 'Reverted',
        outputRoll: { barcode: 'SFG-REV' },
        substrate2: { barcode: 'RM-REV' }
      }]
    }]
  });
  assert.deepEqual(result.materialsUsed, []);
  assert.equal(result.materialsUsed.find((row) => row.qcStatus === 'PASSED & APPROVED'), undefined);
});

test('the same output code on another order does not replace this roll\'s inputs', () => {
  const shared = 'SFG-BC-SHARED';
  const rolls = [
    { barcodeId: shared, rollType: 'SEMI_FINISHED_GOODS', orderId: 'ORD-REAL', jobName: 'Real Job' },
    { barcodeId: 'RM-REAL', rollType: 'RAW_MATERIAL', itemName: 'Real PET', grnNo: 'SIL/GRN/REAL', qcStatus: 'Approved', category: 'Film Substrates' },
    { barcodeId: 'RM-OTHER', rollType: 'RAW_MATERIAL', itemName: 'Other MGP', grnNo: 'SIL/GRN/OTHER', qcStatus: 'Approved', category: 'Film Substrates' }
  ];
  const grns = [
    { id: 'SIL/GRN/REAL', grnNo: 'SIL/GRN/REAL', vendorName: 'Real Vendor', invoiceNo: 'INV-REAL', batchNo: 'B-REAL', received_date: '2026-11-04', qcStatus: 'Approved' },
    { id: 'SIL/GRN/OTHER', grnNo: 'SIL/GRN/OTHER', vendorName: 'Other Vendor', invoiceNo: 'INV-OTHER', batchNo: 'B-OTHER', received_date: '2026-11-05', qcStatus: 'Approved' }
  ];
  const result = resolveBarcodeMaterials({
    barcode: shared,
    inventoryRolls: rolls,
    grns,
    productionRecords: [
      { id: 'REC-OTHER', orderId: 'ORD-OTHER', jobName: 'Other Job', outputRolls: [{ barcodeId: shared }], inputRollsList: [{ barcodeId: 'RM-OTHER' }] },
      { id: 'REC-REAL', orderId: 'ORD-REAL', jobName: 'Real Job', outputRolls: [{ barcodeId: shared }], inputRollsList: [{ barcodeId: 'RM-REAL' }] }
    ]
  });
  assert.deepEqual(result.materialsUsed.map((row) => row.barcode), ['RM-REAL']);
  assert.equal(result.materialsUsed[0].grnNo, 'SIL/GRN/REAL');
  assert.equal(result.materialsUsed[0].vendorName, 'Real Vendor');
});

test('the inspector no longer plants sample GRNs or placeholder print dates', () => {
  const scanner = fs.readFileSync(new URL('../src/components/UniversalBarcodeScannerModal.jsx', import.meta.url), 'utf8');
  assert.equal(scanner.includes('grns.slice(0, 2)'), false);
  assert.equal(scanner.includes('GRN-STORE'), false);
  assert.equal(scanner.includes('GRN-INK-STORE'), false);
  assert.equal(scanner.includes('PASSED & APPROVED'), false);
  assert.equal(scanner.includes('Active Printing Run Date Recorded'), false);
  assert.equal(scanner.includes('PET 12µ / METBOPP'), false);
  assert.equal(scanner.includes("|| '3 Inch'"), false);
  assert.equal(scanner.includes('Solvent Storage Yard'), false);
  assert.equal(scanner.includes('Ink Mixing Room'), false);
  assert.match(scanner, /resolveBarcodeMaterials/);
  assert.match(scanner, /EMPTY_TRACE_MESSAGE/);
  assert.match(scanner, /data-material-trace-empty/);
});
