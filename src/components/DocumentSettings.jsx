import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  PenTool, 
  Upload, 
  Trash2, 
  Check, 
  Settings, 
  Hash, 
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  Plus,
  ListOrdered,
  Printer,
  Cpu,
  X,
  Edit3,
  Mail,
  Send,
  Palette,
  Eye,
  Sliders,
  Shield,
  Code,
  Sparkles,
  Server,
  Globe,
  Key,
  AlertCircle
} from 'lucide-react';
import { 
  getCompanyLogo,
  saveCompanyLogo,
  clearCompanyLogo,
  getAuthorisedSignature, 
  saveAuthorisedSignature, 
  clearAuthorisedSignature, 
  getDocumentPrefixes, 
  saveDocumentPrefixes,
  DEFAULT_PREFIXES,
  getDocumentTerms,
  saveDocumentTerms,
  DEFAULT_DOCUMENT_TERMS,
  getProcessingRates,
  saveProcessingRates,
  DEFAULT_RATES,
  getEmailSettings,
  saveEmailSettings,
  DEFAULT_EMAIL_SETTINGS,
  getEmailTemplates,
  saveEmailTemplates,
  resetEmailTemplates,
  DEFAULT_EMAIL_TEMPLATES,
  interpolateTemplate
} from '../services/settingsService';
import { sendERPEmailNotification, buildEmailTemplate } from '../services/emailService';

