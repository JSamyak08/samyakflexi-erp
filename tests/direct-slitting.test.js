import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFilmRollLength } from '../src/factoryStore.js';
import {
  DIRECT_SLITTING_ROLES,
  applyDirectSlittingDefaults,
  generateFullRolePermissions
} from '../src/factoryStore.js';
import { assessDirectSlitting, directSlitItemName, filmMetresFromKg } from '../src/utils/directSlitting.js';
import { generateSingleStickerHtml } from '../src/utils/thermalBarcodePrinter.js';
import { roleHasModule } from '../src/bootAccess.js';
import fs from 'node:fs';
import { postDirectSlitting, reverseDirectSlitting } from '../src/services/directSlitting.js';

const parent = {
  barcode: 'RM-1',
  consumedKg: 60,
  availableKg: 100,
  widthMm: 1000,
  micron: 12,
  density: 1.4,
  lengthMeters: 5952,
  filmType: 'PET'
};

test('child metres use weight, width, micron, and density', () => {
  assert.equal(filmMetresFromKg({ kg: 36, widthMm: 600, micron: 12, density: 1.4 }), calculateFilmRollLength(36, 600, 12, 'PET'));
  assert.equal(directSlitItemName({ filmType: 'PET', widthMm: 520, micron: 12 }), 'PET-520-12');
  assert.equal(directSlitItemName({ filmType: 'NMET', widthMm: 410, micron: 15, metallocenePct: '20%' }), 'NMET-410-15-20%');
});

test('a proportional slit is inside tolerance and a short kilogram needs an override', () => {
  const balanced = assessDirectSlitting({
    filmType: 'PET',
    micron: 12,
    density: 1.4,
    widthMm: 1000,
    parents: [parent],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 36, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 24, lane: 2 }
    ]
  });
  assert.equal(balanced.ok, true);
  assert.equal(balanced.varianceKg, 0);
  assert.equal(balanced.overrideRequired, false);
  assert.equal(balanced.metresStatus, 'ok');
  assert.equal(balanced.outputs[0].suggestedName, 'PET-600-12');

  const short = assessDirectSlitting({
    ...balanced,
    parents: [parent],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 30, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 20, lane: 2 }
    ],
    trimScrapKg: 1,
    settingScrapKg: 1
  });
  assert.equal(short.varianceKg, 8);
  assert.equal(short.overrideRequired, true);
});

test('stored length far from the weighed metres blocks, and a mild gap only warns', () => {
  const blocked = assessDirectSlitting({
    filmType: 'PET',
    micron: 12,
    density: 1.4,
    parents: [{ ...parent, lengthMeters: 1000 }],
    outputs: [
      { widthMm: 600, netKg: 36, lane: 1 },
      { widthMm: 400, netKg: 24, lane: 2 }
    ]
  });
  assert.equal(blocked.metresStatus, 'block');
  assert.equal(blocked.overrideRequired, true);

  const warned = assessDirectSlitting({
    filmType: 'PET',
    micron: 12,
    density: 1.4,
    parents: [{ ...parent, lengthMeters: 6600 }],
    outputs: [
      { widthMm: 600, netKg: 36, lane: 1 },
      { widthMm: 400, netKg: 24, lane: 2 }
    ]
  });
  assert.equal(warned.metresStatus, 'warn');
  assert.equal(warned.overrideRequired, false);
});

test('direct slitting permission defaults to four roles and keeps an explicit false', () => {
  const defaults = generateFullRolePermissions(false);
  assert.equal(defaults['Store Manager'].direct_slitting, true);
  assert.equal(defaults['Production Manager'].direct_slitting, true);
  assert.equal(defaults['Plant Manager'].direct_slitting, true);
  assert.equal(defaults['Admin'].direct_slitting, true);
  assert.equal(defaults['Shop Floor Operator'].direct_slitting, false);
  assert.equal(defaults['Printing Operator'].direct_slitting, false);
  assert.equal(defaults['Sales Manager'].direct_slitting, false);
  const filled = applyDirectSlittingDefaults({
    'Store Manager': { inventory: true, direct_slitting: false },
    'Sales Manager': { sales: true }
  });
  assert.equal(filled['Store Manager'].direct_slitting, false);
  assert.equal(filled['Store Manager'].inventory, true);
  assert.equal(filled['Sales Manager'].direct_slitting, false);
  assert.equal(DIRECT_SLITTING_ROLES.includes('Shop Floor Operator'), false);
});

test('a slit child sticker names the parent roll', () => {
  const html = generateSingleStickerHtml({
    barcodeId: 'RM-BC-CHILD',
    itemName: 'PET-600-12',
    filmType: 'PET',
    micron: 12,
    widthMm: 600,
    netWeightKg: 36,
    rollType: 'RAW_MATERIAL',
    category: 'Film Substrates',
    parentBarcodeId: 'RM-PARENT'
  }, { name: 'SAMYAK INTERNATIONAL LTD.' });
  assert.match(html, /Split from:/);
  assert.match(html, /RM-PARENT/);
});

test('inventory shows direct slitting only when the permission is on', () => {
  const defaults = generateFullRolePermissions(false);
  assert.equal(roleHasModule(defaults, 'Store Manager', 'direct_slitting'), true);
  assert.equal(roleHasModule(defaults, 'Shop Floor Operator', 'direct_slitting'), false);
  assert.equal(roleHasModule(defaults, 'Admin', 'direct_slitting'), true);
  const screen = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  assert.match(screen, /canDirectSlit &&/);
  assert.match(screen, /Direct slitting/);
  const modal = fs.readFileSync(new URL('../src/components/DirectSlittingModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /ModalOverlay/);
  assert.match(modal, /postDirectSlitting/);
  assert.match(modal, /UniversalBarcodeScannerModal/);
  assert.match(modal, /BarcodePrinterModal/);
});

test('the client posts and reverses only through the database functions', async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { id: 'CONV-1' }, error: null };
    }
  };
  assert.deepEqual(await postDirectSlitting(supabase, { id: 'CONV-1' }), { id: 'CONV-1' });
  assert.equal(calls[0].name, 'post_roll_conversion');
  assert.deepEqual(await reverseDirectSlitting(supabase, 'CONV-1', 'wrong width'), { id: 'CONV-1' });
  assert.equal(calls[1].name, 'reverse_roll_conversion');
  assert.equal(calls[1].args.p_reason, 'wrong width');
  supabase.rpc = async () => ({ data: null, error: new Error('Not allowed to post a direct slit') });
  await assert.rejects(() => postDirectSlitting(supabase, {}), /Not allowed/);
});
