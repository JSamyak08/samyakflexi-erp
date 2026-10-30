import test from 'node:test';
import assert from 'node:assert/strict';

import {
  displayAmendmentLabel,
  formatAmendmentLabel,
  parseOcnSequenceNumber,
  buildOcnAmendment,
  revisionNumber,
  nextRevisionNumber,
  ocnHistoryEntries
} from '../src/utils/ocnAmendment.js';
import { parseLocation, buildCanonical, buildHref } from '../src/utils/slugRouter.js';

test('parseOcnSequenceNumber extracts sequence digits from full OCN reference', () => {
  assert.equal(parseOcnSequenceNumber('SIL/OCN/26-27/124'), 124);
  assert.equal(parseOcnSequenceNumber('SIL/OCN/26-27/005'), 5);
  assert.equal(parseOcnSequenceNumber('SIL/OCN/26-27/999'), 999);
  assert.equal(parseOcnSequenceNumber('OCN-101'), 101);
  assert.equal(parseOcnSequenceNumber(''), null);
  assert.equal(parseOcnSequenceNumber(null), null);
});

test('OCN counter auto-increment progression logic advances sequentially', () => {
  let counter = 124;
  const generateNextOcn = (year = '26-27') => {
    const nextVal = counter++;
    return `SIL/OCN/${year}/${String(nextVal).padStart(3, '0')}`;
  };

  const ocn1 = generateNextOcn();
  assert.equal(ocn1, 'SIL/OCN/26-27/124');
  assert.equal(parseOcnSequenceNumber(ocn1), 124);

  const ocn2 = generateNextOcn();
  assert.equal(ocn2, 'SIL/OCN/26-27/125');
  assert.equal(parseOcnSequenceNumber(ocn2), 125);

  const ocn3 = generateNextOcn();
  assert.equal(ocn3, 'SIL/OCN/26-27/126');
  assert.equal(parseOcnSequenceNumber(ocn3), 126);
});

test('sync algorithm advances counter past maximum existing OCN sequence', () => {
  const existingList = [
    { ocnNumber: 'SIL/OCN/26-27/100' },
    { ocnNumber: 'SIL/OCN/26-27/124' },
    { ocnNumber: 'SIL/OCN/26-27/115' },
    { ocnNumber: 'SIL/OCN/26-27/080' }
  ];

  let currentCounter = 108;
  for (const item of existingList) {
    const seq = parseOcnSequenceNumber(item?.ocnNumber);
    if (seq && seq >= currentCounter) {
      currentCounter = seq + 1;
    }
  }

  assert.equal(currentCounter, 125, 'Synced counter should be 125 after encountering 124');

  // Next generated is 125
  const nextGenerated = `SIL/OCN/26-27/${String(currentCounter++).padStart(3, '0')}`;
  assert.equal(nextGenerated, 'SIL/OCN/26-27/125');
  assert.equal(currentCounter, 126);
});

test('OCN amendment tracking archives revisions and increments revision counter', () => {
  const originalOcn = {
    id: 'SIL/OCN/26-27/124',
    ocnNumber: 'SIL/OCN/26-27/124',
    orderId: 'ORD-2026-101',
    jobName: 'Frootnut 5G Balls Inner',
    clientName: 'Jai Graha Udyog',
    orderQtyKg: 400,
    minSellingPricePerKg: 185,
    layers: [{ filmType: 'PET', micron: 12 }],
    revisionNo: 0,
    amendmentNo: 'Rev 00',
    revisions: [],
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  assert.equal(revisionNumber(originalOcn), 0);
  assert.equal(displayAmendmentLabel(originalOcn), 'Rev 00');
  assert.equal(nextRevisionNumber(originalOcn), 1);

  // Amendment 1: Rate update and micron adjustment
  const amendedV1 = buildOcnAmendment(
    originalOcn,
    {
      minSellingPricePerKg: 195,
      layers: [{ filmType: 'PET', micron: 13 }],
      amendmentReason: 'Client requested thicker substrate and updated rate',
    },
    'Samyak Jain'
  );

  assert.equal(amendedV1.revisionNo, 1);
  assert.equal(amendedV1.amendmentNo, 'Rev 01');
  assert.equal(amendedV1.minSellingPricePerKg, 195);
  assert.equal(amendedV1.amendmentReason, 'Client requested thicker substrate and updated rate');
  assert.equal(amendedV1.amendedBy, 'Samyak Jain');
  assert.equal(amendedV1.revisions.length, 1);
  assert.equal(amendedV1.revisions[0].revisionNo, 0);
  assert.equal(amendedV1.revisions[0].snapshot.minSellingPricePerKg, 185);

  // Amendment 2: Quantity increase
  const amendedV2 = buildOcnAmendment(
    amendedV1,
    {
      orderQtyKg: 600,
      amendmentReason: 'Order quantity increased to 600 kg',
    },
    'Admin'
  );

  assert.equal(amendedV2.revisionNo, 2);
  assert.equal(amendedV2.amendmentNo, 'Rev 02');
  assert.equal(amendedV2.orderQtyKg, 600);
  assert.equal(amendedV2.minSellingPricePerKg, 195);
  assert.equal(amendedV2.revisions.length, 2);
  assert.equal(amendedV2.revisions[0].revisionNo, 0);
  assert.equal(amendedV2.revisions[1].revisionNo, 1);

  // History entries check
  const history = ocnHistoryEntries(amendedV2);
  assert.ok(history.length >= 3, 'History should contain current and 2 archived versions');
  assert.equal(history[0].amendmentNo, 'Rev 00');
  assert.equal(history[1].amendmentNo, 'Rev 01');
  assert.equal(history[2].amendmentNo, 'Rev 02');
  assert.equal(history[2].isCurrent, true);
});

test('OCN routing resolves canonical and section paths', () => {
  const parsedOcnsPath = parseLocation({ pathname: '/job-punching/ocns', search: '', hash: '' });
  assert.equal(parsedOcnsPath.unknown, false);
  assert.equal(parsedOcnsPath.tab, 'job_punching');
  assert.equal(parsedOcnsPath.section, 'ocns');

  const parsedQueryView = parseLocation({ pathname: '/job-punching', search: '?view=ocns', hash: '' });
  assert.equal(parsedQueryView.unknown, false);
  assert.equal(parsedQueryView.tab, 'job_punching');
  assert.equal(parsedQueryView.params.view, 'ocns');

  const canonicalForm = buildCanonical('job_punching', { section: 'form' });
  assert.equal(canonicalForm, '/job-punching');

  const canonicalOcns = buildCanonical('job_punching', { section: 'ocns' });
  assert.equal(canonicalOcns, '/job-punching/ocns');
});
