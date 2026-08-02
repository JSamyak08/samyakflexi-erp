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
  Search
} from 'lucide-react';

export default function VendorManagement({ vendors, onAddVendor }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

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
      id: `VEND-00${vendors.length + 1}`,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Action Header */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={24} style={{ color: 'var(--accent-color)' }} /> Vendor Management & Onboarding
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Onboard vendors with GSTIN, contact, bank details & material specs for Purchase Orders issuance.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                className="form-control"
                style={{ paddingLeft: '38px' }}
                placeholder="Search vendor or GSTIN..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={() => setIsOnboardingModalOpen(true)}>
              <Plus size={18} /> Onboard New Vendor
            </button>
          </div>
        </div>
      </div>

      {/* Vendor Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {filteredVendors.map(vendor => (
          <div key={vendor.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-client" style={{ fontSize: '0.75rem', marginBottom: '6px', display: 'inline-block' }}>
                  {vendor.id}
                </span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'white' }}>{vendor.companyName}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: '600', marginTop: '2px' }}>
                  GSTIN: {vendor.gstin}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.2)', padding: '4px 8px', borderRadius: '8px', color: '#f59e0b', fontSize: '0.85rem', fontWeight: '700' }}>
                <Star size={14} fill="#f59e0b" /> {vendor.rating}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)' }} />

            {/* Vendor Info List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <MapPin size={16} style={{ minWidth: '16px' }} />
                <span>{vendor.address}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <Phone size={16} style={{ minWidth: '16px' }} />
                <span>{vendor.contactPerson} ({vendor.phone})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <Mail size={16} style={{ minWidth: '16px' }} />
                <span>{vendor.email}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CreditCard size={16} style={{ minWidth: '16px' }} />
                <span>{vendor.bankDetails}</span>
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
            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Terms: <b>{vendor.paymentTerms}</b>
              </span>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                <FileText size={14} /> PO History
              </button>
            </div>
          </div>
        ))}
      </div>

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
                    placeholder="Full street address, City, State & PIN"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Contact Person *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    required
                    placeholder="e.g. Rajesh Sharma"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Phone / Mobile *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    required
                    placeholder="+91 98260 11223"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Email Address *</label>
                  <input 
                    type="email" 
                    className="form-control"
                    required
                    placeholder="orders@vendor.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Terms</label>
                  <select 
                    className="form-control"
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                  >
                    <option value="15 Days Net">15 Days Net</option>
                    <option value="30 Days Net">30 Days Net</option>
                    <option value="45 Days Net">45 Days Net</option>
                    <option value="Advance Payment">Advance Payment</option>
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Bank Account Details (for PO / Payment)</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Bank Name | Account Number | IFSC Code"
                    value={bankDetails}
                    onChange={e => setBankDetails(e.target.value)}
                  />
                </div>
              </div>

              {/* Material Categories Checkboxes */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
                  Select Materials Supplied by Vendor:
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
