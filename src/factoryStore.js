// FactoryOS Data Store & Flexible Packaging Calculation Engine
// Samyak International Ltd, Indore

import { SEED_COMPANY_PROFILE, withCompanyTagline } from './services/companyProfile';
import { SYSTEM_ROLES } from './roles.js';

export { SYSTEM_ROLES };

export const COMPANY_DETAILS = withCompanyTagline({ ...SEED_COMPANY_PROFILE });



import { getFilmSubstrates } from './services/filmSubstratesService';
import { attendanceCalendarDate } from './services/employeeAttendance';

export const getFilmSubstrateMap = () => {
  const substrates = getFilmSubstrates();
  const map = {};
  if (Array.isArray(substrates)) {
    substrates.forEach(s => {
      if (s && s.name) {
        map[s.name] = parseFloat(s.density) || 1.40;
      }
    });
  }
  return map;
};

export const METALLOCENE_ELIGIBLE_FILMS = [
  'MATTA',
  'NMET',
  'MMET',
  'MGP',
  'NGP',
  'MILKY ATTA',
  'NATURAL METALLOCENE',
  'MILKY METALLOCENE',
  'MILKY GP',
  'NATURAL GP',
  'NATURAL LD GP FILM',
  'MILKY LD GP FILM',
  'NATURAL LD METALLOCENE FILM',
  'MILKY LD METALLOCENE FILM',
  'MILKY ATTA (HIGH DART) FILM'
];

export const METALLOCENE_OPTIONS = [
  '10%',
  '20%',
  '30%',
  '40%',
  '50%',
  '60%',
  '70%',
  '80%',
  '90%'
];

export const isMetalloceneEligibleFilm = (filmType = "") => {
  if (!filmType) return false;
  const str = String(filmType).trim().toUpperCase();
  return METALLOCENE_ELIGIBLE_FILMS.some(f => str === f || str.includes(f) || f.includes(str));
};

export const getFilmTypeCode = (filmType = "") => {
  if (!filmType) return "PET";
  const str = String(filmType).trim().toUpperCase();
  if (str.includes("MATTA") || str.includes("ATTA")) return "MATTA";
  if (str.includes("NMET") || (str.includes("NATURAL") && str.includes("METALLOCENE"))) return "NMET";
  if (str.includes("MMET") || (str.includes("MILKY") && str.includes("METALLOCENE"))) return "MMET";
  if (str.includes("MGP") || (str.includes("MILKY") && str.includes("GP"))) return "MGP";
  if (str.includes("NGP") || (str.includes("NATURAL") && str.includes("GP"))) return "NGP";
  
  let fType = str.replace(/[^A-Z0-9_-]/gi, '');
  return fType || "PET";
};

export const getFilmSubstrateDensity = (filmTypeStr) => {
  if (!filmTypeStr) return 1.40;
  const rawKey = String(filmTypeStr).trim();
  const currentMap = getFilmSubstrateMap();
  
  if (currentMap[rawKey] !== undefined) return currentMap[rawKey];
  
  const cleanKey = rawKey.toLowerCase();
  const matchingKey = Object.keys(currentMap).find(k => k.toLowerCase() === cleanKey);
  if (matchingKey) return currentMap[matchingKey];

  if (cleanKey.includes('pearl')) return 0.70;
  if (cleanKey.includes('alu') || cleanKey.includes('foil')) return 2.70;
  if (cleanKey.includes('pvc')) return 1.38;
  if (cleanKey.includes('pet')) return 1.40;
  if (cleanKey.includes('bopp')) return 0.91;
  if (cleanKey.includes('cpp')) return 0.91;
  if (cleanKey.includes('metallocene') || cleanKey.includes('nmet') || cleanKey.includes('mmet')) return 0.935;
  if (cleanKey.includes('atta') || cleanKey.includes('matta') || cleanKey.includes('lldpe')) return 0.94;
  if (cleanKey.includes('ld') || cleanKey.includes('pe') || cleanKey.includes('mgp') || cleanKey.includes('ngp')) return 0.93;
  if (cleanKey.includes('paper')) return 0.80;

  return 1.40;
};

// Proxy to make FILM_DENSITIES dynamically reflect system settings without breaking Object.keys() or property lookups
export const FILM_DENSITIES = new Proxy({}, {
  get(target, prop) {
    if (prop === 'then' || typeof prop === 'symbol') return undefined;
    return getFilmSubstrateDensity(prop);
  },
  ownKeys() {
    return Object.keys(getFilmSubstrateMap());
  },
  getOwnPropertyDescriptor(target, prop) {
    const currentMap = getFilmSubstrateMap();
    if (prop in currentMap) {
      return {
        enumerable: true,
        configurable: true,
        value: currentMap[prop]
      };
    }
    return undefined;
  }
});

export const calculateFilmRollLength = (netWeightKg, widthMm, micronGauge, filmTypeStr) => {
  const wt = parseFloat(netWeightKg);
  const w = parseFloat(widthMm);
  const m = parseFloat(micronGauge);
  const density = getFilmSubstrateDensity(filmTypeStr);

  if (!isNaN(wt) && wt > 0 && !isNaN(w) && w > 0 && !isNaN(m) && m > 0 && density > 0) {
    // Formula: Length (Meters) = (NetWeight_kg * 1,000,000) / (Width_mm * Micron * Density_g_cc)
    return Math.round((wt * 1000000) / (w * m * density));
  }
  return '';
};

