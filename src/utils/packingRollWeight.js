import { isKgUnit, round2 } from './dispatchPacking.js';

/**
 * Weight written onto a packing-list roll when Add Roll/Box is clicked.
 *
 * The physical roll placed on the weighing scale indicator measures the
 * GROSS WEIGHT (actual physical weight on the weighing scale).
 *
 * Core / Packaging weight (tare) is entered manually.
 *
 * Formula:
 * Gross Weight - Core/Pkg Wt (entered manually) = Net Weight.
 *
 * When the scale is offline or the line is a count (pieces, boxes), the typed
 * field provides the weight/quantity.
 */
export function resolvePackingRollWeight({
  fieldGrossKg,
  fieldNetKg = 0,
  tareKg = 0,
  unit = 'Kg',
  scaleStatus = null
} = {}) {
  const tare = Number(tareKg);
  const safeTare = Number.isFinite(tare) && tare >= 0 ? round2(tare) : 0;
  const live = Number(scaleStatus?.grossWeight ?? scaleStatus?.currentWeight ?? scaleStatus?.netWeight);
  const useScale = Boolean(scaleStatus?.isConnected) && isKgUnit(unit) && Number.isFinite(live);

  if (isKgUnit(unit)) {
    const rawVal = useScale
      ? Math.max(0, live)
      : (() => {
          const raw = fieldGrossKg !== undefined ? fieldGrossKg : fieldNetKg;
          const num = Number(raw);
          return Number.isFinite(num) && num >= 0 ? num : 0;
        })();
    const grossKg = round2(rawVal);
    const netKg = round2(Math.max(0, grossKg - safeTare));
    return {
      netKg,
      tareKg: safeTare,
      grossKg,
      source: useScale ? 'scale' : 'manual'
    };
  }

  // Non-kg units (e.g. Pieces, Boxes, Bundles)
  const typed = Number(fieldNetKg !== undefined ? fieldNetKg : fieldGrossKg);
  const qty = Number.isFinite(typed) && typed >= 0 ? round2(typed) : 0;
  return {
    netKg: qty,
    tareKg: safeTare,
    grossKg: round2(qty + safeTare),
    source: 'manual'
  };
}
