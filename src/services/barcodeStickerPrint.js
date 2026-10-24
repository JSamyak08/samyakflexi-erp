import { openBarcodePrintJob, settleBarcodePrintJob } from './barcodePrintJob';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { printTsplAndWait, qzConnection, selectedGapMm, selectedQzPrinter } from './qzTray';
import { classifySpoolerStatus } from '../utils/qzJob';
import { buildTestTspl, buildTsplLabel, describeSticker } from '../utils/stickerLabel';

async function allowedPrinter(name) {
  const printer = String(name || '').trim();
  if (!printer || !isSupabaseConfigured()) return '';
  const { data, error } = await supabase
    .from('barcode_printer_allowlist')
    .select('printer_name')
    .eq('printer_name', printer);
  if (error) {
    console.warn('[barcode printer]', error.message || error);
    return '';
  }
  const hit = (data || []).find((row) => String(row.printer_name || '').toLowerCase() === printer.toLowerCase());
  return hit?.printer_name || '';
}

export async function configuredQzPrinter() {
  const selected = selectedQzPrinter();
  if (!selected) return '';
  const link = await qzConnection();
  if (!link.connected) return '';
  return allowedPrinter(selected);
}

function logFrom(roll, result, printer, printedBy) {
  return {
    barcode: result?.barcode || roll.barcode,
    source_module: roll.sourceModule || null,
    job_id: result?.job_id || '',
    job_status: result?.job_status || 'queued',
    printer: result?.printer || printer,
    printed_at: new Date().toISOString(),
    printed_by: printedBy || 'Operator',
  };
}

/**
 * Sends each sticker as TSPL when QZ Tray is up and the printer is allow-listed.
 * Returns mode 'browser' when that path is not available so the caller can use window.print().
 */
export async function sendStickersWithQz({ rolls, company, inventory, inks, printedBy, rateFor }) {
  const printer = await configuredQzPrinter();
  if (!printer) return { mode: 'browser', logs: [] };

  const gapMm = selectedGapMm();
  const logs = [];
  for (const roll of rolls || []) {
    const sticker = describeSticker(roll, {
      company,
      inventory,
      inks,
      rate: rateFor ? rateFor(roll) : undefined,
    });
    const opened = await openBarcodePrintJob({
      printer,
      barcode: sticker.barcode,
      sourceModule: roll.sourceModule,
      printedBy,
    });
    const jobId = opened?.job_id || '';
    const tspl = buildTsplLabel(sticker, { gapMm });
    let spoolerStatus = '';
    try {
      spoolerStatus = await printTsplAndWait(printer, tspl, jobId);
    } catch (error) {
      console.warn('[qz] print', error?.message || error);
      if (jobId) {
        logs.push(logFrom({ ...roll, barcode: sticker.barcode }, opened, printer, printedBy));
      }
      continue;
    }
    let settled = opened;
    if (jobId && classifySpoolerStatus(spoolerStatus) !== 'pending') {
      settled = await settleBarcodePrintJob({ jobId, printer, spoolerStatus }) || opened;
    }
    if (settled?.job_id) logs.push(logFrom({ ...roll, barcode: sticker.barcode }, settled, printer, printedBy));
  }
  return { mode: 'qz', logs };
}

export async function sendTestLabel() {
  const printer = await configuredQzPrinter();
  if (!printer) {
    throw new Error('Choose a QZ printer and save it to the allow list first.');
  }
  const opened = await openBarcodePrintJob({
    printer,
    barcode: 'QZ-TEST',
    sourceModule: 'Barcode print',
    printedBy: 'Operator',
  });
  const spoolerStatus = await printTsplAndWait(printer, buildTestTspl({ gapMm: selectedGapMm(), printerName: printer }), opened?.job_id || 'QZ-TEST');
  if (opened?.job_id && classifySpoolerStatus(spoolerStatus) !== 'pending') {
    return settleBarcodePrintJob({ jobId: opened.job_id, printer, spoolerStatus });
  }
  return { job_status: opened?.job_status || 'queued', spoolerStatus };
}
