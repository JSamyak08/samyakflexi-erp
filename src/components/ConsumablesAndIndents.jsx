import React, { useState, useMemo } from 'react';
import { 
  ClipboardList, 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Search, 
  Filter, 
  RotateCcw, 
  Printer, 
  ArrowDownToLine, 
  Cpu, 
  SlidersHorizontal, 
  Layers, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  Building2, 
  User, 
  FileText,
  X,
  Edit,
  Trash2,
  Check,
  Zap,
  TrendingDown,
  Wrench,
  Droplets,
  Container,
  Lock,
  DollarSign,
  ShoppingBag,
  Settings
} from 'lucide-react';
import PurchaseOrderPDF from './PurchaseOrderPDF';
import { notifyPurchaseIndentCreated, notifyPurchaseOrderIssued, notifyLowStockAlert } from '../services/emailService';
import { generateDocRefNumber, getDocumentTerms } from '../services/settingsService';
import TablePagination, { usePagination } from './TablePagination';

// Default Plant Machine List for flexible packaging operations
export const PLANT_MACHINES = [
  "Printing Press 1 (8-Color Rotogravure)",
  "Printing Press 2 (6-Color Rotogravure)",
  "Solventless Laminator (Nordmeccanica)",
  "Combi Laminator (Solvent-based / Solventless)",
  "High-Speed Slitting Machine 1",
  "High-Speed Slitting Machine 2",
  "Center-Seal Pouch Machine 1",
  "Three-Side Seal Pouch Machine 2",
  "Doctoring & Inspection Rewinder",
  "Maintenance & Utility Workshop",
  "General Factory & Store"
];

// Initial Consumables & Spare Parts Store Items
// PRODUCTION: No seed data. All consumable, indent, and issue records come from Supabase.
export const initialConsumablesStore = [];
export const initialMaterialIndents = [];
export const initialMachineIssues = [];

