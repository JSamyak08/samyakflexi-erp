/**
 * Samyak Flexi-ERP routes.
 *
 * Internal module keys stay the same as the sidebar and the role matrix.
 * Public URLs are lowercase kebab-case. ROUTING_PHASE controls what the
 * live app writes; parseLocation always accepts the final paths and the
 * permanent legacy redirects.
 *
 * Phase 1: pellet fuel, scrap, and the job-data-sheet shortcut stop
 * falling through to the dashboard. Recovery hashes are left intact.
 * Phase 3: canonical module paths.
 * Phase 4: section paths for production, inventory, employees, dispatch.
 * Phase 5: section paths for every other module.
 * Phase 6: record ids move into the path.
 * Phase 7: new call sites stop passing tab / subTab / subtab. The parser
 * still honors those query keys, hash paths, and the legacy table.
 */

export const ROUTING_PHASE = 5;

const RETURN_KEY = 'samyak_erp_return_to';

const SECTION_PHASE = {
  production_records: 4,
  inventory: 4,
  employees: 4,
  dispatch: 4,
};

function sectionPhaseFor(moduleKey) {
  return SECTION_PHASE[moduleKey] || 5;
}

function detailsEnabled(phase = ROUTING_PHASE) {
  return phase >= 6;
}

function sectionsEnabled(moduleKey, phase = ROUTING_PHASE) {
  return phase >= sectionPhaseFor(moduleKey);
}

function modulesCanonical(phase = ROUTING_PHASE) {
  return phase >= 3;
}

/** @typedef {{ section: string, segs: string[], legacy?: Record<string, string>, default?: boolean, idParam?: string, query?: Record<string, string> }} Pattern */

