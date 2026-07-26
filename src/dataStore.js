export const initialCylinders = [
  {
    id: 1,
    sku: "SKU-BR-001",
    jobName: "Britannia Bourbon 250g",
    colorsCount: 6,
    cylinderCost: "₹ 35,000",
    engravuresName: "Acme Rotogravure Engravers",
    costBorneBy: "Client (100%)",
    costBorneType: "client",
    clientGroup: "Britannia Industries",
    circumferenceMm: 400,
    faceLengthMm: 1050,
    layer1PrintedQtyKg: 385.5, // Calculated strictly from Layer 1 PET printing substrate
    dispatchedQty: 3855,
    utilisationLimit: 10000,
    status: "Active In-Use"
  },
  {
    id: 2,
    sku: "SKU-BR-002",
    jobName: "Britannia Marie Gold 150g",
    colorsCount: 5,
    cylinderCost: "₹ 30,000",
    engravuresName: "Acme Rotogravure Engravers",
    costBorneBy: "Us (100%)",
    costBorneType: "us",
    clientGroup: "Britannia Industries",
    circumferenceMm: 380,
    faceLengthMm: 980,
    layer1PrintedQtyKg: 890.0,
    dispatchedQty: 8900,
    utilisationLimit: 10000,
    status: "Active In-Use"
  },
  {
    id: 3,
    sku: "SKU-PG-101",
    jobName: "P&G Ariel Matic 1kg",
    colorsCount: 7,
    cylinderCost: "₹ 45,000",
    engravuresName: "Precision Rotogravure Dies",
    costBorneBy: "Both (50/50)",
    costBorneType: "both",
    clientGroup: "Procter & Gamble",
    circumferenceMm: 420,
    faceLengthMm: 1050,
    layer1PrintedQtyKg: 230.0,
    dispatchedQty: 2300,
    utilisationLimit: 10000,
    status: "Active In-Use"
  },
  {
    id: 4,
    sku: "SKU-UL-205",
    jobName: "Surf Excel Liquid 500ml",
    colorsCount: 8,
    cylinderCost: "₹ 52,000",
    engravuresName: "Precision Rotogravure Dies",
    costBorneBy: "Client (100%)",
    costBorneType: "client",
    clientGroup: "Unilever",
    circumferenceMm: 450,
    faceLengthMm: 920,
    layer1PrintedQtyKg: 95.0,
    dispatchedQty: 9500,
    utilisationLimit: 10000,
    status: "Worn Out / Retouch Needed"
  }
];

export const calculateUtilisation = (dispatchedQty, limit = 10000) => {
  const percentage = (dispatchedQty / limit) * 100;
  return Math.min(percentage, 100).toFixed(1);
};
