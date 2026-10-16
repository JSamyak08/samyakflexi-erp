import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Calendar,
  Building2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  PackageCheck,
  Send,
  MessageSquare,
  Eye,
  X,
  ArrowUpRight,
  Printer,
  ChevronDown,
  RefreshCw,
  ShoppingBag,
  Layers,
  Box,
  Truck,
  DollarSign,
  Download,
  Info
} from 'lucide-react';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import TablePagination, { usePagination } from './TablePagination';
import { COMPANY_DETAILS } from '../factoryStore';
import { generateDocRefNumber, getNextDocRefNumber, getDocumentTerms } from '../services/settingsService';
import { calculateGSTBreakdown, formatINR } from '../utils/pdfHelpers';

export default function PurchaseOrderManagement({
  purchaseOrders = [],
  onAddPurchaseOrder,
  onUpdatePurchaseOrder,
  onDeletePurchaseOrder,
  inventory = [],
  vendors = [],
  grns = [],
  orders = [],
  onUpdateOrder,
  currentUser = null
}) {
  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [dateRangePreset, setDateRangePreset] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activePoForPdf, setActivePoForPdf] = useState(null);
  const [activePoForDetails, setActivePoForDetails] = useState(null);
  const [activeCollisionWarning, setActiveCollisionWarning] = useState(null);
  const [isOrderShortageModalOpen, setIsOrderShortageModalOpen] = useState(false);

  // New PO Form State
  const defaultTerms = getDocumentTerms();
  const [poForm, setPoForm] = useState({
    poNumber: '',
    poDate: new Date().toISOString().split('T')[0],
    promisedDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    vendorId: '',
    vendorName: '',
    vendorDetails: {
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      gstin: '',
      address: ''
    },
    category: 'Film Substrates',
    paymentTerms: defaultTerms?.paymentTerms || '30 Days Net',
    logisticDetails: 'Freight Included within Indore',
    notes: 'Material must strictly conform to specified micron gauge, width, and quality standards. COA & Tax Invoice required upon delivery.',
    items: [],
    source: 'Direct PO Module',
    linkedOrderId: null,
    linkedOrderName: null,
    linkedRequirements: []
  });

  // Helper: Open Create PO Modal with fresh sequential PO Number
  const handleOpenCreateModal = () => {
    let nextNum;
    try {
      nextNum = getNextDocRefNumber('po');
    } catch (e) {
      nextNum = generateDocRefNumber('po');
    }

    setPoForm({
      poNumber: nextNum,
      poDate: new Date().toISOString().split('T')[0],
      promisedDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      vendorId: vendors[0]?.id || '',
      vendorName: vendors[0]?.companyName || vendors[0]?.name || '',
      vendorDetails: vendors[0] ? {
        companyName: vendors[0].companyName || vendors[0].name || '',
        contactPerson: vendors[0].contactPerson || vendors[0].contact_person || '',
        phone: vendors[0].phone || vendors[0].contactNo || '',
        email: vendors[0].email || '',
        gstin: vendors[0].gstin || '',
        address: vendors[0].address || ''
      } : {
        companyName: '',
        contactPerson: '',
        phone: '',
        email: '',
        gstin: '',
        address: ''
      },
      category: 'Film Substrates',
      paymentTerms: defaultTerms?.paymentTerms || '30 Days Net',
      logisticDetails: 'Freight Included within Indore',
      notes: 'Material must strictly conform to specified micron gauge, width, and quality standards. COA & Tax Invoice required upon delivery.',
      items: [],
      source: 'Direct PO Module',
      linkedOrderId: null,
      linkedOrderName: null,
      linkedRequirements: []
    });
    setIsCreateModalOpen(true);
  };

  // Vendor selection handler in create modal
  const handleSelectVendor = (vendorId) => {
    const selected = vendors.find(v => String(v.id) === String(vendorId));
    if (selected) {
      setPoForm(prev => ({
        ...prev,
        vendorId: selected.id,
        vendorName: selected.companyName || selected.name || '',
        vendorDetails: {
          id: selected.id,
          companyName: selected.companyName || selected.name || '',
          contactPerson: selected.contactPerson || selected.contact_person || '',
          phone: selected.phone || selected.contactNo || '',
          email: selected.email || '',
          gstin: selected.gstin || '',
          address: selected.address || ''
        }
      }));
    } else {
      setPoForm(prev => ({
        ...prev,
        vendorId: '',
        vendorName: '',
        vendorDetails: { companyName: '', contactPerson: '', phone: '', email: '', gstin: '', address: '' }
      }));
    }
  };

  // Check for active unreceived PO collision for a given item
  const checkActivePoCollision = (itemToCheck) => {
    const targetItemId = (itemToCheck.itemId || itemToCheck.itemCode || itemToCheck.id || '').trim().toLowerCase();
    const targetDesc = (itemToCheck.itemDesc || itemToCheck.itemName || itemToCheck.description || '').trim().toLowerCase();
    const targetFilmType = (itemToCheck.filmType || '').trim().toLowerCase();
    const targetMicron = itemToCheck.micron ? Number(itemToCheck.micron) : null;
    const targetWidth = itemToCheck.widthMm ? Number(itemToCheck.widthMm) : null;

    for (const existingPo of purchaseOrders) {
      // Ignore cancelled POs or current PO
      if (existingPo.status === 'Cancelled' || existingPo.poNumber === poForm.poNumber) continue;

      // Compute GRN inward for this existing PO
      const matchingGRNs = (grns || []).filter(g => 
        String(g.poNumber || '').trim().toLowerCase() === String(existingPo.poNumber || '').trim().toLowerCase()
      );
      const totalInwardQty = matchingGRNs.reduce((sum, g) => sum + (parseFloat(g.netWeightKg) || parseFloat(g.receivedQtyKg) || 0), 0);
      const totalPoQty = (existingPo.items || []).reduce((sum, it) => sum + (parseFloat(it.qtyKg) || 0), 0);

      // If already fully received, no active shortage
      if (totalInwardQty >= totalPoQty && totalPoQty > 0) continue;

      // Check if any line item in this existing PO matches our target item
      for (const line of (existingPo.items || [])) {
        const lineItemId = (line.itemId || line.itemCode || line.id || '').trim().toLowerCase();
        const lineDesc = (line.itemDesc || line.itemName || line.description || '').trim().toLowerCase();
        const lineFilmType = (line.filmType || '').trim().toLowerCase();
        const lineMicron = line.micron ? Number(line.micron) : null;
        const lineWidth = line.widthMm ? Number(line.widthMm) : null;

        let isMatch = false;
        if (targetItemId && lineItemId && targetItemId === lineItemId) {
          isMatch = true;
        } else if (targetFilmType && lineFilmType && targetFilmType === lineFilmType && targetMicron === lineMicron && targetWidth === lineWidth) {
          isMatch = true;
        } else if (targetDesc && lineDesc && (targetDesc === lineDesc || (targetDesc.length > 5 && lineDesc.includes(targetDesc)))) {
          isMatch = true;
        }

        if (isMatch) {
          const pendingQty = Math.max(0, totalPoQty - totalInwardQty);
          return {
            collidingPo: existingPo,
            item: line,
            totalPoQty,
            totalInwardQty,
            pendingQty
          };
        }
      }
    }
    return null;
  };

  // Add Item to PO Form
  const handleAddItemToForm = (itemToAdd, bypassCollisionCheck = false) => {
    if (!bypassCollisionCheck) {
      const collision = checkActivePoCollision(itemToAdd);
      if (collision) {
        setActiveCollisionWarning({
          collision,
          pendingItem: itemToAdd
        });
        return;
      }
    }

    const newItem = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      itemId: itemToAdd.itemId || itemToAdd.itemCode || itemToAdd.id || '',
      itemDesc: itemToAdd.itemDesc || itemToAdd.itemName || itemToAdd.name || 'Raw Material Item',
      category: itemToAdd.category || poForm.category || 'Film Substrates',
      filmType: itemToAdd.filmType || '',
      micron: itemToAdd.micron || '',
      widthMm: itemToAdd.widthMm ? Number(itemToAdd.widthMm) : null,
      make: itemToAdd.make || itemToAdd.lastVendor || '',
      hsnCode: itemToAdd.hsnCode || itemToAdd.hsn || '3920',
      unit: itemToAdd.unit || 'Kg',
      qtyKg: Number(itemToAdd.qtyKg || itemToAdd.quantity || 100),
      rate: Number(itemToAdd.rate || itemToAdd.unitPrice || itemToAdd.purchaseRatePerKg || 165),
      gstPct: Number(itemToAdd.gstPct || 18),
      amount: Number(itemToAdd.qtyKg || 100) * Number(itemToAdd.rate || itemToAdd.unitPrice || 165),
      notes: itemToAdd.notes || '',
      orderId: itemToAdd.orderId || null,
      jobName: itemToAdd.jobName || null
    };

    setPoForm(prev => {
      const updatedItems = [...prev.items, newItem];
      return {
        ...prev,
        items: updatedItems
      };
    });
  };

  // Update line item in PO form
  const handleUpdateItemField = (itemId, field, value) => {
    setPoForm(prev => {
      const updatedItems = prev.items.map(it => {
        if (it.id === itemId) {
          const copy = { ...it, [field]: value };
          if (field === 'qtyKg' || field === 'rate') {
            const qty = parseFloat(field === 'qtyKg' ? value : it.qtyKg) || 0;
            const rate = parseFloat(field === 'rate' ? value : it.rate) || 0;
            copy.amount = qty * rate;
          }
          return copy;
        }
        return it;
      });
      return { ...prev, items: updatedItems };
    });
  };

  // Remove line item from PO form
  const handleRemoveItemFromForm = (itemId) => {
    setPoForm(prev => ({
      ...prev,
      items: prev.items.filter(it => it.id !== itemId)
    }));
  };

  // Calculate live PO totals for form
  const formCalculations = useMemo(() => {
    const totalQty = poForm.items.reduce((sum, it) => sum + (parseFloat(it.qtyKg) || 0), 0);
    const subtotal = poForm.items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
    
    // Determine GST based on vendor state code vs company state code (23)
    const vendorGstin = poForm.vendorDetails?.gstin || '';
    const gstInfo = calculateGSTBreakdown(
      vendorGstin, 
      poForm.vendorDetails?.address || '', 
      subtotal, 
      18, 
      COMPANY_DETAILS.gstin || '23AABCM3526F1ZY'
    );

    const totalAmount = subtotal + gstInfo.totalGstAmount;

    return {
      totalQty,
      subtotal,
      cgst: gstInfo.cgstAmount,
      sgst: gstInfo.sgstAmount,
      igst: gstInfo.igstAmount,
      taxAmount: gstInfo.totalGstAmount,
      totalAmount,
      isInterState: gstInfo.isInterState
    };
  }, [poForm.items, poForm.vendorDetails]);

  // Save new Purchase Order
  const handleSavePurchaseOrder = async (e) => {
    e.preventDefault();
    if (!poForm.poNumber || !poForm.poNumber.trim()) {
      alert("Please provide a valid Purchase Order number!");
      return;
    }
    if (!poForm.vendorName || !poForm.vendorName.trim()) {
      alert("Please select or specify a Vendor!");
      return;
    }
    if (!poForm.promisedDeliveryDate) {
      alert("Please specify the Promised Date of Delivery!");
      return;
    }
    if ((poForm.items || []).length === 0) {
      alert("Please add at least one line item to this Purchase Order!");
      return;
    }

    const payload = {
      id: poForm.poNumber.trim(),
      poNumber: poForm.poNumber.trim(),
      poDate: poForm.poDate,
      deliveryDate: poForm.promisedDeliveryDate,
      promisedDeliveryDate: poForm.promisedDeliveryDate,
      vendorId: poForm.vendorId || null,
      vendorName: poForm.vendorName,
      vendor: poForm.vendorDetails,
      category: poForm.category,
      items: poForm.items,
      totalQtyKg: formCalculations.totalQty,
      subtotal: formCalculations.subtotal,
      taxAmount: formCalculations.taxAmount,
      totalAmount: formCalculations.totalAmount,
      paymentTerms: poForm.paymentTerms,
      logisticDetails: poForm.logisticDetails,
      notes: poForm.notes,
      remarks: poForm.notes,
      status: 'Pending Delivery',
      source: poForm.source || 'Direct PO Module',
      linkedOrderId: poForm.linkedOrderId || null,
      linkedOrderName: poForm.linkedOrderName || null,
      linkedRequirements: poForm.linkedRequirements || [],
      createdBy: currentUser?.name || 'Procurement Desk',
      createdAt: new Date().toISOString()
    };

    try {
      if (onAddPurchaseOrder) {
        await onAddPurchaseOrder(payload);
      }

      // If linked to orders, mark their requirements as PO issued
      if (poForm.linkedOrderId && orders && onUpdateOrder) {
        const targetOrder = orders.find(o => o.id === poForm.linkedOrderId);
        if (targetOrder) {
          const updatedReqs = (targetOrder.materialRequirements || []).map(r => {
            if (poForm.linkedRequirements.includes(r.id)) {
              return { ...r, poIssued: true, poNumber: payload.poNumber };
            }
            return r;
          });
          onUpdateOrder({
            ...targetOrder,
            materialRequirements: updatedReqs,
            rawMaterialRequirements: updatedReqs,
            poIssued: true,
            poNumber: payload.poNumber
          });
        }
      }

      setIsCreateModalOpen(false);
      alert(`✅ Purchase Order ${payload.poNumber} created and saved to database successfully!\nTotal Value: ₹${(payload.totalAmount || 0).toLocaleString('en-IN')}`);
    } catch (err) {
      console.error("Error creating Purchase Order:", err);
      alert(`Failed to save Purchase Order: ${err.message}`);
    }
  };

  // WhatsApp Share Dispatch Handler
  const handleShareWhatsApp = (po, e) => {
    if (e) e.stopPropagation();
    const vendorPhone = po.vendor?.phone || po.vendor?.contactNo || '';
    const cleanPhone = vendorPhone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const vendorName = po.vendor?.companyName || po.vendorName || 'Valued Vendor Partner';
    const totalFormatted = (po.totalAmount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    const deliveryDateFormatted = po.promisedDeliveryDate || po.deliveryDate || 'As per agreement';

    const itemsSummary = (po.items || []).map((it, idx) => {
      const desc = it.itemDesc || it.itemName || 'Material Item';
      const spec = it.micron && it.widthMm ? ` (${it.micron}µ / ${it.widthMm}mm)` : '';
      const qty = `${(it.qtyKg || 0).toLocaleString()} ${it.unit || 'Kg'}`;
      const rate = it.rate ? ` @ ₹${it.rate}/${it.unit || 'Kg'}` : '';
      return `${idx + 1}. *${desc}*${spec}\n   Qty: ${qty}${rate}`;
    }).join('\n');

    const message = `*PURCHASE ORDER: ${po.poNumber}*
From: *${COMPANY_DETAILS.name}*
To: *${vendorName}*
Date: ${po.poDate}

Dear Team,
Please find below the official Purchase Order *${po.poNumber}* issued by *${COMPANY_DETAILS.name}*:

*Ordered Materials:*
${itemsSummary}

*Commercial Summary:*
• Total PO Value: *${totalFormatted}* (Incl. applicable GST)
• Promised Delivery Date: *${deliveryDateFormatted}*
• Payment Terms: ${po.paymentTerms || '30 Days Net'}
• Delivery / Freight: ${po.logisticDetails || 'Freight Included within Indore'}

${po.notes ? `*Special Notes / Specs:*\n${po.notes}\n` : ''}
Kindly acknowledge receipt of this Purchase Order and confirm your dispatch schedule.

Thank you,
*${COMPANY_DETAILS.name}*
${COMPANY_DETAILS.address}
Contact: ${COMPANY_DETAILS.contactPerson} (${COMPANY_DETAILS.phones})
GSTIN: ${COMPANY_DETAILS.gstin}`;

    const waUrl = phoneWithCountry
      ? `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Helper to calculate enriched PO attributes (GRN matching, delivery status, overdue days)
  const enrichedPurchaseOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const safeList = (Array.isArray(purchaseOrders) ? purchaseOrders : []).filter(Boolean);
    return safeList.map(po => {
      // Find matching GRNs
      const matchingGRNs = (grns || []).filter(g => 
        g && String(g.poNumber || '').trim().toLowerCase() === String(po.poNumber || '').trim().toLowerCase()
      );

      const totalInwardQty = matchingGRNs.reduce((sum, g) => 
        sum + (parseFloat(g.netWeightKg) || parseFloat(g.receivedQtyKg) || 0), 0
      );
      const totalPoQty = ((po && po.items) || []).reduce((sum, it) => sum + (parseFloat(it.qtyKg) || 0), 0);
      const pendingQty = Math.max(0, totalPoQty - totalInwardQty);

      // Parse Promised Delivery Date
      let promisedDateObj = null;
      if (po.promisedDeliveryDate || po.deliveryDate) {
        const rawDate = po.promisedDeliveryDate || po.deliveryDate;
        promisedDateObj = new Date(rawDate);
        if (isNaN(promisedDateObj.getTime()) && String(rawDate).includes('/')) {
          const parts = String(rawDate).split('/');
          if (parts.length === 3) promisedDateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      }

      let isOverdue = false;
      let daysRemaining = null;
      if (promisedDateObj && !isNaN(promisedDateObj.getTime())) {
        promisedDateObj.setHours(0, 0, 0, 0);
        const diffTime = promisedDateObj - today;
        daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0 && totalInwardQty < totalPoQty && po.status !== 'Cancelled') {
          isOverdue = true;
        }
      }

      // Live Inward Status
      let deliveryStatus = 'Pending Delivery';
      if (po.status === 'Cancelled') {
        deliveryStatus = 'Cancelled';
      } else if (totalInwardQty >= totalPoQty && totalPoQty > 0) {
        deliveryStatus = 'Fully Received';
      } else if (totalInwardQty > 0) {
        deliveryStatus = 'Partially Received';
      }

      return {
        ...po,
        matchingGRNs,
        totalInwardQty,
        totalPoQty,
        pendingQty,
        daysRemaining,
        isOverdue,
        deliveryStatus
      };
    });
  }, [purchaseOrders, grns]);

  // Filter enriched Purchase Orders
  const filteredPurchaseOrders = useMemo(() => {
    return enrichedPurchaseOrders.filter(po => {
      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesPo = (po.poNumber || '').toLowerCase().includes(term);
        const matchesVendor = (po.vendorName || po.vendor?.companyName || '').toLowerCase().includes(term);
        const matchesItems = (po.items || []).some(it => (it.itemDesc || it.itemName || '').toLowerCase().includes(term));
        const matchesNotes = (po.notes || '').toLowerCase().includes(term);
        if (!matchesPo && !matchesVendor && !matchesItems && !matchesNotes) return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && po.category !== selectedCategory) {
        return false;
      }

      // Vendor filter
      if (selectedVendorFilter !== 'ALL') {
        const poVendorName = (po.vendorName || po.vendor?.companyName || '').toLowerCase().trim();
        if (poVendorName !== selectedVendorFilter.toLowerCase().trim()) return false;
      }

      // Status filter
      if (selectedStatusFilter !== 'ALL') {
        if (selectedStatusFilter === 'OVERDUE' && !po.isOverdue) return false;
        if (selectedStatusFilter === 'PENDING_DELIVERY' && po.deliveryStatus !== 'Pending Delivery') return false;
        if (selectedStatusFilter === 'PARTIAL' && po.deliveryStatus !== 'Partially Received') return false;
        if (selectedStatusFilter === 'RECEIVED' && po.deliveryStatus !== 'Fully Received') return false;
        if (selectedStatusFilter === 'CANCELLED' && po.deliveryStatus !== 'Cancelled') return false;
      }

      // Date Range filters
      if (startDate || endDate) {
        const poDateObj = new Date(po.poDate);
        if (!isNaN(poDateObj.getTime())) {
          if (startDate) {
            const startObj = new Date(startDate);
            if (poDateObj < startObj) return false;
          }
          if (endDate) {
            const endObj = new Date(endDate);
            endObj.setHours(23, 59, 59, 999);
            if (poDateObj > endObj) return false;
          }
        }
      }

      return true;
    });
  }, [enrichedPurchaseOrders, searchTerm, selectedCategory, selectedVendorFilter, selectedStatusFilter, startDate, endDate]);

  // Pagination hook
  const {
    paginatedData: paginatedPOs,
    currentPage,
    totalPages,
    totalRecords,
    pageSize,
    setCurrentPage,
    setPageSize
  } = usePagination(filteredPurchaseOrders, 10);

  // KPI Metrics Calculation
  const kpiMetrics = useMemo(() => {
    const totalCount = enrichedPurchaseOrders.length;
    const totalSpend = enrichedPurchaseOrders.reduce((sum, po) => sum + (po.status !== 'Cancelled' ? (po.totalAmount || 0) : 0), 0);
    const awaitingCount = enrichedPurchaseOrders.filter(po => po.deliveryStatus === 'Pending Delivery').length;
    const partialCount = enrichedPurchaseOrders.filter(po => po.deliveryStatus === 'Partially Received').length;
    const receivedCount = enrichedPurchaseOrders.filter(po => po.deliveryStatus === 'Fully Received').length;
    const overdueCount = enrichedPurchaseOrders.filter(po => po.isOverdue).length;

    return {
      totalCount,
      totalSpend,
      awaitingCount,
      partialCount,
      receivedCount,
      overdueCount
    };
  }, [enrichedPurchaseOrders]);

  // Export filtered POs to CSV
  const handleExportCsv = () => {
    if (filteredPurchaseOrders.length === 0) {
      alert("No purchase order records match the current filters to export.");
      return;
    }

    const headers = [
      "PO Number",
      "PO Date",
      "Vendor Name",
      "Vendor Phone",
      "Vendor GSTIN",
      "Category",
      "Items Summary",
      "Total Qty (Kg)",
      "Subtotal (₹)",
      "Tax Amount (₹)",
      "Total Amount (₹)",
      "Promised Delivery Date",
      "GRN Receipt Status",
      "Total Inward Qty (Kg)",
      "Pending Qty (Kg)",
      "Matching GRNs"
    ];

    const rows = filteredPurchaseOrders.map(po => {
      const itemsShort = (po.items || []).map(it => `${it.itemDesc || it.itemName} (${it.qtyKg} ${it.unit || 'Kg'})`).join('; ');
      const grnNumbers = (po.matchingGRNs || []).map(g => g.grnNo || g.grnNumber).join('; ');

      return [
        `"${po.poNumber}"`,
        `"${po.poDate}"`,
        `"${po.vendorName || po.vendor?.companyName || ''}"`,
        `"${po.vendor?.phone || ''}"`,
        `"${po.vendor?.gstin || ''}"`,
        `"${po.category}"`,
        `"${itemsShort}"`,
        po.totalPoQty || 0,
        po.subtotal || 0,
        po.taxAmount || 0,
        po.totalAmount || 0,
        `"${po.promisedDeliveryDate || po.deliveryDate || ''}"`,
        `"${po.deliveryStatus}"`,
        po.totalInwardQty || 0,
        po.pendingQty || 0,
        `"${grnNumbers}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Samyak_Purchase_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preset Date range selection
  const handleApplyDatePreset = (preset) => {
    setDateRangePreset(preset);
    const now = new Date();

    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'LAST_30') {
      const past30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      setStartDate(past30);
      setEndDate(now.toISOString().split('T')[0]);
    }
  };

  // Cancel PO handler
  const handleCancelPo = async (po, e) => {
    if (e) e.stopPropagation();
    if (po.totalInwardQty > 0) {
      alert(`⚠️ Cannot cancel Purchase Order ${po.poNumber} because ${po.totalInwardQty} kg has already been inwarded via GRN!`);
      return;
    }

    if (window.confirm(`Are you sure you want to cancel Purchase Order ${po.poNumber} issued to "${po.vendorName}"?`)) {
      try {
        const updated = {
          ...po,
          status: 'Cancelled',
          updatedAt: new Date().toISOString()
        };
        if (onUpdatePurchaseOrder) {
          await onUpdatePurchaseOrder(updated);
        }
        alert(`Purchase Order ${po.poNumber} has been marked as Cancelled.`);
      } catch (err) {
        alert(`Failed to cancel PO: ${err.message}`);
      }
    }
  };

  // Distinct Vendor List for Filter
  const vendorFilterOptions = useMemo(() => {
    const names = new Set();
    enrichedPurchaseOrders.forEach(po => {
      const name = po.vendorName || po.vendor?.companyName;
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [enrichedPurchaseOrders]);

  // Memoized Pending Requirements from Orders with shortage
  const pendingShortageRequirements = useMemo(() => {
    return (Array.isArray(orders) ? orders : [])
      .filter(Boolean)
      .flatMap(o => {
        const reqList = (o && (o.materialRequirements || o.rawMaterialRequirements)) || [];
        return (Array.isArray(reqList) ? reqList : [])
          .filter(r => r && !r.poIssued)
          .map(r => ({ order: o, req: r }));
      });
  }, [orders]);

  return (
    <div className="po-management-wrapper" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* 1. Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <ShoppingBag size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Purchase Order Management
              </h1>
              <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Procurement Hub • Inventory & Requirements Linked POs • Live GRN Delivery Reconciliation
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', fontSize: '0.85rem', fontWeight: '600' }}
          >
            <Download size={15} /> Export CSV
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenCreateModal}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '9px 18px', 
              fontSize: '0.88rem', 
              fontWeight: '700', 
              background: '#4f46e5',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
            }}
          >
            <Plus size={17} /> Create Purchase Order
          </button>
        </div>
      </div>

      {/* 2. KPI Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Total POs */}
        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total POs Issued</span>
            <FileText size={18} color="#4f46e5" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a' }}>{kpiMetrics.totalCount}</div>
          <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#4f46e5', marginTop: '4px' }}>
            ₹{(kpiMetrics.totalSpend / 100000).toFixed(2)} Lakhs Spend
          </div>
        </div>

        {/* Awaiting Delivery / Pending GRN */}
        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Awaiting Delivery</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#b45309' }}>{kpiMetrics.awaitingCount}</div>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>Pending GRN Inward</div>
        </div>

        {/* Partially Received */}
        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Partially Inwarded</span>
            <Truck size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0284c7' }}>{kpiMetrics.partialCount}</div>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>Balance Goods Pending</div>
        </div>

        {/* Fully Received */}
        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fully Received</span>
            <PackageCheck size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#047857' }}>{kpiMetrics.receivedCount}</div>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>Fulfilled & Stocked</div>
        </div>

        {/* Overdue */}
        <div 
          className="card" 
          style={{ 
            padding: '16px 20px', 
            borderRadius: '12px', 
            background: kpiMetrics.overdueCount > 0 ? '#fff1f2' : '#ffffff', 
            border: kpiMetrics.overdueCount > 0 ? '1px solid #fecdd3' : '1px solid #e2e8f0', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Overdue Deliveries</span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#dc2626' }}>{kpiMetrics.overdueCount}</div>
          <div style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: '600', marginTop: '4px' }}>
            {kpiMetrics.overdueCount > 0 ? 'Requires Vendor Follow-up' : 'All Orders on Schedule'}
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div 
        style={{ 
          background: '#ffffff', 
          padding: '16px 20px', 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0', 
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'center' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search PO #, vendor, material..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.84rem' }}
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-field"
              style={{ height: '38px', fontSize: '0.84rem' }}
            >
              <option value="ALL">All Categories</option>
              <option value="Film Substrates">Film Substrates (BOPP/PET/METPET/CPP/LD)</option>
              <option value="Printing Inks">Printing Inks & Solvents</option>
              <option value="Adhesives & Hardener">Adhesives & Hardener</option>
              <option value="Solvents & Chemicals">Solvents & Chemicals</option>
              <option value="Rotogravure Cylinders">Rotogravure Cylinders</option>
              <option value="Consumables & Spares">Consumables & Spares</option>
            </select>
          </div>

          {/* Vendor Filter */}
          <div>
            <select
              value={selectedVendorFilter}
              onChange={(e) => setSelectedVendorFilter(e.target.value)}
              className="input-field"
              style={{ height: '38px', fontSize: '0.84rem' }}
            >
              <option value="ALL">All Vendors ({vendorFilterOptions.length})</option>
              {vendorFilterOptions.map(vName => (
                <option key={vName} value={vName}>{vName}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="input-field"
              style={{ height: '38px', fontSize: '0.84rem' }}
            >
              <option value="ALL">All PO Statuses</option>
              <option value="PENDING_DELIVERY">⏳ Awaiting Delivery (0% Inward)</option>
              <option value="PARTIAL">🟡 Partially Received</option>
              <option value="RECEIVED">✅ Fully Received</option>
              <option value="OVERDUE">🚨 Overdue Deliveries</option>
              <option value="CANCELLED">❌ Cancelled POs</option>
            </select>
          </div>

        </div>

        {/* Date presets row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b' }}>Date Filters:</span>
            {['ALL', 'THIS_MONTH', 'LAST_MONTH', 'LAST_30'].map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => handleApplyDatePreset(preset)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: '1px solid',
                  cursor: 'pointer',
                  borderColor: dateRangePreset === preset ? '#4f46e5' : '#cbd5e1',
                  background: dateRangePreset === preset ? '#eff6ff' : '#ffffff',
                  color: dateRangePreset === preset ? '#4f46e5' : '#475569'
                }}
              >
                {preset === 'ALL' ? 'All Time' : preset === 'THIS_MONTH' ? 'This Month' : preset === 'LAST_MONTH' ? 'Last Month' : 'Last 30 Days'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Custom:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDateRangePreset('CUSTOM'); }}
              className="input-field"
              style={{ height: '32px', fontSize: '0.78rem', width: '130px' }}
            />
            <span style={{ color: '#94a3b8' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDateRangePreset('CUSTOM'); }}
              className="input-field"
              style={{ height: '32px', fontSize: '0.78rem', width: '130px' }}
            />
            {(startDate || endDate || searchTerm || selectedCategory !== 'ALL' || selectedVendorFilter !== 'ALL' || selectedStatusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('ALL');
                  setSelectedVendorFilter('ALL');
                  setSelectedStatusFilter('ALL');
                  setDateRangePreset('ALL');
                  setStartDate('');
                  setEndDate('');
                }}
                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Historical Purchase Orders Table */}
      <div 
        className="card table-container" 
        style={{ 
          background: '#ffffff', 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0', 
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>PO # & Date</th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>Vendor</th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>Items in PO (Summary)</th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>Total Amount</th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>Promised Delivery</th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>GRN Receipt Status</th>
                <th style={{ padding: '12px 16px', fontWeight: '700', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPOs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <ShoppingBag size={40} strokeWidth={1.5} color="#cbd5e1" />
                      <div style={{ fontSize: '1rem', fontWeight: '700', color: '#64748b' }}>No Purchase Orders Found</div>
                      <div style={{ fontSize: '0.84rem' }}>No purchase orders match your filters. Click "Create Purchase Order" above to issue a new PO.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPOs.map(po => {
                  const itemsCount = (po.items || []).length;
                  const firstItem = po.items && po.items[0];
                  const itemSummaryText = firstItem 
                    ? `${firstItem.itemDesc || firstItem.itemName || 'Material'}${itemsCount > 1 ? ` (+${itemsCount - 1} more items)` : ''}`
                    : 'No items recorded';

                  return (
                    <tr 
                      key={po.id || po.poNumber} 
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                      className="hover:bg-slate-50"
                    >
                      {/* PO # & Date */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.88rem' }}>
                            {po.poNumber}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                          📅 {po.poDate}
                        </div>
                        {po.source && po.source !== 'Direct PO Module' && (
                          <div style={{ marginTop: '4px' }}>
                            <span 
                              style={{ 
                                fontSize: '0.68rem', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                background: '#f1f5f9', 
                                color: '#475569', 
                                fontWeight: '600' 
                              }}
                            >
                              {po.source}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Vendor Info */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>
                          {po.vendorName || po.vendor?.companyName || 'Vendor'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                          {po.vendor?.contactPerson && `👤 ${po.vendor.contactPerson} • `}
                          {po.vendor?.phone && `📞 ${po.vendor.phone}`}
                        </div>
                        {po.vendor?.gstin && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                            GSTIN: {po.vendor.gstin}
                          </div>
                        )}
                      </td>

                      {/* Items Summary */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top', maxWidth: '280px' }}>
                        <div 
                          style={{ 
                            fontWeight: '600', 
                            color: '#334155', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis' 
                          }}
                          title={itemSummaryText}
                        >
                          {itemSummaryText}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px' }}>
                          Total Qty: <strong style={{ color: '#0f172a' }}>{(po.totalPoQty || 0).toLocaleString()} kg</strong>
                          <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '4px', background: '#e0e7ff', color: '#4338ca', fontSize: '0.68rem', fontWeight: '700' }}>
                            {po.category}
                          </span>
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem' }}>
                          ₹{(po.totalAmount || 0).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          Sub: ₹{(po.subtotal || 0).toLocaleString('en-IN')} + Tax
                        </div>
                      </td>

                      {/* Promised Delivery Date */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '600', color: '#334155' }}>
                          {po.promisedDeliveryDate || po.deliveryDate || '—'}
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          {po.isOverdue ? (
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '3px', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                background: '#fee2e2', 
                                color: '#b91c1c', 
                                fontSize: '0.72rem', 
                                fontWeight: '700' 
                              }}
                            >
                              <AlertTriangle size={11} /> Overdue by {Math.abs(po.daysRemaining || 0)}d
                            </span>
                          ) : po.daysRemaining !== null && po.daysRemaining >= 0 && po.deliveryStatus !== 'Fully Received' ? (
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '3px', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                background: '#f0fdf4', 
                                color: '#15803d', 
                                fontSize: '0.72rem', 
                                fontWeight: '600' 
                              }}
                            >
                              <Clock size={11} /> Due in {po.daysRemaining} days
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* GRN Receipt Status */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        {po.deliveryStatus === 'Fully Received' ? (
                          <div>
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                padding: '3px 8px', 
                                borderRadius: '6px', 
                                background: '#ecfdf5', 
                                color: '#047857', 
                                border: '1px solid #a7f3d0', 
                                fontSize: '0.75rem', 
                                fontWeight: '700' 
                              }}
                            >
                              <CheckCircle2 size={13} /> Fully Received
                            </span>
                            <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '3px' }}>
                              {(po.totalInwardQty || 0).toLocaleString()} kg inwarded
                            </div>
                          </div>
                        ) : po.deliveryStatus === 'Partially Received' ? (
                          <div>
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                padding: '3px 8px', 
                                borderRadius: '6px', 
                                background: '#fef3c7', 
                                color: '#b45309', 
                                border: '1px solid #fde68a', 
                                fontSize: '0.75rem', 
                                fontWeight: '700' 
                              }}
                            >
                              <Truck size={13} /> Partial Inward
                            </span>
                            <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '3px' }}>
                              {(po.totalInwardQty || 0).toLocaleString()} / {(po.totalPoQty || 0).toLocaleString()} kg ({Math.round(((po.totalInwardQty || 0) / (po.totalPoQty || 1)) * 100)}%)
                            </div>
                          </div>
                        ) : po.deliveryStatus === 'Cancelled' ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              padding: '3px 8px', 
                              borderRadius: '6px', 
                              background: '#f1f5f9', 
                              color: '#64748b', 
                              border: '1px solid #cbd5e1', 
                              fontSize: '0.75rem', 
                              fontWeight: '600' 
                            }}
                          >
                            Cancelled
                          </span>
                        ) : (
                          <div>
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                padding: '3px 8px', 
                                borderRadius: '6px', 
                                background: '#f8fafc', 
                                color: '#64748b', 
                                border: '1px solid #e2e8f0', 
                                fontSize: '0.75rem', 
                                fontWeight: '600' 
                              }}
                            >
                              <Clock size={13} /> Awaiting Delivery
                            </span>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px' }}>
                              0 kg received yet
                            </div>
                          </div>
                        )}

                        {/* Linked GRNs pills */}
                        {po.matchingGRNs && po.matchingGRNs.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {po.matchingGRNs.map((g, idx) => (
                              <span 
                                key={idx} 
                                style={{ 
                                  fontSize: '0.68rem', 
                                  fontWeight: '700', 
                                  padding: '1px 5px', 
                                  borderRadius: '4px', 
                                  background: '#eff6ff', 
                                  color: '#2563eb', 
                                  border: '1px solid #bfdbfe' 
                                }}
                              >
                                {g.grnNo || g.grnNumber || 'GRN'}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'top', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          
                          {/* PDF View / Download */}
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setActivePoForPdf(po)}
                            title="Preview, Download & Print Purchase Order PDF"
                            style={{ padding: '6px 8px', fontSize: '0.78rem', color: '#4f46e5', borderColor: '#c7d2fe', background: '#eef2ff' }}
                          >
                            <Printer size={14} />
                          </button>

                          {/* WhatsApp Share Direct */}
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={(e) => handleShareWhatsApp(po, e)}
                            title="Send Purchase Order Directly to Vendor on WhatsApp"
                            style={{ 
                              padding: '6px 8px', 
                              fontSize: '0.78rem', 
                              color: '#15803d', 
                              borderColor: '#bbf7d0', 
                              background: '#f0fdf4' 
                            }}
                          >
                            <MessageSquare size={14} />
                          </button>

                          {/* Full Details Modal */}
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setActivePoForDetails(po)}
                            title="Inspect Full Line Items, Tax & Inward History"
                            style={{ padding: '6px 8px', fontSize: '0.78rem' }}
                          >
                            <Eye size={14} />
                          </button>

                          {/* Cancel button if no inward received yet */}
                          {po.deliveryStatus !== 'Cancelled' && po.totalInwardQty === 0 && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={(e) => handleCancelPo(po, e)}
                              title="Cancel this Purchase Order"
                              style={{ padding: '6px 8px', fontSize: '0.78rem', color: '#b91c1c', borderColor: '#fecdd3' }}
                            >
                              <X size={14} />
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

        {/* Table Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemLabel="Purchase Orders"
        />
      </div>

      {/* ========================================================================= */}
      {/* 5. CREATE NEW PURCHASE ORDER MODAL */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.65)', 
            backdropFilter: 'blur(4px)', 
            zIndex: 1100, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }}
        >
          <div 
            className="modal-content" 
            style={{ 
              background: '#ffffff', 
              borderRadius: '14px', 
              width: '100%', 
              maxWidth: '960px', 
              maxHeight: '90vh', 
              overflowY: 'auto', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Create Purchase Order
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                    Issue official vendor order with live stock check & automated GRN tracking
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsCreateModalOpen(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSavePurchaseOrder} style={{ padding: '24px' }}>
              
              {/* Basic Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                
                {/* PO Number */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Purchase Order # *
                  </label>
                  <input
                    type="text"
                    required
                    value={poForm.poNumber}
                    onChange={(e) => setPoForm({ ...poForm, poNumber: e.target.value })}
                    className="input-field"
                    style={{ fontWeight: '700', color: '#1e293b' }}
                  />
                </div>

                {/* PO Date */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    PO Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={poForm.poDate}
                    onChange={(e) => setPoForm({ ...poForm, poDate: e.target.value })}
                    className="input-field"
                  />
                </div>

                {/* Promised Date of Delivery */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Promised Date of Delivery *
                  </label>
                  <input
                    type="date"
                    required
                    value={poForm.promisedDeliveryDate}
                    onChange={(e) => setPoForm({ ...poForm, promisedDeliveryDate: e.target.value })}
                    className="input-field"
                    style={{ border: '1px solid #4f46e5' }}
                  />
                </div>

                {/* Material Category */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Material Category
                  </label>
                  <select
                    value={poForm.category}
                    onChange={(e) => setPoForm({ ...poForm, category: e.target.value })}
                    className="input-field"
                  >
                    <option value="Film Substrates">Film Substrates (BOPP/PET/METPET/CPP/LD)</option>
                    <option value="Printing Inks">Printing Inks</option>
                    <option value="Adhesives & Hardener">Adhesives & Hardener</option>
                    <option value="Solvents & Chemicals">Solvents & Chemicals</option>
                    <option value="Rotogravure Cylinders">Rotogravure Cylinders</option>
                    <option value="Consumables & Spares">Consumables & Spares</option>
                  </select>
                </div>
              </div>

              {/* Vendor Selector & Vendor Details */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#1e293b' }}>
                    🏢 Vendor & Delivery Supplier Details
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Auto-populates GSTIN & terms for automated tax computation
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  {/* Select from existing vendors */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Choose Vendor *
                    </label>
                    <select
                      value={poForm.vendorId}
                      onChange={(e) => handleSelectVendor(e.target.value)}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    >
                      <option value="">-- Select Vendor from Directory --</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.companyName || v.name} {v.gstin ? `(${v.gstin})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Vendor Name (editable for one-off vendors) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Vendor Legal Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jindal Poly Films Ltd"
                      value={poForm.vendorName}
                      onChange={(e) => setPoForm({
                        ...poForm,
                        vendorName: e.target.value,
                        vendorDetails: { ...poForm.vendorDetails, companyName: e.target.value }
                      })}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* Vendor Phone (For direct WhatsApp dispatch) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Vendor Phone / WhatsApp Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9826012345"
                      value={poForm.vendorDetails.phone}
                      onChange={(e) => setPoForm({
                        ...poForm,
                        vendorDetails: { ...poForm.vendorDetails, phone: e.target.value }
                      })}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* Vendor GSTIN */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Vendor GSTIN
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 23AAACS9988F1Z1"
                      value={poForm.vendorDetails.gstin}
                      onChange={(e) => setPoForm({
                        ...poForm,
                        vendorDetails: { ...poForm.vendorDetails, gstin: e.target.value }
                      })}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Items Section Header & Add Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Ordered Materials & Items ({(poForm.items || []).length})
                  </h3>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                    Select from existing inventory catalog or create a custom item on the fly
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Quick Select from Inventory Dropdown */}
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const invItem = inventory.find(i => String(i.id) === String(e.target.value));
                      if (invItem) {
                        handleAddItemToForm(invItem);
                      }
                      e.target.value = '';
                    }}
                    className="input-field"
                    style={{ width: '220px', fontSize: '0.78rem', height: '34px' }}
                  >
                    <option value="">+ Add from Inventory...</option>
                    {inventory.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.itemName || inv.itemCode} ({inv.category})
                      </option>
                    ))}
                  </select>

                  {/* Add New Custom Item Button */}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleAddItemToForm({
                      itemDesc: 'New Raw Material Item',
                      category: poForm.category,
                      qtyKg: 500,
                      rate: 165,
                      unit: 'Kg',
                      gstPct: 18
                    })}
                    style={{ fontSize: '0.78rem', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={14} /> Add Custom Item
                  </button>

                  {/* Import from Order Shortage Requisitions */}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsOrderShortageModalOpen(true)}
                    style={{ fontSize: '0.78rem', padding: '6px 10px', color: '#4f46e5', borderColor: '#c7d2fe', background: '#eff6ff', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Layers size={14} /> Import Order Shortage
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px 12px' }}>#</th>
                      <th style={{ padding: '8px 12px' }}>Item Description *</th>
                      <th style={{ padding: '8px 12px', width: '90px' }}>Micron</th>
                      <th style={{ padding: '8px 12px', width: '100px' }}>Width (mm)</th>
                      <th style={{ padding: '8px 12px', width: '110px' }}>Quantity *</th>
                      <th style={{ padding: '8px 12px', width: '110px' }}>Rate (₹) *</th>
                      <th style={{ padding: '8px 12px', width: '120px' }}>Line Total (₹)</th>
                      <th style={{ padding: '8px 12px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(poForm.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
                          No items added yet. Click <strong>+ Add from Inventory</strong> or <strong>Add Custom Item</strong> to specify materials.
                        </td>
                      </tr>
                    ) : (
                      (poForm.items || []).map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{idx + 1}</td>
                          
                          {/* Item Description */}
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={item.itemDesc}
                              onChange={(e) => handleUpdateItemField(item.id, 'itemDesc', e.target.value)}
                              className="input-field"
                              style={{ fontSize: '0.82rem', padding: '4px 8px', height: '30px' }}
                            />
                            {item.jobName && (
                              <div style={{ fontSize: '0.7rem', color: '#4f46e5', marginTop: '2px' }}>
                                Ref: Order {item.orderId} ({item.jobName})
                              </div>
                            )}
                          </td>

                          {/* Micron */}
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              placeholder="12/20/30"
                              value={item.micron || ''}
                              onChange={(e) => handleUpdateItemField(item.id, 'micron', e.target.value)}
                              className="input-field"
                              style={{ fontSize: '0.82rem', padding: '4px 8px', height: '30px' }}
                            />
                          </td>

                          {/* Width mm */}
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              placeholder="Width"
                              value={item.widthMm || ''}
                              onChange={(e) => handleUpdateItemField(item.id, 'widthMm', e.target.value)}
                              className="input-field"
                              style={{ fontSize: '0.82rem', padding: '4px 8px', height: '30px' }}
                            />
                          </td>

                          {/* Quantity */}
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                required
                                min="0.01"
                                step="any"
                                value={item.qtyKg}
                                onChange={(e) => handleUpdateItemField(item.id, 'qtyKg', e.target.value)}
                                className="input-field"
                                style={{ fontSize: '0.82rem', padding: '4px 8px', height: '30px', fontWeight: '700' }}
                              />
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.unit || 'Kg'}</span>
                            </div>
                          </td>

                          {/* Rate */}
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>₹</span>
                              <input
                                type="number"
                                required
                                min="0.01"
                                step="any"
                                value={item.rate}
                                onChange={(e) => handleUpdateItemField(item.id, 'rate', e.target.value)}
                                className="input-field"
                                style={{ fontSize: '0.82rem', padding: '4px 8px', height: '30px', fontWeight: '700' }}
                              />
                            </div>
                          </td>

                          {/* Line Total */}
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0f172a' }}>
                            ₹{(item.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>

                          {/* Remove */}
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromForm(item.id)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Commercials, Taxes & Terms Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                
                {/* Terms & Notes */}
                <div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Payment Terms
                    </label>
                    <input
                      type="text"
                      value={poForm.paymentTerms}
                      onChange={(e) => setPoForm({ ...poForm, paymentTerms: e.target.value })}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Delivery / Freight Logistics
                    </label>
                    <input
                      type="text"
                      value={poForm.logisticDetails}
                      onChange={(e) => setPoForm({ ...poForm, logisticDetails: e.target.value })}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Special Instructions / Inspection Notes
                    </label>
                    <textarea
                      rows={3}
                      value={poForm.notes}
                      onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                      className="input-field"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>
                </div>

                {/* Subtotal & Tax Calculation Box */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
                      Commercial Calculation Summary
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px', color: '#475569' }}>
                      <span>Total Ordered Quantity:</span>
                      <strong>{(formCalculations?.totalQty || 0).toLocaleString()} kg</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px', color: '#475569' }}>
                      <span>Subtotal (Taxable):</span>
                      <span>₹{(formCalculations?.subtotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>

                    {formCalculations?.isInterState ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px', color: '#475569' }}>
                        <span>IGST (18%):</span>
                        <span>₹{(formCalculations?.igst || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px', color: '#475569' }}>
                          <span>CGST (9%):</span>
                          <span>₹{(formCalculations?.cgst || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px', color: '#475569' }}>
                          <span>SGST (9%):</span>
                          <span>₹{(formCalculations?.sgst || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>Grand Total (₹):</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#4f46e5' }}>
                        ₹{(formCalculations?.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{ padding: '9px 18px' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ 
                    padding: '9px 24px', 
                    fontWeight: '700', 
                    background: '#4f46e5',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)' 
                  }}
                >
                  Issue & Save Purchase Order
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. ACTIVE PO COLLISION WARNING POP-UP MODAL */}
      {/* ========================================================================= */}
      {activeCollisionWarning && (
        <div 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(5px)', 
            zIndex: 1300, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }}
        >
          <div 
            style={{ 
              background: '#ffffff', 
              borderRadius: '14px', 
              width: '100%', 
              maxWidth: '560px', 
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
              border: '2px solid #f59e0b',
              overflow: 'hidden'
            }}
          >
            <div style={{ background: '#fffbeb', padding: '18px 24px', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#92400e', margin: 0 }}>
                  Active Purchase Order Already Exists!
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#b45309' }}>
                  Goods have not yet been received for this material
                </span>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '0.86rem', color: '#334155', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                You are about to issue a Purchase Order for{' '}
                <strong style={{ color: '#0f172a' }}>
                  {activeCollisionWarning.pendingItem.itemDesc || activeCollisionWarning.pendingItem.itemName}
                </strong>
                . However, an active order is already pending fulfillment:
              </p>

              <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.82rem', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Active PO Number:</span>
                  <strong style={{ color: '#4f46e5' }}>{activeCollisionWarning.collision.collidingPo.poNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Issued Vendor:</span>
                  <span style={{ fontWeight: '600', color: '#0f172a' }}>
                    {activeCollisionWarning.collision.collidingPo.vendorName || activeCollisionWarning.collision.collidingPo.vendor?.companyName}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>PO Issued Date:</span>
                  <span>{activeCollisionWarning.collision.collidingPo.poDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Promised Delivery:</span>
                  <strong style={{ color: '#b45309' }}>
                    {activeCollisionWarning.collision.collidingPo.promisedDeliveryDate || activeCollisionWarning.collision.collidingPo.deliveryDate}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                  <span style={{ color: '#64748b' }}>Ordered / Pending Qty:</span>
                  <strong style={{ color: '#dc2626' }}>
                    {(activeCollisionWarning?.collision?.totalPoQty || 0).toLocaleString()} kg ordered • {(activeCollisionWarning?.collision?.pendingQty || 0).toLocaleString()} kg pending GRN
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveCollisionWarning(null)}
                  style={{ fontSize: '0.84rem' }}
                >
                  Choose Different Item
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const item = activeCollisionWarning.pendingItem;
                    setActiveCollisionWarning(null);
                    handleAddItemToForm(item, true); // bypass collision
                  }}
                  style={{ fontSize: '0.84rem', background: '#f59e0b', borderColor: '#d97706', color: '#ffffff' }}
                >
                  Proceed & Add Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. IMPORT FROM ORDER SHORTAGE REQUISITIONS MODAL */}
      {/* ========================================================================= */}
      {isOrderShortageModalOpen && (
        <div 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.65)', 
            backdropFilter: 'blur(4px)', 
            zIndex: 1200, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }}
        >
          <div 
            style={{ 
              background: '#ffffff', 
              borderRadius: '14px', 
              width: '100%', 
              maxWidth: '840px', 
              maxHeight: '80vh', 
              overflowY: 'auto', 
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', 
              border: '1px solid #e2e8f0',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Active Job Order Material Shortages
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Select shortage lines from active customer orders to bundle into this Purchase Order
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsOrderShortageModalOpen(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px 12px' }}>Order & Job</th>
                    <th style={{ padding: '8px 12px' }}>Material Required</th>
                    <th style={{ padding: '8px 12px' }}>Required Qty</th>
                    <th style={{ padding: '8px 12px' }}>Preferred Vendor</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingShortageRequirements.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No pending order shortages found. All order raw materials either have POs issued or are in stock.
                      </td>
                    </tr>
                  ) : (
                    pendingShortageRequirements.map(({ order, req }) => (
                      <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <strong style={{ color: '#0f172a' }}>#{order.id}</strong>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{order.jobName}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <strong style={{ color: '#334155' }}>{req.filmType}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {req.micron ? `${req.micron}µ` : ''} {req.widthMm ? `• ${req.widthMm}mm` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0f172a' }}>
                          {req.qtyKg || 0} kg
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                          {req.preferredVendor || 'Any Vendor'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              handleAddItemToForm({
                                itemId: req.id,
                                itemDesc: `${req.filmType} ${req.micron ? req.micron + 'µ' : ''} (${req.widthMm || ''}mm Width)`,
                                filmType: req.filmType,
                                micron: req.micron,
                                widthMm: req.widthMm,
                                qtyKg: req.qtyKg || 500,
                                rate: 165,
                                orderId: order.id,
                                jobName: order.jobName
                              });
                              setPoForm(prev => ({
                                ...prev,
                                linkedOrderId: order.id,
                                linkedOrderName: order.jobName,
                                linkedRequirements: [...prev.linkedRequirements, req.id]
                              }));
                              setIsOrderShortageModalOpen(false);
                            }}
                            style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#4f46e5' }}
                          >
                            + Add to PO
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. PURCHASE ORDER DETAIL & INWARD INSPECTION MODAL */}
      {/* ========================================================================= */}
      {activePoForDetails && (
        <div 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.65)', 
            backdropFilter: 'blur(4px)', 
            zIndex: 1100, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }}
        >
          <div 
            style={{ 
              background: '#ffffff', 
              borderRadius: '14px', 
              width: '100%', 
              maxWidth: '820px', 
              maxHeight: '90vh', 
              overflowY: 'auto', 
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', 
              border: '1px solid #e2e8f0',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a' }}>
                    {activePoForDetails.poNumber}
                  </span>
                  <span 
                    style={{ 
                      fontSize: '0.72rem', 
                      fontWeight: '700', 
                      padding: '3px 8px', 
                      borderRadius: '6px', 
                      background: activePoForDetails.deliveryStatus === 'Fully Received' ? '#ecfdf5' : '#eff6ff', 
                      color: activePoForDetails.deliveryStatus === 'Fully Received' ? '#047857' : '#1d4ed8' 
                    }}
                  >
                    {activePoForDetails.deliveryStatus}
                  </span>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
                  Vendor: <strong style={{ color: '#0f172a' }}>{activePoForDetails.vendorName || activePoForDetails.vendor?.companyName}</strong> • Date: {activePoForDetails.poDate}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const po = activePoForDetails;
                    setActivePoForDetails(null);
                    setActivePoForPdf(po);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                >
                  <Printer size={14} /> View PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={(e) => handleShareWhatsApp(activePoForDetails, e)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#15803d' }}
                >
                  <MessageSquare size={14} /> WhatsApp
                </button>
                <button 
                  type="button" 
                  onClick={() => setActivePoForDetails(null)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Inward Progress Summary */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Ordered Qty</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                    {(activePoForDetails.totalPoQty || 0).toLocaleString()} kg
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Received in GRN</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#047857' }}>
                    {(activePoForDetails.totalInwardQty || 0).toLocaleString()} kg
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Balance Pending</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: activePoForDetails.pendingQty > 0 ? '#b45309' : '#64748b' }}>
                    {(activePoForDetails.pendingQty || 0).toLocaleString()} kg
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Promised Date</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', color: activePoForDetails.isOverdue ? '#dc2626' : '#0f172a' }}>
                    {activePoForDetails.promisedDeliveryDate || activePoForDetails.deliveryDate || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <h4 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              Line Items in Purchase Order
            </h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px 12px' }}>Description</th>
                    <th style={{ padding: '8px 12px' }}>Micron / Width</th>
                    <th style={{ padding: '8px 12px' }}>Ordered Qty</th>
                    <th style={{ padding: '8px 12px' }}>Rate (₹)</th>
                    <th style={{ padding: '8px 12px' }}>Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activePoForDetails.items || []).map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0f172a' }}>
                        {it.itemDesc || it.itemName}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>
                        {it.micron ? `${it.micron}µ` : '-'} {it.widthMm ? `• ${it.widthMm}mm` : ''}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: '700' }}>
                        {(it.qtyKg || 0).toLocaleString()} {it.unit || 'Kg'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        ₹{it.rate || 0}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0f172a' }}>
                        ₹{(it.amount || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Matching GRNs Inward Record History */}
            <h4 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              Goods Received Notes (GRN) Inward Records ({activePoForDetails.matchingGRNs?.length || 0})
            </h4>
            {activePoForDetails.matchingGRNs && activePoForDetails.matchingGRNs.length > 0 ? (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px 12px' }}>GRN #</th>
                      <th style={{ padding: '8px 12px' }}>Inward Date</th>
                      <th style={{ padding: '8px 12px' }}>Vendor Invoice</th>
                      <th style={{ padding: '8px 12px' }}>Net Weight (Kg)</th>
                      <th style={{ padding: '8px 12px' }}>QC Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePoForDetails.matchingGRNs.map((grn, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '700', color: '#4f46e5' }}>
                          {grn.grnNo || grn.grnNumber}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                          {grn.receivedDate || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                          {grn.invoiceNo || grn.invoiceNumber || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0f172a' }}>
                          {(grn.netWeightKg || grn.receivedQtyKg || 0).toLocaleString()} kg
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span 
                            style={{ 
                              fontSize: '0.72rem', 
                              fontWeight: '700', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              background: '#ecfdf5', 
                              color: '#047857' 
                            }}
                          >
                            {grn.status || 'Approved'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                No GRN inward receipts recorded for this PO number yet. When goods are received in Factory Gate & GRN is issued with PO# {activePoForDetails.poNumber}, it will automatically link here.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. PURCHASE ORDER PDF PREVIEW & PRINT MODAL */}
      {/* ========================================================================= */}
      {activePoForPdf && (
        <PurchaseOrderPDF
          poData={activePoForPdf}
          vendors={vendors}
          onClose={() => setActivePoForPdf(null)}
        />
      )}

    </div>
  );
}
