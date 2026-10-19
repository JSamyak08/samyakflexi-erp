import assert from 'node:assert/strict';
import { handleSendEmail } from '../api/send-email.js';
import {
  QC_ESCALATION_SESSION_KEY,
  dispatchOverdueQcAlerts,
  resetQcEscalationGuard,
} from '../src/services/qcEscalationGuard.js';

// PostgREST's rpc() result is a filter builder: await uses then(), and there
// is no catch(). The production handler crashed on `.catch` before it could
// log the SMTP error or call release_email_send.
function rpcBuilder(value, { reject } = {}) {
  return {
    then(onFulfilled, onRejected) {
      const promise = reject ? Promise.reject(reject) : Promise.resolve(value);
      return promise.then(onFulfilled, onRejected);
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

function mailRequest() {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer stub-session' },
    body: {
      to: 'admin@samyakinternational.in, quality@samyakinternational.in',
      cc: 'plant.manager@plant.com',
      subject: 'OVERDUE QC APPROVAL ALERT: GRN #13',
      text: 'stub',
      html: '<p>stub</p>',
    },
  };
}

function profileQuery() {
  return {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({
      data: {
        id: 'user-1',
        role: 'Admin',
        status: 'Active',
        active: true,
        auth_user_id: 'auth-admin',
      },
      error: null,
    }),
  };
}

// In-memory stand-in for email_send_log / release_email_send. Nothing here
// talks to Supabase or SMTP.
function capService({ releaseReject, releaseError } = {}) {
  const rows = [];
  let nextId = 1;
  const calls = [];
  const service = {
    rows,
    calls,
    auth: {
      getUser: async () => ({ data: { user: { id: 'auth-admin' } }, error: null }),
    },
    from() {
      return profileQuery();
    },
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_email_send') {
        const id = nextId;
        nextId += 1;
        rows.push({ id, subject: args.p_subject });
        return rpcBuilder({ data: { status: 'ok', id }, error: null });
      }
      if (name === 'release_email_send') {
        if (releaseReject) return rpcBuilder(null, { reject: releaseReject });
        const index = rows.findIndex(row => row.id === args.p_id);
        if (!releaseError && index >= 0) rows.splice(index, 1);
        return rpcBuilder({ data: null, error: releaseError || null });
      }
      return rpcBuilder({ data: null, error: { message: `unexpected ${name}` } });
    },
  };
  return service;
}

function transport(sendMail) {
  return () => ({ sendMail });
}

async function withErrorLog(run) {
  const logs = [];
  const original = console.error;
  console.error = (...args) => {
    logs.push(args);
  };
  try {
    await run(logs);
  } finally {
    console.error = original;
  }
}

const previousEnv = {
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
};
process.env.SMTP_USER = 'stub-user';
process.env.SMTP_PASS = 'stub-pass';

