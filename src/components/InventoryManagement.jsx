import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  FileCheck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Download, 
  Upload, 
  Printer, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  Search,
  Filter,
  FileSpreadsheet,
  Bell,
  Edit3,
  Trash2,
  Building2,
  Tag,
  Truck,
  Scale,
  Barcode,
  Scan,
  FileText,
  Check,
  History,
  ChevronDown,
  Layers,
  QrCode,
  Sparkles,
  X
} from 'lucide-react';
import QRCode2D from './QRCode2D';
import GRNPDF from './GRNPDF';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import WeighingScaleInput from './WeighingScaleInput';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import BarcodePrinterModal from './BarcodePrinterModal';
import DispatchPackingListPDF from './DispatchPackingListPDF';
import TablePagination, { usePagination } from './TablePagination';
import { getNextDocRefNumber, generateDocRefNumber } from '../services/settingsService';
import { sanitizeInventoryItem, sanitizeGRN } from '../services/supabaseDataService';
import { 
  isReconciliationDue, 
  FILM_DENSITIES, 
  DEFAULT_DAILY_RATES,
  generateBarcodeId, 
  generateVendorId,
  generateInventoryId,
  PACKAGING_MATERIAL_TYPES,
  initialInventoryRolls, 
  initialDispatchShipments,
  initialStockAdjustments
} from '../factoryStore';

export const INVENTORY_CATEGORIES = [
  "Film Substrates",
  "Printing Inks & Toners",
  "Chemicals & Solvents",
  "Adhesives & Hardener",
  "Doctor Blades & Wipers",
  "Rollers & Sleeves",
  "Machine Spare Parts",
  "Lubricants & Oils",
  "Tapes & Consumables",
  "Safety Gear (PPE)",
  "Packaging & Cores",
  "Other Raw Materials"
];

export const INVENTORY_UOMS = [
  { value: "Kg", label: "Kilograms (Kg)" },
  { value: "Litres", label: "Litres (L)" },
  { value: "Meters", label: "Meters (m)" },
  { value: "Rolls", label: "Rolls" },
  { value: "Boxes", label: "Boxes / Cartons" },
  { value: "Nos", label: "Numbers (Nos)" },
  { value: "Pcs", label: "Pieces (Pcs)" },
  { value: "Sets", label: "Sets" },
  { value: "Bags", label: "Bags" },
  { value: "Drums", label: "Drums" },
  { value: "Sheets", label: "Sheets" }
];

function MaterialItemsCell({ items = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!items || items.length === 0) {
    return <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No items</span>;
  }

  const visibleItems = isExpanded ? items : items.slice(0, 1);
  const hiddenCount = items.length - 1;

  return (
    <div style={{ minWidth: '200px' }}>
      {visibleItems.map((it, idx) => (
        <div key={idx} style={{ fontSize: '0.82rem', marginBottom: '4px' }}>
          • <strong>{it.itemDesc || it.description || 'Material'}</strong>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            PO Qty: <strong>{it.qtyKg || it.qty} kg</strong> @ ₹{it.rate}/kg
          </div>
        </div>
      ))}

      {items.length > 1 && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '4px',
            color: '#1d4ed8',
            fontSize: '0.72rem',
            fontWeight: '700',
            cursor: 'pointer',
            padding: '3px 8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '4px',
            transition: 'all 0.15s ease'
          }}
          title={isExpanded ? "Collapse item list" : "Expand all PO material items"}
        >
          {isExpanded ? (
            <>Show Less ▲</>
          ) : (
            <>+ {hiddenCount} More {hiddenCount === 1 ? 'Item' : 'Items'} (Show More ▼)</>
          )}
        </button>
      )}
    </div>
  );
}

