import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { PGlite } from '@electric-sql/pglite';
import {
  applyIndentStatusChange,
  bindEditedPerson,
  buildDirectoryIndex,
  emailSampleActors,
  indentSlipSignatories,
  isDummyPersonText,
  loggedInActorLabel,
  printablePersonName,
} from '../src/utils/recordedPerson.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const STORE_ID = '22222222-2222-4222-8222-222222222222';

const users = [
  {
    id: ADMIN_ID,
    name: 'Samyak Jain',
    email: 'samyak.jain@samyakinternational.in',
    role: 'Admin',
  },
  {
    id: STORE_ID,
    name: 'Store Lead',
    email: 'store.lead@samyakinternational.in',
    role: 'Store Manager',
  },
];

const employees = [
  {
    id: 'EMP-9',
    fullName: 'Meera Kulkarni',
    email: 'meera.kulkarni@samyakinternational.in',
    designation: 'Store Supervisor',
  },
];

const admin = users[0];

test('a pending indent keeps the raiser and leaves the other signature lines blank', () => {
  const slip = indentSlipSignatories({
    indentNo: 'IND-2026-002',
    status: 'Pending Approval',
    raisedBy: 'Samyak Jain (Admin)',
    userRole: 'Admin',
    verifiedBy: 'Virendra Singh (Store Manager)',
    approvedBy: 'Rajesh Sharma (Plant Manager)',
  }, { users, employees });

  assert.equal(slip.raisedBy.label, 'Samyak Jain (Admin)');
  assert.equal(slip.verifiedBy.label, '');
  assert.equal(slip.approvedBy.label, '');
  assert.equal(slip.approvedBy.atLabel, '');
  assert.equal(isDummyPersonText('Store Mgr Dilip Joshi'), true);
  assert.equal(printablePersonName('Plant Manager'), '');
  assert.equal(printablePersonName('Samyak Jain (Admin)'), 'Samyak Jain (Admin)');
});

test('an email or user id on the indent resolves to the directory name and role', () => {
  const byEmail = indentSlipSignatories({
    status: 'Pending Approval',
    raisedBy: 'meera.kulkarni@samyakinternational.in',
  }, { users, employees });
  assert.equal(byEmail.raisedBy.label, 'Meera Kulkarni (Store Supervisor)');

  const byId = indentSlipSignatories({
    status: 'Approved',
    raisedByUserId: ADMIN_ID,
    raisedBy: 'samyak.jain@samyakinternational.in',
    approvedByUserId: STORE_ID,
    approvedAt: '2026-10-08T09:30:00+05:30',
  }, { users, employees });
  assert.equal(byId.raisedBy.label, 'Samyak Jain (Admin)');
  assert.equal(byId.approvedBy.label, 'Store Lead (Store Manager)');
  assert.match(byId.approvedBy.atLabel, /2026/);
  assert.match(byId.approvedBy.atLabel, /9:30/);
  assert.doesNotMatch(byId.approvedBy.label, /Rajesh Sharma|Virendra Singh/);
});

test('a recorded verifier is shown and a missing one stays blank', () => {
  const blank = indentSlipSignatories({
    status: 'Approved',
    raisedBy: 'Samyak Jain (Admin)',
    approvedBy: 'Samyak Jain (Admin)',
    approvedAt: '2026-10-08T09:30:00+05:30',
  }, { users, employees });
  assert.equal(blank.verifiedBy.label, '');

  const recorded = indentSlipSignatories({
    status: 'Approved',
    verifiedByUserId: 'EMP-9',
    verifiedBy: 'Virendra Singh (Store Manager)',
    approvedByEmail: 'samyak.jain@samyakinternational.in',
    approvedAt: '2026-10-08T09:30:00+05:30',
  }, { users, employees });
  assert.equal(recorded.verifiedBy.label, 'Meera Kulkarni (Store Supervisor)');
  assert.equal(recorded.approvedBy.label, 'Samyak Jain (Admin)');
});

