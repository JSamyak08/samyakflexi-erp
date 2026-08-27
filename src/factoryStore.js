// FactoryOS Data Store & Flexible Packaging Calculation Engine
// Samyak International Ltd, Indore

export const COMPANY_DETAILS = {
  name: "SAMYAK INTERNATIONAL LTD.",
  tagline: "BSE: SAMYAKINT • CIN: L67120MH1994PLC225907",
  gstin: "23AABCM3526F1ZY",
  address: "11-B, Kheda Industrial Area, Pithampur Sector - III, Dist. Dhar, Dhar (Madhya Pradesh- 23), India - 454775",
  contactPerson: "Samyak Jain",
  phones: "8889133133",
  email: "info@samyakinternational.in",
  placeOfSupply: "Dhar, Madhya Pradesh (23)",
  logoUrl: "/samyak-logo.svg"
};



export const FILM_DENSITIES = {
  "PET": 1.40,
  "METPET": 1.40,
  "Natural LD GP Film": 0.93,
  "Milky LD GP Film": 0.93,
  "Natural LD Metallocene Film": 0.935,
  "Milky LD Metallocene Film": 0.935,
  "Milky Atta (High Dart) Film": 0.94,
  "LDPE": 0.93,
  "Natural GP LD": 0.93,
  "White LD": 0.93,
  "BOPP Natural": 0.91,
  "Matte Finish BOPP": 0.91,
  "Metalised BOPP": 0.91,
  "Pearlised BOPP": 0.70,
  "CPP Natural": 0.91,
  "Metalised CPP": 0.91,
  "Paper": 0.80,
  "Aluminium Foil": 2.70
};

export const DEFAULT_DAILY_RATES = {
  "PET": 125,
  "METPET": 140,
  "Natural LD GP Film": 115,
  "Milky LD GP Film": 120,
  "Natural LD Metallocene Film": 128,
  "Milky LD Metallocene Film": 132,
  "Milky Atta (High Dart) Film": 138,
  "LDPE": 115,
  "Natural GP LD": 115,
  "White LD": 120,
  "BOPP Natural": 130,
  "Matte Finish BOPP": 140,
  "Metalised BOPP": 145,
  "Pearlised BOPP": 160,
  "CPP Natural": 135,
  "Metalised CPP": 150
};

/**
 * Checks if a film grade is an LD Film that requires +5mm extra slit width.
 * Only the following 4 specific film types qualify for the +5mm rule:
 * - Natural LD GP Film
 * - Milky LD GP Film
 * - Natural LD Metallocene Film
 * - Milky LD Metallocene Film
 */
export const isLDFilm = (filmType = "") => {
  if (!filmType) return false;
  const LD_FILMS_WITH_EXTRA_WIDTH = [
    'natural ld gp film',
    'milky ld gp film',
    'natural ld metallocene film',
    'milky ld metallocene film',
    'milky atta (high dart) film'
  ];
  return LD_FILMS_WITH_EXTRA_WIDTH.includes(filmType.toLowerCase().trim());
};

/**
 * Calculates Slit Width (mm) for a layer: LD Films receive +5mm extra width over Print Width
 */
export const getFilmSlitWidth = (filmType, printWidthMm) => {
  const width = parseFloat(printWidthMm) || 1000;
  return isLDFilm(filmType) ? width + 5 : width;
};

export const DEFAULT_PROCESSING_RATES = {
  liquidInkPrice: 1500, // Rs. 1500/kg (incl. solvents, 20% weight gain)
  inkWeightGainPct: 20,
  adhesivePrice: 270,   // Rs. 270/kg (100% weight gain / solvent-less)
  adhesiveWeightGainPct: 100
};

/**
 * Calculates wastage percentage based on order quantity and process type
 */
export const getWastagePercentage = (orderQtyKg, isPouching = false) => {
  const qty = parseFloat(orderQtyKg) || 0;
  if (qty >= 2000) return 4.5;
  if (qty >= 1000) return 5.0;
  if (qty <= 500) {
    return isPouching ? 8.0 : 7.0;
  }
  // Interpolation for 501 to 999 kg
  return isPouching ? 7.5 : 6.0;
};

/**
 * Comprehensive Flexible Packaging Laminate Raw Material Cost & Quantity Calculator
 */
export const calculateJobRawMaterials = ({
  jobName = "",
  printWidthMm = 1000,
  repeatLengthMm = 400,
  orderQtyKg = 1000,
  orderType = "Reel", // "Reel" or "Pouching"
  inkGsm = 1.5,
  adhesiveGsm = 1.5,
  layers = [],
  filmPrices = {},
  inkPrice = 1500,
  adhesivePrice = 270
}) => {
  const isPouching = orderType === "Pouching";
  const wastagePct = getWastagePercentage(orderQtyKg, isPouching);

  // 1. Calculate GSM for each film layer
  const calculatedLayers = layers.map((layer) => {
    const density = FILM_DENSITIES[layer.filmType] || layer.density || 1.0;
    const micron = parseFloat(layer.micron) || 0;
    const gsm = micron * density; // g/m²
    const pricePerKg = (layer.rate !== undefined && layer.rate !== '' && layer.rate !== null && !isNaN(parseFloat(layer.rate)))
      ? parseFloat(layer.rate)
      : ((layer.ratePerKg !== undefined && layer.ratePerKg !== '' && layer.ratePerKg !== null && !isNaN(parseFloat(layer.ratePerKg)))
        ? parseFloat(layer.ratePerKg)
        : ((layer.pricePerKg !== undefined && layer.pricePerKg !== '' && layer.pricePerKg !== null && !isNaN(parseFloat(layer.pricePerKg)))
          ? parseFloat(layer.pricePerKg)
          : (parseFloat(filmPrices[layer.filmType]) || DEFAULT_DAILY_RATES[layer.filmType] || 130)));

    return {
      ...layer,
      density,
      gsm,
      pricePerKg
    };
  });

  const totalFilmsGsm = calculatedLayers.reduce((sum, l) => sum + l.gsm, 0);
  const totalLaminateGsm = totalFilmsGsm + (parseFloat(inkGsm) || 0) + (parseFloat(adhesiveGsm) || 0);

  // 2. Calculate Total Laminate Surface Area in square meters (m²)
  const totalAreaSqm = totalLaminateGsm > 0 ? (orderQtyKg * 1000) / totalLaminateGsm : 0;

  // 3. Calculate exact Raw Material Quantities required for each layer
  let totalFilmNetKg = 0;
  let totalFilmGrossKg = 0;
  let totalFilmCost = 0;

  const layerResults = calculatedLayers.map(l => {
    const netKg = (totalAreaSqm * l.gsm) / 1000;
    const grossKg = netKg * (1 + wastagePct / 100);
    const totalCost = grossKg * l.pricePerKg;

    totalFilmNetKg += netKg;
    totalFilmGrossKg += grossKg;
    totalFilmCost += totalCost;

    const layerIsLD = isLDFilm(l.filmType);
    const layerWidthMm = getFilmSlitWidth(l.filmType, printWidthMm);

    return {
      ...l,
      isLDFilm: layerIsLD,
      widthMm: layerWidthMm,
      netKg: parseFloat(netKg.toFixed(2)),
      grossKg: parseFloat(grossKg.toFixed(2)),
      totalCost: Math.round(totalCost)
    };
  });

  // 4. Calculate Ink & Adhesive Quantities & Costs
  // Liquid Ink assumes 20% weight gain (solvents included in 1500/kg cost)
  const dryInkNetKg = (totalAreaSqm * (parseFloat(inkGsm) || 0)) / 1000;
  const liquidInkGrossKg = dryInkNetKg * 1.20 * (1 + wastagePct / 100); 
  const totalInkCost = Math.round(liquidInkGrossKg * (parseFloat(inkPrice) || 1500));

  // Solventless Adhesive assumes 100% weight gain (no volatile solvents lost)
  const adhesiveNetKg = (totalAreaSqm * (parseFloat(adhesiveGsm) || 0)) / 1000;
  const adhesiveGrossKg = adhesiveNetKg * (1 + wastagePct / 100);
  const totalAdhesiveCost = Math.round(adhesiveGrossKg * (parseFloat(adhesivePrice) || 270));

  const totalRawMaterialCost = Math.round(totalFilmCost + totalInkCost + totalAdhesiveCost);
  const costPerKg = orderQtyKg > 0 ? (totalRawMaterialCost / orderQtyKg).toFixed(2) : 0;

  return {
    jobName,
    printWidthMm,
    repeatLengthMm,
    orderQtyKg,
    orderType,
    wastagePct,
    totalLaminateGsm: parseFloat(totalLaminateGsm.toFixed(2)),
    totalAreaSqm: Math.round(totalAreaSqm),
    layerResults,
    inkDetails: {
      gsm: inkGsm,
      netKg: parseFloat(dryInkNetKg.toFixed(2)),
      grossKg: parseFloat(liquidInkGrossKg.toFixed(2)),
      pricePerKg: inkPrice,
      totalCost: totalInkCost
    },
    adhesiveDetails: {
      gsm: adhesiveGsm,
      netKg: parseFloat(adhesiveNetKg.toFixed(2)),
      grossKg: parseFloat(adhesiveGrossKg.toFixed(2)),
      pricePerKg: adhesivePrice,
      totalCost: totalAdhesiveCost
    },
    summary: {
      totalFilmNetKg: parseFloat(totalFilmNetKg.toFixed(2)),
      totalFilmGrossKg: parseFloat(totalFilmGrossKg.toFixed(2)),
      totalRawMaterialCost,
      costPerKg
    }
  };
};

