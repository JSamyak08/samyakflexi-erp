import React from 'react';
import { NOT_RECORDED, displayQuantity } from '../utils/productionRecordQuality';
import { buildRollLineage } from '../utils/rollLineage';

function cell(value, suffix) {
  if (value === null || value === undefined) return NOT_RECORDED;
  return displayQuantity(value, 2, suffix);
}

export default function RollLineageSummary({ record }) {
  const lineage = buildRollLineage(record || {});
  const summary = lineage.summary || {};
  return (
    <div style={{ margin: '16px 0 24px', padding: '20px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: '900', color: '#0f172a' }}>
        Final summary — roll lineage
      </h4>
      <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>
        Input and output at each step. A gain is dried solids or adhesive. A loss is waste, trim, or a process fault. Missing weights stay {NOT_RECORDED}.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <Summary label="Raw input" value={cell(summary.rawInputKg, 'kg')} />
        <Summary label="Added substrate" value={cell(summary.addedSubstrateKg, 'kg')} />
        <Summary label="FG output" value={cell(summary.fgOutputKg, 'kg')} />
        <Summary label="Weight gain" value={cell(summary.totalGainKg, 'kg')} />
        <Summary label="Process loss" value={cell(summary.totalLossKg, 'kg')} />
        <Summary label="Net yield" value={summary.netYieldPct === null || summary.netYieldPct === undefined ? NOT_RECORDED : `${summary.netYieldPct}%`} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th>Step</th>
              <th>Input</th>
              <th>Added substrate</th>
              <th>Output</th>
              <th>Gain</th>
              <th>Loss</th>
            </tr>
          </thead>
          <tbody>
            {lineage.steps.length === 0 ? (
              <tr>
                <td colSpan={6}>{NOT_RECORDED}</td>
              </tr>
            ) : lineage.steps.map((step, index) => (
              <tr key={`${step.stage}-${index}`}>
                <td>{step.label}</td>
                <td>{step.inputStatus === NOT_RECORDED ? NOT_RECORDED : cell(step.inputKg, 'kg')}</td>
                <td>{step.addedSubstrateKg ? cell(step.addedSubstrateKg, 'kg') : NOT_RECORDED}</td>
                <td>{step.outputStatus === NOT_RECORDED ? NOT_RECORDED : cell(step.outputKg, 'kg')}</td>
                <td>{step.gainKg === null || step.gainKg === undefined ? NOT_RECORDED : cell(step.gainKg, 'kg')}</td>
                <td>{step.lossKg === null || step.lossKg === undefined ? NOT_RECORDED : cell(step.lossKg, 'kg')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lineage.findings.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingLeft: '18px', color: '#9a3412', fontSize: '0.78rem' }}>
          {lineage.findings.map((finding, index) => (
            <li key={index}>{finding.level === 'block' ? 'Blocked' : 'Check'}: {finding.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>{value}</div>
    </div>
  );
}
