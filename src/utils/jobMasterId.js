/** Next free JM-2026-NNN id. Gaps below the max are left empty. */

export function jobMasterSerial(id) {
  const match = String(id || '').trim().match(/^jm-2026-(\d+)$/i);
  if (!match) return null;
  const serial = Number(match[1]);
  return Number.isSafeInteger(serial) ? serial : null;
}

export function formatJobMasterId(serial) {
  return `JM-2026-${String(serial).padStart(3, '0')}`;
}

export function allocateJobMasterIds(existingIds = [], count = 1, reserved = []) {
  const wanted = Math.max(0, parseInt(count, 10) || 0);
  const taken = new Set();
  let maxSerial = 0;
  const note = (id) => {
    const serial = jobMasterSerial(id);
    if (serial == null) return;
    taken.add(serial);
    if (serial > maxSerial) maxSerial = serial;
  };
  (existingIds || []).forEach(note);
  (reserved || []).forEach(note);
  const issued = [];
  let serial = maxSerial;
  let guard = 0;
  while (issued.length < wanted) {
    serial += 1;
    guard += 1;
    if (guard > 100000) break;
    if (taken.has(serial)) continue;
    taken.add(serial);
    issued.push(formatJobMasterId(serial));
  }
  return issued;
}
