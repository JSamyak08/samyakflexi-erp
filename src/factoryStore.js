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
export const isReconciliationDue = (currentDateString = "2026-07-24") => {
  const date = new Date(currentDateString);
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = date.getDate();
  return (lastDayOfMonth - currentDay) <= 1; // True on last 2 days
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
  FILMS: ["PET", "METPET", "Natural LD GP Film", "Milky LD GP Film", "Natural LD Metallocene Film", "Milky LD Metallocene Film", "Milky Atta (High Dart) Film", "LDPE", "Natural GP LD", "White LD", "BOPP Natural", "Metalised BOPP", "Pearlised BOPP", "CPP Natural", "Metalised CPP"],
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
  const dateStr = today.toISOString().slice(0,10).replace(/-/g, '');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${dateStr}-${randomSuffix}`;
};

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
  "Production Manager",
  "Store Manager",
  "QC Chemist",
  "Purchase Manager",
  "Sales Manager",
  "Shop Floor Operator"
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
  { key: "material_indents", label: "Material Indents & Store", category: "Store & Inventory" },
  { key: "user_management", label: "User Management & RBAC", category: "Administration" },
  { key: "cylinders", label: "Rotogravure Cylinders", category: "Pre-Press & Tooling" },
  { key: "printing_scheduler", label: "Printing Machine Scheduler", category: "Shop Floor & Planning" },
  { key: "supabase", label: "Supabase DB Connection", category: "Administration" },
  { key: "doc_settings", label: "Letterhead & Signatures", category: "Administration" },
  { key: "scrap_analytics", label: "Scrap & Wastage Analysis", category: "Core Operations" }
];

export const generateFullRolePermissions = (allowAll = true) => {
  const perm = {};
  SYSTEM_ROLES.forEach(r => {
    perm[r] = {};
    ALL_MODULES.forEach(m => {
      perm[r][m.key] = allowAll ? true : (r === "Admin" || r === "Plant Manager");
    });
  });
  return perm;
};

export const DEFAULT_ROLE_PERMISSIONS = generateFullRolePermissions(true);


