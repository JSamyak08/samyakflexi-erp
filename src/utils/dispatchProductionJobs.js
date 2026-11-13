import { matchPackingOrder } from './packingListPrint.js';

/** Job title stored before the costing envelope in orders.job_name. */
export function displayProductionJobName(value) {
  const name = String(value ?? '').split(' ||| ')[0].trim();
  return name || 'Untitled Job';
}

function firstFilled(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

/**
 * One row from dispatch_production_jobs. Only the fields the packing list
 * needs to name the job. Costing, quantities, and job_details stay off.
 */
export function dispatchProductionJobFromRow(row) {
  if (!row || row.id == null || String(row.id).trim() === '') return null;
  const clientName = firstFilled(row.client_name, row.clientName);
  const poNo = firstFilled(row.po_number, row.poNo, row.poNumber);
  return {
    id: String(row.id),
    jobName: displayProductionJobName(row.job_name || row.jobName),
    clientName,
    customerName: clientName,
    status: firstFilled(row.status) || 'Scheduled',
    poNo,
    poNumber: poNo,
  };
}

/**
 * Roles that can read public.orders keep that result, including an empty list.
 * A dispatch role whose order read is filtered to nothing uses the narrow
 * projection instead.
 */
export function ordersOrDispatchJobs(orderRows, dispatchRows) {
  if (Array.isArray(orderRows) && orderRows.length > 0) return orderRows;
  return (Array.isArray(dispatchRows) ? dispatchRows : [])
    .map(dispatchProductionJobFromRow)
    .filter(Boolean);
}

/**
 * Packing lists store the job and client on the row and again inside payload.
 * A payload that omitted the name used to hide the column value.
 */
export function withStoredShipmentNames(record, row) {
  if (!record || typeof record !== 'object') return record;
  const source = row && typeof row === 'object' ? row : {};
  return {
    ...record,
    orderId: firstFilled(record.orderId, source.order_id),
    jobName: firstFilled(record.jobName, source.job_name),
    clientName: firstFilled(record.clientName, source.client_name),
    vehicleNo: firstFilled(record.vehicleNo, record.vehicle_no, source.vehicle_no, source.vehicleNo),
    lrNo: firstFilled(record.lrNo, record.lr_no, source.lr_no, source.lrNo),
    dispatchDate: firstFilled(record.dispatchDate, record.dispatch_date, source.dispatch_date, source.dispatchDate),
  };
}

/** Names for the packing-list table. Stored names win. The job list fills a blank. */
export function packingListParty(shipment, orders) {
  const matched = matchPackingOrder(orders, {
    orderId: shipment?.orderId,
    jobName: shipment?.jobName,
  });
  return {
    jobName: firstFilled(shipment?.jobName, matched?.jobName),
    clientName: firstFilled(
      shipment?.clientName,
      shipment?.customerName,
      matched?.clientName,
      matched?.customerName,
    ),
  };
}