test('approval and rejection record the signed-in admin and clear again when pending', () => {
  const pending = {
    id: 'IND-2026-002',
    status: 'Pending Approval',
    raisedBy: 'Meera Kulkarni (Store Supervisor)',
    raisedByEmail: 'meera.kulkarni@samyakinternational.in',
  };
  const approved = applyIndentStatusChange(pending, { ...pending, status: 'Approved' }, admin, '2026-10-08T09:30:00.000Z');
  assert.equal(approved.approvedBy, 'Samyak Jain (Admin)');
  assert.equal(approved.approvedByUserId, ADMIN_ID);
  assert.equal(approved.approvedByEmail, admin.email);
  assert.equal(approved.approvedAt, '2026-10-08T09:30:00.000Z');
  assert.equal(approved.rejectedBy, '');

  const issued = applyIndentStatusChange(approved, { ...approved, status: 'Issued to Machine' }, users[1], '2026-10-09T10:00:00.000Z');
  assert.equal(issued.approvedByUserId, ADMIN_ID);
  assert.equal(issued.status, 'Issued to Machine');

  const rejected = applyIndentStatusChange(pending, { ...pending, status: 'Rejected' }, admin, '2026-10-08T11:00:00.000Z');
  assert.equal(rejected.rejectedBy, 'Samyak Jain (Admin)');
  assert.equal(rejected.approvedBy, 'Samyak Jain (Admin)');
  const rejectedSlip = indentSlipSignatories(rejected, { users, employees });
  assert.equal(rejectedSlip.approvedBy.label, 'Samyak Jain (Admin)');
  assert.match(rejectedSlip.approvedBy.atLabel, /2026/);

  const reopened = applyIndentStatusChange(approved, { ...approved, status: 'Pending Approval' }, admin, '2026-10-10T08:00:00.000Z');
  assert.equal(reopened.approvedBy, '');
  assert.equal(reopened.approvedByUserId, '');
  assert.equal(indentSlipSignatories(reopened, { users, employees }).approvedBy.label, '');
});

test('editing the raised-by line keeps the recorded id when the directory is not loaded', () => {
  const indent = {
    status: 'Pending Approval',
    raisedBy: 'Samyak Jain (Admin)',
    raisedByUserId: ADMIN_ID,
    raisedByEmail: admin.email,
  };
  const kept = bindEditedPerson('Samyak Jain (Admin)', indent, buildDirectoryIndex([], []));
  assert.equal(kept.id, ADMIN_ID);
  assert.equal(kept.label, 'Samyak Jain (Admin)');

  const cleared = bindEditedPerson('Virendra Singh (Store Manager)', indent, buildDirectoryIndex(users, employees));
  assert.equal(cleared.label, '');
  assert.equal(cleared.id, '');
});

test('audit and email samples use the signed-in person and never a stand-in name', () => {
  assert.equal(loggedInActorLabel(admin), 'Samyak Jain (Admin)');
  assert.equal(loggedInActorLabel(null), '');
  assert.equal(loggedInActorLabel({ name: 'Rajesh Sharma', role: 'Plant Manager' }), '');
  const sample = emailSampleActors(admin);
  assert.equal(sample.userName, 'Samyak Jain');
  assert.equal(sample.filledBy, 'Samyak Jain (Admin)');
  assert.equal(emailSampleActors(null).userName, '');
  assert.equal(emailSampleActors(null).filledBy, '');
  assert.doesNotMatch(JSON.stringify(sample), /Rajesh Sharma|Virendra Singh|Dilip Joshi|Ramesh Kumar/);
});

test('the directory user wins when an employee shares the same email', () => {
  const directory = buildDirectoryIndex(
    [{ id: ADMIN_ID, name: 'Samyak Jain', email: 'shared@samyakinternational.in', role: 'Admin' }],
    [{ id: 'EMP-1', fullName: 'Payroll Name', email: 'shared@samyakinternational.in', designation: 'HR' }]
  );
  const slip = indentSlipSignatories({
    status: 'Pending Approval',
    raisedByEmail: 'shared@samyakinternational.in',
  }, { directory });
  assert.equal(slip.raisedBy.label, 'Samyak Jain (Admin)');
});

test('production screens no longer hardcode the dummy signature names', () => {
  const root = new URL('../src', import.meta.url);
  const banned = /Virendra Singh|Rajesh Sharma|Dilip Joshi|Store Mgr Dilip/;
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|jsx)$/.test(entry)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (banned.test(text)) hits.push(path.relative(root.pathname, full));
    }
  };
  walk(root.pathname);
  assert.deepEqual(hits, []);

  const indents = fs.readFileSync(new URL('../src/components/ConsumablesAndIndents.jsx', import.meta.url), 'utf8');
  const signatures = fs.readFileSync(new URL('../src/components/IndentSlipSignatures.jsx', import.meta.url), 'utf8');
  assert.match(indents, /IndentSlipSignatures/);
  assert.match(indents, /applyIndentStatusChange/);
  assert.match(indents, /raisedByUserId/);
  assert.doesNotMatch(indents, /userName = "Samyak Jain"/);
  assert.match(signatures, /Approved By \(Admin\)/);
  assert.match(signatures, /Verified By \(Store Manager\)/);

  const inventory = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  assert.match(inventory, /loggedInActorLabel\(currentUser\)/);
  const orders = fs.readFileSync(new URL('../src/components/OrderManagement.jsx', import.meta.url), 'utf8');
  assert.match(orders, /loggedInActorLabel\(currentUser\)/);
  const payslip = fs.readFileSync(new URL('../src/components/EmployeePayslipPDF.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(payslip, /fontFamily: 'cursive'/);
});