/**
 * Seed Users & Role-Based Access Control (RBAC)
 */
export const initialUsers = [
  {
    id: "USR-000",
    name: "Samyak Jain",
    email: "samyak.jain@samyakinternational.in",
    password: "Sam@233994",
    role: "Admin",
    department: "Executive Management",
    status: "Active"
  },
  {
    id: "USR-001",
    name: "Samyak Shah",
    email: "samyak@samyak.com",
    password: "password123",
    role: "Admin", // Admin, Plant Manager, Store Manager, QC Chemist, Purchase Manager, Shop Floor Operator
    department: "Executive Management",
    status: "Active"
  },
  {
    id: "USR-002",
    name: "Rajiv Malhotra",
    email: "rajiv.m@samyak.com",
    password: "password123",
    role: "Plant Manager",
    department: "Operations & Plant",
    status: "Active"
  },
  {
    id: "USR-003",
    name: "Dilip Joshi",
    email: "dilip.j@samyak.com",
    password: "password123",
    role: "Store Manager",
    department: "Store & Raw Material",
    status: "Active"
  },
  {
    id: "USR-004",
    name: "Ramesh Kumar",
    email: "ramesh.k@samyak.com",
    password: "password123",
    role: "QC Chemist",
    department: "Quality Control Lab",
    status: "Active"
  },
  {
    id: "USR-005",
    name: "Sunil Verma",
    email: "sunil.v@samyak.com",
    password: "password123",
    role: "Purchase Manager",
    department: "Purchase & Commercial",
    status: "Active"
  },
  {
    id: "USR-006",
    name: "Mahesh Yadav",
    email: "mahesh.y@samyak.com",
    password: "password123",
    role: "Shop Floor Operator",
    department: "Lamination & Printing",
    status: "Active"
  },
  {
    id: "USR-007",
    name: "Vikram Singh",
    email: "vikram.s@samyak.com",
    password: "password123",
    role: "Production Manager",
    department: "Operations & Plant",
    status: "Active"
  },
  {
    id: "USR-008",
    name: "Anil Sharma",
    email: "anil.s@samyak.com",
    password: "password123",
    role: "Sales Manager",
    department: "Sales & Commercial",
    status: "Active"
  },
  {
    id: "USR-009",
    name: "Mohit Namdev",
    email: "mohit.namdev@samyakinternational.in",
    password: "SIL#31Mohit",
    role: "Production Manager",
    department: "Operations & Plant",
    status: "Active"
  }
];

/**
 * Seed Shop Floor Actual Job Data Sheets
 */
// PRODUCTION: No seed job datasheets.
export const initialJobDataSheets = [];

/**
 * Pre-Costing vs Post-Costing Variance & Profitability Calculator
 */
export const calculatePreVsPostCosting = (preCosting = {}, actualData = {}) => {
  const sellingPricePerKg = parseFloat(actualData.sellingPricePerKg) || 240;
  const orderQtyKg = parseFloat(preCosting.orderQtyKg) || 1000;

  // Estimated Raw Material Cost (Pre-Costing)
  const estTotalCost = preCosting.summary?.totalRawMaterialCost || 180000;
  const estCostPerKg = parseFloat(preCosting.summary?.costPerKg) || (estTotalCost / orderQtyKg);

  // Actual Consumed Quantities (Post-Costing)
  let actualFilmCost = 0;
  let actualFilmGrossKg = 0;

  if (preCosting.layerResults && actualData.actualFilmConsumedKg) {
    preCosting.layerResults.forEach((layer, idx) => {
      const key = `Layer ${idx + 1} (${layer.filmType} ${layer.micron}µ)`;
      const actualKg = parseFloat(actualData.actualFilmConsumedKg[key]) || layer.grossKg || 0;
      actualFilmGrossKg += actualKg;
      actualFilmCost += actualKg * layer.pricePerKg;
    });
  } else {
    actualFilmGrossKg = preCosting.summary?.totalFilmGrossKg || 0;
    actualFilmCost = actualFilmGrossKg * 130;
  }

  const actualInkKg = parseFloat(actualData.actualInkConsumedKg) || preCosting.inkDetails?.grossKg || 0;
  const actualInkPrice = preCosting.inkDetails?.pricePerKg || 1500;
  const actualInkCost = actualInkKg * actualInkPrice;

  const actualSolventKg = parseFloat(actualData.actualSolventsConsumedKg) || 0;
  const actualSolventCost = actualSolventKg * 110; // Solvents ~ ₹110/kg

  const actualAdhesiveKg = parseFloat(actualData.actualAdhesiveConsumedKg) || preCosting.adhesiveDetails?.grossKg || 0;
  const actualAdhesivePrice = preCosting.adhesiveDetails?.pricePerKg || 270;
  const actualAdhesiveCost = actualAdhesiveKg * actualAdhesivePrice;

  const actualTotalCost = Math.round(actualFilmCost + actualInkCost + actualSolventCost + actualAdhesiveCost);
  const actualCostPerKg = orderQtyKg > 0 ? (actualTotalCost / orderQtyKg).toFixed(2) : 0;

  // Variances
  const costVariance = actualTotalCost - estTotalCost; // Positive = Over budget
  const costVariancePct = estTotalCost > 0 ? ((costVariance / estTotalCost) * 100).toFixed(1) : 0;

  // Profitability
  const totalGrossRevenue = Math.round(orderQtyKg * sellingPricePerKg);
  const estGrossProfit = Math.round(totalGrossRevenue - estTotalCost);
  const estProfitMarginPct = totalGrossRevenue > 0 ? ((estGrossProfit / totalGrossRevenue) * 100).toFixed(1) : 0;

  const actualGrossProfit = Math.round(totalGrossRevenue - actualTotalCost);
  const actualProfitMarginPct = totalGrossRevenue > 0 ? ((actualGrossProfit / totalGrossRevenue) * 100).toFixed(1) : 0;

  return {
    orderQtyKg,
    sellingPricePerKg,
    totalGrossRevenue,
    preCosting: {
      totalCost: estTotalCost,
      costPerKg: estCostPerKg,
      grossProfit: estGrossProfit,
      marginPct: estProfitMarginPct
    },
    postCosting: {
      actualFilmGrossKg: parseFloat(actualFilmGrossKg.toFixed(2)),
      actualInkKg: parseFloat(actualInkKg.toFixed(2)),
      actualSolventKg: parseFloat(actualSolventKg.toFixed(2)),
      actualAdhesiveKg: parseFloat(actualAdhesiveKg.toFixed(2)),
      totalCost: actualTotalCost,
      costPerKg: actualCostPerKg,
      grossProfit: actualGrossProfit,
      marginPct: actualProfitMarginPct
    },
    variance: {
      costVariance,
      costVariancePct,
      isOverBudget: costVariance > 0
    }
  };
};

