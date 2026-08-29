import React, { useState, useEffect } from 'react';
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
  Trash2,
  Clock
} from 'lucide-react';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import TablePagination, { usePagination } from './TablePagination';
import { pushSlugState } from '../utils/slugRouter';
import { calculateJobRawMaterials, isOrderOverdue, isOrderNearingDeadline, getOrderStatusInfo } from '../factoryStore';
import { saveOrderToSupabase } from '../services/supabaseDataService';

export default function OrderManagement({ 
  urlParams = {},
  orders = [], 
  vendors = [], 
  inventory = [],
  jobMasters = [],
  currentUser,
  productionRecords = [],
  onUpdateOrder, 
  onDeleteOrder,
  onNavigateToPunching,
  onNavigateToProductionRecords
}) {
  // Helper: derive substrate structure from Job Master layers (authoritative source)
  const getSubstrateStructure = (order) => {
    const jm = jobMasters.find(j =>
      (j.jobName || '').toLowerCase().trim() === (order?.jobName || '').toLowerCase().trim()
    );
    if (jm && jm.layers && jm.layers.length > 0) {
      return jm.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
    }
    if (jm && jm.structure && jm.structure !== 'PET / PE' && jm.structure !== '—') {
      return jm.structure;
    }
    if (order?.structure && order.structure !== 'PET / PE' && order.structure !== '—') {
      return order.structure;
    }
    return jm?.structure || order?.structure || '—';
  };

  // Helper: derive Material Form (Reel Form or Pouching Form) directly from Job Master specifications
  const getMaterialForm = (order) => {
    if (!order) return 'Reel Form';

    // 1. Primary: Linked Job Master from Job Master Directory
    const jm = jobMasters.find(j =>
      (order.jobMasterId && (j.id === order.jobMasterId || j.jobMasterId === order.jobMasterId)) ||
      ((j.jobName || '').toLowerCase().trim() === (order?.jobName || '').toLowerCase().trim())
    );
    if (jm) {
      const jmType = jm.orderType || jm.materialFormat || jm.materialForm || jm.supplyFormat;
      if (jmType) {
        const s = String(jmType).trim().toLowerCase();
        if (s.includes('pouch')) return 'Pouching Form';
        if (s.includes('reel') || s.includes('roll')) return 'Reel Form';
      }
      if ((jm.pouchOpenWidth && Number(jm.pouchOpenWidth) > 0) || (jm.pouchHeight && Number(jm.pouchHeight) > 0) || jm.pouchType) {
        return 'Pouching Form';
      }
      if (Array.isArray(jm.routingSteps) && jm.routingSteps.some(s => (s.operation || '').toLowerCase().includes('pouch'))) {
        return 'Pouching Form';
      }
    }

    // 2. Order's job details / attributes
    const rawType = order.jobDetails?.orderType || order.jobDetails?.materialFormat || order.orderType || order.materialFormat || order.materialForm || order.supplyFormat || order.calculationDetails?.orderType;
    if (rawType) {
      const s = String(rawType).trim().toLowerCase();
      if (s.includes('pouch')) return 'Pouching Form';
      if (s.includes('reel') || s.includes('roll')) return 'Reel Form';
    }

    // 3. Fallback: Check keywords in Job Title / Product Name
    const jn = (order?.jobName || '').toLowerCase();
    if (jn.includes('pouch') || jn.includes('bag') || jn.includes('zipper') || jn.includes('standup') || jn.includes('sachet') || jn.includes('center seal') || jn.includes('three side')) {
      return 'Pouching Form';
    }

    return 'Reel Form';
  };

  // Helper: ensure Itemized Raw Material Requirements are always calculated and loaded up
  const getOrderMaterialRequirements = (order) => {
    const existing = order.materialRequirements || order.rawMaterialRequirements;
    if (Array.isArray(existing) && existing.length > 0) {
      return existing;
    }

    const jm = jobMasters.find(j =>
      (j.jobName || '').toLowerCase().trim() === (order?.jobName || '').toLowerCase().trim()
    );

    let layers = jm?.layers || order?.jobDetails?.layers;

    if (!layers || layers.length === 0) {
      const structStr = (jm?.structure || order?.structure || '');
      if (structStr && structStr !== 'PET / PE' && structStr !== '—') {
        const parts = structStr.split('/').map(p => p.trim());
        layers = parts.map(part => {
          const micronMatch = part.match(/(\d+(\.\d+)?)\s*µ?/i);
          const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
          let filmType = part.replace(/(\d+(\.\d+)?)\s*µ?/gi, '').trim();
          if (!filmType) filmType = 'PET';
          return { filmType, micron };
        });
      }
    }

    if (!layers || layers.length === 0) {
      layers = [
        { filmType: 'PET', micron: 12 },
        { filmType: 'Natural GP LD', micron: 35 }
      ];
    }

    const calc = calculateJobRawMaterials({
      jobName: order?.jobName || 'Job',
      printWidthMm: parseFloat(order?.printWidthMm || jm?.printWidthMm) || 1000,
      repeatLengthMm: parseFloat(order?.repeatLengthMm || jm?.repeatLengthMm) || 400,
      orderQtyKg: parseFloat(order?.orderQtyKg) || 1000,
      orderType: getMaterialForm(order),
      layers
    });

    const reqs = [];
    if (calc && calc.layerResults) {
      calc.layerResults.forEach((layer, idx) => {
        reqs.push({
          id: `REQ-${order?.id || 'ORD'}-${idx + 1}`,
          filmType: layer.filmType,
          micron: layer.micron,
          widthMm: layer.widthMm || parseFloat(order?.printWidthMm || jm?.printWidthMm) || 1000,
          qtyKg: layer.grossKg || 0,
          preferredVendor: (layer.filmType || '').toLowerCase().includes('ld') ? 'Malwa Extrusions Pvt Ltd' : 'FlexiPoly Films Ltd',
          poIssued: false,
          poNumber: ""
        });
      });

      if (calc.inkDetails && calc.inkDetails.grossKg > 0) {
        reqs.push({
          id: `REQ-${order?.id || 'ORD'}-${reqs.length + 1}`,
          filmType: 'Liquid Inks',
          micron: '-',
          widthMm: '-',
          qtyKg: calc.inkDetails.grossKg,
          preferredVendor: 'Siegwerk Inks Ltd',
          poIssued: false,
          poNumber: ""
        });
      }

      if (calc.adhesiveDetails && calc.adhesiveDetails.grossKg > 0) {
        reqs.push({
          id: `REQ-${order?.id || 'ORD'}-${reqs.length + 1}`,
          filmType: 'Solvent-less Adhesive',
          micron: '-',
          widthMm: '-',
          qtyKg: calc.adhesiveDetails.grossKg,
          preferredVendor: 'Siegwerk Inks Ltd',
          poIssued: false,
          poNumber: ""
        });
      }
    }

    return reqs;
  };
  const isAdmin = currentUser?.role === 'Admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  // Helper for automatic stock checking & reservation matching
  const getStockCheckForReq = (req) => {
    const reqQty = parseFloat(req.qtyKg) || 0;
    if (reqQty <= 0) return { reqQty: 0, totalInStock: 0, reservedKg: 0, balanceKg: 0, isFullyAvailable: false, isPartiallyAvailable: false };

    const reqFilm = (req.filmType || '').toLowerCase();
    const reqMicron = String(req.micron || '').replace('µ', '').trim();
    const reqWidth = String(req.widthMm || '').replace('mm', '').trim();

    // Match against inventory items
    const match = inventory.find(inv => {
      const invFilm = (inv.filmType || '').toLowerCase();
      const invMicron = String(inv.micron || '').replace('µ', '').trim();
      const invWidth = String(inv.widthMm || '').replace('mm', '').trim();

      const filmMatch = invFilm.includes(reqFilm) || reqFilm.includes(invFilm) || 
                        (reqFilm.includes('pet') && invFilm.includes('pet')) ||
                        (reqFilm.includes('metpet') && invFilm.includes('metpet')) ||
                        (reqFilm.includes('ld') && invFilm.includes('ld'));

      const micronMatch = !reqMicron || reqMicron === '-' || !invMicron || invMicron === '-' || invMicron === reqMicron;
      const widthMatch = !reqWidth || reqWidth === '-' || !invWidth || invWidth === '-' || invWidth === reqWidth;

      return filmMatch && micronMatch && widthMatch;
    });

    let totalInStock = match ? (parseFloat(match.availableQtyKg) || 0) : 0;

    const reservedKg = Math.min(reqQty, totalInStock);
    const balanceKg = Math.max(0, reqQty - reservedKg);

    return {
      reqQty,
      totalInStock,
      reservedKg,
      balanceKg,
      isFullyAvailable: reservedKg >= reqQty,
      isPartiallyAvailable: reservedKg > 0 && reservedKg < reqQty
    };
  };

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
  const [expandedOrders, setExpandedOrders] = useState({});

  // Auto-expand order if unique id is present in URL params
  useEffect(() => {
    if (urlParams && urlParams.id && orders && orders.length > 0) {
      const match = orders.find(o => 
        o.id === urlParams.id || 
        (o.jobName && o.jobName.toLowerCase().includes(urlParams.id.toLowerCase()))
      );
      if (match) {
        setExpandedOrders(prev => ({ ...prev, [match.id]: true }));
      }
    }
  }, [urlParams?.id, orders]);

  const toggleExpandOrder = (orderId) => {
    setExpandedOrders(prev => {
      const nextState = !prev[orderId];
      if (nextState) {
        pushSlugState('orders', { id: orderId });
      } else {
        pushSlugState('orders');
      }
      return { ...prev, [orderId]: nextState };
    });
  };

  // Track selected material requirement IDs: { "REQ-089-1": true, "REQ-091-1": true }
  const [selectedReqIds, setSelectedReqIds] = useState({});

  // Consolidated PO Generation Modal State
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id || '');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
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

  const toggleSelectReq = (reqId) => {
    setSelectedReqIds(prev => ({ ...prev, [reqId]: !prev[reqId] }));
  };

  const toggleSelectAllForOrder = (order) => {
    const reqs = getOrderMaterialRequirements(order);
    const allSelected = reqs.length > 0 && reqs.every(r => selectedReqIds[r.id]);

    const newMap = { ...selectedReqIds };
    reqs.forEach(r => {
      if (allSelected) delete newMap[r.id];
      else newMap[r.id] = true;
    });
    setSelectedReqIds(newMap);
  };

  // Extract selected requirements list
  const getSelectedRequirementsList = () => {
    const list = [];
    orders.forEach(order => {
      getOrderMaterialRequirements(order).forEach(req => {
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

      const stockInfo = getStockCheckForReq(req);

      return {
        id: req.id,
        orderId: req.orderId,
        jobName: req.jobName,
        filmType: req.filmType,
        micron: req.micron,
        widthMm: req.widthMm,
        grossQtyKg: req.qtyKg,
        reservedKg: stockInfo.reservedKg,
        qtyKg: stockInfo.balanceKg, // Defaults to balance quantity only!
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
            itemDesc: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''}`.trim(),
            spec: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''} | Width: ${r.widthMm}mm`,
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
      items: matchedItems,
      deliveryDate: new Date().toISOString().split('T')[0],
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
        itemDesc: `${item.filmType} ${item.micron && item.micron !== '-' ? item.micron + 'µ' : ''}`.trim(),
        spec: `${item.filmType} ${item.micron && item.micron !== '-' ? item.micron + 'µ' : ''} | Width: ${item.widthMm}mm`,
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
  // Filter orders
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      (o.jobName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      getSubstrateStructure(o).toLowerCase().includes(searchTerm.toLowerCase());
    
    const statusInfo = getOrderStatusInfo(o);
    
    if (statusFilter === 'DELAYED' && !statusInfo.isOverdue) return false;
    if (statusFilter === 'NEARING_DEADLINE' && !statusInfo.isNearingDeadline) return false;
    if (statusFilter === 'ON_HOLD' && o.status !== 'On Hold') return false;
    if (statusFilter === 'PENDING_PO' && o.poIssued) return false;
    
    return matchesSearch;
  });

  const ordersPagination = usePagination(filteredOrders, 50);

  const delayedOrdersCount = (orders || []).filter(o => isOrderOverdue(o)).length;
  const nearingDeadlineCount = (orders || []).filter(o => isOrderNearingDeadline(o)).length;

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
              Track order delays (RED), orders nearing deadline (AMBER), and select itemized raw material requirements across orders to issue consolidated Purchase Orders to vendors.
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
        <div style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #fffbfb 100%)',
          border: '1px solid #fecaca',
          borderLeft: '4px solid #dc2626',
          padding: '14px 18px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 6px -2px rgba(220, 38, 38, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '34px',
              height: '34px',
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Delivery Deadline Overdue
                </h4>
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
                  {delayedOrdersCount} {delayedOrdersCount === 1 ? 'Order' : 'Orders'} Highlighted in Red
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                Orders have crossed target delivery deadlines. Ensure vendor raw materials and printing cylinders are allocated.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Amber Nearing Deadline Alert Notification */}
      {nearingDeadlineCount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #fffdf7 100%)',
          border: '1px solid #fde68a',
          borderLeft: '4px solid #f59e0b',
          padding: '14px 18px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 6px -2px rgba(245, 158, 11, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Orders Nearing Target Deadline
                </h4>
                <span style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  {nearingDeadlineCount} {nearingDeadlineCount === 1 ? 'Order' : 'Orders'} (≤ 4 Days Remaining)
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                Orders are within 4 days of scheduled dispatch. Ensure printing cylinders and materials are loaded on machine schedule.
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
          <select className="form-control" style={{ width: '240px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Orders ({(orders || []).length})</option>
            <option value="DELAYED">⚠️ Overdue / Delayed ({delayedOrdersCount})</option>
            <option value="NEARING_DEADLINE">⏳ Nearing Deadline (≤4 Days) ({nearingDeadlineCount})</option>
            <option value="ON_HOLD">⏸️ On Hold Orders</option>
            <option value="PENDING_PO">Pending PO Issuance</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Vendor:</span>
          <select className="form-control" style={{ width: '180px' }} value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
            <option value="ALL">All Preferred Vendors</option>
            {(vendors || []).map(v => (
              <option key={v.id} value={v.companyName}>{v.companyName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders List with Itemized Raw Material Requirements Drawer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {ordersPagination.paginatedItems.map(order => {
          const statusInfo = getOrderStatusInfo(order);
          const isOverdue = statusInfo.isOverdue;
          const isNearing = statusInfo.isNearingDeadline;
          const isExpanded = expandedOrders[order.id];
          const reqs = getOrderMaterialRequirements(order);
          const allReqsSelected = reqs.length > 0 && reqs.every(r => selectedReqIds[r.id]);

          const cardBorder = isOverdue ? '2px solid #ef4444' : (isNearing ? '2px solid #f59e0b' : '1px solid var(--border-color)');
          const cardBg = isOverdue ? '#fef2f2' : (isNearing ? '#fffbeb' : 'transparent');

          return (
            <div 
              key={order.id} 
              className={`glass-panel ${isOverdue ? 'row-delayed-highlight' : ''}`}
              style={{ padding: '0', overflow: 'hidden', border: cardBorder }}
            >
              {/* Order Header Row */}
              <div 
                className="order-header-row"
                style={{ 
                  padding: '16px 20px', 
                  display: 'flex',
                  alignItems: 'center',
                  background: cardBg,
                  transition: 'background 0.2s ease',
                  cursor: 'pointer'
                }}
                onClick={() => toggleExpandOrder(order.id)}
              >
                <div className="order-card-header-grid">
                  {/* Chevron Toggle */}
                  <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>

                  {/* Left Column: Job Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span className="order-id-badge" style={{ 
                        background: isOverdue ? 'rgba(239, 68, 68, 0.15)' : (isNearing ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent-light)'),
                        color: isOverdue ? '#dc2626' : (isNearing ? '#b45309' : 'var(--primary-brand)'),
                        border: isOverdue ? '1px solid rgba(239, 68, 68, 0.25)' : (isNearing ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid var(--border-color)')
                      }}>
                        {order.id}
                      </span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: '0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '380px' }} title={order.jobName}>
                        {order.jobName}
                      </h3>
                      {isOverdue && <span className="badge-delayed-tag">OVERDUE</span>}
                      {isNearing && (
                        <span className="badge-delayed-tag" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                          NEARING DEADLINE ({statusInfo.daysRemaining === 0 ? 'TODAY' : `${statusInfo.daysRemaining}D LEFT`})
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '14px', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>Client: <strong style={{ color: 'var(--text-primary)' }}>{order.clientName}</strong></span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        Structure: <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: '600', color: '#1e293b' }}>{getSubstrateStructure(order)}</span>
                      </span>
                      <span>Qty: <strong style={{ color: 'var(--text-primary)' }}>{(order.orderQtyKg ?? 0).toLocaleString()} kg</strong></span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        Form:
                        <span
                          style={{
                            padding: '2px 8px',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            borderRadius: '4px',
                            border: `1px solid ${getMaterialForm(order).includes('Pouch') ? '#93c5fd' : '#86efac'}`,
                            background: getMaterialForm(order).includes('Pouch') ? '#eff6ff' : '#f0fdf4',
                            color: getMaterialForm(order).includes('Pouch') ? '#1d4ed8' : '#15803d'
                          }}
                          title="Form specified in Job Master"
                        >
                          {getMaterialForm(order)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Middle Column: Target Date */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Target Delivery</span>
                    <span style={{ 
                      fontWeight: '800', 
                      fontSize: '0.92rem', 
                      color: isOverdue ? '#dc2626' : (isNearing ? '#b45309' : 'var(--text-primary)') 
                    }}>
                      {order.targetDeliveryDate}
                    </span>
                  </div>

                  {/* Middle-Right Column: Status */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {order.status === 'On Hold' ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center' }}>
                        ⏸️ ON HOLD
                      </span>
                    ) : isOverdue ? (
                      <span className="badge badge-warning" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center' }}>
                        ⚠️ OVERDUE
                      </span>
                    ) : isNearing ? (
                      <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center' }}>
                        ⏳ NEARING DEADLINE
                      </span>
                    ) : (
                      <span className="badge badge-us" style={{ fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center' }}>
                        {order.status || 'In Progress'}
                      </span>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div 
                    className="order-card-right-section"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {order.status !== 'Completed' && (
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5', borderRadius: '6px', fontWeight: '600' }}
                        onClick={(e) => handleMarkJobCompleted(order, e)}
                        title="Mark Job Completed (Requires Approved Production Record)"
                      >
                        <CheckCircle2 size={13} /> Complete
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '6px', fontWeight: '600' }}
                          onClick={(e) => handleToggleHoldOrder(order, e)}
                          title={order.status === 'On Hold' ? 'Resume Order' : 'Put Order On Hold'}
                        >
                          {order.status === 'On Hold' ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                          {order.status === 'On Hold' ? 'Resume' : 'Hold'}
                        </button>

                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#dc2626', borderColor: '#fecaca', borderRadius: '6px', fontWeight: '600' }}
                          onClick={(e) => handleDeleteOrderClick(order, e)}
                          title="Delete Order"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </>
                    )}
                  </div>
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
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ width: '40px' }}>Select</th>
                        <th>Material Description</th>
                        <th>Micron (µ)</th>
                        <th>Width (mm)</th>
                        <th>Gross Required (Kg)</th>
                        <th style={{ minWidth: '220px' }}>Stock Check & Reservation</th>
                        <th style={{ color: '#2563eb' }}>Balance Qty for PO (Kg)</th>
                        <th>Preferred Vendor</th>
                        <th>PO Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reqs.map(req => {
                        const isChecked = !!selectedReqIds[req.id];
                        const stockInfo = getStockCheckForReq(req);

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

                            {/* Stock Check & Reservation Status */}
                            <td>
                              {stockInfo.isFullyAvailable ? (
                                <div style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#15803d' }}>
                                  <strong>✅ {stockInfo.reservedKg} kg / {stockInfo.reqQty} kg in stock</strong>
                                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>
                                    Fully Reserved for Order (No PO Required)
                                  </div>
                                </div>
                              ) : stockInfo.isPartiallyAvailable ? (
                                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#047857' }}>
                                  <strong>🟢 {stockInfo.reservedKg} kg out of {stockInfo.reqQty} kg available</strong>
                                  <div style={{ fontSize: '0.7rem', color: '#065f46' }}>
                                    {stockInfo.reservedKg} kg Reserved for Order
                                  </div>
                                </div>
                              ) : (
                                <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#d48806' }}>
                                  <span>⚠️ 0 kg in stock (Full {stockInfo.reqQty} kg needed)</span>
                                </div>
                              )}
                            </td>

                            {/* Balance Quantity Only to Order */}
                            <td>
                              <span className="badge" style={{ background: stockInfo.balanceKg > 0 ? '#e0f2fe' : '#f1f5f9', color: stockInfo.balanceKg > 0 ? '#0369a1' : '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>
                                {stockInfo.balanceKg} kg
                              </span>
                            </td>

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
      <TablePagination
        currentPage={ordersPagination.currentPage}
        totalItems={ordersPagination.totalItems}
        pageSize={ordersPagination.pageSize}
        onPageChange={ordersPagination.setCurrentPage}
        onPageSizeChange={ordersPagination.setPageSize}
      />

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
                  {(vendors || []).map(v => (
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
                              ₹{((qty * rate) ?? 0).toLocaleString()}
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
