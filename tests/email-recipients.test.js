import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { handleSendEmail } from '../api/send-email.js';
import { deliverAccountEmail } from '../api/admin-users.js';
import {
  ADMIN_REROUTE,
  COMPANY_DOMAIN,
  EXTERNAL_MANUAL_EMAIL_ENV,
  companyRecipients,
  externalManualDeliveryEnabled,
  isCompanyAddress,
  normalizeKind,
  parseMailbox,
  resolveOutboundRecipients,
} from '../src/services/emailPolicy.js';

const COMPANY = `qa@${COMPANY_DOMAIN}`;
const COMPANY_UPPER = `QA@${COMPANY_DOMAIN.toUpperCase()}`;

function domainsOf(header) {
  if (!header) return [];
  return String(header).split(',').map(part => part.trim()).filter(Boolean).map(part => {
    const parsed = parseMailbox(part);
    assert.ok(parsed, `SMTP was given an unparsed recipient: ${part}`);
    return parsed.domain;
  });
}

function assertCompanyOnly(resolved) {
  for (const field of ['to', 'cc', 'bcc', 'replyTo']) {
    for (const domain of domainsOf(resolved[field])) {
      assert.equal(domain, COMPANY_DOMAIN, `${field} leaked ${domain}`);
    }
  }
}

test('normalizeKind defaults to automated', () => {
  assert.equal(normalizeKind(undefined), 'automated');
  assert.equal(normalizeKind(null), 'automated');
  assert.equal(normalizeKind(''), 'automated');
  assert.equal(normalizeKind('Automated'), 'automated');
  assert.equal(normalizeKind('auto'), 'automated');
  assert.equal(normalizeKind('manual'), 'manual');
});

test('external manual delivery switch is off unless exactly true', () => {
  assert.equal(externalManualDeliveryEnabled({}), false);
  assert.equal(externalManualDeliveryEnabled({ [EXTERNAL_MANUAL_EMAIL_ENV]: 'false' }), false);
  assert.equal(externalManualDeliveryEnabled({ [EXTERNAL_MANUAL_EMAIL_ENV]: '1' }), false);
  assert.equal(externalManualDeliveryEnabled({ [EXTERNAL_MANUAL_EMAIL_ENV]: 'yes' }), false);
  assert.equal(externalManualDeliveryEnabled({ [EXTERNAL_MANUAL_EMAIL_ENV]: ' TRUE ' }), true);
});

test('parsed domain must be exactly samyakinternational.in', () => {
  const cases = [
    [`${COMPANY_UPPER}`, true],
    [`Buyer <${COMPANY}>`, true],
    [`x@gmail.com <a@${COMPANY_DOMAIN}>`, true],
    [`"x@gmail.com"@${COMPANY_DOMAIN}`, true],
    ['vendor@gmail.com', false],
    ['user@mail.samyakinternational.in', false],
    ['user@samyakinternational.in.evil.com', false],
    ['user@notsamyakinternational.in', false],
    ['plant.manager@plant.com', false],
    ['user@samyak.com', false],
    ['a@samyakinternational.in@gmail.com', false],
    ['x@gmail.com <a@samyakinternational.in> <b@gmail.com>', false],
    ['x@gmail.com admin@samyakinternational.in', false],
  ];

  for (const [input, keep] of cases) {
    const { kept } = companyRecipients(input);
    if (keep) {
      assert.equal(kept.length, 1, input);
      assert.equal(isCompanyAddress(parseMailbox(kept[0])), true, input);
      assert.equal(kept[0].toLowerCase().endsWith(`@${COMPANY_DOMAIN}`), true, kept[0]);
    } else {
      assert.deepEqual(kept, [], input);
    }
  }

  const display = companyRecipients('x@gmail.com <a@samyakinternational.in>');
  assert.deepEqual(display.kept, ['a@samyakinternational.in']);
  assert.equal(display.kept.some(address => address.includes('gmail.com')), false);
});