/**
 * Seed Vendors Data
 */
// PRODUCTION: No seed vendors. All vendors come from Supabase.
export const initialVendors = [];

/**
 * PRODUCTION: No seed orders. All orders come from Supabase or are created via Job Punching.
 */
export const initialOrders = [];

/**
 * Seed Inventory Stock Data
 */
// PRODUCTION: No seed inventory. All stock comes from Supabase.
export const initialInventory = [];

/**
 * Seed GRN Data (Goods Receipt Notes)
 */
// PRODUCTION: No seed GRNs. All GRNs come from Supabase.
export const initialGRNs = [];

/**
 * PRODUCTION: No seed production records. All records are entered by Plant Manager via the UI.
 */
export const initialProductionRecords = [];


/**
 * Seed Stock Ledger Physical Reconciliation Adjustments
 */
export const initialStockAdjustments = [];

/**
 * Helper to check if current date is within the last 2 days of the current month
 */
export const isReconciliationDue = (currentDateString = new Date().toISOString().split('T')[0]) => {
  const date = new Date(currentDateString);
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = date.getDate();
  return (lastDayOfMonth - currentDay) <= 1; // True on last 2 days
};

/**
 * Robust date parser supporting YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, and Date objects
 */
export const parseStandardDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  
  const str = String(dateStr).trim();
  if (!str) return null;

  // Format: YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str)) {
    const [y, m, d] = str.split(/[-/]/);
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  // Format: DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(str)) {
    const [d, m, y] = str.split(/[-/]/);
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Helper to compute order delivery urgency status:
 * - Overdue: target delivery date is in the past
 * - Nearing Deadline: target delivery date is within 4 days (0 to 4 days remaining)
 * - On Track: target delivery date is > 4 days in future
 */
