/**
 * One active print run per printing machine.
 * A run with no machine shares one plant-wide slot: it blocks every other start,
 * and any other active run blocks a start that has no machine.
 */

export function machineSlot(machineId) {
  const text = String(machineId ?? '').trim();
  return text || '__GLOBAL__';
}

export function isActivePrintRun(order) {
  if (!order) return false;
  const end = order.printingEndTime || order.printing_end_time;
  if (end) return false;
  const start = order.printingStartTime || order.printing_start_time;
  const status = String(order.printingStatus || order.printing_status || '').trim().toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'canceled') return false;
  if (status === 'in production' || status === 'in progress' || status === 'running' || status === 'started') return true;
  return Boolean(start);
}

export function printRunJobLabel(order) {
  const raw = String(order?.jobName || order?.job_name || '').split(' ||| ')[0].trim();
  return raw || order?.id || 'Untitled job';
}

export function findActivePrintConflict(orders, { orderId, machineId } = {}) {
  const slot = machineSlot(machineId);
  const others = (orders || []).filter((order) => order && order.id !== orderId && isActivePrintRun(order));
  const conflict = slot === '__GLOBAL__'
    ? others[0]
    : others.find((order) => {
      const other = machineSlot(order.machineId || order.machine_id);
      return other === '__GLOBAL__' || other === slot;
    });
  if (!conflict) return null;
  return {
    orderId: conflict.id,
    machineId: String(conflict.machineId || conflict.machine_id || '').trim(),
    jobName: printRunJobLabel(conflict),
    scope: slot === '__GLOBAL__' ? 'global' : 'machine'
  };
}

/**
 * Groups that are already open together. The migration does not close them.
 * A plant-wide (no machine) run makes every other active run part of the same group.
 */
export function duplicateActiveGroups(orders) {
  const active = (orders || []).filter(isActivePrintRun);
  if (active.length < 2) return [];
  const bySlot = new Map();
  active.forEach((order) => {
    const slot = machineSlot(order.machineId || order.machine_id);
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(order);
  });
  const global = bySlot.get('__GLOBAL__') || [];
  if (global.length > 0) {
    return [{
      slot: '__GLOBAL__',
      reason: 'A print run has no printing machine, so the plant can have only one active run. These were already open and were left running.',
      runs: active.map(describeRun)
    }];
  }
  const groups = [];
  bySlot.forEach((runs, slot) => {
    if (runs.length < 2) return;
    groups.push({
      slot,
      reason: `More than one print run is active on ${slot}. They were left running. End one before starting another job on this press.`,
      runs: runs.map(describeRun)
    });
  });
  return groups;
}

function describeRun(order) {
  return {
    orderId: order.id,
    machineId: String(order.machineId || order.machine_id || '').trim(),
    jobName: printRunJobLabel(order),
    printingStartTime: order.printingStartTime || order.printing_start_time || null
  };
}

export function parseActivePrintRunConflict(error) {
  const message = String(error?.message || error || '');
  const marker = message.indexOf('PRINT_RUN_BUSY');
  if (marker < 0) return null;
  const jsonStart = message.indexOf('{', marker);
  if (jsonStart < 0) return null;
  let depth = 0;
  let jsonEnd = -1;
  for (let index = jsonStart; index < message.length; index += 1) {
    const char = message[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        jsonEnd = index;
        break;
      }
    }
  }
  if (jsonEnd < 0) return null;
  try {
    const data = JSON.parse(message.slice(jsonStart, jsonEnd + 1));
    const human = message.slice(jsonEnd + 1).trim();
    return {
      orderId: String(data.orderId || ''),
      machineId: String(data.machineId || ''),
      jobName: String(data.jobName || data.orderId || 'the running job'),
      scope: data.scope === 'global' ? 'global' : 'machine',
      message: human || message.slice(marker).trim()
    };
  } catch {
    return null;
  }
}

export function activePrintConflictMessage(conflict, machines = []) {
  if (!conflict) return '';
  if (conflict.message) return conflict.message;
  const machine = (machines || []).find((item) => item.id === conflict.machineId);
  const machineLabel = machine?.name || conflict.machineId;
  if (conflict.scope === 'global' || !conflict.machineId) {
    return `Another print run is still active with no printing machine on the run: ${conflict.jobName} (${conflict.orderId}). End that run before starting another job.`;
  }
  return `Another print run is still active on ${machineLabel}: ${conflict.jobName} (${conflict.orderId}). End that run before starting another job.`;
}
