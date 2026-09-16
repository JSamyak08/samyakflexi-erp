import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Printer, 
  CheckCircle2, 
  FileCheck, 
  Calendar, 
  User, 
  Building2, 
  Trash2, 
  Edit3, 
  X, 
  FlaskConical, 
  ChevronRight, 
  Package, 
  TrendingUp, 
  Layers, 
  ArrowUpRight,
  ShieldCheck,
  Award
} from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import DeliveryChallanPDF from './DeliveryChallanPDF';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import CertificateOfAnalysisPDF, { DEFAULT_COA_PARAMETERS } from './CertificateOfAnalysisPDF';
export function getChallanNatureBadge(nature) {
  const n = nature || 'Sale of Goods';
  switch (n) {
    case 'Sale of Goods':
      return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd', icon: '🛒', label: 'Sale of Goods' };
    case 'Returnable Material':
      return { bg: '#fff7ed', color: '#c2410c', border: '#ffedd5', icon: '🔄', label: 'Returnable Material' };
    case 'Non-Returnable Material':
      return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', icon: '📦', label: 'Non-Returnable Material' };
    case 'Job Work Material - Returnable':
      return { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', icon: '⚙️', label: 'Job Work (Returnable)' };
    case 'Maintenance Material - Returnable':
      return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: '🔧', label: 'Maintenance (Returnable)' };
    default:
      return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd', icon: '✓', label: n };
  }
}

export const DEFAULT_MATERIAL_TEMPLATES = [
  {
    id: 'tpl-2layer-pet-ld',
    name: '2 Layer: PET 12µ + Poly 50µ (Standard Pouch)',
    isBuiltIn: true,
    specification: '2 layer (12 PET + 50 Deep Freeze LD)',
    filmType: 'natural Deep Freeze (80%)',
    thicknessMicron: '50µ',
    parameters: [
      { srNo: 1, parameter: "Total Thickness", uom: "Micron", standard: "50 ( ± 5 % )", observation: "" },
      { srNo: 2, parameter: "Average GSM", uom: "g/m²", standard: "64.5 ( ± 3 % )", observation: "" },
      { srNo: 3, parameter: "Pouch Dim.", uom: "MM", standard: "700 x 500 ( +2mm -1 mm)", observation: "" },
      { srNo: 4, parameter: "Printing Matter", uom: "—", standard: "As Per Art Work", observation: "" },
      { srNo: 5, parameter: "Shade", uom: "—", standard: "As Per Customer sample", observation: "" },
      { srNo: 6, parameter: "Direction", uom: "—", standard: "Readable", observation: "" },
      { srNo: 7, parameter: "Diameter", uom: "MM", standard: "310 mm", observation: "" },
      { srNo: 8, parameter: "Tensile strength", uom: "Kg/sq.cm", standard: "MD - 250 | TD - 230", observation: "" },
      { srNo: 9, parameter: "Elongation", uom: "%", standard: "MD - 450 | TD - 550", observation: "" },
      { srNo: 10, parameter: "Surface Tension", uom: "Dynes/cm", standard: "40 - 42", observation: "" },
      { srNo: 11, parameter: "Sealing Strength", uom: "Kgf/15mm", standard: "> 2.50", observation: "" },
      { srNo: 12, parameter: "Bond Strength", uom: "Kgf/15mm", standard: "> 0.400", observation: "" },
      { srNo: 13, parameter: "Kinetic coefficient of Friction ( outer to Metal )", uom: "unit", standard: "0.15 - 0.24", observation: "" },
      { srNo: 14, parameter: "Winding", uom: "—", standard: "Strength Buildup", observation: "" },
      { srNo: 15, parameter: "Odor", uom: "—", standard: "Should Pass", observation: "" },
      { srNo: 16, parameter: "Print Quality", uom: "—", standard: "Tecotap Test at 45° angle", observation: "" },
      { srNo: 17, parameter: "Joints", uom: "Rolls", standard: "Average less than 1 (Max 2)", observation: "" }
    ]
  },
  {
    id: 'tpl-3layer-pet-metpet-ld',
    name: '3 Layer: PET 12µ + METPET 12µ + Poly 50µ (High Barrier)',
    isBuiltIn: true,
    specification: '3 layer (12 PET + 12 METPET + 50 Poly)',
    filmType: 'Metallic Barrier Laminate',
    thicknessMicron: '74µ',
    parameters: [
      { srNo: 1, parameter: "Total Thickness", uom: "Micron", standard: "74 ( ± 5 % )", observation: "" },
      { srNo: 2, parameter: "Average GSM", uom: "g/m²", standard: "92.0 ( ± 3 % )", observation: "" },
      { srNo: 3, parameter: "Pouch Dim.", uom: "MM", standard: "As Per Spec", observation: "" },
      { srNo: 4, parameter: "Printing Matter", uom: "—", standard: "As Per Art Work", observation: "" },
      { srNo: 5, parameter: "Shade", uom: "—", standard: "As Per Customer sample", observation: "" },
      { srNo: 6, parameter: "Direction", uom: "—", standard: "Readable", observation: "" },
      { srNo: 7, parameter: "Barrier OTR (Oxygen Trans. Rate)", uom: "cc/m²/day", standard: "< 1.5", observation: "" },
      { srNo: 8, parameter: "Barrier WVTR (Water Vapor Trans. Rate)", uom: "g/m²/day", standard: "< 1.0", observation: "" },
      { srNo: 9, parameter: "Tensile strength", uom: "Kg/sq.cm", standard: "MD - 350 | TD - 320", observation: "" },
      { srNo: 10, parameter: "Sealing Strength", uom: "Kgf/15mm", standard: "> 3.0", observation: "" },
      { srNo: 11, parameter: "Bond Strength (PET/METPET)", uom: "Kgf/15mm", standard: "> 0.35", observation: "" },
      { srNo: 12, parameter: "Bond Strength (METPET/PE)", uom: "Kgf/15mm", standard: "> 0.45", observation: "" },
      { srNo: 13, parameter: "Print Quality", uom: "—", standard: "Tape Test Pass", observation: "" },
      { srNo: 14, parameter: "Odor", uom: "—", standard: "Solvent Free / Odorless", observation: "" }
    ]
  },
  {
    id: 'tpl-3layer-pet-foil-ld',
    name: '3 Layer: PET 12µ + Alu Foil 7µ + Poly 50µ (Ultra Barrier)',
    isBuiltIn: true,
    specification: '3 layer (12 PET + 7 ALU FOIL + 50 Poly)',
    filmType: 'Foil Barrier Laminate',
    thicknessMicron: '69µ',
    parameters: [
      { srNo: 1, parameter: "Total Thickness", uom: "Micron", standard: "69 ( ± 5 % )", observation: "" },
      { srNo: 2, parameter: "Average GSM", uom: "g/m²", standard: "115.0 ( ± 3 % )", observation: "" },
      { srNo: 3, parameter: "Pouch Dim.", uom: "MM", standard: "As Per Spec", observation: "" },
      { srNo: 4, parameter: "Printing Matter", uom: "—", standard: "As Per Art Work", observation: "" },
      { srNo: 5, parameter: "Shade", uom: "—", standard: "As Per Customer sample", observation: "" },
      { srNo: 6, parameter: "Pin Hole Count (Foil)", uom: "No./m²", standard: "0 Pin Holes", observation: "" },
      { srNo: 7, parameter: "Sealing Strength", uom: "Kgf/15mm", standard: "> 3.5", observation: "" },
      { srNo: 8, parameter: "Bond Strength (PET/FOIL)", uom: "Kgf/15mm", standard: "> 0.30", observation: "" },
      { srNo: 9, parameter: "Bond Strength (FOIL/PE)", uom: "Kgf/15mm", standard: "> 0.40", observation: "" },
      { srNo: 10, parameter: "Odor", uom: "—", standard: "Pass", observation: "" }
    ]
  }
];

