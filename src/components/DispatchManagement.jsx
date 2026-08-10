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
import CertificateOfAnalysisPDF, { DEFAULT_COA_PARAMETERS } from './CertificateOfAnalysisPDF';
import { generateDocRefNumber, getNextDocRefNumber, getDocumentTerms } from '../services/settingsService';
import { formatINR, calculateGSTBreakdown } from '../utils/pdfHelpers';
import { COMPANY_DETAILS } from '../factoryStore';

export default function DispatchManagement({
  deliveryChallans = [],
  certificateOfAnalyses = [],
  clients = [],
  jobMasters = [],
  orders = [],
  currentUser,
  onSaveDeliveryChallan,
  onDeleteDeliveryChallan,
  onSaveCoA,
  onDeleteCoA
}) {
  const [activeTab, setActiveTab] = useState('challans'); // 'challans' | 'coas'

  // Modal States
  const [isDcModalOpen, setIsDcModalOpen] = useState(false);
  const [editingDcId, setEditingDcId] = useState(null);
  const [activeDcForPDF, setActiveDcForPDF] = useState(null);

  const [isCoaModalOpen, setIsCoaModalOpen] = useState(false);
  const [editingCoaId, setEditingCoaId] = useState(null);
  const [activeCoaForPDF, setActiveCoaForPDF] = useState(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

  // --------------------------------------------------------------------------
  // DC FORM STATE
  // --------------------------------------------------------------------------
  const [dcChallanNo, setDcChallanNo] = useState('');
  const [dcInvoiceNo, setDcInvoiceNo] = useState('');
  const [dcDispatchDateTime, setDcDispatchDateTime] = useState('');
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
  const [dcGstRatePct, setDcGstRatePct] = useState(18);
  const [dcDispatchedBy, setDcDispatchedBy] = useState('');
  const [dcRemarks, setDcRemarks] = useState('');
  const [dcItems, setDcItems] = useState([]);
  const [dcTerms, setDcTerms] = useState([]);

  // --------------------------------------------------------------------------
  // COA FORM STATE
  // --------------------------------------------------------------------------
  const [coaNo, setCoaNo] = useState('');
  const [coaTestDate, setCoaTestDate] = useState('');
  const [coaCustomerName, setCoaCustomerName] = useState('');
  const [coaJobName, setCoaJobName] = useState('');
  const [coaInvoiceNo, setCoaInvoiceNo] = useState('');
  const [coaJobCode, setCoaJobCode] = useState('1');
  const [coaFilmType, setCoaFilmType] = useState('natural Deep Freeze (80%)');
  const [coaNetWeight, setCoaNetWeight] = useState('365.08 kg');
  const [coaSpecification, setCoaSpecification] = useState('2 layer (12 PET + 50 Deep Freeze)');
  const [coaSizeMm, setCoaSizeMm] = useState('700 mm');
  const [coaThicknessMicron, setCoaThicknessMicron] = useState('50µ');
  const [coaBatchLotNo, setCoaBatchLotNo] = useState('');
  const [coaOverallStatus, setCoaOverallStatus] = useState('PASSED & APPROVED');
  const [coaQcInspector, setCoaQcInspector] = useState('');
  const [coaApprovedByHead, setCoaApprovedByHead] = useState('');
  const [coaRemarks, setCoaRemarks] = useState('');
  const [coaParameters, setCoaParameters] = useState([]);

  // --------------------------------------------------------------------------
  // OPEN DC MODAL HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenNewDcModal = () => {
    setEditingDcId(null);
    const nextRef = generateDocRefNumber('dc');
    setDcChallanNo(nextRef);
    setDcInvoiceNo(`SIL/INV/26-27/${Math.floor(100 + Math.random() * 900)}`);
    
    const now = new Date();
    const isoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setDcDispatchDateTime(isoString);

    // Default to first client if available
    const firstClient = (clients && clients[0]) || {};
    const firstName = firstClient.name || firstClient.companyName || firstClient.clientName || '';
    setDcSelectedClientName(firstName);
    setDcClientAddress(firstClient.address || firstClient.factoryAddress || firstClient.registeredAddress || '');
    setDcClientGstin(firstClient.gstin || firstClient.gstNumber || '');
    setDcClientContactPerson(firstClient.contactPerson || firstClient.contactName || '');
    setDcClientPhone(firstClient.phone || firstClient.contactNo || firstClient.mobile || '');

    setDcVehicleNo('MP-09-AB-1234');
    setDcTransporterName('Self / Direct Logistics Truck');
    setDcDriverPhone('+91 98260 00000');
    setDcPoRefNo('');
    setDcJobName('');
    setDcGstRatePct(18);
    setDcDispatchedBy(currentUser ? `${currentUser.name} (Dispatch Incharge)` : 'Dilip Joshi (Dispatch Store Manager)');
    setDcRemarks('Material dispatched in sound condition, sealed with stretch film rolls.');

    setDcItems([
      { id: 1, description: 'Flexible Packaging Printed Laminated Roll Stock', hsnSac: '3923', quantity: 1000, unit: 'Kg', rate: 185, amount: 185000 }
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
    setDcSelectedClientName(dc.clientName || '');
    setDcClientAddress(dc.clientAddress || '');
    setDcClientGstin(dc.clientGstin || '');
    setDcClientContactPerson(dc.clientContactPerson || '');
    setDcClientPhone(dc.clientPhone || '');
    setDcVehicleNo(dc.vehicleNo || '');
    setDcTransporterName(dc.transporterName || '');
    setDcDriverPhone(dc.driverPhone || '');
    setDcPoRefNo(dc.poRefNo || '');
    setDcJobName(dc.jobName || '');
    setDcGstRatePct(dc.gstRatePct || 18);
    setDcDispatchedBy(dc.dispatchedBy || '');
    setDcRemarks(dc.remarks || '');
    setDcItems(Array.isArray(dc.items) && dc.items.length > 0 ? dc.items : []);
    setDcTerms(Array.isArray(dc.termsAndConditions) ? dc.termsAndConditions : (getDocumentTerms().dcTerms || []));

    setIsDcModalOpen(true);
  };

  const handleClientSelectChange = (clientNameStr) => {
    setDcSelectedClientName(clientNameStr);
    const matched = clients.find(c => (c.name || c.companyName || c.clientName) === clientNameStr);
    if (matched) {
      setDcClientAddress(matched.address || matched.factoryAddress || matched.registeredAddress || '');
      setDcClientGstin(matched.gstin || matched.gstNumber || '');
      setDcClientContactPerson(matched.contactPerson || matched.contactName || '');
      setDcClientPhone(matched.phone || matched.contactNo || matched.mobile || '');
    }
  };

  const handleAddDcItemRow = () => {
    setDcItems(prev => [
      ...prev,
      { id: Date.now(), description: 'Finished Flexible Packaging Roll', hsnSac: '3923', quantity: 500, unit: 'Kg', rate: 190, amount: 95000 }
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

    const subtotal = dcItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const gstInfo = calculateGSTBreakdown(dcClientGstin, dcClientAddress, subtotal, dcGstRatePct, COMPANY_DETAILS.gstin);
    const grandTotal = gstInfo.grandTotal;

    const payload = {
      id: editingDcId || `DC-${Date.now()}`,
      challanNo: finalChallanNo,
      invoiceNo: dcInvoiceNo,
      dispatchDateTime: dcDispatchDateTime,
      clientName: dcSelectedClientName,
      clientAddress: dcClientAddress,
      clientGstin: dcClientGstin,
      clientContactPerson: dcClientContactPerson,
      clientPhone: dcClientPhone,
      vehicleNo: dcVehicleNo,
      transporterName: dcTransporterName,
      driverPhone: dcDriverPhone,
      poRefNo: dcPoRefNo,
      jobName: dcJobName,
      items: dcItems,
      gstRatePct: parseFloat(dcGstRatePct) || 18,
      subtotalAmount: subtotal,
      grandTotalAmount: grandTotal,
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

  // --------------------------------------------------------------------------
  // OPEN COA MODAL HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenNewCoaModal = () => {
    setEditingCoaId(null);
    const nextCoa = generateDocRefNumber('coa');
    setCoaNo(nextCoa);
    setCoaTestDate(new Date().toLocaleDateString('en-GB'));
    
    const firstClient = (clients && clients[0]) || {};
    setCoaCustomerName(firstClient.companyName || 'Foodella Foods');

    const firstJob = (jobMasters && jobMasters[0]) || {};
    setCoaJobName(firstJob.jobName || 'Foodella Reverse 7mm');
    setCoaJobCode(firstJob.id ? String(firstJob.id).replace('JM-', '') : '1');
    setCoaInvoiceNo(`SAM/25-26/${Math.floor(10000 + Math.random() * 90000)}`);
    setCoaFilmType(firstJob.structure ? `natural ${firstJob.structure}` : 'natural Deep Freeze (80%)');
    setCoaNetWeight('365.08 kg');
    setCoaSpecification(firstJob.structure ? `Multi-layer (${firstJob.structure})` : '2 layer (12 PET + 50 Deep Freeze)');
    setCoaSizeMm(firstJob.printWidthMm ? `${firstJob.printWidthMm} mm` : '700 mm');
    setCoaThicknessMicron(firstJob.micron ? `${firstJob.micron}µ` : '50µ');
    setCoaBatchLotNo(`BATCH-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setCoaOverallStatus('PASSED & APPROVED');
    setCoaQcInspector(currentUser ? `${currentUser.name} (QC Engineer)` : 'Ramesh Kumar (Quality Chemist)');
    setCoaApprovedByHead('Samyak Jain (QA Head)');
    setCoaRemarks('Material tested strictly in Quality Control Laboratory and meets all agreed technical specifications. Approved for dispatch.');

    setCoaParameters([...DEFAULT_COA_PARAMETERS]);

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
            onClick={() => setActiveTab('challans')}
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
            onClick={() => setActiveTab('coas')}
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
            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Challan No</th>
                    <th>Invoice No</th>
                    <th>Dispatch Date/Time</th>
                    <th>Client / Consignee</th>
                    <th>Vehicle No</th>
                    <th>Items Count</th>
                    <th>Total Dispatched</th>
                    <th>Grand Total (₹)</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(challanPagination.paginatedItems || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        <Truck size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 8px' }} />
                        No Delivery Challans found. Click <strong>"+ Issue Delivery Challan"</strong> to create one.
                      </td>
                    </tr>
                  ) : (
                    (challanPagination.paginatedItems || []).map(dc => {
                      const totalQty = (dc.items || []).reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
                      return (
                        <tr key={dc.id}>
                          <td>
                            <strong style={{ color: '#0284c7', fontFamily: 'monospace', fontSize: '0.9rem' }}>{dc.challanNo}</strong>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{dc.invoiceNo || 'N/A'}</span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#334155' }}>
                              {dc.dispatchDateTime ? new Date(dc.dispatchDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{dc.clientName}</div>
                            {dc.clientGstin && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>GST: {dc.clientGstin}</div>}
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontFamily: 'monospace' }}>
                              {dc.vehicleNo || 'Self Hand'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>{(dc.items || []).length} SKU Item(s)</span>
                          </td>
                          <td>
                            <strong style={{ color: '#047857' }}>{totalQty.toFixed(2)} Kg</strong>
                          </td>
                          <td>
                            <strong style={{ color: '#4f46e5' }}>{formatINR(dc.grandTotalAmount)}</strong>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                title="View & Print Official PDF"
                                onClick={() => setActiveDcForPDF(dc)}
                              >
                                <Printer size={14} /> View PDF
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
            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>CoA Report Ref</th>
                    <th>Testing Date</th>
                    <th>Customer Name</th>
                    <th>Job Name / SKU</th>
                    <th>Batch Lot #</th>
                    <th>Net Weight</th>
                    <th>QC Status</th>
                    <th>Quality Inspector</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
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
                        <td>
                          <strong style={{ color: '#047857', fontFamily: 'monospace', fontSize: '0.9rem' }}>{coa.coaNo}</strong>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>{coa.testDate}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{coa.customerName}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0284c7' }}>{coa.jobName}</div>
                          {coa.specification && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{coa.specification}</div>}
                        </td>
                        <td>
                          <span className="badge badge-secondary" style={{ fontFamily: 'monospace' }}>{coa.batchLotNo || 'N/A'}</span>
                        </td>
                        <td>
                          <strong style={{ color: '#334155' }}>{coa.netWeight || '—'}</strong>
                        </td>
                        <td>
                          <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontWeight: '700' }}>
                            ✓ {coa.overallStatus || 'PASSED'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: '#475569' }}>{coa.qcInspector}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
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
          <div className="glass-card modal-content" style={{ width: '820px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            
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
              
              {/* Grid 1: Basic Info */}
              <div className="form-grid" style={{ marginBottom: '16px' }}>
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

                <div>
                  <label className="form-label">Client Name (Select from List) *</label>
                  <select 
                    className="form-control" 
                    style={{ fontWeight: '700' }}
                    value={dcSelectedClientName} 
                    onChange={e => handleClientSelectChange(e.target.value)}
                    required
                  >
                    <option value="" disabled>-- Select Client --</option>
                    {(clients || []).map(c => {
                      const name = c.name || c.companyName || c.clientName || '';
                      return (
                        <option key={c.id || name} value={name}>{name}</option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Grid 2: Logistics & Client Details */}
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                  Logistics & Destination Details
                </div>
                <div className="form-grid">
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Consignee Delivery Address</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={dcClientAddress} 
                      onChange={e => setDcClientAddress(e.target.value)} 
                    />
                  </div>

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
                </div>
              </div>

              {/* Multiple Item Rows Section */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', marginBottom: '16px', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                    📦 Dispatched Item Rows & Rates
                  </div>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                    onClick={handleAddDcItemRow}
                  >
                    <Plus size={14} /> Add Item Row
                  </button>
                </div>

                <div style={{ overflowX: 'auto', width: '100%', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <table className="data-table" style={{ width: '100%', minWidth: '680px', margin: 0, fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ width: '35%', padding: '8px 10px' }}>Item Description *</th>
                        <th style={{ width: '14%', padding: '8px 10px' }}>HSN / SAC</th>
                        <th style={{ width: '14%', padding: '8px 10px' }}>Qty (Kg) *</th>
                        <th style={{ width: '14%', padding: '8px 10px' }}>Rate (₹/kg)</th>
                        <th style={{ width: '18%', padding: '8px 10px', textAlign: 'right' }}>Amount (₹)</th>
                        <th style={{ width: '5%', padding: '8px 5px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dcItems.map((item, idx) => (
                        <tr key={item.id || idx}>
                          <td style={{ padding: '6px 8px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem', fontWeight: '600' }}
                              value={item.description} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'description', e.target.value)}
                              required 
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem', textAlign: 'center', fontWeight: '600' }}
                              value={item.hsnSac} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'hsnSac', e.target.value)}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem', textAlign: 'right', fontWeight: '700' }}
                              value={item.quantity} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'quantity', e.target.value)}
                              required 
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              style={{ padding: '5px 8px', fontSize: '0.82rem', textAlign: 'right', fontWeight: '700' }}
                              value={item.rate} 
                              onChange={e => handleUpdateDcItemRow(item.id, 'rate', e.target.value)}
                            />
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '800', color: '#0284c7', fontSize: '0.88rem', verticalAlign: 'middle' }}>
                            {formatINR(item.amount || (item.quantity * item.rate))}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {dcItems.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => handleRemoveDcItemRow(item.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px' }}
                                title="Delete Row"
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

                {/* Subtotal & GST Calculation */}
                {(() => {
                  const subtotal = dcItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
                  const gstInfo = calculateGSTBreakdown(dcClientGstin, dcClientAddress, subtotal, dcGstRatePct, COMPANY_DETAILS.gstin);
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '12px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>Tax Rate:</span>
                        <select 
                          value={dcGstRatePct} 
                          onChange={e => setDcGstRatePct(e.target.value)}
                          style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.8rem' }}
                        >
                          <option value={18}>18% GST</option>
                          <option value={12}>12% GST</option>
                          <option value={5}>5% GST</option>
                          <option value={0}>0% (Exempt)</option>
                        </select>
                        <span style={{ fontWeight: '700', color: gstInfo.isIntraState ? '#047857' : '#0284c7', fontSize: '0.78rem' }}>
                          ({gstInfo.isIntraState ? 'CGST 9% + SGST 9% [Intra-State MP]' : 'IGST 18% [Inter-State]'})
                        </span>
                      </div>

                      <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a' }}>
                        Subtotal: {formatINR(subtotal)} | Grand Total: <span style={{ color: '#0284c7' }}>{formatINR(gstInfo.grandTotal)}</span>
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
                    <label className="form-label">NET WEIGHT</label>
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

                <div className="table-responsive" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="modern-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>Sr No</th>
                        <th style={{ width: '35%' }}>Parameter Name</th>
                        <th style={{ width: '15%' }}>Unit (UOM)</th>
                        <th style={{ width: '20%' }}>Standard Target</th>
                        <th style={{ width: '20%' }}>Measured Observation</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {coaParameters.map((param, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td>
                            <input 
                              type="text" 
                              className="form-control" 
                              value={param.parameter} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'parameter', e.target.value)} 
                              required 
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="form-control" 
                              value={param.uom} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'uom', e.target.value)} 
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="form-control" 
                              value={param.standard} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'standard', e.target.value)} 
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="form-control" 
                              style={{ fontWeight: '700', color: '#047857' }}
                              value={param.observation} 
                              onChange={e => handleUpdateCoaParameterRow(idx, 'observation', e.target.value)} 
                              required 
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              type="button" 
                              onClick={() => handleRemoveCoaParameterRow(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
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

    </div>
  );
}
