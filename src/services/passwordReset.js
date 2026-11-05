/**
 * Password-recovery status for the login screen.
 *
 * Supabase Auth returns success for an unknown mailbox, and this app does not
 * look the address up in public.users before calling it. Success copy stays
 * neutral so a typed address is not confirmed as an account.
 */

export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 30_000;

const RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
]);

export function passwordResetSuccessMessage(email) {
  const shown = String(email || '').trim();
  return `If an account exists for ${shown}, a password reset link has been sent. Check your inbox and spam folder.`;
}

export function createRecoveryFormState() {
  return {
    phase: 'idle',
    message: '',
    error: '',
    cooldownUntil: 0,
  };
}

export function recoveryCooldownSeconds(state, now = Date.now()) {
  const until = Number(state?.cooldownUntil) || 0;
  if (until <= now) return 0;
  return Math.ceil((until - now) / 1000);
}

export function recoveryButtonDisabled(state, now = Date.now()) {
  return state?.phase === 'sending' || recoveryCooldownSeconds(state, now) > 0;
}

export function recoveryButtonLabel(state, now = Date.now()) {
  if (state?.phase === 'sending') return 'Sending password link...';
  const left = recoveryCooldownSeconds(state, now);
  if (left > 0 && state?.phase === 'error') return `Try again in ${left}s`;
  if (left > 0) return `Resend in ${left}s`;
  if (state?.phase === 'sent') return 'Resend password link';
  return 'Send Password Link';
}

/**
 * Begin a send. A second call while one is in flight, or during the cooldown,
 * is refused so the button cannot double-submit.
 */
export function startRecoverySubmit(state, now = Date.now()) {
  const current = state || createRecoveryFormState();
  if (current.phase === 'sending') {
    return { state: current, accepted: false, reason: 'in_flight' };
  }
  if (recoveryCooldownSeconds(current, now) > 0) {
    return { state: current, accepted: false, reason: 'cooldown' };
  }
  return {
    accepted: true,
    state: {
      ...current,
      phase: 'sending',
      error: '',
    },
  };
}

export function finishRecoverySubmit(_state, result, now = Date.now()) {
  if (result?.success) {
    return {
      phase: 'sent',
      message: result.message || passwordResetSuccessMessage(''),
      error: '',
      cooldownUntil: now + PASSWORD_RESET_RESEND_COOLDOWN_MS,
    };
  }
  const retryAfterMs = Math.max(0, Number(result?.retryAfterMs) || 0);
  return {
    phase: 'error',
    message: '',
    error: result?.message || 'The password reset email could not be sent. An unknown error occurred.',
    cooldownUntil: retryAfterMs > 0 ? now + retryAfterMs : 0,
  };
}

function errorText(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.msg || error.error_description || '');
}

function errorCode(error) {
  if (!error || typeof error !== 'object') return '';
  return String(error.code || error.error_code || error.error || '').toLowerCase();
}