/** @type {Array<{ key: string, path: string, legacy: string[], patterns: Pattern[] }>} */
export const MODULES = [
  {
    key: 'login',
    path: '/login',
    legacy: ['/login'],
    patterns: [
      { section: 'signin', segs: [], default: true },
      { section: 'forgot-password', segs: ['forgot-password'] },
    ],
  },
  {
    key: 'dashboard',
    path: '/dashboard',
    legacy: ['/', '/dashboard', '/index.html'],
    patterns: [{ section: 'home', segs: [], default: true }],
  },
  {
    key: 'sales',
    path: '/sales',
    legacy: ['/sales-management'],
    patterns: [
      { section: 'quotations', segs: [], default: true, legacy: { subTab: 'list', tab: 'list' } },
      { section: 'quotation-new', segs: ['quotations', 'new'], legacy: { subTab: 'create', tab: 'create' } },
      { section: 'quotation', segs: ['quotations', ':quotationId'], idParam: 'quotationId', legacy: { subTab: 'create' } },
    ],
  },
  {
    key: 'scrap_analytics',
    path: '/scrap',
    legacy: ['/scrap-wastage', '/scrap-analytics', '/scrap'],
    patterns: [{ section: 'registry', segs: [], default: true }],
  },
  {
    key: 'job_punching',
    path: '/job-punching',
    legacy: ['/job-punching'],
    patterns: [{ section: 'form', segs: [], default: true }],
  },
  {
    key: 'orders',
    path: '/orders',
    legacy: ['/orders'],
    patterns: [
      { section: 'orders', segs: [], default: true, legacy: { subtab: 'orders', subTab: 'orders' } },
      { section: 'requirements', segs: ['requirements'], legacy: { subtab: 'requirements', subTab: 'requirements' } },
      { section: 'order', segs: [':orderId'], idParam: 'orderId' },
    ],
  },
  {
    key: 'job_masters',
    path: '/job-masters',
    legacy: ['/job-masters'],
    patterns: [
      { section: 'directory', segs: [], default: true },
      { section: 'new', segs: ['new'] },
      { section: 'job-card', segs: [':jobMasterId', 'job-card'], idParam: 'jobMasterId' },
      { section: 'job', segs: [':jobMasterId'], idParam: 'jobMasterId' },
    ],
  },
  {
    key: 'clients',
    path: '/clients',
    legacy: ['/clients-directory', '/clients'],
    patterns: [
      { section: 'directory', segs: [], default: true },
      { section: 'new', segs: ['new'] },
      { section: 'client', segs: [':clientId'], idParam: 'clientId' },
    ],
  },
  {
    key: 'printing_scheduler',
    path: '/printing',
    legacy: ['/printing-scheduler', '/printing'],
    patterns: [
      { section: 'queue', segs: [], default: true, legacy: { tab: 'queue' } },
      { section: 'completed', segs: ['completed'], legacy: { tab: 'completed' } },
      { section: 'presses', segs: ['presses'], legacy: { tab: 'machines' } },
    ],
  },
  {
    key: 'production_records',
    path: '/production',
    legacy: ['/production-records', '/production'],
    patterns: [
      { section: 'punched-jobs', segs: [], default: true, legacy: { tab: 'punched_jobs' } },
      { section: 'record-new', segs: ['records', 'new'], legacy: { tab: 'new_record' } },
      { section: 'record', segs: ['records', ':recordId'], idParam: 'recordId', legacy: { tab: 'list' } },
      { section: 'records', segs: ['records'], legacy: { tab: 'list' } },
      { section: 'job-card', segs: ['job-cards', ':jobCardId'], idParam: 'jobCardId', legacy: { tab: 'job_cards' } },
      { section: 'job-cards', segs: ['job-cards'], legacy: { tab: 'job_cards' } },
      { section: 'scrap', segs: ['scrap'], legacy: { tab: 'scrap_inventory' } },
      { section: 'sheet-new', segs: ['job-data-sheets', 'new'], legacy: { tab: 'job_data_sheets' } },
      { section: 'sheet', segs: ['job-data-sheets', ':sheetId'], idParam: 'sheetId', legacy: { tab: 'job_data_sheets' } },
      { section: 'job-data-sheets', segs: ['job-data-sheets'], legacy: { tab: 'job_data_sheets' } },
    ],
  },
  {
    key: 'sfg_store',
    path: '/sfg-fg',
    legacy: ['/sfg-fg-store', '/sfg-store', '/sfg-fg'],
    patterns: [
      { section: 'available', segs: [], default: true, legacy: { tab: 'available', subTab: 'available' } },
      { section: 'qc-hold', segs: ['qc-hold'], legacy: { tab: 'qchold', subTab: 'qchold' } },
      { section: 'scrap', segs: ['scrap'], legacy: { tab: 'scrap', subTab: 'scrap' } },
      { section: 'consume', segs: [':batchId', 'consume'], idParam: 'batchId' },
      { section: 'batch', segs: [':batchId'], idParam: 'batchId' },
    ],
  },
  {
    key: 'cylinders',
    path: '/cylinders',
    legacy: ['/rotogravure-cylinders', '/cylinders'],
    patterns: [
      { section: 'directory', segs: [], default: true },
      { section: 'new', segs: ['new'] },
      { section: 'job-card', segs: [':cylinderId', 'job-card'], idParam: 'cylinderId' },
      { section: 'cylinder', segs: [':cylinderId'], idParam: 'cylinderId' },
    ],
  },
  {
    key: 'purchase_orders',
    path: '/purchase-orders',
    legacy: ['/purchase-orders', '/purchase-order-management', '/purchase-orders-hub'],
    patterns: [
      { section: 'register', segs: [], default: true },
      { section: 'new', segs: ['new'] },
      { section: 'po', segs: [':poId'], idParam: 'poId' },
    ],
  },
  {
    key: 'inventory',
    path: '/inventory',
    legacy: ['/inventory'],
    patterns: [
      { section: 'stock', segs: [], default: true, legacy: { tab: 'stock' } },
      { section: 'stock-item', segs: ['stock', ':itemId'], idParam: 'itemId', legacy: { tab: 'stock' } },
      { section: 'issued-pos', segs: ['issued-pos'], legacy: { tab: 'issued_pos' } },
      { section: 'grn-new', segs: ['grn', 'new'], legacy: { tab: 'grn_inward' }, query: { action: 'new' } },
      { section: 'grn', segs: ['grn'], legacy: { tab: 'grn_inward' } },
      { section: 'qc', segs: ['qc'], legacy: { tab: 'qc_approval' } },
      { section: 'reconciliation', segs: ['reconciliation'], legacy: { tab: 'reconciliation' } },
      { section: 'issue-return', segs: ['issue-return'], legacy: { tab: 'issue_return' } },
    ],
  },
  {
    key: 'ink_management',
    path: '/inks',
    legacy: ['/ink-management', '/ink-master', '/inks'],
    patterns: [
      { section: 'directory', segs: [], default: true, legacy: { subTab: 'directory', tab: 'directory' } },
      { section: 'calculator', segs: ['calculator'], legacy: { subTab: 'calculator', tab: 'calculator' } },
      { section: 'stock', segs: ['stock'], legacy: { subTab: 'stock', tab: 'stock' } },
      { section: 'new', segs: ['new'], legacy: { subTab: 'directory' } },
      { section: 'ink', segs: [':inkId'], idParam: 'inkId', legacy: { subTab: 'directory' } },
    ],
  },
  {
    key: 'material_indents',
    path: '/store',
    legacy: ['/material-indents', '/store'],
    patterns: [
      { section: 'store', segs: [], default: true, legacy: { subTab: 'store', tab: 'store' } },
      { section: 'indent-new', segs: ['indents', 'new'], legacy: { subTab: 'indents' } },
      { section: 'indent', segs: ['indents', ':indentId'], idParam: 'indentId', legacy: { subTab: 'indents' } },
      { section: 'indents', segs: ['indents'], legacy: { subTab: 'indents', tab: 'indents' } },
      { section: 'issue-new', segs: ['issues', 'new'], legacy: { subTab: 'issues' } },
      { section: 'issues', segs: ['issues'], legacy: { subTab: 'issues', tab: 'issues' } },
    ],
  },
  {
    key: 'pellet_fuel',
    path: '/pellet-fuel',
    legacy: ['/pellet-fuel'],
    patterns: [
      { section: 'consumption', segs: [], default: true, legacy: { subTab: 'consumption', tab: 'consumption' } },
      { section: 'consumption-new', segs: ['consumption', 'new'], legacy: { subTab: 'consumption' } },
      { section: 'consumption-item', segs: ['consumption', ':consumptionId'], idParam: 'consumptionId', legacy: { subTab: 'consumption' } },
      { section: 'inward-new', segs: ['inward', 'new'], legacy: { subTab: 'inward' } },
      { section: 'inward-item', segs: ['inward', ':inwardId'], idParam: 'inwardId', legacy: { subTab: 'inward' } },
      { section: 'inward', segs: ['inward'], legacy: { subTab: 'inward', tab: 'inward' } },
    ],
  },
  {
    key: 'vendors',
    path: '/vendors',
    legacy: ['/vendors'],
    patterns: [
      { section: 'directory', segs: [], default: true },
      { section: 'new', segs: ['new'] },
      { section: 'vendor', segs: [':vendorId'], idParam: 'vendorId' },
    ],
  },
  {
    key: 'dispatch',
    path: '/dispatch',
    legacy: ['/finished-goods-dispatch', '/dispatch-hub', '/dispatch'],
    patterns: [
      { section: 'packing', segs: [], default: true, legacy: { subTab: 'packing', tab: 'packing' } },
      { section: 'packing-new', segs: ['packing', 'new'], legacy: { subTab: 'packing' } },
      { section: 'challan-returns', segs: ['challans', ':challanId', 'returns'], idParam: 'challanId', legacy: { subTab: 'challans', tab: 'challans' } },
      { section: 'challan-new', segs: ['challans', 'new'], legacy: { subTab: 'challans', tab: 'challans' } },
      { section: 'challan', segs: ['challans', ':challanId'], idParam: 'challanId', legacy: { subTab: 'challans', tab: 'challans' } },
      { section: 'challans', segs: ['challans'], legacy: { subTab: 'challans', tab: 'challans' } },
      { section: 'coa-new', segs: ['coas', 'new'], legacy: { subTab: 'coas', tab: 'coas' } },
      { section: 'coa', segs: ['coas', ':coaId'], idParam: 'coaId', legacy: { subTab: 'coas', tab: 'coas' } },
      { section: 'coas', segs: ['coas'], legacy: { subTab: 'coas', tab: 'coas' } },
    ],
  },
  {
    key: 'employees',
    path: '/employees',
    legacy: ['/employee-management', '/employees'],
    patterns: [
      { section: 'directory', segs: [], default: true, legacy: { subTab: 'directory' } },
      { section: 'new', segs: ['new'], legacy: { subTab: 'directory' } },
      { section: 'attendance', segs: ['attendance'], legacy: { subTab: 'attendance' } },
      { section: 'overtime', segs: ['overtime'], legacy: { subTab: 'overtime' } },
      { section: 'advance-new', segs: ['advances', 'new'], legacy: { subTab: 'advances' } },
      { section: 'advances', segs: ['advances'], legacy: { subTab: 'advances' } },
      { section: 'payroll', segs: ['payroll'], legacy: { subTab: 'payroll' } },
      { section: 'payslip', segs: [':employeeId', 'payslip'], idParam: 'employeeId', legacy: { subTab: 'payroll' } },
      { section: 'employee', segs: [':employeeId'], idParam: 'employeeId', legacy: { subTab: 'directory' } },
    ],
  },
  {
    key: 'user_management',
    path: '/users',
    legacy: ['/user-management', '/users'],
    patterns: [
      { section: 'directory', segs: [], default: true, legacy: { subTab: 'directory' } },
      { section: 'new', segs: ['new'] },
      { section: 'permissions', segs: ['permissions'], legacy: { subTab: 'rbac', tab: 'rbac' } },
      { section: 'user', segs: [':userId'], idParam: 'userId' },
    ],
  },
  {
    key: 'supabase',
    path: '/supabase',
    legacy: ['/supabase-integration', '/supabase'],
    patterns: [
      { section: 'status', segs: [], default: true, legacy: { subTab: 'status', tab: 'status' } },
      { section: 'credentials', segs: ['credentials'], legacy: { subTab: 'config', tab: 'config' } },
      { section: 'schema', segs: ['schema'], legacy: { subTab: 'schema', tab: 'schema' } },
      { section: 'auth', segs: ['auth'], legacy: { subTab: 'auth', tab: 'auth' } },
    ],
  },
  {
    key: 'doc_settings',
    path: '/settings',
    legacy: ['/letterhead-settings', '/settings'],
    patterns: [
      { section: 'documents', segs: [], default: true, legacy: { tab: 'general' } },
      { section: 'machine-new', segs: ['machines', 'new'], legacy: { tab: 'general' } },
      { section: 'machine', segs: ['machines', ':machineId'], idParam: 'machineId', legacy: { tab: 'general' } },
      { section: 'machines', segs: ['machines'], legacy: { tab: 'general' } },
      { section: 'material-rates', segs: ['material-rates'], legacy: { tab: 'material_costs' } },
      { section: 'film-substrates', segs: ['film-substrates'], legacy: { tab: 'film_substrates' } },
      { section: 'storage-bays', segs: ['storage-bays'], legacy: { tab: 'storage_bays' } },
      { section: 'inventory-ageing', segs: ['inventory-ageing'], legacy: { tab: 'inventory_ageing' } },
      { section: 'email', segs: ['email'], legacy: { tab: 'email_config' } },
      { section: 'email-templates', segs: ['email-templates'], legacy: { tab: 'email_templates' } },
    ],
  },
  {
    key: 'audit_logs',
    path: '/audit-logs',
    legacy: ['/audit-logs'],
    patterns: [{ section: 'ledger', segs: [], default: true }],
  },
];

