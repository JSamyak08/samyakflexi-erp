import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SYSTEM_ROLES } from '../src/roles.js';
import { findDuplicateInvoice, pendingQcKgForItem } from '../src/services/grnDocument.js';
import { canDeleteInwardQcInspection } from '../src/services/grnLifecycle.js';
import { receivedQtyForPurchaseOrder } from '../src/utils/poAmendment.js';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261105120000_delete_inward_qc_inspection.sql', import.meta.url),
  'utf8'
);
const inventoryUi = fs.readFileSync(
  new URL('../src/components/InventoryManagement.jsx', import.meta.url),
  'utf8'
);

function authId(index) {
  return `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

const ROLE_IDS = Object.fromEntries(SYSTEM_ROLES.map((role, index) => [role, authId(index)]));

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA IF NOT EXISTS private;

    CREATE TABLE public.users (
      id text PRIMARY KEY,
      username text,
      full_name text,
      email text,
      role text,
      assigned_roles text[] DEFAULT '{}'::text[],
      active boolean DEFAULT true,
      status text DEFAULT 'Active',
      auth_user_id uuid
    );
    CREATE TABLE public.vendors (
      id text PRIMARY KEY,
      name text
    );
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      vendor_id text,
      po_number text,
      invoice_number text,
      received_date date,
      item_name text,
      received_qty_kg numeric,
      status text,
      qc_remarks text,
      created_at timestamptz DEFAULT now(),
      metallocene_pct text,
      stock_item_id text,
      master_item_id text
    );
    CREATE TABLE public.grn_line_items (
      id text PRIMARY KEY,
      grn_id text,
      line_no integer,
      po_line_id text,
      category text,
      item_name text,
      film_type text,
      micron numeric,
      width_mm numeric,
      metallocene_pct text,
      unit text,
      stock_item_id text,
      master_item_id text,
      purchase_rate numeric,
      batch_no text,
      packaging_type text,
      rolls_received integer,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      net_weight_kg numeric,
      invoice_qty_kg numeric,
      remarks text,
      rolls jsonb DEFAULT '[]'::jsonb
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_name text,
      stock_qty_kg numeric DEFAULT 0
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_name text NOT NULL DEFAULT '',
      grn_id text,
      status text,
      qc_status text,
      available_weight_kg numeric DEFAULT 0,
      net_weight_kg numeric DEFAULT 0,
      metadata jsonb DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      entry_kind text,
      qty_kg numeric DEFAULT 0
    );
    CREATE TABLE public.barcode_registry (
      barcode text PRIMARY KEY,
      status text
    );
    CREATE TABLE public.audit_logs (
      id text PRIMARY KEY,
      username text,
      user_role text,
      action_type text,
      module text,
      details text,
      target_id text,
      created_at timestamptz DEFAULT now(),
      actor_id uuid
    );

    CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
    RETURNS boolean
    LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.users AS u
        CROSS JOIN LATERAL unnest(
          ARRAY[u.role] || coalesce(u.assigned_roles, ARRAY[]::text[])
        ) AS granted(role_name)
        WHERE u.auth_user_id = auth.uid()
          AND (granted.role_name = 'Admin' OR granted.role_name = ANY (allowed))
      );
    $$;

    CREATE OR REPLACE FUNCTION public._grn_to_numeric(raw text)
    RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE AS $$
    BEGIN
      IF raw IS NULL OR btrim(raw) = '' THEN RETURN NULL; END IF;
      RETURN btrim(raw)::numeric;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    $$;

    CREATE OR REPLACE FUNCTION public._grn_unpack_item_name(raw text)
    RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE
      marker integer;
      payload text;
      parsed jsonb;
    BEGIN
      marker := position('|||' IN coalesce(raw, ''));
      IF marker = 0 THEN
        RETURN jsonb_build_object('itemName', btrim(coalesce(raw, '')), 'meta', '{}'::jsonb);
      END IF;
      payload := btrim(substring(raw FROM marker + 3));
      BEGIN
        parsed := payload::jsonb;
      EXCEPTION WHEN others THEN
        parsed := '{}'::jsonb;
      END;
      IF jsonb_typeof(parsed) IS DISTINCT FROM 'object' THEN
        parsed := '{}'::jsonb;
      END IF;
      RETURN jsonb_build_object(
        'itemName', btrim(substring(raw FROM 1 FOR marker - 1)),
        'meta', parsed
      );
    END;
    $$;
  `);
  await db.exec(migrationSql);
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  for (const [index, role] of SYSTEM_ROLES.entries()) {
    await db.query(
      `INSERT INTO public.users (id, username, full_name, role, assigned_roles, auth_user_id)
       VALUES ($1, $2, $2, $2, ARRAY[$2]::text[], $3::uuid)`,
      [`user-${index}`, role, ROLE_IDS[role]]
    );
  }
  await db.query(
    `INSERT INTO public.inventory (id, item_name, stock_qty_kg) VALUES ('INVT-0011', 'PET-670-12', 40)`
  );
  return db;
}

