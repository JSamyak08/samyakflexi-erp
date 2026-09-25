import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './services/supabaseClient';
import { 
  isReconciliationDue,
  DEFAULT_ROLE_PERMISSIONS,
  isOrderOverdue,
  isOrderNearingDeadline,
  getOrderStatusInfo,
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
  RefreshCw
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
import SalesManagement from './components/SalesManagement';
import ScrapWastageAnalysis from './components/ScrapWastageAnalysis';
import AuditLogsManagement from './components/AuditLogsManagement';
import InkManagement from './components/InkManagement';
import DispatchManagement from './components/DispatchManagement';
import SFGStoreManagement from './components/SFGStoreManagement';
import WeighingScaleWidget from './components/WeighingScaleWidget';
import UniversalBarcodeScannerModal from './components/UniversalBarcodeScannerModal';
import Preloader from './components/Preloader';
import { fetchAuditLogsFromSupabase, saveAuditLogToSupabase, createAuditEntry, pruneOldAuditLogs } from './services/auditLogger';
import { getRouteFromUrl, getTabFromUrl, pushSlugState } from './utils/slugRouter';
import { isSupabaseConfigured, checkSupabaseConnection } from './services/supabaseClient';
import { 
  fetchOrders, saveOrderToSupabase, deleteOrderFromSupabase,
  fetchVendors, saveVendorToSupabase, deleteVendorFromSupabase,
  fetchInventory, saveInventoryItemToSupabase, saveInventoryBatchToSupabase, deleteInventoryItemFromSupabase, sanitizeInventoryItem,
  fetchGRNs, saveGRNToSupabase, deleteGRNFromSupabase, sanitizeGRN,
  fetchCylinders, saveCylinderToSupabase, saveCylinderBatchToSupabase, deleteCylinderFromSupabase,
  fetchProductionRecords, saveProductionRecordToSupabase, deleteProductionRecordFromSupabase,
  fetchUsers, saveUserToSupabase, deleteUserFromSupabase, updateUserPasswordInDB,
  fetchJobDataSheets, saveJobDataSheetToSupabase, deleteJobDataSheetFromSupabase,
  fetchInventoryRolls, saveInventoryRollToSupabase,
  fetchDispatchShipments, saveDispatchShipmentToSupabase,
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
  fetchFilmSubstratesFromSupabase,
  fetchSystemSetting, saveSystemSetting
} from './services/supabaseDataService';
import { createUserInSupabaseAuth } from './services/authService';

import JobMasterDirectory from './components/JobMasterDirectory';
import { safeLocalStorageSet, safeLocalStorageGet, initSafeStorage, idbGet } from './utils/safeStorage';
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

/**
 * Returns true if any id field of the item matches a known dummy seed ID.
 */
function isDummyRecord(item) {
  if (!item || typeof item !== 'object') return false;
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
// PERMANENT BOOT-TIME PURGE: Disable all local data persistence for transactional ERP data.
// Strip all legacy cached transactional keys from localStorage on boot.
// ============================================================================
(function purgeTransactionalLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keysToRemove = [
    'samyak_erp_orders', 'orders',
    'samyak_erp_vendors', 'vendors',
    'samyak_erp_clients', 'clients',
    'samyak_erp_inventory', 'inventory',
    'samyak_erp_grns', 'grns',
    'samyak_erp_cylinders', 'cylinders',
    'samyak_erp_production_records', 'production_records',
    'samyak_erp_production_schedules', 'production_schedules',
    'samyak_erp_job_datasheets', 'job_datasheets',
    'samyak_erp_inventory_rolls', 'inventory_rolls',
    'samyak_erp_dispatch_shipments', 'dispatch_shipments',
    'samyak_erp_printing_machines', 'printing_machines',
    'samyak_erp_job_masters', 'job_masters',
    'samyak_erp_sales_quotations', 'sales_quotations',
    'samyak_erp_inks', 'inks',
    'samyak_erp_employees', 'employees',
    'samyak_erp_employee_attendance', 'employee_attendance',
    'samyak_erp_salary_advances', 'salary_advances',
    'samyak_erp_salary_payments', 'salary_payments',
    'samyak_erp_sfg_goods', 'sfg_goods',
    'samyak_erp_delivery_challans', 'delivery_challans',
    'samyak_erp_certificate_of_analyses', 'certificate_of_analyses',
    'samyak_erp_material_indents', 'material_indents',
    'samyak_erp_machine_issues', 'machine_issues',
    'samyak_erp_consumables', 'consumables',
    'samyak_erp_store_issue_transactions', 'store_issue_transactions',
    'samyak_erp_issued_pos',
    'samyak_erp_custom_barcodes',
    'samyak_erp_stock_adjustments',
    'samyak_po_discrepancy_resolutions',
    'samyak_erp_scrap_disposals'
  ];
  for (const k of keysToRemove) {
    try { localStorage.removeItem(k); } catch (e) {}
  }
})();


// Immediately sanitize localStorage on boot
initSafeStorage();


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
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionProfile, setSessionProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(!isSupaConfigured);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Route & Navigation State
  const [routeInfo, setRouteInfo] = useState(() => getRouteFromUrl());
  const activeTab = routeInfo.tab;
  const urlParams = routeInfo.params || {};
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTabChange = (tabKey, params = {}) => {
    setRouteInfo({ tab: tabKey, params });
    pushSlugState(tabKey, params);
    setIsMobileMenuOpen(false);
  };

  // Sync state when user uses browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setRouteInfo(getRouteFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync URL path with auth state and deep links
  useEffect(() => {
    if (isAuthReady) {
      if (!isAuthenticated || !currentUser) {
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.history.replaceState({ tab: 'login' }, '', '/login');
        }
      } else {
        if (activeTab === 'login' || (typeof window !== 'undefined' && window.location.pathname === '/login')) {
          const defaultTab = currentUser?.role === 'Printing Operator' ? 'printing_scheduler' : 'dashboard';
          handleTabChange(defaultTab);
        } else {
          pushSlugState(activeTab, urlParams, true);
        }
      }
    }
  }, [isAuthenticated, currentUser, isAuthReady, activeTab]);

  const hasSavedSession = () => {
    try {
      const user = safeLocalStorageGet('samyak_erp_current_user', null);
      return Boolean(user && user.email);
    } catch (e) { return false; }
  };

  // SUPABASE DATABASE IS THE SINGLE SOURCE OF TRUTH.
  // All transactional entity states initialize to empty arrays []. Zero local storage caching or offline fallback.
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
  const [clients, setClients] = useState([]);
  const [jobMasters, setJobMasters] = useState([]);
  const [inks, setInks] = useState([]);
  const [selectedJobMasterForPunch, setSelectedJobMasterForPunch] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS);
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


  const logAudit = async (actionType, moduleName, details, targetId = null) => {
    const entry = createAuditEntry(currentUser, actionType, moduleName, details, targetId);
    setAuditLogs(prev => pruneOldAuditLogs([entry, ...prev]));
    try {
      await saveAuditLogToSupabase(entry);
    } catch (e) {
      console.warn("Audit log save notice:", e);
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

  const isTabAllowed = (tabKey) => {
    if (!currentUser) return true;
    if (currentUser.role === 'Admin') return true;
    if (tabKey === 'user_management' || tabKey === 'audit_logs') return false; // Strictly restricted to Admin role
    const rolePerm = rolePermissions[currentUser.role];
    if (!rolePerm) return true;
    return rolePerm[tabKey] !== false;
  };

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
    if (!isSupaActive || !isAuthReady || !isAuthenticated) {
      if (!isSupaActive) {
        setIsDataLoading(false);
        setIsDataFetched(true);
      }
      return;
    }

    let isMounted = true;
    async function loadSupabaseData() {
      setIsDataLoading(true);
      setIsDataFetched(false);

      // Failsafe timer: Ensure loading state unlocks after 4 seconds max no matter what
      const failsafeTimer = setTimeout(() => {
        if (isMounted) {
          console.warn('[Supabase Load Failsafe] 4s elapsed, unlocking UI.');
          setIsDataLoading(false);
          setOrdersLoading(false);
          setIsDataFetched(true);
        }
      }, 4000);

      const fetchWithTimeout = (promise, ms = 4000) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), ms))
        ]);
      };

      const fetchSafe = async (fn, label) => {
        try {
          const res = await fetchWithTimeout(fn(), 4000);
          return res;
        } catch (e) {
          console.warn(`[Supabase Load Notice] ${label}:`, e?.message || e);
          return null;
        }
      };

      try {
        // Dedicated Order fetch with strict error handling & request versioning
        const currentOrdersVersion = ++ordersFetchVersion.current;
        setOrdersLoading(true);
        setOrdersError(null);

        const ordersTask = (async () => {
          try {
            console.log('[ORDERS][FETCH] Starting Supabase fetch');
            const supaOrders = await fetchWithTimeout(fetchOrders(), 4000);
            console.log(`[ORDERS][FETCH] Received ${supaOrders ? supaOrders.length : 0} records`);
            if (isMounted && currentOrdersVersion === ordersFetchVersion.current) {
              const cleanSupa = stripDummyRecords(supaOrders).filter(
                o => o && o.id && !deletedOrderIdsRef.current.has(o.id)
              );
              setOrders(cleanSupa);
              setOrdersLoading(false);

              // Clean up any legacy dummy records from DB in background
              supaOrders.filter(isDummyRecord).forEach(d => deleteOrderFromSupabase(d.id).catch(console.warn));
            }
          } catch (err) {
            console.error('[ORDERS][FETCH] Failed to load from Supabase:', err);
            if (isMounted && currentOrdersVersion === ordersFetchVersion.current) {
              setOrdersError(err.message || 'Failed to fetch orders from Supabase.');
              setOrdersLoading(false);
            }
          }
        })();

        let [
          _ordersRes,
          supaVendors, supaInv, supaGRNs, supaCyls, 
          supaProd, supaUsers, supaSheets, supaRolls, supaShipments,
          supaMachines, supaSchedules, supaClients, supaJobMasters,
          supaInks, supaEmployees, supaAttendance, supaAdvances,
          supaRolePerms, supaAuditLogs, supaSFG, supaDCs, supaCoAs
        ] = await Promise.all([
          ordersTask,
          fetchSafe(fetchVendors, 'Vendors'),
          fetchSafe(fetchInventory, 'Inventory'),
          fetchSafe(fetchGRNs, 'GRNs'),
          fetchSafe(fetchCylinders, 'Cylinders'),
          fetchSafe(fetchProductionRecords, 'Production Records'),
          fetchSafe(fetchUsers, 'Users'),
          fetchSafe(fetchJobDataSheets, 'Job Data Sheets'),
          fetchSafe(fetchInventoryRolls, 'Inventory Rolls'),
          fetchSafe(fetchDispatchShipments, 'Dispatch Shipments'),
          fetchSafe(fetchPrintingMachines, 'Printing Machines'),
          fetchSafe(fetchProductionSchedules, 'Production Schedules'),
          fetchSafe(fetchClients, 'Clients'),
          fetchSafe(fetchJobMasters, 'Job Masters'),
          fetchSafe(fetchInks, 'Inks'),
          fetchSafe(fetchEmployeesFromSupabase, 'Employees'),
          fetchSafe(fetchEmployeeAttendanceFromSupabase, 'Attendance'),
          fetchSafe(fetchSalaryAdvancesFromSupabase, 'Salary Advances'),
          fetchSafe(fetchSalaryPaymentsFromSupabase, 'Salary Payments'),
          fetchSafe(fetchRolePermissionsFromSupabase, 'Role Permissions'),
          fetchSafe(fetchAuditLogsFromSupabase, 'Audit Logs'),
          fetchSafe(fetchSFGGoodsFromSupabase, 'SFG Goods'),
          fetchSafe(fetchDeliveryChallansFromSupabase, 'Delivery Challans'),
          fetchSafe(fetchCertificatesOfAnalysisFromSupabase, 'Certificates of Analysis')
        ]);


        // Fetch schema-independent system settings & lifted store states
        const [
          dbPrefixes, dbTerms, dbLogo, dbSignature,
          dbIndents, dbIssues, dbConsumables, dbStoreTx, dbFilmSubstrates
        ] = await Promise.all([
          fetchSafe(() => fetchSystemSetting('doc_prefixes'), 'Prefixes'),
          fetchSafe(() => fetchSystemSetting('doc_terms'), 'Terms'),
          fetchSafe(() => fetchSystemSetting('company_logo'), 'Logo'),
          fetchSafe(() => fetchSystemSetting('auth_signature'), 'Signature'),
          fetchSafe(() => fetchSystemSetting('material_indents'), 'Indents'),
          fetchSafe(() => fetchSystemSetting('machine_issues'), 'Machine Issues'),
          fetchSafe(() => fetchSystemSetting('consumables'), 'Consumables'),
          fetchSafe(() => fetchSystemSetting('store_issue_transactions'), 'Store Issue Transactions'),
          fetchSafe(fetchFilmSubstratesFromSupabase, 'Film Substrates Master')
        ]);

        if (!isMounted) return;

        if (Array.isArray(supaSFG) && supaSFG.length > 0) setSfgGoods(stripDummyRecords(supaSFG));
        if (Array.isArray(supaDCs) && supaDCs.length > 0) setDeliveryChallans(stripDummyRecords(supaDCs));
        if (Array.isArray(supaCoAs) && supaCoAs.length > 0) setCertificateOfAnalyses(stripDummyRecords(supaCoAs));
        if (Array.isArray(supaAuditLogs)) setAuditLogs(pruneOldAuditLogs(supaAuditLogs));
        if (dbPrefixes) safeLocalStorageSet('samyak_doc_prefixes', dbPrefixes);
        if (dbTerms) safeLocalStorageSet('samyak_doc_terms', dbTerms);
        if (dbLogo) safeLocalStorageSet('samyak_company_logo', dbLogo);
        if (dbSignature) safeLocalStorageSet('samyak_authorised_signature', dbSignature);
        if (dbIndents && Array.isArray(dbIndents)) setIndents(dbIndents);
        if (dbIssues && Array.isArray(dbIssues)) setMachineIssues(dbIssues);
        if (dbConsumables && Array.isArray(dbConsumables)) setConsumables(dbConsumables);
        if (dbStoreTx && Array.isArray(dbStoreTx)) setStoreIssueTransactions(stripDummyRecords(dbStoreTx));
        if (dbFilmSubstrates && Array.isArray(dbFilmSubstrates) && dbFilmSubstrates.length > 0) {
          safeLocalStorageSet('samyak_film_substrates_master', JSON.stringify(dbFilmSubstrates));
        }

        if (Array.isArray(supaVendors)) {
          const cleanSupa = stripDummyRecords(supaVendors);
          setVendors(cleanSupa);
          supaVendors.filter(isDummyRecord).forEach(d => deleteVendorFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaInv)) {
          const cleanSupa = stripDummyRecords(supaInv).map(sanitizeInventoryItem);
          setInventory(cleanSupa);
          cleanSupa.forEach(item => {
            if (item && item.itemName && (item.itemName.includes('|||') || item.itemName.startsWith('{'))) {
              saveInventoryItemToSupabase(sanitizeInventoryItem(item)).catch(console.warn);
            }
          });
          supaInv.filter(isDummyRecord).forEach(d => deleteInventoryItemFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaGRNs)) {
          const cleanSupa = stripDummyRecords(supaGRNs).map(sanitizeGRN);
          setGrns(cleanSupa);
          supaGRNs.filter(isDummyRecord).forEach(d => deleteGRNFromSupabase(d.id || d.grnNo).catch(console.warn));
        }

        if (Array.isArray(supaCyls)) {
          const cleanSupa = stripDummyRecords(supaCyls);
          setCylinders(cleanSupa);
          supaCyls.filter(isDummyRecord).forEach(d => deleteCylinderFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaProd)) {
          const cleanSupa = stripDummyRecords(supaProd);
          setProductionRecords(cleanSupa);
          supaProd.filter(isDummyRecord).forEach(d => deleteProductionRecordFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaUsers) && supaUsers.length > 0) {
          setUsers(supaUsers);
        }

        if (Array.isArray(supaSheets)) {
          const cleanSupa = stripDummyRecords(supaSheets);
          setJobDataSheets(cleanSupa);
          supaSheets.filter(isDummyRecord).forEach(d => deleteJobDataSheetFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaRolls)) setInventoryRolls(stripDummyRecords(supaRolls));
        if (Array.isArray(supaShipments)) setDispatchShipments(stripDummyRecords(supaShipments));
        if (Array.isArray(supaMachines)) setMachines(stripDummyRecords(supaMachines));

        if (Array.isArray(supaSchedules)) {
          const cleanSupa = stripDummyRecords(supaSchedules);
          setSchedules(cleanSupa);
          supaSchedules.filter(isDummyRecord).forEach(d => deleteProductionScheduleFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaClients)) {
          const cleanSupa = stripDummyRecords(supaClients);
          setClients(cleanSupa);
          supaClients.filter(isDummyRecord).forEach(d => deleteClientFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaJobMasters)) {
          const cleanSupa = stripDummyRecords(supaJobMasters);
          setJobMasters(cleanSupa);
          supaJobMasters.filter(isDummyRecord).forEach(d => deleteJobMasterFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaInks)) {
          setInks(supaInks);
        }

        if (Array.isArray(supaEmployees)) {
          const cleanSupa = stripDummyRecords(supaEmployees);
          setEmployees(cleanSupa);
          supaEmployees.filter(isDummyRecord).forEach(d => deleteEmployeeFromSupabase(d.id).catch(console.warn));
        }

        if (Array.isArray(supaAttendance)) {
          const cleanSupa = stripDummyRecords(supaAttendance);
          setEmployeeAttendance(prev => {
            const map = new Map();
            cleanSupa.forEach(a => { if (a && a.id && !isDummyRecord(a)) map.set(a.id, a); });
            (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
            return Array.from(map.values());
          });
        }

        if (Array.isArray(supaAdvances)) {
          const cleanSupa = stripDummyRecords(supaAdvances);
          setSalaryAdvances(prev => {
            const map = new Map();
            cleanSupa.forEach(adv => { if (adv && adv.id && !isDummyRecord(adv)) map.set(adv.id, adv); });
            (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
            return Array.from(map.values());
          });
        }

        if (Array.isArray(supaPayments)) {
          const cleanSupa = stripDummyRecords(supaPayments);
          setSalaryPayments(prev => {
            const map = new Map();
            cleanSupa.forEach(pay => { if (pay && pay.id && !isDummyRecord(pay)) map.set(pay.id, pay); });
            (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
            return Array.from(map.values());
          });
        }

        if (supaRolePerms && typeof supaRolePerms === 'object' && Object.keys(supaRolePerms).length > 0) {
          setRolePermissions(supaRolePerms);
        }
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


  // Realtime subscription for public.inventory to keep live stock and dashboard metrics 100% in sync
  useEffect(() => {
    if (!isSupaActive || !isAuthReady || !isAuthenticated) return;

    const channel = supabase
      .channel('public:inventory_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new;
            if (!newRow || !newRow.id) return;
            setInventory(prev => {
              if (prev.some(i => String(i.id) === String(newRow.id))) return prev;
              const category = newRow.category || 'Film Substrates';
              const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films' || Boolean(newRow.film_type && FILM_DENSITIES[newRow.film_type]);
              const filmTypeVal = newRow.film_type || (isFilm && newRow.item_name ? newRow.item_name.split(' ')[0] : '');
              const fallbackUnit = isFilm ? 'Kg' : (
                category === 'Chemicals & Solvents' || category === 'Solvents' ? 'Litres' : 
                category === 'Doctor Blades & Wipers' ? 'Meters' : 
                category === 'Tapes & Consumables' ? 'Rolls' : 
                category === 'Safety Gear (PPE)' ? 'Boxes' : 
                category === 'Machine Spare Parts' ? 'Nos' : 'Kg'
              );
              const mapped = {
                id: String(newRow.id),
                itemCode: newRow.item_code || String(newRow.id),
                itemName: newRow.item_name || 'Stock Item',
                category: category,
                filmType: filmTypeVal || (isFilm ? 'PET' : ''),
                micron: isFilm ? ((newRow.micron !== null && newRow.micron !== undefined && !isNaN(Number(newRow.micron))) ? Number(newRow.micron) : 12) : '-',
                widthMm: (newRow.width_mm !== null && newRow.width_mm !== undefined && !isNaN(Number(newRow.width_mm))) ? Number(newRow.width_mm) : (isFilm ? 1000 : '-'),
                availableQtyKg: Number(newRow.stock_qty_kg ?? newRow.available_qty_kg ?? 0) || 0,
                allocatedQtyKg: Number(newRow.allocated_qty_kg ?? 0) || 0,
                reorderLevelKg: Number(newRow.reorder_level_kg ?? 0) || 0,
                unitPrice: Number(newRow.unit_price ?? 0) || 0,
                unit: newRow.unit || fallbackUnit,
                density: (newRow.density !== null && newRow.density !== undefined && !isNaN(Number(newRow.density))) ? Number(newRow.density) : (isFilm ? 1.4 : 1.0),
                location: newRow.location || 'Bay A',
                lastVendor: newRow.last_vendor || '',
                lastBatch: newRow.last_batch || '',
                lastUpdated: newRow.last_updated || new Date().toISOString()
              };
              return [mapped, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new;
            if (!updatedRow || !updatedRow.id) return;
            setInventory(prev => prev.map(i => {
              if (String(i.id) === String(updatedRow.id)) {
                const category = updatedRow.category || i.category || 'Film Substrates';
                const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films' || Boolean((updatedRow.film_type || i.filmType) && FILM_DENSITIES[updatedRow.film_type || i.filmType]);
                const filmTypeVal = updatedRow.film_type || (isFilm && updatedRow.item_name ? updatedRow.item_name.split(' ')[0] : (i.filmType || ''));
                const fallbackUnit = isFilm ? 'Kg' : (
                  category === 'Chemicals & Solvents' || category === 'Solvents' ? 'Litres' : 
                  category === 'Doctor Blades & Wipers' ? 'Meters' : 
                  category === 'Tapes & Consumables' ? 'Rolls' : 
                  category === 'Safety Gear (PPE)' ? 'Boxes' : 
                  category === 'Machine Spare Parts' ? 'Nos' : 'Kg'
                );
                return {
                  ...i,
                  id: String(updatedRow.id),
                  itemCode: updatedRow.item_code || i.itemCode || String(updatedRow.id),
                  itemName: updatedRow.item_name || i.itemName,
                  category: category,
                  filmType: filmTypeVal,
                  micron: isFilm ? ((updatedRow.micron !== null && updatedRow.micron !== undefined && !isNaN(Number(updatedRow.micron))) ? Number(updatedRow.micron) : 12) : '-',
                  widthMm: (updatedRow.width_mm !== null && updatedRow.width_mm !== undefined && !isNaN(Number(updatedRow.width_mm))) ? Number(updatedRow.width_mm) : (isFilm ? 1000 : '-'),
                  availableQtyKg: Number(updatedRow.stock_qty_kg ?? updatedRow.available_qty_kg ?? 0) || 0,
                  allocatedQtyKg: Number(updatedRow.allocated_qty_kg ?? 0) || 0,
                  reorderLevelKg: Number(updatedRow.reorder_level_kg ?? 0) || 0,
                  unitPrice: Number(updatedRow.unit_price ?? 0) || 0,
                  unit: updatedRow.unit || i.unit || fallbackUnit,
                  density: (updatedRow.density !== null && updatedRow.density !== undefined && !isNaN(Number(updatedRow.density))) ? Number(updatedRow.density) : (i.density || 1.0),
                  location: updatedRow.location || i.location || 'Bay A',
                  lastVendor: updatedRow.last_vendor || i.lastVendor || '',
                  lastBatch: updatedRow.last_batch || i.lastBatch || '',
                  lastUpdated: updatedRow.last_updated || new Date().toISOString()
                };
              }
              return i;
            }));
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (oldId) {
              setInventory(prev => prev.filter(i => String(i.id) !== String(oldId)));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

  const usersRef = useRef(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const findUserProfile = (email) => {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    let matched = (usersRef.current || []).find(u => u && u.email && u.email.toLowerCase().trim() === cleanEmail);
    return matched || null;
  };

  // Initialize Supabase Auth state
  useEffect(() => {
    if (!isSupaActive) {
      const savedUser = safeLocalStorageGet('samyak_erp_current_user', null);
      if (savedUser && savedUser.email) {
        setSessionProfile(savedUser);
        setCurrentUser(savedUser);
        setIsAuthenticated(true);
      }
      setIsAuthReady(true);
      return;
    }

    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          if (session?.user) {
            const matched = findUserProfile(session.user.email);
            const profile = matched || {
              id: session.user.id,
              name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
              email: session.user.email,
              role: session.user.user_metadata?.role || 'Admin',
              department: 'Executive Management',
              status: 'Active'
            };
            setSessionProfile(profile);

            // Admin is allowed to load a switched user from local storage
            const savedSwitchedUser = safeLocalStorageGet('samyak_erp_current_user', null);
            if (savedSwitchedUser && profile.role === 'Admin') {
              setCurrentUser(savedSwitchedUser);
            } else {
              setCurrentUser(profile);
            }
            setIsAuthenticated(true);
          } else {
            // Check if there is an active verified local/DB session in storage
            const savedLocalUser = safeLocalStorageGet('samyak_erp_current_user', null);
            if (savedLocalUser && savedLocalUser.email) {
              setSessionProfile(savedLocalUser);
              setCurrentUser(savedLocalUser);
              setIsAuthenticated(true);
            } else {
              setSessionProfile(null);
              setCurrentUser(null);
              setIsAuthenticated(false);
            }
          }
          setIsAuthReady(true);
        }
      } catch (err) {
        console.warn('Failed to get Supabase session on mount:', err);
        const savedLocalUser = safeLocalStorageGet('samyak_erp_current_user', null);
        if (savedLocalUser && savedLocalUser.email) {
          setSessionProfile(savedLocalUser);
          setCurrentUser(savedLocalUser);
          setIsAuthenticated(true);
        }
        if (mounted) setIsAuthReady(true);
      }
    }

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session?.user) {
        const matched = findUserProfile(session.user.email);
        const profile = matched || {
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
          email: session.user.email,
          role: session.user.user_metadata?.role || 'Admin',
          department: 'Executive Management',
          status: 'Active'
        };
        setSessionProfile(profile);

        const savedSwitchedUser = safeLocalStorageGet('samyak_erp_current_user', null);
        if (savedSwitchedUser && profile.role === 'Admin') {
          setCurrentUser(savedSwitchedUser);
        } else {
          setCurrentUser(profile);
        }
        setIsAuthenticated(true);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('samyak_erp_current_user');
        setSessionProfile(null);
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
    });

    return () => {
      mounted = false;
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, [isSupaActive]);

  // Login Handler (for UI updates, authService handles Supabase login)
  const handleLogin = (user) => {
    setIsSigningIn(true);
    logAudit('AUTH', 'User Management', `User ${user?.name || user?.email || 'User'} signed in to the system`, user?.id);
    setSessionProfile(user);
    setCurrentUser(user);
    setIsAuthenticated(true);
    safeLocalStorageSet('samyak_erp_current_user', user);
    const targetTab = user?.role === 'Printing Operator'
      ? 'printing_scheduler'
      : (activeTab === 'login' ? 'dashboard' : (activeTab || 'dashboard'));
    handleTabChange(targetTab);
  };

  // Logout Handler (for UI updates, authService handles Supabase logout)
  const handleLogout = () => {
    logAudit('AUTH', 'User Management', `User ${currentUser?.name || currentUser?.email || 'User'} signed out of the system`, currentUser?.id);
    localStorage.removeItem('samyak_erp_current_user');
    setSessionProfile(null);
    setCurrentUser(null);
    setIsAuthenticated(false);

    // PURGE IN-MEMORY ERP DATA ON LOGOUT (ZERO LEAKAGE AT REST OR IN MEMORY)
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
    setEmployees([]);
    setEmployeeAttendance([]);
    setSalaryAdvances([]);
    setSalaryPayments([]);
    setSfgGoods([]);

    if (typeof window !== 'undefined') {
      window.history.replaceState({ tab: 'login' }, '', '/login');
    }
    if (isSupaActive) {
      supabase.auth.signOut().catch(console.warn);
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
          if (netQty > 0 && mat.filmType) {
            const matName = mat.filmType.toLowerCase();
            updatedInv = updatedInv.map(invItem => {
              if ((invItem.filmType || '').toLowerCase() === matName) {
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
    await saveSystemSetting('store_issue_transactions', newTxList);
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
    await saveSystemSetting('consumables', newConsumables);
    setConsumables(newConsumables);
    logAudit('UPDATE', 'Consumable Store', `Updated consumable store inventory levels`, 'CONSUMABLES');
  };

  const handleUpdateIndents = async (newIndents) => {
    requireDatabaseConnection('update material indents');
    await saveSystemSetting('material_indents', newIndents);
    setIndents(newIndents);
    logAudit('UPDATE', 'Material Indents', `Updated plant material indents / purchase requisitions`, 'INDENTS');
  };

  const handleUpdateMachineIssues = async (newIssues) => {
    requireDatabaseConnection('update machine stock issue');
    await saveSystemSetting('machine_issues', newIssues);
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
      printingEndTime: null
    };
    await handleUpdateOrder(updatedOrder);

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
    handleSaveProductionRecord(updatedRecord);
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
      printingEndTime: endIso,
      printingDurationMinutes: computedDurationMinutes,
      printingDurationFormatted: durationFormatted,
      actualMetersPrinted,
      inkGsmInSpeed,
      printedOutputKg,
      printingNotes: endData.notes || ''
    };
    await handleUpdateOrder(updatedOrder);

    // Update corresponding Production Record (or create if missing)
    const existingRec = productionRecords.find(r => r.orderId === order.id || r.id === order.id || (r.jobCode && r.jobCode === order.jobCode));
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
          actualCalculatedInkGsm: endData.actualCalculatedInkGsm || 0
        }
      }
    };
    handleSaveProductionRecord(updatedRecord);
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
    await saveGRNToSupabase(newGRN);
    setGrns(prev => [newGRN, ...prev.filter(g => g.grnNo !== newGRN.grnNo)]);
    logAudit('CREATE', 'GRN Inward', `Issued GRN ${newGRN.grnNo} for "${newGRN.itemName}" (${newGRN.receivedQtyKg} kg) from ${newGRN.vendorName}`, newGRN.grnNo);
  };

  const handleUpdateGRN = async (updatedGRN) => {
    requireDatabaseConnection('update GRN');
    await saveGRNToSupabase(updatedGRN);
    setGrns(prev => prev.map(g => g.grnNo === updatedGRN.grnNo ? updatedGRN : g));
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
    const authResult = await createUserInSupabaseAuth({
      email: newUser.email,
      password: newUser.password || 'password123',
      name: newUser.name,
      role: newUser.role,
      department: newUser.department
    });
    if (!authResult.success && !authResult.alreadyExists) {
      console.warn('[UserOnboard] Supabase Auth registration issue:', authResult.message);
    }
    await saveUserToSupabase(newUser);
    setUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    logAudit('CREATE', 'User Management', `Created user account for ${newUser.name} (${newUser.email}) - Role: ${newUser.role}`, newUser.id);
  };

  const handleUpdateUser = async (updatedUser) => {
    requireDatabaseConnection('update user');
    await saveUserToSupabase(updatedUser);
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    logAudit('UPDATE', 'User Management', `Updated user account/permissions for ${updatedUser.name} (${updatedUser.email}) - Role: ${updatedUser.role}`, updatedUser.id);
  };

  const handleDeleteUser = async (userId) => {
    requireDatabaseConnection('delete user');
    await deleteUserFromSupabase(userId);
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
      const idx = prev.findIndex(a => a.id === record.id || (a.employeeId === record.employeeId && a.date === record.date));
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

  const handleAddDispatchShipment = async (newShipment) => {
    requireDatabaseConnection('create dispatch shipment');
    await saveDispatchShipmentToSupabase(newShipment);
    setDispatchShipments(prev => [newShipment, ...prev.filter(s => s.id !== newShipment.id)]);
    logAudit('CREATE', 'Dispatch', `Created client dispatch shipment ${newShipment.id} for "${newShipment.clientName}"`, newShipment.id);
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
  };

  const handleUpdateJobMaster = async (updatedJobMaster) => {
    requireDatabaseConnection('update job master');
    await saveJobMasterToSupabase(updatedJobMaster);
    setJobMasters(prev => prev.map(j => j.id === updatedJobMaster.id ? updatedJobMaster : j));
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
  const syncInkToInventory = (ink, overrideStock = null) => {
    if (!ink) return;
    const invId = ink.productCode || ink.id;
    setInventory(prev => {
      const exists = (prev || []).some(i => i.id === invId || i.itemCode === ink.productCode);
      if (!exists && overrideStock === null) return prev;

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

      const updated = exists 
        ? prev.map(i => (i.id === invId || i.itemCode === ink.productCode) ? { ...i, ...invItem, availableQtyKg: overrideStock !== null ? Number(overrideStock) : i.availableQtyKg } : i)
        : [invItem, ...prev];

      saveInventoryItemToSupabase(invItem).catch(console.warn);
      return updated.map(sanitizeInventoryItem);
    });
  };

  const handleAddInk = async (newInk) => {
    requireDatabaseConnection('add ink');
    await saveInkToSupabase(newInk);
    setInks(prev => [newInk, ...prev.filter(i => i.id !== newInk.id)]);
    syncInkToInventory(newInk, newInk.stockQtyKg);
    logAudit('CREATE', 'Ink Management', `Added ink product code "${newInk.productCode}" - ${newInk.shade} (${newInk.inkType}, ${newInk.solidContentPct}% solid)`, newInk.id);
  };

  const handleUpdateInk = async (updatedInk) => {
    requireDatabaseConnection('update ink');
    await saveInkToSupabase(updatedInk);
    setInks(prev => prev.map(i => i.id === updatedInk.id ? updatedInk : i));
    syncInkToInventory(updatedInk);
    logAudit('UPDATE', 'Ink Management', `Updated ink product code "${updatedInk.productCode}" - ${updatedInk.shade}`, updatedInk.id);
  };

  const handleUpdateInkPrice = async (updatedInk, newPrice, reason) => {
    requireDatabaseConnection('update ink price');
    await saveInkToSupabase(updatedInk);
    setInks(prev => prev.map(i => i.id === updatedInk.id ? updatedInk : i));
    syncInkToInventory({ ...updatedInk, pricePerKg: newPrice });
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
    await saveSFGGoodToSupabase(updatedSfgItem);

    setSfgGoods(prev => {
      const idx = prev.findIndex(s => s.id === updatedSfgItem.id || s.sfgBatchCode === updatedSfgItem.sfgBatchCode);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = updatedSfgItem;
        return updated;
      }
      return [updatedSfgItem, ...prev];
    });

    // 2. Sync to Job's Production Record
    const targetOrderId = updatedSfgItem.orderId || logEntry.orderId;
    const targetJobName = (updatedSfgItem.jobName || logEntry.jobName || '').trim().toLowerCase();

    let matchedRec = (productionRecords || []).find(r => 
      (targetOrderId && String(r.orderId) === String(targetOrderId)) || 
      (r.jobName && (r.jobName || '').trim().toLowerCase() === targetJobName)
    );

    if (matchedRec) {
      const existingLogs = Array.isArray(matchedRec.sfgConsumptions) ? matchedRec.sfgConsumptions : [];
      const updatedRec = {
        ...matchedRec,
        sfgConsumptions: [logEntry, ...existingLogs]
      };
      await saveProductionRecordToSupabase(updatedRec);
      setProductionRecords(prev => prev.map(r => r.id === updatedRec.id ? updatedRec : r));
    } else {
      const newRec = {
        id: `PROD-REC-${Date.now()}`,
        orderId: targetOrderId || `ORD-${Date.now()}`,
        jobName: updatedSfgItem.jobName || 'Untitled Job',
        clientName: updatedSfgItem.clientName || 'General Client',
        operatorName: logEntry.operatorName || 'Plant Operator',
        shift: logEntry.shift || 'Day Shift',
        status: 'Pending Plant Approval',
        dateFilled: logEntry.date || new Date().toISOString().split('T')[0],
        sfgConsumptions: [logEntry]
      };
      await saveProductionRecordToSupabase(newRec);
      setProductionRecords(prev => [newRec, ...prev]);
    }

    logAudit('UPDATE', 'SFG Store', `Consumed ${logEntry.consumedKg} kg SFG from batch "${updatedSfgItem.sfgBatchCode}" for stage "${logEntry.targetProcess}". Remaining Balance: ${updatedSfgItem.availableKg} kg`, updatedSfgItem.sfgBatchCode);
  };

  const handleDeleteSFGGood = async (sfgId) => {
    requireDatabaseConnection('delete SFG item');
    await deleteSFGGoodFromSupabase(sfgId);
    setSfgGoods(prev => prev.filter(s => s.id !== sfgId && s.sfgBatchCode !== sfgId));
    logAudit('DELETE', 'SFG Store', `Deleted SFG record ${sfgId}`, sfgId);
  };


  const handlePunchOrderFromJobMaster = (jobMaster) => {
    setSelectedJobMasterForPunch(jobMaster);
    handleTabChange('job_punching');
  };

  const isDataReady = databaseStatus !== 'checking' && (!isAuthenticated || isDataFetched || (!isDataLoading && !ordersLoading));

  // Render Loading Screen with Company Logo & Percentage Status Bar on initial load, DB connection check, data fetch, or sign-in
  if (!isAuthReady || isSigningIn || (isAuthenticated && !isDataReady)) {
    return (
      <Preloader 
        isReady={isAuthReady && !isSigningIn && isDataReady}
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
  if (!isAuthenticated || !currentUser) {
    // Callback: update password in local state after OTP-verified reset
    const handleUpdatePassword = (email, newPassword) => {
      setUsers(prev => prev.map(u =>
        u.email?.toLowerCase().trim() === email?.toLowerCase().trim()
          ? { ...u, password: newPassword }
          : u
      ));
    };
    return <AuthScreen onLogin={handleLogin} onUpdatePassword={handleUpdatePassword} />;
  }

  return (
    <div className="app-container">
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
          {(isTabAllowed('printing_scheduler') || isTabAllowed('production_records') || isTabAllowed('cylinders')) && (
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
          {(isTabAllowed('inventory') || isTabAllowed('sfg_store') || isTabAllowed('ink_management') || isTabAllowed('material_indents') || isTabAllowed('vendors') || isTabAllowed('dispatch')) && (
            <>
              <div className="sidebar-section-header">Supply Chain & Store</div>

              {isTabAllowed('inventory') && (
                <div 
                  className={`nav-item ${activeTab === 'inventory' && (!urlParams?.tab || urlParams?.tab !== 'issued_pos') ? 'active' : ''}`}
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

              {isTabAllowed('inventory') && (
                <div 
                  className={`nav-item ${activeTab === 'inventory' && urlParams?.tab === 'issued_pos' ? 'active' : ''}`}
                  onClick={() => handleTabChange('inventory', { tab: 'issued_pos' })}
                >
                  <span className="nav-icon-box" style={{ color: '#4f46e5' }}>
                    <FileCheck size={18} />
                  </span>
                  <span>Issued Purchase Orders</span>
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
                  <span>SFG and FG Store</span>
                  <span className="nav-badge-pill nav-badge-neutral">
                    {(sfgGoods || []).length}
                  </span>
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
          {(isTabAllowed('employees') || currentUser?.role === 'Admin' || currentUser?.role === 'Plant Manager' || currentUser?.role === 'HR & Payroll Manager') && (
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
              {activeTab === 'dashboard' && 'Executive Operations Dashboard'}
              {activeTab === 'sales' && 'Sales Management Engine'}
              {activeTab === 'production_records' && 'Job Production Records & Approval Workflow'}
              {activeTab === 'job_punching' && 'Order Confirmation & Job Punching'}
              {activeTab === 'orders' && 'Order Management & PO Issuance'}
              {activeTab === 'job_masters' && 'Job Master Technical Directory & Specs'}
              {activeTab === 'clients' && 'Client Onboarding & Directory'}
              {activeTab === 'vendors' && 'Vendor Onboarding & Directory'}
              {activeTab === 'inventory' && 'Raw Material Inventory, GRN & Quality Control'}
              {activeTab === 'ink_management' && 'Ink Master Directory, Solid Costing & Stock Management'}
              {activeTab === 'material_indents' && 'Material Indents Requisitions & Consumable Store'}
              {activeTab === 'dispatch' && 'Finished Goods Dispatch, Delivery Challan & Quality CoA Hub'}
              {activeTab === 'user_management' && 'Departmental User Management (RBAC)'}
              {activeTab === 'cylinders' && 'Rotogravure Cylinder Database'}
              {activeTab === 'printing_scheduler' && 'Printing Machine Production Scheduler & Time Board'}
              {activeTab === 'supabase' && 'Supabase Cloud Database & API Service'}
              {activeTab === 'doc_settings' && 'Letterhead Signature & Series Settings'}
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
              <select 
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  fontWeight: '700', 
                  color: 'var(--text-primary)', 
                  cursor: (sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin') ? 'pointer' : 'default', 
                  outline: 'none',
                  opacity: (sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin') ? 1 : 0.9,
                  WebkitAppearance: (sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin') ? 'menulist' : 'none',
                  MozAppearance: (sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin') ? 'menulist' : 'none',
                  appearance: (sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin') ? 'menulist' : 'none'
                }}
                disabled={!(sessionProfile ? sessionProfile.role === 'Admin' : currentUser?.role === 'Admin')}
                value={currentUser?.id || ''}
                onChange={e => {
                  const selectedId = e.target.value;
                  const selectedUser = activeUsersList.find(u => String(u.id) === String(selectedId));
                  if (selectedUser) {
                    setCurrentUser(selectedUser);
                    safeLocalStorageSet('samyak_erp_current_user', selectedUser);
                  }
                }}
              >
                {activeUsersList.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
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

        {!isTabAllowed(activeTab) && (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a', margin: '20px 0' }}>
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
        {activeTab === 'dashboard' && currentUser?.role === 'Printing Operator' ? (
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
            />
          </div>
        ) : activeTab === 'dashboard' && (
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
                          onClick={() => handleTabChange('orders')}
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
                          onClick={() => handleTabChange('ink_management')}
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
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orders || []).map(o => {
                        const statusInfo = getOrderStatusInfo(o);
                        const isOverdue = statusInfo.isOverdue;
                        const isNearing = statusInfo.isNearingDeadline;
                        // Derive substrate structure from the matching Job Master's layers, fallback to order.structure
                        const matchedJM = (jobMasters || []).find(j =>
                          (j.jobName || '').toLowerCase().trim() === (o.jobName || '').toLowerCase().trim()
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
        {activeTab === 'sales' && (
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
        {activeTab === 'production_records' && (
          <ProductionRecordManagement 
            urlParams={urlParams}
            productionRecords={productionRecords}
            orders={orders}
            inventory={inventory}
            inventoryRolls={inventoryRolls}
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

        {/* TAB: CLIENTS */}
        {activeTab === 'clients' && (
          <ClientManagement 
            urlParams={urlParams}
            clients={clients}
            orders={orders}
            cylinders={cylinders}
            onAddClient={handleAddClient}
            onUpdateClient={handleUpdateClient}
            onDeleteClient={handleDeleteClient}
          />
        )}

        {/* TAB: JOB MASTER DIRECTORY */}
        {activeTab === 'job_masters' && (
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
        {activeTab === 'job_punching' && (
          <JobPunchingForm 
            onSaveOrder={handleAddOrder} 
            onNavigateToDashboard={() => handleTabChange('dashboard')} 
            initialJobMasterData={selectedJobMasterForPunch}
            clients={clients}
            jobMasters={jobMasters}
          />
        )}

        {/* TAB 2: ORDER MANAGEMENT */}
        {activeTab === 'orders' && (
          <OrderManagement 
            urlParams={urlParams}
            orders={orders} 
            vendors={vendors}
            inventory={inventory}
            jobMasters={jobMasters}
            cylinders={cylinders}
            currentUser={currentUser}
            productionRecords={productionRecords}
            onUpdateOrder={handleUpdateOrder} 
            onDeleteOrder={handleDeleteOrder}
            onUpdateCylinder={handleUpdateCylinder}
            onAddGRN={handleAddGRN}
            onNavigateToPunching={() => handleTabChange('job_punching')}
            onNavigateToProductionRecords={() => handleTabChange('production_records')}
          />
        )}

        {/* TAB 5: VENDOR MANAGEMENT */}
        {activeTab === 'vendors' && (
          <VendorManagement 
            urlParams={urlParams} 
            vendors={vendors} 
            orders={orders} 
            onAddVendor={handleAddVendor} 
            onUpdateVendor={handleAddVendor} 
            onDeleteVendor={handleDeleteVendor} 
          />
        )}

        {/* TAB 6: INVENTORY, GRN & QC */}
        {activeTab === 'inventory' && (
          <InventoryManagement 
            urlParams={urlParams}
            inventory={inventory}
            grns={grns}
            vendors={vendors}
            orders={orders}
            indents={indents}
            inks={inks}
            jobMasters={jobMasters}
            machines={machines}
            currentUser={currentUser}
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
            onAddDispatchShipment={handleAddDispatchShipment}
            onSaveProductionRecord={handleSaveProductionRecord}
          />
        )}

        {/* TAB: DEDICATED SFG STORE MANAGEMENT */}
        {activeTab === 'sfg_store' && (
          <SFGStoreManagement 
            urlParams={urlParams}
            sfgGoods={sfgGoods}
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
        {activeTab === 'ink_management' && (
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
        {activeTab === 'material_indents' && (
          <ConsumablesAndIndents 
            urlParams={urlParams}
            userRole={currentUser?.role || "Admin"}
            userName={currentUser?.name || "Samyak Jain"}
            vendors={vendors}
            orders={orders}
            machines={machines}
            consumables={consumables}
            onUpdateConsumables={handleUpdateConsumables}
            indents={indents}
            onUpdateIndents={handleUpdateIndents}
            machineIssues={machineIssues}
            onUpdateMachineIssues={handleUpdateMachineIssues}
          />
        )}

        {/* TAB: DISPATCH, DELIVERY CHALLAN & COA HUB */}
        {activeTab === 'dispatch' && (
          <DispatchManagement 
            urlParams={urlParams}
            deliveryChallans={deliveryChallans}
            certificateOfAnalyses={certificateOfAnalyses}
            clients={clients}
            vendors={vendors}
            jobMasters={jobMasters}
            orders={orders}
            cylinders={cylinders}
            currentUser={currentUser}
            onSaveDeliveryChallan={handleSaveDeliveryChallan}
            onDeleteDeliveryChallan={handleDeleteDeliveryChallan}
            onSaveCoA={handleSaveCoA}
            onDeleteCoA={handleDeleteCoA}
          />
        )}

        {/* TAB 7: USER MANAGEMENT (RBAC) */}
        {activeTab === 'user_management' && (
          <UserManagement 
            users={users}
            currentUser={currentUser}
            rolePermissions={rolePermissions}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onUpdateRolePermissions={setRolePermissions}
          />
        )}

        {/* TAB: EMPLOYEE MANAGEMENT & PAYROLL HR */}
        {activeTab === 'employees' && (
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
        {activeTab === 'cylinders' && (
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
          />
        )}

        {/* TAB 9: PRINTING MACHINE PRODUCTION SCHEDULER */}
        {activeTab === 'printing_scheduler' && (
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
          />
        )}

        {/* TAB 10: SUPABASE DATABASE INTEGRATION */}
        {activeTab === 'supabase' && (
          <SupabaseManagement />
        )}

        {/* TAB 11: LETTERHEAD & SIGNATURE SETTINGS */}
        {activeTab === 'doc_settings' && (
          <DocumentSettings
            machines={machines}
            onSaveMachine={handleSaveMachine}
            onDeleteMachine={handleDeleteMachine}
          />
        )}

        {/* TAB: SCRAP & WASTAGE ANALYSIS */}
        {activeTab === 'scrap_analytics' && (
          <ScrapWastageAnalysis 
            productionRecords={productionRecords}
            orders={orders}
          />
        )}

        {/* TAB: SYSTEM AUDIT LOGS (ADMIN ONLY) */}
        {activeTab === 'audit_logs' && (
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
      />
    </div>
  );

}
