import React, { useState, useMemo } from 'react';
import { Plus, Search, Building2, Phone, MapPin, Briefcase, ChevronRight, Package, Layers, X, Edit } from 'lucide-react';

export default function ClientManagement({ clients, orders, cylinders, onAddClient, onUpdateClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

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
    } else {
      onAddClient(newClient);
    }
    setIsModalOpen(false);
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

  // If a client is selected, show detail view
  if (selectedClient) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Detail Header */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', color: 'var(--primary-brand)', fontWeight: '600' }} onClick={() => setSelectedClient(null)}>
            <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} /> Back to Clients List
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)' }}>{selectedClient.name}</h2>
              <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Briefcase size={16} /> GSTIN: {selectedClient.gstin || 'N/A'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <MapPin size={16} /> {selectedClient.address || 'N/A'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Phone size={16} /> {selectedClient.contactPerson} ({selectedClient.phone})
                </span>
              </div>
              <div style={{ marginTop: '12px' }}>
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Payment Terms: {selectedClient.paymentTerms || 'Standard'}</span>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => openModal(selectedClient)}>
              <Edit size={16} /> Edit Details
            </button>
          </div>
        </div>

        {/* Client Dashboard Split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
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

          {/* Cylinders Column */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} /> Associated Cylinders ({clientCylinders.length})
            </h3>
            {clientCylinders.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No cylinders found for this client.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Job Name / SKU</th>
                      <th>Film Size (W x R)</th>
                      <th>Cost Borne By</th>
                      <th>Life Limit (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientCylinders.map(c => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: '600' }}>{c.jobName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.sku}</div>
                        </td>
                        <td>
                          {c.faceLengthMm ? `${c.faceLengthMm}mm (Face)` : 'N/A'} x {c.circumferenceMm ? `${c.circumferenceMm}mm` : 'N/A'}
                        </td>
                        <td>
                          <span className={c.costBorneBy === 'Client' ? 'badge badge-info' : 'badge badge-warning'}>
                            {c.costBorneBy || 'N/A'}
                          </span>
                        </td>
                        <td>{c.utilisationLimit ? c.utilisationLimit.toLocaleString() : 'N/A'}</td>
                      </tr>
                    ))}
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
                  <button type="submit" className="btn-primary">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Controls */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No clients found.
                  </td>
                </tr>
              ) : (
                filteredClients.map(c => (
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
                      <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); setSelectedClient(c); }}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Client Modal */}
      {isModalOpen && !selectedClient && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Onboard New Client</h3>
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
    </div>
  );
}
