import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Save, Printer, UploadCloud, ArrowLeft, CheckCircle2, RefreshCw, Trash2, Check, ExternalLink, Image as ImageIcon, CheckSquare, ShieldCheck, FileCode, Layers, Plus } from 'lucide-react';
import { uploadArtworkFile, openArtworkViewer } from './services/supabaseStorageService';
import { getAuthorisedSignature, getCompanyLogo, getNextDocRefNumber, generateDocRefNumber } from './services/settingsService';
import { safeLocalStorageSet, safeLocalStorageGet } from './utils/safeStorage';
import { COMPANY_DETAILS, FILM_DENSITIES } from './factoryStore';
import { saveJobMasterToSupabase, saveCylinderToSupabase, saveSystemSetting } from './services/supabaseDataService';
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

const PrintableJobCard = React.forwardRef(({ data, imagePreview, currentUser }, ref) => {
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'SuperAdmin';
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
                <td className="label-cell">Print Width (PET Size)</td><td className="value-cell" style={{ fontWeight: '800', color: '#047857' }}>{data.printWidth || (data.printWidthMm ? `${data.printWidthMm} mm` : (data.totalWidth || '—'))}</td>
                <td className="label-cell">Face Length (Shell)</td><td className="value-cell" style={{ fontWeight: '700', color: '#2563eb' }}>{data.faceLength || (data.faceLengthMm ? `${data.faceLengthMm} mm` : (data.totalWidth || '—'))}</td>
              </tr>
              <tr>
                <td className="label-cell">Total Repeat (Circum.)</td><td className="value-cell">{data.totalHeight || '—'}</td>
                <td className="label-cell">PET Substrate Size</td><td className="value-cell">{data.petSize || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Shell Size</td><td className="value-cell">{data.shellSize || '—'}</td>
                <td className="label-cell">Engraver Name</td><td className="value-cell" style={{ fontWeight: '700', color: '#1e293b' }}>{data.engravure || data.engravuresName || '—'}</td>
              </tr>
              <tr>
                <td className="label-cell">Cost Borne By</td><td className="value-cell">{isAdmin ? (data.costBorneBy || '—') : '🔒 Restricted (Admin Only)'}</td>
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
  const EDIT_ROLES = ['Admin', 'SuperAdmin', 'Plant Manager', 'Production Manager'];
  const userRole = currentUser?.role || 'Admin';
  const canEdit = EDIT_ROLES.includes(userRole);
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';
  const componentRef = useRef();

  const [layers, setLayers] = useState(() => {
    if (initialData?.layers && initialData.layers.length > 0) return initialData.layers;
    return [{ id: 1, filmType: 'PET', micron: 12 }];
  });

  const availableFilmTypes = useMemo(() => Object.keys(FILM_DENSITIES), []);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [saveNotification, setSaveNotification] = useState(null);
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

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
    numberOfCylinders: '',
    jobStructure: '—',
    printWidth: '',
    faceLength: '',
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
    engravure: '',
    cylinderCost: '',
    costPerCylinder: '',
    ratePerSqInch: 1.60,
    utilisationLimit: '10000',
    costBorneBy: 'Client (100%)',
    costBorneType: 'client',
    chkEyemark: false,
    chkBarcode: false,
    chkOrientation: false,
    chkClientApproval: false,
    approvedByHead: false,
    approvedHeadName: '',
    approvedHeadDate: '',
    artworkUrl: ''
  });

  useEffect(() => {
    if (initialData) {
      const matchingJM = (jobMasters || []).find(j => 
        (j.id && (j.id === initialData.jobMasterId || j.id === initialData.id)) ||
        (j.skuCode && j.skuCode === (initialData.sku || initialData.skuCode)) ||
        (j.jobName && j.jobName.toLowerCase() === (initialData.jobName || '').toLowerCase().trim())
      );

      const storageKey = `samyak_erp_jobcard_settings_${initialData.sku || initialData.skuCode || initialData.jobName || initialData.id}`;
      const savedLocal = safeLocalStorageGet(storageKey, null);

      const src = { ...(matchingJM || {}), ...initialData, ...(savedLocal || {}) };

      let initLayers = src.layers || [];
      if (initLayers.length === 0 && (src.structure || src.film_structure)) {
        initLayers = parseStructureToLayers(src.structure || src.film_structure);
      }
      if (initLayers.length > 0) setLayers(initLayers);

      const derivedStruct = (initLayers.length > 0)
        ? initLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (src.structure || src.film_structure || src.jobStructure || '—');

      const printWidthVal = src.printWidth 
        ? (String(src.printWidth).includes('mm') ? src.printWidth : `${src.printWidth} mm`)
        : (src.printWidthMm ? `${src.printWidthMm} mm` : (src.pouchOpenWidth ? `${src.pouchOpenWidth} mm` : ''));

      const faceLengthVal = src.faceLength 
        ? (String(src.faceLength).includes('mm') ? src.faceLength : `${src.faceLength} mm`)
        : (src.faceLengthMm ? `${src.faceLengthMm} mm` : (src.shellSize ? (String(src.shellSize).includes('mm') ? src.shellSize : `${src.shellSize} mm`) : ''));

      const repeatHeightVal = src.totalHeight
        ? (String(src.totalHeight).includes('mm') ? src.totalHeight : `${src.totalHeight} mm`)
        : (src.circumferenceMm ? `${src.circumferenceMm} mm` : (src.repeatLengthMm ? `${src.repeatLengthMm} mm` : (src.pouchHeight ? `${src.pouchHeight} mm` : '')));

      setFormData({
        jobMasterId: src.jobMasterId || src.id || '',
        skuCode: src.sku || src.skuCode || '',
        jobName: src.jobName || '',
        creationDate: src.creationDate || new Date().toLocaleDateString('en-GB'),
        partyName: src.clientGroup || src.partyName || src.clientName || '',
        invoiceTo: src.invoiceTo || 'Samyak International Ltd',
        variant: src.variant || '',
        printing: src.printing || 'Reverse',
        pouchOpenWidth: src.pouchOpenWidth ? (String(src.pouchOpenWidth).includes('mm') ? src.pouchOpenWidth : `${src.pouchOpenWidth} mm`) : '',
        pouchHeight: src.pouchHeight ? (String(src.pouchHeight).includes('mm') ? src.pouchHeight : `${src.pouchHeight} mm`) : '',
        numberOfCylinders: src.colorsCount || src.numberOfCylinders ? `${src.colorsCount || src.numberOfCylinders}` : '',
        jobStructure: derivedStruct,
        printWidth: printWidthVal,
        faceLength: faceLengthVal,
        totalWidth: faceLengthVal || printWidthVal,
        totalHeight: repeatHeightVal,
        shellSize: src.shellSize || faceLengthVal,
        petSize: src.petSize || (src.faceLengthMm ? `${src.faceLengthMm + 10} mm` : ''),
        silLogo: src.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
        arcMark: src.arcMark || 'Yes',
        slittingMark: src.slittingMark || 'Yes',
        trackerLine: src.trackerLine || 'Yes',
        specialInstructions: src.specialInstructions || '',
        approvedBy: src.approvedBy || '',
        engravure: src.engravuresName || src.engravure || src.engraverName || '',
        cylinderCost: src.cylinderCost || '',
        costPerCylinder: src.costPerCylinder || '',
        ratePerSqInch: src.ratePerSqInch || 1.60,
        utilisationLimit: `${src.utilisationLimit || 10000}`,
        costBorneBy: src.costBorneBy || 'Client (100%)',
        costBorneType: src.costBorneType || 'client',
        artworkUrl: src.artworkUrl || src.jobCardFileUrl || src.imageUrl || src.artworkImage || '',
        chkEyemark: Boolean(src.chkEyemark || initialData?.chkEyemark || matchingJM?.chkEyemark || savedLocal?.chkEyemark),
        chkBarcode: Boolean(src.chkBarcode || initialData?.chkBarcode || matchingJM?.chkBarcode || savedLocal?.chkBarcode),
        chkOrientation: Boolean(src.chkOrientation || initialData?.chkOrientation || matchingJM?.chkOrientation || savedLocal?.chkOrientation),
        chkClientApproval: Boolean(src.chkClientApproval || initialData?.chkClientApproval || matchingJM?.chkClientApproval || savedLocal?.chkClientApproval),
        approvedByHead: Boolean(src.approvedByHead || src.productionApproved || initialData?.approvedByHead || initialData?.productionApproved || matchingJM?.approvedByHead || matchingJM?.productionApproved || savedLocal?.approvedByHead),
        approvedHeadName: src.approvedHeadName || initialData?.approvedHeadName || matchingJM?.approvedHeadName || savedLocal?.approvedHeadName || '',
        approvedHeadDate: src.approvedHeadDate || initialData?.approvedHeadDate || matchingJM?.approvedHeadDate || savedLocal?.approvedHeadDate || ''
      });

      const initialArtworkUrl = src.artworkUrl || src.jobCardFileUrl || src.imageUrl || src.artworkImage || '';
      if (initialArtworkUrl) {
        setImagePreview(initialArtworkUrl);
      }
    }
  }, [initialData, jobMasters]);

  useEffect(() => {
    if (layers && layers.length > 0) {
      const structStr = layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
      setFormData(prev => ({ ...prev, jobStructure: structStr }));
    }
  }, [layers]);

  const handlePrint = useReactToPrint({ contentRef: componentRef, documentTitle: `Job_Card_${formData.jobName || 'Draft'}` });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDimensionBlur = (e) => {
    const { name, value } = e.target;
    if (!value) return;
    const trimmed = String(value).trim();
    if (trimmed && !trimmed.toLowerCase().includes('mm') && !isNaN(Number(trimmed.replace(/,/g, '')))) {
      setFormData(prev => ({
        ...prev,
        [name]: `${trimmed} mm`
      }));
    }
  };

  const handleJobMasterSelect = (e) => {
    const selectedId = e.target.value;
    const jm = (jobMasters || []).find(j => j.id === selectedId);
    if (jm) {
      let jmLayers = jm.layers || [];
      if (jmLayers.length === 0 && jm.structure) {
        jmLayers = parseStructureToLayers(jm.structure);
      }
      if (jmLayers.length > 0) setLayers(jmLayers);

      const derivedStruct = (jmLayers.length > 0)
        ? jmLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (jm.structure || '—');

      const printWidthVal = jm.printWidthMm ? `${jm.printWidthMm} mm` : '';
      const faceLengthVal = jm.faceLengthMm ? `${jm.faceLengthMm} mm` : '';
      const repeatHeightVal = jm.repeatLengthMm ? `${jm.repeatLengthMm} mm` : (jm.circumferenceMm ? `${jm.circumferenceMm} mm` : '');

      setFormData(prev => ({
        ...prev,
        jobMasterId: jm.id,
        skuCode: jm.skuCode || prev.skuCode,
        jobName: jm.jobName || prev.jobName,
        partyName: jm.clientName || prev.partyName,
        jobStructure: derivedStruct,
        printWidth: printWidthVal || prev.printWidth,
        faceLength: faceLengthVal || prev.faceLength,
        totalWidth: faceLengthVal || printWidthVal || prev.totalWidth,
        totalHeight: repeatHeightVal || prev.totalHeight,
        shellSize: jm.shellSize || faceLengthVal || prev.shellSize,
        petSize: jm.petSize || (jm.faceLengthMm ? `${jm.faceLengthMm + 10} mm` : prev.petSize),
        numberOfCylinders: `${jm.colorsCount || prev.numberOfCylinders}`,
        cylinderCost: jm.cylinderCost || prev.cylinderCost,
        engravure: jm.engravuresName || jm.engraverName || prev.engravure,
        costBorneBy: jm.costBorneBy || prev.costBorneBy,
        utilisationLimit: `${jm.utilisationLimit || prev.utilisationLimit}`,
        silLogo: jm.silLogo || prev.silLogo,
        arcMark: jm.arcMark || prev.arcMark,
        slittingMark: jm.slittingMark || prev.slittingMark,
        trackerLine: jm.trackerLine || prev.trackerLine,
        specialInstructions: jm.specialInstructions || prev.specialInstructions,
        chkEyemark: jm.chkEyemark ?? prev.chkEyemark,
        chkBarcode: jm.chkBarcode ?? prev.chkBarcode,
        chkOrientation: jm.chkOrientation ?? prev.chkOrientation,
        chkClientApproval: jm.chkClientApproval ?? prev.chkClientApproval,
        approvedByHead: jm.approvedByHead ?? prev.approvedByHead,
        approvedHeadName: jm.approvedHeadName || prev.approvedHeadName,
        approvedHeadDate: jm.approvedHeadDate || prev.approvedHeadDate,
        variant: jm.variant || prev.variant,
        printing: jm.printing || prev.printing,
        invoiceTo: jm.invoiceTo || prev.invoiceTo,
        artworkUrl: jm.jobCardFileUrl || jm.artworkUrl || prev.artworkUrl
      }));

      if (jm.jobCardFileUrl || jm.artworkUrl) {
        setImagePreview(jm.jobCardFileUrl || jm.artworkUrl);
      }
    }
  };

  const handleLayerChange = (id, field, value) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const addLayer = () => {
    setLayers(prev => [...prev, { id: Date.now(), filmType: availableFilmTypes[0] || 'PET', micron: 12 }]);
  };

  const removeLayer = (id) => {
    if (layers.length <= 1) {
      alert("At least one laminate layer is required.");
      return;
    }
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, formData.skuCode || formData.jobName || 'jobcard');
      if (result && result.publicUrl) {
        setImagePreview(result.publicUrl);
        setFormData(prev => ({ ...prev, artworkUrl: result.publicUrl }));
      }
    } catch (err) {
      console.error("Image upload failed", err);
      alert("Failed to upload artwork: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveArtwork = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, artworkUrl: '' }));
  };

  const saveJobCardSpecs = async (customData = formData, customNotification = null) => {
    try {
      const derivedStruct = (layers && layers.length > 0)
        ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
        : (customData.jobStructure || '—');

      const fileUrl = imagePreview || customData.artworkUrl || '';
      const fileName = fileUrl ? 'Artwork_KLD_Proof.pdf' : '';

      const printWidthNum = Number(String(customData.printWidth || customData.totalWidth).replace(/\D/g, '')) || Number(String(customData.pouchOpenWidth).replace(/\D/g, '')) || 1000;
      const faceLengthNum = Number(String(customData.faceLength || customData.totalWidth).replace(/\D/g, '')) || 1050;
      const repeatLengthNum = Number(String(customData.totalHeight).replace(/\D/g, '')) || Number(String(customData.pouchHeight).replace(/\D/g, '')) || 400;
      const pouchOpenWidthNum = Number(String(customData.pouchOpenWidth).replace(/\D/g, '')) || 0;
      const pouchHeightNum = Number(String(customData.pouchHeight).replace(/\D/g, '')) || 0;
      const colorsCountNum = Number(customData.numberOfCylinders) || 6;

      const existingJM = (jobMasters || []).find(j => 
        (j.id && j.id === customData.jobMasterId) ||
        (j.skuCode && j.skuCode.toLowerCase() === (customData.skuCode || '').toLowerCase().trim()) ||
        (j.jobName && j.jobName.toLowerCase() === (customData.jobName || '').toLowerCase().trim())
      );

      let targetJobMaster;
      if (existingJM) {
        targetJobMaster = {
          ...existingJM,
          skuCode: customData.skuCode || existingJM.skuCode,
          jobName: customData.jobName || existingJM.jobName,
          clientName: customData.partyName || existingJM.clientName,
          structure: derivedStruct,
          filmStructure: derivedStruct,
          layers: layers,
          printWidthMm: printWidthNum,
          faceLengthMm: faceLengthNum,
          repeatLengthMm: repeatLengthNum,
          circumferenceMm: repeatLengthNum,
          pouchOpenWidth: pouchOpenWidthNum,
          pouchHeight: pouchHeightNum,
          colorsCount: colorsCountNum,
          engravuresName: customData.engravure || existingJM.engravuresName || '',
          costBorneBy: customData.costBorneBy || existingJM.costBorneBy,
          cylinderCost: customData.cylinderCost || existingJM.cylinderCost || '',
          costPerCylinder: customData.costPerCylinder || existingJM.costPerCylinder || '',
          ratePerSqInch: customData.ratePerSqInch || existingJM.ratePerSqInch || 1.6,
          utilisationLimit: Number(customData.utilisationLimit) || existingJM.utilisationLimit || 10000,
          jobCardFileUrl: fileUrl,
          jobCardFileName: fileName,
          artworkUrl: fileUrl,
          silLogo: customData.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
          arcMark: customData.arcMark || 'Yes',
          slittingMark: customData.slittingMark || 'Yes',
          trackerLine: customData.trackerLine || 'Yes',
          specialInstructions: customData.specialInstructions || '',
          variant: customData.variant || 'Standard',
          printing: customData.printing || 'Reverse',
          invoiceTo: customData.invoiceTo || 'Samyak International Ltd',
          shellSize: customData.shellSize || `${faceLengthNum} mm`,
          petSize: customData.petSize || `${faceLengthNum + 10} mm`,
          chkEyemark: customData.chkEyemark ?? false,
          chkBarcode: customData.chkBarcode ?? false,
          chkOrientation: customData.chkOrientation ?? false,
          chkClientApproval: customData.chkClientApproval ?? false,
          approvedByHead: customData.approvedByHead ?? false,
          approvedHeadName: customData.approvedHeadName || '',
          approvedHeadDate: customData.approvedHeadDate || ''
        };
      } else {
        const jmId = getNextDocRefNumber('jm');
        targetJobMaster = {
          id: jmId,
          skuCode: customData.skuCode || jmId.replace('JM', 'SKU'),
          jobName: customData.jobName || 'New Job',
          clientName: customData.partyName || 'General Client',
          structure: derivedStruct,
          filmStructure: derivedStruct,
          layers: layers,
          printWidthMm: printWidthNum,
          faceLengthMm: faceLengthNum,
          repeatLengthMm: repeatLengthNum,
          circumferenceMm: repeatLengthNum,
          pouchOpenWidth: pouchOpenWidthNum,
          pouchHeight: pouchHeightNum,
          colorsCount: colorsCountNum,
          engravuresName: customData.engravure || '',
          costBorneBy: customData.costBorneBy || 'Client (100%)',
          cylinderCost: customData.cylinderCost || '',
          costPerCylinder: customData.costPerCylinder || '',
          ratePerSqInch: customData.ratePerSqInch || 1.6,
          utilisationLimit: Number(customData.utilisationLimit) || 10000,
          jobCardFileUrl: fileUrl,
          jobCardFileName: fileName,
          artworkUrl: fileUrl,
          silLogo: customData.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
          arcMark: customData.arcMark || 'Yes',
          slittingMark: customData.slittingMark || 'Yes',
          trackerLine: customData.trackerLine || 'Yes',
          specialInstructions: customData.specialInstructions || '',
          variant: customData.variant || 'Standard',
          printing: customData.printing || 'Reverse',
          invoiceTo: customData.invoiceTo || 'Samyak International Ltd',
          shellSize: customData.shellSize || `${faceLengthNum} mm`,
          petSize: customData.petSize || `${faceLengthNum + 10} mm`,
          chkEyemark: customData.chkEyemark ?? false,
          chkBarcode: customData.chkBarcode ?? false,
          chkOrientation: customData.chkOrientation ?? false,
          chkClientApproval: customData.chkClientApproval ?? false,
          approvedByHead: customData.approvedByHead ?? false,
          approvedHeadName: customData.approvedHeadName || '',
          approvedHeadDate: customData.approvedHeadDate || '',
          creationDate: customData.creationDate || new Date().toLocaleDateString('en-GB')
        };
      }

      const cylId = (initialData?.id && String(initialData.id).startsWith('CYL-'))
        ? initialData.id 
        : (initialData?.cylinderId || `CYL-${Date.now()}`);

      const targetCylinder = {
        id: cylId,
        sku: customData.skuCode || targetJobMaster.skuCode,
        jobName: customData.jobName || targetJobMaster.jobName,
        clientGroup: customData.partyName || targetJobMaster.clientName,
        colorsCount: colorsCountNum,
        cylinderCost: customData.cylinderCost || targetJobMaster.cylinderCost,
        costPerCylinder: customData.costPerCylinder,
        ratePerSqInch: customData.ratePerSqInch || 1.6,
        engravuresName: customData.engravure || targetJobMaster.engravuresName || '',
        costBorneBy: customData.costBorneBy || 'Client (100%)',
        costBorneType: customData.costBorneType || 'client',
        circumferenceMm: repeatLengthNum,
        faceLengthMm: faceLengthNum,
        printWidthMm: printWidthNum,
        pouchOpenWidth: pouchOpenWidthNum,
        pouchHeight: pouchHeightNum,
        layers: layers,
        structure: derivedStruct,
        utilisationLimit: Number(customData.utilisationLimit) || 10000,
        status: initialData?.status || 'Active In-Use',
        artworkUrl: fileUrl,
        jobCardFileUrl: fileUrl,
        jobCardFileName: fileName,
        jobMasterId: targetJobMaster.id,
        silLogo: customData.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
        arcMark: customData.arcMark || 'Yes',
        slittingMark: customData.slittingMark || 'Yes',
        trackerLine: customData.trackerLine || 'Yes',
        specialInstructions: customData.specialInstructions || '',
        chkEyemark: customData.chkEyemark ?? false,
        chkBarcode: customData.chkBarcode ?? false,
        chkOrientation: customData.chkOrientation ?? false,
        chkClientApproval: customData.chkClientApproval ?? false,
        approvedByHead: customData.approvedByHead ?? false,
        approvedHeadName: customData.approvedHeadName || '',
        approvedHeadDate: customData.approvedHeadDate || '',
        variant: customData.variant || 'Standard',
        printing: customData.printing || 'Reverse',
        invoiceTo: customData.invoiceTo || 'Samyak International Ltd',
        shellSize: customData.shellSize || `${faceLengthNum} mm`,
        petSize: customData.petSize || `${faceLengthNum + 10} mm`,
        creationDate: customData.creationDate || new Date().toLocaleDateString('en-GB')
      };

      await Promise.allSettled([
        saveJobMasterToSupabase(targetJobMaster),
        saveCylinderToSupabase(targetCylinder),
        saveSystemSetting(`jobcard_${targetJobMaster.skuCode || targetJobMaster.id}`, { ...customData, jobStructure: derivedStruct, layers, artworkUrl: fileUrl, targetJobMaster, targetCylinder })
      ]);

      const storageKey = `samyak_erp_jobcard_settings_${customData.skuCode || customData.jobName || targetJobMaster.id}`;
      safeLocalStorageSet(storageKey, { ...customData, jobStructure: derivedStruct, layers, artworkUrl: fileUrl, printWidth: `${printWidthNum} mm`, faceLength: `${faceLengthNum} mm` });

      if (onSave) {
        onSave({ ...customData, jobStructure: derivedStruct, layers, artworkUrl: fileUrl, printWidth: `${printWidthNum} mm`, faceLength: `${faceLengthNum} mm` }, targetJobMaster, targetCylinder);
      }

      setSaveNotification(customNotification || (existingJM ? '✅ Job Master & Rotogravure Cylinder Specs Synced to Database!' : '✅ New Job Master & Cylinder Record Created in Database!'));
      setTimeout(() => setSaveNotification(null), 4000);
      return true;
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save settings: " + e.message);
      return false;
    }
  };

  const handleSaveSettings = async () => {
    if (!canEdit) {
      alert("Access Denied: Only Admin, SuperAdmin, Plant Manager, or Production Manager can save Job Card specs.");
      return;
    }
    await saveJobCardSpecs(formData);
  };

  const handleToggleApproval = async (shouldApprove) => {
    const approverName = shouldApprove ? (currentUser?.name || 'Production Head') : '';
    const dateStr = shouldApprove ? new Date().toLocaleDateString('en-IN') : '';

    const updatedFormData = {
      ...formData,
      approvedByHead: shouldApprove,
      approvedHeadName: approverName,
      approvedHeadDate: dateStr
    };

    setFormData(updatedFormData);

    const notificationMsg = shouldApprove
      ? `✅ Job Card signed off by ${approverName} and synced to Database!`
      : '✅ Job Card sign-off revoked and synced to Database.';

    await saveJobCardSpecs(updatedFormData, notificationMsg);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
      
      {saveNotification && (
        <div style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '12px 20px', borderRadius: '8px', fontWeight: '700', fontSize: '0.9rem', width: '100%', maxWidth: '1000px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle2 size={20} />
          {saveNotification}
        </div>
      )}

      {/* Action Toolbar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '1000px', background: '#ffffff', padding: '16px 20px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#0f172a' }}>
              Rotogravure Cylinder Job Card
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Job: <b style={{ color: '#0f172a' }}>{formData.jobName || 'Untitled Job'}</b> ({formData.skuCode || 'SKU-NEW'})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {canEdit && (
            <button className="btn-primary" style={{ background: '#047857', borderColor: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleSaveSettings}>
              <Save size={16} /> Save Parameters & Settings
            </button>
          )}
          <button className="btn-primary" style={{ background: '#1e293b', borderColor: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handlePrint()}>
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Quick Settings & Checklist Section */}
      <div className="no-print glass-panel" style={{ width: '100%', maxWidth: '1000px', padding: '20px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckSquare size={18} color="#047857" /> Mandatory Pre-Press QA Checklist & Approval
        </h3>

        {/* 4-Item Checklist */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={formData.chkEyemark} 
                onChange={e => setFormData(prev => ({ ...prev, chkEyemark: e.target.checked }))} 
              />
              Eye Mark Verified
            </label>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={formData.chkBarcode} 
                onChange={e => setFormData(prev => ({ ...prev, chkBarcode: e.target.checked }))} 
              />
              Barcode Verified
            </label>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={formData.chkOrientation} 
                onChange={e => setFormData(prev => ({ ...prev, chkOrientation: e.target.checked }))} 
              />
              Orientation Checked
            </label>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
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
              onClick={() => handleToggleApproval(false)}
            >
              Revoke Sign-Off
            </button>
          ) : (
            <button 
              type="button" 
              className="btn-primary" 
              style={{ background: '#047857', borderColor: '#047857', fontWeight: '800', fontSize: '0.85rem', padding: '8px 16px' }}
              onClick={() => handleToggleApproval(true)}
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
            value={formData.jobMasterId || ''}
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

        {/* SECTION 3: PRESS MARKS & QUALITY GUIDELINES (INPUT ENTRY) */}
        <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
          <div style={{ marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
            <label style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <CheckSquare size={18} style={{ color: 'var(--primary-brand)' }} />
              3. Press Marks & Quality Guidelines (Input Entry)
            </label>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Configure press line branding, alignment marks, slitting tracker lines, and special plant execution instructions.
            </p>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="form-group">
              <label>SIL Logo / Press Line</label>
              <input 
                className="form-control" 
                name="silLogo" 
                value={formData.silLogo} 
                onChange={handleChange} 
                placeholder="e.g. Yes - 'Pkg Material Mfg by - Samyak International Ltd'" 
              />
            </div>

            <div className="form-group">
              <label>ARC Mark (Auto Register Control)</label>
              <select className="form-control" name="arcMark" value={formData.arcMark} onChange={handleChange}>
                <option value="Yes">Yes (Standard)</option>
                <option value="Yes (Both Edges)">Yes (Both Edges)</option>
                <option value="Yes (Operator Side)">Yes (Operator Side)</option>
                <option value="Yes (Gear Side)">Yes (Gear Side)</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label>Slitting Mark</label>
              <select className="form-control" name="slittingMark" value={formData.slittingMark} onChange={handleChange}>
                <option value="Yes">Yes (Standard)</option>
                <option value="1.5mm Dashed">1.5mm Dashed</option>
                <option value="Continuous Solid Line">Continuous Solid Line</option>
                <option value="2mm Center Slit">2mm Center Slit</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label>Tracker Line</label>
              <select className="form-control" name="trackerLine" value={formData.trackerLine} onChange={handleChange}>
                <option value="Yes">Yes (Standard)</option>
                <option value="Continuous 1mm">Continuous 1mm</option>
                <option value="1mm Edge Guide">1mm Edge Guide</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Special Quality Guidelines & Operator Instructions</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'normal' }}>Printed on Job Card in red highlighted banner</span>
              </label>
              <textarea 
                className="form-control" 
                name="specialInstructions" 
                rows="3" 
                value={formData.specialInstructions} 
                onChange={handleChange} 
                placeholder="e.g. Core 76mm ID. Winding direction: Face Out. Maintain solvent retention < 5 mg/m². Corona treatment dynes > 38."
              />
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
            <label style={{ color: '#047857', fontWeight: '700' }}>Print Width (PET Size) (mm)*</label>
            <input className="form-control" name="printWidth" value={formData.printWidth} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 1000 mm" />
          </div>
          <div className="form-group">
            <label style={{ color: '#2563eb', fontWeight: '700' }}>Face Length (Shell) (mm)*</label>
            <input className="form-control" name="faceLength" value={formData.faceLength} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 1050 mm" />
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
          {isAdmin && (
            <div className="form-group">
              <label>Cost Borne By</label>
              <input className="form-control" name="costBorneBy" value={formData.costBorneBy} onChange={handleChange} />
            </div>
          )}
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

              {canEdit && (
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
              )}
            </div>
          </div>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button className="btn-primary" style={{ background: '#059669', padding: '10px 20px' }} onClick={handleSaveSettings}>
              <Save size={16} /> Save Parameters & Settings
            </button>
          </div>
        )}
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
