import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareMultiLineReceipt } from '../src/services/grnDocument.js';
import {
  planReceiptStockLink,
  resolveReceiptItem
} from '../src/services/inventoryIdentity.js';
import { ledgerRowLink } from '../src/services/inventoryLedgerMatch.js';

const formatFilmItemName = (filmType, widthMm, micron) => `${filmType}-${widthMm}-${micron}`;

function film(id, itemName, filmType, widthMm, micron) {
  return {
    id,
    itemCode: id,
    itemName,
    category: 'Film Substrates',
    filmType,
    widthMm,
    micron,
    availableQtyKg: 10
  };
}

const catalog = [
  film('INVT-41013', 'PET-410-13', 'PET', 410, 13),
  film('INVT-41012', 'PET-410-12', 'PET', 410, 12),
  film('INVT-46012', 'PET-460-12', 'PET', 460, 12),
  film('INVT-49012', 'PET-490-12', 'PET', 490, 12),
  film('INVT-53012', 'PET-530-12', 'PET', 530, 12),
  film('INVT-57012', 'PET-570-12', 'PET', 570, 12),
  film('INVT-59012', 'PET-590-12', 'PET', 590, 12),
  film('INVT-67012', 'PET-670-12', 'PET', 670, 12),
  film('INVT-89012', 'PET-890-12', 'PET', 890, 12),
  film('INVT-95512', 'PET-955-12', 'PET', 955, 12),
  film('INVT-57018', 'METBOPP-570-18', 'METBOPP', 570, 18),
  film('INVT-65018', 'METBOPP-650-18', 'METBOPP', 650, 18),
  film('INVT-73018', 'MATTEBOPP-730-18', 'MATTEBOPP', 730, 18),
  film('INVT-MET', 'METPET-650-12', 'METPET', 650, 12),
  {
    id: 'INVT-2027',
    itemCode: 'INVT-2027',
    itemName: 'Flint Process Cyan',
    category: 'Printing Inks',
    filmType: '',
    micron: '-',
    widthMm: '-',
    availableQtyKg: 4
  }
];

const nearMisses = [
  ['PET-410', 'INVT-2027'],
  ['PET-410-13', 'INVT-67012'],
  ['PET-410-12', 'INVT-41013'],
  ['PET-460-12', 'INVT-67012'],
  ['PET-490-12', 'INVT-89012'],
  ['PET-530-12', 'INVT-95512'],
  ['PET-570-12', 'INVT-57018'],
  ['PET-590-12', 'INVT-65018'],
  ['MATTEBOPP-730-18', 'INVT-89012'],
  ['PET-650-12', 'INVT-MET'],
  ['METPET-650-12', 'INVT-41012']
];

function receiptSpec(itemName, filmType, widthMm, micron) {
  return {
    itemName,
    category: 'Film Substrates',
    filmType,
    widthMm,
    micron
  };
}

test('near-miss film and ink names never link to a different SKU', () => {
  const withoutExact = catalog.filter((item) => ![
    'PET-410-13', 'PET-410-12', 'PET-460-12', 'PET-490-12', 'PET-530-12',
    'PET-570-12', 'PET-590-12', 'MATTEBOPP-730-18'
  ].includes(item.itemName));
  nearMisses.forEach(([name, wrongId]) => {
    const [filmType, width, micron] = name.split('-');
    const widthMm = Number(width);
    const mic = Number(micron);
    const spec = Number.isFinite(widthMm) && Number.isFinite(mic)
      ? receiptSpec(name, filmType, widthMm, mic)
      : receiptSpec(name, 'PET', 410, 12);
    const pool = name === 'PET-410' ? catalog : withoutExact;
    const plan = planReceiptStockLink(pool, spec);
    assert.notEqual(plan.item?.id, wrongId, `${name} must not link to ${wrongId}`);
    const exact = pool.find((item) => item.itemName === name);
    if (exact) {
      assert.equal(plan.action, 'use');
      assert.equal(plan.item.id, exact.id);
    } else {
      assert.notEqual(plan.action, 'use', `${name} has no exact active item in this pool`);
      assert.equal(resolveReceiptItem(pool, spec), null);
    }
  });
});

test('an exact item id links that SKU even when a similar name is on the receipt', () => {
  const linked = resolveReceiptItem(catalog, {
    stockItemId: 'INVT-41013',
    itemId: 'INVT-67012',
    ...receiptSpec('PET-410-13', 'PET', 410, 13)
  });
  assert.equal(linked.id, 'INVT-41013');
  const byName = resolveReceiptItem(catalog, {
    ...receiptSpec('  pet-410-13 ', 'PET', 410, 13)
  });
  assert.equal(byName.id, 'INVT-41013');
});

