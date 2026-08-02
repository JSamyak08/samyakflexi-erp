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
    purchaseRatePerKg: 125.00,
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
    purchaseRatePerKg: 115.00,
    batchNo: "BATCH-LD-9982",
    status: "Pending QC", // Awaiting QC
    qcNotes: "",
    inspectedBy: "",
    storeManager: "Store Mgr Dilip Joshi"
  },
  {
    grnNo: "GRN-2026-098",
    poNumber: "PO-2026-035",
    vendorName: "FlexiPoly Films Ltd",
    invoiceNo: "INV-FP-9812",
    receivedDate: "2026-07-15 02:45 PM",
    filmType: "METPET",
    micron: 12,
    widthMm: 1000,
    rollsReceived: 8,
    netWeightKg: 1200,
    purchaseRatePerKg: 140.00,
    batchNo: "BATCH-MPET-312",
    status: "Approved",
    qcNotes: "Good metallisation optical density 2.4. Approved.",
    inspectedBy: "Quality Inspector Ramesh Kumar",
    storeManager: "Store Mgr Dilip Joshi"
  },
  {
    grnNo: "GRN-2026-089",
    poNumber: "PO-2026-028",
    vendorName: "Malwa Extrusions Pvt Ltd",
    invoiceNo: "INV-ME-3190",
    receivedDate: "2026-07-08 11:00 AM",
    filmType: "White LD",
    micron: 40,
    widthMm: 980,
    rollsReceived: 20,
    netWeightKg: 3000,
    purchaseRatePerKg: 120.00,
    batchNo: "BATCH-WLD-441",
    status: "Approved",
    qcNotes: "Opacity 85%, seal strength excellent.",
    inspectedBy: "Quality Inspector Ramesh Kumar",
    storeManager: "Store Mgr Dilip Joshi"
  },
  {
    grnNo: "GRN-2026-072",
    poNumber: "PO-2026-019",
    vendorName: "Cosmo Films India",
    invoiceNo: "INV-CF-7714",
    receivedDate: "2026-06-28 04:20 PM",
    filmType: "Pearlised BOPP",
    micron: 20,
    widthMm: 800,
    rollsReceived: 14,
    netWeightKg: 2100,
    purchaseRatePerKg: 160.00,
    batchNo: "BATCH-PBOPP-71",
    status: "Approved",
    qcNotes: "Density 0.70 g/cc verified. Corona treatment 40 dynes.",
    inspectedBy: "Quality Inspector Ramesh Kumar",
    storeManager: "Store Mgr Dilip Joshi"
  }
];

/**
 * Seed Job Production Records & Material Consumption Trackers
 */