test('automated drops mixed, uppercase, subdomain, display-name, cc and bcc outsiders', () => {
  const resolved = resolveOutboundRecipients({
    to: `Vendor <vendor@gmail.com>, ${COMPANY_UPPER}, user@mail.samyakinternational.in`,
    cc: `x@gmail.com <a@${COMPANY_DOMAIN}>, boss@plant.com`,
    bcc: `hidden@gmail.com; Store <store@${COMPANY_DOMAIN}>`,
    replyTo: 'buyer@gmail.com',
  });

  assert.equal(resolved.kind, 'automated');
  assert.equal(resolved.blocked, false);
  assert.equal(resolved.externalDelivery, false);
  assert.equal(resolved.to, `QA@${COMPANY_DOMAIN}`);
  assert.equal(resolved.cc, `a@${COMPANY_DOMAIN}`);
  assert.equal(resolved.bcc, `store@${COMPANY_DOMAIN}`);
  assert.equal(resolved.replyTo, '');
  assertCompanyOnly(resolved);
  assert.equal(resolved.to.includes('gmail.com'), false);
  assert.equal(resolved.cc.includes('plant.com'), false);
  assert.equal(resolved.bcc.includes('gmail.com'), false);
});

test('automated sends nothing when every recipient is outside the company', () => {
  const resolved = resolveOutboundRecipients({
    kind: 'automated',
    to: 'orders@vendor.com',
    cc: 'buyer@client.com',
    bcc: 'x@gmail.com <person@gmail.com>',
    replyTo: `qa@${COMPANY_DOMAIN}`,
  });
  assert.equal(resolved.blocked, true);
  assert.equal(resolved.to, '');
  assert.equal(resolved.cc, '');
  assert.equal(resolved.bcc, '');
  assert.equal(resolved.replyTo, `qa@${COMPANY_DOMAIN}`);
});

test('missing kind is automated and does not reroute to admin', () => {
  const resolved = resolveOutboundRecipients({ to: 'orders@vendor.com', subject: 'Indent raised' });
  assert.equal(resolved.kind, 'automated');
  assert.equal(resolved.blocked, true);
  assert.notEqual(resolved.to, ADMIN_REROUTE);
});

test('manual external mail reroutes to admin while the switch is off', () => {
  const resolved = resolveOutboundRecipients({
    kind: 'manual',
    to: 'buyer@client.com',
    cc: `accounts@vendor.com, purchase@${COMPANY_DOMAIN}`,
    bcc: 'hidden@gmail.com',
    replyTo: `Buyer <qa@${COMPANY_DOMAIN}>`,
    env: { [EXTERNAL_MANUAL_EMAIL_ENV]: 'false' },
  });
  assert.equal(resolved.blocked, false);
  assert.equal(resolved.externalDelivery, false);
  assert.equal(resolved.to, ADMIN_REROUTE);
  assert.equal(resolved.cc, `purchase@${COMPANY_DOMAIN}`);
  assert.equal(resolved.bcc, '');
  assert.equal(resolved.replyTo, `qa@${COMPANY_DOMAIN}`);
  assert.equal(`${resolved.to} ${resolved.cc} ${resolved.bcc}`.includes('gmail.com'), false);
  assert.equal(`${resolved.to} ${resolved.cc} ${resolved.bcc}`.includes('client.com'), false);
});

test('manual display-name smuggling is not handed to SMTP', () => {
  const bracketed = resolveOutboundRecipients({
    kind: 'manual',
    to: 'x@gmail.com <a@samyakinternational.in>',
    env: {},
  });
  assert.equal(bracketed.to, ADMIN_REROUTE);
  assert.equal(bracketed.to.includes('gmail.com'), false);

  const suffixTrick = resolveOutboundRecipients({
    kind: 'manual',
    to: 'x@gmail.com admin@samyakinternational.in',
    cc: 'x@gmail.com <a@samyakinternational.in',
    env: {},
  });
  assert.equal(suffixTrick.to, ADMIN_REROUTE);
  assert.equal(suffixTrick.cc, '');
  assert.equal(`${suffixTrick.to} ${suffixTrick.cc}`.includes('gmail.com'), false);
});

test('the external switch delivers a manual address and still strips reply-to', () => {
  const resolved = resolveOutboundRecipients({
    kind: 'manual',
    to: 'Buyer <buyer@client.com>',
    cc: `qa@${COMPANY_DOMAIN}`,
    replyTo: 'buyer@client.com',
    env: { [EXTERNAL_MANUAL_EMAIL_ENV]: 'true' },
  });
  assert.equal(resolved.externalDelivery, true);
  assert.equal(resolved.blocked, false);
  assert.equal(resolved.to, 'buyer@client.com');
  assert.equal(resolved.cc, `qa@${COMPANY_DOMAIN}`);
  assert.equal(resolved.replyTo, '');
});

