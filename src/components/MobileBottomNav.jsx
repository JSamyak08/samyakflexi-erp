import React from 'react';
import { LayoutDashboard, Package, ScanLine, Truck, Menu } from 'lucide-react';

export default function MobileBottomNav({
  activeTab,
  onTabChange,
  onOpenScanner,
  onOpenMenu,
  isTabAllowed
}) {
  const isDashboardAllowed = isTabAllowed ? isTabAllowed('dashboard') : true;
  const isInventoryAllowed = isTabAllowed ? isTabAllowed('inventory') : true;
  const isDispatchAllowed = isTabAllowed ? isTabAllowed('dispatch') : true;

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
      {/* 1. Dashboard */}
      {isDashboardAllowed && (
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
          aria-label="Dashboard"
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </button>
      )}

      {/* 2. Inventory / Inward GRN */}
      {isInventoryAllowed && (
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => onTabChange('inventory')}
          aria-label="Inventory"
        >
          <Package size={20} />
          <span>Inventory</span>
        </button>
      )}

      {/* 3. Center Elevated Scan Button */}
      <div className="mobile-nav-scan-wrapper">
        <button
          type="button"
          className="mobile-nav-scan-btn"
          onClick={onOpenScanner}
          aria-label="Quick Barcode Scanner"
          title="Scan Barcode with Camera"
        >
          <ScanLine size={24} />
          <span className="mobile-scan-label">Scan</span>
        </button>
      </div>

      {/* 4. Dispatch & Packing */}
      {isDispatchAllowed && (
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'dispatch' ? 'active' : ''}`}
          onClick={() => onTabChange('dispatch')}
          aria-label="Dispatch"
        >
          <Truck size={20} />
          <span>Dispatch</span>
        </button>
      )}

      {/* 5. Menu Drawer Toggle */}
      <button
        type="button"
        className="mobile-nav-item"
        onClick={onOpenMenu}
        aria-label="Open Full Navigation Menu"
      >
        <Menu size={20} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
