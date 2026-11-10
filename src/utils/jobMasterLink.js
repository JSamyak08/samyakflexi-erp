import { cylinderSkuTaken, normalizeCylinderSku } from './cylinderSku.js';

/**
 * Job master id stored on the cylinder.
 * The column wins. press_marks.jobMasterId is used only when that column is empty.
 */
export function explicitCylinderJobMasterId(cylinder) {
  if (!cylinder) return '';
  const column = cylinder.job_master_id;
  if (column != null && String(column).trim() !== '') return String(column).trim();
  const marks = cylinder.press_marks?.jobMasterId ?? cylinder.pressMarks?.jobMasterId;
  if (marks != null && String(marks).trim() !== '') return String(marks).trim();
  return '';
}

/**
 * Cylinders explicitly tied to this job master.
 * A shared job name or a shared SKU is not a link.
 */
export function cylindersLinkedToJobMaster(cylinders, jobMaster) {
  const jmId = String(jobMaster?.id || '').trim();
  const pointed = jobMaster?.cylinderId != null ? String(jobMaster.cylinderId) : '';
  return (cylinders || []).filter((cylinder) => {
    if (!cylinder) return false;
    if (pointed && cylinder.id != null && String(cylinder.id) === pointed) return true;
    return Boolean(jmId) && explicitCylinderJobMasterId(cylinder) === jmId;
  });
}

/**
 * SKU to keep when a job master is saved.
 * A cylinder that already has a code keeps it. The sync must not copy the
 * job master's code onto another set.
 */
export function skuAfterJobMasterSync(cylinder) {
  return cylinder?.sku ?? '';
}

/**
 * SKU to store when an operator links this cylinder to a job master.
 * The job master's code is adopted only when no other cylinder already has it.
 */
export function skuWhenLinkingCylinder(cylinder, jobMaster, cylinders) {
  const own = cylinder?.sku ?? '';
  const wanted = String(jobMaster?.skuCode || jobMaster?.cylinderSku || '').trim();
  if (!wanted) return own;
  if (normalizeCylinderSku(wanted) === normalizeCylinderSku(own)) return own;
  if (cylinderSkuTaken(wanted, cylinders, cylinder?.id)) return own;
  return wanted;
}