const SPECIAL_PATHS = [
  { path: '/reset-password', module: 'login', section: 'recovery' },
  { path: '/payroll', module: 'employees', section: 'payroll' },
  { path: '/attendance', module: 'employees', section: 'attendance' },
  { path: '/job-datasheet', module: 'production_records', section: 'job-data-sheets' },
  { path: '/ink-costing', module: 'ink_management', section: 'calculator' },
  { path: '/issued-pos', module: 'inventory', section: 'issued-pos' },
  { path: '/delivery-challan', module: 'dispatch', section: 'challans' },
  { path: '/delivery-challans', module: 'dispatch', section: 'challans' },
  { path: '/coa-hub', module: 'dispatch', section: 'coas' },
];

const ACTION_CANONICAL = {
  add_sfg: 'add-sfg',
  add_fg: 'add-fg',
  'add-sfg': 'add-sfg',
  'add-fg': 'add-fg',
  'issue-po': 'issue-po',
  new: 'new',
  edit: 'edit',
  end: 'end',
  grn: 'grn',
  price: 'price',
  adjust: 'adjust',
  approve: 'approve',
  scrap: 'scrap',
  history: 'history',
  bulk: 'bulk',
  link: 'link',
  onboard: 'onboard',
  'add-stock': 'add-stock',
  'new-item': 'new-item',
  restock: 'restock',
  'new-indent': 'new-indent',
};

