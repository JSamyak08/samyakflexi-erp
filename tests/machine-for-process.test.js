import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_MACHINE_FOR_PROCESS_HINT,
  defaultMachineForProcess,
  directoryTypesForProcess,
  machinesForProcess
} from '../src/utils/machineForProcess.js';

const machines = [
  { id: 'press', name: 'Expert 1000 Rotogravure Press', type: 'Rotogravure', status: 'Active' },
  { id: 'lam-b', name: 'Nordmeccanica Super Simplex', type: 'Lamination', status: 'Active' },
  { id: 'lam-a', name: 'Nordmeccanica Duplex', type: 'Lamination', status: 'Active' },
  { id: 'lam-down', name: 'Old Laminator', type: 'Lamination', status: 'Maintenance' },
  { id: 'slit', name: 'Titan Slitter', type: 'Slitting', status: 'Active' },
  { id: 'pouch', name: 'Mamta Pouch Line', type: 'Pouching', status: 'Inactive' },
  { id: 'flexo', name: 'Bobst Flexo', type: 'Flexographic Printing Press', status: 'Active', isPrimary: true },
  { id: 'spare-press', name: 'Alpha Gravure', type: 'Rotogravure', status: 'Active' }
];

test('stage names map onto directory machine types', () => {
  assert.deepEqual(directoryTypesForProcess('Lamination (Pass 1)'), ['Lamination']);
  assert.deepEqual(directoryTypesForProcess('  lamination   (pass 2) '), ['Lamination']);
  assert.deepEqual(directoryTypesForProcess('Slitting & Rewinding'), ['Slitting']);
  assert.deepEqual(directoryTypesForProcess('Pouching / Bag Making'), ['Pouching']);
  assert.deepEqual(directoryTypesForProcess('Dispatch Packing'), ['Dispatch']);
  assert.deepEqual(directoryTypesForProcess('Printing (Pass 2)'), ['Rotogravure', 'Flexographic']);
  assert.deepEqual(directoryTypesForProcess('QC Inspection & Rewinding'), []);
  assert.deepEqual(directoryTypesForProcess('QC Hold Store'), []);
  assert.deepEqual(directoryTypesForProcess('Custom Stage'), []);
});

test('the dropdown keeps active machines for the process and prefers a primary, else the first name', () => {
  const laminators = machinesForProcess(machines, 'Lamination (Pass 1)');
  assert.deepEqual(laminators.map((machine) => machine.name), [
    'Nordmeccanica Duplex',
    'Nordmeccanica Super Simplex'
  ]);
  assert.equal(defaultMachineForProcess(machines, 'Lamination (Pass 2)').name, 'Nordmeccanica Duplex');

  assert.equal(defaultMachineForProcess(machines, 'Slitting & Rewinding').name, 'Titan Slitter');
  assert.equal(machinesForProcess(machines, 'Pouching / Bag Making').length, 0);
  assert.equal(defaultMachineForProcess(machines, 'Dispatch Packing'), null);
  assert.equal(
    defaultMachineForProcess([{ name: 'Unmarked Laminator', type: 'Lamination' }], 'Lamination (Pass 1)').name,
    'Unmarked Laminator'
  );
  assert.match(NO_MACHINE_FOR_PROCESS_HINT, /Plant Machinery Directory/);

  const presses = machinesForProcess(machines, 'Printing (Pass 2)');
  assert.equal(presses[0].name, 'Bobst Flexo');
  assert.deepEqual(presses.map((machine) => machine.name), [
    'Bobst Flexo',
    'Alpha Gravure',
    'Expert 1000 Rotogravure Press'
  ]);
});
