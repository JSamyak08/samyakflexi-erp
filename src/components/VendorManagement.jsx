import React, { useState } from 'react';
import { 
  Building2, 
  Plus, 
  Mail, 
  Phone, 
  MapPin, 
  CreditCard, 
  CheckCircle2, 
  Star, 
  FileText,
  Search,
  Printer,
  X
} from 'lucide-react';
import { generateVendorId } from '../factoryStore';
import PurchaseOrderPDF from './PurchaseOrderPDF';

export default function VendorManagement({ urlParams = {}, vendors = [], orders = [], onAddVendor }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [selectedVendorForPoHistory, setSelectedVendorForPoHistory] = useState(null);
  const [activePoPdfData, setActivePoPdfData] = useState(null);

  React.useEffect(() => {
    if (urlParams && urlParams.id) {
      setSearchTerm(urlParams.id);
    }
  }, [urlParams?.id]);

  // New Vendor Form State
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30 Days Net');
  const [selectedMaterials, setSelectedMaterials] = useState(['PET', 'METPET']);

  const materialOptions = [
    "PET", 
    "METPET", 
    "LDPE", 
    "Natural GP LD", 
    "White LD", 
    "BOPP Natural", 
    "Metalised BOPP", 
    "Pearlised BOPP", 
    "CPP Natural", 
    "Metalised CPP", 
    "Liquid Inks", 
    "Solvent-less Adhesive", 
    "Solvents"
  ];

  const toggleMaterial = (mat) => {
    setSelectedMaterials(prev => 
      prev.includes(mat) ? prev.filter(m => m !== mat) : [...prev, mat]
    );
  };

  const handleSaveVendor = (e) => {
    e.preventDefault();
    if (!companyName.trim() || !gstin.trim()) {
      alert("Company Name and GSTIN are required!");
      return;
    }

    const newVendor = {
      id: generateVendorId(),
      name: companyName.trim(),
      companyName: companyName.trim(),
      gstin: gstin.toUpperCase().trim(),
      address: address.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      bankDetails: bankDetails || "HDFC Bank | A/C: 502000000000 | IFSC: HDFC0000123",
      materials: selectedMaterials,
      paymentTerms,
      rating: 5.0
    };

    if (onAddVendor) {
      onAddVendor(newVendor);
    }

    // Reset Form
    setCompanyName('');
    setGstin('');
    setAddress('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setBankDetails('');
    setIsOnboardingModalOpen(false);
    alert(`Vendor "${companyName}" onboarded successfully!`);
  };

  const filteredVendors = vendors.filter(v => 
    v.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.gstin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.materials.some(m => m.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Helper to compute PO history for a selected vendor
  const getVendorPoHistory = (vendor) => {
    if (!vendor) return [];
    
    // 1. Read cached POs from localStorage
    let cachedPos = {};
    try {
      const saved = localStorage.getItem('samyak_erp_issued_pos');
      if (saved) cachedPos = JSON.parse(saved);
    } catch (e) {
      console.warn("Error reading issued pos", e);
    }

    const historyList = [];

    // Check cached POs
    Object.values(cachedPos).forEach(po => {
      if (po.vendor && (po.vendor.id === vendor.id || po.vendor.companyName === vendor.companyName)) {
        historyList.push(po);
      }
    });

    // Scrape orders for matching issued requirements if not in cache
    orders.forEach(ord => {
      (ord.materialRequirements || []).forEach(r => {
        if (r.poIssued && r.preferredVendor === vendor.companyName) {
          const poNo = r.poNumber || ord.poNumber || 'PO-2026-101';
          if (!historyList.some(p => p.poNumber === poNo)) {
            let rate = 165;
            if (r.filmType.includes('METPET')) rate = 185;
            else if (r.filmType.includes('LD')) rate = 135;
            else if (r.filmType.includes('Ink')) rate = 1500;
            else if (r.filmType.includes('Adhesive')) rate = 270;

            historyList.push({
              poNumber: poNo,
              date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
              vendor: vendor,
              items: [{
                id: r.id,
                orderId: ord.id,
                itemDesc: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''}`.trim(),
                spec: `${r.filmType} ${r.micron && r.micron !== '-' ? r.micron + 'µ' : ''} | Width: ${r.widthMm}mm`,
                qtyKg: r.qtyKg,
                rate: rate,
                amount: r.qtyKg * rate
              }],
              deliveryDate: '2026-07-29',
              terms: vendor.paymentTerms || '30 Days Net',
              remarks: 'Raw material must strictly conform to specified micron gauge and slit width.'
            });
          }
        }
      });
    });

    return historyList;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Generated Purchase Order PDF Modal Preview */}
      {activePoPdfData && (
        <PurchaseOrderPDF 
          poData={activePoPdfData} 
          onClose={() => setActivePoPdfData(null)} 
        />
      )}

      {/* Top Action Header */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Vendor Onboarding & Directory ({vendors.length})
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Manage approved raw material suppliers, bank details, GSTIN records, and issued PO history.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="search-bar" style={{ width: '300px' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search Vendor Name, GSTIN, Material..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem' }}
              />
            </div>

            <button className="btn-primary" onClick={() => setIsOnboardingModalOpen(true)}>
              <Plus size={18} /> Onboard New Vendor
            </button>
          </div>
        </div>
      </div>

      {/* Vendor Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
        {filteredVendors.map(vendor => (
          <div key={vendor.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '12px' }}>
            {/* Header: Company Name & Rating */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-info" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'inline-block' }}>
                  {vendor.id}
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {vendor.companyName}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  GSTIN: <strong style={{ color: 'var(--text-primary)' }}>{vendor.gstin}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(234, 179, 8, 0.1)', padding: '4px 8px', borderRadius: '6px', color: '#ca8a04', fontSize: '0.85rem', fontWeight: '700' }}>
                <Star size={14} fill="#ca8a04" />
                {vendor.rating || 5.0}
              </div>
            </div>

            {/* Contact Person & Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={14} style={{ color: 'var(--primary-brand)' }} />
                <span>Contact: <b>{vendor.contactPerson}</b> ({vendor.phone})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={14} style={{ color: 'var(--primary-brand)' }} />
                <span>{vendor.email}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <MapPin size={14} style={{ color: 'var(--primary-brand)', marginTop: '2px', flexShrink: 0 }} />
                <span>{vendor.address}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '2px' }}>
                <CreditCard size={14} style={{ color: 'var(--primary-brand)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{vendor.bankDetails}</span>
              </div>
            </div>

            {/* Supplied Materials Tags */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
                SUPPLIED MATERIALS:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {vendor.materials.map((mat, i) => (
                  <span key={i} className="badge badge-both" style={{ fontSize: '0.75rem' }}>
                    {mat}
                  </span>
                ))}
              </div>
            </div>

            {/* Card Footer */}
            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Terms: <b>{vendor.paymentTerms}</b>
              </span>
              <button 
                className="btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}
                onClick={() => setSelectedVendorForPoHistory(vendor)}
              >
                <FileText size={14} /> PO History
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Vendor PO History */}
      {selectedVendorForPoHistory && (
        <div className="modal-overlay" onClick={() => setSelectedVendorForPoHistory(null)}>
          <div className="glass-card modal-content" style={{ width: '780px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={22} style={{ color: 'var(--primary-brand)' }} />
                  Purchase Order History — {selectedVendorForPoHistory.companyName}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  GSTIN: {selectedVendorForPoHistory.gstin} • Terms: {selectedVendorForPoHistory.paymentTerms}
                </p>
              </div>
              <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setSelectedVendorForPoHistory(null)}>
                <X size={18} />
              </button>
            </div>

            {(() => {
              const poList = getVendorPoHistory(selectedVendorForPoHistory);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {poList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        No Purchase Orders have been issued to <b>{selectedVendorForPoHistory.companyName}</b> yet.
                      </p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>PO Number</th>
                            <th>Issue Date</th>
                            <th>Items & Materials</th>
                            <th>Total Amount (₹)</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {poList.map((po, idx) => {
                            const totalVal = (po.items || []).reduce((acc, item) => acc + (Number(item.amount) || ((item.qtyKg || 0) * (item.rate || 0))), 0);
                            return (
                              <tr key={idx}>
                                <td style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>{po.poNumber}</td>
                                <td>{po.date || 'Recent'}</td>
                                <td>
                                  {(po.items || []).map((it, i) => (
                                    <div key={i} style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                                      • {it.itemDesc || it.description} ({it.qtyKg} kg @ ₹{it.rate}/kg)
                                    </div>
                                  ))}
                                </td>
                                <td style={{ fontWeight: '800', color: '#047857' }}>
                                  ₹{(totalVal ?? 0).toLocaleString()}
                                </td>
                                <td>
                                  <button 
                                    className="btn-primary" 
                                    style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#047857' }}
                                    onClick={() => setActivePoPdfData(po)}
                                  >
                                    <Printer size={12} /> View / Print PO PDF
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setSelectedVendorForPoHistory(null)}>
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Onboarding Modal */}
      {isOnboardingModalOpen && (
        <div className="modal-overlay" onClick={() => setIsOnboardingModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '700px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={22} style={{ color: 'var(--accent-color)' }} /> Vendor Onboarding Form
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Input official company GSTIN, contact credentials, address and material details for PO generation.
            </p>

            <form onSubmit={handleSaveVendor}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Company Name *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    required
                    placeholder="e.g. FlexiPoly Films Ltd"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>GSTIN *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    required
                    placeholder="e.g. 23AABCF1234H1Z5"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Factory / Office Address *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    required
                    placeholder="e.g. Plot 45, Sector 3, Pithampur Industrial Area, Dhar M.P."
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Contact Person Name</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="e.g. Rajesh Kumar"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="e.g. +91 98260 12345"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    className="form-control"
                    placeholder="e.g. sales@flexipoly.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Terms</label>
                  <input 
                    type="text" 
                    className="form-control"
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Vendor Bank Account & IFSC Details</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="e.g. HDFC Bank | A/C: 50200012345678 | IFSC: HDFC0000123"
                    value={bankDetails}
                    onChange={e => setBankDetails(e.target.value)}
                  />
                </div>
              </div>

              {/* Material Chips Selection */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Select Materials Supplied by Vendor *
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {materialOptions.map(mat => {
                    const isSelected = selectedMaterials.includes(mat);
                    return (
                      <button 
                        type="button" 
                        key={mat}
                        className={`preset-chip ${isSelected ? 'active-chip' : ''}`}
                        onClick={() => toggleMaterial(mat)}
                      >
                        {mat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsOnboardingModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={18} /> Complete Vendor Onboarding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
