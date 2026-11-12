/**
 * Rows returned by a data load are shown as stored.
 * Nothing is dropped because of a keyword, a seed id, or a job name.
 */
export function recordsAfterDataLoad(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.slice();
}
