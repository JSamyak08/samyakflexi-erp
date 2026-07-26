// FactoryOS Data Store & Flexible Packaging Calculation Engine
// Samyak International Ltd, Indore

export const COMPANY_DETAILS = {
  name: "SAMYAK INTERNATIONAL LTD",
  tagline: "Flexible Packaging Manufacturing Division",
  gstin: "23AABCM3526F1ZY",
  address: "11-B, Kheda Industrial Area, Pithampur, District Dhar, Madhya Pradesh - 454775",
  phones: "+91 8889133133, +91 9302477494",
  email: "Info@samyakinternational.in",
  logoUrl: "/samyak-logo.png"
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
  "Metalised CPP": 0.91
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
 * Checks if a film grade is an LD Film (requires +5mm extra slit width)
 */
export const isLDFilm = (filmType = "") => {
  if (!filmType) return false;
  const name = filmType.toLowerCase();
  return name.includes('ld') || name.includes('atta') || name.includes('metallocene');
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
    const pricePerKg = parseFloat(filmPrices[layer.filmType]) || DEFAULT_DAILY_RATES[layer.filmType] || 130;

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
  }
];

/**
 * Seed Shop Floor Actual Job Data Sheets
 */
export const initialJobDataSheets = [
  {
    jobId: "ORD-2026-089",
    jobName: "Britannia Bourbon 250g Packaging",
    clientName: "Britannia Industries Ltd",
    sellingPricePerKg: 245, // ₹ 245 / kg
    completionDate: "2026-07-22",
    actualFilmConsumedKg: {
      "Layer 1 (PET 12µ)": 385.5,
      "Layer 2 (METPET 12µ)": 388.0,
      "Layer 3 (Natural GP LD 35µ)": 810.0
    },
    actualInkConsumedKg: 52.0,      // Liquid ink
    actualSolventsConsumedKg: 18.5, // Ethyl Acetate / IPA
    actualAdhesiveConsumedKg: 46.5, // Solventless adhesive
    actualScrapWastageKg: 125.0,    // Shop floor trim wastage
    operatorNotes: "Smooth run on Rotogravure Line 2. Corona level maintained at 44 dynes."
  }
];

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
export const initialVendors = [
  {
    id: "VEND-001",
    companyName: "FlexiPoly Films Ltd",
    gstin: "23AABCF1234H1Z5",
    address: "Plot 42, Sector 3, Pithampur Industrial Area, Indore, MP 454775",
    contactPerson: "Rajesh Sharma",
    phone: "+91 98260 11223",
    email: "orders@flexipoly.com",
    bankDetails: "HDFC Bank | A/C: 502000123456 | IFSC: HDFC0000123",
    materials: ["PET", "METPET"],
    paymentTerms: "30 Days Net",
    rating: 4.8
  },
  {
    id: "VEND-002",
    companyName: "Malwa Extrusions Pvt Ltd",
    gstin: "23AAACM5678J1Z9",
    address: "Sanwer Road Industrial Area, Sector E, Indore, MP 452015",
    contactPerson: "Vikram Patel",
    phone: "+91 94250 99887",
    email: "sales@malwapoly.com",
    bankDetails: "ICICI Bank | A/C: 004205009988 | IFSC: ICIC0000042",
    materials: ["LDPE", "Natural GP LD", "White LD"],
    paymentTerms: "15 Days Net",
    rating: 4.6
  },
  {
    id: "VEND-003",
    companyName: "Cosmo Films India",
    gstin: "27AAACC1122K1Z2",
    address: "MIDC Waluj, Aurangabad, MH 431136",
    contactPerson: "Ankit Verma",
    phone: "+91 99231 44556",
    email: "support@cosmofilms.com",
    bankDetails: "State Bank of India | A/C: 3109887711 | IFSC: SBIN0001234",
    materials: ["BOPP Natural", "Metalised BOPP", "Pearlised BOPP"],
    paymentTerms: "45 Days Net",
    rating: 4.9
  },
  {
    id: "VEND-004",
    companyName: "Siegwerk Inks Ltd",
    gstin: "27AABCS9988F1Z1",
    address: "Bhiwadi Industrial Estate, Rajasthan 301019",
    contactPerson: "Sanjay Gupta",
    phone: "+91 98112 33445",
    email: "orders.india@siegwerk.com",
    bankDetails: "Axis Bank | A/C: 9180200554433 | IFSC: UTIB0000189",
    materials: ["Liquid Inks", "Solvents"],
    paymentTerms: "30 Days Net",
    rating: 4.9
  }
];

/**
 * Seed Orders Data (including Delay Tracking)
 */
