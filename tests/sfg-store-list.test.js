import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateFullRolePermissions } from '../src/factoryStore.js';
import { roleCanEditSfgStore } from '../src/bootAccess.js';
import { sfgStoreUi } from '../src/sfgStoreAccess.js';
import { applyScrapFilters, buildScrapFilterContext, paginateScrapRows } from '../src/utils/scrapStoreFilters.js';
import {
  SFG_STORE_GROUP_PAGE_SIZE,
  filterSfgStoreItems,
  groupSfgStoreItems,
  pageSfgOrderGroups,
  sortSfgStoreItems
} from '../src/utils/sfgStoreList.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function batch(index, extra = {}) {
  return {
    id: `id-${index}`,
    sfgBatchCode: `SFG-BC-${index}`,
    orderId: `ORD-${String(index).padStart(3, '0')}`,
    jobName: `Job ${index}`,
    jobCode: `JOB-${index}`,
    clientName: `Client ${index}`,
    sfgType: 'Printed Rolls',
    status: 'In Stock (WIP)',
    filmType: 'PET',
    micron: 12,
    widthMm: 460,
    totalNetKg: 10,
    consumedKg: 1,
    availableKg: 9,
    ...extra
  };
}

function storeOf(count) {
  return Array.from({ length: count }, (_, index) => batch(index));
}

test('search reads the whole store, including a job past the old 10-row page', () => {
  const items = storeOf(37);
  items[36] = batch(36, {
    orderId: 'ORD-2026-180',
    jobName: 'Top Meal Green Peas 400gm',
    jobCode: 'ORD-2026-180',
    clientName: 'Zain Natural Agro India Pvt Ltd',
    sfgBatchCode: 'SFG-LOT-ORD-2636-182',
    childRolls: [{ barcodeId: 'SFG-BC-ORD-2026-180-1', rollNo: 1, rollCode: 'R1' }],
    inputBarcodeIds: ['RM-BC-180']
  });

  assert.equal(filterSfgStoreItems(items, {}).length, 37);
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'top' }).length, 1);
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'TOP MEAL' })[0].orderId, 'ORD-2026-180');
  assert.equal(filterSfgStoreItems(items, { searchTerm: '#ORD-2026-180' })[0].sfgBatchCode, 'SFG-LOT-ORD-2636-182');
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'zain' })[0].clientName, 'Zain Natural Agro India Pvt Ltd');
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'SFG-LOT-ORD-2636-182' })[0].id, 'id-36');
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'SFG-BC-ORD-2026-180-1' })[0].id, 'id-36');
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'R1' })[0].id, 'id-36');
  assert.equal(filterSfgStoreItems(items, { searchTerm: 'RM-BC-180' })[0].id, 'id-36');
  assert.deepEqual(filterSfgStoreItems(items, { searchTerm: 'no-such-batch' }), []);

  items[2] = batch(2, { status: 'Fully Consumed', sfgType: 'Finished Goods' });
  items[30] = batch(30, { status: 'Fully Consumed', sfgType: 'Printed Rolls' });
  const consumed = filterSfgStoreItems(items, { statusFilter: 'Fully Consumed' });
  assert.deepEqual(consumed.map((item) => item.id), ['id-2', 'id-30']);
  const finished = filterSfgStoreItems(items, { typeFilter: 'Finished Goods' });
  assert.deepEqual(finished.map((item) => item.id), ['id-2']);
});

