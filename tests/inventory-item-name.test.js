import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { displayItemName } from '../src/services/inventoryIdentity.js';

const packed = 'CCPET-680-12 ||| {"category":"Film Substrates","filmType":"CCPET","micron":12,"widthMm":680,"density":1.4}';

test('display strips the json suffix from an inventory item name', () => {
  assert.equal(displayItemName(packed), 'CCPET-680-12');
  assert.equal(displayItemName('  PET 12µ  '), 'PET 12Micron');
  assert.equal(displayItemName(''), '');
});

test('inventory saves keep the display name and do not append the json suffix', () => {
  const source = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function mapInventoryItemToDbPayload');
  const end = source.indexOf('export async function fetchInventory');
  const fn = source.slice(start, end);
  assert.equal(fn.includes('|||'), false);
  assert.match(fn, /displayItemName\(clean\.itemName\)/);
  assert.match(fn, /item_name: itemNameStr/);
  assert.match(fn, /metadata: meta/);

  const read = source.slice(source.indexOf('export function sanitizeInventoryItem'), start);
  assert.match(read, /film_type \|\| cleanRaw\.filmType/);
  assert.match(read, /width_mm \?\? cleanRaw\.widthMm/);
  assert.match(read, /item_name: displayItemName\(cleanItemName\)/);
});
