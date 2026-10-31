/**
 * Stock-item archive flag. Missing means active, so rows saved before the
 * archive columns still appear in the stock list.
 */
export function isInventoryItemActive(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.isActive === false || item.is_active === false) return false;
  if (item.archived === true) return false;
  return true;
}

export function activeInventoryItems(items) {
  return (items || []).filter((item) => isInventoryItemActive(item));
}
