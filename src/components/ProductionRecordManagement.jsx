import React, { useState, useMemo, useEffect } from 'react';
import { formatPlantDateTime } from '../utils/dbDates';
import SearchableSelect from './SearchableSelect';
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
  X,
  QrCode,
  Zap,
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  RefreshCw
} from 'lucide-react';
import WeighingScaleInput from './WeighingScaleInput';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import BarcodePrinterModal from './BarcodePrinterModal';
import CylinderJobCardForm from '../CylinderJobCardForm';
import SFGFGEntryModal from './SFGFGEntryModal';
import { DEFAULT_DAILY_RATES, generateBarcodeId, calculateJobRawMaterials, calculatePreVsPostCosting } from '../factoryStore';
import { notifyProductionRecordSubmitted, notifyProductionRecordApproved, notifyOverWastageAlert } from '../services/emailService';
import { pushSlugState } from '../utils/slugRouter';
import {
  additionalSubstrate2Materials,
  consumptionOutputNetKg,
  consumptionOutputTrace,
  outputRollsFromLog,
  resolveInputSubstrateBarcodes,
  sharedInputWeight,
  substrate2InputRolls
} from '../utils/consumeRollEntries';
import TablePagination, { usePagination } from './TablePagination';
import { supabase } from '../services/supabaseClient';
import { fetchScrapDisposals, saveScrapDisposal, describeSaveError } from '../services/businessRecords';
import { getMaterialCostSettings, fetchMaterialCostSettingsFromSupabase, DEFAULT_MATERIAL_COST_SETTINGS } from '../services/settingsService';
import { roundToTwo, formatUpToTwoDecimals, formatCurrency, formatQty } from '../utils/numberHelpers';
import { codeStartsWith, codesEqual } from '../utils/barcodeCode';
import MeasureRangeHint from './MeasureRangeHint';
import RollLineageSummary from './RollLineageSummary';
import {
  NOT_RECORDED,
  displayQuantity,
  displayText,
  describeSubstrateAnalysis,
  assessFormMeasures,
  finiteNumber
} from '../utils/productionRecordQuality';
import { lineageProblems } from '../utils/rollLineage';
import {
  GUARDRAIL_SETTING_KEY,
  JM_UNRESOLVED_LABEL,
  UNKNOWN,
  applyGuardrailFields,
  canOverrideFilmType,
  compareRollToSpec,
  decideGuardrailSave,
  dispatchReadyKg,
  printLayerSpec,
  recordedPrintWidthMm,
  resolveJobMaster,
  rollSfgScrapIntoRecord,
  substrateMatchSummary,
  validateProductionEntry
} from '../utils/jobMasterGuardrails';
import { factoryCalendarDate } from '../services/employeeAttendance';
import { fetchSystemSetting } from '../services/supabaseDataService';
import { inputRollWeightsFromLog } from '../utils/consumeMassBalance';

function measureInputValue(value, fallback) {
  const primary = finiteNumber(value);
  if (primary !== null) return primary;
  const next = finiteNumber(fallback);
  return next === null ? '' : next;
}

/**
 * Roll-Wise Input Vs Output Reconciliation Component for SFG / FG Output Barcode Master Rolls
 */
