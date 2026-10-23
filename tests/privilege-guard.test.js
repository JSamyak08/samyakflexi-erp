import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { handleAdminUsers, publicAdminPayload } from '../api/admin-users.js';
import { EXTERNAL_MANUAL_EMAIL_ENV, adminReroute, companyDomain } from '../src/services/emailPolicy.js';

process.env.COMPANY_EMAIL_DOMAIN = 'samyakinternational.in';
process.env.ADMIN_REROUTE = 'admin@samyakinternational.in';
const COMPANY_DOMAIN = companyDomain();
const ADMIN_REROUTE = adminReroute();

const ADMIN_AUTH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_AUTH = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SECRET_LINK = 'https://evil.example/verify?token=secret-token&type=recovery';
const HASHED = 'hashed-secret';

function readSource(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function chain(result) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    ilike() { return builder; },
    not() { return builder; },
    update() { return builder; },
    insert() { return builder; },
    delete() { return builder; },
    maybeSingle: async () => result,
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function serviceFor(profile) {
  const calls = [];
  const service = {
    calls,
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: profile.auth_user_id,
            app_metadata: { role: 'Admin' },
            user_metadata: { role: 'Admin' },
          },
        },
        error: null,
      }),
      admin: {
        generateLink: async (args) => {
          calls.push({ name: 'generateLink', args });
          return {
            data: {
              user: { id: 'auth-target' },
              properties: { action_link: SECRET_LINK, hashed_token: HASHED },
            },
            error: null,
          };
        },
        createUser: async () => ({ data: { user: { id: 'auth-new' } }, error: null }),
        updateUserById: async () => ({ data: {}, error: null }),
        deleteUser: async () => ({ data: {}, error: null }),
      },
    },
    from(table) {
      if (table === 'system_settings') {
        return chain({
          data: { setting_value: JSON.stringify({ name: 'SAMYAK INTERNATIONAL LTD.' }) },
          error: null,
        });
      }
      return chain({ data: profile, error: null });
    },
    rpc(name, args) {
      calls.push({ name, args });
      return {
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: { status: 'blocked', id: 3 }, error: null }).then(onFulfilled, onRejected);
        },
      };
    },
  };
  return service;
}

function request(body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer stub-session' },
    body,
  };
}

function assertNoLink(payload) {
  const encoded = JSON.stringify(payload);
  assert.equal(encoded.includes('secret-token'), false);
  assert.equal(encoded.includes(HASHED), false);
  assert.equal(encoded.includes('action_link'), false);
  assert.equal(encoded.includes('actionLink'), false);
  assert.equal(encoded.includes('hashed_token'), false);
  assert.equal(Object.hasOwn(payload, 'actionLink'), false);
  assert.equal(Object.hasOwn(payload, 'action_link'), false);
  assert.equal(Object.hasOwn(payload, 'hashed_token'), false);
}

const adminProfile = {
  id: 'user-admin',
  role: 'Admin',
  status: 'Active',
  active: true,
  auth_user_id: ADMIN_AUTH,
  email: `admin@${COMPANY_DOMAIN}`,
  full_name: 'Admin',
  department: 'Executive Management',
};

const staffProfile = {
  id: 'user-staff',
  role: 'Store Manager',
  status: 'Active',
  active: true,
  auth_user_id: STAFF_AUTH,
  email: `staff@${COMPANY_DOMAIN}`,
  full_name: 'Staff',
  department: 'Store',
};

