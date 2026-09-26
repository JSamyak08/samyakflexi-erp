import React, { useState, useEffect, useMemo } from 'react';
import SearchableSelect from './SearchableSelect';
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
  Clock,
  PackageCheck,
  PackageX,
  Filter,
  CheckSquare,
  Square,
  Box,
  ArrowUpRight
} from 'lucide-react';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import TablePagination, { usePagination } from './TablePagination';
import { pushSlugState } from '../utils/slugRouter';
import { calculateJobRawMaterials, isOrderOverdue, isOrderNearingDeadline, getOrderStatusInfo } from '../factoryStore';
import { saveOrderToSupabase, fetchSystemSetting, saveSystemSetting } from '../services/supabaseDataService';
import { getNextDocRefNumber } from '../services/settingsService';

export default function OrderManagement({ 
  urlParams = {},
  orders = [], 
  vendors = [], 
  inventory = [],
  jobMasters = [],
  cylinders = [],
  currentUser,
  productionRecords = [],
  onUpdateOrder, 
  onDeleteOrder,
  onUpdateCylinder,
  onAddGRN,
  onNavigateToPunching,
  onNavigateToProductionRecords
}) {
  // Helper: derive substrate structure from Job Master layers (authoritative source)
  const getSubstrateStructure = (order) => {
    if (order?.isCylinderOrder || order?.orderType === 'Rotogravure Cylinder' || order?.materialFormat === 'Rotogravure Cylinder') {
      return order.cylinderDetails?.description || order.structure || 'Rotogravure Cylinder Set';
    }
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

  // Helper: derive Material Form (Reel Form, Pouching Form, or Rotogravure Cylinder)
  const getMaterialForm = (order) => {
    if (!order) return 'Reel Form';
    if (order.isCylinderOrder || order.orderType === 'Rotogravure Cylinder' || order.materialFormat === 'Rotogravure Cylinder') {
      return 'Rotogravure Cylinder';
    }

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
    if (!order) return [];
    if (order.isCylinderOrder || order.orderType === 'Rotogravure Cylinder' || order.materialFormat === 'Rotogravure Cylinder' || (order.jobName || '').toLowerCase().includes('cylinder')) {
      return [];
    }

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

  // Handler to edit Raw Material Size Width, Micron, Quantity or Preferred Vendor for any itemized requirement
  const handleUpdateReqField = (orderId, reqId, field, value) => {
    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;

    const currentReqs = getOrderMaterialRequirements(ord);
    const updatedReqs = currentReqs.map(r => {
      if (r.id !== reqId) return r;

      let updatedWidth = r.widthMm;
      let updatedMicron = r.micron;
      let updatedQty = r.qtyKg;

      if (field === 'widthMm') {
        const newWidth = parseFloat(value);
        const oldWidth = parseFloat(r.widthMm);
        updatedWidth = isNaN(newWidth) ? value : newWidth;

        // Recalculate weight proportionally if width changed
        if (!isNaN(newWidth) && newWidth > 0 && !isNaN(oldWidth) && oldWidth > 0) {
          const ratio = newWidth / oldWidth;
          updatedQty = Math.round((r.qtyKg * ratio) * 10) / 10;
        }
      } else if (field === 'micron') {
        const newMicron = parseFloat(value);
        const oldMicron = parseFloat(r.micron);
        updatedMicron = isNaN(newMicron) ? value : newMicron;

        if (!isNaN(newMicron) && newMicron > 0 && !isNaN(oldMicron) && oldMicron > 0) {
          const ratio = newMicron / oldMicron;
          updatedQty = Math.round((r.qtyKg * ratio) * 10) / 10;
        }
      } else if (field === 'qtyKg') {
        const newQty = parseFloat(value);
        updatedQty = isNaN(newQty) ? value : newQty;
      } else if (field === 'preferredVendor') {
        return { ...r, preferredVendor: value };
      }

      return {
        ...r,
        widthMm: updatedWidth,
        micron: updatedMicron,
        qtyKg: updatedQty
      };
    });

    const updatedOrder = {
      ...ord,
      materialRequirements: updatedReqs,
      rawMaterialRequirements: updatedReqs
    };

    if (onUpdateOrder) {
      onUpdateOrder(updatedOrder);
    } else {
      saveOrderToSupabase(updatedOrder).catch(err => console.error('[ORDERS][DB WRITE] Requirement update failed:', err));
    }
  };

  const isAdmin = currentUser?.role === 'Admin';
  
  // Navigation SubTab: 'orders' | 'requirements'
  const [activeSubTab, setActiveSubTab] = useState(urlParams?.subtab === 'requirements' ? 'requirements' : 'orders');

  // Search and Filter states for Orders View
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  // Search and Filter states for Consolidated Requirements View
  const [reqSearchTerm, setReqSearchTerm] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState('SHORTAGE'); // 'SHORTAGE' | 'ALL' | 'PENDING_PO' | 'IN_STOCK' | 'PO_ISSUED'
  const [reqVendorFilter, setReqVendorFilter] = useState('ALL');
  const [reqCategoryFilter, setReqCategoryFilter] = useState('ALL'); // 'ALL' | 'Film' | 'Ink' | 'Adhesive'

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

  // Aggregated Consolidated Material Requirements List across all active orders
  const allMaterialRequirements = useMemo(() => {
    const list = [];
    (orders || []).forEach(order => {
      // Exclude completed orders from active requirement replenishment
      if (order.status === 'Completed') return;

      const reqs = getOrderMaterialRequirements(order);
      const statusInfo = getOrderStatusInfo(order);

      reqs.forEach(req => {
        const stockInfo = getStockCheckForReq(req);
        const filmLow = (req.filmType || '').toLowerCase();
        let category = 'Film';
        if (filmLow.includes('ink')) category = 'Ink';
        else if (filmLow.includes('adhesive')) category = 'Adhesive';

        list.push({
          ...req,
          orderId: order.id,
          order: order,
          jobName: order.jobName || 'Untitled Job',
          clientName: order.clientName || 'General Client',
          orderQtyKg: order.orderQtyKg || 0,
          targetDeliveryDate: order.targetDeliveryDate || order.deliveryDate || '—',
          orderStatus: order.status || 'Scheduled',
          isOverdue: statusInfo.isOverdue,
          isNearingDeadline: statusInfo.isNearingDeadline,
          daysRemaining: statusInfo.daysRemaining,
          structure: getSubstrateStructure(order),
          category,
          stockInfo,
          // True if shortage / balance to order and PO not yet issued
          isShortage: stockInfo.balanceKg > 0 && !req.poIssued
        });
      });
    });
    return list;
  }, [orders, jobMasters, inventory]);

  // Summary Metrics for Requirements
  const reqMetrics = useMemo(() => {
    const totalLines = allMaterialRequirements.length;
    const totalGrossKg = allMaterialRequirements.reduce((sum, r) => sum + (parseFloat(r.qtyKg) || 0), 0);

    const shortageItems = allMaterialRequirements.filter(r => r.isShortage);
    const shortageLines = shortageItems.length;
    const shortageBalanceKg = shortageItems.reduce((sum, r) => sum + (parseFloat(r.stockInfo.balanceKg) || 0), 0);

    const inStockItems = allMaterialRequirements.filter(r => r.stockInfo.isFullyAvailable);
    const inStockLines = inStockItems.length;
    const inStockKg = inStockItems.reduce((sum, r) => sum + (parseFloat(r.stockInfo.reservedKg) || 0), 0);

    const poIssuedItems = allMaterialRequirements.filter(r => r.poIssued);
    const poIssuedLines = poIssuedItems.length;
    const poIssuedKg = poIssuedItems.reduce((sum, r) => sum + (parseFloat(r.qtyKg) || 0), 0);

    return {
      totalLines,
      totalGrossKg,
      shortageLines,
      shortageBalanceKg,
      inStockLines,
      inStockKg,
      poIssuedLines,
      poIssuedKg
    };
  }, [allMaterialRequirements]);

  // Filtered Requirements List
  const filteredRequirements = useMemo(() => {
    return allMaterialRequirements.filter(r => {
      // Search term filter
      if (reqSearchTerm) {
        const q = reqSearchTerm.toLowerCase();
        const matches = 
          (r.orderId || '').toLowerCase().includes(q) ||
          (r.jobName || '').toLowerCase().includes(q) ||
          (r.clientName || '').toLowerCase().includes(q) ||
          (r.filmType || '').toLowerCase().includes(q) ||
          String(r.micron || '').toLowerCase().includes(q) ||
          String(r.widthMm || '').toLowerCase().includes(q) ||
          (r.preferredVendor || '').toLowerCase().includes(q) ||
          (r.poNumber || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Status filter
      if (reqStatusFilter === 'SHORTAGE' && !r.isShortage) return false;
      if (reqStatusFilter === 'PENDING_PO' && r.poIssued) return false;
      if (reqStatusFilter === 'IN_STOCK' && !r.stockInfo.isFullyAvailable) return false;
      if (reqStatusFilter === 'PO_ISSUED' && !r.poIssued) return false;

      // Vendor filter
      if (reqVendorFilter !== 'ALL' && r.preferredVendor !== reqVendorFilter) return false;

      // Category filter
      if (reqCategoryFilter !== 'ALL' && r.category !== reqCategoryFilter) return false;

      return true;
    });
  }, [allMaterialRequirements, reqSearchTerm, reqStatusFilter, reqVendorFilter, reqCategoryFilter]);

  const requirementsPagination = usePagination(filteredRequirements, 50);

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

  // Cache for generated PO documents via Supabase
  const [issuedPoStore, setIssuedPoStore] = useState({});

  useEffect(() => {
    let active = true;
    async function loadPoStore() {
      try {
        const remote = await fetchSystemSetting('samyak_erp_issued_pos');
        if (active && remote && typeof remote === 'object') {
          setIssuedPoStore(remote);
        }
      } catch (e) {}
    }
    loadPoStore();
    return () => { active = false; };
  }, []);

  const saveIssuedPoStore = async (newStore) => {
    setIssuedPoStore(newStore);
    try {
      await saveSystemSetting('samyak_erp_issued_pos', newStore);
    } catch (e) {
      console.warn("Failed to save issued PO store", e);
    }
  };

  // Generated PO PDF preview state
  const [activePoPdfData, setActivePoPdfData] = useState(null);

  const toggleSelectReq = (reqId) => {
    setSelectedReqIds(prev => {
      const copy = { ...prev };
      if (copy[reqId]) {
        delete copy[reqId];
      } else {
        copy[reqId] = true;
      }
      return copy;
    });
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

  // Bulk select helpers for the Consolidated Requirements view
  const handleSelectAllFilteredReqs = () => {
    const allSelected = filteredRequirements.length > 0 && filteredRequirements.every(r => selectedReqIds[r.id]);
    const newMap = { ...selectedReqIds };
    filteredRequirements.forEach(r => {
      if (allSelected) {
        delete newMap[r.id];
      } else {
        newMap[r.id] = true;
      }
    });
    setSelectedReqIds(newMap);
  };

  const handleSelectAllPendingShortageReqs = () => {
    const newMap = { ...selectedReqIds };
    allMaterialRequirements.forEach(r => {
      if (r.isShortage) {
        newMap[r.id] = true;
      }
    });
    setSelectedReqIds(newMap);
  };

  const handleClearAllSelectedReqs = () => {
    setSelectedReqIds({});
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
        qtyKg: stockInfo.balanceKg > 0 ? stockInfo.balanceKg : req.qtyKg, // Defaults to shortage balance or gross qty
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

  const handleIssueEngraverPo = (order, e) => {
    if (e) e.stopPropagation();
    const engraverName = order.engraverName || order.cylinderDetails?.engraverName || 'Jindal Engravers, Mathura';
    let vendorObj = (vendors || []).find(v => 
      (v.companyName || v.name || '').toLowerCase().includes(engraverName.toLowerCase()) ||
      engraverName.toLowerCase().includes((v.companyName || v.name || '').toLowerCase())
    );
    if (!vendorObj) {
      vendorObj = vendors.find(v => (v.category || '').toLowerCase().includes('cylinder') || (v.category || '').toLowerCase().includes('engrav')) || vendors[0] || {
        companyName: engraverName,
        contactPerson: 'Engraver Manager',
        phone: '9826012345',
        gstin: '09AAABJ1234F1Z1',
        address: 'Industrial Area, Mathura / Indore'
      };
    }

    const poNo = `PO-CYL-2026-${Math.floor(100 + Math.random() * 900)}`;
    const rateVal = parseFloat(order.cylinderDetails?.rate || order.sellingPricePerKg) || 35000;
    const qtyVal = parseFloat(order.cylinderDetails?.quantity || order.orderQtyKg) || 1;
    const totalVal = rateVal * qtyVal;

    const poItems = [{
      id: `CYL-PO-${order.id}`,
      orderId: order.id,
      itemDesc: `Rotogravure Cylinder Engraving Set — ${order.jobName}`,
      spec: `SKU: ${order.cylinderDetails?.sku || 'CYL-001'} | Colors: ${order.cylinderDetails?.colorsCount || 8} Colors | Specs: ${order.cylinderDetails?.description || order.structure || 'Rotogravure Cylinder Set'}`,
      qtyKg: qtyVal,
      unit: 'Set',
      rate: rateVal,
      amount: totalVal
    }];

    const poData = {
      poNumber: poNo,
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      vendor: vendorObj,
      items: poItems,
      deliveryDate: order.targetDeliveryDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      terms: '100% Advance along with Purchase Order',
      remarks: 'Engraved cylinders must strictly conform to electronic proof & job specifications. Dynamic balancing test report & proof print required upon delivery.'
    };

    saveIssuedPoStore({
      ...issuedPoStore,
      [poNo]: poData
    });

    // Update order status
    onUpdateOrder({
      ...order,
      poIssued: true,
      poNumber: poNo,
      engraverPoNo: poNo,
      status: 'Under Engraving'
    });

    // Update linked cylinder record in database if available
    if (cylinders && cylinders.length > 0) {
      const targetSku = (order.cylinderDetails?.sku || '').trim().toLowerCase();
      const targetJob = (order.jobName || '').trim().toLowerCase();
      const matchedCyl = cylinders.find(c => 
        (targetSku && c.sku && c.sku.trim().toLowerCase() === targetSku) ||
        (targetJob && c.jobName && c.jobName.trim().toLowerCase() === targetJob)
      );
      if (matchedCyl && onUpdateCylinder) {
        onUpdateCylinder({
          ...matchedCyl,
          poIssued: true,
          poNumber: poNo,
          status: 'Under Engraving'
        });
      }
    }

    setActivePoPdfData(poData);
    alert(`✅ Purchase Order ${poNo} issued successfully to Engraver "${vendorObj.companyName || vendorObj.name}"!\nOpening PO PDF preview now.`);
  };

  const handleReceiveCylinderInward = (order, e) => {
    if (e) e.stopPropagation();
    const engraverName = order.engraverName || order.cylinderDetails?.engraverName || 'Jindal Engravers, Mathura';
    const grnNo = getNextDocRefNumber('grn');
    const qtyVal = parseFloat(order.cylinderDetails?.quantity || order.orderQtyKg) || 1;
    const rateVal = parseFloat(order.cylinderDetails?.rate || order.sellingPricePerKg) || 35000;

    const newGRN = {
      grnNo: grnNo,
      poNumber: order.poNumber || `PO-CYL-${order.id}`,
      vendorName: engraverName,
      invoiceNo: `INV-CYL-${Math.floor(1000 + Math.random() * 9000)}`,
      receivedDate: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      category: 'Rotogravure Cylinders',
      itemName: order.jobName || 'Rotogravure Cylinder Set',
      cylinderSku: order.cylinderDetails?.sku || `CYL-${order.id}`,
      unit: 'Set',
      packagingType: 'Cylinder Box',
      rollsReceived: qtyVal,
      netWeightKg: qtyVal,
      grossWeightKg: qtyVal,
      tareWeightKg: 0,
      itemsBreakdown: [{
        unitNo: 1,
        grossWeightKg: qtyVal,
        tareWeightKg: 0,
        netWeightKg: qtyVal,
        lengthMeters: 0,
        vendorRollNo: order.cylinderDetails?.sku || 'CYL-001'
      }],
      purchaseRatePerKg: rateVal,
      purchaseRate: rateVal,
      unitPrice: rateVal,
      batchNo: `GRN-CYL-${grnNo}`,
      status: 'Approved (Stock Added)',
      qcNotes: 'Cylinder physical inspection, chrome plating thickness, and proof print approved.',
      inspectedBy: currentUser?.name || 'QA Inspector',
      storeManager: 'Store Mgr Dilip Joshi'
    };

    if (onAddGRN) {
      onAddGRN(newGRN);
    }

    // Update order status
    onUpdateOrder({
      ...order,
      status: 'Completed',
      inwardGrnNo: grnNo,
      cylinderReceived: true
    });

    // Update linked cylinder status in cylinders table to 'Active In-Use'
    if (cylinders && cylinders.length > 0) {
      const targetSku = (order.cylinderDetails?.sku || '').trim().toLowerCase();
      const targetJob = (order.jobName || '').trim().toLowerCase();
      const matchedCyl = cylinders.find(c => 
        (targetSku && c.sku && c.sku.trim().toLowerCase() === targetSku) ||
        (targetJob && c.jobName && c.jobName.trim().toLowerCase() === targetJob)
      );
      if (matchedCyl && onUpdateCylinder) {
        onUpdateCylinder({
          ...matchedCyl,
          status: 'Active In-Use',
          inwardGrnNo: grnNo,
          receivedDate: new Date().toISOString().split('T')[0]
        });
      }
    }

    alert(`✅ Cylinder Set "${order.jobName}" received in factory!\nIssued Inward GRN ${grnNo}.\nStatus updated to "Active In-Use" and Order marked Completed.`);
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
      const reqs = getOrderMaterialRequirements(ord);
      reqs.forEach(r => {
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

    saveIssuedPoStore({
      ...issuedPoStore,
      [poNo]: poData
    });

    // Update PO status in orders state & database
    orders.forEach(order => {
      let orderUpdated = false;
      const existingReqs = getOrderMaterialRequirements(order);
      const updatedReqs = existingReqs.map(r => {
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
          rawMaterialRequirements: updatedReqs,
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
          vendors={vendors}
          onClose={() => setActivePoPdfData(null)} 
        />
      )}

      <div className="hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top Banner */}
        <div className="glass-panel" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingBag size={22} style={{ color: 'var(--primary-brand)' }} /> Order Management & Vendor PO Issuance
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                Manage manufacturing orders, track delays, and consolidate raw material shortages across orders to issue bulk Purchase Orders to vendors.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={onNavigateToPunching}>
                <Plus size={16} /> Punch New Order
              </button>
              
              <button 
                className={`btn-primary ${selectedRequirements.length > 0 ? '' : 'btn-disabled'}`}
                onClick={handleOpenPoModal}
                title={selectedRequirements.length > 0 ? "Issue Consolidated Purchase Order for selected material requirements" : "Select at least 1 material requirement line first"}
              >
                <FileText size={16} /> Issue Vendor PO ({selectedRequirements.length} Lines Selected)
              </button>
            </div>
          </div>
        </div>

        {/* SUB-TAB NAVIGATION BAR */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          background: 'rgba(241, 245, 249, 0.8)', 
          padding: '6px', 
          borderRadius: '10px', 
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap'
        }}>
          <button
            type="button"
            className={`btn-secondary ${activeSubTab === 'orders' ? 'active' : ''}`}
            style={{
              flex: '1',
              minWidth: '220px',
              padding: '10px 18px',
              fontSize: '0.88rem',
              fontWeight: activeSubTab === 'orders' ? '700' : '600',
              background: activeSubTab === 'orders' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'orders' ? 'var(--primary-brand)' : 'var(--text-secondary)',
              border: activeSubTab === 'orders' ? '1px solid #cbd5e1' : '1px solid transparent',
              borderRadius: '8px',
              boxShadow: activeSubTab === 'orders' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
            onClick={() => setActiveSubTab('orders')}
          >
            <ShoppingBag size={18} />
            <span>Orders & Jobs Breakdown</span>
            <span style={{
              background: activeSubTab === 'orders' ? '#eff6ff' : '#e2e8f0',
              color: activeSubTab === 'orders' ? '#1d4ed8' : '#475569',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '800'
            }}>
              {(orders || []).length} Orders
            </span>
            {delayedOrdersCount > 0 && (
              <span style={{
                background: '#fee2e2',
                color: '#dc2626',
                padding: '2px 7px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {delayedOrdersCount} Overdue
              </span>
            )}
          </button>

          <button
            type="button"
            className={`btn-secondary ${activeSubTab === 'requirements' ? 'active' : ''}`}
            style={{
              flex: '1',
              minWidth: '260px',
              padding: '10px 18px',
              fontSize: '0.88rem',
              fontWeight: activeSubTab === 'requirements' ? '700' : '600',
              background: activeSubTab === 'requirements' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'requirements' ? 'var(--primary-brand)' : 'var(--text-secondary)',
              border: activeSubTab === 'requirements' ? '1px solid #cbd5e1' : '1px solid transparent',
              borderRadius: '8px',
              boxShadow: activeSubTab === 'requirements' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
            onClick={() => setActiveSubTab('requirements')}
          >
            <Layers size={18} />
            <span>Consolidated Raw Material Requirements</span>
            {reqMetrics.shortageLines > 0 ? (
              <span style={{
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fca5a5',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '800'
              }}>
                {reqMetrics.shortageLines} Pending / Shortage
              </span>
            ) : (
              <span style={{
                background: '#dcfce7',
                color: '#15803d',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '800'
              }}>
                All Stocked
              </span>
            )}
            {selectedRequirements.length > 0 && (
              <span style={{
                background: '#3b82f6',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '800'
              }}>
                {selectedRequirements.length} Selected
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: ALL ORDERS & JOB BREAKDOWN */}
        {activeSubTab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                <SearchableSelect className="form-control" style={{ width: '240px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Orders ({(orders || []).length})</option>
                  <option value="DELAYED">⚠️ Overdue / Delayed ({delayedOrdersCount})</option>
                  <option value="NEARING_DEADLINE">⏳ Nearing Deadline (≤4 Days) ({nearingDeadlineCount})</option>
                  <option value="ON_HOLD">⏸️ On Hold Orders</option>
                  <option value="PENDING_PO">Pending PO Issuance</option>
                </SearchableSelect>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Vendor:</span>
                <SearchableSelect className="form-control" style={{ width: '180px' }} value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
                  <option value="ALL">All Preferred Vendors</option>
                  {(vendors || []).map(v => (
                    <option key={v.id} value={v.companyName}>{v.companyName}</option>
                  ))}
                </SearchableSelect>
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
                        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>

                        {/* Left Column: Job Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0', flex: '1 1 280px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span className="order-id-badge" style={{ 
                              background: isOverdue ? 'rgba(239, 68, 68, 0.15)' : (isNearing ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent-light)'),
                              color: isOverdue ? '#dc2626' : (isNearing ? '#b45309' : 'var(--primary-brand)'),
                              border: isOverdue ? '1px solid rgba(239, 68, 68, 0.25)' : (isNearing ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid var(--border-color)')
                            }}>
                              {order.id}
                            </span>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: '0', wordBreak: 'break-word', color: 'var(--text-primary)' }} title={order.jobName}>
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

                          {(order.orderComments || order.comments || order.notes || order.jobDetails?.orderComments || order.jobDetails?.comments) && (
                            <div style={{ marginTop: '4px', fontSize: '0.78rem', background: '#fffbebf0', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                              <span>💬 <strong>Comment:</strong> {order.orderComments || order.comments || order.notes || order.jobDetails?.orderComments || order.jobDetails?.comments}</span>
                            </div>
                          )}
                        </div>

                        {/* Right Container: Target Date, Status & Actions */}
                        <div className="order-card-meta-actions">
                          {/* Target Date */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '95px' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600', whiteSpace: 'nowrap' }}>Target Delivery</span>
                            <span style={{ 
                              fontWeight: '800', 
                              fontSize: '0.92rem', 
                              whiteSpace: 'nowrap',
                              color: isOverdue ? '#dc2626' : (isNearing ? '#b45309' : 'var(--text-primary)') 
                            }}>
                              {order.targetDeliveryDate}
                            </span>
                          </div>

                          {/* Status */}
                          <div style={{ display: 'flex', alignItems: 'center', minWidth: '95px' }}>
                            {order.status === 'On Hold' ? (
                              <span className="badge badge-warning" style={{ fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                ⏸️ ON HOLD
                              </span>
                            ) : isOverdue ? (
                              <span className="badge badge-warning" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                ⚠️ OVERDUE
                              </span>
                            ) : isNearing ? (
                              <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                ⏳ NEARING DEADLINE
                              </span>
                            ) : (
                              <span className="badge badge-us" style={{ fontSize: '0.75rem', padding: '4px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {order.status || 'In Progress'}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div 
                            className="order-card-right-section"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={e => e.stopPropagation()}
                          >
                            {order.status !== 'Completed' && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5', borderRadius: '6px', fontWeight: '600', whiteSpace: 'nowrap' }}
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
                                  style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '6px', fontWeight: '600', whiteSpace: 'nowrap' }}
                                  onClick={(e) => handleToggleHoldOrder(order, e)}
                                  title={order.status === 'On Hold' ? 'Resume Order' : 'Put Order On Hold'}
                                >
                                  {order.status === 'On Hold' ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                                  {order.status === 'On Hold' ? 'Resume' : 'Hold'}
                                </button>

                                <button 
                                  className="btn-secondary" 
                                  style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#dc2626', borderColor: '#fecaca', borderRadius: '6px', fontWeight: '600', whiteSpace: 'nowrap' }}
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
                    </div>

                    {/* Expandable Drawer: Itemized Raw Material Breakdown or Cylinder Engraving Specs */}
                    {isExpanded && (
                      <div style={{ padding: '16px 20px', background: '#ffffff', borderTop: '1px solid var(--border-color)' }}>
                        {order.isCylinderOrder || order.orderType === 'Rotogravure Cylinder' || order.materialFormat === 'Rotogravure Cylinder' ? (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={18} style={{ color: '#0284c7' }} />
                                <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                  🔩 ROTOGRAVURE CYLINDER ENGRAVING & PO SPECIFICATIONS
                                </h4>
                                <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.72rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                                  Engraver Work Order
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {order.poIssued ? (
                                  <button 
                                    type="button" 
                                    className="btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '700', color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}
                                    onClick={(e) => handleViewPoPdf(order.poNumber || order.engraverPoNo, e)}
                                  >
                                    <FileText size={14} /> View Engraver PO ({order.poNumber || order.engraverPoNo})
                                  </button>
                                ) : (
                                  <button 
                                    type="button" 
                                    className="btn-primary"
                                    style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: '700', background: '#0284c7' }}
                                    onClick={(e) => handleIssueEngraverPo(order, e)}
                                  >
                                    <ShoppingBag size={14} /> Issue Purchase Order to Engraver
                                  </button>
                                )}

                                {order.status !== 'Completed' && (
                                  <button 
                                    type="button" 
                                    className="btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '700', color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}
                                    onClick={(e) => handleReceiveCylinderInward(order, e)}
                                  >
                                    <PackageCheck size={14} /> Inward GRN / Receive Cylinder
                                  </button>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Cylinder Set SKU</span>
                                <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{order.cylinderDetails?.sku || order.jobName}</strong>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Assigned Engraver Vendor</span>
                                <strong style={{ fontSize: '0.9rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Building2 size={14} /> {order.engraverName || order.cylinderDetails?.engraverName || 'Jindal Engravers, Mathura'}
                                </strong>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Colors Count</span>
                                <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{order.cylinderDetails?.colorsCount || 8} Colors Set</strong>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Quoted Rate / Cost</span>
                                <strong style={{ fontSize: '0.9rem', color: '#059669' }}>
                                  ₹ {(order.cylinderDetails?.totalAmount || (order.sellingPricePerKg * (order.orderQtyKg || 1)) || 35000).toLocaleString()}
                                </strong>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Engraving Status</span>
                                <span className="badge" style={{ background: order.status === 'Completed' ? '#dcfce7' : '#e0f2fe', color: order.status === 'Completed' ? '#15803d' : '#0369a1', fontWeight: '800', fontSize: '0.78rem' }}>
                                  {order.status === 'Completed' ? '✅ Received In Factory (Active)' : `⚙️ ${order.status || 'Under Engraving'}`}
                                </span>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Purchase Order (PO)</span>
                                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: order.poIssued ? '#047857' : '#b45309' }}>
                                  {order.poIssued ? `✅ Issued: ${order.poNumber || order.engraverPoNo}` : '⚠️ Pending PO Issuance'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
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

                            <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#ffffff' }}>
                              <table className="data-table" style={{ fontSize: '0.82rem', minWidth: '980px', width: '100%', margin: 0 }}>
                                <thead>
                                  <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ width: '40px', whiteSpace: 'nowrap', textAlign: 'center' }}>Select</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '130px' }}>Material Description</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '85px' }}>Micron (µ)</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '125px' }}>Width (mm)</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '125px' }}>Gross Required (Kg)</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '220px' }}>Stock Check & Reservation</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '130px', color: '#2563eb' }}>Balance Qty for PO (Kg)</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '170px' }}>Preferred Vendor</th>
                                    <th style={{ whiteSpace: 'nowrap', minWidth: '130px' }}>PO Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {reqs.map(req => {
                                    const isChecked = !!selectedReqIds[req.id];
                                    const stockInfo = getStockCheckForReq(req);

                                    return (
                                      <tr key={req.id} style={{ background: isChecked ? '#eff6ff' : 'transparent' }}>
                                        <td style={{ textAlign: 'center' }}>
                                          <input 
                                            type="checkbox"
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            checked={isChecked}
                                            onChange={() => toggleSelectReq(req.id)}
                                          />
                                        </td>
                                        <td style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>{req.filmType}</td>
                                        <td>
                                          {req.widthMm !== '-' ? (
                                            <input 
                                              type="number"
                                              className="form-control"
                                              style={{ width: '60px', padding: '2px 4px', fontSize: '0.8rem', textAlign: 'center' }}
                                              value={req.micron}
                                              title="Edit Micron (µ)"
                                              onChange={(e) => handleUpdateReqField(order.id, req.id, 'micron', e.target.value)}
                                            />
                                          ) : (
                                            <span>{req.micron}</span>
                                          )}
                                        </td>
                                        <td>
                                          {req.widthMm !== '-' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                              <input 
                                                type="number"
                                                className="form-control"
                                                style={{ 
                                                  width: '85px', 
                                                  padding: '3px 6px', 
                                                  fontSize: '0.82rem', 
                                                  fontWeight: '700', 
                                                  textAlign: 'center', 
                                                  borderColor: '#3b82f6', 
                                                  background: '#eff6ff',
                                                  borderRadius: '6px'
                                                }}
                                                value={req.widthMm}
                                                title="Edit Raw Material Size / Width (mm). Weight will recalculate proportionally."
                                                onChange={(e) => handleUpdateReqField(order.id, req.id, 'widthMm', e.target.value)}
                                              />
                                              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>mm</span>
                                            </div>
                                          ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                          )}
                                        </td>
                                        <td className="bold-val">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <input 
                                              type="number"
                                              step="0.1"
                                              className="form-control"
                                              style={{ width: '75px', padding: '3px 6px', fontSize: '0.82rem', fontWeight: '700', textAlign: 'right', borderRadius: '6px' }}
                                              value={req.qtyKg}
                                              title="Edit Gross Required Weight (kg)"
                                              onChange={(e) => handleUpdateReqField(order.id, req.id, 'qtyKg', e.target.value)}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>kg</span>
                                          </div>
                                        </td>

                                        {/* Stock Check & Reservation Status */}
                                        <td>
                                          {stockInfo.isFullyAvailable ? (
                                            <div style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#15803d', whiteSpace: 'nowrap' }}>
                                              <strong>✅ {stockInfo.reservedKg} kg / {stockInfo.reqQty} kg in stock</strong>
                                              <div style={{ fontSize: '0.7rem', color: '#166534' }}>
                                                Fully Reserved for Order (No PO Required)
                                              </div>
                                            </div>
                                          ) : stockInfo.isPartiallyAvailable ? (
                                            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#047857', whiteSpace: 'nowrap' }}>
                                              <strong>🟢 {stockInfo.reservedKg} kg out of {stockInfo.reqQty} kg available</strong>
                                              <div style={{ fontSize: '0.7rem', color: '#065f46' }}>
                                                {stockInfo.reservedKg} kg Reserved for Order
                                              </div>
                                            </div>
                                          ) : (
                                            <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#d48806', whiteSpace: 'nowrap' }}>
                                              <span>⚠️ 0 kg in stock (Full {stockInfo.reqQty} kg needed)</span>
                                            </div>
                                          )}
                                        </td>

                                        {/* Balance Quantity Only to Order */}
                                        <td>
                                          <span className="badge" style={{ background: stockInfo.balanceKg > 0 ? '#e0f2fe' : '#f1f5f9', color: stockInfo.balanceKg > 0 ? '#0369a1' : '#64748b', fontWeight: '800', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                            {stockInfo.balanceKg} kg
                                          </span>
                                        </td>

                                        <td style={{ color: 'var(--text-secondary)' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Building2 size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            <select
                                              className="form-control"
                                              style={{ fontSize: '0.78rem', padding: '2px 4px', width: '140px', height: '28px' }}
                                              value={req.preferredVendor || ''}
                                              onChange={(e) => handleUpdateReqField(order.id, req.id, 'preferredVendor', e.target.value)}
                                            >
                                              <option value={req.preferredVendor}>{req.preferredVendor}</option>
                                              {(vendors || []).map(v => (
                                                (v.companyName || v.name) !== req.preferredVendor && (
                                                  <option key={v.id || (v.companyName || v.name)} value={v.companyName || v.name}>
                                                    {v.companyName || v.name}
                                                  </option>
                                                )
                                              ))}
                                            </select>
                                          </div>
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
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap'
                                              }}
                                              onClick={(e) => handleViewPoPdf(req.poNumber || order.poNumber || 'PO-2026-101', e)}
                                              title="Click to View, Print & Download Purchase Order PDF"
                                            >
                                              <FileText size={13} /> {req.poNumber || order.poNumber || 'PO-2026-101'}
                                            </button>
                                          ) : (
                                            <span className="badge badge-warning" style={{ whiteSpace: 'nowrap' }}>Pending PO</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
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
          </div>
        )}

        {/* TAB 2: CONSOLIDATED RAW MATERIAL REQUIREMENTS VIEW */}
        {activeSubTab === 'requirements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary-brand)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    Total Requirements
                  </span>
                  <Layers size={18} style={{ color: 'var(--primary-brand)' }} />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: '800', marginTop: '6px', color: 'var(--text-primary)' }}>
                  {reqMetrics.totalGrossKg.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>kg</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Across {reqMetrics.totalLines} material lines in active orders
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid #ef4444', background: reqMetrics.shortageLines > 0 ? '#fffbfb' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#b91c1c', letterSpacing: '0.04em' }}>
                    Pending PO / Shortage
                  </span>
                  <PackageX size={18} style={{ color: '#ef4444' }} />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: '800', marginTop: '6px', color: '#dc2626' }}>
                  {reqMetrics.shortageBalanceKg.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>kg</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#991b1b', marginTop: '4px', fontWeight: '600' }}>
                  {reqMetrics.shortageLines} lines requiring Purchase Orders
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#047857', letterSpacing: '0.04em' }}>
                    In-Stock & Reserved
                  </span>
                  <PackageCheck size={18} style={{ color: '#10b981' }} />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: '800', marginTop: '6px', color: '#059669' }}>
                  {reqMetrics.inStockKg.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>kg</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {reqMetrics.inStockLines} lines covered by inventory stock
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#1d4ed8', letterSpacing: '0.04em' }}>
                    POs Issued to Vendors
                  </span>
                  <FileText size={18} style={{ color: '#3b82f6' }} />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: '800', marginTop: '6px', color: '#2563eb' }}>
                  {reqMetrics.poIssuedKg.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>kg</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {reqMetrics.poIssuedLines} lines with issued vendor POs
                </div>
              </div>
            </div>

            {/* Filter Toolbar for Requirements */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
                <input 
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '36px' }}
                  placeholder="Search order ID, job name, client, film grade, vendor, or PO#..."
                  value={reqSearchTerm}
                  onChange={e => setReqSearchTerm(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600' }}>Status:</span>
                <SearchableSelect 
                  className="form-control" 
                  style={{ width: '220px', fontWeight: reqStatusFilter === 'SHORTAGE' ? '700' : '500' }} 
                  value={reqStatusFilter} 
                  onChange={e => setReqStatusFilter(e.target.value)}
                >
                  <option value="SHORTAGE">⚠️ Pending PO / Shortage ({reqMetrics.shortageLines})</option>
                  <option value="ALL">All Material Lines ({reqMetrics.totalLines})</option>
                  <option value="PENDING_PO">Pending PO (Any stock) ({allMaterialRequirements.filter(r => !r.poIssued).length})</option>
                  <option value="IN_STOCK">✅ Fully In-Stock ({reqMetrics.inStockLines})</option>
                  <option value="PO_ISSUED">📄 PO Already Issued ({reqMetrics.poIssuedLines})</option>
                </SearchableSelect>
              </div>

              {/* Vendor Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600' }}>Vendor:</span>
                <SearchableSelect 
                  className="form-control" 
                  style={{ width: '180px' }} 
                  value={reqVendorFilter} 
                  onChange={e => setReqVendorFilter(e.target.value)}
                >
                  <option value="ALL">All Vendors</option>
                  {Array.from(new Set(allMaterialRequirements.map(r => r.preferredVendor).filter(Boolean))).map(vName => (
                    <option key={vName} value={vName}>{vName}</option>
                  ))}
                </SearchableSelect>
              </div>

              {/* Category Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600' }}>Category:</span>
                <select 
                  className="form-control" 
                  style={{ width: '140px' }} 
                  value={reqCategoryFilter} 
                  onChange={e => setReqCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Items</option>
                  <option value="Film">Film / Substrates</option>
                  <option value="Ink">Printing Inks</option>
                  <option value="Adhesive">Adhesives</option>
                </select>
              </div>

              {/* Bulk Selection Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ fontSize: '0.78rem', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={handleSelectAllFilteredReqs}
                >
                  <CheckSquare size={14} /> Toggle All Filtered ({filteredRequirements.length})
                </button>
                {reqMetrics.shortageLines > 0 && (
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', borderColor: '#fca5a5' }}
                    onClick={handleSelectAllPendingShortageReqs}
                  >
                    <AlertTriangle size={14} /> Select All Pending Shortage
                  </button>
                )}
                {selectedRequirements.length > 0 && (
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 10px', color: '#64748b' }}
                    onClick={handleClearAllSelectedReqs}
                  >
                    Clear ({selectedRequirements.length})
                  </button>
                )}
              </div>
            </div>

            {/* Consolidated Material Requirements Table */}
            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.82rem', width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ width: '44px', textAlign: 'center' }}>
                        <input 
                          type="checkbox"
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          checked={filteredRequirements.length > 0 && filteredRequirements.every(r => selectedReqIds[r.id])}
                          onChange={handleSelectAllFilteredReqs}
                          title="Select / Deselect all visible filtered items"
                        />
                      </th>
                      <th>Order ID & Client</th>
                      <th>Job Name & Structure</th>
                      <th>Material Specification</th>
                      <th>Gauge / Width</th>
                      <th>Gross Req. (Kg)</th>
                      <th style={{ minWidth: '210px' }}>Inventory Stock & Reservation</th>
                      <th style={{ color: '#2563eb' }}>Balance for PO</th>
                      <th>Preferred Vendor</th>
                      <th>Target Dispatch</th>
                      <th>PO Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirementsPagination.paginatedItems.length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          <Layers size={32} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
                          <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>No Raw Material Requirements Found</div>
                          <p style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>Try adjusting your search terms or filter settings above.</p>
                        </td>
                      </tr>
                    ) : (
                      requirementsPagination.paginatedItems.map(req => {
                        const isChecked = !!selectedReqIds[req.id];
                        const stockInfo = req.stockInfo;

                        return (
                          <tr 
                            key={req.id} 
                            style={{ 
                              background: isChecked ? '#eff6ff' : (req.isShortage ? '#fffdf7' : 'transparent'),
                              transition: 'background 0.15s ease'
                            }}
                          >
                            {/* Checkbox */}
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox"
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                checked={isChecked}
                                onChange={() => toggleSelectReq(req.id)}
                              />
                            </td>

                            {/* Order ID & Client */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span 
                                  className="order-id-badge" 
                                  style={{ 
                                    fontSize: '0.74rem', 
                                    padding: '2px 6px',
                                    background: req.isOverdue ? '#fee2e2' : (req.isNearingDeadline ? '#fef3c7' : 'var(--accent-light)'),
                                    color: req.isOverdue ? '#dc2626' : (req.isNearingDeadline ? '#b45309' : 'var(--primary-brand)'),
                                    width: 'fit-content'
                                  }}
                                >
                                  {req.orderId}
                                </span>
                                <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                                  {req.clientName}
                                </span>
                              </div>
                            </td>

                            {/* Job Name & Structure */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '240px' }}>
                                <span style={{ fontWeight: '700', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={req.jobName}>
                                  {req.jobName}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                  {req.structure}
                                </span>
                              </div>
                            </td>

                            {/* Material Specification */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ 
                                  padding: '2px 6px', 
                                  borderRadius: '4px', 
                                  fontSize: '0.72rem', 
                                  fontWeight: '700',
                                  background: req.category === 'Film' ? '#e0f2fe' : (req.category === 'Ink' ? '#fdf4ff' : '#fef3c7'),
                                  color: req.category === 'Film' ? '#0369a1' : (req.category === 'Ink' ? '#9333ea' : '#b45309')
                                }}>
                                  {req.category}
                                </span>
                                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                                  {req.filmType}
                                </span>
                              </div>
                            </td>

                            {/* Gauge / Slit Width */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                {req.micron && req.micron !== '-' ? <span><strong>{req.micron}</strong> µ</span> : null}
                                {req.widthMm && req.widthMm !== '-' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <span>•</span>
                                    <input 
                                      type="number"
                                      className="form-control"
                                      style={{ 
                                        width: '78px', 
                                        padding: '2px 4px', 
                                        fontSize: '0.78rem', 
                                        fontWeight: '700', 
                                        textAlign: 'center',
                                        borderColor: '#3b82f6',
                                        background: '#eff6ff',
                                        height: '26px'
                                      }}
                                      value={req.widthMm}
                                      title="Edit Raw Material Width (mm)"
                                      onChange={(e) => handleUpdateReqField(req.orderId, req.id, 'widthMm', e.target.value)}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>mm</span>
                                  </div>
                                ) : (
                                  req.widthMm === '-' ? <span>—</span> : null
                                )}
                              </div>
                            </td>

                            {/* Gross Req Kg */}
                            <td className="bold-val" style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <input 
                                  type="number"
                                  step="0.1"
                                  className="form-control"
                                  style={{ width: '75px', padding: '2px 4px', fontSize: '0.78rem', fontWeight: '700', textAlign: 'right', height: '26px' }}
                                  value={req.qtyKg}
                                  title="Edit Gross Required Weight (kg)"
                                  onChange={(e) => handleUpdateReqField(req.orderId, req.id, 'qtyKg', e.target.value)}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>kg</span>
                              </div>
                            </td>

                            {/* Stock Check & Reservation */}
                            <td>
                              {stockInfo.isFullyAvailable ? (
                                <div style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#15803d' }}>
                                  <strong>✅ {stockInfo.reservedKg} kg in stock</strong>
                                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>
                                    Fully Reserved (No PO Required)
                                  </div>
                                </div>
                              ) : stockInfo.isPartiallyAvailable ? (
                                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#047857' }}>
                                  <strong>🟢 {stockInfo.reservedKg} / {stockInfo.reqQty} kg in stock</strong>
                                  <div style={{ fontSize: '0.7rem', color: '#065f46' }}>
                                    {stockInfo.reservedKg} kg Reserved • <strong>{stockInfo.balanceKg} kg Shortage</strong>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px', fontSize: '0.76rem', color: '#dc2626' }}>
                                  <strong>⚠️ 0 kg in stock</strong>
                                  <div style={{ fontSize: '0.7rem', color: '#991b1b' }}>
                                    Full {stockInfo.reqQty} kg Shortage
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Balance Qty for PO */}
                            <td>
                              <span className="badge" style={{ 
                                background: stockInfo.balanceKg > 0 ? '#fee2e2' : '#f1f5f9', 
                                color: stockInfo.balanceKg > 0 ? '#b91c1c' : '#64748b', 
                                border: stockInfo.balanceKg > 0 ? '1px solid #fca5a5' : '1px solid var(--border-color)',
                                fontWeight: '800', 
                                fontSize: '0.82rem' 
                              }}>
                                {stockInfo.balanceKg.toLocaleString()} kg
                              </span>
                            </td>

                            {/* Preferred Vendor */}
                            <td style={{ color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                                <Building2 size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} /> 
                                <select
                                  className="form-control"
                                  style={{ fontSize: '0.76rem', padding: '2px 4px', width: '130px', height: '26px' }}
                                  value={req.preferredVendor || ''}
                                  onChange={(e) => handleUpdateReqField(req.orderId, req.id, 'preferredVendor', e.target.value)}
                                >
                                  <option value={req.preferredVendor}>{req.preferredVendor}</option>
                                  {(vendors || []).map(v => (
                                    (v.companyName || v.name) !== req.preferredVendor && (
                                      <option key={v.id || (v.companyName || v.name)} value={v.companyName || v.name}>
                                        {v.companyName || v.name}
                                      </option>
                                    )
                                  ))}
                                </select>
                              </div>
                            </td>

                            {/* Target Dispatch */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ 
                                  fontWeight: '700', 
                                  fontSize: '0.8rem', 
                                  color: req.isOverdue ? '#dc2626' : (req.isNearingDeadline ? '#b45309' : 'var(--text-primary)') 
                                }}>
                                  {req.targetDeliveryDate}
                                </span>
                                {req.isOverdue ? (
                                  <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#dc2626' }}>OVERDUE</span>
                                ) : req.isNearingDeadline ? (
                                  <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#b45309' }}>≤4D LEFT</span>
                                ) : null}
                              </div>
                            </td>

                            {/* PO Status */}
                            <td>
                              {req.poIssued ? (
                                <button 
                                  type="button"
                                  className="btn-secondary" 
                                  style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    padding: '3px 7px', 
                                    fontSize: '0.74rem', 
                                    fontWeight: '700', 
                                    color: '#047857', 
                                    borderColor: '#a7f3d0', 
                                    background: '#ecfdf5', 
                                    cursor: 'pointer' 
                                  }}
                                  onClick={(e) => handleViewPoPdf(req.poNumber || req.order?.poNumber || 'PO-2026-101', e)}
                                  title="Click to View, Print & Download Purchase Order PDF"
                                >
                                  <FileText size={12} /> {req.poNumber || req.order?.poNumber || 'PO-2026-101'}
                                </button>
                              ) : (
                                <span className="badge badge-warning" style={{ fontSize: '0.72rem', padding: '3px 6px' }}>
                                  Pending PO
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Requirements Table Pagination */}
              <TablePagination
                currentPage={requirementsPagination.currentPage}
                totalItems={requirementsPagination.totalItems}
                pageSize={requirementsPagination.pageSize}
                onPageChange={requirementsPagination.setCurrentPage}
                onPageSizeChange={requirementsPagination.setPageSize}
              />
            </div>

            {/* Floating Selection Banner when items are selected */}
            {selectedRequirements.length > 0 && (
              <div style={{
                position: 'sticky',
                bottom: '16px',
                zIndex: 40,
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(8px)',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: '#3b82f6',
                      color: '#ffffff',
                      fontWeight: '800',
                      fontSize: '0.85rem',
                      padding: '3px 10px',
                      borderRadius: '9999px'
                    }}>
                      {selectedRequirements.length} Lines Selected
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      Total Net Qty: <strong>{selectedRequirements.reduce((sum, r) => sum + (parseFloat(r.qtyKg) || 0), 0).toLocaleString()} kg</strong>
                    </span>
                  </div>
                  <span style={{ color: '#64748b' }}>•</span>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Across {new Set(selectedRequirements.map(r => r.orderId)).size} distinct orders
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.8rem', padding: '6px 12px' }}
                    onClick={handleClearAllSelectedReqs}
                  >
                    Clear Selection
                  </button>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ fontSize: '0.85rem', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={handleOpenPoModal}
                  >
                    <FileText size={16} /> Issue Vendor Purchase Order
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
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
