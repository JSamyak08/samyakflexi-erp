import React, { useState, useMemo } from 'react';
import { 
  Droplet, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  ShoppingBag, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  TrendingUp, 
  DollarSign, 
  FileText, 
  Info, 
  Filter, 
  Sparkles,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Printer,
  Calendar,
  Check,
  X,
  Tag
} from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import PurchaseOrderPDF from './PurchaseOrderPDF';

export default function InkManagement({
  inks = [],
  vendors = [],
  currentUser,
  onAddInk,
  onUpdateInk,
  onDeleteInk,
  onUpdateInkPrice,
  onSaveOrder
}) {
  const isAuthorized = currentUser?.role === 'Admin' || 
                       currentUser?.role === 'Plant Manager' || 
                       currentUser?.role === 'Store Manager' || 
                       currentUser?.role === 'Purchase Manager' || 
                       currentUser?.role === 'QC Chemist';
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'Plant Manager';

  // Sub-tabs: 'directory' | 'calculator' | 'stock'
  const [activeSubTab, setActiveSubTab] = useState('directory');

  // Search & Filter State for Directory
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All'); // 'All' | 'Surface Ink' | 'Reverse Ink'
  const [filterSupplier, setFilterSupplier] = useState('All');
  const [filterStockStatus, setFilterStockStatus] = useState('All'); // 'All' | 'Low Stock' | 'In Stock'

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingInk, setEditingInk] = useState(null);
  const [priceUpdateInk, setPriceUpdateInk] = useState(null);
  const [deleteConfirmInk, setDeleteConfirmInk] = useState(null);
  const [activePoPdfData, setActivePoPdfData] = useState(null);
  const [stockAdjustInk, setStockAdjustInk] = useState(null);

  // Form State for Add / Edit Ink Product Code
  const [productCode, setProductCode] = useState('');
  const [shade, setShade] = useState('');
  const [inkType, setInkType] = useState('Reverse Ink'); // 'Reverse Ink' or 'Surface Ink'
  const [manufacturer, setManufacturer] = useState('DIC Inks');
  const [supplierId, setSupplierId] = useState('');
  const [solidContentPct, setSolidContentPct] = useState(40);
  const [solidVariationPct, setSolidVariationPct] = useState(2);
  const [pricePerKg, setPricePerKg] = useState(300);
  const [stockQtyKg, setStockQtyKg] = useState(200);
  const [reorderLevelKg, setReorderLevelKg] = useState(100);
  const [solventType, setSolventType] = useState('Ethyl Acetate + IPA');
  const [notes, setNotes] = useState('');

  // Form State for Price Update Modal
  const [newPrice, setNewPrice] = useState('');
  const [priceEffectiveDate, setPriceEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [priceReason, setPriceReason] = useState('Supplier price adjustment');

  // Form State for Stock Adjustment Modal
  const [adjustType, setAdjustType] = useState('Inward'); // 'Inward' or 'Consumption'
  const [adjustQtyKg, setAdjustQtyKg] = useState('');
  const [adjustRemarks, setAdjustRemarks] = useState('');

  // ---------------------------------------------------------------------------
  // 8-COLOR LIQUID INK COST CALCULATOR STATE (Up to 8 Stations)
  // ---------------------------------------------------------------------------
  const defaultStations = Array.from({ length: 8 }, (_, i) => ({
    stationNo: i + 1,
    enabled: i < 4, // default first 4 active
    inkId: '',
    mixRatioPct: i === 0 ? 40 : (i < 4 ? 20 : 0)
  }));
  const [colorStations, setColorStations] = useState(defaultStations);
  const [solventDilutionPct, setSolventDilutionPct] = useState(25); // +25% solvent addition in press
  const [solventPricePerLiter, setSolventPricePerLiter] = useState(115); // ₹115/L solvent cost

  // Open Add Ink Modal
  const openAddModal = () => {
    setEditingInk(null);
    setProductCode('');
    setShade('');
    setInkType('Reverse Ink');
    setManufacturer('DIC Inks');
    setSupplierId((vendors || []).length > 0 ? vendors[0].id : '');
    setSolidContentPct(40);
    setSolidVariationPct(2);
    setPricePerKg(300);
    setStockQtyKg(200);
    setReorderLevelKg(100);
    setSolventType('Ethyl Acetate + IPA');
    setNotes('');
    setIsAddModalOpen(true);
  };

  // Open Edit Ink Modal
  const openEditModal = (ink) => {
    setEditingInk(ink);
    setProductCode(ink.productCode || '');
    setShade(ink.shade || '');
    setInkType(ink.inkType || 'Reverse Ink');
    setManufacturer(ink.manufacturer || 'DIC Inks');
    setSupplierId(ink.supplierId || '');
    setSolidContentPct(ink.solidContentPct || 40);
    setSolidVariationPct(ink.solidVariationPct || 2);
    setPricePerKg(ink.pricePerKg || 0);
    setStockQtyKg(ink.stockQtyKg || 0);
    setReorderLevelKg(ink.reorderLevelKg || 0);
    setSolventType(ink.solventType || 'Ethyl Acetate + IPA');
    setNotes(ink.notes || '');
    setIsAddModalOpen(true);
  };

  // Open Price Update Modal
  const openPriceUpdateModal = (ink) => {
    setPriceUpdateInk(ink);
    setNewPrice(ink.pricePerKg || '');
    setPriceEffectiveDate(new Date().toISOString().split('T')[0]);
    setPriceReason('Supplier price revision');
  };

  // Save Add / Edit Ink
  const handleSaveInkForm = (e) => {
    e.preventDefault();
    if (!productCode.trim() || !shade.trim()) {
      alert("Manufacturer Product Code and Shade Name are required!");
      return;
    }

    const matchedVendor = vendors.find(v => String(v.id) === String(supplierId));
    const suppName = matchedVendor ? (matchedVendor.companyName || matchedVendor.name) : 'Standard Supplier';

    const inkObj = {
      id: editingInk ? editingInk.id : `INK-${Date.now().toString().slice(-6)}`,
      productCode: productCode.trim().toUpperCase(),
      shade: shade.trim(),
      inkType,
      manufacturer: manufacturer.trim(),
      supplierId: supplierId || null,
      supplierName: suppName,
      solidContentPct: parseFloat(solidContentPct) || 40,
      solidVariationPct: parseFloat(solidVariationPct) || 2,
      pricePerKg: parseFloat(pricePerKg) || 0,
      stockQtyKg: parseFloat(stockQtyKg) || 0,
      reorderLevelKg: parseFloat(reorderLevelKg) || 0,
      unit: 'Kg',
      solventType: solventType.trim(),
      notes: notes.trim(),
      priceHistory: editingInk ? (editingInk.priceHistory || []) : [
        { price: parseFloat(pricePerKg) || 0, date: new Date().toISOString().split('T')[0], reason: 'Initial onboarding rate' }
      ],
      createdAt: editingInk ? editingInk.createdAt : new Date().toISOString()
    };

    if (editingInk) {
      if (onUpdateInk) onUpdateInk(inkObj);
    } else {
      if (onAddInk) onAddInk(inkObj);
    }

    setIsAddModalOpen(false);
  };

  // Save Price Update
  const handleSavePriceUpdate = (e) => {
    e.preventDefault();
    if (!priceUpdateInk || !newPrice || isNaN(parseFloat(newPrice))) {
      alert("Please enter a valid price!");
      return;
    }

    const updatedPriceNum = parseFloat(newPrice);
    const updatedHistory = [
      { price: updatedPriceNum, date: priceEffectiveDate, reason: priceReason || 'Supplier rate update' },
      ...(priceUpdateInk.priceHistory || [])
    ];

    const updatedInk = {
      ...priceUpdateInk,
      pricePerKg: updatedPriceNum,
      priceHistory: updatedHistory
    };

    if (onUpdateInkPrice) {
      onUpdateInkPrice(updatedInk, updatedPriceNum, priceReason);
    } else if (onUpdateInk) {
      onUpdateInk(updatedInk);
    }

    setPriceUpdateInk(null);
    alert(`Price updated successfully for ${priceUpdateInk.productCode} (${priceUpdateInk.shade}) to ₹${updatedPriceNum}/kg!`);
  };

  // Save Stock Adjustment
  const handleSaveStockAdjust = (e) => {
    e.preventDefault();
    if (!stockAdjustInk || !adjustQtyKg || isNaN(parseFloat(adjustQtyKg))) {
      alert("Please enter a valid quantity!");
      return;
    }

    const qty = parseFloat(adjustQtyKg);
    const curStock = parseFloat(stockAdjustInk.stockQtyKg) || 0;
    const newStock = adjustType === 'Inward' ? curStock + qty : Math.max(0, curStock - qty);

    const updatedInk = {
      ...stockAdjustInk,
      stockQtyKg: newStock
    };

    if (onUpdateInk) onUpdateInk(updatedInk);
    setStockAdjustInk(null);
    setAdjustQtyKg('');
    setAdjustRemarks('');
    alert(`Stock updated for ${stockAdjustInk.productCode}. New Stock: ${newStock} kg`);
  };

  // Issue Purchase Order to Supplier (Relaying Manufacturer Product Code)
  const handleIssuePoForInk = (ink) => {
    const matchedVendor = vendors.find(v => String(v.id) === String(ink.supplierId)) || {
      companyName: ink.supplierName || 'DIC India Ltd',
      name: ink.supplierName || 'DIC India Ltd',
      address: 'Industrial Area, Sector 3, Pithampur / Indore (M.P.)',
      gstin: '23AAACD1020K1Z5',
      contactPerson: 'Sales Executive',
      phone: '9826001122',
      email: 'sales@inksupplier.com'
    };

    const reorderDefQty = Math.max(100, (parseFloat(ink.reorderLevelKg) * 2) - parseFloat(ink.stockQtyKg));

    const poData = {
      poNumber: `SIL/PO/26-27/${Math.floor(1000 + Math.random() * 9000)}`,
      poDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      vendor: matchedVendor,
      items: [
        {
          id: 1,
          itemId: ink.productCode, // MANUFACTURER PRODUCT CODE RELAYED IN PO
          description: `${ink.shade} (${ink.inkType}) - Solid Content: ${ink.solidContentPct}% (±${ink.solidVariationPct}%)`,
          make: ink.manufacturer || 'DIC Inks',
          hsnCode: '3215',
          qtyKg: reorderDefQty,
          rate: ink.pricePerKg
        }
      ]
    };

    setActivePoPdfData(poData);
  };

  // Delete Ink Confirm
  const handleDeleteInkExecute = () => {
    if (deleteConfirmInk && onDeleteInk) {
      onDeleteInk(deleteConfirmInk.id);
      setDeleteConfirmInk(null);
    }
  };

  // Filtering Ink Directory
  const filteredInks = useMemo(() => {
    return (inks || []).filter(i => {
      const matchSearch = (i.productCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (i.shade || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (i.manufacturer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (i.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchType = filterType === 'All' || i.inkType === filterType;
      const matchSupplier = filterSupplier === 'All' || String(i.supplierId) === String(filterSupplier);
      
      const isLow = (parseFloat(i.stockQtyKg) || 0) < (parseFloat(i.reorderLevelKg) || 0);
      const matchStock = filterStockStatus === 'All' || 
                         (filterStockStatus === 'Low Stock' && isLow) || 
                         (filterStockStatus === 'In Stock' && !isLow);

      return matchSearch && matchType && matchSupplier && matchStock;
    });
  }, [inks, searchTerm, filterType, filterSupplier, filterStockStatus]);

  const pagination = usePagination(filteredInks, 10);

  // Surface Inks vs Reverse Inks Division Lists
  const surfaceInks = useMemo(() => (inks || []).filter(i => i.inkType === 'Surface Ink'), [inks]);
  const reverseInks = useMemo(() => (inks || []).filter(i => i.inkType === 'Reverse Ink'), [inks]);

  const surfaceStockKg = useMemo(() => (surfaceInks || []).reduce((a, b) => a + (parseFloat(b.stockQtyKg) || 0), 0), [surfaceInks]);
  const surfaceValuation = useMemo(() => (surfaceInks || []).reduce((a, b) => a + ((parseFloat(b.stockQtyKg) || 0) * (parseFloat(b.pricePerKg) || 0)), 0), [surfaceInks]);

  const reverseStockKg = useMemo(() => (reverseInks || []).reduce((a, b) => a + (parseFloat(b.stockQtyKg) || 0), 0), [reverseInks]);
  const reverseValuation = useMemo(() => (reverseInks || []).reduce((a, b) => a + ((parseFloat(b.stockQtyKg) || 0) * (parseFloat(b.pricePerKg) || 0)), 0), [reverseInks]);

  const totalStockKg = surfaceStockKg + reverseStockKg;
  const lowStockCount = useMemo(() => (inks || []).filter(i => (parseFloat(i.stockQtyKg) || 0) < (parseFloat(i.reorderLevelKg) || 0)).length, [inks]);

  // Overall Average 100% Solid Equivalent Cost calculation
  const overallAvgSolidEquivalentCost = useMemo(() => {
    if (!inks || inks.length === 0) return 0;
    const validInks = inks.filter(i => (parseFloat(i.solidContentPct) || 0) > 0);
    if (validInks.length === 0) return 0;
    const sumSolidCost = validInks.reduce((sum, i) => {
      const solidPct = parseFloat(i.solidContentPct) || 40;
      const mult = 100 / solidPct;
      const solidCost = (parseFloat(i.pricePerKg) || 0) * mult;
      return sum + solidCost;
    }, 0);
    return sumSolidCost / validInks.length;
  }, [inks]);

  // ---------------------------------------------------------------------------
  // CALCULATOR LOGIC FOR UP TO 8 COLORS
  // ---------------------------------------------------------------------------
  const updateStationField = (index, field, value) => {
    setColorStations(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const calculatedMix = useMemo(() => {
    const activeStations = colorStations.filter(s => s.enabled && s.inkId);
    let totalMixPct = 0;
    let weightedPriceSum = 0;
    let weightedSolidPctSum = 0;
    let weightedSolidCostSum = 0;

    const stationRows = activeStations.map(s => {
      const ink = inks.find(i => String(i.id) === String(s.inkId));
      const ratioPct = parseFloat(s.mixRatioPct) || 0;
      totalMixPct += ratioPct;

      if (!ink) return null;

      const price = parseFloat(ink.pricePerKg) || 0;
      const solidPct = parseFloat(ink.solidContentPct) || 40;
      const mult = solidPct > 0 ? (100 / solidPct) : 1;
      const solidCost100 = price * mult;

      weightedPriceSum += price * (ratioPct / 100);
      weightedSolidPctSum += solidPct * (ratioPct / 100);
      weightedSolidCostSum += solidCost100 * (ratioPct / 100);

      return {
        stationNo: s.stationNo,
        ink,
        ratioPct,
        price,
        solidPct,
        mult,
        solidCost100,
        contribPrice: price * (ratioPct / 100)
      };
    }).filter(Boolean);

    // Press dilution calculation
    const dilutionFactor = 1 + ((parseFloat(solventDilutionPct) || 0) / 100);
    const solventContrib = ((parseFloat(solventDilutionPct) || 0) / 100) * (parseFloat(solventPricePerLiter) || 115);
    const pressReadyCostPerKg = (weightedPriceSum + solventContrib) / dilutionFactor;

    return {
      activeStationsCount: stationRows.length,
      totalMixPct,
      weightedPricePerKg: totalMixPct > 0 ? (weightedPriceSum / (totalMixPct / 100)) : 0,
      weightedSolidPct: totalMixPct > 0 ? (weightedSolidPctSum / (totalMixPct / 100)) : 0,
      weightedSolidCost100: totalMixPct > 0 ? (weightedSolidCostSum / (totalMixPct / 100)) : 0,
      pressReadyCostPerKg,
      stationRows
    };
  }, [colorStations, inks, solventDilutionPct, solventPricePerLiter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner Navigation & Summary Header */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '10px', color: '#4338ca' }}>
                <Droplet size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                  Ink Management System
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Master Product Codes, Supplier POs, Solid Content Costing & Surface/Reverse Stock Management
                </p>
              </div>
            </div>
          </div>

          {/* Sub-Tab Selector Buttons */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              className={`btn-subtab ${activeSubTab === 'directory' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('directory')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'directory' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'directory' ? 'var(--primary-brand)' : 'var(--text-secondary)',
                fontWeight: activeSubTab === 'directory' ? '700' : '500',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'directory' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem'
              }}
            >
              <FileText size={16} /> Master Directory ({(inks || []).length})
            </button>

            <button
              className={`btn-subtab ${activeSubTab === 'calculator' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('calculator')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'calculator' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'calculator' ? 'var(--primary-brand)' : 'var(--text-secondary)',
                fontWeight: activeSubTab === 'calculator' ? '700' : '500',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'calculator' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem'
              }}
            >
              <Layers size={16} /> 8-Color Solid Cost Calculator
            </button>

            <button
              className={`btn-subtab ${activeSubTab === 'stock' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('stock')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'stock' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'stock' ? 'var(--primary-brand)' : 'var(--text-secondary)',
                fontWeight: activeSubTab === 'stock' ? '700' : '500',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'stock' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem'
              }}
            >
              <Droplet size={16} /> Stock Overview (Surface vs Reverse)
              {lowStockCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '800' }}>
                  {lowStockCount} Alert
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: '600' }}>TOTAL INK STOCK</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              {totalStockKg.toLocaleString()} <span style={{ fontSize: '0.85rem' }}>kg</span>
            </span>
          </div>

          <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: '600' }}>STOCK DIVISION</span>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0369a1' }}>
              Surface: {surfaceStockKg} kg • Reverse: {reverseStockKg} kg
            </span>
          </div>

          <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: '600' }}>AVG SOLID-EQ COST (100%)</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#6366f1' }}>
              ₹ {overallAvgSolidEquivalentCost.toFixed(2)} / kg
            </span>
          </div>

          <div style={{ background: lowStockCount > 0 ? '#fef2f2' : '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${lowStockCount > 0 ? '#fecaca' : '#bbf7d0'}` }}>
            <span style={{ fontSize: '0.75rem', color: lowStockCount > 0 ? '#dc2626' : '#166534', display: 'block', fontWeight: '600' }}>REORDER ALERTS</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: lowStockCount > 0 ? '#dc2626' : '#166534' }}>
              {lowStockCount > 0 ? `${lowStockCount} Below Reserve` : 'All Stocks Normal'}
            </span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SUB-TAB 1: MASTER DIRECTORY OF INK PRODUCT CODES */}
      {/* =================================================================== */}
      {activeSubTab === 'directory' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          
          {/* Header Controls & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
              
              {/* Search input */}
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-control"
                  style={{ paddingLeft: '32px' }}
                  placeholder="Search code, shade, maker..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Ink Type Filter */}
              <select 
                className="form-control" 
                style={{ width: '160px' }}
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="All">All Ink Types</option>
                <option value="Reverse Ink">Reverse Inks Only</option>
                <option value="Surface Ink">Surface Inks Only</option>
              </select>

              {/* Supplier Filter */}
              <select 
                className="form-control" 
                style={{ width: '180px' }}
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
              >
                <option value="All">All Suppliers</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.companyName || v.name}</option>
                ))}
              </select>

              {/* Stock Status Filter */}
              <select 
                className="form-control" 
                style={{ width: '160px' }}
                value={filterStockStatus}
                onChange={e => setFilterStockStatus(e.target.value)}
              >
                <option value="All">All Stock Levels</option>
                <option value="Low Stock">⚠️ Low Stock Alerts</option>
                <option value="In Stock">✅ Sufficient Stock</option>
              </select>

            </div>

            {isAuthorized && (
              <button className="btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add Ink Product Code
              </button>
            )}
          </div>

          {/* Directory Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Manufacturer Product Code</th>
                  <th>Ink Shade Name</th>
                  <th>Printing Application</th>
                  <th>Manufacturer & Supplier</th>
                  <th>Solid Content (%)</th>
                  <th>100% Solid Cost</th>
                  <th>Purchase Price</th>
                  <th>Current Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(pagination.paginatedItems || []).length > 0 ? (
                  pagination.paginatedItems.map(ink => {
                    const solidPct = parseFloat(ink.solidContentPct) || 40;
                    const mult = 100 / solidPct;
                    const solidCost100 = (parseFloat(ink.pricePerKg) || 0) * mult;
                    const isLow = (parseFloat(ink.stockQtyKg) || 0) < (parseFloat(ink.reorderLevelKg) || 0);

                    return (
                      <tr key={ink.id} className={isLow ? 'row-alert-highlight' : ''}>
                        <td>
                          <div style={{ fontWeight: '800', color: 'var(--primary-brand)', fontFamily: 'monospace', fontSize: '0.92rem' }}>
                            {ink.productCode}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Relayed in PO</span>
                        </td>

                        <td>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{ink.shade}</div>
                          {ink.solventType && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{ink.solventType}</span>
                          )}
                        </td>

                        <td>
                          <span className={`badge ${ink.inkType === 'Surface Ink' ? 'badge-info' : 'badge-purple'}`}>
                            {ink.inkType === 'Surface Ink' ? '🖼️ Surface Ink' : '🔄 Reverse Ink'}
                          </span>
                        </td>

                        <td>
                          <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{ink.manufacturer || 'DIC Inks'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ink.supplierName || 'Vendor'}</div>
                        </td>

                        <td>
                          <div style={{ fontWeight: '700', color: '#0284c7' }}>
                            {solidPct}% <span style={{ fontSize: '0.75rem', fontWeight: '500' }}>(±{ink.solidVariationPct || 2}%)</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Range: {(solidPct - (parseFloat(ink.solidVariationPct) || 2)).toFixed(1)}% - {(solidPct + (parseFloat(ink.solidVariationPct) || 2)).toFixed(1)}%
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: '700', color: '#4f46e5' }}>
                            ₹ {solidCost100.toFixed(2)} / kg
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ({mult.toFixed(2)}x solid multiplier)
                          </span>
                        </td>

                        <td>
                          <div style={{ fontWeight: '800', color: 'var(--text-primary)' }}>
                            ₹ {ink.pricePerKg} / kg
                          </div>
                          {Array.isArray(ink.priceHistory) && ink.priceHistory.length > 1 && (
                            <span style={{ fontSize: '0.7rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <TrendingUp size={10} /> Updated {ink.priceHistory[0]?.date}
                            </span>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: '700', color: isLow ? '#dc2626' : 'var(--text-primary)' }}>
                            {ink.stockQtyKg} kg
                          </div>
                          <span className={`badge ${isLow ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                            {isLow ? `⚠️ Low (Reserve: ${ink.reorderLevelKg}kg)` : `Reserve: ${ink.reorderLevelKg}kg`}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => openPriceUpdateModal(ink)}
                              title="Update Supplier Rate"
                            >
                              <DollarSign size={12} /> Rate
                            </button>

                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--primary-brand)' }}
                              onClick={() => handleIssuePoForInk(ink)}
                              title="Issue Purchase Order with Manufacturer Code"
                            >
                              <ShoppingBag size={12} /> PO
                            </button>

                            {isAuthorized && (
                              <button
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => openEditModal(ink)}
                              >
                                <Edit3 size={12} />
                              </button>
                            )}

                            {isAdmin && (
                              <button
                                className="btn-danger-action"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => setDeleteConfirmInk(ink)}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No ink product codes matched your filter parameters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <TablePagination pagination={pagination} />
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 2: AVERAGE COST OF LIQUID INKS CALCULATOR (8 COLORS) */}
      {/* =================================================================== */}
      {activeSubTab === 'calculator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Informational Guidance Banner */}
          <div className="glass-panel" style={{ padding: '20px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <Info size={24} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#1e40af' }}>
                  Liquid Ink Solid Content & Weighted Input Cost Calculator
                </h4>
                <p style={{ fontSize: '0.82rem', color: '#1e3a8a', marginTop: '4px', lineHeight: '1.5' }}>
                  Select up to 8 colors (rotogravure printing stations) to compute the combined weighted input cost of liquid inks based on solid content % (Multiplier = 100 / Solid%).
                </p>
                <div style={{ marginTop: '8px', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem', color: '#1e40af', border: '1px solid #93c5fd' }}>
                  💡 <strong>Rule Note:</strong> Default Liquid Ink costing in the main Pre-Costing modal (`JobPunchingForm`) remains set to ₹1500/kg (incl. solvents). This calculator provides analytical cost transparency for custom ink formulations without overriding job punching baselines.
                </div>
              </div>
            </div>
          </div>

          {/* Calculator Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px' }}>
            
            {/* Color Stations List (1 to 8) */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} style={{ color: 'var(--primary-brand)' }} /> Select Inks for Printing Press Stations (Up to 8 Colors)
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {colorStations.map((st, idx) => {
                  const ink = inks.find(i => String(i.id) === String(st.inkId));
                  const solidPct = ink ? parseFloat(ink.solidContentPct) : 0;
                  const mult = solidPct > 0 ? (100 / solidPct) : 0;
                  const solidCost100 = ink ? (parseFloat(ink.pricePerKg) || 0) * mult : 0;

                  return (
                    <div 
                      key={st.stationNo} 
                      style={{ 
                        background: st.enabled ? '#ffffff' : '#f8fafc', 
                        padding: '14px', 
                        borderRadius: '10px', 
                        border: `1px solid ${st.enabled ? 'var(--primary-brand)' : 'var(--border-color)'}`,
                        opacity: st.enabled ? 1 : 0.6,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        
                        {/* Checkbox Enable Station */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '700', minWidth: '90px' }}>
                          <input 
                            type="checkbox" 
                            checked={st.enabled}
                            onChange={e => updateStationField(idx, 'enabled', e.target.checked)}
                          />
                          Unit #{st.stationNo}
                        </label>

                        {/* Ink Dropdown Selector */}
                        <select 
                          className="form-control" 
                          style={{ flex: 1, minWidth: '220px', fontWeight: ink ? '600' : 'normal' }}
                          disabled={!st.enabled}
                          value={st.inkId}
                          onChange={e => updateStationField(idx, 'inkId', e.target.value)}
                        >
                          <option value="">-- Select Ink Product Code --</option>
                          {inks.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.productCode} — {i.shade} ({i.inkType}) • {i.solidContentPct}% Solid @ ₹{i.pricePerKg}/kg
                            </option>
                          ))}
                        </select>

                        {/* Mix Share % */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '110px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mix %:</span>
                          <input 
                            type="number" 
                            className="form-control"
                            style={{ textAlign: 'center', fontWeight: '700' }}
                            disabled={!st.enabled || !st.inkId}
                            value={st.mixRatioPct}
                            onChange={e => updateStationField(idx, 'mixRatioPct', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      {/* Detail Metrics Row if Ink Selected */}
                      {st.enabled && ink && (
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Application: <strong style={{ color: ink.inkType === 'Surface Ink' ? '#0284c7' : '#8b5cf6' }}>{ink.inkType}</strong>
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Solid Content: <strong>{ink.solidContentPct}%</strong> (Multiplier: <strong>{mult.toFixed(2)}x</strong>)
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Liquid Rate: <strong>₹{ink.pricePerKg}/kg</strong>
                          </span>
                          <span style={{ color: '#4338ca', fontWeight: '700', marginLeft: 'auto' }}>
                            100% Solid Cost: ₹{solidCost100.toFixed(2)}/kg
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Calculations Summary Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '24px', background: '#f8fafc' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  Formulation Cost Summary
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>TOTAL MIX RATIO SHARE</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: calculatedMix.totalMixPct === 100 ? '#059669' : '#d97706' }}>
                      {calculatedMix.totalMixPct}% {calculatedMix.totalMixPct !== 100 && '(Adjust to reach 100%)'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>WEIGHTED AVG LIQUID INK COST</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary-brand)' }}>
                      ₹ {calculatedMix.weightedPricePerKg.toFixed(2)} / kg
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>WEIGHTED AVG SOLID CONTENT</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0284c7' }}>
                      {calculatedMix.weightedSolidPct.toFixed(2)} %
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>AVG 100% SOLID-EQUIVALENT COST</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#4338ca' }}>
                      ₹ {calculatedMix.weightedSolidCost100.toFixed(2)} / kg
                    </div>
                  </div>

                  {/* Solvent Press Viscosity Estimator */}
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '8px' }}>
                    <h5 style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>
                      Solvent Press Dilution Estimator
                    </h5>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Solvent Added %:</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                          value={solventDilutionPct}
                          onChange={e => setSolventDilutionPct(parseFloat(e.target.value) || 0)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Solvent Rate (₹/L):</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                          value={solventPricePerLiter}
                          onChange={e => setSolventPricePerLiter(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: '700', paddingTop: '6px', borderTop: '1px solid #e2e8f0' }}>
                      Net Press Ready Cost: ₹{calculatedMix.pressReadyCostPerKg.toFixed(2)} / kg
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 3: BIRD'S EYE VIEW STOCK OVERVIEW (SURFACE VS REVERSE INKS) */}
      {/* =================================================================== */}
      {activeSubTab === 'stock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Surface Inks vs Reverse Inks Dual Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            {/* SURFACE INKS STOCK PANEL */}
            <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid #0284c7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0369a1' }}>
                    🖼️ Surface Inks Stock
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Used exclusively for surface printing jobs</p>
                </div>
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  {(surfaceInks || []).length} Product Codes
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '600' }}>TOTAL SURFACE STOCK</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0284c7' }}>
                    {surfaceStockKg.toLocaleString()} kg
                  </div>
                </div>

                <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '600' }}>SURFACE STOCK VALUATION</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0284c7' }}>
                    ₹ {surfaceValuation.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Surface Inks List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                {surfaceInks.map(ink => {
                  const isLow = (parseFloat(ink.stockQtyKg) || 0) < (parseFloat(ink.reorderLevelKg) || 0);
                  const pct = ink.reorderLevelKg > 0 ? Math.min(100, Math.round((ink.stockQtyKg / (ink.reorderLevelKg * 2)) * 100)) : 100;

                  return (
                    <div key={ink.id} style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--primary-brand)', fontFamily: 'monospace' }}>{ink.productCode}</strong>
                          <span style={{ fontSize: '0.82rem', marginLeft: '8px', fontWeight: '600' }}>{ink.shade}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.85rem', color: isLow ? '#dc2626' : 'var(--text-primary)' }}>
                            {ink.stockQtyKg} kg
                          </span>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                            onClick={() => { setStockAdjustInk(ink); setAdjustQtyKg(''); setAdjustRemarks(''); }}
                          >
                            Adjust
                          </button>
                        </div>
                      </div>

                      {/* Stock Bar */}
                      <div style={{ background: '#e2e8f0', height: '6px', borderRadius: '4px', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ background: isLow ? '#ef4444' : '#0284c7', height: '100%', width: `${pct}%`, transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* REVERSE INKS STOCK PANEL */}
            <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#6d28d9' }}>
                    🔄 Reverse Inks Stock
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Used exclusively for reverse printing jobs</p>
                </div>
                <span className="badge badge-purple" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  {(reverseInks || []).length} Product Codes
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#f5f3ff', padding: '12px', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                  <span style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: '600' }}>TOTAL REVERSE STOCK</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#7c3aed' }}>
                    {reverseStockKg.toLocaleString()} kg
                  </div>
                </div>

                <div style={{ background: '#f5f3ff', padding: '12px', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                  <span style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: '600' }}>REVERSE STOCK VALUATION</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#7c3aed' }}>
                    ₹ {reverseValuation.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Reverse Inks List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                {reverseInks.map(ink => {
                  const isLow = (parseFloat(ink.stockQtyKg) || 0) < (parseFloat(ink.reorderLevelKg) || 0);
                  const pct = ink.reorderLevelKg > 0 ? Math.min(100, Math.round((ink.stockQtyKg / (ink.reorderLevelKg * 2)) * 100)) : 100;

                  return (
                    <div key={ink.id} style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--primary-brand)', fontFamily: 'monospace' }}>{ink.productCode}</strong>
                          <span style={{ fontSize: '0.82rem', marginLeft: '8px', fontWeight: '600' }}>{ink.shade}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.85rem', color: isLow ? '#dc2626' : 'var(--text-primary)' }}>
                            {ink.stockQtyKg} kg
                          </span>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                            onClick={() => { setStockAdjustInk(ink); setAdjustQtyKg(''); setAdjustRemarks(''); }}
                          >
                            Adjust
                          </button>
                        </div>
                      </div>

                      {/* Stock Bar */}
                      <div style={{ background: '#e2e8f0', height: '6px', borderRadius: '4px', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ background: isLow ? '#ef4444' : '#8b5cf6', height: '100%', width: `${pct}%`, transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Reorder Alerts Action List */}
          {lowStockCount > 0 && (
            <div className="glass-panel" style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fecaca' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <AlertTriangle size={20} /> Low Stock Reorder Action Center ({lowStockCount} Items Below Reserve)
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {inks.filter(i => (parseFloat(i.stockQtyKg) || 0) < (parseFloat(i.reorderLevelKg) || 0)).map(ink => (
                  <div key={ink.id} style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '800', color: '#b91c1c', fontFamily: 'monospace' }}>{ink.productCode}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: '600' }}>{ink.shade} ({ink.inkType})</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Stock: <strong style={{ color: '#dc2626' }}>{ink.stockQtyKg} kg</strong> (Reserve: {ink.reorderLevelKg} kg)
                      </div>
                    </div>

                    <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem', background: '#dc2626' }} onClick={() => handleIssuePoForInk(ink)}>
                      <ShoppingBag size={12} /> Issue PO
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: ADD / EDIT INK PRODUCT CODE */}
      {/* =================================================================== */}
      {isAddModalOpen && (
        <div className="pdf-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1100 }}>
          <div className="glass-panel" style={{ width: '720px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px', background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #cbd5e1', padding: '0' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '20px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff', margin: 0 }}>
                  <Droplet size={22} style={{ color: '#818cf8' }} />
                  {editingInk ? 'Edit Ink Product Code' : 'Add New Ink Product Code'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', margin: 0 }}>
                  Define manufacturer product codes, solid content %, prices & stock reserves for supplier PO issuance.
                </p>
              </div>
              <button 
                type="button"
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer', transition: 'all 0.2s' }} 
                onClick={() => setIsAddModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveInkForm} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Section 1: Product & Application Identification */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={15} style={{ color: '#4f46e5' }} /> 1. Product Identification & Application
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Manufacturer Product Code *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. DIC-WHT-808"
                      value={productCode}
                      onChange={e => setProductCode(e.target.value)}
                      required
                      style={{ fontWeight: '700', color: '#4f46e5', fontFamily: 'monospace', fontSize: '0.95rem' }}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>📌 Code relayed directly in Supplier POs</span>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Ink Shade Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Process Magenta / White"
                      value={shade}
                      onChange={e => setShade(e.target.value)}
                      required
                      style={{ fontSize: '0.95rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Printing Application Type *</label>
                    <select className="form-control" value={inkType} onChange={e => setInkType(e.target.value)} style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                      <option value="Reverse Ink">🔄 Reverse Ink (Only for Reverse jobs)</option>
                      <option value="Surface Ink">🖼️ Surface Ink (Only for Surface jobs)</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Manufacturer Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. DIC Inks, Flint, Hubergroup"
                      value={manufacturer}
                      onChange={e => setManufacturer(e.target.value)}
                      style={{ fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Preferred Vendor / Supplier *</label>
                  <select className="form-control" value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                    <option value="">-- Select Preferred Supplier --</option>
                    {(vendors || []).map(v => (
                      <option key={v.id} value={v.id}>{v.companyName || v.name} ({v.gstin || 'No GSTIN'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

              {/* Section 2: Technical & Solid Content Specifications */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={15} style={{ color: '#0284c7' }} /> 2. Technical & Solid Content Specs
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>Solid Content %</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      placeholder="40"
                      value={solidContentPct}
                      onChange={e => setSolidContentPct(parseFloat(e.target.value) || 0)}
                    />
                    <span style={{ fontSize: '0.7rem', color: '#0369a1', marginTop: '4px', display: 'block', fontWeight: '600' }}>
                      Multiplier: {solidContentPct > 0 ? (100 / solidContentPct).toFixed(2) : 0}x
                    </span>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>Var. Acceptance %</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      placeholder="2"
                      value={solidVariationPct}
                      onChange={e => setSolidVariationPct(parseFloat(e.target.value) || 0)}
                    />
                    <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px', display: 'block' }}>Acceptable tolerance</span>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: '600', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>Solvent System</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Ethyl Acetate + IPA"
                      value={solventType}
                      onChange={e => setSolventType(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

              {/* Section 3: Pricing & Inventory Thresholds */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DollarSign size={15} style={{ color: '#059669' }} /> 3. Commercial Pricing & Inventory Reserve
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: '700', color: '#047857', marginBottom: '4px', display: 'block' }}>Purchase Price (₹/kg) *</label>
                    <input
                      type="number"
                      className="form-control"
                      style={{ fontWeight: '800', color: '#047857' }}
                      value={pricePerKg}
                      onChange={e => setPricePerKg(parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: '600', marginBottom: '4px', display: 'block' }}>Initial Stock Qty (kg)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={stockQtyKg}
                      onChange={e => setStockQtyKg(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: '600', marginBottom: '4px', display: 'block' }}>Reorder Reserve (kg)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={reorderLevelKg}
                      onChange={e => setReorderLevelKg(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Notes & TDS */}
              <div>
                <label className="form-label" style={{ fontWeight: '600', marginBottom: '6px', display: 'block' }}>Notes & Technical Data Sheet (TDS) Specs</label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Viscosity specs, pigment strength, storage recommendations..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize: 'vertical', width: '100%' }}
                />
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" style={{ padding: '8px 18px' }} onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 22px', fontWeight: '700' }}>
                  <Check size={16} /> Save Ink Product Code
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: UPDATE INK PRICE */}
      {/* =================================================================== */}
      {priceUpdateInk && (
        <div className="pdf-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1100 }}>
          <div className="glass-panel" style={{ width: '480px', maxWidth: '92vw', borderRadius: '16px', background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #cbd5e1', padding: '0' }}>
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '18px 22px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                  Update Rate — {priceUpdateInk.productCode}
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px', margin: 0 }}>
                  Supplier price revision tracking & audit history log
                </p>
              </div>
              <button 
                type="button" 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }} 
                onClick={() => setPriceUpdateInk(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '22px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Current Purchase Rate:</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>₹{priceUpdateInk.pricePerKg} / kg</span>
              </div>

              <form onSubmit={handleSavePriceUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>New Rate per Kg (₹) *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    style={{ fontWeight: '800', fontSize: '1.15rem', color: '#047857' }}
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Effective Date *</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={priceEffectiveDate}
                    onChange={e => setPriceEffectiveDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '600', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Reason for Rate Change</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Supplier price revision Q3"
                    value={priceReason}
                    onChange={e => setPriceReason(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                  <button type="button" className="btn-secondary" style={{ padding: '8px 16px' }} onClick={() => setPriceUpdateInk(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ padding: '8px 20px', fontWeight: '700' }}>Update Rate</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: STOCK ADJUSTMENT */}
      {/* =================================================================== */}
      {stockAdjustInk && (
        <div className="pdf-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1100 }}>
          <div className="glass-panel" style={{ width: '480px', maxWidth: '92vw', borderRadius: '16px', background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #cbd5e1', padding: '0' }}>
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '18px 22px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                  Stock Adjustment — {stockAdjustInk.productCode}
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px', margin: 0 }}>
                  Record press issue or inward GRN receipt
                </p>
              </div>
              <button 
                type="button" 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }} 
                onClick={() => setStockAdjustInk(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '22px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Current Stock Qty:</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0284c7' }}>{stockAdjustInk.stockQtyKg} kg</span>
              </div>

              <form onSubmit={handleSaveStockAdjust} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Adjustment Type *</label>
                  <select className="form-control" value={adjustType} onChange={e => setAdjustType(e.target.value)} style={{ fontWeight: '600' }}>
                    <option value="Inward">➕ Inward / Purchase Receipt</option>
                    <option value="Consumption">➖ Press Issue / Consumption</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Quantity (kg) *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 50"
                    value={adjustQtyKg}
                    onChange={e => setAdjustQtyKg(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '600', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Remarks / Batch Reference</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. GRN receipt or shift press issue"
                    value={adjustRemarks}
                    onChange={e => setAdjustRemarks(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                  <button type="button" className="btn-secondary" style={{ padding: '8px 16px' }} onClick={() => setStockAdjustInk(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ padding: '8px 20px', fontWeight: '700' }}>Update Stock</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmInk && (
        <div className="pdf-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1100 }}>
          <div className="glass-panel" style={{ width: '420px', padding: '24px', background: '#ffffff', borderRadius: '16px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <AlertTriangle size={44} style={{ color: '#dc2626', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#991b1b', margin: 0 }}>Delete Ink Product Code?</h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '10px 0 20px 0', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete <strong>{deleteConfirmInk.productCode}</strong> ({deleteConfirmInk.shade})? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button className="btn-secondary" style={{ padding: '8px 20px' }} onClick={() => setDeleteConfirmInk(null)}>Cancel</button>
              <button className="btn-danger-action" style={{ padding: '8px 20px', fontWeight: '700' }} onClick={handleDeleteInkExecute}>Delete Item</button>
            </div>
          </div>
        </div>
      )}

      {/* PO PREVIEW MODAL IF ISSUED */}
      {activePoPdfData && (
        <PurchaseOrderPDF 
          poData={activePoPdfData}
          onClose={() => setActivePoPdfData(null)}
        />
      )}

    </div>
  );
}
