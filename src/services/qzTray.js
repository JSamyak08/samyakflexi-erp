import { classifySpoolerStatus, eventMatchesJob, spoolerEventStatus } from '../utils/qzJob';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const PRINTER_KEY = 'samyak_qz_printer';
const GAP_KEY = 'samyak_qz_gap_mm';

let qzModule = null;
let signingReady = false;

function storageGet(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode can reject storage. The allow-list in the database still holds the printer.
  }
}

export function selectedQzPrinter() {
  return storageGet(PRINTER_KEY).trim();
}

export function rememberQzPrinter(name) {
  storageSet(PRINTER_KEY, String(name || '').trim());
}

export function selectedGapMm() {
  const gap = Number(storageGet(GAP_KEY) || '3');
  if (!Number.isFinite(gap) || gap < 0 || gap > 20) return 3;
  return gap;
}

export function rememberGapMm(gapMm) {
  storageSet(GAP_KEY, String(gapMm));
}

async function loadQz() {
  if (!qzModule) {
    const loaded = await import('qz-tray');
    qzModule = loaded.default || loaded;
  }
  return qzModule;
}

async function attachSigning(qz) {
  if (signingReady || !isSupabaseConfigured()) return;
  const { data, error } = await supabase.functions.invoke('qz-sign', {
    body: { action: 'certificate' },
  });
  const certificate = typeof data === 'string' ? data : data?.certificate;
  if (error || !certificate) return;

  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setCertificatePromise((resolve) => resolve(certificate));
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    supabase.functions.invoke('qz-sign', { body: { action: 'sign', request: toSign } })
      .then(({ data: signed, error: signError }) => {
        const signature = typeof signed === 'string' ? signed : signed?.signature;
        if (signError || !signature) reject(signError || new Error('QZ signing is not configured'));
        else resolve(signature);
      })
      .catch(reject);
  });
  signingReady = true;
}

export async function qzConnection() {
  try {
    const qz = await loadQz();
    await attachSigning(qz);
    if (!qz.websocket.isActive()) await qz.websocket.connect();
    const found = await qz.printers.find();
    const printers = Array.isArray(found) ? found : (found ? [found] : []);
    return { connected: true, printers, error: '' };
  } catch (error) {
    return { connected: false, printers: [], error: error?.message || 'QZ Tray is not running' };
  }
}

/**
 * Send raw TSPL, then wait for the Windows spooler.
 * Listening starts before the print so a fast COMPLETE is not missed.
 * A timeout or a missing listener returns '' and the job stays queued.
 */
export async function printTsplAndWait(printer, tspl, jobId, timeoutMs = 45000) {
  const qz = await loadQz();
  if (!qz.websocket.isActive()) await qz.websocket.connect();

  let settled = false;
  let finish = () => {};
  const result = new Promise((resolve) => {
    finish = resolve;
  });
  const done = (statusText) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      qz.printers.setPrinterCallbacks(null);
    } catch {
      // The socket may already be gone.
    }
    qz.printers.stopListening().catch(() => {});
    finish(statusText || '');
  };
  const timer = setTimeout(() => done(''), timeoutMs);
  qz.printers.setPrinterCallbacks((event) => {
    if (!eventMatchesJob(event, jobId)) return;
    const statusText = spoolerEventStatus(event);
    if (classifySpoolerStatus(statusText) === 'pending') return;
    done(statusText);
  });

  let listening = false;
  try {
    await qz.printers.startListening(printer, { jobData: true });
    listening = true;
  } catch (error) {
    console.warn('[qz] job listener', error?.message || error);
  }

  try {
    const config = qz.configs.create(printer, { jobName: jobId || null });
    await qz.print(config, [{
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: tspl,
    }]);
  } catch (error) {
    done('');
    throw error;
  }

  if (!jobId || !listening) done('');
  return result;
}
