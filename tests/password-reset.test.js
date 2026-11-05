import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

await register(new URL('../scripts/resolve-js-hook.mjs', import.meta.url));

const { sendPasswordResetEmail } = await import('../src/services/authService.js');
const {
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  classifyPasswordResetFailure,
  createRecoveryFormState,
  finishRecoverySubmit,
  passwordResetSuccessMessage,
  recoveryButtonDisabled,
  recoveryButtonLabel,
  recoveryCooldownSeconds,
  runPasswordRecoverySubmit,
  startRecoverySubmit,
} = await import('../src/services/passwordReset.js');

const COMPANY = 'plant@samyakinternational.in';
const NOW = 1_700_000_000_000;
const PRODUCTION_REDIRECT = 'https://erp.samyakinternational.in/auth/confirm';

function resetDeps(resetPasswordForEmail, extra = {}) {
  return {
    isConfigured: true,
    origin: 'https://erp.samyakinternational.in',
    resetPasswordForEmail,
    ...extra,
  };
}

test('a successful reset reports a neutral inbox message and keeps the ERP confirm link', async () => {
  const calls = [];
  const result = await sendPasswordResetEmail('  Production@SamyakInternational.in  ', resetDeps(async (email, options) => {
    calls.push({ email, options });
    return { data: {}, error: null };
  }));

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].email, 'production@samyakinternational.in');
  assert.equal(calls[0].options.redirectTo, PRODUCTION_REDIRECT);
  assert.equal(result.message, passwordResetSuccessMessage('production@samyakinternational.in'));
  assert.match(result.message, /If an account exists for production@samyakinternational\.in/);
  assert.match(result.message, /Check your inbox and spam folder/);
  assert.doesNotMatch(result.message, /vercel\.app|supabase\.co/);

  const ui = finishRecoverySubmit(createRecoveryFormState(), result, NOW);
  assert.equal(ui.phase, 'sent');
  assert.equal(ui.error, '');
  assert.equal(ui.message, result.message);
  assert.equal(ui.cooldownUntil, NOW + PASSWORD_RESET_RESEND_COOLDOWN_MS);
  assert.equal(recoveryCooldownSeconds(ui, NOW), 30);
  assert.equal(recoveryCooldownSeconds(ui, NOW + 1000), 29);
  assert.equal(recoveryButtonDisabled(ui, NOW + 1000), true);
  assert.equal(recoveryButtonLabel(ui, NOW + 1000), 'Resend in 29s');
  assert.equal(recoveryButtonLabel(ui, NOW + PASSWORD_RESET_RESEND_COOLDOWN_MS), 'Resend password link');
  assert.equal(recoveryButtonDisabled(ui, NOW + PASSWORD_RESET_RESEND_COOLDOWN_MS), false);
  assert.equal(ui.message, result.message);
});

test('a vercel.app or supabase.co page origin still redirects the reset link to the ERP', async () => {
  const previous = globalThis.window;
  const seen = [];
  globalThis.window = { location: { origin: 'https://samyakflexi-erp.vercel.app' } };
  try {
    await sendPasswordResetEmail(COMPANY, {
      isConfigured: true,
      resetPasswordForEmail: async (_email, options) => {
        seen.push(options.redirectTo);
        return { error: null };
      },
    });
    globalThis.window = { location: { origin: 'https://eamstsaqkbeiywfaanhi.supabase.co' } };
    await sendPasswordResetEmail(COMPANY, {
      isConfigured: true,
      resetPasswordForEmail: async (_email, options) => {
        seen.push(options.redirectTo);
        return { error: null };
      },
    });
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  assert.deepEqual(seen, [PRODUCTION_REDIRECT, PRODUCTION_REDIRECT]);
});

test('an address outside the company domain does not call Auth and uses the same neutral success', async () => {
  let called = false;
  const result = await sendPasswordResetEmail('person@gmail.com', resetDeps(async () => {
    called = true;
    return { error: null };
  }));
  assert.equal(called, false);
  assert.equal(result.success, true);
  assert.equal(result.suppressed, true);
  assert.equal(result.message, passwordResetSuccessMessage('person@gmail.com'));
});

test('an invalid email is a visible failure and never reaches Auth', async () => {
  let called = false;
  const result = await sendPasswordResetEmail('not-an-email', resetDeps(async () => {
    called = true;
    return { error: null };
  }));
  assert.equal(called, false);
  assert.equal(result.success, false);
  assert.equal(result.type, 'invalid_email');
  assert.match(result.message, /not valid/);
  assert.match(result.message, /name@samyakinternational\.in/);

  const fromServer = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: {
      name: 'AuthApiError',
      status: 400,
      code: 'email_address_invalid',
      message: 'Unable to validate email address: invalid format',
    },
  })));
  assert.equal(fromServer.success, false);
  assert.equal(fromServer.type, 'invalid_email');
  assert.match(fromServer.message, /not valid/);
});

