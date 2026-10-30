import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Printer, 
  Edit3, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  History, 
  Calendar, 
  Building2, 
  Layers, 
  Calculator, 
  Plus, 
  ArrowRight, 
  X, 
  Eye, 
  RefreshCw,
  Sparkles,
  FileCheck,
  Check,
  RotateCcw
} from 'lucide-react';
import { formatPlantDate } from '../utils/dbDates';
import { displayAmendmentLabel, revisionNumber, ocnHistoryEntries } from '../utils/ocnAmendment';
import OrderConfirmationPDF from './OrderConfirmationPDF';
import SearchableSelect from './SearchableSelect';
import { FILM_DENSITIES, isLDFilm, isMetalloceneEligibleFilm, METALLOCENE_OPTIONS } from '../factoryStore';

export default function OrderConfirmationRegister({
  ocns = [],
  orders = [],
  clients = [],
  onNavigateToPunching,
  onSaveAmendment,
  onRefresh,
  activeUsername = 'Staff'
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedOcnForPdf, setSelectedOcnForPdf] = useState(null);
  const [ocnToAmend, setOcnToAmend] = useState(null);
  const [ocnHistoryModal, setOcnHistoryModal] = useState(null);
  const [isSavingAmendment, setIsSavingAmendment] = useState(false);

  // Stats calculation
  const stats = useMemo(() => {
    const total = ocns.length;
    const amended = ocns.filter(o => revisionNumber(o) > 0).length;
    const confirmed = ocns.filter(o => o.status !== 'Cancelled').length;
    const totalQtyKg = ocns.reduce((sum, o) => sum + (parseFloat(o.orderQtyKg) || 0), 0);
    const totalValue = ocns.reduce((sum, o) => sum + (parseFloat(o.totalMinSellingAmount) || 0), 0);
    return { total, amended, confirmed, totalQtyKg, totalValue };
  }, [ocns]);

  // Filtered OCNs
  const filteredOcns = useMemo(() => {
    return ocns.filter(o => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q || 
        (o.ocnNumber || o.id || '').toLowerCase().includes(q) ||
        (o.clientName || '').toLowerCase().includes(q) ||
        (o.jobName || '').toLowerCase().includes(q) ||
        (o.orderId || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || 
        (statusFilter === 'AMENDED' && revisionNumber(o) > 0) ||
        (statusFilter === o.status?.toUpperCase());

      return matchSearch && matchStatus;
    });
  }, [ocns, searchTerm, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Header Controls */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)', margin: 0 }}>
              <FileCheck size={24} style={{ color: '#059669' }} /> Order Confirmation Notes (OCN) Register
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '4px', marginBottom: 0 }}>
              View, print, and amend all confirmed sales order confirmation documents with revision history and live auto-numbering.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onRefresh && (
              <button className="btn-secondary" onClick={onRefresh} title="Refresh OCNs">
                <RefreshCw size={15} /> Refresh
              </button>
            )}
            {onNavigateToPunching && (
              <button className="btn-primary" onClick={onNavigateToPunching} style={{ background: '#059669', borderColor: '#059669' }}>
                <Plus size={16} /> Punch Job & Generate OCN
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginTop: '18px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total OCNs Generated</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{stats.total}</div>
          </div>
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 16px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active / Confirmed</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#065f46', marginTop: '2px' }}>{stats.confirmed}</div>
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amended Revisions</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#92400e', marginTop: '2px' }}>{stats.amended}</div>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Booked Quantity</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1d4ed8', marginTop: '2px' }}>{stats.totalQtyKg.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Kg</span></div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '450px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input 
            type="text"
            className="form-control"
            placeholder="Search by OCN No., Client, Job, or Order ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px', height: '38px', fontSize: '0.88rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Filter size={15} /> Status:
          </div>
          <select 
            className="form-control"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ height: '38px', fontSize: '0.85rem', minWidth: '150px' }}
          >
            <option value="ALL">All Documents</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="AMENDED">Amended (Revisions)</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* OCN Documents Table */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 16px' }}>OCN Number</th>
                <th style={{ padding: '12px 14px' }}>Date</th>
                <th style={{ padding: '12px 14px' }}>Client</th>
                <th style={{ padding: '12px 14px' }}>Job Name & Structure</th>
                <th style={{ padding: '12px 14px' }}>Order Qty</th>
                <th style={{ padding: '12px 14px' }}>Selling Rate / Kg</th>
                <th style={{ padding: '12px 14px' }}>Linked Order</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOcns.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📄</div>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#475569' }}>No Order Confirmation Notes Found</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                      {searchTerm ? 'Try adjusting your search criteria.' : 'Punch a job to generate your first official OCN.'}
                    </div>
                    {onNavigateToPunching && !searchTerm && (
                      <button className="btn-primary" onClick={onNavigateToPunching} style={{ marginTop: '16px', background: '#059669', borderColor: '#059669' }}>
                        <Plus size={15} /> Punch New Job
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredOcns.map(ocn => {
                  const revLabel = displayAmendmentLabel(ocn);
                  const isAmended = revisionNumber(ocn) > 0;
                  const structureStr = ocn.structure || (ocn.layers || []).map(l => `${l.filmType} ${l.micron}µ`).join(' / ') || '—';

                  return (
                    <tr key={ocn.id || ocn.ocnNumber} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 16px', fontWeight: '700', color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{ocn.ocnNumber || ocn.id}</span>
                          <span 
                            style={{ 
                              background: isAmended ? '#fffbeb' : '#ecfdf5', 
                              color: isAmended ? '#b45309' : '#047857', 
                              border: `1px solid ${isAmended ? '#fde68a' : '#a7f3d0'}`,
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              fontSize: '0.72rem', 
                              fontWeight: '800' 
                            }}
                          >
                            {revLabel}
                          </span>
                        </div>
                        {isAmended && ocn.amendedAt && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                            Amended: {formatPlantDate(ocn.amendedAt)}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 14px', color: '#334155' }}>
                        {formatPlantDate(ocn.orderDate || ocn.createdAt)}
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{ocn.clientName || 'N/A'}</div>
                        {ocn.clientDetails?.gstin && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>GSTIN: {ocn.clientDetails.gstin}</div>
                        )}
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{ocn.jobName || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {structureStr}
                        </div>
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{(parseFloat(ocn.orderQtyKg) || 0).toLocaleString()} Kg</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{ocn.orderType || 'Reel Form'}</div>
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ fontWeight: '800', color: '#047857' }}>
                          ₹{ocn.minSellingPricePerKg || ocn.calculationData?.minSellingPricePerKg || 0} / kg
                        </div>
                        {ocn.totalMinSellingAmount > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Val: ₹{parseFloat(ocn.totalMinSellingAmount).toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        {ocn.orderId ? (
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                            {ocn.orderId}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Direct OCN</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button 
                            type="button"
                            className="btn-primary" 
                            style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#0284c7', borderColor: '#0284c7' }}
                            onClick={() => setSelectedOcnForPdf(ocn)}
                            title="View and Print Official OCN PDF"
                          >
                            <Printer size={13} /> Print PDF
                          </button>

                          <button 
                            type="button"
                            className="btn-secondary" 
                            style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setOcnToAmend(ocn)}
                            title="Modify or Amend this OCN"
                          >
                            <Edit3 size={13} /> Amend
                          </button>

                          {isAmended && (
                            <button 
                              type="button"
                              className="btn-secondary" 
                              style={{ padding: '5px 8px', fontSize: '0.78rem', color: '#b45309', borderColor: '#fde68a', background: '#fffbeb' }}
                              onClick={() => setOcnHistoryModal(ocn)}
                              title="View Amendment History"
                            >
                              <History size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PDF View Modal */}
      {selectedOcnForPdf && (
        <OrderConfirmationPDF 
          ocn={selectedOcnForPdf}
          calculationData={selectedOcnForPdf.calculationData || selectedOcnForPdf}
          clientDetails={selectedOcnForPdf.clientDetails}
          clients={clients}
          onClose={() => setSelectedOcnForPdf(null)}
          onAmendOcn={(ocn) => {
            setSelectedOcnForPdf(null);
            setOcnToAmend(ocn);
          }}
        />
      )}

      {/* OCN Amendment Modal */}
      {ocnToAmend && (
        <OcnAmendmentModal 
          ocn={ocnToAmend}
          clients={clients}
          activeUsername={activeUsername}
          onClose={() => setOcnToAmend(null)}
          onSave={async (patch) => {
            setIsSavingAmendment(true);
            try {
              let updated = null;
              if (onSaveAmendment) {
                updated = await onSaveAmendment({
                  originalOcn: ocnToAmend,
                  amendmentData: patch,
                  amendmentReason: patch.amendmentReason,
                  amendedBy: activeUsername
                });
              }
              setOcnToAmend(null);
              if (updated) setSelectedOcnForPdf(updated);
            } catch (err) {
              alert('Failed to save amendment: ' + (err.message || err));
            } finally {
              setIsSavingAmendment(false);
            }
          }}
        />
      )}

      {/* Revision History Modal */}
      {ocnHistoryModal && (
        <OcnHistoryModal 
          ocn={ocnHistoryModal}
          onClose={() => setOcnHistoryModal(null)}
          onViewSnapshot={(snapshot) => {
            setOcnHistoryModal(null);
            setSelectedOcnForPdf(snapshot);
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal to Amend / Modify an existing OCN
 */
function OcnAmendmentModal({ ocn, clients = [], activeUsername, onClose, onSave }) {
  const currentRev = revisionNumber(ocn);
  const nextRevLabel = `Rev ${String(currentRev + 1).padStart(2, '0')}`;

  const [jobName, setJobName] = useState(ocn.jobName || '');
  const [clientName, setClientName] = useState(ocn.clientName || '');
  const [orderQtyKg, setOrderQtyKg] = useState(ocn.orderQtyKg || 0);
  const [orderType, setOrderType] = useState(ocn.orderType || 'Reel');
  const [printWidthMm, setPrintWidthMm] = useState(ocn.printWidthMm || 1000);
  const [repeatLengthMm, setRepeatLengthMm] = useState(ocn.repeatLengthMm || 400);
  const [wastagePct, setWastagePct] = useState(ocn.wastagePct || 5);
  const [conversionCharges, setConversionCharges] = useState(ocn.conversionChargesPerKg || 38);
  const [fixedProfit, setFixedProfit] = useState(ocn.fixedProfitPerKg || 12);
  const [sellingPricePerKg, setSellingPricePerKg] = useState(ocn.minSellingPricePerKg || 0);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [orderComments, setOrderComments] = useState(ocn.orderComments || '');
  const [layers, setLayers] = useState(
    Array.isArray(ocn.layers) && ocn.layers.length > 0 
      ? JSON.parse(JSON.stringify(ocn.layers))
      : [
          { id: 1, filmType: 'PET', micron: 12, rate: 125, widthMm: ocn.printWidthMm || 1000 },
          { id: 2, filmType: 'METPET', micron: 12, rate: 140, widthMm: ocn.printWidthMm || 1000 },
          { id: 3, filmType: 'Natural GP LD', micron: 35, rate: 115, widthMm: (ocn.printWidthMm || 1000) + 5 }
        ]
  );

  // Recalculate estimated minimum selling price
  const estimatedRate = useMemo(() => {
    let rawCost = 0;
    let totalGsm = 0;
    layers.forEach(l => {
      const density = FILM_DENSITIES[l.filmType] || 1.0;
      const gsm = (parseFloat(l.micron) || 0) * density;
      totalGsm += gsm;
      rawCost += gsm * (parseFloat(l.rate) || 120);
    });
    const avgRmCostPerKg = totalGsm > 0 ? (rawCost / totalGsm) : 130;
    const conv = parseFloat(conversionCharges) || 0;
    const prof = parseFloat(fixedProfit) || 0;
    return Math.round(avgRmCostPerKg + conv + prof);
  }, [layers, conversionCharges, fixedProfit]);

  const handleLayerChange = (idx, field, value) => {
    setLayers(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleAddLayer = () => {
    setLayers(prev => [
      ...prev,
      { id: Date.now(), filmType: 'Natural GP LD', micron: 30, rate: 115, widthMm: parseFloat(printWidthMm) + 5 }
    ]);
  };

  const handleRemoveLayer = (idx) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amendmentReason.trim()) {
      alert('Please enter an Amendment Reason explaining why this OCN is being modified.');
      return;
    }

    const finalSellingPrice = parseFloat(sellingPricePerKg) > 0 ? parseFloat(sellingPricePerKg) : estimatedRate;
    const finalQty = parseFloat(orderQtyKg) || 0;
    const totalAmount = finalSellingPrice * finalQty;

    const patch = {
      jobName,
      clientName,
      orderQtyKg: finalQty,
      orderType,
      printWidthMm: parseFloat(printWidthMm),
      repeatLengthMm: parseFloat(repeatLengthMm),
      wastagePct: parseFloat(wastagePct),
      conversionChargesPerKg: parseFloat(conversionCharges),
      fixedProfitPerKg: parseFloat(fixedProfit),
      minSellingPricePerKg: finalSellingPrice,
      totalMinSellingAmount: totalAmount,
      layers,
      structure: layers.map(l => `${l.filmType} ${l.micron}µ${l.metallocenePct ? ` (${String(l.metallocenePct).endsWith('%') ? l.metallocenePct : `${l.metallocenePct}%`})` : ''}`).join(' / '),
      orderComments,
      amendmentReason: amendmentReason.trim()
    };

    onSave(patch);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100000 }}>
      <div className="glass-card modal-content" style={{ width: '820px', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                Amend Order Confirmation Note: {ocn.ocnNumber || ocn.id}
              </h3>
              <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '800' }}>
                Creating {nextRevLabel}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
              Modify quantities, client specs, substrate layers, or rates. The existing state will be archived as revision history.
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '6px 10px' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Amendment Reason Box (MANDATORY) */}
          <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '8px', padding: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#92400e', marginBottom: '6px' }}>
              ⚠️ Amendment Reason (Required) *
            </label>
            <input 
              type="text"
              className="form-control"
              placeholder="e.g., Client increased order qty to 500 Kg, revised rate to ₹240/kg..."
              value={amendmentReason}
              onChange={e => setAmendmentReason(e.target.value)}
              required
              style={{ background: '#ffffff', borderColor: '#fde68a', fontWeight: '600' }}
            />
          </div>

          {/* Client & Job Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Job Name</label>
              <input 
                type="text" 
                className="form-control" 
                value={jobName} 
                onChange={e => setJobName(e.target.value)} 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Client Name</label>
              <input 
                type="text" 
                className="form-control" 
                value={clientName} 
                onChange={e => setClientName(e.target.value)} 
                required 
              />
            </div>
          </div>

          {/* Quantity, Dimensions, Wastage */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Order Qty (Kg)</label>
              <input 
                type="number" 
                className="form-control" 
                value={orderQtyKg} 
                onChange={e => setOrderQtyKg(e.target.value)} 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Supply Form</label>
              <select className="form-control" value={orderType} onChange={e => setOrderType(e.target.value)}>
                <option value="Reel">Reel Form</option>
                <option value="Pouching">Pouch Form</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Print Width (mm)</label>
              <input 
                type="number" 
                className="form-control" 
                value={printWidthMm} 
                onChange={e => setPrintWidthMm(e.target.value)} 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Repeat (mm)</label>
              <input 
                type="number" 
                className="form-control" 
                value={repeatLengthMm} 
                onChange={e => setRepeatLengthMm(e.target.value)} 
                required 
              />
            </div>
          </div>

          {/* Substrate Layers Table */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Substrate Structure & Rates
              </span>
              <button type="button" className="btn-secondary" onClick={handleAddLayer} style={{ padding: '3px 8px', fontSize: '0.75rem' }}>
                <Plus size={13} /> Add Layer
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {layers.map((l, i) => (
                <div key={l.id || i} style={{ display: 'grid', gridTemplateColumns: '32px 140px 85px 85px 75px 95px 32px', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', color: '#047857', fontSize: '0.8rem' }}>L{i + 1}</span>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={l.filmType} 
                    onChange={e => handleLayerChange(i, 'filmType', e.target.value)} 
                    placeholder="Film Type" 
                    style={{ fontSize: '0.82rem' }}
                  />
                  <input 
                    type="number" 
                    className="form-control" 
                    value={l.micron} 
                    onChange={e => handleLayerChange(i, 'micron', parseFloat(e.target.value) || 0)} 
                    placeholder="Micron" 
                    style={{ fontSize: '0.82rem' }}
                  />
                  <input 
                    type="number" 
                    className="form-control" 
                    value={l.widthMm} 
                    onChange={e => handleLayerChange(i, 'widthMm', parseFloat(e.target.value) || 0)} 
                    placeholder="Width mm" 
                    style={{ fontSize: '0.82rem' }}
                  />
                  <input 
                    type="text" 
                    className="form-control" 
                    value={l.metallocenePct || ''} 
                    onChange={e => handleLayerChange(i, 'metallocenePct', e.target.value)} 
                    placeholder="Met %" 
                    style={{ fontSize: '0.82rem' }}
                    title="Metallocene Percentage (e.g. 5%)"
                  />
                  <input 
                    type="number" 
                    className="form-control" 
                    value={l.rate} 
                    onChange={e => handleLayerChange(i, 'rate', parseFloat(e.target.value) || 0)} 
                    placeholder="Rate ₹" 
                    style={{ fontSize: '0.82rem', fontWeight: '700' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveLayer(i)} 
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0 }}
                    title="Remove layer"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Costing & Selling Price */}
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#065f46', display: 'block', marginBottom: '2px' }}>Conversion (₹/kg)</label>
              <input 
                type="number" 
                className="form-control" 
                value={conversionCharges} 
                onChange={e => setConversionCharges(e.target.value)} 
                style={{ background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#065f46', display: 'block', marginBottom: '2px' }}>Profit Margin (₹/kg)</label>
              <input 
                type="number" 
                className="form-control" 
                value={fixedProfit} 
                onChange={e => setFixedProfit(e.target.value)} 
                style={{ background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#047857', display: 'block', marginBottom: '2px' }}>Selling Price / kg (₹)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder={`Est: ₹${estimatedRate}`}
                value={sellingPricePerKg || ''} 
                onChange={e => setSellingPricePerKg(e.target.value)} 
                style={{ background: '#fff', fontWeight: '800', color: '#047857', fontSize: '0.95rem' }}
              />
            </div>
          </div>

          {/* Comments */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Special Instructions / Comments</label>
            <input 
              type="text" 
              className="form-control" 
              value={orderComments} 
              onChange={e => setOrderComments(e.target.value)} 
              placeholder="e.g., Client PO reference, packaging details..."
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" style={{ background: '#059669', borderColor: '#059669' }}>
              <Check size={16} /> Save & Apply Amendment ({nextRevLabel})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal to view Revision History timeline
 */
function OcnHistoryModal({ ocn, onClose, onViewSnapshot }) {
  const history = ocnHistoryEntries(ocn);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100000 }}>
      <div className="glass-card modal-content" style={{ width: '680px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#0f172a' }}>
              Amendment History — {ocn.ocnNumber || ocn.id}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
              Audit trail of all previous revisions, author signatures, and amendment reasons.
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '6px 10px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {history.map((entry, idx) => (
            <div 
              key={idx} 
              style={{ 
                background: entry.isCurrent ? '#ecfdf5' : '#f8fafc', 
                border: `1.5px solid ${entry.isCurrent ? '#10b981' : '#e2e8f0'}`, 
                borderRadius: '8px', 
                padding: '14px 16px' 
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    background: entry.isCurrent ? '#047857' : '#64748b', 
                    color: '#fff', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.75rem', 
                    fontWeight: '800' 
                  }}>
                    {entry.amendmentNo}
                  </span>
                  {entry.isCurrent && (
                    <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '800', background: '#d1fae5', padding: '2px 6px', borderRadius: '4px' }}>
                      CURRENT ACTIVE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {formatPlantDate(entry.date)}
                </div>
              </div>

              <div style={{ fontSize: '0.88rem', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                Reason: <span style={{ fontWeight: '400', color: '#475569' }}>{entry.reason}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', fontSize: '0.78rem', color: '#64748b' }}>
                <div>Amended By: <b>{entry.by}</b></div>
                {entry.snapshot && (
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => onViewSnapshot(entry.snapshot)}
                  >
                    <Eye size={12} /> View Snapshot PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