export const initialOrders = [
  {
    id: "ORD-2026-089",
    jobName: "Britannia Bourbon 250g Packaging",
    clientName: "Britannia Industries Ltd",
    orderDate: "2026-07-10",
    targetDeliveryDate: "2026-07-22", // Past target date -> DELAYED!
    orderQtyKg: 2500,
    orderType: "Pouching",
    status: "Delayed",
    delayReason: "Raw material METPET 12mic delivery delayed by vendor",
    structure: "12 PET / 12 METPET / 35 Natural LD GP Film",
    poIssued: true,
    poNumber: "PO-2026-042",
    materialRequirements: [
      { id: "REQ-089-1", filmType: "PET", micron: 12, widthMm: 1000, qtyKg: 385.5, preferredVendor: "FlexiPoly Films Ltd", poIssued: true, poNumber: "PO-2026-042" },
      { id: "REQ-089-2", filmType: "METPET", micron: 12, widthMm: 1000, qtyKg: 388.0, preferredVendor: "FlexiPoly Films Ltd", poIssued: false, poNumber: "" },
      { id: "REQ-089-3", filmType: "Natural LD GP Film", micron: 35, widthMm: 1005, qtyKg: 810.0, preferredVendor: "Malwa Extrusions Pvt Ltd", poIssued: true, poNumber: "PO-2026-042" },
      { id: "REQ-089-4", filmType: "Liquid Inks", micron: "-", widthMm: "-", qtyKg: 52.0, preferredVendor: "Siegwerk Inks Ltd", poIssued: true, poNumber: "PO-2026-042" },
      { id: "REQ-089-5", filmType: "Solvent-less Adhesive", micron: "-", widthMm: "-", qtyKg: 46.5, preferredVendor: "Siegwerk Inks Ltd", poIssued: true, poNumber: "PO-2026-042" }
    ]
  },
  {
    id: "ORD-2026-090",
    jobName: "P&G Ariel Matic 1kg Pouch",
    clientName: "Procter & Gamble",
    orderDate: "2026-07-18",
    targetDeliveryDate: "2026-07-28",
    orderQtyKg: 1500,
    orderType: "Pouching",
    status: "In Production",
    delayReason: "",
    structure: "12 PET / 12 METPET / 40 Milky LD GP Film",
    poIssued: true,
    poNumber: "PO-2026-045",
    materialRequirements: [
      { id: "REQ-090-1", filmType: "PET", micron: 12, widthMm: 1000, qtyKg: 230.0, preferredVendor: "FlexiPoly Films Ltd", poIssued: true, poNumber: "PO-2026-045" },
      { id: "REQ-090-2", filmType: "METPET", micron: 12, widthMm: 1000, qtyKg: 232.0, preferredVendor: "FlexiPoly Films Ltd", poIssued: true, poNumber: "PO-2026-045" },
      { id: "REQ-090-3", filmType: "Milky LD GP Film", micron: 40, widthMm: 1005, qtyKg: 560.0, preferredVendor: "Malwa Extrusions Pvt Ltd", poIssued: true, poNumber: "PO-2026-045" },
      { id: "REQ-090-4", filmType: "Liquid Inks", micron: "-", widthMm: "-", qtyKg: 31.0, preferredVendor: "Siegwerk Inks Ltd", poIssued: true, poNumber: "PO-2026-045" }
    ]
  },
  {
    id: "ORD-2026-091",
    jobName: "Surf Excel 500ml Refill Pack",
    clientName: "Hindustan Unilever",
    orderDate: "2026-07-12",
    targetDeliveryDate: "2026-07-20", // Past target date -> DELAYED!
    orderQtyKg: 450,
    orderType: "Pouching",
    status: "Delayed",
    delayReason: "QC Rejected LDPE film batch due to gauge variation",
    structure: "12 PET / 50 Natural LD Metallocene Film",
    poIssued: false,
    poNumber: "",
    materialRequirements: [
      { id: "REQ-091-1", filmType: "PET", micron: 12, widthMm: 900, qtyKg: 95.0, preferredVendor: "FlexiPoly Films Ltd", poIssued: false, poNumber: "" },
      { id: "REQ-091-2", filmType: "Natural LD Metallocene Film", micron: 50, widthMm: 905, qtyKg: 310.0, preferredVendor: "Malwa Extrusions Pvt Ltd", poIssued: false, poNumber: "" },
      { id: "REQ-091-3", filmType: "Liquid Inks", micron: "-", widthMm: "-", qtyKg: 12.0, preferredVendor: "Siegwerk Inks Ltd", poIssued: false, poNumber: "" }
    ]
  },
  {
    id: "ORD-2026-092",
    jobName: "Sanchi Milk 500ml Film",
    clientName: "MP State Cooperative Dairy",
    orderDate: "2026-07-22",
    targetDeliveryDate: "2026-07-30",
    orderQtyKg: 3000,
    orderType: "Reel",
    status: "Material Required",
    delayReason: "",
    structure: "50 Milky Atta (High Dart) Film / 50 Natural LD GP Film",
    poIssued: false,
    poNumber: "",
    materialRequirements: [
      { id: "REQ-092-1", filmType: "Milky Atta (High Dart) Film", micron: 50, widthMm: 985, qtyKg: 1450.0, preferredVendor: "Malwa Extrusions Pvt Ltd", poIssued: false, poNumber: "" },
      { id: "REQ-092-2", filmType: "Natural LD GP Film", micron: 50, widthMm: 985, qtyKg: 1450.0, preferredVendor: "Malwa Extrusions Pvt Ltd", poIssued: false, poNumber: "" },
      { id: "REQ-092-3", filmType: "Liquid Inks", micron: "-", widthMm: "-", qtyKg: 55.0, preferredVendor: "Siegwerk Inks Ltd", poIssued: false, poNumber: "" }
    ]
  }
];

