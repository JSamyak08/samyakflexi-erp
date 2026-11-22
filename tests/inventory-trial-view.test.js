import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let viteServer;

test.before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true }
  });
});

test.after(async () => {
  if (viteServer) {
    await viteServer.close();
  }
});

function createSampleInventory() {
  return [
    {
      id: 'INVT-0101',
      primaryId: 'INVT-0101',
      itemCode: 'PET-12-700',
      itemName: 'PET Film 12µ 700mm',
      category: 'Film Substrates',
      filmType: 'PET',
      micron: 12,
      widthMm: 700,
      availableQtyKg: 450.5,
      allocatedQtyKg: 50.0,
      reorderLevelKg: 100,
      unit: 'kg',
      unitPrice: 185.0,
      location: 'Bay 1',
      lastVendor: 'Polyplex Ltd',
      lastBatch: 'BAT-9901'
    },
    {
      id: 'INVT-0102',
      primaryId: 'INVT-0102',
      itemCode: 'INK-CYAN',
      itemName: 'Gravure Cyan Ink',
      category: 'Printing Inks',
      filmType: 'Printing Inks',
      subType: 'Cyan Shade',
      availableQtyKg: 30.0,
      allocatedQtyKg: 0,
      reorderLevelKg: 50, // Low stock!
      unit: 'kg',
      unitPrice: 320.0,
      location: 'Ink Room',
      lastVendor: 'DIC India',
      lastBatch: 'INK-4402'
    }
  ];
}

test('InventoryTrialView renders same rows, totals, and values as data model', async () => {
  const mod = await viteServer.ssrLoadModule('/src/components/trial/InventoryTrialView.jsx');
  const InventoryTrialView = mod.default;

  const items = createSampleInventory();
  const html = renderToStaticMarkup(
    React.createElement(InventoryTrialView, {
      paginatedItems: items,
      totalItems: items.length,
      currentPage: 1,
      pageSize: 50,
      selectedStockIds: new Set(),
      toggleStockSelection: () => {},
      stockItemIds: (i) => [i.id],
      onInward: () => {},
      onOpenHistory: () => {},
      onEdit: () => {},
      onDelete: () => {},
      formatFilmItemName: (f, w, m, name) => `${f} ${m}µ x ${w}mm`,
      displayItemName: (n) => n,
      isInventoryItemActive: () => true,
      fifosForItemIds: () => [],
      openBarcodeIsOverAged: () => false,
      ageingSettings: {},
      rollFifoIndex: new Map(),
      inventoryRolls: [],
      pendingQcKgForItem: () => 0,
      safeGrns: [],
      getItemReservations: () => ({ totalReservedKg: 0 }),
      onToggleClassic: () => {}
    })
  );

  // Assert both items appear in the output
  assert.ok(html.includes('INVT-0101'), 'Includes first item ID');
  assert.ok(html.includes('INVT-0102'), 'Includes second item ID');
  assert.ok(html.includes('PET-12-700'), 'Includes item code');
  assert.ok(html.includes('450.5'), 'Includes available quantity');
  assert.ok(html.includes('IN STOCK'), 'Includes IN STOCK badge for healthy inventory');
  assert.ok(html.includes('LOW STOCK'), 'Includes LOW STOCK badge for below-reorder item');
});

test('InventoryTrialView mobile cards have action buttons with touch target class', async () => {
  const mod = await viteServer.ssrLoadModule('/src/components/trial/InventoryTrialView.jsx');
  const InventoryTrialView = mod.default;

  const items = createSampleInventory();
  const html = renderToStaticMarkup(
    React.createElement(InventoryTrialView, {
      paginatedItems: items,
      totalItems: items.length,
      currentPage: 1,
      pageSize: 50,
      selectedStockIds: new Set(),
      toggleStockSelection: () => {},
      stockItemIds: (i) => [i.id],
      onInward: () => {},
      onOpenHistory: () => {},
      onEdit: () => {},
      onDelete: () => {}
    })
  );

  // Assert mobile cards container and action buttons are rendered
  assert.ok(html.includes('ui-next-mobile-cards'), 'Contains mobile cards container');
  assert.ok(html.includes('ui-next-mobile-btn'), 'Action buttons have min-44px touch target class');
  assert.ok(html.includes('Ledger (FIFO)'), 'Action button includes Ledger (FIFO)');
});

