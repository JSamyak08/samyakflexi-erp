import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url);

const MAIL_CALL = /\/api\/send-email|sendERPEmailNotification|notifyQcOverdueDigest|runQcOverdueEscalationDigest|sendQcOverdueAlert|notifyGRN|notifyOrder|notifyProduction|notifyPurchase|notifyLowStock|notifyUserCreated|notifyOverWastage/;

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, ROOT), 'utf8');
}

function walkSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSources(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function effectBodies(source) {
  const bodies = [];
  const needle = 'useEffect(';
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start < 0) break;
    const paren = source.indexOf('(', start);
    const arrow = source.indexOf('=>', paren);
    if (arrow < 0 || arrow - paren > 120) {
      from = start + needle.length;
      continue;
    }
    let brace = arrow;
    while (brace < source.length && source[brace] !== '{') brace += 1;
    if (brace >= source.length) break;
    let depth = 0;
    let i = brace;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    bodies.push(source.slice(brace, i));
    from = i;
  }
  return bodies;
}

const overdueGrn = {
  id: 'grn-overdue',
  grnNo: 'GRN-OVERDUE',
  status: 'Pending QC Approval',
  receivedDate: '2026-10-01T00:00:00.000Z',
  vendorName: 'Film Vendor',
  itemName: 'PET 12',
  netWeightKg: 40,
  escalated_at: '2026-10-02T00:00:00.000Z',
};

test('no page effect sends mail just because it loaded', () => {
  const root = path.join(fileURLToPath(ROOT), 'src');
  const files = walkSources(root);
  assert.ok(files.some((file) => file.endsWith('InventoryManagement.jsx')));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(path.join(fileURLToPath(ROOT)), file);
    for (const body of effectBodies(source)) {
      if (body.includes('publishPrintingDeadlineDigest')) {
        assert.match(body, /sendEmail:\s*false/, `${relative} would email a deadline summary from an effect`);
      }
      assert.doesNotMatch(body, MAIL_CALL, `${relative} sends mail from an effect`);
    }
  }
  const app = read('src/App.jsx');
  const loadStart = app.indexOf('if (Array.isArray(supaGRNs))');
  const loadEnd = app.indexOf('if (Array.isArray(supaProd))', loadStart);
  const load = app.slice(loadStart, loadEnd);
  assert.doesNotMatch(load, /send-email|notifyQc|runQcOverdue|sendQcOverdue/);
  assert.equal(read('src/CylinderJobCardForm.jsx').includes('savedLocal'), false);
  assert.equal(read('src/utils/cylinderJobCardDraft.js').includes('savedLocal'), false);
});

test('rendering the inventory page shows the overdue alert and does not call the mail API', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const digest = await server.ssrLoadModule('/src/services/qcEscalationDigest.js');
    const loaded = await digest.runQcOverdueEscalationDigest({
      grns: [overdueGrn],
      users: [
        { email: 'orders@vendor.com', role: 'Vendor', status: 'Active' },
        { email: 'buyer@client.com', role: 'Customer', status: 'Active' },
      ],
    });
    assert.equal(loaded.sent, false);
    assert.equal(loaded.skipped, 'not-sent-on-load');

    const now = Date.parse('2026-11-03T12:00:00.000Z');
    const seen = [];
    const sent = await digest.sendQcOverdueAlert({
      grns: [
        overdueGrn,
        {
          id: 'grn-fresh',
          grnNo: 'GRN-FRESH',
          status: 'Pending QC',
          receivedDate: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'grn-ok',
          grnNo: 'GRN-OK',
          status: 'Approved',
          receivedDate: '2026-10-01T00:00:00.000Z',
        },
      ],
      users: [{ email: 'orders@vendor.com', role: 'Vendor', status: 'Active' }],
      now,
      notify: async (payload) => {
        seen.push(payload);
        return { success: true, message: 'queued for the button' };
      },
    });
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].grns.map((grn) => grn.grnNo), ['GRN-OVERDUE']);
    assert.equal(sent.sent, true);
    assert.equal(calls.some((url) => url.includes('/api/send-email')), false);

    const mod = await server.ssrLoadModule('/src/components/InventoryManagement.jsx');
    const InventoryManagement = mod.default;
    const html = renderToStaticMarkup(React.createElement(InventoryManagement, {
      inventory: [{
        id: 'INV-1',
        itemName: 'PET Film',
        category: 'Film Substrates',
        filmType: 'PET',
        micron: 12,
        widthMm: 520,
        availableQtyKg: 25,
        unit: 'Kg',
        barcodeId: 8901234567890,
      }],
      inventoryRolls: [{
        barcodeId: 8901234567890,
        id: 11,
        itemId: 'INV-1',
        itemName: 'PET Film',
        netWeightKg: 25,
        availableWeightKg: 25,
        status: 'In Stock',
      }],
      grns: [{
        ...overdueGrn,
        category: 'Film Substrates',
        itemsBreakdown: [{ barcodeId: 8901234567890, id: 11 }],
      }],
      dispatchShipments: [{
        id: 'DC-1',
        items: [{ barcodeId: 555000111, id: 9, jobName: 'Pouch' }],
      }],
      users: [
        { email: 'orders@vendor.com', role: 'Vendor', status: 'Active' },
        { email: 'buyer@client.com', role: 'Customer', status: 'Active' },
        { email: 'qa@samyakinternational.in', role: 'QC Chemist', status: 'Active' },
      ],
    }));
    assert.match(html, /data-testid="qc-overdue-alert"/);
    assert.match(html, /data-testid="send-qc-overdue-email"/);
    assert.match(html, /Email QC overdue alert/);
    assert.match(html, /GRN-OVERDUE/);
    assert.match(html, /does not send email/);
    assert.equal(calls.some((url) => url.includes('/api/send-email')), false);

    const formMod = await server.ssrLoadModule('/src/CylinderJobCardForm.jsx');
    const card = renderToStaticMarkup(React.createElement(formMod.default, {
      initialData: {
        id: 'CYL-1',
        sku: 'SKU-1',
        jobName: 'Tea pouch',
        barcodeId: 8901234567890,
      },
      jobMasters: [],
      cylinders: [],
      currentUser: { role: 'Admin', name: 'Plant Admin' },
    }));
    assert.equal(card.includes('savedLocal'), false);
    assert.doesNotMatch(card, /savedLocal is not defined/);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
