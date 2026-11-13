import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useModalDismiss } from './useModalDismiss';
import { 
  ScanBarcode, 
  QrCode, 
  Search, 
  Package, 
  Layers, 
  Scale, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Copy, 
  Check, 
  RefreshCw, 
  Camera, 
  CameraOff, 
  X, 
  ShieldCheck, 
  Lock as LockIcon,
  Tag, 
  Calendar, 
  User, 
  Cpu, 
  MapPin, 
  ArrowRight,
  Info,
  Truck,
  Hash,
  Database,
  Trash2
} from 'lucide-react';
import QRCode2D from './QRCode2D';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import { safeLocalStorageGet } from '../utils/safeStorage';
import {
  codeKey,
  codeKeyFrom,
  codeStartsWith,
  findDispatchRollByScan,
  findInventoryRollByScan,
  textFrom
} from '../utils/barcodeCode';
import { deletedBarcodeMessage, findRetiredBarcode } from '../utils/barcodeRegistry';
import { displayItemName } from '../services/inventoryIdentity';
import { loadDeletedBarcodes } from '../services/supabaseDataService';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import { fetchPayloadRecords } from '../services/businessRecords';
import { findScrapForScan, legacyScrapBarcode, scrapScanCard } from '../utils/scrapIdentity';
import { isFinishedGoodsStock } from '../utils/finishedGoods';
import {
  EMPTY_TRACE_MESSAGE,
  grnForRoll,
  qcStatusTone,
  readablePlantDate,
  resolveBarcodeMaterials,
  shipmentDispatchDate,
  shipmentLr,
  shipmentVehicle
} from '../utils/barcodeMaterialTrace';
import {
  cameraChoices,
  createBarcodeDetector,
  detectBarcode,
  mapCameraError,
  openScanCamera,
  readRememberedCameraId,
  releaseMediaStream
} from '../utils/scanCamera';

/**
 * Universal Barcode & 2D QR Inspector Modal
 * 
 * Searches across all database collections:
 * - Inventory Rolls (RM, SFG, FG)
 * - Orders & OCNs
 * - Rotogravure Cylinders
 * - Job Master technical sheets
 * - GRN Inward QC Shipments
 * - Inks & Solvents Master
 * - Raw Material Item Master
 * - Finished Goods Dispatch Shipments & Challans
 * 
 * STRICTLY READ-ONLY: For inspection, verification, and traceability lookup only.
 */
