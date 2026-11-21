import React from 'react';
import { LayoutDashboard, Package, ScanLine, Truck, Menu, ShoppingBag, ClipboardList } from 'lucide-react';

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
  const isOrdersAllowed = isTabAllowed ? isTabAllowed('orders') : false;
  const isSalesAllowed = isTabAllowed ? isTabAllowed('sales') : false;

  // Secondary slot fallback if user doesn't have inventory permissions
  const showSecondSlot = isInventoryAllowed || isOrdersAllowed;
  const secondSlotTab = isInventoryAllowed ? 'inventory' : 'orders';
  const secondSlotIcon = isInventoryAllowed ? Package : ClipboardList;
  const secondSlotLabel = isInventoryAllowed ? 'Inventory' : 'Orders';

  // Fourth slot fallback if user doesn't have dispatch permissions
  const showFourthSlot = isDispatchAllowed || isSalesAllowed;
  const fourthSlotTab = isDispatchAllowed ? 'dispatch' : 'sales';
  const fourthSlotIcon = isDispatchAllowed ? Truck : ShoppingBag;
  const fourthSlotLabel = isDispatchAllowed ? 'Dispatch' : 'Sales';

  const SecondIcon = secondSlotIcon;
  const FourthIcon = fourthSlotIcon;

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation Dock">
      {/* 1. Dashboard */}
      {isDashboardAllowed && (
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
          aria-label="Executive Dashboard"
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
        >
          <div className="mobile-nav-icon-wrap">
            <LayoutDashboard size={20} />
            {activeTab === 'dashboard' && <span className="mobile-nav-active-pip" />}
          </div>
          <span>Dashboard</span>
        </button>
      )}

      {/* 2. Inventory / Orders */}
      {showSecondSlot && (
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === secondSlotTab ? 'active' : ''}`}
          onClick={() => onTabChange(secondSlotTab)}
          aria-label={secondSlotLabel}
          aria-current={activeTab === secondSlotTab ? 'page' : undefined}
        >
          <div className="mobile-nav-icon-wrap">
            <SecondIcon size={20} />
            {activeTab === secondSlotTab && <span className="mobile-nav-active-pip" />}
          </div>
          <span>{secondSlotLabel}</span>
        </button>
      )}

      {/* 3. Center Elevated Quick Scan FAB */}
      <div className="mobile-nav-scan-wrapper">
        <button
          type="button"
          className="mobile-nav-scan-btn"
          onClick={onOpenScanner}
          aria-label="Quick Barcode & QR Scanner"
          title="Instant Camera / USB Barcode Scanner"
        >
          <div className="mobile-nav-scan-glow"></div>
          <ScanLine size={24} className="mobile-scan-icon" />
          <span className="mobile-scan-label">SCAN</span>
        </button>
      </div>

      {/* 4. Dispatch / Sales */}
      {showFourthSlot && (
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === fourthSlotTab ? 'active' : ''}`}
          onClick={() => onTabChange(fourthSlotTab)}
          aria-label={fourthSlotLabel}
          aria-current={activeTab === fourthSlotTab ? 'page' : undefined}
        >
          <div className="mobile-nav-icon-wrap">
            <FourthIcon size={20} />
            {activeTab === fourthSlotTab && <span className="mobile-nav-active-pip" />}
          </div>
          <span>{fourthSlotLabel}</span>
        </button>
      )}

      {/* 5. Menu Drawer Toggle */}
      <button
        type="button"
        className="mobile-nav-item"
        onClick={onOpenMenu}
        aria-label="Open Navigation Menu"
      >
        <div className="mobile-nav-icon-wrap">
          <Menu size={20} />
        </div>
        <span>Menu</span>
      </button>
    </nav>
  );
}