export default function DispatchManagement({
  deliveryChallans = [],
  certificateOfAnalyses = [],
  clients = [],
  vendors = [],
  jobMasters = [],
  orders = [],
  cylinders = [],
  currentUser,
  onSaveDeliveryChallan,
  onDeleteDeliveryChallan,
  onSaveCoA,
  onDeleteCoA,
  urlParams = {}
}) {
  const [activeTab, setActiveTab] = useState(() => {
    if (urlParams.subTab === 'coas' || urlParams.tab === 'coas' || urlParams.coaId || urlParams.coaNo) {
      return 'coas';
    }
    return 'challans';
  });

  const handleTabSwitch = (tabKey) => {
    setActiveTab(tabKey);
    try {
      if (typeof window !== 'undefined' && window.history) {
        const url = new URL(window.location.href);
        url.searchParams.set('subTab', tabKey);
        window.history.replaceState({ subTab: tabKey }, '', url.toString());
      }
    } catch (e) {
      console.warn("Failed to push subTab to URL", e);
    }
  };

  // Modal States
  const [isDcModalOpen, setIsDcModalOpen] = useState(false);
  const [editingDcId, setEditingDcId] = useState(null);
  const [activeDcForPDF, setActiveDcForPDF] = useState(null);

  const [isCoaModalOpen, setIsCoaModalOpen] = useState(false);
  const [editingCoaId, setEditingCoaId] = useState(null);
  const [activeCoaForPDF, setActiveCoaForPDF] = useState(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

  // Deep link auto-open for DC or COA modals when id, challanNo, coaId is present in URL
  React.useEffect(() => {
    const targetId = urlParams.id || urlParams.challanNo || urlParams.dcNo;
    if (targetId) {
      const matchedDc = deliveryChallans.find(dc => 
        String(dc.id) === String(targetId) || 
        String(dc.challanNo) === String(targetId)
      );
      if (matchedDc) {
        setActiveDcForPDF(matchedDc);
      }
    }
    const targetCoa = urlParams.coaId || urlParams.coaNo;
    if (targetCoa) {
      const matchedCoa = certificateOfAnalyses.find(coa => 
        String(coa.id) === String(targetCoa) || 
        String(coa.coaNo) === String(targetCoa)
      );
      if (matchedCoa) {
        setActiveCoaForPDF(matchedCoa);
        setActiveTab('coas');
      }
    }
  }, [urlParams, deliveryChallans, certificateOfAnalyses]);

  // --------------------------------------------------------------------------
  // DC FORM STATE
  // --------------------------------------------------------------------------
  const [dcChallanNo, setDcChallanNo] = useState('');
  const [dcInvoiceNo, setDcInvoiceNo] = useState('');
  const [dcDispatchDateTime, setDcDispatchDateTime] = useState('');
  const [dcPartyType, setDcPartyType] = useState('Client'); // 'Client' | 'Vendor'
  const [dcSelectedClientName, setDcSelectedClientName] = useState('');
  const [dcClientAddress, setDcClientAddress] = useState('');
  const [dcClientGstin, setDcClientGstin] = useState('');
  const [dcClientContactPerson, setDcClientContactPerson] = useState('');
  const [dcClientPhone, setDcClientPhone] = useState('');
  const [dcVehicleNo, setDcVehicleNo] = useState('');
  const [dcTransporterName, setDcTransporterName] = useState('');
  const [dcDriverPhone, setDcDriverPhone] = useState('');
  const [dcPoRefNo, setDcPoRefNo] = useState('');
  const [dcJobName, setDcJobName] = useState('');
  const [dcChallanNature, setDcChallanNature] = useState('Returnable Material');
  const [dcFreightCharges, setDcFreightCharges] = useState(0);
  const [dcGstRatePct, setDcGstRatePct] = useState(18);
  const [dcTaxType, setDcTaxType] = useState('auto'); // 'auto' | 'cgst_sgst' | 'igst'
  const [dcDispatchedBy, setDcDispatchedBy] = useState('');
  const [dcRemarks, setDcRemarks] = useState('');
  const [dcItems, setDcItems] = useState([]);
  const [dcTerms, setDcTerms] = useState([]);

  // Material Return Inward Modal & History States
  const [selectedDcForReturn, setSelectedDcForReturn] = useState(null);
  const [viewReturnHistoryDc, setViewReturnHistoryDc] = useState(null);
  const [returnDate, setReturnDate] = useState('');
  const [returnedQty, setReturnedQty] = useState('');
  const [returnUnit, setReturnUnit] = useState('Kg');
  const [returnRefDocNo, setReturnRefDocNo] = useState('');
  const [returnTransporter, setReturnTransporter] = useState('');
  const [returnVehicleNo, setReturnVehicleNo] = useState('');
  const [returnLrNo, setReturnLrNo] = useState('');
  const [returnCondition, setReturnCondition] = useState('Good Condition & Pass QC');
  const [returnedBy, setReturnedBy] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [isFullyReturned, setIsFullyReturned] = useState(false);

  // Presets list combining Job Masters & Rotogravure Cylinders
  const itemPresetOptions = useMemo(() => {
    const list = [];

    // 1. From Job Masters
    (jobMasters || []).forEach(jm => {
      const jName = jm.jobName || jm.name || 'Job Master Item';
      const cName = jm.clientName || 'Client';
      const sku = jm.skuCode || jm.sku || jm.id || '';
      list.push({
        id: `JM-${jm.id || jName}`,
        category: 'Job Master',
        label: `Job Master: ${jName} (${cName}${sku ? ' - SKU: ' + sku : ''})`,
        description: `${jName} - Flexible Packaging Printed Laminated Film${sku ? ' (SKU: ' + sku + ')' : ''}`,
        hsnSac: '3923',
        quantity: 1000,
        unit: 'Kg',
        rate: Number(jm.sellingPricePerKg) || 185
      });
    });

    // 2. From Rotogravure Cylinders
    (cylinders || []).forEach(c => {
      const cName = c.jobName || 'Rotogravure Cylinder Set';
      const colors = c.colorsCount || 6;
      const eng = c.engravuresName || 'Job Work Repair';
      list.push({
        id: `CYL-${c.id || cName}`,
        category: 'Rotogravure Cylinder',
        label: `Cylinder: ${cName} - ${colors} Colors Set (${eng})`,
        description: `Rotogravure Printing Cylinders (${colors} Colors Set) for ${cName} - Sent for Repair / Re-engraving / Chrome Plating Job Work`,
        hsnSac: '8442',
        quantity: Number(colors) || 6,
        unit: 'Nos',
        rate: Number(c.costPerCylinder) || 0
      });
    });

    return list;
  }, [jobMasters, cylinders]);

  // --------------------------------------------------------------------------
  // COA FORM STATE & MATERIAL STRUCTURE TEMPLATES
  // --------------------------------------------------------------------------
  const [coaTemplates, setCoaTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_coa_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customOnly = parsed.filter(p => !DEFAULT_MATERIAL_TEMPLATES.some(d => d.id === p.id));
          return [...DEFAULT_MATERIAL_TEMPLATES, ...customOnly];
        }
      }
    } catch (e) {
      console.error("Failed to load saved CoA templates:", e);
    }
    return DEFAULT_MATERIAL_TEMPLATES;
  });

  const [selectedCoaTemplateId, setSelectedCoaTemplateId] = useState(DEFAULT_MATERIAL_TEMPLATES[0].id);

  const [coaNo, setCoaNo] = useState('');
  const [coaTestDate, setCoaTestDate] = useState('');
  const [coaCustomerName, setCoaCustomerName] = useState('');
  const [coaJobName, setCoaJobName] = useState('');
  const [coaInvoiceNo, setCoaInvoiceNo] = useState('');
  const [coaJobCode, setCoaJobCode] = useState('1');
  const [coaFilmType, setCoaFilmType] = useState('');
  const [coaNetWeight, setCoaNetWeight] = useState('');
  const [coaSpecification, setCoaSpecification] = useState('');
  const [coaSizeMm, setCoaSizeMm] = useState('');
  const [coaThicknessMicron, setCoaThicknessMicron] = useState('');
  const [coaBatchLotNo, setCoaBatchLotNo] = useState('');
  const [coaOverallStatus, setCoaOverallStatus] = useState('PASSED & APPROVED');
  const [coaQcInspector, setCoaQcInspector] = useState('');
  const [coaApprovedByHead, setCoaApprovedByHead] = useState('');
  const [coaRemarks, setCoaRemarks] = useState('');
  const [coaParameters, setCoaParameters] = useState([]);

  // Handler to apply selected Material Structure Template
  const handleSelectCoaTemplate = (templateId) => {
    setSelectedCoaTemplateId(templateId);
    const matched = coaTemplates.find(t => t.id === templateId);
    if (matched) {
      setCoaSpecification(matched.specification || '');
      setCoaFilmType(matched.filmType || '');
      setCoaThicknessMicron(matched.thicknessMicron || '');
      
      const cleanParams = (matched.parameters || []).map((p, idx) => ({
        srNo: idx + 1,
        parameter: p.parameter || '',
        uom: p.uom || '—',
        standard: p.standard || '',
        observation: ''
      }));
      setCoaParameters(cleanParams);
    }
  };

  // Handler to save current CoA material structure and test parameters as a new template
  const handleSaveCurrentAsTemplate = () => {
    const tplName = prompt("Enter a name for this Material Structure Template:", coaSpecification || "Custom Structure Template");
    if (!tplName || !tplName.trim()) return;

    const newTpl = {
      id: `custom-tpl-${Date.now()}`,
      name: tplName.trim(),
      isBuiltIn: false,
      specification: coaSpecification,
      filmType: coaFilmType,
      thicknessMicron: coaThicknessMicron,
      parameters: coaParameters.map(p => ({
        parameter: p.parameter,
        uom: p.uom,
        standard: p.standard,
        observation: ''
      }))
    };

    const updated = [...coaTemplates, newTpl];
    setCoaTemplates(updated);
    setSelectedCoaTemplateId(newTpl.id);
    try {
      localStorage.setItem('samyak_coa_templates', JSON.stringify(updated.filter(t => !t.isBuiltIn)));
    } catch (e) {
      console.error("Failed to save template to localStorage:", e);
    }
    alert(`Material Structure Template "${newTpl.name}" saved successfully!`);
  };

  // Handler to delete a custom template
  const handleDeleteCoaTemplate = (templateId) => {
    const target = coaTemplates.find(t => t.id === templateId);
    if (!target) return;
    if (target.isBuiltIn) {
      alert("Built-in system templates cannot be deleted.");
      return;
    }
    if (confirm(`Are you sure you want to delete template "${target.name}"?`)) {
      const updated = coaTemplates.filter(t => t.id !== templateId);
      setCoaTemplates(updated);
      const nextId = updated[0]?.id || '';
      setSelectedCoaTemplateId(nextId);
      if (nextId) {
        handleSelectCoaTemplate(nextId);
      }
      try {
        localStorage.setItem('samyak_coa_templates', JSON.stringify(updated.filter(t => !t.isBuiltIn)));
      } catch (e) {
        console.error("Failed to delete template from localStorage:", e);
      }
    }
  };

  // --------------------------------------------------------------------------
  // OPEN DC MODAL HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenNewDcModal = () => {
    setEditingDcId(null);
    const nextRef = generateDocRefNumber('dc');
    setDcChallanNo(nextRef);
    setDcInvoiceNo('');
    
    const now = new Date();
    const isoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setDcDispatchDateTime(isoString);

    setDcPartyType('Client');
    // Default to first client if available
    const firstClient = (clients && clients[0]) || {};
    const firstName = firstClient.name || firstClient.companyName || firstClient.clientName || '';
    setDcSelectedClientName(firstName);
    setDcClientAddress(firstClient.address || firstClient.factoryAddress || firstClient.registeredAddress || '');
    setDcClientGstin(firstClient.gstin || firstClient.gstNumber || '');
    setDcClientContactPerson(firstClient.contactPerson || firstClient.contactName || '');
    setDcClientPhone(firstClient.phone || firstClient.contactNo || firstClient.mobile || '');

    setDcVehicleNo('');
    setDcTransporterName('');
    setDcDriverPhone('');
    setDcPoRefNo('');
    setDcJobName('');
    setDcChallanNature('Sale of Goods');
    setDcFreightCharges(0);
    setDcGstRatePct(18);
    setDcTaxType('auto');
    setDcDispatchedBy(currentUser ? `${currentUser.name}` : '');
    setDcRemarks('');

    setDcItems([
      { id: Date.now(), description: '', itemDetails: '', hsnSac: '', quantity: 0, unit: 'Kg', rate: 0, amount: 0 }
    ]);

    const defaultTerms = getDocumentTerms().dcTerms || [];
    setDcTerms([...defaultTerms]);

    setIsDcModalOpen(true);
  };

  const handleEditDc = (dc) => {
    setEditingDcId(dc.id);
    setDcChallanNo(dc.challanNo);
    setDcInvoiceNo(dc.invoiceNo || '');
    setDcDispatchDateTime(dc.dispatchDateTime || '');
    setDcPartyType(dc.partyType || 'Client');
    setDcSelectedClientName(dc.clientName || dc.partyName || '');
    setDcClientAddress(dc.clientAddress || '');
    setDcClientGstin(dc.clientGstin || '');
    setDcClientContactPerson(dc.clientContactPerson || '');
    setDcClientPhone(dc.clientPhone || '');
    setDcVehicleNo(dc.vehicleNo || '');
    setDcTransporterName(dc.transporterName || '');
    setDcDriverPhone(dc.driverPhone || '');
    setDcPoRefNo(dc.poRefNo || '');
    setDcJobName(dc.jobName || '');
    setDcChallanNature(dc.challanNature || dc.movementType || 'Sale of Goods');
    setDcFreightCharges(dc.freightCharges || 0);
    setDcGstRatePct(dc.gstRatePct || 18);
    setDcTaxType(dc.taxType || 'auto');
    setDcDispatchedBy(dc.dispatchedBy || '');
    setDcRemarks(dc.remarks || '');
    setDcItems(Array.isArray(dc.items) && dc.items.length > 0 ? dc.items.map(i => ({ ...i, itemDetails: i.itemDetails || '' })) : []);
    setDcTerms(Array.isArray(dc.termsAndConditions) ? dc.termsAndConditions : (getDocumentTerms().dcTerms || []));

    setIsDcModalOpen(true);
  };

  const handlePartySelectChange = (partyTypeStr, partyNameStr) => {
    setDcSelectedClientName(partyNameStr);
    if (partyTypeStr === 'Vendor') {
      const matched = (vendors || []).find(v => (v.name || v.vendorName || v.companyName) === partyNameStr);
      if (matched) {
        setDcClientAddress(matched.address || matched.factoryAddress || matched.registeredAddress || matched.officeAddress || '');
        setDcClientGstin(matched.gstin || matched.gstNumber || '');
        setDcClientContactPerson(matched.contactPerson || matched.contactName || '');
        setDcClientPhone(matched.phone || matched.contactNo || matched.mobile || '');
      }
    } else {
      const matched = (clients || []).find(c => (c.name || c.companyName || c.clientName) === partyNameStr);
      if (matched) {
        setDcClientAddress(matched.address || matched.factoryAddress || matched.registeredAddress || '');
        setDcClientGstin(matched.gstin || matched.gstNumber || '');
        setDcClientContactPerson(matched.contactPerson || matched.contactName || '');
        setDcClientPhone(matched.phone || matched.contactNo || matched.mobile || '');
      }
    }
  };

  const handleAddDcItemRow = () => {
    setDcItems(prev => [
      ...prev,
      { id: Date.now(), description: 'Finished Flexible Packaging Roll', itemDetails: 'Detailed Material Specification', hsnSac: '3923', quantity: 500, unit: 'Kg', rate: 190, amount: 95000 }
    ]);
  };

  const handleUpdateDcItemRow = (id, field, val) => {
    setDcItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: val };
        if (field === 'quantity' || field === 'rate') {
          const q = parseFloat(field === 'quantity' ? val : updated.quantity) || 0;
          const r = parseFloat(field === 'rate' ? val : updated.rate) || 0;
          updated.amount = Number((q * r).toFixed(2));
        }
        return updated;
      }
      return item;
    }));
  };

  const handleRemoveDcItemRow = (id) => {
    if (dcItems.length <= 1) {
      alert("At least one item row is required in the Delivery Challan.");
      return;
    }
    setDcItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveDcSubmit = (e) => {
    e.preventDefault();

    const finalChallanNo = editingDcId ? dcChallanNo : getNextDocRefNumber('dc');

    const subtotalItems = dcItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const freightAmount = parseFloat(dcFreightCharges) || 0;
    const totalTaxable = subtotalItems + freightAmount;

    const gstInfo = calculateGSTBreakdown(dcClientGstin, dcClientAddress, totalTaxable, dcGstRatePct, COMPANY_DETAILS.gstin, dcTaxType);
    const grandTotal = gstInfo.grandTotal;

    const isReturnable = ['Returnable Material', 'Job Work Material - Returnable', 'Maintenance Material - Returnable'].includes(dcChallanNature);

    const existingDc = (deliveryChallans || []).find(d => d.id === editingDcId);

    const payload = {
      id: editingDcId || `DC-${Date.now()}`,
      challanNo: finalChallanNo,
      invoiceNo: dcInvoiceNo,
      dispatchDateTime: dcDispatchDateTime,
      partyType: dcPartyType,
      clientName: dcSelectedClientName,
      partyName: dcSelectedClientName,
      clientAddress: dcClientAddress,
      clientGstin: dcClientGstin,
      clientContactPerson: dcClientContactPerson,
      clientPhone: dcClientPhone,
      vehicleNo: dcVehicleNo,
      transporterName: dcTransporterName,
      driverPhone: dcDriverPhone,
      poRefNo: dcPoRefNo,
      jobName: dcJobName,
      challanNature: dcChallanNature,
      freightCharges: freightAmount,
      items: dcItems,
      gstRatePct: parseFloat(dcGstRatePct) || 18,
      taxType: dcTaxType,
      subtotalAmount: subtotalItems,
      taxableSubtotal: totalTaxable,
      grandTotalAmount: grandTotal,
      returnStatus: existingDc?.returnStatus || (isReturnable ? 'Outbound (Pending Return)' : 'Non-Returnable'),
      returnInwardHistory: existingDc?.returnInwardHistory || [],
      dispatchedBy: dcDispatchedBy,
      remarks: dcRemarks,
      termsAndConditions: dcTerms,
      createdDate: new Date().toISOString()
    };

    if (onSaveDeliveryChallan) {
      onSaveDeliveryChallan(payload);
    }

    setIsDcModalOpen(false);
    setActiveDcForPDF(payload);
  };

  // Helper to apply preset item selection to a specific DC row
  const handleApplyPresetToDcRow = (rowId, presetObj) => {
    if (!presetObj) return;
    setDcItems(prev => prev.map(item => {
      if (item.id === rowId) {
        const qty = parseFloat(presetObj.quantity) || 1;
        const rate = parseFloat(presetObj.rate) || 0;
        return {
          ...item,
          description: presetObj.description,
          itemDetails: presetObj.itemDetails || '',
          hsnSac: presetObj.hsnSac || '3923',
          quantity: qty,
          unit: presetObj.unit || 'Kg',
          rate: rate,
          amount: Number((qty * rate).toFixed(2))
        };
      }
      return item;
    }));
  };

  // Open Return Inward Modal Handler
  const handleOpenReturnModal = (dc) => {
    setSelectedDcForReturn(dc);
    const now = new Date();
    const isoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setReturnDate(isoString);
    setReturnedQty('');
    const defaultUnit = (dc.items && dc.items[0] && dc.items[0].unit) ? dc.items[0].unit : 'Kg';
    setReturnUnit(defaultUnit);
    setReturnRefDocNo('');
    setReturnTransporter(dc.transporterName || '');
    setReturnVehicleNo(dc.vehicleNo || '');
    setReturnLrNo('');
    setReturnCondition('Good Condition & Pass QC');
    setReturnedBy(currentUser ? `${currentUser.name}` : '');
    setReturnNotes('');
    setIsFullyReturned(false);
  };

  // Submit Return Inward Entry
  const handleConfirmReturnInward = (e) => {
    e.preventDefault();
    if (!selectedDcForReturn) return;

    const qtyVal = parseFloat(returnedQty) || 0;
    const logEntry = {
      id: `RET-${Date.now()}`,
      timestamp: new Date().toISOString(),
      returnDateTime: returnDate || new Date().toISOString(),
      returnedQty: qtyVal,
      unit: returnUnit,
      returnRefDocNo,
      returnTransporter,
      returnVehicleNo,
      returnLrNo,
      returnCondition,
      returnedBy: returnedBy || currentUser?.name || 'Store Receiver',
      returnNotes
    };

    const prevHistory = Array.isArray(selectedDcForReturn.returnInwardHistory) ? selectedDcForReturn.returnInwardHistory : [];
    const updatedHistory = [logEntry, ...prevHistory];

    const totalReturned = updatedHistory.reduce((sum, item) => sum + (parseFloat(item.returnedQty) || 0), 0);
    const originalQty = (selectedDcForReturn.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

    let newStatus = 'Outbound (Pending Return)';
    if (isFullyReturned || (originalQty > 0 && totalReturned >= originalQty)) {
      newStatus = 'Fully Returned';
    } else if (totalReturned > 0) {
      newStatus = 'Partially Returned';
    }

    const updatedDc = {
      ...selectedDcForReturn,
      returnStatus: newStatus,
      totalReturnedQty: totalReturned,
      returnInwardHistory: updatedHistory
    };

    if (onSaveDeliveryChallan) {
      onSaveDeliveryChallan(updatedDc);
    }

    setSelectedDcForReturn(null);
  };

  // --------------------------------------------------------------------------
  // OPEN COA MODAL HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenNewCoaModal = () => {
    setEditingCoaId(null);
    const nextCoa = generateDocRefNumber('coa');
    setCoaNo(nextCoa);
    setCoaTestDate(new Date().toLocaleDateString('en-GB'));
    
    // All user fields are left empty for fresh entry by user
    setCoaCustomerName('');
    setCoaJobName('');
    setCoaJobCode('');
    setCoaInvoiceNo('');
    setCoaBatchLotNo('');
    setCoaNetWeight('');
    setCoaSizeMm('');
    setCoaOverallStatus('PASSED & APPROVED');
    setCoaQcInspector(currentUser ? `${currentUser.name} (QC Inspector)` : '');
    setCoaApprovedByHead('');
    setCoaRemarks('Material tested strictly in Quality Control Laboratory and meets all agreed technical specifications. Approved for dispatch.');

    // Load active or default material structure template parameters & specs
    const activeTemplate = coaTemplates.find(t => t.id === selectedCoaTemplateId) || coaTemplates[0];
    if (activeTemplate) {
      setSelectedCoaTemplateId(activeTemplate.id);
      setCoaFilmType(activeTemplate.filmType || '');
      setCoaSpecification(activeTemplate.specification || '');
      setCoaThicknessMicron(activeTemplate.thicknessMicron || '');
      setCoaParameters((activeTemplate.parameters || []).map((p, idx) => ({
        srNo: idx + 1,
        parameter: p.parameter,
        uom: p.uom,
        standard: p.standard,
        observation: ''
      })));
    } else {
      setCoaFilmType('');
      setCoaSpecification('');
      setCoaThicknessMicron('');
      setCoaParameters(DEFAULT_COA_PARAMETERS.map(p => ({ ...p, observation: '' })));
    }

    setIsCoaModalOpen(true);
  };

  const handleEditCoa = (coa) => {
    setEditingCoaId(coa.id);
    setCoaNo(coa.coaNo);
    setCoaTestDate(coa.testDate || '');
    setCoaCustomerName(coa.customerName || '');
    setCoaJobName(coa.jobName || '');
    setCoaInvoiceNo(coa.invoiceNo || '');
    setCoaJobCode(coa.jobCode || '1');
    setCoaFilmType(coa.filmType || '');
    setCoaNetWeight(coa.netWeight || '');
    setCoaSpecification(coa.specification || '');
    setCoaSizeMm(coa.sizeMm || '');
    setCoaThicknessMicron(coa.thicknessMicron || '');
    setCoaBatchLotNo(coa.batchLotNo || '');
    setCoaOverallStatus(coa.overallStatus || 'PASSED & APPROVED');
    setCoaQcInspector(coa.qcInspector || '');
    setCoaApprovedByHead(coa.approvedByHead || '');
    setCoaRemarks(coa.remarks || '');
    setCoaParameters(Array.isArray(coa.parameters) && coa.parameters.length > 0 ? coa.parameters : DEFAULT_COA_PARAMETERS);

    setIsCoaModalOpen(true);
  };

  const handleJobSelectChange = (jobNameStr) => {
    setCoaJobName(jobNameStr);
    const matched = jobMasters.find(j => j.jobName === jobNameStr);
    if (matched) {
      setCoaJobCode(matched.id ? String(matched.id).replace('JM-', '') : '1');
      if (matched.clientName) setCoaCustomerName(matched.clientName);
      if (matched.structure) setCoaSpecification(`Multi-layer (${matched.structure})`);
      if (matched.printWidthMm) setCoaSizeMm(`${matched.printWidthMm} mm`);
    }
  };

  const handleAddCoaParameterRow = () => {
    const nextSr = coaParameters.length + 1;
    setCoaParameters(prev => [
      ...prev,
      { srNo: nextSr, parameter: 'New QC Test Parameter', uom: '—', standard: 'As per artwork / TDS', observation: 'Pass' }
    ]);
  };

  const handleUpdateCoaParameterRow = (index, field, val) => {
    setCoaParameters(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleRemoveCoaParameterRow = (index) => {
    setCoaParameters(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveCoaSubmit = (e) => {
    e.preventDefault();

    const finalCoaNo = editingCoaId ? coaNo : getNextDocRefNumber('coa');

    const payload = {
      id: editingCoaId || `COA-${Date.now()}`,
      coaNo: finalCoaNo,
      testDate: coaTestDate,
      customerName: coaCustomerName,
      jobName: coaJobName,
      invoiceNo: coaInvoiceNo,
      jobCode: coaJobCode,
      filmType: coaFilmType,
      netWeight: coaNetWeight,
      specification: coaSpecification,
      sizeMm: coaSizeMm,
      thicknessMicron: coaThicknessMicron,
      batchLotNo: coaBatchLotNo,
      overallStatus: coaOverallStatus,
      qcInspector: coaQcInspector,
      approvedByHead: coaApprovedByHead,
      remarks: coaRemarks,
      parameters: coaParameters,
      createdDate: new Date().toISOString()
    };

    if (onSaveCoA) {
      onSaveCoA(payload);
    }

    setIsCoaModalOpen(false);
    setActiveCoaForPDF(payload);
  };

  // --------------------------------------------------------------------------
  // FILTERED DATA FOR TABLES
  // --------------------------------------------------------------------------
  const filteredChallans = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (deliveryChallans || []).filter(dc => 
      (dc.challanNo || '').toLowerCase().includes(term) ||
      (dc.invoiceNo || '').toLowerCase().includes(term) ||
      (dc.clientName || '').toLowerCase().includes(term) ||
      (dc.vehicleNo || '').toLowerCase().includes(term)
    );
  }, [deliveryChallans, searchTerm]);

  const filteredCoAs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (certificateOfAnalyses || []).filter(coa => 
      (coa.coaNo || '').toLowerCase().includes(term) ||
      (coa.customerName || '').toLowerCase().includes(term) ||
      (coa.jobName || '').toLowerCase().includes(term) ||
      (coa.invoiceNo || '').toLowerCase().includes(term) ||
      (coa.batchLotNo || '').toLowerCase().includes(term)
    );
  }, [certificateOfAnalyses, searchTerm]);

  const challanPagination = usePagination(filteredChallans, 10);
  const coaPagination = usePagination(filteredCoAs, 10);

  // Statistics
  const safeChallans = deliveryChallans || [];
  const safeCoAs = certificateOfAnalyses || [];

  const totalChallansCount = safeChallans.length;
  const totalDispatchedQtyKg = safeChallans.reduce((sum, dc) => {
    const items = dc.items || [];
    return sum + items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
  }, 0);
  const totalChallanValue = safeChallans.reduce((sum, dc) => sum + (parseFloat(dc.grandTotalAmount) || 0), 0);

  const totalCoasCount = safeCoAs.length;
  const passedCoasCount = safeCoAs.filter(c => (c.overallStatus || '').includes('PASSED') || (c.overallStatus || '').includes('APPROVED')).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* PDF Viewers */}
      {activeDcForPDF && (
        <DeliveryChallanPDF challanData={activeDcForPDF} onClose={() => setActiveDcForPDF(null)} />
      )}
      {activeCoaForPDF && (
        <CertificateOfAnalysisPDF coaData={activeCoaForPDF} onClose={() => setActiveCoaForPDF(null)} />
      )}

      {/* Executive Header Banner */}
      <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff', borderRadius: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(2, 132, 199, 0.2)', padding: '10px', borderRadius: '12px', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                <Truck size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.45rem', fontWeight: '800', margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  Finished Goods Dispatch & Certificate of Analysis (CoA) Hub
                </h2>
                <p style={{ fontSize: '0.84rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Issue Delivery Challans with GST breakdown & letterhead • Generate & print Quality Test Reports (CoA)
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-primary" 
              onClick={handleOpenNewDcModal}
              style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', padding: '10px 18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} /> + Issue Delivery Challan
            </button>

            <button 
              className="btn-primary" 
              onClick={handleOpenNewCoaModal}
              style={{ background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', padding: '10px 18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FlaskConical size={18} /> + Generate Quality CoA
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
          <button 
            type="button" 
            className={`btn-subtab ${activeTab === 'challans' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('challans')}
            style={{
              background: activeTab === 'challans' ? '#0284c7' : 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              border: activeTab === 'challans' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Truck size={16} /> Delivery Challans ({totalChallansCount})
          </button>

          <button 
            type="button" 
            className={`btn-subtab ${activeTab === 'coas' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('coas')}
            style={{
              background: activeTab === 'coas' ? '#047857' : 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              border: activeTab === 'coas' ? '1px solid #34d399' : '1px solid rgba(255, 255, 255, 0.1)',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Award size={16} /> Quality Test Reports (CoA) ({totalCoasCount})
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      {activeTab === 'challans' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #0284c7' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Challans Issued</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{totalChallansCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#0284c7', marginTop: '2px' }}>With dual seal & signatures</div>
          </div>

          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #059669' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Net Dispatched Weight</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#059669', marginTop: '4px' }}>{totalDispatchedQtyKg.toLocaleString()} Kg</div>
            <div style={{ fontSize: '0.74rem', color: '#047857', marginTop: '2px' }}>Flexible packaging film & pouches</div>
          </div>

          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #6366f1' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Goods Value (Inc GST)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#4f46e5', marginTop: '4px' }}>{formatINR(totalChallanValue)}</div>
            <div style={{ fontSize: '0.74rem', color: '#6366f1', marginTop: '2px' }}>Auto CGST/SGST vs IGST calculation</div>
          </div>

          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Logistics Vehicles Logged</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>{new Set(deliveryChallans.map(d => d.vehicleNo).filter(Boolean)).size}</div>
            <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: '2px' }}>Trucks & transport vehicles</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #047857' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Test Reports Generated</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>{totalCoasCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#059669', marginTop: '2px' }}>Complete laboratory parameter logs</div>
          </div>

          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #16a34a' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Passed & Approved Batches</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#16a34a', marginTop: '4px' }}>{passedCoasCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#15803d', marginTop: '2px' }}>Conforms to technical specs</div>
          </div>

          <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #0284c7' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Standard Test Parameters</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0284c7', marginTop: '4px' }}>17 Parameters</div>
            <div style={{ fontSize: '0.74rem', color: '#0369a1', marginTop: '2px' }}>Micron, Dyne, Bond & Sealing Strength</div>
          </div>
        </div>
      )}

      {/* Main Table Panel */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        
        {/* Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text"
              className="form-control"
              style={{ paddingLeft: '36px' }}
              placeholder={activeTab === 'challans' ? "Search Delivery Challan #, Client, Vehicle..." : "Search CoA #, Job Name, Client, Batch..."}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Showing {activeTab === 'challans' ? filteredChallans.length : filteredCoAs.length} records
          </span>
        </div>

        {/* TAB 1: DELIVERY CHALLANS TABLE */}
        {activeTab === 'challans' && (
          <>
            <div style={{ overflowX: 'auto', width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table className="data-table" style={{ width: '100%', minWidth: '1050px', margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '11%' }}>Challan No</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '11%' }}>Invoice No</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '13%' }}>Dispatch Date/Time</th>
                    <th style={{ padding: '12px 14px', width: '20%' }}>Party / Consignee</th>
                    <th style={{ padding: '12px 14px', width: '14%' }}>Challan Nature</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '10%' }}>Return Status</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '9%' }}>Grand Total (₹)</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap', width: '12%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(challanPagination.paginatedItems || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        <Truck size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 8px' }} />
                        No Delivery Challans found. Click <strong>"+ Issue Delivery Challan"</strong> to create one.
                      </td>
                    </tr>
                  ) : (
                    (challanPagination.paginatedItems || []).map(dc => {
                      const totalQty = (dc.items || []).reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
                      const isReturnable = ['Returnable Material', 'Job Work Material - Returnable', 'Maintenance Material - Returnable'].includes(dc.challanNature);
                      const returnStatus = dc.returnStatus || (isReturnable ? 'Outbound (Pending Return)' : 'Non-Returnable');
                      const partyType = dc.partyType || 'Client';

                      return (
                        <tr key={dc.id}>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: '#0284c7', fontFamily: 'monospace', fontSize: '0.9rem' }}>{dc.challanNo}</strong>
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#334155' }}>{dc.invoiceNo || 'N/A'}</span>
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#334155' }}>
                              {dc.dispatchDateTime ? new Date(dc.dispatchDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '800',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: partyType === 'Vendor' ? '#fffbeb' : '#eff6ff',
                                color: partyType === 'Vendor' ? '#b45309' : '#1d4ed8',
                                border: `1px solid ${partyType === 'Vendor' ? '#fde68a' : '#bfdbfe'}`
                              }}>
                                {partyType}
                              </span>
                              <strong style={{ color: '#0f172a' }}>{dc.clientName || dc.partyName}</strong>
                            </div>
                            {dc.clientGstin && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>GST: {dc.clientGstin}</div>}
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {(() => {
                              const badge = getChallanNatureBadge(dc.challanNature);
                              return (
                                <span style={{
                                  fontSize: '0.74rem',
                                  fontWeight: '700',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  <span>{badge.icon}</span> {badge.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {isReturnable ? (
                              <span style={{
                                fontSize: '0.74rem',
                                fontWeight: '800',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                background: returnStatus === 'Fully Returned' ? '#dcfce7' : (returnStatus === 'Partially Returned' ? '#e0e7ff' : '#fef3c7'),
                                color: returnStatus === 'Fully Returned' ? '#15803d' : (returnStatus === 'Partially Returned' ? '#4338ca' : '#b45309'),
                                border: `1px solid ${returnStatus === 'Fully Returned' ? '#86efac' : (returnStatus === 'Partially Returned' ? '#c7d2fe' : '#fde68a')}`
                              }}>
                                {returnStatus}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>N/A (Dispatched)</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: '#4f46e5' }}>{formatINR(dc.grandTotalAmount)}</strong>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', whiteSpace: 'nowrap' }}>
                              {isReturnable && returnStatus !== 'Fully Returned' && (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa', fontWeight: '700' }}
                                  title="Record Return Inward Entry"
                                  onClick={() => handleOpenReturnModal(dc)}
                                >
                                  + Return Inward
                                </button>
                              )}
                              {Array.isArray(dc.returnInwardHistory) && dc.returnInwardHistory.length > 0 && (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '4px 6px', fontSize: '0.75rem' }}
                                  title="View Return Log History"
                                  onClick={() => setViewReturnHistoryDc(dc)}
                                >
                                  History ({dc.returnInwardHistory.length})
                                </button>
                              )}
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                title="View & Print Official PDF"
                                onClick={() => setActiveDcForPDF(dc)}
                              >
                                <Printer size={14} /> PDF
                              </button>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                title="Edit Delivery Challan"
                                onClick={() => handleEditDc(dc)}
                              >
                                <Edit3 size={14} />
                              </button>
                              {onDeleteDeliveryChallan && (
                                <button 
                                  className="btn-danger" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  title="Delete Delivery Challan"
                                  onClick={() => {
                                    if (window.confirm(`Delete Delivery Challan "${dc.challanNo}"?`)) {
                                      onDeleteDeliveryChallan(dc.id);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
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

            <TablePagination
              currentPage={challanPagination.currentPage}
              totalPages={challanPagination.totalPages}
              totalItems={challanPagination.totalItems}
              itemsPerPage={challanPagination.itemsPerPage}
              onPageChange={challanPagination.setCurrentPage}
            />
          </>
        )}

        {/* TAB 2: CERTIFICATE OF ANALYSIS (COA) TABLE */}
        {activeTab === 'coas' && (
          <>
            <div style={{ overflowX: 'auto', width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table className="data-table" style={{ width: '100%', minWidth: '1050px', margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '12%' }}>CoA Report Ref</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '10%' }}>Testing Date</th>
                    <th style={{ padding: '12px 14px', width: '16%' }}>Customer Name</th>
                    <th style={{ padding: '12px 14px', width: '22%' }}>Job Name / SKU</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '10%' }}>Batch Lot #</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '8%' }}>Net Weight</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '10%' }}>QC Status</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', width: '12%' }}>Quality Inspector</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap', width: '10%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(coaPagination.paginatedItems || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        <FlaskConical size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 8px' }} />
                        No Quality Test Reports (CoA) found. Click <strong>"+ Generate Quality CoA"</strong> to create one.
                      </td>
                    </tr>
                  ) : (
                    (coaPagination.paginatedItems || []).map(coa => (
                      <tr key={coa.id}>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: '#047857', fontFamily: 'monospace', fontSize: '0.9rem' }}>{coa.coaNo}</strong>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#334155' }}>{coa.testDate}</span>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{coa.customerName}</div>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: '700', color: '#0284c7' }}>{coa.jobName}</div>
                          {coa.specification && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>{coa.specification}</div>}
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span className="badge badge-secondary" style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', display: 'inline-block' }}>{coa.batchLotNo || 'N/A'}</span>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: '#334155', whiteSpace: 'nowrap' }}>{coa.netWeight || '—'}</strong>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            ✓ {coa.overallStatus || 'PASSED'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: '600', whiteSpace: 'nowrap' }}>{coa.qcInspector}</span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', whiteSpace: 'nowrap' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              title="View & Print Official CoA PDF"
                              onClick={() => setActiveCoaForPDF(coa)}
                            >
                              <Printer size={14} /> View Report PDF
                            </button>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              title="Edit CoA Report"
                              onClick={() => handleEditCoa(coa)}
                            >
                              <Edit3 size={14} />
                            </button>
                            {onDeleteCoA && (
                              <button 
                                className="btn-danger" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                title="Delete CoA Report"
                                onClick={() => {
                                  if (window.confirm(`Delete Quality Report "${coa.coaNo}"?`)) {
                                    onDeleteCoA(coa.id);
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <TablePagination
              currentPage={coaPagination.currentPage}
              totalPages={coaPagination.totalPages}
              totalItems={coaPagination.totalItems}
              itemsPerPage={coaPagination.itemsPerPage}
              onPageChange={coaPagination.setCurrentPage}
            />
          </>
        )}

      </div>


      {/* ==================================================================== */}
      {/* MODAL 1: CREATE / EDIT DELIVERY CHALLAN */}
      {/* ==================================================================== */}
      {isDcModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDcModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '920px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '18px 24px', margin: '-24px -24px 20px -24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(2, 132, 199, 0.25)', padding: '10px', borderRadius: '10px', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  <Truck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                    {editingDcId ? 'Edit Delivery Challan' : 'Issue Official Delivery Challan'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Generate printable delivery note with letterhead, item rows, tax breakdown & dual signatures
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setIsDcModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDcSubmit}>
              
              {/* Card 1: Basic Identifiers & Party Info */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
                {/* Top 3 Identifiers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label className="form-label">Delivery Challan No *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      style={{ fontWeight: '700', color: '#0284c7', background: '#f0f9ff' }}
                      value={dcChallanNo} 
                      onChange={e => setDcChallanNo(e.target.value)} 
                      required 
                    />
                  </div>

                  <div>
                    <label className="form-label">Invoice Ref Number *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. SIL/INV/26-27/042"
                      value={dcInvoiceNo} 
                      onChange={e => setDcInvoiceNo(e.target.value)} 
                      required 
                    />
                  </div>

                  <div>
                    <label className="form-label">Dispatch Date & Time *</label>
                    <input 
                      type="datetime-local" 
                      className="form-control" 
                      value={dcDispatchDateTime} 
                      onChange={e => setDcDispatchDateTime(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                {/* Party Selection (Type + Name) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '14px', background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: '1 1 240px' }}>
                    <label className="form-label">Destination Party Category *</label>
                    <select 
                      className="form-control" 
                      style={{ fontWeight: '700', color: dcPartyType === 'Vendor' ? '#d97706' : '#0284c7', background: dcPartyType === 'Vendor' ? '#fffbeb' : '#f0f9ff' }}
                      value={dcPartyType} 
                      onChange={e => {
                        const newType = e.target.value;
                        setDcPartyType(newType);
                        if (newType === 'Vendor' && vendors.length > 0) {
                          handlePartySelectChange(newType, vendors[0].name || vendors[0].vendorName || vendors[0].companyName || '');
                        } else if (newType === 'Client' && clients.length > 0) {
                          handlePartySelectChange(newType, clients[0].name || clients[0].companyName || clients[0].clientName || '');
                        }
                      }}
                      required
                    >
                      <option value="Client">Client / Customer (Sales & Dispatch)</option>
                      <option value="Vendor">Vendor / Supplier (Goods Return & Job Work)</option>
                    </select>
                  </div>

                  <div style={{ flex: '2 1 320px' }}>
                    <label className="form-label">
                      {dcPartyType === 'Vendor' ? 'Vendor Name (Select from Directory) *' : 'Client Name (Select from Directory) *'}
                    </label>
                    <select 
                      className="form-control" 
                      style={{ fontWeight: '700' }}
                      value={dcSelectedClientName} 
                      onChange={e => handlePartySelectChange(dcPartyType, e.target.value)}
                      required
                    >
                      <option value="" disabled>-- Select {dcPartyType} --</option>
                      {dcPartyType === 'Vendor' ? (
                        (vendors || []).map(v => {
                          const vName = v.name || v.vendorName || v.companyName || '';
                          return (
                            <option key={v.id || vName} value={vName}>[Vendor] {vName}</option>
                          );
                        })
                      ) : (
                        (clients || []).map(c => {
                          const cName = c.name || c.companyName || c.clientName || '';
                          return (
                            <option key={c.id || cName} value={cName}>[Client] {cName}</option>
                          );
                        })
                      )}
                    </select>
                  </div>
                </div>

                {/* Order & Job References */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  <div>
                    <label className="form-label">Client / Vendor PO Ref #</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. PO-BRIT-2026-991"
                      value={dcPoRefNo} 
                      onChange={e => setDcPoRefNo(e.target.value)} 
                    />
                  </div>

                  <div>
                    <label className="form-label">Job / Product Reference</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. 250g Printed Laminated Roll"
                      value={dcJobName} 
                      onChange={e => setDcJobName(e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Purpose & Nature of Movement Checkmarks */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: '0.78rem', color: '#1e293b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} color="#0284c7" /> Purpose of Goods Movement & Challan Nature *
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {[
                    { id: 'Sale of Goods', label: 'Sale of Goods', desc: 'Outright Sales Dispatch to Client', color: '#0284c7', icon: '🛒' },
                    { id: 'Returnable Material', label: 'Returnable Material', desc: 'General Returnable Goods & Tools', color: '#d97706', icon: '🔄' },
                    { id: 'Non-Returnable Material', label: 'Non-Returnable Material', desc: 'Samples, Scrap & Non-Return Items', color: '#475569', icon: '📦' },
                    { id: 'Job Work Material - Returnable', label: 'Job Work Material', desc: 'Subcontracting & Processing (Returnable)', color: '#7c3aed', icon: '⚙️' },
                    { id: 'Maintenance Material - Returnable', label: 'Maintenance Material', desc: 'Rotogravure Cylinders & Repair Parts', color: '#059669', icon: '🔧' }
                  ].map(nature => {
                    const isSelected = (dcChallanNature === nature.id);
                    return (
                      <label 
                        key={nature.id} 
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: `2px solid ${isSelected ? nature.color : '#e2e8f0'}`,
                          borderLeft: `5px solid ${nature.color}`,
                          background: isSelected ? `${nature.color}10` : '#f8fafc',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? `0 4px 12px ${nature.color}20` : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="radio"
                              name="challanNature"
                              value={nature.id}
                              checked={isSelected}
                              onChange={e => setDcChallanNature(e.target.value)}
                              style={{ accentColor: nature.color, width: '15px', height: '15px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.86rem', fontWeight: isSelected ? '800' : '700', color: isSelected ? nature.color : '#0f172a' }}>
                              {nature.icon} {nature.label}
                            </span>
                          </div>
                          {isSelected && (
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', background: nature.color, color: '#ffffff', padding: '1px 6px', borderRadius: '4px' }}>
                              SELECTED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: isSelected ? '#334155' : '#64748b', paddingLeft: '23px', lineHeight: '1.3' }}>
                          {nature.desc}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Card 3: Logistics & Consignee Details */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={16} color="#0284c7" /> Logistics & Consignee Destination Details
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="form-label">Consignee Delivery Address</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Full destination factory / godown address..."
                      value={dcClientAddress} 
                      onChange={e => setDcClientAddress(e.target.value)} 
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    <div>
                      <label className="form-label">Vehicle Number *</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="e.g. MP-09-AB-1234"
                        value={dcVehicleNo} 
                        onChange={e => setDcVehicleNo(e.target.value)} 
                        required 
                      />
                    </div>

                    <div>
                      <label className="form-label">Transporter / Logistics Company</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="e.g. VRL Logistics / Self"
                        value={dcTransporterName} 
                        onChange={e => setDcTransporterName(e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="form-label">Driver Contact Number</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="e.g. +91 98260 00000"
                        value={dcDriverPhone} 
                        onChange={e => setDcDriverPhone(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Multiple Item Rows Section */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={18} color="#0284c7" />
                    <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}>
                      Dispatched Item Rows & Rates
                    </span>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px' }}>
                      {dcItems.length} {dcItems.length === 1 ? 'Item Row' : 'Item Rows'}
                    </span>
                  </div>

                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ fontSize: '0.8rem', padding: '6px 14px', fontWeight: '700', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={handleAddDcItemRow}
                  >
                    <Plus size={15} /> Add Item Row
                  </button>
                </div>

                <div style={{ overflowX: 'auto', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff' }}>
                  <table className="data-table" style={{ width: '100%', minWidth: '820px', margin: 0, fontSize: '0.83rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ width: '4%', padding: '10px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>#</th>
                        <th style={{ width: '43%', padding: '10px', fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>Item Title & Specification Details *</th>
                        <th style={{ width: '11%', padding: '10px 8px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>HSN / SAC</th>
                        <th style={{ width: '20%', padding: '10px', fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>Quantity & UOM *</th>
                        <th style={{ width: '10%', padding: '10px 8px', textAlign: 'right', fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>Rate (₹)</th>
                        <th style={{ width: '12%', padding: '10px 10px', textAlign: 'right', fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>Amount (₹)</th>
                        <th style={{ width: '4%', padding: '10px 6px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dcItems.map((item, idx) => (
                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                          <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: '800', color: '#64748b', verticalAlign: 'top', paddingTop: '14px' }}>
                            {idx + 1}
                          </td>

                          <td style={{ padding: '10px', verticalAlign: 'top' }}>
                            {itemPresetOptions.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>⚡ Preset:</span>
                                <select 
                                  className="form-control" 
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#0284c7', background: '#f0f9ff', borderColor: '#bae6fd', flex: 1, borderRadius: '4px', height: '26px' }}
                                  onChange={e => {
                                    const selectedPreset = itemPresetOptions.find(p => p.id === e.target.value);
                                    if (selectedPreset) {
                                      handleApplyPresetToDcRow(item.id, selectedPreset);
                                    }
                                  }}
                                  value=""
                                >
                                  <option value="">-- Load Specs from Job Master / Cylinder Directory --</option>
                                  {itemPresetOptions.map(p => (
                                    <option key={p.id} value={p.id}>[{p.category}] {p.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '6px 10px', fontSize: '0.85rem', fontWeight: '700', marginBottom: '6px', borderColor: '#cbd5e1' }}
                              value={item.description} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'description', e.target.value)}
                              placeholder="Item Name / Product Title (e.g. Britannia Bourbon 250g Printed Laminate Film)..."
                              required 
                            />
                            <textarea
                              rows={2}
                              className="form-control"
                              style={{ padding: '6px 10px', fontSize: '0.78rem', color: '#334155', borderColor: '#e2e8f0', lineHeight: '1.35', resize: 'vertical' }}
                              value={item.itemDetails || ''}
                              onChange={e => handleUpdateDcItemRow(item.id, 'itemDetails', e.target.value)}
                              placeholder="Detailed Specifications / Micron / Reel Dimensions / Pouch Size / Dispatch Notes..."
                            />
                          </td>

                          <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '6px 8px', fontSize: '0.82rem', textAlign: 'center', fontWeight: '700', fontFamily: 'monospace', borderColor: '#cbd5e1' }}
                              value={item.hsnSac} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'hsnSac', e.target.value)}
                              placeholder="3923"
                            />
                          </td>

                          <td style={{ padding: '10px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input 
                                type="number" 
                                step="any"
                                className="form-control" 
                                style={{ padding: '6px 8px', fontSize: '0.85rem', textAlign: 'right', fontWeight: '800', flex: '1', borderColor: '#cbd5e1' }}
                                value={item.quantity} 
                                onChange={e => handleUpdateDcItemRow(item.id, 'quantity', e.target.value)}
                                placeholder="0.00"
                                required 
                              />
                              <select 
                                className="form-control" 
                                style={{ padding: '6px 8px', fontSize: '0.8rem', fontWeight: '800', width: '90px', background: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a' }}
                                value={item.unit || 'Kg'}
                                onChange={e => handleUpdateDcItemRow(item.id, 'unit', e.target.value)}
                              >
                                <option value="Kg">Kg</option>
                                <option value="Nos">Nos</option>
                                <option value="Rolls">Rolls</option>
                                <option value="Sets">Sets</option>
                                <option value="Mtrs">Mtrs</option>
                                <option value="Boxes">Boxes</option>
                                <option value="Pcs">Pcs</option>
                                <option value="Bags">Bags</option>
                                <option value="Ltrs">Ltrs</option>
                                <option value="Sq.Mtrs">Sq.Mtrs</option>
                                <option value="Tons">Tons</option>
                              </select>
                            </div>
                          </td>

                          <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              style={{ padding: '6px 8px', fontSize: '0.85rem', textAlign: 'right', fontWeight: '700', borderColor: '#cbd5e1' }}
                              value={item.rate} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'rate', e.target.value)}
                              placeholder="0.00"
                            />
                          </td>

                          <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: '800', color: '#0284c7', fontSize: '0.9rem', verticalAlign: 'top', paddingTop: '14px' }}>
                            {formatINR(item.amount || (item.quantity * item.rate))}
                          </td>

                          <td style={{ padding: '10px 6px', textAlign: 'center', verticalAlign: 'top', paddingTop: '12px' }}>
                            {dcItems.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => handleRemoveDcItemRow(item.id)}
                                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Remove Item Row"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Freight Charges Row & Subtotal & GST Calculation */}
                {(() => {
                  const subtotalItems = dcItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
                  const freightAmount = parseFloat(dcFreightCharges) || 0;
                  const totalTaxable = subtotalItems + freightAmount;

                  const gstInfo = calculateGSTBreakdown(dcClientGstin, dcClientAddress, totalTaxable, dcGstRatePct, COMPANY_DETAILS.gstin, dcTaxType);
                  const numGstPct = Number(dcGstRatePct) || 0;
                  return (
                    <div style={{ marginTop: '14px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      
                      {/* Freight Charges Input Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #cbd5e1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Truck size={16} color="#0284c7" />
                          <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155', margin: 0 }}>
                            Freight / Transport Charges (Optional - ₹):
                          </label>
                        </div>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          style={{ width: '160px', padding: '6px 10px', fontSize: '0.88rem', fontWeight: '700', textAlign: 'right', color: '#0f172a' }}
                          placeholder="e.g. 1500"
                          value={dcFreightCharges}
                          onChange={e => setDcFreightCharges(e.target.value)}
                        />
                      </div>

                      {/* Tax Settings & Total Breakdown */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <div>
                            <span style={{ marginRight: '4px' }}>Tax Type:</span>
                            <select 
                              value={dcTaxType} 
                              onChange={e => setDcTaxType(e.target.value)}
                              style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.8rem', background: '#ffffff' }}
                            >
                              <option value="auto">Auto (Detect GSTIN)</option>
                              <option value="cgst_sgst">CGST + SGST (Intra-State)</option>
                              <option value="igst">IGST (Inter-State)</option>
                            </select>
                          </div>
                          <div>
                            <span style={{ marginRight: '4px' }}>Tax Rate:</span>
                            <select 
                              value={dcGstRatePct} 
                              onChange={e => setDcGstRatePct(e.target.value)}
                              style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.8rem', background: '#ffffff' }}
                            >
                              <option value={18}>18% GST</option>
                              <option value={12}>12% GST</option>
                              <option value={5}>5% GST</option>
                              <option value={0}>0% (Exempt)</option>
                            </select>
                          </div>
                          <span style={{ fontWeight: '700', color: gstInfo.isIntraState ? '#047857' : '#0284c7', fontSize: '0.78rem' }}>
                            ({gstInfo.isIntraState ? `CGST ${(numGstPct / 2).toFixed(1)}% + SGST ${(numGstPct / 2).toFixed(1)}% [Intra-State]` : `IGST ${numGstPct}% [Inter-State]`})
                          </span>
                        </div>

                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>
                          <div>Items Subtotal: {formatINR(subtotalItems)} {freightAmount > 0 && `+ Freight: ${formatINR(freightAmount)}`}</div>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>
                            Grand Total: {formatINR(gstInfo.grandTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Remarks */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Dispatch Remarks & Notes</label>
                <textarea 
                  className="form-control" 
                  rows={2} 
                  value={dcRemarks} 
                  onChange={e => setDcRemarks(e.target.value)} 
                />
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsDcModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}>
                  <Printer size={18} /> Save & Open Delivery Challan PDF
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: CREATE / EDIT CERTIFICATE OF ANALYSIS (COA) */}
      {/* ==================================================================== */}
      {isCoaModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCoaModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '850px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', padding: '18px 24px', margin: '-24px -24px 20px -24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '10px', borderRadius: '10px', color: '#ffffff' }}>
                  <FlaskConical size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                    {editingCoaId ? 'Edit Quality Test Report (CoA)' : 'Generate Certificate of Analysis (CoA)'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#a7f3d0', margin: '2px 0 0 0' }}>
                    Full Laboratory Test Report matching Samyak International Ltd official format
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setIsCoaModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCoaSubmit}>

              {/* Grid 1: Basic Header Inputs */}
              <div className="form-grid" style={{ marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Report Ref No (CoA) *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ fontWeight: '700', color: '#047857', background: '#ecfdf5' }}
                    value={coaNo} 
                    onChange={e => setCoaNo(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Testing Date *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={coaTestDate} 
                    onChange={e => setCoaTestDate(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Job Name (Select Specs) *</label>
                  <select 
                    className="form-control" 
                    value={coaJobName} 
                    onChange={e => handleJobSelectChange(e.target.value)}
                    required
                  >
                    <option value="" disabled>-- Select Job Master --</option>
                    {(jobMasters || []).map(j => (
                      <option key={j.id} value={j.jobName}>{j.jobName} ({j.clientName})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Customer Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={coaCustomerName} 
                    onChange={e => setCoaCustomerName(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Invoice Ref Number</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. SAM/25-26/00303"
                    value={coaInvoiceNo} 
                    onChange={e => setCoaInvoiceNo(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="form-label">Batch / Lot Ref No *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. BATCH-FD-2026-08"
                    value={coaBatchLotNo} 
                    onChange={e => setCoaBatchLotNo(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              {/* Material Structure Template Selector & Action Toolbar */}
              <div style={{ 
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', 
                padding: '12px 16px', 
                borderRadius: '10px', 
                border: '1px solid #bbf7d0', 
                marginBottom: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '280px' }}>
                  <Layers size={18} style={{ color: '#166534' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#166534', whiteSpace: 'nowrap' }}>
                    Material Structure Template:
                  </span>
                  <select 
                    className="form-control" 
                    style={{ fontSize: '0.82rem', fontWeight: '700', color: '#047857', background: '#ffffff', borderColor: '#86efac' }}
                    value={selectedCoaTemplateId}
                    onChange={e => handleSelectCoaTemplate(e.target.value)}
                  >
                    {coaTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isBuiltIn ? '(Default System)' : '(Saved Custom)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ fontSize: '0.76rem', padding: '5px 10px', background: '#ffffff', color: '#047857', border: '1px solid #86efac', fontWeight: '700' }}
                    onClick={handleSaveCurrentAsTemplate}
                    title="Save current structure specs & parameters as a new template"
                  >
                    <Plus size={14} /> Save Current as Template
                  </button>
                  {(() => {
                    const currentTpl = coaTemplates.find(t => t.id === selectedCoaTemplateId);
                    if (currentTpl && !currentTpl.isBuiltIn) {
                      return (
                        <button 
                          type="button" 
                          style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer' }}
                          onClick={() => handleDeleteCoaTemplate(selectedCoaTemplateId)}
                          title="Delete this custom template"
                        >
                          <Trash2 size={14} />
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Technical Specifications Grid */}
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                  Product Structure & Physical Parameters
                </div>
                <div className="form-grid">
                  <div>
                    <label className="form-label">FILM TYPE</label>
                    <input type="text" className="form-control" value={coaFilmType} onChange={e => setCoaFilmType(e.target.value)} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label" style={{ margin: 0 }}>NET WEIGHT</label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setCoaNetWeight(`${weight.toFixed(2)} kg`)} />
                    </div>
                    <input type="text" className="form-control" value={coaNetWeight} onChange={e => setCoaNetWeight(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Structure Specification</label>
                    <input type="text" className="form-control" value={coaSpecification} onChange={e => setCoaSpecification(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Size (Width)</label>
                    <input type="text" className="form-control" value={coaSizeMm} onChange={e => setCoaSizeMm(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Thickness (Micron)</label>
                    <input type="text" className="form-control" value={coaThicknessMicron} onChange={e => setCoaThicknessMicron(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Overall Status</label>
                    <select className="form-control" style={{ fontWeight: '700', color: '#047857' }} value={coaOverallStatus} onChange={e => setCoaOverallStatus(e.target.value)}>
                      <option value="PASSED & APPROVED">PASSED & APPROVED</option>
                      <option value="CONFORMS TO SPECIFICATIONS">CONFORMS TO SPECIFICATIONS</option>
                      <option value="CONDITIONALLY APPROVED">CONDITIONALLY APPROVED</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Dynamic Laboratory Parameters Table */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', marginBottom: '16px', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                    🧪 Laboratory Test Parameters & Observations ({coaParameters.length} Parameters)
                  </div>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                    onClick={handleAddCoaParameterRow}
                  >
                    <Plus size={14} /> Add Parameter
                  </button>
                </div>

                <div style={{ overflowX: 'auto', width: '100%', maxHeight: '280px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff' }}>
                  <table className="data-table" style={{ width: '100%', minWidth: '600px', margin: 0, fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ width: '50px', padding: '8px', textAlign: 'center' }}>#</th>
                        <th style={{ width: '35%', padding: '8px 10px' }}>Parameter Name</th>
                        <th style={{ width: '15%', padding: '8px 10px' }}>Unit (UOM)</th>
                        <th style={{ width: '22%', padding: '8px 10px' }}>Standard Target</th>
                        <th style={{ width: '22%', padding: '8px 10px' }}>Measured Observation</th>
                        <th style={{ width: '6%', padding: '8px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {coaParameters.map((param, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', padding: '6px' }}>{idx + 1}</td>
                          <td style={{ padding: '6px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem', fontWeight: '600' }}
                              value={param.parameter} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'parameter', e.target.value)} 
                              required 
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                              value={param.uom} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'uom', e.target.value)} 
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                              value={param.standard} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'standard', e.target.value)} 
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem', fontWeight: '700', color: '#047857' }}
                              value={param.observation} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'observation', e.target.value)} 
                              required 
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '6px' }}>
                            <button 
                              type="button" 
                              onClick={() => handleRemoveCoaParameterRow(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px' }}
                              title="Delete Parameter"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">QC Disposition Remarks</label>
                <textarea 
                  className="form-control" 
                  rows={2} 
                  value={coaRemarks} 
                  onChange={e => setCoaRemarks(e.target.value)} 
                />
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsCoaModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)' }}>
                  <Printer size={18} /> Save & Open Quality Report (CoA) PDF
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: MARK MATERIAL RETURN INWARD (FOR RETURNABLE CHALLANS)       */}
      {/* ==================================================================== */}
      {selectedDcForReturn && (
        <div className="modal-overlay" onClick={() => setSelectedDcForReturn(null)}>
          <div className="glass-card modal-content" style={{ width: '650px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', padding: '18px 24px', margin: '-24px -24px 20px -24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '10px', borderRadius: '10px', color: '#ffffff' }}>
                  <Truck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                    Record Material Return Inward
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#fef3c7', margin: '2px 0 0 0' }}>
                    Challan #{selectedDcForReturn.challanNo} • {selectedDcForReturn.clientName || selectedDcForReturn.partyName} ({selectedDcForReturn.challanNature})
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setSelectedDcForReturn(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmReturnInward}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '16px', fontSize: '0.82rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div><span style={{ color: '#64748b' }}>Original Dispatched Qty:</span> <strong>{(selectedDcForReturn.items || []).reduce((s,i) => s + (parseFloat(i.quantity)||0), 0).toFixed(2)} Kg</strong></div>
                  <div><span style={{ color: '#64748b' }}>Previously Returned:</span> <strong style={{ color: '#d97706' }}>{Number(selectedDcForReturn.totalReturnedQty || 0).toFixed(2)} Kg</strong></div>
                </div>
              </div>

              <div className="form-grid" style={{ marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Return Date & Time *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={returnDate}
                    onChange={e => setReturnDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Returned Quantity & Unit *</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      style={{ fontWeight: '800', color: '#d97706', flex: '1' }}
                      placeholder="e.g. 500"
                      value={returnedQty}
                      onChange={e => setReturnedQty(e.target.value)}
                      required
                    />
                    <select
                      className="form-control"
                      style={{ padding: '6px 8px', fontSize: '0.82rem', fontWeight: '700', width: '90px' }}
                      value={returnUnit}
                      onChange={e => setReturnUnit(e.target.value)}
                    >
                      <option value="Kg">Kg</option>
                      <option value="Nos">Nos</option>
                      <option value="Rolls">Rolls</option>
                      <option value="Sets">Sets</option>
                      <option value="Mtrs">Mtrs</option>
                      <option value="Boxes">Boxes</option>
                      <option value="Pcs">Pcs</option>
                      <option value="Bags">Bags</option>
                      <option value="Ltrs">Ltrs</option>
                      <option value="Sq.Mtrs">Sq.Mtrs</option>
                      <option value="Tons">Tons</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Return Ref / Vendor DC / Invoice No</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. VEND/RET/2026/012"
                    value={returnRefDocNo}
                    onChange={e => setReturnRefDocNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Transporter Company</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. VRL Logistics"
                    value={returnTransporter}
                    onChange={e => setReturnTransporter(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Vehicle Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. MP-09-CD-5678"
                    value={returnVehicleNo}
                    onChange={e => setReturnVehicleNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">LR / Bilty Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. LR-998811"
                    value={returnLrNo}
                    onChange={e => setReturnLrNo(e.target.value)}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Material Inspection & Quality Condition *</label>
                  <select
                    className="form-control"
                    style={{ fontWeight: '700' }}
                    value={returnCondition}
                    onChange={e => setReturnCondition(e.target.value)}
                    required
                  >
                    <option value="Good Condition & Pass QC">✓ Good Condition & Pass QC Inspection</option>
                    <option value="Re-engraved / Completed Job Work">✓ Re-engraved / Completed Job Work (Ready for Use)</option>
                    <option value="Partially Processed / Pending Work">⚠ Partially Processed / Pending Further Work</option>
                    <option value="Damaged / Defective / Rejected">✗ Damaged / Defective / Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Received By (Store Incharge)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={returnedBy}
                    onChange={e => setReturnedBy(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', color: '#15803d' }}>
                    <input
                      type="checkbox"
                      checked={isFullyReturned}
                      onChange={e => setIsFullyReturned(e.target.checked)}
                    />
                    Mark Delivery Challan as Fully Returned
                  </label>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Return Inward Remarks & Notes</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Add details about returned material condition, serial numbers, etc..."
                    value={returnNotes}
                    onChange={e => setReturnNotes(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setSelectedDcForReturn(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }}>
                  <CheckCircle2 size={18} /> Confirm & Save Return Inward Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: VIEW RETURN INWARD HISTORY LOG                              */}
      {/* ==================================================================== */}
      {viewReturnHistoryDc && (
        <div className="modal-overlay" onClick={() => setViewReturnHistoryDc(null)}>
          <div className="glass-card modal-content" style={{ width: '750px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: '#0f172a', padding: '18px 24px', margin: '-24px -24px 20px -24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
              <div>
                <h3 style={{ fontSize: '1.18rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                  Material Return Inward Log History
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                  Challan #{viewReturnHistoryDc.challanNo} • {viewReturnHistoryDc.clientName || viewReturnHistoryDc.partyName}
                </p>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setViewReturnHistoryDc(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: '450px', overflowY: 'auto', marginBottom: '16px' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 10px' }}>Return Date & Time</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Returned Qty</th>
                    <th style={{ padding: '8px 10px' }}>Ref / Doc #</th>
                    <th style={{ padding: '8px 10px' }}>Vehicle / Transporter</th>
                    <th style={{ padding: '8px 10px' }}>Quality Condition</th>
                    <th style={{ padding: '8px 10px' }}>Received By</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewReturnHistoryDc.returnInwardHistory || []).map((ret, idx) => (
                    <tr key={ret.id || idx}>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>
                        {new Date(ret.returnDateTime || ret.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: '#d97706' }}>
                        {ret.returnedQty} Kg
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: '600' }}>
                        {ret.returnRefDocNo || '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#334155' }}>
                        {ret.returnVehicleNo ? `${ret.returnVehicleNo} (${ret.returnTransporter || 'Self'})` : (ret.returnTransporter || '—')}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: '700', color: ret.returnCondition.includes('Pass') || ret.returnCondition.includes('Completed') ? '#15803d' : '#c2410c' }}>
                          {ret.returnCondition}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#475569' }}>
                        {ret.returnedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn-secondary" onClick={() => setViewReturnHistoryDc(null)}>Close History</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
