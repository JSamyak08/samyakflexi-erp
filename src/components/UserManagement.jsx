import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Lock, 
  CheckCircle2, 
  Search,
  Edit3,
  Trash2,
  ShieldCheck,
  CheckSquare,
  Square,
  Key,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  Save
} from 'lucide-react';
import { SYSTEM_ROLES, ALL_MODULES, generateFullRolePermissions, DEFAULT_ROLE_PERMISSIONS } from '../factoryStore';
import { saveRolePermissionsToSupabase } from '../services/supabaseDataService';
import { notifyUserCreated } from '../services/emailService';

export default function UserManagement({ 
  users = [], 
  currentUser, 
  rolePermissions = DEFAULT_ROLE_PERMISSIONS,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onUpdateRolePermissions
}) {
  const isAuthorized = currentUser?.role === 'Admin';
  const isAdmin = currentUser?.role === 'Admin';
  const [saveNotification, setSaveNotification] = useState(null);

  const [activeSubTab, setActiveSubTab] = useState('directory'); // 'directory' | 'rbac'
  const [searchTerm, setSearchTerm] = useState('');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // User Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [role, setRole] = useState('Store Manager');
  const [department, setDepartment] = useState('Store & Raw Material');
  const [status, setStatus] = useState('Active');

  const roleOptions = [
    { role: "Admin", dept: "Executive Management" },
    { role: "Plant Manager", dept: "Operations & Plant" },
    { role: "Production Manager", dept: "Operations & Plant" },
    { role: "Store Manager", dept: "Store & Raw Material" },
    { role: "QC Chemist", dept: "Quality Control Lab" },
    { role: "Purchase Manager", dept: "Purchase & Commercial" },
    { role: "Sales Manager", dept: "Sales & Commercial" },
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
    setPassword('password123');
    setRole('Store Manager');
    setDepartment('Store & Raw Material');
    setStatus('Active');
    setIsOnboardingModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setName(u.name || '');
    setEmail(u.email || '');
    setPassword(u.password || 'password123');
    setRole(u.role || 'Store Manager');
    setDepartment(u.department || 'Store & Raw Material');
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
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password || 'password123',
        role,
        department,
        status
      };
      if (onUpdateUser) onUpdateUser(updated);
      alert(`User account "${name}" updated successfully!`);
    } else {
      const newUser = {
        id: `USR-${Math.floor(1000 + Math.random() * 9000)}`,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password || 'password123',
        role,
        department,
        status
      };
      if (onAddUser) onAddUser(newUser);
      notifyUserCreated(newUser, newUser.email).catch(err => console.error("User creation email error:", err));
      alert(`New user "${name}" onboarded with role "${role}" successfully!\n\nCredentials email notification sent to ${newUser.email}.`);
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

  const triggerSaveNotification = (msg) => {
    setSaveNotification(msg);
    setTimeout(() => setSaveNotification(null), 4000);
  };

  const handleSavePermissionsMatrix = (permsToSave = rolePermissions) => {
    if (!isAdmin) return;
    if (onUpdateRolePermissions) onUpdateRolePermissions(permsToSave);
    saveRolePermissionsToSupabase(permsToSave);
    triggerSaveNotification("✅ RBAC Permissions Matrix Saved & Synced to Database Successfully!");
  };

  const togglePermission = (roleName, moduleKey) => {
    if (!isAdmin) {
      alert("Only Admin role can configure role permissions!");
      return;
    }
    const currentVal = rolePermissions[roleName]?.[moduleKey] ?? true;
    const updated = {
      ...rolePermissions,
      [roleName]: {
        ...(rolePermissions[roleName] || {}),
        [moduleKey]: !currentVal
      }
    };
    if (onUpdateRolePermissions) onUpdateRolePermissions(updated);
    saveRolePermissionsToSupabase(updated);
  };

  const handleAllowAllPermissions = () => {
    if (!isAdmin) return;
    if (window.confirm("Grant FULL ACCESS to all modules for ALL system roles?")) {
      const fullPerms = generateFullRolePermissions(true);
      if (onUpdateRolePermissions) onUpdateRolePermissions(fullPerms);
      saveRolePermissionsToSupabase(fullPerms);
      triggerSaveNotification("⚡ Full Access granted to all roles & synced to Database!");
    }
  };

  const handleResetPermissions = () => {
    if (!isAdmin) return;
    if (window.confirm("Reset RBAC permissions to default configuration?")) {
      const defaultPerms = generateFullRolePermissions(true);
      if (onUpdateRolePermissions) onUpdateRolePermissions(defaultPerms);
      saveRolePermissionsToSupabase(defaultPerms);
      triggerSaveNotification("🔄 Role permissions reset & synced to Database!");
    }
  };

  const filteredUsers = (users || []).filter(u => 
    (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {saveNotification && (
        <div style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '12px 20px', borderRadius: '8px', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle2 size={20} />
          {saveNotification}
        </div>
      )}

      {/* Top Header Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={22} style={{ color: 'var(--primary-brand)' }} /> User Management & Dynamic RBAC Permissions Matrix
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Onboard plant users and configure module access permissions per role across Samyak FactoryOS.
            </p>
          </div>

          {/* Sub-Tab Switcher */}
          <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <button 
              className={`btn-secondary ${activeSubTab === 'directory' ? 'active' : ''}`}
              style={{ background: activeSubTab === 'directory' ? '#0f172a' : 'transparent', color: activeSubTab === 'directory' ? '#ffffff' : '#334155', border: 'none', padding: '6px 14px', fontSize: '0.82rem', fontWeight: '700' }}
              onClick={() => setActiveSubTab('directory')}
            >
              <Users size={16} /> User Directory ({users.length})
            </button>
            <button 
              className={`btn-secondary ${activeSubTab === 'rbac' ? 'active' : ''}`}
              style={{ background: activeSubTab === 'rbac' ? '#0f172a' : 'transparent', color: activeSubTab === 'rbac' ? '#ffffff' : '#334155', border: 'none', padding: '6px 14px', fontSize: '0.82rem', fontWeight: '700' }}
              onClick={() => setActiveSubTab('rbac')}
            >
              <ShieldCheck size={16} /> Role & Module Permissions Matrix
            </button>
          </div>
        </div>
      </div>

      {!isAuthorized ? (
        /* Permission Locked Notice */
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <Lock size={48} style={{ color: '#d97706', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#b45309' }}>
            User Management Access Restricted to Admin Role Only
          </h3>
          <p style={{ color: '#92400e', fontSize: '0.85rem', marginTop: '6px', maxWidth: '440px', margin: '6px auto 16px auto' }}>
            Only <b>Admin</b> role has authority to manage user accounts and configure RBAC module permissions matrix.
          </p>
          <span className="badge badge-warning" style={{ padding: '6px 12px' }}>
            Your Role: {currentUser?.role || 'Guest'}
          </span>
        </div>
      ) : activeSubTab === 'rbac' ? (
        /* RBAC PERMISSIONS MATRIX TAB */
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} style={{ color: 'var(--primary-brand)' }} /> Role-Based Module Access Control (RBAC) Matrix
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Check modules to grant permission, or uncheck to restrict access for a specific role.
              </p>
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-primary" style={{ background: '#0284c7', borderColor: '#0284c7', fontSize: '0.82rem', padding: '6px 14px' }} onClick={() => handleSavePermissionsMatrix()}>
                  <Save size={16} /> Save RBAC Permissions Matrix
                </button>
                <button className="btn-primary" style={{ background: '#047857', borderColor: '#047857', fontSize: '0.82rem', padding: '6px 14px' }} onClick={handleAllowAllPermissions}>
                  <Sparkles size={16} /> Allow All Permissions to All Roles
                </button>
                <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={handleResetPermissions}>
                  <RotateCcw size={16} /> Reset Matrix
                </button>
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ background: '#0f172a', color: '#fff' }}>Module / Screen Name</th>
                  {SYSTEM_ROLES.map(r => (
                    <th key={r} style={{ textAlign: 'center', background: '#1e293b', color: '#fff', fontSize: '0.78rem' }}>
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_MODULES.map(mod => (
                  <tr key={mod.key}>
                    <td style={{ fontWeight: '700', color: '#0f172a' }}>
                      {mod.label}
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>Category: {mod.category}</span>
                    </td>
                    {SYSTEM_ROLES.map(r => {
                      const isAllowed = rolePermissions[r]?.[mod.key] ?? true;
                      return (
                        <td key={r} style={{ textAlign: 'center', verticalAlign: 'middle', background: isAllowed ? '#f0fdf4' : '#fef2f2' }}>
                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: isAdmin ? 'pointer' : 'default',
                              color: isAllowed ? '#047857' : '#dc2626',
                              fontWeight: '700',
                              fontSize: '0.8rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={() => togglePermission(r, mod.key)}
                            title={isAllowed ? `Allowed for ${r}. Click to Revoke` : `Restricted for ${r}. Click to Grant`}
                          >
                            {isAllowed ? <CheckSquare size={18} /> : <Square size={18} style={{ color: '#cbd5e1' }} />}
                            {isAllowed ? <span style={{ fontSize: '0.72rem' }}>ALLOW</span> : <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>BLOCK</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* USERS DIRECTORY TAB */
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Plant User Accounts Directory</h3>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                <label>Login Password</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="password123"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
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
