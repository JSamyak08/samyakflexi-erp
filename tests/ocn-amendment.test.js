import test from 'node:test';
import assert from 'node:assert/strict';
import {
  revisionNumber,
  nextRevisionNumber,
  formatAmendmentLabel,
  displayAmendmentLabel,
  parseOcnSequenceNumber,
  buildOcnAmendment,
  ocnHistoryEntries
} from '../src/utils/ocnAmendment.js';

test('untouched OCN starts at Rev 00 and revision number 0', () => {
  const ocn = {
    id: 'SIL/OCN/26-27/124',
    ocnNumber: 'SIL/OCN/26-27/124',
    clientName: 'Jai Graha Udyog',
    jobName: 'Frootnut 5G Balls Inner',
    orderQtyKg: 400
  };

  assert.equal(revisionNumber(ocn), 0);
  assert.equal(nextRevisionNumber(ocn), 1);
  assert.equal(displayAmendmentLabel(ocn), 'Rev 00');
  assert.equal(formatAmendmentLabel(0), 'Rev 00');
  assert.equal(formatAmendmentLabel(1), 'Rev 01');
  assert.equal(formatAmendmentLabel(12), 'Rev 12');
});

test('parseOcnSequenceNumber extracts sequence number from OCN string', () => {
  assert.equal(parseOcnSequenceNumber('SIL/OCN/26-27/124'), 124);
  assert.equal(parseOcnSequenceNumber('SIL/OCN/26-27/125'), 125);
  assert.equal(parseOcnSequenceNumber('SIL/OCN/26-27/999'), 999);
  assert.equal(parseOcnSequenceNumber('INVALID'), null);
});

test('buildOcnAmendment archives previous revision and advances to Rev 01', () => {
  const ocn = {
    id: 'SIL/OCN/26-27/124',
    ocnNumber: 'SIL/OCN/26-27/124',
    orderId: 'ORD-2026-220',
    clientName: 'Jai Graha Udyog',
    jobName: 'Frootnut 5G Balls Inner',
    orderQtyKg: 400,
    minSellingPricePerKg: 245,
    createdAt: '2026-10-30T10:00:00.000Z'
  };

  assert.throws(() => {
    buildOcnAmendment(ocn, { orderQtyKg: 500 });
  }, /Amendment reason is required/);

  const amended = buildOcnAmendment(
    ocn,
    {
      orderQtyKg: 500,
      minSellingPricePerKg: 240,
      amendmentReason: 'Client increased order quantity to 500 Kg'
    },
    'Samyak Jain'
  );

  assert.equal(amended.id, 'SIL/OCN/26-27/124');
  assert.equal(amended.revisionNo, 1);
  assert.equal(amended.amendmentNo, 'Rev 01');
  assert.equal(amended.status, 'Amended');
  assert.equal(amended.orderQtyKg, 500);
  assert.equal(amended.minSellingPricePerKg, 240);
  assert.equal(amended.amendedBy, 'Samyak Jain');
  assert.equal(amended.amendmentReason, 'Client increased order quantity to 500 Kg');
  assert.equal(amended.revisions.length, 1);
  assert.equal(amended.revisions[0].revisionNo, 0);
  assert.equal(amended.revisions[0].amendmentNo, 'Rev 00');
  assert.equal(amended.revisions[0].snapshot.orderQtyKg, 400);

  const history = ocnHistoryEntries(amended);
  assert.equal(history.length, 2);
  assert.equal(history[0].amendmentNo, 'Rev 00');
  assert.equal(history[0].isCurrent, false);
  assert.equal(history[1].amendmentNo, 'Rev 01');
  assert.equal(history[1].isCurrent, true);
});