export const initialProductionRecords = [
  {
    id: "REC-2026-089",
    orderId: "ORD-2026-089",
    jobName: "Britannia Bourbon 250g Packaging",
    clientName: "Britannia Industries Ltd",
    dateFilled: "2026-07-24",
    materialsList: [
      { id: "MAT-1", filmType: "PET", micron: 12, widthMm: 1000, issueQtyKg: 400.0, returnQtyKg: 14.5, netConsumedQtyKg: 385.5, unitPricePerKg: 125.00, totalMaterialCost: 48187.50 },
      { id: "MAT-2", filmType: "METPET", micron: 12, widthMm: 1000, issueQtyKg: 400.0, returnQtyKg: 12.0, netConsumedQtyKg: 388.0, unitPricePerKg: 140.00, totalMaterialCost: 54320.00 },
      { id: "MAT-3", filmType: "Natural LD GP Film", micron: 35, widthMm: 1005, issueQtyKg: 850.0, returnQtyKg: 40.0, netConsumedQtyKg: 810.0, unitPricePerKg: 115.00, totalMaterialCost: 93150.00 },
      { id: "MAT-4", filmType: "Liquid Inks & Solvents", micron: "-", widthMm: "-", issueQtyKg: 55.0, returnQtyKg: 3.0, netConsumedQtyKg: 52.0, unitPricePerKg: 1500.00, totalMaterialCost: 78000.00 },
      { id: "MAT-5", filmType: "Solvent-less Adhesive", micron: "-", widthMm: "-", issueQtyKg: 48.0, returnQtyKg: 1.5, netConsumedQtyKg: 46.5, unitPricePerKg: 270.00, totalMaterialCost: 12555.00 }
    ],
    totalProductionQtyKg: 1635.5,
    totalMaterialCostRs: 286212.50,
    processingCostRs: 45000.00,
    finalProductionCostRs: 331212.50,
    status: "Filled by Plant Manager", // Options: 'Draft', 'Filled by Plant Manager', 'Approved by Admin'
    filledBy: "Rajiv Malhotra (Plant Manager)",
    approvedBy: "",
    approvalDate: "",
    notes: "Lamination trial completed cleanly. 67.5 kg net trimming waste within tolerance."
  },
  {
    id: "REC-2026-090",
    orderId: "ORD-2026-090",
    jobName: "P&G Ariel Matic 1kg Pouch",
    clientName: "Procter & Gamble",
    dateFilled: "2026-07-22",
    materialsList: [
      { id: "MAT-1", filmType: "PET", micron: 12, widthMm: 1000, issueQtyKg: 240.0, returnQtyKg: 10.0, netConsumedQtyKg: 230.0, unitPricePerKg: 125.00, totalMaterialCost: 28750.00 },
      { id: "MAT-2", filmType: "METPET", micron: 12, widthMm: 1000, issueQtyKg: 245.0, returnQtyKg: 13.0, netConsumedQtyKg: 232.0, unitPricePerKg: 140.00, totalMaterialCost: 32480.00 },
      { id: "MAT-3", filmType: "Milky LD GP Film", micron: 40, widthMm: 1005, issueQtyKg: 580.0, returnQtyKg: 20.0, netConsumedQtyKg: 560.0, unitPricePerKg: 120.00, totalMaterialCost: 67200.00 },
      { id: "MAT-4", filmType: "Liquid Inks & Solvents", micron: "-", widthMm: "-", issueQtyKg: 33.0, returnQtyKg: 2.0, netConsumedQtyKg: 31.0, unitPricePerKg: 1500.00, totalMaterialCost: 46500.00 }
    ],
    totalProductionQtyKg: 1053.0,
    totalMaterialCostRs: 174930.00,
    processingCostRs: 28000.00,
    finalProductionCostRs: 202930.00,
    status: "Approved by Admin", // Fully Approved!
    filledBy: "Rajiv Malhotra (Plant Manager)",
    approvedBy: "Samyak Jain (Admin)",
    approvalDate: "2026-07-23 04:15 PM",
    notes: "QC approved and ready for dispatch."
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
export const initialInventoryRolls = [
  {
    barcodeId: "BC-20260724-001",
    rollType: "RAW_MATERIAL",
    itemId: "INV-001",
    itemName: "PET Film 12µ (1000mm)",
    category: "Film",
    jobName: "",
    orderId: "",
    micron: 12,
    widthMm: 1000,
    inwardDatetime: "2026-07-24 10:30 AM",
    vendorName: "SRF Limited",
    invoiceNo: "INV-SRF-9912",
    batchNo: "BATCH-PET-881A",
    netWeightKg: 1450.0,
    availableWeightKg: 1450.0,
    inputBarcodeIds: [],
    stationId: "SCALE_1_INWARD",
    locationBay: "Bay A - Rack 1",
    status: "In Stock"
  },
  {
    barcodeId: "BC-20260724-002",
    rollType: "RAW_MATERIAL",
    itemId: "INV-002",
    itemName: "METPET Film 12µ (1000mm)",
    category: "Film",
    jobName: "",
    orderId: "",
    micron: 12,
    widthMm: 1000,
    inwardDatetime: "2026-07-24 11:15 AM",
    vendorName: "Jindal Poly Films",
    invoiceNo: "INV-JPF-4410",
    batchNo: "BATCH-METPET-902",
    netWeightKg: 1200.0,
    availableWeightKg: 1200.0,
    inputBarcodeIds: [],
    stationId: "SCALE_1_INWARD",
    locationBay: "Bay A - Rack 2",
    status: "In Stock"
  },
  {
    barcodeId: "SFG-PRINT-20260724-001",
    rollType: "SFG_PRINTED",
    itemId: "SFG-001",
    itemName: "Britannia Bourbon 250g Printed Reel",
    category: "SFG",
    jobName: "Britannia Bourbon 250g Packaging",
    orderId: "ORD-2026-089",
    micron: 12,
    widthMm: 1000,
    inwardDatetime: "2026-07-24 02:45 PM",
    vendorName: "In-House Printing Press",
    invoiceNo: "INT-JOB-89",
    batchNo: "PRINT-LINE2-01",
    netWeightKg: 385.5,
    availableWeightKg: 385.5,
    inputBarcodeIds: ["BC-20260724-001"],
    stationId: "SCALE_2_PRINTING",
    locationBay: "WIP Printing Bay B",
    status: "In Stock"
  }
];

/**
 * Seed Dispatch Shipments & Packing Lists
 */
export const initialDispatchShipments = [
  {
    dispatchId: "DSP-2026-012",
    orderId: "ORD-2026-090",
    jobName: "P&G Ariel Matic 1kg Pouch",
    clientName: "Procter & Gamble India Ltd",
    vehicleNo: "MP-09-HH-4491",
    lrNo: "LR-99821-IND",
    dispatchDate: "2026-07-24 05:30 PM",
    totalRolls: 5,
    totalNetWeightKg: 1050.0,
    totalGrossWeightKg: 1072.5,
    items: [
      { rollNo: 1, barcodeId: "FG-DISP-20260724-01", substrateSpec: "PET 12µ / METPET 12µ / Milky LD 40µ", netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: "3 inch" },
      { rollNo: 2, barcodeId: "FG-DISP-20260724-02", substrateSpec: "PET 12µ / METPET 12µ / Milky LD 40µ", netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: "3 inch" },
      { rollNo: 3, barcodeId: "FG-DISP-20260724-03", substrateSpec: "PET 12µ / METPET 12µ / Milky LD 40µ", netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: "3 inch" },
      { rollNo: 4, barcodeId: "FG-DISP-20260724-04", substrateSpec: "PET 12µ / METPET 12µ / Milky LD 40µ", netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: "3 inch" },
      { rollNo: 5, barcodeId: "FG-DISP-20260724-05", substrateSpec: "PET 12µ / METPET 12µ / Milky LD 40µ", netWeightKg: 210.0, grossWeightKg: 214.5, coreSize: "3 inch" }
    ]
  }
];

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


