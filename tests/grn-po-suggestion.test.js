import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  blankPoFilledGrnFields,
  describePoForSuggestion,
  filmStockIdForPoItem,
  grnFieldsFromPo,
  planPoSelection,
  planVendorPick
} from '../src/services/grnPoSuggestion.js';

const filmPo = {
  poNumber: 'SIL/PO/26-27/1941',
  category: 'Film Substrates',
  promisedDeliveryDate: '12 Nov 2026',
  items: [{ filmType: 'PET', micron: 12, widthMm: 1000, qtyKg: 1000, rate: 145.5 }]
};

const solventPo = {
  poNumber: 'SIL/PO/26-27/2002',
  category: 'Chemicals & Solvents',
  items: [{ itemDesc: 'Ethyl Acetate', qtyKg: 200, rate: 80, itemId: 'SOLV-1' }]
};

test('picking a vendor only suggests POs and does not fill the form', () => {
  const one = planVendorPick(['SIL/PO/26-27/1941']);
  assert.equal(one.fillForm, false);
  assert.deepEqual(one.suggestedPoNumbers, ['SIL/PO/26-27/1941']);

  const several = planVendorPick(['PO-A', '', 'PO-B']);
  assert.equal(several.fillForm, false);
  assert.deepEqual(several.suggestedPoNumbers, ['PO-A', 'PO-B']);

  assert.deepEqual(planVendorPick([]), { fillForm: false, suggestedPoNumbers: [] });
});

test('a suggestion carries the PO number and the details a store user needs', () => {
  const awaiting = describePoForSuggestion(filmPo, {
    status: 'Awaiting Delivery',
    totalQty: 1000,
    pendingQty: 1000,
    inwardQty: 0
  });
  assert.equal(awaiting.poNumber, 'SIL/PO/26-27/1941');
  assert.equal(awaiting.category, 'Film Substrates');
  assert.equal(awaiting.itemsSummary, 'PET');
  assert.match(awaiting.statusText, /Awaiting delivery/);
  assert.match(awaiting.statusText, /1000 kg/);
  assert.equal(awaiting.qtyText, '1000 kg still to receive');
  assert.match(awaiting.rateText, /145\.5/);
  assert.equal(awaiting.promisedText, 'Promised 12 Nov 2026');

  const partial = describePoForSuggestion(solventPo, {
    status: 'Partially Received',
    totalQty: 200,
    pendingQty: 50,
    inwardQty: 150
  });
  assert.equal(partial.poNumber, 'SIL/PO/26-27/2002');
  assert.equal(partial.itemsSummary, 'Ethyl Acetate');
  assert.match(partial.statusText, /Partly received, 150 of 200 kg/);
  assert.equal(partial.qtyText, '50 kg still to receive');
});