const QUERY_KEEP = new Set([
  'q', 'status', 'vendor', 'category', 'from', 'to', 'fy', 'month', 'machine', 'shift',
  'page', 'type', 'view', 'action', 'jobMasterId', 'orderId', 'preset', 'threshold',
  'filter', 'department', 'date', 'range', 'jobName', 'code',
]);

const MODULE_BY_KEY = new Map(MODULES.map((mod) => [mod.key, mod]));

const PATH_INDEX = new Map();
for (const mod of MODULES) {
  PATH_INDEX.set(normalizePath(mod.path), { module: mod, special: null });
  for (const legacy of mod.legacy) PATH_INDEX.set(normalizePath(legacy), { module: mod, special: null });
}
for (const special of SPECIAL_PATHS) {
  PATH_INDEX.set(normalizePath(special.path), { module: MODULE_BY_KEY.get(special.module), special });
}

function normalizePath(pathname) {
  if (!pathname) return '/';
  let path = pathname.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function decodeSeg(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeSeg(value) {
  return encodeURIComponent(String(value));
}

function searchToObject(search) {
  const params = {};
  const raw = search ? (search.startsWith('?') ? search.slice(1) : search) : '';
  if (!raw) return params;
  const usp = new URLSearchParams(raw);
  usp.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

function isRecoveryHash(hash) {
  if (!hash) return false;
  return hash.includes('type=recovery') || hash.includes('access_token=');
}

function looksLikeRouteHash(hash) {
  if (!hash || isRecoveryHash(hash)) return false;
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return false;
  const pathPart = raw.split('?')[0];
  const first = pathPart.split('/').filter(Boolean)[0];
  if (!first) return false;
  return PATH_INDEX.has(normalizePath(`/${first.toLowerCase()}`)) || PATH_INDEX.has(normalizePath(pathPart.toLowerCase()));
}

function findModuleBySlug(slug) {
  if (!slug) return null;
  const key = String(slug).trim().toLowerCase();
  if (MODULE_BY_KEY.has(key)) return MODULE_BY_KEY.get(key);
  const aliases = {
    scrap_wastage: 'scrap_analytics',
    job_datasheet: 'production_records',
    'job-datasheet': 'production_records',
  };
  if (aliases[key] && MODULE_BY_KEY.has(aliases[key])) return MODULE_BY_KEY.get(aliases[key]);
  const path = key.startsWith('/') ? normalizePath(key) : normalizePath(`/${key}`);
  const hit = PATH_INDEX.get(path);
  if (hit) return hit.module;
  return null;
}

function patternScore(pattern) {
  const staticCount = pattern.segs.filter((seg) => !seg.startsWith(':')).length;
  return staticCount * 10 + pattern.segs.length;
}

function matchPattern(segments, pattern) {
  if (segments.length !== pattern.segs.length) return null;
  const params = {};
  for (let i = 0; i < pattern.segs.length; i += 1) {
    const expected = pattern.segs[i];
    const actual = segments[i];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeSeg(actual);
    } else if (expected !== String(actual).toLowerCase()) {
      return null;
    }
  }
  return params;
}

function matchModuleRemainder(mod, segments) {
  const ranked = mod.patterns.slice().sort((a, b) => patternScore(b) - patternScore(a));
  for (const pattern of ranked) {
    const params = matchPattern(segments, pattern);
    if (params) return { pattern, params };
  }
  return null;
}

function defaultPattern(mod) {
  return mod.patterns.find((pattern) => pattern.default) || mod.patterns[0];
}

function patternBySection(mod, section) {
  return mod.patterns.find((pattern) => pattern.section === section) || null;
}

function sectionFromLegacyValue(mod, value) {
  if (!value || !mod) return null;
  const token = String(value);
  const hits = [];
  for (const pattern of mod.patterns) {
    const legacy = pattern.legacy || {};
    if (Object.values(legacy).includes(token) || pattern.section === token) hits.push(pattern);
  }
  if (!hits.length) return null;
  const list = hits.find((pattern) => !pattern.idParam && !pattern.section.endsWith('-new'));
  if (list) return list.section;
  const plain = hits.find((pattern) => !pattern.idParam);
  return (plain || hits[0]).section;
}

function applyLegacySelectors(mod, matched, query) {
  let pattern = matched?.pattern || defaultPattern(mod);
  const params = { ...(matched?.params || {}) };
  const selector = query.tab || query.subTab || query.subtab;
  const fromModule = query.tab ? findModuleBySlug(query.tab) : null;
  const sectionHit = sectionFromLegacyValue(mod, selector);
  if (sectionHit && (!fromModule || fromModule.key === mod.key)) {
    const next = patternBySection(mod, sectionHit);
    if (next && next.segs.every((seg) => !seg.startsWith(':'))) {
      pattern = next;
    }
  }
  if (query.action === 'new' || query.action === 'add') {
    const newer = mod.patterns.find((item) => item.section.endsWith('-new') && item.legacy?.tab === pattern.legacy?.tab);
    if (newer && (query.tab || pattern.section === newer.legacy?.tab)) pattern = newer;
  }
  if (query.jobCardId && mod.key === 'production_records') {
    pattern = patternBySection(mod, 'job-card') || pattern;
    params.jobCardId = query.jobCardId;
  }
  if (query.jobCardId && mod.key === 'job_masters') {
    pattern = patternBySection(mod, 'job-card') || pattern;
    params.jobMasterId = query.jobCardId;
  }
  if ((query.coaId || query.coaNo) && mod.key === 'dispatch') {
    pattern = patternBySection(mod, 'coa') || pattern;
    params.coaId = query.coaId || query.coaNo;
  }
  const idCandidate = query.id || query.recordId || query.challanNo || query.dcNo || query.code;
  if (idCandidate && pattern && !pattern.idParam) {
    const detail = detailPatternFor(mod, pattern.section, idCandidate);
    if (detail) {
      pattern = detail.pattern;
      Object.assign(params, detail.params);
    }
  }
  return { pattern, params };
}

function legacyTrailingId(mod, special, remainder) {
  if (remainder.length !== 1 && !(special?.section === 'job-data-sheets' && remainder.length === 1)) {
    if (remainder.length !== 1) return null;
  }
  const token = remainder[0];
  const staticFirst = new Set(
    mod.patterns
      .map((pattern) => pattern.segs[0])
      .filter((seg) => seg && !seg.startsWith(':'))
  );
  if (staticFirst.has(String(token).toLowerCase())) return null;
  if (special?.section === 'job-data-sheets') {
    const pattern = patternBySection(mod, 'sheet');
    return { pattern, params: { sheetId: decodeSeg(token) } };
  }
  const rootId = mod.patterns.find((pattern) => pattern.segs.length === 1 && pattern.segs[0].startsWith(':'));
  if (rootId) {
    return { pattern: rootId, params: { [rootId.idParam]: decodeSeg(token) } };
  }
  const fallbackSection = {
    production_records: 'record',
    inventory: 'stock-item',
    dispatch: 'challan',
    employees: 'employee',
    ink_management: 'ink',
    sfg_store: 'batch',
  }[mod.key];
  if (!fallbackSection) return null;
  const pattern = patternBySection(mod, fallbackSection);
  if (!pattern?.idParam) return null;
  return { pattern, params: { [pattern.idParam]: decodeSeg(token) } };
}

function detailPatternFor(mod, section, id) {
  const candidates = mod.patterns.filter((pattern) => pattern.idParam && pattern.legacy && pattern.legacy.tab === undefined
    ? pattern.section !== section
    : true);
  const preferred = mod.patterns
    .filter((pattern) => pattern.idParam)
    .filter((pattern) => {
      if (section === 'records' || section === 'record' || section === 'punched-jobs') return pattern.section === 'record';
      if (section === 'job-cards' || section === 'job-card') return pattern.section === 'job-card';
      if (section === 'stock' || section === 'stock-item') return pattern.section === 'stock-item';
      if (section === 'challans' || section === 'challan') return pattern.section === 'challan';
      if (section === 'coas' || section === 'coa') return pattern.section === 'coa';
      if (section === 'quotations' || section === 'quotation') return pattern.section === 'quotation';
      if (section === 'orders' || section === 'order') return pattern.section === 'order';
      if (section === 'directory' && mod.key === 'job_masters') return pattern.section === 'job';
      if (section === 'directory' && mod.key === 'clients') return pattern.section === 'client';
      if (section === 'directory' && mod.key === 'vendors') return pattern.section === 'vendor';
      if (section === 'directory' && mod.key === 'cylinders') return pattern.section === 'cylinder';
      if (section === 'directory' && mod.key === 'ink_management') return pattern.section === 'ink';
      if (section === 'register') return pattern.section === 'po';
      if (section === 'available' || section === 'batch' || section === 'consume') return pattern.section === 'batch';
      if (section === 'directory' && mod.key === 'employees') return pattern.section === 'employee';
      if (section === 'payroll' || section === 'payslip') return pattern.section === 'payslip';
      if (section === 'directory' && mod.key === 'user_management') return pattern.section === 'user';
      if (section === 'consumption') return pattern.section === 'consumption-item';
      if (section === 'inward') return pattern.section === 'inward-item';
      if (section === 'indents' || section === 'indent') return pattern.section === 'indent';
      if (section === 'machines' || section === 'machine') return pattern.section === 'machine';
      if (section === 'job-data-sheets' || section === 'sheet') return pattern.section === 'sheet';
      return false;
    });
  const chosen = preferred[0];
  if (!chosen) {
    void candidates;
    return null;
  }
  return { pattern: chosen, params: { [chosen.idParam]: id } };
}

function legacyParamsFor(pattern, idParams) {
  const params = {};
  const legacy = pattern?.legacy || {};
  if (legacy.tab) params.tab = legacy.tab;
  if (legacy.subTab) params.subTab = legacy.subTab;
  if (legacy.subtab) params.subtab = legacy.subtab;
  if (pattern?.idParam && idParams[pattern.idParam]) {
    params.id = idParams[pattern.idParam];
    if (pattern.idParam === 'recordId') params.recordId = idParams.recordId;
    if (pattern.idParam === 'jobCardId') params.jobCardId = idParams.jobCardId;
    if (pattern.idParam === 'coaId') params.coaId = idParams.coaId;
    if (pattern.idParam === 'challanId') params.challanNo = idParams.challanId;
    if (pattern.idParam === 'inkId') params.code = idParams.inkId;
    if (pattern.idParam === 'quotationId') params.quotationId = idParams.quotationId;
    if (pattern.idParam === 'orderId') params.orderId = idParams.orderId;
  }
  if (pattern?.query) Object.assign(params, pattern.query);
  if (pattern?.section) params.section = pattern.section;
  return params;
}

function keptQuery(query, pattern) {
  const out = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'tab' || key === 'subTab' || key === 'subtab' || key === 'page' || key === 'id') continue;
    if (key === 'action' && pattern?.query?.action) continue;
    if (pattern?.idParam && (key === pattern.idParam || key === 'recordId' || key === 'jobCardId' || key === 'coaId' || key === 'coaNo' || key === 'challanNo' || key === 'dcNo' || key === 'code' || key === 'quotationId')) {
      continue;
    }
    if (QUERY_KEEP.has(key) || key === 'edit') out[key] = value;
  }
  if (query.page && !findModuleBySlug(query.page) && /^[0-9]+$/.test(String(query.page))) out.page = query.page;
  if (query.action && !pattern?.query?.action) {
    out.action = ACTION_CANONICAL[query.action] || query.action;
  }
  if (query.view) out.view = query.view;
  if (query.type) out.type = query.type;
  if (query.jobMasterId) out.jobMasterId = query.jobMasterId;
  if (query.orderId && pattern?.section === 'record-new') out.orderId = query.orderId;
  if (query.orderId && pattern?.section !== 'order' && pattern?.section !== 'record-new' && pattern?.idParam !== 'orderId') {
    if (query.orderId) out.orderId = query.orderId;
  }
  if (query.month) out.month = query.month;
  if (query.jobName) out.jobName = query.jobName;
  return out;
}