test('a stale stock item id for a different grade or an ink blocks the save', () => {
  const ink = planReceiptStockLink(catalog, {
    stockItemId: 'INVT-2027',
    ...receiptSpec('PET-410', 'PET', 410, 12)
  });
  assert.equal(ink.action, 'block');
  assert.match(ink.message, /Pick the stock item/);
  assert.match(ink.message, /Ink and film/);

  const otherFilm = planReceiptStockLink(catalog, {
    stockItemId: 'INVT-67012',
    ...receiptSpec('PET-410-13', 'PET', 410, 13)
  });
  assert.equal(otherFilm.action, 'block');
  assert.match(otherFilm.message, /Pick the/);
  assert.match(otherFilm.message, /PET-670-12/);
  assert.equal(otherFilm.item, null);

  const sameWidthDifferentMicron = planReceiptStockLink(catalog, {
    stockItemId: 'INVT-41012',
    ...receiptSpec('PET-410-13', 'PET', 410, 13)
  });
  assert.equal(sameWidthDifferentMicron.action, 'block');
  assert.match(sameWidthDifferentMicron.message, /PET-410-12 and PET-410-13/);
});

test('a goods receipt keeps the PO line item id on every roll', () => {
  const { linkError, rolls, inventoryLots } = prepareMultiLineReceipt({
    header: { vendorName: 'Acme', invoiceNo: 'INV-1001' },
    capturedLines: [
      {
        category: 'Film Substrates',
        itemName: 'PET-410-13',
        filmType: 'PET',
        micron: 13,
        widthMm: 410,
        stockItemId: 'INVT-41013',
        itemId: 'INVT-41013',
        purchaseRate: 150,
        batchNo: '1001',
        rolls: [{ netWeightKg: 20, vendorRollNo: 'R1' }]
      },
      {
        category: 'Film Substrates',
        itemName: 'MATTEBOPP-730-18',
        filmType: 'MATTEBOPP',
        micron: 18,
        widthMm: 730,
        stockItemId: 'INVT-73018',
        purchaseRate: 160,
        batchNo: '1002',
        rolls: [{ netWeightKg: 18, vendorRollNo: 'R2' }]
      }
    ],
    grnNo: 'SIL/GRN/26-27/1001',
    nowIso: '2026-10-29T13:00:00.000Z',
    inventory: catalog,
    formatFilmItemName,
    isMetalloceneEligibleFilm: () => false,
    generateInventoryId: () => {
      throw new Error('an exact item id must not allocate a new stock item');
    }
  });
  assert.equal(linkError, undefined);
  assert.equal(inventoryLots.length, 0);
  assert.equal(rolls[0].itemId, 'INVT-41013');
  assert.equal(rolls[1].itemId, 'INVT-73018');
  assert.notEqual(rolls[0].itemId, 'INVT-67012');
  assert.notEqual(rolls[1].itemId, 'INVT-89012');
});

test('a receipt aimed at an ink id does not save the film roll', () => {
  const prepared = prepareMultiLineReceipt({
    header: { vendorName: 'Acme', invoiceNo: 'INV-1008' },
    capturedLines: [{
      category: 'Film Substrates',
      itemName: 'PET-410',
      filmType: 'PET',
      micron: 12,
      widthMm: 410,
      stockItemId: 'INVT-2027',
      purchaseRate: 150,
      batchNo: '1008',
      rolls: [{ netWeightKg: 12, vendorRollNo: 'R8' }]
    }],
    grnNo: 'SIL/GRN/26-27/1008',
    nowIso: '2026-10-29T13:00:00.000Z',
    inventory: catalog,
    formatFilmItemName,
    isMetalloceneEligibleFilm: () => false
  });
  assert.match(prepared.linkError, /Pick the stock item/);
  assert.equal(prepared.rolls.length, 0);
  assert.equal(prepared.newGRN, null);
});

test('inward dates and the store-issue list do not use a contains match', () => {
  const pet = film('INVT-41013', 'PET-410-13', 'PET', 410, 13);
  assert.equal(ledgerRowLink({
    itemName: 'PET-410',
    stockItemId: 'INVT-2027'
  }, pet).include, false);
  assert.equal(ledgerRowLink({ itemName: 'METPET-650-12' }, pet).include, false);
  assert.equal(ledgerRowLink({
    itemName: 'PET-410-13',
    stockItemId: 'INVT-41013'
  }, pet).include, true);

  const source = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const matchingGRNs'), source.indexOf('const batches'));
  assert.match(block, /ledgerRowLink/);
  assert.doesNotMatch(block, /includes\(iName\)|includes\(gName\)/);
  const fifo = fs.readFileSync(new URL('../src/utils/fifoUtils.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fifo, /includes\(iName\)|includes\(gName\)/);
});
