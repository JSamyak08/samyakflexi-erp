import { barcodeCode, isFifoConsumeFirst } from '../../utils/barcodeFifo.js';

export function presentFifoLine(row, unitStr, formatPlantDate) {
  const fifo = row?.fifo || {};
  const code = barcodeCode(row?.roll);
  const ageDays = fifo.display?.ageDays;
  const ageText = ageDays == null
    ? '—'
    : `${ageDays} day${ageDays === 1 ? '' : 's'}${fifo.display?.frozen ? ' (frozen)' : ''}`;
  const originText = fifo.origin && formatPlantDate ? formatPlantDate(fifo.origin.toISOString()) : '—';
  const qtyText = `${Number(fifo.balanceQty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unitStr || ''}`.trim();
  return {
    code,
    qtyText,
    ageText,
    originText,
    frozen: Boolean(fifo.display?.frozen),
  };
}

export function presentFifoLines(rows, unitStr, formatPlantDate) {
  return (rows || []).map((row) => ({
    ...presentFifoLine(row, unitStr, formatPlantDate),
    prefer: isFifoConsumeFirst(row, rows),
  }));
}
