/**
 * Consume-stage to Plant Machinery Directory mapping.
 *
 * Each machine stores one process as `type` (Machine Category / Type) in
 * System Settings > Plant Machinery Directory:
 *   Rotogravure, Flexographic, Lamination, Slitting, Pouching, Extrusion.
 * There is no Dispatch category and no primary/default flag. A blank status
 * is treated as Active, matching the directory table. Maintenance and
 * Inactive machines are left out.
 *
 * Stage text is lower-cased and punctuation is collapsed to spaces.
 * The first matching row below wins:
 *   lamination / laminator                         -> Lamination
 *   slitting / slitter                             -> Slitting
 *   pouch / bag making / center seal               -> Pouching
 *   dispatch                                       -> Dispatch (none in the directory today)
 *   extrusion / blown film                         -> Extrusion
 *   flexo                                          -> Flexographic
 *   rotogravure / gravure                          -> Rotogravure
 *   printing                                       -> Rotogravure and Flexographic
 * QC, custom, and any other stage match nothing.
 *
 * When several active machines match, a machine with isPrimary, isDefault,
 * primary, is_primary, or defaultMachine is preferred. Otherwise the first
 * name in case-insensitive order is selected.
 */

export const NO_MACHINE_FOR_PROCESS_HINT = 'No machine mapped to this process in Plant Machinery Directory';

const PROCESS_RULES = [
  { pattern: /lamination|laminator/, types: ['Lamination'] },
  { pattern: /slitting|slitter/, types: ['Slitting'] },
  { pattern: /pouch|bag making|center seal/, types: ['Pouching'] },
  { pattern: /dispatch/, types: ['Dispatch'] },
  { pattern: /extrusion|blown film/, types: ['Extrusion'] },
  { pattern: /flexo/, types: ['Flexographic'] },
  { pattern: /rotogravure|gravure/, types: ['Rotogravure'] },
  { pattern: /printing/, types: ['Rotogravure', 'Flexographic'] }
];

export function normalizeProcessLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function directoryTypesForProcess(processName) {
  const label = normalizeProcessLabel(processName);
  if (!label) return [];
  const rule = PROCESS_RULES.find((item) => item.pattern.test(label));
  return rule ? [...rule.types] : [];
}

export function machineTypeKey(type) {
  const label = normalizeProcessLabel(type);
  if (!label) return '';
  if (label.includes('flexo')) return 'Flexographic';
  if (label.includes('rotogravure') || label.includes('gravure')) return 'Rotogravure';
  if (label.includes('laminat')) return 'Lamination';
  if (label.includes('slit')) return 'Slitting';
  if (label.includes('pouch')) return 'Pouching';
  if (label.includes('extrud') || label.includes('blown')) return 'Extrusion';
  if (label.includes('dispatch')) return 'Dispatch';
  return '';
}

export function isActiveMachine(machine) {
  const status = normalizeProcessLabel(machine?.status || 'active');
  return status === 'active';
}

export function isPrimaryMachine(machine) {
  return Boolean(
    machine?.isPrimary
    || machine?.isDefault
    || machine?.primary
    || machine?.is_primary
    || machine?.defaultMachine
  );
}

export function machinesForProcess(machines, processName) {
  const types = new Set(directoryTypesForProcess(processName));
  return (machines || [])
    .filter((machine) => machine && isActiveMachine(machine) && types.has(machineTypeKey(machine.type)))
    .sort((a, b) => {
      const primary = Number(isPrimaryMachine(b)) - Number(isPrimaryMachine(a));
      if (primary) return primary;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
}

export function defaultMachineForProcess(machines, processName) {
  return machinesForProcess(machines, processName)[0] || null;
}
