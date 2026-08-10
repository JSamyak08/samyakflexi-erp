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
  Tag,
  FileCheck,
  CheckSquare,
  Square,
  Upload,
  Download
} from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import { generateDocRefNumber, getNextDocRefNumber } from '../services/settingsService';
import { notifyPurchaseOrderIssued } from '../services/emailService';

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
  const [bulkParsedInks, setBulkParsedInks] = useState([]);
  const [isBulkPreviewModalOpen, setIsBulkPreviewModalOpen] = useState(false);

  // PO Issuance Confirmation Modal States
  const [poConfirmInk, setPoConfirmInk] = useState(null);
  const [poModalPoNumber, setPoModalPoNumber] = useState('');
  const [poModalPoDate, setPoModalPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [poModalDeliveryDate, setPoModalDeliveryDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );
  const [poModalVendorId, setPoModalVendorId] = useState('');
  const [poModalFreightTerms, setPoModalFreightTerms] = useState('Freight Included within Indore');
  const [poModalPaymentTerms, setPoModalPaymentTerms] = useState('60 Days Net');
  const [poModalNotes, setPoModalNotes] = useState('');
  const [poModalItems, setPoModalItems] = useState([]);

  // Multi-Select Inks State
  const [selectedInkIds, setSelectedInkIds] = useState([]);

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

  // ---------------------------------------------------------------------------
  // BULK CSV TEMPLATE DOWNLOAD & IMPORT HANDLERS
  // ---------------------------------------------------------------------------
  const handleDownloadInkCsvTemplate = () => {
    const headers = [
      "Product Code",
      "Shade / Colour",
      "Ink Type",
      "Manufacturer",
      "Supplier Name",
      "Solid Content %",
      "Solid Variation %",
      "Price Per Kg (INR)",
      "Stock Qty (Kg)",
      "Reorder Level (Kg)",
      "Solvent Type",
      "Notes"
    ];

    const sampleRows = [
      ["DIC-REV-CYAN-01", "Process Cyan", "Reverse Ink", "DIC Inks", "DIC India Ltd", "42", "2", "320", "200", "80", "Ethyl Acetate + IPA", "High tint strength & adhesion for PET film"],
      ["SIE-SURF-WHITE-02", "Opaque White", "Surface Ink", "Siegwerk", "Siegwerk India", "50", "2", "280", "350", "150", "Toluene + Ethyl Acetate", "High opacity surface white for LDPE"],
      ["FLI-REV-MAGENTA-03", "Process Magenta", "Reverse Ink", "Flint Group", "Flint Group Ltd", "40", "2", "350", "150", "60", "Ethyl Acetate + IPA", "Lamination grade reverse ink"]
    ];

    const csvContent = "data:text/csv;charset=utf-8," + 
      [headers.join(","), ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Ink_Product_Codes_Template_Samyak.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkInkCsvUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        
        if (rawLines.length <= 1) {
          alert("CSV file is empty or only contains headers!");
          return;
        }

        const parseCSVLine = (line) => {
          const result = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              result.push(cur.trim());
              cur = '';
            } else {
              cur += char;
            }
          }
          result.push(cur.trim());
          return result;
        };

        const headerRow = parseCSVLine(rawLines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const getIndex = (keys) => headerRow.findIndex(h => keys.some(k => h.includes(k)));
        
        const codeIdx = getIndex(['productcode', 'code', 'itemcode', 'sku']);
        const shadeIdx = getIndex(['shade', 'colour', 'color', 'name']);
        const typeIdx = getIndex(['inktype', 'type']);
        const mfrIdx = getIndex(['manufacturer', 'mfr', 'maker', 'brand']);
        const suppIdx = getIndex(['supplier', 'vendor']);
        const solidIdx = getIndex(['solidcontent', 'solidpct', 'solid']);
        const solidVarIdx = getIndex(['solidvariation', 'variation']);
        const priceIdx = getIndex(['price', 'rate', 'priceperkg', 'cost']);
        const stockIdx = getIndex(['stock', 'qty', 'stockqty']);
        const reorderIdx = getIndex(['reorder', 'minstock', 'reorderlevel']);
        const solventIdx = getIndex(['solvent', 'solventtype']);
        const notesIdx = getIndex(['notes', 'remark', 'remarks', 'description']);

        const parsedInks = [];
        const existingCodes = new Set((inks || []).map(i => (i.productCode || '').toUpperCase()));

        for (let i = 1; i < rawLines.length; i++) {
          const cols = parseCSVLine(rawLines[i]);
          if (cols.length === 0 || !cols.join('').trim()) continue;

          const codeVal = (codeIdx >= 0 ? cols[codeIdx] : cols[0]) || `INK-CODE-${i}`;
          const shadeVal = (shadeIdx >= 0 ? cols[shadeIdx] : cols[1]) || 'Standard Shade';
          const typeVal = (typeIdx >= 0 ? cols[typeIdx] : cols[2]) || 'Reverse Ink';
          const mfrVal = (mfrIdx >= 0 ? cols[mfrIdx] : cols[3]) || 'DIC Inks';
          const suppVal = (suppIdx >= 0 ? cols[suppIdx] : cols[4]) || '';
          const solidVal = parseFloat(solidIdx >= 0 ? cols[solidIdx] : cols[5]) || 40;
          const solidVarVal = parseFloat(solidVarIdx >= 0 ? cols[solidVarIdx] : cols[6]) || 2;
          const priceVal = parseFloat(priceIdx >= 0 ? cols[priceIdx] : cols[7]) || 300;
          const stockVal = parseFloat(stockIdx >= 0 ? cols[stockIdx] : cols[8]) || 100;
          const reorderVal = parseFloat(reorderIdx >= 0 ? cols[reorderIdx] : cols[9]) || 50;
          const solventVal = (solventIdx >= 0 ? cols[solventIdx] : cols[10]) || 'Ethyl Acetate + IPA';
          const notesVal = (notesIdx >= 0 ? cols[notesIdx] : cols[11]) || '';

          const matchedVendor = vendors.find(v => {
            const vName = (v.companyName || v.name || '').toLowerCase();
            return suppVal && vName.includes(suppVal.toLowerCase());
          });

          const upperCode = codeVal.trim().toUpperCase();
          const isDuplicate = existingCodes.has(upperCode);

          parsedInks.push({
            tempId: `CSV-${i}-${Date.now()}`,
            productCode: upperCode,
            shade: shadeVal.trim(),
            inkType: typeVal.trim() || 'Reverse Ink',
            manufacturer: mfrVal.trim() || 'DIC Inks',
            supplierId: matchedVendor ? matchedVendor.id : null,
            supplierName: matchedVendor ? (matchedVendor.companyName || matchedVendor.name) : (suppVal.trim() || 'Local Supplier'),
            solidContentPct: solidVal,
            solidVariationPct: solidVarVal,
            pricePerKg: priceVal,
            stockQtyKg: stockVal,
            reorderLevelKg: reorderVal,
            unit: 'Kg',
            solventType: solventVal.trim() || 'Ethyl Acetate + IPA',
            notes: notesVal.trim(),
            isDuplicate
          });
        }

        if (parsedInks.length === 0) {
          alert("No valid Ink Product Codes could be parsed from the file.");
          return;
        }

        setBulkParsedInks(parsedInks);
        setIsBulkPreviewModalOpen(true);
      } catch (err) {
        alert("Error reading CSV file. Please ensure it is a valid CSV formatted file.");
        console.error("CSV Upload Error:", err);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmBulkImport = () => {
    if (bulkParsedInks.length === 0) return;

    let countAdded = 0;
    bulkParsedInks.forEach((item, idx) => {
      const inkObj = {
        id: `INK-${Date.now()}-${idx}-${Math.floor(1000 + Math.random() * 9000)}`,
        productCode: item.productCode,
        shade: item.shade,
        inkType: item.inkType,
        manufacturer: item.manufacturer,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        solidContentPct: item.solidContentPct,
        solidVariationPct: item.solidVariationPct,
        pricePerKg: item.pricePerKg,
        stockQtyKg: item.stockQtyKg,
        reorderLevelKg: item.reorderLevelKg,
        unit: 'Kg',
        solventType: item.solventType,
        notes: item.notes,
        priceHistory: [
          { price: item.pricePerKg, date: new Date().toISOString().split('T')[0], reason: 'Bulk CSV Import' }
        ],
        createdAt: new Date().toISOString()
      };

      if (onAddInk) {
        onAddInk(inkObj);
        countAdded++;
      }
    });

    alert(`✅ Success!\n\nImported ${countAdded} Ink Product Codes into Master Directory.`);
    setIsBulkPreviewModalOpen(false);
    setBulkParsedInks([]);
  };

  // Toggle Selection of Ink Item
  const handleToggleInkSelect = (id) => {
    setSelectedInkIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Select / Deselect All Inks in current filtered directory
  const handleSelectAllInks = (e) => {
    if (e.target.checked) {
      setSelectedInkIds(filteredInks.map(i => i.id));
    } else {
      setSelectedInkIds([]);
    }
  };

  // Open Multi-Item or Single-Item PO Modal
  const handleOpenPoModal = (targetInks) => {
    if (!targetInks || targetInks.length === 0) return;

    const firstInk = targetInks[0];
    const matchedVendor = (vendors || []).find(v => String(v.id) === String(firstInk.supplierId) || String(v.companyName || v.name) === String(firstInk.supplierName)) || (vendors || [])[0] || {
      id: 'VEN-01',
      companyName: firstInk.supplierName || 'DIC India Ltd',
      name: firstInk.supplierName || 'DIC India Ltd',
      address: 'Industrial Area, Sector 3, Pithampur / Indore (M.P.)',
      gstin: '23AAACD1020K1Z5',
      contactPerson: 'Sales Executive',
      phone: '9826001122',
      email: 'sales@inksupplier.com'
    };

    const modalItems = targetInks.map(ink => {
      const suggestedQty = Math.max(100, Math.ceil(((parseFloat(ink.reorderLevelKg) || 50) * 2) - (parseFloat(ink.stockQtyKg) || 0)));
      return {
        id: ink.id,
        productCode: ink.productCode,
        shade: ink.shade,
        inkType: ink.inkType,
        solidContentPct: ink.solidContentPct || 40,
        solidVariationPct: ink.solidVariationPct || 2,
        manufacturer: ink.manufacturer || 'DIC Inks',
        hsnCode: '3215',
        qtyKg: suggestedQty,
        rate: parseFloat(ink.pricePerKg) || 300
      };
    });

    setPoModalVendorId(matchedVendor.id || '');
    setPoModalPoNumber(getNextDocRefNumber('po'));
    setPoModalPoDate(new Date().toISOString().split('T')[0]);
    setPoModalDeliveryDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPoModalFreightTerms('Freight Included within Indore');
    setPoModalPaymentTerms(matchedVendor.paymentTerms || '60 Days Net');
    setPoModalNotes(targetInks.length > 1 
      ? `Consolidated PO for ${targetInks.length} Ink Product Code(s). Deliver in 20kg sealed drums with Batch CoA.`
      : `Manufacturer Code: ${firstInk.productCode}. Deliver in 20kg sealed drums. Batch CoA required.`
    );
    setPoModalItems(modalItems);
    setPoConfirmInk(targetInks.length === 1 ? targetInks[0] : { isMulti: true, count: targetInks.length });
  };

  const handleIssuePoForInk = (ink) => {
    handleOpenPoModal([ink]);
  };

  const handleIssueMultiItemPOFromSelection = () => {
    const selectedInks = inks.filter(i => selectedInkIds.includes(i.id));
    if (selectedInks.length === 0) {
      alert("Please select at least one ink product code using checkboxes!");
      return;
    }
    handleOpenPoModal(selectedInks);
  };

  const handleUpdatePoItemField = (id, field, val) => {
    setPoModalItems(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
  };

  const handleRemovePoItem = (id) => {
    setPoModalItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      if (updated.length === 0) {
        setPoConfirmInk(null);
      }
      return updated;
    });
  };

  const handleAddInkToPoModal = (inkId) => {
    const ink = inks.find(i => String(i.id) === String(inkId));
    if (!ink || poModalItems.some(i => i.id === ink.id)) return;
    const suggestedQty = Math.max(100, Math.ceil(((parseFloat(ink.reorderLevelKg) || 50) * 2) - (parseFloat(ink.stockQtyKg) || 0)));
    const newItem = {
      id: ink.id,
      productCode: ink.productCode,
      shade: ink.shade,
      inkType: ink.inkType,
      solidContentPct: ink.solidContentPct || 40,
      solidVariationPct: ink.solidVariationPct || 2,
      manufacturer: ink.manufacturer || 'DIC Inks',
      hsnCode: '3215',
      qtyKg: suggestedQty,
      rate: parseFloat(ink.pricePerKg) || 300
    };
    setPoModalItems(prev => [...prev, newItem]);
  };

  // Confirm and Finalize PO Issuance after User Edit
  const handleConfirmIssuePo = (e) => {
    if (e) e.preventDefault();
    if (!poConfirmInk || poModalItems.length === 0) {
      alert("Please add at least one ink item to the PO!");
      return;
    }

    const matchedVendor = (vendors || []).find(v => String(v.id) === String(poModalVendorId)) || {
      companyName: 'DIC India Ltd',
      name: 'DIC India Ltd',
      address: 'Industrial Area, Sector 3, Pithampur / Indore (M.P.)',
      gstin: '23AAACD1020K1Z5',
      contactPerson: 'Sales Executive',
      phone: '9826001122',
      email: 'sales@inksupplier.com'
    };

    const poDateStr = poModalPoDate ? new Date(poModalPoDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const deliveryDateStr = poModalDeliveryDate ? new Date(poModalDeliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const items = poModalItems.map((item, idx) => {
      const qtyVal = parseFloat(item.qtyKg) || 100;
      const rateVal = parseFloat(item.rate) || 0;
      return {
        id: idx + 1,
        itemId: item.productCode, // MANUFACTURER PRODUCT CODE RELAYED IN PO
        description: `${item.shade} (${item.inkType}) - Solid Content: ${item.solidContentPct}% (±${item.solidVariationPct}%)`,
        make: item.manufacturer || 'DIC Inks',
        hsnCode: item.hsnCode || '3215',
        qtyKg: qtyVal,
        rate: rateVal,
        amount: Number((qtyVal * rateVal).toFixed(2))
      };
    });

    const totalQty = items.reduce((sum, i) => sum + i.qtyKg, 0);
    const totalTaxable = items.reduce((sum, i) => sum + i.amount, 0);

    const poData = {
      poNumber: poModalPoNumber.trim() || getNextDocRefNumber('po'),
      poDate: poDateStr,
      deliveryDate: deliveryDateStr,
      promisedDeliveryDate: deliveryDateStr,
      vendor: matchedVendor,
      category: 'Printing Inks & Toners',
      source: `Ink Management (${items.length} Product Codes)`,
      paymentTerms: poModalPaymentTerms,
      logisticDetails: poModalFreightTerms,
      notes: poModalNotes,
      items: items
    };

    // Save to central samyak_erp_issued_pos store for instant platform reflection
    try {
      const saved = localStorage.getItem('samyak_erp_issued_pos');
      const store = saved ? JSON.parse(saved) : {};
      store[poData.poNumber] = poData;
      localStorage.setItem('samyak_erp_issued_pos', JSON.stringify(store));
    } catch (err) {}

    // Dispatch email notification log
    notifyPurchaseOrderIssued({
      poNumber: poData.poNumber,
      supplierName: matchedVendor.companyName || matchedVendor.name,
      itemName: `${items.length} Ink Product Code(s) (${items.map(i => i.itemId).join(', ')})`,
      qty: totalQty,
      unit: 'kg',
      totalAmount: totalTaxable * 1.18
    }).catch(e => console.warn('Email notify notice:', e));

    setPoConfirmInk(null);
    setSelectedInkIds([]);
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={handleDownloadInkCsvTemplate} 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 14px' }} 
                  title="Download CSV Template with required headers"
                >
                  <Download size={15} /> Download CSV Template
                </button>

                <label 
                  className="btn-secondary" 
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 14px', margin: 0 }} 
                  title="Bulk upload product codes from CSV file"
                >
                  <Upload size={15} /> Bulk Import CSV
                  <input 
                    type="file" 
                    accept=".csv" 
                    style={{ display: 'none' }} 
                    onChange={handleBulkInkCsvUpload} 
                    onClick={e => e.target.value = null} 
                  />
                </label>

                <button className="btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                  <Plus size={16} /> Add Ink Product Code
                </button>
              </div>
            )}
          </div>

          {/* Directory Table */}
          {selectedInkIds.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #e0e7ff 0%, #e0e7ff 100%)', padding: '12px 18px', borderRadius: '10px', border: '1px solid #c7d2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckSquare size={20} style={{ color: '#4338ca' }} />
                <span style={{ fontWeight: '800', color: '#3730a3', fontSize: '0.92rem' }}>
                  {selectedInkIds.length} Ink Product Code(s) Selected for PO
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#ffffff' }} onClick={() => setSelectedInkIds([])}>
                  Clear Selection
                </button>
                <button type="button" className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.84rem', background: '#4f46e5', borderColor: '#4f46e5', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleIssueMultiItemPOFromSelection}>
                  <ShoppingBag size={16} /> Issue Multi-Item PO ({selectedInkIds.length})
                </button>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={filteredInks.length > 0 && selectedInkIds.length === filteredInks.length} 
                      onChange={handleSelectAllInks}
                      title="Select All Inks"
                    />
                  </th>
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
                    const isSelected = selectedInkIds.includes(ink.id);

                    return (
                      <tr key={ink.id} className={isSelected ? 'row-selected-highlight' : (isLow ? 'row-alert-highlight' : '')} style={{ background: isSelected ? '#f0f4ff' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => handleToggleInkSelect(ink.id)}
                          />
                        </td>

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

      {/* =================================================================== */}
      {/* MODAL: CONFIRM & EDIT INK PURCHASE ORDER (PO) - MULTI-ITEM */}
      {/* =================================================================== */}
      {poConfirmInk && (
        <div className="pdf-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1100 }} onClick={() => setPoConfirmInk(null)}>
          <div className="glass-panel" style={{ width: '840px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', borderRadius: '16px', background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #cbd5e1', padding: '0' }} onClick={e => e.stopPropagation()}>
            
            {/* Dark Executive Header */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '18px 24px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '10px', borderRadius: '10px', color: '#818cf8', border: '1px solid rgba(129, 140, 248, 0.3)' }}>
                  <ShoppingBag size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#ffffff', letterSpacing: '-0.01em' }}>
                    Issue Official Purchase Order (PO)
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    {poModalItems.length > 1 
                      ? `Consolidated Multi-Item PO (${poModalItems.length} Ink Product Codes)`
                      : `Relaying Code: ${poModalItems[0]?.productCode || ''} (${poModalItems[0]?.shade || ''})`
                    }
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }} 
                onClick={() => setPoConfirmInk(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleConfirmIssuePo} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Section 1: PO Reference & Dates */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.78rem', color: '#475569', marginBottom: '4px', display: 'block' }}>PO Reference # *</label>
                  <input type="text" className="form-control" required style={{ fontWeight: '800', color: '#4f46e5', fontFamily: 'monospace' }} value={poModalPoNumber} onChange={e => setPoModalPoNumber(e.target.value)} />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.78rem', color: '#475569', marginBottom: '4px', display: 'block' }}>PO Issue Date *</label>
                  <input type="date" className="form-control" required value={poModalPoDate} onChange={e => setPoModalPoDate(e.target.value)} />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.78rem', color: '#475569', marginBottom: '4px', display: 'block' }}>Promised Delivery Date *</label>
                  <input type="date" className="form-control" required value={poModalDeliveryDate} onChange={e => setPoModalDeliveryDate(e.target.value)} />
                </div>
              </div>

              {/* Section 2: Supplier Vendor Selection */}
              <div>
                <label className="form-label" style={{ fontWeight: '700', color: '#0f172a', marginBottom: '4px', display: 'block' }}>Select Ink Manufacturer / Vendor Supplier *</label>
                <select className="form-control" style={{ fontWeight: '700' }} value={poModalVendorId} onChange={e => setPoModalVendorId(e.target.value)}>
                  {(vendors || []).map(v => (
                    <option key={v.id} value={v.id}>{v.companyName || v.name} ({v.gstin || 'GSTIN N/A'})</option>
                  ))}
                </select>
              </div>

              {/* Section 3: Multi-Item Inks Table */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    🛒 Line Items in Purchase Order ({poModalItems.length})
                  </h4>
                  
                  {/* Add Ink Dropdown inside modal */}
                  <select 
                    className="form-control" 
                    style={{ width: '260px', fontSize: '0.78rem', fontWeight: '600' }}
                    value=""
                    onChange={e => {
                      if (e.target.value) {
                        handleAddInkToPoModal(e.target.value);
                      }
                    }}
                  >
                    <option value="">+ Add Another Ink to PO...</option>
                    {(inks || []).filter(i => !poModalItems.some(mi => mi.id === i.id)).map(i => (
                      <option key={i.id} value={i.id}>+ {i.productCode} - {i.shade}</option>
                    ))}
                  </select>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ width: '30px' }}>#</th>
                        <th>Product Code & Shade</th>
                        <th style={{ width: '130px' }}>Qty (kg)</th>
                        <th style={{ width: '130px' }}>Rate (₹/kg)</th>
                        <th style={{ width: '140px', textAlign: 'right' }}>Taxable Amt</th>
                        <th style={{ width: '40px', textAlign: 'center' }}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poModalItems.map((item, idx) => {
                        const qty = parseFloat(item.qtyKg) || 0;
                        const rate = parseFloat(item.rate) || 0;
                        const lineTotal = qty * rate;
                        return (
                          <tr key={item.id}>
                            <td style={{ fontWeight: '700', color: '#64748b' }}>{idx + 1}</td>
                            <td>
                              <div style={{ fontWeight: '800', color: '#1e293b', fontFamily: 'monospace' }}>{item.productCode}</div>
                              <div style={{ fontSize: '0.75rem', color: '#475569' }}>{item.shade} ({item.inkType}) • Solid: {item.solidContentPct}%</div>
                            </td>
                            <td>
                              <input 
                                type="number" 
                                step="any" 
                                min="1" 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '0.85rem', fontWeight: '700', color: '#047857' }} 
                                value={item.qtyKg} 
                                onChange={e => handleUpdatePoItemField(item.id, 'qtyKg', e.target.value)} 
                              />
                            </td>
                            <td>
                              <input 
                                type="number" 
                                step="any" 
                                min="0" 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '0.85rem', fontWeight: '700', color: '#047857' }} 
                                value={item.rate} 
                                onChange={e => handleUpdatePoItemField(item.id, 'rate', e.target.value)} 
                              />
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: '800', color: '#0f172a' }}>
                              ₹ {lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                type="button" 
                                style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }} 
                                onClick={() => handleRemovePoItem(item.id)}
                                title="Remove line item"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Subtotal & Estimated GST Calculation */}
                {(() => {
                  const subtotal = poModalItems.reduce((sum, item) => sum + ((parseFloat(item.qtyKg) || 0) * (parseFloat(item.rate) || 0)), 0);
                  const gstVal = subtotal * 0.18;
                  const grandTotal = subtotal + gstVal;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5', padding: '12px 16px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                      <div>
                        <span style={{ fontSize: '0.82rem', color: '#065f46', fontWeight: '600' }}>Subtotal (Taxable): </span>
                        <strong style={{ fontSize: '0.98rem', color: '#047857' }}>₹ {subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                        <span style={{ fontSize: '0.82rem', color: '#065f46', marginLeft: '16px', fontWeight: '600' }}>GST (18%): </span>
                        <strong style={{ fontSize: '0.98rem', color: '#047857' }}>₹ {gstVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.82rem', color: '#065f46', fontWeight: '600' }}>Grand Total: </span>
                        <strong style={{ fontSize: '1.15rem', color: '#047857', fontWeight: '900' }}>₹ {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Section 4: Freight & Payment Terms */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#0f172a', marginBottom: '4px', display: 'block' }}>Freight / Delivery Terms *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Freight Included within Indore" value={poModalFreightTerms} onChange={e => setPoModalFreightTerms(e.target.value)} />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', color: '#0f172a', marginBottom: '4px', display: 'block' }}>Payment Terms *</label>
                  <input type="text" className="form-control" required placeholder="e.g. 60 Days Net / 30 Days Net" value={poModalPaymentTerms} onChange={e => setPoModalPaymentTerms(e.target.value)} />
                </div>
              </div>

              {/* Section 5: Vendor Instructions */}
              <div>
                <label className="form-label" style={{ fontWeight: '700', color: '#0f172a', marginBottom: '4px', display: 'block' }}>Special Vendor Instructions & Notes</label>
                <input type="text" className="form-control" placeholder="e.g. Deliver in 20kg sealed drums. Batch CoA & Dyne specs mandatory." value={poModalNotes} onChange={e => setPoModalNotes(e.target.value)} />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '6px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" className="btn-secondary" style={{ padding: '8px 18px' }} onClick={() => setPoConfirmInk(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#4f46e5', borderColor: '#4f46e5', padding: '10px 22px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} /> Confirm & Issue Official PO ({poModalItems.length} Items)
                </button>
              </div>
            </form>
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

      {/* =================================================================== */}
      {/* MODAL: BULK CSV IMPORT PREVIEW */}
      {/* =================================================================== */}
      {isBulkPreviewModalOpen && (
        <div className="pdf-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1100 }}>
          <div className="glass-panel" style={{ width: '920px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px', background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #cbd5e1', padding: '0' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '20px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff', margin: 0 }}>
                  <Upload size={22} style={{ color: '#818cf8' }} />
                  Bulk CSV Import — Ink Product Codes Preview
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', margin: 0 }}>
                  Review parsed ink records before importing into the Master Directory.
                </p>
              </div>
              <button 
                type="button"
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }} 
                onClick={() => { setIsBulkPreviewModalOpen(false); setBulkParsedInks([]); }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Stat summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px 16px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '700', textTransform: 'uppercase' }}>TOTAL CODES TO IMPORT</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>{bulkParsedInks.length}</div>
                </div>

                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '12px 16px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: '700', textTransform: 'uppercase' }}>REVERSE INKS</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#7c3aed', marginTop: '2px' }}>
                    {bulkParsedInks.filter(i => i.inkType.includes('Reverse')).length}
                  </div>
                </div>

                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '12px 16px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '700', textTransform: 'uppercase' }}>SURFACE INKS</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#059669', marginTop: '2px' }}>
                    {bulkParsedInks.filter(i => i.inkType.includes('Surface')).length}
                  </div>
                </div>

                <div style={{ background: bulkParsedInks.some(i => i.isDuplicate) ? '#fffbebf0' : '#f8fafc', border: `1px solid ${bulkParsedInks.some(i => i.isDuplicate) ? '#fde68a' : '#e2e8f0'}`, padding: '12px 16px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: bulkParsedInks.some(i => i.isDuplicate) ? '#b45309' : '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>EXISTING CODES</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: bulkParsedInks.some(i => i.isDuplicate) ? '#d97706' : '#475569', marginTop: '2px' }}>
                    {bulkParsedInks.filter(i => i.isDuplicate).length}
                  </div>
                </div>
              </div>

              {/* Parsed records table */}
              <div style={{ overflowX: 'auto', width: '100%', maxHeight: '380px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff' }}>
                <table className="data-table" style={{ width: '100%', minWidth: '850px', margin: 0, fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '10px', width: '40px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Product Code</th>
                      <th style={{ padding: '10px' }}>Shade</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Ink Type</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Manufacturer</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Supplier</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Solid %</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Rate (₹/Kg)</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Stock (Kg)</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsedInks.map((item, idx) => (
                      <tr key={item.tempId || idx} style={{ background: item.isDuplicate ? '#fffbeb' : 'transparent' }}>
                        <td style={{ textAlign: 'center', fontWeight: '700', padding: '10px' }}>{idx + 1}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: '#0284c7', fontFamily: 'monospace' }}>{item.productCode}</strong>
                        </td>
                        <td style={{ padding: '10px', fontWeight: '600', color: '#0f172a' }}>{item.shade}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                          <span className={`badge ${item.inkType.includes('Reverse') ? 'badge-info' : 'badge-secondary'}`}>
                            {item.inkType}
                          </span>
                        </td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '600' }}>{item.manufacturer}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{item.supplierName}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '700' }}>{item.solidContentPct}%</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '700', color: '#4f46e5' }}>₹ {item.pricePerKg}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '700', color: '#047857' }}>{item.stockQtyKg} Kg</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                          {item.isDuplicate ? (
                            <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                              ⚠️ Existing Code
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                              ✓ New Record
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Need to change columns? <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadInkCsvTemplate(); }} style={{ color: '#0284c7', fontWeight: '700', textDecoration: 'underline' }}>Download CSV Template</a>
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" style={{ padding: '8px 18px' }} onClick={() => { setIsBulkPreviewModalOpen(false); setBulkParsedInks([]); }}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" style={{ background: '#4f46e5', borderColor: '#4f46e5', padding: '10px 22px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleConfirmBulkImport}>
                    <CheckCircle2 size={18} /> Confirm & Import {bulkParsedInks.length} Product Codes
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
