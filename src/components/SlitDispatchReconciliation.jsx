import React from 'react';
import { AlertTriangle, Scale } from 'lucide-react';
import {
  ROLL_STATUS,
  formatSignedKg,
  formatSignedPct,
  reconciliationBadge,
  withinSlitDispatchTolerance
} from '../utils/slitDispatchReconciliation';

const TONE = {
  danger: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  warn: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  ok: { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' },
  neutral: { background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0' }
};

function toneForDifference(kg, within) {
  if (within || roundIsZero(kg)) return 'ok';
  return kg > 0 ? 'warn' : 'danger';
}

function roundIsZero(kg) {
  return Math.abs(Number(kg) || 0) < 0.005;
}

const STATUS_TONE = {
  [ROLL_STATUS.DISPATCHED]: 'ok',
  [ROLL_STATUS.ON_PACKING_LIST]: 'warn',
  [ROLL_STATUS.PENDING_FACTORY]: 'danger',
  [ROLL_STATUS.UNMATCHED_PACKING_LIST]: 'danger',
  [ROLL_STATUS.JOB_TOTALS]: 'neutral',
  [ROLL_STATUS.NO_ROLL_BARCODE]: 'warn'
};

export function SlitDispatchBadge({ result }) {
  const badge = reconciliationBadge(result);
  if (!badge) return null;
  const tone = TONE[badge.tone] || TONE.warn;
  return (
    <span
      data-testid="slit-dispatch-badge"
      className="badge"
      style={{
        ...tone,
        fontSize: '0.7rem',
        fontWeight: 800,
        marginTop: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      <AlertTriangle size={11} /> {badge.label}
    </span>
  );
}

function Stat({ label, value, detail, tone = 'neutral', testId }) {
  const colours = TONE[tone] || TONE.neutral;
  return (
    <div data-testid={testId} style={{ background: '#ffffff', borderRadius: '10px', border: colours.border, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: colours.color, marginTop: '4px' }}>{value}</div>
      {detail ? <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>{detail}</div> : null}
    </div>
  );
}

function kgCell(value) {
  if (value == null) return '—';
  return `${Number(value).toFixed(2)} kg`;
}

export default function SlitDispatchReconciliation({ result }) {
  if (!result) return null;
  const finalTone = toneForDifference(result.differenceKg, result.withinTolerance);
  const scaleWithin = result.scaleDifferenceKg == null
    || withinSlitDispatchTolerance(result.scaleDifferenceKg, result.scaleDifferencePct, result.tolerancePct, result.toleranceKg);
  const basisLabel = result.comparisonBasis === 'dispatched'
    ? 'Dispatched net − slitted net'
    : 'Weighed net − slitted net (nothing on a delivery challan yet)';
  const hasRows = result.rows.length > 0;
  const empty = result.slittedRollCount === 0 && result.weighedRollCount === 0 && result.weighedNetKg === 0;

  return (
    <section
      data-testid="slit-dispatch-reconciliation"
      style={{ margin: '0 0 24px', padding: '20px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Scale size={20} style={{ color: '#0f766e' }} /> Slitting vs Dispatch Reconciliation
        </h4>
        <SlitDispatchBadge result={result} />
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#475569', maxWidth: '820px' }}>
        Finished child rolls from slitting or pouching, compared with the net weight recorded on Scale #4 packing lists and issued on a delivery challan.
        {' '}{basisLabel}. {result.toleranceText}
        {' '}Scrap is excluded. Balance rolls and weight kept on the parent lot are leftover stock, not finished child rolls, so they are listed and left out of the totals.
      </p>

      {result.alarms.length > 0 && (
        <div role="alert" data-testid="slit-dispatch-alarm" style={{ ...TONE.danger, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          {result.alarms.map((alarm) => (
            <div key={alarm} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.84rem', fontWeight: 700, marginTop: result.alarms[0] === alarm ? 0 : 6 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{alarm}</span>
            </div>
          ))}
        </div>
      )}

      {result.jobTotalsReason && (
        <div data-testid="slit-dispatch-job-totals" style={{ ...TONE.warn, borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '0.82rem', fontWeight: 700 }}>
          {result.jobTotalsReason}
        </div>
      )}

      {empty ? (
        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
          No slitted or pouched finished rolls, and no packing-list weights, are linked to this job yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <Stat
              testId="slit-dispatch-slitted"
              label="Slitted / pouched"
              value={`${result.slittedNetKg.toFixed(2)} kg`}
              detail={`${result.slittedRollCount} finished roll${result.slittedRollCount === 1 ? '' : 's'}`}
            />
            <Stat
              testId="slit-dispatch-weighed"
              label="Weighed on packing lists"
              value={`${result.weighedNetKg.toFixed(2)} kg`}
              detail={`${result.weighedRollCount} roll${result.weighedRollCount === 1 ? '' : 's'} on Scale #4`}
            />
            <Stat
              testId="slit-dispatch-dispatched"
              label="Dispatched on a DC"
              value={`${result.dispatchedNetKg.toFixed(2)} kg`}
              detail={`${result.dispatchedRollCount} roll${result.dispatchedRollCount === 1 ? '' : 's'} issued`}
            />
            <Stat
              testId="slit-dispatch-final"
              tone={finalTone}
              label="Final loss or gain"
              value={`${formatSignedKg(result.differenceKg)} (${formatSignedPct(result.differencePct)})`}
              detail={result.withinTolerance ? 'Inside tolerance' : 'Outside tolerance'}
            />
          </div>

          {result.scaleRollCount > 0 && (
            <div data-testid="slit-dispatch-scale" style={{ fontSize: '0.82rem', color: scaleWithin ? '#047857' : '#9a3412', fontWeight: 700, marginBottom: '12px' }}>
              Weight difference on {result.scaleRollCount} roll{result.scaleRollCount === 1 ? '' : 's'} weighed at both stations: {formatSignedKg(result.scaleDifferenceKg)} ({formatSignedPct(result.scaleDifferencePct)}).
              {' '}This is the scale variance only. Rolls not weighed yet are not treated as a scale loss here.
            </div>
          )}

          {(result.balanceRolls.length > 0 || result.balanceKeptKg > 0) && (
            <div data-testid="slit-dispatch-balance" style={{ ...TONE.neutral, borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '0.8rem' }}>
              <strong>Balance, not in the totals.</strong>
              {' '}
              {result.balanceRolls.length > 0 && (
                <span>
                  {result.balanceRolls.length} balance roll{result.balanceRolls.length === 1 ? '' : 's'}
                  {' '}({result.balanceRolls.map((roll) => `${roll.barcode} ${roll.netKg.toFixed(2)} kg`).join(', ')}).
                  {' '}
                </span>
              )}
              {result.balanceKeptKg > 0 && (
                <span>
                  {result.balanceKeptKg.toFixed(2)} kg kept on the parent lot
                  {result.balanceKept.length > 0 ? ` (${result.balanceKept.map((row) => `${row.barcode} ${row.netKg.toFixed(2)} kg`).join(', ')})` : ''}.
                </span>
              )}
              {' '}A balance roll is leftover film, not a finished child roll, so it is not expected on a packing list.
            </div>
          )}

          {result.scrapExcludedCount > 0 && (
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '10px' }}>
              {result.scrapExcludedCount} scrap record{result.scrapExcludedCount === 1 ? '' : 's'} for this job {result.scrapExcludedCount === 1 ? 'is' : 'are'} excluded. Scrap is not a dispatchable roll.
            </div>
          )}

          {hasRows && (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" data-testid="slit-dispatch-rolls" style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Barcode</th>
                    <th>Slitted kg</th>
                    <th>Packing list kg</th>
                    <th>Variance</th>
                    <th>Packing list</th>
                    <th>Delivery challan</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => {
                    const statusTone = TONE[STATUS_TONE[row.status]] || TONE.neutral;
                    const varianceTone = row.varianceKg == null ? '#64748b' : (Math.abs(row.varianceKg) < 0.005 ? '#047857' : (row.varianceKg > 0 ? '#b45309' : '#b91c1c'));
                    return (
                      <tr key={`${row.status}-${row.barcode}-${row.packingListId}`} data-testid={`slit-dispatch-row-${row.barcode}`}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.barcode}</td>
                        <td>{kgCell(row.slittedNetKg)}</td>
                        <td>{kgCell(row.packingNetKg)}</td>
                        <td style={{ fontWeight: 800, color: varianceTone }}>{row.varianceKg == null ? '—' : formatSignedKg(row.varianceKg)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.packingListId || '—'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.challanNo || '—'}</td>
                        <td>
                          <span className="badge" style={{ ...statusTone, fontSize: '0.7rem', fontWeight: 800 }}>{row.statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
