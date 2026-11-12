import { isKgUnit, round2 } from './dispatchPacking.js';

/**
 * Weight written onto a packing-list roll when Add Roll/Box is clicked.
 *
 * A connected scale is the net weight for kilogram lines, including a true
 * zero. The Net Qty field is only the fallback when the scale is offline, or
 * when the line is a count (pieces, boxes) rather than kilograms. Gross is
 * that net plus the core / package tare typed on the form.
 */
export function resolvePackingRollWeight({
  fieldNetKg = 0,
  tareKg = 0,
  unit = 'Kg',
  scaleStatus = null
} = {}) {
  const tare = Number(tareKg);
  const safeTare = Number.isFinite(tare) && tare >= 0 ? round2(tare) : 0;
  const live = Number(scaleStatus?.netWeight);
  const useScale = Boolean(scaleStatus?.isConnected) && isKgUnit(unit) && Number.isFinite(live);
  const typed = Number(fieldNetKg);
  const rawNet = useScale
    ? Math.max(0, live)
    : (Number.isFinite(typed) && typed >= 0 ? typed : 0);
  const netKg = round2(rawNet);
  return {
    netKg,
    tareKg: safeTare,
    grossKg: round2(netKg + safeTare),
    source: useScale ? 'scale' : 'manual'
  };
}
