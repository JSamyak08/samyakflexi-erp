import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  PELLET_FUEL_ROLES,
  PELLET_FUEL_SHIFTS,
  buildPelletCompanionGrn,
  countActiveLoggingDays,
  findPelletInventoryItem,
  fuelActorName,
  pelletConsumptionFromRow,
  pelletInwardFromRow
} from '../src/services/pelletFuel.js';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261023190000_pellet_fuel_grn_and_vehicle.sql', import.meta.url),
  'utf8'
);
const rollbackSql = fs.readFileSync(
  new URL('../supabase/rollback/20261023190000_pellet_fuel_grn_and_vehicle_rollback.sql', import.meta.url),
  'utf8'
);

function readSource(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

async function pelletSchema(db) {
  await db.exec(`
    CREATE TABLE public.vendors (
      id text PRIMARY KEY,
      name text
    );
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      vendor_id text REFERENCES public.vendors(id),
      po_number text,
      invoice_number text,
      received_date date,
      item_name text,
      received_qty_kg numeric,
      status text,
      qc_remarks text,
      stock_item_id text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.pellet_inwards (
      id text PRIMARY KEY,
      grn_no text,
      inward_date date,
      inward_qty_kg numeric DEFAULT 0,
      unit_cost_per_kg numeric DEFAULT 0,
      total_amount numeric DEFAULT 0,
      payload jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.pellet_consumptions (
      id text PRIMARY KEY,
      consumption_date date,
      consumed_qty_kg numeric DEFAULT 0,
      operating_hours numeric DEFAULT 0,
      reference_printing_done_kg numeric DEFAULT 0,
      payload jsonb DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz DEFAULT now()
    );
  `);
}

function pelletRecord(overrides = {}) {
  return {
    id: 'PEL-1',
    grnNo: 'SIL/GRN/26-27/104',
    inwardDate: '2026-10-23',
    vendorId: 'VEND-1',
    vendorName: 'Acme Pellets',
    invoiceNo: 'INV-1',
    inwardQtyKg: 1000,
    unitCostPerKg: 18.5,
    storageLocation: 'Silo 2',
    receivedBy: 'Asha Rao',
    vehicleNo: 'MH12AB1234',
    remarks: 'dry lot',
    companionGrn: {
      stockItemId: 'INV-PEL',
      itemName: 'Wood Pellets',
      receivedQtyKg: 1000,
      status: 'Pending QC',
      qcNotes: '',
      poNumber: ''
    },
    ...overrides
  };
}

async function savePellet(db, record) {
  const json = JSON.stringify(record);
  const result = await db.query(
    `SELECT public.save_pellet_inward_with_grn($1::jsonb) AS saved`,
    [json]
  );
  const saved = result.rows[0].saved;
  return typeof saved === 'string' ? JSON.parse(saved) : saved;
}

test('pellet helpers use real fields and do not invent stock or people', () => {
  assert.equal(countActiveLoggingDays([], 2026, 9), 0);
  assert.equal(countActiveLoggingDays([
    { consumptionDate: '2026-10-02' },
    { consumptionDate: '2026-10-02' },
    { consumptionDate: '2026-10-03' },
    { consumptionDate: '2026-09-30' }
  ], 2026, 9), 2);

  const fromEmptyPayload = pelletInwardFromRow({
    id: 'PEL-9',
    grn_no: 'SIL/GRN/26-27/9',
    inward_date: '2026-10-01',
    inward_qty_kg: 500,
    unit_cost_per_kg: 12,
    total_amount: 6000,
    vehicle_no: 'MP09CC1001',
    payload: {}
  });
  assert.equal(fromEmptyPayload.inwardQtyKg, 500);
  assert.equal(fromEmptyPayload.unitCostPerKg, 12);
  assert.equal(fromEmptyPayload.totalAmount, 6000);
  assert.equal(fromEmptyPayload.vehicleNo, 'MP09CC1001');
  assert.equal(fromEmptyPayload.grnNo, 'SIL/GRN/26-27/9');

  const merged = pelletInwardFromRow({
    id: 'PEL-9',
    inward_qty_kg: 500,
    vehicle_no: 'MP09CC1001',
    payload: { id: 'PEL-9', vendorName: 'Acme Pellets', inwardQtyKg: 500, vehicleNo: '' }
  });
  assert.equal(merged.vendorName, 'Acme Pellets');
  assert.equal(merged.inwardQtyKg, 500);
  assert.equal(merged.vehicleNo, 'MP09CC1001');

  const consumption = pelletConsumptionFromRow({
    id: 'CON-1',
    consumption_date: '2026-10-02',
    consumed_qty_kg: 80,
    operating_hours: 6,
    reference_printing_done_kg: 400,
    payload: {}
  });
  assert.equal(consumption.consumedQtyKg, 80);
  assert.equal(consumption.operatingHours, 6);
  assert.equal(consumption.referencePrintingDoneKg, 400);

  const inventory = [
    { id: 'INV-INK', itemName: 'Red Ink', category: 'Ink', itemCode: 'INK-1' },
    { id: 'INV-BIO', itemName: 'Biofuel Mix', category: 'Fuel', itemCode: 'BIO-1' },
    { id: 'INV-PEL', itemName: 'Wood Pellets', category: 'Fuel', itemCode: 'PEL-1' }
  ];
  assert.equal(findPelletInventoryItem(inventory).id, 'INV-PEL');
  assert.equal(findPelletInventoryItem([]), null);

  assert.throws(
    () => buildPelletCompanionGrn({ vendorId: 'V1', vendorName: 'Acme' }, null),
    /pellet fuel item/
  );
  assert.throws(
    () => buildPelletCompanionGrn({ vendorId: '', vendorName: '' }, inventory[2]),
    /vendor list/
  );
  const companion = buildPelletCompanionGrn({
    id: 'PEL-1',
    grnNo: 'SIL/GRN/26-27/104',
    vendorId: 'VEND-1',
    vendorName: 'Acme Pellets',
    inwardDate: '2026-10-23',
    inwardQtyKg: 10,
    unitCostPerKg: 18.5,
    storageLocation: 'Silo 2',
    receivedBy: 'Asha Rao',
    vehicleNo: 'MH12AB1234'
  }, inventory[2]);
  assert.equal(companion.stockItemId, 'INV-PEL');
  assert.equal(companion.plainItemName, 'Wood Pellets');
  assert.equal(companion.isPelletFuel, true);
  assert.equal(companion.itemName.includes('Boiler Wood Pellets'), false);
  assert.equal(JSON.parse(companion.itemName.split('|||')[1]).isPelletFuel, true);

  assert.equal(fuelActorName({ name: 'User', email: 'asha@samyakinternational.in' }), 'asha@samyakinternational.in');
  assert.equal(fuelActorName({ full_name: 'Asha Rao', name: 'User' }), 'Asha Rao');
  assert.equal(fuelActorName(null), '');
  assert.deepEqual(PELLET_FUEL_SHIFTS.map((shift) => shift.label), ['Shift A (Day)', 'Shift B (Night)', 'Full Day 24h']);
  assert.equal(PELLET_FUEL_ROLES.includes('Sales Manager'), false);
  assert.equal(PELLET_FUEL_ROLES.includes('Printing Operator'), false);
  assert.equal(PELLET_FUEL_ROLES.includes('Shop Floor Operator'), false);
  assert.equal(PELLET_FUEL_ROLES.includes('Store Manager'), true);
});

test('pellet screens no longer ship the old placeholder values', () => {
  const ui = readSource('src/components/PelletFuelManagement.jsx');
  const service = readSource('src/services/supabaseDataService.js');
  const schema = readSource('supabase_schema.sql');
  const factory = readSource('src/factoryStore.js');

  for (const phrase of ['GRN-PEL-', 'Boiler Fuel Bay', 'Boiler Wood Pellets', 'Direct Factory Purchase', 'modal-backdrop']) {
    assert.equal(ui.includes(phrase), false, phrase);
  }
  assert.equal(ui.includes('|| 12'), false);
  assert.equal(ui.includes('.size || 1'), false);
  assert.match(ui, /countActiveLoggingDays/);
  assert.match(ui, /value=\{iVehicleNo\}/);
  assert.match(service, /Could not check for a duplicate GRN invoice/);
  assert.match(service, /save_pellet_inward_with_grn/);
  assert.match(schema, /vehicle_no TEXT/);
  assert.match(schema, /pellet_grn_counters/);
  assert.match(factory, /key: "pellet_fuel"/);
  assert.match(factory, /"Shop Floor Operator"/);
});

test('pellet migration is idempotent and grants only the pellet permission', async () => {
  const db = new PGlite();
  try {
    await pelletSchema(db);
    await db.exec(`
      INSERT INTO public.grns (id, grn_number) VALUES
        ('NULL-A', NULL),
        ('NULL-B', NULL),
        ('LIVE-1', 'SIL/GRN/26-27/1');
      INSERT INTO public.role_permissions (role, permissions, updated_at) VALUES
        ('Store Manager', '{"inventory": true}', '2026-01-01'),
        ('Sales Manager', '{"pellet_fuel": false, "sales": true}', '2026-01-01'),
        ('Admin', '{"pellet_fuel": true, "user_management": true}', '2026-01-01');
    `);
    await db.exec(migrationSql);
    await db.exec(migrationSql);

    const column = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pellet_inwards' AND column_name = 'vehicle_no'
    `);
    assert.equal(column.rows.length, 1);

    const security = await db.query(`
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pellet_grn_counters'
    `);
    assert.equal(security.rows[0].relrowsecurity, false);

    const index = await db.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'grns_grn_number_uidx'
    `);
    assert.equal(index.rows.length, 1);

    const roles = await db.query(`
      SELECT role, permissions, updated_at::date::text AS updated_on
      FROM public.role_permissions
      ORDER BY role
    `);
    const byRole = Object.fromEntries(roles.rows.map((row) => [
      row.role,
      { ...row, permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions }
    ]));
    assert.equal(byRole['Store Manager'].permissions.inventory, true);
    assert.equal(byRole['Store Manager'].permissions.pellet_fuel, true);
    assert.equal(byRole['Sales Manager'].permissions.pellet_fuel, false);
    assert.equal(byRole['Sales Manager'].permissions.sales, true);
    assert.equal(byRole.Admin.permissions.user_management, true);
    assert.equal(byRole.Admin.updated_on, '2026-01-01');
  } finally {
    await db.close();
  }
});

