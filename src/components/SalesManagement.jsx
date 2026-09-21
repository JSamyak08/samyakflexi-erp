import React, { useState, useMemo, useEffect } from 'react';
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
  X,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import SalesQuotationPDF from './SalesQuotationPDF';
import { 
  calculateJobRawMaterials,
  isLDFilm,
  getFilmSlitWidth,
  DEFAULT_DAILY_RATES,
  DEFAULT_PROCESSING_RATES
} from '../factoryStore';
import { generateDocRefNumber, getNextDocRefNumber } from '../services/settingsService';
import { 
  fetchSalesQuotations, 
  saveSalesQuotationToSupabase, 
  deleteSalesQuotationFromSupabase 
} from '../services/supabaseDataService';

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
export const QUOTATION_TERMS_TEMPLATES = {
  STANDARD: {
    key: "STANDARD",
    name: "Standard Commercial Credit Terms (30 Days Net)",
    defaultPaymentTerms: "30 Days Net from date of Tax Invoice",
    defaultCylinderTerms: "Cylinder Development Cost borne by Buyer @ ₹6,500 / cylinder",
    defaultTransportTerms: "Freight Included (FOR Pithampur Factory / Destination)",
    terms: [
      "1. Material specifications as per sample approved by QA laboratory.",
      "2. Tax Invoice with GSTIN & HSN codes mandatory along with delivery challan.",
      "3. Price valid for 30 days from quotation date.",
      "4. Quantity variance tolerance +/- 10% allowed as per standard flexible packaging norms.",
      "5. Payment terms strict as per agreed credit terms (30 Days Net)."
    ]
  },
  ADVANCE_100: {
    key: "ADVANCE_100",
    name: "100% Advance Payment Terms (New / Non-Credit Clients)",
    defaultPaymentTerms: "100% Advance Payment prior to production start / dispatch",
    defaultCylinderTerms: "Cylinder charges 100% Advance along with Purchase Order",
    defaultTransportTerms: "Freight Charges Ex-Factory Pithampur / Freight Extra at Actuals",
    terms: [
      "1. 100% Advance payment required prior to manufacturing / dispatch.",
      "2. Cylinder development cost to be paid 100% in advance with purchase order.",
      "3. Price valid for 15 days from quotation date due to raw material rate fluctuations.",
      "4. Material specifications as per approved artwork proof & QA signed sample.",
      "5. Quantity tolerance +/- 10% applicable on final produced quantity."
    ]
  },
  PARTIAL_ADVANCE: {
    key: "PARTIAL_ADVANCE",
    name: "50% Advance & 50% Against Delivery Challan",
    defaultPaymentTerms: "50% Advance with PO, balance 50% against Delivery Challan before unloading",
    defaultCylinderTerms: "Cylinder charges 100% Advance with PO",
    defaultTransportTerms: "Freight Included (FOR Destination / Client Works)",
    terms: [
      "1. 50% Advance payment along with Purchase Order, balance 50% against Delivery Challan.",
      "2. Cylinder development charges borne 100% by buyer prior to cylinder engraving.",
      "3. Material specifications as per QA lab approval.",
      "4. Quantity tolerance +/- 10% applicable on actual reel / pouch production.",
      "5. Offer valid for 30 days from date of issue."
    ]
  },
  EXPRESS_JOB: {
    key: "EXPRESS_JOB",
    name: "Urgent Production / Express Delivery Terms",
    defaultPaymentTerms: "50% Advance with PO, balance within 7 days of delivery",
    defaultCylinderTerms: "Cylinder development cost borne by Buyer (Fast-track engraving)",
    defaultTransportTerms: "Express Freight Extra at Actuals",
    terms: [
      "1. Fast-track production schedule subject to immediate artwork approval & cylinder release.",
      "2. 50% Advance payment required; balance within 7 days of delivery.",
      "3. Price valid for 7 days from quotation date.",
      "4. Quantity tolerance +/- 10% as per flexible packaging standards.",
      "5. Express Freight & logistics charges extra at actuals."
    ]
  }
};

export const DEFAULT_QUOTATION_TERMS = QUOTATION_TERMS_TEMPLATES.STANDARD.terms;

// Standard Film Types for Flexible Packaging Layers
export const STANDARD_FILM_TYPES = [
  "PET",
  "METPET",
  "Natural LD GP Film",
  "Milky LD GP Film",
  "Natural LD Metallocene Film",
  "Milky LD Metallocene Film",
  "Milky Atta (High Dart) Film",
  "Natural GP LD",
  "White LD",
  "BOPP Natural",
  "Matte Finish BOPP",
  "Metalised BOPP",
  "Pearlised BOPP",
  "CPP Natural",
  "Metalised CPP",
  "Paper",
  "Aluminium Foil"
];

// Helper to parse plain structure string into layer objects
export function parseStructureToLayers(structureStr) {
  if (!structureStr || typeof structureStr !== 'string') {
    return [
      { id: 1, filmType: 'PET', micron: 12 },
      { id: 2, filmType: 'Natural GP LD', micron: 40 }
    ];
  }
  const parts = structureStr.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return [
      { id: 1, filmType: 'PET', micron: 12 },
      { id: 2, filmType: 'Natural GP LD', micron: 40 }
    ];
  }
  return parts.map((part, idx) => {
    // Matches e.g. "PET 12µ", "Natural LD 40 micron", "12 mic METPET", "BOPP 20"
    const match = part.match(/^(.*?)(?:[ -]+)?(\d+(?:\.\d+)?)\s*(?:µ|mic|micron|u)?\s*$/i) ||
                  part.match(/^(\d+(?:\.\d+)?)\s*(?:µ|mic|micron|u)?\s*(.*)$/i);
    if (match) {
      const filmCandidate = (match[1] || match[2] || '').trim();
      const micronCandidate = parseFloat(match[2] || match[1]) || 12;
      const matchedFilm = STANDARD_FILM_TYPES.find(f => f.toLowerCase() === filmCandidate.toLowerCase()) || 
                          STANDARD_FILM_TYPES.find(f => filmCandidate.toLowerCase().includes(f.toLowerCase())) ||
                          filmCandidate || 'PET';
      return { id: idx + 1, filmType: matchedFilm, micron: micronCandidate };
    }
    return { id: idx + 1, filmType: part, micron: 12 };
  });
}

// Helper to compute combined structure string from layers array
export function getStructureString(item) {
  if (item && item.materialFormat === 'Rotogravure Cylinder') {
    return item.description || item.structure || 'Rotogravure Cylinder';
  }
  if (item && item.layers && item.layers.length > 0) {
    return item.layers
      .map(l => `${l.filmType || 'PET'}${l.micron ? ' ' + l.micron + 'µ' : ''}`)
      .filter(Boolean)
      .join(' / ');
  }
  return item?.structure || '';
}

