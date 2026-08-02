import React, { useState, useEffect } from 'react';
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
  initialJobMasters
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
  Settings as SettingsIcon
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
import ErrorButton from './components/ErrorButton';
import { getTabFromUrl, pushSlugState } from './utils/slugRouter';
import { isSupabaseConfigured } from './services/supabaseClient';
import { 
  fetchOrders, saveOrderToSupabase, deleteOrderFromSupabase,
  fetchVendors, saveVendorToSupabase, deleteVendorFromSupabase,
  fetchInventory, saveInventoryItemToSupabase, deleteInventoryItemFromSupabase,
  fetchGRNs, saveGRNToSupabase,
  fetchCylinders, saveCylinderToSupabase, deleteCylinderFromSupabase,
  fetchProductionRecords, saveProductionRecordToSupabase,
  fetchUsers, saveUserToSupabase,
  fetchJobDataSheets, saveJobDataSheetToSupabase, deleteJobDataSheetFromSupabase,
  fetchInventoryRolls, saveInventoryRollToSupabase,
  fetchDispatchShipments, saveDispatchShipmentToSupabase,
  fetchPrintingMachines, savePrintingMachineToSupabase, deletePrintingMachineFromSupabase,
  fetchProductionSchedules, saveProductionScheduleToSupabase, deleteProductionScheduleFromSupabase,
  fetchClients, saveClientToSupabase, deleteClientFromSupabase,
  fetchJobMasters, saveJobMasterToSupabase, deleteJobMasterFromSupabase
} from './services/supabaseDataService';
import JobMasterDirectory from './components/JobMasterDirectory';
import { initialInventoryRolls, initialDispatchShipments } from './factoryStore';
import { safeLocalStorageSet, safeLocalStorageGet, initSafeStorage, idbGet } from './utils/safeStorage';
import './index.css';

// Immediately sanitize localStorage on boot
initSafeStorage();