test('duplicate GRN numbers skip the unique index and still apply the rest', async () => {
  const db = new PGlite();
  try {
    await pelletSchema(db);
    await db.exec(`
      INSERT INTO public.grns (id, grn_number) VALUES
        ('DUP-A', 'SIL/GRN/26-27/7'),
        ('DUP-B', 'SIL/GRN/26-27/7');
      INSERT INTO public.role_permissions (role, permissions) VALUES
        ('QC Chemist', '{"inventory": true}');
    `);
    await db.exec(migrationSql);

    const index = await db.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'grns_grn_number_uidx'
    `);
    assert.equal(index.rows.length, 0);
    const chemist = await db.query(`SELECT permissions FROM public.role_permissions WHERE role = 'QC Chemist'`);
    const chemistPermissions = typeof chemist.rows[0].permissions === 'string'
      ? JSON.parse(chemist.rows[0].permissions)
      : chemist.rows[0].permissions;
    assert.equal(chemistPermissions.pellet_fuel, true);
    assert.equal(chemistPermissions.inventory, true);
  } finally {
    await db.close();
  }
});

test('pellet GRN numbers come from the server series and a failed GRN rolls back', async () => {
  const db = new PGlite();
  try {
    await pelletSchema(db);
    await db.exec(migrationSql);
    await db.exec(`
      INSERT INTO public.vendors (id, name) VALUES ('VEND-1', 'Acme Pellets');
      INSERT INTO public.grns (id, grn_number) VALUES ('OLD', 'SIL/GRN/26-27/103');
      INSERT INTO public.system_settings (setting_key, setting_value)
        VALUES ('doc_prefixes', '{"grnPrefix":"SIL/GRN/26-27/","grnCounter":104}');
    `);

    const first = await db.query(`SELECT public.allocate_pellet_grn_number('SIL/GRN/26-27/') AS n`);
    const second = await db.query(`SELECT public.allocate_pellet_grn_number('SIL/GRN/26-27/') AS n`);
    assert.equal(first.rows[0].n, 'SIL/GRN/26-27/104');
    assert.equal(second.rows[0].n, 'SIL/GRN/26-27/105');
    assert.notEqual(first.rows[0].n, second.rows[0].n);

    await assert.rejects(
      () => db.query(`SELECT public.allocate_pellet_grn_number('')`),
      /GRN prefix/
    );

    const saved = await savePellet(db, pelletRecord());
    assert.equal(saved.pellet.grnNo, 'SIL/GRN/26-27/104');
    assert.equal(saved.pellet.vehicleNo, 'MH12AB1234');
    assert.equal(saved.pellet.companionGrn, undefined);

    const pellet = await db.query(`SELECT grn_no, vehicle_no, inward_qty_kg, total_amount, payload FROM public.pellet_inwards`);
    assert.equal(pellet.rows.length, 1);
    assert.equal(pellet.rows[0].grn_no, 'SIL/GRN/26-27/104');
    assert.equal(pellet.rows[0].vehicle_no, 'MH12AB1234');
    assert.equal(Number(pellet.rows[0].inward_qty_kg), 1000);
    assert.equal(Number(pellet.rows[0].total_amount), 18500);
    assert.equal(pellet.rows[0].payload.companionGrn, undefined);

    const grn = await db.query(`SELECT id, grn_number, vendor_id, item_name, stock_item_id, received_qty_kg FROM public.grns WHERE id = 'PEL-1'`);
    assert.equal(grn.rows[0].grn_number, 'SIL/GRN/26-27/104');
    assert.equal(grn.rows[0].vendor_id, 'VEND-1');
    assert.equal(grn.rows[0].item_name, 'Wood Pellets');
    assert.equal(grn.rows[0].stock_item_id, 'INV-PEL');
    assert.equal(Number(grn.rows[0].received_qty_kg), 1000);

    const unknownVendor = await savePellet(db, pelletRecord({
      id: 'PEL-UNKNOWN',
      grnNo: 'SIL/GRN/26-27/106',
      invoiceNo: 'INV-UNKNOWN',
      vendorId: 'VEND-MISSING',
      vendorName: 'Missing Vendor'
    }));
    assert.equal(unknownVendor.pellet.id, 'PEL-UNKNOWN');
    const unknownRow = await db.query(`SELECT vendor_id FROM public.grns WHERE id = 'PEL-UNKNOWN'`);
    assert.equal(unknownRow.rows[0].vendor_id, null);

    await assert.rejects(
      () => savePellet(db, pelletRecord({
        id: 'PEL-DUP',
        grnNo: 'SIL/GRN/26-27/107',
        invoiceNo: 'INV-1'
      })),
      /Duplicate Inward GRN/
    );
    const afterDuplicate = await db.query(`SELECT count(*)::int AS n FROM public.pellet_inwards WHERE id = 'PEL-DUP'`);
    assert.equal(afterDuplicate.rows[0].n, 0);

    await assert.rejects(
      () => savePellet(db, pelletRecord({
        id: 'PEL-TAKEN',
        grnNo: 'SIL/GRN/26-27/103',
        invoiceNo: 'INV-TAKEN'
      })),
      /already in use/
    );
    const afterTaken = await db.query(`SELECT count(*)::int AS n FROM public.pellet_inwards WHERE id = 'PEL-TAKEN'`);
    assert.equal(afterTaken.rows[0].n, 0);

    await db.exec(`
      CREATE OR REPLACE FUNCTION public._pellet_grn_boom()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NEW.invoice_number = 'BOOM' THEN
          RAISE EXCEPTION 'forced grn failure';
        END IF;
        RETURN NEW;
      END;
      $fn$;
      CREATE TRIGGER pellet_grn_boom
      BEFORE INSERT ON public.grns
      FOR EACH ROW EXECUTE FUNCTION public._pellet_grn_boom();
    `);
    await assert.rejects(
      () => savePellet(db, pelletRecord({
        id: 'PEL-BOOM',
        grnNo: 'SIL/GRN/26-27/108',
        invoiceNo: 'BOOM'
      })),
      /forced grn failure/
    );
    const afterBoom = await db.query(`
      SELECT
        (SELECT count(*)::int FROM public.pellet_inwards WHERE id = 'PEL-BOOM') AS pellets,
        (SELECT count(*)::int FROM public.grns WHERE id = 'PEL-BOOM') AS grns
    `);
    assert.equal(afterBoom.rows[0].pellets, 0);
    assert.equal(afterBoom.rows[0].grns, 0);

    const allocated = await savePellet(db, pelletRecord({
      id: 'PEL-ALLOC',
      grnNo: '',
      invoiceNo: 'INV-ALLOC',
      grnPrefix: 'SIL/GRN/26-27/'
    }));
    assert.match(allocated.pellet.grnNo, /^SIL\/GRN\/26-27\/\d+$/);
    const allocatedRow = await db.query(`SELECT grn_no FROM public.pellet_inwards WHERE id = 'PEL-ALLOC'`);
    assert.equal(allocatedRow.rows[0].grn_no, allocated.pellet.grnNo);
  } finally {
    await db.close();
  }
});

test('pellet rollback removes the functions, counter, index, and vehicle column', async () => {
  const db = new PGlite();
  try {
    await pelletSchema(db);
    await db.exec(migrationSql);
    await db.exec(`INSERT INTO public.pellet_inwards (id, vehicle_no) VALUES ('KEEP', 'MH01')`);
    await db.exec(rollbackSql);

    const leftovers = await db.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('allocate_pellet_grn_number', 'save_pellet_inward_with_grn')
    `);
    assert.equal(leftovers.rows.length, 0);
    const index = await db.query(`
      SELECT indexname FROM pg_indexes WHERE indexname = 'grns_grn_number_uidx'
    `);
    assert.equal(index.rows.length, 0);
    const column = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pellet_inwards' AND column_name = 'vehicle_no'
    `);
    assert.equal(column.rows.length, 0);
    const kept = await db.query(`SELECT id FROM public.pellet_inwards WHERE id = 'KEEP'`);
    assert.equal(kept.rows.length, 1);
  } finally {
    await db.close();
  }
});
