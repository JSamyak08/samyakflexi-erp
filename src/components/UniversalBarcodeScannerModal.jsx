import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Lock, 
  Tag, 
  Calendar, 
  User, 
  Cpu, 
  MapPin, 
  ArrowRight,
  Info,
  Truck,
  Hash,
  Database
} from 'lucide-react';
import QRCode2D from './QRCode2D';
import PurchaseOrderPDF from './PurchaseOrderPDF';

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
  onNavigateToProductionRecord
}) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeBarcode, setActiveBarcode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [activePoPdfData, setActivePoPdfData] = useState(null);
  
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

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
    }
  }, [isOpen]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access not supported on this device/browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.warn('Camera stream error:', err);
      setCameraError(err.message || 'Unable to access camera. Ensure permissions are granted.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

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
    setBarcodeInput('');
    setActiveBarcode('');
    if (inputRef.current) inputRef.current.focus();
  };

  // Helper to resolve materials used and inward GRNs for a job dynamically from database
  const getJobTraceabilityData = (targetJobName, targetOrderId) => {
    if (!targetJobName && !targetOrderId) return { dateOfPrinting: null, materialsUsed: [], jobName: '', orderId: '' };

    const matchedProdRec = (productionRecords || []).find(pr => 
      (targetOrderId && String(pr.orderId) === String(targetOrderId)) ||
      (targetJobName && String(pr.jobName || '').toLowerCase().trim() === String(targetJobName).toLowerCase().trim())
    );
    const matchedOrd = (orders || []).find(o => 
      (targetOrderId && String(o.id) === String(targetOrderId)) ||
      (targetJobName && String(o.jobName || '').toLowerCase().trim() === String(targetJobName).toLowerCase().trim())
    );

    const printingDate = matchedProdRec?.activeRunDate || 
                         matchedProdRec?.printingDate || 
                         matchedProdRec?.startedAt || 
                         matchedProdRec?.date || 
                         matchedProdRec?.created_at || 
                         matchedOrd?.printingDate || 
                         matchedOrd?.orderDate || 
                         'Active Printing Run Date Recorded';

    const resolvedJobName = matchedProdRec?.jobName || matchedOrd?.jobName || targetJobName || '';
    const resolvedOrderId = matchedProdRec?.orderId || matchedOrd?.id || targetOrderId || '';

    const materials = [];
    const usedNames = new Set();

    // 1. From production record materialsUsed / inputRolls
    const prodMats = matchedProdRec?.materialsUsed || matchedProdRec?.inputRolls || matchedProdRec?.rawMaterials || [];
    prodMats.forEach(m => {
      const mName = m.itemName || m.name || m.filmType || m.materialName || 'Film Substrate';
      if (!mName || usedNames.has(mName.toLowerCase())) return;
      usedNames.add(mName.toLowerCase());

      const matchedGrn = (grns || []).find(g => {
        const gItem = (g.itemName || g.item_name || '').toLowerCase();
        const mItem = mName.toLowerCase();
        const mBatch = (m.batchNo || m.batch_no || '').toLowerCase();
        const gBatch = (g.batch_no || g.batchNo || '').toLowerCase();
        return (gItem && (gItem.includes(mItem) || mItem.includes(gItem))) || (mBatch && gBatch && mBatch === gBatch);
      });

      materials.push({
        name: mName,
        category: m.category || matchedGrn?.category || 'Film Substrates',
        qtyUsed: m.qtyKg || m.weightKg || m.quantity ? `${m.qtyKg || m.weightKg || m.quantity} kg` : 'As per spec',
        grnNo: matchedGrn?.grn_number || matchedGrn?.grnNumber || matchedGrn?.grnNo || m.grnNo || 'GRN-STORE',
        vendorName: matchedGrn?.vendor_name || matchedGrn?.vendorName || matchedGrn?.supplier || m.vendorName || 'N/A',
        invoiceNo: matchedGrn?.invoice_number || matchedGrn?.invoiceNumber || matchedGrn?.invoiceNo || m.invoiceNo || 'N/A',
        batchNo: matchedGrn?.batch_no || matchedGrn?.batchNo || m.batchNo || 'N/A',
        receivedDate: matchedGrn?.received_date || matchedGrn?.receivedDate || 'N/A',
        qcStatus: matchedGrn?.qc_status || matchedGrn?.qcStatus || 'PASSED & APPROVED'
      });
    });

    // 2. From matchedOrd.materialRequirements
    const ordReqs = matchedOrd?.materialRequirements || [];
    ordReqs.forEach(req => {
      const rName = `${req.filmType || 'Substrate'} ${req.micron && req.micron !== '-' ? req.micron + 'µ' : ''}`.trim();
      if (!rName || usedNames.has(rName.toLowerCase())) return;
      usedNames.add(rName.toLowerCase());

      const matchedGrn = (grns || []).find(g => {
        const gItem = (g.itemName || g.item_name || '').toLowerCase();
        const rItem = rName.toLowerCase();
        return gItem && (gItem.includes(rItem) || rItem.includes(gItem) || g.category === 'Film Substrates');
      });

      materials.push({
        name: rName,
        category: 'Film Substrates',
        qtyUsed: req.qtyKg ? `${req.qtyKg} kg` : 'As per job card',
        grnNo: matchedGrn?.grn_number || matchedGrn?.grnNumber || matchedGrn?.grnNo || 'GRN-2026-STORE',
        vendorName: matchedGrn?.vendor_name || matchedGrn?.vendorName || matchedGrn?.supplier || req.preferredVendor || 'N/A',
        invoiceNo: matchedGrn?.invoice_number || matchedGrn?.invoiceNumber || matchedGrn?.invoiceNo || 'N/A',
        batchNo: matchedGrn?.batch_no || matchedGrn?.batchNo || 'N/A',
        receivedDate: matchedGrn?.received_date || matchedGrn?.receivedDate || 'N/A',
        qcStatus: matchedGrn?.qc_status || matchedGrn?.qcStatus || 'PASSED & APPROVED'
      });
    });

    // 3. From Inks & Adhesives
    if (matchedProdRec?.inksUsed || matchedOrd?.inksUsed) {
      const inksList = matchedProdRec?.inksUsed || matchedOrd?.inksUsed || [];
      inksList.forEach(ink => {
        const inkName = ink.shade || ink.productCode || ink.name || 'Liquid Ink';
        if (usedNames.has(inkName.toLowerCase())) return;
        usedNames.add(inkName.toLowerCase());

        const matchedGrn = (grns || []).find(g => (g.category || '').includes('Ink') || (g.itemName || '').toLowerCase().includes('ink'));
        const matchedInkObj = (inks || []).find(i => (i.shade || '').toLowerCase() === inkName.toLowerCase() || (i.product_code || '').toLowerCase() === (ink.productCode || '').toLowerCase());

        materials.push({
          name: inkName,
          category: 'Printing Inks & Solvents',
          qtyUsed: ink.qtyKg ? `${ink.qtyKg} kg` : 'As per run',
          grnNo: matchedGrn?.grn_number || matchedGrn?.grnNumber || matchedGrn?.grnNo || 'GRN-INK-STORE',
          vendorName: matchedGrn?.vendor_name || matchedGrn?.vendorName || matchedInkObj?.supplier_name || matchedInkObj?.manufacturer || 'N/A',
          invoiceNo: matchedGrn?.invoice_number || matchedGrn?.invoiceNumber || 'N/A',
          batchNo: matchedGrn?.batch_no || matchedGrn?.batchNo || ink.batchNo || 'N/A',
          receivedDate: matchedGrn?.received_date || matchedGrn?.receivedDate || 'N/A',
          qcStatus: 'PASSED & APPROVED'
        });
      });
    }

    // 4. Default fallback to inventory / GRNs matching category if list is still empty
    if (materials.length === 0 && (grns || []).length > 0) {
      const sampleGrns = grns.slice(0, 2);
      sampleGrns.forEach(g => {
        materials.push({
          name: g.itemName || g.item_name || 'Substrate Material',
          category: g.category || 'Film Substrates',
          qtyUsed: g.received_qty_kg || g.receivedQtyKg ? `${g.received_qty_kg || g.receivedQtyKg} kg` : 'N/A',
          grnNo: g.grn_number || g.grnNumber || g.grnNo || g.id,
          vendorName: g.vendor_name || g.vendorName || g.supplier || 'N/A',
          invoiceNo: g.invoice_number || g.invoiceNumber || g.invoiceNo || 'N/A',
          batchNo: g.batch_no || g.batchNo || 'N/A',
          receivedDate: g.received_date || g.receivedDate || 'N/A',
          qcStatus: g.qc_status || g.qcStatus || 'PASSED & APPROVED'
        });
      });
    }

    return { dateOfPrinting: printingDate, materialsUsed: materials, jobName: resolvedJobName, orderId: resolvedOrderId };
  };

  // Cross-Database Multi-Collection Search Algorithm
  const searchResults = useMemo(() => {
    const query = (activeBarcode || '').trim().toLowerCase();
    if (!query) return null;

    // Extract potential GRN code if barcode is formatted as (CON|RM)-BC-YYYYMMDD-XXX or similar
    const grnExtract = query.replace(/^(con|rm)-bc-/, '').replace(/-\d+$/, '');

    // 1. Inventory Rolls & Inward Packages Search (Highest Priority for Barcodes)
    // Pass 1: Strict Exact Match on Barcode ID or Roll ID
    let matchedRoll = (inventoryRolls || []).find(r => {
      const bId = (r.barcodeId || r.id || '').trim().toLowerCase();
      return bId === query;
    });

    // Pass 2: Exact Match on Batch Number, Invoice Number, or GRN Number
    if (!matchedRoll) {
      matchedRoll = (inventoryRolls || []).find(r => {
        const bNo = (r.batchNo || r.lotNo || '').trim().toLowerCase();
        const invNo = (r.invoiceNo || '').trim().toLowerCase();
        const rGrn = (r.grnNo || r.grn_no || '').trim().toLowerCase();
        return (bNo && bNo === query) || (invNo && invNo === query) || (rGrn && rGrn === query);
      });
    }

    // Pass 3: Fallback Partial Match (ONLY if query length >= 4 and no exact match exists)
    if (!matchedRoll && query.length >= 4) {
      matchedRoll = (inventoryRolls || []).find(r => {
        const bId = (r.barcodeId || r.id || '').trim().toLowerCase();
        return bId.includes(query);
      });
    }

    if (matchedRoll) {
      // Find linked GRN across grns list to backfill any missing inward metadata
      const linkedGrn = (grns || []).find(g => {
        const gNum = (g.grn_number || g.grnNumber || g.grnNo || g.id || '').toLowerCase();
        const gCode = gNum.replace(/^grn-/, '');
        const rollGrn = (matchedRoll.grnNo || matchedRoll.grn_no || '').toLowerCase();
        return (rollGrn && (gNum === rollGrn || gNum.includes(rollGrn) || rollGrn.includes(gNum))) ||
               (grnExtract && (gCode === grnExtract || gNum.includes(grnExtract))) ||
               (matchedRoll.invoiceNo && (String(g.invoice_number || g.invoiceNumber || g.invoiceNo || '').toLowerCase() === String(matchedRoll.invoiceNo).toLowerCase())) ||
               (matchedRoll.batchNo && (String(g.batch_no || g.batchNo || '').toLowerCase() === String(matchedRoll.batchNo).toLowerCase()));
      });

      // Find linked Inventory Item across inventory list
      const linkedItem = (inventory || []).find(item => {
        const iId = (item.id || '').toLowerCase();
        const iCode = (item.item_code || item.itemCode || '').toLowerCase();
        const iName = (item.item_name || item.itemName || '').toLowerCase();
        const rollItemId = (matchedRoll.itemId || matchedRoll.stockItemId || '').toLowerCase();
        const rollItemName = (matchedRoll.itemName || '').toLowerCase();
        return (rollItemId && (iId === rollItemId || iCode === rollItemId)) ||
               (rollItemName && (iName === rollItemName || iCode === rollItemName));
      });

      const resolvedCategory = matchedRoll.category || linkedGrn?.category || linkedItem?.category || (matchedRoll.barcodeId?.startsWith('CON-BC') ? 'Chemicals & Solvents' : '');
      const resolvedItemName = matchedRoll.itemName || linkedGrn?.itemName || linkedItem?.item_name || linkedItem?.itemName || (resolvedCategory ? `${resolvedCategory} Material` : 'Inward Stock Material');
      const resolvedVendor = matchedRoll.vendorName || matchedRoll.vendor || linkedGrn?.vendor_name || linkedGrn?.vendorName || linkedGrn?.supplier || linkedItem?.vendor || linkedItem?.vendor_name || 'N/A';
      const resolvedBatch = matchedRoll.batchNo || matchedRoll.lotNo || linkedGrn?.batch_no || linkedGrn?.batchNo || 'N/A';
      const resolvedInvoice = matchedRoll.invoiceNo || matchedRoll.invoice_no || linkedGrn?.invoice_number || linkedGrn?.invoiceNumber || linkedGrn?.invoiceNo || 'N/A';
      const resolvedPO = matchedRoll.poNumber || matchedRoll.po_number || linkedGrn?.po_number || linkedGrn?.poNumber || 'N/A';
      const resolvedGRN = matchedRoll.grnNo || matchedRoll.grn_no || linkedGrn?.grn_number || linkedGrn?.grnNumber || linkedGrn?.grnNo || (grnExtract && grnExtract.length > 3 ? `GRN-${grnExtract.toUpperCase()}` : 'N/A');
      const resolvedPackaging = matchedRoll.packagingType || linkedGrn?.packagingType || (resolvedCategory.includes('Chemical') || resolvedCategory.includes('Solvent') ? 'Drum / Container' : (resolvedCategory.includes('Ink') ? 'Ink Container / Bucket' : 'Roll / Pack'));

      const isSFG = matchedRoll.rollType === 'SFG' || (resolvedCategory && resolvedCategory.includes('Semi-Finished')) || (matchedRoll.rollType || '').includes('SFG');
      const isFG = matchedRoll.rollType === 'FG' || (resolvedCategory && resolvedCategory.includes('Finished')) || (matchedRoll.rollType || '').includes('FG') || (matchedRoll.barcodeId || '').startsWith('FG-DISP-');
      const isFilm = resolvedCategory === 'Film Substrates' || (!resolvedCategory && (matchedRoll.rollType === 'RAW_MATERIAL' || (matchedRoll.barcodeId || '').startsWith('RM-BC') || Number(matchedRoll.micron) > 0));

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
      } else if (resolvedCategory === 'Chemicals & Solvents' || (matchedRoll.barcodeId || '').startsWith('CON-BC')) {
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
        { label: 'Barcode ID', value: matchedRoll.barcodeId || matchedRoll.id || 'N/A', isCode: true },
        { label: 'Item Name', value: resolvedItemName },
        { label: 'Material Category', value: resolvedCategory || (isFilm ? 'Film Substrates' : 'General Inventory') },
        { label: 'Packaging Unit', value: resolvedPackaging },
        { label: 'Net Usable Qty / Weight', value: matchedRoll.netWeightKg !== undefined && matchedRoll.netWeightKg !== null ? `${matchedRoll.netWeightKg} ${matchedRoll.unit || 'kg'}` : (matchedRoll.weightKg !== undefined && matchedRoll.weightKg !== null ? `${matchedRoll.weightKg} ${matchedRoll.unit || 'kg'}` : 'N/A'), isHighlight: true },
        { label: 'Gross Scale Weight', value: matchedRoll.grossWeightKg !== undefined && matchedRoll.grossWeightKg !== null ? `${matchedRoll.grossWeightKg} ${matchedRoll.unit || 'kg'}` : 'N/A' },
        { label: 'Tare Weight', value: matchedRoll.tareWeightKg !== undefined && matchedRoll.tareWeightKg !== null ? `${matchedRoll.tareWeightKg} ${matchedRoll.unit || 'kg'}` : 'N/A' },
        { label: 'Vendor / Manufacturer', value: resolvedVendor },
        { label: 'Batch / Lot Number', value: resolvedBatch },
        { label: 'Vendor Invoice No', value: resolvedInvoice },
        { label: 'Purchase Order No', value: resolvedPO },
        { label: 'Linked GRN No', value: resolvedGRN },
        { label: 'QC Quality Status', value: matchedRoll.qcStatus || matchedRoll.qc_status || linkedGrn?.qc_status || linkedGrn?.status || 'N/A', isStatus: true },
        { label: 'Storage Bay / Location', value: matchedRoll.locationBay || matchedRoll.location || (resolvedCategory === 'Chemicals & Solvents' ? 'Solvent Storage Yard' : (resolvedCategory === 'Inks & Solvents' ? 'Ink Mixing Room' : 'N/A')) },
        { label: 'Inward / Production Date', value: matchedRoll.productionDate || (matchedRoll.inwardDatetime ? String(matchedRoll.inwardDatetime).split('T')[0] : (matchedRoll.date || linkedGrn?.receivedDate || 'N/A')) }
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
      const traceData = getJobTraceabilityData(matchedRoll.jobName, matchedRoll.orderId);

      return {
        type: 'ROLL',
        entityCategory: entityCatTitle,
        badgeColor: badgeCol,
        badgeBg: badgeBackground,
        title: resolvedItemName,
        code: matchedRoll.barcodeId || matchedRoll.id,
        raw: matchedRoll,
        properties: rollProps,
        parentGenealogy: matchedRoll.inputBarcodeIds || [],
        jobName: traceData.jobName || matchedRoll.jobName,
        orderId: traceData.orderId || matchedRoll.orderId,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        isDispatchBarCode: isFG || (matchedRoll.barcodeId || '').startsWith('FG-DISP-')
      };
    }

    // 2. Orders / OCNs Search
    const matchedOrder = (orders || []).find(o => {
      const oId = (o.id || '').toLowerCase();
      const jName = (o.jobName || '').toLowerCase();
      const ocn = (o.jobDetails?.ocnNumber || o.ocn || '').toLowerCase();
      return oId === query || oId.includes(query) || (ocn && ocn === query) || (jName && jName.includes(query));
    });

    if (matchedOrder) {
      const traceData = getJobTraceabilityData(matchedOrder.jobName, matchedOrder.id);
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
        isDispatchBarCode: true,
        properties: [
          { label: 'Order ID / OCN', value: matchedOrder.id, isCode: true },
          { label: 'Job Name', value: matchedOrder.jobName || 'N/A' },
          { label: 'Client Name', value: matchedOrder.clientName || 'N/A' },
          { label: 'Order Quantity', value: matchedOrder.orderQtyKg ? `${matchedOrder.orderQtyKg} kg` : 'N/A', isHighlight: true },
          { label: 'Order Type', value: matchedOrder.orderType || 'N/A' },
          { label: 'Target Delivery Date', value: matchedOrder.targetDeliveryDate || matchedOrder.deliveryDate || 'N/A' },
          { label: 'Production Status', value: matchedOrder.status || 'N/A', isStatus: true },
          { label: 'Printing Execution', value: matchedOrder.printing_status || 'N/A' },
          { label: 'Actual Meters Printed', value: matchedOrder.actual_meters_printed ? `${matchedOrder.actual_meters_printed} m` : 'N/A' }
        ]
      };
    }

    // 3. Rotogravure Cylinders Search
    const matchedCylinder = (cylinders || []).find(c => {
      const cId = (c.id || '').toLowerCase();
      const sku = (c.sku || c.skuCode || c.cylinderSku || '').toLowerCase();
      const jName = (c.jobName || '').toLowerCase();
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
      const sku = (jm.sku_code || jm.skuCode || '').toLowerCase();
      const jName = (jm.job_name || jm.jobName || '').toLowerCase();
      const id = (jm.id || '').toLowerCase();
      return sku === query || (sku && sku.includes(query)) || (jName && jName.includes(query)) || id === query;
    });

    if (matchedJobMaster) {
      const traceData = getJobTraceabilityData(matchedJobMaster.job_name || matchedJobMaster.jobName, matchedJobMaster.id);
      return {
        type: 'JOB_MASTER',
        entityCategory: 'Job Master Technical Specification',
        badgeColor: '#4f46e5',
        badgeBg: '#eef2ff',
        title: matchedJobMaster.job_name || matchedJobMaster.jobName || 'Job Master',
        code: matchedJobMaster.sku_code || matchedJobMaster.skuCode || matchedJobMaster.id,
        raw: matchedJobMaster,
        jobName: matchedJobMaster.job_name || matchedJobMaster.jobName,
        orderId: matchedJobMaster.id,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
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
      const gNum = (g.grn_number || g.grnNumber || g.grnNo || g.id || '').toLowerCase();
      const gCode = gNum.replace(/^grn-/, '');
      const po = (g.po_number || g.poNumber || '').toLowerCase();
      const inv = (g.invoice_number || g.invoiceNumber || g.invoiceNo || '').toLowerCase();
      const bNo = (g.batch_no || g.batchNo || '').toLowerCase();
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
          { label: 'Received Date', value: matchedGrn.received_date || matchedGrn.receivedDate || 'N/A' },
          { label: 'Received Quantity', value: matchedGrn.received_qty_kg || matchedGrn.receivedQtyKg || matchedGrn.netWeightKg ? `${matchedGrn.received_qty_kg || matchedGrn.receivedQtyKg || matchedGrn.netWeightKg} ${matchedGrn.unit || 'kg'}` : 'N/A', isHighlight: true },
          { label: 'QC Inspection Status', value: matchedGrn.qc_status || matchedGrn.qcStatus || matchedGrn.status || 'Pending QC', isStatus: true }
        ]
      };
    }

    // 6. Inks Master Search
    const matchedInk = (inks || []).find(i => {
      const pCode = (i.product_code || i.productCode || i.id || '').toLowerCase();
      const shade = (i.shade || '').toLowerCase();
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
    const matchedDispatch = (dispatchShipments || []).find(d => {
      const dId = (d.dispatch_id || d.dispatchId || d.id || '').toLowerCase();
      const lr = (d.lr_no || d.lrNo || d.lr_number || '').toLowerCase();
      const veh = (d.vehicle_no || d.vehicleNo || d.vehicle_number || '').toLowerCase();
      return dId === query || dId.includes(query) || (lr && lr === query) || (veh && veh === query);
    });

    if (matchedDispatch) {
      const jName = matchedDispatch.job_name || matchedDispatch.jobName || '';
      const oId = matchedDispatch.order_id || matchedDispatch.orderId || '';
      const traceData = getJobTraceabilityData(jName, oId);

      return {
        type: 'DISPATCH',
        entityCategory: 'Finished Goods Dispatch & Outward Shipment',
        badgeColor: '#16a34a',
        badgeBg: '#f0fdf4',
        title: `Dispatch ID: ${matchedDispatch.dispatch_id || matchedDispatch.dispatchId}`,
        code: matchedDispatch.dispatch_id || matchedDispatch.dispatchId,
        raw: matchedDispatch,
        jobName: jName,
        orderId: oId,
        dateOfPrinting: traceData.dateOfPrinting,
        materialsUsed: traceData.materialsUsed,
        isDispatchBarCode: true,
        properties: [
          { label: 'Dispatch Shipment ID', value: matchedDispatch.dispatch_id || matchedDispatch.dispatchId, isCode: true },
          { label: 'Client Consignee', value: matchedDispatch.client_name || matchedDispatch.clientName || 'N/A' },
          { label: 'Job Name', value: jName || 'N/A' },
          { label: 'Invoice No', value: matchedDispatch.invoiceNo || matchedDispatch.invoice_no || 'N/A' },
          { label: 'Vehicle Number', value: matchedDispatch.vehicle_no || matchedDispatch.vehicleNo || matchedDispatch.vehicle_number || 'N/A' },
          { label: 'LR / Waybill Number', value: matchedDispatch.lr_no || matchedDispatch.lrNo || matchedDispatch.lr_number || 'N/A' },
          { label: 'Total Rolls Dispatched', value: matchedDispatch.total_rolls || matchedDispatch.totalRolls ? `${matchedDispatch.total_rolls || matchedDispatch.totalRolls} Rolls` : 'N/A' },
          { label: 'Total Net Weight', value: matchedDispatch.total_net_weight_kg || matchedDispatch.totalNetWeightKg ? `${matchedDispatch.total_net_weight_kg || matchedDispatch.totalNetWeightKg} kg` : 'N/A', isHighlight: true },
          { label: 'Dispatch Date', value: matchedDispatch.dispatch_date || matchedDispatch.dispatchDate ? String(matchedDispatch.dispatch_date || matchedDispatch.dispatchDate).split('T')[0] : 'N/A' }
        ]
      };
    }

    // 8. Raw Material Inventory Items Search
    const matchedItem = (inventory || []).find(item => {
      const iId = (item.id || '').toLowerCase();
      const iCode = (item.item_code || item.itemCode || '').toLowerCase();
      const iName = (item.item_name || item.itemName || '').toLowerCase();
      return iId === query || iCode === query || (iCode && iCode.includes(query)) || (iName && iName.includes(query));
    });

    if (matchedItem) {
      return {
        type: 'INVENTORY_ITEM',
        entityCategory: 'Raw Material Inventory Master Item',
        badgeColor: '#0284c7',
        badgeBg: '#f0f9ff',
        title: matchedItem.item_name || matchedItem.itemName,
        code: matchedItem.item_code || matchedItem.itemCode || matchedItem.id,
        raw: matchedItem,
        properties: [
          { label: 'Item Code', value: matchedItem.item_code || matchedItem.itemCode || matchedItem.id, isCode: true },
          { label: 'Item Name', value: matchedItem.item_name || matchedItem.itemName || 'N/A' },
          { label: 'Category', value: matchedItem.category || 'N/A' },
          { label: 'Film Type', value: matchedItem.film_type || matchedItem.filmType || 'N/A' }
        ]
      };
    }

    // 9. Purchase Orders (PO) Search (Internal ERP Verification)
    const cleanPoQuery = query.replace(/^samyak-erp-po:/i, '').replace(/^erp-doc-po:/i, '').replace(/^po:/i, '').trim();
    
    // Check localStorage issued POs first
    let matchedPoData = null;
    let matchedPoNo = '';
    try {
      const savedPos = JSON.parse(localStorage.getItem('samyak_erp_issued_pos') || '{}');
      for (const [key, val] of Object.entries(savedPos)) {
        if (key.toLowerCase() === cleanPoQuery || key.toLowerCase().includes(cleanPoQuery) || cleanPoQuery.includes(key.toLowerCase())) {
          matchedPoData = val;
          matchedPoNo = key;
          break;
        }
      }
    } catch {
      // ignore
    }

    // Check across orders for issued PO numbers if not in store
    if (!matchedPoData) {
      const ordWithPo = (orders || []).find(o => {
        const poNum = (o.poNumber || o.po_number || '').toLowerCase();
        const hasReqPo = (o.materialRequirements || []).some(r => (r.poNumber || '').toLowerCase() === cleanPoQuery || cleanPoQuery.includes((r.poNumber || '').toLowerCase()));
        return (poNum && (poNum === cleanPoQuery || cleanPoQuery.includes(poNum))) || hasReqPo;
      });

      if (ordWithPo) {
        matchedPoNo = ordWithPo.poNumber || cleanPoQuery.toUpperCase();
        const matchingReqs = (ordWithPo.materialRequirements || []).filter(r => !r.poNumber || r.poNumber === matchedPoNo || cleanPoQuery.includes((r.poNumber || '').toLowerCase()));
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
    if (!matchedPoData) {
      const grnWithPo = (grns || []).find(g => {
        const poNum = (g.po_number || g.poNumber || '').toLowerCase();
        return poNum && (poNum === cleanPoQuery || cleanPoQuery.includes(poNum));
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
          { label: 'Total Ordered Quantity', value: `${totalPoQty.toLocaleString()} kg`, isHighlight: true },
          ...(totalPoAmt > 0 ? [{ label: 'Total Order Value (Taxable)', value: `₹ ${totalPoAmt.toLocaleString()}` }] : []),
          { label: 'Delivery / Special Terms', value: matchedPoData.remarks || 'Standard flexible packaging raw material terms apply.' }
        ]
      };
    }

    return { notFound: true, query: activeBarcode };
  }, [activeBarcode, inventoryRolls, orders, cylinders, jobMasters, grns, inks, dispatchShipments, inventory, vendors, productionRecords]);

  const handleCopyDetails = () => {
    if (!searchResults || searchResults.notFound) return;
    const textLines = [
      `=== SAMYAK FLEXI-ERP BARCODE INSPECTION ===`,
      `Category: ${searchResults.entityCategory}`,
      `Title: ${searchResults.title}`,
      `Identifier: ${searchResults.code}`,
      `------------------------------------------`,
      ...searchResults.properties.map(p => `${p.label}: ${p.value}`),
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
                  <Lock size={10} /> READ-ONLY CHECK
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                Scan with handheld scanner gun, mobile camera, or paste barcode to inspect linked record details.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
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
              onClick={cameraActive ? stopCamera : startCamera}
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

          {cameraError && (
            <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#dc2626', fontWeight: '600' }}>
              ⚠️ {cameraError}
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
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontFamily: 'monospace', fontWeight: '700', marginTop: '2px' }}>
                      ID: {searchResults.code}
                    </div>
                  </div>
                </div>

                {/* 2D QR Code Visual Badge */}
                <div style={{ background: '#ffffff', padding: '6px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
                  <QRCode2D value={searchResults.code} size={64} showLabel={false} />
                </div>
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

              {/* Raw Materials Used (All) with Inward GRN Details Table */}
              {Array.isArray(searchResults.materialsUsed) && searchResults.materialsUsed.length > 0 && (
                <div 
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
                      <Database size={16} style={{ color: '#2563eb' }} /> Raw Materials Used & Inward GRN Details ({searchResults.materialsUsed.length})
                    </h4>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px' }}>
                      Database Inward Traceability
                    </span>
                  </div>

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
                        {searchResults.materialsUsed.map((mat, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '8px 10px', fontWeight: '700', color: '#0f172a' }}>{mat.name}</td>
                            <td style={{ padding: '8px 10px', color: '#475569' }}>{mat.category}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: '800', color: '#2563eb' }}>{mat.grnNo}</td>
                            <td style={{ padding: '8px 10px', color: '#334155' }}>{mat.vendorName}</td>
                            <td style={{ padding: '8px 10px', color: '#475569' }}>{mat.invoiceNo}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{mat.batchNo}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{mat.receivedDate}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#047857', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' }}>
                                {mat.qcStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

            {searchResults && !searchResults.notFound && (
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
              onClick={onClose}
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
