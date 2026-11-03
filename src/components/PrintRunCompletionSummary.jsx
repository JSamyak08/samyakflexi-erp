import React from 'react';
import { CheckCircle2, QrCode, X } from 'lucide-react';
import { labelRoll } from '../utils/printRunCompletion';
import { rollsEligibleForBarcodeLabel } from '../utils/scrapIdentity';

function kg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(2)} kg`;
}

function meters(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return `${number.toLocaleString()} m`;
}

function TagButton({ onClick, testId, children }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        color: '#1d4ed8',
        borderRadius: '8px',
        padding: '6px 10px',
        fontSize: '0.78rem',
        fontWeight: '800',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      <QrCode size={13} /> {children}
    </button>
  );
}

/**
 * Rolls an operator needs after End Job: printed SFG, balance, and what was consumed.
 * Print Tag stays available for a view-only SFG / FG Store user.
 */
export default function PrintRunCompletionSummary({
  jobName = '',
  jobCode = '',
  orderId = '',
  clientName = '',
  filmType = '',
  meters: jobMeters = null,
  printedRolls = [],
  balanceRolls = [],
  consumedRolls = [],
  outputRecorded = true,
  onPrint,
  onClose
}) {
  const context = { jobName, jobCode, orderId, clientName, filmType };
  const printable = rollsEligibleForBarcodeLabel([
    ...printedRolls.map((roll) => labelRoll(roll, context)),
    ...balanceRolls.map((roll) => labelRoll({ ...roll, rollType: 'RAW_MATERIAL' }, context))
  ]).filter((roll) => roll.barcodeId);

  return (
    <div
      className="modal-overlay"
      data-testid="print-run-completion"
      style={{ zIndex: 2800 }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{ maxWidth: '760px', width: '96%', borderRadius: '16px', padding: '22px' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontWeight: '900', fontSize: '0.72rem' }}>
              PRESS RUN SAVED
            </span>
            <h3 style={{ margin: '6px 0 0', fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>
              {jobName || 'Printed job'}
            </h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.84rem' }}>
              {jobCode || orderId}
              {jobMeters ? ` · ${meters(jobMeters)} printed` : ''}
            </p>
          </div>
          <button type="button" className="btn-secondary" style={{ padding: '6px' }} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!outputRecorded && (
          <div style={{ marginTop: '14px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '10px', padding: '10px 12px', fontSize: '0.84rem', fontWeight: '700' }}>
            This run is marked complete, and the printed SFG lot was not recorded. Open the job again from End Job if the rolls still need to be saved.
          </div>
        )}

        <Section title="Printed SFG rolls" empty="No printed roll was recorded.">
          {printedRolls.map((roll) => (
            <Row key={roll.barcodeId} testId="print-run-printed-roll">
              <Code value={roll.barcodeId} />
              <Cell label="Weight" value={kg(roll.netWeightKg)} />
              <Cell label="Meters" value={meters(roll.lengthMeters)} />
              <TagButton testId="print-run-print-tag" onClick={() => onPrint?.([labelRoll(roll, context)])}>Print Tag</TagButton>
            </Row>
          ))}
        </Section>

        <Section title="Balance rolls" empty="No balance roll. The input rolls were fully used.">
          {balanceRolls.map((roll) => (
            <Row key={roll.barcodeId} testId="print-run-balance-roll">
              <Code value={roll.barcodeId} />
              <Cell label="Weight" value={kg(roll.netWeightKg)} />
              <TagButton testId="print-run-balance-print-tag" onClick={() => onPrint?.([labelRoll({ ...roll, rollType: 'RAW_MATERIAL' }, context)])}>Print Tag</TagButton>
            </Row>
          ))}
        </Section>

        <Section title="Consumed rolls" empty="No input roll was marked consumed.">
          {consumedRolls.map((roll) => (
            <Row key={roll.barcodeId} testId="print-run-consumed-roll">
              <Code value={roll.barcodeId} />
              <Cell label="Consumed" value={kg(roll.consumedWeightKg)} />
              <Cell label="Initial" value={kg(roll.initialWeightKg)} />
            </Row>
          ))}
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          {printable.length > 0 && (
            <button
              type="button"
              data-testid="print-run-print-all"
              className="btn-primary"
              style={{ fontWeight: '800' }}
              onClick={() => onPrint?.(printable)}
            >
              <QrCode size={16} /> Print all new tags
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, empty, children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: '900', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        <CheckCircle2 size={14} color="#059669" /> {title}
      </div>
      {items.length === 0 ? (
        <div style={{ marginTop: '6px', color: '#64748b', fontSize: '0.84rem' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>{items}</div>
      )}
    </div>
  );
}

function Row({ children, testId }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px' }}>
      {children}
    </div>
  );
}

function Code({ value }) {
  return (
    <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0f172a', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px' }}>
      {value}
    </span>
  );
}

function Cell({ label, value }) {
  return (
    <span style={{ minWidth: '90px' }}>
      <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>{value}</strong>
    </span>
  );
}