export default function ConsumablesAndIndents({ 
  userRole = "Admin",
  userName = "Samyak Jain",
  vendors = [],
  orders = [],
  onAddPO,
  machines = [],     // Live printing machines from Printing Presses & Machine Settings
  consumables = [],
  onUpdateConsumables,
  indents = [],
  onUpdateIndents,
  machineIssues = [],
  onUpdateMachineIssues
}) {
  // Navigation Sub-Tabs: "store" (Consumables Store) | "indents" (Material Indents & Requisitions) | "issues" (Machine Issue Audit Log)
  const [activeSubTab, setActiveSubTab] = useState("store");

  // Role-Based Admin Permission Check for Issuing Purchase Orders
  const isAdminRole = useMemo(() => {
    if (!userRole) return false;
    const role = String(userRole).toLowerCase().trim();
    return role.includes('admin') || role.includes('plant') || role.includes('director') || role.includes('manager') || role.includes('super');
  }, [userRole]);

  // Vendors List Fallback
  const availableVendors = useMemo(() => {
    if (vendors && vendors.length > 0) return vendors;
    return initialVendors;
  }, [vendors]);

  // ─── Dynamic Machine List ────────────────────────────────────────────────────
  // Sourced from the live machines list (Printing Presses & Machine Settings → Supabase).
  // Entry point: Settings (Letterhead & Signature Settings → Plant Machine Directory)
  //              or: Printing Machine Scheduler → Machine Settings tab.
  const dynamicMachineList = useMemo(() => {
    if (machines && machines.length > 0) {
      return machines.map(m => m.name).filter(Boolean);
    }
    // Fallback when no machines are loaded yet
    return [
      'Printing Press 1 (8-Color Rotogravure)',
      'Printing Press 2 (6-Color Rotogravure)',
      'Solventless Laminator (Nordmeccanica)',
      'Combi Laminator (Solvent-based / Solventless)',
      'High-Speed Slitting Machine 1',
      'High-Speed Slitting Machine 2',
      'Center-Seal Pouch Machine 1',
      'Three-Side Seal Pouch Machine 2',
      'Doctoring & Inspection Rewinder',
      'Maintenance & Utility Workshop',
      'General Factory & Store'
    ];
  }, [machines]);

  // ─── Lifted State Setters (Write-through to DB) ───────────────────────────────
  const setConsumables = (val) => {
    if (onUpdateConsumables) {
      if (typeof val === 'function') {
        onUpdateConsumables(val(consumables));
      } else {
        onUpdateConsumables(val);
      }
    }
  };

  const setIndents = (val) => {
    if (onUpdateIndents) {
      if (typeof val === 'function') {
        onUpdateIndents(val(indents));
      } else {
        onUpdateIndents(val);
      }
    }
  };

  const setMachineIssues = (val) => {
    if (onUpdateMachineIssues) {
      if (typeof val === 'function') {
        onUpdateMachineIssues(val(machineIssues));
      } else {
        onUpdateMachineIssues(val);
      }
    }
  };


  // Filters State for Consumables Store
  const [searchTerm, setSearchTerm] = useState("");
  const [machineFilter, setMachineFilter] = useState("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Modal Controls
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedItemForIssue, setSelectedItemForIssue] = useState(null);
  
  const [isIndentModalOpen, setIsIndentModalOpen] = useState(false);
  const [selectedIndentForPrint, setSelectedIndentForPrint] = useState(null);
  
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [selectedItemForRestock, setSelectedItemForRestock] = useState(null);

  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);

  // Purchase Order Generation Modal Controls (Admin Restricted)
  const [isRaisePOModalOpen, setIsRaisePOModalOpen] = useState(false);
  const [targetIndentForPO, setTargetIndentForPO] = useState(null);
  const [targetItemForPO, setTargetItemForPO] = useState(null);

  // Form State for PO Generation
  const [poNumber, setPoNumber] = useState("");
  const [selectedVendorName, setSelectedVendorName] = useState("");
  const [poQty, setPoQty] = useState(100);
  const [poUnitPrice, setPoUnitPrice] = useState(100);
  const [poGstPct, setPoGstPct] = useState(18);
  const [poDeliveryDate, setPoDeliveryDate] = useState("");
  const [poPaymentTerms, setPoPaymentTerms] = useState("30 Days Net");
  const [poTermsAndConditions, setPoTermsAndConditions] = useState("");
  const [poRemarks, setPoRemarks] = useState("");

  // PO PDF Viewer Modal State
  const [activePOData, setActivePOData] = useState(null);

  // Handle Open Raise PO Modal from Indent (Admin Restricted)
  const handleOpenRaisePO = (indent, itemRow = null) => {
    if (!isAdminRole) {
      alert(`Access Restricted!\n\nPermission to issue Purchase Orders directly from Material Indents is restricted strictly to the Admin / Plant Manager role.\n\nYour current logged-in role is: "${userRole}". Please contact Admin to issue POs.`);
      return;
    }

    setTargetIndentForPO(indent);
    const item = itemRow || (indent.items && indent.items[0]) || {};
    setTargetItemForPO(item);

    // Auto-generate PO Number using settingsService doc reference generator
    const nextPoNum = generateDocRefNumber('po');
    setPoNumber(nextPoNum);

    // Prefill Quantity
    const qty = parseFloat(item.reqQty || item.qty || 100);
    setPoQty(qty);

    // Find matching item in Consumables store for unit cost prefill
    const itemTitle = (item.name || item.itemName || '').toLowerCase();
    const matchedStoreItem = consumables.find(c => c.name.toLowerCase().includes(itemTitle));
    const unitPrice = matchedStoreItem ? matchedStoreItem.unitCost : (item.unitCost || 250);
    setPoUnitPrice(unitPrice);

    // Pre-select Vendor from database matching category or name
    const list = availableVendors;
    const cat = (item.category || '').toLowerCase();
    let matchedVendor = list.find(v => (v.companyName || '').toLowerCase().includes('siegwerk') && cat.includes('ink'));
    if (!matchedVendor) matchedVendor = list.find(v => (v.companyName || '').toLowerCase().includes('henkel') && cat.includes('adhesive'));
    if (!matchedVendor) matchedVendor = list.find(v => (v.companyName || '').toLowerCase().includes('mdc') && cat.includes('blade'));
    if (!matchedVendor) matchedVendor = list.find(v => (v.companyName || '').toLowerCase().includes('flexipoly') || (v.companyName || '').toLowerCase().includes('malwa'));
    if (!matchedVendor) matchedVendor = list[0];

    setSelectedVendorName(matchedVendor ? matchedVendor.companyName : (list[0]?.companyName || "Siegwerk Inks Ltd"));

    // Pre-fill Target Delivery Date (7 days from today)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    setPoDeliveryDate(targetDate.toISOString().split('T')[0]);

    // Pre-fill Terms & Conditions from settingsService
    const savedTerms = getDocumentTerms();
    setPoPaymentTerms(savedTerms.paymentTerms || "30 Days Net from date of acceptance");
    const termsText = (savedTerms.poTerms || [
      "1. Material subject to quality inspection & lab clearance on receipt at factory.",
      "2. Official Tax Invoice with GSTIN & HSN/SAC codes mandatory along with delivery challan.",
      "3. Payment 30 Days Net from date of material acceptance.",
      "4. Delivery at Samyak International Ltd, Sector III Pithampur (MP)."
    ]).join('\n');
    setPoTermsAndConditions(termsText);

    setPoRemarks(`Material Purchase Order raised against Requisition Indent ${indent.indentNo}`);
    setIsRaisePOModalOpen(true);
  };

  // Submit Purchase Order
  const handleConfirmIssuePO = (e) => {
    e.preventDefault();
    if (!selectedVendorName) {
      alert("Please select a Vendor from the dropdown to issue the Purchase Order.");
      return;
    }

    const qty = parseFloat(poQty) || 0;
    const price = parseFloat(poUnitPrice) || 0;
    const totalTaxable = qty * price;
    const gstRate = parseFloat(poGstPct) || 18;
    const gstAmt = (totalTaxable * gstRate) / 100;
    const totalAmount = totalTaxable + gstAmt;

    const vendorObj = availableVendors.find(v => v.companyName === selectedVendorName) || {
      companyName: selectedVendorName,
      contactPerson: "Vendor Representative",
      address: "Pithampur / Indore Industrial Area",
      gstin: "23AABCV00001Z0",
      phone: "+91 98260 00000",
      email: "orders@vendor.com"
    };

    // Update Indent status to "PO Issued"
    setIndents(prev => prev.map(ind => {
      if (ind.id === targetIndentForPO.id) {
        return {
          ...ind,
          status: "PO Issued",
          poNumber: poNumber,
          vendorName: selectedVendorName,
          poDate: new Date().toISOString().split('T')[0]
        };
      }
      return ind;
    }));

    // Formatted PO Object for PurchaseOrderPDF viewer & central store
    const poPayload = {
      poNumber: poNumber,
      poDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      deliveryDate: new Date(poDeliveryDate || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      indentNumber: targetIndentForPO ? targetIndentForPO.indentNo : "IND-2026-001",
      paymentTerms: poPaymentTerms,
      logisticDetails: "Freight Included to Pithampur Factory",
      vendor: vendorObj,
      items: [
        {
          id: 1,
          description: targetItemForPO ? (targetItemForPO.name || targetItemForPO.itemName) : "Material Requisition Consumable",
          itemId: targetItemForPO?.itemCode || "CON-MAT-001",
          make: targetItemForPO?.category || "Factory Supply",
          hsnCode: "3215",
          qtyKg: qty,
          rate: price,
          cgstRate: gstRate / 2,
          sgstRate: gstRate / 2,
          totalAmount: totalAmount
        }
      ]
    };

    if (onAddPO) {
      onAddPO(poPayload);
    }

    notifyPurchaseOrderIssued({
      poNumber: poNumber,
      supplierName: selectedVendorName,
      indentNumber: targetIndentForPO ? targetIndentForPO.indentNo : "IND-2026-001",
      itemName: targetItemForPO ? (targetItemForPO.name || targetItemForPO.itemName) : "Material Requisition Consumable",
      qty: qty,
      unit: 'kg',
      totalAmount: totalAmount
    }, vendorObj?.email || 'purchase@samyakinternational.in').catch(err => console.error("PO email notification error:", err));

    setIsRaisePOModalOpen(false);
    setActivePOData(poPayload); // Open PO PDF viewer immediately!
    alert(`Purchase Order ${poNumber} issued successfully to ${selectedVendorName}!\n\nEmail notification sent to vendor (${vendorObj?.email || 'purchase@samyakinternational.in'}).`);
  };

  // New Issue Form Data
  const [issueMachine, setIssueMachine] = useState('');
  const [issueQty, setIssueQty] = useState(1);
  const [issueOperator, setIssueOperator] = useState("");
  const [issueShift, setIssueShift] = useState("Morning Shift (A)");
  const [issueRemarks, setIssueRemarks] = useState("");
  const [issueIndentRef, setIssueIndentRef] = useState("DIRECT-STORE-ISSUE");

  // New Restock Form Data
  const [restockQty, setRestockQty] = useState(50);
  const [restockRemarks, setRestockRemarks] = useState("");

  // New Item Form Data
  const [newItemName, setNewItemName] = useState("");
  const [newItemCode, setNewItemCode] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("Chemicals & Solvents");
  const [newItemUnit, setNewItemUnit] = useState("Kg");
  const [newItemStock, setNewItemStock] = useState(100);
  const [newItemMinReserve, setNewItemMinReserve] = useState(50);
  const [newItemUnitCost, setNewItemUnitCost] = useState(250);
  const [newItemMachine, setNewItemMachine] = useState('');
  const [newItemLocation, setNewItemLocation] = useState("Store Shelf A");

  // New Indent Form Data
  const [indentPriority, setIndentPriority] = useState("High");
  const [indentDept, setIndentDept] = useState("Production & Printing");
  const [indentRemarks, setIndentRemarks] = useState("");
  const [indentLineItems, setIndentLineItems] = useState([
    { id: 1, itemName: "Ethyl Acetate Solvent (99.8% Purity)", category: "Chemicals & Solvents", unit: "Litres", reqQty: 200, targetMachine: '' }
  ]);

  // Categories list
  const uniqueCategories = useMemo(() => {
    const set = new Set(consumables.map(c => c.category).filter(Boolean));
    return Array.from(set);
  }, [consumables]);

  // Low stock calculation
  const lowStockItemsCount = useMemo(() => {
    return (consumables || []).filter(c => c.currentStock <= c.minReserve).length;
  }, [consumables]);

  // CRITICAL SORTING & FILTERING RULE:
  // Items falling below minimum reserve level MUST automatically come to the TOP of the list!
  const sortedAndFilteredConsumables = useMemo(() => {
    return (consumables || []).filter(c => {
      // Search term
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || 
        c.name.toLowerCase().includes(search) || 
        c.itemCode.toLowerCase().includes(search) ||
        c.category.toLowerCase().includes(search) ||
        c.location.toLowerCase().includes(search);

      // Machine Filter
      const matchesMachine = machineFilter === "ALL" || c.assignedMachine === machineFilter || c.assignedMachine === "All Printing Presses" || c.assignedMachine === "General Factory & Store";

      // Category Filter
      const matchesCategory = categoryFilter === "ALL" || c.category === categoryFilter;

      // Low Stock Filter Toggle
      const isLow = c.currentStock <= c.minReserve;
      const matchesLowStock = !lowStockOnly || isLow;

      return matchesSearch && matchesMachine && matchesCategory && matchesLowStock;
    }).sort((a, b) => {
      // Primary Sort: Low Stock Items (currentStock <= minReserve) COME FIRST!
      const aIsLow = a.currentStock <= a.minReserve;
      const bIsLow = b.currentStock <= b.minReserve;
      if (aIsLow && !bIsLow) return -1;
      if (!aIsLow && bIsLow) return 1;

      // Secondary Sort: Lowest stock percentage first
      const aRatio = a.currentStock / (a.minReserve || 1);
      const bRatio = b.currentStock / (b.minReserve || 1);
      return aRatio - bRatio;
    });
  }, [consumables, searchTerm, machineFilter, categoryFilter, lowStockOnly]);

  const consumablesPagination = usePagination(sortedAndFilteredConsumables, 50);
  const indentsPagination = usePagination(indents, 50);

  // Reset Filters
  const resetStoreFilters = () => {
    setSearchTerm("");
    setMachineFilter("ALL");
    setCategoryFilter("ALL");
    setLowStockOnly(false);
  };

  // Open Issue Stock Modal
  const handleOpenIssueModal = (item) => {
    setSelectedItemForIssue(item);
    setIssueMachine(item.assignedMachine !== "General Factory & Store" && item.assignedMachine !== "All Printing Presses" ? item.assignedMachine : (dynamicMachineList[0] || ''));
    setIssueQty(1);
    setIssueOperator("");
    setIssueShift("Morning Shift (A)");
    setIssueRemarks(`Issued to ${item.assignedMachine}`);
    setIsIssueModalOpen(true);
  };

  // Submit Issue Stock to Machine
  const handleConfirmIssueStock = (e) => {
    e.preventDefault();
    if (!selectedItemForIssue) return;
    const qty = parseFloat(issueQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity to issue.");
      return;
    }

    if (qty > selectedItemForIssue.currentStock) {
      alert(`Cannot issue ${qty} ${selectedItemForIssue.unit}! Current available store stock is only ${selectedItemForIssue.currentStock} ${selectedItemForIssue.unit}.`);
      return;
    }

    // Deduct stock
    setConsumables(prev => prev.map(c => {
      if (c.id === selectedItemForIssue.id) {
        return { ...c, currentStock: c.currentStock - qty };
      }
      return c;
    }));

    // Add Audit Issue Log
    const newIssueRecord = {
      id: `ISS-2026-${Math.floor(100 + Math.random() * 900)}`,
      issueNo: `ISS-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().split('T')[0],
      indentNo: issueIndentRef || "DIRECT-STORE-ISSUE",
      itemName: selectedItemForIssue.name,
      category: selectedItemForIssue.category,
      qtyIssued: qty,
      unit: selectedItemForIssue.unit,
      targetMachine: issueMachine,
      issuedBy: `${userName} (${userRole})`,
      machineOperator: issueOperator || "Shift Operator",
      shift: issueShift,
      remarks: issueRemarks || "Direct Store Machine Issue"
    };

    setMachineIssues(prev => [newIssueRecord, ...prev]);

    setIsIssueModalOpen(false);
    alert(`Successfully issued ${qty} ${selectedItemForIssue.unit} of "${selectedItemForIssue.name}" to ${issueMachine}!`);
  };

  // Confirm Restock Item
  const handleConfirmRestock = (e) => {
    e.preventDefault();
    if (!selectedItemForRestock) return;
    const qty = parseFloat(restockQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid restock quantity.");
      return;
    }

    setConsumables(prev => prev.map(c => {
      if (c.id === selectedItemForRestock.id) {
        return { 
          ...c, 
          currentStock: c.currentStock + qty,
          lastRestocked: new Date().toISOString().split('T')[0]
        };
      }
      return c;
    }));

    setIsRestockModalOpen(false);
    alert(`Added ${qty} ${selectedItemForRestock.unit} to store stock for "${selectedItemForRestock.name}". New Stock: ${selectedItemForRestock.currentStock + qty} ${selectedItemForRestock.unit}.`);
  };

  // Add New Consumable Item
  const handleCreateNewItem = (e) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      alert("Item Name is required!");
      return;
    }

    const newItem = {
      id: `CS-${Math.floor(200 + Math.random() * 800)}`,
      itemCode: newItemCode.trim() || `CON-SP-${Math.floor(100 + Math.random() * 900)}`,
      name: newItemName.trim(),
      category: newItemCategory,
      unit: newItemUnit,
      currentStock: parseFloat(newItemStock) || 0,
      minReserve: parseFloat(newItemMinReserve) || 10,
      unitCost: parseFloat(newItemUnitCost) || 0,
      assignedMachine: newItemMachine,
      location: newItemLocation.trim() || "Store Rack",
      lastRestocked: new Date().toISOString().split('T')[0]
    };

    setConsumables(prev => [newItem, ...prev]);
    setIsNewItemModalOpen(false);

    // Reset Form
    setNewItemName("");
    setNewItemCode("");
    alert(`New Consumable/Spare item "${newItem.name}" added to Store Inventory!`);
  };

  // Submit New Material Indent Requisition
  const handleCreateIndent = (e) => {
    e.preventDefault();
    if (indentLineItems.length === 0) {
      alert("Please add at least one item to the material indent.");
      return;
    }

    const indentId = `IND-2026-${String((indents || []).length + 1).padStart(3, '0')}`;
    const newIndent = {
      id: indentId,
      indentNo: indentId,
      date: new Date().toISOString().split('T')[0],
      priority: indentPriority,
      department: indentDept,
      raisedBy: `${userName} (${userRole})`,
      userRole,
      status: "Pending Approval",
      remarks: indentRemarks || "Store / Plant Material Requisition",
      items: indentLineItems.map(item => ({
        ...item,
        reqQty: parseFloat(item.reqQty) || 1
      }))
    };

    setIndents(prev => [newIndent, ...prev]);
    notifyPurchaseIndentCreated(newIndent).catch(err => console.error("Indent email error:", err));
    setIsIndentModalOpen(false);
    alert(`Material Indent Requisition ${indentId} raised successfully! Pending Plant/Store Manager approval.`);
  };

  // Indent Line Item Handlers
  const addIndentLineItem = () => {
    const defaultConsumable = consumables[0] || {};
    setIndentLineItems(prev => [
      ...prev,
      {
        id: Date.now(),
        itemName: defaultConsumable.name || "Ethyl Acetate Solvent",
        category: defaultConsumable.category || "Chemicals & Solvents",
        unit: defaultConsumable.unit || "Litres",
        reqQty: 100,
        targetMachine: dynamicMachineList[0] || ''
      }
    ]);
  };

  const removeIndentLineItem = (id) => {
    if (indentLineItems.length <= 1) return;
    setIndentLineItems(prev => prev.filter(item => item.id !== id));
  };

  const updateIndentLineItem = (id, field, val) => {
    setIndentLineItems(prev => prev.map(item => {
      if (item.id === id) {
        if (field === 'itemName') {
          const matched = consumables.find(c => c.name === val);
          if (matched) {
            return {
              ...item,
              itemName: matched.name,
              category: matched.category,
              unit: matched.unit,
              targetMachine: matched.assignedMachine !== "General Factory & Store" ? matched.assignedMachine : item.targetMachine
            };
          }
        }
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  // Approve / Reject Indent
  const handleUpdateIndentStatus = (indentId, newStatus) => {
    setIndents(prev => prev.map(ind => {
      if (ind.id === indentId) {
        return { ...ind, status: newStatus };
      }
      return ind;
    }));
    alert(`Indent ${indentId} updated to "${newStatus}".`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ClipboardList style={{ color: 'var(--primary-brand)' }} /> Material Indents & Consumables Store
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Plant store management, machine stock issuance, reserve thresholds & Store / Plant Manager requisition indents.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setIsNewItemModalOpen(true)}
          >
            <Plus size={16} /> Add Store Consumable / Spare
          </button>
          <button 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
            onClick={() => {
              setIndentLineItems([
                { id: Date.now(), itemName: consumables[0]?.name || "Ethyl Acetate Solvent", category: consumables[0]?.category || "Chemicals", unit: consumables[0]?.unit || "Litres", reqQty: 100, targetMachine: dynamicMachineList[0] || '' }
              ]);
              setIsIndentModalOpen(true);
            }}
          >
            <Plus size={18} /> Raise Material Indent
          </button>
        </div>
      </div>

      {/* Main Tab Navigation Buttons */}
      <div className="scrollable-tabs-container">
        <button 
          className={`btn-secondary ${activeSubTab === 'store' ? 'active' : ''}`}
          style={{ 
            padding: '10px 20px', 
            fontSize: '0.9rem', 
            fontWeight: '700',
            borderRadius: '8px 8px 0 0',
            borderBottom: activeSubTab === 'store' ? '3px solid var(--primary-brand)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setActiveSubTab('store')}
        >
          <Package size={18} /> Consumables & Spares Store ({(consumables || []).length})
          {lowStockItemsCount > 0 && (
            <span className="badge badge-danger" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
              {lowStockItemsCount} Low Stock
            </span>
          )}
        </button>

        <button 
          className={`btn-secondary ${activeSubTab === 'indents' ? 'active' : ''}`}
          style={{ 
            padding: '10px 20px', 
            fontSize: '0.9rem', 
            fontWeight: '700',
            borderRadius: '8px 8px 0 0',
            borderBottom: activeSubTab === 'indents' ? '3px solid var(--primary-brand)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setActiveSubTab('indents')}
        >
          <ClipboardList size={18} /> Material Requisition Indents ({(indents || []).length})
          {(indents || []).filter(i => i.status === 'Pending Approval').length > 0 && (
            <span className="badge badge-warning" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
              {(indents || []).filter(i => i.status === 'Pending Approval').length} Pending
            </span>
          )}
        </button>

        <button 
          className={`btn-secondary ${activeSubTab === 'issues' ? 'active' : ''}`}
          style={{ 
            padding: '10px 20px', 
            fontSize: '0.9rem', 
            fontWeight: '700',
            borderRadius: '8px 8px 0 0',
            borderBottom: activeSubTab === 'issues' ? '3px solid var(--primary-brand)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setActiveSubTab('issues')}
        >
          <Cpu size={18} /> Machine Stock Issue Log ({(machineIssues || []).length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: CONSUMABLES & SPARE PARTS STORE */}
      {/* ========================================================================= */}
      {activeSubTab === 'store' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Reserve Alert Prompt Banner for Low Stock Items */}
          {lowStockItemsCount > 0 && (
            <div className="glass-panel" style={{ padding: '16px 20px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldAlert size={26} style={{ color: '#dc2626' }} />
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#991b1b', marginBottom: '2px' }}>
                    Reserve Alert: {lowStockItemsCount} Consumable / Spare Items Below Minimum Quantities!
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>
                    Items falling below safety reserve thresholds are prioritized at the top of the inventory. Please raise material indents to avoid machine downtime.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  className="btn-secondary" 
                  style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#ffffff', color: '#dc2626', borderColor: '#fca5a5', fontWeight: '700' }}
                  onClick={() => setLowStockOnly(prev => !prev)}
                >
                  {lowStockOnly ? 'Show All Store Items' : `Filter Below Reserve (${lowStockItemsCount})`}
                </button>
                <button 
                  className="btn-primary" 
                  style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#dc2626', fontWeight: '700' }}
                  onClick={() => {
                    setIsIndentModalOpen(true);
                  }}
                >
                  Raise Requisition Indent
                </button>
              </div>
            </div>
          )}

          {/* Filters Bar: Machine-wise Filter, Low Quantity Filter & Category Filter */}
          <div className="glass-panel" style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <SlidersHorizontal size={16} style={{ color: 'var(--primary-brand)' }} /> Filter Store Inventory
              </h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing <b>{(sortedAndFilteredConsumables || []).length}</b> of <b>{(consumables || []).length}</b> Items
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '12px' }}>
              
              {/* Search Bar */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Search Item / Code / Location</label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Search doctor blades, ethyl acetate..." 
                    style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Machine-wise Filter */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Filter by Machine</label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                  value={machineFilter}
                  onChange={e => setMachineFilter(e.target.value)}
                >
                  <option value="ALL">All Machines &amp; Plant Units</option>
                  {dynamicMachineList.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Low Quantity Filter Toggle */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Quantity Status Filter</label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.85rem', padding: '6px 12px', color: lowStockOnly ? '#dc2626' : 'inherit', fontWeight: lowStockOnly ? '700' : 'normal' }}
                  value={lowStockOnly ? "LOW_ONLY" : "ALL"}
                  onChange={e => setLowStockOnly(e.target.value === "LOW_ONLY")}
                >
                  <option value="ALL">All Items (Below Reserve Promoted to Top)</option>
                  <option value="LOW_ONLY">⚠️ Low Stock / Below Reserve Level Only ({lowStockItemsCount})</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Category Filter</label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories ({uniqueCategories.length})</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

            </div>

            {(searchTerm || machineFilter !== 'ALL' || categoryFilter !== 'ALL' || lowStockOnly) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={resetStoreFilters}
                >
                  <RotateCcw size={12} /> Reset Filters
                </button>
              </div>
            )}
          </div>

          {/* Consumables Store Table */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            {sortedAndFilteredConsumables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <Package size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>No Consumable or Spare Items Found</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>No store items match your selected filters.</p>
                <button className="btn-secondary" onClick={resetStoreFilters}>Reset All Filters</button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Description</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Min Reserve Level</th>
                    <th>Status & Alert</th>
                    <th>Assigned Machine</th>
                    <th>Location Bin</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {consumablesPagination.paginatedItems.map(item => {
                    const isBelowReserve = item.currentStock <= item.minReserve;
                    const stockRatio = (item.currentStock / (item.minReserve || 1)) * 100;

                    return (
                      <tr 
                        key={item.id}
                        style={{ 
                          background: isBelowReserve ? '#fff5f5' : 'transparent',
                          borderLeft: isBelowReserve ? '4px solid #dc2626' : 'none'
                        }}
                      >
                        <td>
                          <span className="badge badge-both" style={{ fontFamily: 'monospace' }}>{item.itemCode}</span>
                        </td>
                        <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {item.name}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {item.category}
                        </td>
                        <td>
                          <strong style={{ fontSize: '1rem', color: isBelowReserve ? '#dc2626' : '#047857' }}>
                            {item.currentStock} {item.unit}
                          </strong>
                        </td>
                        <td style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          {item.minReserve} {item.unit}
                        </td>
                        <td>
                          {isBelowReserve ? (
                            <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b' }}>
                              <AlertTriangle size={13} /> Below Reserve (Reorder Needed)
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.75rem' }}>
                              <CheckCircle2 size={13} /> Stock Healthy ({Math.round(stockRatio)}%)
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Cpu size={14} style={{ color: 'var(--primary-brand)' }} /> {item.assignedMachine}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {item.location}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button 
                              className="btn-primary" 
                              style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => handleOpenIssueModal(item)}
                              title="Issue material to machine"
                            >
                              <ArrowDownToLine size={13} /> Issue to Machine
                            </button>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => {
                                setSelectedItemForRestock(item);
                                setRestockQty(item.minReserve * 2 - item.currentStock > 0 ? item.minReserve * 2 - item.currentStock : 50);
                                setIsRestockModalOpen(true);
                              }}
                              title="Restock store inventory"
                            >
                              + Restock
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <TablePagination
                currentPage={consumablesPagination.currentPage}
                totalItems={consumablesPagination.totalItems}
                pageSize={consumablesPagination.pageSize}
                onPageChange={consumablesPagination.setCurrentPage}
                onPageSizeChange={consumablesPagination.setPageSize}
              />
            </div>
          )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: MATERIAL REQUISITION INDENTS */}
      {/* ========================================================================= */}
      {activeSubTab === 'indents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>Store & Plant Manager Material Indent Requisitions</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                Track and approve material indents for Inks, Solvents, Adhesive, Consumables & Spare parts.
              </p>
            </div>

            <button 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => {
                setIndentLineItems([
                  { id: Date.now(), itemName: consumables[0]?.name || "Ethyl Acetate Solvent", category: consumables[0]?.category || "Chemicals", unit: consumables[0]?.unit || "Litres", reqQty: 100, targetMachine: dynamicMachineList[0] || '' }
                ]);
                setIsIndentModalOpen(true);
              }}
            >
              <Plus size={18} /> Raise New Material Indent
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            {(indents || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <ClipboardList size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>No Material Indents Raised</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Click below to raise a new requisition indent.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                <thead>
                  <tr>
                    <th>Indent No</th>
                    <th>Date</th>
                    <th>Priority</th>
                    <th>Department & Raised By</th>
                    <th>Requisition Line Items</th>
                    <th>Status</th>
                    <th>Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {indentsPagination.paginatedItems.map(indent => {
                    const isPending = indent.status === 'Pending Approval';
                    const isApproved = indent.status === 'Approved';
                    const isIssued = indent.status === 'Issued to Machine';

                    return (
                      <tr key={indent.id}>
                        <td>
                          <strong style={{ color: 'var(--primary-brand)' }}>{indent.indentNo}</strong>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{indent.date}</td>
                        <td>
                          <span 
                            className={`badge ${
                              indent.priority === 'Urgent' ? 'badge-danger' : 
                              indent.priority === 'High' ? 'badge-warning' : 'badge-info'
                            }`}
                            style={{ fontSize: '0.75rem', fontWeight: '700' }}
                          >
                            {indent.priority}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{indent.raisedBy}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{indent.department}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {indent.items.map((it, idx) => (
                              <div key={idx} style={{ background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                <b>{it.reqQty} {it.unit}</b> × {it.itemName}
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📍 Machine: {it.targetMachine}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span 
                            className={`badge ${
                              isIssued ? 'badge-success' :
                              isApproved ? 'badge-info' :
                              isPending ? 'badge-warning' : 'badge-danger'
                            }`}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: '700' }}
                          >
                            {indent.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                          {indent.remarks}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => setSelectedIndentForPrint(indent)}
                              title="Print Material Indent Note"
                            >
                              <Printer size={13} /> Print Slip
                            </button>

                            {/* Raise PO Button (Admin Restricted) */}
                            <button 
                              className="btn-primary" 
                              style={{ 
                                padding: '4px 10px', 
                                fontSize: '0.75rem', 
                                background: indent.poNumber ? '#047857' : (isAdminRole ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#94a3b8'),
                                cursor: isAdminRole ? 'pointer' : 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={() => handleOpenRaisePO(indent)}
                              title={isAdminRole ? (indent.poNumber ? `View/Re-issue PO ${indent.poNumber}` : "Issue Official Purchase Order (Admin Only)") : "Permission Denied: PO Issuance restricted to Admin Role"}
                            >
                              {!isAdminRole && <Lock size={12} />}
                              <FileText size={13} /> {indent.poNumber ? `PO: ${indent.poNumber}` : 'Raise PO'}
                            </button>

                            {isPending && (
                              <>
                                <button 
                                  className="btn-primary" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#047857' }}
                                  onClick={() => handleUpdateIndentStatus(indent.id, 'Approved')}
                                >
                                  Approve
                                </button>
                                <button 
                                  className="btn-secondary" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                  onClick={() => handleUpdateIndentStatus(indent.id, 'Rejected')}
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {isApproved && (
                              <button 
                                className="btn-primary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}
                                onClick={() => handleUpdateIndentStatus(indent.id, 'Issued to Machine')}
                              >
                                Mark Issued
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <TablePagination
                currentPage={indentsPagination.currentPage}
                totalItems={indentsPagination.totalItems}
                pageSize={indentsPagination.pageSize}
                onPageChange={indentsPagination.setCurrentPage}
                onPageSizeChange={indentsPagination.setPageSize}
              />
            </div>
          )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: MACHINE STOCK ISSUE LOG */}
      {/* ========================================================================= */}
      {activeSubTab === 'issues' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>Machine Stock Issue History Audit Log</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Real-time audit log of store consumables, solvents, inks, and adhesives issued to specific plant machinery.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div className="table-responsive">
              <table className="data-table">
              <thead>
                <tr>
                  <th>Issue No</th>
                  <th>Date</th>
                  <th>Indent Ref</th>
                  <th>Issued Item</th>
                  <th>Quantity Issued</th>
                  <th>Target Machine</th>
                  <th>Issued By</th>
                  <th>Machine Operator & Shift</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {machineIssues.map(issue => (
                  <tr key={issue.id}>
                    <td><strong style={{ color: 'var(--primary-brand)' }}>{issue.issueNo}</strong></td>
                    <td style={{ fontSize: '0.85rem' }}>{issue.date}</td>
                    <td><span className="badge badge-both">{issue.indentNo}</span></td>
                    <td style={{ fontWeight: '700' }}>{issue.itemName}</td>
                    <td><b style={{ color: '#047857', fontSize: '0.95rem' }}>{issue.qtyIssued} {issue.unit}</b></td>
                    <td style={{ fontSize: '0.85rem', fontWeight: '700' }}>
                      <Cpu size={14} inline style={{ color: 'var(--primary-brand)', marginRight: '4px' }} /> {issue.targetMachine}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{issue.issuedBy}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{issue.machineOperator}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{issue.shift}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{issue.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ISSUE MATERIAL TO MACHINE */}
      {/* ========================================================================= */}
      {isIssueModalOpen && selectedItemForIssue && (
        <div className="modal-overlay" onClick={() => setIsIssueModalOpen(false)}>
          <div className="modal-content" style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-brand)' }}>
                <ArrowDownToLine size={20} /> Issue Store Material to Machine
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsIssueModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleConfirmIssueStock}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>SELECTED ITEM:</div>
                <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)' }}>{selectedItemForIssue.name}</div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.85rem' }}>
                  <span>Code: <b>{selectedItemForIssue.itemCode}</b></span>
                  <span>Available Stock: <b style={{ color: '#047857' }}>{selectedItemForIssue.currentStock} {selectedItemForIssue.unit}</b></span>
                </div>
              </div>

              <div className="form-grid">
                <div>
                  <label className="form-label">Target Machine / Plant Unit *</label>
                  <select className="form-control" value={issueMachine} onChange={e => setIssueMachine(e.target.value)}>
                    {dynamicMachineList.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Quantity to Issue ({selectedItemForIssue.unit}) *</label>
                  <input 
                    type="number" 
                    step="any"
                    max={selectedItemForIssue.currentStock}
                    min="0.1"
                    className="form-control" 
                    value={issueQty} 
                    onChange={e => setIssueQty(e.target.value)} 
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Machine Operator Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Ramesh Kumar"
                    value={issueOperator} 
                    onChange={e => setIssueOperator(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="form-label">Work Shift</label>
                  <select className="form-control" value={issueShift} onChange={e => setIssueShift(e.target.value)}>
                    <option value="Morning Shift (A)">Morning Shift (A)</option>
                    <option value="Evening Shift (B)">Evening Shift (B)</option>
                    <option value="Night Shift (C)">Night Shift (C)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '14px' }}>
                <label className="form-label">Indent / Order Reference</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. IND-2026-001 or ORD-2026-089"
                  value={issueIndentRef} 
                  onChange={e => setIssueIndentRef(e.target.value)} 
                />
              </div>

              <div style={{ marginTop: '14px' }}>
                <label className="form-label">Issue Remarks / Purpose</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  placeholder="e.g. Issued 1 drum for Britannia Bourbon 250g print batch"
                  value={issueRemarks}
                  onChange={e => setIssueRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsIssueModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>Confirm Issue & Deduct Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RAISE NEW MATERIAL INDENT */}
      {/* ========================================================================= */}
      {isIndentModalOpen && (
        <div className="modal-overlay" onClick={() => setIsIndentModalOpen(false)}>
          <div className="modal-content" style={{ width: '850px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-brand)' }}>
                <ClipboardList size={20} /> Raise Store & Plant Material Requisition Indent
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsIndentModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateIndent}>
              <div className="form-grid">
                <div>
                  <label className="form-label">Priority Level *</label>
                  <select className="form-control" value={indentPriority} onChange={e => setIndentPriority(e.target.value)}>
                    <option value="Normal">Normal Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Urgent">🚨 Urgent (Machine Down Warning)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Requisition Department *</label>
                  <select className="form-control" value={indentDept} onChange={e => setIndentDept(e.target.value)}>
                    <option value="Production & Printing">Production & Printing</option>
                    <option value="Lamination & Store">Lamination & Store</option>
                    <option value="Slitting & Pouching">Slitting & Pouching</option>
                    <option value="Maintenance Workshop">Maintenance Workshop</option>
                    <option value="Store & Inventory">Store & Inventory</option>
                  </select>
                </div>
              </div>

              {/* Line Items Table */}
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '800' }}>Requisition Items List</h4>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={addIndentLineItem}>
                    + Add Item Row
                  </button>
                </div>

                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Select Store Item / Description</th>
                      <th>Category</th>
                      <th>Unit</th>
                      <th>Required Qty</th>
                      <th>Target Machine</th>
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indentLineItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <select 
                            className="form-control" 
                            style={{ fontSize: '0.85rem' }}
                            value={item.itemName} 
                            onChange={e => updateIndentLineItem(item.id, 'itemName', e.target.value)}
                          >
                            {consumables.map(c => (
                              <option key={c.id} value={c.name}>{c.name} (Stock: {c.currentStock} {c.unit})</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="text" className="form-control" value={item.category} disabled style={{ fontSize: '0.8rem', background: '#f1f5f9' }} />
                        </td>
                        <td>
                          <input type="text" className="form-control" value={item.unit} disabled style={{ fontSize: '0.8rem', width: '70px', background: '#f1f5f9' }} />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            step="any"
                            className="form-control" 
                            style={{ fontSize: '0.85rem', width: '100px' }}
                            value={item.reqQty} 
                            onChange={e => updateIndentLineItem(item.id, 'reqQty', e.target.value)} 
                            required
                          />
                        </td>
                        <td>
                          <select 
                            className="form-control" 
                            style={{ fontSize: '0.8rem' }}
                            value={item.targetMachine} 
                            onChange={e => updateIndentLineItem(item.id, 'targetMachine', e.target.value)}
                          >
                            {dynamicMachineList.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '4px 8px' }}
                            onClick={() => removeIndentLineItem(item.id)}
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label className="form-label">Indent Remarks & Justification</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  placeholder="State batch details, machine emergency, or general restock reason..."
                  value={indentRemarks} 
                  onChange={e => setIndentRemarks(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsIndentModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Submit Material Indent</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RESTOCK STORE ITEM */}
      {/* ========================================================================= */}
      {isRestockModalOpen && selectedItemForRestock && (
        <div className="modal-overlay" onClick={() => setIsRestockModalOpen(false)}>
          <div className="modal-content" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--primary-brand)' }}>
                Restock Store Item: {selectedItemForRestock.name}
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsRestockModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleConfirmRestock}>
              <div style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
                Current Available Stock: <b>{selectedItemForRestock.currentStock} {selectedItemForRestock.unit}</b>
                <br />
                Minimum Reserve Level: <b style={{ color: '#dc2626' }}>{selectedItemForRestock.minReserve} {selectedItemForRestock.unit}</b>
              </div>

              <div className="form-group">
                <label className="form-label">Restock / Received Quantity ({selectedItemForRestock.unit}) *</label>
                <input 
                  type="number" 
                  step="any"
                  className="form-control" 
                  value={restockQty} 
                  onChange={e => setRestockQty(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsRestockModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add to Store Inventory</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD NEW CONSUMABLE / SPARE ITEM */}
      {/* ========================================================================= */}
      {isNewItemModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewItemModalOpen(false)}>
          <div className="modal-content" style={{ width: '650px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary-brand)' }}>
                Add New Consumable or Spare Item to Store
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsNewItemModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateNewItem}>
              <div className="form-grid">
                <div>
                  <label className="form-label">Item Description / Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. 0.15mm MDC Doctor Blades" 
                    value={newItemName} 
                    onChange={e => setNewItemName(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Item Code / SKU</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. CON-BLD-002" 
                    value={newItemCode} 
                    onChange={e => setNewItemCode(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="form-label">Category *</label>
                  <select className="form-control" value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}>
                    <option value="Chemicals & Solvents">Chemicals & Solvents</option>
                    <option value="Inks & Toners">Inks & Toners</option>
                    <option value="Adhesives & Hardener">Adhesives & Hardener</option>
                    <option value="Doctor Blades & Wipers">Doctor Blades & Wipers</option>
                    <option value="Rollers & Sleeves">Rollers & Sleeves</option>
                    <option value="Spare Parts & Bearings">Spare Parts & Bearings</option>
                    <option value="Lubricants & Oils">Lubricants & Oils</option>
                    <option value="Tapes & Consumables">Tapes & Consumables</option>
                    <option value="Safety Gear (PPE)">Safety Gear (PPE)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Unit of Measure *</label>
                  <select className="form-control" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}>
                    <option value="Kg">Kg</option>
                    <option value="Litres">Litres</option>
                    <option value="Meters">Meters</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Rolls">Rolls</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pack">Pack</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Initial Current Stock *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={newItemStock} 
                    onChange={e => setNewItemStock(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Minimum Reserve Threshold Level *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={newItemMinReserve} 
                    onChange={e => setNewItemMinReserve(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Unit Cost (₹)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={newItemUnitCost} 
                    onChange={e => setNewItemUnitCost(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="form-label">Assigned Machine / Usage</label>
                  <select className="form-control" value={newItemMachine} onChange={e => setNewItemMachine(e.target.value)}>
                    <option value="">— Select Machine / Usage Area —</option>
                    {dynamicMachineList.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Settings size={11} />
                    To add a machine, go to <strong>Letterhead &amp; Settings → Plant Machine Directory</strong> or <strong>Printing Machine Scheduler → Machine Settings</strong>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <label className="form-label">Storage Bin Location</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Bin B-12 / Ink Room Rack 2" 
                  value={newItemLocation} 
                  onChange={e => setNewItemLocation(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsNewItemModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Store Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PRINTABLE MATERIAL INDENT SLIP */}
      {/* ========================================================================= */}
      {selectedIndentForPrint && (
        <div className="modal-overlay" onClick={() => setSelectedIndentForPrint(null)}>
          <div className="modal-content" style={{ width: '750px', padding: '0', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            
            {/* Header Toolbar */}
            <div style={{ padding: '14px 20px', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={16} /> Material Indent Slip: {selectedIndentForPrint.indentNo}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-primary" 
                  style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#047857' }}
                  onClick={() => window.print()}
                >
                  Print Slip
                </button>
                <button className="btn-secondary" style={{ padding: '4px 8px', color: '#ffffff', borderColor: '#475569' }} onClick={() => setSelectedIndentForPrint(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Formatted Indent Slip Sheet */}
            <div style={{ padding: '30px', background: '#ffffff', color: '#1e293b', fontFamily: 'Inter, sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0f172a', margin: 0 }}>SAMYAK INTERNATIONAL LTD.</h2>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>Pithampur Industrial Area, Dhar (MP) • Flexi Packaging Plant</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0284c7' }}>MATERIAL INDENT REQUISITION</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '800', marginTop: '2px' }}>No: {selectedIndentForPrint.indentNo}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Date: {selectedIndentForPrint.date}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.85rem' }}>
                <div><strong>Requisition Department:</strong> {selectedIndentForPrint.department}</div>
                <div><strong>Priority Level:</strong> <span style={{ fontWeight: '800', color: selectedIndentForPrint.priority === 'Urgent' ? '#dc2626' : '#0284c7' }}>{selectedIndentForPrint.priority}</span></div>
                <div><strong>Raised By:</strong> {selectedIndentForPrint.raisedBy}</div>
                <div><strong>Current Status:</strong> <span style={{ fontWeight: '800' }}>{selectedIndentForPrint.status}</span></div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>S.No</th>
                    <th style={{ padding: '8px 12px' }}>Item Description</th>
                    <th style={{ padding: '8px 12px' }}>Category</th>
                    <th style={{ padding: '8px 12px' }}>Req Qty</th>
                    <th style={{ padding: '8px 12px' }}>Target Machine</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedIndentForPrint.items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', fontWeight: '700' }}>{it.itemName}</td>
                      <td style={{ padding: '8px 12px' }}>{it.category}</td>
                      <td style={{ padding: '8px 12px', fontWeight: '800', color: '#047857' }}>{it.reqQty} {it.unit}</td>
                      <td style={{ padding: '8px 12px' }}>{it.targetMachine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginBottom: '30px', fontSize: '0.85rem', background: '#fffbebfb', padding: '10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                <strong>Remarks / Justification:</strong> {selectedIndentForPrint.remarks}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', paddingTop: '40px', borderTop: '1px dashed #cbd5e1', textAlign: 'center', fontSize: '0.8rem' }}>
                <div>
                  <div style={{ borderBottom: '1px solid #0f172a', paddingBottom: '4px', fontWeight: '700' }}>{selectedIndentForPrint.raisedBy}</div>
                  <div style={{ color: '#64748b', marginTop: '4px' }}>Requisition Raised By</div>
                </div>

                <div>
                  <div style={{ borderBottom: '1px solid #0f172a', paddingBottom: '4px', fontWeight: '700' }}>Virendra Singh (Store Manager)</div>
                  <div style={{ color: '#64748b', marginTop: '4px' }}>Store Manager Verification</div>
                </div>

                <div>
                  <div style={{ borderBottom: '1px solid #0f172a', paddingBottom: '4px', fontWeight: '700' }}>Rajesh Sharma (Plant Manager)</div>
                  <div style={{ color: '#64748b', marginTop: '4px' }}>Plant Manager Approval Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RAISE PURCHASE ORDER FROM INDENT (ADMIN RESTRICTED) */}
      {/* ========================================================================= */}
      {isRaisePOModalOpen && targetIndentForPO && (
        <div className="modal-overlay" onClick={() => setIsRaisePOModalOpen(false)}>
          <div className="modal-content glass-panel" style={{ width: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-brand)' }}>
                <ShoppingBag size={20} /> Issue Official Purchase Order (Admin Restricted)
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsRaisePOModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleConfirmIssuePO}>
              {/* Linked Indent Information Header */}
              <div style={{ background: '#f0f9ff', padding: '14px 18px', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: '800', letterSpacing: '0.5px' }}>LINKED REQUISITION INDENT</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0c4a6e', marginTop: '2px' }}>
                    {targetIndentForPO.indentNo} — {targetIndentForPO.department}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#0369a1', marginTop: '4px' }}>
                    Item: <b>{targetItemForPO?.name || targetItemForPO?.itemName || 'Consumable'}</b> ({targetItemForPO?.category || 'General Store'})
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={12} /> Admin Role Authorized
                  </span>
                  <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '4px' }}>Priority: <b>{targetIndentForPO.priority}</b></div>
                </div>
              </div>

              <div className="form-grid">
                <div>
                  <label className="form-label">PO Number (Auto Sequence Synced) *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ fontWeight: '800', fontFamily: 'monospace', color: 'var(--primary-brand)' }}
                    value={poNumber} 
                    onChange={e => setPoNumber(e.target.value)} 
                    required 
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Auto-synced from Document Prefix Settings counter</small>
                </div>

                <div>
                  <label className="form-label">Select Vendor (Linked Master Directory) *</label>
                  <select 
                    className="form-control" 
                    style={{ fontWeight: '700' }}
                    value={selectedVendorName} 
                    onChange={e => setSelectedVendorName(e.target.value)}
                    required
                  >
                    {availableVendors.map(v => (
                      <option key={v.id || v.companyName} value={v.companyName}>
                        {v.companyName} (Materials: {(v.materials || []).join(', ') || 'Supplies'})
                      </option>
                    ))}
                  </select>
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>GSTIN & Address auto-linked from Vendor Directory</small>
                </div>

                <div>
                  <label className="form-label">Order Quantity ({targetItemForPO?.unit || 'Kg'}) *</label>
                  <input 
                    type="number" 
                    step="any"
                    className="form-control" 
                    style={{ fontWeight: '700' }}
                    value={poQty} 
                    onChange={e => setPoQty(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Purchase Rate / Unit Price (₹) *</label>
                  <input 
                    type="number" 
                    step="any"
                    className="form-control" 
                    style={{ fontWeight: '700' }}
                    value={poUnitPrice} 
                    onChange={e => setPoUnitPrice(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">GST Tax Rate (%) *</label>
                  <select className="form-control" value={poGstPct} onChange={e => setPoGstPct(e.target.value)}>
                    <option value="18">18% GST (Standard Consumables)</option>
                    <option value="12">12% GST</option>
                    <option value="5">5% GST</option>
                    <option value="0">0% Exempted</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Target Delivery Date *</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={poDeliveryDate} 
                    onChange={e => setPoDeliveryDate(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              {/* PO Live Value Calculation Summary */}
              <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', margin: '18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <div>Taxable Subtotal: <b>₹ {((parseFloat(poQty) || 0) * (parseFloat(poUnitPrice) || 0)).toLocaleString('en-IN')}</b></div>
                  <div style={{ marginTop: '2px' }}>GST Amount ({poGstPct}%): <b>₹ {(((parseFloat(poQty) || 0) * (parseFloat(poUnitPrice) || 0) * parseFloat(poGstPct || 18)) / 100).toLocaleString('en-IN')}</b></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NET PURCHASE ORDER VALUE</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#047857' }}>
                    ₹ {(((parseFloat(poQty) || 0) * (parseFloat(poUnitPrice) || 0)) * (1 + parseFloat(poGstPct || 18) / 100)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label">Payment Terms</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. 30 Days Net from date of material acceptance"
                  value={poPaymentTerms} 
                  onChange={e => setPoPaymentTerms(e.target.value)} 
                />
              </div>

              <div>
                <label className="form-label">PO Terms & Conditions (Prefilled from Settings)</label>
                <textarea 
                  className="form-control" 
                  rows="4" 
                  style={{ fontSize: '0.85rem', lineHeight: '1.5' }}
                  value={poTermsAndConditions} 
                  onChange={e => setPoTermsAndConditions(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsRaisePOModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: '800' }}>
                  <FileText size={16} /> Issue Purchase Order & Open PDF Slip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OVERLAY: PURCHASE ORDER PDF PREVIEW MODAL */}
      {/* ========================================================================= */}
      {activePOData && (
        <PurchaseOrderPDF poData={activePOData} onClose={() => setActivePOData(null)} />
      )}

    </div>
  );
}
