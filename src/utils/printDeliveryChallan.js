/**
 * Print the delivery challan from the live sheet.
 * Safari and several mobile browsers print a blank page when an image in the
 * sheet is still loading or stuck on a private storage URL. Settle every image
 * (or swap in the bundled logo) before opening the print dialog.
 */

export const CHALLAN_LOGO_FALLBACK = '/samyak-logo.png';

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function imageHasPainted(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

function whenSettled(img, timeoutMs) {
  if (imageHasPainted(img)) return Promise.resolve('painted');
  if (img.complete && !img.naturalWidth) return Promise.resolve('error');
  return new Promise((resolve) => {
    let finished = false;
    const done = (reason) => {
      if (finished) return;
      finished = true;
      resolve(reason);
    };
    img.addEventListener('load', () => done('load'), { once: true });
    img.addEventListener('error', () => done('error'), { once: true });
    setTimeout(() => done('timeout'), timeoutMs);
  });
}

/**
 * Replace a logo that failed, hung, or points at a private object URL
 * the browser will not paint. A 1×1 gif is the last resort so print does
 * not wait on a request that never finishes.
 */
export async function settleChallanImages(root, { timeoutMs = 1800, fallbackSrc = CHALLAN_LOGO_FALLBACK } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const images = [...root.querySelectorAll('img')];
  await Promise.all(images.map(async (img) => {
    const first = await whenSettled(img, timeoutMs);
    if (first === 'painted' || imageHasPainted(img)) return;
    const failedSrc = img.currentSrc || img.src || '';
    if (!img.dataset.dcFallback && failedSrc && !failedSrc.endsWith(fallbackSrc)) {
      img.dataset.dcFallback = '1';
      img.src = fallbackSrc;
      const second = await whenSettled(img, 800);
      if (second === 'painted' || imageHasPainted(img)) return;
    }
    img.dataset.dcFallback = '1';
    if (!String(img.src || '').startsWith('data:')) img.src = PIXEL;
  }));
}

export async function printDeliveryChallan(root) {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return;
  const sheet = root || (typeof document !== 'undefined' ? document.getElementById('printable-dc') : null);
  try {
    await settleChallanImages(sheet);
  } catch (err) {
    console.warn('Delivery challan images did not settle before print:', err);
  }
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  window.print();
}
