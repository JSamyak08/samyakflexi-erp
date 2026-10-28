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
