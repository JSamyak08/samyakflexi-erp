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
  FileText
} from 'lucide-react';
import GRNPDF from './GRNPDF';
import WeighingScaleInput from './WeighingScaleInput';
import BarcodePrinterModal from './BarcodePrinterModal';
import DispatchPackingListPDF from './DispatchPackingListPDF';
import { 
  isReconciliationDue, 
  FILM_DENSITIES, 
  generateBarcodeId, 
  generateVendorId,
  initialInventoryRolls, 
  initialDispatchShipments 
} from '../factoryStore';

export default function InventoryManagement({ 
  inventory, 
  grns, 
  vendors, 
  orders, 
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

  // Issue / Return Modal state
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueType, setIssueType] = useState('issue'); // issue or return
  const [selectedInvItem, setSelectedInvItem] = useState(inventory[0] || null);
  const [issueQtyKg, setIssueQtyKg] = useState(100);
  const [issueJobName, setIssueJobName] = useState(orders[0]?.jobName || '');
  const [stockSearchTerm, setStockSearchTerm] = useState('');

  // Inward GRN Form State
  const [grnVendor, setGrnVendor] = useState(vendors[0]?.companyName || '');
  const [grnPoNo, setGrnPoNo] = useState('PO-2026-042');
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnFilmType, setGrnFilmType] = useState('PET');
  const [grnMicron, setGrnMicron] = useState(12);
  const [grnWidthMm, setGrnWidthMm] = useState(1000);
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

  const isRecDue = isReconciliationDue("2026-07-24");

  // Inward GRN Submit
  const handleSaveGRN = (e) => {
    e.preventDefault();
    if (!grnInvoiceNo.trim() || !grnBatchNo.trim()) {
      alert("Invoice Number and Batch Number are required!");
      return;
    }

    const newGRN = {
      grnNo: `GRN-2026-${Math.floor(100 + Math.random() * 900)}`,
      poNumber: grnPoNo,
      vendorName: grnVendor,
      invoiceNo: grnInvoiceNo,
      receivedDate: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      filmType: grnFilmType,
      micron: parseFloat(grnMicron),
      widthMm: parseFloat(grnWidthMm),
      rollsReceived: parseInt(grnRolls),
      netWeightKg: parseFloat(grnWeightKg),
      batchNo: grnBatchNo,
      status: "Pending QC", // Goes to QC
      qcNotes: "",
      inspectedBy: "",
      storeManager: "Store Mgr Dilip Joshi"
    };

    if (onAddGRN) {
      onAddGRN(newGRN);
    }

    // Generate Raw Material Barcode Roll (Scale #1 Inward Station)
    const newRoll = {
      barcodeId: generateBarcodeId('RM-BC'),
      rollType: 'RAW_MATERIAL',
      itemId: `INV-${Math.floor(100 + Math.random() * 900)}`,
      itemName: `${grnFilmType} ${grnMicron}µ (${grnWidthMm}mm)`,
      category: 'Film',
      micron: parseFloat(grnMicron),
      widthMm: parseFloat(grnWidthMm),
      inwardDatetime: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      vendorName: grnVendor,
      invoiceNo: grnInvoiceNo,
      batchNo: grnBatchNo,
      netWeightKg: parseFloat(grnWeightKg),
      availableWeightKg: parseFloat(grnWeightKg),
      stationId: 'SCALE_1_INWARD',
      locationBay: 'Bay A',
      status: 'In Stock'
    };

    if (onAddRoll) {
      onAddRoll(newRoll);
    }

    setIsNewGRNModalOpen(false);
    setSelectedRollForBarcodeModal(newRoll);
    alert(`GRN ${newGRN.grnNo} created! Raw Material Barcode ${newRoll.barcodeId} generated. Print thermal sticker label now.`);
  };

  // QC Approval / Rejection
  const handleQCAction = (status) => {
    if (!qcInspectingGRN) return;

    const updatedGRN = {
      ...qcInspectingGRN,
      status,
      qcNotes: qcNotesInput || (status === 'Approved' ? 'Inspected and passed all laboratory parameters.' : 'Rejected due to gauge variation.'),
      inspectedBy: 'QC Chemist Ramesh Kumar'
    };

    if (onUpdateGRN) {
      onUpdateGRN(updatedGRN);
    }

    // If Approved, automatically add stock to Inventory!
    if (status === 'Approved' && onUpdateInventory) {
      const existingInvIndex = inventory.findIndex(
        i => i.filmType === updatedGRN.filmType && i.micron === updatedGRN.micron && i.widthMm === updatedGRN.widthMm
      );

      if (existingInvIndex >= 0) {
        const updatedInv = [...inventory];
        updatedInv[existingInvIndex].availableQtyKg += updatedGRN.netWeightKg;
        updatedInv[existingInvIndex].lastVendor = updatedGRN.vendorName;
        updatedInv[existingInvIndex].lastBatch = updatedGRN.batchNo;
        onUpdateInventory(updatedInv);
      } else {
        const newInvItem = {
          id: `INV-00${inventory.length + 1}`,
          filmType: updatedGRN.filmType,
          micron: updatedGRN.micron,
          widthMm: updatedGRN.widthMm,
          density: FILM_DENSITIES[updatedGRN.filmType] || 1.0,
          availableQtyKg: updatedGRN.netWeightKg,
          allocatedQtyKg: 0,
          location: "Bay A - Inward Dock",
          reorderLevelKg: 1000,
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

  // Issue / Return Submit
  const handleIssueReturnSubmit = () => {
    if (!selectedInvItem || issueQtyKg <= 0) return;

    const qty = parseFloat(issueQtyKg);
    let updatedInv = [...inventory];
    const idx = updatedInv.findIndex(i => i.id === selectedInvItem.id);

    if (idx >= 0) {
      if (issueType === 'issue') {
        if (updatedInv[idx].availableQtyKg < qty) {
          alert(`Insufficient available stock! Only ${updatedInv[idx].availableQtyKg} kg available.`);
          return;
        }
        updatedInv[idx].availableQtyKg -= qty;
        updatedInv[idx].allocatedQtyKg += qty;
        alert(`Issued ${qty} kg of ${updatedInv[idx].filmType} ${updatedInv[idx].micron}µ to Job: ${issueJobName}`);
      } else {
        updatedInv[idx].availableQtyKg += qty;
        if (updatedInv[idx].allocatedQtyKg >= qty) {
          updatedInv[idx].allocatedQtyKg -= qty;
        }
        alert(`Returned ${qty} kg of ${updatedInv[idx].filmType} ${updatedInv[idx].micron}µ back to Store Inventory.`);
      }

      if (onUpdateInventory) {
        onUpdateInventory(updatedInv);
      }
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

  // Commit Reconciliation Variances to System Stock
  const handleCommitReconciliation = () => {
    let updatedInv = inventory.map(item => {
      const physicalQty = physicalCounts[item.id];
      if (physicalQty !== undefined && !isNaN(physicalQty)) {
        return {
          ...item,
          availableQtyKg: parseFloat(physicalQty)
        };
      }
      return item;
    });

    if (onUpdateInventory) {
      onUpdateInventory(updatedInv);
    }
    alert("Monthly Physical Stock Reconciliation completed successfully! System available stock updated.");
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

  const filteredInventory = inventory.filter(i => 
    i.filmType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
              <input 
                type="text"
                className="form-control"
                style={{ paddingLeft: '38px' }}
                placeholder="Search film type or rack bay..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
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
                Total Stock Volume: <b>{inventory.reduce((a, b) => a + b.availableQtyKg, 0).toLocaleString()} kg</b>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Film Substrate</th>
                  <th>Micron (µ)</th>
                  <th>Width (mm)</th>
                  <th>Density</th>
                  <th>Available Stock (Kg)</th>
                  <th>Allocated to Jobs (Kg)</th>
                  <th>Location Bay</th>
                  <th>Last Supplier & Batch</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map(item => {
                  const isLow = item.availableQtyKg <= item.reorderLevelKg;
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
                          {item.filmType} Film ({item.micron}µ x {item.widthMm}mm)
                        </button>
                      </td>
                      <td>{item.micron} µ</td>
                      <td>{item.widthMm} mm</td>
                      <td>{item.density}</td>
                      <td style={{ fontSize: '1.1rem', fontWeight: '800', color: isLow ? '#ef4444' : '#34d399' }}>
                        {item.availableQtyKg.toLocaleString()} kg
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{item.allocatedQtyKg.toLocaleString()} kg</td>
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
      {activeTab === 'reconciliation' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
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

          {/* Variance Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Film Substrate</th>
                  <th>Micron & Width</th>
                  <th>System Stock (Kg)</th>
                  <th>Physical Count (Kg)</th>
                  <th>Variance (Kg)</th>
                  <th>Variance Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map(item => {
                  const physicalVal = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.availableQtyKg;
                  const diff = physicalVal - item.availableQtyKg;

                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: '700', color: 'var(--accent-color)' }}>{item.id}</td>
                      <td style={{ fontWeight: '600' }}>{item.filmType} Film</td>
                      <td>{item.micron}µ / {item.widthMm}mm</td>
                      <td style={{ fontWeight: '700' }}>{item.availableQtyKg} kg</td>
                      <td style={{ width: '160px' }}>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '6px' }}
                          value={physicalVal}
                          onChange={e => setPhysicalCounts({ ...physicalCounts, [item.id]: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td style={{ fontWeight: '800', color: diff === 0 ? 'var(--text-secondary)' : diff > 0 ? 'var(--success)' : '#ef4444' }}>
                        {diff > 0 ? `+${diff.toFixed(1)} kg` : `${diff.toFixed(1)} kg`}
                      </td>
                      <td>
                        {diff === 0 ? (
                          <span className="badge badge-us">MATCHED</span>
                        ) : diff > 0 ? (
                          <span className="badge badge-both">+ GAIN</span>
                        ) : (
                          <span className="badge badge-warning" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            - SHORTAGE (LOSS)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" style={{ padding: '12px 24px', fontSize: '1rem' }} onClick={handleCommitReconciliation}>
              <CheckCircle2 size={18} /> Commit Reconciliation & Update System Stock
            </button>
          </div>
        </div>
      )}

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

                <div className="form-group">
                  <label>Ref PO Number</label>
                  <input type="text" className="form-control" value={grnPoNo} onChange={e => setGrnPoNo(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Vendor Invoice Number *</label>
                  <input type="text" className="form-control" required placeholder="e.g. INV-FP-9904" value={grnInvoiceNo} onChange={e => setGrnInvoiceNo(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Manufacturer Batch / Heat # *</label>
                  <input type="text" className="form-control" required placeholder="e.g. BATCH-PET-991" value={grnBatchNo} onChange={e => setGrnBatchNo(e.target.value)} />
                </div>

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
                  <input type="number" className="form-control" required value={grnWeightKg} onChange={e => setGrnWeightKg(e.target.value)} />
                </div>
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
                {inventory.filter(i => 
                  i.filmType.toLowerCase().includes(stockSearchTerm.toLowerCase()) ||
                  i.id.toLowerCase().includes(stockSearchTerm.toLowerCase()) ||
                  `${i.micron}`.includes(stockSearchTerm) ||
                  `${i.widthMm}`.includes(stockSearchTerm) ||
                  i.location.toLowerCase().includes(stockSearchTerm.toLowerCase())
                ).map(i => (
                  <option key={i.id} value={i.id}>
                    {i.id} - {i.filmType} {i.micron}µ ({i.widthMm}mm) | Location: {i.location} | Avail: {i.availableQtyKg}kg
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
      {/* Item GRN Purchase History Modal */}
      {selectedItemForPurchaseHistory && (() => {
        const item = selectedItemForPurchaseHistory;
        // Filter matching GRNs by filmType (and micron/width if available)
        const matchingGRNs = grns.filter(g => 
          g.filmType.toLowerCase() === item.filmType.toLowerCase()
        );

        const totalPurchasedKg = matchingGRNs.reduce((sum, g) => sum + (g.netWeightKg || 0), 0);
        const totalSpendRs = matchingGRNs.reduce((sum, g) => sum + ((g.netWeightKg || 0) * (g.purchaseRatePerKg || 120)), 0);
        const avgPurchaseRate = totalPurchasedKg > 0 ? (totalSpendRs / totalPurchasedKg) : 0;

        return (
          <div className="modal-overlay" onClick={() => setSelectedItemForPurchaseHistory(null)}>
            <div className="modal-content" style={{ maxWidth: '850px', width: '90%' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock style={{ color: '#2563eb' }} /> GRN Purchase & Receipt History
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Item: <strong>{item.filmType} Film ({item.micron}µ x {item.widthMm}mm)</strong>
                  </p>
                </div>
                <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedItemForPurchaseHistory(null)}>✕ Close</button>
              </div>

              {/* Summary Metrics Banner */}
              <div className="glass-card" style={{ background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', padding: '16px', marginBottom: '20px' }}>
                <div>
                  <span className="stats-title">Historical Purchased Qty</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                    {totalPurchasedKg > 0 ? `${totalPurchasedKg.toLocaleString()} kg` : `${item.availableQtyKg.toLocaleString()} kg`}
                  </div>
                </div>

                <div>
                  <span className="stats-title">Avg Purchase Rate</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#2563eb', marginTop: '4px' }}>
                    ₹ {avgPurchaseRate > 0 ? avgPurchaseRate.toFixed(2) : (DEFAULT_DAILY_RATES[item.filmType] || 120).toFixed(2)} / kg
                  </div>
                </div>

                <div>
                  <span className="stats-title">Total Spend Value</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>
                    ₹ {totalSpendRs > 0 ? totalSpendRs.toLocaleString(undefined, { minimumFractionDigits: 2 }) : (item.availableQtyKg * (DEFAULT_DAILY_RATES[item.filmType] || 120)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Date-wise GRN Purchase Table */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '12px', color: 'var(--text-primary)' }}>
                📅 Inward Receipt Entries (Date-Wise)
              </h4>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>GRN No / Ref PO</th>
                    <th>Vendor Name</th>
                    <th>Invoice No</th>
                    <th>Qty Received</th>
                    <th>Purchase Rate</th>
                    <th>Total Value (₹)</th>
                    <th>Batch & Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingGRNs.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textCenter: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No past GRN inward records found for this specific film type.
                      </td>
                    </tr>
                  ) : (
                    matchingGRNs.map((g, idx) => {
                      const rate = g.purchaseRatePerKg || DEFAULT_DAILY_RATES[g.filmType] || 120;
                      const val = (g.netWeightKg || 0) * rate;
                      return (
                        <tr key={idx}>
                          <td style={{ fontSize: '0.85rem' }}>{g.receivedDate}</td>
                          <td>
                            <div style={{ fontWeight: '700', color: '#2563eb' }}>{g.grnNo}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{g.poNumber}</div>
                          </td>
                          <td style={{ fontWeight: '600' }}>{g.vendorName}</td>
                          <td>{g.invoiceNo || 'N/A'}</td>
                          <td style={{ fontWeight: '700' }}>{g.netWeightKg.toLocaleString()} kg <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({g.rollsReceived} rolls)</span></td>
                          <td style={{ fontWeight: '700', color: '#2563eb' }}>₹ {rate.toFixed(2)}</td>
                          <td style={{ fontWeight: '700', color: '#047857' }}>₹ {val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td>
                            <code style={{ fontSize: '0.75rem' }}>{g.batchNo}</code>
                            <div style={{ marginTop: '2px' }}>
                              {g.status === 'Approved' ? (
                                <span className="badge badge-us" style={{ fontSize: '0.7rem' }}>Approved</span>
                              ) : (
                                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Pending QC</span>
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