try {
  const broken = rpcBuilder({ data: null, error: null });
  assert.equal(typeof broken.catch, 'undefined');
  assert.throws(() => broken.catch(() => {}), TypeError);

  await withErrorLog(async (logs) => {
    const service = capService();
    const res = mockRes();
    await assert.doesNotReject(() => handleSendEmail(mailRequest(), res, {
      serviceClient: () => service,
      createTransport: transport(async () => {
        throw new Error('SMTP 550 relay denied');
      }),
    }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Failed to send email.' });
    assert.equal(service.rows.length, 0, 'a failed send releases the daily cap slot');
    assert.equal(service.calls.some(call => call.name === 'release_email_send' && call.args.p_id === 1), true);
    const smtpLog = logs.findIndex(args => args.some(part => String(part && part.message || part).includes('SMTP 550 relay denied')));
    const releaseLog = logs.findIndex(args => args.some(part => String(part).includes('release')));
    assert.ok(smtpLog >= 0, 'the original mail error is logged');
    assert.equal(releaseLog, -1, 'a successful release is not an error');
    assert.ok(service.calls.findIndex(call => call.name === 'release_email_send') > service.calls.findIndex(call => call.name === 'claim_email_send'));
    assert.equal(logs[0].some(part => String(part && part.message || part).includes('SMTP 550 relay denied')), true);
  });

  await withErrorLog(async (logs) => {
    const service = capService({ releaseReject: new Error('release rpc rejected') });
    const res = mockRes();
    await assert.doesNotReject(() => handleSendEmail(mailRequest(), res, {
      serviceClient: () => service,
      createTransport: transport(async () => {
        throw new Error('SMTP connection timed out');
      }),
    }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Failed to send email.' });
    assert.equal(logs[0].some(part => String(part && part.message || part).includes('SMTP connection timed out')), true);
    assert.ok(logs.some(args => args.some(part => String(part && part.message || part).includes('release rpc rejected'))));
  });

  await withErrorLog(async () => {
    const service = capService({ releaseError: { message: 'delete failed' } });
    const res = mockRes();
    await handleSendEmail(mailRequest(), res, {
      serviceClient: () => service,
      createTransport: transport(async () => {
        throw new Error('SMTP 535 auth failed');
      }),
    });
    assert.equal(res.statusCode, 500);
    assert.equal(service.rows.length, 1, 'a release error leaves the row, and the handler still answers');
  });

  await withErrorLog(async (logs) => {
    const service = capService();
    const res = mockRes();
    await handleSendEmail(mailRequest(), res, {
      serviceClient: () => service,
      createTransport: transport(async () => ({ messageId: 'stub-message' })),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.messageId, 'stub-message');
    assert.equal(service.calls.some(call => call.name === 'release_email_send'), false);
    assert.equal(service.rows.length, 1, 'a delivered send keeps its cap slot');
    assert.equal(logs.length, 0);
  });

  await withErrorLog(async () => {
    delete process.env.SMTP_PASS;
    const service = capService();
    const res = mockRes();
    await handleSendEmail(mailRequest(), res, {
      serviceClient: () => service,
      createTransport: () => {
        throw new Error('transport should not be opened');
      },
    });
    process.env.SMTP_PASS = 'stub-pass';
    assert.equal(res.statusCode, 500);
    assert.equal(service.rows.length, 0, 'SMTP misconfiguration releases the slot and does not send');
  });
} finally {
  if (previousEnv.SMTP_USER === undefined) delete process.env.SMTP_USER;
  else process.env.SMTP_USER = previousEnv.SMTP_USER;
  if (previousEnv.SMTP_PASS === undefined) delete process.env.SMTP_PASS;
  else process.env.SMTP_PASS = previousEnv.SMTP_PASS;
}

const bag = new Map();
globalThis.sessionStorage = {
  getItem: key => (bag.has(key) ? bag.get(key) : null),
  setItem: (key, value) => bag.set(key, String(value)),
  removeItem: key => bag.delete(key),
};

assert.notEqual(QC_ESCALATION_SESSION_KEY, 'samyak_qc_escalation_digest_day');

function grn(grnNo, { hours = 20, status = 'Pending QC Approval', qcEscalationSent = false, receivedDate } = {}) {
  return {
    grnNo,
    id: `row-${grnNo}`,
    status,
    qcEscalationSent,
    vendorName: 'Mill',
    itemName: 'PET',
    receivedDate: receivedDate || new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
  };
}

const quiet = { log: console.log, warn: console.warn };
console.log = () => {};
console.warn = () => {};

try {
  resetQcEscalationGuard();
  const now = Date.parse('2026-10-19T09:17:00.000Z');
  const at = hours => new Date(now - hours * 60 * 60 * 1000).toISOString();
  const page = [
    grn(13, { receivedDate: at(30) }),
    grn(14, { receivedDate: at(20) }),
    grn(15, { receivedDate: at(3) }),
    grn(16, { status: 'QC Approved', receivedDate: at(30) }),
    grn(17, { qcEscalationSent: true, receivedDate: at(30) }),
  ];

  const sends = [];
  const updates = [];
  let releaseFirst;
  const hold = new Promise(resolve => {
    releaseFirst = resolve;
  });
  const notify = async ({ grn: row }) => {
    sends.push(row.grnNo);
    if (sends.length === 1) await hold;
    if (row.grnNo === 13) throw new Error('mail server rejected');
  };
  const pass = () => dispatchOverdueQcAlerts({
    grns: page,
    users: [],
    now,
    notify,
    onUpdateGRN: async row => { updates.push(row.grnNo); },
  });

  const first = pass();
  await Promise.resolve();
  const rerenders = Array.from({ length: 8 }, () => pass());
  releaseFirst();
  await Promise.all([first, ...rerenders]);

  assert.deepEqual(sends, [13, 14], 'one page load sends at most one alert per overdue GRN');
  assert.deepEqual(updates, [14], 'a failed send does not mark the GRN or retry');

  const again = await pass();
  assert.deepEqual(again.sent, []);
  assert.deepEqual(again.failed, []);
  assert.deepEqual(sends, [13, 14], 'a settled failure and a later re-render do not send again');

  resetQcEscalationGuard({ memoryOnly: true });
  const afterReload = await dispatchOverdueQcAlerts({
    grns: page,
    users: [],
    now,
    notify,
    onUpdateGRN: async () => { throw new Error('should not update'); },
  });
  assert.deepEqual(afterReload.claimed, [], 'a reload in the same tab keeps the session claim');
  assert.deepEqual(sends, [13, 14]);

  let wroteFresh = false;
  const fresh = await dispatchOverdueQcAlerts({
    grns: [grn(18, { receivedDate: '18/10/2026' })],
    users: [],
    now,
    notify: async () => ({ success: false, message: 'Failed to send email.' }),
    onUpdateGRN: async () => { wroteFresh = true; },
    isCancelled: () => true,
  });
  assert.deepEqual(fresh.failed, ['18']);
  assert.equal(fresh.sent.length, 0);
  assert.equal(wroteFresh, false, 'an HTTP failure does not mark the GRN sent');

  const failedRerender = await dispatchOverdueQcAlerts({
    grns: [grn(18, { receivedDate: '18/10/2026' })],
    users: [],
    now,
    notify: async () => { throw new Error('should not retry'); },
  });
  assert.deepEqual(failedRerender.claimed, []);
} finally {
  console.log = quiet.log;
  console.warn = quiet.warn;
}

console.log('qc alert checks passed');