test('a rate limit says how long to wait when Auth includes it, and stays plain when it does not', async () => {
  const withWait = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: {
      name: 'AuthApiError',
      status: 429,
      code: 'over_request_rate_limit',
      message: 'For security purposes, you can only request this after 60 seconds.',
    },
  })));
  assert.equal(withWait.success, false);
  assert.equal(withWait.type, 'rate_limit');
  assert.equal(withWait.retryAfterMs, 60_000);
  assert.match(withWait.message, /Too many password reset requests/);
  assert.match(withWait.message, /wait 60 seconds/);
  const waiting = finishRecoverySubmit(createRecoveryFormState(), withWait, NOW);
  assert.equal(waiting.phase, 'error');
  assert.equal(recoveryButtonLabel(waiting, NOW + 1000), 'Try again in 59s');
  assert.equal(recoveryButtonDisabled(waiting, NOW + 1000), true);
  assert.equal(recoveryButtonDisabled(waiting, NOW + 60_000), false);

  const noWait = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: {
      status: 429,
      code: 'over_email_send_rate_limit',
      message: 'email rate limit exceeded',
    },
  })));
  assert.equal(noWait.type, 'rate_limit');
  assert.equal(noWait.retryAfterMs, 0);
  assert.match(noWait.message, /few minutes/);
  assert.doesNotMatch(noWait.message, /email rate limit exceeded/);
});

test('an SMTP or mail-server failure names the mail problem and keeps the server reason', async () => {
  const smtp = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: {
      name: 'AuthApiError',
      status: 500,
      code: 'unexpected_failure',
      message: 'Error sending recovery email',
    },
  })));
  assert.equal(smtp.success, false);
  assert.equal(smtp.type, 'email_send');
  assert.match(smtp.message, /mail server rejected it/);
  assert.match(smtp.message, /Error sending recovery email/);

  const authz = classifyPasswordResetFailure({
    status: 500,
    code: 'email_address_not_authorized',
    message: 'Email address not authorized',
  });
  assert.equal(authz.type, 'email_send');
  assert.match(authz.message, /mail server rejected it/);
});

test('a network failure, including a thrown fetch error, is reported and does not reject', async () => {
  const returned = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
  })));
  assert.equal(returned.success, false);
  assert.equal(returned.type, 'network');
  assert.match(returned.message, /did not reach the server/);
  assert.doesNotMatch(returned.message, /Failed to fetch/);

  const thrown = await sendPasswordResetEmail(COMPANY, resetDeps(async () => {
    throw new TypeError('Failed to fetch');
  }));
  assert.equal(thrown.type, 'network');
  assert.match(thrown.message, /Check your connection/);

  const ui = await runPasswordRecoverySubmit({
    state: createRecoveryFormState(),
    email: COMPANY,
    now: NOW,
    send: async () => {
      throw new TypeError('NetworkError when attempting to fetch resource');
    },
  });
  assert.equal(ui.state.phase, 'error');
  assert.match(ui.state.error, /did not reach the server/);
});

test('an unknown failure keeps the server reason, and an empty failure is still shown', async () => {
  const odd = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: { status: 500, code: 'unexpected_failure', message: 'database exploded' },
  })));
  assert.equal(odd.success, false);
  assert.equal(odd.type, 'unknown');
  assert.match(odd.message, /could not be sent/);
  assert.match(odd.message, /database exploded/);

  const empty = await sendPasswordResetEmail(COMPANY, resetDeps(async () => ({
    error: { message: '' },
  })));
  assert.equal(empty.type, 'unknown');
  assert.match(empty.message, /unknown error occurred/);

  const thrown = await sendPasswordResetEmail(COMPANY, resetDeps(async () => {
    throw new Error('mailbox provider exploded');
  }));
  assert.equal(thrown.type, 'unknown');
  assert.match(thrown.message, /mailbox provider exploded/);
});