async function asUser(db, role) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [ROLE_IDS[role]]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

async function asOwner(db) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
}

function itemName(status = 'Pending QC Approval') {
  return `PET-670-12 ||| ${JSON.stringify({
    status,
    qcStatus: status,
    vendorName: 'Acme',
    category: 'Film Substrates'
  })}`;
}

async function insertGrn(db, { id, status, qty = 100, lines = 1 }) {
  await asOwner(db);
  const staged = status === 'Approved' ? 'Pending QC Approval' : status;
  await db.query(
    `INSERT INTO public.grns (
      id, grn_number, po_number, invoice_number, item_name, received_qty_kg, status, stock_item_id
    ) VALUES ($1, $1, 'SIL/PO/26-27/10', $2, $3, $4, $5, 'INVT-0011')`,
    [id, `INV-${id}`, itemName(staged), qty, staged]
  );
  for (let lineNo = 1; lineNo <= lines; lineNo += 1) {
    const barcode = `RM-BC-${id}-${lineNo}`;
    await db.query(
      `INSERT INTO public.grn_line_items (id, grn_id, line_no, item_name, net_weight_kg, rolls)
       VALUES ($1, $2, $3, 'PET-670-12', $4, $5::jsonb)`,
      [`${id}-L${lineNo}`, id, lineNo, qty / lines, JSON.stringify([{ barcodeId: barcode, netWeightKg: qty / lines }])]
    );
    await db.query(
      `INSERT INTO public.inventory_rolls (
        barcode_id, item_name, grn_id, status, qc_status, available_weight_kg, net_weight_kg, metadata
      ) VALUES ($1, 'PET-670-12', $2, 'Pending QC', 'Pending QC', $3, $3, $4::jsonb)`,
      [barcode, id, qty / lines, JSON.stringify({ grnNo: id })]
    );
  }
  if (status === 'Approved') {
    await db.query(
      `UPDATE public.grns SET status = 'Approved', item_name = $2 WHERE id = $1`,
      [id, itemName('Approved')]
    );
  }
}

test('the migration is later than the operator print completion and adds Deleted without a status enum', () => {
  assert.ok('20261105120000' > '20261103143000');
  assert.match(migrationSql, /delete_inward_qc_inspection/);
  assert.match(migrationSql, /SECURITY DEFINER/);
  assert.match(migrationSql, /private\.has_role\(ARRAY\['Admin'\]/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS deleted_by/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS deleted_at/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS delete_reason/);
  assert.match(migrationSql, /NOT LIKE '%delet%'/);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.grns\s+SET[\s\S]*WHERE status/i);
  assert.match(inventoryUi, /Delete inspection/);
  assert.match(inventoryUi, /delete-qc-reason/);
  assert.match(inventoryUi, /canDeleteQcInspection/);
  assert.match(inventoryUi, /deleteInwardQcInspection/);
  assert.match(inventoryUi, /value="DELETED"/);
});

