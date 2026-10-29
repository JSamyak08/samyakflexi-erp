import QRCode from 'qrcode';

/**
 * Synchronously generates an SVG string for immediate, flicker-free rendering
 * during instant thermal printing and UI display.
 */
export function generateSyncQrSvg(text, margin = 1) {
  try {
    const str = String(text || 'SAMYAK-0000').trim();
    const qr = QRCode.create(str, { errorCorrectionLevel: 'M' });
    const modCount = qr.modules.size;
    const total = modCount + margin * 2;
    const rects = [];
    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qr.modules.get(r, c)) {
          rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#000000"/>`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="100%" height="100%" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/>${rects.join('')}</svg>`;
  } catch (err) {
    console.warn('QR Code sync generation notice:', err);
    return '';
  }
}
