import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  Plus, 
  Edit3, 
  Printer, 
  Search, 
  CheckCircle2, 
  AlertTriangle,
  FileCheck,
  Calculator,
  Trash2,
  UploadCloud,
  ExternalLink,
  Image as ImageIcon,
  Check, 
  Info,
  FileCode,
  X,
  Building2,
  Lock,
  Unlock,
  Clock,
  FileSpreadsheet,
  History,
  Eye,
  RefreshCw,
  Download
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import { FILM_DENSITIES } from '../factoryStore';
import CylinderJobCardForm from '../CylinderJobCardForm';
import { uploadArtworkFile, openArtworkViewer } from '../services/supabaseStorageService';
import ArtworkModal from './ArtworkModal';

// Target Schema Fields for Rotogravure Cylinder Bulk Import
const TARGET_SCHEMA_FIELDS = [
  { key: 'sku', label: 'SKU / Cylinder Code', required: true, aliases: ['sku', 'sku code', 'cylinder sku', 'code', 'item code', 'id'] },
  { key: 'jobName', label: 'Job / Brand Name', required: true, aliases: ['job name', 'jobname', 'brand', 'brand name', 'product name', 'job', 'name'] },
  { key: 'clientGroup', label: 'Client Group / Company', required: false, aliases: ['client', 'client group', 'client name', 'company', 'party', 'customer'] },
  { key: 'colorsCount', label: 'Printing Colors Count', required: false, aliases: ['colors', 'color count', 'colors count', 'no of colors', 'cylinders', 'cylinder count'] },
  { key: 'printWidthMm', label: 'Print Width (mm)', required: false, aliases: ['print width', 'print width (mm)', 'pet size', 'width', 'width mm'] },
  { key: 'faceLengthMm', label: 'Face Length (mm)', required: false, aliases: ['face length', 'face length (mm)', 'shell size', 'length', 'length mm'] },
  { key: 'circumferenceMm', label: 'Circumference (mm)', required: false, aliases: ['circumference', 'circumference (mm)', 'repeat length', 'repeat', 'repeat (mm)'] },
  { key: 'rate', label: 'Rate (₹/sq cm)', required: false, aliases: ['rate', 'sq cm rate', 'rate per sq inch', 'rate (rs)'] },
  { key: 'engravuresName', label: 'Engraver Name', required: false, aliases: ['engraver', 'engraver name', 'engravures name', 'vendor'] },
  { key: 'cylinderCost', label: 'Total Cylinder Set Cost', required: false, aliases: ['total cost', 'set cost', 'cylinder cost', 'cost'] },
  { key: 'costPerCylinder', label: 'Cost Per Cylinder', required: false, aliases: ['cost per cylinder', 'cost/cylinder', 'per cylinder cost'] },
  { key: 'costBorneBy', label: 'Cost Borne By', required: false, aliases: ['cost borne by', 'cost borne', 'borne by'] },
  { key: 'status', label: 'Operational Status', required: false, aliases: ['status', 'operational status', 'state'] },
  { key: 'assignedPress', label: 'Assigned Press', required: false, aliases: ['assigned press', 'press', 'machine', 'line'] },
  { key: 'structure', label: 'Laminate Structure', required: false, aliases: ['structure', 'laminate structure', 'substrate', 'layers'] }
];

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Helper: Auto-detect CSV Header Mapping for Rotogravure Cylinders Bulk Upload
 */
function autoMapHeaders(headers = []) {
  const mapping = {};
  headers.forEach(h => {
    const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.includes('sku') || clean.includes('code') || clean.includes('serial')) mapping[h] = 'sku';
    else if (clean.includes('jobname') || clean.includes('title') || clean.includes('design') || clean.includes('itemname')) mapping[h] = 'jobName';
    else if (clean.includes('client') || clean.includes('party') || clean.includes('customer') || clean.includes('group')) mapping[h] = 'clientGroup';
    else if (clean.includes('color') || clean.includes('colour') || clean.includes('count')) mapping[h] = 'colorsCount';
    else if (clean.includes('printwidth') || clean.includes('webwidth') || clean.includes('width')) mapping[h] = 'printWidthMm';
    else if (clean.includes('facelength') || clean.includes('shellsize') || clean.includes('length')) mapping[h] = 'faceLengthMm';
    else if (clean.includes('repeat') || clean.includes('circumference') || clean.includes('dia')) mapping[h] = 'circumferenceMm';
    else if (clean.includes('structure') || clean.includes('laminate') || clean.includes('film')) mapping[h] = 'structure';
    else if (clean.includes('cost') || clean.includes('rate') || clean.includes('price')) mapping[h] = 'cylinderCost';
    else if (clean.includes('engrav') || clean.includes('vendor') || clean.includes('maker')) mapping[h] = 'engravuresName';
    else if (clean.includes('status') || clean.includes('condition')) mapping[h] = 'status';
  });
  return mapping;
}