test('a deleted receipt is left out of received quantity, pending QC, and duplicate invoices', () => {
  const live = { poNumber: 'PO-1', status: 'Pending QC Approval', netWeightKg: 80, itemName: 'PET', lineItems: [{ itemName: 'PET', netWeightKg: 80 }] };
  const deleted = { poNumber: 'PO-1', status: 'Deleted', qcStatus: 'Deleted', netWeightKg: 50, itemName: 'PET', lineItems: [{ itemName: 'PET', netWeightKg: 50 }] };
  const received = receivedQtyForPurchaseOrder([live, deleted], 'PO-1');
  assert.equal(received.total, 80);
  assert.equal(pendingQcKgForItem({ id: 'INVT-1', itemName: 'PET', category: 'Other' }, [
    { status: 'Pending QC', itemName: 'PET', netWeightKg: 12, stockItemId: 'INVT-1' },
    { status: 'Deleted', itemName: 'PET', netWeightKg: 40, stockItemId: 'INVT-1' }
  ]), 12);
  assert.equal(findDuplicateInvoice(
    [{ invoiceNo: 'INV-9', vendorName: 'Acme', status: 'Deleted', id: 'G1' }],
    { invoiceNo: 'INV-9', vendorName: 'Acme', id: 'G2' }
  ), null);
  for (const role of SYSTEM_ROLES) {
    assert.equal(canDeleteInwardQcInspection(role), role === 'Admin', role);
  }
});

test('an Admin soft-deletes a pending inspection and posts nothing to inventory', async () => {
  const db = await database();
  await insertGrn(db, { id: 'SIL/GRN/26-27/200', status: 'Pending QC Approval', lines: 2 });
  await asUser(db, 'Admin');
  const result = await db.query(
    `SELECT public.delete_inward_qc_inspection($1, $2) AS payload`,
    ['SIL/GRN/26-27/200', 'Wrong material was inwarded']
  );
  const payload = result.rows[0].payload;
  assert.equal(payload.status, 'Deleted');
  assert.equal(payload.qcStatus, 'Deleted');
  assert.equal(payload.deletedBy, 'Admin');
  assert.equal(payload.deleteReason, 'Wrong material was inwarded');
  assert.equal(payload.inventoryPosted, false);
  assert.equal(payload.alreadyDeleted, false);
  assert.equal(payload.lineCount, 2);
  assert.deepEqual(payload.voidedBarcodes, ['RM-BC-SIL/GRN/26-27/200-1', 'RM-BC-SIL/GRN/26-27/200-2']);

  const header = await db.query(`SELECT status, deleted_by, deleted_at, delete_reason, item_name FROM public.grns WHERE id = $1`, ['SIL/GRN/26-27/200']);
  assert.equal(header.rows[0].status, 'Deleted');
  assert.equal(header.rows[0].deleted_by, 'Admin');
  assert.ok(header.rows[0].deleted_at);
  assert.equal(header.rows[0].delete_reason, 'Wrong material was inwarded');
  assert.match(header.rows[0].item_name, /"qcStatus": "Deleted"/);

  const lines = await db.query(`SELECT count(*)::int AS n FROM public.grn_line_items WHERE grn_id = $1`, ['SIL/GRN/26-27/200']);
  assert.equal(lines.rows[0].n, 2);
  const rolls = await db.query(`SELECT status, qc_status, available_weight_kg FROM public.inventory_rolls ORDER BY barcode_id`);
  assert.equal(rolls.rows.length, 2);
  for (const roll of rolls.rows) {
    assert.equal(roll.status, 'Void');
    assert.equal(roll.qc_status, 'Void');
    assert.equal(Number(roll.available_weight_kg), 0);
  }
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0011'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 40);
  const ledger = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  assert.equal(ledger.rows[0].n, 0);
  const barcodes = await db.query(`SELECT count(*)::int AS n FROM public.barcode_registry`);
  assert.equal(barcodes.rows[0].n, 0);
  const audit = await db.query(`SELECT action_type, module, user_role, target_id, actor_id FROM public.audit_logs`);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].action_type, 'DELETE');
  assert.equal(audit.rows[0].module, 'QC Approval');
  assert.equal(audit.rows[0].user_role, 'Admin');
  assert.equal(audit.rows[0].target_id, 'SIL/GRN/26-27/200');
  assert.equal(audit.rows[0].actor_id, ROLE_IDS.Admin);

  const again = await db.query(
    `SELECT public.delete_inward_qc_inspection($1, $2) AS payload`,
    ['SIL/GRN/26-27/200', 'Wrong material was inwarded']
  );
  assert.equal(again.rows[0].payload.alreadyDeleted, true);
  const audits = await db.query(`SELECT count(*)::int AS n FROM public.audit_logs`);
  assert.equal(audits.rows[0].n, 1);

  await assert.rejects(
    () => db.query(`UPDATE public.grns SET status = 'Approved' WHERE id = $1`, ['SIL/GRN/26-27/200']),
    /cannot be approved/
  );
  await db.close();
});

