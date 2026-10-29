import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * Synchronously generates an SVG string for immediate, flicker-free rendering
 * during instant thermal printing.
 */
function generateSyncQrSvg(text, margin = 1) {
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

/**
 * 2D Barcode (QR Code) Vector Generator Component
 * Complies with ISO/IEC 18004 standard for 100% recognition by 2D industrial & handheld scanners.
 */
export default function QRCode2D({ 
  value = '', 
  size = 110, 
  margin = 1,
  showLabel = true,
  className = '',
  style = {}
}) {
  const textValue = String(value || 'SAMYAK-0000').trim();
  const [svgMarkup, setSvgMarkup] = useState(() => generateSyncQrSvg(textValue, margin));

  useEffect(() => {
    setSvgMarkup(generateSyncQrSvg(textValue, margin));
  }, [textValue, margin]);

  return (
    <div 
      className={`qr-code-2d-container ${className}`}
      style={{ 
        display: 'inline-flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#ffffff',
        padding: '4px',
        borderRadius: '4px',
        ...style 
      }}
    >
      <div 
        className="qr-code-svg-wrapper"
        style={{ 
          width: size, 
          height: size, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0
        }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {showLabel && (
        <span 
          style={{ 
            fontFamily: "Consolas, Monaco, 'Courier New', monospace", 
            fontWeight: '800', 
            fontSize: '0.74rem', 
            letterSpacing: '0.05em',
            color: '#0f172a',
            marginTop: '2px',
            textAlign: 'center',
            wordBreak: 'break-all'
          }}
        >
          {textValue}
        </span>
      )}
    </div>
  );
}

/**
 * Synchronous / Promise-based DataURL Generator for PDF and canvas exports
 */
export async function generate2DBarcodeDataUrl(text, options = {}) {
  const str = String(text || 'SAMYAK-0000').trim();
  try {
    return await QRCode.toDataURL(str, {
      margin: options.margin ?? 1,
      width: options.width ?? 256,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.warn('Error generating 2D barcode data URL:', err);
    return '';
  }
}
