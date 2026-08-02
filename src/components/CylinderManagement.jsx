import React, { useState } from 'react';
import { 
  Layers, 
  Plus, 
  Edit3, 
  Printer, 
  Search, 
  CheckCircle2, 
  AlertTriangle,
  FileCheck
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import CylinderJobCardForm from '../CylinderJobCardForm';

export default function CylinderManagement({ 
  cylinders, 
  onAddCylinder, 
  onUpdateCylinder 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCylinder, setEditingCylinder] = useState(null);
  const [selectedForPDF, setSelectedForPDF] = useState(null);

  // Form State
  const [sku, setSku] = useState('');
  const [jobName, setJobName] = useState('');
  const [clientGroup, setClientGroup] = useState('');
  const [colorsCount, setColorsCount] = useState(6);
  const [engravuresName, setEngravuresName] = useState('Acme Rotogravure Engravers');
  const [cylinderCost, setCylinderCost] = useState('35000');
  const [costBorneBy, setCostBorneBy] = useState('Client (100%)');
  const [costBorneType, setCostBorneType] = useState('client');
  const [circumferenceMm, setCircumferenceMm] = useState(400);
  const [faceLengthMm, setFaceLengthMm] = useState(1050);
  const [layer1PrintedQtyKg, setLayer1PrintedQtyKg] = useState(385.5);
  const [dispatchedQty, setDispatchedQty] = useState(3855);
  const [utilisationLimit, setUtilisationLimit] = useState(10000);
  const [status, setStatus] = useState('Active In-Use');

  const openAddModal = () => {
    setEditingCylinder(null);
    setSku(`SKU-CYL-00${cylinders.length + 1}`);
    setJobName('');
    setClientGroup('');
    setColorsCount(6);
    setEngravuresName('Acme Rotogravure Engravers');
    setCylinderCost('35000');
    setCostBorneBy('Client (100%)');
    setCostBorneType('client');
    setCircumferenceMm(400);
    setFaceLengthMm(1050);
    setLayer1PrintedQtyKg(500);
    setDispatchedQty(500);
    setUtilisationLimit(10000);
    setStatus('Active In-Use');
    setIsModalOpen(true);
  };

  const openEditModal = (cyl) => {
    setEditingCylinder(cyl);
    setSku(cyl.sku);
    setJobName(cyl.jobName);
    setClientGroup(cyl.clientGroup);
    setColorsCount(cyl.colorsCount || 6);
    setEngravuresName(cyl.engravuresName);
    setCylinderCost(`${cyl.cylinderCost}`.replace(/[^0-9]/g, ''));
    setCostBorneBy(cyl.costBorneBy);
    setCostBorneType(cyl.costBorneType);
    setCircumferenceMm(cyl.circumferenceMm || 400);
    setFaceLengthMm(cyl.faceLengthMm || 1050);
    setLayer1PrintedQtyKg(cyl.layer1PrintedQtyKg || 385);
    setDispatchedQty(cyl.dispatchedQty);
    setUtilisationLimit(cyl.utilisationLimit || 10000);
    setStatus(cyl.status || 'Active In-Use');
    setIsModalOpen(true);
  };

  const handleSaveCylinder = (e) => {
    e.preventDefault();
    if (!jobName.trim() || !sku.trim()) {
      alert("SKU and Job Name are required!");
      return;
    }

    const payload = {
      id: editingCylinder ? editingCylinder.id : Date.now(),
      sku,
      jobName,
      clientGroup,
      colorsCount: parseInt(colorsCount) || 1,
      cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
      engravuresName,
      costBorneBy,
      costBorneType,
      circumferenceMm: parseInt(circumferenceMm) || 400,
      faceLengthMm: parseInt(faceLengthMm) || 1050,
      layer1PrintedQtyKg: parseFloat(layer1PrintedQtyKg) || 0,
      dispatchedQty: parseFloat(dispatchedQty) || 0,
      utilisationLimit: parseInt(utilisationLimit) || 10000,
      status
    };

    if (editingCylinder) {
      if (onUpdateCylinder) onUpdateCylinder(payload);
    } else {
      if (onAddCylinder) onAddCylinder(payload);
    }

    setIsModalOpen(false);
    alert(`Rotogravure Cylinder Set "${jobName}" saved successfully!`);
  };

  const filteredCylinders = cylinders.filter(c => 
    c.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.jobName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.clientGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.engravuresName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={22} style={{ color: 'var(--primary-brand)' }} /> Rotogravure Cylinder Database & Utilisation Tracking
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Track cylinder wear based strictly on <b>Layer 1 (Printing Substrate) Quantity in Kg</b>. Manage cylinder specifications & colors.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-control"
                style={{ paddingLeft: '36px' }}
                placeholder="Search SKU, job name, or client..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={openAddModal}>
              <Plus size={16} /> Add New Cylinder Set
            </button>
          </div>
        </div>
      </div>

      {/* Main Cylinders Directory Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '1.05rem', fontWeight: '700' }}>Active Printing Cylinders Directory</h3>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU Code</th>
                <th>Job Name & Colors</th>
                <th>Client Group</th>
                <th>Engraver & Cost</th>
                <th>Cost Borne By</th>
                <th>Layer 1 Print Qty (Kg)</th>
                <th>Cylinder Wear Utilisation</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCylinders.map(c => {
                const util = calculateUtilisation(c.dispatchedQty, c.utilisationLimit || 10000);
                const isWarning = util >= 80;
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{c.sku}</td>
                    <td>
                      <div style={{ fontWeight: '700' }}>{c.jobName}</div>
                      <span className="badge badge-both" style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '2px' }}>
                        🎨 {c.colorsCount || 6} Printing Colors
                      </span>
                    </td>
                    <td>{c.clientGroup}</td>
                    <td>
                      <div style={{ fontWeight: '600' }}>{c.cylinderCost}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.engravuresName}</div>
                    </td>
                    <td>
                      <span className={`badge badge-${c.costBorneType}`}>{c.costBorneBy}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>
                        {c.layer1PrintedQtyKg ? `${c.layer1PrintedQtyKg} kg` : `${c.dispatchedQty} kg`}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Layer 1 Substrate</div>
                    </td>
                    <td style={{ minWidth: '180px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{c.dispatchedQty}kg / {c.utilisationLimit || 10000}kg</span>
                        <span style={{ color: isWarning ? 'var(--warning)' : 'var(--success)', fontWeight: 'bold' }}>{util}%</span>
                      </div>
                      <div className="progress-container" style={{ marginTop: '4px' }}>
                        <div className={`progress-fill ${isWarning ? 'warning' : ''}`} style={{ width: `${util}%`, background: isWarning ? '#d97706' : '#0f172a' }}></div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${c.status === 'Worn Out / Retouch Needed' ? 'badge-warning' : 'badge-us'}`}>
                        {c.status || 'Active In-Use'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => openEditModal(c)}>
                          <Edit3 size={14} /> Edit
                        </button>

                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => setSelectedForPDF(c)}>
                          <Printer size={14} /> Job Card
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Cylinder Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '640px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} style={{ color: 'var(--primary-brand)' }} /> {editingCylinder ? 'Edit Cylinder Set' : 'Add New Rotogravure Cylinder Set'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Enter cylinder technical parameters, printing colors count, and Layer 1 substrate wear limits.
            </p>

            <form onSubmit={handleSaveCylinder}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Cylinder SKU Code *</label>
                  <input type="text" className="form-control" required value={sku} onChange={e => setSku(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Job Name *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Britannia Bourbon 250g" value={jobName} onChange={e => setJobName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Client Group *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Britannia Industries" value={clientGroup} onChange={e => setClientGroup(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Number of Printing Colors *</label>
                  <input type="number" className="form-control" required min="1" max="12" value={colorsCount} onChange={e => setColorsCount(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Engraver Name</label>
                  <input type="text" className="form-control" value={engravuresName} onChange={e => setEngravuresName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Cylinder Set Cost (₹)</label>
                  <input type="number" className="form-control" value={cylinderCost} onChange={e => setCylinderCost(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Cost Borne By</label>
                  <select className="form-control" value={costBorneBy} onChange={e => {
                    setCostBorneBy(e.target.value);
                    if (e.target.value.includes('Client')) setCostBorneType('client');
                    else if (e.target.value.includes('Us')) setCostBorneType('us');
                    else setCostBorneType('both');
                  }}>
                    <option value="Client (100%)">Client (100%)</option>
                    <option value="Us (100%)">Us / Samyak (100%)</option>
                    <option value="Both (50/50)">Both (50/50)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Cylinder Circumference (mm)</label>
                  <input type="number" className="form-control" value={circumferenceMm} onChange={e => setCircumferenceMm(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Face Length (mm)</label>
                  <input type="number" className="form-control" value={faceLengthMm} onChange={e => setFaceLengthMm(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Layer 1 Printing Substrate Qty (Kg)</label>
                  <input type="number" className="form-control" value={layer1PrintedQtyKg} onChange={e => setLayer1PrintedQtyKg(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Total Dispatched Printed Qty (Kg)</label>
                  <input type="number" className="form-control" value={dispatchedQty} onChange={e => setDispatchedQty(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Max Utilisation Life Limit (Kg)</label>
                  <input type="number" className="form-control" value={utilisationLimit} onChange={e => setUtilisationLimit(e.target.value)} />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Cylinder Status</label>
                  <select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="Active In-Use">Active In-Use</option>
                    <option value="Under Engraving">Under Engraving / Chroming</option>
                    <option value="Worn Out / Retouch Needed">Worn Out / Retouch Needed</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> Save Cylinder Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Job Card PDF Modal */}
      {selectedForPDF && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal-toolbar no-print">
            <button className="btn-secondary" onClick={() => setSelectedForPDF(null)}>
              Close Job Card
            </button>
          </div>
          <div className="pdf-paper-container landscape" style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', maxWidth: '1200px', width: '95vw', overflowY: 'auto' }}>
            <CylinderJobCardForm initialData={selectedForPDF} onClose={() => setSelectedForPDF(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
