import React from 'react';
import { 
  ArrowRight, 
  Layers, 
  Scissors, 
  Package, 
  Printer, 
  AlertTriangle, 
  CheckCircle2, 
  Barcode, 
  Zap, 
  TrendingDown, 
  Scale, 
  Maximize2 
} from 'lucide-react';
import { calculateRollMeters, calculateStageWastage } from '../utils/inkStationCalculations';
import { NOT_RECORDED, displayQuantity, finiteNumber } from '../utils/productionRecordQuality';

function formatKg(val) {
  const num = finiteNumber(val);
  return num === null ? NOT_RECORDED : `${num.toFixed(2)} kg`;
}

function formatMeters(val) {
  const num = finiteNumber(val);
  return num === null || num <= 0 ? '—' : `${Math.round(num).toLocaleString()} m`;
}

export default function RollToRollVisualFlow({ record = {}, jobMaster = {} }) {
  const printWidthMm = finiteNumber(record.printWidthMm ?? jobMaster.printWidthMm) || 1000;
  const filmGsm = finiteNumber(record.printLayerGsm ?? jobMaster.printLayerGsm) || 16.8; // default 12u PET
  const laminateGsm = finiteNumber(record.totalLaminateGsm ?? jobMaster.totalLaminateGsm) || 45.0;

  // 1. STAGE: Printing
  const printInputRolls = (record.inputRollsList || []).map((r, idx) => {
    const kg = finiteNumber(r.consumedWeightKg ?? r.weightKg ?? r.netWeightKg) || 0;
    const width = finiteNumber(r.widthMm) || printWidthMm;
    const micron = finiteNumber(r.micron) || 12;
    const meters = calculateRollMeters({
      weightKg: kg,
      widthMm: width,
      gsm: r.gsm || (micron * 1.4),
      existingMeters: r.lengthMeters || r.meters
    });
    return {
      barcode: r.barcodeId || r.barcode || `IN-ROLL-${idx + 1}`,
      filmType: r.filmType || record.printFilmType || 'Base Film',
      micron,
      widthMm: width,
      kg,
      meters
    };
  });

  const printInputKg = printInputRolls.reduce((sum, r) => sum + r.kg, 0);
  const printInputMeters = printInputRolls.reduce((sum, r) => sum + r.meters, 0);

  const printOutputKg = finiteNumber(record.printedOutputKg) || 0;
  const printOutputMeters = finiteNumber(record.actualMetersPrinted) || calculateRollMeters({
    weightKg: printOutputKg,
    widthMm: printWidthMm,
    gsm: filmGsm,
    existingMeters: record.actualMetersPrinted
  });

  const printWastageKg = Math.max(0, finiteNumber(record.printingWastageKg ?? record.printingPlainSettingWastageKg) || (printInputKg > printOutputKg ? printInputKg - printOutputKg : 0));
  const printWastageMeters = printInputMeters > printOutputMeters ? printInputMeters - printOutputMeters : calculateRollMeters({
    weightKg: printWastageKg,
    widthMm: printWidthMm,
    gsm: filmGsm
  });

  // Extract SFG Consumptions by stage
  const sfgConsumptions = Array.isArray(record.sfgConsumptions) ? record.sfgConsumptions : [];

  const laminationLogs = sfgConsumptions.filter(c => {
    const target = String(c?.targetProcess || '').toLowerCase();
    return target.includes('lam') && !target.includes('pass 2') && !target.includes('second');
  });

  const lamination2Logs = sfgConsumptions.filter(c => {
    const target = String(c?.targetProcess || '').toLowerCase();
    return target.includes('pass 2') || target.includes('second');
  });

  const slittingLogs = sfgConsumptions.filter(c => {
    const target = String(c?.targetProcess || '').toLowerCase();
    return target.includes('slit');
  });

  const dispatchLogs = sfgConsumptions.filter(c => {
    const target = String(c?.targetProcess || '').toLowerCase();
    return target.includes('dispatch') || target.includes('pack');
  });

  // Helper for Lamination Stage Data
  function parseLaminationStage(logs, label, passNum = 1) {
    if (logs.length === 0) return null;
    let inputKg = 0;
    let addedSubstrateKg = 0;
    let outputKg = 0;

    const inputRolls = [];
    const outputRolls = [];

    logs.forEach((log) => {
      const parentKg = finiteNumber(log.consumedKg) || 0;
      inputKg += parentKg;
      inputRolls.push({
        barcode: log.sfgBatchCode || `SFG-PARENT-P${passNum}`,
        desc: `Printed / SFG Reel (Pass ${passNum})`,
        kg: parentKg,
        meters: calculateRollMeters({ weightKg: parentKg, widthMm: printWidthMm, gsm: passNum === 1 ? filmGsm : laminateGsm })
      });

      // Added substrates
      const subs = Array.isArray(log.substrate2Rolls) && log.substrate2Rolls.length > 0 ? log.substrate2Rolls : (log.substrate2 ? [log.substrate2] : []);
      subs.forEach(s => {
        const sKg = finiteNumber(s.consumedKg) || 0;
        addedSubstrateKg += sKg;
        inputRolls.push({
          barcode: s.barcode || s.barcodeId || `SUB-${s.filmType || 'FILM'}`,
          desc: `Secondary Substrate: ${s.filmType || 'Film'}`,
          kg: sKg,
          meters: calculateRollMeters({ weightKg: sKg, widthMm: printWidthMm, gsm: s.micron ? s.micron * 0.93 : 25 })
        });
      });

      // Output rolls
      const outs = Array.isArray(log.outputRolls) && log.outputRolls.length > 0 ? log.outputRolls : (log.outputRoll ? [log.outputRoll] : []);
      outs.forEach((r, idx) => {
        const oKg = finiteNumber(r.netWeightKg ?? r.weightKg) || 0;
        outputKg += oKg;
        outputRolls.push({
          barcode: r.barcode || r.barcodeId || `LAM-R${idx + 1}`,
          desc: `Laminated Reel (Pass ${passNum})`,
          kg: oKg,
          meters: r.lengthMeters ? r.lengthMeters : calculateRollMeters({ weightKg: oKg, widthMm: printWidthMm, gsm: laminateGsm })
        });
      });
    });

    const totalInputKg = inputKg + addedSubstrateKg;
    const inputMeters = inputRolls.reduce((sum, r) => sum + r.meters, 0);
    const outputMeters = outputRolls.reduce((sum, r) => sum + r.meters, 0);

    // In lamination, output is typically input + adhesive gain. If output is less than input, trim/waste occurred
    const wasteKg = totalInputKg > outputKg ? Math.max(0, totalInputKg - outputKg) : 0;
    const gainKg = outputKg > totalInputKg ? outputKg - totalInputKg : 0;
    const wasteMeters = wasteKg > 0 ? calculateRollMeters({ weightKg: wasteKg, widthMm: printWidthMm, gsm: laminateGsm }) : 0;

    return {
      label,
      inputRolls,
      outputRolls,
      inputKg: totalInputKg,
      addedSubstrateKg,
      outputKg,
      gainKg,
      wasteKg,
      inputMeters,
      outputMeters,
      wasteMeters
    };
  }

  const lam1Data = parseLaminationStage(laminationLogs, 'Solventless Lamination (Pass 1)', 1);
  const lam2Data = parseLaminationStage(lamination2Logs, 'Solventless Lamination (Pass 2)', 2);

  // Helper for Slitting Stage Data
  function parseSlittingStage(logs) {
    if (logs.length === 0) return null;
    let inputKg = 0;
    let outputKg = 0;
    const inputRolls = [];
    const outputRolls = [];

    logs.forEach((log) => {
      const pKg = finiteNumber(log.consumedKg) || 0;
      inputKg += pKg;
      inputRolls.push({
        barcode: log.sfgBatchCode || 'LAM-MASTER-ROLL',
        desc: 'Laminated Master Reel',
        kg: pKg,
        meters: calculateRollMeters({ weightKg: pKg, widthMm: printWidthMm, gsm: laminateGsm })
      });

      const outs = Array.isArray(log.outputRolls) && log.outputRolls.length > 0 ? log.outputRolls : (log.outputRoll ? [log.outputRoll] : []);
      outs.forEach((r, idx) => {
        const oKg = finiteNumber(r.netWeightKg ?? r.weightKg) || 0;
        outputKg += oKg;
        outputRolls.push({
          barcode: r.barcode || r.barcodeId || `FG-SLIT-${idx + 1}`,
          desc: `Slit Finished Roll #${r.rollNo || (idx + 1)}`,
          kg: oKg,
          meters: r.lengthMeters ? r.lengthMeters : calculateRollMeters({ weightKg: oKg, widthMm: r.widthMm || printWidthMm, gsm: laminateGsm })
        });
      });
    });

    const wasteKg = Math.max(0, Math.round((inputKg - outputKg + Number.EPSILON) * 100) / 100);
    const inMeters = inputRolls.reduce((sum, r) => sum + r.meters, 0);
    const outMeters = outputRolls.reduce((sum, r) => sum + r.meters, 0);
    const wasteMeters = wasteKg > 0 ? calculateRollMeters({ weightKg: wasteKg, widthMm: printWidthMm, gsm: laminateGsm }) : 0;

    return {
      label: 'Slitting & Rewinding',
      inputRolls,
      outputRolls,
      inputKg,
      outputKg,
      wasteKg,
      inMeters,
      outMeters,
      wasteMeters
    };
  }

  const slitData = parseSlittingStage(slittingLogs);

  // Helper for Dispatch Stage Data
  function parseDispatchStage(logs) {
    if (logs.length === 0) return null;
    let inputKg = 0;
    const inputRolls = [];

    logs.forEach((log) => {
      const pKg = finiteNumber(log.consumedKg) || 0;
      inputKg += pKg;
      inputRolls.push({
        barcode: log.sfgBatchCode || 'FG-DISPATCH-ROLL',
        desc: 'Finished Goods Box / Roll',
        kg: pKg,
        meters: calculateRollMeters({ weightKg: pKg, widthMm: printWidthMm, gsm: laminateGsm })
      });
    });

    return {
      label: 'Dispatch Packing',
      inputRolls,
      inputKg,
      outputKg: inputKg,
      wasteKg: 0,
      wasteMeters: 0,
      inMeters: inputRolls.reduce((sum, r) => sum + r.meters, 0),
      outMeters: inputRolls.reduce((sum, r) => sum + r.meters, 0)
    };
  }

  const dispatchData = parseDispatchStage(dispatchLogs);

  // Cumulative Totals
  const totalSubstratesKg = (lam1Data?.addedSubstrateKg || 0) + (lam2Data?.addedSubstrateKg || 0);
  const totalProcessWasteKg = (printWastageKg || 0) + (lam1Data?.wasteKg || 0) + (lam2Data?.wasteKg || 0) + (slitData?.wasteKg || 0);
  const totalProcessWasteMeters = (printWastageMeters || 0) + (lam1Data?.wasteMeters || 0) + (lam2Data?.wasteMeters || 0) + (slitData?.wasteMeters || 0);
  const finalFgKg = slitData ? slitData.outputKg : (dispatchData ? dispatchData.outputKg : printOutputKg);

  return (
    <div style={{ margin: '24px 0', padding: '24px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={22} style={{ color: '#0284c7' }} /> Roll-to-Roll Process Flow & Wastage Tracking
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            Complete traceability from raw inward film rolls through printing, lamination, and slitting (Quantities in Kgs & Meters).
          </p>
        </div>

        {/* Global Summary Badges */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ background: '#ffffff', padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800' }}>TOTAL FG OUTPUT</div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0284c7' }}>{finalFgKg.toFixed(1)} kg</div>
          </div>
          <div style={{ background: '#fff1f2', padding: '6px 14px', borderRadius: '8px', border: '1px solid #fecdd3', textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', color: '#9f1239', fontWeight: '800' }}>CUMULATIVE WASTAGE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#e11d48' }}>
              {totalProcessWasteKg.toFixed(1)} kg • {Math.round(totalProcessWasteMeters).toLocaleString()} m
            </div>
          </div>
        </div>
      </div>

      {/* Visual Flow Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* STAGE 1: PRINTING */}
        <StageFlowCard
          stageNum="1"
          stageName="Rotogravure Printing Press"
          icon={<Printer size={20} />}
          badgeColor="#0284c7"
          inputTitle="Raw Film Inward Rolls"
          inputRolls={printInputRolls.length > 0 ? printInputRolls : [{ barcode: 'Scan Pending', desc: record.printFilmType || 'Film Substrate', kg: printInputKg || 0, meters: printInputMeters || 0 }]}
          inputSubtotal={{ kg: printInputKg, meters: printInputMeters }}
          outputTitle="Printed SFG Reel / Lot"
          outputRolls={[{
            barcode: record.printedRollBarcode || `SFG-LOT-${record.orderId || 'PRINT'}`,
            desc: `Printed Substrate (${record.printFilmType || 'PET'} ${record.micron || 12}µ)`,
            kg: printOutputKg,
            meters: printOutputMeters
          }]}
          outputSubtotal={{ kg: printOutputKg, meters: printOutputMeters }}
          wastage={{
            label: 'Printing Plain-Setting & Edge Trim',
            kg: printWastageKg,
            meters: printWastageMeters
          }}
        />

        {/* STAGE 2: LAMINATION PASS 1 */}
        {lam1Data && (
          <StageFlowCard
            stageNum="2"
            stageName={lam1Data.label}
            icon={<Layers size={20} />}
            badgeColor="#7c3aed"
            inputTitle="Consumed SFG & Secondary Substrates"
            inputRolls={lam1Data.inputRolls}
            inputSubtotal={{ kg: lam1Data.inputKg, meters: lam1Data.inputMeters }}
            outputTitle="Laminated Master Reels (Pass 1)"
            outputRolls={lam1Data.outputRolls}
            outputSubtotal={{ kg: lam1Data.outputKg, meters: lam1Data.outputMeters }}
            gainKg={lam1Data.gainKg}
            wastage={{
              label: 'Lamination Start-up Scrap & Edge Trim',
              kg: lam1Data.wasteKg,
              meters: lam1Data.wasteMeters
            }}
          />
        )}

        {/* STAGE 3: LAMINATION PASS 2 (IF ANY) */}
        {lam2Data && (
          <StageFlowCard
            stageNum="3"
            stageName={lam2Data.label}
            icon={<Layers size={20} />}
            badgeColor="#9333ea"
            inputTitle="Pass 1 Laminated Reel + Tertiary Film"
            inputRolls={lam2Data.inputRolls}
            inputSubtotal={{ kg: lam2Data.inputKg, meters: lam2Data.inputMeters }}
            outputTitle="3-Ply Laminated Master Reels"
            outputRolls={lam2Data.outputRolls}
            outputSubtotal={{ kg: lam2Data.outputKg, meters: lam2Data.outputMeters }}
            gainKg={lam2Data.gainKg}
            wastage={{
              label: 'Pass 2 Trim & Splice Scrap',
              kg: lam2Data.wasteKg,
              meters: lam2Data.wasteMeters
            }}
          />
        )}

        {/* STAGE 4: SLITTING & REWINDING */}
        {slitData && (
          <StageFlowCard
            stageNum={lam2Data ? "4" : "3"}
            stageName="Slitting & Rewinding"
            icon={<Scissors size={20} />}
            badgeColor="#059669"
            inputTitle="Laminated Master Reels"
            inputRolls={slitData.inputRolls}
            inputSubtotal={{ kg: slitData.inputKg, meters: slitData.inMeters }}
            outputTitle="Slit Finished Goods Reels (FG)"
            outputRolls={slitData.outputRolls}
            outputSubtotal={{ kg: slitData.outputKg, meters: slitData.outMeters }}
            wastage={{
              label: 'Slitting Side Edge Trim & Roll Joint Scrap',
              kg: slitData.wasteKg,
              meters: slitData.wasteMeters
            }}
          />
        )}

        {/* STAGE 5: DISPATCH PACKING */}
        {dispatchData && (
          <StageFlowCard
            stageNum={lam2Data ? "5" : "4"}
            stageName="Dispatch Packing & Verification"
            icon={<Package size={20} />}
            badgeColor="#0284c7"
            inputTitle="Verified Finished Goods Reels"
            inputRolls={dispatchData.inputRolls}
            inputSubtotal={{ kg: dispatchData.inputKg, meters: dispatchData.inMeters }}
            outputTitle="Packed Pallets & Cartons Ready for Dispatch"
            outputRolls={dispatchData.inputRolls.map((r, i) => ({ ...r, desc: `Packed Pallet Unit #${i + 1}` }))}
            outputSubtotal={{ kg: dispatchData.outputKg, meters: dispatchData.outMeters }}
            wastage={{
              label: 'Packing Loss (Damage/Rejection)',
              kg: 0,
              meters: 0
            }}
          />
        )}

      </div>
    </div>
  );
}

function StageFlowCard({
  stageNum,
  stageName,
  icon,
  badgeColor = '#0284c7',
  inputTitle,
  inputRolls = [],
  inputSubtotal = {},
  outputTitle,
  outputRolls = [],
  outputSubtotal = {},
  gainKg = 0,
  wastage = {}
}) {
  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1.5px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      {/* Stage Header */}
      <div style={{ background: '#f8fafc', padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: badgeColor, color: '#ffffff', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
            {stageNum}
          </span>
          <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {icon} {stageName}
          </span>
        </div>

        {/* Wastage Pill in Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {gainKg > 0 && (
            <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.75rem', fontWeight: '800', padding: '3px 10px', borderRadius: '20px' }}>
              + Adhesive Gain: {gainKg.toFixed(2)} kg
            </span>
          )}
          <span style={{ background: (wastage.kg || 0) > 0 ? '#fff1f2' : '#f1f5f9', color: (wastage.kg || 0) > 0 ? '#be123c' : '#64748b', border: `1px solid ${(wastage.kg || 0) > 0 ? '#fecdd3' : '#cbd5e1'}`, fontSize: '0.75rem', fontWeight: '800', padding: '3px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingDown size={14} /> Process Wastage: {formatKg(wastage.kg)} • {formatMeters(wastage.meters)}
          </span>
        </div>
      </div>

      {/* Rolls Grid: Input -> Output */}
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'start' }}>
        
        {/* INPUT ROLLS BOX */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
              INPUT: {inputTitle}
            </span>
            <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#0f172a' }}>
              {formatKg(inputSubtotal.kg)} • {formatMeters(inputSubtotal.meters)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inputRolls.map((r, i) => (
              <div key={i} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Barcode size={13} /> {r.barcode}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.desc || r.filmType || 'Roll'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0f172a' }}>{formatKg(r.kg)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: '700' }}>{formatMeters(r.meters)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OUTPUT ROLLS BOX */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>
              OUTPUT: {outputTitle}
            </span>
            <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#15803d' }}>
              {formatKg(outputSubtotal.kg)} • {formatMeters(outputSubtotal.meters)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {outputRolls.map((r, i) => (
              <div key={i} style={{ background: '#ffffff', border: '1px solid #86efac', borderRadius: '6px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#15803d', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Barcode size={13} /> {r.barcode}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#475569' }}>{r.desc || 'Output Roll'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0f172a' }}>{formatKg(r.kg)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: '700' }}>{formatMeters(r.meters)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
