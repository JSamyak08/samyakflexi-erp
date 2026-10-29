import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { generateSyncQrSvg } from '../utils/qrCodeSvg.js';

export { generateSyncQrSvg };

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
