import React, { useEffect, useMemo, useState } from 'react';
import { Scissors, ScanBarcode, Plus, Trash2, X, Printer } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import UniversalBarcodeScannerModal from './UniversalBarcodeScannerModal';
import BarcodePrinterModal from './BarcodePrinterModal';
import {
  assessDirectSlitting,
  blendDirectSlitRate,
  directSlitRatesDiffer,
  directSlitStickerFromRow,
  formatDirectSlitRate,
  resolveDirectSlitRollRate
} from '../utils/directSlitting';
import { postDirectSlitting, reverseDirectSlitting } from '../services/directSlitting';
import { supabase } from '../services/supabaseClient';

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rollBarcode(roll) {
  return String(roll?.barcodeId || roll?.barcode_id || roll?.id || '').trim();
}

function filmParentFromScan(roll, inventory, grns) {
  const barcode = rollBarcode(roll);
  const available = num(roll?.availableWeightKg ?? roll?.available_weight_kg);
  const status = String(roll?.status || '');
  const qc = String(roll?.qcStatus || roll?.qc_status || '');
  const item = (inventory || []).find((row) => String(row?.id || '') === String(roll?.itemId || roll?.item_id || ''));
  const filmType = roll?.filmType || roll?.film_type || item?.filmType || '';
  const micron = num(roll?.micron || item?.micron);
  const widthMm = num(roll?.widthMm ?? roll?.width_mm ?? item?.widthMm ?? item?.width_mm);
  const inStock = available > 0 && /in stock/i.test(status) && !/pending|reject/i.test(`${status} ${qc}`);
  const film = Boolean(filmType) && micron > 0 && widthMm > 0 && !/fg|sfg|finished|semi-finished/i.test(String(roll?.rollType || roll?.roll_type || ''));
  return {
    ok: Boolean(barcode) && inStock && film,
    reason: !barcode ? 'Scan a roll barcode.' : !inStock ? 'That roll is not in stock.' : !film ? 'Direct slitting takes a film roll.' : '',
    parent: {
      barcode,
      availableKg: available,
      consumedKg: String(available || ''),
      widthMm,
      micron,
      filmType,
      density: num(item?.density) || 1.4,
      lengthMeters: num(roll?.lengthMeters ?? roll?.length_meters),
      metallocenePct: item?.metallocenePct || item?.metallocene_pct || roll?.metallocenePct || '',
      itemName: roll?.itemName || item?.itemName || barcode,
      purchaseRatePerKg: resolveDirectSlitRollRate(roll, { inventory, grns })
    }
  };
}

function stickerFromRow(row, recordedRate) {
  return directSlitStickerFromRow(row, recordedRate);
}

function childCodes(result) {
  const outputs = (result?.outputs || []).map((row) => row?.barcode).filter(Boolean);
  const balances = (result?.parents || []).map((row) => row?.balanceBarcode).filter(Boolean);
  return [...outputs, ...balances];
}

function recordedRateFor(result, code) {
  const output = (result?.outputs || []).find((row) => row?.barcode === code);
  if (output && output.purchaseRate !== undefined && output.purchaseRate !== null && output.purchaseRate !== '') {
    return output.purchaseRate;
  }
  return result?.purchaseRate;
}

async function loadStickers(result) {
  const codes = childCodes(result);
  if (!codes.length || !supabase) return [];
  const { data, error } = await supabase.from('inventory_rolls').select('*').in('barcode_id', codes);
  if (error) throw error;
  const byCode = new Map((data || []).map((row) => [row.barcode_id, row]));
  return codes
    .map((code) => {
      const row = byCode.get(code);
      return row ? stickerFromRow(row, recordedRateFor(result, code)) : null;
    })
    .filter(Boolean);
}

const emptyOutput = () => ({ key: `out-${Date.now()}`, widthMm: '', netKg: '', destination: 'inventory', orderId: '', lane: '1' });

