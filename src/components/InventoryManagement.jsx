import React, { useState, useEffect, useMemo, useRef } from 'react';
import { anyAssignedRole } from '../assignedRoles';
import { formatPlantDateTime } from '../utils/dbDates';
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
  Copy,
  Trash2,
  Building2,
  Tag,
  Truck,
  Scale,
  ScanBarcode as BarcodeIcon,
  Scan,
  FileText,
  Check,
  History as HistoryIcon,
  ChevronDown,
  Layers,
  QrCode,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Info,
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
import SearchableSelect from './SearchableSelect';
import GrnPoSuggestion from './GrnPoSuggestion';
import SFGFGEntryModal, { SFG_TYPES, FG_TYPES } from './SFGFGEntryModal';
import { getNextDocRefNumber, generateDocRefNumber, getInventoryAgeingSettings, getDocumentPrefixes } from '../services/settingsService';
import { getItemAgeInDays, getCategoryAgeingThreshold, isItemOverAged, sortInventoryByFifo, sortBatchesByFifo, getItemInwardDate, parseDateFlexible } from '../utils/fifoUtils';
import { notifyGRNPendingQC, notifyGRNQCVarianceModified } from '../services/emailService';

import { sanitizeInventoryItem, sanitizeGRN, formatFilmItemName, allocateGrnNumber, loadDeletedBarcodes, findDeletedBarcodeHits, previewInventoryItemDelete } from '../services/supabaseDataService';
import { ledgerRowLink, ledgerRowRate, rollBelongsOnItemLedger } from '../services/inventoryLedgerMatch';
import { isInventoryItemActive } from '../services/inventoryArchive';
import { deletedBarcodeMessage, findRetiredBarcode, isRetiredBarcode } from '../utils/barcodeRegistry';
import {
  OPENING_RECEIPT_TYPE,
  buildBulkImportPayload,
  bulkErrorRowsCsv,
  stockUploadErrorFileName,
  isOpeningStockReceipt,
  parseBulkStockCsv,
  reassignNewInventoryIds,
  sampleBulkStockCsv
} from '../services/bulkStockUpload';
import {
  applyMultiLineQc,
  applyQcApprovalStock,
  findDuplicateInvoice,
  grnIdentityProblems,
  grnLineIdentityGaps,
  oneLineFromReceipt,
  pendingQcKgForItem,
  planCapturedReceiptLink,
  prepareMultiLineReceipt,
  qcDraftFromLine,
  receiptLinesLinkError,
  validateCapturedLines
} from '../services/grnDocument';
import { findInventoryItemById, planManualStockSave, planReceiptStockLink, preferMasterItem } from '../services/inventoryIdentity';
import { canManageInwardGrn, cancelInwardGrn, grnChangeBlockReason, rollsForGrn } from '../services/grnLifecycle';
import { supabase } from '../services/supabaseClient';
import { fetchPayloadRecords, replacePayloadRecords, describeSaveError } from '../services/businessRecords';
import { pushSlugState } from '../utils/slugRouter';
import { 
  isReconciliationDue, 
  FILM_DENSITIES, 
  getFilmSubstrateDensity,
  calculateFilmRollLength,
  DEFAULT_DAILY_RATES,
  generateBarcodeId, 
  generateVendorId,
  generateInventoryId,
  PACKAGING_MATERIAL_TYPES,
  isMetalloceneEligibleFilm,
  METALLOCENE_OPTIONS,
  calculateOrderStockReservations,
  parseStandardDate
} from '../factoryStore';
import { codeKey, codeKeyFrom, codeStartsWith, codesEqual, textFrom } from '../utils/barcodeCode';
import {
  blankPoFilledGrnFields,
  describePoForSuggestion,
  filmStockIdForPoItem,
  grnFieldsFromPo,
  planPoSelection,
  planVendorPick
} from '../services/grnPoSuggestion';

