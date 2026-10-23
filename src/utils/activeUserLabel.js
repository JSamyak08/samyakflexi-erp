/**
 * Directory users are keyed by id. The header toggle must keep that id as the
 * select value, and show the username column when the row actually has one.
 */

export function readUsername(record) {
  if (!record || typeof record.username !== 'string') return '';
  return record.username.trim();
}

export function activeUserLabel(user) {
  const username = readUsername(user);
  if (username) return username;
  if (user?.id == null) return '';
  const id = String(user.id).trim();
  return id;
}

export function mapDirectoryUser(row) {
  const username = readUsername(row);
  return {
    id: row.id,
    username,
    name: row.full_name || username || 'User',
    email: row.email || (username.includes('@') ? username : ''),
    role: row.role || 'Shop Floor Operator',
    department: row.department || 'Operations',
    status: row.status || (row.active !== false ? 'Active' : 'Inactive'),
  };
}

function flattenOptionText(children) {
  if (children == null || children === false || children === true) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flattenOptionText).join('');
  return '';
}

/**
 * Native <option> text can be several React children (whitespace plus
 * expressions). Those arrive as an array. Joining the text nodes keeps the
 * visible label; a complex element still falls back to the option value.
 */
export function optionLabelFromChildren(children, fallback = '') {
  const text = flattenOptionText(children).trim();
  if (text) return text;
  return fallback == null ? '' : String(fallback);
}