function formatQuery(query) {
  const usp = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    usp.set(key, String(value));
  });
  const text = usp.toString();
  return text ? `?${text}` : '';
}

function joinModulePath(mod, pattern, idParams) {
  const segs = pattern.segs.map((seg) => (seg.startsWith(':') ? encodeSeg(idParams[seg.slice(1)] || '') : seg));
  const suffix = segs.filter(Boolean).join('/');
  if (!suffix) return mod.path;
  return `${mod.path}/${suffix}`;
}

/**
 * Parse a location into a module, section, and the params existing screens read.
 * Unknown paths stay unknown. They are not rewritten to the dashboard here.
 */
export function parseLocation({ pathname = '/', search = '', hash = '' } = {}) {
  const recovery = isRecoveryHash(hash);
  let path = normalizePath(pathname || '/');
  let query = searchToObject(search);

  if (!recovery && looksLikeRouteHash(hash)) {
    const raw = hash.replace(/^#\/?/, '');
    const [hashPath, hashQuery] = raw.split('?');
    path = normalizePath(hashPath.startsWith('/') ? hashPath : `/${hashPath}`);
    query = { ...query, ...searchToObject(hashQuery || '') };
  }

  if (recovery && (path === '/' || path === '/login' || path === '/reset-password')) {
    return finishRoute(MODULE_BY_KEY.get('login'), patternBySection(MODULE_BY_KEY.get('login'), 'signin'), {}, query, {
      recovery: true,
      sectionOverride: 'recovery',
      hash,
    });
  }

  const special = SPECIAL_PATHS.find((item) => normalizePath(item.path) === path.toLowerCase() || normalizePath(item.path) === path);
  if (special) {
    const mod = MODULE_BY_KEY.get(special.module);
    if (special.section === 'recovery') {
      return finishRoute(mod, defaultPattern(mod), {}, query, {
        sectionOverride: 'recovery',
        recovery: true,
        hash: recovery ? hash : '',
      });
    }
    let pattern = patternBySection(mod, special.section) || defaultPattern(mod);
    const applied = applyLegacySelectors(mod, { pattern, params: {} }, query);
    pattern = applied.pattern.section === special.section || special.section === 'recovery'
      ? pattern
      : applied.pattern;
    if (special.section !== 'recovery') pattern = applied.pattern.segs.length ? applied.pattern : patternBySection(mod, special.section);
    if (special.section === 'job-data-sheets') pattern = patternBySection(mod, query.id ? 'sheet' : 'job-data-sheets');
    return finishRoute(mod, pattern, applied.params, query, { hash: recovery ? hash : '' });
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    const mod = MODULE_BY_KEY.get('dashboard');
    const moduleOverride = moduleOverrideFromQuery(query, mod);
    if (moduleOverride) {
      const overridden = applyLegacySelectors(moduleOverride, { pattern: defaultPattern(moduleOverride), params: {} }, {});
      return finishRoute(moduleOverride, overridden.pattern, overridden.params, query, {});
    }
    return finishRoute(mod, defaultPattern(mod), {}, query, {});
  }

  const first = `/${segments[0].toLowerCase()}`;
  const indexed = PATH_INDEX.get(first);
  if (!indexed) {
    return {
      tab: null,
      section: null,
      params: { ...query },
      unknown: true,
      recovery: false,
      canonical: path,
      module: null,
    };
  }

  const mod = indexed.module;
  const remainder = segments.slice(1);
  let matched = matchModuleRemainder(mod, remainder);
  if (!matched && remainder.length > 0) {
    matched = legacyTrailingId(mod, indexed.special, remainder);
  }
  if (!matched && remainder.length > 0) {
    return {
      tab: null,
      section: null,
      params: { ...query },
      unknown: true,
      recovery: false,
      canonical: path,
      module: null,
    };
  }
  if (!matched && indexed.special) {
    const specialPattern = patternBySection(mod, indexed.special.section) || defaultPattern(mod);
    matched = { pattern: specialPattern, params: {} };
  }
  const applied = applyLegacySelectors(mod, matched || { pattern: defaultPattern(mod), params: {} }, query);
  const moduleOverride = moduleOverrideFromQuery(query, mod);
  if (moduleOverride && moduleOverride.key !== mod.key && !sectionFromLegacyValue(mod, query.tab || query.subTab || query.subtab)) {
    const overridden = applyLegacySelectors(moduleOverride, { pattern: defaultPattern(moduleOverride), params: {} }, {});
    return finishRoute(moduleOverride, overridden.pattern, overridden.params, query, {});
  }
  return finishRoute(mod, applied.pattern, { ...(matched?.params || {}), ...applied.params }, query, {});
}

function moduleOverrideFromQuery(query, current) {
  const tokens = [query.tab, query.subTab, query.subtab, query.page];
  for (const token of tokens) {
    if (!token) continue;
    if (sectionFromLegacyValue(current, token)) continue;
    const mod = findModuleBySlug(token);
    if (mod && mod.key !== current.key) return mod;
  }
  return null;
}

function finishRoute(mod, pattern, idParams, query, extra) {
  const safePattern = pattern || defaultPattern(mod);
  const params = {
    ...legacyParamsFor(safePattern, idParams),
    ...keptQuery(query, safePattern),
  };
  if (extra.sectionOverride) params.section = extra.sectionOverride;
  if (query.id && !params.id && !safePattern.idParam) params.id = query.id;
  if (idParams.orderId && safePattern.section === 'order') params.id = idParams.orderId;
  const canonical = buildCanonical(mod.key, params);
  return {
    tab: mod.key,
    section: params.section,
    params,
    unknown: false,
    recovery: Boolean(extra.recovery),
    canonical,
    module: mod.key,
    hash: extra.hash || '',
  };
}

function inferSection(mod, params) {
  if (params.section && patternBySection(mod, params.section)) return params.section;
  const fromLegacy = sectionFromLegacyValue(mod, params.tab || params.subTab || params.subtab);
  if (fromLegacy) return fromLegacy;
  if (params.jobCardId && mod.key === 'production_records') return 'job-card';
  if (params.jobCardId && mod.key === 'job_masters') return 'job-card';
  if ((params.coaId || params.coaNo) && mod.key === 'dispatch') return 'coa';
  if (params.action === 'new' && mod.key === 'inventory' && (params.tab === 'grn_inward' || params.section === 'grn')) return 'grn-new';
  return defaultPattern(mod).section;
}

function listPatternFor(mod, pattern) {
  return mod.patterns.find((item) => !item.idParam && !item.section.endsWith('-new') && (
    item.section === pattern.section
    || (pattern.legacy?.tab && item.legacy?.tab === pattern.legacy.tab)
    || (pattern.legacy?.subTab && item.legacy?.subTab === pattern.legacy.subTab)
  )) || defaultPattern(mod);
}

function inferDetail(mod, section, params, allowDetails) {
  const current = patternBySection(mod, section) || defaultPattern(mod);
  if (current?.idParam) return allowDetails ? current : listPatternFor(mod, current);
  if (!allowDetails) return current;
  const id = params.id || params.recordId || params.jobCardId || params.coaId || params.coaNo || params.challanNo || params.quotationId || params.orderId || params.code;
  if (params.jobCardId && (mod.key === 'production_records' || mod.key === 'job_masters')) {
    return patternBySection(mod, 'job-card') || patternBySection(mod, section);
  }
  if ((params.coaId || params.coaNo) && mod.key === 'dispatch') {
    const pattern = patternBySection(mod, 'coa');
    return pattern;
  }
  if (section === 'challan-returns' || params.action === 'returns') {
    return patternBySection(mod, 'challan-returns') || patternBySection(mod, section);
  }
  if (id) {
    const detail = detailPatternFor(mod, section, id);
    if (detail) return detail.pattern;
  }
  if (params.action === 'new') {
    const newer = mod.patterns.find((pattern) => pattern.section === `${section}-new` || pattern.section.endsWith('-new') && pattern.legacy?.subTab === (params.subTab || params.tab));
    if (newer) return newer;
  }
  return patternBySection(mod, section) || defaultPattern(mod);
}

function idParamsFrom(pattern, params) {
  const out = {};
  if (!pattern?.idParam) return out;
  const id = params[pattern.idParam] || params.id || params.recordId || params.jobCardId || params.coaId || params.coaNo || params.challanNo || params.dcNo || params.code || params.quotationId || params.orderId;
  if (id) out[pattern.idParam] = id;
  return out;
}

export function buildCanonical(moduleKey, params = {}) {
  if (params.section === 'recovery') {
    const query = keptQuery({ ...params, section: undefined, tab: undefined, subTab: undefined, subtab: undefined, id: undefined }, { section: 'recovery' });
    return `/reset-password${formatQuery(query)}`;
  }
  const alias = moduleKey === 'scrap_wastage' ? 'scrap_analytics' : moduleKey === 'job_datasheet' ? 'production_records' : moduleKey;
  const mod = MODULE_BY_KEY.get(alias) || MODULE_BY_KEY.get('dashboard');
  let section = inferSection(mod, moduleKey === 'job_datasheet' ? { ...params, section: params.section || 'job-data-sheets' } : params);
  if (moduleKey === 'job_datasheet' && !params.section) section = params.id ? 'sheet' : 'job-data-sheets';
  const pattern = inferDetail(mod, section, params, true);
  const ids = idParamsFrom(pattern, params);
  const path = joinModulePath(mod, pattern, ids);
  const query = keptQuery({ ...params, section: undefined, tab: undefined, subTab: undefined, subtab: undefined, id: undefined }, pattern);
  if (params.view) query.view = params.view;
  if (params.edit) query.edit = params.edit;
  if (params.month && pattern.section === 'payslip') query.month = params.month;
  return `${path}${formatQuery(query)}`;
}

export function buildHref(moduleKey, params = {}, phase = ROUTING_PHASE) {
  const alias = moduleKey === 'scrap_wastage' ? 'scrap_analytics' : moduleKey;
  if (alias === 'job_datasheet') {
    if (phase >= 6) return buildCanonical('job_datasheet', params);
    if (phase >= 3) return buildHref('production_records', { ...params, section: params.section && params.section !== 'job-data-sheets' ? params.section : 'punched-jobs' }, phase);
    return appendLegacyQuery('/production-records', params);
  }
  const mod = MODULE_BY_KEY.get(alias);
  if (!mod) return '/dashboard';
  if (alias === 'material_indents' && (params.subTab === 'pellet_fuel' || params.tab === 'pellet_fuel')) {
    return buildHref('pellet_fuel', {}, phase);
  }
  if (alias === 'login' && phase >= 3) {
    if (params.section === 'forgot-password' || params.section === 'forgot_password') return '/login/forgot-password';
    if (params.section === 'recovery') return '/reset-password';
    return '/login';
  }
  if (alias === 'pellet_fuel' && phase < 5) {
    return appendLegacyQuery('/pellet-fuel', stripStructural(params, phase));
  }
  if (alias === 'scrap_analytics' && phase < 3) {
    return appendLegacyQuery('/scrap', stripStructural(params, phase));
  }
  if (!modulesCanonical(phase) && alias !== 'pellet_fuel' && alias !== 'scrap_analytics') {
    const legacyPath = mod.legacy.find((item) => item !== mod.path && item !== '/') || mod.legacy[0];
    return appendLegacyQuery(legacyPath === '/' ? '/dashboard' : legacyPath, stripStructural(params, phase));
  }
  const useSections = sectionsEnabled(alias, phase);
  const useDetails = detailsEnabled(phase);
  if (!useSections) {
    return appendLegacyQuery(mod.path, stripStructural(params, phase));
  }
  let section = inferSection(mod, alias === 'job_datasheet' ? { ...params, section: 'job-data-sheets' } : params);
  let pattern = inferDetail(mod, section, params, useDetails);
  if (!useDetails && pattern.idParam) {
    pattern = listPatternFor(mod, pattern);
  }
  const ids = useDetails ? idParamsFrom(pattern, params) : {};
  const path = joinModulePath(mod, pattern, ids);
  const query = { ...keptQuery(params, pattern) };
  if (!useDetails && (params.id || params.recordId)) query.id = params.id || params.recordId;
  else if (!useDetails && params.jobCardId) query.jobCardId = params.jobCardId;
  else if (!useDetails && params.coaId) query.coaId = params.coaId;
  if (phase < 7) {
    // Selector query keys are not written once the section lives in the path.
  }
  delete query.tab;
  delete query.subTab;
  delete query.subtab;
  return `${path}${formatQuery(query)}`;
}

function stripStructural(params, phase) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'section') continue;
    if (phase >= 7 && (key === 'tab' || key === 'subTab' || key === 'subtab')) continue;
    out[key] = value;
  }
  return out;
}

