/**
 * Order Confirmation Note (OCN) Amendments & Revisions Engine
 * Handles revision numbering, amendment tracking, history snapshots, and display labels.
 */

import { isMetalloceneEligibleFilm, isLDFilm } from '../factoryStore.js';

/**
 * Extracts and formats the metallocene percentage for an OCN film layer
 */
export function getLayerMetallocenePct(layer, index = 0, calculationData = {}, ocn = {}) {
  let pct = layer?.metallocenePct || layer?.metallocene_pct || layer?.metallocene;
  
  if (!pct && Array.isArray(calculationData?.layers)) {
    const l = calculationData.layers[index] || calculationData.layers.find(x => x?.id === layer?.id || x?.filmType === layer?.filmType);
    pct = l?.metallocenePct || l?.metallocene_pct || l?.metallocene;
  }
  if (!pct && Array.isArray(ocn?.layers)) {
    const l = ocn.layers[index] || ocn.layers.find(x => x?.id === layer?.id || x?.filmType === layer?.filmType);
    pct = l?.metallocenePct || l?.metallocene_pct || l?.metallocene;
  }
  if (!pct && Array.isArray(calculationData?.jobDetails?.rawMaterialLayers)) {
    const l = calculationData.jobDetails.rawMaterialLayers[index];
    pct = l?.metallocenePct || l?.metallocene_pct || l?.metallocene;
  }
  if (!pct && Array.isArray(calculationData?.jobMasterData?.layers)) {
    const l = calculationData.jobMasterData.layers[index];
    pct = l?.metallocenePct || l?.metallocene_pct || l?.metallocene;
  }

  const filmName = String(layer?.filmType || '');
  if (!pct && (isMetalloceneEligibleFilm(filmName) || isLDFilm(filmName) || filmName.toUpperCase().includes('METALLOCENE'))) {
    pct = calculationData?.metallocenePct ||
          calculationData?.metallocene_pct ||
          calculationData?.jobDetails?.metallocenePct ||
          calculationData?.orderData?.metallocenePct ||
          calculationData?.jobMasterData?.metallocenePct ||
          ocn?.metallocenePct ||
          ocn?.metallocene_pct;
  }

  if (!pct && filmName) {
    const match = filmName.match(/(\d{1,2}%)/);
    if (match) pct = match[1];
  }

  if (!pct) return null;
  const clean = String(pct).trim();
  if (!clean || clean === '0' || clean === '0%') return null;
  return clean.endsWith('%') ? clean : `${clean}%`;
}

/**
 * Formats film description with metallocene percentage displayed prominently in front of the film
 */
export function formatOcnFilmName(filmType, metallocenePct) {
  if (!filmType) return '';
  if (!metallocenePct) return filmType;
  const pctStr = String(metallocenePct).endsWith('%') ? metallocenePct : `${metallocenePct}%`;
  const lower = filmType.toLowerCase();
  if (lower.includes('metallocene')) {
    return lower.includes('%') ? filmType : `${filmType} (${pctStr})`;
  }
  return `${filmType} (${pctStr} Metallocene)`;
}

/**
 * Returns numeric revision number of an OCN (defaults to 0 for untouched OCNs)
 */
export function revisionNumber(ocn) {
  if (!ocn) return 0;
  const num = Number(ocn.revisionNo ?? ocn.revision_no);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}

/**
 * Calculates next revision integer
 */
export function nextRevisionNumber(ocn) {
  return revisionNumber(ocn) + 1;
}

/**
 * Formats a revision number into a label: Rev 00, Rev 01, Rev 02, etc.
 */
export function formatAmendmentLabel(revNo) {
  const num = Math.max(0, Math.floor(Number(revNo) || 0));
  return `Rev ${String(num).padStart(2, '0')}`;
}

/**
 * Returns formatted amendment label for an OCN
 */
