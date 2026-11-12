import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planPrintingSfgLot, omitPrintedLotChildren } from '../src/utils/printingSfgLot.js';
import { planLaminationFilmIssue } from '../src/utils/printingFilmIssue.js';
import { persistConsumeOutputsBeforeStock, requireConsumeOutputRecords, rollsToPersist } from '../src/services/consumeOutputFirst.js';

const printedLot = planPrintingSfgLot({
  orderId: 'ORD-2026-180',
  jobName: 'Top Meal Green Peas 400gm',
  clientName: 'Zain Natural Agro India Pvt Ltd',
  filmType: 'PET',
  micron: 12,
  widthMm: 770,
  outputRolls: [{ barcodeId: 'SFG-BC-ORD-2026-180-1', netWeightKg: 129.7, lengthMeters: 10000 }]
});

function laminationLog() {
  return {
    id: 'SFG-LOG-LAM-1',
    targetProcess: 'Lamination (Pass 1)',
    targetMachine: 'Nordmeccanica SL 350 Laminator',
    operatorName: 'Store',
    shift: 'Day Shift',
    date: '2026-11-11',
    orderId: 'ORD-2026-180',
    consumedKg: 119.9,
    substrate2: {
      barcode: 'RM-BC-NMET-1',
      filmType: 'NMET',
      micron: 65,
      widthMm: 765,
      initialKg: 105,
      consumedKg: 105
    },
    substrate2Rolls: [{
      barcode: 'RM-BC-NMET-1',
      filmType: 'NMET',
      micron: 65,
      widthMm: 765,
      initialKg: 105,
      consumedKg: 105
    }],
    outputRoll: null,
    outputRolls: [
      {
        barcode: 'SFG-BC-ORD2026180-7873',
        outputType: 'SFG',
        grossWeightKg: 271.8,
        tareWeightKg: 0.8,
        netWeightKg: 271,
        storageBay: 'Bay A',
        stage: 'Lamination (Pass 1)'
      },
      {
        barcode: 'SFG-BC-ORD2026180-7873-R02',
        outputType: 'SFG',
        grossWeightKg: 268,
        tareWeightKg: 0,
        netWeightKg: 268,
        storageBay: 'Bay A',
        stage: 'Lamination (Pass 1)'
      }
    ]
  };
}

test('one filled lamination output is persisted, and two child rolls stay two rolls', () => {
  const single = rollsToPersist({
    outputRoll: { barcode: 'SFG-BC-ONE', outputType: 'SFG', netWeightKg: 40, grossWeightKg: 40.8, tareWeightKg: 0.8 }
  });
  assert.equal(single.length, 1);
  assert.equal(single[0].netWeightKg, 40);
  assert.equal(rollsToPersist(laminationLog()).length, 2);
  assert.doesNotThrow(() => requireConsumeOutputRecords([{ sfg: {}, roll: {} }]));
  assert.throws(() => requireConsumeOutputRecords([]), /at least one output roll/);
});