function appendLegacyQuery(path, params) {
  return `${path}${formatQuery(params)}`;
}

export function getSlugForTab(tabKey) {
  return buildHref(tabKey, {}, ROUTING_PHASE).split('?')[0];
}

export function getRouteFromUrl() {
  try {
    if (typeof window === 'undefined' || !window.location) {
      return { tab: 'dashboard', section: 'home', params: {}, unknown: false, recovery: false, canonical: '/dashboard' };
    }
    const route = parseLocation({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    return route;
  } catch (error) {
    console.error('Error reading URL route', error);
    return { tab: 'dashboard', section: 'home', params: {}, unknown: false, recovery: false, canonical: '/dashboard' };
  }
}

export function getTabFromUrl() {
  return getRouteFromUrl().tab;
}

export function pushSlugState(tabKey, queryParams = {}, replace = false) {
  try {
    const finalUrl = buildHref(tabKey, queryParams);
    if (typeof window !== 'undefined' && window.history) {
      const state = { tab: tabKey, params: queryParams };
      if (replace && window.history.replaceState) window.history.replaceState(state, '', finalUrl);
      else if (window.history.pushState) window.history.pushState(state, '', finalUrl);
      window.dispatchEvent(new CustomEvent('erp-slug-navigate'));
    }
    return finalUrl;
  } catch (error) {
    console.warn('Failed to push state to history', error);
    return null;
  }
}

export function isRecoveryLocation(loc) {
  const hash = loc?.hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const pathname = loc?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const search = loc?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (isRecoveryHash(hash)) return true;
  if (normalizePath(pathname) === '/reset-password') return true;
  if (search.includes('code=') && (normalizePath(pathname) === '/reset-password' || normalizePath(pathname) === '/login')) return true;
  return false;
}

export function rememberReturnTo(href) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (!href || href.startsWith('/login') || href.startsWith('/reset-password')) return;
    sessionStorage.setItem(RETURN_KEY, href);
  } catch {
    /* session storage can be blocked */
  }
}

export function consumeReturnTo() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
}

/** True when a string is an in-app path the router can open. */
export function resolveInternalPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return { ok: false, reason: 'empty' };
  if (pathname.startsWith('/api/') || pathname === '/api') return { ok: true, kind: 'api' };
  const route = parseLocation({ pathname, search: '', hash: '' });
  if (route.unknown) return { ok: false, reason: 'unknown' };
  return { ok: true, kind: 'app', canonical: route.canonical, module: route.tab, section: route.section };
}

export function listReservedSections(moduleKey) {
  const mod = MODULE_BY_KEY.get(moduleKey);
  if (!mod) return [];
  const reserved = new Set();
  for (const pattern of mod.patterns) {
    if (pattern.segs[0] && !pattern.segs[0].startsWith(':')) reserved.add(pattern.segs[0]);
  }
  return [...reserved];
}
