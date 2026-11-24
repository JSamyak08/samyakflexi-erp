import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateFilmRollLength } from '../src/factoryStore.js';
import {
  DEFAULT_EXTRA_PRINT_PERCENT,
  EXTRA_PRINT_PERCENT_SETTING,
  applyExtraPrintToRequirements,
  extraPrintIncludedNote,
  extraPrintRuleLabel,
  extraPrintShortfall,
  normalizeExtraPrintPercent,
  planExtraPrint,
  planOrderExtraPrint
} from '../src/utils/extraPrintRule.js';

const pet = { widthMm: 1000, micron: 12, filmType: 'PET' };

test('print target is 3 percent over the required kg and metres, with no SFG balance', () => {
  const plan = planExtraPrint({ requiredPrintedKg: 100, sfgBalanceKg: 0, ...pet });
  assert.equal(plan.percent, DEFAULT_EXTRA_PRINT_PERCENT);
  assert.equal(plan.label, '+3% extra print rule');
  assert.equal(plan.baseKg, 100);
  assert.equal(plan.extraKg, 3);
  assert.equal(plan.targetKg, 103);
  assert.equal(plan.baseMeters, calculateFilmRollLength(100, 1000, 12, 'PET'));
  assert.equal(plan.extraMeters, calculateFilmRollLength(3, 1000, 12, 'PET'));
  assert.equal(plan.targetMeters, calculateFilmRollLength(103, 1000, 12, 'PET'));
  assert.ok(plan.targetMeters > plan.baseMeters);
});

test('printed SFG balance is deducted before the 3 percent extra', () => {
  const plan = planExtraPrint({ requiredPrintedKg: 100, sfgBalanceKg: 40, ...pet });
  assert.equal(plan.sfgBalanceKg, 40);
  assert.equal(plan.baseKg, 60);
  assert.equal(plan.extraKg, 1.8);
  assert.equal(plan.targetKg, 61.8);
  assert.equal(plan.baseMeters, calculateFilmRollLength(60, 1000, 12, 'PET'));
  assert.equal(plan.targetMeters, calculateFilmRollLength(61.8, 1000, 12, 'PET'));
});

test('a changed extra_print_percent replaces the default 3', () => {
  const plan = planExtraPrint({ requiredPrintedKg: 200, sfgBalanceKg: 0, percent: 5, ...pet });
  assert.equal(plan.percent, 5);
  assert.equal(plan.label, '+5% extra print rule');
  assert.equal(plan.baseKg, 200);
  assert.equal(plan.extraKg, 10);
  assert.equal(plan.targetKg, 210);
  assert.equal(plan.targetMeters, calculateFilmRollLength(210, 1000, 12, 'PET'));
  assert.equal(normalizeExtraPrintPercent(''), 3);
  assert.equal(normalizeExtraPrintPercent('nope'), 3);
  assert.equal(normalizeExtraPrintPercent(0), 0);
  assert.equal(extraPrintRuleLabel(0), '+0% extra print rule');
  assert.equal(extraPrintIncludedNote(3), '(incl. 3% extra)');
  assert.equal(extraPrintIncludedNote(5), '(incl. 5% extra)');
});

test('only the plain print film line becomes the target; other lines stay', () => {
  const applied = applyExtraPrintToRequirements([
    { id: 'REQ-1', filmType: 'PET', micron: 12, widthMm: 1000, qtyKg: 100, qtyBeforePrintedSfgKg: 100 },
    { id: 'REQ-2', filmType: 'Natural LD', micron: 35, widthMm: 1005, qtyKg: 90 },
    { id: 'REQ-3', filmType: 'Liquid Inks', micron: '-', widthMm: '-', qtyKg: 8 }
  ], { percent: 3 });
  assert.equal(applied.requirements[0].qtyBeforeExtraKg, 100);
  assert.equal(applied.requirements[0].qtyKg, 103);
  assert.equal(applied.requirements[1].qtyKg, 90);
  assert.equal(applied.requirements[2].qtyKg, 8);
  assert.equal(applied.extraPrint.hasPrintLine, true);
  assert.equal(applied.extraPrint.label, '+3% extra print rule');

  const withSfg = applyExtraPrintToRequirements([
    { id: 'REQ-1', filmType: 'PET', micron: 12, widthMm: 1000, qtyKg: 60, qtyBeforePrintedSfgKg: 100 },
    { id: 'REQ-2', filmType: 'Natural LD', micron: 35, widthMm: 1005, qtyKg: 90 }
  ], { percent: 3 });
  assert.equal(withSfg.extraPrint.baseKg, 60);
  assert.equal(withSfg.extraPrint.sfgBalanceKg, 40);
  assert.equal(withSfg.requirements[0].qtyKg, 61.8);
  assert.equal(withSfg.requirements[1].qtyKg, 90);
});