test('confirming a PO fills its fields, and clearing drops only those fields', () => {
  assert.deepEqual(planPoSelection('SIL/PO/26-27/1941'), {
    action: 'confirm',
    fillForm: true,
    clearAppliedFields: true,
    poNumber: 'SIL/PO/26-27/1941'
  });
  assert.equal(planPoSelection('').fillForm, false);
  assert.equal(planPoSelection('').action, 'clear');
  assert.equal(planPoSelection('__MANUAL__').action, 'manual');
  assert.equal(planPoSelection('__MANUAL__').fillForm, false);

  const filled = grnFieldsFromPo(filmPo, {
    pendingQty: 400,
    filmStockId: 'INVT-0010',
    formatFilmItemName: (type, width, micron) => `${type}-${width}-${micron}`
  });
  assert.equal(filled.poNumber, 'SIL/PO/26-27/1941');
  assert.equal(filled.category, 'Film Substrates');
  assert.equal(filled.filmType, 'PET');
  assert.equal(filled.micron, 12);
  assert.equal(filled.widthMm, 1000);
  assert.equal(filled.itemName, 'PET-1000-12');
  assert.equal(filled.itemSearchTerm, 'PET-1000-12');
  assert.equal(filled.stockItemId, 'INVT-0010');
  assert.equal(filled.purchaseRate, 145.5);
  assert.equal(filled.weightKg, 400);

  const replaced = grnFieldsFromPo(solventPo, { pendingQty: 50 });
  assert.equal(replaced.category, 'Chemicals & Solvents');
  assert.equal(replaced.itemName, 'Ethyl Acetate');
  assert.equal(replaced.stockItemId, 'SOLV-1');
  assert.equal(replaced.filmType, 'PET');
  assert.equal(replaced.micron, '');
  assert.equal(replaced.widthMm, '');
  assert.equal(replaced.purchaseRate, 80);
  assert.equal(replaced.weightKg, 50);
  assert.notEqual(replaced.itemName, filled.itemName);

  const cleared = blankPoFilledGrnFields();
  assert.equal(cleared.poNumber, '');
  assert.equal(cleared.category, '');
  assert.equal(cleared.purchaseRate, '');
  assert.equal(cleared.itemName, '');
  assert.equal(cleared.itemSearchTerm, '');
  assert.equal(cleared.stockItemId, '');
  assert.equal(cleared.weightKg, '');
  assert.equal(cleared.micron, '');
  assert.equal(cleared.widthMm, '');
  assert.equal(cleared.filmType, 'PET');
  assert.equal(Object.hasOwn(cleared, 'invoiceNo'), false);
});

test('film stock is linked only when category, type, micron, and width match', () => {
  const inventory = [
    { id: 'INVT-9', category: 'Film Substrates', filmType: 'ldpe', micron: 12, widthMm: 1000 },
    { id: 'INVT-10', category: 'Film Substrates', filmType: 'PET', micron: 12, widthMm: 1000 }
  ];
  assert.equal(filmStockIdForPoItem(inventory, filmPo.items[0]), 'INVT-10');
  assert.equal(filmStockIdForPoItem(inventory, { filmType: 'PET', micron: 15, widthMm: 1000 }), '');
  assert.equal(filmStockIdForPoItem(inventory, null), '');
});

test('the GRN popup suggests a PO at the top and does not auto-fill on vendor pick', () => {
  const source = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  const suggestion = fs.readFileSync(new URL('../src/components/GrnPoSuggestion.jsx', import.meta.url), 'utf8');
  const modal = source.slice(
    source.indexOf('{/* Modal: New Inward GRN */}'),
    source.indexOf('{/* Confirmation Pop-Up Modal before saving Inward GRN */}')
  );
  const bannerAt = modal.indexOf('<GrnPoSuggestion');
  const formAt = modal.indexOf('<form onSubmit={handleSaveGRN}>');
  assert.ok(bannerAt > 0 && formAt > bannerAt, 'suggestion callout is the first thing inside the popup, above the form');

  const vendorHandler = source.slice(
    source.indexOf('placeholder="Select or search vendor"'),
    source.indexOf('Ref PO Number')
  );
  assert.match(vendorHandler, /handleGrnVendorChange/);
  assert.doesNotMatch(vendorHandler, /handleSelectPoForGrn/);

  const toggleLabel = source.indexOf('← Select from Active POs');
  const backToSuggestions = source.slice(toggleLabel - 1500, toggleLabel);
  assert.doesNotMatch(backToSuggestions, /handleSelectPoForGrn/);
  assert.match(backToSuggestions, /enterManualPoEntry/);
  assert.match(backToSuggestions, /setPoSuggestionDismissed\(false\)/);

  assert.match(suggestion, /Suggested purchase order/);
  assert.match(suggestion, /Use this PO/);
  assert.match(suggestion, /Enter manually/);
  assert.match(suggestion, /Dismiss purchase order suggestion/);
  assert.match(suggestion, /suggestion\.poNumber/);
  assert.match(source, /isClearable/);
  assert.match(source, /setGrnPoApplied\(false\)/);
  assert.match(source, /id="grn-vendor-invoice"/);
});