test('ItemLedgerFifoTrialView displays oldest barcode with FIFO consume first mark', async () => {
  const mod = await viteServer.ssrLoadModule('/src/components/trial/ItemLedgerTrialTables.jsx');
  const ItemLedgerFifoTrialView = mod.ItemLedgerFifoTrialView;

  const dateOld = new Date('2026-10-01T00:00:00.000Z');
  const dateNew = new Date('2026-10-25T00:00:00.000Z');

  const inStockBarcodeFifos = [
    {
      roll: { barcode: 'BC-PET-001', netWeightKg: 100 },
      fifo: { balanceQty: 100, origin: dateOld, display: { ageDays: 45, frozen: false } }
    },
    {
      roll: { barcode: 'BC-PET-002', netWeightKg: 120 },
      fifo: { balanceQty: 120, origin: dateNew, display: { ageDays: 20, frozen: false } }
    }
  ];

  const html = renderToStaticMarkup(
    React.createElement(ItemLedgerFifoTrialView, {
      inStockBarcodeFifos,
      unitStr: 'Kg',
      ageingSettings: {}
    })
  );

  // Assert FIFO elements and testids
  assert.ok(html.includes('data-testid="ledger-barcode-fifo"'), 'Has ledger-barcode-fifo testid');
  assert.ok(html.includes('data-testid="barcode-fifo-line"'), 'Has barcode-fifo-line testid');
  assert.ok(html.includes('data-testid="barcode-fifo-age"'), 'Has barcode-fifo-age testid');
  assert.ok(html.includes('data-testid="fifo-consume-first"'), 'Has fifo-consume-first testid');
  assert.ok(html.includes('BC-PET-001'), 'Includes older barcode');
  assert.ok(html.includes('BC-PET-002'), 'Includes newer barcode');
});

test('DashboardTrialView renders Tremor KPI cards and charts without errors', async () => {
  const mod = await viteServer.ssrLoadModule('/src/components/trial/DashboardTrialView.jsx');
  const DashboardTrialView = mod.default;

  const orders = [
    { id: 'ORD-001', jobName: 'Biscuits Pouch', orderQtyKg: 500, status: 'In Production', targetDeliveryDate: '2026-11-30' },
    { id: 'ORD-002', jobName: 'Tea Pouch', orderQtyKg: 300, status: 'Confirmed', targetDeliveryDate: '2026-12-15' }
  ];
  const inventory = createSampleInventory();

  const html = renderToStaticMarkup(
    React.createElement(DashboardTrialView, {
      orders,
      delayedOrders: [],
      delayedOrdersCount: 0,
      inventory,
      inks: [],
      avgSolidEqInkCost: 245.5,
      vendors: [{ id: 'V1', name: 'Vendor 1' }],
      clients: [{ id: 'C1', name: 'Client 1' }],
      scrapMetrics: { formattedAvg: '2.4%', subText: '0.2% lower MoM', momDirection: 'down' },
      currentUser: { role: 'Admin' },
      onNavigateTab: () => {},
      onToggleClassic: () => {}
    })
  );

  // Assert Tremor KPI cards
  assert.ok(html.includes('tremor-kpi-card'), 'Contains Tremor KPI cards');
  assert.ok(html.includes('Active Orders'), 'Renders Active Orders card');
  assert.ok(html.includes('Available Film Stock'), 'Renders Available Film Stock card');
  assert.ok(html.includes('Total Stock Purchase Valuation'), 'Renders Valuation for Admin');
  assert.ok(html.includes('Tremor &amp; HeroUI Trial') || html.includes('Tremor & HeroUI Trial'), 'Includes trial banner');
});
