import { PLANT_ROLE_OPTIONS } from '../assignedRoles';

/**
 * Multi-select for Assigned Plant Role. The parent owns the selected list
 * and which of those roles is primary.
 */
export default function AssignedPlantRoleField({ roles = [], primary = '', onToggle }) {
  return (
    <fieldset
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        margin: 0,
        padding: '10px 12px',
      }}
    >
      <legend style={{ padding: '0 6px', fontWeight: 700 }}>Assigned Plant Roles *</legend>
      <p style={{ margin: '4px 0 8px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        Select every FlexiERP role this person should have. Screens and database access follow the combined permissions.
        User Access and Audit Logs stay Admin-only. The primary role is stored on the existing role field for older screens, and Admin becomes primary when it is selected.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {PLANT_ROLE_OPTIONS.map((option) => {
          const checked = roles.includes(option.role);
          const isPrimary = checked && primary === option.role;
          return (
            <label
              key={option.role}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '6px 4px',
                borderRadius: '6px',
                background: checked ? '#f0fdf4' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                name="assigned-plant-role"
                value={option.role}
                checked={checked}
                onChange={() => onToggle(option.role)}
                style={{ marginTop: '3px' }}
              />
              <span style={{ fontSize: '0.88rem', lineHeight: 1.4 }}>
                <strong>{option.role}</strong>
                <span style={{ color: 'var(--text-muted)' }}> ({option.dept})</span>
                {isPrimary && (
                  <span className="badge badge-client" style={{ marginLeft: '8px' }}>Primary</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
