/**
 * A packing list or delivery challan save needs a vehicle number with
 * something other than spaces. Viewing, printing, and writes that are not
 * that save — an old row, a consumption draft, cancel, return inward, or a
 * weight update of a linked challan — are left alone.
 *
 * The check stays in the form. A database trigger on every challan or
 * shipment write would also reject those other updates when the stored
 * number is still blank.
 */

export const VEHICLE_NUMBER_REQUIRED_MESSAGE = 'Vehicle Number is required.';

export function trimmedVehicleNumber(value) {
  return String(value ?? '').trim();
}

export function vehicleNumberError(value) {
  return trimmedVehicleNumber(value) ? '' : VEHICLE_NUMBER_REQUIRED_MESSAGE;
}
