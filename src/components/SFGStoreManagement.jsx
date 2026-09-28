import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  Package, 
  Scale, 
  Search, 
  Filter, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Building2, 
  User, 
  Tag, 
  X, 
  Check, 
  History as HistoryIcon,
  QrCode,
  Zap,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  RotateCcw,
  CheckCircle,
  AlertOctagon,
  ArrowRight,
  Printer
} from 'lucide-react';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import BarcodePrinterModal from './BarcodePrinterModal';
import SFGFGEntryModal from './SFGFGEntryModal';
import TablePagination, { usePagination } from './TablePagination';
import { getItemAgeInDays, getCategoryAgeingThreshold, isItemOverAged, sortInventoryByFifo } from '../utils/fifoUtils';
import { getInventoryAgeingSettings } from '../services/settingsService';

export default function SFGStoreManagement({
  sfgGoods = [],
  inventory = [],
  inventoryRolls = [],
  orders = [],
  jobMasters = [],
  productionRecords = [],
  machines = [],
  currentUser,
  onSaveSFGGood,
  onConsumeSFG,
  onDeleteSFGGood
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'In Stock (WIP)', 'Partially Consumed', 'Fully Consumed'
  const [typeFilter, setTypeFilter] = useState('all');

  // Sub-tab Navigation: 'available' | 'qchold' | 'scrap'
  const [activeStoreTab, setActiveStoreTab] = useState('available');

  // QC Hold Store & Scrap Store Persisted State
  const [qcHoldItems, setQcHoldItems] = useState(() => {
    try {
      const saved = localStorage.getItem('sfg_qc_hold_items');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [scrapItems, setScrapItems] = useState(() => {
    try {
      const saved = localStorage.getItem('sfg_scrap_items');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sfg_qc_hold_items', JSON.stringify(qcHoldItems));
    } catch (e) {
      console.error("Error saving sfg_qc_hold_items:", e);
    }
  }, [qcHoldItems]);

  useEffect(() => {
    try {
      localStorage.setItem('sfg_scrap_items', JSON.stringify(scrapItems));
    } catch (e) {
      console.error("Error saving sfg_scrap_items:", e);
    }
  }, [scrapItems]);

  // Inventory Ageing Settings Configuration
  const ageingSettings = useMemo(() => getInventoryAgeingSettings(), []);

  // Modals
  const [newGoodModalMode, setNewGoodModalMode] = useState(null); // 'SFG' | 'FG' | null
  const [selectedItemForConsume, setSelectedItemForConsume] = useState(null);
  const [selectedRollForBarcodeModal, setSelectedRollForBarcodeModal] = useState(null);
  const [viewHistoryItem, setViewHistoryItem] = useState(null);

  // Consume SFG Form State — Starts clean & empty
  const [consumedWeightKg, setConsumedWeightKg] = useState('');
  const [targetProcess, setTargetProcess] = useState('Lamination (Pass 1)');
  const [targetMachine, setTargetMachine] = useState('');
  const [operatorName, setOperatorName] = useState(currentUser?.fullName || currentUser?.username || '');
  const [shift, setShift] = useState('Day Shift');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // QC Hold Form Fields inside Consume Modal
  const [holdReason, setHoldReason] = useState('');
  const [holdRollCount, setHoldRollCount] = useState(1);
  const [rollWeights, setRollWeights] = useState(['']);

  // Modals for QC Hold Actions
  const [selectedQcItemForApprove, setSelectedQcItemForApprove] = useState(null);
  const [approveQtyKg, setApproveQtyKg] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [approveFormError, setApproveFormError] = useState('');

  const [selectedQcItemForScrap, setSelectedQcItemForScrap] = useState(null);
  const [scrapQtyKg, setScrapQtyKg] = useState('');
  const [defectCategory, setDefectCategory] = useState('Delamination / Bonding Failure');
  const [scrapReason, setScrapReason] = useState('');
  const [scrapFormError, setScrapFormError] = useState('');

  // Combined & Prepared SFG items with FIFO Sorting (oldest first)
  const allSfgItems = useMemo(() => {
    const list = Array.isArray(sfgGoods) ? [...sfgGoods] : [];

    // Helper map for order specs lookup
    const orderMap = new Map((orders || []).map(o => [o.id, o]));
    const ordersList = orders || [];

    const resolveItemSpecs = (item) => {
      let ordId = item.orderId;
      if (!ordId || ordId === 'N/A' || ordId === '#N/A') {
        if (item.id && item.id.includes('ORD-')) {
          ordId = item.id.replace('SFG-ITEM-', '').replace('SFG-BC-', '').split('-').slice(0, 3).join('-');
        }
      }
      const cleanOrdId = String(ordId || '').replace('#', '').trim();

      let matchedOrder = orderMap.get(ordId) || orderMap.get(cleanOrdId);
      if (!matchedOrder) {
        matchedOrder = ordersList.find(o => {
          const oId = String(o.id || '').replace('#', '').trim();
          const oJobCode = String(o.jobCode || '').trim();
          const oJobName = String(o.jobName || '').toLowerCase().trim();
          const itemJobName = String(item.jobName || '').toLowerCase().trim();
          const itemJobCode = String(item.jobCode || '').trim();
          
          return (
            (cleanOrdId && (oId === cleanOrdId || oId.endsWith(cleanOrdId) || cleanOrdId.endsWith(oId))) ||
            (itemJobCode && (oJobCode === itemJobCode || oId === itemJobCode)) ||
            (itemJobName && (oJobName === itemJobName || itemJobName.includes(oJobName) || oJobName.includes(itemJobName)))
          );
        });
      }

      const topLayer = Array.isArray(matchedOrder?.layers) && matchedOrder.layers.length > 0 ? matchedOrder.layers[0] : null;

      const rawFilm = item.filmType && item.filmType !== '-' && item.filmType !== 'Film Substrate' 
        ? item.filmType 
        : (matchedOrder?.printFilmType || matchedOrder?.filmType || topLayer?.filmType || 'PET');

      const rawMicron = Number(item.micron) > 0 
        ? Number(item.micron) 
        : (Number(matchedOrder?.micron) || Number(matchedOrder?.printFilmMicron) || Number(topLayer?.micron) || 12);

      const rawWidth = Number(item.widthMm) > 0 
        ? Number(item.widthMm) 
        : (Number(matchedOrder?.widthMm) || Number(matchedOrder?.printWidthMm) || Number(topLayer?.widthMm) || 460);

      const rawClient = item.clientName && item.clientName !== 'Client' && item.clientName !== 'General Client' && item.clientName !== 'In-House Printing Press'
        ? item.clientName
        : (matchedOrder?.clientName || matchedOrder?.customerName || item.clientName || 'In-House Printing Press');

      const resolvedOrderId = matchedOrder?.id || (ordId && ordId !== 'N/A' && ordId !== '#N/A' ? ordId : '');

      const rawOrderQty = item.orderQty || item.orderQuantity || matchedOrder?.totalOrderQty || matchedOrder?.quantityKg || matchedOrder?.orderQtyKg || matchedOrder?.quantity || matchedOrder?.orderQty || matchedOrder?.targetQtyKg || matchedOrder?.plannedQtyKg || null;
      
      const rawOrderQtyUnit = item.orderQtyUnit || item.quantityUnit || matchedOrder?.quantityUnit || matchedOrder?.orderQtyUnit || matchedOrder?.unit || 'Kg';
      
      const rawOrderDate = item.orderDate || matchedOrder?.orderDate || matchedOrder?.date || matchedOrder?.order_date || matchedOrder?.created_at || item.createdDate || null;

      const formattedOrderDate = rawOrderDate ? String(rawOrderDate).split('T')[0] : null;

      return { 
        ...item, 
        filmType: rawFilm, 
        micron: rawMicron, 
        widthMm: rawWidth, 
        clientName: rawClient, 
        orderId: resolvedOrderId,
        orderQty: rawOrderQty,
        orderQtyUnit: rawOrderQtyUnit,
        orderDate: formattedOrderDate
      };
    };

    // Merge SFG / FG items from central inventory table so all shopfloor output is accessible in SFG & FG Store
    const invList = Array.isArray(inventory) ? inventory : [];
    invList.forEach(item => {
      const cat = String(item.category || '').toLowerCase().trim();
      const code = String(item.itemCode || item.id || '').toLowerCase().trim();
      const rollType = String(item.rollType || '').toUpperCase().trim();
      
      const isSFGorFG = 
        cat.includes('semi-finished') || 
        cat.includes('finished goods') || 
        cat === 'sfg' || 
        cat === 'fg' || 
        code.startsWith('sfg-') || 
        code.startsWith('fg-') ||
        rollType === 'SEMI_FINISHED_GOODS' ||
        rollType === 'FINISHED_GOODS';

      if (isSFGorFG) {
        const exists = list.some(s => s.id === item.id || s.sfgBatchCode === item.id || s.sfgBatchCode === item.itemCode);
        if (!exists) {
          const isFgCategory = (cat.includes('finished goods') && !cat.includes('semi-finished')) || code.startsWith('fg-');
          list.push({
            id: item.id,
            sfgBatchCode: item.itemCode || item.id,
            orderId: item.orderId || (item.id.includes('ORD-') ? item.id.replace('SFG-ITEM-', '') : 'N/A'),
            jobName: item.itemName || 'SFG Stock Item',
            jobCode: item.jobCode || item.itemCode || item.id,
            clientName: item.clientName || item.lastVendor || 'Factory Store',
            sfgType: isFgCategory ? 'Finished Goods (FG)' : 'Printed Rolls',
            filmType: item.filmType || 'PET',
            widthMm: item.widthMm || 460,
            micron: item.micron || 12,
            totalNetKg: Number(item.availableQtyKg || item.netWeightKg || 0),
            availableKg: Number(item.availableQtyKg || item.availableWeightKg || 0),
            consumedKg: Number(item.allocatedQtyKg || 0),
            status: Number(item.availableQtyKg || 0) > 0 ? 'In Stock' : 'Consumed',
            location: item.location || 'SFG Store',
            createdDate: item.inwardDatetime || item.created_at || new Date().toISOString().split('T')[0]
          });
        }
      }
    });

    // Merge individual roll barcodes from inventoryRolls (Printed SFG rolls generated by active print runs)
    const rollsList = Array.isArray(inventoryRolls) ? inventoryRolls : [];
    rollsList.forEach(roll => {
      const rollType = String(roll.rollType || '').toUpperCase().trim();
      const cat = String(roll.category || '').toLowerCase().trim();
      const isSfgRoll = rollType === 'SEMI_FINISHED_GOODS' || rollType === 'FINISHED_GOODS' || cat.includes('semi-finished') || cat.includes('finished');

      if (isSfgRoll) {
        const barcodeId = roll.barcodeId || roll.id;
        const exists = list.some(s => s.id === barcodeId || s.sfgBatchCode === barcodeId);
        if (!exists) {
          const netW = Number(roll.availableWeightKg || roll.netWeightKg || 0);
          list.push({
            id: barcodeId,
            sfgBatchCode: barcodeId,
            orderId: roll.orderId || 'N/A',
            jobName: roll.jobName || roll.itemName || 'SFG Printed Roll',
            jobCode: roll.jobCode || roll.orderId || 'N/A',
            clientName: roll.customerName || roll.clientName || 'Client',
            sfgType: rollType === 'FINISHED_GOODS' ? 'Finished Goods (FG)' : 'Printed Rolls',
            filmType: roll.filmType || 'PET',
            widthMm: roll.widthMm || 460,
            micron: roll.micron || 12,
            totalNetKg: Number(roll.netWeightKg || netW),
            availableKg: netW,
            consumedKg: Math.max(0, Number(roll.netWeightKg || netW) - netW),
            status: netW > 0 ? (roll.status || 'In Stock') : 'Consumed',
            location: roll.locationBay || roll.location || 'SFG Store',
            createdDate: roll.inwardDatetime || new Date().toISOString().split('T')[0]
          });
        }
      }
    });

    // Resolve specs (film, micron, width, client, orderId) for all items
    const resolvedList = list.map(resolveItemSpecs);

    // Filter out dummy 0-kg placeholders
    const cleanList = resolvedList.filter(item => {
      const isUntitledOrBlank = (item.jobName === 'Untitled Job' || item.jobName === 'SFG Stock Item' || !item.jobName) && (!item.orderId || item.orderId === 'N/A' || item.orderId === '#N/A');
      const isZeroKg = Number(item.totalNetKg || 0) <= 0 && Number(item.availableKg || 0) <= 0;
      return !(isUntitledOrBlank && isZeroKg);
    });

    return sortInventoryByFifo(cleanList);
  }, [sfgGoods, inventory, inventoryRolls, orders]);


  // Filtered Items
  const filteredItems = useMemo(() => {
    return allSfgItems.filter(item => {
      // Search term matching
      const sTerm = searchTerm.trim().toLowerCase();
      const matchSearch = !sTerm || 
        (item.sfgBatchCode && item.sfgBatchCode.toLowerCase().includes(sTerm)) ||
        (item.jobName && item.jobName.toLowerCase().includes(sTerm)) ||
        (item.jobCode && item.jobCode.toLowerCase().includes(sTerm)) ||
        (item.orderId && item.orderId.toLowerCase().includes(sTerm)) ||
        (item.clientName && item.clientName.toLowerCase().includes(sTerm)) ||
        (item.filmType && item.filmType.toLowerCase().includes(sTerm)) ||
        (item.sfgType && item.sfgType.toLowerCase().includes(sTerm));

      // Status filter
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;

      // Type filter
      const matchType = typeFilter === 'all' || item.sfgType === typeFilter;

      return matchSearch && matchStatus && matchType;
    });
  }, [allSfgItems, searchTerm, statusFilter, typeFilter]);

  // KPI Calculations
  const metrics = useMemo(() => {
    let totalBatches = allSfgItems.length;
    let totalInitialNetKg = 0;
    let totalConsumedKg = 0;
    let totalAvailableBalanceKg = 0;

    allSfgItems.forEach(item => {
      const net = Number(item.totalNetKg) || 0;
      const consumed = Number(item.consumedKg) || 0;
      const available = item.availableKg !== undefined ? Number(item.availableKg) : Math.max(0, net - consumed);

      totalInitialNetKg += net;
      totalConsumedKg += consumed;
      totalAvailableBalanceKg += available;
    });

    return {
      totalBatches,
      totalInitialNetKg: totalInitialNetKg.toFixed(2),
      totalConsumedKg: totalConsumedKg.toFixed(2),
      totalAvailableBalanceKg: totalAvailableBalanceKg.toFixed(2)
    };
  }, [allSfgItems]);

  // Group filtered items by Job Order Ref (orderId or jobCode/jobName)
  const groupedOrders = useMemo(() => {
    const groups = [];
    const map = new Map();

    const orderMap = new Map((orders || []).map(o => [o.id, o]));
    const cleanOrderMap = new Map((orders || []).map(o => [String(o.id || '').replace('#', '').trim(), o]));

    filteredItems.forEach(item => {
      let rawOrderKey = (item.orderId && item.orderId !== 'N/A' && item.orderId !== '#N/A') 
        ? item.orderId 
        : (item.jobCode && item.jobCode !== 'N/A' ? item.jobCode : (item.jobName || 'Unassigned Order'));
      
      const orderKey = String(rawOrderKey).replace('#', '').trim();

      if (!map.has(orderKey)) {
        let directOrderMatch = orderMap.get(item.orderId) || cleanOrderMap.get(orderKey);
        if (!directOrderMatch) {
          directOrderMatch = (orders || []).find(o => {
            const oId = String(o.id || '').replace('#', '').trim();
            return oId === orderKey || oId.endsWith(orderKey) || orderKey.endsWith(oId);
          });
        }

        const rawQty = item.orderQty || directOrderMatch?.totalOrderQty || directOrderMatch?.quantityKg || directOrderMatch?.orderQtyKg || directOrderMatch?.quantity || directOrderMatch?.orderQty || directOrderMatch?.targetQtyKg || directOrderMatch?.plannedQtyKg || null;

        const rawUnit = item.orderQtyUnit || directOrderMatch?.quantityUnit || directOrderMatch?.orderQtyUnit || directOrderMatch?.unit || 'Kg';

        const rawDate = item.orderDate || directOrderMatch?.orderDate || directOrderMatch?.date || directOrderMatch?.order_date || directOrderMatch?.created_at || null;

        const groupObj = {
          orderKey,
          orderId: item.orderId && item.orderId !== 'N/A' && item.orderId !== '#N/A' ? item.orderId : '',
          jobName: item.jobName || 'Untitled Job',
          jobCode: item.jobCode || '',
          clientName: item.clientName || 'General Client',
          filmType: item.filmType,
          micron: item.micron,
          widthMm: item.widthMm,
          orderQty: rawQty,
          orderQtyUnit: rawUnit,
          orderDate: rawDate ? String(rawDate).split('T')[0] : null,
          totalNetKg: 0,
          consumedKg: 0,
          availableKg: 0,
          items: []
        };
        map.set(orderKey, groupObj);
        groups.push(groupObj);
      }

      const grp = map.get(orderKey);
      const net = Number(item.totalNetKg) || 0;
      const consumed = Number(item.consumedKg) || 0;
      const available = item.availableKg !== undefined ? Number(item.availableKg) : Math.max(0, net - consumed);

      if (!grp.orderQty && item.orderQty) {
        grp.orderQty = item.orderQty;
        grp.orderQtyUnit = item.orderQtyUnit || 'Kg';
      }
      if (!grp.orderDate && item.orderDate) {
        grp.orderDate = String(item.orderDate).split('T')[0];
      }

      grp.totalNetKg += net;
      grp.consumedKg += consumed;
      grp.availableKg += available;
      grp.items.push(item);
    });

    return groups;
  }, [filteredItems, orders]);

  // Collapsible state for order accordions ({ [orderKey]: boolean })
  const [expandedOrders, setExpandedOrders] = useState({});

  const isOrderExpanded = (orderKey) => {
    // Default to true (expanded) if key not in expandedOrders
    return expandedOrders[orderKey] !== false;
  };

  const toggleOrderExpand = (orderKey) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderKey]: prev[orderKey] === undefined ? false : !prev[orderKey]
    }));
  };

  const expandAllOrders = () => {
    const newMap = {};
    groupedOrders.forEach(g => {
      newMap[g.orderKey] = true;
    });
    setExpandedOrders(newMap);
  };

  const collapseAllOrders = () => {
    const newMap = {};
    groupedOrders.forEach(g => {
      newMap[g.orderKey] = false;
    });
    setExpandedOrders(newMap);
  };

  // Pagination by Order Group
  const { paginatedItems: paginatedGroups, totalPages, currentPage, setCurrentPage } = usePagination(groupedOrders, 10);

  // Handle Consume Modal Open
  const handleOpenConsumeModal = (item) => {
    setSelectedItemForConsume(item);
    setConsumedWeightKg('');
    setTargetProcess('Lamination (Pass 1)');
    setTargetMachine(machines[0]?.name || '');
    setOperatorName(currentUser?.fullName || currentUser?.username || '');
    setShift('Day Shift');
    setNotes('');
    setHoldReason('');
    setHoldRollCount(1);
    setRollWeights(['']);
    setFormError('');
  };

  const handleRollCountChange = (count) => {
    const num = Math.max(1, parseInt(count) || 1);
    setHoldRollCount(num);
    setRollWeights(prev => {
      const updated = [...prev];
      if (updated.length < num) {
        while (updated.length < num) updated.push('');
      } else if (updated.length > num) {
        updated.length = num;
      }
      return updated;
    });
  };

  const handleRollWeightChange = (index, val) => {
    setRollWeights(prev => {
      const updated = [...prev];
      updated[index] = val;
      const sum = updated.reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0);
      if (sum > 0) {
        setConsumedWeightKg(sum.toFixed(2));
      }
      return updated;
    });
  };

  // Submit Consume / QC Hold SFG
  const handleConfirmConsumeSFG = (e) => {
    e.preventDefault();
    if (!selectedItemForConsume) return;

    const qtyVal = parseFloat(consumedWeightKg);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setFormError('Please enter a valid weight consumed greater than 0 kg.');
      return;
    }

    const currentNet = Number(selectedItemForConsume.totalNetKg) || 0;
    const currentConsumed = Number(selectedItemForConsume.consumedKg) || 0;
    const currentAvailable = selectedItemForConsume.availableKg !== undefined 
      ? Number(selectedItemForConsume.availableKg) 
      : Math.max(0, currentNet - currentConsumed);

    if (qtyVal > currentAvailable) {
      setFormError(`Consumed weight (${qtyVal} kg) cannot exceed current available balance (${currentAvailable.toFixed(2)} kg).`);
      return;
    }

    if (targetProcess === 'QC Hold Store') {
      if (!holdReason || !holdReason.trim()) {
        setFormError('Please specify the QC Hold Reason before sending material to quarantine.');
        return;
      }
    }

    const newConsumedKg = (currentConsumed + qtyVal).toFixed(2);
    const newAvailableKg = Math.max(0, currentNet - newConsumedKg).toFixed(2);
    
    let newStatus = 'In Stock (WIP)';
    if (parseFloat(newConsumedKg) > 0) {
      newStatus = parseFloat(newAvailableKg) <= 0 ? 'Fully Consumed' : 'Partially Consumed';
    }

    const logEntry = {
      id: `SFG-LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      sfgBatchCode: selectedItemForConsume.sfgBatchCode,
      jobName: selectedItemForConsume.jobName,
      jobCode: selectedItemForConsume.jobCode,
      orderId: selectedItemForConsume.orderId,
      consumedKg: parseFloat(qtyVal.toFixed(2)),
      remainingBalanceKg: parseFloat(newAvailableKg),
      targetProcess,
      targetMachine,
      operatorName,
      shift,
      notes: targetProcess === 'QC Hold Store' ? `QC Hold: ${holdReason}` : notes
    };

    const updatedConsumptionHistory = [
      logEntry,
      ...(selectedItemForConsume.consumptionHistory || [])
    ];

    const updatedItem = {
      ...selectedItemForConsume,
      consumedKg: parseFloat(newConsumedKg),
      availableKg: parseFloat(newAvailableKg),
      status: newStatus,
      consumptionHistory: updatedConsumptionHistory
    };

    if (onConsumeSFG) {
      onConsumeSFG(updatedItem, logEntry);
    } else if (onSaveSFGGood) {
      onSaveSFGGood(updatedItem);
    }

    // Special logic when targetProcess is 'QC Hold Store'
    if (targetProcess === 'QC Hold Store') {
      const holdTagId = `QCHOLD-${Date.now().toString().slice(-6)}`;
      const parsedRollWeights = rollWeights.map(w => parseFloat(w) || 0).filter(w => w > 0);
      const finalRollCount = Math.max(1, parseInt(holdRollCount) || 1);

      const newQcHoldEntry = {
        id: holdTagId,
        barcodeId: holdTagId,
        sfgBatchCode: holdTagId,
        parentSfgBatchCode: selectedItemForConsume.sfgBatchCode,
        parentSfgId: selectedItemForConsume.id,
        orderId: selectedItemForConsume.orderId || 'N/A',
        jobName: selectedItemForConsume.jobName,
        jobCode: selectedItemForConsume.jobCode,
        clientName: selectedItemForConsume.clientName,
        filmType: selectedItemForConsume.filmType,
        micron: selectedItemForConsume.micron,
        widthMm: selectedItemForConsume.widthMm,
        totalHoldKg: parseFloat(qtyVal.toFixed(2)),
        remainingHoldKg: parseFloat(qtyVal.toFixed(2)),
        approvedKg: 0,
        scrappedKg: 0,
        numberOfRolls: finalRollCount,
        rollWeights: parsedRollWeights.length > 0 ? parsedRollWeights : [parseFloat(qtyVal.toFixed(2))],
        holdReason: holdReason.trim(),
        targetProcess: 'QC Hold Store',
        operatorName: operatorName || currentUser?.fullName || currentUser?.username || 'QC Inspector',
        shift,
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        status: 'QC_HOLD',
        isQCHold: true,
        approvalLogs: [],
        scrapLogs: []
      };

      setQcHoldItems(prev => [newQcHoldEntry, ...prev]);

      // Open Barcode sticker modal immediately for the new QC Hold tag
      setSelectedRollForBarcodeModal(newQcHoldEntry);
    }

    setSelectedItemForConsume(null);
  };

  // Submit Option 1: Approve & Move to Store
  const handleConfirmApproveMove = (e) => {
    e.preventDefault();
    if (!selectedQcItemForApprove) return;

    const approveVal = parseFloat(approveQtyKg);
    const currentRemaining = Number(selectedQcItemForApprove.remainingHoldKg || 0);

    if (isNaN(approveVal) || approveVal <= 0) {
      setApproveFormError('Please enter a valid quantity to approve greater than 0 kg.');
      return;
    }

    if (approveVal > currentRemaining) {
      setApproveFormError(`Approve quantity (${approveVal} kg) cannot exceed current pending QC hold balance (${currentRemaining.toFixed(2)} kg).`);
      return;
    }

    if (!approveReason || !approveReason.trim()) {
      setApproveFormError('Please specify the approval reason/justification.');
      return;
    }

    const newRemainingKg = Math.max(0, currentRemaining - approveVal);
    const newApprovedKg = Number(selectedQcItemForApprove.approvedKg || 0) + approveVal;

    const approvalLog = {
      id: `APP-LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      approvedKg: approveVal,
      remainingHoldKg: newRemainingKg,
      reason: approveReason.trim(),
      approvedBy: currentUser?.fullName || currentUser?.username || 'QC Manager'
    };

    // 1. Restore approved quantity back to parent SFG/FG store item
    const parentId = selectedQcItemForApprove.parentSfgId || selectedQcItemForApprove.parentSfgBatchCode;
    const parentItem = allSfgItems.find(s => s.id === parentId || s.sfgBatchCode === parentId);

    if (parentItem) {
      const parentNet = Number(parentItem.totalNetKg) || 0;
      const parentConsumed = Math.max(0, Number(parentItem.consumedKg) - approveVal);
      const parentAvail = parentItem.availableKg !== undefined ? Number(parentItem.availableKg) + approveVal : Math.max(0, parentNet - parentConsumed);

      const updatedParent = {
        ...parentItem,
        consumedKg: parseFloat(parentConsumed.toFixed(2)),
        availableKg: parseFloat(parentAvail.toFixed(2)),
        status: parentAvail > 0 ? (parentConsumed > 0 ? 'Partially Consumed' : 'In Stock (WIP)') : 'Fully Consumed',
        consumptionHistory: [
          {
            id: `RESTORE-LOG-${Date.now()}`,
            timestamp: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
            sfgBatchCode: parentItem.sfgBatchCode,
            jobName: parentItem.jobName,
            consumedKg: -parseFloat(approveVal.toFixed(2)), // negative consumed = restored
            remainingBalanceKg: parseFloat(parentAvail.toFixed(2)),
            targetProcess: 'Restored from QC Hold Store',
            operatorName: currentUser?.fullName || currentUser?.username || 'QC Manager',
            shift: 'Day Shift',
            notes: `Approved from QC Hold Tag #${selectedQcItemForApprove.barcodeId}. Reason: ${approveReason.trim()}`
          },
          ...(parentItem.consumptionHistory || [])
        ]
      };

      if (onSaveSFGGood) {
        onSaveSFGGood(updatedParent);
      }
    }

    // 2. Update or automatically remove from QC Hold Store if remaining is 0 kg!
    if (newRemainingKg <= 0) {
      setQcHoldItems(prev => prev.filter(item => item.id !== selectedQcItemForApprove.id));
    } else {
      setQcHoldItems(prev => prev.map(item => {
        if (item.id === selectedQcItemForApprove.id) {
          return {
            ...item,
            remainingHoldKg: parseFloat(newRemainingKg.toFixed(2)),
            approvedKg: parseFloat(newApprovedKg.toFixed(2)),
            approvalLogs: [approvalLog, ...(item.approvalLogs || [])]
          };
        }
        return item;
      }));
    }

    setSelectedQcItemForApprove(null);
  };

  // Submit Option 2: Send to Scrap
  const handleConfirmSendToScrap = (e) => {
    e.preventDefault();
    if (!selectedQcItemForScrap) return;

    const scrapVal = parseFloat(scrapQtyKg);
    const currentRemaining = Number(selectedQcItemForScrap.remainingHoldKg || 0);

    if (isNaN(scrapVal) || scrapVal <= 0) {
      setScrapFormError('Please enter a valid quantity to send to scrap greater than 0 kg.');
      return;
    }

    if (scrapVal > currentRemaining) {
      setScrapFormError(`Scrap quantity (${scrapVal} kg) cannot exceed current pending QC hold balance (${currentRemaining.toFixed(2)} kg).`);
      return;
    }

    if (!scrapReason || !scrapReason.trim()) {
      setScrapFormError('Please specify the scrap reason/notes.');
      return;
    }

    const newRemainingKg = Math.max(0, currentRemaining - scrapVal);
    const newScrappedKg = Number(selectedQcItemForScrap.scrappedKg || 0) + scrapVal;

    const scrapLog = {
      id: `SCRAP-LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      scrappedKg: scrapVal,
      remainingHoldKg: newRemainingKg,
      defectCategory,
      reason: scrapReason.trim(),
      scrappedBy: currentUser?.fullName || currentUser?.username || 'QC Inspector'
    };

    // 1. Record entry in Scrap Store
    const scrapStoreEntry = {
      id: `SCRAP-ITEM-${Date.now()}`,
      holdTagId: selectedQcItemForScrap.barcodeId,
      orderId: selectedQcItemForScrap.orderId,
      jobName: selectedQcItemForScrap.jobName,
      jobCode: selectedQcItemForScrap.jobCode,
      clientName: selectedQcItemForScrap.clientName,
      filmType: selectedQcItemForScrap.filmType,
      micron: selectedQcItemForScrap.micron,
      widthMm: selectedQcItemForScrap.widthMm,
      scrapQtyKg: parseFloat(scrapVal.toFixed(2)),
      defectCategory,
      scrapReason: scrapReason.trim(),
      scrappedBy: currentUser?.fullName || currentUser?.username || 'QC Inspector',
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString()
    };

    setScrapItems(prev => [scrapStoreEntry, ...prev]);

    // 2. Update or automatically remove from QC Hold Store if remaining is 0 kg!
    if (newRemainingKg <= 0) {
      setQcHoldItems(prev => prev.filter(item => item.id !== selectedQcItemForScrap.id));
    } else {
      setQcHoldItems(prev => prev.map(item => {
        if (item.id === selectedQcItemForScrap.id) {
          return {
            ...item,
            remainingHoldKg: parseFloat(newRemainingKg.toFixed(2)),
            scrappedKg: parseFloat(newScrappedKg.toFixed(2)),
            scrapLogs: [scrapLog, ...(item.scrapLogs || [])]
          };
        }
        return item;
      }));
    }

    setSelectedQcItemForScrap(null);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        padding: '24px 32px',
        borderRadius: '16px',
        color: '#fff',
        marginBottom: '24px',
        boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}>
              <Layers size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: '800', margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
                SFG and FG Store
              </h1>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Centralized Semi-Finished Goods (SFG) & Finished Goods (FG) store for managing stock job-wise and order-wise with real-time process consumption tracking.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setNewGoodModalMode('SFG')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.9rem',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            <Plus size={18} />
            + Add SFG Batch
          </button>
          <button
            onClick={() => setNewGoodModalMode('FG')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.9rem',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            <Plus size={18} />
            + Add FG Batch
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '2px'
      }}>
        <button
          type="button"
          onClick={() => setActiveStoreTab('available')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.92rem',
            fontWeight: '800',
            border: 'none',
            borderBottom: activeStoreTab === 'available' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeStoreTab === 'available' ? '#2563eb' : '#64748b',
            background: activeStoreTab === 'available' ? '#eff6ff' : 'transparent',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Layers size={18} />
          SFG & FG Store
        </button>

        <button
          type="button"
          onClick={() => setActiveStoreTab('qchold')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.92rem',
            fontWeight: '800',
            border: 'none',
            borderBottom: activeStoreTab === 'qchold' ? '3px solid #dc2626' : '3px solid transparent',
            color: activeStoreTab === 'qchold' ? '#dc2626' : '#64748b',
            background: activeStoreTab === 'qchold' ? '#fff5f5' : 'transparent',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <ShieldAlert size={18} />
          QC Hold Store
          {qcHoldItems.length > 0 && (
            <span style={{
              background: '#dc2626',
              color: '#ffffff',
              fontSize: '0.74rem',
              fontWeight: '900',
              padding: '2px 8px',
              borderRadius: '10px',
              marginLeft: '4px'
            }}>
              {qcHoldItems.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveStoreTab('scrap')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.92rem',
            fontWeight: '800',
            border: 'none',
            borderBottom: activeStoreTab === 'scrap' ? '3px solid #475569' : '3px solid transparent',
            color: activeStoreTab === 'scrap' ? '#0f172a' : '#64748b',
            background: activeStoreTab === 'scrap' ? '#f1f5f9' : 'transparent',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Trash2 size={18} />
          Scrap Store
          {scrapItems.length > 0 && (
            <span style={{
              background: '#64748b',
              color: '#ffffff',
              fontSize: '0.74rem',
              fontWeight: '900',
              padding: '2px 8px',
              borderRadius: '10px',
              marginLeft: '4px'
            }}>
              {scrapItems.length}
            </span>
          )}
        </button>
      </div>

      {/* VIEW 1: SFG & FG AVAILABLE STORE */}
      {activeStoreTab === 'available' && (
        <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Total SFG & FG Batches */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>
            <span>Total SFG & FG Batches</span>
            <Package size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', marginTop: '10px' }}>
            {metrics.totalBatches} <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#64748b' }}>Batches</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            Stored job-wise & order-wise
          </div>
        </div>

        {/* Initial Net Weight */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>
            <span>Total Initial Weight</span>
            <Scale size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', marginTop: '10px' }}>
            {metrics.totalInitialNetKg} <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#64748b' }}>kg</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            Total net production stored
          </div>
        </div>

        {/* Consumed Weight */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #fed7aa',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ea580c', fontSize: '0.85rem', fontWeight: '600' }}>
            <span>Total Consumed Weight</span>
            <ArrowUpRight size={18} color="#ea580c" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#c2410c', marginTop: '10px' }}>
            {metrics.totalConsumedKg} <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#ea580c' }}>kg</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#9a3412', marginTop: '4px' }}>
            Consumed in downstream processing
          </div>
        </div>

        {/* Available Stock Balance */}
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          border: '1px solid #86efac',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#166534', fontSize: '0.85rem', fontWeight: '700' }}>
            <span>Available Balance Stock</span>
            <Zap size={18} color="#15803d" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#14532d', marginTop: '10px' }}>
            {metrics.totalAvailableBalanceKg} <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#166534' }}>kg</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#166534', marginTop: '4px', fontWeight: '600' }}>
            Ready for Processing / Dispatch
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search Input */}
        <div style={{ flex: '1', minWidth: '280px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by Job Name, Job Code, Order ID, Client, Batch Barcode, Substrate..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '42px',
              paddingRight: '16px',
              paddingTop: '10px',
              paddingBottom: '10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={16} color="#64748b" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#334155',
                background: '#f8fafc',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="In Stock (WIP)">In Stock (WIP)</option>
              <option value="Partially Consumed">Partially Consumed</option>
              <option value="Fully Consumed">Fully Consumed</option>
            </select>
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              color: '#334155',
              background: '#f8fafc',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Stock Types (SFG & FG)</option>
            <optgroup label="Semi-Finished Goods (SFG)">
              <option value="Printed Rolls">Printed Rolls (SFG)</option>
              <option value="Laminated Rolls (First Pass) for Roll Form">Laminated Rolls (First Pass) - Roll</option>
              <option value="Laminated Rolls (First Pass) for Pouch Form">Laminated Rolls (First Pass) - Pouch</option>
              <option value="Laminated Rolls (Second Pass) for Pouch Form">Laminated Rolls (Second Pass) - Pouch</option>
            </optgroup>
            <optgroup label="Finished Goods (FG)">
              <option value="Slit Finished Reels">Slit Finished Reels (FG)</option>
              <option value="Finished Pouches">Finished Pouches (FG)</option>
              <option value="Finished Goods">Finished Goods (FG)</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* SFG & FG Grouped Inventory View */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '14px',
        padding: '0 4px'
      }}>
        <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} color="#2563eb" />
          Job Order Groups ({groupedOrders.length} {groupedOrders.length === 1 ? 'Order' : 'Orders'}, {filteredItems.length} Total Rolls/Batches)
        </div>
        {groupedOrders.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={expandAllOrders}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllOrders}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        {paginatedGroups.length === 0 ? (
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '48px',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <Layers size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#475569' }}>No SFG or FG inventory batches found</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Click "+ Add SFG Batch" or "+ Add FG Batch" to record stock job-wise & order-wise.</div>
          </div>
        ) : (
          paginatedGroups.map((group) => {
            const expanded = isOrderExpanded(group.orderKey);

            return (
              <div
                key={group.orderKey}
                style={{
                  background: '#ffffff',
                  border: expanded ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  boxShadow: expanded ? '0 4px 12px -2px rgba(37, 99, 235, 0.08)' : '0 2px 4px rgba(0, 0, 0, 0.02)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Collapsible Header */}
                <div
                  onClick={() => toggleOrderExpand(group.orderKey)}
                  style={{
                    background: expanded ? 'linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%)' : '#f8fafc',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: expanded ? '1px solid #cbd5e1' : 'none',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: expanded ? '#dbeafe' : '#e2e8f0',
                      color: expanded ? '#1d4ed8' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}>
                      {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: '800',
                          fontSize: '0.88rem',
                          background: '#1e293b',
                          color: '#60a5fa',
                          padding: '3px 10px',
                          borderRadius: '6px'
                        }}>
                          {group.orderId ? `Order #${group.orderId}` : `Job Ref: ${group.orderKey}`}
                        </span>

                        {group.orderQty && (
                          <span style={{
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            color: '#047857',
                            background: '#d1fae5',
                            border: '1px solid #a7f3d0',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            Order Qty: {group.orderQty} {group.orderQtyUnit && !String(group.orderQty).toLowerCase().includes(String(group.orderQtyUnit).toLowerCase()) ? group.orderQtyUnit : ''}
                          </span>
                        )}

                        {group.orderDate && (
                          <span style={{
                            fontSize: '0.78rem',
                            fontWeight: '600',
                            color: '#0284c7',
                            background: '#e0f2fe',
                            border: '1px solid #bae6fd',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Clock size={12} /> Date: {group.orderDate}
                          </span>
                        )}

                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          {group.jobName}
                        </h3>

                        {group.jobCode && group.jobCode !== group.orderId && (
                          <span style={{ fontSize: '0.76rem', color: '#475569', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                            {group.jobCode}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>Client: <strong style={{ color: '#1e293b' }}>{group.clientName}</strong></span>
                        <span>Substrate: <strong style={{ color: '#1e293b' }}>{group.filmType} ({group.micron}µm × {group.widthMm}mm)</strong></span>
                        {group.orderQty && (
                          <span>Order Qty: <strong style={{ color: '#047857' }}>{group.orderQty} {group.orderQtyUnit && !String(group.orderQty).toLowerCase().includes(String(group.orderQtyUnit).toLowerCase()) ? group.orderQtyUnit : ''}</strong></span>
                        )}
                        {group.orderDate && (
                          <span>Order Date: <strong style={{ color: '#0284c7' }}>{group.orderDate}</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary Badges on Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      color: '#475569',
                      whiteSpace: 'nowrap'
                    }}>
                      📦 {group.items.length} {group.items.length === 1 ? 'Roll / Batch' : 'Rolls / Batches'}
                    </div>

                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '600' }}>INITIAL / CONSUMED</div>
                      <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#334155' }}>
                        {group.totalNetKg.toFixed(2)} kg / <span style={{ color: group.consumedKg > 0 ? '#c2410c' : '#64748b' }}>{group.consumedKg.toFixed(2)} kg</span>
                      </div>
                    </div>

                    <div style={{
                      background: group.availableKg > 0 ? '#f0fdf4' : '#f8fafc',
                      border: group.availableKg > 0 ? '1px solid #bbf7d0' : '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '6px 14px',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      <div style={{ fontSize: '0.72rem', color: group.availableKg > 0 ? '#166534' : '#64748b', fontWeight: '700' }}>AVAILABLE BALANCE</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: '900', color: group.availableKg > 0 ? '#15803d' : '#64748b' }}>
                        {group.availableKg.toFixed(2)} kg
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Content Body */}
                {expanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <th style={{ padding: '12px 16px' }}>SFG / FG Barcode</th>
                          <th style={{ padding: '12px 16px' }}>Roll / Batch Code & Title</th>
                          <th style={{ padding: '12px 16px' }}>Substrate & Size</th>
                          <th style={{ padding: '12px 16px' }}>Stock Type</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Initial Net (kg)</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Consumed (kg)</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Available Balance (kg)</th>
                          <th style={{ padding: '12px 16px' }}>Bay</th>
                          <th style={{ padding: '12px 16px' }}>Status</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => {
                          const net = Number(item.totalNetKg) || 0;
                          const consumed = Number(item.consumedKg) || 0;
                          const available = item.availableKg !== undefined ? Number(item.availableKg) : Math.max(0, net - consumed);

                          let statusBg = '#eff6ff';
                          let statusColor = '#1d4ed8';
                          let statusBorder = '#bfdbfe';

                          if (item.status === 'Partially Consumed') {
                            statusBg = '#fff7ed';
                            statusColor = '#c2410c';
                            statusBorder = '#fed7aa';
                          } else if (item.status === 'Fully Consumed' || available <= 0) {
                            statusBg = '#f1f5f9';
                            statusColor = '#64748b';
                            statusBorder = '#cbd5e1';
                          }

                          const sType = String(item.sfgType || '').toLowerCase();
                          const cType = String(item.category || '').toLowerCase();
                          const isFgType = (
                            (sType.includes('finished') && !sType.includes('semi')) ||
                            (sType.includes('fg') && !sType.includes('sfg')) ||
                            sType.includes('slit') ||
                            sType.includes('pouch') ||
                            (cType.includes('finished') && !cType.includes('semi')) ||
                            item.mode === 'FG'
                          );

                          return (
                            <tr key={item.id || item.sfgBatchCode} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                              
                              {/* Barcode / Batch Code */}
                              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0f172a', fontSize: '0.84rem', background: '#f8fafc', padding: '3px 8px', borderRadius: '5px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
                                  {item.sfgBatchCode}
                                </div>
                                <div style={{ marginTop: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedRollForBarcodeModal(item); }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#2563eb',
                                      fontSize: '0.74rem',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: 0
                                    }}
                                  >
                                    <QrCode size={12} /> Print Tag
                                  </button>
                                </div>
                              </td>

                              {/* Roll / Batch Code & Title */}
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.86rem' }}>
                                  {item.jobName || 'Untitled Item'}
                                </div>
                                {item.jobCode && item.jobCode !== 'N/A' && (
                                  <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', marginTop: '2px', display: 'inline-block' }}>
                                    {item.jobCode}
                                  </span>
                                )}
                              </td>

                              {/* Substrate & Size */}
                              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                <div style={{ color: '#0f172a', fontWeight: '700', fontSize: '0.84rem' }}>
                                  {item.filmType || 'Film Substrate'}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: '600' }}>
                                  {item.micron ? `${item.micron} Mic` : '12 Mic'} | {item.widthMm ? `${item.widthMm} mm` : '460 mm'}
                                </div>
                              </td>

                              {/* SFG / FG Type */}
                              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  fontSize: '0.74rem',
                                  fontWeight: '800',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: isFgType ? '#ecfdf5' : '#f5f3ff',
                                  color: isFgType ? '#047857' : '#6d28d9',
                                  border: `1px solid ${isFgType ? '#a7f3d0' : '#ddd6fe'}`,
                                  whiteSpace: 'nowrap',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  {item.sfgType || (isFgType ? 'Finished Goods' : 'Printed Rolls')}
                                </span>
                              </td>

                              {/* Initial Net Weight */}
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                                {net.toFixed(2)} kg
                              </td>

                              {/* Consumed Weight */}
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: consumed > 0 ? '#c2410c' : '#94a3b8', whiteSpace: 'nowrap' }}>
                                {consumed.toFixed(2)} kg
                              </td>

                              {/* Available Balance */}
                              <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  fontSize: '0.9rem',
                                  fontWeight: '800',
                                  color: available > 0 ? '#15803d' : '#94a3b8',
                                  background: available > 0 ? '#f0fdf4' : '#f8fafc',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: available > 0 ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                  display: 'inline-block'
                                }}>
                                  {available.toFixed(2)} kg
                                </span>
                              </td>

                              {/* Storage Bay */}
                              <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: '600' }}>
                                {item.storageBay || item.location || 'Bay A'}
                              </td>

                              {/* Status Badge */}
                              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                  <span style={{
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    background: statusBg,
                                    color: statusColor,
                                    border: `1px solid ${statusBorder}`,
                                    whiteSpace: 'nowrap',
                                    display: 'inline-block'
                                  }}>
                                    {item.status || 'In Stock (WIP)'}
                                  </span>

                                  {(() => {
                                    const catName = isFgType ? "Finished Goods (FG)" : "Semi-Finished Goods (SFG)";
                                    const ageInDays = getItemAgeInDays(item);
                                    const threshold = getCategoryAgeingThreshold(catName, ageingSettings);
                                    const isOverAged = ageInDays > threshold;

                                    return isOverAged ? (
                                      <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.66rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                        ⚠️ OVER-AGED ({ageInDays}d &gt; {threshold}d)
                                      </span>
                                    ) : (
                                      <span style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '0.66rem', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                        📜 FIFO ({ageInDays}d)
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>

                              {/* Actions */}
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleOpenConsumeModal(item); }}
                                    disabled={available <= 0}
                                    style={{
                                      background: available > 0 ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#e2e8f0',
                                      color: available > 0 ? '#ffffff' : '#94a3b8',
                                      border: 'none',
                                      borderRadius: '8px',
                                      padding: '6px 12px',
                                      fontSize: '0.78rem',
                                      fontWeight: '700',
                                      cursor: available > 0 ? 'pointer' : 'not-allowed',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      boxShadow: available > 0 ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Zap size={13} /> Consume
                                  </button>

                                  {Array.isArray(item.consumptionHistory) && item.consumptionHistory.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setViewHistoryItem(item); }}
                                      title="View Stock Consumption Log History"
                                      style={{
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        padding: '6px 9px',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <HistoryIcon size={13} />
                                    </button>
                                  )}
                                </div>
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
          })
        )}
      </div>

      {/* Pagination Footer */}
      {groupedOrders.length > 0 && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '24px'
        }}>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
      </>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: QC HOLD STORE SECTION                                        */}
      {/* ==================================================================== */}
      {activeStoreTab === 'qchold' && (
        <div>
          {/* QC Hold KPIs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#991b1b', fontSize: '0.85rem', fontWeight: '700' }}>
                <span>Active Quarantine Hold Batches</span>
                <ShieldAlert size={18} color="#dc2626" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#7f1d1d', marginTop: '8px' }}>
                {qcHoldItems.length} <span style={{ fontSize: '0.88rem', color: '#991b1b', fontWeight: '600' }}>Batches</span>
              </div>
            </div>

            <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#991b1b', fontSize: '0.85rem', fontWeight: '700' }}>
                <span>Total Pending Hold Weight</span>
                <Scale size={18} color="#dc2626" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#991b1b', marginTop: '8px' }}>
                {qcHoldItems.reduce((acc, item) => acc + Number(item.remainingHoldKg || 0), 0).toFixed(2)} <span style={{ fontSize: '0.88rem', color: '#991b1b' }}>kg</span>
              </div>
            </div>

            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857', fontSize: '0.85rem', fontWeight: '700' }}>
                <span>Approved & Released</span>
                <CheckCircle size={18} color="#059669" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#047857', marginTop: '8px' }}>
                {qcHoldItems.reduce((acc, item) => acc + Number(item.approvedKg || 0), 0).toFixed(2)} <span style={{ fontSize: '0.88rem', color: '#047857' }}>kg</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: '0.85rem', fontWeight: '700' }}>
                <span>Scrapped from Hold</span>
                <Trash2 size={18} color="#64748b" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#334155', marginTop: '8px' }}>
                {qcHoldItems.reduce((acc, item) => acc + Number(item.scrappedKg || 0), 0).toFixed(2)} <span style={{ fontSize: '0.88rem', color: '#475569' }}>kg</span>
              </div>
            </div>
          </div>

          {/* QC Hold Table */}
          <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(220,38,38,0.06)' }}>
            <div style={{ background: 'linear-gradient(90deg, #fef2f2 0%, #fff 100%)', padding: '16px 20px', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#dc2626" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#7f1d1d', margin: 0 }}>
                  QC Hold Store — Quarantine Items ({qcHoldItems.length})
                </h3>
              </div>
              <span style={{ fontSize: '0.78rem', color: '#991b1b', background: '#fee2e2', padding: '4px 10px', borderRadius: '6px', fontWeight: '700', border: '1px solid #fca5a5' }}>
                🚨 EXPLICIT 'QC HOLD MATERIAL' STICKERS APPLIED
              </span>
            </div>

            {qcHoldItems.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                <ShieldCheck size={40} style={{ margin: '0 auto 12px', display: 'block', color: '#10b981' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#334155' }}>No active materials in QC Hold Quarantine</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                  When consuming SFG or FG goods, select "QC Hold Store" in Target Process / Stage to send items here.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#fff5f5', borderBottom: '1px solid #fca5a5', color: '#7f1d1d', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '12px 16px' }}>QC Tag / Barcode</th>
                      <th style={{ padding: '12px 16px' }}>Job Name & Order</th>
                      <th style={{ padding: '12px 16px' }}>Substrate & Size</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Hold (kg)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Pending Hold (kg)</th>
                      <th style={{ padding: '12px 16px' }}>Rolls / Weights</th>
                      <th style={{ padding: '12px 16px' }}>Hold Reason</th>
                      <th style={{ padding: '12px 16px' }}>Inspector & Date</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>QC Action Options</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qcHoldItems.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #fee2e2' }}>
                        
                        {/* Tag Barcode */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: '900', color: '#991b1b', background: '#fee2e2', padding: '3px 8px', borderRadius: '5px', border: '1px solid #fca5a5', display: 'inline-block' }}>
                            {item.barcodeId}
                          </div>
                          <div style={{ marginTop: '4px' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedRollForBarcodeModal(item)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.74rem', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: 0 }}
                            >
                              <QrCode size={12} /> Print Sticker
                            </button>
                          </div>
                        </td>

                        {/* Job & Order */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{item.jobName}</div>
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '2px' }}>
                            {item.orderId ? `Order #${item.orderId}` : item.jobCode} | Client: <strong>{item.clientName}</strong>
                          </div>
                        </td>

                        {/* Substrate */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.84rem' }}>{item.filmType}</div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{item.micron}µm × {item.widthMm}mm</div>
                        </td>

                        {/* Total Hold */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {item.totalHoldKg.toFixed(2)} kg
                        </td>

                        {/* Pending Hold Balance */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#991b1b', background: '#fee2e2', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fca5a5', display: 'inline-block' }}>
                            {item.remainingHoldKg.toFixed(2)} kg
                          </span>
                        </td>

                        {/* Rolls */}
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#334155' }}>
                          <div style={{ fontWeight: '700' }}>{item.numberOfRolls} Roll(s)</div>
                          {Array.isArray(item.rollWeights) && item.rollWeights.length > 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              ({item.rollWeights.join(', ')} kg)
                            </div>
                          )}
                        </td>

                        {/* Hold Reason */}
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#991b1b', fontWeight: '700', maxWidth: '200px' }}>
                          {item.holdReason}
                        </td>

                        {/* Inspector & Date */}
                        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap' }}>
                          <div>Inspector: <strong>{item.operatorName}</strong></div>
                          <div style={{ color: '#64748b', marginTop: '2px' }}>Date: {item.date} ({item.shift})</div>
                        </td>

                        {/* Action Options: Approve & Move to Store vs Send to Scrap */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            
                            {/* Option 1: Approve & Move to Store */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQcItemForApprove(item);
                                setApproveQtyKg(item.remainingHoldKg.toString());
                                setApproveReason('');
                                setApproveFormError('');
                              }}
                              style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                              }}
                            >
                              <ShieldCheck size={14} /> Approve & Move to Store
                            </button>

                            {/* Option 2: Send to Scrap */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQcItemForScrap(item);
                                setScrapQtyKg(item.remainingHoldKg.toString());
                                setDefectCategory('Delamination / Bonding Failure');
                                setScrapReason('');
                                setScrapFormError('');
                              }}
                              style={{
                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
                              }}
                            >
                              <Trash2 size={14} /> Send to Scrap
                            </button>

                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 3: SCRAP STORE SECTION                                          */}
      {/* ==================================================================== */}
      {activeStoreTab === 'scrap' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#64748b" /> Scrap Store Inventory Log ({scrapItems.length})
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Record of all defective materials rejected and transferred to Scrap Store from QC Hold Quarantine.
              </p>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#dc2626', background: '#fef2f2', padding: '8px 16px', borderRadius: '10px', border: '1px solid #fca5a5' }}>
              Total Scrapped: {scrapItems.reduce((acc, i) => acc + Number(i.scrapQtyKg || 0), 0).toFixed(2)} kg
            </div>
          </div>

          {scrapItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              <Trash2 size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#475569' }}>Scrap store is currently empty</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px' }}>Original Tag Ref</th>
                    <th style={{ padding: '10px 14px' }}>Job Name & Order</th>
                    <th style={{ padding: '10px 14px' }}>Substrate & Size</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Scrap Weight (kg)</th>
                    <th style={{ padding: '10px 14px' }}>Defect Category</th>
                    <th style={{ padding: '10px 14px' }}>Scrap Reason & Remarks</th>
                    <th style={{ padding: '10px 14px' }}>Transferred By & Date</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: '700', color: '#dc2626' }}>
                        {item.holdTagId}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{item.jobName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.orderId} | Client: {item.clientName}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {item.filmType} ({item.micron}µm × {item.widthMm}mm)
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '900', color: '#dc2626' }}>
                        {item.scrapQtyKg.toFixed(2)} kg
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                          {item.defectCategory}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569', fontSize: '0.8rem' }}>
                        {item.scrapReason}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.76rem' }}>
                        <div>{item.scrappedBy}</div>
                        <div>{item.date}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: APPROVE & MOVE TO STORE                                       */}
      {/* ==================================================================== */}
      {selectedQcItemForApprove && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={20} /> Approve & Move to Store
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#a7f3d0', marginTop: '2px' }}>
                  Release QC Hold material back to SFG/FG store for production consumption
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQcItemForApprove(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmApproveMove} style={{ padding: '24px' }}>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: '700', color: '#047857' }}>{selectedQcItemForApprove.jobName} ({selectedQcItemForApprove.barcodeId})</div>
                <div style={{ color: '#065f46', marginTop: '2px' }}>
                  Pending Hold Weight: <strong>{Number(selectedQcItemForApprove.remainingHoldKg).toFixed(2)} kg</strong> | Rolls: {selectedQcItemForApprove.numberOfRolls}
                </div>
                <div style={{ color: '#047857', fontSize: '0.78rem', marginTop: '4px' }}>
                  Initial Hold Reason: <em>{selectedQcItemForApprove.holdReason}</em>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                  Quantity to Approve & Move to Store (kg) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedQcItemForApprove.remainingHoldKg}
                    value={approveQtyKg}
                    onChange={(e) => setApproveQtyKg(e.target.value)}
                    placeholder={`Max ${selectedQcItemForApprove.remainingHoldKg} kg`}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '2px solid #10b981',
                      fontSize: '1rem',
                      fontWeight: '800',
                      outline: 'none'
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setApproveQtyKg(selectedQcItemForApprove.remainingHoldKg.toString())}
                    style={{
                      padding: '10px 14px',
                      background: '#d1fae5',
                      color: '#047857',
                      border: '1px solid #a7f3d0',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Select All ({selectedQcItemForApprove.remainingHoldKg} kg)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                  Approval Reason / Release Justification <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows="3"
                  value={approveReason}
                  onChange={(e) => setApproveReason(e.target.value)}
                  placeholder="Mention why this material is cleared (e.g. Visual re-inspection passed, Client approval obtained, Minor defect within tolerance)..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    fontFamily: 'inherit'
                  }}
                  required
                />
              </div>

              {approveFormError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px', borderRadius: '8px', fontSize: '0.84rem', marginBottom: '16px' }}>
                  ⚠️ {approveFormError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedQcItemForApprove(null)}
                  style={{ padding: '9px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.88rem', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: '8px', fontSize: '0.88rem', color: '#fff', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={18} /> Confirm Approval & Move to Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: SEND TO SCRAP                                                 */}
      {/* ==================================================================== */}
      {selectedQcItemForScrap && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              color: '#ffffff',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trash2 size={20} /> Send to Scrap Store
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '2px' }}>
                  Move defective QC Hold material to scrap storage. Pending balance remains in QC Hold.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQcItemForScrap(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmSendToScrap} style={{ padding: '24px' }}>
              <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: '700', color: '#991b1b' }}>{selectedQcItemForScrap.jobName} ({selectedQcItemForScrap.barcodeId})</div>
                <div style={{ color: '#7f1d1d', marginTop: '2px' }}>
                  Pending Hold Weight: <strong>{Number(selectedQcItemForScrap.remainingHoldKg).toFixed(2)} kg</strong> | Rolls: {selectedQcItemForScrap.numberOfRolls}
                </div>
                <div style={{ color: '#991b1b', fontSize: '0.78rem', marginTop: '4px' }}>
                  Initial Hold Reason: <em>{selectedQcItemForScrap.holdReason}</em>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                  Quantity to Scrap (kg) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedQcItemForScrap.remainingHoldKg}
                    value={scrapQtyKg}
                    onChange={(e) => setScrapQtyKg(e.target.value)}
                    placeholder={`Max ${selectedQcItemForScrap.remainingHoldKg} kg`}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '2px solid #ef4444',
                      fontSize: '1rem',
                      fontWeight: '800',
                      outline: 'none'
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setScrapQtyKg(selectedQcItemForScrap.remainingHoldKg.toString())}
                    style={{
                      padding: '10px 14px',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fca5a5',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Select All ({selectedQcItemForScrap.remainingHoldKg} kg)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                  Defect Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={defectCategory}
                  onChange={(e) => setDefectCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    color: '#0f172a'
                  }}
                >
                  <option value="Delamination / Bonding Failure">Delamination / Bonding Failure</option>
                  <option value="Shade / Color Variation">Shade / Color Variation</option>
                  <option value="Wrinkles / Creases / Telescoping">Wrinkles / Creases / Telescoping</option>
                  <option value="Misregistration / Print Shift">Misregistration / Print Shift</option>
                  <option value="Scuffing / Scratches / Ink Flaking">Scuffing / Scratches / Ink Flaking</option>
                  <option value="Pinholes / Contamination / Spots">Pinholes / Contamination / Spots</option>
                  <option value="Substrate Defects / Gauge Variation">Substrate Defects / Gauge Variation</option>
                  <option value="Other Rejection Defect">Other Rejection Defect</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                  Scrap Reason / Defect Remarks <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows="3"
                  value={scrapReason}
                  onChange={(e) => setScrapReason(e.target.value)}
                  placeholder="Detail the exact defect or rejection notes triggering scrap..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    fontFamily: 'inherit'
                  }}
                  required
                />
              </div>

              {scrapFormError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px', borderRadius: '8px', fontSize: '0.84rem', marginBottom: '16px' }}>
                  ⚠️ {scrapFormError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedQcItemForScrap(null)}
                  style={{ padding: '9px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.88rem', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', border: 'none', borderRadius: '8px', fontSize: '0.88rem', color: '#fff', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Trash2 size={18} /> Confirm Move to Scrap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CONSUME SFG FOR DOWNSTREAM PROCESSING                         */}
      {/* ==================================================================== */}
      {selectedItemForConsume && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '620px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={20} color="#60a5fa" />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>
                    Consume Material for Process
                  </h3>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Record actual SFG / FG material consumed for downstream lamination, slitting, pouching or dispatch
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForConsume(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmConsumeSFG} style={{ padding: '24px' }}>
              
              {/* SFG Target Details Summary */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>JOB NAME:</span>
                    <div style={{ fontWeight: '700', color: '#0f172a' }}>{selectedItemForConsume.jobName}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>BATCH BARCODE:</span>
                    <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}>{selectedItemForConsume.sfgBatchCode}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>SUBSTRATE & SIZE:</span>
                    <div style={{ fontWeight: '600', color: '#334155' }}>
                      {selectedItemForConsume.filmType} ({selectedItemForConsume.micron}µm × {selectedItemForConsume.widthMm}mm)
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>STORAGE LOCATION:</span>
                    <div style={{ fontWeight: '600', color: '#334155' }}>{selectedItemForConsume.storageBay || 'Bay A'}</div>
                  </div>
                </div>
              </div>

              {/* Live Weight Balance Calculation Card */}
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: '600' }}>INITIAL NET WT</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1e3a8a' }}>
                      {Number(selectedItemForConsume.totalNetKg || 0).toFixed(2)} kg
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: '600' }}>PREVIOUSLY CONSUMED</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#c2410c' }}>
                      {Number(selectedItemForConsume.consumedKg || 0).toFixed(2)} kg
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: '700' }}>CURRENT AVAILABLE</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#15803d' }}>
                      {(selectedItemForConsume.availableKg !== undefined 
                        ? Number(selectedItemForConsume.availableKg) 
                        : Math.max(0, Number(selectedItemForConsume.totalNetKg || 0) - Number(selectedItemForConsume.consumedKg || 0))
                      ).toFixed(2)} kg
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                
                {/* Consumed Weight Input with Weighing Scale button */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                    Actual Consumed Weight (kg) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="e.g. 45.50"
                      value={consumedWeightKg}
                      onChange={(e) => setConsumedWeightKg(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        fontSize: '1.1rem',
                        fontWeight: '800',
                        borderRadius: '8px',
                        border: '2px solid #3b82f6',
                        color: '#0f172a',
                        background: '#ffffff',
                        outline: 'none'
                      }}
                      required
                    />
                    <WeighingScaleCaptureButton
                      onWeightCaptured={(weight) => setConsumedWeightKg(weight.toString())}
                    />
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '4px' }}>
                    Enter exact weight removed from stock for processing or capture directly from weighing scale.
                  </div>
                </div>

                {/* Target Process */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Target Process / Stage <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={targetProcess}
                    onChange={(e) => setTargetProcess(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: targetProcess === 'QC Hold Store' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      fontWeight: targetProcess === 'QC Hold Store' ? '800' : 'normal',
                      color: targetProcess === 'QC Hold Store' ? '#991b1b' : '#0f172a',
                      background: targetProcess === 'QC Hold Store' ? '#fff5f5' : '#ffffff'
                    }}
                  >
                    <option value="Lamination (Pass 1)">Lamination (Pass 1)</option>
                    <option value="Lamination (Pass 2)">Lamination (Pass 2)</option>
                    <option value="Slitting & Rewinding">Slitting & Rewinding</option>
                    <option value="Pouching / Bag Making">Pouching / Bag Making</option>
                    <option value="Dispatch Packing">Dispatch Packing</option>
                    <option value="Printing (Pass 2)">Printing (Pass 2)</option>
                    <option value="QC Inspection & Rewinding">QC Inspection & Rewinding</option>
                    <option value="QC Hold Store">🚨 QC Hold Store (Quarantine)</option>
                    <option value="Custom Stage">Other Process Stage</option>
                  </select>
                </div>

                {/* Conditional QC Hold Quarantine Controls */}
                {targetProcess === 'QC Hold Store' && (
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ background: '#fff5f5', border: '2px solid #dc2626', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontWeight: '900', fontSize: '0.92rem' }}>
                        <ShieldAlert size={20} color="#dc2626" />
                        QC HOLD QUARANTINE MOVEMENT
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#7f1d1d', marginTop: '4px' }}>
                        Selected quantity will be moved to <strong>QC Hold Store</strong>. A quarantine barcode sticker explicitly stating <strong>'QC HOLD MATERIAL'</strong> will be printed.
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '800', color: '#991b1b', marginBottom: '6px' }}>
                        QC Hold Reason / Defect Justification <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Failed QC inspection - Delamination / Wrinkles / Shade variation"
                        value={holdReason}
                        onChange={(e) => setHoldReason(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '2px solid #dc2626',
                          fontSize: '0.88rem',
                          fontWeight: '700',
                          color: '#991b1b',
                          background: '#fff'
                        }}
                        required
                      />
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <label style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0f172a' }}>
                          Number of Rolls on QC Hold:
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {[1, 2, 3, 4, 5].map(num => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleRollCountChange(num)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                border: holdRollCount === num ? '2px solid #dc2626' : '1px solid #cbd5e1',
                                background: holdRollCount === num ? '#fee2e2' : '#ffffff',
                                color: holdRollCount === num ? '#991b1b' : '#334155',
                                cursor: 'pointer'
                              }}
                            >
                              {num} {num === 1 ? 'Roll' : 'Rolls'}
                            </button>
                          ))}
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={holdRollCount}
                            onChange={(e) => handleRollCountChange(e.target.value)}
                            style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: '700' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: '600' }}>
                          Roll Weights (Capture via weighing scale or direct numeric input):
                        </div>
                        {rollWeights.map((w, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', width: '70px' }}>
                              Roll #{idx + 1}:
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Direct weight input (kg)"
                              value={w}
                              onChange={(e) => handleRollWeightChange(idx, e.target.value)}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.88rem',
                                fontWeight: '700'
                              }}
                            />
                            <WeighingScaleCaptureButton
                              onWeightCaptured={(capturedWeight) => handleRollWeightChange(idx, capturedWeight.toString())}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Target Machine */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Target Machine / Line
                  </label>
                  <select
                    value={targetMachine}
                    onChange={(e) => setTargetMachine(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      color: '#0f172a',
                      background: '#ffffff'
                    }}
                  >
                    <option value="">Select Machine...</option>
                    {machines.map(m => (
                      <option key={m.id || m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Operator Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Operator Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter operator name"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>

                {/* Shift */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Shift
                  </label>
                  <select
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem'
                    }}
                  >
                    <option value="Day Shift">Day Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>

                {/* Notes */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Consumption Notes / Process Remarks
                  </label>
                  <textarea
                    rows="2"
                    placeholder="Add batch details or process remarks..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>

              {/* Form Error Banner */}
              {formError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} />
                  {formError}
                </div>
              )}

              {/* Real-time Post-Consumption Stock Balance Preview */}
              {consumedWeightKg && !isNaN(parseFloat(consumedWeightKg)) && parseFloat(consumedWeightKg) > 0 && (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#166534' }}>
                    NEW REMAINING STOCK BALANCE:
                  </span>
                  <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#14532d' }}>
                    {Math.max(
                      0,
                      (selectedItemForConsume.availableKg !== undefined 
                        ? Number(selectedItemForConsume.availableKg) 
                        : Number(selectedItemForConsume.totalNetKg || 0) - Number(selectedItemForConsume.consumedKg || 0)) - parseFloat(consumedWeightKg)
                    ).toFixed(2)} kg
                  </span>
                </div>
              )}

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedItemForConsume(null)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.88rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={18} /> Confirm & Record Consumption
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: VIEW SFG CONSUMPTION HISTORY LOGS                              */}
      {/* ==================================================================== */}
      {viewHistoryItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '700px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              background: '#0f172a',
              color: '#ffffff',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0 }}>
                  Stock Process Consumption History Log
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  {viewHistoryItem.jobName} ({viewHistoryItem.sfgBatchCode})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewHistoryItem(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px', maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 12px' }}>Date & Time</th>
                    <th style={{ padding: '10px 12px' }}>Target Process</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Consumed (kg)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Balance (kg)</th>
                    <th style={{ padding: '10px 12px' }}>Operator</th>
                    <th style={{ padding: '10px 12px' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewHistoryItem.consumptionHistory || []).map((log, idx) => (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.78rem' }}>
                        {new Date(log.timestamp || log.date).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f172a' }}>
                        {log.targetProcess}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#c2410c' }}>
                        {log.consumedKg} kg
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800', color: '#15803d' }}>
                        {log.remainingBalanceKg} kg
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>
                        {log.operatorName || '-'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.78rem' }}>
                        {log.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setViewHistoryItem(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE NEW SFG OR FG BATCH                                     */}
      {/* ==================================================================== */}
      {newGoodModalMode && (
        <SFGFGEntryModal
          mode={newGoodModalMode}
          orders={orders}
          jobMasters={jobMasters}
          machines={machines}
          currentUser={currentUser}
          onClose={() => setNewGoodModalMode(null)}
          onSave={(inventoryItem, rolls) => {
            if (onSaveSFGGood) {
              onSaveSFGGood(inventoryItem);
            }
            setNewGoodModalMode(null);
          }}
        />
      )}

      {/* ==================================================================== */}
      {/* MODAL: BARCODE TAG PRINTER                                            */}
      {/* ==================================================================== */}
      {selectedRollForBarcodeModal && (
        <BarcodePrinterModal
          roll={selectedRollForBarcodeModal}
          onClose={() => setSelectedRollForBarcodeModal(null)}
        />
      )}

    </div>
  );
}
