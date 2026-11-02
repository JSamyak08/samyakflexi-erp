/**
 * Running time is each print run from start to end. An open run runs until asOf.
 * Idle time is the gap from the end of one run to the start of the next run
 * on the same machine. Time before the first run and after the last run is not idle.
 * Runs and gaps are clipped to the selected IST window and split on shift and midnight edges.
 */
import {
  addCalendarDays,
  clockMinutes,
  formatDurationMinutes,
  istParts,
  istTimestamp,
  normalizePrintingShifts
} from './printingShifts.js';
import { machineSlot } from './printRunConflict.js';

const UNASSIGNED = { id: 'unassigned', name: 'Unassigned' };

function minutesOfDay(ms) {
  const parts = istParts(ms);
  return parts.hour * 60 + parts.minute;
}

function shiftContains(shift, minuteOfDay) {
  const start = clockMinutes(shift.start);
  const end = clockMinutes(shift.end);
  if (start === null || end === null) return false;
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

export function shiftAt(ms, shifts) {
  const minute = minutesOfDay(ms);
  return (shifts || []).find((shift) => shiftContains(shift, minute)) || UNASSIGNED;
}

function nextEdge(ms, shifts) {
  const parts = istParts(ms);
  const edges = [];
  for (let extra = 0; extra <= 1; extra += 1) {
    const day = addCalendarDays(parts.year, parts.month, parts.day, extra);
    const clocks = new Set(['00:00']);
    (shifts || []).forEach((shift) => {
      clocks.add(shift.start);
      clocks.add(shift.end);
    });
    clocks.forEach((clock) => {
      const [hour, minute] = clock.split(':').map(Number);
      edges.push(istTimestamp(day.year, day.month, day.day, hour, minute, 0));
    });
  }
  const upcoming = edges.filter((edge) => edge > ms).sort((left, right) => left - right);
  return upcoming[0] ?? (ms + 60 * 1000);
}

export function splitInterval(startMs, endMs, shifts) {
  if (!(endMs > startMs)) return [];
  const parts = [];
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 20000) {
    guard += 1;
    const shift = shiftAt(cursor, shifts);
    const boundary = Math.min(endMs, nextEdge(cursor, shifts));
    if (!(boundary > cursor)) break;
    parts.push({ start: cursor, end: boundary, shift });
    cursor = boundary;
  }
  return parts;
}

