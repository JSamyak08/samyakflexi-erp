/**
 * Dashboard scrap calculations and metrics.
 * Computes plant-wide weighted scrap percentages, month-over-month (MoM) trends,
 * and robust fallbacks for zero-month gaps and stage-level wastage fields.
 */

export function extractRecordWastageKg(record) {
  if (!record || typeof record !== 'object') return 0;
  const direct = Number(
    record.totalWastageKg ??
    record.totalScrapQtyKg ??
    record.total_wastage_kg ??
    record.total_scrap_qty_kg ??
    0
  );
  if (direct > 0) return direct;

  const logs = record.processLogs || record.process_logs || {};
  const stageSum = (
    Number(record.printingPlainSettingWastageKg || record.printing_plain_setting_wastage_kg || logs.printingPlainSettingWastageKg || 0) +
    Number(record.printingWastageKg || record.printing_wastage_kg || logs.printingWastageKg || 0) +
    Number(record.excessFilmWastageKg || logs.excessFilmWastageKg || 0) +
    Number(record.laminationPlainSubstrateWastageKg || record.lamination_plain_substrate_wastage_kg || logs.laminationPlainSubstrateWastageKg || 0) +
    Number(record.laminationPlainSubstrateWastageL2Kg || record.lamination_plain_substrate_wastage_l2_kg || logs.laminationPlainSubstrateWastageL2Kg || 0) +
    Number(record.laminateWastageKg || record.laminate_wastage_kg || logs.laminateWastageKg || 0) +
    Number(record.printedWastageKg || record.printed_wastage_kg || logs.printedWastageKg || 0) +
    Number(record.trimWastageKg || record.trim_wastage_kg || logs.trimWastageKg || 0) +
    Number(record.slittingSettingWastageKg || logs.slittingSettingWastageKg || 0) +
    Number(record.pouchingScrapKg || record.pouching_scrap_kg || logs.pouchingScrapKg || 0)
  );

  return Math.round((stageSum + Number.EPSILON) * 100) / 100;
}

export function extractRecordGrossKg(record, wastageKg = 0) {
  if (!record || typeof record !== 'object') return wastageKg > 0 ? wastageKg : 0;
  const direct = Number(
    record.grossProductionKg ??
    record.totalProductionQtyKg ??
    record.gross_production_kg ??
    record.total_production_qty_kg ??
    0
  );
  if (direct > 0) return direct;

  const net = Number(
    record.netUsableKg ??
    record.qtyDispatch ??
    record.net_usable_kg ??
    record.qty_dispatch ??
    0
  );
  if (net > 0) return Math.round((net + (wastageKg || 0) + Number.EPSILON) * 100) / 100;

  return wastageKg > 0 ? wastageKg : 0;
}

