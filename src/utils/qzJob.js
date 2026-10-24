/**
 * Windows spooler words reported by QZ Tray (qz.printers.startListening with jobData).
 * PRINTING and SPOOLING are not finished jobs. The status column stays Not printed
 * until the spooler says the job completed.
 */

const FAILED = /(^|_)(ERROR|PAPEROUT|PAPER_OUT|OFFLINE|USER_INTERVENTION|FAILED)(_|$)/;
const CANCELLED = /(^|_)(DELETED|DELETING|CANCELED|CANCELLED)(_|$)/;
const PRINTED = /(^|_)(PRINTED|COMPLETE|COMPLETED|SUCCESS)(_|$)/;

export function spoolerToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * A Windows job can report more than one word ("PRINTING, PRINTED").
 * Error and cancel win over a leftover printed flag. The SQL settle
 * function uses the same words and the same priority.
 * @returns {'printed'|'failed'|'cancelled'|'pending'}
 */
export function classifySpoolerStatus(value) {
  const token = spoolerToken(value);
  if (!token) return 'pending';
  if (FAILED.test(token)) return 'failed';
  if (CANCELLED.test(token)) return 'cancelled';
  if (PRINTED.test(token)) return 'printed';
  return 'pending';
}

export function spoolerEventStatus(event) {
  return event?.statusText || event?.status || event?.actionType || '';
}

export function eventMatchesJob(event, jobId) {
  const name = String(event?.jobName || '');
  if (!jobId) return false;
  if (!name) return false;
  return name === jobId || name.includes(jobId);
}
