import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateOrderStockReservations,
  presentRequirementStock,
} from '../src/factoryStore.js';
import { buildOrderReportRows } from '../src/utils/orderCsvReport.js';
import {
  DEFAULT_STOCK_RESERVATION_ENABLED,
  STOCK_RESERVATION_SETTING,
  normalizeStockReservationEnabled,
} from '../src/utils/stockReservation.js';

function line(id, filmType, micron, widthMm, qtyKg) {
  return { id, filmType, micron, widthMm, qtyKg, poIssued: false };
}

function order(id, date, lines) {
  return {
    id,
    status: 'In Progress',
    targetDeliveryDate: date,
    materialRequirements: lines,
  };
}

const inventory = [
  { id: 'INV-PET', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 100 },
];

const earlier = order('ORD-A', '2026-11-01', [line('REQ-1', 'PET', 12, 710, 80)]);
const later = order('ORD-B', '2026-11-08', [line('REQ-1', 'PET', 12, 710, 80)]);

test('stock reservation defaults off and only an explicit on value enables it', () => {
  assert.equal(DEFAULT_STOCK_RESERVATION_ENABLED, false);
  assert.equal(normalizeStockReservationEnabled(undefined), false);
  assert.equal(normalizeStockReservationEnabled(null), false);
  assert.equal(normalizeStockReservationEnabled(''), false);
  assert.equal(normalizeStockReservationEnabled(false), false);
  assert.equal(normalizeStockReservationEnabled('false'), false);
  assert.equal(normalizeStockReservationEnabled('off'), false);
  assert.equal(normalizeStockReservationEnabled('no'), false);
  assert.equal(normalizeStockReservationEnabled(true), true);
  assert.equal(normalizeStockReservationEnabled('true'), true);
  assert.equal(normalizeStockReservationEnabled('ON'), true);
  assert.equal(normalizeStockReservationEnabled(1), true);
});

test('when reservation is off, both orders see the full on-hand pile and nothing is reserved', () => {
  const stock = calculateOrderStockReservations([later, earlier], inventory, []);
  assert.equal(stock.reservationsActive, false);
  const first = presentRequirementStock(earlier.materialRequirements[0], stock.getReqStockInfo(earlier.materialRequirements[0], earlier.id));
  const second = presentRequirementStock(later.materialRequirements[0], stock.getReqStockInfo(later.materialRequirements[0], later.id));
  const pool = stock.pool['INV-PET'];

  assert.equal(pool.totalStockKg, 100);
  assert.equal(pool.remainingStockKg, 100);
  assert.equal(pool.totalReservedKg, 0);
  assert.deepEqual(pool.reservations, []);
  assert.equal(first.reservedKg, 80);
  assert.equal(first.balanceKg, 0);
  assert.equal(first.isFullyAvailable, true);
  assert.equal(second.reservedKg, 80);
  assert.equal(second.balanceKg, 0);
  assert.equal(second.isFullyAvailable, true);
  assert.equal(second.totalInStock, 100);
});

test('when reservation is on, an earlier order keeps the stock and the later order sees the remainder', () => {
  const stock = calculateOrderStockReservations([later, earlier], inventory, [], { enabled: true });
  assert.equal(stock.reservationsActive, true);
  const first = stock.getReqStockInfo(earlier.materialRequirements[0], earlier.id);
  const second = stock.getReqStockInfo(later.materialRequirements[0], later.id);
  const pool = stock.pool['INV-PET'];

  assert.equal(first.reservedKg, 80);
  assert.equal(first.balanceKg, 0);
  assert.equal(second.reservedKg, 20);
  assert.equal(second.balanceKg, 60);
  assert.equal(pool.totalReservedKg, 100);
  assert.equal(pool.remainingStockKg, 0);
  assert.equal(pool.reservations.length, 2);
  assert.equal(pool.reservations[0].orderId, 'ORD-A');
  assert.equal(pool.reservations[1].orderId, 'ORD-B');
});

test('a partial on-hand pile still leaves a purchase balance without reserving it', () => {
  const short = order('ORD-C', '2026-11-01', [line('REQ-1', 'PET', 12, 710, 150)]);
  const stock = calculateOrderStockReservations([short], inventory, []);
  const info = presentRequirementStock(short.materialRequirements[0], stock.getReqStockInfo(short.materialRequirements[0], short.id));
  assert.equal(info.reservedKg, 100);
  assert.equal(info.balanceKg, 50);
  assert.equal(info.isPartiallyAvailable, true);
  assert.equal(stock.pool['INV-PET'].totalReservedKg, 0);
  assert.deepEqual(stock.pool['INV-PET'].reservations, []);
});

test('the order report ignores an earlier reservation when the setting is off', () => {
  const today = new Date('2026-11-20T06:00:00.000Z');
  const pet = (id, qtyKg) => ({ id, filmType: 'PET', micron: 12, widthMm: 710, qtyKg, poIssued: false });
  const rows = buildOrderReportRows({
    kind: 'pending',
    today,
    orders: [
      {
        id: 'ORD-EARLY',
        status: 'In Progress',
        clientName: 'Early',
        jobName: 'Early job',
        orderQtyKg: 100,
        targetDeliveryDate: '2026-12-01',
        deliveryDate: '2026-12-01',
        materialRequirements: [pet('REQ-E', 80)],
      },
      {
        id: 'ORD-LATE',
        status: 'In Progress',
        clientName: 'Later',
        jobName: 'Later job',
        orderQtyKg: 100,
        targetDeliveryDate: '2026-12-05',
        deliveryDate: '2026-12-05',
        materialRequirements: [pet('REQ-L', 80)],
      },
    ],
    inventory: [{ id: 'INV-PET', filmType: 'PET', micron: 12, widthMm: 710, availableQtyKg: 100, status: 'In Stock', isActive: true }],
    stockReservationEnabled: false,
  });
  const late = rows.find((row) => row['Order No'] === 'ORD-LATE');
  assert.ok(late);
  assert.equal(late['RM Shortfall Kg'], 0);
  assert.equal(late['RM Status'], 'In Stock');
});

test('stock reservation migration seeds off and only an Admin may change the key', () => {
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261128120000_stock_reservation_for_orders.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, new RegExp(STOCK_RESERVATION_SETTING));
  assert.match(sql, /'false'/);
  assert.match(sql, /Only an Admin can edit stock reservation for orders/);
  assert.match(sql, /ON CONFLICT \(setting_key\) DO NOTHING/);
  assert.match(sql, /CREATE TRIGGER system_settings_guard_stock_reservation_for_orders/);
  assert.doesNotMatch(sql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP VIEW|DROP FUNCTION|DROP POLICY/i);
});
