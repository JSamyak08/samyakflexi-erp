import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateJobRawMaterials,
  getOrderMaterialRequirements,
  parseStructureLayers
} from '../src/factoryStore.js';

test('parseStructureLayers correctly parses 3-layer structure and preserves rates/widths', () => {
  const oldLayers = [
    { filmType: 'PET', micron: 12, widthMm: 560, rate: 125 },
    { filmType: 'METPET', micron: 12, widthMm: 560, rate: 140 },
    { filmType: 'NMET', micron: 30, widthMm: 565, rate: 115 }
  ];

  const parsed = parseStructureLayers('PET 12µ / METPET 12µ / NMET 30µ', oldLayers, '5%');
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].filmType, 'PET');
  assert.equal(parsed[0].micron, 12);
  assert.equal(parsed[0].widthMm, 560);
  assert.equal(parsed[0].rate, 125);

  assert.equal(parsed[1].filmType, 'METPET');
  assert.equal(parsed[1].micron, 12);
  assert.equal(parsed[1].widthMm, 560);
  assert.equal(parsed[1].rate, 140);

  assert.equal(parsed[2].filmType, 'NMET');
  assert.equal(parsed[2].micron, 30);
  assert.equal(parsed[2].widthMm, 565);
  assert.equal(parsed[2].rate, 115);
  assert.equal(parsed[2].metallocenePct, '5%');
});

test('calculateJobRawMaterials calculates proportionally higher requirements for 1000kg vs 400kg', () => {
  const layers = [
    { filmType: 'PET', micron: 12, widthMm: 560, rate: 125 },
    { filmType: 'METPET', micron: 12, widthMm: 560, rate: 140 },
    { filmType: 'NMET', micron: 30, widthMm: 565, rate: 115 }
  ];

  const calc400 = calculateJobRawMaterials({
    jobName: 'Frootnut 5G Balls Inner',
    printWidthMm: 1000,
    repeatLengthMm: 400,
    orderQtyKg: 400,
    orderType: 'Reel',
    layers
  });

  const calc1000 = calculateJobRawMaterials({
    jobName: 'Frootnut 5G Balls Inner',
    printWidthMm: 1000,
    repeatLengthMm: 400,
    orderQtyKg: 1000,
    orderType: 'Reel',
    layers
  });

  // For 400kg, total film gross is ~394-408kg
  const sum400 = calc400.layerResults.reduce((s, l) => s + l.grossKg, 0);
  assert.ok(sum400 > 350 && sum400 < 450, `sum400 should be ~380-420kg, got ${sum400}`);

  // For 1000kg, total film gross is ~964-1050kg (scaled proportionally)
  const sum1000 = calc1000.layerResults.reduce((s, l) => s + l.grossKg, 0);
  assert.ok(sum1000 > 900 && sum1000 < 1100, `sum1000 should be ~950-1050kg, got ${sum1000}`);

  // Ratio should be close to 1000 / 400 = 2.5
  const ratio = sum1000 / sum400;
  assert.ok(ratio >= 2.3 && ratio <= 2.6, `Ratio between 1000kg and 400kg should be ~2.4-2.5, got ${ratio}`);
});

test('getOrderMaterialRequirements auto-recalculates when existing requirements are stale for new order quantity', () => {
  // Simulating an order that was originally 400kg with 111.57, 111.57, 184.93 kg requirements
  // but orderQtyKg was subsequently updated to 1000kg
  const orderWithStaleRequirements = {
    id: 'ORD-2026-220',
    jobName: 'Frootnut 5G Balls Inner',
    orderQtyKg: 1000, // Updated to 1,000 kg!
    structure: 'PET 12µ / METPET 12µ / NMET 30µ',
    layers: [
      { filmType: 'PET', micron: 12, widthMm: 560 },
      { filmType: 'METPET', micron: 12, widthMm: 560 },
      { filmType: 'NMET', micron: 30, widthMm: 565 }
    ],
    materialRequirements: [
      { id: 'REQ-ORD-2026-220-1', filmType: 'PET', micron: 12, widthMm: 560, qtyKg: 111.57, preferredVendor: 'FlexiPoly Films Ltd' },
      { id: 'REQ-ORD-2026-220-2', filmType: 'METPET', micron: 12, widthMm: 560, qtyKg: 111.57, preferredVendor: 'FlexiPoly Films Ltd' },
      { id: 'REQ-ORD-2026-220-3', filmType: 'NMET', micron: 30, widthMm: 565, qtyKg: 184.93, preferredVendor: 'Malwa Extrusions Pvt Ltd' }
    ]
  };

  const resolvedReqs = getOrderMaterialRequirements(orderWithStaleRequirements);

  // Requirements should now reflect the 1000kg order quantity (sum > 1000kg, not 408kg)
  const sumResolved = resolvedReqs.reduce((s, r) => s + r.qtyKg, 0);
  assert.ok(sumResolved > 950, `Resolved requirements should match 1000kg order, got sum ${sumResolved} kg`);

  // Preferred vendors should be preserved
  assert.equal(resolvedReqs[0].preferredVendor, 'FlexiPoly Films Ltd');
  assert.equal(resolvedReqs[1].preferredVendor, 'FlexiPoly Films Ltd');
  assert.equal(resolvedReqs[2].preferredVendor, 'Malwa Extrusions Pvt Ltd');

  // Slit widths should be preserved
  assert.equal(resolvedReqs[0].widthMm, 560);
  assert.equal(resolvedReqs[1].widthMm, 560);
  assert.equal(resolvedReqs[2].widthMm, 565);
});

test('getOrderMaterialRequirements preserves requirements when they are already consistent with order quantity', () => {
  const consistentOrder = {
    id: 'ORD-2026-300',
    jobName: 'Pouch Job',
    orderQtyKg: 1000,
    materialRequirements: [
      { id: 'REQ-1', filmType: 'PET', micron: 12, widthMm: 1000, qtyKg: 280, preferredVendor: 'Vendor A' },
      { id: 'REQ-2', filmType: 'Natural GP LD', micron: 35, widthMm: 1005, qtyKg: 780, preferredVendor: 'Vendor B' }
    ]
  };

  const reqs = getOrderMaterialRequirements(consistentOrder);
  // Sum is 1060 kg, which is consistent with 1000 kg order (within 10-15% wastage)
  assert.equal(reqs[0].qtyKg, 280);
  assert.equal(reqs[1].qtyKg, 780);
  assert.equal(reqs[0].preferredVendor, 'Vendor A');
});