export default function DirectSlittingModal({
  onClose,
  inventory = [],
  inventoryRolls = [],
  orders = [],
  grns = [],
  cylinders = [],
  jobMasters = [],
  inks = [],
  dispatchShipments = [],
  productionRecords = [],
  vendors = [],
  sfgGoods = [],
  canOverride = false,
  canReverse = false,
  onStockRefresh
}) {
  const [parents, setParents] = useState([]);
  const [outputs, setOutputs] = useState([emptyOutput()]);
  const [trimScrapKg, setTrimScrapKg] = useState('');
  const [settingScrapKg, setSettingScrapKg] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [formError, setFormError] = useState('');
  const [posting, setPosting] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [barcodeDraft, setBarcodeDraft] = useState('');
  const [printerOpen, setPrinterOpen] = useState(false);
  const [postedStickers, setPostedStickers] = useState([]);
  const [posted, setPosted] = useState(null);
  const [view, setView] = useState('entry');
  const [conversions, setConversions] = useState([]);
  const [listError, setListError] = useState('');
  const [reverseId, setReverseId] = useState('');
  const [reverseReason, setReverseReason] = useState('');

  const assessment = useMemo(() => assessDirectSlitting({
    parents: parents.map((parent) => ({ ...parent, consumedKg: num(parent.consumedKg) })),
    outputs: outputs.map((output) => ({
      widthMm: num(output.widthMm),
      netKg: num(output.netKg),
      lane: num(output.lane)
    })),
    trimScrapKg,
    settingScrapKg,
    filmType: parents[0]?.filmType,
    micron: parents[0]?.micron,
    density: parents[0]?.density,
    widthMm: parents[0]?.widthMm,
    metallocenePct: parents[0]?.metallocenePct
  }), [parents, outputs, trimScrapKg, settingScrapKg]);

  const previewParents = useMemo(() => parents.map((parent) => ({
    ...parent,
    consumedKg: num(parent.consumedKg)
  })), [parents]);
  const blend = blendDirectSlitRate(previewParents);
  const ratesDiffer = directSlitRatesDiffer(previewParents);

  useEffect(() => {
    if (view !== 'list') return undefined;
    let cancel = false;
    supabase.from('roll_conversions').select('*').order('converted_at', { ascending: false }).limit(40)
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) setListError(error.message || 'The conversion list could not be loaded.');
        else {
          setListError('');
          setConversions(data || []);
        }
      });
    return () => { cancel = true; };
  }, [view, posting]);

  const addParent = (roll) => {
    const picked = filmParentFromScan(roll, inventory, grns);
    if (!picked.ok) {
      setFormError(picked.reason);
      return;
    }
    if (parents.some((row) => row.barcode.toLowerCase() === picked.parent.barcode.toLowerCase())) {
      setFormError('That roll is already on this slit.');
      return;
    }
    setParents((rows) => [...rows, picked.parent]);
    setFormError('');
    setScanOpen(false);
    setBarcodeDraft('');
  };

  const addTypedParent = () => {
    const wanted = barcodeDraft.trim().toLowerCase();
    if (!wanted) {
      setFormError('Type a roll barcode.');
      return;
    }
    const roll = (inventoryRolls || []).find((row) => rollBarcode(row).toLowerCase() === wanted);
    if (!roll) {
      setFormError('That roll is not in stock.');
      return;
    }
    addParent(roll);
  };

  const resetEntry = () => {
    setParents([]);
    setOutputs([emptyOutput()]);
    setTrimScrapKg('');
    setSettingScrapKg('');
    setOverrideReason('');
    setFormError('');
    setBarcodeDraft('');
    setPosted(null);
    setPostedStickers([]);
    setPrinterOpen(false);
  };

  const openPrinter = (labels) => {
    setPostedStickers(labels);
    setPrinterOpen(labels.length > 0);
  };

  const post = async () => {
    if (!assessment.ok) {
      setFormError(assessment.errors[0] || 'This slit is not ready to post.');
      return;
    }
    if (assessment.overrideRequired && !canOverride) {
      setFormError('This slit is outside the allowed balance. An Admin or Plant Manager has to post it.');
      return;
    }
    if (assessment.overrideRequired && !overrideReason.trim()) {
      setFormError('A reason is required to post outside the balance.');
      return;
    }
    const missingOrder = outputs.find((row) => row.destination !== 'inventory' && !row.orderId);
    if (missingOrder) {
      setFormError('Choose the order for each SFG or FG output.');
      return;
    }
    setPosting(true);
    setFormError('');
    try {
      const linkedOrder = outputs.find((row) => row.destination !== 'inventory' && row.orderId)?.orderId || '';
      const result = await postDirectSlitting(supabase, {
        parents: parents.map((row) => ({ barcode: row.barcode, consumedKg: num(row.consumedKg) })),
        outputs: outputs.map((row) => ({
          destination: row.destination,
          widthMm: num(row.widthMm),
          netKg: num(row.netKg),
          lane: num(row.lane) || 1,
          orderId: row.destination === 'inventory' ? undefined : row.orderId
        })),
        trimScrapKg: num(trimScrapKg),
        settingScrapKg: num(settingScrapKg),
        overrideReason: assessment.overrideRequired ? overrideReason.trim() : undefined,
        orderId: linkedOrder || undefined
      });
      const labels = await loadStickers(result);
      if (typeof onStockRefresh === 'function') await onStockRefresh();
      setPosted(result);
      setView('success');
      openPrinter(labels);
      if (!labels.length) setFormError('The slit was posted. The sticker list could not be loaded.');
    } catch (error) {
      setFormError(error?.message || 'The slit was not posted.');
    } finally {
      setPosting(false);
    }
  };

  const reprint = async (row) => {
    setListError('');
    setPosting(true);
    try {
      const labels = await loadStickers(row?.result || {});
      if (!labels.length) {
        setListError('Those stickers could not be loaded.');
        return;
      }
      openPrinter(labels);
    } catch (error) {
      setListError(error?.message || 'Those stickers could not be loaded.');
    } finally {
      setPosting(false);
    }
  };

  const reverse = async () => {
    if (!reverseId || !reverseReason.trim()) return;
    setPosting(true);
    setListError('');
    try {
      await reverseDirectSlitting(supabase, reverseId, reverseReason.trim());
      if (typeof onStockRefresh === 'function') await onStockRefresh();
      setReverseId('');
      setReverseReason('');
      setView('list');
      const { data, error } = await supabase.from('roll_conversions').select('*').order('converted_at', { ascending: false }).limit(40);
      if (error) setListError(error.message);
      else setConversions(data || []);
    } catch (error) {
      setListError(error?.message || 'The conversion was not reversed.');
    } finally {
      setPosting(false);
    }
  };

  const varianceTone = assessment.overrideRequired ? '#b91c1c' : assessment.metresStatus === 'warn' ? '#b45309' : '#166534';
  const historyRate = (row) => formatDirectSlitRate(row?.purchase_rate ?? row?.result?.purchaseRate);

  return (
    <>
      <ModalOverlay onClose={onClose} style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 0 }}>
        <div className="direct-slit-sheet" role="dialog" aria-modal="true" aria-labelledby="direct-slit-title">
          <header className="direct-slit-head">
            <h2 id="direct-slit-title"><Scissors size={18} /> Direct slitting</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {view === 'success' ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setView('list')}>Conversions</button>
                  <button type="button" className="btn-primary" onClick={() => { resetEntry(); setView('entry'); }}>New slit</button>
                </>
              ) : (
                <button type="button" className={view === 'list' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView(view === 'list' ? 'entry' : 'list')}>
                  {view === 'list' ? 'New slit' : 'Conversions'}
                </button>
              )}
              <button type="button" className="btn-secondary" data-modal-dismiss="" onClick={onClose} aria-label="Close">
                <X size={16} /> Close
              </button>
            </div>
          </header>

          {view === 'list' ? (
            <div className="direct-slit-body">
              {listError && <p className="direct-slit-error" role="alert">{listError}</p>}
              {conversions.length === 0 && !listError && <p>No direct slits have been posted.</p>}
              <ul className="direct-slit-list">
                {conversions.map((row) => (
                  <li key={row.id}>
                    <strong>{row.id}</strong>
                    <span>{row.status}</span>
                    <span>{Number(row.consumed_kg) || 0} kg consumed</span>
                    <span>{row.film_type || ''} {row.width_mm || ''} mm</span>
                    <span aria-label={`History rate ${row.id}`}>{historyRate(row)}</span>
                    {row.status === 'posted' && (
                      <button type="button" className="btn-secondary" aria-label={`Print stickers ${row.id}`} disabled={posting} onClick={() => reprint(row)}>
                        <Printer size={16} /> Print stickers
                      </button>
                    )}
                    {canReverse && row.status === 'posted' && (
                      <button type="button" className="btn-secondary" aria-label={`Reverse ${row.id}`} onClick={() => { setReverseId(row.id); setReverseReason(''); }}>
                        Reverse
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {reverseId && (
                <div className="direct-slit-reverse">
                  <label htmlFor="reverse-reason">Reason for reversing {reverseId}</label>
                  <input id="reverse-reason" value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} />
                  <button type="button" className="btn-primary" disabled={posting || !reverseReason.trim()} onClick={reverse}>Confirm reverse</button>
                  <button type="button" className="btn-secondary" onClick={() => setReverseId('')}>Cancel</button>
                </div>
              )}
            </div>
          ) : view === 'success' && posted ? (
            <div className="direct-slit-body">
              {formError && <p className="direct-slit-error" role="alert">{formError}</p>}
              <section className="direct-slit-card" aria-label="Slit posted">
                <div>
                  <strong>{posted.id}</strong>
                  <div>New rolls and balance rolls are valued at {formatDirectSlitRate(posted.purchaseRate)}.</div>
                </div>
                <button type="button" className="btn-primary" aria-label="Print stickers" onClick={() => setPrinterOpen(true)} disabled={!postedStickers.length}>
                  <Printer size={16} /> Print stickers
                </button>
              </section>
              <section>
                <h3>Mother rolls</h3>
                {(posted.parents || []).map((parent) => (
                  <div key={parent.barcode} className="direct-slit-card">
                    <div>
                      <strong>{parent.barcode}</strong>
                      <div>{parent.consumedKg} kg used · balance {parent.balanceKg} kg</div>
                      {parent.balanceBarcode && <div>Balance roll {parent.balanceBarcode}</div>}
                    </div>
                    <div aria-label={`Recorded rate ${parent.barcode}`}>{formatDirectSlitRate(parent.purchaseRate)}</div>
                  </div>
                ))}
              </section>
              <section>
                <h3>New rolls</h3>
                {(posted.outputs || []).map((output) => (
                  <div key={output.barcode} className="direct-slit-card">
                    <div>
                      <strong>{output.barcode}</strong>
                      <div>{output.widthMm} mm · {output.netKg} kg · {output.lengthMeters || '—'} m · {output.destination}</div>
                    </div>
                    <div aria-label={`Recorded rate ${output.barcode}`}>{formatDirectSlitRate(output.purchaseRate ?? posted.purchaseRate)}</div>
                  </div>
                ))}
                {(posted.parents || []).filter((parent) => parent.balanceBarcode).map((parent) => (
                  <div key={parent.balanceBarcode} className="direct-slit-card">
                    <div>
                      <strong>{parent.balanceBarcode}</strong>
                      <div>{parents.find((row) => row.barcode === parent.barcode)?.widthMm || ''} mm · {parent.balanceKg} kg · balance roll</div>
                    </div>
                    <div aria-label={`Recorded rate ${parent.balanceBarcode}`}>{formatDirectSlitRate(posted.purchaseRate)}</div>
                  </div>
                ))}
              </section>
            </div>
          ) : (
            <>
              <div className="direct-slit-body">
                {formError && <p className="direct-slit-error" role="alert">{formError}</p>}
                <section>
                  <div className="direct-slit-section-head">
                    <h3>Parent rolls</h3>
                    <button type="button" className="btn-secondary" onClick={() => setScanOpen(true)}>
                      <ScanBarcode size={16} /> Scan roll
                    </button>
                  </div>
                  <div className="direct-slit-type">
                    <label>
                      Barcode
                      <input aria-label="Parent barcode" value={barcodeDraft} onChange={(event) => setBarcodeDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTypedParent(); } }} />
                    </label>
                    <button type="button" className="btn-secondary" onClick={addTypedParent}>Add roll</button>
                  </div>
                  {parents.length === 0 && <p>Scan a film roll that is in stock.</p>}
                  {parents.map((parent) => (
                    <div key={parent.barcode} className="direct-slit-card">
                      <div>
                        <strong>{parent.barcode}</strong>
                        <div>{parent.itemName} · {parent.widthMm} mm · {parent.availableKg} kg in stock</div>
                        <div aria-label={`Rate ${parent.barcode}`}>{formatDirectSlitRate(parent.purchaseRatePerKg)}</div>
                      </div>
                      <label>
                        Consumed kg
                        <input
                          inputMode="decimal"
                          aria-label={`Consumed kg ${parent.barcode}`}
                          value={parent.consumedKg}
                          onChange={(event) => setParents((rows) => rows.map((row) => row.barcode === parent.barcode ? { ...row, consumedKg: event.target.value } : row))}
                        />
                      </label>
                      <button type="button" aria-label={`Remove ${parent.barcode}`} onClick={() => setParents((rows) => rows.filter((row) => row.barcode !== parent.barcode))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {ratesDiffer && (
                    <p className="direct-slit-blend" aria-label="Blended rate">
                      New rolls and balance rolls will be valued at {formatDirectSlitRate(blend)} (weighted by kilograms used).
                    </p>
                  )}
                </section>

                <section>
                  <div className="direct-slit-section-head">
                    <h3>Outputs</h3>
                    <button type="button" className="btn-secondary" onClick={() => setOutputs((rows) => [...rows, { key: `out-${Date.now()}`, widthMm: '', netKg: '', destination: 'inventory', orderId: '', lane: String(rows.length + 1) }])}>
                      <Plus size={16} /> Add output
                    </button>
                  </div>
                  {outputs.map((output, index) => (
                    <div key={output.key} className="direct-slit-card direct-slit-output">
                      <label>Width mm
                        <input aria-label={`Output ${index + 1} width`} inputMode="decimal" value={output.widthMm} onChange={(event) => setOutputs((rows) => rows.map((row) => row.key === output.key ? { ...row, widthMm: event.target.value } : row))} />
                      </label>
                      <label>Net kg
                        <input aria-label={`Output ${index + 1} net kg`} inputMode="decimal" value={output.netKg} onChange={(event) => setOutputs((rows) => rows.map((row) => row.key === output.key ? { ...row, netKg: event.target.value } : row))} />
                      </label>
                      <label>Lane
                        <input aria-label={`Output ${index + 1} lane`} inputMode="numeric" value={output.lane} onChange={(event) => setOutputs((rows) => rows.map((row) => row.key === output.key ? { ...row, lane: event.target.value } : row))} />
                      </label>
                      <label>Goes to
                        <select aria-label={`Output ${index + 1} destination`} value={output.destination} onChange={(event) => setOutputs((rows) => rows.map((row) => row.key === output.key ? { ...row, destination: event.target.value } : row))}>
                          <option value="inventory">Inventory width</option>
                          <option value="sfg">SFG for an order</option>
                          <option value="fg">FG for an order</option>
                        </select>
                      </label>
                      {output.destination !== 'inventory' && (
                        <label>Order
                          <select aria-label={`Output ${index + 1} order`} value={output.orderId} onChange={(event) => setOutputs((rows) => rows.map((row) => row.key === output.key ? { ...row, orderId: event.target.value } : row))}>
                            <option value="">Choose an order</option>
                            {(orders || []).map((order) => (
                              <option key={order.id} value={order.id}>{order.id} · {order.jobName || order.job_name || ''}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="direct-slit-metres">{assessment.outputs[index]?.lengthMeters ? `${assessment.outputs[index].lengthMeters} m` : '—'}</div>
                      <button type="button" aria-label={`Remove output ${index + 1}`} disabled={outputs.length === 1} onClick={() => setOutputs((rows) => rows.filter((row) => row.key !== output.key))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </section>

                <section className="direct-slit-scrap">
                  <label>Trim / edge scrap kg
                    <input aria-label="Trim scrap kg" inputMode="decimal" value={trimScrapKg} onChange={(event) => setTrimScrapKg(event.target.value)} />
                  </label>
                  <label>Core / setting wastage kg
                    <input aria-label="Setting scrap kg" inputMode="decimal" value={settingScrapKg} onChange={(event) => setSettingScrapKg(event.target.value)} />
                  </label>
                </section>

                {assessment.metresStatus === 'warn' && (
                  <p className="direct-slit-warn">Running length is {assessment.metresPct}% away from the parent. You can still post.</p>
                )}
                {assessment.overrideRequired && (
                  canOverride ? (
                    <label className="direct-slit-override">Reason for posting outside the balance
                      <textarea aria-label="Override reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
                    </label>
                  ) : (
                    <p className="direct-slit-error">This slit is outside 0.50 kg or 25% running length. An Admin or Plant Manager can post it with a reason.</p>
                  )
                )}
              </div>
              <footer className="direct-slit-footer" style={{ color: varianceTone }}>
                <span>Consumed {assessment.consumedKg} kg</span>
                <span>Outputs {assessment.outputKg} kg</span>
                <span>Scrap {assessment.trimScrapKg + assessment.settingScrapKg} kg</span>
                <span>Balance {assessment.balanceKg} kg</span>
                <span>Variance {assessment.varianceKg} kg</span>
                <span aria-label="Review rate">{parents.length ? formatDirectSlitRate(blend) : '₹—'}</span>
                <button type="button" className="btn-primary" disabled={posting} onClick={post}>
                  {posting ? 'Posting…' : 'Post slit'}
                </button>
              </footer>
            </>
          )}
        </div>
        <style>{`
          .direct-slit-sheet { background: #fff; width: min(960px, 100%); max-height: 100dvh; height: 100dvh; display: flex; flex-direction: column; }
          @media (min-width: 800px) {
            .direct-slit-sheet { height: min(920px, calc(100dvh - 32px)); margin: 16px; border-radius: 16px; box-shadow: 0 20px 50px rgba(15,23,42,.2); }
          }
          .direct-slit-head, .direct-slit-footer { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px 14px; }
          .direct-slit-head { border-bottom: 1px solid #e2e8f0; }
          .direct-slit-head h2 { margin: 0; display: flex; gap: 8px; align-items: center; font-size: 1.05rem; }
          .direct-slit-footer { border-top: 1px solid #e2e8f0; position: sticky; bottom: 0; background: #fff; font-weight: 700; }
          .direct-slit-body { overflow: auto; padding: 12px 14px 20px; display: flex; flex-direction: column; gap: 16px; }
          .direct-slit-section-head, .direct-slit-card { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; }
          .direct-slit-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-top: 8px; }
          .direct-slit-card label, .direct-slit-scrap label, .direct-slit-override, .direct-slit-type label { display: flex; flex-direction: column; gap: 4px; font-size: .82rem; font-weight: 700; }
          .direct-slit-card input, .direct-slit-card select, .direct-slit-scrap input, .direct-slit-override textarea, .direct-slit-reverse input, .direct-slit-type input { font: inherit; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; min-width: 0; width: 100%; }
          .direct-slit-output { align-items: end; }
          .direct-slit-type { display: flex; gap: 8px; align-items: end; margin-top: 8px; }
          .direct-slit-type label { flex: 1; }
          .direct-slit-scrap { display: grid; grid-template-columns: 1fr; gap: 10px; }
          @media (min-width: 700px) { .direct-slit-scrap { grid-template-columns: 1fr 1fr; } }
          .direct-slit-error { color: #b91c1c; font-weight: 700; margin: 0; }
          .direct-slit-warn, .direct-slit-blend { color: #b45309; font-weight: 700; margin: 8px 0 0; }
          .direct-slit-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
          .direct-slit-list li, .direct-slit-reverse { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; }
          .direct-slit-metres { font-weight: 800; color: #1e3a8a; }
          .direct-slit-sheet button { min-height: 44px; }
        `}</style>
      </ModalOverlay>
      {scanOpen && (
        <UniversalBarcodeScannerModal
          isOpen
          onClose={() => setScanOpen(false)}
          inventoryRolls={inventoryRolls}
          inventory={inventory}
          orders={orders}
          grns={grns}
          cylinders={cylinders}
          jobMasters={jobMasters}
          inks={inks}
          dispatchShipments={dispatchShipments}
          productionRecords={productionRecords}
          vendors={vendors}
          sfgGoods={sfgGoods}
          onPickRoll={addParent}
        />
      )}
      {printerOpen && postedStickers.length > 0 && (
        <BarcodePrinterModal
          rolls={postedStickers}
          inventory={inventory}
          inks={inks}
          inventoryRolls={inventoryRolls}
          onClose={() => setPrinterOpen(false)}
        />
      )}
    </>
  );
}
