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
  DEFAULT_ROLE_PERMISSIONS
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
import ConsumablesAndIndents from './components/ConsumablesAndIndents';
import SalesManagement from './components/SalesManagement';
import { getTabFromUrl, pushSlugState } from './utils/slugRouter';
import { isSupabaseConfigured } from './services/supabaseClient';
import { 
  fetchOrders, saveOrderToSupabase, deleteOrderFromSupabase,
  fetchVendors, saveVendorToSupabase, deleteVendorFromSupabase,
  fetchInventory, saveInventoryItemToSupabase, saveInventoryBatchToSupabase, deleteInventoryItemFromSupabase,
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
  fetchJobMasters, saveJobMasterToSupabase, deleteJobMasterFromSupabase,
  fetchRolePermissionsFromSupabase, saveRolePermissionsToSupabase
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

  // Shared Global State with dual-persistence (Supabase Authoritative + localStorage fallback)
  const isSupaConfigured = isSupabaseConfigured();
  const [isSupaActive, setIsSupaActive] = useState(isSupaConfigured);

  // Authentication & Active User Session State
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(!isSupaConfigured);

  // Hydrate initial state safely from localStorage (if present), or empty array default.
  const [orders, setOrders] = useState(() => loadLocalState('orders', []));
  const [vendors, setVendors] = useState(() => loadLocalState('vendors', []));
  const [inventory, setInventory] = useState(() => loadLocalState('inventory', []));
  const [grns, setGrns] = useState(() => loadLocalState('grns', []));
  const [users, setUsers] = useState(() => loadLocalState('users', initialUsers));
  const [jobDataSheets, setJobDataSheets] = useState(() => loadLocalState('job_datasheets', []));
  const [cylinders, setCylinders] = useState(() => loadLocalState('cylinders', []));
  const [productionRecords, setProductionRecords] = useState(() => loadLocalState('production_records', []));
  const [inventoryRolls, setInventoryRolls] = useState(() => loadLocalState('inventory_rolls', []));
  const [dispatchShipments, setDispatchShipments] = useState(() => loadLocalState('dispatch_shipments', []));
  const [machines, setMachines] = useState(() => loadLocalState('printing_machines', []));
  const [schedules, setSchedules] = useState(() => loadLocalState('production_schedules', []));
  const [clients, setClients] = useState(() => loadLocalState('clients', []));
  const [jobMasters, setJobMasters] = useState(() => loadLocalState('job_masters', []));
  const [selectedJobMasterForPunch, setSelectedJobMasterForPunch] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(() => loadLocalState('role_permissions', DEFAULT_ROLE_PERMISSIONS));

  const activeUsersList = useMemo(() => {
    const list = [...(users || []), ...initialUsers];
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
    if (tabKey === 'user_management') return false; // Strictly restricted to Admin role by default
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
  useEffect(() => { safeLocalStorageSet('samyak_erp_printing_machines', machines); }, [machines]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_production_schedules', schedules); }, [schedules]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_clients', clients); }, [clients]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_job_masters', jobMasters); }, [jobMasters]);
  useEffect(() => { safeLocalStorageSet('samyak_erp_role_permissions', rolePermissions); }, [rolePermissions]);

  // Asynchronously hydrate any full artwork assets from IndexedDB if needed on mount
  useEffect(() => {
    let isMounted = true;
    async function hydrateIdbAssets() {
      try {
        const storedOrders = await idbGet('samyak_erp_orders');
        if (isMounted && storedOrders && Array.isArray(storedOrders) && storedOrders.length > 0) {
          setOrders(storedOrders);
        }
      } catch (err) {
        console.warn('Idb hydration error:', err);
      }
    }
    hydrateIdbAssets();
    return () => { isMounted = false; };
  }, []);

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
        supaRolePerms
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
        fetchSafe(fetchRolePermissionsFromSupabase, 'Role Permissions')
      ]);

      if (!isMounted) return;

      if (Array.isArray(supaOrders) && supaOrders.length > 0) setOrders(supaOrders);
      if (Array.isArray(supaVendors) && supaVendors.length > 0) setVendors(supaVendors);
      if (Array.isArray(supaInv) && supaInv.length > 0) setInventory(supaInv);
      if (Array.isArray(supaGRNs) && supaGRNs.length > 0) setGrns(supaGRNs);
      if (Array.isArray(supaCyls) && supaCyls.length > 0) setCylinders(supaCyls);
      if (Array.isArray(supaProd) && supaProd.length > 0) setProductionRecords(supaProd);
      if (Array.isArray(supaUsers) && supaUsers.length > 0) setUsers(supaUsers);
      if (Array.isArray(supaSheets) && supaSheets.length > 0) setJobDataSheets(supaSheets);
      if (Array.isArray(supaRolls) && supaRolls.length > 0) setInventoryRolls(supaRolls);
      if (Array.isArray(supaShipments) && supaShipments.length > 0) setDispatchShipments(supaShipments);
      if (Array.isArray(supaMachines) && supaMachines.length > 0) setMachines(supaMachines);
      if (Array.isArray(supaSchedules) && supaSchedules.length > 0) setSchedules(supaSchedules);
      if (Array.isArray(supaClients) && supaClients.length > 0) setClients(supaClients);
      if (Array.isArray(supaJobMasters) && supaJobMasters.length > 0) setJobMasters(supaJobMasters);
      if (supaRolePerms && typeof supaRolePerms === 'object') setRolePermissions(supaRolePerms);
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
              const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';
              const filmTypeVal = newRow.film_type || (isFilm && newRow.item_name ? newRow.item_name.split(' ')[0] : '');
              const mapped = {
                id: String(newRow.id),
                itemCode: newRow.item_code || String(newRow.id),
                itemName: newRow.item_name || 'Stock Item',
                category: category,
                filmType: filmTypeVal || (isFilm ? 'PET' : ''),
                micron: (newRow.micron !== null && newRow.micron !== undefined && !isNaN(Number(newRow.micron))) ? Number(newRow.micron) : (isFilm ? 12 : '-'),
                widthMm: (newRow.width_mm !== null && newRow.width_mm !== undefined && !isNaN(Number(newRow.width_mm))) ? Number(newRow.width_mm) : (isFilm ? 1000 : '-'),
                availableQtyKg: Number(newRow.stock_qty_kg ?? newRow.available_qty_kg ?? 0) || 0,
                allocatedQtyKg: Number(newRow.allocated_qty_kg ?? 0) || 0,
                reorderLevelKg: Number(newRow.reorder_level_kg ?? 0) || 0,
                unitPrice: Number(newRow.unit_price ?? 0) || 0,
                unit: newRow.unit || (isFilm ? 'Kg' : (category === 'Printing Inks' || category === 'Solvents' || category === 'Lamination Adhesives' ? 'Kg' : 'Pcs')),
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
                const isFilm = category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';
                const filmTypeVal = updatedRow.film_type || (isFilm && updatedRow.item_name ? updatedRow.item_name.split(' ')[0] : (i.filmType || ''));
                return {
                  ...i,
                  id: String(updatedRow.id),
                  itemCode: updatedRow.item_code || i.itemCode || String(updatedRow.id),
                  itemName: updatedRow.item_name || i.itemName,
                  category: category,
                  filmType: filmTypeVal,
                  micron: (updatedRow.micron !== null && updatedRow.micron !== undefined && !isNaN(Number(updatedRow.micron))) ? Number(updatedRow.micron) : (isFilm ? 12 : '-'),
                  widthMm: (updatedRow.width_mm !== null && updatedRow.width_mm !== undefined && !isNaN(Number(updatedRow.width_mm))) ? Number(updatedRow.width_mm) : (isFilm ? 1000 : '-'),
                  availableQtyKg: Number(updatedRow.stock_qty_kg ?? updatedRow.available_qty_kg ?? 0) || 0,
                  allocatedQtyKg: Number(updatedRow.allocated_qty_kg ?? 0) || 0,
                  reorderLevelKg: Number(updatedRow.reorder_level_kg ?? 0) || 0,
                  unitPrice: Number(updatedRow.unit_price ?? 0) || 0,
                  unit: updatedRow.unit || i.unit || 'Kg',
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



  // Initialize Supabase Auth state
  useEffect(() => {
    if (!isSupaActive) return;

    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          if (session?.user) {
            const user = {
              id: session.user.id,
              name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
              email: session.user.email,
              role: session.user.user_metadata?.role || 'Admin',
              department: 'Executive Management',
              status: 'Active'
            };
            setCurrentUser(user);
            setIsAuthenticated(true);
          } else {
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
        const user = {
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
          email: session.user.email,
          role: session.user.user_metadata?.role || 'Admin',
          department: 'Executive Management',
          status: 'Active'
        };
        setCurrentUser(user);
        setIsAuthenticated(true);
      } else {
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
    if (!isSupaActive) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  };

  // Logout Handler (for UI updates, authService handles Supabase logout)
  const handleLogout = () => {
    if (!isSupaActive) {
      setCurrentUser(null);
      setIsAuthenticated(false);
    } else {
      // With Supabase, we call the sign out method
      supabase.auth.signOut().catch(console.warn);
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
    try {
      await saveInventoryItemToSupabase(item);
    } catch (err) {
      console.warn("[Sync Notice] Inventory item saved. Supabase notice:", err);
    }
  };

  const handleDeleteInventoryItem = async (itemId) => {
    if (!itemId) return;
    setInventory(prev => prev.filter(i => String(i.id) !== String(itemId)));
    try {
      await deleteInventoryItemFromSupabase(itemId);
    } catch (err) {
      console.warn("[Sync Notice] Inventory item deleted. Supabase notice:", err);
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

  const handleUpdateJobMaster = async (updatedJobMaster) => {
    setJobMasters(prev => prev.map(j => j.id === updatedJobMaster.id ? updatedJobMaster : j));
    try {
      await saveJobMasterToSupabase(updatedJobMaster);
    } catch (err) {
      console.warn("[Sync Notice] Job Master updated locally. Supabase notice:", err);
    }
  };

  const handleDeleteJobMaster = async (jobMasterId) => {
    setJobMasters(prev => prev.filter(j => j.id !== jobMasterId));
    try {
      await deleteJobMasterFromSupabase(jobMasterId);
    } catch (err) {
      console.warn("[Sync Notice] Job Master deleted locally. Supabase notice:", err);
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
          {isTabAllowed('dashboard') && (
            <div 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleTabChange('dashboard')}
            >
              <LayoutDashboard size={18} />
              Executive Dashboard
            </div>
          )}

          {isTabAllowed('production_records') && (
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
          )}

          {isTabAllowed('sales') && (
            <div 
              className={`nav-item ${activeTab === 'sales' ? 'active' : ''}`}
              onClick={() => handleTabChange('sales')}
            >
              <ShoppingBag size={18} />
              Sales & Quotations Engine
            </div>
          )}

          {isTabAllowed('job_punching') && (
            <div 
              className={`nav-item ${activeTab === 'job_punching' ? 'active' : ''}`}
              onClick={() => handleTabChange('job_punching')}
            >
              <Calculator size={18} />
              Job Punching & Costing
            </div>
          )}

          {isTabAllowed('orders') && (
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
          )}

          {isTabAllowed('clients') && (
            <div 
              className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`}
              onClick={() => handleTabChange('clients')}
            >
              <Briefcase size={18} />
              Clients & Directory ({clients.length})
            </div>
          )}

          {isTabAllowed('job_masters') && (
            <div 
              className={`nav-item ${activeTab === 'job_masters' ? 'active' : ''}`}
              onClick={() => handleTabChange('job_masters')}
            >
              <FileCode size={18} style={{ color: '#8b5cf6' }} />
              Job Master Directory ({jobMasters.length})
            </div>
          )}

          {isTabAllowed('vendors') && (
            <div 
              className={`nav-item ${activeTab === 'vendors' ? 'active' : ''}`}
              onClick={() => handleTabChange('vendors')}
            >
              <Building2 size={18} />
              Vendor Onboarding ({vendors.length})
            </div>
          )}

          {isTabAllowed('inventory') && (
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
          )}

          {isTabAllowed('material_indents') && (
            <div 
              className={`nav-item ${activeTab === 'material_indents' ? 'active' : ''}`}
              onClick={() => handleTabChange('material_indents')}
            >
              <ClipboardList size={18} />
              Material Indents & Store
            </div>
          )}

          {isTabAllowed('user_management') && (
            <div 
              className={`nav-item ${activeTab === 'user_management' ? 'active' : ''}`}
              onClick={() => handleTabChange('user_management')}
            >
              <Users size={18} />
              User Management (RBAC)
            </div>
          )}

          {isTabAllowed('cylinders') && (
            <div 
              className={`nav-item ${activeTab === 'cylinders' ? 'active' : ''}`}
              onClick={() => handleTabChange('cylinders')}
            >
              <Layers size={18} />
              Rotogravure Cylinders
            </div>
          )}

          {isTabAllowed('printing_scheduler') && (
            <div 
              className={`nav-item ${activeTab === 'printing_scheduler' ? 'active' : ''}`}
              onClick={() => handleTabChange('printing_scheduler')}
            >
              <Printer size={18} style={{ color: '#3b82f6' }} />
              Printing Machine Scheduler
            </div>
          )}

          {isTabAllowed('supabase') && (
            <div 
              className={`nav-item ${activeTab === 'supabase' ? 'active' : ''}`}
              onClick={() => handleTabChange('supabase')}
            >
              <Database size={18} style={{ color: '#10b981' }} />
              Supabase Connection
            </div>
          )}

          {isTabAllowed('doc_settings') && (
            <div 
              className={`nav-item ${activeTab === 'doc_settings' ? 'active' : ''}`}
              onClick={() => handleTabChange('doc_settings')}
            >
              <SettingsIcon size={18} style={{ color: '#6366f1' }} />
              Letterhead & Signature Settings
            </div>
          )}
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
              {activeTab === 'sales' && 'Sales Management & Professional Quotation Engine'}
              {activeTab === 'production_records' && 'Job Production Records & Approval Workflow'}
              {activeTab === 'job_punching' && 'Order Confirmation & Job Punching'}
              {activeTab === 'orders' && 'Order Management & PO Issuance'}
              {activeTab === 'job_masters' && 'Job Master Technical Directory & Specs'}
              {activeTab === 'clients' && 'Client Onboarding & Directory'}
              {activeTab === 'vendors' && 'Vendor Onboarding & Directory'}
              {activeTab === 'inventory' && 'Raw Material Inventory, GRN & Quality Control'}
              {activeTab === 'material_indents' && 'Material Indents Requisitions & Consumable Store'}
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
                style={{ border: 'none', background: 'transparent', fontWeight: '700', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
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

            {activeTab !== 'job_punching' && (
              <button className="btn-primary" onClick={() => handleTabChange('job_punching')}>
                <Calculator size={18} /> Punch New Order
              </button>
            )}
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
            productionRecords={productionRecords}
            orders={orders}
            inventory={inventory}
            jobMasters={jobMasters}
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
                        // Derive substrate structure from the matching Job Master's layers, fallback to order.structure
                        const matchedJM = jobMasters.find(j =>
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
                    {inventory.filter(i => {
                      // Only show items that have an explicit reorder level set AND are below it
                      const avail = i.availableQtyKg || 0;
                      const reorder = i.reorderLevelKg;
                      return reorder != null && reorder > 0 && avail <= reorder;
                    }).length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: '#059669', padding: '10px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        ✓ All raw material items are above reorder threshold.
                      </div>
                    ) : (
                      inventory.filter(i => {
                        const avail = i.availableQtyKg || 0;
                        const reorder = i.reorderLevelKg;
                        return reorder != null && reorder > 0 && avail <= reorder;
                      }).map(i => {
                        // Build display name from actual data only
                        const micronStr = i.micron ? `${i.micron}µ` : '';
                        const displayName = i.itemName ||
                          (i.filmType ? [i.filmType, micronStr].filter(Boolean).join(' ') : '');
                        return (
                          <div key={i.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#991b1b' }}>
                                {displayName}
                              </span>
                              {/* Only show micron badge when an actual micron value exists */}
                              {i.micron ? (
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#dc2626', color: '#ffffff', padding: '2px 6px', borderRadius: '4px' }}>
                                  {i.micron} µ
                                </span>
                              ) : null}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: '2px' }}>
                              <span style={{ color: '#475569' }}>
                                {i.filmType ? (
                                  <>Grade: <strong>{i.filmType}</strong>{i.widthMm ? ` | ${i.widthMm}mm Width` : ''}</>
                                ) : (
                                  i.grade ? <>Grade: <strong>{i.grade}</strong></> : null
                                )}
                              </span>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ color: '#b91c1c', fontWeight: '800' }}>
                                  Avail: {(i.availableQtyKg ?? 0).toLocaleString()} kg
                                </span>
                                {i.allocatedQtyKg > 0 && (
                                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                    (Alloc: {i.allocatedQtyKg} kg)
                                  </span>
                                )}
                                {/* Only show Min when a real reorder level exists */}
                                {i.reorderLevelKg != null && i.reorderLevelKg > 0 && (
                                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    [Min: {i.reorderLevelKg} kg]
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

        {/* TAB 0.5: JOB PUNCHING & COSTING ENGINE */}
        {activeTab === 'job_punching' && (
          <JobPunchingForm 
            onSaveOrder={handleAddOrder}
            onNavigateToDashboard={() => handleTabChange('orders')}
            initialJobMasterData={selectedJobMasterForPunch}
            clients={clients}
            jobMasters={jobMasters}
          />
        )}

        {/* TAB 3: ORDER MANAGEMENT & POS */}
        {activeTab === 'orders' && (
          <OrderManagement 
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
          <VendorManagement vendors={vendors} orders={orders} onAddVendor={handleAddVendor} />
        )}

        {/* TAB 6: INVENTORY, GRN & QC */}
        {activeTab === 'inventory' && (
          <InventoryManagement 
            inventory={inventory}
            grns={grns}
            vendors={vendors}
            orders={orders}
            productionRecords={productionRecords}
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
            userRole={currentUser?.role || "Admin"}
            userName={currentUser?.name || "Samyak Jain"}
            vendors={vendors}
            orders={orders}
            machines={machines}
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
      </div>
    </div>
  );

}
