import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyMultiLineQc } from '../src/services/grnDocument.js';
import { categoriesCompatible, explicitLinkMismatch } from '../src/services/inventoryIdentity.js';
import {
  BOILER_FUEL_WOOD_PELLETS_CATEGORY,
  PELLET_FUEL_CATEGORY,
  findPelletInventoryItem,
  grnCategoryAfterStockPick,
  grnPostsInventoryOnApproval,
  isPelletStockItem,
  pelletReceiptAlreadyPosted,
  pelletRowForGrn,
  planWoodPelletGrnPost,
  woodPelletBookAction
} from '../src/services/pelletFuel.js';

function readSource(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const pelletItem = {
  id: 'INVT-PELLET',
  itemCode: 'INVT-PELLET',
  itemName: 'Wood Pellets',
  category: 'Boiler Fuel - Wood Pellets',
  unit: 'Kg',
  location: 'Boiler Bay'
};

const filmItem = {
  id: 'INVT-FILM',
  itemCode: 'INVT-FILM',
  itemName: 'PET 12 micron',
  category: 'Film Substrates',
  unit: 'Kg'
};

const inkItem = {
  id: 'INVT-INK',
  itemCode: 'INVT-INK',
  itemName: 'Cyan Ink',
  category: 'Printing Inks',
  unit: 'Kg'
};

function woodReceipt(overrides = {}) {
  return {
    id: 'SIL/GRN/26-27/501',
    grnNo: 'SIL/GRN/26-27/501',
    category: BOILER_FUEL_WOOD_PELLETS_CATEGORY,
    itemName: 'Wood Pellets',
    stockItemId: pelletItem.id,
    vendorId: 'VEND-1',
    vendorName: 'Acme Pellets',
    invoiceNo: 'WP-100',
    receivedDate: '2026-11-11',
    netWeightKg: 250,
    receivedQtyKg: 250,
    purchaseRatePerKg: 18.5,
    status: 'Pending QC Approval',
    qcStatus: 'Pending QC Approval',
    storeManager: 'Store Clerk',
    lineItems: [{
      id: 'SIL/GRN/26-27/501-L1',
      category: BOILER_FUEL_WOOD_PELLETS_CATEGORY,
      itemName: 'Wood Pellets',
      stockItemId: pelletItem.id,
      netWeightKg: 250,
      purchaseRate: 18.5
    }],
    ...overrides
  };
}

test('Boiler Fuel - Wood Pellets is an Inward GRN category and posts only to the pellet book', () => {
  assert.equal(BOILER_FUEL_WOOD_PELLETS_CATEGORY, 'Boiler Fuel - Wood Pellets');
  assert.equal(PELLET_FUEL_CATEGORY, 'Boiler Pellets / Fuel');
  assert.notEqual(BOILER_FUEL_WOOD_PELLETS_CATEGORY, PELLET_FUEL_CATEGORY);
  assert.equal(typeof findPelletInventoryItem, 'function');
  assert.equal(typeof pelletReceiptAlreadyPosted, 'function');
  assert.equal(findPelletInventoryItem([
    { id: 'FILM', itemName: 'PET', category: 'Film Substrates' },
    { id: 'PEL', itemName: 'Boiler Pellet Fuel', category: 'Boiler Pellets / Fuel', availableQtyKg: 3 }
  ]).id, 'PEL');
  assert.equal(
    grnCategoryAfterStockPick(BOILER_FUEL_WOOD_PELLETS_CATEGORY, 'Boiler Pellets / Fuel'),
    'Boiler Fuel - Wood Pellets'
  );
  assert.equal(grnCategoryAfterStockPick('Film Substrates', 'Film Substrates'), 'Film Substrates');
  assert.equal(grnCategoryAfterStockPick('', 'Printing Inks'), 'Printing Inks');
  assert.equal(categoriesCompatible('Boiler Fuel - Wood Pellets', 'Boiler Pellets / Fuel'), true);
  assert.equal(categoriesCompatible('Boiler Fuel - Wood Pellets', 'Film Substrates'), false);
  assert.equal(categoriesCompatible('Printing Inks', 'Boiler Fuel - Wood Pellets'), false);
  assert.equal(explicitLinkMismatch(
    { category: 'Boiler Fuel - Wood Pellets', itemName: 'Boiler Pellet Fuel', stockItemId: 'INVT-PELLET-FUEL' },
    { id: 'INVT-PELLET-FUEL', itemName: 'Boiler Pellet Fuel', category: 'Boiler Pellets / Fuel' }
  ), '');
  assert.match(explicitLinkMismatch(
    { category: 'Boiler Fuel - Wood Pellets', itemName: 'PET 12 micron', stockItemId: 'INVT-FILM' },
    { id: 'INVT-FILM', itemName: 'PET 12 micron', category: 'Film Substrates' }
  ), /cannot be saved/);
  const screen = readSource('src/components/InventoryManagement.jsx');
  const app = readSource('src/App.jsx');
  const service = readSource('src/services/supabaseDataService.js');
  assert.match(screen, /value=\{BOILER_FUEL_WOOD_PELLETS_CATEGORY\}/);
  assert.match(screen, /\{BOILER_FUEL_WOOD_PELLETS_CATEGORY\}/);
  assert.match(app, /woodPelletBookAction/);
  assert.match(service, /postStockOnApproval:\s*true/);
  assert.match(service, /grnPostsInventoryOnApproval/);

  assert.equal(isPelletStockItem(pelletItem), true);
  assert.equal(isPelletStockItem({ ...filmItem, itemName: 'Wood Pellets Film' }), false);
  assert.equal(isPelletStockItem({ id: 'INK', itemName: 'Pellet Ink', category: 'Printing Inks' }), false);

  const saved = planWoodPelletGrnPost(woodReceipt(), [pelletItem, filmItem, inkItem]);
  assert.equal(saved.action, 'post');
  assert.equal(saved.skipInventoryLedger, true);
  assert.equal(saved.skipRollLedger, true);
  assert.equal(saved.pellet.id, 'SIL/GRN/26-27/501');
  assert.equal(saved.pellet.grnNo, 'SIL/GRN/26-27/501');
  assert.equal(saved.pellet.inwardQtyKg, 250);
  assert.equal(saved.pellet.unitCostPerKg, 18.5);
  assert.equal(saved.pellet.totalAmount, 4625);
  assert.equal(saved.pellet.stockItemId, 'INVT-PELLET');
  assert.equal(saved.grn.isPelletFuel, true);
  assert.equal(saved.grn.postStockOnApproval, false);
  assert.equal(grnPostsInventoryOnApproval(saved.grn), false);

  const again = pelletRowForGrn([saved.pellet], { ...saved.pellet, inwardQtyKg: 250 });
  assert.equal(again.id, saved.pellet.id);
  assert.equal(again.inwardQtyKg, 250);

  const approved = planWoodPelletGrnPost(woodReceipt({
    status: 'Approved',
    qcStatus: 'Approved',
    netWeightKg: 240,
    receivedQtyKg: 240
  }), [pelletItem]);
  const oneRow = pelletRowForGrn([saved.pellet], approved.pellet);
  assert.equal(oneRow.id, saved.pellet.id);
  assert.equal(oneRow.inwardQtyKg, 240);
  assert.notEqual(oneRow.inwardQtyKg, 490);
});

test('film and ink receipts do not post to pellet stock', () => {
  const film = planWoodPelletGrnPost({
    id: 'SIL/GRN/26-27/1',
    grnNo: 'SIL/GRN/26-27/1',
    category: 'Film Substrates',
    itemName: 'PET',
    stockItemId: filmItem.id,
    netWeightKg: 400,
    purchaseRatePerKg: 120,
    lineItems: [{ category: 'Film Substrates', itemName: 'PET', netWeightKg: 400, stockItemId: filmItem.id }]
  }, [pelletItem, filmItem]);
  assert.equal(film.action, 'skip');
  assert.equal(grnPostsInventoryOnApproval(film.grn || { category: 'Film Substrates' }), true);

  const ink = planWoodPelletGrnPost({
    category: 'Printing Inks',
    itemName: 'Cyan Ink',
    stockItemId: inkItem.id,
    netWeightKg: 25,
    purchaseRatePerKg: 300,
    lineItems: [{ category: 'Printing Inks', netWeightKg: 25, stockItemId: inkItem.id }]
  }, [pelletItem, inkItem]);
  assert.equal(ink.action, 'skip');
  assert.equal(grnPostsInventoryOnApproval({ category: 'Printing Inks' }), true);
  assert.equal(grnPostsInventoryOnApproval({ category: 'Chemicals & Solvents' }), true);

  const { stockPosts } = applyMultiLineQc({
    grn: {
      id: 'G',
      grnNo: 'G',
      category: 'Film Substrates',
      lineItems: [
        {
          id: 'G-L1',
          lineNo: 1,
          category: 'Film Substrates',
          itemName: 'PET',
          stockItemId: 'INVT-FILM',
          netWeightKg: 100,
          purchaseRate: 10,
          rolls: [{ barcodeId: 'RM-1', netWeightKg: 100 }]
        },
        {
          id: 'G-L2',
          lineNo: 2,
          category: BOILER_FUEL_WOOD_PELLETS_CATEGORY,
          itemName: 'Wood Pellets',
          stockItemId: 'INVT-PELLET',
          netWeightKg: 80,
          purchaseRate: 18,
          rolls: [{ barcodeId: 'CON-1', netWeightKg: 80 }]
        }
      ]
    },
    draftsByLineId: {},
    status: 'Approved'
  });
  assert.equal(stockPosts.length, 1);
  assert.equal(stockPosts[0].stockItemId, 'INVT-FILM');
  assert.equal(stockPosts[0].addKg, 100);
  assert.equal(stockPosts.some((post) => post.category === BOILER_FUEL_WOOD_PELLETS_CATEGORY), false);
});

test('a wood pellet receipt fails clearly when the pellet item is missing or a film SKU is picked', () => {
  const missing = planWoodPelletGrnPost(woodReceipt({ stockItemId: '' }), [filmItem, inkItem]);
  assert.equal(missing.action, 'block');
  assert.match(missing.message, /Create the pellet item/);
  assert.match(missing.message, /film SKU/);

  const filmPick = planWoodPelletGrnPost(woodReceipt({ stockItemId: filmItem.id }), [filmItem, pelletItem]);
  assert.equal(filmPick.action, 'block');
  assert.match(filmPick.message, /not the pellet fuel item/);
  assert.match(filmPick.message, /PET 12 micron/);

  const mixed = planWoodPelletGrnPost(woodReceipt({
    lineItems: [
      { category: BOILER_FUEL_WOOD_PELLETS_CATEGORY, netWeightKg: 10, purchaseRate: 18 },
      { category: 'Printing Inks', netWeightKg: 5, purchaseRate: 200 }
    ]
  }), [pelletItem]);
  assert.equal(mixed.action, 'block');
  assert.match(mixed.message, /its own goods receipt/);

  const unnamedFilm = planWoodPelletGrnPost(woodReceipt({
    stockItemId: 'INVT-FILM',
    itemName: 'Wood Pellets'
  }), [{ ...filmItem, itemName: 'Wood Pellets' }]);
  assert.equal(unnamedFilm.action, 'block');
});

test('cancelling a wood pellet receipt drops that one pellet row and keeps a different receipt', () => {
  const kept = { id: 'OTHER', grnNo: 'SIL/GRN/26-27/9', inwardQtyKg: 10 };
  const mine = { id: 'SIL/GRN/26-27/501', grnNo: 'SIL/GRN/26-27/501', inwardQtyKg: 250 };
  const decision = woodPelletBookAction(
    woodReceipt({ status: 'Cancelled', qcStatus: 'Cancelled' }),
    [pelletItem],
    [kept, mine]
  );
  assert.equal(decision.action, 'drop');
  assert.deepEqual(decision.ids, ['SIL/GRN/26-27/501']);
  assert.equal(decision.ids.includes('OTHER'), false);

  const sameNumberDifferentId = pelletRowForGrn(
    [{ id: 'PEL-GRN-9', grnNo: 'SIL/GRN/26-27/501', inwardQtyKg: 250 }],
    { id: 'SIL/GRN/26-27/501', grnNo: 'SIL/GRN/26-27/501', inwardQtyKg: 250, status: 'Approved' }
  );
  assert.equal(sameNumberDifferentId.id, 'PEL-GRN-9');
  assert.equal(sameNumberDifferentId.inwardQtyKg, 250);
});
