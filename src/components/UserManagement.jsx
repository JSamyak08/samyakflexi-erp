import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Lock, 
  CheckCircle2, 
  Search,
  Edit3,
  Trash2
} from 'lucide-react';

export default function UserManagement({ 
  users, 
  currentUser, 
  onAddUser,
  onUpdateUser,
  onDeleteUser
}) {
  const isAuthorized = currentUser?.role === 'Admin' || currentUser?.role === 'Plant Manager';
  const isAdmin = currentUser?.role === 'Admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Store Manager');
  const [department, setDepartment] = useState('Store & Raw Material');
  const [status, setStatus] = useState('Active');

  const roleOptions = [
    { role: "Admin", dept: "Executive Management" },
    { role: "Plant Manager", dept: "Operations & Plant" },
    { role: "Store Manager", dept: "Store & Raw Material" },
    { role: "QC Chemist", dept: "Quality Control Lab" },
    { role: "Purchase Manager", dept: "Purchase & Commercial" },
    { role: "Shop Floor Operator", dept: "Lamination & Printing" }
  ];

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    const found = roleOptions.find(r => r.role === selectedRole);
    if (found) setDepartment(found.dept);
  };

  const openAddModal = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setRole('Store Manager');
    setDepartment('Store & Raw Material');
    setStatus('Active');
    setIsOnboardingModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setDepartment(u.department);
    setStatus(u.status || 'Active');
    setIsOnboardingModalOpen(true);
  };

  const handleSaveUser = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      alert("Name and Email are required!");
      return;
    }

    if (editingUser) {
      const updated = {
        ...editingUser,
        name,
        email,
        role,
        department,
        status
      };
      if (onUpdateUser) onUpdateUser(updated);
      alert(`User account "${name}" updated successfully!`);
    } else {
      const newUser = {
        id: `USR-00${users.length + 1}`,
        name,
        email,
        role,
        department,
        status
      };
      if (onAddUser) onAddUser(newUser);
      alert(`User "${name}" onboarded with role "${role}" successfully!`);
    }

    setIsOnboardingModalOpen(false);
  };

  const handleDeleteClick = (u) => {
    if (!isAdmin) {
      alert("Only users with Admin role have permission to delete user accounts!");
      return;
    }
    if (window.confirm(`Are you sure you want to permanently remove user account "${u.name}" (${u.email}) from Samyak FactoryOS?`)) {
      if (onDeleteUser) onDeleteUser(u.id);
      alert(`User account "${u.name}" deleted.`);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Users size={22} style={{ color: 'var(--primary-brand)' }} /> User Management & Departmental Access (RBAC)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Manage plant user accounts and permissions. <b>Admin role</b> has full authority to onboard, edit, or delete users.
            </p>
          </div>

          {isAuthorized && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-control"
                  style={{ paddingLeft: '36px' }}
                  placeholder="Search user, role or dept..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {isAdmin && (
                <button className="btn-primary" onClick={openAddModal}>
                  <UserPlus size={16} /> Onboard New User
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!isAuthorized ? (
        /* Permission Locked Notice */
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <Lock size={48} style={{ color: '#d97706', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#b45309' }}>
            User Management Access Restricted
          </h3>
          <p style={{ color: '#92400e', fontSize: '0.85rem', marginTop: '6px', maxWidth: '420px', margin: '6px auto 16px auto' }}>
            Only <b>Admin</b> and <b>Plant Manager</b> roles have permission to access user account administration.
          </p>
          <span className="badge badge-warning" style={{ padding: '6px 12px' }}>
            Your Role: {currentUser?.role || 'Guest'}
          </span>
        </div>
      ) : (
        /* Users Directory Table */
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Plant User Accounts Directory</h3>
            {!isAdmin && (
              <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                🔒 Edit / Delete Actions Reserved for Admin Role
              </span>
            )}
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Full Name</th>
                  <th>Email Address</th>
                  <th>Assigned Role</th>
                  <th>Department</th>
                  <th>Access Scope</th>
                  <th>Status</th>
                  {isAdmin && <th>Admin Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{u.id}</td>
                    <td style={{ fontWeight: '600' }}>{u.name}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'Admin' ? 'badge-warning' : u.role === 'Plant Manager' ? 'badge-client' : u.role === 'Store Manager' ? 'badge-us' : 'badge-both'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.department}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {u.role === 'Admin' && 'Full Access + Profitability + User Management'}
                      {u.role === 'Plant Manager' && 'Full Operations + Profitability'}
                      {u.role === 'Store Manager' && 'Stock Register + GRN + Issue/Return + Reconciliation'}
                      {u.role === 'QC Chemist' && 'Quality Control Lab Inspection'}
                      {u.role === 'Purchase Manager' && 'Vendor Onboarding + PO Issuance'}
                      {u.role === 'Shop Floor Operator' && 'Job Punching + Actual Consumption'}
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'Inactive' ? 'badge-warning' : 'badge-us'}`}>
                        {u.status || 'ACTIVE'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }} 
                            onClick={() => openEditModal(u)}
                            title="Edit User"
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                          
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecaca' }} 
                            onClick={() => handleDeleteClick(u)}
                            title="Delete User"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Onboard / Edit User */}
      {isOnboardingModalOpen && (
        <div className="modal-overlay" onClick={() => setIsOnboardingModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '550px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={20} style={{ color: 'var(--primary-brand)' }} /> {editingUser ? 'Edit User Account' : 'Onboard Plant User'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Configure role and department permissions for Samyak FactoryOS.
            </p>

            <form onSubmit={handleSaveUser}>
              <div className="form-group">
                <label>Full Name *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  placeholder="e.g. Ramesh Kumar"
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input 
                  type="email" 
                  className="form-control" 
                  required 
                  placeholder="name@samyak.com"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label>Assigned Plant Role *</label>
                <select className="form-control" value={role} onChange={e => handleRoleSelect(e.target.value)}>
                  {roleOptions.map(r => (
                    <option key={r.role} value={r.role}>{r.role} ({r.dept})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Department</label>
                <input type="text" className="form-control" readOnly value={department} />
              </div>

              <div className="form-group">
                <label>Account Status</label>
                <select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsOnboardingModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> {editingUser ? 'Save Account Changes' : 'Complete User Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