export default function App() {
  const [activeTab, setActiveTab] = useState(() => getTabFromUrl());

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    pushSlugState(tabKey);
  };

  // Sync state when user uses browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const currentTab = getTabFromUrl();
      setActiveTab(currentTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync initial URL path if opened directly at root or deep link
  useEffect(() => {
    pushSlugState(activeTab);
  }, []);

  // Helper to load state safely from localStorage or fallback
  const loadLocalState = (key, fallbackDefault) => {
    try {
      const parsed = safeLocalStorageGet(`samyak_erp_${key}`, null);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn(`Failed to parse localStorage key samyak_erp_${key}`, e);
    }
    return fallbackDefault;
  };

  // Shared Global State with dual-persistence (Supabase + localStorage fallback)
  const [isSupaActive, setIsSupaActive] = useState(() => isSupabaseConfigured());
  const [orders, setOrders] = useState(() => loadLocalState('orders', initialOrders));
  const [vendors, setVendors] = useState(() => loadLocalState('vendors', initialVendors));
  const [inventory, setInventory] = useState(() => loadLocalState('inventory', initialInventory));
  const [grns, setGrns] = useState(() => loadLocalState('grns', initialGRNs));
  const [users, setUsers] = useState(() => loadLocalState('users', initialUsers));
  const [jobDataSheets, setJobDataSheets] = useState(() => loadLocalState('job_datasheets', initialJobDataSheets || []));
  const [cylinders, setCylinders] = useState(() => loadLocalState('cylinders', initialCylinders));
  const [productionRecords, setProductionRecords] = useState(() => loadLocalState('production_records', initialProductionRecords));
  const [inventoryRolls, setInventoryRolls] = useState(() => loadLocalState('inventory_rolls', initialInventoryRolls));
  const [dispatchShipments, setDispatchShipments] = useState(() => loadLocalState('dispatch_shipments', initialDispatchShipments));
  const [machines, setMachines] = useState(() => loadLocalState('printing_machines', initialMachines));
  const [schedules, setSchedules] = useState(() => loadLocalState('production_schedules', initialProductionSchedules));
  const [clients, setClients] = useState(() => loadLocalState('clients', initialClients));
  const [jobMasters, setJobMasters] = useState(() => loadLocalState('job_masters', initialJobMasters));
  const [selectedJobMasterForPunch, setSelectedJobMasterForPunch] = useState(null);

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
  useEffect(() => { safeLocalStorageSet('samyak_erp_printing_machines', machines); }, [machines]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_production_schedules', schedules); }, [schedules]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_clients', clients); }, [clients]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_job_masters', jobMasters); }, [jobMasters]);

  // Asynchronously hydrate any full artwork assets from IndexedDB if needed on mount
  useEffect(() => {
    let isMounted = true;
    async function hydrateIdbAssets() {
      try {
        const idbCylinders = await idbGet('samyak_erp_cylinders');
        if (isMounted && Array.isArray(idbCylinders) && idbCylinders.length > 0) {
          setCylinders(prev => {
            // If prev contains placeholder strings, replace with full IDB values
            const hasPlaceholders = prev.some(c => typeof c.artworkUrl === 'string' && c.artworkUrl.includes('[STORED_IN_IDB]'));
            if (hasPlaceholders) {
              return idbCylinders;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('IDB hydration warning:', err);
      }
    }
    hydrateIdbAssets();
    return () => { isMounted = false; };
  }, []);

  // Helper to merge local items with Supabase items safely without wiping local additions
  const mergeDatasets = (localItems = [], remoteItems = [], keyField = 'id') => {
    if (!remoteItems || remoteItems.length === 0) return localItems;
    if (!localItems || localItems.length === 0) return remoteItems;

    const map = new Map();
    // 1. Load remote Supabase records
    remoteItems.forEach(item => {
      const key = item[keyField] || item.id || item.grnNo || item.sku;
      if (key) map.set(String(key), item);
    });

    // 2. Preserve local items if missing from remote (e.g. created locally before DB sync)
    localItems.forEach(item => {
      const key = item[keyField] || item.id || item.grnNo || item.sku;
      if (key && !map.has(String(key))) {
        map.set(String(key), item);
      }
    });

    return Array.from(map.values());
  };

  // Load live data from Supabase PostgreSQL & merge seamlessly with local state
  useEffect(() => {
    if (!isSupaActive) return;

    async function loadSupabaseData() {
      try {
        const [
          supaOrders, supaVendors, supaInv, supaGRNs, supaCyls, 
          supaProd, supaUsers, supaSheets, supaRolls, supaShipments,
          supaMachines, supaSchedules, supaClients, supaJobMasters
        ] = await Promise.all([
          fetchOrders(),
          fetchVendors(),
          fetchInventory(),
          fetchGRNs(),
          fetchCylinders(),
          fetchProductionRecords(),
          fetchUsers(),
          fetchJobDataSheets(),
          fetchInventoryRolls(),
          fetchDispatchShipments(),
          fetchPrintingMachines(),
          fetchProductionSchedules(),
          fetchClients(),
          fetchJobMasters()
        ]);

        setOrders(prev => mergeDatasets(prev, supaOrders, 'id'));
        setVendors(prev => mergeDatasets(prev, supaVendors, 'id'));
        setInventory(prev => mergeDatasets(prev, supaInv, 'id'));
        setGrns(prev => mergeDatasets(prev, supaGRNs, 'grnNo'));
        setCylinders(prev => mergeDatasets(prev, supaCyls, 'id'));
        setProductionRecords(prev => mergeDatasets(prev, supaProd, 'id'));
        setUsers(prev => mergeDatasets(prev, supaUsers, 'id'));
        setJobDataSheets(prev => mergeDatasets(prev, supaSheets, 'jobId'));
        setInventoryRolls(prev => mergeDatasets(prev, supaRolls, 'id'));
        setDispatchShipments(prev => mergeDatasets(prev, supaShipments, 'id'));
        setMachines(prev => mergeDatasets(prev, supaMachines, 'id'));
        setSchedules(prev => mergeDatasets(prev, supaSchedules, 'id'));
        setClients(prev => mergeDatasets(prev, supaClients, 'id'));
        setJobMasters(prev => mergeDatasets(prev, supaJobMasters, 'id'));
      } catch (err) {
        console.warn("[Supabase Sync Notice] Multi-table fetch notice:", err);
      }
    }

    loadSupabaseData();
  }, [isSupaActive]);

  const handleSaveMachine = (newMachine) => {
    setMachines(prev => [newMachine, ...prev.filter(m => m.id !== newMachine.id)]);
    savePrintingMachineToSupabase(newMachine);
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

  // Authentication & Active User Session State
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('samyak_erp_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('samyak_erp_user');
  });

  // Login Handler
  const handleLogin = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    try {
      localStorage.setItem('samyak_erp_user', JSON.stringify(user));
    } catch (e) {
      console.error("Failed to save auth session", e);
    }
  };

  // Logout Handler
  const handleLogout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('samyak_erp_user');
    } catch (e) {
      console.error("Failed to remove auth session", e);
    }
  };

  const isRecDue = isReconciliationDue("2026-07-24");
  const delayedOrdersCount = orders.filter(o => o.status === 'Delayed' || new Date(o.targetDeliveryDate) < new Date('2026-07-24')).length;
  const pendingQCGRNsCount = grns.filter(g => g.status === 'Pending QC').length;
  const pendingProductionApprovalCount = productionRecords.filter(r => r.status === 'Filled by Plant Manager').length;

  // Handlers for Production Records
  const handleSaveProductionRecord = (newRecord) => {
    setProductionRecords(prev => [newRecord, ...prev.filter(r => r.orderId !== newRecord.orderId)]);
    saveProductionRecordToSupabase(newRecord);
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
        return updated;
      }
      return r;
    }));
  };

  // Handlers for state updates (Preserves local state + async Supabase sync)
  const handleAddOrder = async (newOrder) => {
    setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
    try {
      await saveOrderToSupabase(newOrder);
    } catch (err) {
      console.warn("[Sync Notice] Order saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateOrder = async (updatedOrder) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    try {
      await saveOrderToSupabase(updatedOrder);
    } catch (err) {
      console.warn("[Sync Notice] Order updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    try {
      await deleteOrderFromSupabase(orderId);
    } catch (err) {
      console.warn("[Sync Notice] Order deleted locally. Supabase notice:", err);
    }
  };

  const handleAddVendor = async (newVendor) => {
    setVendors(prev => [...prev.filter(v => v.id !== newVendor.id), newVendor]);
    try {
      await saveVendorToSupabase(newVendor);
    } catch (err) {
      console.warn("[Sync Notice] Vendor saved locally. Supabase notice:", err);
    }
  };

  const handleAddGRN = async (newGRN) => {
    setGrns(prev => [newGRN, ...prev.filter(g => g.grnNo !== newGRN.grnNo)]);
    try {
      await saveGRNToSupabase(newGRN);
    } catch (err) {
      console.warn("[Sync Notice] GRN saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateGRN = async (updatedGRN) => {
    setGrns(prev => prev.map(g => g.grnNo === updatedGRN.grnNo ? updatedGRN : g));
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
        await Promise.all(newInventory.map(item => saveInventoryItemToSupabase(item)));
      } catch (err) {
        console.warn("[Sync Notice] Inventory updated locally. Supabase notice:", err);
      }
    }
  };

  const handleAddUser = async (newUser) => {
    setUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    try {
      await saveUserToSupabase(newUser);
    } catch (err) {
      console.warn("[Sync Notice] User saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateUser = async (updatedUser) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    try {
      await saveUserToSupabase(updatedUser);
    } catch (err) {
      console.warn("[Sync Notice] User updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteUser = (userId) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleAddJobDataSheet = async (newSheet) => {
    setJobDataSheets(prev => [newSheet, ...prev.filter(s => s.id !== newSheet.id)]);
    try {
      await saveJobDataSheetToSupabase(newSheet);
    } catch (err) {
      console.warn("[Sync Notice] Job Data Sheet saved locally. Supabase notice:", err);
    }
  };

  const handleDeleteJobDataSheet = async (sheetId) => {
    setJobDataSheets(prev => prev.filter(s => s.id !== sheetId));
    try {
      await deleteJobDataSheetFromSupabase(sheetId);
    } catch (err) {
      console.warn("[Sync Notice] Job Data Sheet deleted locally. Supabase notice:", err);
    }
  };

  const handleAddCylinder = async (newCyl) => {
    setCylinders(prev => [newCyl, ...prev.filter(c => c.id !== newCyl.id)]);
    try {
      await saveCylinderToSupabase(newCyl);
    } catch (err) {
      console.warn("[Sync Notice] Cylinder saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateCylinder = async (updatedCyl) => {
    setCylinders(prev => prev.map(c => c.id === updatedCyl.id ? updatedCyl : c));
    try {
      await saveCylinderToSupabase(updatedCyl);
    } catch (err) {
      console.warn("[Sync Notice] Cylinder updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteCylinder = async (cylId) => {
    setCylinders(prev => prev.filter(c => c.id !== cylId));
    try {
      await deleteCylinderFromSupabase(cylId);
    } catch (err) {
      console.warn("[Sync Notice] Cylinder deleted locally. Supabase notice:", err);
    }
  };

  const handleAddRoll = async (newRoll) => {
    setInventoryRolls(prev => [newRoll, ...prev.filter(r => r.id !== newRoll.id)]);
    try {
      await saveInventoryRollToSupabase(newRoll);
    } catch (err) {
      console.warn("[Sync Notice] Roll saved locally. Supabase notice:", err);
    }
  };

  const handleAddDispatchShipment = async (newShipment) => {
    setDispatchShipments(prev => [newShipment, ...prev.filter(s => s.id !== newShipment.id)]);
    try {
      await saveDispatchShipmentToSupabase(newShipment);
    } catch (err) {
      console.warn("[Sync Notice] Dispatch shipment saved locally. Supabase notice:", err);
    }
  };

  const handleAddClient = async (newClient) => {
    setClients(prev => [...prev.filter(c => c.id !== newClient.id), newClient]);
    try {
      await saveClientToSupabase(newClient);
    } catch (err) {
      console.warn("[Sync Notice] Client saved locally. Supabase notice:", err);
    }
  };

  const handleUpdateClient = async (updatedClient) => {
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    try {
      await saveClientToSupabase(updatedClient);
    } catch (err) {
      console.warn("[Sync Notice] Client updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteClient = async (clientId) => {
    setClients(prev => prev.filter(c => c.id !== clientId));
    try {
      await deleteClientFromSupabase(clientId);
    } catch (err) {
      console.warn("[Sync Notice] Client deleted locally. Supabase notice:", err);
    }
  };

  const handleAddJobMaster = async (newJobMaster) => {
    setJobMasters(prev => [...prev.filter(j => j.id !== newJobMaster.id), newJobMaster]);
    try {
      await saveJobMasterToSupabase(newJobMaster);
    } catch (err) {
      console.warn("[Sync Notice] Job Master saved locally. Supabase notice:", err);
    }
  };

  const handlePunchOrderFromJobMaster = (jobMaster) => {
    setSelectedJobMasterForPunch(jobMaster);
    handleTabChange('job_punching');
  };

  // Render Authentication Screen if user is not signed in
  if (!isAuthenticated || !currentUser) {
    return <AuthScreen users={users} onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <div className="sidebar glass-panel">
        <div>
          <div style={{ marginBottom: '12px' }}>
            <img src="/samyak-logo.png" alt="Samyak International Ltd" style={{ height: '40px', objectFit: 'contain' }} />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Indore Plant • GSTIN: 23AABCM3526F1ZY
          </p>
        </div>

        <div className="nav-links">
          <div 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabChange('dashboard')}
          >
            <LayoutDashboard size={18} />
            Executive Dashboard
          </div>

          <div 
            className={`nav-item ${activeTab === 'production_records' ? 'active' : ''}`}
            onClick={() => handleTabChange('production_records')}
          >
            <ClipboardList size={18} />
            Production Records
            {pendingProductionApprovalCount > 0 && (
              <span className="badge badge-warning" style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: '0.7rem' }}>
                {pendingProductionApprovalCount} Pending
              </span>
            )}
          </div>

          <div 
            className={`nav-item ${activeTab === 'job_punching' ? 'active' : ''}`}
            onClick={() => handleTabChange('job_punching')}
          >
            <Calculator size={18} />
            Job Punching & Costing
          </div>

          <div 
            className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => handleTabChange('orders')}
          >
            <ShoppingBag size={18} />
            Order Management & POs
            {delayedOrdersCount > 0 && (
              <span className="badge-delayed-tag" style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: '0.7rem' }}>
                {delayedOrdersCount}
              </span>
            )}
          </div>

          <div 
            className={`nav-item ${activeTab === 'job_datasheet' ? 'active' : ''}`}
            onClick={() => handleTabChange('job_datasheet')}
          >
            <FileSpreadsheet size={18} />
            Job Data Sheet & Profitability
          </div>

          <div 
            className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => handleTabChange('clients')}
          >
            <Briefcase size={18} />
            Clients & Directory ({clients.length})
          </div>

          <div 
            className={`nav-item ${activeTab === 'job_masters' ? 'active' : ''}`}
            onClick={() => handleTabChange('job_masters')}
          >
            <FileCode size={18} style={{ color: '#8b5cf6' }} />
            Job Master Directory ({jobMasters.length})
          </div>

          <div 
            className={`nav-item ${activeTab === 'vendors' ? 'active' : ''}`}
            onClick={() => handleTabChange('vendors')}
          >
            <Building2 size={18} />
            Vendor Onboarding ({vendors.length})
          </div>

          <div 
            className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => handleTabChange('inventory')}
          >
            <Package size={18} />
            Inventory, GRN & QC
            {pendingQCGRNsCount > 0 && (
              <span className="badge badge-warning" style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: '0.7rem' }}>
                {pendingQCGRNsCount} QC
              </span>
            )}
          </div>

          <div 
            className={`nav-item ${activeTab === 'user_management' ? 'active' : ''}`}
            onClick={() => handleTabChange('user_management')}
          >
            <Users size={18} />
            User Management (RBAC)
          </div>

          <div 
            className={`nav-item ${activeTab === 'cylinders' ? 'active' : ''}`}
            onClick={() => handleTabChange('cylinders')}
          >
            <Layers size={18} />
            Rotogravure Cylinders
          </div>

          <div 
            className={`nav-item ${activeTab === 'printing_scheduler' ? 'active' : ''}`}
            onClick={() => handleTabChange('printing_scheduler')}
          >
            <Printer size={18} style={{ color: '#3b82f6' }} />
            Printing Machine Scheduler
          </div>

          <div 
            className={`nav-item ${activeTab === 'supabase' ? 'active' : ''}`}
            onClick={() => handleTabChange('supabase')}
          >
            <Database size={18} style={{ color: '#10b981' }} />
            Supabase Connection
          </div>

          <div 
            className={`nav-item ${activeTab === 'doc_settings' ? 'active' : ''}`}
            onClick={() => handleTabChange('doc_settings')}
          >
            <SettingsIcon size={18} style={{ color: '#6366f1' }} />
            Letterhead & Signature Settings
          </div>
        </div>


        {/* System Alert Status Footer */}
        <div style={{ marginTop: 'auto', background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: isRecDue ? '#d97706' : 'var(--success)', marginBottom: '2px' }}>
            <Bell size={14} /> System Status: Normal
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Indore Plant • Role: <b>{currentUser.role}</b>
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '700' }}>
              {activeTab === 'dashboard' && 'Executive Operations Dashboard'}
              {activeTab === 'production_records' && 'Job Production Records & Approval Workflow'}
              {activeTab === 'job_punching' && 'Order Confirmation & Job Punching'}
              {activeTab === 'orders' && 'Order Management & PO Issuance'}
              {activeTab === 'job_datasheet' && 'Job Data Sheet & Pre vs Post Costing'}
              {activeTab === 'job_masters' && 'Job Master Technical Directory & Specs'}
              {activeTab === 'clients' && 'Client Onboarding & Directory'}
              {activeTab === 'vendors' && 'Vendor Onboarding & Directory'}
              {activeTab === 'inventory' && 'Raw Material Inventory, GRN & Quality Control'}
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

          {/* Top Bar Active User & Logout Controls (ADMIN ONLY ROLE SWITCHER) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {currentUser?.role === 'Admin' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <UserCheck size={16} style={{ color: 'var(--primary-brand)' }} />
                <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Active User:</span>
                <select 
                  style={{ border: 'none', background: 'transparent', fontWeight: '700', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
                  value={currentUser.id}
                  onChange={e => {
                    const user = users.find(u => u.id === e.target.value);
                    if (user) handleLogin(user);
                  }}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <UserCheck size={16} style={{ color: 'var(--primary-brand)' }} />
                <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Logged In:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{currentUser?.name} ({currentUser?.role})</strong>
              </div>
            )}

            <ErrorButton />

            <button className="btn-signout" onClick={handleLogout} title="Sign Out of Session">
              <LogOut size={16} /> Sign Out
            </button>

            {activeTab !== 'job_punching' && (
              <button className="btn-primary" onClick={() => handleTabChange('job_punching')}>
                <Calculator size={18} /> Punch New Order
              </button>
            )}
          </div>
        </div>

        {/* TAB: PRODUCTION RECORDS & APPROVAL FLOW */}
        {activeTab === 'production_records' && (
          <ProductionRecordManagement 
            productionRecords={productionRecords}
            orders={orders}
            inventory={inventory}
            currentUser={currentUser}
            onSaveProductionRecord={handleSaveProductionRecord}
            onApproveProductionRecord={handleApproveProductionRecord}
            onAddRoll={handleAddRoll}
          />
        )}

        {/* TAB: CLIENTS */}
        {activeTab === 'clients' && (
          <ClientManagement 
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
            jobMasters={jobMasters}
            cylinders={cylinders}
            productionRecords={productionRecords}
            orders={orders}
            onAddJobMaster={handleAddJobMaster}
            onAddCylinder={handleAddCylinder}
            onPunchOrderFromJobMaster={handlePunchOrderFromJobMaster}
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

            {/* Metrics Overview Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('orders')}>
                <span className="stats-title">Active Orders</span>
                <span className="stats-value">{orders.length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total Qty: {orders.reduce((a, b) => a + b.orderQtyKg, 0).toLocaleString()} kg
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
                  {inventory.reduce((a, b) => a + b.availableQtyKg, 0).toLocaleString()} <span style={{ fontSize: '1rem' }}>kg</span>
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Across {inventory.length} film grades</span>
              </div>

              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('vendors')}>
                <span className="stats-title">Onboarded Vendors</span>
                <span className="stats-value">{vendors.length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>GSTIN Verified Suppliers</span>
              </div>

              <div className="glass-card stats-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('clients')}>
                <span className="stats-title">Client Directory</span>
                <span className="stats-value">{clients.length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Registered Buyers</span>
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
                      {orders.map(o => {
                        const isOverdue = o.status === 'Delayed' || new Date(o.targetDeliveryDate) < new Date('2026-07-24');
                        return (
                          <tr key={o.id} className={isOverdue ? 'row-delayed-highlight' : ''}>
                            <td style={{ fontWeight: '700', color: isOverdue ? '#dc2626' : 'var(--primary-brand)' }}>{o.id}</td>
                            <td style={{ fontWeight: '600' }}>{o.jobName}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{o.structure}</td>
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
                    {inventory.filter(i => (i.availableQtyKg || 0) <= (i.reorderLevelKg || 500)).length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: '#059669', padding: '10px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        ✓ All raw material items are above reorder threshold.
                      </div>
                    ) : (
                      inventory.filter(i => (i.availableQtyKg || 0) <= (i.reorderLevelKg || 500)).map(i => {
                        const displayName = i.itemName || `${i.filmType || 'Film'} ${i.micron || ''}µ`;
                        return (
                          <div key={i.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#991b1b' }}>
                                {displayName}
                              </span>
                              <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#dc2626', color: '#ffffff', padding: '2px 6px', borderRadius: '4px' }}>
                                {i.micron || 12} µ (Micron)
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: '2px' }}>
                              <span style={{ color: '#475569' }}>
                                Grade: <strong>{i.filmType || 'PET'}</strong> {i.widthMm ? `| ${i.widthMm}mm Width` : ''}
                              </span>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ color: '#b91c1c', fontWeight: '800' }}>
                                  Avail: {i.availableQtyKg?.toLocaleString() || 0} kg
                                </span>
                                {i.allocatedQtyKg > 0 && (
                                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                    (Alloc: {i.allocatedQtyKg} kg)
                                  </span>
                                )}
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                  [Min: {i.reorderLevelKg || 500} kg]
                                </span>
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

        {/* TAB 0.5: JOB PUNCHING & COSTING ENGINE */}
        {activeTab === 'job_punching' && (
          <JobPunchingForm 
            onSaveOrder={handleAddOrder}
            onNavigateToDashboard={() => handleTabChange('orders')}
            initialJobMasterData={selectedJobMasterForPunch}
          />
        )}

        {/* TAB 3: ORDER MANAGEMENT & POS */}
        {activeTab === 'orders' && (
          <OrderManagement 
            orders={orders} 
            vendors={vendors} 
            currentUser={currentUser}
            productionRecords={productionRecords}
            onUpdateOrder={handleUpdateOrder} 
            onDeleteOrder={handleDeleteOrder}
            onNavigateToPunching={() => handleTabChange('job_punching')}
            onNavigateToProductionRecords={() => handleTabChange('production_records')}
          />
        )}


        {/* TAB 4: JOB DATA SHEET & PRE VS POST PROFITABILITY */}
        {activeTab === 'job_datasheet' && (
          <JobDataSheet 
            orders={orders}
            jobDataSheets={jobDataSheets}
            currentUser={currentUser}
            onSaveJobDataSheet={handleAddJobDataSheet}
            onDeleteJobDataSheet={handleDeleteJobDataSheet}
          />
        )}


        {/* TAB 5: VENDOR MANAGEMENT */}
        {activeTab === 'vendors' && (
          <VendorManagement vendors={vendors} orders={orders} onAddVendor={handleAddVendor} />
        )}

        {/* TAB 6: INVENTORY, GRN & QC */}
        {activeTab === 'inventory' && (
          <InventoryManagement 
            inventory={inventory}
            grns={grns}
            vendors={vendors}
            orders={orders}
            onAddGRN={handleAddGRN}
            onUpdateGRN={handleUpdateGRN}
            onUpdateInventory={handleUpdateInventory}
            onAddVendor={handleAddVendor}
            inventoryRolls={inventoryRolls}
            dispatchShipments={dispatchShipments}
            onAddRoll={handleAddRoll}
            onAddDispatchShipment={handleAddDispatchShipment}
          />
        )}

        {/* TAB 7: USER MANAGEMENT (RBAC) */}
        {activeTab === 'user_management' && (
          <UserManagement 
            users={users}
            currentUser={currentUser}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

        {/* TAB 8: CYLINDER DATABASE & UTILISATION */}
        {activeTab === 'cylinders' && (
          <CylinderManagement 
            cylinders={cylinders}
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
          <DocumentSettings />
        )}
      </div>
    </div>
  );

}
