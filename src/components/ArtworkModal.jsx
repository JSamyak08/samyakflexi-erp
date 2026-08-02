import React, { useState, useEffect } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Download, 
  ExternalLink, 
  AlertCircle, 
  Image as ImageIcon,
  RefreshCw
} from 'lucide-react';
import { isCorruptedArtworkUrl } from '../utils/safeStorage';
import { openArtworkViewer } from '../services/supabaseStorageService';

export default function ArtworkModal({ isOpen, onClose, artworkUrl, title = 'Artwork Preview', onReupload }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setImageError(false);
    }
  }, [isOpen, artworkUrl]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 4));
      if (e.key === '-' || e.key === '_') setZoom(z => Math.max(z - 0.25, 0.5));
      if (e.key === '0') { setZoom(1); setPosition({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCorrupted = isCorruptedArtworkUrl(artworkUrl);
  const isPdf = typeof artworkUrl === 'string' && (artworkUrl.includes('application/pdf') || artworkUrl.endsWith('.pdf'));

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const handleReset = () => { setZoom(1); setRotation(0); setPosition({ x: 0, y: 0 }); };
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDownload = () => {
    if (!artworkUrl || isCorrupted) return;
    try {
      const a = document.createElement('a');
      a.href = artworkUrl;
      const cleanName = (title || 'artwork').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = isPdf ? `${cleanName}.pdf` : `${cleanName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      window.open(artworkUrl, '_blank');
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Navigation Bar */}
      <div 
        style={{
          background: 'rgba(30, 41, 59, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#0284c7', padding: '6px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#fff' }}>
            SAMYAK ARTWORK
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1rem', color: '#f8fafc' }}>{title}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {isPdf ? 'PDF Document' : 'Artwork / Proof Drawing'}
            </div>
          </div>
        </div>

        {/* Toolbar Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isPdf && !isCorrupted && !imageError && (
            <>
              <button 
                type="button" 
                onClick={handleZoomIn} 
                className="btn-secondary" 
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
                title="Zoom In (+)"
              >
                <ZoomIn size={15} />
              </button>
              <button 
                type="button" 
                onClick={handleZoomOut} 
                className="btn-secondary" 
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
                title="Zoom Out (-)"
              >
                <ZoomOut size={15} />
              </button>
              <button 
                type="button" 
                onClick={handleReset} 
                className="btn-secondary" 
                style={{ padding: '6px 10px', fontSize: '0.8rem', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
                title="Reset Zoom (0)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button 
                type="button" 
                onClick={handleRotate} 
                className="btn-secondary" 
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
                title="Rotate Clockwise"
              >
                <RotateCw size={15} />
              </button>
            </>
          )}

          {!isCorrupted && !imageError && artworkUrl && (
            <>
              <button 
                type="button" 
                onClick={handleDownload} 
                className="btn-primary" 
                style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
              >
                <Download size={15} /> Download
              </button>
              <button 
                type="button" 
                onClick={() => openArtworkViewer(artworkUrl, title)} 
                className="btn-secondary" 
                style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
                title="Open in new browser tab"
              >
                <ExternalLink size={15} /> Open Tab
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={onClose} 
            style={{ 
              background: '#ef4444', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              padding: '6px 10px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              marginLeft: '8px'
            }}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          position: 'relative',
          userSelect: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {isCorrupted || imageError || !artworkUrl ? (
          <div 
            style={{
              background: 'rgba(30, 41, 59, 0.95)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '36px',
              maxWidth: '520px',
              textAlign: 'center',
              color: '#f8fafc',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ width: '56px', height: '56px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertCircle size={32} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '8px' }}>Artwork File Needs Refresh</h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.5', marginBottom: '20px' }}>
              The artwork file reference in this session was cleared by local cache or was stored prior to the cloud storage configuration.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button 
                type="button" 
                onClick={onClose} 
                className="btn-secondary" 
                style={{ padding: '8px 16px', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
              >
                Close
              </button>
              {onReupload && (
                <button 
                  type="button" 
                  onClick={() => { onClose(); onReupload(); }} 
                  className="btn-primary" 
                  style={{ padding: '8px 16px' }}
                >
                  Upload Artwork File
                </button>
              )}
            </div>
          </div>
        ) : isPdf ? (
          <iframe 
            src={artworkUrl} 
            title={title} 
            style={{ 
              width: '85vw', 
              height: '80vh', 
              border: 'none', 
              borderRadius: '8px', 
              background: '#fff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }} 
          />
        ) : (
          <div
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '90vw',
              maxHeight: '82vh'
            }}
          >
            <img 
              src={artworkUrl} 
              alt={title} 
              onError={() => setImageError(true)}
              style={{
                maxWidth: '90vw',
                maxHeight: '82vh',
                objectFit: 'contain',
                borderRadius: '8px',
                background: '#ffffff',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                pointerEvents: zoom > 1 ? 'auto' : 'none'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
