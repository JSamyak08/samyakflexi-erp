import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCE_REASON_KEEP,
  BALANCE_REASON_OTHER,
  BALANCE_REASON_QC_HOLD,
  applyBalanceDisposition,
  balanceSaveError,
  composeConsumeNotes,
  computeConsumeStockBalance,
  consumeMassInputs,
  inputRollWeightsFromLog,
  stageScrapKg
} from '../src/utils/consumeMassBalance.js';

test('slitting balance is consumed minus trim and setting minus output net', () => {
  const scrap = stageScrapKg('Slitting & Rewinding', {
    slittingTrimScrapKg: 21,
    slittingSettingWastageKg: 7,
    slittingScrapKg: 28
  });
  assert.equal(scrap, 28);
  const balance = computeConsumeStockBalance({
    processName: 'Slitting & Rewinding',
    consumedKg: 801.2,
    availableKg: 801.2,
    scrapKg: scrap,
    outputNetKg: 745
  });
  assert.equal(balance.mode, 'output');
  assert.equal(balance.balanceKeptKg, 28.2);
  assert.equal(balance.negative, false);
  assert.equal(balance.reasonRequired, true);
  assert.equal(balance.lotAvailableKg, 28.2);
  assert.equal(balance.stockDeductedKg, 773);
  assert.equal(
    balance.lotAvailableKg + balance.scrapKg + balance.outputNetKg,
    801.2
  );
});

test('untouched film stays on the lot together with the kept balance', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Slitting & Rewinding',
    consumedKg: 801.2,
    availableKg: 900,
    scrapKg: 28,
    outputNetKg: 745
  });
  assert.equal(balance.balanceKeptKg, 28.2);
  assert.equal(balance.lotAvailableKg, 127);
  assert.equal(balance.stockDeductedKg, 773);
  assert.equal(balance.lotAvailableKg + balance.stockDeductedKg, 900);
});

test('output plus scrap above consumed blocks, with no extra tolerance', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Pouching / Bag Making',
    consumedKg: 100,
    availableKg: 100,
    scrapKg: 12,
    outputNetKg: 90
  });
  assert.equal(balance.balanceKeptKg, -2);
  assert.equal(balance.negative, true);
  assert.match(balanceSaveError(balance), /exceeds the consumed weight by 2.00 kg/);
  assert.equal(balance.lotAvailableKg, null);
});

test('a zero balance needs no reason and removes the consumed weight from the lot', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Printing (Pass 2)',
    consumedKg: 50,
    availableKg: 80,
    scrapKg: 5,
    outputNetKg: 45
  });
  assert.equal(balance.balanceKeptKg, 0);
  assert.equal(balance.reasonRequired, false);
  assert.equal(balance.lotAvailableKg, 30);
  assert.equal(balance.stockDeductedKg, 50);
  assert.equal(balanceSaveError(balance, { reason: '' }), '');
});

test('adhesive and zipper are not stage scrap', () => {
  assert.equal(stageScrapKg('Lamination (Pass 1)', {
    laminationPlainSubstrateWastageKg: 2,
    laminateWastageKg: 3,
    adhesiveConsumedL1Kg: 9
  }), 5);
  assert.equal(stageScrapKg('Pouching / Bag Making', {
    pouchingScrapKg: 4,
    zipperConsumedKg: 11
  }), 4);
});

test('plain consumption, including dispatch packing, stays available minus consumed', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Dispatch Packing',
    consumedKg: 40,
    availableKg: 100,
    scrapKg: 99,
    outputNetKg: 99
  });
  assert.equal(balance.mode, 'plain');
  assert.equal(balance.lotAvailableKg, 60);
  assert.equal(balance.stockDeductedKg, 40);
  assert.equal(balance.reasonRequired, false);
  assert.equal(balance.balanceKeptKg, null);
});

test('QC Hold moves the kept balance off good stock and into the hold quantity', () => {
  const balance = applyBalanceDisposition(computeConsumeStockBalance({
    processName: 'Slitting & Rewinding',
    consumedKg: 801.2,
    availableKg: 801.2,
    scrapKg: 28,
    outputNetKg: 745
  }), BALANCE_REASON_QC_HOLD);
  assert.equal(balance.toQcHold, true);
  assert.equal(balance.balanceKeptKg, 28.2);
  assert.equal(balance.lotAvailableKg, 0);
  assert.equal(balance.stockDeductedKg, 801.2);
  assert.equal(balance.lotAvailableKg + 28 + 745 + balance.balanceKeptKg, 801.2);
});

test('keeping the balance requires a reason, and Other requires a note', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Slitting & Rewinding',
    consumedKg: 801.2,
    availableKg: 801.2,
    scrapKg: 28,
    outputNetKg: 745
  });
  assert.match(balanceSaveError(balance, { reason: '' }), /reason/);
  assert.match(balanceSaveError(balance, { reason: BALANCE_REASON_OTHER, note: '  ' }), /note/);
  assert.equal(balanceSaveError(balance, { reason: BALANCE_REASON_KEEP }), '');
  const kept = applyBalanceDisposition(balance, BALANCE_REASON_KEEP);
  assert.equal(kept.toQcHold, false);
  assert.equal(kept.lotAvailableKg, 28.2);
  assert.match(composeConsumeNotes({
    notes: 'Bay B',
    balance: kept,
    balanceReason: BALANCE_REASON_KEEP
  }), /28\.20 kg kept on this lot \(Extra quantity kept in stock\)/);
});