test('a missing Supabase configuration is a failure and does not call Auth', async () => {
  let called = false;
  const result = await sendPasswordResetEmail(COMPANY, resetDeps(async () => {
    called = true;
    return { error: null };
  }, { isConfigured: false }));
  assert.equal(called, false);
  assert.equal(result.success, false);
  assert.match(result.message, /not configured/);
});

test('the recovery button shows a loading state and ignores a second submit', async () => {
  const phases = [];
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const task = runPasswordRecoverySubmit({
    state: createRecoveryFormState(),
    email: `  ${COMPANY}  `,
    now: NOW,
    send: () => pending,
    onUpdate: (state) => {
      phases.push({
        phase: state.phase,
        label: recoveryButtonLabel(state, NOW),
        disabled: recoveryButtonDisabled(state, NOW),
      });
    },
  });

  assert.equal(phases.length, 1);
  assert.deepEqual(phases[0], {
    phase: 'sending',
    label: 'Sending password link...',
    disabled: true,
  });
  const duplicate = startRecoverySubmit({
    phase: 'sending',
    message: '',
    error: '',
    cooldownUntil: 0,
  }, NOW);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'in_flight');

  let calls = 0;
  const blocked = await runPasswordRecoverySubmit({
    state: createRecoveryFormState(),
    email: COMPANY,
    now: NOW,
    inFlight: true,
    send: async () => {
      calls += 1;
      return { success: true, message: 'should not send' };
    },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, 'in_flight');
  assert.equal(calls, 0);

  release({ success: true, message: passwordResetSuccessMessage(COMPANY) });
  const done = await task;
  assert.equal(done.state.phase, 'sent');
  assert.equal(phases[1].phase, 'sent');
  assert.equal(phases[1].disabled, true);
  assert.equal(phases[1].label, 'Resend in 30s');
  assert.match(done.state.message, /inbox and spam/);
});

test('a resend is refused until the cooldown ends, and an empty address is an error', async () => {
  const sent = finishRecoverySubmit(createRecoveryFormState(), {
    success: true,
    message: passwordResetSuccessMessage(COMPANY),
  }, NOW);
  const early = startRecoverySubmit(sent, NOW + 1000);
  assert.equal(early.accepted, false);
  assert.equal(early.reason, 'cooldown');
  assert.equal(early.state.message, sent.message);

  const blank = await runPasswordRecoverySubmit({
    state: createRecoveryFormState(),
    email: '   ',
    now: NOW,
    send: async () => {
      throw new Error('send must not be called');
    },
  });
  assert.equal(blank.state.phase, 'error');
  assert.match(blank.state.error, /enter your registered work email/i);
});

test('the forgot-password screen renders the status the request used to drop', () => {
  const screen = fs.readFileSync(new URL('../src/components/AuthScreen.jsx', import.meta.url), 'utf8');
  const start = screen.indexOf("viewMode === 'forgot_password'");
  const end = screen.indexOf('{recoveryMode && (', start);
  const view = screen.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(view, /data-testid="password-reset-status"/);
  assert.match(view, /data-testid="password-reset-error"/);
  assert.match(view, /data-testid="send-password-link"/);
  assert.match(view, /aria-busy=\{recoveryForm\.phase === 'sending'\}/);
  assert.match(view, /disabled=\{recoveryButtonDisabled\(recoveryForm, recoveryClock\)\}/);
  assert.match(view, /Sending password link\.\.\./);
  assert.match(view, /data-testid="password-reset-cooldown"/);
  assert.match(screen, /if \(recoverySubmitLock\.current\) return/);
  assert.match(screen, /catch \(err\)/);

  const auth = fs.readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8');
  const resetStart = auth.indexOf('export async function sendPasswordResetEmail');
  const resetBody = auth.slice(resetStart, auth.indexOf('export async function updateOwnPassword'));
  assert.ok(resetBody.indexOf('isCompanyAddress') < resetBody.indexOf('resetPasswordForEmail'));
  assert.match(resetBody, /\/auth\/confirm/);
  assert.doesNotMatch(resetBody, /\.from\(['"]users['"]\)/);
  assert.match(resetBody, /catch \(error\)/);
});
