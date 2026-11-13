/**
 * Approval ceilings that the permission flags do not express.
 * material_indents, inventory, and pellet_fuel stay true/false.
 * "view" is implemented only for sfg_store, so these checks use the
 * plant role. Admin is included in each list.
 */
import { userHasAnyRole } from './assignedRoles.js';

export const MATERIAL_INDENT_APPROVER_ROLES = ['Admin'];

export const GRN_QC_DECISION_ROLES = [
  'Admin',
  'QC Chemist',
  'Plant Manager',
  'Production Manager',
];

export const PELLET_RECORD_ROLES = [
  'Admin',
  'Plant Manager',
  'Production Manager',
  'Store Manager',
];

export function canApproveMaterialIndent(user) {
  return userHasAnyRole(user, MATERIAL_INDENT_APPROVER_ROLES);
}

export function canDecideGrnQc(user) {
  return userHasAnyRole(user, GRN_QC_DECISION_ROLES);
}

export function canRecordPelletFuel(user) {
  return userHasAnyRole(user, PELLET_RECORD_ROLES);
}

export const PELLET_ITEM_CREATE_ROLES = ['Admin', 'Store Manager'];

export function canCreatePelletFuelItem(user) {
  return userHasAnyRole(user, PELLET_ITEM_CREATE_ROLES);
}