function RollWiseInputOutputMasterRolls({
  targetOrder,
  targetRecord,
  orders = [],
  productionRecords = [],
  inventoryRolls = [],
  sfgGoods = [],
  materialsList = [],
  onOpenSfgModal,
  onOpenFgModal,
  onSelectRollForBarcodeModal
}) {
  // 1. Resolve effective order and record
  const effectiveOrder = targetOrder || (orders || []).find(o => {
    if (!targetRecord) return false;
    const cleanO = String(o.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    const cleanR = String(targetRecord.orderId || targetRecord.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    return cleanO === cleanR || (targetRecord.jobCode && o.jobCode === targetRecord.jobCode) || (targetRecord.jobName && o.jobName && o.jobName.trim().toLowerCase() === targetRecord.jobName.trim().toLowerCase());
  });

  const effectiveRecord = targetRecord || (productionRecords || []).find(r => {
    if (!effectiveOrder) return false;
    const cleanR = String(r.orderId || r.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    const cleanO = String(effectiveOrder.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    return cleanR === cleanO || (effectiveOrder.jobCode && r.jobCode === effectiveOrder.jobCode) || (effectiveOrder.jobName && r.jobName && r.jobName.trim().toLowerCase() === effectiveOrder.jobName.trim().toLowerCase());
  });

  const rawOrderId = effectiveOrder?.id || effectiveRecord?.orderId || effectiveRecord?.id || '';
  const cleanOrderId = String(rawOrderId).replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
  const targetJobCode = String(effectiveOrder?.jobCode || effectiveRecord?.jobCode || '').trim().toLowerCase();
  const targetJobName = String(effectiveOrder?.jobName || effectiveRecord?.jobName || '').trim().toLowerCase();

  // 2. Collect SFG Store Consumption history for this job/order
  const sfgLogs = [
    ...(Array.isArray(effectiveRecord?.sfgConsumptions) ? effectiveRecord.sfgConsumptions : []),
    ...(Array.isArray(effectiveOrder?.sfgConsumptions) ? effectiveOrder.sfgConsumptions : [])
  ].filter((log, idx, arr) => {
    const key = log.id || `${log.timestamp || log.date}-${log.sfgBatchCode}-${log.targetProcess}`;
    return arr.findIndex(l => (l.id || `${l.timestamp || l.date}-${l.sfgBatchCode}-${l.targetProcess}`) === key) === idx;
  });

  // 3. Collect real SFG & FG output master rolls (Strictly no dummy or seeded rolls)
  const rollMap = new Map();
  const addRoll = (r) => {
    if (!r) return;
    const barcode = String(r.barcodeId || r.sfgBatchCode || r.sfg_batch_code || r.rollId || r.barcode || r.id || '').trim();
    if (!barcode) return;

    // Discard any synthetic or placeholder identifiers
    if (barcode.startsWith('RM-IN-') || barcode.startsWith('mat-') || barcode === 'null' || barcode === 'undefined') return;

    const rOrderId = String(r.orderId || r.order_id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    const rJobCode = String(r.jobCode || r.job_code || '').trim().toLowerCase();
    const rJobName = String(r.jobName || r.job_name || '').trim().toLowerCase();
    const rBatch = barcode.toLowerCase();

    const matches = (cleanOrderId && rOrderId && rOrderId === cleanOrderId) ||
                    (cleanOrderId && rBatch.includes(cleanOrderId)) ||
                    (targetJobCode && rJobCode && rJobCode === targetJobCode) ||
                    (targetJobName && rJobName && (rJobName.includes(targetJobName) || targetJobName.includes(rJobName)));

    if (!matches) return;

    const rType = String(r.rollType || r.roll_type || r.sfgType || r.sfg_type || r.category || '').toLowerCase();
    const isExplicitRm = rType.includes('raw') || rType === 'rm' || rType.includes('chemical') || rType.includes('ink') || rType.includes('solvent') || barcode.startsWith('CON-');
    if (isExplicitRm && !barcode.startsWith('SFG-') && !barcode.startsWith('FG-')) {
      return; // Raw material rolls are input rolls, not output master rolls
    }

    const isRealSfgOrFg = rType.includes('sfg') || rType.includes('semi') || rType.includes('fg') || rType.includes('finish') || rType.includes('printed') || barcode.startsWith('SFG-') || barcode.startsWith('FG-');
    if (!isRealSfgOrFg) return;

    const netKg = parseFloat(r.netWeightKg || r.total_net_kg || r.totalNetKg || r.availableWeightKg || r.available_weight_kg || 0) || 0;
    const grossKg = parseFloat(r.grossWeightKg || r.total_gross_kg || r.totalGrossKg || 0) || 0;
    const tareKg = parseFloat(r.tareWeightKg || r.tare_weight_kg || 0) || 0;
    const lengthM = parseFloat(r.lengthMeters || r.total_meters || r.totalMeters || r.meters || 0) || 0;

    // Discard entries with 0 weight (not weighed or uninitialized placeholder)
    if (netKg <= 0 && grossKg <= 0) return;

    if (!rollMap.has(barcode)) {
      const isFg = rType.includes('finish') || rType === 'fg' || barcode.startsWith('FG-');
      const film = r.filmType || r.film_type || effectiveOrder?.printFilmType || '';
      const micron = finiteNumber(r.micron ?? effectiveOrder?.micron);
      const widthMm = finiteNumber(r.widthMm ?? r.width_mm ?? effectiveOrder?.printWidthMm ?? effectiveOrder?.widthMm);
      const qc = r.qcStatus || r.qc_status || 'Approved';
      const loc = r.locationBay || r.storageBay || r.storage_bay || (isFg ? 'FG Warehouse' : 'SFG Store');

      rollMap.set(barcode, {
        ...r,
        id: barcode,
        barcodeId: barcode,
        rollType: isFg ? 'FG' : 'SFG',
        category: isFg ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
        netWeightKg: netKg,
        grossWeightKg: grossKg,
        tareWeightKg: tareKg,
        lengthMeters: lengthM,
        filmType: film,
        micron: Number(micron),
        widthMm: Number(widthMm),
        qcStatus: qc,
        locationBay: loc,
        inputSubstrateBarcodes: resolveInputSubstrateBarcodes(r),
        inputRollsTraceability: r.inputRollsTraceability || []
      });
    }
  };

  (effectiveRecord?.outputRolls || []).forEach(addRoll);
  (effectiveRecord?.rollsBreakdown || []).forEach(addRoll);
  (effectiveRecord?.stages?.printing?.outputRolls || []).forEach(addRoll);
  (effectiveOrder?.rollsBreakdown || []).forEach(addRoll);
  (effectiveOrder?.outputRolls || []).forEach(addRoll);
  (inventoryRolls || []).forEach(addRoll);
  (sfgGoods || []).forEach(addRoll);

  // Add output rolls recorded via SFG Store Consumption
  sfgLogs.forEach(log => {
    const trace = consumptionOutputTrace(log);
    outputRollsFromLog(log).forEach((outputRoll) => {
      const outB = String(outputRoll.barcode || outputRoll.barcodeId || '').trim();
      if (!outB) return;
      addRoll({
        ...outputRoll,
        barcodeId: outB,
        orderId: log.orderId || effectiveOrder?.id,
        jobName: log.jobName || effectiveOrder?.jobName,
        jobCode: log.jobCode || effectiveOrder?.jobCode,
        rollType: outputRoll.outputType || 'SFG',
        stage: log.targetProcess || outputRoll.stage,
        inputSubstrateBarcodes: trace.inputSubstrateBarcodes,
        inputRollsTraceability: trace.inputRollsTraceability
      });
    });
  });

  const linkedRolls = Array.from(rollMap.values());

  // 4. Collect Real Input Substrate Rolls (From Active Print Run or SFG Store Consumption ONLY)
  // Strictly filter out empty or un-scanned items; never synthesize dummy rolls from formulation layers
  const rawPressInputs = [
    ...(Array.isArray(effectiveRecord?.inputRollsList) ? effectiveRecord.inputRollsList : []),
    ...(Array.isArray(effectiveRecord?.stages?.printing?.inputRollsList) ? effectiveRecord.stages.printing.inputRollsList : []),
    ...(Array.isArray(effectiveOrder?.inputRollsList) ? effectiveOrder.inputRollsList : [])
  ];

  const validPressInputRolls = rawPressInputs.filter(r => {
    if (!r) return false;
    const bId = String(r.barcodeId || r.barcode || '').trim();
    if (!bId || bId.startsWith('RM-IN-') || bId.startsWith('mat-') || bId === 'null' || bId === 'undefined') {
      return false;
    }
    const consW = parseFloat(r.consumedWeightKg || r.consumedWeight || r.initialWeightKg || r.initialWeight || 0);
    return consW > 0;
  }).map((r, i) => ({
    id: r.id || `in-roll-${i + 1}`,
    barcodeId: String(r.barcodeId || r.barcode).trim(),
    filmType: r.filmType || effectiveOrder?.printFilmType || '',
    micron: finiteNumber(r.micron),
    widthMm: finiteNumber(r.widthMm),
    initialWeightKg: parseFloat(r.initialWeightKg || r.initialWeight || r.consumedWeightKg || 0) || 0,
    consumedWeightKg: parseFloat(r.consumedWeightKg || r.consumedWeight || r.initialWeightKg || 0) || 0,
    source: 'Active Print Run'
  }));

  // Collect input rolls from SFG Store Consumption logs (e.g. SFG master roll + Substrate 2 & 3 consumed)
  const sfgInputRolls = [];
  sfgLogs.forEach(log => {
    if (log.sfgBatchCode && parseFloat(log.consumedKg) > 0) {
      const rollWeights = inputRollWeightsFromLog(log);
      sfgInputRolls.push({
        id: `sfg-cons-${log.id || log.sfgBatchCode}`,
        barcodeId: log.sfgBatchCode,
        filmType: log.filmType || '',
        micron: finiteNumber(log.micron),
        widthMm: finiteNumber(log.widthMm),
        initialWeightKg: rollWeights.initialWeightKg,
        consumedWeightKg: rollWeights.consumedWeightKg,
        source: `SFG Store (${log.targetProcess || 'Consumption'})`
      });
    }
    substrate2InputRolls(log).forEach((roll) => sfgInputRolls.push(roll));
    if (log.substrate3 && log.substrate3.barcode && parseFloat(log.substrate3.consumedKg) > 0) {
      sfgInputRolls.push({
        id: `sub3-cons-${log.id || log.substrate3.barcode}`,
        barcodeId: log.substrate3.barcode,
        filmType: log.substrate3.filmType || '',
        micron: finiteNumber(log.substrate3.micron),
        widthMm: finiteNumber(log.substrate3.widthMm),
        initialWeightKg: parseFloat(log.substrate3.initialKg || log.substrate3.consumedKg) || 0,
        consumedWeightKg: parseFloat(log.substrate3.consumedKg) || 0,
        source: `SFG Store (${log.targetProcess || 'Lamination Pass 2'})`
      });
    }
  });

  const inputRollMap = new Map();
  [...validPressInputRolls, ...sfgInputRolls].forEach(r => {
    if (r.barcodeId && !inputRollMap.has(r.barcodeId)) {
      inputRollMap.set(r.barcodeId, r);
    }
  });
  const inputRolls = Array.from(inputRollMap.values());

  // 5. Pair Input vs Output Roll-Wise
  const pairedRolls = [];
  const usedInputIds = new Set();

  linkedRolls.forEach((outRoll, outIdx) => {
    const linkedInputBarcodes = outRoll.inputSubstrateBarcodes || 
      (outRoll.inputRollsTraceability || []).map(r => r.barcodeId).filter(Boolean) || [];

    let matchedInputs = [];
    if (linkedInputBarcodes.length > 0) {
      matchedInputs = inputRolls.filter(inR => inR && linkedInputBarcodes.includes(inR.barcodeId));
    }
    if (matchedInputs.length === 0 && inputRolls[outIdx]) {
      matchedInputs = [inputRolls[outIdx]];
    } else if (matchedInputs.length === 0 && inputRolls.length === 1) {
      matchedInputs = [inputRolls[0]];
    }

    matchedInputs.forEach(inR => {
      if (inR?.id || inR?.barcodeId) {
        usedInputIds.add(inR.id || inR.barcodeId);
      }
    });

    const primaryInput = matchedInputs[0] || null;
    const rawInConsKg = matchedInputs.reduce((sum, inR) => sum + (parseFloat(inR.consumedWeightKg) || 0), 0);
    const rawInInitKg = matchedInputs.reduce((sum, inR) => sum + (parseFloat(inR.initialWeightKg) || (parseFloat(inR.consumedWeightKg) || 0)), 0);
    const inConsKg = sharedInputWeight(outRoll, linkedRolls, rawInConsKg);
    const inInitKg = sharedInputWeight(outRoll, linkedRolls, rawInInitKg);
    const outNetKg = parseFloat(outRoll.netWeightKg || 0);
    const outGrossKg = parseFloat(outRoll.grossWeightKg || (outNetKg > 0 ? outNetKg + 0.8 : 0));
    const outLengthM = parseFloat(outRoll.lengthMeters || 0);

    const deltaKg = inConsKg > 0 ? Number((outNetKg - inConsKg).toFixed(2)) : 0;
    const deltaPct = inConsKg > 0 ? Number(((deltaKg / inConsKg) * 100).toFixed(2)) : 0;
    const recoveryPct = inConsKg > 0 ? Number(((outNetKg / inConsKg) * 100).toFixed(1)) : (outNetKg > 0 ? 100 : 0);

    pairedRolls.push({
      rollNo: outRoll.rollNo || outIdx + 1,
      outputRoll: outRoll,
      inputRoll: primaryInput,
      linkedInputList: matchedInputs,
      outNetKg,
      outGrossKg,
      outLengthM,
      inConsKg,
      inInitKg,
      inBalKg: Math.max(0, inInitKg - inConsKg),
      deltaKg,
      deltaPct,
      recoveryPct
    });
  });

  // Any leftover real input rolls with actual barcodes from Active Print Run / SFG store with no output yet
  inputRolls.forEach((inRoll) => {
    const key = inRoll.id || inRoll.barcodeId;
    if (key && !usedInputIds.has(key) && !pairedRolls.some(p => p.inputRoll?.barcodeId === inRoll.barcodeId || (p.linkedInputList || []).some(m => m.barcodeId === inRoll.barcodeId))) {
      const inConsKg = parseFloat(inRoll.consumedWeightKg || 0);
      const inInitKg = parseFloat(inRoll.initialWeightKg || inConsKg);
      pairedRolls.push({
        rollNo: pairedRolls.length + 1,
        outputRoll: null,
        inputRoll: inRoll,
        linkedInputList: [inRoll],
        outNetKg: 0,
        outGrossKg: 0,
        outLengthM: 0,
        inConsKg,
        inInitKg,
        inBalKg: Math.max(0, inInitKg - inConsKg),
        deltaKg: -inConsKg,
        deltaPct: -100,
        recoveryPct: 0
      });
    }
  });

  // 6. Overall Aggregates
  const totalInputConsumedKg = inputRolls.reduce((sum, r) => sum + (parseFloat(r.consumedWeightKg) || 0), 0);
  const sfgRolls = linkedRolls.filter(r => r.rollType === 'SFG');
  const fgRolls = linkedRolls.filter(r => r.rollType === 'FG');
  const totalSfgKg = sfgRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
  const totalFgKg = fgRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
  const totalOutputKg = totalSfgKg + totalFgKg;

  const hasBothInputAndOutput = totalInputConsumedKg > 0 && totalOutputKg > 0;
  const netVarianceKg = hasBothInputAndOutput ? Number((totalOutputKg - totalInputConsumedKg).toFixed(2)) : 0;
  const netVariancePct = hasBothInputAndOutput ? Number(((netVarianceKg / totalInputConsumedKg) * 100).toFixed(2)) : 0;
  const cumulativeRecoveryPct = hasBothInputAndOutput ? Number(((totalOutputKg / totalInputConsumedKg) * 100).toFixed(1)) : (totalOutputKg > 0 ? 100 : 0);

  const jobTitle = effectiveOrder?.jobName || effectiveRecord?.jobName || 'this job';

  return (
    <div style={{ marginBottom: '24px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '5px', borderRadius: '8px', display: 'inline-flex' }}>
              <Barcode size={20} />
            </span>
            <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              SFG / FG Output Barcode Master Rolls ({linkedRolls.length} Rolls Weighed)
            </h4>
          </div>
          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '4px 0 0 32px' }}>
            Master rolls weighed on digital scale with 2D ISO 18004 barcodes & roll-wise Input Substrate vs Output SFG/FG reconciliation for <strong>{jobTitle}</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onOpenSfgModal && (
            <button
              type="button"
              className="btn-primary"
              style={{ background: '#6d28d9', borderColor: '#6d28d9', padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={onOpenSfgModal}
            >
              <Plus size={13} /> + Add SFG Roll
            </button>
          )}

          {onOpenFgModal && (
            <button
              type="button"
              className="btn-primary"
              style={{ background: '#059669', borderColor: '#059669', padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={onOpenFgModal}
            >
              <Plus size={13} /> + Add FG Roll
            </button>
          )}

          {linkedRolls.length > 0 && onSelectRollForBarcodeModal && (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={() => onSelectRollForBarcodeModal(linkedRolls)}
            >
              <Printer size={13} /> Print All Roll Labels ({linkedRolls.length})
            </button>
          )}
        </div>
      </div>

      {/* 4 Stat KPI Badges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            ⚡ Input Substrate Consumed
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0369a1', marginTop: '2px' }}>
            {totalInputConsumedKg.toFixed(2)} kg
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
            {inputRolls.length} Input Roll(s) Entered
          </div>
        </div>

        <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '10px 14px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            📦 Output SFG / FG Weighed
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#4c1d95', marginTop: '2px' }}>
            {totalOutputKg.toFixed(2)} kg
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6d28d9', marginTop: '2px', fontWeight: '600' }}>
            SFG: {totalSfgKg.toFixed(1)} kg ({sfgRolls.length}) • FG: {totalFgKg.toFixed(1)} kg ({fgRolls.length})
          </div>
        </div>

        <div style={{ 
          background: hasBothInputAndOutput ? (netVarianceKg >= 0 ? '#ecfdf5' : '#fffbeb') : '#f8fafc', 
          border: `1px solid ${hasBothInputAndOutput ? (netVarianceKg >= 0 ? '#a7f3d0' : '#fde68a') : '#e2e8f0'}`, 
          borderRadius: '8px', 
          padding: '10px 14px' 
        }}>
          <div style={{ 
            fontSize: '0.7rem', 
            fontWeight: '800', 
            color: hasBothInputAndOutput ? (netVarianceKg >= 0 ? '#059669' : '#b45309') : '#64748b', 
            textTransform: 'uppercase', 
            letterSpacing: '0.03em' 
          }}>
            ⚖️ Net Weight Delta (Ink / Variance)
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: '900', 
            color: hasBothInputAndOutput ? (netVarianceKg >= 0 ? '#065f46' : '#92400e') : '#64748b', 
            marginTop: '2px' 
          }}>
            {hasBothInputAndOutput ? (netVarianceKg >= 0 ? `+${netVarianceKg.toFixed(2)}` : netVarianceKg.toFixed(2)) + ' kg' : '0.00 kg'}
          </div>
          <div style={{ 
            fontSize: '0.72rem', 
            color: hasBothInputAndOutput ? (netVarianceKg >= 0 ? '#047857' : '#b45309') : '#94a3b8', 
            marginTop: '2px', 
            fontWeight: '700' 
          }}>
            {hasBothInputAndOutput
              ? (netVarianceKg >= 0 ? `+${netVariancePct.toFixed(1)}% (Ink & Solvent Gain)` : `${netVariancePct.toFixed(1)}% (Trim & Process Loss)`)
              : (totalInputConsumedKg > 0 ? 'Awaiting Output Weighing' : 'No Output Weighed Yet')}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            🎯 Overall Stage Recovery
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: '900', 
            color: cumulativeRecoveryPct >= 95 ? '#047857' : (hasBothInputAndOutput ? '#0f172a' : '#94a3b8'), 
            marginTop: '2px' 
          }}>
            {hasBothInputAndOutput ? `${cumulativeRecoveryPct.toFixed(1)}%` : (totalOutputKg > 0 ? '100.0%' : '0.0%')}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
            {hasBothInputAndOutput ? 'Gross Output / Net Input Ratio' : 'Awaiting Roll Entries'}
          </div>
        </div>
      </div>

      {/* Roll-Wise Input Vs Output Comparison Table or Clean Empty State */}
      {pairedRolls.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
          <div style={{ width: '48px', height: '48px', margin: '0 auto 12px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <Barcode size={26} />
          </div>
          <div style={{ fontSize: '0.96rem', color: '#1e293b', fontWeight: '800' }}>
            No Master Rolls Recorded Yet
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: '560px', margin: '6px auto 16px auto', lineHeight: '1.45' }}>
            Linked individual roll details with actual barcodes will appear here automatically once input substrate rolls are entered in <strong>Active Print Run</strong>, master rolls are weighed on the digital scale, or processed in <strong>SFG / FG Store Consumption</strong>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {onOpenSfgModal && (
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#6d28d9', borderColor: '#6d28d9', padding: '6px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={onOpenSfgModal}
              >
                <Plus size={14} /> + Add SFG Roll (Weigh Scale)
              </button>
            )}
            {onOpenFgModal && (
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#059669', borderColor: '#059669', padding: '6px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={onOpenFgModal}
              >
                <Plus size={14} /> + Add FG Roll (Weigh Scale)
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
          <table className="data-table" style={{ margin: 0, fontSize: '0.78rem', minWidth: '920px', width: '100%' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ width: '5%', textAlign: 'center' }}>Roll #</th>
                <th style={{ width: '22%' }}>Output SFG / FG Master Roll</th>
                <th style={{ width: '18%' }}>Output Specs & Weight</th>
                <th style={{ width: '25%' }}>Linked Input Substrate Roll</th>
                <th style={{ width: '16%' }}>Input vs Output (Roll-Wise Yield)</th>
                <th style={{ width: '8%', textAlign: 'center' }}>QC Status</th>
                <th style={{ width: '6%', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pairedRolls.map((pair, idx) => {
                const isRollSFG = pair.outputRoll?.rollType === 'SFG' || (pair.outputRoll?.category || '').includes('Semi-Finished');
                return (
                  <tr key={pair.outputRoll?.barcodeId || pair.inputRoll?.barcodeId || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: '900', color: '#4f46e5', fontSize: '0.88rem' }}>
                        #{pair.rollNo}
                      </div>
                      {pair.outputRoll ? (
                        <span 
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '1px 5px', 
                            borderRadius: '4px',
                            background: isRollSFG ? '#ede9fe' : '#ecfdf5',
                            color: isRollSFG ? '#6d28d9' : '#059669',
                            border: `1px solid ${isRollSFG ? '#c4b5fd' : '#a7f3d0'}`,
                            fontWeight: '800',
                            display: 'inline-block',
                            marginTop: '2px'
                          }}
                        >
                          {isRollSFG ? 'SFG' : 'FG'}
                        </span>
                      ) : (
                        <span 
                          style={{ 
                            fontSize: '0.62rem', 
                            padding: '1px 4px', 
                            borderRadius: '4px',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: '1px solid #bae6fd',
                            fontWeight: '700',
                            display: 'inline-block',
                            marginTop: '2px'
                          }}
                        >
                          INPUT
                        </span>
                      )}
                    </td>

                    <td style={{ verticalAlign: 'middle' }}>
                      {pair.outputRoll ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <QrCode size={13} style={{ color: '#4f46e5', flexShrink: 0 }} />
                            <code style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0f172a', letterSpacing: '0.02em' }}>
                              {pair.outputRoll.barcodeId}
                            </code>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '2px', fontWeight: '600' }}>
                            {pair.outputRoll.itemName || `Roll #${pair.rollNo}`}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '1px' }}>
                            📍 {pair.outputRoll.locationBay || pair.outputRoll.storageBay || 'SFG Store'}
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#b45309', fontWeight: '700', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> Awaiting Output Weighing
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.68rem' }}>
                            Press run in process
                          </span>
                        </div>
                      )}
                    </td>

                    <td style={{ verticalAlign: 'middle' }}>
                      {pair.outputRoll ? (
                        <>
                          <div style={{ fontWeight: '700', color: '#1e293b' }}>
                            {pair.outputRoll.filmType} • {pair.outputRoll.micron}µ • {pair.outputRoll.widthMm}mm
                          </div>
                          <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#047857', marginTop: '2px' }}>
                            {pair.outNetKg.toFixed(2)} kg <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Net</span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                            Gross: {pair.outGrossKg.toFixed(2)} kg {pair.outLengthM > 0 ? `• ${(pair.outLengthM).toLocaleString()} m` : ''}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>

                    <td style={{ verticalAlign: 'middle' }}>
                      {pair.linkedInputList && pair.linkedInputList.length > 1 ? (
                        <div>
                          {pair.linkedInputList.map((inR, i) => (
                            <div key={i} style={{ marginBottom: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '800' }}>🔗</span>
                                <code style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0369a1', background: '#f0f9ff', padding: '1px 5px', borderRadius: '3px', border: '1px solid #bae6fd' }}>
                                  {inR.barcodeId}
                                </code>
                                <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: '700' }}>({inR.consumedWeightKg.toFixed(1)} kg)</span>
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#475569', marginLeft: '16px' }}>
                                {inR.filmType} • {inR.micron}µ • {inR.widthMm}mm
                              </div>
                            </div>
                          ))}
                          <div style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: '800', marginTop: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '3px' }}>
                            Total Input Consumed: <span style={{ color: '#0369a1' }}>{pair.inConsKg.toFixed(2)} kg</span>
                          </div>
                        </div>
                      ) : pair.inputRoll ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '800' }}>🔗</span>
                            <code style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0369a1', background: '#f0f9ff', padding: '1px 5px', borderRadius: '3px', border: '1px solid #bae6fd' }}>
                              {pair.inputRoll.barcodeId}
                            </code>
                            {pair.inputRoll.source && (
                              <span style={{ fontSize: '0.64rem', padding: '1px 4px', borderRadius: '3px', background: '#f1f5f9', color: '#475569', fontWeight: '600' }}>
                                {pair.inputRoll.source}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#334155', fontWeight: '600', marginTop: '2px' }}>
                            {pair.inputRoll.filmType} • {pair.inputRoll.micron}µ • {pair.inputRoll.widthMm}mm
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: '700', marginTop: '2px' }}>
                            Consumed: <span style={{ color: '#0369a1', fontWeight: '800' }}>{pair.inConsKg.toFixed(2)} kg</span>
                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500' }}> (Initial: {pair.inInitKg.toFixed(2)} kg)</span>
                          </div>
                          {pair.inBalKg > 0 && (
                            <div style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: '700' }}>
                              Remaining Balance: {pair.inBalKg.toFixed(2)} kg
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                          Direct Scale Weighing
                        </span>
                      )}
                    </td>

                    <td style={{ verticalAlign: 'middle' }}>
                      {pair.inConsKg > 0 && pair.outNetKg > 0 ? (
                        <>
                          <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontSize: '0.75rem', 
                            fontWeight: '800',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: pair.deltaKg >= 0 ? '#ecfdf5' : '#fffbeb',
                            color: pair.deltaKg >= 0 ? '#047857' : '#b45309',
                            border: `1px solid ${pair.deltaKg >= 0 ? '#a7f3d0' : '#fde68a'}`
                          }}>
                            {pair.deltaKg >= 0 ? `▲ +${pair.deltaKg.toFixed(2)} kg` : `▼ ${pair.deltaKg.toFixed(2)} kg`}
                            <span style={{ fontSize: '0.68rem', opacity: 0.9 }}>
                              ({pair.deltaKg >= 0 ? `+${pair.deltaPct.toFixed(1)}%` : `${pair.deltaPct.toFixed(1)}%`})
                            </span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: pair.deltaKg >= 0 ? '#059669' : '#b45309', fontWeight: '700', marginTop: '3px' }}>
                            {pair.deltaKg >= 0 ? '🎨 Ink & Solvent Gain' : '✂️ Trim / Process Loss'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#334155', fontWeight: '700', marginTop: '1px' }}>
                            Roll Yield: <span style={{ color: '#0f172a', fontWeight: '800' }}>{pair.recoveryPct.toFixed(1)}%</span>
                          </div>
                        </>
                      ) : pair.outNetKg > 0 ? (
                        <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700' }}>
                          Output: {pair.outNetKg.toFixed(2)} kg
                        </div>
                      ) : pair.inConsKg > 0 ? (
                        <div style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: '700' }}>
                          Input: {pair.inConsKg.toFixed(2)} kg (In Process)
                        </div>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {pair.outputRoll ? (
                        <span className="badge badge-us" style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#dcfce7', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle2 size={11} /> {pair.outputRoll?.qcStatus || 'Passed'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '700' }}>
                          <Clock size={11} /> In Process
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {pair.outputRoll && onSelectRollForBarcodeModal ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#059669', borderColor: '#a7f3d0' }}
                          onClick={() => onSelectRollForBarcodeModal(pair.outputRoll)}
                          title="Print Barcode Tag for this roll"
                        >
                          <Printer size={12} /> Tag
                        </button>
                      ) : !pair.outputRoll && onOpenSfgModal ? (
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#6d28d9', borderColor: '#6d28d9' }}
                          onClick={onOpenSfgModal}
                          title="Weigh and register Output Master Roll on digital scale"
                        >
                          <Scale size={12} /> Weigh
                        </button>
                      ) : null}
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
}

export default function ProductionRecordManagement({
  urlParams = {},
  productionRecords = [],
  orders = [],
  inventory = [],
  inventoryRolls = [],
  sfgGoods = [],
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
  const [qtyFirstPassL1, setQtyFirstPassL1] = useState(''); // Stage 1: Printing Output (kg)
  const [qtyInspection, setQtyInspection] = useState(''); // Stage 2: Printing Inspection Output (kg)
  const [qtyLaminationL1, setQtyLaminationL1] = useState(''); // Stage 3: First Pass L1 Output (kg)
  const [adhesiveConsumedL1Kg, setAdhesiveConsumedL1Kg] = useState(0); // Stage 3: Adhesive Consumed (kg)
  const [qtySecondPassL2, setQtySecondPassL2] = useState(''); // Stage 4: Second Pass L2 Output (kg)
  const [laminationPlainSubstrateWastageL2Kg, setLaminationPlainSubstrateWastageL2Kg] = useState(0); // Stage 4: Lamination Scrap Pass 2 (kg)
  const [adhesiveConsumedL2Kg, setAdhesiveConsumedL2Kg] = useState(0); // Stage 4: Adhesive Consumed Pass 2 (kg)
  const [qtySlitting, setQtySlitting] = useState(''); // Stage 5: Slitting Finished Output (kg)
  const [paperCoreConsumedKg, setPaperCoreConsumedKg] = useState(0); // Stage 5: Paper Core Consumed
  const [qtyPouching, setQtyPouching] = useState(''); // Stage 6: Pouching finished output in kg
  const [qtyPouchingPcs, setQtyPouchingPcs] = useState('');
  const [zipperConsumedKg, setZipperConsumedKg] = useState(0);
  const [zipperConsumedM, setZipperConsumedM] = useState('');
  const [recordMachineId, setRecordMachineId] = useState('');
  const [recordOperator, setRecordOperator] = useState('');
  const [recordShift, setRecordShift] = useState('');
  const [guardrailWarningReason, setGuardrailWarningReason] = useState('');
  const [filmTypeOverrideReason, setFilmTypeOverrideReason] = useState('');
  const [guardrailPreview, setGuardrailPreview] = useState(null);
  const [guardrailLimits, setGuardrailLimits] = useState(null);
  const [pouchingScrapKg, setPouchingScrapKg] = useState(0); // Stage 6: Pouching Scrap (kg)
  const [qtyDispatch, setQtyDispatch] = useState(''); // Stage 7: Final Dispatch Ready Quantity (kg)
  const [showSfgConsumptionPreview, setShowSfgConsumptionPreview] = useState(false);

  // Stage-wise Scrap & Wastage Breakdown fields (in kg) — Clean 0 defaults for data entry
  const [printingPlainSettingWastageKg, setPrintingPlainSettingWastageKg] = useState(0);
  const [printingWastageKg, setPrintingWastageKg] = useState(0);
  const [laminationPlainSubstrateWastageKg, setLaminationPlainSubstrateWastageKg] = useState(0);
  const [printedWastageKg, setPrintedWastageKg] = useState(0);
  const [laminateWastageKg, setLaminateWastageKg] = useState(0);
  const [trimWastageKg, setTrimWastageKg] = useState(0);
  const [recordNotes, setRecordNotes] = useState('');

  // Target & Actual Ink / Adhesive GSM fields
  const [actualInkGsm, setActualInkGsm] = useState('');
  const [actualAdhesiveGsm, setActualAdhesiveGsm] = useState('');
  const [targetInkGsm, setTargetInkGsm] = useState('1.5');
  const [targetAdhesiveGsm, setTargetAdhesiveGsm] = useState('1.5');

  // Material Cost Rates (Adhesive & Paper Core per kg)
  const [adhesiveCostPerKg, setAdhesiveCostPerKg] = useState(270);
  const [paperCoreCostPerKg, setPaperCoreCostPerKg] = useState(45);
  const [activeMaterialRates, setActiveMaterialRates] = useState({ adhesiveCostPerKg: 270, paperCoreCostPerKg: 45 });

  React.useEffect(() => {
    let isMounted = true;
    fetchMaterialCostSettingsFromSupabase().then(res => {
      if (isMounted && res) {
        const rates = {
          adhesiveCostPerKg: Number(res.adhesiveCostPerKg) || 270,
          paperCoreCostPerKg: Number(res.paperCoreCostPerKg) || 45
        };
        setActiveMaterialRates(rates);
        setAdhesiveCostPerKg(prev => (prev === 270 ? rates.adhesiveCostPerKg : prev));
        setPaperCoreCostPerKg(prev => (prev === 45 ? rates.paperCoreCostPerKg : prev));
      }
    }).catch(err => console.warn("Could not load material cost settings from Supabase:", err));
    return () => { isMounted = false; };
  }, []);

  // Helper to open 'Start Production' for a specific punched job/order — pulls actual store issues & Job Master
  const handleStartProductionForOrder = (ord) => {
    setSelectedOrder(ord);

    const linkedJm = resolveJobMaster({ order: ord, jobMasters }).jobMaster;
    const defaultTargetInk = linkedJm?.inkGsm || ord?.inkGsm || 1.5;
    const defaultTargetAdhesive = linkedJm?.adhesiveGsm || ord?.adhesiveGsm || 1.5;

    // 1. Check if an existing production record already exists for this order/job
    const cleanOrdId = String(ord.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
    const existingRec = (productionRecords || []).find(r => {
      const cleanRId = String(r.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
      const cleanROrderId = String(r.orderId || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
      return cleanROrderId === cleanOrdId || 
             cleanRId === cleanOrdId || 
             r.orderId === ord.id || 
             r.id === ord.id || 
             (r.jobCode && String(r.jobCode).toLowerCase() === String(ord.jobCode || '').toLowerCase()) ||
             (r.jobName && r.jobName.trim().toLowerCase() === (ord.jobName || '').trim().toLowerCase());
    });

    if (existingRec) {
      setSelectedRecord(existingRec);
      
      const existingMatList = Array.isArray(existingRec.materialsList) && existingRec.materialsList.length > 0 
        ? existingRec.materialsList 
        : [];
      
      const pressInputRolls = existingRec.inputRollsList || ord.inputRollsList || [];
      const prefilledPressMaterials = pressInputRolls.map((r, idx) => {
        const consumed = parseFloat(r.consumedWeightKg) || parseFloat(r.initialWeightKg) || 0;
        const defaultRate = DEFAULT_DAILY_RATES[r.filmType] || 140;
        return {
          id: `mat-press-${Date.now()}-${idx + 1}`,
          itemId: `RM-${(r.filmType || 'FILM').substring(0, 3).toUpperCase()}-${idx + 1}`,
          itemCode: `RM-${(r.filmType || 'FILM').substring(0, 3).toUpperCase()}-${idx + 1}`,
          itemName: `${displayText(r.filmType)} ${finiteNumber(r.micron) === null ? NOT_RECORDED : `${r.micron}µ`} (${finiteNumber(r.widthMm) === null ? NOT_RECORDED : `${r.widthMm} mm`})`,
          filmType: r.filmType || '',
          micron: finiteNumber(r.micron) === null ? '' : String(r.micron),
          widthMm: finiteNumber(r.widthMm) === null ? '' : String(r.widthMm),
          unit: 'Kg',
          barcode: r.barcodeId || '',
          issueQtyKg: consumed,
          returnQtyKg: 0,
          netConsumedQtyKg: consumed,
          unitPricePerKg: defaultRate,
          totalMaterialCost: consumed * defaultRate,
          wastagePct: 0
        };
      });

      if (existingMatList.length === 0 && pressInputRolls.length > 0) {
        setMaterialsList(prefilledPressMaterials);
      } else {
        setMaterialsList(existingMatList);
      }

      // Deduplicate and aggregate SFG consumption events logged from SFG Store
      const rawSfgLogs = [
        ...(Array.isArray(existingRec.sfgConsumptions) ? existingRec.sfgConsumptions : []),
        ...(Array.isArray(ord.sfgConsumptions) ? ord.sfgConsumptions : [])
      ];
      const seenLogKeys = new Set();
      const sfgLogs = [];
      rawSfgLogs.forEach(l => {
        const k = l.id || `${l.timestamp || l.date}-${l.sfgBatchCode}-${l.targetProcess}`;
        if (!seenLogKeys.has(k)) {
          seenLogKeys.add(k);
          sfgLogs.push(l);
        }
      });

      let sfgQtyL1 = 0;
      let sfgQtyL2 = 0;
      let sfgQtySlitting = 0;
      let sfgSlittingTrimScrap = 0;
      let sfgSlittingSettingScrap = 0;
      let sfgSlittingScrap = 0;
      let sfgQtyPouching = 0;
      let sfgAdhesiveL1 = 0;
      let sfgAdhesiveL2 = 0;
      let sfgLamPlainScrapL1 = 0;
      let sfgLamPlainScrapL2 = 0;
      let sfgLaminateScrap = 0;
      let sfgPrintPlainScrap = 0;
      let sfgPrintScrap = 0;
      let sfgPouchingScrap = 0;
      let sfgZipperConsumed = 0;

      sfgLogs.forEach(log => {
        const p = log.targetProcess || '';
        const sb = log.scrapBreakdown || {};
        const outKg = consumptionOutputNetKg(log);

        if (p === 'Lamination (Pass 1)') {
          sfgQtyL1 += outKg;
          sfgLamPlainScrapL1 += parseFloat(sb.laminationPlainSubstrateWastageKg) || 0;
          sfgLaminateScrap += parseFloat(sb.laminateWastageKg) || 0;
          sfgAdhesiveL1 += parseFloat(sb.adhesiveConsumedL1Kg) || 0;
        } else if (p === 'Lamination (Pass 2)') {
          sfgQtyL2 += outKg;
          sfgLamPlainScrapL2 += parseFloat(sb.laminationPlainSubstrateWastageL2Kg) || 0;
          sfgAdhesiveL2 += parseFloat(sb.adhesiveConsumedL2Kg) || 0;
        } else if (p === 'Printing (Pass 2)') {
          sfgPrintPlainScrap += parseFloat(sb.printingPlainSettingWastageKg) || 0;
          sfgPrintScrap += parseFloat(sb.printingWastageKg) || 0;
        } else if (p === 'Slitting & Rewinding') {
          sfgQtySlitting += outKg;
          sfgSlittingTrimScrap += parseFloat(sb.slittingTrimScrapKg) || 0;
          sfgSlittingSettingScrap += parseFloat(sb.slittingSettingWastageKg) || 0;
          sfgSlittingScrap += parseFloat(sb.slittingScrapKg) || 0;
        } else if (p === 'Pouching / Bag Making') {
          sfgQtyPouching += outKg;
          sfgPouchingScrap += parseFloat(sb.pouchingScrapKg) || 0;
          sfgZipperConsumed += parseFloat(sb.zipperConsumedKg) || 0;
        }
      });

      // Integrate Substrate 2 / Substrate 3 rolls from SFG Consumptions into materialsList
      let updatedMatList = existingMatList.length > 0 ? [...existingMatList] : (pressInputRolls.length > 0 ? [...prefilledPressMaterials] : []);
      sfgLogs.forEach(log => {
        if (log.substrate2 && (parseFloat(log.substrate2.consumedKg) > 0 || log.substrate2.barcode)) {
          const s2 = log.substrate2;
          const foundIdx = updatedMatList.findIndex(m => (s2.barcode && m.barcode === s2.barcode) || (m.itemName && m.itemName.includes('Substrate 2')));
          if (foundIdx >= 0) {
            updatedMatList[foundIdx] = {
              ...updatedMatList[foundIdx],
              barcode: s2.barcode || updatedMatList[foundIdx].barcode,
              issueQtyKg: s2.initialKg || updatedMatList[foundIdx].issueQtyKg || s2.consumedKg,
              netConsumedQtyKg: s2.consumedKg || updatedMatList[foundIdx].netConsumedQtyKg,
              totalMaterialCost: (s2.consumedKg || updatedMatList[foundIdx].netConsumedQtyKg) * (updatedMatList[foundIdx].unitPricePerKg || 140)
            };
          } else {
            const defaultRate = DEFAULT_DAILY_RATES[s2.filmType] || 150;
            updatedMatList.push({
              id: `mat-sub2-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              itemId: `RM-SUB2-${s2.barcode || Date.now()}`,
              itemCode: `RM-SUB2`,
              itemName: `Substrate 2 (${s2.filmType || 'Lamination Film'}) - Pass 1`,
              filmType: s2.filmType || 'PET Film',
              micron: '-',
              widthMm: '-',
              unit: 'Kg',
              barcode: s2.barcode || '',
              issueQtyKg: s2.initialKg || s2.consumedKg,
              returnQtyKg: Math.max(0, (s2.initialKg || 0) - (s2.consumedKg || 0)),
              netConsumedQtyKg: s2.consumedKg,
              unitPricePerKg: defaultRate,
              totalMaterialCost: (s2.consumedKg || 0) * defaultRate,
              wastagePct: 0
            });
          }
        }
        additionalSubstrate2Materials(log, (film) => DEFAULT_DAILY_RATES[film] || 150).forEach((row) => updatedMatList.push(row));
        if (log.substrate3 && (parseFloat(log.substrate3.consumedKg) > 0 || log.substrate3.barcode)) {
          const s3 = log.substrate3;
          const foundIdx = updatedMatList.findIndex(m => (s3.barcode && m.barcode === s3.barcode) || (m.itemName && m.itemName.includes('Substrate 3')));
          if (foundIdx >= 0) {
            updatedMatList[foundIdx] = {
              ...updatedMatList[foundIdx],
              barcode: s3.barcode || updatedMatList[foundIdx].barcode,
              issueQtyKg: s3.initialKg || updatedMatList[foundIdx].issueQtyKg || s3.consumedKg,
              netConsumedQtyKg: s3.consumedKg || updatedMatList[foundIdx].netConsumedQtyKg,
              totalMaterialCost: (s3.consumedKg || updatedMatList[foundIdx].netConsumedQtyKg) * (updatedMatList[foundIdx].unitPricePerKg || 140)
            };
          } else {
            const defaultRate = DEFAULT_DAILY_RATES[s3.filmType] || 150;
            updatedMatList.push({
              id: `mat-sub3-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              itemId: `RM-SUB3-${s3.barcode || Date.now()}`,
              itemCode: `RM-SUB3`,
              itemName: `Substrate 3 (${s3.filmType || 'Lamination Film'}) - Pass 2`,
              filmType: s3.filmType || 'Poly Film',
              micron: '-',
              widthMm: '-',
              unit: 'Kg',
              barcode: s3.barcode || '',
              issueQtyKg: s3.initialKg || s3.consumedKg,
              returnQtyKg: Math.max(0, (s3.initialKg || 0) - (s3.consumedKg || 0)),
              netConsumedQtyKg: s3.consumedKg,
              unitPricePerKg: defaultRate,
              totalMaterialCost: (s3.consumedKg || 0) * defaultRate,
              wastagePct: 0
            });
          }
        }
      });
      setMaterialsList(updatedMatList);

      const outRolls = existingRec.outputRolls || existingRec.rollsBreakdown || ord.rollsBreakdown || ord.outputRolls || [];
      const totalOutKg = outRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
      const initialStage1Kg = measureInputValue(
        existingRec.qtyFirstPassL1,
        measureInputValue(
          existingRec.qtyPrinting,
          totalOutKg > 0 ? totalOutKg : measureInputValue(existingRec.printedOutputKg, ord.printedOutputKg)
        )
      );

      setQtyFirstPassL1(initialStage1Kg);
      setQtyInspection(measureInputValue(existingRec.qtyInspection));
      setQtyLaminationL1(measureInputValue(existingRec.qtyLaminationL1, sfgQtyL1 > 0 ? sfgQtyL1 : null));
      setAdhesiveConsumedL1Kg(existingRec.adhesiveConsumedL1Kg || sfgAdhesiveL1 || 0);
      setQtySecondPassL2(measureInputValue(existingRec.qtySecondPassL2, sfgQtyL2 > 0 ? sfgQtyL2 : null));
      setLaminationPlainSubstrateWastageL2Kg(existingRec.laminationPlainSubstrateWastageL2Kg || sfgLamPlainScrapL2 || 0);
      setAdhesiveConsumedL2Kg(existingRec.adhesiveConsumedL2Kg || sfgAdhesiveL2 || 0);
      setQtySlitting(measureInputValue(existingRec.qtySlitting, sfgQtySlitting > 0 ? sfgQtySlitting : null));
      setPaperCoreConsumedKg(existingRec.paperCoreConsumedKg || 0);
      setQtyPouching(measureInputValue(existingRec.qtyPouching, sfgQtyPouching > 0 ? sfgQtyPouching : null));
      setQtyPouchingPcs(measureInputValue(existingRec.qtyPouchingPcs));
      setZipperConsumedKg(existingRec.zipperConsumedKg || sfgZipperConsumed || 0);
      setZipperConsumedM(measureInputValue(existingRec.zipperConsumedM));
      setRecordMachineId(existingRec.machineId || '');
      setRecordOperator(existingRec.operatorName || '');
      setRecordShift(existingRec.shift || '');
      setPouchingScrapKg(existingRec.pouchingScrapKg || sfgPouchingScrap || 0);
      setQtyDispatch(measureInputValue(existingRec.qtyDispatch));
      setProcessingCostPerKg(existingRec.processingCostPerKg || 25);

      // Preserve historical snapshot rates for existing record:
      const snapAdhesive = existingRec.adhesiveCostPerKg !== undefined && existingRec.adhesiveCostPerKg !== null
        ? Number(existingRec.adhesiveCostPerKg)
        : activeMaterialRates.adhesiveCostPerKg;
      const snapPaperCore = existingRec.paperCoreCostPerKg !== undefined && existingRec.paperCoreCostPerKg !== null
        ? Number(existingRec.paperCoreCostPerKg)
        : activeMaterialRates.paperCoreCostPerKg;
      setAdhesiveCostPerKg(snapAdhesive);
      setPaperCoreCostPerKg(snapPaperCore);

      setPrintingPlainSettingWastageKg(existingRec.printingPlainSettingWastageKg || sfgPrintPlainScrap || 0);
      setPrintingWastageKg(existingRec.printingWastageKg || sfgPrintScrap || 0);
      setLaminationPlainSubstrateWastageKg(existingRec.laminationPlainSubstrateWastageKg || sfgLamPlainScrapL1 || 0);
      setPrintedWastageKg(existingRec.printedWastageKg || 0);
      setLaminateWastageKg(existingRec.laminateWastageKg || sfgLaminateScrap || 0);
      setTrimWastageKg(existingRec.trimWastageKg || sfgSlittingTrimScrap || 0);
      setRecordNotes(existingRec.notes || '');

      setActualInkGsm(existingRec.actualInkGsm !== undefined && existingRec.actualInkGsm !== null ? String(existingRec.actualInkGsm) : (existingRec.inkGsmInSpeed ? String(existingRec.inkGsmInSpeed) : ''));
      setActualAdhesiveGsm(existingRec.actualAdhesiveGsm !== undefined && existingRec.actualAdhesiveGsm !== null ? String(existingRec.actualAdhesiveGsm) : '');
      setTargetInkGsm(String(existingRec.targetInkGsm || existingRec.inkGsm || defaultTargetInk));
      setTargetAdhesiveGsm(String(existingRec.targetAdhesiveGsm || existingRec.adhesiveGsm || defaultTargetAdhesive));

      setActiveTab('new_record');
      pushSlugState('production_records', { id: existingRec.id, section: 'list' });
      return;
    }

    setSelectedRecord(null);

    // Check SFG consumption events logged on order
    const ordSfgLogs = Array.isArray(ord.sfgConsumptions) ? ord.sfgConsumptions : [];
    let sfgQtyL1 = 0;
    let sfgQtyL2 = 0;
    let sfgQtySlitting = 0;
    let sfgSlittingTrimScrap = 0;
    let sfgSlittingSettingScrap = 0;
    let sfgSlittingScrap = 0;
    let sfgQtyPouching = 0;
    let sfgAdhesiveL1 = 0;
    let sfgAdhesiveL2 = 0;
    let sfgLamPlainScrapL1 = 0;
    let sfgLamPlainScrapL2 = 0;
    let sfgLaminateScrap = 0;
    let sfgPrintPlainScrap = 0;
    let sfgPrintScrap = 0;
    let sfgPouchingScrap = 0;
    let sfgZipperConsumed = 0;

    ordSfgLogs.forEach(log => {
      const p = log.targetProcess || '';
      const sb = log.scrapBreakdown || {};
      const outKg = consumptionOutputNetKg(log);

      if (p === 'Lamination (Pass 1)') {
        sfgQtyL1 += outKg;
        sfgLamPlainScrapL1 += parseFloat(sb.laminationPlainSubstrateWastageKg) || 0;
        sfgLaminateScrap += parseFloat(sb.laminateWastageKg) || 0;
        sfgAdhesiveL1 += parseFloat(sb.adhesiveConsumedL1Kg) || 0;
      } else if (p === 'Lamination (Pass 2)') {
        sfgQtyL2 += outKg;
        sfgLamPlainScrapL2 += parseFloat(sb.laminationPlainSubstrateWastageL2Kg) || 0;
        sfgAdhesiveL2 += parseFloat(sb.adhesiveConsumedL2Kg) || 0;
      } else if (p === 'Printing (Pass 2)') {
        sfgPrintPlainScrap += parseFloat(sb.printingPlainSettingWastageKg) || 0;
        sfgPrintScrap += parseFloat(sb.printingWastageKg) || 0;
      } else if (p === 'Slitting & Rewinding') {
        sfgQtySlitting += outKg;
        sfgSlittingTrimScrap += parseFloat(sb.slittingTrimScrapKg) || 0;
        sfgSlittingSettingScrap += parseFloat(sb.slittingSettingWastageKg) || 0;
        sfgSlittingScrap += parseFloat(sb.slittingScrapKg) || 0;
      } else if (p === 'Pouching / Bag Making') {
        sfgQtyPouching += outKg;
        sfgPouchingScrap += parseFloat(sb.pouchingScrapKg) || 0;
        sfgZipperConsumed += parseFloat(sb.zipperConsumedKg) || 0;
      }
    });

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
      const loadedMats = Array.from(matMap.values());
      // Merge Substrate 2 / Substrate 3 if any
      ordSfgLogs.forEach(log => {
        if (log.substrate2 && (parseFloat(log.substrate2.consumedKg) > 0 || log.substrate2.barcode)) {
          const s2 = log.substrate2;
          const defaultRate = DEFAULT_DAILY_RATES[s2.filmType] || 150;
          loadedMats.push({
            id: `mat-sub2-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            itemId: `RM-SUB2-${s2.barcode || Date.now()}`,
            itemCode: `RM-SUB2`,
            itemName: `Substrate 2 (${s2.filmType || 'Lamination Film'}) - Pass 1`,
            filmType: s2.filmType || 'PET Film',
            micron: '-',
            widthMm: '-',
            unit: 'Kg',
            barcode: s2.barcode || '',
            issueQtyKg: s2.initialKg || s2.consumedKg,
            returnQtyKg: Math.max(0, (s2.initialKg || 0) - (s2.consumedKg || 0)),
            netConsumedQtyKg: s2.consumedKg,
            unitPricePerKg: defaultRate,
            totalMaterialCost: (s2.consumedKg || 0) * defaultRate,
            wastagePct: 0
          });
        }
        additionalSubstrate2Materials(log, (film) => DEFAULT_DAILY_RATES[film] || 150).forEach((row) => loadedMats.push(row));
        if (log.substrate3 && (parseFloat(log.substrate3.consumedKg) > 0 || log.substrate3.barcode)) {
          const s3 = log.substrate3;
          const defaultRate = DEFAULT_DAILY_RATES[s3.filmType] || 150;
          loadedMats.push({
            id: `mat-sub3-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            itemId: `RM-SUB3-${s3.barcode || Date.now()}`,
            itemCode: `RM-SUB3`,
            itemName: `Substrate 3 (${s3.filmType || 'Lamination Film'}) - Pass 2`,
            filmType: s3.filmType || 'Poly Film',
            micron: '-',
            widthMm: '-',
            unit: 'Kg',
            barcode: s3.barcode || '',
            issueQtyKg: s3.initialKg || s3.consumedKg,
            returnQtyKg: Math.max(0, (s3.initialKg || 0) - (s3.consumedKg || 0)),
            netConsumedQtyKg: s3.consumedKg,
            unitPricePerKg: defaultRate,
            totalMaterialCost: (s3.consumedKg || 0) * defaultRate,
            wastagePct: 0
          });
        }
      });
      setMaterialsList(loadedMats);
    } else {
      const jm = resolveJobMaster({ order: ord, jobMasters }).jobMaster;
      const printWidth = recordedPrintWidthMm(jm);
      if (jm && jm.layers && jm.layers.length > 0) {
        const generatedList = jm.layers.map((layer, idx) => {
          const defaultRate = DEFAULT_DAILY_RATES[layer.filmType] || 0;
          const layerWidth = idx === 0 ? (printWidth || '') : (finiteNumber(layer.widthMm) ?? '');
          return {
            id: `mat-${Date.now()}-${idx + 1}`,
            itemId: `RM-${String(layer.filmType || 'FILM').substring(0, 3).toUpperCase()}-${idx + 1}`,
            itemCode: `RM-${String(layer.filmType || 'FILM').substring(0, 3).toUpperCase()}-${idx + 1}`,
            itemName: `${layer.filmType || UNKNOWN} ${layer.micron ?? UNKNOWN}µ (${layerWidth || UNKNOWN} mm)`,
            filmType: layer.filmType || '',
            micron: layer.micron ?? '',
            widthMm: layerWidth,
            unit: 'Kg',
            barcode: '',
            issueQtyKg: '',
            returnQtyKg: 0,
            netConsumedQtyKg: 0,
            unitPricePerKg: defaultRate,
            totalMaterialCost: 0,
            wastagePct: 0
          };
        });
        ordSfgLogs.forEach(log => {
          if (log.substrate2 && (parseFloat(log.substrate2.consumedKg) > 0 || log.substrate2.barcode)) {
            const s2 = log.substrate2;
            const defaultRate = DEFAULT_DAILY_RATES[s2.filmType] || 150;
            generatedList.push({
              id: `mat-sub2-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              itemId: `RM-SUB2-${s2.barcode || Date.now()}`,
              itemCode: `RM-SUB2`,
              itemName: `Substrate 2 (${s2.filmType || 'Lamination Film'}) - Pass 1`,
              filmType: s2.filmType || 'PET Film',
              micron: '-',
              widthMm: '-',
              unit: 'Kg',
              barcode: s2.barcode || '',
              issueQtyKg: s2.initialKg || s2.consumedKg,
              returnQtyKg: Math.max(0, (s2.initialKg || 0) - (s2.consumedKg || 0)),
              netConsumedQtyKg: s2.consumedKg,
              unitPricePerKg: defaultRate,
              totalMaterialCost: (s2.consumedKg || 0) * defaultRate,
              wastagePct: 0
            });
          }
          additionalSubstrate2Materials(log, (film) => DEFAULT_DAILY_RATES[film] || 150).forEach((row) => generatedList.push(row));
          if (log.substrate3 && (parseFloat(log.substrate3.consumedKg) > 0 || log.substrate3.barcode)) {
            const s3 = log.substrate3;
            const defaultRate = DEFAULT_DAILY_RATES[s3.filmType] || 150;
            generatedList.push({
              id: `mat-sub3-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              itemId: `RM-SUB3-${s3.barcode || Date.now()}`,
              itemCode: `RM-SUB3`,
              itemName: `Substrate 3 (${s3.filmType || 'Lamination Film'}) - Pass 2`,
              filmType: s3.filmType || 'Poly Film',
              micron: '-',
              widthMm: '-',
              unit: 'Kg',
              barcode: s3.barcode || '',
              issueQtyKg: s3.initialKg || s3.consumedKg,
              returnQtyKg: Math.max(0, (s3.initialKg || 0) - (s3.consumedKg || 0)),
              netConsumedQtyKg: s3.consumedKg,
              unitPricePerKg: defaultRate,
              totalMaterialCost: (s3.consumedKg || 0) * defaultRate,
              wastagePct: 0
            });
          }
        });
        setMaterialsList(generatedList);
      } else {
        setMaterialsList([]);
      }
    }

    setQtyFirstPassL1('');
    setQtyInspection('');
    setQtyLaminationL1(sfgQtyL1 > 0 ? sfgQtyL1 : '');
    setAdhesiveConsumedL1Kg(sfgAdhesiveL1 || 0);
    setQtySecondPassL2(sfgQtyL2 > 0 ? sfgQtyL2 : '');
    setLaminationPlainSubstrateWastageL2Kg(sfgLamPlainScrapL2 || 0);
    setAdhesiveConsumedL2Kg(sfgAdhesiveL2 || 0);
    setQtySlitting(sfgQtySlitting > 0 ? sfgQtySlitting : '');
    setPaperCoreConsumedKg(0);
    // Newly created record inherits latest active settings from DB:
    setAdhesiveCostPerKg(activeMaterialRates.adhesiveCostPerKg);
    setPaperCoreCostPerKg(activeMaterialRates.paperCoreCostPerKg);
    setQtyPouching(sfgQtyPouching > 0 ? sfgQtyPouching : '');
    setQtyPouchingPcs('');
    setZipperConsumedKg(sfgZipperConsumed || 0);
    setZipperConsumedM('');
    setRecordMachineId('');
    setRecordOperator('');
    setRecordShift('');
    setGuardrailWarningReason('');
    setFilmTypeOverrideReason('');
    setGuardrailPreview(null);
    setPouchingScrapKg(sfgPouchingScrap || 0);
    setQtyDispatch('');
    setPrintingPlainSettingWastageKg(sfgPrintPlainScrap || 0);
    setPrintingWastageKg(sfgPrintScrap || 0);
    setLaminationPlainSubstrateWastageKg(sfgLamPlainScrapL1 || 0);
    setPrintedWastageKg(0);
    setLaminateWastageKg(sfgLaminateScrap || 0);
    setTrimWastageKg(sfgSlittingTrimScrap || 0);
    setActualInkGsm('');
    setActualAdhesiveGsm('');
    setTargetInkGsm(String(defaultTargetInk));
    setTargetAdhesiveGsm(String(defaultTargetAdhesive));
    setRecordNotes('');
    setActiveTab('new_record');
    pushSlugState('production_records', { orderId: ord.id, section: 'new_record' });
  };

  const handleSelectRecord = (rec) => {
    setSelectedRecord(rec);
    pushSlugState('production_records', { id: rec.id, section: 'list' });
  };

  const handleCloseRecord = () => {
    setSelectedRecord(null);
    pushSlugState('production_records', { section: activeTab === 'new_record' ? 'punched_jobs' : activeTab });
  };

  const handleTabSwitch = (newTab) => {
    setActiveTab(newTab);
    setSelectedRecord(null);
    pushSlugState('production_records', { section: newTab });
  };

  const handleOpenSfgModal = () => {
    setSfgFgModalMode('SFG');
    setIsSfgFgModalOpen(true);
    pushSlugState('production_records', { 
      section: activeTab, 
      action: 'add_sfg', 
      ...(selectedRecord ? { id: selectedRecord.id } : (selectedOrder ? { orderId: selectedOrder.id } : {})) 
    });
  };

  const handleOpenFgModal = () => {
    setSfgFgModalMode('FG');
    setIsSfgFgModalOpen(true);
    pushSlugState('production_records', { 
      section: activeTab, 
      action: 'add_fg', 
      ...(selectedRecord ? { id: selectedRecord.id } : (selectedOrder ? { orderId: selectedOrder.id } : {})) 
    });
  };

  const handleCloseSfgFgModal = () => {
    setIsSfgFgModalOpen(false);
    pushSlugState('production_records', { 
      section: activeTab, 
      ...(selectedRecord ? { id: selectedRecord.id } : (selectedOrder ? { orderId: selectedOrder.id } : {})) 
    });
  };

  const handleReviewJobCard = (cardData) => {
    setActiveJobCardData(cardData);
    pushSlugState('production_records', { section: 'job_cards', jobCardId: cardData.skuCode || cardData.jobMasterId });
  };

  const handleCloseJobCard = () => {
    setActiveJobCardData(null);
    pushSlugState('production_records', { section: 'job_cards' });
  };

  // One order id per open form. Repeating this writes the same URL, the router
  // echoes it, and the echo starts the form again — which puts this page back
  // on top of a sidebar click.
  const appliedProductionOrderRef = React.useRef('');

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
        } else if (appliedProductionOrderRef.current !== String(matchOrder.id)) {
          appliedProductionOrderRef.current = String(matchOrder.id);
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
    const jm = resolveJobMaster({ order, jobMasters }).jobMaster;
    if (jm && jm.layers && jm.layers.length > 0) {
      return jm.layers.map(l => `${l.filmType || UNKNOWN} ${l.micron ?? UNKNOWN}µ`).join(' / ');
    }
    if (jm && jm.structure && jm.structure !== 'PET / PE' && jm.structure !== '—') {
      return jm.structure;
    }
    if (order.structure && order.structure !== 'PET / PE' && order.structure !== '—') {
      return order.structure;
    }
    return jm?.structure || order.structure || JM_UNRESOLVED_LABEL;
  };

  useEffect(() => {
    let active = true;
    fetchSystemSetting(GUARDRAIL_SETTING_KEY)
      .then((value) => { if (active && value && typeof value === 'object') setGuardrailLimits(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const [scrapDisposals, setScrapDisposals] = useState([]);

  useEffect(() => {
    let active = true;
    fetchScrapDisposals(supabase)
      .then((rows) => { if (active) setScrapDisposals(rows || []); })
      .catch((err) => alert(`Scrap disposals could not be loaded: ${describeSaveError(err)}`));
    return () => { active = false; };
  }, []);

  const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
  const [disposeCategory, setDisposeCategory] = useState('Printing Plain Setting (kg)');
  const [disposeQtyKg, setDisposeQtyKg] = useState('');
  const [disposeVendor, setDisposeVendor] = useState('');
  const [disposeRefNo, setDisposeRefNo] = useState('');
  const [disposeNotes, setDisposeNotes] = useState('');

  // Helper to open order details for dropdown selection
  const handleSelectOrderForRecord = (orderId) => {
    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      handleStartProductionForOrder(ord);
    }
  };

  const addMaterialRow = () => {
    const spec = printLayerSpec(resolveJobMaster({ order: selectedOrder, record: selectedRecord, jobMasters }).jobMaster);
    setMaterialsList(prev => [
      ...prev,
      {
        id: String(Date.now()),
        filmType: '',
        micron: '',
        widthMm: '',
        barcode: '',
        issueQtyKg: '',
        returnQtyKg: 0,
        unitPricePerKg: 0,
        jobMasterFilmType: spec?.filmType || '',
        jobMasterMicron: spec?.micron ?? '',
        jobMasterWidthMm: spec?.printWidthMm ?? ''
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

  const formResolution = resolveJobMaster({ order: selectedOrder, record: selectedRecord, jobMasters });
  const formSpec = printLayerSpec(formResolution.jobMaster);

  // Calculations with Spec Variation detection against the Job Master printing layer
  const calculatedMaterials = materialsList.map(m => {
    const issued = parseFloat(m.issueQtyKg) || 0;
    const returned = parseFloat(m.returnQtyKg) || 0;
    const netConsumed = Math.max(0, issued - returned);
    const rate = parseFloat(m.unitPricePerKg) || 0;
    const cost = netConsumed * rate;
    const compared = compareRollToSpec({
      label: 'Material',
      filmType: m.filmType,
      micron: m.micron,
      widthMm: m.widthMm,
      consumedKg: netConsumed
    }, formSpec);
    const filmFinding = compared.blocks.find((item) => item.rule === 'film-type');
    const micronFinding = [...compared.blocks, ...compared.warnings].find((item) => item.rule === 'micron');
    const widthFinding = [...compared.blocks, ...compared.warnings].find((item) => item.rule === 'width');
    const hasFilmTypeVar = Boolean(filmFinding);
    const micronVarPct = micronFinding ? micronFinding.level : null;
    const widthVarPct = widthFinding ? widthFinding.level : null;

    return {
      ...m,
      netConsumedQtyKg: netConsumed,
      totalMaterialCost: cost,
      jobMasterFilmType: formSpec?.filmType || '',
      jobMasterMicron: formSpec?.micron ?? '',
      jobMasterWidthMm: formSpec?.printWidthMm ?? '',
      micronVarPct,
      widthVarPct,
      micronGuardMessage: micronFinding?.message || '',
      widthGuardMessage: widthFinding?.message || '',
      hasFilmTypeVar,
      hasVariation: Boolean(filmFinding || micronFinding || widthFinding)
    };
  });

  const totalNetQtyKg = dispatchReadyKg({
    qtyDispatch,
    qtyPouching,
    qtySlitting
  });
  const producedKg = Math.max(
    parseFloat(qtyDispatch) || 0,
    parseFloat(qtyPouching) || 0,
    parseFloat(qtySlitting) || 0,
    parseFloat(qtySecondPassL2) || 0,
    parseFloat(qtyLaminationL1) || 0,
    parseFloat(qtyInspection) || 0,
    parseFloat(qtyFirstPassL1) || 0
  );
  
  // Raw materials cost from film substrates table
  const rawMaterialsTableCostRs = roundToTwo(calculatedMaterials.reduce((sum, m) => sum + (parseFloat(m.totalMaterialCost) || 0), 0));

  // Consumable material costs: Adhesive (Pass 1 + Pass 2) and Paper Core (both in kg)
  const totalAdhesiveConsumedKg = roundToTwo((parseFloat(adhesiveConsumedL1Kg) || 0) + (parseFloat(adhesiveConsumedL2Kg) || 0));
  const adhesiveCostRs = roundToTwo(totalAdhesiveConsumedKg * (parseFloat(adhesiveCostPerKg) || 0));
  const paperCoreCostRs = roundToTwo((parseFloat(paperCoreConsumedKg) || 0) * (parseFloat(paperCoreCostPerKg) || 0));

  // Total Ingredients Cost includes Substrates + Adhesive + Paper Core
  const totalMaterialCostRs = roundToTwo(rawMaterialsTableCostRs + adhesiveCostRs + paperCoreCostRs);
  
  // Total Processing Cost = Total Qty Produced x Processing Cost Per Kg
  const totalProcessingCostRs = roundToTwo(producedKg * (parseFloat(processingCostPerKg) || 0));

  // Total Scrap Weight across all stage process wastage categories
  const totalScrapQtyKg = roundToTwo(
    (parseFloat(printingPlainSettingWastageKg) || 0) +
    (parseFloat(printingWastageKg) || 0) +
    (parseFloat(printedWastageKg) || 0) +
    (parseFloat(laminationPlainSubstrateWastageKg) || 0) +
    (parseFloat(laminationPlainSubstrateWastageL2Kg) || 0) +
    (parseFloat(laminateWastageKg) || 0) +
    (parseFloat(trimWastageKg) || 0) +
    (parseFloat(pouchingScrapKg) || 0)
  );

  // Cost Formula: (Total Qty Produced x Processing Cost Rate) + (Ingredients Cost)
  // Scrap Rate removed as per directive
  const finalProductionCostRs = roundToTwo(totalProcessingCostRs + totalMaterialCostRs);

  // Scrap Metrics & Percentages
  const totalJobMaterialOutputKg = roundToTwo(producedKg + totalScrapQtyKg);
  const overallScrapPctOfOutput = totalJobMaterialOutputKg > 0 ? Number(((totalScrapQtyKg / totalJobMaterialOutputKg) * 100).toFixed(2)) : 0;
  const overallScrapPctOfDispatch = totalNetQtyKg > 0 ? Number(((totalScrapQtyKg / totalNetQtyKg) * 100).toFixed(2)) : 0;

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
  const handleAddScrapDisposal = async (e) => {
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

    try {
      await saveScrapDisposal(supabase, newDisposal);
      setScrapDisposals([newDisposal, ...scrapDisposals]);
    } catch (err) {
      alert(`The scrap disposal was not saved: ${describeSaveError(err)}`);
      return;
    }

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

    setGuardrailPreview(buildFormGuardrail());
    setIsConfirmModalOpen(true);
  };

  const buildFormGuardrail = () => {
    const machine = (machines || []).find((item) => item.id === recordMachineId);
    const filmRows = calculatedMaterials.filter((row) => (parseFloat(row.netConsumedQtyKg) || 0) > 0 || row.filmType || row.micron || row.widthMm);
    const printRow = filmRows.reduce((best, row) => ((parseFloat(row.netConsumedQtyKg) || 0) >= (parseFloat(best?.netConsumedQtyKg) || 0) ? row : best), null);
    const otherFilmKg = filmRows
      .filter((row) => row !== printRow)
      .reduce((sum, row) => sum + (parseFloat(row.netConsumedQtyKg) || 0), 0);
    const printKg = parseFloat(qtyFirstPassL1) || 0;
    const lamOut = parseFloat(qtyLaminationL1) || 0;
    return validateProductionEntry({
      context: 'record-form',
      order: selectedOrder,
      jobMasters,
      limits: guardrailLimits,
      role: currentUser?.role,
      entry: {
        orderId: selectedOrder?.id,
        machineName: machine?.name || '',
        operatorName: recordOperator.trim(),
        shift: recordShift,
        meters: finiteNumber(selectedRecord?.actualMetersPrinted ?? selectedOrder?.actualMetersPrinted),
        printInputKg: parseFloat(printRow?.netConsumedQtyKg) || 0,
        printedOutputKg: printKg || finiteNumber(selectedRecord?.printedOutputKg ?? selectedOrder?.printedOutputKg),
        printingScrapKg: (parseFloat(printingPlainSettingWastageKg) || 0) + (parseFloat(printingWastageKg) || 0),
        durationMinutes: finiteNumber(selectedRecord?.printingDurationMinutes ?? selectedOrder?.printingDurationMinutes),
        ratedSpeedMpm: machine?.maxSpeedMpm,
        ratedSpeedConfigured: machine?.maxSpeedRecorded === true,
        inputRolls: filmRows.map((row) => ({
          filmType: row.filmType,
          micron: row.micron,
          widthMm: row.widthMm,
          consumedWeightKg: row.netConsumedQtyKg,
          barcode: row.barcode
        })),
        orderQtyKg: finiteNumber(selectedOrder?.orderQtyKg ?? selectedOrder?.quantityKg),
        quantityKg: producedKg,
        goodKg: totalNetQtyKg > 0 ? totalNetQtyKg : producedKg,
        scrapKg: totalScrapQtyKg,
        pouchingKg: qtyPouching,
        pouchingPcs: qtyPouchingPcs,
        zipperKg: zipperConsumedKg,
        zipperM: zipperConsumedM,
        lamination: lamOut > 0 ? {
          printedKg: printKg,
          substrateKg: otherFilmKg,
          adhesiveKg: parseFloat(adhesiveConsumedL1Kg) || 0,
          outputKg: lamOut,
          scrapKg: (parseFloat(laminationPlainSubstrateWastageKg) || 0) + (parseFloat(laminateWastageKg) || 0) + (parseFloat(laminationPlainSubstrateWastageL2Kg) || 0)
        } : null
      }
    });
  };

  // Step 2: Final Submit upon confirmation
  const handleFinalSubmitRecord = async () => {
    const printInputs = selectedRecord?.inputRollsList || selectedOrder?.inputRollsList || [];
    const printInputKg = printInputs.reduce((sum, roll) => sum + (parseFloat(roll?.consumedWeightKg) || 0), 0);
    const dryPreview = describeSubstrateAnalysis({
      record: {
        inputRollsList: printInputs,
        printedOutputKg: selectedRecord?.printedOutputKg || selectedOrder?.printedOutputKg,
        actualMetersPrinted: selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted,
        printWidthMm: selectedOrder?.printWidthMm,
        printingPlainSettingWastageKg,
        printingWastageKg
      },
      order: selectedOrder
    }).dry;
    const formCheck = assessFormMeasures({
      actualInkGsm,
      actualAdhesiveGsm,
      wastagePercentage: overallScrapPctOfOutput,
      actualMetersPrinted: selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted,
      printWidthMm: selectedOrder?.printWidthMm,
      micron: selectedOrder?.micron,
      printedOutputKg: selectedRecord?.printedOutputKg || selectedOrder?.printedOutputKg,
      grossProductionKg: totalJobMaterialOutputKg,
      dryInkSolidsKg: dryPreview.dryInkSolidsKg,
      printInputKg: printInputKg || null,
      adhesiveConsumedL1Kg,
      totalScrapQtyKg,
      substrateWarnings: describeSubstrateAnalysis({
        record: { inputRollsList: printInputs },
        order: selectedOrder
      }).match.warnings
    });
    const chainCheck = lineageProblems({
      inputRollsList: printInputs,
      printedOutputKg: selectedRecord?.printedOutputKg || selectedOrder?.printedOutputKg,
      actualMetersPrinted: selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted,
      printWidthMm: selectedOrder?.printWidthMm,
      printingPlainSettingWastageKg,
      printingWastageKg,
      sfgConsumptions: selectedRecord?.sfgConsumptions || [],
      orderId: selectedOrder?.id
    });
    const preview = buildFormGuardrail();
    setGuardrailPreview(preview);
    const decision = decideGuardrailSave(preview, {
      role: currentUser?.role,
      warningReason: guardrailWarningReason,
      filmTypeOverrideReason,
      overrideBy: currentUser?.name || ''
    });
    const blocks = [...formCheck.blocks, ...chainCheck.blocks, ...decision.messages];
    if (blocks.length) {
      alert(`This production record cannot be saved:\n\n${blocks.join('\n')}`);
      return;
    }
    const warnings = [...formCheck.warnings, ...chainCheck.warnings];
    let qualityWarningReason = guardrailWarningReason.trim();
    if (warnings.length && !qualityWarningReason) {
      const reason = window.prompt(`These values look unusual:\n\n${warnings.join('\n')}\n\nEnter a reason to save anyway. Leave this blank to go back.`);
      if (!reason || !reason.trim()) return;
      qualityWarningReason = reason.trim();
    }

    const selectedMachine = (machines || []).find((item) => item.id === recordMachineId);
    const newRecord = applyGuardrailFields(rollSfgScrapIntoRecord({
      id: selectedRecord?.id || `PR-${selectedOrder.id}`,
      orderId: selectedOrder.id,
      jobCode: selectedOrder.jobCode || selectedRecord?.jobCode || '',
      jobName: selectedOrder.jobName,
      clientName: selectedOrder.clientName,
      dateFilled: factoryCalendarDate(),
      machineName: selectedMachine?.name || '',
      operatorName: recordOperator.trim(),
      shift: recordShift,
      materialsList: calculatedMaterials,
      outputRolls: selectedRecord?.outputRolls || selectedOrder?.outputRolls || selectedOrder?.rollsBreakdown || [],
      rollsBreakdown: selectedRecord?.rollsBreakdown || selectedRecord?.outputRolls || selectedOrder?.rollsBreakdown || [],
      inputRollsList: selectedRecord?.inputRollsList || selectedOrder?.inputRollsList || [],
      actualMetersPrinted: finiteNumber(selectedRecord?.actualMetersPrinted ?? selectedOrder?.actualMetersPrinted),
      printedOutputKg: selectedRecord?.printedOutputKg || selectedOrder?.printedOutputKg || 0,
      printingStartTime: selectedRecord?.printingStartTime || selectedOrder?.printingStartTime || null,
      printingEndTime: selectedRecord?.printingEndTime || selectedOrder?.printingEndTime || null,
      printingDurationMinutes: selectedRecord?.printingDurationMinutes || selectedOrder?.printingDurationMinutes || null,
      printingDurationFormatted: selectedRecord?.printingDurationFormatted || selectedOrder?.printingDurationFormatted || '',
      stages: selectedRecord?.stages || selectedOrder?.stages || {},
      sfgConsumptions: selectedRecord?.sfgConsumptions || selectedOrder?.sfgConsumptions || [],
      
      // Stage-wise Quantities & Consumables (7 Stages)
      qtyFirstPassL1: finiteNumber(qtyFirstPassL1),
      qtyPrinting: finiteNumber(qtyFirstPassL1),
      qtyInspection: finiteNumber(qtyInspection),
      qtyLaminationL1: finiteNumber(qtyLaminationL1),
      adhesiveConsumedL1Kg: parseFloat(adhesiveConsumedL1Kg) || 0,
      qtySecondPassL2: finiteNumber(qtySecondPassL2),
      laminationPlainSubstrateWastageL2Kg: parseFloat(laminationPlainSubstrateWastageL2Kg) || 0,
      adhesiveConsumedL2Kg: parseFloat(adhesiveConsumedL2Kg) || 0,
      qtySlitting: finiteNumber(qtySlitting),
      paperCoreConsumedKg: parseFloat(paperCoreConsumedKg) || 0,
      qtyPouching: finiteNumber(qtyPouching),
      qtyPouchingPcs: finiteNumber(qtyPouchingPcs),
      zipperConsumedKg: parseFloat(zipperConsumedKg) || 0,
      zipperConsumedM: finiteNumber(zipperConsumedM),
      pouchingScrapKg: parseFloat(pouchingScrapKg) || 0,
      qtyDispatch: finiteNumber(qtyDispatch),
      totalProductionQtyKg: roundToTwo(totalJobMaterialOutputKg),

      // Snapshot consumable material cost rates and totals
      adhesiveCostPerKg: parseFloat(adhesiveCostPerKg) || 270,
      paperCoreCostPerKg: parseFloat(paperCoreCostPerKg) || 45,
      adhesiveCostRs: roundToTwo(adhesiveCostRs),
      paperCoreCostRs: roundToTwo(paperCoreCostRs),
      rawMaterialsTableCostRs: roundToTwo(rawMaterialsTableCostRs),
      totalMaterialCostRs: roundToTwo(totalMaterialCostRs),
      processingCostPerKg: roundToTwo(parseFloat(processingCostPerKg) || 25),
      totalProcessingCostRs: roundToTwo(totalProcessingCostRs),

      // Stage-wise Scrap Breakdown (in kg)
      printingPlainSettingWastageKg: parseFloat(printingPlainSettingWastageKg) || 0,
      printingWastageKg: parseFloat(printingWastageKg) || 0,
      laminationPlainSubstrateWastageKg: parseFloat(laminationPlainSubstrateWastageKg) || 0,
      printedWastageKg: parseFloat(printedWastageKg) || 0,
      laminateWastageKg: parseFloat(laminateWastageKg) || 0,
      trimWastageKg: parseFloat(trimWastageKg) || 0,
      slittingSettingWastageKg: Number(selectedRecord?.slittingSettingWastageKg) || 0,
      excessFilmWastageKg: Number(selectedRecord?.excessFilmWastageKg) || 0,
      excessFilmWastagePct: Number(selectedRecord?.excessFilmWastagePct) || 0,
      totalScrapQtyKg: roundToTwo(totalScrapQtyKg),
      totalWastageKg: roundToTwo(totalScrapQtyKg),
      grossProductionKg: roundToTwo(totalJobMaterialOutputKg),
      netUsableKg: finiteNumber(selectedRecord?.netUsableKg),
      deriveNetFromStages: true,
      overallScrapPctOfOutput: roundToTwo(overallScrapPctOfOutput),
      overallScrapPctOfDispatch: roundToTwo(overallScrapPctOfDispatch),
      wastagePercentage: roundToTwo(overallScrapPctOfOutput),
      scrapWastagePct: roundToTwo(overallScrapPctOfOutput),
      finalProductionCostRs: roundToTwo(finalProductionCostRs),

      // Target & Actual Ink & Adhesive GSMs
      actualInkGsm: actualInkGsm !== '' && !isNaN(parseFloat(actualInkGsm)) ? parseFloat(actualInkGsm) : null,
      actualAdhesiveGsm: actualAdhesiveGsm !== '' && !isNaN(parseFloat(actualAdhesiveGsm)) ? parseFloat(actualAdhesiveGsm) : null,
      targetInkGsm: parseFloat(targetInkGsm) || 1.5,
      targetAdhesiveGsm: parseFloat(targetAdhesiveGsm) || 1.5,
      inkGsmInSpeed: actualInkGsm !== '' && !isNaN(parseFloat(actualInkGsm)) ? parseFloat(actualInkGsm) : null,
      dryInkSolidsKg: dryPreview.dryInkSolidsKg,
      qualityWarningReason,

      status: "Filled by Plant Manager",
      filledBy: `${currentUser.name} (${currentUser.role})`,
      approvedBy: "",
      approvalDate: "",
      hasVariants: Boolean(selectedOrder?.hasVariants || selectedOrder?.variants?.length),
      variants: selectedOrder?.variants || [],
      notes: recordNotes
    }), decision);

    try {
      if (onSaveProductionRecord) await onSaveProductionRecord(newRecord);
    } catch (err) {
      alert(`The production record was not saved: ${err.message || err}`);
      return;
    }
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
    if (!r) return false;
    const q = (searchTerm || '').trim().toLowerCase();
    const matchesSearch = !q || 
                          String(r.jobName || '').toLowerCase().includes(q) || 
                          String(r.orderId || '').toLowerCase().includes(q) ||
                          String(r.clientName || '').toLowerCase().includes(q);
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
    if (!o) return false;
    const q = (searchTerm || '').trim().toLowerCase();
    return !q ||
           String(o.jobName || '').toLowerCase().includes(q) || 
           String(o.id || '').toLowerCase().includes(q) ||
           String(o.clientName || '').toLowerCase().includes(q);
  });

  const handleSaveSFGFG = async (inventoryItem, rolls, prodLink) => {
    if (Array.isArray(rolls)) {
      for (const roll of rolls) {
        if (onAddRoll) await onAddRoll(roll);
      }
    }

    if (prodLink && prodLink.orderId && onSaveProductionRecord) {
      const order = (orders || []).find((item) => item.id === prodLink.orderId);
      if (!order) {
        alert('This entry is not linked to an order. The production record was not saved.');
        throw new Error('A production record needs an order.');
      }
      const existingRecord = (productionRecords || []).find(pr => String(pr.orderId) === String(prodLink.orderId));
      const existingRolls = existingRecord?.outputRolls || [];
      const updatedRolls = [...existingRolls, ...(rolls || [])];
      const totalOutputKg = updatedRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
      const stageType = String(prodLink.stageType || '');
      const stageQty = {};
      if (prodLink.isFG) stageQty.qtyDispatch = totalOutputKg;
      else if (stageType.includes('Pouch')) stageQty.qtyPouching = totalOutputKg;
      else if (stageType.includes('Slit')) stageQty.qtySlitting = totalOutputKg;

      const updatedRecord = applyGuardrailFields(rollSfgScrapIntoRecord({
        ...(existingRecord || {
          id: `PROD-${prodLink.orderId}-${Date.now().toString().slice(-4)}`,
          status: 'In Progress'
        }),
        orderId: order.id,
        jobName: prodLink.jobName,
        jobCode: prodLink.jobCode,
        operatorName: prodLink.operatorName,
        shift: prodLink.shift,
        machineName: prodLink.machineName,
        dateFilled: prodLink.productionDate || factoryCalendarDate(),
        productionDate: prodLink.productionDate || factoryCalendarDate(),
        outputRolls: updatedRolls,
        actualOutputKg: totalOutputKg,
        ...stageQty,
        ...prodLink.guardrail,
        deriveNetFromStages: Boolean(prodLink.isFG || stageType.includes('Pouch') || stageType.includes('Slit')),
        lastUpdated: new Date().toISOString()
      }), { fields: prodLink.guardrail || {} });

      try {
        await onSaveProductionRecord(updatedRecord);
      } catch (err) {
        alert(`The production record was not saved: ${err.message || err}`);
        throw err;
      }
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
                          {(Array.isArray(ord.variants) && ord.variants.length > 0) && (
                            <span className="badge" style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', fontSize: '0.7rem', fontWeight: '800', marginTop: '4px', display: 'inline-block' }}>
                              🎨 {(ord.variants || []).length} Variants ({((ord.variants || []).map(v => v.variantName).join(', '))})
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#334155' }}>
                          <code>{getSubstrateStructure(ord)}</code>
                        </td>
                        <td style={{ fontWeight: '700' }}>
                          {(ord?.orderQtyKg || 0).toLocaleString()} kg
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{ord?.targetDeliveryDate || '—'}</td>
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

              <SearchableSelect 
                className="form-control"
                style={{ width: '220px' }}
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">All Approval Statuses</option>
                <option value="Filled by Plant Manager">Pending Admin Approval</option>
                <option value="Approved by Admin">Approved by Admin</option>
                <option value="Draft">Draft Records</option>
              </SearchableSelect>
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
                          {Number(rec.qtyDispatch) > 0 && (
                            <div style={{ marginTop: '3px' }}>
                              <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.7rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                🚚 Dispatched: {Number(rec.qtyDispatch).toLocaleString()} kg
                              </span>
                            </div>
                          )}
                          {((linkedOrder?.hasVariants || (Array.isArray(linkedOrder?.variants) && linkedOrder.variants.length > 0)) || (rec.hasVariants || (Array.isArray(rec.variants) && rec.variants.length > 0))) && (
                            <span className="badge" style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', fontSize: '0.7rem', fontWeight: '800', marginTop: '3px', display: 'inline-block' }}>
                              🎨 {(rec.variants || linkedOrder?.variants || []).length} Variants
                            </span>
                          )}
                        </td>
                        <td>{rec.dateFilled}</td>
                        <td style={{ fontWeight: '600' }}>{actualQty > 0 ? (actualQty || 0).toLocaleString() : 0} kg</td>
                        <td>₹ {(rec.totalMaterialCostRs ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ fontWeight: '700', color: '#047857' }}>₹ {(rec.finalProductionCostRs ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        
                        {/* Admin Only Profitability Column */}
                        {isAdmin && (
                          <td>
                            {revenue > 0 ? (
                              <>
                                <div style={{ fontWeight: '800', color: (profitRs || 0) >= 0 ? '#047857' : '#dc2626', fontSize: '0.85rem' }}>
                                  ₹ {(profitRs || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({marginPct}%)
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
                Job Master ID: <b>{selectedRecord.jobMasterId || JM_UNRESOLVED_LABEL}</b> • Order ID: <b>{selectedRecord.orderId || '—'}</b> • Client: {selectedRecord.clientName}
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
                    Approved by: {selectedRecord.approvedBy} on {formatPlantDateTime(selectedRecord.approvalDate)}
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
                            approvalDate: new Date().toISOString()
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
            const linkedOrder = orders.find(o => o.id && o.id === selectedRecord.orderId) || null;
            const matchedJM = resolveJobMaster({ order: linkedOrder, record: selectedRecord, jobMasters }).jobMaster;
            const substrateCard = substrateMatchSummary({ order: linkedOrder, record: selectedRecord, jobMasters });

            const inputRolls = selectedRecord.inputRollsList || [];
            const outputRolls = selectedRecord.rollsBreakdown || selectedRecord.outputRolls || [];
            const analysis = describeSubstrateAnalysis({
              record: selectedRecord,
              order: linkedOrder,
              jobMaster: matchedJM
            });
            const { dry } = analysis;
            const operatorInkGsm = finiteNumber(selectedRecord.inkGsmInSpeed);
            const actualCalculatedInkGsm = dry.gsm;
            const isInkGsmHigher = operatorInkGsm !== null && actualCalculatedInkGsm !== null && actualCalculatedInkGsm > operatorInkGsm;

            return (
              <>
                {((selectedRecord.hasVariants || (Array.isArray(selectedRecord.variants) && selectedRecord.variants.length > 0)) || (linkedOrder?.hasVariants || (Array.isArray(linkedOrder?.variants) && linkedOrder.variants.length > 0))) && (
                  <div style={{ margin: '16px 0', padding: '16px 20px', background: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: '12px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: '900', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🎨 ORDERED VARIANTS & FLAVORS BREAKDOWN (Total Order: {(linkedOrder?.orderQtyKg || selectedRecord?.totalProductionQtyKg || 0).toLocaleString()} kg)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                      {(selectedRecord.variants || linkedOrder?.variants || []).map((v, idx) => {
                        const qty = parseFloat(v.allocatedQtyKg || 0);
                        const total = parseFloat(linkedOrder?.orderQtyKg || selectedRecord?.totalProductionQtyKg || 1);
                        const pct = total > 0 ? ((qty / total) * 100).toFixed(1) : '0.0';
                        return (
                          <div key={v.id || idx} style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
                            <div style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.9rem' }}>{v.variantName}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                              <span style={{ fontWeight: '900', color: '#7e22ce', fontSize: '1rem' }}>{(qty || 0).toLocaleString()} kg</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b21a8', background: '#f3e8ff', padding: '2px 6px', borderRadius: '4px' }}>{pct}% share</span>
                            </div>
                            {v.notes && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Note: {v.notes}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                  <div data-testid="substrate-match-card" style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Substrate Match</span>
                    <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                      Job Master printing layer: {substrateCard.specLabel}
                    </div>
                    {substrateCard.rows.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: '#b45309', marginTop: '6px' }}>No input rolls recorded. Blank roll specs fail the check.</div>
                    ) : substrateCard.rows.map((row) => (
                      <div key={row.index} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '8px', fontSize: '0.84rem' }}>
                        <span>Roll {row.index + 1}: {row.filmType} / {row.micron === null ? UNKNOWN : `${row.micron} µ`} / {row.widthMm === null ? UNKNOWN : `${row.widthMm} mm`}</span>
                        <b style={{ color: row.status === 'fail' ? '#b91c1c' : row.status === 'warn' ? '#b45309' : '#047857' }}>
                          {row.status === 'fail' ? 'Fail' : row.status === 'warn' ? 'Warn' : 'Pass'}
                          {row.trimKg ? ` · trim ${row.trimKg} kg` : ''}
                        </b>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Total Input Consumed</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0284c7', marginTop: '2px' }}>
                      {analysis.inputKg === null ? NOT_RECORDED : `${analysis.inputKg.toFixed(2)} kg`}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Across {analysis.inputCount} input rolls</span>
                  </div>

                  {dry.trimKg > 0 && (
                    <div style={{ background: '#fffbeb', padding: '12px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: '800', textTransform: 'uppercase' }}>Extra Film Trimming Wastage</span>
                      <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#d97706', marginTop: '2px' }}>
                        {dry.trimKg.toFixed(2)} kg
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#b45309' }}>Input width is wider than the print width. Trim is excluded from dry ink solids.</span>
                    </div>
                  )}

                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Dry Ink Solids Gain</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#059669', marginTop: '2px' }}>
                      {dry.status === NOT_RECORDED ? NOT_RECORDED : `${dry.dryInkSolidsKg.toFixed(2)} kg`}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Dried web gain on the print step. Downstream output is not counted as ink.</span>
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
                          {operatorInkGsm === null ? NOT_RECORDED : `${operatorInkGsm.toFixed(2)} GSM`}
                        </div>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#94a3b8' }}>vs</div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: isInkGsmHigher ? '#dc2626' : '#059669', fontWeight: '800' }}>ACTUAL CALCULATED</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: isInkGsmHigher ? '#dc2626' : '#059669' }}>
                          {actualCalculatedInkGsm === null ? NOT_RECORDED : `${actualCalculatedInkGsm.toFixed(2)} GSM`}
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
                              <td><code style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>{displayText(r.barcodeId)}</code></td>
                              <td>{displayText(r.filmType)}</td>
                              <td>{finiteNumber(r.micron) === null ? NOT_RECORDED : `${r.micron}µ`}</td>
                              <td>{finiteNumber(r.widthMm) === null ? NOT_RECORDED : `${r.widthMm} mm`}</td>
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

                {/* Printed Output SFG / FG Rolls Breakdown Table */}
                {outputRolls.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Tag size={16} style={{ color: '#059669' }} /> 🏷️ Production Output Rolls & FG Breakdown ({outputRolls.length} Rolls)
                    </h5>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Roll #</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Barcode ID</th>
                          <th>Substrate Specs / Stage</th>
                          <th>Net Weight (kg)</th>
                          <th>Est. Length (Meters)</th>
                          <th>Destination Bay / Store</th>
                          <th>Inward Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outputRolls.map((r, idx) => {
                          const netW = parseFloat(r.netWeightKg || r.weightKg) || 0;
                          const lengthM = parseFloat(r.lengthMeters) || 0;
                          const isFG = r.rollType === 'FG' || (r.stage || '').includes('Slitting') || (r.stage || '').includes('Pouching') || codeStartsWith(r.barcodeId, 'FG-');
                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: '700' }}>Roll #{r.rollNo || r.unitNo || (idx + 1)}</td>
                              <td>
                                {isFG ? (
                                  <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: '800' }}>
                                    🟢 FG
                                  </span>
                                ) : (
                                  <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: '700' }}>
                                    🟡 SFG
                                  </span>
                                )}
                              </td>
                              <td>
                                {r.status === 'Dispatched' ? (
                                  <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem', fontWeight: '800' }}>
                                    🚚 Dispatched
                                  </span>
                                ) : (r.status === 'Ready for Dispatch' || isFG) ? (
                                  <span className="badge" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '0.68rem', fontWeight: '700' }}>
                                    📦 Ready for Dispatch
                                  </span>
                                ) : (
                                  <span className="badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontSize: '0.68rem' }}>
                                    {r.status || 'In Stock'}
                                  </span>
                                )}
                              </td>
                              <td>
                                <code style={{ background: isFG ? '#eff6ff' : '#ecfdf5', border: isFG ? '1px solid #bfdbfe' : '1px solid #a7f3d0', color: isFG ? '#1d4ed8' : '#047857', padding: '2px 8px', borderRadius: '4px', fontWeight: '900' }}>
                                  {displayText(r.barcodeId || r.id)}
                                </code>
                              </td>
                              <td>
                                {displayText(r.filmType)} {finiteNumber(r.micron) === null ? NOT_RECORDED : `${r.micron}µ`} ({finiteNumber(r.widthMm) === null ? NOT_RECORDED : `${r.widthMm} mm`})
                                {r.stage ? <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Process: {r.stage}</span> : null}
                              </td>
                              <td style={{ fontWeight: '800', color: '#059669' }}>{netW.toFixed(1)} kg</td>
                              <td style={{ fontWeight: '700', color: '#0284c7' }}>{lengthM > 0 ? `${(lengthM || 0).toLocaleString()} m` : NOT_RECORDED}</td>
                              <td>
                                <span style={{ fontSize: '0.74rem', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', color: '#334155', fontWeight: '600' }}>
                                  {r.locationBay || r.storageBay || r.nextProcess || (isFG ? 'FG Warehouse' : 'SFG Store (Pre-Lamination)')}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.inwardDatetime || r.createdAt || NOT_RECORDED}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
          })()}

          <RollLineageSummary record={selectedRecord} />

          {/* Ingredient Materials Breakdown Table */}
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--text-primary)' }}>
            📦 Ingredient Materials Issue & Return Record
          </h4>
          <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '24px' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '950px', margin: 0 }}>
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
                      ₹ {(m?.totalMaterialCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SFG / FG Output Barcode Master Rolls & Roll-Wise Input Vs Output Details */}
          <RollWiseInputOutputMasterRolls 
            targetOrder={orders.find(o => {
              const cleanO = String(o.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
              const cleanR = String(selectedRecord.orderId || selectedRecord.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
              return cleanO === cleanR || (selectedRecord.jobCode && o.jobCode === selectedRecord.jobCode) || (selectedRecord.jobName && o.jobName && o.jobName.trim().toLowerCase() === selectedRecord.jobName.trim().toLowerCase());
            }) || selectedOrder}
            targetRecord={selectedRecord}
            orders={orders}
            productionRecords={productionRecords}
            inventoryRolls={inventoryRolls}
            sfgGoods={sfgGoods}
            materialsList={selectedRecord.materialsList || []}
            onOpenSfgModal={handleOpenSfgModal}
            onOpenFgModal={handleOpenFgModal}
            onSelectRollForBarcodeModal={setSelectedRollForBarcodeModal}
          />

          {/* Consumed SFG Inventory Log (From SFG Store) */}
          {(() => {
            const sfgLogs = selectedRecord.sfgConsumptions || [];
            if (sfgLogs.length === 0) return null;

            return (
              <div style={{ marginTop: '20px', padding: '18px 20px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#c2410c', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Zap size={20} style={{ color: '#ea580c' }} /> Consumed SFG Inventory Log (From SFG Store)
                    </h4>
                    <p style={{ fontSize: '0.78rem', color: '#9a3412', margin: '3px 0 0 0' }}>
                      Audit log of intermediate SFG rolls consumed, Substrate 2/3 rolls added, stage scrap generated, and output rolls created.
                    </p>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#9a3412', fontWeight: '800', background: '#ffedd5', padding: '4px 10px', borderRadius: '12px', border: '1px solid #fdba74' }}>
                    {sfgLogs.length} Consumption Event(s)
                  </span>
                </div>

                <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                  <table className="data-table" style={{ fontSize: '0.8rem', width: '100%', margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#fff7ed', color: '#9a3412' }}>
                        <th>Date & Shift</th>
                        <th>SFG Roll (Input)</th>
                        <th>Target Stage & Machine</th>
                        <th>Substrate 2 / 3 Consumed</th>
                        <th>Stage Scrap & Consumables</th>
                        <th>Output Produced (SFG / FG)</th>
                        <th>Operator & Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sfgLogs.map((log, idx) => {
                        const sub2 = log.substrate2;
                        const sub3 = log.substrate3;
                        const sb = log.scrapBreakdown || {};
                        const out = log.outputRoll;

                        return (
                          <tr key={log.id || idx}>
                            <td style={{ color: '#475569', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: '700' }}>{new Date(log.timestamp || log.date).toLocaleDateString()}</div>
                              <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                                {new Date(log.timestamp || log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {log.shift || 'Shift'}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <code style={{ background: '#fff3ed', border: '1px solid #fdba74', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', color: '#c2410c', width: 'fit-content' }}>
                                  {log.sfgBatchCode || 'SFG-BATCH'}
                                </code>
                                <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                                  Consumed: <strong style={{ color: '#ea580c' }}>{log.consumedKg} kg</strong>
                                  {log.initialKg !== undefined && <span style={{ color: '#64748b' }}> / {log.initialKg} kg</span>}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: '700' }}>
                                  Rem: {log.remainingBalanceKg} kg
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: '800', color: '#0f172a' }}>{log.targetProcess}</div>
                              {log.targetMachine && (
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{log.targetMachine}</div>
                              )}
                            </td>
                            <td>
                              {Array.isArray(log.substrate2Rolls) && log.substrate2Rolls.length > 1 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {log.substrate2Rolls.map((roll, rollIdx) => (
                                    <div key={roll.barcode || rollIdx} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>
                                      <div style={{ fontWeight: '800', color: '#166534', marginBottom: '2px' }}>Substrate 2 roll {rollIdx + 1}</div>
                                      <div><code style={{ fontWeight: '800', color: '#15803d' }}>{roll.barcode || 'N/A'}</code> ({roll.filmType || 'Film'})</div>
                                      <div style={{ color: '#166534', marginTop: '2px' }}>
                                        Consumed: <strong>{roll.consumedKg} kg</strong> {roll.initialKg ? `/ ${roll.initialKg} kg` : ''}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : sub2 && (parseFloat(sub2.consumedKg) > 0 || sub2.barcode) ? (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>
                                  <div style={{ fontWeight: '800', color: '#166534', marginBottom: '2px' }}>Substrate 2 (Pass 1)</div>
                                  <div><code style={{ fontWeight: '800', color: '#15803d' }}>{sub2.barcode || 'N/A'}</code> ({sub2.filmType || 'Film'})</div>
                                  <div style={{ color: '#166534', marginTop: '2px' }}>
                                    Consumed: <strong>{sub2.consumedKg} kg</strong> {sub2.initialKg ? `/ ${sub2.initialKg} kg` : ''}
                                  </div>
                                  {sub2.remainingKg !== undefined && (
                                    <div style={{ color: '#65a30d', fontSize: '0.7rem' }}>Bal: {sub2.remainingKg} kg</div>
                                  )}
                                </div>
                              ) : sub3 && (parseFloat(sub3.consumedKg) > 0 || sub3.barcode) ? (
                                <div style={{ background: '#fdf4ff', border: '1px solid #f5d0fe', padding: '6px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>
                                  <div style={{ fontWeight: '800', color: '#86198f', marginBottom: '2px' }}>Substrate 3 (Pass 2)</div>
                                  <div><code style={{ fontWeight: '800', color: '#a21caf' }}>{sub3.barcode || 'N/A'}</code> ({sub3.filmType || 'Film'})</div>
                                  <div style={{ color: '#86198f', marginTop: '2px' }}>
                                    Consumed: <strong>{sub3.consumedKg} kg</strong> {sub3.initialKg ? `/ ${sub3.initialKg} kg` : ''}
                                  </div>
                                  {sub3.remainingKg !== undefined && (
                                    <div style={{ color: '#c026d3', fontSize: '0.7rem' }}>Bal: {sub3.remainingKg} kg</div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>-</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem' }}>
                                {(parseFloat(sb.laminationPlainSubstrateWastageKg) || 0) > 0 && (
                                  <span style={{ color: '#b45309' }}>• Substrate Scrap: <strong>{sb.laminationPlainSubstrateWastageKg} kg</strong></span>
                                )}
                                {(parseFloat(sb.laminateWastageKg) || 0) > 0 && (
                                  <span style={{ color: '#b45309' }}>• Laminate Scrap: <strong>{sb.laminateWastageKg} kg</strong></span>
                                )}
                                {(parseFloat(sb.adhesiveConsumedL1Kg) || 0) > 0 && (
                                  <span style={{ color: '#4338ca' }}>• Adhesive (Pass 1): <strong>{sb.adhesiveConsumedL1Kg} kg</strong> (@ ₹270/kg)</span>
                                )}
                                {(parseFloat(sb.laminationPlainSubstrateWastageL2Kg) || 0) > 0 && (
                                  <span style={{ color: '#b45309' }}>• Substrate Scrap L2: <strong>{sb.laminationPlainSubstrateWastageL2Kg} kg</strong></span>
                                )}
                                {(parseFloat(sb.adhesiveConsumedL2Kg) || 0) > 0 && (
                                  <span style={{ color: '#86198f' }}>• Adhesive (Pass 2): <strong>{sb.adhesiveConsumedL2Kg} kg</strong></span>
                                )}
                                {(parseFloat(sb.printingPlainSettingWastageKg) || 0) > 0 && (
                                  <span style={{ color: '#b45309' }}>• Plain Setting: <strong>{sb.printingPlainSettingWastageKg} kg</strong></span>
                                )}
                                {(parseFloat(sb.printingWastageKg) || 0) > 0 && (
                                  <span style={{ color: '#b45309' }}>• Printing Defect: <strong>{sb.printingWastageKg} kg</strong></span>
                                )}
                                {(parseFloat(sb.pouchingScrapKg) || 0) > 0 && (
                                  <span style={{ color: '#0f766e' }}>• Pouching Scrap: <strong>{sb.pouchingScrapKg} kg</strong></span>
                                )}
                                {(parseFloat(sb.zipperConsumedKg) || 0) > 0 && (
                                  <span style={{ color: '#0d9488' }}>• Zipper Consumed: <strong>{sb.zipperConsumedKg} kg</strong></span>
                                )}
                                {Object.values(sb).every(v => !(parseFloat(v) > 0)) && (
                                  <span style={{ color: '#94a3b8' }}>None logged</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {Array.isArray(log.outputRolls) && log.outputRolls.length > 1 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {log.outputRolls.map((roll, rollIdx) => (
                                    <div key={roll.barcode || rollIdx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                        <span className={`badge ${roll.outputType === 'FG' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                          {roll.outputType || 'SFG'}
                                        </span>
                                        <code style={{ fontWeight: '800', color: '#0f172a' }}>{roll.barcode}</code>
                                      </div>
                                      <div style={{ fontWeight: '800', color: '#0369a1' }}>Net: {roll.netWeightKg} kg</div>
                                    </div>
                                  ))}
                                </div>
                              ) : out && (parseFloat(out.netWeightKg) > 0 || out.barcode) ? (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                    <span className={`badge ${out.type === 'FG' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                      {out.type || 'SFG'}
                                    </span>
                                    <code style={{ fontWeight: '800', color: '#0f172a' }}>{out.barcode}</code>
                                  </div>
                                  <div style={{ fontWeight: '800', color: '#0369a1', marginTop: '2px' }}>
                                    Net: {out.netWeightKg} kg
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Gross: {out.grossWeightKg || '-'} kg | Tare: {out.tareWeightKg || 0} kg
                                  </div>
                                  {out.storageLocation && (
                                    <div style={{ fontSize: '0.68rem', color: '#475569' }}>
                                      📍 {out.storageLocation}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>No output roll</span>
                              )}
                            </td>
                            <td>
                              <div style={{ color: '#334155', fontWeight: '600' }}>{log.operatorName || '-'}</div>
                              {log.notes && (
                                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px', fontStyle: 'italic' }}>
                                  {log.notes}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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

                const totalAdhesiveConsumedKg = roundToTwo((parseFloat(selectedRecord.adhesiveConsumedL1Kg) || 0) + (parseFloat(selectedRecord.adhesiveConsumedL2Kg) || 0));
                const adhesiveCostPerKgSnap = Number(selectedRecord.adhesiveCostPerKg !== undefined && selectedRecord.adhesiveCostPerKg !== null ? selectedRecord.adhesiveCostPerKg : 270);
                const adhesiveCost = roundToTwo(Number(selectedRecord.adhesiveCostRs !== undefined && selectedRecord.adhesiveCostRs !== null ? selectedRecord.adhesiveCostRs : (adhesiveLoggedCost > 0 ? adhesiveLoggedCost : (totalAdhesiveConsumedKg * adhesiveCostPerKgSnap))));

                const paperCoreConsumedKg = roundToTwo(parseFloat(selectedRecord.paperCoreConsumedKg) || 0);
                const paperCoreCostPerKgSnap = Number(selectedRecord.paperCoreCostPerKg !== undefined && selectedRecord.paperCoreCostPerKg !== null ? selectedRecord.paperCoreCostPerKg : 45);
                const paperCoreCost = roundToTwo(Number(selectedRecord.paperCoreCostRs !== undefined && selectedRecord.paperCoreCostRs !== null ? selectedRecord.paperCoreCostRs : (paperCoreConsumedKg * paperCoreCostPerKgSnap)));

                const actualProcCost = roundToTwo(parseFloat(selectedRecord.totalProcessingCostRs) || parseFloat(selectedRecord.processingCostRs) || (actualQtyKg * (parseFloat(selectedRecord.processingCostPerKg) || 25)));
                const actualMaterialCost = selectedRecord.totalMaterialCostRs !== undefined && Number(selectedRecord.totalMaterialCostRs) > 0
                  ? roundToTwo(Number(selectedRecord.totalMaterialCostRs))
                  : roundToTwo(filmsCost + inksSolventsCost + adhesiveCost + paperCoreCost);
                const actualProductionCost = roundToTwo(Number(selectedRecord.finalProductionCostRs || selectedRecord.totalProductionCostRs || 0) || (actualMaterialCost + actualProcCost));

                const totalGrossRevenue = actualQtyKg > 0 && sellingPricePerKg > 0 ? Math.round(actualQtyKg * sellingPricePerKg) : 0;
                const netProfitRs = totalGrossRevenue > 0 ? totalGrossRevenue - actualProductionCost : 0;
                const profitMarginPct = totalGrossRevenue > 0 ? ((netProfitRs / totalGrossRevenue) * 100).toFixed(2) : null;

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
                          {totalGrossRevenue > 0 ? `₹ ${(totalGrossRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '— (No Selling Price)'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Selling Rate: {sellingPricePerKg > 0 ? `₹ ${sellingPricePerKg}/kg` : 'Not Set'} {actualQtyKg > 0 ? `• ${actualQtyKg.toFixed(1)} kg` : ''}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>QUOTED TARGET COST</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                          {hasPreCosting && estTotalCost > 0 ? `₹ ${(Math.round(estTotalCost) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '— (No Pre-Costing Target)'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {hasPreCosting && targetOrderQtyKg > 0 ? `Pre-Cost Rate: ₹ ${(estTotalCost / targetOrderQtyKg).toFixed(2)}/kg` : 'No pre-costing target attached'}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>ACTUAL PRODUCTION COST</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: hasPreCosting && costVarianceRs > 0 ? '#b91c1c' : '#047857', marginTop: '4px' }}>
                          ₹ {(Math.round(actualProductionCost) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: hasPreCosting ? (costVarianceRs > 0 ? '#dc2626' : '#059669') : 'var(--text-muted)', marginTop: '2px', fontWeight: '700' }}>
                          {hasPreCosting && estTotalCost > 0 ? (
                            costVarianceRs > 0 ? `Variance: +₹ ${(Math.round(costVarianceRs) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+${costVariancePct}%)` : `Variance: -₹ ${(Math.abs(Math.round(costVarianceRs)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${costVariancePct}%)`
                          ) : (
                            `Actual Cost Rate: ₹ ${actualQtyKg > 0 ? (actualProductionCost / actualQtyKg).toFixed(2) : '0'}/kg`
                          )}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: isHighProfit ? '#ecfdf5' : isModerateProfit ? '#f0f9ff' : isLowProfit ? '#fffbeb' : isLoss ? '#fef2f2' : '#f8fafc', border: `1px solid ${isHighProfit ? '#a7f3d0' : isModerateProfit ? '#bae6fd' : isLowProfit ? '#fde68a' : isLoss ? '#fca5a5' : '#cbd5e1'}` }}>
                        <div style={{ fontSize: '0.78rem', color: isHighProfit ? '#065f46' : isModerateProfit ? '#0369a1' : isLowProfit ? '#92400e' : isLoss ? '#991b1b' : '#475569', fontWeight: '800' }}>NET PROFIT / MARGIN</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: isHighProfit ? '#047857' : isModerateProfit ? '#0284c7' : isLowProfit ? '#b45309' : isLoss ? '#dc2626' : '#1e293b', marginTop: '4px' }}>
                          {totalGrossRevenue > 0 ? `₹ ${(Math.round(netProfitRs) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${profitMarginPct}%)` : '—'}
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
                            { label: `Lamination Adhesives & Hardeners (@ ₹${adhesiveCostPerKgSnap}/kg)`, est: Math.round(estAdhesiveCost), act: Math.round(adhesiveCost) },
                            { label: `Slitting Paper Cores (@ ₹${paperCoreCostPerKgSnap}/kg)`, est: 0, act: Math.round(paperCoreCost) },
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
                                <td>{hasEst ? `₹ ${(r.est || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '— (No Target)'}</td>
                                <td style={{ fontWeight: '700' }}>₹ {(r.act || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style={{ fontWeight: '800', color: hasEst ? (isOver ? '#dc2626' : '#059669') : 'var(--text-muted)' }}>
                                  {hasEst ? (isOver ? `+₹ ${(delta || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+${deltaPct}%)` : `₹ ${(delta || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${deltaPct}%)`) : '—'}
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
              <SearchableSelect 
                className="form-control"
                value={selectedOrder?.id || ''}
                onChange={e => handleSelectOrderForRecord(e.target.value)}
                placeholder="Search or Select Job / Order..."
                required
              >
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.jobName} ({o.clientName})
                  </option>
                ))}
              </SearchableSelect>
            </div>

            <div className="form-group">
              <label>Client Name</label>
              <input type="text" className="form-control" value={selectedOrder?.clientName || ''} readOnly />
            </div>

            <div className="form-group">
              <label>Record Filled By</label>
              <input type="text" className="form-control" value={`${currentUser.name} (${currentUser.role})`} readOnly />
            </div>

            <div className="form-group">
              <label>Machine *</label>
              <SearchableSelect className="form-control" value={recordMachineId} onChange={e => setRecordMachineId(e.target.value)} placeholder="Select machine" required>
                {(machines || []).map(machine => (
                  <option key={machine.id} value={machine.id}>{machine.name}</option>
                ))}
              </SearchableSelect>
            </div>
            <div className="form-group">
              <label>Operator *</label>
              <input type="text" className="form-control" value={recordOperator} onChange={e => setRecordOperator(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Shift *</label>
              <SearchableSelect className="form-control" value={recordShift} onChange={e => setRecordShift(e.target.value)} placeholder="Select shift" required>
                <option value="Day Shift (8 AM - 8 PM)">Day Shift (8 AM - 8 PM)</option>
                <option value="Night Shift (8 PM - 8 AM)">Night Shift (8 PM - 8 AM)</option>
              </SearchableSelect>
            </div>
          </div>

          {/* Job Variants Banner (If Job Has Variants) */}
          {(selectedOrder?.hasVariants || (Array.isArray(selectedOrder?.variants) && selectedOrder.variants.length > 0)) && (
            <div style={{ marginBottom: '20px', padding: '14px 18px', background: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: '10px' }}>
              <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: '800', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🎨 JOB VARIANTS & FLAVORS ORDERED (Total Order Weight: {(selectedOrder.orderQtyKg || 0).toLocaleString()} kg)
              </h5>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {selectedOrder.variants.map((v, idx) => (
                  <div key={v.id || idx} style={{ background: '#ffffff', border: '1px solid #d8b4fe', padding: '6px 12px', borderRadius: '6px', fontSize: '0.82rem' }}>
                    <strong style={{ color: '#1e293b' }}>{v.variantName}: </strong>
                    <span style={{ color: '#7e22ce', fontWeight: '800' }}>{parseFloat(v.allocatedQtyKg || 0).toLocaleString()} kg</span>
                    {v.notes && <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '6px' }}>({v.notes})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '24px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '1360px', margin: 0, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ minWidth: '220px', padding: '10px 12px' }}>Raw Material / Ingredient</th>
                  <th style={{ minWidth: '210px', padding: '10px 12px' }}>Barcode / Roll ID (Scan 📷)</th>
                  <th style={{ minWidth: '100px', width: '100px', textAlign: 'center', padding: '10px 8px' }}>Micron</th>
                  <th style={{ minWidth: '125px', width: '125px', textAlign: 'center', padding: '10px 8px' }}>Width (mm)</th>
                  <th style={{ minWidth: '145px', width: '145px', textAlign: 'right', padding: '10px 8px' }}>Issued Qty (kg)</th>
                  <th style={{ minWidth: '145px', width: '145px', textAlign: 'right', padding: '10px 8px' }}>Unused Return (kg)</th>
                  <th style={{ minWidth: '140px', width: '140px', color: '#047857', padding: '10px 8px' }}>Net Consumed (kg)</th>
                  <th style={{ minWidth: '135px', width: '135px', textAlign: 'right', padding: '10px 8px' }}>Unit Rate (₹/kg)</th>
                  <th style={{ minWidth: '145px', width: '145px', padding: '10px 12px' }}>Total Cost (₹)</th>
                  <th style={{ width: '55px', minWidth: '55px', textAlign: 'center', padding: '10px 6px' }}>Action</th>
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
                      <td style={{ verticalAlign: 'top', padding: '8px 10px' }}>
                        <SearchableSelect 
                          className="form-control"
                          style={{ fontWeight: '600', minWidth: '200px' }}
                          triggerStyle={{ fontSize: '0.85rem', padding: '7px 10px' }}
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
                        </SearchableSelect>
                        {m.hasFilmTypeVar && (
                          <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '3px', display: 'block' }}>
                            ⚠️ Substrate Mismatch vs JM ({m.jobMasterFilmType})
                          </span>
                        )}
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 10px' }}>
                        <div style={{ position: 'relative' }}>
                          <input 
                            type="text" 
                            className="form-control"
                            style={{ paddingLeft: '28px', paddingRight: m.barcode ? '28px' : '10px', paddingTop: '7px', paddingBottom: '7px', fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: '700', background: m.barcode ? '#f0f9ff' : '#ffffff', minWidth: '190px' }}
                            placeholder="Scan or type Barcode..."
                            value={m.barcode || ''}
                            onChange={e => {
                              const val = e.target.value;
                              updateMaterialRow(m.id, 'barcode', val);
                              if (val.trim()) {
                                // 1. Primary lookup in individual barcode rolls
                                const rollMatch = (inventoryRolls || []).find(r => 
                                  codesEqual(r.barcodeId, val) ||
                                  codesEqual(r.batchNo, val)
                                );

                                if (rollMatch) {
                                  const scannedWeight = finiteNumber(rollMatch.availableWeightKg ?? rollMatch.netWeightKg);
                                  if (scannedWeight === null || scannedWeight <= 0) {
                                    updateMaterialRow(m.id, 'issueQtyKg', '');
                                    alert('This roll has no weight on file. Enter the weight before saving.');
                                  } else {
                                    updateMaterialRow(m.id, 'issueQtyKg', scannedWeight);
                                  }
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
                                    codesEqual(inv.itemCode, val) ||
                                    codesEqual(inv.lastBatch, val) || 
                                    codesEqual(inv.id, val) ||
                                    codesEqual(inv.filmType, val)
                                  );
                                  if (match) {
                                    const scannedWeight = finiteNumber(match.availableQtyKg ?? match.stockQtyKg);
                                    if (scannedWeight === null || scannedWeight <= 0) {
                                      updateMaterialRow(m.id, 'issueQtyKg', '');
                                      alert('This item has no weight on file. Enter the weight before saving.');
                                    } else {
                                      updateMaterialRow(m.id, 'issueQtyKg', scannedWeight);
                                    }
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

                      <td style={{ verticalAlign: 'top', padding: '8px 8px' }}>
                        <input 
                          type="number"
                          step="any"
                          className="form-control"
                          style={{ minWidth: '85px', padding: '7px 8px', fontSize: '0.88rem', fontWeight: '600', textAlign: 'center' }}
                          placeholder="e.g. 12"
                          value={m.micron}
                          onChange={e => updateMaterialRow(m.id, 'micron', e.target.value)}
                        />
                        {m.micronGuardMessage && (
                          <span className="badge badge-warning" style={{ background: m.micronVarPct === 'block' ? '#fef2f2' : '#fff7ed', color: m.micronVarPct === 'block' ? '#b91c1c' : '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '2px', display: 'block', textAlign: 'center' }}>
                            Mismatch vs JM
                          </span>
                        )}
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 8px' }}>
                        <input 
                          type="number"
                          step="any"
                          className="form-control"
                          style={{ minWidth: '105px', padding: '7px 10px', fontSize: '0.88rem', fontWeight: '600', textAlign: 'center' }}
                          placeholder="e.g. 800"
                          value={m.widthMm}
                          onChange={e => updateMaterialRow(m.id, 'widthMm', e.target.value)}
                        />
                        {m.widthGuardMessage && (
                          <span className="badge badge-warning" style={{ background: m.widthVarPct === 'block' ? '#fef2f2' : '#fff7ed', color: m.widthVarPct === 'block' ? '#b91c1c' : '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '2px', display: 'block', textAlign: 'center' }}>
                            Mismatch vs JM
                          </span>
                        )}
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 8px' }}>
                        <input 
                          type="number" 
                          step="0.01"
                          className="form-control"
                          style={{ minWidth: '125px', padding: '7px 10px', fontSize: '0.88rem', fontWeight: '700', textAlign: 'right' }}
                          placeholder="0.00"
                          value={m.issueQtyKg}
                          onChange={e => updateMaterialRow(m.id, 'issueQtyKg', e.target.value)}
                          required
                        />
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 8px' }}>
                        <input 
                          type="number" 
                          step="0.01"
                          className="form-control"
                          style={{ minWidth: '125px', padding: '7px 10px', fontSize: '0.88rem', fontWeight: '700', textAlign: 'right', color: isPartialReturn ? '#dc2626' : 'var(--text-main, #334155)' }}
                          placeholder="0.00"
                          value={m.returnQtyKg}
                          onChange={e => updateMaterialRow(m.id, 'returnQtyKg', e.target.value)}
                        />
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 8px' }}>
                        <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                          {m.netConsumedQtyKg} kg
                        </div>
                        {isPartialReturn ? (
                          <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '2px 6px', marginTop: '3px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', display: 'inline-block', whiteSpace: 'nowrap' }}>
                            📦 {m.returnQtyKg} kg returned
                          </span>
                        ) : (
                          <span className="badge badge-us" style={{ fontSize: '0.68rem', padding: '2px 6px', marginTop: '3px', display: 'inline-block', whiteSpace: 'nowrap' }}>
                            Return: 0 kg
                          </span>
                        )}
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 8px' }}>
                        <input 
                          type="number" 
                          step="0.01"
                          className="form-control"
                          style={{ minWidth: '115px', padding: '7px 10px', fontSize: '0.88rem', fontWeight: '600', textAlign: 'right' }}
                          placeholder="Rate ₹"
                          value={m.unitPricePerKg}
                          onChange={e => updateMaterialRow(m.id, 'unitPricePerKg', e.target.value)}
                          required
                        />
                      </td>

                      <td style={{ verticalAlign: 'top', padding: '8px 10px', fontWeight: '800', color: 'var(--text-primary)', whiteSpace: 'nowrap', minWidth: '135px', fontSize: '0.92rem' }}>
                        ₹ {(m?.totalMaterialCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      <td style={{ verticalAlign: 'top', textAlign: 'center', padding: '8px 6px' }}>
                        <button type="button" className="icon-btn-danger" style={{ padding: '6px 8px', marginTop: '2px' }} onClick={() => removeMaterialRow(m.id)} title="Remove Row">
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SFG / FG Output Barcode Master Rolls & Roll-Wise Input Vs Output Details */}
          <RollWiseInputOutputMasterRolls 
            targetOrder={selectedOrder}
            targetRecord={selectedRecord || (productionRecords || []).find(r => {
              if (!selectedOrder) return false;
              const cleanR = String(r.orderId || r.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
              const cleanO = String(selectedOrder.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
              return cleanR === cleanO || (selectedOrder.jobCode && r.jobCode === selectedOrder.jobCode) || (selectedOrder.jobName && r.jobName && r.jobName.trim().toLowerCase() === selectedOrder.jobName.trim().toLowerCase());
            })}
            orders={orders}
            productionRecords={productionRecords}
            inventoryRolls={inventoryRolls}
            sfgGoods={sfgGoods}
            materialsList={materialsList}
            onOpenSfgModal={handleOpenSfgModal}
            onOpenFgModal={handleOpenFgModal}
            onSelectRollForBarcodeModal={setSelectedRollForBarcodeModal}
          />

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

            {/* SFG Process Consumption Linked Banner */}
            {(() => {
              const activeSfgLogs = selectedRecord?.sfgConsumptions || selectedOrder?.sfgConsumptions || [];
              if (activeSfgLogs.length === 0) return null;

              return (
                <div style={{ marginBottom: '18px', padding: '14px 18px', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ background: '#ffedd5', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap size={20} style={{ color: '#ea580c' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: '800', color: '#9a3412', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Linked SFG Store Process Consumptions ({activeSfgLogs.length} events logged)
                          <span style={{ background: '#ea580c', color: '#ffffff', fontSize: '0.68rem', fontWeight: '800', padding: '1px 8px', borderRadius: '10px' }}>
                            Pre-filled
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#c2410c', marginTop: '2px' }}>
                          Stage outputs, Substrate 2/3 rolls, adhesive consumed, and stage scrap have been auto-populated from SFG Store.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '5px 12px', background: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412', fontWeight: '700' }}
                      onClick={() => setShowSfgConsumptionPreview(prev => !prev)}
                    >
                      {showSfgConsumptionPreview ? 'Hide SFG Log Table' : `View ${activeSfgLogs.length} SFG Event(s)`}
                    </button>
                  </div>

                  {showSfgConsumptionPreview && (
                    <div style={{ marginTop: '14px', overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                      <table className="data-table" style={{ fontSize: '0.78rem', width: '100%', margin: 0 }}>
                        <thead>
                          <tr style={{ background: '#fff7ed', color: '#9a3412' }}>
                            <th>Date & Shift</th>
                            <th>Input SFG Barcode</th>
                            <th>Target Stage</th>
                            <th>Substrate 2 / 3 Consumed</th>
                            <th>Stage Scrap Breakdown</th>
                            <th>Output Roll Created</th>
                            <th>Operator</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSfgLogs.map((log, idx) => {
                            const sub2 = log.substrate2;
                            const sub3 = log.substrate3;
                            const sb = log.scrapBreakdown || {};
                            const out = log.outputRoll;
                            return (
                              <tr key={log.id || idx}>
                                <td style={{ color: '#475569', whiteSpace: 'nowrap' }}>
                                  {new Date(log.timestamp || log.date).toLocaleDateString()} • {log.shift || 'Day'}
                                </td>
                                <td>
                                  <code style={{ background: '#fff3ed', border: '1px solid #fdba74', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', color: '#c2410c' }}>
                                    {log.sfgBatchCode || 'SFG-BATCH'}
                                  </code>
                                  <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700', marginTop: '2px' }}>
                                    {log.consumedKg} kg
                                  </div>
                                </td>
                                <td style={{ fontWeight: '700', color: '#0f172a' }}>
                                  {log.targetProcess}
                                </td>
                                <td>
                                  {Array.isArray(log.substrate2Rolls) && log.substrate2Rolls.length > 1 ? (
                                    <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                                      {log.substrate2Rolls.map((roll, rollIdx) => (
                                        <div key={roll.barcode || rollIdx}>
                                          Sub 2 roll {rollIdx + 1}: <strong>{roll.barcode || 'N/A'}</strong> ({roll.consumedKg} kg)
                                        </div>
                                      ))}
                                    </div>
                                  ) : sub2 && (parseFloat(sub2.consumedKg) > 0 || sub2.barcode) ? (
                                    <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                                      Sub 2: <strong>{sub2.barcode || 'N/A'}</strong> ({sub2.consumedKg} kg)
                                    </div>
                                  ) : sub3 && (parseFloat(sub3.consumedKg) > 0 || sub3.barcode) ? (
                                    <div style={{ fontSize: '0.72rem', color: '#86198f' }}>
                                      Sub 3: <strong>{sub3.barcode || 'N/A'}</strong> ({sub3.consumedKg} kg)
                                    </div>
                                  ) : '-'}
                                </td>
                                <td>
                                  <div style={{ fontSize: '0.72rem', color: '#78350f' }}>
                                    {(parseFloat(sb.laminationPlainSubstrateWastageKg) || 0) > 0 && `Sub Scrap: ${sb.laminationPlainSubstrateWastageKg}kg `}
                                    {(parseFloat(sb.laminateWastageKg) || 0) > 0 && `Lam Scrap: ${sb.laminateWastageKg}kg `}
                                    {(parseFloat(sb.adhesiveConsumedL1Kg) || 0) > 0 && `Adh L1: ${sb.adhesiveConsumedL1Kg}kg `}
                                    {(parseFloat(sb.laminationPlainSubstrateWastageL2Kg) || 0) > 0 && `Sub L2: ${sb.laminationPlainSubstrateWastageL2Kg}kg `}
                                    {(parseFloat(sb.adhesiveConsumedL2Kg) || 0) > 0 && `Adh L2: ${sb.adhesiveConsumedL2Kg}kg `}
                                    {(parseFloat(sb.printingPlainSettingWastageKg) || 0) > 0 && `Print Plain: ${sb.printingPlainSettingWastageKg}kg `}
                                    {(parseFloat(sb.printingWastageKg) || 0) > 0 && `Print Scrap: ${sb.printingWastageKg}kg `}
                                    {(parseFloat(sb.pouchingScrapKg) || 0) > 0 && `Pouch Scrap: ${sb.pouchingScrapKg}kg `}
                                    {(parseFloat(sb.zipperConsumedKg) || 0) > 0 && `Zipper: ${sb.zipperConsumedKg}kg `}
                                  </div>
                                </td>
                                <td>
                                  {Array.isArray(log.outputRolls) && log.outputRolls.length > 1 ? (
                                    <div style={{ fontSize: '0.72rem' }}>
                                      {log.outputRolls.map((roll, rollIdx) => (
                                        <div key={roll.barcode || rollIdx}>
                                          <span className={`badge ${roll.outputType === 'FG' ? 'badge-success' : 'badge-info'}`} style={{ padding: '1px 5px', fontSize: '0.65rem' }}>
                                            {roll.outputType || 'SFG'}
                                          </span> <code>{roll.barcode}</code> ({roll.netWeightKg} kg)
                                        </div>
                                      ))}
                                    </div>
                                  ) : out && (parseFloat(out.netWeightKg) > 0 || out.barcode) ? (
                                    <div style={{ fontSize: '0.72rem' }}>
                                      <span className={`badge ${out.type === 'FG' ? 'badge-success' : 'badge-info'}`} style={{ padding: '1px 5px', fontSize: '0.65rem' }}>
                                        {out.type}
                                      </span> <code>{out.barcode}</code> ({out.netWeightKg} kg)
                                    </div>
                                  ) : '-'}
                                </td>
                                <td style={{ color: '#475569' }}>
                                  {log.operatorName || '-'}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* STAGE 1: PRINTING */}
              <div style={{ background: '#ffffff', border: '1px solid #bae6fd', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.05)' }}>
                <div style={{ background: '#f0f9ff', padding: '12px 20px', borderBottom: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '800', color: '#0369a1', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#0284c7', color: '#ffffff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '900' }}>1</span>
                    Stage 1: Printing
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(selectedRecord?.sfgConsumptions || selectedOrder?.sfgConsumptions || []).some(l => l.targetProcess === 'Printing (Pass 2)') && (
                      <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.72rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={11} /> Auto-filled from SFG Store
                      </span>
                    )}
                    <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1' }}>
                      Printing Pass (Surface & Reverse)
                    </span>
                  </div>
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
                              📏 Actual Meters: <strong>{(Number(selectedRecord?.actualMetersPrinted || selectedOrder?.actualMetersPrinted) || 0).toLocaleString()} m</strong>
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
                        placeholder="Recorded GSM"
                      />
                      <MeasureRangeHint field="inkGsm" value={actualInkGsm} />
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(selectedRecord?.sfgConsumptions || selectedOrder?.sfgConsumptions || []).some(l => l.targetProcess === 'Lamination (Pass 1)') && (
                      <span style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', fontSize: '0.72rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={11} /> Pre-filled from SFG Consumption (Substrate 2 roll linked)
                      </span>
                    )}
                    <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca' }}>
                      2-Layer & 3-Layer Jobs
                    </span>
                  </div>
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
                        placeholder="Recorded GSM"
                      />
                      <MeasureRangeHint field="adhesiveGsm" value={actualAdhesiveGsm} />
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#4338ca', margin: 0 }}>
                            🧪 Adhesive Consumed (kg)
                          </label>
                          <span style={{ fontSize: '0.7rem', color: '#4338ca', fontWeight: '700', background: '#e0e7ff', padding: '1px 6px', borderRadius: '4px' }}>
                            @ ₹{adhesiveCostPerKg}/kg
                          </span>
                        </div>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #a5b4fc' }} 
                          value={adhesiveConsumedL1Kg} 
                          onChange={e => setAdhesiveConsumedL1Kg(e.target.value)} 
                        />
                        {(parseFloat(adhesiveConsumedL1Kg) || 0) > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#4338ca', fontWeight: '700', marginTop: '3px' }}>
                            = ₹ {formatUpToTwoDecimals((parseFloat(adhesiveConsumedL1Kg) || 0) * (parseFloat(adhesiveCostPerKg) || 0))}
                          </div>
                        )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(selectedRecord?.sfgConsumptions || selectedOrder?.sfgConsumptions || []).some(l => l.targetProcess === 'Lamination (Pass 2)') && (
                      <span style={{ background: '#fae8ff', color: '#86198f', border: '1px solid #f5d0fe', fontSize: '0.72rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={11} /> Pre-filled from SFG Consumption (Substrate 3 roll linked)
                      </span>
                    )}
                    <span className="badge badge-warning" style={{ fontSize: '0.72rem', background: '#fae8ff', color: '#86198f', border: '1px solid #f5d0fe' }}>
                      For 3-Layer Laminate Jobs Only
                    </span>
                  </div>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#86198f', margin: 0 }}>
                            🧪 Adhesive Consumed (kg)
                          </label>
                          <span style={{ fontSize: '0.7rem', color: '#86198f', fontWeight: '700', background: '#fae8ff', padding: '1px 6px', borderRadius: '4px' }}>
                            @ ₹{adhesiveCostPerKg}/kg
                          </span>
                        </div>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #f0abfc' }} 
                          value={adhesiveConsumedL2Kg} 
                          onChange={e => setAdhesiveConsumedL2Kg(e.target.value)} 
                        />
                        {(parseFloat(adhesiveConsumedL2Kg) || 0) > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#86198f', fontWeight: '700', marginTop: '3px' }}>
                            = ₹ {formatUpToTwoDecimals((parseFloat(adhesiveConsumedL2Kg) || 0) * (parseFloat(adhesiveCostPerKg) || 0))}
                          </div>
                        )}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#047857', margin: 0 }}>
                            📦 Paper Core Consumed (kg)
                          </label>
                          <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: '700', background: '#d1fae5', padding: '1px 6px', borderRadius: '4px' }}>
                            @ ₹{paperCoreCostPerKg}/kg
                          </span>
                        </div>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #6ee7b7' }} 
                          value={paperCoreConsumedKg} 
                          onChange={e => setPaperCoreConsumedKg(e.target.value)} 
                        />
                        {(parseFloat(paperCoreConsumedKg) || 0) > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#047857', fontWeight: '700', marginTop: '3px' }}>
                            = ₹ {formatUpToTwoDecimals((parseFloat(paperCoreConsumedKg) || 0) * (parseFloat(paperCoreCostPerKg) || 0))}
                          </div>
                        )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(selectedRecord?.sfgConsumptions || selectedOrder?.sfgConsumptions || []).some(l => l.targetProcess === 'Pouching / Bag Making') && (
                      <span style={{ background: '#ccfbf1', color: '#0f766e', border: '1px solid #99f6e4', fontSize: '0.72rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={11} /> Pre-filled from SFG Consumption
                      </span>
                    )}
                    <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e' }}>
                      Pouch Form Jobs Only
                    </span>
                  </div>
                </div>

                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f766e', textTransform: 'uppercase', margin: 0 }}>
                        Pouching Finished Output (kg)
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
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f766e', display: 'block', margin: '10px 0 4px' }}>
                      Pouch count (pcs)
                    </label>
                    <input
                      type="number"
                      step="1"
                      className="form-control"
                      value={qtyPouchingPcs}
                      onChange={e => setQtyPouchingPcs(e.target.value)}
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                      Kilograms stay in the kg field. Piece counts are stored separately and are not added into kg totals.
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🟠 Pouching Consumables & Scrap
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f766e', display: 'block', marginBottom: '4px' }}>
                          Zipper consumed (kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.1" 
                          className="form-control" 
                          style={{ background: '#ffffff', fontWeight: '700', border: '1.5px solid #5eead4' }} 
                          value={zipperConsumedKg} 
                          onChange={e => setZipperConsumedKg(e.target.value)} 
                        />
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f766e', display: 'block', margin: '8px 0 4px' }}>
                          Zipper consumed (m)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          value={zipperConsumedM}
                          onChange={e => setZipperConsumedM(e.target.value)}
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
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '4px', color: '#1e40af' }}>
                  ₹ {formatUpToTwoDecimals(totalMaterialCostRs)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                  Films: ₹ {formatUpToTwoDecimals(rawMaterialsTableCostRs)}<br/>
                  + Adhesive ({formatUpToTwoDecimals(totalAdhesiveConsumedKg)} kg @ ₹{adhesiveCostPerKg}/kg): ₹ {formatUpToTwoDecimals(adhesiveCostRs)}<br/>
                  + Paper Core ({formatUpToTwoDecimals(paperCoreConsumedKg)} kg @ ₹{paperCoreCostPerKg}/kg): ₹ {formatUpToTwoDecimals(paperCoreCostRs)}
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
                  Processing Cost: ₹ {(totalProcessingCostRs || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '20px' }}>
                <span className="stats-title" style={{ color: '#047857' }}>TOTAL COST OF PRODUCTION</span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857', marginTop: '4px' }}>
                  ₹ {(finalProductionCostRs || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        {formatUpToTwoDecimals(qtyLaminationL1)} kg
                      </td>
                      <td>Adhesive: <strong>{formatUpToTwoDecimals(adhesiveConsumedL1Kg)} kg</strong> (₹{formatUpToTwoDecimals((parseFloat(adhesiveConsumedL1Kg) || 0) * (parseFloat(adhesiveCostPerKg) || 0))})</td>
                      <td>
                        {formatUpToTwoDecimals((parseFloat(laminationPlainSubstrateWastageKg) || 0) + (parseFloat(printedWastageKg) || 0))} kg
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
                      <td style={{ fontWeight: '700' }}>{formatUpToTwoDecimals(qtySecondPassL2)} kg</td>
                      <td>Adhesive L2: <strong>{formatUpToTwoDecimals(adhesiveConsumedL2Kg)} kg</strong> (₹{formatUpToTwoDecimals((parseFloat(adhesiveConsumedL2Kg) || 0) * (parseFloat(adhesiveCostPerKg) || 0))})</td>
                      <td>{formatUpToTwoDecimals(laminationPlainSubstrateWastageL2Kg)} kg</td>
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
                        {formatUpToTwoDecimals(qtySlitting)} kg
                      </td>
                      <td>Paper Core: <strong>{formatUpToTwoDecimals(paperCoreConsumedKg)} kg</strong> (₹{formatUpToTwoDecimals((parseFloat(paperCoreConsumedKg) || 0) * (parseFloat(paperCoreCostPerKg) || 0))})</td>
                      <td>
                        {formatUpToTwoDecimals((parseFloat(laminateWastageKg) || 0) + (parseFloat(trimWastageKg) || 0))} kg
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
                              Mismatch vs JM
                              {m.hasFilmTypeVar && ' · film'}
                              {m.micronGuardMessage && ' · micron'}
                              {m.widthGuardMessage && ' · width'}
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
                        <td>₹ {(parseFloat(m.unitPricePerKg) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</td>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>₹ {(m.totalMaterialCost ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}

                    {/* Adhesive Consumed Row */}
                    <tr style={{ background: '#f5f3ff' }}>
                      <td style={{ fontWeight: '700', color: '#4338ca' }}>
                        🧪 Lamination Adhesive (Consumable)
                      </td>
                      <td>-</td>
                      <td>-</td>
                      <td>{formatUpToTwoDecimals(totalAdhesiveConsumedKg)} kg</td>
                      <td>-</td>
                      <td style={{ fontWeight: '700', color: '#4338ca' }}>
                        {formatUpToTwoDecimals(totalAdhesiveConsumedKg)} kg
                      </td>
                      <td>₹ {formatUpToTwoDecimals(adhesiveCostPerKg)}/kg</td>
                      <td style={{ fontWeight: '700', color: '#4338ca' }}>
                        ₹ {formatUpToTwoDecimals(adhesiveCostRs)}
                      </td>
                    </tr>

                    {/* Paper Core Consumed Row */}
                    <tr style={{ background: '#ecfdf5' }}>
                      <td style={{ fontWeight: '700', color: '#047857' }}>
                        📦 Slitting Paper Cores (Consumable)
                      </td>
                      <td>-</td>
                      <td>-</td>
                      <td>{formatUpToTwoDecimals(paperCoreConsumedKg)} kg</td>
                      <td>-</td>
                      <td style={{ fontWeight: '700', color: '#047857' }}>
                        {formatUpToTwoDecimals(paperCoreConsumedKg)} kg
                      </td>
                      <td>₹ {formatUpToTwoDecimals(paperCoreCostPerKg)}/kg</td>
                      <td style={{ fontWeight: '700', color: '#047857' }}>
                        ₹ {formatUpToTwoDecimals(paperCoreCostRs)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Costing & Financial Summary Box */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px 20px', borderRadius: '10px', marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.85rem', marginBottom: '12px' }}>
                <div>Dispatch Ready Produced Qty: <strong>{formatUpToTwoDecimals(totalNetQtyKg)} kg</strong></div>
                <div>
                  Total Ingredients Cost: <strong>₹ {formatUpToTwoDecimals(totalMaterialCostRs)}</strong>
                  <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '2px' }}>
                    Substrates: ₹{formatUpToTwoDecimals(rawMaterialsTableCostRs)} | Adhesive: ₹{formatUpToTwoDecimals(adhesiveCostRs)} (@₹{adhesiveCostPerKg}/kg) | Paper Core: ₹{formatUpToTwoDecimals(paperCoreCostRs)} (@₹{paperCoreCostPerKg}/kg)
                  </div>
                </div>
                <div>Processing Rate: <strong>₹ {formatUpToTwoDecimals(processingCostPerKg)}/kg</strong></div>
                <div>Total Processing Cost: <strong>₹ {formatUpToTwoDecimals(totalProcessingCostRs)}</strong></div>
                <div>Total Scrap Generated: <strong style={{ color: '#b45309' }}>{formatUpToTwoDecimals(totalScrapQtyKg)} kg ({formatUpToTwoDecimals(overallScrapPctOfDispatch)}% of dispatch)</strong></div>
              </div>

              <div style={{ borderTop: '1px solid #6ee7b7', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '800', color: '#065f46', fontSize: '0.95rem' }}>TOTAL COST OF PRODUCTION:</span>
                <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857' }}>
                  ₹ {formatUpToTwoDecimals(finalProductionCostRs)}
                </span>
              </div>
            </div>

            {guardrailPreview && (
              <div data-testid="record-guardrail-banner" style={{ background: guardrailPreview.blocks.length || guardrailPreview.filmTypeBlocks.length ? '#fef2f2' : '#fffbeb', border: '1px solid #f59e0b', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '800', marginBottom: '6px' }}>
                  {formResolution.status === 'linked' ? `Job Master ${formSpec?.filmType || UNKNOWN} / ${formSpec?.micron ?? UNKNOWN} µ / ${formSpec?.printWidthMm ?? UNKNOWN} mm` : JM_UNRESOLVED_LABEL}
                </div>
                {[...guardrailPreview.blocks, ...guardrailPreview.filmTypeBlocks, ...guardrailPreview.warnings].map((item, index) => (
                  <div key={`${item.rule}-${index}`} style={{ fontSize: '0.82rem', marginTop: '4px' }}>{item.message}</div>
                ))}
                {guardrailPreview.warnings.length > 0 && (
                  <label style={{ display: 'block', marginTop: '10px', fontWeight: '700', fontSize: '0.8rem' }}>
                    Reason for the warning *
                    <textarea className="form-control" rows={2} value={guardrailWarningReason} onChange={(event) => setGuardrailWarningReason(event.target.value)} />
                  </label>
                )}
                {guardrailPreview.filmTypeBlocks.length > 0 && (
                  <label style={{ display: 'block', marginTop: '10px', fontWeight: '700', fontSize: '0.8rem' }}>
                    Supervisor film-type reason {canOverrideFilmType(currentUser?.role) ? '*' : '(Admin, Plant Manager, or Production Manager)'}
                    <textarea className="form-control" rows={2} value={filmTypeOverrideReason} onChange={(event) => setFilmTypeOverrideReason(event.target.value)} disabled={!canOverrideFilmType(currentUser?.role)} />
                  </label>
                )}
              </div>
            )}

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
                <SearchableSelect className="form-control" value={disposeCategory} onChange={e => setDisposeCategory(e.target.value)}>
                  <option value="Printing Plain Setting (kg)">Printing Plain Setting (kg)</option>
                  <option value="Printing Wastage (kg)">Printing Wastage (kg)</option>
                  <option value="Lamination Plain Substrate (kg)">Lamination Plain Substrate (kg)</option>
                  <option value="Printed Wastage (kg)">Printed Wastage (kg)</option>
                  <option value="Laminate Wastage (kg)">Laminate Wastage (kg)</option>
                  <option value="Trim Wastage (kg)">Trim Wastage (kg)</option>
                </SearchableSelect>
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
