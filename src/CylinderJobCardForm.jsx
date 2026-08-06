import React, { useRef, useState, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Save, Printer, UploadCloud, ArrowLeft, CheckCircle2, RefreshCw, Trash2, Check, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { uploadArtworkFile, openArtworkViewer } from './services/supabaseStorageService';
import { safeLocalStorageSet } from './utils/safeStorage';
import ArtworkModal from './components/ArtworkModal';

const PrintableJobCard = React.forwardRef(({ data, imagePreview }, ref) => {
  return (
    <div ref={ref} className="printable-landscape-card" style={{ background: '#ffffff', color: '#000000', fontFamily: 'Inter, Arial, sans-serif', padding: '16px 20px', boxSizing: 'border-box', width: '100%' }}>
      <style>{`
        @media print {
          @page {
            size: A4 landscape !important;
            margin: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-landscape-card,
          .printable-landscape-card * {
            visibility: visible !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, button {
            display: none !important;
          }
          .printable-landscape-card {
            position: relative !important;
            display: block !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 297mm !important;
            padding: 6mm 10mm !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
        }

        .jobcard-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-bottom: 8px;
        }

        .jobcard-table th, .jobcard-table td {
          border: 1px solid #1e293b;
          padding: 5px 8px;
          vertical-align: middle;
        }

        .jobcard-table th {
          background-color: #f1f5f9;
          color: #0f172a;
          font-weight: 700;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .jobcard-table .label-cell {
          background-color: #f8fafc;
          font-weight: 600;
          color: #334155;
          width: 20%;
        }

        .jobcard-table .value-cell {
          font-weight: 600;
          color: #0f172a;
          width: 30%;
        }
      `}</style>

      {/* Header Bar with explicit top spacing */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '8px', paddingTop: '6px', marginTop: '4px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <img src="/samyak-logo.png" alt="Samyak Logo" style={{ maxHeight: '42px', objectFit: 'contain', marginTop: '2px' }} />
            <span style={{ fontSize: '8px', fontWeight: '800', color: '#374151', marginTop: '2px' }}>
              BSE: SAMYAKINT • CIN: L67120MH1994PLC225907
            </span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              SAMYAK INTERNATIONAL LTD
            </h1>
            <p style={{ margin: '1px 0 0 0', fontSize: '10px', color: '#475569', fontWeight: '600' }}>
              FLEXIBLE PACKAGING DIVISION | ROTOGRAVURE CYLINDER SPECIFICATION SHEET
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'right', borderLeft: '1px solid #cbd5e1', paddingLeft: '16px' }}>
          <div style={{ background: '#0f172a', color: '#ffffff', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '800', letterSpacing: '0.5px' }}>
            CYLINDER JOB CARD
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', fontWeight: '600' }}>
            Job Master ID: <strong>{data.jobMasterId || data.id || 'JM-2026-089'}</strong> | Date: <strong>{data.creationDate || new Date().toLocaleDateString('en-GB')}</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Side Tables (65%), Right Side Artwork KLD (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '12px' }}>
        
        {/* Left Column: Data Tables */}
        <div>
          {/* Table Section 1: Job & Client Information */}
          <table className="jobcard-table">
            <thead>
              <tr>
                <th colSpan="4">1. Job & Client Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label-cell">Job Master ID</td>
                <td className="value-cell" style={{ fontSize: '12px', color: '#0f172a', fontWeight: '800' }}>{data.jobMasterId || data.id || 'JM-2026-089'}</td>
                <td className="label-cell">SKU Code</td>
                <td className="value-cell">{data.skuCode || data.sku || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Job Name</td>
                <td className="value-cell" style={{ fontSize: '11px', color: '#0f172a', fontWeight: '700' }}>{data.jobName || '—'}</td>
                <td className="label-cell">Party / Client</td>
                <td className="value-cell">{data.partyName || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">SKU Code</td>
                <td className="value-cell">{data.skuCode || '—'}</td>
                <td className="label-cell">Invoice To</td>
                <td className="value-cell">{data.invoiceTo || 'Samyak International Ltd'}</td>
              </tr>
              <tr>
                <td className="label-cell">Variant / Flavor</td>
                <td className="value-cell">{data.variant || 'Standard'}</td>
                <td className="label-cell">Job Structure</td>
                <td className="value-cell">{data.jobStructure || '—'}</td>
              </tr>
            </tbody>
          </table>

          {/* Table Section 2: Technical Specifications & Dimensions */}
          <table className="jobcard-table">
            <thead>
              <tr>
                <th colSpan="4">2. Printing & Cylinder Technical Parameters</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label-cell">Printing Type</td>
                <td className="value-cell">{data.printing || 'Reverse'}</td>
                <td className="label-cell">No. of Cylinders</td>
                <td className="value-cell" style={{ fontWeight: '800' }}>{data.numberOfCylinders || '—'} Colors</td>
              </tr>
              <tr>
                <td className="label-cell">Indiv. Pouch Size</td>
                <td className="value-cell">
                  {data.pouchOpenWidth ? `${data.pouchOpenWidth}` : ''} 
                  {data.pouchOpenWidth && data.pouchHeight ? ' x ' : ''}
                  {data.pouchHeight ? `${data.pouchHeight}` : ''}
                  {!data.pouchOpenWidth && !data.pouchHeight ? '—' : ''}
                </td>
                <td className="label-cell">Shell Size</td>
                <td className="value-cell">{data.shellSize || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Total Width (Face)</td>
                <td className="value-cell">{data.totalWidth || '—'}</td>
                <td className="label-cell">Total Repeat (Circum.)</td>
                <td className="value-cell">{data.totalHeight || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">PET Substrate Size</td>
                <td className="value-cell">{data.petSize || '—'}</td>
                <td className="label-cell">Engraver Name</td>
                <td className="value-cell">{data.engravure || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Cost Borne By</td>
                <td className="value-cell">{data.costBorneBy || '—'}</td>
                <td className="label-cell">Utilisation Limit</td>
                <td className="value-cell">{data.utilisationLimit ? `${Number(data.utilisationLimit).toLocaleString()} Kg` : '10,000 Kg'}</td>
              </tr>
            </tbody>
          </table>

          {/* Table Section 3: Press Marks & Quality Guidelines */}
          <table className="jobcard-table">
            <thead>
              <tr>
                <th colSpan="4">3. Press Marks & Quality Guidelines</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label-cell">SIL Logo / Press Line</td>
                <td className="value-cell">{data.silLogo || 'Yes'}</td>
                <td className="label-cell">ARC Mark</td>
                <td className="value-cell">{data.arcMark || 'Yes'}</td>
              </tr>
              <tr>
                <td className="label-cell">Slitting Mark</td>
                <td className="value-cell">{data.slittingMark || 'Yes'}</td>
                <td className="label-cell">Tracker Line</td>
                <td className="value-cell">{data.trackerLine || 'Yes'}</td>
              </tr>
              {data.specialInstructions && (
                <tr>
                  <td className="label-cell">Special Notes</td>
                  <td colSpan="3" className="value-cell" style={{ color: '#b91c1c' }}>{data.specialInstructions}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right Column: Approved Artwork / KLD Container */}
        <div style={{ border: '1px solid #1e293b', borderRadius: '4px', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
          <div style={{ background: '#f1f5f9', padding: '6px 10px', fontSize: '11px', fontWeight: '700', borderBottom: '1px solid #1e293b', color: '#0f172a', textAlign: 'center', textTransform: 'uppercase' }}>
            FINAL APPROVED KLD / ARTWORK PROOF
          </div>

          <div style={{ flex: 1, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', minHeight: '180px' }}>
            {imagePreview ? (
              <img src={imagePreview} alt="Final Approved KLD" style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>📐</div>
                <div style={{ fontWeight: '700', fontSize: '12px', color: '#475569' }}>KLD PROOF ATTACHED</div>
                <div style={{ fontSize: '9px', marginTop: '4px' }}>(Verify Keyline layout & Color Sequence)</div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', padding: '6px 8px', fontSize: '9px', color: '#64748b', background: '#ffffff' }}>
            <strong>Checklist:</strong>
            <ul style={{ margin: '2px 0 0 14px', padding: 0 }}>
              <li>Eye-mark positioning verified</li>
              <li>Bar-code & FSSAI license checked</li>
              <li>Reverse / Surface orientation confirmed</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer Signature Block */}
      <div style={{ marginTop: '8px' }}>
        <table className="jobcard-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '25%', textAlign: 'center' }}>Prepared By (Pre-Press)</th>
              <th style={{ width: '25%', textAlign: 'center' }}>Checked By (QC Manager)</th>
              <th style={{ width: '25%', textAlign: 'center' }}>Production Head</th>
              <th style={{ width: '25%', textAlign: 'center' }}>Approved By (Client Rep)</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: '38px' }}>
              <td style={{ textAlign: 'center', verticalAlign: 'bottom', fontSize: '9px', color: '#64748b' }}>
                Sign & Date
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'bottom', fontSize: '9px', color: '#64748b' }}>
                Sign & Date
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'bottom', fontSize: '9px', color: '#64748b' }}>
                Sign & Date
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'bottom', fontSize: '10px', fontWeight: '700', color: '#0f172a' }}>
                {data.approvedBy ? data.approvedBy : 'Authorized Signatory'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default function CylinderJobCardForm({ onSave, initialData, onClose }) {
  const componentRef = useRef();

  const [formData, setFormData] = useState({
    skuCode: '',
    jobName: '',
    creationDate: new Date().toLocaleDateString('en-GB'),
    partyName: '',
    invoiceTo: 'Samyak International Ltd',
    variant: '',
    printing: 'Reverse',
    pouchOpenWidth: '',
    pouchHeight: '',
    numberOfCylinders: '6',
    jobStructure: '—',
    totalWidth: '',
    totalHeight: '',
    shellSize: '',
    petSize: '',
    silLogo: "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
    arcMark: 'Yes',
    slittingMark: 'Yes',
    trackerLine: 'Yes',
    specialInstructions: '',
    approvedBy: '',
    engravure: 'Acme Rotogravure Engravers',
    cylinderCost: '₹35,000',
    utilisationLimit: '10000',
    costBorneBy: 'Client (100%)',
    costBorneType: 'client'
  });

  useEffect(() => {
    if (initialData) {
      const derivedStruct = (initialData.layers && initialData.layers.length > 0)
        ? initialData.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (initialData.structure || initialData.film_structure || initialData.jobStructure || '—');

      setFormData({
        skuCode: initialData.sku || initialData.skuCode || '',
        jobName: initialData.jobName || '',
        creationDate: initialData.creationDate || new Date().toLocaleDateString('en-GB'),
        partyName: initialData.clientGroup || initialData.partyName || initialData.clientName || '',
        invoiceTo: initialData.invoiceTo || 'Samyak International Ltd',
        variant: initialData.variant || '',
        printing: initialData.printing || 'Reverse',
        pouchOpenWidth: initialData.pouchOpenWidth || '',
        pouchHeight: initialData.pouchHeight || '',
        numberOfCylinders: `${initialData.colorsCount || initialData.numberOfCylinders || 6}`,
        jobStructure: derivedStruct,
        totalWidth: initialData.faceLengthMm ? `${initialData.faceLengthMm} mm` : (initialData.totalWidth || ''),
        totalHeight: initialData.circumferenceMm ? `${initialData.circumferenceMm} mm` : (initialData.totalHeight || ''),
        shellSize: initialData.shellSize || (initialData.faceLengthMm ? `${initialData.faceLengthMm} mm` : ''),
        petSize: initialData.petSize || (initialData.faceLengthMm ? `${initialData.faceLengthMm + 10} mm` : ''),
        silLogo: initialData.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
        arcMark: initialData.arcMark || 'Yes',
        slittingMark: initialData.slittingMark || 'Yes',
        trackerLine: initialData.trackerLine || 'Yes',
        specialInstructions: initialData.specialInstructions || '',
        approvedBy: initialData.approvedBy || '',
        engravure: initialData.engravuresName || initialData.engravure || 'Acme Rotogravure Engravers',
        cylinderCost: initialData.cylinderCost || '₹35,000',
        costPerCylinder: initialData.costPerCylinder || '',
        ratePerSqInch: initialData.ratePerSqInch || 1.60,
        utilisationLimit: `${initialData.utilisationLimit || 10000}`,
        costBorneBy: initialData.costBorneBy || 'Client (100%)',
        costBorneType: initialData.costBorneType || 'client',
        artworkUrl: initialData.artworkUrl || initialData.imageUrl || initialData.artworkImage || ''
      });

      if (initialData.artworkUrl || initialData.imageUrl || initialData.artworkImage) {
        setImagePreview(initialData.artworkUrl || initialData.imageUrl || initialData.artworkImage);
      }
    }
  }, [initialData]);

  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [saveNotification, setSaveNotification] = useState(null);
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

  // Auto-Save effect: persists formData safely automatically on any change
  useEffect(() => {
    if (!formData.jobName && !formData.skuCode) return;
    try {
      const storageKey = `samyak_erp_jobcard_settings_${formData.skuCode || formData.jobName}`;
      safeLocalStorageSet(storageKey, formData);
    } catch (e) {
      console.warn("Auto-save failed", e);
    }
  }, [formData]);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Job_Card_${formData.jobName || 'Draft'}`,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDimensionBlur = (e) => {
    const { name, value } = e.target;
    if (value && /^\d+(\.\d+)?$/.test(value.trim())) {
      setFormData(prev => ({ ...prev, [name]: `${value.trim()} mm` }));
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, formData.skuCode || formData.jobName || 'jobcard');
      if (result.publicUrl) {
        setImagePreview(result.publicUrl);
        setFormData(prev => ({ ...prev, artworkUrl: result.publicUrl }));
        
        if (onSave) {
          onSave({ ...formData, artworkUrl: result.publicUrl });
        }
        setSaveNotification('✅ Artwork Uploaded to Supabase Cloud Storage Successfully!');
        setTimeout(() => setSaveNotification(null), 4000);
      }
    } catch (err) {
      console.error("Artwork upload failed:", err);
      alert("Failed to upload artwork: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveArtwork = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, artworkUrl: '' }));
    if (onSave) {
      onSave({ ...formData, artworkUrl: '' });
    }
  };

  const handleSaveSettings = () => {
    try {
      const storageKey = `samyak_erp_jobcard_settings_${formData.skuCode || formData.jobName}`;
      safeLocalStorageSet(storageKey, formData);

      if (onSave) {
        onSave({ ...formData, artworkUrl: imagePreview || formData.artworkUrl || '' });
      }

      setSaveNotification('✅ Job Card Settings & Cloud Parameters Saved Successfully!');
      setTimeout(() => setSaveNotification(null), 4000);
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save settings: " + e.message);
    }
  };

  const submitToSystem = () => {
    if (!formData.skuCode || !formData.jobName) {
      alert("SKU Code and Job Name are required to add to the system.");
      return;
    }
    handleSaveSettings();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Save Notification Banner */}
      {saveNotification && (
        <div className="no-print" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '12px 16px', borderRadius: '8px', color: '#047857', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} /> {saveNotification}
        </div>
      )}

      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onClose && (
            <button className="btn-secondary" style={{ padding: '6px 12px' }} onClick={onClose}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>
              {initialData ? `Cylinder Job Card: ${formData.jobName}` : 'Cylinder Job Card Generator'}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>
              ⚡ Auto-Save Active (Changes saved automatically)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" style={{ background: '#059669' }} onClick={handleSaveSettings}>
            <Save size={16} /> Save Settings
          </button>
          <button className="btn-primary" onClick={handlePrint}>
            <Printer size={16} /> Print Landscape PDF
          </button>
        </div>
      </div>

      {/* Printable Landscape Preview */}
      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <PrintableJobCard ref={componentRef} data={formData} imagePreview={imagePreview} />
      </div>

      {/* Editable Form Grid (Shown below preview for customization) */}
      <div className="glass-card no-print" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: '700', fontSize: '1.05rem' }}>Edit Job Card Data Parameters & Settings</h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              All edits update the preview in real-time and auto-save.
            </p>
          </div>
          <button className="btn-primary" style={{ background: '#059669', padding: '8px 16px', fontSize: '0.85rem' }} onClick={handleSaveSettings}>
            <CheckCircle2 size={16} /> Save Job Card Parameters
          </button>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>SKU Code*</label>
            <input className="form-control" name="skuCode" value={formData.skuCode} onChange={handleChange} placeholder="e.g. SKU-XC-101" />
          </div>
          <div className="form-group">
            <label>Job Name*</label>
            <input className="form-control" name="jobName" value={formData.jobName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Party Name / Client</label>
            <input className="form-control" name="partyName" value={formData.partyName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Creation Date</label>
            <input className="form-control" name="creationDate" value={formData.creationDate} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Invoice To</label>
            <input className="form-control" name="invoiceTo" value={formData.invoiceTo} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Variant / Flavor</label>
            <input className="form-control" name="variant" value={formData.variant} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Printing (Reverse/Surface)</label>
            <input className="form-control" name="printing" value={formData.printing} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Individual Pouch Size (Width)</label>
            <input className="form-control" name="pouchOpenWidth" value={formData.pouchOpenWidth} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 120 mm" />
          </div>
          <div className="form-group">
            <label>Individual Pouch Size (Height)</label>
            <input className="form-control" name="pouchHeight" value={formData.pouchHeight} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 150 mm" />
          </div>
          <div className="form-group">
            <label>Number of Cylinders / Colors</label>
            <input className="form-control" name="numberOfCylinders" value={formData.numberOfCylinders} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Job Structure</label>
            <input className="form-control" name="jobStructure" value={formData.jobStructure} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Total Width (Face Length)</label>
            <input className="form-control" name="totalWidth" value={formData.totalWidth} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 1050 mm" />
          </div>
          <div className="form-group">
            <label>Total Height (Circumference)</label>
            <input className="form-control" name="totalHeight" value={formData.totalHeight} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 400 mm" />
          </div>
          <div className="form-group">
            <label>Shell Size</label>
            <input className="form-control" name="shellSize" value={formData.shellSize} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 1050 mm" />
          </div>
          <div className="form-group">
            <label>PET Size</label>
            <input className="form-control" name="petSize" value={formData.petSize} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 1060 mm" />
          </div>
          <div className="form-group">
            <label>Engraver Name</label>
            <input className="form-control" name="engravure" value={formData.engravure} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Cost Borne By</label>
            <input className="form-control" name="costBorneBy" value={formData.costBorneBy} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Approved By</label>
            <input className="form-control" name="approvedBy" value={formData.approvedBy} onChange={handleChange} />
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: '12px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }} className="form-group">
            <label style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UploadCloud size={18} style={{ color: 'var(--primary-brand)' }} />
              Artwork / KLD Upload (Supabase Cloud Storage)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {imagePreview ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img 
                    src={imagePreview} 
                    alt="Artwork Preview" 
                    style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }} 
                    onClick={() => setActiveArtworkModal({ isOpen: true, url: imagePreview, title: `${formData.skuCode || 'Job'} Artwork` })}
                    title="Click to view full image"
                  />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={16} /> Artwork Stored
                    </div>
                    <button 
                      type="button"
                      onClick={() => setActiveArtworkModal({ isOpen: true, url: imagePreview, title: `${formData.skuCode || 'Job'} Artwork` })}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      View Full File <ExternalLink size={12} />
                    </button>
                    <button type="button" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '4px' }} onClick={handleRemoveArtwork}>
                      <Trash2 size={12} /> Remove Artwork
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={20} /> No artwork uploaded yet.
                </div>
              )}

              <div style={{ marginLeft: 'auto' }}>
                <label className="btn-secondary" style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}>
                  <UploadCloud size={16} /> {isUploading ? 'Uploading to Supabase...' : (imagePreview ? 'Replace Artwork File' : 'Upload Artwork to Cloud')}
                  <input 
                    type="file" 
                    accept="image/*,.pdf" 
                    style={{ display: 'none' }} 
                    disabled={isUploading}
                    onChange={handleImageUpload} 
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button className="btn-primary" style={{ background: '#059669', padding: '10px 20px' }} onClick={handleSaveSettings}>
            <Save size={16} /> Save Parameters & Settings
          </button>
        </div>
      </div>

      {/* In-App Artwork Lightbox Modal */}
      <ArtworkModal
        isOpen={activeArtworkModal.isOpen}
        onClose={() => setActiveArtworkModal({ isOpen: false, url: '', title: '' })}
        artworkUrl={activeArtworkModal.url}
        title={activeArtworkModal.title}
      />
    </div>
  );
}
