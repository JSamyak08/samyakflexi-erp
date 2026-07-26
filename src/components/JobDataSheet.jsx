import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  Layers,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { calculatePreVsPostCosting } from '../factoryStore';

export default function JobDataSheet({ 
  orders, 
  currentUser, 
  onSaveJobDataSheet 
}) {
  const isAuthorizedToViewProfit = currentUser?.role === 'Admin' || currentUser?.role === 'Plant Manager';

  const [selectedJobId, setSelectedJobId] = useState(orders[0]?.id || '');
  const [sellingPricePerKg, setSellingPricePerKg] = useState(245);
  
  // Shop floor actual consumption form states
  const [actualInkKg, setActualInkKg] = useState(52.0);
  const [actualSolventsKg, setActualSolventsKg] = useState(18.5);
  const [actualAdhesiveKg, setActualAdhesiveKg] = useState(46.5);
  const [actualScrapKg, setActualScrapKg] = useState(125.0);
  const [operatorNotes, setOperatorNotes] = useState('Smooth production run on Rotogravure Line 2.');
  
  const [layerActualKgs, setLayerActualKgs] = useState({});

  const selectedOrder = orders.find(o => o.id === selectedJobId) || orders[0];

  // Pre-Costing calculation data from selected job
  const preCostingDetails = selectedOrder?.calculationDetails || {};

  // Compute live Pre vs Post Costing variance & profitability
  const preVsPost = calculatePreVsPostCosting(preCostingDetails, {
    sellingPricePerKg,
    actualFilmConsumedKg: layerActualKgs,
    actualInkConsumedKg: actualInkKg,
    actualSolventsConsumedKg: actualSolventsKg,
    actualAdhesiveConsumedKg: actualAdhesiveKg
  });

  const handleSaveDataSheet = (e) => {
    e.preventDefault();

    const newSheet = {
      jobId: selectedJobId,
      jobName: selectedOrder.jobName,
      clientName: selectedOrder.clientName,
      sellingPricePerKg: parseFloat(sellingPricePerKg),
      completionDate: new Date().toISOString().split('T')[0],
      actualFilmConsumedKg: layerActualKgs,
      actualInkConsumedKg: parseFloat(actualInkKg),
      actualSolventsConsumedKg: parseFloat(actualSolventsKg),
      actualAdhesiveConsumedKg: parseFloat(actualAdhesiveKg),
      actualScrapWastageKg: parseFloat(actualScrapKg),
      operatorNotes
    };

    if (onSaveJobDataSheet) {
      onSaveJobDataSheet(newSheet);
    }
    alert(`Actual Job Consumption Data Sheet for "${selectedOrder.jobName}" saved successfully!`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={22} style={{ color: 'var(--primary-brand)' }} /> Job Data Sheet & Pre vs Post Costing Analysis
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Record shop floor actual material consumption (films, inks, solvents, adhesives) & compare against pre-costing target budgets.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isAuthorizedToViewProfit ? '#ecfdf5' : '#fffbeb', border: `1px solid ${isAuthorizedToViewProfit ? '#a7f3d0' : '#fde68a'}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', color: isAuthorizedToViewProfit ? '#047857' : '#b45309' }}>
            {isAuthorizedToViewProfit ? <ShieldCheck size={16} /> : <Lock size={16} />}
            Role: <b>{currentUser?.role || 'Guest'}</b> ({isAuthorizedToViewProfit ? 'Financial Access Granted' : 'Profit Restricted'})
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Side: Shop Floor Actual Consumption Form */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} style={{ color: 'var(--primary-brand)' }} /> Record Shop Floor Actual Consumption
          </h3>

          <form onSubmit={handleSaveDataSheet}>
            <div className="form-group">
              <label>Select Job / Order *</label>
              <select 
                className="form-control"
                value={selectedJobId}
                onChange={e => setSelectedJobId(e.target.value)}
              >
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.id} - {o.jobName} ({o.clientName}) | {o.orderQtyKg} kg
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Finished Laminate Selling Price (₹ / Kg) *</label>
              <input 
                type="number" 
                className="form-control"
                value={sellingPricePerKg}
                onChange={e => setSellingPricePerKg(parseFloat(e.target.value) || 0)}
              />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />

            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>ACTUAL SUBSTRATE FILMS CONSUMED (KG)</h4>
            
            {preCostingDetails.layerResults ? (
              preCostingDetails.layerResults.map((layer, idx) => {
                const layerKey = `Layer ${idx + 1} (${layer.filmType} ${layer.micron}µ)`;
                const estKg = layer.grossKg;
                const val = layerActualKgs[layerKey] !== undefined ? layerActualKgs[layerKey] : estKg;

                return (
                  <div key={idx} className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>{layerKey}</span>
                      <span>Target Budget: <b>{estKg} kg</b></span>
                    </div>
                    <input 
                      type="number" 
                      step="0.1"
                      className="form-control"
                      value={val}
                      onChange={e => setLayerActualKgs({ ...layerActualKgs, [layerKey]: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Standard 3-Layer Structure (PET 12µ, METPET 12µ, LD 35µ)
              </div>
            )}

            <div className="form-grid" style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label>Actual Liquid Ink (Kg)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  value={actualInkKg}
                  onChange={e => setActualInkKg(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Actual Solvents (Kg)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  value={actualSolventsKg}
                  onChange={e => setActualSolventsKg(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Actual Adhesive (Kg)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  value={actualAdhesiveKg}
                  onChange={e => setActualAdhesiveKg(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Scrap / Trim Wastage (Kg)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  value={actualScrapKg}
                  onChange={e => setActualScrapKg(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Operator Shop Floor Notes</label>
              <textarea 
                className="form-control"
                rows="2"
                value={operatorNotes}
                onChange={e => setOperatorNotes(e.target.value)}
              />
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary">
                <CheckCircle2 size={16} /> Save Actual Consumption Sheet
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Pre vs Post Costing & Profitability (Admin Restricted) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {!isAuthorizedToViewProfit ? (
            /* Restricted Notice */
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a' }}>
              <Lock size={48} style={{ color: '#d97706', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#b45309' }}>
                Financial Profitability Access Restricted
              </h3>
              <p style={{ color: '#92400e', fontSize: '0.85rem', marginTop: '6px', maxWidth: '380px', margin: '6px auto 16px auto' }}>
                Pre vs Post Costing comparison and job profit margins are accessible strictly to <b>Admin</b> and <b>Plant Manager</b> roles.
              </p>
              <span className="badge badge-warning" style={{ padding: '6px 12px' }}>
                Current Role: {currentUser?.role || 'Guest'}
              </span>
            </div>
          ) : (
            /* Admin & Plant Manager Financial Report */
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={20} /> Pre vs Post Costing & Profitability Variance
              </h3>

              {/* High Level Profit Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                    PRE-COSTING (ESTIMATED)
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                    ₹{preVsPost.preCosting.totalCost.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: '600', marginTop: '2px' }}>
                    Est Profit: ₹{preVsPost.preCosting.grossProfit.toLocaleString()} ({preVsPost.preCosting.marginPct}%)
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#1e40af', textTransform: 'uppercase', fontWeight: '600' }}>
                    POST-COSTING (ACTUAL)
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e3a8a', marginTop: '4px' }}>
                    ₹{preVsPost.postCosting.totalCost.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: preVsPost.postCosting.grossProfit >= 0 ? '#059669' : '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                    Actual Profit: ₹{preVsPost.postCosting.grossProfit.toLocaleString()} ({preVsPost.postCosting.marginPct}%)
                  </div>
                </div>
              </div>

              {/* Variance Analysis Box */}
              <div className="calc-summary-box" style={{ marginBottom: '20px' }}>
                <div className="calc-summary-row">
                  <span>Gross Job Revenue (Order Qty × ₹{sellingPricePerKg}/kg):</span>
                  <span className="bold-val" style={{ color: '#047857' }}>₹{preVsPost.totalGrossRevenue.toLocaleString()}</span>
                </div>
                <div className="calc-summary-row">
                  <span>Cost Variance (Pre vs Post):</span>
                  <span style={{ fontWeight: '800', color: preVsPost.variance.isOverBudget ? '#dc2626' : '#059669' }}>
                    {preVsPost.variance.isOverBudget ? `+₹${preVsPost.variance.costVariance.toLocaleString()} (Over Budget)` : `-₹${Math.abs(preVsPost.variance.costVariance).toLocaleString()} (Under Budget)`}
                  </span>
                </div>
                <div className="calc-summary-row">
                  <span>Cost Variance Percentage:</span>
                  <span className="bold-val">{preVsPost.variance.costVariancePct}%</span>
                </div>
              </div>

              {/* Breakdown Comparison Table */}
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Pre-Costing (Est)</th>
                    <th>Post-Costing (Actual)</th>
                    <th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Films Gross Qty</td>
                    <td>{preCostingDetails.summary?.totalFilmGrossKg || 0} kg</td>
                    <td className="bold-val">{preVsPost.postCosting.actualFilmGrossKg} kg</td>
                    <td style={{ color: preVsPost.postCosting.actualFilmGrossKg > (preCostingDetails.summary?.totalFilmGrossKg || 0) ? '#dc2626' : '#059669', fontWeight: 'bold' }}>
                      {(preVsPost.postCosting.actualFilmGrossKg - (preCostingDetails.summary?.totalFilmGrossKg || 0)).toFixed(1)} kg
                    </td>
                  </tr>
                  <tr>
                    <td>Liquid Inks</td>
                    <td>{preCostingDetails.inkDetails?.grossKg || 0} kg</td>
                    <td className="bold-val">{preVsPost.postCosting.actualInkKg} kg</td>
                    <td>{(preVsPost.postCosting.actualInkKg - (preCostingDetails.inkDetails?.grossKg || 0)).toFixed(1)} kg</td>
                  </tr>
                  <tr>
                    <td>Solvents</td>
                    <td>Included in ink</td>
                    <td className="bold-val">{preVsPost.postCosting.actualSolventKg} kg</td>
                    <td>+ {preVsPost.postCosting.actualSolventKg} kg</td>
                  </tr>
                  <tr>
                    <td>Solvent-less Adhesive</td>
                    <td>{preCostingDetails.adhesiveDetails?.grossKg || 0} kg</td>
                    <td className="bold-val">{preVsPost.postCosting.actualAdhesiveKg} kg</td>
                    <td>{(preVsPost.postCosting.actualAdhesiveKg - (preCostingDetails.adhesiveDetails?.grossKg || 0)).toFixed(1)} kg</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                    <td>Total Material Cost</td>
                    <td>₹{preVsPost.preCosting.totalCost.toLocaleString()}</td>
                    <td>₹{preVsPost.postCosting.totalCost.toLocaleString()}</td>
                    <td style={{ color: preVsPost.variance.isOverBudget ? '#dc2626' : '#059669' }}>
                      {preVsPost.variance.isOverBudget ? `+₹${preVsPost.variance.costVariance}` : `-₹${Math.abs(preVsPost.variance.costVariance)}`}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => window.print()}>
                  <Printer size={14} /> Print Post-Costing & Profitability Summary
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
