import { artworkOwnedByRow, artworkUrlsOf } from './cylinderArtwork.js';

export function parseStructureToLayers(structStr) {
  if (!structStr || structStr === '—') return [];
  const parts = structStr.split('/');
  return parts.map((part, idx) => {
    const trimmed = part.trim();
    const micronMatch = trimmed.match(/(\d+)\s*µ?/);
    const micron = micronMatch ? parseInt(micronMatch[1], 10) : 12;
    const filmType = trimmed.replace(/\d+\s*µ?/, '').trim() || 'PET';
    return { id: idx + 1, filmType, micron };
  });
}

export function findMatchingJobMaster(jobMasters, initialData) {
  const list = (jobMasters || []).filter(Boolean);
  if (!initialData) return null;
  const linkedId = initialData.jobMasterId || initialData.job_master_id;
  if (linkedId) {
    const byId = list.filter(job => job.id === linkedId);
    if (byId.length === 1) return byId[0];
  }

  const sku = String(initialData.sku || initialData.skuCode || '').trim().toLowerCase();
  if (sku) {
    const bySku = list.filter(job => String(job.skuCode || job.sku || '').trim().toLowerCase() === sku);
    if (bySku.length === 1) return bySku[0];
    if (bySku.length > 1) return null;
  }

  const name = String(initialData.jobName || '').trim().toLowerCase();
  if (name) {
    const byName = list.filter(job => String(job.jobName || '').trim().toLowerCase() === name);
    if (byName.length === 1) return byName[0];
  }
  return null;
}

export function buildCylinderJobCardDraft(initialData, matchingJM) {
  const src = { ...(matchingJM || {}), ...initialData };

  let initLayers = src.layers || [];
  if (initLayers.length === 0 && (src.structure || src.film_structure)) {
    initLayers = parseStructureToLayers(src.structure || src.film_structure);
  }

  const derivedStruct = (initLayers.length > 0)
    ? initLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')
    : (src.structure || src.film_structure || src.jobStructure || '—');

  const printWidthVal = src.printWidth
    ? (String(src.printWidth).includes('mm') ? src.printWidth : `${src.printWidth} mm`)
    : (src.printWidthMm ? `${src.printWidthMm} mm` : (src.pouchOpenWidth ? `${src.pouchOpenWidth} mm` : ''));

  const faceLengthVal = src.faceLength
    ? (String(src.faceLength).includes('mm') ? src.faceLength : `${src.faceLength} mm`)
    : (src.faceLengthMm ? `${src.faceLengthMm} mm` : (src.shellSize ? (String(src.shellSize).includes('mm') ? src.shellSize : `${src.shellSize} mm`) : ''));

  const repeatHeightVal = src.totalHeight
    ? (String(src.totalHeight).includes('mm') ? src.totalHeight : `${src.totalHeight} mm`)
    : (src.circumferenceMm ? `${src.circumferenceMm} mm` : (src.repeatLengthMm ? `${src.repeatLengthMm} mm` : (src.pouchHeight ? `${src.pouchHeight} mm` : '')));

  const rawPouchOpenWidth = initialData.pouchOpenWidth || matchingJM?.pouchOpenWidth || matchingJM?.printWidthMm || initialData.printWidthMm || '';
  const rawPouchHeight = initialData.pouchHeight || matchingJM?.pouchHeight || '';

  const ownArtwork = artworkUrlsOf(initialData).find(url => artworkOwnedByRow(url, initialData)) || '';
  const masterArtwork = artworkUrlsOf(matchingJM).find(url => artworkOwnedByRow(url, {
    sku: initialData.sku || initialData.skuCode || matchingJM?.skuCode,
    jobName: initialData.jobName || matchingJM?.jobName,
    id: initialData.id
  })) || '';

  return {
    layers: initLayers.length > 0 ? initLayers : [],
    artworkUrl: ownArtwork || masterArtwork,
    formData: {
      jobMasterId: src.jobMasterId || src.id || '',
      skuCode: src.sku || src.skuCode || '',
      jobName: src.jobName || '',
      creationDate: src.creationDate || new Date().toISOString().split('T')[0],
      partyName: src.clientGroup || src.partyName || src.clientName || '',
      invoiceTo: src.invoiceTo || 'Samyak International Ltd',
      variant: src.variant || '',
      printing: src.printing || 'Reverse',
      pouchOpenWidth: rawPouchOpenWidth ? (String(rawPouchOpenWidth).includes('mm') ? rawPouchOpenWidth : `${rawPouchOpenWidth} mm`) : '',
      pouchHeight: rawPouchHeight ? (String(rawPouchHeight).includes('mm') ? rawPouchHeight : `${rawPouchHeight} mm`) : '',
      numberOfCylinders: src.colorsCount || src.numberOfCylinders ? `${src.colorsCount || src.numberOfCylinders}` : '',
      jobStructure: derivedStruct,
      printWidth: printWidthVal,
      faceLength: faceLengthVal,
      totalWidth: faceLengthVal || printWidthVal,
      totalHeight: repeatHeightVal,
      shellSize: src.shellSize || faceLengthVal,
      petSize: src.petSize || (src.faceLengthMm ? `${src.faceLengthMm + 10} mm` : ''),
      silLogo: (src.silLogo !== undefined && src.silLogo !== null) ? src.silLogo : '',
      arcMark: src.arcMark || 'Yes',
      slittingMark: src.slittingMark || 'Yes',
      trackerLine: src.trackerLine || 'Yes',
      specialInstructions: src.specialInstructions || '',
      approvedBy: src.approvedBy || '',
      engravure: src.engravuresName || src.engravure || src.engraverName || '',
      cylinderCost: src.cylinderCost || '',
      costPerCylinder: src.costPerCylinder || '',
      ratePerSqInch: src.ratePerSqInch || 1.60,
      utilisationLimit: `${src.utilisationLimit || 10000}`,
      costBorneBy: src.costBorneBy || 'Client (100%)',
      costBorneType: src.costBorneType || 'client',
      artworkUrl: ownArtwork || masterArtwork,
      chkEyemark: Boolean(src.chkEyemark || initialData?.chkEyemark || matchingJM?.chkEyemark),
      chkBarcode: Boolean(src.chkBarcode || initialData?.chkBarcode || matchingJM?.chkBarcode),
      chkOrientation: Boolean(src.chkOrientation || initialData?.chkOrientation || matchingJM?.chkOrientation),
      chkClientApproval: Boolean(src.chkClientApproval || initialData?.chkClientApproval || matchingJM?.chkClientApproval),
      approvedByHead: Boolean(src.approvedByHead || src.productionApproved || initialData?.approvedByHead || initialData?.productionApproved || matchingJM?.approvedByHead || matchingJM?.productionApproved),
      approvedHeadName: src.approvedHeadName || initialData?.approvedHeadName || matchingJM?.approvedHeadName || '',
      approvedHeadDate: src.approvedHeadDate || initialData?.approvedHeadDate || matchingJM?.approvedHeadDate || ''
    }
  };
}

export function applySavedJobCardSpec(formData, spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return formData;
  const next = { ...formData };
  for (const key of Object.keys(formData)) {
    if (Object.prototype.hasOwnProperty.call(spec, key) && spec[key] !== undefined) {
      next[key] = spec[key];
    }
  }
  return next;
}
