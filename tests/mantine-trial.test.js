import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MANTINE_TRIAL_STORAGE_KEY,
  canToggleMantineTrial,
  classicUiForced,
  mantineTrialActive,
  readMantineTrialPreference,
  writeMantineTrialPreference,
} from '../src/utils/mantineTrial.js';
import { presentStockRow } from '../src/components/inventoryTrial/stockRowModel.js';
import { presentFifoLines } from '../src/components/inventoryTrial/fifoLines.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    dump: () => data,
  };
}

test('the new stock table stays off until an Admin or Plant Manager turns it on for this device', () => {
  const storage = memoryStorage();
  assert.equal(readMantineTrialPreference(storage), false);
  assert.equal(classicUiForced(''), false);
  assert.equal(classicUiForced('?ui=classic'), true);
  assert.equal(canToggleMantineTrial({ role: 'Admin' }), true);
  assert.equal(canToggleMantineTrial({ role: 'Plant Manager' }), true);
  assert.equal(canToggleMantineTrial({ role: 'Production Manager' }), false);
  assert.equal(canToggleMantineTrial({ role: 'Shop Floor Operator' }), false);
  assert.equal(canToggleMantineTrial({ role: 'Store Manager' }), false);

  assert.equal(mantineTrialActive({ user: { role: 'Admin' }, storage, search: '' }), false);
  writeMantineTrialPreference(storage, true);
  assert.equal(storage.dump()[MANTINE_TRIAL_STORAGE_KEY], '1');
  assert.equal(mantineTrialActive({ user: { role: 'Admin' }, storage, search: '' }), true);
  assert.equal(mantineTrialActive({ user: { role: 'Plant Manager' }, storage, search: '' }), true);
  assert.equal(mantineTrialActive({ user: { role: 'Production Manager' }, storage, search: '' }), false);
  assert.equal(mantineTrialActive({ user: { role: 'Shop Floor Operator' }, storage, search: '' }), false);
  assert.equal(mantineTrialActive({ user: { role: 'Admin' }, storage, search: '?ui=classic' }), false);
  writeMantineTrialPreference(storage, false);
  assert.equal(mantineTrialActive({ user: { role: 'Admin' }, storage, search: '' }), false);
});

test('a stock row keeps free quantity, reservation, pending QC, and over-aged status', () => {
  const names = [];
  const row = presentStockRow({
    id: 'INV-1',
    primaryId: 'INV-1',
    itemName: 'PET Film',
    itemCode: 'PET-12',
    category: 'Film Substrates',
    filmType: 'PET',
    micron: 12,
    widthMm: 1000,
    unit: 'kg',
    availableQtyKg: 80,
    allocatedQtyKg: 10,
    reorderLevelKg: 100,
    unitPrice: 50,
    location: 'Bay A',
    lastVendor: 'Acme',
    lastBatch: 'B-1',
    allInventoryIds: ['INV-1'],
  }, {
    formatFilmItemName: (...args) => {
      names.push(args);
      return 'PET 12 Micron';
    },
    reservedKg: 30,
    pendingQcQty: 5,
    inventoryRolls: [{ itemId: 'INV-1', barcodeId: 'RM-1', category: 'Film Substrates' }],
    rollFifoIndex: new Map([[
      'rm-1',
      { balanceQty: 20, origin: new Date('2020-01-01T00:00:00.000Z'), display: { ageDays: 400, frozen: false } },
    ]]),
    ageingSettings: { 'Film Substrates': 90 },
    selectedIds: new Set(['INV-1']),
  });

  assert.deepEqual(names[0].slice(0, 3), ['PET', 1000, 12]);
  assert.equal(row.title, 'PET 12 Micron');
  assert.equal(row.usableFreeStock, 50);
  assert.equal(row.effectiveAllocated, 40);
  assert.equal(row.pendingQcQty, 5);
  assert.equal(row.itemValuation, 4000);
  assert.equal(row.status, 'LOW STOCK');
  assert.equal(row.isOverAged, true);
  assert.equal(row.rowSelected, true);
  assert.equal(row.rowArchived, false);
  assert.equal(row.specs, '12 Micron × 1000mm');
});