export const getOrderStatusInfo = (order) => {
  if (!order) {
    return { isOverdue: false, isNearingDeadline: false, daysRemaining: null, statusText: 'In Progress', badgeClass: 'badge-us' };
  }

  if (order.status === 'Completed') {
    return { isOverdue: false, isNearingDeadline: false, daysRemaining: null, statusText: 'Completed', badgeClass: 'badge-success' };
  }
  if (order.status === 'On Hold') {
    return { isOverdue: false, isNearingDeadline: false, daysRemaining: null, statusText: 'On Hold', badgeClass: 'badge-warning' };
  }

  const targetDateStr = order.targetDeliveryDate || order.deliveryDate;
  const targetDate = parseStandardDate(targetDateStr);

  if (!targetDate) {
    const isDelayed = order.status === 'Delayed';
    return {
      isOverdue: isDelayed,
      isNearingDeadline: false,
      daysRemaining: null,
      statusText: isDelayed ? 'Overdue' : (order.status || 'In Progress'),
      badgeClass: isDelayed ? 'badge-danger' : 'badge-us'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0 || order.status === 'Delayed') {
    return {
      isOverdue: true,
      isNearingDeadline: false,
      daysRemaining: diffDays,
      statusText: 'Overdue',
      badgeClass: 'badge-danger'
    };
  }

  if (diffDays >= 0 && diffDays <= 4) {
    return {
      isOverdue: false,
      isNearingDeadline: true,
      daysRemaining: diffDays,
      statusText: 'Nearing Deadline',
      badgeClass: 'badge-warning'
    };
  }

  return {
    isOverdue: false,
    isNearingDeadline: false,
    daysRemaining: diffDays,
    statusText: order.status || 'In Progress',
    badgeClass: 'badge-us'
  };
};

/**
 * Helper to check if an order is overdue past target delivery date
 */
export const isOrderOverdue = (order) => {
  return getOrderStatusInfo(order).isOverdue;
};

/**
 * Helper to check if an order is within 4 days of target delivery date
 */
export const isOrderNearingDeadline = (order) => {
  return getOrderStatusInfo(order).isNearingDeadline;
};

/**
 * Plant Weighing Scale Stations Metadata
 */
export const WEIGHING_STATIONS = [
  { id: 'SCALE_1_INWARD', name: 'Scale #1 - Inward Section', department: 'Raw Material Inward', defaultCategory: 'Raw Material' },
  { id: 'SCALE_2_PRINTING', name: 'Scale #2 - Printing Press Section', department: 'Rotogravure Printing', defaultCategory: 'SFG Printing' },
  { id: 'SCALE_3_LAMINATION', name: 'Scale #3 - Lamination & Slitting', department: 'Lamination & Slitting', defaultCategory: 'SFG Lamination' },
  { id: 'SCALE_4_DISPATCH', name: 'Scale #4 - Dispatch Section', department: 'Finished Goods Dispatch', defaultCategory: 'Finished Goods' }
];

/**
 * Material Categories (RM, Inks, Solvents, SFG, FG)
 */
export const RAW_MATERIAL_CATEGORIES = {
  FILMS: ["PET", "METPET", "Natural LD GP Film", "Milky LD GP Film", "Natural LD Metallocene Film", "Milky LD Metallocene Film", "Milky Atta (High Dart) Film", "LDPE", "Natural GP LD", "White LD", "BOPP Natural", "Matte Finish BOPP", "Metalised BOPP", "Pearlised BOPP", "CPP Natural", "Metalised CPP"],
  INKS: ["Reverse Ink - Process Cyan", "Reverse Ink - Process Magenta", "Reverse Ink - Process Yellow", "Reverse Ink - Process Black", "Reverse Ink - White High Opacity", "Surface Ink - Gloss White", "Surface Ink - Process Red"],
  SOLVENTS: ["Ethyl Acetate", "Toluene", "MIBK (Methyl Isobutyl Ketone)", "Ethyl Cellosolve", "Isopropanol (IPA)"],
  ADHESIVES: ["Solvent-less Adhesive Component A", "Solvent-less Adhesive Component B", "Solvent-based Adhesive"]
};

/**
 * Seed Barcoded Inventory Rolls & SFGs
 */
// PRODUCTION: No seed inventory rolls.
export const initialInventoryRolls = [];

/**
 * Seed Dispatch Shipments & Packing Lists
 */
// PRODUCTION: No seed dispatch shipments.
export const initialDispatchShipments = [];

/**
 * Generate Barcode ID string helper
 */
export const generateBarcodeId = (prefix = 'BC') => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const timeMs = String(today.getTime()).slice(-4);
  const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${timeMs}${randomHex}`;
};

export const generateInventoryId = (inventory = []) => {
  let maxNum = 0;
  (inventory || []).forEach(item => {
    const id = String(item?.id || item?.itemCode || '');
    const match = id.match(/(?:INVT|INV)[-_\s]*(\d+)/i) || id.match(/(\d+)/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum && num < 1000000) {
        maxNum = num;
      }
    }
  });
  const nextNum = maxNum + 1;
  return `INVT-${String(nextNum).padStart(4, '0')}`;
};

export const PACKAGING_MATERIAL_TYPES = [
  "Roll",
  "Drum",
  "Box",
  "Pcs",
  "Bag",
  "Can",
  "Pallet",
  "Carboy",
  "Carton",
  "Barrel",
  "Bucket",
  "Container"
];

export const generateVendorId = () => {
  return `VEND-2026-${Math.floor(1000 + Math.random() * 9000)}`;
};

/**
 * Initial Printing Machines Dataset
 */
// PRODUCTION: No seed machines. All machines come from Supabase.
export const initialMachines = [];

/**
 * Production Metrics & Time Accounting Engine for Printing Machines
 */
export const calculatePrintingScheduleMetrics = ({
  orderQtyKg = 1000,
  widthMm = 1000,
  micron = 12,
  filmType = "PET",
  maxSpeedMpm = 250,
  prevJobWidthMm = null,
  prevJobRepeatMm = null,
  repeatLengthMm = 400,
  customJobChangeoverMins = null,
  customRollChangeoverRateMins = null
}) => {
  const density = FILM_DENSITIES[filmType] || 1.40;
  const gsm = micron * density;
  const widthM = widthMm / 1000;

  // 1. Calculate Total Area in square meters (m²)
  const totalAreaSqm = gsm > 0 ? (orderQtyKg * 1000) / gsm : 0;

  // 2. Calculate Total Length in Running Meters
  const totalLengthMeters = widthM > 0 ? Math.round(totalAreaSqm / widthM) : 0;

  // 3. Net Running Time (minutes)
  const speed = Math.max(parseFloat(maxSpeedMpm) || 200, 10);
  const runTimeMins = Math.ceil(totalLengthMeters / speed);

  // 4. Roll Changeover Time (configurable rate, default 20 mins per 250kg roll)
  const rollCount = Math.max(1, Math.ceil(orderQtyKg / 250));
  const ratePerRoll = (customRollChangeoverRateMins !== null && customRollChangeoverRateMins !== undefined && customRollChangeoverRateMins !== '') 
    ? parseFloat(customRollChangeoverRateMins) 
    : 20;
  const rollChangeoverMins = Math.round(rollCount * ratePerRoll);

  // 5. Job Changeover Time (configurable or auto: 2h if different size, 1h if same)
  let isSameSize = false;
  if (prevJobWidthMm && Math.abs(parseFloat(prevJobWidthMm) - parseFloat(widthMm)) < 5) {
    if (!prevJobRepeatMm || Math.abs(parseFloat(prevJobRepeatMm) - parseFloat(repeatLengthMm)) < 5) {
      isSameSize = true;
    }
  }

  const defaultJobChangeover = isSameSize ? 60 : 120;
  const jobChangeoverMins = (customJobChangeoverMins !== null && customJobChangeoverMins !== undefined && customJobChangeoverMins !== '')
    ? parseFloat(customJobChangeoverMins)
    : defaultJobChangeover;

  const totalDurationMins = runTimeMins + rollChangeoverMins + jobChangeoverMins;

  return {
    density,
    gsm: parseFloat(gsm.toFixed(2)),
    totalAreaSqm: Math.round(totalAreaSqm),
    totalLengthMeters,
    runTimeMins,
    rollCount,
    ratePerRoll,
    rollChangeoverMins,
    isSameSize,
    jobChangeoverMins,
    totalDurationMins,
    totalDurationHours: (totalDurationMins / 60).toFixed(1)
  };
};

/**
 * Initial Production Schedules Dataset for Printing Machines
 */
// PRODUCTION: No seed production schedules.
export const initialProductionSchedules = [];

/**
 * Initial Clients Dataset
 */
// PRODUCTION: No seed clients. All clients come from Supabase.
export const initialClients = [];

/**
 * Initial Job Masters Dataset
 */
// PRODUCTION: No seed job masters. All job masters come from Supabase.
export const initialJobMasters = [];

/**
 * Initial Sales Quotations Dataset (Clean Production Mode)
 */
export const initialSalesQuotations = [];

export const SYSTEM_ROLES = [
  "Admin",
  "Plant Manager",
  "HR & Payroll Manager",
  "Production Manager",
  "Store Manager",
  "QC Chemist",
  "Purchase Manager",
  "Sales Manager",
  "Printing Operator",
  "Shop Floor Operator"
];

export const initialInks = [
  {
    id: "INK-001",
    productCode: "DIC-WHT-808",
    shade: "Super White (Reverse)",
    inkType: "Reverse Ink",
    manufacturer: "DIC Inks",
    supplierId: "VND-001",
    supplierName: "DIC India Ltd",
    solidContentPct: 45,
    solidVariationPct: 2,
    pricePerKg: 285,
    stockQtyKg: 450,
    reorderLevelKg: 150,
    unit: "Kg",
    solventType: "Ethyl Acetate + IPA",
    notes: "High opacity reverse printing white ink for PET/BOPP laminates",
    priceHistory: [
      { price: 285, date: "2026-08-01", reason: "Standard contract rate" }
    ]
  },
  {
    id: "INK-002",
    productCode: "FLINT-MAG-302",
    shade: "Process Magenta (Reverse)",
    inkType: "Reverse Ink",
    manufacturer: "Flint Group",
    supplierId: "VND-002",
    supplierName: "Flint Group India Pvt Ltd",
    solidContentPct: 38,
    solidVariationPct: 2,
    pricePerKg: 320,
    stockQtyKg: 85,
    reorderLevelKg: 100,
    unit: "Kg",
    solventType: "Ethyl Acetate",
    notes: "High gloss process magenta ink for rotogravure reverse printing",
    priceHistory: [
      { price: 320, date: "2026-08-01", reason: "Initial rate" }
    ]
  },
  {
    id: "INK-003",
    productCode: "HUB-YEL-502",
    shade: "Process Yellow (Reverse)",
    inkType: "Reverse Ink",
    manufacturer: "Hubergroup",
    supplierId: "VND-003",
    supplierName: "Hubergroup India Ltd",
    solidContentPct: 40,
    solidVariationPct: 2.5,
    pricePerKg: 295,
    stockQtyKg: 320,
    reorderLevelKg: 120,
    unit: "Kg",
    solventType: "Ethyl Acetate + IPA",
    notes: "Transparent process yellow with fast drying properties",
    priceHistory: [
      { price: 295, date: "2026-08-01", reason: "Initial rate" }
    ]
  },
  {
    id: "INK-004",
    productCode: "SIEG-CYA-101",
    shade: "Process Cyan (Reverse)",
    inkType: "Reverse Ink",
    manufacturer: "Siegwerk India",
    supplierId: "VND-004",
    supplierName: "Siegwerk India Pvt Ltd",
    solidContentPct: 42,
    solidVariationPct: 2,
    pricePerKg: 310,
    stockQtyKg: 280,
    reorderLevelKg: 100,
    unit: "Kg",
    solventType: "Ethyl Acetate",
    notes: "High strength process cyan for rotogravure flexible packaging",
    priceHistory: [
      { price: 310, date: "2026-08-01", reason: "Initial rate" }
    ]
  },
  {
    id: "INK-005",
    productCode: "DIC-BLK-707",
    shade: "Process Black (Reverse)",
    inkType: "Reverse Ink",
    manufacturer: "DIC Inks",
    supplierId: "VND-001",
    supplierName: "DIC India Ltd",
    solidContentPct: 36,
    solidVariationPct: 2,
    pricePerKg: 260,
    stockQtyKg: 50,
    reorderLevelKg: 80,
    unit: "Kg",
    solventType: "Ethyl Acetate",
    notes: "Deep black ink for high density text and reverse backgrounds",
    priceHistory: [
      { price: 260, date: "2026-08-01", reason: "Initial rate" }
    ]
  },
  {
    id: "INK-006",
    productCode: "SIEG-SRF-WHT",
    shade: "Surface Gloss White",
    inkType: "Surface Ink",
    manufacturer: "Siegwerk India",
    supplierId: "VND-004",
    supplierName: "Siegwerk India Pvt Ltd",
    solidContentPct: 50,
    solidVariationPct: 3,
    pricePerKg: 340,
    stockQtyKg: 180,
    reorderLevelKg: 100,
    unit: "Kg",
    solventType: "Ethyl Acetate + Toluene-Free",
    notes: "High slip surface printing white ink for paper & poly pouches",
    priceHistory: [
      { price: 340, date: "2026-08-01", reason: "Initial rate" }
    ]
  },
  {
    id: "INK-007",
    productCode: "HUB-SRF-RED",
    shade: "Surface Crimson Red",
    inkType: "Surface Ink",
    manufacturer: "Hubergroup",
    supplierId: "VND-003",
    supplierName: "Hubergroup India Ltd",
    solidContentPct: 44,
    solidVariationPct: 2,
    pricePerKg: 365,
    stockQtyKg: 40,
    reorderLevelKg: 75,
    unit: "Kg",
    solventType: "Ethyl Acetate",
    notes: "Scratch resistant surface red ink for milk & oil film pouches",
    priceHistory: [
      { price: 365, date: "2026-08-01", reason: "Initial rate" }
    ]
  }
];

export const ALL_MODULES = [
  { key: "dashboard", label: "Executive Dashboard", category: "Core Operations" },
  { key: "production_records", label: "Production Records & Sign-Off", category: "Shop Floor & Quality" },
  { key: "sales", label: "Sales & Quotations Engine", category: "Sales & Commercial" },
  { key: "job_punching", label: "Job Punching & Costing", category: "Pre-Press & Estimation" },
  { key: "orders", label: "Order Management & POs", category: "Core Operations" },
  { key: "clients", label: "Clients & Directory", category: "Commercial" },
  { key: "job_masters", label: "Job Master Directory", category: "Pre-Press & Master Specs" },
  { key: "vendors", label: "Vendor Onboarding & POs", category: "Purchase & Commercial" },
  { key: "inventory", label: "Inventory, GRN & QC", category: "Store & Inventory" },
  { key: "ink_management", label: "Ink Management & Solid Costing", category: "Store & Inventory" },
  { key: "material_indents", label: "Material Indents & Store", category: "Store & Inventory" },
  { key: "employees", label: "Employee Management & Payroll", category: "Human Resources & Payroll" },
  { key: "user_management", label: "User Management & RBAC", category: "Administration" },
  { key: "cylinders", label: "Rotogravure Cylinders", category: "Pre-Press & Tooling" },
  { key: "printing_scheduler", label: "Printing Machine Scheduler", category: "Shop Floor & Planning" },
  { key: "supabase", label: "Supabase DB Connection", category: "Administration" },
  { key: "doc_settings", label: "Letterhead & Signatures", category: "Administration" },
  { key: "scrap_analytics", label: "Scrap & Wastage Analysis", category: "Core Operations" }
];

export const generateFullRolePermissions = (allowAll = false) => {
  const perm = {};
  SYSTEM_ROLES.forEach(r => {
    perm[r] = {};
    ALL_MODULES.forEach(m => {
      if (r === "Printing Operator") {
        perm[r][m.key] = (m.key === "printing_scheduler" || m.key === "dashboard");
      } else if (r === "Admin" || r === "Plant Manager" || r === "HR & Payroll Manager") {
        perm[r][m.key] = true;
      } else if (r === "Production Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "production_records" || m.key === "printing_scheduler" || m.key === "cylinders" || m.key === "orders" || m.key === "job_masters" || m.key === "inventory" || m.key === "scrap_analytics" || m.key === "employees");
      } else if (r === "Store Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "inventory" || m.key === "material_indents" || m.key === "vendors" || m.key === "ink_management" || m.key === "dispatch");
      } else if (r === "QC Chemist") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "production_records" || m.key === "inventory" || m.key === "ink_management" || m.key === "dispatch");
      } else if (r === "Purchase Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "vendors" || m.key === "inventory" || m.key === "material_indents" || m.key === "ink_management");
      } else if (r === "Sales Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "sales" || m.key === "job_punching" || m.key === "orders" || m.key === "clients" || m.key === "dispatch");
      } else if (r === "Shop Floor Operator") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "production_records" || m.key === "printing_scheduler");
      } else {
        perm[r][m.key] = allowAll;
      }
    });
  });
  return perm;
};

export const DEFAULT_ROLE_PERMISSIONS = generateFullRolePermissions(false);

// ==========================================
// EMPLOYEE & PAYROLL SYSTEM CONSTANTS & DATA
// ==========================================

export const EMPLOYEE_DEPARTMENTS = [
  "Rotogravure Printing",
  "Solventless Lamination",
  "High-Speed Slitting",
  "Pouch Making & Sealing",
  "Extrusion & Blown Film",
  "Quality Assurance (QA/QC)",
  "Plant Maintenance & Electrical",
  "Stores & Raw Material",
  "Dispatch & Logistics",
  "Accounts & Finance",
  "Sales & Commercial",
  "Human Resources & Admin",
  "Plant Security & Safety"
];

export const EMPLOYEE_DESIGNATIONS = [
  "Chief Operating Officer (COO)",
  "Plant Head",
  "Production Manager",
  "Printing Chief Operator",
  "Printing Operator",
  "Printing Helper / Assistant",
  "Lamination Master Operator",
  "Lamination Operator",
  "Slitting Machine Operator",
  "Pouch Machine Operator",
  "Senior QC Chemist",
  "QC Inspector",
  "Maintenance Engineer",
  "Chief Electrician",
  "Store Incharge",
  "Dispatch Officer",
  "Accounts Manager",
  "HR Executive",
  "Commercial Executive",
  "Security Guard"
];

export const EMPLOYEE_STATUSES = [
  "Active",
  "On Probation",
  "Notice Period",
  "Relieved",
  "Terminated"
];

export const SHIFT_OPTIONS = [
  { id: "12h", hours: 12, label: "12 Hours Shift (Standard Factory Shift)", desc: "Day (08:00 - 20:00) / Night (20:00 - 08:00)" },
  { id: "10h", hours: 10, label: "10 Hours Shift (Extended Day / Night)", desc: "Day (08:00 - 18:00) / Night (20:00 - 06:00)" },
  { id: "8h", hours: 8, label: "8 Hours Shift (Standard General / 3-Shift)", desc: "General (09:00 - 17:00) or Shift I/II/III" },
  { id: "custom", hours: 8, label: "Custom Shift Hours", desc: "User defined working hours" }
];

export const initialEmployees = [
  {
    id: "EMP-001",
    empCode: "SIL-PR-01",
    fullName: "Rameshwar Prasad Sharma",
    gender: "Male",
    dob: "1988-06-14",
    phone: "+91 98261 44551",
    email: "rameshwar.p@samyakpackaging.com",
    department: "Rotogravure Printing",
    designation: "Printing Chief Operator",
    joiningDate: "2021-03-15",
    status: "Active",
    shiftDurationHours: 12,
    defaultShift: "Shift A: Day (08:00 - 20:00)",
    address: "House 42, Sector 1, Industrial Area, Pithampur, MP - 454775",
    aadharNo: "4521 8890 1234",
    panNo: "ABCPS1234F",
    uanNo: "101234567890",
    esicNo: "23001234560000001",
    emergencyContact: "Sunita Sharma (Wife) - +91 98261 99882",
    bankDetails: {
      bankName: "State Bank of India",
      accountNumber: "30987654321",
      ifscCode: "SBIN0004521",
      accountHolderName: "Rameshwar Prasad Sharma",
      branch: "Pithampur Sector 3 Branch",
      paymentMode: "Bank Transfer (NEFT)"
    },
    salaryStructure: {
      basicSalary: 18000,
      hra: 7200,
      otherAllowance: 2800,
      dinnerAllowancePerNight: 150,
      fixedDinnerAllowance: 0,
      optPf: true,
      optEsic: false, // > 21,000 gross
      professionalTax: 200
    },
    offboarding: {
      resignationDate: "",
      relievingDate: "",
      noticePeriodDays: 30,
      handoverComplete: false,
      settlementStatus: "N/A",
      notes: ""
    }
  },
  {
    id: "EMP-002",
    empCode: "SIL-PR-02",
    fullName: "Dinesh Kumar Yadav",
    gender: "Male",
    dob: "1994-11-20",
    phone: "+91 97552 11009",
    email: "dinesh.y@samyakpackaging.com",
    department: "Rotogravure Printing",
    designation: "Printing Operator",
    joiningDate: "2023-01-10",
    status: "Active",
    shiftDurationHours: 12,
    defaultShift: "Shift B: Night (20:00 - 08:00)",
    address: "Village Kheda, Rau-Pithampur Road, Indore, MP",
    aadharNo: "7766 5544 3322",
    panNo: "BKVPD9988E",
    uanNo: "101998877665",
    esicNo: "23009988770000002",
    emergencyContact: "Mahesh Yadav (Brother) - +91 97552 44332",
    bankDetails: {
      bankName: "HDFC Bank",
      accountNumber: "50100458963214",
      ifscCode: "HDFC0001234",
      accountHolderName: "Dinesh Kumar Yadav",
      branch: "Indore Transport Nagar",
      paymentMode: "Bank Transfer (NEFT)"
    },
    salaryStructure: {
      basicSalary: 12500,
      hra: 5000,
      otherAllowance: 1500,
      dinnerAllowancePerNight: 150,
      fixedDinnerAllowance: 0,
      optPf: true,
      optEsic: true, // <= 21,000 gross
      professionalTax: 150
    },
    offboarding: {
      resignationDate: "",
      relievingDate: "",
      noticePeriodDays: 30,
      handoverComplete: false,
      settlementStatus: "N/A",
      notes: ""
    }
  },
  {
    id: "EMP-003",
    empCode: "SIL-LAM-01",
    fullName: "Sunil Verma",
    gender: "Male",
    dob: "1991-04-18",
    phone: "+91 98930 22334",
    email: "sunil.verma@samyakpackaging.com",
    department: "Solventless Lamination",
    designation: "Lamination Master Operator",
    joiningDate: "2022-06-01",
    status: "Active",
    shiftDurationHours: 10,
    defaultShift: "Shift A: Day (08:00 - 18:00)",
    address: "Flat 204, Om Gurudev Complex, Mhow, MP",
    aadharNo: "8899 1122 3344",
    panNo: "CQRPV5566G",
    uanNo: "101556677889",
    esicNo: "23005566770000003",
    emergencyContact: "Aarti Verma (Wife) - +91 98930 77665",
    bankDetails: {
      bankName: "Bank of Baroda",
      accountNumber: "04560100098765",
      ifscCode: "BARB0MHOWXX",
      accountHolderName: "Sunil Verma",
      branch: "Mhow Main Branch",
      paymentMode: "Bank Transfer (NEFT)"
    },
    salaryStructure: {
      basicSalary: 15000,
      hra: 6000,
      otherAllowance: 2000,
      dinnerAllowancePerNight: 120,
      fixedDinnerAllowance: 0,
      optPf: true,
      optEsic: false,
      professionalTax: 200
    },
    offboarding: {
      resignationDate: "",
      relievingDate: "",
      noticePeriodDays: 30,
      handoverComplete: false,
      settlementStatus: "N/A",
      notes: ""
    }
  },
  {
    id: "EMP-004",
    empCode: "SIL-QC-01",
    fullName: "Pooja Trivedi",
    gender: "Female",
    dob: "1996-09-25",
    phone: "+91 94250 88991",
    email: "pooja.t@samyakpackaging.com",
    department: "Quality Assurance (QA/QC)",
    designation: "Senior QC Chemist",
    joiningDate: "2023-08-15",
    status: "Active",
    shiftDurationHours: 8,
    defaultShift: "General Shift (09:00 - 17:00)",
    address: "Scheme 78, Vijay Nagar, Indore, MP",
    aadharNo: "3344 5566 7788",
    panNo: "BPTTP8877K",
    uanNo: "101334455667",
    esicNo: "",
    emergencyContact: "Anand Trivedi (Father) - +91 94250 11223",
    bankDetails: {
      bankName: "Axis Bank",
      accountNumber: "918010045678901",
      ifscCode: "UTIB0000456",
      accountHolderName: "Pooja Trivedi",
      branch: "Vijay Nagar Indore",
      paymentMode: "Bank Transfer (NEFT)"
    },
    salaryStructure: {
      basicSalary: 22000,
      hra: 8800,
      otherAllowance: 4200,
      dinnerAllowancePerNight: 0,
      fixedDinnerAllowance: 0,
      optPf: true,
      optEsic: false,
      professionalTax: 200
    },
    offboarding: {
      resignationDate: "",
      relievingDate: "",
      noticePeriodDays: 30,
      handoverComplete: false,
      settlementStatus: "N/A",
      notes: ""
    }
  },
  {
    id: "EMP-005",
    empCode: "SIL-SLT-01",
    fullName: "Mukesh Bhati",
    gender: "Male",
    dob: "1993-02-12",
    phone: "+91 96850 44112",
    email: "mukesh.b@samyakpackaging.com",
    department: "High-Speed Slitting",
    designation: "Slitting Machine Operator",
    joiningDate: "2022-11-20",
    status: "Active",
    shiftDurationHours: 12,
    defaultShift: "Shift A: Day (08:00 - 20:00)",
    address: "Gram Sagore, Pithampur Sector 2, MP",
    aadharNo: "5566 7788 9900",
    panNo: "DEXPB3344M",
    uanNo: "101889900112",
    esicNo: "23008899000000005",
    emergencyContact: "Kishore Bhati (Father) - +91 96850 99881",
    bankDetails: {
      bankName: "State Bank of India",
      accountNumber: "20458963217",
      ifscCode: "SBIN0004521",
      accountHolderName: "Mukesh Bhati",
      branch: "Pithampur Sector 3",
      paymentMode: "Bank Transfer (NEFT)"
    },
    salaryStructure: {
      basicSalary: 11000,
      hra: 4400,
      otherAllowance: 1600,
      dinnerAllowancePerNight: 150,
      fixedDinnerAllowance: 0,
      optPf: true,
      optEsic: true,
      professionalTax: 150
    },
    offboarding: {
      resignationDate: "",
      relievingDate: "",
      noticePeriodDays: 30,
      handoverComplete: false,
      settlementStatus: "N/A",
      notes: ""
    }
  },
  {
    id: "EMP-006",
    empCode: "SIL-PCH-01",
    fullName: "Anil Sahu",
    gender: "Male",
    dob: "1995-07-30",
    phone: "+91 91110 33445",
    email: "anil.sahu@samyakpackaging.com",
    department: "Pouch Making & Sealing",
    designation: "Pouch Machine Operator",
    joiningDate: "2024-02-01",
    status: "Active",
    shiftDurationHours: 10,
    defaultShift: "Shift B: Night (20:00 - 06:00)",
    address: "Kishanpura, Mhow, MP",
    aadharNo: "1122 3344 5566",
    panNo: "EIZPS4455Q",
    uanNo: "101445566778",
    esicNo: "23004455660000006",
    emergencyContact: "Rajesh Sahu (Uncle) - +91 91110 88992",
    bankDetails: {
      bankName: "Punjab National Bank",
      accountNumber: "1234000100987654",
      ifscCode: "PUNB0123400",
      accountHolderName: "Anil Sahu",
      branch: "Mhow Cantt",
      paymentMode: "Bank Transfer (NEFT)"
    },
    salaryStructure: {
      basicSalary: 10500,
      hra: 4200,
      otherAllowance: 1300,
      dinnerAllowancePerNight: 120,
      fixedDinnerAllowance: 0,
      optPf: true,
      optEsic: true,
      professionalTax: 150
    },
    offboarding: {
      resignationDate: "",
      relievingDate: "",
      noticePeriodDays: 30,
      handoverComplete: false,
      settlementStatus: "N/A",
      notes: ""
    }
  }
];

export const initialAttendanceRecords = [
  {
    id: "ATT-20260827-EMP001",
    employeeId: "EMP-001",
    date: "2026-08-27",
    shiftType: "Shift A: Day (08:00 - 20:00)",
    shiftHours: 12,
    status: "Present",
    checkIn: "07:55",
    checkOut: "22:00",
    totalHoursWorked: 14,
    overtimeHours: 2,
    overtimeReason: "Extended production run for Dev Agro urgent job lot on Rotomec 8-Color",
    overtimeStatus: "Pending Approval", // "Pending Approval", "Approved", "Rejected"
    overtimeApprovedBy: "",
    overtimeApprovedDate: "",
    dinnerAllowanceEligible: false,
    markedBy: "Samyak Jain (Admin)"
  },
  {
    id: "ATT-20260827-EMP002",
    employeeId: "EMP-002",
    date: "2026-08-27",
    shiftType: "Shift B: Night (20:00 - 08:00)",
    shiftHours: 12,
    status: "Present",
    checkIn: "19:50",
    checkOut: "08:10",
    totalHoursWorked: 12.33,
    overtimeHours: 0,
    overtimeReason: "",
    overtimeStatus: "Approved",
    overtimeApprovedBy: "Plant Manager",
    overtimeApprovedDate: "2026-08-27",
    dinnerAllowanceEligible: true, // Night shift gets Dinner Allowance
    markedBy: "Shift Supervisor"
  },
  {
    id: "ATT-20260827-EMP003",
    employeeId: "EMP-003",
    date: "2026-08-27",
    shiftType: "Shift A: Day (08:00 - 18:00)",
    shiftHours: 10,
    status: "Present",
    checkIn: "08:00",
    checkOut: "20:00",
    totalHoursWorked: 12,
    overtimeHours: 2,
    overtimeReason: "Solventless lamination line setup and adhesive curing monitoring",
    overtimeStatus: "Approved",
    overtimeApprovedBy: "Samyak Jain (Admin)",
    overtimeApprovedDate: "2026-08-27",
    dinnerAllowanceEligible: false,
    markedBy: "Samyak Jain (Admin)"
  },
  {
    id: "ATT-20260827-EMP004",
    employeeId: "EMP-004",
    date: "2026-08-27",
    shiftType: "General Shift (09:00 - 17:00)",
    shiftHours: 8,
    status: "Present",
    checkIn: "08:50",
    checkOut: "17:15",
    totalHoursWorked: 8.4,
    overtimeHours: 0,
    overtimeReason: "",
    overtimeStatus: "Approved",
    overtimeApprovedBy: "",
    overtimeApprovedDate: "",
    dinnerAllowanceEligible: false,
    markedBy: "HR Department"
  },
  {
    id: "ATT-20260827-EMP005",
    employeeId: "EMP-005",
    date: "2026-08-27",
    shiftType: "Shift A: Day (08:00 - 20:00)",
    shiftHours: 12,
    status: "Present",
    checkIn: "07:50",
    checkOut: "23:00",
    totalHoursWorked: 15,
    overtimeHours: 3,
    overtimeReason: "High-speed slitting roll rewinding for immediate dispatch challan",
    overtimeStatus: "Pending Approval",
    overtimeApprovedBy: "",
    overtimeApprovedDate: "",
    dinnerAllowanceEligible: false,
    markedBy: "Shift Supervisor"
  }
];

export const initialSalaryAdvances = [
  {
    id: "ADV-2026-001",
    employeeId: "EMP-002",
    employeeName: "Dinesh Kumar Yadav",
    department: "Rotogravure Printing",
    requestDate: "2026-08-10",
    advanceAmount: 10000,
    repaymentTenureMonths: 2,
    monthlyEmiAmount: 5000,
    reason: "Urgent medical expense for family member",
    status: "Approved & Disbursed", // "Pending Approval", "Approved & Disbursed", "Rejected", "Fully Recovered"
    approvedBy: "Plant Manager",
    approvedDate: "2026-08-11",
    disbursedDate: "2026-08-11",
    totalRecoveredAmount: 0,
    remainingBalance: 10000,
    deductionHistory: []
  },
  {
    id: "ADV-2026-002",
    employeeId: "EMP-005",
    employeeName: "Mukesh Bhati",
    department: "High-Speed Slitting",
    requestDate: "2026-08-20",
    advanceAmount: 6000,
    repaymentTenureMonths: 3,
    monthlyEmiAmount: 2000,
    reason: "Children school admission and books fee",
    status: "Pending Approval",
    approvedBy: "",
    approvedDate: "",
    disbursedDate: "",
    totalRecoveredAmount: 0,
    remainingBalance: 6000,
    deductionHistory: []
  }
];

// Helper to compute salary for a specific month and employee
export function calculateEmployeeMonthlySalary(emp, monthKey, attendanceList = [], advanceList = [], totalWorkingDays = 26) {
  if (!emp) return null;

  const struct = emp.salaryStructure || {};
  const basic = Number(struct.basicSalary) || 0;
  const hra = Number(struct.hra) || 0;
  const other = Number(struct.otherAllowance) || 0;
  const fixedGross = basic + hra + other;
  const shiftHours = Number(emp.shiftDurationHours) || 12;

  // Filter attendance for this employee and month (e.g. '2026-08')
  const empAtt = attendanceList.filter(a => 
    a.employeeId === emp.id && 
    (a.date || '').startsWith(monthKey)
  );

  let presentCount = 0;
  let halfDayCount = 0;
  let paidLeaveCount = 0;
  let absentCount = 0;
  let nightShiftCount = 0;
  let approvedOtHours = 0;
  let pendingOtHours = 0;

  empAtt.forEach(a => {
    if (a.status === 'Present') presentCount += 1;
    else if (a.status === 'Half Day') halfDayCount += 1;
    else if (a.status === 'Paid Leave') paidLeaveCount += 1;
    else if (a.status === 'Absent') absentCount += 1;

    // Check night shift
    if (a.dinnerAllowanceEligible || (a.shiftType && a.shiftType.toLowerCase().includes('night'))) {
      nightShiftCount += 1;
    }

    // Overtime hours
    const ot = Number(a.overtimeHours) || 0;
    if (ot > 0) {
      if (a.overtimeStatus === 'Approved') {
        approvedOtHours += ot;
      } else if (a.overtimeStatus === 'Pending Approval') {
        pendingOtHours += ot;
      }
    }
  });

  // Effective days paid = Present + (HalfDay * 0.5) + PaidLeave
  const effectivePaidDays = presentCount + (halfDayCount * 0.5) + paidLeaveCount;
  const proRataFactor = totalWorkingDays > 0 ? (effectivePaidDays / totalWorkingDays) : 1;

  // Earned base salary components
  const earnedBasic = Math.round(basic * proRataFactor);
  const earnedHra = Math.round(hra * proRataFactor);
  const earnedOther = Math.round(other * proRataFactor);

  // Dinner Allowance (either per night shift or fixed)
  const dinnerPerNight = Number(struct.dinnerAllowancePerNight) || 0;
  const fixedDinner = Number(struct.fixedDinnerAllowance) || 0;
  const dinnerAllowance = fixedDinner > 0 ? fixedDinner : (nightShiftCount * dinnerPerNight);

  // Overtime Calculation:
  // Hourly Base Rate = Fixed Gross / (Working Days * Shift Hours)
  const totalStandardMonthHours = totalWorkingDays * shiftHours;
  const hourlyRate = totalStandardMonthHours > 0 ? (fixedGross / totalStandardMonthHours) : 0;
  // Overtime rate standard multiplier: 1x of normal hourly rate
  const otRatePerHr = Math.round(hourlyRate);
  const earnedOtPay = Math.round(approvedOtHours * otRatePerHr);

  // Total Gross Earned
  const totalGrossEarned = earnedBasic + earnedHra + earnedOther + dinnerAllowance + earnedOtPay;

  // Statutory Deductions:
  // PF: 12% of Earned Basic if opted in (or capped at ₹1,800 if desired)
  let pfDeduction = 0;
  if (struct.optPf) {
    pfDeduction = Math.round(earnedBasic * 0.12);
  }

  // ESIC: 0.75% of Gross Earned if opted in (Standard ESIC threshold is gross <= ₹21,000)
  let esicDeduction = 0;
  if (struct.optEsic) {
    esicDeduction = Math.round(totalGrossEarned * 0.0075);
  }

  // Professional Tax
  const ptDeduction = Number(struct.professionalTax) || 0;

  // Salary Advance EMI Deduction (active approved advances)
  const activeAdvances = advanceList.filter(adv => 
    adv.employeeId === emp.id && 
    (adv.status === 'Approved & Disbursed') &&
    (adv.remainingBalance > 0)
  );
  
  let totalAdvanceDeduction = 0;
  activeAdvances.forEach(adv => {
    const emi = Number(adv.monthlyEmiAmount) || 0;
    const deductThisMonth = Math.min(emi, adv.remainingBalance);
    totalAdvanceDeduction += deductThisMonth;
  });

  const totalDeductions = pfDeduction + esicDeduction + ptDeduction + totalAdvanceDeduction;
  const netPayable = Math.max(0, totalGrossEarned - totalDeductions);

  return {
    employeeId: emp.id,
    empCode: emp.empCode,
    fullName: emp.fullName,
    department: emp.department,
    designation: emp.designation,
    shiftDurationHours: shiftHours,
    bankDetails: emp.bankDetails,
    totalWorkingDays,
    presentCount,
    halfDayCount,
    paidLeaveCount,
    absentCount,
    effectivePaidDays,
    nightShiftCount,
    approvedOtHours,
    pendingOtHours,
    hourlyRate: parseFloat(hourlyRate.toFixed(2)),
    otRatePerHr: parseFloat(otRatePerHr.toFixed(2)),
    // Earnings
    fixedGross,
    earnedBasic,
    earnedHra,
    earnedOther,
    dinnerAllowance,
    earnedOtPay,
    totalGrossEarned,
    // Deductions
    pfDeduction,
    esicDeduction,
    ptDeduction,
    totalAdvanceDeduction,
    totalDeductions,
    // Net
    netPayable
  };
}




