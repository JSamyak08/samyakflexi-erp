import React, { useState } from 'react';
import { 
  ShoppingBag, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Building2, 
  Plus,
  PauseCircle,
  PlayCircle,
  Trash2
} from 'lucide-react';
import PurchaseOrderPDF from './PurchaseOrderPDF';

export default function OrderManagement({ 
  orders, 
  vendors, 
  currentUser,
  productionRecords = [],
  onUpdateOrder, 
  onDeleteOrder,
  onNavigateToPunching,
  onNavigateToProductionRecords
}) {
  const isAdmin = currentUser?.role === 'Admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  // Job Completion Guard Handler
  const handleMarkJobCompleted = (order, e) => {
    if (e) e.stopPropagation();
    
    // Check if Production Record exists and is approved by Admin
    const rec = productionRecords.find(r => r.orderId === order.id);
    if (!rec || rec.status !== 'Approved by Admin') {
      alert(`⚠️ CANNOT COMPLETE JOB "${order.id}":\n\nA Job cannot be completed until its Production Record is completely filled by the Plant Manager AND approved by the Admin.\n\nCurrent Status: ${rec ? rec.status : 'Record Not Filled'}\n\nPlease complete the Production Record first.`);
      if (onNavigateToProductionRecords) onNavigateToProductionRecords();
      return;
    }

    onUpdateOrder({
      ...order,
      status: 'Completed'
    });

    alert(`🎉 Job "${order.id} - ${order.jobName}" has been successfully marked as COMPLETED!`);
  };

  // Track expanded order IDs
  const [expandedOrders, setExpandedOrders] = useState({
    'ORD-2026-089': true,
    'ORD-2026-091': true
  });

  // Track selected material requirement IDs: { "REQ-089-1": true, "REQ-091-1": true }
  const [selectedReqIds, setSelectedReqIds] = useState({});

  // Consolidated PO Generation Modal State
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id || '');
  const [deliveryDate, setDeliveryDate] = useState('2026-07-29');
  const [paymentTerms, setPaymentTerms] = useState('30 Days Net');
  const [poRemarks, setPoRemarks] = useState('Raw material must strictly conform to specified micron gauge and slit width. COA required upon delivery.');
  const [editablePoItems, setEditablePoItems] = useState([]);

  // Cache for generated PO documents
  const [issuedPoStore, setIssuedPoStore] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_issued_pos');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('samyak_erp_issued_pos', JSON.stringify(issuedPoStore));
    } catch (e) {
      console.warn("Failed to save issued PO store", e);
    }
  }, [issuedPoStore]);

  // Generated PO PDF preview state
  const [activePoPdfData, setActivePoPdfData] = useState(null);

  const toggleExpandOrder = (orderId) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const toggleSelectReq = (reqId) => {
    setSelectedReqIds(prev => ({ ...prev, [reqId]: !prev[reqId] }));
  };

  const toggleSelectAllForOrder = (order) => {
    const reqs = order.materialRequirements || [];
    const allSelected = reqs.every(r => selectedReqIds[r.id]);
    const nextState = { ...selectedReqIds };
    reqs.forEach(r => {
      if (!r.poIssued) {
        nextState[r.id] = !allSelected;
      }
    });
    setSelectedReqIds(nextState);
  };

  // Extract selected requirements list
  const getSelectedRequirementsList = () => {
    const list = [];
    orders.forEach(order => {
      (order.materialRequirements || []).forEach(req => {
        if (selectedReqIds[req.id]) {
          list.push({
            orderId: order.id,
            jobName: order.jobName,
            clientName: order.clientName,
            ...req
          });
        }
      });
    });
    return list;
  };

  const selectedRequirements = getSelectedRequirementsList();

  const handleOpenPoModal = () => {
    if (selectedRequirements.length === 0) {
      alert("Please select at least one raw material requirement line to issue a Purchase Order!");
      return;
    }
    // Auto-select preferred vendor if available
    const firstReq = selectedRequirements[0];
    const match = vendors.find(v => v.companyName === firstReq.preferredVendor);
    if (match) setSelectedVendorId(match.id);

    const items = selectedRequirements.map(req => {
      let rate = 165;
      if (req.filmType.includes('METPET')) rate = 185;
      else if (req.filmType.includes('LD')) rate = 135;
      else if (req.filmType.includes('Ink')) rate = 1500;
      else if (req.filmType.includes('Adhesive')) rate = 270;

      return {
        id: req.id,
        orderId: req.orderId,
        jobName: req.jobName,
        filmType: req.filmType,
        micron: req.micron,
        widthMm: req.widthMm,
        qtyKg: req.qtyKg,
        rate: rate
      };
    });

    setEditablePoItems(items);
    setIsPoModalOpen(true);
  };

  const handlePoItemChange = (id, field, value) => {
    setEditablePoItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleViewPoPdf = (poNo, e) => {
    if (e) e.stopPropagation();
    if (!poNo) return;

    if (issuedPoStore[poNo]) {
      setActivePoPdfData(issuedPoStore[poNo]);
      return;
    }

    // Reconstruct PO data if not cached directly
    const matchedItems = [];
    let vendorName = '';

    orders.forEach(ord => {
      (ord.materialRequirements || []).forEach(r => {
        if (r.poNumber === poNo || (r.poIssued && (r.poNumber === poNo || ord.poNumber === poNo))) {
          if (r.preferredVendor) vendorName = r.preferredVendor;
          let rate = 165;
          if (r.filmType.includes('METPET')) rate = 185;
          else if (r.filmType.includes('LD')) rate = 135;
          else if (r.filmType.includes('Ink')) rate = 1500;
          else if (r.filmType.includes('Adhesive')) rate = 270;

          matchedItems.push({
            id: r.id,
            orderId: ord.id,
            itemDesc: `${r.filmType} ${r.micron !== '-' ? r.micron + 'µ' : ''} (${ord.jobName})`,
            spec: `${r.filmType} ${r.micron !== '-' ? r.micron + 'µ' : ''} | Width: ${r.widthMm}mm`,
            qtyKg: r.qtyKg,
            rate: rate,
            amount: r.qtyKg * rate
          });
        }
      });
    });

    const vendorObj = vendors.find(v => v.companyName === vendorName) || vendors[0];

    const reconstructedPoData = {
      poNumber: poNo,
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      vendor: vendorObj,
      items: matchedItems.length > 0 ? matchedItems : [{
        id: '1',
        orderId: 'ORD-2026-089',
        itemDesc: 'PET 12µ (Britannia Bourbon)',
        spec: 'PET 12µ | Width: 1000mm',
        qtyKg: 385.5,
        rate: 165,
        amount: 63607.5
      }],
      deliveryDate: '2026-07-29',
      terms: '30 Days Net',
      remarks: 'Raw material must strictly conform to specified micron gauge and slit width. COA required upon delivery.'
    };

    setActivePoPdfData(reconstructedPoData);
  };

  const handleGenerateConsolidatedPO = (e) => {
    e.preventDefault();
    const vendorObj = vendors.find(v => v.id === selectedVendorId) || vendors[0];
    const poNo = `PO-2026-${100 + orders.length * 10 + selectedRequirements.length}`;

    const poItems = editablePoItems.map(item => {
      const qty = parseFloat(item.qtyKg) || 0;
      const rate = parseFloat(item.rate) || 0;

      return {
        id: item.id,
        orderId: item.orderId,
        itemDesc: `${item.filmType} ${item.micron !== '-' ? item.micron + 'µ' : ''} (${item.jobName})`,
        spec: `${item.filmType} ${item.micron !== '-' ? item.micron + 'µ' : ''} | Width: ${item.widthMm}mm`,
        qtyKg: qty,
        rate: rate,
        amount: qty * rate
      };
    });

    const poData = {
      poNumber: poNo,
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      vendor: vendorObj,
      items: poItems,
      deliveryDate,
      terms: paymentTerms,
      remarks: poRemarks
    };

    setIssuedPoStore(prev => ({
      ...prev,
      [poNo]: poData
    }));

    // Update PO status in orders state
    orders.forEach(order => {
      let orderUpdated = false;
      const updatedReqs = (order.materialRequirements || []).map(r => {
        if (selectedReqIds[r.id]) {
          orderUpdated = true;
          return { ...r, poIssued: true, poNumber: poNo };
        }
        return r;
      });

      if (orderUpdated) {
        const allIssued = updatedReqs.every(r => r.poIssued);
        onUpdateOrder({
          ...order,
          materialRequirements: updatedReqs,
          poIssued: allIssued,
          poNumber: poNo
        });
      }
    });

    setIsPoModalOpen(false);
    setSelectedReqIds({});
    setActivePoPdfData(poData);
  };

  const handleToggleHoldOrder = (order, e) => {
    if (e) e.stopPropagation();
    if (!isAdmin) {
      alert("Only Admin role has permission to put orders on hold or resume them!");
      return;
    }

    const isOnHold = order.status === 'On Hold';
    const newStatus = isOnHold ? 'In Production' : 'On Hold';

    onUpdateOrder({
      ...order,
      status: newStatus
    });

    alert(`Order "${order.id} - ${order.jobName}" is now ${newStatus.toUpperCase()}.`);
  };

  const handleDeleteOrderClick = (order, e) => {
    if (e) e.stopPropagation();
    if (!isAdmin) {
      alert("Only Admin role has permission to delete orders!");
      return;
    }

    if (window.confirm(`Are you sure you want to permanently delete Order "${order.id} - ${order.jobName}"? This action cannot be undone.`)) {
      if (onDeleteOrder) onDeleteOrder(order.id);
      alert(`Order ${order.id} deleted.`);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.jobName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.structure.toLowerCase().includes(searchTerm.toLowerCase());
    
    const isOverdue = (o.status === 'Delayed' || new Date(o.targetDeliveryDate) < new Date('2026-07-24')) && o.status !== 'On Hold';
    
    if (statusFilter === 'DELAYED' && !isOverdue) return false;
    if (statusFilter === 'ON_HOLD' && o.status !== 'On Hold') return false;
    if (statusFilter === 'PENDING_PO' && o.poIssued) return false;
    
    return matchesSearch;
  });

  const delayedOrdersCount = orders.filter(o => o.status === 'Delayed' || new Date(o.targetDeliveryDate) < new Date('2026-07-24')).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Generated Purchase Order PDF Modal Preview */}
      {activePoPdfData && (
        <PurchaseOrderPDF 
          poData={activePoPdfData} 
          onClose={() => setActivePoPdfData(null)} 
        />
      )}

      <div className="hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingBag size={22} style={{ color: 'var(--primary-brand)' }} /> Order Management & Vendor PO Issuance
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Track order delays (RED) and select itemized raw material requirements across orders to issue consolidated Purchase Orders to vendors.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={onNavigateToPunching}>
              <Plus size={16} /> Punch New Order
            </button>
            
            <button 
              className={`btn-primary ${selectedRequirements.length > 0 ? '' : 'btn-disabled'}`}
              onClick={handleOpenPoModal}
            >
              <FileText size={16} /> Issue Vendor PO ({selectedRequirements.length} Lines Selected)
            </button>
          </div>
        </div>
      </div>

      {/* Red Delay Alert Notification if delayed orders exist */}
      {delayedOrdersCount > 0 && (
        <div className="delayed-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={28} style={{ color: '#dc2626' }} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#dc2626' }}>
                RED HIGHLIGHT WARNING: {delayedOrdersCount} ORDER(S) OVERDUE PAST TARGET DELIVERY DEADLINE
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#991b1b', marginTop: '2px' }}>
                Orders marked in RED require immediate raw material procurement and vendor PO issuance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
          <input 
            type="text"
            className="form-control"
            style={{ paddingLeft: '36px' }}
            placeholder="Search order ID, job name, client, or film structure..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Filter Status:</span>
          <select className="form-control" style={{ width: '180px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Orders ({orders.length})</option>
            <option value="DELAYED">⚠️ Overdue / Delayed ({delayedOrdersCount})</option>
            <option value="ON_HOLD">⏸️ On Hold Orders</option>
            <option value="PENDING_PO">Pending PO Issuance</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Vendor:</span>
          <select className="form-control" style={{ width: '180px' }} value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
            <option value="ALL">All Preferred Vendors</option>
            {vendors.map(v => (
              <option key={v.id} value={v.companyName}>{v.companyName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders List with Itemized Raw Material Requirements Drawer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredOrders.map(order => {
          const isOverdue = order.status === 'Delayed' || new Date(order.targetDeliveryDate) < new Date('2026-07-24');
          const isExpanded = expandedOrders[order.id];
          const reqs = order.materialRequirements || order.rawMaterialRequirements || [];
          const allReqsSelected = reqs.length > 0 && reqs.every(r => selectedReqIds[r.id]);

          return (
            <div 
              key={order.id} 
              className={`glass-panel ${isOverdue ? 'row-delayed-highlight' : ''}`}
              style={{ padding: '0', overflow: 'hidden', border: isOverdue ? '2px solid #ef4444' : '1px solid var(--border-color)' }}
            >
              {/* Order Header Row */}
              <div 
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isOverdue ? '#fef2f2' : 'transparent' }}
                onClick={() => toggleExpandOrder(order.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '800', fontSize: '1rem', color: isOverdue ? '#dc2626' : 'var(--primary-brand)' }}>
                        {order.id}
                      </span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{order.jobName}</h3>
                      {isOverdue && <span className="badge-delayed-tag">OVERDUE / DELAYED</span>}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      <span>Client: <b>{order.clientName}</b></span>
                      <span>Structure: <b>{order.structure}</b></span>
                      <span>Order Qty: <b>{order.orderQtyKg.toLocaleString()} kg</b> ({order.orderType})</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Delivery Date</div>
                    <div style={{ fontWeight: '700', color: isOverdue ? '#dc2626' : 'var(--text-primary)' }}>
                      {order.targetDeliveryDate}
                    </div>
                  </div>

                  <span className={`badge ${order.status === 'On Hold' ? 'badge-warning' : isOverdue ? 'badge-warning' : 'badge-us'}`}>
                    {order.status === 'On Hold' ? '⏸️ ON HOLD' : order.status}
                  </span>

                  {order.status !== 'Completed' && (
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5', marginLeft: '8px' }}
                      onClick={(e) => handleMarkJobCompleted(order, e)}
                      title="Mark Job Completed (Requires Approved Production Record)"
                    >
                      <CheckCircle2 size={14} /> Complete Job
                    </button>
                  )}

                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '6px', marginLeft: '6px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={(e) => handleToggleHoldOrder(order, e)}
                        title={order.status === 'On Hold' ? 'Resume Order' : 'Put Order On Hold'}
                      >
                        {order.status === 'On Hold' ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                        {order.status === 'On Hold' ? ' Resume' : ' Hold'}
                      </button>

                      <button 
                        className="btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecaca' }}
                        onClick={(e) => handleDeleteOrderClick(order, e)}
                        title="Delete Order"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable Drawer: Itemized Raw Material Breakdown per Vendor */}
              {isExpanded && (
                <div style={{ padding: '16px 20px', background: '#ffffff', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={16} style={{ color: 'var(--primary-brand)' }} />
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        ITEMIZED RAW MATERIAL REQUIREMENTS ({reqs.length} ITEMS)
                      </h4>
                    </div>

                    <button 
                      className="btn-secondary" 
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      onClick={(e) => { e.stopPropagation(); toggleSelectAllForOrder(order); }}
                    >
                      {allReqsSelected ? 'Deselect Order Materials' : 'Select All Materials for PO'}
                    </button>
                  </div>

                  <table className="data-table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>Select</th>
                        <th>Material Description</th>
                        <th>Micron (µ)</th>
                        <th>Width (mm)</th>
                        <th>Gross Qty (Kg)</th>
                        <th>Preferred Vendor</th>
                        <th>PO Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reqs.map(req => {
                        const isChecked = !!selectedReqIds[req.id];
                        return (
                          <tr key={req.id} style={{ background: isChecked ? '#eff6ff' : 'transparent' }}>
                            <td>
                              <input 
                                type="checkbox"
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                checked={isChecked}
                                onChange={() => toggleSelectReq(req.id)}
                              />
                            </td>
                            <td style={{ fontWeight: '600' }}>{req.filmType}</td>
                            <td>{req.micron}</td>
                            <td>{req.widthMm}</td>
                            <td className="bold-val">{req.qtyKg} kg</td>
                            <td style={{ color: 'var(--text-secondary)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Building2 size={13} /> {req.preferredVendor}
                              </span>
                            </td>
                            <td>
                              {req.poIssued ? (
                                <button 
                                  type="button"
                                  className="btn-secondary" 
                                  style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    padding: '4px 8px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: '700', 
                                    color: '#047857', 
                                    borderColor: '#a7f3d0', 
                                    background: '#ecfdf5', 
                                    cursor: 'pointer' 
                                  }}
                                  onClick={(e) => handleViewPoPdf(req.poNumber || order.poNumber || 'PO-2026-101', e)}
                                  title="Click to View, Print & Download Purchase Order PDF"
                                >
                                  <FileText size={13} /> {req.poNumber || order.poNumber || 'PO-2026-101'}
                                </button>
                              ) : (
                                <span className="badge badge-warning">Pending PO</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal: Consolidated Vendor Purchase Order Generation */}
      {isPoModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPoModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '680px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={22} style={{ color: 'var(--primary-brand)' }} /> Issue Consolidated Vendor Purchase Order (PO)
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Consolidating <b>{selectedRequirements.length} material requirement lines</b> from selected orders into a single Purchase Order.
            </p>

            <form onSubmit={handleGenerateConsolidatedPO}>
              <div className="form-group">
                <label>Select Vendor for Purchase Order *</label>
                <select 
                  className="form-control"
                  value={selectedVendorId}
                  onChange={e => setSelectedVendorId(e.target.value)}
                >
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.companyName} (GSTIN: {v.gstin}) | Supplies: {v.materials.join(', ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Material Line Items Table Preview */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  COMBINED PO LINE ITEMS
                </label>
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                  <table className="data-table" style={{ fontSize: '0.78rem' }}>
                    <thead>
                      <tr>
                        <th>Order ID & Job</th>
                        <th>Material Grade</th>
                        <th>Width</th>
                        <th style={{ width: '100px' }}>Qty (Kg) *</th>
                        <th style={{ width: '110px' }}>Rate (₹/kg) *</th>
                        <th style={{ textAlign: 'right' }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editablePoItems.map(item => {
                        const qty = parseFloat(item.qtyKg) || 0;
                        const rate = parseFloat(item.rate) || 0;
                        return (
                          <tr key={item.id}>
                            <td><b>{item.orderId}</b>: {item.jobName}</td>
                            <td style={{ fontWeight: '600' }}>{item.filmType} {item.micron !== '-' ? item.micron + 'µ' : ''}</td>
                            <td>{item.widthMm}mm</td>
                            <td>
                              <input 
                                type="number" 
                                className="form-control" 
                                style={{ padding: '3px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                                value={item.qtyKg} 
                                onChange={e => handlePoItemChange(item.id, 'qtyKg', e.target.value)} 
                              />
                            </td>
                            <td>
                              <input 
                                type="number" 
                                className="form-control" 
                                style={{ padding: '3px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                                value={item.rate} 
                                onChange={e => handlePoItemChange(item.id, 'rate', e.target.value)} 
                              />
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--primary-brand)' }}>
                              ₹{(qty * rate).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Promised Delivery Date *</label>
                  <input 
                    type="date" 
                    className="form-control"
                    required
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Terms</label>
                  <input 
                    type="text" 
                    className="form-control"
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>PO Special Instructions / Delivery Terms</label>
                <textarea 
                  className="form-control"
                  rows="2"
                  value={poRemarks}
                  onChange={e => setPoRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsPoModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> Generate & Print Vendor PO PDF
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
