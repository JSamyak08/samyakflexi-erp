import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Droplet, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight, 
  CheckCircle2, 
  ShieldAlert,
  Printer
} from 'lucide-react';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeStorage';

export default function ExecutiveAlertsSection({
  delayedOrders = [],
  delayedOrdersCount = 0,
  printingDeadlineReminders = [],
  deadlineSummary = null,
  printingLeadDays = 3,
  lowStockInks = [],
  canPlanPrinting = false,
  canManageDeadline = true,
  onNavigateTab,
}) {
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'delayed' | 'printing' | 'inks'
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return safeLocalStorageGet('samyak_exec_alerts_collapsed', false) === true;
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      safeLocalStorageSet('samyak_exec_alerts_collapsed', next);
      return next;
    });
  };

  const printingOverdueCount = printingDeadlineReminders.filter(
    (item) => item?.assessment?.stage === 'overdue'
  ).length;
  const printingDueSoonCount = printingDeadlineReminders.length - printingOverdueCount;

  const totalExceptions = 
    delayedOrdersCount + 
    printingDeadlineReminders.length + 
    (lowStockInks || []).length;

  if (totalExceptions === 0) {
    return (
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '12px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: '#166534',
        fontSize: '0.86rem',
        fontWeight: '600'
      }}>
        <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
        <span>All plant operational systems nominal • No overdue delivery deadlines, print risks, or low ink alerts.</span>
      </div>
    );
  }

  // Collapsed Minimalist Executive Alert Strip
  if (isCollapsed) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #fecaca',
        borderLeft: '4px solid #dc2626',
        borderRadius: '12px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 4px rgba(220, 38, 38, 0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldAlert size={16} />
          </div>
          <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#0f172a' }}>
            Operational Exceptions:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {delayedOrdersCount > 0 && (
              <span style={{
                background: '#fee2e2',
                color: '#dc2626',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: '700'
              }}>
                {delayedOrdersCount} Delayed Orders
              </span>
            )}
            {printingDeadlineReminders.length > 0 && (
              <span style={{
                background: '#fef3c7',
                color: '#b45309',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: '700'
              }}>
                {printingDeadlineReminders.length} Print Deadlines At Risk
              </span>
            )}
            {(lowStockInks || []).length > 0 && (
              <span style={{
                background: '#ffe4e6',
                color: '#e11d48',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: '700'
              }}>
                {lowStockInks.length} Low Ink Reserves
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleCollapse}
          className="btn-secondary"
          style={{
            padding: '5px 12px',
            fontSize: '0.78rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '8px'
          }}
          aria-expanded="false"
        >
          <span>Review All Warnings ({totalExceptions})</span>
          <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  // Expanded Structured Operational Warnings & Exceptions Hub
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '16px',
      padding: '20px',
      boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      minWidth: 0,
      maxWidth: '100%',
      width: '100%'
    }}>
      {/* Unified Section Header with Category Tabs and Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        paddingBottom: '14px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldAlert size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Operational Warnings & Action Center
              </h3>
              <span style={{
                background: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: '800',
                letterSpacing: '0.02em'
              }}>
                {totalExceptions} Items Active
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Consolidated plant exceptions requiring dispatch expedite, press scheduling, or raw material indents.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Category Filter Pills */}
          <div style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            padding: '3px',
            borderRadius: '10px',
            gap: '2px',
            flexWrap: 'wrap'
          }}>
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              style={{
                border: 'none',
                background: activeCategory === 'all' ? '#ffffff' : 'transparent',
                color: activeCategory === 'all' ? '#0f172a' : '#64748b',
                fontWeight: activeCategory === 'all' ? '700' : '500',
                fontSize: '0.76rem',
                padding: '5px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: activeCategory === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              All Warnings ({totalExceptions})
            </button>
            {delayedOrdersCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory('delayed')}
                style={{
                  border: 'none',
                  background: activeCategory === 'delayed' ? '#ffffff' : 'transparent',
                  color: activeCategory === 'delayed' ? '#dc2626' : '#64748b',
                  fontWeight: activeCategory === 'delayed' ? '700' : '500',
                  fontSize: '0.76rem',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: activeCategory === 'delayed' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Delivery Overdue ({delayedOrdersCount})
              </button>
            )}
            {printingDeadlineReminders.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory('printing')}
                style={{
                  border: 'none',
                  background: activeCategory === 'printing' ? '#ffffff' : 'transparent',
                  color: activeCategory === 'printing' ? '#b45309' : '#64748b',
                  fontWeight: activeCategory === 'printing' ? '700' : '500',
                  fontSize: '0.76rem',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: activeCategory === 'printing' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Print Deadlines ({printingDeadlineReminders.length})
              </button>
            )}
            {(lowStockInks || []).length > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory('inks')}
                style={{
                  border: 'none',
                  background: activeCategory === 'inks' ? '#ffffff' : 'transparent',
                  color: activeCategory === 'inks' ? '#e11d48' : '#64748b',
                  fontWeight: activeCategory === 'inks' ? '700' : '500',
                  fontSize: '0.76rem',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: activeCategory === 'inks' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Low Inks ({lowStockInks.length})
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapse}
            className="btn-secondary"
            style={{
              padding: '6px 10px',
              fontSize: '0.78rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '8px'
            }}
            title="Collapse section to compact banner"
            aria-expanded="true"
          >
            <ChevronUp size={14} />
            <span>Collapse</span>
          </button>
        </div>
      </div>

      {/* Structured Warning Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: activeCategory === 'all' 
          ? 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' 
          : '1fr',
        gap: '16px',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0
      }}>
        {/* 1. Delayed Orders Card */}
        {(activeCategory === 'all' || activeCategory === 'delayed') && delayedOrdersCount > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #fffbfb 100%)',
            border: '1px solid #fecaca',
            borderLeft: '4px solid #dc2626',
            borderRadius: '12px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 1px 4px rgba(220, 38, 38, 0.05)',
            minWidth: 0,
            maxWidth: '100%'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 180px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <AlertTriangle size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                      Delivery Deadline Overdue
                    </h4>
                    <span style={{ fontSize: '0.76rem', color: '#dc2626', fontWeight: '700' }}>
                      {delayedOrdersCount} {delayedOrdersCount === 1 ? 'Order' : 'Orders'} Past Target Date
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateTab('orders')}
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  Manage <ArrowRight size={13} />
                </button>
              </div>

              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                Target dispatch dates have elapsed without confirmed shipment. Review production status or update schedule.
              </p>
            </div>

            {/* Chips of delayed orders */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              paddingTop: '8px',
              borderTop: '1px dashed #fecaca'
            }}>
              {delayedOrders.slice(0, activeCategory === 'delayed' ? 8 : 3).map(o => (
                <span
                  key={o.id}
                  onClick={() => onNavigateTab('orders', o?.id ? { id: o.id } : {})}
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    color: '#9f1239',
                    fontSize: '0.72rem',
                    fontWeight: '600',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={`Click to view ${o.jobName}`}
                >
                  <strong>{o.id}</strong>: {o.jobName}
                  <span style={{ color: '#e11d48', fontSize: '0.68rem' }}>
                    ({o.targetDeliveryDate || 'Overdue'})
                  </span>
                </span>
              ))}
              {delayedOrdersCount > (activeCategory === 'delayed' ? 8 : 3) && (
                <span
                  onClick={() => onNavigateTab('orders')}
                  style={{
                    fontSize: '0.72rem',
                    color: '#dc2626',
                    alignSelf: 'center',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  +{delayedOrdersCount - (activeCategory === 'delayed' ? 8 : 3)} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* 2. Printing Deadlines at Risk Card */}
        {(activeCategory === 'all' || activeCategory === 'printing') && printingDeadlineReminders.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #fffdfa 100%)',
            border: '1px solid #fed7aa',
            borderLeft: '4px solid #ea580c',
            borderRadius: '12px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 1px 4px rgba(234, 88, 12, 0.05)',
            minWidth: 0,
            maxWidth: '100%'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 180px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#ffedd5',
                    color: '#ea580c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Printer size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                      Orders At Risk Before Print
                    </h4>
                    <span style={{ fontSize: '0.76rem', color: '#c2410c', fontWeight: '700' }}>
                      {printingDeadlineReminders.length} Orders ({printingOverdueCount} Overdue, {printingDueSoonCount} Soon)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateTab(canPlanPrinting ? 'printing_scheduler' : 'orders')}
                  style={{
                    background: '#ea580c',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  Schedule <ArrowRight size={13} />
                </button>
              </div>

              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                Print starts lead time window ({printingLeadDays} days) has elapsed or is due. Cylinders & film issue needed.
              </p>
            </div>

            {/* Chips of printing deadline reminders */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              paddingTop: '8px',
              borderTop: '1px dashed #fed7aa'
            }}>
              {printingDeadlineReminders.slice(0, activeCategory === 'printing' ? 8 : 3).map(item => (
                <span
                  key={item.order.id}
                  onClick={() => onNavigateTab('orders', item?.order?.id ? { id: item.order.id } : {})}
                  style={{
                    background: item.assessment.stage === 'overdue' ? '#fff1f2' : '#fffbeb',
                    border: `1px solid ${item.assessment.stage === 'overdue' ? '#fecdd3' : '#fde68a'}`,
                    color: item.assessment.stage === 'overdue' ? '#9f1239' : '#92400e',
                    fontSize: '0.72rem',
                    fontWeight: '600',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={`Target: ${item.assessment.targetDate || '—'}`}
                >
                  <strong>{item.order.id}</strong>: {item.order.jobName}
                  <span style={{ fontSize: '0.68rem', fontWeight: '700' }}>
                    {item.assessment.stage === 'overdue' ? '• Overdue' : `• Due in ${item.assessment.daysRemaining}d`}
                  </span>
                </span>
              ))}
              {printingDeadlineReminders.length > (activeCategory === 'printing' ? 8 : 3) && (
                <span
                  onClick={() => onNavigateTab(canPlanPrinting ? 'printing_scheduler' : 'orders')}
                  style={{
                    fontSize: '0.72rem',
                    color: '#ea580c',
                    alignSelf: 'center',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  +{printingDeadlineReminders.length - (activeCategory === 'printing' ? 8 : 3)} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* 3. Low Stock Ink Alert Card */}
        {(activeCategory === 'all' || activeCategory === 'inks') && (lowStockInks || []).length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #fffbfb 100%)',
            border: '1px solid #fecdd3',
            borderLeft: '4px solid #e11d48',
            borderRadius: '12px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 1px 4px rgba(225, 29, 72, 0.05)',
            minWidth: 0,
            maxWidth: '100%'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 180px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#ffe4e6',
                    color: '#e11d48',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Droplet size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                      Low Ink Stock Warning
                    </h4>
                    <span style={{ fontSize: '0.76rem', color: '#e11d48', fontWeight: '700' }}>
                      {lowStockInks.length} Inks Below Reorder Threshold
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateTab('ink_management')}
                  style={{
                    background: '#e11d48',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  Reorder <ArrowRight size={13} />
                </button>
              </div>

              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                Plant reserves have fallen below minimum buffers. Issue purchase indent to prevent press stop.
              </p>
            </div>

            {/* Chips of low stock inks */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              paddingTop: '8px',
              borderTop: '1px dashed #fecdd3'
            }}>
              {(lowStockInks || []).slice(0, activeCategory === 'inks' ? 8 : 3).map(i => (
                <span
                  key={i.id || i.productCode}
                  onClick={() => onNavigateTab('ink_management', (i?.id || i?.productCode) ? { id: i.id || i.productCode } : {})}
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    color: '#9f1239',
                    fontSize: '0.72rem',
                    fontWeight: '600',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={`Current: ${i.stockQtyKg || 0} kg | Min: ${i.reorderLevelKg || 0} kg`}
                >
                  <strong>{i.productCode}</strong>
                  <span style={{ color: '#e11d48', fontSize: '0.68rem' }}>
                    ({i.stockQtyKg || 0}kg / {i.reorderLevelKg || 0}kg)
                  </span>
                </span>
              ))}
              {(lowStockInks || []).length > (activeCategory === 'inks' ? 8 : 3) && (
                <span
                  onClick={() => onNavigateTab('ink_management')}
                  style={{
                    fontSize: '0.72rem',
                    color: '#e11d48',
                    alignSelf: 'center',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  +{lowStockInks.length - (activeCategory === 'inks' ? 8 : 3)} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
