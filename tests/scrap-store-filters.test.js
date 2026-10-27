import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScrapFilters,
  buildScrapFilterContext,
  normalizeScrapFilters,
  paginateScrapRows,
  patchScrapFilters,
  planScrapServerQuery,
  rangeForPreset,
  scrapEntryDate,
  scrapFiltersToQuery,
  scrapSourceKind,
  scrapStoreCsv,
  scrapStoreE2eFixture,
  summarizeScrapRows
} from '../src/utils/scrapStoreFilters.js';
import { fetchScrapStoreItems } from '../src/services/businessRecords.js';

const NOW = new Date('2026-10-27T10:00:00+05:30');
const fixture = scrapStoreE2eFixture(NOW);

function view(filters) {
  const context = buildScrapFilterContext(fixture);
  return applyScrapFilters(fixture.rows, normalizeScrapFilters(filters, NOW), context);
}

test('IST presets use the plant calendar, including the April–March financial year', () => {
  assert.deepEqual(rangeForPreset('today', NOW), { from: '2026-10-27', to: '2026-10-27' });
  assert.deepEqual(rangeForPreset('yesterday', NOW), { from: '2026-10-26', to: '2026-10-26' });
  assert.deepEqual(rangeForPreset('week', NOW), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(rangeForPreset('month', NOW), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(rangeForPreset('last-month', NOW), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(rangeForPreset('fy', NOW), { from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(rangeForPreset('fy', new Date('2027-02-01T12:00:00+05:30')), { from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(rangeForPreset('today', new Date('2026-10-27T20:00:00.000Z')), { from: '2026-10-28', to: '2026-10-28' });
});

test('a timestamp is the IST calendar day and a date-only value stays that day', () => {
  assert.equal(scrapEntryDate({ date: '2026-10-27' }), '2026-10-27');
  assert.equal(scrapEntryDate({ timestamp: '2026-10-27T20:00:00.000Z' }), '2026-10-28');
  assert.equal(scrapEntryDate({ date: '27/10/2026' }), '2026-10-27');
  assert.equal(scrapSourceKind({ source: 'printing', stage: 'Printing' }), 'process');
  assert.equal(scrapSourceKind({ defectCategory: 'Delamination / Bonding Failure' }), 'qc');
  assert.equal(scrapSourceKind({ source: 'buyer-return' }), 'other');
});

test('default view totals every scrap row and counts a job once', () => {
  const result = view({});
  assert.equal(result.rows.length, 6);
  assert.equal(result.summary.totalKg, 48);
  assert.equal(result.summary.rowCount, 6);
  assert.equal(result.summary.jobCount, 3);
  assert.equal(result.summary.byStage.find((stage) => stage.stage === 'Printing').kg, 34);
  assert.equal(result.summary.byStage.find((stage) => stage.stage === 'QC Hold').count, 1);
});

test('this month plus a printing stage filter keeps the summary on that set', () => {
  const month = rangeForPreset('month', NOW);
  const result = view({ preset: 'custom', from: month.from, to: month.to, stage: 'Printing' });
  assert.deepEqual(result.rows.map((row) => row.id), [
    'print-scrap:ORD-2026-210:printing-wastage',
    'print-scrap:ORD-2026-210:plain-setting'
  ]);
  assert.equal(result.summary.totalKg, 32);
  assert.equal(result.summary.rowCount, 2);
  assert.equal(result.summary.jobCount, 1);
  assert.deepEqual(result.summary.byStage, [{ stage: 'Printing', kg: 32, count: 2 }]);
});

test('high scrap jobs only uses the registry threshold, not every scrap row', () => {
  const result = view({ high: true });
  assert.deepEqual(result.rows.map((row) => row.orderId), ['ORD-2026-210', 'ORD-2026-210', 'ORD-2026-210']);
  assert.equal(result.summary.totalKg, 35);
  assert.equal(result.summary.jobCount, 1);
  assert.equal(result.rows.every((row) => row.highScrap), true);
  const stages = Object.fromEntries(result.summary.byStage.map((stage) => [stage.stage, stage.kg]));
  assert.equal(stages.Printing, 32);
  assert.equal(stages.Slitting, 3);
});

test('source, customer, machine, job master, kg, status, and search narrow the same rows', () => {
  assert.equal(view({ source: 'qc' }).rows.length, 1);
  assert.equal(view({ source: 'qc' }).rows[0].barcode, 'QC-HOLD-211');
  assert.equal(view({ customer: 'Nyra Foods' }).summary.jobCount, 1);
  assert.equal(view({ machine: 'MAC-ROTO-1' }).rows.length, 3);
  assert.equal(view({ jobMasterId: 'JM-SONU' }).rows.length, 2);
  assert.deepEqual(view({ kgMin: '20', kgMax: '30' }).rows.map((row) => row.scrapQtyKg), [24]);
  assert.equal(view({ status: 'Disposed' }).rows[0].orderId, 'ORD-2026-199');
  assert.equal(view({ status: 'In stock' }).rows.some((row) => row.status === 'Disposed'), false);
  assert.equal(view({ q: 'QC-HOLD-211' }).rows.length, 1);
  assert.equal(view({ q: 'Nyra', orderId: '210' }).summary.rowCount, 3);
  assert.equal(view({ type: 'Laminate Wastage' }).rows.length, 1);
  assert.equal(view({ operator: 'Asha' }).rows.length, 1);
  assert.equal(view({ material: 'BOPP' }).rows.length, 1);
});

test('an IST timestamp on the next plant day stays out of the previous day', () => {
  const context = buildScrapFilterContext({ orders: [], jobMasters: [], machines: [], productionRecords: [] });
  const result = applyScrapFilters([
    { id: 'late', orderId: 'ORD-1', jobName: 'Late', scrapQtyKg: 1, date: '', timestamp: '2026-10-27T20:00:00.000Z', stage: 'Printing', source: 'printing', type: 'Printing Wastage' }
  ], { preset: 'custom', from: '2026-10-27', to: '2026-10-27' }, context);
  assert.equal(result.rows.length, 0);
});

test('clearing filters drops the query and pagination stays on the filtered length', () => {
  const current = normalizeScrapFilters({ preset: 'month', stage: 'Printing', high: true, page: 4 }, NOW);
  const cleared = patchScrapFilters(current, {
    preset: '', from: '', to: '', stage: '', high: false, page: 1
  }, NOW);
  assert.deepEqual(scrapFiltersToQuery(cleared), {});
  const page = paginateScrapRows(view({ stage: 'Slitting' }).rows, 3, 1);
  assert.equal(page.page, 1);
  assert.equal(page.total, 1);
});

test('csv export quotes the filtered rows and marks high scrap jobs', () => {
  const result = view({ high: true });
  const csv = scrapStoreCsv(result.rows);
  assert.ok(csv.startsWith('\uFEFFDate,Order No,'));
  assert.match(csv, /"ORD-2026-210"/);
  assert.match(csv, /"Yes"/);
  assert.doesNotMatch(csv, /ORD-2026-211/);
  assert.match(csv, /"Printing wastage recorded for ORD-2026-210"/);
});

test('server plan narrows by stage and high-scrap order ids, and refuses an empty registry', () => {
  const context = buildScrapFilterContext(fixture);
  const plan = planScrapServerQuery(normalizeScrapFilters({ stage: 'Printing', high: true }, NOW), context);
  assert.equal(plan.empty, false);
  assert.deepEqual(plan.steps.find((step) => step[0] === 'eq'), ['eq', 'payload->>stage', 'Printing']);
  const orderStep = plan.steps.find((step) => step[0] === 'in' && step[1] === 'payload->>orderId');
  assert.deepEqual(orderStep[2], ['ORD-2026-210']);
  const none = planScrapServerQuery(normalizeScrapFilters({ high: true }), buildScrapFilterContext({}));
  assert.equal(none.empty, true);
});

function fakeSupabase(responses) {
  const calls = [];
  let index = 0;
  return {
    calls,
    from(table) {
      const ops = [];
      const query = {
        select(...args) { ops.push(['select', args]); return query; },
        order(...args) { ops.push(['order', args]); return query; },
        eq(...args) { ops.push(['eq', args]); return query; },
        gte(...args) { ops.push(['gte', args]); return query; },
        lte(...args) { ops.push(['lte', args]); return query; },
        in(...args) { ops.push(['in', args]); return query; },
        or(...args) { ops.push(['or', args]); return query; },
        then(resolve, reject) {
          calls.push({ table, ops });
          const response = responses[index] || { data: [], error: null, count: 0 };
          index += 1;
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return query;
    }
  };
}

test('fetch applies the server stage filter and still drops rows the server returns outside it', async () => {
  const context = buildScrapFilterContext(fixture);
  const client = fakeSupabase([
    { data: null, error: null, count: 6 },
    {
      data: fixture.rows.filter((row) => row.stage === 'Printing' || row.id === 'SCRAP-ITEM-QC-211').map((row) => ({ id: row.id, payload: row })),
      error: null
    }
  ]);
  const result = await fetchScrapStoreItems(client, { stage: 'Printing' }, context);
  assert.equal(result.source, 'server');
  assert.equal(result.totalCount, 6);
  assert.equal(result.rows.every((row) => row.stageLabel === 'Printing'), true);
  assert.equal(result.summary.rowCount, 3);
  const stageCall = client.calls[1].ops.find((op) => op[0] === 'eq');
  assert.deepEqual(stageCall[1], ['payload->>stage', 'Printing']);
});

test('a rejected server filter falls back to the full table and still filters', async () => {
  const context = buildScrapFilterContext(fixture);
  const client = fakeSupabase([
    { data: null, error: null, count: 6 },
    { data: null, error: { message: 'operator does not exist' } },
    { data: fixture.rows.map((row) => ({ id: row.id, payload: row })), error: null }
  ]);
  const result = await fetchScrapStoreItems(client, { stage: 'Printing' }, context);
  assert.equal(result.source, 'fallback');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.every((row) => row.stageLabel === 'Printing'), true);
  assert.equal(client.calls.length, 3);
});
