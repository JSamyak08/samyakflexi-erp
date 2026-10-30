import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

test('OrderManagement and JobMasterDirectory link to Client Directory table', () => {
  const appContent = fs.readFileSync('src/App.jsx', 'utf-8');
  const orderMgmtContent = fs.readFileSync('src/components/OrderManagement.jsx', 'utf-8');
  const jobMasterContent = fs.readFileSync('src/components/JobMasterDirectory.jsx', 'utf-8');

  // 1. App.jsx must pass clients={clients} to OrderManagement
  assert.ok(
    appContent.includes('<OrderManagement \n            urlParams={urlParams}\n            orders={orders} \n            clients={clients}'),
    'App.jsx must pass clients={clients} to OrderManagement component'
  );

  // 2. OrderManagement.jsx must accept clients prop
  assert.ok(
    orderMgmtContent.includes('clients = [],'),
    'OrderManagement must declare clients in its prop list'
  );

  // 3. OrderManagement.jsx must populate editClientNameOptions from internalClients (Client Directory)
  assert.ok(
    orderMgmtContent.includes('(internalClients || []).forEach(c => {'),
    'OrderManagement editClientNameOptions must map through Client Directory items'
  );

  // 4. OrderManagement.jsx must show GSTIN or subtitle in client options
  assert.ok(
    orderMgmtContent.includes('c?.gstin ? `GSTIN: ${c.gstin}`'),
    'OrderManagement editClientNameOptions should display client GSTIN'
  );

  // 5. JobMasterDirectory.jsx must also link allClientOptions to clients prop and cached clients
  assert.ok(
    jobMasterContent.includes('clientSource.forEach(c => {'),
    'JobMasterDirectory must iterate clientSource'
  );
});

