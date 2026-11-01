/**
 * SFG / FG Store is the only module with a view-only level.
 * The rest of the matrix stays true or false. "view" means the screen
 * opens for search, filter, and lookup, and store mutations stay off.
 */

export function nextSfgStorePermission(current) {
  if (current === true) return 'view';
  if (current === 'view') return false;
  return true;
}

export function sfgStoreUi(canEdit) {
  const edit = canEdit === true;
  return {
    canSearch: true,
    canFilter: true,
    canLookup: true,
    canAddBatch: edit,
    canConsume: edit,
    canMove: edit,
    canDispatch: edit,
    canAdjust: edit,
    canDelete: edit,
    canApproveHold: edit,
    canScrap: edit,
  };
}
