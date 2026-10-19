/**
 * Number & Decimal Formatting Utility for Samyak Flexi-ERP
 * Ensures all decimal numbers across the platform are formatted to UP TO 2 digits after the decimal.
 */

/**
 * Rounds any number or numeric string to at most 2 decimal places.
 * Safely eliminates IEEE 754 floating point precision glitches (e.g. 1928.8199999999974 -> 1928.82).
 * 
 * @param {number|string} val 
 * @returns {number}
 */
export function roundToTwo(val) {
  if (val === null || val === undefined || isNaN(Number(val))) return 0;
  const num = Number(val);
  return Number(Math.round(Number(num + 'e+2')) + 'e-2');
}

/**
 * Formats a number with Indian numbering system and UP TO 2 decimal places.
 * Example:
 *  1928.8199999999974 -> "1,928.82"
 *  1928.8 -> "1,928.8" (or with exact up to 2)
 *  1928 -> "1,928"
 * 
 * @param {number|string} val 
 * @param {number} [maxDecimals=2]
 * @returns {string}
 */
export function formatUpToTwoDecimals(val, maxDecimals = 2) {
  if (val === null || val === undefined || val === '') return '0';
  const num = Number(val);
  if (isNaN(num)) return '0';
  
  // Clean floating point artifacts first
  const clean = roundToTwo(num);
  return clean.toLocaleString('en-IN', {
    maximumFractionDigits: maxDecimals
  });
}

/**
 * Formats a currency amount with ₹ symbol and up to 2 decimals.
 * 
 * @param {number|string} val 
 * @param {boolean} [exactTwo=true] - If true, guarantees .00
 * @returns {string}
 */
export function formatCurrency(val, exactTwo = true) {
  if (val === null || val === undefined || val === '') return '₹ 0';
  const num = Number(val);
  if (isNaN(num)) return '₹ 0';
  const clean = roundToTwo(num);
  return `₹ ${clean.toLocaleString('en-IN', {
    minimumFractionDigits: exactTwo ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Formats weights or quantities (in kg or pcs) to up to 2 decimals.
 * 
 * @param {number|string} val 
 * @returns {string}
 */
export function formatQty(val) {
  return formatUpToTwoDecimals(val, 2);
}
