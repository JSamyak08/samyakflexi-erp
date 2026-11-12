import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPackingListPrintModel,
  displayRollNumber,
  nextBarcodeSuffix,
  resolvePackingSubstrate,
  substrateForPrint,
  substrateToStore,
} from '../src/utils/packingListPrint.js';
import { clientEmailForSave, isOptionalClientEmail } from '../src/utils/clientEmail.js';

const dispatchSource = fs.readFileSync(new URL('../src/components/DispatchManagement.jsx', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../src/components/ClientManagement.jsx', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');

test('substrate resolution prefers the order by id, then the job master, then film type', () => {
  const orders = [
    { id: 'ORD-NAME', jobName: 'Shared Job', structure: 'From the name match' },
    {
      id: 'ORD-2026-180',
      jobName: 'Shared Job',
      structure: 'Flexible Laminate',
      jobMasterId: 'JM-2026-538',
    },
  ];
  const jobMasters = [
    { id: 'JM-OTHER', jobName: 'Shared Job', structure: 'Wrong job master' },
    {
      id: 'JM-2026-538',
      jobName: 'Shared Job',
      layers: [
        { filmType: 'PET', micron: '12' },
        { filmType: 'NMET', micron: '65' },
      ],
      structure: 'Column that layers replace',
    },
  ];

  assert.equal(resolvePackingSubstrate({
    orders,
    jobMasters,
    orderId: 'ORD-2026-180',
    jobName: 'Shared Job',
    filmType: 'BOPP 20µ',
  }), 'PET 12µ / NMET 65µ');

  assert.equal(resolvePackingSubstrate({
    orders,
    jobMasters,
    orderId: 'ORD-NAME',
    jobName: 'Shared Job',
    filmType: 'BOPP 20µ',
  }), 'From the name match');

  assert.equal(resolvePackingSubstrate({
    orders: [],
    jobMasters: [{ id: 'JM-2026-538', jobName: 'Only Job', structure: '—' }],
    jobName: 'Only Job',
    filmType: 'BOPP 20µ',
  }), 'BOPP 20µ');

  assert.equal(resolvePackingSubstrate({
    orders: [],
    jobMasters: [],
    filmType: 'Flexible Laminate',
  }), '');

  assert.equal(substrateToStore(
    { substrateSpec: 'Flexible Laminate', rollNo: 8, barcodeId: 'FG-DISP-100000-8' },
    { orders: [], jobMasters: [jobMasters[1]], jobName: 'Shared Job' }
  ), 'PET 12µ / NMET 65µ');

  assert.equal(substrateToStore(
    { substrateSpec: 'Keep this', rollNo: 8, barcodeId: 'FG-1' },
    { jobMasters, jobName: 'Shared Job' }
  ), 'Keep this');
});

test('printing a saved filler looks up the job master and does not keep the filler', () => {
  const printed = substrateForPrint(
    { substrateSpec: 'Flexible Laminate', jobName: 'Deleted Order Job', rollNo: 2, barcodeId: 'FG-DISP-100000-2' },
    {
      jobName: 'Deleted Order Job',
      order: { id: 'ORD-2026-180', jobName: 'Deleted Order Job', structure: 'Order structure' },
      jobMasters: [{ id: 'JM-2026-538', jobName: 'Deleted Order Job', structure: 'PET 12µ / NMET 65µ' }],
    }
  );
  assert.equal(printed, 'PET 12µ / NMET 65µ');

  const kept = substrateForPrint(
    { substrateSpec: 'CCPET 12μ / MGP 90μ' },
    { jobMasters: [{ jobName: 'Job', structure: 'Other' }], jobName: 'Job' }
  );
  assert.equal(kept, 'CCPET 12μ / MGP 90μ');
});

test('the # column is the row position and a new barcode suffix is never a suffix still on the list', () => {
  assert.equal(displayRollNumber(0), 1);
  assert.equal(displayRollNumber(21), 22);

  const packed = [];
  for (let n = 2; n <= 23; n += 1) {
    packed.push({ rollNo: String(n), barcodeId: `FG-DISP-606130-${n}` });
  }
  assert.equal(nextBarcodeSuffix(packed), 24);
  assert.equal(nextBarcodeSuffix(packed.filter((roll) => roll.rollNo !== '23')), 23);

  const duplicateFive = [
    { rollNo: 4, barcodeId: 'FG-DISP-100000-4' },
    { rollNo: 5, barcodeId: 'FG-DISP-100000-5' },
    { rollNo: 5, barcodeId: 'SFG-BATCH-5' },
  ];
  assert.equal(nextBarcodeSuffix(duplicateFive), 6);
  assert.equal(nextBarcodeSuffix([{ rollNo: 3, barcodeId: 'SFG-999-50' }]), 4);
  assert.equal(nextBarcodeSuffix([]), 1);

  const model = buildPackingListPrintModel({
    items: duplicateFive.map((roll) => ({ ...roll, substrateSpec: 'PET 12µ' })),
  });
  assert.deepEqual(model.lines.map((line) => line.rollNo), ['1', '2', '3']);
  assert.deepEqual(model.lines.map((line) => line.barcode), [
    'FG-DISP-100000-4',
    'FG-DISP-100000-5',
    'SFG-BATCH-5',
  ]);
});

test('customer details come from the client id on the order, otherwise an exact name', () => {
  const clients = [
    {
      id: 'CLI-2026-9267',
      name: 'Zain Natural Agro',
      address: '   ',
      email: '',
      phone: '8380893808',
      gstin: '',
    },
    {
      id: 'CLI-OTHER',
      name: 'Other Buyer',
      address: 'Plant road',
      email: 'buyer@example.com',
      phone: '9999999999',
      gstin: '23AAAAA0000A1Z5',
    },
  ];
  const byId = buildPackingListPrintModel({
    clientName: 'Other Buyer',
    orderId: 'ORD-1',
    items: [],
  }, {
    clients,
    orders: [{
      id: 'ORD-1',
      jobName: 'Job',
      calculationDetails: { clientDetails: { id: 'CLI-2026-9267', name: 'Zain Natural Agro' } },
    }],
  });
  assert.equal(byId.customer.name, 'Zain Natural Agro');
  assert.equal(byId.customer.address, 'Not Available');
  assert.equal(byId.customer.email, 'Not Available');
  assert.equal(byId.customer.mobile, '8380893808');
  assert.equal(byId.customer.gstin, 'Not Available');

  const byName = buildPackingListPrintModel({
    clientName: 'zain natural agro',
    items: [],
  }, { clients, orders: [] });
  assert.equal(byName.customer.mobile, '8380893808');

  const partial = buildPackingListPrintModel({
    clientName: 'Zain',
    items: [],
  }, { clients, orders: [] });
  assert.equal(partial.customer.name, 'Zain');
  assert.equal(partial.customer.mobile, 'Not Available');
  assert.equal(partial.customer.address, 'Not Available');

  const withEmail = buildPackingListPrintModel({
    clientName: 'Other Buyer',
    items: [],
  }, { clients });
  assert.equal(withEmail.customer.address, 'Plant road');
  assert.equal(withEmail.customer.email, 'buyer@example.com');
  assert.equal(withEmail.customer.mobile, '9999999999');
  assert.equal(withEmail.customer.gstin, '23AAAAA0000A1Z5');
});

test('client directory email is optional and has a basic format check', () => {
  assert.equal(isOptionalClientEmail(''), true);
  assert.equal(isOptionalClientEmail('   '), true);
  assert.equal(isOptionalClientEmail('buyer@example.com'), true);
  assert.equal(isOptionalClientEmail('not-an-email'), false);
  assert.equal(isOptionalClientEmail('a@b'), false);
  assert.equal(isOptionalClientEmail('a @b.com'), false);
  assert.equal(clientEmailForSave('  buyer@example.com  '), 'buyer@example.com');
  assert.equal(clientEmailForSave(''), null);
  assert.match(clientSource, /ClientEmailField/);
  assert.match(clientSource, /isOptionalClientEmail/);
  assert.match(serviceSource, /email: c\.email \|\| ''/);
  assert.match(serviceSource, /email: clientEmailForSave\(client\.email\)/);
  assert.equal(dispatchSource.includes('Flexible Laminate'), false);
  assert.equal(dispatchSource.includes('displayRollNumber'), true);
  assert.equal(dispatchSource.includes('nextBarcodeSuffix'), true);
  assert.equal(dispatchSource.includes('resolvePackingSubstrate'), true);
});
