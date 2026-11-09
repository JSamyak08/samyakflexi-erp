/**
 * Cylinder artwork belongs to one cylinder set.
 * Uploads are stored as artwork/<identity>_<timestamp>.<ext>, where identity
 * is the SKU or job name. A row may only show a file that is its own, or none.
 */

export function cleanArtworkToken(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 40);
}

export function artworkUrlsOf(row) {
  if (!row) return [];
  const values = [row.artworkUrl, row.jobCardFileUrl, row.artwork_url, row.job_card_file_url, row.imageUrl, row.artworkImage];
  const seen = new Set();
  const urls = [];
  values.forEach((value) => {
    const url = String(value || '').trim();
    if (!url) return;
    const bare = url.split('?')[0];
    if (seen.has(bare)) return;
    seen.add(bare);
    urls.push(url);
  });
  return urls;
}

export function sameArtworkUrl(left, right) {
  if (!left || !right) return false;
  return String(left).split('?')[0] === String(right).split('?')[0];
}

export function skuTokensInUrl(url) {
  const found = String(url || '').match(/SKU-CYL-\d+/ig) || [];
  return [...new Set(found.map((token) => token.toUpperCase()))];
}

/** Identity prefix written by uploadArtworkFile, before the timestamp. */
export function embeddedArtworkToken(url) {
  if (!url) return '';
  let path = String(url).split('?')[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path when the URL is not encoded.
  }
  const file = path.split('/').pop() || '';
  const match = file.match(/^(.*)_(\d{10,})(?:_[a-z0-9]+)?\.[a-z0-9]+$/i);
  return match ? match[1] : '';
}

function ownTokens(row) {
  return [row?.sku, row?.skuCode, row?.sku_code, row?.cylinderSku, row?.jobName, row?.job_name, row?.id]
    .map(cleanArtworkToken)
    .filter((token) => token && token.length >= 3);
}

function rowSku(row) {
  return String(row?.sku || row?.skuCode || row?.sku_code || row?.cylinderSku || '').trim().toUpperCase();
}

/**
 * A stored link is shown for the row that holds it.
 * It is rejected only when the filename clearly names another cylinder:
 * a different SKU-CYL code, or an embedded name that matches a different job
 * and does not match this row. A legacy file with no SKU stays visible.
 */
export function artworkClearlyForeign(url, row, siblings = []) {
  if (!url || !row) return false;
  const skus = skuTokensInUrl(url);
  const ownSku = rowSku(row);
  if (skus.length > 0) return !ownSku || skus.some((token) => token !== ownSku);

  const embedded = embeddedArtworkToken(url);
  if (!embedded || embedded.length < 8) return false;
  const matches = (candidate) => ownTokens(candidate).some((token) => {
    if (token.length < 8) return false;
    return token === embedded || token.startsWith(embedded) || embedded.startsWith(token);
  });
  if (matches(row)) return false;
  return (siblings || []).some((other) => {
    if (!other || other === row) return false;
    if (row.id != null && other.id != null && String(other.id) === String(row.id)) return false;
    if (sameJob(row, other)) return false;
    return matches(other);
  });
}

export function artworkOwnedByRow(url, row) {
  if (!url || !row) return false;
  return !artworkClearlyForeign(url, row, []);
}

function sameJob(left, right) {
  const sku = String(left?.sku || '').trim().toLowerCase();
  const otherSku = String(right?.sku || '').trim().toLowerCase();
  const name = String(left?.jobName || left?.job_name || '').trim().toLowerCase();
  const otherName = String(right?.jobName || right?.job_name || '').trim().toLowerCase();
  if (sku && otherSku) return sku === otherSku && (!name || !otherName || name === otherName);
  return Boolean(name) && name === otherName;
}

/**
 * URL to render for this row. An empty string is the no-artwork placeholder.
 * The row's own stored link is used. A file is dropped only when its name
 * clearly belongs to a different SKU or a different known job.
 */
export function displayArtworkUrl(row, siblings = []) {
  const urls = artworkUrlsOf(row);
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    if (!artworkClearlyForeign(url, row, siblings)) return url;
  }
  return '';
}

export function isExplicitCylinderJobLink(cylinder, jobMaster) {
  if (!cylinder || !jobMaster) return false;
  const linkedId = cylinder.jobMasterId || cylinder.job_master_id;
  if (linkedId && String(jobMaster.id) === String(linkedId)) return true;
  if (jobMaster.cylinderId && cylinder.id != null && String(jobMaster.cylinderId) === String(cylinder.id)) return true;
  return false;
}

/**
 * Artwork copied while syncing a cylinder and a job master.
 * Name or SKU coincidence is not a link: the target keeps its own file.
 * An explicit id link may take the source file, unless that file names a different SKU.
 */
export function artworkToApply({ source, target, explicit }) {
  const fromTarget = artworkUrlsOf(target)[0] || '';
  if (!explicit) return fromTarget;
  const fromSource = artworkUrlsOf(source)[0] || '';
  if (!fromSource) return fromTarget;
  const namedForSource = artworkOwnedByRow(fromSource, source);
  const namedForTarget = artworkOwnedByRow(fromSource, target);
  const unnamed = skuTokensInUrl(fromSource).length === 0 && !embeddedArtworkToken(fromSource);
  if (namedForSource || namedForTarget || unnamed) return fromSource;
  return fromTarget;
}

export function cylinderIdentityKey(row) {
  const sku = String(row?.sku || '').trim().toLowerCase();
  const name = String(row?.jobName || row?.job_name || '').trim().toLowerCase();
  if (sku && name) return `sku:${sku}::${name}`;
  if (sku) return `sku:${sku}`;
  if (row?.id != null && String(row.id) !== '') return `id:${row.id}`;
  return `name:${name}`;
}