test('a saved lamination consume shows the laminated roll and still hides the printed child', async () => {
  const parent = {
    ...printedLot,
    consumedKg: 119.9,
    availableKg: 9.8,
    status: 'Partially Consumed'
  };
  const log = laminationLog();
  let saved = null;
  const result = await persistConsumeOutputsBeforeStock({
    parentItem: parent,
    logEntry: log,
    nowIso: '2026-11-11T10:00:00.000Z',
    saveOutputs: async (records) => {
      saved = records;
    }
  });

  assert.equal(result.records.length, 2);
  assert.equal(saved[0].sfg.sfgType, 'Laminated / Processed Rolls');
  assert.equal(saved[0].sfg.sfgBatchCode, 'SFG-BC-ORD2026180-7873');
  assert.equal(saved[0].sfg.totalNetKg, 271);
  assert.equal(saved[0].sfg.availableKg, 271);
  assert.equal(saved[0].sfg.parentSfgBatchCode, 'SFG-LOT-ORD-2026-180');
  assert.equal(saved[0].roll.netWeightKg, 271);
  assert.equal(saved[0].roll.tareWeightKg, 0.8);
  assert.equal(saved[1].sfg.totalNetKg, 268);

  const store = omitPrintedLotChildren([
    parent,
    { sfgBatchCode: 'SFG-BC-ORD-2026-180-1', totalNetKg: 129.7, availableKg: 129.7, sfgType: 'Printed Rolls' },
    ...saved.map((record) => record.sfg)
  ]);
  const codes = store.map((row) => row.sfgBatchCode);
  assert.deepEqual(codes, ['SFG-LOT-ORD-2026-180', 'SFG-BC-ORD2026180-7873', 'SFG-BC-ORD2026180-7873-R02']);
  const lot = store.find((row) => row.sfgBatchCode === 'SFG-LOT-ORD-2026-180');
  assert.equal(lot.consumedKg, 119.9);
  assert.equal(lot.availableKg, 9.8);
  assert.equal(lot.status, 'Partially Consumed');
  assert.equal(lot.totalNetKg, 129.7);
  const laminated = store.find((row) => row.sfgBatchCode === 'SFG-BC-ORD2026180-7873');
  assert.equal(laminated.totalNetKg, 271);
  assert.equal(laminated.availableKg, 271);
  assert.equal(laminated.status, 'In Stock (WIP)');
});

test('substrate 2 is deducted once, and saving the same lamination log again does not deduct it twice', () => {
  const film = { id: 'INVT-0110', category: 'Film Substrates', filmType: 'NMET', micron: 65, widthMm: 765, availableQtyKg: 500 };
  const rolls = laminationLog().substrate2Rolls;
  const first = planLaminationFilmIssue({
    orderId: 'ORD-2026-180',
    logId: 'SFG-LOG-LAM-1',
    stage: 'Lamination (Pass 1)',
    rolls,
    inventoryItems: [film]
  });
  assert.equal(first.inventoryAdjustments.length, 1);
  assert.equal(first.inventoryAdjustments[0].stockItemId, 'INVT-0110');
  assert.equal(first.inventoryAdjustments[0].deltaKg, 105);
  assert.equal(first.materialsList[0].netConsumedQtyKg, 105);

  const again = planLaminationFilmIssue({
    orderId: 'ORD-2026-180',
    logId: 'SFG-LOG-LAM-1',
    stage: 'Lamination (Pass 1)',
    rolls,
    existingMaterials: first.materialsList,
    inventoryItems: [film]
  });
  assert.equal(again.materialsList.length, 1);
  assert.equal(again.inventoryAdjustments.length, 0);
  assert.equal(again.materialsList[0].appliedStockQtyKg, 105);
});

test('a failed output-roll write does not deduct the printed lot or Substrate 2', async () => {
  const calls = [];
  await assert.rejects(
    () => persistConsumeOutputsBeforeStock({
      parentItem: printedLot,
      logEntry: laminationLog(),
      saveOutputs: async () => {
        calls.push('output');
        throw new Error('sfg_goods rejected the laminated roll');
      }
    }),
    /sfg_goods rejected the laminated roll/
  );
  assert.deepEqual(calls, ['output']);

  const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const consumeStart = source.indexOf('const handleConsumeSFG');
  const consume = source.slice(consumeStart, source.indexOf('const handleDeleteSFGGood'));
  const outputAt = consume.indexOf('persistConsumeOutputsBeforeStock');
  const parentAt = consume.indexOf('saveSFGGoodToSupabase(updatedSfgItem)');
  const recordAt = consume.indexOf('saveProductionRecordToSupabase(updatedRec)');
  assert.ok(outputAt > 0 && parentAt > outputAt && recordAt > parentAt);
  assert.doesNotMatch(consume, /child output rolls/);
});