export function displayAmendmentLabel(ocn) {
  if (!ocn) return 'Rev 00';
  if (typeof ocn.amendmentNo === 'string' && ocn.amendmentNo.trim()) {
    return ocn.amendmentNo.trim();
  }
  if (typeof ocn.amendment_no === 'string' && ocn.amendment_no.trim()) {
    return ocn.amendment_no.trim();
  }
  return formatAmendmentLabel(revisionNumber(ocn));
}

/**
 * Extracts sequence number from an OCN number string like 'SIL/OCN/26-27/124' -> 124
 */
export function parseOcnSequenceNumber(ocnNumber) {
  if (!ocnNumber || typeof ocnNumber !== 'string') return null;
  const parts = ocnNumber.trim().split('/');
  const lastPart = parts[parts.length - 1];
  const match = lastPart.match(/\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  return Number.isFinite(num) ? num : null;
}

/**
 * Builds an amended OCN object with archived previous revision snapshot
 * 
 * @param {Object} currentOcn - Existing OCN record
 * @param {Object} patch - Fields being updated
 * @param {string} amendedBy - Username or staff name performing the amendment
 * @returns {Object} Amended OCN record
 */
export function buildOcnAmendment(currentOcn, patch = {}, amendedBy = 'Staff') {
  if (!currentOcn) throw new Error('Cannot amend a null or undefined OCN');
  
  const reason = (patch.amendmentReason || patch.reason || '').trim();
  if (!reason) {
    throw new Error('Amendment reason is required to modify an Order Confirmation Note');
  }

  const prevRev = revisionNumber(currentOcn);
  const nextRev = nextRevisionNumber(currentOcn);
  const nextLabel = formatAmendmentLabel(nextRev);
  const now = new Date().toISOString();

  // Create clean snapshot of previous state
  const previousRevisions = Array.isArray(currentOcn.revisions) ? currentOcn.revisions : [];
  const snapshot = { ...currentOcn };
  delete snapshot.revisions;

  const revisionEntry = {
    revisionNo: prevRev,
    amendmentNo: displayAmendmentLabel(currentOcn),
    amendedAt: currentOcn.amendedAt || currentOcn.updatedAt || currentOcn.createdAt || now,
    amendedBy: currentOcn.amendedBy || currentOcn.createdBy || 'Initial Author',
    reason: currentOcn.amendmentReason || 'Initial Confirmation Note',
    snapshot
  };

  return {
    ...currentOcn,
    ...patch,
    id: currentOcn.id,
    ocnNumber: currentOcn.ocnNumber || currentOcn.id,
    orderId: patch.orderId || currentOcn.orderId,
    revisionNo: nextRev,
    amendmentNo: nextLabel,
    amendedAt: now,
    amendedBy: amendedBy || 'Staff',
    amendmentReason: reason,
    status: 'Amended',
    revisions: [...previousRevisions, revisionEntry],
    updatedAt: now
  };
}

/**
 * Generates audit history list of all revisions for an OCN
 */
export function ocnHistoryEntries(ocn) {
  if (!ocn) return [];
  const entries = [];
  const pastRevisions = Array.isArray(ocn.revisions) ? ocn.revisions : [];

  pastRevisions.forEach((rev) => {
    entries.push({
      revisionNo: rev.revisionNo,
      amendmentNo: rev.amendmentNo,
      date: rev.amendedAt,
      by: rev.amendedBy,
      reason: rev.reason,
      isCurrent: false,
      snapshot: rev.snapshot
    });
  });

  entries.push({
    revisionNo: revisionNumber(ocn),
    amendmentNo: displayAmendmentLabel(ocn),
    date: ocn.amendedAt || ocn.updatedAt || ocn.createdAt,
    by: ocn.amendedBy || ocn.createdBy || 'Staff',
    reason: ocn.amendmentReason || (pastRevisions.length > 0 ? 'Current Revision' : 'Initial Order Confirmation'),
    isCurrent: true,
    snapshot: ocn
  });

  return entries;
}