export const DEFAULT_DAILY_RATES = {
  "PET": 125,
  "METPET": 140,
  "MATTA": 138,
  "NMET": 128,
  "MMET": 132,
  "MGP": 120,
  "NGP": 115,
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
 */
export const isLDFilm = (filmType = "") => {
  if (!filmType) return false;
  const LD_FILMS_WITH_EXTRA_WIDTH = [
    'matta',
    'nmet',
    'mmet',
    'mgp',
    'ngp',
    'natural ld gp film',
    'milky ld gp film',
    'natural ld metallocene film',
    'milky ld metallocene film',
    'milky atta (high dart) film'
  ];
  const str = filmType.toLowerCase().trim();
  return LD_FILMS_WITH_EXTRA_WIDTH.some(f => str === f || str.includes(f) || f.includes(str));
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
  adhesiveWeightGainPct: 100,
  conversionChargesPerKg: 45, // Rs. 45/kg default factory conversion charges
  fixedProfitPerKg: 25        // Rs. 25/kg default fixed profit margin
};

/**
 * Calculates wastage percentage based on order quantity and process type
 */
export const getWastagePercentage = (orderQtyKg, isPouching = false) => {
  const qty = parseFloat(orderQtyKg) || 0;
  if (qty >= 2000) return isPouching ? 5.0 : 4.5;
  if (qty >= 1000) return isPouching ? 6.0 : 5.0;
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
  adhesivePrice = 270,
  conversionChargesPerKg = 0,
  fixedProfitPerKg = 0
}) => {
  const isPouching = orderType === "Pouching" || String(orderType).toLowerCase().includes('pouch');
  const wastagePct = getWastagePercentage(orderQtyKg, isPouching);

  // 1. Calculate effective GSM for each film layer based on custom layer width
  const calculatedLayers = layers.map((layer) => {
    const density = FILM_DENSITIES[layer.filmType] || layer.density || 1.0;
    const micron = parseFloat(layer.micron) || 0;
    const printWidth = parseFloat(printWidthMm) || 1000;
    const layerIsLD = isLDFilm(layer.filmType);
    const layerWidthMm = (layer.widthMm !== undefined && layer.widthMm !== '' && !isNaN(parseFloat(layer.widthMm)))
      ? parseFloat(layer.widthMm)
      : (layer.width !== undefined && layer.width !== '' && !isNaN(parseFloat(layer.width))
        ? parseFloat(layer.width)
        : (layer.filmWidth !== undefined && layer.filmWidth !== '' && !isNaN(parseFloat(layer.filmWidth))
          ? parseFloat(layer.filmWidth)
          : getFilmSlitWidth(layer.filmType, printWidth)));

    const baseGsm = micron * density; // g/m² of base film sheet
    const gsm = printWidth > 0 ? baseGsm * (layerWidthMm / printWidth) : baseGsm; // effective g/m² in laminate

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
      baseGsm,
      gsm,
      widthMm: layerWidthMm,
      isLDFilm: layerIsLD,
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

    return {
      ...l,
      isLDFilm: l.isLDFilm,
      widthMm: l.widthMm,
      gsm: parseFloat(l.gsm.toFixed(2)),
      baseGsm: parseFloat(l.baseGsm.toFixed(2)),
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
  const costPerKg = orderQtyKg > 0 ? parseFloat((totalRawMaterialCost / orderQtyKg).toFixed(2)) : 0;
  const wastageKg = Math.round(totalFilmGrossKg - totalFilmNetKg);

  // 5. Derive Minimum Selling Price/kg: Raw Material Cost + Conversion Charges + Fixed Profit
  const convPerKg = parseFloat(conversionChargesPerKg) || 0;
  const profitPerKg = parseFloat(fixedProfitPerKg) || 0;
  const rawMaterialCostPerKg = costPerKg;
  const minSellingPricePerKg = parseFloat((rawMaterialCostPerKg + convPerKg + profitPerKg).toFixed(2));
  const totalConversionCost = Math.round(convPerKg * orderQtyKg);
  const totalFixedProfit = Math.round(profitPerKg * orderQtyKg);
  const totalMinSellingAmount = Math.round(minSellingPricePerKg * orderQtyKg);

  return {
    jobName,
    printWidthMm,
    repeatLengthMm,
    orderQtyKg,
    orderType,
    wastagePct,
    wastageKg,
    totalCost: totalRawMaterialCost,
    totalRawMaterialCost,
    rawMaterialCostPerKg,
    costPerKg,
    conversionChargesPerKg: convPerKg,
    fixedProfitPerKg: profitPerKg,
    minSellingPricePerKg,
    totalConversionCost,
    totalFixedProfit,
    totalMinSellingAmount,
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
      costPerKg,
      rawMaterialCostPerKg,
      conversionChargesPerKg: convPerKg,
      fixedProfitPerKg: profitPerKg,
      minSellingPricePerKg,
      totalConversionCost,
      totalFixedProfit,
      totalMinSellingAmount,
      wastagePct,
      wastageKg
    }
  };
};

/**
 * Universal Raw Material Requirements Extractor for an Order
 */
export const getOrderMaterialRequirements = (order, jobMasters = []) => {
  if (!order) return [];
  if (order.isCylinderOrder || order.orderType === 'Rotogravure Cylinder' || order.materialFormat === 'Rotogravure Cylinder' || (order.jobName || '').toLowerCase().includes('cylinder')) {
    return [];
  }

  const existing = order.materialRequirements || order.rawMaterialRequirements;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }

  const jm = (jobMasters || []).find(j =>
    (order?.jobMasterId && (j.id === order.jobMasterId || j.jobMasterId === order.jobMasterId)) ||
    ((j.jobName || '').toLowerCase().trim() === (order?.jobName || '').toLowerCase().trim())
  );

  // 1. Order's own locked layers / structure
  let layers = order?.layers || order?.jobDetails?.layers;
  const orderStructStr = (order?.structure || order?.jobDetails?.structure || '');

  if (!layers || layers.length === 0) {
    if (orderStructStr && orderStructStr !== 'PET / PE' && orderStructStr !== '—') {
      const parts = orderStructStr.split('/').map(p => p.trim());
      layers = parts.map(part => {
        const micronMatch = part.match(/(\d+(\.\d+)?)\s*µ?/i);
        const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
        let filmType = part.replace(/(\d+(\.\d+)?)\s*µ?/gi, '').trim();
        if (!filmType) filmType = 'PET';
        return { filmType, micron };
      });
    }
  }

  // 2. Fallback to Job Master layers / structure if order has no explicit structure
  if (!layers || layers.length === 0) {
    layers = jm?.layers;
    const jmStructStr = jm?.structure || '';
    if ((!layers || layers.length === 0) && jmStructStr && jmStructStr !== 'PET / PE' && jmStructStr !== '—') {
      const parts = jmStructStr.split('/').map(p => p.trim());
      layers = parts.map(part => {
        const micronMatch = part.match(/(\d+(\.\d+)?)\s*µ?/i);
        const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
        let filmType = part.replace(/(\d+(\.\d+)?)\s*µ?/gi, '').trim();
        if (!filmType) filmType = 'PET';
        return { filmType, micron };
      });
    }
  }

  if (!layers || layers.length === 0) {
    layers = [
      { filmType: 'PET', micron: 12 },
      { filmType: 'Natural GP LD', micron: 35 }
    ];
  }

  const getMaterialForm = (o) => {
    const type = (o?.orderType || o?.materialFormat || '').toLowerCase();
    if (type.includes('pouch') || type.includes('zipper') || type.includes('stand')) return 'Pouching';
    return 'Reel';
  };

  const calc = calculateJobRawMaterials({
    jobName: order?.jobName || 'Job',
    printWidthMm: parseFloat(order?.printWidthMm || jm?.printWidthMm) || 1000,
    repeatLengthMm: parseFloat(order?.repeatLengthMm || jm?.repeatLengthMm) || 400,
    orderQtyKg: parseFloat(order?.orderQtyKg) || 1000,
    orderType: getMaterialForm(order),
    layers
  });

  const reqs = [];
  if (calc && calc.layerResults) {
    calc.layerResults.forEach((layer, idx) => {
      reqs.push({
        id: `REQ-${order?.id || 'ORD'}-${idx + 1}`,
        filmType: layer.filmType,
        micron: layer.micron,
        widthMm: layer.widthMm || parseFloat(order?.printWidthMm || jm?.printWidthMm) || 1000,
        qtyKg: layer.grossKg || 0,
        preferredVendor: (layer.filmType || '').toLowerCase().includes('ld') ? 'Malwa Extrusions Pvt Ltd' : 'FlexiPoly Films Ltd',
        poIssued: false,
        poNumber: ""
      });
    });

    if (calc.inkDetails && calc.inkDetails.grossKg > 0) {
      reqs.push({
        id: `REQ-${order?.id || 'ORD'}-${reqs.length + 1}`,
        filmType: 'Liquid Inks',
        micron: '-',
        widthMm: '-',
        qtyKg: calc.inkDetails.grossKg,
        preferredVendor: 'Siegwerk Inks Ltd',
        poIssued: false,
        poNumber: ""
      });
    }

    if (calc.adhesiveDetails && calc.adhesiveDetails.grossKg > 0) {
      reqs.push({
        id: `REQ-${order?.id || 'ORD'}-${reqs.length + 1}`,
        filmType: 'Solvent-less Adhesive',
        micron: '-',
        widthMm: '-',
        qtyKg: calc.adhesiveDetails.grossKg,
        preferredVendor: 'Siegwerk Inks Ltd',
        poIssued: false,
        poNumber: ""
      });
    }
  }

  return reqs;
};

/**
 * Universal Matcher for Material Requirement against Inventory Items
 */
export const matchRequirementToInventoryItem = (req, inventory = []) => {
  if (!req || !Array.isArray(inventory)) return null;

  const reqId = String(req.stockItemId || req.itemId || req.inventoryId || '');
  const reqFilm = (req.filmType || req.itemName || '').toLowerCase().trim();
  const reqMicron = String(req.micron || '').replace('µ', '').trim();
  const reqWidth = String(req.widthMm || '').replace('mm', '').trim();

  const isReqMetpet = reqFilm.includes('metpet') || reqFilm.includes('met-pet');
  const isReqMetbopp = reqFilm.includes('metbopp') || reqFilm.includes('met-bopp');

  return inventory.find(inv => {
    // 1. Direct ID / Code match
    if (reqId && (String(inv.id) === reqId || String(inv.itemCode) === reqId)) return true;

    // Check subItems if any
    const candidates = inv.subItems && inv.subItems.length > 0 ? [inv, ...inv.subItems] : [inv];

    return candidates.some(c => {
      const invId = String(c.id || c.itemCode || '');
      if (reqId && invId === reqId) return true;

      const invFilm = (c.filmType || c.itemName || '').toLowerCase().trim();
      const invMicron = String(c.micron || '').replace('µ', '').trim();
      const invWidth = String(c.widthMm || '').replace('mm', '').trim();

      const isInvMetpet = invFilm.includes('metpet') || invFilm.includes('met-pet');
      const isInvMetbopp = invFilm.includes('metbopp') || invFilm.includes('met-bopp');

      // Substrate differentiation: Plain PET vs METPET, Plain BOPP vs METBOPP
      if (isReqMetpet !== isInvMetpet) return false;
      if (isReqMetbopp !== isInvMetbopp) return false;

      // Film substrate matching
      const filmMatch = invFilm === reqFilm || 
                        invFilm.includes(reqFilm) || reqFilm.includes(invFilm) || 
                        (reqFilm.includes('pet') && invFilm.includes('pet')) ||
                        (reqFilm.includes('metpet') && invFilm.includes('metpet')) ||
                        (reqFilm.includes('ld') && invFilm.includes('ld')) ||
                        (reqFilm.includes('poly') && invFilm.includes('poly')) ||
                        (reqFilm.includes('bopp') && invFilm.includes('bopp')) ||
                        (reqFilm.includes('ink') && invFilm.includes('ink')) ||
                        (reqFilm.includes('adhesive') && invFilm.includes('adhesive'));

      if (!filmMatch) return false;

      const micronMatch = !reqMicron || reqMicron === '-' || !invMicron || invMicron === '-' || 
                          invMicron === reqMicron || Math.abs((parseFloat(invMicron) || 0) - (parseFloat(reqMicron) || 0)) <= 0.5;

      const widthMatch = !reqWidth || reqWidth === '-' || !invWidth || invWidth === '-' || 
                         invWidth === reqWidth || Math.abs((parseFloat(invWidth) || 0) - (parseFloat(reqWidth) || 0)) <= 2;

      return micronMatch && widthMatch;
    });
  }) || null;
};

/**
 * Multi-Order Coordinated Stock Checking & Material Reservation Engine
 * Tracks live stock pools across all active orders and allocates stock sequentially.
 */
export const calculateOrderStockReservations = (orders = [], inventory = [], jobMasters = []) => {
  // Pool of available stock per inventory item
  const pool = {};
  (inventory || []).forEach(item => {
    const qty = Number(item.availableQtyKg ?? item.stockQtyKg ?? item.stock_qty_kg ?? 0) || 0;
    const itemIdStr = String(item.id);
    pool[itemIdStr] = {
      item,
      totalStockKg: qty,
      remainingStockKg: qty,
      totalReservedKg: 0,
      reservations: [] // array of { orderId, order, reqId, req, grossReqKg, reservedKg, balanceKg, isFullyReserved }
    };
  });

  const reqStockInfoMap = {};

  // Active orders sorted chronologically by delivery commitment
  const activeOrders = (orders || []).filter(o => 
    o && o.status !== 'Completed' && o.status !== 'Cancelled'
  );

  activeOrders.sort((a, b) => {
    const dateA = a.targetDeliveryDate || a.deliveryDate || '9999-99-99';
    const dateB = b.targetDeliveryDate || b.deliveryDate || '9999-99-99';
    return dateA.localeCompare(dateB);
  });

  activeOrders.forEach(order => {
    const reqs = getOrderMaterialRequirements(order, jobMasters);
    reqs.forEach((req, idx) => {
      const reqQty = parseFloat(req.qtyKg) || 0;
      const matchedInv = matchRequirementToInventoryItem(req, inventory);
      const reqKey = req.id || `REQ-${order.id}-${idx}`;

      if (!matchedInv || reqQty <= 0) {
        reqStockInfoMap[reqKey] = {
          reqQty,
          totalInStock: 0,
          reservedKg: 0,
          balanceKg: reqQty,
          isFullyAvailable: false,
          isPartiallyAvailable: false,
          matchedItemId: null,
          matchedItem: null,
          poStatus: req.poIssued ? 'PO Issued' : 'Pending PO'
        };
        return;
      }

      const invKey = String(matchedInv.id);
      const poolEntry = pool[invKey];
      const availForThis = poolEntry ? poolEntry.remainingStockKg : 0;
      const reservedKg = Math.min(reqQty, availForThis);
      const balanceKg = Math.max(0, Number((reqQty - reservedKg).toFixed(2)));
      const isFullyAvailable = reservedKg >= reqQty;
      const isPartiallyAvailable = reservedKg > 0 && reservedKg < reqQty;

      if (poolEntry) {
        poolEntry.remainingStockKg = Math.max(0, Number((poolEntry.remainingStockKg - reservedKg).toFixed(2)));
        poolEntry.totalReservedKg = Number((poolEntry.totalReservedKg + reservedKg).toFixed(2));

        if (reservedKg > 0) {
          poolEntry.reservations.push({
            orderId: order.id,
            order,
            reqId: reqKey,
            req,
            grossReqKg: reqQty,
            reservedKg,
            balanceKg,
            isFullyReserved: isFullyAvailable,
            isPartiallyReserved: isPartiallyAvailable,
            poStatus: req.poIssued ? 'PO Issued' : (isFullyAvailable ? 'PO Not Required' : 'Pending PO')
          });
        }
      }

      reqStockInfoMap[reqKey] = {
        reqQty,
        totalInStock: poolEntry ? poolEntry.totalStockKg : 0,
        reservedKg,
        balanceKg,
        isFullyAvailable,
        isPartiallyAvailable,
        matchedItemId: matchedInv.id,
        matchedItem: matchedInv,
        poStatus: req.poIssued ? 'PO Issued' : (isFullyAvailable ? 'PO Not Required' : 'Pending PO')
      };
    });
  });

  return {
    pool,
    reqStockInfoMap,
    getReqStockInfo: (req, orderId) => {
      if (!req) return { reqQty: 0, totalInStock: 0, reservedKg: 0, balanceKg: 0, isFullyAvailable: false, isPartiallyAvailable: false, poStatus: 'Pending PO' };
      const reqKey = req.id || (orderId ? `REQ-${orderId}-${req.filmType}` : null);
      if (reqKey && reqStockInfoMap[reqKey]) {
        return reqStockInfoMap[reqKey];
      }
      const matched = matchRequirementToInventoryItem(req, inventory);
      if (!matched) {
        return {
          reqQty: parseFloat(req.qtyKg) || 0,
          totalInStock: 0,
          reservedKg: 0,
          balanceKg: parseFloat(req.qtyKg) || 0,
          isFullyAvailable: false,
          isPartiallyAvailable: false,
          poStatus: req.poIssued ? 'PO Issued' : 'Pending PO'
        };
      }
      const entry = pool[String(matched.id)];
      const reqQty = parseFloat(req.qtyKg) || 0;
      const totalInStock = entry ? entry.totalStockKg : (Number(matched.availableQtyKg) || 0);
      const reservedKg = Math.min(reqQty, entry ? entry.remainingStockKg : totalInStock);
      const isFully = reservedKg >= reqQty;
      return {
        reqQty,
        totalInStock,
        reservedKg,
        balanceKg: Math.max(0, Number((reqQty - reservedKg).toFixed(2))),
        isFullyAvailable: isFully,
        isPartiallyAvailable: reservedKg > 0 && reservedKg < reqQty,
        matchedItemId: matched.id,
        matchedItem: matched,
        poStatus: req.poIssued ? 'PO Issued' : (isFully ? 'PO Not Required' : 'Pending PO')
      };
    }
  };
};

/**
 * Seed Users & Role-Based Access Control (RBAC)
 */
// PRODUCTION: No seed users. All user accounts come from Supabase Auth / DB.
export const initialUsers = [];

/**
 * Seed Shop Floor Actual Job Data Sheets
 */
// PRODUCTION: No seed job datasheets.
export const initialJobDataSheets = [];

/**
 * Pre-Costing vs Post-Costing Variance & Profitability Calculator
 */
export const calculatePreVsPostCosting = (preCosting = {}, actualData = {}) => {
  const sellingPricePerKg = parseFloat(actualData.sellingPricePerKg) || parseFloat(preCosting.sellingPricePerKg) || 0;
  const orderQtyKg = parseFloat(preCosting.orderQtyKg) || parseFloat(actualData.orderQtyKg) || parseFloat(actualData.totalProductionQtyKg) || 0;

  // Estimated Raw Material Cost (Pre-Costing)
  const estTotalCost = parseFloat(preCosting.summary?.totalRawMaterialCost) || parseFloat(preCosting.summary?.grandTotalCost) || parseFloat(preCosting.grandTotalCost) || parseFloat(preCosting.totalCost) || 0;
  const estCostPerKg = orderQtyKg > 0 && estTotalCost > 0 ? (estTotalCost / orderQtyKg) : 0;

  // Actual Consumed Quantities (Post-Costing)
  let actualFilmCost = 0;
  let actualFilmGrossKg = 0;

  if (preCosting.layerResults && actualData.actualFilmConsumedKg) {
    preCosting.layerResults.forEach((layer, idx) => {
      const key = `Layer ${idx + 1} (${layer.filmType} ${layer.micron}µ)`;
      const actualKg = parseFloat(actualData.actualFilmConsumedKg[key]) || layer.grossKg || 0;
      actualFilmGrossKg += actualKg;
      actualFilmCost += actualKg * (layer.pricePerKg || 0);
    });
  } else {
    actualFilmGrossKg = parseFloat(actualData.actualFilmGrossKg) || preCosting.summary?.totalFilmGrossKg || 0;
    actualFilmCost = parseFloat(actualData.actualFilmCost) || (actualFilmGrossKg * (preCosting.summary?.avgFilmRate || 0));
  }

  const actualInkKg = parseFloat(actualData.actualInkConsumedKg) || preCosting.inkDetails?.grossKg || 0;
  const actualInkPrice = parseFloat(actualData.actualInkPrice) || preCosting.inkDetails?.pricePerKg || 0;
  const actualInkCost = parseFloat(actualData.actualInkCost) || (actualInkKg * actualInkPrice);

  const actualSolventKg = parseFloat(actualData.actualSolventsConsumedKg) || 0;
  const actualSolventPrice = parseFloat(actualData.actualSolventPrice) || 0;
  const actualSolventCost = parseFloat(actualData.actualSolventCost) || (actualSolventKg * actualSolventPrice);

  const actualAdhesiveKg = parseFloat(actualData.actualAdhesiveConsumedKg) || preCosting.adhesiveDetails?.grossKg || 0;
  const actualAdhesivePrice = parseFloat(actualData.actualAdhesivePrice) || preCosting.adhesiveDetails?.pricePerKg || 0;
  const actualAdhesiveCost = parseFloat(actualData.actualAdhesiveCost) || (actualAdhesiveKg * actualAdhesivePrice);

  const actualTotalCost = parseFloat(actualData.totalProductionCostRs) || Math.round(actualFilmCost + actualInkCost + actualSolventCost + actualAdhesiveCost);
  const actualCostPerKg = orderQtyKg > 0 ? (actualTotalCost / orderQtyKg).toFixed(2) : 0;

  // Variances
  const costVariance = estTotalCost > 0 ? actualTotalCost - estTotalCost : 0; // Positive = Over budget
  const costVariancePct = estTotalCost > 0 ? ((costVariance / estTotalCost) * 100).toFixed(1) : 0;

  // Profitability
  const totalGrossRevenue = sellingPricePerKg > 0 && orderQtyKg > 0 ? Math.round(orderQtyKg * sellingPricePerKg) : 0;
  const estGrossProfit = totalGrossRevenue > 0 && estTotalCost > 0 ? Math.round(totalGrossRevenue - estTotalCost) : 0;
  const estProfitMarginPct = totalGrossRevenue > 0 && estTotalCost > 0 ? ((estGrossProfit / totalGrossRevenue) * 100).toFixed(1) : 0;

  const actualGrossProfit = totalGrossRevenue > 0 && actualTotalCost > 0 ? Math.round(totalGrossRevenue - actualTotalCost) : 0;
  const actualProfitMarginPct = totalGrossRevenue > 0 && actualTotalCost > 0 ? ((actualGrossProfit / totalGrossRevenue) * 100).toFixed(1) : 0;

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
 * Helper to compute real-time SFG/FG production stage for a given job order:
 * Matches live sfgGoods and productionRecords.
 * Returns:
 * - stage: Current stage string ('Pre-Production', 'Printing (Pass 1)', 'Lamination (Pass 1)', 'Lamination (Pass 2)', 'Slitting & Rewinding', 'Pouching / Bag Making', 'Ready for Dispatch', 'Partially Dispatched', 'Dispatched')
 * - stageIndex: 0 (Pre-Production) to 5 (Dispatched)
 * - stageLabel: Human-friendly text with icon
 * - badgeStyle: { background, color, border }
 * - activeLots: Matched live SFG/FG lots
 * - totalAvailableKg: Total live available SFG + FG
 * - fgAvailableKg: Available Finished Goods kg
 * - sfgAvailableKg: Available Semi-Finished Goods kg
 * - totalDispatchedKg: Dispatched kg
 * - pipeline: Array of { id, label, isCompleted, isCurrent, isUpcoming } for progress track visualization
 */
export const getOrderStageInfo = (order, sfgGoods = [], productionRecords = []) => {
  if (!order) {
    return {
      stage: 'Pre-Production',
      stageIndex: 0,
      stageLabel: 'Pre-Production',
      badgeStyle: { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' },
      activeLots: [],
      totalAvailableKg: 0,
      fgAvailableKg: 0,
      sfgAvailableKg: 0,
      totalDispatchedKg: 0,
      totalSfgLotsCount: 0,
      pipeline: []
    };
  }

  // Handle Cylinder Orders
  if (order.isCylinderOrder || order.orderType === 'Rotogravure Cylinder' || order.materialFormat === 'Rotogravure Cylinder') {
    const isCompleted = order.status === 'Completed';
    const isEngraved = order.status === 'Received In Factory' || isCompleted;
    const isPoIssued = !!(order.poIssued || order.poNumber || order.engraverPoNo);
    
    let stage = 'Pending Engraver PO';
    let stageIndex = 0;
    let badgeStyle = { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' };

    if (isCompleted) {
      stage = 'Received in Factory';
      stageIndex = 5;
      badgeStyle = { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
    } else if (isEngraved) {
      stage = 'Cylinder Inwarded';
      stageIndex = 4;
      badgeStyle = { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' };
    } else if (isPoIssued) {
      stage = 'Under Engraving';
      stageIndex = 2;
      badgeStyle = { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
    }

    const pipeline = [
      { id: 'punching', label: 'Order Punch', stepNum: 0, isCompleted: true, isCurrent: stageIndex === 0, isUpcoming: false },
      { id: 'po', label: 'Engraver PO', stepNum: 1, isCompleted: isPoIssued || isCompleted, isCurrent: stageIndex === 1, isUpcoming: !isPoIssued },
      { id: 'engraving', label: 'Engraving', stepNum: 2, isCompleted: isEngraved || isCompleted, isCurrent: stageIndex === 2, isUpcoming: !isPoIssued },
      { id: 'inward', label: 'Inward GRN', stepNum: 3, isCompleted: isCompleted, isCurrent: stageIndex === 4, isUpcoming: !isEngraved },
      { id: 'ready', label: 'Plant Ready', stepNum: 4, isCompleted: isCompleted, isCurrent: stageIndex === 5, isUpcoming: !isCompleted }
    ];

    return {
      stage,
      stageIndex,
      stageLabel: stage,
      badgeStyle,
      activeLots: [],
      totalAvailableKg: 0,
      fgAvailableKg: 0,
      sfgAvailableKg: 0,
      totalDispatchedKg: 0,
      totalSfgLotsCount: 0,
      pipeline
    };
  }

  const cleanId = (id) => String(id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
  const cleanStr = (s) => String(s || '').trim().toLowerCase();

  const oId = cleanId(order.id);
  const oJobCode = cleanStr(order.jobCode);
  const oJobName = cleanStr(order.jobName);

  const isMatch = (item) => {
    if (!item) return false;
    const itemId = cleanId(item.orderId || item.order_id);
    const itemJobCode = cleanStr(item.jobCode || item.job_code);
    const itemJobName = cleanStr(item.jobName || item.job_name);
    const itemBatch = cleanStr(item.sfgBatchCode || item.barcodeId || item.barcode || item.id);

    return (oId && itemId && itemId === oId) ||
           (oId && itemBatch && itemBatch.includes(oId)) ||
           (oJobCode && itemJobCode && itemJobCode === oJobCode) ||
           (oJobName && itemJobName && (itemJobName === oJobName || itemJobName.includes(oJobName) || oJobName.includes(itemJobName)));
  };

  const matchedSfg = (sfgGoods || []).filter(isMatch);
  const matchedRecs = (productionRecords || []).filter(isMatch);

  // Analyze active lots and weights
  let totalAvailableKg = 0;
  let fgAvailableKg = 0;
  let sfgAvailableKg = 0;
  let totalDispatchedKg = 0;

  const activeLots = matchedSfg.map(item => {
    const isFg = item.rollType === 'FG' || (item.sfgType || '').includes('Finished') || (item.category || '').includes('Finished') || (item.sfgBatchCode || '').startsWith('FG-');
    const netKg = Number(item.totalNetKg ?? item.netWeightKg ?? 0) || 0;
    const consumedKg = Number(item.consumedKg ?? 0) || 0;
    const dispatchedKg = Number(item.dispatchedKg ?? 0) || 0;
    const availKg = item.availableKg !== undefined 
      ? Number(item.availableKg) 
      : Math.max(0, netKg - consumedKg - dispatchedKg);

    totalAvailableKg += availKg;
    totalDispatchedKg += dispatchedKg;
    if (isFg) {
      fgAvailableKg += availKg;
    } else {
      sfgAvailableKg += availKg;
    }

    return {
      id: item.id || item.sfgBatchCode,
      sfgBatchCode: item.sfgBatchCode || item.id,
      stage: item.stage || (isFg ? 'Finished Goods (FG)' : (item.sfgType || 'Printed Rolls')),
      rollType: isFg ? 'FG' : 'SFG',
      availableKg: availKg,
      totalNetKg: netKg,
      dispatchedKg: dispatchedKg,
      storageBay: item.storageBay || (isFg ? 'FG Warehouse' : 'SFG Store'),
      status: item.status || (availKg <= 0 && dispatchedKg > 0 ? 'Dispatched' : (isFg ? 'Ready for Dispatch' : 'In Stock (WIP)'))
    };
  });

  // Calculate highest stage reached
  let currentStage = 'Pre-Production';
  let stageIndex = 0;

  const orderQtyKg = Number(order.orderQtyKg || 0);

  // Check from highest to lowest:
  // 1. Fully Dispatched
  const isOrderCompleted = order.status === 'Completed';
  const isFullyDispatched = (orderQtyKg > 0 && totalDispatchedKg >= orderQtyKg) || 
    (matchedSfg.length > 0 && totalDispatchedKg > 0 && totalAvailableKg === 0 && matchedSfg.every(s => s.status === 'Dispatched' || s.status === 'Fully Consumed'));

  if (isOrderCompleted || isFullyDispatched) {
    currentStage = 'Dispatched';
    stageIndex = 5;
  } else if (totalDispatchedKg > 0) {
    currentStage = 'Partially Dispatched';
    stageIndex = 5;
  } else if (fgAvailableKg > 0 || matchedSfg.some(s => s.rollType === 'FG' || s.status === 'Ready for Dispatch' || (s.sfgBatchCode || '').startsWith('FG-'))) {
    currentStage = 'Ready for Dispatch';
    stageIndex = 4;
  } else if (
    matchedSfg.some(s => (s.stage || '').includes('Pouching') || (s.sfgType || '').includes('Pouch')) ||
    matchedRecs.some(r => (parseFloat(r.qtyPouching) > 0 || (r.stages?.pouching?.pouchCount > 0)))
  ) {
    currentStage = 'Pouching / Bag Making';
    stageIndex = 4;
  } else if (
    matchedSfg.some(s => (s.stage || '').includes('Slitting') || (s.sfgType || '').includes('Slit')) ||
    matchedRecs.some(r => (parseFloat(r.qtySlitting) > 0 || r.stages?.slitting))
  ) {
    currentStage = 'Slitting & Rewinding';
    stageIndex = 3;
  } else if (
    matchedSfg.some(s => (s.stage || '').includes('Lamination (Pass 2)')) ||
    matchedRecs.some(r => parseFloat(r.qtySecondPassL2) > 0)
  ) {
    currentStage = 'Lamination (Pass 2)';
    stageIndex = 2;
  } else if (
    matchedSfg.some(s => (s.stage || '').includes('Lamination')) ||
    matchedRecs.some(r => parseFloat(r.qtyLaminationL1) > 0 || r.stages?.lamination)
  ) {
    currentStage = 'Lamination (Pass 1)';
    stageIndex = 2;
  } else if (
    matchedSfg.some(s => (s.stage || '').includes('Printing') || (s.sfgType || '').includes('Printed')) ||
    matchedRecs.some(r => parseFloat(r.qtyFirstPassL1) > 0 || r.stages?.printing || (r.outputRolls || []).length > 0)
  ) {
    currentStage = 'Printing (Pass 1)';
    stageIndex = 1;
  } else {
    currentStage = 'Pre-Production';
    stageIndex = 0;
  }

  // Assign Badge Styles & Icons
  let stageLabel = currentStage;
  let badgeStyle = { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };

  switch (currentStage) {
    case 'Dispatched':
      stageLabel = '🏁 Dispatched';
      badgeStyle = { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
      break;
    case 'Partially Dispatched':
      stageLabel = `🚚 Partially Dispatched (${totalDispatchedKg.toFixed(0)}kg)`;
      badgeStyle = { background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4' };
      break;
    case 'Ready for Dispatch':
      stageLabel = `📦 Ready for Dispatch (${fgAvailableKg > 0 ? fgAvailableKg.toFixed(0) + 'kg' : 'FG Stock'})`;
      badgeStyle = { background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' };
      break;
    case 'Pouching / Bag Making':
      stageLabel = '🛍️ Pouching / Bag Making';
      badgeStyle = { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' };
      break;
    case 'Slitting & Rewinding':
      stageLabel = '✂️ Slitting & Rewinding';
      badgeStyle = { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
      break;
    case 'Lamination (Pass 2)':
      stageLabel = '🥞 Lamination (Pass 2 - Triplex)';
      badgeStyle = { background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' };
      break;
    case 'Lamination (Pass 1)':
      stageLabel = '🥞 Lamination (Pass 1)';
      badgeStyle = { background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' };
      break;
    case 'Printing (Pass 1)':
      stageLabel = '🖨️ Printing (Pass 1)';
      badgeStyle = { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' };
      break;
    default:
      stageLabel = '📋 Pre-Production';
      badgeStyle = { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' };
      break;
  }

  // Build standard multi-stage pipeline definition
  const standardSteps = [
    { id: 'planning', label: 'Planning', stepNum: 0 },
    { id: 'printing', label: 'Printing', stepNum: 1 },
    { id: 'lamination', label: 'Lamination', stepNum: 2 },
    { id: 'slitting', label: 'Slitting', stepNum: 3 },
    { id: 'pouching_fg', label: 'Pouching / FG', stepNum: 4 },
    { id: 'dispatch', label: 'Dispatch', stepNum: 5 }
  ];

  const pipeline = standardSteps.map(step => {
    const isCompleted = stageIndex > step.stepNum || (stageIndex === 5 && step.stepNum === 5);
    const isCurrent = stageIndex === step.stepNum && stageIndex !== 5;
    const isUpcoming = stageIndex < step.stepNum;
    return {
      ...step,
      isCompleted,
      isCurrent,
      isUpcoming
    };
  });

  return {
    stage: currentStage,
    stageIndex,
    stageLabel,
    badgeStyle,
    activeLots,
    totalAvailableKg,
    fgAvailableKg,
    sfgAvailableKg,
    totalDispatchedKg,
    totalSfgLotsCount: matchedSfg.length,
    pipeline
  };
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

// PRODUCTION: No seed inks. All ink masters come from Supabase DB.
export const initialInks = [];

export const ALL_MODULES = [
  { key: "dashboard", label: "Executive Dashboard", category: "Core Operations" },
  { key: "production_records", label: "Production Records & Sign-Off", category: "Shop Floor & Quality" },
  { key: "sfg_store", label: "SFG / FG Store", category: "Shop Floor & Quality" },
  { key: "sales", label: "Sales & Quotations Engine", category: "Sales & Commercial" },
  { key: "job_punching", label: "Job Punching & Costing", category: "Pre-Press & Estimation" },
  { key: "orders", label: "Order Management & POs", category: "Core Operations" },
  { key: "clients", label: "Clients & Directory", category: "Commercial" },
  { key: "job_masters", label: "Job Master Directory", category: "Pre-Press & Master Specs" },
  { key: "vendors", label: "Vendor Onboarding & POs", category: "Purchase & Commercial" },
  { key: "purchase_orders", label: "Purchase Orders Management", category: "Purchase & Commercial" },
  { key: "inventory", label: "Inventory, GRN & QC", category: "Store & Inventory" },
  { key: "ink_management", label: "Ink Management & Solid Costing", category: "Store & Inventory" },
  { key: "material_indents", label: "Material Indents & Store", category: "Store & Inventory" },
  { key: "pellet_fuel", label: "Pellet Fuel Stock & Consumption", category: "Store & Inventory" },
  { key: "barcodes", label: "Barcodes", category: "Store & Inventory" },
  { key: "dispatch", label: "Dispatch, Challan & CoA", category: "Core Operations" },
  { key: "employees", label: "Employee Management & Payroll", category: "Human Resources & Payroll" },
  { key: "user_management", label: "User Management & RBAC", category: "Administration" },
  { key: "cylinders", label: "Rotogravure Cylinders", category: "Pre-Press & Tooling" },
  { key: "printing_scheduler", label: "Printing Machine Scheduler", category: "Shop Floor & Planning" },
  { key: "supabase", label: "Supabase DB Connection", category: "Administration" },
  { key: "doc_settings", label: "Letterhead & Signatures", category: "Administration" },
  { key: "scrap_analytics", label: "Scrap & Wastage Analysis", category: "Core Operations" },
  { key: "audit_logs", label: "Audit Logs", category: "Administration" }
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
        perm[r][m.key] = m.key !== "user_management" && m.key !== "supabase" && m.key !== "doc_settings";
      } else if (r === "Store Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "inventory" || m.key === "purchase_orders" || m.key === "material_indents" || m.key === "vendors" || m.key === "ink_management" || m.key === "dispatch");
      } else if (r === "QC Chemist") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "production_records" || m.key === "inventory" || m.key === "ink_management" || m.key === "dispatch");
      } else if (r === "Purchase Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "vendors" || m.key === "purchase_orders" || m.key === "inventory" || m.key === "material_indents" || m.key === "ink_management");
      } else if (r === "Sales Manager") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "sales" || m.key === "job_punching" || m.key === "orders" || m.key === "clients" || m.key === "dispatch");
      } else if (r === "Shop Floor Operator") {
        perm[r][m.key] = (m.key === "dashboard" || m.key === "production_records" || m.key === "printing_scheduler");
      } else {
        perm[r][m.key] = allowAll;
      }
    });
    if (r === "HR & Payroll Manager") perm[r].purchase_orders = false;
    perm[r].audit_logs = r === "Admin";
    // Pellet fuel is a real permission. Store, production, purchasing, QC,
    // and the shop floor record or receive fuel. Other roles stay off.
    perm[r].pellet_fuel = [
      "Admin",
      "Plant Manager",
      "HR & Payroll Manager",
      "Production Manager",
      "Store Manager",
      "Purchase Manager",
      "QC Chemist",
      "Shop Floor Operator"
    ].includes(r);
    // Barcodes follows the roles that already have inventory in this matrix.
    // Those roles inward GRNs, print roll tags, and look up stock. HR is
    // included because the same matrix already opens Inventory, GRN & QC
    // for that role. Sales, printing, and shop-floor roles stay off.
    perm[r].barcodes = BARCODE_REGISTRY_ROLES.includes(r);
  });
  return perm;
};

export const BARCODE_REGISTRY_ROLES = [
  "Admin",
  "Plant Manager",
  "HR & Payroll Manager",
  "Production Manager",
  "Store Manager",
  "QC Chemist",
  "Purchase Manager"
];

export const DEFAULT_ROLE_PERMISSIONS = generateFullRolePermissions(false);

/** Fill a missing barcodes key from the role list. An explicit true or false stays. */
export function applyBarcodePermissionDefaults(matrix) {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return matrix;
  const next = {};
  Object.entries(matrix).forEach(([role, permissions]) => {
    const row = { ...(permissions || {}) };
    if (row.barcodes !== true && row.barcodes !== false) {
      row.barcodes = BARCODE_REGISTRY_ROLES.includes(role);
    }
    next[role] = row;
  });
  return next;
}

export function grantAllRolePermissions() {
  const perm = {};
  SYSTEM_ROLES.forEach((role) => {
    perm[role] = {};
    ALL_MODULES.forEach((mod) => {
      perm[role][mod.key] = true;
    });
  });
  return perm;
}

export function applyAuditLogBoundary(rolePermissions) {
  const next = {};
  Object.entries(rolePermissions || {}).forEach(([role, permissions]) => {
    next[role] = { ...(permissions || {}), audit_logs: role === 'Admin' };
  });
  return next;
}

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

export const initialEmployees = [];
export const initialAttendanceRecords = [];
export const initialSalaryAdvances = [];


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
    String(a.employeeId) === String(emp.id) && 
    attendanceCalendarDate(a.date).startsWith(monthKey)
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

  // Dinner Allowance (Optional: only applied if employee salary structure explicitly opts in)
  const dinnerPerNight = Number(struct.dinnerAllowancePerNight) || 0;
  const fixedDinner = Number(struct.fixedDinnerAllowance) || 0;
  const optDinner = Boolean(struct.optDinner || dinnerPerNight > 0 || fixedDinner > 0);
  const dinnerAllowance = optDinner ? (fixedDinner > 0 ? fixedDinner : (nightShiftCount * dinnerPerNight)) : 0;

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