function asMillis(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeRun(run, asOfMs) {
  const start = asMillis(run?.startedAt ?? run?.started_at);
  if (start === null || start > asOfMs) return null;
  const rawEnd = run?.endedAt ?? run?.ended_at;
  const ended = asMillis(rawEnd);
  let end = ended === null || ended > asOfMs ? asOfMs : ended;
  if (end < start) end = start;
  const orderId = String(run?.orderId || run?.order_id || '');
  const machineId = String(run?.machineId ?? run?.machine_id ?? '').trim();
  return {
    key: `${orderId}|${new Date(start).toISOString()}|${machineId}`,
    orderId,
    machineId,
    slot: machineSlot(machineId),
    jobName: String(run?.jobName || run?.job_name || orderId || 'Untitled job'),
    operatorName: String(run?.operatorName || run?.operator_name || '').trim(),
    endedOperatorName: String(run?.endedOperatorName || run?.ended_operator_name || '').trim(),
    start,
    end,
    open: ended === null || ended > asOfMs
  };
}

function machineLabel(slot, machineId, machines) {
  if (slot === '__GLOBAL__') return 'No machine (plant-wide)';
  const found = (machines || []).find((item) => item && item.id === machineId);
  if (found?.name) return `${found.name} (${machineId})`;
  return machineId || slot;
}

function percent(part, whole) {
  if (!(whole > 0)) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function minutesBetween(start, end) {
  return (end - start) / 60000;
}

function clip(start, end, rangeStart, rangeEnd) {
  const clippedStart = Math.max(start, rangeStart);
  const clippedEnd = Math.min(end, rangeEnd);
  if (!(clippedEnd > clippedStart)) return null;
  return [clippedStart, clippedEnd];
}

export function buildPrintMachineUtilization({
  runs = [],
  rangeStart,
  rangeEnd,
  asOf = new Date(),
  shifts,
  machines = [],
  machineId = ''
} = {}) {
  const windowStart = asMillis(rangeStart);
  const windowEnd = asMillis(rangeEnd);
  const asOfMs = asMillis(asOf) ?? Date.now();
  const shiftWindows = normalizePrintingShifts(shifts);
  const slotFilter = String(machineId || '').trim() ? machineSlot(machineId) : '';
  const normalized = (runs || [])
    .map((run) => normalizeRun(run, asOfMs))
    .filter((run) => run && (!slotFilter || run.slot === slotFilter));

  const bySlot = new Map();
  normalized.forEach((run) => {
    if (!bySlot.has(run.slot)) bySlot.set(run.slot, []);
    bySlot.get(run.slot).push(run);
  });

  const segments = [];
  const gaps = [];
  const countedRuns = new Set();
  let overlap = false;

  bySlot.forEach((slotRuns, slot) => {
    const ordered = [...slotRuns].sort((left, right) => left.start - right.start || left.orderId.localeCompare(right.orderId));
    ordered.forEach((run, index) => {
      if (index > 0 && run.start < ordered[index - 1].end) overlap = true;
      const visible = clip(run.start, run.end, windowStart, windowEnd);
      if (!visible) return;
      countedRuns.add(run.key);
      const label = machineLabel(slot, run.machineId, machines);
      const operator = [run.operatorName, run.endedOperatorName && run.endedOperatorName !== run.operatorName ? `ended by ${run.endedOperatorName}` : '']
        .filter(Boolean)
        .join(' · ');
      splitInterval(visible[0], visible[1], shiftWindows).forEach((part) => {
        segments.push({
          kind: 'run',
          runKey: run.key,
          machineId: run.machineId,
          machineLabel: label,
          orderId: run.orderId,
          jobName: run.jobName,
          operatorName: operator,
          shiftId: part.shift.id,
          shiftName: part.shift.name,
          start: new Date(part.start).toISOString(),
          end: new Date(part.end).toISOString(),
          durationMinutes: minutesBetween(part.start, part.end),
          open: run.open && part.end === visible[1] && visible[1] === Math.min(run.end, windowEnd)
        });
      });
    });

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const next = ordered[index];
      if (!(next.start > previous.end)) continue;
      const visible = clip(previous.end, next.start, windowStart, windowEnd);
      if (!visible) continue;
      const label = machineLabel(slot, next.machineId || previous.machineId, machines);
      const gap = {
        machineId: next.machineId || previous.machineId,
        machineLabel: label,
        afterJob: previous.jobName,
        afterOrderId: previous.orderId,
        beforeJob: next.jobName,
        beforeOrderId: next.orderId,
        operatorName: previous.operatorName,
        start: new Date(visible[0]).toISOString(),
        end: new Date(visible[1]).toISOString(),
        durationMinutes: minutesBetween(visible[0], visible[1])
      };
      gaps.push(gap);
      splitInterval(visible[0], visible[1], shiftWindows).forEach((part) => {
        segments.push({
          kind: 'idle',
          runKey: '',
          machineId: gap.machineId,
          machineLabel: label,
          orderId: next.orderId,
          jobName: `Idle after ${previous.jobName} (${previous.orderId}) before ${next.jobName} (${next.orderId})`,
          operatorName: previous.operatorName,
          shiftId: part.shift.id,
          shiftName: part.shift.name,
          start: new Date(part.start).toISOString(),
          end: new Date(part.end).toISOString(),
          durationMinutes: minutesBetween(part.start, part.end),
          open: false
        });
      });
    }
  });

  segments.sort((left, right) => left.start.localeCompare(right.start) || left.machineLabel.localeCompare(right.machineLabel) || left.kind.localeCompare(right.kind));

  const runMinutes = segments.filter((segment) => segment.kind === 'run').reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const idleMinutes = segments.filter((segment) => segment.kind === 'idle').reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const longestIdle = gaps.reduce((best, gap) => (gap.durationMinutes > (best?.durationMinutes || 0) ? gap : best), null);

  const machineMap = new Map();
  segments.forEach((segment) => {
    const key = segment.machineLabel;
    if (!machineMap.has(key)) {
      machineMap.set(key, {
        machineId: segment.machineId,
        machineLabel: segment.machineLabel,
        runMinutes: 0,
        idleMinutes: 0,
        runKeys: new Set()
      });
    }
    const row = machineMap.get(key);
    if (segment.kind === 'run') {
      row.runMinutes += segment.durationMinutes;
      if (segment.runKey) row.runKeys.add(segment.runKey);
    } else {
      row.idleMinutes += segment.durationMinutes;
    }
  });

  const shiftMap = new Map();
  segments.forEach((segment) => {
    if (!shiftMap.has(segment.shiftId)) {
      shiftMap.set(segment.shiftId, { shiftId: segment.shiftId, shiftName: segment.shiftName, runMinutes: 0, idleMinutes: 0 });
    }
    const row = shiftMap.get(segment.shiftId);
    if (segment.kind === 'run') row.runMinutes += segment.durationMinutes;
    else row.idleMinutes += segment.durationMinutes;
  });

  const withShare = (row) => {
    const total = row.runMinutes + row.idleMinutes;
    return {
      ...row,
      runPercent: percent(row.runMinutes, total),
      idlePercent: percent(row.idleMinutes, total)
    };
  };

  return {
    runMinutes,
    idleMinutes,
    runPercent: percent(runMinutes, runMinutes + idleMinutes),
    idlePercent: percent(idleMinutes, runMinutes + idleMinutes),
    runCount: countedRuns.size,
    gapCount: gaps.length,
    longestIdle,
    overlap,
    segments,
    gaps,
    machines: [...machineMap.values()].map((row) => withShare({
      machineId: row.machineId,
      machineLabel: row.machineLabel,
      runMinutes: row.runMinutes,
      idleMinutes: row.idleMinutes,
      runCount: row.runKeys.size
    })).sort((left, right) => left.machineLabel.localeCompare(right.machineLabel)),
    shifts: [...shiftMap.values()].map(withShare),
    durationLabel: formatDurationMinutes
  };
}
