import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter, 
  Printer, 
  Edit3, 
  Trash2, 
  ArrowRight, 
  DollarSign, 
  TrendingUp, 
  Building2, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  RotateCcw, 
  Lock, 
  Layers, 
  SlidersHorizontal,
  X
} from 'lucide-react';
import SalesQuotationPDF from './SalesQuotationPDF';
import { initialSalesQuotations } from '../factoryStore';
import { generateDocRefNumber } from '../services/settingsService';

// Standard Material Formats for Flexible Packaging & Cylinders
export const MATERIAL_FORMATS = [
  "Roll Form",
  "Standup Zipper Pouch Form",
  "Quad Seal Pouch Form",
  "Center Seal Pouch Form",
  "Side Seal Pouch Form",
  "Rotogravure Cylinder"
];

// Standard Terms & Conditions Bullet Templates
export const DEFAULT_QUOTATION_TERMS = [
  "1. Material specifications as per sample approved by QA laboratory.",
  "2. Tax Invoice with GSTIN & HSN codes mandatory along with delivery challan.",
  "3. Price valid for 30 days from quotation date.",
  "4. Quantity variance tolerance +/- 10% allowed as per standard flexible packaging norms.",
  "5. Payment terms strict as per agreed credit terms."
];

export default function SalesManagement({
  orders = [],
  clients = [],
  jobMasters = [],
  currentUser,
  userRole = "Sales Manager",
  onAddOrder,
  onAddJobMaster
}) {
  const isSalesAuthorized = useMemo(() => {
    if (!currentUser && !userRole) return true;
    const roleStr = String(currentUser?.role || userRole || '').toLowerCase().trim();
    return roleStr.includes('admin') || roleStr.includes('sales') || roleStr.includes('plant') || roleStr.includes('director');
  }, [currentUser, userRole]);

  const [quotations, setQuotations] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_sales_quotations');
      return saved ? JSON.parse(saved) : initialSalesQuotations;
    } catch (e) {
      return initialSalesQuotations;
    }
  });

  const [activeSubTab, setActiveSubTab] = useState('list'); // 'list', 'create'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // PDF Preview State
  const [activeQuotationForPDF, setActiveQuotationForPDF] = useState(null);

  // Form State for Create / Edit / Amend Quotation
  const [editingQuotationId, setEditingQuotationId] = useState(null);
  const [quotationNo, setQuotationNo] = useState('SIL/QTN/26-27/003');
  const [revisionNo, setRevisionNo] = useState(0);
  const [amendmentNo, setAmendmentNo] = useState('Rev 00');
  const [enquiryDate, setEnquiryDate] = useState(new Date().toISOString().split('T')[0]);
  
  const defaultDelivery = new Date();
  defaultDelivery.setDate(defaultDelivery.getDate() + 14);
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState(defaultDelivery.toISOString().split('T')[0]);

  const [salesManager, setSalesManager] = useState(currentUser?.name || 'Samyak Jain (Sales Manager)');
  
  // Client Form Details
  const [selectedClientName, setSelectedClientName] = useState(clients[0]?.name || 'Britannia Industries Ltd');
  const [clientAddress, setClientAddress] = useState(clients[0]?.address || 'Britannia Executive Centre, Pithampur Sector 3, MP');
  const [clientGstin, setClientGstin] = useState(clients[0]?.gstin || '23AABCB1234F1Z1');
  const [contactPerson, setContactPerson] = useState(clients[0]?.contactPerson || 'Rajesh Sharma');
  const [contactPhone, setContactPhone] = useState(clients[0]?.phone || '+91 98260 11223');
  const [contactEmail, setContactEmail] = useState(clients[0]?.email || 'rsharma@britannia.co.in');

  // Commercial Terms Form Fields
  const [paymentTerms, setPaymentTerms] = useState('30 Days Net from date of Invoice');
  const [cylinderTerms, setCylinderTerms] = useState('Cylinder Development Cost borne by Client @ ₹6,500/cylinder');
  const [transportTerms, setTransportTerms] = useState('Freight Included (FOR Pithampur Factory)');
  const [comments, setComments] = useState('');

  // Line Items
  const [items, setItems] = useState([
    {
      id: 1,
      jobTitle: 'Britannia Bourbon 250g Packaging',
      structure: 'PET 12µ / METPET 12µ / Natural GP LD 35µ',
      materialFormat: 'Roll Form',
      quantity: 5000,
      uom: 'Kg',
      ratePerUom: 245.00,
      printWidthMm: 1000,
      repeatLengthMm: 400,
      gstPct: 18
    }
  ]);

  const [termsList, setTermsList] = useState(DEFAULT_QUOTATION_TERMS);

  // Sync client details when client selection changes
  const handleClientSelectChange = (clientNameVal) => {
    setSelectedClientName(clientNameVal);
    const matched = clients.find(c => c.name === clientNameVal);
    if (matched) {
      setClientAddress(matched.address || '');
      setClientGstin(matched.gstin || '');
      setContactPerson(matched.contactPerson || '');
      setContactPhone(matched.phone || '');
      setContactEmail(matched.email || '');
    }
  };

  // Open Create Form
  const handleOpenCreateForm = () => {
    setEditingQuotationId(null);
    const nextQtnNo = `SIL/QTN/26-27/00${quotations.length + 1}`;
    setQuotationNo(nextQtnNo);
    setRevisionNo(0);
    setAmendmentNo('Rev 00');
    setEnquiryDate(new Date().toISOString().split('T')[0]);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    setEstimatedDeliveryDate(targetDate.toISOString().split('T')[0]);

    if (clients.length > 0) {
      handleClientSelectChange(clients[0].name);
    }

    setItems([
      {
        id: 1,
        jobTitle: 'New Product Packaging Job',
        structure: 'PET 12µ / METPET 12µ / Natural LDPE 40µ',
        materialFormat: 'Roll Form',
        quantity: 2000,
        uom: 'Kg',
        ratePerUom: 250.00,
        printWidthMm: 1000,
        repeatLengthMm: 400,
        gstPct: 18
      }
    ]);
    setTermsList(DEFAULT_QUOTATION_TERMS);
    setComments('');
    setActiveSubTab('create');
  };

  // Open Amend Form
  const handleOpenAmendForm = (qtn) => {
    setEditingQuotationId(null); // Create new revision
    setQuotationNo(qtn.quotationNo);
    const nextRev = (qtn.revisionNo || 0) + 1;
    setRevisionNo(nextRev);
    setAmendmentNo(`Rev 0${nextRev}`);
    setEnquiryDate(new Date().toISOString().split('T')[0]);
    setEstimatedDeliveryDate(qtn.estimatedDeliveryDate);

    setSelectedClientName(qtn.clientName);
    setClientAddress(qtn.clientAddress);
    setClientGstin(qtn.clientGstin);
    setContactPerson(qtn.contactPerson);
    setContactPhone(qtn.contactPhone);
    setContactEmail(qtn.contactEmail);

    setPaymentTerms(qtn.paymentTerms);
    setCylinderTerms(qtn.cylinderTerms);
    setTransportTerms(qtn.transportTerms);

    setItems(qtn.items || []);
    setTermsList(qtn.termsAndConditions || DEFAULT_QUOTATION_TERMS);
    setComments(`Amended Revision ${nextRev} based on client specification updates.`);

    setActiveSubTab('create');
  };

  // Save Sales Quotation
  const handleSaveQuotation = (e) => {
    e.preventDefault();
    if (!selectedClientName || items.length === 0) {
      alert("Client Name and at least 1 Product Item are required!");
      return;
    }

    const calculatedItems = items.map(it => {
      const qty = parseFloat(it.quantity) || 0;
      const rate = parseFloat(it.ratePerUom) || 0;
      const taxable = qty * rate;
      const gst = (taxable * (parseFloat(it.gstPct) || 18)) / 100;
      return {
        ...it,
        taxableAmount: taxable,
        gstAmount: gst,
        totalAmount: taxable + gst
      };
    });

    const newQtn = {
      id: editingQuotationId || `QTN-${Date.now()}`,
      quotationNo,
      revisionNo,
      amendmentNo,
      enquiryDate,
      estimatedDeliveryDate,
      salesManager,
      clientName: selectedClientName,
      clientAddress,
      clientGstin,
      contactPerson,
      contactPhone,
      contactEmail,
      paymentTerms,
      cylinderTerms,
      transportTerms,
      status: "Sent to Client",
      ocnRefNo: "",
      convertedDate: "",
      items: calculatedItems,
      termsAndConditions: termsList,
      comments
    };

    let updatedList = [];
    if (editingQuotationId) {
      updatedList = quotations.map(q => q.id === editingQuotationId ? newQtn : q);
    } else {
      updatedList = [newQtn, ...quotations];
    }

    setQuotations(updatedList);
    try {
      localStorage.setItem('samyak_erp_sales_quotations', JSON.stringify(updatedList));
    } catch (err) {}

    setActiveSubTab('list');
    setActiveQuotationForPDF(newQtn); // Open PDF preview!
    alert(`Sales Quotation ${quotationNo} (${amendmentNo}) saved & sent to client! Opening PDF preview now.`);
  };

  // Convert Sales Quotation to Order Confirmation Note (OCN) & Job Master
  const handleConvertToOCN = (qtn) => {
    if (qtn.status.includes('Confirmed')) {
      alert(`Quotation ${qtn.quotationNo} is already converted to OCN ${qtn.ocnRefNo}!`);
      return;
    }

    if (!window.confirm(`Are you sure you want to convert Sales Quotation "${qtn.quotationNo}" into an official Order Confirmation Note (OCN)?\n\nThis will automatically:\n1. Generate a new Order Confirmation Note (OCN)\n2. Create a new Job Master in Technical Directory\n3. Link order across Production, Inventory & Scheduling.`)) {
      return;
    }

    const ocnNo = `SIL/OCN/26-27/${Math.floor(100 + Math.random() * 900)}`;
    const mainItem = (qtn.items && qtn.items[0]) || {};

    // 1. Create Job Master in Job Master Technical Directory
    const newJobMaster = {
      id: `JM-2026-${Math.floor(100 + Math.random() * 900)}`,
      skuCode: `SKU-${qtn.clientName.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
      jobName: mainItem.jobTitle || 'Custom Flexible Packaging Job',
      clientName: qtn.clientName,
      structure: mainItem.structure || 'PET 12µ / METPET 12µ / LDPE 40µ',
      printWidthMm: mainItem.printWidthMm || 1000,
      repeatLengthMm: mainItem.repeatLengthMm || 400,
      pouchOpenWidth: 120,
      pouchHeight: 160,
      materialFormat: mainItem.materialFormat || 'Roll Form',
      layers: [
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'LDPE', micron: 40 }
      ],
      cylinderSku: `CYL-${qtn.clientName.substring(0, 3).toUpperCase()}-001`,
      cylinderCost: qtn.cylinderTerms || '₹ 35,000',
      colorsCount: 6,
      engravuresName: 'Acme Rotogravure Engravers',
      costBorneBy: 'Client (100%)',
      utilisationLimit: 10000,
      creationDate: new Date().toISOString().split('T')[0]
    };

    if (onAddJobMaster) {
      onAddJobMaster(newJobMaster);
    }

    // 2. Create Order in Order Management System
    const newOrder = {
      id: `ORD-2026-${Math.floor(100 + Math.random() * 900)}`,
      ocnNumber: ocnNo,
      jobMasterId: newJobMaster.id,
      jobName: mainItem.jobTitle || 'Custom Flexible Packaging Job',
      clientName: qtn.clientName,
      quantityKg: parseFloat(mainItem.quantity) || 2000,
      sellingPricePerKg: parseFloat(mainItem.ratePerUom) || 250,
      orderDate: new Date().toISOString().split('T')[0],
      deliveryDate: qtn.estimatedDeliveryDate,
      poNumber: `PO-QTN-${qtn.quotationNo}`,
      status: 'Confirmed',
      materialRequirements: [
        { filmType: 'PET', micron: 12, widthMm: mainItem.printWidthMm || 1000, qtyKg: (mainItem.quantity || 2000) * 0.3 },
        { filmType: 'METPET', micron: 12, widthMm: mainItem.printWidthMm || 1000, qtyKg: (mainItem.quantity || 2000) * 0.3 },
        { filmType: 'Natural GP LD', micron: 40, widthMm: (mainItem.printWidthMm || 1000) + 5, qtyKg: (mainItem.quantity || 2000) * 0.4 }
      ]
    };

    if (onAddOrder) {
      onAddOrder(newOrder);
    }

    // 3. Update Quotation Status
    const updatedQuotations = quotations.map(q => {
      if (q.id === qtn.id) {
        return {
          ...q,
          status: "Confirmed (Converted to OCN)",
          ocnRefNo: ocnNo,
          convertedDate: new Date().toISOString().split('T')[0]
        };
      }
      return q;
    });

    setQuotations(updatedQuotations);
    try {
      localStorage.setItem('samyak_erp_sales_quotations', JSON.stringify(updatedQuotations));
    } catch (err) {}

    alert(`🎉 SUCCESS!\n\nSales Quotation ${qtn.quotationNo} has been CONVERTED to Order Confirmation Note (${ocnNo}).\n\n- Job Master "${newJobMaster.jobName}" (${newJobMaster.id}) created in Job Master Directory.\n- Order ${newOrder.id} is now LIVE across Production, Inventory & Cylinder scheduling!`);
  };

  // Filtered Quotations
  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        !searchTerm ||
        (q.quotationNo || '').toLowerCase().includes(term) ||
        (q.clientName || '').toLowerCase().includes(term) ||
        (q.salesManager || '').toLowerCase().includes(term) ||
        (q.items && q.items.some(i => (i.jobTitle || '').toLowerCase().includes(term)));

      const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [quotations, searchTerm, statusFilter]);

  // Analytics Metrics
  const totalQuotationsCount = quotations.length;
  const confirmedCount = quotations.filter(q => q.status.includes('Confirmed')).length;
  const conversionRatePct = totalQuotationsCount > 0 ? ((confirmedCount / totalQuotationsCount) * 100).toFixed(1) : 0;
  const totalPipelineValueRs = quotations.reduce((sum, q) => {
    const qtnTotal = (q.items || []).reduce((a, b) => a + (b.totalAmount || (b.quantity * b.ratePerUom * 1.18)), 0);
    return sum + qtnTotal;
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner Header */}
      <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <ShoppingBag size={28} /> Sales Management & Quotation Engine
            </h2>
            <p style={{ fontSize: '0.88rem', opacity: 0.9, marginTop: '4px' }}>
              Create professional Sales Quotations for client enquiries, manage amendments, and convert confirmed quotes directly into Order Confirmation Notes (OCN) & Job Masters.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-primary" 
              style={{ background: '#ffffff', color: '#0284c7', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px' }}
              onClick={handleOpenCreateForm}
            >
              <Plus size={18} /> Create New Sales Quotation
            </button>
          </div>
        </div>
      </div>

      {/* Analytics KPI Metric Cards */}
      <div className="kpi-grid-4">
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>TOTAL SALES QUOTATIONS</div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary-brand)', marginTop: '4px' }}>
            {totalQuotationsCount} Quotes
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Active Sales Enquiries</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>CONFIRMED OCN CONVERSIONS</div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857', marginTop: '4px' }}>
            {confirmedCount} Orders
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '2px', fontWeight: '700' }}>Converted to Live Production</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>SALES CONVERSION RATE</div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0284c7', marginTop: '4px' }}>
            {conversionRatePct}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Quote to Order Efficiency</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>TOTAL QUOTATION PIPELINE VALUE</div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#7c3aed', marginTop: '4px' }}>
            ₹ {Math.round(totalPipelineValueRs).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Inclusive of 18% GST</div>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid var(--border-color)', paddingBottom: '8px' }}>
        <button 
          className={`btn-secondary ${activeSubTab === 'list' ? 'active' : ''}`}
          style={{ 
            padding: '10px 20px', 
            fontSize: '0.9rem', 
            fontWeight: '700',
            borderBottom: activeSubTab === 'list' ? '3px solid var(--primary-brand)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setActiveSubTab('list')}
        >
          <FileText size={18} /> Sales Quotations Directory ({quotations.length})
        </button>

        <button 
          className={`btn-secondary ${activeSubTab === 'create' ? 'active' : ''}`}
          style={{ 
            padding: '10px 20px', 
            fontSize: '0.9rem', 
            fontWeight: '700',
            borderBottom: activeSubTab === 'create' ? '3px solid var(--primary-brand)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={handleOpenCreateForm}
        >
          <Plus size={18} /> {editingQuotationId ? 'Edit Quotation' : 'Create Quotation'}
        </button>
      </div>

      {/* SUB-TAB 1: SALES QUOTATIONS DIRECTORY LIST */}
      {activeSubTab === 'list' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '300px' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ paddingLeft: '38px' }}
                  placeholder="Search quotation #, client, job..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                <select 
                  className="form-control" 
                  style={{ width: '220px', fontWeight: '700' }}
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">🌐 All Quotation Statuses</option>
                  <option value="Sent to Client">Sent to Client</option>
                  <option value="Confirmed (Converted to OCN)">Confirmed (Converted to OCN)</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Showing <b>{filteredQuotations.length}</b> of <b>{quotations.length}</b> Quotations
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quotation Ref & Rev</th>
                  <th>Date & Est. Delivery</th>
                  <th>Client Name</th>
                  <th>Product Specifications & Format</th>
                  <th>Quoted Rate & Value (₹)</th>
                  <th>Status & Linked OCN</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No sales quotations match your search. Click "Create New Sales Quotation" to add one.
                    </td>
                  </tr>
                ) : (
                  filteredQuotations.map(qtn => {
                    const isConfirmed = qtn.status.includes('Confirmed');
                    const mainItem = (qtn.items && qtn.items[0]) || {};
                    const totalVal = (qtn.items || []).reduce((a, b) => a + (b.totalAmount || (b.quantity * b.ratePerUom * 1.18)), 0);

                    return (
                      <tr key={qtn.id}>
                        <td>
                          <strong style={{ color: 'var(--primary-brand)', fontSize: '0.95rem' }}>{qtn.quotationNo}</strong>
                          <div>
                            <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>{qtn.amendmentNo}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          <div>Date: <b>{qtn.enquiryDate}</b></div>
                          <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>Est. Del: {qtn.estimatedDeliveryDate}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800' }}>{qtn.clientName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contact: {qtn.contactPerson} ({qtn.contactPhone})</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{mainItem.jobTitle}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{mainItem.structure}</div>
                          <div style={{ marginTop: '2px' }}>
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                              {mainItem.materialFormat || 'Roll Form'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', color: 'var(--primary-brand)', fontSize: '0.95rem' }}>
                            ₹ {Math.round(totalVal).toLocaleString('en-IN')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {(mainItem.quantity || 0).toLocaleString()} {mainItem.uom} @ ₹{mainItem.ratePerUom}/UOM
                          </div>
                        </td>
                        <td>
                          {isConfirmed ? (
                            <div>
                              <span className="badge badge-success" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                <CheckCircle2 size={12} inline style={{ marginRight: '4px' }} /> Converted to OCN
                              </span>
                              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>
                                {qtn.ocnRefNo}
                              </div>
                            </div>
                          ) : (
                            <span className="badge badge-info" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                              {qtn.status}
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {/* Print / Download PDF */}
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => setActiveQuotationForPDF(qtn)}
                              title="Print Sales Quotation Letterhead PDF"
                            >
                              <Printer size={13} /> Print Quote
                            </button>

                            {/* Convert to OCN Button */}
                            {!isConfirmed && (
                              <button 
                                className="btn-primary" 
                                style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => handleConvertToOCN(qtn)}
                                title="Convert Sales Quotation to Order Confirmation Note & Job Master"
                              >
                                <ArrowRight size={13} /> Convert to OCN
                              </button>
                            )}

                            {/* Amend Quotation Button */}
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#0284c7', borderColor: '#bae6fd' }}
                              onClick={() => handleOpenAmendForm(qtn)}
                              title="Create Amended Revision (Rev 01, Rev 02)"
                            >
                              <RotateCcw size={13} /> Amend
                            </button>
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
      )}

      {/* SUB-TAB 2: CREATE / EDIT / AMEND SALES QUOTATION FORM */}
      {activeSubTab === 'create' && (
        <form onSubmit={handleSaveQuotation} className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={22} /> {editingQuotationId ? 'Edit Sales Quotation' : `Create Sales Quotation (${amendmentNo})`}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Fill enquiry details, client contact, product format, rates & commercial terms.
              </p>
            </div>

            <button type="button" className="btn-secondary" onClick={() => setActiveSubTab('list')}>
              <X size={18} /> Cancel
            </button>
          </div>

          {/* Quotation Header Row */}
          <div className="form-grid-4" style={{ marginBottom: '20px' }}>
            <div>
              <label className="form-label">Quotation Number *</label>
              <input 
                type="text" 
                className="form-control" 
                style={{ fontWeight: '800', fontFamily: 'monospace', color: 'var(--primary-brand)' }}
                value={quotationNo} 
                onChange={e => setQuotationNo(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label className="form-label">Amendment / Revision *</label>
              <input 
                type="text" 
                className="form-control" 
                style={{ fontWeight: '800', color: '#047857' }}
                value={amendmentNo} 
                onChange={e => setAmendmentNo(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label className="form-label">Enquiry Date *</label>
              <input 
                type="date" 
                className="form-control" 
                value={enquiryDate} 
                onChange={e => setEnquiryDate(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label className="form-label">Estimated Delivery Date *</label>
              <input 
                type="date" 
                className="form-control" 
                value={estimatedDeliveryDate} 
                onChange={e => setEstimatedDeliveryDate(e.target.value)} 
                required 
              />
            </div>
          </div>

          {/* Client Details Section */}
          <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={16} /> Customer / Client Details (Auto-linked Directory)
            </h4>

            <div className="form-grid-2">
              <div>
                <label className="form-label">Select Customer (Client Directory) *</label>
                <select 
                  className="form-control" 
                  style={{ fontWeight: '700' }}
                  value={selectedClientName} 
                  onChange={e => handleClientSelectChange(e.target.value)}
                  required
                >
                  {clients.map(c => (
                    <option key={c.id || c.name} value={c.name}>{c.name} ({c.gstin || 'GSTIN N/A'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Customer GSTIN *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={clientGstin} 
                  onChange={e => setClientGstin(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="form-label">Contact Person Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={contactPerson} 
                  onChange={e => setContactPerson(e.target.value)} 
                />
              </div>

              <div>
                <label className="form-label">Contact Mobile / Phone</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={contactPhone} 
                  onChange={e => setContactPhone(e.target.value)} 
                />
              </div>

              <div className="form-group-full">
                <label className="form-label">Customer Registered Address *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={clientAddress} 
                  onChange={e => setClientAddress(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group-full">
                <label className="form-label">Contact Email Address</label>
                <input 
                  type="email" 
                  className="form-control" 
                  value={contactEmail} 
                  onChange={e => setContactEmail(e.target.value)} 
                />
              </div>
            </div>
          </div>

          {/* Product Specifications & Rates Table */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                📦 Product Specifications & Format Pricing
              </h4>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                onClick={() => setItems([...items, { id: Date.now(), jobTitle: 'New Product Packaging', structure: 'PET 12µ / LDPE 40µ', materialFormat: 'Roll Form', quantity: 1000, uom: 'Kg', ratePerUom: 240, printWidthMm: 1000, repeatLengthMm: 400, gstPct: 18 }])}
              >
                <Plus size={14} /> + Add Product Item
              </button>
            </div>

            <table className="data-table" style={{ background: '#ffffff' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th>Job Title / Product</th>
                  <th>Structure Spec</th>
                  <th>Material Format *</th>
                  <th>Qty</th>
                  <th>UOM</th>
                  <th>Rate (₹)</th>
                  <th>Total (₹)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const qty = parseFloat(it.quantity) || 0;
                  const rate = parseFloat(it.ratePerUom) || 0;
                  const total = qty * rate * 1.18;

                  return (
                    <tr key={it.id || idx}>
                      <td>
                        <input 
                          type="text" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.82rem', fontWeight: '700' }}
                          value={it.jobTitle} 
                          onChange={e => {
                            const updated = [...items];
                            updated[idx].jobTitle = e.target.value;
                            setItems(updated);
                          }} 
                          required 
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={it.structure} 
                          onChange={e => {
                            const updated = [...items];
                            updated[idx].structure = e.target.value;
                            setItems(updated);
                          }} 
                          required 
                        />
                      </td>
                      <td>
                        <select 
                          className="form-control" 
                          style={{ padding: '4px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                          value={it.materialFormat || 'Roll Form'} 
                          onChange={e => {
                            const updated = [...items];
                            updated[idx].materialFormat = e.target.value;
                            setItems(updated);
                          }}
                        >
                          {MATERIAL_FORMATS.map(fmt => (
                            <option key={fmt} value={fmt}>{fmt}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ width: '90px' }}>
                        <input 
                          type="number" 
                          step="any"
                          className="form-control" 
                          style={{ padding: '4px 6px', fontSize: '0.85rem', fontWeight: '800' }}
                          value={it.quantity} 
                          onChange={e => {
                            const updated = [...items];
                            updated[idx].quantity = e.target.value;
                            setItems(updated);
                          }} 
                          required 
                        />
                      </td>
                      <td style={{ width: '95px' }}>
                        <select 
                          className="form-control" 
                          style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                          value={it.uom} 
                          onChange={e => {
                            const updated = [...items];
                            updated[idx].uom = e.target.value;
                            setItems(updated);
                          }}
                        >
                          <option value="Kg">Kg</option>
                          <option value="Pcs">Pcs</option>
                          <option value="Thousand Pouches">Thousand Pouches</option>
                          <option value="Sets">Sets</option>
                          <option value="Rolls">Rolls</option>
                        </select>
                      </td>
                      <td style={{ width: '100px' }}>
                        <input 
                          type="number" 
                          step="any"
                          className="form-control" 
                          style={{ padding: '4px 6px', fontSize: '0.85rem', fontWeight: '800' }}
                          value={it.ratePerUom} 
                          onChange={e => {
                            const updated = [...items];
                            updated[idx].ratePerUom = e.target.value;
                            setItems(updated);
                          }} 
                          required 
                        />
                      </td>
                      <td style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>
                        ₹ {Math.round(total).toLocaleString('en-IN')}
                      </td>
                      <td>
                        {items.length > 1 && (
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '4px 6px', color: '#dc2626', borderColor: '#fca5a5' }}
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Commercial Terms & Conditions Input Section */}
          <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '14px' }}>
              💳 Commercial & Logistics Terms
            </h4>

            <div className="form-grid-2">
              <div>
                <label className="form-label">Payment Terms *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={paymentTerms} 
                  onChange={e => setPaymentTerms(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="form-label">Cylinder Terms & Conditions *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={cylinderTerms} 
                  onChange={e => setCylinderTerms(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group-full">
                <label className="form-label">Transportation & Freight Terms *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={transportTerms} 
                  onChange={e => setTransportTerms(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group-full">
                <label className="form-label">Special Comments / Notes for Client</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  value={comments} 
                  onChange={e => setComments(e.target.value)} 
                />
              </div>
            </div>
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={() => setActiveSubTab('list')}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', padding: '10px 24px', fontWeight: '800' }}>
              <FileText size={18} /> Save Sales Quotation & Generate PDF
            </button>
          </div>
        </form>
      )}

      {/* OVERLAY: SALES QUOTATION PDF PREVIEW MODAL */}
      {activeQuotationForPDF && (
        <SalesQuotationPDF 
          quotationData={activeQuotationForPDF} 
          onClose={() => setActiveQuotationForPDF(null)} 
        />
      )}

    </div>
  );
}