test('every role other than Admin is denied, and an approved GRN is not reversed', async () => {
  const db = await database();
  await insertGrn(db, { id: 'SIL/GRN/26-27/201', status: 'Pending QC Approval' });
  await insertGrn(db, { id: 'SIL/GRN/26-27/202', status: 'Approved' });
  await asOwner(db);
  await db.query(
    `UPDATE public.inventory_rolls
     SET status = 'In Stock', qc_status = 'Approved', available_weight_kg = 100
     WHERE grn_id = 'SIL/GRN/26-27/202'`
  );
  await db.query(`UPDATE public.inventory SET stock_qty_kg = 140 WHERE id = 'INVT-0011'`);

  for (const role of SYSTEM_ROLES) {
    if (role === 'Admin') continue;
    await asUser(db, role);
    await assert.rejects(
      () => db.query(
        `SELECT public.delete_inward_qc_inspection($1, $2)`,
        ['SIL/GRN/26-27/201', 'Should be refused']
      ),
      /Only an Admin/,
      role
    );
  }

  await asUser(db, 'Admin');
  await assert.rejects(
    () => db.query(`SELECT public.delete_inward_qc_inspection($1, $2)`, ['SIL/GRN/26-27/201', '   ']),
    /reason/
  );
  await assert.rejects(
    () => db.query(
      `SELECT public.delete_inward_qc_inspection($1, $2)`,
      ['SIL/GRN/26-27/202', 'Too late']
    ),
    /not reversed/
  );

  const approved = await db.query(`SELECT status, deleted_at FROM public.grns WHERE id = 'SIL/GRN/26-27/202'`);
  assert.equal(approved.rows[0].status, 'Approved');
  assert.equal(approved.rows[0].deleted_at, null);
  const roll = await db.query(`SELECT status, available_weight_kg FROM public.inventory_rolls WHERE grn_id = 'SIL/GRN/26-27/202'`);
  assert.equal(roll.rows[0].status, 'In Stock');
  assert.equal(Number(roll.rows[0].available_weight_kg), 100);
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0011'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 140);
  const pending = await db.query(`SELECT status FROM public.grns WHERE id = 'SIL/GRN/26-27/201'`);
  assert.equal(pending.rows[0].status, 'Pending QC Approval');
  const ledger = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  assert.equal(ledger.rows[0].n, 0);

  await asOwner(db);
  await db.query(`UPDATE public.grns SET status = 'QC Hold' WHERE id = 'SIL/GRN/26-27/201'`);
  await asUser(db, 'Admin');
  const held = await db.query(
    `SELECT public.delete_inward_qc_inspection($1, $2) AS payload`,
    ['SIL/GRN/26-27/201', 'Held material is not required']
  );
  assert.equal(held.rows[0].payload.status, 'Deleted');
  assert.equal(held.rows[0].payload.inventoryPosted, false);
  await db.close();
});