test('zero stock with pending QC is not shown as a plain low-stock row', () => {
  const row = presentStockRow({
    id: 'INV-2',
    itemName: 'Solvent',
    category: 'Chemicals & Solvents',
    availableQtyKg: 0,
    reorderLevelKg: 10,
    unit: 'kg',
  }, {
    formatFilmItemName: () => { throw new Error('film name is not used'); },
    pendingQcQty: 12,
    reservedKg: 0,
  });
  assert.equal(row.title, 'Solvent');
  assert.equal(row.status, 'GRN Inward (Pending QC)');
  assert.equal(row.freeStockColor, '#d97706');
  assert.equal(row.isOverAged, false);
});

test('an archived stock row stays marked archived', () => {
  const row = presentStockRow({
    id: 'INV-3',
    itemName: 'Tape',
    category: 'Tapes & Consumables',
    availableQtyKg: 4,
    reorderLevelKg: 1,
    isActive: false,
  }, { formatFilmItemName: () => 'unused', reservedKg: 0, pendingQcQty: 0 });
  assert.equal(row.rowArchived, true);
  assert.equal(row.status, 'IN STOCK');
});

test('FIFO lines keep the oldest in-stock barcode as consume-first', () => {
  const older = {
    roll: { barcodeId: 'RM-OLD' },
    fifo: { balanceQty: 8, origin: new Date('2024-01-01T00:00:00.000Z'), display: { ageDays: 100, frozen: false } },
  };
  const newer = {
    roll: { barcodeId: 'RM-NEW' },
    fifo: { balanceQty: 3, origin: new Date('2025-06-01T00:00:00.000Z'), display: { ageDays: 10, frozen: false } },
  };
  const lines = presentFifoLines([older, newer], 'kg', (iso) => iso.slice(0, 10));
  assert.equal(lines[0].code, 'RM-OLD');
  assert.equal(lines[0].prefer, true);
  assert.equal(lines[0].ageText, '100 days');
  assert.equal(lines[0].qtyText, '8.00 kg');
  assert.equal(lines[1].prefer, false);
  assert.equal(lines[1].originText, '2025-06-01');
});

test('the phone ledger header does not stretch the title into a gap above Close', () => {
  const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const marker = '.rm-stock-ledger-header {';
  const start = css.indexOf(marker);
  assert.ok(start > 0);
  const rule = css.slice(start, css.indexOf('.rm-ledger-kpi-grid', start));
  assert.match(rule, /flex-direction:\s*column/);
  assert.match(rule, /\.rm-stock-ledger-header > :first-child\s*\{[^}]*flex:\s*none\s*!important/);
  const desktop = css.slice(0, start);
  assert.doesNotMatch(desktop, /\.rm-stock-ledger-header > :first-child/);
});

test('the trial loads Mantine table styles only, and only behind the switch', () => {
  const pilot = fs.readFileSync(new URL('../src/components/inventoryTrial/MantinePilot.jsx', import.meta.url), 'utf8');
  const inventory = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  assert.match(pilot, /@mantine\/core\/styles\/Table\.css/);
  assert.match(pilot, /@mantine\/core\/styles\/global\.css/);
  assert.doesNotMatch(pilot, /styles\.css/);
  assert.doesNotMatch(pilot, /styles\.layer\.css/);
  assert.doesNotMatch(pilot, /baseline\.css/);
  assert.match(pilot, /forceColorScheme="light"/);
  assert.match(pilot, /cssVariablesSelector="\.mantine-pilot"/);
  assert.match(pilot, /lightOnlyColorSchemeManager/);
  assert.doesNotMatch(inventory, /@mantine\/core/);
  assert.match(inventory, /lazy\(\(\) => import\('\.\/inventoryTrial\/InventoryTrialViews\.jsx'\)/);
  assert.match(inventory, /data-testid="mantine-trial-switch"/);
  assert.match(inventory, /data-testid="stock-register-classic"/);
  assert.match(inventory, /data-testid="barcode-fifo-line"/);
  assert.match(inventory, /ModalOverlay/);
});