export function parseRecordDate(record) {
  if (!record || typeof record !== 'object') return null;
  const dateStr = (
    record.recordedAt ||
    record.recorded_at ||
    record.dateFilled ||
    record.date_filled ||
    record.date ||
    record.timestamp ||
    record.created_at
  );
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export function computeWeightedScrapPct(recordList) {
  if (!Array.isArray(recordList) || recordList.length === 0) return null;

  let totalGross = 0;
  let totalScrap = 0;
  const explicitPcts = [];

  recordList.forEach((r) => {
    const wastage = extractRecordWastageKg(r);
    const gross = extractRecordGrossKg(r, wastage);
    totalScrap += wastage;
    totalGross += gross;

    const directPct = Number(
      r.overallScrapPctOfOutput ??
      r.wastagePercentage ??
      r.overall_scrap_pct_of_output ??
      r.wastage_percentage ??
      0
    );
    if (directPct > 0) {
      explicitPcts.push(directPct);
    } else if (gross > 0 && wastage > 0) {
      explicitPcts.push((wastage / gross) * 100);
    }
  });

  if (totalGross > 0) {
    return parseFloat(((totalScrap / totalGross) * 100).toFixed(2));
  }
  if (explicitPcts.length > 0) {
    const avg = explicitPcts.reduce((a, b) => a + b, 0) / explicitPcts.length;
    return parseFloat(avg.toFixed(2));
  }
  return 0;
}

export function calculateScrapMetrics(records = [], activeOrders = [], referenceDate = new Date()) {
  const safeRecords = Array.isArray(records) ? records.filter(Boolean) : [];

  if (safeRecords.length === 0) {
    const validOrderWastages = (Array.isArray(activeOrders) ? activeOrders : [])
      .map((o) => Number(o?.wastagePct ?? o?.wastagePercentage ?? 0))
      .filter((pct) => pct > 0);

    const plannedAvg = validOrderWastages.length > 0
      ? parseFloat((validOrderWastages.reduce((a, b) => a + b, 0) / validOrderWastages.length).toFixed(1))
      : 5.0;

    return {
      currentMonthAvg: 0,
      displayAvg: 0,
      formattedAvg: '0%',
      hasData: false,
      plannedAvg,
      momChange: 0,
      momDirection: 'neutral',
      subText: 'No production records logged yet'
    };
  }

  const now = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let prevYear = currentYear;
  let prevMonth = currentMonth - 1;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear = currentYear - 1;
  }

  const curMonthRecords = [];
  const prevMonthRecords = [];

  safeRecords.forEach((r) => {
    const date = parseRecordDate(r);
    if (!date) return;

    const y = date.getFullYear();
    const m = date.getMonth();

    if (y === currentYear && m === currentMonth) {
      curMonthRecords.push(r);
    } else if (y === prevYear && m === prevMonth) {
      prevMonthRecords.push(r);
    }
  });

  const currentMonthAvg = computeWeightedScrapPct(curMonthRecords);
  const prevMonthAvg = computeWeightedScrapPct(prevMonthRecords);
  const allTimeAvg = computeWeightedScrapPct(safeRecords);

  // Case 1: Active runs logged in the current calendar month
  if (currentMonthAvg !== null && curMonthRecords.length > 0) {
    if (prevMonthAvg !== null && prevMonthRecords.length > 0) {
      const momChange = parseFloat(Math.abs(currentMonthAvg - prevMonthAvg).toFixed(2));
      const momDirection = currentMonthAvg > prevMonthAvg ? 'up' : (currentMonthAvg < prevMonthAvg ? 'down' : 'neutral');
      return {
        currentMonthAvg,
        displayAvg: currentMonthAvg,
        formattedAvg: `${currentMonthAvg}%`,
        hasData: true,
        momChange,
        momDirection,
        subText: momDirection === 'up'
          ? `▲ +${momChange}% MoM (Increase)`
          : momDirection === 'down'
            ? `▼ -${momChange}% MoM (Decrease)`
            : '• 0.0% MoM (No Change)'
      };
    }

    return {
      currentMonthAvg,
      displayAvg: currentMonthAvg,
      formattedAvg: `${currentMonthAvg}%`,
      hasData: true,
      momChange: 0,
      momDirection: 'neutral',
      subText: `Current month (${curMonthRecords.length} ${curMonthRecords.length === 1 ? 'job' : 'jobs'})`
    };
  }

  // Case 2: No runs in current calendar month yet, but historical records exist
  if (allTimeAvg !== null && safeRecords.length > 0) {
    return {
      currentMonthAvg: allTimeAvg,
      displayAvg: allTimeAvg,
      formattedAvg: `${allTimeAvg}%`,
      hasData: true,
      isAllTimeFallback: true,
      momChange: 0,
      momDirection: 'neutral',
      subText: `Plant all-time avg (${safeRecords.length} ${safeRecords.length === 1 ? 'job' : 'jobs'} logged)`
    };
  }

  return {
    currentMonthAvg: 0,
    displayAvg: 0,
    formattedAvg: '0%',
    hasData: false,
    momChange: 0,
    momDirection: 'neutral',
    subText: 'No production records logged yet'
  };
}