async function withMailEnv(run) {
  const previous = {
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    APP_ORIGIN: process.env.APP_ORIGIN,
    [EXTERNAL_MANUAL_EMAIL_ENV]: process.env[EXTERNAL_MANUAL_EMAIL_ENV],
  };
  process.env.SMTP_USER = 'stub-user';
  process.env.SMTP_PASS = 'stub-pass';
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_SECURE = 'false';
  process.env.APP_ORIGIN = 'https://erp.samyakinternational.in';
  delete process.env[EXTERNAL_MANUAL_EMAIL_ENV];
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('public admin payloads drop recovery links', () => {
  const clean = publicAdminPayload({
    success: false,
    actionLink: SECRET_LINK,
    action_link: SECRET_LINK,
    hashed_token: HASHED,
    message: 'The password email could not be delivered.',
    user: { email: `hire@${COMPANY_DOMAIN}`, properties: { action_link: SECRET_LINK } },
  });
  assertNoLink(clean);
  assert.equal(clean.message, 'The password email could not be delivered.');
  assert.equal(clean.user.email, `hire@${COMPANY_DOMAIN}`);
});

test('admin-users rejects a non-admin even when the client claims Admin', async () => {
  const service = serviceFor(staffProfile);
  const res = mockRes();
  await handleAdminUsers(request({
    action: 'update',
    id: 'user-admin',
    role: 'Admin',
    callerRole: 'Admin',
    caller_role: 'Admin',
    is_admin: true,
    email: `staff@${COMPANY_DOMAIN}`,
    origin: 'https://flexierp-preview.vercel.app',
  }), res, { serviceClient: () => service });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assertNoLink(res.body);
  assert.equal(service.calls.some(call => call.name === 'generateLink'), false);
});

test('admin-users never returns a setup link and redirects only to the ERP host', async () => {
  await withMailEnv(async () => {
    const service = serviceFor(adminProfile);
    const res = mockRes();
    const sent = [];
    await handleAdminUsers(request({
      action: 'send_reset',
      email: 'buyer@plant.com',
      callerRole: 'Store Manager',
      origin: 'https://flexierp-preview.vercel.app',
    }), res, {
      serviceClient: () => service,
      createTransport: () => ({
        sendMail: async (mail) => {
          sent.push(mail);
          return { messageId: 'stub' };
        },
      }),
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.emailed, true);
    assertNoLink(res.body);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, ADMIN_REROUTE);
    assert.equal(sent[0].text.includes('secret-token'), true);
    assert.equal(JSON.stringify(res.body).includes('secret-token'), false);
    const linkCall = service.calls.find(call => call.name === 'generateLink');
    assert.equal(linkCall.args.options.redirectTo, 'https://erp.samyakinternational.in/reset-password');
  });
});

test('a blocked account email returns status only and is logged', async () => {
  await withMailEnv(async () => {
    const service = serviceFor(adminProfile);
    const res = mockRes();
    let opened = false;
    await handleAdminUsers(request({
      action: 'create',
      email: 'new.hire@gmail.com',
      name: 'New Hire',
      role: 'Store Manager',
      origin: 'http://localhost:5173',
    }), res, {
      serviceClient: () => service,
      createTransport: () => {
        opened = true;
        throw new Error('SMTP must not be opened');
      },
    });

    assert.equal(opened, false);
    assert.equal(res.body.success, false);
    assert.equal(res.body.emailStatus, 'not_delivered');
    assertNoLink(res.body);
    assert.match(res.body.message, /could not be delivered/i);
    const logged = service.calls.find(call => call.name === 'log_blocked_email_send');
    assert.ok(logged);
    assert.equal(logged.args.p_kind, 'automated');
    assert.match(logged.args.p_to, /gmail\.com/);
    assert.equal(String(logged.args.p_to).includes('secret-token'), false);
  });
});

test('password links use APP_ORIGIN and ignore the caller origin', async () => {
  await withMailEnv(async () => {
    process.env.APP_ORIGIN = 'https://preview.example.test';
    const service = serviceFor(adminProfile);
    const res = mockRes();
    await handleAdminUsers(request({
      action: 'send_reset',
      email: 'buyer@plant.com',
      origin: 'https://flexierp-preview.vercel.app',
    }), res, {
      serviceClient: () => service,
      createTransport: () => ({
        sendMail: async () => ({ messageId: 'stub' }),
      }),
    });
    assert.equal(res.statusCode, 200);
    const linkCall = service.calls.find(call => call.name === 'generateLink');
    assert.equal(linkCall.args.options.redirectTo, 'https://preview.example.test/reset-password');
  });
});

test('password links fail when APP_ORIGIN is missing', async () => {
  await withMailEnv(async () => {
    delete process.env.APP_ORIGIN;
    const service = serviceFor(adminProfile);
    const res = mockRes();
    let opened = false;
    await handleAdminUsers(request({
      action: 'send_reset',
      email: 'buyer@plant.com',
      origin: 'https://flexierp-preview.vercel.app',
    }), res, {
      serviceClient: () => service,
      createTransport: () => {
        opened = true;
        throw new Error('SMTP must not be opened');
      },
    });
    assert.equal(opened, false);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.message, /APP_ORIGIN/);
    assert.equal(service.calls.some(call => call.name === 'generateLink'), false);
  });
});