test('the default store order is the later activity timestamp, then id descending', () => {
  const olderCreated = {
    id: '00000000-0000-4000-8000-000000000001',
    orderId: 'ORD-OLD',
    jobName: 'Older Job',
    sfgBatchCode: 'SFG-OLD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const modifiedLater = {
    id: '00000000-0000-4000-8000-000000000003',
    orderId: 'ORD-OLD',
    jobName: 'Older Job',
    sfgBatchCode: 'SFG-TOUCHED',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-12-01T00:00:00.000Z'
  };
  const createdLaterThanItsUpdate = {
    id: '00000000-0000-4000-8000-000000000002',
    orderId: 'ORD-MID',
    jobName: 'Mid Job',
    sfgBatchCode: 'SFG-MID',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  };
  const sameActivityLowerId = {
    id: '00000000-0000-4000-8000-000000000010',
    orderId: 'ORD-TIE',
    jobName: 'Tie Low',
    sfgBatchCode: 'SFG-TIE-LOW',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
  const sameActivityHigherId = {
    id: '00000000-0000-4000-8000-000000000020',
    orderId: 'ORD-TIE',
    jobName: 'Tie High',
    sfgBatchCode: 'SFG-TIE-HIGH',
    createdDate: '2026-05-01T00:00:00.000Z'
  };
  const rollOnly = {
    id: '00000000-0000-4000-8000-000000000004',
    orderId: 'ORD-ROLL',
    jobName: 'Roll Job',
    sfgBatchCode: 'SFG-ROLL',
    inwardDatetime: '2026-04-01T08:00:00.000Z'
  };
  const undated = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    orderId: 'ORD-NONE',
    jobName: 'No Stamp',
    sfgBatchCode: 'SFG-NONE'
  };
  const input = [
    olderCreated,
    createdLaterThanItsUpdate,
    sameActivityLowerId,
    rollOnly,
    undated,
    modifiedLater,
    sameActivityHigherId
  ];
  const snapshot = input.map((item) => ({ ...item }));
  const sorted = sortSfgStoreItems(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(sorted.map((item) => item.sfgBatchCode), [
    'SFG-TOUCHED',
    'SFG-MID',
    'SFG-TIE-HIGH',
    'SFG-TIE-LOW',
    'SFG-ROLL',
    'SFG-OLD',
    'SFG-NONE'
  ]);
  assert.deepEqual(sortSfgStoreItems(null), []);
  assert.deepEqual(sortSfgStoreItems(undefined), []);

  const groups = groupSfgStoreItems(sorted, []);
  assert.deepEqual(groups.map((group) => group.orderKey), [
    'ORD-OLD',
    'ORD-MID',
    'ORD-TIE',
    'ORD-ROLL',
    'ORD-NONE'
  ]);
  assert.deepEqual(groups[0].items.map((item) => item.sfgBatchCode), ['SFG-TOUCHED', 'SFG-OLD']);
  assert.deepEqual(groups[3].items.map((item) => item.id), [rollOnly.id]);

  const finishedOnly = filterSfgStoreItems(sorted, { typeFilter: 'Finished Goods' });
  assert.deepEqual(finishedOnly, []);
  const searched = filterSfgStoreItems(sorted, { searchTerm: 'tie' });
  assert.deepEqual(searched.map((item) => item.sfgBatchCode), ['SFG-TIE-HIGH', 'SFG-TIE-LOW']);
});

test('order groups keep every roll and the pager counts groups, not a fixed first page', () => {
  const others = storeOf(15);
  const rolls = Array.from({ length: 12 }, (_, index) => batch(100 + index, {
    orderId: 'ORD-2026-180',
    jobName: 'Top Meal Green Peas 400gm',
    jobCode: 'ORD-2026-180',
    clientName: 'Zain Natural Agro India Pvt Ltd',
    sfgBatchCode: index === 0 ? 'SFG-LOT-ORD-2636-182' : `SFG-ROLL-180-${index}`,
    totalNetKg: 10 + index,
    consumedKg: index,
    availableKg: 10
  }));
  const items = [...others, ...rolls];
  const orders = [{
    id: 'ORD-2026-180',
    quantityKg: 500,
    unit: 'Kg',
    orderDate: '2026-10-17T00:00:00.000Z'
  }];
  const groups = groupSfgStoreItems(filterSfgStoreItems(items, { searchTerm: '' }), orders);
  assert.equal(groups.length, 16);
  assert.equal(groups.reduce((sum, group) => sum + group.items.length, 0), 27);

  const big = groups.find((group) => group.orderKey === 'ORD-2026-180');
  assert.equal(big.items.length, 12);
  assert.equal(big.orderQty, 500);
  assert.equal(big.orderQtyUnit, 'Kg');
  assert.equal(big.orderDate, '2026-10-17');
  assert.equal(big.totalNetKg, rolls.reduce((sum, roll) => sum + roll.totalNetKg, 0));

  const first = pageSfgOrderGroups(groups, 1, 10);
  const second = pageSfgOrderGroups(groups, 2, 10);
  assert.equal(SFG_STORE_GROUP_PAGE_SIZE, 25);
  assert.equal(first.total, 16);
  assert.equal(first.totalPages, 2);
  assert.equal(first.groups.length, 10);
  assert.equal(first.groups.some((group) => group.orderKey === 'ORD-2026-180'), false);
  assert.equal(second.rangeStart, 11);
  assert.equal(second.rangeEnd, 16);
  const pagedBig = second.groups.find((group) => group.orderKey === 'ORD-2026-180');
  assert.equal(pagedBig.items.length, 12);
  assert.deepEqual(pagedBig.items.map((item) => item.sfgBatchCode), rolls.map((roll) => roll.sfgBatchCode));

  const seen = new Set();
  for (let page = 1; page <= second.totalPages; page += 1) {
    pageSfgOrderGroups(groups, page, 10).groups.forEach((group) => {
      group.items.forEach((item) => seen.add(item.id));
    });
  }
  assert.equal(seen.size, items.length);

  const searched = groupSfgStoreItems(filterSfgStoreItems(items, { searchTerm: 'top' }), orders);
  assert.equal(searched.length, 1);
  assert.equal(searched[0].items.length, 12);
  const empty = pageSfgOrderGroups(groupSfgStoreItems(filterSfgStoreItems(items, { searchTerm: 'missing' })), 4, 25);
  assert.equal(empty.empty, true);
  assert.equal(empty.total, 0);
  assert.equal(empty.totalPages, 1);
  assert.equal(empty.currentPage, 1);
  assert.deepEqual(empty.groups, []);
});

test('the store screen pages filtered order groups and the other tabs do not slice to 10', () => {
  const screen = fs.readFileSync(path.join(root, 'src/components/SFGStoreManagement.jsx'), 'utf8');
  assert.match(screen, /filterSfgStoreItems\(allSfgItems/);
  assert.match(screen, /sortSfgStoreItems\(omitPrintedLotChildren\(cleanList\)\)/);
  assert.doesNotMatch(screen, /sortInventoryByFifo\(/);
  assert.match(screen, /groupSfgStoreItems\(filteredItems,\s*orders\)/);
  assert.match(screen, /usePagination\(groupedOrders,\s*SFG_STORE_GROUP_PAGE_SIZE\)/);
  assert.match(screen, /<TablePagination pagination=\{groupPagination\} \/>/);
  assert.match(screen, /const expandAllOrders = \(\) => \{[\s\S]*?groupedOrders\.forEach/);
  assert.match(screen, /const collapseAllOrders = \(\) => \{[\s\S]*?groupedOrders\.forEach/);
  assert.match(screen, /qcHoldItems\.map\(\(item\)/);
  assert.doesNotMatch(screen, /usePagination\(groupedOrders,\s*10\)/);
  assert.doesNotMatch(screen, /qcHoldItems\.slice\(/);
  assert.doesNotMatch(screen, /filteredItems\.slice\(0,\s*10\)/);

  const service = fs.readFileSync(path.join(root, 'src/services/supabaseDataService.js'), 'utf8');
  const fetchSfg = service.slice(
    service.indexOf('export async function fetchSFGGoodsFromSupabase'),
    service.indexOf('export function buildSfgNotesEnvelope')
  );
  assert.match(fetchSfg, /from\('sfg_goods'\)\.select\('\*'\)/);
  assert.match(fetchSfg, /updatedAt: item\.updated_at \|\| null/);
  assert.doesNotMatch(fetchSfg, /\.limit\(|\.range\(/);

  const records = fs.readFileSync(path.join(root, 'src/services/businessRecords.js'), 'utf8');
  const fetchPayload = records.slice(
    records.indexOf('export async function fetchPayloadRecords'),
    records.indexOf('async function countPayloadRows')
  );
  assert.doesNotMatch(fetchPayload, /\.limit\(|\.range\(/);

  const scrapPanel = fs.readFileSync(path.join(root, 'src/components/ScrapStorePanel.jsx'), 'utf8');
  assert.match(scrapPanel, /paginateScrapRows\(rows,\s*filters\.page,\s*pageSize\)/);
  assert.match(scrapPanel, /totalItems=\{paged\.total\}/);
  assert.match(scrapPanel, /pageSize=\{pageSize\}/);

  const defaults = generateFullRolePermissions(false);
  ['Printing Operator', 'Shop Floor Operator'].forEach((role) => {
    assert.equal(roleCanEditSfgStore(defaults, role), false);
    const view = sfgStoreUi(false);
    assert.equal(view.canSearch, true);
    assert.equal(view.canFilter, true);
    assert.equal(view.canConsume, false);
    assert.equal(view.canMove, false);
    assert.equal(view.canScrap, false);
  });
  assert.match(screen, /storeUi\.canConsume/);
  assert.match(screen, /data-testid="sfg-store-search"/);
  assert.match(screen, /data-testid="sfg-store-view-only"/);
});

test('scrap search and paging use the filtered rows, including rows past the first page', () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    id: `scrap-${index}`,
    orderId: `ORD-${index}`,
    jobName: index === 27 ? 'Top Meal Green Peas 400gm' : `Job ${index}`,
    clientName: index === 27 ? 'Zain Natural Agro India Pvt Ltd' : `Client ${index}`,
    barcodeId: `SCRAP-BC-${index}`,
    scrapQtyKg: 1,
    date: '2026-10-01',
    source: 'printing',
    stage: 'Printing',
    type: 'Printing Wastage'
  }));
  const found = applyScrapFilters(rows, { q: 'top' }, buildScrapFilterContext());
  assert.equal(found.rows.length, 1);
  assert.equal(found.rows[0].id, 'scrap-27');
  const foundPage = paginateScrapRows(found.rows, 1, 25);
  assert.equal(foundPage.total, 1);
  assert.equal(foundPage.rows[0].jobName, 'Top Meal Green Peas 400gm');

  const all = applyScrapFilters(rows, {}, buildScrapFilterContext());
  assert.equal(all.rows.length, 30);
  const first = paginateScrapRows(all.rows, 1, 10);
  const second = paginateScrapRows(all.rows, 2, 10);
  assert.equal(second.total, 30);
  assert.equal(second.pages, 3);
  assert.equal(second.rows.length, 10);
  const firstIds = new Set(first.rows.map((row) => row.id));
  assert.equal(second.rows.every((row) => !firstIds.has(row.id)), true);
  assert.equal(paginateScrapRows(all.rows, 3, 10).rows.length, 10);
});

function count(html, needle) {
  return html.split(needle).length - 1;
}

test('the rendered list footer counts order groups and shows every roll in a group', async (t) => {
  const { createServer } = await import('vite');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const server = await createServer({
    configFile: path.join(root, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  });
  t.after(() => server.close());
  const loaded = await server.ssrLoadModule('/src/components/SFGStoreManagement.jsx');
  const render = (props) => renderToStaticMarkup(React.createElement(loaded.default, props));
  const many = render({
    sfgGoods: storeOf(37),
    canEditStore: true,
    previewScrapItems: []
  });
  assert.equal(count(many, 'data-testid="sfg-order-group"'), SFG_STORE_GROUP_PAGE_SIZE);
  assert.equal(count(many, 'data-testid="sfg-order-roll"'), SFG_STORE_GROUP_PAGE_SIZE);
  assert.match(many, /37 <span[^>]*>Batches/);
  assert.match(many, /Page 1 of 2/);
  assert.match(many, /of <strong[^>]*>37<\/strong> records/);
  assert.doesNotMatch(many, /No records found/);
  assert.match(many, /Expand All/);
  assert.match(many, /Collapse All/);
  assert.match(many, /data-testid="sfg-consume"/);

  const rolls = Array.from({ length: 12 }, (_, index) => batch(index, {
    orderId: 'ORD-2026-180',
    jobName: 'Top Meal Green Peas 400gm',
    jobCode: 'ORD-2026-180',
    clientName: 'Zain Natural Agro India Pvt Ltd',
    sfgBatchCode: index === 0 ? 'SFG-LOT-ORD-2636-182' : `SFG-ROLL-180-${index}`,
    childRolls: index === 0 ? [{ barcodeId: 'SFG-BC-ORD-2026-180-1', rollNo: 1 }] : undefined
  }));
  const one = render({ sfgGoods: rolls, canEditStore: false, previewScrapItems: [] });
  assert.equal(count(one, 'data-testid="sfg-order-group"'), 1);
  assert.equal(count(one, 'data-testid="sfg-order-roll"'), 12);
  assert.match(one, /SFG-LOT-ORD-2636-182/);
  assert.match(one, /SFG-BC-ORD-2026-180-1/);
  assert.match(one, /SFG-ROLL-180-11/);
  assert.match(one, /Top Meal Green Peas 400gm/);
  assert.match(one, /Page 1 of 1/);
  assert.match(one, /of <strong[^>]*>1<\/strong> records/);
  assert.doesNotMatch(one, /No records found/);
  assert.match(one, /data-testid="sfg-store-search"/);
  assert.match(one, /data-testid="sfg-store-view-only"/);
  assert.doesNotMatch(one, /data-testid="sfg-consume"/);

  const ordered = render({
    sfgGoods: [
      batch(1, {
        id: '00000000-0000-4000-8000-000000000001',
        orderId: 'ORD-OLD',
        jobName: 'Older Store Job',
        sfgBatchCode: 'SFG-OLD-ROW',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z'
      }),
      batch(2, {
        id: '00000000-0000-4000-8000-000000000002',
        orderId: 'ORD-NEW',
        jobName: 'Newest Store Job',
        sfgBatchCode: 'SFG-NEW-ROW',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z'
      })
    ],
    canEditStore: true,
    previewScrapItems: []
  });
  assert.ok(ordered.indexOf('Newest Store Job') < ordered.indexOf('Older Store Job'));
  assert.ok(ordered.indexOf('SFG-NEW-ROW') < ordered.indexOf('SFG-OLD-ROW'));

  const empty = render({ sfgGoods: [], canEditStore: false, previewScrapItems: [] });
  assert.equal(count(empty, 'data-testid="sfg-order-group"'), 0);
  assert.match(empty, /No records found/);
  assert.match(empty, /No SFG or FG inventory batches found/);
  assert.match(empty, /Page 1 of 1/);
});
