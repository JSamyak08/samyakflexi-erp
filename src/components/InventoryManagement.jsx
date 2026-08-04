import React, { useState } from 'react';
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
  History
} from 'lucide-react';
import GRNPDF from './GRNPDF';
import WeighingScaleInput from './WeighingScaleInput';
import BarcodePrinterModal from './BarcodePrinterModal';
import DispatchPackingListPDF from './DispatchPackingListPDF';
import { 
  isReconciliationDue, 
  FILM_DENSITIES, 
  DEFAULT_DAILY_RATES,
  generateBarcodeId, 
  generateVendorId,
  initialInventoryRolls, 
  initialDispatchShipments,
  initialStockAdjustments
} from '../factoryStore';

export default function InventoryManagement({ 
  inventory, 
  grns, 
  vendors, 
  orders, 
  productionRecords = [],
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

  const [storeIssueTransactions, setStoreIssueTransactions] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_store_issue_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [editingTxId, setEditingTxId] = useState(null);
  const [editingBarcodeVal, setEditingBarcodeVal] = useState('');

  // Ledger Filter & Quick Adjustment State
  const [ledgerFilterTab, setLedgerFilterTab] = useState('all'); // 'all', 'inward', 'usage', 'reconciliation'
  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('');

  const [isQuickAdjOpen, setIsQuickAdjOpen] = useState(false);
  const [adjType, setAdjType] = useState('Physical Audit (+)');
  const [adjQtyKg, setAdjQtyKg] = useState(10);
  const [adjBarcode, setAdjBarcode] = useState('');
  const [adjReason, setAdjReason] = useState('Physical Stock Count Variance');

  // Barcode Printer & Packing List Modals State
  const [selectedRollForBarcodeModal, setSelectedRollForBarcodeModal] = useState(null);
  const [selectedDispatchForPackingList, setSelectedDispatchForPackingList] = useState(null);

  // Dispatch Form State (Scale #4 Station)
  const [isNewDispatchModalOpen, setIsNewDispatchModalOpen] = useState(false);
  const [dispatchJobName, setDispatchJobName] = useState(orders[0]?.jobName || 'Britannia Bourbon 250g Packaging');
  const [dispatchClientName, setDispatchClientName] = useState(orders[0]?.clientName || 'Britannia Industries Ltd');
  const [dispatchVehicleNo, setDispatchVehicleNo] = useState('MP-09-HH-4491');
  const [dispatchLrNo, setDispatchLrNo] = useState('LR-99821-IND');
  const [dispatchRollsList, setDispatchRollsList] = useState([
    { rollNo: 1, barcodeId: generateBarcodeId('FG-DISP'), substrateSpec: 'PET 12µ / METPET 12µ / Milky LD 40µ', netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: '3 inch' },
    { rollNo: 2, barcodeId: generateBarcodeId('FG-DISP'), substrateSpec: 'PET 12µ / METPET 12µ / Milky LD 40µ', netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: '3 inch' }
  ]);
  const [currentDispatchNetWeight, setCurrentDispatchNetWeight] = useState(210.0);

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
    "BOPP Natural", "Metalised BOPP", "Pearlised BOPP", 
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
      barcode: adjBarcode.trim() || `BAR-${(item.filmType || 'ADJ').toUpperCase().replace(/\s+/g, '')}-ADJ-${Math.floor(100 + Math.random() * 900)}`,
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

    const matchedOrder = orders.find(o => o.jobName === dispatchJobName);
    const orderId = matchedOrder ? matchedOrder.id : `ORD-2026-${Math.floor(100 + Math.random() * 900)}`;

    const totalNetWeight = dispatchRollsList.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
    const totalGrossWeight = dispatchRollsList.reduce((sum, r) => sum + (parseFloat(r.grossWeightKg) || 0), 0);

    const newShipment = {
      dispatchId: `DISP-2026-${Math.floor(100 + Math.random() * 900)}`,
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
  const [selectedInvItem, setSelectedInvItem] = useState(inventory[0] || null);
  const [issueQtyKg, setIssueQtyKg] = useState(100);
  const [issueJobName, setIssueJobName] = useState(orders[0]?.jobName || '');
  const [stockSearchTerm, setStockSearchTerm] = useState('');

  // Stock Register Directory Filter State
  const [stockCategoryFilter, setStockCategoryFilter] = useState('ALL');

  // Inward GRN Form State
  const [grnVendor, setGrnVendor] = useState(vendors[0]?.companyName || '');
  const [grnPoNo, setGrnPoNo] = useState('PO-2026-042');
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnCategory, setGrnCategory] = useState('Film Substrates');
  const [grnItemName, setGrnItemName] = useState('');
  const [grnFilmType, setGrnFilmType] = useState('PET');
  const [grnMicron, setGrnMicron] = useState(12);
  const [grnWidthMm, setGrnWidthMm] = useState(1000);
  const [grnUnit, setGrnUnit] = useState('Kg');
  const [grnRolls, setGrnRolls] = useState(10);
  const [grnWeightKg, setGrnWeightKg] = useState(1500);
  const [grnBatchNo, setGrnBatchNo] = useState('');

  // Edit Stock Item State
  const [editingStockItem, setEditingStockItem] = useState(null);
  const [editFilmType, setEditFilmType] = useState('PET');
  const [editMicron, setEditMicron] = useState(12);
  const [editWidthMm, setEditWidthMm] = useState(1000);
  const [editAvailableQtyKg, setEditAvailableQtyKg] = useState(1000);
  const [editAllocatedQtyKg, setEditAllocatedQtyKg] = useState(0);
  const [editLocation, setEditLocation] = useState('Bay A');
  const [editReorderLevelKg, setEditReorderLevelKg] = useState(1000);

  const openEditStockModal = (item) => {
    setEditingStockItem(item);
    setEditFilmType(item.filmType);
    setEditMicron(item.micron);
    setEditWidthMm(item.widthMm);
    setEditAvailableQtyKg(item.availableQtyKg);
    setEditAllocatedQtyKg(item.allocatedQtyKg || 0);
    setEditLocation(item.location);
    setEditReorderLevelKg(item.reorderLevelKg || 1000);
  };

  const handleSaveStockEdit = (e) => {
    e.preventDefault();
    if (!editingStockItem) return;

    const updatedInv = inventory.map(item => {
      if (item.id === editingStockItem.id) {
        return {
          ...item,
          filmType: editFilmType,
          micron: parseFloat(editMicron),
          widthMm: parseFloat(editWidthMm),
          density: FILM_DENSITIES[editFilmType] || 1.0,
          availableQtyKg: parseFloat(editAvailableQtyKg),
          allocatedQtyKg: parseFloat(editAllocatedQtyKg),
          location: editLocation,
          reorderLevelKg: parseFloat(editReorderLevelKg)
        };
      }
      return item;
    });

    if (onUpdateInventory) {
      onUpdateInventory(updatedInv);
    }

    setEditingStockItem(null);
    alert(`Stock item ${editingStockItem.id} updated successfully!`);
  };

  const handleDeleteStockItem = (item) => {
    if (window.confirm(`Are you sure you want to permanently delete stock item "${item.id} - ${item.filmType} ${item.micron}µ (${item.widthMm}mm)"?`)) {
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
    const itemName = isFilm 
      ? `${grnFilmType} ${grnMicron}µ (${grnWidthMm}mm)` 
      : (grnItemName.trim() || `${grnCategory} Inward Item`);

    const newGRN = {
      grnNo: `GRN-2026-${Math.floor(100 + Math.random() * 900)}`,
      poNumber: grnPoNo,
      vendorName: grnVendor,
      invoiceNo: grnInvoiceNo,
      receivedDate: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      category: grnCategory,
      itemName: itemName,
      filmType: isFilm ? grnFilmType : grnCategory,
      micron: isFilm ? parseFloat(grnMicron) : '-',
      widthMm: isFilm ? parseFloat(grnWidthMm) : '-',
      unit: isFilm ? 'Kg' : grnUnit,
      rollsReceived: isFilm ? parseInt(grnRolls) : 1,
      netWeightKg: parseFloat(grnWeightKg) || 0,
      batchNo: grnBatchNo,
      status: "Pending QC", // Goes to Store QC Verification
      qcNotes: "",
      inspectedBy: "",
      storeManager: "Store Mgr Dilip Joshi"
    };

    if (onAddGRN) {
      onAddGRN(newGRN);
    }

    // Generate Inward Barcode Roll / Consumable Tag
    const newRoll = {
      barcodeId: generateBarcodeId(isFilm ? 'RM-BC' : 'CON-BC'),
      rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
      itemId: `INV-${Math.floor(100 + Math.random() * 900)}`,
      itemName: itemName,
      category: grnCategory,
      micron: isFilm ? parseFloat(grnMicron) : '-',
      widthMm: isFilm ? parseFloat(grnWidthMm) : '-',
      unit: isFilm ? 'Kg' : grnUnit,
      inwardDatetime: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      vendorName: grnVendor,
      invoiceNo: grnInvoiceNo,
      batchNo: grnBatchNo,
      netWeightKg: parseFloat(grnWeightKg),
      availableWeightKg: parseFloat(grnWeightKg),
      stationId: 'SCALE_1_INWARD',
      locationBay: isFilm ? 'Bay A' : 'Consumables Store',
      status: 'In Stock'
    };

    if (onAddRoll) {
      onAddRoll(newRoll);
    }

    setIsNewGRNModalOpen(false);
    setSelectedRollForBarcodeModal(newRoll);
    alert(`Inward GRN ${newGRN.grnNo} created for ${grnCategory}! Inward Barcode ${newRoll.barcodeId} generated.`);
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

      const existingInvIndex = inventory.findIndex(i => {
        if (isFilm) {
          return i.filmType === updatedGRN.filmType && i.micron === updatedGRN.micron && i.widthMm === updatedGRN.widthMm;
        }
        return (i.itemName || '').toLowerCase() === (updatedGRN.itemName || '').toLowerCase() || i.id === updatedGRN.itemId;
      });

      if (existingInvIndex >= 0) {
        const updatedInv = [...inventory];
        updatedInv[existingInvIndex].availableQtyKg += updatedGRN.netWeightKg;
        updatedInv[existingInvIndex].lastVendor = updatedGRN.vendorName;
        updatedInv[existingInvIndex].lastBatch = updatedGRN.batchNo;
        onUpdateInventory(updatedInv);
      } else {
        const newInvItem = {
          id: `INV-00${inventory.length + 1}`,
          itemCode: `CON-INW-00${inventory.length + 1}`,
          itemName: updatedGRN.itemName || `${updatedGRN.filmType} Inward Stock`,
          category: updatedGRN.category || 'Film Substrates',
          filmType: updatedGRN.filmType || 'Generic',
          micron: updatedGRN.micron || '-',
          widthMm: updatedGRN.widthMm || '-',
          unit: updatedGRN.unit || 'Kg',
          density: FILM_DENSITIES[updatedGRN.filmType] || 1.0,
          availableQtyKg: updatedGRN.netWeightKg,
          allocatedQtyKg: 0,
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

  // Issue / Return Submit (Records transaction in Store Issue/Return Ledger)
  const handleIssueReturnSubmit = () => {
    if (!selectedInvItem || issueQtyKg <= 0) return;

    const qty = parseFloat(issueQtyKg);
    let updatedInv = [...inventory];
    const idx = updatedInv.findIndex(i => i.id === selectedInvItem.id);

    if (idx >= 0) {
      const item = updatedInv[idx];
      const unitStr = item.unit || 'Kg';
      const itemNameStr = item.itemName || `${item.filmType} ${item.micron !== '-' ? `${item.micron}µ` : ''}`;

      if (issueType === 'issue') {
        if (item.availableQtyKg < qty) {
          alert(`Insufficient available stock! Only ${item.availableQtyKg} ${unitStr} available.`);
          return;
        }
        item.availableQtyKg -= qty;
        item.allocatedQtyKg = (item.allocatedQtyKg || 0) + qty;
      } else {
        item.availableQtyKg += qty;
        if ((item.allocatedQtyKg || 0) >= qty) {
          item.allocatedQtyKg -= qty;
        }
      }

      // Record in storeIssueTransactions
      const newTx = {
        id: `ISS-${Date.now()}`,
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: itemNameStr,
        filmType: item.filmType,
        micron: item.micron,
        widthMm: item.widthMm,
        category: item.category || 'Film Substrates',
        issueType: issueType, // 'issue' | 'return'
        jobName: issueJobName || 'General Production Floor',
        qtyKg: qty,
        unit: unitStr,
        date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
        issuedBy: 'Store Mgr Dilip Joshi',
        notes: issueType === 'issue'
          ? `Issued ${qty} ${unitStr} to Job: ${issueJobName || 'Production'}`
          : `Returned ${qty} ${unitStr} from Job: ${issueJobName || 'Production'} back to Store`,
        barcode: item.lastBatch || `BAR-ISS-${item.id}`
      };

      const updatedTxList = [newTx, ...storeIssueTransactions];
      setStoreIssueTransactions(updatedTxList);
      try {
        localStorage.setItem('samyak_erp_store_issue_transactions', JSON.stringify(updatedTxList));
      } catch (e) {}

      if (onUpdateInventory) {
        onUpdateInventory(updatedInv);
      }

      alert(`${issueType === 'issue' ? 'Issued' : 'Returned'} ${qty} ${unitStr} of ${itemNameStr} successfully! Ledger updated.`);
    }

    setIsIssueModalOpen(false);
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
            newItems.push({
              id: `INV-${100 + inventory.length + newItems.length + 1}`,
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

  const pendingQCGRNs = grns.filter(g => g.status === 'Pending QC');

  const filteredInventory = inventory.filter(i => {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PDF View Modal */}
      {selectedGRNForPDF && (
        <GRNPDF grnData={selectedGRNForPDF} onClose={() => setSelectedGRNForPDF(null)} />
      )}

      {/* Barcode Thermal Label Printer Modal */}
      {selectedRollForBarcodeModal && (
        <BarcodePrinterModal roll={selectedRollForBarcodeModal} onClose={() => setSelectedRollForBarcodeModal(null)} />
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
          <button className="btn-primary" style={{ background: '#f59e0b', color: 'black' }} onClick={() => setActiveTab('reconciliation')}>
            Start Stock Reconciliation
          </button>
        </div>
      )}

      {/* Top Controls & Navigation */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* Sub Tab Pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className={`tab-pill ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
              <Package size={16} /> Stock Register ({inventory.length})
            </button>
            <button className={`tab-pill ${activeTab === 'grn_inward' ? 'active' : ''}`} onClick={() => setActiveTab('grn_inward')}>
              <FileCheck size={16} /> Inward GRNs ({grns.length})
            </button>
            <button className={`tab-pill ${pendingQCGRNs.length > 0 ? 'red-tab' : ''} ${activeTab === 'qc_approval' ? 'active' : ''}`} onClick={() => setActiveTab('qc_approval')}>
              🧪 QC Approval Lab ({pendingQCGRNs.length} Pending)
            </button>
            <button className={`tab-pill ${activeTab === 'dispatch' ? 'active' : ''}`} onClick={() => setActiveTab('dispatch')}>
              <Truck size={16} style={{ color: '#059669' }} /> Scale #4 Dispatch & Packing List
            </button>
            <button className={`tab-pill ${activeTab === 'reconciliation' ? 'active' : ''}`} onClick={() => setActiveTab('reconciliation')}>
              <FileSpreadsheet size={16} /> Barcode Stock Reconciliation
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={() => setIsIssueModalOpen(true)}>
              <ArrowUpRight size={18} /> Issue / Return to Store
            </button>
            <button className="btn-primary" onClick={() => setIsNewGRNModalOpen(true)}>
              <Plus size={18} /> Inward GRN (New Stock)
            </button>
          </div>
        </div>
      </div>

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

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                Total Items: <b>{filteredInventory.length} Listed</b>
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
                  <th>Allocated Qty</th>
                  <th>Location Bay</th>
                  <th>Last Supplier & Batch</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map(item => {
                  const isLow = (item.availableQtyKg ?? 0) <= (item.reorderLevelKg ?? 100);
                  const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
                  const title = item.itemName || `${item.filmType} Film (${item.micron}µ x ${item.widthMm}mm)`;
                  const unitStr = item.unit || 'kg';

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
                {grns.map(g => (
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
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setSelectedGRNForPDF(g)}>
                        <Printer size={14} /> Print GRN PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                      <span>Material Substrate:</span>
                      <span className="bold-val">{g.filmType} Film ({g.micron}µ / {g.widthMm}mm)</span>
                    </div>
                    <div className="calc-summary-row">
                      <span>Inward Net Weight:</span>
                      <span className="bold-val" style={{ color: '#60a5fa' }}>{g.netWeightKg} kg ({g.rollsReceived} rolls)</span>
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
                {(dispatchShipments || initialDispatchShipments).map(ds => (
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

        // Filter inventory list based on Search & Filter state
        const filteredRecItems = inventory.filter(item => {
          const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
          const diff = physicalVal - item.availableQtyKg;

          // 1. Search Filter
          if (recSearchTerm.trim()) {
            const q = recSearchTerm.toLowerCase();
            const matchId = (item.id || '').toLowerCase().includes(q);
            const matchFilm = (item.filmType || '').toLowerCase().includes(q);
            const matchSpec = `${item.micron || ''} ${item.widthMm || ''}`.toLowerCase().includes(q);
            const matchLoc = (item.location || '').toLowerCase().includes(q);
            const matchBatch = (item.lastBatch || '').toLowerCase().includes(q);
            if (!matchId && !matchFilm && !matchSpec && !matchLoc && !matchBatch) return false;
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
                  {inventory.length} SKUs
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
                  {inventory.length > 0 ? (((shortageCount + surplusCount) / inventory.length) * 100).toFixed(0) : 0}% Variance
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
                    All ({inventory.length})
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
                  {filteredRecItems.length === 0 ? (
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
                    filteredRecItems.map(item => {
                      const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
                      const diff = physicalVal - item.availableQtyKg;

                      return (
                        <tr key={item.id} style={{ background: diff < 0 ? '#fff5f5' : (diff > 0 ? '#f0fdf4' : 'transparent') }}>
                          <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>{item.id}</td>
                          <td style={{ fontWeight: '600' }}>{item.filmType} Film</td>
                          <td>{item.micron}µ / {item.widthMm}mm</td>
                          <td style={{ fontWeight: '700' }}>{(item.availableQtyKg ?? 0).toLocaleString()} kg</td>
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

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing <strong>{filteredRecItems.length}</strong> of <strong>{inventory.length}</strong> stock items
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
          <div className="glass-card modal-content" style={{ width: '650px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px' }}>Create Goods Receipt Note (GRN Inward)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Store Manager stock inward entry. Creates downloadable GRN & triggers Quality Control (QC) inspection.
            </p>

            <form onSubmit={handleSaveGRN}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0, fontWeight: '600' }}>Vendor Name *</label>
                    <button
                      type="button"
                      onClick={() => setIsVendorModalOpen(true)}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#047857',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        padding: '3px 10px',
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
                  >
                    <option value="" disabled>-- Select Vendor --</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.companyName}>{v.companyName} ({v.gstin || 'GSTIN N/A'})</option>
                    ))}
                    <option value="__CREATE_NEW__" style={{ fontWeight: '700', color: '#047857' }}>
                      ➕ + Onboard / Create New Vendor...
                    </option>
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>Inward Item Category *</label>
                  <select 
                    className="form-control" 
                    style={{ fontWeight: '700' }}
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

                <div className="form-group">
                  <label>Ref PO Number</label>
                  <input type="text" className="form-control" value={grnPoNo} onChange={e => setGrnPoNo(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Vendor Invoice Number *</label>
                  <input type="text" className="form-control" required placeholder="e.g. INV-FP-9904" value={grnInvoiceNo} onChange={e => setGrnInvoiceNo(e.target.value)} />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Manufacturer Batch / Heat # *</label>
                  <input type="text" className="form-control" required placeholder="e.g. BATCH-PET-991" value={grnBatchNo} onChange={e => setGrnBatchNo(e.target.value)} />
                </div>

                {grnCategory === 'Film Substrates' ? (
                  <>
                    <div className="form-group">
                      <label>Film Substrate</label>
                      <select className="form-control" value={grnFilmType} onChange={e => setGrnFilmType(e.target.value)}>
                        {Object.keys(FILM_DENSITIES).map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Micron Gauge (µ)</label>
                      <input type="number" className="form-control" value={grnMicron} onChange={e => setGrnMicron(e.target.value)} />
                    </div>

                    <div className="form-group">
                      <label>Slit Width (mm)</label>
                      <input type="number" className="form-control" value={grnWidthMm} onChange={e => setGrnWidthMm(e.target.value)} />
                    </div>

                    <div className="form-group">
                      <label>Rolls Received</label>
                      <input type="number" className="form-control" value={grnRolls} onChange={e => setGrnRolls(e.target.value)} />
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Net Weight Inward (Kg) *</label>
                      <input type="number" step="any" className="form-control" required value={grnWeightKg} onChange={e => setGrnWeightKg(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Item Description / Specification *</label>
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
                      <label>Unit of Measure *</label>
                      <select className="form-control" value={grnUnit} onChange={e => setGrnUnit(e.target.value)}>
                        <option value="Kg">Kg</option>
                        <option value="Litres">Litres</option>
                        <option value="Meters">Meters</option>
                        <option value="Boxes">Boxes</option>
                        <option value="Rolls">Rolls</option>
                        <option value="Pcs">Pcs</option>
                        <option value="Drums">Drums</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Inward Quantity Received ({grnUnit}) *</label>
                      <input 
                        type="number" 
                        step="any"
                        className="form-control" 
                        required 
                        value={grnWeightKg} 
                        onChange={e => setGrnWeightKg(e.target.value)} 
                      />
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsNewGRNModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
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
          <div className="glass-card modal-content" style={{ width: '550px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px' }}>🧪 QC Inspection Report: {qcInspectingGRN.grnNo}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Inspect physical roll parameters (Micron gauge accuracy, Corona dyne, tensile strength, visual defects).
            </p>

            <div className="form-group">
              <label>QC Lab Inspector Notes & Test Results</label>
              <textarea 
                className="form-control"
                placeholder="Enter gauge tolerance test, dyne level, or visual observations..."
                value={qcNotesInput}
                onChange={e => setQcNotesInput(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="btn-secondary" style={{ border: '1px solid #ef4444', color: '#ef4444' }} onClick={() => handleQCAction('Rejected')}>
                <XCircle size={16} /> Reject Material
              </button>
              <button className="btn-primary" style={{ background: '#10b981' }} onClick={() => handleQCAction('Approved')}>
                <CheckCircle2 size={16} /> Approve & Add Stock to Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Issue / Return to Store */}
      {isIssueModalOpen && (
        <div className="modal-overlay" onClick={() => setIsIssueModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px' }}>Material Issue & Return to Store</h3>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button className={`tab-pill ${issueType === 'issue' ? 'active' : ''}`} onClick={() => setIssueType('issue')}>
                <ArrowUpRight size={14} /> Issue to Production Job
              </button>
              <button className={`tab-pill ${issueType === 'return' ? 'active' : ''}`} onClick={() => setIssueType('return')}>
                <ArrowDownLeft size={14} /> Return to Store
              </button>
            </div>

            {/* Searchable Stock Selector */}
            <div className="form-group">
              <label>Search & Select Inventory Stock Item *</label>
              <input 
                type="text"
                className="form-control"
                style={{ marginBottom: '8px' }}
                placeholder="🔍 Search film, micron, width, bay or ID..."
                value={stockSearchTerm}
                onChange={e => setStockSearchTerm(e.target.value)}
              />
              <select className="form-control" value={selectedInvItem?.id} onChange={e => setSelectedInvItem(inventory.find(i => i.id === e.target.value))}>
                {inventory.filter(i => {
                  const s = (stockSearchTerm || '').toLowerCase();
                  const filmType = (i.filmType || '').toLowerCase();
                  const itemName = (i.itemName || '').toLowerCase();
                  const id = (i.id || '').toLowerCase();
                  const loc = (i.location || '').toLowerCase();
                  return filmType.includes(s) ||
                    itemName.includes(s) ||
                    id.includes(s) ||
                    `${i.micron || ''}`.includes(s) ||
                    `${i.widthMm || ''}`.includes(s) ||
                    loc.includes(s);
                }).map(i => (
                  <option key={i.id} value={i.id}>
                    {i.id} - {i.itemName || `${i.filmType} ${i.micron}µ (${i.widthMm}mm)`} | Location: {i.location} | Avail: {i.availableQtyKg}{i.unit || 'kg'}
                  </option>
                ))}
              </select>
            </div>

            {issueType === 'issue' && (
              <div className="form-group">
                <label>Production Job Name *</label>
                <select className="form-control" value={issueJobName} onChange={e => setIssueJobName(e.target.value)}>
                  {orders.map(o => <option key={o.id} value={o.jobName}>{o.jobName} ({o.id})</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Quantity in Kg *</label>
              <input type="number" className="form-control" value={issueQtyKg} onChange={e => setIssueQtyKg(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setIsIssueModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleIssueReturnSubmit}>
                Submit {issueType === 'issue' ? 'Material Issue' : 'Material Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Stock Item */}
      {editingStockItem && (
        <div className="modal-overlay" onClick={() => setEditingStockItem(null)}>
          <div className="glass-card modal-content" style={{ width: '580px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit3 size={20} style={{ color: 'var(--primary-brand)' }} /> Edit Inventory Stock Item ({editingStockItem.id})
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Update stock quantities, substrate specifications, location bay, or reorder warnings.
            </p>

            <form onSubmit={handleSaveStockEdit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Film Substrate *</label>
                  <select 
                    className="form-control"
                    value={editFilmType}
                    onChange={e => setEditFilmType(e.target.value)}
                  >
                    {Object.keys(FILM_DENSITIES).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Micron Gauge (µ) *</label>
                  <input 
                    type="number" 
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
                    className="form-control"
                    required
                    value={editWidthMm}
                    onChange={e => setEditWidthMm(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Warehouse Location Bay *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    required
                    placeholder="e.g. Bay A - Rack 3"
                    value={editLocation}
                    onChange={e => setEditLocation(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Available Stock Qty (Kg) *</label>
                  <input 
                    type="number" 
                    className="form-control"
                    required
                    value={editAvailableQtyKg}
                    onChange={e => setEditAvailableQtyKg(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Allocated to Jobs Qty (Kg)</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={editAllocatedQtyKg}
                    onChange={e => setEditAllocatedQtyKg(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Low Stock Warning Threshold (Kg)</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={editReorderLevelKg}
                    onChange={e => setEditReorderLevelKg(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingStockItem(null)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> Save Stock Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Raw Material Stock Ledger & Barcode Tracking Modal */}
      {selectedItemForPurchaseHistory && (() => {
        const item = selectedItemForPurchaseHistory;
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
          const rate = g.purchaseRatePerKg || DEFAULT_DAILY_RATES[g.filmType] || 120;
          const qty = g.netWeightKg || 0;
          return {
            txId,
            category: 'inward',
            type: g.status === 'Approved' ? '📥 GRN Inward (Approved)' : '📥 GRN Inward (Pending QC)',
            date: g.receivedDate || '2026-07-24',
            refNo: g.grnNo,
            subRef: g.poNumber ? `PO: ${g.poNumber}` : 'Direct Receipt',
            partyName: g.vendorName || 'Supplier',
            subParty: g.invoiceNo ? `Inv: ${g.invoiceNo}` : 'Vendor Receipt',
            inwardQtyKg: qty,
            outwardQtyKg: 0,
            adjQtyKg: 0,
            ratePerKg: rate,
            totalValue: qty * rate,
            barcode: customBarcodesMap[txId] || g.batchNo || `BAR-GRN-${g.grnNo}`,
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
              const rate = mat.unitPricePerKg || DEFAULT_DAILY_RATES[item.filmType] || 120;
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
                totalValue: qty * rate,
                barcode: customBarcodesMap[txId] || mat.barcode || `BAR-JOB-${(rec.orderId || '89').replace('ORD-2026-', '')}`,
                status: rec.status || 'Consumed in Production',
                notes: `Gross Issued: ${mat.issueQtyKg || 0} ${unitStr} | Returned: ${mat.returnQtyKg || 0} ${unitStr} | Net: ${qty} ${unitStr}`
              });
            }
          });
        });

        // 3. Gather Manual Store Issues & Returns
        const storeIssueLines = (storeIssueTransactions || [])
          .filter(tx => isItemMatch(tx, item))
          .map(tx => {
            const isIssue = tx.issueType === 'issue';
            const qty = tx.qtyKg || 0;
            const rate = DEFAULT_DAILY_RATES[item.filmType] || 120;
            return {
              txId: tx.id,
              category: isIssue ? 'usage' : 'inward',
              type: isIssue ? '📤 Store Issue' : '📥 Store Return',
              date: tx.date || '2026-07-25',
              refNo: tx.jobName || (isIssue ? 'Store Issue' : 'Store Return'),
              subRef: `Req: ${tx.id}`,
              partyName: tx.issuedBy || 'Store Mgr Dilip Joshi',
              subParty: isIssue ? 'Shopfloor Requisition' : 'Store Return',
              inwardQtyKg: isIssue ? 0 : qty,
              outwardQtyKg: isIssue ? qty : 0,
              adjQtyKg: 0,
              ratePerKg: rate,
              totalValue: qty * rate,
              barcode: customBarcodesMap[tx.id] || tx.barcode || `BAR-TX-${tx.id}`,
              status: isIssue ? 'Issued' : 'Returned',
              notes: tx.notes || (isIssue ? 'Manual shopfloor issue' : 'Unused stock returned')
            };
          });

        // 4. Gather Physical Reconciliation & Quick Adjustments
        const adjLines = (stockLedgerAdjustments || [])
          .filter(a => isItemMatch(a, item))
          .map(a => {
            const txId = `ADJ_${a.id}`;
            const qty = a.qtyKg || 0;
            const rate = DEFAULT_DAILY_RATES[item.filmType] || 120;
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
          ratePerKg: DEFAULT_DAILY_RATES[item.filmType] || 120,
          totalValue: openingStockQty * (DEFAULT_DAILY_RATES[item.filmType] || 120),
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

        // Summary Calculations
        const totalPurchasedQty = inwardTxLines.reduce((sum, tx) => sum + tx.inwardQtyKg, 0) + openingStockQty;
        const totalSpendRs = inwardTxLines.reduce((sum, tx) => sum + tx.totalValue, 0) + (openingStockQty * (DEFAULT_DAILY_RATES[item.filmType] || 120));
        const avgPurchaseRate = totalPurchasedQty > 0 ? (totalSpendRs / totalPurchasedQty) : (DEFAULT_DAILY_RATES[item.filmType] || 120);

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
                    Item: <strong>{item.itemName || `${item.filmType} Film`} {item.micron && item.micron !== '-' ? `(${item.micron}µ x ${item.widthMm}mm)` : ''}</strong> | Code: <code>{item.itemCode || item.id}</code> | Category: <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{item.category || 'Film Substrates'}</span> | Location: {item.location || 'Store Bay'} | Unit: {unitStr}
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
                    {displayLines.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                          No transaction records found matching the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      displayLines.map((tx, idx) => {
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

            </div>
          </div>
        );
      })()}

      {/* Modal: Quick Vendor Onboarding (from GRN Modal) */}
      {isVendorModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 110 }} onClick={() => setIsVendorModalOpen(false)}>
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
        <div className="modal-overlay" style={{ zIndex: 115 }} onClick={() => setIsNewDispatchModalOpen(false)}>
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
                      const matchedOrder = orders.find(o => o.jobName === e.target.value);
                      if (matchedOrder) setDispatchClientName(matchedOrder.clientName);
                    }}
                  >
                    {orders.map(o => (
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
                        <td style={{ fontFamily: 'monospace', color: '#2563eb' }}>{r.barcodeId}</td>
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

