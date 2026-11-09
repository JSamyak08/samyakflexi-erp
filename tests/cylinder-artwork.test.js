import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artworkToApply,
  displayArtworkUrl,
  isExplicitCylinderJobLink
} from '../src/utils/cylinderArtwork.js';
import { buildCylinderJobCardDraft, findMatchingJobMaster } from '../src/utils/cylinderJobCardDraft.js';

const fileFor = (sku) => `https://example.supabase.co/storage/v1/object/public/erp-files/artwork/${sku}_1710000000000.jpg`;

test('a cylinder shows its own artwork file and not another SKU', () => {
  const own = fileFor('SKU-CYL-518');
  const other = fileFor('SKU-CYL-513');
  const row = { id: 'c-518', sku: 'SKU-CYL-518', jobName: 'Sonu gold mango mirchi', artworkUrl: own };
  const wrong = { ...row, artworkUrl: other };
  assert.equal(displayArtworkUrl(row, [row]), own);
  assert.equal(displayArtworkUrl(wrong, [wrong]), '');
});

test('a file shared by two different jobs is not shown on the job it does not name', () => {
  const shared = fileFor('SKU-CYL-513');
  const owner = { id: 'c-513', sku: 'SKU-CYL-513', jobName: 'Prime Corn', artworkUrl: shared };
  const copy = { id: 'c-518', sku: 'SKU-CYL-518', jobName: 'Sonu gold mango mirchi', artworkUrl: shared };
  const rows = [owner, copy];
  assert.equal(displayArtworkUrl(owner, rows), shared);
  assert.equal(displayArtworkUrl(copy, rows), '');
});

test('a legacy file with no identity is shown only when no other job uses it', () => {
  const shared = 'https://cdn.example.com/artwork/proof.jpg';
  const a = { id: 'a', sku: 'SKU-CYL-1', jobName: 'Alpha', artworkUrl: shared };
  const b = { id: 'b', sku: 'SKU-CYL-2', jobName: 'Beta', artworkUrl: shared };
  assert.equal(displayArtworkUrl(a, [a]), shared);
  assert.equal(displayArtworkUrl(a, [a, b]), '');
  assert.equal(displayArtworkUrl(b, [a, b]), '');
});

test('an upload named for this job is shown, and a missing file stays a placeholder', () => {
  const named = 'https://cdn.example.com/artwork/Sonu_gold_mango_mirchi_1710000000000.jpg';
  const row = { id: 'c-518', sku: 'SKU-CYL-518', jobName: 'Sonu gold mango mirchi', artworkUrl: named };
  assert.equal(displayArtworkUrl(row, [row]), named);
  assert.equal(displayArtworkUrl({ id: 'c-1', sku: 'SKU-CYL-1', jobName: 'Plain', artworkUrl: '' }, []), '');
});

test('sync copies artwork only across an explicit id link, and never a foreign SKU', () => {
  const cylinder = { id: 'c-518', sku: 'SKU-CYL-518', jobName: 'Sonu', jobMasterId: 'JM-9', artworkUrl: fileFor('SKU-CYL-518') };
  const linked = { id: 'JM-9', skuCode: 'SKU-CYL-518', jobName: 'Sonu', artworkUrl: '' };
  const sameName = { id: 'JM-OTHER', skuCode: 'SKU-CYL-999', jobName: 'Sonu', artworkUrl: fileFor('SKU-CYL-999') };

  assert.equal(isExplicitCylinderJobLink(cylinder, linked), true);
  assert.equal(isExplicitCylinderJobLink(cylinder, sameName), false);
  assert.equal(artworkToApply({ source: cylinder, target: linked, explicit: true }), fileFor('SKU-CYL-518'));
  assert.equal(artworkToApply({ source: sameName, target: cylinder, explicit: false }), fileFor('SKU-CYL-518'));
  assert.equal(
    artworkToApply({ source: { artworkUrl: fileFor('SKU-CYL-513') }, target: cylinder, explicit: true }),
    fileFor('SKU-CYL-518')
  );
});

test('job card lookup does not borrow a different record that only shares an id or a repeated name', () => {
  const cylinder = { id: 'CYL-1', sku: 'SKU-CYL-518', jobName: 'Sonu gold mango mirchi', artworkUrl: '' };
  const collided = { id: 'CYL-1', skuCode: 'OTHER', jobName: 'Other job', artworkUrl: fileFor('SKU-CYL-1') };
  const twinA = { id: 'JM-A', skuCode: 'A', jobName: 'Sonu gold mango mirchi', artworkUrl: fileFor('SKU-CYL-100') };
  const twinB = { id: 'JM-B', skuCode: 'B', jobName: 'Sonu gold mango mirchi', artworkUrl: fileFor('SKU-CYL-200') };
  assert.equal(findMatchingJobMaster([collided, twinA, twinB], cylinder), null);

  const draft = buildCylinderJobCardDraft(cylinder, null);
  assert.equal(draft.artworkUrl, '');
});
