import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectLegacyRecords,
  vendorBlankPatch,
  importLegacyBusinessRecords,
  rowsMissingFrom
} from '../src/services/businessRecords.js';
import { isBusinessLocalKey } from '../src/utils/safeStorage.js';

function createFakeSupabase() {
  const tables = new Map();
  const rowsOf = (table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };

  function from(table) {
    let operation = 'select';
    let payload = null;
    let conflict = 'id';
    let patch = null;
    const filters = [];
    let single = false;

    const matches = (row) => filters.every((filter) => {
      if (filter[0] === 'eq') return String(row[filter[1]]) === String(filter[2]);
      if (filter[0] === 'in') return filter[2].map(String).includes(String(row[filter[1]]));
      return true;
    });

    const exec = () => {
      const rows = rowsOf(table);
      if (operation === 'select') {
        const data = rows.filter(matches);
        return { data: single ? (data[0] || null) : data, error: null };
      }
      if (operation === 'insert' || operation === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        list.forEach((row) => {
          const index = rows.findIndex((existing) => String(existing[conflict]) === String(row[conflict]));
          if (index >= 0) rows[index] = { ...rows[index], ...row };
          else rows.push({ ...row });
        });
        return { data: list, error: null };
      }
      if (operation === 'update') {
        rows.forEach((row, index) => {
          if (matches(row)) rows[index] = { ...row, ...patch };
        });
        return { data: null, error: null };
      }
      if (operation === 'delete') {
        tables.set(table, rows.filter((row) => !matches(row)));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };

    const builder = {
      select() { operation = 'select'; return builder; },
      insert(rows) { operation = 'insert'; payload = rows; return builder; },
      upsert(rows, options = {}) {
        operation = 'upsert';
        payload = rows;
        conflict = options.onConflict || 'id';
        return builder;
      },
      update(next) { operation = 'update'; patch = next; return builder; },
      delete() { operation = 'delete'; return builder; },
      eq(column, value) { filters.push(['eq', column, value]); return builder; },
      in(column, values) { filters.push(['in', column, values]); return builder; },
      order() { return builder; },
      maybeSingle() { single = true; return builder; },
      then(resolve, reject) {
        try { resolve(exec()); } catch (error) { reject(error); }
      }
    };
    return builder;
  }

  return { from, rowsOf };
}

test('legacy copies collapse to one row per id and keep the first source', () => {
  const bundle = collectLegacyRecords({
    local: {
      samyak_cache_material_indents: [{ id: 'IND-1', item: 'PET' }],
      samyak_erp_custom_barcodes: { 'TX-1': 'BAR-1' }
    },
    settings: {
      material_indents: [{ id: 'IND-1', item: 'OLDER' }, { id: 'IND-2', item: 'LD' }],
      custom_barcodes: { 'TX-1': 'BAR-OLD', 'TX-2': 'BAR-2' }
    }
  });
  assert.deepEqual(bundle.lists.material_indents.map((row) => row.id).sort(), ['IND-1', 'IND-2']);
  assert.equal(bundle.lists.material_indents.find((row) => row.id === 'IND-1').item, 'PET');
  assert.equal(bundle.lists.custom_barcodes.find((row) => row.id === 'TX-1').barcode, 'BAR-1');
  assert.equal(bundle.lists.custom_barcodes.find((row) => row.id === 'TX-2').barcode, 'BAR-2');
});

test('vendor blank fill does not overwrite a GSTIN already stored', () => {
  const patch = vendorBlankPatch(
    { id: 'V-1', gstin: '23AAAAA0000A1Z5', paymentTerms: '45 Days', phone: '99999' },
    { id: 'V-1', gstin: '23BBBBB0000B1Z5', payment_terms: '', phone: '88888' }
  );
  assert.equal(patch.gstin, undefined);
  assert.equal(patch.phone, undefined);
  assert.equal(patch.payment_terms, '45 Days');
});

test('rows missing from the server are the only ones returned', () => {
  const missing = rowsMissingFrom(['A', 'B'], [{ id: 'A' }, { id: 'C' }, { id: '' }]);
  assert.deepEqual(missing.map((row) => row.id), ['C']);
});

test('import uploads a browser purchase order once and keeps an existing server row', async () => {
  const supabase = createFakeSupabase();
  supabase.rowsOf('purchase_orders').push({
    id: 'PO-OLD',
    po_number: 'PO-OLD',
    vendor_name: 'Already There',
    items: []
  });
  const local = {
    samyak_cache_purchase_orders: [
      { id: 'PO-NEW', poNumber: 'PO-NEW', poDate: '21/10/2026', vendorName: 'Ink House', items: [{ sku: 'CYAN' }] },
      { id: 'PO-NEW-COPY', poNumber: 'PO-NEW', poDate: '2026-10-22', vendorName: 'Duplicate' },
      { id: 'PO-OLD', poNumber: 'PO-OLD', vendorName: 'Should Not Replace', items: [{ sku: 'NEW' }] }
    ],
    samyak_cache_vendors: [
      { id: 'V-1', name: 'Film Co', gstin: '23AABCM3526F1ZY', paymentTerms: '30 Days Net' }
    ]
  };

  const first = await importLegacyBusinessRecords({ supabase, local, settings: {} });
  const second = await importLegacyBusinessRecords({ supabase, local, settings: {} });
  const orders = supabase.rowsOf('purchase_orders');
  const vendors = supabase.rowsOf('vendors');

  assert.equal(first.purchase_orders, 1);
  assert.equal(second.purchase_orders, 0);
  assert.equal(orders.filter((row) => row.po_number === 'PO-NEW').length, 1);
  assert.equal(orders.find((row) => row.po_number === 'PO-NEW').po_date, '2026-10-21');
  assert.equal(orders.find((row) => row.po_number === 'PO-OLD').vendor_name, 'Already There');
  assert.equal(vendors[0].gstin, '23AABCM3526F1ZY');
  assert.equal(second.vendors, 0);
});

test('business record keys are refused and UI preferences stay writable', () => {
  assert.equal(isBusinessLocalKey('samyak_cache_orders'), true);
  assert.equal(isBusinessLocalKey('samyak_erp_jobcard_settings_SKU1'), true);
  assert.equal(isBusinessLocalKey('sfg_qc_hold_items'), true);
  assert.equal(isBusinessLocalKey('samyak_company_logo'), false);
  assert.equal(isBusinessLocalKey('samyak_erp_scale_config'), false);
  assert.equal(isBusinessLocalKey('sb-eamstsaqkbeiywfaanhi-auth-token'), false);
});