/**
 * Seed Inventory Stock Data
 */
export const initialInventory = [
  {
    id: "INV-001",
    filmType: "PET",
    micron: 12,
    widthMm: 1000,
    density: 1.40,
    availableQtyKg: 3200,
    allocatedQtyKg: 1500,
    location: "Bay A - Rack 04",
    reorderLevelKg: 1000,
    lastVendor: "FlexiPoly Films Ltd",
    lastBatch: "BATCH-PET-884"
  },
  {
    id: "INV-002",
    filmType: "METPET",
    micron: 12,
    widthMm: 1000,
    density: 1.40,
    availableQtyKg: 450, // Low stock!
    allocatedQtyKg: 400,
    location: "Bay A - Rack 08",
    reorderLevelKg: 1000,
    lastVendor: "FlexiPoly Films Ltd",
    lastBatch: "BATCH-MPET-312"
  },
  {
    id: "INV-003",
    filmType: "Natural GP LD",
    micron: 35,
    widthMm: 1050,
    density: 0.93,
    availableQtyKg: 4200,
    allocatedQtyKg: 2000,
    location: "Bay B - Rack 01",
    reorderLevelKg: 1500,
    lastVendor: "Malwa Extrusions Pvt Ltd",
    lastBatch: "BATCH-LD-9021"
  },
  {
    id: "INV-004",
    filmType: "White LD",
    micron: 40,
    widthMm: 980,
    density: 0.93,
    availableQtyKg: 2800,
    allocatedQtyKg: 1200,
    location: "Bay B - Rack 03",
    reorderLevelKg: 1000,
    lastVendor: "Malwa Extrusions Pvt Ltd",
    lastBatch: "BATCH-WLD-441"
  },
  {
    id: "INV-005",
    filmType: "Pearlised BOPP",
    micron: 20,
    widthMm: 800,
    density: 0.70,
    availableQtyKg: 1800,
    allocatedQtyKg: 500,
    location: "Bay C - Rack 02",
    reorderLevelKg: 800,
    lastVendor: "Cosmo Films India",
    lastBatch: "BATCH-PBOPP-71"
  }
];

/**
 * Seed GRN Data (Goods Receipt Notes)
 */
export const initialGRNs = [
  {
    grnNo: "GRN-2026-104",
    poNumber: "PO-2026-042",
    vendorName: "FlexiPoly Films Ltd",
    invoiceNo: "INV-FP-9904",
    receivedDate: "2026-07-23 10:30 AM",
    filmType: "PET",
    micron: 12,
    widthMm: 1000,
    rollsReceived: 12,
    netWeightKg: 1850,
    batchNo: "BATCH-PET-991",
    status: "Approved", // Approved by QC
    qcNotes: "Average gauge 12.1 mic. Dyne level 44 dynes/cm. Approved for production.",
    inspectedBy: "Quality Inspector Ramesh Kumar",
    storeManager: "Store Mgr Dilip Joshi"
  },
  {
    grnNo: "GRN-2026-105",
    poNumber: "PO-2026-045",
    vendorName: "Malwa Extrusions Pvt Ltd",
    invoiceNo: "INV-ME-3312",
    receivedDate: "2026-07-24 09:15 AM",
    filmType: "Natural GP LD",
    micron: 35,
    widthMm: 1050,
    rollsReceived: 16,
    netWeightKg: 2400,
    batchNo: "BATCH-LD-9982",
    status: "Pending QC", // Awaiting QC
    qcNotes: "",
    inspectedBy: "",
    storeManager: "Store Mgr Dilip Joshi"
  }
];

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