export default function SalesManagement({
  urlParams = {},
  orders = [],
  clients = [],
  jobMasters = [],
  cylinders = [],
  currentUser,
  userRole = "Sales Manager",
  onAddOrder,
  onAddJobMaster,
  onAddClient,
  onAddCylinder
}) {
  const isSalesAuthorized = useMemo(() => {
    if (!currentUser && !userRole) return true;
    const roleStr = String(currentUser?.role || userRole || '').toLowerCase().trim();
    return roleStr.includes('admin') || roleStr.includes('sales') || roleStr.includes('plant') || roleStr.includes('director');
  }, [currentUser, userRole]);

  const [quotations, setQuotations] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_sales_quotations');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Fetch sales quotations from Supabase on mount
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const remote = await fetchSalesQuotations();
      if (isMounted && remote && remote.length > 0) {
        setQuotations(remote);
        try {
          localStorage.setItem('samyak_erp_sales_quotations', JSON.stringify(remote));
        } catch (e) {}
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  const [activeSubTab, setActiveSubTab] = useState('list'); // 'list', 'create'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    if (urlParams && urlParams.id) {
      setSearchTerm(urlParams.id);
    }
  }, [urlParams?.id]);

  // PDF Preview State
  const [activeQuotationForPDF, setActiveQuotationForPDF] = useState(null);

  // OCN Conversion Confirmation Modal State
  const [ocnConvertModalQtn, setOcnConvertModalQtn] = useState(null);
  const [ocnDocRefNo, setOcnDocRefNo] = useState('');
  const [ocnConvertFormData, setOcnConvertFormData] = useState([]);

  // Form State for Create / Edit / Amend Quotation
  const [editingQuotationId, setEditingQuotationId] = useState(null);
  const [quotationNo, setQuotationNo] = useState('');
  const [revisionNo, setRevisionNo] = useState(0);
  const [amendmentNo, setAmendmentNo] = useState('Rev 00');
  const [enquiryDate, setEnquiryDate] = useState(new Date().toISOString().split('T')[0]);
  
  const defaultDelivery = new Date();
  defaultDelivery.setDate(defaultDelivery.getDate() + 14);
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState(defaultDelivery.toISOString().split('T')[0]);

  const [salesManager, setSalesManager] = useState(currentUser?.name || '');
  
  // Client Form Details — always start blank, filled only from Directory
  const [selectedClientName, setSelectedClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Client search state
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Add New Customer inline form
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientGstin, setNewClientGstin] = useState('');
  const [newClientContactPerson, setNewClientContactPerson] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');

  // Commercial Terms Form Fields
  const [paymentTerms, setPaymentTerms] = useState('');
  const [cylinderTerms, setCylinderTerms] = useState('');
  const [transportTerms, setTransportTerms] = useState('');
  const [comments, setComments] = useState('');

  // Line Items — start blank
  const [items, setItems] = useState([{
    id: 1, jobTitle: '', structure: '', materialFormat: 'Roll Form',
    quantity: '', uom: 'Kg', ratePerUom: '', printWidthMm: '', repeatLengthMm: '', gstPct: 18
  }]);

  const [selectedTermsTemplateKey, setSelectedTermsTemplateKey] = useState('STANDARD');
  const [termsList, setTermsList] = useState(QUOTATION_TERMS_TEMPLATES.STANDARD.terms);
  const [customTermInput, setCustomTermInput] = useState('');

  const handleApplyTermsTemplate = (templateKey) => {
    setSelectedTermsTemplateKey(templateKey);
    const tmpl = QUOTATION_TERMS_TEMPLATES[templateKey];
    if (tmpl) {
      setTermsList([...tmpl.terms]);
      if (tmpl.defaultPaymentTerms) setPaymentTerms(tmpl.defaultPaymentTerms);
      if (tmpl.defaultCylinderTerms) setCylinderTerms(tmpl.defaultCylinderTerms);
      if (tmpl.defaultTransportTerms) setTransportTerms(tmpl.defaultTransportTerms);
    }
  };

  const handleAddCustomTerm = () => {
    if (!customTermInput.trim()) return;
    const bulletNo = termsList.length + 1;
    const formattedTerm = `${bulletNo}. ${customTermInput.trim().replace(/^\d+\.\s*/, '')}`;
    setTermsList(prev => [...prev, formattedTerm]);
    setCustomTermInput('');
  };

  const handleRemoveTerm = (index) => {
    const updated = termsList.filter((_, i) => i !== index).map((t, idx) => {
      return `${idx + 1}. ${t.replace(/^\d+\.\s*/, '')}`;
    });
    setTermsList(updated);
  };

  // Filtered client suggestions based on search query
  const clientSuggestions = useMemo(() => {
    if (!clientSearchQuery.trim()) return clients;
    const q = clientSearchQuery.toLowerCase();
    return clients.filter(c =>
      (c.name || c.companyName || '').toLowerCase().includes(q) ||
      (c.gstin || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q)
    );
  }, [clients, clientSearchQuery]);

  // Fill all client fields from the selected client record
  const handleSelectClient = (client) => {
    const name = client.name || client.companyName || '';
    setSelectedClientName(name);
    setClientSearchQuery(name);
    setClientAddress(client.address || '');
    setClientGstin(client.gstin || '');
    setContactPerson(client.contactPerson || '');
    setContactPhone(client.phone || client.contactNo || '');
    setContactEmail(client.email || '');
    setShowClientDropdown(false);
  };

  // Save new customer and auto-select them
  const handleSaveNewClient = () => {
    if (!newClientName.trim()) {
      alert('Company Name is required!');
      return;
    }
    const newClient = {
      id: `CLT-${Date.now()}`,
      name: newClientName.trim(),
      companyName: newClientName.trim(),
      address: newClientAddress.trim(),
      gstin: newClientGstin.trim(),
      contactPerson: newClientContactPerson.trim(),
      phone: newClientPhone.trim(),
      email: newClientEmail.trim(),
      createdAt: new Date().toISOString()
    };
    if (onAddClient) onAddClient(newClient);
    // Auto-select the newly added client
    handleSelectClient(newClient);
    // Reset new client form
    setShowNewClientForm(false);
    setNewClientName(''); setNewClientAddress('');
    setNewClientGstin(''); setNewClientContactPerson('');
    setNewClientPhone(''); setNewClientEmail('');
  };

  // Job Master dropdown state for product items table
  const [activeJobDropdownIndex, setActiveJobDropdownIndex] = useState(null);

  // Filter Job Masters for autocomplete in Product Items table
  const getJobMasterSuggestions = (query, clientNameFilter) => {
    const allJM = Array.isArray(jobMasters) ? jobMasters : [];
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      if (clientNameFilter) {
        const clientNorm = clientNameFilter.toLowerCase().trim();
        const matched = allJM.filter(j => (j.clientName || '').toLowerCase().includes(clientNorm) || clientNorm.includes((j.clientName || '').toLowerCase()));
        const others = allJM.filter(j => !(j.clientName || '').toLowerCase().includes(clientNorm) && !clientNorm.includes((j.clientName || '').toLowerCase()));
        return [...matched, ...others];
      }
      return allJM;
    }
    return allJM.filter(j => 
      (j.jobName || '').toLowerCase().includes(q) ||
      (j.skuCode || '').toLowerCase().includes(q) ||
      (j.clientName || '').toLowerCase().includes(q) ||
      (j.structure || '').toLowerCase().includes(q) ||
      (j.id || '').toLowerCase().includes(q)
    );
  };

  // Auto-fill quotation item row from chosen Job Master
  const handleSelectJobMaster = (jm, rowIdx) => {
    const updated = [...items];
    const target = updated[rowIdx];
    target.jobTitle = jm.jobName || '';
    target.jobMasterId = jm.id;
    target.skuCode = jm.skuCode || '';

    // Pre-fill layers & structure
    if (Array.isArray(jm.layers) && jm.layers.length > 0) {
      target.layers = jm.layers.map((l, i) => ({
        id: l.id || (i + 1),
        filmType: l.filmType || 'PET',
        micron: Number(l.micron) || 12
      }));
      target.structure = getStructureString(target);
    } else if (jm.structure && jm.structure !== '—') {
      target.layers = parseStructureToLayers(jm.structure);
      target.structure = getStructureString(target);
    }

    // Pre-fill dimensions
    if (jm.printWidthMm) target.printWidthMm = jm.printWidthMm;
    if (jm.repeatLengthMm) target.repeatLengthMm = jm.repeatLengthMm;

    // Pre-fill material format
    if (jm.materialFormat) {
      const fmt = jm.materialFormat === 'Pouching' ? 'Standup Zipper Pouch Form' : jm.materialFormat === 'Reel' ? 'Roll Form' : jm.materialFormat;
      if (MATERIAL_FORMATS.includes(fmt)) target.materialFormat = fmt;
    }

    // Pre-fill rate if available
    const rateVal = jm.sellingPricePerKg || jm.ratePerKg || jm.ratePerUom;
    if (rateVal && !target.ratePerUom) {
      target.ratePerUom = rateVal;
    }

    setItems(updated);
    setActiveJobDropdownIndex(null);

    // If client is not yet selected in Quotation, auto-select from Job Master
    if (!selectedClientName && jm.clientName) {
      const matchedClient = (clients || []).find(c => 
        (c.name || c.companyName || '').toLowerCase().trim() === jm.clientName.toLowerCase().trim()
      );
      if (matchedClient) {
        handleSelectClient(matchedClient);
      } else {
        setSelectedClientName(jm.clientName);
        setClientSearchQuery(jm.clientName);
      }
    }
  };

  // Open Create Form — everything blank, no seed data
  const handleOpenCreateForm = () => {
    setEditingQuotationId(null);
    setQuotationNo(generateDocRefNumber('qtn'));
    setRevisionNo(0);
    setAmendmentNo('Rev 00');
    setEnquiryDate(new Date().toISOString().split('T')[0]);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    setEstimatedDeliveryDate(targetDate.toISOString().split('T')[0]);
    setSalesManager(currentUser?.name || currentUser?.fullName || '');
    // Client fields — blank
    setSelectedClientName('');
    setClientSearchQuery('');
    setClientAddress('');
    setClientGstin('');
    setContactPerson('');
    setContactPhone('');
    setContactEmail('');
    // Items — single row with structured film layers
    setItems([{ 
      id: 1, 
      jobTitle: '', 
      structure: 'PET 12µ / Natural GP LD 40µ', 
      materialFormat: 'Roll Form', 
      quantity: '', 
      uom: 'Kg', 
      ratePerUom: '', 
      printWidthMm: '', 
      repeatLengthMm: '', 
      gstPct: 18,
      layers: [
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'Natural GP LD', micron: 40 }
      ]
    }]);
    setPaymentTerms(QUOTATION_TERMS_TEMPLATES.STANDARD.defaultPaymentTerms);
    setCylinderTerms(QUOTATION_TERMS_TEMPLATES.STANDARD.defaultCylinderTerms);
    setTransportTerms(QUOTATION_TERMS_TEMPLATES.STANDARD.defaultTransportTerms);
    setComments('');
    setSelectedTermsTemplateKey('STANDARD');
    setTermsList([...QUOTATION_TERMS_TEMPLATES.STANDARD.terms]);
    setShowNewClientForm(false);
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

    const sanitizedItems = (qtn.items || []).map(it => {
      if (it.layers && it.layers.length > 0) return it;
      return {
        ...it,
        layers: parseStructureToLayers(it.structure)
      };
    });
    setItems(sanitizedItems.length > 0 ? sanitizedItems : [{
      id: 1,
      jobTitle: '',
      structure: 'PET 12µ / Natural GP LD 40µ',
      materialFormat: 'Roll Form',
      quantity: '',
      uom: 'Kg',
      ratePerUom: '',
      printWidthMm: 1000,
      repeatLengthMm: 400,
      gstPct: 18,
      layers: [
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'Natural GP LD', micron: 40 }
      ]
    }]);
    setTermsList(qtn.termsAndConditions || [...QUOTATION_TERMS_TEMPLATES.STANDARD.terms]);
    setSelectedTermsTemplateKey(qtn.termsTemplateKey || 'CUSTOM');
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

    if (!termsList || termsList.length === 0) {
      alert("⚠️ MANDATORY ENTRY REQUIRED:\n\nYou must select a Terms & Conditions template mandatorily before saving the Sales Quotation!");
      return;
    }

    const calculatedItems = items.map(it => {
      const qty = parseFloat(it.quantity) || 0;
      const rate = parseFloat(it.ratePerUom) || 0;
      const taxable = qty * rate;
      const gst = (taxable * (parseFloat(it.gstPct) || 18)) / 100;
      const isCylinder = it.materialFormat === 'Rotogravure Cylinder';
      const computedStructure = isCylinder ? (it.description || it.structure || 'Rotogravure Cylinder Set') : getStructureString(it);
      return {
        ...it,
        structure: computedStructure,
        description: isCylinder ? (it.description || computedStructure) : undefined,
        taxableAmount: taxable,
        gstAmount: gst,
        totalAmount: taxable + gst
      };
    });

    const finalQtnNo = editingQuotationId ? quotationNo : getNextDocRefNumber('qtn');

    const newQtn = {
      id: editingQuotationId || `QTN-${Date.now()}`,
      quotationNo: finalQtnNo,
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
      termsTemplateKey: selectedTermsTemplateKey,
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

    // Live sync to Supabase PostgreSQL table
    saveSalesQuotationToSupabase(newQtn);

    setActiveSubTab('list');
    setActiveQuotationForPDF(newQtn); // Open PDF preview!
    alert(`Sales Quotation ${finalQtnNo} (${amendmentNo}) saved & sent to client! Opening PDF preview now.`);
  };

  // Delete Sales Quotation
  const handleDeleteQuotation = async (id) => {
    if (!window.confirm("Are you sure you want to delete this Sales Quotation?")) return;
    const updated = quotations.filter(q => q.id !== id);
    setQuotations(updated);
    try {
      localStorage.setItem('samyak_erp_sales_quotations', JSON.stringify(updated));
    } catch (e) {}
    await deleteSalesQuotationFromSupabase(id);
  };

  // Open Interactive Convert to OCN Confirmation & Job Punching Modal
  const handleOpenOcnConvertModal = (qtn) => {
    if (qtn.status && qtn.status.includes('Confirmed')) {
      alert(`Quotation ${qtn.quotationNo} is already converted to OCN ${qtn.ocnRefNo}!`);
      return;
    }

    const ocnNo = getNextDocRefNumber('ocn');
    setOcnDocRefNo(ocnNo);

    // Build editable form data for each line item in quotation
    const rawItems = (qtn.items && qtn.items.length > 0) ? qtn.items : [qtn];
    const itemsData = rawItems.map((it, idx) => {
      const isCylinder = it.materialFormat === 'Rotogravure Cylinder';
      
      let layersData = [];
      if (it.layers && it.layers.length > 0) {
        layersData = it.layers.map((l, lIdx) => ({
          id: l.id || (lIdx + 1),
          filmType: l.filmType || 'PET',
          micron: parseFloat(l.micron) || 12,
          ratePerKg: parseFloat(l.ratePerKg || l.rate || DEFAULT_DAILY_RATES[l.filmType] || 125)
        }));
      } else {
        const str = (it.structure || getStructureString(it) || '').toLowerCase();
        if (str.includes('metpet')) {
          layersData = [
            { id: 1, filmType: 'PET', micron: 12, ratePerKg: 125 },
            { id: 2, filmType: 'METPET', micron: 12, ratePerKg: 140 },
            { id: 3, filmType: 'Natural GP LD', micron: 70, ratePerKg: 115 }
          ];
        } else if (str.includes('bopp')) {
          layersData = [
            { id: 1, filmType: 'BOPP Natural', micron: 20, ratePerKg: 130 },
            { id: 2, filmType: 'Metalised BOPP', micron: 18, ratePerKg: 145 },
            { id: 3, filmType: 'Natural GP LD', micron: 40, ratePerKg: 115 }
          ];
        } else {
          layersData = [
            { id: 1, filmType: 'PET', micron: 12, ratePerKg: 125 },
            { id: 2, filmType: 'Natural GP LD', micron: 70, ratePerKg: 115 }
          ];
        }
      }

      return {
        itemIndex: idx,
        jobMasterId: it.jobMasterId || '',
        jobTitle: it.jobTitle || it.description || qtn.jobName || 'Custom Packaging Job',
        printWidthMm: parseFloat(it.printWidthMm) || 1000,
        repeatLengthMm: parseFloat(it.repeatLengthMm) || 400,
        quantityKg: parseFloat(it.quantity) || 1000,
        ratePerUom: parseFloat(it.ratePerUom) || 250,
        materialFormat: it.materialFormat || 'Roll Form',
        targetDeliveryDate: qtn.estimatedDeliveryDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        structure: it.structure || getStructureString(it) || layersData.map(l => `${l.filmType} ${l.micron}µ`).join(' / '),
        layers: layersData,
        inkPrice: parseFloat(it.inkPrice) || 220,
        adhesivePrice: parseFloat(it.adhesivePrice) || 240,
        inkGsm: 1.5,
        adhesiveGsm: 1.5,
        isCylinderOrder: isCylinder,
        engraverName: it.engravuresName || qtn.engraverName || 'Jindal Engravers, Mathura',
        colorsCount: parseInt(it.colorsCount) || 8,
        cylinderCost: parseFloat(it.totalAmount) || (parseFloat(it.quantity) * parseFloat(it.ratePerUom)) || 35000
      };
    });

    setOcnConvertFormData(itemsData);
    setOcnConvertModalQtn(qtn);
  };

  const handleUpdateOcnItemField = (itemIdx, field, value) => {
    setOcnConvertFormData(prev => prev.map((item, idx) => {
      if (idx === itemIdx) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleUpdateOcnLayerField = (itemIdx, layerIdx, field, value) => {
    setOcnConvertFormData(prev => prev.map((item, idx) => {
      if (idx === itemIdx) {
        const updatedLayers = item.layers.map((l, lIdx) => {
          if (lIdx === layerIdx) {
            return { ...l, [field]: value };
          }
          return l;
        });
        const newStructure = updatedLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
        return { ...item, layers: updatedLayers, structure: newStructure };
      }
      return item;
    }));
  };

  const handleAddOcnLayer = (itemIdx) => {
    setOcnConvertFormData(prev => prev.map((item, idx) => {
      if (idx === itemIdx) {
        const newLayer = {
          id: item.layers.length + 1,
          filmType: 'Natural GP LD',
          micron: 40,
          ratePerKg: 115
        };
        const updatedLayers = [...item.layers, newLayer];
        const newStructure = updatedLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
        return { ...item, layers: updatedLayers, structure: newStructure };
      }
      return item;
    }));
  };

  const handleRemoveOcnLayer = (itemIdx, layerIdx) => {
    setOcnConvertFormData(prev => prev.map((item, idx) => {
      if (idx === itemIdx) {
        const updatedLayers = item.layers.filter((_, lIdx) => lIdx !== layerIdx);
        const newStructure = updatedLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
        return { ...item, layers: updatedLayers, structure: newStructure };
      }
      return item;
    }));
  };

  const handleConfirmAndPunchOCN = () => {
    if (!ocnConvertModalQtn || !ocnConvertFormData || ocnConvertFormData.length === 0) return;

    const qtn = ocnConvertModalQtn;
    const ocnNo = ocnDocRefNo || getNextDocRefNumber('ocn');

    let createdOrderIds = [];

    ocnConvertFormData.forEach((item, itemIdx) => {
      const isCylinderQuote = item.isCylinderOrder || item.materialFormat === 'Rotogravure Cylinder';
      const orderId = `ORD-2026-${Math.floor(100 + Math.random() * 900)}`;
      createdOrderIds.push(orderId);

      const printWidthMm = parseFloat(item.printWidthMm) || 1000;
      const repeatLengthMm = parseFloat(item.repeatLengthMm) || 400;
      const orderQtyKg = parseFloat(item.quantityKg) || 1000;
      const sellingPricePerKg = parseFloat(item.ratePerUom) || 250;
      const orderType = item.materialFormat.toLowerCase().includes('pouch') ? 'Pouching' : 'Reel';

      let layers = item.layers || [];
      let materialRequirements = [];
      let calcResults = null;
      let structure = item.structure || layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') || 'Custom Flexible Packaging';

      if (isCylinderQuote) {
        const cylinderSku = `CYL-${qtn.clientName.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        const engraverName = item.engraverName || 'Jindal Engravers, Mathura';
        const cylinderCost = `₹ ${parseFloat(item.cylinderCost || 35000).toLocaleString()}`;

        const newCyl = {
          id: `CYL-REC-${Date.now()}-${itemIdx}`,
          sku: cylinderSku,
          jobName: item.jobTitle || 'Rotogravure Cylinder Set',
          clientGroup: qtn.clientName,
          colorsCount: parseInt(item.colorsCount) || 8,
          cylinderCost: cylinderCost,
          engravuresName: engraverName,
          costBorneBy: 'Client (100%)',
          status: 'Under Engraving',
          poIssued: false,
          created_at: new Date().toISOString()
        };

        if (onAddCylinder) {
          onAddCylinder(newCyl);
        }
      } else {
        // Run full material calculation engine with confirmed pre-costing rates
        calcResults = calculateJobRawMaterials({
          jobName: item.jobTitle,
          printWidthMm,
          repeatLengthMm,
          orderQtyKg,
          orderType,
          inkGsm: parseFloat(item.inkGsm) || 1.5,
          adhesiveGsm: parseFloat(item.adhesiveGsm) || 1.5,
          layers: layers.map(l => ({
            ...l,
            pricePerKg: parseFloat(l.ratePerKg) || DEFAULT_DAILY_RATES[l.filmType] || 125
          })),
          inkPrice: parseFloat(item.inkPrice) || 220,
          adhesivePrice: parseFloat(item.adhesivePrice) || 240
        });

        if (calcResults && calcResults.layerResults) {
          calcResults.layerResults.forEach((layer, idx) => {
            materialRequirements.push({
              id: `REQ-${orderId}-${idx + 1}`,
              filmType: layer.filmType,
              micron: layer.micron,
              widthMm: layer.widthMm,
              qtyKg: parseFloat((layer.grossKg || 0).toFixed(2)),
              preferredVendor: isLDFilm(layer.filmType) ? 'Malwa Extrusions Pvt Ltd' : 'FlexiPoly Films Ltd',
              poIssued: false,
              poNumber: ''
            });
          });

          if (calcResults.inkDetails && calcResults.inkDetails.grossKg > 0) {
            materialRequirements.push({
              id: `REQ-${orderId}-INK`,
              filmType: 'Liquid Inks',
              micron: '-',
              widthMm: '-',
              qtyKg: parseFloat(calcResults.inkDetails.grossKg.toFixed(2)),
              preferredVendor: 'Siegwerk Inks Ltd',
              poIssued: false,
              poNumber: ''
            });
          }

          if (calcResults.adhesiveDetails && calcResults.adhesiveDetails.grossKg > 0) {
            materialRequirements.push({
              id: `REQ-${orderId}-ADH`,
              filmType: 'Solvent-less Adhesive',
              micron: '-',
              widthMm: '-',
              qtyKg: parseFloat(calcResults.adhesiveDetails.grossKg.toFixed(2)),
              preferredVendor: 'Siegwerk Inks Ltd',
              poIssued: false,
              poNumber: ''
            });
          }
        }
      }

      // Auto-create / Link Job Master
      let effectiveJobMaster = null;
      if (!isCylinderQuote) {
        const existingJM = (jobMasters || []).find(j => 
          (item.jobMasterId && j.id === item.jobMasterId) ||
          (j.jobName && item.jobTitle && j.jobName.toLowerCase().trim() === item.jobTitle.toLowerCase().trim())
        );

        effectiveJobMaster = existingJM;
        if (!effectiveJobMaster) {
          effectiveJobMaster = {
            id: item.jobMasterId || `JM-2026-${Math.floor(100 + Math.random() * 900)}`,
            skuCode: `SKU-${qtn.clientName.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
            jobName: item.jobTitle || 'Custom Flexible Packaging Job',
            clientName: qtn.clientName,
            structure,
            printWidthMm,
            repeatLengthMm,
            pouchOpenWidth: 120,
            pouchHeight: 160,
            materialFormat: item.materialFormat || 'Roll Form',
            layers,
            cylinderSku: `CYL-${qtn.clientName.substring(0, 3).toUpperCase()}-001`,
            cylinderCost: qtn.cylinderTerms || '₹ 35,000',
            colorsCount: 6,
            engravuresName: 'Acme Rotogravure Engravers',
            costBorneBy: 'Client (100%)',
            utilisationLimit: 10000,
            creationDate: new Date().toISOString().split('T')[0]
          };

          if (onAddJobMaster) {
            onAddJobMaster(effectiveJobMaster);
          }
        }
      }

      // Create Order
      const newOrder = {
        id: orderId,
        ocnNumber: ocnNo,
        jobMasterId: effectiveJobMaster ? effectiveJobMaster.id : null,
        jobName: item.jobTitle,
        clientName: qtn.clientName,
        orderQtyKg,
        quantityKg: orderQtyKg,
        orderType: isCylinderQuote ? 'Rotogravure Cylinder' : orderType,
        materialFormat: item.materialFormat || 'Roll Form',
        isCylinderOrder: isCylinderQuote,
        sellingPricePerKg,
        printWidthMm,
        repeatLengthMm,
        structure,
        layers,
        jobDetails: { layers, printWidthMm, repeatLengthMm, structure },
        cylinderDetails: isCylinderQuote ? {
          sku: `CYL-${qtn.clientName.substring(0, 3).toUpperCase()}-001`,
          jobName: item.jobTitle,
          description: item.jobTitle,
          quantity: orderQtyKg,
          rate: sellingPricePerKg,
          totalAmount: item.cylinderCost || 35000,
          engraverName: item.engraverName || 'Jindal Engravers, Mathura',
          colorsCount: parseInt(item.colorsCount) || 8,
          status: 'Under Engraving'
        } : null,
        engraverName: isCylinderQuote ? (item.engraverName || 'Jindal Engravers, Mathura') : undefined,
        orderDate: new Date().toISOString().split('T')[0],
        targetDeliveryDate: item.targetDeliveryDate || qtn.estimatedDeliveryDate,
        deliveryDate: item.targetDeliveryDate || qtn.estimatedDeliveryDate,
        poNumber: `PO-QTN-${qtn.quotationNo}`,
        poIssued: false,
        status: isCylinderQuote ? 'Under Engraving' : 'Confirmed',
        materialRequirements,
        rawMaterialRequirements: materialRequirements,
        calculationDetails: calcResults
      };

      if (onAddOrder) {
        onAddOrder(newOrder);
      }
    });

    // Update Quotation Status
    let updatedTarget = null;
    const updatedQuotations = quotations.map(q => {
      if (q.id === qtn.id) {
        updatedTarget = {
          ...q,
          status: "Confirmed (Converted to OCN)",
          ocnRefNo: ocnNo,
          convertedDate: new Date().toISOString().split('T')[0]
        };
        return updatedTarget;
      }
      return q;
    });

    setQuotations(updatedQuotations);
    try {
      localStorage.setItem('samyak_erp_sales_quotations', JSON.stringify(updatedQuotations));
    } catch (err) {}

    if (updatedTarget) {
      saveSalesQuotationToSupabase(updatedTarget);
    }

    setOcnConvertModalQtn(null);
    setOcnConvertFormData([]);

    alert(`🎉 SUCCESS!\n\nSales Quotation ${qtn.quotationNo} has been CONVERTED to Order Confirmation Note (${ocnNo}).\n\n- Order ${createdOrderIds.join(', ')} is now LIVE across Production, Inventory & Cylinder scheduling!`);
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
  const totalQuotationsCount = (quotations || []).length;
  const confirmedCount = (quotations || []).filter(q => q.status.includes('Confirmed')).length;
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
          <FileText size={18} /> Sales Quotations Directory ({(quotations || []).length})
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
              Showing <b>{(filteredQuotations || []).length}</b> of <b>{(quotations || []).length}</b> Quotations
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
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{mainItem.structure}</div>
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
                                onClick={() => handleOpenOcnConvertModal(qtn)}
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

                            {/* Delete Quotation Button */}
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444', borderColor: '#fca5a5' }}
                              onClick={() => handleDeleteQuotation(qtn.id)}
                              title="Delete Sales Quotation"
                            >
                              <Trash2 size={13} /> Delete
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={16} /> Customer / Client Details (Auto-linked Directory)
              </h4>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0284c7', borderColor: '#bae6fd' }}
                onClick={() => setShowNewClientForm(!showNewClientForm)}
              >
                <Plus size={14} /> {showNewClientForm ? 'Cancel Add Customer' : '+ Add New Customer'}
              </button>
            </div>

            {/* Inline New Customer Creation Form */}
            {showNewClientForm && (
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '18px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px' }}>
                  ➕ Quick Add New Customer to Directory
                </h5>
                <div className="form-grid-2">
                  <div>
                    <label className="form-label">Customer / Company Name *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. Acme Foods Pvt Ltd"
                      value={newClientName} 
                      onChange={e => setNewClientName(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="form-label">GSTIN Number</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. 23AAACA1234F1Z1"
                      value={newClientGstin} 
                      onChange={e => setNewClientGstin(e.target.value)} 
                    />
                  </div>
                  <div className="form-group-full">
                    <label className="form-label">Registered Address</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Full Address"
                      value={newClientAddress} 
                      onChange={e => setNewClientAddress(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="form-label">Contact Person</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Name"
                      value={newClientContactPerson} 
                      onChange={e => setNewClientContactPerson(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="form-label">Contact Mobile / Phone</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Phone Number"
                      value={newClientPhone} 
                      onChange={e => setNewClientPhone(e.target.value)} 
                    />
                  </div>
                  <div className="form-group-full">
                    <label className="form-label">Contact Email Address</label>
                    <input 
                      type="email" 
                      className="form-control" 
                      placeholder="Email"
                      value={newClientEmail} 
                      onChange={e => setNewClientEmail(e.target.value)} 
                    />
                  </div>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    onClick={() => setShowNewClientForm(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ padding: '4px 14px', fontSize: '0.8rem' }}
                    onClick={handleSaveNewClient}
                  >
                    Save & Select Customer
                  </button>
                </div>
              </div>
            )}

            <div className="form-grid-2">
              <div style={{ position: 'relative' }}>
                <label className="form-label">Search & Select Customer (Client Directory) *</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ fontWeight: '700' }}
                    placeholder="Type to search existing customer..."
                    value={clientSearchQuery || selectedClientName} 
                    onChange={e => {
                      setClientSearchQuery(e.target.value);
                      setSelectedClientName(e.target.value);
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    required
                  />
                </div>

                {/* Autocomplete Dropdown List */}
                {showClientDropdown && (
                  <div 
                    style={{ 
                      position: 'absolute', 
                      top: '100%', 
                      left: 0, 
                      right: 0, 
                      zIndex: 100, 
                      background: '#ffffff', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      maxHeight: '220px', 
                      overflowY: 'auto',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                    }}
                  >
                    {clientSuggestions.length > 0 ? (
                      clientSuggestions.map(c => {
                        const name = c.name || c.companyName || '';
                        return (
                          <div 
                            key={c.id || name}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseDown={() => handleSelectClient(c)}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                          >
                            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#0f172a' }}>{name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              GSTIN: {c.gstin || 'N/A'} {c.contactPerson ? `| Contact: ${c.contactPerson}` : ''}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: '12px', fontSize: '0.82rem', color: '#64748b', textAlign: 'center' }}>
                        No customer found matching "{clientSearchQuery}". <br/>
                        <button 
                          type="button" 
                          style={{ color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' }}
                          onClick={() => {
                            setNewClientName(clientSearchQuery);
                            setShowNewClientForm(true);
                            setShowClientDropdown(false);
                          }}
                        >
                          + Click to Add "{clientSearchQuery}" as New Customer
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
                onClick={() => setItems([...items, { 
                  id: Date.now(), 
                  jobTitle: '', 
                  materialFormat: 'Roll Form', 
                  quantity: '', 
                  uom: 'Kg', 
                  ratePerUom: '', 
                  printWidthMm: 1000, 
                  repeatLengthMm: 400, 
                  gstPct: 18,
                  layers: [
                    { id: 1, filmType: 'PET', micron: 12 },
                    { id: 2, filmType: 'Natural GP LD', micron: 40 }
                  ]
                }])}
              >
                <Plus size={14} /> + Add Product Item
              </button>
            </div>

            <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff' }}>
              <table className="data-table" style={{ width: '100%', minWidth: '920px', margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ width: '20%' }}>Job Title / Product</th>
                    <th style={{ width: '32%' }}>Structure / Description</th>
                    <th style={{ width: '16%' }}>Material Format *</th>
                    <th style={{ width: '7%' }}>Qty</th>
                    <th style={{ width: '8%' }}>UOM</th>
                    <th style={{ width: '8%' }}>Rate (₹)</th>
                    <th style={{ width: '9%' }}>Total (₹)</th>
                    <th style={{ width: '4%', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const qty = parseFloat(it.quantity) || 0;
                    const rate = parseFloat(it.ratePerUom) || 0;
                    const total = qty * rate * 1.18;
                    const isCylinder = it.materialFormat === 'Rotogravure Cylinder';
                    const currentLayers = it.layers || [
                      { id: 1, filmType: 'PET', micron: 12 },
                      { id: 2, filmType: 'Natural GP LD', micron: 40 }
                    ];

                    return (
                      <tr key={it.id || idx}>
                        <td style={{ verticalAlign: 'top', padding: '8px', position: 'relative' }}>
                          <div style={{ position: 'relative' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ 
                                padding: '5px 24px 5px 8px', 
                                fontSize: '0.82rem', 
                                fontWeight: '700',
                                borderColor: it.jobMasterId ? '#0284c7' : undefined,
                                background: it.jobMasterId ? '#f0f9ff' : '#ffffff'
                              }}
                              placeholder="Type product name or select Job Master..."
                              value={it.jobTitle} 
                              onChange={e => {
                                const val = e.target.value;
                                const updated = [...items];
                                updated[idx].jobTitle = val;
                                if (updated[idx].jobMasterId && updated[idx].jobTitle !== val) {
                                  updated[idx].jobMasterId = '';
                                }
                                setItems(updated);
                                setActiveJobDropdownIndex(idx);
                              }} 
                              onFocus={() => setActiveJobDropdownIndex(idx)}
                              required 
                            />
                            <button
                              type="button"
                              style={{
                                position: 'absolute',
                                right: '4px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                border: 'none',
                                background: 'none',
                                color: '#64748b',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              onClick={() => setActiveJobDropdownIndex(activeJobDropdownIndex === idx ? null : idx)}
                              title="Show Job Masters List"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>

                          {it.jobMasterId && (
                            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#0284c7', fontWeight: '700' }}>
                              <span style={{ background: '#e0f2fe', padding: '1px 6px', borderRadius: '3px', border: '1px solid #bae6fd', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                🔗 Master: {it.skuCode || it.jobMasterId}
                              </span>
                            </div>
                          )}

                          {/* Autocomplete Dropdown List for Job Masters */}
                          {activeJobDropdownIndex === idx && (
                            <>
                              <div 
                                style={{ position: 'fixed', inset: 0, zIndex: 99 }} 
                                onClick={() => setActiveJobDropdownIndex(null)}
                              />
                              <div 
                                style={{ 
                                  position: 'absolute', 
                                  top: '100%', 
                                  left: '8px', 
                                  width: '320px',
                                  zIndex: 100, 
                                  background: '#ffffff', 
                                  border: '1px solid #cbd5e1', 
                                  borderRadius: '6px', 
                                  maxHeight: '260px', 
                                  overflowY: 'auto',
                                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
                                  marginTop: '2px'
                                }}
                              >
                                <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.72rem', fontWeight: '800', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>📚 JOB MASTERS ({getJobMasterSuggestions(it.jobTitle, selectedClientName).length})</span>
                                  <span style={{ fontSize: '0.68rem', color: '#0284c7' }}>Auto-fills specs</span>
                                </div>

                                {getJobMasterSuggestions(it.jobTitle, selectedClientName).length > 0 ? (
                                  getJobMasterSuggestions(it.jobTitle, selectedClientName).map(jm => {
                                    const isClientMatch = selectedClientName && (jm.clientName || '').toLowerCase().includes(selectedClientName.toLowerCase().trim());
                                    return (
                                      <div 
                                        key={jm.id || jm.skuCode || jm.jobName}
                                        style={{ 
                                          padding: '8px 10px', 
                                          cursor: 'pointer', 
                                          borderBottom: '1px solid #f1f5f9',
                                          background: isClientMatch ? '#f8fafc' : '#ffffff'
                                        }}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleSelectJobMaster(jm, idx);
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = isClientMatch ? '#f8fafc' : '#ffffff'}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                          <div style={{ fontWeight: '800', fontSize: '0.84rem', color: '#0f172a' }}>
                                            {jm.jobName}
                                          </div>
                                          {jm.skuCode && (
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', background: '#e2e8f0', color: '#334155', padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                                              {jm.skuCode}
                                            </span>
                                          )}
                                        </div>

                                        <div style={{ fontSize: '0.74rem', color: '#0284c7', fontWeight: '600', marginTop: '2px' }}>
                                          🏢 {jm.clientName || 'General Client'}
                                          {isClientMatch && <span style={{ marginLeft: '4px', color: '#059669', fontWeight: '800' }}>✓ Client Match</span>}
                                        </div>

                                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px', background: '#f1f5f9', padding: '2px 5px', borderRadius: '3px', display: 'inline-block' }}>
                                          🔬 {jm.structure || (jm.layers && jm.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')) || 'Standard Structure'}
                                        </div>

                                        {(jm.printWidthMm || jm.repeatLengthMm) && (
                                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                                            Width: {jm.printWidthMm || 1000}mm | Repeat: {jm.repeatLengthMm || 400}mm
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div style={{ padding: '12px 10px', fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>
                                    No matching Job Master for "{it.jobTitle}".
                                    <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#059669', fontWeight: '700' }}>
                                      ✍️ Creating as New Product directly.
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                        <td style={{ verticalAlign: 'top', background: isCylinder ? '#f0f9ff' : '#fafafa', padding: '8px' }}>
                          {isCylinder ? (
                            <div style={{ padding: '2px 0' }}>
                              <label style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0284c7', display: 'block', marginBottom: '4px' }}>
                                Cylinder Description / Specs *
                              </label>
                              <textarea 
                                className="form-control" 
                                rows={3}
                                style={{ padding: '8px 10px', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', borderColor: '#38bdf8', minHeight: '75px', resize: 'vertical', lineHeight: '1.4' }}
                                placeholder={"e.g. 8 Color Engraved Cylinder Set\nCircumference: 420mm\nWidth: 1050mm"}
                                value={it.description !== undefined ? it.description : (it.structure && !it.structure.includes('µ') ? it.structure : '')} 
                                onChange={e => {
                                  const updated = [...items];
                                  updated[idx].description = e.target.value;
                                  updated[idx].structure = e.target.value;
                                  setItems(updated);
                                }} 
                                required={isCylinder}
                              />
                              <div style={{ fontSize: '0.7rem', color: '#0284c7', marginTop: '4px', fontStyle: 'italic', fontWeight: '600' }}>
                                ℹ️ Film Structure N/A for Rotogravure Cylinder
                              </div>
                            </div>
                          ) : (
                            /* Film Layers Builder */
                            <>
                              {currentLayers.map((layer, lIdx) => (
                                <div key={layer.id || lIdx} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 'bold', width: '22px', flexShrink: 0 }}>
                                    L{lIdx + 1}:
                                  </span>
                                  {/* Film Type Dropdown */}
                                  <select 
                                    className="form-control" 
                                    style={{ padding: '2px 4px', fontSize: '0.78rem', flex: 2, fontWeight: '700', minWidth: 0 }}
                                    value={layer.filmType || 'PET'}
                                    onChange={e => {
                                      const updated = [...items];
                                      if (!updated[idx].layers) updated[idx].layers = [...currentLayers];
                                      updated[idx].layers[lIdx].filmType = e.target.value;
                                      updated[idx].structure = getStructureString(updated[idx]);
                                      setItems(updated);
                                    }}
                                  >
                                    {STANDARD_FILM_TYPES.map(f => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </select>

                                  {/* Micron Field */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0 }}>
                                    <input 
                                      type="number" 
                                      step="any"
                                      className="form-control" 
                                      style={{ padding: '2px 4px', fontSize: '0.78rem', textAlign: 'center', fontWeight: '700' }}
                                      placeholder="Micron"
                                      value={layer.micron || ''}
                                      onChange={e => {
                                        const updated = [...items];
                                        if (!updated[idx].layers) updated[idx].layers = [...currentLayers];
                                        updated[idx].layers[lIdx].micron = e.target.value;
                                        updated[idx].structure = getStructureString(updated[idx]);
                                        setItems(updated);
                                      }}
                                    />
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'bold', flexShrink: 0 }}>µ</span>
                                  </div>

                                  {/* Remove Layer Icon */}
                                  {currentLayers.length > 1 && (
                                    <button 
                                      type="button" 
                                      style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                                      onClick={() => {
                                        const updated = [...items];
                                        updated[idx].layers = currentLayers.filter((_, i) => i !== lIdx);
                                        updated[idx].structure = getStructureString(updated[idx]);
                                        setItems(updated);
                                      }}
                                      title="Remove Layer"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              ))}

                              {/* Add Layer & Computed Structure Summary */}
                              <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button 
                                  type="button" 
                                  style={{ background: 'none', border: '1px dashed #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '0.72rem', color: '#0284c7', cursor: 'pointer', fontWeight: 'bold' }}
                                  onClick={() => {
                                    const updated = [...items];
                                    const nextFilm = currentLayers.length === 1 ? 'METPET' : 'Natural GP LD';
                                    const nextMicron = currentLayers.length === 1 ? 12 : 35;
                                    updated[idx].layers = [...currentLayers, { id: Date.now(), filmType: nextFilm, micron: nextMicron }];
                                    updated[idx].structure = getStructureString(updated[idx]);
                                    setItems(updated);
                                  }}
                                >
                                  + Add Layer
                                </button>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#047857' }}>
                                  {getStructureString(it) || 'PET 12µ / LD 40µ'}
                                </div>
                              </div>
                            </>
                          )}
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '8px' }}>
                          <select 
                            className="form-control" 
                            style={{ padding: '4px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                            value={it.materialFormat || 'Roll Form'} 
                            onChange={e => {
                              const updated = [...items];
                              const newFmt = e.target.value;
                              updated[idx].materialFormat = newFmt;
                              if (newFmt === 'Rotogravure Cylinder') {
                                if (!updated[idx].description) {
                                  updated[idx].description = updated[idx].jobTitle ? `${updated[idx].jobTitle} - Cylinder Set` : 'Rotogravure Cylinder Set';
                                }
                                updated[idx].structure = updated[idx].description;
                              } else {
                                updated[idx].structure = getStructureString(updated[idx]);
                              }
                              setItems(updated);
                            }}
                          >
                            {MATERIAL_FORMATS.map(fmt => (
                              <option key={fmt} value={fmt}>{fmt}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '8px' }}>
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
                        <td style={{ verticalAlign: 'top', padding: '8px' }}>
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
                        <td style={{ verticalAlign: 'top', padding: '8px' }}>
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
                        <td style={{ verticalAlign: 'top', padding: '12px 8px', fontWeight: '800', color: 'var(--primary-brand)', fontSize: '0.85rem' }}>
                          ₹ {Math.round(total).toLocaleString('en-IN')}
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '8px', textAlign: 'center' }}>
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
          </div>

          {/* Terms & Conditions Template Selection Section (MANDATORY) */}
          <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📜 Terms & Conditions Template <span style={{ color: '#dc2626', fontWeight: '900' }}>* (Mandatory Selection)</span>
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Select a pre-approved commercial terms template or customize clauses for this quotation before saving.
                </p>
              </div>
              <span className="badge" style={{ background: termsList.length > 0 ? '#dcfce7' : '#fee2e2', color: termsList.length > 0 ? '#15803d' : '#dc2626', fontWeight: '700', border: termsList.length > 0 ? '1px solid #86efac' : '1px solid #fca5a5' }}>
                {termsList.length > 0 ? `✓ ${termsList.length} Clauses Active` : '⚠️ Mandatory Selection Required'}
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontWeight: '700' }}>Choose Terms Template *</label>
              <select 
                className="form-control" 
                style={{ fontWeight: '700', color: '#1e293b', background: '#ffffff', border: '1px solid #94a3b8' }}
                value={selectedTermsTemplateKey}
                onChange={e => handleApplyTermsTemplate(e.target.value)}
                required
              >
                {Object.values(QUOTATION_TERMS_TEMPLATES).map(tmpl => (
                  <option key={tmpl.key} value={tmpl.key}>{tmpl.name}</option>
                ))}
                <option value="CUSTOM">Custom Selected Terms & Conditions</option>
              </select>
            </div>

            {/* Selected Terms Bullet List Preview & Management */}
            <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active Terms Bullets ({termsList.length}):
              </div>

              {termsList.length === 0 ? (
                <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '0.82rem', fontWeight: '700', textAlign: 'center' }}>
                  ⚠️ No Terms & Conditions selected! Please choose a template above or add custom clauses.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {termsList.map((term, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{term}</span>
                      <button 
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                        onClick={() => handleRemoveTerm(idx)}
                        title="Remove this clause"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom Clause Bullet */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input 
                  type="text" 
                  className="form-control"
                  style={{ fontSize: '0.82rem' }}
                  placeholder="Type additional custom term/clause bullet here..."
                  value={customTermInput}
                  onChange={e => setCustomTermInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTerm(); } }}
                />
                <button 
                  type="button"
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', padding: '6px 12px', fontWeight: '700' }}
                  onClick={handleAddCustomTerm}
                >
                  <Plus size={14} /> Add Bullet
                </button>
              </div>
            </div>
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

      {/* OVERLAY: CONVERT TO OCN & PRE-COSTING CONFIRMATION MODAL */}
      {ocnConvertModalQtn && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ width: '92vw', maxWidth: '1100px', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Convert Quotation to OCN & Pre-Costing Job Punching
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Quotation Ref: <strong>{ocnConvertModalQtn.quotationNo}</strong> | Client: <strong>{ocnConvertModalQtn.clientName}</strong> | Generated OCN: <strong style={{ color: '#047857' }}>{ocnDocRefNo}</strong>
                  </span>
                </div>
              </div>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '6px 12px', border: 'none', background: '#f1f5f9', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => setOcnConvertModalQtn(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Confirmation Form for Each Job Item */}
            {ocnConvertFormData.map((item, itemIdx) => {
              const calc = !item.isCylinderOrder ? calculateJobRawMaterials({
                jobName: item.jobTitle,
                printWidthMm: parseFloat(item.printWidthMm) || 1000,
                repeatLengthMm: parseFloat(item.repeatLengthMm) || 400,
                orderQtyKg: parseFloat(item.quantityKg) || 1000,
                orderType: item.materialFormat.toLowerCase().includes('pouch') ? 'Pouching' : 'Reel',
                inkGsm: parseFloat(item.inkGsm) || 1.5,
                adhesiveGsm: parseFloat(item.adhesiveGsm) || 1.5,
                layers: (item.layers || []).map(l => ({
                  ...l,
                  pricePerKg: parseFloat(l.ratePerKg) || DEFAULT_DAILY_RATES[l.filmType] || 125
                })),
                inkPrice: parseFloat(item.inkPrice) || 220,
                adhesivePrice: parseFloat(item.adhesivePrice) || 240
              }) : null;

              const totalSellingVal = (parseFloat(item.quantityKg) || 0) * (parseFloat(item.ratePerUom) || 0);
              const totalMatCost = calc ? calc.totalCost : 0;
              const grossMargin = totalSellingVal - totalMatCost;
              const marginPct = totalSellingVal > 0 ? ((grossMargin / totalSellingVal) * 100).toFixed(1) : 0;

              return (
                <div key={itemIdx} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#0284c7', color: '#ffffff', fontSize: '0.78rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px' }}>
                        JOB #{itemIdx + 1}
                      </span>
                      <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{item.jobTitle}</strong>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                      Format: <strong style={{ color: '#0f172a' }}>{item.materialFormat}</strong>
                    </span>
                  </div>

                  {/* Form Fields Grid */}
                  <div className="form-grid-3" style={{ gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label className="form-label">Job Title / Product Name *</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={item.jobTitle} 
                        onChange={e => handleUpdateOcnItemField(itemIdx, 'jobTitle', e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="form-label">Film Width (mm) *</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ fontWeight: '700', color: '#0284c7' }}
                          value={item.printWidthMm} 
                          onChange={e => handleUpdateOcnItemField(itemIdx, 'printWidthMm', e.target.value)} 
                        />
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>mm</span>
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Repeat Length / Size (mm)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="number" 
                          className="form-control" 
                          value={item.repeatLengthMm} 
                          onChange={e => handleUpdateOcnItemField(itemIdx, 'repeatLengthMm', e.target.value)} 
                        />
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>mm</span>
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Order Quantity (Kg) *</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ fontWeight: '700' }}
                          value={item.quantityKg} 
                          onChange={e => handleUpdateOcnItemField(itemIdx, 'quantityKg', e.target.value)} 
                        />
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>kg</span>
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Packaging Form *</label>
                      <select 
                        className="form-control" 
                        value={item.materialFormat} 
                        onChange={e => handleUpdateOcnItemField(itemIdx, 'materialFormat', e.target.value)}
                      >
                        <option value="Roll Form">Roll Form (Reel)</option>
                        <option value="Standup Zipper Pouch Form">Standup Zipper Pouch Form</option>
                        <option value="Center Seal Pouch Form">Center Seal Pouch Form</option>
                        <option value="Side Seal Pouch Form">Side Seal Pouch Form</option>
                        <option value="Quad Seal Pouch Form">Quad Seal Pouch Form</option>
                        <option value="Rotogravure Cylinder">Rotogravure Cylinder</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Target Delivery Date *</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        style={{ fontWeight: '700' }}
                        value={item.targetDeliveryDate} 
                        onChange={e => handleUpdateOcnItemField(itemIdx, 'targetDeliveryDate', e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="form-label">Quoted Selling Rate (₹/kg) *</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#047857' }}>₹</span>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ fontWeight: '700', color: '#047857' }}
                          value={item.ratePerUom} 
                          onChange={e => handleUpdateOcnItemField(itemIdx, 'ratePerUom', e.target.value)} 
                        />
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>/kg</span>
                      </div>
                    </div>

                    <div className="form-group-full">
                      <label className="form-label">Film Structure (Pre-filled as per Quote)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        style={{ fontWeight: '700', background: '#ffffff' }}
                        value={item.structure} 
                        onChange={e => handleUpdateOcnItemField(itemIdx, 'structure', e.target.value)} 
                      />
                    </div>
                  </div>

                  {/* Non-cylinder orders: Pre-Costing Raw Material Rates & Breakdown */}
                  {!item.isCylinderOrder && (
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={15} style={{ color: '#0284c7' }} /> Pre-Costing Raw Material Daily Rates (₹/kg) & Structure Layers
                      </h4>

                      <div style={{ overflowX: 'auto', marginBottom: '10px' }}>
                        <table className="data-table" style={{ fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                              <th style={{ width: '60px' }}>Layer</th>
                              <th>Film Grade / Type</th>
                              <th>Micron (µ)</th>
                              <th>Slit Width (mm)</th>
                              <th>Raw Material Rate (₹/kg) *</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.layers.map((l, lIdx) => (
                              <tr key={lIdx}>
                                <td style={{ fontWeight: '700', textAlign: 'center' }}>L{lIdx + 1}</td>
                                <td>
                                  <select 
                                    className="form-control" 
                                    style={{ padding: '2px 6px', fontSize: '0.78rem' }}
                                    value={l.filmType} 
                                    onChange={e => handleUpdateOcnLayerField(itemIdx, lIdx, 'filmType', e.target.value)}
                                  >
                                    {Object.keys(DEFAULT_DAILY_RATES).map(ft => (
                                      <option key={ft} value={ft}>{ft}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    className="form-control" 
                                    style={{ width: '70px', padding: '2px 6px', textAlign: 'center', fontWeight: '700' }}
                                    value={l.micron} 
                                    onChange={e => handleUpdateOcnLayerField(itemIdx, lIdx, 'micron', e.target.value)}
                                  />
                                </td>
                                <td style={{ fontWeight: '600' }}>
                                  {getFilmSlitWidth(l.filmType, item.printWidthMm)} mm
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#0284c7' }}>₹</span>
                                    <input 
                                      type="number" 
                                      className="form-control" 
                                      style={{ width: '90px', padding: '2px 6px', fontWeight: '700', color: '#0284c7', textAlign: 'right' }}
                                      value={l.ratePerKg} 
                                      onChange={e => handleUpdateOcnLayerField(itemIdx, lIdx, 'ratePerKg', e.target.value)}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>/kg</span>
                                  </div>
                                </td>
                                <td>
                                  {item.layers.length > 1 && (
                                    <button 
                                      type="button" 
                                      className="btn-secondary" 
                                      style={{ padding: '2px 6px', color: '#dc2626' }}
                                      onClick={() => handleRemoveOcnLayer(itemIdx, lIdx)}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}
                        onClick={() => handleAddOcnLayer(itemIdx)}
                      >
                        <Plus size={13} /> Add Film Structure Layer
                      </button>

                      {/* Inks & Adhesive Pre-Costing Rates */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Liquid Ink Rate (₹/kg)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0284c7' }}>₹</span>
                            <input 
                              type="number" 
                              className="form-control" 
                              style={{ padding: '3px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                              value={item.inkPrice} 
                              onChange={e => handleUpdateOcnItemField(itemIdx, 'inkPrice', e.target.value)} 
                            />
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>/kg</span>
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Solvent-less Adhesive Rate (₹/kg)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0284c7' }}>₹</span>
                            <input 
                              type="number" 
                              className="form-control" 
                              style={{ padding: '3px 6px', fontSize: '0.8rem', fontWeight: '700' }}
                              value={item.adhesivePrice} 
                              onChange={e => handleUpdateOcnItemField(itemIdx, 'adhesivePrice', e.target.value)} 
                            />
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>/kg</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pre-Costing Summary Card */}
                  {!item.isCylinderOrder && calc && (
                    <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '14px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TrendingUp size={15} /> Pre-Costing & Profitability Summary
                      </h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Total Selling Value</span>
                          <strong style={{ fontSize: '1rem', color: '#047857' }}>₹ {totalSellingVal.toLocaleString()}</strong>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Raw Material Cost</span>
                          <strong style={{ fontSize: '1rem', color: '#b91c1c' }}>₹ {totalMatCost.toLocaleString()}</strong>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Gross Pre-Cost Margin</span>
                          <strong style={{ fontSize: '1rem', color: grossMargin >= 0 ? '#047857' : '#dc2626' }}>
                            ₹ {grossMargin.toLocaleString()} ({marginPct}%)
                          </strong>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Material Cost / Kg</span>
                          <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                            ₹ {(calc.costPerKg || 0).toFixed(2)} / kg
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '8px 18px', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => setOcnConvertModalQtn(null)}
              >
                Cancel
              </button>

              <button 
                type="button" 
                className="btn-primary" 
                style={{ padding: '10px 24px', fontWeight: '800', background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                onClick={handleConfirmAndPunchOCN}
              >
                <CheckCircle2 size={18} /> Confirm Specs & Punch Order to OCN
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
