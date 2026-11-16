/**
 * Convert one sales quotation into one order and one OCN per line.
 * The quotation is marked converted only after every order and OCN has saved.
 */

import { calculateJobRawMaterials, isLDFilm, DEFAULT_DAILY_RATES } from '../factoryStore.js';
import { buildOrderConfirmationRecord, findClientForOcn, layerStructure } from './orderConfirmationRecord.js';

function failure(error, saved, alreadyAlerted = false) {
  const prior = saved.length
    ? ` Already saved before this stop: ${saved.map((row) => `${row.ocnNumber} for ${row.orderId}`).join(', ')}.`
    : '';
  return {
    ok: false,
    error: `${error} The quotation was not marked converted.${prior}`,
    saved,
    alreadyAlerted
  };
}

function money(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function confirmQuoteConversion({
  quotation,
  items,
  jobMasters = [],
  clients = [],
  deps,
  now = new Date()
}) {
  if (!quotation || !Array.isArray(items) || items.length === 0) {
    return failure('There is no quotation line to convert.', []);
  }
  const required = ['allocateOrderId', 'allocateOcnNumber', 'saveOrder', 'saveOcn', 'saveQuotation'];
  for (const name of required) {
    if (typeof deps?.[name] !== 'function') {
      return failure(`The conversion cannot continue because ${name} is missing.`, []);
    }
  }

  const saved = [];
  const clientDetails = findClientForOcn(clients, quotation.clientName);
  const today = (now instanceof Date ? now : new Date(now)).toISOString().split('T')[0];

  for (let itemIdx = 0; itemIdx < items.length; itemIdx += 1) {
    const item = items[itemIdx];
    const isCylinderQuote = item.isCylinderOrder || item.materialFormat === 'Rotogravure Cylinder';
    let orderId;
    try {
      orderId = await deps.allocateOrderId();
    } catch (err) {
      return failure(`An order number was not issued: ${err.message || err}`, saved, Boolean(err.alreadyAlerted));
    }
    if (!orderId) {
      return failure('An order number was not issued by the database.', saved);
    }

    const printWidthMm = parseFloat(item.printWidthMm) || 1000;
    const repeatLengthMm = parseFloat(item.repeatLengthMm) || 400;
    const orderQtyKg = parseFloat(item.quantityKg) || 1000;
    const sellingPricePerKg = parseFloat(item.ratePerUom) || 0;
    const orderType = String(item.materialFormat || '').toLowerCase().includes('pouch') ? 'Pouching' : 'Reel';
    const conversionCharges = money(item.conversionCharges);
    const fixedProfit = money(item.fixedProfit);
    const layers = item.layers || [];
    let materialRequirements = [];
    let calcResults = null;
    let structure = item.structure || layerStructure(layers) || 'Custom Flexible Packaging';
    let cylinderSku = '';

    if (isCylinderQuote) {
      try {
        const issued = await deps.allocateCylinderSku(1);
        cylinderSku = Array.isArray(issued) ? (issued[0] || '') : (issued || '');
      } catch (err) {
        return failure(`A cylinder code was not issued by the database: ${err?.message || err}`, saved);
      }
      if (!cylinderSku) {
        return failure('A cylinder code was not issued by the database.', saved);
      }
      const engraverName = item.engraverName || 'Jindal Engravers, Mathura';
      const cylinderCost = `₹ ${parseFloat(item.cylinderCost || 35000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const newCyl = {
        id: `CYL-REC-${Date.now()}-${itemIdx}`,
        sku: cylinderSku,
        skuAllocated: true,
        jobName: item.jobTitle || 'Rotogravure Cylinder Set',
        clientGroup: quotation.clientName,
        colorsCount: parseInt(item.colorsCount, 10) || 8,
        cylinderCost,
        engravuresName: engraverName,
        costBorneBy: 'Client (100%)',
        status: 'Under Engraving',
        poIssued: false,
        created_at: (now instanceof Date ? now : new Date(now)).toISOString()
      };
      if (typeof deps.saveCylinder === 'function') {
        try {
          const savedCylinder = await deps.saveCylinder(newCyl);
          if (savedCylinder?.sku) cylinderSku = savedCylinder.sku;
        } catch (err) {
          if (typeof deps.releaseCylinderSku === 'function') {
            try { await deps.releaseCylinderSku(cylinderSku); } catch { /* the code stays reserved */ }
          }
          return failure(`The cylinder was not saved: ${err?.message || err}`, saved, Boolean(err.alreadyAlerted));
        }
      }
    } else {
      calcResults = calculateJobRawMaterials({
        jobName: item.jobTitle,
        printWidthMm,
        repeatLengthMm,
        orderQtyKg,
        orderType,
        inkGsm: parseFloat(item.inkGsm) || 1.5,
        adhesiveGsm: parseFloat(item.adhesiveGsm) || 1.5,
        layers: layers.map((layer) => ({
          ...layer,
          pricePerKg: parseFloat(layer.ratePerKg) || DEFAULT_DAILY_RATES[layer.filmType] || 125
        })),
        inkPrice: parseFloat(item.inkPrice) || 220,
        adhesivePrice: parseFloat(item.adhesivePrice) || 240,
        conversionChargesPerKg: conversionCharges,
        fixedProfitPerKg: fixedProfit
      });

      if (calcResults?.layerResults) {
        calcResults.layerResults.forEach((layer, idx) => {
          materialRequirements.push({
            id: `REQ-${orderId}-${idx + 1}`,
            filmType: layer.filmType,
            micron: layer.micron,
            widthMm: layer.widthMm,
            qtyKg: parseFloat((layer.grossKg || 0).toFixed(2)),
            preferredVendor: isLDFilm(layer.filmType) ? 'Malwa Extrusions Pvt Ltd' : 'FlexiPoly Films Ltd',
            poIssued: false,
            poNumber: ''
          });
        });
        if (calcResults.inkDetails?.grossKg > 0) {
          materialRequirements.push({
            id: `REQ-${orderId}-INK`,
            filmType: 'Liquid Inks',
            micron: '-',
            widthMm: '-',
            qtyKg: parseFloat(calcResults.inkDetails.grossKg.toFixed(2)),
            preferredVendor: 'Siegwerk Inks Ltd',
            poIssued: false,
            poNumber: ''
          });
        }
        if (calcResults.adhesiveDetails?.grossKg > 0) {
          materialRequirements.push({
            id: `REQ-${orderId}-ADH`,
            filmType: 'Solvent-less Adhesive',
            micron: '-',
            widthMm: '-',
            qtyKg: parseFloat(calcResults.adhesiveDetails.grossKg.toFixed(2)),
            preferredVendor: 'Siegwerk Inks Ltd',
            poIssued: false,
            poNumber: ''
          });
        }
      }
    }

    let effectiveJobMaster = null;
    if (!isCylinderQuote) {
      const existingJM = (jobMasters || []).find((job) =>
        (item.jobMasterId && job.id === item.jobMasterId)
        || (job.jobName && item.jobTitle && job.jobName.toLowerCase().trim() === item.jobTitle.toLowerCase().trim())
      );
      effectiveJobMaster = existingJM || null;
      if (!effectiveJobMaster) {
        if (typeof deps.allocateCylinderSku !== 'function' || typeof deps.saveJobMaster !== 'function') {
          return failure('A new job master cannot be saved from this screen.', saved);
        }
        let jobSku = '';
        try {
          const issued = await deps.allocateCylinderSku(1);
          jobSku = Array.isArray(issued) ? (issued[0] || '') : (issued || '');
        } catch (err) {
          return failure(`A cylinder code was not issued by the database: ${err?.message || err}`, saved);
        }
        if (!jobSku) {
          return failure('A cylinder code was not issued by the database.', saved);
        }
        let jobMasterId = item.jobMasterId || '';
        if (!jobMasterId) {
          if (typeof deps.allocateJobMasterId !== 'function') {
            if (typeof deps.releaseCylinderSku === 'function') {
              try { await deps.releaseCylinderSku(jobSku); } catch { /* stays reserved */ }
            }
            return failure('A job master id was not issued by the database.', saved);
          }
          try {
            const issuedIds = await deps.allocateJobMasterId(1);
            jobMasterId = Array.isArray(issuedIds) ? (issuedIds[0] || '') : (issuedIds || '');
          } catch (err) {
            if (typeof deps.releaseCylinderSku === 'function') {
              try { await deps.releaseCylinderSku(jobSku); } catch { /* stays reserved */ }
            }
            return failure(`A job master id was not issued: ${err?.message || err}`, saved);
          }
        }
        if (!jobMasterId) {
          if (typeof deps.releaseCylinderSku === 'function') {
            try { await deps.releaseCylinderSku(jobSku); } catch { /* stays reserved */ }
          }
          return failure('A job master id was not issued by the database.', saved);
        }
        const jobMaster = {
          id: jobMasterId,
          skuCode: jobSku,
          jobName: item.jobTitle || 'Custom Flexible Packaging Job',
          clientName: quotation.clientName,
          structure,
          printWidthMm,
          repeatLengthMm,
          pouchOpenWidth: 120,
          pouchHeight: 160,
          materialFormat: item.materialFormat || 'Roll Form',
          layers,
          inkGsm: parseFloat(item.inkGsm) || 1.5,
          adhesiveGsm: parseFloat(item.adhesiveGsm) || 1.5,
          cylinderSku: jobSku,
          cylinderCost: quotation.cylinderTerms || '₹ 35,000',
          colorsCount: 6,
          engravuresName: 'Acme Rotogravure Engravers',
          costBorneBy: 'Client (100%)',
          utilisationLimit: 10000,
          creationDate: today
        };
        try {
          const stored = await deps.saveJobMaster(jobMaster, { mode: 'insert' });
          if (stored === null || stored === false) {
            throw new Error(`Job master ${jobMasterId} was not created.`);
          }
          effectiveJobMaster = {
            ...jobMaster,
            ...(stored && typeof stored === 'object' ? stored : {}),
            id: stored?.id || jobMasterId
          };
        } catch (err) {
          if (typeof deps.releaseCylinderSku === 'function') {
            try { await deps.releaseCylinderSku(jobSku); } catch { /* the code stays reserved */ }
          }
          if (typeof deps.reportFailure === 'function') {
            deps.reportFailure(err, `Job master ${jobMasterId} was not created`);
          }
          return failure(`The job master was not saved: ${err?.message || err}`, saved, Boolean(err.alreadyAlerted));
        }
      }
    }

    let ocnNumber;
    try {
      ocnNumber = await deps.allocateOcnNumber();
    } catch (err) {
      return failure(`An OCN number was not issued: ${err.message || err}`, saved);
    }
    if (!ocnNumber) {
      return failure('An OCN number was not issued by the database.', saved);
    }

    const metallocenePct = (layers.find((layer) => layer.metallocenePct)?.metallocenePct) || '';
    const order = {
      id: orderId,
      ocnNumber,
      ocnId: ocnNumber,
      jobMasterId: effectiveJobMaster ? effectiveJobMaster.id : null,
      jobName: item.jobTitle,
      clientName: quotation.clientName,
      orderQtyKg,
      quantityKg: orderQtyKg,
      orderType: isCylinderQuote ? 'Rotogravure Cylinder' : orderType,
      materialFormat: item.materialFormat || 'Roll Form',
      isCylinderOrder: isCylinderQuote,
      sellingPricePerKg,
      printWidthMm,
      repeatLengthMm,
      structure,
      layers,
      orderComments: item.orderComments || '',
      comments: item.orderComments || '',
      jobDetails: {
        layers,
        printWidthMm,
        repeatLengthMm,
        structure,
        orderComments: item.orderComments || '',
        comments: item.orderComments || '',
        ocnNumber,
        ocnId: ocnNumber,
        ...(isCylinderQuote ? { skuCode: cylinderSku, cylinderSku } : {})
      },
      cylinderDetails: isCylinderQuote ? {
        sku: cylinderSku,
        jobName: item.jobTitle,
        description: item.jobTitle,
        quantity: orderQtyKg,
        rate: sellingPricePerKg,
        totalAmount: item.cylinderCost || 35000,
        engraverName: item.engraverName || 'Jindal Engravers, Mathura',
        colorsCount: parseInt(item.colorsCount, 10) || 8,
        status: 'Under Engraving'
      } : null,
      engraverName: isCylinderQuote ? (item.engraverName || 'Jindal Engravers, Mathura') : undefined,
      orderDate: today,
      targetDeliveryDate: item.targetDeliveryDate || quotation.estimatedDeliveryDate,
      deliveryDate: item.targetDeliveryDate || quotation.estimatedDeliveryDate,
      poNumber: `PO-QTN-${quotation.quotationNo}`,
      poIssued: false,
      status: isCylinderQuote ? 'Under Engraving' : 'Confirmed',
      materialRequirements,
      rawMaterialRequirements: materialRequirements,
      calculationDetails: calcResults,
      wastagePct: parseFloat(calcResults?.wastagePct) || 5,
      wastageKg: parseFloat(calcResults?.wastageKg) || 0,
      conversionChargesPerKg: conversionCharges,
      fixedProfitPerKg: fixedProfit,
      minSellingPricePerKg: calcResults?.minSellingPricePerKg,
      totalConversionCost: calcResults?.totalConversionCost,
      totalFixedProfit: calcResults?.totalFixedProfit,
      totalMinSellingAmount: calcResults?.totalMinSellingAmount,
      metallocenePct
    };

    try {
      await deps.saveOrder(order);
    } catch (err) {
      return failure(
        `Order ${orderId} was not saved: ${err?.message || err}`,
        saved,
        Boolean(err?.alreadyAlerted)
      );
    }

    const ocnRecord = buildOrderConfirmationRecord({
      ocnNumber,
      orderId: order.id,
      jobName: item.jobTitle,
      clientName: quotation.clientName,
      clientDetails,
      orderDate: today,
      targetDeliveryDate: order.targetDeliveryDate,
      orderQtyKg,
      orderType: isCylinderQuote ? 'Rotogravure Cylinder' : (orderType || 'Reel'),
      printWidthMm,
      repeatLengthMm,
      calculationResults: calcResults || {},
      conversionCharges,
      fixedProfit,
      metallocenePct,
      layers,
      structure,
      variants: [],
      hasVariants: false,
      orderComments: item.orderComments || '',
      quotationNo: quotation.quotationNo,
      quotationId: quotation.id,
      now
    });

    try {
      await deps.saveOcn(ocnRecord);
    } catch (err) {
      return failure(
        `Order confirmation ${ocnNumber} was not saved: ${err?.message || err}`,
        saved,
        Boolean(err?.alreadyAlerted)
      );
    }

    if (typeof deps.logAudit === 'function') {
      try {
        await deps.logAudit(
          'CREATE',
          'Order Confirmations',
          `Created order confirmation ${ocnNumber} for order ${orderId} from quotation ${quotation.quotationNo}`,
          ocnNumber
        );
      } catch (err) {
        if (typeof deps.reportFailure === 'function') {
          deps.reportFailure(err, `The audit log for ${ocnNumber} was not saved`);
        }
      }
    }

    saved.push({ orderId, ocnNumber, order, ocn: ocnRecord });
  }

  const sourceItems = Array.isArray(quotation.items) ? quotation.items : [];
  const linkedItems = sourceItems.map((line, idx) => {
    const link = saved[idx];
    if (!link) return line;
    return { ...line, orderId: link.orderId, ocnNumber: link.ocnNumber };
  });
  const updatedQuotation = {
    ...quotation,
    status: 'Confirmed (Converted to OCN)',
    ocnRefNo: saved.map((row) => `${row.ocnNumber} (${row.orderId})`).join(', '),
    convertedDate: today,
    items: linkedItems
  };

  try {
    await deps.saveQuotation(updatedQuotation);
  } catch (err) {
    if (typeof deps.reportFailure === 'function') {
      deps.reportFailure(err, `Quotation ${quotation.quotationNo} was not marked converted`);
    }
    return failure(
      `Quotation save failed: ${err?.message || err}`,
      saved,
      Boolean(err?.alreadyAlerted)
    );
  }

  if (typeof deps.logAudit === 'function') {
    try {
      await deps.logAudit(
        'UPDATE',
        'Sales',
        `Converted quotation ${quotation.quotationNo} to ${saved.map((row) => `${row.ocnNumber} for ${row.orderId}`).join(', ')}`,
        quotation.id
      );
    } catch (err) {
      if (typeof deps.reportFailure === 'function') {
        deps.reportFailure(err, `The audit log for quotation ${quotation.quotationNo} was not saved`);
      }
    }
  }

  const lines = saved.map((row) => `- ${row.ocnNumber} for order ${row.orderId}`).join('\n');
  return {
    ok: true,
    saved,
    quotation: updatedQuotation,
    successMessage: `SUCCESS\n\nSales quotation ${quotation.quotationNo} has been converted.\n\n${lines}`
  };
}