export const INVENTORY_CATEGORIES = [
  "Film Substrates",
  "Printing Inks",
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

export function summarizeGrnLineDraft(line) {
  const rolls = Array.isArray(line?.rolls) ? line.rolls : [];
  const netFromRolls = rolls.reduce((sum, roll) => sum + (Number(roll?.netWeightKg) || 0), 0);
  const net = netFromRolls > 0 ? netFromRolls : (Number(line?.weightKg) || 0);
  const rate = Number(line?.purchaseRate) || 0;
  const rollsCount = rolls.length || Number(line?.rollsCount) || 0;
  const category = String(line?.category ?? '').trim();
  const isFilm = category === 'Film Substrates';
  const name = !category
    ? (line?.itemName || line?.itemSearchTerm || 'New item')
    : (isFilm
      ? (line?.filmType || line?.itemName || 'New item')
      : (line?.itemName || line?.itemSearchTerm || 'New item'));
  const batch = String(line?.batchNo || '').trim();
  const spec = [
    ...(isFilm
      ? [
        line?.micron !== '' && line?.micron !== null && line?.micron !== undefined ? `${line.micron}µ` : '',
        line?.widthMm !== '' && line?.widthMm !== null && line?.widthMm !== undefined ? `${line.widthMm} mm` : ''
      ]
      : [line?.packagingType || category || '']),
    batch ? `Batch ${batch}` : ''
  ].filter(Boolean).join(' · ');
  const problems = [...grnLineIdentityGaps(line)];
  if (!(net > 0)) problems.push('missing weight');
  if (!String(line?.batchNo || '').trim()) problems.push('missing batch');
  if (isFilm) {
    if (line?.micron === '' || line?.micron === null || line?.micron === undefined) problems.push('missing micron');
    if (line?.widthMm === '' || line?.widthMm === null || line?.widthMm === undefined) problems.push('missing width');
  } else if (category && !String(line?.itemName || '').trim() && String(line?.stockItemId || '').trim()) {
    problems.push('missing description');
  }
  return {
    name,
    spec,
    rollsCount,
    net,
    rate,
    amount: net * rate,
    unitLabel: line?.packagingType || (isFilm ? 'Rolls' : 'Units'),
    problems
  };
}

export function formatInwardTimestamp(grn) {
  if (!grn) return 'Date N/A';
  const raw = grn.inwardTimestamp || grn.createdAt || grn.created_at || grn.receivedAt || grn.receivedDate || grn.date;
  const d = parseDateFlexible(raw);
  if (!d) return grn.receivedDate || 'Date N/A';

  const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (grn.receivedTime) {
    return `${dateStr}, ${grn.receivedTime}`;
  }
  const hasTime = typeof raw === 'string' && (raw.includes('T') || raw.includes(':'));
  if (hasTime && (d.getHours() !== 0 || d.getMinutes() !== 0)) {
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr}, ${timeStr}`;
  }
  return dateStr;
}

export function getInwardTimeAgo(grn) {
  if (!grn) return '';
  const raw = grn.inwardTimestamp || grn.createdAt || grn.created_at || grn.receivedAt || grn.receivedDate || grn.date;
  const d = parseDateFlexible(raw);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'Just now';
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return `1 day ago`;
  return `${diffDays} days ago`;
}

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
  purchaseOrders = [],
  indents = [],
  inks = [],
  jobMasters = [],
  machines = [],
  currentUser = null,
  users = [],
  productionRecords = [],
  storeIssueTransactions = [],
  onStoreIssueReturn,
  onAddGRN, 
  onUpdateGRN, 
  onUpdateInventory,
  onSaveInventoryItem,
  onDeleteInventoryItem,
  onArchiveInventoryItems,
  onReactivateInventoryItems,
  onWriteOffInventoryItems,
  onSaveProductionRecord,
  onAddVendor,
  inventoryRolls = [],
  dispatchShipments = [],
  onAddRoll,
  onUpdateRoll,
  onUpdateInventoryRolls,
  onAddDispatchShipment,
  cylinders = [],
  onUpdateCylinder,
  onUpdateOrder
}) {
  const [activeTab, setActiveTab] = useState('stock'); // stock, grn_inward, qc_approval, issue_return, reconciliation
  const [searchTerm, setSearchTerm] = useState('');

  // SFG & FG Creation Modal State
  const [isSfgFgModalOpen, setIsSfgFgModalOpen] = useState(false);
  const [sfgFgModalMode, setSfgFgModalMode] = useState('SFG'); // 'SFG' | 'FG'

  // Inventory Ageing Settings Configuration & FIFO Metrics
  const ageingSettings = useMemo(() => getInventoryAgeingSettings(), []);

  const safeGrns = useMemo(() => (grns || []).map(sanitizeGRN), [grns]);

  // Sanitize all inventory and GRN records, applying FIFO sorting by true oldest inward date
  const safeInventory = useMemo(() => {
    const sanitized = (inventory || []).map(sanitizeInventoryItem);
    // Filter out Semi-Finished Goods (SFG) and Finished Goods (FG) as they belong exclusively in SFG & FG Store module!
    const rawMaterialsOnly = sanitized.filter(item => {
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

      return !isSFGorFG;
    });

    return sortInventoryByFifo(rawMaterialsOnly, safeGrns, inventoryRolls);
  }, [inventory, safeGrns, inventoryRolls]);

  const nextInventoryId = (items = inventory) => generateInventoryId(items, safeGrns, inventoryRolls);

  // QC-overdue mail is not sent from this page. A single daily digest runs
  // after GRNs load (see runQcOverdueEscalationDigest). Opening Inventory
  // must not email anyone.

  // Group inventory items by Item Name / Specs so films of same 'Item Name' but different Inventory Code/ID are consolidated into the same Item row
  const groupedInventory = useMemo(() => {
    const rawList = safeInventory || [];
    const groupsMap = new Map();

    rawList.forEach(item => {
      const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
      const cleanName = (item.itemName || '').trim();
      const filmType = (item.filmType || '').trim();
      const micron = item.micron !== undefined && item.micron !== null ? String(item.micron).trim() : '';
      const width = item.widthMm !== undefined && item.widthMm !== null ? String(item.widthMm).trim() : '';

      let groupKey = '';
      if (isFilm && item.preserveItemName && cleanName) {
        groupKey = `ITEM_${cleanName.toLowerCase()}`;
      } else if (isFilm) {
        const stdTitle = formatFilmItemName(filmType, width, micron, cleanName);
        groupKey = `FILM_${stdTitle.toLowerCase().replace(/\s+/g, '')}`;
      } else if (cleanName) {
        groupKey = `ITEM_${cleanName.toLowerCase().replace(/\s+/g, '')}`;
      } else {
        groupKey = `ITEM_${String(item.category || item.id || '').toLowerCase().replace(/\s+/g, '')}`;
      }

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          ...item,
          primaryId: item.id,
          allInventoryIds: [item.id],
          subItems: [item],
          availableQtyKg: Number(item.availableQtyKg || 0),
          allocatedQtyKg: Number(item.allocatedQtyKg || 0),
          reorderLevelKg: Number(item.reorderLevelKg || 100),
          totalValuation: (parseFloat(item.availableQtyKg) || 0) * (parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0),
          allLocations: new Set(item.location ? [item.location] : []),
          allVendors: new Set(item.lastVendor || item.vendor ? [item.lastVendor || item.vendor] : []),
          allBatches: new Set(item.lastBatch ? [item.lastBatch] : []),
        });
      } else {
        const existing = groupsMap.get(groupKey);
        existing.subItems.push(item);
        if (!existing.allInventoryIds.includes(item.id)) {
          existing.allInventoryIds.push(item.id);
        }
        existing.availableQtyKg = Number((existing.availableQtyKg + (parseFloat(item.availableQtyKg) || 0)).toFixed(2));
        existing.allocatedQtyKg = Number((existing.allocatedQtyKg + (parseFloat(item.allocatedQtyKg) || 0)).toFixed(2));
        existing.reorderLevelKg = Math.max(existing.reorderLevelKg, Number(item.reorderLevelKg || 0));
        existing.totalValuation += (parseFloat(item.availableQtyKg) || 0) * (parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0);
        if (item.location) existing.allLocations.add(item.location);
        if (item.lastVendor || item.vendor) existing.allVendors.add(item.lastVendor || item.vendor);
        if (item.lastBatch) existing.allBatches.add(item.lastBatch);
        if (parseFloat(item.unitPrice || item.purchaseRatePerKg) > 0) {
          existing.unitPrice = parseFloat(item.unitPrice || item.purchaseRatePerKg);
          existing.purchaseRatePerKg = parseFloat(item.unitPrice || item.purchaseRatePerKg);
        }
      }
    });

    return Array.from(groupsMap.values()).map(grp => {
      const location = Array.from(grp.allLocations).join(', ') || grp.location || 'Bay A';
      const lastVendor = Array.from(grp.allVendors).pop() || grp.lastVendor || 'Supplier';
      const lastBatch = Array.from(grp.allBatches).pop() || grp.lastBatch || 'N/A';
      const unitPrice = grp.availableQtyKg > 0 ? (grp.totalValuation / grp.availableQtyKg) : (grp.unitPrice || 0);

      return {
        ...grp,
        location,
        lastVendor,
        lastBatch,
        unitPrice: Number(unitPrice.toFixed(2)),
        purchaseRatePerKg: Number(unitPrice.toFixed(2)),
        purchaseValuation: Number(grp.totalValuation.toFixed(2))
      };
    });
  }, [safeInventory]);

  // Live pool of stock reservations across all active customer orders
  const stockReservations = useMemo(() => {
    return calculateOrderStockReservations(orders, safeInventory, jobMasters);
  }, [orders, safeInventory, jobMasters]);

  const getItemReservations = (targetItem) => {
    if (!targetItem || !stockReservations?.pool) return { totalReservedKg: 0, remainingStockKg: 0, reservations: [] };
    const ids = targetItem.allInventoryIds || [targetItem.id];
    let totalReservedKg = 0;
    const seenReqKeys = new Set();
    const reservations = [];

    // 1. Direct ID match
    ids.forEach(id => {
      const entry = stockReservations.pool[String(id)];
      if (entry) {
        (entry.reservations || []).forEach(res => {
          const key = `${res.orderId}_${res.reqId}`;
          if (!seenReqKeys.has(key)) {
            seenReqKeys.add(key);
            reservations.push(res);
            totalReservedKg += res.reservedKg || 0;
          }
        });
      }
    });

    // 2. Spec / item matching fallback
    const targetFilm = ((targetItem.filmType || targetItem.itemName || '')).trim().toLowerCase();
    const targetMicron = parseFloat(targetItem.micron);
    const targetWidth = parseFloat(targetItem.widthMm);

    Object.values(stockReservations.pool).forEach(entry => {
      if (!entry || !entry.item) return;
      const inv = entry.item;
      if (ids.some(id => String(id) === String(inv.id))) return;

      const invFilm = (inv.filmType || inv.itemName || '').trim().toLowerCase();
      const invMicron = parseFloat(inv.micron);
      const invWidth = parseFloat(inv.widthMm);

      const filmMatch = targetFilm && invFilm && (targetFilm === invFilm || targetFilm.includes(invFilm) || invFilm.includes(targetFilm));
      const micronMatch = (isNaN(targetMicron) && isNaN(invMicron)) || targetMicron === invMicron;
      const widthMatch = (isNaN(targetWidth) && isNaN(invWidth)) || targetWidth === invWidth;

      if (filmMatch && micronMatch && widthMatch) {
        (entry.reservations || []).forEach(res => {
          const key = `${res.orderId}_${res.reqId}`;
          if (!seenReqKeys.has(key)) {
            seenReqKeys.add(key);
            reservations.push(res);
            totalReservedKg += res.reservedKg || 0;
          }
        });
      }
    });

    const grossStock = Number(targetItem.availableQtyKg ?? 0);
    const remainingStockKg = Math.max(0, Number((grossStock - totalReservedKg).toFixed(2)));
    return {
      totalReservedKg: Number(totalReservedKg.toFixed(2)),
      remainingStockKg,
      reservations
    };
  };

  // Calculate items exceeding category ageing limits
  const overAgedItemsCount = useMemo(() => {
    return safeInventory.filter(item => isItemOverAged(item, ageingSettings, safeGrns, inventoryRolls)).length;
  }, [safeInventory, ageingSettings, safeGrns, inventoryRolls]);



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
    pushSlugState('inventory', { section: tabKey });
  };

  // Modals state
  const [isNewGRNModalOpen, setIsNewGRNModalOpen] = useState(false);
  const [editingGrn, setEditingGrn] = useState(null);
  const [grnConfirmationModal, setGrnConfirmationModal] = useState({ isOpen: false, pendingData: null });
  const [grnSuccessModal, setGrnSuccessModal] = useState({ isOpen: false, grnRecord: null, newRolls: [] });
  const [selectedGRNForPDF, setSelectedGRNForPDF] = useState(null);
  const [qcInspectingGRN, setQcInspectingGRN] = useState(null);
  const [qcNotesInput, setQcNotesInput] = useState('');
  const [selectedItemForPurchaseHistory, setSelectedItemForPurchaseHistory] = useState(null);

  // QC Inward Inspection Editable Parameters state
  const [qcEditFilmType, setQcEditFilmType] = useState('');
  const [qcEditCategory, setQcEditCategory] = useState('');
  const [qcEditItemName, setQcEditItemName] = useState('');
  const [qcEditWidthMm, setQcEditWidthMm] = useState('');
  const [qcEditMicron, setQcEditMicron] = useState('');
  const [qcEditLengthMeters, setQcEditLengthMeters] = useState('');
  const [qcEditNetWeightKg, setQcEditNetWeightKg] = useState('');
  const [qcEditGrossWeightKg, setQcEditGrossWeightKg] = useState('');
  const [qcEditTareWeightKg, setQcEditTareWeightKg] = useState('');
  const [qcEditRollsReceived, setQcEditRollsReceived] = useState(1);
  const [qcEditBatchNo, setQcEditBatchNo] = useState('');
  const [qcEditPackagingType, setQcEditPackagingType] = useState('Roll');
  const [qcEditItemsBreakdown, setQcEditItemsBreakdown] = useState([]);
  const [qcEditDyneLevel, setQcEditDyneLevel] = useState('38-42');
  const [qcEditGaugeVariance, setQcEditGaugeVariance] = useState('±1.0');
  const [qcIsEditingDetails, setQcIsEditingDetails] = useState(false);
  const [qcVisualChecks, setQcVisualChecks] = useState({
    noPinholes: true,
    noScratches: true,
    coreIntact: true,
    uniformWinding: true,
    noOdor: true
  });

  const applyQcDraftToForm = (draft) => {
    if (!draft) return;
    setQcEditFilmType(draft.filmType || 'PET');
    setQcEditCategory(draft.category || 'Film Substrates');
    setQcEditItemName(draft.itemName || '');
    setQcEditWidthMm(draft.widthMm !== '-' && draft.widthMm !== undefined ? draft.widthMm : '');
    setQcEditMicron(draft.micron !== '-' && draft.micron !== undefined ? draft.micron : '');
    setQcEditNetWeightKg(draft.netWeightKg !== undefined ? draft.netWeightKg : '');
    setQcEditGrossWeightKg(draft.grossWeightKg !== undefined ? draft.grossWeightKg : '');
    setQcEditTareWeightKg(draft.tareWeightKg !== undefined ? draft.tareWeightKg : '');
    setQcEditRollsReceived(draft.rollsReceived || 1);
    setQcEditBatchNo(draft.batchNo || '');
    setQcEditPackagingType(draft.packagingType || 'Roll');
    setQcEditItemsBreakdown(Array.isArray(draft.itemsBreakdown) ? draft.itemsBreakdown : []);
    setQcEditLengthMeters(draft.itemsBreakdown?.[0]?.lengthMeters || '');
  };

  const currentQcDraftFromForm = () => ({
    filmType: qcEditFilmType,
    category: qcEditCategory,
    itemName: qcEditItemName,
    widthMm: qcEditWidthMm,
    micron: qcEditMicron,
    netWeightKg: qcEditNetWeightKg,
    grossWeightKg: qcEditGrossWeightKg,
    tareWeightKg: qcEditTareWeightKg,
    rollsReceived: qcEditRollsReceived,
    batchNo: qcEditBatchNo,
    packagingType: qcEditPackagingType,
    itemsBreakdown: qcEditItemsBreakdown
  });

  useEffect(() => {
    if (qcInspectingGRN) {
      const qcLines = Array.isArray(qcInspectingGRN.lineItems) ? qcInspectingGRN.lineItems : [];
      if (qcLines.length > 1) {
        const drafts = {};
        qcLines.forEach((line) => {
          drafts[line.id] = qcDraftFromLine(line);
        });
        setQcLineDrafts(drafts);
        setQcActiveLineId(qcLines[0].id);
        applyQcDraftToForm(drafts[qcLines[0].id]);
        setQcNotesInput(qcInspectingGRN.qcNotes || '');
        setQcEditDyneLevel(qcInspectingGRN.dyneLevel || '38-42');
        setQcEditGaugeVariance(qcInspectingGRN.gaugeVariance || '±1.0');
        setQcIsEditingDetails(false);
        setQcVisualChecks(qcInspectingGRN.qcVisualChecks || {
          noPinholes: true,
          noScratches: true,
          coreIntact: true,
          uniformWinding: true,
          noOdor: true
        });
        return;
      }
      setQcLineDrafts({});
      setQcActiveLineId('');
      setQcEditFilmType(qcInspectingGRN.filmType || 'PET');
      setQcEditCategory(qcInspectingGRN.category || 'Film Substrates');
      setQcEditItemName(qcInspectingGRN.itemName || '');
      setQcEditWidthMm(qcInspectingGRN.widthMm !== '-' && qcInspectingGRN.widthMm !== undefined ? qcInspectingGRN.widthMm : '');
      setQcEditMicron(qcInspectingGRN.micron !== '-' && qcInspectingGRN.micron !== undefined ? qcInspectingGRN.micron : '');
      setQcEditNetWeightKg(qcInspectingGRN.netWeightKg !== undefined ? qcInspectingGRN.netWeightKg : '');
      setQcEditGrossWeightKg(qcInspectingGRN.grossWeightKg !== undefined ? qcInspectingGRN.grossWeightKg : '');
      setQcEditTareWeightKg(qcInspectingGRN.tareWeightKg !== undefined ? qcInspectingGRN.tareWeightKg : '');
      setQcEditRollsReceived(qcInspectingGRN.rollsReceived || (Array.isArray(qcInspectingGRN.itemsBreakdown) ? qcInspectingGRN.itemsBreakdown.length : 1));
      setQcEditBatchNo(qcInspectingGRN.batchNo || '');
      setQcEditPackagingType(qcInspectingGRN.packagingType || 'Roll');
      setQcNotesInput(qcInspectingGRN.qcNotes || '');
      setQcEditDyneLevel(qcInspectingGRN.dyneLevel || '38-42');
      setQcEditGaugeVariance(qcInspectingGRN.gaugeVariance || '±1.0');
      setQcIsEditingDetails(false);

      const breakdown = Array.isArray(qcInspectingGRN.itemsBreakdown) && qcInspectingGRN.itemsBreakdown.length > 0
        ? qcInspectingGRN.itemsBreakdown.map((item, idx) => ({ ...item, unitNo: item.unitNo || idx + 1 }))
        : [];
      setQcEditItemsBreakdown(breakdown);

      const initialLength = qcInspectingGRN.itemsBreakdown?.[0]?.lengthMeters || '';
      setQcEditLengthMeters(initialLength);

      setQcVisualChecks(qcInspectingGRN.qcVisualChecks || {
        noPinholes: true,
        noScratches: true,
        coreIntact: true,
        uniformWinding: true,
        noOdor: true
      });
    }
  }, [qcInspectingGRN]);

  const qcVariances = useMemo(() => {
    if (!qcInspectingGRN) return [];
    const diffs = [];
    const orig = qcInspectingGRN;
    
    // 1. Net Weight
    const origNet = parseFloat(orig.netWeightKg) || 0;
    const newNet = parseFloat(qcEditNetWeightKg) || 0;
    if (Math.abs(origNet - newNet) > 0.05) {
      const diffVal = Number((newNet - origNet).toFixed(2));
      diffs.push({
        field: 'netWeightKg',
        label: 'Inward Net Weight',
        oldVal: `${origNet} kg`,
        newVal: `${newNet} kg`,
        diff: `${diffVal > 0 ? '+' : ''}${diffVal} kg (${((diffVal / (origNet || 1)) * 100).toFixed(1)}%)`
      });
    }

    // 2. Width (mm)
    const origWidth = parseFloat(orig.widthMm) || 0;
    const newWidth = parseFloat(qcEditWidthMm) || 0;
    if (origWidth > 0 && newWidth > 0 && Math.abs(origWidth - newWidth) > 0.1) {
      const diffVal = Number((newWidth - origWidth).toFixed(1));
      diffs.push({
        field: 'widthMm',
        label: 'Width (mm)',
        oldVal: `${origWidth} mm`,
        newVal: `${newWidth} mm`,
        diff: `${diffVal > 0 ? '+' : ''}${diffVal} mm`
      });
    }

    // 3. Micron (µ)
    const origMicron = parseFloat(orig.micron) || 0;
    const newMicron = parseFloat(qcEditMicron) || 0;
    if (origMicron > 0 && newMicron > 0 && Math.abs(origMicron - newMicron) > 0.1) {
      const diffVal = Number((newMicron - origMicron).toFixed(1));
      diffs.push({
        field: 'micron',
        label: 'Thickness / Micron',
        oldVal: `${origMicron} µ`,
        newVal: `${newMicron} µ`,
        diff: `${diffVal > 0 ? '+' : ''}${diffVal} µ`
      });
    }

    // 4. Batch Number
    const origBatch = String(orig.batchNo || '').trim();
    const newBatch = String(qcEditBatchNo || '').trim();
    if (origBatch && newBatch && origBatch !== newBatch) {
      diffs.push({
        field: 'batchNo',
        label: 'Manufacturer Batch #',
        oldVal: origBatch,
        newVal: newBatch,
        diff: 'Modified'
      });
    }

    // 5. Film Substrate
    const origFilm = String(orig.filmType || '').trim();
    const newFilm = String(qcEditFilmType || '').trim();
    if (origFilm && newFilm && origFilm !== newFilm) {
      diffs.push({
        field: 'filmType',
        label: 'Film Substrate',
        oldVal: origFilm,
        newVal: newFilm,
        diff: 'Changed'
      });
    }

    // 6. Rolls Received
    const origRolls = parseInt(orig.rollsReceived, 10) || 1;
    const newRollsCount = parseInt(qcEditRollsReceived, 10) || 1;
    if (origRolls !== newRollsCount) {
      diffs.push({
        field: 'rollsReceived',
        label: 'Packages / Rolls Count',
        oldVal: `${origRolls}`,
        newVal: `${newRollsCount}`,
        diff: `${newRollsCount - origRolls > 0 ? '+' : ''}${newRollsCount - origRolls}`
      });
    }

    return diffs;
  }, [qcInspectingGRN, qcEditNetWeightKg, qcEditWidthMm, qcEditMicron, qcEditBatchNo, qcEditFilmType, qcEditRollsReceived]);

  // Updatable Barcodes & Stock Ledger Adjustments state
  const [customBarcodesMap, setCustomBarcodesMap] = useState({});

  const [stockLedgerAdjustments, setStockLedgerAdjustments] = useState([]);

  const effectiveStoreIssueTransactions = storeIssueTransactions || [];

  useEffect(() => {
    let active = true;
    async function loadLedgers() {
      try {
        const [barcodes, adjustments, resolutions] = await Promise.all([
          fetchPayloadRecords(supabase, 'custom_barcodes'),
          fetchPayloadRecords(supabase, 'stock_adjustments'),
          fetchPayloadRecords(supabase, 'po_discrepancy_resolutions')
        ]);
        if (!active) return;
        const barcodeMap = {};
        (barcodes || []).forEach((row) => {
          if (row?.id) barcodeMap[row.id] = row.barcode || '';
        });
        setCustomBarcodesMap(barcodeMap);
        setStockLedgerAdjustments((adjustments || []).filter(adj => !['ADJ-2026-001', 'ADJ-2026-002'].includes(adj.id)));
        const resolutionMap = {};
        (resolutions || []).forEach((row) => {
          if (row?.id) resolutionMap[row.poNumber || row.id] = row;
        });
        setPoResolutions(resolutionMap);
      } catch (err) {
        console.error(err);
        alert(`Inventory ledgers could not be loaded from the database: ${describeSaveError(err)}`);
      }
    }
    loadLedgers();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadDeletedBarcodes().then((rows) => {
      if (active) setDeletedBarcodes(rows);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

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
  const [deletedBarcodes, setDeletedBarcodes] = useState([]);
  const [selectedStockIds, setSelectedStockIds] = useState(() => new Set());
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

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
  const [newVendorMaterials, setNewVendorMaterials] = useState(['PET', 'METPET']);
  const [newVendorPaymentTerms, setNewVendorPaymentTerms] = useState('30 Days Net');

  // Universal Bulk Stock Upload State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("Film Substrates");
  const [bulkPlan, setBulkPlan] = useState(null);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkErrorMsg, setBulkErrorMsg] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);

  const vendorMaterialOptions = [
    "PET", "METPET", "LDPE", "Natural GP LD", "White LD", 
    "BOPP Natural", "Matte Finish BOPP", "Metalised BOPP", "Pearlised BOPP", 
    "CPP Natural", "Metalised CPP", "Liquid Inks", "Solvent-less Adhesive", "Solvents"
  ];

  const handleSaveCustomBarcode = async (txId, newBarcodeStr) => {
    if (!newBarcodeStr.trim()) return;
    const updated = { ...customBarcodesMap, [txId]: newBarcodeStr.trim() };
    const rows = Object.entries(updated).map(([id, barcode]) => ({ id, barcode }));
    try {
      await replacePayloadRecords(supabase, 'custom_barcodes', rows);
      setCustomBarcodesMap(updated);
      setEditingTxId(null);
      setEditingBarcodeVal('');
    } catch (err) {
      alert(`The barcode was not saved: ${describeSaveError(err)}`);
    }
  };

  const handleAddLedgerAdjustment = async (e, targetItem) => {
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
      date: new Date().toISOString(),
      type: adjType,
      qtyKg: qty,
      barcode: adjBarcode.trim() || generateBarcodeId('ADJ'),
      reason: adjReason.trim() || 'Physical Stock Audit Correction',
      adjustedBy: 'Store Manager'
    };

    const updated = [newAdj, ...stockLedgerAdjustments];
    try {
      await replacePayloadRecords(supabase, 'stock_adjustments', updated);
      setStockLedgerAdjustments(updated);
    } catch (err) {
      alert(`The stock adjustment was not saved: ${describeSaveError(err)}`);
      return;
    }

    // Update item available stock in main inventory list for the specific item
    if (onUpdateInventory) {
      const updatedInv = inventory.map(invItem => {
        if (invItem.id === item.id) {
          return { ...invItem, availableQtyKg: Math.max(0, (invItem.availableQtyKg || 0) + qty) };
        }
        return invItem;
      });
      try {
        await onUpdateInventory(updatedInv);
      } catch (err) {
        alert(`The stock quantity was not saved: ${describeSaveError(err)}`);
        return;
      }
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

    // Select the new vendor. Open POs are suggested; the receipt stays blank until one is confirmed.
    handleGrnVendorChange(createdVendor.companyName);

    // Reset vendor modal state
    setNewVendorCompanyName('');
    setNewVendorGstin('');
    setNewVendorAddress('');
    setNewVendorContactPerson('');
    setNewVendorPhone('');
    setNewVendorEmail('');
    setNewVendorBankDetails('');
    setNewVendorPaymentTerms('30 Days Net');
    setIsVendorModalOpen(false);

    alert(`Vendor "${createdVendor.companyName}" onboarded successfully and selected for this GRN!`);
  };

  // Save Dispatch Shipment Handler (Scale #4 Station)
  const handleSaveDispatchShipment = async (e) => {
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
    const orderId = matchedOrder ? matchedOrder.id : getNextDocRefNumber('order');

    const totalNetWeight = dispatchRollsList.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
    const totalGrossWeight = dispatchRollsList.reduce((sum, r) => sum + (parseFloat(r.grossWeightKg) || 0), 0);

    const newShipment = {
      dispatchId: getNextDocRefNumber('dispatch'),
      orderId,
      jobName: dispatchJobName,
      clientName: dispatchClientName,
      vehicleNo: dispatchVehicleNo,
      lrNo: dispatchLrNo || '',
      dispatchDate: new Date().toISOString(),
      totalRolls: dispatchRollsList.length,
      totalNetWeightKg: parseFloat(totalNetWeight.toFixed(2)),
      totalGrossWeightKg: parseFloat(totalGrossWeight.toFixed(2)),
      items: dispatchRollsList
    };

    try {
      if (onAddDispatchShipment) await onAddDispatchShipment(newShipment);
    } catch (err) {
      alert(err?.name === 'PartialSaveError'
        ? err.message
        : `The packing list was not saved: ${err.message || err}`);
      if (err?.name === 'PartialSaveError') {
        setIsNewDispatchModalOpen(false);
        setSelectedDispatchForPackingList(newShipment);
      }
      return;
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
  const [grnVendor, setGrnVendor] = useState('');
  const [grnPoNo, setGrnPoNo] = useState('');
  const [isManualPoEntry, setIsManualPoEntry] = useState(false);
  const [poSuggestionDismissed, setPoSuggestionDismissed] = useState(false);
  const [grnPoApplied, setGrnPoApplied] = useState(false);
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnCategory, setGrnCategory] = useState('');
  const [grnItemName, setGrnItemName] = useState('');
  const [grnFilmType, setGrnFilmType] = useState('PET');
  const [grnMetallocenePct, setGrnMetallocenePct] = useState('');
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
  const [grnItemRemarks, setGrnItemRemarks] = useState('');

  // Individual Roll / Container Itemized Breakdown State (Each with distinct gross/tare/net weights)
  const [savedGrnLines, setSavedGrnLines] = useState([]);
  const [activeGrnLineKey, setActiveGrnLineKey] = useState('line-active');
  const [grnLineOrder, setGrnLineOrder] = useState(['line-active']);
  const grnItemEditorRef = useRef(null);
  const [expandedGrnNo, setExpandedGrnNo] = useState('');
  const [qcLineDrafts, setQcLineDrafts] = useState({});
  const [qcActiveLineId, setQcActiveLineId] = useState('');
  const [grnItemsList, setGrnItemsList] = useState([
    { id: 'item-1', grossWeightKg: '', tareWeightKg: 0, netWeightKg: '', lengthMeters: '', vendorRollNo: '', itemRemarks: '', notes: '' }
  ]);
  const [grnDefaultTare, setGrnDefaultTare] = useState(0);

  // Recalculate estimated roll length (meters) dynamically across all rows when common film specs change
  const recalculateAllRollLengths = (customFilmType, customMicron, customWidth) => {
    const activeType = customFilmType !== undefined ? customFilmType : grnFilmType;
    const activeMicron = customMicron !== undefined ? customMicron : grnMicron;
    const activeWidth = customWidth !== undefined ? customWidth : grnWidthMm;

    setGrnItemsList(prev => prev.map(item => {
      const net = parseFloat(item.netWeightKg);
      if (!isNaN(net) && net > 0) {
        return {
          ...item,
          lengthMeters: calculateFilmRollLength(net, activeWidth, activeMicron, activeType)
        };
      }
      return item;
    }));
  };

  const relinkGrnStockItem = ({ category, filmType, micron, widthMm, itemName }) => {
    const plan = planReceiptStockLink(inventory, {
      itemName,
      category,
      filmType,
      micron,
      widthMm
    });
    setGrnSelectedStockItemId(plan.action === 'use' ? String(plan.item.id) : '');
  };

  const handleFilmTypeChange = (newFilmType) => {
    setGrnFilmType(newFilmType);
    const newPct = isMetalloceneEligibleFilm(newFilmType) ? grnMetallocenePct : '';
    if (!isMetalloceneEligibleFilm(newFilmType)) {
      setGrnMetallocenePct('');
    }
    if (grnCategory === 'Film Substrates') {
      recalculateAllRollLengths(newFilmType, grnMicron, grnWidthMm);
      const name = formatFilmItemName(newFilmType, grnWidthMm, grnMicron, '', newPct);
      setGrnItemName(name);
      setGrnItemSearchTerm(name);
      relinkGrnStockItem({ category: grnCategory, filmType: newFilmType, micron: grnMicron, widthMm: grnWidthMm, itemName: name });
    } else {
      setGrnSelectedStockItemId('');
    }
  };

  const handleMetallocenePctChange = (newPct) => {
    setGrnMetallocenePct(newPct);
    if (grnCategory === 'Film Substrates') {
      const name = formatFilmItemName(grnFilmType, grnWidthMm, grnMicron, '', newPct);
      setGrnItemName(name);
      setGrnItemSearchTerm(name);
      relinkGrnStockItem({ category: grnCategory, filmType: grnFilmType, micron: grnMicron, widthMm: grnWidthMm, itemName: name });
    }
  };

  const handleMicronChange = (newMicron) => {
    setGrnMicron(newMicron);
    if (grnCategory === 'Film Substrates') {
      recalculateAllRollLengths(grnFilmType, newMicron, grnWidthMm);
      const name = formatFilmItemName(grnFilmType, grnWidthMm, newMicron, '', grnMetallocenePct);
      setGrnItemName(name);
      setGrnItemSearchTerm(name);
      relinkGrnStockItem({ category: grnCategory, filmType: grnFilmType, micron: newMicron, widthMm: grnWidthMm, itemName: name });
    }
  };

  const handleWidthChange = (newWidth) => {
    setGrnWidthMm(newWidth);
    if (grnCategory === 'Film Substrates') {
      recalculateAllRollLengths(grnFilmType, grnMicron, newWidth);
      const name = formatFilmItemName(grnFilmType, newWidth, grnMicron, '', grnMetallocenePct);
      setGrnItemName(name);
      setGrnItemSearchTerm(name);
      relinkGrnStockItem({ category: grnCategory, filmType: grnFilmType, micron: grnMicron, widthMm: newWidth, itemName: name });
    }
  };

  // Add individual roll / container row
  const handleAddGrnItemRow = (initialData = {}) => {
    const newId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const gross = parseFloat(initialData.grossWeightKg) || 0;
    const tare = parseFloat(initialData.tareWeightKg) ?? (grnDefaultTare || 0);
    const net = parseFloat(initialData.netWeightKg) || (gross > 0 ? Math.max(0, gross - tare) : 0);
    const calculatedLen = initialData.lengthMeters ?? (
      (grnCategory === 'Film Substrates' && net > 0)
        ? calculateFilmRollLength(net, grnWidthMm, grnMicron, grnFilmType)
        : ''
    );

    setGrnItemsList(prev => [
      ...prev,
      {
        id: newId,
        grossWeightKg: initialData.grossWeightKg ?? '',
        tareWeightKg: tare,
        netWeightKg: initialData.netWeightKg ?? '',
        lengthMeters: calculatedLen,
        vendorRollNo: initialData.vendorRollNo ?? '',
        itemRemarks: initialData.itemRemarks ?? initialData.notes ?? '',
        notes: initialData.notes ?? initialData.itemRemarks ?? ''
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
              itemRemarks: '',
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
    const matchingGRNs = (safeGrns || []).filter((g) => ledgerRowLink({
      itemId: g.itemId,
      stockItemId: g.stockItemId,
      masterItemId: g.masterItemId,
      itemCode: g.itemCode,
      itemName: g.itemName
    }, selectedInvItem).include);

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
        const matchingRolls = (inventoryRolls || []).filter(r => 
          (r.grnNo && g.grnNo && r.grnNo === g.grnNo) ||
          (r.grn_no && g.grnNo && r.grn_no === g.grnNo)
        );

        let gBarcode = '';
        if (matchingRolls.length > 0) {
          gBarcode = matchingRolls.map(r => r.barcodeId || r.id).filter(Boolean).join(', ');
        } else if (Array.isArray(g.itemsBreakdown) && g.itemsBreakdown.some(b => b.barcodeId)) {
          gBarcode = g.itemsBreakdown.map(b => b.barcodeId).filter(Boolean).join(', ');
        } else if (Array.isArray(g.barcodes) && g.barcodes.length > 0) {
          gBarcode = g.barcodes.join(', ');
        } else if (g.barcodeId) {
          gBarcode = g.barcodeId;
        } else {
          gBarcode = g.batchNo || `BAR-GRN-${g.grnNo}`;
        }

        batches.push({
          id: batchKey,
          batchNo: g.batchNo || `GRN-${g.grnNo}`,
          grnNo: g.grnNo || g.id,
          vendorName: g.vendorName || 'Supplier',
          purchaseRate: rateVal,
          availableQty: Number(g.netWeightKg || 0),
          unit: g.unit || selectedInvItem.unit || 'Kg',
          date: g.receivedDate || '',
          barcode: gBarcode,
          label: `GRN #${g.grnNo} • Barcode: ${gBarcode} • Batch: ${g.batchNo || 'Main Lot'} • Supplier: ${g.vendorName || 'Vendor'} • Inward Qty: ${g.netWeightKg || 0} ${g.unit || 'Kg'} • Rate: ₹${rateVal}/${g.unit || 'Kg'}`
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

    // Sort batches strictly by FIFO (oldest inward date first) and append FIFO badges
    const sorted = sortBatchesByFifo(batches);
    return sorted.map((b, idx) => ({
      ...b,
      label: idx === 0 ? `🌟 [FIFO CONSUME FIRST] ${b.label}` : b.label
    }));
  }, [selectedInvItem, safeGrns, inventoryRolls]);


  // Ledger Modal Pagination State
  const [ledgerCurrentPage, setLedgerCurrentPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(50);

  const isAdmin = !currentUser || anyAssignedRole(currentUser, (_role, lower) => lower === 'admin' || lower === 'superadmin');

  // PO Directory State
  const [selectedPOForPDF, setSelectedPOForPDF] = useState(null);
  const [poSearchTerm, setPoSearchTerm] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('ALL');

  // GRN Inward History Search & Filter State
  const [grnSearchTerm, setGrnSearchTerm] = useState('');
  const [grnVendorFilter, setGrnVendorFilter] = useState('ALL');
  const [grnStartDate, setGrnStartDate] = useState('');
  const [grnEndDate, setGrnEndDate] = useState('');
  const [grnStatusFilter, setGrnStatusFilter] = useState('ALL');
  const [grnSortBy, setGrnSortBy] = useState('DATE_DESC');

  // Discrepancy Resolution Modal State (Admin Only)
  const [resolvingPoDiscrepancy, setResolvingPoDiscrepancy] = useState(null);
  const [resolutionAction, setResolutionAction] = useState('UPDATE_PO_RATE'); // 'UPDATE_PO_RATE' or 'ENFORCE_PO_RATE'
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [poResolutions, setPoResolutions] = useState({});

  // Unified Platform-wide Issued Purchase Orders Aggregator
  const unifiedIssuedPOs = React.useMemo(() => {
    const list = [];
    const seenPoNumbers = new Set();

    const propList = Array.isArray(purchaseOrders) ? purchaseOrders : [];
    propList.forEach(po => {
      if (po && po.poNumber && !seenPoNumbers.has(po.poNumber)) {
        seenPoNumbers.add(po.poNumber);
        list.push({
          ...po,
          source: po.source || 'Purchase Order Module'
        });
      }
    });

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
              poDate: ord.date || new Date().toISOString().split('T')[0],
              promisedDeliveryDate: ord.targetDeliveryDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
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
            poDate: ind.date || new Date().toISOString().split('T')[0],
            promisedDeliveryDate: ind.promisedDeliveryDate || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
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

      // Enhanced Discrepancy & Variation Detection across Rate, Quantity, Item Name, and Remarks
      let rateVariations = [];
      let qtyVariations = [];
      let itemVariations = [];
      let variationNotesList = [];
      let priceDiscrepancy = null;
      let historicalMismatch = null;
      const resolvedInfo = poResolutions[po.poNumber] || po.priceDiscrepancyResolution || null;

      matchingGRNs.forEach(g => {
        const grnRate = parseFloat(g.purchaseRatePerKg || g.purchaseRate || g.unitPrice) || 0;
        const grnQty = parseFloat(g.netWeightKg || g.receivedQtyKg || g.quantity) || 0;
        const grnItemName = (g.itemName || '').trim();
        const firstPoItem = (po.items || [])[0] || {};
        const poRate = parseFloat(g.agreedPoRate || firstPoItem.rate) || 0;
        const poItemName = (g.originalPoItemName || firstPoItem.itemDesc || firstPoItem.itemName || '').trim();
        const poItemOrderedQty = parseFloat(g.orderedPoQtyKg || firstPoItem.qtyKg || totalPoQty) || 0;

        // 1. Rate variation check
        if (grnRate > 0 && poRate > 0 && Math.abs(grnRate - poRate) > 0.05) {
          rateVariations.push({
            grnNo: g.grnNo || g.grnNumber,
            poRate,
            grnRate,
            variance: grnRate - poRate,
            variancePct: ((grnRate - poRate) / poRate * 100).toFixed(1)
          });
        }

        // 2. Quantity variation check
        if (g.variations?.hasQtyVariation || (poItemOrderedQty > 0 && grnQty > 0 && Math.abs(grnQty - poItemOrderedQty) > 0.1)) {
          const qVariance = g.variations?.qtyVariance !== undefined ? g.variations.qtyVariance : (grnQty - poItemOrderedQty);
          qtyVariations.push({
            grnNo: g.grnNo || g.grnNumber,
            orderedQty: poItemOrderedQty,
            receivedQty: grnQty,
            variance: qVariance,
            variancePct: poItemOrderedQty > 0 ? ((qVariance / poItemOrderedQty) * 100).toFixed(1) : '0.0',
            isShort: qVariance < 0
          });
        }

        // 3. Item Name variation check
        if (g.variations?.hasItemVariation || (poItemName && grnItemName && poItemName.toLowerCase() !== grnItemName.toLowerCase())) {
          itemVariations.push({
            grnNo: g.grnNo || g.grnNumber,
            poItemName: g.variations?.poItemName || poItemName,
            inwardItemName: g.variations?.inwardItemName || grnItemName
          });
        }

        // 4. Variation Notes / Remarks
        const note = g.variations?.variationReason || g.itemRemarks || g.remarks || g.notes;
        if (note && note.trim() && !note.toLowerCase().includes('inward grn issued directly') && !note.toLowerCase().includes('inward grn created directly')) {
          variationNotesList.push({ grnNo: g.grnNo || g.grnNumber, note: note.trim() });
        }
      });

      // Overall PO Quantity Variance check if goods arrived
      if (matchingGRNs.length > 0 && totalPoQty > 0 && totalInwardQty > 0 && Math.abs(totalInwardQty - totalPoQty) > 0.1 && qtyVariations.length === 0) {
        const netDiff = totalInwardQty - totalPoQty;
        qtyVariations.push({
          grnNo: matchingGRNs.map(g => g.grnNo || g.grnNumber).join(', '),
          orderedQty: totalPoQty,
          receivedQty: totalInwardQty,
          variance: netDiff,
          variancePct: ((netDiff / totalPoQty) * 100).toFixed(1),
          isShort: netDiff < 0
        });
      }

      if (rateVariations.length > 0) {
        const primary = rateVariations[0];
        const mismatchData = {
          poRate: primary.poRate,
          grnRate: primary.grnRate,
          variance: primary.variance,
          grnNo: primary.grnNo,
          message: `⚠️ Rate Mismatch: PO Rate ₹${primary.poRate}/kg vs Inward GRN Rate ₹${primary.grnRate}/kg (${primary.variance > 0 ? '+' : ''}₹${primary.variance.toFixed(2)} variance)`
        };
        historicalMismatch = mismatchData;
        if (!resolvedInfo) {
          priceDiscrepancy = mismatchData;
        }
      }

      const hasAnyVariation = rateVariations.length > 0 || qtyVariations.length > 0 || itemVariations.length > 0;

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
        rateVariations,
        qtyVariations,
        itemVariations,
        variationNotesList,
        hasAnyVariation,
        priceDiscrepancy,
        historicalMismatch,
        priceDiscrepancyResolution: resolvedInfo
      };
    });
  }, [purchaseOrders, orders, indents, grns, vendors, poResolutions]);

  // Helper to normalize strings for robust vendor comparison
  const normalizeVendorStr = (str) => String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // Helper to check if a PO belongs to a specific vendor
  const isPoVendorMatch = (po, targetVendorStr) => {
    if (!targetVendorStr || !po) return false;
    const target = normalizeVendorStr(targetVendorStr);
    const poName = normalizeVendorStr(po.vendorName || po.vendor?.companyName || po.vendor?.name);
    if (poName && (poName === target || poName.includes(target) || target.includes(poName))) {
      return true;
    }
    const matchedVendorObj = (vendors || []).find(v => 
      normalizeVendorStr(v.companyName || v.name) === target || 
      (v.id && String(v.id).trim().toLowerCase() === target)
    );
    if (matchedVendorObj) {
      const vId = String(matchedVendorObj.id || '').trim().toLowerCase();
      const poVId = String(po.vendorId || po.vendor?.id || '').trim().toLowerCase();
      if (vId && poVId && vId === poVId) return true;
      const vComp = normalizeVendorStr(matchedVendorObj.companyName);
      if (vComp && poName && (poName === vComp || poName.includes(vComp) || vComp.includes(poName))) {
        return true;
      }
    }
    return false;
  };

  // Helper to determine live PO GRN receipt status (matching PurchaseOrderManagement)
  const getPoDeliveryInfo = (po) => {
    if (!po) return { status: 'Unknown', inwardQty: 0, totalQty: 0, pendingQty: 0 };
    if (String(po.status || '').toLowerCase() === 'cancelled') {
      return { status: 'Cancelled', inwardQty: 0, totalQty: 0, pendingQty: 0 };
    }

    const matchingGRNs = (grns || []).filter(g => 
      g && String(g.poNumber || '').trim().toLowerCase() === String(po.poNumber || '').trim().toLowerCase()
    );

    const inwardQty = matchingGRNs.reduce((sum, g) => 
      sum + (parseFloat(g.netWeightKg) || parseFloat(g.receivedQtyKg) || parseFloat(g.quantity) || 0), 0
    );

    const totalQty = (po.items || []).reduce((sum, it) => 
      sum + (parseFloat(it.qtyKg) || parseFloat(it.qty) || 0), 0
    );

    const pendingQty = Math.max(0, totalQty - inwardQty);

    let status = 'Awaiting Delivery';
    if (totalQty > 0 && inwardQty >= totalQty) {
      status = 'Fully Received';
    } else if (inwardQty > 0) {
      status = 'Partially Received';
    } else {
      status = 'Awaiting Delivery';
    }

    return { status, inwardQty, totalQty, pendingQty, matchingGRNs };
  };

  // Live memoized list of active POs for the selected vendor awaiting delivery
  const vendorActivePOs = useMemo(() => {
    if (!grnVendor || !grnVendor.trim()) return [];
    
    return (unifiedIssuedPOs || []).filter(po => {
      if (!po || !po.poNumber) return false;
      if (!isPoVendorMatch(po, grnVendor)) return false;

      const info = getPoDeliveryInfo(po);
      if (info.status === 'Cancelled' || info.status === 'Fully Received') return false;

      return info.status === 'Awaiting Delivery' || info.status === 'Partially Received';
    });
  }, [unifiedIssuedPOs, grnVendor, grns, vendors]);

  const grnPoSuggestions = (!grnVendor || poSuggestionDismissed || isManualPoEntry || grnPoApplied)
    ? []
    : vendorActivePOs.map((po) => describePoForSuggestion(po, getPoDeliveryInfo(po)));
  const showGrnPoSuggestion = grnPoSuggestions.length > 0;

  const writePoFilledGrnFields = (fields, { applied }) => {
    const weightKg = fields.weightKg ?? '';
    const lengthMeters = fields.category === 'Film Substrates' && Number(weightKg) > 0
      ? calculateFilmRollLength(weightKg, fields.widthMm, fields.micron, fields.filmType)
      : '';
    setGrnPoNo(fields.poNumber);
    setGrnCategory(fields.category);
    setGrnPurchaseRate(fields.purchaseRate);
    setGrnFilmType(fields.filmType);
    setGrnMicron(fields.micron);
    setGrnWidthMm(fields.widthMm);
    setGrnItemName(fields.itemName);
    setGrnItemSearchTerm(fields.itemSearchTerm);
    setGrnSelectedStockItemId(fields.stockItemId);
    setGrnWeightKg(weightKg);
    setGrnRolls('1');
    setGrnItemsList([{
      id: `item-${Date.now()}-1`,
      grossWeightKg: weightKg,
      tareWeightKg: grnDefaultTare || 0,
      netWeightKg: weightKg,
      lengthMeters,
      vendorRollNo: '',
      notes: ''
    }]);
    setGrnPoApplied(applied);
    setIsGrnItemDropdownOpen(false);
  };

  const clearPoFilledGrnFields = () => {
    writePoFilledGrnFields(blankPoFilledGrnFields(), { applied: false });
  };

  const applyConfirmedPoFields = (fields) => {
    setIsManualPoEntry(false);
    writePoFilledGrnFields(fields, { applied: true });
  };

  // Vendor choice only suggests open POs. The receipt stays editable and empty.
  const handleGrnVendorChange = (nextVendor) => {
    if (nextVendor === '__CREATE_NEW__') {
      setIsVendorModalOpen(true);
      return;
    }
    if (nextVendor === grnVendor) return;
    const vendorPlan = planVendorPick((unifiedIssuedPOs || []).filter((po) => {
      if (!po || !po.poNumber || !isPoVendorMatch(po, nextVendor)) return false;
      const info = getPoDeliveryInfo(po);
      return info.status === 'Awaiting Delivery' || info.status === 'Partially Received';
    }).map((po) => po.poNumber));
    setGrnVendor(nextVendor);
    setIsManualPoEntry(false);
    setPoSuggestionDismissed(false);
    if (grnPoApplied) clearPoFilledGrnFields();
    else setGrnPoNo('');
    if (vendorPlan.fillForm && vendorPlan.suggestedPoNumbers[0]) {
      handleSelectPoForGrn(vendorPlan.suggestedPoNumbers[0]);
    }
  };

  const enterManualPoEntry = () => {
    setIsManualPoEntry(true);
    setPoSuggestionDismissed(true);
    if (grnPoApplied) clearPoFilledGrnFields();
    else setGrnPoNo('');
    setTimeout(() => document.getElementById('grn-po-manual')?.focus(), 0);
  };

  const dismissPoSuggestion = () => {
    setPoSuggestionDismissed(true);
  };

  // Explicit PO confirm fills the form. Changing or clearing that PO drops the fields it wrote.
  const handleSelectPoForGrn = (selectedPoNumber) => {
    const plan = planPoSelection(selectedPoNumber);
    if (plan.action === 'manual') {
      enterManualPoEntry();
      return;
    }
    if (plan.action === 'clear') {
      if (grnPoApplied) clearPoFilledGrnFields();
      else setGrnPoNo('');
      return;
    }
    if (grnPoApplied && grnPoNo === plan.poNumber) return;

    const targetPo = (vendorActivePOs || []).find(p => p && p.poNumber === plan.poNumber) ||
                     (unifiedIssuedPOs || []).find(p => p && p.poNumber === plan.poNumber);
    if (!targetPo) {
      if (grnPoApplied) clearPoFilledGrnFields();
      setGrnPoNo(plan.poNumber);
      setGrnPoApplied(false);
      return;
    }

    const firstItem = (targetPo.items || [])[0];
    const fields = grnFieldsFromPo(targetPo, {
      pendingQty: getPoDeliveryInfo(targetPo).pendingQty,
      filmStockId: filmStockIdForPoItem(inventory, firstItem),
      formatFilmItemName
    });
    applyConfirmedPoFields(fields);
  };

  const confirmSuggestedPo = (poNumber) => {
    handleSelectPoForGrn(poNumber);
    setTimeout(() => document.getElementById('grn-vendor-invoice')?.focus(), 0);
  };

  const handleConfirmResolveDiscrepancy = async () => {
    if (!resolvingPoDiscrepancy) return;
    const po = resolvingPoDiscrepancy;
    const mismatch = po.priceDiscrepancy || po.historicalMismatch || {};
    const adminUser = currentUser?.name || 'Administrator';
    const resolvedAt = new Date().toISOString();

    const resolutionObj = {
      id: po.poNumber,
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

    // 1. Update poResolutions state & safeLocalStorage & Supabase
    const updatedResolutions = {
      ...poResolutions,
      [po.poNumber]: resolutionObj
    };
    try {
      await replacePayloadRecords(supabase, 'po_discrepancy_resolutions', Object.values(updatedResolutions));
      setPoResolutions(updatedResolutions);
    } catch (err) {
      alert(`The discrepancy resolution was not saved: ${describeSaveError(err)}`);
      return;
    }
    if (typeof window !== 'undefined' && window.__samyakBroadcastSync) {
      window.__samyakBroadcastSync('system_settings');
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

  const handleSaveSFGFG = (inventoryItem, rolls, prodLink) => {
    // 1. Add / Update Inventory item
    if (onSaveInventoryItem) {
      onSaveInventoryItem(inventoryItem);
    } else if (onUpdateInventory) {
      onUpdateInventory([inventoryItem, ...(inventory || [])]);
    }

    // 2. Add each roll to inventoryRolls (and sync to Supabase)
    if (Array.isArray(rolls)) {
      rolls.forEach(r => {
        if (onAddRoll) {
          onAddRoll(r);
        }
      });
    }

    // 3. Link to Production Record
    if (prodLink && prodLink.orderId && onSaveProductionRecord) {
      const existingRecord = (productionRecords || []).find(pr => String(pr.orderId) === String(prodLink.orderId) || String(pr.id) === String(prodLink.orderId));
      
      const existingRolls = existingRecord?.outputRolls || [];
      const updatedRolls = [...existingRolls, ...(rolls || [])];
      const totalOutputKg = updatedRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);

      const updatedRecord = {
        ...(existingRecord || {
          id: `PROD-${prodLink.orderId}-${Date.now().toString().slice(-4)}`,
          orderId: prodLink.orderId,
          jobName: prodLink.jobName,
          jobCode: prodLink.jobCode,
          operatorName: prodLink.operatorName,
          shift: prodLink.shift,
          productionDate: prodLink.productionDate,
          status: 'In Progress',
          machineName: prodLink.machineName
        }),
        outputRolls: updatedRolls,
        actualOutputKg: totalOutputKg,
        netUsableKg: totalOutputKg,
        lastUpdated: new Date().toISOString()
      };

      onSaveProductionRecord(updatedRecord);
    }

    // 4. Open Barcode Printer Modal for all rolls
    setSelectedRollForBarcodeModal(rolls);
    setIsSfgFgModalOpen(false);
  };

  const handleCreateGRNFromPO = (po) => {
    if (!po) return;
    const firstItem = (po.items || [])[0] || {};
    const poQty = po.pendingInwardQty > 0 ? po.pendingInwardQty : (firstItem.qtyKg || 1000);
    const linked = findInventoryItemById(inventory, firstItem.itemId || firstItem.stockItemId || '');
    const linkedActive = linked && isInventoryItemActive(linked) ? linked : null;
    const filmTypeVal = linkedActive?.filmType || firstItem.filmType || 'PET';
    const micronVal = linkedActive && linkedActive.micron !== undefined && linkedActive.micron !== '-'
      ? linkedActive.micron
      : (firstItem.micron || 12);
    const widthVal = linkedActive && linkedActive.widthMm !== undefined && linkedActive.widthMm !== '-'
      ? linkedActive.widthMm
      : (firstItem.widthMm || 1000);
    const categoryVal = linkedActive?.category || po.category || 'Film Substrates';
    
    setGrnPoNo(po.poNumber || '');
    setGrnVendor(po.vendor?.companyName || po.vendorName || po.vendor?.name || '');
    setGrnCategory(categoryVal);
    setGrnFilmType(filmTypeVal);
    setGrnMicron(micronVal);
    setGrnWidthMm(widthVal);
    setGrnWeightKg(''); // Weight must be added by user as requested
    setGrnPurchaseRate(firstItem.rate || 140);
    
    const generatedTitle = categoryVal === 'Film Substrates'
      ? formatFilmItemName(filmTypeVal, widthVal, micronVal)
      : (linkedActive?.itemName || firstItem.itemDesc || firstItem.description || `${categoryVal} Inward Item`).replace(/µ/g, 'Micron');
    setGrnItemName(generatedTitle);
    setGrnItemSearchTerm(generatedTitle);
    setGrnSelectedStockItemId(linkedActive ? String(linkedActive.id) : filmStockIdForPoItem(inventory, firstItem));
    setGrnRolls('1');
    setIsManualPoEntry(false);
    setPoSuggestionDismissed(false);
    setGrnPoApplied(true);
    
    // Weight must be entered by user, not pre-filled
    setGrnItemsList([
      {
        id: `item-${Date.now()}-1`,
        grossWeightKg: '',
        tareWeightKg: grnDefaultTare || 0,
        netWeightKg: '',
        lengthMeters: 0,
        vendorRollNo: '',
        notes: ''
      }
    ]);
    
    const freshLineId = `line-${Date.now()}`;
    setSavedGrnLines([]);
    setActiveGrnLineKey(freshLineId);
    setGrnLineOrder([freshLineId]);
    setActiveTab('grn_inward');
    setIsNewGRNModalOpen(true);
  };

  const handleSelectStockItemForGrn = (item) => {
    if (!item) return;
    const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
    const mPct = item.metallocenePct || item.metallocene_pct || '';
    setGrnMetallocenePct(mPct);
    const title = isFilm
      ? formatFilmItemName(item.filmType, item.widthMm, item.micron, item.itemName, mPct)
      : (item.itemName ? item.itemName.replace(/µ/g, 'Micron') : `${item.category || 'Stock'} Item`);
    
    const master = preferMasterItem(item.subItems?.length ? item.subItems : [item]);
    setGrnSelectedStockItemId(master?.id || item.primaryId || item.id);
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
    setEditingGrn(null);
    const freshLineId = `line-${Date.now()}`;
    setSavedGrnLines([]);
    setActiveGrnLineKey(freshLineId);
    setGrnLineOrder([freshLineId]);
    setIsNewGRNModalOpen(true);
    setIsManualPoEntry(false);
    setPoSuggestionDismissed(false);
    setGrnPoApplied(false);
    setGrnVendor('');
    setGrnPoNo('');
    setGrnCategory('');
    setGrnItemName('');
    setGrnItemSearchTerm('');
    setGrnSelectedStockItemId('');
    setGrnMicron('');
    setGrnWidthMm('');
    setIsGrnItemDropdownOpen(false);
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
    }
  };

  const filteredStockItemsForGrn = (groupedInventory || []).filter(item => {
    const subs = item.subItems || [item];
    if (subs.every((sub) => !isInventoryItemActive(sub))) return false;
    const term = (grnItemSearchTerm || '').toLowerCase().trim();
    const title = (item.itemName || `${item.filmType || ''} ${item.micron || ''} ${item.widthMm || ''}`).toLowerCase();
    const code = String(item.itemCode || item.primaryId || item.id || '').toLowerCase();
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
  const [editSubstrateOrGrade, setEditSubstrateOrGrade] = useState('PET');
  const [editItemCode, setEditItemCode] = useState('');
  const [editUnit, setEditUnit] = useState('Kg');
  const [editFilmType, setEditFilmType] = useState('PET');
  const [editMetallocenePct, setEditMetallocenePct] = useState('');
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
    const newId = nextInventoryId(safeInventory);
    setEditingStockItem({ id: newId, isNew: true });
    setEditCategory('Film Substrates');
    setEditItemName('');
    setEditSubstrateOrGrade('PET');
    setEditItemCode(newId);
    setEditUnit('Kg');
    setEditFilmType('PET');
    setEditMetallocenePct('');
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
    
    const subOrGrade = item.substrateOrGrade || item.substrateGrade || item.filmType || item.grade || item.subType || (isFilm ? 'PET' : '');
    setEditSubstrateOrGrade(subOrGrade);
    
    const mPct = item.metallocenePct || item.metallocene_pct || '';
    setEditMetallocenePct(mPct);

    // Pre-fill Item Name
    const defaultName = isFilm 
      ? formatFilmItemName(subOrGrade, item.widthMm, item.micron, item.itemName, mPct)
      : (item.itemName || subOrGrade || `${category} Stock Item`);
    setEditItemName(item.itemName || defaultName);
    
    // Pre-fill Item Code / SKU
    setEditItemCode(item.itemCode || item.primaryId || item.id || '');
    
    // Pre-fill Unit
    const fallbackUnit = isFilm ? 'Kg' : (
      category === 'Chemicals & Solvents' ? 'Litres' : 
      category === 'Doctor Blades & Wipers' ? 'Meters' : 
      category === 'Tapes & Consumables' ? 'Rolls' : 
      category === 'Safety Gear (PPE)' ? 'Boxes' : 
      category === 'Machine Spare Parts' ? 'Nos' : 'Kg'
    );
    const normalizedUom = item.unit ? (item.unit === 'Boxes / Cartons' ? 'Boxes' : item.unit) : fallbackUnit;
    setEditUnit(normalizedUom);
    
    // Pre-fill Film / Sub-type attributes
    const initialFilmType = item.filmType || (subOrGrade && FILM_DENSITIES[subOrGrade] ? subOrGrade : 'PET');
    setEditFilmType(initialFilmType);
    setEditMicron(item.micron && item.micron !== '-' ? item.micron : (isFilm ? 12 : ''));
    setEditWidthMm(item.widthMm && item.widthMm !== '-' ? item.widthMm : (isFilm ? 1000 : ''));
    setEditSubType(subOrGrade || (item.filmType && !FILM_DENSITIES[item.filmType] ? item.filmType : ''));
    setEditDimensions(item.dimensions || (item.widthMm && item.widthMm !== '-' && !isFilm ? `${item.widthMm}mm` : ''));
    
    // Pre-fill Quantities & Thresholds
    setEditAvailableQty(item.availableQtyKg ?? item.availableWeightKg ?? 0);
    setEditAllocatedQty(item.allocatedQtyKg ?? 0);
    setEditUnitPrice(item.unitPrice ?? item.purchaseRatePerKg ?? 0);
    setEditReorderLevel(item.reorderLevelKg ?? 100);
    
    // Pre-fill Location & Vendor Logistics
    setEditLocation(item.location || item.locationBay || '');
    setEditLastVendor(item.lastVendor || item.vendorName || Array.from(item.allVendors || [])[0] || '');
    setEditLastBatch(item.lastBatch || item.batchNo || Array.from(item.allBatches || [])[0] || '');
  };

  const handleCategoryChangeInEdit = (newCategory) => {
    setEditCategory(newCategory);
    if (newCategory === 'Film Substrates') {
      if (!editFilmType || !FILM_DENSITIES[editFilmType]) setEditFilmType('PET');
      setEditSubstrateOrGrade(editFilmType || 'PET');
      if (!editMicron || editMicron === '-') setEditMicron(12);
      if (!editWidthMm || editWidthMm === '-') setEditWidthMm(1000);
      setEditUnit('Kg');
    } else {
      if (!editSubstrateOrGrade || FILM_DENSITIES[editSubstrateOrGrade]) {
        setEditSubstrateOrGrade(editSubType || '');
      }
      setEditMetallocenePct('');
      if (newCategory === 'Chemicals & Solvents' && editUnit === 'Kg') setEditUnit('Litres');
      else if (newCategory === 'Doctor Blades & Wipers' && editUnit === 'Kg') setEditUnit('Meters');
      else if (newCategory === 'Tapes & Consumables' && editUnit === 'Kg') setEditUnit('Rolls');
      else if (newCategory === 'Safety Gear (PPE)' && editUnit === 'Kg') setEditUnit('Boxes');
      else if (newCategory === 'Machine Spare Parts' && editUnit === 'Kg') setEditUnit('Nos');
    }
  };

  const handleSaveStockEdit = async (e) => {
    e.preventDefault();
    if (!editingStockItem) return;

    const isFilm = editCategory === 'Film Substrates';
    const finalSubstrateOrGrade = isFilm 
      ? (editFilmType || editSubstrateOrGrade || 'PET') 
      : (editSubstrateOrGrade.trim() || editSubType.trim() || '');
    const mPct = (isFilm && isMetalloceneEligibleFilm(finalSubstrateOrGrade)) ? editMetallocenePct : '';

    const defaultGeneratedName = isFilm
      ? formatFilmItemName(finalSubstrateOrGrade, editWidthMm, editMicron, '', mPct)
      : `${editCategory} - ${finalSubstrateOrGrade || 'Item'}`;
    const finalItemName = isFilm
      ? formatFilmItemName(finalSubstrateOrGrade, editWidthMm, editMicron, '', mPct)
      : (editItemName.trim().replace(/µ/g, 'Micron') || defaultGeneratedName);
    const rateVal = parseFloat(editUnitPrice) || 0;
    const availQty = parseFloat(editAvailableQty) || 0;
    const valuation = Number((availQty * rateVal).toFixed(2));

    const targetId = editingStockItem.primaryId || editingStockItem.id || (editingStockItem.subItems && editingStockItem.subItems[0]?.id) || nextInventoryId(inventory);

    const cleanItemPayload = {
      id: String(targetId),
      itemCode: editItemCode.trim() || String(targetId),
      category: editCategory,
      itemName: finalItemName,
      substrateOrGrade: finalSubstrateOrGrade,
      filmType: isFilm ? finalSubstrateOrGrade : (editSubType.trim() || finalSubstrateOrGrade),
      grade: finalSubstrateOrGrade,
      subType: editSubType.trim() || finalSubstrateOrGrade,
      unit: editUnit,
      dimensions: !isFilm ? editDimensions.trim() : '',
      micron: isFilm ? (parseFloat(editMicron) || 12) : '-',
      widthMm: isFilm ? (parseFloat(editWidthMm) || 1000) : (editDimensions.trim() ? editDimensions.replace(/[^\d.]/g, '') || '-' : '-'),
      metallocenePct: mPct,
      metallocene_pct: mPct,
      density: isFilm ? (FILM_DENSITIES[finalSubstrateOrGrade] || 1.0) : 1.0,
      availableQtyKg: availQty,
      allocatedQtyKg: parseFloat(editAllocatedQty) || 0,
      unitPrice: rateVal,
      purchaseRatePerKg: rateVal,
      purchaseValuation: valuation,
      location: editLocation.trim() || 'Store Bay',
      reorderLevelKg: parseFloat(editReorderLevel) || 0,
      lastVendor: editLastVendor.trim() || '',
      lastBatch: editLastBatch.trim() || '',
      lastUpdated: new Date().toISOString()
    };

    if (editingStockItem.isNew) {
      const plan = planManualStockSave(inventory, cleanItemPayload, { confirmAdd: false });
      if (plan.action === 'duplicate') {
        const where = plan.existing.location ? ` at ${plan.existing.location}` : '';
        const addToExisting = window.confirm(
          `${plan.existing.itemName} already exists as ${plan.existing.id} (${plan.existing.availableQtyKg || 0} kg${where}).\n\nAdd this quantity to ${plan.existing.id} instead of creating a duplicate?`
        );
        if (!addToExisting) {
          alert(`Duplicate stock item was not created. Add the quantity to ${plan.existing.id}.`);
          return;
        }
        const adding = planManualStockSave(inventory, cleanItemPayload, { confirmAdd: true });
        if (onSaveInventoryItem) {
          await onSaveInventoryItem(adding.item);
        } else if (onUpdateInventory) {
          const updatedInv = inventory.map((item) => String(item.id) === String(adding.item.id) ? adding.item : item);
          onUpdateInventory(updatedInv);
        }
        setEditingStockItem(null);
        alert(`Added ${cleanItemPayload.availableQtyKg} kg to ${adding.item.id} (${adding.item.itemName}). Location stays ${adding.item.location || 'unchanged'}.`);
        return;
      }
    }

    // If editing a grouped item with multiple underlying raw items in subItems, consolidate into single master record
    const consolidationFailures = [];
    if (editingStockItem.subItems && editingStockItem.subItems.length > 1 && onDeleteInventoryItem) {
      const secondaryItems = editingStockItem.subItems.slice(1);
      for (const sec of secondaryItems) {
        if (sec.id && String(sec.id) !== String(targetId)) {
          try {
            await onDeleteInventoryItem(sec.id);
          } catch (err) {
            consolidationFailures.push(`${sec.id} (${err.message || err})`);
          }
        }
      }
    }

    if (onSaveInventoryItem) {
      await onSaveInventoryItem(cleanItemPayload);
    } else if (onUpdateInventory) {
      const updatedInv = inventory.map(item => String(item.id) === String(targetId) ? cleanItemPayload : item);
      onUpdateInventory(updatedInv);
    }

    const actionText = editingStockItem.isNew ? 'created' : 'updated';
    setEditingStockItem(null);
    if (consolidationFailures.length > 0) {
      alert(`Stock item ${targetId} (${finalItemName}) was ${actionText}, but these duplicate stock rows were NOT removed and are still listed: ${consolidationFailures.join('; ')}.`);
      return;
    }
    alert(`Stock item ${targetId} (${finalItemName}) ${actionText} successfully!`);
  };

  const stockItemIds = (item) => {
    const ids = item?.allInventoryIds?.length ? item.allInventoryIds : [item?.id];
    return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  };

  const stockItemLabel = (item) => item?.itemName || `${item?.filmType || 'Item'} ${item?.micron && item.micron !== '-' ? `${item.micron} Micron` : ''}`.trim();

  const rememberDeletedBarcodes = (rows) => {
    setDeletedBarcodes((prev) => {
      const map = new Map((prev || []).map((row) => [`${row.sourceModule}|${String(row.barcode).toLowerCase()}`, row]));
      (rows || []).forEach((row) => {
        if (!row?.barcode) return;
        map.set(`${row.sourceModule}|${String(row.barcode).toLowerCase()}`, { ...row, status: row.status || 'Deleted' });
      });
      return [...map.values()];
    });
  };

  const openDeletePrompt = async (ids, label) => {
    const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!unique.length) return;
    setDeletePrompt({ ids: unique, label, preview: null, reason: '', error: '', busy: true });
    try {
      const preview = await previewInventoryItemDelete(unique);
      const selectedBarcodes = (preview?.items || []).flatMap((item) => (item.rolls || []).map((roll) => roll.barcode)).filter(Boolean);
      setDeletePrompt((prev) => (prev && prev.ids.join() === unique.join() ? { ...prev, preview, selectedBarcodes, busy: false } : prev));
    } catch (err) {
      setDeletePrompt(null);
      alert(`Could not prepare this delete: ${describeSaveError(err)}`);
    }
  };

  const handleDeleteStockItem = (item) => {
    if (!item || !item.id) return;
    const subs = item.subItems || [item];
    if (subs.every((sub) => !isInventoryItemActive(sub))) {
      setDeletePrompt({
        ids: stockItemIds(item),
        label: stockItemLabel(item),
        preview: { mode: 'reactivate' },
        reason: '',
        error: '',
        busy: false,
        selectedBarcodes: []
      });
      return;
    }
    openDeletePrompt(stockItemIds(item), stockItemLabel(item));
  };

  const handleDeleteSelectedStock = () => {
    const ids = [...selectedStockIds];
    if (!ids.length) return;
    openDeletePrompt(ids, `${ids.length} selected stock item${ids.length === 1 ? '' : 's'}`);
  };

  const toggleStockSelection = (ids, checked) => {
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) next.add(String(id));
        else next.delete(String(id));
      });
      return next;
    });
  };

  const confirmDeleteStockItems = async (event) => {
    event.preventDefault();
    if (!deletePrompt || deletePrompt.busy) return;
    const reason = deletePrompt.reason.trim();
    if (!reason) {
      setDeletePrompt((prev) => prev ? { ...prev, error: 'Enter a reason. It is stored with the audit log.' } : prev);
      return;
    }
    const mode = deletePrompt.preview?.mode || 'delete';
    setDeletePrompt((prev) => prev ? { ...prev, busy: true, error: '' } : prev);
    try {
      let result = null;
      if (mode === 'reactivate') {
        if (!onReactivateInventoryItems) throw new Error('Reactivating a stock item is not available.');
        result = await onReactivateInventoryItems(deletePrompt.ids, reason);
      } else if (mode === 'write_off') {
        if (!onWriteOffInventoryItems) throw new Error('Writing off stock is not available.');
        const allBarcodes = (deletePrompt.preview?.items || []).flatMap((item) => (item.rolls || []).map((roll) => roll.barcode)).filter(Boolean);
        const chosen = (deletePrompt.selectedBarcodes || allBarcodes).filter(Boolean);
        if (allBarcodes.length && !chosen.length) {
          setDeletePrompt((prev) => prev ? { ...prev, busy: false, error: 'Select at least one roll to write off, or leave them all selected to write off the remaining stock and archive.' } : prev);
          return;
        }
        const archive = !allBarcodes.length || chosen.length === allBarcodes.length;
        result = await onWriteOffInventoryItems(deletePrompt.ids, reason, archive ? null : chosen, archive);
        const writtenRolls = (deletePrompt.preview?.items || []).flatMap((item) => (item.rolls || [])
          .filter((roll) => archive || chosen.includes(roll.barcode))
          .map((roll) => ({
            id: `WO-${item.itemId}-${roll.barcode}`,
            itemId: item.itemId,
            itemCode: item.itemCode || item.itemId,
            itemName: item.itemName,
            qtyKg: -Math.abs(Number(roll.kg) || 0),
            type: 'Write Off',
            reason,
            barcode: roll.barcode,
            date: new Date().toISOString()
          })));
        if (writtenRolls.length) {
          setStockLedgerAdjustments((prev) => [...writtenRolls, ...(prev || [])]);
        }
      } else if (mode === 'archive') {
        if (!onArchiveInventoryItems) throw new Error('Archiving a stock item is not available.');
        result = await onArchiveInventoryItems(deletePrompt.ids, reason);
      } else {
        if (!onDeleteInventoryItem) throw new Error('Deleting a stock item is not available.');
        result = await onDeleteInventoryItem(deletePrompt.ids, reason);
      }
      if (result?.barcodesMarked?.length) rememberDeletedBarcodes(result.barcodesMarked);
      setSelectedStockIds((prev) => {
        const next = new Set(prev);
        deletePrompt.ids.forEach((id) => next.delete(String(id)));
        return next;
      });
      const label = deletePrompt.label;
      const done = mode === 'reactivate'
        ? `Stock item "${label}" is active again.`
        : mode === 'archive'
          ? `Stock item "${label}" was archived. Its ledger, rolls, and barcodes stay.`
          : mode === 'write_off'
            ? `Remaining stock for "${label}" was written off${(deletePrompt.selectedBarcodes || []).length && (deletePrompt.selectedBarcodes || []).length < ((deletePrompt.preview?.items || []).flatMap((item) => item.rolls || []).length) ? '' : ' and the item was archived'}. Barcodes stay marked Written Off.`
            : `Unused stock item "${label}" was deleted. Nothing else was removed.`;
      setDeletePrompt(null);
      alert(done);
    } catch (err) {
      setDeletePrompt((prev) => prev ? { ...prev, busy: false, error: describeSaveError(err) } : prev);
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

  const lastRecDateStr = (stockLedgerAdjustments && stockLedgerAdjustments[0]?.date) || new Date().toISOString().split('T')[0];
  const isRecDue = isReconciliationDue(lastRecDateStr);

  const captureCurrentGrnLine = () => ({
    id: activeGrnLineKey,
    poLineId: null,
    category: grnCategory,
    itemName: grnItemName,
    filmType: grnFilmType,
    metallocenePct: grnMetallocenePct,
    micron: grnMicron,
    widthMm: grnWidthMm,
    unit: grnUnit,
    packagingType: grnPackagingType,
    purchaseRate: grnPurchaseRate,
    batchNo: grnBatchNo,
    remarks: grnItemRemarks,
    stockItemId: grnSelectedStockItemId,
    itemSearchTerm: grnItemSearchTerm,
    weightKg: grnWeightKg,
    rolls: grnItemsList,
    defaultTare: grnDefaultTare,
    rollsCount: grnRolls
  });

  const applyGrnLineToForm = (line) => {
    if (!line) return;
    setGrnCategory(line.category || '');
    setGrnItemName(line.itemName || '');
    setGrnFilmType(line.filmType || 'PET');
    setGrnMetallocenePct(line.metallocenePct || '');
    setGrnMicron(line.micron ?? '');
    setGrnWidthMm(line.widthMm ?? '');
    setGrnUnit(line.unit || 'Kg');
    setGrnPackagingType(line.packagingType || 'Roll');
    setGrnPurchaseRate(line.purchaseRate ?? '');
    setGrnBatchNo(line.batchNo || '');
    setGrnItemRemarks(line.remarks || '');
    setGrnSelectedStockItemId(line.stockItemId || '');
    setGrnItemSearchTerm(line.itemSearchTerm || line.itemName || '');
    setGrnWeightKg(line.weightKg ?? '');
    setGrnItemsList(Array.isArray(line.rolls) && line.rolls.length > 0 ? line.rolls : [
      { id: `item-${Date.now()}-1`, grossWeightKg: '', tareWeightKg: line.defaultTare || 0, netWeightKg: '', lengthMeters: '', vendorRollNo: '', notes: '' }
    ]);
    setGrnDefaultTare(line.defaultTare || 0);
    setGrnRolls(line.rollsCount || String((line.rolls || []).length || 1));
    setIsGrnItemDropdownOpen(false);
  };

  const blankGrnLineFields = (keepBatch = true) => {
    const freshId = `line-${Date.now()}`;
    setActiveGrnLineKey(freshId);
    setGrnCategory('');
    setGrnItemName('');
    setGrnItemSearchTerm('');
    setGrnSelectedStockItemId('');
    setGrnMicron('');
    setGrnWidthMm('');
    setGrnPurchaseRate('');
    setGrnItemRemarks('');
    setGrnWeightKg('');
    if (!keepBatch) setGrnBatchNo('');
    setGrnItemsList([
      { id: `item-${Date.now()}-1`, grossWeightKg: '', tareWeightKg: grnDefaultTare || 0, netWeightKg: '', lengthMeters: '', vendorRollNo: '', notes: '' }
    ]);
    setGrnRolls('1');
    setIsGrnItemDropdownOpen(false);
    return freshId;
  };

  const handleAddAnotherGrnItem = () => {
    const current = captureCurrentGrnLine();
    const freshId = blankGrnLineFields(true);
    setSavedGrnLines((prev) => [...prev.filter((line) => line.id !== current.id), current]);
    setGrnLineOrder((prev) => {
      const base = prev.includes(current.id) ? prev : [...prev, current.id];
      return [...base.filter((id) => id !== freshId), freshId];
    });
  };

  const handleSwitchGrnLine = (lineId) => {
    if (lineId === activeGrnLineKey) return;
    const current = captureCurrentGrnLine();
    const target = savedGrnLines.find((line) => line.id === lineId);
    if (!target) return;
    setSavedGrnLines((prev) => [...prev.filter((line) => line.id !== lineId && line.id !== current.id), current]);
    applyGrnLineToForm(target);
    setActiveGrnLineKey(target.id);
  };

  const handleDuplicateGrnLine = (lineId) => {
    const current = captureCurrentGrnLine();
    const source = lineId === activeGrnLineKey
      ? current
      : (savedGrnLines.find((line) => line.id === lineId) || current);
    const copyId = `line-${Date.now()}`;
    const copy = {
      ...source,
      id: copyId,
      rolls: (source.rolls || []).map((roll, index) => ({
        ...roll,
        id: `item-${copyId}-${index + 1}`
      }))
    };
    setSavedGrnLines((prev) => [
      ...prev.filter((line) => line.id !== current.id && line.id !== copyId),
      current
    ]);
    applyGrnLineToForm(copy);
    setActiveGrnLineKey(copyId);
    setGrnLineOrder((prev) => {
      const base = (prev.includes(current.id) ? prev : [...prev, current.id]).filter((id) => id !== copyId);
      const at = base.indexOf(lineId);
      if (at === -1) return [...base, copyId];
      return [...base.slice(0, at + 1), copyId, ...base.slice(at + 1)];
    });
  };

  const handleRemoveGrnLine = (lineId) => {
    const line = lineId === activeGrnLineKey
      ? captureCurrentGrnLine()
      : savedGrnLines.find((item) => item.id === lineId);
    if (!line) return;
    const summary = summarizeGrnLineDraft(line);
    const label = [summary.name, summary.spec].filter(Boolean).join(' ');
    if (!window.confirm(`Remove ${label || 'this item'} from this invoice?`)) return;
    if (lineId === activeGrnLineKey) {
      const neighbor = savedGrnLines.find((item) => item.id !== lineId) || savedGrnLines[0];
      if (!neighbor) return;
      setSavedGrnLines((prev) => prev.filter((item) => item.id !== neighbor.id && item.id !== lineId));
      applyGrnLineToForm(neighbor);
      setActiveGrnLineKey(neighbor.id);
    } else {
      setSavedGrnLines((prev) => prev.filter((item) => item.id !== lineId));
    }
    setGrnLineOrder((prev) => prev.filter((id) => id !== lineId));
  };

  const handleAddOtherPoLines = () => {
    const po = (unifiedIssuedPOs || []).find((item) => item && item.poNumber === grnPoNo)
      || (purchaseOrders || []).find((item) => item && item.poNumber === grnPoNo);
    const items = po?.items || [];
    if (items.length < 2) {
      alert('This purchase order has only one open line.');
      return;
    }
    const extras = items.slice(1).map((item, index) => {
      const category = po.category || item.category || grnCategory || 'Film Substrates';
      const filmType = item.filmType || '';
      const micron = item.micron || '';
      const widthMm = item.widthMm || '';
      const itemName = category === 'Film Substrates'
        ? formatFilmItemName(filmType || 'PET', widthMm || 1000, micron || 12)
        : (item.itemDesc || item.itemName || item.description || 'Item');
      return {
        id: `po-line-${index + 2}-${Date.now()}`,
        poLineId: item.id || item.lineId || String(index + 2),
        category,
        itemName,
        filmType,
        metallocenePct: '',
        micron,
        widthMm,
        unit: item.unit || 'Kg',
        packagingType: item.packagingType || grnPackagingType,
        purchaseRate: item.rate || '',
        batchNo: grnBatchNo,
        remarks: '',
        stockItemId: item.itemId || item.stockItemId || '',
        itemSearchTerm: itemName,
        weightKg: '',
        rolls: [{ id: `item-${Date.now()}-${index + 2}`, grossWeightKg: '', tareWeightKg: grnDefaultTare || 0, netWeightKg: '', lengthMeters: '', vendorRollNo: '', notes: '' }],
        defaultTare: grnDefaultTare || 0,
        rollsCount: '1'
      };
    });
    const current = captureCurrentGrnLine();
    setSavedGrnLines((prev) => [...prev.filter((line) => line.id !== current.id), ...extras]);
    setGrnLineOrder((prev) => {
      const base = prev.includes(current.id) ? [...prev] : [...prev, current.id];
      extras.forEach((line) => {
        if (!base.includes(line.id)) base.push(line.id);
      });
      return base;
    });
  };

  const orderedGrnLineViews = (() => {
    const ids = grnLineOrder.filter((id) => id === activeGrnLineKey || savedGrnLines.some((line) => line.id === id));
    if (!ids.includes(activeGrnLineKey)) ids.push(activeGrnLineKey);
    savedGrnLines.forEach((line) => {
      if (!ids.includes(line.id)) ids.push(line.id);
    });
    return ids.map((id) => {
      const line = id === activeGrnLineKey
        ? captureCurrentGrnLine()
        : (savedGrnLines.find((item) => item.id === id) || {});
      return { id, ...summarizeGrnLineDraft(line) };
    });
  })();
  const severalGrnItems = orderedGrnLineViews.length > 1;
  const grnInvoiceTotals = orderedGrnLineViews.reduce((totals, line) => ({
    items: totals.items + 1,
    rolls: totals.rolls + (Number(line.rollsCount) || 0),
    net: totals.net + (Number(line.net) || 0),
    amount: totals.amount + (Number(line.amount) || 0)
  }), { items: 0, rolls: 0, net: 0, amount: 0 });

  useEffect(() => {
    if (savedGrnLines.length === 0) return;
    const node = grnItemEditorRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const search = node.querySelector('#grn-active-item-search');
    if (search && typeof search.focus === 'function') search.focus();
  }, [activeGrnLineKey]);

  // Inward GRN Submit (Supports Films, Inks, Solvents, Adhesives, Blades, Spares, PPE)
  const handleSaveGRN = async (e) => {
    e.preventDefault();
    const currentLine = captureCurrentGrnLine();
    const linesById = new Map(savedGrnLines.map((line) => [line.id, line]));
    linesById.set(currentLine.id, currentLine);
    const capturedLines = orderedGrnLineViews
      .map((view) => linesById.get(view.id))
      .filter(Boolean);
    const identityProblems = grnIdentityProblems({ vendor: grnVendor, lines: capturedLines });
    if (identityProblems.length > 0) {
      alert(identityProblems.join('\n'));
      return;
    }
    const editing = editingGrn;
    if (editing) {
      const block = grnChangeBlockReason(editing, currentUser?.role);
      if (block) {
        alert(block);
        return;
      }
    }
    const reserveGrnNumber = async () => {
      if (editing) return editing.grnNo || editing.id;
      return allocateGrnNumber(getDocumentPrefixes().grnPrefix || 'SIL/GRN/26-27/');
    };
    if (capturedLines.length > 1) {
      if (!grnInvoiceNo.trim()) {
        alert('Invoice Number is required.');
        return;
      }
      const problems = validateCapturedLines(capturedLines);
      if (problems.length > 0) {
        alert(problems.join('\n'));
        return;
      }
      const duplicate = findDuplicateInvoice(safeGrns, { invoiceNo: grnInvoiceNo, vendorName: grnVendor });
      if (duplicate) {
        alert(`🚫 DUPLICATE INWARD PREVENTED:\n\nA GRN (GRN #${duplicate.grnNo || duplicate.id}) already exists for supplier "${grnVendor}" with invoice #${grnInvoiceNo}.`);
        return;
      }
      const linkError = receiptLinesLinkError(inventory, capturedLines, {
        formatFilmItemName,
        isMetalloceneEligibleFilm
      });
      if (linkError) {
        alert(linkError);
        return;
      }
      let grnDocNo;
      try {
        grnDocNo = await reserveGrnNumber();
      } catch (err) {
        alert(`Could not reserve a GRN number: ${err.message || err}`);
        return;
      }
      const now = new Date();
      const matchedVendor = (vendors || []).find(v => v.companyName === grnVendor || v.name === grnVendor || v.id === grnVendor);
      const matchedPo = grnPoNo
        ? ((unifiedIssuedPOs || []).find(p => p.poNumber === grnPoNo) || (purchaseOrders || []).find(p => p.poNumber === grnPoNo))
        : null;
      const prepared = prepareMultiLineReceipt({
        header: {
          poNumber: grnPoNo,
          vendorName: grnVendor,
          vendorId: matchedVendor?.id || null,
          vendorAddress: matchedVendor?.address || '',
          vendorGstin: matchedVendor?.gstin || '',
          vendorEmail: matchedVendor?.email || '',
          vendorPhone: matchedVendor?.phone || matchedVendor?.contactNo || '',
          vendorContact: matchedVendor?.contactPerson || '',
          invoiceNo: grnInvoiceNo,
          freightAmount: grnFreightAmount,
          transporterName: grnTransporterName.trim() || 'Direct Dispatch / Self',
          storeManager: currentUser?.name || 'Store Manager',
          receivedTime: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
          remarks: (grnItemRemarks || '').trim()
        },
        capturedLines,
        grnNo: grnDocNo,
        nowIso: now.toISOString(),
        inventory,
        poItems: matchedPo?.items || [],
        generateBarcodeId,
        generateInventoryId,
        formatFilmItemName,
        calculateFilmRollLength,
        isMetalloceneEligibleFilm,
        idSources: [safeGrns, inventoryRolls]
      });
      if (prepared.linkError) {
        alert(prepared.linkError);
        return;
      }
      if (editing) {
        prepared.newGRN.id = editing.id || grnDocNo;
        prepared.newGRN.grnNo = grnDocNo;
        prepared.newGRN.editedBy = currentUser?.name || '';
        prepared.newGRN.editedAt = now.toISOString();
      }
      const totalAmountVal = prepared.newGRN.lineItems.reduce(
        (sum, line) => sum + (Number(line.netWeightKg) || 0) * (Number(line.purchaseRate) || 0),
        0
      );
      setGrnConfirmationModal({
        isOpen: true,
        pendingData: {
          newGRN: prepared.newGRN,
          newInvItems: prepared.inventoryLots,
          updatedItems: prepared.updatedItems,
          newRolls: prepared.rolls,
          mode: editing ? 'edit' : 'create',
          previousRolls: editing ? rollsForGrn(inventoryRolls, editing) : [],
          isCylinderCategory: false,
          targetStockItemId: prepared.newGRN.stockItemId,
          itemName: prepared.newGRN.itemName,
          grnPoNo,
          unitCount: prepared.newGRN.rollsReceived,
          totalNetQty: prepared.newGRN.netWeightKg,
          rateVal: prepared.newGRN.purchaseRatePerKg,
          totalAmountVal: Number(totalAmountVal.toFixed(2))
        }
      });
      return;
    }

    if (!grnInvoiceNo.trim() || !grnBatchNo.trim()) {
      alert("Invoice Number and Batch Number are required!");
      return;
    }

    const isFilm = grnCategory === 'Film Substrates';
    const mPct = (isFilm && isMetalloceneEligibleFilm(grnFilmType)) ? grnMetallocenePct : '';
    const itemName = isFilm 
      ? formatFilmItemName(grnFilmType, grnWidthMm, grnMicron, '', mPct) 
      : (grnItemName.trim().replace(/µ/g, 'Micron') || `${grnCategory} Inward Item`);
    const lineLink = planCapturedReceiptLink(inventory, {
      category: grnCategory,
      itemName: grnItemName,
      filmType: grnFilmType,
      micron: grnMicron,
      widthMm: grnWidthMm,
      metallocenePct: mPct,
      stockItemId: grnSelectedStockItemId
    }, { formatFilmItemName, isMetalloceneEligibleFilm });
    if (lineLink.action === 'block') {
      alert(lineLink.message);
      return;
    }

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

    const isCylinderCategory = grnCategory === 'Rotogravure Cylinders';
    let grnDocNo;
    try {
      grnDocNo = await reserveGrnNumber();
    } catch (err) {
      alert(`Could not reserve a GRN number: ${err.message || err}`);
      return;
    }
    const grnCode = grnDocNo.replace('GRN-', '');

    // =========================================================================
    // DUPLICATE GRN CHECK & PREVENTION
    // =========================================================================
    const grnNoClean = String(grnDocNo).trim().toLowerCase();

    // Check 1: Duplicate GRN Number
    const dupByDocNo = (safeGrns || []).find(g => 
      String(g.grnNo || g.id || g.grn_number || '').trim().toLowerCase() === grnNoClean
    );
    if (dupByDocNo) {
      alert(`🚫 DUPLICATE GRN PREVENTED:\n\nA Goods Receipt Note with GRN #${grnDocNo} already exists in the system!\nPlease use a unique GRN Number.`);
      return;
    }

    // Check 2: one receipt per supplier and invoice. Extra items belong on that receipt.
    const dupByInvoice = findDuplicateInvoice(safeGrns, {
      invoiceNo: grnInvoiceNo,
      vendorName: grnVendor,
      grnNo: grnDocNo
    });

    if (dupByInvoice) {
      alert(`🚫 DUPLICATE INWARD PREVENTED:\n\nA GRN (GRN #${dupByInvoice.grnNo || dupByInvoice.id}) already exists for supplier "${grnVendor}" with invoice #${grnInvoiceNo}.`);
      return;
    }

    // Pre-calculate individual roll/unit breakdown and barcodeId for each item
    const preparedItemsBreakdown = itemsToSave.map((item, index) => {
      const i = index + 1;
      const itemGross = parseFloat(item.grossWeightKg) || 0;
      const itemTare = parseFloat(item.tareWeightKg) || 0;
      const itemNet = parseFloat(item.netWeightKg) || (itemGross > 0 ? Math.max(0, itemGross - itemTare) : Number((totalNetQty / unitCount).toFixed(2)));
      const itemLength = parseFloat(item.lengthMeters) || (isFilm ? calculateFilmRollLength(itemNet, grnWidthMm, grnMicron, grnFilmType) : null);
      const itemVendorRoll = (item.vendorRollNo || '').trim();

      const barcodeId = unitCount > 1 
        ? `${isFilm ? 'RM-BC' : 'CON-BC'}-${grnCode}-${i}` 
        : generateBarcodeId(isFilm ? 'RM-BC' : 'CON-BC');

      const itemRemarkVal = (item.itemRemarks || item.notes || grnItemRemarks || '').trim();

      return {
        unitNo: i,
        barcodeId: barcodeId,
        grossWeightKg: itemGross,
        tareWeightKg: itemTare,
        netWeightKg: itemNet,
        lengthMeters: itemLength > 0 ? itemLength : 0,
        vendorRollNo: itemVendorRoll,
        itemRemarks: itemRemarkVal,
        remarks: itemRemarkVal,
        notes: itemRemarkVal,
        metallocenePct: mPct,
        metallocene_pct: mPct
      };
    });

    const allBarcodes = preparedItemsBreakdown.map(b => b.barcodeId);
    const barcodeSummaryStr = allBarcodes.join(', ');
    const grnOverallRemark = (grnItemRemarks || '').trim();

    const existingStock = lineLink.action === 'use' ? lineLink.item : null;
    const newInvId = existingStock ? String(existingStock.id) : nextInventoryId(inventory);
    const targetStockItemId = newInvId;
    const masterId = newInvId;
    let newInvItem = null;
    if (!existingStock) {
      newInvItem = {
        id: newInvId,
        itemCode: newInvId,
        masterItemId: masterId,
        itemName: itemName || (isFilm ? `${grnFilmType} (${grnMicron}µ x ${grnWidthMm}mm)` : `${grnCategory} Material`),
        category: grnCategory || 'Film Substrates',
        filmType: isFilm ? grnFilmType : grnCategory,
        micron: isFilm ? (parseFloat(grnMicron) || 0) : '-',
        widthMm: isFilm ? (parseFloat(grnWidthMm) || 0) : '-',
        metallocenePct: mPct,
        metallocene_pct: mPct,
        unit: isFilm ? 'Kg' : (isCylinderCategory ? 'Set' : grnUnit),
        density: FILM_DENSITIES[grnFilmType] || 1.0,
        availableQtyKg: isCylinderCategory ? totalNetQty : 0,
        allocatedQtyKg: 0,
        unitPrice: rateVal,
        purchaseRatePerKg: rateVal,
        purchaseValuation: isCylinderCategory ? Number((totalNetQty * rateVal).toFixed(2)) : 0,
        location: isFilm ? "Bay A - Inward Dock" : "Consumables Store",
        reorderLevelKg: 100,
        lastVendor: grnVendor,
        lastBatch: grnBatchNo
      };
    } else if (isCylinderCategory) {
      const qty = Number(((Number(existingStock.availableQtyKg) || 0) + totalNetQty).toFixed(2));
      const price = rateVal > 0 ? rateVal : (Number(existingStock.unitPrice) || 0);
      newInvItem = {
        ...existingStock,
        availableQtyKg: qty,
        unitPrice: price,
        purchaseRatePerKg: price,
        purchaseValuation: Number((qty * price).toFixed(2)),
        lastVendor: grnVendor || existingStock.lastVendor,
        lastBatch: grnBatchNo || existingStock.lastBatch,
        location: existingStock.location
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const todayIsoDate = nowIso.split('T')[0];
    const receivedTimeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const matchedVendor = (vendors || []).find(v => v.companyName === grnVendor || v.name === grnVendor || v.id === grnVendor);
    const selectedVendorId = matchedVendor?.id || null;

    const matchedPoForGrn = grnPoNo ? ((unifiedIssuedPOs || []).find(p => p.poNumber === grnPoNo) || (purchaseOrders || []).find(p => p.poNumber === grnPoNo)) : null;
    const poFirstItem = (matchedPoForGrn?.items || [])[0] || {};
    const poAgreedRate = parseFloat(poFirstItem.rate) || 0;
    const poOrderedQty = parseFloat(poFirstItem.qtyKg || matchedPoForGrn?.totalPoQty) || 0;
    const poItemTitle = (poFirstItem.itemDesc || poFirstItem.itemName || '').trim();

    const hasRateVar = poAgreedRate > 0 && Math.abs(rateVal - poAgreedRate) > 0.05;
    const hasQtyVar = poOrderedQty > 0 && Math.abs(totalNetQty - poOrderedQty) > 0.1;
    const hasItemVar = Boolean(poItemTitle && itemName && poItemTitle.toLowerCase() !== itemName.toLowerCase());
    const isAnyVar = Boolean(hasRateVar || hasQtyVar || hasItemVar);

    const varDetails = isAnyVar ? {
      hasVariation: true,
      hasRateVariation: hasRateVar,
      poRate: poAgreedRate,
      inwardRate: rateVal,
      rateVariance: Number((rateVal - poAgreedRate).toFixed(2)),
      hasQtyVariation: hasQtyVar,
      orderedQtyKg: poOrderedQty,
      receivedQtyKg: totalNetQty,
      qtyVariance: Number((totalNetQty - poOrderedQty).toFixed(2)),
      hasItemVariation: hasItemVar,
      poItemName: poItemTitle,
      inwardItemName: itemName,
      variationReason: grnOverallRemark,
      notes: grnOverallRemark
    } : null;

    const varSummary = [
      hasRateVar ? `Rate: PO ₹${poAgreedRate} -> GRN ₹${rateVal} (${rateVal > poAgreedRate ? '+' : ''}${(rateVal - poAgreedRate).toFixed(2)})` : '',
      hasQtyVar ? `Qty: PO ${poOrderedQty}kg -> GRN ${totalNetQty}kg (${totalNetQty > poOrderedQty ? '+' : ''}${(totalNetQty - poOrderedQty).toFixed(1)}kg)` : '',
      hasItemVar ? `Item: "${poItemTitle}" -> "${itemName}"` : ''
    ].filter(Boolean).join('; ');

    const newGRN = {
      id: grnDocNo,
      grnNo: grnDocNo,
      poNumber: grnPoNo,
      vendorName: grnVendor,
      vendorId: selectedVendorId,
      vendorAddress: matchedVendor?.address || '',
      vendorGstin: matchedVendor?.gstin || '',
      vendorEmail: matchedVendor?.email || '',
      vendorPhone: matchedVendor?.phone || matchedVendor?.contactNo || '',
      vendorContact: matchedVendor?.contactPerson || '',
      invoiceNo: grnInvoiceNo,
      receivedDate: todayIsoDate,
      receivedTime: receivedTimeStr,
      inwardTimestamp: nowIso,
      createdAt: nowIso,
      category: grnCategory,
      itemName: itemName,
      originalPoItemName: poItemTitle || '',
      stockItemId: targetStockItemId,
      masterItemId: masterId,
      filmType: isFilm ? grnFilmType : grnCategory,
      micron: isFilm ? parseFloat(grnMicron) : '-',
      widthMm: isFilm ? parseFloat(grnWidthMm) : '-',
      metallocenePct: mPct,
      metallocene_pct: mPct,
      unit: isFilm ? 'Kg' : (isCylinderCategory ? 'Set' : grnUnit),
      packagingType: grnPackagingType,
      rollsReceived: unitCount,
      netWeightKg: totalNetQty,
      grossWeightKg: totalGrossQty,
      tareWeightKg: totalTareQty,
      itemsBreakdown: preparedItemsBreakdown,
      barcodes: allBarcodes,
      barcodeId: barcodeSummaryStr,
      purchaseRatePerKg: rateVal,
      purchaseRate: rateVal,
      unitPrice: rateVal,
      agreedPoRate: poAgreedRate || null,
      orderedPoQtyKg: poOrderedQty || null,
      hasVariation: isAnyVar,
      variations: varDetails,
      variationSummary: varSummary,
      batchNo: grnBatchNo,
      freightAmount: parseFloat(grnFreightAmount) || 0,
      transporterName: grnTransporterName.trim() || 'Direct Dispatch / Self',
      itemRemarks: grnOverallRemark,
      remarks: grnOverallRemark,
      notes: grnOverallRemark,
      status: isCylinderCategory ? "Approved" : "Pending QC Approval",
      qcStatus: isCylinderCategory ? "Approved" : "Pending QC Approval",
      qcNotes: isCylinderCategory ? "Engraved cylinder set received and verified." : "",
      inspectedBy: isCylinderCategory ? "Cylinder QC Inspector" : "",
      storeManager: currentUser?.name || "Store Manager"
    };
    if (editing) {
      newGRN.editedBy = currentUser?.name || '';
      newGRN.editedAt = nowIso;
    }
    newGRN.lineItems = [oneLineFromReceipt(newGRN)];

    // Generate individual barcode stickers for each box / roll / container unit received with its DISTINCT net weight!
    const newRolls = preparedItemsBreakdown.map((item) => {
      const rollRemark = item.itemRemarks || item.remarks || item.notes || grnOverallRemark;
      const rollObj = {
        id: item.barcodeId,
        barcodeId: item.barcodeId,
        grnNo: newGRN.grnNo,
        grnId: grnDocNo,
        grnLineItemId: `${grnDocNo}-L1`,
        lineNo: 1,
        unitNo: item.unitNo,
        totalUnits: unitCount,
        rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
        itemId: targetStockItemId,
        itemName: itemName,
        category: grnCategory,
        filmType: isFilm ? grnFilmType : '-',
        micron: isFilm ? (parseFloat(grnMicron) || 0) : 0,
        widthMm: isFilm ? (parseFloat(grnWidthMm) || 0) : 0,
        unit: isFilm ? 'Kg' : grnUnit,
        packagingType: grnPackagingType,
        inwardDatetime: nowIso,
        inwardTimestamp: nowIso,
        createdAt: nowIso,
        vendorName: grnVendor,
        invoiceNo: grnInvoiceNo,
        batchNo: grnBatchNo,
        vendorRollNo: item.vendorRollNo || null,
        grossWeightKg: item.grossWeightKg > 0 ? item.grossWeightKg : null,
        tareWeightKg: item.tareWeightKg > 0 ? item.tareWeightKg : null,
        netWeightKg: item.netWeightKg,
        availableWeightKg: item.netWeightKg,
        lengthMeters: item.lengthMeters > 0 ? item.lengthMeters : null,
        purchaseRatePerKg: rateVal,
        purchaseRate: rateVal,
        unitPrice: rateVal,
        stationId: 'SCALE_1_INWARD',
        locationBay: isCylinderCategory ? (isFilm ? 'Bay A' : 'Consumables Store') : 'Pending QC Store',
        status: isCylinderCategory ? 'In Stock' : 'Pending QC',
        qcStatus: isCylinderCategory ? 'Approved' : 'Pending QC',
        itemRemarks: rollRemark,
        remarks: rollRemark,
        notes: rollRemark
      };
      return rollObj;
    });

    // Open Confirmation Pop-up Modal before saving
    setGrnConfirmationModal({
      isOpen: true,
      pendingData: {
        newGRN,
        newInvItem,
        newRolls,
        mode: editing ? 'edit' : 'create',
        previousRolls: editing ? rollsForGrn(inventoryRolls, editing) : [],
        isCylinderCategory,
        targetStockItemId,
        itemName,
        grnPoNo,
        unitCount,
        totalNetQty,
        rateVal,
        totalAmountVal: Number((totalNetQty * rateVal).toFixed(2))
      }
    });
  };

  // Execute GRN registration upon user confirmation in pop-up modal
  const executeConfirmedSaveGRN = async () => {
    if (!grnConfirmationModal.pendingData) return;

    const {
      newGRN,
      newInvItem,
      newInvItems,
      updatedItems,
      newRolls,
      mode,
      previousRolls,
      isCylinderCategory,
      targetStockItemId,
      itemName,
      grnPoNo
    } = grnConfirmationModal.pendingData;

    const deletedHits = [];
    for (const roll of newRolls || []) {
      const code = roll.barcodeId || roll.barcode || roll.id;
          const cached = findRetiredBarcode(deletedBarcodes, code);
      if (cached) {
        deletedHits.push(cached);
        continue;
      }
      try {
        const hits = await findDeletedBarcodeHits([code]);
        if (hits[0]) deletedHits.push(hits[0]);
      } catch {
        // The database trigger still rejects a deleted barcode if this lookup is unavailable.
      }
    }
    if (deletedHits.length) {
      alert(`These barcodes are Deleted and cannot be received on a GRN:\n${deletedHits.map((hit) => deletedBarcodeMessage(hit)).join('\n')}`);
      return;
    }

    const lots = Array.isArray(newInvItems) && newInvItems.length > 0
      ? newInvItems
      : (newInvItem ? [newInvItem] : []);
    const stockWrites = [
      ...lots,
      ...(Array.isArray(updatedItems) ? updatedItems : [])
    ];

    // A new stock row is written only when nothing matched. Existing items stay at qty 0 until QC, except cylinders.
    for (const lot of stockWrites) {
      if (onSaveInventoryItem) {
        await onSaveInventoryItem(lot);
      } else if (onUpdateInventory) {
        onUpdateInventory([...inventory, lot]);
      }
    }

    // 2. Save GRN to Supabase Database
    let storedGRN = newGRN;
    try {
      const saveGrn = mode === 'edit' ? onUpdateGRN : onAddGRN;
      if (saveGrn) {
        const saved = await saveGrn(newGRN);
        if (saved && saved.grnNo) storedGRN = { ...newGRN, ...saved, lineItems: saved.lineItems || newGRN.lineItems };
      }
    } catch (err) {
      console.error('[GRN Inward] Save to database failed:', err);
      alert(`❌ Failed to create GRN in database:\n${err.message || err}`);
      setGrnConfirmationModal({ isOpen: false, pendingData: null });
      return;
    }

    // 2b. Dispatch Email Notification to Quality (QC) Users for Pending QC Approval
    if (storedGRN.status === 'Pending QC Approval' || storedGRN.qcStatus === 'Pending QC Approval' || storedGRN.status === 'Pending QC') {
      notifyGRNPendingQC({ grn: storedGRN, users }).catch(err => {
        console.warn('[GRN Inward] QC email notification error:', err);
      });
    }

    // 3. Auto update linked Cylinder / Order if applicable
    if (isCylinderCategory || (grnPoNo && grnPoNo.startsWith('PO-CYL-'))) {
      const linkedCylinder = (cylinders || []).find(c => 
        (grnPoNo && c.poNumber === grnPoNo) ||
        (targetStockItemId && String(c.id) === String(targetStockItemId)) ||
        (c.cylinderCode && itemName.toLowerCase().includes(c.cylinderCode.toLowerCase())) ||
        (c.jobName && itemName.toLowerCase().includes(c.jobName.toLowerCase()))
      );
      if (linkedCylinder && onUpdateCylinder) {
        onUpdateCylinder({
          ...linkedCylinder,
          status: 'Active In-Use',
          inwardGrnNo: storedGRN.grnNo,
          receivedDate: storedGRN.receivedDate
        });
      }
      const linkedOrder = (orders || []).find(o => 
        (grnPoNo && (o.engraverPoNumber === grnPoNo || o.poNumber === grnPoNo)) ||
        (linkedCylinder && o.cylinderId === linkedCylinder.id) ||
        (o.isCylinderOrder && o.jobName && itemName.toLowerCase().includes(o.jobName.toLowerCase()))
      );
      if (linkedOrder && onUpdateOrder) {
        onUpdateOrder({
          ...linkedOrder,
          status: 'Completed',
          cylinderStatus: 'Active In-Use',
          inwardGrnNo: storedGRN.grnNo
        });
      }
    }

    const rollsToStore = (newRolls || []).map((roll) => ({
      ...roll,
      grnNo: storedGRN.grnNo,
      grnId: storedGRN.id || storedGRN.grnNo,
      grnLineItemId: roll.grnLineItemId || `${storedGRN.id || storedGRN.grnNo}-L1`,
      lineNo: roll.lineNo || 1
    }));
    const keptBarcodes = new Set(rollsToStore.map((roll) => String(roll.barcodeId || roll.id)));
    const voidedRolls = mode === 'edit'
      ? (previousRolls || []).filter((roll) => !keptBarcodes.has(String(roll.barcodeId || roll.id))).map((roll) => ({
        ...roll,
        status: 'Void',
        qcStatus: 'Void',
        availableWeightKg: 0
      }))
      : [];

    // 4. Register EACH INDIVIDUAL roll/item with its own separate barcode into stock rolls/batches ledger
    try {
      if (onUpdateInventoryRolls) {
        await onUpdateInventoryRolls([...voidedRolls, ...rollsToStore]);
      } else {
        for (const rollObj of rollsToStore) {
          if (onAddRoll) {
            await onAddRoll(rollObj);
          }
        }
      }
    } catch (err) {
      alert(`GRN ${storedGRN.grnNo} was saved, but the roll barcodes were not all stored. Failed rolls are not shown as received.\n\n${err.message || err}`);
      setIsNewGRNModalOpen(false);
      setEditingGrn(null);
      setGrnConfirmationModal({ isOpen: false, pendingData: null });
      return;
    }

    // Reset Form Fields
    setGrnFreightAmount('');
    setGrnTransporterName('');
    setGrnItemRemarks('');
    setGrnVendor('');
    setGrnCategory('');
    setGrnItemName('');
    setGrnItemSearchTerm('');
    setGrnSelectedStockItemId('');
    setGrnInvoiceNo('');
    setGrnBatchNo('');
    setGrnPoNo('');
    setIsManualPoEntry(false);
    setGrnWeightKg('');
    setGrnPurchaseRate('');
    setGrnItemsList([
      { id: `item-${Date.now()}-1`, grossWeightKg: '', tareWeightKg: grnDefaultTare || 0, netWeightKg: '', lengthMeters: '', vendorRollNo: '', notes: '' }
    ]);
    const freshLineId = `line-${Date.now()}`;
    setSavedGrnLines([]);
    setActiveGrnLineKey(freshLineId);
    setGrnLineOrder([freshLineId]);

    // Close Create Modal and Confirmation Modal
    setIsNewGRNModalOpen(false);
    setEditingGrn(null);
    setGrnConfirmationModal({ isOpen: false, pendingData: null });

    // Open Success Animation Modal
    setGrnSuccessModal({
      isOpen: true,
      grnRecord: storedGRN,
      newRolls: rollsToStore
    });
  };

  const openEditInwardGrn = (grn) => {
    const block = grnChangeBlockReason(grn, currentUser?.role);
    if (block) {
      alert(block);
      return;
    }
    const lines = (Array.isArray(grn.lineItems) ? grn.lineItems : []).map((line) => ({
      id: line.id,
      poLineId: line.poLineId || null,
      category: line.category || '',
      itemName: line.itemName || '',
      filmType: line.filmType || 'PET',
      metallocenePct: line.metallocenePct || '',
      micron: line.micron ?? '',
      widthMm: line.widthMm ?? '',
      unit: line.unit || 'Kg',
      packagingType: line.packagingType || 'Roll',
      purchaseRate: line.purchaseRate ?? '',
      batchNo: line.batchNo || '',
      remarks: line.remarks || '',
      stockItemId: line.masterItemId || line.stockItemId || '',
      itemSearchTerm: line.itemName || '',
      weightKg: line.invoiceQtyKg ?? '',
      rolls: (Array.isArray(line.rolls) && line.rolls.length > 0 ? line.rolls : [{
        netWeightKg: line.netWeightKg,
        grossWeightKg: line.grossWeightKg,
        tareWeightKg: line.tareWeightKg
      }]).map((roll, index) => ({
        id: roll.barcodeId || `item-${line.id}-${index + 1}`,
        grossWeightKg: roll.grossWeightKg ?? '',
        tareWeightKg: roll.tareWeightKg ?? 0,
        netWeightKg: roll.netWeightKg ?? '',
        lengthMeters: roll.lengthMeters ?? '',
        vendorRollNo: roll.vendorRollNo || '',
        notes: roll.itemRemarks || roll.notes || ''
      })),
      defaultTare: 0,
      rollsCount: String(line.rollsReceived || (line.rolls || []).length || 1)
    }));
    const first = lines[0];
    if (!first) {
      alert('This GRN has no lines to edit.');
      return;
    }
    setEditingGrn(grn);
    setIsNewGRNModalOpen(true);
    setIsManualPoEntry(false);
    setGrnVendor(grn.vendorName || '');
    setGrnPoNo(grn.poNumber || '');
    setGrnInvoiceNo(grn.invoiceNo || '');
    setGrnFreightAmount(grn.freightAmount || '');
    setGrnTransporterName(grn.transporterName || '');
    applyGrnLineToForm(first);
    setActiveGrnLineKey(first.id);
    setSavedGrnLines(lines.slice(1));
    setGrnLineOrder(lines.map((line) => line.id));
  };

  const handleCancelInwardGrn = async (grn) => {
    const block = grnChangeBlockReason(grn, currentUser?.role);
    if (block) {
      alert(block);
      return;
    }
    const reason = window.prompt(`Cancel ${grn.grnNo || grn.id}? Enter a reason. Stock is not added.`);
    if (reason === null) return;
    let result;
    try {
      result = cancelInwardGrn(grn, {
        actor: currentUser,
        reason,
        rolls: rollsForGrn(inventoryRolls, grn)
      });
    } catch (err) {
      alert(err.message || err);
      return;
    }
    try {
      if (onUpdateGRN) await onUpdateGRN(result.grn);
      if (result.rolls.length > 0 && onUpdateInventoryRolls) await onUpdateInventoryRolls(result.rolls);
    } catch (err) {
      alert(`GRN ${grn.grnNo || grn.id} was not cancelled: ${err.message || err}`);
      return;
    }
    alert(`GRN ${grn.grnNo || grn.id} is cancelled. No stock was added. The receipt stays in the register.`);
  };

  // QC Approval / Rejection (Updates Stock for Films, Inks, Solvents, Adhesives, Spares, PPE)
  const switchQcLine = (lineId) => {
    if (!lineId || lineId === qcActiveLineId) return;
    const current = currentQcDraftFromForm();
    const source = (qcInspectingGRN?.lineItems || []).find((line) => line.id === lineId);
    const next = qcLineDrafts[lineId] || qcDraftFromLine(source);
    setQcLineDrafts((prev) => ({ ...prev, [qcActiveLineId]: current }));
    applyQcDraftToForm(next);
    setQcActiveLineId(lineId);
  };

  const handleQCAction = async (status) => {
    if (!qcInspectingGRN) return;
    const qcLines = Array.isArray(qcInspectingGRN.lineItems) ? qcInspectingGRN.lineItems : [];
    if (qcLines.length > 1) {
      const isApproved = status === 'Approved';
      const drafts = { ...qcLineDrafts, [qcActiveLineId]: currentQcDraftFromForm() };
      const { updatedGRN, stockPosts, rollPatches } = applyMultiLineQc({
        grn: qcInspectingGRN,
        draftsByLineId: drafts,
        status,
        formatFilmItemName,
        isMetalloceneEligibleFilm,
        calculateFilmRollLength
      });
      const inspectorName = currentUser?.name || 'Quality QC Chemist';
      updatedGRN.qcNotes = qcNotesInput || (isApproved
        ? 'Inspected and passed all laboratory parameters.'
        : 'Rejected in QC Approval Lab due to spec variation. Transferred to QC Hold Store.');
      updatedGRN.inspectedBy = inspectorName;
      updatedGRN.qcVerifiedAt = new Date().toISOString();
      try {
        if (onUpdateGRN) await onUpdateGRN(updatedGRN);
      } catch (err) {
        alert(`GRN ${updatedGRN.grnNo} was not updated: ${err.message || err}`);
        return;
      }
      const byBarcode = new Map(rollPatches.filter((patch) => patch.barcodeId).map((patch) => [String(patch.barcodeId), patch]));
      const matchingRolls = (inventoryRolls || []).filter((roll) => (
        (roll.grnNo && (roll.grnNo === qcInspectingGRN.grnNo || roll.grnNo === qcInspectingGRN.id))
        || (roll.grnId && (roll.grnId === qcInspectingGRN.id || roll.grnId === qcInspectingGRN.grnNo))
        || byBarcode.has(String(roll.barcodeId || roll.id))
      ));
      if (matchingRolls.length > 0 && onUpdateInventoryRolls) {
        const updatedRolls = matchingRolls.map((roll) => {
          const patch = byBarcode.get(String(roll.barcodeId || roll.id))
            || rollPatches.find((item) => item.grnLineItemId && item.grnLineItemId === roll.grnLineItemId);
          if (!patch) return roll;
          return {
            ...roll,
            ...patch,
            availableWeightKg: patch.netWeightKg,
            grnId: roll.grnId || qcInspectingGRN.id || qcInspectingGRN.grnNo,
            grnLineItemId: patch.grnLineItemId || roll.grnLineItemId
          };
        });
        try {
          await onUpdateInventoryRolls(updatedRolls);
        } catch (err) {
          alert(`GRN ${updatedGRN.grnNo} was updated, but the roll barcodes were NOT saved.\n\n${err.message || err}`);
          return;
        }
      }
      if (isApproved && onSaveInventoryItem) {
        const { saved } = applyQcApprovalStock(
          inventory,
          stockPosts.map((post) => ({ ...post, vendorName: updatedGRN.vendorName })),
          {
            generateInventoryId: (items, ...rest) => generateInventoryId(items, safeGrns, inventoryRolls, ...rest),
            idSources: [safeGrns, inventoryRolls]
          }
        );
        for (const item of saved) {
          await onSaveInventoryItem(item);
        }
      }
      setQcInspectingGRN(null);
      setQcNotesInput('');
      alert(isApproved
        ? `✅ GRN ${updatedGRN.grnNo} APPROVED!\n${stockPosts.map((post) => `${post.itemName}: ${post.addKg} kg`).join('\n')}`
        : `🚫 GRN ${updatedGRN.grnNo} REJECTED!\nEach item was moved to QC Hold.`);
      return;
    }

    const isApproved = status === 'Approved';
    const finalStatus = isApproved ? 'Approved' : 'QC Hold';
    const finalQcStatus = isApproved ? 'Approved' : 'Rejected';

    const isFilm = (qcInspectingGRN.category || 'Film Substrates') === 'Film Substrates';
    const verifiedNetWeight = parseFloat(qcEditNetWeightKg) || parseFloat(qcInspectingGRN.netWeightKg) || 0;
    const verifiedGrossWeight = parseFloat(qcEditGrossWeightKg) || parseFloat(qcInspectingGRN.grossWeightKg) || verifiedNetWeight;
    const verifiedTareWeight = parseFloat(qcEditTareWeightKg) || parseFloat(qcInspectingGRN.tareWeightKg) || 0;
    const verifiedWidth = isFilm ? (parseFloat(qcEditWidthMm) || qcInspectingGRN.widthMm || '-') : (qcInspectingGRN.widthMm || '-');
    const verifiedMicron = isFilm ? (parseFloat(qcEditMicron) || qcInspectingGRN.micron || '-') : (qcInspectingGRN.micron || '-');
    const verifiedFilmType = isFilm ? (qcEditFilmType || qcInspectingGRN.filmType || 'PET') : (qcInspectingGRN.filmType || qcInspectingGRN.category);
    const verifiedBatchNo = (qcEditBatchNo || qcInspectingGRN.batchNo || '').trim();
    const verifiedRollsCount = parseInt(qcEditRollsReceived, 10) || qcInspectingGRN.rollsReceived || 1;
    const inspectorName = currentUser?.name || 'Quality QC Chemist';
    const inspectionNowIso = new Date().toISOString();

    // Compute verified item name for films or keep item name
    const mPct = (isFilm && isMetalloceneEligibleFilm(verifiedFilmType)) ? (qcInspectingGRN.metallocenePct || '') : '';
    const verifiedItemName = isFilm 
      ? formatFilmItemName(verifiedFilmType, verifiedWidth, verifiedMicron, '', mPct) 
      : (qcEditItemName || qcInspectingGRN.itemName || `${qcInspectingGRN.category} Material`);

    // Prepare updated itemsBreakdown
    let updatedBreakdown = (qcEditItemsBreakdown && qcEditItemsBreakdown.length > 0)
      ? qcEditItemsBreakdown.map((item, idx) => ({
          ...item,
          unitNo: item.unitNo || idx + 1,
          netWeightKg: parseFloat(item.netWeightKg) || Number((verifiedNetWeight / verifiedRollsCount).toFixed(2)),
          grossWeightKg: parseFloat(item.grossWeightKg) || Number((verifiedGrossWeight / verifiedRollsCount).toFixed(2)),
          tareWeightKg: parseFloat(item.tareWeightKg) || Number((verifiedTareWeight / verifiedRollsCount).toFixed(2)),
          lengthMeters: isFilm ? calculateFilmRollLength(parseFloat(item.netWeightKg) || (verifiedNetWeight / verifiedRollsCount), verifiedWidth, verifiedMicron, verifiedFilmType) : item.lengthMeters
        }))
      : (qcInspectingGRN.itemsBreakdown || []).map((item, idx) => ({
          ...item,
          unitNo: item.unitNo || idx + 1,
          netWeightKg: Number((verifiedNetWeight / verifiedRollsCount).toFixed(2)),
          grossWeightKg: Number((verifiedGrossWeight / verifiedRollsCount).toFixed(2)),
          tareWeightKg: Number((verifiedTareWeight / verifiedRollsCount).toFixed(2)),
          lengthMeters: isFilm ? calculateFilmRollLength(verifiedNetWeight / verifiedRollsCount, verifiedWidth, verifiedMicron, verifiedFilmType) : item.lengthMeters
        }));

    const hasVariances = qcVariances && qcVariances.length > 0;

    const updatedGRN = {
      ...qcInspectingGRN,
      status: finalStatus,
      qcStatus: finalQcStatus,
      location: isApproved ? (qcInspectingGRN.category === 'Film Substrates' ? 'Bay A' : 'Consumables Store') : 'QC Hold Store',
      storeLocation: isApproved ? (qcInspectingGRN.category === 'Film Substrates' ? 'Bay A' : 'Consumables Store') : 'QC Hold Store',
      qcNotes: qcNotesInput || (isApproved ? 'Inspected and passed all laboratory parameters.' : 'Rejected in QC Approval Lab due to spec variation. Transferred to QC Hold Store.'),
      inspectedBy: inspectorName,
      inspectedDate: inspectionNowIso,
      qcVerifiedAt: inspectionNowIso,
      // Verified Specs:
      netWeightKg: verifiedNetWeight,
      grossWeightKg: verifiedGrossWeight,
      tareWeightKg: verifiedTareWeight,
      widthMm: verifiedWidth,
      micron: verifiedMicron,
      filmType: verifiedFilmType,
      itemName: verifiedItemName,
      batchNo: verifiedBatchNo,
      rollsReceived: verifiedRollsCount,
      itemsBreakdown: updatedBreakdown,
      dyneLevel: qcEditDyneLevel,
      gaugeVariance: qcEditGaugeVariance,
      qcVisualChecks: qcVisualChecks,
      qcVarianceDetected: hasVariances,
      qcVarianceLog: hasVariances ? qcVariances : (qcInspectingGRN.qcVarianceLog || null)
    };

    try {
      if (onUpdateGRN) {
        await onUpdateGRN(updatedGRN);
      }
    } catch (err) {
      alert(err?.name === 'PartialSaveError'
        ? err.message
        : `GRN ${updatedGRN.grnNo} was not updated: ${err.message || err}`);
      return;
    }

    // Update associated child rolls/barcodes in inventoryRolls with verified dimensions and weight
    const grnBarcodes = new Set([
      ...(Array.isArray(qcInspectingGRN.barcodes) ? qcInspectingGRN.barcodes : []),
      ...(Array.isArray(qcInspectingGRN.itemsBreakdown) ? qcInspectingGRN.itemsBreakdown.map((item) => item.barcodeId).filter(Boolean) : [])
    ]);
    const matchingRolls = (inventoryRolls || []).filter(r => 
      (r.grnNo && (r.grnNo === qcInspectingGRN.grnNo || r.grnNo === qcInspectingGRN.id)) ||
      (r.grn_no && (r.grn_no === qcInspectingGRN.grnNo || r.grn_no === qcInspectingGRN.id)) ||
      (r.invoiceNo && qcInspectingGRN.invoiceNo && r.invoiceNo === qcInspectingGRN.invoiceNo) ||
      grnBarcodes.has(r.barcodeId || r.id)
    );

    if (matchingRolls.length > 0) {
      const updatedRollsList = matchingRolls.map((r, idx) => {
        const correspondingItem = updatedBreakdown[idx] || updatedBreakdown[0] || {};
        const rollNet = parseFloat(correspondingItem.netWeightKg) || Number((verifiedNetWeight / matchingRolls.length).toFixed(2));
        const rollGross = parseFloat(correspondingItem.grossWeightKg) || Number((verifiedGrossWeight / matchingRolls.length).toFixed(2));
        const rollTare = parseFloat(correspondingItem.tareWeightKg) || Number((verifiedTareWeight / matchingRolls.length).toFixed(2));
        const rollLength = correspondingItem.lengthMeters || (isFilm ? calculateFilmRollLength(rollNet, verifiedWidth, verifiedMicron, verifiedFilmType) : r.lengthMeters);

        return {
          ...r,
          status: isApproved ? 'In Stock' : 'QC Hold',
          qcStatus: finalQcStatus,
          locationBay: isApproved ? (updatedGRN.category === 'Film Substrates' ? 'Bay A' : 'Consumables Store') : 'QC Hold Store',
          filmType: verifiedFilmType,
          micron: verifiedMicron,
          widthMm: verifiedWidth,
          itemName: verifiedItemName,
          batchNo: verifiedBatchNo,
          netWeightKg: rollNet,
          availableWeightKg: rollNet,
          grossWeightKg: rollGross,
          tareWeightKg: rollTare,
          lengthMeters: rollLength,
          notes: `${r.notes || ''} | QC ${finalStatus} by ${inspectorName}${hasVariances ? ' (Specs Revised)' : ''}`.trim()
        };
      });

      try {
        if (onUpdateInventoryRolls) {
          await onUpdateInventoryRolls(updatedRollsList);
        } else if (onUpdateRoll) {
          for (const roll of updatedRollsList) await onUpdateRoll(roll);
        } else if (onAddRoll) {
          for (const roll of updatedRollsList) await onAddRoll(roll);
        }
      } catch (err) {
        alert(`GRN ${updatedGRN.grnNo} was updated, but the roll barcodes were NOT saved. Those rolls are not shown as changed.\n\n${err.message || err}`);
        return;
      }
    }

    // Handle Rotogravure Cylinder status update on QC Approval
    if (isApproved && (updatedGRN.category === 'Rotogravure Cylinders' || (updatedGRN.poNumber && updatedGRN.poNumber.startsWith('PO-CYL-')))) {
      const linkedCylinder = (cylinders || []).find(c => 
        (updatedGRN.poNumber && c.poNumber === updatedGRN.poNumber) ||
        (updatedGRN.stockItemId && String(c.id) === String(updatedGRN.stockItemId)) ||
        (c.jobName && updatedGRN.itemName && updatedGRN.itemName.toLowerCase().includes(c.jobName.toLowerCase()))
      );
      if (linkedCylinder && onUpdateCylinder) {
        onUpdateCylinder({
          ...linkedCylinder,
          status: 'Active In-Use',
          inwardGrnNo: updatedGRN.grnNo
        });
      }
      const linkedOrder = (orders || []).find(o => 
        (updatedGRN.poNumber && (o.engraverPoNumber === updatedGRN.poNumber || o.poNumber === updatedGRN.poNumber)) ||
        (linkedCylinder && o.cylinderId === linkedCylinder.id) ||
        (o.isCylinderOrder && o.jobName && updatedGRN.itemName && updatedGRN.itemName.toLowerCase().includes(o.jobName.toLowerCase()))
      );
      if (linkedOrder && onUpdateOrder) {
        onUpdateOrder({
          ...linkedOrder,
          status: 'Completed',
          cylinderStatus: 'Active In-Use',
          inwardGrnNo: updatedGRN.grnNo
        });
      }
    }

    // If Approved, add the verified kilograms to the existing ledger, not a new lot.
    if (isApproved && (onSaveInventoryItem || onUpdateInventory)) {
      const grnRate = parseFloat(updatedGRN.purchaseRatePerKg || updatedGRN.purchaseRate || updatedGRN.unitPrice) || 0;
      const { saved } = applyQcApprovalStock(inventory, [{
        stockItemId: updatedGRN.stockItemId,
        masterItemId: updatedGRN.masterItemId,
        itemId: updatedGRN.itemId,
        itemName: verifiedItemName,
        category: updatedGRN.category || 'Film Substrates',
        filmType: verifiedFilmType,
        micron: verifiedMicron,
        widthMm: verifiedWidth,
        addKg: verifiedNetWeight,
        rate: grnRate,
        batchNo: verifiedBatchNo,
        vendorName: updatedGRN.vendorName,
        isFilm
      }], {
        generateInventoryId: (items, ...rest) => generateInventoryId(items, safeGrns, inventoryRolls, ...rest),
        idSources: [safeGrns, inventoryRolls]
      });
      for (const item of saved) {
        if (onSaveInventoryItem) {
          await onSaveInventoryItem(item);
        } else if (onUpdateInventory) {
          const exists = inventory.some((row) => String(row.id) === String(item.id));
          onUpdateInventory(exists
            ? inventory.map((row) => String(row.id) === String(item.id) ? item : row)
            : [...inventory, item]);
        }
      }
    }

    // IF EDITS WERE MADE: Notify Admin and other concerned roles!
    if (hasVariances) {
      notifyGRNQCVarianceModified({
        grn: updatedGRN,
        originalDetails: {
          netWeightKg: qcInspectingGRN.netWeightKg,
          grossWeightKg: qcInspectingGRN.grossWeightKg,
          tareWeightKg: qcInspectingGRN.tareWeightKg,
          widthMm: qcInspectingGRN.widthMm,
          micron: qcInspectingGRN.micron,
          filmType: qcInspectingGRN.filmType,
          batchNo: qcInspectingGRN.batchNo,
          rollsReceived: qcInspectingGRN.rollsReceived
        },
        updatedDetails: {
          netWeightKg: verifiedNetWeight,
          grossWeightKg: verifiedGrossWeight,
          tareWeightKg: verifiedTareWeight,
          widthMm: verifiedWidth,
          micron: verifiedMicron,
          filmType: verifiedFilmType,
          batchNo: verifiedBatchNo,
          rollsReceived: verifiedRollsCount,
          itemName: verifiedItemName
        },
        variances: qcVariances,
        editedBy: inspectorName,
        actionStatus: status,
        reason: qcNotesInput || 'Quality physical verification & laboratory measurement',
        users
      }).catch(err => console.warn('[QC Variance Notification] Failed:', err));

      // Also record in in-app notification alerts
      const newAlert = {
        id: `notif-${Date.now()}`,
        type: 'QC_VARIANCE_MODIFIED',
        title: `GRN #${updatedGRN.grnNo} Inward Specs Corrected in QC Lab`,
        message: `${inspectorName} adjusted inward parameters (${qcVariances.map(v => `${v.label}: ${v.oldVal} ➔ ${v.newVal}`).join(', ')}) upon physical lab inspection and marked as ${status}.`,
        grnNo: updatedGRN.grnNo,
        timestamp: inspectionNowIso,
        read: false
      };
      try {
        const existingAlerts = await fetchPayloadRecords(supabase, 'erp_notifications');
        await replacePayloadRecords(supabase, 'erp_notifications', [newAlert, ...(existingAlerts || []).filter(item => item.id !== newAlert.id)].slice(0, 50));
      } catch (err) {
        alert(`The GRN was updated, but the in-app notice was not saved: ${describeSaveError(err)}`);
      }
    }

    setQcInspectingGRN(null);
    setQcNotesInput('');

    alert(isApproved 
      ? `✅ GRN ${updatedGRN.grnNo} APPROVED!${hasVariances ? '\n⚠️ Inward details were corrected & Admin / Store notified.' : ''}\nStock of ${verifiedNetWeight} ${updatedGRN.unit || 'Kg'} added to central Inventory & Item Ledger.`
      : `🚫 GRN ${updatedGRN.grnNo} REJECTED!${hasVariances ? '\n⚠️ Spec variances were logged & Admin / Store notified.' : ''}\nMaterial transferred to 'QC Hold Store'. Barcodes updated to QC Hold.`
    );
  };

  // 2D Barcode / QR Code Scanner Resolution for Material Issue & Return
  const handleBarcodeScanLookup = async (rawCode) => {
    const code = String(rawCode !== undefined ? rawCode : (issueScanQuery || '')).trim();
    if (!code) {
      setSelectedInvItem(null);
      setScannedItemDetails(null);
      setScanErrorMessage('Please scan a 2D QR Code or enter a Barcode / Batch ID.');
      return;
    }
    setScanErrorMessage('');

    const cachedDeleted = findRetiredBarcode(deletedBarcodes, code);
    let deletedHit = cachedDeleted;
    if (!deletedHit) {
      try {
        const hits = await findDeletedBarcodeHits([code]);
        deletedHit = hits[0] || null;
      } catch {
        deletedHit = null;
      }
    }
    if (deletedHit) {
      setSelectedInvItem(null);
      setScannedItemDetails(null);
      setScanErrorMessage(deletedBarcodeMessage(deletedHit));
      return;
    }

    const cleanCode = code.toLowerCase().trim();
    const strippedCode = cleanCode.replace(/^(lot|bc|bar-iss|bar|roll|inv|grn|item)[-_:]\s*/i, '').trim();
    const grnExtract = strippedCode.replace(/^(con|rm)-bc-/, '').replace(/-\d+$/, '');

    // 1. Search in inventoryRolls by barcodeId, id, vendorRollNo, batchNo, barcode
    const matchedRoll = (inventoryRolls || []).find(r => {
      if (isRetiredBarcode(r)) return false;
      const bId = codeKey(r.barcodeId);
      const rId = codeKey(r.id);
      const vRoll = codeKey(r.vendorRollNo);
      const bNo = codeKeyFrom(r.batchNo, r.lotNo);
      const rGrn = codeKeyFrom(r.grnNo, r.grn_no);
      return bId === cleanCode || bId === strippedCode || cleanCode.includes(bId) ||
        rId === cleanCode || rId === strippedCode ||
        vRoll === cleanCode || vRoll === strippedCode || (vRoll && cleanCode.includes(vRoll)) ||
        bNo === cleanCode || bNo === strippedCode || (bNo && cleanCode.includes(bNo)) ||
        (rGrn && (rGrn === cleanCode || rGrn === strippedCode || cleanCode.includes(rGrn)));
    });

    // 2. Search in safeGrns by grnNo, id, batchNo, barcode, invoiceNo, poNumber
    const matchedGrn = (safeGrns || []).find(g => {
      const gNo = codeKeyFrom(g.grnNo, g.grn_number, g.grnNumber);
      const gCode = gNo.replace(/^grn-/, '');
      const gId = codeKey(g.id);
      const bNo = codeKeyFrom(g.batchNo, g.batch_no);
      const bCode = codeKey(g.barcode);
      const invNo = codeKeyFrom(g.invoiceNo, g.invoice_number, g.invoiceNumber);
      return gNo === cleanCode || gNo === strippedCode || cleanCode.includes(gNo) ||
        gId === cleanCode || gId === strippedCode ||
        bNo === cleanCode || bNo === strippedCode || (bNo && cleanCode.includes(bNo)) ||
        bCode === cleanCode || bCode === strippedCode || (bCode && cleanCode.includes(bCode)) ||
        invNo === cleanCode || invNo === strippedCode ||
        (grnExtract && (gCode === grnExtract || gNo.includes(grnExtract)));
    });

    // 3. Search in inventory items by id, itemCode, productCode, lastBatch, batchNo, barcode, itemName, shade
    const matchedItemDirect = (inventory || []).find(i => {
      const iId = codeKey(i.id);
      const iCode = codeKeyFrom(i.itemCode, i.item_code);
      const pCode = codeKeyFrom(i.productCode, i.product_code);
      const lBatch = codeKey(i.lastBatch);
      const bNo = codeKeyFrom(i.batchNo, i.batch_no);
      const bCode = codeKeyFrom(i.barcode, i.barcodeId);
      const iName = codeKeyFrom(i.itemName, i.item_name);
      const shade = codeKey(i.shade);

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
      const pCode = codeKeyFrom(ink.productCode, ink.product_code);
      const inkId = codeKey(ink.id);
      const shade = codeKey(ink.shade);
      const lBatch = codeKey(ink.lastBatch || `lot-${pCode}`);
      return (
        pCode === cleanCode || pCode === strippedCode || (pCode && cleanCode.includes(pCode)) ||
        inkId === cleanCode || inkId === strippedCode ||
        lBatch === cleanCode || lBatch === strippedCode || (lBatch && cleanCode.includes(lBatch)) ||
        (shade && (shade === cleanCode || cleanCode.includes(shade)))
      );
    });

    // Helpers to resolve positive number and exact product UOM
    const resolveQuantity = (...candidates) => {
      for (const c of candidates) {
        const num = Number(c);
        if (!isNaN(num) && num > 0) return num;
      }
      for (const c of candidates) {
        const num = Number(c);
        if (!isNaN(num) && num >= 0) return num;
      }
      return 0;
    };

    const resolveUOM = (item, roll, grn) => {
      const explicit = item?.unit || roll?.unit || grn?.unit;
      const explicitText = textFrom(explicit);
      if (explicitText.trim()) return typeof explicit === 'string' ? explicit : explicitText;
      return 'Kg';
    };

    let targetItem = null;
    let batchNo = 'BATCH-MAIN';
    let purchaseRate = 0;
    let vendorName = 'General Stock';
    let grnNo = '';
    let barcodeId = code;
    let availableQty = 0;
    let unitStr = 'Kg';

    if (matchedRoll) {
      const linkedGrnForRoll = (safeGrns || []).find(g => 
        (matchedRoll.grnNo && (g.grnNo === matchedRoll.grnNo || g.grn_number === matchedRoll.grnNo)) ||
        (matchedRoll.invoiceNo && (g.invoiceNo === matchedRoll.invoiceNo || g.invoice_number === matchedRoll.invoiceNo)) ||
        (matchedRoll.batchNo && (g.batchNo === matchedRoll.batchNo || g.batch_no === matchedRoll.batchNo)) ||
        (grnExtract && String(g.grnNo || g.grn_number || '').includes(grnExtract))
      );

      targetItem = (inventory || []).find(i => 
        i.id === matchedRoll.itemId || 
        (i.itemCode && matchedRoll.itemId && codesEqual(i.itemCode, matchedRoll.itemId)) ||
        (i.itemName && matchedRoll.itemName && codesEqual(i.itemName, matchedRoll.itemName)) ||
        (i.filmType && matchedRoll.filmType && codesEqual(i.filmType, matchedRoll.filmType))
      ) || {
        id: matchedRoll.itemId || `ITEM-${matchedRoll.id}`,
        itemName: matchedRoll.itemName || `${matchedRoll.filmType || 'Film'} ${matchedRoll.micron || ''}µ`,
        category: matchedRoll.category || linkedGrnForRoll?.category || 'Film Substrates',
        filmType: matchedRoll.filmType,
        micron: matchedRoll.micron,
        widthMm: matchedRoll.widthMm,
        unit: matchedRoll.unit || linkedGrnForRoll?.unit || 'Kg',
        unitPrice: matchedRoll.purchaseRatePerKg || 0,
        availableQtyKg: matchedRoll.availableWeightKg || matchedRoll.netWeightKg || 0,
        location: matchedRoll.location || 'Store Bay'
      };

      unitStr = resolveUOM(targetItem, matchedRoll, linkedGrnForRoll);
      batchNo = matchedRoll.batchNo || matchedRoll.lotNo || matchedRoll.vendorRollNo || linkedGrnForRoll?.batchNo || matchedRoll.barcodeId;
      purchaseRate = resolveQuantity(matchedRoll.purchaseRatePerKg, matchedRoll.purchaseRate, matchedRoll.unitPrice, targetItem.unitPrice, targetItem.purchaseRatePerKg, linkedGrnForRoll?.purchaseRate);
      vendorName = matchedRoll.vendorName || matchedRoll.vendor || linkedGrnForRoll?.vendorName || linkedGrnForRoll?.vendor_name || targetItem.lastVendor || 'Verified Supplier';
      grnNo = matchedRoll.grnNo || matchedRoll.grn_no || linkedGrnForRoll?.grnNo || linkedGrnForRoll?.grn_number || (grnExtract && grnExtract.length > 3 ? `GRN-${grnExtract.toUpperCase()}` : '');
      barcodeId = textFrom(matchedRoll.barcodeId) || code;
      availableQty = resolveQuantity(
        matchedRoll.availableWeightKg,
        matchedRoll.available_weight_kg,
        matchedRoll.availableQty,
        matchedRoll.netWeightKg,
        matchedRoll.net_weight_kg,
        matchedRoll.grossWeightKg,
        targetItem.availableQtyKg,
        targetItem.available_qty_kg,
        targetItem.currentStockKg,
        targetItem.current_stock_kg,
        targetItem.stockQtyKg,
        targetItem.stock_qty_kg,
        linkedGrnForRoll?.receivedQtyKg,
        linkedGrnForRoll?.netWeightKg
      );
    } else if (matchedGrn) {
      targetItem = (inventory || []).find(i => 
        i.id === matchedGrn.itemId || 
        i.id === matchedGrn.stockItemId ||
        (i.itemCode && matchedGrn.itemId && codesEqual(i.itemCode, matchedGrn.itemId)) ||
        (i.itemName && matchedGrn.itemName && codesEqual(i.itemName, matchedGrn.itemName)) ||
        (i.filmType && matchedGrn.filmType && codesEqual(i.filmType, matchedGrn.filmType))
      ) || {
        id: matchedGrn.itemId || matchedGrn.stockItemId || `GRN-ITEM-${matchedGrn.id}`,
        itemName: matchedGrn.itemName || `${matchedGrn.filmType || 'Film'} ${matchedGrn.micron || ''}µ`,
        category: matchedGrn.category || 'Film Substrates',
        unit: matchedGrn.unit || 'Kg',
        unitPrice: matchedGrn.purchaseRate || matchedGrn.unitPrice || 0,
        availableQtyKg: matchedGrn.netWeightKg || matchedGrn.receivedQtyKg || 0,
        location: 'Store Room'
      };

      unitStr = resolveUOM(targetItem, null, matchedGrn);
      batchNo = matchedGrn.batchNo || matchedGrn.batch_no || `GRN-${matchedGrn.grnNo || matchedGrn.grn_number}`;
      purchaseRate = resolveQuantity(matchedGrn.purchaseRate, matchedGrn.purchaseRatePerKg, matchedGrn.unitPrice, targetItem.unitPrice);
      vendorName = matchedGrn.vendorName || matchedGrn.vendor_name || matchedGrn.supplier || targetItem.lastVendor || 'Verified Supplier';
      grnNo = matchedGrn.grnNo || matchedGrn.grn_number || '';
      barcodeId = textFrom(matchedGrn.barcode) || code;
      availableQty = resolveQuantity(targetItem.availableQtyKg, targetItem.currentStockKg, targetItem.stockQtyKg, matchedGrn.netWeightKg, matchedGrn.receivedQtyKg);
    } else if (matchedItemDirect) {
      targetItem = matchedItemDirect;
      unitStr = resolveUOM(targetItem, null, null);
      batchNo = targetItem.lastBatch || targetItem.batchNo || (targetItem.itemCode ? `LOT-${targetItem.itemCode}` : `LOT-${targetItem.id}`);
      purchaseRate = resolveQuantity(targetItem.unitPrice, targetItem.purchaseRatePerKg, targetItem.pricePerKg);
      vendorName = targetItem.lastVendor || targetItem.supplierName || targetItem.lastSupplier || targetItem.manufacturer || 'Verified Supplier';
      barcodeId = textFrom(targetItem.barcode) || (code.toUpperCase().startsWith('LOT-') ? code : (textFrom(targetItem.lastBatch, targetItem.id) || code));
      availableQty = resolveQuantity(targetItem.availableQtyKg, targetItem.available_qty_kg, targetItem.currentStockKg, targetItem.current_stock_kg, targetItem.stockQtyKg, targetItem.stock_qty_kg, targetItem.quantity, targetItem.qty);
    } else if (matchedInk) {
      targetItem = (inventory || []).find(i => 
        (i.itemCode && codesEqual(i.itemCode, matchedInk.productCode)) ||
        (i.id && codesEqual(i.id, matchedInk.productCode)) ||
        (i.id && codesEqual(i.id, matchedInk.id)) ||
        (i.itemName && codesEqual(i.itemName, matchedInk.shade))
      ) || {
        id: matchedInk.productCode || matchedInk.id,
        itemCode: matchedInk.productCode,
        itemName: matchedInk.shade || matchedInk.productCode,
        category: 'Printing Inks',
        unit: matchedInk.unit || 'Kg',
        unitPrice: matchedInk.pricePerKg || matchedInk.unitPrice || 0,
        availableQtyKg: matchedInk.stockQtyKg || 0,
        location: 'Ink Store Room',
        lastVendor: matchedInk.supplierName || matchedInk.manufacturer || 'DIC Inks'
      };

      unitStr = resolveUOM(targetItem, null, null);
      batchNo = matchedInk.lastBatch || `LOT-${matchedInk.productCode}`;
      purchaseRate = resolveQuantity(targetItem.unitPrice, matchedInk.pricePerKg, matchedInk.unitPrice);
      vendorName = targetItem.lastVendor || matchedInk.supplierName || matchedInk.manufacturer || 'DIC Inks';
      barcodeId = code.toUpperCase().startsWith('LOT-') ? code : `LOT-${matchedInk.productCode}`;
      availableQty = resolveQuantity(targetItem.availableQtyKg, targetItem.currentStockKg, targetItem.stockQtyKg, matchedInk.stockQtyKg);
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
      qcStatus = matchedGrn.status || matchedGrn.qcStatus || 'Pending QC Approval';
    } else if (matchedRoll) {
      if (String(matchedRoll.status || matchedRoll.qcStatus || '').toLowerCase().includes('pending')) {
        qcStatus = 'Pending QC Approval';
      } else if (String(matchedRoll.status || matchedRoll.qcStatus || '').toLowerCase().includes('reject')) {
        qcStatus = 'Rejected';
      } else {
        const linkedGrn = (safeGrns || []).find(g => (matchedRoll.grnNo && g.grnNo === matchedRoll.grnNo) || (matchedRoll.batchNo && g.batchNo === matchedRoll.batchNo));
        if (linkedGrn && String(linkedGrn.status || linkedGrn.qcStatus || '').toLowerCase().includes('pending')) {
          qcStatus = 'Pending QC Approval';
        } else if (linkedGrn && String(linkedGrn.status || linkedGrn.qcStatus || '').toLowerCase().includes('reject')) {
          qcStatus = 'Rejected';
        }
      }
    } else if (targetItem) {
      if (String(targetItem.status || targetItem.qcStatus || '').toLowerCase().includes('pending')) {
        qcStatus = 'Pending QC Approval';
      } else if (String(targetItem.status || targetItem.qcStatus || '').toLowerCase().includes('reject')) {
        qcStatus = 'Rejected';
      } else {
        const linkedGrn = (safeGrns || []).find(g => (batchNo && g.batchNo === batchNo) || (g.itemId && g.itemId === targetItem.id && String(g.status || g.qcStatus || '').toLowerCase().includes('pending')));
        if (linkedGrn && String(linkedGrn.status || linkedGrn.qcStatus || '').toLowerCase().includes('pending')) {
          qcStatus = 'Pending QC Approval';
        }
      }
    }

    if (String(qcStatus).toLowerCase().includes('pending')) {
      isQCPending = true;
    } else if (String(qcStatus).toLowerCase().includes('reject')) {
      isQCRejected = true;
    }

    if (targetItem && !isInventoryItemActive(targetItem)) {
      setSelectedInvItem(null);
      setScannedItemDetails(null);
      setScanErrorMessage(`Stock item ${targetItem.itemName || targetItem.id} is archived and cannot be issued, consumed, or received.`);
      return;
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
      isQCRejected,
      itemRemarks: matchedRoll?.itemRemarks || matchedRoll?.remarks || matchedRoll?.notes || matchedGrn?.itemRemarks || matchedGrn?.remarks || matchedGrn?.notes || ''
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
  const handleIssueReturnSubmit = async () => {
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
    const deletedIssue = findRetiredBarcode(deletedBarcodes, finalBarcode) || findRetiredBarcode(deletedBarcodes, scannedItemDetails?.barcodeId);
    if (deletedIssue) {
      alert(deletedBarcodeMessage(deletedIssue));
      return;
    }

    const maxAvail = scannedItemDetails?.availableQty ?? (itemToIssue.availableQtyKg || 0);
    if (issueType === 'issue' && maxAvail < qty) {
      alert(`Insufficient available stock! Only ${maxAvail} ${unitStr} available in this batch/roll.`);
      return;
    }

    if (onStoreIssueReturn) {
      try {
        await onStoreIssueReturn({
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
      } catch (err) {
        alert(`The store issue was not saved: ${err.message || err}`);
        return;
      }
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
  const handleCommitReconciliation = async () => {
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
            date: new Date().toISOString(),
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
      try {
        await replacePayloadRecords(supabase, 'stock_adjustments', updatedAdj);
        setStockLedgerAdjustments(updatedAdj);
      } catch (err) {
        alert(`The reconciliation ledger was not saved: ${describeSaveError(err)}`);
        return;
      }
    }

    if (onUpdateInventory) {
      await onUpdateInventory(updatedInv);
    }
    alert("Monthly Physical Stock Reconciliation completed successfully! System available stock and audit ledger updated.");
  };

  const downloadCsvFile = (filename, csvText) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBulkInventoryTemplate = () => {
    downloadCsvFile('Bulk_Inventory_Stock_Template_Samyak.csv', sampleBulkStockCsv());
  };

  const handleDownloadBulkErrorReport = () => {
    if (!bulkPlan || !bulkPlan.blockedCount) return;
    downloadCsvFile(stockUploadErrorFileName(new Date()), bulkErrorRowsCsv(bulkPlan));
  };

  const handleDownloadLiveInventoryCSV = () => {
    const headers = [
      'InventoryID', 'Category', 'ItemName', 'SubstrateOrGrade', 'Micron', 'WidthMm',
      'AvailableQty', 'UOM', 'Location', 'ReorderLevel', 'LastVendor',
      'LastBatch', 'UnitCostRs'
    ];
    const rows = (safeInventory || []).map(item => {
      const cat = item.category || 'Film Substrates';
      const name = item.itemName || `${item.filmType || ''} ${item.micron ? item.micron + 'µ' : ''}`.trim();
      const sub = item.substrateOrGrade || item.filmType || name;
      const micron = item.micron !== undefined && item.micron !== '-' ? item.micron : '';
      const width = item.widthMm !== undefined && item.widthMm !== '-' ? item.widthMm : '';
      const qty = item.availableQtyKg !== undefined ? item.availableQtyKg : (item.availableQty !== undefined ? item.availableQty : 0);
      const uom = item.unit || 'Kg';
      const loc = item.location || 'Main Factory Store';
      const reorder = item.reorderLevelKg !== undefined ? item.reorderLevelKg : (item.reorderLevel || 1000);
      const vendor = item.lastVendor || item.vendor || '';
      const batch = item.lastBatch || '';
      const cost = item.unitPrice !== undefined ? item.unitPrice : (item.purchaseRatePerKg || 0);
      return [item.id || item.itemCode || '', cat, name, sub, micron, width, qty, uom, loc, reorder, vendor, batch, cost];
    });
    const csvContent = `\uFEFF${[headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')}`;
    downloadCsvFile(`Live_Raw_Material_Inventory_Samyak_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
  };

  const resetBulkUpload = () => {
    setIsBulkModalOpen(false);
    setBulkPlan(null);
    setBulkFileName('');
    setBulkErrorMsg('');
    setBulkImporting(false);
  };

  // Universal Bulk CSV Parser (Supports All Material Categories & Excel Encodings)
  const handleParseBulkCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkErrorMsg('');
    setBulkPlan(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const bytes = new Uint8Array(buffer);
        let encoding = 'utf-8';
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';
        else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be';
        else {
          let nullCount = 0;
          const sampleSize = Math.min(bytes.length, 500);
          for (let i = 1; i < sampleSize; i += 2) {
            if (bytes[i] === 0x00) nullCount++;
          }
          if (nullCount > sampleSize * 0.2) encoding = 'utf-16le';
        }
        let text = new TextDecoder(encoding).decode(buffer);
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const plan = parseBulkStockCsv(text, {
          inventory: safeInventory,
          rolls: inventoryRolls,
          adjustments: stockLedgerAdjustments,
          categories: INVENTORY_CATEGORIES,
          categoryFallback: bulkCategory,
          now: new Date()
        });
        if (plan.error && plan.rows.length === 0) {
          setBulkErrorMsg(plan.error);
          return;
        }
        setBulkPlan(plan);
        if (plan.importableCount === 0) {
          setBulkErrorMsg('Every row has an error. Nothing will be imported until those rows are fixed.');
        }
      } catch (err) {
        console.error('CSV parse error:', err);
        setBulkErrorMsg('Failed to read CSV file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleConfirmBulkImport = async () => {
    if (!bulkPlan || bulkPlan.importableCount === 0 || bulkImporting) {
      alert('There are no valid rows to import.');
      return;
    }
    const payload = buildBulkImportPayload(bulkPlan, {
      inventory: safeInventory,
      now: new Date(),
      adjustedBy: currentUser?.name || 'Store Manager'
    });
    if (payload.items.length === 0) {
      alert('There are no valid rows to import.');
      return;
    }
    setBulkImporting(true);
    try {
      const { data: existingItems, error: existingItemError } = await supabase.from('inventory').select('id');
      if (existingItemError) throw existingItemError;
      reassignNewInventoryIds(payload, {
        existingIds: (existingItems || []).map((row) => row.id),
        updatingIds: (bulkPlan.groups || [])
          .filter((group) => group.match === 'existing')
          .map((group) => group.plannedId)
      });
      if (payload.rolls.length > 0) {
        const { data: existingRolls, error: existingRollError } = await supabase.from('inventory_rolls').select('barcode_id');
        if (existingRollError) throw existingRollError;
        const takenBarcodes = new Set((existingRolls || []).map((row) => String(row.barcode_id || '').trim().toLowerCase()).filter(Boolean));
        const clashes = payload.rolls.filter((roll) => takenBarcodes.has(String(roll.barcodeId || '').trim().toLowerCase()));
        const deletedRolls = [];
        for (const roll of payload.rolls) {
          const cached = findRetiredBarcode(deletedBarcodes, roll.barcodeId);
          if (cached) {
            deletedRolls.push(cached);
            continue;
          }
          try {
            const hits = await findDeletedBarcodeHits([roll.barcodeId]);
            if (hits[0]) deletedRolls.push(hits[0]);
          } catch {
            // The database trigger still rejects a deleted barcode.
          }
        }
        if (deletedRolls.length) {
          alert(`These barcodes are Deleted and cannot be uploaded as stock:\n${deletedRolls.map((hit) => deletedBarcodeMessage(hit)).join('\n')}`);
          return;
        }
        if (clashes.length) {
          alert(`These barcodes are already in stock, so nothing from this file was saved:\n${clashes.map((roll) => roll.barcodeId).join(', ')}\n\nOpen the file again so the preview can block those rows.`);
          return;
        }
        if (onUpdateInventoryRolls) {
          await onUpdateInventoryRolls(payload.rolls);
        } else if (onAddRoll) {
          for (const roll of payload.rolls) await onAddRoll(roll);
        } else {
          throw new Error('Roll saving is not available.');
        }
      }
      if (payload.adjustments.length > 0) {
        const currentAdj = await fetchPayloadRecords(supabase, 'stock_adjustments');
        const incomingIds = new Set(payload.adjustments.map((row) => String(row.id)));
        const updatedAdj = [
          ...payload.adjustments,
          ...currentAdj.filter((row) => !incomingIds.has(String(row.id)))
        ];
        await replacePayloadRecords(supabase, 'stock_adjustments', updatedAdj);
        setStockLedgerAdjustments(updatedAdj);
      }
      if (!onSaveInventoryItem) throw new Error('Saving a stock item is not available.');
      for (const item of payload.items) {
        await onSaveInventoryItem(item);
      }
      const blocked = bulkPlan.blockedCount || 0;
      let summaryMsg = 'Bulk inventory import finished.\n';
      if (payload.updatedCount > 0) summaryMsg += `${payload.updatedCount} existing item(s) received new rolls or quantity.\n`;
      if (payload.createdCount > 0) summaryMsg += `${payload.createdCount} new item(s) were created with generated ids.\n`;
      if (payload.rolls.length > 0) summaryMsg += `${payload.rolls.length} roll(s) were added to stock.\n`;
      if (blocked > 0) summaryMsg += `${blocked} row(s) were blocked and were not saved.`;
      alert(summaryMsg);
      resetBulkUpload();
    } catch (err) {
      alert(`The bulk import was not completed: ${describeSaveError(err)}`);
    } finally {
      setBulkImporting(false);
    }
  };



  const pendingQCGRNs = (safeGrns || []).filter(g => {
    const st = String(g.status || '').trim().toLowerCase();
    const qcSt = String(g.qcStatus || '').trim().toLowerCase();
    const category = String(g.category || '').trim().toLowerCase();

    // Auto-approved categories like Rotogravure Cylinders bypass QC lab inspection
    if (category === 'rotogravure cylinders' || category.includes('cylinder')) return false;

    if (st.includes('approved') || qcSt.includes('approved')) return false;
    if (st.includes('hold') || qcSt.includes('hold') || st.includes('reject') || qcSt.includes('reject')) return false;

    return st.includes('pending') || qcSt.includes('pending') || st.includes('awaiting') || qcSt.includes('awaiting') || (!st && !qcSt);
  });

  const filteredInventory = (groupedInventory || []).filter(i => {
    const subs = i.subItems || [i];
    if (stockCategoryFilter === 'ARCHIVED') {
      if (subs.some((sub) => isInventoryItemActive(sub))) return false;
    } else if (!showArchived && subs.every((sub) => !isInventoryItemActive(sub))) return false;
    // 1. Category / Over-Aged Filter
    if (stockCategoryFilter && stockCategoryFilter !== 'ALL') {
      if (stockCategoryFilter === 'OVERAGED') {
        const hasOverAged = (i.subItems || [i]).some(sub => isItemOverAged(sub, ageingSettings, safeGrns, inventoryRolls));
        if (!hasOverAged) return false;
      } else if (stockCategoryFilter !== 'ARCHIVED') {
        const itemCat = i.category || 'Film Substrates';
        if (itemCat !== stockCategoryFilter) {
          return false;
        }
      }
    }


    // 2. Search Text Filter
    if (!searchTerm || !searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    const title = (i.itemName || `${i.filmType || ''} Film`).toLowerCase();
    const filmType = (i.filmType || '').toLowerCase();
    const substrateGrade = (i.substrateOrGrade || i.substrateGrade || i.grade || i.subType || '').toLowerCase();
    const location = (i.location || '').toLowerCase();
    const itemCode = (i.itemCode || '').toLowerCase();
    const id = String(i.id || '').toLowerCase();
    const allIds = (i.allInventoryIds || []).join(' ').toLowerCase();
    const category = (i.category || 'Film Substrates').toLowerCase();
    const vendor = (i.lastVendor || i.vendor || '').toLowerCase();
    const micronStr = i.micron ? `${i.micron}` : '';
    const widthStr = i.widthMm ? `${i.widthMm}` : '';

    return title.includes(term) ||
      filmType.includes(term) ||
      substrateGrade.includes(term) ||
      location.includes(term) ||
      itemCode.includes(term) ||
      id.includes(term) ||
      allIds.includes(term) ||
      category.includes(term) ||
      vendor.includes(term) ||
      micronStr.includes(term) ||
      widthStr.includes(term);
  });

  const filteredPOs = useMemo(() => {
    return (unifiedIssuedPOs || []).filter(po => {
      // 1. Status Filter
      if (poStatusFilter === 'PENDING' && po.deliveryStatus !== 'Pending Delivery') return false;
      if (poStatusFilter === 'PARTIAL' && po.deliveryStatus !== 'Partial Delivery') return false;
      if (poStatusFilter === 'COMPLETED' && po.deliveryStatus !== 'Completed') return false;
      if (poStatusFilter === 'OVERDUE' && !po.isOverdue) return false;
      if (poStatusFilter === 'ALERT' && !po.hasAnyVariation && !po.priceDiscrepancy) return false;

      // 2. Search Term Filter
      if (!poSearchTerm || !poSearchTerm.trim()) return true;
      const term = poSearchTerm.toLowerCase().trim();
      const poNo = (po.poNumber || '').toLowerCase();
      const vendorName = (po.vendor?.companyName || po.vendor?.name || po.vendorName || '').toLowerCase();
      const source = (po.source || '').toLowerCase();
      const itemDescs = (po.items || []).map(it => (it.itemDesc || it.description || '').toLowerCase()).join(' ');

      return poNo.includes(term) || vendorName.includes(term) || source.includes(term) || itemDescs.includes(term);
    });
  }, [unifiedIssuedPOs, poStatusFilter, poSearchTerm]);

  const filteredRecItems = useMemo(() => {
    return (safeInventory || []).filter(item => {
      const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
      const diff = physicalVal - item.availableQtyKg;

      // 1. Search Filter
      if (recSearchTerm && recSearchTerm.trim()) {
        const q = recSearchTerm.toLowerCase().trim();
        const matchId = String(item.id || '').toLowerCase().includes(q);
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

  // Unique Vendors list for GRN Filter
  const uniqueGrnVendors = useMemo(() => {
    const set = new Set();
    (safeGrns || []).forEach(g => {
      if (g.vendorName && String(g.vendorName).trim()) {
        set.add(String(g.vendorName).trim());
      }
    });
    return Array.from(set).sort();
  }, [safeGrns]);

  // Filtered and Sorted GRNs for Inward History Tab
  const filteredGrns = useMemo(() => {
    let list = [...(safeGrns || [])];

    // 1. Text Search Filter
    if (grnSearchTerm && grnSearchTerm.trim()) {
      const q = grnSearchTerm.toLowerCase().trim();
      list = list.filter(g => {
        const grnNo = String(g.grnNo || g.id || '').toLowerCase();
        const poNo = String(g.poNumber || '').toLowerCase();
        const vendor = String(g.vendorName || '').toLowerCase();
        const invoice = String(g.invoiceNo || '').toLowerCase();
        const film = String(g.filmType || '').toLowerCase();
        const item = String(g.itemName || '').toLowerCase();
        const batch = String(g.batchNo || '').toLowerCase();
        const status = String(g.status || g.qcStatus || '').toLowerCase();
        const micron = g.micron !== undefined ? String(g.micron) : '';
        const width = g.widthMm !== undefined ? String(g.widthMm) : '';
        const category = String(g.category || '').toLowerCase();
        const lineText = (Array.isArray(g.lineItems) ? g.lineItems : [])
          .map((line) => `${line.itemName || ''} ${line.batchNo || ''} ${line.filmType || ''} ${line.micron || ''} ${line.widthMm || ''}`)
          .join(' ')
          .toLowerCase();

        return grnNo.includes(q) ||
               poNo.includes(q) ||
               vendor.includes(q) ||
               invoice.includes(q) ||
               film.includes(q) ||
               item.includes(q) ||
               batch.includes(q) ||
               status.includes(q) ||
               micron.includes(q) ||
               width.includes(q) ||
               category.includes(q) ||
               lineText.includes(q);
      });
    }

    // 2. Vendor Filter
    if (grnVendorFilter && grnVendorFilter !== 'ALL') {
      list = list.filter(g => (g.vendorName || '').toLowerCase().trim() === grnVendorFilter.toLowerCase().trim());
    }

    // 3. QC Status Filter
    if (grnStatusFilter && grnStatusFilter !== 'ALL') {
      list = list.filter(g => {
        const st = String(g.status || g.qcStatus || '').toLowerCase();
        if (grnStatusFilter === 'APPROVED') return st.includes('approved');
        if (grnStatusFilter === 'PENDING') return st.includes('pending') || st.includes('awaiting');
        if (grnStatusFilter === 'REJECTED') return st.includes('reject') || st.includes('hold');
        if (grnStatusFilter === 'CANCELLED') return st.includes('cancel');
        return true;
      });
    }

    // 4. Date Range Filter
    if (grnStartDate) {
      const startMs = new Date(grnStartDate).setHours(0, 0, 0, 0);
      list = list.filter(g => {
        const d = g.receivedDate || g.date || g.createdAt;
        if (!d) return true;
        return new Date(d).getTime() >= startMs;
      });
    }

    if (grnEndDate) {
      const endMs = new Date(grnEndDate).setHours(23, 59, 59, 999);
      list = list.filter(g => {
        const d = g.receivedDate || g.date || g.createdAt;
        if (!d) return true;
        return new Date(d).getTime() <= endMs;
      });
    }

    // 5. Sort Filter
    list.sort((a, b) => {
      const dateA = new Date(a.receivedDate || a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.receivedDate || b.date || b.createdAt || 0).getTime();
      const grnA = String(a.grnNo || '');
      const grnB = String(b.grnNo || '');
      const qtyA = Number(a.netWeightKg || a.receivedQtyKg || 0);
      const qtyB = Number(b.netWeightKg || b.receivedQtyKg || 0);
      const vendorA = String(a.vendorName || '').toLowerCase();
      const vendorB = String(b.vendorName || '').toLowerCase();

      switch (grnSortBy) {
        case 'DATE_ASC':
          return dateA - dateB;
        case 'GRN_DESC':
          return grnB.localeCompare(grnA, undefined, { numeric: true, sensitivity: 'base' });
        case 'GRN_ASC':
          return grnA.localeCompare(grnB, undefined, { numeric: true, sensitivity: 'base' });
        case 'QTY_DESC':
          return qtyB - qtyA;
        case 'QTY_ASC':
          return qtyA - qtyB;
        case 'VENDOR_ASC':
          return vendorA.localeCompare(vendorB);
        case 'DATE_DESC':
        default:
          return dateB - dateA;
      }
    });

    return list;
  }, [safeGrns, grnSearchTerm, grnVendorFilter, grnStatusFilter, grnStartDate, grnEndDate, grnSortBy]);

  const stockPagination = usePagination(filteredInventory, 50);
  const grnPagination = usePagination(filteredGrns, 50);
  const poPagination = usePagination(filteredPOs, 50);
  const dispatchPagination = usePagination(dispatchShipments || [], 50);
  const recPagination = usePagination(filteredRecItems, 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* GRN PDF View Modal */}
      {selectedGRNForPDF && (
        <GRNPDF grnData={selectedGRNForPDF} onClose={() => setSelectedGRNForPDF(null)} />
      )}

      {/* Purchase Order PDF View Modal */}
      {selectedPOForPDF && (
        <PurchaseOrderPDF 
          poData={selectedPOForPDF} 
          vendors={vendors}
          onClose={() => setSelectedPOForPDF(null)} 
        />
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

      {/* SFG & FG Master Rolls Entry Modal */}
      {isSfgFgModalOpen && (
        <SFGFGEntryModal 
          mode={sfgFgModalMode}
          orders={orders}
          jobMasters={jobMasters}
          inventory={inventory}
          inventoryRolls={inventoryRolls}
          productionRecords={productionRecords}
          machines={machines}
          currentUser={currentUser}
          onClose={() => setIsSfgFgModalOpen(false)}
          onSave={handleSaveSFGFG}
          onPrintRolls={(rolls) => setSelectedRollForBarcodeModal(rolls)}
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
            <Package size={16} /> Stock Register ({filteredInventory.length})
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
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Variations & Discrepancy Alerts</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', marginTop: '2px' }}>
                {unifiedIssuedPOs.filter(p => p.hasAnyVariation || p.priceDiscrepancy).length} POs with Variations
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
              <SearchableSelect className="form-control" style={{ width: '240px' }} triggerStyle={{ fontWeight: '600' }} value={poStatusFilter} onChange={e => setPoStatusFilter(e.target.value)}>
                <option value="ALL">🌐 All Issued POs ({unifiedIssuedPOs.length})</option>
                <option value="PENDING">⏳ Pending Inward (0 Received)</option>
                <option value="PARTIAL">📦 Partial Delivery</option>
                <option value="COMPLETED">✅ Completed Deliveries</option>
                <option value="OVERDUE">⚠️ Overdue Delivery SLA</option>
                <option value="ALERT">🚨 Variations & Discrepancies ({unifiedIssuedPOs.filter(p => p.hasAnyVariation || p.priceDiscrepancy).length})</option>
              </SearchableSelect>
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
                  <th>Discrepancy & Variation Alerts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {poPagination.paginatedItems.map(po => {
                  return (
                    <tr key={po.poNumber} style={po.hasAnyVariation || po.priceDiscrepancy ? { background: '#fffbeb' } : {}}>
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
                          <div>
                            <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                              ✅ Completed ({(po.totalInwardQty || 0).toFixed(0)} kg Inwarded)
                            </span>
                            {po.qtyVariations && po.qtyVariations.length > 0 && (
                              <div style={{ fontSize: '0.72rem', fontWeight: '700', color: po.qtyVariations[0].isShort ? '#b45309' : '#047857', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Scale size={11} /> Qty Var: {po.qtyVariations[0].variance > 0 ? '+' : ''}{po.qtyVariations[0].variance.toFixed(1)} kg ({po.qtyVariations[0].isShort ? 'Short' : 'Excess'})
                              </div>
                            )}
                          </div>
                        )}

                        {po.deliveryStatus === 'Partial Delivery' && (
                          <div>
                            <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                              📦 Partial Delivery
                            </span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#d97706', marginTop: '3px' }}>
                              Pending Inward: {(po.pendingInwardQty || 0).toFixed(1)} kg
                            </div>
                            {po.qtyVariations && po.qtyVariations.length > 0 && (
                              <div style={{ fontSize: '0.71rem', fontWeight: '700', color: '#b45309', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Scale size={11} /> Inward Diff: {po.qtyVariations[0].variance > 0 ? '+' : ''}{po.qtyVariations[0].variance.toFixed(1)} kg
                              </div>
                            )}
                          </div>
                        )}

                        {po.deliveryStatus === 'Pending Delivery' && (
                          <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                            ⏳ Pending Inward (0 Recd)
                          </span>
                        )}
                      </td>

                      <td>
                        {po.hasAnyVariation || po.priceDiscrepancy ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {/* Rate Discrepancy Alert */}
                            {(po.rateVariations && po.rateVariations.length > 0) || po.priceDiscrepancy ? (
                              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertTriangle size={12} /> Rate Mismatch
                                </span>
                                <div style={{ fontSize: '0.7rem', color: '#991b1b', marginTop: '2px', fontWeight: '600' }}>
                                  PO: ₹{po.rateVariations?.[0]?.poRate || po.priceDiscrepancy?.poRate} vs GRN: ₹{po.rateVariations?.[0]?.grnRate || po.priceDiscrepancy?.grnRate} 
                                  {po.rateVariations?.[0]?.variance !== undefined && ` (${po.rateVariations[0].variance > 0 ? '+' : ''}₹${po.rateVariations[0].variance.toFixed(2)})`}
                                </div>
                              </div>
                            ) : null}

                            {/* Quantity Variation Alert */}
                            {po.qtyVariations && po.qtyVariations.length > 0 && (
                              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '4px 8px', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Scale size={12} /> Qty Variation
                                </span>
                                <div style={{ fontSize: '0.7rem', color: '#92400e', marginTop: '2px', fontWeight: '600' }}>
                                  PO: {po.qtyVariations[0].orderedQty}kg vs GRN: {po.qtyVariations[0].receivedQty}kg ({po.qtyVariations[0].variance > 0 ? '+' : ''}{po.qtyVariations[0].variance.toFixed(1)} kg {po.qtyVariations[0].isShort ? 'Short' : 'Excess'})
                                </div>
                              </div>
                            )}

                            {/* Item Name Variation Alert */}
                            {po.itemVariations && po.itemVariations.length > 0 && (
                              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '4px 8px', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <FileText size={12} /> Item Alteration
                                </span>
                                <div style={{ fontSize: '0.68rem', color: '#6b21a8', marginTop: '2px', fontWeight: '600' }}>
                                  PO: "{po.itemVariations[0].poItemName}" → GRN: "{po.itemVariations[0].inwardItemName}"
                                </div>
                              </div>
                            )}

                            {/* Discrepancy Remarks / Reason */}
                            {po.variationNotesList && po.variationNotesList.length > 0 && (
                              <div style={{ fontSize: '0.67rem', color: '#475569', fontStyle: 'italic', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                                💬 "{po.variationNotesList[0].note}"
                              </div>
                            )}

                            {/* Admin Resolve button if rate mismatch */}
                            {po.priceDiscrepancy && (
                              isAdmin ? (
                                <button 
                                  className="btn-primary" 
                                  style={{ padding: '3px 8px', fontSize: '0.72rem', background: '#dc2626', borderColor: '#dc2626', fontWeight: '700', borderRadius: '4px' }}
                                  onClick={() => {
                                    setResolvingPoDiscrepancy(po);
                                    setResolutionAction('UPDATE_PO_RATE');
                                    setResolutionNotes('');
                                  }}
                                >
                                  ⚡ Resolve Rate Mismatch
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>🔒 Admin Resolution Required</span>
                              )
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
                          <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} /> ✓ Exact Match (No Variations)
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
            pagination={poPagination}
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
          {/* Over-Aged Inventory Warning Banner */}
          {overAgedItemsCount > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #fff5f5 0%, #fef2f2 100%)',
              border: '1px solid #fecaca',
              borderLeft: '4px solid #dc2626',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 2px 6px -2px rgba(220, 38, 38, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '10px' }}>
                  <Clock size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#991b1b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚠️ Inventory Ageing Warning Alert ({overAgedItemsCount} Item{overAgedItemsCount === 1 ? '' : 's'} Over-Aged)
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: '#7f1d1d', margin: '2px 0 0' }}>
                    {overAgedItemsCount} stock item(s) have exceeded their category-wise maximum storage age limit. All older stock must be issued and consumed first per FIFO policy.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ background: '#dc2626', color: '#ffffff', border: 'none', fontWeight: '800', fontSize: '0.78rem', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}
                onClick={() => setStockCategoryFilter(prev => prev === 'OVERAGED' ? 'ALL' : 'OVERAGED')}
              >
                {stockCategoryFilter === 'OVERAGED' ? 'Show All Stock Items' : `⚠️ Filter ${overAgedItemsCount} Over-Aged Item(s)`}
              </button>
            </div>
          )}

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
                <SearchableSelect
                  className="form-control"
                  style={{ width: '260px' }}
                  triggerStyle={{ fontWeight: '700' }}
                  value={stockCategoryFilter}
                  onChange={e => setStockCategoryFilter(e.target.value)}
                >
                  <option value="ALL">🌐 All Inventory Item Categories</option>
                  <option value="ARCHIVED">Archived stock items</option>
                  {overAgedItemsCount > 0 && (
                    <option value="OVERAGED" style={{ color: '#dc2626', fontWeight: '800' }}>
                      ⚠️ Over-Aged Stock Items ({overAgedItemsCount})
                    </option>
                  )}
                  <option value="Film Substrates">Film Substrates (PET, LDPE, BOPP)</option>
                  <option value="Printing Inks">Printing Inks</option>
                  <option value="Chemicals & Solvents">Chemicals & Solvents</option>
                  <option value="Adhesives & Hardener">Adhesives & Hardener</option>
                  <option value="Doctor Blades & Wipers">Doctor Blades & Wipers</option>
                  <option value="Rollers & Sleeves">Rollers & Sleeves</option>
                  <option value="Machine Spare Parts">Machine Spare Parts</option>
                  <option value="Lubricants & Oils">Lubricants & Oils</option>
                  <option value="Tapes & Consumables">Tapes & Consumables</option>
                  <option value="Safety Gear (PPE)">Safety Gear (PPE)</option>
                </SearchableSelect>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Show archived
              </label>
            </div>


            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                type="button"
                className="btn-primary" 
                style={{ fontSize: '0.8rem', padding: '6px 14px', background: '#2563eb', borderColor: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
                onClick={openAddStockModal}
                title="Create a new raw material item with ItemName, Category & SubstrateOrGrade"
              >
                <Plus size={16} /> Add New Stock Item
              </button>

              {selectedStockIds.size > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px', color: '#dc2626', borderColor: '#fecaca', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleDeleteSelectedStock}
                >
                  <Trash2 size={15} /> Delete selected ({selectedStockIds.size})
                </button>
              )}

              <button 
                className="btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                onClick={handleDownloadBulkInventoryTemplate}
              >
                <Download size={15} /> Download Sample CSV
              </button>

              <button 
                type="button"
                className="btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '6px 12px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={handleDownloadLiveInventoryCSV}
                title="Download live raw material inventory stock list in CSV format for editing quantities or details"
              >
                <Download size={15} /> Export Live Stock CSV
              </button>

              <button 
                type="button"
                className="btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                data-testid="bulk-upload-open"
                onClick={() => {
                  setIsBulkModalOpen(true);
                  setBulkPlan(null);
                  setBulkFileName('');
                  setBulkErrorMsg('');
                }}
              >
                <Upload size={15} /> Bulk Upload Stock CSV
              </button>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>Total Items: <b>{filteredInventory.length} Listed</b></span>
                <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '0.82rem' }}>
                  💰 Total Stock Valuation: ₹ {safeInventory.reduce((sum, i) => sum + ((parseFloat(i.availableQtyKg) || 0) * (parseFloat(i.unitPrice || i.purchaseRatePerKg) || 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      aria-label="Select stock items on this page"
                      checked={stockPagination.paginatedItems.length > 0 && stockPagination.paginatedItems.every((row) => stockItemIds(row).every((id) => selectedStockIds.has(id)))}
                      onChange={(event) => {
                        const ids = stockPagination.paginatedItems.flatMap((row) => stockItemIds(row));
                        toggleStockSelection(ids, event.target.checked);
                      }}
                    />
                  </th>
                  <th>Inventory ID</th>
                  <th>Item Name & Code</th>
                  <th>Category</th>
                  <th>Substrate / Grade</th>
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
                  const title = (isFilm && !item.preserveItemName)
                    ? formatFilmItemName(item.filmType, item.widthMm, item.micron, item.itemName)
                    : (item.itemName ? item.itemName.replace(/µ/g, 'Micron') : (item.category || item.filmType || 'Stock Item'));
                  const unitStr = item.unit || 'kg';
                  const rate = parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0;
                  const availQty = parseFloat(item.availableQtyKg) || 0;
                  const itemValuation = availQty * rate;
                  const subGrade = item.substrateOrGrade || item.substrateGrade || item.filmType || item.grade || item.subType || '-';

                  const oldestDate = getItemInwardDate(item, safeGrns, inventoryRolls);
                  const ageInDays = getItemAgeInDays(item, safeGrns, inventoryRolls);
                  const isOverAged = isItemOverAged(item, ageingSettings, safeGrns, inventoryRolls);
                  const catThreshold = getCategoryAgeingThreshold(item.category, ageingSettings);
                  const formattedInwardDate = oldestDate ? oldestDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

                  // Pending QC matching for this item
                  const pendingQcQty = pendingQcKgForItem(item, safeGrns);

                  const itemResInfo = getItemReservations(item);
                  const allocatedForOrders = itemResInfo.totalReservedKg;
                  const effectiveAllocated = Number(((item.allocatedQtyKg || 0) + allocatedForOrders).toFixed(2));
                  const usableFreeStock = Math.max(0, Number(((item.availableQtyKg || 0) - allocatedForOrders).toFixed(2)));

                  const rowIds = stockItemIds(item);
                  const rowSelected = rowIds.length > 0 && rowIds.every((id) => selectedStockIds.has(id));
                  const rowArchived = (item.subItems || [item]).every((sub) => !isInventoryItemActive(sub));
                  return (
                    <tr key={item.id} style={{ background: isOverAged ? '#fff5f5' : 'transparent' }}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${title}`}
                          checked={rowSelected}
                          onChange={(event) => toggleStockSelection(rowIds, event.target.checked)}
                        />
                      </td>
                      <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>
                        <div>{item.primaryId || item.id}</div>
                        {item.subItems && item.subItems.length > 1 && (
                          <div style={{ fontSize: '0.7rem', color: '#4b5563', fontWeight: '600', marginTop: '2px' }} title={`Grouped Inventory Codes/IDs: ${item.allInventoryIds.join(', ')}`}>
                            <span className="badge" style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '1px 5px', fontSize: '0.68rem', fontWeight: '700' }}>
                              +{item.subItems.length - 1} inward lots
                            </span>
                          </div>
                        )}
                      </td>
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
                        {rowArchived && (
                          <div style={{ marginTop: '4px' }}>
                            <span className="badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontSize: '0.68rem', fontWeight: '800' }}>Archived</span>
                          </div>
                        )}
                        {item.itemCode && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.itemCode}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.75rem', fontWeight: '700' }}>
                          {item.category || 'Film Substrates'}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '0.75rem', fontWeight: '700' }}>
                          {subGrade}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {isFilm ? `${item.micron} Micron × ${item.widthMm}mm` : (item.widthMm && item.widthMm !== '-' ? `${item.widthMm}mm` : '-')}
                      </td>
                      <td style={{ fontSize: '1.1rem', fontWeight: '800', color: (usableFreeStock ?? 0) === 0 ? (availQty === 0 && (pendingQcQty ?? 0) > 0 ? '#d97706' : '#ef4444') : (isLow ? '#d97706' : '#047857') }}>
                        {(usableFreeStock ?? 0).toLocaleString()} {unitStr}
                        {(allocatedForOrders ?? 0) > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', marginTop: '2px' }}>
                            On-hand: {(item.availableQtyKg ?? 0).toLocaleString()} {unitStr}
                          </div>
                        )}
                        {(pendingQcQty ?? 0) > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: '700', marginTop: '2px', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-block' }}>
                            ⏳ +{(pendingQcQty ?? 0).toLocaleString()} {unitStr} Pending QC
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: '700', color: '#1e293b' }}>
                        ₹{rate > 0 ? (rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'} / {unitStr}
                      </td>
                      <td style={{ fontWeight: '800', color: '#047857' }}>
                        ₹{itemValuation > 0 ? (itemValuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {(effectiveAllocated ?? 0).toLocaleString()} {unitStr}
                        {(allocatedForOrders ?? 0) > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: '700', marginTop: '2px', background: '#dcfce7', padding: '1px 5px', borderRadius: '4px', border: '1px solid #86efac', display: 'inline-block', whiteSpace: 'nowrap' }}>
                            🔒 {(allocatedForOrders ?? 0).toLocaleString()} {unitStr} Reserved
                          </div>
                        )}
                      </td>
                      <td>{item.location}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <div>{item.lastVendor}</div>
                        <code style={{ color: 'var(--accent-color)' }}>{item.lastBatch}</code>
                      </td>
                      <td>
                        {availQty === 0 && pendingQcQty > 0 ? (
                          <span 
                            className="badge" 
                            style={{ 
                              background: '#fef3c7', 
                              color: '#92400e', 
                              border: '1.5px solid #fde68a', 
                              fontSize: '0.72rem', 
                              fontWeight: '700', 
                              padding: '3px 8px', 
                              borderRadius: '6px',
                              whiteSpace: 'nowrap' 
                            }}
                          >
                            📥 GRN Inward (Pending QC)
                          </span>
                        ) : isLow ? (
                          <div>
                            <span className="badge badge-warning" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                              LOW STOCK
                            </span>
                            {pendingQcQty > 0 && (
                              <div style={{ marginTop: '3px' }}>
                                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.65rem', fontWeight: '700' }}>
                                  📥 GRN Inward (Pending QC)
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-us">IN STOCK</span>
                            {pendingQcQty > 0 && (
                              <div style={{ marginTop: '3px' }}>
                                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.65rem', fontWeight: '700' }}>
                                  📥 GRN Inward (Pending QC)
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Ageing & FIFO Badge */}
                        {isOverAged ? (
                          <div style={{ marginTop: '4px' }}>
                            <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', display: 'inline-block' }} title={`Oldest Inward Date: ${formattedInwardDate || 'N/A'}`}>
                              ⚠️ OVER-AGED ({ageInDays}d &gt; {catThreshold}d)
                            </span>
                            {formattedInwardDate && <div style={{ fontSize: '0.65rem', color: '#991b1b', fontWeight: '700', marginTop: '1px' }}>Inward: {formattedInwardDate}</div>}
                          </div>
                        ) : (
                          <div style={{ marginTop: '4px' }}>
                            <span className="badge" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '0.68rem', fontWeight: '700', padding: '2px 6px', display: 'inline-block' }} title={`Oldest Inward Date: ${formattedInwardDate || 'N/A'}`}>
                              📜 FIFO Stock ({ageInDays === 0 ? 'Recd Today' : `${ageInDays}d Old`})
                            </span>
                            {formattedInwardDate && <div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: '600', marginTop: '1px' }}>Inward: {formattedInwardDate}</div>}
                          </div>
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
                            style={{ padding: '4px 8px', fontSize: '0.75rem', color: rowArchived ? '#0369a1' : '#dc2626', borderColor: rowArchived ? '#bae6fd' : '#fecaca' }}
                            onClick={() => handleDeleteStockItem(item)}
                            title={rowArchived ? 'Reactivate stock item' : 'Delete an unused item, or archive an item that has history'}
                          >
                            <Trash2 size={14} /> {rowArchived ? 'Reactivate' : 'Delete / Archive'}
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
          {/* Header Summary Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HistoryIcon size={20} style={{ color: 'var(--accent-color)' }} />
                Goods Receipt Notes (GRN Inward History)
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Search, filter by vendor/date, sort, and audit raw material inward GRNs & barcode logs
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge badge-info" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '6px 12px', fontSize: '0.82rem', fontWeight: '700' }}>
                Records: {filteredGrns.length} / {safeGrns.length}
              </span>
              <span className="badge badge-primary" style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '6px 12px', fontSize: '0.82rem', fontWeight: '700' }}>
                Inward Weight: {filteredGrns.reduce((sum, g) => sum + Number(g.netWeightKg || g.receivedQtyKg || 0), 0).toLocaleString()} Kg
              </span>
            </div>
          </div>

          {/* Search, Vendor, QC Status, Date Range & Sort Filter Bar */}
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Top Row: Search Input & Reset Button */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px', position: 'relative' }}>
                <Search size={16} style={{ color: 'var(--text-muted)', position: 'absolute', left: '12px' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '36px', paddingRight: grnSearchTerm ? '32px' : '12px' }}
                  placeholder="Search GRN #, PO #, Vendor, Invoice #, Specs, Batch #..."
                  value={grnSearchTerm}
                  onChange={e => setGrnSearchTerm(e.target.value)}
                />
                {grnSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setGrnSearchTerm('')}
                    style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {(grnSearchTerm || grnVendorFilter !== 'ALL' || grnStatusFilter !== 'ALL' || grnStartDate || grnEndDate || grnSortBy !== 'DATE_DESC') && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.82rem', color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={() => {
                    setGrnSearchTerm('');
                    setGrnVendorFilter('ALL');
                    setGrnStatusFilter('ALL');
                    setGrnStartDate('');
                    setGrnEndDate('');
                    setGrnSortBy('DATE_DESC');
                  }}
                >
                  <X size={14} /> Reset Filters
                </button>
              )}
            </div>

            {/* Bottom Row: Detailed Dropdown Filters */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Vendor Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px', minWidth: '160px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Vendor / Supplier:</label>
                <SearchableSelect
                  className="form-control"
                  triggerStyle={{ fontSize: '0.85rem' }}
                  value={grnVendorFilter}
                  onChange={e => setGrnVendorFilter(e.target.value)}
                >
                  <option value="ALL">🌐 All Vendors ({uniqueGrnVendors.length})</option>
                  {uniqueGrnVendors.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </SearchableSelect>
              </div>

              {/* QC Status Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 160px', minWidth: '150px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>QC Clearance Status:</label>
                <SearchableSelect
                  className="form-control"
                  triggerStyle={{ fontSize: '0.85rem' }}
                  value={grnStatusFilter}
                  onChange={e => setGrnStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="APPROVED">✅ Approved by QC</option>
                  <option value="PENDING">⏳ Pending QC Clearance</option>
                  <option value="REJECTED">❌ Rejected by QC</option>
                  <option value="CANCELLED">Cancelled before QC</option>
                </SearchableSelect>
              </div>

              {/* From Date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px', minWidth: '130px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>From Date:</label>
                <input
                  type="date"
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={grnStartDate}
                  onChange={e => setGrnStartDate(e.target.value)}
                />
              </div>

              {/* To Date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px', minWidth: '130px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>To Date:</label>
                <input
                  type="date"
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={grnEndDate}
                  onChange={e => setGrnEndDate(e.target.value)}
                />
              </div>

              {/* Sort By Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px', minWidth: '170px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Sort By:</label>
                <SearchableSelect
                  className="form-control"
                  triggerStyle={{ fontSize: '0.85rem', fontWeight: '600' }}
                  value={grnSortBy}
                  onChange={e => setGrnSortBy(e.target.value)}
                >
                  <option value="DATE_DESC">📅 Date: Newest First</option>
                  <option value="DATE_ASC">📅 Date: Oldest First</option>
                  <option value="GRN_DESC">🔢 GRN #: High to Low</option>
                  <option value="GRN_ASC">🔢 GRN #: Low to High</option>
                  <option value="QTY_DESC">⚖️ Quantity: High to Low</option>
                  <option value="QTY_ASC">⚖️ Quantity: Low to High</option>
                  <option value="VENDOR_ASC">🏢 Vendor: A to Z</option>
                </SearchableSelect>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>GRN Number & Date</th>
                  <th>Ref PO #</th>
                  <th>Vendor Name</th>
                  <th>Invoice #</th>
                  <th>Film Specs / Description</th>
                  <th>Inward Qty (Kg)</th>
                  <th>Batch / Heat #</th>
                  <th>QC Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grnPagination.paginatedItems.length > 0 ? (
                  grnPagination.paginatedItems.map(g => (
                    <React.Fragment key={g.grnNo || g.id}>
                    <tr>
                      <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>
                        {g.grnNo}
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-muted)' }}>
                          {g.receivedDate ? new Date(g.receivedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </td>
                      <td>{g.poNumber || '—'}</td>
                      <td style={{ fontWeight: '600' }}>{g.vendorName || '—'}</td>
                      <td>{g.invoiceNo || '—'}</td>
                      <td>
                        {g.filmType} ({g.micron}µ / {g.widthMm}mm)
                        {Array.isArray(g.lineItems) && g.lineItems.length > 1 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setExpandedGrnNo(expandedGrnNo === g.grnNo ? '' : g.grnNo)}
                              style={{ marginTop: '4px', background: 'none', border: 'none', padding: 0, color: '#0284c7', fontWeight: '700', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
                              {g.lineItems.length} items {expandedGrnNo === g.grnNo ? '▾' : '▸'}
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: '700', color: '#60a5fa' }}>{g.netWeightKg} kg ({g.rollsReceived} rolls)</td>
                      <td><code>{g.batchNo || '—'}</code></td>
                      <td>
                        {((g.status || '').toLowerCase().includes('cancel') || (g.qcStatus || '').toLowerCase().includes('cancel')) && (
                          <span className="badge badge-warning" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontWeight: '700' }}>CANCELLED</span>
                        )}
                        {((g.status || '').toLowerCase().includes('approved') || (g.qcStatus || '').toLowerCase().includes('approved')) && (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: '700' }}>APPROVED BY QC</span>
                        )}
                        {(((g.status || '').toLowerCase().includes('pending') || (!g.status && !g.qcStatus)) && !(g.status || '').toLowerCase().includes('approved') && !(g.status || '').toLowerCase().includes('cancel')) && (
                          <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: '700' }}>⏳ PENDING QC APPROVAL</span>
                        )}
                        {((g.status || '').toLowerCase().includes('reject') || (g.qcStatus || '').toLowerCase().includes('reject') || (g.status || '').toLowerCase().includes('hold')) && (
                          <span className="badge badge-warning" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: '700' }}>REJECTED BY QC</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {canManageInwardGrn(currentUser?.role) && !grnChangeBlockReason(g, currentUser?.role) && (
                            <>
                              <button type="button" className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => openEditInwardGrn(g)}>
                                <Edit3 size={14} /> Edit
                              </button>
                              <button type="button" className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => handleCancelInwardGrn(g)}>
                                <Trash2 size={14} /> Cancel
                              </button>
                            </>
                          )}
                          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => {
                            const supplierName = String(g.vendorName || g.vendor?.companyName || g.vendor?.name || '').trim();
                            const supplierAddress = String(g.vendorAddress || g.vendor?.address || '').trim();
                            const supplierGstin = String(g.vendorGstin || g.vendor?.gstin || '').trim();
                            const missing = [
                              !supplierName && 'supplier name',
                              !supplierAddress && 'supplier address',
                              !supplierGstin && 'supplier GSTIN',
                            ].filter(Boolean);
                            if (missing.length) {
                              alert(`This GRN cannot be printed. It is missing ${missing.join(', ')}.`);
                              return;
                            }
                            setSelectedGRNForPDF(g);
                          }}>
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
                    {expandedGrnNo === g.grnNo && Array.isArray(g.lineItems) && g.lineItems.length > 1 && (
                      <tr>
                        <td colSpan="9" style={{ background: '#f8fafc', padding: '10px 14px' }}>
                          {g.lineItems.map((line) => (
                            <div key={line.id || line.lineNo} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0', fontSize: '0.82rem' }}>
                              <strong>Item {line.lineNo}: {line.itemName}</strong>
                              <span>{line.filmType || line.category} {line.micron && line.micron !== '-' ? `${line.micron}µ` : ''} {line.widthMm && line.widthMm !== '-' ? `/ ${line.widthMm}mm` : ''}</span>
                              <span>{line.netWeightKg} kg · {line.rollsReceived || (line.rolls || []).length || 0} rolls · batch {line.batchNo || '—'}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" className="center" style={{ padding: '36px', color: 'var(--text-muted)' }}>
                      <Filter size={28} style={{ opacity: 0.5, marginBottom: '8px' }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No Goods Receipt Notes (GRN) match the selected search & filter criteria.</div>
                      <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Try clearing your search text, vendor dropdown, or date range filters.</div>
                    </td>
                  </tr>
                )}
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
              {pendingQCGRNs.map(g => {
                const timestampDisplay = formatInwardTimestamp(g);
                const timeAgoDisplay = getInwardTimeAgo(g);
                const rawDate = g.inwardTimestamp || g.createdAt || g.created_at || g.receivedAt || g.receivedDate || g.date;
                const dObj = parseDateFlexible(rawDate);
                const isOverdue12h = dObj ? (Date.now() - dObj.getTime()) >= 12 * 3600000 : false;

                return (
                  <div key={g.grnNo} className="glass-card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="badge badge-warning">AWAITING QC CLEARANCE</span>
                          {isOverdue12h ? (
                            <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
                              <Clock size={11} /> Overdue (&gt;12h SLA)
                            </span>
                          ) : timeAgoDisplay ? (
                            <span style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: '600', background: '#fef3c7', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={11} /> {timeAgoDisplay}
                            </span>
                          ) : null}
                        </div>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: '800', marginTop: '6px', color: '#0f172a' }}>{g.grnNo}</h4>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>PO: {g.poNumber || 'N/A'}</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}>{g.vendorName}</div>
                      </div>
                    </div>

                    <div className="calc-summary-box" style={{ marginBottom: '16px' }}>
                      <div className="calc-summary-row" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#475569', fontSize: '0.8rem' }}>
                          <Clock size={13} style={{ color: '#64748b' }} /> Inward Received At:
                        </span>
                        <span className="bold-val" style={{ color: '#0f172a', fontSize: '0.83rem' }}>
                          {timestampDisplay}
                        </span>
                      </div>
                      <div className="calc-summary-row">
                        <span>{g.category === 'Film Substrates' ? 'Material Substrate:' : 'Material Item / Category:'}</span>
                        <span className="bold-val">
                          {g.category === 'Film Substrates' || (g.micron && g.micron !== '-' && parseFloat(g.micron) > 0)
                            ? `${g.filmType} (${g.micron}µ / ${g.widthMm}mm)`
                            : (g.itemName || g.category || g.filmType || 'Chemicals & Solvents')}
                        </span>
                      </div>
                      {Array.isArray(g.lineItems) && g.lineItems.length > 1 && g.lineItems.map((line) => (
                        <div className="calc-summary-row" key={line.id || line.lineNo}>
                          <span>Item {line.lineNo}:</span>
                          <span className="bold-val">{line.itemName} · {line.netWeightKg} kg</span>
                        </div>
                      ))}
                      <div className="calc-summary-row">
                        <span>Inward Net Weight:</span>
                        <span className="bold-val" style={{ color: '#2563eb' }}>{g.netWeightKg} {g.unit || 'kg'} ({g.rollsReceived || 1} {g.packagingType || 'Roll'})</span>
                      </div>
                      <div className="calc-summary-row">
                        <span>Manufacturer Batch #:</span>
                        <code style={{ fontFamily: 'monospace' }}>{g.batchNo}</code>
                      </div>
                      {g.qcVarianceDetected && (
                        <div style={{ marginTop: '6px', padding: '4px 8px', background: '#fef3c7', borderRadius: '4px', fontSize: '0.75rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={12} /> Previously inspected with specification variance
                        </div>
                      )}
                    </div>

                    <button 
                      className="btn-primary" 
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px', fontWeight: '700' }} 
                      onClick={() => setQcInspectingGRN(g)}
                    >
                      <FileCheck size={16} /> Inspect Material & Approve / Reject
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
                  <Download size={16} /> Download Sample Excel/CSV
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
                  <SearchableSelect
                    className="form-control"
                    style={{ width: '160px' }}
                    triggerStyle={{ padding: '5px 10px', fontSize: '0.8rem' }}
                    value={recSubstrateFilter}
                    onChange={e => setRecSubstrateFilter(e.target.value)}
                  >
                    <option value="ALL">All Substrates</option>
                    {uniqueFilmSubstrates.map(film => (
                      <option key={film} value={film}>{film} Film</option>
                    ))}
                  </SearchableSelect>
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
        <div className="modal-overlay" onClick={() => { setIsNewGRNModalOpen(false); setEditingGrn(null); }}>
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
                    {editingGrn ? `Edit ${editingGrn.grnNo || 'GRN'} before QC approval` : 'Create Goods Receipt Note (GRN Inward)'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    {editingGrn
                      ? 'Saving refreshes the pending QC lines. No stock is added until QC approval.'
                      : 'Store Manager stock inward entry • Generates downloadable GRN & triggers QC inspection'}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={() => { setIsNewGRNModalOpen(false); setEditingGrn(null); }}
                title="Close Modal"
              >
                <X size={18} />
              </button>
            </div>

            {showGrnPoSuggestion && (
              <GrnPoSuggestion
                key={grnVendor}
                vendorName={grnVendor}
                suggestions={grnPoSuggestions}
                onUsePo={confirmSuggestedPo}
                onEnterManually={enterManualPoEntry}
                onDismiss={dismissPoSuggestion}
              />
            )}

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveGRN}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} style={{ color: '#0284c7' }} /> Invoice details
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>
                  Entered once for this supplier invoice. Receipt date {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
                </p>
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
                    <SearchableSelect 
                      className="form-control" 
                      placeholder="Select or search vendor"
                      searchPlaceholder="Search vendor name or GSTIN..."
                      value={grnVendor} 
                      onChange={e => handleGrnVendorChange(e.target.value)}
                      triggerStyle={{ fontWeight: '500' }}
                    >
                      <option value="" disabled>-- Select Vendor --</option>
                      {(vendors || []).map(v => (
                        <option 
                          key={v.id || v.companyName} 
                          value={v.companyName}
                          data-subtitle={v.gstin ? `GSTIN: ${v.gstin}` : 'GSTIN N/A'}
                        >
                          {v.companyName} ({v.gstin || 'GSTIN N/A'})
                        </option>
                      ))}
                      <option value="__CREATE_NEW__" style={{ fontWeight: '700', color: '#047857' }}>
                        ➕ + Onboard / Create New Vendor...
                      </option>
                    </SearchableSelect>
                  </div>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ margin: 0, fontWeight: '600', fontSize: '0.83rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Ref PO Number
                        {vendorActivePOs.length > 0 && !isManualPoEntry && (
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: '700', 
                            color: '#b45309', 
                            background: '#fef3c7', 
                            border: '1px solid #fde68a', 
                            padding: '1px 6px', 
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <Clock size={11} /> {vendorActivePOs.length} Active {vendorActivePOs.length === 1 ? 'PO' : 'POs'} Awaiting Delivery
                          </span>
                        )}
                      </label>
                      {vendorActivePOs.length > 0 && (
                        <span style={{ display: 'inline-flex', gap: '12px', alignItems: 'center' }}>
                          {poSuggestionDismissed && !isManualPoEntry && !grnPoApplied && (
                            <button
                              type="button"
                              onClick={() => setPoSuggestionDismissed(false)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#9a3412',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                padding: 0,
                                textDecoration: 'underline'
                              }}
                            >
                              Show suggested POs
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (isManualPoEntry) {
                                setIsManualPoEntry(false);
                                setPoSuggestionDismissed(false);
                              } else {
                                enterManualPoEntry();
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0284c7',
                              fontSize: '0.74rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              padding: 0,
                              textDecoration: 'underline'
                            }}
                          >
                            {isManualPoEntry ? `← Select from Active POs (${vendorActivePOs.length})` : 'Enter manually'}
                          </button>
                        </span>
                      )}
                    </div>

                    {vendorActivePOs.length > 0 && !isManualPoEntry ? (
                      <SearchableSelect
                        className="form-control"
                        placeholder="Select a suggested PO to fill this receipt"
                        searchPlaceholder="Search PO #, item, or quantity..."
                        value={grnPoNo}
                        isClearable
                        onChange={e => handleSelectPoForGrn(e.target.value)}
                        triggerStyle={{ 
                          fontWeight: '600',
                          color: grnPoNo ? '#0f172a' : '#64748b',
                          borderColor: grnPoNo ? '#0284c7' : '#cbd5e1',
                          background: grnPoNo ? '#f0f9ff' : '#ffffff'
                        }}
                      >
                        <option value="" disabled>Select a suggested PO to fill this receipt</option>
                        {vendorActivePOs.map(po => {
                          const firstItem = (po.items || [])[0] || {};
                          const itemsSummary = (po.items || []).map(it => it.itemDesc || it.description || it.itemName || it.filmType || 'Item').join(', ');
                          const deliveryInfo = getPoDeliveryInfo(po);
                          const qtySummary = deliveryInfo.totalQty || po.totalPoQty || firstItem.qtyKg || 0;
                          const poStatusText = deliveryInfo.status === 'Partially Received'
                            ? `Partial Inward (${deliveryInfo.inwardQty}/${qtySummary} kg)`
                            : `⏳ Awaiting Delivery (${qtySummary} kg)`;
                          
                          return (
                            <option
                              key={po.poNumber || po.id}
                              value={po.poNumber}
                              data-subtitle={`${poStatusText} • ${po.category || 'Raw Material'} • ${itemsSummary || 'Item'}`}
                            >
                              {po.poNumber} — {itemsSummary || 'Raw Material'} ({qtySummary} kg)
                            </option>
                          );
                        })}
                        <option value="__MANUAL__" style={{ fontWeight: '700', color: '#0284c7' }}>
                          ✏️ + Enter Other / Manual PO Number...
                        </option>
                      </SearchableSelect>
                    ) : (
                      <>
                        <input 
                          id="grn-po-manual"
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. SIL/PO/26-27/1941" 
                          value={grnPoNo} 
                          onChange={e => {
                            const next = e.target.value;
                            if (grnPoApplied) clearPoFilledGrnFields();
                            setGrnPoNo(next);
                          }} 
                        />
                        {grnVendor && vendorActivePOs.length === 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px' }}>
                            No active POs awaiting delivery for {grnVendor} — enter manually if applicable.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                      Vendor Invoice Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input id="grn-vendor-invoice" type="text" className="form-control" required placeholder="e.g. INV-FP-9904" value={grnInvoiceNo} onChange={e => setGrnInvoiceNo(e.target.value)} />
                  </div>
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

              {severalGrnItems && (
                <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0f172a' }}>
                  Items on this invoice
                </div>
              )}

              {orderedGrnLineViews.map((view, index) => view.id !== activeGrnLineKey ? (
                <div key={view.id} style={{ background: '#ffffff', borderRadius: '12px', border: view.problems.length ? '1px solid #fecaca' : '1px solid #e2e8f0', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
                    <span style={{ fontWeight: '800', color: '#64748b', minWidth: '28px' }}>#{index + 1}</span>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.9rem' }}>{view.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{view.spec || 'Specification not entered'}</div>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#334155' }}>{view.rollsCount} {view.unitLabel}</span>
                    <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: '700' }}>{Number(view.net || 0).toFixed(2)} kg</span>
                    <span style={{ fontSize: '0.78rem', color: '#334155' }}>₹{Number(view.rate || 0).toLocaleString('en-IN')}</span>
                    <span style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: '800' }}>₹{Number(view.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginLeft: 'auto' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => handleSwitchGrnLine(view.id)} aria-label={`Edit item ${index + 1}`}>
                        <Edit3 size={14} /> Edit
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => handleDuplicateGrnLine(view.id)} aria-label={`Duplicate item ${index + 1}`}>
                        <Copy size={14} /> Duplicate
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem', color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => handleRemoveGrnLine(view.id)} aria-label={`Remove item ${index + 1}`}>
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                  {view.problems.length > 0 && (
                    <div role="alert" style={{ marginTop: '6px', color: '#b91c1c', fontSize: '0.75rem', fontWeight: '700' }}>
                      Item {index + 1}: {view.problems.join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={view.id}
                  ref={grnItemEditorRef}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    ...(severalGrnItems ? {
                      border: '2px solid #0284c7',
                      borderRadius: '12px',
                      padding: '12px',
                      background: '#f0f9ff'
                    } : {})
                  }}
                >
                  {severalGrnItems && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>
                          Item {index + 1} · {view.name}
                          <span style={{ marginLeft: '8px', background: '#e0f2fe', color: '#075985', borderRadius: '999px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: '800' }}>Editing</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#475569' }}>{view.spec || 'Enter the specification below'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => handleDuplicateGrnLine(view.id)}>
                          <Copy size={14} /> Duplicate
                        </button>
                        <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem', color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => handleRemoveGrnLine(view.id)}>
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  )}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Tag size={14} style={{ color: '#0284c7' }} /> Item
                    </div>
                    <div className="form-grid">
                  {/* Item Category */}
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155', marginBottom: '6px', display: 'block' }}>
                      Inward Item Category <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <SearchableSelect 
                      className="form-control" 
                      placeholder="Select item category"
                      searchPlaceholder="Search inward categories (e.g. Film, Inks, Cylinders, Solvents)..."
                      value={grnCategory} 
                      onChange={e => {
                        setGrnCategory(e.target.value);
                        setGrnSelectedStockItemId('');
                      }}
                      triggerStyle={grnCategory ? {
                        fontWeight: '600',
                        color: '#0284c7',
                        background: '#f0f9ff',
                        borderColor: '#bae6fd'
                      } : { fontWeight: '500' }}
                    >
                      <option value="Film Substrates" data-subtitle="PET, METPET, LDPE, BOPP, CPP, Foil">Film Substrates (PET, METPET, LDPE, BOPP, CPP, Foil)</option>
                      <option value="Rotogravure Cylinders" data-subtitle="Engraved Cylinder Sets & Tooling">Rotogravure Cylinders (Engraved Cylinder Sets)</option>
                      <option value="Printing Inks" data-subtitle="Solvent, Water-based & UV Inks">Printing Inks</option>
                      <option value="Chemicals & Solvents" data-subtitle="Ethyl Acetate, Anilox Cleaner, Retarder">Chemicals & Solvents (Ethyl Acetate, Anilox Cleaner)</option>
                      <option value="Adhesives & Hardener" data-subtitle="Solventless / Solvent-base Comp A & B">Adhesives & Hardener (Solventless Comp A/B)</option>
                      <option value="Doctor Blades & Wipers" data-subtitle="Doctor Blades & End Seals">Doctor Blades & Wipers</option>
                      <option value="Rollers & Sleeves" data-subtitle="Impression & Nip Rollers, Sleeves">Rollers & Sleeves</option>
                      <option value="Machine Spare Parts" data-subtitle="Mechanical, Pneumatic & Electrical Spares">Machine Spare Parts</option>
                      <option value="Lubricants & Oils" data-subtitle="Gearbox Oils, Greases & Sprays">Lubricants & Oils</option>
                      <option value="Tapes & Consumables" data-subtitle="PTFE, Masking & Packaging Consumables">Tapes & Consumables (PTFE, Masking)</option>
                      <option value="Safety Gear (PPE)" data-subtitle="Gloves, Masks, Goggles, Helmets">Safety Gear (PPE)</option>
                    </SearchableSelect>
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
                        id="grn-active-item-search"
                        className="form-control"
                        style={{ paddingLeft: '36px', paddingRight: '36px', fontWeight: grnSelectedStockItemId ? '700' : 'normal' }}
                        placeholder="Select or search stock item"
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
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} style={{ color: '#0284c7' }} /> Batch & packaging
                    </div>
                    <div className="form-grid">
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
                    <SearchableSelect 
                      className="form-control" 
                      triggerStyle={{ fontWeight: '600', color: '#1e40af', background: '#eff6ff', borderColor: '#bfdbfe' }}
                      value={grnPackagingType} 
                      onChange={e => setGrnPackagingType(e.target.value)}
                    >
                      {PACKAGING_MATERIAL_TYPES.map(type => (
                        <option key={type} value={type}>{type} ({type}s)</option>
                      ))}
                    </SearchableSelect>
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                      Item Comment / Inward Remark (Optional)
                    </label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. Received in good condition, batch certified high clarity, minor outer packaging scratch..." 
                      value={grnItemRemarks} 
                      onChange={e => setGrnItemRemarks(e.target.value)} 
                    />
                  </div>
                    </div>
                  </div>
              {/* Section 3: Specifications & Quantity Parameters (Individual Roll & Container Breakdown) */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Scale size={14} style={{ color: '#0284c7' }} /> Specifications & individual {grnPackagingType} Breakdown
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
                        <SearchableSelect className="form-control" value={grnFilmType} onChange={e => handleFilmTypeChange(e.target.value)}>
                          {Object.keys(FILM_DENSITIES).map(type => (
                            <option key={type} value={type}>
                              {type} ({getFilmSubstrateDensity(type)} g/cc)
                            </option>
                          ))}
                        </SearchableSelect>
                      </div>

                      {isMetalloceneEligibleFilm(grnFilmType) && (
                        <div className="form-group">
                          <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                            Metallocene Percentage (%)
                          </label>
                          <SearchableSelect 
                            className="form-control"
                            value={grnMetallocenePct}
                            onChange={e => handleMetallocenePctChange(e.target.value)}
                          >
                            <option value="">-- Select Metallocene % --</option>
                            {METALLOCENE_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </SearchableSelect>
                        </div>
                      )}

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Micron Gauge (Micron)</label>
                        <input type="number" className="form-control" placeholder="e.g. 12" value={grnMicron} onChange={e => handleMicronChange(e.target.value)} />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>Slit Width (mm)</label>
                        <input type="number" className="form-control" placeholder="e.g. 1000" value={grnWidthMm} onChange={e => handleWidthChange(e.target.value)} />
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
                          required={Boolean(grnCategory)}
                          placeholder="e.g. Process Cyan Ink / Ethyl Acetate Solvent / Doctor Blades 0.15mm" 
                          value={grnItemName} 
                          onChange={e => setGrnItemName(e.target.value)} 
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                          Unit of Measure (UOM) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <SearchableSelect className="form-control" value={grnUnit} onChange={e => setGrnUnit(e.target.value)}>
                          <option value="Kg">Kg</option>
                          <option value="Litres">Litres</option>
                          <option value="Meters">Meters</option>
                          <option value="Boxes">Boxes</option>
                          <option value="Rolls">Rolls</option>
                          <option value="Pcs">Pcs</option>
                          <option value="Drums">Drums</option>
                          <option value="Bags">Bags</option>
                          <option value="Cans">Cans</option>
                        </SearchableSelect>
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem', color: '#334155' }}>
                          Purchase Rate (₹ / {grnUnit}) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input 
                          type="number" 
                          step="any" 
                          className="form-control" 
                          required={Boolean(grnCategory)}
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
                          <th style={{ padding: '8px 10px', width: '130px' }}>
                            Est. Length (m)
                            <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: '400', textTransform: 'none', color: '#94a3b8' }}>
                              ({getFilmSubstrateDensity(grnFilmType)} g/cc)
                            </span>
                          </th>
                        )}
                        <th style={{ padding: '8px 10px' }}>Vendor {grnPackagingType} / Lot #</th>
                        <th style={{ padding: '8px 10px' }}>Comment / Remark</th>
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
                                    width: '85px', 
                                    padding: '4px 6px', 
                                    fontSize: '0.82rem', 
                                    borderRadius: '4px', 
                                    border: '1px solid #cbd5e1', 
                                    textAlign: 'right',
                                    fontWeight: '700',
                                    color: '#0369a1',
                                    background: '#f0f9ff'
                                  }}
                                  placeholder="m"
                                  value={item.lengthMeters}
                                  onChange={e => handleUpdateGrnItemRow(item.id, 'lengthMeters', e.target.value)}
                                  title={`Theoretical Length = (Net Weight ${item.netWeightKg || 0}kg × 1,000,000) / (${grnWidthMm || 1000}mm × ${grnMicron || 12}µ × ${getFilmSubstrateDensity(grnFilmType)} g/cc)`}
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

                            {/* Roll / Item Specific Remark */}
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
                                placeholder="Roll comment / remark"
                                value={item.itemRemarks || item.notes || ''}
                                onChange={e => {
                                  handleUpdateGrnItemRow(item.id, 'itemRemarks', e.target.value);
                                  handleUpdateGrnItemRow(item.id, 'notes', e.target.value);
                                }}
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
                        Inward Value: <strong>₹{((grnCalculatedTotals.totalNet || 0) * (parseFloat(grnPurchaseRate) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Breakdown Callout Box */}
              {(() => {
                const effectiveNetWeight = grnCalculatedTotals.totalNet > 0 
                  ? grnCalculatedTotals.totalNet 
                  : (parseFloat(grnWeightKg) || 0);
                const effectivePkgCount = grnCalculatedTotals.count > 0 
                  ? grnCalculatedTotals.count 
                  : (parseInt(grnRolls) || 1);
                const avgPerPkg = (effectiveNetWeight / Math.max(1, effectivePkgCount)).toFixed(2);
                const unitDisplay = grnCategory === 'Film Substrates' ? 'Kg' : grnUnit;

                const itemWeights = (grnItemsList || []).map((it, idx) => ({
                  unitNo: idx + 1,
                  netWeight: parseFloat(it.netWeightKg) || Number((effectiveNetWeight / Math.max(1, effectivePkgCount)).toFixed(2))
                }));

                const firstWt = itemWeights[0]?.netWeight || 0;
                const isVariableWeight = itemWeights.some(w => Math.abs(w.netWeight - firstWt) > 0.01);
                const weightDistributionStr = itemWeights
                  .map(w => `#${w.unitNo}: ${w.netWeight} ${unitDisplay}`)
                  .join(' | ');

                return (
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
                      <BarcodeIcon size={18} />
                    </div>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <strong style={{ color: '#047857' }}>Inward Package Breakdown & Barcode Generation:</strong>
                        <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '4px', border: '1px solid #86efac', fontWeight: '700' }}>
                          {isVariableWeight ? '⚡ Variable Dynamic Weights' : 'Equal Distribution'}
                        </span>
                      </div>
                      <div style={{ color: '#047857' }}>
                        <strong>{(effectiveNetWeight ?? 0).toLocaleString()} {unitDisplay}</strong> total net weight across <strong>{effectivePkgCount} {grnPackagingType}(s)</strong>
                        {effectivePkgCount > 1 && (
                          <span style={{ marginLeft: '4px', fontStyle: 'italic', color: '#065f46' }}>
                            (Avg: <strong>{avgPerPkg} {unitDisplay}</strong> per {grnPackagingType})
                          </span>
                        )}.
                      </div>
                      {effectivePkgCount > 1 && (
                        <div style={{ marginTop: '6px', fontSize: '0.77rem', background: 'rgba(255, 255, 255, 0.75)', padding: '6px 10px', borderRadius: '6px', border: '1px dashed #6ee7b7' }}>
                          <strong style={{ color: '#047857' }}>Dynamic Distribution Across Item Numbers:</strong>
                          <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>
                            {weightDistributionStr}
                          </div>
                        </div>
                      )}
                      <div style={{ marginTop: '4px', fontSize: '0.74rem', color: '#047857' }}>
                        ✓ {effectivePkgCount} unique 2D barcode sticker{effectivePkgCount > 1 ? 's' : ''} will be generated with these dynamic package weights.
                      </div>
                    </div>
                  </div>
                );
              })()}
                </div>
              ))}

              <div>
                <button
                  type="button"
                  onClick={handleAddAnotherGrnItem}
                  className={severalGrnItems ? 'btn-secondary' : undefined}
                  style={severalGrnItems
                    ? { padding: '8px 14px', fontSize: '0.84rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }
                    : { background: 'none', border: 'none', color: '#0284c7', fontWeight: '700', cursor: 'pointer', padding: '2px 0', fontSize: '0.86rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={14} /> Add another item
                </button>
                {grnPoNo && (
                  <button
                    type="button"
                    onClick={handleAddOtherPoLines}
                    style={{ background: 'none', border: 'none', color: '#475569', marginLeft: '16px', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', fontWeight: '600' }}
                  >
                    Add the other open PO lines
                  </button>
                )}
              </div>

              {severalGrnItems && (
                <div aria-live="polite" style={{ background: '#0f172a', color: '#ffffff', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '14px 22px', fontSize: '0.84rem' }}>
                  <span>{grnInvoiceTotals.items} items</span>
                  <span>{grnInvoiceTotals.rolls} rolls</span>
                  <span>{Number(grnInvoiceTotals.net || 0).toFixed(2)} kg net</span>
                  <span style={{ fontWeight: '800' }}>₹{Number(grnInvoiceTotals.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {/* Sticky Bottom Actions Footer */}
              <div className="modal-footer-bar">
                <button type="button" className="btn-secondary" onClick={() => { setIsNewGRNModalOpen(false); setEditingGrn(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', padding: '10px 22px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} /> Complete Inward & Submit to QC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Pop-Up Modal before saving Inward GRN */}
      {grnConfirmationModal.isOpen && grnConfirmationModal.pendingData && (() => {
        const p = grnConfirmationModal.pendingData;
        return (
          <div className="modal-overlay" style={{ zIndex: 10500 }} onClick={() => setGrnConfirmationModal({ isOpen: false, pendingData: null })}>
            <div 
              className="glass-card modal-content" 
              style={{ width: '640px', maxWidth: '95vw', background: '#ffffff', borderRadius: '16px', border: '1px solid #cbd5e1', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)', overflow: 'hidden' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '18px 24px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: 'rgba(56, 189, 248, 0.2)', padding: '10px', borderRadius: '10px', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    <Package size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>{p.mode === 'edit' ? 'Confirm GRN edit' : 'Confirm Inward GRN Registration'}</h3>
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>{p.mode === 'edit' ? 'This edit does not add stock. Pending QC is regenerated from these lines.' : 'Verify inward receipt details before generating barcodes & committing stock'}</p>
                  </div>
                </div>
                <button type="button" className="modal-close-btn" onClick={() => setGrnConfirmationModal({ isOpen: false, pendingData: null })}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '24px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '0.86rem' }}>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>GRN Ref Number</span><strong style={{ color: '#0284c7', fontSize: '1.05rem', fontWeight: '800' }}>{p.newGRN.grnNo}</strong></div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Supplier / Vendor</span><strong style={{ color: '#0f172a', fontWeight: '700' }}>{p.newGRN.vendorName}</strong></div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Invoice Number</span><strong style={{ color: '#0f172a', fontWeight: '700', fontFamily: 'monospace' }}>{p.newGRN.invoiceNo || 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Batch / Lot Number</span><strong style={{ color: '#0f172a', fontWeight: '700', fontFamily: 'monospace' }}>{p.newGRN.batchNo || 'N/A'}</strong></div>
                    <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Item Name / Spec</span><strong style={{ color: '#0f172a', fontWeight: '700' }}>{p.itemName}</strong>
                      {Array.isArray(p.newGRN.lineItems) && p.newGRN.lineItems.length > 1 && (
                        <div style={{ marginTop: '6px', fontSize: '0.78rem', color: '#334155' }}>
                          {p.newGRN.lineItems.map((line) => (
                            <div key={line.id}>Item {line.lineNo}: {line.itemName} — {line.netWeightKg} kg @ ₹{line.purchaseRate}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Individual Units / Barcodes</span><strong style={{ color: '#059669', fontWeight: '800' }}>{p.unitCount} Unit(s) (Separate Barcodes)</strong></div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Total Inward Net Qty</span><strong style={{ color: '#0f172a', fontWeight: '800' }}>{(p.totalNetQty ?? 0).toLocaleString()} {p.newGRN.unit || 'Kg'}</strong></div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Purchase Rate</span><strong style={{ color: '#0f172a', fontWeight: '700' }}>₹{p.rateVal} / {p.newGRN.unit || 'Kg'}</strong></div>
                    <div><span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>Total Purchase Valuation</span><strong style={{ color: '#2563eb', fontWeight: '800' }}>₹{(p.totalAmountVal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  </div>
                </div>

                <div style={{ background: p.isCylinderCategory ? '#ecfdf5' : '#eff6ff', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${p.isCylinderCategory ? '#a7f3d0' : '#bfdbfe'}`, fontSize: '0.82rem', color: p.isCylinderCategory ? '#065f46' : '#1e40af', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Info size={18} />
                  <div>
                    <strong>Stock & Barcode Rule:</strong> {p.isCylinderCategory ? 'Cylinder set will be auto-approved and added directly to active cylinder inventory.' : 'Each roll/unit will be registered individually with its distinct barcode sticker. Stock will enter QC Lab Approval inspection.'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="btn-secondary" style={{ padding: '10px 18px', fontWeight: '600' }} onClick={() => setGrnConfirmationModal({ isOpen: false, pendingData: null })}>
                    Edit / Go Back
                  </button>
                  <button type="button" className="btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', padding: '10px 24px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick={executeConfirmedSaveGRN}>
                    <CheckCircle2 size={18} /> {p.mode === 'edit' ? 'Save GRN edit' : 'Confirm & Register Inward GRN'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Success Animation Modal after saving Inward GRN */}
      {grnSuccessModal.isOpen && grnSuccessModal.grnRecord && (() => {
        const g = grnSuccessModal.grnRecord;
        const rolls = grnSuccessModal.newRolls || [];
        return (
          <div className="modal-overlay" style={{ zIndex: 10600 }} onClick={() => setGrnSuccessModal({ isOpen: false, grnRecord: null, newRolls: [] })}>
            <div 
              className="glass-card modal-content" 
              style={{ width: '620px', maxWidth: '95vw', background: '#ffffff', borderRadius: '20px', border: '1px solid #cbd5e1', boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.3)', overflow: 'hidden', textAlign: 'center' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ background: 'radial-gradient(circle at 50% 30%, #ecfdf5 0%, #ffffff 70%)', padding: '32px 24px 20px 24px', position: 'relative' }}>
                {/* Animated Success Checkmark Ring */}
                <div style={{ position: 'relative', width: '88px', height: '88px', margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', animation: 'pulseRing 2s infinite ease-out' }}></div>
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)', position: 'relative', zIndex: 2 }}>
                    <CheckCircle2 size={44} style={{ strokeWidth: 2.5 }} />
                  </div>
                </div>

                <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
                  GRN #{g.grnNo} Registered Successfully!
                </h2>
                <p style={{ fontSize: '0.84rem', color: '#475569', margin: 0 }}>
                  Inward receipt recorded & {rolls.length} individual barcode sticker(s) generated for unique item tracking.
                </p>

                {/* Quick Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '20px', textAlign: 'left' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Individual Barcodes</span>
                    <strong style={{ fontSize: '0.95rem', color: '#059669', fontWeight: '800' }}>{rolls.length} Sticker(s)</strong>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Total Inward Qty</span>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: '800' }}>{(g.netWeightKg || 0).toLocaleString()} {g.unit || 'Kg'}</strong>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>QC Status</span>
                    <strong style={{ fontSize: '0.85rem', color: g.status === 'Approved' ? '#059669' : '#d97706', fontWeight: '800' }}>{g.status}</strong>
                  </div>
                </div>
              </div>

              {/* Breakdown List of Barcodes */}
              <div style={{ padding: '0 24px 20px 24px', textAlign: 'left' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Generated Individual Item Barcodes ({rolls.length}):</span>
                  <span style={{ color: '#0284c7', fontSize: '0.74rem' }}>Invoice: {g.invoiceNo || 'N/A'}</span>
                </div>
                <div style={{ maxHeight: '130px', overflowY: 'auto', background: '#f1f5f9', padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {rolls.map((r, idx) => (
                    <div key={r.barcodeId || idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: idx < rolls.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>📦 {r.barcodeId}</span>
                      <span style={{ color: '#475569' }}>Item #{r.unitNo}: <strong>{r.netWeightKg} {r.unit || 'Kg'}</strong> {r.vendorRollNo ? `(Vendor Roll: ${r.vendorRollNo})` : ''}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ flex: 1, padding: '10px', fontWeight: '600', justifyContent: 'center' }} 
                    onClick={() => setGrnSuccessModal({ isOpen: false, grnRecord: null, newRolls: [] })}
                  >
                    Done / View Ledger
                  </button>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ flex: 1.3, background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', padding: '10px', fontWeight: '800', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '8px' }} 
                    onClick={() => {
                      const rollsToPrint = grnSuccessModal.newRolls;
                      setGrnSuccessModal({ isOpen: false, grnRecord: null, newRolls: [] });
                      setSelectedRollForBarcodeModal(rollsToPrint);
                    }}
                  >
                    <Printer size={18} /> Print Barcode Stickers ({rolls.length})
                  </button>
                </div>
              </div>

              <style>{`
                @keyframes pulseRing {
                  0% { transform: scale(0.95); opacity: 0.8; }
                  50% { transform: scale(1.15); opacity: 0.3; }
                  100% { transform: scale(0.95); opacity: 0.8; }
                }
              `}</style>
            </div>
          </div>
        );
      })()}

      {/* Modal: QC Inspection & Approval with Verified Inward Parameter Editor */}
      {qcInspectingGRN && (
        <div className="modal-overlay" onClick={() => setQcInspectingGRN(null)}>
          <div 
            className="glass-card modal-content modal-content-clean" 
            style={{ width: '840px', maxWidth: '96vw', maxHeight: '92vh' }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Executive Dark Header */}
            <div className="modal-header-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  background: 'rgba(16, 185, 129, 0.2)', 
                  padding: '10px', 
                  borderRadius: '10px', 
                  color: '#34d399', 
                  border: '1px solid rgba(52, 211, 153, 0.3)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                      QC Approval Lab & Physical Verification
                    </h3>
                    <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                      {qcInspectingGRN.grnNo}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Verify physical roll parameters (size, net weight, gauge, dyne). Correct any store inward discrepancies before inventory posting.
                  </p>
                </div>
              </div>
              {Array.isArray(qcInspectingGRN.lineItems) && qcInspectingGRN.lineItems.length > 1 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '0 0 12px' }}>
                  {qcInspectingGRN.lineItems.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => switchQcLine(line.id)}
                      style={{
                        border: line.id === qcActiveLineId ? '2px solid #059669' : '1px solid #cbd5e1',
                        background: line.id === qcActiveLineId ? '#ecfdf5' : '#fff',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Item {line.lineNo}: {line.itemName}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="modal-close-btn" onClick={() => setQcInspectingGRN(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="modal-body-scroll" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* SECTION 1: INWARD TIMESTAMP & RECEIPT METADATA STRIP */}
              <div style={{ 
                background: '#f8fafc', 
                border: '1px solid #e2e8f0', 
                borderRadius: '10px', 
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                fontSize: '0.82rem'
              }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} style={{ color: '#4f46e5' }} /> Inward Received At
                  </span>
                  <div style={{ fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                    {formatInwardTimestamp(qcInspectingGRN)}
                  </div>
                  {getInwardTimeAgo(qcInspectingGRN) && (
                    <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: '600', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>
                      ⏱️ {getInwardTimeAgo(qcInspectingGRN)} in queue
                    </span>
                  )}
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase' }}>
                    Supplier / Vendor
                  </span>
                  <div style={{ fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                    {qcInspectingGRN.vendorName || 'Supplier'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Inv: <strong>{qcInspectingGRN.invoiceNo || 'N/A'}</strong>
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase' }}>
                    PO Reference
                  </span>
                  <div style={{ fontWeight: '800', color: '#4f46e5', marginTop: '2px', fontFamily: 'monospace' }}>
                    {qcInspectingGRN.poNumber || 'Direct Inward'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Category: <strong>{qcInspectingGRN.category || 'Raw Material'}</strong>
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase' }}>
                    Store Inward Officer
                  </span>
                  <div style={{ fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>
                    {qcInspectingGRN.storeManager || 'Store Inward Desk'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '600' }}>
                    Dock Location: {qcInspectingGRN.location || 'Bay A'}
                  </div>
                </div>
              </div>

              {/* LIVE VARIANCE ALERT BANNER (If Any Edits Made) */}
              {qcVariances.length > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1px solid #fde68a',
                  borderLeft: '5px solid #f59e0b',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  boxShadow: '0 2px 6px -2px rgba(245, 158, 11, 0.15)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#92400e', fontSize: '0.9rem' }}>
                          Physical Measurement Variance Detected ({qcVariances.length} parameter{qcVariances.length > 1 ? 's' : ''} modified)
                        </strong>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#78350f' }}>
                          The verified lab values differ from original store inward entries. On approval, stock will reflect verified values and Admin & Store will be notified automatically.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQcEditNetWeightKg(qcInspectingGRN.netWeightKg !== undefined ? qcInspectingGRN.netWeightKg : '');
                        setQcEditGrossWeightKg(qcInspectingGRN.grossWeightKg !== undefined ? qcInspectingGRN.grossWeightKg : '');
                        setQcEditTareWeightKg(qcInspectingGRN.tareWeightKg !== undefined ? qcInspectingGRN.tareWeightKg : '');
                        setQcEditWidthMm(qcInspectingGRN.widthMm !== '-' && qcInspectingGRN.widthMm !== undefined ? qcInspectingGRN.widthMm : '');
                        setQcEditMicron(qcInspectingGRN.micron !== '-' && qcInspectingGRN.micron !== undefined ? qcInspectingGRN.micron : '');
                        setQcEditBatchNo(qcInspectingGRN.batchNo || '');
                        setQcEditFilmType(qcInspectingGRN.filmType || 'PET');
                        setQcEditRollsReceived(qcInspectingGRN.rollsReceived || 1);
                      }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #d97706',
                        color: '#b45309',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <RotateCcw size={12} /> Reset to Inward Values
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a', color: '#92400e' }}>
                          <th style={{ padding: '6px 10px', fontWeight: '700' }}>Parameter</th>
                          <th style={{ padding: '6px 10px', fontWeight: '700' }}>Store Inward (Original)</th>
                          <th style={{ padding: '6px 10px', fontWeight: '700' }}>QC Verified (New)</th>
                          <th style={{ padding: '6px 10px', fontWeight: '700' }}>Variance / Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qcVariances.map((v, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #fef3c7' }}>
                            <td style={{ padding: '6px 10px', fontWeight: '700', color: '#1e293b' }}>{v.label}</td>
                            <td style={{ padding: '6px 10px', color: '#64748b', fontFamily: 'monospace' }}>{v.oldVal}</td>
                            <td style={{ padding: '6px 10px', color: '#059669', fontWeight: '800', fontFamily: 'monospace' }}>{v.newVal}</td>
                            <td style={{ padding: '6px 10px', color: '#b45309', fontWeight: '700' }}>{v.diff}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECTION 2: EDITABLE VERIFIED INWARD SPECIFICATIONS & WEIGHTS */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Scale size={18} style={{ color: '#059669' }} />
                    <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a' }}>
                      Verified Physical Inward Specifications (Editable)
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                    ✏️ Edits will update GRN & Inventory on Approval
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                  
                  {/* Film Substrate / Material Type */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Material Substrate
                    </label>
                    <SearchableSelect
                      className="form-control"
                      value={qcEditFilmType}
                      onChange={e => setQcEditFilmType(e.target.value)}
                      triggerStyle={{ fontSize: '0.85rem', fontWeight: '600' }}
                    >
                      <option value="BOPP">BOPP (Plain)</option>
                      <option value="PET">PET (Polyester)</option>
                      <option value="METPET">METPET (Metalized PET)</option>
                      <option value="METBOPP">METBOPP (Metalized BOPP)</option>
                      <option value="CPP">CPP (Cast Polypropylene)</option>
                      <option value="METCPP">METCPP (Metalized CPP)</option>
                      <option value="NYLON">NYLON / BOPA</option>
                      <option value="LDPE">LDPE Natural / Milky</option>
                      <option value="ALU FOIL">Aluminium Foil</option>
                      <option value="PAPER">Kraft / Chromo Paper</option>
                      <option value={qcInspectingGRN.filmType || 'Generic'}>{qcInspectingGRN.filmType || 'Other Category'}</option>
                    </SearchableSelect>
                  </div>

                  {/* Width (mm) */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Roll Width (mm)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="e.g. 500"
                      value={qcEditWidthMm}
                      onChange={e => setQcEditWidthMm(e.target.value)}
                      style={{ fontSize: '0.85rem', fontWeight: '700' }}
                    />
                  </div>

                  {/* Thickness / Micron */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Thickness (Micron µ)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="e.g. 12"
                      value={qcEditMicron}
                      onChange={e => setQcEditMicron(e.target.value)}
                      style={{ fontSize: '0.85rem', fontWeight: '700' }}
                    />
                  </div>

                  {/* Rolls / Unit Count */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Rolls / Units Received
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      placeholder="1"
                      value={qcEditRollsReceived}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10) || 1;
                        setQcEditRollsReceived(val);
                      }}
                      style={{ fontSize: '0.85rem', fontWeight: '700' }}
                    />
                  </div>

                  {/* Net Weight (Kg) - Core Inventory Weight */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#047857', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Verified Net Wt (Kg) *</span>
                      <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '600' }}>Active Stock</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="e.g. 1250.5"
                      value={qcEditNetWeightKg}
                      onChange={e => setQcEditNetWeightKg(e.target.value)}
                      style={{ 
                        fontSize: '0.92rem', 
                        fontWeight: '800', 
                        color: '#065f46', 
                        background: '#f0fdf4', 
                        borderColor: '#86efac' 
                      }}
                    />
                  </div>

                  {/* Gross Weight (Kg) */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Gross Weight (Kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="e.g. 1270.0"
                      value={qcEditGrossWeightKg}
                      onChange={e => {
                        const gross = parseFloat(e.target.value) || 0;
                        const tare = parseFloat(qcEditTareWeightKg) || 0;
                        setQcEditGrossWeightKg(e.target.value);
                        if (gross > 0 && tare >= 0) {
                          setQcEditNetWeightKg(Number(Math.max(0, gross - tare).toFixed(2)));
                        }
                      }}
                      style={{ fontSize: '0.85rem', fontWeight: '600' }}
                    />
                  </div>

                  {/* Tare Weight (Kg) */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Tare / Core Weight (Kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="e.g. 19.5"
                      value={qcEditTareWeightKg}
                      onChange={e => {
                        const tare = parseFloat(e.target.value) || 0;
                        const gross = parseFloat(qcEditGrossWeightKg) || 0;
                        setQcEditTareWeightKg(e.target.value);
                        if (gross > 0 && tare >= 0) {
                          setQcEditNetWeightKg(Number(Math.max(0, gross - tare).toFixed(2)));
                        }
                      }}
                      style={{ fontSize: '0.85rem', fontWeight: '600' }}
                    />
                  </div>

                  {/* Manufacturer Batch # */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Manufacturer Batch #
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Batch / Lot ID"
                      value={qcEditBatchNo}
                      onChange={e => setQcEditBatchNo(e.target.value)}
                      style={{ fontSize: '0.85rem', fontWeight: '700', fontFamily: 'monospace' }}
                    />
                  </div>

                </div>
              </div>

              {/* SECTION 3: MULTI-ROLL BREAKDOWN (If more than 1 roll) */}
              {(parseInt(qcEditRollsReceived, 10) > 1 || qcEditItemsBreakdown.length > 1) && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1e293b' }}>
                      Individual Roll Breakdown ({qcEditItemsBreakdown.length || qcEditRollsReceived} Rolls)
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Verify or edit individual roll net weights
                    </span>
                  </div>

                  <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                          <th style={{ padding: '4px 8px' }}>Roll #</th>
                          <th style={{ padding: '4px 8px' }}>Barcode ID</th>
                          <th style={{ padding: '4px 8px' }}>Vendor Roll No</th>
                          <th style={{ padding: '4px 8px' }}>Net Weight (Kg)</th>
                          <th style={{ padding: '4px 8px' }}>Gross Weight (Kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qcEditItemsBreakdown.map((item, idx) => (
                          <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '4px 8px', fontWeight: '700' }}>Roll {item.unitNo || idx + 1}</td>
                            <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#4f46e5' }}>{item.barcodeId}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <input 
                                type="text"
                                className="form-control"
                                style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                value={item.vendorRollNo || ''}
                                onChange={e => {
                                  const updated = [...qcEditItemsBreakdown];
                                  updated[idx] = { ...updated[idx], vendorRollNo: e.target.value };
                                  setQcEditItemsBreakdown(updated);
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px' }}>
                              <input 
                                type="number"
                                step="any"
                                className="form-control"
                                style={{ padding: '2px 6px', fontSize: '0.75rem', fontWeight: '700', width: '90px' }}
                                value={item.netWeightKg || ''}
                                onChange={e => {
                                  const updated = [...qcEditItemsBreakdown];
                                  updated[idx] = { ...updated[idx], netWeightKg: parseFloat(e.target.value) || 0 };
                                  setQcEditItemsBreakdown(updated);
                                  const totalNet = updated.reduce((s, it) => s + (parseFloat(it.netWeightKg) || 0), 0);
                                  setQcEditNetWeightKg(Number(totalNet.toFixed(2)));
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px' }}>
                              <input 
                                type="number"
                                step="any"
                                className="form-control"
                                style={{ padding: '2px 6px', fontSize: '0.75rem', width: '90px' }}
                                value={item.grossWeightKg || ''}
                                onChange={e => {
                                  const updated = [...qcEditItemsBreakdown];
                                  updated[idx] = { ...updated[idx], grossWeightKg: parseFloat(e.target.value) || 0 };
                                  setQcEditItemsBreakdown(updated);
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECTION 4: LABORATORY QUALITY TESTING PARAMETERS */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '10px', display: 'block' }}>
                  Laboratory Quality Parameters & Surface Treatment
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Corona Dyne Level (dynes/cm)
                    </label>
                    <SearchableSelect
                      className="form-control"
                      value={qcEditDyneLevel}
                      onChange={e => setQcEditDyneLevel(e.target.value)}
                      triggerStyle={{ fontSize: '0.82rem' }}
                    >
                      <option value="38-42">38 - 42 Dynes (Standard Printing Grade)</option>
                      <option value="42-44">42 - 44 Dynes (High-Ink Wetting)</option>
                      <option value=">44">&gt; 44 Dynes (Special Surface Treated)</option>
                      <option value="<38">&lt; 38 Dynes (Low / Non-Treated)</option>
                      <option value="N/A">N/A (Non-film / Solvents / Inks)</option>
                    </SearchableSelect>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Micron Gauge Tolerance
                    </label>
                    <SearchableSelect
                      className="form-control"
                      value={qcEditGaugeVariance}
                      onChange={e => setQcEditGaugeVariance(e.target.value)}
                      triggerStyle={{ fontSize: '0.82rem' }}
                    >
                      <option value="±0.5">±0.5 µ (Excellent Gauge Uniformity)</option>
                      <option value="±1.0">±1.0 µ (Standard Commercial Tolerance)</option>
                      <option value="±1.5">±1.5 µ (Marginal Variation)</option>
                      <option value=">±2.0">&gt; ±2.0 µ (High Variation / Non-Uniform)</option>
                    </SearchableSelect>
                  </div>
                </div>

                {/* Visual Defects Checklist */}
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                    Physical Quality & Core Inspection Checklist
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                    {[
                      { key: 'noPinholes', label: 'No Pinholes / Eyelets' },
                      { key: 'noScratches', label: 'No Scratches / Lines' },
                      { key: 'coreIntact', label: '76mm Core Intact' },
                      { key: 'uniformWinding', label: 'Uniform Winding & Edge' },
                      { key: 'noOdor', label: 'Odorless / Pure Substrate' }
                    ].map(chk => (
                      <label key={chk.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#334155', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={qcVisualChecks[chk.key]}
                          onChange={e => setQcVisualChecks({ ...qcVisualChecks, [chk.key]: e.target.checked })}
                          style={{ accentColor: '#059669', width: '15px', height: '15px' }}
                        />
                        <span>{chk.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 5: QC NOTES & TEST OBSERVATIONS */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontWeight: '700', fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>
                  QC Chemist Lab Observations & Test Notes
                </label>
                <textarea 
                  className="form-control"
                  style={{ minHeight: '80px', fontSize: '0.83rem' }}
                  placeholder="Enter tensile observations, gauge micrometer reading across width, dyne pen test result, or notes on spec modifications..."
                  value={qcNotesInput}
                  onChange={e => setQcNotesInput(e.target.value)}
                />
              </div>

            </div>

            {/* Sticky Executive Footer */}
            <div className="modal-footer-bar">
              <button 
                type="button"
                className="btn-secondary" 
                style={{ border: '1px solid #fca5a5', color: '#dc2626', background: '#fef2f2', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }} 
                onClick={() => handleQCAction('Rejected')}
              >
                <XCircle size={16} /> Reject Material (Transfer to QC Hold)
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setQcInspectingGRN(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  className="btn-primary" 
                  style={{ 
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', 
                    fontWeight: '800', 
                    padding: '10px 22px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                  }} 
                  onClick={() => handleQCAction('Approved')}
                >
                  <CheckCircle2 size={18} /> Approve & Add Verified Stock to Inventory
                </button>
              </div>
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
                          (inventory || []).some(i => codesEqual(i.id, clean) || codesEqual(i.itemCode, clean) || codesEqual(i.lastBatch, clean) || codesEqual(i.productCode, clean) || codesEqual(i.id, stripped) || codesEqual(i.itemCode, stripped)) ||
                          (inventoryRolls || []).some(r => codesEqual(r.barcodeId, clean) || codesEqual(r.batchNo, clean)) ||
                          (safeGrns || []).some(g => codesEqual(g.batchNo, clean) || codesEqual(g.grnNo, clean)) ||
                          (inks || []).some(ink => codesEqual(ink.productCode, clean) || codesEqual(ink.productCode, stripped));
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
                <SearchableSelect 
                  className="form-control" 
                  value={scannedItemDetails?.item?.id || ''} 
                  triggerStyle={{ fontSize: '0.82rem' }}
                  placeholder="-- Choose Item from Inventory Directory --"
                  onChange={e => {
                    const found = (inventory || []).find(i => i.id === e.target.value);
                    if (found) {
                      setIssueScanQuery(found.id);
                      handleBarcodeScanLookup(found.id);
                    }
                  }}
                >
                  <option value="">-- Choose Item from Inventory Directory --</option>
                  {(inventory || []).filter(i => isInventoryItemActive(i)).filter(i => {
                    const s = (stockSearchTerm || '').toLowerCase();
                    const filmType = codeKey(i.filmType);
                    const itemName = codeKey(i.itemName);
                    const id = codeKey(i.id);
                    const loc = codeKey(i.location);
                    return filmType.includes(s) || itemName.includes(s) || id.includes(s) || loc.includes(s);
                  }).map(i => (
                    <option key={i.id} value={i.id}>
                      {i.id} - {i.itemName || `${i.filmType} ${i.micron}µ`} | Avail: {i.availableQtyKg} {i.unit || 'Kg'} | Rate: ₹{i.unitPrice || 0}
                    </option>
                  ))}
                </SearchableSelect>
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.76rem', color: '#475569', flexWrap: 'wrap', gap: '6px' }}>
                  <span>
                    Available in Scanned Roll/Batch: <strong style={{ color: '#047857', fontSize: '0.85rem' }}>{scannedItemDetails.availableQty} {scannedItemDetails.unit || 'Kg'}</strong>
                    {scannedItemDetails.item && (Number(scannedItemDetails.item.availableQtyKg || scannedItemDetails.item.currentStockKg) > 0) && (
                      <span style={{ color: '#64748b', marginLeft: '6px' }}>
                        (Total Item Stock: <strong>{scannedItemDetails.item.availableQtyKg || scannedItemDetails.item.currentStockKg} {scannedItemDetails.unit || 'Kg'}</strong>)
                      </span>
                    )}
                  </span>
                  {scannedItemDetails.grnNo && <span>GRN Ref: <strong>{scannedItemDetails.grnNo}</strong></span>}
                </div>

                {(scannedItemDetails.itemRemarks || scannedItemDetails.matchedRoll?.itemRemarks || scannedItemDetails.matchedGrn?.itemRemarks) && (
                  <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#0369a1', fontWeight: '600' }}>
                    💬 Remark: <strong>{scannedItemDetails.itemRemarks || scannedItemDetails.matchedRoll?.itemRemarks || scannedItemDetails.matchedGrn?.itemRemarks}</strong>
                  </div>
                )}

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
                <SearchableSelect 
                  className="form-control" 
                  value={issueJobName || activeProductionOrders[0]?.jobName || ''} 
                  onChange={e => setIssueJobName(e.target.value)}
                  triggerStyle={{ fontWeight: '600' }}
                  placeholder="-- Select Active Production Job --"
                >
                  <option value="">-- Select Active Production Job --</option>
                  {activeProductionOrders.map(o => (
                    <option key={o.id} value={o.jobName}>
                      {o.jobName} ({o.id}) {o.clientName ? `- ${o.clientName}` : ''}
                    </option>
                  ))}
                </SearchableSelect>
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
                  <Tag size={15} /> 1. Category, Item Name & Substrate/Grade Mapping
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Item Name / Description (ItemName) *</label>
                    <input 
                      type="text" 
                      className="form-control"
                      required
                      placeholder="e.g. PET Film 12 Micron or Ethyl Acetate Solvent Grade"
                      value={editItemName}
                      onChange={e => setEditItemName(e.target.value)}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Exact item title used for inventory mapping, stock ledger & POs</span>
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Material Category (Category) *</label>
                    <SearchableSelect 
                      className="form-control"
                      value={editCategory}
                      onChange={e => handleCategoryChangeInEdit(e.target.value)}
                    >
                      {INVENTORY_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </SearchableSelect>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Select target stock category</span>
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Substrate or Grade (SubstrateOrGrade) *</label>
                    {editCategory === 'Film Substrates' ? (
                      <SearchableSelect 
                        className="form-control"
                        value={editSubstrateOrGrade || editFilmType}
                        onChange={e => {
                          setEditSubstrateOrGrade(e.target.value);
                          setEditFilmType(e.target.value);
                        }}
                      >
                        {Object.keys(FILM_DENSITIES).map(type => (
                          <option key={type} value={type}>{type} ({FILM_DENSITIES[type]} g/cc)</option>
                        ))}
                      </SearchableSelect>
                    ) : (
                      <>
                        <input 
                          type="text" 
                          className="form-control"
                          list="standard-substrates-list"
                          placeholder="e.g. Reverse Ink - Process Cyan / Ethyl Acetate / SL Adhesive"
                          value={editSubstrateOrGrade}
                          onChange={e => {
                            setEditSubstrateOrGrade(e.target.value);
                            setEditSubType(e.target.value);
                          }}
                        />
                        <datalist id="standard-substrates-list">
                          <option value="Reverse Ink - Process Cyan" />
                          <option value="Reverse Ink - Process Magenta" />
                          <option value="Reverse Ink - Process Yellow" />
                          <option value="Reverse Ink - Process Black" />
                          <option value="Reverse Ink - White High Opacity" />
                          <option value="Surface Ink - Gloss White" />
                          <option value="Surface Ink - Process Red" />
                          <option value="Ethyl Acetate" />
                          <option value="Toluene" />
                          <option value="Isopropanol (IPA)" />
                          <option value="MIBK (Methyl Isobutyl Ketone)" />
                          <option value="Ethyl Cellosolve" />
                          <option value="Solvent-less Adhesive Component A" />
                          <option value="Solvent-less Adhesive Component B" />
                          <option value="SL Adhesive" />
                          <option value="Solvent-based Adhesive" />
                          <option value="Hardener" />
                          <option value="3 Inch Paper Core" />
                          <option value="6 Inch Paper Core" />
                          <option value="Stretch Film" />
                        </datalist>
                      </>
                    )}
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Used for system density, GSM calculations & raw material mapping</span>
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
                    <SearchableSelect 
                      className="form-control"
                      value={editUnit}
                      onChange={e => setEditUnit(e.target.value)}
                    >
                      {INVENTORY_UOMS.map(u => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                </div>
              </div>

              {/* Technical Specifications (Category Adaptive) */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-brand)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={15} /> 2. Technical Specifications & Gauge
                </div>

                {editCategory === 'Film Substrates' ? (
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="form-group">
                      <label>Micron Gauge (Micron) *</label>
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

                    {isMetalloceneEligibleFilm(editSubstrateOrGrade || editFilmType) && (
                      <div className="form-group">
                        <label style={{ fontWeight: '600', fontSize: '0.83rem' }}>Metallocene Percentage (%)</label>
                        <SearchableSelect 
                          className="form-control"
                          value={editMetallocenePct}
                          onChange={e => {
                            const val = e.target.value;
                            setEditMetallocenePct(val);
                            setEditItemName(formatFilmItemName(editSubstrateOrGrade || editFilmType, editWidthMm, editMicron, '', val));
                          }}
                        >
                          <option value="">-- Select Metallocene % --</option>
                          {METALLOCENE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </SearchableSelect>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Calculated Density</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        disabled 
                        value={`${FILM_DENSITIES[editSubstrateOrGrade || editFilmType] || 1.0} g/cm³`}
                        style={{ opacity: 0.7, background: 'rgba(255,255,255,0.05)' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <div className="form-group">
                      <label>Additional Notes / Spec Details</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="e.g. High Purity Grade / Gloss Finish"
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
                  <Trash2 size={16} /> {(editingStockItem?.subItems || [editingStockItem]).every((sub) => sub && !isInventoryItemActive(sub)) ? 'Reactivate' : 'Delete / Archive'}
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
      {deletePrompt && (() => {
        const mode = deletePrompt.preview?.mode || 'delete';
        const onHandRolls = (deletePrompt.preview?.items || []).flatMap((item) => item.rolls || []);
        const title = mode === 'reactivate' ? 'Reactivate stock item' : mode === 'archive' ? 'Deactivate / Archive' : mode === 'write_off' ? 'Stock must be cleared first' : 'Delete unused stock item';
        const submitLabel = deletePrompt.busy
          ? 'Saving…'
          : mode === 'reactivate'
            ? 'Reactivate'
            : mode === 'archive'
              ? 'Deactivate / Archive'
              : mode === 'write_off'
                ? 'Write off remaining stock & archive'
                : 'Delete unused item';
        return (
        <div className="modal-overlay" onClick={() => { if (!deletePrompt.busy) setDeletePrompt(null); }}>
          <div className="glass-card modal-content" style={{ width: '600px', maxWidth: '95vw' }} onClick={(event) => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem' }}>{title}</h3>
            <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <strong>{deletePrompt.label}</strong> ({deletePrompt.ids.join(', ')}).
            </p>
            {!deletePrompt.preview ? (
              <p style={{ fontSize: '0.88rem' }}>Checking transactions and stock on hand…</p>
            ) : mode === 'delete' ? (
              <p style={{ fontSize: '0.88rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                This item has never been used. No rolls, receipts, issues, or ledger entries will be removed. Only the unused master record is deleted.
              </p>
            ) : mode === 'archive' ? (
              <p style={{ fontSize: '0.88rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '12px', color: '#9a3412' }}>
                This item cannot be deleted because it has transactions. Deactivate / Archive hides it from stock lists and from new GRNs, issues, and consumption. The ledger, rolls, barcodes, and job history stay viewable. An authorised user can reactivate it.
              </p>
            ) : mode === 'write_off' ? (
              <div style={{ fontSize: '0.88rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', color: '#991b1b' }}>
                <p style={{ margin: '0 0 8px' }}>
                  This item cannot be deleted, and it cannot be archived while <strong>{Number(deletePrompt.preview.onHandKg || 0).toLocaleString('en-IN')} kg</strong> is still on hand
                  ({deletePrompt.preview.onHandRolls || 0} In Stock or QC Hold roll{(deletePrompt.preview.onHandRolls || 0) === 1 ? '' : 's'}).
                  Write the stock off, scrap it, or transfer it with a stock adjustment. A write-off posts an adjustment out and marks each barcode Written Off.
                </p>
                {onHandRolls.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#7f1d1d' }}>
                    {onHandRolls.map((roll) => (
                      <label key={roll.barcode} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={(deletePrompt.selectedBarcodes || []).includes(roll.barcode)}
                          onChange={(event) => setDeletePrompt((prev) => {
                            if (!prev) return prev;
                            const current = new Set(prev.selectedBarcodes || []);
                            if (event.target.checked) current.add(roll.barcode);
                            else current.delete(roll.barcode);
                            return { ...prev, selectedBarcodes: [...current] };
                          })}
                        />
                        <span>{roll.barcode} · {roll.kg} kg · {roll.status}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.88rem' }}>
                Reactivate this archived item. Its history was not removed. A reason is written to the audit log.
              </p>
            )}
            <form onSubmit={confirmDeleteStockItems}>
              <label style={{ display: 'block', fontWeight: '700', margin: '12px 0 6px' }} htmlFor="delete-stock-reason">Reason (required)</label>
              <textarea
                id="delete-stock-reason"
                className="form-control"
                required
                maxLength={2000}
                value={deletePrompt.reason}
                onChange={(event) => setDeletePrompt((prev) => prev ? { ...prev, reason: event.target.value, error: '' } : prev)}
                placeholder={mode === 'reactivate' ? 'Why is this item being reactivated?' : 'Why is this stock item being deleted, archived, or written off?'}
                style={{ minHeight: '80px' }}
              />
              {deletePrompt.error && (
                <p style={{ color: '#b91c1c', fontSize: '0.84rem', margin: '8px 0 0' }}>{deletePrompt.error}</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn-secondary" disabled={deletePrompt.busy} onClick={() => setDeletePrompt(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={deletePrompt.busy || !deletePrompt.preview || !deletePrompt.reason.trim()} style={{ background: mode === 'reactivate' ? '#0369a1' : '#dc2626', borderColor: mode === 'reactivate' ? '#0369a1' : '#dc2626' }}>
                  {submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}
      {/* Raw Material Stock Ledger & Barcode Tracking Modal */}
      {selectedItemForPurchaseHistory && (() => {
        const item = sanitizeInventoryItem(selectedItemForPurchaseHistory);
        const unitStr = item.unit || 'Kg';
        const itemActualUnitPrice = Number(item.unitPrice || item.purchaseRatePerKg || item.pricePerKg || 0);

        // A ledger row belongs to this item by id. A row with no item id may
        // match an exact name and is shown as unlinked / legacy.
        const itemLink = (candidate) => ledgerRowLink(candidate, item);
        const isItemMatch = (candidate) => itemLink(candidate).include;
        const fallbackRate = itemActualUnitPrice || (DEFAULT_DAILY_RATES[item.filmType] || 0);

        // 1. Gather Inward Receipts (GRNs)
        const matchingGRNs = (grns || []).filter(g => isItemMatch(g, item));
        const inwardTxLines = matchingGRNs.map(g => {
          const txId = `GRN_${g.grnNo || g.id}`;
          const isApproved = g.status === 'Approved' || g.qcStatus === 'Approved';
          const isRejected = g.status === 'Rejected' || g.qcStatus === 'Rejected' || g.status === 'QC Hold' || g.qcStatus === 'QC Hold' || g.location === 'QC Hold Store';
          const isPending = !isApproved && !isRejected;

          const rate = ledgerRowRate(g, itemActualUnitPrice || (DEFAULT_DAILY_RATES[g.filmType] || 0));
          const qty = g.netWeightKg || 0;
          // Find actual child rolls associated with this GRN
          const matchingRolls = (inventoryRolls || []).filter(r => 
            ((r.grnNo && g.grnNo && r.grnNo === g.grnNo) ||
            (r.grn_no && g.grnNo && r.grn_no === g.grnNo) ||
            (r.grnNo && g.id && r.grnNo === g.id))
            && rollBelongsOnItemLedger(r, item).include
            && !findRetiredBarcode(deletedBarcodes, r.barcodeId || r.barcode || r.id)
          );

          let resolvedBarcode = '';
          if (customBarcodesMap[txId]) {
            resolvedBarcode = customBarcodesMap[txId];
          } else if (matchingRolls.length > 0) {
            resolvedBarcode = matchingRolls.map(r => r.barcodeId || r.id).filter(Boolean).join(', ');
          } else if (Array.isArray(g.itemsBreakdown) && g.itemsBreakdown.some(b => b.barcodeId)) {
            resolvedBarcode = g.itemsBreakdown.map(b => b.barcodeId).filter(Boolean).join(', ');
          } else if (Array.isArray(g.barcodes) && g.barcodes.length > 0) {
            resolvedBarcode = g.barcodes.join(', ');
          } else if (codeStartsWith(g.barcodeId, 'RM-BC') || codeStartsWith(g.barcodeId, 'CON-BC')) {
            resolvedBarcode = textFrom(g.barcodeId);
          } else {
            const isFilmGRN = (g.category || 'Film Substrates') === 'Film Substrates';
            const specSuffix = isFilmGRN && g.widthMm && g.widthMm !== '-' ? `-${g.micron || '12'}M${g.widthMm}W` : '';
            resolvedBarcode = `${isFilmGRN ? 'RM-BC' : 'CON-BC'}-${g.grnNo || g.id}${specSuffix}`;
          }

          const grnRemark = g.itemRemarks || g.remarks || g.notes || '';
          const rollRemarksStr = matchingRolls.map(r => r.itemRemarks || r.remarks || r.notes).filter(Boolean).join('; ');
          const finalRemark = (grnRemark || rollRemarksStr || '').trim();

          let typeStr = '📥 GRN Inward (Approved)';
          let statusStr = 'Approved';
          if (isPending) {
            typeStr = '⏳ GRN Inward (Awaiting QC Approval)';
            statusStr = 'Pending QC Approval';
          } else if (isRejected) {
            typeStr = '🚫 GRN Inward (Rejected - QC Hold Store)';
            statusStr = 'QC Hold Store';
          }

          return {
            txId,
            category: 'inward',
            type: typeStr,
            isPendingQC: isPending,
            isRejected: isRejected,
            date: g.receivedDate || g.created_at || new Date().toISOString().split('T')[0],
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
            barcode: resolvedBarcode,
            batchNo: g.batchNo || `GRN-${g.grnNo}`,
            invoiceNo: g.invoiceNo || '',
            status: statusStr,
            itemRemarks: finalRemark,
            remarks: finalRemark,
            notes: `${g.rollsReceived || matchingRolls.length || 1} pkg/roll(s) | Barcode: ${resolvedBarcode}${finalRemark ? ` | Remark: ${finalRemark}` : ''}`,
            legacy: itemLink(g).legacy
          };
        });

        // 1b. Ensure sub-items / inward lots with distinct inward dates appear in inwardTxLines
        if (item.subItems && item.subItems.length > 0) {
          item.subItems.forEach(sub => {
            const alreadyIncluded = matchingGRNs.some(g => 
              (g.stockItemId && String(g.stockItemId) === String(sub.id)) || 
              (g.itemId && String(g.itemId) === String(sub.id))
            );
            if (!alreadyIncluded && sub.availableQtyKg > 0) {
              const txId = `INVT_LOT_${sub.id}`;
              const oldestDate = getItemInwardDate(sub, safeGrns, inventoryRolls);
              const inDate = sub.inwardDate || sub.receivedDate || sub.created_at || (oldestDate ? oldestDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
              const rate = parseFloat(sub.unitPrice || sub.purchaseRatePerKg) || itemActualUnitPrice;
              
              const isFilmSub = (sub.category || 'Film Substrates') === 'Film Substrates';
              const filmPrefix = isFilmSub ? 'RM-BC' : 'CON-BC';
              let barcodeVal = '';
              if (customBarcodesMap[txId]) {
                barcodeVal = customBarcodesMap[txId];
              } else if (codeStartsWith(sub.barcodeId, 'RM-BC') || codeStartsWith(sub.barcodeId, 'CON-BC')) {
                barcodeVal = textFrom(sub.barcodeId);
              } else if (codeStartsWith(sub.barcode, 'RM-BC') || codeStartsWith(sub.barcode, 'CON-BC')) {
                barcodeVal = textFrom(sub.barcode);
              } else {
                const specSuffix = isFilmSub && sub.widthMm && sub.widthMm !== '-' 
                  ? `-${sub.micron || '12'}M${sub.widthMm}W` 
                  : '';
                barcodeVal = `${filmPrefix}-${sub.id}${specSuffix}`;
              }
              
              inwardTxLines.push({
                txId,
                category: 'inward',
                type: '📥 Direct Inward Lot',
                isPendingQC: false,
                date: inDate,
                refNo: sub.id,
                subRef: sub.itemCode ? `Code: ${sub.itemCode}` : 'Stock Inward Lot',
                partyName: sub.lastVendor || sub.vendor || 'Supplier',
                subParty: `Location: ${sub.location || 'Bay A'}`,
                inwardQtyKg: sub.availableQtyKg,
                outwardQtyKg: 0,
                adjQtyKg: 0,
                ratePerKg: rate,
                unitPrice: rate,
                totalValue: sub.availableQtyKg * rate,
                barcode: barcodeVal,
                batchNo: sub.lastBatch || `BATCH-${sub.id}`,
                status: 'In Stock',
                notes: `Inward Lot ${sub.id} (${sub.availableQtyKg} kg) | Inward Date: ${inDate}`
              });
            }
          });
        }

        // 2. Gather Job Material Consumptions from Production Records
        const jobUsageLines = [];
        (productionRecords || []).forEach(rec => {
          (rec.materialsList || []).forEach((mat, idx) => {
            if (isItemMatch(mat, item)) {
              const txId = `JOB_${rec.id}_${mat.id || idx}`;
              const qty = mat.netConsumedQtyKg || mat.issueQtyKg || 0;
              const rate = ledgerRowRate(mat, fallbackRate);
              jobUsageLines.push({
                txId,
                category: 'usage',
                type: '📤 Job Production Usage',
                date: rec.dateFilled || rec.approvalDate || rec.created_at || new Date().toISOString().split('T')[0],
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
                notes: `Gross Issued: ${mat.issueQtyKg || 0} ${unitStr} | Returned: ${mat.returnQtyKg || 0} ${unitStr} | Net: ${qty} ${unitStr}`,
                legacy: itemLink(mat).legacy
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
            const rate = ledgerRowRate(tx, fallbackRate);
            return {
              txId: tx.id,
              category: isIssue ? 'usage' : 'inward',
              type: isIssue ? '📤 Store Issue' : '📥 Store Return',
              date: tx.date || tx.created_at || new Date().toISOString().split('T')[0],
              refNo: tx.jobName || (isIssue ? 'Store Issue' : 'Store Return'),
              subRef: `Req: ${tx.id}`,
              partyName: tx.vendorName || tx.issuedBy || item.lastVendor || 'Store Manager',
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
              notes: tx.notes || (isIssue ? 'Manual shopfloor issue' : 'Unused stock returned'),
              legacy: itemLink(tx).legacy
            };
          });

        // 4. Gather Physical Reconciliation & Quick Adjustments
        const adjLines = (stockLedgerAdjustments || [])
          .filter(a => isItemMatch(a, item) && !isOpeningStockReceipt(a))
          .map(a => {
            const txId = `ADJ_${a.id}`;
            const qty = a.qtyKg || 0;
            const rate = ledgerRowRate(a, itemActualUnitPrice);
            return {
              txId,
              category: 'reconciliation',
              type: a.type || (qty >= 0 ? '⚖️ Physical Audit (+)' : '⚖️ Physical Audit (-)'),
              date: a.date || a.created_at || new Date().toISOString().split('T')[0],
              refNo: `Audit Ref: ${a.id}`,
              subRef: a.type || 'Audit Variance',
              partyName: a.adjustedBy || 'Store Manager',
              subParty: 'Physical Inventory Audit',
              inwardQtyKg: qty > 0 ? qty : 0,
              outwardQtyKg: qty < 0 ? Math.abs(qty) : 0,
              adjQtyKg: qty,
              ratePerKg: rate,
              totalValue: Math.abs(qty) * rate,
              barcode: customBarcodesMap[txId] || a.barcode || `BAR-AUDIT-${a.id}`,
              status: 'Reconciled',
              notes: a.reason || 'Physical Stock Reconciliation',
              legacy: itemLink(a).legacy
            };
          });

        // 4b. Gather Active Customer Order Stock Reservations
        const ledgerResInfo = getItemReservations(item);
        const orderResTxLines = (ledgerResInfo.reservations || []).map((res, rIdx) => {
          const txId = `RES_${res.orderId}_${res.reqId || rIdx}`;
          const rate = itemActualUnitPrice;
          const isFully = res.isFullyReserved;
          const orderDate = res.order?.created_at ? parseStandardDate(res.order.created_at) : (res.order?.targetDeliveryDate || new Date().toISOString().split('T')[0]);
          return {
            txId,
            category: 'reservation',
            type: isFully ? '🔒 Reserved (Order PO Not Req)' : '🔒 Reserved for Order',
            date: orderDate,
            refNo: res.order?.orderId || res.order?.id || res.orderId,
            subRef: res.order?.jobName || res.req?.filmType || 'Active Order Commitment',
            partyName: res.order?.clientName || res.order?.customer || 'Customer Order',
            subParty: `Target Delivery: ${res.order?.targetDeliveryDate || 'Scheduled'}`,
            inwardQtyKg: 0,
            outwardQtyKg: res.reservedKg,
            adjQtyKg: 0,
            ratePerKg: rate,
            unitPrice: rate,
            totalValue: res.reservedKg * rate,
            barcode: `RES-${(res.order?.orderId || res.orderId || '').replace(/[^a-zA-Z0-9]/g, '')}`,
            batchNo: item.lastBatch || 'Reserved Stock',
            status: isFully ? 'Fully Reserved (No PO Required)' : 'Partially Reserved',
            notes: `Gross Required: ${res.grossReqKg} kg | Reserved: ${res.reservedKg} kg | Balance PO: ${res.balanceKg} kg`
          };
        });

        const rollByBarcode = new Map((inventoryRolls || []).map((roll) => [
          String(roll.barcodeId || roll.id || '').trim().toLowerCase(),
          roll
        ]));
        const bulkReceiptLines = (stockLedgerAdjustments || [])
          .filter(a => isOpeningStockReceipt(a) && isItemMatch(a, item))
          .map(a => {
            const roll = rollByBarcode.get(String(a.barcode || '').trim().toLowerCase());
            const weightNote = roll
              ? `Gross ${roll.grossWeightKg ?? '—'} kg, tare ${roll.tareWeightKg ?? '—'} kg, core ${roll.coreWeightKg ?? '—'} kg, net ${roll.netWeightKg ?? a.qtyKg} kg`
              : (a.reason || OPENING_RECEIPT_TYPE);
            return {
            txId: `BULK_${a.id}`,
            category: 'inward',
            type: '📥 Opening Stock Receipt',
            isPendingQC: false,
            isRejected: false,
            date: a.date || new Date().toISOString(),
            refNo: a.barcode || a.id,
            subRef: 'Bulk upload',
            partyName: a.adjustedBy || 'Store Manager',
            subParty: 'Opening stock receipt',
            inwardQtyKg: Math.abs(Number(a.qtyKg) || 0),
            outwardQtyKg: 0,
            adjQtyKg: 0,
            ratePerKg: ledgerRowRate(a, itemActualUnitPrice),
            unitPrice: ledgerRowRate(a, itemActualUnitPrice),
            totalValue: Math.abs(Number(a.qtyKg) || 0) * ledgerRowRate(a, itemActualUnitPrice),
            barcode: a.barcode || '',
            batchNo: a.barcode || 'BULK',
            status: 'In Stock',
            notes: weightNote,
            legacy: itemLink(a).legacy
          };
          });
        const receiptBarcodes = new Set(bulkReceiptLines.map(line => String(line.barcode || '').trim().toLowerCase()).filter(Boolean));
        const rollReceiptLines = (inventoryRolls || []).filter(roll => {
          const barcode = String(roll.barcodeId || roll.id || '').trim().toLowerCase();
          if (!barcode || receiptBarcodes.has(barcode)) return false;
          if (roll.grnNo || roll.grnId || roll.grn_no) return false;
          if (String(roll.status || 'In Stock') !== 'In Stock') return false;
          if (findRetiredBarcode(deletedBarcodes, roll.barcodeId || roll.barcode || roll.id)) return false;
          const link = rollBelongsOnItemLedger(roll, item);
          return link.include && (Number(roll.availableWeightKg ?? roll.netWeightKg) || 0) > 0;
        }).map(roll => {
          const qty = Number(roll.availableWeightKg ?? roll.netWeightKg) || 0;
          const link = rollBelongsOnItemLedger(roll, item);
          const rate = ledgerRowRate(roll, itemActualUnitPrice);
          return {
            txId: `ROLL_${roll.barcodeId || roll.id}`,
            category: 'inward',
            type: '📥 Opening Stock Receipt',
            isPendingQC: false,
            isRejected: false,
            date: roll.inwardDatetime || new Date().toISOString(),
            refNo: roll.barcodeId || roll.id,
            subRef: 'Roll receipt',
            partyName: roll.vendorName || 'Store',
            subParty: 'Opening stock receipt',
            inwardQtyKg: qty,
            outwardQtyKg: 0,
            adjQtyKg: 0,
            ratePerKg: rate,
            unitPrice: rate,
            totalValue: qty * rate,
            barcode: roll.barcodeId || roll.id,
            batchNo: roll.batchNo || '',
            status: 'In Stock',
            notes: 'Opening stock receipt per roll',
            legacy: link.legacy
          };
        });
        const openingReceiptLines = [...bulkReceiptLines, ...rollReceiptLines];

        // 5. Calculate Opening Stock Baseline (Excluding Pending QC from movement so net matches usable stock)
        const totalApprovedInwards = inwardTxLines.filter(tx => !tx.isPendingQC).reduce((sum, tx) => sum + tx.inwardQtyKg, 0) + storeIssueLines.filter(tx => tx.category === 'inward').reduce((sum, tx) => sum + tx.inwardQtyKg, 0) + openingReceiptLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0);
        const totalTxOutwards = jobUsageLines.reduce((sum, tx) => sum + tx.outwardQtyKg, 0) + storeIssueLines.filter(tx => tx.category === 'usage').reduce((sum, tx) => sum + tx.outwardQtyKg, 0);
        const totalTxAdj = adjLines.reduce((sum, tx) => sum + tx.adjQtyKg, 0);
        const netMovement = totalApprovedInwards - totalTxOutwards + totalTxAdj;
        const currentTargetQty = item.availableQtyKg || 0;
        const openingStockQty = Math.max(0, currentTargetQty - netMovement);

        const openingStockLine = openingStockQty > 0 ? [{
          txId: `OPEN_${item.id}`,
          category: 'inward',
          type: '📦 Opening Stock Balance',
          date: item.created_at ? parseStandardDate(item.created_at) : (item.inwardDate || item.receivedDate || new Date().toISOString().split('T')[0]),
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

        const allTxLines = [...openingStockLine, ...inwardTxLines, ...openingReceiptLines, ...jobUsageLines, ...storeIssueLines, ...adjLines, ...orderResTxLines]
          .filter((tx) => !findRetiredBarcode(deletedBarcodes, tx.barcode));
        allTxLines.sort((a, b) => parseTxDate(a.date) - parseTxDate(b.date));

        // 7. Calculate Chronological Running Balance (Pending QC and Rejected QC Hold do NOT add to usable stock!)
        let runningStock = 0;
        const ledgerWithBalance = allTxLines.map(tx => {
          const isPending = tx.isPendingQC || tx.status === 'Pending QC Approval' || tx.status === 'Pending QC' || (tx.type && tx.type.includes('Awaiting QC'));
          const isRejected = tx.isRejected || tx.status === 'QC Hold' || tx.status === 'QC Hold Store' || tx.status === 'Rejected' || (tx.type && tx.type.includes('Rejected'));
          
          if (tx.category === 'inward') {
            if (!isPending && !isRejected) {
              runningStock += tx.inwardQtyKg;
            }
          } else if (tx.category === 'usage') {
            runningStock -= tx.outwardQtyKg;
          } else if (tx.category === 'reservation') {
            runningStock -= tx.outwardQtyKg;
          } else if (tx.category === 'reconciliation') {
            runningStock += tx.adjQtyKg;
          }
          return { 
            ...tx, 
            isPendingQC: isPending,
            isRejected: isRejected,
            runningBalance: Math.max(0, runningStock) 
          };
        });

        // 8. Reverse to Newest First for Display & Apply Filters
        const displayLines = [...ledgerWithBalance].reverse().filter(tx => {
          if (ledgerFilterTab === 'pending_qc') return tx.isPendingQC;
          if (ledgerFilterTab === 'qc_hold') return tx.isRejected;
          if (ledgerFilterTab !== 'all' && tx.category !== ledgerFilterTab) return false;
          if (ledgerSearchTerm.trim()) {
            const q = ledgerSearchTerm.toLowerCase();
            return (
              (tx.refNo && tx.refNo.toLowerCase().includes(q)) ||
              (tx.partyName && tx.partyName.toLowerCase().includes(q)) ||
              (tx.barcode && String(tx.barcode).toLowerCase().includes(q)) ||
              (tx.type && tx.type.toLowerCase().includes(q)) ||
              (tx.notes && tx.notes.toLowerCase().includes(q))
            );
          }
          return true;
        });

        const paginatedLedgerItems = displayLines.slice((ledgerCurrentPage - 1) * ledgerPageSize, ledgerCurrentPage * ledgerPageSize);

        // Summary Calculations
        const approvedInwardLines = [
          ...inwardTxLines.filter(tx => !tx.isPendingQC && !tx.isRejected),
          ...openingReceiptLines
        ];
        const pendingInwardLines = inwardTxLines.filter(tx => tx.isPendingQC);
        const rejectedInwardLines = inwardTxLines.filter(tx => tx.isRejected);

        const totalApprovedPurchasedQty = approvedInwardLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0) + openingStockQty;
        const totalPendingQcQty = pendingInwardLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0);
        const totalRejectedQcQty = rejectedInwardLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0);

        const totalSpendRs = approvedInwardLines.reduce((sum, tx) => sum + tx.totalValue, 0) + (openingStockQty * itemActualUnitPrice);
        const avgPurchaseRate = totalApprovedPurchasedQty > 0 ? (totalSpendRs / totalApprovedPurchasedQty) : itemActualUnitPrice;

        const totalConsumedJobQty = jobUsageLines.reduce((sum, tx) => sum + tx.outwardQtyKg, 0) + storeIssueLines.filter(tx => tx.category === 'usage').reduce((sum, tx) => sum + tx.outwardQtyKg, 0);
        const totalReconciliationAdjQty = adjLines.reduce((sum, tx) => sum + tx.adjQtyKg, 0);
        const totalReservedOrdersQty = orderResTxLines.reduce((sum, tx) => sum + tx.outwardQtyKg, 0);
        const netAvailableBalance = Math.max(0, runningStock);

        return (
          <div className="modal-overlay" onClick={() => setSelectedItemForPurchaseHistory(null)}>
            <div className="modal-content" style={{ maxWidth: '1180px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HistoryIcon style={{ color: '#2563eb' }} /> Raw Material Stock Ledger & Barcode History
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
                        <SearchableSelect className="form-control" triggerStyle={{ padding: '6px 10px', fontSize: '0.85rem' }} value={adjType} onChange={e => setAdjType(e.target.value)}>
                          <option value="Physical Audit (+)">Physical Audit (+) Surplus Addition</option>
                          <option value="Physical Audit (-)">Physical Audit (-) Deficit Deduction</option>
                        </SearchableSelect>
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
                  <span className="stats-title" style={{ fontSize: '0.75rem' }}>Total Inwards (Approved)</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>
                    + {(totalApprovedPurchasedQty ?? 0).toLocaleString()} {unitStr}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {approvedInwardLines.length + (openingStockQty > 0 ? 1 : 0)} approved inwards
                  </div>
                  {totalPendingQcQty > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: '700', marginTop: '4px', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                      ⏳ +{(totalPendingQcQty ?? 0).toLocaleString()} {unitStr} Pending QC (Not in stock)
                    </div>
                  )}
                  {totalRejectedQcQty > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700', marginTop: '4px', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca' }}>
                      🚫 {(totalRejectedQcQty ?? 0).toLocaleString()} {unitStr} in QC Hold Store (Rejected)
                    </div>
                  )}
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
                  <span className="stats-title" style={{ fontSize: '0.75rem' }}>Current Net Usable Stock</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                    {(netAvailableBalance ?? 0).toLocaleString()} {unitStr}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>
                    Avg Rate: ₹ {avgPurchaseRate.toFixed(2)}/{unitStr}
                  </div>
                  {totalReservedOrdersQty > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '700', marginTop: '4px', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #86efac' }}>
                      🔒 {(totalReservedOrdersQty ?? 0).toLocaleString()} {unitStr} Reserved for Active Orders
                    </div>
                  )}
                  {totalReservedOrdersQty > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', marginTop: '2px' }}>
                      Gross On-hand: {(item.availableQtyKg || 0).toLocaleString()} {unitStr}
                    </div>
                  )}
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
                    📥 Inwards ({inwardTxLines.length + openingReceiptLines.length + (openingStockQty > 0 ? 1 : 0) + storeIssueLines.filter(tx => tx.category === 'inward').length})
                  </button>

                  {pendingInwardLines.length > 0 && (
                    <button 
                      className={`btn-secondary`}
                      style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'pending_qc' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'pending_qc' ? '700' : '500', color: ledgerFilterTab === 'pending_qc' ? '#b45309' : 'var(--text-secondary)' }}
                      onClick={() => setLedgerFilterTab('pending_qc')}
                    >
                      ⏳ Pending QC ({pendingInwardLines.length})
                    </button>
                  )}

                  {rejectedInwardLines.length > 0 && (
                    <button 
                      className={`btn-secondary`}
                      style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'qc_hold' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'qc_hold' ? '700' : '500', color: ledgerFilterTab === 'qc_hold' ? '#dc2626' : 'var(--text-secondary)' }}
                      onClick={() => setLedgerFilterTab('qc_hold')}
                    >
                      🚫 QC Hold Store ({rejectedInwardLines.length})
                    </button>
                  )}

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

                  {orderResTxLines.length > 0 && (
                    <button 
                      className={`btn-secondary`}
                      style={{ padding: '4px 10px', fontSize: '0.78rem', border: 'none', background: ledgerFilterTab === 'reservation' ? '#ffffff' : 'transparent', fontWeight: ledgerFilterTab === 'reservation' ? '700' : '500', color: ledgerFilterTab === 'reservation' ? '#15803d' : 'var(--text-secondary)' }}
                      onClick={() => setLedgerFilterTab('reservation')}
                    >
                      🔒 Order Reservations ({orderResTxLines.length})
                    </button>
                  )}
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
                          <tr key={tx.txId || idx} style={{ background: tx.isPendingQC ? '#fffbeb' : (tx.isRejected ? '#fef2f2' : (tx.category === 'reservation' ? '#f0fdf4' : (tx.category === 'reconciliation' ? '#f0f9ff' : (tx.category === 'usage' ? '#fff5f5' : 'transparent')))) }}>
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatPlantDateTime(tx.date)}</td>
                            
                            {/* Category Badge */}
                            <td>
                              {tx.legacy && (
                                <span className="badge" style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: '700', marginBottom: '4px' }}>
                                  Unlinked / legacy
                                </span>
                              )}
                              {tx.category === 'inward' && (
                                <span 
                                  className="badge" 
                                  style={{ 
                                    fontSize: '0.72rem', 
                                    background: tx.isPendingQC ? '#fef3c7' : (tx.isRejected ? '#fee2e2' : '#dcfce7'), 
                                    color: tx.isPendingQC ? '#92400e' : (tx.isRejected ? '#991b1b' : '#15803d'),
                                    border: tx.isPendingQC ? '1.5px solid #fde68a' : (tx.isRejected ? '1.5px solid #fca5a5' : '1px solid #86efac'),
                                    fontWeight: '700',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {tx.type || (tx.isPendingQC ? '⏳ GRN Inward (Awaiting QC Approval)' : (tx.isRejected ? '🚫 GRN Inward (Rejected - QC Hold Store)' : '📥 GRN Inward (Approved)'))}
                                </span>
                              )}
                              {tx.category === 'usage' && (
                                <span className="badge badge-error" style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c' }}>
                                  {tx.type || '📤 Job Usage'}
                                </span>
                              )}
                              {tx.category === 'reservation' && (
                                <span 
                                  className="badge" 
                                  style={{ 
                                    fontSize: '0.72rem', 
                                    background: '#dcfce7', 
                                    color: '#15803d', 
                                    border: '1px solid #86efac', 
                                    fontWeight: '700',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {tx.type || '🔒 Order Reservation'}
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
                              <div style={{ fontWeight: '700', color: tx.category === 'reservation' ? '#15803d' : (tx.category === 'usage' ? '#991b1b' : '#2563eb') }}>
                                {tx.refNo}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.subRef}</div>
                            </td>

                            {/* Party */}
                            <td>
                              <div style={{ fontWeight: '600' }}>{tx.partyName}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.subParty}</div>
                              {tx.itemRemarks && (
                                <div style={{ fontSize: '0.73rem', color: '#0369a1', fontWeight: '600', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  💬 {tx.itemRemarks}
                                </div>
                              )}
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
                                (() => {
                                  const rawBarcodeStr = String(tx.barcode || '').trim();
                                  const barcodeTokens = rawBarcodeStr
                                    ? rawBarcodeStr.split(/[,;\n]+/).map(b => b.trim()).filter(Boolean)
                                    : [];

                                  if (barcodeTokens.length === 0) {
                                    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                                  }

                                  const hasNumericSpecs = parseFloat(item.micron) > 0 && parseFloat(item.widthMm) > 0 && item.micron !== '-' && item.widthMm !== '-';
                                  const isFilm = (item.category === 'Film Substrates' || item.category === 'Film') && hasNumericSpecs;
                                  const rateVal = Number(tx.ratePerKg || tx.unitPrice || item.unitPrice || item.purchaseRatePerKg || 0);
                                  const invoiceVal = tx.subParty?.includes('Inv:') ? tx.subParty.replace('Inv:', '').trim() : (tx.invoiceNo || '');
                                  const totalQty = tx.inwardQtyKg || tx.outwardQtyKg || 0;
                                  const perUnitWeight = barcodeTokens.length > 0 ? Number((totalQty / barcodeTokens.length).toFixed(2)) : totalQty;

                                  const buildRollObjForBarcode = (code, index) => {
                                    const matchedRoll = (inventoryRolls || []).find(r => 
                                      (r.barcodeId && String(r.barcodeId).trim().toLowerCase() === String(code).trim().toLowerCase()) ||
                                      (r.id && String(r.id).trim().toLowerCase() === String(code).trim().toLowerCase())
                                    );
                                    if (matchedRoll) return matchedRoll;

                                    const batchVal = tx.batchNo || (tx.notes?.includes('Batch:') ? tx.notes.split('Batch:')[1].split('|')[0].replace(/[\][]/g, '').trim() : (code || item.lastBatch || '-'));

                                    return {
                                      id: code,
                                      barcodeId: code,
                                      grnNo: tx.refNo || '',
                                      unitNo: index + 1,
                                      totalUnits: barcodeTokens.length,
                                      rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
                                      itemName: item.itemName || (isFilm ? `${item.filmType} Film (${item.micron}µ x ${item.widthMm}mm)` : `${item.category || 'Stock Item'}`),
                                      category: item.category || (isFilm ? 'Film Substrates' : 'General Store'),
                                      unit: item.unit || 'Kg',
                                      micron: isFilm ? (parseFloat(item.micron) || 0) : '-',
                                      widthMm: isFilm ? (parseFloat(item.widthMm) || 0) : '-',
                                      netWeightKg: perUnitWeight,
                                      availableWeightKg: perUnitWeight,
                                      vendorName: tx.partyName || item.lastVendor || 'Company Stock',
                                      batchNo: batchVal,
                                      invoiceNo: invoiceVal,
                                      purchaseRatePerKg: rateVal,
                                      itemRemarks: tx.itemRemarks || tx.remarks || tx.notes || '',
                                      remarks: tx.itemRemarks || tx.remarks || tx.notes || '',
                                      notes: tx.itemRemarks || tx.remarks || tx.notes || '',
                                      stationId: 'SCALE_1_INWARD'
                                    };
                                  };

                                  const allRollObjs = barcodeTokens.map((bCode, idx) => buildRollObjForBarcode(bCode, idx));

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {/* List of independent barcodes */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {barcodeTokens.map((bCode, index) => {
                                          const singleRollObj = allRollObjs[index];
                                          return (
                                            <div 
                                              key={`${bCode}-${index}`}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                padding: '2px 8px',
                                                width: 'fit-content'
                                              }}
                                            >
                                              <code style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: '700' }}>
                                                {bCode}
                                              </code>
                                              {singleRollObj?.netWeightKg > 0 && (
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>
                                                  ({singleRollObj.netWeightKg} {item.unit || 'kg'})
                                                </span>
                                              )}
                                              <button 
                                                type="button" 
                                                style={{
                                                  background: '#ecfdf5',
                                                  border: '1px solid #a7f3d0',
                                                  color: '#047857',
                                                  borderRadius: '4px',
                                                  padding: '2px 6px',
                                                  cursor: 'pointer',
                                                  fontSize: '0.72rem',
                                                  fontWeight: '700',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '3px'
                                                }}
                                                onClick={() => setSelectedRollForBarcodeModal(singleRollObj)}
                                                title={`Print barcode sticker for ${bCode}`}
                                              >
                                                <Printer size={12} /> Print
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Action links */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                        <button 
                                          type="button" 
                                          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '0', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.73rem', fontWeight: '600' }}
                                          onClick={() => {
                                            setEditingTxId(tx.txId);
                                            setEditingBarcodeVal(tx.barcode);
                                          }}
                                          title="Click to edit/update barcode string"
                                        >
                                          <Edit3 size={12} /> Edit
                                        </button>

                                        {barcodeTokens.length > 1 && (
                                          <button 
                                            type="button" 
                                            style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0284c7', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer', fontSize: '0.73rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                            onClick={() => setSelectedRollForBarcodeModal(allRollObjs)}
                                            title="Print all barcode stickers for this inward"
                                          >
                                            <Printer size={12} /> Print All ({barcodeTokens.length})
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()
                              )}
                            </td>

                            {/* Inward Qty */}
                            <td>
                              {tx.inwardQtyKg > 0 ? (
                                tx.isPendingQC ? (
                                  <div>
                                    <span style={{ fontWeight: '700', color: '#d97706' }}>+ {(tx.inwardQtyKg ?? 0).toLocaleString()} {unitStr}</span>
                                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#b45309', fontWeight: '600' }}>🔒 Pending QC</span>
                                  </div>
                                ) : (
                                  <span style={{ fontWeight: '700', color: '#047857' }}>+ {(tx.inwardQtyKg ?? 0).toLocaleString()} {unitStr}</span>
                                )
                              ) : '-'}
                            </td>

                            {/* Job Usage / Reservation Qty */}
                            <td style={{ fontWeight: '700' }}>
                              {tx.category === 'reservation' ? (
                                <div>
                                  <span style={{ color: '#15803d' }}>- {(tx.outwardQtyKg ?? 0).toLocaleString()} {unitStr}</span>
                                  <span style={{ display: 'block', fontSize: '0.68rem', color: '#166534', fontWeight: '600' }}>🔒 Reserved</span>
                                </div>
                              ) : tx.outwardQtyKg > 0 ? (
                                <span style={{ color: '#dc2626' }}>- {(tx.outwardQtyKg ?? 0).toLocaleString()} {unitStr}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>

                            {/* Audit Adj Qty */}
                            <td style={{ fontWeight: '700', color: tx.adjQtyKg !== 0 ? (tx.adjQtyKg > 0 ? '#2563eb' : '#d97706') : 'var(--text-muted)' }}>
                              {tx.adjQtyKg !== 0 ? (tx.adjQtyKg > 0 ? `+ ${tx.adjQtyKg} ${unitStr}` : `- ${Math.abs(tx.adjQtyKg)} ${unitStr}`) : '-'}
                            </td>

                            {/* Running Balance */}
                            <td style={{ fontWeight: '800', color: '#0f172a', background: tx.isPendingQC ? '#fefce8' : '#f8fafc' }}>
                              {(tx.runningBalance ?? 0).toLocaleString()} {unitStr}
                              {tx.isPendingQC && (
                                <span style={{ display: 'block', fontSize: '0.68rem', color: '#92400e', fontWeight: '600' }}>(Not Added: QC Hold)</span>
                              )}
                            </td>

                            {/* Rate & Total Value */}
                            <td>
                              <div style={{ fontWeight: '700', color: tx.isPendingQC ? '#b45309' : '#047857' }}>₹ {((tx.totalValue ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>₹ {((tx.ratePerKg ?? 0)).toFixed(2)}/{unitStr}</div>
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
                  <SearchableSelect
                    className="form-control"
                    value={newVendorPaymentTerms}
                    onChange={e => setNewVendorPaymentTerms(e.target.value)}
                  >
                    <option value="15 Days Net">15 Days Net</option>
                    <option value="30 Days Net">30 Days Net</option>
                    <option value="45 Days Net">45 Days Net</option>
                    <option value="60 Days Net">60 Days Net</option>
                    <option value="Advance Payment">Advance Payment</option>
                  </SearchableSelect>
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



      {/* Modal: Universal Bulk Inventory Stock Upload */}
      {isBulkModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={resetBulkUpload}>
          <div className="glass-card modal-content" data-testid="bulk-upload-modal" style={{ width: '1080px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-brand)' }}>
                  <Upload size={22} /> Bulk Import Material Stock
                </h3>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '760px' }}>
                  Film rows with the same item name become one stock item, and each row is one roll. A blank barcode is generated as RM-BC-YYYYMMDD-XXXX. If that exact name is already in inventory, the rolls are added to it. Non-film rows are a quantity with no roll. Inventory ID is never read from the file.
                </p>
              </div>
              <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={resetBulkUpload}>
                ✕ Close
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Blank category cells use this category</label>
                  <SearchableSelect
                    className="form-control"
                    triggerStyle={{ fontWeight: '700', color: '#0f172a', background: '#ffffff' }}
                    value={bulkCategory}
                    onChange={e => setBulkCategory(e.target.value)}
                  >
                    <option value="ALL">Only the category written in the CSV</option>
                    {INVENTORY_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </SearchableSelect>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="bulk-sample-csv"
                  style={{ fontSize: '0.8rem', padding: '7px 14px', background: '#ffffff', color: '#0284c7', border: '1px solid #bae6fd', fontWeight: '700' }}
                  onClick={handleDownloadBulkInventoryTemplate}
                >
                  <Download size={15} /> Download Sample CSV
                </button>
              </div>
              <div data-testid="bulk-sample-preview" style={{ marginTop: '14px', overflowX: 'auto' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Sample columns: Category, ItemName, SubstrateOrGrade, Micron, WidthMm, NetWeightKg, GrossWeightKg, TareWeightKg, CoreWeightKg, Barcode, UOM, Location, ReorderLevel, LastVendor, LastBatch, UnitCostRs. Net is gross minus tare, the same as a GRN roll. Core weight is stored and is not subtracted again. An old WeightKg header is still accepted. No Inventory ID.
                </div>
                <table className="data-table" style={{ fontSize: '0.72rem', margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Item name</th>
                      <th>Category</th>
                      <th>Weight</th>
                      <th>Barcode</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>PET 12 Micron 1000mm</td><td>Film Substrates</td><td>Gross 254 − tare 2.5, core 1, net 251.5 kg</td><td>RM-BC-20261028-1001 (given)</td></tr>
                    <tr><td>pet 12 micron 1000mm</td><td>Film Substrates</td><td>Gross 183 − tare 2, core 1, net 181 kg</td><td>RM-BC-20261028-1002 (given)</td></tr>
                    <tr><td>PET 12 Micron 1000mm</td><td>Film Substrates</td><td>Gross 98 − tare 1.75, core 1, net blank (computed 96.25 kg)</td><td>blank — auto-generated</td></tr>
                    <tr><td>Cyan Solvent Printing Ink</td><td>Printing Inks</td><td>40 kg net, no gross, tare, or core</td><td>no roll</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '24px', textAlign: 'center', background: '#f0f9ff', marginBottom: '16px' }}>
              <input type="file" accept=".csv" id="bulk-csv-file-input" data-testid="bulk-csv-file-input" style={{ display: 'none' }} onChange={handleParseBulkCSV} />
              <label htmlFor="bulk-csv-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Upload size={32} style={{ color: '#0284c7' }} />
                <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>
                  {bulkFileName ? `Selected File: ${bulkFileName}` : 'Click here to select a CSV file'}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Import starts only after you confirm the preview.</span>
              </label>
            </div>

            {bulkErrorMsg && (
              <div data-testid="bulk-file-error" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px', fontWeight: '600' }}>
                {bulkErrorMsg}
              </div>
            )}

            {bulkPlan && (
              <div data-testid="bulk-preview" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#ffffff', marginBottom: '20px' }}>
                {bulkPlan.notices.map((notice) => (
                  <div key={notice} data-testid="bulk-notice" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '10px', fontWeight: '600' }}>
                    {notice}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}>
                    Preview: {bulkPlan.groups.length} item{bulkPlan.groups.length === 1 ? '' : 's'}, {bulkPlan.importableCount} row{bulkPlan.importableCount === 1 ? '' : 's'} ready, {bulkPlan.blockedCount} blocked
                  </div>
                  {bulkPlan.blockedCount > 0 && (
                    <button type="button" className="btn-secondary" data-testid="bulk-error-rows" style={{ fontSize: '0.75rem' }} onClick={handleDownloadBulkErrorReport}>
                      <Download size={14} /> Download error rows (CSV)
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '10px' }}>
                  An existing item is matched by its name after trimming, ignoring letter case. If that name is new but the same category, micron, and width already have a ledger, the rolls are added there instead of creating a second item.
                </div>
                {bulkPlan.groups.map((group) => (
                  <div key={group.nameKey} data-testid="bulk-group" style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', marginBottom: '10px', background: group.match === 'existing' ? '#fffbeb' : '#f0fdf4' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>{group.itemName}</strong>
                      <span data-testid="bulk-group-flag" style={{ fontSize: '0.75rem', fontWeight: '800', color: group.match === 'existing' ? '#92400e' : (group.rollCount || group.quantityRowCount ? '#166534' : '#b91c1c') }}>
                        {group.match === 'existing'
                          ? `Existing item ${group.plannedId}`
                          : ((group.rollCount || group.quantityRowCount) ? `New item ${group.plannedId || ''}` : 'Blocked — not imported')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '4px' }}>
                      {group.category} · {group.rollCount} roll{group.rollCount === 1 ? '' : 's'} · {group.totalKg} kg to add
                      {group.match === 'existing' ? ` · current stock ${group.existingItem.availableQtyKg} ${group.existingItem.unit || 'Kg'}` : ''}
                      {group.blockedCount > 0 ? ` · ${group.blockedCount} row(s) blocked` : ''}
                    </div>
                  </div>
                ))}
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                  <table className="data-table" style={{ width: '100%', margin: 0, fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>Row</th>
                        <th>Item</th>
                        <th>Gross</th>
                        <th>Tare</th>
                        <th>Core</th>
                        <th>Net</th>
                        <th>Barcode</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPlan.rows.map((row) => (
                        <tr key={`${row.lineNumber}-${row.barcode || row.itemName}`} data-testid={row.blocked ? 'bulk-row-error' : 'bulk-row-ok'} style={{ background: row.blocked ? '#fef2f2' : 'transparent' }}>
                          <td>{row.lineNumber}</td>
                          <td>{row.itemName || '—'}</td>
                          <td>{row.sourceCells?.GrossWeightKg || '—'}</td>
                          <td>{row.sourceCells?.TareWeightKg || '—'}</td>
                          <td>{row.sourceCells?.CoreWeightKg || '—'}</td>
                          <td>
                            {row.weight || '—'}
                            {row.netSource === 'computed' ? <span style={{ display: 'block', color: '#0369a1' }}>computed</span> : null}
                          </td>
                          <td>
                            {row.isRoll ? (
                              <span data-testid="bulk-barcode">
                                {row.barcode || '—'}
                                <span style={{ display: 'block', color: '#64748b' }}>{row.barcodeSource === 'auto' ? 'auto' : (row.barcodeSource === 'given' ? 'given' : '')}</span>
                              </span>
                            ) : 'No roll'}
                          </td>
                          <td style={{ color: row.blocked ? '#b91c1c' : '#166534', fontWeight: '700' }}>
                            {row.blocked ? row.errors.join(' ') : (row.isRoll ? 'Roll will be added' : 'Quantity will be added')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
              <button type="button" className="btn-secondary" onClick={resetBulkUpload}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                data-testid="bulk-confirm"
                disabled={!bulkPlan || bulkPlan.importableCount === 0 || bulkImporting}
                style={{ opacity: !bulkPlan || bulkPlan.importableCount === 0 || bulkImporting ? 0.5 : 1, background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                onClick={handleConfirmBulkImport}
              >
                <Check size={18} /> {bulkImporting ? 'Importing…' : `Confirm import of ${bulkPlan?.importableCount || 0} valid rows`}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

