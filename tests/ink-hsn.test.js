import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildInkPoLine,
  inkPurchaseBlockMessage,
  mapInkMasterToRow,
  mapInkRowToMaster,
  missingInkCommercialFields,
  purchaseLineHsn,
  readHsnCode,
} from '../src/utils/inkHsn.js';

const productionRow = {
  id: 'INK-453036',
  product_code: 'WCL4-12AK-01FW',
  shade: 'Flint - GPL REDDER YELLOW',
  ink_type: 'Reverse Ink',
  manufacturer: 'Flint  Inks',
  supplier_id: 'VEND-2026-4827',
  supplier_name: 'Creative marketing',
  solid_content_pct: '22',
  solid_variation_pct: '2',
  price_per_kg: '334',
  stock_qty_kg: '0',
  reorder_level_kg: '100',
  unit: 'Kg',
  solvent_type: 'Ethyl Acetate +Toluene',
  notes: '',
  price_history: [{ date: '2026-10-23', price: 334, reason: 'Initial onboarding rate' }],
};

const settings = { minPoQtyKg: 100, defaultReorderLevelKg: 50 };

test('a fetched ink row with no HSN column still reports only HSN', () => {
  const ink = mapInkRowToMaster(productionRow);
  assert.equal(ink.hsnCode, '');
  assert.deepEqual(missingInkCommercialFields(ink), ['HSN']);
  const message = inkPurchaseBlockMessage(ink);
  assert.match(message, /WCL4-12AK-01FW is missing HSN/);
  assert.match(message, /Set HSN on the ink before raising a purchase order/);
  assert.doesNotMatch(message, /GST/);
  assert.match(buildInkPoLine(ink, settings).error, /missing HSN/);
});

test('the purchase check reads the column the master save writes', () => {
  const saved = mapInkMasterToRow({
    ...mapInkRowToMaster(productionRow),
    hsnCode: '32151990',
  });
  assert.equal(saved.hsn_code, '32151990');
  assert.equal(Object.hasOwn(saved, 'hsnCode'), false);

  const reloaded = mapInkRowToMaster({ ...productionRow, hsn_code: saved.hsn_code });
  assert.equal(reloaded.hsnCode, '32151990');
  assert.equal(inkPurchaseBlockMessage(reloaded), '');
  const line = buildInkPoLine(reloaded, settings);
  assert.equal(line.item.hsnCode, '32151990');
  assert.equal(line.item.productCode, 'WCL4-12AK-01FW');
  assert.deepEqual(missingInkCommercialFields(line.item), []);
});

test('a blank HSN is left off the save payload so a later edit does not wipe a stored code', () => {
  const payload = mapInkMasterToRow(mapInkRowToMaster(productionRow));
  assert.equal(Object.hasOwn(payload, 'hsn_code'), false);
});

test('legacy HSN fields count as saved', () => {
  assert.equal(readHsnCode({ hsn: '3215' }), '3215');
  assert.equal(readHsnCode({ hsn_sac: '321511' }), '321511');
  assert.equal(readHsnCode({ hsnSac: '321590' }), '321590');
  assert.equal(readHsnCode({ notes: { hsn_code: '32151910' } }), '32151910');
  assert.equal(readHsnCode({ notes: '{"hsn":"32151920"}' }), '32151920');
  assert.equal(readHsnCode({ notes: 'Supplier invoice HSN: 32151930' }), '32151930');
  assert.equal(readHsnCode({ notes: 'HSN from the supplier invoice' }), '');

  const fromLegacyColumn = mapInkRowToMaster({ ...productionRow, hsn_sac: '32151940' });
  assert.equal(fromLegacyColumn.hsnCode, '32151940');
  assert.equal(buildInkPoLine(fromLegacyColumn, settings).item.hsnCode, '32151940');
});

test('a multi-field block names each missing field and does not add GST', () => {
  const message = inkPurchaseBlockMessage({
    productCode: 'WCL4-12AK-01FW',
    manufacturer: '',
    solidContentPct: 22,
    solidVariationPct: 2,
    pricePerKg: 0,
  });
  assert.match(message, /missing manufacturer, HSN, rate/);
  assert.match(message, /Set manufacturer, HSN, rate on the ink/);
  assert.doesNotMatch(message, /GST/);
});

test('film and adhesive lines use a saved HSN before their category default', () => {
  assert.equal(purchaseLineHsn({ hsn_code: '392010' }, '3920'), '392010');
  assert.equal(purchaseLineHsn({ hsn_sac: '3506' }, '3215'), '3506');
  assert.equal(purchaseLineHsn({ category: 'Film Substrates' }, '3920'), '3920');
  assert.equal(purchaseLineHsn({ category: 'Adhesives & Hardener' }, '3215'), '3215');
});

test('single-item and multi-item ink purchase orders share the HSN reader', () => {
  const source = fs.readFileSync(new URL('../src/components/InkManagement.jsx', import.meta.url), 'utf8');
  assert.match(source, /function inkPoLine\(ink\) \{\s*return buildInkPoLine\(ink, getMaterialCostSettings\(\)\);\s*\}/);
  assert.match(source, /handleIssuePoForInk[\s\S]{0,80}handleOpenPoModal\(\[ink\]\)/);
  assert.match(source, /handleIssueMultiItemPOFromSelection[\s\S]{0,400}handleOpenPoModal\(selectedInks\)/);
  assert.match(source, /const line = inkPoLine\(ink\)/);
  assert.equal(source.includes('ink.hsnCode'), false);
});
