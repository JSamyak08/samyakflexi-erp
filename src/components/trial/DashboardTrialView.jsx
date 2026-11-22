import React, { useMemo } from 'react';
import {
  ShoppingBag,
  AlertTriangle,
  Package,
  Droplets,
  DollarSign,
  Truck,
  Users,
  Percent,
  Sparkles,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import KpiCard from './tremor/KpiCard.jsx';
import AreaChart from './tremor/AreaChart.jsx';
import BarChart from './tremor/BarChart.jsx';
import DonutChart from './tremor/DonutChart.jsx';
import { userHasRole } from '../../assignedRoles.js';

export default function DashboardTrialView({
  orders = [],
  delayedOrders = [],
  delayedOrdersCount = 0,
  inventory = [],
  inks = [],
  avgSolidEqInkCost = 0,
  vendors = [],
  clients = [],
  scrapMetrics = {},
  currentUser,
  onNavigateTab,
  onToggleClassic
}) {
  // 1. Aggregations for KPI cards (matching exact existing dashboard math)
  const activeOrdersCount = (orders || []).length;
  const totalOrderQtyKg = useMemo(() => {
    return (orders || []).reduce((sum, o) => sum + (Number(o?.orderQtyKg) || 0), 0);
  }, [orders]);

  const totalFilmStockKg = useMemo(() => {
    return (inventory || []).reduce((sum, item) => sum + (parseFloat(item?.availableQtyKg) || 0), 0);
  }, [inventory]);

  const totalStockValuation = useMemo(() => {
    return (inventory || []).reduce((sum, item) => {
      const qty = parseFloat(item?.availableQtyKg) || 0;
      const rate = parseFloat(item?.unitPrice || item?.purchaseRatePerKg) || 0;
      return sum + (qty * rate);
    }, 0);
  }, [inventory]);

  const canSeeValuation = useMemo(() => {
    return userHasRole(currentUser, 'Admin') || userHasRole(currentUser, 'Plant Manager');
  }, [currentUser]);

  // 2. Data for Charts: Order Delivery Trend (Area Chart)
  const orderTrendData = useMemo(() => {
    const buckets = {};
    (orders || []).forEach((o) => {
      const dateStr = o?.targetDeliveryDate || o?.orderDate || '';
      // Group by YYYY-MM or fallback
      let label = 'Current';
      if (dateStr && dateStr.length >= 7) {
        label = dateStr.slice(0, 7); // e.g. "2026-11"
      }
      if (!buckets[label]) {
        buckets[label] = { month: label, 'Order Qty (Kg)': 0, 'Orders Count': 0 };
      }
      buckets[label]['Order Qty (Kg)'] += Number(o?.orderQtyKg) || 0;
      buckets[label]['Orders Count'] += 1;
    });

    const list = Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month));
    if (list.length === 0) {
      return [{ month: 'Current', 'Order Qty (Kg)': totalOrderQtyKg, 'Orders Count': activeOrdersCount }];
    }
    return list.slice(-6); // Last 6 periods
  }, [orders, totalOrderQtyKg, activeOrdersCount]);

  // 3. Data for Charts: Stock Valuation by Material Category (Bar Chart)
  const stockByCategoryData = useMemo(() => {
    const categories = {};
    (inventory || []).forEach((item) => {
      const cat = item?.category || 'Film Substrates';
      const qty = parseFloat(item?.availableQtyKg) || 0;
      const rate = parseFloat(item?.unitPrice || item?.purchaseRatePerKg) || 0;
      const val = Math.round(qty * rate);
      if (!categories[cat]) {
        categories[cat] = { category: cat, 'Valuation (₹)': 0, 'Stock (Kg)': 0 };
      }
      categories[cat]['Valuation (₹)'] += val;
      categories[cat]['Stock (Kg)'] += Math.round(qty);
    });

    return Object.values(categories)
      .sort((a, b) => b['Valuation (₹)'] - a['Valuation (₹)'])
      .slice(0, 6);
  }, [inventory]);

  // 4. Data for Charts: Orders by Status Breakdown (Donut Chart)
  const ordersStatusData = useMemo(() => {
    const statuses = {};
    (orders || []).forEach((o) => {
      let st = o?.status || 'Confirmed';
      if (delayedOrders.some((d) => d?.id === o?.id)) {
        st = 'Delayed';
      }
      statuses[st] = (statuses[st] || 0) + 1;
    });

    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [orders, delayedOrders]);

  const formatCurrency = (val) => {
    return `₹ ${(Number(val) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const formatKg = (val) => {
    return `${(Number(val) || 0).toLocaleString('en-IN')} kg`;
  };

  return (
    <div className="ui-next dashboard-trial-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Trial Banner / Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '10px', display: 'flex' }}>
            <Sparkles size={22} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0 }}>
                Executive Operations Dashboard
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fde68a',
                  border: '1px solid rgba(245, 158, 11, 0.4)'
                }}
              >
                Tremor & HeroUI Trial
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
              Real-time plant intelligence, KPI cards, and charts preview for Admin and Plant Manager.
            </p>
          </div>
        </div>

        {typeof onToggleClassic === 'function' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onToggleClassic}
            style={{
              background: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.25)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              padding: '7px 14px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={14} /> Use the current design
          </button>
        )}
      </div>

      {/* Tremor KPI Metric Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: '16px',
          width: '100%'
        }}
      >
        {/* Active Orders */}
        <KpiCard
          title="Active Orders"
          value={activeOrdersCount}
          subtitle={`Total Qty: ${totalOrderQtyKg.toLocaleString()} kg`}
          icon={ShoppingBag}
          badgeText={`${activeOrdersCount} live`}
          changeType="neutral"
          onClick={() => onNavigateTab('orders')}
        />

        {/* Delayed Orders */}
        <KpiCard
          title="Delayed Orders"
          value={delayedOrdersCount}
          subtitle={delayedOrdersCount > 0 ? 'Action required in Order Management' : 'All orders on schedule'}
          icon={AlertTriangle}
          badgeText={delayedOrdersCount > 0 ? 'Alert' : 'On Track'}
          changeType={delayedOrdersCount > 0 ? 'alert' : 'positive'}
          onClick={() => onNavigateTab('orders')}
        />

        {/* Available Film Stock */}
        <KpiCard
          title="Available Film Stock"
          value={`${totalFilmStockKg.toLocaleString()} kg`}
          subtitle={`Across ${(inventory || []).length} film grades`}
          icon={Package}
          badgeText="Usable"
          changeType="positive"
          onClick={() => onNavigateTab('inventory')}
        />

        {/* Avg Ink Cost */}
        <KpiCard
          title="Avg Ink Cost (100% Solid Eq.)"
          value={`₹ ${Number(avgSolidEqInkCost || 0).toFixed(2)}`}
          subtitle={`Across ${(inks || []).length} active inks`}
          icon={Droplets}
          badgeText="100% Solid"
          changeType="neutral"
          onClick={() => onNavigateTab('ink_management')}
        />

        {/* Total Stock Purchase Valuation (Admin / Plant Manager only) */}
        {canSeeValuation && (
          <KpiCard
            title="Total Stock Purchase Valuation"
            value={`₹ ${totalStockValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            subtitle={`Valuation across ${(inventory || []).length} active items`}
            icon={DollarSign}
            badgeText="Asset"
            changeType="positive"
            onClick={() => onNavigateTab('inventory')}
          />
        )}

        {/* Onboarded Vendors */}
        <KpiCard
          title="Onboarded Vendors"
          value={(vendors || []).length}
          subtitle="GSTIN Verified Suppliers"
          icon={Truck}
          changeType="neutral"
          onClick={() => onNavigateTab('vendors')}
        />

        {/* Client Directory */}
        <KpiCard
          title="Client Directory"
          value={(clients || []).length}
          subtitle="Registered Buyers"
          icon={Users}
          changeType="neutral"
          onClick={() => onNavigateTab('clients')}
        />

        {/* Average Scrap % */}
        <KpiCard
          title="Average Scrap %"
          value={scrapMetrics?.formattedAvg || '0.0%'}
          subtitle={scrapMetrics?.subText || 'Plant production run scrap'}
          icon={Percent}
          changeType={scrapMetrics?.momDirection === 'up' ? 'negative' : (scrapMetrics?.momDirection === 'down' ? 'positive' : 'neutral')}
          onClick={() => onNavigateTab('scrap_analytics')}
        />
      </div>

      {/* Tremor Charts Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: '20px',
          width: '100%'
        }}
      >
        {/* Chart 1: Order Volume Trend (Area Chart) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: '#0284c7' }} /> Order Demand & Timeline
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                Production load (kg) scheduled by target delivery month
              </p>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              Monthly load
            </span>
          </div>
          <AreaChart
            data={orderTrendData}
            index="month"
            categories={['Order Qty (Kg)']}
            colors={['#0284c7']}
            valueFormatter={(val) => `${Number(val).toLocaleString()} kg`}
            height={250}
          />
        </div>

        {/* Chart 2: Stock Valuation by Material Category (Bar Chart) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={16} style={{ color: '#059669' }} /> Inventory Valuation by Category
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                Total raw material assets (₹) across primary categories
              </p>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              Top categories
            </span>
          </div>
          <BarChart
            data={stockByCategoryData}
            index="category"
            categories={['Valuation (₹)']}
            colors={['#0f172a']}
            valueFormatter={formatCurrency}
            height={250}
          />
        </div>

        {/* Chart 3: Order Status Breakdown (Donut Chart) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChartIcon size={16} style={{ color: '#7c3aed' }} /> Order Status Distribution
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                Active plant orders partitioned by current operational status
              </p>
            </div>
          </div>
          <DonutChart
            data={ordersStatusData}
            category="value"
            index="name"
            colors={['#0f172a', '#2563eb', '#059669', '#d97706', '#dc2626']}
            valueFormatter={(val) => `${val} order${val === 1 ? '' : 's'}`}
            height={250}
          />
        </div>
      </div>
    </div>
  );
}
