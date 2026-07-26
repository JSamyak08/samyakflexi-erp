import React, { useState, useEffect } from 'react';
import { 
  initialOrders, 
  initialVendors, 
  initialInventory, 
  initialGRNs,
  initialUsers,
  initialJobDataSheets,
  initialProductionRecords,
  isReconciliationDue 
} from './factoryStore';
import { initialCylinders } from './dataStore';
import { 
  LayoutDashboard, 
  Calculator, 
  ShoppingBag, 
  Building2, 
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
import SupabaseManagement from './components/SupabaseManagement';
import DocumentSettings from './components/DocumentSettings';
import { getTabFromUrl, pushSlugState } from './utils/slugRouter';
import { isSupabaseConfigured } from './services/supabaseClient';
import { 
  fetchOrders, saveOrderToSupabase, deleteOrderFromSupabase,
  fetchVendors, saveVendorToSupabase, deleteVendorFromSupabase,
  fetchInventory, saveInventoryItemToSupabase, deleteInventoryItemFromSupabase,
  fetchGRNs, saveGRNToSupabase,
  fetchCylinders, saveCylinderToSupabase,
  fetchProductionRecords, saveProductionRecordToSupabase,
  fetchUsers, saveUserToSupabase,
  fetchJobDataSheets, saveJobDataSheetToSupabase, deleteJobDataSheetFromSupabase
} from './services/supabaseDataService';
import './index.css';

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

  // Shared Global State (Only load local defaults if Supabase is unconfigured)
  const isSupaActive = isSupabaseConfigured();
  const [orders, setOrders] = useState(isSupaActive ? [] : initialOrders);
  const [vendors, setVendors] = useState(isSupaActive ? [] : initialVendors);
  const [inventory, setInventory] = useState(isSupaActive ? [] : initialInventory);
  const [grns, setGrns] = useState(isSupaActive ? [] : initialGRNs);
  const [users, setUsers] = useState(initialUsers);
  const [jobDataSheets, setJobDataSheets] = useState(isSupaActive ? [] : initialJobDataSheets);
  const [cylinders, setCylinders] = useState(isSupaActive ? [] : initialCylinders);
  const [productionRecords, setProductionRecords] = useState(isSupaActive ? [] : initialProductionRecords);

  // Load live data exclusively from Supabase PostgreSQL if configured
  useEffect(() => {
    if (!isSupaActive) return;

    async function loadSupabaseData() {
      try {
        const [supaOrders, supaVendors, supaInv, supaGRNs, supaCyls, supaProd, supaUsers, supaSheets] = await Promise.all([
          fetchOrders(),
          fetchVendors(),
          fetchInventory(),
          fetchGRNs(),
          fetchCylinders(),
          fetchProductionRecords(),
          fetchUsers(),
          fetchJobDataSheets()
        ]);

        setOrders(supaOrders || []);
        setVendors(supaVendors || []);
        setInventory(supaInv || []);
        setGrns(supaGRNs || []);
        setCylinders(supaCyls || []);
        setProductionRecords(supaProd || []);
        setJobDataSheets(supaSheets || []);
        if (supaUsers && supaUsers.length > 0) setUsers(supaUsers);
      } catch (err) {
        console.error("Failed to load data from Supabase:", err);
      }
    }

    loadSupabaseData();
  }, [isSupaActive]);



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

  // Handlers for state updates
  const handleAddOrder = (newOrder) => {
    setOrders(prev => [newOrder, ...prev]);
    saveOrderToSupabase(newOrder);
  };

  const handleUpdateOrder = (updatedOrder) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    saveOrderToSupabase(updatedOrder);
  };

  const handleDeleteOrder = (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    deleteOrderFromSupabase(orderId);
  };

  const handleAddVendor = (newVendor) => {
    setVendors(prev => [...prev, newVendor]);
    saveVendorToSupabase(newVendor);
  };

  const handleAddGRN = (newGRN) => {
    setGrns(prev => [newGRN, ...prev]);
    saveGRNToSupabase(newGRN);
  };

  const handleUpdateGRN = (updatedGRN) => {
    setGrns(prev => prev.map(g => g.grnNo === updatedGRN.grnNo ? updatedGRN : g));
    saveGRNToSupabase(updatedGRN);
  };

  const handleUpdateInventory = (newInventory) => {
    setInventory(newInventory);
    if (Array.isArray(newInventory)) {
      newInventory.forEach(item => saveInventoryItemToSupabase(item));
    }
  };

  const handleAddUser = (newUser) => {
    setUsers(prev => [...prev, newUser]);
    saveUserToSupabase(newUser);
  };

  const handleUpdateUser = (updatedUser) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    saveUserToSupabase(updatedUser);
  };

  const handleDeleteUser = (userId) => {

    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleAddJobDataSheet = (newSheet) => {
    setJobDataSheets(prev => [newSheet, ...prev.filter(s => s.id !== newSheet.id)]);
    saveJobDataSheetToSupabase(newSheet);
  };

  const handleDeleteJobDataSheet = (sheetId) => {
    setJobDataSheets(prev => prev.filter(s => s.id !== sheetId));
    deleteJobDataSheetFromSupabase(sheetId);
  };


  const handleAddCylinder = (newCyl) => {
    setCylinders(prev => [newCyl, ...prev]);
  };

  const handleUpdateCylinder = (updatedCyl) => {
    setCylinders(prev => prev.map(c => c.id === updatedCyl.id ? updatedCyl : c));
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
              {activeTab === 'vendors' && 'Vendor Onboarding & Directory'}
              {activeTab === 'inventory' && 'Raw Material Inventory, GRN & Quality Control'}
              {activeTab === 'user_management' && 'Departmental User Management (RBAC)'}
              {activeTab === 'cylinders' && 'Rotogravure Cylinder Database'}
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
                  </div>
                </div>

                {/* Stock Level Quick Summary */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '12px' }}>📦 Low Stock Warning</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {inventory.filter(i => i.availableQtyKg <= i.reorderLevelKg).map(i => (
                      <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '8px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{i.filmType} ({i.micron}µ)</span>
                        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{i.availableQtyKg} kg left</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: JOB PUNCHING & COSTING */}
        {activeTab === 'job_punching' && (
          <JobPunchingForm 
            onSaveOrder={handleAddOrder} 
            onNavigateToDashboard={() => handleTabChange('dashboard')} 
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
          <VendorManagement vendors={vendors} onAddVendor={handleAddVendor} />
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

        {/* TAB 8: ROTOGRAVURE CYLINDERS */}
        {activeTab === 'cylinders' && (
          <CylinderManagement 
            cylinders={cylinders}
            onAddCylinder={handleAddCylinder}
            onUpdateCylinder={handleUpdateCylinder}
          />
        )}

        {/* TAB 9: SUPABASE DATABASE INTEGRATION */}
        {activeTab === 'supabase' && (
          <SupabaseManagement />
        )}
      </div>
    </div>
  );

}