export default function CylinderManagement({ 
  urlParams = {},
  cylinders = [], 
  clients = [],
  onAddClient,
  jobMasters = [],
  onAddJobMaster,
  onBatchAddJobMasters,
  onUpdateJobMaster,
  currentUser,
  onAddCylinder, 
  onBatchAddCylinders,
  onUpdateCylinder,
  onDeleteCylinder,
  onLinkCylinderToJobMaster,
  onCreateAndLinkPair,
  machines = []
}) {
  // Access Control: Only Admin and Plant Manager have Edit/Lock/Delete access
  const EDIT_ROLES = ['Admin', 'SuperAdmin', 'Plant Manager'];
  const userRole = currentUser?.role || 'Admin';
  const canEditCylinders = EDIT_ROLES.includes(userRole);
  const isAdminOrPlantManager = EDIT_ROLES.includes(userRole);
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (urlParams && urlParams.id) {
      setSearchTerm(urlParams.id);
    }
  }, [urlParams]);

  // Modal State for Add / Edit Cylinder Set
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCylinder, setEditingCylinder] = useState(null);
  const [selectedForPDF, setSelectedForPDF] = useState(null);
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

  // Changelog Modal State
  const [changelogCylinder, setChangelogCylinder] = useState(null);

  // Bulk Upload CSV Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCsvFileName, setBulkCsvFileName] = useState('');
  const [bulkParsedHeaders, setBulkParsedHeaders] = useState([]);
  const [bulkParsedRows, setBulkParsedRows] = useState([]);
  const [bulkHeaderMapping, setBulkHeaderMapping] = useState({});
  const [bulkAutoCreateJobMasters, setBulkAutoCreateJobMasters] = useState(true);

  // Interactive Link / Create Job Master Modal State
  const [linkingCylinder, setLinkingCylinder] = useState(null);
  const [linkMode, setLinkMode] = useState('EXISTING');
  const [selectedExistingJmId, setSelectedExistingJmId] = useState('');

  const handleConfirmLinkToExistingJm = async () => {
    if (!linkingCylinder || !selectedExistingJmId) {
      alert("Please select a Job Master to link with!");
      return;
    }
    if (onLinkCylinderToJobMaster) {
      await onLinkCylinderToJobMaster(linkingCylinder.id, selectedExistingJmId);
    } else {
      const targetJm = (jobMasters || []).find(j => j.id === selectedExistingJmId);
      if (onUpdateCylinder) {
        onUpdateCylinder({ ...linkingCylinder, jobMasterId: selectedExistingJmId, sku: targetJm?.skuCode || linkingCylinder.sku });
      }
    }
    setLinkingCylinder(null);
    alert(`✅ Cylinder ${linkingCylinder.sku} successfully linked to Job Master!`);
  };

  const handleCreateNewJmAndLink = async () => {
    if (!linkingCylinder) return;
    const newJmId = `JM-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newJm = {
      id: newJmId,
      skuCode: linkingCylinder.sku,
      jobName: linkingCylinder.jobName,
      clientName: linkingCylinder.clientGroup || 'Standard Client',
      structure: linkingCylinder.structure || '—',
      printWidthMm: linkingCylinder.printWidthMm || 1000,
      faceLengthMm: linkingCylinder.faceLengthMm || 1050,
      repeatLengthMm: linkingCylinder.circumferenceMm || 400,
      layers: linkingCylinder.layers || [],
      cylinderSku: linkingCylinder.sku,
      cylinderCost: linkingCylinder.cylinderCost || '₹ 0',
      colorsCount: linkingCylinder.colorsCount || 6,
      engravuresName: linkingCylinder.engravuresName || '',
      costBorneBy: linkingCylinder.costBorneBy || 'Client (100%)',
      utilisationLimit: linkingCylinder.utilisationLimit || 10000,
      creationDate: new Date().toISOString().split('T')[0]
    };

    const updatedCyl = {
      ...linkingCylinder,
      jobMasterId: newJmId,
      job_master_id: newJmId
    };

    if (onCreateAndLinkPair) {
      await onCreateAndLinkPair({ cylinder: updatedCyl, jobMaster: newJm });
    } else {
      if (onAddJobMaster) await onAddJobMaster(newJm);
      if (onUpdateCylinder) await onUpdateCylinder(updatedCyl);
    }

    setLinkingCylinder(null);
    alert(`✅ New Job Master (${newJmId}) created and linked to Cylinder (${linkingCylinder.sku}) in database!`);
  };

  // Live printing press list — only Rotogravure / Flexographic / Digital machines
  const printingPresses = useMemo(() => {
    const PRINTING_TYPES = ['Rotogravure', 'Flexographic', 'Digital'];
    const presses = machines
      .filter(m => PRINTING_TYPES.includes(m.type))
      .map(m => m.name);
    return presses.length > 0 ? presses : [
      'Rotogravure Press #1 (8-Color)',
      'Rotogravure Press #2 (10-Color)',
      'Flexographic Press #1 (6-Color)'
    ];
  }, [machines]);

  // Form Fields State
  const [sku, setSku] = useState('');
  const [jobName, setJobName] = useState('');
  const [clientGroup, setClientGroup] = useState('');
  const [colorsCount, setColorsCount] = useState(6);
  const [engravuresName, setEngravuresName] = useState('');
  const [rate, setRate] = useState(1.60);
  const [cylinderCost, setCylinderCost] = useState('35000');
  const [costPerCylinder, setCostPerCylinder] = useState('5833');
  const [costBorneBy, setCostBorneBy] = useState('Client (100%)');
  const [costBorneType, setCostBorneType] = useState('client');
  const [circumferenceMm, setCircumferenceMm] = useState(400);
  const [faceLengthMm, setFaceLengthMm] = useState(1050);
  const [printWidthMm, setPrintWidthMm] = useState(1000);
  const [layer1PrintedQtyKg, setLayer1PrintedQtyKg] = useState(385.5);
  const [dispatchedQty, setDispatchedQty] = useState(3855);
  const [utilisationLimit, setUtilisationLimit] = useState(10000);
  const [status, setStatus] = useState('Active In-Use');
  const [assignedPress, setAssignedPress] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [autoCalculateCost, setAutoCalculateCost] = useState(true);

  // Product Structure (Laminate Layers) State
  const [layers, setLayers] = useState([
    { id: 1, filmType: 'PET', micron: 12 },
    { id: 2, filmType: 'METPET', micron: 12 },
    { id: 3, filmType: 'Natural GP LD', micron: 35 }
  ]);

  // Job Master Auto-Creation Toggle
  const [createJobMaster, setCreateJobMaster] = useState(true);

  // Pouch Dimensions
  const [pouchOpenWidth, setPouchOpenWidth] = useState(0);
  const [pouchHeight, setPouchHeight] = useState(0);

  // Press Marks & Quality Guidelines State
  const [silLogo, setSilLogo] = useState('');
  const [arcMark, setArcMark] = useState('Yes');
  const [slittingMark, setSlittingMark] = useState('Yes');
  const [trackerLine, setTrackerLine] = useState('Yes');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Available film types for substrate layer dropdown
  const availableFilmTypes = useMemo(() => Object.keys(FILM_DENSITIES), []);

  const createChangelogEntry = (action, details) => ({
    id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    user: currentUser?.name || 'System User',
    role: userRole,
    action,
    details
  });

  // Add / Remove substrate layer helpers
  const addLayer = () => {
    setLayers(prev => [
      ...prev,
      { id: Date.now(), filmType: 'PET', micron: 12 }
    ]);
  };

  const removeLayer = (layerId) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
  };

  // Quick Client Onboarding State
  const [isOnboardClientModalOpen, setIsOnboardClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGstin, setNewGstin] = useState('');

  // Client Directory Dropdown Options
  const allClientOptions = useMemo(() => {
    const map = new Map();
    (clients || []).forEach(c => {
      if (c.companyName || c.name) {
        const name = (c.companyName || c.name).trim();
        if (name) map.set(name.toLowerCase(), { name, gstin: c.gstin || '' });
      }
    });
    (jobMasters || []).forEach(j => {
      if (j.clientName) {
        const name = j.clientName.trim();
        if (name && !map.has(name.toLowerCase())) {
          map.set(name.toLowerCase(), { name, gstin: '' });
        }
      }
    });
    (cylinders || []).forEach(c => {
      if (c.clientGroup) {
        const name = c.clientGroup.trim();
        if (name && !map.has(name.toLowerCase())) {
          map.set(name.toLowerCase(), { name, gstin: '' });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, jobMasters, cylinders]);

  const handleQuickOnboardClientSubmit = (e) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      alert("Company / Client Name is required!");
      return;
    }

    const name = newClientName.trim();
    const createdClient = {
      id: `CLI-2026-${Date.now().toString().slice(-4)}`,
      name,
      companyName: name,
      contactPerson: newContactPerson.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      gstin: newGstin.trim(),
      createdAt: new Date().toISOString()
    };

    if (onAddClient) {
      onAddClient(createdClient);
    }

    setClientGroup(name);
    setIsOnboardClientModalOpen(false);
    setNewClientName('');
    setNewContactPerson('');
    setNewPhone('');
    setNewEmail('');
    setNewGstin('');
    alert(`Client "${name}" onboarded and selected!`);
  };

  // Surface Area and Cost Calculations: (Face Length × Circumference ÷ 100) × Rate × Colors
  const billingAreaUnits = Number(((Number(circumferenceMm || 0) * Number(faceLengthMm || 0)) / 100).toFixed(2));
  const calculatedCostPerCylinder = Math.round(billingAreaUnits * Number(rate || 1.6));
  const calculatedTotalSetCost = Math.round(calculatedCostPerCylinder * (parseInt(colorsCount) || 1));

  useEffect(() => {
    if (autoCalculateCost && circumferenceMm > 0 && faceLengthMm > 0) {
      setCostPerCylinder(String(calculatedCostPerCylinder));
      setCylinderCost(String(calculatedTotalSetCost));
    }
  }, [circumferenceMm, faceLengthMm, rate, colorsCount, autoCalculateCost, calculatedCostPerCylinder, calculatedTotalSetCost]);

  const getNextCylinderSku = (offset = 0) => {
    let maxNum = 0;
    const checkValue = (val) => {
      if (!val) return;
      const str = String(val).trim();
      if (!str) return;
      const matches = str.match(/\d+/g);
      if (matches && matches.length > 0) {
        let numToConsider = parseInt(matches[matches.length - 1], 10);
        if (matches.length > 1 && numToConsider >= 2020 && numToConsider <= 2035) {
          numToConsider = parseInt(matches[0], 10);
        } else if (matches.length === 1 && numToConsider >= 2020 && numToConsider <= 2035) {
          numToConsider = 0;
        }

        if (!isNaN(numToConsider) && numToConsider > maxNum) {
          maxNum = numToConsider;
        }
      }
    };

    (cylinders || []).forEach(c => {
      checkValue(c.sku);
      checkValue(c.skuCode);
      checkValue(c.cylinderSku);
    });

    (jobMasters || []).forEach(j => {
      checkValue(j.cylinderSku);
      checkValue(j.sku);
      checkValue(j.skuCode);
    });

    const nextIndex = maxNum + 1 + offset;
    return `SKU-CYL-${String(nextIndex).padStart(3, '0')}`;
  };

  const isSkuDuplicate = useMemo(() => {
    const code = (sku || '').trim().toLowerCase();
    if (!code) return false;
    return (cylinders || []).some(c => 
      c.id !== editingCylinder?.id && 
      ((c.sku || c.skuCode || '').toLowerCase() === code)
    );
  }, [sku, cylinders, editingCylinder]);

  const openAddModal = () => {
    if (!canEditCylinders) {
      alert("⛔ Permission Denied: Only Admin and Plant Manager roles are authorized to create or edit Rotogravure Cylinder sets.");
      return;
    }
    setEditingCylinder(null);
    setSku(getNextCylinderSku());
    setJobName('');
    setClientGroup('');
    setColorsCount(6);
    setEngravuresName('');
    setRate(1.60);
    setCircumferenceMm(400);
    setFaceLengthMm(1050);
    setPrintWidthMm(1000);
    setAutoCalculateCost(true);
    setCostBorneBy('Client (100%)');
    setCostBorneType('client');
    setLayer1PrintedQtyKg(0);
    setDispatchedQty(0);
    setUtilisationLimit(10000);
    setStatus('Active In-Use');
    setAssignedPress(printingPresses[0] || '');
    setArtworkUrl('');
    setLayers([
      { id: 1, filmType: 'PET', micron: 12 },
      { id: 2, filmType: 'METPET', micron: 12 },
      { id: 3, filmType: 'Natural GP LD', micron: 35 }
    ]);
    setCreateJobMaster(true);
    setPouchOpenWidth(0);
    setPouchHeight(0);
    setSilLogo('');
    setArcMark('Yes');
    setSlittingMark('Yes');
    setTrackerLine('Yes');
    setSpecialInstructions('');
    setIsModalOpen(true);
  };

  const openEditModal = (cyl) => {
    if (!canEditCylinders) {
      alert("⛔ Permission Denied: Only Admin and Plant Manager roles are authorized to edit Rotogravure Cylinder sets.");
      return;
    }
    if (cyl.isLocked && !isAdminOrPlantManager) {
      alert(`🔒 Permission Restricted: Cylinder Set "${cyl.jobName}" is LOCKED. Only Admin and Plant Manager can unlock or modify locked cylinders.`);
      return;
    }

    setEditingCylinder(cyl);
    setSku(cyl.sku || '');
    setJobName(cyl.jobName || '');
    setClientGroup(cyl.clientGroup || '');
    setColorsCount(cyl.colorsCount || 6);
    setEngravuresName(cyl.engravuresName || '');
    setRate(cyl.rate || cyl.ratePerSqInch || 1.60);
    setCircumferenceMm(cyl.circumferenceMm || 400);
    setFaceLengthMm(cyl.faceLengthMm || 1050);
    setPrintWidthMm(cyl.printWidthMm || cyl.pouchOpenWidth || 1000);
    setCylinderCost(`${cyl.cylinderCost || ''}`.replace(/[^0-9]/g, ''));
    setCostPerCylinder(`${cyl.costPerCylinder || ''}`.replace(/[^0-9]/g, '') || String(Math.round((parseInt(`${cyl.cylinderCost || 0}`.replace(/[^0-9]/g, '')) || 0) / (cyl.colorsCount || 1))));
    setAutoCalculateCost(false);
    setCostBorneBy(cyl.costBorneBy || 'Client (100%)');
    setCostBorneType(cyl.costBorneType || 'client');
    setLayer1PrintedQtyKg(cyl.layer1PrintedQtyKg || 385);
    setDispatchedQty(cyl.dispatchedQty || 0);
    setUtilisationLimit(cyl.utilisationLimit || 10000);
    setStatus(cyl.status || 'Active In-Use');
    setAssignedPress(cyl.assignedPress || printingPresses[0] || '');
    setArtworkUrl(cyl.artworkUrl || '');

    if (cyl.layers && cyl.layers.length > 0) {
      setLayers(cyl.layers);
    } else if (cyl.structure) {
      const parts = String(cyl.structure).split('/');
      setLayers(parts.map((p, i) => {
        const trimmed = p.trim();
        const mMatch = trimmed.match(/(\d+)\s*µ?/);
        const mic = mMatch ? parseInt(mMatch[1], 10) : 12;
        const ft = trimmed.replace(/\d+\s*µ?/, '').trim() || 'PET';
        return { id: i + 1, filmType: ft, micron: mic };
      }));
    } else {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'Natural GP LD', micron: 35 }
      ]);
    }
    setCreateJobMaster(false);
    setPouchOpenWidth(cyl.pouchOpenWidth || 0);
    setPouchHeight(cyl.pouchHeight || 0);
    setSilLogo((cyl.silLogo !== undefined && cyl.silLogo !== null) ? cyl.silLogo : '');
    setArcMark(cyl.arcMark || 'Yes');
    setSlittingMark(cyl.slittingMark || 'Yes');
    setTrackerLine(cyl.trackerLine || 'Yes');
    setSpecialInstructions(cyl.specialInstructions || '');
    setIsModalOpen(true);
  };

  // Lock / Unlock Cylinder Set Toggle Handler (Admin & Plant Manager Only)
  const handleToggleLock = (cyl) => {
    if (!isAdminOrPlantManager) {
      alert("⛔ Permission Denied: Only Admin and Plant Manager roles are authorized to Lock or Unlock Rotogravure Cylinder sets.");
      return;
    }

    const nextLocked = !cyl.isLocked;
    const actionType = nextLocked ? 'LOCKED' : 'UNLOCKED';
    const actionDetails = nextLocked 
      ? `Cylinder set locked by ${currentUser?.name || userRole}`
      : `Cylinder set unlocked by ${currentUser?.name || userRole}`;

    const newLog = createChangelogEntry(actionType, actionDetails);
    const existingLogs = Array.isArray(cyl.changelogs) ? cyl.changelogs : [];
    const updatedLogs = [newLog, ...existingLogs];

    const updatedCyl = {
      ...cyl,
      isLocked: nextLocked,
      lockedBy: nextLocked ? `${currentUser?.name || 'Authorized User'} (${userRole})` : '',
      lockedAt: nextLocked ? new Date().toISOString() : '',
      changelogs: updatedLogs
    };

    if (onUpdateCylinder) {
      onUpdateCylinder(updatedCyl);
    }

    alert(`Cylinder set "${cyl.jobName}" is now ${nextLocked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}.`);
  };

  // Inline Artwork Image Upload / Manual Editing Post-Bulk Import
  const handleInlineArtworkUpload = async (e, cyl) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (cyl.isLocked && !isAdminOrPlantManager) {
      alert("⛔ Permission Denied: This cylinder set is locked. Only Admin and Plant Manager can edit locked records.");
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, cyl.sku || cyl.jobName || 'cylinder');
      const newUrl = result.publicUrl || '';
      if (newUrl) {
        const newLog = createChangelogEntry('ARTWORK_UPDATED', `Artwork file "${file.name}" uploaded manually`);
        const existingLogs = Array.isArray(cyl.changelogs) ? cyl.changelogs : [];
        const updatedLogs = [newLog, ...existingLogs];

        const updatedCyl = {
          ...cyl,
          artworkUrl: newUrl,
          jobCardFileUrl: newUrl,
          jobCardFileName: file.name,
          changelogs: updatedLogs
        };

        if (onUpdateCylinder) {
          onUpdateCylinder(updatedCyl);
        }
        alert(`Artwork image updated successfully for "${cyl.jobName}"!`);
      } else {
        alert("Artwork upload failed: " + (result.error || "Could not retrieve public URL"));
      }
    } catch (err) {
      console.error("Artwork inline upload error:", err);
      alert("Failed to upload artwork: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleArtworkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, sku || jobName || 'cylinder');
      if (result.success && result.publicUrl) {
        setArtworkUrl(result.publicUrl);
        alert("Artwork uploaded to Supabase Storage successfully!");
      } else {
        alert("Artwork upload note: " + (result.error || "Stored locally in session"));
        if (result.publicUrl) setArtworkUrl(result.publicUrl);
      }
    } catch (err) {
      console.error("Artwork upload error:", err);
      alert("Artwork upload failed: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveCylinder = (e) => {
    e.preventDefault();
    if (!jobName.trim() || !sku.trim()) {
      alert("SKU and Job Name are required!");
      return;
    }

    if (editingCylinder && editingCylinder.isLocked && !isAdminOrPlantManager) {
      alert("⛔ Permission Denied: This cylinder set is LOCKED. Only Admin and Plant Manager can save changes to locked cylinders.");
      return;
    }

    const structureSummary = layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
    const nextJmId = `JM-2026-${String((jobMasters ? jobMasters.length : 0) + 101).padStart(3, '0')}`;

    const existingLogs = Array.isArray(editingCylinder?.changelogs) ? editingCylinder.changelogs : [];
    const actionType = editingCylinder ? 'UPDATED' : 'CREATED';
    const actionDetails = editingCylinder 
      ? `Specifications updated by ${currentUser?.name || userRole}`
      : `Cylinder set onboarded by ${currentUser?.name || userRole}`;
    const newLog = createChangelogEntry(actionType, actionDetails);
    const updatedLogs = [newLog, ...existingLogs];

    const payload = {
      id: editingCylinder ? editingCylinder.id : Date.now(),
      sku: sku.trim(),
      jobName: jobName.trim(),
      clientGroup: clientGroup.trim(),
      structure: structureSummary,
      layers,
      jobMasterId: editingCylinder ? (editingCylinder.jobMasterId || editingCylinder.id) : nextJmId,
      colorsCount: parseInt(colorsCount) || 1,
      rate: parseFloat(rate) || 1.6,
      ratePerSqInch: parseFloat(rate) || 1.6,
      costPerCylinder: `₹ ${parseInt(costPerCylinder || 0).toLocaleString()}`,
      cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
      engravuresName,
      costBorneBy,
      costBorneType,
      circumferenceMm: parseInt(circumferenceMm) || 400,
      faceLengthMm: parseInt(faceLengthMm) || 1050,
      printWidthMm: parseFloat(printWidthMm) || 1000,
      pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
      pouchHeight: parseFloat(pouchHeight) || 0,
      layer1PrintedQtyKg: parseFloat(layer1PrintedQtyKg) || 0,
      dispatchedQty: parseFloat(dispatchedQty) || 0,
      utilisationLimit: parseInt(utilisationLimit) || 10000,
      status,
      assignedPress: assignedPress || '',
      artworkUrl: artworkUrl || null,
      silLogo: silLogo || '',
      arcMark: arcMark || 'Yes',
      slittingMark: slittingMark || 'Yes',
      trackerLine: trackerLine || 'Yes',
      specialInstructions: specialInstructions || '',
      isLocked: editingCylinder ? Boolean(editingCylinder.isLocked) : false,
      lockedBy: editingCylinder ? (editingCylinder.lockedBy || '') : '',
      lockedAt: editingCylinder ? (editingCylinder.lockedAt || '') : '',
      changelogs: updatedLogs
    };

    if (editingCylinder) {
      if (onUpdateCylinder) onUpdateCylinder(payload);
    } else {
      if (onAddCylinder) onAddCylinder(payload);

      // Automatically create consequent product entry in Job Master Directory if enabled
      if (createJobMaster && onAddJobMaster) {
        const newJobMaster = {
          id: nextJmId,
          skuCode: sku.trim(),
          jobName: jobName.trim(),
          clientName: clientGroup.trim() || 'Standard Client',
          structure: structureSummary,
          printWidthMm: parseFloat(printWidthMm) || 1000,
          faceLengthMm: parseFloat(faceLengthMm) || 1050,
          repeatLengthMm: parseFloat(circumferenceMm) || 400,
          pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
          pouchHeight: parseFloat(pouchHeight) || 0,
          layers: layers,
          cylinderSku: sku.trim(),
          cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
          colorsCount: parseInt(colorsCount) || 6,
          engravuresName,
          costBorneBy,
          utilisationLimit: parseFloat(utilisationLimit) || 10000,
          artworkUrl: artworkUrl || null,
          silLogo: silLogo || '',
          arcMark: arcMark || 'Yes',
          slittingMark: slittingMark || 'Yes',
          trackerLine: trackerLine || 'Yes',
          specialInstructions: specialInstructions || '',
          creationDate: new Date().toISOString().split('T')[0]
        };
        onAddJobMaster(newJobMaster);
      }
    }

    setIsModalOpen(false);
    alert(`Rotogravure Cylinder Set "${jobName}" saved successfully!${!editingCylinder && createJobMaster ? ` Linked Job Master ${nextJmId} created.` : ''}`);
  };

  const handleDelete = (cyl) => {
    if (!canEditCylinders) {
      alert("⛔ Permission Denied: Only Admin and Plant Manager roles can delete cylinder sets.");
      return;
    }
    if (cyl.isLocked && !isAdminOrPlantManager) {
      alert("🔒 Cannot Delete: This cylinder set is LOCKED. Only Admin and Plant Manager can unlock or delete locked cylinders.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete Cylinder Set "${cyl.jobName}" (${cyl.sku})? This cannot be undone.`)) {
      if (onDeleteCylinder) {
        onDeleteCylinder(cyl.id);
      }
    }
  };

  // ==========================================
  // BULK UPLOAD CSV PARSER & CROSS-CHECK ENGINE
  // ==========================================

  const handleDownloadSampleCSV = () => {
    const headers = [
      "sku",
      "jobName",
      "clientGroup",
      "colorsCount",
      "printWidthMm",
      "faceLengthMm",
      "circumferenceMm",
      "structure",
      "cylinderCost",
      "engravuresName",
      "status"
    ];
    const rows = [
      ["CYL-2026-001", "500g Atta Pouch", "Amul Packaging", "6", "1050", "450", "450", "12µ PET / 12µ METPET / 30µ Natural LDPE", "28500", "Janata Engravers", "Active"],
      ["CYL-2026-002", "1kg Sugar Bag", "Fortune Foods", "5", "920", "520", "520", "12µ PET / 40µ LLDPE", "24000", "Pioneer Engravures", "Active"],
      ["CYL-2026-003", "250g Namkeen Foil", "Haldiram Snacks", "7", "850", "380", "380", "12µ PET / 7µ AL FOIL / 25µ CAST PP", "32000", "Calico Engraving", "Active"]
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Rotogravure_Cylinders_Sample_Samyak.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (text && typeof text === 'string') {
        processCsvRawText(text);
      }
    };
    reader.readAsText(file);
  };

  const processCsvRawText = (text) => {
    const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      alert("The selected CSV file appears to be empty.");
      return;
    }

    const headers = parseCsvLine(lines[0]);
    const rawRows = lines.slice(1).map(l => parseCsvLine(l)).filter(r => r.length > 0 && r.some(val => val !== ''));

    const initialMapping = autoMapHeaders(headers);

    setBulkParsedHeaders(headers);
    setBulkParsedRows(rawRows);
    setBulkHeaderMapping(initialMapping);
    setIsBulkModalOpen(true);
  };

  // Preview Jobs generated dynamically from CSV mapping
  const bulkPreviewJobs = useMemo(() => {
    if (!bulkParsedRows || bulkParsedRows.length === 0) return [];

    return bulkParsedRows.map((row, idx) => {
      const getValue = (key) => {
        const headerName = bulkHeaderMapping[key];
        if (!headerName) return '';
        const headerIdx = bulkParsedHeaders.indexOf(headerName);
        if (headerIdx < 0 || headerIdx >= row.length) return '';
        return row[headerIdx] || '';
      };

      const rawSku = getValue('sku');
      const rawJobName = getValue('jobName');
      const rawClient = getValue('clientGroup');
      const rawColors = getValue('colorsCount');
      const rawPrintWidth = getValue('printWidthMm');
      const rawFaceLength = getValue('faceLengthMm');
      const rawCircumference = getValue('circumferenceMm');
      const rawRate = getValue('rate');
      const rawEngraver = getValue('engravuresName');
      const rawCost = getValue('cylinderCost');
      const rawCostPerCyl = getValue('costPerCylinder');
      const rawCostBorneBy = getValue('costBorneBy');
      const rawStatus = getValue('status');
      const rawPress = getValue('assignedPress');
      const rawStructure = getValue('structure');

      const computedSku = rawSku || getNextCylinderSku(idx);
      const computedJobName = rawJobName || `Bulk Job #${idx + 1}`;
      const computedClient = rawClient || 'Standard Client';
      const computedColors = parseInt(rawColors) || 6;
      const computedWidth = parseFloat(rawPrintWidth) || 1000;
      const computedFace = parseFloat(rawFaceLength) || 1050;
      const computedCirc = parseFloat(rawCircumference) || 400;
      const computedRate = parseFloat(rawRate) || 1.6;
      const computedCost = rawCost ? `₹ ${parseInt(rawCost.replace(/\D/g, '')) || 0}` : `₹ ${Math.round((computedFace * computedCirc / 100) * computedRate * computedColors).toLocaleString()}`;
      const computedCostPerCyl = rawCostPerCyl ? `₹ ${parseInt(rawCostPerCyl.replace(/\D/g, '')) || 0}` : `₹ ${Math.round((computedFace * computedCirc / 100) * computedRate).toLocaleString()}`;

      let parsedLayers = [
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'Natural GP LD', micron: 35 }
      ];

      if (rawStructure) {
        const parts = rawStructure.split('/');
        parsedLayers = parts.map((p, i) => {
          const trimmed = p.trim();
          const mMatch = trimmed.match(/(\d+)\s*µ?/);
          const mic = mMatch ? parseInt(mMatch[1], 10) : 12;
          const ft = trimmed.replace(/\d+\s*µ?/, '').trim() || 'PET';
          return { id: i + 1, filmType: ft, micron: mic };
        });
      }

      const isValid = Boolean(computedSku && computedJobName);

      return {
        id: `CYL-BULK-${Date.now()}-${idx}`,
        sku: computedSku,
        jobName: computedJobName,
        clientGroup: computedClient,
        colorsCount: computedColors,
        printWidthMm: computedWidth,
        faceLengthMm: computedFace,
        circumferenceMm: computedCirc,
        rate: computedRate,
        ratePerSqInch: computedRate,
        engravuresName: rawEngraver || 'Janata Engravers',
        cylinderCost: computedCost,
        costPerCylinder: computedCostPerCyl,
        costBorneBy: rawCostBorneBy || 'Client (100%)',
        costBorneType: (rawCostBorneBy || '').includes('Us') ? 'us' : (rawCostBorneBy || '').includes('Both') ? 'both' : 'client',
        status: rawStatus || 'Active In-Use',
        assignedPress: rawPress || printingPresses[0] || '',
        structure: rawStructure || parsedLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / '),
        layers: parsedLayers,
        layer1PrintedQtyKg: 0,
        dispatchedQty: 0,
        utilisationLimit: 10000,
        artworkUrl: null,
        isLocked: false,
        lockedBy: '',
        lockedAt: '',
        changelogs: [createChangelogEntry('BULK_UPLOADED', `Imported via CSV Bulk Upload (${bulkCsvFileName || 'CSV'})`)],
        isValid
      };
    });
  }, [bulkParsedRows, bulkParsedHeaders, bulkHeaderMapping, bulkCsvFileName, printingPresses]);

  const handleConfirmBulkUpload = () => {
    if (bulkPreviewJobs.length === 0) {
      alert("No valid jobs to import.");
      return;
    }

    if (onBatchAddCylinders) {
      onBatchAddCylinders(bulkPreviewJobs);
    } else {
      bulkPreviewJobs.forEach(job => {
        if (onAddCylinder) onAddCylinder(job);
      });
    }

    // Auto-create consequent Job Master entries if toggle enabled
    if (bulkAutoCreateJobMasters) {
      const createdJms = bulkPreviewJobs.map((job, idx) => {
        const jmId = `JM-2026-${String((jobMasters ? jobMasters.length : 0) + 101 + idx).padStart(3, '0')}`;
        return {
          id: jmId,
          skuCode: job.sku,
          jobName: job.jobName,
          clientName: job.clientGroup,
          structure: job.structure,
          printWidthMm: job.printWidthMm,
          faceLengthMm: job.faceLengthMm,
          repeatLengthMm: job.circumferenceMm,
          layers: job.layers,
          cylinderSku: job.sku,
          cylinderCost: job.cylinderCost,
          colorsCount: job.colorsCount,
          engravuresName: job.engravuresName,
          costBorneBy: job.costBorneBy,
          utilisationLimit: job.utilisationLimit,
          artworkUrl: null,
          creationDate: new Date().toISOString().split('T')[0]
        };
      });

      if (onBatchAddJobMasters) {
        onBatchAddJobMasters(createdJms);
      } else if (onAddJobMaster) {
        createdJms.forEach(jm => onAddJobMaster(jm));
      }
    }

    setIsBulkModalOpen(false);
    alert(`✅ Bulk Upload Complete!\nSuccessfully imported ${bulkPreviewJobs.length} Rotogravure Cylinder set(s) into database.${bulkAutoCreateJobMasters ? ' Linked Job Master entries were also created.' : ''}\n\nNote: You can now manually upload Artwork Images for each job in the table.`);
  };

  const uniqueCylinders = useMemo(() => {
    const map = new Map();
    (cylinders || []).forEach(c => {
      if (!c) return;
      const skuKey = (c.sku || '').trim().toLowerCase();
      const nameKey = (c.jobName || '').trim().toLowerCase();
      const matchKey = skuKey || nameKey || String(c.id);

      if (!map.has(matchKey)) {
        map.set(matchKey, c);
      } else {
        const existing = map.get(matchKey);
        const isBetter = (c.updated_at && existing.updated_at && new Date(c.updated_at) > new Date(existing.updated_at)) ||
                         (c.approvedByHead && !existing.approvedByHead) ||
                         (c.artworkUrl && !existing.artworkUrl) ||
                         ((c.layers?.length || 0) > (existing.layers?.length || 0));
        if (isBetter) {
          map.set(matchKey, { ...existing, ...c });
        } else {
          map.set(matchKey, { ...c, ...existing });
        }
      }
    });
    return Array.from(map.values());
  }, [cylinders]);

  const filteredCylinders = uniqueCylinders.filter(c => 
    (c.sku && c.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.jobName && c.jobName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.clientGroup && c.clientGroup.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.engravuresName && c.engravuresName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={22} style={{ color: 'var(--primary-brand)' }} /> Rotogravure Cylinder Database & Utilisation Tracking
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Automated Cylinder Surface Area {isAdmin ? '& Cost Calculation' : 'Tracking'}, CSV Bulk Upload, Job Locking Control, and Audit Changelogs.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-control"
                style={{ paddingLeft: '36px' }}
                placeholder="Search SKU, job, or client..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {canEditCylinders && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', padding: '8px 14px' }}
                  onClick={handleDownloadSampleCSV}
                  title="Download Sample CSV Template for Rotogravure Cylinders"
                >
                  <Download size={16} style={{ color: '#047857' }} /> Sample CSV
                </button>
                <label 
                  className="btn-secondary" 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', padding: '8px 14px' }}
                  title="Bulk Upload Jobs from CSV file"
                >
                  <FileSpreadsheet size={16} style={{ color: '#047857' }} /> Bulk Upload Jobs (CSV)
                  <input 
                    type="file" 
                    accept=".csv,.txt" 
                    style={{ display: 'none' }} 
                    onChange={handleCsvFileUpload} 
                  />
                </label>
              </>
            )}

            {canEditCylinders ? (
              <button className="btn-primary" onClick={openAddModal}>
                <Plus size={16} /> Add New Cylinder Set
              </button>
            ) : (
              <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} /> View-Only Access ({userRole})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Cylinders Directory Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Active Printing Cylinders Directory
            <span style={{ fontSize: '0.78rem', background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
              Only Admin & Plant Manager Edit Access
            </span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredCylinders.length}</strong> cylinder sets
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU & Artwork</th>
                <th>Job Name & Colors</th>
                <th>Dimensions & Area</th>
                <th>Client Group</th>
                <th>{isAdmin ? 'Cost & Engraver' : 'Engraver'}</th>
                {isAdmin && <th>Cost Borne By</th>}
                <th>Wear Utilisation</th>
                <th>Lock & Status</th>
                <th>Assigned Press</th>
                <th>Actions & Audit Trail</th>
              </tr>
            </thead>
            <tbody>
              {filteredCylinders.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No cylinders found matching your search.
                  </td>
                </tr>
              ) : (
                filteredCylinders.map(c => {
                  const util = calculateUtilisation(c.dispatchedQty, c.utilisationLimit || 10000);
                  const isWarning = util >= 80;
                  const cCirc = c.circumferenceMm || 400;
                  const cFace = c.faceLengthMm || 1050;
                  const cUnits = Math.round((cCirc * cFace) / 100);
                  const isLocked = Boolean(c.isLocked);
                  const changelogCount = Array.isArray(c.changelogs) ? c.changelogs.length : 0;

                  return (
                    <tr key={c.id} style={isLocked ? { background: '#f8fafc' } : {}}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {c.artworkUrl ? (
                            <img 
                              src={c.artworkUrl} 
                              alt="Artwork" 
                              style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }} 
                              onClick={() => setActiveArtworkModal({ isOpen: true, url: c.artworkUrl, title: `${c.sku} - ${c.jobName}` })}
                              title="Click to view full artwork image"
                            />
                          ) : (
                            <label 
                              style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '6px', border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: canEditCylinders ? 'pointer' : 'default' }}
                              title={canEditCylinders ? "Click to upload Artwork Image post-bulk upload" : "No artwork uploaded"}
                            >
                              <ImageIcon size={16} />
                              <span style={{ fontSize: '0.58rem', marginTop: '1px', fontWeight: '700' }}>+ Image</span>
                              {canEditCylinders && (
                                <input 
                                  type="file" 
                                  accept="image/*,.pdf" 
                                  style={{ display: 'none' }} 
                                  onChange={e => handleInlineArtworkUpload(e, c)} 
                                />
                              )}
                            </label>
                          )}
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--primary-brand)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {c.sku}
                              {isLocked && <Lock size={12} style={{ color: '#d97706' }} title={`Locked by ${c.lockedBy || 'Admin'}`} />}
                            </div>
                            {c.artworkUrl ? (
                              <button 
                                type="button"
                                onClick={() => setActiveArtworkModal({ isOpen: true, url: c.artworkUrl, title: `${c.sku} - ${c.jobName}` })}
                                style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.7rem', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: '500' }}
                              >
                                View Artwork <ExternalLink size={10} />
                              </button>
                            ) : (
                              canEditCylinders && (
                                <label style={{ fontSize: '0.68rem', color: '#047857', cursor: 'pointer', fontWeight: '700', textDecoration: 'underline' }}>
                                  Upload Image
                                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => handleInlineArtworkUpload(e, c)} />
                                </label>
                              )
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{c.jobName}</div>
                        {(() => {
                          const linkedJm = (jobMasters || []).find(j => 
                            j.id === c.jobMasterId || 
                            (j.skuCode && c.sku && j.skuCode.trim().toLowerCase() === c.sku.trim().toLowerCase()) || 
                            (j.jobName && c.jobName && j.jobName.trim().toLowerCase() === c.jobName.trim().toLowerCase())
                          );
                          return (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                              <span className="badge badge-both" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                🎨 {c.colorsCount || 6} Colors
                              </span>
                              {linkedJm ? (
                                <span 
                                  style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: '700' }}
                                  title={`Linked to Job Master template ${linkedJm.skuCode || linkedJm.id}`}
                                >
                                  <Link size={10} /> Linked to JM ({linkedJm.skuCode || linkedJm.id})
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinkingCylinder(c);
                                    setLinkMode('EXISTING');
                                    setSelectedExistingJmId('');
                                  }}
                                  style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', cursor: 'pointer', fontWeight: '700' }}
                                  title="Click to resolve missing Job Master link or auto-create Job Master"
                                >
                                  <AlertTriangle size={10} /> ⚠️ Missing Job Master (Link)
                                </button>
                              )}
                              {c.structure && (
                                <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={c.structure}>
                                  {c.structure}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{cFace}L × {cCirc}C mm</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cUnits.toLocaleString()} sq. cm</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: '600' }}>{c.clientGroup || 'Standard'}</div>
                      </td>

                      <td>
                        {isAdmin && (
                          <>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{c.cylinderCost}</div>
                            {c.costPerCylinder && (
                              <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: '600' }}>
                                ({c.costPerCylinder} / cyl)
                              </div>
                            )}
                          </>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.engravuresName}</div>
                      </td>

                      {isAdmin && (
                        <td>
                          <span className={`badge badge-${c.costBorneType || 'client'}`}>{c.costBorneBy || 'Client (100%)'}</span>
                        </td>
                      )}

                      <td style={{ minWidth: '150px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{c.dispatchedQty}kg / {c.utilisationLimit || 10000}kg</span>
                          <span style={{ color: isWarning ? 'var(--warning)' : 'var(--success)', fontWeight: 'bold' }}>{util}%</span>
                        </div>
                        <div className="progress-container" style={{ marginTop: '4px' }}>
                          <div className={`progress-fill ${isWarning ? 'warning' : ''}`} style={{ width: `${util}%`, background: isWarning ? '#d97706' : '#0f172a' }}></div>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className={`badge ${c.status === 'Worn Out / Retouch Needed' ? 'badge-warning' : 'badge-us'}`} style={{ fontSize: '0.7rem' }}>
                            {c.status || 'Active In-Use'}
                          </span>
                          {isLocked ? (
                            <span 
                              style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                              title={c.lockedBy ? `Locked by ${c.lockedBy}` : 'Locked'}
                            >
                              🔒 Locked
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.68rem', color: '#64748b', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              🔓 Unlocked
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ maxWidth: '140px' }}>
                        {c.assignedPress ? (
                          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Printer size={12} />{c.assignedPress}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— Not Assigned —</span>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* LOCK / UNLOCK BUTTON (Admin & Plant Manager Only) */}
                          {isAdminOrPlantManager && (
                            <button 
                              className={`btn-secondary ${isLocked ? 'text-warning' : ''}`}
                              style={{ padding: '6px 8px', fontSize: '0.75rem' }} 
                              onClick={() => handleToggleLock(c)} 
                              title={isLocked ? "Unlock Cylinder Specifications" : "Lock Cylinder Specifications"}
                            >
                              {isLocked ? <Lock size={14} style={{ color: '#d97706' }} /> : <Unlock size={14} />}
                            </button>
                          )}

                          {/* EDIT SPECIFICATIONS */}
                          {canEditCylinders ? (
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '6px 8px', fontSize: '0.75rem', opacity: isLocked && !isAdminOrPlantManager ? 0.5 : 1 }} 
                              onClick={() => openEditModal(c)} 
                              title={isLocked ? "View Specs (Locked)" : "Edit Specifications"}
                            >
                              <Edit3 size={14} />
                            </button>
                          ) : null}

                          {/* VIEW PRINT JOB CARD */}
                          <button className="btn-secondary" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={() => setSelectedForPDF(c)} title="View / Print Job Card">
                            <Printer size={14} />
                          </button>

                          {/* VIEW CHANGELOGS / AUDIT HISTORY */}
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '6px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '700' }}
                            onClick={() => setChangelogCylinder(c)}
                            title="View Job Changelog History"
                          >
                            <History size={13} style={{ color: 'var(--primary-brand)' }} />
                            {changelogCount > 0 && <span>({changelogCount})</span>}
                          </button>

                          {/* DELETE CYLINDER */}
                          {canEditCylinders && (
                            <button 
                              className="btn-secondary text-danger" 
                              style={{ padding: '6px 8px', fontSize: '0.75rem', opacity: isLocked ? 0.4 : 1 }} 
                              onClick={() => handleDelete(c)}
                              title={isLocked ? "Cannot delete locked cylinder" : "Delete Cylinder Set"}
                              disabled={isLocked}
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
      </div>

      {/* ========================================== */}
      {/* BULK UPLOAD CSV & CROSS-CHECK MODAL         */}
      {/* ========================================== */}
      {isBulkModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBulkModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '1000px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, color: 'var(--text-primary)' }}>
                  <FileSpreadsheet size={24} style={{ color: '#047857' }} /> Bulk Upload Cylinder Jobs (CSV Cross-Check)
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '4px 0 0 0' }}>
                  Verify column header mapping and preview parsed job records before batch ingestion.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDownloadSampleCSV}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  <Download size={14} style={{ color: '#047857' }} /> Download Sample CSV
                </button>
                <button type="button" className="btn-icon" onClick={() => setIsBulkModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* STEP 1: HEADER MAPPING CROSS-CHECK */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} style={{ color: '#047857' }} /> 1. Cross-Check Column Header Mapping
              </h4>
              <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '14px' }}>
                Select which column from your CSV maps to each Rotogravure Cylinder schema field:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {TARGET_SCHEMA_FIELDS.map(field => (
                  <div key={field.key} style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: field.required ? '#b91c1c' : '#334155', display: 'block', marginBottom: '4px' }}>
                      {field.label} {field.required && '*'}
                    </label>
                    <select 
                      className="form-control" 
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      value={bulkHeaderMapping[field.key] || ''}
                      onChange={e => setBulkHeaderMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">-- Do Not Map --</option>
                      {bulkParsedHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* STEP 2: DATA PREVIEW TABLE */}
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  2. Parsed Job Records Preview ({bulkPreviewJobs.length} Rows)
                </h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: '700', color: '#047857', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={bulkAutoCreateJobMasters} 
                    onChange={e => setBulkAutoCreateJobMasters(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#047857' }}
                  />
                  Auto-Create Consequent Entries in Job Master Directory
                </label>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '320px' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>SKU Code</th>
                      <th>Job Name</th>
                      <th>Client Group</th>
                      <th>Colors</th>
                      <th>Dimensions (Face × Rep)</th>
                      <th>Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreviewJobs.map((job, idx) => (
                      <tr key={idx} style={{ background: job.isValid ? 'transparent' : '#fef2f2' }}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{job.sku}</td>
                        <td style={{ fontWeight: '700' }}>{job.jobName}</td>
                        <td>{job.clientGroup}</td>
                        <td>🎨 {job.colorsCount} C</td>
                        <td>{job.faceLengthMm}L × {job.circumferenceMm}C mm</td>
                        <td style={{ fontWeight: '700' }}>{job.cylinderCost}</td>
                        <td>
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Ready to Import</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                💡 <b>Post-Upload Note:</b> Job specifications will be imported immediately. Artwork Images can be uploaded manually for each job post-upload.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsBulkModalOpen(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleConfirmBulkUpload}>
                  <CheckCircle2 size={16} /> Confirm & Ingest {bulkPreviewJobs.length} Job(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* JOB CHANGELOG & AUDIT TRAIL MODAL          */}
      {/* ========================================== */}
      {changelogCylinder && (
        <div className="modal-overlay" onClick={() => setChangelogCylinder(null)}>
          <div className="glass-card modal-content" style={{ width: '680px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, color: 'var(--text-primary)' }}>
                  <History size={22} style={{ color: 'var(--primary-brand)' }} /> Job Changelog & Revision History
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  SKU: <strong style={{ color: 'var(--primary-brand)' }}>{changelogCylinder.sku}</strong> | Job: <strong>{changelogCylinder.jobName}</strong>
                </div>
              </div>
              <button type="button" className="btn-icon" onClick={() => setChangelogCylinder(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {(!changelogCylinder.changelogs || changelogCylinder.changelogs.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '0.85rem' }}>
                  <Clock size={32} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                  <div>No historical change logs recorded for this cylinder set yet.</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>All future edits, locks, unlocks, and artwork updates will be tracked here.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {changelogCylinder.changelogs.map((log, idx) => (
                    <div key={log.id || idx} style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: log.action === 'LOCKED' ? '#d97706' : log.action === 'CREATED' ? '#047857' : log.action === 'BULK_UPLOADED' ? '#2563eb' : '#64748b', marginTop: '5px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          <span className={`badge ${log.action === 'LOCKED' ? 'badge-warning' : log.action === 'CREATED' ? 'badge-success' : 'badge-us'}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            {log.action}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} /> {new Date(log.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.84rem', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>
                          {log.details}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                          By <strong>{log.user || 'Authorized User'}</strong> ({log.role || 'User'})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn-secondary" onClick={() => setChangelogCylinder(null)}>Close Timeline</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Cylinder Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '850px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
                  <Layers size={22} style={{ color: 'var(--primary-brand)' }} /> {editingCylinder ? 'Edit Cylinder Set Specifications' : 'Add New Rotogravure Cylinder Set'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '4px 0 0 0' }}>
                  Configure cylinder technical parameters, substrate layers, cost calculations, and production tracking.
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCylinder} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '12px' }}>
              
              {/* SECTION 1: BASIC CYLINDER & JOB SPECIFICATIONS */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  1. Basic Cylinder & Job Information
                </h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0, fontWeight: '700' }}>Cylinder SKU Code *</label>
                      {!editingCylinder && (
                        <button 
                          type="button" 
                          onClick={() => setSku(getNextCylinderSku())}
                          style={{ background: 'none', border: 'none', color: 'var(--primary-brand)', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', padding: 0 }}
                          title="Generate Next Sequence Number"
                        >
                          ⚡ Auto Next Serial
                        </button>
                      )}
                    </div>
                    <input 
                      type="text" 
                      className="form-control" 
                      required 
                      value={sku} 
                      onChange={e => setSku(e.target.value)} 
                      style={isSkuDuplicate ? { borderColor: '#ef4444', background: '#fef2f2' } : {}}
                      placeholder="e.g. SKU-CYL-001"
                    />
                    {isSkuDuplicate && (
                      <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: '700', marginTop: '2px' }}>
                        ⚠️ SKU Code "{sku}" already exists for another cylinder set.
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Job / Brand Name *</label>
                    <input type="text" className="form-control" required placeholder="e.g. Britannia Bourbon 250g" value={jobName} onChange={e => setJobName(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0, fontWeight: '700' }}>Client Group / Company *</label>
                      <button 
                        type="button" 
                        onClick={() => setIsOnboardClientModalOpen(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary-brand)', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <Plus size={12} /> Add New Client
                      </button>
                    </div>
                    <select 
                      className="form-control" 
                      required 
                      value={clientGroup} 
                      onChange={e => setClientGroup(e.target.value)}
                    >
                      <option value="">-- Select Client from Directory --</option>
                      {allClientOptions.map(c => (
                        <option key={c.name} value={c.name}>{c.name} {c.gstin ? `(GST: ${c.gstin})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Number of Printing Colors (Cylinders) *</label>
                    <input type="number" className="form-control" required min="1" max="12" value={colorsCount} onChange={e => setColorsCount(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: '700' }}>Print Width (PET Size) (mm) *</span>
                      <span style={{ fontSize: '0.72rem', color: '#047857' }}>Always used for material ordering</span>
                    </label>
                    <input type="number" className="form-control" required value={printWidthMm} onChange={e => setPrintWidthMm(e.target.value)} placeholder="e.g. 1000" />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: '700' }}>Face Length (Shell) (mm) *</span>
                      <span style={{ fontSize: '0.72rem', color: '#2563eb' }}>For records & cylinder costing only</span>
                    </label>
                    <input type="number" className="form-control" required value={faceLengthMm} onChange={e => setFaceLengthMm(e.target.value)} placeholder="e.g. 1050" />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Cylinder Circumference (mm) *</label>
                    <input type="number" className="form-control" required value={circumferenceMm} onChange={e => setCircumferenceMm(e.target.value)} placeholder="e.g. 400" />
                  </div>
                </div>
              </div>

              {/* SECTION 2: ENGRAVING & COMMERCIAL COSTING (ADMIN ONLY) */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calculator size={16} style={{ color: 'var(--primary-brand)' }} /> 2. Engraving & Commercial Costing
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '14px', marginBottom: isAdmin ? '14px' : '0' }}>
                  <div className="form-group">
                    <label>Engraver Name</label>
                    <input type="text" className="form-control" value={engravuresName} onChange={e => setEngravuresName(e.target.value)} />
                  </div>

                  {isAdmin && (
                    <div className="form-group">
                      <label>Cost Borne By</label>
                      <select className="form-control" value={costBorneBy} onChange={e => {
                        setCostBorneBy(e.target.value);
                        if (e.target.value.includes('Client')) setCostBorneType('client');
                        else if (e.target.value.includes('Us')) setCostBorneType('us');
                        else setCostBorneType('both');
                      }}>
                        <option value="Client (100%)">Client (100%)</option>
                        <option value="Us (100%)">Us / Samyak (100%)</option>
                        <option value="Both (50/50)">Both (50/50)</option>
                      </select>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                        Automated Cost Calculator (Formula Engine)
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={autoCalculateCost} 
                          onChange={e => setAutoCalculateCost(e.target.checked)} 
                        />
                        Auto-Calculate from Dimensions
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Surface Area</div>
                        <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a', marginTop: '4px' }}>{billingAreaUnits.toLocaleString()} sq. cm</div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>({faceLengthMm} × {circumferenceMm} ÷ 100)</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Cylinder Rate (₹/sq cm)</div>
                        <input 
                          type="number" 
                          step="0.01"
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginTop: '4px' }}
                          value={rate} 
                          onChange={e => setRate(e.target.value)} 
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Cost / Cylinder (₹)</div>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginTop: '4px', fontWeight: '700', color: '#047857' }}
                          value={costPerCylinder} 
                          onChange={e => {
                            setCostPerCylinder(e.target.value);
                            setAutoCalculateCost(false);
                          }} 
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Total Set Cost ({colorsCount} Cyls)</div>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginTop: '4px', fontWeight: '800', color: '#1e3a8a' }}
                          value={cylinderCost} 
                          onChange={e => {
                            setCylinderCost(e.target.value);
                            setAutoCalculateCost(false);
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: PRODUCT STRUCTURE & JOB MASTER INTEGRATION */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileCode size={16} style={{ color: 'var(--primary-brand)' }} /> 3. Product Substrate Structure (Laminate Layers) *
                    </h4>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      Summary: <code style={{ fontWeight: '700', color: '#0f172a' }}>{layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')}</code>
                    </div>
                  </div>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={addLayer}>
                    <Plus size={14} /> Add Substrate Layer
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {layers.map((l, idx) => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 36px', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569' }}>Layer {idx + 1}</span>
                      <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={l.filmType} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, filmType: e.target.value } : item))}>
                        {availableFilmTypes.map(filmKey => <option key={filmKey} value={filmKey}>{filmKey} ({FILM_DENSITIES[filmKey]} g/cc)</option>)}
                      </select>
                      <input type="number" className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={l.micron} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, micron: parseFloat(e.target.value) || 0 } : item))} placeholder="Microns (µ)" />
                      {layers.length > 1 && <button type="button" className="btn-secondary text-danger" style={{ padding: '6px' }} onClick={() => removeLayer(l.id)} title="Remove Layer"><X size={14} /></button>}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Pouch Open Width (mm)</label>
                    <input type="number" className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={pouchOpenWidth} onChange={e => setPouchOpenWidth(e.target.value)} placeholder="e.g. 240" />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Pouch Height (mm)</label>
                    <input type="number" className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={pouchHeight} onChange={e => setPouchHeight(e.target.value)} placeholder="e.g. 350" />
                  </div>
                </div>

                {!editingCylinder && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', color: '#047857' }}>
                      <input 
                        type="checkbox" 
                        checked={createJobMaster} 
                        onChange={e => setCreateJobMaster(e.target.checked)} 
                        style={{ width: '16px', height: '16px', accentColor: '#047857' }}
                      />
                      Auto-Create Product in Job Master Directory
                    </label>
                    {createJobMaster && (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                        Consequent ID: JM-2026-{String((jobMasters ? jobMasters.length : 0) + 101).padStart(3, '0')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 4: PRESS MARKS & QUALITY GUIDELINES */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  4. Press Marks & Quality Guidelines
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>SIL Logo / Press Line</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                      value={silLogo} 
                      onChange={e => setSilLogo(e.target.value)} 
                      placeholder="e.g. Yes - 'Pkg Material Mfg by - Samyak International Ltd'" 
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>ARC Mark</label>
                    <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={arcMark} onChange={e => setArcMark(e.target.value)}>
                      <option value="Yes">Yes (Standard)</option>
                      <option value="Yes (Both Edges)">Yes (Both Edges)</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Slitting Mark</label>
                    <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={slittingMark} onChange={e => setSlittingMark(e.target.value)}>
                      <option value="Yes">Yes (Standard)</option>
                      <option value="1.5mm Dashed">1.5mm Dashed</option>
                      <option value="Continuous Solid Line">Continuous Solid Line</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Tracker Line</label>
                    <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={trackerLine} onChange={e => setTrackerLine(e.target.value)}>
                      <option value="Yes">Yes (Standard)</option>
                      <option value="Continuous 1mm">Continuous 1mm</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Special Quality Guidelines / Operator Instructions</label>
                    <textarea 
                      className="form-control" 
                      rows="2" 
                      style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                      value={specialInstructions} 
                      onChange={e => setSpecialInstructions(e.target.value)} 
                      placeholder="e.g. Core 76mm ID. Winding direction: Face Out. Maintain solvent retention < 5 mg/m²." 
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 5: ARTWORK & MEDIA */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  5. Artwork Proof & Keyline Drawing
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {artworkUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img 
                        src={artworkUrl} 
                        alt="Artwork Preview" 
                        style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }} 
                        onClick={() => setActiveArtworkModal({ isOpen: true, url: artworkUrl, title: `${sku || 'Cylinder'} Artwork` })}
                        title="Click to view full image"
                      />
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={14} /> Artwork Stored
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setActiveArtworkModal({ isOpen: true, url: artworkUrl, title: `${sku || 'Cylinder'} Artwork` })}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          View Full Artwork
                        </button>
                        <button type="button" style={{ display: 'block', fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '2px' }} onClick={() => setArtworkUrl('')}>
                          Remove Artwork
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ImageIcon size={20} /> No artwork uploaded yet.
                    </div>
                  )}

                  <div style={{ marginLeft: 'auto' }}>
                    <label className="btn-secondary" style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                      <UploadCloud size={14} /> {isUploading ? 'Uploading to Supabase...' : 'Upload Artwork File'}
                      <input 
                        type="file" 
                        accept="image/*,.pdf" 
                        style={{ display: 'none' }} 
                        disabled={isUploading}
                        onChange={handleArtworkUpload} 
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION 6: PRODUCTION & WEAR TRACKING */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  6. Wear Life Limits & Station Assignment
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label>Assigned Printing Press</label>
                    <select className="form-control" value={assignedPress} onChange={e => setAssignedPress(e.target.value)}>
                      <option value="">— Not Assigned —</option>
                      {printingPresses.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Cylinder Operational Status</label>
                    <select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
                      <option value="Active In-Use">Active In-Use</option>
                      <option value="Under Engraving">Under Engraving / Chroming</option>
                      <option value="Worn Out / Retouch Needed">Worn Out / Retouch Needed</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Layer 1 Printing Substrate Qty (Kg)</label>
                    <input type="number" className="form-control" value={layer1PrintedQtyKg} onChange={e => setLayer1PrintedQtyKg(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label>Total Dispatched Printed Qty (Kg)</label>
                    <input type="number" className="form-control" value={dispatchedQty} onChange={e => setDispatchedQty(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Max Utilisation Life Limit (Kg)</label>
                    <input type="number" className="form-control" value={utilisationLimit} onChange={e => setUtilisationLimit(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* FOOTER ACTIONS */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> {editingCylinder ? 'Save Changes' : 'Save Cylinder Set'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Job Card PDF Modal */}
      {selectedForPDF && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal-toolbar no-print">
            <button className="btn-secondary" onClick={() => setSelectedForPDF(null)}>
              Close Job Card
            </button>
          </div>
          <div className="pdf-paper-container landscape" style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', maxWidth: '1200px', width: '95vw', overflowY: 'auto' }}>
            <CylinderJobCardForm 
              initialData={selectedForPDF} 
              jobMasters={jobMasters}
              cylinders={cylinders}
              currentUser={currentUser}
              onClose={() => setSelectedForPDF(null)} 
              onSave={(updated, targetJobMaster, targetCylinder) => {
                const printWidthNum = Number(String(updated.printWidth || updated.totalWidth).replace(/\D/g, '')) || selectedForPDF.printWidthMm || 1000;
                const faceLengthNum = Number(String(updated.faceLength || updated.totalWidth).replace(/\D/g, '')) || selectedForPDF.faceLengthMm || 1050;
                const repeatLengthNum = Number(String(updated.totalHeight).replace(/\D/g, '')) || selectedForPDF.circumferenceMm || 400;

                const newLog = createChangelogEntry('UPDATED', 'Specifications updated via Job Card Editor');
                const existingLogs = Array.isArray(selectedForPDF.changelogs) ? selectedForPDF.changelogs : [];

                const fullUpdatedCyl = {
                  ...selectedForPDF,
                  ...(targetCylinder || {}),
                  sku: updated.skuCode || updated.sku || selectedForPDF.sku,
                  jobName: updated.jobName || selectedForPDF.jobName,
                  cylinderCost: updated.cylinderCost || selectedForPDF.cylinderCost,
                  costPerCylinder: updated.costPerCylinder || selectedForPDF.costPerCylinder,
                  ratePerSqInch: updated.ratePerSqInch || selectedForPDF.ratePerSqInch,
                  engravuresName: updated.engravure || selectedForPDF.engravuresName || '',
                  costBorneBy: updated.costBorneBy || selectedForPDF.costBorneBy,
                  clientGroup: updated.partyName || selectedForPDF.clientGroup,
                  colorsCount: parseInt(updated.numberOfCylinders) || selectedForPDF.colorsCount || 6,
                  printWidthMm: printWidthNum,
                  faceLengthMm: faceLengthNum,
                  circumferenceMm: repeatLengthNum,
                  pouchOpenWidth: Number(String(updated.pouchOpenWidth).replace(/\D/g, '')) || selectedForPDF.pouchOpenWidth || 0,
                  pouchHeight: Number(String(updated.pouchHeight).replace(/\D/g, '')) || selectedForPDF.pouchHeight || 0,
                  layers: updated.layers || selectedForPDF.layers,
                  structure: updated.jobStructure || selectedForPDF.structure,
                  artworkUrl: updated.artworkUrl || selectedForPDF.artworkUrl,
                  jobCardFileUrl: updated.artworkUrl || selectedForPDF.jobCardFileUrl,
                  jobCardFileName: updated.artworkUrl ? 'Artwork_KLD_Proof.pdf' : '',
                  silLogo: updated.silLogo || selectedForPDF.silLogo,
                  arcMark: updated.arcMark || selectedForPDF.arcMark,
                  slittingMark: updated.slittingMark || selectedForPDF.slittingMark,
                  trackerLine: updated.trackerLine || selectedForPDF.trackerLine,
                  specialInstructions: updated.specialInstructions || selectedForPDF.specialInstructions,
                  chkEyemark: updated.chkEyemark ?? selectedForPDF.chkEyemark,
                  chkBarcode: updated.chkBarcode ?? selectedForPDF.chkBarcode,
                  chkOrientation: updated.chkOrientation ?? selectedForPDF.chkOrientation,
                  chkClientApproval: updated.chkClientApproval ?? selectedForPDF.chkClientApproval,
                  approvedByHead: updated.approvedByHead ?? selectedForPDF.approvedByHead,
                  approvedHeadName: updated.approvedHeadName || selectedForPDF.approvedHeadName,
                  approvedHeadDate: updated.approvedHeadDate || selectedForPDF.approvedHeadDate,
                  variant: updated.variant || selectedForPDF.variant,
                  printing: updated.printing || selectedForPDF.printing,
                  invoiceTo: updated.invoiceTo || selectedForPDF.invoiceTo,
                  shellSize: updated.shellSize || selectedForPDF.shellSize,
                  petSize: updated.petSize || selectedForPDF.petSize,
                  changelogs: [newLog, ...existingLogs]
                };

                if (onUpdateCylinder) {
                  onUpdateCylinder(fullUpdatedCyl);
                }
                setSelectedForPDF(fullUpdatedCyl);

                if (targetJobMaster) {
                  if (onUpdateJobMaster) onUpdateJobMaster(targetJobMaster);
                  else if (onAddJobMaster) onAddJobMaster(targetJobMaster);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* QUICK CLIENT ONBOARDING MODAL */}
      {isOnboardClientModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setIsOnboardClientModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '540px', maxWidth: '95vw', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
                <Building2 size={20} style={{ color: 'var(--primary-brand)' }} /> Quick Onboard New Client
              </h3>
              <button type="button" className="btn-icon" onClick={() => setIsOnboardClientModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickOnboardClientSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label style={{ fontWeight: '700' }}>Company / Client Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    placeholder="e.g. Britannia Industries Ltd"
                    value={newClientName} 
                    onChange={e => setNewClientName(e.target.value)} 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input type="text" className="form-control" placeholder="Key contact" value={newContactPerson} onChange={e => setNewContactPerson(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="text" className="form-control" placeholder="10-digit mobile" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>GSTIN Number</label>
                    <input type="text" className="form-control" placeholder="23AAAC..." value={newGstin} onChange={e => setNewGstin(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" className="form-control" placeholder="purchase@client.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsOnboardClientModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <Check size={16} /> Save & Select Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INTERACTIVE LINK / CREATE JOB MASTER MODAL */}
      {linkingCylinder && (
        <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={() => setLinkingCylinder(null)}>
          <div className="glass-card modal-content" style={{ width: '600px', maxWidth: '95vw', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
                  <Link size={20} style={{ color: 'var(--primary-brand)' }} /> Link Rotogravure Cylinder to Job Master
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                  Target Cylinder SKU: <strong style={{ color: 'var(--primary-brand)' }}>{linkingCylinder.sku}</strong> | Job: <strong>{linkingCylinder.jobName}</strong>
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setLinkingCylinder(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                type="button"
                className={linkMode === 'EXISTING' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, fontSize: '0.85rem', padding: '8px' }}
                onClick={() => setLinkMode('EXISTING')}
              >
                <Link size={14} /> Link to Existing Job Master
              </button>
              <button
                type="button"
                className={linkMode === 'CREATE_NEW' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, fontSize: '0.85rem', padding: '8px' }}
                onClick={() => setLinkMode('CREATE_NEW')}
              >
                <Plus size={14} /> Create New & Link
              </button>
            </div>

            {linkMode === 'EXISTING' ? (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontWeight: '700', fontSize: '0.88rem', display: 'block', marginBottom: '6px' }}>
                  Select Existing Job Master Record:
                </label>
                <select
                  className="form-control"
                  value={selectedExistingJmId}
                  onChange={e => setSelectedExistingJmId(e.target.value)}
                  style={{ width: '100%', padding: '10px' }}
                >
                  <option value="">— Select Job Master —</option>
                  {(jobMasters || []).map(j => (
                    <option key={j.id} value={j.id}>
                      {j.skuCode || j.id} — {j.jobName} ({j.clientName})
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setLinkingCylinder(null)}>Cancel</button>
                  <button type="button" className="btn-primary" onClick={handleConfirmLinkToExistingJm} disabled={!selectedExistingJmId}>
                    <CheckCircle2 size={16} /> Link Selected Record
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '12px' }}>
                  A new Job Master record will be automatically generated with parameters pre-filled from Cylinder <strong>{linkingCylinder.sku}</strong>:
                </div>
                <div style={{ fontSize: '0.8rem', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  <div><strong>Job Name:</strong> {linkingCylinder.jobName}</div>
                  <div><strong>Client:</strong> {linkingCylinder.clientGroup || 'Standard'}</div>
                  <div><strong>Dimensions:</strong> {linkingCylinder.faceLengthMm || 1050}L × {linkingCylinder.circumferenceMm || 400}C mm</div>
                  <div><strong>Colors:</strong> {linkingCylinder.colorsCount || 6} Colors</div>
                  <div style={{ gridColumn: 'span 2' }}><strong>Structure:</strong> {linkingCylinder.structure || '—'}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setLinkingCylinder(null)}>Cancel</button>
                  <button type="button" className="btn-primary" onClick={handleCreateNewJmAndLink}>
                    <Plus size={16} /> Create & Save to Supabase Table
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-App Artwork Lightbox Modal */}
      <ArtworkModal
        isOpen={activeArtworkModal.isOpen}
        onClose={() => setActiveArtworkModal({ isOpen: false, url: '', title: '' })}
        artworkUrl={activeArtworkModal.url}
        title={activeArtworkModal.title}
        onReupload={() => {
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