export default function UniversalBarcodeScannerModal({
  isOpen = false,
  onClose,
  inventoryRolls = [],
  orders = [],
  cylinders = [],
  jobMasters = [],
  grns = [],
  inks = [],
  inventory = [],
  dispatchShipments = [],
  deliveryChallans = [],
  productionRecords = [],
  vendors = [],
  scrapItems: scrapItemsProp = null,
  storeIssueTransactions = [],
  sfgGoods = [],
  onNavigateToProductionRecord
}) {
  const [loadedScrapItems, setLoadedScrapItems] = useState([]);
  const scrapItems = Array.isArray(scrapItemsProp) ? scrapItemsProp : loadedScrapItems;
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeBarcode, setActiveBarcode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [videoInputs, setVideoInputs] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState('');
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [activePoPdfData, setActivePoPdfData] = useState(null);
  const [deletedBarcodes, setDeletedBarcodes] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [fetchedStoreIssues, setFetchedStoreIssues] = useState([]);
  
  const inputRef = useRef(null);
  const shellRef = useRef(null);
  useModalDismiss(shellRef, onClose, isOpen);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(0);
  const lastDetectedRef = useRef('');

  const cameraStorage = () => {
    try { return window.sessionStorage; } catch { return null; }
  };

  const stopCamera = useCallback(() => {
    requestRef.current += 1;
    releaseMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    lastDetectedRef.current = '';
    setCameraActive(false);
    setActiveDeviceId('');
    setVideoInputs([]);
  }, []);

  // Auto focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    } else {
      stopCamera();
      setBarcodeInput('');
      setActiveBarcode('');
      setCameraError('');
    }
  }, [isOpen, stopCamera]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    loadDeletedBarcodes().then((rows) => {
      if (active) setDeletedBarcodes(rows);
    }).catch(() => {});
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || Array.isArray(scrapItemsProp) || !isSupabaseConfigured()) return undefined;
    let active = true;
    fetchPayloadRecords(supabase, 'sfg_scrap_items')
      .then((rows) => { if (active) setLoadedScrapItems(rows || []); })
      .catch(() => { if (active) setLoadedScrapItems([]); });
    return () => { active = false; };
  }, [isOpen, scrapItemsProp]);

  // Read-only. Issue rows are not all loaded for every role, and the inspector must not invent them.
  useEffect(() => {
    if (!isOpen || !isSupabaseConfigured()) return undefined;
    let active = true;
    const readPages = async (table, columns, apply) => {
      const rows = [];
      for (let from = 0; from < 20000; from += 1000) {
        let query = supabase.from(table).select(columns).range(from, from + 999);
        if (apply) query = apply(query);
        const { data, error } = await query;
        if (error) throw error;
        const batch = Array.isArray(data) ? data : [];
        rows.push(...batch);
        if (batch.length < 1000) break;
      }
      return rows;
    };
    Promise.all([
      readPages(
        'inventory_ledger_entries',
        'entry_kind, barcode, parent_barcode, order_id, production_record_id, job_name, item_name, film_type, category, vendor_name, batch_no, grn_no, micron',
        (query) => query.eq('entry_kind', 'issue')
      ),
      readPages('store_issue_transactions', 'id, payload')
    ]).then(([ledgerRows, issueRows]) => {
      if (!active) return;
      setLedgerEntries(ledgerRows);
      setFetchedStoreIssues(issueRows.map((row) => ({
        id: row.id,
        ...(row.payload && typeof row.payload === 'object' ? row.payload : {})
      })));
    }).catch(() => {
      if (!active) return;
      setLedgerEntries([]);
      setFetchedStoreIssues([]);
    });
    return () => { active = false; };
  }, [isOpen]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async (preferredDeviceId = '') => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setCameraError('');
    releaseMediaStream(streamRef.current);
    streamRef.current = null;
    try {
      const opened = await openScanCamera({
        mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
        preferredDeviceId,
        storage: cameraStorage()
      });
      if (requestId !== requestRef.current) {
        releaseMediaStream(opened.stream);
        return;
      }
      streamRef.current = opened.stream;
      setActiveDeviceId(opened.deviceId || String(preferredDeviceId || '').trim());
      setCameraActive(true);
      setStreamGeneration((generation) => generation + 1);
      let choices = [];
      try {
        if (navigator.mediaDevices?.enumerateDevices) {
          choices = cameraChoices(await navigator.mediaDevices.enumerateDevices());
        }
      } catch { choices = []; }
      if (requestId !== requestRef.current) return;
      setVideoInputs(choices);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
      setCameraActive(false);
      setVideoInputs([]);
      setCameraError(mapCameraError(err));
    }
  };

  useEffect(() => {
    if (!cameraActive) return undefined;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return undefined;
    video.srcObject = stream;
    video.muted = true;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
    const detector = createBarcodeDetector();
    let stopped = false;
    let pending = '';
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      try {
        const value = await detectBarcode(video, detector);
        if (stopped) return;
        if (value && value === pending && value !== lastDetectedRef.current) {
          lastDetectedRef.current = value;
          setBarcodeInput(value);
          setActiveBarcode(value);
        }
        pending = value;
      } catch {
        pending = '';
      }
      if (!stopped) timer = window.setTimeout(tick, 350);
    };
    timer = window.setTimeout(tick, 300);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [cameraActive, streamGeneration]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const clean = barcodeInput.trim();
    if (clean) {
      setActiveBarcode(clean);
    }
  };

  const handleQuickChipClick = (code) => {
    setBarcodeInput(code);
    setActiveBarcode(code);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleClear = () => {
    stopCamera();
    setBarcodeInput('');
    setActiveBarcode('');
    if (inputRef.current) inputRef.current.focus();
  };

  const traceBarcode = (args) => resolveBarcodeMaterials({
    productionRecords,
    inventoryRolls,
    grns,
    sfgGoods,
    storeIssues: [...(storeIssueTransactions || []), ...(fetchedStoreIssues || [])],
    ledgerEntries,
    ...args
  });

  // Cross-Database Multi-Collection Search Algorithm
  const searchResults = useMemo(() => {
    const query = codeKey(activeBarcode);
    if (!query) return null;

    const deletedHit = findRetiredBarcode(deletedBarcodes, activeBarcode);
    if (deletedHit) {
      return {
        deleted: true,
        query: activeBarcode,
        barcode: deletedHit.barcode,
        status: deletedHit.status || 'Deleted',
        message: deletedBarcodeMessage(deletedHit),
        reason: deletedHit.deletedReason || 'No reason recorded',
        deletedBy: deletedHit.deletedBy || '',
        deletedAt: deletedHit.deletedAt || ''
      };
    }

    // Extract potential GRN code if barcode is formatted as (CON|RM)-BC-YYYYMMDD-XXX or similar
    const grnExtract = query.replace(/^(con|rm)-bc-/, '').replace(/-\d+$/, '');

    // 0. Dedicated Finished Goods Dispatch Roll Search (Highest Priority for FG-DISP- Barcodes & Packing List Rolls)
    const dispatchHit = findDispatchRollByScan(
      [...(dispatchShipments || []), ...(deliveryChallans || [])],
      query
    );
    const matchedDispatchRollItem = dispatchHit?.item || null;
    const parentDispatchDoc = dispatchHit?.parent || null;

    if (matchedDispatchRollItem) {
      const roll = matchedDispatchRollItem;
      const shipment = parentDispatchDoc;
      const jName = roll.jobName || shipment?.jobName || '';
      const oId = roll.orderId || shipment?.orderId || '';
      const traceData = traceBarcode({
        barcode: textFrom(roll.barcodeId, roll.id, roll.sourceFgBarcode),
        dispatchItem: roll,
        shipment,
        jobName: jName,
        orderId: oId
      });
      const matchedOrder = (orders || []).find(o => (oId && o.id === oId) || (jName && o.jobName === jName));

      return {
        type: 'DISPATCH_ROLL',
        entityCategory: 'Finished Goods (FG) Dispatch Roll',
        badgeColor: '#059669',
        badgeBg: '#ecfdf5',
        title: `FG Dispatch Roll: ${textFrom(roll.barcodeId, roll.id)}`,
        code: textFrom(roll.barcodeId, roll.id),
        raw: roll,
        jobName: traceData.jobName || jName,
        orderId: traceData.orderId || oId,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        traceabilityChecked: true,
        isDispatchBarCode: true,
        properties: [
          { label: 'Dispatch Roll Barcode ID', value: textFrom(roll.barcodeId, roll.id), isCode: true },
          { label: 'Job Order Name', value: jName || 'N/A' },
          { label: 'Client Consignee', value: shipment?.clientName || matchedOrder?.clientName || 'N/A' },
          { label: 'Order OCN / Ref', value: oId || 'N/A', isCode: true },
          { label: 'Invoice No', value: shipment?.invoiceNo || matchedOrder?.invoiceNo || 'N/A' },
          { label: 'Substrate Spec', value: textFrom(roll.substrateSpec, roll.structure, matchedOrder?.structure) || 'N/A' },
          { label: 'Roll Net Weight', value: roll.netWeightKg ? `${roll.netWeightKg} kg` : (roll.weightKg ? `${roll.weightKg} kg` : 'N/A'), isHighlight: true },
          { label: 'Gross Scale Weight', value: roll.grossWeightKg ? `${roll.grossWeightKg} kg` : 'N/A' },
          { label: 'Core Tare Weight', value: roll.coreWeightKg ? `${roll.coreWeightKg} kg` : 'N/A' },
          { label: 'Core Size', value: roll.coreSize || 'N/A' },
          { label: 'Roll # in Packing List', value: roll.rollNo ? `Roll #${roll.rollNo}` : 'N/A' },
          { label: 'Packing List / Dispatch ID', value: shipment?.dispatchId || shipment?.id || 'N/A' },
          { label: 'Vehicle Number', value: shipmentVehicle(shipment) || 'N/A' },
          { label: 'LR / Waybill No', value: shipmentLr(shipment) || 'N/A' },
          { label: 'Dispatch Date', value: shipmentDispatchDate(shipment) || 'N/A' }
        ]
      };
    }

    // 1. Inventory Rolls & Inward Packages Search (Highest Priority for Barcodes)
    // Pass 1: exact barcode id / roll id. Pass 2: batch, invoice, or GRN.
    // Pass 3: partial barcode match only when the query is at least 4 characters.
    const matchedRoll = findInventoryRollByScan(inventoryRolls, query);

    if (matchedRoll) {
      // The roll's own GRN id or number. A shared batch or a similar name is not a link.
      const linkedGrn = grnForRoll(grns, matchedRoll);

      // Find linked Inventory Item across inventory list
      const linkedItem = (inventory || []).find(item => {
        const iId = codeKey(item.id);
        const iCode = codeKeyFrom(item.item_code, item.itemCode);
        const iName = codeKeyFrom(item.item_name, item.itemName);
        const rollItemId = codeKeyFrom(matchedRoll.itemId, matchedRoll.stockItemId);
        const rollItemName = codeKey(matchedRoll.itemName);
        return (rollItemId && (iId === rollItemId || iCode === rollItemId)) ||
               (rollItemName && (iName === rollItemName || iCode === rollItemName));
      });

      const resolvedCategory = textFrom(matchedRoll.category, linkedGrn?.category, linkedItem?.category) || (codeStartsWith(matchedRoll.barcodeId, 'CON-BC') ? 'Chemicals & Solvents' : '');
      const resolvedItemName = displayItemName(matchedRoll.itemName || linkedGrn?.itemName || linkedItem?.item_name || linkedItem?.itemName) || textFrom(matchedRoll.barcodeId, matchedRoll.id) || 'Unnamed roll';
      const resolvedVendor = textFrom(matchedRoll.vendorName, matchedRoll.vendor, linkedGrn?.vendorName, linkedGrn?.vendor_name, linkedItem?.vendor, linkedItem?.vendor_name) || 'N/A';
      const resolvedBatch = textFrom(matchedRoll.batchNo, matchedRoll.lotNo, linkedGrn?.batchNo, linkedGrn?.batch_no) || 'N/A';
      const resolvedInvoice = textFrom(matchedRoll.invoiceNo, matchedRoll.invoice_no, linkedGrn?.invoiceNo, linkedGrn?.invoice_number, linkedGrn?.invoiceNumber) || 'N/A';
      const resolvedPO = textFrom(matchedRoll.poNumber, matchedRoll.po_number, linkedGrn?.poNumber, linkedGrn?.po_number) || 'N/A';
      const resolvedGRN = textFrom(matchedRoll.grnNo, matchedRoll.grn_no, matchedRoll.metadata?.grnNo, linkedGrn?.grnNo, linkedGrn?.grn_number, linkedGrn?.grnNumber) || 'N/A';
      const resolvedPackaging = textFrom(matchedRoll.packagingType) || 'N/A';

      const rollTypeText = textFrom(matchedRoll.rollType);
      const isFG = isFinishedGoodsStock({
        ...matchedRoll,
        category: matchedRoll.category || resolvedCategory,
        sfgBatchCode: matchedRoll.sfgBatchCode || matchedRoll.barcodeId
      }) || codeStartsWith(matchedRoll.barcodeId, 'FG-DISP-');
      const isSFG = !isFG && (
        matchedRoll.rollType === 'SFG'
        || (resolvedCategory && resolvedCategory.includes('Semi-Finished'))
        || rollTypeText.includes('SFG')
        || codeStartsWith(matchedRoll.barcodeId, 'SFG-')
      );
      const isFilm = resolvedCategory === 'Film Substrates' || (!resolvedCategory && (matchedRoll.rollType === 'RAW_MATERIAL' || codeStartsWith(matchedRoll.barcodeId, 'RM-BC') || Number(matchedRoll.micron) > 0));

      let entityCatTitle = 'Raw Material (RM) Substrate Roll';
      let badgeCol = '#d97706';
      let badgeBackground = '#fffbeb';

      if (isSFG) {
        entityCatTitle = 'Semi-Finished Goods (SFG) Roll';
        badgeCol = '#2563eb';
        badgeBackground = '#eff6ff';
      } else if (isFG) {
        entityCatTitle = 'Finished Goods (FG) Roll';
        badgeCol = '#059669';
        badgeBackground = '#ecfdf5';
      } else if (resolvedCategory === 'Chemicals & Solvents' || codeStartsWith(matchedRoll.barcodeId, 'CON-BC')) {
        entityCatTitle = 'Chemicals & Solvents Inward Unit';
        badgeCol = '#0284c7';
        badgeBackground = '#f0f9ff';
      } else if (resolvedCategory === 'Inks & Solvents') {
        entityCatTitle = 'Inks & Solvents Inward Unit';
        badgeCol = '#db2777';
        badgeBackground = '#fdf2f8';
      } else if (resolvedCategory === 'Adhesives & Resins') {
        entityCatTitle = 'Adhesives & Resins Inward Unit';
        badgeCol = '#ea580c';
        badgeBackground = '#fff7ed';
      } else if (resolvedCategory) {
        entityCatTitle = `${resolvedCategory} Inward Unit`;
        badgeCol = '#0891b2';
        badgeBackground = '#ecfeff';
      }

      const rollProps = [
        { label: 'Barcode ID', value: textFrom(matchedRoll.barcodeId, matchedRoll.id) || 'N/A', isCode: true },
        { label: 'Item Name', value: resolvedItemName },
        { label: 'Material Category', value: resolvedCategory || (isFilm ? 'Film Substrates' : 'N/A') },
        { label: 'Packaging Unit', value: resolvedPackaging },
        { label: 'Net Usable Qty / Weight', value: matchedRoll.netWeightKg !== undefined && matchedRoll.netWeightKg !== null ? `${matchedRoll.netWeightKg} ${matchedRoll.unit || 'kg'}` : (matchedRoll.weightKg !== undefined && matchedRoll.weightKg !== null ? `${matchedRoll.weightKg} ${matchedRoll.unit || 'kg'}` : 'N/A'), isHighlight: true },
        { label: 'Gross Scale Weight', value: matchedRoll.grossWeightKg !== undefined && matchedRoll.grossWeightKg !== null ? `${matchedRoll.grossWeightKg} ${matchedRoll.unit || 'kg'}` : 'N/A' },
        { label: 'Tare Weight', value: matchedRoll.tareWeightKg !== undefined && matchedRoll.tareWeightKg !== null ? `${matchedRoll.tareWeightKg} ${matchedRoll.unit || 'kg'}` : 'N/A' },
        { label: 'Vendor / Manufacturer', value: resolvedVendor },
        { label: 'Batch / Lot Number', value: resolvedBatch },
        { label: 'Vendor Invoice No', value: resolvedInvoice },
        { label: 'Purchase Order No', value: resolvedPO },
        { label: 'Linked GRN No', value: resolvedGRN },
        { label: 'QC Quality Status', value: textFrom(matchedRoll.qcStatus, matchedRoll.qc_status, linkedGrn?.qcStatus, linkedGrn?.qc_status) || 'N/A', isStatus: true },
        { label: 'Storage Bay / Location', value: textFrom(matchedRoll.locationBay, matchedRoll.location) || 'N/A' },
        { label: 'Inward / Production Date', value: readablePlantDate(matchedRoll.inwardDatetime || matchedRoll.productionDate || matchedRoll.date) || readablePlantDate(linkedGrn?.received_date || linkedGrn?.receivedDate) || 'N/A' }
      ];

      // If film roll, include technical film geometry
      if (isFilm) {
        if (matchedRoll.micron || linkedItem?.micron) {
          rollProps.push({ label: 'Film Thickness', value: `${matchedRoll.micron || linkedItem?.micron} µ` });
        }
        if (matchedRoll.widthMm || linkedItem?.width_mm || linkedItem?.widthMm) {
          rollProps.push({ label: 'Film / Slit Width', value: `${matchedRoll.widthMm || linkedItem?.width_mm || linkedItem?.widthMm} mm` });
        }
        if (matchedRoll.lengthMeters) {
          rollProps.push({ label: 'Calculated Length', value: `${matchedRoll.lengthMeters} m` });
        }
        if (matchedRoll.coreDia || matchedRoll.core_dia) {
          rollProps.push({ label: 'Core Diameter', value: matchedRoll.coreDia || matchedRoll.core_dia });
        }
        if (matchedRoll.jointCount !== undefined && matchedRoll.jointCount !== null && matchedRoll.jointCount !== '') {
          rollProps.push({ label: 'Joints / Splices', value: `${matchedRoll.jointCount} Joints` });
        }
      }

      if (matchedRoll.jobName) {
        rollProps.push({ label: 'Linked Job Name', value: matchedRoll.jobName });
      }
      if (matchedRoll.orderId || matchedRoll.orderNo) {
        rollProps.push({ label: 'Order OCN Reference', value: matchedRoll.orderId || matchedRoll.orderNo });
      }

      const resolvedRemarks = matchedRoll.itemRemarks || matchedRoll.remarks || matchedRoll.notes || linkedGrn?.itemRemarks || linkedGrn?.remarks || linkedGrn?.notes || '';
      if (resolvedRemarks) {
        rollProps.push({ label: 'Item Comment / Remark', value: resolvedRemarks, isHighlight: true });
      }

      rollProps.push({ label: 'Current Status', value: matchedRoll.status || 'In Stock' });

      // Traceability data
      const traceData = traceBarcode({
        barcode: textFrom(matchedRoll.barcodeId, matchedRoll.id),
        roll: matchedRoll,
        jobName: matchedRoll.jobName,
        orderId: matchedRoll.orderId
      });

      return {
        type: 'ROLL',
        entityCategory: entityCatTitle,
        badgeColor: badgeCol,
        badgeBg: badgeBackground,
        title: resolvedItemName,
        code: textFrom(matchedRoll.barcodeId, matchedRoll.id),
        raw: matchedRoll,
        properties: rollProps,
        parentGenealogy: matchedRoll.inputBarcodeIds || [],
        jobName: traceData.jobName || matchedRoll.jobName,
        orderId: traceData.orderId || matchedRoll.orderId,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        traceabilityChecked: true,
        isDispatchBarCode: isFG || codeStartsWith(matchedRoll.barcodeId, 'FG-DISP-')
      };
    }

    const scrapHit = findScrapForScan(scrapItems, activeBarcode);
    if (scrapHit) {
      const matchedLegacy = codeKey(legacyScrapBarcode(scrapHit)) === query;
      return scrapScanCard(scrapHit, { matchedLegacy });
    }

    // 2. Orders / OCNs Search
    const matchedOrder = (orders || []).find(o => {
      const oId = codeKey(o.id);
      const jName = codeKey(o.jobName);
      const ocn = codeKeyFrom(o.jobDetails?.ocnNumber, o.ocn);
      return oId === query || oId.includes(query) || (ocn && ocn === query) || (jName && jName.includes(query));
    });

    if (matchedOrder) {
      const traceData = traceBarcode({
        barcode: matchedOrder.id,
        jobName: matchedOrder.jobName,
        orderId: matchedOrder.id
      });
      return {
        type: 'ORDER',
        entityCategory: 'Sales Order & Job Card (OCN)',
        badgeColor: '#7c3aed',
        badgeBg: '#f5f3ff',
        title: matchedOrder.jobName || 'Job Order',
        code: matchedOrder.id,
        raw: matchedOrder,
        jobName: matchedOrder.jobName,
        orderId: matchedOrder.id,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        traceabilityChecked: true,
        isDispatchBarCode: true,
        properties: [
          { label: 'Order ID / OCN', value: matchedOrder.id, isCode: true },
          { label: 'Job Name', value: matchedOrder.jobName || 'N/A' },
          { label: 'Client Name', value: matchedOrder.clientName || 'N/A' },
          { label: 'Order Quantity', value: matchedOrder.orderQtyKg ? `${matchedOrder.orderQtyKg} kg` : 'N/A', isHighlight: true },
          { label: 'Order Type', value: matchedOrder.orderType || 'N/A' },
          { label: 'Target Delivery Date', value: readablePlantDate(matchedOrder.targetDeliveryDate || matchedOrder.deliveryDate) || 'N/A' },
          { label: 'Production Status', value: matchedOrder.status || 'N/A', isStatus: true },
          { label: 'Printing Execution', value: matchedOrder.printing_status || 'N/A' },
          { label: 'Actual Meters Printed', value: matchedOrder.actual_meters_printed ? `${matchedOrder.actual_meters_printed} m` : 'N/A' }
        ]
      };
    }

    // 3. Rotogravure Cylinders Search
    const matchedCylinder = (cylinders || []).find(c => {
      const cId = codeKey(c.id);
      const sku = codeKeyFrom(c.sku, c.skuCode, c.cylinderSku);
      const jName = codeKey(c.jobName);
      return cId === query || sku === query || (sku && sku.includes(query)) || (jName && jName.includes(query));
    });

    if (matchedCylinder) {
      return {
        type: 'CYLINDER',
        entityCategory: 'Rotogravure Printing Cylinder Set',
        badgeColor: '#0891b2',
        badgeBg: '#ecfeff',
        title: matchedCylinder.jobName || 'Cylinder Set',
        code: matchedCylinder.cylinderSku || matchedCylinder.sku || matchedCylinder.id,
        raw: matchedCylinder,
        properties: [
          { label: 'Cylinder SKU', value: matchedCylinder.cylinderSku || matchedCylinder.sku || matchedCylinder.id, isCode: true },
          { label: 'Job Name', value: matchedCylinder.jobName || 'N/A' },
          { label: 'Client Name', value: matchedCylinder.clientName || matchedCylinder.clientGroup || 'N/A' },
          { label: 'Color Stations', value: matchedCylinder.colors_count || matchedCylinder.colorsCount ? `${matchedCylinder.colors_count || matchedCylinder.colorsCount} Colors` : 'N/A' },
          { label: 'Circumference', value: matchedCylinder.circumference_mm || matchedCylinder.circumferenceMm ? `${matchedCylinder.circumference_mm || matchedCylinder.circumferenceMm} mm` : 'N/A' },
          { label: 'Face Length', value: matchedCylinder.face_length_mm || matchedCylinder.faceLengthMm ? `${matchedCylinder.face_length_mm || matchedCylinder.faceLengthMm} mm` : 'N/A' },
          { label: 'Rack Location', value: matchedCylinder.rack_location || matchedCylinder.rackLocation || 'N/A' },
          { label: 'Operational Status', value: matchedCylinder.status || 'N/A', isStatus: true }
        ]
      };
    }

    // 4. Job Masters Search
    const matchedJobMaster = (jobMasters || []).find(jm => {
      const sku = codeKeyFrom(jm.sku_code, jm.skuCode);
      const jName = codeKeyFrom(jm.job_name, jm.jobName);
      const id = codeKey(jm.id);
      return sku === query || (sku && sku.includes(query)) || (jName && jName.includes(query)) || id === query;
    });

    if (matchedJobMaster) {
      const traceData = traceBarcode({
        barcode: matchedJobMaster.sku_code || matchedJobMaster.skuCode || matchedJobMaster.id,
        jobName: matchedJobMaster.job_name || matchedJobMaster.jobName,
        orderId: ''
      });
      return {
        type: 'JOB_MASTER',
        entityCategory: 'Job Master Technical Specification',
        badgeColor: '#4f46e5',
        badgeBg: '#eef2ff',
        title: matchedJobMaster.job_name || matchedJobMaster.jobName || 'Job Master',
        code: matchedJobMaster.sku_code || matchedJobMaster.skuCode || matchedJobMaster.id,
        raw: matchedJobMaster,
        jobName: traceData.jobName || matchedJobMaster.job_name || matchedJobMaster.jobName,
        orderId: traceData.orderId || '',
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        traceabilityChecked: true,
        properties: [
          { label: 'Job SKU Code', value: matchedJobMaster.sku_code || matchedJobMaster.skuCode || 'N/A', isCode: true },
          { label: 'Job Name', value: matchedJobMaster.job_name || matchedJobMaster.jobName || 'N/A' },
          { label: 'Client Name', value: matchedJobMaster.client_name || matchedJobMaster.clientName || 'N/A' },
          { label: 'Structure', value: matchedJobMaster.structure || matchedJobMaster.film_structure || 'N/A' }
        ]
      };
    }

    // 5. Goods Receipt Note (GRN) Search
    const matchedGrn = (grns || []).find(g => {
      const gNum = codeKeyFrom(g.grn_number, g.grnNumber, g.grnNo, g.id);
      const gCode = gNum.replace(/^grn-/, '');
      const po = codeKeyFrom(g.po_number, g.poNumber);
      const inv = codeKeyFrom(g.invoice_number, g.invoiceNumber, g.invoiceNo);
      const bNo = codeKeyFrom(g.batch_no, g.batchNo);
      return gNum === query || gNum.includes(query) || (po && po === query) || (inv && inv === query) || (bNo && bNo === query) ||
             (grnExtract && (gCode === grnExtract || gNum.includes(grnExtract)));
    });

    if (matchedGrn) {
      const grnCat = matchedGrn.category || 'General Material';
      return {
        type: 'GRN',
        entityCategory: `Goods Receipt Note (GRN) - ${grnCat}`,
        badgeColor: '#ea580c',
        badgeBg: '#fff7ed',
        title: `${matchedGrn.itemName || matchedGrn.item_name || 'GRN Inward'} (${matchedGrn.grn_number || matchedGrn.grnNumber || matchedGrn.grnNo || matchedGrn.id})`,
        code: matchedGrn.grn_number || matchedGrn.grnNumber || matchedGrn.grnNo || matchedGrn.id,
        raw: matchedGrn,
        properties: [
          { label: 'GRN Number', value: matchedGrn.grn_number || matchedGrn.grnNumber || matchedGrn.grnNo || matchedGrn.id, isCode: true },
          { label: 'Item Name', value: matchedGrn.itemName || matchedGrn.item_name || 'N/A' },
          { label: 'Material Category', value: grnCat },
          { label: 'Vendor / Supplier', value: matchedGrn.vendor_name || matchedGrn.vendorName || matchedGrn.supplier || 'N/A' },
          { label: 'Purchase Order No', value: matchedGrn.po_number || matchedGrn.poNumber || 'N/A' },
          { label: 'Vendor Invoice No', value: matchedGrn.invoice_number || matchedGrn.invoiceNumber || matchedGrn.invoiceNo || 'N/A' },
          { label: 'Batch / Lot Number', value: matchedGrn.batch_no || matchedGrn.batchNo || 'N/A' },
          { label: 'Received Date', value: readablePlantDate(matchedGrn.received_date || matchedGrn.receivedDate) || 'N/A' },
          { label: 'Received Quantity', value: matchedGrn.received_qty_kg || matchedGrn.receivedQtyKg || matchedGrn.netWeightKg ? `${matchedGrn.received_qty_kg || matchedGrn.receivedQtyKg || matchedGrn.netWeightKg} ${matchedGrn.unit || 'kg'}` : 'N/A', isHighlight: true },
          { label: 'QC Inspection Status', value: matchedGrn.qc_status || matchedGrn.qcStatus || matchedGrn.status || 'Pending QC', isStatus: true }
        ]
      };
    }

    // 6. Inks Master Search
    const matchedInk = (inks || []).find(i => {
      const pCode = codeKeyFrom(i.product_code, i.productCode, i.id);
      const shade = codeKey(i.shade);
      return pCode === query || pCode.includes(query) || (shade && shade === query);
    });

    if (matchedInk) {
      return {
        type: 'INK',
        entityCategory: 'Ink & Solvent Master Record',
        badgeColor: '#db2777',
        badgeBg: '#fdf2f8',
        title: `${matchedInk.shade || 'Ink Shade'} (${matchedInk.product_code || matchedInk.productCode})`,
        code: matchedInk.product_code || matchedInk.productCode || matchedInk.id,
        raw: matchedInk,
        properties: [
          { label: 'Product Code', value: matchedInk.product_code || matchedInk.productCode, isCode: true },
          { label: 'Shade / Color', value: matchedInk.shade || 'N/A' },
          { label: 'Ink Type', value: matchedInk.ink_type || matchedInk.inkType || 'N/A' },
          { label: 'Manufacturer / Brand', value: matchedInk.manufacturer || 'N/A' },
          { label: 'Supplier Name', value: matchedInk.supplier_name || matchedInk.supplierName || 'N/A' }
        ]
      };
    }

    // 7. Dispatch Shipments / Challans Search
    const matchedDispatch = (dispatchShipments || []).concat(deliveryChallans || []).find(d => {
      const dId = codeKeyFrom(d.dispatch_id, d.dispatchId, d.id);
      const inv = codeKeyFrom(d.invoiceNo, d.invoice_no);
      const lr = codeKeyFrom(d.lr_no, d.lrNo, d.lr_number);
      const veh = codeKeyFrom(d.vehicle_no, d.vehicleNo, d.vehicle_number);
      return (dId && (dId === query || dId.includes(query))) || (inv && inv === query) || (lr && lr === query) || (veh && veh === query);
    });

    if (matchedDispatch) {
      const jName = matchedDispatch.job_name || matchedDispatch.jobName || '';
      const oId = matchedDispatch.order_id || matchedDispatch.orderId || '';
      const traceData = traceBarcode({
        barcode: matchedDispatch.dispatch_id || matchedDispatch.dispatchId || matchedDispatch.id,
        shipment: matchedDispatch,
        jobName: jName,
        orderId: oId
      });

      return {
        type: 'DISPATCH',
        entityCategory: 'Finished Goods Dispatch & Outward Shipment',
        badgeColor: '#16a34a',
        badgeBg: '#f0fdf4',
        title: `Dispatch ID: ${matchedDispatch.dispatch_id || matchedDispatch.dispatchId || matchedDispatch.id}`,
        code: matchedDispatch.dispatch_id || matchedDispatch.dispatchId || matchedDispatch.id,
        raw: matchedDispatch,
        jobName: traceData.jobName || jName,
        orderId: traceData.orderId || oId,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        traceabilityChecked: true,
        isDispatchBarCode: true,
        properties: [
          { label: 'Dispatch Shipment ID', value: matchedDispatch.dispatch_id || matchedDispatch.dispatchId || matchedDispatch.id, isCode: true },
          { label: 'Client Consignee', value: matchedDispatch.client_name || matchedDispatch.clientName || 'N/A' },
          { label: 'Job Name', value: jName || 'N/A' },
          { label: 'Invoice No', value: matchedDispatch.invoiceNo || matchedDispatch.invoice_no || 'N/A' },
          { label: 'Vehicle Number', value: shipmentVehicle(matchedDispatch) || 'N/A' },
          { label: 'LR / Waybill Number', value: shipmentLr(matchedDispatch) || 'N/A' },
          { label: 'Total Rolls Dispatched', value: matchedDispatch.total_rolls || matchedDispatch.totalRolls || matchedDispatch.items?.length ? `${matchedDispatch.total_rolls || matchedDispatch.totalRolls || matchedDispatch.items?.length} Rolls` : 'N/A' },
          { label: 'Total Net Weight', value: matchedDispatch.total_net_weight_kg || matchedDispatch.totalNetWeightKg ? `${matchedDispatch.total_net_weight_kg || matchedDispatch.totalNetWeightKg} kg` : 'N/A', isHighlight: true },
          { label: 'Total Gross Weight', value: matchedDispatch.total_gross_weight_kg || matchedDispatch.totalGrossWeightKg ? `${matchedDispatch.total_gross_weight_kg || matchedDispatch.totalGrossWeightKg} kg` : 'N/A' },
          { label: 'Dispatch Date', value: shipmentDispatchDate(matchedDispatch) || 'N/A' }
        ]
      };
    }

    // 8. Raw Material Inventory Items Search
    const matchedItem = (inventory || []).find(item => {
      const iId = codeKey(item.id);
      const iCode = codeKeyFrom(item.item_code, item.itemCode);
      const iName = codeKeyFrom(item.item_name, item.itemName);
      return iId === query || iCode === query || (iCode && iCode.includes(query)) || (iName && iName.includes(query));
    });

    if (matchedItem) {
      return {
        type: 'INVENTORY_ITEM',
        entityCategory: 'Raw Material Inventory Master Item',
        badgeColor: '#0284c7',
        badgeBg: '#f0f9ff',
        title: displayItemName(matchedItem.item_name || matchedItem.itemName),
        code: matchedItem.item_code || matchedItem.itemCode || matchedItem.id,
        raw: matchedItem,
        properties: [
          { label: 'Item Code', value: matchedItem.item_code || matchedItem.itemCode || matchedItem.id, isCode: true },
          { label: 'Item Name', value: displayItemName(matchedItem.item_name || matchedItem.itemName) || 'N/A' },
          { label: 'Category', value: matchedItem.category || 'N/A' },
          { label: 'Film Type', value: matchedItem.film_type || matchedItem.filmType || 'N/A' }
        ]
      };
    }

    // 9. Purchase Orders (PO) Search (Internal ERP Verification)
    const cleanPoQuery = query.replace(/^samyak-erp-po:/i, '').replace(/^erp-doc-po:/i, '').replace(/^po:/i, '').trim();

    // Guard: Dispatch barcodes or FG rolls should NEVER match as Purchase Orders
    if (cleanPoQuery.startsWith('fg-disp-') || cleanPoQuery.startsWith('pl-') || cleanPoQuery.startsWith('disp-') || cleanPoQuery.startsWith('dc-')) {
      return { notFound: true, query: activeBarcode };
    }

    // Check safeLocalStorage / cached issued POs first
    let matchedPoData = null;
    let matchedPoNo = '';
    const savedPos = safeLocalStorageGet('samyak_erp_issued_pos', {});
    if (savedPos && typeof savedPos === 'object') {
      for (const [key, val] of Object.entries(savedPos)) {
        const cleanKey = key.toLowerCase();
        if (cleanKey.length > 0 && (cleanKey === cleanPoQuery || (cleanPoQuery.length >= 4 && cleanKey.includes(cleanPoQuery)))) {
          matchedPoData = val;
          matchedPoNo = key;
          break;
        }
      }
    }

    // Check across orders for issued PO numbers if not in store
    if (!matchedPoData && cleanPoQuery.length >= 3) {
      const ordWithPo = (orders || []).find(o => {
        const poNum = codeKeyFrom(o.poNumber, o.po_number);
        const hasReqPo = (o.materialRequirements || []).some(r => {
          const reqPo = codeKey(r.poNumber);
          return reqPo.length > 0 && (reqPo === cleanPoQuery || cleanPoQuery.includes(reqPo));
        });
        return (poNum.length > 0 && (poNum === cleanPoQuery || cleanPoQuery.includes(poNum))) || hasReqPo;
      });

      if (ordWithPo) {
        matchedPoNo = ordWithPo.poNumber || cleanPoQuery.toUpperCase();
        const matchingReqs = (ordWithPo.materialRequirements || []).filter(r => {
          const reqPo = codeKey(r.poNumber);
          return reqPo.length > 0 && (reqPo === codeKey(matchedPoNo) || cleanPoQuery.includes(reqPo));
        });
        const preferredVendorName = matchingReqs[0]?.preferredVendor || 'Preferred Supplier';
        const vendorObj = (vendors || []).find(v => (v.companyName || v.name) === preferredVendorName) || { companyName: preferredVendorName };

        matchedPoData = {
          poNumber: matchedPoNo,
          date: ordWithPo.orderDate || ordWithPo.targetDeliveryDate || new Date().toLocaleDateString('en-IN'),
          vendor: vendorObj,
          items: matchingReqs.map(r => ({
            itemDesc: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''}`.trim(),
            spec: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''} | Width: ${r.widthMm}mm`,
            qtyKg: r.qtyKg,
            rate: 165,
            amount: (parseFloat(r.qtyKg) || 0) * 165
          })),
          terms: '30 Days Net',
          deliveryDate: ordWithPo.targetDeliveryDate || 'N/A',
          remarks: `Linked to Manufacturing Order ${ordWithPo.id} (${ordWithPo.jobName})`
        };
      }
    }

    // Check across GRNs for PO number
    if (!matchedPoData && cleanPoQuery.length >= 3) {
      const grnWithPo = (grns || []).find(g => {
        const poNum = codeKeyFrom(g.po_number, g.poNumber);
        return poNum.length > 0 && (poNum === cleanPoQuery || cleanPoQuery.includes(poNum));
      });
      if (grnWithPo) {
        matchedPoNo = grnWithPo.po_number || grnWithPo.poNumber;
        matchedPoData = {
          poNumber: matchedPoNo,
          date: grnWithPo.received_date || grnWithPo.receivedDate || new Date().toLocaleDateString('en-IN'),
          vendor: (vendors || []).find(v => (v.companyName || v.name) === (grnWithPo.vendor_name || grnWithPo.vendorName || grnWithPo.supplier)) || { companyName: grnWithPo.vendor_name || grnWithPo.vendorName || grnWithPo.supplier || 'Vendor' },
          items: [{ 
            itemDesc: grnWithPo.itemName || 'Material Item', 
            qtyKg: grnWithPo.received_qty_kg || grnWithPo.netWeightKg || 0, 
            rate: grnWithPo.purchaseRatePerKg || 0,
            amount: (parseFloat(grnWithPo.received_qty_kg || grnWithPo.netWeightKg || 0) || 0) * (parseFloat(grnWithPo.purchaseRatePerKg || 0) || 0)
          }],
          terms: 'Standard Terms',
          deliveryDate: grnWithPo.received_date || 'N/A',
          remarks: `Inward GRN: ${grnWithPo.grn_number || grnWithPo.grnNumber || grnWithPo.id}`
        };
      }
    }

    if (matchedPoData) {
      const vName = typeof matchedPoData.vendor === 'string' ? matchedPoData.vendor : (matchedPoData.vendor?.companyName || matchedPoData.vendor?.name || 'N/A');
      const itemsList = matchedPoData.items || [];
      const totalPoQty = itemsList.reduce((acc, it) => acc + (parseFloat(it.qtyKg || it.qty || 0) || 0), 0);
      const totalPoAmt = itemsList.reduce((acc, it) => acc + ((parseFloat(it.qtyKg || it.qty || 0) || 0) * (parseFloat(it.rate || it.unitPrice || 0) || 0)), 0);

      return {
        type: 'PURCHASE_ORDER',
        entityCategory: 'Purchase Order (PO) - Internal ERP Document',
        badgeColor: '#4f46e5',
        badgeBg: '#eef2ff',
        title: `Purchase Order: ${matchedPoNo || matchedPoData.poNumber}`,
        code: matchedPoNo || matchedPoData.poNumber,
        raw: matchedPoData,
        properties: [
          { label: 'Purchase Order No', value: matchedPoNo || matchedPoData.poNumber, isCode: true },
          { label: 'Supplier / Vendor', value: vName },
          { label: 'PO Date', value: matchedPoData.date || 'N/A' },
          { label: 'Target / Delivery Date', value: matchedPoData.deliveryDate || 'N/A' },
          { label: 'Payment Terms', value: matchedPoData.terms || '30 Days Net' },
          { label: 'Total Material Items', value: `${itemsList.length} Items` },
          { label: 'Total Ordered Quantity', value: `${(totalPoQty || 0).toLocaleString()} kg`, isHighlight: true },
          ...(totalPoAmt > 0 ? [{ label: 'Total Order Value (Taxable)', value: `₹ ${(totalPoAmt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }] : []),
          { label: 'Delivery / Special Terms', value: matchedPoData.remarks || 'Standard flexible packaging raw material terms apply.' }
        ]
      };
    }

    return { notFound: true, query: activeBarcode };
  }, [activeBarcode, deletedBarcodes, inventoryRolls, orders, cylinders, jobMasters, grns, inks, dispatchShipments, deliveryChallans, inventory, vendors, productionRecords, scrapItems, storeIssueTransactions, fetchedStoreIssues, ledgerEntries, sfgGoods]);

  const handleCopyDetails = () => {
    if (!searchResults || searchResults.notFound || searchResults.deleted) return;
    const textLines = [
      `=== SAMYAK FLEXI-ERP BARCODE INSPECTION ===`,
      `Category: ${searchResults.entityCategory}`,
      `Title: ${searchResults.title}`,
      `Identifier: ${searchResults.code}`,
      `------------------------------------------`,
      ...searchResults.properties.map(p => `${p.label}: ${p.value}`),
      ...(searchResults.dateOfPrinting ? [`Date of Printing: ${searchResults.dateOfPrinting}`] : []),
      ...(Array.isArray(searchResults.materialsUsed) && searchResults.materialsUsed.length
        ? searchResults.materialsUsed.map((mat) => `Material: ${mat.name} | GRN ${mat.grnNo} | ${mat.vendorName} | Invoice ${mat.invoiceNo} | Batch ${mat.batchNo} | Inward ${mat.receivedDate} | QC ${mat.qcStatus}`)
        : (searchResults.traceabilityChecked ? [EMPTY_TRACE_MESSAGE] : [])),
      `------------------------------------------`,
      `Scanned At: ${new Date().toLocaleString('en-IN')}`
    ].join('\n');

    navigator.clipboard.writeText(textLines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      ref={shellRef}
      data-modal-root=""
      data-modal-backdrop=""
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        data-scanner-modal="inspector"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '840px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* Modal Header */}
        <div 
          style={{
            padding: '18px 24px',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div 
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.2)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(96, 165, 250, 0.3)'
              }}
            >
              <ScanBarcode size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#ffffff' }}>
                  Universal Barcode & 2D QR Inspector
                </h3>
                <span 
                  style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    fontSize: '0.68rem',
                    fontWeight: '800',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <LockIcon size={10} /> READ-ONLY CHECK
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                Scan with handheld scanner gun, mobile camera, or paste barcode to inspect linked record details.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-modal-dismiss=""
            aria-label="Close scanner"
            onClick={() => {
              stopCamera();
              onClose?.();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Camera Input Bar */}
        <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search 
                size={18} 
                style={{ 
                  position: 'absolute', 
                  left: '14px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: '#64748b' 
                }} 
              />
              <input
                ref={inputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Scan / Type Barcode ID, Batch No, OCN, Cylinder SKU, GRN, Item Code..."
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 42px',
                  borderRadius: '10px',
                  border: '2px solid #cbd5e1',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  color: '#0f172a',
                  outline: 'none',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              />
              {barcodeInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: '0 20px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '700',
                fontSize: '0.9rem'
              }}
            >
              <Search size={16} /> Inspect
            </button>

            <button
              type="button"
              onClick={cameraActive ? stopCamera : () => startCamera(readRememberedCameraId(cameraStorage()))}
              className="btn-secondary"
              style={{
                padding: '0 16px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                fontSize: '0.88rem'
              }}
            >
              {cameraActive ? <CameraOff size={16} /> : <Camera size={16} />}
              {cameraActive ? 'Stop' : 'Camera'}
            </button>
          </form>

          {/* Camera Viewport (if active) */}
          {cameraActive && (
            <div 
              style={{ 
                marginTop: '12px', 
                position: 'relative', 
                borderRadius: '10px', 
                overflow: 'hidden', 
                background: '#000', 
                maxHeight: '220px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Barcode camera preview"
                style={{ width: '100%', height: '220px', objectFit: 'cover' }}
              />
              <div 
                style={{
                  position: 'absolute',
                  border: '2px dashed #22c55e',
                  borderRadius: '12px',
                  width: '60%',
                  height: '60%',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22c55e',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                }}
              >
                Target Barcode / QR
              </div>
            </div>
          )}

          {cameraActive && videoInputs.length > 1 && (
            <label
              htmlFor="scan-camera-select"
              style={{
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                color: '#334155'
              }}
            >
              Switch camera
              <select
                id="scan-camera-select"
                aria-label="Switch camera"
                value={activeDeviceId}
                onChange={(event) => startCamera(event.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: '600'
                }}
              >
                {videoInputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            </label>
          )}

          {cameraError && (
            <div role="alert" style={{ marginTop: '8px', fontSize: '0.78rem', color: '#dc2626', fontWeight: '600' }}>
              {cameraError}
            </div>
          )}
        </div>

        {/* Modal Body / Results Inspector Area */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {!activeBarcode ? (
            <div 
              style={{
                textAlign: 'center',
                padding: '48px 16px',
                color: '#64748b'
              }}
            >
              <div 
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  color: '#94a3b8'
                }}
              >
                <QrCode size={36} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Awaiting Barcode Scan or Input
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '440px', margin: '0 auto' }}>
                Point any USB handheld scanner gun at a barcode sticker, scan via camera, or type an ID above to instantly view its detailed specifications and production history.
              </p>
            </div>
          ) : searchResults?.deleted ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px'
              }}
            >
              <AlertCircle size={40} style={{ color: '#dc2626', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#991b1b', margin: '0 0 8px 0' }}>
                {String(searchResults.status || '').toLowerCase() === 'written off' ? 'Written Off' : 'Deleted'}
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#7f1d1d', maxWidth: '520px', margin: '0 auto 8px auto' }}>
                Barcode <strong>{searchResults.barcode}</strong> is not stock.
              </p>
              <p style={{ fontSize: '0.86rem', color: '#7f1d1d', maxWidth: '520px', margin: '0 auto 8px auto' }}>
                Reason: {searchResults.reason}
              </p>
              {(searchResults.deletedBy || searchResults.deletedAt) && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 auto 16px auto' }}>
                  {[searchResults.deletedBy, searchResults.deletedAt].filter(Boolean).join(' · ')}
                </p>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClear}
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                Clear & Scan Next Barcode
              </button>
            </div>
          ) : searchResults?.notFound ? (
            <div 
              style={{
                textAlign: 'center',
                padding: '40px 16px',
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '12px'
              }}
            >
              <AlertCircle size={40} style={{ color: '#e11d48', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#9f1239', margin: '0 0 6px 0' }}>
                No Matching Record Found in Database
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#881337', maxWidth: '520px', margin: '0 auto 16px auto' }}>
                Barcode <strong>"{searchResults.query}"</strong> does not match any known Inventory Roll, Job Order, Cylinder Set, Job Master, GRN, Ink Code, or Dispatch shipment in the system.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClear}
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                Clear & Scan Next Barcode
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Result Entity Header */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: searchResults.badgeBg,
                  border: `1px solid ${searchResults.badgeColor}33`,
                  borderRadius: '12px',
                  padding: '16px 20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div 
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: searchResults.badgeColor,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
                    }}
                  >
                    {searchResults.type === 'ROLL' && <Package size={24} />}
                    {searchResults.type === 'ORDER' && <FileText size={24} />}
                    {searchResults.type === 'CYLINDER' && <Cpu size={24} />}
                    {searchResults.type === 'JOB_MASTER' && <Layers size={24} />}
                    {searchResults.type === 'GRN' && <ShieldCheck size={24} />}
                    {searchResults.type === 'INK' && <Tag size={24} />}
                    {searchResults.type === 'DISPATCH' && <Truck size={24} />}
                    {searchResults.type === 'INVENTORY_ITEM' && <Database size={24} />}
                    {searchResults.type === 'SCRAP' && <Trash2 size={24} />}
                  </div>

                  <div>
                    <span 
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: searchResults.badgeColor,
                        background: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginBottom: '4px'
                      }}
                    >
                      {searchResults.entityCategory}
                    </span>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                      {searchResults.title}
                    </h3>
                    {searchResults.message ? (
                      <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#7f1d1d', maxWidth: '460px' }}>{searchResults.message}</p>
                    ) : null}
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontFamily: 'monospace', fontWeight: '700', marginTop: '2px' }}>
                      ID: {searchResults.code}
                    </div>
                  </div>
                </div>

                {/* 2D QR Code Visual Badge */}
                {searchResults.type === 'SCRAP' ? null : (
                <div style={{ background: '#ffffff', padding: '6px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
                  <QRCode2D value={searchResults.code} size={64} showLabel={false} />
                </div>
                )}
              </div>

              {/* Comprehensive Properties Grid */}
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                {searchResults.properties.map((prop, idx) => (
                  <div 
                    key={idx}
                    style={{
                      background: prop.isHighlight ? '#ecfdf5' : '#ffffff',
                      border: prop.isHighlight ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '10px 14px'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', marginBottom: '2px' }}>
                      {prop.label}
                    </div>
                    <div 
                      style={{
                        fontSize: prop.isHighlight ? '1.05rem' : '0.88rem',
                        fontWeight: prop.isHighlight || prop.isCode ? '800' : '600',
                        color: prop.isHighlight ? '#065f46' : (prop.isStatus ? '#0284c7' : '#1e293b'),
                        fontFamily: prop.isCode ? 'monospace' : 'inherit',
                        wordBreak: 'break-word'
                      }}
                    >
                      {prop.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Date of Printing Callout (from Active Print Run) */}
              {searchResults.dateOfPrinting && (
                <div 
                  style={{ 
                    background: '#ecfdf5', 
                    border: '1px solid #a7f3d0', 
                    borderRadius: '10px', 
                    padding: '12px 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Calendar size={20} style={{ color: '#047857' }} />
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Date of Printing (Active Print Run)
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: '800', color: '#047857', marginTop: '2px' }}>
                        {searchResults.dateOfPrinting}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Raw materials actually consumed, issued, or linked by roll lineage */}
              {searchResults.traceabilityChecked && (
                <div
                  data-material-trace=""
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Database size={16} style={{ color: '#2563eb' }} /> Raw Materials Used & Inward GRN Details ({searchResults.materialsUsed?.length || 0})
                    </h4>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px' }}>
                      Database Inward Traceability
                    </span>
                  </div>

                  {Array.isArray(searchResults.materialsUsed) && searchResults.materialsUsed.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                            <th style={{ padding: '8px 10px' }}>Material Name</th>
                            <th style={{ padding: '8px 10px' }}>Category</th>
                            <th style={{ padding: '8px 10px' }}>Inward GRN #</th>
                            <th style={{ padding: '8px 10px' }}>Vendor / Supplier</th>
                            <th style={{ padding: '8px 10px' }}>Vendor Invoice #</th>
                            <th style={{ padding: '8px 10px' }}>Batch / Lot #</th>
                            <th style={{ padding: '8px 10px' }}>Inward Date</th>
                            <th style={{ padding: '8px 10px' }}>QC Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {searchResults.materialsUsed.map((mat, idx) => {
                            const tone = qcStatusTone(mat.qcStatus);
                            return (
                              <tr key={`${mat.barcode || mat.grnNo || 'row'}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                <td style={{ padding: '8px 10px', fontWeight: '700', color: '#0f172a' }}>{mat.name}</td>
                                <td style={{ padding: '8px 10px', color: '#475569' }}>{mat.category}</td>
                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: '800', color: '#2563eb' }}>{mat.grnNo}</td>
                                <td style={{ padding: '8px 10px', color: '#334155' }}>{mat.vendorName}</td>
                                <td style={{ padding: '8px 10px', color: '#475569' }}>{mat.invoiceNo}</td>
                                <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{mat.batchNo}</td>
                                <td style={{ padding: '8px 10px', color: '#64748b' }}>{mat.receivedDate}</td>
                                <td style={{ padding: '8px 10px' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: tone.color, background: tone.background, padding: '2px 6px', borderRadius: '4px' }}>
                                    {mat.qcStatus}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div data-material-trace-empty="" style={{ padding: '14px 12px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#475569', fontSize: '0.84rem', fontWeight: '700' }}>
                      {EMPTY_TRACE_MESSAGE}
                    </div>
                  )}
                </div>
              )}

              {/* Redirect to Production Record Action Card */}
              {(searchResults.jobName || searchResults.title) && (
                <div 
                  style={{ 
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
                    border: '1px solid #bae6fd', 
                    borderRadius: '12px', 
                    padding: '14px 18px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginTop: '4px'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '800', color: '#0369a1', fontSize: '0.95rem' }}>
                      Redirect to Production Record
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '2px' }}>
                      View complete manufacturing records & approval logs for <strong>{searchResults.jobName || searchResults.title}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      if (onNavigateToProductionRecord) {
                        onNavigateToProductionRecord(searchResults.jobName || searchResults.title, {
                          orderId: searchResults.orderId || searchResults.code,
                          jobName: searchResults.jobName || searchResults.title
                        });
                      }
                    }}
                    style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', fontWeight: '800', padding: '9px 18px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ArrowRight size={16} /> Open Production Record
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div 
          style={{
            padding: '14px 24px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} style={{ color: '#0284c7' }} />
            <span>Inspection Only Mode — No database changes will be performed.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {searchResults && searchResults.type === 'PURCHASE_ORDER' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setActivePoPdfData(searchResults.raw)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  background: '#eef2ff',
                  color: '#4f46e5',
                  borderColor: '#c7d2fe',
                  fontSize: '0.82rem',
                  fontWeight: '700'
                }}
              >
                <FileText size={14} /> View PO Document
              </button>
            )}

            {searchResults && !searchResults.notFound && !searchResults.deleted && (
              <button
                type="button"
                onClick={handleCopyDetails}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: copied ? '#ecfdf5' : '#ffffff',
                  color: copied ? '#059669' : '#334155',
                  border: copied ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied Details!' : 'Copy Summary'}</span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={handleClear}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '0.82rem'
              }}
            >
              <RefreshCw size={14} /> Scan Next
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                stopCamera();
                onClose?.();
              }}
              style={{
                padding: '8px 18px',
                fontSize: '0.82rem',
                borderRadius: '6px'
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* PO Document Viewer Overlay */}
      {activePoPdfData && (
        <PurchaseOrderPDF 
          poData={activePoPdfData}
          vendors={vendors}
          onClose={() => setActivePoPdfData(null)}
        />
      )}
    </div>
  );
}
