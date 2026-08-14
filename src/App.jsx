import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './services/supabaseClient';
import { 
  initialOrders, 
  initialVendors, 
  initialInventory, 
  initialGRNs,
  initialUsers,
  initialJobDataSheets,
  initialProductionRecords,
  initialMachines,
  initialProductionSchedules,
  isReconciliationDue,
  initialClients,
  initialJobMasters,
  initialInks,
  DEFAULT_ROLE_PERMISSIONS,
  isOrderOverdue,
  FILM_DENSITIES
} from './factoryStore';
import { initialCylinders } from './dataStore';
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
  FlaskConical
} from 'lucide-react';

import AuthScreen from './components/AuthScreen';
import JobPunchingForm from './components/JobPunchingForm';
import OrderManagement from './components/OrderManagement';
import VendorManagement from './components/VendorManagement';
import InventoryManagement from './components/InventoryManagement';
import JobDataSheet from './components/JobDataSheet';
import UserManagement from './components/UserManagement';
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
import { fetchAuditLogsFromSupabase, saveAuditLogToSupabase, createAuditEntry, pruneOldAuditLogs } from './services/auditLogger';
import { getRouteFromUrl, getTabFromUrl, pushSlugState } from './utils/slugRouter';
import { isSupabaseConfigured } from './services/supabaseClient';
import { 
  fetchOrders, saveOrderToSupabase, deleteOrderFromSupabase,
  fetchVendors, saveVendorToSupabase, deleteVendorFromSupabase,
  fetchInventory, saveInventoryItemToSupabase, saveInventoryBatchToSupabase, deleteInventoryItemFromSupabase,
  fetchGRNs, saveGRNToSupabase, deleteGRNFromSupabase,
  fetchCylinders, saveCylinderToSupabase, deleteCylinderFromSupabase,
  fetchProductionRecords, saveProductionRecordToSupabase, deleteProductionRecordFromSupabase,
  fetchUsers, saveUserToSupabase, deleteUserFromSupabase, updateUserPasswordInDB,
  fetchJobDataSheets, saveJobDataSheetToSupabase, deleteJobDataSheetFromSupabase,
  fetchInventoryRolls, saveInventoryRollToSupabase,
  fetchDispatchShipments, saveDispatchShipmentToSupabase,
  fetchPrintingMachines, savePrintingMachineToSupabase, deletePrintingMachineFromSupabase,
  fetchProductionSchedules, saveProductionScheduleToSupabase, deleteProductionScheduleFromSupabase,
  fetchClients, saveClientToSupabase, deleteClientFromSupabase,
  fetchJobMasters, saveJobMasterToSupabase, deleteJobMasterFromSupabase,
  fetchInks, saveInkToSupabase, deleteInkFromSupabase,
  fetchRolePermissionsFromSupabase, saveRolePermissionsToSupabase,
  fetchSystemSetting, saveSystemSetting
} from './services/supabaseDataService';
import { createUserInSupabaseAuth } from './services/authService';

import JobMasterDirectory from './components/JobMasterDirectory';
import { initialInventoryRolls, initialDispatchShipments } from './factoryStore';
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
(function purgeDummyDataFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keysToClean = [
    'samyak_erp_orders',
    'samyak_erp_production_records',
    'samyak_erp_production_schedules',
    'samyak_erp_inventory',
    'samyak_erp_grns',
    'samyak_erp_vendors',
    'samyak_erp_clients',
    'samyak_erp_job_masters',
    'samyak_erp_printing_machines',
    'samyak_erp_cylinders',
    'samyak_erp_inventory_rolls',
    'samyak_erp_dispatch_shipments',
    'samyak_erp_job_datasheets'
  ];
  for (const key of keysToClean) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const cleaned = parsed.filter(item => !isDummyRecord(item));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(cleaned));
        console.log(`[Boot Purge] Removed ${parsed.length - cleaned.length} dummy record(s) from ${key}`);
      }
    } catch (e) { /* ignore */ }
  }
})();


// Immediately sanitize localStorage on boot
initSafeStorage();