test('redirect and domain locks are in the source', () => {
  const admin = readSource('api/admin-users.js');
  const policy = readSource('src/services/emailPolicy.js');
  const auth = readSource('src/services/authService.js');
  const invite = readSource('scripts/invite-existing-users.mjs');
  assert.doesNotMatch(admin, /vercel\.app/);
  assert.doesNotMatch(admin, /erp\.samyakinternational\.in/);
  assert.match(admin, /resolveAppOrigin/);
  assert.doesNotMatch(admin, /actionLink: mail\.actionLink/);
  assert.doesNotMatch(policy, /LEGACY_INTERNAL_DOMAINS/);
  assert.doesNotMatch(policy, /plant\\\.com\|/);
  assert.doesNotMatch(auth, /redirectTo: 'https:\/\/erp\.samyakinternational\.in\/reset-password'/);
  assert.match(auth, /VITE_APP_ORIGIN/);
  assert.doesNotMatch(invite, /Share this setup link/);
  assert.match(invite, /const origin = 'https:\/\/erp\.samyakinternational\.in'/);
});

async function expectDenied(db, sql, params) {
  try {
    await db.query(sql, params);
    assert.fail(`expected privilege trigger to reject: ${sql}`);
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => {});
    assert.match(String(error.message || error), /Only an Admin/);
  }
}

async function asUser(db, roleName, authId) {
  await db.exec(`SET ROLE ${roleName}`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId || '']);
  await db.query(`SELECT set_config('request.jwt.claim.role', $1, false)`, [roleName === 'service_role' ? 'service_role' : 'authenticated']);
}

