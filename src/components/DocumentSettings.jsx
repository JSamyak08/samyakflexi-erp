import React, { useState } from 'react';
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
  X
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
  DEFAULT_DOCUMENT_TERMS
} from '../services/settingsService';

export default function DocumentSettings({ machines = [], onSaveMachine, onDeleteMachine }) {
  // Logo State
  const [logoImage, setLogoImage] = useState(() => getCompanyLogo());

  // Signature State
  const [signatureImage, setSignatureImage] = useState(() => getAuthorisedSignature());
  
  // Prefixes State
  const [prefixState, setPrefixState] = useState(() => getDocumentPrefixes());

  // Terms & Conditions State
  const [termsState, setTermsState] = useState(() => getDocumentTerms());

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Plant Machine Quick-Add State
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineType, setNewMachineType] = useState('Rotogravure');

  // Handle Company Logo Upload (PNG/JPG)
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('image/')) {
      alert('Please upload a valid PNG or JPG image file for the company logo.');
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

  // Handle Authorised Signature Upload (PNG/JPG)
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
    setPrefixState(prev => ({
      ...prev,
      [field]: value
    }));
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

  // Terms and Conditions Handlers
  const handleTermChange = (category, index, value) => {
    const updated = [...termsState[category]];
    updated[index] = value;
    setTermsState(prev => ({ ...prev, [category]: updated }));
  };

  const handleAddTerm = (category) => {
    setTermsState(prev => ({
      ...prev,
      [category]: [...prev[category], 'New term condition bullet...']
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

  const triggerSaveNotification = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <Settings size={24} style={{ color: 'var(--primary-brand)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Document & Letterhead Settings</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                Configure Company Logo, Authorised Signatory graphic, Document Prefixes & Terms and Conditions
              </p>
            </div>
          </div>

          {savedSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}>
              <CheckCircle2 size={18} /> Settings Saved Successfully!
            </div>
          )}
        </div>
      </div>

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

          {/* Logo Preview Box */}
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

          {/* Upload Controls */}
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

        {/* SECTION 2: AUTHORISED SIGNATURE UPLOAD */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PenTool size={20} style={{ color: 'var(--primary-brand)' }} /> Authorised Signature (PNG/JPG)
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Appears on PO, OCN & GRN</span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Upload an image of your company's authorised signature or stamp (PNG or JPG). This graphic will render above <strong>"Authorised Signatory"</strong> on all PDF letterheads.
          </p>

          {/* Signature Preview Box */}
          <div style={{ background: '#f8fafc', border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '140px' }}>
            {signatureImage ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#ffffff', padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                  <img 
                    src={signatureImage} 
                    alt="Authorised Signature Preview" 
                    style={{ maxHeight: '50px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={14} /> Active Signature Graphic
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <ImageIcon size={36} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ fontSize: '0.8rem' }}>No custom signature uploaded. (Using text signature line)</p>
              </div>
            )}
          </div>

          {/* Upload Controls */}
          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
            <label className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
              <Upload size={16} /> {signatureImage ? 'Change Signature' : 'Upload Signature'}
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
                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        </div>

      </div>

      {/* SECTION 3: DOCUMENT PREFIX SERIES */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Hash size={20} style={{ color: 'var(--primary-brand)' }} /> Document Reference Number & Series Prefixes
          </h3>
          <button 
            type="button" 
            onClick={handleResetPrefixes}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={12} /> Reset Defaults
          </button>
        </div>

        <form onSubmit={handleSavePrefixes} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '12px' }}>Purchase Order (PO) Series</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="form-label">PO Prefix String</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={prefixState.poPrefix}
                  onChange={(e) => handlePrefixChange('poPrefix', e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Next Counter Number</label>
                <input 
                  type="number" 
                  className="form-control"
                  value={prefixState.poCounter}
                  onChange={(e) => handlePrefixChange('poCounter', parseInt(e.target.value) || 1)}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Sample: <strong>{prefixState.poPrefix}{prefixState.poCounter}</strong>
              </div>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '12px' }}>Order Confirmation (OCN) Series</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="form-label">OCN Prefix String</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={prefixState.ocnPrefix}
                  onChange={(e) => handlePrefixChange('ocnPrefix', e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Next Counter Number</label>
                <input 
                  type="number" 
                  className="form-control"
                  value={prefixState.ocnCounter}
                  onChange={(e) => handlePrefixChange('ocnCounter', parseInt(e.target.value) || 1)}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Sample: <strong>{prefixState.ocnPrefix}{prefixState.ocnCounter}</strong>
              </div>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '12px' }}>Goods Receipt Note (GRN) Series</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="form-label">GRN Prefix String</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={prefixState.grnPrefix}
                  onChange={(e) => handlePrefixChange('grnPrefix', e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Next Counter Number</label>
                <input 
                  type="number" 
                  className="form-control"
                  value={prefixState.grnCounter}
                  onChange={(e) => handlePrefixChange('grnCounter', parseInt(e.target.value) || 1)}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Sample: <strong>{prefixState.grnPrefix}{prefixState.grnCounter}</strong>
              </div>
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button type="submit" className="btn-primary" style={{ padding: '8px 24px' }}>
              <Check size={16} /> Save Document Prefixes
            </button>
          </div>

        </form>
      </div>

      {/* SECTION 4: TERMS & CONDITIONS EDITING */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListOrdered size={20} style={{ color: 'var(--primary-brand)' }} /> Document Terms & Conditions & Payment Terms
          </h3>
          <button 
            type="button" 
            onClick={handleResetTerms}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={12} /> Reset Default Terms
          </button>
        </div>

        <form onSubmit={handleSaveTerms} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700' }}>Standard Payment Terms</label>
            <input 
              type="text" 
              className="form-control"
              value={termsState.paymentTerms}
              onChange={(e) => setTermsState(prev => ({ ...prev, paymentTerms: e.target.value }))}
              placeholder="e.g. 60 Days after Delivery"
            />
          </div>

          {/* PO Terms */}
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700' }}>Purchase Order Terms & Conditions Bullets</h4>
              <button 
                type="button" 
                onClick={() => handleAddTerm('poTerms')}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={12} /> Add Bullet
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {termsState.poTerms?.map((term, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{index + 1}.</span>
                  <input 
                    type="text" 
                    className="form-control"
                    value={term}
                    onChange={(e) => handleTermChange('poTerms', index, e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveTerm('poTerms', index)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* OCN Terms */}
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700' }}>Order Confirmation (OCN) Terms & Conditions</h4>
              <button 
                type="button" 
                onClick={() => handleAddTerm('ocnTerms')}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={12} /> Add Bullet
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {termsState.ocnTerms?.map((term, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{index + 1}.</span>
                  <input 
                    type="text" 
                    className="form-control"
                    value={term}
                    onChange={(e) => handleTermChange('ocnTerms', index, e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveTerm('ocnTerms', index)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button type="submit" className="btn-primary" style={{ padding: '10px 28px' }}>
              <Check size={18} /> Save Terms & Conditions
            </button>
          </div>

        </form>
      </div>

      {/* PLANT MACHINE DIRECTORY */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={20} style={{ color: 'var(--primary-brand)' }} /> Plant Machine Directory
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>All machines saved to Supabase · used across all modules</span>
        </div>

        {/* Quick Add Form */}
        {onSaveMachine ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: '10px', marginBottom: '20px', alignItems: 'end' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: '700' }}>Machine / Plant Unit Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Rotogravure Press #3 (12-Color)"
                value={newMachineName}
                onChange={e => setNewMachineName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newMachineName.trim()) {
                      onSaveMachine({ name: newMachineName.trim(), type: newMachineType, colors: 0, maxSpeedMpm: 0, maxWidthMm: 0, status: 'Active', operator: '', location: '' });
                      setNewMachineName('');
                      triggerSaveNotification();
                    }
                  }
                }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: '700' }}>Type</label>
              <select className="form-control" value={newMachineType} onChange={e => setNewMachineType(e.target.value)}>
                <optgroup label="Printing">
                  <option value="Rotogravure">Rotogravure Press</option>
                  <option value="Flexographic">Flexographic Press</option>
                  <option value="Digital">Digital Printing</option>
                </optgroup>
                <optgroup label="Post-Press">
                  <option value="Laminator">Laminator</option>
                  <option value="Slitter">Slitter / Rewinder</option>
                  <option value="Pouching">Pouching Machine</option>
                  <option value="Rewinder">Doctoring Rewinder</option>
                  <option value="Coating">UV / Coating Machine</option>
                </optgroup>
                <optgroup label="Support">
                  <option value="Workshop">Workshop / Maintenance</option>
                  <option value="Store">Factory / Store Area</option>
                  <option value="Lab">QC / Inspection Lab</option>
                </optgroup>
              </select>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
              onClick={() => {
                if (!newMachineName.trim()) return;
                onSaveMachine({ name: newMachineName.trim(), type: newMachineType, colors: 0, maxSpeedMpm: 0, maxWidthMm: 0, status: 'Active', operator: '', location: '' });
                setNewMachineName('');
                triggerSaveNotification();
              }}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={14} /> Connect Supabase to manage machines. For now, manage from <strong>Printing Machine Scheduler → Machine Settings</strong>.
          </div>
        )}

        {/* Machine List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto' }}>
          {machines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Cpu size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
              No machines found. Add one above or go to Printing Machine Scheduler.
            </div>
          ) : (
            machines.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: '700', background: 'var(--primary-brand)', color: '#fff', padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>{m.type}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '600' }}>{m.name}</span>
                  {m.location && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>· {m.location}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', fontWeight: '600', background: m.status === 'Active' ? '#ecfdf5' : '#fef3c7', color: m.status === 'Active' ? '#065f46' : '#92400e' }}>{m.status}</span>
                  {onDeleteMachine && (
                    <button
                      type="button"
                      title="Remove machine"
                      onClick={() => {
                        if (window.confirm(`Remove "${m.name}" from the plant directory?`)) {
                          onDeleteMachine(m.id);
                          triggerSaveNotification();
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