function errorStatus(error) {
  if (!error || typeof error !== 'object') return NaN;
  const status = error.status ?? error.statusCode;
  const parsed = Number(status);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function plainServerReason(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/^(unexpected_failure|authapierror|authretryablefetcherror|error)$/i.test(text)) return '';
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function withDetail(lead, detail) {
  if (!detail) return lead;
  if (lead.toLowerCase().includes(detail.toLowerCase())) return lead;
  return `${lead} (${detail})`;
}

export function waitSecondsFromResetError(error) {
  const message = errorText(error);
  const patterns = [
    /after\s+(\d+)\s*seconds?/i,
    /every\s+(\d+)\s*seconds?/i,
    /(\d+)\s*seconds?/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const seconds = Number(match[1]);
    if (seconds > 0 && seconds < 24 * 60 * 60) return seconds;
  }
  const retry = Number(error?.retryAfter ?? error?.retry_after);
  if (retry > 0 && retry < 24 * 60 * 60) return retry;
  return 0;
}

function isInvalidEmailFailure(message, code, status) {
  if (code === 'email_address_invalid') return true;
  if (code === 'validation_failed' && /email/i.test(message)) return true;
  if ((status === 400 || status === 422) && /email/i.test(message) && /invalid|format/i.test(message)) return true;
  return /invalid email|email address is invalid|unable to validate email/i.test(message);
}

function isRateLimit(message, code, status) {
  if (status === 429) return true;
  if (RATE_LIMIT_CODES.has(code)) return true;
  return /rate limit|too many requests|only request this/i.test(message);
}

function isEmailSendFailure(message, code) {
  if (code === 'email_send_failed' || code === 'smtp_error' || code === 'email_address_not_authorized' || code === 'hook_timeout') {
    return true;
  }
  return /smtp|mailer|gomail|error sending (?:the )?(?:recovery |confirmation |password )?email|unable to send (?:the )?email|failed to send (?:the )?(?:recovery )?email|mail server/i.test(message);
}

function isNetworkFailure(error, message, status) {
  const name = String(error?.name || '');
  if (name === 'AuthRetryableFetchError' || name === 'TypeError') {
    if (name === 'AuthRetryableFetchError' || /fetch|network/i.test(message)) return true;
  }
  if (status === 0) return true;
  return /failed to fetch|network ?error|network request failed|load failed|timeout|timed out|econn|enotfound|offline|aborted|socket/i.test(message);
}

/**
 * Turn a Supabase Auth error, or a thrown exception, into a sentence the
 * person on the recovery form can act on.
 */
export function classifyPasswordResetFailure(error) {
  const message = errorText(error).trim();
  const code = errorCode(error);
  const status = errorStatus(error);

  if (isInvalidEmailFailure(message, code, status)) {
    return {
      type: 'invalid_email',
      retryAfterMs: 0,
      message: 'That email address is not valid. Enter it as name@samyakinternational.in.',
    };
  }

  if (isRateLimit(message, code, status)) {
    const seconds = waitSecondsFromResetError(error);
    return {
      type: 'rate_limit',
      retryAfterMs: seconds > 0 ? seconds * 1000 : 0,
      message: seconds > 0
        ? `Too many password reset requests. Please wait ${seconds} seconds and try again.`
        : 'Too many password reset requests. Please wait a few minutes and try again.',
    };
  }

  if (isEmailSendFailure(message, code)) {
    return {
      type: 'email_send',
      retryAfterMs: 0,
      message: withDetail(
        'The password reset email could not be sent because the mail server rejected it. Try again in a few minutes, or ask an administrator to check the email settings.',
        plainServerReason(message),
      ),
    };
  }

  if (isNetworkFailure(error, message, status)) {
    return {
      type: 'network',
      retryAfterMs: 0,
      message: 'The password reset request did not reach the server. Check your connection and try again.',
    };
  }

  const detail = plainServerReason(message);
  return {
    type: 'unknown',
    retryAfterMs: 0,
    message: detail
      ? `The password reset email could not be sent. ${detail}`
      : 'The password reset email could not be sent. An unknown error occurred.',
  };
}

/**
 * Shared submit path for the recovery form. Calls onUpdate with the loading
 * state before the request, then with success or a caught failure.
 */
export async function runPasswordRecoverySubmit({
  state,
  email,
  now,
  inFlight = false,
  send,
  onUpdate,
} = {}) {
  const startedAt = now == null ? Date.now() : now;
  const finishedAt = () => (now == null ? Date.now() : now);
  if (inFlight) {
    return { state: state || createRecoveryFormState(), accepted: false, reason: 'in_flight' };
  }
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    const next = finishRecoverySubmit(state, {
      success: false,
      message: 'Please enter your registered work email address.',
    }, finishedAt());
    if (onUpdate) onUpdate(next);
    return { state: next, accepted: true };
  }
  const started = startRecoverySubmit(state, startedAt);
  if (!started.accepted) return started;
  if (onUpdate) onUpdate(started.state);
  try {
    const result = await send(trimmed);
    const next = finishRecoverySubmit(started.state, result, finishedAt());
    if (onUpdate) onUpdate(next);
    return { state: next, accepted: true };
  } catch (error) {
    const failure = classifyPasswordResetFailure(error);
    const next = finishRecoverySubmit(started.state, {
      success: false,
      message: failure.message,
      retryAfterMs: failure.retryAfterMs,
    }, finishedAt());
    if (onUpdate) onUpdate(next);
    return { state: next, accepted: true };
  }
}
