import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderStockReservations,
  lineMaterialBalance,
  linkedRequirementMatches,
  presentRequirementStock,
  requirementLineId,
  requirementStockKey
} from '../src/factoryStore.js';

function line(id, filmType, micron, widthMm, qtyKg) {
  return { id, filmType, micron, widthMm, qtyKg, poIssued: false };
}

test('balance is max(0, gross required - stock reserved for that line)', () => {
  const partial = lineMaterialBalance(136.82, 118);
  assert.equal(partial.grossKg, 136.82);
  assert.equal(partial.reqQty, 136.82);
  assert.equal(partial.reservedKg, 118);
  assert.equal(partial.balanceKg, 18.82);
  assert.equal(partial.isPartiallyAvailable, true);

  const uncovered = lineMaterialBalance(226.35, 0);
  assert.equal(uncovered.balanceKg, 226.35);
  assert.equal(uncovered.reqQty, 226.35);

  const covered = lineMaterialBalance(136.82, 136.82);
  assert.equal(covered.balanceKg, 0);
  assert.equal(covered.isFullyAvailable, true);

  const overReserved = lineMaterialBalance(136.82, 521.61);
  assert.equal(overReserved.reservedKg, 136.82);
  assert.equal(overReserved.balanceKg, 0);
  assert.ok(overReserved.balanceKg <= overReserved.grossKg);
});

test('a stale snapshot from another order cannot raise this line above its gross', () => {
  const shown = presentRequirementStock(
    line('REQ-216', 'PET', 12, 710, 136.82),
    { reqQty: 521.61, reservedKg: 0, balanceKg: 521.61 }
  );
  assert.equal(shown.reqQty, 136.82);
  assert.equal(shown.balanceKg, 136.82);
  assert.equal(shown.reservedKg, 0);
  assert.ok(shown.balanceKg <= shown.grossKg);

  const own = presentRequirementStock(
    line('REQ-906', 'METPET', 12, 710, 136.82),
    { reqQty: 136.82, reservedKg: 118, balanceKg: 18.82 }
  );
  assert.equal(own.balanceKg, 18.82);
  assert.equal(own.reqQty, own.grossKg);
});

test('shared requirement ids keep each order line on its own gross', () => {
  const inventory = [
    { id: 'INV-PET-710', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 0 },
    { id: 'INV-MET-710', filmType: 'METPET', micron: 12, widthMm: 710, availableQtyKg: 118 },
    { id: 'INV-NGP-715', filmType: 'NGP', micron: 30, widthMm: 715, availableQtyKg: 0 }
  ];
  const doughnut = {
    id: 'ORD-2026-224',
    status: 'In Progress',
    targetDeliveryDate: '2026-11-04',
    materialRequirements: [
      line('REQ-216', 'PET', 12, 710, 136.82),
      line('REQ-906', 'METPET', 12, 710, 136.82),
      line('REQ-533', 'NGP', 30, 715, 226.35)
    ]
  };
  const tashibo = {
    id: 'ORD-2026-217',
    status: 'In Progress',
    targetDeliveryDate: '2026-11-07',
    materialRequirements: [
      line('REQ-216', 'PET', 10, 835, 521.61)
    ]
  };

  const stock = calculateOrderStockReservations([tashibo, doughnut], inventory, []);
  const pet = presentRequirementStock(
    doughnut.materialRequirements[0],
    stock.getReqStockInfo(doughnut.materialRequirements[0], doughnut.id)
  );
  const metpet = presentRequirementStock(
    doughnut.materialRequirements[1],
    stock.getReqStockInfo(doughnut.materialRequirements[1], doughnut.id)
  );
  const ngp = presentRequirementStock(
    doughnut.materialRequirements[2],
    stock.getReqStockInfo(doughnut.materialRequirements[2], doughnut.id)
  );
  const laterPet = stock.getReqStockInfo(tashibo.materialRequirements[0], tashibo.id);

  assert.equal(pet.reqQty, 136.82);
  assert.equal(pet.balanceKg, 136.82);
  assert.notEqual(pet.balanceKg, 521.61);
  assert.equal(pet.reqQty, pet.grossKg);

  assert.equal(metpet.reservedKg, 118);
  assert.equal(metpet.balanceKg, 18.82);
  assert.equal(metpet.reqQty, 136.82);

  assert.equal(ngp.balanceKg, 226.35);
  assert.equal(ngp.reqQty, 226.35);

  assert.equal(laterPet.reqQty, 521.61);
  assert.equal(laterPet.balanceKg, 521.61);
  assert.notEqual(
    requirementStockKey(doughnut.id, doughnut.materialRequirements[0]),
    requirementStockKey(tashibo.id, tashibo.materialRequirements[0])
  );
});

test('an earlier order keeps the stock it reserved when a later order reuses the id', () => {
  const inventory = [
    { id: 'INV-PET', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 100 }
  ];
  const earlier = {
    id: 'ORD-A',
    status: 'In Progress',
    targetDeliveryDate: '2026-11-01',
    materialRequirements: [line('REQ-1', 'PET', 12, 710, 80)]
  };
  const later = {
    id: 'ORD-B',
    status: 'In Progress',
    targetDeliveryDate: '2026-11-08',
    materialRequirements: [line('REQ-1', 'PET', 12, 710, 80)]
  };
  const stock = calculateOrderStockReservations([later, earlier], inventory, []);
  const first = stock.getReqStockInfo(earlier.materialRequirements[0], earlier.id);
  const second = stock.getReqStockInfo(later.materialRequirements[0], later.id);

  assert.equal(first.reservedKg, 80);
  assert.equal(first.balanceKg, 0);
  assert.equal(second.reservedKg, 20);
  assert.equal(second.balanceKg, 60);
});

test('purchase quantity is the corrected balance, including zero when the line is covered', () => {
  const covered = presentRequirementStock(
    line('REQ-1', 'PET', 12, 710, 136.82),
    { reqQty: 136.82, reservedKg: 136.82, balanceKg: 0 }
  );
  assert.equal(covered.balanceKg, 0);

  const shortage = presentRequirementStock(
    line('REQ-1', 'PET', 12, 710, 136.82),
    { reqQty: 136.82, reservedKg: 118 }
  );
  assert.equal(shortage.balanceKg, 18.82);
});

test('new punched requirement ids are unique per order line', () => {
  const first = [0, 1, 2].map((idx) => requirementLineId('ORD-2026-300', idx));
  const second = [0, 1, 2].map((idx) => requirementLineId('ORD-2026-301', idx));
  assert.deepEqual(first, ['REQ-ORD-2026-300-1', 'REQ-ORD-2026-300-2', 'REQ-ORD-2026-300-3']);
  assert.equal(new Set([...first, ...second]).size, 6);
});

test('linking a purchase order marks the selected order line only', () => {
  const linked = ['ORD-2026-224::REQ-216', 'ORD-2026-217::REQ-575'];
  assert.equal(linkedRequirementMatches(linked, 'ORD-2026-224', 'REQ-216', 'ORD-2026-217'), true);
  assert.equal(linkedRequirementMatches(linked, 'ORD-2026-217', 'REQ-216', 'ORD-2026-217'), false);
  assert.equal(linkedRequirementMatches(['REQ-216'], 'ORD-2026-217', 'REQ-216', 'ORD-2026-217'), true);
  assert.equal(linkedRequirementMatches(['REQ-216'], 'ORD-2026-224', 'REQ-216', 'ORD-2026-217'), false);
});
