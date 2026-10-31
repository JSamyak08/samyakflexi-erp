import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import {
  CONSUMABLES_STOCK_HEADERS,
  CONSUMABLES_STOCK_SHEET,
  buildConsumablesStockSheet,
  buildConsumablesStockWorkbook,
  consumablesStockFileName,
  mapConsumableStockRow,
} from '../src/utils/consumablesStockExport.js';

function item(overrides) {
  return {
    itemCode: 'CON-SPR-221',
    name: 'Doctor Blade 40mm',
    category: 'Printing Spares',
    unit: 'Nos',
    currentStock: 24,
    minReserve: 6,
    assignedMachine: 'Printing Press 2',
    location: 'Rack A-3',
    lastRestocked: '2026-10-28',
    ...overrides,
  };
}

test('stock rows keep quantities as numbers and format the restock date', () => {
  const row = mapConsumableStockRow(item());
  assert.equal(row['Item Code'], 'CON-SPR-221');
  assert.equal(row['Item Description'], 'Doctor Blade 40mm');
  assert.equal(row.Category, 'Printing Spares');
  assert.equal(row.Unit, 'Nos');
  assert.equal(row['Current Stock'], 24);
  assert.equal(typeof row['Current Stock'], 'number');
  assert.equal(row['Min Reserve Level'], 6);
  assert.equal(typeof row['Min Reserve Level'], 'number');
  assert.equal(row.Status, 'Stock Healthy (400%)');
  assert.equal(row['Assigned Machine'], 'Printing Press 2');
  assert.equal(row['Location Bin'], 'Rack A-3');
  assert.equal(row['Last Restocked'], '28/10/2026');

  const low = mapConsumableStockRow(item({
    currentStock: '18',
    minReserve: '80',
    unit: 'Litres',
    lastRestocked: '2026-10-31T20:30:00.000Z',
  }));
  assert.equal(low['Current Stock'], 18);
  assert.equal(low['Min Reserve Level'], 80);
  assert.equal(low.Status, 'Below Reserve (Reorder Needed)');
  assert.equal(low['Last Restocked'], '01/11/2026');
  assert.equal(mapConsumableStockRow(item({ lastRestocked: '' }))['Last Restocked'], '');
});

test('the workbook exports every given row, not a page, with numeric cells', () => {
  const rows = [
    item({ itemCode: 'LOW', name: 'Ethyl Acetate', currentStock: 2, minReserve: 10 }),
    item({ itemCode: 'OK', name: 'Adhesive', currentStock: 50.5, minReserve: 10, unit: 'Kg' }),
    item({ itemCode: 'BLANK', name: 'Uncounted', currentStock: null, minReserve: null, lastRestocked: null }),
  ];
  const sheet = buildConsumablesStockSheet(rows);
  assert.deepEqual(sheet[0], CONSUMABLES_STOCK_HEADERS);
  assert.equal(sheet.length, 4);
  assert.equal(sheet[1][0], 'LOW');
  assert.equal(sheet[2][4], 50.5);
  assert.equal(sheet[3][4], '');

  const workbook = buildConsumablesStockWorkbook(rows);
  const cells = workbook.Sheets[CONSUMABLES_STOCK_SHEET];
  assert.equal(cells.E2.t, 'n');
  assert.equal(cells.E2.v, 2);
  assert.equal(cells.F3.t, 'n');
  assert.equal(cells.F3.v, 10);
  assert.equal(cells.E4.v, '');
  assert.equal(cells.J2.v, '28/10/2026');

  const reread = XLSX.read(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' });
  const again = reread.Sheets[CONSUMABLES_STOCK_SHEET];
  assert.equal(again.A1.v, 'Item Code');
  assert.equal(again.E3.t, 'n');
  assert.equal(again.E3.v, 50.5);
  assert.equal(again.B2.v, 'Ethyl Acetate');
});

test('the file name uses the India calendar day', () => {
  assert.equal(
    consumablesStockFileName(new Date('2026-10-30T20:30:00.000Z')),
    'Consumables_Stock_2026-10-31.xlsx',
  );
});

test('the store button downloads the filtered list, not the current page', () => {
  const source = fs.readFileSync(new URL('../src/components/ConsumablesAndIndents.jsx', import.meta.url), 'utf8');
  assert.match(source, /data-testid="download-consumables-stock"/);
  assert.match(source, /Download Excel/);
  assert.match(source, /downloadConsumablesStockWorkbook\(sortedAndFilteredConsumables\)/);
  assert.doesNotMatch(source, /downloadConsumablesStockWorkbook\(consumablesPagination/);
});
