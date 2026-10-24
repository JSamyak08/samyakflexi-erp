import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './services/supabaseClient';
import { applyRemoteCompanyProfile } from './services/companyProfile';
import { 
  isReconciliationDue,
  DEFAULT_ROLE_PERMISSIONS,
  isOrderOverdue,
  isOrderNearingDeadline,
  getOrderStatusInfo,
  getOrderStageInfo,
  FILM_DENSITIES
} from './factoryStore';
import { 
  LayoutDashboard, 
  Calculator, 
  ShoppingBag, 
  Building2, 
  Briefcase,
  Package, 
  Layers, 
  AlertTriangle, 
  FileCheck, 
  FileSpreadsheet,
  Users,
  Bell,
  LogOut,
  ClipboardList,
  Database,
  UserCheck,
  Printer,
  FileCode,
  FileText,
  Settings as SettingsIcon,
  ShieldAlert,
  Droplet,
  Truck,
  FlaskConical,
  ArrowRight,
  ScanBarcode,
  Coins,
  Clock,
  RefreshCw,
  Flame
} from 'lucide-react';

import AuthScreen from './components/AuthScreen';
import JobPunchingForm from './components/JobPunchingForm';
import OrderManagement from './components/OrderManagement';
import VendorManagement from './components/VendorManagement';
import InventoryManagement from './components/InventoryManagement';
import JobDataSheet from './components/JobDataSheet';
import UserManagement from './components/UserManagement';
import EmployeeManagement from './components/EmployeeManagement';
import CylinderManagement from './components/CylinderManagement';
import ProductionRecordManagement from './components/ProductionRecordManagement';
import ProductionScheduler from './components/ProductionScheduler';
import ClientManagement from './components/ClientManagement';
import SupabaseManagement from './components/SupabaseManagement';
import DocumentSettings from './components/DocumentSettings';
import ConsumablesAndIndents from './components/ConsumablesAndIndents';
import PelletFuelManagement from './components/PelletFuelManagement';
import SalesManagement from './components/SalesManagement';
import ScrapWastageAnalysis from './components/ScrapWastageAnalysis';
import AuditLogsManagement from './components/AuditLogsManagement';
import InkManagement from './components/InkManagement';
import DispatchManagement from './components/DispatchManagement';
import SFGStoreManagement from './components/SFGStoreManagement';
import PurchaseOrderManagement from './components/PurchaseOrderManagement';
import WeighingScaleWidget from './components/WeighingScaleWidget';
import UniversalBarcodeScannerModal from './components/UniversalBarcodeScannerModal';
import Preloader from './components/Preloader';
import { bootLoaderIsReady, shouldShowBootLoader } from './bootLoader';
import { roleHasModule, roleNeedsAny, canReadPayroll, cachesToDrop, BOOT_NEEDS } from './bootAccess';
import SearchableSelect from './components/SearchableSelect';
import SuccessScreenModal from './components/SuccessScreenModal';
import { showSuccessScreen } from './context/SuccessModalContext';
import { fetchAuditLogsFromSupabase, saveAuditLogToSupabase, createAuditEntry, pruneOldAuditLogs } from './services/auditLogger';
import { getDocumentPrefixes, getNextDocRefNumber } from './services/settingsService';
import { mergeRollsIntoList } from './services/grnDocument';
import { getRouteFromUrl, getTabFromUrl, pushSlugState, parseLocation, isRecoveryLocation, rememberReturnTo, consumeReturnTo } from './utils/slugRouter';
import { activeUserLabel } from './utils/activeUserLabel';
import { isSupabaseConfigured, checkSupabaseConnection } from './services/supabaseClient';
import { 
  fetchOrders, saveOrderToSupabase, deleteOrderFromSupabase,
  fetchVendors, saveVendorToSupabase, deleteVendorFromSupabase,
  fetchInventory, saveInventoryItemToSupabase, saveInventoryBatchToSupabase, deleteInventoryItemFromSupabase, sanitizeInventoryItem,
  fetchGRNs, saveGRNToSupabase, deleteGRNFromSupabase, sanitizeGRN,
  fetchCylinders, saveCylinderToSupabase, saveCylinderBatchToSupabase, deleteCylinderFromSupabase,
  fetchProductionRecords, saveProductionRecordToSupabase, deleteProductionRecordFromSupabase,
  fetchUsers,
  fetchJobDataSheets, saveJobDataSheetToSupabase, deleteJobDataSheetFromSupabase,
  fetchInventoryRolls, saveInventoryRollToSupabase,
  fetchDispatchShipments, saveDispatchShipmentToSupabase, deleteDispatchShipmentFromSupabase,
  fetchPrintingMachines, savePrintingMachineToSupabase, deletePrintingMachineFromSupabase,
  fetchProductionSchedules, saveProductionScheduleToSupabase, deleteProductionScheduleFromSupabase,
  fetchClients, saveClientToSupabase, deleteClientFromSupabase,
  fetchJobMasters, saveJobMasterToSupabase, deleteJobMasterFromSupabase, saveJobMasterBatchToSupabase,
  fetchInks, saveInkToSupabase, deleteInkFromSupabase,
  fetchEmployeesFromSupabase, saveEmployeeToSupabase, deleteEmployeeFromSupabase,
  fetchEmployeeAttendanceFromSupabase, saveEmployeeAttendanceToSupabase,
  fetchSalaryAdvancesFromSupabase, saveSalaryAdvanceToSupabase,
  fetchSalaryPaymentsFromSupabase, saveSalaryPaymentToSupabase,
  fetchRolePermissionsFromSupabase, saveRolePermissionsToSupabase,
  fetchSFGGoodsFromSupabase, saveSFGGoodToSupabase, deleteSFGGoodFromSupabase,
  fetchDeliveryChallansFromSupabase, saveDeliveryChallanToSupabase, deleteDeliveryChallanFromSupabase,
  fetchCertificatesOfAnalysisFromSupabase, saveCertificateOfAnalysisToSupabase, deleteCertificateOfAnalysisFromSupabase,
  fetchPelletInwardsFromSupabase, savePelletInwardToSupabase, deletePelletInwardFromSupabase,
  fetchPelletConsumptionsFromSupabase, savePelletConsumptionToSupabase, deletePelletConsumptionFromSupabase,
  allocatePelletGrnNumber, savePelletInwardWithGrn,
  fetchPurchaseOrders, savePurchaseOrderToSupabase, deletePurchaseOrderFromSupabase, sanitizePurchaseOrder,
  fetchFilmSubstratesFromSupabase,
  fetchAllSystemSettings
} from './services/supabaseDataService';
import { attendanceMatchesEmployeeDate } from './services/employeeAttendance';
import { buildPelletCompanionGrn, findPelletInventoryItem, fuelActorName } from './services/pelletFuel';
import { fetchSessionProfile, signOutUser } from './services/authService';
import {
  PartialSaveError,
  writeWithRetry,
  unsavedItemsMessage,
  planDispatchSfgDeductions,
  planDispatchRollDeductions,
  commitSequentialUpdates,
  applyCommittedByIndex,
  assertAllSaved
} from './services/guardedWrite';
import { createDirectoryUser, updateDirectoryUser, deleteDirectoryUser } from './services/adminUserService';
import { buildChildStockRecords, saveConsumeChildRolls } from './services/consumeChildRolls';

import JobMasterDirectory from './components/JobMasterDirectory';
import { safeLocalStorageSet, safeLocalStorageGet, initSafeStorage, idbGet } from './utils/safeStorage';
import {
  importLegacyBusinessRecords,
  fetchPayloadRecords,
  replacePayloadRecords,
  fetchPressBoard,
  savePressBoard,
  describeSaveError,
  localKeysToClear,
  snapshotBrowserStorage,
  clearImportedLocalKeys
} from './services/businessRecords';
import './index.css';

// ============================================================================
// PERMANENT BOOT-TIME PURGE: Strip all legacy seed/dummy data from storage.
// These IDs were seeded during development and must NEVER appear in production.
// ============================================================================
const DUMMY_ORDER_IDS = new Set([
  'ORD-2026-089', 'ORD-2026-090', 'ORD-2026-091', 'ORD-2026-092',
  'ORD-2026-648'
]);
const DUMMY_PROD_IDS = new Set([
  'PROD-REC-089', 'PROD-REC-090', 'PROD-REC-091', 'PROD-REC-092',
  'REC-2026-089', 'REC-2026-090', 'REC-2026-091', 'REC-2026-092'
]);
// Known seed inventory IDs (INV-001 to INV-011, etc.)
const DUMMY_INV_IDS = new Set([
  'INV-001','INV-002','INV-003','INV-004','INV-005','INV-006',
  'INV-007','INV-008','INV-009','INV-010','INV-011'
]);
// Known seed GRN numbers
const DUMMY_GRN_IDS = new Set([
  'GRN-2026-104','GRN-2026-105','GRN-2026-098','GRN-2026-089','GRN-2026-072'
]);
// Known seed vendor IDs
const DUMMY_VENDOR_IDS = new Set([
  'VND-001','VND-002','VND-003','VND-004','VND-005','VND-006','VND-007','VND-008'
]);
// Known seed employee, attendance, and advance IDs
const DUMMY_EMP_IDS = new Set([
  'EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', 'EMP-005', 'EMP-006'
]);
const DUMMY_ATT_IDS = new Set([
  'ATT-20260827-EMP001', 'ATT-20260827-EMP002', 'ATT-20260827-EMP003',
  'ATT-20260827-EMP004', 'ATT-20260827-EMP005'
]);
const DUMMY_ADV_IDS = new Set([
  'ADV-2026-001', 'ADV-2026-002'
]);

const DUMMY_KEYWORDS = ['Chocolate Bites', 'Aadi Chemtrade', 'ISS-176883652985', 'CON-BC-20260816-533'];

/**
 * Returns true if any id field of the item matches a known dummy seed ID or dummy keyword.
 */
function isDummyRecord(item) {
  if (!item || typeof item !== 'object') return false;
  try {
    const itemStr = JSON.stringify(item);
    if (DUMMY_KEYWORDS.some(kw => itemStr.includes(kw))) return true;
  } catch (e) {}
  const id = String(item.id || item.grnNo || item.itemCode || '');
  if (DUMMY_ORDER_IDS.has(id)) return true;
  if (DUMMY_PROD_IDS.has(id)) return true;
  if (DUMMY_INV_IDS.has(id)) return true;
  if (DUMMY_GRN_IDS.has(item.grnNo || '')) return true;
  if (DUMMY_VENDOR_IDS.has(id)) return true;
  if (DUMMY_EMP_IDS.has(id)) return true;
  if (DUMMY_ATT_IDS.has(id)) return true;
  if (DUMMY_ADV_IDS.has(id)) return true;
  if (item.employeeId && DUMMY_EMP_IDS.has(String(item.employeeId))) return true;
  // Also check orderId / jobId references
  if (item.orderId && DUMMY_ORDER_IDS.has(item.orderId)) return true;
  if (item.jobId && DUMMY_ORDER_IDS.has(item.jobId)) return true;
  return false;
}

/**
 * Strips dummy seed records from a data array by matching known IDs.
 */
function stripDummyRecords(arr, idFields = ['id', 'orderId', 'jobId']) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(item => !isDummyRecord(item));
}

/**
 * One-time boot cleanup: purges dummy IDs from ALL localStorage keys.
 * Runs synchronously before any React state initializes.
 */
// ============================================================================
// SAFE BOOT-TIME CLEANUP: Purge legacy mock development seeds only.
// Ensures user data, issued POs, adjustments, and operational caches are preserved.
// ============================================================================
(function purgeLegacyMockData() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const legacyMockKeys = [
    'dummy_data', 'mock_orders', 'seed_inventory', 'test_dummy_cylinders'
  ];
  for (const k of legacyMockKeys) {
    try { localStorage.removeItem(k); } catch (e) {}
  }
})();


// Immediately sanitize localStorage on boot
initSafeStorage();


function e2eStubUser() {
  if (import.meta.env.VITE_E2E_STUB_AUTH !== '1') return null;
  try {
    if (sessionStorage.getItem('samyak_e2e_signed_out') === '1') return null;
  } catch {
    /* session storage can be blocked */
  }
  return { id: 'e2e-admin', name: 'E2E Admin', email: 'e2e@samyakinternational.in', role: 'Admin' };
}

function routeFromHref(href) {
  try {
    const url = new URL(href, 'http://erp.local');
    const route = parseLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
    if (!route || route.tab === 'login') return null;
    if (!route.unknown && !route.tab) return null;
    return route;
  } catch {
    return null;
  }
}