export default function InventoryManagement({ 
  urlParams = {},
  inventory = [], 
  grns = [], 
  vendors = [], 
  orders = [], 
  indents = [],
  inks = [],
  currentUser = null,
  productionRecords = [],
  storeIssueTransactions = [],
  onStoreIssueReturn,
  onAddGRN, 
  onUpdateGRN, 
  onUpdateInventory,
  onAddVendor,
  inventoryRolls = initialInventoryRolls,
  dispatchShipments = initialDispatchShipments,
  onAddRoll,
  onAddDispatchShipment
}) {
  const [activeTab, setActiveTab] = useState('stock'); // stock, grn_inward, qc_approval, issue_return, reconciliation
  const [searchTerm, setSearchTerm] = useState('');

  // Sanitize all inventory and GRN records to guarantee zero envelope leakage into UI
  const safeInventory = useMemo(() => (inventory || []).map(sanitizeInventoryItem), [inventory]);
  const safeGrns = useMemo(() => (grns || []).map(sanitizeGRN), [grns]);

  // Auto-set tab and select item if urlParams is provided
  useEffect(() => {
    if (urlParams) {
      if (urlParams.tab) {
        setActiveTab(urlParams.tab);
      }
      if (urlParams.id && safeInventory && safeInventory.length > 0) {
        const match = safeInventory.find(i => i.id === urlParams.id || i.itemCode === urlParams.id);
        if (match) {
          setSelectedItemForPurchaseHistory(match);
        }
      }
    }
  }, [urlParams?.tab, urlParams?.id, safeInventory]);

  const handleTabClick = (tabKey) => {
    setActiveTab(tabKey);
    pushSlugState('inventory', { tab: tabKey });
  };

  // Modals state
  const [isNewGRNModalOpen, setIsNewGRNModalOpen] = useState(false);
  const [selectedGRNForPDF, setSelectedGRNForPDF] = useState(null);
  const [qcInspectingGRN, setQcInspectingGRN] = useState(null);
  const [qcNotesInput, setQcNotesInput] = useState('');
  const [selectedItemForPurchaseHistory, setSelectedItemForPurchaseHistory] = useState(null);

  // Updatable Barcodes & Stock Ledger Adjustments state
  const [customBarcodesMap, setCustomBarcodesMap] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_custom_barcodes');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [stockLedgerAdjustments, setStockLedgerAdjustments] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_stock_adjustments');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Clean up legacy hardcoded dummy data from local storage
        return parsed.filter(adj => !['ADJ-2026-001', 'ADJ-2026-002'].includes(adj.id));
      }
      return initialStockAdjustments;
    } catch (e) {
      return initialStockAdjustments;
    }
  });

  const [localStoreIssueTransactions, setLocalStoreIssueTransactions] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_store_issue_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const effectiveStoreIssueTransactions = storeIssueTransactions && storeIssueTransactions.length > 0
    ? storeIssueTransactions
    : localStoreIssueTransactions;

  const [editingTxId, setEditingTxId] = useState(null);
  const [editingBarcodeVal, setEditingBarcodeVal] = useState('');

  // Active unapproved jobs filter for Store Issue / Return & Dispatch
  const activeProductionOrders = useMemo(() => {
    return (orders || []).filter(o => {
      if (['Completed', 'Dispatched', 'Delivered', 'Cancelled'].includes(o.status)) {
        return false;
      }
      const prodRec = (productionRecords || []).find(r => 
        r.orderId === o.id || (r.jobName && r.jobName.trim().toLowerCase() === (o.jobName || '').trim().toLowerCase())
      );
      if (prodRec && prodRec.status === 'Approved by Admin') {
        return false;
      }
      return true;
    });
  }, [orders, productionRecords]);

  // Ledger Filter & Quick Adjustment State
  const [ledgerFilterTab, setLedgerFilterTab] = useState('all'); // 'all', 'inward', 'usage', 'reconciliation'
  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('');

  const [isQuickAdjOpen, setIsQuickAdjOpen] = useState(false);
  const [adjType, setAdjType] = useState('Physical Audit (+)');
  const [adjQtyKg, setAdjQtyKg] = useState('');
  const [adjBarcode, setAdjBarcode] = useState('');
  const [adjReason, setAdjReason] = useState('Physical Stock Count Variance');

  // Barcode Printer & Packing List Modals State
  const [selectedRollForBarcodeModal, setSelectedRollForBarcodeModal] = useState(null);
  const [selectedDispatchForPackingList, setSelectedDispatchForPackingList] = useState(null);

  // Dispatch Form State (Scale #4 Station)
  const [isNewDispatchModalOpen, setIsNewDispatchModalOpen] = useState(false);
  const [dispatchJobName, setDispatchJobName] = useState(orders[0]?.jobName || '');
  const [dispatchClientName, setDispatchClientName] = useState(orders[0]?.clientName || '');
  const [dispatchVehicleNo, setDispatchVehicleNo] = useState('');
  const [dispatchLrNo, setDispatchLrNo] = useState('');
  const [dispatchRollsList, setDispatchRollsList] = useState([]);
  const [currentDispatchNetWeight, setCurrentDispatchNetWeight] = useState(0);

  // Barcode Audit Scanner State for Reconciliation
  const [scannedAuditBarcodes, setScannedAuditBarcodes] = useState('');
  const [auditResults, setAuditResults] = useState(null);

  // Vendor Onboarding Modal State inside GRN
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [newVendorCompanyName, setNewVendorCompanyName] = useState('');
  const [newVendorGstin, setNewVendorGstin] = useState('');
  const [newVendorAddress, setNewVendorAddress] = useState('');
  const [newVendorContactPerson, setNewVendorContactPerson] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorBankDetails, setNewVendorBankDetails] = useState('');
  const [newVendorPaymentTerms, setNewVendorPaymentTerms] = useState('30 Days Net');
  const [newVendorMaterials, setNewVendorMaterials] = useState(['PET', 'METPET']);

  const vendorMaterialOptions = [
    "PET", "METPET", "LDPE", "Natural GP LD", "White LD", 
    "BOPP Natural", "Matte Finish BOPP", "Metalised BOPP", "Pearlised BOPP", 
    "CPP Natural", "Metalised CPP", "Liquid Inks", "Solvent-less Adhesive", "Solvents"
  ];

  const handleSaveCustomBarcode = (txId, newBarcodeStr) => {
    if (!newBarcodeStr.trim()) return;
    const updated = { ...customBarcodesMap, [txId]: newBarcodeStr.trim() };
    setCustomBarcodesMap(updated);
    try {
      localStorage.setItem('samyak_erp_custom_barcodes', JSON.stringify(updated));
    } catch (e) {}
    setEditingTxId(null);
    setEditingBarcodeVal('');
  };

  const handleAddLedgerAdjustment = (e, targetItem) => {
    if (e) e.preventDefault();
    const item = targetItem || selectedItemForPurchaseHistory;
    if (!item) return;

    const isNegative = adjType.includes('-');
    const qty = isNegative ? -Math.abs(parseFloat(adjQtyKg) || 0) : Math.abs(parseFloat(adjQtyKg) || 0);
    const newAdj = {
      id: `ADJ-${Date.now()}`,
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName || `${item.filmType} ${item.micron}µ`,
      category: item.category || 'Film Substrates',
      filmType: item.filmType,
      micron: item.micron,
      widthMm: item.widthMm,
      date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      type: adjType,
      qtyKg: qty,
      barcode: adjBarcode.trim() || generateBarcodeId('ADJ'),
      reason: adjReason.trim() || 'Physical Stock Audit Correction',
      adjustedBy: 'Store Mgr Dilip Joshi'
    };

    const updated = [newAdj, ...stockLedgerAdjustments];
    setStockLedgerAdjustments(updated);
    try {
      localStorage.setItem('samyak_erp_stock_adjustments', JSON.stringify(updated));
    } catch (err) {}

    // Update item available stock in main inventory list for the specific item
    if (onUpdateInventory) {
      const updatedInv = inventory.map(invItem => {
        if (invItem.id === item.id) {
          return { ...invItem, availableQtyKg: Math.max(0, (invItem.availableQtyKg || 0) + qty) };
        }
        return invItem;
      });
      onUpdateInventory(updatedInv);
    }

    setIsQuickAdjOpen(false);
    setAdjQtyKg(10);
    setAdjBarcode('');
    setAdjReason('Physical Stock Count Variance');
  };

  const toggleVendorMaterial = (mat) => {
    setNewVendorMaterials(prev => 
      prev.includes(mat) ? prev.filter(m => m !== mat) : [...prev, mat]
    );
  };

  const handleSaveVendorFromGRN = (e) => {
    e.preventDefault();
    if (!newVendorCompanyName.trim() || !newVendorGstin.trim()) {
      alert("Company Name and GSTIN are required!");
      return;
    }

    const createdVendor = {
      id: generateVendorId(),
      name: newVendorCompanyName.trim(),
      companyName: newVendorCompanyName.trim(),
      gstin: newVendorGstin.toUpperCase().trim(),
      address: newVendorAddress.trim(),
      contactPerson: newVendorContactPerson.trim(),
      phone: newVendorPhone.trim(),
      email: newVendorEmail.trim(),
      bankDetails: newVendorBankDetails.trim() || "HDFC Bank | A/C: 502000000000 | IFSC: HDFC0000123",
      materials: newVendorMaterials,
      paymentTerms: newVendorPaymentTerms,
      rating: 5.0
    };

    if (onAddVendor) {
      onAddVendor(createdVendor);
    }

    // Auto select the newly created vendor for the GRN form
    setGrnVendor(createdVendor.companyName);

    // Reset vendor modal state
    setNewVendorCompanyName('');
    setNewVendorGstin('');
    setNewVendorAddress('');
    setNewVendorContactPerson('');
    setNewVendorPhone('');
    setNewVendorEmail('');
    setNewVendorBankDetails('');
    setIsVendorModalOpen(false);

    alert(`Vendor "${createdVendor.companyName}" onboarded successfully and selected for this GRN!`);
  };

  // Save Dispatch Shipment Handler (Scale #4 Station)
  const handleSaveDispatchShipment = (e) => {
    e.preventDefault();
    if (!dispatchJobName || !dispatchClientName || !dispatchVehicleNo) {
      alert("Job Name, Client Name, and Vehicle Number are required for Dispatch!");
      return;
    }

    if (dispatchRollsList.length === 0) {
      alert("Please add at least 1 itemized roll/box to the dispatch shipment!");
      return;
    }

    const matchedOrder = (orders || []).find(o => o.jobName === dispatchJobName);
    const orderId = matchedOrder ? matchedOrder.id : `ORD-2026-${Math.floor(100 + Math.random() * 900)}`;

    const totalNetWeight = dispatchRollsList.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
    const totalGrossWeight = dispatchRollsList.reduce((sum, r) => sum + (parseFloat(r.grossWeightKg) || 0), 0);

    const newShipment = {
      dispatchId: getNextDocRefNumber('dispatch'),
      orderId,
      jobName: dispatchJobName,
      clientName: dispatchClientName,
      vehicleNo: dispatchVehicleNo,
      lrNo: dispatchLrNo || `LR-${Math.floor(10000 + Math.random() * 90000)}-IND`,
      dispatchDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      totalRolls: dispatchRollsList.length,
      totalNetWeightKg: parseFloat(totalNetWeight.toFixed(2)),
      totalGrossWeightKg: parseFloat(totalGrossWeight.toFixed(2)),
      items: dispatchRollsList
    };

    if (onAddDispatchShipment) {
      onAddDispatchShipment(newShipment);
    }

    setIsNewDispatchModalOpen(false);
    setSelectedDispatchForPackingList(newShipment);
    alert(`Dispatch Shipment ${newShipment.dispatchId} created successfully! Generated packing list for ${newShipment.totalRolls} rolls (${newShipment.totalNetWeightKg} kg).`);
  };

  // Issue / Return Modal state
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueType, setIssueType] = useState('issue'); // issue or return
  const [selectedInvItem, setSelectedInvItem] = useState(null);
  const [issueSelectedBatchId, setIssueSelectedBatchId] = useState('');
  const [issueCustomBatchText, setIssueCustomBatchText] = useState('');
  const [issueQtyKg, setIssueQtyKg] = useState('');
  const [issueJobName, setIssueJobName] = useState('');
  const [stockSearchTerm, setStockSearchTerm] = useState('');
  const [issueScanQuery, setIssueScanQuery] = useState('');
  const [scannedItemDetails, setScannedItemDetails] = useState(null);
  const [scanMatchSuccess, setScanMatchSuccess] = useState(false);
  const [scanErrorMessage, setScanErrorMessage] = useState('');
  const [manualSelectMode, setManualSelectMode] = useState(false);

  const openIssueReturnModal = (type = 'issue') => {
    setIssueType(type);
    setSelectedInvItem(null);
    setScannedItemDetails(null);
    setIssueScanQuery('');
    setScanMatchSuccess(false);
    setScanErrorMessage('');
    setIssueQtyKg('');
    setManualSelectMode(false);
    setStockSearchTerm('');
    setIsIssueModalOpen(true);
  };

  // Stock Register Directory Filter State
  const [stockCategoryFilter, setStockCategoryFilter] = useState('ALL');

  // Inward GRN Form State
  const [grnVendor, setGrnVendor] = useState(vendors[0]?.companyName || '');
  const [grnPoNo, setGrnPoNo] = useState('');
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnCategory, setGrnCategory] = useState('Film Substrates');
  const [grnItemName, setGrnItemName] = useState('');
  const [grnFilmType, setGrnFilmType] = useState('PET');
  const [grnMicron, setGrnMicron] = useState('');
  const [grnWidthMm, setGrnWidthMm] = useState('');
  const [grnUnit, setGrnUnit] = useState('Kg');
  const [grnPackagingType, setGrnPackagingType] = useState('Roll');
  const [grnRolls, setGrnRolls] = useState('');
  const [grnWeightKg, setGrnWeightKg] = useState('');
  const [grnPurchaseRate, setGrnPurchaseRate] = useState('');
  const [grnBatchNo, setGrnBatchNo] = useState('');
  const [grnSelectedStockItemId, setGrnSelectedStockItemId] = useState('');
  const [grnItemSearchTerm, setGrnItemSearchTerm] = useState('');
  const [isGrnItemDropdownOpen, setIsGrnItemDropdownOpen] = useState(false);
  const [grnFreightAmount, setGrnFreightAmount] = useState('');
  const [grnTransporterName, setGrnTransporterName] = useState('');

  // Individual Roll / Container Itemized Breakdown State (Each with distinct gross/tare/net weights)
  const [grnItemsList, setGrnItemsList] = useState([
    { id: 'item-1', grossWeightKg: '', tareWeightKg: 0, netWeightKg: '', lengthMeters: '', vendorRollNo: '', notes: '' }
  ]);
  const [grnDefaultTare, setGrnDefaultTare] = useState(0);

  // Helper to calculate theoretical film roll length in meters based on width, micron, density, and net weight
  const calculateFilmRollLength = (netWeight, width, micronVal, filmTypeVal) => {
    const w = parseFloat(width || grnWidthMm);
    const m = parseFloat(micronVal || grnMicron);
    const wt = parseFloat(netWeight);
    const density = FILM_DENSITIES[filmTypeVal || grnFilmType] || 1.40;
    if (w > 0 && m > 0 && wt > 0 && density > 0) {
      return Math.round((wt * 1000000) / (w * m * density));
    }
    return '';
  };

  // Add individual roll / container row
  const handleAddGrnItemRow = (initialData = {}) => {
    const newId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setGrnItemsList(prev => [
      ...prev,
      {
        id: newId,
        grossWeightKg: initialData.grossWeightKg ?? '',
        tareWeightKg: initialData.tareWeightKg ?? (grnDefaultTare || 0),
        netWeightKg: initialData.netWeightKg ?? '',
        lengthMeters: initialData.lengthMeters ?? '',
        vendorRollNo: initialData.vendorRollNo ?? '',
        notes: ''
      }
    ]);
  };

  // Remove individual row (maintains at least 1)
  const handleRemoveGrnItemRow = (id) => {
    setGrnItemsList(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(item => item.id !== id);
    });
  };

  // Update specific field in an item row with auto net weight and length calculations
  const handleUpdateGrnItemRow = (id, field, value) => {
    setGrnItemsList(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      
      if (field === 'grossWeightKg') {
        const gross = parseFloat(value);
        const tare = parseFloat(updated.tareWeightKg) || 0;
        if (!isNaN(gross) && gross > 0) {
          const net = Math.max(0, parseFloat((gross - tare).toFixed(2)));
          updated.netWeightKg = net;
          if (grnCategory === 'Film Substrates') {
            updated.lengthMeters = calculateFilmRollLength(net, grnWidthMm, grnMicron, grnFilmType);
          }
        }
      } else if (field === 'tareWeightKg') {
        const tare = parseFloat(value) || 0;
        const gross = parseFloat(updated.grossWeightKg);
        if (!isNaN(gross) && gross > 0) {
          const net = Math.max(0, parseFloat((gross - tare).toFixed(2)));
          updated.netWeightKg = net;
          if (grnCategory === 'Film Substrates') {
            updated.lengthMeters = calculateFilmRollLength(net, grnWidthMm, grnMicron, grnFilmType);
          }
        }
      } else if (field === 'netWeightKg') {
        const net = parseFloat(value);
        if (!isNaN(net) && net > 0 && grnCategory === 'Film Substrates') {
          updated.lengthMeters = calculateFilmRollLength(net, grnWidthMm, grnMicron, grnFilmType);
        }
      }
      return updated;
    }));
  };

  // Sync count of rows when user edits number of rolls/units
  const handleRollsCountChange = (countVal) => {
    const count = parseInt(countVal, 10);
    setGrnRolls(countVal);
    if (!isNaN(count) && count > 0) {
      setGrnItemsList(prev => {
        if (prev.length === count) return prev;
        if (count > prev.length) {
          const added = [];
          for (let i = prev.length; i < count; i++) {
            added.push({
              id: `item-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 3)}`,
              grossWeightKg: '',
              tareWeightKg: grnDefaultTare || 0,
              netWeightKg: '',
              lengthMeters: '',
              vendorRollNo: '',
              notes: ''
            });
          }
          return [...prev, ...added];
        } else {
          return prev.slice(0, count);
        }
      });
    }
  };

  // Quick helper to distribute total weight across all rows as a starting baseline
  const handleDistributeTotalWeightEvenly = (targetTotalWeight) => {
    const total = parseFloat(targetTotalWeight || grnWeightKg);
    const count = grnItemsList.length;
    if (!isNaN(total) && total > 0 && count > 0) {
      const splitNet = parseFloat((total / count).toFixed(2));
      setGrnItemsList(prev => prev.map(item => {
        const tare = parseFloat(item.tareWeightKg) || 0;
        const gross = parseFloat((splitNet + tare).toFixed(2));
        return {
          ...item,
          grossWeightKg: gross,
          netWeightKg: splitNet,
          lengthMeters: grnCategory === 'Film Substrates' ? calculateFilmRollLength(splitNet, grnWidthMm, grnMicron, grnFilmType) : ''
        };
      }));
    }
  };

  // Apply default core / container tare weight across all rows
  const handleApplyDefaultTare = (newDefaultTare) => {
    setGrnDefaultTare(newDefaultTare);
    const tare = parseFloat(newDefaultTare) || 0;
    setGrnItemsList(prev => prev.map(item => {
      const gross = parseFloat(item.grossWeightKg);
      const updated = { ...item, tareWeightKg: tare };
      if (!isNaN(gross) && gross > 0) {
        const net = Math.max(0, parseFloat((gross - tare).toFixed(2)));
        updated.netWeightKg = net;
        if (grnCategory === 'Film Substrates') {
          updated.lengthMeters = calculateFilmRollLength(net, grnWidthMm, grnMicron, grnFilmType);
        }
      }
      return updated;
    }));
  };

  // Real-time Aggregated Totals from Itemized Breakdown
  const grnCalculatedTotals = useMemo(() => {
    let totalGross = 0;
    let totalTare = 0;
    let totalNet = 0;
    grnItemsList.forEach(item => {
      const g = parseFloat(item.grossWeightKg) || 0;
      const t = parseFloat(item.tareWeightKg) || 0;
      const n = parseFloat(item.netWeightKg) || 0;
      totalGross += g;
      totalTare += t;
      totalNet += n;
    });
    return {
      count: grnItemsList.length,
      totalGross: parseFloat(totalGross.toFixed(2)),
      totalTare: parseFloat(totalTare.toFixed(2)),
      totalNet: parseFloat(totalNet.toFixed(2))
    };
  }, [grnItemsList]);

  // Aggregated available stock batches / inward GRNs for selected item in Store Issue modal
  const availableBatchesForSelectedItem = useMemo(() => {
    if (!selectedInvItem) return [];
    
    // Find all GRNs matching this item
    const matchingGRNs = (safeGrns || []).filter(g => {
      if (g.itemId && (g.itemId === selectedInvItem.id || g.itemId === selectedInvItem.itemCode)) return true;
      const gName = (g.itemName || g.filmType || '').toLowerCase().trim();
      const iName = (selectedInvItem.itemName || selectedInvItem.filmType || '').toLowerCase().trim();
      if (gName && iName && (gName === iName || gName.includes(iName) || iName.includes(gName))) return true;
      return false;
    });

    const batches = [];
    const seenBatchKeys = new Set();

    // 1. Add batches from individual inventory rolls
    (inventoryRolls || []).forEach(r => {
      if (r.itemId === selectedInvItem.id || (r.itemName && r.itemName.toLowerCase() === (selectedInvItem.itemName || '').toLowerCase())) {
        const batchKey = `ROLL_${r.barcodeId || r.id}`;
        if (!seenBatchKeys.has(batchKey)) {
          seenBatchKeys.add(batchKey);
          const rateVal = Number(r.purchaseRatePerKg || selectedInvItem.unitPrice || 0);
          batches.push({
            id: batchKey,
            batchNo: r.batchNo || r.vendorRollNo || r.barcodeId,
            grnNo: r.grnNo || '-',
            vendorName: r.vendorName || selectedInvItem.lastVendor || 'General Vendor',
            purchaseRate: rateVal,
            availableQty: Number(r.availableWeightKg || r.netWeightKg || 0),
            unit: r.unit || selectedInvItem.unit || 'Kg',
            date: r.inwardDatetime || r.date || '',
            barcode: r.barcodeId || r.batchNo,
            label: `Roll ${r.barcodeId} • Batch: ${r.batchNo || r.vendorRollNo || 'N/A'} • Avail: ${r.availableWeightKg || r.netWeightKg || 0} ${r.unit || 'Kg'} • Rate: ₹${rateVal}/${r.unit || 'Kg'}`
          });
        }
      }
    });

    // 2. Add batches from matching GRNs
    matchingGRNs.forEach(g => {
      const batchKey = `GRN_${g.grnNo || g.id}`;
      if (!seenBatchKeys.has(batchKey)) {
        seenBatchKeys.add(batchKey);
        const rateVal = Number(g.purchaseRatePerKg || g.unitPrice || g.purchaseRate || selectedInvItem.unitPrice || 0);
        batches.push({
          id: batchKey,
          batchNo: g.batchNo || `GRN-${g.grnNo}`,
          grnNo: g.grnNo || g.id,
          vendorName: g.vendorName || 'Supplier',
          purchaseRate: rateVal,
          availableQty: Number(g.netWeightKg || 0),
          unit: g.unit || selectedInvItem.unit || 'Kg',
          date: g.receivedDate || '',
          barcode: g.batchNo || `BAR-GRN-${g.grnNo}`,
          label: `GRN #${g.grnNo} • Batch: ${g.batchNo || 'Main Lot'} • Supplier: ${g.vendorName || 'Vendor'} • Inward Qty: ${g.netWeightKg || 0} ${g.unit || 'Kg'} • Rate: ₹${rateVal}/${g.unit || 'Kg'}`
        });
      }
    });

    // 3. Fallback Opening Stock / Master Balance
    const masterBatchKey = `OPENING_${selectedInvItem.id}`;
    if (!seenBatchKeys.has(masterBatchKey)) {
      const masterRate = Number(selectedInvItem.unitPrice || selectedInvItem.purchaseRatePerKg || 0);
      batches.push({
        id: masterBatchKey,
        batchNo: selectedInvItem.lastBatch || `LOT-${selectedInvItem.itemCode || selectedInvItem.id}`,
        grnNo: 'Opening / Master Stock Balance',
        vendorName: selectedInvItem.lastVendor || 'Onboarding Stock Balance',
        purchaseRate: masterRate,
        availableQty: Number(selectedInvItem.availableQtyKg || 0),
        unit: selectedInvItem.unit || 'Kg',
        date: selectedInvItem.lastUpdated || '',
        barcode: selectedInvItem.lastBatch || `BAR-LOT-${selectedInvItem.id}`,
        label: `Stock Balance: ${selectedInvItem.lastBatch || 'Lot ' + selectedInvItem.id} • Avail: ${selectedInvItem.availableQtyKg || 0} ${selectedInvItem.unit || 'Kg'} • Rate: ₹${masterRate}/${selectedInvItem.unit || 'Kg'}`
      });
    }

    return batches;
  }, [selectedInvItem, safeGrns, inventoryRolls]);

  // Ledger Modal Pagination State
  const [ledgerCurrentPage, setLedgerCurrentPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(50);

  const isAdmin = !currentUser || currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'SuperAdmin';

  // PO Directory State
  const [selectedPOForPDF, setSelectedPOForPDF] = useState(null);
  const [poSearchTerm, setPoSearchTerm] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('ALL');

  // Discrepancy Resolution Modal State (Admin Only)
  const [resolvingPoDiscrepancy, setResolvingPoDiscrepancy] = useState(null);
  const [resolutionAction, setResolutionAction] = useState('UPDATE_PO_RATE'); // 'UPDATE_PO_RATE' or 'ENFORCE_PO_RATE'
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [poResolutions, setPoResolutions] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_po_discrepancy_resolutions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Unified Platform-wide Issued Purchase Orders Aggregator
  const unifiedIssuedPOs = React.useMemo(() => {
    const list = [];
    const seenPoNumbers = new Set();

    // 1. Load from localStorage / cached POs
    try {
      const saved = localStorage.getItem('samyak_erp_issued_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.values(parsed).forEach(po => {
          if (po && po.poNumber && !seenPoNumbers.has(po.poNumber)) {
            seenPoNumbers.add(po.poNumber);
            list.push({
              ...po,
              source: po.source || 'Vendor / Purchase Requisition'
            });
          }
        });
      }
    } catch (e) {}

    // 2. Scrape from Order Material Requirements
    (orders || []).forEach(ord => {
      (ord.materialRequirements || []).forEach(r => {
        if (r.poIssued) {
          const poNo = r.poNumber || ord.poNumber || `PO-ORD-${ord.id}`;
          if (!seenPoNumbers.has(poNo)) {
            seenPoNumbers.add(poNo);
            const vendorObj = (vendors || []).find(v => v.companyName === r.preferredVendor || v.name === r.preferredVendor) || {
              companyName: r.preferredVendor || 'FlexiPoly Films Ltd',
              contactPerson: 'Sales Representative',
              phone: '9826001122',
              gstin: '23AAQFC4167Q1ZT'
            };
            let itemRate = 165;
            if ((r.filmType || '').includes('METPET')) itemRate = 185;
            else if ((r.filmType || '').includes('LD')) itemRate = 135;

            list.push({
              poNumber: poNo,
              poDate: ord.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
              promisedDeliveryDate: ord.targetDeliveryDate || new Date(Date.now() + 5*86400000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
              vendor: vendorObj,
              category: 'Film Substrates',
              source: `Order #${ord.id} (${ord.jobName || 'Substrate Requirements'})`,
              items: [{
                id: r.id || 1,
                itemDesc: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''} (${r.widthMm}mm Width)`.trim(),
                filmType: r.filmType,
                micron: r.micron,
                widthMm: r.widthMm,
                qtyKg: r.requiredQtyKg || 500,
                rate: itemRate,
                amount: (r.requiredQtyKg || 500) * itemRate
              }],
              paymentTerms: '60 Days Net',
              logisticDetails: 'Freight Included within Indore'
            });
          }
        }
      });
    });

    // 3. Scrape from Material Indents
    (indents || []).forEach(ind => {
      if (ind.poIssued || ind.poNumber) {
        const poNo = ind.poNumber || `PO-${ind.id}`;
        if (!seenPoNumbers.has(poNo)) {
          seenPoNumbers.add(poNo);
          const vendorObj = (vendors || []).find(v => v.companyName === ind.preferredVendor || v.id === ind.preferredVendor) || {
            companyName: ind.preferredVendor || 'Store Consumable Vendor',
            contactPerson: 'Vendor Rep',
            phone: '9425066225',
            gstin: '23AAQFC4167Q1ZT'
          };
          list.push({
            poNumber: poNo,
            poDate: ind.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            promisedDeliveryDate: ind.promisedDeliveryDate || new Date(Date.now() + 3*86400000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            vendor: vendorObj,
            category: ind.category || 'Store Consumables & Spares',
            source: `Material Indent ${ind.indentNo || ind.id}`,
            items: (ind.items || [{ itemDesc: ind.itemName || 'Store Item', qtyKg: ind.quantity || 100, rate: 250 }]),
            paymentTerms: '30 Days Net',
            logisticDetails: 'Direct Delivery to Store Gate 2'
          });
        }
      }
    });

    // Process & calculate elapsed days, delay time, inward matching, status, and price discrepancy for each PO
    return list.map(po => {
      let poDateObj = new Date(po.poDate);
      if (isNaN(poDateObj.getTime())) {
        const parts = String(po.poDate).split(/[/.-]/);
        if (parts.length === 3) {
          poDateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      }
      const daysElapsed = isNaN(poDateObj.getTime()) ? 0 : Math.max(0, Math.floor((new Date() - poDateObj) / 86400000));

      let promisedDateObj = new Date(po.promisedDeliveryDate || po.deliveryDate);
      if (isNaN(promisedDateObj.getTime())) {
        const parts = String(po.promisedDeliveryDate || po.deliveryDate).split(/[/.-]/);
        if (parts.length === 3) {
          promisedDateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      }
      const isPromisedValid = !isNaN(promisedDateObj.getTime());
      const delayDays = isPromisedValid ? Math.floor((new Date() - promisedDateObj) / 86400000) : 0;

      const matchingGRNs = (grns || []).filter(g => String(g.poNumber || '').trim().toLowerCase() === String(po.poNumber || '').trim().toLowerCase());
      const totalInwardQty = matchingGRNs.reduce((sum, g) => sum + (parseFloat(g.netWeightKg) || parseFloat(g.quantity) || 0), 0);
      const totalPoQty = (po.items || []).reduce((sum, it) => sum + (parseFloat(it.qtyKg) || parseFloat(it.qty) || 0), 0);
      const pendingInwardQty = Math.max(0, totalPoQty - totalInwardQty);

      let deliveryStatus = 'Pending Delivery';
      if (totalInwardQty >= totalPoQty && totalPoQty > 0) {
        deliveryStatus = 'Completed';
      } else if (totalInwardQty > 0) {
        deliveryStatus = 'Partial Delivery';
      }

      let priceDiscrepancy = null;
      let historicalMismatch = null;
      const resolvedInfo = poResolutions[po.poNumber] || po.priceDiscrepancyResolution || null;

      matchingGRNs.forEach(g => {
        const grnRate = parseFloat(g.purchaseRatePerKg || g.purchaseRate || g.unitPrice) || 0;
        (po.items || []).forEach(it => {
          const poRate = parseFloat(it.rate) || 0;
          if (grnRate > 0 && poRate > 0 && Math.abs(grnRate - poRate) > 0.5) {
            const mismatchData = {
              poRate,
              grnRate,
              variance: grnRate - poRate,
              grnNo: g.grnNo,
              itemId: it.itemId || it.id,
              itemName: it.itemDesc || it.description || it.itemName || 'Material Item',
              message: `⚠️ Rate Mismatch: PO Rate ₹${poRate}/kg vs Inward GRN Rate ₹${grnRate}/kg (₹${(grnRate - poRate).toFixed(2)} variance)`
            };
            historicalMismatch = mismatchData;
            if (!resolvedInfo) {
              priceDiscrepancy = mismatchData;
            }
          }
        });
      });

      return {
        ...po,
        daysElapsed,
        promisedDeliveryDate: isPromisedValid ? promisedDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : (po.promisedDeliveryDate || 'Standard 5 Days'),
        delayDays,
        isOverdue: delayDays > 0 && deliveryStatus !== 'Completed',
        totalPoQty,
        totalInwardQty,
        pendingInwardQty,
        deliveryStatus,
        matchingGRNs,
        priceDiscrepancy,
        historicalMismatch,
        priceDiscrepancyResolution: resolvedInfo
      };
    });
  }, [orders, indents, grns, vendors, poResolutions]);

  const handleConfirmResolveDiscrepancy = () => {
    if (!resolvingPoDiscrepancy) return;
    const po = resolvingPoDiscrepancy;
    const mismatch = po.priceDiscrepancy || po.historicalMismatch || {};
    const adminUser = currentUser?.name || 'Administrator';
    const resolvedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const resolutionObj = {
      poNumber: po.poNumber,
      grnNo: mismatch.grnNo || '',
      poRate: mismatch.poRate || 0,
      grnRate: mismatch.grnRate || 0,
      variance: mismatch.variance || 0,
      actionType: resolutionAction, // 'UPDATE_PO_RATE' or 'ENFORCE_PO_RATE'
      summary: resolutionAction === 'UPDATE_PO_RATE'
        ? `Rate Discrepancy Resolved: Accepted Inward GRN rate of ₹${mismatch.grnRate}/kg (Original PO rate: ₹${mismatch.poRate}/kg). PO line item rate updated to match GRN.`
        : `Rate Discrepancy Resolved: Enforced agreed PO contract rate of ₹${mismatch.poRate}/kg (Invoiced GRN: ₹${mismatch.grnRate}/kg). Inward GRN rate adjusted & ₹${Math.abs(mismatch.variance || 0).toFixed(2)}/kg flagged for Vendor Debit Note / Adjustment.`,
      notes: resolutionNotes.trim() || 'Approved by Administration.',
      resolvedBy: adminUser,
      resolvedAt
    };

    // 1. Update poResolutions state & localStorage
    const updatedResolutions = {
      ...poResolutions,
      [po.poNumber]: resolutionObj
    };
    setPoResolutions(updatedResolutions);
    try {
      localStorage.setItem('samyak_po_discrepancy_resolutions', JSON.stringify(updatedResolutions));
    } catch (e) {
      console.error(e);
    }

    // 2. If Option 2 (Enforce PO Rate): update matching GRN in safeGrns / grns
    if (mismatch.grnNo && grns && Array.isArray(grns)) {
      const targetGrn = grns.find(g => g.grnNo === mismatch.grnNo);
      if (targetGrn && onUpdateGRN) {
        onUpdateGRN({
          ...targetGrn,
          purchaseRatePerKg: resolutionAction === 'ENFORCE_PO_RATE' ? mismatch.poRate : targetGrn.purchaseRatePerKg,
          purchaseRate: resolutionAction === 'ENFORCE_PO_RATE' ? mismatch.poRate : targetGrn.purchaseRate,
          unitPrice: resolutionAction === 'ENFORCE_PO_RATE' ? mismatch.poRate : targetGrn.unitPrice,
          priceDiscrepancyResolution: resolutionObj,
          qcNotes: `${targetGrn.qcNotes || ''} [Rate Audit: ${resolutionObj.summary}]`.trim()
        });
      }
    }

    // 3. Update active PDF state if open
    if (selectedPOForPDF && selectedPOForPDF.poNumber === po.poNumber) {
      setSelectedPOForPDF({
        ...selectedPOForPDF,
        priceDiscrepancyResolution: resolutionObj,
        items: resolutionAction === 'UPDATE_PO_RATE'
          ? (selectedPOForPDF.items || []).map(it => ({ ...it, rate: mismatch.grnRate }))
          : selectedPOForPDF.items
      });
    }

    setResolvingPoDiscrepancy(null);
    setResolutionNotes('');
    alert(`✅ Rate discrepancy on PO ${po.poNumber} has been successfully resolved!\n\nAction: ${resolutionObj.summary}\nResolution note has been permanently attached to both PO and GRN.`);
  };

  const handleCreateGRNFromPO = (po) => {
    if (!po) return;
    const firstItem = (po.items || [])[0] || {};
    const poQty = po.pendingInwardQty > 0 ? po.pendingInwardQty : (firstItem.qtyKg || 1000);
    const filmTypeVal = firstItem.filmType || 'PET';
    const micronVal = firstItem.micron || 12;
    const widthVal = firstItem.widthMm || 1000;
    
    setGrnPoNo(po.poNumber || '');
    setGrnVendor(po.vendor?.companyName || po.vendorName || po.vendor?.name || '');
    setGrnCategory(po.category || 'Film Substrates');
    setGrnFilmType(filmTypeVal);
    setGrnMicron(micronVal);
    setGrnWidthMm(widthVal);
    setGrnWeightKg(poQty);
    setGrnPurchaseRate(firstItem.rate || 140);
    setGrnItemName(firstItem.itemDesc || firstItem.description || '');
    setGrnRolls('1');
    
    const initialLen = calculateFilmRollLength(poQty, widthVal, micronVal, filmTypeVal);
    setGrnItemsList([
      {
        id: `item-${Date.now()}-1`,
        grossWeightKg: poQty,
        tareWeightKg: grnDefaultTare || 0,
        netWeightKg: poQty,
        lengthMeters: initialLen,
        vendorRollNo: '',
        notes: ''
      }
    ]);
    
    setActiveTab('grn_inward');
    setIsNewGRNModalOpen(true);
  };

  const handleSelectStockItemForGrn = (item) => {
    if (!item) return;
    const title = item.itemName || `${item.filmType || ''} ${item.micron && item.micron !== '-' ? item.micron + 'µ' : ''} ${item.widthMm && item.widthMm !== '-' ? '(' + item.widthMm + 'mm)' : ''}`.trim();
    
    setGrnSelectedStockItemId(item.id);
    setGrnItemName(title);
    setGrnItemSearchTerm(title);
    
    if (item.category) {
      setGrnCategory(item.category);
    }
    if (item.unit) {
      setGrnUnit(item.unit);
    }
    if (item.filmType) {
      setGrnFilmType(item.filmType);
    }
    if (item.micron && item.micron !== '-') {
      setGrnMicron(item.micron);
    }
    if (item.widthMm && item.widthMm !== '-') {
      setGrnWidthMm(item.widthMm);
    }
    if (item.unitPrice || item.purchaseRatePerKg) {
      setGrnPurchaseRate(item.unitPrice || item.purchaseRatePerKg);
    }
    
    setIsGrnItemDropdownOpen(false);
  };

  const openNewGRNModal = (preselectedItem = null) => {
    setIsNewGRNModalOpen(true);
    setGrnRolls('1');
    setGrnItemsList([
      {
        id: `item-${Date.now()}-1`,
        grossWeightKg: '',
        tareWeightKg: grnDefaultTare || 0,
        netWeightKg: '',
        lengthMeters: '',
        vendorRollNo: '',
        notes: ''
      }
    ]);
    if (preselectedItem) {
      handleSelectStockItemForGrn(preselectedItem);
    } else {
      setGrnItemName('');
      setGrnItemSearchTerm('');
      setGrnSelectedStockItemId('');
      setIsGrnItemDropdownOpen(false);
    }
  };

  const filteredStockItemsForGrn = (safeInventory || []).filter(item => {
    const term = (grnItemSearchTerm || '').toLowerCase().trim();
    const title = (item.itemName || `${item.filmType || ''} ${item.micron || ''} ${item.widthMm || ''}`).toLowerCase();
    const code = (item.itemCode || item.id || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    
    if (!term) return true;
    return title.includes(term) || code.includes(term) || cat.includes(term);
  }).sort((a, b) => {
    const aMatchCat = (a.category || '').toLowerCase() === (grnCategory || '').toLowerCase();
    const bMatchCat = (b.category || '').toLowerCase() === (grnCategory || '').toLowerCase();
    if (aMatchCat && !bMatchCat) return -1;
    if (!aMatchCat && bMatchCat) return 1;
    return 0;
  });

  // Universal Edit Stock Item State
  const [editingStockItem, setEditingStockItem] = useState(null);
  const [editCategory, setEditCategory] = useState('Film Substrates');
  const [editItemName, setEditItemName] = useState('');
  const [editItemCode, setEditItemCode] = useState('');
  const [editUnit, setEditUnit] = useState('Kg');
  const [editFilmType, setEditFilmType] = useState('PET');
  const [editMicron, setEditMicron] = useState(12);
  const [editWidthMm, setEditWidthMm] = useState(1000);
  const [editSubType, setEditSubType] = useState('');
  const [editDimensions, setEditDimensions] = useState('');
  const [editAvailableQty, setEditAvailableQty] = useState(0);
  const [editAllocatedQty, setEditAllocatedQty] = useState(0);
  const [editUnitPrice, setEditUnitPrice] = useState(120);
  const [editLocation, setEditLocation] = useState('Bay A');
  const [editReorderLevel, setEditReorderLevel] = useState(100);
  const [editLastVendor, setEditLastVendor] = useState('');
  const [editLastBatch, setEditLastBatch] = useState('');

  const openAddStockModal = () => {
    const newId = generateInventoryId(safeInventory);
    setEditingStockItem({ id: newId, isNew: true });
    setEditCategory('Film Substrates');
    setEditItemName('');
    setEditItemCode(newId);
    setEditUnit('Kg');
    setEditFilmType('PET');
    setEditMicron(12);
    setEditWidthMm(1000);
    setEditSubType('');
    setEditDimensions('');
    setEditAvailableQty(100);
    setEditAllocatedQty(0);
    setEditUnitPrice(120);
    setEditLocation('Bay A');
    setEditReorderLevel(100);
    setEditLastVendor('');
    setEditLastBatch('');
  };

  const openEditStockModal = (item) => {
    if (!item) {
      openAddStockModal();
      return;
    }
    setEditingStockItem(item);
    
    const isFilm = (item.category === 'Film Substrates') || 
                   (!item.category && item.filmType && FILM_DENSITIES[item.filmType]) ||
                   (!item.category && item.micron && item.micron !== '-');

    const category = item.category || (isFilm ? 'Film Substrates' : 'Other Raw Materials');
    setEditCategory(category);
    
    // Pre-fill Item Name
    const defaultName = isFilm 
      ? `${item.filmType || 'PET'} ${item.micron && item.micron !== '-' ? item.micron + 'µ' : ''} (${item.widthMm && item.widthMm !== '-' ? item.widthMm + 'mm' : ''})`.trim()
      : (item.itemName || item.filmType || `${category} Stock Item`);
    setEditItemName(item.itemName || defaultName);
    
    // Pre-fill Item Code / SKU
    setEditItemCode(item.itemCode || item.id || '');
    
    // Pre-fill Unit
    const fallbackUnit = isFilm ? 'Kg' : (
      category === 'Chemicals & Solvents' ? 'Litres' : 
      category === 'Doctor Blades & Wipers' ? 'Meters' : 
      category === 'Tapes & Consumables' ? 'Rolls' : 
      category === 'Safety Gear (PPE)' ? 'Boxes' : 
      category === 'Machine Spare Parts' ? 'Nos' : 'Kg'
    );
    setEditUnit(item.unit || fallbackUnit);
    
    // Pre-fill Film / Sub-type attributes
    setEditFilmType(item.filmType && FILM_DENSITIES[item.filmType] ? item.filmType : 'PET');
    setEditMicron(item.micron && item.micron !== '-' ? item.micron : (isFilm ? 12 : ''));
    setEditWidthMm(item.widthMm && item.widthMm !== '-' ? item.widthMm : (isFilm ? 1000 : ''));
    setEditSubType(item.filmType && !FILM_DENSITIES[item.filmType] ? item.filmType : '');
    setEditDimensions(item.widthMm && item.widthMm !== '-' && !isFilm ? `${item.widthMm}mm` : '');
    
    // Pre-fill Quantities & Thresholds (Accurate numbers from item)
    setEditAvailableQty(item.availableQtyKg ?? item.availableWeightKg ?? 0);
    setEditAllocatedQty(item.allocatedQtyKg ?? 0);
    setEditUnitPrice(item.unitPrice ?? item.purchaseRatePerKg ?? 0);
    setEditReorderLevel(item.reorderLevelKg ?? 100);
    
    // Pre-fill Location & Vendor Logistics
    setEditLocation(item.location || item.locationBay || 'Bay A');
    setEditLastVendor(item.lastVendor || item.vendorName || '');
    setEditLastBatch(item.lastBatch || item.batchNo || '');
  };

  const handleCategoryChangeInEdit = (newCategory) => {
    setEditCategory(newCategory);
    if (newCategory === 'Film Substrates') {
      if (!editFilmType || !FILM_DENSITIES[editFilmType]) setEditFilmType('PET');
      if (!editMicron || editMicron === '-') setEditMicron(12);
      if (!editWidthMm || editWidthMm === '-') setEditWidthMm(1000);
      setEditUnit('Kg');
    } else {
      if (newCategory === 'Chemicals & Solvents' && editUnit === 'Kg') setEditUnit('Litres');
      else if (newCategory === 'Doctor Blades & Wipers' && editUnit === 'Kg') setEditUnit('Meters');
      else if (newCategory === 'Tapes & Consumables' && editUnit === 'Kg') setEditUnit('Rolls');
      else if (newCategory === 'Safety Gear (PPE)' && editUnit === 'Kg') setEditUnit('Boxes');
      else if (newCategory === 'Machine Spare Parts' && editUnit === 'Kg') setEditUnit('Nos');
    }
  };

  const handleSaveStockEdit = (e) => {
    e.preventDefault();
    if (!editingStockItem) return;

    const isFilm = editCategory === 'Film Substrates';
    const finalItemName = isFilm
      ? `${editFilmType} ${editMicron}µ (${editWidthMm}mm Width)`
      : (editItemName.trim() || `${editCategory} Stock Item`);
    const rateVal = parseFloat(editUnitPrice) || 0;
    const availQty = parseFloat(editAvailableQty) || 0;
    const valuation = Number((availQty * rateVal).toFixed(2));

    let updatedInv;
    if (editingStockItem.isNew) {
      const newItem = {
        id: editingStockItem.id,
        category: editCategory,
        itemName: finalItemName,
        itemCode: editItemCode.trim() || editingStockItem.id,
        unit: editUnit,
        filmType: isFilm ? editFilmType : (editSubType.trim() || ''),
        grade: !isFilm ? editSubType.trim() : '',
        dimensions: !isFilm ? editDimensions.trim() : '',
        micron: isFilm ? (parseFloat(editMicron) || 12) : '-',
        widthMm: isFilm ? (parseFloat(editWidthMm) || 1000) : (editDimensions.trim() ? editDimensions.replace(/[^\d.]/g, '') || '-' : '-'),
        density: isFilm ? (FILM_DENSITIES[editFilmType] || 1.0) : 1.0,
        availableQtyKg: availQty,
        allocatedQtyKg: parseFloat(editAllocatedQty) || 0,
        unitPrice: rateVal,
        purchaseRatePerKg: rateVal,
        purchaseValuation: valuation,
        location: editLocation.trim() || 'Bay A',
        reorderLevelKg: parseFloat(editReorderLevel) || 0,
        lastVendor: editLastVendor.trim() || '',
        lastBatch: editLastBatch.trim() || '',
        lastUpdated: new Date().toISOString()
      };
      updatedInv = [newItem, ...inventory];
    } else {
      updatedInv = inventory.map(item => {
        if (item.id === editingStockItem.id) {
          return {
            ...item,
            category: editCategory,
            itemName: finalItemName,
            itemCode: editItemCode.trim() || item.itemCode || item.id,
            unit: editUnit,
            filmType: isFilm ? editFilmType : (editSubType.trim() || ''),
            grade: !isFilm ? editSubType.trim() : (item.grade || ''),
            dimensions: !isFilm ? editDimensions.trim() : (item.dimensions || ''),
            micron: isFilm ? (parseFloat(editMicron) || 12) : '-',
            widthMm: isFilm ? (parseFloat(editWidthMm) || 1000) : (editDimensions.trim() ? editDimensions.replace(/[^\d.]/g, '') || '-' : (item.widthMm || '-')),
            density: isFilm ? (FILM_DENSITIES[editFilmType] || 1.0) : 1.0,
            availableQtyKg: availQty,
            allocatedQtyKg: parseFloat(editAllocatedQty) || 0,
            unitPrice: rateVal,
            purchaseRatePerKg: rateVal,
            purchaseValuation: valuation,
            location: editLocation.trim() || 'Bay A',
            reorderLevelKg: parseFloat(editReorderLevel) || 0,
            lastVendor: editLastVendor.trim() || item.lastVendor,
            lastBatch: editLastBatch.trim() || item.lastBatch,
            lastUpdated: new Date().toISOString()
          };
        }
        return item;
      });
    }

    if (onUpdateInventory) {
      onUpdateInventory(updatedInv);
    }

    const actionText = editingStockItem.isNew ? 'created' : 'updated';
    const itemId = editingStockItem.id;
    setEditingStockItem(null);
    alert(`Stock item ${itemId} (${finalItemName}) ${actionText} successfully!`);
  };

  const handleDeleteStockItem = (item) => {
    const displayName = item.itemName || `${item.filmType || 'Item'} ${item.micron && item.micron !== '-' ? item.micron + 'µ' : ''}`;
    if (window.confirm(`Are you sure you want to permanently delete stock item "${item.id} - ${displayName}"?`)) {
      const updatedInv = inventory.filter(i => i.id !== item.id);
      if (onUpdateInventory) {
        onUpdateInventory(updatedInv);
      }
      alert(`Stock item ${item.id} deleted.`);
    }
  };

  // Stock Reconciliation State
  const [physicalCounts, setPhysicalCounts] = useState(
    inventory.reduce((acc, item) => ({ ...acc, [item.id]: item.availableQtyKg }), {})
  );

  // Physical Stock Reconciliation Search & Filter States
  const [recSearchTerm, setRecSearchTerm] = useState('');
  const [recStatusFilter, setRecStatusFilter] = useState('ALL'); // 'ALL', 'DISCREPANCY', 'SHORTAGE', 'SURPLUS', 'MATCHED'
  const [recSubstrateFilter, setRecSubstrateFilter] = useState('ALL');

  const isRecDue = isReconciliationDue("2026-07-24");

  // Inward GRN Submit (Supports Films, Inks, Solvents, Adhesives, Blades, Spares, PPE)
  const handleSaveGRN = (e) => {
    e.preventDefault();
    if (!grnInvoiceNo.trim() || !grnBatchNo.trim()) {
      alert("Invoice Number and Batch Number are required!");
      return;
    }

    const isFilm = grnCategory === 'Film Substrates';
    const itemName = grnItemName.trim() || (isFilm 
      ? `${grnFilmType} ${grnMicron}µ (${grnWidthMm}mm)` 
      : `${grnCategory} Inward Item`);

    // Ensure we have valid items in grnItemsList
    const itemsToSave = (grnItemsList && grnItemsList.length > 0) ? grnItemsList : [
      { id: 'item-1', grossWeightKg: parseFloat(grnWeightKg) || 0, tareWeightKg: 0, netWeightKg: parseFloat(grnWeightKg) || 0 }
    ];

    const unitCount = itemsToSave.length;
    const totalNetQty = grnCalculatedTotals.totalNet > 0 
      ? grnCalculatedTotals.totalNet 
      : (parseFloat(grnWeightKg) || 0);
    const totalGrossQty = grnCalculatedTotals.totalGross > 0 ? grnCalculatedTotals.totalGross : totalNetQty;
    const totalTareQty = grnCalculatedTotals.totalTare > 0 ? grnCalculatedTotals.totalTare : 0;
    const rateVal = parseFloat(grnPurchaseRate) || 0;

    const newGRN = {
      grnNo: getNextDocRefNumber('grn'),
      poNumber: grnPoNo,
      vendorName: grnVendor,
      invoiceNo: grnInvoiceNo,
      receivedDate: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      category: grnCategory,
      itemName: itemName,
      stockItemId: grnSelectedStockItemId || null,
      filmType: isFilm ? grnFilmType : grnCategory,
      micron: isFilm ? parseFloat(grnMicron) : '-',
      widthMm: isFilm ? parseFloat(grnWidthMm) : '-',
      unit: isFilm ? 'Kg' : grnUnit,
      packagingType: grnPackagingType,
      rollsReceived: unitCount,
      netWeightKg: totalNetQty,
      grossWeightKg: totalGrossQty,
      tareWeightKg: totalTareQty,
      itemsBreakdown: itemsToSave.map((item, idx) => ({
        unitNo: idx + 1,
        grossWeightKg: parseFloat(item.grossWeightKg) || 0,
        tareWeightKg: parseFloat(item.tareWeightKg) || 0,
        netWeightKg: parseFloat(item.netWeightKg) || 0,
        lengthMeters: parseFloat(item.lengthMeters) || 0,
        vendorRollNo: item.vendorRollNo || ''
      })),
      purchaseRatePerKg: rateVal,
      purchaseRate: rateVal,
      unitPrice: rateVal,
      batchNo: grnBatchNo,
      freightAmount: parseFloat(grnFreightAmount) || 0,
      transporterName: grnTransporterName.trim() || 'Direct Dispatch / Self',
      status: "Pending QC", // Goes to Store QC Verification
      qcNotes: "",
      inspectedBy: "",
      storeManager: "Store Mgr Dilip Joshi"
    };

    setGrnFreightAmount('');
    setGrnTransporterName('');

    if (onAddGRN) {
      onAddGRN(newGRN);
    }

    // Generate individual barcode stickers for each box / roll / container unit received with its DISTINCT net weight!
    const newRolls = [];
    const grnCode = newGRN.grnNo.replace('GRN-', '');
    itemsToSave.forEach((item, index) => {
      const i = index + 1;
      const itemGross = parseFloat(item.grossWeightKg) || 0;
      const itemTare = parseFloat(item.tareWeightKg) || 0;
      const itemNet = parseFloat(item.netWeightKg) || (itemGross > 0 ? Math.max(0, itemGross - itemTare) : Number((totalNetQty / unitCount).toFixed(2)));
      const itemLength = parseFloat(item.lengthMeters) || (isFilm ? calculateFilmRollLength(itemNet, grnWidthMm, grnMicron, grnFilmType) : null);
      const itemVendorRoll = (item.vendorRollNo || '').trim();

      const barcodeId = unitCount > 1 
        ? `${isFilm ? 'RM-BC' : 'CON-BC'}-${grnCode}-${i}` 
        : generateBarcodeId(isFilm ? 'RM-BC' : 'CON-BC');

      const rollObj = {
        barcodeId,
        grnNo: newGRN.grnNo,
        unitNo: i,
        totalUnits: unitCount,
        rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
        itemId: grnSelectedStockItemId || generateInventoryId(inventory),
        itemName: itemName,
        category: grnCategory,
        filmType: isFilm ? grnFilmType : '-',
        micron: isFilm ? (parseFloat(grnMicron) || 0) : 0,
        widthMm: isFilm ? (parseFloat(grnWidthMm) || 0) : 0,
        unit: isFilm ? 'Kg' : grnUnit,
        packagingType: grnPackagingType,
        inwardDatetime: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
        vendorName: grnVendor,
        invoiceNo: grnInvoiceNo,
        batchNo: grnBatchNo,
        vendorRollNo: itemVendorRoll || null,
        grossWeightKg: itemGross > 0 ? itemGross : null,
        tareWeightKg: itemTare > 0 ? itemTare : null,
        netWeightKg: itemNet,
        availableWeightKg: itemNet,
        lengthMeters: itemLength > 0 ? itemLength : null,
        purchaseRatePerKg: rateVal,
        purchaseRate: rateVal,
        unitPrice: rateVal,
        stationId: 'SCALE_1_INWARD',
        locationBay: isFilm ? 'Bay A' : 'Consumables Store',
        status: 'In Stock'
      };
      newRolls.push(rollObj);

      if (onAddRoll) {
        onAddRoll(rollObj);
      }
    });

    setIsNewGRNModalOpen(false);
    setSelectedRollForBarcodeModal(newRolls);
    alert(`✅ Inward GRN ${newGRN.grnNo} created for ${grnCategory}! ${unitCount} individual barcode sticker(s) generated with exact distinct weights.`);
  };

  // QC Approval / Rejection (Updates Stock for Films, Inks, Solvents, Adhesives, Spares, PPE)
  const handleQCAction = (status) => {
    if (!qcInspectingGRN) return;

    const updatedGRN = {
      ...qcInspectingGRN,
      status,
      qcNotes: qcNotesInput || (status === 'Approved' ? 'Inspected and passed all laboratory parameters.' : 'Rejected due to spec variation.'),
      inspectedBy: 'QC Chemist Ramesh Kumar'
    };

    if (onUpdateGRN) {
      onUpdateGRN(updatedGRN);
    }

    // If Approved, automatically add stock to central Inventory!
    if (status === 'Approved' && onUpdateInventory) {
      const isFilm = (updatedGRN.category || 'Film Substrates') === 'Film Substrates';
      const grnRate = parseFloat(updatedGRN.purchaseRatePerKg || updatedGRN.purchaseRate || updatedGRN.unitPrice) || 0;

      const existingInvIndex = inventory.findIndex(i => {
        if (updatedGRN.stockItemId && String(i.id) === String(updatedGRN.stockItemId)) return true;
        if (updatedGRN.itemId && String(i.id) === String(updatedGRN.itemId)) return true;
        if (isFilm) {
          return i.filmType === updatedGRN.filmType && Number(i.micron) === Number(updatedGRN.micron) && Number(i.widthMm) === Number(updatedGRN.widthMm);
        }
        return (i.itemName || '').toLowerCase() === (updatedGRN.itemName || '').toLowerCase();
      });

      if (existingInvIndex >= 0) {
        const itemToUpdate = inventory[existingInvIndex];
        const updatedInv = [...inventory];
        const newAvailable = Number((itemToUpdate.availableQtyKg + updatedGRN.netWeightKg).toFixed(2));
        const finalPrice = grnRate > 0 ? grnRate : (itemToUpdate.unitPrice || 0);

        updatedInv[existingInvIndex] = {
          ...itemToUpdate,
          availableQtyKg: newAvailable,
          unitPrice: finalPrice,
          purchaseRatePerKg: finalPrice,
          purchaseValuation: Number((newAvailable * finalPrice).toFixed(2)),
          lastVendor: updatedGRN.vendorName,
          lastBatch: updatedGRN.batchNo
        };
        onUpdateInventory(updatedInv);
      } else {
        const newAvailable = updatedGRN.netWeightKg;
        const newInvId = generateInventoryId(inventory);
        const newInvItem = {
          id: newInvId,
          itemCode: newInvId,
          itemName: updatedGRN.itemName || `${updatedGRN.filmType} Inward Stock`,
          category: updatedGRN.category || 'Film Substrates',
          filmType: updatedGRN.filmType || 'Generic',
          micron: updatedGRN.micron || '-',
          widthMm: updatedGRN.widthMm || '-',
          unit: updatedGRN.unit || 'Kg',
          density: FILM_DENSITIES[updatedGRN.filmType] || 1.0,
          availableQtyKg: newAvailable,
          allocatedQtyKg: 0,
          unitPrice: grnRate,
          purchaseRatePerKg: grnRate,
          purchaseValuation: Number((newAvailable * grnRate).toFixed(2)),
          location: isFilm ? "Bay A - Inward Dock" : "Consumables Store",
          reorderLevelKg: 100,
          lastVendor: updatedGRN.vendorName,
          lastBatch: updatedGRN.batchNo
        };
        onUpdateInventory([...inventory, newInvItem]);
      }
    }

    setQcInspectingGRN(null);
    setQcNotesInput('');
    alert(`GRN ${updatedGRN.grnNo} has been marked as ${status}!`);
  };

  // 2D Barcode / QR Code Scanner Resolution for Material Issue & Return
  const handleBarcodeScanLookup = (rawCode) => {
    const code = String(rawCode !== undefined ? rawCode : (issueScanQuery || '')).trim();
    if (!code) {
      setSelectedInvItem(null);
      setScannedItemDetails(null);
      setScanErrorMessage('Please scan a 2D QR Code or enter a Barcode / Batch ID.');
      return;
    }
    setScanErrorMessage('');

    const cleanCode = code.toLowerCase().trim();
    const strippedCode = cleanCode.replace(/^(lot|bc|bar-iss|bar|roll|inv|grn|item)[-_:]\s*/i, '').trim();

    // 1. Search in inventoryRolls by barcodeId, id, vendorRollNo, batchNo, barcode
    const matchedRoll = (inventoryRolls || []).find(r => {
      const bId = (r.barcodeId || '').toLowerCase();
      const rId = String(r.id || '').toLowerCase();
      const vRoll = (r.vendorRollNo || '').toLowerCase();
      const bNo = (r.batchNo || '').toLowerCase();
      return bId === cleanCode || bId === strippedCode || cleanCode.includes(bId) ||
        rId === cleanCode || rId === strippedCode ||
        vRoll === cleanCode || vRoll === strippedCode || (vRoll && cleanCode.includes(vRoll)) ||
        bNo === cleanCode || bNo === strippedCode || (bNo && cleanCode.includes(bNo));
    });

    // 2. Search in safeGrns by grnNo, id, batchNo, barcode, invoiceNo, poNumber
    const matchedGrn = (safeGrns || []).find(g => {
      const gNo = String(g.grnNo || '').toLowerCase();
      const gId = String(g.id || '').toLowerCase();
      const bNo = (g.batchNo || '').toLowerCase();
      const bCode = (g.barcode || '').toLowerCase();
      return gNo === cleanCode || gNo === strippedCode || cleanCode.includes(gNo) ||
        gId === cleanCode || gId === strippedCode ||
        bNo === cleanCode || bNo === strippedCode || (bNo && cleanCode.includes(bNo)) ||
        bCode === cleanCode || bCode === strippedCode || (bCode && cleanCode.includes(bCode));
    });

    // 3. Search in inventory items by id, itemCode, productCode, lastBatch, batchNo, barcode, itemName, shade
    const matchedItemDirect = (inventory || []).find(i => {
      const iId = (i.id || '').toLowerCase();
      const iCode = (i.itemCode || '').toLowerCase();
      const pCode = (i.productCode || '').toLowerCase();
      const lBatch = (i.lastBatch || '').toLowerCase();
      const bNo = (i.batchNo || '').toLowerCase();
      const bCode = (i.barcode || i.barcodeId || '').toLowerCase();
      const iName = (i.itemName || '').toLowerCase();
      const shade = (i.shade || '').toLowerCase();

      return (
        iId === cleanCode || iId === strippedCode || (iId && cleanCode.includes(iId)) ||
        iCode === cleanCode || iCode === strippedCode || (iCode && cleanCode.includes(iCode)) ||
        pCode === cleanCode || pCode === strippedCode || (pCode && cleanCode.includes(pCode)) ||
        lBatch === cleanCode || lBatch === strippedCode || (lBatch && cleanCode.includes(lBatch)) || (lBatch && lBatch.includes(cleanCode)) ||
        bNo === cleanCode || bNo === strippedCode || (bNo && cleanCode.includes(bNo)) ||
        bCode === cleanCode || bCode === strippedCode || (bCode && cleanCode.includes(bCode)) ||
        (iName && (iName === cleanCode || cleanCode.includes(iName))) ||
        (shade && (shade === cleanCode || cleanCode.includes(shade)))
      );
    });

    // 4. Search in inks master list by productCode, id, shade
    const matchedInk = (inks || []).find(ink => {
      const pCode = (ink.productCode || '').toLowerCase();
      const inkId = (ink.id || '').toLowerCase();
      const shade = (ink.shade || '').toLowerCase();
      const lBatch = (ink.lastBatch || `lot-${pCode}`).toLowerCase();
      return (
        pCode === cleanCode || pCode === strippedCode || (pCode && cleanCode.includes(pCode)) ||
        inkId === cleanCode || inkId === strippedCode ||
        lBatch === cleanCode || lBatch === strippedCode || (lBatch && cleanCode.includes(lBatch)) ||
        (shade && (shade === cleanCode || cleanCode.includes(shade)))
      );
    });

    let targetItem = null;
    let batchNo = 'BATCH-MAIN';
    let purchaseRate = 0;
    let vendorName = 'General Stock';
    let grnNo = '';
    let barcodeId = code;
    let availableQty = 0;
    let unitStr = 'Kg';

    if (matchedRoll) {
      targetItem = (inventory || []).find(i => 
        i.id === matchedRoll.itemId || 
        (i.itemCode && matchedRoll.itemId && i.itemCode.toLowerCase() === matchedRoll.itemId.toLowerCase()) ||
        (i.itemName && matchedRoll.itemName && i.itemName.toLowerCase() === matchedRoll.itemName.toLowerCase()) ||
        (i.filmType && matchedRoll.filmType && i.filmType.toLowerCase() === matchedRoll.filmType.toLowerCase())
      ) || {
        id: matchedRoll.itemId || `ITEM-${matchedRoll.id}`,
        itemName: matchedRoll.itemName || `${matchedRoll.filmType || 'Film'} ${matchedRoll.micron || ''}µ`,
        category: matchedRoll.category || 'Film Substrates',
        filmType: matchedRoll.filmType,
        micron: matchedRoll.micron,
        widthMm: matchedRoll.widthMm,
        unit: matchedRoll.unit || 'Kg',
        unitPrice: matchedRoll.purchaseRatePerKg || 0,
        availableQtyKg: matchedRoll.availableWeightKg || matchedRoll.netWeightKg || 0,
        location: matchedRoll.location || 'Store Bay'
      };

      batchNo = matchedRoll.batchNo || matchedRoll.vendorRollNo || matchedRoll.barcodeId;
      purchaseRate = Number(matchedRoll.purchaseRatePerKg || targetItem.unitPrice || 0);
      vendorName = matchedRoll.vendorName || targetItem.lastVendor || 'Verified Supplier';
      grnNo = matchedRoll.grnNo || '';
      barcodeId = matchedRoll.barcodeId || code;
      availableQty = Number(matchedRoll.availableWeightKg ?? matchedRoll.netWeightKg ?? targetItem.availableQtyKg ?? 0);
      unitStr = matchedRoll.unit || targetItem.unit || 'Kg';
    } else if (matchedGrn) {
      targetItem = (inventory || []).find(i => 
        i.id === matchedGrn.itemId || 
        (i.itemCode && matchedGrn.itemId && i.itemCode.toLowerCase() === matchedGrn.itemId.toLowerCase()) ||
        (i.itemName && matchedGrn.itemName && i.itemName.toLowerCase() === matchedGrn.itemName.toLowerCase()) ||
        (i.filmType && matchedGrn.filmType && i.filmType.toLowerCase() === matchedGrn.filmType.toLowerCase())
      ) || {
        id: matchedGrn.itemId || `GRN-ITEM-${matchedGrn.id}`,
        itemName: matchedGrn.itemName || `${matchedGrn.filmType || 'Film'} ${matchedGrn.micron || ''}µ`,
        category: matchedGrn.category || 'Film Substrates',
        unit: matchedGrn.unit || 'Kg',
        unitPrice: matchedGrn.purchaseRate || matchedGrn.unitPrice || 0,
        availableQtyKg: matchedGrn.netWeightKg || 0,
        location: 'Bay A'
      };

      batchNo = matchedGrn.batchNo || `GRN-${matchedGrn.grnNo}`;
      purchaseRate = Number(matchedGrn.purchaseRate || matchedGrn.unitPrice || targetItem.unitPrice || 0);
      vendorName = matchedGrn.vendorName || targetItem.lastVendor || 'Verified Supplier';
      grnNo = matchedGrn.grnNo || '';
      barcodeId = matchedGrn.barcode || code;
      availableQty = Number(targetItem.availableQtyKg || matchedGrn.netWeightKg || 0);
      unitStr = matchedGrn.unit || targetItem.unit || 'Kg';
    } else if (matchedItemDirect) {
      targetItem = matchedItemDirect;
      batchNo = targetItem.lastBatch || targetItem.batchNo || (targetItem.itemCode ? `LOT-${targetItem.itemCode}` : `LOT-${targetItem.id}`);
      purchaseRate = Number(targetItem.unitPrice || targetItem.purchaseRatePerKg || targetItem.pricePerKg || 0);
      vendorName = targetItem.lastVendor || targetItem.supplierName || targetItem.lastSupplier || targetItem.manufacturer || 'Verified Supplier';
      barcodeId = targetItem.barcode || (code.toUpperCase().startsWith('LOT-') ? code : (targetItem.lastBatch || targetItem.id));
      availableQty = Number(targetItem.availableQtyKg ?? targetItem.stockQtyKg ?? 0);
      unitStr = targetItem.unit || 'Kg';
    } else if (matchedInk) {
      // Find corresponding item in inventory or fallback to ink specs
      targetItem = (inventory || []).find(i => 
        (i.itemCode && i.itemCode.toLowerCase() === (matchedInk.productCode || '').toLowerCase()) ||
        (i.id && i.id.toLowerCase() === (matchedInk.productCode || '').toLowerCase()) ||
        (i.id && i.id.toLowerCase() === (matchedInk.id || '').toLowerCase()) ||
        (i.itemName && i.itemName.toLowerCase() === (matchedInk.shade || '').toLowerCase())
      ) || {
        id: matchedInk.productCode || matchedInk.id,
        itemCode: matchedInk.productCode,
        itemName: matchedInk.shade || matchedInk.productCode,
        category: 'Printing Inks & Toners',
        unit: matchedInk.unit || 'Kg',
        unitPrice: matchedInk.pricePerKg || matchedInk.unitPrice || 0,
        availableQtyKg: matchedInk.stockQtyKg || 0,
        location: 'Ink Store Room',
        lastVendor: matchedInk.supplierName || matchedInk.manufacturer || 'DIC Inks'
      };

      batchNo = matchedInk.lastBatch || `LOT-${matchedInk.productCode}`;
      purchaseRate = Number(targetItem.unitPrice || matchedInk.pricePerKg || 0);
      vendorName = targetItem.lastVendor || matchedInk.supplierName || matchedInk.manufacturer || 'DIC Inks';
      barcodeId = code.toUpperCase().startsWith('LOT-') ? code : `LOT-${matchedInk.productCode}`;
      availableQty = Number(targetItem.availableQtyKg ?? matchedInk.stockQtyKg ?? 0);
      unitStr = targetItem.unit || matchedInk.unit || 'Kg';
    } else {
      setSelectedInvItem(null);
      setScannedItemDetails(null);
      setScanErrorMessage(`⚠️ No matching stock item, roll, or GRN found for QR Code "${code}". Please check the code or select from the directory.`);
      return;
    }

    // Determine QC Approval Status of this scanned batch / roll / item
    let qcStatus = 'Approved';
    let isQCPending = false;
    let isQCRejected = false;

    if (matchedGrn) {
      qcStatus = matchedGrn.status || matchedGrn.qcStatus || 'Approved';
    } else if (matchedRoll) {
      if (matchedRoll.status === 'Pending QC' || matchedRoll.qcStatus === 'Pending QC') {
        qcStatus = 'Pending QC';
      } else if (matchedRoll.status === 'Rejected' || matchedRoll.qcStatus === 'Rejected') {
        qcStatus = 'Rejected';
      } else {
        // Check associated GRN by GRN No or Batch No
        const linkedGrn = (safeGrns || []).find(g => (matchedRoll.grnNo && g.grnNo === matchedRoll.grnNo) || (matchedRoll.batchNo && g.batchNo === matchedRoll.batchNo));
        if (linkedGrn && (linkedGrn.status === 'Pending QC' || linkedGrn.status === 'Pending')) {
          qcStatus = 'Pending QC';
        } else if (linkedGrn && linkedGrn.status === 'Rejected') {
          qcStatus = 'Rejected';
        }
      }
    } else if (targetItem) {
      if (targetItem.status === 'Pending QC' || targetItem.qcStatus === 'Pending QC') {
        qcStatus = 'Pending QC';
      } else if (targetItem.status === 'Rejected' || targetItem.qcStatus === 'Rejected') {
        qcStatus = 'Rejected';
      } else {
        const linkedGrn = (safeGrns || []).find(g => (batchNo && g.batchNo === batchNo) || (g.itemId && g.itemId === targetItem.id && (g.status === 'Pending QC' || g.status === 'Pending')));
        if (linkedGrn && (linkedGrn.status === 'Pending QC' || linkedGrn.status === 'Pending')) {
          qcStatus = 'Pending QC';
        }
      }
    }

    if (qcStatus === 'Pending QC' || qcStatus === 'Pending') {
      isQCPending = true;
    } else if (qcStatus === 'Rejected') {
      isQCRejected = true;
    }

    setSelectedInvItem(targetItem);
    setScannedItemDetails({
      item: targetItem,
      matchedRoll,
      matchedGrn,
      barcodeId,
      batchNo,
      purchaseRate,
      vendorName,
      grnNo,
      availableQty,
      unit: unitStr,
      qcStatus,
      isQCPending,
      isQCRejected
    });

    if (availableQty > 0 && !isQCPending && !isQCRejected) {
      setIssueQtyKg(String(availableQty));
    } else {
      setIssueQtyKg('');
    }
    setScanMatchSuccess(true);
    setTimeout(() => setScanMatchSuccess(false), 3000);
  };

  // Issue / Return Submit (Records transaction in Store Issue/Return Ledger & updates Job Production Record Costing)
  const handleIssueReturnSubmit = () => {
    const itemToIssue = scannedItemDetails?.item || selectedInvItem;
    if (scannedItemDetails?.isQCPending) {
      alert("❌ Blocked by Quality Control: This batch is currently PENDING QC APPROVAL and cannot be issued or returned to production until cleared by the QC Chemist.");
      return;
    }
    if (scannedItemDetails?.isQCRejected) {
      alert("❌ Blocked by Quality Control: This batch has been REJECTED during QC inspection and cannot be issued to production.");
      return;
    }

    if (!itemToIssue || !issueQtyKg || parseFloat(issueQtyKg) <= 0) {
      alert("Please scan a 2D QR Code or select an item and enter a valid quantity.");
      return;
    }

    const qty = parseFloat(issueQtyKg);
    const chosenJobName = issueJobName || (activeProductionOrders[0]?.jobName || '');
    if (!chosenJobName) {
      alert("Please select an active production job.");
      return;
    }

    const unitStr = scannedItemDetails?.unit || itemToIssue.unit || 'Kg';
    const itemNameStr = itemToIssue.itemName || `${itemToIssue.filmType || ''} ${itemToIssue.micron && itemToIssue.micron !== '-' ? `${itemToIssue.micron}µ` : ''}`.trim() || `${itemToIssue.category || 'Store'} Item`;

    // Extract Batch Details (Priority: 2D Scanned Details -> Selected Batch -> Item Fallback)
    const selectedBatchObj = availableBatchesForSelectedItem.find(b => b.id === issueSelectedBatchId) || availableBatchesForSelectedItem[0] || null;
    const finalBatchNo = scannedItemDetails?.batchNo || (issueSelectedBatchId === 'CUSTOM' ? (issueCustomBatchText.trim() || 'CUSTOM-BATCH') : (selectedBatchObj?.batchNo || itemToIssue.lastBatch || 'BATCH-MAIN'));
    const finalRate = scannedItemDetails?.purchaseRate !== undefined ? scannedItemDetails.purchaseRate : (selectedBatchObj?.purchaseRate !== undefined ? selectedBatchObj.purchaseRate : Number(itemToIssue.unitPrice || itemToIssue.purchaseRatePerKg || 0));
    const finalVendor = scannedItemDetails?.vendorName || selectedBatchObj?.vendorName || itemToIssue.lastVendor || 'Company Stock';
    const finalGrnNo = scannedItemDetails?.grnNo || selectedBatchObj?.grnNo || '';
    const finalBarcode = scannedItemDetails?.barcodeId || selectedBatchObj?.barcode || finalBatchNo || `BAR-ISS-${itemToIssue.id}`;

    const maxAvail = scannedItemDetails?.availableQty ?? (itemToIssue.availableQtyKg || 0);
    if (issueType === 'issue' && maxAvail < qty) {
      alert(`Insufficient available stock! Only ${maxAvail} ${unitStr} available in this batch/roll.`);
      return;
    }

    if (onStoreIssueReturn) {
      onStoreIssueReturn({
        item: itemToIssue,
        issueType: issueType,
        qty: qty,
        jobName: chosenJobName,
        user: currentUser?.name || 'Store Manager',
        unitPrice: finalRate,
        batchNo: finalBatchNo,
        vendorName: finalVendor,
        grnNo: finalGrnNo,
        barcode: finalBarcode,
        notes: issueType === 'issue'
          ? `[2D Scan: ${finalBarcode}] Issued ${qty} ${unitStr} from Batch [${finalBatchNo}] (Rate: ₹${finalRate}/${unitStr}) to Job: ${chosenJobName}`
          : `Returned ${qty} ${unitStr} from Job: ${chosenJobName} back to Store`
      });
    } else {
      let updatedInv = [...inventory];
      const idx = updatedInv.findIndex(i => i.id === itemToIssue.id);
      if (idx >= 0) {
        const item = updatedInv[idx];
        if (issueType === 'issue') {
          item.availableQtyKg = Math.max(0, (item.availableQtyKg || 0) - qty);
          item.allocatedQtyKg = (item.allocatedQtyKg || 0) + qty;
        } else {
          item.availableQtyKg = (item.availableQtyKg || 0) + qty;
          item.allocatedQtyKg = Math.max(0, (item.allocatedQtyKg || 0) - qty);
        }
        if (onUpdateInventory) onUpdateInventory(updatedInv);
      }
    }

    setIsIssueModalOpen(false);
    setIssueQtyKg('');
    setIssueScanQuery('');
    setScannedItemDetails(null);
    setIssueSelectedBatchId('');
    setIssueCustomBatchText('');
    alert(`Successfully recorded ${issueType === 'issue' ? 'Material Issue' : 'Material Return'} of ${qty} ${unitStr} for Job "${chosenJobName}"!\n\nProduction Record material consumed list and total costing have been updated.`);
  };

  // Download Physical Stock CSV Template
  const downloadReconciliationTemplate = () => {
    const csvHeader = "Inventory ID,Film Type,Micron (um),Width (mm),System Stock (Kg),Physical Count (Kg),Variance (Kg),Notes\n";
    const csvRows = inventory.map(item => 
      `"${item.id}","${item.filmType}",${item.micron},${item.widthMm},${item.availableQtyKg},${item.availableQtyKg},0,""`
    ).join("\n");

    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Physical_Stock_Reconciliation_Template_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Handle Excel/CSV File Upload for Reconciliation
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').slice(1); // skip header
      const updatedCounts = { ...physicalCounts };

      lines.forEach(line => {
        const cols = line.split(',');
        if (cols.length >= 6) {
          const invId = cols[0].replace(/"/g, '').trim();
          const physicalQty = parseFloat(cols[5].replace(/"/g, '').trim());
          if (invId && !isNaN(physicalQty)) {
            updatedCounts[invId] = physicalQty;
          }
        }
      });

      setPhysicalCounts(updatedCounts);
      alert(`Physical stock sheet imported successfully! Variances calculated below.`);
    };
    reader.readAsText(file);
  };

  // Commit Reconciliation Variances to System Stock & Stock Ledger
  const handleCommitReconciliation = () => {
    const newAdjustments = [];
    let updatedInv = inventory.map(item => {
      const physicalQty = physicalCounts[item.id];
      if (physicalQty !== undefined && !isNaN(physicalQty)) {
        const variance = parseFloat(physicalQty) - item.availableQtyKg;
        if (Math.abs(variance) > 0.001) {
          newAdjustments.push({
            id: `ADJ-REC-${Date.now()}-${item.id}`,
            itemId: item.id,
            itemCode: item.itemCode,
            itemName: item.itemName || `${item.filmType} ${item.micron}µ`,
            category: item.category || 'Film Substrates',
            filmType: item.filmType,
            micron: item.micron,
            widthMm: item.widthMm,
            date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
            type: variance > 0 ? 'Physical Audit (+)' : 'Physical Audit (-)',
            qtyKg: variance,
            barcode: `BAR-AUDIT-${item.id}-${Math.floor(100 + Math.random() * 900)}`,
            reason: 'Monthly Physical Stock Audit Reconciliation',
            adjustedBy: 'Store Mgr Dilip Joshi'
          });
        }
        return {
          ...item,
          availableQtyKg: parseFloat(physicalQty)
        };
      }
      return item;
    });

    if (newAdjustments.length > 0) {
      const updatedAdj = [...newAdjustments, ...stockLedgerAdjustments];
      setStockLedgerAdjustments(updatedAdj);
      try {
        localStorage.setItem('samyak_erp_stock_adjustments', JSON.stringify(updatedAdj));
      } catch (e) {}
    }

    if (onUpdateInventory) {
      onUpdateInventory(updatedInv);
    }
    alert("Monthly Physical Stock Reconciliation completed successfully! System available stock and audit ledger updated.");
  };

  // Download Bulk Inventory CSV Template
  const handleDownloadBulkInventoryTemplate = () => {
    const headers = ["FilmType", "Micron", "WidthMm", "AvailableQtyKg", "Location", "ReorderLevelKg", "LastVendor", "LastBatch"];
    const sampleRows = [
      ["PET", "12", "1000", "2500", "Bay A - Rack 1", "1000", "FlexiPoly Films Ltd", "BATCH-PET-101"],
      ["METPET", "12", "1000", "1800", "Bay A - Rack 2", "800", "FlexiPoly Films Ltd", "BATCH-MP-202"],
      ["Natural LD GP Film", "35", "1005", "4200", "Bay B - Extrusion", "1500", "Malwa Extrusions Pvt Ltd", "BATCH-LD-303"],
      ["Milky LD GP Film", "40", "1005", "3100", "Bay B - Extrusion", "1000", "Malwa Extrusions Pvt Ltd", "BATCH-MLD-404"],
      ["Natural LD Metallocene Film", "50", "905", "1500", "Bay C - Speciality", "500", "Malwa Extrusions Pvt Ltd", "BATCH-MET-505"]
    ];

    const csvContent = "data:text/csv;charset=utf-8," + 
      [headers.join(","), ...sampleRows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Bulk_Inventory_Template_Samyak.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Inventory CSV Upload Handler
  const handleBulkInventoryCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length <= 1) {
        alert("CSV file is empty or only contains headers!");
        return;
      }

      const newItems = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map(p => p.trim());
        if (parts.length >= 4) {
          const filmType = parts[0];
          const micron = parseFloat(parts[1]) || 12;
          const widthMm = parseFloat(parts[2]) || 1000;
          const availableQtyKg = parseFloat(parts[3]) || 0;
          const location = parts[4] || "Bay A - Inward";
          const reorderLevelKg = parseFloat(parts[5]) || 1000;
          const lastVendor = parts[6] || "Local Supplier";
          const lastBatch = parts[7] || "BULK-BATCH";

          if (filmType && availableQtyKg >= 0) {
            const autoId = generateInventoryId([...inventory, ...newItems]);
            newItems.push({
              id: autoId,
              itemCode: autoId,
              filmType,
              micron,
              widthMm,
              density: FILM_DENSITIES[filmType] || 1.0,
              availableQtyKg,
              allocatedQtyKg: 0,
              location,
              reorderLevelKg,
              lastVendor,
              lastBatch
            });
          }
        }
      }

      if (newItems.length > 0) {
        const updatedInv = [...inventory, ...newItems];
        if (onUpdateInventory) {
          onUpdateInventory(updatedInv);
        }
        alert(`Successfully imported ${newItems.length} inventory stock items into Stock Register!`);
      } else {
        alert("No valid inventory rows found in the CSV file.");
      }
    };
    reader.readAsText(file);
  };

  const pendingQCGRNs = (safeGrns || []).filter(g => g.status === 'Pending QC');

  const filteredInventory = (safeInventory || []).filter(i => {
    // 1. Category Filter
    if (stockCategoryFilter && stockCategoryFilter !== 'ALL') {
      const itemCat = i.category || 'Film Substrates';
      if (itemCat !== stockCategoryFilter) {
        return false;
      }
    }

    // 2. Search Text Filter
    if (!searchTerm || !searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    const title = (i.itemName || `${i.filmType || ''} Film`).toLowerCase();
    const filmType = (i.filmType || '').toLowerCase();
    const location = (i.location || '').toLowerCase();
    const itemCode = (i.itemCode || '').toLowerCase();
    const id = (i.id || '').toLowerCase();
    const category = (i.category || 'Film Substrates').toLowerCase();
    const vendor = (i.vendor || '').toLowerCase();
    const micronStr = i.micron ? `${i.micron}` : '';
    const widthStr = i.widthMm ? `${i.widthMm}` : '';

    return title.includes(term) ||
      filmType.includes(term) ||
      location.includes(term) ||
      itemCode.includes(term) ||
      id.includes(term) ||
      category.includes(term) ||
      vendor.includes(term) ||
      micronStr.includes(term) ||
      widthStr.includes(term);
  });

  const filteredPOs = (unifiedIssuedPOs || []).filter(po => {
    // 1. Status Filter
    if (poStatusFilter === 'PENDING' && po.deliveryStatus !== 'Pending Delivery') return false;
    if (poStatusFilter === 'PARTIAL' && po.deliveryStatus !== 'Partial Delivery') return false;
    if (poStatusFilter === 'COMPLETED' && po.deliveryStatus !== 'Completed') return false;
    if (poStatusFilter === 'OVERDUE' && !po.isOverdue) return false;
    if (poStatusFilter === 'ALERT' && !po.priceDiscrepancy) return false;

    // 2. Search Term Filter
    if (!poSearchTerm || !poSearchTerm.trim()) return true;
    const term = poSearchTerm.toLowerCase().trim();
    const poNo = (po.poNumber || '').toLowerCase();
    const vendorName = (po.vendor?.companyName || po.vendor?.name || po.vendorName || '').toLowerCase();
    const source = (po.source || '').toLowerCase();
    const itemDescs = (po.items || []).map(it => (it.itemDesc || it.description || '').toLowerCase()).join(' ');

    return poNo.includes(term) || vendorName.includes(term) || source.includes(term) || itemDescs.includes(term);
  });

  const filteredRecItems = useMemo(() => {
    return (safeInventory || []).filter(item => {
      const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
      const diff = physicalVal - item.availableQtyKg;

      // 1. Search Filter
      if (recSearchTerm && recSearchTerm.trim()) {
        const q = recSearchTerm.toLowerCase().trim();
        const matchId = (item.id || '').toLowerCase().includes(q);
        const matchFilm = (item.filmType || '').toLowerCase().includes(q);
        const matchName = (item.itemName || '').toLowerCase().includes(q);
        const matchCategory = (item.category || '').toLowerCase().includes(q);
        const matchSpec = `${item.micron || ''} ${item.widthMm || ''}`.toLowerCase().includes(q);
        const matchLoc = (item.location || '').toLowerCase().includes(q);
        const matchBatch = (item.lastBatch || '').toLowerCase().includes(q);
        if (!matchId && !matchFilm && !matchName && !matchCategory && !matchSpec && !matchLoc && !matchBatch) return false;
      }

      // 2. Status Filter
      if (recStatusFilter === 'DISCREPANCY' && diff === 0) return false;
      if (recStatusFilter === 'SHORTAGE' && diff >= 0) return false;
      if (recStatusFilter === 'SURPLUS' && diff <= 0) return false;
      if (recStatusFilter === 'MATCHED' && diff !== 0) return false;

      // 3. Substrate Filter
      if (recSubstrateFilter !== 'ALL') {
        if ((item.filmType || '').toLowerCase() !== recSubstrateFilter.toLowerCase()) return false;
      }

      return true;
    });
  }, [safeInventory, physicalCounts, recSearchTerm, recStatusFilter, recSubstrateFilter]);

  const stockPagination = usePagination(filteredInventory, 50);
  const grnPagination = usePagination(safeGrns, 50);
  const poPagination = usePagination(filteredPOs, 50);
  const dispatchPagination = usePagination(dispatchShipments || initialDispatchShipments, 50);
  const recPagination = usePagination(filteredRecItems, 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* GRN PDF View Modal */}
      {selectedGRNForPDF && (
        <GRNPDF grnData={selectedGRNForPDF} onClose={() => setSelectedGRNForPDF(null)} />
      )}

      {/* Purchase Order PDF View Modal */}
      {selectedPOForPDF && (
        <PurchaseOrderPDF poData={selectedPOForPDF} onClose={() => setSelectedPOForPDF(null)} />
      )}

      {/* Modal: Resolve Rate Discrepancy (Admin Only) */}
      {resolvingPoDiscrepancy && (
        <div className="modal-overlay" onClick={() => setResolvingPoDiscrepancy(null)}>
          <div 
            className="glass-card modal-content" 
            style={{ width: '640px', maxWidth: '95vw', padding: '24px', borderRadius: '12px' }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                  <Scale style={{ color: '#dc2626' }} size={22} /> Resolve Purchase Rate Discrepancy
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '3px 0 0 0' }}>
                  Admin Authorization Required • Choose a resolution path to align PO and Inward GRN rates.
                </p>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setResolvingPoDiscrepancy(null)}>
                <X size={14} />
              </button>
            </div>

            {/* Mismatch Context Info Card */}
            {(() => {
              const mismatch = resolvingPoDiscrepancy.priceDiscrepancy || resolvingPoDiscrepancy.historicalMismatch || {};
              const diff = (mismatch.grnRate || 0) - (mismatch.poRate || 0);
              const pctDiff = mismatch.poRate ? ((diff / mismatch.poRate) * 100).toFixed(1) : 0;

              return (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', padding: '14px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #fca5a5', paddingBottom: '8px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase' }}>Purchase Order</span>
                      <div style={{ fontWeight: '800', color: '#7f1d1d', fontFamily: 'monospace' }}>{resolvingPoDiscrepancy.poNumber}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase' }}>Supplier / Vendor</span>
                      <div style={{ fontWeight: '800', color: '#7f1d1d' }}>{resolvingPoDiscrepancy.vendor?.companyName || resolvingPoDiscrepancy.vendorName || 'Supplier'}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.82rem', background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Agreed PO Rate</span>
                      <div style={{ fontWeight: '800', color: '#2563eb', fontSize: '1.05rem' }}>₹{mismatch.poRate} / kg</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Inward GRN Rate</span>
                      <div style={{ fontWeight: '800', color: '#dc2626', fontSize: '1.05rem' }}>₹{mismatch.grnRate} / kg</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Variance / Gap</span>
                      <div style={{ fontWeight: '800', color: '#b91c1c', fontSize: '1.05rem' }}>
                        {diff > 0 ? `+₹${diff.toFixed(2)}` : `₹${diff.toFixed(2)}`} ({pctDiff}%)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Resolution Options (2 Ways) */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                Select Resolution Method *
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Method 1: Accept Inward GRN Rate */}
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: '10px', 
                  padding: '12px', 
                  background: resolutionAction === 'UPDATE_PO_RATE' ? '#eff6ff' : '#f8fafc', 
                  border: resolutionAction === 'UPDATE_PO_RATE' ? '2px solid #3b82f6' : '1px solid #cbd5e1', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="radio" 
                    name="resolutionMethod" 
                    value="UPDATE_PO_RATE" 
                    checked={resolutionAction === 'UPDATE_PO_RATE'} 
                    onChange={() => setResolutionAction('UPDATE_PO_RATE')} 
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#1e3a8a' }}>
                      Option 1: Accept Inward GRN Rate (Update Purchase Order Rate)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px', lineHeight: '1.4' }}>
                      Approve and accept the vendor's invoiced rate. The PO item rate will be updated to match the actual Inward GRN rate. Clears active price alert and attaches resolution audit note to both PO & GRN.
                    </div>
                  </div>
                </label>

                {/* Method 2: Enforce Agreed PO Rate */}
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: '10px', 
                  padding: '12px', 
                  background: resolutionAction === 'ENFORCE_PO_RATE' ? '#eff6ff' : '#f8fafc', 
                  border: resolutionAction === 'ENFORCE_PO_RATE' ? '2px solid #3b82f6' : '1px solid #cbd5e1', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="radio" 
                    name="resolutionMethod" 
                    value="ENFORCE_PO_RATE" 
                    checked={resolutionAction === 'ENFORCE_PO_RATE'} 
                    onChange={() => setResolutionAction('ENFORCE_PO_RATE')} 
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#1e3a8a' }}>
                      Option 2: Enforce Agreed PO Rate (Adjust GRN / Vendor Debit Note)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px', lineHeight: '1.4' }}>
                      Enforce original contract PO rate for stock valuation. Adjusts the Inward GRN rate back to the agreed PO price, and flags the excess amount for vendor debit note / credit adjustment.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Resolution Remarks */}
            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label style={{ fontWeight: '700', fontSize: '0.82rem' }}>
                Admin Resolution Remarks & Approval Notes
              </label>
              <textarea 
                className="form-control" 
                rows={2} 
                style={{ fontSize: '0.85rem' }} 
                placeholder="Enter justification (e.g. Approved price revision due to raw material index / Vendor agreed to issue credit note)..." 
                value={resolutionNotes} 
                onChange={e => setResolutionNotes(e.target.value)} 
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <button type="button" className="btn-secondary" onClick={() => setResolvingPoDiscrepancy(null)}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ background: '#059669', borderColor: '#059669', fontWeight: '700', padding: '8px 20px' }}
                onClick={handleConfirmResolveDiscrepancy}
              >
                ✓ Confirm & Apply Resolution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Thermal Label Printer Modal */}
      {selectedRollForBarcodeModal && (
        <BarcodePrinterModal 
          rolls={selectedRollForBarcodeModal} 
          roll={selectedRollForBarcodeModal} 
          inventory={inventory}
          inks={inks}
          onClose={() => setSelectedRollForBarcodeModal(null)} 
        />
      )}

      {/* Dispatch Packing List PDF Modal */}
      {selectedDispatchForPackingList && (
        <DispatchPackingListPDF shipment={selectedDispatchForPackingList} onClose={() => setSelectedDispatchForPackingList(null)} />
      )}

      <div className="hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Stock Reconciliation Monthly Notification Banner */}
      {isRecDue && (
        <div className="reconciliation-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bell size={26} className="bell-ring" style={{ color: '#f59e0b' }} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f59e0b' }}>
                📅 MANDATORY MONTHLY PHYSICAL STOCK RECONCILIATION DUE!
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#fef08a' }}>
                Notification triggered for <b>Store Manager</b>, <b>Factory Manager</b> & <b>Admin</b> (Last 2 days of month). Please conduct physical roll count and upload stock sheet.
              </p>
            </div>
          </div>
          <button className="btn-primary" style={{ background: '#f59e0b', color: 'black' }} onClick={() => handleTabClick('reconciliation')}>
            Start Stock Reconciliation
          </button>
        </div>
      )}

      {/* Top Controls & Navigation */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Top Title & Actions Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={22} style={{ color: 'var(--primary-brand)' }} /> Raw Material Inventory, GRN & Quality Control
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Manage stock ledger, issued purchase orders, store inward GRNs, laboratory QC approvals, and dispatch packing lists.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => openIssueReturnModal('issue')}>
              <ArrowUpRight size={16} /> Issue / Return to Store
            </button>
            <button className="btn-primary" style={{ background: '#2563eb', borderColor: '#2563eb' }} onClick={() => openAddStockModal()}>
              <Plus size={16} /> Add Stock Item
            </button>
            <button className="btn-primary" onClick={() => openNewGRNModal()}>
              <Plus size={16} /> Inward GRN (New Stock)
            </button>
          </div>
        </div>

        {/* Sub Tab Pills (Fully Visible Flex Wrap Grid - No Sliding UI) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', width: '100%' }}>
          <button className={`tab-pill ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => handleTabClick('stock')}>
            <Package size={16} /> Stock Register ({(inventory || []).length})
          </button>
          <button className={`tab-pill ${activeTab === 'issued_pos' ? 'active' : ''}`} onClick={() => handleTabClick('issued_pos')}>
            <FileText size={16} style={{ color: '#4f46e5' }} /> Issued Purchase Orders Hub ({(unifiedIssuedPOs || []).length})
          </button>
          <button className={`tab-pill ${activeTab === 'grn_inward' ? 'active' : ''}`} onClick={() => handleTabClick('grn_inward')}>
            <FileCheck size={16} /> Inward GRNs ({(grns || []).length})
          </button>
          <button className={`tab-pill ${(pendingQCGRNs || []).length > 0 ? 'red-tab' : ''} ${activeTab === 'qc_approval' ? 'active' : ''}`} onClick={() => handleTabClick('qc_approval')}>
            🧪 QC Approval Lab ({(pendingQCGRNs || []).length} Pending)
          </button>
          <button className={`tab-pill ${activeTab === 'dispatch' ? 'active' : ''}`} onClick={() => handleTabClick('dispatch')}>
            <Truck size={16} style={{ color: '#059669' }} /> Scale #4 Dispatch & Packing List
          </button>
          <button className={`tab-pill ${activeTab === 'reconciliation' ? 'active' : ''}`} onClick={() => handleTabClick('reconciliation')}>
            <FileSpreadsheet size={16} /> Barcode Stock Reconciliation
          </button>
        </div>
      </div>

      {/* TAB: CENTRALIZED ISSUED PURCHASE ORDERS (PO) HUB */}
      {activeTab === 'issued_pos' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Header & Title */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <FileText size={22} style={{ color: '#4f46e5' }} />
                Centralized Platform Issued Purchase Orders (PO) Hub
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                Track days elapsed, vendor delivery SLAs, delay time, partial vs completed inward receipts, and rate discrepancy alerts.
              </p>
            </div>
          </div>

          {/* Admin Price Discrepancy Alert Banner */}
          {unifiedIssuedPOs.some(po => po.priceDiscrepancy) && (
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
                      Rate Discrepancy Detected
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
                      Inward GRN Rate Difference
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                    Difference detected between original PO agreed unit rate and actual Inward GRN rate. Highlighted in red table rows below.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards Strip */}
          <div className="glass-card" style={{ background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', padding: '14px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Total Issued POs</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                {unifiedIssuedPOs.length} Orders
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Completed Deliveries</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669', marginTop: '2px' }}>
                {unifiedIssuedPOs.filter(p => p.deliveryStatus === 'Completed').length} POs
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Partial / Pending Inward</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#d97706', marginTop: '2px' }}>
                {unifiedIssuedPOs.filter(p => p.deliveryStatus === 'Partial Delivery').length} POs
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Overdue Delivery Alert</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', marginTop: '2px' }}>
                {unifiedIssuedPOs.filter(p => p.isOverdue).length} Overdue
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Price Variance Alerts</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#7c3aed', marginTop: '2px' }}>
                {unifiedIssuedPOs.filter(p => p.priceDiscrepancy).length} Rate Mismatches
              </div>
            </div>
          </div>

          {/* Search & Status Filter Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Search by PO Number, Vendor, Material, HSN..."
                value={poSearchTerm}
                onChange={e => setPoSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Status Filter:</span>
              <select className="form-control" style={{ width: '220px', fontWeight: '600' }} value={poStatusFilter} onChange={e => setPoStatusFilter(e.target.value)}>
                <option value="ALL">🌐 All Issued POs ({unifiedIssuedPOs.length})</option>
                <option value="PENDING">⏳ Pending Inward (0 Received)</option>
                <option value="PARTIAL">📦 Partial Delivery</option>
                <option value="COMPLETED">✅ Completed Deliveries</option>
                <option value="OVERDUE">⚠️ Overdue Delivery SLA</option>
                <option value="ALERT">🚨 Price Discrepancy Alerts</option>
              </select>
            </div>
          </div>

          {/* Issued POs Data Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO Number & Source</th>
                  <th>Vendor / Supplier Details</th>
                  <th>Material Items & PO Qty</th>
                  <th>Days Elapsed</th>
                  <th>Promised Date & Delay Time</th>
                  <th>Inward Status & Delivery</th>
                  <th>Price Alert (Admin)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {poPagination.paginatedItems.map(po => {
                  return (
                    <tr key={po.poNumber} style={po.priceDiscrepancy ? { background: '#fef2f2' } : {}}>
                      <td>
                        <div style={{ fontWeight: '800', color: '#4f46e5', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                          {po.poNumber}
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                          Date: <strong>{po.poDate}</strong>
                        </span>
                        <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '1px 6px', marginTop: '3px' }}>
                          {po.source || 'Vendor Order'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>
                          {po.vendor?.companyName || po.vendor?.name || po.vendorName || 'Supplier'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                          GSTIN: <code>{po.vendor?.gstin || 'N/A'}</code>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Contact: {po.vendor?.contactPerson || po.vendor?.phone || 'Sales Rep'}
                        </div>
                      </td>

                      <td>
                        <MaterialItemsCell items={po.items || []} />
                      </td>

                      <td>
                        <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a' }}>
                          {po.daysElapsed} Days
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>
                          Since PO issuance
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>
                          {po.promisedDeliveryDate}
                        </div>
                        {po.isOverdue ? (
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '2px' }}>
                            ⚠️ {po.delayDays} Days Overdue
                          </span>
                        ) : po.deliveryStatus === 'Completed' ? (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '2px' }}>
                            ✓ Delivered on Time
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '600' }}>
                            In Time Frame
                          </span>
                        )}
                      </td>

                      <td>
                        {po.deliveryStatus === 'Completed' && (
                          <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                            ✅ Completed ({(po.totalInwardQty || 0).toFixed(0)} kg Inwarded)
                          </span>
                        )}

                        {po.deliveryStatus === 'Partial Delivery' && (
                          <div>
                            <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                              📦 Partial Delivery
                            </span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#d97706', marginTop: '3px' }}>
                              Pending Inward: {po.pendingInwardQty.toFixed(1)} kg
                            </div>
                          </div>
                        )}

                        {po.deliveryStatus === 'Pending Delivery' && (
                          <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                            ⏳ Pending Inward (0 Recd)
                          </span>
                        )}
                      </td>

                      <td>
                        {po.priceDiscrepancy ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={12} /> Rate Mismatch
                              </span>
                              <div style={{ fontSize: '0.7rem', color: '#991b1b', marginTop: '2px', fontWeight: '600' }}>
                                PO: ₹{po.priceDiscrepancy.poRate} vs GRN: ₹{po.priceDiscrepancy.grnRate}
                              </div>
                            </div>
                            {isAdmin ? (
                              <button 
                                className="btn-primary" 
                                style={{ padding: '3px 8px', fontSize: '0.72rem', background: '#dc2626', borderColor: '#dc2626', fontWeight: '700', borderRadius: '4px' }}
                                onClick={() => {
                                  setResolvingPoDiscrepancy(po);
                                  setResolutionAction('UPDATE_PO_RATE');
                                  setResolutionNotes('');
                                }}
                              >
                                ⚡ Resolve (Admin)
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>🔒 Admin Resolution Required</span>
                            )}
                          </div>
                        ) : po.priceDiscrepancyResolution ? (
                          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '4px 8px', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={12} /> Mismatch Resolved
                            </span>
                            <div style={{ fontSize: '0.68rem', color: '#0f766e', marginTop: '2px', fontWeight: '600' }}>
                              {po.priceDiscrepancyResolution.actionType === 'UPDATE_PO_RATE' ? 'Accepted GRN Rate' : 'Enforced PO Rate'}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '1px' }}>
                              By {po.priceDiscrepancyResolution.resolvedBy}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>
                            ✓ Price Matched
                          </span>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button
                            className="btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#047857', borderColor: '#047857' }}
                            onClick={() => setSelectedPOForPDF(po)}
                          >
                            <Printer size={12} /> View PO PDF
                          </button>

                          {po.deliveryStatus !== 'Completed' && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0', fontWeight: '700' }}
                              onClick={() => handleCreateGRNFromPO(po)}
                            >
                              <Plus size={12} /> Create Inward GRN
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

          <TablePagination
            currentPage={poPagination.currentPage}
            totalItems={poPagination.totalItems}
            pageSize={poPagination.pageSize}
            onPageChange={poPagination.setCurrentPage}
            onPageSizeChange={poPagination.setPageSize}
          />

        </div>
      )}

      {/* TAB 1: STOCK REGISTER */}
      {activeTab === 'stock' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input 
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                  placeholder="Search item, code, vendor, rack..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Category Filter Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                <select
                  className="form-control"
                  style={{ width: '240px', fontWeight: '700' }}
                  value={stockCategoryFilter}
                  onChange={e => setStockCategoryFilter(e.target.value)}
                >
                  <option value="ALL">🌐 All Inventory Item Categories</option>
                  <option value="Film Substrates">Film Substrates (PET, LDPE, BOPP)</option>
                  <option value="Printing Inks & Toners">Printing Inks & Toners</option>
                  <option value="Chemicals & Solvents">Chemicals & Solvents</option>
                  <option value="Adhesives & Hardener">Adhesives & Hardener</option>
                  <option value="Doctor Blades & Wipers">Doctor Blades & Wipers</option>
                  <option value="Rollers & Sleeves">Rollers & Sleeves</option>
                  <option value="Machine Spare Parts">Machine Spare Parts</option>
                  <option value="Lubricants & Oils">Lubricants & Oils</option>
                  <option value="Tapes & Consumables">Tapes & Consumables</option>
                  <option value="Safety Gear (PPE)">Safety Gear (PPE)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                className="btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                onClick={handleDownloadBulkInventoryTemplate}
              >
                <Download size={15} /> Download CSV Template
              </button>

              <label 
                className="btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '6px 12px', cursor: 'pointer', margin: 0 }}
              >
                <Upload size={15} /> Bulk Upload Stock CSV
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ display: 'none' }} 
                  onChange={handleBulkInventoryCSVUpload} 
                />
              </label>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>Total Items: <b>{filteredInventory.length} Listed</b></span>
                <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '0.82rem' }}>
                  💰 Total Stock Valuation: ₹ {safeInventory.reduce((sum, i) => sum + ((parseFloat(i.availableQtyKg) || 0) * (parseFloat(i.unitPrice || i.purchaseRatePerKg) || 0)), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Item Name & Code</th>
                  <th>Category</th>
                  <th>Specs / Gauge</th>
                  <th>Available Stock</th>
                  <th>Purchase Rate (₹)</th>
                  <th>Purchase Valuation (₹)</th>
                  <th>Allocated Qty</th>
                  <th>Location Bay</th>
                  <th>Last Supplier & Batch</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stockPagination.paginatedItems.map(item => {
                  const isLow = (item.availableQtyKg ?? 0) <= (item.reorderLevelKg ?? 100);
                  const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
                  const title = item.itemName || (isFilm ? `${item.filmType} (${item.micron}µ x ${item.widthMm}mm)` : (item.category || item.filmType || 'Stock Item'));
                  const unitStr = item.unit || 'kg';
                  const rate = parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0;
                  const availQty = parseFloat(item.availableQtyKg) || 0;
                  const itemValuation = availQty * rate;

                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>{item.id}</td>
                      <td>
                        <button 
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            padding: 0, 
                            fontFamily: 'inherit', 
                            fontSize: 'inherit', 
                            fontWeight: '700', 
                            color: '#2563eb', 
                            cursor: 'pointer', 
                            textDecoration: 'underline',
                            textAlign: 'left'
                          }}
                          onClick={() => setSelectedItemForPurchaseHistory(item)}
                          title="Click to view date-wise GRN Purchase & Receipt History"
                        >
                          {title}
                        </button>
                        {item.itemCode && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.itemCode}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.75rem', fontWeight: '700' }}>
                          {item.category || 'Film Substrates'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {isFilm ? `${item.micron}µ × ${item.widthMm}mm` : (item.widthMm && item.widthMm !== '-' ? `${item.widthMm}mm` : '-')}
                      </td>
                      <td style={{ fontSize: '1.1rem', fontWeight: '800', color: isLow ? '#ef4444' : '#047857' }}>
                        {(item.availableQtyKg ?? 0).toLocaleString()} {unitStr}
                      </td>
                      <td style={{ fontWeight: '700', color: '#1e293b' }}>
                        ₹{rate > 0 ? rate.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'} / {unitStr}
                      </td>
                      <td style={{ fontWeight: '800', color: '#047857' }}>
                        ₹{itemValuation > 0 ? itemValuation.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0.00'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{(item.allocatedQtyKg ?? 0).toLocaleString()} {unitStr}</td>
                      <td>{item.location}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <div>{item.lastVendor}</div>
                        <code style={{ color: 'var(--accent-color)' }}>{item.lastBatch}</code>
                      </td>
                      <td>
                        {isLow ? (
                          <span className="badge badge-warning" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="badge badge-us">IN STOCK</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn-primary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#059669', borderColor: '#059669' }}
                            onClick={() => openNewGRNModal(item)}
                            title="Create Inward GRN for this item"
                          >
                            <Plus size={14} /> Inward
                          </button>
                          
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => setSelectedItemForPurchaseHistory(item)}
                            title="View GRN Purchase History"
                          >
                            <Clock size={14} /> History
                          </button>
                          
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => openEditStockModal(item)}
                            title="Edit Stock Item"
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                          
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecaca' }}
                            onClick={() => handleDeleteStockItem(item)}
                            title="Delete Stock Item"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={stockPagination.currentPage}
            totalItems={stockPagination.totalItems}
            pageSize={stockPagination.pageSize}
            onPageChange={stockPagination.setCurrentPage}
            onPageSizeChange={stockPagination.setPageSize}
          />
        </div>
      )}

      {/* TAB 2: INWARD GOODS RECEIPT NOTES (GRN) */}
      {activeTab === 'grn_inward' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: '600' }}>Goods Receipt Notes (GRN Inward History)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>GRN Number</th>
                  <th>Ref PO #</th>
                  <th>Vendor Name</th>
                  <th>Invoice #</th>
                  <th>Film Specs</th>
                  <th>Inward Qty (Kg)</th>
                  <th>Batch / Heat #</th>
                  <th>QC Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grnPagination.paginatedItems.map(g => (
                  <tr key={g.grnNo}>
                    <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>{g.grnNo}</td>
                    <td>{g.poNumber}</td>
                    <td style={{ fontWeight: '600' }}>{g.vendorName}</td>
                    <td>{g.invoiceNo}</td>
                    <td>{g.filmType} ({g.micron}µ / {g.widthMm}mm)</td>
                    <td style={{ fontWeight: '700', color: '#60a5fa' }}>{g.netWeightKg} kg ({g.rollsReceived} rolls)</td>
                    <td><code>{g.batchNo}</code></td>
                    <td>
                      {g.status === 'Approved' && <span className="badge badge-us">APPROVED BY QC</span>}
                      {g.status === 'Pending QC' && <span className="badge badge-warning">PENDING QC</span>}
                      {g.status === 'Rejected' && <span className="badge badge-warning" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>REJECTED</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setSelectedGRNForPDF(g)}>
                          <Printer size={14} /> Print GRN
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#059669', borderColor: '#a7f3d0' }}
                          onClick={() => {
                            const matchedRolls = (inventoryRolls || []).filter(r => 
                              r.grnNo === g.grnNo || 
                              (r.invoiceNo === g.invoiceNo && r.batchNo === g.batchNo && r.vendorName === g.vendorName)
                            );
                            const isFilm = g.category === 'Film Substrates';
                            
                            if (matchedRolls.length > 0) {
                              setSelectedRollForBarcodeModal(matchedRolls);
                            } else {
                              const unitCount = Math.max(1, parseInt(g.rollsReceived) || 1);
                              const unitQty = Number(((g.netWeightKg || 0) / unitCount).toFixed(2));
                              const grnCode = (g.grnNo || 'GRN-000').replace('GRN-', '');
                              const fallbackRolls = [];
                              for (let i = 1; i <= unitCount; i++) {
                                fallbackRolls.push({
                                  barcodeId: unitCount > 1 ? `${isFilm ? 'RM-BC' : 'CON-BC'}-${grnCode}-${i}` : `${isFilm ? 'RM-BC' : 'CON-BC'}-${grnCode}`,
                                  grnNo: g.grnNo,
                                  unitNo: i,
                                  totalUnits: unitCount,
                                  rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
                                  itemName: g.itemName || (isFilm ? `${g.filmType} (${g.micron}µ / ${g.widthMm}mm)` : `${g.category} Item`),
                                  category: g.category || (isFilm ? 'Film Substrates' : 'General Store'),
                                  unit: g.unit || (isFilm ? 'Kg' : 'Pcs'),
                                  micron: isFilm && g.micron !== '-' ? parseFloat(g.micron) : 0,
                                  widthMm: isFilm && g.widthMm !== '-' ? parseFloat(g.widthMm) : 0,
                                  netWeightKg: unitQty,
                                  availableWeightKg: unitQty,
                                  purchaseRatePerKg: g.purchaseRatePerKg || g.purchaseRate || g.unitPrice || 0,
                                  vendorName: g.vendorName,
                                  invoiceNo: g.invoiceNo,
                                  batchNo: g.batchNo,
                                  stationId: 'SCALE_1_INWARD'
                                });
                              }
                              setSelectedRollForBarcodeModal(fallbackRolls);
                            }
                          }}
                        >
                          <Printer size={14} /> Barcode
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={grnPagination.currentPage}
            totalItems={grnPagination.totalItems}
            pageSize={grnPagination.pageSize}
            onPageChange={grnPagination.setCurrentPage}
            onPageSizeChange={grnPagination.setPageSize}
          />
        </div>
      )}

      {/* TAB 3: QC APPROVAL LAB */}
      {activeTab === 'qc_approval' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🧪 Quality Control (QC) Lab Inspection & Approval Portal
          </h3>

          {pendingQCGRNs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: '12px' }} />
              <p style={{ fontSize: '1.1rem', fontWeight: '600', color: 'white' }}>All incoming material GRNs are inspected and approved!</p>
              <p style={{ fontSize: '0.85rem' }}>No pending QC approvals in queue.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
              {pendingQCGRNs.map(g => (
                <div key={g.grnNo} className="glass-card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <span className="badge badge-warning">AWAITING QC CLEARANCE</span>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: '700', marginTop: '6px' }}>{g.grnNo}</h4>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>PO: {g.poNumber}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{g.vendorName}</div>
                    </div>
                  </div>

                  <div className="calc-summary-box" style={{ marginBottom: '16px' }}>
                    <div className="calc-summary-row">
                      <span>{g.category === 'Film Substrates' ? 'Material Substrate:' : 'Material Item / Category:'}</span>
                      <span className="bold-val">
                        {g.category === 'Film Substrates' || (g.micron && g.micron !== '-' && parseFloat(g.micron) > 0)
                          ? `${g.filmType} (${g.micron}µ / ${g.widthMm}mm)`
                          : (g.itemName || g.category || g.filmType || 'Chemicals & Solvents')}
                      </span>
                    </div>
                    <div className="calc-summary-row">
                      <span>Inward Net Weight:</span>
                      <span className="bold-val" style={{ color: '#60a5fa' }}>{g.netWeightKg} {g.unit || 'kg'} ({g.rollsReceived || 1} {g.packagingType || 'units'})</span>
                    </div>
                    <div className="calc-summary-row">
                      <span>Manufacturer Batch #:</span>
                      <code>{g.batchNo}</code>
                    </div>
                  </div>

                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => setQcInspectingGRN(g)}>
                    Inspect Material & Approve / Reject
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: SCALE #4 DISPATCH & PACKING LIST */}
      {activeTab === 'dispatch' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={22} style={{ color: '#059669' }} />
                Scale #4 - Finished Goods Dispatch & Packing List Station
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Weigh FG rolls/pouches on Scale #4, print dispatch barcode slips, and generate printable A4 Packing List PDFs.
              </p>
            </div>

            <button className="btn-primary" style={{ background: '#059669', borderColor: '#059669' }} onClick={() => setIsNewDispatchModalOpen(true)}>
              <Plus size={16} /> Create New Dispatch Shipment
            </button>
          </div>

          {/* Dispatch Shipments Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dispatch ID</th>
                  <th>Date & Time</th>
                  <th>Customer / Client Name</th>
                  <th>Job Name</th>
                  <th>Vehicle & LR #</th>
                  <th>Rolls Count</th>
                  <th>Net Weight (Kg)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dispatchPagination.paginatedItems.map(ds => (
                  <tr key={ds.dispatchId}>
                    <td style={{ fontWeight: '700', color: '#2563eb' }}>{ds.dispatchId}</td>
                    <td style={{ fontSize: '0.85rem' }}>{ds.dispatchDate}</td>
                    <td style={{ fontWeight: '700' }}>{ds.clientName}</td>
                    <td style={{ fontWeight: '600' }}>{ds.jobName}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {ds.vehicleNo} | {ds.lrNo}
                    </td>
                    <td style={{ fontWeight: '700', textAlign: 'center' }}>{ds.totalRolls} rolls</td>
                    <td style={{ fontWeight: '800', color: '#047857' }}>
                      {Number(ds.totalNetWeightKg).toLocaleString()} kg
                    </td>
                    <td>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#059669' }}
                        onClick={() => setSelectedDispatchForPackingList(ds)}
                      >
                        <Printer size={14} /> Print Packing List PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={dispatchPagination.currentPage}
            totalItems={dispatchPagination.totalItems}
            pageSize={dispatchPagination.pageSize}
            onPageChange={dispatchPagination.setCurrentPage}
            onPageSizeChange={dispatchPagination.setPageSize}
          />
        </div>
      )}

      {/* TAB 4: PHYSICAL STOCK RECONCILIATION */}
      {activeTab === 'reconciliation' && (() => {
        // Unique film substrate options for filter dropdown
        const uniqueFilmSubstrates = Array.from(new Set(inventory.map(item => item.filmType))).filter(Boolean);

        // Compute audit stats across all inventory items
        let matchedCount = 0;
        let shortageCount = 0;
        let surplusCount = 0;
        let totalNetShortageKg = 0;
        let totalNetSurplusKg = 0;

        inventory.forEach(item => {
          const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
          const diff = physicalVal - item.availableQtyKg;
          if (diff === 0) matchedCount++;
          else if (diff < 0) {
            shortageCount++;
            totalNetShortageKg += Math.abs(diff);
          } else {
            surplusCount++;
            totalNetSurplusKg += diff;
          }
        });

        return (
          <div className="glass-panel" style={{ padding: '24px' }}>
            {/* Header Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={24} style={{ color: 'var(--accent-color)' }} /> Monthly Physical Stock Reconciliation
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Download stock audit sheet template (Excel/CSV), input physical counts, and reconcile inventory variances.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-secondary" onClick={downloadReconciliationTemplate}>
                  <Download size={16} /> Download Excel/CSV Template
                </button>

                <label className="btn-primary" style={{ cursor: 'pointer' }}>
                  <Upload size={16} /> Upload Filled Physical Stock Sheet (.csv)
                  <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            {/* Reconciliation KPI Summary Cards */}
            <div className="glass-card" style={{ background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', padding: '14px', marginBottom: '20px' }}>
              <div>
                <span className="stats-title" style={{ fontSize: '0.75rem' }}>Total Audit Items</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                  {(inventory || []).length} SKUs
                </div>
              </div>

              <div>
                <span className="stats-title" style={{ fontSize: '0.75rem' }}>Matched Stocks</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669', marginTop: '2px' }}>
                  {matchedCount} Items
                </div>
              </div>

              <div>
                <span className="stats-title" style={{ fontSize: '0.75rem' }}>Shortages / Losses</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#dc2626', marginTop: '2px' }}>
                  {shortageCount} SKUs <span style={{ fontSize: '0.75rem', fontWeight: '600' }}>(-{totalNetShortageKg.toFixed(1)}kg)</span>
                </div>
              </div>

              <div>
                <span className="stats-title" style={{ fontSize: '0.75rem' }}>Surplus / Gains</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#2563eb', marginTop: '2px' }}>
                  {surplusCount} SKUs <span style={{ fontSize: '0.75rem', fontWeight: '600' }}>(+{totalNetSurplusKg.toFixed(1)}kg)</span>
                </div>
              </div>

              <div>
                <span className="stats-title" style={{ fontSize: '0.75rem' }}>Discrepancies Ratio</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: (shortageCount + surplusCount) > 0 ? '#d97706' : '#059669', marginTop: '2px' }}>
                  {(inventory || []).length > 0 ? (((shortageCount + surplusCount) / (inventory || []).length) * 100).toFixed(0) : 0}% Variance
                </div>
              </div>
            </div>

            {/* Search Bar & Filter Controls Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px', background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              
              {/* Search Box */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '32px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.85rem' }}
                    placeholder="Search Inventory ID, Substrate, Micron/Width..."
                    value={recSearchTerm}
                    onChange={e => setRecSearchTerm(e.target.value)}
                  />
                  {recSearchTerm && (
                    <button 
                      onClick={() => setRecSearchTerm('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Status & Substrate Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                
                {/* Status Filter Pills */}
                <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: recStatusFilter === 'ALL' ? '700' : '500',
                      background: recStatusFilter === 'ALL' ? '#ffffff' : 'transparent',
                      color: recStatusFilter === 'ALL' ? '#0f172a' : 'var(--text-secondary)',
                      boxShadow: recStatusFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setRecStatusFilter('ALL')}
                  >
                    All ({(inventory || []).length})
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: recStatusFilter === 'DISCREPANCY' ? '700' : '500',
                      background: recStatusFilter === 'DISCREPANCY' ? '#ffffff' : 'transparent',
                      color: recStatusFilter === 'DISCREPANCY' ? '#d97706' : 'var(--text-secondary)',
                      boxShadow: recStatusFilter === 'DISCREPANCY' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setRecStatusFilter('DISCREPANCY')}
                  >
                    ⚠️ Discrepancies ({shortageCount + surplusCount})
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: recStatusFilter === 'SHORTAGE' ? '700' : '500',
                      background: recStatusFilter === 'SHORTAGE' ? '#ffffff' : 'transparent',
                      color: recStatusFilter === 'SHORTAGE' ? '#dc2626' : 'var(--text-secondary)',
                      boxShadow: recStatusFilter === 'SHORTAGE' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setRecStatusFilter('SHORTAGE')}
                  >
                    🔻 Shortage ({shortageCount})
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: recStatusFilter === 'SURPLUS' ? '700' : '500',
                      background: recStatusFilter === 'SURPLUS' ? '#ffffff' : 'transparent',
                      color: recStatusFilter === 'SURPLUS' ? '#2563eb' : 'var(--text-secondary)',
                      boxShadow: recStatusFilter === 'SURPLUS' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setRecStatusFilter('SURPLUS')}
                  >
                    🟢 Surplus ({surplusCount})
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: recStatusFilter === 'MATCHED' ? '700' : '500',
                      background: recStatusFilter === 'MATCHED' ? '#ffffff' : 'transparent',
                      color: recStatusFilter === 'MATCHED' ? '#059669' : 'var(--text-secondary)',
                      boxShadow: recStatusFilter === 'MATCHED' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setRecStatusFilter('MATCHED')}
                  >
                    ✅ Matched ({matchedCount})
                  </button>
                </div>

                {/* Substrate Dropdown Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                  <select
                    className="form-control"
                    style={{ padding: '5px 10px', fontSize: '0.8rem', width: '160px' }}
                    value={recSubstrateFilter}
                    onChange={e => setRecSubstrateFilter(e.target.value)}
                  >
                    <option value="ALL">All Substrates</option>
                    {uniqueFilmSubstrates.map(film => (
                      <option key={film} value={film}>{film} Film</option>
                    ))}
                  </select>
                </div>

                {/* Reset Filters button if any filter is active */}
                {(recSearchTerm || recStatusFilter !== 'ALL' || recSubstrateFilter !== 'ALL') && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    onClick={() => {
                      setRecSearchTerm('');
                      setRecStatusFilter('ALL');
                      setRecSubstrateFilter('ALL');
                    }}
                  >
                    Clear Filters
                  </button>
                )}

              </div>
            </div>

            {/* Variance Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table className="data-table">
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th>Inventory ID</th>
                    <th>Film Substrate</th>
                    <th>Micron & Width</th>
                    <th>System Stock (Kg)</th>
                    <th style={{ width: '170px' }}>Physical Count (Kg)</th>
                    <th>Variance (Kg)</th>
                    <th>Variance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        <div>No physical stock reconciliation items match your search & filter parameters.</div>
                        <button 
                          className="btn-secondary" 
                          style={{ marginTop: '10px', fontSize: '0.8rem', padding: '4px 12px' }}
                          onClick={() => {
                            setRecSearchTerm('');
                            setRecStatusFilter('ALL');
                            setRecSubstrateFilter('ALL');
                          }}
                        >
                          Reset Filters
                        </button>
                      </td>
                    </tr>
                  ) : (
                    recPagination.paginatedItems.map(item => {
                      const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
                      const diff = physicalVal - item.availableQtyKg;
                      const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';

                      return (
                        <tr key={item.id} style={{ background: diff < 0 ? '#fff5f5' : (diff > 0 ? '#f0fdf4' : 'transparent') }}>
                          <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>{item.id}</td>
                          <td style={{ fontWeight: '600' }}>{item.itemName || (isFilm ? `${item.filmType}` : (item.category || item.filmType || 'Stock Item'))}</td>
                          <td>{isFilm && item.micron && item.micron !== '-' ? `${item.micron}µ / ${item.widthMm}mm` : '—'}</td>
                          <td style={{ fontWeight: '700' }}>{(item.availableQtyKg ?? 0).toLocaleString()} {item.unit || 'kg'}</td>
                          <td style={{ width: '170px' }}>
                            <input 
                              type="number" 
                              step="0.1"
                              className="form-control" 
                              style={{ padding: '6px', fontWeight: '600', borderColor: diff !== 0 ? (diff > 0 ? '#059669' : '#dc2626') : 'var(--border-color)' }}
                              value={physicalVal}
                              onChange={e => setPhysicalCounts({ ...physicalCounts, [item.id]: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td style={{ fontWeight: '800', color: diff === 0 ? 'var(--text-secondary)' : (diff > 0 ? '#059669' : '#dc2626') }}>
                            {diff > 0 ? `+${diff.toFixed(1)} kg` : `${diff.toFixed(1)} kg`}
                          </td>
                          <td>
                            {diff === 0 ? (
                              <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857' }}>✅ MATCHED</span>
                            ) : diff > 0 ? (
                              <span className="badge badge-both" style={{ background: '#dbeafe', color: '#1e40af' }}>🟢 + GAIN (SURPLUS)</span>
                            ) : (
                              <span className="badge badge-warning" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                🔻 - SHORTAGE (LOSS)
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

            <TablePagination
              currentPage={recPagination.currentPage}
              totalItems={recPagination.totalItems}
              pageSize={recPagination.pageSize}
              onPageChange={recPagination.setCurrentPage}
              onPageSizeChange={recPagination.setPageSize}
            />

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing <strong>{recPagination.paginatedItems.length}</strong> of <strong>{(filteredRecItems || []).length}</strong> filtered items (Total Stock Items: {(inventory || []).length})
              </div>
              <button className="btn-primary" style={{ padding: '12px 24px', fontSize: '1rem' }} onClick={handleCommitReconciliation}>
                <CheckCircle2 size={18} /> Commit Reconciliation & Update System Stock
              </button>
            </div>
          </div>
        );
      })()}

      {/* Modal: New Inward GRN */}
      {isNewGRNModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewGRNModalOpen(false)}>
          <div 
            className="glass-card modal-content modal-content-clean" 
            style={{ width: '880px', maxWidth: '96vw' }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Dark Executive Header */}
            <div className="modal-header-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  background: 'rgba(2, 132, 199, 0.25)', 
                  padding: '10px', 
                  borderRadius: '10px', 
                  color: '#38bdf8', 
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center'
                }}>
                  <Package size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: '800', margin: 0, color: '#ffffff', letterSpacing: '-0.01em' }}>
                    Create Goods Receipt Note (GRN Inward)
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Store Manager stock inward entry • Generates downloadable GRN & triggers QC inspection
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={() => setIsNewGRNModalOpen(false)}
                title="Close Modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveGRN}>
              
              {/* Section 1: Vendor & Item Categorization */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={14} style={{ color: '#0284c7' }} /> 1. Vendor & Item Categorization
                </div>

                <div className="form-grid">
                  {/* Vendor Selection */}
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ margin: 0, fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                        Vendor Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsVendorModalOpen(true)}
                        style={{
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#047857',
                          fontSize: '0.76rem',
                          fontWeight: '700',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Plus size={14} /> Onboard New Vendor
                      </button>
                    </div>
                    <select 
                      className="form-control" 
                      value={grnVendor} 
                      onChange={e => {
                        if (e.target.value === '__CREATE_NEW__') {
                          setIsVendorModalOpen(true);
                        } else {
                          setGrnVendor(e.target.value);
                        }
                      }}
                      style={{ fontWeight: '500' }}
                    >
                      <option value="" disabled>-- Select Vendor --</option>
                      {(vendors || []).map(v => (
                        <option key={v.id} value={v.companyName}>{v.companyName} ({v.gstin || 'GSTIN N/A'})</option>
                      ))}
                      <option value="__CREATE_NEW__" style={{ fontWeight: '700', color: '#047857' }}>
                        ➕ + Onboard / Create New Vendor...
                      </option>
                    </select>
                  </div>

                  {/* Item Category */}
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Inward Item Category <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select 
                      className="form-control" 
                      style={{ fontWeight: '600', color: '#0284c7', background: '#f0f9ff', borderColor: '#bae6fd' }}
                      value={grnCategory} 
                      onChange={e => setGrnCategory(e.target.value)}
                    >
                      <option value="Film Substrates">Film Substrates (PET, METPET, LDPE, BOPP, CPP, Foil)</option>
                      <option value="Printing Inks & Toners">Printing Inks & Toners</option>
                      <option value="Chemicals & Solvents">Chemicals & Solvents (Ethyl Acetate, Anilox Cleaner)</option>
                      <option value="Adhesives & Hardener">Adhesives & Hardener (Solventless Comp A/B)</option>
                      <option value="Doctor Blades & Wipers">Doctor Blades & Wipers</option>
                      <option value="Rollers & Sleeves">Rollers & Sleeves</option>
                      <option value="Machine Spare Parts">Machine Spare Parts</option>
                      <option value="Lubricants & Oils">Lubricants & Oils</option>
                      <option value="Tapes & Consumables">Tapes & Consumables (PTFE, Masking)</option>
                      <option value="Safety Gear (PPE)">Safety Gear (PPE)</option>
                    </select>
                  </div>

                  {/* Searchable Stock Item Link */}
                  <div className="form-group" style={{ gridColumn: 'span 2', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ margin: 0, fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                        Select Existing Stock Item (Searchable List) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      {grnSelectedStockItemId && (
                        <span style={{ fontSize: '0.74rem', color: '#047857', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #86efac', fontWeight: '700' }}>
                          ✓ Linked SKU #{inventory.find(i => String(i.id) === String(grnSelectedStockItemId))?.itemCode || grnSelectedStockItemId}
                        </span>
                      )}
                    </div>

                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 2 }} />
                      <input
                        type="text"
                        className="form-control"
                        style={{ paddingLeft: '36px', paddingRight: '36px', fontWeight: grnSelectedStockItemId ? '700' : 'normal' }}
                        placeholder="Search existing stock items (e.g. Doctor Blade, Cyan Ink, PET 12µ)..."
                        value={grnItemSearchTerm}
                        onChange={e => {
                          const val = e.target.value;
                          setGrnItemSearchTerm(val);
                          setGrnItemName(val);
                          setGrnSelectedStockItemId('');
                          setIsGrnItemDropdownOpen(true);
                        }}
                        onFocus={() => setIsGrnItemDropdownOpen(true)}
                      />
                      <ChevronDown 
                        size={16} 
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', cursor: 'pointer', zIndex: 2 }}
                        onClick={() => setIsGrnItemDropdownOpen(!isGrnItemDropdownOpen)}
                      />
                    </div>

                    {/* Dropdown Options List */}
                    {isGrnItemDropdownOpen && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 200,
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '10px',
                          boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.2)',
                          maxHeight: '220px',
                          overflowY: 'auto',
                          marginTop: '4px'
                        }}
                      >
                        <div 
                          style={{
                            padding: '10px 14px',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            color: '#2563eb',
                            background: '#eff6ff',
                            cursor: 'pointer',
                            borderBottom: '1px solid #dbeafe',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setGrnSelectedStockItemId('');
                            setIsGrnItemDropdownOpen(false);
                          }}
                        >
                          <Plus size={14} /> + Inward New Custom Item (Not in Stock List)
                        </div>

                        {filteredStockItemsForGrn.length === 0 ? (
                          <div style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                            No matching stock items found. You can enter a custom item name above.
                          </div>
                        ) : (
                          filteredStockItemsForGrn.map(item => {
                            const title = item.itemName || `${item.filmType || 'Film'} ${item.micron && item.micron !== '-' ? item.micron + 'µ' : ''} ${item.widthMm && item.widthMm !== '-' ? '(' + item.widthMm + 'mm)' : ''}`.trim();
                            const isSelected = String(grnSelectedStockItemId) === String(item.id);
                            
                            return (
                              <div
                                key={item.id}
                                style={{
                                  padding: '10px 14px',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #f1f5f9',
                                  background: isSelected ? '#f0f9ff' : 'transparent',
                                  display: 'flex',
                                  justify: 'space-between',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectStockItemForGrn(item);
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#0f172a' }}>
                                    {title}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                    <span>Code: <strong>{item.itemCode || item.id}</strong></span>
                                    <span>Category: <strong style={{ color: '#475569' }}>{item.category || 'Film Substrates'}</strong></span>
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                                    {item.availableQtyKg || 0} {item.unit || 'Kg'} in Stock
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Reference & Batch Documentation */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} style={{ color: '#0284c7' }} /> 2. Invoice & Batch Documentation
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Ref PO Number</label>
                    <input type="text" className="form-control" placeholder="e.g. SIL/PO/26-27/1941" value={grnPoNo} onChange={e => setGrnPoNo(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                      Vendor Invoice Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input type="text" className="form-control" required placeholder="e.g. INV-FP-9904" value={grnInvoiceNo} onChange={e => setGrnInvoiceNo(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                      Manufacturer Batch / Heat # <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input type="text" className="form-control" required placeholder="e.g. BATCH-PET-991" value={grnBatchNo} onChange={e => setGrnBatchNo(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                      Material / Container Packaging Type <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select 
                      className="form-control" 
                      style={{ fontWeight: '600', color: '#1e40af', background: '#eff6ff', borderColor: '#bfdbfe' }}
                      value={grnPackagingType} 
                      onChange={e => setGrnPackagingType(e.target.value)}
                    >
                      {PACKAGING_MATERIAL_TYPES.map(type => (
                        <option key={type} value={type}>{type} ({type}s)</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Specifications & Quantity Parameters (Individual Roll & Container Breakdown) */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Scale size={14} style={{ color: '#0284c7' }} /> 3. Specifications & Individual {grnPackagingType} Breakdown
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                      {grnItemsList.length} {grnPackagingType}{grnItemsList.length > 1 ? 's' : ''} in Breakdown
                    </span>
                  </div>
                </div>

                {/* Common Specifications Grid */}
                <div className="form-grid" style={{ marginBottom: '16px' }}>
                  {grnCategory === 'Film Substrates' ? (
                    <>
                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Film Substrate</label>
                        <select className="form-control" value={grnFilmType} onChange={e => setGrnFilmType(e.target.value)}>
                          {Object.keys(FILM_DENSITIES).map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Micron Gauge (µ)</label>
                        <input type="number" className="form-control" placeholder="e.g. 12" value={grnMicron} onChange={e => setGrnMicron(e.target.value)} />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Slit Width (mm)</label>
                        <input type="number" className="form-control" placeholder="e.g. 1000" value={grnWidthMm} onChange={e => setGrnWidthMm(e.target.value)} />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                          Purchase Rate (₹ / Kg) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input 
                          type="number" 
                          step="any" 
                          className="form-control" 
                          required 
                          placeholder="e.g. 145.50" 
                          value={grnPurchaseRate} 
                          onChange={e => setGrnPurchaseRate(e.target.value)} 
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                          Item Description / Specification <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input 
                          type="text" 
                          className="form-control" 
                          required 
                          placeholder="e.g. Process Cyan Ink / Ethyl Acetate Solvent / Doctor Blades 0.15mm" 
                          value={grnItemName} 
                          onChange={e => setGrnItemName(e.target.value)} 
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                          Unit of Measure (UOM) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select className="form-control" value={grnUnit} onChange={e => setGrnUnit(e.target.value)}>
                          <option value="Kg">Kg</option>
                          <option value="Litres">Litres</option>
                          <option value="Meters">Meters</option>
                          <option value="Boxes">Boxes</option>
                          <option value="Rolls">Rolls</option>
                          <option value="Pcs">Pcs</option>
                          <option value="Drums">Drums</option>
                          <option value="Bags">Bags</option>
                          <option value="Cans">Cans</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                          Purchase Rate (₹ / {grnUnit}) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input 
                          type="number" 
                          step="any" 
                          className="form-control" 
                          required 
                          placeholder="e.g. 280.00" 
                          value={grnPurchaseRate} 
                          onChange={e => setGrnPurchaseRate(e.target.value)} 
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Quick Roll Count & Default Core / Container Tare Helper Toolbar */}
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Number of {grnPackagingType}s:</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="200"
                        style={{ width: '65px', padding: '4px 8px', fontSize: '0.85rem', fontWeight: '700', borderRadius: '4px', border: '1px solid #94a3b8', textAlign: 'center' }}
                        value={grnRolls || grnItemsList.length} 
                        onChange={e => handleRollsCountChange(e.target.value)} 
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Default Tare / Core (kg):</span>
                      <input 
                        type="number" 
                        step="0.1"
                        min="0"
                        style={{ width: '65px', padding: '4px 8px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                        value={grnDefaultTare}
                        placeholder="0"
                        onChange={e => setGrnDefaultTare(e.target.value)}
                      />
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ padding: '3px 8px', fontSize: '0.72rem', fontWeight: '700' }}
                        onClick={() => handleApplyDefaultTare(grnDefaultTare)}
                        title="Set this tare weight on all rows"
                      >
                        Apply All
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleAddGrnItemRow()}
                      className="btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '0.78rem', color: '#0369a1', borderColor: '#bae6fd', fontWeight: '700' }}
                    >
                      <Plus size={14} style={{ marginRight: '4px' }} /> Add {grnPackagingType}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const total = prompt(`Enter total invoice ${grnCategory === 'Film Substrates' ? 'weight (kg)' : grnUnit} to distribute across ${grnItemsList.length} ${grnPackagingType}s:`, grnWeightKg || '1000');
                        if (total) handleDistributeTotalWeightEvenly(total);
                      }}
                      className="btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '0.78rem', fontWeight: '600' }}
                      title="Quick distribute total weight equally as a baseline"
                    >
                      Quick Distribute
                    </button>
                  </div>
                </div>

                {/* Individual Roll / Container Breakdown Table */}
                <div style={{ 
                  background: '#ffffff', 
                  borderRadius: '8px', 
                  border: '1px solid #cbd5e1', 
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  maxHeight: '360px',
                  overflowY: 'auto'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <th style={{ padding: '8px 10px', width: '70px' }}>Unit #</th>
                        <th style={{ padding: '8px 10px', width: '140px' }}>Gross Wt (kg)</th>
                        <th style={{ padding: '8px 10px', width: '95px' }}>Tare / Core (kg)</th>
                        <th style={{ padding: '8px 10px', width: '160px' }}>Net Weight ({grnCategory === 'Film Substrates' ? 'Kg' : grnUnit}) *</th>
                        {grnCategory === 'Film Substrates' && (
                          <th style={{ padding: '8px 10px', width: '110px' }}>Est. Length (m)</th>
                        )}
                        <th style={{ padding: '8px 10px' }}>Vendor {grnPackagingType} / Lot #</th>
                        <th style={{ padding: '8px 8px', width: '45px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {grnItemsList.map((item, index) => {
                        const unitNumber = index + 1;
                        const netVal = parseFloat(item.netWeightKg);
                        const isNetValid = !isNaN(netVal) && netVal > 0;

                        return (
                          <tr 
                            key={item.id || index}
                            style={{ 
                              borderBottom: '1px solid #e2e8f0', 
                              background: index % 2 === 0 ? '#ffffff' : '#f8fafc' 
                            }}
                          >
                            {/* Unit Label */}
                            <td style={{ padding: '6px 10px', fontWeight: '800', color: '#1e40af', whiteSpace: 'nowrap' }}>
                              {grnPackagingType} #{unitNumber}
                            </td>

                            {/* Gross Weight with Scale Button */}
                            <td style={{ padding: '6px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input 
                                  type="number"
                                  step="any"
                                  min="0"
                                  style={{ 
                                    width: '75px', 
                                    padding: '4px 6px', 
                                    fontSize: '0.82rem', 
                                    borderRadius: '4px', 
                                    border: '1px solid #cbd5e1', 
                                    textAlign: 'right',
                                    fontWeight: '600' 
                                  }}
                                  placeholder="0.0"
                                  value={item.grossWeightKg}
                                  onChange={e => handleUpdateGrnItemRow(item.id, 'grossWeightKg', e.target.value)}
                                />
                                <WeighingScaleCaptureButton 
                                  label=""
                                  style={{ padding: '3px 5px' }}
                                  onCapture={(weight) => handleUpdateGrnItemRow(item.id, 'grossWeightKg', weight)} 
                                />
                              </div>
                            </td>

                            {/* Tare / Core Weight */}
                            <td style={{ padding: '6px 10px' }}>
                              <input 
                                type="number"
                                step="any"
                                min="0"
                                style={{ 
                                  width: '65px', 
                                  padding: '4px 6px', 
                                  fontSize: '0.82rem', 
                                  borderRadius: '4px', 
                                  border: '1px solid #cbd5e1', 
                                  textAlign: 'right',
                                  color: '#64748b'
                                }}
                                placeholder="0"
                                value={item.tareWeightKg}
                                onChange={e => handleUpdateGrnItemRow(item.id, 'tareWeightKg', e.target.value)}
                              />
                            </td>

                            {/* Net Weight with Scale Button */}
                            <td style={{ padding: '6px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input 
                                  type="number"
                                  step="any"
                                  min="0"
                                  required
                                  style={{ 
                                    width: '85px', 
                                    padding: '4px 6px', 
                                    fontSize: '0.85rem', 
                                    borderRadius: '4px', 
                                    border: `1.5px solid ${isNetValid ? '#10b981' : '#f59e0b'}`, 
                                    textAlign: 'right',
                                    fontWeight: '800',
                                    color: isNetValid ? '#047857' : '#b45309',
                                    background: isNetValid ? '#ecfdf5' : '#fffbeb'
                                  }}
                                  placeholder="Net (kg) *"
                                  value={item.netWeightKg}
                                  onChange={e => handleUpdateGrnItemRow(item.id, 'netWeightKg', e.target.value)}
                                />
                                <WeighingScaleCaptureButton 
                                  label=""
                                  style={{ padding: '3px 5px' }}
                                  onCapture={(weight) => handleUpdateGrnItemRow(item.id, 'netWeightKg', weight)} 
                                />
                              </div>
                            </td>

                            {/* Estimated Length in Meters for Film Substrates */}
                            {grnCategory === 'Film Substrates' && (
                              <td style={{ padding: '6px 10px' }}>
                                <input 
                                  type="number"
                                  step="1"
                                  style={{ 
                                    width: '75px', 
                                    padding: '4px 6px', 
                                    fontSize: '0.8rem', 
                                    borderRadius: '4px', 
                                    border: '1px solid #cbd5e1', 
                                    textAlign: 'right',
                                    color: '#475569'
                                  }}
                                  placeholder="m"
                                  value={item.lengthMeters}
                                  onChange={e => handleUpdateGrnItemRow(item.id, 'lengthMeters', e.target.value)}
                                  title="Calculated theoretical length based on width & gauge"
                                />
                              </td>
                            )}

                            {/* Vendor Roll / Container Lot Number */}
                            <td style={{ padding: '6px 10px' }}>
                              <input 
                                type="text"
                                style={{ 
                                  width: '100%', 
                                  padding: '4px 6px', 
                                  fontSize: '0.8rem', 
                                  borderRadius: '4px', 
                                  border: '1px solid #cbd5e1' 
                                }}
                                placeholder={`e.g. VR-${unitNumber.toString().padStart(2, '0')}`}
                                value={item.vendorRollNo}
                                onChange={e => handleUpdateGrnItemRow(item.id, 'vendorRollNo', e.target.value)}
                              />
                            </td>

                            {/* Delete Action */}
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {grnItemsList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGrnItemRow(item.id)}
                                  style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: '#ef4444', 
                                    cursor: 'pointer', 
                                    padding: '2px 4px',
                                    borderRadius: '4px'
                                  }}
                                  title={`Remove ${grnPackagingType} #${unitNumber}`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Aggregated Totals & Summary Strip */}
                <div style={{
                  marginTop: '12px',
                  background: '#0f172a',
                  color: '#ffffff',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span>Total {grnPackagingType}s: <strong style={{ color: '#ffffff' }}>{grnCalculatedTotals.count}</strong></span>
                    {grnCalculatedTotals.totalGross > 0 && (
                      <span>Gross: <strong style={{ color: '#ffffff' }}>{grnCalculatedTotals.totalGross.toFixed(2)} kg</strong></span>
                    )}
                    {grnCalculatedTotals.totalTare > 0 && (
                      <span>Tare: <strong style={{ color: '#ffffff' }}>{grnCalculatedTotals.totalTare.toFixed(2)} kg</strong></span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8', marginRight: '6px' }}>Total Inward Net Weight:</span>
                      <strong style={{ color: '#34d399', fontSize: '1.05rem', fontFamily: 'monospace' }}>
                        {grnCalculatedTotals.totalNet.toFixed(2)} {grnCategory === 'Film Substrates' ? 'Kg' : grnUnit}
                      </strong>
                    </div>

                    {parseFloat(grnPurchaseRate) > 0 && (
                      <div style={{ fontSize: '0.82rem', borderLeft: '1px solid #334155', paddingLeft: '14px', color: '#38bdf8' }}>
                        Inward Value: <strong>₹{((grnCalculatedTotals.totalNet || 0) * (parseFloat(grnPurchaseRate) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 4: Transporter & Freight */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={14} style={{ color: '#0284c7' }} /> 4. Logistics & Freight Expenses
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Transporter Name / Vehicle #</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. V-Trans Logistics / MP-09-AB-1234" 
                      value={grnTransporterName} 
                      onChange={e => setGrnTransporterName(e.target.value)} 
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Inward Freight Charge (₹)</label>
                    <input 
                      type="number" 
                      step="any" 
                      className="form-control" 
                      placeholder="e.g. 2500 (Optional)" 
                      value={grnFreightAmount} 
                      onChange={e => setGrnFreightAmount(e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              {/* Breakdown Callout Box */}
              <div style={{ 
                background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)', 
                padding: '12px 16px', 
                borderRadius: '10px', 
                border: '1px solid #a7f3d0',
                color: '#065f46',
                fontSize: '0.81rem',
                lineHeight: '1.45',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <div style={{ background: '#d1fae5', padding: '6px', borderRadius: '8px', color: '#047857', marginTop: '2px' }}>
                  <Barcode size={18} />
                </div>
                <div>
                  <strong style={{ color: '#047857', display: 'block', marginBottom: '2px' }}>Inward Package Breakdown & Barcode Generation:</strong>
                  <strong>{grnWeightKg || 0} {grnCategory === 'Film Substrates' ? 'Kg' : grnUnit}</strong> total across <strong>{grnRolls || 1} {grnPackagingType}(s)</strong> = <strong>{( (parseFloat(grnWeightKg) || 0) / Math.max(1, parseInt(grnRolls) || 1) ).toFixed(2)} {grnCategory === 'Film Substrates' ? 'Kg' : grnUnit}</strong> per {grnPackagingType}. (1 barcode sticker will be generated per {grnPackagingType}).
                </div>
              </div>

              {/* Sticky Bottom Actions Footer */}
              <div className="modal-footer-bar">
                <button type="button" className="btn-secondary" onClick={() => setIsNewGRNModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', padding: '10px 22px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} /> Complete Inward & Submit to QC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: QC Inspection & Approval */}
      {qcInspectingGRN && (
        <div className="modal-overlay" onClick={() => setQcInspectingGRN(null)}>
          <div className="glass-card modal-content modal-content-clean" style={{ width: '580px', maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '10px', borderRadius: '10px', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileCheck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                    QC Inspection Report: {qcInspectingGRN.grnNo}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Inspect physical roll parameters (Micron gauge accuracy, Corona dyne, tensile strength, visual defects)
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setQcInspectingGRN(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155', marginBottom: '8px', display: 'block' }}>QC Lab Inspector Notes & Test Results</label>
                <textarea 
                  className="form-control"
                  style={{ minHeight: '110px' }}
                  placeholder="Enter gauge tolerance test, dyne level, or visual observations..."
                  value={qcNotesInput}
                  onChange={e => setQcNotesInput(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer-bar">
              <button className="btn-secondary" style={{ border: '1px solid #fca5a5', color: '#dc2626', background: '#fef2f2', fontWeight: '600' }} onClick={() => handleQCAction('Rejected')}>
                <XCircle size={16} /> Reject Material
              </button>
              <button className="btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', fontWeight: '700', padding: '10px 20px' }} onClick={() => handleQCAction('Approved')}>
                <CheckCircle2 size={16} /> Approve & Add Stock to Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Issue / Return to Store (2D QR Code Scan & Auto-Fetch) */}
      {isIssueModalOpen && (
        <div className="modal-overlay" onClick={() => setIsIssueModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '560px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QrCode style={{ color: '#059669' }} size={22} /> Material Issue & Return to Store
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Scan 2D QR Code on the material sticker to auto-fetch batch, rate, and stock details.
                </p>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setIsIssueModalOpen(false)}>
                <X size={14} />
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button 
                type="button"
                className={`tab-pill ${issueType === 'issue' ? 'active' : ''}`} 
                onClick={() => setIssueType('issue')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <ArrowUpRight size={14} /> Issue to Production Job
              </button>
              <button 
                type="button"
                className={`tab-pill ${issueType === 'return' ? 'active' : ''}`} 
                onClick={() => setIssueType('return')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <ArrowDownLeft size={14} /> Return to Store
              </button>
            </div>

            {/* PRIMARY 2D QR SCANNER SECTION */}
            <div style={{ 
              background: scanMatchSuccess ? '#ecfdf5' : '#f8fafc', 
              border: scanMatchSuccess ? '2px solid #10b981' : '1.5px solid #cbd5e1', 
              borderRadius: '8px', 
              padding: '12px 14px', 
              marginBottom: '16px',
              transition: 'all 0.2s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ margin: 0, fontWeight: '800', fontSize: '0.82rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scan size={15} style={{ color: '#059669' }} />
                  Scan 2D QR Code / Barcode *
                </label>
                <button 
                  type="button" 
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => setManualSelectMode(!manualSelectMode)}
                >
                  {manualSelectMode ? 'Hide Manual Directory' : 'or Select from Item Directory'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ 
                      paddingLeft: '36px', 
                      height: '42px', 
                      fontSize: '0.9rem', 
                      fontWeight: '600',
                      background: '#ffffff',
                      borderColor: scanMatchSuccess ? '#10b981' : '#cbd5e1'
                    }} 
                    placeholder="Scan 2D QR Code with gun scanner or enter Roll/Batch ID..." 
                    value={issueScanQuery} 
                    onChange={e => {
                      const val = e.target.value;
                      setIssueScanQuery(val);
                      setScanErrorMessage('');
                      if (val.trim()) {
                        const clean = val.toLowerCase().trim();
                        const stripped = clean.replace(/^(lot|bc|bar-iss|bar|roll|inv|grn|item)[-_:]\s*/i, '').trim();
                        const hasDirectMatch = 
                          (inventory || []).some(i => (i.id && i.id.toLowerCase() === clean) || (i.itemCode && i.itemCode.toLowerCase() === clean) || (i.lastBatch && i.lastBatch.toLowerCase() === clean) || (i.productCode && i.productCode.toLowerCase() === clean) || (i.id && i.id.toLowerCase() === stripped) || (i.itemCode && i.itemCode.toLowerCase() === stripped)) ||
                          (inventoryRolls || []).some(r => (r.barcodeId && r.barcodeId.toLowerCase() === clean) || (r.batchNo && r.batchNo.toLowerCase() === clean)) ||
                          (safeGrns || []).some(g => (g.batchNo && g.batchNo.toLowerCase() === clean) || (g.grnNo && String(g.grnNo).toLowerCase() === clean)) ||
                          (inks || []).some(ink => (ink.productCode && ink.productCode.toLowerCase() === clean) || (ink.productCode && ink.productCode.toLowerCase() === stripped));
                        if (hasDirectMatch) {
                          handleBarcodeScanLookup(val);
                        }
                      }
                    }} 
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBarcodeScanLookup(issueScanQuery);
                      }
                    }}
                    autoFocus
                  />
                  <QrCode size={18} style={{ position: 'absolute', left: '10px', top: '12px', color: '#64748b' }} />
                </div>
                <button 
                  type="button"
                  className="btn-primary" 
                  style={{ background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', fontWeight: '700', fontSize: '0.85rem' }}
                  onClick={() => handleBarcodeScanLookup(issueScanQuery)}
                >
                  <Sparkles size={14} /> Auto-Fetch
                </button>
              </div>

              {scanErrorMessage && (
                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#b91c1c', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} /> {scanErrorMessage}
                </div>
              )}
            </div>

            {/* Optional Manual Fallback Selector */}
            {manualSelectMode && (
              <div className="form-group" style={{ background: '#f1f5f9', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Manual Stock Item Selector</label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ marginBottom: '6px', fontSize: '0.82rem' }} 
                  placeholder="🔍 Filter directory by name, code or location..." 
                  value={stockSearchTerm} 
                  onChange={e => setStockSearchTerm(e.target.value)} 
                />
                <select 
                  className="form-control" 
                  value={scannedItemDetails?.item?.id || ''} 
                  style={{ fontSize: '0.82rem' }}
                  onChange={e => {
                    const found = (inventory || []).find(i => i.id === e.target.value);
                    if (found) {
                      setIssueScanQuery(found.id);
                      handleBarcodeScanLookup(found.id);
                    }
                  }}
                >
                  <option value="">-- Choose Item from Inventory Directory --</option>
                  {(inventory || []).filter(i => {
                    const s = (stockSearchTerm || '').toLowerCase();
                    const filmType = (i.filmType || '').toLowerCase();
                    const itemName = (i.itemName || '').toLowerCase();
                    const id = (i.id || '').toLowerCase();
                    const loc = (i.location || '').toLowerCase();
                    return filmType.includes(s) || itemName.includes(s) || id.includes(s) || loc.includes(s);
                  }).map(i => (
                    <option key={i.id} value={i.id}>
                      {i.id} - {i.itemName || `${i.filmType} ${i.micron}µ`} | Avail: {i.availableQtyKg} {i.unit || 'Kg'} | Rate: ₹{i.unitPrice || 0}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* AUTO-FETCHED 2D QR DETAILS VERIFIED CARD OR BLANK SCAN PROMPT */}
            {scannedItemDetails ? (
              <div style={{ 
                background: '#ffffff', 
                border: '1.5px solid #0f172a', 
                borderRadius: '8px', 
                padding: '12px 14px', 
                marginBottom: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '900', fontSize: '0.98rem', color: '#0f172a', lineHeight: '1.2' }}>
                      {scannedItemDetails.item?.itemName || (scannedItemDetails.item?.category === 'Film Substrates' ? `${scannedItemDetails.item?.filmType} (${scannedItemDetails.item?.micron}µ x ${scannedItemDetails.item?.widthMm}mm)` : (scannedItemDetails.item?.filmType || scannedItemDetails.item?.category || 'Stock Item'))}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                      Item ID: <strong>{scannedItemDetails.item?.id || scannedItemDetails.barcodeId}</strong> • Category: <strong>{scannedItemDetails.item?.category || 'Film Substrates'}</strong> • Location: <strong>{scannedItemDetails.item?.location || 'Store Room'}</strong>
                    </div>
                  </div>
                  {scannedItemDetails.isQCPending ? (
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: '800', 
                      color: '#b45309', 
                      background: '#fef3c7', 
                      padding: '3px 8px', 
                      borderRadius: '12px',
                      border: '1px solid #fde68a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <AlertTriangle size={13} /> ⏳ PENDING QC APPROVAL
                    </span>
                  ) : scannedItemDetails.isQCRejected ? (
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: '800', 
                      color: '#b91c1c', 
                      background: '#fee2e2', 
                      padding: '3px 8px', 
                      borderRadius: '12px',
                      border: '1px solid #fca5a5',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <XCircle size={13} /> 🚫 REJECTED BY QC
                    </span>
                  ) : (
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: '800', 
                      color: '#047857', 
                      background: '#dcfce7', 
                      padding: '3px 8px', 
                      borderRadius: '12px',
                      border: '1px solid #86efac',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <CheckCircle2 size={13} /> 2D QR Code Verified (QC Cleared)
                    </span>
                  )}
                </div>

                {/* 4-Stat Auto-Fetched Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <QRCode2D value={scannedItemDetails.barcodeId || scannedItemDetails.item?.id || 'BC-000'} size={38} showLabel={false} margin={0} />
                    <div>
                      <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>2D Barcode Ref</span>
                      <div style={{ fontFamily: 'monospace', fontWeight: '800', color: '#2563eb', fontSize: '0.82rem' }}>
                        {scannedItemDetails.barcodeId || scannedItemDetails.item?.id}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Inward Batch / Heat #</span>
                    <div style={{ fontWeight: '800', color: '#1e40af', fontSize: '0.85rem' }}>
                      {scannedItemDetails.batchNo || 'BATCH-MAIN'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Purchase Rate</span>
                    <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.9rem' }}>
                      ₹{scannedItemDetails.purchaseRate} / {scannedItemDetails.unit || 'Kg'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Supplier / Origin</span>
                    <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {scannedItemDetails.vendorName || 'Company Stock'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.76rem', color: '#475569' }}>
                  <span>Available Stock in Roll/Batch: <strong style={{ color: '#047857', fontSize: '0.85rem' }}>{scannedItemDetails.availableQty} {scannedItemDetails.unit || 'Kg'}</strong></span>
                  {scannedItemDetails.grnNo && <span>GRN Ref: <strong>{scannedItemDetails.grnNo}</strong></span>}
                </div>

                {scannedItemDetails.isQCPending && (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    background: '#fffbeb',
                    border: '1.5px solid #f59e0b',
                    borderRadius: '6px',
                    color: '#92400e',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={17} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontWeight: '800' }}>🔒 QC APPROVAL PENDING — ISSUE / RETURN RESTRICTED</div>
                      <div style={{ fontSize: '0.73rem', fontWeight: '500', marginTop: '2px', color: '#b45309' }}>
                        This batch (<code>{scannedItemDetails.batchNo}</code>) is currently awaiting Quality Control testing & clearance in Store QC. It cannot be issued to production machines or returned until approved.
                      </div>
                    </div>
                  </div>
                )}

                {scannedItemDetails.isQCRejected && (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    background: '#fef2f2',
                    border: '1.5px solid #ef4444',
                    borderRadius: '6px',
                    color: '#991b1b',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}>
                    <XCircle size={17} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontWeight: '800' }}>🚫 QC REJECTED — MATERIAL BLOCKED</div>
                      <div style={{ fontSize: '0.73rem', fontWeight: '500', marginTop: '2px', color: '#b91c1c' }}>
                        This batch (<code>{scannedItemDetails.batchNo}</code>) was rejected during QC inspection and is quarantined.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                background: '#f8fafc', 
                border: '1.5px dashed #cbd5e1', 
                borderRadius: '8px', 
                padding: '22px 16px', 
                textAlign: 'center',
                marginBottom: '16px' 
              }}>
                <Scan size={30} style={{ color: '#94a3b8', margin: '0 auto 6px auto', display: 'block' }} />
                <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#334155' }}>
                  Product Details Blank (Waiting for Scan)
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '3px' }}>
                  Scan a 2D QR Code sticker or type the Batch / Item ID above to fetch verified details from actual inventory.
                </div>
              </div>
            )}

            {/* PRODUCTION JOB SELECTOR */}
            <div className="form-group">
              <label>Production Job Name *</label>
              {activeProductionOrders.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: '#b91c1c', padding: '8px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                  ⚠️ No active unapproved production jobs available. Only active jobs in production appear here.
                </div>
              ) : (
                <select 
                  className="form-control" 
                  value={issueJobName || activeProductionOrders[0]?.jobName || ''} 
                  onChange={e => setIssueJobName(e.target.value)}
                  style={{ fontWeight: '600' }}
                >
                  <option value="">-- Select Active Production Job --</option>
                  {activeProductionOrders.map(o => (
                    <option key={o.id} value={o.jobName}>
                      {o.jobName} ({o.id}) {o.clientName ? `- ${o.clientName}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* QUANTITY CONFIRMATION */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ margin: 0 }}>
                  Quantity to {issueType === 'issue' ? 'Issue' : 'Return'} ({scannedItemDetails?.unit || 'Kg'}) *
                </label>
                {scannedItemDetails && scannedItemDetails.availableQty > 0 && !scannedItemDetails.isQCPending && !scannedItemDetails.isQCRejected && (
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ padding: '2px 8px', fontSize: '0.72rem', color: '#047857', borderColor: '#86efac', background: '#f0fdf4' }}
                    onClick={() => setIssueQtyKg(String(scannedItemDetails.availableQty))}
                  >
                    Max ({scannedItemDetails.availableQty} {scannedItemDetails.unit})
                  </button>
                )}
              </div>
              <input 
                type="number" 
                className="form-control" 
                style={{ 
                  fontSize: '1rem', 
                  fontWeight: '700',
                  background: (scannedItemDetails?.isQCPending || scannedItemDetails?.isQCRejected) ? '#f1f5f9' : '#ffffff' 
                }}
                placeholder={
                  scannedItemDetails?.isQCPending 
                    ? '🔒 Disabled - Batch is Pending QC Approval'
                    : scannedItemDetails?.isQCRejected
                    ? '🚫 Disabled - Batch is Rejected by QC'
                    : scannedItemDetails 
                    ? `Enter quantity in ${scannedItemDetails.unit || 'Kg'}` 
                    : 'Scan code first to confirm quantity'
                } 
                value={issueQtyKg} 
                onChange={e => setIssueQtyKg(e.target.value)} 
                disabled={scannedItemDetails?.isQCPending || scannedItemDetails?.isQCRejected || !scannedItemDetails}
                step="any"
                required
              />
            </div>

            {/* MODAL ACTION BUTTONS */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsIssueModalOpen(false)}>
                Cancel
              </button>
              <button 
                type="button"
                className="btn-primary" 
                style={{ 
                  background: (scannedItemDetails?.isQCPending || scannedItemDetails?.isQCRejected) ? '#94a3b8' : '#059669', 
                  borderColor: (scannedItemDetails?.isQCPending || scannedItemDetails?.isQCRejected) ? '#94a3b8' : '#059669', 
                  fontWeight: '700', 
                  padding: '8px 20px',
                  cursor: (scannedItemDetails?.isQCPending || scannedItemDetails?.isQCRejected) ? 'not-allowed' : 'pointer'
                }}
                onClick={handleIssueReturnSubmit}
                disabled={activeProductionOrders.length === 0 || !issueQtyKg || !scannedItemDetails || scannedItemDetails.isQCPending || scannedItemDetails.isQCRejected}
              >
                {scannedItemDetails?.isQCPending 
                  ? '🔒 Blocked (Pending QC Approval)' 
                  : scannedItemDetails?.isQCRejected 
                  ? '🚫 Blocked (QC Rejected)' 
                  : (issueType === 'issue' ? 'Submit Material Issue' : 'Submit Material Return')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Stock Item (Universal & Category Adaptive) */}
      {editingStockItem && (
        <div className="modal-overlay" onClick={() => setEditingStockItem(null)}>
          <div className="glass-card modal-content" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Edit3 size={20} style={{ color: 'var(--primary-brand)' }} />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
                    {editingStockItem.isNew ? '✨ Add New Stock Item' : '✏️ Edit Stock Item'}
                  </h3>
                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: 600 }}>
                    {editingStockItem.id}
                  </span>
                  <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    {editCategory}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
                  {editingStockItem.isNew 
                    ? 'Enter new inventory item details and initial stock levels.'
                    : 'Pre-filled with existing item parameters. All specifications adapt dynamically to the chosen item category.'
                  }
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingStockItem(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStockEdit}>
              {/* Category & Identity */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-brand)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={15} /> 1. Category & Item Identification
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div className="form-group">
                    <label>Material Category *</label>
                    <select 
                      className="form-control"
                      value={editCategory}
                      onChange={e => handleCategoryChangeInEdit(e.target.value)}
                    >
                      {INVENTORY_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Item Name / Description *</label>
                    <input 
                      type="text" 
                      className="form-control"
                      required
                      placeholder="e.g. PET 12µ (1000mm) or Ethyl Acetate Solvent"
                      value={editItemName}
                      onChange={e => setEditItemName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Item Code / SKU</label>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="e.g. RM-FILM-001"
                      value={editItemCode}
                      onChange={e => setEditItemCode(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit of Measure (UOM) *</label>
                    <select 
                      className="form-control"
                      value={editUnit}
                      onChange={e => setEditUnit(e.target.value)}
                    >
                      {INVENTORY_UOMS.map(u => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Technical Specifications (Category Adaptive) */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-brand)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={15} /> 2. Technical Specifications & Dimensions
                </div>

                {editCategory === 'Film Substrates' ? (
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="form-group">
                      <label>Film Polymer Type *</label>
                      <select 
                        className="form-control"
                        value={editFilmType}
                        onChange={e => setEditFilmType(e.target.value)}
                      >
                        {Object.keys(FILM_DENSITIES).map(type => (
                          <option key={type} value={type}>{type} ({FILM_DENSITIES[type]} g/cc)</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Micron Gauge (µ) *</label>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        required
                        value={editMicron}
                        onChange={e => setEditMicron(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Slit Width (mm) *</label>
                      <input 
                        type="number" 
                        step="1"
                        className="form-control"
                        required
                        value={editWidthMm}
                        onChange={e => setEditWidthMm(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Calculated Density</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        disabled 
                        value={`${FILM_DENSITIES[editFilmType] || 1.0} g/cm³`}
                        style={{ opacity: 0.7, background: 'rgba(255,255,255,0.05)' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <div className="form-group">
                      <label>Sub-Type / Grade / Shade</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="e.g. Cyan Solvent Ink / High Purity / Polyurethane"
                        value={editSubType}
                        onChange={e => setEditSubType(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Package Size / Dimensions</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="e.g. 200L Drum / 25Kg Bag / 0.15mm x 30mm"
                        value={editDimensions}
                        onChange={e => setEditDimensions(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Stock Balances & Thresholds */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-brand)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scale size={15} /> 3. Stock Balances & Reorder Thresholds ({editUnit})
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div className="form-group">
                    <label>Available Stock ({editUnit}) *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-control"
                      required
                      value={editAvailableQty}
                      onChange={e => setEditAvailableQty(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Allocated to Jobs ({editUnit})</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-control"
                      value={editAllocatedQty}
                      onChange={e => setEditAllocatedQty(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700', color: '#047857' }}>Purchase Rate (₹ / {editUnit}) *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-control"
                      placeholder="e.g. 145.50"
                      value={editUnitPrice}
                      onChange={e => setEditUnitPrice(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Low Stock Warning ({editUnit})</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-control"
                      value={editReorderLevel}
                      onChange={e => setEditReorderLevel(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Warehouse Location & Vendor Logistics */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-brand)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={15} /> 4. Storage Location & Logistics
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div className="form-group">
                    <label>Warehouse Storage Bay / Rack *</label>
                    <input 
                      type="text" 
                      className="form-control"
                      required
                      placeholder="e.g. Bay A - Rack 3 / Flammable Store"
                      value={editLocation}
                      onChange={e => setEditLocation(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Last / Preferred Supplier</label>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="e.g. Reliance / Cosmo Films"
                      value={editLastVendor}
                      onChange={e => setEditLastVendor(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Last Inward Batch / Lot No</label>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="e.g. BATCH-2026-0811"
                      value={editLastBatch}
                      onChange={e => setEditLastBatch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button 
                  type="button" 
                  className="btn-danger" 
                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => handleDeleteStockItem(editingStockItem)}
                >
                  <Trash2 size={16} /> Delete Item
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setEditingStockItem(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Save Stock Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Raw Material Stock Ledger & Barcode Tracking Modal */}
      {selectedItemForPurchaseHistory && (() => {
        const item = sanitizeInventoryItem(selectedItemForPurchaseHistory);
        const unitStr = item.unit || 'Kg';

        // Universal Item Matcher for Films, Inks, Solvents, Adhesives, Blades, Tapes, PPE & Spares
        const isItemMatch = (candidate, target) => {
          if (!candidate || !target) return false;
          // 1. Direct ID / Code match
          if (candidate.itemId && (candidate.itemId === target.id || candidate.itemId === target.itemCode)) return true;
          if (candidate.id && (candidate.id === target.id || candidate.id === target.itemCode)) return true;
          if (candidate.itemCode && (candidate.itemCode === target.itemCode || candidate.itemCode === target.id)) return true;

          // 2. Strict Item Name match
          const cName = (candidate.itemName || candidate.filmType || '').trim().toLowerCase();
          const tName = (target.itemName || target.filmType || '').trim().toLowerCase();
          if (cName && tName && (cName === tName)) return true;

          // 3. Category & Film / Substrate match
          const isTargetFilm = (target.category || 'Film Substrates') === 'Film Substrates';
          const isCandidateFilm = (candidate.category || 'Film Substrates') === 'Film Substrates' || 
            ['PET', 'METPET', 'BOPP', 'LDPE', 'CPP', 'POLY', 'LD'].some(f => (candidate.filmType || '').toUpperCase().includes(f));

          if (isTargetFilm && isCandidateFilm) {
            const normalizeFilm = (str) => (str || '')
              .toLowerCase()
              .replace(/film/g, '')
              .replace(/substrates?/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            const cFilm = normalizeFilm(candidate.filmType);
            const tFilm = normalizeFilm(target.filmType);
            const filmMatches = cFilm === tFilm || (cFilm && tFilm && (cFilm.includes(tFilm) || tFilm.includes(cFilm)));
            
            // Numeric specs check
            const cMicron = parseFloat(candidate.micron);
            const tMicron = parseFloat(target.micron);
            const micronMatches = (isNaN(cMicron) && isNaN(tMicron)) || (cMicron === tMicron) || !target.micron || target.micron === '-';

            const cWidth = parseFloat(candidate.widthMm);
            const tWidth = parseFloat(target.widthMm);
            const widthMatches = (isNaN(cWidth) && isNaN(tWidth)) || (cWidth === tWidth) || !target.widthMm || target.widthMm === '-';

            if (filmMatches && micronMatches && widthMatches) return true;
          }

          // 4. Non-Film Category Match (Inks, Solvents, Adhesives, Blades, PPE, Spares)
          if (!isTargetFilm) {
            const cCat = (candidate.category || '').toLowerCase();
            const tCat = (target.category || '').toLowerCase();
            if (cCat && tCat && cCat === tCat) {
              if (cName && tName && (cName.includes(tName) || tName.includes(cName))) return true;
            }
            if (cName && tName) {
              if (tName.includes('ink') && cName.includes('ink')) return true;
              if (tName.includes('solvent') && cName.includes('solvent')) return true;
              if (tName.includes('adhesive') && cName.includes('adhesive')) return true;
              if (tName.includes('blade') && cName.includes('blade')) return true;
              if (tName.includes('tape') && cName.includes('tape')) return true;
              if (tName.includes('glove') && cName.includes('glove')) return true;
            }
          }

          return false;
        };

        // 1. Gather Inward Receipts (GRNs)
        const matchingGRNs = (grns || []).filter(g => isItemMatch(g, item));
        const inwardTxLines = matchingGRNs.map(g => {
          const txId = `GRN_${g.grnNo || g.id}`;
          const rate = Number(g.purchaseRatePerKg || g.purchaseRate || g.unitPrice || item.unitPrice || item.purchaseRatePerKg || (DEFAULT_DAILY_RATES[g.filmType] || 0));
          const qty = g.netWeightKg || 0;
          return {
            txId,
            category: 'inward',
            type: g.status === 'Approved' ? '📥 GRN Inward (Approved)' : '📥 GRN Inward (Pending QC)',
            date: g.receivedDate || '2026-07-24',
            refNo: g.grnNo,
            subRef: g.poNumber ? `PO: ${g.poNumber}` : 'Direct Receipt',
            partyName: g.vendorName || item.lastVendor || 'Supplier',
            subParty: g.invoiceNo ? `Inv: ${g.invoiceNo}` : 'Vendor Receipt',
            inwardQtyKg: qty,
            outwardQtyKg: 0,
            adjQtyKg: 0,
            ratePerKg: rate,
            unitPrice: rate,
            totalValue: qty * rate,
            barcode: customBarcodesMap[txId] || g.batchNo || `BAR-GRN-${g.grnNo}`,
            batchNo: g.batchNo || `GRN-${g.grnNo}`,
            invoiceNo: g.invoiceNo || '',
            status: g.status || 'Approved',
            notes: `${g.rollsReceived || 1} pkg/roll(s) | Batch: ${g.batchNo || 'N/A'}`
          };
        });

        // 2. Gather Job Material Consumptions from Production Records
        const jobUsageLines = [];
        (productionRecords || []).forEach(rec => {
          (rec.materialsList || []).forEach((mat, idx) => {
            if (isItemMatch(mat, item)) {
              const txId = `JOB_${rec.id}_${mat.id || idx}`;
              const qty = mat.netConsumedQtyKg || mat.issueQtyKg || 0;
              const rate = Number(mat.unitPricePerKg || mat.unitPrice || mat.purchaseRate || item.unitPrice || item.purchaseRatePerKg || (DEFAULT_DAILY_RATES[item.filmType] || 0));
              jobUsageLines.push({
                txId,
                category: 'usage',
                type: '📤 Job Production Usage',
                date: rec.dateFilled || rec.approvalDate || '2026-07-23',
                refNo: rec.jobName || 'Job Production',
                subRef: `Order: ${rec.orderId || 'ORD'}`,
                partyName: rec.clientName || 'Customer Job',
                subParty: `Plant Mgr: ${rec.filledBy ? rec.filledBy.split(' ')[0] : 'Production'}`,
                inwardQtyKg: 0,
                outwardQtyKg: qty,
                adjQtyKg: 0,
                ratePerKg: rate,
                unitPrice: rate,
                totalValue: qty * rate,
                barcode: customBarcodesMap[txId] || mat.barcode || `BAR-JOB-${(rec.orderId || '89').replace('ORD-2026-', '')}`,
                batchNo: mat.batchNo || mat.barcode || item.lastBatch || '',
                status: rec.status || 'Consumed in Production',
                notes: `Gross Issued: ${mat.issueQtyKg || 0} ${unitStr} | Returned: ${mat.returnQtyKg || 0} ${unitStr} | Net: ${qty} ${unitStr}`
              });
            }
          });
        });

        // 3. Gather Manual Store Issues & Returns
        const storeIssueLines = (effectiveStoreIssueTransactions || [])
          .filter(tx => isItemMatch(tx, item))
          .map(tx => {
            const isIssue = tx.issueType === 'issue';
            const qty = tx.qtyKg || 0;
            const rate = Number(tx.unitPrice || tx.purchaseRatePerKg || tx.ratePerKg || item.unitPrice || item.purchaseRatePerKg || (DEFAULT_DAILY_RATES[item.filmType] || 0));
            return {
              txId: tx.id,
              category: isIssue ? 'usage' : 'inward',
              type: isIssue ? '📤 Store Issue' : '📥 Store Return',
              date: tx.date || '2026-07-25',
              refNo: tx.jobName || (isIssue ? 'Store Issue' : 'Store Return'),
              subRef: `Req: ${tx.id}`,
              partyName: tx.vendorName || tx.issuedBy || item.lastVendor || 'Store Mgr Dilip Joshi',
              subParty: isIssue ? 'Shopfloor Requisition' : 'Store Return',
              inwardQtyKg: isIssue ? 0 : qty,
              outwardQtyKg: isIssue ? qty : 0,
              adjQtyKg: 0,
              ratePerKg: rate,
              unitPrice: rate,
              totalValue: qty * rate,
              barcode: customBarcodesMap[tx.id] || tx.barcode || `BAR-TX-${tx.id}`,
              batchNo: tx.batchNo || tx.barcode || item.lastBatch || '',
              status: isIssue ? 'Issued' : 'Returned',
              notes: tx.notes || (isIssue ? 'Manual shopfloor issue' : 'Unused stock returned')
            };
          });

        const itemActualUnitPrice = Number(item.unitPrice || item.purchaseRatePerKg || item.pricePerKg || 0);

        // 4. Gather Physical Reconciliation & Quick Adjustments
        const adjLines = (stockLedgerAdjustments || [])
          .filter(a => isItemMatch(a, item))
          .map(a => {
            const txId = `ADJ_${a.id}`;
            const qty = a.qtyKg || 0;
            const rate = itemActualUnitPrice;
            return {
              txId,
              category: 'reconciliation',
              type: a.type || (qty >= 0 ? '⚖️ Physical Audit (+)' : '⚖️ Physical Audit (-)'),
              date: a.date || '2026-07-25',
              refNo: `Audit Ref: ${a.id}`,
              subRef: a.type || 'Audit Variance',
              partyName: a.adjustedBy || 'Store Mgr Dilip Joshi',
              subParty: 'Physical Inventory Audit',
              inwardQtyKg: qty > 0 ? qty : 0,
              outwardQtyKg: qty < 0 ? Math.abs(qty) : 0,
              adjQtyKg: qty,
              ratePerKg: rate,
              totalValue: Math.abs(qty) * rate,
              barcode: customBarcodesMap[txId] || a.barcode || `BAR-AUDIT-${a.id}`,
              status: 'Reconciled',
              notes: a.reason || 'Physical Stock Reconciliation'
            };
          });

        // 5. Calculate Opening Stock Baseline
        const totalTxInwards = inwardTxLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0) + storeIssueLines.filter(tx => tx.category === 'inward').reduce((sum, tx) => sum + tx.inwardQtyKg, 0);
        const totalTxOutwards = jobUsageLines.reduce((sum, tx) => sum + tx.outwardQtyKg, 0) + storeIssueLines.filter(tx => tx.category === 'usage').reduce((sum, tx) => sum + tx.outwardQtyKg, 0);
        const totalTxAdj = adjLines.reduce((sum, tx) => sum + tx.adjQtyKg, 0);
        const netMovement = totalTxInwards - totalTxOutwards + totalTxAdj;
        const currentTargetQty = item.availableQtyKg || 0;
        const openingStockQty = Math.max(0, currentTargetQty - netMovement);

        const openingStockLine = openingStockQty > 0 ? [{
          txId: `OPEN_${item.id}`,
          category: 'inward',
          type: '📦 Opening Stock Balance',
          date: '2026-07-01 08:00 AM',
          refNo: item.itemCode || `OPN-${item.id}`,
          subRef: 'Baseline Store Opening',
          partyName: item.lastVendor || 'Verified Inventory Baseline',
          subParty: `Location: ${item.location || 'Store Bay'}`,
          inwardQtyKg: openingStockQty,
          outwardQtyKg: 0,
          adjQtyKg: 0,
          ratePerKg: itemActualUnitPrice,
          totalValue: openingStockQty * itemActualUnitPrice,
          barcode: item.lastBatch || `BAR-OPN-${item.id}`,
          status: 'Opening Baseline',
          notes: `Verified onboarding stock balance for ${item.itemName || item.filmType}`
        }] : [];

        // 6. Combine and Sort Chronologically (Oldest First to calculate running balance)
        const parseTxDate = (dStr) => {
          if (!dStr) return 0;
          const parsed = Date.parse(dStr);
          if (!isNaN(parsed)) return parsed;
          return new Date(dStr).getTime() || 0;
        };

        const allTxLines = [...openingStockLine, ...inwardTxLines, ...jobUsageLines, ...storeIssueLines, ...adjLines];
        allTxLines.sort((a, b) => parseTxDate(a.date) - parseTxDate(b.date));

        // 7. Calculate Chronological Running Balance
        let runningStock = 0;
        const ledgerWithBalance = allTxLines.map(tx => {
          if (tx.category === 'inward') {
            runningStock += tx.inwardQtyKg;
          } else if (tx.category === 'usage') {
            runningStock -= tx.outwardQtyKg;
          } else if (tx.category === 'reconciliation') {
            runningStock += tx.adjQtyKg;
          }
          return { ...tx, runningBalance: Math.max(0, runningStock) };
        });

        // 8. Reverse to Newest First for Display & Apply Filters
        const displayLines = [...ledgerWithBalance].reverse().filter(tx => {
          if (ledgerFilterTab !== 'all' && tx.category !== ledgerFilterTab) return false;
          if (ledgerSearchTerm.trim()) {
            const q = ledgerSearchTerm.toLowerCase();
            return (
              (tx.refNo && tx.refNo.toLowerCase().includes(q)) ||
              (tx.partyName && tx.partyName.toLowerCase().includes(q)) ||
              (tx.barcode && tx.barcode.toLowerCase().includes(q)) ||
              (tx.type && tx.type.toLowerCase().includes(q)) ||
              (tx.notes && tx.notes.toLowerCase().includes(q))
            );
          }
          return true;
        });

        const paginatedLedgerItems = displayLines.slice((ledgerCurrentPage - 1) * ledgerPageSize, ledgerCurrentPage * ledgerPageSize);

        // Summary Calculations
        const totalPurchasedQty = inwardTxLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0) + openingStockQty;
        const totalSpendRs = inwardTxLines.reduce((sum, tx) => sum + tx.totalValue, 0) + (openingStockQty * itemActualUnitPrice);
        const avgPurchaseRate = totalPurchasedQty > 0 ? (totalSpendRs / totalPurchasedQty) : itemActualUnitPrice;

        const totalConsumedJobQty = jobUsageLines.reduce((sum, tx) => sum + tx.outwardQtyKg, 0) + storeIssueLines.filter(tx => tx.category === 'usage').reduce((sum, tx) => sum + tx.outwardQtyKg, 0);
        const totalReconciliationAdjQty = adjLines.reduce((sum, tx) => sum + tx.adjQtyKg, 0);
        const netAvailableBalance = Math.max(0, runningStock);

        return (
          <div className="modal-overlay" onClick={() => setSelectedItemForPurchaseHistory(null)}>
            <div className="modal-content" style={{ maxWidth: '1180px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <History style={{ color: '#2563eb' }} /> Raw Material Stock Ledger & Barcode History
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Item: <strong>{item.itemName || ((item.category || 'Film Substrates') === 'Film Substrates' ? `${item.filmType}` : (item.category || item.filmType || 'Stock Item'))} {((item.category || 'Film Substrates') === 'Film Substrates') && item.micron && item.micron !== '-' ? `(${item.micron}µ x ${item.widthMm}mm)` : ''}</strong> | Code: <code>{item.itemCode || item.id}</code> | Category: <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{item.category || 'Film Substrates'}</span> | Location: {item.location || 'Store Bay'} | Unit: {unitStr}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ background: '#4f46e5', borderColor: '#4f46e5', padding: '6px 14px', fontSize: '0.85rem' }}
                    onClick={() => setIsQuickAdjOpen(!isQuickAdjOpen)}
                  >
                    <Plus size={15} /> {isQuickAdjOpen ? 'Close Form' : 'Quick Stock Adjustment'}
                  </button>
                  <button className="btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setSelectedItemForPurchaseHistory(null)}>
                    ✕ Close
                  </button>
                </div>
              </div>

              {/* Quick Physical Stock Adjustment Form (Collapsible) */}
              {isQuickAdjOpen && (
                <div className="glass-card" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '16px', marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0369a1', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileSpreadsheet size={16} /> Physical Stock Reconciliation Entry
                  </h4>
                  <form onSubmit={e => handleAddLedgerAdjustment(e, item)}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Adjustment Type *</label>
                        <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={adjType} onChange={e => setAdjType(e.target.value)}>
                          <option value="Physical Audit (+)">Physical Audit (+) Surplus Addition</option>
                          <option value="Physical Audit (-)">Physical Audit (-) Deficit Deduction</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Variance Qty ({unitStr}) *</label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                          required 
                          value={adjQtyKg} 
                          onChange={e => setAdjQtyKg(e.target.value)} 
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Barcode / Tag</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                          placeholder={`e.g. BAR-${(item.filmType || 'ADJ').toUpperCase().replace(/\s+/g, '')}-01`} 
                          value={adjBarcode} 
                          onChange={e => setAdjBarcode(e.target.value)} 
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Audit Reason / Note</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                          placeholder="e.g. Physical count variance in Row B" 
                          value={adjReason} 
                          onChange={e => setAdjReason(e.target.value)} 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setIsQuickAdjOpen(false)}>Cancel</button>
                      <button type="submit" className="btn-primary" style={{ padding: '4px 14px', fontSize: '0.8rem', background: '#0284c7', borderColor: '#0284c7' }}>
                        <CheckCircle2 size={14} /> Commit Stock Adjustment
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* 4 Summary Ledger KPI Cards */}
              <div className="glass-card" style={{ background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', padding: '16px', marginBottom: '20px' }}>
                <div>
                  <span className="stats-title" style={{ fontSize: '0.75rem' }}>Total Inwards (Receipts)</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>
                    + {(totalPurchasedQty ?? 0).toLocaleString()} {unitStr}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inwardTxLines.length + (openingStockQty > 0 ? 1 : 0)} inward entries</div>
                </div>

                <div>
                  <span className="stats-title" style={{ fontSize: '0.75rem' }}>Used / Consumed</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#dc2626', marginTop: '4px' }}>
                    - {(totalConsumedJobQty ?? 0).toLocaleString()} {unitStr}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{jobUsageLines.length + storeIssueLines.filter(tx => tx.category === 'usage').length} job/store issues</div>
                </div>

                <div>
                  <span className="stats-title" style={{ fontSize: '0.75rem' }}>Reconciliation Audits</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: totalReconciliationAdjQty >= 0 ? '#2563eb' : '#d97706', marginTop: '4px' }}>
                    {totalReconciliationAdjQty >= 0 ? `+ ${totalReconciliationAdjQty}` : `- ${Math.abs(totalReconciliationAdjQty)}`} {unitStr}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{adjLines.length} audit entries</div>
                </div>

                <div>
                  <span className="stats-title" style={{ fontSize: '0.75rem' }}>Current Net Stock Balance</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                    {(netAvailableBalance ?? 0).toLocaleString()} {unitStr}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>
                    Avg Rate: ₹ {avgPurchaseRate.toFixed(2)}/{unitStr}
                  </div>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', width: '280px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '32px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.825rem' }}
                    placeholder="Search by Barcode, Job, GRN or Vendor..."
                    value={ledgerSearchTerm}
                    onChange={e => setLedgerSearchTerm(e.target.value)}
                  />
                </div>

                {/* Ledger Subtab Pills */}
                <div style={{ display: 'flex', gap: '6px', background: '#e2e8f0', padding: '4px', borderRadius: '8px' }}>
                  <button 
                    className={`btn-secondary`}
                    style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'all' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'all' ? '700' : '500', color: ledgerFilterTab === 'all' ? '#0f172a' : 'var(--text-secondary)' }}
                    onClick={() => setLedgerFilterTab('all')}
                  >
                    📋 All Ledger ({allTxLines.length})
                  </button>

                  <button 
                    className={`btn-secondary`}
                    style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'inward' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'inward' ? '700' : '500', color: ledgerFilterTab === 'inward' ? '#047857' : 'var(--text-secondary)' }}
                    onClick={() => setLedgerFilterTab('inward')}
                  >
                    📥 Inwards ({inwardTxLines.length + (openingStockQty > 0 ? 1 : 0) + storeIssueLines.filter(tx => tx.category === 'inward').length})
                  </button>

                  <button 
                    className={`btn-secondary`}
                    style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'usage' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'usage' ? '700' : '500', color: ledgerFilterTab === 'usage' ? '#7f1d1d' : 'var(--text-secondary)' }}
                    onClick={() => setLedgerFilterTab('usage')}
                  >
                    📤 Consumptions / Issues ({jobUsageLines.length + storeIssueLines.filter(tx => tx.category === 'usage').length})
                  </button>

                  <button 
                    className={`btn-secondary`}
                    style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'reconciliation' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'reconciliation' ? '700' : '500', color: ledgerFilterTab === 'reconciliation' ? '#1e40af' : 'var(--text-secondary)' }}
                    onClick={() => setLedgerFilterTab('reconciliation')}
                  >
                    ⚖️ Audit Adj ({adjLines.length})
                  </button>
                </div>

              </div>

              {/* Comprehensive Material Stock Ledger Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th>Date & Time</th>
                      <th>Transaction Type</th>
                      <th>Ref Doc / Job Name</th>
                      <th>Party / Store Requisitioner</th>
                      <th style={{ minWidth: '180px' }}>Barcode / Tag (Updatable)</th>
                      <th style={{ color: '#047857' }}>Inward (+ {unitStr})</th>
                      <th style={{ color: '#dc2626' }}>Usage / Issue (- {unitStr})</th>
                      <th style={{ color: '#2563eb' }}>Audit Adj (± {unitStr})</th>
                      <th>Stock Balance ({unitStr})</th>
                      <th>Rate & Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLedgerItems.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                          No transaction records found matching the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      paginatedLedgerItems.map((tx, idx) => {
                        const isEditingThisBarcode = editingTxId === tx.txId;
                        return (
                          <tr key={tx.txId || idx} style={{ background: tx.category === 'reconciliation' ? '#f0f9ff' : (tx.category === 'usage' ? '#fff5f5' : 'transparent') }}>
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{tx.date}</td>
                            
                            {/* Category Badge */}
                            <td>
                              {tx.category === 'inward' && (
                                <span className="badge badge-us" style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d' }}>
                                  {tx.type || '📥 GRN Inward'}
                                </span>
                              )}
                              {tx.category === 'usage' && (
                                <span className="badge badge-error" style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c' }}>
                                  {tx.type || '📤 Job Usage'}
                                </span>
                              )}
                              {tx.category === 'reconciliation' && (
                                <span className="badge badge-warning" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1' }}>
                                  {tx.type || '⚖️ Physical Audit'}
                                </span>
                              )}
                            </td>

                            {/* Ref Doc / Job */}
                            <td>
                              <div style={{ fontWeight: '700', color: tx.category === 'usage' ? '#991b1b' : '#2563eb' }}>
                                {tx.refNo}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.subRef}</div>
                            </td>

                            {/* Party */}
                            <td>
                              <div style={{ fontWeight: '600' }}>{tx.partyName}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.subParty}</div>
                            </td>

                            {/* Updatable Barcode Column */}
                            <td>
                              {isEditingThisBarcode ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input 
                                    type="text" 
                                    className="form-control" 
                                    style={{ padding: '2px 6px', fontSize: '0.78rem', width: '130px' }}
                                    autoFocus
                                    value={editingBarcodeVal} 
                                    onChange={e => setEditingBarcodeVal(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveCustomBarcode(tx.txId, editingBarcodeVal);
                                      if (e.key === 'Escape') setEditingTxId(null);
                                    }}
                                  />
                                  <button 
                                    type="button" 
                                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
                                    onClick={() => handleSaveCustomBarcode(tx.txId, editingBarcodeVal)}
                                    title="Save Barcode"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button 
                                    type="button" 
                                    style={{ background: '#94a3b8', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
                                    onClick={() => setEditingTxId(null)}
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <code style={{ fontSize: '0.78rem', background: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: '600' }}>
                                    {tx.barcode}
                                  </code>
                                  <button 
                                    type="button" 
                                    style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                    onClick={() => {
                                      setEditingTxId(tx.txId);
                                      setEditingBarcodeVal(tx.barcode);
                                    }}
                                    title="Click to edit/update barcode string"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  {tx.barcode && (
                                    <button 
                                      type="button" 
                                      style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                      onClick={() => {
                                         const hasNumericSpecs = parseFloat(item.micron) > 0 && parseFloat(item.widthMm) > 0 && item.micron !== '-' && item.widthMm !== '-';
                                         const isFilm = (item.category === 'Film Substrates' || item.category === 'Film') && hasNumericSpecs;
                                         const rateVal = Number(tx.ratePerKg || tx.unitPrice || item.unitPrice || item.purchaseRatePerKg || 0);
                                         const batchVal = tx.batchNo || (tx.notes?.includes('Batch:') ? tx.notes.split('Batch:')[1].split('|')[0].replace(/[\[\]]/g, '').trim() : (tx.barcode || item.lastBatch || '-'));
                                         const invoiceVal = tx.subParty?.includes('Inv:') ? tx.subParty.replace('Inv:', '').trim() : (tx.invoiceNo || '');
                                         setSelectedRollForBarcodeModal({
                                           barcodeId: tx.barcode,
                                           rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
                                           itemName: item.itemName || (isFilm ? `${item.filmType} Film (${item.micron}µ x ${item.widthMm}mm)` : `${item.category || 'Stock Item'}`),
                                           category: item.category || (isFilm ? 'Film Substrates' : 'General Store'),
                                           unit: item.unit || (isFilm ? 'Kg' : 'Kg'),
                                           micron: isFilm ? (parseFloat(item.micron) || 0) : '-',
                                           widthMm: isFilm ? (parseFloat(item.widthMm) || 0) : '-',
                                           netWeightKg: tx.inwardQtyKg || tx.outwardQtyKg || 0,
                                           vendorName: tx.partyName || item.lastVendor || 'Company Stock',
                                           batchNo: batchVal,
                                           invoiceNo: invoiceVal,
                                           purchaseRatePerKg: rateVal,
                                           stationId: 'SCALE_1_INWARD'
                                         });
                                       }}
                                      title="Print Barcode Sticker"
                                    >
                                      <Printer size={13} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Inward Qty */}
                            <td style={{ fontWeight: '700', color: tx.inwardQtyKg > 0 ? '#047857' : 'var(--text-muted)' }}>
                              {tx.inwardQtyKg > 0 ? `+ ${(tx.inwardQtyKg ?? 0).toLocaleString()} ${unitStr}` : '-'}
                            </td>

                            {/* Job Usage Qty */}
                            <td style={{ fontWeight: '700', color: tx.outwardQtyKg > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                              {tx.outwardQtyKg > 0 ? `- ${(tx.outwardQtyKg ?? 0).toLocaleString()} ${unitStr}` : '-'}
                            </td>

                            {/* Audit Adj Qty */}
                            <td style={{ fontWeight: '700', color: tx.adjQtyKg !== 0 ? (tx.adjQtyKg > 0 ? '#2563eb' : '#d97706') : 'var(--text-muted)' }}>
                              {tx.adjQtyKg !== 0 ? (tx.adjQtyKg > 0 ? `+ ${tx.adjQtyKg} ${unitStr}` : `- ${Math.abs(tx.adjQtyKg)} ${unitStr}`) : '-'}
                            </td>

                            {/* Running Balance */}
                            <td style={{ fontWeight: '800', color: '#0f172a', background: '#f8fafc' }}>
                              {(tx.runningBalance ?? 0).toLocaleString()} {unitStr}
                            </td>

                            {/* Rate & Total Value */}
                            <td>
                              <div style={{ fontWeight: '700', color: '#047857' }}>₹ {tx.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>₹ {tx.ratePerKg.toFixed(2)}/{unitStr}</div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={ledgerCurrentPage}
                totalItems={displayLines.length}
                pageSize={ledgerPageSize}
                onPageChange={setLedgerCurrentPage}
                onPageSizeChange={setLedgerPageSize}
              />
            </div>
          </div>
        );
      })()}

      {/* Modal: Quick Vendor Onboarding (from GRN Modal) */}
      {isVendorModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={() => setIsVendorModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '620px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building2 style={{ color: 'var(--primary-brand)' }} /> Quick Vendor Onboarding & Registration
                </h3>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Register a new supplier to immediately select for this GRN Inward note.
                </p>
              </div>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setIsVendorModalOpen(false)}
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSaveVendorFromGRN}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Company / Vendor Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. SRF Limited / Jindal Poly Films"
                    value={newVendorCompanyName}
                    onChange={e => setNewVendorCompanyName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>GSTIN Number *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. 23AABCS1234F1Z5"
                    value={newVendorGstin}
                    onChange={e => setNewVendorGstin(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Terms</label>
                  <select
                    className="form-control"
                    value={newVendorPaymentTerms}
                    onChange={e => setNewVendorPaymentTerms(e.target.value)}
                  >
                    <option value="15 Days Net">15 Days Net</option>
                    <option value="30 Days Net">30 Days Net</option>
                    <option value="45 Days Net">45 Days Net</option>
                    <option value="60 Days Net">60 Days Net</option>
                    <option value="Advance Payment">Advance Payment</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Rajesh Malhotra"
                    value={newVendorContactPerson}
                    onChange={e => setNewVendorContactPerson(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="e.g. +91 98260 12345"
                    value={newVendorPhone}
                    onChange={e => setNewVendorPhone(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="e.g. sales@vendorcompany.com"
                    value={newVendorEmail}
                    onChange={e => setNewVendorEmail(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Plant & Billing Address</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Plot 42, Pithampur Industrial Area, Sector 3, Dhar MP"
                    value={newVendorAddress}
                    onChange={e => setNewVendorAddress(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Bank Account Details</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. HDFC Bank | A/C: 50200012345678 | IFSC: HDFC0000123"
                    value={newVendorBankDetails}
                    onChange={e => setNewVendorBankDetails(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', marginBottom: '8px' }}>Supplied Material Categories</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {vendorMaterialOptions.map(mat => (
                      <span
                        key={mat}
                        className={`preset-chip ${newVendorMaterials.includes(mat) ? 'active-chip' : ''}`}
                        onClick={() => toggleVendorMaterial(mat)}
                      >
                        {newVendorMaterials.includes(mat) ? '✓ ' : '+ '}{mat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsVendorModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#047857', borderColor: '#047857' }}>
                  <Building2 size={16} /> Onboard & Select Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create New Dispatch Shipment (Scale #4 Station) */}
      {isNewDispatchModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={() => setIsNewDispatchModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '650px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck style={{ color: '#059669' }} /> New Dispatch Shipment (Scale #4 Station)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Capture finished goods weights on Scale #4 and assign to shipment packing list.
                </p>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setIsNewDispatchModalOpen(false)}>
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSaveDispatchShipment}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Select Production Job *</label>
                  <select 
                    className="form-control"
                    value={dispatchJobName}
                    onChange={e => {
                      setDispatchJobName(e.target.value);
                      const matchedOrder = (orders || []).find(o => o.jobName === e.target.value);
                      if (matchedOrder) setDispatchClientName(matchedOrder.clientName);
                    }}
                  >
                    {(orders || []).map(o => (
                      <option key={o.id} value={o.jobName}>{o.jobName} ({o.clientName})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Client Name *</label>
                  <input type="text" className="form-control" required value={dispatchClientName} onChange={e => setDispatchClientName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Vehicle Number *</label>
                  <input type="text" className="form-control" required value={dispatchVehicleNo} onChange={e => setDispatchVehicleNo(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Lorry Receipt (LR) #</label>
                  <input type="text" className="form-control" value={dispatchLrNo} onChange={e => setDispatchLrNo(e.target.value)} />
                </div>

                {/* Scale #4 Live Weight Input */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <WeighingScaleInput
                    value={currentDispatchNetWeight}
                    onChange={setCurrentDispatchNetWeight}
                    stationId="SCALE_4_DISPATCH"
                    label="Scale #4 Live Roll Net Weight (Kg) *"
                    required
                  />
                </div>
              </div>

              {/* Scanned Dispatch Rolls Table */}
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '700' }}>Itemized Dispatch Reels / Boxes ({dispatchRollsList.length})</h4>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    onClick={() => {
                      const nextRollNo = dispatchRollsList.length + 1;
                      const newRollItem = {
                        rollNo: nextRollNo,
                        barcodeId: generateBarcodeId('FG-DISP'),
                        substrateSpec: 'Laminated Printed Reel',
                        netWeightKg: currentDispatchNetWeight || 210.0,
                        grossWeightKg: (currentDispatchNetWeight || 210.0) + 4.5,
                        coreSize: '3 inch'
                      };
                      setDispatchRollsList([...dispatchRollsList, newRollItem]);
                    }}
                  >
                    + Add Scanned Roll ({currentDispatchNetWeight} kg)
                  </button>
                </div>

                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Roll #</th>
                      <th>Barcode ID</th>
                      <th>Net Wt (kg)</th>
                      <th>Gross Wt (kg)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchRollsList.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700' }}>{r.rollNo}</td>
                        <td style={{ fontFamily: 'monospace', color: '#2563eb' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{r.barcodeId}</span>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                              onClick={() => setSelectedRollForBarcodeModal({
                                barcodeId: r.barcodeId,
                                rollType: 'FG_DISPATCH',
                                itemName: r.substrateSpec || 'Laminated Printed Reel',
                                netWeightKg: r.netWeightKg,
                                jobName: dispatchJobName,
                                clientName: dispatchClientName,
                                stationId: 'SCALE_4_DISPATCH'
                              })}
                            >
                              <Printer size={12} /> Print
                            </button>
                          </div>
                        </td>
                        <td style={{ fontWeight: '700', color: '#047857' }}>{r.netWeightKg} kg</td>
                        <td>{r.grossWeightKg} kg</td>
                        <td>
                          <button
                            type="button"
                            className="icon-btn-danger"
                            onClick={() => setDispatchRollsList(dispatchRollsList.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsNewDispatchModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#059669', borderColor: '#059669' }}>
                  <Printer size={16} /> Save & Generate Packing List PDF
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

