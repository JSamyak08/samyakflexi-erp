import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import { sendTestLabel } from '../services/barcodeStickerPrint';
import {
  qzConnection,
  rememberGapMm,
  rememberQzPrinter,
  selectedGapMm,
  selectedQzPrinter,
} from '../services/qzTray';

export default function BarcodePrinterSettings() {
  const [link, setLink] = useState({ connected: false, printers: [], error: '' });
  const [printer, setPrinter] = useState(selectedQzPrinter());
  const [gapMm, setGapMm] = useState(String(selectedGapMm()));
  const [allowlist, setAllowlist] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLink(await qzConnection());
    if (!isSupabaseConfigured()) {
      setAllowlist([]);
      return;
    }
    const { data, error } = await supabase
      .from('barcode_printer_allowlist')
      .select('printer_name')
      .order('printer_name');
    if (error) {
      setNote(error.message || 'Could not read the printer allow list.');
      return;
    }
    setAllowlist((data || []).map((row) => row.printer_name));
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    const name = printer.trim();
    if (!name || name.toLowerCase() === 'browser') {
      setNote('Pick the Windows name of the TSC printer.');
      return;
    }
    rememberQzPrinter(name);
    rememberGapMm(gapMm);
    if (!isSupabaseConfigured()) {
      setNote('Saved on this PC. Sign in with Supabase to add it to the allow list.');
      return;
    }
    const { error } = await supabase.from('barcode_printer_allowlist').insert({
      printer_name: name,
      created_by: 'Operator',
    });
    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
      setNote(error.message || 'Could not save the printer.');
      return;
    }
    setNote(`${name} is allow-listed for confirmed prints.`);
    refresh();
  };

  const remove = async (name) => {
    if (selectedQzPrinter() === name) rememberQzPrinter('');
    if (!isSupabaseConfigured()) return;
    await supabase.from('barcode_printer_allowlist').delete().eq('printer_name', name);
    refresh();
  };

  const testPrint = async () => {
    setBusy(true);
    setNote('');
    try {
      rememberQzPrinter(printer.trim());
      rememberGapMm(gapMm);
      const result = await sendTestLabel();
      const status = result?.job_status || 'queued';
      setNote(status === 'printed'
        ? 'Test label finished in the Windows spooler. Status would show Printed for that job.'
        : `Test label sent. Spooler result: ${status}. Printed is recorded only after a finished job.`);
    } catch (error) {
      setNote(error?.message || 'Test print failed.');
    } finally {
      setBusy(false);
    }
  };

  const saved = allowlist.some((name) => name === printer.trim());

  return (
    <div className="glass-panel" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={16} /> TSC sticker printer
          </div>
          <div style={{ marginTop: '4px', fontSize: '0.82rem', color: link.connected ? '#047857' : '#b45309' }}>
            {link.connected ? 'QZ Tray connected' : 'QZ Tray not connected'}
            {link.error && !link.connected ? ` — ${link.error}` : ''}
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={refresh} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
          Refresh
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
        <select
          aria-label="QZ printer"
          value={printer}
          onChange={(event) => setPrinter(event.target.value)}
          style={{ minWidth: '220px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
        >
          <option value="">Select the TSC printer</option>
          {[...new Set([printer, ...link.printers, ...allowlist].filter(Boolean))].map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <label style={{ fontSize: '0.8rem', color: '#475569' }}>
          Gap mm
          <input
            aria-label="Label gap millimetres"
            value={gapMm}
            onChange={(event) => setGapMm(event.target.value)}
            style={{ width: '64px', marginLeft: '6px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
          />
        </label>
        <button type="button" className="btn-secondary" onClick={save} style={{ padding: '6px 10px' }}>
          {saved ? 'Saved' : 'Save printer'}
        </button>
        <button type="button" className="btn-secondary" onClick={testPrint} disabled={busy} style={{ padding: '6px 10px' }}>
          {busy ? 'Printing…' : 'Test print'}
        </button>
      </div>
      {allowlist.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#475569' }}>
          Allow list: {allowlist.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => remove(name)}
              style={{ marginLeft: '6px', border: '1px solid #cbd5e1', borderRadius: '999px', background: '#fff', padding: '2px 8px', cursor: 'pointer' }}
            >
              {name} ×
            </button>
          ))}
        </div>
      )}
      {note && <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#334155' }}>{note}</div>}
    </div>
  );
}
