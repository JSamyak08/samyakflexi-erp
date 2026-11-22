import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRecordWastageKg,
  extractRecordGrossKg,
  parseRecordDate,
  computeWeightedScrapPct,
  calculateScrapMetrics
} from '../src/utils/dashboardScrap.js';
import { BOOT_NEEDS } from '../src/bootAccess.js';

test('BOOT_NEEDS registers dashboard under productionRecords and orders', () => {
  assert.ok(BOOT_NEEDS.productionRecords.includes('dashboard'), 'dashboard must be included in BOOT_NEEDS.productionRecords');
  assert.ok(BOOT_NEEDS.orders.includes('dashboard'), 'dashboard must be included in BOOT_NEEDS.orders');
});

test('calculateScrapMetrics returns clear state when records array is empty', () => {
  const metrics = calculateScrapMetrics([], []);
  assert.equal(metrics.hasData, false);
  assert.equal(metrics.displayAvg, 0);
  assert.equal(metrics.formattedAvg, '0%');
  assert.equal(metrics.subText, 'No production records logged yet');
});

test('extractRecordWastageKg extracts from total fields or sums stage wastage fields', () => {
  // Direct total field
  const r1 = { totalWastageKg: 45.5 };
  assert.equal(extractRecordWastageKg(r1), 45.5);

  const r2 = { total_scrap_qty_kg: 32.1 };
  assert.equal(extractRecordWastageKg(r2), 32.1);

  // Stage fields fallback when total is 0 or omitted
  const r3 = {
    printingWastageKg: 10,
    printingPlainSettingWastageKg: 5,
    laminationPlainSubstrateWastageKg: 8,
    trimWastageKg: 12
  };
  assert.equal(extractRecordWastageKg(r3), 35);
});

test('extractRecordGrossKg extracts gross or sums net + wastage', () => {
  const r1 = { grossProductionKg: 1000 };
  assert.equal(extractRecordGrossKg(r1), 1000);

  const r2 = { netUsableKg: 950 };
  assert.equal(extractRecordGrossKg(r2, 50), 1000);
});

test('computeWeightedScrapPct computes true weighted percentage (totalScrap / totalGross * 100)', () => {
  // Job 1: 1000 kg gross, 50 kg scrap (5%)
  // Job 2: 4000 kg gross, 100 kg scrap (2.5%)
  // True weighted: (150 / 5000) * 100 = 3.0% (NOT arithmetic average of 5% and 2.5% = 3.75%)
  const records = [
    { grossProductionKg: 1000, totalWastageKg: 50 },
    { grossProductionKg: 4000, totalWastageKg: 100 }
  ];
  assert.equal(computeWeightedScrapPct(records), 3.0);
});

test('calculateScrapMetrics calculates current month and MoM change correctly', () => {
  const fixedNow = new Date('2026-11-20T10:00:00Z');

  const records = [
    // Current month: November 2026 -> 100 kg scrap / 2000 kg gross = 5.0%
    {
      recordedAt: '2026-11-10T08:00:00Z',
      grossProductionKg: 2000,
      totalWastageKg: 100
    },
    // Previous month: October 2026 -> 120 kg scrap / 2000 kg gross = 6.0%
    {
      recordedAt: '2026-10-15T08:00:00Z',
      grossProductionKg: 2000,
      totalWastageKg: 120
    }
  ];

  const metrics = calculateScrapMetrics(records, [], fixedNow);
  assert.equal(metrics.hasData, true);
  assert.equal(metrics.displayAvg, 5.0);
  assert.equal(metrics.formattedAvg, '5%');
  assert.equal(metrics.momDirection, 'down'); // Scrap decreased from 6% to 5%
  assert.equal(metrics.momChange, 1.0);
  assert.match(metrics.subText, /▼ -1% MoM \(Decrease\)/);
});

test('calculateScrapMetrics falls back to all-time average when current month has no runs yet', () => {
  const fixedNow = new Date('2026-11-20T10:00:00Z');

  // No November records, only October records
  const records = [
    {
      recordedAt: '2026-10-15T08:00:00Z',
      grossProductionKg: 1000,
      totalWastageKg: 45 // 4.5%
    },
    {
      recordedAt: '2026-10-20T08:00:00Z',
      grossProductionKg: 1000,
      totalWastageKg: 55 // 5.5%
    }
  ];

  const metrics = calculateScrapMetrics(records, [], fixedNow);
  assert.equal(metrics.hasData, true);
  assert.equal(metrics.isAllTimeFallback, true);
  assert.equal(metrics.displayAvg, 5.0);
  assert.equal(metrics.formattedAvg, '5%');
  assert.match(metrics.subText, /Plant all-time avg \(2 jobs logged\)/);
});
