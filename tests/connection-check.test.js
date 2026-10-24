import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sessionCanReadTables } from '../src/services/supabaseClient.js';

test('a table probe requires a user access token', () => {
  assert.equal(sessionCanReadTables(null), false);
  assert.equal(sessionCanReadTables(undefined), false);
  assert.equal(sessionCanReadTables({}), false);
  assert.equal(sessionCanReadTables({ access_token: '' }), false);
  assert.equal(sessionCanReadTables({ access_token: 'user-jwt' }), true);
});

test('the orders count probe runs only after a session can read tables', () => {
  const src = fs.readFileSync(new URL('../src/services/supabaseClient.js', import.meta.url), 'utf8');
  const guard = src.indexOf('sessionCanReadTables(session)');
  const orders = src.indexOf("from('orders')");
  assert.ok(guard > 0);
  assert.ok(orders > guard);

  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /if \(!isAuthenticated\) return undefined;\s*runDatabaseHealthCheck\(\)/);
  assert.match(app, /if \(res\?\.skipped\) \{/);
});

test('numeric barcode and id values trim the same way strings do', () => {
  const ledgerBarcode = (value) => String(value || '').trim();
  const identity = (record) => String(record.barcodeId || record.id || '').trim().toLowerCase();

  assert.equal(ledgerBarcode('  RM-BC-1  '), 'RM-BC-1');
  assert.equal(ledgerBarcode(''), '');
  assert.equal(ledgerBarcode(null), '');
  assert.equal(ledgerBarcode(8901234567890), '8901234567890');
  assert.equal(identity({ barcodeId: 8901234567890, id: 11 }), '8901234567890');
  assert.equal(identity({ barcodeId: '', id: 42 }), '42');
  assert.equal(identity({ barcodeId: '  AbC  ', id: 7 }), 'abc');
  assert.doesNotThrow(() => identity({ barcodeId: 15, id: 'keep-string' }));
});