test('the printed signature block shows the raiser and a blank approval line while pending', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  try {
  const { default: IndentSlipSignatures } = await server.ssrLoadModule('/src/components/IndentSlipSignatures.jsx');
  const pending = indentSlipSignatories({
    status: 'Pending Approval',
    raisedByUserId: ADMIN_ID,
    verifiedBy: 'Virendra Singh (Store Manager)',
    approvedBy: 'Rajesh Sharma (Plant Manager)',
  }, { users, employees });
  const html = renderToStaticMarkup(React.createElement(IndentSlipSignatures, { slip: pending }));
  assert.match(html, /Samyak Jain \(Admin\)/);
  assert.match(html, /Verified By \(Store Manager\)/);
  assert.match(html, /Approved By \(Admin\)/);
  assert.doesNotMatch(html, /Virendra|Rajesh|Dilip/);

  const approved = indentSlipSignatories({
    status: 'Approved',
    raisedBy: 'Meera Kulkarni (Store Supervisor)',
    verifiedByEmail: 'meera.kulkarni@samyakinternational.in',
    approvedByUserId: ADMIN_ID,
    approvedAt: '2026-10-08T09:30:00+05:30',
  }, { users, employees });
  const approvedHtml = renderToStaticMarkup(React.createElement(IndentSlipSignatures, { slip: approved }));
  assert.match(approvedHtml, /Meera Kulkarni \(Store Supervisor\)/);
  assert.match(approvedHtml, /Samyak Jain \(Admin\)/);
  assert.match(approvedHtml, /2026/);
  assert.doesNotMatch(approvedHtml, /Virendra|Rajesh|Dilip/);
  } finally {
    await server.close();
  }
});

test('the dummy-name review script lists stored stand-ins and does not change them', async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.material_indents (
      id text primary key,
      payload jsonb not null
    );
    insert into public.material_indents (id, payload) values
      ('IND-REAL', '{"raisedBy":"Samyak Jain (Admin)"}'),
      ('IND-DUMMY', '{"raisedBy":"Virendra Singh (Store Manager)","approvedBy":"Rajesh Sharma (Plant Manager)"}');
    create table public.stock_adjustments (
      id text primary key,
      payload jsonb not null
    );
    insert into public.stock_adjustments (id, payload) values
      ('ADJ-1', '{"adjustedBy":"Store Mgr Dilip Joshi"}'),
      ('ADJ-REAL', '{"adjustedBy":"Samyak Jain (Admin)"}');
  `);
  const sql = fs.readFileSync(new URL('../supabase/manual/20261103_list_dummy_signature_names.sql', import.meta.url), 'utf8');
  const results = await db.exec(sql);
  const listed = results.flatMap((result) => result.rows || []);
  const detail = listed.filter((row) => row.row_id);
  const ids = [...new Set(detail.map((row) => row.row_id))].sort();
  assert.deepEqual(ids, ['ADJ-1', 'IND-DUMMY']);
  assert.equal(detail.some((row) => String(row.excerpt).includes('Samyak Jain')), false);

  const indents = await db.query(`select id, payload->>'raisedBy' as raised_by from public.material_indents order by id`);
  assert.equal(indents.rows.find((row) => row.id === 'IND-DUMMY').raised_by, 'Virendra Singh (Store Manager)');
  assert.equal(indents.rows.find((row) => row.id === 'IND-REAL').raised_by, 'Samyak Jain (Admin)');
  const adjustments = await db.query(`select payload->>'adjustedBy' as adjusted_by from public.stock_adjustments where id = 'ADJ-1'`);
  assert.equal(adjustments.rows[0].adjusted_by, 'Store Mgr Dilip Joshi');
  await db.close();
});

test('the dummy-name review script is not a migration and does not rewrite rows', () => {
  const sql = fs.readFileSync(new URL('../supabase/manual/20261103_list_dummy_signature_names.sql', import.meta.url), 'utf8');
  assert.match(sql, /select table_name, column_name, row_id, excerpt/i);
  assert.match(sql, /rollback/i);
  assert.match(sql, /virendra/i);
  assert.match(sql, /rajesh/i);
  assert.match(sql, /dilip/i);
  assert.doesNotMatch(sql, /\b(update|delete)\b/i);
  assert.doesNotMatch(sql, /insert into public/i);
  const migrations = fs.readdirSync(new URL('../supabase/migrations', import.meta.url));
  assert.equal(migrations.some((name) => name.includes('dummy_signature')), false);
});
