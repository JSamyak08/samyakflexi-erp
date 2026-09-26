import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  UserCheck, 
  Calculator, 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft,
  FileCheck,
  Search,
  Filter,
  DollarSign,
  Tag,
  Scale,
  Barcode,
  Printer,
  Play,
  Scan,
  Lock,
  X
} from 'lucide-react';
import WeighingScaleInput from './WeighingScaleInput';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import BarcodePrinterModal from './BarcodePrinterModal';
import CylinderJobCardForm from '../CylinderJobCardForm';
import SFGFGEntryModal from './SFGFGEntryModal';
import { DEFAULT_DAILY_RATES, generateBarcodeId, calculateJobRawMaterials, calculatePreVsPostCosting } from '../factoryStore';
import { notifyProductionRecordSubmitted, notifyProductionRecordApproved, notifyOverWastageAlert } from '../services/emailService';
import { pushSlugState } from '../utils/slugRouter';
import TablePagination, { usePagination } from './TablePagination';

export default function ProductionRecordManagement({
  urlParams = {},
  productionRecords = [],
  orders = [],
  inventory = [],
  inventoryRolls = [],
  jobMasters = [],
  cylinders = [],
  machines = [],
  currentUser,
  storeIssueTransactions = [],
  onSaveProductionRecord,
  onApproveProductionRecord,
  onUpdateJobMaster,
  onUpdateCylinder,
  onAddRoll
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const isPlantManager = currentUser?.role === 'Plant Manager' || currentUser?.role === 'Admin' || currentUser?.role === 'Production Manager';
  const isAdmin = currentUser?.role === 'Admin';

  const [activeTab, setActiveTab] = useState('punched_jobs'); // 'punched_jobs', 'list', 'new_record', 'job_cards'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [activeJobCardData, setActiveJobCardData] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  // Form State for creating/editing a Production Record
  const [selectedOrder, setSelectedOrder] = useState(orders[0] || null);

  const [materialsList, setMaterialsList] = useState([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedRollForBarcodeModal, setSelectedRollForBarcodeModal] = useState(null);

  // SFG & FG Master Rolls Modal State
  const [isSfgFgModalOpen, setIsSfgFgModalOpen] = useState(false);
  const [sfgFgModalMode, setSfgFgModalMode] = useState('SFG'); // 'SFG' | 'FG'

  // Processing Cost Per Kg (Default from Settings: ₹ 25/kg)
  const [processingCostPerKg, setProcessingCostPerKg] = useState(25);

  // Stage-wise Production Quantities & Consumables (7 Stages)
  const [qtyFirstPassL1, setQtyFirstPassL1] = useState(0); // Stage 1: Printing Output (kg)
  const [qtyInspection, setQtyInspection] = useState(0); // Stage 2: Printing Inspection Output (kg)
  const [qtyLaminationL1, setQtyLaminationL1] = useState(0); // Stage 3: First Pass L1 Output (kg)
  const [adhesiveConsumedL1Kg, setAdhesiveConsumedL1Kg] = useState(0); // Stage 3: Adhesive Consumed (kg)
  const [qtySecondPassL2, setQtySecondPassL2] = useState(0); // Stage 4: Second Pass L2 Output (kg)
  const [laminationPlainSubstrateWastageL2Kg, setLaminationPlainSubstrateWastageL2Kg] = useState(0); // Stage 4: Lamination Scrap Pass 2 (kg)
  const [adhesiveConsumedL2Kg, setAdhesiveConsumedL2Kg] = useState(0); // Stage 4: Adhesive Consumed Pass 2 (kg)
  const [qtySlitting, setQtySlitting] = useState(0); // Stage 5: Slitting Finished Output (kg)
  const [paperCoreConsumedKg, setPaperCoreConsumedKg] = useState(0); // Stage 5: Paper Core Consumed
  const [qtyPouching, setQtyPouching] = useState(0); // Stage 6: Pouching Finished Output (kg / Pcs)
  const [zipperConsumedKg, setZipperConsumedKg] = useState(0); // Stage 6: Zipper Quantity Consumed
  const [pouchingScrapKg, setPouchingScrapKg] = useState(0); // Stage 6: Pouching Scrap (kg)
  const [qtyDispatch, setQtyDispatch] = useState(0); // Stage 7: Final Dispatch Ready Quantity (kg)

  // Stage-wise Scrap & Wastage Breakdown fields (in kg) — Clean 0 defaults for data entry
  const [printingPlainSettingWastageKg, setPrintingPlainSettingWastageKg] = useState(0);
  const [printingWastageKg, setPrintingWastageKg] = useState(0);
  const [laminationPlainSubstrateWastageKg, setLaminationPlainSubstrateWastageKg] = useState(0);
  const [printedWastageKg, setPrintedWastageKg] = useState(0);
  const [laminateWastageKg, setLaminateWastageKg] = useState(0);
  const [trimWastageKg, setTrimWastageKg] = useState(0);

  // Target & Actual Ink / Adhesive GSM fields
  const [actualInkGsm, setActualInkGsm] = useState('');
  const [actualAdhesiveGsm, setActualAdhesiveGsm] = useState('');
  const [targetInkGsm, setTargetInkGsm] = useState('1.5');
  const [targetAdhesiveGsm, setTargetAdhesiveGsm] = useState('1.5');

  // Helper to open 'Start Production' for a specific punched job/order — pulls actual store issues & Job Master
  const handleStartProductionForOrder = (ord) => {
    setSelectedOrder(ord);

    const linkedJm = (jobMasters || []).find(j => 
      j.id === ord.jobMasterId || (j.jobName || '').toLowerCase().trim() === (ord.jobName || '').toLowerCase().trim()
    );
    const defaultTargetInk = linkedJm?.inkGsm || ord?.inkGsm || 1.5;
    const defaultTargetAdhesive = linkedJm?.adhesiveGsm || ord?.adhesiveGsm || 1.5;

    // 1. Check if an existing production record already exists for this order/job
    const existingRec = (productionRecords || []).find(r => 
      r.orderId === ord.id || (r.jobName && r.jobName.trim().toLowerCase() === (ord.jobName || '').trim().toLowerCase())
    );

    if (existingRec) {
      setSelectedRecord(existingRec);
      setMaterialsList(Array.isArray(existingRec.materialsList) ? existingRec.materialsList : []);
      setQtyFirstPassL1(existingRec.qtyFirstPassL1 || existingRec.qtyPrinting || 0);
      setQtyInspection(existingRec.qtyInspection || 0);
      setQtyLaminationL1(existingRec.qtyLaminationL1 || 0);
      setAdhesiveConsumedL1Kg(existingRec.adhesiveConsumedL1Kg || 0);
      setQtySecondPassL2(existingRec.qtySecondPassL2 || 0);
      setLaminationPlainSubstrateWastageL2Kg(existingRec.laminationPlainSubstrateWastageL2Kg || 0);
      setAdhesiveConsumedL2Kg(existingRec.adhesiveConsumedL2Kg || 0);
      setQtySlitting(existingRec.qtySlitting || 0);
      setPaperCoreConsumedKg(existingRec.paperCoreConsumedKg || 0);
      setQtyPouching(existingRec.qtyPouching || 0);
      setZipperConsumedKg(existingRec.zipperConsumedKg || 0);
      setPouchingScrapKg(existingRec.pouchingScrapKg || 0);
      setQtyDispatch(existingRec.qtyDispatch || 0);
      setProcessingCostPerKg(existingRec.processingCostPerKg || 25);
      setPrintingPlainSettingWastageKg(existingRec.printingPlainSettingWastageKg || 0);
      setPrintingWastageKg(existingRec.printingWastageKg || 0);
      setLaminationPlainSubstrateWastageKg(existingRec.laminationPlainSubstrateWastageKg || 0);
      setPrintedWastageKg(existingRec.printedWastageKg || 0);
      setLaminateWastageKg(existingRec.laminateWastageKg || 0);
      setTrimWastageKg(existingRec.trimWastageKg || 0);
      setRecordNotes(existingRec.notes || '');

      setActualInkGsm(existingRec.actualInkGsm !== undefined && existingRec.actualInkGsm !== null ? String(existingRec.actualInkGsm) : (existingRec.inkGsmInSpeed ? String(existingRec.inkGsmInSpeed) : ''));
      setActualAdhesiveGsm(existingRec.actualAdhesiveGsm !== undefined && existingRec.actualAdhesiveGsm !== null ? String(existingRec.actualAdhesiveGsm) : '');
      setTargetInkGsm(String(existingRec.targetInkGsm || existingRec.inkGsm || defaultTargetInk));
      setTargetAdhesiveGsm(String(existingRec.targetAdhesiveGsm || existingRec.adhesiveGsm || defaultTargetAdhesive));

      setActiveTab('new_record');
      pushSlugState('production_records', { id: existingRec.id, tab: 'list' });
      return;
    }

    setSelectedRecord(null);

    // 2. Check if materials have already been issued / returned from Store for this job
    const jobTxList = (storeIssueTransactions || []).filter(tx => 
      (tx.jobName && tx.jobName.trim().toLowerCase() === (ord.jobName || '').trim().toLowerCase())
    );

    if (jobTxList.length > 0) {
      const matMap = new Map();
      jobTxList.forEach(tx => {
        const key = tx.itemId || tx.itemName || tx.filmType;
        const rate = parseFloat(tx.unitPrice) || 0;
        const isIssue = tx.issueType === 'issue';
        const qty = parseFloat(tx.qtyKg) || 0;

        if (matMap.has(key)) {
          const entry = matMap.get(key);
          if (isIssue) entry.issueQtyKg += qty;
          else entry.returnQtyKg += qty;
          entry.netConsumedQtyKg = Math.max(0, entry.issueQtyKg - entry.returnQtyKg);
          entry.totalMaterialCost = entry.netConsumedQtyKg * entry.unitPricePerKg;
        } else {
          const issueQty = isIssue ? qty : 0;
          const returnQty = isIssue ? 0 : qty;
          const net = Math.max(0, issueQty - returnQty);
          matMap.set(key, {
            id: `mat-${Date.now()}-${matMap.size + 1}`,
            itemId: tx.itemId,
            itemCode: tx.itemCode || tx.itemId,
            itemName: tx.itemName,
            filmType: tx.filmType || tx.itemName,
            micron: tx.micron || '-',
            widthMm: tx.widthMm || '-',
            unit: tx.unit || 'Kg',
            barcode: tx.barcode || '',
            issueQtyKg: issueQty,
            returnQtyKg: returnQty,
            netConsumedQtyKg: net,
            unitPricePerKg: rate,
            totalMaterialCost: net * rate,
            wastagePct: 0
          });
        }
      });
      setMaterialsList(Array.from(matMap.values()));
    } else {
      const jm = (jobMasters || []).find(j => 
        (j.jobName || '').toLowerCase().trim() === (ord.jobName || '').toLowerCase().trim()
      );
      if (jm && jm.layers && jm.layers.length > 0) {
        const generatedList = jm.layers.map((layer, idx) => {
          const estimatedRollWeightKg = Math.round((ord.orderQtyKg || 1000) / jm.layers.length);
          const defaultRate = DEFAULT_DAILY_RATES[layer.filmType] || 140;
          return {
            id: `mat-${Date.now()}-${idx + 1}`,
            itemId: `RM-${layer.filmType.substring(0, 3).toUpperCase()}-${idx + 1}`,
            itemCode: `RM-${layer.filmType.substring(0, 3).toUpperCase()}-${idx + 1}`,
            itemName: `${layer.filmType} ${layer.micron}µ (${layer.widthMm || '800'}mm)`,
            filmType: layer.filmType,
            micron: layer.micron,
            widthMm: layer.widthMm || '800',
            unit: 'Kg',
            barcode: '',
            issueQtyKg: estimatedRollWeightKg,
            returnQtyKg: 0,
            netConsumedQtyKg: estimatedRollWeightKg,
            unitPricePerKg: defaultRate,
            totalMaterialCost: estimatedRollWeightKg * defaultRate,
            wastagePct: 0
          };
        });
        setMaterialsList(generatedList);
      } else {
        setMaterialsList([]);
      }
    }

    setQtyFirstPassL1(0);
    setQtyInspection(0);
    setQtyLaminationL1(0);
    setAdhesiveConsumedL1Kg(0);
    setQtySecondPassL2(0);
    setLaminationPlainSubstrateWastageL2Kg(0);
    setAdhesiveConsumedL2Kg(0);
    setQtySlitting(0);
    setPaperCoreConsumedKg(0);
    setQtyPouching(0);
    setZipperConsumedKg(0);
    setPouchingScrapKg(0);
    setQtyDispatch(0);
    setPrintingPlainSettingWastageKg(0);
    setPrintingWastageKg(0);
    setLaminationPlainSubstrateWastageKg(0);
    setPrintedWastageKg(0);
    setLaminateWastageKg(0);
    setTrimWastageKg(0);
    setActualInkGsm('');
    setActualAdhesiveGsm('');
    setTargetInkGsm(String(defaultTargetInk));
    setTargetAdhesiveGsm(String(defaultTargetAdhesive));
    setRecordNotes('');
    setActiveTab('new_record');
    pushSlugState('production_records', { orderId: ord.id, tab: 'new_record' });
  };

  const handleSelectRecord = (rec) => {
    setSelectedRecord(rec);
    pushSlugState('production_records', { id: rec.id, tab: 'list' });
  };

  const handleCloseRecord = () => {
    setSelectedRecord(null);
    pushSlugState('production_records', { tab: activeTab === 'new_record' ? 'punched_jobs' : activeTab });
  };

  const handleTabSwitch = (newTab) => {
    setActiveTab(newTab);
    setSelectedRecord(null);
    pushSlugState('production_records', { tab: newTab });
  };

  const handleOpenSfgModal = () => {
    setSfgFgModalMode('SFG');
    setIsSfgFgModalOpen(true);
    pushSlugState('production_records', { 
      tab: activeTab, 
      action: 'add_sfg', 
      ...(selectedRecord ? { id: selectedRecord.id } : (selectedOrder ? { orderId: selectedOrder.id } : {})) 
    });
  };

  const handleOpenFgModal = () => {
    setSfgFgModalMode('FG');
    setIsSfgFgModalOpen(true);
    pushSlugState('production_records', { 
      tab: activeTab, 
      action: 'add_fg', 
      ...(selectedRecord ? { id: selectedRecord.id } : (selectedOrder ? { orderId: selectedOrder.id } : {})) 
    });
  };

  const handleCloseSfgFgModal = () => {
    setIsSfgFgModalOpen(false);
    pushSlugState('production_records', { 
      tab: activeTab, 
      ...(selectedRecord ? { id: selectedRecord.id } : (selectedOrder ? { orderId: selectedOrder.id } : {})) 
    });
  };

  const handleReviewJobCard = (cardData) => {
    setActiveJobCardData(cardData);
    pushSlugState('production_records', { tab: 'job_cards', jobCardId: cardData.skuCode || cardData.jobMasterId });
  };

  const handleCloseJobCard = () => {
    setActiveJobCardData(null);
    pushSlugState('production_records', { tab: 'job_cards' });
  };

  // Comprehensive Deep-Link Synchronization on mount & URL changes
  React.useEffect(() => {
    if (!urlParams || Object.keys(urlParams).length === 0) return;

    // 1. Sub-tab resolution
    if (urlParams.tab) {
      if (['punched_jobs', 'list', 'new_record', 'job_cards', 'scrap_inventory'].includes(urlParams.tab)) {
        setActiveTab(urlParams.tab);
      }
    }

    // 2. Direct Record Deep Link (e.g. /production-records?id=REC-001 or /production-records/REC-001 or ?recordId=...)
    const targetId = urlParams.id || urlParams.recordId;
    if (targetId && productionRecords && productionRecords.length > 0) {
      const match = productionRecords.find(r => 
        String(r.id).toLowerCase() === String(targetId).toLowerCase() ||
        String(r.orderId || '').toLowerCase() === String(targetId).toLowerCase() ||
        String(r.jobCode || '').toLowerCase() === String(targetId).toLowerCase() ||
        (r.jobName && r.jobName.toLowerCase().includes(String(targetId).toLowerCase()))
      );
      if (match) {
        setSelectedRecord(match);
        setActiveTab('list');
        setSearchTerm(match.jobName || match.id);
      }
    }

    // 3. Order ID / Start Production Deep Link (e.g. ?orderId=ORD-101 or ?job=JOB-001)
    const targetOrderId = urlParams.orderId || urlParams.jobId || urlParams.job;
    if (targetOrderId && orders && orders.length > 0) {
      const matchOrder = orders.find(o => 
        String(o.id).toLowerCase() === String(targetOrderId).toLowerCase() ||
        String(o.jobCode || '').toLowerCase() === String(targetOrderId).toLowerCase() ||
        (o.jobName && o.jobName.toLowerCase().includes(String(targetOrderId).toLowerCase()))
      );
      if (matchOrder) {
        const existingRecord = (productionRecords || []).find(r => r.orderId === matchOrder.id);
        if (existingRecord) {
          setSelectedRecord(existingRecord);
          setActiveTab('list');
        } else {
          handleStartProductionForOrder(matchOrder);
        }
      }
    }

    // 4. Job Card Deep Link (e.g. ?jobCardId=SKU-001 or ?sku=SKU-001)
    const targetJobCard = urlParams.jobCardId || urlParams.sku;
    if (targetJobCard && jobMasters && jobMasters.length > 0) {
      const matchJm = jobMasters.find(j => 
        String(j.id).toLowerCase() === String(targetJobCard).toLowerCase() ||
        String(j.skuCode || '').toLowerCase() === String(targetJobCard).toLowerCase() ||
        (j.jobName && j.jobName.toLowerCase().includes(String(targetJobCard).toLowerCase()))
      );
      if (matchJm) {
        setActiveTab('job_cards');
        setActiveJobCardData({
          jobMasterId: matchJm.id,
          skuCode: matchJm.skuCode,
          jobName: matchJm.jobName,
          clientName: matchJm.clientName,
          clientGroup: matchJm.clientName,
          structure: matchJm.structure,
          layers: matchJm.layers || [],
          colorsCount: matchJm.colorsCount || 6,
          chkEyemark: matchJm.chkEyemark,
          chkBarcode: matchJm.chkBarcode,
          chkOrientation: matchJm.chkOrientation,
          chkClientApproval: matchJm.chkClientApproval,
          approvedByHead: matchJm.approvedByHead || matchJm.productionApproved,
          approvedHeadName: matchJm.approvedHeadName,
          approvedHeadDate: matchJm.approvedHeadDate
        });
      }
    }

    // 5. Action Deep Link: add_sfg or add_fg
    if (urlParams.action === 'add_sfg') {
      setSfgFgModalMode('SFG');
      setIsSfgFgModalOpen(true);
    } else if (urlParams.action === 'add_fg') {
      setSfgFgModalMode('FG');
      setIsSfgFgModalOpen(true);
    }
  }, [urlParams, productionRecords, orders, jobMasters]);

  // Helper: derive substrate structure from Job Master layers (authoritative source)
  const getSubstrateStructure = (order) => {
    if (!order) return '—';
    const jm = jobMasters.find(j =>
      (j.jobName || '').toLowerCase().trim() === (order.jobName || '').toLowerCase().trim()
    );
    if (jm && jm.layers && jm.layers.length > 0) {
      return jm.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
    }
    if (jm && jm.structure && jm.structure !== 'PET / PE' && jm.structure !== '—') {
      return jm.structure;
    }
    if (order.structure && order.structure !== 'PET / PE' && order.structure !== '—') {
      return order.structure;
    }
    return jm?.structure || order.structure || '—';
  };

  const [scrapDisposals, setScrapDisposals] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_scrap_disposals');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
  const [disposeCategory, setDisposeCategory] = useState('Printing Plain Setting (kg)');
  const [disposeQtyKg, setDisposeQtyKg] = useState('');
  const [disposeVendor, setDisposeVendor] = useState('');
  const [disposeRefNo, setDisposeRefNo] = useState('');
  const [disposeNotes, setDisposeNotes] = useState('');
  const [recordNotes, setRecordNotes] = useState('');

  // Helper to open order details for dropdown selection
  const handleSelectOrderForRecord = (orderId) => {
    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      handleStartProductionForOrder(ord);
    }
  };

  const addMaterialRow = () => {
    setMaterialsList(prev => [
      ...prev,
      {
        id: String(Date.now()),
        filmType: 'PET Film',
        micron: '12',
        widthMm: '1000',
        barcode: '',
        issueQtyKg: 0,
        returnQtyKg: 0,
        unitPricePerKg: 125,
        jobMasterFilmType: 'PET Film',
        jobMasterMicron: 12,
        jobMasterWidthMm: 1000
      }
    ]);
  };

  const removeMaterialRow = (id) => {
    setMaterialsList(prev => prev.filter(m => m.id !== id));
  };

  const updateMaterialRow = (id, field, value) => {
    setMaterialsList(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, [field]: value };
      }
      return m;
    }));
  };

  // Calculations with Spec Variation detection against Job Master
  const calculatedMaterials = materialsList.map(m => {
    const issued = parseFloat(m.issueQtyKg) || 0;
    const returned = parseFloat(m.returnQtyKg) || 0;
    const netConsumed = Math.max(0, issued - returned);
    const rate = parseFloat(m.unitPricePerKg) || 0;
    const cost = netConsumed * rate;

    // Spec Variation Calculations
    const actualMicron = parseFloat(m.micron) || 0;
    const jmMicron = parseFloat(m.jobMasterMicron) || 0;
    const micronVarPct = (jmMicron > 0 && actualMicron > 0 && Math.abs(actualMicron - jmMicron) > 0.01)
      ? Number((((actualMicron - jmMicron) / jmMicron) * 100).toFixed(1))
      : null;

    const actualWidth = parseFloat(m.widthMm) || 0;
    const jmWidth = parseFloat(m.jobMasterWidthMm) || 0;
    const widthVarPct = (jmWidth > 0 && actualWidth > 0 && Math.abs(actualWidth - jmWidth) > 0.5)
      ? Number((((actualWidth - jmWidth) / jmWidth) * 100).toFixed(1))
      : null;

    const hasFilmTypeVar = Boolean(m.jobMasterFilmType && m.filmType && m.jobMasterFilmType !== m.filmType);

    return {
      ...m,
      netConsumedQtyKg: netConsumed,
      totalMaterialCost: cost,
      micronVarPct,
      widthVarPct,
      hasFilmTypeVar,
      hasVariation: !!(micronVarPct !== null || widthVarPct !== null || hasFilmTypeVar)
    };
  });

  // Net Produced Quantity = Dispatch Ready Quantity (or Pouching / Slitting / Lamination / Inspection / Printing if unpopulated)
  const totalNetQtyKg = parseFloat(qtyDispatch) || parseFloat(qtyPouching) || parseFloat(qtySlitting) || parseFloat(qtySecondPassL2) || parseFloat(qtyLaminationL1) || parseFloat(qtyInspection) || parseFloat(qtyFirstPassL1) || 0;
  const totalMaterialCostRs = calculatedMaterials.reduce((sum, m) => sum + m.totalMaterialCost, 0);
  
  // Total Processing Cost = Total Qty Produced x Processing Cost Per Kg
  const totalProcessingCostRs = totalNetQtyKg * (parseFloat(processingCostPerKg) || 0);

  // Total Scrap Weight across all stage process wastage categories
  const totalScrapQtyKg = (parseFloat(printingPlainSettingWastageKg) || 0) +
                         (parseFloat(printingWastageKg) || 0) +
                         (parseFloat(printedWastageKg) || 0) +
                         (parseFloat(laminationPlainSubstrateWastageKg) || 0) +
                         (parseFloat(laminationPlainSubstrateWastageL2Kg) || 0) +
                         (parseFloat(laminateWastageKg) || 0) +
                         (parseFloat(trimWastageKg) || 0) +
                         (parseFloat(pouchingScrapKg) || 0);

  // Cost Formula: (Total Qty Produced x Processing Cost Rate) + (Ingredients Cost)
  // Scrap Rate removed as per directive
  const finalProductionCostRs = totalProcessingCostRs + totalMaterialCostRs;

  // Scrap Metrics & Percentages
  const totalJobMaterialOutputKg = totalNetQtyKg + totalScrapQtyKg;
  const overallScrapPctOfOutput = totalJobMaterialOutputKg > 0 ? Number(((totalScrapQtyKg / totalJobMaterialOutputKg) * 100).toFixed(1)) : 0;
  const overallScrapPctOfDispatch = totalNetQtyKg > 0 ? Number(((totalScrapQtyKg / totalNetQtyKg) * 100).toFixed(1)) : 0;

  // Audit unfilled / 0 value metrics across stages & materials for confirmation screen warning
  const unfilledWarnings = useMemo(() => {
    const warnings = [];

    // 1. Stage 7 Dispatch Ready Output (Critical)
    if (!parseFloat(qtyDispatch) || parseFloat(qtyDispatch) <= 0) {
      warnings.push({
        stage: 'Stage 7: Dispatch',
        field: 'Dispatch Ready Quantity',
        message: 'Final Dispatch Ready Quantity is 0 kg (Unentered).'
      });
    }

    // 2. Stage 1 Printing Output
    if (!parseFloat(qtyFirstPassL1) || parseFloat(qtyFirstPassL1) <= 0) {
      warnings.push({
        stage: 'Stage 1: Printing',
        field: 'Printing Output',
        message: 'Printing Finished Output is 0 kg.'
      });
    }

    // 3. Stage 3 Lamination L1 Output
    if (!parseFloat(qtyLaminationL1) || parseFloat(qtyLaminationL1) <= 0) {
      warnings.push({
        stage: 'Stage 3: Lamination L1',
        field: 'Lamination L1 Output',
        message: 'Lamination Pass 1 Output is 0 kg.'
      });
    }

    // 4. Stage 5 Slitting Output
    if (!parseFloat(qtySlitting) || parseFloat(qtySlitting) <= 0) {
      warnings.push({
        stage: 'Stage 5: Slitting',
        field: 'Slitting Output',
        message: 'Slitting Finished Output is 0 kg.'
      });
    }

    // 5. Consumables
    if (!parseFloat(paperCoreConsumedKg) || parseFloat(paperCoreConsumedKg) <= 0) {
      warnings.push({
        stage: 'Stage 5: Slitting',
        field: 'Paper Core Consumed',
        message: 'Paper Core Consumed is 0 kg.'
      });
    }

    if (!parseFloat(adhesiveConsumedL1Kg) || parseFloat(adhesiveConsumedL1Kg) <= 0) {
      warnings.push({
        stage: 'Stage 3: Lamination L1',
        field: 'Adhesive Consumed (L1)',
        message: 'Lamination Pass 1 Adhesive Consumed is 0 kg.'
      });
    }

    // 6. Process Scrap
    if (totalScrapQtyKg <= 0) {
      warnings.push({
        stage: 'Process Scrap',
        field: 'Total Scrap Logged',
        message: 'No process scrap / wastage logged across any stage (0.0 kg total).'
      });
    }

    // 7. Ingredient Materials
    calculatedMaterials.forEach(m => {
      if ((parseFloat(m.netConsumedQtyKg) || 0) <= 0) {
        warnings.push({
          stage: 'Materials',
          field: `${m.filmType} Consumption`,
          message: `Net consumed quantity for ${m.filmType} (${m.itemName}) is 0 kg.`
        });
      }
    });

    // 8. Processing Cost Rate
    if (!parseFloat(processingCostPerKg) || parseFloat(processingCostPerKg) <= 0) {
      warnings.push({
        stage: 'Costing',
        field: 'Processing Rate',
        message: 'Processing Cost Rate is set to ₹0 / kg.'
      });
    }

    return warnings;
  }, [
    qtyDispatch,
    qtyFirstPassL1,
    qtyLaminationL1,
    qtySlitting,
    paperCoreConsumedKg,
    adhesiveConsumedL1Kg,
    totalScrapQtyKg,
    calculatedMaterials,
    processingCostPerKg
  ]);

  // Handle Scrap Disposal Submission
  const handleAddScrapDisposal = (e) => {
    e.preventDefault();
    if (!disposeQtyKg || parseFloat(disposeQtyKg) <= 0) {
      alert("Please enter a valid disposal quantity in kg.");
      return;
    }
    const newDisposal = {
      id: `DISP-${Date.now()}`,
      category: disposeCategory,
      qtyKg: parseFloat(disposeQtyKg),
      vendor: disposeVendor.trim() || 'Scrap Buyer / Recycler',
      refNo: disposeRefNo.trim() || `GP-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      disposedBy: `${currentUser.name} (${currentUser.role})`,
      notes: disposeNotes
    };

    const updated = [newDisposal, ...scrapDisposals];
    setScrapDisposals(updated);

    setDisposeQtyKg('');
    setDisposeVendor('');
    setDisposeRefNo('');
    setDisposeNotes('');
    setIsDisposeModalOpen(false);
    alert(`✅ Scrap disposal of ${newDisposal.qtyKg} kg recorded! Stock deducted successfully.`);
  };

  // Calculate Cumulative Scrap Stock across all submitted records minus disposals
  const calculateScrapStock = () => {
    const rawCategories = {
      'Printing Plain Setting (kg)': 0,
      'Printing Wastage (kg)': 0,
      'Lamination Plain Substrate (kg)': 0,
      'Printed Wastage (kg)': 0,
      'Laminate Wastage (kg)': 0,
      'Trim Wastage (kg)': 0
    };

    // Accumulate from all submitted records
    productionRecords.forEach(r => {
      rawCategories['Printing Plain Setting (kg)'] += Number(r.printingPlainSettingWastageKg || 0);
      rawCategories['Printing Wastage (kg)'] += Number(r.printingWastageKg || 0);
      rawCategories['Lamination Plain Substrate (kg)'] += Number(r.laminationPlainSubstrateWastageKg || 0);
      rawCategories['Printed Wastage (kg)'] += Number(r.printedWastageKg || 0);
      rawCategories['Laminate Wastage (kg)'] += Number(r.laminateWastageKg || 0);
      rawCategories['Trim Wastage (kg)'] += Number(r.trimWastageKg || 0);
    });

    // Deduct disposals
    scrapDisposals.forEach(d => {
      if (rawCategories[d.category] !== undefined) {
        rawCategories[d.category] = Math.max(0, rawCategories[d.category] - (Number(d.qtyKg) || 0));
      }
    });

    return rawCategories;
  };

  const scrapStockData = calculateScrapStock();
  const totalScrapStockInPlantKg = Object.values(scrapStockData).reduce((sum, v) => sum + v, 0);

  // Step 1: Open Detailed Confirmation Popup
  const handleOpenConfirmModal = (e) => {
    if (e) e.preventDefault();

    if (!selectedOrder) {
      alert('Please select an order for this Production Record.');
      return;
    }

    if (calculatedMaterials.length === 0) {
      alert('Please add at least one ingredient material line.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Step 2: Final Submit upon confirmation
  const handleFinalSubmitRecord = () => {
    const newRecord = {
      id: `REC-${Date.now()}`,
      orderId: selectedOrder.id,
      jobName: selectedOrder.jobName,
      clientName: selectedOrder.clientName,
      dateFilled: new Date().toISOString().split('T')[0],
      materialsList: calculatedMaterials,
      
      // Stage-wise Quantities & Consumables (7 Stages)
      qtyFirstPassL1: parseFloat(qtyFirstPassL1) || 0,
      qtyPrinting: parseFloat(qtyFirstPassL1) || 0,
      qtyInspection: parseFloat(qtyInspection) || 0,
      qtyLaminationL1: parseFloat(qtyLaminationL1) || 0,
      adhesiveConsumedL1Kg: parseFloat(adhesiveConsumedL1Kg) || 0,
      qtySecondPassL2: parseFloat(qtySecondPassL2) || 0,
      laminationPlainSubstrateWastageL2Kg: parseFloat(laminationPlainSubstrateWastageL2Kg) || 0,
      adhesiveConsumedL2Kg: parseFloat(adhesiveConsumedL2Kg) || 0,
      qtySlitting: parseFloat(qtySlitting) || 0,
      paperCoreConsumedKg: parseFloat(paperCoreConsumedKg) || 0,
      qtyPouching: parseFloat(qtyPouching) || 0,
      zipperConsumedKg: parseFloat(zipperConsumedKg) || 0,
      pouchingScrapKg: parseFloat(pouchingScrapKg) || 0,
      qtyDispatch: parseFloat(qtyDispatch) || 0,
      totalProductionQtyKg: totalNetQtyKg,

      totalMaterialCostRs: totalMaterialCostRs,
      processingCostPerKg: parseFloat(processingCostPerKg) || 25,
      totalProcessingCostRs: totalProcessingCostRs,

      // Stage-wise Scrap Breakdown (in kg)
      printingPlainSettingWastageKg: parseFloat(printingPlainSettingWastageKg) || 0,
      printingWastageKg: parseFloat(printingWastageKg) || 0,
      laminationPlainSubstrateWastageKg: parseFloat(laminationPlainSubstrateWastageKg) || 0,
      printedWastageKg: parseFloat(printedWastageKg) || 0,
      laminateWastageKg: parseFloat(laminateWastageKg) || 0,
      trimWastageKg: parseFloat(trimWastageKg) || 0,
      totalScrapQtyKg: totalScrapQtyKg,
      totalWastageKg: totalScrapQtyKg,
      grossProductionKg: totalJobMaterialOutputKg,
      netUsableKg: totalNetQtyKg,
      overallScrapPctOfOutput: overallScrapPctOfOutput,
      overallScrapPctOfDispatch: overallScrapPctOfDispatch,
      wastagePercentage: overallScrapPctOfOutput,
      scrapWastagePct: overallScrapPctOfOutput,
      finalProductionCostRs: finalProductionCostRs,

      // Target & Actual Ink & Adhesive GSMs
      actualInkGsm: actualInkGsm !== '' && !isNaN(parseFloat(actualInkGsm)) ? parseFloat(actualInkGsm) : null,
      actualAdhesiveGsm: actualAdhesiveGsm !== '' && !isNaN(parseFloat(actualAdhesiveGsm)) ? parseFloat(actualAdhesiveGsm) : null,
      targetInkGsm: parseFloat(targetInkGsm) || 1.5,
      targetAdhesiveGsm: parseFloat(targetAdhesiveGsm) || 1.5,
      inkGsmInSpeed: actualInkGsm !== '' && !isNaN(parseFloat(actualInkGsm)) ? parseFloat(actualInkGsm) : (parseFloat(targetInkGsm) || 1.5),

      status: "Filled by Plant Manager",
      filledBy: `${currentUser.name} (${currentUser.role})`,
      approvedBy: "",
      approvalDate: "",
      notes: recordNotes
    };

    if (onSaveProductionRecord) onSaveProductionRecord(newRecord);
    notifyProductionRecordSubmitted(newRecord).catch(err => console.error("Production submission email error:", err));

    // Over-Wastage Alert Email Trigger if scrap % exceeds pre-costing target
    const targetWastagePct = Number(selectedOrder?.calculationDetails?.wastagePct || selectedOrder?.wastagePct || 5);
    const actualWastagePct = Math.max(overallScrapPctOfDispatch, overallScrapPctOfOutput);
    if (actualWastagePct > targetWastagePct) {
      notifyOverWastageAlert({
        record: newRecord,
        order: selectedOrder,
        allowedWastagePct: targetWastagePct
      }).catch(err => console.error("Over-wastage alert email error:", err));
    }

    setIsConfirmModalOpen(false);
    alert(`🎉 Production Record for "${selectedOrder.jobName}" saved & submitted for Admin Approval!\n\nStage production, scrap generated (${totalScrapQtyKg} kg), and inventory roll returns updated successfully.`);
    setActiveTab('list');
  };
  const filteredRecords = productionRecords.filter(r => {
    const matchesSearch = r.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const {
    currentPage,
    totalPages,
    pageSize,
    setPageSize,
    goToPage,
    startIndex,
    endIndex,
    paginatedItems: paginatedRecords
  } = usePagination(filteredRecords, 25);

  const filteredPunchedOrders = orders.filter(o => {
    return o.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || 
           o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
           o.clientName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleSaveSFGFG = (inventoryItem, rolls, prodLink) => {
    if (Array.isArray(rolls)) {
      rolls.forEach(r => {
        if (onAddRoll) onAddRoll(r);
      });
    }

    if (prodLink && prodLink.orderId && onSaveProductionRecord) {
      const existingRecord = (productionRecords || []).find(pr => String(pr.orderId) === String(prodLink.orderId) || String(pr.id) === String(prodLink.orderId));
      const existingRolls = existingRecord?.outputRolls || [];
      const updatedRolls = [...existingRolls, ...(rolls || [])];
      const totalOutputKg = updatedRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);

      const updatedRecord = {
        ...(existingRecord || {
          id: `PROD-${prodLink.orderId}-${Date.now().toString().slice(-4)}`,
          orderId: prodLink.orderId,
          jobName: prodLink.jobName,
          jobCode: prodLink.jobCode,
          operatorName: prodLink.operatorName,
          shift: prodLink.shift,
          productionDate: prodLink.productionDate,
          status: 'In Progress',
          machineName: prodLink.machineName
        }),
        outputRolls: updatedRolls,
        actualOutputKg: totalOutputKg,
        netUsableKg: totalOutputKg,
        lastUpdated: new Date().toISOString()
      };

      onSaveProductionRecord(updatedRecord);
    }

    setSelectedRollForBarcodeModal(rolls);
    setIsSfgFgModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* SFG / FG Digital Scale Barcode Entry Modal */}
      {isSfgFgModalOpen && (
        <SFGFGEntryModal 
          isOpen={isSfgFgModalOpen}
          mode={sfgFgModalMode}
          jobMasters={jobMasters}
          orders={orders}
          inventoryRolls={inventoryRolls}
          productionRecords={productionRecords}
          machines={machines}
          currentUser={currentUser}
          initialJobId={selectedRecord?.orderId || selectedRecord?.id || selectedOrder?.id || ''}
          onClose={handleCloseSfgFgModal}
          onSave={handleSaveSFGFG}
          onPrintRolls={(rolls) => setSelectedRollForBarcodeModal(rolls)}
        />
      )}

      {/* Barcode Thermal Label Printer Modal */}
      {selectedRollForBarcodeModal && (
        <BarcodePrinterModal 
          rolls={selectedRollForBarcodeModal} 
          roll={selectedRollForBarcodeModal} 
          inventory={inventory}
          onClose={() => setSelectedRollForBarcodeModal(null)} 
        />
      )}

      {/* Header Banner & Approval Flow Notice */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet style={{ color: 'var(--primary-brand)' }} /> Job Production Records & Material Costing
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            All punched jobs appear here. Click <strong>"Start Production" 🚀</strong> to fill material usage & barcode consumption.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn-primary" 
            style={{ background: '#6d28d9', borderColor: '#6d28d9', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }} 
            onClick={handleOpenSfgModal}
            title="Weigh and register Semi-Finished Goods (SFG) master rolls"
          >
            + Add SFG
          </button>

          <button 
            className="btn-primary" 
            style={{ background: '#059669', borderColor: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }} 
            onClick={handleOpenFgModal}
            title="Weigh and register Finished Goods (FG) master rolls"
          >
            + Add FG
          </button>

          <button 
            className={`tab-pill ${activeTab === 'punched_jobs' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('punched_jobs')}
          >
            📦 Punched Jobs ({(orders || []).length})
          </button>

          <button 
            className={`tab-pill ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('list')}
          >
            📑 Submitted Records ({(productionRecords || []).length})
          </button>

          <button 
            className={`tab-pill ${activeTab === 'job_cards' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('job_cards')}
          >
            📋 Job Cards Sign-Off ({(jobMasters || []).length})
          </button>

          <button 
            className={`tab-pill ${activeTab === 'scrap_inventory' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('scrap_inventory')}
          >
            ♻️ Scrap Inventory ({totalScrapStockInPlantKg.toFixed(0)} kg)
          </button>

          {isPlantManager && (
            <button 
              className="btn-primary"
              onClick={() => { 
                if ((orders || []).length > 0) handleStartProductionForOrder(orders[0]);
                else handleTabSwitch('new_record');
              }}
            >
              <Plus size={16} /> Fill New Production Record
            </button>
          )}
        </div>
      </div>

      {/* Modal View for CylinderJobCardForm when reviewing a Job Card */}
      {activeJobCardData && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal-toolbar no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#0f172a' }}>
            <button className="btn-secondary" style={{ background: '#ffffff', color: '#0f172a' }} onClick={handleCloseJobCard}>
              <X size={16} /> Close Job Card View
            </button>
            <div style={{ color: '#ffffff', fontWeight: '700', fontSize: '1rem' }}>
              Production Head Review: Rotogravure Cylinder Job Card — {activeJobCardData.jobName} ({activeJobCardData.skuCode})
            </div>
          </div>
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', background: '#334155', minHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
            <div style={{ background: '#ffffff', width: '1000px', maxWidth: '98vw', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', padding: '24px' }}>
              <CylinderJobCardForm 
                initialData={activeJobCardData} 
                jobMasters={jobMasters}
                cylinders={cylinders}
                currentUser={currentUser}
                onClose={() => setActiveJobCardData(null)}
                onSave={(updatedData, targetJobMaster, targetCylinder) => {
                  setActiveJobCardData(prev => ({ ...prev, ...updatedData }));
                  if (targetJobMaster && onUpdateJobMaster) {
                    onUpdateJobMaster(targetJobMaster);
                  }
                  if (targetCylinder && onUpdateCylinder) {
                    onUpdateCylinder(targetCylinder);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 0: JOB CARDS & SIGN-OFFS (PRODUCTION HEAD VIEW) */}
      {activeTab === 'job_cards' && !selectedRecord && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="input-with-icon" style={{ width: '300px' }}>
                <Search size={16} className="input-icon" />
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Search Job Name, SKU or Client..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {(jobMasters || []).length} Job Masters for Production Sign-Off
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU / Job ID</th>
                  <th>Job Name & Client</th>
                  <th>Structure & Colors</th>
                  <th>Pre-Press Checklist</th>
                  <th>Production Head Sign-Off</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(jobMasters || []).length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No Job Masters found in directory.
                    </td>
                  </tr>
                ) : (
                  jobMasters
                    .filter(j => 
                      (j.jobName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (j.skuCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (j.clientName || '').toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(jm => {
                      const isChecklistVerified = jm.chkEyemark && jm.chkBarcode && jm.chkOrientation && jm.chkClientApproval;
                      const isApproved = jm.approvedByHead || jm.productionApproved;

                      return (
                        <tr key={jm.id}>
                          <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>
                            {jm.skuCode || jm.id}
                          </td>
                          <td>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{jm.jobName}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{jm.clientName}</div>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#334155' }}>
                            <div><code>{jm.structure || '—'}</code></div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{jm.colorsCount || 6} Colors</div>
                          </td>
                          <td>
                            {isChecklistVerified ? (
                              <span className="badge badge-us" style={{ background: '#dcfce7', color: '#15803d' }}>
                                <CheckCircle2 size={12} /> 4/4 Verified
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                ⚠️ Pending Checklist
                              </span>
                            )}
                          </td>
                          <td>
                            {isApproved ? (
                              <span className="badge badge-us" style={{ background: '#dcfce7', color: '#15803d', fontWeight: '800' }}>
                                <ShieldCheck size={12} /> Approved by {jm.approvedHeadName || 'Production Head'}
                              </span>
                            ) : (
                              <span className="badge badge-client" style={{ background: '#fff7ed', color: '#c2410c', fontWeight: '700' }}>
                                ⏳ Pending Sign-Off
                              </span>
                            )}
                          </td>
                          <td>
                            <button 
                              className="btn-primary" 
                              style={{ padding: '6px 14px', fontSize: '0.82rem', background: '#059669', borderColor: '#059669' }}
                              onClick={() => {
                                handleReviewJobCard({
                                  jobMasterId: jm.id,
                                  skuCode: jm.skuCode,
                                  jobName: jm.jobName,
                                  clientName: jm.clientName,
                                  clientGroup: jm.clientName,
                                  structure: jm.structure,
                                  layers: jm.layers || [],
                                  colorsCount: jm.colorsCount || 6,
                                  chkEyemark: jm.chkEyemark,
                                  chkBarcode: jm.chkBarcode,
                                  chkOrientation: jm.chkOrientation,
                                  chkClientApproval: jm.chkClientApproval,
                                  approvedByHead: jm.approvedByHead || jm.productionApproved,
                                  approvedHeadName: jm.approvedHeadName,
                                  approvedHeadDate: jm.approvedHeadDate
                                });
                              }}
                            >
                              <ShieldCheck size={14} /> Review & Sign-Off Job Card
                            </button>
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

      {/* TAB 1: PUNCHED JOBS READY FOR PRODUCTION */}
      {activeTab === 'punched_jobs' && !selectedRecord && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="input-with-icon" style={{ width: '300px' }}>
                <Search size={16} className="input-icon" />
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Search Punched Job or Order ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredPunchedOrders.length} punched jobs
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Job Name & Customer</th>
                  <th>Substrate Structure</th>
                  <th>Order Qty (kg)</th>
                  <th>Target Delivery</th>
                  <th>Production Record Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPunchedOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No punched jobs found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredPunchedOrders.map(ord => {
                    const existingRecord = productionRecords.find(r => r.orderId === ord.id);
                    return (
                      <tr key={ord.id} style={{ background: existingRecord ? 'transparent' : '#f0f9ff' }}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{ord.id}</td>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{ord.jobName}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ord.clientName}</div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#334155' }}>
                          <code>{getSubstrateStructure(ord)}</code>
                        </td>
                        <td style={{ fontWeight: '700' }}>
                          {ord.orderQtyKg ? ord.orderQtyKg.toLocaleString() : '1,500'} kg
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{ord.targetDeliveryDate || '2026-07-28'}</td>
                        <td>
                          {existingRecord ? (
                            existingRecord.status === 'Approved by Admin' ? (
                              <span className="badge badge-us" style={{ background: '#dcfce7', color: '#15803d' }}>
                                <CheckCircle2 size={12} /> Approved Record
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                <Clock size={12} /> Filled (Pending Approval)
                              </span>
                            )
                          ) : (
                            <span className="badge badge-client" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: '700' }}>
                              🚀 Punched - Ready for Production
                            </span>
                          )}
                        </td>
                        <td>
                          <button 
                            className="btn-primary" 
                            style={{ 
                              padding: '6px 14px', 
                              fontSize: '0.82rem', 
                              background: existingRecord ? '#64748b' : '#4f46e5',
                              borderColor: existingRecord ? '#64748b' : '#4f46e5'
                            }}
                            onClick={() => {
                              if (existingRecord) {
                                handleSelectRecord(existingRecord);
                              } else {
                                handleStartProductionForOrder(ord);
                              }
                            }}
                          >
                            <Play size={13} fill="currentColor" /> {existingRecord ? 'View/Edit Record' : 'Start Production'}
                          </button>
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

      {/* TAB 2: SUBMITTED PRODUCTION RECORDS LIST */}
      {activeTab === 'list' && !selectedRecord && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="input-with-icon" style={{ width: '280px' }}>
                <Search size={16} className="input-icon" />
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Search Job Name or Order ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <select 
                className="form-control"
                style={{ width: '200px' }}
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">All Approval Statuses</option>
                <option value="Filled by Plant Manager">Pending Admin Approval</option>
                <option value="Approved by Admin">Approved by Admin</option>
                <option value="Draft">Draft Records</option>
              </select>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredRecords.length} records
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Job / Client Name</th>
                  <th>Date Filled</th>
                  <th>Net Produced (kg)</th>
                  <th>Material Cost (₹)</th>
                  <th>Final Cost (₹)</th>
                  {isAdmin && <th>Profitability & Margin (Admin Only)</th>}
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? "9" : "8"} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No production records found. Click "Fill New Production Record" to create one.
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map(rec => {
                    const linkedOrder = orders.find(o => 
                      (rec.orderId && String(o.id) === String(rec.orderId)) ||
                      (rec.jobCode && String(o.jobCode || '').toUpperCase() === String(rec.jobCode).toUpperCase()) ||
                      (rec.jobName && (o.jobName || '').toLowerCase().trim() === (rec.jobName || '').toLowerCase().trim())
                    ) || {};

                    const matchingJobMaster = jobMasters.find(j => 
                      (rec.jobMasterId && String(j.id) === String(rec.jobMasterId)) ||
                      (rec.jobCode && String(j.jobCode || '').toUpperCase() === String(rec.jobCode).toUpperCase()) ||
                      (rec.jobName && (j.jobName || '').toLowerCase().trim() === (rec.jobName || '').toLowerCase().trim())
                    ) || {};

                    const sellingPrice = Number(
                      rec.sellingPricePerKg ||
                      linkedOrder.sellingPricePerKg || 
                      linkedOrder.pricePerKg || 
                      linkedOrder.rate || 
                      linkedOrder.unitPrice || 
                      linkedOrder.orderRatePerKg ||
                      matchingJobMaster.sellingPricePerKg ||
                      matchingJobMaster.pricePerKg ||
                      0
                    );

                    const actualQty = Number(rec.totalProductionQtyKg || rec.qtyDispatch || rec.qtySecondPassL2 || rec.qtyFirstPassL1 || 0);
                    const revenue = sellingPrice > 0 && actualQty > 0 ? Math.round(actualQty * sellingPrice) : 0;
                    const actualCost = Number(rec.finalProductionCostRs || rec.totalProductionCostRs || 0);
                    const profitRs = revenue > 0 ? revenue - actualCost : 0;
                    const marginPct = revenue > 0 ? ((profitRs / revenue) * 100).toFixed(1) : null;
                    const jobMasterDisplay = rec.jobMasterId || matchingJobMaster.id || matchingJobMaster.jobCode || null;

                    return (
                      <tr key={rec.id}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{rec.orderId}</td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{rec.jobName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {rec.clientName} {jobMasterDisplay ? `• ${jobMasterDisplay}` : ''}
                          </div>
                        </td>
                        <td>{rec.dateFilled}</td>
                        <td style={{ fontWeight: '600' }}>{actualQty > 0 ? actualQty.toLocaleString() : 0} kg</td>
                        <td>₹ {(rec.totalMaterialCostRs ?? 0).toLocaleString()}</td>
                        <td style={{ fontWeight: '700', color: '#047857' }}>₹ {(rec.finalProductionCostRs ?? 0).toLocaleString()}</td>
                        
                        {/* Admin Only Profitability Column */}
                        {isAdmin && (
                          <td>
                            {revenue > 0 ? (
                              <>
                                <div style={{ fontWeight: '800', color: profitRs >= 0 ? '#047857' : '#dc2626', fontSize: '0.85rem' }}>
                                  ₹ {profitRs.toLocaleString('en-IN')} ({marginPct}%)
                                </div>
                                <span className={`badge ${Number(marginPct) >= 20 ? 'badge-success' : Number(marginPct) >= 10 ? 'badge-info' : Number(marginPct) >= 0 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                  {Number(marginPct) >= 20 ? 'HIGH MARGIN' : Number(marginPct) >= 10 ? 'GOOD MARGIN' : Number(marginPct) >= 0 ? 'THIN MARGIN' : 'COST OVERRUN'}
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                — (Rate Not Set)
                              </span>
                            )}
                          </td>
                        )}

                        <td>
                          {rec.status === 'Approved by Admin' ? (
                            <span className="badge badge-us">
                              <CheckCircle2 size={12} /> Approved by Admin
                            </span>
                          ) : rec.status === 'Filled by Plant Manager' ? (
                            <span className="badge badge-warning">
                              <Clock size={12} /> Pending Admin Approval
                            </span>
                          ) : (
                            <span className="badge badge-client">Draft</span>
                          )}
                        </td>
                        <td>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() => handleSelectRecord(rec)}
                          >
                            View Record
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            setPageSize={setPageSize}
            goToPage={goToPage}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={filteredRecords.length}
          />
        </div>
      )}

      {/* VIEW 2: VIEW SINGLE RECORD DETAILS & ADMIN APPROVAL */}
      {selectedRecord && (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <button className="btn-secondary" style={{ marginBottom: '12px', padding: '5px 12px', fontSize: '0.8rem' }} onClick={handleCloseRecord}>
                ← Back to Records List
              </button>
              <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                Production Record: {selectedRecord.jobName}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Job Master ID: <b>{selectedRecord.jobMasterId || 'JM-2026-089'}</b> • Order ID: <b>{selectedRecord.orderId}</b> • Client: {selectedRecord.clientName}
              </p>
            </div>

            {/* Approval Status Banner & Action */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              {selectedRecord.status === 'Approved by Admin' ? (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', color: '#047857', textAlign: 'right' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Fully Approved by Admin
                  </div>
                  <div style={{ fontSize: '0.75rem', marginTop: '2px', color: '#065f46' }}>
                    Approved by: {selectedRecord.approvedBy} on {selectedRecord.approvalDate}
                  </div>
                </div>
              ) : selectedRecord.status === 'Filled by Plant Manager' ? (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 14px', borderRadius: '8px', color: '#b45309' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>Filled by: {selectedRecord.filledBy}</div>
                    <div style={{ fontSize: '0.75rem' }}>Awaiting Admin Approval</div>
                  </div>

                  {isAdmin && (
                    <button 
                      className="btn-primary" 
                      style={{ background: '#059669', borderColor: '#059669', padding: '10px 18px' }}
                      onClick={() => {
                        if (onApproveProductionRecord) {
                          onApproveProductionRecord(selectedRecord.id, `${currentUser.name} (Admin)`);
                          const updated = {
                            ...selectedRecord,
                            status: 'Approved by Admin',
                            approvedBy: `${currentUser.name} (Admin)`,
                            approvalDate: new Date().toLocaleString()
                          };
                          setSelectedRecord(updated);
                          notifyProductionRecordApproved(updated).catch(err => console.error("Production approval email error:", err));
                          alert(`Production Record for "${selectedRecord.jobName}" APPROVED successfully! Job can now be completed.`);
                        }
                      }}
                    >
                      <ShieldCheck size={18} /> Approve Production Record
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Substrate Input Rolls & Actual Ink GSM Technical Analysis */}
          {(() => {
            const linkedOrder = orders.find(o => o.id === selectedRecord.orderId || o.jobName === selectedRecord.jobName) || {};
            const matchedJM = (jobMasters || []).find(j => j.id === selectedRecord.jobMasterId || j.id === linkedOrder?.jobMasterId || j.jobCode === selectedRecord.jobCode);

            const inputRolls = selectedRecord.inputRollsList || [];
            const outputRolls = selectedRecord.rollsBreakdown || selectedRecord.outputRolls || [];
            const actualMeters = parseFloat(selectedRecord.actualMetersPrinted || linkedOrder?.actualMetersPrinted || 0);
            const printWidthMm = parseFloat(selectedRecord.printWidthMm || linkedOrder?.printWidthMm || matchedJM?.printWidthMm || matchedJM?.cylinderData?.widthMm || linkedOrder?.widthMm || 460);

            const totalInputConsumedKg = inputRolls.reduce((sum, r) => sum + (parseFloat(r.consumedWeightKg) || 0), 0) || parseFloat(selectedRecord.totalInputConsumedKg) || 0;
            const totalOutputRollsKg = outputRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0) || parseFloat(selectedRecord.printedOutputKg) || 0;

            let inputRollWidthMm = printWidthMm;
            if (inputRolls.length > 0) {
              const maxW = Math.max(...inputRolls.map(r => parseFloat(r.widthMm) || 0));
              if (maxW > 0) inputRollWidthMm = maxW;
            } else if (selectedRecord.inputRollWidthMm) {
              inputRollWidthMm = parseFloat(selectedRecord.inputRollWidthMm);
            }

            const isBiggerSize = inputRollWidthMm > printWidthMm;
            let excessFilmWastageKg = parseFloat(selectedRecord.excessFilmWastageKg || 0);
            let excessFilmWastagePct = parseFloat(selectedRecord.excessFilmWastagePct || 0);

            if (isBiggerSize && totalInputConsumedKg > 0 && (!excessFilmWastageKg || excessFilmWastageKg === 0)) {
              const trimRatio = (inputRollWidthMm - printWidthMm) / inputRollWidthMm;
              excessFilmWastageKg = totalInputConsumedKg * trimRatio;
              excessFilmWastagePct = (excessFilmWastageKg / totalInputConsumedKg) * 100;
            }

            let inkWeightGainKg = parseFloat(selectedRecord.inkWeightGainKg || 0);
            if (!inkWeightGainKg || inkWeightGainKg === 0) {
              if (isBiggerSize) {
                inkWeightGainKg = totalOutputRollsKg - (totalInputConsumedKg - excessFilmWastageKg);
              } else {
                inkWeightGainKg = totalOutputRollsKg - totalInputConsumedKg;
              }
            }

            const printedAreaM2 = (actualMeters * printWidthMm) / 1000;
            let actualCalculatedInkGsm = parseFloat(selectedRecord.actualCalculatedInkGsm || 0);
            if ((!actualCalculatedInkGsm || actualCalculatedInkGsm === 0) && printedAreaM2 > 0 && inkWeightGainKg > 0) {
              actualCalculatedInkGsm = (inkWeightGainKg * 0.20 * 1000) / printedAreaM2;
            }

            const operatorInkGsm = parseFloat(selectedRecord.inkGsmInSpeed || linkedOrder?.inkGsmInSpeed || 0);
            const isInkGsmHigher = operatorInkGsm > 0 && actualCalculatedInkGsm > operatorInkGsm;

            return (
              <div style={{ margin: '16px 0 24px', padding: '20px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Scale size={20} style={{ color: '#0284c7' }} /> Technical Substrate & Ink GSM Production Analysis
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Input film roll consumption, excess film trimming wastage, and dry ink solids gain calculation.
                    </span>
                  </div>

                  {/* High Ink GSM Alert Banner */}
                  {isInkGsmHigher && (
                    <div style={{ background: '#fef2f2', border: '1.5px solid #ef4444', padding: '6px 14px', borderRadius: '8px', color: '#991b1b', fontWeight: '800', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={18} style={{ color: '#dc2626' }} />
                      <span>⚠️ High Ink Consumption Alert: Actual GSM ({actualCalculatedInkGsm.toFixed(2)}) &gt; Operator Input ({operatorInkGsm.toFixed(2)})</span>
                    </div>
                  )}
                </div>

                {/* Substrate & Ink Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Substrate Match</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
                      {selectedRecord.printFilmType || linkedOrder?.printFilmType || 'PET'} {selectedRecord.micron || linkedOrder?.micron || 12}µ
                    </div>
                    <span style={{ fontSize: '0.74rem', color: isBiggerSize ? '#b45309' : '#059669', fontWeight: '700' }}>
                      {isBiggerSize ? `⚠️ Wider Input Film (${inputRollWidthMm}mm > Job Print ${printWidthMm}mm)` : `✓ Same Size (${printWidthMm}mm)`}
                    </span>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Total Input Consumed</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0284c7', marginTop: '2px' }}>
                      {totalInputConsumedKg.toFixed(2)} kg
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Across {inputRolls.length || 1} input rolls</span>
                  </div>

                  {isBiggerSize && (
                    <div style={{ background: '#fffbeb', padding: '12px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: '800', textTransform: 'uppercase' }}>Extra Film Trimming Wastage</span>
                      <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#d97706', marginTop: '2px' }}>
                        {excessFilmWastageKg.toFixed(2)} kg <span style={{ fontSize: '0.85rem' }}>({excessFilmWastagePct.toFixed(1)}%)</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#b45309' }}>Trimming side wastage ({inputRollWidthMm - printWidthMm} mm difference)</span>
                    </div>
                  )}

                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Dry Ink Solids Gain</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#059669', marginTop: '2px' }}>
                      {(inkWeightGainKg * 0.20).toFixed(2)} kg <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>(20% Ink Solids)</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Gross Ink Weight Gain: {inkWeightGainKg.toFixed(2)} kg</span>
                  </div>

                  {/* Side-by-side GSM Comparison */}
                  <div style={{ background: isInkGsmHigher ? '#fef2f2' : '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: isInkGsmHigher ? '1.5px solid #fca5a5' : '1.5px solid #86efac' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: isInkGsmHigher ? '#991b1b' : '#166534', fontWeight: '800', textTransform: 'uppercase' }}>Ink GSM Comparison</span>
                      {isInkGsmHigher && <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>VARIANCE ALERT</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>OPERATOR INPUT</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#475569' }}>
                          {operatorInkGsm.toFixed(2)} GSM
                        </div>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#94a3b8' }}>vs</div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: isInkGsmHigher ? '#dc2626' : '#059669', fontWeight: '800' }}>ACTUAL CALCULATED</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: isInkGsmHigher ? '#dc2626' : '#059669' }}>
                          {actualCalculatedInkGsm.toFixed(2)} GSM
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Input Rolls Table */}
                {inputRolls.length > 0 && (
                  <div>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#334155', marginBottom: '8px' }}>
                      🎞️ Input Substrate Rolls Roll-Wise Consumption Details ({inputRolls.length} Rolls)
                    </h5>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Roll #</th>
                          <th>Barcode ID</th>
                          <th>Substrate</th>
                          <th>Micron</th>
                          <th>Width (mm)</th>
                          <th>Initial Wt (kg)</th>
                          <th>Consumed Wt (kg)</th>
                          <th>Remaining Wt (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inputRolls.map((r, idx) => {
                          const initW = parseFloat(r.initialWeightKg) || 0;
                          const consW = parseFloat(r.consumedWeightKg) || 0;
                          const balW = Math.max(0, initW - consW);
                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: '700' }}>Roll #{idx + 1}</td>
                              <td><code style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>{r.barcodeId || 'N/A'}</code></td>
                              <td>{r.filmType || 'PET'}</td>
                              <td>{r.micron || 12}µ</td>
                              <td>{r.widthMm || 460} mm</td>
                              <td>{initW.toFixed(1)} kg</td>
                              <td style={{ fontWeight: '800', color: '#0284c7' }}>{consW.toFixed(1)} kg</td>
                              <td>
                                {balW > 0 ? (
                                  <span style={{ fontWeight: '800', color: '#059669' }}>
                                    {balW.toFixed(1)} kg <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(Barcode Generated)</span>
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>0 kg (Fully Consumed)</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Printed Output SFG Rolls Breakdown Table */}
                {outputRolls.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Tag size={16} style={{ color: '#059669' }} /> 🏷️ Printed Output SFG Barcodes & Roll-Wise Production Breakdown ({outputRolls.length} Rolls)
                    </h5>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Roll #</th>
                          <th>SFG Barcode ID</th>
                          <th>Substrate Specs</th>
                          <th>Net Weight (kg)</th>
                          <th>Est. Length (Meters)</th>
                          <th>Destination Bay / Next Stage</th>
                          <th>Inward Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outputRolls.map((r, idx) => {
                          const netW = parseFloat(r.netWeightKg || r.weightKg) || 0;
                          const lengthM = parseFloat(r.lengthMeters) || 0;
                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: '700' }}>Roll #{r.rollNo || r.unitNo || (idx + 1)}</td>
                              <td>
                                <code style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '2px 8px', borderRadius: '4px', fontWeight: '900' }}>
                                  {r.barcodeId || r.id || `SFG-BC-${r.orderId || 'ORD'}-${idx+1}`}
                                </code>
                              </td>
                              <td>{r.filmType || selectedRecord.printFilmType || 'PET'} {r.micron || selectedRecord.micron || 12}µ ({r.widthMm || selectedRecord.printWidthMm || 460}mm)</td>
                              <td style={{ fontWeight: '800', color: '#059669' }}>{netW.toFixed(1)} kg</td>
                              <td style={{ fontWeight: '700', color: '#0284c7' }}>{lengthM > 0 ? `${lengthM.toLocaleString()} m` : '-'}</td>
                              <td>
                                <span style={{ fontSize: '0.74rem', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', color: '#334155', fontWeight: '600' }}>
                                  {r.locationBay || r.nextProcess || 'SFG Store (Pre-Lamination)'}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.inwardDatetime || new Date().toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Ingredient Materials Breakdown Table */}
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--text-primary)' }}>
            📦 Ingredient Materials Issue & Return Record
          </h4>
          <table className="data-table" style={{ marginBottom: '24px' }}>
            <thead>
              <tr>
                <th>Raw Material / Ingredient</th>
                <th>Micron</th>
                <th>Width (mm)</th>
                <th>Issued (kg)</th>
                <th>Returned (kg)</th>
                <th>Net Consumed (kg)</th>
                <th>Unit Price (₹/kg)</th>
                <th>Total Material Cost (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(selectedRecord.materialsList || []).map((m, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '600' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{m.filmType}</span>
                        {m.barcode && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#059669', borderColor: '#a7f3d0' }}
                            onClick={() => setSelectedRollForBarcodeModal({
                              barcodeId: m.barcode,
                              rollType: 'RAW_MATERIAL',
                              itemName: m.filmType,
                              category: m.filmType?.includes('Film') ? 'Film Substrates' : 'General Store',
                              unit: m.unit || 'Kg',
                              micron: parseFloat(m.micron) || 0,
                              widthMm: parseFloat(m.widthMm) || 0,
                              netWeightKg: parseFloat(m.netConsumedQtyKg || m.issueQtyKg) || 0,
                              itemRemarks: m.itemRemarks || m.remarks || m.notes || '',
                              remarks: m.itemRemarks || m.remarks || m.notes || '',
                              notes: m.itemRemarks || m.remarks || m.notes || '',
                              jobName: selectedRecord.jobName,
                              clientName: selectedRecord.clientName,
                              stationId: 'SCALE_2_PRINTING'
                            })}
                            title="Print Input Barcode Tag"
                          >
                            <Printer size={12} /> {m.barcode}
                          </button>
                        )}
                      </div>
                      {(m.itemRemarks || m.remarks || m.notes) && (
                        <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '500' }}>
                          💬 {m.itemRemarks || m.remarks || m.notes}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>{m.micron}</td>
                  <td>{m.widthMm}</td>
                  <td>{m.issueQtyKg} kg</td>
                  <td style={{ color: '#dc2626' }}>{m.returnQtyKg} kg</td>
                  <td style={{ fontWeight: '700' }}>{m.netConsumedQtyKg} kg</td>
                  <td>₹ {m.unitPricePerKg}</td>
                  <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                    ₹ {m.totalMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* SFG / FG Output Production Barcode Tags & Traceability */}
          {(() => {
            const inputBarcodes = (selectedRecord.materialsList || []).map(m => m.barcode).filter(Boolean);
            
            // Gather all linked SFG and FG rolls for this production record
            const rollMap = new Map();
            (selectedRecord.outputRolls || []).forEach(r => {
              if (r && r.barcodeId) rollMap.set(r.barcodeId, r);
            });

            (inventoryRolls || []).forEach(r => {
              const matchJob = (r.orderId && String(r.orderId) === String(selectedRecord.orderId)) ||
                               (r.jobCode && String(r.jobCode).toUpperCase() === String(selectedRecord.jobCode || '').toUpperCase()) ||
                               (r.jobName && (r.jobName || '').toLowerCase().trim() === (selectedRecord.jobName || '').toLowerCase().trim());
              
              const matchType = r.rollType === 'SFG' || r.rollType === 'FG' || (r.category || '').includes('Semi-Finished') || (r.category || '').includes('Finished');

              if (matchJob && matchType && r.barcodeId && !rollMap.has(r.barcodeId)) {
                rollMap.set(r.barcodeId, r);
              }
            });

            const allLinkedRolls = Array.from(rollMap.values());
            const sfgRolls = allLinkedRolls.filter(r => r.rollType === 'SFG' || (r.category || '').includes('Semi-Finished'));
            const fgRolls = allLinkedRolls.filter(r => r.rollType === 'FG' || (r.category || '').includes('Finished'));
            
            const totalSfgKg = sfgRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
            const totalFgKg = fgRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
            const totalOutputKg = totalSfgKg + totalFgKg;

            return (
              <div style={{ marginTop: '20px', padding: '18px 20px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Barcode size={20} style={{ color: '#4f46e5' }} /> SFG / FG Production Output Barcodes & Traceability ({allLinkedRolls.length} Rolls)
                    </h4>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '3px 0 0 0' }}>
                      Individual master rolls weighed on the digital scale with unique 2D ISO 18004 barcodes linked to this job.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ background: '#6d28d9', borderColor: '#6d28d9', padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={handleOpenSfgModal}
                    >
                      <Plus size={13} /> + Add SFG Roll
                    </button>

                    <button
                      type="button"
                      className="btn-primary"
                      style={{ background: '#059669', borderColor: '#059669', padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={handleOpenFgModal}
                    >
                      <Plus size={13} /> + Add FG Roll
                    </button>

                    {allLinkedRolls.length > 0 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                        onClick={() => setSelectedRollForBarcodeModal(allLinkedRolls)}
                      >
                        <Printer size={13} /> Print All Roll Labels ({allLinkedRolls.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Stat Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#6d28d9', textTransform: 'uppercase' }}>
                      📦 Semi-Finished Goods (SFG)
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#4c1d95', marginTop: '2px' }}>
                      {totalSfgKg.toFixed(2)} kg <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>({sfgRolls.length} rolls)</span>
                    </div>
                  </div>

                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase' }}>
                      🏆 Finished Goods (FG)
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#064e3b', marginTop: '2px' }}>
                      {totalFgKg.toFixed(2)} kg <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>({fgRolls.length} rolls)</span>
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                      ⚡ RM Input Traceability
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e293b', marginTop: '4px' }}>
                      {inputBarcodes.length > 0 ? `${inputBarcodes.length} Input RM Barcode(s)` : 'Direct RM Issue'}
                    </div>
                  </div>
                </div>

                {/* Table of all entered SFG & FG Master Rolls */}
                {allLinkedRolls.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600' }}>
                      No SFG or FG master rolls recorded yet for this job.
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '4px 0 12px 0' }}>
                      Weigh master rolls on digital scale and issue barcodes to track stage recovery.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ background: '#6d28d9', borderColor: '#6d28d9', padding: '5px 14px', fontSize: '0.8rem' }}
                        onClick={handleOpenSfgModal}
                      >
                        + Add SFG Roll
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ background: '#059669', borderColor: '#059669', padding: '5px 14px', fontSize: '0.8rem' }}
                        onClick={handleOpenFgModal}
                      >
                        + Add FG Roll
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
                    <table className="data-table" style={{ margin: 0, fontSize: '0.8rem', minWidth: '780px', width: '100%' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ width: '5%', textAlign: 'center' }}>#</th>
                          <th style={{ width: '15%' }}>Category / Type</th>
                          <th style={{ width: '22%' }}>2D Barcode (ISO 18004)</th>
                          <th style={{ width: '10%', textAlign: 'right' }}>Gross (kg)</th>
                          <th style={{ width: '8%', textAlign: 'right' }}>Core (kg)</th>
                          <th style={{ width: '11%', textAlign: 'right' }}>Net Wt (kg)</th>
                          <th style={{ width: '11%', textAlign: 'right' }}>Est. Length</th>
                          <th style={{ width: '10%', textAlign: 'center' }}>QC Status</th>
                          <th style={{ width: '8%', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allLinkedRolls.map((r, idx) => {
                          const isRollSFG = r.rollType === 'SFG' || (r.category || '').includes('Semi-Finished');
                          return (
                            <tr key={r.barcodeId || idx}>
                              <td style={{ textAlign: 'center', fontWeight: '800', color: '#4f46e5' }}>
                                #{idx + 1}
                              </td>

                              <td>
                                <span 
                                  className="badge" 
                                  style={{ 
                                    fontSize: '0.7rem', 
                                    padding: '2px 6px',
                                    background: isRollSFG ? '#ede9fe' : '#ecfdf5',
                                    color: isRollSFG ? '#6d28d9' : '#059669',
                                    border: `1px solid ${isRollSFG ? '#c4b5fd' : '#a7f3d0'}`,
                                    fontWeight: '700'
                                  }}
                                >
                                  {isRollSFG ? 'SFG' : 'FG'}: {r.subType || r.sfgType || r.fgType || 'Master Roll'}
                                </span>
                              </td>

                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <QrCode size={14} style={{ color: '#4f46e5', flexShrink: 0 }} />
                                  <code style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a' }}>
                                    {r.barcodeId}
                                  </code>
                                </div>
                                {(r.machine || r.machineName) && (
                                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                                    {r.machine || r.machineName} {r.shift ? `• ${r.shift}` : ''}
                                  </div>
                                )}
                              </td>

                              <td style={{ textAlign: 'right', fontWeight: '600' }}>
                                {parseFloat(r.grossWeightKg || 0).toFixed(2)} kg
                              </td>

                              <td style={{ textAlign: 'right', color: '#64748b' }}>
                                {parseFloat(r.tareWeightKg || 0).toFixed(1)} kg
                              </td>

                              <td style={{ textAlign: 'right', fontWeight: '900', color: '#047857', fontSize: '0.85rem' }}>
                                {parseFloat(r.netWeightKg || 0).toFixed(2)} kg
                              </td>

                              <td style={{ textAlign: 'right', color: '#1e3a8a', fontWeight: '700' }}>
                                {r.lengthMeters ? `${parseInt(r.lengthMeters).toLocaleString()} m` : '—'}
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                <span className="badge badge-us" style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#dcfce7', color: '#15803d' }}>
                                  <CheckCircle2 size={11} /> {r.qcStatus || 'Passed'}
                                </span>
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#2563eb', borderColor: '#bfdbfe' }}
                                  onClick={() => setSelectedRollForBarcodeModal(r)}
                                  title="Print 2D Barcode Thermal Label"
                                >
                                  <Printer size={12} /> Print
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Consumed SFG Inventory Log (From SFG Store) */}
          {(() => {
            const sfgLogs = selectedRecord.sfgConsumptions || [];
            if (sfgLogs.length === 0) return null;

            return (
              <div style={{ marginTop: '20px', padding: '18px 20px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#c2410c', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={20} style={{ color: '#ea580c' }} /> Consumed SFG Inventory Log (From SFG Store)
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: '#9a3412', fontWeight: '700' }}>
                    {sfgLogs.length} Consumption Event(s)
                  </span>
                </div>

                <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                  <table className="data-table" style={{ fontSize: '0.8rem', width: '100%', margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#fff7ed', color: '#9a3412' }}>
                        <th>Date & Time</th>
                        <th>SFG Batch Barcode</th>
                        <th>Stage Consumed For</th>
                        <th style={{ textAlign: 'right' }}>Consumed Weight (kg)</th>
                        <th style={{ textAlign: 'right' }}>Remaining SFG Balance (kg)</th>
                        <th>Operator</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sfgLogs.map((log, idx) => (
                        <tr key={log.id || idx}>
                          <td style={{ color: '#64748b', fontSize: '0.78rem' }}>
                            {new Date(log.timestamp || log.date).toLocaleString()}
                          </td>
                          <td>
                            <code style={{ background: '#fff3ed', border: '1px solid #fdba74', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', color: '#c2410c' }}>
                              {log.sfgBatchCode || 'SFG-BATCH'}
                            </code>
                          </td>
                          <td style={{ fontWeight: '700', color: '#0f172a' }}>
                            {log.targetProcess}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#ea580c' }}>
                            {log.consumedKg} kg
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#15803d' }}>
                            {log.remainingBalanceKg} kg
                          </td>
                          <td style={{ color: '#334155' }}>
                            {log.operatorName || '-'}
                          </td>
                          <td style={{ color: '#64748b', fontSize: '0.78rem' }}>
                            {log.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* ADMIN ROLE ONLY: FINANCIAL PROFITABILITY & COST VARIANCE ANALYSIS */}
          {/* ========================================================================= */}
          {isAdmin ? (
            <div className="glass-panel" style={{ marginTop: '24px', padding: '24px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #cbd5e1', paddingBottom: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DollarSign size={20} /> Admin Financial Profitability & Cost Variance Report
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Quoted Pre-Costing Target vs Post-Production Actual Material & Operating Costs
                  </p>
                </div>
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={12} /> Visible Only to Admin Role
                </span>
              </div>

              {(() => {
                // Calculate Profitability & Variances strictly from REAL database datapoints
                const linkedOrder = orders.find(o => 
                  (selectedRecord.orderId && String(o.id) === String(selectedRecord.orderId)) ||
                  (selectedRecord.jobCode && String(o.jobCode || '').toUpperCase() === String(selectedRecord.jobCode).toUpperCase()) ||
                  (selectedRecord.jobName && (o.jobName || '').toLowerCase().trim() === (selectedRecord.jobName || '').toLowerCase().trim())
                ) || null;

                const linkedJobMaster = jobMasters.find(j => 
                  (selectedRecord.jobMasterId && String(j.id) === String(selectedRecord.jobMasterId)) ||
                  (selectedRecord.jobCode && String(j.jobCode || '').toUpperCase() === String(selectedRecord.jobCode).toUpperCase()) ||
                  (selectedRecord.jobName && (j.jobName || '').toLowerCase().trim() === (selectedRecord.jobName || '').toLowerCase().trim())
                ) || null;

                const actualQtyKg = Number(selectedRecord.totalProductionQtyKg || selectedRecord.qtyDispatch || selectedRecord.qtySecondPassL2 || selectedRecord.qtyFirstPassL1 || 0);
                const targetOrderQtyKg = Number(linkedOrder?.orderQtyKg || linkedOrder?.quantityKg || linkedOrder?.jobQuantityKg || actualQtyKg || 0);

                const sellingPricePerKg = Number(
                  selectedRecord.sellingPricePerKg ||
                  linkedOrder?.sellingPricePerKg ||
                  linkedOrder?.pricePerKg ||
                  linkedOrder?.rate ||
                  linkedOrder?.unitPrice ||
                  linkedOrder?.orderRatePerKg ||
                  linkedJobMaster?.sellingPricePerKg ||
                  linkedJobMaster?.pricePerKg ||
                  (linkedOrder?.totalAmount && targetOrderQtyKg > 0 ? (linkedOrder.totalAmount / targetOrderQtyKg) : 0) ||
                  0
                );

                const materials = selectedRecord.materialsList || [];
                const filmsCost = materials.filter(m => 
                  (m.filmType || m.category || m.itemName || '').toLowerCase().includes('film') || 
                  (m.filmType || '').match(/pet|bopp|ldpe|poly|cpp|foil|met/i)
                ).reduce((a, b) => a + (parseFloat(b.totalMaterialCost) || 0), 0);

                const inksSolventsCost = materials.filter(m => 
                  (m.filmType || m.category || m.itemName || '').toLowerCase().includes('ink') || 
                  (m.filmType || m.category || m.itemName || '').toLowerCase().includes('solvent') || 
                  (m.filmType || '').match(/ea|cy|mg|ye|bl|wh|reducer|retarder|ethyl/i)
                ).reduce((a, b) => a + (parseFloat(b.totalMaterialCost) || 0), 0);

                const adhesiveLoggedCost = materials.filter(m => 
                  (m.filmType || m.category || m.itemName || '').toLowerCase().includes('adhesive') || 
                  (m.filmType || m.category || m.itemName || '').toLowerCase().includes('hardener') || 
                  (m.filmType || '').match(/adh|hard|polyurethane/i)
                ).reduce((a, b) => a + (parseFloat(b.totalMaterialCost) || 0), 0);

                const totalAdhesiveConsumedKg = (parseFloat(selectedRecord.adhesiveConsumedL1Kg) || 0) + (parseFloat(selectedRecord.adhesiveConsumedL2Kg) || 0);
                const adhesiveCost = adhesiveLoggedCost > 0 ? adhesiveLoggedCost : (totalAdhesiveConsumedKg * 270);

                const actualProcCost = parseFloat(selectedRecord.totalProcessingCostRs) || parseFloat(selectedRecord.processingCostRs) || (actualQtyKg * (parseFloat(selectedRecord.processingCostPerKg) || 25));
                const actualMaterialCost = filmsCost + inksSolventsCost + adhesiveCost;
                const actualProductionCost = Number(selectedRecord.finalProductionCostRs || selectedRecord.totalProductionCostRs || 0) || (actualMaterialCost + actualProcCost);

                const totalGrossRevenue = actualQtyKg > 0 && sellingPricePerKg > 0 ? Math.round(actualQtyKg * sellingPricePerKg) : 0;
                const netProfitRs = totalGrossRevenue > 0 ? totalGrossRevenue - actualProductionCost : 0;
                const profitMarginPct = totalGrossRevenue > 0 ? ((netProfitRs / totalGrossRevenue) * 100).toFixed(1) : null;

                // Dynamic Pre-Costing Target from Orders / Job Masters
                let preCosting = linkedOrder?.calculationDetails || linkedOrder?.preCosting || linkedJobMaster?.calculationDetails || linkedJobMaster?.preCosting || null;

                if (!preCosting && linkedJobMaster?.layers?.length > 0 && typeof calculateJobRawMaterials === 'function') {
                  try {
                    preCosting = calculateJobRawMaterials({
                      jobName: selectedRecord.jobName,
                      printWidthMm: linkedJobMaster.printWidthMm || 1000,
                      repeatLengthMm: linkedJobMaster.repeatLengthMm || 400,
                      orderQtyKg: targetOrderQtyKg > 0 ? targetOrderQtyKg : 1000,
                      layers: linkedJobMaster.layers
                    });
                  } catch (err) {
                    console.warn("Dynamic pre-costing calculation warning:", err);
                  }
                }

                const hasPreCosting = Boolean(preCosting && (preCosting.summary || preCosting.totalRawMaterialCost || preCosting.grandTotalCost || preCosting.estimatedCost));
                const estRawMaterialCost = hasPreCosting ? Number(preCosting.summary?.totalRawMaterialCost || preCosting.totalRawMaterialCost || preCosting.rawMaterialCost || 0) : 0;
                const estProcessingCost = hasPreCosting ? Number(preCosting.summary?.totalProcessingCost || preCosting.totalProcessingCost || preCosting.processingCost || 0) : 0;
                const estTotalCost = hasPreCosting ? (estRawMaterialCost + estProcessingCost || Number(preCosting.summary?.grandTotalCost || preCosting.grandTotalCost || preCosting.estimatedCost || 0)) : 0;

                const costVarianceRs = hasPreCosting && estTotalCost > 0 ? actualProductionCost - estTotalCost : 0;
                const costVariancePct = hasPreCosting && estTotalCost > 0 ? ((costVarianceRs / estTotalCost) * 100).toFixed(1) : null;

                const isHighProfit = totalGrossRevenue > 0 && Number(profitMarginPct) >= 20;
                const isModerateProfit = totalGrossRevenue > 0 && Number(profitMarginPct) >= 10 && Number(profitMarginPct) < 20;
                const isLowProfit = totalGrossRevenue > 0 && Number(profitMarginPct) >= 0 && Number(profitMarginPct) < 10;
                const isLoss = totalGrossRevenue > 0 && Number(profitMarginPct) < 0;

                return (
                  <div>
                    {/* Key Metric KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>CONTRACT REVENUE</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0284c7', marginTop: '4px' }}>
                          {totalGrossRevenue > 0 ? `₹ ${totalGrossRevenue.toLocaleString('en-IN')}` : '— (No Selling Price)'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Selling Rate: {sellingPricePerKg > 0 ? `₹ ${sellingPricePerKg}/kg` : 'Not Set'} {actualQtyKg > 0 ? `• ${actualQtyKg.toFixed(1)} kg` : ''}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>QUOTED TARGET COST</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                          {hasPreCosting && estTotalCost > 0 ? `₹ ${Math.round(estTotalCost).toLocaleString('en-IN')}` : '— (No Pre-Costing Target)'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {hasPreCosting && targetOrderQtyKg > 0 ? `Pre-Cost Rate: ₹ ${(estTotalCost / targetOrderQtyKg).toFixed(2)}/kg` : 'No pre-costing target attached'}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>ACTUAL PRODUCTION COST</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: hasPreCosting && costVarianceRs > 0 ? '#b91c1c' : '#047857', marginTop: '4px' }}>
                          ₹ {Math.round(actualProductionCost).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: hasPreCosting ? (costVarianceRs > 0 ? '#dc2626' : '#059669') : 'var(--text-muted)', marginTop: '2px', fontWeight: '700' }}>
                          {hasPreCosting && estTotalCost > 0 ? (
                            costVarianceRs > 0 ? `Variance: +₹ ${Math.round(costVarianceRs).toLocaleString()} (+${costVariancePct}%)` : `Variance: -₹ ${Math.abs(Math.round(costVarianceRs)).toLocaleString()} (${costVariancePct}%)`
                          ) : (
                            `Actual Cost Rate: ₹ ${actualQtyKg > 0 ? (actualProductionCost / actualQtyKg).toFixed(2) : '0'}/kg`
                          )}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: isHighProfit ? '#ecfdf5' : isModerateProfit ? '#f0f9ff' : isLowProfit ? '#fffbeb' : isLoss ? '#fef2f2' : '#f8fafc', border: `1px solid ${isHighProfit ? '#a7f3d0' : isModerateProfit ? '#bae6fd' : isLowProfit ? '#fde68a' : isLoss ? '#fca5a5' : '#cbd5e1'}` }}>
                        <div style={{ fontSize: '0.78rem', color: isHighProfit ? '#065f46' : isModerateProfit ? '#0369a1' : isLowProfit ? '#92400e' : isLoss ? '#991b1b' : '#475569', fontWeight: '800' }}>NET PROFIT / MARGIN</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: isHighProfit ? '#047857' : isModerateProfit ? '#0284c7' : isLowProfit ? '#b45309' : isLoss ? '#dc2626' : '#1e293b', marginTop: '4px' }}>
                          {totalGrossRevenue > 0 ? `₹ ${Math.round(netProfitRs).toLocaleString('en-IN')} (${profitMarginPct}%)` : '—'}
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          {totalGrossRevenue > 0 ? (
                            <span className={`badge ${isHighProfit ? 'badge-success' : isModerateProfit ? 'badge-info' : isLowProfit ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                              {isHighProfit ? '🟢 HIGH PROFIT (+20%+)' : isModerateProfit ? '🔵 GOOD MARGIN (10-20%)' : isLowProfit ? '🟡 THIN MARGIN (<10%)' : '🔴 COST OVERRUN / LOSS'}
                            </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                              Set selling price in Order to compute margin
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Variance Breakdown Table */}
                    <h5 style={{ fontSize: '0.92rem', fontWeight: '800', marginBottom: '10px', color: 'var(--text-primary)' }}>
                      📊 Cost Element Variance Breakdown
                    </h5>
                    <table className="data-table" style={{ background: '#ffffff' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th>Cost Component</th>
                          <th>Pre-Costing Quoted Target (₹)</th>
                          <th>Post-Production Actual (₹)</th>
                          <th>Cost Variance Delta (₹)</th>
                          <th>Variance Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const estFilmCost = hasPreCosting ? Number(preCosting.summary?.totalFilmCost || (preCosting.summary?.totalFilmGrossKg && preCosting.summary?.avgFilmRate ? preCosting.summary.totalFilmGrossKg * preCosting.summary.avgFilmRate : (preCosting.filmDetails?.totalCost || 0))) : 0;
                          const estInkCost = hasPreCosting ? Number(preCosting.summary?.totalInkCost || (preCosting.inkDetails?.grossKg && preCosting.inkDetails?.ratePerKg ? preCosting.inkDetails.grossKg * preCosting.inkDetails.ratePerKg : (preCosting.inkDetails?.totalCost || 0))) : 0;
                          const estAdhesiveCost = hasPreCosting ? Number(preCosting.summary?.totalAdhesiveCost || (preCosting.adhesiveDetails?.grossKg && preCosting.adhesiveDetails?.ratePerKg ? preCosting.adhesiveDetails.grossKg * preCosting.adhesiveDetails.ratePerKg : (preCosting.adhesiveDetails?.totalCost || 0))) : 0;
                          const estProcCost = hasPreCosting ? Number(preCosting.summary?.totalProcessingCost || preCosting.totalProcessingCost || preCosting.processingCost || 0) : 0;

                          const rows = [
                            { label: "Film Substrates (PET / LDPE / BOPP)", est: Math.round(estFilmCost), act: Math.round(filmsCost) },
                            { label: "Printing Inks & Solvents", est: Math.round(estInkCost), act: Math.round(inksSolventsCost) },
                            { label: "Lamination Adhesives & Hardeners", est: Math.round(estAdhesiveCost), act: Math.round(adhesiveCost) },
                            { label: "Machine Processing & Conversion Overhead", est: Math.round(estProcCost), act: Math.round(actualProcCost) }
                          ];

                          return rows.map((r, idx) => {
                            const hasEst = hasPreCosting && r.est > 0;
                            const delta = hasEst ? r.act - r.est : 0;
                            const deltaPct = hasEst ? ((delta / r.est) * 100).toFixed(1) : 0;
                            const isOver = delta > 0;

                            return (
                              <tr key={idx}>
                                <td style={{ fontWeight: '700' }}>{r.label}</td>
                                <td>{hasEst ? `₹ ${r.est.toLocaleString()}` : '— (No Target)'}</td>
                                <td style={{ fontWeight: '700' }}>₹ {r.act.toLocaleString()}</td>
                                <td style={{ fontWeight: '800', color: hasEst ? (isOver ? '#dc2626' : '#059669') : 'var(--text-muted)' }}>
                                  {hasEst ? (isOver ? `+₹ ${delta.toLocaleString()} (+${deltaPct}%)` : `${delta.toLocaleString()} (${deltaPct}%)`) : '—'}
                                </td>
                                <td>
                                  {hasEst ? (
                                    <span className={`badge ${isOver ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.72rem' }}>
                                      {isOver ? '🔺 COST OVERRUN' : '🟢 SAVING / WITHIN BUDGET'}
                                    </span>
                                  ) : (
                                    <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                                      Actual Logged
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )})()}
              </div>
            ) : (
            <div style={{ marginTop: '20px', padding: '14px 18px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} /> <span>Financial Profitability, Revenue Margins & Cost Variance reports are restricted to the <b>Admin Role</b>.</span>
            </div>
          )}
        </div>
      )}



      {/* SCRAP INVENTORY & DISPOSAL TAB VIEW */}
      {activeTab === 'scrap_inventory' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ♻️ Plant Scrap Inventory & Disposal Stock Register
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                Track accumulated process wastage across 6 standard categories and log disposal sales to remove scrap from factory stock.
              </p>
            </div>

            <button className="btn-primary" style={{ background: '#b45309', borderColor: '#b45309' }} onClick={() => setIsDisposeModalOpen(true)}>
              <Plus size={16} /> Dispose Scrap / Log Clearance
            </button>
          </div>

          {/* 6 Category Stock Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {Object.entries(scrapStockData).map(([cat, qty]) => (
              <div key={cat} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#92400e', textTransform: 'uppercase' }}>{cat}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#78350f', marginTop: '6px' }}>
                  {qty.toFixed(1)} <span style={{ fontSize: '0.85rem' }}>kg</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total In-Stock Banner */}
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: '14px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ fontWeight: '800', color: '#78350f', fontSize: '0.95rem' }}>
              Total Net Scrap Stock Available in Factory:
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#92400e' }}>
              {totalScrapStockInPlantKg.toFixed(1)} kg
            </div>
          </div>

          {/* Scrap Disposal Transactions History Table */}
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>📋 Scrap Disposal Clearance History ({scrapDisposals.length})</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref / Gate Pass #</th>
                  <th>Disposal Date</th>
                  <th>Scrap Category</th>
                  <th>Disposed Qty (kg)</th>
                  <th>Vendor / Buyer</th>
                  <th>Disposed By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {scrapDisposals.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      No scrap disposals recorded yet. Click "Dispose Scrap / Log Clearance" to register a clearance sale.
                    </td>
                  </tr>
                ) : (
                  scrapDisposals.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{d.refNo}</td>
                      <td>{d.date}</td>
                      <td style={{ fontWeight: '600' }}>{d.category}</td>
                      <td style={{ fontWeight: '800', color: '#dc2626' }}>-{d.qtyKg} kg</td>
                      <td>{d.vendor}</td>
                      <td style={{ fontSize: '0.78rem' }}>{d.disposedBy}</td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{d.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: FILL NEW PRODUCTION RECORD */}
      {activeTab === 'new_record' && (
        <form onSubmit={handleOpenConfirmModal} className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)' }}>
            📝 Fill Job Production Record & Ingredient Usage
          </h3>

          <div className="form-grid" style={{ marginBottom: '24px' }}>
            <div className="form-group">
              <label>Select Job / Order</label>
              <select 
                className="form-control"
                value={selectedOrder?.id || ''}
                onChange={e => handleSelectOrderForRecord(e.target.value)}
                required
              >
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.jobName} ({o.clientName})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Client Name</label>
              <input type="text" className="form-control" value={selectedOrder?.clientName || ''} readOnly />
            </div>

            <div className="form-group">
              <label>Record Filled By</label>
              <input type="text" className="form-control" value={`${currentUser.name} (${currentUser.role})`} readOnly />
            </div>
          </div>

          {/* Ingredient Materials Form Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                📦 Ingredient Materials Issued & Returned List (Pre-selected from Job Master)
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Substrate layers pre-filled as per Job Master. Any variation in Micron, Width, or Substrate type will be calculated and highlighted automatically.
              </p>
            </div>
            <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={addMaterialRow}>
              <Plus size={14} /> Add Raw Material Row
            </button>
          </div>

          <table className="data-table" style={{ marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ minWidth: '220px' }}>Raw Material / Ingredient</th>
                <th style={{ minWidth: '170px' }}>Barcode / Roll ID (Scan 📷)</th>
                <th style={{ width: '85px' }}>Micron</th>
                <th style={{ width: '95px' }}>Width (mm)</th>
                <th style={{ width: '110px' }}>Issued Qty (kg)</th>
                <th style={{ width: '110px' }}>Unused Return (kg)</th>
                <th style={{ color: '#047857' }}>Net Consumed (kg)</th>
                <th style={{ width: '110px' }}>Unit Rate (₹/kg)</th>
                <th>Total Cost (₹)</th>
                <th style={{ width: '50px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {calculatedMaterials.map((m) => {
                const isPartialReturn = (parseFloat(m.returnQtyKg) || 0) > 0;
                const rawMaterialOptions = [
                  ...new Set([
                    'PET Film',
                    'METPET Film',
                    'Natural LD Film',
                    'Ethyl Acetate (Solvent)',
                    'Toluene (Solvent)',
                    'MIBK (Solvent)',
                    'Liquid Inks & Solvents',
                    'Solvent-less Adhesive',
                    'Solvent-based Adhesive',
                    'Milky LD Film',
                    'BOPP Natural',
                    'Matte Finish BOPP',
                    'Metalised BOPP',
                    'Pearlised BOPP',
                    'CPP Natural',
                    'Metalised CPP',
                    ...inventory.map(i => i.filmType).filter(Boolean)
                  ])
                ];

                return (
                  <tr key={m.id}>
                    <td>
                      <select 
                        className="form-control"
                        style={{ fontWeight: '600', minWidth: '180px' }}
                        value={m.filmType}
                        onChange={e => {
                          const val = e.target.value;
                          updateMaterialRow(m.id, 'filmType', val);
                          if (DEFAULT_DAILY_RATES[val]) {
                            updateMaterialRow(m.id, 'unitPricePerKg', DEFAULT_DAILY_RATES[val]);
                          }
                        }}
                      >
                        {rawMaterialOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      {m.hasFilmTypeVar && (
                        <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '3px', display: 'block' }}>
                          ⚠️ Substrate Mismatch vs JM ({m.jobMasterFilmType})
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          className="form-control"
                          style={{ paddingLeft: '28px', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: '700', background: m.barcode ? '#f0f9ff' : '#ffffff' }}
                          placeholder="Scan or type Barcode..."
                          value={m.barcode || ''}
                          onChange={e => {
                            const val = e.target.value;
                            updateMaterialRow(m.id, 'barcode', val);
                            if (val.trim()) {
                              // 1. Primary lookup in individual barcode rolls
                              const rollMatch = (inventoryRolls || []).find(r => 
                                (r.barcodeId || '').toLowerCase() === val.trim().toLowerCase() ||
                                (r.batchNo || '').toLowerCase() === val.trim().toLowerCase()
                              );

                              if (rollMatch) {
                                updateMaterialRow(m.id, 'issueQtyKg', rollMatch.availableWeightKg || rollMatch.netWeightKg || 400);
                                updateMaterialRow(m.id, 'returnQtyKg', 0);
                                if (rollMatch.filmType && rollMatch.filmType !== '-') updateMaterialRow(m.id, 'filmType', rollMatch.filmType);
                                if (rollMatch.micron) updateMaterialRow(m.id, 'micron', rollMatch.micron);
                                if (rollMatch.widthMm) updateMaterialRow(m.id, 'widthMm', rollMatch.widthMm);
                                const rate = rollMatch.purchaseRatePerKg || rollMatch.unitPrice || rollMatch.purchaseRate || 0;
                                if (rate > 0) updateMaterialRow(m.id, 'unitPricePerKg', rate);
                                if (rollMatch.unit) updateMaterialRow(m.id, 'unit', rollMatch.unit);
                                const remark = rollMatch.itemRemarks || rollMatch.remarks || rollMatch.notes;
                                if (remark) {
                                  updateMaterialRow(m.id, 'itemRemarks', remark);
                                  updateMaterialRow(m.id, 'notes', remark);
                                }
                              } else {
                                // 2. Fallback lookup in central inventory
                                const match = (inventory || []).find(inv => 
                                  (inv.itemCode || '').toLowerCase() === val.trim().toLowerCase() ||
                                  (inv.lastBatch || '').toLowerCase() === val.trim().toLowerCase() || 
                                  (inv.id || '').toLowerCase() === val.trim().toLowerCase() ||
                                  (inv.filmType || '').toLowerCase() === val.trim().toLowerCase()
                                );
                                if (match) {
                                  updateMaterialRow(m.id, 'issueQtyKg', match.availableQtyKg || 400);
                                  updateMaterialRow(m.id, 'returnQtyKg', 0);
                                  if (match.filmType) updateMaterialRow(m.id, 'filmType', match.filmType);
                                  if (match.micron) updateMaterialRow(m.id, 'micron', match.micron);
                                  if (match.widthMm) updateMaterialRow(m.id, 'widthMm', match.widthMm);
                                  const rate = match.unitPrice || match.purchaseRatePerKg || DEFAULT_DAILY_RATES[match.filmType] || 120;
                                  updateMaterialRow(m.id, 'unitPricePerKg', rate);
                                  if (match.unit) updateMaterialRow(m.id, 'unit', match.unit);
                                }
                              }
                            }
                          }}
                        />
                        <Scan size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: m.barcode ? '#0284c7' : '#94a3b8' }} />
                        {m.barcode && (
                          <button
                            type="button"
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: '#059669',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              zIndex: 10
                            }}
                            onClick={() => {
                              setSelectedRollForBarcodeModal({
                                barcodeId: m.barcode,
                                rollType: 'RAW_MATERIAL',
                                itemName: m.filmType || 'Film Substrate',
                                micron: parseFloat(m.micron) || 0,
                                widthMm: parseFloat(m.widthMm) || 0,
                                netWeightKg: parseFloat(m.issueQtyKg) || 0,
                                stationId: 'SCALE_2_PRINTING'
                              });
                            }}
                            title="Print Barcode Tag"
                          >
                            <Printer size={14} />
                          </button>
                        )}
                      </div>
                    </td>

                    <td>
                      <input 
                        type="text" 
                        className="form-control"
                        value={m.micron}
                        onChange={e => updateMaterialRow(m.id, 'micron', e.target.value)}
                      />
                      {m.micronVarPct !== null && (
                        <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '2px', display: 'block' }}>
                          ⚠️ {m.micronVarPct > 0 ? `+${m.micronVarPct}%` : `${m.micronVarPct}%`}
                        </span>
                      )}
                    </td>

                    <td>
                      <input 
                        type="text" 
                        className="form-control"
                        value={m.widthMm}
                        onChange={e => updateMaterialRow(m.id, 'widthMm', e.target.value)}
                      />
                      {m.widthVarPct !== null && (
                        <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '2px', display: 'block' }}>
                          ⚠️ {m.widthVarPct > 0 ? `+${m.widthVarPct}%` : `${m.widthVarPct}%`}
                        </span>
                      )}
                    </td>

                    <td>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        style={{ fontWeight: '600' }}
                        value={m.issueQtyKg}
                        onChange={e => updateMaterialRow(m.id, 'issueQtyKg', e.target.value)}
                        required
                      />
                    </td>

                    <td>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        style={{ fontWeight: '600', color: isPartialReturn ? '#dc2626' : 'var(--text-muted)' }}
                        value={m.returnQtyKg}
                        onChange={e => updateMaterialRow(m.id, 'returnQtyKg', e.target.value)}
                      />
                    </td>

                    <td>
                      <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.9rem' }}>
                        {m.netConsumedQtyKg} kg
                      </div>
                      {isPartialReturn ? (
                        <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 5px', marginTop: '3px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                          📦 {m.returnQtyKg} kg returned
                        </span>
                      ) : (
                        <span className="badge badge-us" style={{ fontSize: '0.68rem', padding: '1px 5px', marginTop: '3px' }}>
                          Return: 0 kg
                        </span>
                      )}
                    </td>

                    <td>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        value={m.unitPricePerKg}
                        onChange={e => updateMaterialRow(m.id, 'unitPricePerKg', e.target.value)}
                        required
                      />
                    </td>

                    <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      ₹ {m.totalMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td>
                      <button type="button" className="icon-btn-danger" onClick={() => removeMaterialRow(m.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* SFG & FG Master Rolls Output Banner for Selected Order */}
          {(() => {
            const formLinkedRolls = (inventoryRolls || []).filter(r => {
              if (!selectedOrder) return false;
              const matchJob = (r.orderId && String(r.orderId) === String(selectedOrder.id)) ||
                               (r.jobCode && String(r.jobCode).toUpperCase() === String(selectedOrder.jobCode || '').toUpperCase()) ||
                               (r.jobName && (r.jobName || '').toLowerCase().trim() === (selectedOrder.jobName || '').toLowerCase().trim());
              return matchJob && (r.rollType === 'SFG' || r.rollType === 'FG' || (r.category || '').includes('Semi-Finished') || (r.category || '').includes('Finished'));
            });

            const sfgRolls = formLinkedRolls.filter(r => r.rollType === 'SFG' || (r.category || '').includes('Semi-Finished'));
            const fgRolls = formLinkedRolls.filter(r => r.rollType === 'FG' || (r.category || '').includes('Finished'));
            const totalSfgKg = sfgRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
            const totalFgKg = fgRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);

            return (
              <div style={{ marginBottom: '24px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Barcode size={18} style={{ color: '#4f46e5' }} /> SFG / FG Output Barcode Master Rolls ({formLinkedRolls.length} Rolls Weighed)
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                      Weigh master rolls on digital scale and issue barcodes linked to <strong>{selectedOrder?.jobName || 'this job'}</strong>.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ background: '#6d28d9', borderColor: '#6d28d9', padding: '4px 10px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={handleOpenSfgModal}
                    >
                      <Plus size={12} /> + Add SFG
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ background: '#059669', borderColor: '#059669', padding: '4px 10px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={handleOpenFgModal}
                    >
                      <Plus size={12} /> + Add FG
                    </button>
                    {formLinkedRolls.length > 0 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => setSelectedRollForBarcodeModal(formLinkedRolls)}
                      >
                        <Printer size={12} /> Print Barcodes ({formLinkedRolls.length})
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                  <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: '6px', padding: '6px 12px', color: '#6d28d9', fontWeight: '700' }}>
                    SFG Output: <strong>{totalSfgKg.toFixed(1)} kg</strong> ({sfgRolls.length} rolls)
                  </div>
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '6px 12px', color: '#059669', fontWeight: '700' }}>
                    FG Output: <strong>{totalFgKg.toFixed(1)} kg</strong> ({fgRolls.length} rolls)
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px', color: '#334155', fontWeight: '700' }}>
                    Cumulative Production Recovery: <strong>{(totalSfgKg + totalFgKg).toFixed(1)} kg</strong>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* STAGE-WISE PRODUCTION QUANTITIES & PROCESS SCRAP INPUTS */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚙️ Stage-wise Production Quantities & Scrap Wastage Inputs
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Enter net usable roll output and stage-wise scrap generated at each manufacturing step.
                </p>
              </div>
              <div style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '6px 12px', borderRadius: '20px', fontWeight: '700', color: '#475569' }}>
                Total Scrap Logged: <span style={{ color: '#b45309', fontWeight: '800' }}>{totalScrapQtyKg.toFixed(1)} kg</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* STAGE 1: PRINTING */}
              <div style={{ background: '#ffffff', border: '1px solid #bae6fd', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.05)' }}>
                <div style={{ background: '#f0f9ff', padding: '12px 20px', borderBottom: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#0369a1', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#0284c7', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>1</span>
                    Stage 1: Printing
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1' }}>
                    Printing Pass (Surface & Reverse)
                  </span>
                </div>

                {/* Printing Job Run Duration & Timestamps from Scheduler */}
                {(selectedRecord?.printingStartTime || selectedOrder?.printingStartTime) && (
                  <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#166534', fontWeight: '700' }}>
                        <Clock size={15} style={{ color: '#16a34a' }} />
                        <span>
                          Press Execution: Started at {new Date(selectedRecord?.printingStartTime || selectedOrder?.printingStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {(selectedRecord?.printingEndTime || selectedOrder?.printingEndTime) && ` • Ended at ${new Date(selectedRecord?.printingEndTime || selectedOrder?.printingEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      </div>
                      {(selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted || selectedRecord?.inkGsmInSpeed || selectedOrder?.inkGsmInSpeed) && (
                        <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: '600' }}>
                          {(selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted) && (
                            <span style={{ marginRight: '12px' }}>
                              📏 Actual Meters: <strong>{Number(selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted).toLocaleString()} m</strong>
                            </span>
                          )}
                          {(selectedRecord?.inkGsmInSpeed || selectedOrder?.inkGsmInSpeed) && (
                            <span>
                              🎨 Ink GSM (In Speed): <strong>{Number(selectedRecord?.inkGsmInSpeed || selectedOrder?.inkGsmInSpeed).toFixed(2)} GSM</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {(selectedRecord?.printingDurationFormatted || selectedOrder?.printingDurationFormatted) && (
                      <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', fontWeight: '800', fontSize: '0.78rem', padding: '6px 12px' }}>
                        ⏱ Duration: {selectedRecord?.printingDurationFormatted || selectedOrder?.printingDurationFormatted}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  {/* Left Column: Stage Output */}
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', margin: 0 }}>
                        🟢 Printing Output (kg) *
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtyFirstPassL1(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '800', fontSize: '1.1rem', background: '#ffffff', color: '#0369a1', border: '1.5px solid #38bdf8' }} 
                      value={qtyFirstPassL1} 
                      onChange={e => setQtyFirstPassL1(e.target.value)} 
                      required 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Net usable roll weight after printing pass
                    </div>

                    {/* Actual Ink GSM input by Operator */}
                    <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0369a1', margin: 0 }}>
                          🎨 Actual Dry Ink GSM (g/m²)
                        </label>
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#0284c7', background: '#e0f2fe', padding: '1px 6px', borderRadius: '4px' }}>
                          Target: {targetInkGsm || 1.5} GSM
                        </span>
                      </div>
                      <input 
                        type="number" 
                        step="0.05" 
                        min="0"
                        className="form-control" 
                        style={{ fontWeight: '700', fontSize: '0.95rem', background: '#ffffff', color: '#0369a1', borderColor: '#0284c7' }} 
                        value={actualInkGsm} 
                        onChange={e => setActualInkGsm(e.target.value)} 
                        placeholder={`e.g. ${targetInkGsm || 1.5}`}
                      />
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                        Input by Machine Operator during printing job run
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Process Scrap */}
                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Printing Stage Scrap & Wastage (kg)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Printing Plain Setting (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={printingPlainSettingWastageKg} 
                          onChange={e => setPrintingPlainSettingWastageKg(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Printing Wastage (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={printingWastageKg} 
                          onChange={e => setPrintingWastageKg(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 2: PRINTING INSPECTION */}
              <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(217, 119, 6, 0.04)' }}>
                <div style={{ background: '#fffbeb', padding: '12px 20px', borderBottom: '1px solid #fef3c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#b45309', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#d97706', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>2</span>
                    STAGE 2: Printing Inspection (Quality Check Pass)
                  </div>
                  <span className="badge badge-us" style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#b45309' }}>
                    Optional Quality Check Pass
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', margin: 0 }}>
                        🟢 Inspected Roll Qty (kg)
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtyInspection(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '800', fontSize: '1.1rem', background: '#ffffff', color: '#b45309', border: '1.5px solid #f59e0b' }} 
                      value={qtyInspection} 
                      onChange={e => setQtyInspection(e.target.value)} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Passed quantity after doctoring / inspection
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Inspection Defect Scrap (kg)
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                        Printed Defect Wastage Scrap (kg)
                      </label>
                      <input 
                        type="number" 
                        step="0.1" 
                        className="form-control" 
                        style={{ background: '#ffffff', fontWeight: '700', width: '60%' }} 
                        value={printedWastageKg} 
                        onChange={e => setPrintedWastageKg(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 3: FIRST PASS L1 (LAMINATION PASS 1) */}
              <div style={{ background: '#ffffff', border: '1px solid #c7d2fe', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.05)' }}>
                <div style={{ background: '#eef2ff', padding: '12px 20px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#4338ca', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#4f46e5', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>3</span>
                    Stage 3: First Pass L1 (Lamination Pass 1)
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca' }}>
                    2-Layer & 3-Layer Jobs
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#4338ca', textTransform: 'uppercase', margin: 0 }}>
                        🟢 First Pass L1 Output (kg)
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtyLaminationL1(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '800', fontSize: '1.1rem', background: '#ffffff', color: '#4338ca', border: '1.5px solid #818cf8' }} 
                      value={qtyLaminationL1} 
                      onChange={e => setQtyLaminationL1(e.target.value)} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Lamination roll output weight for 1st lamination pass
                    </div>

                    {/* Actual Adhesive GSM input by Operator */}
                    <div style={{ marginTop: '12px', padding: '10px 12px', background: '#eef2ff', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#4338ca', margin: 0 }}>
                          🧪 Actual Adhesive GSM (g/m²)
                        </label>
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#4338ca', background: '#e0e7ff', padding: '1px 6px', borderRadius: '4px' }}>
                          Target: {targetAdhesiveGsm || 1.5} GSM
                        </span>
                      </div>
                      <input 
                        type="number" 
                        step="0.05" 
                        min="0"
                        className="form-control" 
                        style={{ fontWeight: '700', fontSize: '0.95rem', background: '#ffffff', color: '#4338ca', borderColor: '#818cf8' }} 
                        value={actualAdhesiveGsm} 
                        onChange={e => setActualAdhesiveGsm(e.target.value)} 
                        placeholder={`e.g. ${targetAdhesiveGsm || 1.5}`}
                      />
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                        Input by Machine Operator during lamination job run
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Lamination Pass 1 Scrap & Consumables
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Lamination Plain Substrate Scrap (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={laminationPlainSubstrateWastageKg} 
                          onChange={e => setLaminationPlainSubstrateWastageKg(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#4338ca', display: 'block', marginBottom: '4px' }}>
                          🧪 Adhesive Consumed (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #a5b4fc' }} 
                          value={adhesiveConsumedL1Kg} 
                          onChange={e => setAdhesiveConsumedL1Kg(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 4: SECOND PASS L2 (LAMINATION PASS 2) */}
              <div style={{ background: '#ffffff', border: '1px solid #f5d0fe', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(192, 38, 211, 0.04)' }}>
                <div style={{ background: '#fdf4ff', padding: '12px 20px', borderBottom: '1px solid #fae8ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#86198f', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#a21caf', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>4</span>
                    Stage 4: Second Pass L2 (Lamination Pass 2 - Optional - For 3 Layer Jobs Only)
                  </div>
                  <span className="badge badge-warning" style={{ fontSize: '0.72rem', background: '#fae8ff', color: '#86198f', border: '1px solid #f5d0fe' }}>
                    For 3-Layer Laminate Jobs Only
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#86198f', textTransform: 'uppercase', margin: 0 }}>
                        🟢 Second Pass L2 Output (kg)
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtySecondPassL2(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '800', fontSize: '1.1rem', background: '#ffffff', color: '#86198f', border: '1.5px solid #e879f9' }} 
                      value={qtySecondPassL2} 
                      onChange={e => setQtySecondPassL2(e.target.value)} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Lamination roll output weight for 3rd layer pass
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Lamination Pass 2 Scrap & Consumables
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Lamination Plain Substrate Scrap (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={laminationPlainSubstrateWastageL2Kg} 
                          onChange={e => setLaminationPlainSubstrateWastageL2Kg(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#86198f', display: 'block', marginBottom: '4px' }}>
                          🧪 Adhesive Consumed (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #f0abfc' }} 
                          value={adhesiveConsumedL2Kg} 
                          onChange={e => setAdhesiveConsumedL2Kg(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 5: SLITTING & REWINDING */}
              <div style={{ background: '#ffffff', border: '1px solid #a7f3d0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(5, 150, 105, 0.05)' }}>
                <div style={{ background: '#ecfdf5', padding: '12px 20px', borderBottom: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#059669', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>5</span>
                    STAGE 5: SLITTING & REWINDING
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem', background: '#d1fae5', color: '#047857' }}>
                    Reel Conversion Pass
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase', margin: 0 }}>
                        🟢 Slitting Finished Output (kg)
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtySlitting(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '800', fontSize: '1.1rem', background: '#ffffff', color: '#047857', border: '1.5px solid #10b981' }} 
                      value={qtySlitting} 
                      onChange={e => setQtySlitting(e.target.value)} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Total slit reels weight ready for packing / pouching
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Slitting Stage Scrap & Paper Core Consumed
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Laminate Wastage (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={laminateWastageKg} 
                          onChange={e => setLaminateWastageKg(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Side Trim Wastage (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={trimWastageKg} 
                          onChange={e => setTrimWastageKg(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#047857', display: 'block', marginBottom: '4px' }}>
                          📦 Paper Core Consumed (kg / Pcs)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #6ee7b7' }} 
                          value={paperCoreConsumedKg} 
                          onChange={e => setPaperCoreConsumedKg(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 6: POUCHING (OPTIONAL - FOR POUCH FORM JOBS ONLY) */}
              <div style={{ background: '#ffffff', border: '1px solid #99f6e4', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(13, 148, 136, 0.05)' }}>
                <div style={{ background: '#f0fdfa', padding: '12px 20px', borderBottom: '1px solid #ccfbf1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#0f766e', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#0d9488', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>6</span>
                    Stage 6: Pouching (Optional - For Pouch Form Jobs Only)
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e' }}>
                    Pouch Form Jobs Only
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f766e', textTransform: 'uppercase', margin: 0 }}>
                        🟢 Pouching Finished Output (kg / Pcs)
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtyPouching(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '800', fontSize: '1.1rem', background: '#ffffff', color: '#0f766e', border: '1.5px solid #2dd4bf' }} 
                      value={qtyPouching} 
                      onChange={e => setQtyPouching(e.target.value)} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Total finished pouch weight / count after pouch conversion
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Pouching Consumables & Scrap
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f766e', display: 'block', marginBottom: '4px' }}>
                          Zipper Quantity Consumed (kg / m)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #5eead4' }} 
                          value={zipperConsumedKg} 
                          onChange={e => setZipperConsumedKg(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '4px' }}>
                          Pouching Scrap (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700' }} 
                          value={pouchingScrapKg} 
                          onChange={e => setPouchingScrapKg(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 7: DISPATCH READY */}
              <div style={{ background: '#ffffff', border: '2px solid #059669', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.1)' }}>
                <div style={{ background: '#ecfdf5', padding: '14px 20px', borderBottom: '1.5px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '900', color: '#047857', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#059669', color: '#ffffff', width: '26px', height: '26px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '900' }}>7</span>
                    STAGE 7: FINAL DISPATCH READY QUANTITY
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.75rem', background: '#059669', color: '#ffffff', padding: '3px 10px' }}>
                    Benchmark Output Weight
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '20px', alignItems: 'center' }}>
                  <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1.5px solid #86efac' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: '900', color: '#166534', textTransform: 'uppercase', margin: 0 }}>
                        🎯 Dispatch Ready Quantity (kg) *
                      </label>
                      <WeighingScaleCaptureButton onCapture={(weight) => setQtyDispatch(weight)} />
                    </div>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control" 
                      style={{ fontWeight: '900', fontSize: '1.2rem', background: '#ffffff', color: '#047857', border: '2px solid #059669' }} 
                      value={qtyDispatch} 
                      onChange={e => setQtyDispatch(e.target.value)} 
                      required 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '6px', fontWeight: '600' }}>
                      Final billable packed quantity ready for customer dispatch
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#78350f', textTransform: 'uppercase' }}>
                      Total Scrap Logged
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#b45309', marginTop: '4px' }}>
                      {totalScrapQtyKg.toFixed(1)} kg
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '2px', fontWeight: '700' }}>
                      {overallScrapPctOfDispatch}% of dispatch ready weight
                    </div>
                  </div>

                  <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' }}>
                      Overall Factory Scrap Share
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0284c7', marginTop: '4px' }}>
                      {overallScrapPctOfOutput}%
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: '2px', fontWeight: '600' }}>
                      Of total gross material output ({totalJobMaterialOutputKg.toFixed(1)} kg)
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Cost Summary Box with Formula */}
          <div className="glass-card" style={{ background: '#f8fafc', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--primary-brand)', marginBottom: '16px' }}>
              📐 COST OF PRODUCTION FORMULA: (Total Qty Produced × Processing Cost Rate) + (Ingredients Cost)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              <div>
                <span className="stats-title">Total Net Qty Produced</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '4px' }}>
                  {(totalNetQtyKg ?? 0).toLocaleString()} <span style={{ fontSize: '0.85rem' }}>kg</span>
                </div>
              </div>

              <div>
                <span className="stats-title">Total Ingredients Cost</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '4px' }}>
                  ₹ {totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  (Sum of ingredients used in table above)
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Processing & Lamination Rate (₹ / kg)
                </label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ marginTop: '4px', fontSize: '1rem', fontWeight: '700' }}
                  value={processingCostPerKg}
                  onChange={e => setProcessingCostPerKg(e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Processing Cost: ₹ {totalProcessingCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '20px' }}>
                <span className="stats-title" style={{ color: '#047857' }}>TOTAL COST OF PRODUCTION</span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857', marginTop: '4px' }}>
                  ₹ {finalProductionCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={() => setActiveTab('list')}>
              Cancel
            </button>
            <button 
              type="button" 
              className="btn-primary" 
              style={{ background: '#059669', borderColor: '#059669', padding: '10px 20px', fontSize: '0.9rem' }}
              onClick={handleOpenConfirmModal}
            >
              <CheckCircle2 size={18} /> Submit Record for Admin Approval
            </button>
          </div>
        </form>
      )}

      {/* DETAILED CONFIRMATION POPUP MODAL WITH FIELD WARNING AUDIT */}
      {isConfirmModalOpen && (
        <div className="modal-overlay" onClick={() => setIsConfirmModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '880px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', padding: '28px' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileSpreadsheet style={{ color: 'var(--primary-brand)' }} /> Confirm Job Production Record Submission
                </h3>
                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Please review the stage-by-stage metric summary, material consumptions, scrap generation, and field warnings before submitting for Admin approval.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsConfirmModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* FIELD COMPLETION & WARNING AUDIT BANNER */}
            {unfilledWarnings.length > 0 ? (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c2410c', fontWeight: '800', fontSize: '0.88rem', marginBottom: '10px' }}>
                  <AlertCircle size={18} />
                  Attention: {unfilledWarnings.length} Field(s) / Metrics Not Filled or Set to Zero
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '8px' }}>
                  {unfilledWarnings.map((warn, idx) => (
                    <div key={idx} style={{ background: '#ffffff', border: '1px solid #ffedd5', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: '#ffedd5', color: '#9a3412', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                        {warn.stage}
                      </span>
                      <span style={{ color: '#7c2d12', fontWeight: '600' }}>{warn.message}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9a3412', marginTop: '10px', margin: 0, fontStyle: 'italic' }}>
                  💡 You can click <strong>"← Go Back & Add / Edit Values"</strong> to enter missing data, or proceed to submit if these zero values are intentional.
                </p>
              </div>
            ) : (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', color: '#047857', fontSize: '0.85rem', fontWeight: '700' }}>
                <ShieldCheck size={20} style={{ color: '#059669' }} />
                All Key Stage Metrics, Materials & Consumables Completed Successfully!
              </div>
            )}

            {/* Job & Client Meta Header */}
            <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', fontSize: '0.83rem' }}>
              <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>JOB ID / ORDER</span> <strong style={{ color: 'var(--primary-brand)', fontSize: '0.95rem' }}>{selectedOrder?.id}</strong></div>
              <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>JOB NAME</span> <strong style={{ fontSize: '0.9rem' }}>{selectedOrder?.jobName}</strong></div>
              <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>CLIENT / CUSTOMER</span> <strong>{selectedOrder?.clientName}</strong></div>
              <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>ORDER TARGET QTY</span> <strong>{(selectedOrder?.orderQtyKg || 0).toLocaleString()} kg</strong></div>
              <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>RECORDED BY</span> <strong>{currentUser.name} ({currentUser.role})</strong></div>
            </div>

            {/* STAGE-BY-STAGE PRODUCTION & CONSUMABLES SUMMARY */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Package size={15} /> Stage-wise Output Quantities & Consumables Summary
              </h4>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="data-table" style={{ fontSize: '0.78rem', margin: 0 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th>Stage Name</th>
                      <th>Finished / Output Qty</th>
                      <th>Consumables Used</th>
                      <th>Process Scrap Logged</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Stage 1: Printing */}
                    <tr>
                      <td style={{ fontWeight: '700' }}>Stage 1: Printing</td>
                      <td style={{ fontWeight: '700', color: (parseFloat(qtyFirstPassL1) || 0) > 0 ? '#0f172a' : '#c2410c' }}>
                        {qtyFirstPassL1 || 0} kg
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>Inks & Solvent</td>
                      <td>
                        {((parseFloat(printingPlainSettingWastageKg) || 0) + (parseFloat(printingWastageKg) || 0)).toFixed(1)} kg
                      </td>
                      <td>
                        {(parseFloat(qtyFirstPassL1) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ Filled</span>
                        ) : (
                          <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem' }}>⚠️ 0 kg</span>
                        )}
                      </td>
                    </tr>

                    {/* Stage 2: Printing Inspection */}
                    <tr>
                      <td style={{ fontWeight: '700' }}>Stage 2: Inspection</td>
                      <td style={{ fontWeight: '700' }}>{qtyInspection || 0} kg</td>
                      <td style={{ color: 'var(--text-muted)' }}>—</td>
                      <td>—</td>
                      <td>
                        {(parseFloat(qtyInspection) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ Filled</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Optional</span>
                        )}
                      </td>
                    </tr>

                    {/* Stage 3: Lamination Pass 1 */}
                    <tr>
                      <td style={{ fontWeight: '700' }}>Stage 3: Lamination L1</td>
                      <td style={{ fontWeight: '700', color: (parseFloat(qtyLaminationL1) || 0) > 0 ? '#0f172a' : '#c2410c' }}>
                        {qtyLaminationL1 || 0} kg
                      </td>
                      <td>Adhesive: <strong>{adhesiveConsumedL1Kg || 0} kg</strong></td>
                      <td>
                        {((parseFloat(laminationPlainSubstrateWastageKg) || 0) + (parseFloat(printedWastageKg) || 0)).toFixed(1)} kg
                      </td>
                      <td>
                        {(parseFloat(qtyLaminationL1) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ Filled</span>
                        ) : (
                          <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem' }}>⚠️ 0 kg</span>
                        )}
                      </td>
                    </tr>

                    {/* Stage 4: Lamination Pass 2 */}
                    <tr>
                      <td style={{ fontWeight: '700' }}>Stage 4: Lamination L2</td>
                      <td style={{ fontWeight: '700' }}>{qtySecondPassL2 || 0} kg</td>
                      <td>Adhesive L2: <strong>{adhesiveConsumedL2Kg || 0} kg</strong></td>
                      <td>{(parseFloat(laminationPlainSubstrateWastageL2Kg) || 0).toFixed(1)} kg</td>
                      <td>
                        {(parseFloat(qtySecondPassL2) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ Filled</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>0 kg / Optional</span>
                        )}
                      </td>
                    </tr>

                    {/* Stage 5: Slitting */}
                    <tr>
                      <td style={{ fontWeight: '700' }}>Stage 5: Slitting</td>
                      <td style={{ fontWeight: '700', color: (parseFloat(qtySlitting) || 0) > 0 ? '#0f172a' : '#c2410c' }}>
                        {qtySlitting || 0} kg
                      </td>
                      <td>Paper Core: <strong>{paperCoreConsumedKg || 0} kg</strong></td>
                      <td>
                        {((parseFloat(laminateWastageKg) || 0) + (parseFloat(trimWastageKg) || 0)).toFixed(1)} kg
                      </td>
                      <td>
                        {(parseFloat(qtySlitting) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ Filled</span>
                        ) : (
                          <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem' }}>⚠️ 0 kg</span>
                        )}
                      </td>
                    </tr>

                    {/* Stage 6: Pouching */}
                    <tr>
                      <td style={{ fontWeight: '700' }}>Stage 6: Pouching</td>
                      <td style={{ fontWeight: '700' }}>{qtyPouching || 0} kg/pcs</td>
                      <td>Zipper: <strong>{zipperConsumedKg || 0} kg</strong></td>
                      <td>{(parseFloat(pouchingScrapKg) || 0).toFixed(1)} kg</td>
                      <td>
                        {(parseFloat(qtyPouching) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ Filled</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Roll Form / 0 kg</span>
                        )}
                      </td>
                    </tr>

                    {/* Stage 7: Final Dispatch Ready */}
                    <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                      <td style={{ fontWeight: '800', color: '#0369a1' }}>Stage 7: Final Dispatch Ready</td>
                      <td style={{ fontWeight: '900', fontSize: '0.9rem', color: (parseFloat(qtyDispatch) || 0) > 0 ? '#059669' : '#dc2626' }}>
                        {qtyDispatch || 0} kg
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>Final Packaging</td>
                      <td style={{ fontWeight: '800', color: '#b45309' }}>
                        Total Scrap: {totalScrapQtyKg.toFixed(1)} kg ({overallScrapPctOfDispatch}%)
                      </td>
                      <td>
                        {(parseFloat(qtyDispatch) || 0) > 0 ? (
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>✓ READY</span>
                        ) : (
                          <span className="badge badge-danger" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.68rem' }}>🚨 UNENTERED (0 kg)</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Itemized Material Usage & Spec Variation Preview */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                📦 Consumed Ingredients & Substrates ({calculatedMaterials.length} Lines)
              </h4>
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: '0.78rem', margin: 0 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th>Substrate / Film Type</th>
                      <th>Spec Variation vs Job Master</th>
                      <th>Issued</th>
                      <th>Returned</th>
                      <th>Net Consumed</th>
                      <th>Unit Rate</th>
                      <th>Total Material Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedMaterials.map((m, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '600' }}>
                          {m.filmType}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.itemName}</div>
                        </td>
                        <td>
                          {m.hasVariation ? (
                            <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem' }}>
                              ⚠️ {m.micronVarPct !== null && `Micron: ${m.micronVarPct > 0 ? `+${m.micronVarPct}%` : `${m.micronVarPct}%`} `}
                              {m.widthVarPct !== null && `Width: ${m.widthVarPct > 0 ? `+${m.widthVarPct}%` : `${m.widthVarPct}%`} `}
                              {m.hasFilmTypeVar && `Type Mismatch `}
                            </span>
                          ) : (
                            <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>
                              Exact Match
                            </span>
                          )}
                        </td>
                        <td>{m.issueQtyKg} kg</td>
                        <td style={{ color: (parseFloat(m.returnQtyKg) || 0) > 0 ? '#047857' : 'inherit', fontWeight: '600' }}>
                          {m.returnQtyKg || 0} kg
                        </td>
                        <td style={{ fontWeight: '700', color: m.netConsumedQtyKg > 0 ? '#0f172a' : '#c2410c' }}>
                          {m.netConsumedQtyKg} kg
                          {m.netConsumedQtyKg === 0 && <span style={{ fontSize: '0.65rem', color: '#c2410c', display: 'block' }}>⚠️ Unconsumed</span>}
                        </td>
                        <td>₹ {(parseFloat(m.unitPricePerKg) || 0).toLocaleString()}/kg</td>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>₹ {(m.totalMaterialCost ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Costing & Financial Summary Box */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px 20px', borderRadius: '10px', marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.85rem', marginBottom: '12px' }}>
                <div>Dispatch Ready Produced Qty: <strong>{(totalNetQtyKg ?? 0).toLocaleString()} kg</strong></div>
                <div>Total Ingredients Cost: <strong>₹ {totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                <div>Processing Rate: <strong>₹ {processingCostPerKg}/kg</strong></div>
                <div>Total Processing Cost: <strong>₹ {totalProcessingCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                <div>Total Scrap Generated: <strong style={{ color: '#b45309' }}>{totalScrapQtyKg.toFixed(1)} kg ({overallScrapPctOfDispatch}% of dispatch)</strong></div>
              </div>

              <div style={{ borderTop: '1px solid #6ee7b7', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '800', color: '#065f46', fontSize: '0.95rem' }}>TOTAL COST OF PRODUCTION:</span>
                <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857' }}>
                  ₹ {finalProductionCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '10px 18px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }} 
                onClick={() => setIsConfirmModalOpen(false)}
              >
                ← Go Back & Add / Edit Values
              </button>

              <button 
                type="button" 
                className="btn-primary" 
                style={{ background: '#059669', borderColor: '#059669', padding: '10px 24px', fontSize: '0.9rem' }}
                onClick={handleFinalSubmitRecord}
              >
                <CheckCircle2 size={18} /> Confirm & Submit for Admin Approval
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DISPOSE SCRAP MODAL */}
      {isDisposeModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDisposeModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '520px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ♻️ Log Scrap Disposal & Remove Stock
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '16px' }}>
              Record scrap sale / clearance to deduct weight from plant scrap inventory.
            </p>

            <form onSubmit={handleAddScrapDisposal}>
              <div className="form-group">
                <label>Scrap Category *</label>
                <select className="form-control" value={disposeCategory} onChange={e => setDisposeCategory(e.target.value)}>
                  <option value="Printing Plain Setting (kg)">Printing Plain Setting (kg)</option>
                  <option value="Printing Wastage (kg)">Printing Wastage (kg)</option>
                  <option value="Lamination Plain Substrate (kg)">Lamination Plain Substrate (kg)</option>
                  <option value="Printed Wastage (kg)">Printed Wastage (kg)</option>
                  <option value="Laminate Wastage (kg)">Laminate Wastage (kg)</option>
                  <option value="Trim Wastage (kg)">Trim Wastage (kg)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Disposal Qty (kg) *</label>
                  <input type="number" step="0.1" className="form-control" required value={disposeQtyKg} onChange={e => setDisposeQtyKg(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Gate Pass / Invoice #</label>
                  <input type="text" className="form-control" placeholder="e.g. GP-9821" value={disposeRefNo} onChange={e => setDisposeRefNo(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Scrap Buyer / Recycler Vendor Name</label>
                <input type="text" className="form-control" placeholder="e.g. Universal Traders & Recyclers" value={disposeVendor} onChange={e => setDisposeVendor(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Remarks / Notes</label>
                <input type="text" className="form-control" placeholder="Optional notes..." value={disposeNotes} onChange={e => setDisposeNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsDisposeModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: '#b45309', borderColor: '#b45309' }}>
                  <CheckCircle2 size={16} /> Confirm Scrap Disposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRollForBarcodeModal && (
        <BarcodePrinterModal 
          roll={selectedRollForBarcodeModal} 
          inventory={inventory}
          onClose={() => setSelectedRollForBarcodeModal(null)} 
        />
      )}
    </div>
  );
}