export default function DocumentSettings({ machines = [], onSaveMachine, onUpdateMachine, onDeleteMachine }) {
  // Navigation Sub-tab State
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'email_config', 'email_templates'

  // General Settings State
  const [logoImage, setLogoImage] = useState(() => getCompanyLogo());
  const [signatureImage, setSignatureImage] = useState(() => getAuthorisedSignature());
  const [prefixState, setPrefixState] = useState(() => getDocumentPrefixes());
  const [termsState, setTermsState] = useState(() => getDocumentTerms());
  const [ratesState, setRatesState] = useState(() => getProcessingRates());

  // Email Gateway & Routing State
  const [emailSettings, setEmailSettings] = useState(() => getEmailSettings());

  // Email Templates State
  const [emailTemplates, setEmailTemplates] = useState(() => getEmailTemplates());
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('order_punched');

  // Test Email State
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Machine Management State
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineType, setNewMachineType] = useState('Rotogravure');
  const [editingMachine, setEditingMachine] = useState(null);
  const [editMachineName, setEditMachineName] = useState('');
  const [editMachineType, setEditMachineType] = useState('Rotogravure');
  const [editMachineSpeed, setEditMachineSpeed] = useState(250);
  const [editMachineWidth, setEditMachineWidth] = useState(1200);
  const [editMachineColors, setEditMachineColors] = useState(8);
  const [editMachineLocation, setEditMachineLocation] = useState('');
  const [editMachineStatus, setEditMachineStatus] = useState('Active');

  const triggerSaveNotification = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // General Handlers
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.includes('image/')) {
      alert('Please upload a valid PNG or JPG image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert('Logo file size must be less than 3MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target.result;
      setLogoImage(base64);
      saveCompanyLogo(base64);
      triggerSaveNotification();
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = () => {
    clearCompanyLogo();
    setLogoImage('/samyak-logo.png');
    triggerSaveNotification();
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.includes('image/')) {
      alert('Please upload a valid PNG or JPG image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Image file size must be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target.result;
      setSignatureImage(base64);
      saveAuthorisedSignature(base64);
      triggerSaveNotification();
    };
    reader.readAsDataURL(file);
  };

  const handleClearSignature = () => {
    clearAuthorisedSignature();
    setSignatureImage(null);
    triggerSaveNotification();
  };

  const handlePrefixChange = (field, value) => {
    setPrefixState(prev => ({ ...prev, [field]: value }));
  };

  const handleSavePrefixes = (e) => {
    e.preventDefault();
    saveDocumentPrefixes(prefixState);
    triggerSaveNotification();
  };

  const handleResetPrefixes = () => {
    setPrefixState({ ...DEFAULT_PREFIXES });
    saveDocumentPrefixes({ ...DEFAULT_PREFIXES });
    triggerSaveNotification();
  };

  const handleTermChange = (category, index, value) => {
    const updated = [...termsState[category]];
    updated[index] = value;
    setTermsState(prev => ({ ...prev, [category]: updated }));
  };

  const handleAddTerm = (category) => {
    setTermsState(prev => ({
      ...prev,
      [category]: [...prev[category], 'New condition bullet...']
    }));
  };

  const handleRemoveTerm = (category, index) => {
    setTermsState(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const handleSaveTerms = (e) => {
    e.preventDefault();
    saveDocumentTerms(termsState);
    triggerSaveNotification();
  };

  const handleResetTerms = () => {
    setTermsState({ ...DEFAULT_DOCUMENT_TERMS });
    saveDocumentTerms({ ...DEFAULT_DOCUMENT_TERMS });
    triggerSaveNotification();
  };

  const openAddMachineModal = () => {
    setEditingMachine({ isNew: true, id: `MAC-2026-${Date.now()}` });
    setEditMachineName('');
    setEditMachineType('Rotogravure');
    setEditMachineSpeed(250);
    setEditMachineWidth(1200);
    setEditMachineColors(8);
    setEditMachineLocation('Bay 1 - Rotogravure Hall');
    setEditMachineStatus('Active');
  };

  const openEditMachineModal = (m) => {
    setEditingMachine(m);
    setEditMachineName(m.name || '');
    setEditMachineType(m.type || 'Rotogravure');
    setEditMachineSpeed(m.maxSpeedMpm || 250);
    setEditMachineWidth(m.maxWidthMm || 1200);
    setEditMachineColors(m.colors || 0);
    setEditMachineLocation(m.location || '');
    setEditMachineStatus(m.status || 'Active');
  };

  const handleSaveEditMachine = (e) => {
    e.preventDefault();
    if (!editMachineName.trim()) {
      alert("Machine Name is required!");
      return;
    }
    const updated = {
      ...(editingMachine || {}),
      id: editingMachine?.id || `MAC-2026-${Date.now()}`,
      name: editMachineName.trim(),
      type: editMachineType,
      maxSpeedMpm: Number(editMachineSpeed) || 0,
      maxWidthMm: Number(editMachineWidth) || 0,
      colors: Number(editMachineColors) || 0,
      location: editMachineLocation.trim(),
      status: editMachineStatus
    };
    delete updated.isNew;
    if (onUpdateMachine) {
      onUpdateMachine(updated);
    } else if (onSaveMachine) {
      onSaveMachine(updated);
    }
    setEditingMachine(null);
    triggerSaveNotification();
  };

  // Email Server Settings Handlers
  const handleSaveEmailSettings = (e) => {
    e.preventDefault();
    saveEmailSettings(emailSettings);
    triggerSaveNotification();
  };

  const handleResetEmailSettings = () => {
    setEmailSettings({ ...DEFAULT_EMAIL_SETTINGS });
    saveEmailSettings({ ...DEFAULT_EMAIL_SETTINGS });
    triggerSaveNotification();
  };

  // Email Templates Handlers
  const handleUpdateCurrentTemplate = (field, value) => {
    setEmailTemplates(prev => ({
      ...prev,
      [selectedTemplateKey]: {
        ...prev[selectedTemplateKey],
        [field]: value
      }
    }));
  };

  const handleSaveTemplates = (e) => {
    if (e) e.preventDefault();
    saveEmailTemplates(emailTemplates);
    triggerSaveNotification();
  };

  const handleResetTemplates = () => {
    const res = resetEmailTemplates();
    setEmailTemplates(res);
    triggerSaveNotification();
  };

  // Send Test Email Dispatcher
  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) {
      alert("Please enter a valid recipient email address for testing.");
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    const activeTmpl = emailTemplates[selectedTemplateKey] || DEFAULT_EMAIL_TEMPLATES[selectedTemplateKey];

    const sampleVars = {
      orderId: 'ORD-2026-108',
      jobName: 'Lays Magic Masala 50g',
      clientName: 'PepsiCo India Ltd',
      orderQtyKg: '2,500',
      structure: 'PET 12µ / METPET 12µ / LD 40µ',
      targetDeliveryDate: '2026-08-30',
      recordId: 'PROD-2026-042',
      totalProductionQtyKg: '2,480',
      totalMaterialCostRs: '3,85,000',
      finalProductionCostRs: '4,12,000',
      totalScrapQtyKg: '35.5',
      filledBy: 'Plant Manager (Ramesh Kumar)',
      approvedBy: 'Samyak Jain (Admin)',
      approvalDate: '2026-08-11',
      indentNo: 'SIL/IND/26-27/105',
      department: 'Rotogravure Printing',
      priority: 'High',
      itemCount: '3',
      remarks: 'Urgent solvent ink stock requirement',
      poNumber: 'SIL/PO/26-27/247',
      supplierName: 'Uflex Limited',
      indentNumber: 'SIL/IND/26-27/105',
      itemName: 'PET Film 12 Micron Corona Treated',
      qty: '5,000',
      unit: 'kg',
      totalAmount: '7,40,000',
      itemCode: 'INV-004',
      stockQty: '450',
      reorderLevel: '1,000',
      location: 'Extrusion Store Bay 2',
      userName: 'Rajesh Sharma',
      userEmail: testEmailRecipient.trim(),
      userRole: 'Plant Manager',
      userDepartment: 'Production Operations',
      userPassword: 'Samyak#Pass2026',
      recoveryCode: '849201'
    };

    const interpTitle = interpolateTemplate(activeTmpl.eventTitle || '', sampleVars);
    const interpSubject = `[TEST DISPATCH] ` + interpolateTemplate(activeTmpl.subject || '', sampleVars);
    const interpBadge = interpolateTemplate(activeTmpl.badgeText || '', sampleVars);
    const interpBody = interpolateTemplate(activeTmpl.contentHtml || '', sampleVars);
    const interpFooter = interpolateTemplate(activeTmpl.footerNote || '', sampleVars);

    const html = buildEmailTemplate({
      title: interpTitle,
      badgeText: interpBadge,
      badgeBg: activeTmpl.badgeBgColor || '#0284c7',
      contentHtml: interpBody,
      footerNote: interpFooter
    });

    const res = await sendERPEmailNotification({
      to: testEmailRecipient.trim(),
      cc: activeTmpl.ccEmail,
      subject: interpSubject,
      html,
      text: `Test dispatch email for template ${activeTmpl.name}`
    });

    setIsSendingTest(false);
    setTestResult(res);
  };

  const currentTemplate = emailTemplates[selectedTemplateKey] || DEFAULT_EMAIL_TEMPLATES.order_punched;

  // Placeholder Helper Variables for Editor
  const templatePlaceholders = {
    order_punched: ['{orderId}', '{jobName}', '{clientName}', '{orderQtyKg}', '{structure}', '{targetDeliveryDate}'],
    production_submitted: ['{recordId}', '{orderId}', '{jobName}', '{totalProductionQtyKg}', '{totalMaterialCostRs}', '{finalProductionCostRs}', '{totalScrapQtyKg}', '{filledBy}'],
    production_approved: ['{recordId}', '{jobName}', '{totalProductionQtyKg}', '{finalProductionCostRs}', '{approvedBy}', '{approvalDate}'],
    indent_created: ['{indentNo}', '{department}', '{priority}', '{itemCount}', '{remarks}'],
    po_issued: ['{poNumber}', '{supplierName}', '{indentNumber}', '{itemName}', '{qty}', '{unit}', '{totalAmount}'],
    low_stock: ['{itemCode}', '{itemName}', '{stockQty}', '{unit}', '{reorderLevel}', '{location}'],
    user_created: ['{userName}', '{userEmail}', '{userRole}', '{userDepartment}', '{userPassword}'],
    password_recovery: ['{userEmail}', '{recoveryCode}'],
    over_wastage: ['{jobName}', '{orderId}', '{productionDateTime}', '{orderQtyKg}', '{totalProductionQtyKg}', '{allowedWastagePct}', '{actualWastagePct}', '{actualWastageKg}', '{wastageVariancePct}', '{wastageBreakdownHtml}']
  };

  // Sample Variables for Live Preview Rendering
  const previewVars = {
    orderId: 'ORD-2026-108',
    jobName: 'Lays Magic Masala 50g',
    clientName: 'PepsiCo India Ltd',
    orderQtyKg: '2,500',
    structure: 'PET 12µ / METPET 12µ / LD 40µ',
    targetDeliveryDate: '2026-08-30',
    recordId: 'PROD-2026-042',
    totalProductionQtyKg: '2,480',
    totalMaterialCostRs: '3,85,000',
    finalProductionCostRs: '4,12,000',
    totalScrapQtyKg: '35.5',
    filledBy: 'Plant Manager (Ramesh Kumar)',
    approvedBy: 'Samyak Jain (Admin)',
    approvalDate: '2026-08-11',
    indentNo: 'SIL/IND/26-27/105',
    department: 'Rotogravure Printing',
    priority: 'High',
    itemCount: '3',
    remarks: 'Urgent solvent ink stock requirement',
    poNumber: 'SIL/PO/26-27/247',
    supplierName: 'Uflex Limited',
    indentNumber: 'SIL/IND/26-27/105',
    itemName: 'PET Film 12 Micron Corona Treated',
    qty: '5,000',
    unit: 'kg',
    totalAmount: '7,40,000',
    itemCode: 'INV-004',
    stockQty: '450',
    reorderLevel: '1,000',
    location: 'Extrusion Store Bay 2',
    userName: 'Rajesh Sharma',
    userEmail: 'rsharma@samyakinternational.in',
    userRole: 'Plant Manager',
    userDepartment: 'Production Operations',
    userPassword: 'Samyak#Pass2026',
    recoveryCode: '849201',
    productionDateTime: '11/08/2026, 09:30:15 PM',
    allowedWastagePct: '5.0',
    actualWastagePct: '8.4',
    actualWastageKg: '210.0',
    wastageVariancePct: '+3.4',
    wastageBreakdownHtml: `<table class="data-table"><thead><tr><th>Process Stage Scrap Category</th><th style="text-align: right;">Wastage Qty (kg)</th></tr></thead><tbody><tr><td>Printing Plain Setting</td><td style="text-align: right; font-weight: 700; color: #dc2626;">65.0 kg</td></tr><tr><td>Printing Process Wastage</td><td style="text-align: right; font-weight: 700; color: #dc2626;">45.0 kg</td></tr><tr><td>Lamination Plain Substrate</td><td style="text-align: right; font-weight: 700; color: #dc2626;">30.0 kg</td></tr><tr><td>Slitting Side Trim Wastage</td><td style="text-align: right; font-weight: 700; color: #dc2626;">70.0 kg</td></tr></tbody></table>`
  };

  const previewSubject = interpolateTemplate(currentTemplate.subject || '', previewVars);
  const previewTitle = interpolateTemplate(currentTemplate.eventTitle || '', previewVars);
  const previewBadge = interpolateTemplate(currentTemplate.badgeText || '', previewVars);
  const previewBody = interpolateTemplate(currentTemplate.contentHtml || '', previewVars);
  const previewFooter = interpolateTemplate(currentTemplate.footerNote || '', previewVars);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner & Sub-tab Navigation Header */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <Settings size={24} style={{ color: 'var(--primary-brand)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                System & Document Settings
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                Configure Company Letterhead Specs, SMTP Mail Gateway Credentials & Custom Email Templates
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {savedSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '6px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700' }}>
                <CheckCircle2 size={18} /> Settings Saved!
              </div>
            )}

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
                style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', border: 'none', background: activeTab === 'general' ? '#ffffff' : 'transparent', color: activeTab === 'general' ? '#0f172a' : '#64748b', boxShadow: activeTab === 'general' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                onClick={() => setActiveTab('general')}
              >
                📄 Document Specs
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'email_config' ? 'active' : ''}`}
                style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', border: 'none', background: activeTab === 'email_config' ? '#ffffff' : 'transparent', color: activeTab === 'email_config' ? '#0f172a' : '#64748b', boxShadow: activeTab === 'email_config' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                onClick={() => setActiveTab('email_config')}
              >
                ⚙️ SMTP Server & Routing
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'email_templates' ? 'active' : ''}`}
                style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', border: 'none', background: activeTab === 'email_templates' ? '#ffffff' : 'transparent', color: activeTab === 'email_templates' ? '#0f172a' : '#64748b', boxShadow: activeTab === 'email_templates' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                onClick={() => setActiveTab('email_templates')}
              >
                ✉️ Email Templates & Live Preview
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: GENERAL DOCUMENT & LETTERHEAD SPECS */}
      {/* ========================================================================= */}
      {activeTab === 'general' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            {/* SECTION 1: COMPANY LOGO UPLOAD */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={20} style={{ color: 'var(--primary-brand)' }} /> Company Logo for Letterheads
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Applied to all PDFs</span>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Upload your company logo image (PNG or JPG). This logo will render at the top header of all document letterheads (Purchase Orders, OCN, GRN, Job Data Sheets, etc.).
              </p>

              <div style={{ background: '#f8fafc', border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '140px' }}>
                <div style={{ background: '#ffffff', padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                  <img 
                    src={logoImage} 
                    alt="Active Company Logo" 
                    style={{ maxHeight: '60px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '600', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={14} /> Active Letterhead Logo
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
                <label className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                  <Upload size={16} /> Upload Logo (PNG/JPG)
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/jpg" 
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleClearLogo}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Reset to default logo"
                >
                  <RefreshCw size={14} /> Reset Default
                </button>
              </div>
            </div>

            {/* SECTION 2: AUTHORISED SIGNATORY STAMP */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PenTool size={20} style={{ color: 'var(--primary-brand)' }} /> Authorised Signatory Stamp
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Footer Authentication</span>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Upload digital signature / official seal image (PNG transparent background recommended). This will appear on outgoing Purchase Orders & Delivery Challans.
              </p>

              <div style={{ background: '#f8fafc', border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '140px' }}>
                {signatureImage ? (
                  <div style={{ background: '#ffffff', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <img 
                      src={signatureImage} 
                      alt="Authorised Signatory" 
                      style={{ maxHeight: '60px', objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem', color: '#94a3b8', border: '1px dashed #cbd5e1', padding: '16px 24px', borderRadius: '6px' }}>
                    No Digital Signature Uploaded
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
                <label className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                  <Upload size={16} /> Upload Signature
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/jpg" 
                    onChange={handleSignatureUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {signatureImage && (
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="btn-secondary"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: DOCUMENT PREFIXES & COUNTERS */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Hash size={20} style={{ color: 'var(--primary-brand)' }} /> Document Reference Prefixes & Auto-Counters
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Customize serial numbering formats for PO, OCN, GRN, Quotation, Dispatch & Indents.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={handleResetPrefixes} style={{ fontSize: '0.78rem' }}>
                <RefreshCw size={14} /> Reset Prefixes
              </button>
            </div>

            <form onSubmit={handleSavePrefixes}>
              <div className="form-grid-3" style={{ gap: '16px' }}>
                <div>
                  <label className="form-label">Purchase Order Prefix & Counter</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-control" value={prefixState.poPrefix} onChange={e => handlePrefixChange('poPrefix', e.target.value)} required />
                    <input type="number" className="form-control" style={{ width: '100px' }} value={prefixState.poCounter} onChange={e => handlePrefixChange('poCounter', e.target.value)} required />
                  </div>
                </div>

                <div>
                  <label className="form-label">Order Confirmation (OCN) Prefix & Counter</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-control" value={prefixState.ocnPrefix} onChange={e => handlePrefixChange('ocnPrefix', e.target.value)} required />
                    <input type="number" className="form-control" style={{ width: '100px' }} value={prefixState.ocnCounter} onChange={e => handlePrefixChange('ocnCounter', e.target.value)} required />
                  </div>
                </div>

                <div>
                  <label className="form-label">Goods Receipt (GRN) Prefix & Counter</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-control" value={prefixState.grnPrefix} onChange={e => handlePrefixChange('grnPrefix', e.target.value)} required />
                    <input type="number" className="form-control" style={{ width: '100px' }} value={prefixState.grnCounter} onChange={e => handlePrefixChange('grnCounter', e.target.value)} required />
                  </div>
                </div>

                <div>
                  <label className="form-label">Sales Quotation Prefix & Counter</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-control" value={prefixState.qtnPrefix} onChange={e => handlePrefixChange('qtnPrefix', e.target.value)} required />
                    <input type="number" className="form-control" style={{ width: '100px' }} value={prefixState.qtnCounter} onChange={e => handlePrefixChange('qtnCounter', e.target.value)} required />
                  </div>
                </div>

                <div>
                  <label className="form-label">Dispatch Delivery Challan (DC) Prefix</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-control" value={prefixState.dcPrefix} onChange={e => handlePrefixChange('dcPrefix', e.target.value)} required />
                    <input type="number" className="form-control" style={{ width: '100px' }} value={prefixState.dcCounter} onChange={e => handlePrefixChange('dcCounter', e.target.value)} required />
                  </div>
                </div>

                <div>
                  <label className="form-label">Purchase Indent Requisition Prefix</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-control" value={prefixState.indentPrefix} onChange={e => handlePrefixChange('indentPrefix', e.target.value)} required />
                    <input type="number" className="form-control" style={{ width: '100px' }} value={prefixState.indentCounter} onChange={e => handlePrefixChange('indentCounter', e.target.value)} required />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn-primary" style={{ padding: '8px 20px' }}>
                  <Check size={16} /> Save Document Prefixes
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 4: PLANT MACHINE SPECS & CAPACITY */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={20} style={{ color: 'var(--primary-brand)' }} /> Plant Machinery Directory & Technical Specs
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Configure printing presses, laminators, slitters, and pouching machines for production scheduling.
                </p>
              </div>

              <button type="button" className="btn-primary" onClick={openAddMachineModal}>
                <Plus size={16} /> Add New Machine
              </button>
            </div>

            <table className="data-table" style={{ width: '100%', marginBottom: '16px' }}>
              <thead>
                <tr>
                  <th>Machine Name</th>
                  <th>Machine Type</th>
                  <th>Max Speed (mpm)</th>
                  <th>Max Width (mm)</th>
                  <th>Colors</th>
                  <th>Location / Bay</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.type}</td>
                    <td>{m.maxSpeedMpm || 250} m/min</td>
                    <td>{m.maxWidthMm || 1200} mm</td>
                    <td>{m.colors ? `${m.colors} Colors` : 'N/A'}</td>
                    <td>{m.location || 'Main Plant'}</td>
                    <td>
                      <span className={`badge ${m.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                        {m.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="btn-icon" onClick={() => openEditMachineModal(m)} title="Edit Machine Specs">
                          <Edit3 size={14} />
                        </button>
                        {onDeleteMachine && (
                          <button type="button" className="btn-icon text-danger" onClick={() => onDeleteMachine(m.id)} title="Delete Machine">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SMTP SERVER CONFIGURATION & DEPARTMENT ROUTING */}
      {/* ========================================================================= */}
      {activeTab === 'email_config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <form onSubmit={handleSaveEmailSettings} className="glass-panel" style={{ padding: '28px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '900', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server size={22} /> SMTP Mail Server Gateway & Security Credentials
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Configure Hostinger or custom corporate SMTP gateway to dispatch transactional emails.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={handleResetEmailSettings} style={{ fontSize: '0.8rem' }}>
                <RefreshCw size={14} /> Reset SMTP Defaults
              </button>
            </div>

            <div className="form-grid-3" style={{ gap: '20px', marginBottom: '24px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>SMTP Server Host Hostname *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. smtp.hostinger.com"
                  value={emailSettings.smtpHost}
                  onChange={e => setEmailSettings({ ...emailSettings, smtpHost: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>SMTP Port Number *</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="465 (SSL) or 587 (TLS)"
                  value={emailSettings.smtpPort}
                  onChange={e => setEmailSettings({ ...emailSettings, smtpPort: Number(e.target.value) })}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>Sender Display Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Samyak International ERP"
                  value={emailSettings.senderName}
                  onChange={e => setEmailSettings({ ...emailSettings, senderName: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>SMTP Username / Work Email *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="admin@samyakinternational.in"
                  value={emailSettings.smtpUser}
                  onChange={e => setEmailSettings({ ...emailSettings, smtpUser: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>SMTP Password / App Secret *</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••••••"
                  value={emailSettings.smtpPass}
                  onChange={e => setEmailSettings({ ...emailSettings, smtpPass: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>Security Encryption Mode</label>
                <select
                  className="form-control"
                  value={emailSettings.smtpSecure ? 'SSL' : 'TLS'}
                  onChange={e => setEmailSettings({ ...emailSettings, smtpSecure: e.target.value === 'SSL' })}
                >
                  <option value="SSL">SSL / TLS (Port 465 - Recommended)</option>
                  <option value="TLS">STARTTLS / Plain (Port 587)</option>
                </select>
              </div>
            </div>

            {/* Department Recipient Email Routing */}
            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} style={{ color: '#0284c7' }} /> Department Recipient Email Routing Rules
              </h4>

              <div className="form-grid-2" style={{ gap: '16px' }}>
                <div>
                  <label className="form-label">System Executive Admin Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={emailSettings.adminEmail}
                    onChange={e => setEmailSettings({ ...emailSettings, adminEmail: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '0.75rem' }}>Receives order creations, production submissions & critical stock alerts</small>
                </div>

                <div>
                  <label className="form-label">Plant Manager Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={emailSettings.plantManagerEmail}
                    onChange={e => setEmailSettings({ ...emailSettings, plantManagerEmail: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '0.75rem' }}>Receives production record approvals & shop floor notifications</small>
                </div>

                <div>
                  <label className="form-label">Purchase Department Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={emailSettings.purchaseEmail}
                    onChange={e => setEmailSettings({ ...emailSettings, purchaseEmail: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '0.75rem' }}>Receives purchase indents, PO copies & low stock alerts</small>
                </div>

                <div>
                  <label className="form-label">Dispatch / Logistics Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={emailSettings.dispatchEmail}
                    onChange={e => setEmailSettings({ ...emailSettings, dispatchEmail: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '0.75rem' }}>Receives shipping notices and completed job dispatch logs</small>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="submit" className="btn-primary" style={{ padding: '10px 24px' }}>
                <Check size={18} /> Save SMTP Gateway & Routing Rules
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CONFIGURABLE EMAIL TEMPLATES & LIVE VISUAL PREVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'email_templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Template Selection Toolbar */}
          <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}>
                Select Email Event Template:
              </label>
              <select
                className="form-control"
                style={{ width: '340px', fontWeight: '700', color: '#0f172a', background: '#ffffff', border: '1px solid #0284c7' }}
                value={selectedTemplateKey}
                onChange={e => setSelectedTemplateKey(e.target.value)}
              >
                {Object.values(emailTemplates).map(tmpl => (
                  <option key={tmpl.key} value={tmpl.key}>
                    {tmpl.name} ({tmpl.enabled ? 'Enabled' : 'Disabled'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-secondary" onClick={handleResetTemplates} style={{ fontSize: '0.8rem' }}>
                <RefreshCw size={14} /> Reset All Templates to Factory Default
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveTemplates} style={{ padding: '8px 20px' }}>
                <Check size={16} /> Save All Email Templates
              </button>
            </div>
          </div>

          {/* Grid Layout: Editor on Left, Live HTML Visualizer on Right */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
            
            {/* LEFT SIDE: TEMPLATE EDITOR FORM */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={18} style={{ color: 'var(--primary-brand)' }} /> Edit Template: {currentTemplate.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', color: currentTemplate.enabled ? '#059669' : '#dc2626' }}>
                    {currentTemplate.enabled ? '● Active Notification' : '○ Disabled'}
                  </label>
                  <input
                    type="checkbox"
                    checked={!!currentTemplate.enabled}
                    onChange={e => handleUpdateCurrentTemplate('enabled', e.target.checked)}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                </div>
              </div>

              {/* Dynamic Variables Quick-Insert Chips */}
              <div style={{ background: '#f1f5f9', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                  ⚡ Available Variables for {currentTemplate.name}:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(templatePlaceholders[selectedTemplateKey] || []).map(chip => (
                    <span
                      key={chip}
                      style={{ background: '#ffffff', border: '1px solid #94a3b8', color: '#0284c7', fontSize: '0.75rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                      title={`Click to copy placeholder ${chip}`}
                      onClick={() => {
                        navigator.clipboard.writeText(chip);
                        alert(`Copied ${chip} to clipboard!`);
                      }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>Email Subject Line *</label>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontWeight: '700', color: '#0f172a' }}
                  value={currentTemplate.subject || ''}
                  onChange={e => handleUpdateCurrentTemplate('subject', e.target.value)}
                  required
                />
              </div>

              <div className="form-grid-2" style={{ gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Badge Label Text</label>
                  <input
                    type="text"
                    className="form-control"
                    value={currentTemplate.badgeText || ''}
                    onChange={e => handleUpdateCurrentTemplate('badgeText', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Badge Color Hex</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="color"
                      style={{ width: '42px', height: '38px', border: 'none', background: 'none', cursor: 'pointer' }}
                      value={currentTemplate.badgeBgColor || '#0284c7'}
                      onChange={e => handleUpdateCurrentTemplate('badgeBgColor', e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={currentTemplate.badgeBgColor || '#0284c7'}
                      onChange={e => handleUpdateCurrentTemplate('badgeBgColor', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-grid-2" style={{ gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Primary Recipient (To Email)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. admin@samyakinternational.in"
                    value={currentTemplate.toEmail || ''}
                    onChange={e => handleUpdateCurrentTemplate('toEmail', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Copy Recipient (CC Email)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. plant.manager@plant.com"
                    value={currentTemplate.ccEmail || ''}
                    onChange={e => handleUpdateCurrentTemplate('ccEmail', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>Email Body Message (HTML Format)</label>
                <textarea
                  className="form-control"
                  rows={8}
                  style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: '1.4' }}
                  value={currentTemplate.contentHtml || ''}
                  onChange={e => handleUpdateCurrentTemplate('contentHtml', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700' }}>Footer Note / Company Disclaimer</label>
                <textarea
                  className="form-control"
                  rows={2}
                  style={{ fontSize: '0.8rem' }}
                  value={currentTemplate.footerNote || ''}
                  onChange={e => handleUpdateCurrentTemplate('footerNote', e.target.value)}
                />
              </div>

              {/* Test Email Dispatch Card */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '10px' }}>
                <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send size={15} style={{ color: '#0284c7' }} /> Live Test Email Dispatcher
                </h5>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="Enter test recipient email..."
                    value={testEmailRecipient}
                    onChange={e => setTestEmailRecipient(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '8px 16px', whiteSpace: 'nowrap', fontSize: '0.82rem' }}
                    onClick={handleSendTestEmail}
                    disabled={isSendingTest}
                  >
                    {isSendingTest ? 'Sending...' : 'Send Test Mail'}
                  </button>
                </div>

                {testResult && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', background: testResult.success ? '#ecfdf5' : '#fef2f2', color: testResult.success ? '#047857' : '#991b1b', border: testResult.success ? '1px solid #a7f3d0' : '1px solid #fecaca' }}>
                    {testResult.success ? `✅ Test email successfully delivered to ${testEmailRecipient}!` : `❌ Dispatch failed: ${testResult.message}`}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT SIDE: LIVE HTML EMAIL INBOX PREVIEW */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', background: '#e2e8f0' }}>
              <div style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Eye size={18} style={{ color: '#0284c7' }} /> Real-Time Email Visualizer
                </h3>
                <span style={{ fontSize: '0.72rem', background: '#0284c7', color: '#ffffff', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                  Live Inbox View
                </span>
              </div>

              {/* Simulated Email Envelope Header */}
              <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                <div><strong>To:</strong> {currentTemplate.toEmail || 'admin@samyakinternational.in'} {currentTemplate.ccEmail ? `(CC: ${currentTemplate.ccEmail})` : ''}</div>
                <div style={{ marginTop: '4px' }}><strong>Subject:</strong> <span style={{ color: '#0f172a', fontWeight: '700' }}>{previewSubject}</span></div>
              </div>

              {/* Rendered HTML Container */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '0 0 8px 8px', overflowY: 'auto', maxHeight: '680px' }}>
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                  {/* Top Branding Header */}
                  <div style={{ background: '#0f172a', color: '#ffffff', padding: '20px', textAlign: 'center', borderBottom: `3px solid ${currentTemplate.badgeBgColor || '#0284c7'}` }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.3px' }}>Samyak International Ltd</h1>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>Flexible Packaging Manufacturing ERP • Action Task Notification System</p>
                  </div>

                  {/* Body Content */}
                  <div style={{ padding: '24px' }}>
                    <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', backgroundColor: currentTemplate.badgeBgColor || '#0284c7' }}>
                      {previewBadge}
                    </div>
                    <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginTop: 0, marginBottom: '14px', lineHeight: '1.3' }}>
                      {previewTitle}
                    </h2>
                    
                    <div 
                      dangerouslySetInnerHTML={{ __html: previewBody }} 
                      style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}
                    />
                  </div>

                  {/* Footer Note */}
                  <div style={{ background: '#f8fafc', padding: '16px', textAlign: 'center', fontSize: '11px', color: '#64748b', borderTop: '1px solid #e2e8f0', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                    {previewFooter}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MACHINE SPECS MODAL */}
      {editingMachine && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={20} style={{ color: 'var(--primary-brand)' }} /> {editingMachine?.isNew ? 'Add New Plant Machine' : 'Edit Machine Technical Specifications'}
              </h3>
              <button type="button" className="btn-icon" onClick={() => setEditingMachine(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditMachine} className="modal-body">
              <div className="form-group">
                <label>Machine Name / Code *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={editMachineName} 
                  onChange={e => setEditMachineName(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Machine Category / Type</label>
                  <select className="form-control" value={editMachineType} onChange={e => setEditMachineType(e.target.value)}>
                    <option value="Rotogravure">Rotogravure Printing Press</option>
                    <option value="Flexographic">Flexographic Printing Press</option>
                    <option value="Lamination">Solventless / Solvent Laminator</option>
                    <option value="Slitting">High Speed Doctor Slitter</option>
                    <option value="Pouching">Pouch Making / Center Seal Machine</option>
                    <option value="Extrusion">Blown Film Extruder</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Color Stations</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={editMachineColors} 
                    onChange={e => setEditMachineColors(e.target.value)} 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Max Mechanical Speed (m/min)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={editMachineSpeed} 
                    onChange={e => setEditMachineSpeed(e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>Max Web Width (mm)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={editMachineWidth} 
                    onChange={e => setEditMachineWidth(e.target.value)} 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Plant Location / Bay</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Bay 1 - Rotogravure Hall"
                    value={editMachineLocation} 
                    onChange={e => setEditMachineLocation(e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>Operational Status</label>
                  <select className="form-control" value={editMachineStatus} onChange={e => setEditMachineStatus(e.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingMachine(null)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <Check size={16} /> Save Machine Specs
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
