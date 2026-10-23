import test from 'node:test';
import assert from 'node:assert/strict';
import { readSmtpConfig } from '../api/smtpConfig.js';
import { resolveAppOrigin } from '../api/appOrigin.js';
import { deliverAccountEmail } from '../api/admin-users.js';
import { companyDomain } from '../src/services/emailPolicy.js';

process.env.COMPANY_EMAIL_DOMAIN = 'samyakinternational.in';
process.env.ADMIN_REROUTE = 'admin@samyakinternational.in';
const COMPANY_DOMAIN = companyDomain();

const complete = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'false',
  SMTP_USER: 'mailer@example.test',
  SMTP_PASS: 'secret',
};

test('SMTP config requires every setting and does not infer TLS from port 465', () => {
  const smtp = readSmtpConfig(complete);
  assert.equal(smtp.host, 'smtp.example.test');
  assert.equal(smtp.port, 465);
  assert.equal(smtp.secure, false);
  assert.equal(Object.hasOwn(smtp, 'tls'), false);
  assert.equal(smtp.auth.user, 'mailer@example.test');

  assert.throws(() => readSmtpConfig({ ...complete, SMTP_HOST: '' }), /SMTP_HOST/);
  assert.throws(() => readSmtpConfig({ ...complete, SMTP_SECURE: '' }), /SMTP_SECURE/);
  assert.throws(() => readSmtpConfig({ ...complete, SMTP_PORT: 'nope' }), /SMTP_PORT/);
  assert.throws(() => readSmtpConfig({}), /SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS/);
});

test('APP_ORIGIN is required and must be an origin', () => {
  assert.equal(resolveAppOrigin({ APP_ORIGIN: 'https://preview.example.test/' }), 'https://preview.example.test');
  assert.throws(() => resolveAppOrigin({}), /APP_ORIGIN is not configured/);
  assert.throws(() => resolveAppOrigin({ APP_ORIGIN: 'https://preview.example.test/reset' }), /origin only/);
  assert.throws(() => resolveAppOrigin({ APP_ORIGIN: 'ftp://preview.example.test' }), /http or https/);
});

test('account mail does not open SMTP when the recipient is blocked or the host is missing', async () => {
  let opened = 0;
  const blocked = await deliverAccountEmail({
    to: 'new.hire@gmail.com',
    name: 'New Hire',
    actionLink: 'https://example.test/reset',
    kind: 'automated',
    env: {},
    createTransport: () => {
      opened += 1;
      throw new Error('SMTP must not be opened');
    },
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.emailed, false);
  assert.equal(opened, 0);

  await assert.rejects(
    () => deliverAccountEmail({
      to: `hire@${COMPANY_DOMAIN}`,
      name: 'Hire',
      actionLink: 'https://example.test/reset',
      kind: 'automated',
      env: { SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: '465', SMTP_SECURE: 'true' },
      createTransport: () => {
        opened += 1;
        throw new Error('SMTP must not be opened');
      },
    }),
    /SMTP_HOST/,
  );
  assert.equal(opened, 0);
});