export default function App() {
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

  // Sync initial URL path if opened directly at root or deep link
  useEffect(() => {
    pushSlugState(activeTab, urlParams);
  }, []);

  // Helper to load state safely from localStorage or fallback
  const loadLocalState = (key, fallbackDefault) => {
    try {
      const parsed = safeLocalStorageGet(`samyak_erp_${key}`, null);
      if (parsed !== null && parsed !== undefined) {
        if (Array.isArray(fallbackDefault)) {
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } else if (typeof fallbackDefault === 'object' && fallbackDefault !== null) {
          if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) return parsed;
        } else {
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`Failed to parse localStorage key samyak_erp_${key}`, e);
    }
    return fallbackDefault;
  };

  // Shared Global State with dual-persistence (Supabase Authoritative + localStorage fallback)
  const isSupaConfigured = isSupabaseConfigured();
  const [isSupaActive, setIsSupaActive] = useState(isSupaConfigured);

  // Authentication & Active User Session State
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionProfile, setSessionProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(!isSupaConfigured);

  // Hydrate initial state safely from localStorage (if present), or empty array default.
  // stripDummyRecords ensures no legacy seed data from development ever enters production state.
  const [orders, setOrders] = useState(() => stripDummyRecords(loadLocalState('orders', [])));
  const [vendors, setVendors] = useState(() => stripDummyRecords(loadLocalState('vendors', [])));
  const [inventory, setInventory] = useState(() => stripDummyRecords(loadLocalState('inventory', [])));
  const [grns, setGrns] = useState(() => stripDummyRecords(loadLocalState('grns', [])));
  const [users, setUsers] = useState(() => loadLocalState('users', initialUsers));
  const [jobDataSheets, setJobDataSheets] = useState(() => stripDummyRecords(loadLocalState('job_datasheets', [])));
  const [cylinders, setCylinders] = useState(() => stripDummyRecords(loadLocalState('cylinders', [])));
  const [productionRecords, setProductionRecords] = useState(() => stripDummyRecords(loadLocalState('production_records', [])));
  const [inventoryRolls, setInventoryRolls] = useState(() => stripDummyRecords(loadLocalState('inventory_rolls', [])));
  const [dispatchShipments, setDispatchShipments] = useState(() => stripDummyRecords(loadLocalState('dispatch_shipments', [])));
  const [deliveryChallans, setDeliveryChallans] = useState(() => stripDummyRecords(loadLocalState('delivery_challans', [])));
  const [certificateOfAnalyses, setCertificateOfAnalyses] = useState(() => stripDummyRecords(loadLocalState('certificate_of_analyses', [])));
  const [machines, setMachines] = useState(() => stripDummyRecords(loadLocalState('printing_machines', [])));
  const [schedules, setSchedules] = useState(() => stripDummyRecords(loadLocalState('production_schedules', [])));
  const [clients, setClients] = useState(() => stripDummyRecords(loadLocalState('clients', [])));
  const [jobMasters, setJobMasters] = useState(() => stripDummyRecords(loadLocalState('job_masters', [])));
  const [inks, setInks] = useState(() => loadLocalState('inks', initialInks));
  const [selectedJobMasterForPunch, setSelectedJobMasterForPunch] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(() => loadLocalState('role_permissions', DEFAULT_ROLE_PERMISSIONS));
  const [indents, setIndents] = useState(() => stripDummyRecords(loadLocalState('material_indents', [])));
  const [machineIssues, setMachineIssues] = useState(() => stripDummyRecords(loadLocalState('machine_issues', [])));
  const [consumables, setConsumables] = useState(() => stripDummyRecords(loadLocalState('consumables', [])));
  const [storeIssueTransactions, setStoreIssueTransactions] = useState(() => stripDummyRecords(loadLocalState('store_issue_transactions', [])));
  const [auditLogs, setAuditLogs] = useState(() => pruneOldAuditLogs(loadLocalState('audit_logs', [])));


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
    const list = [...(users || []).filter(u => u.id && !u.id.startsWith('USR-SETTING-')), ...initialUsers];
    const map = new Map();
    list.forEach(u => {
      if (u && (u.id || u.email) && !map.has(u.id || u.email)) {
        map.set(u.id || u.email, u);
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

  // Reactive listener for Supabase credential updates
  useEffect(() => {
    const handleCredentialsChanged = (e) => {
      const isConfigured = isSupabaseConfigured();
      setIsSupaActive(isConfigured);
    };

    window.addEventListener('supabase-credentials-changed', handleCredentialsChanged);
    return () => window.removeEventListener('supabase-credentials-changed', handleCredentialsChanged);
  }, []);

  // Sync state to safe storage (IndexedDB + sanitized localStorage) whenever modified
  useEffect(() => { safeLocalStorageSet('samyak_erp_orders', orders); }, [orders]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_vendors', vendors); }, [vendors]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_inventory', inventory); }, [inventory]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_grns', grns); }, [grns]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_users', users); }, [users]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_job_datasheets', jobDataSheets); }, [jobDataSheets]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_cylinders', cylinders); }, [cylinders]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_production_records', productionRecords); }, [productionRecords]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_inventory_rolls', inventoryRolls); }, [inventoryRolls]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_dispatch_shipments', dispatchShipments); }, [dispatchShipments]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_delivery_challans', deliveryChallans); }, [deliveryChallans]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_certificate_of_analyses', certificateOfAnalyses); }, [certificateOfAnalyses]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_printing_machines', machines); }, [machines]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_production_schedules', schedules); }, [schedules]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_clients', clients); }, [clients]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_job_masters', jobMasters); }, [jobMasters]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_inks', inks); }, [inks]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_role_permissions', rolePermissions); }, [rolePermissions]);

  useEffect(() => { safeLocalStorageSet('samyak_erp_material_indents', indents); }, [indents]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_machine_issues', machineIssues); }, [machineIssues]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_consumables', consumables); }, [consumables]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_store_issue_transactions', storeIssueTransactions); }, [storeIssueTransactions]);


  // Asynchronously hydrate any full artwork assets from IndexedDB if needed on mount
  useEffect(() => {
    let isMounted = true;
    async function hydrateIdbAssets() {
      try {
        const storedOrders = await idbGet('samyak_erp_orders');
        if (isMounted && storedOrders && Array.isArray(storedOrders) && storedOrders.length > 0) {
          const clean = stripDummyRecords(storedOrders);
          if (clean.length > 0) setOrders(clean);
        }
      } catch (err) {
        console.warn('Idb hydration error:', err);
      }
    }
    hydrateIdbAssets();
    return () => { isMounted = false; };
  }, []);

  // ============================================================================
  // WRITE-THROUGH CACHE: Persist all key state to localStorage on every change.
  // This guarantees data is available on refresh before Supabase finishes loading.
  // ============================================================================
  useEffect(() => { safeLocalStorageSet('samyak_erp_orders', orders); }, [orders]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_vendors', vendors); }, [vendors]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_inventory', inventory); }, [inventory]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_grns', grns); }, [grns]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_cylinders', cylinders); }, [cylinders]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_production_records', productionRecords); }, [productionRecords]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_job_datasheets', jobDataSheets); }, [jobDataSheets]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_inventory_rolls', inventoryRolls); }, [inventoryRolls]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_dispatch_shipments', dispatchShipments); }, [dispatchShipments]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_printing_machines', machines); }, [machines]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_production_schedules', schedules); }, [schedules]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_clients', clients); }, [clients]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_job_masters', jobMasters); }, [jobMasters]);


  // Fetch all tables from Supabase on initial load or credential changes
  useEffect(() => {
    if (!isSupaActive || !isAuthReady || !isAuthenticated) return;

    let isMounted = true;
    async function loadSupabaseData() {
      const fetchSafe = async (fn, label) => {
        try {
          const res = await fn();
          return res;
        } catch (e) {
          console.warn(`[Supabase Load Error] ${label}:`, e);
          return null;
        }
      };

      let [
        supaOrders, supaVendors, supaInv, supaGRNs, supaCyls, 
        supaProd, supaUsers, supaSheets, supaRolls, supaShipments,
        supaMachines, supaSchedules, supaClients, supaJobMasters,
        supaInks, supaRolePerms, supaAuditLogs
      ] = await Promise.all([
        fetchSafe(fetchOrders, 'Orders'),
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
        fetchSafe(fetchRolePermissionsFromSupabase, 'Role Permissions'),
        fetchSafe(fetchAuditLogsFromSupabase, 'Audit Logs')
      ]);


      // Fetch schema-independent system settings & lifted store states
      const [
        dbPrefixes, dbTerms, dbLogo, dbSignature,
        dbIndents, dbIssues, dbConsumables, dbStoreTx
      ] = await Promise.all([
        fetchSafe(() => fetchSystemSetting('doc_prefixes'), 'Prefixes'),
        fetchSafe(() => fetchSystemSetting('doc_terms'), 'Terms'),
        fetchSafe(() => fetchSystemSetting('company_logo'), 'Logo'),
        fetchSafe(() => fetchSystemSetting('auth_signature'), 'Signature'),
        fetchSafe(() => fetchSystemSetting('material_indents'), 'Indents'),
        fetchSafe(() => fetchSystemSetting('machine_issues'), 'Machine Issues'),
        fetchSafe(() => fetchSystemSetting('consumables'), 'Consumables'),
        fetchSafe(() => fetchSystemSetting('store_issue_transactions'), 'Store Issue Transactions')
      ]);

      if (!isMounted) return;

      if (Array.isArray(supaAuditLogs)) setAuditLogs(pruneOldAuditLogs(supaAuditLogs));
      if (dbPrefixes) safeLocalStorageSet('samyak_doc_prefixes', dbPrefixes);
      if (dbTerms) safeLocalStorageSet('samyak_doc_terms', dbTerms);
      if (dbLogo) safeLocalStorageSet('samyak_company_logo', dbLogo);
      if (dbSignature) safeLocalStorageSet('samyak_authorised_signature', dbSignature);
      if (dbIndents && Array.isArray(dbIndents)) setIndents(dbIndents);
      if (dbIssues && Array.isArray(dbIssues)) setMachineIssues(dbIssues);
      if (dbConsumables && Array.isArray(dbConsumables)) setConsumables(dbConsumables);
      if (dbStoreTx && Array.isArray(dbStoreTx)) setStoreIssueTransactions(stripDummyRecords(dbStoreTx));

      if (Array.isArray(supaOrders)) {
        const cleanSupa = stripDummyRecords(supaOrders);
        setOrders(prev => {
          const map = new Map();
          cleanSupa.forEach(o => { if (o && o.id) map.set(o.id, o); });
          (prev || []).forEach(p => {
            if (p && p.id && !isDummyRecord(p)) {
              if (!map.has(p.id)) {
                map.set(p.id, p);
                saveOrderToSupabase(p).catch(console.warn);
              } else {
                const existing = map.get(p.id);
                map.set(p.id, {
                  ...p,
                  ...existing,
                  layers: (existing.layers && existing.layers.length > 0) ? existing.layers : (p.layers || []),
                  calculationDetails: existing.calculationDetails || p.calculationDetails || null,
                  materialRequirements: (existing.materialRequirements && existing.materialRequirements.length > 0) ? existing.materialRequirements : (p.materialRequirements || [])
                });
              }
            }
          });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_orders', merged);
          return merged;
        });
        supaOrders.filter(isDummyRecord).forEach(d => deleteOrderFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaVendors)) {
        const cleanSupa = stripDummyRecords(supaVendors);
        setVendors(prev => {
          const map = new Map();
          cleanSupa.forEach(v => { if (v && v.id) map.set(v.id, v); });
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_vendors', merged);
          return merged;
        });
        supaVendors.filter(isDummyRecord).forEach(d => deleteVendorFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaInv)) {
        const cleanSupa = stripDummyRecords(supaInv);
        setInventory(prev => {
          const map = new Map();
          cleanSupa.forEach(i => { if (i && i.id) map.set(String(i.id), i); });
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(String(p.id))) map.set(String(p.id), p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_inventory', merged);
          return merged;
        });
        supaInv.filter(isDummyRecord).forEach(d => deleteInventoryItemFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaGRNs)) {
        const cleanSupa = stripDummyRecords(supaGRNs);
        setGrns(prev => {
          const map = new Map();
          cleanSupa.forEach(g => { const k = g.id || g.grnNo; if (k) map.set(k, g); });
          (prev || []).forEach(p => { const k = p.id || p.grnNo; if (k && !isDummyRecord(p) && !map.has(k)) map.set(k, p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_grns', merged);
          return merged;
        });
        supaGRNs.filter(isDummyRecord).forEach(d => deleteGRNFromSupabase(d.id || d.grnNo).catch(console.warn));
      }

      if (Array.isArray(supaCyls)) {
        const cleanSupa = stripDummyRecords(supaCyls);
        setCylinders(prev => {
          const prevMap = new Map();
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p)) prevMap.set(p.id, p); });

          const map = new Map();
          cleanSupa.forEach(c => {
            if (c && c.id) {
              const existing = prevMap.get(c.id);
              const mergedRecord = {
                ...(existing || {}),
                ...c,
                layers: (c.layers && c.layers.length > 0) ? c.layers : (existing?.layers || []),
                press_marks: { ...(existing?.press_marks || {}), ...(c.press_marks || {}) },
                printWidthMm: c.printWidthMm || existing?.printWidthMm || 1000,
                faceLengthMm: c.faceLengthMm || existing?.faceLengthMm || 1050,
                jobCardFileUrl: c.jobCardFileUrl || existing?.jobCardFileUrl || existing?.artworkUrl || '',
                artworkUrl: c.artworkUrl || existing?.artworkUrl || existing?.jobCardFileUrl || '',
                silLogo: c.silLogo || existing?.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
                arcMark: c.arcMark || existing?.arcMark || 'Yes',
                slittingMark: c.slittingMark || existing?.slittingMark || 'Yes',
                trackerLine: c.trackerLine || existing?.trackerLine || 'Yes',
                specialInstructions: c.specialInstructions || existing?.specialInstructions || '',
                chkEyemark: Boolean(c.chkEyemark || existing?.chkEyemark),
                chkBarcode: Boolean(c.chkBarcode || existing?.chkBarcode),
                chkOrientation: Boolean(c.chkOrientation || existing?.chkOrientation),
                chkClientApproval: Boolean(c.chkClientApproval || existing?.chkClientApproval),
                approvedByHead: Boolean(c.approvedByHead || existing?.approvedByHead),
                approvedHeadName: c.approvedHeadName || existing?.approvedHeadName || '',
                approvedHeadDate: c.approvedHeadDate || existing?.approvedHeadDate || ''
              };
              map.set(c.id, mergedRecord);
            }
          });
          prevMap.forEach((p, id) => {
            if (!map.has(id)) map.set(id, p);
          });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_cylinders', merged);
          return merged;
        });
        supaCyls.filter(isDummyRecord).forEach(d => deleteCylinderFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaProd)) {
        const cleanSupa = stripDummyRecords(supaProd);
        setProductionRecords(prev => {
          const map = new Map();
          cleanSupa.forEach(pr => { if (pr && pr.id) map.set(pr.id, pr); });
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_production_records', merged);
          return merged;
        });
        supaProd.filter(isDummyRecord).forEach(d => deleteProductionRecordFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaUsers) && supaUsers.length > 0) {
        setUsers(prev => {
          const map = new Map();
          supaUsers.forEach(u => {
            if (u && (u.id || u.email)) map.set(u.id || u.email, u);
          });
          (prev || []).forEach(p => {
            const key = p.id || p.email;
            if (key && !map.has(key)) map.set(key, p);
          });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_users', merged);
          return merged;
        });
      }

      if (Array.isArray(supaSheets)) {
        const cleanSupa = stripDummyRecords(supaSheets);
        setJobDataSheets(prev => {
          const map = new Map();
          cleanSupa.forEach(s => { if (s && s.id) map.set(s.id, s); });
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_job_datasheets', merged);
          return merged;
        });
        supaSheets.filter(isDummyRecord).forEach(d => deleteJobDataSheetFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaRolls)) setInventoryRolls(stripDummyRecords(supaRolls));
      if (Array.isArray(supaShipments)) setDispatchShipments(stripDummyRecords(supaShipments));
      if (Array.isArray(supaMachines)) setMachines(stripDummyRecords(supaMachines));

      if (Array.isArray(supaSchedules)) {
        const cleanSupa = stripDummyRecords(supaSchedules);
        setSchedules(prev => {
          const map = new Map();
          cleanSupa.forEach(s => { if (s && s.id) map.set(s.id, s); });
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_production_schedules', merged);
          return merged;
        });
        supaSchedules.filter(isDummyRecord).forEach(d => deleteProductionScheduleFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaClients)) {
        const cleanSupa = stripDummyRecords(supaClients);
        setClients(prev => {
          const map = new Map();
          cleanSupa.forEach(c => { if (c && c.id) map.set(c.id, c); });
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p) && !map.has(p.id)) map.set(p.id, p); });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_clients', merged);
          return merged;
        });
        supaClients.filter(isDummyRecord).forEach(d => deleteClientFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaJobMasters)) {
        const cleanSupa = stripDummyRecords(supaJobMasters);
        setJobMasters(prev => {
          const prevMap = new Map();
          (prev || []).forEach(p => { if (p && p.id && !isDummyRecord(p)) prevMap.set(p.id, p); });

          const map = new Map();
          cleanSupa.forEach(j => {
            if (j && j.id) {
              const existing = prevMap.get(j.id);
              const mergedRecord = {
                ...(existing || {}),
                ...j,
                layers: (j.layers && j.layers.length > 0) ? j.layers : (existing?.layers || []),
                press_marks: { ...(existing?.press_marks || {}), ...(j.press_marks || {}) },
                printWidthMm: j.printWidthMm || existing?.printWidthMm || 1000,
                faceLengthMm: j.faceLengthMm || existing?.faceLengthMm || 1050,
                jobCardFileUrl: j.jobCardFileUrl || existing?.jobCardFileUrl || existing?.artworkUrl || '',
                artworkUrl: j.artworkUrl || existing?.artworkUrl || existing?.jobCardFileUrl || '',
                silLogo: j.silLogo || existing?.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
                arcMark: j.arcMark || existing?.arcMark || 'Yes',
                slittingMark: j.slittingMark || existing?.slittingMark || 'Yes',
                trackerLine: j.trackerLine || existing?.trackerLine || 'Yes',
                specialInstructions: j.specialInstructions || existing?.specialInstructions || '',
                chkEyemark: Boolean(j.chkEyemark || existing?.chkEyemark),
                chkBarcode: Boolean(j.chkBarcode || existing?.chkBarcode),
                chkOrientation: Boolean(j.chkOrientation || existing?.chkOrientation),
                chkClientApproval: Boolean(j.chkClientApproval || existing?.chkClientApproval),
                approvedByHead: Boolean(j.approvedByHead || existing?.approvedByHead),
                approvedHeadName: j.approvedHeadName || existing?.approvedHeadName || '',
                approvedHeadDate: j.approvedHeadDate || existing?.approvedHeadDate || ''
              };
              map.set(j.id, mergedRecord);
            }
          });
          prevMap.forEach((p, id) => {
            if (!map.has(id)) map.set(id, p);
          });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_job_masters', merged);
          return merged;
        });
        supaJobMasters.filter(isDummyRecord).forEach(d => deleteJobMasterFromSupabase(d.id).catch(console.warn));
      }

      if (Array.isArray(supaInks)) {
        setInks(prev => {
          const map = new Map();
          supaInks.forEach(i => { if (i && i.id) map.set(i.id, i); });
          (prev || []).forEach(p => {
            if (p && p.id && !map.has(p.id)) {
              map.set(p.id, p);
              saveInkToSupabase(p).catch(console.warn);
            }
          });
          const merged = Array.from(map.values());
          safeLocalStorageSet('samyak_erp_inks', merged);
          return merged;
        });
      }

      if (supaRolePerms && typeof supaRolePerms === 'object' && Object.keys(supaRolePerms).length > 0) {

        setRolePermissions(supaRolePerms);
        safeLocalStorageSet('samyak_erp_role_permissions', supaRolePerms);
      }
    }

    loadSupabaseData();
    return () => { isMounted = false; };
  }, [isSupaActive, isAuthReady, isAuthenticated]);


  // Realtime subscription for public.inventory to keep live stock and dashboard metrics 100% in sync
  useEffect(() => {
    if (!isSupaActive || !isAuthReady || !isAuthenticated) return;

    console.log('[Supabase Realtime] Subscribing to public.inventory changes...');
    const channel = supabase
      .channel('public:inventory_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
          console.log('[Supabase Realtime] Inventory event received:', payload.eventType, payload);
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

  const handleSaveMachine = (newMachine) => {
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
    setMachines(prev => [machineWithId, ...prev.filter(m => m.id !== machineWithId.id)]);
    savePrintingMachineToSupabase(machineWithId);
  };

  const handleUpdateMachine = (updatedMachine) => {
    setMachines(prev => prev.map(m => m.id === updatedMachine.id ? updatedMachine : m));
    savePrintingMachineToSupabase(updatedMachine);
  };

  const handleDeleteMachine = (machineId) => {
    setMachines(prev => prev.filter(m => m.id !== machineId));
    deletePrintingMachineFromSupabase(machineId);
  };

  const handleSaveSchedule = (newSchedule) => {
    setSchedules(prev => {
      const idx = prev.findIndex(s => s.id === newSchedule.id || s.orderId === newSchedule.orderId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = newSchedule;
        return updated;
      }
      return [newSchedule, ...prev];
    });
    saveProductionScheduleToSupabase(newSchedule);
  };

  const handleDeleteSchedule = (scheduleId) => {
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
    deleteProductionScheduleFromSupabase(scheduleId);
  };

  const findUserProfile = (email) => {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    let matched = (users || []).find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
    if (matched) return matched;
    return initialUsers.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
  };

  // Initialize Supabase Auth state
  useEffect(() => {
    if (!isSupaActive) return;

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
            const savedSwitchedUser = loadLocalState('samyak_erp_current_user', null);
            if (savedSwitchedUser && profile.role === 'Admin') {
              setCurrentUser(savedSwitchedUser);
            } else {
              setCurrentUser(profile);
            }
            setIsAuthenticated(true);
          } else {
            setSessionProfile(null);
            setCurrentUser(null);
            setIsAuthenticated(false);
          }
          setIsAuthReady(true);
        }
      } catch (err) {
        console.warn('Failed to get Supabase session on mount:', err);
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

        const savedSwitchedUser = loadLocalState('samyak_erp_current_user', null);
        if (savedSwitchedUser && profile.role === 'Admin') {
          setCurrentUser(savedSwitchedUser);
        } else {
          setCurrentUser(profile);
        }
        setIsAuthenticated(true);
      } else {
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
  }, [isSupaActive, users]);

  // Login Handler (for UI updates, authService handles Supabase login)
  const handleLogin = (user) => {
    logAudit('AUTH', 'User Management', `User ${user?.name || user?.email || 'User'} signed in to the system`, user?.id);
    if (!isSupaActive) {
      setSessionProfile(user);
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  };

  // Logout Handler (for UI updates, authService handles Supabase logout)
  const handleLogout = () => {
    logAudit('AUTH', 'User Management', `User ${currentUser?.name || currentUser?.email || 'User'} signed out of the system`, currentUser?.id);
    localStorage.removeItem('samyak_erp_current_user');
    if (!isSupaActive) {
      setSessionProfile(null);
      setCurrentUser(null);
      setIsAuthenticated(false);
    } else {
      supabase.auth.signOut().catch(console.warn);
    }
  };

  const isRecDue = isReconciliationDue();
  const delayedOrdersCount = (orders || []).filter(o => isOrderOverdue(o)).length;
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
      const sum = recList.reduce((acc, r) => acc + (r.wastagePercentage || 0), 0);
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
  const handleSaveProductionRecord = (newRecord) => {
    setProductionRecords(prev => [newRecord, ...prev.filter(r => r.orderId !== newRecord.orderId)]);
    saveProductionRecordToSupabase(newRecord);
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

  const handleApproveProductionRecord = (recordId, adminName) => {
    setProductionRecords(prev => prev.map(r => {
      if (r.id === recordId) {
        const updated = {
          ...r,
          status: 'Approved by Admin',
          approvedBy: adminName,
          approvalDate: new Date().toLocaleString()
        };
        saveProductionRecordToSupabase(updated);
        logAudit('UPDATE', 'Production Records', `Plant manager approval granted for production record ${recordId} by ${adminName}`, recordId);
        return updated;
      }
      return r;
    }));
  };

  const handleStoreIssueReturn = async ({ item, issueType, qty, jobName, user, notes, barcode }) => {
    if (!item || !qty || qty <= 0 || !jobName) return;

    const unitStr = item.unit || 'Kg';
    const itemNameStr = item.itemName || `${item.filmType || ''} ${item.micron && item.micron !== '-' ? `${item.micron}µ` : ''}`.trim() || `${item.category || 'Store'} Item`;

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
    setInventory(updatedInv);
    const updatedItem = updatedInv.find(i => i.id === item.id);
    if (updatedItem) {
      saveInventoryItemToSupabase(updatedItem).catch(console.warn);
    }

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
      issueType: issueType, // 'issue' | 'return'
      jobName: jobName,
      qtyKg: qty,
      unit: unitStr,
      unitPrice: Number(item.unitPrice || item.purchaseRatePerKg || 0),
      date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      issuedBy: user || currentUser?.name || 'Store Manager',
      notes: notes || (issueType === 'issue'
        ? `Issued ${qty} ${unitStr} to Job: ${jobName}`
        : `Returned ${qty} ${unitStr} from Job: ${jobName} back to Store`),
      barcode: barcode || item.lastBatch || `BAR-ISS-${item.id}`
    };

    const newTxList = [newTx, ...storeIssueTransactions];
    setStoreIssueTransactions(newTxList);
    try {
      await saveSystemSetting('store_issue_transactions', newTxList);
    } catch (e) {}

    // 3. Update / Earmark the Production Record of this Job
    const targetOrder = (orders || []).find(o => 
      o.jobName?.trim().toLowerCase() === jobName.trim().toLowerCase() || o.id === jobName
    );
    const orderId = targetOrder ? targetOrder.id : jobName;
    const clientName = targetOrder ? targetOrder.clientName : '';

    setProductionRecords(prevRecords => {
      const existingIdx = prevRecords.findIndex(r => 
        r.orderId === orderId || (r.jobName && r.jobName.trim().toLowerCase() === jobName.trim().toLowerCase())
      );

      let targetRecord;
      if (existingIdx >= 0) {
        targetRecord = { ...prevRecords[existingIdx] };
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

      const itemRate = parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0;

      if (matIdx >= 0) {
        const existingMat = currentMaterials[matIdx];
        const currIssued = parseFloat(existingMat.issueQtyKg) || 0;
        const currReturned = parseFloat(existingMat.returnQtyKg) || 0;

        const newIssued = issueType === 'issue' ? currIssued + qty : currIssued;
        const newReturned = issueType === 'return' ? currReturned + qty : currReturned;
        const netConsumed = Math.max(0, newIssued - newReturned);
        const matRate = parseFloat(existingMat.unitPricePerKg) || itemRate;

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
          totalMaterialCost: netConsumed * matRate
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
          barcode: barcode || item.lastBatch || `BAR-ISS-${item.id}`,
          issueQtyKg: issuedQty,
          returnQtyKg: returnedQty,
          netConsumedQtyKg: netConsumed,
          unitPricePerKg: itemRate,
          totalMaterialCost: netConsumed * itemRate,
          jobMasterFilmType: item.filmType || item.itemName,
          jobMasterMicron: item.micron && item.micron !== '-' ? Number(item.micron) : 0,
          jobMasterWidthMm: item.widthMm && item.widthMm !== '-' ? Number(item.widthMm) : 0
        });
      }

      targetRecord.materialsList = currentMaterials;
      targetRecord.totalMaterialCostRs = currentMaterials.reduce((sum, m) => sum + (parseFloat(m.totalMaterialCost) || 0), 0);
      targetRecord.finalProductionCostRs = (parseFloat(targetRecord.totalProcessingCostRs) || 0) + targetRecord.totalMaterialCostRs;

      saveProductionRecordToSupabase(targetRecord).catch(console.warn);

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
    setConsumables(newConsumables);
    logAudit('UPDATE', 'Consumable Store', `Updated consumable store inventory levels`, 'CONSUMABLES');
    try {
      await saveSystemSetting('consumables', newConsumables);
    } catch (err) {
      console.warn("[Sync Notice] Consumables updated locally. Supabase notice:", err);
    }
  };

  const handleUpdateIndents = async (newIndents) => {
    setIndents(newIndents);
    logAudit('UPDATE', 'Material Indents', `Updated plant material indents / purchase requisitions`, 'INDENTS');
    try {
      await saveSystemSetting('material_indents', newIndents);
    } catch (err) {
      console.warn("[Sync Notice] Indents updated locally. Supabase notice:", err);
    }
  };

  const handleUpdateMachineIssues = async (newIssues) => {
    setMachineIssues(newIssues);
    logAudit('UPDATE', 'Machine Stock Issue', `Recorded stock item issue to machine`, 'ISSUES');
    try {
      await saveSystemSetting('machine_issues', newIssues);
    } catch (err) {
      console.warn("[Sync Notice] Machine issues updated locally. Supabase notice:", err);
    }
  };

  // Handlers for state updates (Preserves local state + async Supabase sync)
  const handleAddOrder = async (newOrder) => {
    setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
    logAudit('CREATE', 'Orders', `Punched job order ${newOrder.id} - "${newOrder.jobName}" for client "${newOrder.clientName}" (${newOrder.orderQtyKg} kg)`, newOrder.id);
    try {
      await saveOrderToSupabase(newOrder);
    } catch (err) {
      console.warn("[Sync Notice] Order saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateOrder = async (updatedOrder) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    logAudit('UPDATE', 'Orders', `Updated order details/status for ${updatedOrder.id} - "${updatedOrder.jobName}" (${updatedOrder.status})`, updatedOrder.id);
    try {
      await saveOrderToSupabase(updatedOrder);
    } catch (err) {
      console.warn("[Sync Notice] Order updated locally. Supabase notice:", err);
    }
  };
  const handleUpdateOrderStatus = handleUpdateOrder;

  const handleDeleteOrder = async (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    logAudit('DELETE', 'Orders', `Deleted job order record ${orderId}`, orderId);
    try {
      await deleteOrderFromSupabase(orderId);
    } catch (err) {
      console.warn("[Sync Notice] Order deleted locally. Supabase notice:", err);
    }
  };

  const handleAddVendor = async (newVendor) => {
    setVendors(prev => [...prev.filter(v => v.id !== newVendor.id), newVendor]);
    logAudit('CREATE', 'Vendors', `Saved vendor record "${newVendor.name || newVendor.companyName}" (${newVendor.id})`, newVendor.id);
    try {
      await saveVendorToSupabase(newVendor);
    } catch (err) {
      console.warn("[Sync Notice] Vendor saved locally. Supabase notice:", err);
    }
  };

  const handleAddGRN = async (newGRN) => {
    setGrns(prev => [newGRN, ...prev.filter(g => g.grnNo !== newGRN.grnNo)]);
    logAudit('CREATE', 'GRN Inward', `Issued GRN ${newGRN.grnNo} for "${newGRN.itemName}" (${newGRN.receivedQtyKg} kg) from ${newGRN.vendorName}`, newGRN.grnNo);
    try {
      await saveGRNToSupabase(newGRN);
    } catch (err) {
      console.warn("[Sync Notice] GRN saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateGRN = async (updatedGRN) => {
    setGrns(prev => prev.map(g => g.grnNo === updatedGRN.grnNo ? updatedGRN : g));
    logAudit('UPDATE', 'GRN Inward', `Updated GRN ${updatedGRN.grnNo} status to "${updatedGRN.status}"`, updatedGRN.grnNo);
    try {
      await saveGRNToSupabase(updatedGRN);
    } catch (err) {
      console.warn("[Sync Notice] GRN updated locally. Supabase notice:", err);
    }
  };

  const handleUpdateInventory = async (newInventory) => {
    setInventory(newInventory);
    if (Array.isArray(newInventory)) {
      try {
        await saveInventoryBatchToSupabase(newInventory);
      } catch (err) {
        console.warn("[Sync Notice] Inventory updated. Supabase notice:", err);
      }
    }
  };

  const handleSaveInventoryItem = async (item) => {
    if (!item) return;
    setInventory(prev => {
      const exists = prev.some(i => String(i.id) === String(item.id));
      if (exists) {
        return prev.map(i => String(i.id) === String(item.id) ? { ...i, ...item } : i);
      }
      return [item, ...prev];
    });
    logAudit('UPDATE', 'Inventory', `Saved stock item ${item.itemCode || item.id} - "${item.itemName}" (${item.availableQtyKg} ${item.unit || 'Kg'})`, item.id);
    try {
      await saveInventoryItemToSupabase(item);
    } catch (err) {
      console.warn("[Sync Notice] Inventory item saved. Supabase notice:", err);
    }
  };

  const handleDeleteInventoryItem = async (itemId) => {
    if (!itemId) return;
    setInventory(prev => prev.filter(i => String(i.id) !== String(itemId)));
    logAudit('DELETE', 'Inventory', `Deleted inventory item ${itemId}`, itemId);
    try {
      await deleteInventoryItemFromSupabase(itemId);
    } catch (err) {
      console.warn("[Sync Notice] Inventory item deleted. Supabase notice:", err);
    }
  };

  const handleAddUser = async (newUser) => {
    setUsers(prev => {
      const updated = [...prev.filter(u => u.id !== newUser.id), newUser];
      safeLocalStorageSet('samyak_erp_users', updated);
      return updated;
    });
    logAudit('CREATE', 'User Management', `Created user account for ${newUser.name} (${newUser.email}) - Role: ${newUser.role}`, newUser.id);
    try {
      // 1. Register in Supabase Auth so they can log in with email+password
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
      // 2. Save full profile (including password_hash) to public.users table
      await saveUserToSupabase(newUser);
    } catch (err) {
      console.warn("[Sync Notice] User saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateUser = async (updatedUser) => {
    setUsers(prev => {
      const updated = prev.map(u => u.id === updatedUser.id ? updatedUser : u);
      safeLocalStorageSet('samyak_erp_users', updated);
      return updated;
    });
    logAudit('UPDATE', 'User Management', `Updated user account/permissions for ${updatedUser.name} (${updatedUser.email}) - Role: ${updatedUser.role}`, updatedUser.id);
    try {
      // Save full profile including the updated password_hash
      await saveUserToSupabase(updatedUser);
    } catch (err) {
      console.warn("[Sync Notice] User updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteUser = async (userId) => {
    setUsers(prev => {
      const updated = prev.filter(u => u.id !== userId);
      safeLocalStorageSet('samyak_erp_users', updated);
      return updated;
    });
    logAudit('DELETE', 'User Management', `Deleted user account ${userId}`, userId);
    try {
      await deleteUserFromSupabase(userId);
    } catch (err) {
      console.warn("[Sync Notice] User deleted locally. Supabase notice:", err);
    }
  };

  const handleAddJobDataSheet = async (newSheet) => {
    setJobDataSheets(prev => [newSheet, ...prev.filter(s => s.id !== newSheet.id)]);
    logAudit('CREATE', 'Job Data Sheets', `Created job datasheet ${newSheet.id} for "${newSheet.jobName}"`, newSheet.id);
    try {
      await saveJobDataSheetToSupabase(newSheet);
    } catch (err) {
      console.warn("[Sync Notice] Job Data Sheet saved locally. Supabase notice:", err);
    }
  };

  const handleDeleteJobDataSheet = async (sheetId) => {
    setJobDataSheets(prev => prev.filter(s => s.id !== sheetId));
    logAudit('DELETE', 'Job Data Sheets', `Deleted job datasheet ${sheetId}`, sheetId);
    try {
      await deleteJobDataSheetFromSupabase(sheetId);
    } catch (err) {
      console.warn("[Sync Notice] Job Data Sheet deleted locally. Supabase notice:", err);
    }
  };

  const handleAddCylinder = async (newCyl) => {
    setCylinders(prev => [newCyl, ...prev.filter(c => c.id !== newCyl.id)]);
    logAudit('CREATE', 'Cylinders', `Added rotogravure cylinder ${newCyl.sku} for "${newCyl.jobName}"`, newCyl.id);
    try {
      await saveCylinderToSupabase(newCyl);
    } catch (err) {
      console.warn("[Sync Notice] Cylinder saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateCylinder = async (updatedCyl) => {
    setCylinders(prev => prev.map(c => c.id === updatedCyl.id ? updatedCyl : c));
    logAudit('UPDATE', 'Cylinders', `Updated rotogravure cylinder ${updatedCyl.sku} for "${updatedCyl.jobName}"`, updatedCyl.id);
    try {
      await saveCylinderToSupabase(updatedCyl);
    } catch (err) {
      console.warn("[Sync Notice] Cylinder updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteCylinder = async (cylId) => {
    setCylinders(prev => prev.filter(c => c.id !== cylId));
    logAudit('DELETE', 'Cylinders', `Deleted rotogravure cylinder ${cylId}`, cylId);
    try {
      await deleteCylinderFromSupabase(cylId);
    } catch (err) {
      console.warn("[Sync Notice] Cylinder deleted locally. Supabase notice:", err);
    }
  };

  const handleAddRoll = async (newRoll) => {
    setInventoryRolls(prev => [newRoll, ...prev.filter(r => r.id !== newRoll.id)]);
    logAudit('CREATE', 'Inventory Rolls', `Generated child roll barcode ${newRoll.barcodeId || newRoll.id} (${newRoll.netWeightKg} kg)`, newRoll.id);
    try {
      await saveInventoryRollToSupabase(newRoll);
    } catch (err) {
      console.warn("[Sync Notice] Roll saved locally. Supabase notice:", err);
    }
  };

  const handleAddDispatchShipment = async (newShipment) => {
    setDispatchShipments(prev => [newShipment, ...prev.filter(s => s.id !== newShipment.id)]);
    logAudit('CREATE', 'Dispatch', `Created client dispatch shipment ${newShipment.id} for "${newShipment.clientName}"`, newShipment.id);
    try {
      await saveDispatchShipmentToSupabase(newShipment);
    } catch (err) {
      console.warn("[Sync Notice] Dispatch shipment saved locally. Supabase notice:", err);
    }
  };

  const handleSaveDeliveryChallan = (newDc) => {
    setDeliveryChallans(prev => [newDc, ...prev.filter(d => d.id !== newDc.id)]);
    logAudit('CREATE', 'Dispatch', `Issued Delivery Challan ${newDc.challanNo} for "${newDc.clientName}"`, newDc.id);
  };

  const handleDeleteDeliveryChallan = (id) => {
    const updated = deliveryChallans.filter(d => d.id !== id);
    setDeliveryChallans(updated);
    logAudit('DELETE', 'Dispatch', `Deleted Delivery Challan ${id}`, id);
  };

  const handleSaveCoA = (newCoa) => {
    setCertificateOfAnalyses(prev => [newCoa, ...prev.filter(c => c.id !== newCoa.id)]);
    logAudit('CREATE', 'Quality', `Generated Quality CoA ${newCoa.coaNo} for "${newCoa.jobName}"`, newCoa.id);
  };

  const handleDeleteCoA = (id) => {
    const updated = certificateOfAnalyses.filter(c => c.id !== id);
    setCertificateOfAnalyses(updated);
    logAudit('DELETE', 'Quality', `Deleted Quality CoA ${id}`, id);
  };

  const handleAddClient = async (newClient) => {
    setClients(prev => [...prev.filter(c => c.id !== newClient.id), newClient]);
    logAudit('CREATE', 'Clients', `Saved client directory entry "${newClient.name}" (${newClient.id})`, newClient.id);
    try {
      await saveClientToSupabase(newClient);
    } catch (err) {
      console.warn("[Sync Notice] Client saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateClient = async (updatedClient) => {
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    logAudit('UPDATE', 'Clients', `Updated client directory entry "${updatedClient.name}" (${updatedClient.id})`, updatedClient.id);
    try {
      await saveClientToSupabase(updatedClient);
    } catch (err) {
      console.warn("[Sync Notice] Client updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteClient = async (clientId) => {
    setClients(prev => prev.filter(c => c.id !== clientId));
    logAudit('DELETE', 'Clients', `Deleted client directory entry ${clientId}`, clientId);
    try {
      await deleteClientFromSupabase(clientId);
    } catch (err) {
      console.warn("[Sync Notice] Client deleted locally. Supabase notice:", err);
    }
  };

  const handleAddJobMaster = async (newJobMaster) => {
    setJobMasters(prev => [...prev.filter(j => j.id !== newJobMaster.id), newJobMaster]);
    logAudit('CREATE', 'Job Masters', `Created job master template "${newJobMaster.jobName}" (${newJobMaster.id})`, newJobMaster.id);
    try {
      await saveJobMasterToSupabase(newJobMaster);
    } catch (err) {
      console.warn("[Sync Notice] Job Master saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateJobMaster = async (updatedJobMaster) => {
    setJobMasters(prev => prev.map(j => j.id === updatedJobMaster.id ? updatedJobMaster : j));
    logAudit('UPDATE', 'Job Masters', `Updated job master template "${updatedJobMaster.jobName}" (${updatedJobMaster.id})`, updatedJobMaster.id);
    try {
      await saveJobMasterToSupabase(updatedJobMaster);
    } catch (err) {
      console.warn("[Sync Notice] Job Master updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteJobMaster = async (jobMasterId) => {
    setJobMasters(prev => prev.filter(j => j.id !== jobMasterId));
    logAudit('DELETE', 'Job Masters', `Deleted job master record ${jobMasterId}`, jobMasterId);
    try {
      await deleteJobMasterFromSupabase(jobMasterId);
    } catch (err) {
      console.warn("[Sync Notice] Job Master deleted locally. Supabase notice:", err);
    }
  };

  // Ink Management Handlers
  const handleAddInk = async (newInk) => {
    setInks(prev => [newInk, ...prev.filter(i => i.id !== newInk.id)]);
    logAudit('CREATE', 'Ink Management', `Added ink product code "${newInk.productCode}" - ${newInk.shade} (${newInk.inkType}, ${newInk.solidContentPct}% solid)`, newInk.id);
    try {
      await saveInkToSupabase(newInk);
    } catch (err) {
      console.warn("[Sync Notice] Ink saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateInk = async (updatedInk) => {
    setInks(prev => prev.map(i => i.id === updatedInk.id ? updatedInk : i));
    logAudit('UPDATE', 'Ink Management', `Updated ink product code "${updatedInk.productCode}" - ${updatedInk.shade}`, updatedInk.id);
    try {
      await saveInkToSupabase(updatedInk);
    } catch (err) {
      console.warn("[Sync Notice] Ink updated locally. Supabase notice:", err);
    }
  };

  const handleUpdateInkPrice = async (updatedInk, newPrice, reason) => {
    setInks(prev => prev.map(i => i.id === updatedInk.id ? updatedInk : i));
    logAudit('UPDATE', 'Ink Management', `Updated rate for ink "${updatedInk.productCode}" (${updatedInk.shade}) to ₹${newPrice}/kg. Reason: ${reason}`, updatedInk.id);
    try {
      await saveInkToSupabase(updatedInk);
    } catch (err) {
      console.warn("[Sync Notice] Ink rate updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteInk = async (inkId) => {
    setInks(prev => prev.filter(i => i.id !== inkId));
    logAudit('DELETE', 'Ink Management', `Deleted ink product code ${inkId}`, inkId);
    try {
      await deleteInkFromSupabase(inkId);
    } catch (err) {
      console.warn("[Sync Notice] Ink deleted locally. Supabase notice:", err);
    }
  };


  const handlePunchOrderFromJobMaster = (jobMaster) => {
    setSelectedJobMasterForPunch(jobMaster);
    handleTabChange('job_punching');
  };

  // Render Loading Screen if auth state is not initialized
  if (!isAuthReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-main)' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="spinner" style={{ width: '24px', height: '24px', border: '3px solid var(--primary-brand)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          Authenticating with Supabase...
        </div>
      </div>
    );
  }

  // Render Authentication Screen if user is not signed in
  if (!isAuthenticated || !currentUser) {
    // Callback: update password in local state after OTP-verified reset
    const handleUpdatePassword = (email, newPassword) => {
      setUsers(prev => {
        const updated = prev.map(u =>
          u.email?.toLowerCase().trim() === email?.toLowerCase().trim()
            ? { ...u, password: newPassword }
            : u
        );
        safeLocalStorageSet('samyak_erp_users', updated);
        return updated;
      });
    };
    return <AuthScreen users={users} onLogin={handleLogin} onUpdatePassword={handleUpdatePassword} />;
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
          {(isTabAllowed('inventory') || isTabAllowed('ink_management') || isTabAllowed('material_indents') || isTabAllowed('vendors') || isTabAllowed('dispatch')) && (
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
              {activeTab === 'sales' && 'Sales Management & Professional Quotation Engine'}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
            currentUser={currentUser}
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
            cylinders={cylinders}
            productionRecords={productionRecords}
            orders={orders}
            clients={clients}
            currentUser={currentUser}
            onAddJobMaster={handleAddJobMaster}
            onUpdateJobMaster={handleUpdateJobMaster}
            onDeleteJobMaster={handleDeleteJobMaster}
            onAddCylinder={handleAddCylinder}
            onAddClient={handleAddClient}
            onPunchOrderFromJobMaster={handlePunchOrderFromJobMaster}
          />
        )}

        {/* TAB: INK MANAGEMENT SYSTEM */}
        {activeTab === 'ink_management' && (
          <InkManagement 
            inks={inks}
            vendors={vendors}
            currentUser={currentUser}
            onAddInk={handleAddInk}
            onUpdateInk={handleUpdateInk}
            onDeleteInk={handleDeleteInk}
            onUpdateInkPrice={handleUpdateInkPrice}
            onSaveOrder={handleAddOrder}
          />
        )}


        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Urgent Delay Alert Box if delayed orders exist */}
            {delayedOrdersCount > 0 && (
              <div className="delayed-alert-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <AlertTriangle size={32} style={{ color: '#dc2626' }} />
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#dc2626' }}>
                      CRITICAL ALERT: {delayedOrdersCount} ORDER(S) GOING BEYOND TIMEFRAME (RED HIGHLIGHTED)
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#991b1b', marginTop: '2px' }}>
                      Orders have crossed target delivery deadlines. Immediate raw material allocation and PO issuance required.
                    </p>
                  </div>
                </div>
                <button className="btn-danger-action" onClick={() => handleTabChange('orders')}>
                  Manage Delayed Orders
                </button>
              </div>
            )}

            {/* Urgent Low Stock Ink Alert Banner */}
            {(lowStockInks || []).length > 0 && (
              <div className="delayed-alert-banner" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <Droplet size={32} style={{ color: '#e11d48' }} />
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#e11d48' }}>
                      CRITICAL INK ALERT: {(lowStockInks || []).length} INK PRODUCT CODE(S) BELOW RESERVE LEVEL
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#9f1239', marginTop: '2px' }}>
                      Manufacturer Codes: {(lowStockInks || []).map(i => `${i.productCode} (${i.shade})`).join(', ')}. Immediate supplier PO reorder required.
                    </p>
                  </div>
                </div>
                <button className="btn-danger-action" onClick={() => handleTabChange('ink_management')}>
                  Reorder Inks Now
                </button>
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
                        const isOverdue = isOrderOverdue(o);
                        // Derive substrate structure from the matching Job Master's layers, fallback to order.structure
                        const matchedJM = (jobMasters || []).find(j =>
                          (j.jobName || '').toLowerCase().trim() === (o.jobName || '').toLowerCase().trim()
                        );
                        const substrateDisplay = matchedJM && matchedJM.layers && matchedJM.layers.length > 0
                          ? matchedJM.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
                          : (o.structure || '—');
                        return (
                          <tr key={o.id} className={isOverdue ? 'row-delayed-highlight' : ''}>
                            <td style={{ fontWeight: '700', color: isOverdue ? '#dc2626' : 'var(--primary-brand)' }}>{o.id}</td>
                            <td style={{ fontWeight: '600' }}>{o.jobName}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{substrateDisplay}</td>
                            <td style={{ color: isOverdue ? '#dc2626' : 'inherit', fontWeight: isOverdue ? '700' : 'normal' }}>
                              {o.targetDeliveryDate}
                            </td>
                            <td>
                              {isOverdue ? (
                                <span className="badge-delayed-tag">DELAYED</span>
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
            currentUser={currentUser}
            userRole={currentUser?.role}
            onAddOrder={handleAddOrder}
            onAddJobMaster={handleAddJobMaster}
            onAddClient={handleAddClient}
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
            onAddJobMaster={handleAddJobMaster}
            onUpdateJobMaster={handleUpdateJobMaster}
            onDeleteJobMaster={handleDeleteJobMaster}
            onOpenJobCardModal={(jm) => {
              setSelectedJobMasterForPunch(jm);
              setActiveTab('job_punching');
            }}
          />
        )}

        {/* TAB: CYLINDERS */}
        {activeTab === 'cylinders' && (
          <CylinderManagement 
            urlParams={urlParams}
            cylinders={cylinders}
            orders={orders}
            jobMasters={jobMasters}
            onAddCylinder={handleAddCylinder}
            onUpdateCylinder={handleUpdateCylinder}
            onDeleteCylinder={handleDeleteCylinder}
          />
        )}

        {/* TAB 1: JOB PUNCHING & PRE-COSTING */}
        {activeTab === 'job_punching' && (
          <JobPunchingForm 
            onSaveOrder={handleSaveOrder} 
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
            currentUser={currentUser}
            productionRecords={productionRecords}
            onUpdateOrder={handleUpdateOrder} 
            onDeleteOrder={handleDeleteOrder}
            onNavigateToPunching={() => handleTabChange('job_punching')}
            onNavigateToProductionRecords={() => handleTabChange('production_records')}
          />
        )}

        {/* TAB 5: VENDOR MANAGEMENT */}
        {activeTab === 'vendors' && (
          <VendorManagement urlParams={urlParams} vendors={vendors} orders={orders} onAddVendor={handleAddVendor} />
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
            onAddRoll={handleAddRoll}
            onAddDispatchShipment={handleAddDispatchShipment}
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
            deliveryChallans={deliveryChallans}
            certificateOfAnalyses={certificateOfAnalyses}
            clients={clients}
            jobMasters={jobMasters}
            orders={orders}
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

        {/* TAB 8: CYLINDER DATABASE & UTILISATION */}
        {activeTab === 'cylinders' && (
          <CylinderManagement 
            urlParams={urlParams}
            cylinders={cylinders}
            clients={clients}
            onAddClient={handleAddClient}
            jobMasters={jobMasters}
            onAddJobMaster={handleAddJobMaster}
            onUpdateJobMaster={handleUpdateJobMaster}
            currentUser={currentUser}
            onAddCylinder={handleAddCylinder}
            onUpdateCylinder={handleUpdateCylinder}
            onDeleteCylinder={handleDeleteCylinder}
          />
        )}

        {/* TAB 9: PRINTING MACHINE PRODUCTION SCHEDULER */}
        {activeTab === 'printing_scheduler' && (
          <ProductionScheduler 
            orders={orders}
            inventory={inventory}
            machines={machines}
            schedules={schedules}
            jobMasters={jobMasters}
            onSaveMachine={handleSaveMachine}
            onUpdateMachine={handleUpdateMachine}
            onDeleteMachine={handleDeleteMachine}
            onSaveSchedule={handleSaveSchedule}
            onDeleteSchedule={handleDeleteSchedule}
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
    </div>
  );

}
