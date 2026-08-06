import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Save, Printer, UploadCloud, ArrowLeft, CheckCircle2, RefreshCw, Trash2, Check, ExternalLink, Image as ImageIcon, CheckSquare, ShieldCheck, FileCode, Layers, Plus } from 'lucide-react';
import { uploadArtworkFile, openArtworkViewer } from './services/supabaseStorageService';
import { getAuthorisedSignature, getCompanyLogo } from './services/settingsService';
import { safeLocalStorageSet } from './utils/safeStorage';
import { COMPANY_DETAILS, FILM_DENSITIES } from './factoryStore';
import { saveJobMasterToSupabase } from './services/supabaseDataService';
import ArtworkModal from './components/ArtworkModal';

function parseStructureToLayers(structStr) {
  if (!structStr || structStr === '—') return [];
  const parts = structStr.split('/');
  return parts.map((part, idx) => {
    const trimmed = part.trim();
    const micronMatch = trimmed.match(/(\d+)\s*µ?/);
    const micron = micronMatch ? parseInt(micronMatch[1], 10) : 12;
    const filmType = trimmed.replace(/\d+\s*µ?/, '').trim() || 'PET';
    return { id: idx + 1, filmType, micron };
  });
}

const PrintableJobCard = React.forwardRef(({ data, imagePreview }, ref) => {
  const managementSignature = getAuthorisedSignature();
  const companyLogo = getCompanyLogo() || COMPANY_DETAILS.logoUrl || '/samyak-logo.png';

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
          margin-bottom: 8px;
          font-size: 11px;
        }
        .jobcard-table th {
          background: #0f172a;
          color: #ffffff;
          padding: 5px 8px;
          text-align: left;
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border: 1px solid #0f172a;
        }
        .jobcard-table td {
          border: 1px solid #cbd5e1;
          padding: 5px 8px;
          vertical-align: middle;
        }
        .jobcard-table td.label-cell {
          background: #f1f5f9;
          font-weight: 700;
          color: #334155;
          width: 20%;
          font-size: 10.5px;
        }
        .jobcard-table td.value-cell {
          background: #ffffff;
          font-weight: 600;
          color: #0f172a;
          width: 30%;
        }
      `}</style>

      {/* Header Banner: Company Logo, Address, GSTIN, CIN */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2.5px solid #0f172a', paddingBottom: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={companyLogo} alt="Company Logo" style={{ maxHeight: '46px', objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '9.5px', color: '#1e293b', fontWeight: '700', lineHeight: '1.3', maxWidth: '580px' }}>
              {COMPANY_DETAILS.address}
            </div>
            <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px', fontWeight: '800' }}>
              GSTIN: {COMPANY_DETAILS.gstin} • CIN: L67120MH1994PLC225907
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ background: '#0f172a', color: '#ffffff', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '800', letterSpacing: '0.5px' }}>
            CYLINDER JOB CARD
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', fontWeight: '600' }}>
            Job Master ID: <strong>{data.jobMasterId || data.id || 'JM-2026-089'}</strong> | Date: <strong>{data.creationDate || new Date().toLocaleDateString('en-GB')}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '12px' }}>
        {/* Left Column: Technical Tables */}
        <div>
          <table className="jobcard-table">
            <thead><tr><th colSpan="4">1. Job & Client Details</th></tr></thead>
            <tbody>
              <tr>
                <td className="label-cell">Job Master ID</td><td className="value-cell" style={{ fontWeight: '800', color: '#0f172a' }}>{data.jobMasterId || data.id || '—'}</td>
                <td className="label-cell">SKU Code</td><td className="value-cell">{data.skuCode || data.sku || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Job Name</td><td className="value-cell" style={{ fontWeight: '700' }}>{data.jobName || '—'}</td>
                <td className="label-cell">Party / Client</td><td className="value-cell">{data.partyName || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Variant / Flavor</td><td className="value-cell">{data.variant || 'Standard'}</td>
                <td className="label-cell">Job Structure</td><td className="value-cell" style={{ fontWeight: '700', color: '#047857' }}>{data.jobStructure || '—'}</td>
              </tr>
            </tbody>
          </table>

          <table className="jobcard-table">
            <thead><tr><th colSpan="4">2. Printing & Cylinder Technical Parameters</th></tr></thead>
            <tbody>
              <tr>
                <td className="label-cell">Printing Type</td><td className="value-cell">{data.printing || 'Reverse'}</td>
                <td className="label-cell">No. of Cylinders</td><td className="value-cell" style={{ fontWeight: '800' }}>{data.numberOfCylinders || '—'} Colors</td>
              </tr>
              <tr>
                <td className="label-cell">Indiv. Pouch Size</td><td className="value-cell">
                  {data.pouchOpenWidth ? `${data.pouchOpenWidth}` : ''}
                  {data.pouchOpenWidth && data.pouchHeight ? ' x ' : ''}
                  {data.pouchHeight ? `${data.pouchHeight}` : ''}
                  {!data.pouchOpenWidth && !data.pouchHeight ? '—' : ''}
                </td>
                <td className="label-cell">PET Substrate Size</td><td className="value-cell">{data.petSize || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Total Width (Face)</td><td className="value-cell">{data.totalWidth || '—'}</td>
                <td className="label-cell">Total Repeat (Circum.)</td><td className="value-cell">{data.totalHeight || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Shell Size</td><td className="value-cell">{data.shellSize || '—'}</td>
                <td className="label-cell">Engraver Name</td><td className="value-cell" style={{ fontWeight: '700', color: '#1e293b' }}>{data.engravure || data.engravuresName || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Cost Borne By</td><td className="value-cell">{data.costBorneBy || '—'}</td>
                <td className="label-cell">Utilisation Limit</td><td className="value-cell">{data.utilisationLimit ? `${Number(data.utilisationLimit).toLocaleString()} Kg` : '10,000 Kg'}</td>
              </tr>
            </tbody>
          </table>

          <table className="jobcard-table">
            <thead><tr><th colSpan="4">3. Press Marks & Quality Guidelines</th></tr></thead>
            <tbody>
              <tr>
                <td className="label-cell">SIL Logo / Press Line</td><td className="value-cell">{data.silLogo || 'Yes'}</td>
                <td className="label-cell">ARC Mark</td><td className="value-cell">{data.arcMark || 'Yes'}</td>
              </tr>
              <tr>
                <td className="label-cell">Slitting Mark</td><td className="value-cell">{data.slittingMark || 'Yes'}</td>
                <td className="label-cell">Tracker Line</td><td className="value-cell">{data.trackerLine || 'Yes'}</td>
              </tr>
              {data.specialInstructions && (
                <tr>
                  <td className="label-cell">Special Instructions</td>
                  <td colSpan="3" className="value-cell" style={{ color: '#b91c1c', fontWeight: '700' }}>{data.specialInstructions}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right Column: Approved Artwork / KLD */}
        <div style={{ border: '1px solid #1e293b', borderRadius: '4px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ background: '#f1f5f9', padding: '6px 10px', fontSize: '11px', fontWeight: '700', borderBottom: '1px solid #1e293b', textAlign: 'center', textTransform: 'uppercase' }}>
            FINAL APPROVED KLD / ARTWORK PROOF
          </div>
          <div style={{ flex: 1, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
            {imagePreview ? (
              <img src={imagePreview} alt="Artwork" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>No Artwork Preview</div>
            )}
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', padding: '6px 8px', fontSize: '9px', color: '#64748b', background: '#ffffff' }}>
            <strong>Verified Pre-Press Checklist:</strong>
            <ul style={{ margin: '2px 0 0 14px', padding: 0, listStyleType: 'none' }}>
              {data.chkEyemark && <li style={{ color: '#047857', fontWeight: '700' }}>✓ Eye-mark positioning verified</li>}
              {data.chkBarcode && <li style={{ color: '#047857', fontWeight: '700' }}>✓ Bar-code & FSSAI license checked</li>}
              {data.chkOrientation && <li style={{ color: '#047857', fontWeight: '700' }}>✓ Reverse / Surface orientation confirmed</li>}
              {data.chkClientApproval && <li style={{ color: '#047857', fontWeight: '700' }}>✓ Client Approval Received</li>}
              {(!data.chkEyemark && !data.chkBarcode && !data.chkOrientation && !data.chkClientApproval) && (
                <li style={{ color: '#dc2626', fontStyle: 'italic' }}>⚠️ Checklist pending verification in settings</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '10px' }}>
        <table className="jobcard-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '50%', textAlign: 'center' }}>Prepared By (Management)</th>
              <th style={{ width: '50%', textAlign: 'center' }}>Checked By (Production Head)</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: '54px' }}>
              <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '10px' }}>
                {managementSignature ? (
                  <img src={managementSignature} alt="Management Signature" style={{ height: '36px', maxHeight: '36px', objectFit: 'contain', display: 'block', margin: '0 auto 2px auto' }} />
                ) : (
                  <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '2px' }}>Samyak International Ltd</div>
                )}
                <div style={{ fontSize: '9px', color: '#475569', fontWeight: '700' }}>Authorized Management Signatory</div>
              </td>

              <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '10px' }}>
                {data.approvedByHead || data.productionApproved ? (
                  <div style={{ color: '#047857', fontWeight: '800' }}>
                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      ✓ Verified & Approved
                    </div>
                    <div style={{ fontSize: '9px', color: '#334155', fontWeight: '700', marginTop: '2px' }}>
                      {data.approvedHeadName || 'Production Head'} • {data.approvedHeadDate || data.creationDate}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '10px', color: '#d97706', fontWeight: '800', marginBottom: '2px' }}>
                      ⏳ Pending Production Head Sign-Off
                    </div>
                    <div style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic' }}>
                      (Awaiting Review on Production Dashboard)
                    </div>
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default function CylinderJobCardForm({ onSave, initialData, onClose, currentUser, jobMasters = [] }) {
  const componentRef = useRef();

  const [selectedJobMasterId, setSelectedJobMasterId] = useState(initialData?.jobMasterId || initialData?.id || '');
  const [layers, setLayers] = useState(() => {
    if (initialData?.layers && initialData.layers.length > 0) return initialData.layers;
    if (initialData?.structure) return parseStructureToLayers(initialData.structure);
    return [
      { id: 1, filmType: 'PET', micron: 12 },
      { id: 2, filmType: 'METPET', micron: 12 },
      { id: 3, filmType: 'Natural GP LD', micron: 35 }
    ];
  });

  const availableFilmTypes = useMemo(() => Object.keys(FILM_DENSITIES), []);

  const [formData, setFormData] = useState({
    jobMasterId: initialData?.jobMasterId || initialData?.id || '',
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
    costBorneType: 'client',
    chkEyemark: false,
    chkBarcode: false,
    chkOrientation: false,
    chkClientApproval: false,
    approvedByHead: false,
    approvedHeadName: '',
    approvedHeadDate: ''
  });

  useEffect(() => {
    if (initialData) {
      let initLayers = initialData.layers || [];
      if (initLayers.length === 0 && (initialData.structure || initialData.film_structure)) {
        initLayers = parseStructureToLayers(initialData.structure || initialData.film_structure);
      }
      if (initLayers.length > 0) setLayers(initLayers);

      const derivedStruct = (initLayers.length > 0)
        ? initLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (initialData.structure || initialData.film_structure || initialData.jobStructure || '—');

      setFormData({
        jobMasterId: initialData.jobMasterId || initialData.id || '',
        skuCode: initialData.sku || initialData.skuCode || '',
        jobName: initialData.jobName || '',
        creationDate: initialData.creationDate || new Date().toLocaleDateString('en-GB'),
        partyName: initialData.clientGroup || initialData.partyName || initialData.clientName || '',
        invoiceTo: initialData.invoiceTo || 'Samyak International Ltd',
        variant: initialData.variant || '',
        printing: initialData.printing || 'Reverse',
        pouchOpenWidth: initialData.pouchOpenWidth ? (String(initialData.pouchOpenWidth).includes('mm') ? initialData.pouchOpenWidth : `${initialData.pouchOpenWidth} mm`) : '',
        pouchHeight: initialData.pouchHeight ? (String(initialData.pouchHeight).includes('mm') ? initialData.pouchHeight : `${initialData.pouchHeight} mm`) : '',
        numberOfCylinders: `${initialData.colorsCount || initialData.numberOfCylinders || 6}`,
        jobStructure: derivedStruct,
        totalWidth: initialData.faceLengthMm ? `${initialData.faceLengthMm} mm` : (initialData.totalWidth || (initialData.printWidthMm ? `${initialData.printWidthMm} mm` : '')),
        totalHeight: initialData.circumferenceMm ? `${initialData.circumferenceMm} mm` : (initialData.totalHeight || (initialData.repeatLengthMm ? `${initialData.repeatLengthMm} mm` : '')),
        shellSize: initialData.shellSize || (initialData.faceLengthMm ? `${initialData.faceLengthMm} mm` : (initialData.printWidthMm ? `${initialData.printWidthMm} mm` : '')),
        petSize: initialData.petSize || (initialData.faceLengthMm ? `${initialData.faceLengthMm + 10} mm` : (initialData.printWidthMm ? `${initialData.printWidthMm + 10} mm` : '')),
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
        artworkUrl: initialData.artworkUrl || initialData.jobCardFileUrl || initialData.imageUrl || initialData.artworkImage || '',
        chkEyemark: initialData.chkEyemark ?? false,
        chkBarcode: initialData.chkBarcode ?? false,
        chkOrientation: initialData.chkOrientation ?? false,
        chkClientApproval: initialData.chkClientApproval ?? false,
        approvedByHead: initialData.approvedByHead ?? initialData.productionApproved ?? false,
        approvedHeadName: initialData.approvedHeadName || '',
        approvedHeadDate: initialData.approvedHeadDate || ''
      });

      const initialArtworkUrl = initialData.artworkUrl || initialData.jobCardFileUrl || initialData.imageUrl || initialData.artworkImage || '';
      if (initialArtworkUrl) {
        setImagePreview(initialArtworkUrl);
      }
    }
  }, [initialData]);

  // Keep derived structure in sync with layers changes
  useEffect(() => {
    if (layers && layers.length > 0) {
      const structStr = layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
      setFormData(prev => ({ ...prev, jobStructure: structStr }));
    }
  }, [layers]);

  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [saveNotification, setSaveNotification] = useState(null);
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

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

  // Job Master selector handler to auto-fill all parameters
  const handleJobMasterSelect = (e) => {
    const selectedId = e.target.value;
    setSelectedJobMasterId(selectedId);
    if (!selectedId) return;

    const jm = (jobMasters || []).find(j => j.id === selectedId);
    if (jm) {
      let jmLayers = jm.layers || [];
      if (jmLayers.length === 0 && jm.structure) {
        jmLayers = parseStructureToLayers(jm.structure);
      }
      if (jmLayers.length > 0) {
        setLayers(jmLayers);
      }

      const derived = (jmLayers.length > 0)
        ? jmLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (jm.structure || '—');

      setFormData(prev => ({
        ...prev,
        jobMasterId: jm.id,
        skuCode: jm.skuCode || jm.sku || prev.skuCode,
        jobName: jm.jobName || prev.jobName,
        partyName: jm.clientName || prev.partyName,
        pouchOpenWidth: jm.pouchOpenWidth ? `${jm.pouchOpenWidth} mm` : (jm.printWidthMm ? `${jm.printWidthMm} mm` : prev.pouchOpenWidth),
        pouchHeight: jm.pouchHeight ? `${jm.pouchHeight} mm` : prev.pouchHeight,
        numberOfCylinders: `${jm.colorsCount || prev.numberOfCylinders || 6}`,
        jobStructure: derived,
        totalWidth: jm.printWidthMm ? `${jm.printWidthMm} mm` : prev.totalWidth,
        totalHeight: jm.repeatLengthMm ? `${jm.repeatLengthMm} mm` : prev.totalHeight,
        shellSize: jm.printWidthMm ? `${jm.printWidthMm} mm` : prev.shellSize,
        petSize: jm.printWidthMm ? `${jm.printWidthMm + 10} mm` : prev.petSize,
        engravure: jm.engravuresName || prev.engravure,
        costBorneBy: jm.costBorneBy || prev.costBorneBy,
        artworkUrl: jm.jobCardFileUrl || jm.artworkUrl || prev.artworkUrl
      }));

      if (jm.jobCardFileUrl || jm.artworkUrl) {
        setImagePreview(jm.jobCardFileUrl || jm.artworkUrl);
      }
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
    if (!formData.chkEyemark || !formData.chkBarcode || !formData.chkOrientation || !formData.chkClientApproval) {
      alert("⚠️ MANDATORY CHECKLIST UNVERIFIED:\n\nYou must verify and check all 4 Pre-Press & Quality Checklist items (Eye-mark, Barcode/FSSAI, Orientation, Client Approval) mandatorily before saving Job Card parameters!");
      return;
    }

    try {
      const derivedStruct = (layers && layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (formData.jobStructure || '—');

      const fileUrl = imagePreview || formData.artworkUrl || '';

      // 1. Check if Job Master already exists
      const existingJM = (jobMasters || []).find(j => 
        (j.id && j.id === formData.jobMasterId) ||
        (j.skuCode && j.skuCode.toLowerCase() === (formData.skuCode || '').toLowerCase().trim()) ||
        (j.jobName && j.jobName.toLowerCase() === (formData.jobName || '').toLowerCase().trim())
      );

      let targetJobMaster;
      if (existingJM) {
        // Update existing Job Master
        targetJobMaster = {
          ...existingJM,
          skuCode: formData.skuCode || existingJM.skuCode,
          jobName: formData.jobName || existingJM.jobName,
          clientName: formData.partyName || existingJM.clientName,
          structure: derivedStruct,
          layers: layers,
          printWidthMm: Number(String(formData.totalWidth).replace(/\D/g, '')) || Number(String(formData.pouchOpenWidth).replace(/\D/g, '')) || existingJM.printWidthMm || 1000,
          repeatLengthMm: Number(String(formData.totalHeight).replace(/\D/g, '')) || Number(String(formData.pouchHeight).replace(/\D/g, '')) || existingJM.repeatLengthMm || 400,
          pouchOpenWidth: Number(String(formData.pouchOpenWidth).replace(/\D/g, '')) || existingJM.pouchOpenWidth || 0,
          pouchHeight: Number(String(formData.pouchHeight).replace(/\D/g, '')) || existingJM.pouchHeight || 0,
          colorsCount: Number(formData.numberOfCylinders) || existingJM.colorsCount || 6,
          engravuresName: formData.engravure || existingJM.engravuresName,
          costBorneBy: formData.costBorneBy || existingJM.costBorneBy,
          jobCardFileUrl: fileUrl,
          artworkUrl: fileUrl,
          chkEyemark: formData.chkEyemark,
          chkBarcode: formData.chkBarcode,
          chkOrientation: formData.chkOrientation,
          chkClientApproval: formData.chkClientApproval,
          approvedByHead: formData.approvedByHead,
          approvedHeadName: formData.approvedHeadName,
          approvedHeadDate: formData.approvedHeadDate
        };
      } else {
        // Create NEW Job Master automatically
        targetJobMaster = {
          id: `JM-2026-${Math.floor(100 + Math.random() * 900)}`,
          skuCode: formData.skuCode || `SKU-2026-${Math.floor(100 + Math.random() * 900)}`,
          jobName: formData.jobName || 'New Job',
          clientName: formData.partyName || 'General Client',
          structure: derivedStruct,
          layers: layers,
          printWidthMm: Number(String(formData.totalWidth).replace(/\D/g, '')) || Number(String(formData.pouchOpenWidth).replace(/\D/g, '')) || 1000,
          repeatLengthMm: Number(String(formData.totalHeight).replace(/\D/g, '')) || Number(String(formData.pouchHeight).replace(/\D/g, '')) || 400,
          pouchOpenWidth: Number(String(formData.pouchOpenWidth).replace(/\D/g, '')) || 0,
          pouchHeight: Number(String(formData.pouchHeight).replace(/\D/g, '')) || 0,
          colorsCount: Number(formData.numberOfCylinders) || 6,
          engravuresName: formData.engravure || 'Acme Rotogravure Engravers',
          costBorneBy: formData.costBorneBy || 'Client (100%)',
          cylinderCost: formData.cylinderCost || '₹35,000',
          utilisationLimit: Number(formData.utilisationLimit) || 10000,
          jobCardFileUrl: fileUrl,
          artworkUrl: fileUrl,
          chkEyemark: formData.chkEyemark,
          chkBarcode: formData.chkBarcode,
          chkOrientation: formData.chkOrientation,
          chkClientApproval: formData.chkClientApproval,
          approvedByHead: formData.approvedByHead,
          approvedHeadName: formData.approvedHeadName,
          approvedHeadDate: formData.approvedHeadDate,
          creationDate: formData.creationDate || new Date().toLocaleDateString('en-GB')
        };
      }

      // Sync & Persist Job Master to Supabase & localStorage
      saveJobMasterToSupabase(targetJobMaster);

      const storageKey = `samyak_erp_jobcard_settings_${formData.skuCode || formData.jobName}`;
      safeLocalStorageSet(storageKey, { ...formData, jobStructure: derivedStruct, layers });

      if (onSave) {
        onSave({ ...formData, jobStructure: derivedStruct, layers, artworkUrl: fileUrl }, targetJobMaster);
      }

      setSaveNotification(existingJM ? '✅ Job Master & Job Card Specs Synced Successfully!' : '✅ New Job Master Created & Job Card Specs Saved!');
      setTimeout(() => setSaveNotification(null), 4000);
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save settings: " + e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
      
      {saveNotification && (
        <div style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '12px 20px', borderRadius: '8px', fontWeight: '700', fontSize: '0.9rem', width: '100%', maxWidth: '1000px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle2 size={20} />
          {saveNotification}
        </div>
      )}

      {/* Top Action Toolbar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '1000px', background: '#f8fafc', padding: '12px 20px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {onClose && (
            <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }} onClick={onClose}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.95rem' }}>
            Job Card Specification & Artwork Controls
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" style={{ background: '#1e293b', borderColor: '#1e293b' }} onClick={handlePrint}>
            <Printer size={16} /> Print / Export Job Card PDF
          </button>
        </div>
      </div>

      {/* A4 Landscape Job Card Component Wrapper */}
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

        {/* Mandatory Checkbox-based Pre-Press & Quality Checklist */}
        <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
          <label style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '8px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckSquare size={18} style={{ color: 'var(--primary-brand)' }} />
            Pre-Press & Quality Verification Checklist <span style={{ color: '#dc2626', fontWeight: '900' }}>* (Mandatory All 4 Items)</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: formData.chkEyemark ? '#ecfdf5' : '#fff', padding: '8px 12px', borderRadius: '6px', border: formData.chkEyemark ? '1px solid #6ee7b7' : '1px solid #cbd5e1' }}>
              <input 
                type="checkbox" 
                name="chkEyemark" 
                checked={formData.chkEyemark} 
                onChange={e => setFormData(prev => ({ ...prev, chkEyemark: e.target.checked }))} 
              />
              Eye-mark positioning verified
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: formData.chkBarcode ? '#ecfdf5' : '#fff', padding: '8px 12px', borderRadius: '6px', border: formData.chkBarcode ? '1px solid #6ee7b7' : '1px solid #cbd5e1' }}>
              <input 
                type="checkbox" 
                name="chkBarcode" 
                checked={formData.chkBarcode} 
                onChange={e => setFormData(prev => ({ ...prev, chkBarcode: e.target.checked }))} 
              />
              Bar-code & FSSAI license checked
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: formData.chkOrientation ? '#ecfdf5' : '#fff', padding: '8px 12px', borderRadius: '6px', border: formData.chkOrientation ? '1px solid #6ee7b7' : '1px solid #cbd5e1' }}>
              <input 
                type="checkbox" 
                name="chkOrientation" 
                checked={formData.chkOrientation} 
                onChange={e => setFormData(prev => ({ ...prev, chkOrientation: e.target.checked }))} 
              />
              Reverse / Surface orientation confirmed
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: formData.chkClientApproval ? '#ecfdf5' : '#fff', padding: '8px 12px', borderRadius: '6px', border: formData.chkClientApproval ? '1px solid #6ee7b7' : '1px solid #cbd5e1' }}>
              <input 
                type="checkbox" 
                name="chkClientApproval" 
                checked={formData.chkClientApproval} 
                onChange={e => setFormData(prev => ({ ...prev, chkClientApproval: e.target.checked }))} 
              />
              Client Approval Received
            </label>
          </div>
        </div>

        {/* Production Head Sign-Off Section */}
        <div style={{ marginBottom: '20px', background: formData.approvedByHead ? '#ecfdf5' : '#fff7ed', padding: '16px', borderRadius: '8px', border: formData.approvedByHead ? '1px solid #6ee7b7' : '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', color: formData.approvedByHead ? '#047857' : '#c2410c', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={18} />
              Checked By (Production Head Approval Status): {formData.approvedByHead ? '✓ APPROVED' : '⏳ PENDING REVIEW'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
              {formData.approvedByHead 
                ? `Approved by ${formData.approvedHeadName || 'Production Head'} on ${formData.approvedHeadDate || formData.creationDate}`
                : 'Requires Production Head or Admin sign-off to finalize Job Card specs for shop floor execution.'}
            </div>
          </div>

          {formData.approvedByHead ? (
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: '0.82rem', padding: '6px 12px' }}
              onClick={() => {
                setFormData(prev => ({ ...prev, approvedByHead: false, approvedHeadName: '', approvedHeadDate: '' }));
              }}
            >
              Revoke Sign-Off
            </button>
          ) : (
            <button 
              type="button" 
              className="btn-primary" 
              style={{ background: '#047857', borderColor: '#047857', fontWeight: '800', fontSize: '0.85rem', padding: '8px 16px' }}
              onClick={() => {
                const approverName = currentUser?.name || 'Production Head';
                const dateStr = new Date().toLocaleDateString('en-IN');
                setFormData(prev => ({
                  ...prev,
                  approvedByHead: true,
                  approvedHeadName: approverName,
                  approvedHeadDate: dateStr
                }));
                alert(`Job Card approved and signed off by ${approverName}!`);
              }}
            >
              <CheckCircle2 size={16} /> Sign-Off & Approve Job Card
            </button>
          )}
        </div>

        {/* Job Master Direct Link / Selector */}
        <div style={{ marginBottom: '20px', background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
          <label style={{ fontWeight: '800', fontSize: '0.9rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <FileCode size={18} /> Select Existing Job Master to Auto-Fill Details:
          </label>
          <select 
            className="form-control" 
            style={{ fontWeight: '700', background: '#ffffff' }}
            value={selectedJobMasterId}
            onChange={handleJobMasterSelect}
          >
            <option value="">-- Create New Job Master / Manual Specs Entry --</option>
            {(jobMasters || []).map(j => (
              <option key={j.id} value={j.id}>
                {j.jobName} ({j.skuCode || j.id}) — {j.clientName} [{j.structure || '—'}]
              </option>
            ))}
          </select>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#15803d' }}>
            Selecting an existing Job Master automatically fetches and populates SKU Code, Job Name, Client, Pouch Size, and Substrate Layers.
          </p>
        </div>

        {/* Substrate Structure Multi-Layer Builder (Synced with Job Master) */}
        <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ fontWeight: '800', fontSize: '0.9rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Layers size={18} style={{ color: 'var(--primary-brand)' }} />
              Substrate Structure Multi-Layer Breakdown (Synced with Job Master)
            </label>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                const defaultFilm = availableFilmTypes[0] || 'PET';
                setLayers(prev => [...prev, { id: Date.now(), filmType: defaultFilm, micron: 12 }]);
              }}
            >
              <Plus size={14} /> Add Layer
            </button>
          </div>

          <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#fff', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Layer Sequence</th>
                  <th style={{ padding: '8px 12px' }}>Film Substrate Type</th>
                  <th style={{ padding: '8px 12px' }}>Micron (µ)</th>
                  <th style={{ padding: '8px 12px' }}>Calculated GSM</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((layer, index) => {
                  const density = FILM_DENSITIES[layer.filmType] || 1.40;
                  const gsm = (layer.micron * density).toFixed(2);
                  const layerDesig = index === 0 ? 'Layer 1 (Outer / Print Substrate)' : (index === layers.length - 1 ? `Layer ${index + 1} (Inner Sealant Substrate)` : `Layer ${index + 1} (Middle Barrier Substrate)`);

                  return (
                    <tr key={layer.id || index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: '700', color: '#334155' }}>
                        {layerDesig}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <select 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.82rem', fontWeight: '600' }}
                          value={layer.filmType}
                          onChange={e => {
                            const val = e.target.value;
                            setLayers(prev => prev.map((l, i) => i === index ? { ...l, filmType: val } : l));
                          }}
                        >
                          {availableFilmTypes.map(ft => (
                            <option key={ft} value={ft}>{ft}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.82rem', width: '90px' }}
                          value={layer.micron}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setLayers(prev => prev.map((l, i) => i === index ? { ...l, micron: val } : l));
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: '700', color: '#047857' }}>
                        {gsm} g/m²
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {layers.length > 1 && (
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                            onClick={() => setLayers(prev => prev.filter((_, i) => i !== index))}
                            title="Remove Layer"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#1e293b', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              Derived Structure: <strong style={{ color: 'var(--primary-brand)', fontFamily: 'monospace' }}>
                {layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')}
              </strong>
            </div>
            <div>
              Total Calculated GSM: <strong>
                {layers.reduce((sum, l) => sum + (l.micron * (FILM_DENSITIES[l.filmType] || 1.40)), 0).toFixed(2)} g/m²
              </strong>
            </div>
          </div>
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
            <label>Derived Job Structure</label>
            <input className="form-control" name="jobStructure" value={formData.jobStructure} readOnly style={{ background: '#f1f5f9', fontWeight: '700' }} />
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