test('order planning uses the SFG balance and the setting, and a shortfall does not block', () => {
  const order = {
    id: 'ORD-NEW',
    jobName: 'Nyra',
    jobMasterId: 'JM-1',
    orderQtyKg: 200,
    materialRequirements: [
      { id: 'REQ-1', filmType: 'PET', micron: 12, widthMm: 1000, qtyKg: 100 },
      { id: 'REQ-2', filmType: 'Natural LD', micron: 35, widthMm: 1005, qtyKg: 80 }
    ]
  };
  const source = {
    id: 'ORD-OLD',
    jobName: 'Nyra',
    jobMasterId: 'JM-1',
    status: 'Completed'
  };
  const lot = {
    isPrintedLot: true,
    sfgBatchCode: 'SFG-LOT-1',
    sfgType: 'Printed Rolls',
    orderId: 'ORD-OLD',
    jobName: 'Nyra',
    jobMasterId: 'JM-1',
    totalNetKg: 40,
    availableKg: 40,
    totalMeters: 2000,
    status: 'In Stock'
  };
  const planned = planOrderExtraPrint({
    order,
    orders: [order, source],
    sfgGoods: [lot],
    percent: 3,
    choice: { mode: 'all', explicit: true }
  });
  assert.equal(planned.printQtyAfter, 60);
  assert.equal(planned.extraPrint.baseKg, 60);
  assert.equal(planned.extraPrint.targetKg, 61.8);
  assert.equal(planned.requirements[0].qtyKg, 61.8);
  assert.equal(planned.baseRequirements[0].qtyKg, 60);
  assert.equal(planned.requirements[1].qtyKg, 80);

  const changed = planOrderExtraPrint({
    order,
    orders: [order],
    sfgGoods: [],
    percent: 5,
    choice: { mode: 'none', explicit: true }
  });
  assert.equal(changed.extraPrint.sfgBalanceKg, 0);
  assert.equal(changed.extraPrint.baseKg, 100);
  assert.equal(changed.extraPrint.targetKg, 105);

  const short = extraPrintShortfall({
    plan: planned.extraPrint,
    printedKg: 50,
    printedMeters: 1000
  });
  assert.equal(short.below, true);
  assert.equal(short.blocks, false);
  assert.equal(short.shortKg, 11.8);
  assert.ok(short.shortMeters > 0);
  const met = extraPrintShortfall({
    plan: planned.extraPrint,
    printedKg: 61.8,
    printedMeters: planned.extraPrint.targetMeters
  });
  assert.equal(met.below, false);
  assert.equal(met.blocks, false);
  assert.equal(extraPrintShortfall({ plan: planned.extraPrint, printedKg: '', printedMeters: '' }).below, false);
  assert.equal(extraPrintShortfall({ plan: planned.extraPrint, printedKg: 0, printedMeters: 0 }).below, false);
});

test('extra print migration seeds the setting and does not name production', () => {
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261124120000_extra_print_percent.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, new RegExp(EXTRA_PRINT_PERCENT_SETTING));
  assert.match(sql, /'3'/);
  assert.match(sql, /Only an Admin can edit the extra print percent/);
  assert.doesNotMatch(sql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP VIEW|DROP FUNCTION|DROP POLICY/i);
});
