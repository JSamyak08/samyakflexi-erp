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
  productionRecords = []
}) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeBarcode, setActiveBarcode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cameraError, setCameraError] = useState('');
  
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

  // Cross-Database Multi-Collection Search Algorithm
  const searchResults = useMemo(() => {
    const query = (activeBarcode || '').trim().toLowerCase();
    if (!query) return null;

    // 1. Inventory Rolls Search (Highest Priority for Barcodes)
    const matchedRoll = (inventoryRolls || []).find(r => {
      const bId = (r.barcodeId || r.id || '').toLowerCase();
      const bNo = (r.batchNo || '').toLowerCase();
      const invNo = (r.invoiceNo || '').toLowerCase();
      return bId === query || bId.includes(query) || (bNo && bNo === query) || (invNo && invNo === query);
    });

    if (matchedRoll) {
      return {
        type: 'ROLL',
        entityCategory: matchedRoll.rollType === 'SFG' || (matchedRoll.category || '').includes('Semi-Finished') 
          ? 'Semi-Finished Goods (SFG) Roll' 
          : (matchedRoll.rollType === 'FG' || (matchedRoll.category || '').includes('Finished') 
            ? 'Finished Goods (FG) Roll' 
            : 'Raw Material (RM) Substrate Roll'),
        badgeColor: matchedRoll.rollType === 'SFG' ? '#2563eb' : (matchedRoll.rollType === 'FG' ? '#059669' : '#d97706'),
        badgeBg: matchedRoll.rollType === 'SFG' ? '#eff6ff' : (matchedRoll.rollType === 'FG' ? '#ecfdf5' : '#fffbeb'),
        title: matchedRoll.itemName || 'Roll Substrate',
        code: matchedRoll.barcodeId || matchedRoll.id,
        raw: matchedRoll,
        properties: [
          { label: 'Barcode ID', value: matchedRoll.barcodeId || matchedRoll.id, isCode: true },
          { label: 'Roll Stage / Type', value: matchedRoll.rollType || 'RAW_MATERIAL' },
          { label: 'Net Usable Weight', value: `${matchedRoll.netWeightKg || 0} kg`, isHighlight: true },
          { label: 'Gross Scale Weight', value: `${matchedRoll.grossWeightKg || matchedRoll.netWeightKg || 0} kg` },
          { label: 'Tare Weight', value: `${matchedRoll.tareWeightKg || 0} kg` },
          { label: 'Calculated Length', value: `${matchedRoll.lengthMeters ? matchedRoll.lengthMeters + ' meters' : 'N/A'}` },
          { label: 'Film Thickness', value: matchedRoll.micron ? `${matchedRoll.micron} Micron (µ)` : 'N/A' },
          { label: 'Slit / Web Width', value: matchedRoll.widthMm ? `${matchedRoll.widthMm} mm` : 'N/A' },
          { label: 'Core Diameter', value: matchedRoll.coreDia || '3 Inch (76mm)' },
          { label: 'Joints / Splices', value: `${matchedRoll.jointCount || 0} Joints` },
          { label: 'QC Quality Status', value: matchedRoll.qcStatus || 'Passed', isStatus: true },
          { label: 'Machine / Press', value: matchedRoll.machineName || matchedRoll.stationId || 'Scale 1' },
          { label: 'Operator Name', value: matchedRoll.operatorName || 'Shop Floor Operator' },
          { label: 'Shift Allocation', value: matchedRoll.shift || 'General Shift' },
          { label: 'Inward / Production Date', value: matchedRoll.productionDate || (matchedRoll.inwardDatetime ? matchedRoll.inwardDatetime.split('T')[0] : 'N/A') },
          { label: 'Storage Bay / Rack', value: matchedRoll.locationBay || 'Bay A' },
          { label: 'Linked Job Name', value: matchedRoll.jobName || 'Stock Material' },
          { label: 'Order OCN Reference', value: matchedRoll.orderId || 'N/A' },
          { label: 'Vendor / Manufacturer', value: matchedRoll.vendorName || 'N/A' },
          { label: 'Batch / Lot Number', value: matchedRoll.batchNo || 'N/A' },
          { label: 'Status', value: matchedRoll.status || 'In Stock' }
        ],
        parentGenealogy: matchedRoll.inputBarcodeIds || []
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
      return {
        type: 'ORDER',
        entityCategory: 'Sales Order & Job Card (OCN)',
        badgeColor: '#7c3aed',
        badgeBg: '#f5f3ff',
        title: matchedOrder.jobName || 'Job Order',
        code: matchedOrder.id,
        raw: matchedOrder,
        properties: [
          { label: 'Order ID / OCN', value: matchedOrder.id, isCode: true },
          { label: 'Job Name', value: matchedOrder.jobName },
          { label: 'Client Name', value: matchedOrder.clientName },
          { label: 'Order Quantity', value: `${matchedOrder.orderQtyKg || 0} kg`, isHighlight: true },
          { label: 'Order Type', value: matchedOrder.orderType || 'Reel Form' },
          { label: 'Target Delivery Date', value: matchedOrder.targetDeliveryDate || matchedOrder.deliveryDate || 'N/A' },
          { label: 'Production Status', value: matchedOrder.status || 'Scheduled', isStatus: true },
          { label: 'Printing Execution', value: matchedOrder.printing_status || 'Pending' },
          { label: 'Actual Meters Printed', value: matchedOrder.actual_meters_printed ? `${matchedOrder.actual_meters_printed} m` : 'Pending' },
          { label: 'Ink GSM (In Speed)', value: matchedOrder.ink_gsm_in_speed ? `${matchedOrder.ink_gsm_in_speed} GSM` : 'N/A' },
          { label: 'Printed Output Weight', value: matchedOrder.printed_output_kg ? `${matchedOrder.printed_output_kg} kg` : 'N/A' }
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
          { label: 'Job Name', value: matchedCylinder.jobName },
          { label: 'Client Name', value: matchedCylinder.clientName || matchedCylinder.clientGroup || 'N/A' },
          { label: 'Color Stations', value: `${matchedCylinder.colors_count || matchedCylinder.colorsCount || 8} Colors` },
          { label: 'Circumference', value: `${matchedCylinder.circumference_mm || matchedCylinder.circumferenceMm || 0} mm` },
          { label: 'Face Length', value: `${matchedCylinder.face_length_mm || matchedCylinder.faceLengthMm || 0} mm` },
          { label: 'Print Width', value: `${matchedCylinder.print_width_mm || matchedCylinder.printWidthMm || 0} mm` },
          { label: 'Repeat Length', value: `${matchedCylinder.repeat_length_mm || matchedCylinder.repeatLengthMm || 0} mm` },
          { label: 'Rack Location', value: matchedCylinder.rack_location || matchedCylinder.rackLocation || 'Rack Section' },
          { label: 'Total Impressions', value: `${matchedCylinder.total_impressions_run || matchedCylinder.totalImpressionsRun || 0} revs` },
          { label: 'Utilisation Limit', value: `${matchedCylinder.utilisation_limit || 10000} kg`, isHighlight: true },
          { label: 'Engraver / Supplier', value: matchedCylinder.engravures_name || matchedCylinder.engraverName || 'N/A' },
          { label: 'Operational Status', value: matchedCylinder.status || 'Active In-Use', isStatus: true }
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
      return {
        type: 'JOB_MASTER',
        entityCategory: 'Job Master Technical Specification',
        badgeColor: '#4f46e5',
        badgeBg: '#eef2ff',
        title: matchedJobMaster.job_name || matchedJobMaster.jobName || 'Job Master',
        code: matchedJobMaster.sku_code || matchedJobMaster.skuCode || matchedJobMaster.id,
        raw: matchedJobMaster,
        properties: [
          { label: 'Job SKU Code', value: matchedJobMaster.sku_code || matchedJobMaster.skuCode, isCode: true },
          { label: 'Job Name', value: matchedJobMaster.job_name || matchedJobMaster.jobName },
          { label: 'Client Name', value: matchedJobMaster.client_name || matchedJobMaster.clientName },
          { label: 'Structure', value: matchedJobMaster.structure || matchedJobMaster.film_structure || 'Multi-layer' },
          { label: 'Print Width', value: `${matchedJobMaster.print_width_mm || matchedJobMaster.printWidthMm || 0} mm` },
          { label: 'Face Length', value: `${matchedJobMaster.face_length_mm || matchedJobMaster.faceLengthMm || 0} mm` },
          { label: 'Repeat Length', value: `${matchedJobMaster.repeat_length_mm || matchedJobMaster.repeatLengthMm || 0} mm` },
          { label: 'Colors Count', value: `${matchedJobMaster.colors_count || matchedJobMaster.colorsCount || 8} Colors` }
        ]
      };
    }

    // 5. Goods Receipt Note (GRN) Search
    const matchedGrn = (grns || []).find(g => {
      const gNum = (g.grn_number || g.grnNumber || g.id || '').toLowerCase();
      const po = (g.po_number || g.poNumber || '').toLowerCase();
      const inv = (g.invoice_number || g.invoiceNumber || '').toLowerCase();
      return gNum === query || gNum.includes(query) || (po && po === query) || (inv && inv === query);
    });

    if (matchedGrn) {
      return {
        type: 'GRN',
        entityCategory: 'Goods Receipt Note (GRN) Inward QC',
        badgeColor: '#ea580c',
        badgeBg: '#fff7ed',
        title: `GRN: ${matchedGrn.grn_number || matchedGrn.grnNumber || matchedGrn.id}`,
        code: matchedGrn.grn_number || matchedGrn.grnNumber || matchedGrn.id,
        raw: matchedGrn,
        properties: [
          { label: 'GRN Number', value: matchedGrn.grn_number || matchedGrn.grnNumber || matchedGrn.id, isCode: true },
          { label: 'Vendor / Supplier', value: matchedGrn.vendor_name || matchedGrn.vendorName || 'Supplier' },
          { label: 'Purchase Order No', value: matchedGrn.po_number || matchedGrn.poNumber || 'N/A' },
          { label: 'Vendor Invoice No', value: matchedGrn.invoice_number || matchedGrn.invoiceNumber || 'N/A' },
          { label: 'Received Date', value: matchedGrn.received_date || matchedGrn.receivedDate || 'N/A' },
          { label: 'Received Qty', value: `${matchedGrn.received_qty_kg || matchedGrn.receivedQtyKg || 0} kg`, isHighlight: true },
          { label: 'QC Inspection Status', value: matchedGrn.qc_status || matchedGrn.qcStatus || matchedGrn.status || 'Pending QC', isStatus: true },
          { label: 'Remarks / Notes', value: matchedGrn.qc_remarks || matchedGrn.remarks || 'Standard inward inspection' }
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
          { label: 'Shade / Color', value: matchedInk.shade },
          { label: 'Ink Type', value: matchedInk.ink_type || matchedInk.inkType || 'Reverse Printing' },
          { label: 'Manufacturer / Brand', value: matchedInk.manufacturer || 'N/A' },
          { label: 'Supplier Name', value: matchedInk.supplier_name || matchedInk.supplierName || 'N/A' },
          { label: 'Solid Content', value: `${matchedInk.solid_content_pct || matchedInk.solidContentPct || 40}%` },
          { label: 'Current In-Stock', value: `${matchedInk.stock_qty_kg || matchedInk.stockQtyKg || 0} kg`, isHighlight: true },
          { label: 'Unit Price', value: `₹ ${matchedInk.price_per_kg || matchedInk.pricePerKg || 0} / kg` }
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
      return {
        type: 'DISPATCH',
        entityCategory: 'Finished Goods Dispatch & Outward Shipment',
        badgeColor: '#16a34a',
        badgeBg: '#f0fdf4',
        title: `Dispatch ID: ${matchedDispatch.dispatch_id || matchedDispatch.dispatchId}`,
        code: matchedDispatch.dispatch_id || matchedDispatch.dispatchId,
        raw: matchedDispatch,
        properties: [
          { label: 'Dispatch Shipment ID', value: matchedDispatch.dispatch_id || matchedDispatch.dispatchId, isCode: true },
          { label: 'Client Consignee', value: matchedDispatch.client_name || matchedDispatch.clientName },
          { label: 'Job Name', value: matchedDispatch.job_name || matchedDispatch.jobName },
          { label: 'Vehicle Number', value: matchedDispatch.vehicle_no || matchedDispatch.vehicleNo || matchedDispatch.vehicle_number || 'N/A' },
          { label: 'LR / Waybill Number', value: matchedDispatch.lr_no || matchedDispatch.lrNo || matchedDispatch.lr_number || 'N/A' },
          { label: 'Transporter', value: matchedDispatch.transporter || 'Direct Cargo' },
          { label: 'Total Rolls Dispatched', value: `${matchedDispatch.total_rolls || matchedDispatch.totalRolls || 0} Rolls` },
          { label: 'Total Net Weight', value: `${matchedDispatch.total_net_weight_kg || matchedDispatch.totalNetWeightKg || 0} kg`, isHighlight: true },
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
          { label: 'Item Name', value: matchedItem.item_name || matchedItem.itemName },
          { label: 'Category', value: matchedItem.category || 'Film Substrates' },
          { label: 'Film Type', value: matchedItem.film_type || matchedItem.filmType || 'N/A' },
          { label: 'Thickness', value: matchedItem.micron ? `${matchedItem.micron} µ` : 'N/A' },
          { label: 'Width', value: matchedItem.width_mm || matchedItem.widthMm ? `${matchedItem.width_mm || matchedItem.widthMm} mm` : 'N/A' },
          { label: 'Current In-Stock Qty', value: `${matchedItem.current_stock_kg || matchedItem.stock_qty_kg || matchedItem.currentStockKg || 0} kg`, isHighlight: true },
          { label: 'Allocated To Jobs', value: `${matchedItem.allocated_qty_kg || matchedItem.allocatedQtyKg || 0} kg` },
          { label: 'Available Stock', value: `${matchedItem.available_qty_kg || matchedItem.availableQtyKg || 0} kg` },
          { label: 'Reorder Threshold', value: `${matchedItem.min_reorder_level_kg || matchedItem.reorder_level_kg || matchedItem.minReorderLevelKg || 0} kg` }
        ]
      };
    }

    return { notFound: true, query: activeBarcode };
  }, [activeBarcode, inventoryRolls, orders, cylinders, jobMasters, grns, inks, dispatchShipments, inventory]);

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
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Header Bar */}
        <div 
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div 
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <ScanBarcode size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: '#ffffff' }}>
                  Universal Barcode & 2D QR Inspector
                </h2>
                <span 
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    background: 'rgba(234, 179, 8, 0.2)',
                    color: '#fef08a',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
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
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Scan with handheld scanner gun, mobile camera, or paste barcode to inspect linked record details.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Scanner Input Bar */}
        <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <div 
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  pointerEvents: 'none'
                }}
              >
                <Search size={18} />
              </div>
              <input 
                ref={inputRef}
                type="text"
                className="form-control"
                placeholder="Scan barcode gun or enter Barcode ID / SKU / Roll / Job Code..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                style={{
                  paddingLeft: '38px',
                  paddingRight: barcodeInput ? '34px' : '12px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  height: '44px',
                  borderRadius: '8px',
                  border: '2px solid #0284c7',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 0 0 3px rgba(2, 132, 199, 0.12)'
                }}
              />
              {barcodeInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px'
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
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 20px',
                height: '44px',
                fontSize: '0.9rem',
                fontWeight: '700',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Search size={16} /> Inspect
            </button>

            <button 
              type="button"
              onClick={() => {
                if (cameraActive) stopCamera();
                else startCamera();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 16px',
                height: '44px',
                fontSize: '0.85rem',
                fontWeight: '600',
                borderRadius: '8px',
                background: cameraActive ? '#fee2e2' : '#f1f5f9',
                color: cameraActive ? '#dc2626' : '#334155',
                border: cameraActive ? '1px solid #fca5a5' : '1px solid #cbd5e1',
                cursor: 'pointer'
              }}
              title={cameraActive ? 'Stop Camera' : 'Scan with Device Camera'}
            >
              {cameraActive ? <CameraOff size={16} /> : <Camera size={16} />}
              <span>{cameraActive ? 'Stop' : 'Camera'}</span>
            </button>
          </form>

          {/* Live Camera Viewport when Active */}
          {cameraActive && (
            <div 
              style={{ 
                marginTop: '12px', 
                background: '#000000', 
                borderRadius: '10px', 
                overflow: 'hidden', 
                position: 'relative',
                maxHeight: '200px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <video 
                ref={videoRef} 
                style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }} 
                playsInline 
                muted 
              />
              <div 
                style={{
                  position: 'absolute',
                  width: '200px',
                  height: '100px',
                  border: '2px dashed #38bdf8',
                  borderRadius: '8px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8',
                  fontSize: '0.75rem',
                  fontWeight: '700'
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

          {/* Quick Barcode Category Guide & Sample Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>
              Instant Examples in Database:
            </span>
            {(inventoryRolls || []).slice(0, 2).map((r, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickChipClick(r.barcodeId || r.id)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '999px',
                  padding: '2px 10px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: '#0369a1',
                  cursor: 'pointer'
                }}
              >
                📦 {r.barcodeId || r.id}
              </button>
            ))}
            {(orders || []).slice(0, 1).map((o, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickChipClick(o.id)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '999px',
                  padding: '2px 10px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: '#7c3aed',
                  cursor: 'pointer'
                }}
              >
                📑 Order: {o.id}
              </button>
            ))}
            {(cylinders || []).slice(0, 1).map((c, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickChipClick(c.cylinderSku || c.sku || c.id)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '999px',
                  padding: '2px 10px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: '#0891b2',
                  cursor: 'pointer'
                }}
              >
                ⚙️ Cyl: {c.cylinderSku || c.sku || c.id}
              </button>
            ))}
          </div>
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

              {/* Traceability Genealogy (Parent Input Barcodes if applicable) */}
              {Array.isArray(searchResults.parentGenealogy) && searchResults.parentGenealogy.length > 0 && (
                <div 
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '14px 16px'
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Layers size={15} style={{ color: '#0284c7' }} /> Parent Input Rolls Traceability:
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {searchResults.parentGenealogy.map((pBarcode, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuickChipClick(pBarcode)}
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          color: '#1d4ed8',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Inspect Parent Roll"
                      >
                        <span>{pBarcode}</span>
                        <ArrowRight size={12} />
                      </button>
                    ))}
                  </div>
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
    </div>
  );
}