test('lamination consumed is printed film plus substrate consumed plus adhesive', () => {
  const inputs = consumeMassInputs({
    processName: 'Lamination (Pass 1)',
    primaryKg: 200,
    substrateKg: 120,
    adhesiveKg: 15,
    inkSolidsKg: 9
  });
  assert.equal(inputs.consumedKg, 335);
  assert.equal(inputs.addedInputKg, 135);
  const balance = computeConsumeStockBalance({
    processName: 'Lamination (Pass 1)',
    consumedKg: inputs.primaryKg,
    addedInputKg: inputs.addedInputKg,
    availableKg: 300,
    scrapKg: 10,
    outputNetKg: 320
  });
  assert.equal(balance.consumedKg, 335);
  assert.equal(balance.balanceKeptKg, 5);
  assert.equal(balance.lotKeptKg, 5);
  assert.equal(balance.unallocatedKg, 0);
  assert.equal(balance.negative, false);
  assert.equal(balance.stockDeductedKg, 195);
  assert.equal(balance.lotAvailableKg, 105);
  assert.equal(balance.lotAvailableKg + balance.stockDeductedKg, 300);
});

test('lamination pass 2 counts substrate 3 and pass-2 adhesive, not the full roll', () => {
  const inputs = consumeMassInputs({
    processName: 'Lamination (Pass 2)',
    primaryKg: 80,
    substrateKg: 70,
    adhesiveKg: 8
  });
  assert.deepEqual(inputs.lines.map((line) => line.label), ['Printed film', 'Substrate 3', 'Adhesive']);
  const balance = computeConsumeStockBalance({
    processName: 'Lamination (Pass 2)',
    consumedKg: 80,
    addedInputKg: inputs.addedInputKg,
    availableKg: 80,
    scrapKg: 4,
    outputNetKg: 150
  });
  assert.equal(balance.balanceKeptKg, 4);
  assert.equal(balance.stockDeductedKg, 76);
  assert.equal(balance.lotAvailableKg, 4);
});

test('a laminate heavier than every input is still blocked', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Lamination (Pass 1)',
    consumedKg: 200,
    addedInputKg: 135,
    availableKg: 300,
    scrapKg: 10,
    outputNetKg: 400
  });
  assert.equal(balance.balanceKeptKg, -75);
  assert.equal(balance.negative, true);
  assert.equal(balance.lotAvailableKg, null);
  assert.equal(balance.stockDeductedKg, null);
  assert.match(balanceSaveError(balance), /exceeds the consumed weight by 75.00 kg/);
});

test('surplus added material is not written onto the printed lot', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Lamination (Pass 1)',
    consumedKg: 279,
    addedInputKg: 1426.22,
    availableKg: 305,
    scrapKg: 14.2,
    outputNetKg: 374
  });
  assert.equal(balance.consumedKg, 1705.22);
  assert.equal(balance.balanceKeptKg, 1317.02);
  assert.equal(balance.negative, false);
  assert.equal(balance.lotKeptKg, 279);
  assert.equal(balance.unallocatedKg, 1038.02);
  assert.equal(balance.stockDeductedKg, 0);
  assert.equal(balance.lotAvailableKg, 305);
});

test('printing pass 2 counts ink solids that stay on the film', () => {
  const inputs = consumeMassInputs({
    processName: 'Printing (Pass 2)',
    primaryKg: 100,
    inkSolidsKg: 4,
    adhesiveKg: 20
  });
  assert.equal(inputs.addedInputKg, 4);
  assert.equal(inputs.consumedKg, 104);
  const balance = computeConsumeStockBalance({
    processName: 'Printing (Pass 2)',
    consumedKg: 100,
    addedInputKg: inputs.addedInputKg,
    availableKg: 120,
    scrapKg: 5,
    outputNetKg: 98
  });
  assert.equal(balance.balanceKeptKg, 1);
  assert.equal(balance.lotKeptKg, 1);
  assert.equal(balance.stockDeductedKg, 99);
  assert.equal(balance.lotAvailableKg, 21);
  assert.equal(balance.lotAvailableKg + balance.stockDeductedKg, 120);
});

test('printing without ink still blocks output plus scrap above the film', () => {
  const balance = computeConsumeStockBalance({
    processName: 'Printing (Pass 2)',
    consumedKg: 100,
    addedInputKg: 0,
    availableKg: 120,
    scrapKg: 5,
    outputNetKg: 98
  });
  assert.equal(balance.balanceKeptKg, -3);
  assert.equal(balance.negative, true);
});

test('pouching counts zipper weight and slitting does not count adhesive or ink', () => {
  const pouch = consumeMassInputs({
    processName: 'Pouching / Bag Making',
    primaryKg: 40,
    zipperKg: 3,
    adhesiveKg: 9
  });
  assert.equal(pouch.consumedKg, 43);
  const slit = consumeMassInputs({
    processName: 'Slitting & Rewinding',
    primaryKg: 40,
    adhesiveKg: 9,
    inkSolidsKg: 2,
    zipperKg: 3,
    substrateKg: 10
  });
  assert.equal(slit.addedInputKg, 0);
  assert.equal(slit.consumedKg, 40);
});

test('older consumption logs still reconstruct the input roll the same way', () => {
  assert.deepEqual(inputRollWeightsFromLog({ consumedKg: 40, remainingBalanceKg: 60 }), {
    initialWeightKg: 100,
    consumedWeightKg: 40
  });
  assert.deepEqual(inputRollWeightsFromLog({
    consumedKg: 801.2,
    remainingBalanceKg: 28.2,
    stockDeductedKg: 773
  }), {
    initialWeightKg: 801.2,
    consumedWeightKg: 773
  });
});
