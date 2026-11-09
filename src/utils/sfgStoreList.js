/**
 * SFG & FG Store list.
 *
 * The screen's summary cards count every assembled batch (sfg goods, plus
 * inventory and roll rows merged in the browser). Search, status, and type
 * run on that full list. Order groups are built after that, and the pager
 * steps through groups. A group is never split, so every roll that belongs
 * to a group on the current page stays on that page.
 *
 * Rows are assembled in the browser (order specs, printed-lot children),
 * so the query is not a single table the API can page. The database read
 * is the full store; this module is what decides the page.
 *
 * The default order is the later of the modified and created timestamps,
 * newest first. An equal timestamp keeps the higher id first.
 */

export const SFG_STORE_GROUP_PAGE_SIZE = 25;

const ITEM_SEARCH_FIELDS = [
  'sfgBatchCode',
  'barcode',
  'barcodeId',
  'jobName',
  'jobCode',
  'title',
  'orderId',
  'orderNo',
  'orderNumber',
  'clientName',
  'customerName',
  'rollCode',
  'filmType',
  'sfgType'
];

function pushText(parts, value) {
  const text = String(value ?? '').replace(/#/g, '').trim().toLowerCase();
  if (text) parts.push(text);
}

/** Order no., job/title, client, barcode, roll code, plus the substrate fields the search box already names. */
export function sfgStoreSearchHaystack(item) {
  const parts = [];
  ITEM_SEARCH_FIELDS.forEach((field) => pushText(parts, item?.[field]));
  (item?.childRolls || []).forEach((roll) => {
    pushText(parts, roll?.barcodeId);
    pushText(parts, roll?.barcode);
    pushText(parts, roll?.rollCode);
    pushText(parts, roll?.sfgBatchCode);
    pushText(parts, roll?.id);
    pushText(parts, roll?.code);
  });
  (item?.inputBarcodeIds || []).forEach((id) => pushText(parts, id));
  return parts.join(' ');
}

export function sfgStoreItemMatches(item, filters = {}) {
  const needle = String(filters.searchTerm || '').replace(/#/g, '').trim().toLowerCase();
  const matchSearch = !needle || sfgStoreSearchHaystack(item).includes(needle);
  const matchStatus = !filters.statusFilter || filters.statusFilter === 'all' || item?.status === filters.statusFilter;
  const matchType = !filters.typeFilter || filters.typeFilter === 'all' || item?.sfgType === filters.typeFilter;
  return matchSearch && matchStatus && matchType;
}

export function filterSfgStoreItems(items, filters = {}) {
  return (items || []).filter((item) => sfgStoreItemMatches(item, filters));
}

function timestampMs(value) {
  if (value == null || value === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Later of the row's modified and created timestamps. Missing stamps sort last. */
export function sfgStoreActivityMs(item) {
  const updated = timestampMs(item?.updatedAt ?? item?.updated_at);
  const created = timestampMs(
    item?.createdAt ?? item?.created_at ?? item?.createdDate ?? item?.inwardDatetime
  );
  if (updated == null && created == null) return 0;
  if (updated == null) return created;
  if (created == null) return updated;
  return Math.max(updated, created);
}

function compareIdDescending(a, b) {
  const left = a?.id == null ? '' : String(a.id);
  const right = b?.id == null ? '' : String(b.id);
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

/** Newest activity first. The same activity keeps the higher id first. */
export function compareSfgStoreItems(a, b) {
  const byActivity = sfgStoreActivityMs(b) - sfgStoreActivityMs(a);
  if (byActivity !== 0) return byActivity;
  return compareIdDescending(a, b);
}

export function sortSfgStoreItems(items) {
  return [...(items || [])].sort(compareSfgStoreItems);
}

function orderKeyFor(item) {
  const raw = (item.orderId && item.orderId !== 'N/A' && item.orderId !== '#N/A')
    ? item.orderId
    : (item.jobCode && item.jobCode !== 'N/A' ? item.jobCode : (item.jobName || 'Unassigned Order'));
  return String(raw).replace('#', '').trim();
}

function matchingOrder(item, orderKey, orderMap, cleanOrderMap, orders) {
  let direct = orderMap.get(item.orderId) || cleanOrderMap.get(orderKey);
  if (!direct) {
    direct = (orders || []).find((order) => {
      const id = String(order.id || '').replace('#', '').trim();
      return id === orderKey || id.endsWith(orderKey) || orderKey.endsWith(id);
    });
  }
  return direct || null;
}

/**
 * Group batches by job order. Every batch passed in is placed in a group;
 * nothing is dropped to fit a page.
 */
export function groupSfgStoreItems(items, orders = []) {
  const groups = [];
  const map = new Map();
  const orderMap = new Map((orders || []).map((order) => [order.id, order]));
  const cleanOrderMap = new Map((orders || []).map((order) => [String(order.id || '').replace('#', '').trim(), order]));

  (items || []).forEach((item) => {
    const orderKey = orderKeyFor(item);

    if (!map.has(orderKey)) {
      const directOrderMatch = matchingOrder(item, orderKey, orderMap, cleanOrderMap, orders);
      const rawQty = item.orderQty || directOrderMatch?.totalOrderQty || directOrderMatch?.quantityKg || directOrderMatch?.orderQtyKg || directOrderMatch?.quantity || directOrderMatch?.orderQty || directOrderMatch?.targetQtyKg || directOrderMatch?.plannedQtyKg || null;
      const rawUnit = item.orderQtyUnit || directOrderMatch?.quantityUnit || directOrderMatch?.orderQtyUnit || directOrderMatch?.unit || 'Kg';
      const rawDate = item.orderDate || directOrderMatch?.orderDate || directOrderMatch?.date || directOrderMatch?.order_date || directOrderMatch?.created_at || null;
      const group = {
        orderKey,
        orderId: item.orderId && item.orderId !== 'N/A' && item.orderId !== '#N/A' ? item.orderId : '',
        jobName: item.jobName || 'Untitled Job',
        jobCode: item.jobCode || '',
        clientName: item.clientName || '',
        filmType: item.filmType,
        micron: item.micron,
        widthMm: item.widthMm,
        orderQty: rawQty,
        orderQtyUnit: rawUnit,
        orderDate: rawDate ? String(rawDate).split('T')[0] : null,
        totalNetKg: 0,
        consumedKg: 0,
        availableKg: 0,
        items: []
      };
      map.set(orderKey, group);
      groups.push(group);
    }

    const group = map.get(orderKey);
    const net = Number(item.totalNetKg) || 0;
    const consumed = Number(item.consumedKg) || 0;
    const available = item.availableKg !== undefined ? Number(item.availableKg) : Math.max(0, net - consumed);

    if (!group.orderQty && item.orderQty) {
      group.orderQty = item.orderQty;
      group.orderQtyUnit = item.orderQtyUnit || 'Kg';
    }
    if (!group.orderDate && item.orderDate) {
      group.orderDate = String(item.orderDate).split('T')[0];
    }

    group.totalNetKg += net;
    group.consumedKg += consumed;
    group.availableKg += available;
    group.items.push(item);
  });

  return groups;
}

/** Page through order groups. Rolls inside a group stay together. */
export function pageSfgOrderGroups(groups, page = 1, pageSize = SFG_STORE_GROUP_PAGE_SIZE) {
  const size = Number(pageSize) > 0 ? Number(pageSize) : SFG_STORE_GROUP_PAGE_SIZE;
  const list = groups || [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = total > 0 ? (currentPage - 1) * size : 0;
  return {
    groups: list.slice(start, start + size),
    total,
    pageSize: size,
    currentPage,
    totalPages,
    rangeStart: total > 0 ? start + 1 : 0,
    rangeEnd: Math.min(currentPage * size, total),
    empty: total === 0
  };
}