export default function App() {
  const isSupaConfigured = isSupabaseConfigured();
  const [isSupaActive, setIsSupaActive] = useState(isSupaConfigured);

  // Database Connection Health State (Supabase PostgreSQL is sole source of truth)
  const [databaseStatus, setDatabaseStatus] = useState('checking'); // 'checking' | 'connected' | 'disconnected'
  const [databaseErrorMessage, setDatabaseErrorMessage] = useState(null);

  const runDatabaseHealthCheck = async () => {
    try {
      const res = await checkSupabaseConnection();
      if (res && res.connected) {
        setDatabaseStatus('connected');
        setDatabaseErrorMessage(null);
      } else {
        setDatabaseStatus('disconnected');
        setDatabaseErrorMessage(res?.message || res?.error || 'Supabase PostgreSQL database is unreachable. Read-only mode activated.');
      }
    } catch (err) {
      setDatabaseStatus('disconnected');
      setDatabaseErrorMessage(err.message || 'Database health check failed.');
    }
  };

  useEffect(() => {
    runDatabaseHealthCheck();
    const interval = setInterval(runDatabaseHealthCheck, 15000); // 15-second polling interval
    return () => clearInterval(interval);
  }, []);

  // Guard function to enforce active DB connection before any transactional write
  const requireDatabaseConnection = (actionName = 'perform this action') => {
    if (databaseStatus !== 'connected') {
      const msg = `Database connection is lost/disconnected. ERP is currently in Database Disconnected / Read-Only Mode. Cannot ${actionName}.`;
      alert(msg);
      throw new Error(msg);
    }
  };

  // Authentication & Active User Session State
  const [currentUser, setCurrentUser] = useState(() => e2eStubUser());
  const [sessionProfile, setSessionProfile] = useState(null);
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const passwordRecoveryRef = useRef(false);
  const recoveryHandledRef = useRef(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(e2eStubUser()));
  const [isAuthReady, setIsAuthReady] = useState(!isSupaConfigured);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Route & Navigation State
  const [routeInfo, setRouteInfo] = useState(() => getRouteFromUrl());
  const activeTab = routeInfo.tab;
  const urlParams = routeInfo.params || {};
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTabChange = (tabKey, params = {}) => {
    const href = pushSlugState(tabKey, params);
    let next = { tab: tabKey, params, section: params.section || null, unknown: false, canonical: href };
    if (href && typeof window !== 'undefined') {
      try {
        const url = new URL(href, window.location.origin);
        const parsed = parseLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
        if (parsed && !parsed.unknown) next = parsed;
      } catch {
        /* keep the requested tab */
      }
    }
    setRouteInfo(next);
    setIsMobileMenuOpen(false);
  };

  // Sync state when user uses browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setRouteInfo(getRouteFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('erp-slug-navigate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('erp-slug-navigate', handlePopState);
    };
  }, []);

  // Sync URL path with auth state and deep links.
  // Recovery hashes and /reset-password stay put so the email link can finish.
  // A signed-out visit stores the page and returns there after sign-in.
  useEffect(() => {
    if (!isAuthReady || typeof window === 'undefined') return;
    const loc = window.location;
    if (!recoveryHandledRef.current && isRecoveryLocation(loc)) {
      passwordRecoveryRef.current = true;
      setMustSetPassword(true);
      return;
    }
    if (!isAuthenticated || !currentUser) {
      if (loc.pathname !== '/login' && !loc.pathname.startsWith('/login/')) {
        rememberReturnTo(loc.pathname + loc.search + loc.hash);
        window.history.replaceState({ tab: 'login' }, '', '/login');
      }
      return;
    }
    if (activeTab === 'login' || loc.pathname === '/login' || loc.pathname.startsWith('/login/') || loc.pathname === '/reset-password') {
      const saved = consumeReturnTo();
      const restored = saved ? routeFromHref(saved) : null;
      if (restored?.unknown) {
        window.history.replaceState({ unknown: true }, '', saved);
        setRouteInfo(restored);
        return;
      }
      if (restored && isTabAllowed(restored.tab)) {
        handleTabChange(restored.tab, restored.params || {});
        return;
      }
      const defaultTab = currentUser?.role === 'Printing Operator' ? 'printing_scheduler' : 'dashboard';
      handleTabChange(defaultTab);
      return;
    }
    const route = getRouteFromUrl();
    if (!route.unknown) pushSlugState(activeTab, urlParams, true);
  }, [isAuthenticated, currentUser, isAuthReady, activeTab]);

  // Supabase is the store of record. Screens stay on the loader until that fetch finishes.
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isDataFetched, setIsDataFetched] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const deletedOrderIdsRef = useRef(new Set());
  const ordersFetchVersion = useRef(0);

  const [vendors, setVendors] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [grns, setGrns] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobDataSheets, setJobDataSheets] = useState([]);
  const [cylinders, setCylinders] = useState([]);
  const [productionRecords, setProductionRecords] = useState([]);
  const [inventoryRolls, setInventoryRolls] = useState([]);
  const [dispatchShipments, setDispatchShipments] = useState([]);
  const [deliveryChallans, setDeliveryChallans] = useState([]);
  const [certificateOfAnalyses, setCertificateOfAnalyses] = useState([]);
  const [machines, setMachines] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [pressQueueOrder, setPressQueueOrder] = useState([]);
  const [pressMachineAssignments, setPressMachineAssignments] = useState({});
  const [pressActiveRunningJob, setPressActiveRunningJob] = useState(null);
  const [clients, setClients] = useState([]);
  const [jobMasters, setJobMasters] = useState([]);
  const [inks, setInks] = useState([]);
  const [selectedJobMasterForPunch, setSelectedJobMasterForPunch] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(() => {
    const cached = safeLocalStorageGet('samyak_cache_role_permissions', null);
    if (cached && typeof cached === 'object' && !Array.isArray(cached) && Object.keys(cached).length > 0) {
      return cached;
    }
    return DEFAULT_ROLE_PERMISSIONS;
  });
  const [indents, setIndents] = useState([]);
  const [machineIssues, setMachineIssues] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [storeIssueTransactions, setStoreIssueTransactions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeAttendance, setEmployeeAttendance] = useState([]);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [sfgGoods, setSfgGoods] = useState([]);
  const [pelletInwards, setPelletInwards] = useState([]);
  const [pelletConsumptions, setPelletConsumptions] = useState([]);
  const [pelletLoadError, setPelletLoadError] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  const handleSavePurchaseOrder = async (po) => {
    requireDatabaseConnection('save purchase order');
    const saved = await savePurchaseOrderToSupabase(po);
    setPurchaseOrders(prev => {
      const currentList = Array.isArray(prev) ? prev : [];
      return [saved, ...currentList.filter(p => p && p.poNumber !== saved.poNumber && p.id !== saved.id)];
    });
    return saved;
  };

  const handleUpdatePurchaseOrder = async (po) => {
    requireDatabaseConnection('update purchase order');
    const updated = await savePurchaseOrderToSupabase(po);
    setPurchaseOrders(prev => {
      const currentList = Array.isArray(prev) ? prev : [];
      return currentList.map(p => (p && (p.poNumber === updated.poNumber || p.id === updated.id)) ? updated : p);
    });
    return updated;
  };

  const handleDeletePurchaseOrder = async (poId) => {
    requireDatabaseConnection('delete purchase order');
    await deletePurchaseOrderFromSupabase(poId);
    setPurchaseOrders(prev => {
      const currentList = Array.isArray(prev) ? prev : [];
      return currentList.filter(p => p && p.id !== poId && p.poNumber !== poId);
    });
  };

  const handleAllocatePelletGrnNumber = async () => {
    const prefix = getDocumentPrefixes().grnPrefix || 'SIL/GRN/26-27/';
    return allocatePelletGrnNumber(prefix);
  };

  const handleSavePelletInward = async (item) => {
    if (!item) return;
    const inventoryItem = findPelletInventoryItem(inventory);
    const cleanItem = {
      ...item,
      grnPrefix: getDocumentPrefixes().grnPrefix || 'SIL/GRN/26-27/',
      status: item.status || 'Pending QC',
      qcStatus: item.qcStatus || item.status || 'Pending QC'
    };
    let companionGrn;
    try {
      companionGrn = buildPelletCompanionGrn(cleanItem, inventoryItem);
    } catch (e) {
      alert(e.message);
      throw e;
    }

    try {
      const saved = await savePelletInwardWithGrn({ ...cleanItem, companionGrn });
      const savedPellet = saved?.pellet || { ...cleanItem, grnNo: companionGrn.grnNo };
      const savedGrn = sanitizeGRN(saved?.grn || companionGrn);
      setPelletInwards(prev => [savedPellet, ...(prev || []).filter(i => String(i.id) !== String(savedPellet.id))]);
      setGrns(prev => [savedGrn, ...(prev || []).filter(g => String(g.id) !== String(savedGrn.id) && String(g.grnNo) !== String(savedGrn.grnNo))]);
      logAudit('Save Pellet Inward', 'Pellet Fuel Stock Management', `GRN ${savedPellet.grnNo} - Inwarded ${savedPellet.inwardQtyKg} kg (Submitted to QC Approval Lab)`, savedPellet.id);
      return savedPellet;
    } catch (e) {
      console.error("Failed to save pellet inward to Supabase:", e);
      alert(`Pellet inward was not saved: ${e.message}`);
      throw e;
    }
  };

  const handleDeletePelletInward = async (id) => {
    const targetItem = (pelletInwards || []).find(i => String(i.id) === String(id));
    try {
      await deletePelletInwardFromSupabase(id);
      setPelletInwards(prev => prev.filter(i => String(i.id) !== String(id)));
      if (targetItem && targetItem.grnNo) {
        await deleteGRNFromSupabase(id || targetItem.grnNo);
        setGrns(prev => prev.filter(g => g.grnNo !== targetItem.grnNo && String(g.id) !== String(id)));
      }
      logAudit('Delete Pellet Inward', 'Pellet Fuel Stock Management', `Deleted Pellet GRN record ${id}`, id);
    } catch (e) {
      console.error("Failed to delete pellet inward from Supabase:", e);
      alert(`Pellet inward was not deleted: ${e.message}`);
    }
  };

  const handleSavePelletConsumption = async (item) => {
    try {
      await savePelletConsumptionToSupabase(item);
      setPelletConsumptions(prev => [item, ...prev.filter(i => String(i.id) !== String(item.id))]);
      logAudit('Save Pellet Consumption', 'Pellet Fuel Stock Management', `Recorded ${item.consumedQtyKg} kg boiler consumption on ${item.consumptionDate}`, item.id);
    } catch (e) {
      console.error("Failed to save pellet consumption to Supabase:", e);
      alert(`Pellet consumption was not saved: ${e.message}`);
      throw e;
    }
  };

  const handleDeletePelletConsumption = async (id) => {
    try {
      await deletePelletConsumptionFromSupabase(id);
      setPelletConsumptions(prev => prev.filter(i => String(i.id) !== String(id)));
      logAudit('Delete Pellet Consumption', 'Pellet Fuel Stock Management', `Deleted Pellet consumption record ${id}`, id);
    } catch (e) {
      console.error("Failed to delete pellet consumption from Supabase:", e);
      alert(`Pellet consumption was not deleted: ${e.message}`);
    }
  };


  const logAudit = async (actionType, moduleName, details, targetId = null) => {
    const entry = createAuditEntry(currentUser, actionType, moduleName, details, targetId);
    try {
      await saveAuditLogToSupabase(entry);
      setAuditLogs(prev => pruneOldAuditLogs([entry, ...prev]));
    } catch (e) {
      console.error("Audit log was not saved:", e);
      alert(`The change was kept, but the audit log was not saved: ${describeSaveError(e)}`);
    }
  };

  const activeUsersList = useMemo(() => {
    const list = (users || []).filter(u => u && u.id && !u.id.startsWith('USR-SETTING-'));
    const map = new Map();
    list.forEach(u => {
      if (!u || (!u.id && !u.email)) return;
      const emailKey = (u.email || '').toLowerCase().trim();
      const key = emailKey || u.id;
      if (!map.has(key)) {
        map.set(key, u);
      } else {
        const existing = map.get(key);
        const isExistingUuid = existing.id && existing.id.length > 20;
        const isNewUuid = u.id && u.id.length > 20;
        if (isNewUuid && !isExistingUuid) {
          map.set(key, u);
        }
      }
    });
    return Array.from(map.values());
  }, [users]);

  const activeUserOptions = useMemo(() => {
    const list = [...activeUsersList];
    if (currentUser?.id && !list.some(u => String(u.id) === String(currentUser.id))) {
      list.unshift(currentUser);
    }
    return list.map(u => ({
      value: String(u.id),
      label: activeUserLabel(u),
    }));
  }, [activeUsersList, currentUser]);

  const isUserTabAllowed = (user, tabKey) => {
    if (!user || !tabKey) return false;
    if (user.role === 'Admin') return true;
    if (tabKey === 'user_management' || tabKey === 'audit_logs') return false;
    const rolePerm = rolePermissions[user.role];
    if (!rolePerm) return false;
    return rolePerm[tabKey] === true;
  };

  const isTabAllowed = (tabKey) => isUserTabAllowed(currentUser, tabKey);

  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // Global Keyboard Shortcut: Alt+B or Ctrl+B to trigger Universal Barcode Scanner
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.altKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsBarcodeScannerOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reactive listener for Supabase credential updates
  useEffect(() => {
    const handleCredentialsChanged = (e) => {
      const isConfigured = isSupabaseConfigured();
      setIsSupaActive(isConfigured);
    };

    window.addEventListener('supabase-credentials-changed', handleCredentialsChanged);
    return () => window.removeEventListener('supabase-credentials-changed', handleCredentialsChanged);
  }, []);

  // IndexedDB hydration: DO NOT hydrate orders from IndexedDB.
  useEffect(() => {
    let isMounted = true;
    async function hydrateIdbAssets() {
      try {
        // IndexedDB is retained for non-order binary/artwork assets if needed
      } catch (err) {
        console.warn('Idb hydration error:', err);
      }
    }
    hydrateIdbAssets();
    return () => { isMounted = false; };
  }, []);


  // Fetch all tables from Supabase on initial load or credential changes
  useEffect(() => {
    if (!isAuthReady) return;
    if (!isSupaActive || !isAuthenticated) {
      setIsDataLoading(false);
      setOrdersLoading(false);
      setIsDataFetched(true);
      return;
    }

    let isMounted = true;
    async function loadSupabaseData() {
      setIsDataLoading(true);
      setIsDataFetched(false);

      // Failsafe timer: Ensure UI unblocks gracefully within 15 seconds even on poor network
      const failsafeTimer = setTimeout(() => {
        if (isMounted) {
          console.warn('[Supabase Load Failsafe] 15s elapsed, unlocking UI.');
          setIsDataLoading(false);
          setOrdersLoading(false);
          setIsDataFetched(true);
        }
      }, 15000);

      const fetchWithTimeout = (promise, ms = 12000) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), ms))
        ]);
      };

      const fetchSafe = async (fn, label, ms = 12000) => {
        try {
          const res = await fetchWithTimeout(fn(), ms);
          return res;
        } catch (e) {
          console.warn(`[Supabase Load Notice] ${label}:`, e?.message || e);
          return null;
        }
      };

      const fetchPelletBook = async (fn) => {
        try {
          const data = await fetchWithTimeout(fn(), 12000);
          return { data, error: null };
        } catch (e) {
          console.warn('[Supabase Load Notice] Pellet fuel:', e?.message || e);
          return { data: null, error: e };
        }
      };

      try {
        try {
          const localSnapshot = snapshotBrowserStorage(window.localStorage);
          const settingsSnapshot = await fetchAllSystemSettings().catch(() => ({}));
          await importLegacyBusinessRecords({
            supabase,
            local: localSnapshot,
            settings: settingsSnapshot || {}
          });
          clearImportedLocalKeys(window.localStorage, localKeysToClear(localSnapshot));
        } catch (importErr) {
          console.error('[Legacy import] Browser copies were kept because the upload failed:', importErr);
          alert(`Some records saved only in this browser could not be uploaded. They were left on this device. ${describeSaveError(importErr)}`);
        }

        const roleName = currentUser?.role || sessionProfile?.role || '';
        let accessMatrix = rolePermissions;
        const loadedMatrix = await fetchSafe(fetchRolePermissionsFromSupabase, 'Role Permissions');
        if (loadedMatrix && typeof loadedMatrix === 'object' && !Array.isArray(loadedMatrix) && Object.keys(loadedMatrix).length > 0) {
          accessMatrix = loadedMatrix;
          setRolePermissions(loadedMatrix);
          safeLocalStorageSet('samyak_cache_role_permissions', loadedMatrix);
        }
        const allow = (moduleKey) => roleHasModule(accessMatrix, roleName, moduleKey);
        const need = (...keys) => roleNeedsAny(accessMatrix, roleName, keys.length === 1 && Array.isArray(keys[0]) ? keys[0] : keys);
        const hrAllowed = canReadPayroll(roleName);
        const remember = (moduleKey, storageKey, value) => {
          if (allow(moduleKey)) safeLocalStorageSet(storageKey, value);
          else {
            try { localStorage.removeItem(storageKey); } catch (e) {}
          }
        };
        cachesToDrop(accessMatrix, roleName).forEach((key) => {
          try { localStorage.removeItem(key); } catch (e) {}
        });
        if (!hrAllowed && isMounted) {
          setEmployees([]);
          setEmployeeAttendance([]);
          setSalaryAdvances([]);
          setSalaryPayments([]);
        }
        if (roleName !== 'Admin' && isMounted) setAuditLogs([]);

        const currentOrdersVersion = ++ordersFetchVersion.current;
        setOrdersLoading(true);
        setOrdersError(null);

        // ====================================================================
        // STAGE 1: CORE OPERATIONAL ESSENTIALS (Priority 1)
        // Fetches orders, jobs, inventory, cylinders, partners, and schedules.
        // Once completed, unblocks the UI so users experience near-instant load.
        // ====================================================================
        console.log('[Supabase Load] Stage 1: Loading core operational essentials...');
        const [
          supaOrders,
          supaJobMasters,
          supaInv,
          supaCyls,
          supaVendors,
          supaClients,
          supaMachines,
          supaSchedules
        ] = await Promise.all([
          need(BOOT_NEEDS.orders)
            ? fetchWithTimeout(fetchOrders(), 12000).catch(err => {
              console.error('[ORDERS][FETCH] Failed to load from Supabase:', err);
              return null;
            })
            : Promise.resolve(null),
          need(BOOT_NEEDS.jobMasters) ? fetchSafe(fetchJobMasters, 'Job Masters') : Promise.resolve(null),
          need(BOOT_NEEDS.inventory) ? fetchSafe(fetchInventory, 'Inventory') : Promise.resolve(null),
          need(BOOT_NEEDS.cylinders) ? fetchSafe(fetchCylinders, 'Cylinders') : Promise.resolve(null),
          need(BOOT_NEEDS.vendors) ? fetchSafe(fetchVendors, 'Vendors') : Promise.resolve(null),
          need(BOOT_NEEDS.clients) ? fetchSafe(fetchClients, 'Clients') : Promise.resolve(null),
          need(BOOT_NEEDS.machines) ? fetchSafe(fetchPrintingMachines, 'Printing Machines') : Promise.resolve(null),
          need(BOOT_NEEDS.schedules) ? fetchSafe(fetchProductionSchedules, 'Production Schedules') : Promise.resolve(null)
        ]);

        if (!isMounted) return;

        // Hydrate Orders
        if (Array.isArray(supaOrders)) {
          const cleanOrders = stripDummyRecords(supaOrders).filter(
            o => o && o.id && !deletedOrderIdsRef.current.has(o.id)
          );
          setOrders(cleanOrders);
          remember('orders', 'samyak_cache_orders', cleanOrders);

          const runningInDb = cleanOrders.find(o => 
            (o.status === 'In Production' || o.printingStatus === 'In Production') &&
            o.printingStartTime &&
            !o.printingEndTime &&
            !o.isPrintingCompleted
          );
          if (runningInDb) setPressActiveRunningJob(runningInDb);

          supaOrders.filter(isDummyRecord).forEach(d => deleteOrderFromSupabase(d.id).catch(console.warn));
        }
        setOrdersLoading(false);

        // Hydrate Job Masters
        if (Array.isArray(supaJobMasters)) {
          const cleanJM = stripDummyRecords(supaJobMasters);
          setJobMasters(cleanJM);
          remember('job_masters', 'samyak_cache_job_masters', cleanJM);
          supaJobMasters.filter(isDummyRecord).forEach(d => deleteJobMasterFromSupabase(d.id).catch(console.warn));
        }

        // Hydrate Inventory
        if (Array.isArray(supaInv)) {
          const cleanInv = stripDummyRecords(supaInv).map(sanitizeInventoryItem);
          setInventory(cleanInv);
          remember('inventory', 'samyak_cache_inventory', cleanInv);
          cleanInv.forEach(item => {
            if (item && item.itemName && (item.itemName.includes('|||') || item.itemName.startsWith('{'))) {
              saveInventoryItemToSupabase(sanitizeInventoryItem(item)).catch(console.warn);
            }
          });
          supaInv.filter(isDummyRecord).forEach(d => deleteInventoryItemFromSupabase(d.id).catch(console.warn));
        }

        // Hydrate Cylinders
        if (Array.isArray(supaCyls)) {
          const cleanCyls = stripDummyRecords(supaCyls);
          setCylinders(cleanCyls);
          remember('cylinders', 'samyak_cache_cylinders', cleanCyls);
          supaCyls.filter(isDummyRecord).forEach(d => deleteCylinderFromSupabase(d.id).catch(console.warn));
        }

        // Hydrate Vendors
        if (Array.isArray(supaVendors)) {
          const cleanVendors = stripDummyRecords(supaVendors);
          setVendors(cleanVendors);
          remember('vendors', 'samyak_cache_vendors', cleanVendors);
          supaVendors.filter(isDummyRecord).forEach(d => deleteVendorFromSupabase(d.id).catch(console.warn));
        }

        // Hydrate Clients
        if (Array.isArray(supaClients)) {
          const cleanClients = stripDummyRecords(supaClients);
          setClients(cleanClients);
          remember('clients', 'samyak_cache_clients', cleanClients);
          supaClients.filter(isDummyRecord).forEach(d => deleteClientFromSupabase(d.id).catch(console.warn));
        }

        // Hydrate Machines
        if (Array.isArray(supaMachines)) {
          const cleanMachines = stripDummyRecords(supaMachines);
          setMachines(cleanMachines);
          remember('printing_scheduler', 'samyak_cache_printing_machines', cleanMachines);
        }

        // Hydrate Schedules
        if (Array.isArray(supaSchedules)) {
          const cleanSchedules = stripDummyRecords(supaSchedules);
          setSchedules(cleanSchedules);
          remember('printing_scheduler', 'samyak_cache_production_schedules', cleanSchedules);
          supaSchedules.filter(isDummyRecord).forEach(d => deleteProductionScheduleFromSupabase(d.id).catch(console.warn));
        }

        // UNBLOCK UI: User can now interact with core views while background stages finish
        setIsDataLoading(false);
        setIsDataFetched(true);

        // ====================================================================
        // STAGE 2: SECONDARY OPERATIONAL RECORDS (Priority 2)
        // Loads records, GRNs, rolls, shipments, quality certificates, SFG & pellets
        // ====================================================================
        console.log('[Supabase Load] Stage 2: Loading secondary records & supply-chain...');
        const [
          supaGRNs,
          supaProd,
          supaUsers,
          supaSheets,
          supaRolls,
          supaShipments,
          supaInks,
          supaSFG,
          supaDCs,
          supaCoAs,
          supaPelletInwards,
          supaPelletConsumptions,
          supaPOs
        ] = await Promise.all([
          need(BOOT_NEEDS.grns) ? fetchSafe(fetchGRNs, 'GRNs') : Promise.resolve(null),
          need(BOOT_NEEDS.productionRecords) ? fetchSafe(fetchProductionRecords, 'Production Records') : Promise.resolve(null),
          fetchSafe(fetchUsers, 'Users'),
          need(BOOT_NEEDS.datasheets) ? fetchSafe(fetchJobDataSheets, 'Job Data Sheets') : Promise.resolve(null),
          need(BOOT_NEEDS.rolls) ? fetchSafe(fetchInventoryRolls, 'Inventory Rolls') : Promise.resolve(null),
          need(BOOT_NEEDS.shipments) ? fetchSafe(fetchDispatchShipments, 'Dispatch Shipments') : Promise.resolve(null),
          need(BOOT_NEEDS.inks) ? fetchSafe(fetchInks, 'Inks') : Promise.resolve(null),
          need(BOOT_NEEDS.sfg) ? fetchSafe(fetchSFGGoodsFromSupabase, 'SFG Goods') : Promise.resolve(null),
          need(BOOT_NEEDS.challans) ? fetchSafe(fetchDeliveryChallansFromSupabase, 'Delivery Challans') : Promise.resolve(null),
          need(BOOT_NEEDS.coas) ? fetchSafe(fetchCertificatesOfAnalysisFromSupabase, 'Certificates of Analysis') : Promise.resolve(null),
          need(BOOT_NEEDS.pellets) ? fetchPelletBook(fetchPelletInwardsFromSupabase) : Promise.resolve({ data: null, error: null }),
          need(BOOT_NEEDS.pellets) ? fetchPelletBook(fetchPelletConsumptionsFromSupabase) : Promise.resolve({ data: null, error: null }),
          need(BOOT_NEEDS.purchaseOrders) ? fetchSafe(fetchPurchaseOrders, 'Purchase Orders') : Promise.resolve(null)
        ]);

        if (!isMounted) return;

        if (Array.isArray(supaGRNs)) {
          const cleanGRNs = stripDummyRecords(supaGRNs).map(sanitizeGRN);
          setGrns(cleanGRNs);
          remember('inventory', 'samyak_cache_grns', cleanGRNs);
          supaGRNs.filter(isDummyRecord).forEach(d => deleteGRNFromSupabase(d.id || d.grnNo).catch(console.warn));
        }

        if (Array.isArray(supaProd)) {
          const cleanProd = stripDummyRecords(supaProd);
          setProductionRecords(cleanProd);
          remember('production_records', 'samyak_cache_production_records', cleanProd);
          supaProd.filter(isDummyRecord).forEach(d => deleteProductionRecordFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaUsers) && supaUsers.length > 0) {
          setUsers(supaUsers);
          safeLocalStorageSet('samyak_cache_users', supaUsers);
        }

        if (Array.isArray(supaSheets)) {
          const cleanSheets = stripDummyRecords(supaSheets);
          setJobDataSheets(cleanSheets);
          remember('job_masters', 'samyak_cache_job_datasheets', cleanSheets);
          supaSheets.filter(isDummyRecord).forEach(d => deleteJobDataSheetFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaRolls)) {
          const cleanRolls = stripDummyRecords(supaRolls);
          setInventoryRolls(cleanRolls);
          remember('inventory', 'samyak_cache_inventory_rolls', cleanRolls);
        }

        if (Array.isArray(supaShipments)) {
          const cleanShip = stripDummyRecords(supaShipments);
          setDispatchShipments(cleanShip);
          remember('dispatch', 'samyak_cache_dispatch_shipments', cleanShip);
        }

        if (Array.isArray(supaInks)) {
          setInks(supaInks);
          remember('ink_management', 'samyak_cache_inks', supaInks);
        }

        if (Array.isArray(supaSFG)) {
          const cleanSFG = stripDummyRecords(supaSFG);
          setSfgGoods(cleanSFG);
          remember('sfg_store', 'samyak_cache_sfg_goods', cleanSFG);
        }

        if (Array.isArray(supaDCs)) {
          const cleanDCs = stripDummyRecords(supaDCs);
          setDeliveryChallans(cleanDCs);
          remember('dispatch', 'samyak_cache_delivery_challans', cleanDCs);
        }

        if (Array.isArray(supaCoAs)) {
          const cleanCoAs = stripDummyRecords(supaCoAs);
          setCertificateOfAnalyses(cleanCoAs);
          remember('production_records', 'samyak_cache_certificate_of_analyses', cleanCoAs);
        }

        const pelletErrors = [supaPelletInwards?.error, supaPelletConsumptions?.error].filter(Boolean);
        if (pelletErrors.length > 0) {
          setPelletLoadError(pelletErrors.map(error => error.message || String(error)).join(' '));
        } else {
          setPelletLoadError('');
          if (Array.isArray(supaPelletInwards?.data)) {
            setPelletInwards(supaPelletInwards.data);
            remember('pellet_fuel', 'samyak_cache_pellet_inwards', supaPelletInwards.data);
          }
          if (Array.isArray(supaPelletConsumptions?.data)) {
            setPelletConsumptions(supaPelletConsumptions.data);
            remember('pellet_fuel', 'samyak_cache_pellet_consumptions', supaPelletConsumptions.data);
          }
        }

        if (Array.isArray(supaPOs)) {
          const cleanPOs = stripDummyRecords(supaPOs).map(sanitizePurchaseOrder).filter(Boolean);
          setPurchaseOrders(cleanPOs);
          remember('purchase_orders', 'samyak_cache_purchase_orders', cleanPOs);
        }

        // ====================================================================
        // STAGE 3: HR, PAYROLL, AUDIT & ALL SYSTEM SETTINGS (Batch-loaded)
        // Uses batch `fetchAllSystemSettings()` in a single query
        // ====================================================================
        console.log('[Supabase Load] Stage 3: Loading HR, compliance & batch system settings...');
        const [
          supaEmployees,
          supaAttendance,
          supaAdvances,
          supaPayments,
          supaRolePerms,
          supaAuditLogs,
          allSettings
        ] = await Promise.all([
          hrAllowed ? fetchSafe(fetchEmployeesFromSupabase, 'Employees') : Promise.resolve(null),
          hrAllowed ? fetchSafe(fetchEmployeeAttendanceFromSupabase, 'Attendance') : Promise.resolve(null),
          hrAllowed ? fetchSafe(fetchSalaryAdvancesFromSupabase, 'Salary Advances') : Promise.resolve(null),
          hrAllowed ? fetchSafe(fetchSalaryPaymentsFromSupabase, 'Salary Payments') : Promise.resolve(null),
          Promise.resolve(accessMatrix),
          roleName === 'Admin' ? fetchSafe(fetchAuditLogsFromSupabase, 'Audit Logs') : Promise.resolve(null),
          fetchSafe(fetchAllSystemSettings, 'All System Settings')
        ]);

        if (!isMounted) return;

        if (!hrAllowed) {
          clearHrCache();
        } else if (Array.isArray(supaEmployees)) {
          const cleanEmps = stripDummyRecords(supaEmployees);
          setEmployees(cleanEmps);
          safeLocalStorageSet('samyak_cache_employees', cleanEmps);
          supaEmployees.filter(isDummyRecord).forEach(d => deleteEmployeeFromSupabase(d.id).catch(console.warn));
        }

        if (hrAllowed && Array.isArray(supaAttendance)) {
          const cleanAtt = stripDummyRecords(supaAttendance);
          setEmployeeAttendance(prev => {
            const map = new Map();
            cleanAtt.forEach(a => { if (a && a.id && !isDummyRecord(a)) map.set(a.id, a); });
            (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
            const merged = Array.from(map.values());
            safeLocalStorageSet('samyak_cache_employee_attendance', merged);
            return merged;
          });
        }

        if (hrAllowed && Array.isArray(supaAdvances)) {
          const cleanAdv = stripDummyRecords(supaAdvances);
          setSalaryAdvances(prev => {
            const map = new Map();
            cleanAdv.forEach(adv => { if (adv && adv.id && !isDummyRecord(adv)) map.set(adv.id, adv); });
            (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
            const merged = Array.from(map.values());
            safeLocalStorageSet('samyak_cache_salary_advances', merged);
            return merged;
          });
        }

        if (hrAllowed && Array.isArray(supaPayments)) {
          const cleanPay = stripDummyRecords(supaPayments);
          setSalaryPayments(prev => {
            const map = new Map();
            cleanPay.forEach(pay => { if (pay && pay.id && !isDummyRecord(pay)) map.set(pay.id, pay); });
            (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
            const merged = Array.from(map.values());
            safeLocalStorageSet('samyak_cache_salary_payments', merged);
            return merged;
          });
        }

        if (supaRolePerms && typeof supaRolePerms === 'object' && Object.keys(supaRolePerms).length > 0) {
          setRolePermissions(supaRolePerms);
          safeLocalStorageSet('samyak_cache_role_permissions', supaRolePerms);
        }

        if (roleName === 'Admin' && Array.isArray(supaAuditLogs)) {
          const pruned = pruneOldAuditLogs(supaAuditLogs);
          setAuditLogs(pruned);
          safeLocalStorageSet('samyak_cache_audit_logs', pruned);
        } else if (roleName !== 'Admin') {
          try {
            localStorage.removeItem('samyak_cache_audit_logs');
            localStorage.removeItem('samyak_erp_audit_logs');
          } catch (e) {}
        }

        // Process batch settings returned from single query
        if (allSettings && typeof allSettings === 'object') {
          if (allSettings.doc_prefixes) safeLocalStorageSet('samyak_doc_prefixes', allSettings.doc_prefixes);
          if (allSettings.doc_terms) safeLocalStorageSet('samyak_doc_terms', allSettings.doc_terms);
          if (allSettings.company_logo) safeLocalStorageSet('samyak_company_logo', allSettings.company_logo);
          if (allSettings.auth_signature) safeLocalStorageSet('samyak_authorised_signature', allSettings.auth_signature);
          if (allSettings.material_cost_settings) {
            safeLocalStorageSet('samyak_material_cost_settings', typeof allSettings.material_cost_settings === 'string' ? allSettings.material_cost_settings : JSON.stringify(allSettings.material_cost_settings));
          }
          if (allSettings.processing_rates) {
            safeLocalStorageSet('samyak_processing_rates', typeof allSettings.processing_rates === 'string' ? allSettings.processing_rates : JSON.stringify(allSettings.processing_rates));
          }
          if (allSettings.inventory_ageing_settings) {
            safeLocalStorageSet('samyak_inventory_ageing_settings', typeof allSettings.inventory_ageing_settings === 'string' ? allSettings.inventory_ageing_settings : JSON.stringify(allSettings.inventory_ageing_settings));
          }
          if (allSettings.storage_bays_master && Array.isArray(allSettings.storage_bays_master)) {
            safeLocalStorageSet('samyak_storage_bays_master', JSON.stringify(allSettings.storage_bays_master));
          }
          if (allSettings.film_substrates_master && Array.isArray(allSettings.film_substrates_master)) {
            safeLocalStorageSet('samyak_film_substrates_master', JSON.stringify(allSettings.film_substrates_master));
          }
          applyRemoteCompanyProfile(allSettings.company_profile);

        }

        const [indentRows, issueRows, consumableRows, storeRows, pressBoard] = await Promise.all([
          need(BOOT_NEEDS.indents) ? fetchSafe(() => fetchPayloadRecords(supabase, 'material_indents'), 'Material indents') : Promise.resolve(null),
          need(BOOT_NEEDS.indents) ? fetchSafe(() => fetchPayloadRecords(supabase, 'machine_issues'), 'Machine issues') : Promise.resolve(null),
          need(BOOT_NEEDS.indents) ? fetchSafe(() => fetchPayloadRecords(supabase, 'consumables'), 'Consumables') : Promise.resolve(null),
          need(BOOT_NEEDS.indents) ? fetchSafe(() => fetchPayloadRecords(supabase, 'store_issue_transactions'), 'Store issues') : Promise.resolve(null),
          need(BOOT_NEEDS.schedules) ? fetchSafe(() => fetchPressBoard(supabase), 'Press board') : Promise.resolve(null)
        ]);
        if (Array.isArray(indentRows)) setIndents(indentRows);
        if (Array.isArray(issueRows)) setMachineIssues(issueRows);
        if (Array.isArray(consumableRows)) setConsumables(consumableRows);
        if (Array.isArray(storeRows)) setStoreIssueTransactions(stripDummyRecords(storeRows));
        if (pressBoard) {
          setPressQueueOrder(Array.isArray(pressBoard.queueOrder) ? pressBoard.queueOrder : []);
          setPressMachineAssignments(pressBoard.machineAssignments || {});
          setPressActiveRunningJob(pressBoard.activeRunningJob || null);
        }
        console.log('[Supabase Load] All 3 stages completed successfully!');
      } catch (err) {
        console.error('[Supabase Load Error]', err);
      } finally {
        clearTimeout(failsafeTimer);
        if (isMounted) {
          setIsDataLoading(false);
          setOrdersLoading(false);
          setIsDataFetched(true);
        }
      }
    }

    loadSupabaseData();
    return () => { isMounted = false; };
  }, [isSupaActive, isAuthReady, isAuthenticated]);


  // ============================================================================
  // UNIFIED REALTIME & CROSS-TAB BROADCAST CHANNEL SYNC
  // Keeps multiple tabs and remote client sessions 100% synchronized in real time
  // ============================================================================
  useEffect(() => {
    if (!isSupaActive || !isAuthReady || !isAuthenticated) return;

    let bc;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('samyak_erp_unified_sync');
        bc.onmessage = (event) => {
          const { table } = event.data || {};
          if (!table) return;
          console.log(`[Cross-Tab Broadcast] Received sync notice for: ${table}`);
          refreshEntity(table);
        };
      }
    } catch (e) {
      console.warn('[Cross-Tab Sync] BroadcastChannel init notice:', e);
    }

    // Expose global broadcaster helper
    window.__samyakBroadcastSync = (table) => {
      try {
        if (bc) bc.postMessage({ table, timestamp: Date.now() });
      } catch (e) {
        // ignore
      }
    };

    // Debounced refresh handler to prevent burst queries
    const debounceTimers = {};
    const refreshEntity = (table) => {
      if (debounceTimers[table]) clearTimeout(debounceTimers[table]);
      debounceTimers[table] = setTimeout(async () => {
        try {
          if (table === 'orders') {
            const data = await fetchOrders();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data).filter(o => o && o.id && !deletedOrderIdsRef.current.has(o.id));
              setOrders(clean);
              safeLocalStorageSet('samyak_cache_orders', clean);
            }
          } else if (table === 'inventory') {
            const data = await fetchInventory();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data).map(sanitizeInventoryItem);
              setInventory(clean);
              safeLocalStorageSet('samyak_cache_inventory', clean);
            }
          } else if (table === 'cylinders') {
            const data = await fetchCylinders();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setCylinders(clean);
              safeLocalStorageSet('samyak_cache_cylinders', clean);
            }
          } else if (table === 'production_records') {
            const data = await fetchProductionRecords();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setProductionRecords(clean);
              safeLocalStorageSet('samyak_cache_production_records', clean);
            }
          } else if (table === 'grns') {
            const data = await fetchGRNs();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data).map(sanitizeGRN);
              setGrns(clean);
              safeLocalStorageSet('samyak_cache_grns', clean);
            }
          } else if (table === 'job_masters') {
            const data = await fetchJobMasters();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setJobMasters(clean);
              safeLocalStorageSet('samyak_cache_job_masters', clean);
            }
          } else if (table === 'employees' && canReadPayroll(sessionProfile?.role || currentUser?.role)) {
            const data = await fetchEmployeesFromSupabase();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setEmployees(clean);
              safeLocalStorageSet('samyak_cache_employees', clean);
            }
          } else if (table === 'employee_attendance' && canReadPayroll(sessionProfile?.role || currentUser?.role)) {
            const data = await fetchEmployeeAttendanceFromSupabase();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setEmployeeAttendance(clean);
              safeLocalStorageSet('samyak_cache_employee_attendance', clean);
            }
          } else if (table === 'salary_advances' && canReadPayroll(sessionProfile?.role || currentUser?.role)) {
            const data = await fetchSalaryAdvancesFromSupabase();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setSalaryAdvances(clean);
              safeLocalStorageSet('samyak_cache_salary_advances', clean);
            }
          } else if (table === 'delivery_challans') {
            const data = await fetchDeliveryChallansFromSupabase();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data);
              setDeliveryChallans(clean);
              safeLocalStorageSet('samyak_cache_delivery_challans', clean);
            }
          } else if (table === 'purchase_orders') {
            const data = await fetchPurchaseOrders();
            if (Array.isArray(data)) {
              const clean = stripDummyRecords(data).map(sanitizePurchaseOrder).filter(Boolean);
              setPurchaseOrders(clean);
              safeLocalStorageSet('samyak_cache_purchase_orders', clean);
            }
          } else if (table === 'system_settings') {
            const settings = await fetchAllSystemSettings();
            if (settings && typeof settings === 'object') {
              if (settings.material_indents) setIndents(settings.material_indents);
              if (settings.machine_issues) setMachineIssues(settings.machine_issues);
              if (settings.consumables) setConsumables(settings.consumables);
              if (settings.store_issue_transactions) setStoreIssueTransactions(settings.store_issue_transactions);
              if (settings.doc_prefixes) safeLocalStorageSet('samyak_doc_prefixes', settings.doc_prefixes);
              if (settings.doc_terms) safeLocalStorageSet('samyak_doc_terms', settings.doc_terms);
              if (settings.material_cost_settings) {
                safeLocalStorageSet('samyak_material_cost_settings', typeof settings.material_cost_settings === 'string' ? settings.material_cost_settings : JSON.stringify(settings.material_cost_settings));
              }
              if (settings.processing_rates) {
                safeLocalStorageSet('samyak_processing_rates', typeof settings.processing_rates === 'string' ? settings.processing_rates : JSON.stringify(settings.processing_rates));
              }
              if (settings.inventory_ageing_settings) {
                safeLocalStorageSet('samyak_inventory_ageing_settings', typeof settings.inventory_ageing_settings === 'string' ? settings.inventory_ageing_settings : JSON.stringify(settings.inventory_ageing_settings));
              }
              if (settings.storage_bays_master && Array.isArray(settings.storage_bays_master)) {
                safeLocalStorageSet('samyak_storage_bays_master', JSON.stringify(settings.storage_bays_master));
              }
              applyRemoteCompanyProfile(settings.company_profile);
            }
          }
        } catch (err) {
          console.warn(`[Realtime Refresh Notice] ${table}:`, err?.message || err);
        }
      }, 350);
    };

    // Unified Supabase Realtime channel across core operational tables
    const channel = supabase
      .channel('public:erp_unified_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on orders (${payload?.eventType || 'SYNC'})`);
        refreshEntity('orders');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on inventory (${payload?.eventType || 'SYNC'})`);
        refreshEntity('inventory');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cylinders' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on cylinders (${payload?.eventType || 'SYNC'})`);
        refreshEntity('cylinders');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_records' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on production_records (${payload?.eventType || 'SYNC'})`);
        refreshEntity('production_records');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grns' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on grns (${payload?.eventType || 'SYNC'})`);
        refreshEntity('grns');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on purchase_orders (${payload?.eventType || 'SYNC'})`);
        refreshEntity('purchase_orders');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_masters' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on job_masters (${payload?.eventType || 'SYNC'})`);
        refreshEntity('job_masters');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_attendance' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on employee_attendance (${payload?.eventType || 'SYNC'})`);
        refreshEntity('employee_attendance');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on employees (${payload?.eventType || 'SYNC'})`);
        refreshEntity('employees');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_advances' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on salary_advances (${payload?.eventType || 'SYNC'})`);
        refreshEntity('salary_advances');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_challans' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on delivery_challans (${payload?.eventType || 'SYNC'})`);
        refreshEntity('delivery_challans');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, (payload) => {
        console.log(`⚡ [Realtime] Live update on system_settings (${payload?.eventType || 'SYNC'})`);
        refreshEntity('system_settings');
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('🟢 [Supabase Realtime] Connected to live replication channel (public:erp_unified_sync)');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('🔴 [Supabase Realtime] Channel subscription error:', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('🟡 [Supabase Realtime] Subscription timed out, attempting reconnection...');
        } else if (status === 'CLOSED') {
          console.log('⚪ [Supabase Realtime] Channel closed.');
        }
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (bc) bc.close();
      Object.values(debounceTimers).forEach(t => clearTimeout(t));
    };
  }, [isSupaActive, isAuthReady, isAuthenticated]);

  const handleSaveMachine = async (newMachine) => {
    requireDatabaseConnection('save printing machine');
    const typePrefixMap = {
      Rotogravure: 'PRINT', Flexographic: 'PRINT', Digital: 'PRINT',
      Laminator: 'LAM', Slitter: 'SLT', Pouching: 'PCH',
      Rewinder: 'RWD', Coating: 'CTG', Workshop: 'WRK', Store: 'STR', Lab: 'LAB'
    };
    const prefix = typePrefixMap[newMachine.type] || 'MISC';
    const machineWithId = {
      ...newMachine,
      id: newMachine.id || `MAC-${prefix}-${Date.now().toString(36).toUpperCase().slice(-4)}`
    };
    await savePrintingMachineToSupabase(machineWithId);
    setMachines(prev => [machineWithId, ...prev.filter(m => m.id !== machineWithId.id)]);
  };

  const handleUpdateMachine = async (updatedMachine) => {
    requireDatabaseConnection('update printing machine');
    await savePrintingMachineToSupabase(updatedMachine);
    setMachines(prev => prev.map(m => m.id === updatedMachine.id ? updatedMachine : m));
  };

  const handleDeleteMachine = async (machineId) => {
    requireDatabaseConnection('delete printing machine');
    await deletePrintingMachineFromSupabase(machineId);
    setMachines(prev => prev.filter(m => m.id !== machineId));
  };

  const handleSaveSchedule = async (newSchedule) => {
    requireDatabaseConnection('save production schedule');
    await saveProductionScheduleToSupabase(newSchedule);
    setSchedules(prev => {
      const idx = prev.findIndex(s => s.id === newSchedule.id || s.orderId === newSchedule.orderId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = newSchedule;
        return updated;
      }
      return [newSchedule, ...prev];
    });
  };

  const handleDeleteSchedule = async (scheduleId) => {
    requireDatabaseConnection('delete production schedule');
    await deleteProductionScheduleFromSupabase(scheduleId);
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
  };

  const handleReorderQueue = async (newQueueOrder) => {
    try {
      const next = await savePressBoard(supabase, { queueOrder: newQueueOrder });
      setPressQueueOrder(next.queueOrder);
    } catch (e) {
      alert(`The press queue was not saved: ${describeSaveError(e)}`);
      throw e;
    }
  };

  const handleMachineAssignmentsChange = async (newAssignments) => {
    try {
      const next = await savePressBoard(supabase, { machineAssignments: newAssignments });
      setPressMachineAssignments(next.machineAssignments);
    } catch (e) {
      alert(`Machine assignments were not saved: ${describeSaveError(e)}`);
      throw e;
    }
  };

  const handleActiveRunningJobChange = async (newRunningJob) => {
    try {
      const next = await savePressBoard(supabase, { activeRunningJob: newRunningJob });
      setPressActiveRunningJob(next.activeRunningJob);
    } catch (e) {
      alert(`The running job was not saved: ${describeSaveError(e)}`);
      throw e;
    }
  };

  const applyAuthenticatedProfile = (profile) => {
    setSessionProfile(profile);
    let nextUser = profile;
    if (profile?.role === 'Admin') {
      try {
        const preview = JSON.parse(sessionStorage.getItem('samyak_erp_ui_role_preview') || 'null');
        if (preview && preview.role && preview.email) nextUser = preview;
      } catch (e) {}
    }
    setCurrentUser(nextUser);
    setIsAuthenticated(true);
    setMustSetPassword(false);
  };

  // Session comes only from Supabase Auth. A saved browser profile is not a login.
  useEffect(() => {
    try { localStorage.removeItem('samyak_erp_current_user'); } catch (e) {}

    if (!isSupaActive) {
      const stub = e2eStubUser();
      setSessionProfile(stub);
      setCurrentUser(stub);
      setIsAuthenticated(Boolean(stub));
      setIsAuthReady(true);
      return;
    }

    let mounted = true;

    async function adoptSession(event) {
      if (event === 'PASSWORD_RECOVERY' || (typeof window !== 'undefined' && window.location.hash.includes('type=recovery'))) {
        passwordRecoveryRef.current = true;
      }
      if (passwordRecoveryRef.current) {
        setMustSetPassword(true);
        setIsAuthenticated(false);
        setIsAuthReady(true);
        return;
      }
      const profile = await fetchSessionProfile();
      if (!mounted) return;
      if (!profile || profile.pending || profile.inactive) {
        if (profile) await supabase.auth.signOut().catch(() => {});
        setSessionProfile(null);
        setCurrentUser(null);
        setIsAuthenticated(false);
        setIsAuthReady(true);
        return;
      }
      applyAuthenticatedProfile(profile);
      setIsAuthReady(true);
    }

    adoptSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem('samyak_erp_ui_role_preview'); } catch (e) {}
        setSessionProfile(null);
        setCurrentUser(null);
        setIsAuthenticated(false);
        setMustSetPassword(false);
        return;
      }
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        adoptSession(event);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [isSupaActive]);

  const handleLogin = (user) => {
    setIsSigningIn(true);
    logAudit('AUTH', 'User Management', `User ${user?.name || user?.email || 'User'} signed in to the system`, user?.id);
    applyAuthenticatedProfile(user);
    const saved = consumeReturnTo();
    const restored = saved ? routeFromHref(saved) : null;
    if (restored?.unknown && typeof window !== 'undefined') {
      window.history.replaceState({ unknown: true }, '', saved);
      setRouteInfo(restored);
      return;
    }
    if (restored && isUserTabAllowed(user, restored.tab)) {
      handleTabChange(restored.tab, restored.params || {});
      return;
    }
    if (activeTab && activeTab !== 'login' && isUserTabAllowed(user, activeTab)) {
      handleTabChange(activeTab, urlParams);
      return;
    }
    const targetTab = user?.role === 'Printing Operator' ? 'printing_scheduler' : 'dashboard';
    handleTabChange(targetTab);
  };

  const clearHrCache = () => {
    setEmployees([]);
    setEmployeeAttendance([]);
    setSalaryAdvances([]);
    setSalaryPayments([]);
    ['samyak_cache_employees', 'samyak_cache_employee_attendance', 'samyak_cache_salary_advances', 'samyak_cache_salary_payments'].forEach((key) => {
      try { localStorage.removeItem(key); } catch (e) {}
    });
  };

  const handleLogout = () => {
    logAudit('AUTH', 'User Management', `User ${currentUser?.name || currentUser?.email || 'User'} signed out of the system`, currentUser?.id);
    try {
      localStorage.removeItem('samyak_erp_current_user');
      sessionStorage.removeItem('samyak_erp_ui_role_preview');
    } catch (e) {}
    setSessionProfile(null);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setMustSetPassword(false);

    setOrders([]);
    setVendors([]);
    setInventory([]);
    setGrns([]);
    setUsers([]);
    setJobDataSheets([]);
    setCylinders([]);
    setProductionRecords([]);
    setInventoryRolls([]);
    setDispatchShipments([]);
    setDeliveryChallans([]);
    setCertificateOfAnalyses([]);
    setMachines([]);
    setSchedules([]);
    setClients([]);
    setJobMasters([]);
    setInks([]);
    setIndents([]);
    setMachineIssues([]);
    setConsumables([]);
    setStoreIssueTransactions([]);
    clearHrCache();
    setSfgGoods([]);

    recoveryHandledRef.current = false;
    passwordRecoveryRef.current = false;
    if (import.meta.env.VITE_E2E_STUB_AUTH === '1') {
      try { sessionStorage.setItem('samyak_e2e_signed_out', '1'); } catch { /* ignore */ }
    }
    if (typeof window !== 'undefined') {
      rememberReturnTo(window.location.pathname + window.location.search + window.location.hash);
      window.history.replaceState({ tab: 'login' }, '', '/login');
    }
    if (isSupaActive) {
      signOutUser().catch(console.warn);
    }
  };

  const isRecDue = isReconciliationDue();
  const delayedOrders = useMemo(() => (orders || []).filter(o => isOrderOverdue(o)), [orders]);
  const delayedOrdersCount = delayedOrders.length;
  const pendingQCGRNsCount = (grns || []).filter(g => g.status === 'Pending QC').length;
  const pendingProductionApprovalCount = (productionRecords || []).filter(r => r.status === 'Filled by Plant Manager').length;

  // Calculate average scrap % running throughout the jobs for dashboard
  const calculateScrapMetrics = (records) => {
    if (!records || records.length === 0) {
      return { currentMonthAvg: 0, prevMonthAvg: 0, momChange: 0, momDirection: 'neutral' };
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const curMonthRecords = [];
    const prevMonthRecords = [];

    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear = currentYear - 1;
    }

    records.forEach(r => {
      const dateStr = r.recordedAt || r.dateFilled;
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;

      const y = date.getFullYear();
      const m = date.getMonth();

      if (y === currentYear && m === currentMonth) {
        curMonthRecords.push(r);
      } else if (y === prevYear && m === prevMonth) {
        prevMonthRecords.push(r);
      }
    });

    const getAvgScrap = (recList) => {
      if (recList.length === 0) return 0;
      const sum = recList.reduce((acc, r) => {
        const grossKg = r.grossProductionKg || r.totalProductionQtyKg || ((r.netUsableKg || r.qtyDispatch || 0) + (r.totalWastageKg || r.totalScrapQtyKg || 0));
        const wastageKg = r.totalWastageKg || r.totalScrapQtyKg || 0;
        const wastagePct = Number(r.wastagePercentage ?? r.overallScrapPctOfOutput ?? (grossKg > 0 ? (wastageKg / grossKg) * 100 : 0));
        return acc + wastagePct;
      }, 0);
      return sum / recList.length;
    };

    const currentMonthAvg = getAvgScrap(curMonthRecords);
    const prevMonthAvg = getAvgScrap(prevMonthRecords);

    const momChange = currentMonthAvg - prevMonthAvg;
    const momDirection = momChange > 0 ? 'up' : (momChange < 0 ? 'down' : 'neutral');

    return {
      currentMonthAvg: parseFloat(currentMonthAvg.toFixed(2)),
      prevMonthAvg: parseFloat(prevMonthAvg.toFixed(2)),
      momChange: parseFloat(Math.abs(momChange).toFixed(2)),
      momDirection
    };
  };

  const scrapMetrics = calculateScrapMetrics(productionRecords);

  const lowStockInks = useMemo(() => {
    return (inks || []).filter(i => (parseFloat(i.stockQtyKg) || 0) < (parseFloat(i.reorderLevelKg) || 0));
  }, [inks]);

  const avgSolidEqInkCost = useMemo(() => {
    if (!inks || inks.length === 0) return 0;
    const valid = inks.filter(i => (parseFloat(i.solidContentPct) || 0) > 0);
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, i) => {
      const solidPct = parseFloat(i.solidContentPct) || 40;
      return acc + ((parseFloat(i.pricePerKg) || 0) * (100 / solidPct));
    }, 0);
    return sum / valid.length;
  }, [inks]);


  // Handlers for Production Records
  const handleSaveProductionRecord = async (newRecord) => {
    requireDatabaseConnection('save production record');
    await saveProductionRecordToSupabase(newRecord);

    setProductionRecords(prev => [newRecord, ...prev.filter(r => r.orderId !== newRecord.orderId)]);
    logAudit('CREATE', 'Production Records', `Logged production record ${newRecord.id} for "${newRecord.jobName}" (Usable: ${newRecord.netUsableKg} kg, Wastage: ${newRecord.totalWastageKg} kg)`, newRecord.id);

    // Update Inventory available stock for materials consumed
    if (newRecord.materialsList && newRecord.materialsList.length > 0) {
      setInventory(prevInv => {
        let updatedInv = [...prevInv];
        newRecord.materialsList.forEach(mat => {
          const netQty = parseFloat(mat.netConsumedQtyKg) || Math.max(0, (parseFloat(mat.issueQtyKg) || 0) - (parseFloat(mat.returnQtyKg) || 0));
          if (netQty > 0 && mat?.filmType) {
            const matName = String(mat.filmType || '').toLowerCase();
            updatedInv = updatedInv.map(invItem => {
              if (String(invItem?.filmType || '').toLowerCase() === matName) {
                return {
                  ...invItem,
                  availableQtyKg: Math.max(0, (invItem.availableQtyKg || 0) - netQty)
                };
              }
              return invItem;
            });
          }
        });
        return updatedInv;
      });
    }

    // Update inventoryRolls for scanned barcodes with remaining balance
    if (newRecord.materialsList && newRecord.materialsList.length > 0) {
      setInventoryRolls(prevRolls => {
        let updatedRolls = [...prevRolls];
        newRecord.materialsList.forEach(mat => {
          if (mat.barcode) {
            const returnQty = parseFloat(mat.returnQtyKg) || 0;
            updatedRolls = updatedRolls.map(roll => {
              if (roll.barcodeId === mat.barcode || roll.batchNo === mat.barcode) {
                return {
                  ...roll,
                  netWeightKg: returnQty,
                  status: returnQty > 0 ? 'Partial Roll (In Store)' : 'Fully Consumed'
                };
              }
              return roll;
            });
          }
        });
        return updatedRolls;
      });
    }
  };

  const handleApproveProductionRecord = async (recordId, adminName) => {
    requireDatabaseConnection('approve production record');
    const existing = (productionRecords || []).find(r => r.id === recordId);
    if (!existing) return;
    const updated = {
      ...existing,
      status: 'Approved by Admin',
      approvedBy: adminName,
      approvalDate: new Date().toLocaleString()
    };
    await saveProductionRecordToSupabase(updated);
    setProductionRecords(prev => prev.map(r => r.id === recordId ? updated : r));
    logAudit('UPDATE', 'Production Records', `Plant manager approval granted for production record ${recordId} by ${adminName}`, recordId);
  };

  const handleStoreIssueReturn = async ({ item, issueType, qty, jobName, user, notes, barcode, unitPrice, batchNo, vendorName, grnNo }) => {
    requireDatabaseConnection('store issue/return');
    if (!item || !qty || qty <= 0 || !jobName) return;

    const unitStr = item.unit || 'Kg';
    const itemNameStr = item.itemName || `${item.filmType || ''} ${item.micron && item.micron !== '-' ? `${item.micron}µ` : ''}`.trim() || `${item.category || 'Store'} Item`;
    const rateVal = unitPrice !== undefined && unitPrice !== null && !isNaN(parseFloat(unitPrice)) 
      ? Number(unitPrice) 
      : Number(item.unitPrice || item.purchaseRatePerKg || 0);

    // 1. Update Inventory State and Supabase
    let updatedInv = inventory.map(i => {
      if (i.id === item.id) {
        let avail = Number(i.availableQtyKg || 0);
        let alloc = Number(i.allocatedQtyKg || 0);
        if (issueType === 'issue') {
          avail = Math.max(0, avail - qty);
          alloc = alloc + qty;
        } else {
          avail = avail + qty;
          alloc = Math.max(0, alloc - qty);
        }
        return {
          ...i,
          availableQtyKg: avail,
          allocatedQtyKg: alloc
        };
      }
      return i;
    });
    const updatedItem = updatedInv.find(i => i.id === item.id);
    if (updatedItem) {
      await saveInventoryItemToSupabase(updatedItem);
    }
    setInventory(updatedInv);

    // 2. Record Transaction in storeIssueTransactions
    const newTx = {
      id: `ISS-${Date.now()}`,
      itemId: item.id,
      itemCode: item.itemCode || item.id,
      itemName: itemNameStr,
      filmType: item.filmType || item.itemName,
      micron: item.micron || '-',
      widthMm: item.widthMm || '-',
      category: item.category || 'Film Substrates',
      issueType: issueType,
      jobName: jobName,
      qtyKg: qty,
      unit: unitStr,
      unitPrice: rateVal,
      purchaseRatePerKg: rateVal,
      batchNo: batchNo || item.lastBatch || '',
      vendorName: vendorName || item.lastVendor || '',
      grnNo: grnNo || '',
      date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      issuedBy: user || currentUser?.name || 'Store Manager',
      notes: notes || (issueType === 'issue'
        ? `Issued ${qty} ${unitStr} from Batch [${batchNo || 'Main Lot'}] to Job: ${jobName}`
        : `Returned ${qty} ${unitStr} from Job: ${jobName} back to Store`),
      barcode: barcode || batchNo || item.lastBatch || `BAR-ISS-${item.id}`
    };

    const newTxList = [newTx, ...storeIssueTransactions];
    await replacePayloadRecords(supabase, 'store_issue_transactions', newTxList);
    setStoreIssueTransactions(newTxList);

    // 3. Update / Earmark the Production Record of this Job
    const targetOrder = (orders || []).find(o => 
      o.jobName?.trim().toLowerCase() === jobName.trim().toLowerCase() || o.id === jobName
    );
    const orderId = targetOrder ? targetOrder.id : jobName;
    const clientName = targetOrder ? targetOrder.clientName : '';

    const existingIdx = (productionRecords || []).findIndex(r => 
      r.orderId === orderId || (r.jobName && r.jobName.trim().toLowerCase() === jobName.trim().toLowerCase())
    );

    let targetRecord;
    if (existingIdx >= 0) {
      targetRecord = { ...productionRecords[existingIdx] };
    } else {
      targetRecord = {
        id: `REC-${Date.now()}`,
        orderId: orderId,
        jobName: jobName,
        clientName: clientName,
        dateFilled: new Date().toISOString().split('T')[0],
        materialsList: [],
        qtyFirstPassL1: 0,
        qtySecondPassL2: 0,
        qtyInspection: 0,
        qtySlitting: 0,
        qtyDispatch: 0,
        totalProductionQtyKg: 0,
        totalMaterialCostRs: 0,
        processingCostPerKg: 25,
        totalProcessingCostRs: 0,
        printingPlainSettingWastageKg: 0,
        printingWastageKg: 0,
        laminationPlainSubstrateWastageKg: 0,
        printedWastageKg: 0,
        laminateWastageKg: 0,
        trimWastageKg: 0,
        totalScrapQtyKg: 0,
        overallScrapPctOfOutput: 0,
        overallScrapPctOfDispatch: 0,
        finalProductionCostRs: 0,
        status: "In Progress",
        filledBy: user || currentUser?.name || "Store Issue Auto-Sync",
        approvedBy: "",
        approvalDate: "",
        notes: `Material issued from store on ${new Date().toLocaleDateString()}`
      };
    }

    let currentMaterials = Array.isArray(targetRecord.materialsList) ? [...targetRecord.materialsList] : [];
    const matIdx = currentMaterials.findIndex(m => 
      (m.itemId && m.itemId === item.id) ||
      (m.itemName && m.itemName.toLowerCase().trim() === itemNameStr.toLowerCase().trim()) ||
      (m.filmType && m.filmType.toLowerCase().trim() === (item.filmType || item.itemName || '').toLowerCase().trim())
    );

    const itemRate = rateVal > 0 ? rateVal : (parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0);

    if (matIdx >= 0) {
      const existingMat = currentMaterials[matIdx];
      const currIssued = parseFloat(existingMat.issueQtyKg) || 0;
      const currReturned = parseFloat(existingMat.returnQtyKg) || 0;

      const newIssued = issueType === 'issue' ? currIssued + qty : currIssued;
      const newReturned = issueType === 'return' ? currReturned + qty : currReturned;
      const netConsumed = Math.max(0, newIssued - newReturned);
      const matRate = itemRate > 0 ? itemRate : (parseFloat(existingMat.unitPricePerKg) || 0);

      currentMaterials[matIdx] = {
        ...existingMat,
        itemId: item.id,
        itemCode: item.itemCode || existingMat.itemCode,
        itemName: itemNameStr,
        unit: unitStr,
        issueQtyKg: newIssued,
        returnQtyKg: newReturned,
        netConsumedQtyKg: netConsumed,
        unitPricePerKg: matRate,
        totalMaterialCost: netConsumed * matRate,
        batchNo: batchNo || existingMat.batchNo || item.lastBatch || '',
        vendorName: vendorName || existingMat.vendorName || item.lastVendor || ''
      };
    } else {
      const issuedQty = issueType === 'issue' ? qty : 0;
      const returnedQty = issueType === 'return' ? qty : 0;
      const netConsumed = Math.max(0, issuedQty - returnedQty);

      currentMaterials.push({
        id: `mat-${Date.now()}-${currentMaterials.length + 1}`,
        itemId: item.id,
        itemCode: item.itemCode || item.id,
        itemName: itemNameStr,
        filmType: item.itemName || item.filmType || item.category || 'Material',
        category: item.category || 'Raw Material',
        micron: item.micron || '-',
        widthMm: item.widthMm || '-',
        unit: unitStr,
        barcode: barcode || batchNo || item.lastBatch || `BAR-ISS-${item.id}`,
        issueQtyKg: issuedQty,
        returnQtyKg: returnedQty,
        netConsumedQtyKg: netConsumed,
        unitPricePerKg: itemRate,
        totalMaterialCost: netConsumed * itemRate,
        batchNo: batchNo || item.lastBatch || '',
        vendorName: vendorName || item.lastVendor || '',
        jobMasterFilmType: item.filmType || item.itemName,
        jobMasterMicron: item.micron && item.micron !== '-' ? Number(item.micron) : 0,
        jobMasterWidthMm: item.widthMm && item.widthMm !== '-' ? Number(item.widthMm) : 0
      });
    }

    targetRecord.materialsList = currentMaterials;
    targetRecord.totalMaterialCostRs = currentMaterials.reduce((sum, m) => sum + (parseFloat(m.totalMaterialCost) || 0), 0);
    targetRecord.finalProductionCostRs = (parseFloat(targetRecord.totalProcessingCostRs) || 0) + targetRecord.totalMaterialCostRs;

    await saveProductionRecordToSupabase(targetRecord);
    setProductionRecords(prevRecords => {
      if (existingIdx >= 0) {
        const updatedAll = [...prevRecords];
        updatedAll[existingIdx] = targetRecord;
        return updatedAll;
      } else {
        return [targetRecord, ...prevRecords];
      }
    });

    logAudit('CREATE', 'Store Issue Ledger', `${issueType === 'issue' ? 'Issued' : 'Returned'} ${qty} ${unitStr} of ${itemNameStr} for job "${jobName}"`, newTx.id);
  };

  const handleUpdateConsumables = async (newConsumables) => {
    requireDatabaseConnection('update consumables');
    await replacePayloadRecords(supabase, 'consumables', newConsumables);
    setConsumables(newConsumables);
    logAudit('UPDATE', 'Consumable Store', `Updated consumable store inventory levels`, 'CONSUMABLES');
  };

  const handleUpdateIndents = async (newIndents) => {
    requireDatabaseConnection('update material indents');
    await replacePayloadRecords(supabase, 'material_indents', newIndents);
    setIndents(newIndents);
    logAudit('UPDATE', 'Material Indents', `Updated plant material indents / purchase requisitions`, 'INDENTS');
  };

  const handleUpdateMachineIssues = async (newIssues) => {
    requireDatabaseConnection('update machine stock issue');
    await replacePayloadRecords(supabase, 'machine_issues', newIssues);
    setMachineIssues(newIssues);
    logAudit('UPDATE', 'Machine Stock Issue', `Recorded stock item issue to machine`, 'ISSUES');
  };

  // Handlers for state updates (Supabase Authoritative for Orders)
  const handleAddOrder = async (newOrder) => {
    console.log(`[ORDERS][CREATE] Starting orderId=${newOrder?.id}`);
    try {
      await saveOrderToSupabase(newOrder);
      console.log(`[ORDERS][DB WRITE] UPSERT orderId=${newOrder?.id} successful`);
      setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
      await logAudit('CREATE', 'Orders', `Punched job order ${newOrder.id} - "${newOrder.jobName}" for client "${newOrder.clientName}" (${newOrder.orderQtyKg} kg)`, newOrder.id);
    } catch (err) {
      console.error('[ORDERS][CREATE] Failed to create order in Supabase:', err);
      alert(`Failed to save order ${newOrder?.id} to Supabase database: ${err.message || err}`);
      throw err;
    }
  };

  const handleUpdateOrder = async (updatedOrder) => {
    console.log(`[ORDERS][UPDATE] Starting orderId=${updatedOrder?.id}`);
    try {
      await saveOrderToSupabase(updatedOrder);
      console.log(`[ORDERS][DB WRITE] UPSERT orderId=${updatedOrder?.id} successful`);
      setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
      await logAudit('UPDATE', 'Orders', `Updated order details/status for ${updatedOrder.id} - "${updatedOrder.jobName}" (${updatedOrder.status})`, updatedOrder.id);
    } catch (err) {
      console.error('[ORDERS][UPDATE] Failed to update order in Supabase:', err);
      alert(`Failed to update order ${updatedOrder?.id} in Supabase database: ${err.message || err}`);
      throw err;
    }
  };
  const handleUpdateOrderStatus = handleUpdateOrder;

  // Handlers for Starting and Ending Printing Jobs from Scheduler
  const handleStartPrintingJob = async (order, machineId, startTime) => {
    const startIso = startTime || new Date().toISOString();
    const updatedOrder = {
      ...order,
      status: 'In Production',
      printingStatus: 'In Production',
      machineId: machineId || order.machineId,
      printingStartTime: startIso,
      printingEndTime: null,
      isPrintingCompleted: false
    };
    await handleUpdateOrder(updatedOrder);
    await handleActiveRunningJobChange(updatedOrder);
    await handleSaveSchedule({
      id: `SCHED-${order.id}`,
      orderId: order.id,
      jobName: order.jobName || '',
      clientName: order.clientName || order.customerName || '',
      machineId: machineId || order.machineId || 'UNASSIGNED',
      shift: 'Day Shift',
      scheduledDate: new Date().toISOString().split('T')[0],
      startTime: new Date(startIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      orderQtyKg: Number(order.quantityKg || order.quantity || order.orderQtyKg || 0),
      widthMm: Number(order.widthMm || order.printWidthMm || 0),
      micron: Number(order.micron || 12),
      filmType: order.printFilmType || order.filmType || 'PET',
      status: 'In Production',
      priority: order.priority || 'Normal'
    });

    // Update or create corresponding Production Record
    const existingRec = productionRecords.find(r => r.orderId === order.id || r.id === order.id || r.jobCode === order.jobCode);
    const updatedRecord = existingRec ? {
      ...existingRec,
      status: 'In Production',
      printingStatus: 'In Production',
      printingStartTime: startIso,
      printingEndTime: null,
      stages: {
        ...(existingRec.stages || {}),
        printing: {
          ...(existingRec.stages?.printing || {}),
          status: 'In Production',
          startTime: startIso,
          endTime: null
        }
      }
    } : {
      id: `PR-${order.jobCode || order.id || Date.now()}`,
      orderId: order.id,
      jobCode: order.jobCode || order.id,
      jobName: order.jobName,
      clientName: order.clientName,
      targetQtyKg: order.quantityKg || order.quantity || order.orderQtyKg || 0,
      status: 'In Production',
      printingStatus: 'In Production',
      printingStartTime: startIso,
      printingEndTime: null,
      stages: {
        printing: { status: 'In Production', startTime: startIso, endTime: null }
      },
      createdAt: startIso
    };
    await handleSaveProductionRecord(updatedRecord);
    logAudit('UPDATE', 'Printing Scheduler', `Started printing job for "${order.jobName}" (${order.id}) on machine ${machineId || 'Rotogravure Press'}`, order.id);
  };

  const handleEndPrintingJob = async (order, endParam1, endParam2, endParam3) => {
    let endData = {};
    let endTime = null;
    let durationMinutes = null;

    if (typeof endParam1 === 'object' && endParam1 !== null) {
      endData = endParam1;
      endTime = endData.endTime;
      durationMinutes = endData.durationMinutes;
    } else {
      endTime = endParam1;
      durationMinutes = endParam2;
      endData = endParam3 || {};
    }

    const endIso = endTime || endData.endTime || new Date().toISOString();
    const computedDurationMinutes = durationMinutes || endData.durationMinutes || (order.printingStartTime ? Math.max(1, Math.round((new Date(endIso).getTime() - new Date(order.printingStartTime).getTime()) / 60000)) : null);
    const durationFormatted = computedDurationMinutes ? (computedDurationMinutes >= 60 ? `${Math.floor(computedDurationMinutes / 60)}h ${computedDurationMinutes % 60}m` : `${computedDurationMinutes}m`) : 'Completed';
    
    const actualMetersPrinted = parseFloat(endData.actualMetersPrinted) || parseFloat(order.targetMeters) || 0;
    const inkGsmInSpeed = parseFloat(endData.inkGsmInSpeed) || parseFloat(order.inkGsm) || 1.5;
    const printedOutputKg = parseFloat(endData.printedOutputKg) || parseFloat(order.printLayerNetKg || order.quantityKg || order.quantity || order.orderQtyKg || 0);

    const updatedOrder = {
      ...order,
      status: 'In Production',
      printingStatus: 'Completed',
      isPrintingCompleted: true,
      printingEndTime: endIso,
      printingDurationMinutes: computedDurationMinutes,
      printingDurationFormatted: durationFormatted,
      actualMetersPrinted,
      inkGsmInSpeed,
      printedOutputKg,
      printingNotes: endData.notes || '',
      inputRollsList: endData.inputRollsList || order.inputRollsList || [],
      outputRolls: endData.rollsBreakdown || order.outputRolls || [],
      rollsBreakdown: endData.rollsBreakdown || order.rollsBreakdown || []
    };
    await handleUpdateOrder(updatedOrder);
    await handleActiveRunningJobChange(null);

    // Update corresponding Production Record (or create if missing)
    const cleanTargetOrderId = String(order.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    const existingRec = productionRecords.find(r => {
      const cleanRId = String(r.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
      const cleanROrderId = String(r.orderId || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
      return cleanROrderId === cleanTargetOrderId || 
             cleanRId === cleanTargetOrderId || 
             r.orderId === order.id || 
             r.id === order.id || 
             (r.jobCode && r.jobCode === order.jobCode) ||
             (r.jobName && order.jobName && r.jobName.trim().toLowerCase() === order.jobName.trim().toLowerCase());
    });
    const baseRecord = existingRec || {
      id: `REC-${order.id}`,
      orderId: order.id,
      jobCode: order.jobCode,
      jobName: order.jobName,
      clientName: order.clientName || order.customerName || '',
      dateFilled: new Date().toISOString().split('T')[0],
      status: 'Filled by Plant Manager',
      filledBy: 'Operator',
      materialsList: []
    };

    const updatedRecord = {
      ...baseRecord,
      status: 'Filled by Plant Manager',
      printingStatus: 'Completed',
      printingEndTime: endIso,
      printingDurationMinutes: computedDurationMinutes,
      printingDurationFormatted: durationFormatted,
      qtyFirstPassL1: printedOutputKg > 0 ? printedOutputKg : (baseRecord.qtyFirstPassL1 || 0),
      totalProductionQtyKg: printedOutputKg > 0 ? printedOutputKg : (baseRecord.totalProductionQtyKg || 0),
      grossProductionKg: printedOutputKg > 0 ? printedOutputKg : (baseRecord.grossProductionKg || 0),
      actualMetersPrinted,
      inkGsmInSpeed,
      printedOutputKg,
      inputRollsList: endData.inputRollsList || baseRecord.inputRollsList || [],
      rollsBreakdown: endData.rollsBreakdown || baseRecord.rollsBreakdown || [],
      outputRolls: endData.rollsBreakdown || baseRecord.outputRolls || [],
      totalInputConsumedKg: endData.totalInputConsumedKg || 0,
      printWidthMm: endData.printWidthMm || order.printWidthMm || 460,
      inputRollWidthMm: endData.inputRollWidthMm || 460,
      isBiggerSize: endData.isBiggerSize || false,
      excessFilmWastageKg: endData.excessFilmWastageKg || 0,
      excessFilmWastagePct: endData.excessFilmWastagePct || 0,
      inkWeightGainKg: endData.inkWeightGainKg || 0,
      actualCalculatedInkGsm: endData.actualCalculatedInkGsm || 0,
      notes: endData.notes || baseRecord.notes || '',
      stages: {
        ...(baseRecord.stages || {}),
        printing: {
          ...(baseRecord.stages?.printing || {}),
          status: 'Completed',
          endTime: endIso,
          durationMinutes: computedDurationMinutes,
          durationFormatted: durationFormatted,
          actualMetersPrinted,
          inkGsmInSpeed,
          printedOutputKg,
          actualCalculatedInkGsm: endData.actualCalculatedInkGsm || 0,
          outputRolls: endData.rollsBreakdown || baseRecord.outputRolls || [],
          sfgBarcodes: (endData.rollsBreakdown || []).map(r => r.barcodeId || r.id)
        }
      }
    };
    await handleSaveProductionRecord(updatedRecord);
    await handleSaveSchedule({
      id: `SCHED-${order.id}`,
      orderId: order.id,
      jobName: order.jobName || '',
      clientName: order.clientName || order.customerName || '',
      machineId: order.machineId || 'UNASSIGNED',
      shift: 'Day Shift',
      scheduledDate: new Date().toISOString().split('T')[0],
      endTime: new Date(endIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      orderQtyKg: Number(order.quantityKg || order.quantity || order.orderQtyKg || 0),
      widthMm: Number(order.widthMm || order.printWidthMm || 0),
      micron: Number(order.micron || 12),
      filmType: order.printFilmType || order.filmType || 'PET',
      status: 'Completed',
      priority: order.priority || 'Normal',
      totalDurationMins: computedDurationMinutes || 0
    });

    // Store each printed roll in SFG stock. The job row is already saved above.
    // A failed roll is not added to the board. If the database already has it, a
    // reload keeps that roll and drops the failure from the message.
    const failedSfgRolls = [];
    if (Array.isArray(endData.rollsBreakdown) && endData.rollsBreakdown.length > 0) {
      for (const r of endData.rollsBreakdown) {
        const barcodeId = r.barcodeId || r.id;
        const sfgItemRecord = {
          id: barcodeId,
          sfgBatchCode: barcodeId,
          orderId: order.id,
          jobName: r.itemName || `${order.jobName} - Roll #${r.rollNo || 1}`,
          jobCode: order.jobCode || order.id,
          clientName: order.clientName || order.customerName || 'Client',
          sfgType: 'Printed Rolls',
          filmType: r.filmType || order.printFilmType || 'PET',
          widthMm: Number(r.widthMm || order.widthMm || 460),
          micron: Number(r.micron || order.micron || 12),
          totalNetKg: Number(r.netWeightKg || 0),
          availableKg: Number(r.availableWeightKg || r.netWeightKg || 0),
          consumedKg: 0,
          status: 'In Stock',
          location: r.locationBay || 'SFG Store (Pre-Lamination)',
          storageBay: r.locationBay || 'SFG Store (Pre-Lamination)',
          productionDate: new Date().toISOString().split('T')[0],
          createdDate: new Date().toISOString().split('T')[0]
        };
        try {
          await writeWithRetry(() => saveSFGGoodToSupabase(sfgItemRecord));
          setSfgGoods(prev => [sfgItemRecord, ...prev.filter(s => (s.sfgBatchCode || s.id) !== barcodeId)]);
        } catch (sfgErr) {
          failedSfgRolls.push({ label: `printed roll ${barcodeId} in sfg_goods`, error: sfgErr, barcodeId });
        }
      }
    }
    if (failedSfgRolls.length > 0) {
      let stillMissing = failedSfgRolls;
      try {
        const freshSfg = await fetchSFGGoodsFromSupabase();
        if (Array.isArray(freshSfg)) {
          setSfgGoods(freshSfg);
          const present = new Set(freshSfg.map(s => String(s.sfgBatchCode || s.id)));
          stillMissing = failedSfgRolls.filter(item => !present.has(String(item.barcodeId)));
        }
      } catch (refetchErr) {
        console.error('[handleEndPrintingJob] Could not reload SFG stock after a failed save:', refetchErr);
      }
      if (stillMissing.length > 0) {
        throw new PartialSaveError(unsavedItemsMessage({
          completed: `Printing job "${order.jobName}" (${order.id}) was marked complete. The order, production record, and schedule were saved. Retry End Job to store the missing printed rolls. They are not shown in the SFG store.`,
          failed: stillMissing
        }));
      }
    }

    logAudit('UPDATE', 'Printing Scheduler', `Ended printing job for "${order.jobName}" (${order.id}). Meters: ${actualMetersPrinted}m, Ink GSM: ${inkGsmInSpeed}, Output: ${printedOutputKg}kg, Duration: ${durationFormatted}`, order.id);
  };

  const handleDeleteOrder = async (orderId) => {
    if (!orderId) return;
    try {
      setDeletingOrderId(orderId);
      deletedOrderIdsRef.current.add(orderId);
      console.log(`[ORDERS][DELETE] Starting delete orderId=${orderId}`);

      const res = await deleteOrderFromSupabase(orderId);
      if (res && res.success) {
        console.log(`[ORDERS][DELETE] Supabase deletion successful orderId=${orderId}`);
        // Only after Supabase confirms deletion:
        setOrders(prev => prev.filter(o => o.id !== orderId));
        await logAudit('DELETE', 'Orders', `Deleted job order record ${orderId}`, orderId);
      }
    } catch (err) {
      console.error('[ORDERS][DELETE] Delete failed:', err);
      deletedOrderIdsRef.current.delete(orderId);
      alert(`Failed to delete order ${orderId} from Supabase database: ${err.message || err}`);
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleAddVendor = async (newVendor) => {
    requireDatabaseConnection('save vendor');
    await saveVendorToSupabase(newVendor);
    setVendors(prev => [...prev.filter(v => v.id !== newVendor.id), newVendor]);
    logAudit('CREATE', 'Vendors', `Saved vendor record "${newVendor.name || newVendor.companyName}" (${newVendor.id})`, newVendor.id);
  };

  const handleDeleteVendor = async (vendorId) => {
    requireDatabaseConnection('delete vendor');
    await deleteVendorFromSupabase(vendorId);
    setVendors(prev => prev.filter(v => v.id !== vendorId));
    logAudit('DELETE', 'Vendors', `Deleted vendor directory entry ${vendorId}`, vendorId);
  };

  const handleAddGRN = async (newGRN) => {
    requireDatabaseConnection('create GRN');
    const saved = await saveGRNToSupabase(newGRN);
    const stored = { ...newGRN, ...(saved || {}), lineItems: saved?.lineItems || newGRN.lineItems };
    setGrns(prev => [stored, ...prev.filter(g => g.grnNo !== stored.grnNo && String(g.id) !== String(stored.id))]);
    const lineCount = Array.isArray(stored.lineItems) ? stored.lineItems.length : 1;
    const auditText = lineCount > 1
      ? `Issued GRN ${stored.grnNo} for ${lineCount} items ("${stored.itemName}", ${stored.receivedQtyKg || stored.netWeightKg} kg) from ${stored.vendorName}`
      : `Issued GRN ${stored.grnNo} for "${stored.itemName}" (${stored.receivedQtyKg || stored.netWeightKg} kg) from ${stored.vendorName}`;
    logAudit('CREATE', 'GRN Inward', auditText, stored.grnNo);
    return stored;
  };

  const handleUpdateGRN = async (updatedGRN) => {
    requireDatabaseConnection('update GRN');
    await saveGRNToSupabase(updatedGRN);
    setGrns(prev => prev.map(g => g.grnNo === updatedGRN.grnNo || String(g.id) === String(updatedGRN.id) ? updatedGRN : g));

    // Sync QC status back to pelletInwards if it is a pellet fuel GRN
    if (updatedGRN.category === 'Boiler Pellets / Fuel' || updatedGRN.isPelletFuel || (updatedGRN.grnNo && String(updatedGRN.grnNo).includes('PEL'))) {
      const pelletFailures = [];
      const savedPellets = [];
      for (const pellet of pelletInwards || []) {
        if (pellet.grnNo !== updatedGRN.grnNo && String(pellet.id) !== String(updatedGRN.id)) continue;
        const updatedPellet = { ...pellet, status: updatedGRN.status, qcStatus: updatedGRN.status, qcNotes: updatedGRN.qcNotes };
        try {
          await writeWithRetry(() => savePelletInwardToSupabase(updatedPellet));
          savedPellets.push(updatedPellet);
        } catch (error) {
          pelletFailures.push({ label: `pellet inward ${pellet.grnNo || pellet.id}`, error });
        }
      }
      if (savedPellets.length > 0) {
        const savedIds = new Set(savedPellets.map(p => String(p.id)));
        setPelletInwards(prev => prev.map(p => savedIds.has(String(p.id)) ? savedPellets.find(s => String(s.id) === String(p.id)) : p));
      }
      assertAllSaved(`GRN ${updatedGRN.grnNo} was saved, but the pellet stock status was not.`, pelletFailures);
    }

    logAudit('UPDATE', 'GRN Inward', `Updated GRN ${updatedGRN.grnNo} status to "${updatedGRN.status}"`, updatedGRN.grnNo);
  };

  const handleUpdateInventory = async (newInventory) => {
    requireDatabaseConnection('update inventory');
    if (Array.isArray(newInventory)) {
      await saveInventoryBatchToSupabase(newInventory);
    }
    setInventory(newInventory);
  };

  const handleSaveInventoryItem = async (item) => {
    if (!item) return;
    requireDatabaseConnection('save inventory item');
    const cleanItem = sanitizeInventoryItem(item);
    await saveInventoryItemToSupabase(cleanItem);
    setInventory(prev => {
      const exists = prev.some(i => String(i.id) === String(cleanItem.id));
      return exists
        ? prev.map(i => String(i.id) === String(cleanItem.id) ? { ...i, ...cleanItem } : i)
        : [cleanItem, ...prev];
    });
    logAudit('UPDATE', 'Inventory', `Saved stock item ${cleanItem.itemCode || cleanItem.id} - "${cleanItem.itemName}" (${cleanItem.availableQtyKg} ${cleanItem.unit || 'Kg'})`, cleanItem.id);
  };

  const handleDeleteInventoryItem = async (itemId) => {
    if (!itemId) return;
    requireDatabaseConnection('delete inventory item');
    await deleteInventoryItemFromSupabase(itemId);
    setInventory(prev => prev.filter(i => String(i.id) !== String(itemId)));
    logAudit('DELETE', 'Inventory', `Deleted inventory item ${itemId}`, itemId);
  };

  const handleAddUser = async (newUser) => {
    requireDatabaseConnection('create user');
    const authResult = await createDirectoryUser(newUser);
    if (!authResult.success) {
      alert(authResult.message || 'Could not create the user.');
      return;
    }
    const saved = authResult.user || newUser;
    setUsers(prev => [...prev.filter(u => u.email !== saved.email), saved]);
    logAudit('CREATE', 'User Management', `Created user account for ${saved.name} (${saved.email}) - Role: ${saved.role}`, saved.id);
    alert(authResult.message || 'User created.');
  };

  const handleUpdateUser = async (updatedUser) => {
    requireDatabaseConnection('update user');
    const authResult = await updateDirectoryUser(updatedUser);
    if (!authResult.success) {
      alert(authResult.message || 'Could not update the user.');
      return;
    }
    const saved = authResult.user || updatedUser;
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? saved : u));
    logAudit('UPDATE', 'User Management', `Updated user account for ${saved.name} (${saved.email}) - Role: ${saved.role}`, saved.id);
  };

  const handleDeleteUser = async (userId) => {
    requireDatabaseConnection('delete user');
    const authResult = await deleteDirectoryUser(userId);
    if (!authResult.success) {
      alert(authResult.message || 'Could not delete the user.');
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== userId));
    logAudit('DELETE', 'User Management', `Deleted user account ${userId}`, userId);
  };

  const handleAddEmployee = async (newEmp) => {
    requireDatabaseConnection('add employee');
    await saveEmployeeToSupabase(newEmp);
    setEmployees(prev => [newEmp, ...prev.filter(e => e.id !== newEmp.id)]);
    logAudit('CREATE', 'Employee Management', `Onboarded employee ${newEmp.fullName} (${newEmp.empCode || newEmp.id}) in ${newEmp.department}`, newEmp.id);
  };

  const handleUpdateEmployee = async (updatedEmp) => {
    requireDatabaseConnection('update employee');
    await saveEmployeeToSupabase(updatedEmp);
    setEmployees(prev => prev.map(e => e.id === updatedEmp.id ? updatedEmp : e));
    logAudit('UPDATE', 'Employee Management', `Updated employee ${updatedEmp.fullName} (${updatedEmp.empCode || updatedEmp.id})`, updatedEmp.id);
  };

  const handleDeleteEmployee = async (empId) => {
    requireDatabaseConnection('delete employee');
    await deleteEmployeeFromSupabase(empId);
    setEmployees(prev => prev.filter(e => e.id !== empId));
    logAudit('DELETE', 'Employee Management', `Deleted employee record ${empId}`, empId);
  };

  const handleSaveAttendance = async (record) => {
    requireDatabaseConnection('save attendance');
    await saveEmployeeAttendanceToSupabase(record);
    setEmployeeAttendance(prev => {
      const idx = prev.findIndex(a => a.id === record.id || attendanceMatchesEmployeeDate(a, record.employeeId, record.date));
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = record;
        return updated;
      }
      return [record, ...prev];
    });
  };

  const handleSaveSalaryAdvance = async (newAdv) => {
    requireDatabaseConnection('save salary advance');
    await saveSalaryAdvanceToSupabase(newAdv);
    setSalaryAdvances(prev => [newAdv, ...prev.filter(a => a.id !== newAdv.id)]);
    logAudit('CREATE', 'Employee Management', `Requested advance of ₹${newAdv.advanceAmount} for ${newAdv.employeeName}`, newAdv.id);
  };

  const handleUpdateSalaryAdvance = async (updatedAdv) => {
    requireDatabaseConnection('update salary advance');
    await saveSalaryAdvanceToSupabase(updatedAdv);
    setSalaryAdvances(prev => prev.map(a => a.id === updatedAdv.id ? updatedAdv : a));
    logAudit('UPDATE', 'Employee Management', `Updated advance status for ${updatedAdv.employeeName} to ${updatedAdv.status}`, updatedAdv.id);
  };

  const handleSaveSalaryPayment = async (newPayment) => {
    requireDatabaseConnection('save salary payment');
    await saveSalaryPaymentToSupabase(newPayment);
    setSalaryPayments(prev => [newPayment, ...prev.filter(p => p.id !== newPayment.id)]);
    logAudit('PAYMENT', 'Employee Management', `Disbursed ${newPayment.monthKey} salary of ₹${(newPayment.netAmountPaid || 0).toLocaleString()} to ${newPayment.employeeName} (${newPayment.paymentMode}) on ${newPayment.paymentDate} at ${newPayment.paymentTime}`, newPayment.id);
  };

  const handleAddJobDataSheet = async (newSheet) => {
    requireDatabaseConnection('create job datasheet');
    await saveJobDataSheetToSupabase(newSheet);
    setJobDataSheets(prev => [newSheet, ...prev.filter(s => s.id !== newSheet.id)]);
    logAudit('CREATE', 'Job Data Sheets', `Created job datasheet ${newSheet.id} for "${newSheet.jobName}"`, newSheet.id);
  };

  const handleDeleteJobDataSheet = async (sheetId) => {
    requireDatabaseConnection('delete job datasheet');
    await deleteJobDataSheetFromSupabase(sheetId);
    setJobDataSheets(prev => prev.filter(s => s.id !== sheetId));
    logAudit('DELETE', 'Job Data Sheets', `Deleted job datasheet ${sheetId}`, sheetId);
  };

  const syncCylinderToOrderManagement = (cyl) => {
    if (!cyl) return;
    const isEngraving = (cyl.status || '').toLowerCase().includes('engraving');
    if (!isEngraving) return;

    const targetJob = (cyl.jobName || '').trim().toLowerCase();
    const targetSku = (cyl.sku || '').trim().toLowerCase();

    const existingOrder = (orders || []).find(o => 
      (o.cylinderDetails && o.cylinderDetails.sku && o.cylinderDetails.sku.trim().toLowerCase() === targetSku) ||
      (o.jobName && targetJob && o.jobName.trim().toLowerCase() === targetJob)
    );

    if (!existingOrder) {
      const ocnNo = getNextDocRefNumber('ocn');
      const orderId = getNextDocRefNumber('order');
      const numericCost = parseFloat(String(cyl.cylinderCost || '').replace(/[^0-9.]/g, '')) || 35000;
      
      const cylOrder = {
        id: orderId,
        ocnNumber: ocnNo,
        jobName: cyl.jobName || 'Rotogravure Cylinder Set',
        clientName: cyl.clientGroup || 'Standard Client',
        orderQtyKg: 1,
        quantityKg: 1,
        orderType: 'Rotogravure Cylinder',
        materialFormat: 'Rotogravure Cylinder',
        isCylinderOrder: true,
        sellingPricePerKg: numericCost,
        cylinderDetails: {
          sku: cyl.sku,
          jobName: cyl.jobName,
          description: `Cylinder Set - ${cyl.colorsCount || 8} Colors`,
          quantity: 1,
          rate: numericCost,
          totalAmount: numericCost,
          engraverName: cyl.engravuresName || 'Jindal Engravers, Mathura',
          colorsCount: cyl.colorsCount || 8,
          status: 'Under Engraving'
        },
        engraverName: cyl.engravuresName || 'Jindal Engravers, Mathura',
        orderDate: new Date().toISOString().split('T')[0],
        targetDeliveryDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        poNumber: cyl.poNumber || `PO-CYL-${cyl.sku}`,
        poIssued: cyl.poIssued || false,
        status: 'Under Engraving',
        materialRequirements: [],
        rawMaterialRequirements: [],
        calculationDetails: null
      };

      handleAddOrder(cylOrder);
    }
  };

  const handleAddCylinder = async (newCyl) => {
    if (!newCyl) return;
    requireDatabaseConnection('add cylinder');
    await saveCylinderToSupabase(newCyl);
    const targetSku = (newCyl.sku || '').trim().toLowerCase();
    const targetJobName = (newCyl.jobName || '').trim().toLowerCase();

    setCylinders(prev => {
      const matchIndex = prev.findIndex(c => 
        c.id === newCyl.id || 
        (targetSku && c.sku && c.sku.trim().toLowerCase() === targetSku) ||
        (targetJobName && c.jobName && c.jobName.trim().toLowerCase() === targetJobName)
      );

      if (matchIndex >= 0) {
        const existing = prev[matchIndex];
        const updated = { ...existing, ...newCyl, id: existing.id || newCyl.id };
        const copy = [...prev];
        copy[matchIndex] = updated;
        return copy.filter((c, idx) => {
          if (idx === matchIndex) return true;
          if (targetSku && c.sku && c.sku.trim().toLowerCase() === targetSku) return false;
          if (targetJobName && c.jobName && c.jobName.trim().toLowerCase() === targetJobName) return false;
          return true;
        });
      }
      return [newCyl, ...prev];
    });

    logAudit('CREATE', 'Cylinders', `Saved rotogravure cylinder ${newCyl.sku} for "${newCyl.jobName}"`, newCyl.id);
    syncCylinderToOrderManagement(newCyl);
    await syncCylinderToJobMaster(newCyl);
  };

  const syncCylinderToJobMaster = async (cyl) => {
    if (!cyl) return;
    const targetCylId = cyl.id;
    const targetJobMasterId = cyl.jobMasterId || cyl.job_master_id;
    const targetSku = (cyl.sku || '').trim().toLowerCase();
    const targetJobName = (cyl.jobName || '').trim().toLowerCase();

    const matchedJobMasters = (jobMasters || []).filter(j => {
      if (!j) return false;
      if (targetJobMasterId && (j.id === targetJobMasterId || String(j.id) === String(targetJobMasterId))) return true;
      if (j.cylinderId && (j.cylinderId === targetCylId || String(j.cylinderId) === String(targetCylId) || j.cylinderId === cyl.sku)) return true;
      if (j.cylinderSku && targetSku && j.cylinderSku.trim().toLowerCase() === targetSku) return true;
      if (j.skuCode && targetSku && j.skuCode.trim().toLowerCase() === targetSku) return true;
      if (j.jobName && targetJobName && j.jobName.trim().toLowerCase() === targetJobName) return true;
      return false;
    });

    if (matchedJobMasters.length === 0) return;

    const failedLinks = [];
    for (const jm of matchedJobMasters) {
      const layers = Array.isArray(cyl.layers) && cyl.layers.length > 0 ? cyl.layers : (jm.layers || []);
      const derivedStructure = (layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (cyl.structure || jm.structure || '—');

      const updatedJm = {
        ...jm,
        jobName: cyl.jobName || jm.jobName,
        clientName: cyl.clientGroup || cyl.clientName || jm.clientName,
        skuCode: cyl.sku || jm.skuCode,
        cylinderSku: cyl.sku || jm.cylinderSku || jm.skuCode,
        cylinderId: cyl.id || jm.cylinderId,
        structure: derivedStructure,
        layers: layers,
        printWidthMm: cyl.printWidthMm !== undefined && cyl.printWidthMm !== null ? Number(cyl.printWidthMm) : jm.printWidthMm,
        faceLengthMm: cyl.faceLengthMm !== undefined && cyl.faceLengthMm !== null ? Number(cyl.faceLengthMm) : jm.faceLengthMm,
        repeatLengthMm: cyl.circumferenceMm !== undefined && cyl.circumferenceMm !== null ? Number(cyl.circumferenceMm) : (cyl.repeatLengthMm !== undefined ? Number(cyl.repeatLengthMm) : jm.repeatLengthMm),
        pouchOpenWidth: cyl.pouchOpenWidth !== undefined && cyl.pouchOpenWidth !== null ? Number(cyl.pouchOpenWidth) : jm.pouchOpenWidth,
        pouchHeight: cyl.pouchHeight !== undefined && cyl.pouchHeight !== null ? Number(cyl.pouchHeight) : jm.pouchHeight,
        colorsCount: cyl.colorsCount !== undefined && cyl.colorsCount !== null ? Number(cyl.colorsCount) : jm.colorsCount,
        cylinderCost: cyl.cylinderCost || cyl.costPerCylinder || jm.cylinderCost,
        engravuresName: cyl.engravuresName || jm.engravuresName,
        costBorneBy: cyl.costBorneBy || jm.costBorneBy,
        utilisationLimit: cyl.utilisationLimit !== undefined && cyl.utilisationLimit !== null ? Number(cyl.utilisationLimit) : jm.utilisationLimit,
        artworkUrl: cyl.artworkUrl || cyl.jobCardFileUrl || jm.artworkUrl,
        jobCardFileUrl: cyl.jobCardFileUrl || cyl.artworkUrl || jm.jobCardFileUrl,
        jobCardFileName: cyl.jobCardFileName || jm.jobCardFileName,
        silLogo: cyl.silLogo !== undefined && cyl.silLogo !== null ? cyl.silLogo : jm.silLogo,
        arcMark: cyl.arcMark || jm.arcMark,
        slittingMark: cyl.slittingMark || jm.slittingMark,
        trackerLine: cyl.trackerLine || jm.trackerLine,
        specialInstructions: cyl.specialInstructions !== undefined ? cyl.specialInstructions : jm.specialInstructions,
        chkEyemark: cyl.chkEyemark ?? jm.chkEyemark,
        chkBarcode: cyl.chkBarcode ?? jm.chkBarcode,
        chkOrientation: cyl.chkOrientation ?? jm.chkOrientation,
        chkClientApproval: cyl.chkClientApproval ?? jm.chkClientApproval,
        approvedByHead: cyl.approvedByHead ?? jm.approvedByHead,
        approvedHeadName: cyl.approvedHeadName || jm.approvedHeadName,
        approvedHeadDate: cyl.approvedHeadDate || jm.approvedHeadDate,
        cylinderStatus: cyl.status || jm.cylinderStatus || jm.status,
        cylinderDetails: { ...(jm.cylinderDetails || {}), ...cyl },
        cylinderLocation: cyl.assignedPress || cyl.location || jm.cylinderLocation,
        cylinders: Array.isArray(cyl.cylinders) ? cyl.cylinders : jm.cylinders
      };

      try {
        await writeWithRetry(() => saveJobMasterToSupabase(updatedJm));
        setJobMasters(prev => prev.map(item => item.id === updatedJm.id ? updatedJm : item));
        await syncJobMasterToOrders(updatedJm);
      } catch (err) {
        if (err?.name === 'PartialSaveError') throw err;
        failedLinks.push({ label: `job master ${updatedJm.id || updatedJm.jobName}`, error: err });
      }
    }
    assertAllSaved('The cylinder was saved, but the linked job master was not updated.', failedLinks);
  };

  const syncJobMasterToCylinder = async (jobMaster) => {
    if (!jobMaster) return;
    const targetJmId = jobMaster.id;
    const targetSku = (jobMaster.skuCode || jobMaster.cylinderSku || jobMaster.sku || '').trim().toLowerCase();
    const targetJobName = (jobMaster.jobName || '').trim().toLowerCase();

    const matchedCylinders = (cylinders || []).filter(c => {
      if (!c) return false;
      if (targetJmId && (c.jobMasterId === targetJmId || c.job_master_id === targetJmId)) return true;
      if (c.sku && targetSku && c.sku.trim().toLowerCase() === targetSku) return true;
      if (c.skuCode && targetSku && c.skuCode.trim().toLowerCase() === targetSku) return true;
      if (c.jobName && targetJobName && c.jobName.trim().toLowerCase() === targetJobName) return true;
      return false;
    });

    if (matchedCylinders.length === 0) return;

    console.log(`[JOB MASTER -> CYLINDER SYNC] Syncing updated Job Master "${jobMaster.jobName}" (${jobMaster.id}) to ${matchedCylinders.length} cylinders...`);

    const failedLinks = [];
    for (const cyl of matchedCylinders) {
      const layers = Array.isArray(jobMaster.layers) && jobMaster.layers.length > 0 ? jobMaster.layers : (cyl.layers || []);
      const derivedStructure = (layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (jobMaster.structure || cyl.structure || '—');

      const updatedCyl = {
        ...cyl,
        jobMasterId: jobMaster.id,
        job_master_id: jobMaster.id,
        sku: jobMaster.skuCode || jobMaster.cylinderSku || cyl.sku,
        jobName: jobMaster.jobName || cyl.jobName,
        clientGroup: jobMaster.clientName || cyl.clientGroup || cyl.clientName,
        structure: derivedStructure,
        layers: layers,
        printWidthMm: jobMaster.printWidthMm !== undefined && jobMaster.printWidthMm !== null ? Number(jobMaster.printWidthMm) : cyl.printWidthMm,
        faceLengthMm: jobMaster.faceLengthMm !== undefined && jobMaster.faceLengthMm !== null ? Number(jobMaster.faceLengthMm) : cyl.faceLengthMm,
        circumferenceMm: jobMaster.repeatLengthMm !== undefined && jobMaster.repeatLengthMm !== null ? Number(jobMaster.repeatLengthMm) : cyl.circumferenceMm,
        pouchOpenWidth: jobMaster.pouchOpenWidth !== undefined && jobMaster.pouchOpenWidth !== null ? Number(jobMaster.pouchOpenWidth) : cyl.pouchOpenWidth,
        pouchHeight: jobMaster.pouchHeight !== undefined && jobMaster.pouchHeight !== null ? Number(jobMaster.pouchHeight) : cyl.pouchHeight,
        colorsCount: jobMaster.colorsCount !== undefined && jobMaster.colorsCount !== null ? Number(jobMaster.colorsCount) : cyl.colorsCount,
        cylinderCost: jobMaster.cylinderCost || cyl.cylinderCost,
        engravuresName: jobMaster.engravuresName || cyl.engravuresName,
        costBorneBy: jobMaster.costBorneBy || cyl.costBorneBy,
        utilisationLimit: jobMaster.utilisationLimit !== undefined && jobMaster.utilisationLimit !== null ? Number(jobMaster.utilisationLimit) : cyl.utilisationLimit,
        artworkUrl: jobMaster.artworkUrl || jobMaster.jobCardFileUrl || cyl.artworkUrl,
        jobCardFileUrl: jobMaster.jobCardFileUrl || jobMaster.artworkUrl || cyl.jobCardFileUrl,
        silLogo: jobMaster.silLogo !== undefined && jobMaster.silLogo !== null ? jobMaster.silLogo : cyl.silLogo,
        arcMark: jobMaster.arcMark || cyl.arcMark,
        slittingMark: jobMaster.slittingMark || cyl.slittingMark,
        trackerLine: jobMaster.trackerLine || cyl.trackerLine,
        specialInstructions: jobMaster.specialInstructions !== undefined ? jobMaster.specialInstructions : cyl.specialInstructions,
        chkEyemark: jobMaster.chkEyemark ?? cyl.chkEyemark,
        chkBarcode: jobMaster.chkBarcode ?? cyl.chkBarcode,
        chkOrientation: jobMaster.chkOrientation ?? cyl.chkOrientation,
        chkClientApproval: jobMaster.chkClientApproval ?? cyl.chkClientApproval,
        approvedByHead: jobMaster.approvedByHead ?? cyl.approvedByHead,
        approvedHeadName: jobMaster.approvedHeadName || cyl.approvedHeadName,
        approvedHeadDate: jobMaster.approvedHeadDate || cyl.approvedHeadDate
      };

      try {
        await writeWithRetry(() => saveCylinderToSupabase(updatedCyl));
        setCylinders(prev => prev.map(item => item.id === updatedCyl.id ? updatedCyl : item));
      } catch (err) {
        failedLinks.push({ label: `cylinder ${updatedCyl.sku || updatedCyl.id}`, error: err });
      }
    }
    assertAllSaved('The job master was saved, but the linked cylinder was not updated.', failedLinks);
  };

  const handleBatchAddCylinders = async (newCylList) => {
    if (!Array.isArray(newCylList) || newCylList.length === 0) return;
    requireDatabaseConnection('batch add cylinders');
    await saveCylinderBatchToSupabase(newCylList);
    setCylinders(prev => {
      const map = new Map();
      (prev || []).forEach(c => {
        const k = (c.sku || c.jobName || String(c.id)).trim().toLowerCase();
        if (k) map.set(k, c);
      });
      newCylList.forEach(c => {
        const k = (c.sku || c.jobName || String(c.id)).trim().toLowerCase();
        if (k) {
          const existing = map.get(k);
          map.set(k, { ...(existing || {}), ...c });
        }
      });
      return Array.from(map.values());
    });

    logAudit('CREATE', 'Cylinders', `Bulk uploaded ${newCylList.length} cylinder job(s) via CSV`, 'BULK_CSV');
    for (const c of newCylList) {
      await syncCylinderToJobMaster(c);
    }
  };

  const handleUpdateCylinder = async (updatedCyl) => {
    if (!updatedCyl) return;
    requireDatabaseConnection('update cylinder');
    await saveCylinderToSupabase(updatedCyl);
    const targetSku = (updatedCyl.sku || '').trim().toLowerCase();
    const targetJobName = (updatedCyl.jobName || '').trim().toLowerCase();

    setCylinders(prev => {
      const matchIndex = prev.findIndex(c => 
        c.id === updatedCyl.id || 
        (targetSku && c.sku && c.sku.trim().toLowerCase() === targetSku) ||
        (targetJobName && c.jobName && c.jobName.trim().toLowerCase() === targetJobName)
      );

      if (matchIndex >= 0) {
        const existing = prev[matchIndex];
        const merged = { ...existing, ...updatedCyl, id: existing.id || updatedCyl.id };
        const copy = [...prev];
        copy[matchIndex] = merged;
        return copy.filter((c, idx) => {
          if (idx === matchIndex) return true;
          if (targetSku && c.sku && c.sku.trim().toLowerCase() === targetSku) return false;
          if (targetJobName && c.jobName && c.jobName.trim().toLowerCase() === targetJobName) return false;
          return true;
        });
      }
      return [updatedCyl, ...prev];
    });

    logAudit('UPDATE', 'Cylinders', `Updated rotogravure cylinder ${updatedCyl.sku} for "${updatedCyl.jobName}"`, updatedCyl.id);
    syncCylinderToOrderManagement(updatedCyl);
    await syncCylinderToJobMaster(updatedCyl);
  };

  const handleDeleteCylinder = async (cylId) => {
    requireDatabaseConnection('delete cylinder');
    await deleteCylinderFromSupabase(cylId);
    setCylinders(prev => prev.filter(c => c.id !== cylId));
    logAudit('DELETE', 'Cylinders', `Deleted rotogravure cylinder ${cylId}`, cylId);
  };

  const handleAddRoll = async (newRoll) => {
    requireDatabaseConnection('add inventory roll');
    const rollId = newRoll.barcodeId || newRoll.id;
    const cleanRoll = { ...newRoll, id: rollId, barcodeId: rollId };
    await saveInventoryRollToSupabase(cleanRoll);
    setInventoryRolls(prev => [cleanRoll, ...prev.filter(r => (r.barcodeId || r.id) !== rollId)]);
    logAudit('CREATE', 'Inventory Rolls', `Generated child roll barcode ${rollId} (${newRoll.netWeightKg} kg)`, rollId);
  };

  const handleUpdateRoll = async (updatedRoll) => {
    requireDatabaseConnection('update inventory roll');
    const rollId = updatedRoll.barcodeId || updatedRoll.id;
    const cleanRoll = { ...updatedRoll, id: rollId, barcodeId: rollId };
    await saveInventoryRollToSupabase(cleanRoll);
    setInventoryRolls(prev => prev.map(r => (r.barcodeId || r.id) === rollId ? cleanRoll : r));
    logAudit('UPDATE', 'Inventory Rolls', `Updated roll barcode ${rollId} status to "${updatedRoll.status || updatedRoll.qcStatus}"`, rollId);
  };

  const handleUpdateInventoryRolls = async (updatedRollsList) => {
    if (!Array.isArray(updatedRollsList) || updatedRollsList.length === 0) return;
    requireDatabaseConnection('update inventory rolls');
    const saved = [];
    const failed = [];
    for (const roll of updatedRollsList) {
      const rollId = roll.barcodeId || roll.id;
      const cleanRoll = { ...roll, id: rollId, barcodeId: rollId };
      try {
        await writeWithRetry(() => saveInventoryRollToSupabase(cleanRoll));
        saved.push(cleanRoll);
      } catch (error) {
        failed.push({ label: `inventory roll ${rollId}`, error });
      }
    }
    if (saved.length > 0) {
      setInventoryRolls(prev => mergeRollsIntoList(prev, saved));
    }
    assertAllSaved('Some inventory rolls were saved. The rolls listed below were not, and they are not shown as updated.', failed);
  };

  const handleAddDispatchShipment = async (newShipment) => {
    requireDatabaseConnection('create dispatch shipment');
    await saveDispatchShipmentToSupabase(newShipment);
    setDispatchShipments(prev => [newShipment, ...prev.filter(s => s.id !== newShipment.id)]);
    logAudit('CREATE', 'Dispatch', `Created client dispatch shipment ${newShipment.id} for "${newShipment.clientName}"`, newShipment.id);

    // 1. Reduce dispatched FG quantities from sfgGoods (FG Store)
    const shipmentItems = Array.isArray(newShipment.items) ? newShipment.items : [];
    const totalDispatchNetKg = Number(newShipment.totalNetWeightKg) || shipmentItems.reduce((s, it) => s + (Number(it.netWeightKg) || 0), 0);
    const shipJobName = (newShipment.jobName || '').trim().toLowerCase();
    const shipOrderId = newShipment.orderId;

    const failedFollowUps = [];
    const sfgPlan = planDispatchSfgDeductions(sfgGoods, newShipment);
    const sfgResult = await commitSequentialUpdates(sfgPlan.updates, (row) => saveSFGGoodToSupabase(row));
    setSfgGoods(applyCommittedByIndex(sfgGoods, sfgResult.committed));
    failedFollowUps.push(...sfgResult.failed);

    // 2. Synchronize to inventoryRolls (Finished Goods inventory)
    const rollPlan = planDispatchRollDeductions(inventoryRolls, newShipment);
    const rollResult = await commitSequentialUpdates(rollPlan.updates, (row) => saveInventoryRollToSupabase(row));
    setInventoryRolls(applyCommittedByIndex(inventoryRolls, rollResult.committed));
    failedFollowUps.push(...rollResult.failed);

    // 3. Synchronize to respective Job Production Record
    const matchedRec = (productionRecords || []).find(r => 
      (shipOrderId && String(r.orderId) === String(shipOrderId)) || 
      (shipJobName && (r.jobName || '').trim().toLowerCase() === shipJobName)
    );

    if (matchedRec) {
      const prevDispatchKg = Number(matchedRec.qtyDispatch) || 0;
      const newDispatchKg = Math.round((prevDispatchKg + totalDispatchNetKg) * 100) / 100;

      // Update outputRolls status to 'Dispatched'
      const existingOutputRolls = Array.isArray(matchedRec.outputRolls) ? matchedRec.outputRolls : [];
      let remDispatchForRolls = totalDispatchNetKg;
      const updatedOutputRolls = existingOutputRolls.map(or => {
        const isMatch = shipmentItems.some(it => 
          (it.barcodeId && (or.barcodeId === it.barcodeId || or.rollId === it.barcodeId)) ||
          (it.sourceFgBarcode && (or.barcodeId === it.sourceFgBarcode || or.rollId === it.sourceFgBarcode))
        );
        if (isMatch) {
          return {
            ...or,
            status: 'Dispatched',
            dispatchedKg: Number(or.netWeightKg) || 0,
            availableKg: 0
          };
        }
        if ((or.rollType === 'FG' || (or.stage || '').includes('Slitting') || (or.stage || '').includes('Pouching')) && or.status !== 'Dispatched' && remDispatchForRolls > 0) {
          const rNet = Number(or.netWeightKg) || 0;
          if (remDispatchForRolls >= rNet - 0.1) {
            remDispatchForRolls -= rNet;
            return {
              ...or,
              status: 'Dispatched',
              dispatchedKg: rNet,
              availableKg: 0
            };
          }
        }
        return or;
      });

      const existingDispatches = Array.isArray(matchedRec.dispatchHistory) ? matchedRec.dispatchHistory : [];
      const updatedRec = {
        ...matchedRec,
        qtyDispatch: newDispatchKg,
        outputRolls: updatedOutputRolls,
        rollsBreakdown: updatedOutputRolls,
        dispatchHistory: [
          {
            dispatchId: newShipment.dispatchId || newShipment.id,
            date: newShipment.dispatchDate || new Date().toISOString(),
            netWeightKg: totalDispatchNetKg,
            vehicleNo: newShipment.vehicleNo || '',
            clientName: newShipment.clientName || '',
            totalRolls: shipmentItems.length
          },
          ...existingDispatches
        ]
      };

      try {
        await writeWithRetry(() => saveProductionRecordToSupabase(updatedRec));
        setProductionRecords(prev => prev.map(r => r.id === updatedRec.id ? updatedRec : r));
      } catch (e) {
        failedFollowUps.push({ label: `production record ${updatedRec.id || updatedRec.jobName || 'dispatch quantity'}`, error: e });
      }
    }

    const packingId = newShipment.dispatchId || newShipment.id;
    assertAllSaved(
      `Packing list ${packingId} was saved. Do not create this packing list again. The shipment is on the dispatch list, but the stock balances below were left unchanged.`,
      failedFollowUps
    );
  };

  const handleDeleteDispatchShipment = async (id) => {
    requireDatabaseConnection('delete dispatch shipment');
    await deleteDispatchShipmentFromSupabase(id);
    setDispatchShipments(prev => prev.filter(s => String(s.dispatchId || s.id) !== String(id)));
    logAudit('DELETE', 'Dispatch', `Deleted Packing List / Dispatch Shipment ${id}`, id);
  };

  const handleSaveDeliveryChallan = async (newDc) => {
    requireDatabaseConnection('save delivery challan');
    await saveDeliveryChallanToSupabase(newDc);
    setDeliveryChallans(prev => [newDc, ...prev.filter(d => d.id !== newDc.id)]);
    logAudit('CREATE', 'Dispatch', `Issued Delivery Challan ${newDc.challanNo} for "${newDc.clientName}"`, newDc.id);
  };

  const handleDeleteDeliveryChallan = async (id) => {
    requireDatabaseConnection('delete delivery challan');
    await deleteDeliveryChallanFromSupabase(id);
    setDeliveryChallans(prev => prev.filter(d => d.id !== id));
    logAudit('DELETE', 'Dispatch', `Deleted Delivery Challan ${id}`, id);
  };

  const handleSaveCoA = async (newCoa) => {
    requireDatabaseConnection('save CoA');
    await saveCertificateOfAnalysisToSupabase(newCoa);
    setCertificateOfAnalyses(prev => [newCoa, ...prev.filter(c => c.id !== newCoa.id)]);
    logAudit('CREATE', 'Quality', `Generated Quality CoA ${newCoa.coaNo} for "${newCoa.jobName}"`, newCoa.id);
  };

  const handleDeleteCoA = async (id) => {
    requireDatabaseConnection('delete CoA');
    await deleteCertificateOfAnalysisFromSupabase(id);
    setCertificateOfAnalyses(prev => prev.filter(c => c.id !== id));
    logAudit('DELETE', 'Quality', `Deleted Quality CoA ${id}`, id);
  };

  const handleAddClient = async (newClient) => {
    requireDatabaseConnection('add client');
    await saveClientToSupabase(newClient);
    setClients(prev => [...prev.filter(c => c.id !== newClient.id), newClient]);
    logAudit('CREATE', 'Clients', `Saved client directory entry "${newClient.name}" (${newClient.id})`, newClient.id);
  };

  const handleUpdateClient = async (updatedClient) => {
    requireDatabaseConnection('update client');
    await saveClientToSupabase(updatedClient);
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    logAudit('UPDATE', 'Clients', `Updated client directory entry "${updatedClient.name}" (${updatedClient.id})`, updatedClient.id);
  };

  const handleDeleteClient = async (clientId) => {
    requireDatabaseConnection('delete client');
    await deleteClientFromSupabase(clientId);
    setClients(prev => prev.filter(c => c.id !== clientId));
    logAudit('DELETE', 'Clients', `Deleted client directory entry ${clientId}`, clientId);
  };

  const handleAddJobMaster = async (newJobMaster) => {
    requireDatabaseConnection('add job master');
    await saveJobMasterToSupabase(newJobMaster);
    setJobMasters(prev => [...prev.filter(j => j.id !== newJobMaster.id), newJobMaster]);
    logAudit('CREATE', 'Job Masters', `Created job master template "${newJobMaster.jobName}" (${newJobMaster.id})`, newJobMaster.id);
    await syncJobMasterToCylinder(newJobMaster);
  };

  const syncJobMasterToOrders = async (updatedJm) => {
    if (!updatedJm) return;
    const targetJmId = updatedJm.id || updatedJm.jobMasterId;
    const targetJobName = (updatedJm.jobName || '').toLowerCase().trim();

    // Find all matching orders in system
    const matchingOrders = (orders || []).filter(o => {
      if (!o) return false;
      if (targetJmId && (o.jobMasterId === targetJmId || String(o.jobMasterId) === String(targetJmId))) return true;
      if (targetJobName && (o.jobName || '').toLowerCase().trim() === targetJobName) return true;
      return false;
    });

    if (matchingOrders.length === 0) return;

    console.log(`[JOB MASTER SYNC] Syncing updated Job Master "${updatedJm.jobName}" (${updatedJm.id}) to ${matchingOrders.length} orders...`);

    const updatedOrdersList = [];
    const failedOrders = [];
    for (const order of matchingOrders) {
      // Retain existing order's locked structure, layers & rawMaterialRequirements!
      const lockedStructure = (order.structure && order.structure !== '—' && order.structure !== 'PET / PE') 
        ? order.structure 
        : (order.jobDetails?.structure && order.jobDetails.structure !== '—' ? order.jobDetails.structure : updatedJm.structure);

      const lockedLayers = (Array.isArray(order.layers) && order.layers.length > 0)
        ? order.layers
        : ((Array.isArray(order.jobDetails?.layers) && order.jobDetails.layers.length > 0) ? order.jobDetails.layers : updatedJm.layers);

      const updatedOrder = {
        ...order,
        jobMasterId: updatedJm.id || order.jobMasterId,
        jobName: updatedJm.jobName || order.jobName,
        clientName: updatedJm.clientName || order.clientName,
        structure: lockedStructure,
        layers: lockedLayers,
        materialFormat: updatedJm.materialForm || updatedJm.orderType || order.materialFormat || order.orderType,
        orderType: updatedJm.materialForm || updatedJm.orderType || order.orderType || order.materialFormat,
        printWidthMm: updatedJm.printWidthMm !== undefined && updatedJm.printWidthMm !== null ? Number(updatedJm.printWidthMm) : order.printWidthMm,
        repeatLengthMm: updatedJm.repeatLengthMm !== undefined && updatedJm.repeatLengthMm !== null ? Number(updatedJm.repeatLengthMm) : order.repeatLengthMm,
        pouchOpenWidth: updatedJm.pouchOpenWidth !== undefined && updatedJm.pouchOpenWidth !== null ? Number(updatedJm.pouchOpenWidth) : order.pouchOpenWidth,
        pouchHeight: updatedJm.pouchHeight !== undefined && updatedJm.pouchHeight !== null ? Number(updatedJm.pouchHeight) : order.pouchHeight,
        pouchType: updatedJm.pouchType || order.pouchType,
        colorsCount: updatedJm.colorsCount !== undefined && updatedJm.colorsCount !== null ? Number(updatedJm.colorsCount) : order.colorsCount,
        cylinderSku: updatedJm.cylinderSku || order.cylinderSku,
        cylinderCost: updatedJm.cylinderCost || order.cylinderCost,
        engravuresName: updatedJm.engravuresName || order.engravuresName,
        costBorneBy: updatedJm.costBorneBy || order.costBorneBy,
        variant: updatedJm.variant || order.variant,
        printing: updatedJm.printing || order.printing,
        invoiceTo: updatedJm.invoiceTo || order.invoiceTo,
        shellSize: updatedJm.shellSize || order.shellSize,
        petSize: updatedJm.petSize || order.petSize,
        inkGsm: updatedJm.inkGsm !== undefined ? Number(updatedJm.inkGsm) : (order.inkGsm ?? 1.5),
        adhesiveGsm: updatedJm.adhesiveGsm !== undefined ? Number(updatedJm.adhesiveGsm) : (order.adhesiveGsm ?? 1.5),
        wastagePct: updatedJm.wastagePct !== undefined ? Number(updatedJm.wastagePct) : (order.wastagePct ?? 5),
        pressMarks: updatedJm.pressMarks || order.pressMarks,
        artworkUrl: updatedJm.artworkUrl || order.artworkUrl,
        specialInstructions: updatedJm.specialInstructions !== undefined ? updatedJm.specialInstructions : order.specialInstructions,
        jobDetails: {
          ...(order.jobDetails || {}),
          jobName: updatedJm.jobName || order.jobName,
          clientName: updatedJm.clientName || order.clientName,
          structure: lockedStructure,
          layers: lockedLayers,
          printWidthMm: updatedJm.printWidthMm !== undefined && updatedJm.printWidthMm !== null ? Number(updatedJm.printWidthMm) : order.jobDetails?.printWidthMm,
          repeatLengthMm: updatedJm.repeatLengthMm !== undefined && updatedJm.repeatLengthMm !== null ? Number(updatedJm.repeatLengthMm) : order.jobDetails?.repeatLengthMm,
          pouchOpenWidth: updatedJm.pouchOpenWidth !== undefined && updatedJm.pouchOpenWidth !== null ? Number(updatedJm.pouchOpenWidth) : order.jobDetails?.pouchOpenWidth,
          pouchHeight: updatedJm.pouchHeight !== undefined && updatedJm.pouchHeight !== null ? Number(updatedJm.pouchHeight) : order.jobDetails?.pouchHeight,
          pouchType: updatedJm.pouchType || order.jobDetails?.pouchType,
          colorsCount: updatedJm.colorsCount !== undefined && updatedJm.colorsCount !== null ? Number(updatedJm.colorsCount) : order.jobDetails?.colorsCount,
          inkGsm: updatedJm.inkGsm !== undefined ? Number(updatedJm.inkGsm) : (order.jobDetails?.inkGsm ?? 1.5),
          adhesiveGsm: updatedJm.adhesiveGsm !== undefined ? Number(updatedJm.adhesiveGsm) : (order.jobDetails?.adhesiveGsm ?? 1.5),
          wastagePct: updatedJm.wastagePct !== undefined ? Number(updatedJm.wastagePct) : (order.jobDetails?.wastagePct ?? 5),
          pressMarks: updatedJm.pressMarks || order.jobDetails?.pressMarks,
          artworkUrl: updatedJm.artworkUrl || order.jobDetails?.artworkUrl
        }
      };

      try {
        await writeWithRetry(() => saveOrderToSupabase(updatedOrder));
        updatedOrdersList.push(updatedOrder);
      } catch (err) {
        failedOrders.push({ label: `order ${updatedOrder.id}`, error: err });
      }
    }

    if (updatedOrdersList.length > 0) {
      const updatedMap = new Map(updatedOrdersList.map(o => [o.id, o]));
      setOrders(prev => prev.map(o => updatedMap.get(o.id) || o));
    }
    assertAllSaved('The job master was saved, but these linked orders were not updated.', failedOrders);
  };

  const handleUpdateJobMaster = async (updatedJobMaster) => {
    requireDatabaseConnection('update job master');
    await saveJobMasterToSupabase(updatedJobMaster);
    setJobMasters(prev => prev.map(j => j.id === updatedJobMaster.id ? updatedJobMaster : j));
    await syncJobMasterToOrders(updatedJobMaster);
    await syncJobMasterToCylinder(updatedJobMaster);
    logAudit('UPDATE', 'Job Masters', `Updated job master template "${updatedJobMaster.jobName}" (${updatedJobMaster.id})`, updatedJobMaster.id);
  };

  const handleDeleteJobMaster = async (jobMasterId) => {
    requireDatabaseConnection('delete job master');
    await deleteJobMasterFromSupabase(jobMasterId);
    setJobMasters(prev => prev.filter(j => j.id !== jobMasterId));
    logAudit('DELETE', 'Job Masters', `Deleted job master record ${jobMasterId}`, jobMasterId);
  };

  const handleBatchAddJobMasters = async (newJmList) => {
    if (!Array.isArray(newJmList) || newJmList.length === 0) return;
    requireDatabaseConnection('batch add job masters');
    await saveJobMasterBatchToSupabase(newJmList);
    setJobMasters(prev => {
      const map = new Map();
      (prev || []).forEach(j => {
        const k = (j.skuCode || j.sku || j.jobName || String(j.id)).trim().toLowerCase();
        if (k) map.set(k, j);
      });
      newJmList.forEach(j => {
        const k = (j.skuCode || j.sku || j.jobName || String(j.id)).trim().toLowerCase();
        if (k) {
          const existing = map.get(k);
          map.set(k, { ...(existing || {}), ...j });
        }
      });
      return Array.from(map.values());
    });

    logAudit('CREATE', 'Job Masters', `Bulk uploaded ${newJmList.length} Job Master template(s) via CSV`, 'BULK_CSV');
    for (const jm of newJmList) {
      await syncJobMasterToCylinder(jm);
    }
  };

  const handleLinkCylinderToJobMaster = async (cylinderId, jobMasterId) => {
    if (!cylinderId || !jobMasterId) return;
    const targetJm = (jobMasters || []).find(j => j.id === jobMasterId || j.skuCode === jobMasterId);
    const targetCyl = (cylinders || []).find(c => c.id === cylinderId || c.sku === cylinderId);

    if (targetCyl) {
      const updatedCyl = {
        ...targetCyl,
        jobMasterId: jobMasterId,
        job_master_id: jobMasterId,
        sku: targetJm?.skuCode || targetCyl.sku
      };
      await handleUpdateCylinder(updatedCyl);
    }

    if (targetJm) {
      const updatedJm = {
        ...targetJm,
        cylinderSku: targetCyl?.sku || targetJm.cylinderSku,
        cylinderId: cylinderId
      };
      await handleUpdateJobMaster(updatedJm);
    }
  };

  const handleCreateAndLinkPair = async ({ cylinder, jobMaster }) => {
    if (cylinder) {
      await handleAddCylinder(cylinder);
    }
    if (jobMaster) {
      await handleAddJobMaster(jobMaster);
    }
  };

  // Ink Management Handlers & Inventory Synchronization
  const syncInkToInventory = async (ink, overrideStock = null) => {
    if (!ink) return;
    const invId = ink.productCode || ink.id;
    const invItem = sanitizeInventoryItem({
      id: invId,
      itemCode: ink.productCode || invId,
      itemName: `${ink.manufacturer || 'DIC Inks'} ${ink.shade} (${ink.inkType || 'Reverse Ink'})`,
      category: 'Printing Inks',
      unit: 'Kg',
      availableQtyKg: overrideStock !== null ? Number(overrideStock) : (ink.stockQtyKg !== undefined ? Number(ink.stockQtyKg) : 0),
      allocatedQtyKg: 0,
      reorderLevelKg: Number(ink.reorderLevelKg || 50),
      unitPrice: Number(ink.pricePerKg || 300),
      purchaseRatePerKg: Number(ink.pricePerKg || 300),
      location: 'Ink Store Room',
      lastVendor: ink.manufacturer || ink.supplierName || 'DIC Inks',
      lastBatch: `LOT-${ink.productCode}`,
      micron: '-',
      widthMm: '-'
    });
    const alreadyStocked = (inventory || []).some(i => i.id === invId || i.itemCode === ink.productCode);
    if (!alreadyStocked && overrideStock === null) return;
    await writeWithRetry(() => saveInventoryItemToSupabase(invItem));
    setInventory(prev => {
      const exists = (prev || []).some(i => i.id === invId || i.itemCode === ink.productCode);
      if (!exists && overrideStock === null) return prev;
      const updated = exists
        ? prev.map(i => (i.id === invId || i.itemCode === ink.productCode) ? { ...i, ...invItem, availableQtyKg: overrideStock !== null ? Number(overrideStock) : i.availableQtyKg } : i)
        : [invItem, ...prev];
      return updated.map(sanitizeInventoryItem);
    });
  };

  const handleAddInk = async (newInk) => {
    requireDatabaseConnection('add ink');
    await saveInkToSupabase(newInk);
    setInks(prev => [newInk, ...prev.filter(i => i.id !== newInk.id)]);
    try {
      await syncInkToInventory(newInk, newInk.stockQtyKg);
    } catch (error) {
      throw new PartialSaveError(unsavedItemsMessage({
        completed: `Ink ${newInk.productCode || newInk.id} was saved.`,
        failed: [{ label: `inventory stock for ${newInk.productCode || newInk.id}`, error }]
      }));
    }
    logAudit('CREATE', 'Ink Management', `Added ink product code "${newInk.productCode}" - ${newInk.shade} (${newInk.inkType}, ${newInk.solidContentPct}% solid)`, newInk.id);
  };

  const handleUpdateInk = async (updatedInk) => {
    requireDatabaseConnection('update ink');
    await saveInkToSupabase(updatedInk);
    setInks(prev => prev.map(i => i.id === updatedInk.id ? updatedInk : i));
    try {
      await syncInkToInventory(updatedInk);
    } catch (error) {
      throw new PartialSaveError(unsavedItemsMessage({
        completed: `Ink ${updatedInk.productCode || updatedInk.id} was saved.`,
        failed: [{ label: `inventory stock for ${updatedInk.productCode || updatedInk.id}`, error }]
      }));
    }
    logAudit('UPDATE', 'Ink Management', `Updated ink product code "${updatedInk.productCode}" - ${updatedInk.shade}`, updatedInk.id);
  };

  const handleUpdateInkPrice = async (updatedInk, newPrice, reason) => {
    requireDatabaseConnection('update ink price');
    await saveInkToSupabase(updatedInk);
    setInks(prev => prev.map(i => i.id === updatedInk.id ? updatedInk : i));
    try {
      await syncInkToInventory({ ...updatedInk, pricePerKg: newPrice });
    } catch (error) {
      throw new PartialSaveError(unsavedItemsMessage({
        completed: `Ink price for ${updatedInk.productCode || updatedInk.id} was saved.`,
        failed: [{ label: `inventory price for ${updatedInk.productCode || updatedInk.id}`, error }]
      }));
    }
    logAudit('UPDATE', 'Ink Management', `Updated rate for ink "${updatedInk.productCode}" (${updatedInk.shade}) to ₹${newPrice}/kg. Reason: ${reason}`, updatedInk.id);
  };

  const handleDeleteInk = async (inkId) => {
    requireDatabaseConnection('delete ink');
    await deleteInkFromSupabase(inkId);
    await deleteInventoryItemFromSupabase(inkId);
    setInks(prev => prev.filter(i => i.id !== inkId));
    setInventory(prev => prev.filter(i => i.id !== inkId && i.itemCode !== inkId));
    logAudit('DELETE', 'Ink Management', `Deleted ink product code ${inkId}`, inkId);
  };

  // SFG Store & Consumed SFG Handlers
  const handleSaveSFGGood = async (item) => {
    requireDatabaseConnection('save SFG item');
    await saveSFGGoodToSupabase(item);
    setSfgGoods(prev => {
      const idx = prev.findIndex(s => s.id === item.id || s.sfgBatchCode === item.sfgBatchCode);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = item;
        return updated;
      }
      return [item, ...prev];
    });
    logAudit('CREATE', 'SFG Store', `Saved SFG Batch "${item.sfgBatchCode}" for job "${item.jobName}"`, item.id || item.sfgBatchCode);
  };

  const handleConsumeSFG = async (updatedSfgItem, logEntry) => {
    requireDatabaseConnection('consume SFG item');
    await writeWithRetry(() => saveSFGGoodToSupabase(updatedSfgItem));
    const followUpFailures = [];

    // 1. Update SFG Goods State
    setSfgGoods(prev => {
      const idx = prev.findIndex(s => s.id === updatedSfgItem.id || s.sfgBatchCode === updatedSfgItem.sfgBatchCode);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = updatedSfgItem;
        return updated;
      }
      return [updatedSfgItem, ...prev];
    });

    // 2. Also synchronize deduction to inventory_rolls if this item is a roll
    const rollBarcode = updatedSfgItem.sfgBatchCode || updatedSfgItem.id;
    const rollMatch = (inventoryRolls || []).find(r => (r.barcodeId || r.id) === rollBarcode);
    if (rollMatch) {
      const newAvail = Math.max(0, Number(updatedSfgItem.availableKg ?? (Number(rollMatch.availableWeightKg || rollMatch.netWeightKg || 0) - Number(logEntry.consumedKg || 0))));
      const updatedRoll = {
        ...rollMatch,
        availableWeightKg: newAvail,
        status: newAvail <= 0 ? 'Consumed' : (rollMatch.status || 'In Stock (SFG)')
      };
      try {
        await writeWithRetry(() => saveInventoryRollToSupabase(updatedRoll));
        setInventoryRolls(prev => prev.map(r => ((r.barcodeId || r.id) === rollBarcode) ? updatedRoll : r));
      } catch (e) {
        followUpFailures.push({ label: `inventory roll ${rollBarcode}`, error: e });
      }
    }

    // 3. Also synchronize deduction to central inventory if present
    const invMatch = (inventory || []).find(i => i.id === rollBarcode || i.itemCode === rollBarcode);
    if (invMatch) {
      const newAvail = Math.max(0, Number(updatedSfgItem.availableKg ?? (Number(invMatch.availableQtyKg || invMatch.stockQtyKg || 0) - Number(logEntry.consumedKg || 0))));
      const updatedInv = {
        ...invMatch,
        availableQtyKg: newAvail,
        stockQtyKg: newAvail,
        allocatedQtyKg: Number(updatedSfgItem.consumedKg ?? ((invMatch.allocatedQtyKg || 0) + Number(logEntry.consumedKg || 0)))
      };
      try {
        await writeWithRetry(() => saveInventoryItemToSupabase(updatedInv));
        setInventory(prev => prev.map(i => (i.id === invMatch.id) ? updatedInv : i));
      } catch (e) {
        followUpFailures.push({ label: `inventory item ${invMatch.id}`, error: e });
      }
    }

    // 4. Synchronize Substrate 2 / Substrate 3 roll deduction if provided.
    // Several substrate 2 rolls deduct one by one. A single substrate 2 or substrate 3 roll uses the original path.
    const multiSubstrate2 = Array.isArray(logEntry.substrate2Rolls) && logEntry.substrate2Rolls.length > 0
      ? logEntry.substrate2Rolls
      : null;
    if (multiSubstrate2) {
      for (const subInfo of multiSubstrate2) {
        if (!subInfo || !subInfo.barcode) continue;
        const subBarcode = String(subInfo.barcode).trim();
        const subConsumed = Number(subInfo.consumedKg) || 0;
        const subRollMatch = (inventoryRolls || []).find(r => (r.barcodeId || r.id) === subBarcode);
        if (subRollMatch && subConsumed > 0) {
          const prevAvail = Number(subRollMatch.availableWeightKg ?? subRollMatch.netWeightKg ?? 0);
          const newSubAvail = Math.max(0, prevAvail - subConsumed);
          const updatedSubRoll = {
            ...subRollMatch,
            availableWeightKg: newSubAvail,
            status: newSubAvail <= 0 ? 'Consumed' : (subRollMatch.status || 'In Stock')
          };
          try {
            await writeWithRetry(() => saveInventoryRollToSupabase(updatedSubRoll));
            setInventoryRolls(prev => prev.map(r => ((r.barcodeId || r.id) === subBarcode) ? updatedSubRoll : r));
          } catch (e) {
            followUpFailures.push({ label: `substrate roll ${subBarcode}`, error: e });
          }
        }
      }
    }
    const subInfo = multiSubstrate2 ? null : (logEntry.substrate2 || logEntry.substrate3);
    if (subInfo && subInfo.barcode) {
      const subBarcode = subInfo.barcode.trim();
      const subConsumed = Number(subInfo.consumedKg) || 0;
      const subRollMatch = (inventoryRolls || []).find(r => (r.barcodeId || r.id) === subBarcode);
      if (subRollMatch && subConsumed > 0) {
        const prevAvail = Number(subRollMatch.availableWeightKg ?? subRollMatch.netWeightKg ?? 0);
        const newSubAvail = Math.max(0, prevAvail - subConsumed);
        const updatedSubRoll = {
          ...subRollMatch,
          availableWeightKg: newSubAvail,
          status: newSubAvail <= 0 ? 'Consumed' : (subRollMatch.status || 'In Stock')
        };
        try {
          await writeWithRetry(() => saveInventoryRollToSupabase(updatedSubRoll));
          setInventoryRolls(prev => prev.map(r => ((r.barcodeId || r.id) === subBarcode) ? updatedSubRoll : r));
        } catch (e) {
          followUpFailures.push({ label: `substrate roll ${subBarcode}`, error: e });
        }
      }
    }

    const targetOrderId = updatedSfgItem.orderId || logEntry.orderId;
    const targetJobName = (updatedSfgItem.jobName || logEntry.jobName || '').trim().toLowerCase();

    // 5. Create and persist new SFG or FG Output Roll if produced
    const outRoll = logEntry.outputRoll;
    let createdOutputBarcode = null;
    const isFG = outRoll?.outputType === 'FG' || logEntry.targetProcess === 'Slitting & Rewinding' || logEntry.targetProcess === 'Pouching / Bag Making';

    if (outRoll && Number(outRoll.netWeightKg) > 0) {
      createdOutputBarcode = outRoll.barcode || `${isFG ? 'FG' : (outRoll.outputType || 'SFG')}-BC-${targetOrderId || Date.now()}-${Date.now().toString().slice(-4)}`;
      const outputNetKg = Number(outRoll.netWeightKg) || 0;
      const outputGrossKg = Number(outRoll.grossWeightKg) || outputNetKg;
      const outputTareKg = Number(outRoll.tareWeightKg) || 0;

      const newSfgGoodItem = {
        id: createdOutputBarcode,
        sfgBatchCode: createdOutputBarcode,
        sfgType: isFG ? 'Finished Goods (FG)' : 'Laminated / Processed Rolls',
        category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
        rollType: isFG ? 'FG' : 'SFG',
        orderId: targetOrderId,
        jobCode: updatedSfgItem.jobCode || '',
        jobName: updatedSfgItem.jobName || 'Untitled Job',
        clientName: updatedSfgItem.clientName || '',
        filmType: updatedSfgItem.filmType || '',
        micron: updatedSfgItem.micron || 0,
        widthMm: updatedSfgItem.widthMm || 0,
        totalGrossKg: outputGrossKg,
        totalNetKg: outputNetKg,
        consumedKg: 0,
        availableKg: outputNetKg,
        dispatchedKg: 0,
        pouchCount: Number(logEntry.pouchCount) || Number(outRoll.pouchCount) || 0,
        rollsCount: 1,
        machineName: logEntry.targetMachine || '',
        operatorName: logEntry.operatorName || '',
        shift: logEntry.shift || '',
        storageBay: outRoll.storageBay || (isFG ? 'FG Warehouse' : 'Bay A'),
        productionDate: logEntry.date || new Date().toISOString().split('T')[0],
        status: isFG ? 'Ready for Dispatch' : 'In Stock (WIP)',
        notes: isFG ? `Finished Goods derived from ${logEntry.targetProcess} of ${updatedSfgItem.sfgBatchCode}` : `Produced from ${logEntry.targetProcess} of ${updatedSfgItem.sfgBatchCode}`,
        consumptionHistory: []
      };

      const newInventoryRoll = {
        id: createdOutputBarcode,
        barcodeId: createdOutputBarcode,
        rollType: isFG ? 'FINISHED_GOODS' : 'SEMI_FINISHED_GOODS',
        category: isFG ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
        jobName: updatedSfgItem.jobName || 'Untitled Job',
        jobCode: updatedSfgItem.jobCode || '',
        orderId: targetOrderId || '',
        clientName: updatedSfgItem.clientName || '',
        customerName: updatedSfgItem.clientName || '',
        filmType: updatedSfgItem.filmType || '',
        micron: updatedSfgItem.micron || 0,
        widthMm: updatedSfgItem.widthMm || 0,
        grossWeightKg: outputGrossKg,
        tareWeightKg: outputTareKg,
        netWeightKg: outputNetKg,
        availableWeightKg: outputNetKg,
        dispatchedKg: 0,
        pouchCount: Number(logEntry.pouchCount) || Number(outRoll.pouchCount) || 0,
        machineName: logEntry.targetMachine || '',
        operatorName: logEntry.operatorName || '',
        shift: logEntry.shift || '',
        locationBay: outRoll.storageBay || (isFG ? 'FG Warehouse' : 'Bay A'),
        status: isFG ? 'Ready for Dispatch' : 'In Stock (SFG)',
        sfgType: isFG ? 'Finished Goods (FG)' : 'Laminated Rolls',
        remarks: isFG ? `Finished Goods derived from ${logEntry.targetProcess}` : `Produced from ${logEntry.targetProcess}`,
        inwardDatetime: new Date().toISOString(),
        productionDate: logEntry.date || new Date().toISOString().split('T')[0]
      };

      try {
        await writeWithRetry(() => saveSFGGoodToSupabase(newSfgGoodItem));
        setSfgGoods(prev => [newSfgGoodItem, ...prev]);
      } catch (e) {
        followUpFailures.push({ label: `output roll ${createdOutputBarcode} in sfg_goods`, error: e });
      }

      try {
        await writeWithRetry(() => saveInventoryRollToSupabase(newInventoryRoll));
        setInventoryRolls(prev => [newInventoryRoll, ...prev]);
      } catch (e) {
        followUpFailures.push({ label: `output roll ${createdOutputBarcode} in inventory rolls`, error: e });
      }
    }

    const multiOutputs = Array.isArray(logEntry.outputRolls) && logEntry.outputRolls.length > 1
      ? logEntry.outputRolls
      : null;
    if (multiOutputs) {
      try {
        const childRecords = buildChildStockRecords({
          parentItem: updatedSfgItem,
          logEntry,
          outputRolls: multiOutputs
        });
        await writeWithRetry(() => saveConsumeChildRolls(childRecords));
        setSfgGoods(prev => [...childRecords.map((record) => record.sfg), ...prev]);
        setInventoryRolls(prev => [...childRecords.map((record) => record.roll), ...prev]);
      } catch (e) {
        followUpFailures.push({ label: `child output rolls (${multiOutputs.length})`, error: e });
      }
    }

    // 6. Sync to Job's Production Record (Pre-fill Stage Quantities & Scrap Wastage)
    let matchedRec = (productionRecords || []).find(r => 
      (targetOrderId && String(r.orderId) === String(targetOrderId)) || 
      (r.jobName && (r.jobName || '').trim().toLowerCase() === targetJobName)
    );

    const scrap = logEntry.scrapBreakdown || {};
    const stage = logEntry.targetProcess;
    const outNetKg = multiOutputs
      ? multiOutputs.reduce((sum, roll) => sum + (Number(roll.netWeightKg) || 0), 0)
      : (Number(logEntry.outputRoll?.netWeightKg) || 0);
    const outGrossKg = Number(logEntry.outputRoll?.grossWeightKg) || outNetKg;
    const outTareKg = Number(logEntry.outputRoll?.tareWeightKg) || 0;
    const finalOutBarcode = createdOutputBarcode || logEntry.outputRoll?.barcode;

    const round2 = (v) => parseFloat((Number(v) || 0).toFixed(2));

    let stageUpdates = {};
    if (stage === 'Lamination (Pass 1)') {
      stageUpdates = {
        qtyLaminationL1: round2((Number(matchedRec?.qtyLaminationL1) || 0) + outNetKg),
        adhesiveConsumedL1Kg: round2((Number(matchedRec?.adhesiveConsumedL1Kg) || 0) + (Number(scrap.adhesiveConsumedL1Kg) || 0)),
        laminationPlainSubstrateWastageKg: round2((Number(matchedRec?.laminationPlainSubstrateWastageKg) || 0) + (Number(scrap.laminationPlainSubstrateWastageKg) || 0)),
        laminateWastageKg: round2((Number(matchedRec?.laminateWastageKg) || 0) + (Number(scrap.laminateWastageKg) || 0))
      };
    } else if (stage === 'Lamination (Pass 2)') {
      stageUpdates = {
        qtySecondPassL2: round2((Number(matchedRec?.qtySecondPassL2) || 0) + outNetKg),
        adhesiveConsumedL2Kg: round2((Number(matchedRec?.adhesiveConsumedL2Kg) || 0) + (Number(scrap.adhesiveConsumedL2Kg) || 0)),
        laminationPlainSubstrateWastageL2Kg: round2((Number(matchedRec?.laminationPlainSubstrateWastageL2Kg) || 0) + (Number(scrap.laminationPlainSubstrateWastageL2Kg) || 0)),
        laminateWastageKg: round2((Number(matchedRec?.laminateWastageKg) || 0) + (Number(scrap.laminateWastageKg) || 0))
      };
    } else if (stage === 'Printing (Pass 2)') {
      stageUpdates = {
        printingPlainSettingWastageKg: round2((Number(matchedRec?.printingPlainSettingWastageKg) || 0) + (Number(scrap.printingPlainSettingWastageKg) || 0)),
        printingWastageKg: round2((Number(matchedRec?.printingWastageKg) || 0) + (Number(scrap.printingWastageKg) || 0)),
        ...(outNetKg > 0 ? { qtyFirstPassL1: round2((Number(matchedRec?.qtyFirstPassL1) || 0) + outNetKg) } : {})
      };
    } else if (stage === 'Slitting & Rewinding') {
      stageUpdates = {
        qtySlitting: round2((Number(matchedRec?.qtySlitting) || 0) + outNetKg),
        trimWastageKg: round2((Number(matchedRec?.trimWastageKg) || 0) + (Number(scrap.slittingTrimScrapKg) || 0)),
        slittingSettingWastageKg: round2((Number(matchedRec?.slittingSettingWastageKg) || 0) + (Number(scrap.slittingSettingWastageKg) || 0)),
        slittingScrapKg: round2((Number(matchedRec?.slittingScrapKg) || 0) + (Number(scrap.slittingScrapKg) || 0))
      };
    } else if (stage === 'Pouching / Bag Making') {
      stageUpdates = {
        qtyPouching: round2((Number(matchedRec?.qtyPouching) || 0) + outNetKg),
        zipperConsumedKg: round2((Number(matchedRec?.zipperConsumedKg) || 0) + (Number(scrap.zipperConsumedKg) || 0)),
        pouchingScrapKg: round2((Number(matchedRec?.pouchingScrapKg) || 0) + (Number(scrap.pouchingScrapKg) || 0)),
        pouchCount: Math.round((Number(matchedRec?.pouchCount) || 0) + (multiOutputs
          ? multiOutputs.reduce((sum, roll) => sum + (Number(roll.pouchCount) || 0), 0)
          : (Number(logEntry.pouchCount) || Number(outRoll?.pouchCount) || 0)))
      };
    }

    const currentOutputRolls = Array.isArray(matchedRec?.outputRolls) ? matchedRec.outputRolls : [];
    let newOutputRolls = [...currentOutputRolls];
    if (multiOutputs) {
      multiOutputs.forEach((roll, idx) => {
        const rollNet = Number(roll.netWeightKg) || 0;
        const rollBarcode = roll.barcode;
        if (!(rollNet > 0) || !rollBarcode) return;
        const rollIsFg = roll.outputType === 'FG' || stage === 'Slitting & Rewinding' || stage === 'Pouching / Bag Making';
        newOutputRolls.push({
          rollNo: `Roll #${currentOutputRolls.length + idx + 1}`,
          rollId: rollBarcode,
          barcodeId: rollBarcode,
          grossWeightKg: Number(roll.grossWeightKg) || rollNet,
          tareWeightKg: Number(roll.tareWeightKg) || 0,
          netWeightKg: rollNet,
          availableKg: rollNet,
          dispatchedKg: 0,
          rollType: rollIsFg ? 'FG' : (roll.outputType || 'SFG'),
          status: rollIsFg ? 'Ready for Dispatch' : 'In Stock (SFG)',
          stage: stage,
          pouchCount: Number(roll.pouchCount) || 0,
          operator: logEntry.operatorName || '',
          createdAt: new Date().toISOString(),
          parentSfgBatchCode: roll.parentSfgBatchCode || updatedSfgItem.sfgBatchCode || ''
        });
      });
    } else if (outNetKg > 0 && finalOutBarcode) {
      newOutputRolls.push({
        rollNo: `Roll #${currentOutputRolls.length + 1}`,
        rollId: finalOutBarcode,
        barcodeId: finalOutBarcode,
        grossWeightKg: outGrossKg,
        tareWeightKg: outTareKg,
        netWeightKg: outNetKg,
        availableKg: outNetKg,
        dispatchedKg: 0,
        rollType: isFG ? 'FG' : (logEntry.outputRoll?.outputType || 'SFG'),
        status: isFG ? 'Ready for Dispatch' : 'In Stock (SFG)',
        stage: stage,
        pouchCount: Number(logEntry.pouchCount) || Number(outRoll?.pouchCount) || 0,
        operator: logEntry.operatorName || '',
        createdAt: new Date().toISOString()
      });
    }

    const existingLogs = Array.isArray(matchedRec?.sfgConsumptions) ? matchedRec.sfgConsumptions : [];
    const updatedRec = {
      ...(matchedRec || {
        id: `PROD-REC-${Date.now()}`,
        orderId: targetOrderId || `ORD-${Date.now()}`,
        jobName: updatedSfgItem.jobName || 'Untitled Job',
        clientName: updatedSfgItem.clientName || 'General Client',
        operatorName: logEntry.operatorName || 'Plant Operator',
        shift: logEntry.shift || 'Day Shift',
        status: 'Pending Plant Approval',
        dateFilled: logEntry.date || new Date().toISOString().split('T')[0]
      }),
      ...stageUpdates,
      outputRolls: newOutputRolls,
      rollsBreakdown: newOutputRolls,
      sfgConsumptions: [logEntry, ...existingLogs]
    };

    try {
      await writeWithRetry(() => saveProductionRecordToSupabase(updatedRec));
      if (matchedRec) {
        setProductionRecords(prev => prev.map(r => r.id === updatedRec.id ? updatedRec : r));
      } else {
        setProductionRecords(prev => [updatedRec, ...prev]);
      }
    } catch (e) {
      followUpFailures.push({ label: `production record ${updatedRec.id || updatedSfgItem.jobName || 'stage quantities'}`, error: e });
    }

    logAudit('UPDATE', 'SFG Store', `Consumed ${logEntry.consumedKg} kg SFG from batch "${updatedSfgItem.sfgBatchCode}" for stage "${logEntry.targetProcess}". Remaining Balance: ${updatedSfgItem.availableKg} kg`, updatedSfgItem.sfgBatchCode);
    assertAllSaved(
      `SFG consumption for ${updatedSfgItem.sfgBatchCode} was saved (${updatedSfgItem.availableKg} kg remaining). Do not submit this consumption again.`,
      followUpFailures
    );
  };

  const handleDeleteSFGGood = async (sfgId) => {
    requireDatabaseConnection('delete SFG item');
    await deleteSFGGoodFromSupabase(sfgId);
    setSfgGoods(prev => prev.filter(s => s.id !== sfgId && s.sfgBatchCode !== sfgId));
    logAudit('DELETE', 'SFG Store', `Deleted SFG record ${sfgId}`, sfgId);
  };


  const handlePunchOrderFromJobMaster = (jobMaster) => {
    setSelectedJobMasterForPunch(jobMaster);
    handleTabChange('job_punching', jobMaster?.id ? { jobMasterId: jobMaster.id } : {});
  };

  const isDataReady = databaseStatus !== 'checking' && (!isAuthenticated || isDataFetched || (!isDataLoading && !ordersLoading));

  // isSigningIn is cleared only by the loader's onComplete. The bar will not
  // pass 92% until isReady, so isReady must not require !isSigningIn.
  const showBootLoader = shouldShowBootLoader({
    isAuthReady,
    isSigningIn,
    isAuthenticated,
    isDataReady,
  });
  if (showBootLoader) {
    return (
      <Preloader 
        isReady={bootLoaderIsReady({ isAuthReady, isDataReady })}
        statusText={
          databaseStatus === 'checking'
            ? 'Connecting to Supabase Cloud Database...'
            : (isDataLoading || ordersLoading)
              ? 'Loading Job Masters, Inventory & Production Records...'
              : undefined
        }
        onComplete={() => {
          setIsSigningIn(false);
        }} 
      />
    );
  }

  // Render Authentication Screen if user is not signed in
  if (mustSetPassword || !isAuthenticated || !currentUser) {
    return (
      <div data-module="login" data-section={mustSetPassword ? 'recovery' : (routeInfo.section || 'signin')}>
      <AuthScreen
        onLogin={handleLogin}
        recoveryMode={mustSetPassword}
        initialView={routeInfo.section === 'forgot-password' ? 'forgot_password' : 'signin'}
        onViewChange={(mode) => {
          const section = mode === 'forgot_password' ? 'forgot-password' : 'signin';
          const href = pushSlugState('login', { section });
          setRouteInfo({ tab: 'login', section, params: { section }, unknown: false, canonical: href });
        }}
        onPasswordUpdated={async () => {
          recoveryHandledRef.current = true;
          passwordRecoveryRef.current = false;
          if (typeof window !== 'undefined') {
            window.history.replaceState({ tab: 'dashboard' }, '', '/dashboard');
          }
          setMustSetPassword(false);
          const profile = await fetchSessionProfile();
          if (profile && !profile.pending && !profile.inactive) {
            applyAuthenticatedProfile(profile);
          }
        }}
      />
      </div>
    );
  }

  const moduleOpen = !routeInfo.unknown && isTabAllowed(activeTab);

  return (
    <div
      className="app-container"
      data-module={routeInfo.unknown ? 'not-found' : (activeTab || '')}
      data-section={routeInfo.unknown ? 'not-found' : (routeInfo.section || '')}
    >
      {/* Mobile Top Header Bar */}
      <div className="mobile-header-bar">
        <button className="hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
          <svg style={{ width: '24px', height: '24px', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} viewBox="0 0 24 24">
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="18" x2="20" y2="18"></line>
          </svg>
        </button>
        <div className="mobile-header-title">
          <img src="/samyak-logo.png" alt="Samyak Logo" style={{ height: '24px', objectFit: 'contain' }} />
          <span style={{ fontSize: '0.9rem', letterSpacing: '0.05em' }}>Samyak Flexi-ERP</span>
        </div>
        <div style={{ width: '38px' }} />
      </div>

      {isMobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        {/* Header Branding */}
        <div className="sidebar-brand-header">
          <div className="sidebar-logo-container">
            <img src="/samyak-logo.png" alt="Samyak International Ltd" className="sidebar-logo-img" />
          </div>
          <div className="sidebar-brand-meta">
            <div className="sidebar-plant-badge">
              <span className="pulse-dot"></span>
              Indore Plant
            </div>
            <span className="sidebar-gstin">23AABCM3526F1ZY</span>
          </div>
        </div>

        {/* Quick Action: Scan Barcode & 2D QR Inspector */}
        <div style={{ padding: '4px 12px 10px 12px' }}>
          <button
            type="button"
            onClick={() => setIsBarcodeScannerOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '9px 12px',
              fontSize: '0.84rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.25), 0 2px 4px -2px rgba(2, 132, 199, 0.25)',
              transition: 'all 0.15s ease'
            }}
            title="Universal Barcode & 2D QR Inspector (Alt+B)"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px', borderRadius: '6px', display: 'flex' }}>
                <ScanBarcode size={16} />
              </div>
              <span>Scan Barcode</span>
            </div>
            <span style={{ fontSize: '0.68rem', background: 'rgba(255, 255, 255, 0.2)', padding: '2px 6px', borderRadius: '4px', opacity: 0.9 }}>
              Alt+B
            </span>
          </button>
        </div>

        <div className="nav-links">
          {/* Group 1: Analytics & Executive */}
          {(isTabAllowed('dashboard') || isTabAllowed('sales') || isTabAllowed('scrap_analytics')) && (
            <>
              <div className="sidebar-section-header">Analytics & Executive</div>
              
              {isTabAllowed('dashboard') && (
                <div 
                  className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => handleTabChange('dashboard')}
                >
                  <span className="nav-icon-box" style={{ color: '#0284c7' }}>
                    <LayoutDashboard size={18} />
                  </span>
                  <span>Executive Dashboard</span>
                </div>
              )}

              {isTabAllowed('sales') && (
                <div 
                  className={`nav-item ${activeTab === 'sales' ? 'active' : ''}`}
                  onClick={() => handleTabChange('sales')}
                >
                  <span className="nav-icon-box" style={{ color: '#2563eb' }}>
                    <ShoppingBag size={18} />
                  </span>
                  <span>Sales & Quotations</span>
                </div>
              )}

              {isTabAllowed('scrap_analytics') && (
                <div 
                  className={`nav-item ${activeTab === 'scrap_analytics' ? 'active' : ''}`}
                  onClick={() => handleTabChange('scrap_analytics')}
                >
                  <span className="nav-icon-box" style={{ color: '#dc2626' }}>
                    <AlertTriangle size={18} />
                  </span>
                  <span>Scrap & Wastage</span>
                </div>
              )}
            </>
          )}

          {/* Group 2: Orders & Job Pre-Costing */}
          {(isTabAllowed('job_punching') || isTabAllowed('orders') || isTabAllowed('job_masters') || isTabAllowed('clients')) && (
            <>
              <div className="sidebar-section-header">Orders & Pre-Costing</div>

              {isTabAllowed('job_punching') && (
                <div 
                  className={`nav-item ${activeTab === 'job_punching' ? 'active' : ''}`}
                  onClick={() => handleTabChange('job_punching')}
                >
                  <span className="nav-icon-box" style={{ color: '#d97706' }}>
                    <Calculator size={18} />
                  </span>
                  <span>Job Punching & Costing</span>
                </div>
              )}

              {isTabAllowed('orders') && (
                <div 
                  className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
                  onClick={() => handleTabChange('orders')}
                >
                  <span className="nav-icon-box" style={{ color: '#4f46e5' }}>
                    <FileText size={18} />
                  </span>
                  <span>Order Management</span>
                  {delayedOrdersCount > 0 && (
                    <span className="nav-badge-pill nav-badge-danger">
                      {delayedOrdersCount} Delayed
                    </span>
                  )}
                </div>
              )}

              {isTabAllowed('job_masters') && (
                <div 
                  className={`nav-item ${activeTab === 'job_masters' ? 'active' : ''}`}
                  onClick={() => handleTabChange('job_masters')}
                >
                  <span className="nav-icon-box" style={{ color: '#7c3aed' }}>
                    <FileCode size={18} />
                  </span>
                  <span>Job Master Directory</span>
                  <span className="nav-badge-pill nav-badge-neutral">
                    {(jobMasters || []).length}
                  </span>
                </div>
              )}

              {isTabAllowed('clients') && (
                <div 
                  className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`}
                  onClick={() => handleTabChange('clients')}
                >
                  <span className="nav-icon-box" style={{ color: '#0891b2' }}>
                    <Briefcase size={18} />
                  </span>
                  <span>Clients Directory</span>
                  <span className="nav-badge-pill nav-badge-neutral">
                    {(clients || []).length}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Group 3: Plant Operations */}
          {(isTabAllowed('printing_scheduler') || isTabAllowed('production_records') || isTabAllowed('sfg_store') || isTabAllowed('cylinders')) && (
            <>
              <div className="sidebar-section-header">Plant Operations</div>

              {isTabAllowed('printing_scheduler') && (
                <div 
                  className={`nav-item ${activeTab === 'printing_scheduler' ? 'active' : ''}`}
                  onClick={() => handleTabChange('printing_scheduler')}
                >
                  <span className="nav-icon-box" style={{ color: '#2563eb' }}>
                    <Printer size={18} />
                  </span>
                  <span>Printing Scheduler</span>
                </div>
              )}

              {isTabAllowed('production_records') && (
                <div 
                  className={`nav-item ${activeTab === 'production_records' ? 'active' : ''}`}
                  onClick={() => handleTabChange('production_records')}
                >
                  <span className="nav-icon-box" style={{ color: '#059669' }}>
                    <ClipboardList size={18} />
                  </span>
                  <span>Production Records</span>
                  {pendingProductionApprovalCount > 0 && (
                    <span className="nav-badge-pill nav-badge-warning">
                      {pendingProductionApprovalCount} Pending
                    </span>
                  )}
                </div>
              )}

              {isTabAllowed('sfg_store') && (
                <div 
                  className={`nav-item ${activeTab === 'sfg_store' ? 'active' : ''}`}
                  onClick={() => handleTabChange('sfg_store')}
                >
                  <span className="nav-icon-box" style={{ color: '#8b5cf6' }}>
                    <Layers size={18} />
                  </span>
                  <span>SFG & FG Store</span>
                  <span className="nav-badge-pill nav-badge-neutral">
                    {(sfgGoods || []).length}
                  </span>
                </div>
              )}

              {isTabAllowed('cylinders') && (
                <div 
                  className={`nav-item ${activeTab === 'cylinders' ? 'active' : ''}`}
                  onClick={() => handleTabChange('cylinders')}
                >
                  <span className="nav-icon-box" style={{ color: '#475569' }}>
                    <Layers size={18} />
                  </span>
                  <span>Rotogravure Cylinders</span>
                </div>
              )}
            </>
          )}

          {/* Group 4: Supply Chain & Logistics */}
          {(isTabAllowed('inventory') || isTabAllowed('purchase_orders') || isTabAllowed('ink_management') || isTabAllowed('material_indents') || isTabAllowed('vendors') || isTabAllowed('dispatch')) && (
            <>
              <div className="sidebar-section-header">Supply Chain & Store</div>

              {isTabAllowed('purchase_orders') && (
                <div 
                  className={`nav-item ${activeTab === 'purchase_orders' ? 'active' : ''}`}
                  onClick={() => handleTabChange('purchase_orders')}
                >
                  <span className="nav-icon-box" style={{ color: '#4f46e5' }}>
                    <ShoppingBag size={18} />
                  </span>
                  <span>Purchase Orders</span>
                  {(purchaseOrders || []).length > 0 && (
                    <span className="nav-badge-pill nav-badge-neutral">
                      {(purchaseOrders || []).length}
                    </span>
                  )}
                </div>
              )}

              {isTabAllowed('inventory') && (
                <div 
                  className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
                  onClick={() => handleTabChange('inventory')}
                >
                  <span className="nav-icon-box" style={{ color: '#0284c7' }}>
                    <Package size={18} />
                  </span>
                  <span>Inventory, GRN & QC</span>
                  {pendingQCGRNsCount > 0 && (
                    <span className="nav-badge-pill nav-badge-warning">
                      {pendingQCGRNsCount} QC
                    </span>
                  )}
                </div>
              )}

              {isTabAllowed('ink_management') && (
                <div 
                  className={`nav-item ${activeTab === 'ink_management' ? 'active' : ''}`}
                  onClick={() => handleTabChange('ink_management')}
                >
                  <span className="nav-icon-box" style={{ color: '#6366f1' }}>
                    <Droplet size={18} />
                  </span>
                  <span>Ink Master & Costing</span>
                  {((inks || []).filter(i => (parseFloat(i.stockQtyKg) || 0) < (parseFloat(i.reorderLevelKg) || 0)).length) > 0 && (
                    <span className="nav-badge-pill nav-badge-danger">
                      {(inks || []).filter(i => (parseFloat(i.stockQtyKg) || 0) < (parseFloat(i.reorderLevelKg) || 0)).length} Alert
                    </span>
                  )}
                </div>
              )}

              {isTabAllowed('material_indents') && (
                <div 
                  className={`nav-item ${activeTab === 'material_indents' ? 'active' : ''}`}
                  onClick={() => handleTabChange('material_indents')}
                >
                  <span className="nav-icon-box" style={{ color: '#0d9488' }}>
                    <ClipboardList size={18} />
                  </span>
                  <span>Material Indents & Store</span>
                </div>
              )}

              {isTabAllowed('pellet_fuel') && (
                <div 
                  className={`nav-item ${activeTab === 'pellet_fuel' ? 'active' : ''}`}
                  onClick={() => handleTabChange('pellet_fuel')}
                >
                  <span className="nav-icon-box" style={{ color: '#d97706' }}>
                    <Flame size={18} />
                  </span>
                  <span>Pellet Fuel Stock Management</span>
                </div>
              )}

              {isTabAllowed('vendors') && (
                <div 
                  className={`nav-item ${activeTab === 'vendors' ? 'active' : ''}`}
                  onClick={() => handleTabChange('vendors')}
                >
                  <span className="nav-icon-box" style={{ color: '#475569' }}>
                    <Building2 size={18} />
                  </span>
                  <span>Vendor Directory</span>
                  <span className="nav-badge-pill nav-badge-neutral">
                    {(vendors || []).length}
                  </span>
                </div>
              )}

              {isTabAllowed('dispatch') && (
                <div 
                  className={`nav-item ${activeTab === 'dispatch' ? 'active' : ''}`}
                  onClick={() => handleTabChange('dispatch')}
                >
                  <span className="nav-icon-box" style={{ color: '#0284c7' }}>
                    <Truck size={18} />
                  </span>
                  <span>Dispatch & Challans</span>
                </div>
              )}
            </>
          )}

          {/* Group: Human Resources & Payroll */}
          {(isTabAllowed('employees') || currentUser?.role === 'Admin' || currentUser?.role === 'HR & Payroll Manager') && (
            <>
              <div className="sidebar-section-header">Workforce & HR</div>

              {isTabAllowed('employees') && (
                <div 
                  className={`nav-item ${activeTab === 'employees' ? 'active' : ''}`}
                  onClick={() => handleTabChange('employees')}
                >
                  <span className="nav-icon-box" style={{ color: '#059669' }}>
                    <UserCheck size={18} />
                  </span>
                  <span>Employee Management</span>
                  <span className="nav-badge-pill nav-badge-neutral">
                    {(employees || []).length}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Group 5: System Admin */}
          {(isTabAllowed('user_management') || isTabAllowed('supabase') || isTabAllowed('doc_settings') || currentUser?.role === 'Admin') && (
            <>
              <div className="sidebar-section-header">System Admin</div>

              {isTabAllowed('user_management') && (
                <div 
                  className={`nav-item ${activeTab === 'user_management' ? 'active' : ''}`}
                  onClick={() => handleTabChange('user_management')}
                >
                  <span className="nav-icon-box" style={{ color: '#475569' }}>
                    <Users size={18} />
                  </span>
                  <span>User Access (RBAC)</span>
                </div>
              )}

              {isTabAllowed('supabase') && (
                <div 
                  className={`nav-item ${activeTab === 'supabase' ? 'active' : ''}`}
                  onClick={() => handleTabChange('supabase')}
                >
                  <span className="nav-icon-box" style={{ color: '#10b981' }}>
                    <Database size={18} />
                  </span>
                  <span>Supabase Connection</span>
                </div>
              )}

              {isTabAllowed('doc_settings') && (
                <div 
                  className={`nav-item ${activeTab === 'doc_settings' ? 'active' : ''}`}
                  onClick={() => handleTabChange('doc_settings')}
                >
                  <span className="nav-icon-box" style={{ color: '#6366f1' }}>
                    <SettingsIcon size={18} />
                  </span>
                  <span>System Settings</span>
                </div>
              )}

              {currentUser?.role === 'Admin' && (
                <div 
                  className={`nav-item ${activeTab === 'audit_logs' ? 'active' : ''}`}
                  onClick={() => handleTabChange('audit_logs')}
                >
                  <span className="nav-icon-box" style={{ color: '#ef4444' }}>
                    <ShieldAlert size={18} />
                  </span>
                  <span>System Audit Logs</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Status Card */}
        <div className="sidebar-footer-card">
          <div>
            <div style={{ fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="pulse-dot"></span>
              {currentUser?.name || 'Logged User'}
            </div>
            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '1px' }}>
              Role: <b>{currentUser?.role}</b>
            </div>
          </div>
          <button 
            type="button"
            className="icon-btn-secondary" 
            onClick={handleLogout}
            title="Logout User Session"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '4px' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '700' }}>
              {routeInfo.unknown && 'Page not found'}
              {!routeInfo.unknown && !isTabAllowed(activeTab) && 'Access restricted'}
              {moduleOpen && activeTab === 'dashboard' && 'Executive Operations Dashboard'}
              {moduleOpen && activeTab === 'sales' && 'Sales Management Engine'}
              {moduleOpen && activeTab === 'production_records' && 'Job Production Records & Approval Workflow'}
              {moduleOpen && activeTab === 'job_punching' && 'Order Confirmation & Job Punching'}
              {moduleOpen && activeTab === 'orders' && 'Order Management & PO Issuance'}
              {moduleOpen && activeTab === 'job_masters' && 'Job Master Technical Directory & Specs'}
              {moduleOpen && activeTab === 'clients' && 'Client Onboarding & Directory'}
              {moduleOpen && activeTab === 'vendors' && 'Vendor Onboarding & Directory'}
              {moduleOpen && activeTab === 'purchase_orders' && 'Purchase Order Management & Procurement Engine'}
              {moduleOpen && activeTab === 'inventory' && 'Raw Material Inventory, GRN & Quality Control'}
              {moduleOpen && activeTab === 'ink_management' && 'Ink Master Directory, Solid Costing & Stock Management'}
              {moduleOpen && activeTab === 'material_indents' && 'Material Indents Requisitions & Consumable Store'}
              {moduleOpen && activeTab === 'pellet_fuel' && 'Boiler Pellet Fuel Stock & Consumption Management'}
              {moduleOpen && activeTab === 'dispatch' && 'Finished Goods Dispatch, Delivery Challan & Quality CoA Hub'}
              {moduleOpen && activeTab === 'user_management' && 'Departmental User Management (RBAC)'}
              {moduleOpen && activeTab === 'cylinders' && 'Rotogravure Cylinder Database'}
              {moduleOpen && activeTab === 'printing_scheduler' && 'Printing Machine Production Scheduler & Time Board'}
              {moduleOpen && activeTab === 'supabase' && 'Supabase Cloud Database & API Service'}
              {moduleOpen && activeTab === 'doc_settings' && 'Letterhead Signature & Series Settings'}
            </h1>



            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Samyak International Ltd — Flexible Packaging Manufacturing OS
            </p>
          </div>

          {/* Top Bar Active User & Logout Controls (ACCOUNT / ROLE SWITCHER) */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {/* Database Health Badge - Concise Icon & Status Dot */}
            <div 
              onClick={() => runDatabaseHealthCheck()}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '6px', 
                padding: '6px 10px', 
                borderRadius: '20px', 
                cursor: 'pointer',
                background: databaseStatus === 'connected' ? '#ecfdf5' : (databaseStatus === 'checking' ? '#fef3c7' : '#fef2f2'),
                color: databaseStatus === 'connected' ? '#047857' : (databaseStatus === 'checking' ? '#b45309' : '#dc2626'),
                border: `1px solid ${databaseStatus === 'connected' ? '#a7f3d0' : (databaseStatus === 'checking' ? '#fde68a' : '#fecaca')}`,
                transition: 'all 0.2s ease'
              }}
              title={`Database Status: ${databaseStatus.toUpperCase()} (Supabase PostgreSQL). Click to test connection.`}
            >
              <Database size={16} style={{ color: databaseStatus === 'connected' ? '#059669' : (databaseStatus === 'checking' ? '#d97706' : '#dc2626') }} />
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: databaseStatus === 'connected' ? '#10b981' : (databaseStatus === 'checking' ? '#f59e0b' : '#ef4444'),
                boxShadow: databaseStatus === 'connected' ? '0 0 6px #10b981' : 'none'
              }} />
            </div>

            <WeighingScaleWidget />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>
              <UserCheck size={16} style={{ color: 'var(--primary-brand)' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Active User:</span>
              <SearchableSelect 
                style={{ minWidth: '180px', display: 'inline-block' }}
                triggerStyle={{ 
                  border: 'none', 
                  background: 'transparent', 
                  fontWeight: '700', 
                  color: 'var(--text-primary)', 
                  padding: '2px 8px',
                  minHeight: '28px'
                }}
                disabled={!(sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin')}
                value={currentUser?.id || ''}
                options={activeUserOptions}
                onChange={e => {
                  const selectedId = e.target.value;
                  const selectedUser = activeUsersList.find(u => String(u.id) === String(selectedId));
                  if (selectedUser && sessionProfile?.role === 'Admin') {
                    setCurrentUser(selectedUser);
                    try { sessionStorage.setItem('samyak_erp_ui_role_preview', JSON.stringify(selectedUser)); } catch (e) {}
                  }
                }}
              />
            </div>

            <button className="btn-signout" onClick={handleLogout} title="Sign Out of Session">
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>

        {/* Database Disconnected / Read-Only Banner */}
        {databaseStatus !== 'connected' && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px 18px',
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '0.9rem' }}>
                  DATABASE DISCONNECTED / READ-ONLY MODE
                </div>
                <div style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '2px' }}>
                  Supabase PostgreSQL connection is unavailable. All write operations, forms, and updates are disabled to prevent data corruption.
                  {databaseErrorMessage && ` (${databaseErrorMessage})`}
                </div>
              </div>
            </div>
            <button
              onClick={() => runDatabaseHealthCheck()}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontWeight: '700',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={14} className={databaseStatus === 'checking' ? 'spin' : ''} />
              {databaseStatus === 'checking' ? 'Testing...' : 'Retry Connection'}
            </button>
          </div>
        )}

        {routeInfo.unknown && (
          <div className="glass-panel" data-screen="not-found" style={{ padding: '40px', textAlign: 'center', margin: '20px 0' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700' }}>This page is not in the ERP</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px' }}>
              The address stays in the browser so the link can be checked. Nothing was redirected to the dashboard.
            </p>
            <button className="btn-primary" style={{ marginTop: '16px' }} onClick={() => handleTabChange('dashboard')}>
              Go to dashboard
            </button>
          </div>
        )}

        {!routeInfo.unknown && !isTabAllowed(activeTab) && (
          <div className="glass-panel" data-screen="forbidden" style={{ padding: '40px', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a', margin: '20px 0' }}>
            <Lock size={48} style={{ color: '#d97706', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#b45309' }}>
              Module Access Restricted for Role ({currentUser?.role})
            </h3>
            <p style={{ color: '#92400e', fontSize: '0.85rem', marginTop: '6px', maxWidth: '500px', margin: '6px auto 16px auto' }}>
              Your active role <b>{currentUser?.role}</b> has not been granted permission to view this module in the RBAC permissions matrix.
            </p>
            <button className="btn-primary" onClick={() => handleTabChange('dashboard')}>
              Return to Executive Dashboard
            </button>
          </div>
        )}

        {/* TAB 1: EXECUTIVE DASHBOARD / OPERATOR DASHBOARD */}
        {moduleOpen && activeTab === 'dashboard' && currentUser?.role === 'Printing Operator' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff', borderRadius: '12px' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Printer size={24} /> Printing Operator Station & Ready Queue
              </h2>
              <p style={{ opacity: 0.9, fontSize: '0.88rem', marginTop: '4px' }}>
                Welcome, {currentUser?.name || 'Printing Operator'}. Live press jobs, specifications, and execution queue.
              </p>
            </div>
            <ProductionScheduler 
              orders={orders}
              inventory={inventory}
              inventoryRolls={inventoryRolls}
              machines={machines}
              schedules={schedules}
              jobMasters={jobMasters}
              cylinders={cylinders}
              productionRecords={productionRecords}
              currentUser={currentUser}
              initialPressQueueOrder={pressQueueOrder}
              initialPressMachineAssignments={pressMachineAssignments}
              initialPressActiveRunningJob={pressActiveRunningJob}
              onSaveMachine={handleSaveMachine}
              onUpdateMachine={handleUpdateMachine}
              onDeleteMachine={handleDeleteMachine}
              onSaveSchedule={handleSaveSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onUpdateOrder={handleUpdateOrder}
              onStartJob={handleStartPrintingJob}
              onEndJob={handleEndPrintingJob}
              onAddRoll={handleAddRoll}
              onSaveInventoryItem={handleSaveInventoryItem}
              onReorderQueue={handleReorderQueue}
              onMachineAssignmentChange={handleMachineAssignmentsChange}
              onActiveRunningJobChange={handleActiveRunningJobChange}
            />
          </div>
        ) : moduleOpen && activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Redesigned Executive Operational Alerts Hub */}
            {(delayedOrdersCount > 0 || (lowStockInks || []).length > 0) && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: (delayedOrdersCount > 0 && (lowStockInks || []).length > 0) ? 'repeat(auto-fit, minmax(420px, 1fr))' : '1fr',
                gap: '16px'
              }}>
                {/* Delayed Orders Alert Card */}
                {delayedOrdersCount > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #fffbfb 100%)',
                    border: '1px solid #fecaca',
                    borderLeft: '4px solid #dc2626',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    boxShadow: '0 2px 8px -2px rgba(220, 38, 38, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: '#fee2e2',
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <AlertTriangle size={20} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                              Delivery Deadline Overdue
                            </h3>
                            <span style={{
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em'
                            }}>
                              {delayedOrdersCount} {delayedOrdersCount === 1 ? 'Order' : 'Orders'} Delayed
                            </span>
                          </div>
                          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '3px', margin: 0, lineHeight: '1.4' }}>
                            Target delivery deadlines have lapsed. Expedite scheduling and raw material issuance.
                          </p>
                        </div>
                      </div>
                      <button 
                        className="btn-primary"
                        onClick={() => handleTabChange('orders')}
                        style={{
                          background: '#dc2626',
                          borderColor: '#dc2626',
                          padding: '7px 14px',
                          fontSize: '0.82rem',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                          borderRadius: '6px'
                        }}
                      >
                        Manage Delayed Orders <ArrowRight size={14} />
                      </button>
                    </div>

                    {/* Discrete chips of impacted orders */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '6px', borderTop: '1px dashed #fecaca' }}>
                      {delayedOrders.slice(0, 3).map(o => (
                        <span 
                          key={o.id}
                          onClick={() => handleTabChange('orders', o?.id ? { id: o.id } : {})}
                          style={{
                            background: '#fff1f2',
                            border: '1px solid #fecdd3',
                            color: '#9f1239',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          title={`Click to view ${o.jobName}`}
                        >
                          <strong>{o.id}</strong>: {o.jobName}
                          <span style={{ color: '#e11d48', fontSize: '0.7rem' }}>• Target: {o.targetDeliveryDate || 'Overdue'}</span>
                        </span>
                      ))}
                      {delayedOrdersCount > 3 && (
                        <span 
                          onClick={() => handleTabChange('orders')}
                          style={{ fontSize: '0.75rem', color: '#9f1239', alignSelf: 'center', fontWeight: '700', cursor: 'pointer' }}
                        >
                          +{delayedOrdersCount - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Low Stock Ink Alert Card */}
                {(lowStockInks || []).length > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #fffbfb 100%)',
                    border: '1px solid #fecdd3',
                    borderLeft: '4px solid #e11d48',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    boxShadow: '0 2px 8px -2px rgba(225, 29, 72, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: '#ffe4e6',
                          color: '#e11d48',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Droplet size={20} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                              Low Ink Stock Warning
                            </h3>
                            <span style={{
                              background: '#ffe4e6',
                              color: '#e11d48',
                              border: '1px solid #fecdd3',
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em'
                            }}>
                              {(lowStockInks || []).length} Inks Below Minimum
                            </span>
                          </div>
                          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '3px', margin: 0, lineHeight: '1.4' }}>
                            Plant reserve has fallen below reorder levels. Issue purchase indent to prevent press downtime.
                          </p>
                        </div>
                      </div>
                      <button 
                        className="btn-primary"
                        onClick={() => handleTabChange('ink_management')}
                        style={{
                          background: '#e11d48',
                          borderColor: '#e11d48',
                          padding: '7px 14px',
                          fontSize: '0.82rem',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(225, 29, 72, 0.25)',
                          borderRadius: '6px'
                        }}
                      >
                        Reorder Inks <ArrowRight size={14} />
                      </button>
                    </div>

                    {/* Discrete chips of low stock inks */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '6px', borderTop: '1px dashed #fecdd3' }}>
                      {(lowStockInks || []).slice(0, 3).map(i => (
                        <span 
                          key={i.id || i.productCode}
                          onClick={() => handleTabChange('ink_management', (i?.id || i?.productCode) ? { id: i.id || i.productCode } : {})}
                          style={{
                            background: '#fff1f2',
                            border: '1px solid #fecdd3',
                            color: '#9f1239',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          title={`Current Stock: ${i.stockQtyKg || 0} kg | Reorder Level: ${i.reorderLevelKg || 0} kg`}
                        >
                          <strong>{i.productCode}</strong> ({i.shade})
                          <span style={{ color: '#e11d48', fontSize: '0.7rem' }}>• {i.stockQtyKg || 0} kg left ({i.reorderLevelKg || 0} kg min)</span>
                        </span>
                      ))}
                      {(lowStockInks || []).length > 3 && (
                        <span 
                          onClick={() => handleTabChange('ink_management')}
                          style={{ fontSize: '0.75rem', color: '#9f1239', alignSelf: 'center', fontWeight: '700', cursor: 'pointer' }}
                        >
                          +{(lowStockInks || []).length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metrics Overview Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('orders')}>
                <span className="stats-title">Active Orders</span>
                <span className="stats-value">{(orders || []).length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total Qty: {(orders || []).reduce((a, b) => a + (b.orderQtyKg || 0), 0).toLocaleString()} kg
                </span>
              </div>

              <div className={`glass-card stats-card ${delayedOrdersCount > 0 ? 'card-alert-highlight' : ''}`} style={{ cursor: 'pointer' }} onClick={() => handleTabChange('orders')}>
                <span className="stats-title" style={{ color: delayedOrdersCount > 0 ? '#dc2626' : '' }}>Delayed Orders (Red)</span>
                <span className="stats-value" style={delayedOrdersCount > 0 ? { color: '#dc2626' } : {}}>
                  {delayedOrdersCount}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>
                  Action required in Order Management
                </span>
              </div>

              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('inventory')}>
                <span className="stats-title">Available Film Stock</span>
                <span className="stats-value">
                  {(inventory || []).reduce((a, b) => a + (parseFloat(b.availableQtyKg) || 0), 0).toLocaleString()} <span style={{ fontSize: '1rem' }}>kg</span>
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Across {(inventory || []).length} film grades</span>
              </div>

              {/* Average Ink Cost (100% Solid Equivalent) Card */}
              <div className="glass-card stats-card" style={{ cursor: 'pointer', borderLeft: '4px solid #6366f1' }} onClick={() => handleTabChange('ink_management')}>
                <span className="stats-title" style={{ color: '#4f46e5', fontWeight: '700' }}>Avg Ink Cost (100% Solid Eq.)</span>
                <span className="stats-value" style={{ color: '#4f46e5', fontSize: '1.5rem', fontWeight: '800' }}>
                  ₹ {avgSolidEqInkCost.toFixed(2)} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ kg</span>
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Based on solid content % across {(inks || []).length} active inks
                </span>
              </div>

              {/* RBAC Protected Total Stock Purchase Valuation Card */}
              {(isTabAllowed('inventory') || currentUser?.role === 'Admin' || currentUser?.role === 'Plant Manager') && (
                <div className="glass-card stats-card" style={{ cursor: 'pointer', borderLeft: '4px solid #047857' }} onClick={() => handleTabChange('inventory')}>
                  <span className="stats-title" style={{ color: '#047857', fontWeight: '700' }}>Total Stock Purchase Valuation</span>
                  <span className="stats-value" style={{ color: '#047857', fontSize: '1.5rem', fontWeight: '800' }}>
                    ₹ {(inventory || []).reduce((sum, item) => sum + ((parseFloat(item.availableQtyKg) || 0) * (parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0)), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Valuation across {(inventory || []).length} active inventory items
                  </span>
                </div>
              )}

              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('vendors')}>
                <span className="stats-title">Onboarded Vendors</span>
                <span className="stats-value">{(vendors || []).length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>GSTIN Verified Suppliers</span>
              </div>

              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('clients')}>
                <span className="stats-title">Client Directory</span>
                <span className="stats-value">{(clients || []).length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Registered Buyers</span>
              </div>

              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('scrap_analytics')}>
                <span className="stats-title">Average Scrap %</span>
                <span className="stats-value">
                  {scrapMetrics.currentMonthAvg}%
                </span>
                <span style={{ 
                  fontSize: '0.8rem', 
                  fontWeight: '700', 
                  color: scrapMetrics.momDirection === 'up' ? '#dc2626' : (scrapMetrics.momDirection === 'down' ? '#059669' : 'var(--text-secondary)'),
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {scrapMetrics.momDirection === 'up' && `▲ +${scrapMetrics.momChange}% MoM (Increase)`}
                  {scrapMetrics.momDirection === 'down' && `▼ -${scrapMetrics.momChange}% MoM (Decrease)`}
                  {scrapMetrics.momDirection === 'neutral' && `• 0.0% MoM (No Change)`}
                </span>
              </div>
            </div>


            {/* Quick Actions & Recent Orders Split */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
              {/* Recent Orders Overview Table */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Recent Active Orders & Target Deadlines</h3>
                  <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleTabChange('orders')}>
                    View All Orders
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Job Name</th>
                        <th>Substrate Structure</th>
                        <th>Target Date</th>
                        <th>Production / SFG Stage</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orders || []).map(o => {
                        if (!o) return null;
                        const statusInfo = getOrderStatusInfo(o);
                        const stageInfo = getOrderStageInfo(o, sfgGoods, productionRecords);
                        const isOverdue = statusInfo.isOverdue;
                        const isNearing = statusInfo.isNearingDeadline;
                        // Derive substrate structure from the matching Job Master's layers, fallback to order.structure
                        const oJobName = String(o.jobName || '').toLowerCase().trim();
                        const matchedJM = (jobMasters || []).find(j =>
                          j && String(j.jobName || '').toLowerCase().trim() === oJobName
                        );
                        const substrateDisplay = matchedJM && matchedJM.layers && matchedJM.layers.length > 0
                          ? matchedJM.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
                          : (o.structure || '—');
                        return (
                          <tr key={o.id} className={isOverdue ? 'row-delayed-highlight' : (isNearing ? 'row-nearing-highlight' : '')}>
                            <td style={{ fontWeight: '700', color: isOverdue ? '#dc2626' : (isNearing ? '#b45309' : 'var(--primary-brand)') }}>{o.id}</td>
                            <td style={{ fontWeight: '600' }}>{o.jobName}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{substrateDisplay}</td>
                            <td style={{ color: isOverdue ? '#dc2626' : (isNearing ? '#b45309' : 'inherit'), fontWeight: (isOverdue || isNearing) ? '700' : 'normal' }}>
                              {o.targetDeliveryDate}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                <span 
                                  style={{ 
                                    padding: '3px 8px', 
                                    borderRadius: '6px', 
                                    fontSize: '0.74rem', 
                                    fontWeight: '800', 
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    ...stageInfo.badgeStyle 
                                  }}
                                  title={`Current Stage: ${stageInfo.stage}`}
                                >
                                  {stageInfo.stageLabel}
                                </span>
                                {stageInfo.totalAvailableKg > 0 && (
                                  <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: '700' }}>
                                    Active: {stageInfo.totalAvailableKg.toFixed(0)} kg ({stageInfo.activeLots.length} lot{stageInfo.activeLots.length !== 1 ? 's' : ''})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {isOverdue ? (
                                <span className="badge-delayed-tag">DELAYED</span>
                              ) : isNearing ? (
                                <span className="badge-delayed-tag" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                                  NEARING DEADLINE
                                </span>
                              ) : (
                                <span className="badge badge-us">{o.status}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Plant Quick Shortcuts Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="glass-card">
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '12px' }}>⚙️ Plant Quick Shortcuts</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => handleTabChange('job_punching')}>
                      <Calculator size={16} style={{ color: 'var(--primary-brand)' }} /> Job Punching & OCN Note PDF
                    </button>
                    <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => handleTabChange('orders')}>
                      <ShoppingBag size={16} style={{ color: '#059669' }} /> Issue Bulk Purchase Orders (POs)
                    </button>
                    <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => handleTabChange('job_datasheet')}>
                      <FileSpreadsheet size={16} style={{ color: '#7c3aed' }} /> Actual Consumption & Pre/Post Costing
                    </button>
                    <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => handleTabChange('inventory')}>
                      <FileCheck size={16} style={{ color: '#d97706' }} /> Inward GRN & QC Approval
                    </button>
                    <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => handleTabChange('clients')}>
                      <Briefcase size={16} style={{ color: '#2563eb' }} /> View Client Directory & Cylinders
                    </button>
                  </div>
                </div>

                {/* Stock Level Quick Summary */}
                <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📦 Low Stock Warning
                    </h3>
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleTabChange('inventory')}>
                      Manage Inventory
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(inventory || []).filter(i => {
                      // Only show items that have an explicit reorder level set AND are below it
                      const avail = i.availableQtyKg || 0;
                      const reorder = i.reorderLevelKg;
                      return reorder != null && reorder > 0 && avail <= reorder;
                    }).length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: '#059669', padding: '10px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        ✓ All raw material items are above reorder threshold.
                      </div>
                    ) : (
                      (inventory || []).filter(i => {
                        const avail = i.availableQtyKg || 0;
                        const reorder = i.reorderLevelKg;
                        return reorder != null && reorder > 0 && avail <= reorder;
                      }).map(i => {
                        const category = i.category || 'Film Substrates';
                        const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films' || Boolean(!i.category && i.filmType && FILM_DENSITIES[i.filmType]);
                        const unitStr = i.unit && i.unit !== '-' ? i.unit : (isFilm ? 'kg' : 'Pcs');
                        const displayName = i.itemName ||
                          (isFilm && i.filmType ? [i.filmType, (i.micron && i.micron !== '-') ? `${i.micron}µ` : ''].filter(Boolean).join(' ') : (i.filmType || `${category} Item`));
                        
                        // Badge logic: Only film items with valid numeric micron show micron badge; other items show category/product type badge
                        const hasValidMicron = isFilm && i.micron && i.micron !== '-' && !isNaN(Number(i.micron));

                        // Render item-type specific specifications
                        const renderSpecs = () => {
                          if (isFilm) {
                            return (
                              <>
                                {i.filmType && <>Substrate: <strong>{i.filmType}</strong></>}
                                {i.widthMm && i.widthMm !== '-' ? <>{i.filmType ? ' | ' : ''}Width: <strong>{i.widthMm}mm</strong></> : null}
                              </>
                            );
                          }
                          
                          // Doctor Blades & Wipers
                          if (category === 'Doctor Blades & Wipers' || category === 'Doctor Blades' || (i.itemName && i.itemName.toLowerCase().includes('blade'))) {
                            const gradeVal = i.grade || (i.filmType && i.filmType !== category && i.filmType !== 'PET' ? i.filmType : '');
                            const dimVal = i.dimensions || (i.widthMm && i.widthMm !== '-' ? `${i.widthMm}mm` : '');
                            return (
                              <>
                                {gradeVal && <>Grade: <strong>{gradeVal}</strong></>}
                                {dimVal && <>{gradeVal ? ' | ' : ''}Size: <strong>{dimVal}</strong></>}
                                {!gradeVal && !dimVal && <>Category: <strong>Doctor Blades</strong></>}
                              </>
                            );
                          }

                          // Printing Inks & Toners
                          if (category === 'Printing Inks & Toners' || category === 'Printing Inks' || category === 'Inks & Solvents' || (i.itemName && i.itemName.toLowerCase().includes('ink'))) {
                            const shadeVal = i.shade || i.subType || i.grade || (i.filmType && i.filmType !== category && i.filmType !== 'PET' ? i.filmType : '');
                            return (
                              <>
                                {shadeVal ? <>Shade: <strong>{shadeVal}</strong></> : <>Category: <strong>Printing Inks</strong></>}
                              </>
                            );
                          }

                          // Chemicals & Solvents
                          if (category === 'Chemicals & Solvents' || category === 'Solvents' || (i.itemName && (i.itemName.toLowerCase().includes('solvent') || i.itemName.toLowerCase().includes('acetate')))) {
                            const typeVal = i.subType || i.grade || (i.filmType && i.filmType !== category && i.filmType !== 'PET' ? i.filmType : '');
                            return (
                              <>
                                {typeVal ? <>Type: <strong>{typeVal}</strong></> : <>Category: <strong>Solvents</strong></>}
                              </>
                            );
                          }

                          // Adhesives & Hardener
                          if (category === 'Adhesives & Hardener' || category === 'Adhesives' || category === 'Lamination Adhesives' || (i.itemName && i.itemName.toLowerCase().includes('adhesive'))) {
                            const typeVal = i.subType || i.grade || (i.filmType && i.filmType !== category && i.filmType !== 'PET' ? i.filmType : '');
                            return (
                              <>
                                {typeVal ? <>Type: <strong>{typeVal}</strong></> : <>Category: <strong>Adhesives</strong></>}
                              </>
                            );
                          }

                          // Fallback for all other items (Rollers, Spares, Tapes, PPE, Packaging, etc.)
                          const specVal = i.dimensions || (i.widthMm && i.widthMm !== '-' ? `${i.widthMm}mm` : '');
                          const subVal = i.subType || i.grade || (i.filmType && i.filmType !== category && i.filmType !== 'PET' ? i.filmType : '');
                          return (
                            <>
                              <span>Category: <strong>{category}</strong></span>
                              {subVal && <span> | Type: <strong>{subVal}</strong></span>}
                              {specVal && <span> | Size: <strong>{specVal}</strong></span>}
                            </>
                          );
                        };

                        return (
                          <div key={i.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#991b1b' }}>
                                {displayName}
                              </span>
                              {hasValidMicron ? (
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#dc2626', color: '#ffffff', padding: '2px 6px', borderRadius: '4px' }}>
                                  {i.micron} µ
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '4px' }}>
                                  {category}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: '2px' }}>
                              <span style={{ color: '#475569' }}>
                                {renderSpecs()}
                              </span>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ color: '#b91c1c', fontWeight: '800' }}>
                                  Avail: {(i.availableQtyKg ?? 0).toLocaleString()} {unitStr}
                                </span>
                                {i.allocatedQtyKg > 0 && (
                                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                    (Alloc: {i.allocatedQtyKg} {unitStr})
                                  </span>
                                )}
                                {/* Only show Min when a real reorder level exists */}
                                {i.reorderLevelKg != null && i.reorderLevelKg > 0 && (
                                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    [Min: {i.reorderLevelKg} {unitStr}]
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SALES MANAGEMENT & QUOTATION ENGINE */}
        {moduleOpen && activeTab === 'sales' && (
          <SalesManagement 
            urlParams={urlParams}
            orders={orders}
            clients={clients}
            jobMasters={jobMasters}
            cylinders={cylinders}
            currentUser={currentUser}
            userRole={currentUser?.role}
            onAddOrder={handleAddOrder}
            onAddJobMaster={handleAddJobMaster}
            onAddClient={handleAddClient}
            onAddCylinder={handleAddCylinder}
          />
        )}

        {/* TAB: PRODUCTION RECORDS & APPROVAL FLOW */}
        {moduleOpen && activeTab === 'production_records' && !['job-data-sheets', 'sheet', 'sheet-new'].includes(routeInfo.section) && (
          <ProductionRecordManagement 
            urlParams={urlParams}
            productionRecords={productionRecords}
            orders={orders}
            inventory={inventory}
            inventoryRolls={inventoryRolls}
            sfgGoods={sfgGoods}
            dispatchShipments={dispatchShipments}
            deliveryChallans={deliveryChallans}
            jobMasters={jobMasters}
            cylinders={cylinders}
            machines={machines}
            currentUser={currentUser}
            storeIssueTransactions={storeIssueTransactions}
            onSaveProductionRecord={handleSaveProductionRecord}
            onApproveProductionRecord={handleApproveProductionRecord}
            onUpdateJobMaster={handleUpdateJobMaster}
            onUpdateCylinder={handleUpdateCylinder}
            onAddRoll={handleAddRoll}
          />
        )}

        {moduleOpen && activeTab === 'production_records' && ['job-data-sheets', 'sheet', 'sheet-new'].includes(routeInfo.section) && (
          <JobDataSheet
            urlParams={urlParams}
            orders={orders}
            jobDataSheets={jobDataSheets}
            currentUser={currentUser}
            onSaveJobDataSheet={handleAddJobDataSheet}
            onDeleteJobDataSheet={handleDeleteJobDataSheet}
          />
        )}

        {/* TAB: CLIENTS */}
        {moduleOpen && activeTab === 'clients' && (
          <ClientManagement 
            urlParams={urlParams}
            clients={clients}
            orders={orders}
            cylinders={cylinders}
            jobMasters={jobMasters}
            onAddClient={handleAddClient}
            onUpdateClient={handleUpdateClient}
            onDeleteClient={handleDeleteClient}
          />
        )}

        {/* TAB: JOB MASTER DIRECTORY */}
        {moduleOpen && activeTab === 'job_masters' && (
          <JobMasterDirectory 
            urlParams={urlParams}
            jobMasters={jobMasters}
            orders={orders}
            cylinders={cylinders}
            productionRecords={productionRecords}
            machines={machines}
            currentUser={currentUser}
            onAddJobMaster={handleAddJobMaster}
            onBatchAddJobMasters={handleBatchAddJobMasters}
            onUpdateJobMaster={handleUpdateJobMaster}
            onDeleteJobMaster={handleDeleteJobMaster}
            onAddCylinder={handleAddCylinder}
            onBatchAddCylinders={handleBatchAddCylinders}
            onUpdateCylinder={handleUpdateCylinder}
            onLinkCylinderToJobMaster={handleLinkCylinderToJobMaster}
            onCreateAndLinkPair={handleCreateAndLinkPair}
            onPunchOrderFromJobMaster={handlePunchOrderFromJobMaster}
            onOpenJobCardModal={handlePunchOrderFromJobMaster}
          />
        )}


        {/* TAB 1: JOB PUNCHING & PRE-COSTING */}
        {moduleOpen && activeTab === 'job_punching' && (
          <JobPunchingForm 
            key={selectedJobMasterForPunch?.id || urlParams.jobMasterId || 'punch'}
            onSaveOrder={handleAddOrder} 
            onNavigateToDashboard={() => handleTabChange('dashboard')} 
            initialJobMasterData={selectedJobMasterForPunch || (jobMasters || []).find((job) => String(job.id) === String(urlParams.jobMasterId)) || null}
            clients={clients}
            jobMasters={jobMasters}
          />
        )}

        {/* TAB 2: ORDER MANAGEMENT */}
        {moduleOpen && activeTab === 'orders' && (
          <OrderManagement 
            urlParams={urlParams}
            orders={orders} 
            vendors={vendors}
            inventory={inventory}
            grns={grns}
            purchaseOrders={purchaseOrders}
            onSavePurchaseOrder={handleSavePurchaseOrder}
            jobMasters={jobMasters}
            cylinders={cylinders}
            currentUser={currentUser}
            productionRecords={productionRecords}
            sfgGoods={sfgGoods}
            onUpdateOrder={handleUpdateOrder} 
            onDeleteOrder={handleDeleteOrder}
            onUpdateCylinder={handleUpdateCylinder}
            onAddGRN={handleAddGRN}
            onNavigateToPunching={() => handleTabChange('job_punching')}
            onNavigateToProductionRecords={() => handleTabChange('production_records')}
          />
        )}

        {/* TAB 5: VENDOR MANAGEMENT */}
        {moduleOpen && activeTab === 'vendors' && (
          <VendorManagement 
            urlParams={urlParams} 
            vendors={vendors} 
            orders={orders} 
            onAddVendor={handleAddVendor} 
            onUpdateVendor={handleAddVendor} 
            onDeleteVendor={handleDeleteVendor} 
          />
        )}

        {/* TAB: PURCHASE ORDER MANAGEMENT */}
        {moduleOpen && activeTab === 'purchase_orders' && (
          <PurchaseOrderManagement 
            urlParams={urlParams}
            purchaseOrders={purchaseOrders}
            onAddPurchaseOrder={handleSavePurchaseOrder}
            onUpdatePurchaseOrder={handleUpdatePurchaseOrder}
            onDeletePurchaseOrder={handleDeletePurchaseOrder}
            inventory={inventory}
            vendors={vendors}
            grns={grns}
            orders={orders}
            onUpdateOrder={handleUpdateOrder}
            currentUser={currentUser}
            onAddGRN={handleAddGRN}
            onUpdateGRN={handleUpdateGRN}
            onSaveInventoryItem={handleSaveInventoryItem}
            onUpdateInventory={handleUpdateInventory}
            onUpdateInventoryRolls={handleUpdateInventoryRolls}
          />
        )}

        {/* TAB 6: INVENTORY, GRN & QC */}
        {moduleOpen && activeTab === 'inventory' && (
          <InventoryManagement 
            urlParams={urlParams}
            inventory={inventory}
            grns={grns}
            vendors={vendors}
            orders={orders}
            purchaseOrders={purchaseOrders}
            indents={indents}
            inks={inks}
            jobMasters={jobMasters}
            machines={machines}
            currentUser={currentUser}
            users={users}
            productionRecords={productionRecords}
            storeIssueTransactions={storeIssueTransactions}
            onStoreIssueReturn={handleStoreIssueReturn}
            onAddGRN={handleAddGRN}
            onUpdateGRN={handleUpdateGRN}
            onUpdateInventory={handleUpdateInventory}
            onSaveInventoryItem={handleSaveInventoryItem}
            onDeleteInventoryItem={handleDeleteInventoryItem}
            onAddVendor={handleAddVendor}
            inventoryRolls={inventoryRolls}
            dispatchShipments={dispatchShipments}
            cylinders={cylinders}
            onUpdateCylinder={handleUpdateCylinder}
            onUpdateOrder={handleUpdateOrder}
            onAddRoll={handleAddRoll}
            onUpdateRoll={handleUpdateRoll}
            onUpdateInventoryRolls={handleUpdateInventoryRolls}
            onAddDispatchShipment={handleAddDispatchShipment}
            onSaveProductionRecord={handleSaveProductionRecord}
          />
        )}

        {/* TAB: DEDICATED SFG STORE MANAGEMENT */}
        {moduleOpen && activeTab === 'sfg_store' && (
          <SFGStoreManagement 
            urlParams={urlParams}
            sfgGoods={sfgGoods}
            inventory={inventory}
            inventoryRolls={inventoryRolls}
            orders={orders}
            jobMasters={jobMasters}
            productionRecords={productionRecords}
            machines={machines}
            currentUser={currentUser}
            onSaveSFGGood={handleSaveSFGGood}
            onConsumeSFG={handleConsumeSFG}
            onDeleteSFGGood={handleDeleteSFGGood}
          />
        )}

        {/* TAB: INK MASTER & COSTING */}
        {moduleOpen && activeTab === 'ink_management' && (
          <InkManagement 
            urlParams={urlParams}
            inks={inks}
            inventory={inventory}
            grns={grns}
            storeIssueTransactions={storeIssueTransactions}
            productionRecords={productionRecords}
            vendors={vendors}
            currentUser={currentUser}
            onAddInk={handleAddInk}
            onUpdateInk={handleUpdateInk}
            onDeleteInk={handleDeleteInk}
            onUpdateInkPrice={handleUpdateInkPrice}
            onSaveOrder={handleAddOrder}
            onNavigateTab={handleTabChange}
          />
        )}

        {/* TAB: MATERIAL INDENTS & CONSUMABLE STORE */}
        {moduleOpen && activeTab === 'material_indents' && (
          <ConsumablesAndIndents 
            urlParams={urlParams}
            userRole={currentUser?.role || ""}
            userName={currentUser?.name || ""}
            vendors={vendors}
            orders={orders}
            machines={machines}
            consumables={consumables}
            onUpdateConsumables={handleUpdateConsumables}
            indents={indents}
            onUpdateIndents={handleUpdateIndents}
            machineIssues={machineIssues}
            onUpdateMachineIssues={handleUpdateMachineIssues}
            inventory={inventory}
            pelletUserName={fuelActorName(currentUser)}
            pelletLoadError={pelletLoadError}
            onAllocatePelletGrnNumber={handleAllocatePelletGrnNumber}
            pelletInwards={pelletInwards}
            pelletConsumptions={pelletConsumptions}
            onSavePelletInward={handleSavePelletInward}
            onDeletePelletInward={handleDeletePelletInward}
            onSavePelletConsumption={handleSavePelletConsumption}
            onDeletePelletConsumption={handleDeletePelletConsumption}
            onNavigateTab={handleTabChange}
          />
        )}

        {/* TAB: BOILER PELLET FUEL STOCK & CONSUMPTION */}
        {moduleOpen && activeTab === 'pellet_fuel' && (
          <PelletFuelManagement 
            urlParams={urlParams}
            userRole={currentUser?.role || ""}
            userName={fuelActorName(currentUser)}
            vendors={vendors}
            machines={machines}
            inventory={inventory}
            loadError={pelletLoadError}
            onAllocatePelletGrnNumber={handleAllocatePelletGrnNumber}
            pelletInwards={pelletInwards}
            pelletConsumptions={pelletConsumptions}
            onSavePelletInward={handleSavePelletInward}
            onDeletePelletInward={handleDeletePelletInward}
            onSavePelletConsumption={handleSavePelletConsumption}
            onDeletePelletConsumption={handleDeletePelletConsumption}
          />
        )}

        {/* TAB: DISPATCH, DELIVERY CHALLAN & COA HUB */}
        {moduleOpen && activeTab === 'dispatch' && (
          <DispatchManagement 
            urlParams={urlParams}
            deliveryChallans={deliveryChallans}
            certificateOfAnalyses={certificateOfAnalyses}
            dispatchShipments={dispatchShipments}
            clients={clients}
            vendors={vendors}
            jobMasters={jobMasters}
            orders={orders}
            cylinders={cylinders}
            sfgGoods={sfgGoods}
            productionRecords={productionRecords}
            inventoryRolls={inventoryRolls}
            currentUser={currentUser}
            onSaveDeliveryChallan={handleSaveDeliveryChallan}
            onDeleteDeliveryChallan={handleDeleteDeliveryChallan}
            onSaveCoA={handleSaveCoA}
            onDeleteCoA={handleDeleteCoA}
            onAddDispatchShipment={handleAddDispatchShipment}
            onDeleteDispatchShipment={handleDeleteDispatchShipment}
          />
        )}

        {/* TAB 7: USER MANAGEMENT (RBAC) */}
        {moduleOpen && activeTab === 'user_management' && (
          <UserManagement 
            users={users}
            currentUser={currentUser}
            rolePermissions={rolePermissions}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onUpdateRolePermissions={setRolePermissions}
            urlParams={urlParams}
          />
        )}

        {/* TAB: EMPLOYEE MANAGEMENT & PAYROLL HR */}
        {moduleOpen && activeTab === 'employees' && (
          <EmployeeManagement 
            urlParams={urlParams}
            employees={employees}
            attendanceRecords={employeeAttendance}
            salaryAdvances={salaryAdvances}
            salaryPayments={salaryPayments}
            currentUser={currentUser}
            userRole={currentUser?.role}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onSaveAttendance={handleSaveAttendance}
            onSaveSalaryAdvance={handleSaveSalaryAdvance}
            onUpdateSalaryAdvance={handleUpdateSalaryAdvance}
            onSaveSalaryPayment={handleSaveSalaryPayment}
          />
        )}

        {/* TAB 8: CYLINDER DATABASE & UTILISATION */}
        {moduleOpen && activeTab === 'cylinders' && (
          <CylinderManagement 
            urlParams={urlParams}
            cylinders={cylinders}
            clients={clients}
            onAddClient={handleAddClient}
            jobMasters={jobMasters}
            onAddJobMaster={handleAddJobMaster}
            onBatchAddJobMasters={handleBatchAddJobMasters}
            onUpdateJobMaster={handleUpdateJobMaster}
            currentUser={currentUser}
            onAddCylinder={handleAddCylinder}
            onBatchAddCylinders={handleBatchAddCylinders}
            onUpdateCylinder={handleUpdateCylinder}
            onDeleteCylinder={handleDeleteCylinder}
            onLinkCylinderToJobMaster={handleLinkCylinderToJobMaster}
            onCreateAndLinkPair={handleCreateAndLinkPair}
            productionRecords={productionRecords}
            orders={orders}
          />
        )}

        {/* TAB 9: PRINTING MACHINE PRODUCTION SCHEDULER */}
        {moduleOpen && activeTab === 'printing_scheduler' && (
          <ProductionScheduler 
            orders={orders}
            inventory={inventory}
            inventoryRolls={inventoryRolls}
            machines={machines}
            schedules={schedules}
            jobMasters={jobMasters}
            cylinders={cylinders}
            productionRecords={productionRecords}
            currentUser={currentUser}
            initialPressQueueOrder={pressQueueOrder}
            initialPressMachineAssignments={pressMachineAssignments}
            initialPressActiveRunningJob={pressActiveRunningJob}
            onSaveMachine={handleSaveMachine}
            onUpdateMachine={handleUpdateMachine}
            onDeleteMachine={handleDeleteMachine}
            onSaveSchedule={handleSaveSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            onUpdateOrder={handleUpdateOrder}
            onStartJob={handleStartPrintingJob}
            onEndJob={handleEndPrintingJob}
            onAddRoll={handleAddRoll}
            onSaveInventoryItem={handleSaveInventoryItem}
            onReorderQueue={handleReorderQueue}
            onMachineAssignmentChange={handleMachineAssignmentsChange}
            onActiveRunningJobChange={handleActiveRunningJobChange}
            urlParams={urlParams}
          />
        )}

        {/* TAB 10: SUPABASE DATABASE INTEGRATION */}
        {moduleOpen && activeTab === 'supabase' && (
          <SupabaseManagement urlParams={urlParams} />
        )}

        {/* TAB 11: LETTERHEAD & SIGNATURE SETTINGS */}
        {moduleOpen && activeTab === 'doc_settings' && (
          <DocumentSettings
            machines={machines}
            onSaveMachine={handleSaveMachine}
            onDeleteMachine={handleDeleteMachine}
            urlParams={urlParams}
          />
        )}

        {/* TAB: SCRAP & WASTAGE ANALYSIS */}
        {moduleOpen && activeTab === 'scrap_analytics' && (
          <ScrapWastageAnalysis 
            productionRecords={productionRecords}
            orders={orders}
          />
        )}

        {/* TAB: SYSTEM AUDIT LOGS (ADMIN ONLY) */}
        {moduleOpen && activeTab === 'audit_logs' && (
          <AuditLogsManagement 
            auditLogs={auditLogs}
            currentUser={currentUser}
            onRefreshLogs={() => fetchAuditLogsFromSupabase().then(logs => setAuditLogs(pruneOldAuditLogs(logs)))}
            onPurgeOldLogs={() => {
              if (window.confirm("Are you sure you want to manually purge audit log entries older than 6 months (180 days)?")) {
                const pruned = pruneOldAuditLogs(auditLogs);
                setAuditLogs(pruned);
                safeLocalStorageSet('samyak_erp_audit_logs', pruned);
              }
            }}
          />
        )}
      </div>

      {/* Universal Barcode & 2D QR Inspector Modal */}
      <UniversalBarcodeScannerModal 
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        inventoryRolls={inventoryRolls}
        orders={orders}
        cylinders={cylinders}
        jobMasters={jobMasters}
        grns={grns}
        inks={inks}
        inventory={inventory}
        dispatchShipments={dispatchShipments}
        deliveryChallans={deliveryChallans}
        productionRecords={productionRecords}
        vendors={vendors}
        onNavigateToProductionRecord={(jobName, params) => {
          setIsBarcodeScannerOpen(false);
          const recordId = params?.id || params?.recordId;
          handleTabChange('production_records', {
            jobName,
            ...params,
            ...(recordId ? { id: recordId, section: params?.section || params?.tab || 'list' } : {}),
          });
        }}
      />

      {/* Global Success Screen Modal across all forms and submissions */}
      <SuccessScreenModal />
    </div>
  );

}