test('privilege trigger blocks non-admins and still allows an Admin or service_role', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      username text,
      full_name text,
      email text,
      role text,
      department text,
      active boolean,
      status text,
      auth_user_id uuid,
      is_admin boolean,
      permissions jsonb
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.email_settings (
      id text PRIMARY KEY,
      plant_manager_email text DEFAULT 'plant.manager@plant.com'
    );
    INSERT INTO public.email_settings (id, plant_manager_email)
    VALUES ('default', 'plant.manager@plant.com');
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON public.users, public.role_permissions, public.system_settings, public.email_settings
      TO anon, authenticated, service_role;
  `);

  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261022060000_guard_privilege_columns.sql', import.meta.url),
    'utf8',
  );
  await db.exec(sql);

  const defaults = await db.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_settings'
      AND column_name = 'plant_manager_email'
  `);
  assert.match(defaults.rows[0].column_default, /admin@samyakinternational\.in/);
  const rewritten = await db.query(`SELECT plant_manager_email FROM public.email_settings WHERE id = 'default'`);
  assert.equal(rewritten.rows[0].plant_manager_email, 'admin@samyakinternational.in');

  await db.query(
    `INSERT INTO public.users (id, username, full_name, email, role, active, status, auth_user_id, is_admin)
     VALUES
       ('admin-1', 'admin', 'Admin', 'admin@samyakinternational.in', 'Admin', true, 'Active', $1::uuid, false),
       ('staff-1', 'staff', 'Staff', 'staff@samyakinternational.in', 'Store Manager', true, 'Active', $2::uuid, false),
       ('pending-1', 'pending', 'Pending', 'pending@samyakinternational.in', 'Admin', false, 'Pending', $3::uuid, false)`,
    [ADMIN_AUTH, STAFF_AUTH, 'cccccccc-cccc-cccc-cccc-cccccccccccc'],
  );
  await db.query(
    `INSERT INTO public.role_permissions (role, permissions) VALUES ('Store Manager', '{"inventory": true}'::jsonb)`,
  );
  await db.query(
    `INSERT INTO public.system_settings (setting_key, setting_value)
     VALUES ('role_permissions', '{"Store Manager":{"inventory":true}}'), ('plant_name', 'Samyak')`,
  );

  await asUser(db, 'authenticated', STAFF_AUTH);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'service_role', false)`);
  await expectDenied(db, `UPDATE public.users SET role = 'Admin' WHERE id = 'staff-1'`);
  await expectDenied(db, `UPDATE public.users SET role = 'Plant Manager' WHERE id = 'admin-1'`);
  await expectDenied(db, `UPDATE public.users SET status = 'Inactive' WHERE id = 'staff-1'`);
  await expectDenied(db, `UPDATE public.users SET active = false WHERE id = 'staff-1'`);
  await expectDenied(db, `UPDATE public.users SET is_admin = true WHERE id = 'staff-1'`);
  await expectDenied(db, `UPDATE public.users SET permissions = '{"all":true}'::jsonb WHERE id = 'staff-1'`);
  await expectDenied(
    db,
    `INSERT INTO public.users (id, username, email, role, active, status)
     VALUES ('intruder', 'intruder', 'intruder@samyakinternational.in', 'Admin', true, 'Active')`,
  );
  await expectDenied(db, `DELETE FROM public.users WHERE id = 'admin-1'`);
  await expectDenied(
    db,
    `UPDATE public.role_permissions SET permissions = '{"inventory": false}'::jsonb WHERE role = 'Store Manager'`,
  );
  await expectDenied(
    db,
    `UPDATE public.system_settings SET setting_value = '{}' WHERE setting_key = 'role_permissions'`,
  );

  await db.query(`UPDATE public.users SET full_name = 'Staff Renamed' WHERE id = 'staff-1'`);
  const renamed = await db.query(`SELECT full_name, role FROM public.users WHERE id = 'staff-1'`);
  assert.equal(renamed.rows[0].full_name, 'Staff Renamed');
  assert.equal(renamed.rows[0].role, 'Store Manager');
  await db.query(`UPDATE public.system_settings SET setting_value = 'Flexi' WHERE setting_key = 'plant_name'`);

  await asUser(db, 'authenticated', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  await expectDenied(db, `UPDATE public.users SET role = 'Admin', active = true, status = 'Active' WHERE id = 'pending-1'`);

  await asUser(db, 'authenticated', ADMIN_AUTH);
  await db.query(`UPDATE public.users SET role = 'QC Chemist' WHERE id = 'staff-1'`);
  const promotedByAdmin = await db.query(`SELECT role FROM public.users WHERE id = 'staff-1'`);
  assert.equal(promotedByAdmin.rows[0].role, 'QC Chemist');
  await db.query(
    `UPDATE public.role_permissions SET permissions = '{"inventory": false}'::jsonb WHERE role = 'Store Manager'`,
  );
  await db.query(
    `UPDATE public.system_settings SET setting_value = '{"locked":true}' WHERE setting_key = 'role_permissions'`,
  );

  await asUser(db, 'service_role', STAFF_AUTH);
  await db.query(`UPDATE public.users SET role = 'Store Manager' WHERE id = 'staff-1'`);
  const restored = await db.query(`SELECT role FROM public.users WHERE id = 'staff-1'`);
  assert.equal(restored.rows[0].role, 'Store Manager');

  await db.exec('RESET ROLE');
  const stillStaff = await db.query(`SELECT role, is_admin FROM public.users WHERE id = 'staff-1'`);
  assert.equal(stillStaff.rows[0].role, 'Store Manager');
  assert.equal(stillStaff.rows[0].is_admin, false);
  await db.close();
});
