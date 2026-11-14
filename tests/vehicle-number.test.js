import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VEHICLE_NUMBER_REQUIRED_MESSAGE,
  trimmedVehicleNumber,
  vehicleNumberError,
} from '../src/utils/vehicleNumber.js';

test('a vehicle number is the trimmed text', () => {
  assert.equal(trimmedVehicleNumber('  MP-09-AB-1234  '), 'MP-09-AB-1234');
  assert.equal(trimmedVehicleNumber('MH12 AB 1234'), 'MH12 AB 1234');
  assert.equal(trimmedVehicleNumber(null), '');
  assert.equal(trimmedVehicleNumber(undefined), '');
});

test('blank and whitespace-only vehicle numbers are rejected', () => {
  for (const value of ['', '   ', '\t\n', null, undefined]) {
    assert.equal(vehicleNumberError(value), VEHICLE_NUMBER_REQUIRED_MESSAGE);
  }
  assert.equal(vehicleNumberError('  MP09CC1001 '), '');
});
