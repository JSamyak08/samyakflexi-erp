/**
 * One Order Confirmation Note, in the shape Job Punching saves.
 * Quote conversion adds the source quotation number and id when it has them.
 */

export function layerStructure(layers) {
  return (layers || []).map((layer) => {
    const film = layer?.filmType || '';
    const micron = layer?.micron ?? '';
    const meta = layer?.metallocenePct;
    const metaText = meta
      ? ` (${String(meta).endsWith('%') ? meta : `${meta}%`})`
      : '';
    return `${film} ${micron}µ${metaText}`;
  }).join(' / ');
}

/**
 * Same client match Job Punching uses before it stores clientDetails.
 */
export function findClientForOcn(clients, clientName) {
  if (!clientName) return null;
  const search = String(clientName).toLowerCase().trim();
  if (!search) return null;
  const list = Array.isArray(clients) ? clients : [];
  return list.find((client) => (client?.name || client?.companyName || '').toLowerCase().trim() === search)
    || list.find((client) => {
      const name = (client?.name || client?.companyName || '').toLowerCase().trim();
      return name.includes(search) || search.includes(name);
    })
    || list.find((client) => {
      const firstWord = search.split(' ')[0];
      return firstWord && firstWord.length > 3
        && (client?.name || client?.companyName || '').toLowerCase().includes(firstWord);
    })
    || null;
}

export function buildOrderConfirmationRecord({
  ocnNumber,
  orderId,
  jobName,
  clientName,
  clientDetails = null,
  orderDate,
  targetDeliveryDate,
  orderQtyKg,
  orderType,
  printWidthMm,
  repeatLengthMm,
  calculationResults = {},
  conversionCharges,
  fixedProfit,
  metallocenePct = '',
  layers = [],
  structure,
  variants = [],
  hasVariants = false,
  orderComments = '',
  quotationNo,
  quotationId,
  now = new Date()
}) {
  const createdAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const calc = calculationResults || {};
  const record = {
    id: ocnNumber,
    ocnNumber,
    orderId,
    jobName,
    clientName,
    clientDetails,
    orderDate,
    targetDeliveryDate,
    orderQtyKg: parseFloat(orderQtyKg) || 0,
    orderType: orderType || 'Reel',
    printWidthMm: parseFloat(printWidthMm) || 0,
    repeatLengthMm: parseFloat(repeatLengthMm) || 0,
    totalLaminateGsm: calc.totalLaminateGsm || 0,
    totalAreaSqm: calc.totalAreaSqm || 0,
    wastagePct: parseFloat(calc.wastagePct) || 5,
    minSellingPricePerKg: calc.minSellingPricePerKg || 0,
    totalMinSellingAmount: calc.totalMinSellingAmount || 0,
    conversionChargesPerKg: parseFloat(conversionCharges) || 0,
    fixedProfitPerKg: parseFloat(fixedProfit) || 0,
    metallocenePct: metallocenePct || '',
    layers,
    structure: structure || layerStructure(layers),
    variants,
    hasVariants,
    calculationData: {
      ...calc,
      clientName,
      jobName,
      orderQtyKg,
      orderType,
      layers
    },
    summary: calc.summary || {},
    layerResults: calc.layerResults || [],
    inkDetails: calc.inkDetails || {},
    adhesiveDetails: calc.adhesiveDetails || {},
    orderComments,
    status: 'Confirmed',
    revisionNo: 0,
    amendmentNo: 'Rev 00',
    revisions: [],
    createdAt,
    updatedAt: createdAt
  };
  if (quotationNo) {
    record.quotationNo = quotationNo;
    record.sourceQuotationNo = quotationNo;
  }
  if (quotationId) record.quotationId = quotationId;
  return record;
}
