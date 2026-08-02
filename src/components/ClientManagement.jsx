import React, { useState, useMemo } from 'react';
import { Plus, Search, Building2, Phone, MapPin, Briefcase, ChevronRight, Package, Layers, X, Edit, Trash2, AlertTriangle, ExternalLink, IndianRupee, Image as ImageIcon } from 'lucide-react';
import { openArtworkViewer } from '../services/supabaseStorageService';
import ArtworkModal from './ArtworkModal';

export default function ClientManagement({ clients, orders, cylinders, onAddClient, onUpdateClient, onDeleteClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, client: null });
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

  // Form State
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    return clients.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (c.gstin && c.gstin.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [clients, searchTerm]);

  const openModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setName(client.name);
      setGstin(client.gstin || '');
      setAddress(client.address || '');
      setPaymentTerms(client.paymentTerms || '');
      setContactPerson(client.contactPerson || '');
      setPhone(client.phone || '');
    } else {
      setEditingClient(null);
      setName('');
      setGstin('');
      setAddress('');
      setPaymentTerms('');
      setContactPerson('');
      setPhone('');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newClient = {
      id: editingClient ? editingClient.id : `CLI-${Math.floor(100 + Math.random() * 900)}`,
      name,
      gstin,
      address,
      paymentTerms,
      contactPerson,
      phone
    };

    if (editingClient) {
      onUpdateClient(newClient);
      if (selectedClient && selectedClient.id === newClient.id) {
        setSelectedClient(newClient);
      }
    } else {
      onAddClient(newClient);
    }
    setIsModalOpen(false);
  };

  const handleDeleteClient = (client) => {
    setDeleteConfirm({ isOpen: true, client });
  };

  const confirmDelete = () => {
    if (deleteConfirm.client && onDeleteClient) {
      onDeleteClient(deleteConfirm.client.id);
      if (selectedClient && selectedClient.id === deleteConfirm.client.id) {
        setSelectedClient(null);
      }
    }
    setDeleteConfirm({ isOpen: false, client: null });
  };

  // Helper to format currency
  const formatINR = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val || '—';
    return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  // Derived Data for Selected Client
  const clientOrders = useMemo(() => {
    if (!selectedClient || !orders) return { pending: [], completed: [] };
    const matching = orders.filter(o => o.clientName === selectedClient.name);
    return {
      pending: matching.filter(o => o.status !== 'Completed' && o.status !== 'Dispatched'),
      completed: matching.filter(o => o.status === 'Completed' || o.status === 'Dispatched')
    };
  }, [selectedClient, orders]);

  const clientCylinders = useMemo(() => {
    if (!selectedClient || !cylinders) return [];
    return cylinders.filter(c => c.clientGroup === selectedClient.name || c.clientName === selectedClient.name || (c.jobName && c.jobName.includes(selectedClient.name)));
  }, [selectedClient, cylinders]);

  // Cylinder totals for selected client
  const cylinderCostSummary = useMemo(() => {
    if (!clientCylinders.length) return { totalCylinders: 0, totalValue: 0 };
    let totalCyls = 0;
    let totalVal = 0;
    clientCylinders.forEach(c => {
      const colors = parseInt(c.colorsCount || c.numberOfCylinders || 1, 10);
      totalCyls += colors;
      
      let costPerCyl = parseFloat(c.costPerCylinder || 0);
      let totalSetCost = parseFloat(typeof c.cylinderCost === 'string' ? c.cylinderCost.replace(/[^0-9.]/g, '') : (c.cylinderCost || 0));
      
      if (!totalSetCost && costPerCyl) {
        totalSetCost = costPerCyl * colors;
      } else if (!totalSetCost && c.faceLengthMm && c.circumferenceMm) {
        const sqCm = (parseFloat(c.faceLengthMm) * parseFloat(c.circumferenceMm)) / 100;
        const rate = parseFloat(c.rate || c.ratePerSqInch) || 1.60;
        costPerCyl = sqCm * rate;
        totalSetCost = costPerCyl * colors;
      }
      totalVal += (totalSetCost || 0);
    });
    return { totalCylinders: totalCyls, totalValue: totalVal };
  }, [clientCylinders]);

  // If a client is selected, show detail view
  if (selectedClient) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Detail Header */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', color: 'var(--primary-brand)', fontWeight: '600' }} onClick={() => setSelectedClient(null)}>
            <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} /> Back to Clients List
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{selectedClient.name}</h2>
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>ID: {selectedClient.id}</span>
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Briefcase size={16} /> GSTIN: <strong>{selectedClient.gstin || 'N/A'}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <MapPin size={16} /> {selectedClient.address || 'N/A'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Phone size={16} /> {selectedClient.contactPerson || 'N/A'} ({selectedClient.phone || 'No Phone'})
                </span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Payment Terms: {selectedClient.paymentTerms || 'Standard'}</span>
                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Active Client</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => openModal(selectedClient)}>
                <Edit size={16} /> Edit Details
              </button>
              <button 
                className="btn-secondary" 
                style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }} 
                onClick={() => handleDeleteClient(selectedClient)}
                title="Delete this client"
              >
                <Trash2 size={16} /> Delete Client
              </button>
            </div>
          </div>
        </div>

        {/* Client Dashboard Split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '24px' }}>
          {/* Orders Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} /> Pending Orders ({clientOrders.pending.length})
              </h3>
              {clientOrders.pending.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No pending orders.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {clientOrders.pending.map(o => (
                    <div key={o.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <strong style={{ color: 'var(--primary-brand)' }}>{o.id}</strong>
                        <span className="badge badge-warning">{o.status}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{o.jobName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Qty: {o.orderQtyKg} kg | Target: {o.targetDeliveryDate}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} style={{ color: 'var(--success)' }} /> Completed Orders ({clientOrders.completed.length})
              </h3>
              {clientOrders.completed.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No completed orders.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {clientOrders.completed.map(o => (
                    <div key={o.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <strong>{o.id}</strong>
                        <span className="badge badge-success">{o.status}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{o.jobName}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cylinders Column with Cost Calculation Details */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} /> Associated Cylinders & Costs ({clientCylinders.length} Jobs)
              </h3>
            </div>

            {/* Cylinder Financial Summary Banner */}
            {clientCylinders.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>TOTAL CYLINDERS IN ASSETS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary-brand)' }}>{cylinderCostSummary.totalCylinders} Cylinders</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>TOTAL CYLINDER SET VALUE</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#047857' }}>{formatINR(cylinderCostSummary.totalValue)}</div>
                </div>
              </div>
            )}

            {clientCylinders.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No cylinders found for this client.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Job / SKU</th>
                      <th>Colors & Size</th>
                      <th>Cost / Cyl</th>
                      <th>Total Set Cost</th>
                      <th>Cost Borne By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientCylinders.map(c => {
                      const colors = parseInt(c.colorsCount || c.numberOfCylinders || 1, 10);
                      let costPerCyl = parseFloat(c.costPerCylinder || 0);
                      let totalSetCost = parseFloat(typeof c.cylinderCost === 'string' ? c.cylinderCost.replace(/[^0-9.]/g, '') : (c.cylinderCost || 0));

                      if (!costPerCyl && totalSetCost && colors) {
                        costPerCyl = totalSetCost / colors;
                      } else if (!totalSetCost && c.faceLengthMm && c.circumferenceMm) {
                        const sqCm = (parseFloat(c.faceLengthMm) * parseFloat(c.circumferenceMm)) / 100;
                        const rate = parseFloat(c.rate || c.ratePerSqInch) || 1.60;
                        costPerCyl = sqCm * rate;
                        totalSetCost = costPerCyl * colors;
                      }

                      const artwork = c.artworkUrl || c.imageUrl || c.artworkImage;

                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {artwork ? (
                                <img 
                                  src={artwork} 
                                  alt="Artwork" 
                                  style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }} 
                                  onClick={() => setActiveArtworkModal({ isOpen: true, url: artwork, title: `${c.sku} - ${c.jobName}` })}
                                  title="Click to view artwork"
                                />
                              ) : (
                                <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                  <ImageIcon size={16} />
                                </div>
                              )}
                              <div>
                                <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.jobName}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontWeight: '700' }}>{colors} Colors</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {c.faceLengthMm ? `${c.faceLengthMm} × ${c.circumferenceMm} mm` : '—'}
                            </div>
                          </td>
                          <td>
                            <strong style={{ color: '#334155' }}>{costPerCyl ? formatINR(costPerCyl) : '—'}</strong>
                            {(c.rate || c.ratePerSqInch) && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>@ ₹{c.rate || c.ratePerSqInch}/sq cm</div>
                            )}
                          </td>
                          <td>
                            <strong style={{ color: '#047857', fontSize: '0.9rem' }}>{totalSetCost ? formatINR(totalSetCost) : (c.cylinderCost || '—')}</strong>
                          </td>
                          <td>
                            <span className={c.costBorneBy === 'Client' || c.costBorneBy?.includes('Client') ? 'badge badge-info' : 'badge badge-warning'}>
                              {c.costBorneBy || 'Client'}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Limit: {c.utilisationLimit ? `${Number(c.utilisationLimit).toLocaleString()}m` : '10k'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Edit Modal reusing the same form */}
        {isModalOpen && (
          <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="glass-card modal-content" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Edit Client Details</h3>
                <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setIsModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Company Name *</label>
                  <input type="text" className="form-control" required value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>GSTIN</label>
                  <input type="text" className="form-control" value={gstin} onChange={e => setGstin(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Registered Address</label>
                  <textarea className="form-control" rows="2" value={address} onChange={e => setAddress(e.target.value)}></textarea>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input type="text" className="form-control" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="text" className="form-control" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Payment Terms</label>
                  <input type="text" className="form-control" placeholder="e.g. 30 Days Credit" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Update Client</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm.isOpen && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm({ isOpen: false, client: null })}>
            <div className="glass-card modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#dc2626', marginBottom: '16px' }}>
                <AlertTriangle size={24} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>Confirm Client Deletion</h3>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Are you sure you want to delete client <strong>{deleteConfirm.client?.name}</strong>?
                This will remove the client directory entry and disassociate existing records from Supabase and local storage.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setDeleteConfirm({ isOpen: false, client: null })}>
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn-primary" 
                  style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                  onClick={confirmDelete}
                >
                  <Trash2 size={16} /> Yes, Delete Client
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Controls */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="search-bar" style={{ width: '320px' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search clients by name or GSTIN..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem' }}
            />
          </div>
        </div>
        <button className="btn-primary" onClick={() => openModal()}>
          <Plus size={18} /> Onboard New Client
        </button>
      </div>

      {/* Clients List */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>GSTIN</th>
                <th>Contact Person</th>
                <th>Payment Terms</th>
                <th>Associated Cylinders</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No clients found.
                  </td>
                </tr>
              ) : (
                filteredClients.map(c => {
                  const cylCount = (cylinders || []).filter(cyl => cyl.clientGroup === c.name || cyl.clientName === c.name || (cyl.jobName && cyl.jobName.includes(c.name))).length;

                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedClient(c)}>
                      <td style={{ fontWeight: '600', color: 'var(--primary-brand)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building2 size={16} /> {c.name}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{c.gstin || 'N/A'}</td>
                      <td>
                        <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{c.contactPerson || 'N/A'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.phone}</div>
                      </td>
                      <td>
                        <span className="badge badge-info">{c.paymentTerms || 'Standard'}</span>
                      </td>
                      <td>
                        <span className="badge badge-success" style={{ fontWeight: '600' }}>
                          {cylCount} {cylCount === 1 ? 'Job' : 'Jobs'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                          <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => setSelectedClient(c)}>
                            View
                          </button>
                          <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => openModal(c)}>
                            <Edit size={13} />
                          </button>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fca5a5' }} 
                            onClick={() => handleDeleteClient(c)}
                            title="Delete Client"
                          >
                            <Trash2 size={13} />
                          </button>
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

      {/* Add / Edit Client Modal */}
      {isModalOpen && !selectedClient && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>{editingClient ? 'Edit Client Details' : 'Onboard New Client'}</h3>
              <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Company Name *</label>
                <input type="text" className="form-control" required value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>GSTIN</label>
                <input type="text" className="form-control" value={gstin} onChange={e => setGstin(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Registered Address</label>
                <textarea className="form-control" rows="2" value={address} onChange={e => setAddress(e.target.value)}></textarea>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Contact Person</label>
                  <input type="text" className="form-control" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="text" className="form-control" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Payment Terms</label>
                <input type="text" className="form-control" placeholder="e.g. 30 Days Credit" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ isOpen: false, client: null })}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#dc2626', marginBottom: '16px' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>Confirm Client Deletion</h3>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Are you sure you want to delete client <strong>{deleteConfirm.client?.name}</strong>?
              This will remove the client directory entry and disassociate existing records.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn-secondary" onClick={() => setDeleteConfirm({ isOpen: false, client: null })}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                onClick={confirmDelete}
              >
                <Trash2 size={16} /> Yes, Delete Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Artwork Lightbox Modal */}
      <ArtworkModal
        isOpen={activeArtworkModal.isOpen}
        onClose={() => setActiveArtworkModal({ isOpen: false, url: '', title: '' })}
        artworkUrl={activeArtworkModal.url}
        title={activeArtworkModal.title}
      />
    </div>
  );
}
