import React, { useState, useMemo } from 'react';
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
  History,
  QrCode,
  Zap,
  ChevronRight,
  ShieldCheck,
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

      return { 
        ...item, 
        filmType: rawFilm, 
        micron: rawMicron, 
        widthMm: rawWidth, 
        clientName: rawClient, 
        orderId: resolvedOrderId 
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

  // Pagination
  const { paginatedItems, totalPages, currentPage, setCurrentPage } = usePagination(filteredItems, 12);

  // Handle Consume Modal Open
  const handleOpenConsumeModal = (item) => {
    setSelectedItemForConsume(item);
    setConsumedWeightKg('');
    setTargetProcess('Lamination (Pass 1)');
    setTargetMachine(machines[0]?.name || '');
    setOperatorName(currentUser?.fullName || currentUser?.username || '');
    setShift('Day Shift');
    setNotes('');
    setFormError('');
  };

  // Submit Consume SFG
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
      notes
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

    setSelectedItemForConsume(null);
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

      {/* Metric Cards */}
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

      {/* SFG & FG Inventory Table */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 16px' }}>SFG / FG Barcode</th>
                <th style={{ padding: '14px 16px' }}>Job Code & Name</th>
                <th style={{ padding: '14px 16px' }}>Order & Client</th>
                <th style={{ padding: '14px 16px' }}>Substrate & Size</th>
                <th style={{ padding: '14px 16px' }}>Stock Type</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Initial Net (kg)</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Consumed (kg)</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Available Balance (kg)</th>
                <th style={{ padding: '14px 16px' }}>Bay</th>
                <th style={{ padding: '14px 16px' }}>Status</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                    <Layers size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#475569' }}>No SFG or FG inventory batches found</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Click "+ Add SFG Batch" or "+ Add FG Batch" to record stock job-wise & order-wise.</div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const net = Number(item.totalNetKg) || 0;
                  const consumed = Number(item.consumedKg) || 0;
                  const available = item.availableKg !== undefined ? Number(item.availableKg) : Math.max(0, net - consumed);

                  // Status badge style
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
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0f172a', fontSize: '0.84rem', background: '#f8fafc', padding: '3px 8px', borderRadius: '5px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
                          {item.sfgBatchCode}
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedRollForBarcodeModal(item)}
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

                      {/* Job Code & Name */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                          {item.jobName || 'Untitled Job'}
                        </div>
                        {item.jobCode && item.jobCode !== 'N/A' && (
                          <span style={{ fontSize: '0.74rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', marginTop: '2px', display: 'inline-block' }}>
                            {item.jobCode}
                          </span>
                        )}
                      </td>

                      {/* Order & Client */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#0f172a', fontWeight: '600' }}>
                          {item.clientName || 'General Client'}
                        </div>
                        {item.orderId && item.orderId !== 'N/A' && item.orderId !== '#N/A' && (
                          <div style={{ fontSize: '0.74rem', color: '#2563eb', fontWeight: '700', marginTop: '2px' }}>
                            Order: #{item.orderId}
                          </div>
                        )}
                      </td>

                      {/* Substrate & Size */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#0f172a', fontWeight: '700', fontSize: '0.86rem' }}>
                          {item.filmType || 'Film Substrate'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>
                          {item.micron ? `${item.micron} Mic` : '12 Mic'} | {item.widthMm ? `${item.widthMm} mm` : '460 mm'}
                        </div>
                      </td>

                      {/* SFG / FG Type */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '0.75rem',
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
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                        {net.toFixed(2)} kg
                      </td>

                      {/* Consumed Weight */}
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '700', color: consumed > 0 ? '#c2410c' : '#94a3b8', whiteSpace: 'nowrap' }}>
                        {consumed.toFixed(2)} kg
                      </td>

                      {/* Available Balance */}
                      <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '0.92rem',
                          fontWeight: '800',
                          color: available > 0 ? '#15803d' : '#94a3b8',
                          background: available > 0 ? '#f0fdf4' : '#f8fafc',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: available > 0 ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                          display: 'inline-block'
                        }}>
                          {available.toFixed(2)} kg
                        </span>
                      </td>

                      {/* Storage Bay */}
                      <td style={{ padding: '14px 16px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: '600' }}>
                        {item.storageBay || item.location || 'Bay A'}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.74rem',
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
                              <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                ⚠️ OVER-AGED ({ageInDays}d &gt; {threshold}d)
                              </span>
                            ) : (
                              <span style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '0.68rem', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                📜 FIFO ({ageInDays}d)
                              </span>
                            );
                          })()}
                        </div>
                      </td>


                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenConsumeModal(item)}
                            disabled={available <= 0}
                            style={{
                              background: available > 0 ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#e2e8f0',
                              color: available > 0 ? '#ffffff' : '#94a3b8',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '7px 14px',
                              fontSize: '0.8rem',
                              fontWeight: '700',
                              cursor: available > 0 ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: available > 0 ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Zap size={14} /> Consume
                          </button>

                          {Array.isArray(item.consumptionHistory) && item.consumptionHistory.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewHistoryItem(item)}
                              title="View Stock Consumption Log History"
                              style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '7px 10px',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                            >
                              <History size={14} />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredItems.length > 0 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

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
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      color: '#0f172a',
                      background: '#ffffff'
                    }}
                  >
                    <option value="Lamination (Pass 1)">Lamination (Pass 1)</option>
                    <option value="Lamination (Pass 2)">Lamination (Pass 2)</option>
                    <option value="Slitting & Rewinding">Slitting & Rewinding</option>
                    <option value="Pouching / Bag Making">Pouching / Bag Making</option>
                    <option value="Dispatch Packing">Dispatch Packing</option>
                    <option value="Printing (Pass 2)">Printing (Pass 2)</option>
                    <option value="QC Inspection & Rewinding">QC Inspection & Rewinding</option>
                    <option value="Custom Stage">Other Process Stage</option>
                  </select>
                </div>

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