test('automated ignores the external switch', () => {
  const resolved = resolveOutboundRecipients({
    kind: 'automated',
    to: 'buyer@client.com',
    env: { [EXTERNAL_MANUAL_EMAIL_ENV]: 'true' },
  });
  assert.equal(resolved.blocked, true);
  assert.equal(resolved.externalDelivery, false);
  assert.equal(resolved.to, '');
});

function readSource(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('notification callers are automated and the test-send button is manual', () => {
  const emailService = readSource('src/services/emailService.js');
  const notifications = [
    'notifyOrderPunched',
    'notifyProductionRecordSubmitted',
    'notifyProductionRecordApproved',
    'notifyPurchaseIndentCreated',
    'notifyPurchaseOrderIssued',
    'notifyLowStockAlert',
    'notifyUserCreated',
    'notifyOverWastageAlert',
    'notifyGRNPendingQC',
    'notifyGRNQCEscalation12h',
    'notifyGRNQCVarianceModified',
  ];
  for (const name of notifications) {
    const start = emailService.indexOf(`export const ${name}`);
    assert.ok(start >= 0, name);
    const next = emailService.indexOf('\nexport const ', start + name.length);
    const body = emailService.slice(start, next === -1 ? emailService.length : next);
    assert.match(body, /kind:\s*'automated'/, name);
    assert.doesNotMatch(body, /kind:\s*'manual'/, name);
  }

  const sender = emailService.slice(
    emailService.indexOf('export const sendERPEmailNotification'),
    emailService.indexOf('export const buildEmailTemplate'),
  );
  assert.match(sender, /normalizeKind\(kind\)/);
  assert.doesNotMatch(sender, /filterInternalRecipientsOnly/);

  const settings = readSource('src/components/DocumentSettings.jsx');
  const testSend = settings.slice(settings.indexOf('const handleSendTestEmail'), settings.indexOf('const currentTemplate'));
  assert.match(testSend, /kind:\s*'manual'/);

  const inventory = readSource('src/components/InventoryManagement.jsx');
  assert.match(inventory, /useEffect\(\(\) => \{[\s\S]{0,600}notifyGRNQCEscalation12h/);
  assert.doesNotMatch(inventory, /kind:\s*'manual'/);

  const indents = readSource('src/components/ConsumablesAndIndents.jsx');
  assert.match(indents, /notifyPurchaseIndentCreated\(/);
  assert.doesNotMatch(indents, /kind:\s*'manual'/);

  const admin = readSource('api/admin-users.js');
  assert.match(admin, /kind:\s*'automated',\s*authUserId:\s*callerAuthId/);
  assert.match(admin, /kind:\s*'manual',\s*authUserId:\s*callerAuthId/);

  const invite = readSource('scripts/invite-existing-users.mjs');
  assert.match(invite, /resolveOutboundRecipients\(\{\s*to,\s*kind:\s*'automated'\s*\}\)/);

  const auth = readSource('src/services/authService.js');
  const resetStart = auth.indexOf('export async function sendPasswordResetEmail');
  const resetBody = auth.slice(resetStart, auth.indexOf('export async function updateOwnPassword'));
  assert.ok(resetBody.indexOf('isCompanyAddress') >= 0);
  assert.ok(resetBody.indexOf('isCompanyAddress') < resetBody.indexOf('resetPasswordForEmail'));
});

function rpcBuilder(value) {
  return {
    then(onFulfilled, onRejected) {
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
  };
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

function profileQuery() {
  return {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({
      data: { id: 'user-1', role: 'Admin', status: 'Active', active: true, auth_user_id: 'auth-admin' },
      error: null,
    }),
  };
}

function mockService() {
  const calls = [];
  return {
    calls,
    auth: {
      getUser: async () => ({ data: { user: { id: 'auth-admin' } }, error: null }),
    },
    from() { return profileQuery(); },
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_email_send') {
        return rpcBuilder({ data: { status: 'ok', id: 7 }, error: null });
      }
      if (name === 'log_blocked_email_send') {
        return rpcBuilder({ data: { status: 'blocked', id: 9 }, error: null });
      }
      return rpcBuilder({ data: null, error: { message: `unexpected ${name}` } });
    },
  };
}

function request(body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer stub-session' },
    body,
  };
}

async function withMailEnv(run) {
  const previous = {
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    [EXTERNAL_MANUAL_EMAIL_ENV]: process.env[EXTERNAL_MANUAL_EMAIL_ENV],
  };
  process.env.SMTP_USER = 'stub-user';
  process.env.SMTP_PASS = 'stub-pass';
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

test('send-email blocks an unclassified external recipient and does not open SMTP', async () => {
  await withMailEnv(async () => {
    const service = mockService();
    const res = mockRes();
    let opened = false;
    await handleSendEmail(request({
      to: 'orders@vendor.com, x@gmail.com <a@gmail.com>',
      cc: 'buyer@client.com',
      bcc: 'hidden@gmail.com',
      replyTo: 'buyer@client.com',
      subject: 'QC overdue',
    }), res, {
      serviceClient: () => service,
      createTransport: () => {
        opened = true;
        throw new Error('SMTP must not be opened');
      },
    });
    assert.equal(opened, false);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.kind, 'automated');
    assert.equal(res.body.success, false);
    const logged = service.calls.find(call => call.name === 'log_blocked_email_send');
    assert.ok(logged);
    assert.equal(logged.args.p_kind, 'automated');
    assert.match(logged.args.p_to, /vendor\.com/);
    assert.equal(service.calls.some(call => call.name === 'claim_email_send'), false);
  });
});

test('send-email keeps only company mailboxes across to, cc and bcc', async () => {
  await withMailEnv(async () => {
    const service = mockService();
    const res = mockRes();
    const sent = [];
    await handleSendEmail(request({
      to: `Vendor <vendor@gmail.com>, ${COMPANY_UPPER}`,
      cc: `x@gmail.com <a@${COMPANY_DOMAIN}>`,
      bcc: `hidden@gmail.com, store@${COMPANY_DOMAIN}`,
      replyTo: `buyer@gmail.com, qa@${COMPANY_DOMAIN}`,
      from: 'attacker@gmail.com',
      subject: 'GRN pending QC',
      kind: 'automated',
      text: 'stub',
      html: '<p>stub</p>',
    }), res, {
      serviceClient: () => service,
      createTransport: () => ({
        sendMail: async (mail) => {
          sent.push(mail);
          return { messageId: 'stub-message' };
        },
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, `QA@${COMPANY_DOMAIN}`);
    assert.equal(sent[0].cc, `a@${COMPANY_DOMAIN}`);
    assert.equal(sent[0].bcc, `store@${COMPANY_DOMAIN}`);
    assert.equal(sent[0].replyTo, `qa@${COMPANY_DOMAIN}`);
    assert.equal(sent[0].from, '"Samyak International ERP" <stub-user>');
    assert.equal(JSON.stringify(sent[0]).includes('gmail.com'), false);
    assert.equal(JSON.stringify(sent[0]).includes('attacker@'), false);
  });
});

test('manual send-email reroutes an external recipient to admin', async () => {
  await withMailEnv(async () => {
    const service = mockService();
    const res = mockRes();
    const sent = [];
    await handleSendEmail(request({
      kind: 'manual',
      to: 'x@gmail.com <buyer@client.com>',
      cc: 'accounts@vendor.com',
      bcc: 'hidden@gmail.com',
      replyTo: 'buyer@client.com',
      subject: 'Purchase order',
    }), res, {
      serviceClient: () => service,
      createTransport: () => ({
        sendMail: async (mail) => {
          sent.push(mail);
          return { messageId: 'manual-message' };
        },
      }),
    });
    assert.equal(res.body.success, true);
    assert.equal(res.body.deliveredTo, ADMIN_REROUTE);
    assert.equal(sent[0].to, ADMIN_REROUTE);
    assert.equal(sent[0].cc, undefined);
    assert.equal(sent[0].bcc, undefined);
    assert.equal(sent[0].replyTo, undefined);
    assert.equal(JSON.stringify(sent[0]).includes('gmail.com'), false);
    assert.equal(JSON.stringify(sent[0]).includes('client.com'), false);
  });
});

test('account setup mail follows the same kind rules and never uses a live transport in tests', async () => {
  const env = { SMTP_USER: 'stub-user', SMTP_PASS: 'stub-pass', SMTP_PORT: '465', SMTP_SECURE: 'true' };
  let opened = 0;
  const transport = () => {
    opened += 1;
    return { sendMail: async () => { throw new Error('unexpected send'); } };
  };
  const blocked = await deliverAccountEmail({
    to: 'new.hire@gmail.com',
    name: 'New Hire',
    actionLink: 'https://erp.example/reset',
    kind: 'automated',
    env,
    createTransport: transport,
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.emailed, false);
  assert.equal(opened, 0);

  const sent = [];
  const manual = await deliverAccountEmail({
    to: 'new.hire@gmail.com',
    name: 'New Hire',
    actionLink: 'https://erp.example/reset',
    kind: 'manual',
    env,
    createTransport: () => ({
      sendMail: async (mail) => {
        sent.push(mail);
        return { messageId: 'account' };
      },
    }),
  });
  assert.equal(manual.emailed, true);
  assert.equal(sent[0].to, ADMIN_REROUTE);
  assert.equal(sent[0].to.includes('gmail.com'), false);

  const company = [];
  const allowed = await deliverAccountEmail({
    to: `New Hire <hire@${COMPANY_DOMAIN}>`,
    name: 'New Hire',
    actionLink: 'https://erp.example/reset',
    kind: 'automated',
    env,
    createTransport: () => ({
      sendMail: async (mail) => {
        company.push(mail);
        return { messageId: 'account-company' };
      },
    }),
  });
  assert.equal(allowed.emailed, true);
  assert.equal(company[0].to, `hire@${COMPANY_DOMAIN}`);
});

test('blocked email log does not count toward the daily cap', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.email_send_log (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      auth_user_id uuid NOT NULL,
      recipient text NOT NULL,
      subject text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT pg_catalog.now()
    );
  `);
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261022040000_email_blocked_outcome.sql', import.meta.url),
    'utf8',
  );
  await db.exec(sql);

  const userId = '11111111-1111-1111-1111-111111111111';
  const blocked = await db.query(
    `SELECT public.log_blocked_email_send($1::uuid, $2, $3, $4) AS result`,
    [userId, 'orders@vendor.com', 'QC overdue', 'automated'],
  );
  assert.equal(blocked.rows[0].result.status, 'blocked');

  const stored = await db.query(`SELECT outcome, kind, recipient FROM public.email_send_log`);
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].outcome, 'blocked');
  assert.equal(stored.rows[0].kind, 'automated');
  assert.match(stored.rows[0].recipient, /vendor\.com/);

  for (let i = 0; i < 60; i += 1) {
    await db.query(
      `INSERT INTO public.email_send_log (auth_user_id, recipient, subject, outcome)
       VALUES ($1::uuid, 'qa@samyakinternational.in', 'noise', 'blocked')`,
      [userId],
    );
  }
  const underCap = await db.query(
    `SELECT public.claim_email_send($1::uuid, $2, $3) AS result`,
    [userId, `qa@${COMPANY_DOMAIN}`, 'Still allowed'],
  );
  assert.equal(underCap.rows[0].result.status, 'ok');

  for (let i = 0; i < 49; i += 1) {
    await db.query(
      `INSERT INTO public.email_send_log (auth_user_id, recipient, subject, outcome)
       VALUES ($1::uuid, 'qa@samyakinternational.in', 'sent', 'sent')`,
      [userId],
    );
  }
  const atCap = await db.query(
    `SELECT public.claim_email_send($1::uuid, $2, $3) AS result`,
    [userId, `qa@${COMPANY_DOMAIN}`, 'Over the user cap'],
  );
  assert.equal(atCap.rows[0].result.status, 'user');

  const anon = await db.query(`
    SELECT has_function_privilege(
      'anon',
      'public.log_blocked_email_send(uuid, text, text, text)',
      'EXECUTE'
    ) AS anon_execute
  `);
  assert.equal(anon.rows[0].anon_execute, false);
  await db.close();
});
