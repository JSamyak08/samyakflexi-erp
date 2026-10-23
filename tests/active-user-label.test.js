import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  activeUserLabel,
  mapDirectoryUser,
  optionLabelFromChildren,
  readUsername,
} from '../src/utils/activeUserLabel.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const STORE_ID = '22222222-2222-4222-8222-222222222222';

test('directory rows keep username separate from the id used to toggle', () => {
  const mapped = mapDirectoryUser({
    id: ADMIN_ID,
    username: 'plant.admin',
    full_name: 'Plant Admin',
    email: 'admin@samyakinternational.in',
    role: 'Admin',
    department: 'Executive Management',
    active: true,
    status: 'Active',
  });

  assert.equal(mapped.id, ADMIN_ID);
  assert.equal(mapped.username, 'plant.admin');
  assert.equal(mapped.name, 'Plant Admin');
  assert.equal(activeUserLabel(mapped), 'plant.admin');
});

test('username falls back to the id only when the field is blank', () => {
  assert.equal(readUsername({ username: '  ' }), '');
  assert.equal(readUsername({ username: null }), '');
  assert.equal(readUsername({}), '');
  assert.equal(activeUserLabel({ id: STORE_ID, username: '   ' }), STORE_ID);
  assert.equal(activeUserLabel({ id: STORE_ID }), STORE_ID);
  assert.equal(activeUserLabel({ id: STORE_ID, username: 'store.lead' }), 'store.lead');

  const mapped = mapDirectoryUser({
    id: STORE_ID,
    username: null,
    full_name: 'Store Lead',
    email: 'store@samyakinternational.in',
    role: 'Store Manager',
  });
  assert.equal(mapped.username, '');
  assert.equal(activeUserLabel(mapped), STORE_ID);
  assert.equal(mapped.name, 'Store Lead');
});

test('multi-node option children stay the visible label instead of the value', () => {
  const children = ['\n                  ', 'plant.admin', ' (', 'Admin', ')\n                '];
  assert.equal(optionLabelFromChildren(children, ADMIN_ID), 'plant.admin (Admin)');
  assert.equal(optionLabelFromChildren('store.lead', STORE_ID), 'store.lead');
  assert.equal(optionLabelFromChildren(['\n', '  ', '\n'], STORE_ID), STORE_ID);
  assert.equal(optionLabelFromChildren(null, STORE_ID), STORE_ID);
});

test('user queries and the header toggle expose username while staying keyed by id', () => {
  const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const usersQuery = read('src/services/supabaseDataService.js');
  const auth = read('src/services/authService.js');
  const admin = read('api/admin-users.js');
  const header = read('src/App.jsx');

  assert.match(usersQuery, /select\('id, username, full_name/);
  assert.match(usersQuery, /\.map\(mapDirectoryUser\)/);
  assert.match(auth, /id, username, full_name, email, role/);
  assert.match(admin, /id, username, full_name, email, role/);
  assert.match(admin, /username: readUsername\(row\)/);
  assert.match(header, /value: String\(u\.id\)/);
  assert.match(header, /label: activeUserLabel\(u\)/);
  assert.match(header, /const selectedId = e\.target\.value/);
  assert.match(header, /activeUsersList\.find\(u => String\(u\.id\) === String\(selectedId\)\)/);
});

test('header select renders usernames and keeps the selected value as the id', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const mod = await server.ssrLoadModule('/src/components/SearchableSelect.jsx');
    const SearchableSelect = mod.default;
    const options = [
      { value: ADMIN_ID, label: 'plant.admin' },
      { value: STORE_ID, label: activeUserLabel({ id: STORE_ID, username: '' }) },
    ];
    const html = renderToStaticMarkup(
      React.createElement(SearchableSelect, { value: ADMIN_ID, options }),
    );
    const valueText = html.match(/searchable-select-value[\s\S]*?>([^<]*)</);
    assert.ok(valueText, html);
    assert.equal(valueText[1], 'plant.admin');
    assert.match(html, new RegExp(`value="${ADMIN_ID}"`));
    assert.doesNotMatch(valueText[1], /11111111/);

    const optionChildren = [
      '\n                  ',
      'floor.op',
      ' (',
      'Operator',
      ')\n                ',
    ];
    const fromChildren = renderToStaticMarkup(
      React.createElement(
        SearchableSelect,
        { value: 'USR-9' },
        React.createElement('option', { value: 'USR-9', key: 'USR-9' }, ...optionChildren),
        React.createElement('option', { value: STORE_ID, key: STORE_ID }, 'store.lead'),
      ),
    );
    const childLabel = fromChildren.match(/searchable-select-value[\s\S]*?>([^<]*)</);
    assert.ok(childLabel, fromChildren);
    assert.equal(childLabel[1], 'floor.op (Operator)');
    assert.match(fromChildren, /value="USR-9"/);
  } finally {
    await server.close();
  }
});
