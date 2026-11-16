/** A row is the one being edited only when its id is exactly this id. */

export function recordByExactId(rows, id) {
  const wanted = String(id ?? '').trim();
  if (!wanted) return null;
  return (rows || []).find((row) => row && String(row.id) === wanted) || null;
}

/**
 * Decide insert vs update for a cylinder job card.
 * A new job master id and a new cylinder code come from the caller, which
 * must have obtained them from the database. The new cylinder id is the same
 * clock number the Add Cylinder Set screen stores (Date.now()), not a value
 * derived from the SKU or the job master id.
 */
export function planCylinderJobCardRecords({
  jobMasters,
  cylinders,
  jobMasterId,
  cylinderIds = [],
  allocatedJobMasterId,
  allocatedSku,
  now
} = {}) {
  const existingJobMaster = recordByExactId(jobMasters, jobMasterId);
  const existingCylinder = (cylinderIds || [])
    .map((id) => recordByExactId(cylinders, id))
    .find(Boolean) || null;

  let nextJobMasterId = existingJobMaster ? existingJobMaster.id : String(allocatedJobMasterId || '').trim();
  if (!existingJobMaster) {
    if (!nextJobMasterId) {
      throw new Error('A job master id was not issued by the database.');
    }
    if (nextJobMasterId.toUpperCase() === 'SIL/DOC/101') {
      throw new Error('Job master SIL/DOC/101 already exists. It was not overwritten.');
    }
  }

  let sku = existingCylinder ? String(existingCylinder.sku || '') : String(allocatedSku || '').trim();
  if (!existingCylinder && !sku) {
    throw new Error('A cylinder code was not issued by the database.');
  }

  const cylinderId = existingCylinder ? existingCylinder.id : now;
  if (!existingCylinder && (cylinderId == null || String(cylinderId).trim() === '')) {
    throw new Error('A cylinder id was not issued.');
  }

  return {
    existingJobMaster,
    existingCylinder,
    jobMasterMode: existingJobMaster ? 'update' : 'insert',
    cylinderMode: existingCylinder ? 'update' : 'insert',
    jobMasterId: nextJobMasterId,
    cylinderId,
    sku
  };
}
