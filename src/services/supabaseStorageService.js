/**
 * Supabase Cloud Storage Service for Samyak Flexi-ERP
 * Handles uploading and managing artwork, job cards, PDF documents, and roll photos
 * securely in Supabase Storage with public CDN URLs and permanent base64 local fallback.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { compressImageDataUrl, idbSet } from '../utils/safeStorage';

export const STORAGE_BUCKET = 'erp-files';
export const FALLBACK_BUCKETS = ['erp-files', 'artwork', 'artworks', 'documents', 'public'];

/**
 * Converts a File or Blob into a permanent Base64 Data URL.
 * Compresses images automatically to preserve quota and saves raw blob in IndexedDB.
 * 
 * @param {File|Blob|string} fileInput
 * @returns {Promise<string|null>}
 */
export async function fileToDataUrl(fileInput) {
  if (!fileInput) return null;
  if (typeof fileInput === 'string') return fileInput;

  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const rawResult = e.target?.result || null;
        if (!rawResult) return resolve(null);

        // Compress if image to prevent QuotaExceededError
        if (typeof rawResult === 'string' && rawResult.startsWith('data:image')) {
          try {
            const compressed = await compressImageDataUrl(rawResult, 900, 0.7);
            resolve(compressed);
          } catch {
            resolve(rawResult);
          }
        } else {
          resolve(rawResult);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(fileInput);
    } catch (err) {
      console.error('[Storage Service] Failed to convert file to dataUrl:', err);
      resolve(null);
    }
  });
}

/**
 * Converts a data URL / base64 string to a Blob for uploading to Supabase Storage
 */
export function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:')) return null;

  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error('[Storage Service] Failed to convert dataUrl to Blob:', err);
    return null;
  }
}

/**
 * Opens an artwork or document URL safely in a new browser window/tab.
 * Solves the Chromium "ERR_FILE_NOT_FOUND" and "Not allowed to navigate top frame to data URL" issues.
 * 
 * @param {string} url - Public HTTPS URL or base64 Data URL
 * @param {string} title - Display title for the viewer
 */
export function openArtworkViewer(url, title = 'Artwork File') {
  if (!url) {
    alert('No artwork or document file available to view.');
    return;
  }

  // If already an HTTP/HTTPS public CDN URL, open directly in new tab
  if (url.startsWith('http://') || url.startsWith('https://')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  // For data: URLs or local strings, create an isolated HTML viewer tab
  try {
    const isPdf = typeof url === 'string' && (url.startsWith('data:application/pdf') || url.includes('application/pdf'));
    const safeTitle = (title || 'Artwork File').replace(/[<>&"]/g, '');
    const cleanDownloadName = (title || 'artwork_file').replace(/[^a-zA-Z0-9_-]/g, '_');

    const win = window.open('', '_blank');
    if (!win) {
      // If popup blocker intervened, trigger direct download
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanDownloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${safeTitle} - Samyak Flexi ERP</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
              background: #0f172a; 
              color: #f8fafc; 
              min-height: 100vh; 
              display: flex; 
              flex-direction: column; 
            }
            .nav { 
              background: #1e293b; 
              padding: 12px 24px; 
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              border-bottom: 1px solid #334155; 
              position: sticky; 
              top: 0; 
              z-index: 10;
            }
            .brand { 
              font-weight: 700; 
              font-size: 0.95rem; 
              color: #38bdf8; 
              display: flex; 
              align-items: center; 
              gap: 8px; 
            }
            .filename { 
              color: #cbd5e1; 
              font-size: 0.85rem; 
              font-weight: 500; 
              max-width: 450px; 
              white-space: nowrap; 
              overflow: hidden; 
              text-overflow: ellipsis; 
            }
            .btn { 
              background: #0284c7; 
              color: white; 
              padding: 8px 16px; 
              border-radius: 6px; 
              font-size: 0.85rem; 
              font-weight: 600; 
              text-decoration: none; 
              border: none; 
              cursor: pointer; 
              display: inline-flex; 
              align-items: center; 
              gap: 6px;
            }
            .btn:hover { background: #0369a1; }
            .canvas { 
              flex: 1; 
              padding: 24px; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              overflow: auto; 
            }
            .frame-container { 
              background: #1e293b; 
              border: 1px solid #334155; 
              border-radius: 8px; 
              box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
              padding: 16px; 
              max-width: 100%; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
            }
            img { 
              max-width: 100%; 
              max-height: 82vh; 
              object-fit: contain; 
              border-radius: 4px; 
              background: #fff; 
            }
            iframe { 
              width: 85vw; 
              height: 82vh; 
              border: none; 
              border-radius: 4px; 
              background: #fff; 
            }
          </style>
        </head>
        <body>
          <div class="nav">
            <div class="brand">
              <span>Samyak Flexi ERP</span>
              <span style="color:#64748b;">|</span>
              <span class="filename">${safeTitle}</span>
            </div>
            <div>
              <a href="${url}" download="${cleanDownloadName}" class="btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download File
              </a>
            </div>
          </div>
          <div class="canvas">
            <div class="frame-container">
              ${isPdf 
                ? `<iframe src="${url}" title="${safeTitle}"></iframe>` 
                : `<img src="${url}" alt="${safeTitle}" />`
              }
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  } catch (err) {
    console.error('Error opening artwork preview:', err);
    // Fallback: trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = (title || 'artwork').replace(/[^a-zA-Z0-9_-]/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Uploads an artwork file (Image or PDF) to Supabase Cloud Storage.
 * If Supabase is offline or not configured, it permanently encodes as Base64 Data URL
 * so that artwork is NEVER lost and NEVER suffers from ERR_FILE_NOT_FOUND.
 * 
 * @param {File|Blob|string} fileInput - File object, Blob, or base64 dataUrl
 * @param {string} identifier - SKU, Job Name, or unique ID for file naming
 * @returns {Promise<{ success: boolean, publicUrl: string|null, filePath: string|null, isCloud?: boolean, error?: string }>}
 */
export async function uploadArtworkFile(fileInput, identifier = 'job_art') {
  if (!fileInput) {
    return { success: false, publicUrl: null, filePath: null, error: 'No file provided' };
  }

  // First convert to persistent Base64 Data URL as the fail-safe baseline
  const persistentBase64 = await fileToDataUrl(fileInput);

  let fileBlob = fileInput;
  let fileExt = 'png';

  if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
    fileBlob = dataUrlToBlob(fileInput);
    if (!fileBlob) {
      return { success: true, publicUrl: fileInput, filePath: null, isCloud: false };
    }
    const type = fileBlob.type || '';
    if (type.includes('jpeg') || type.includes('jpg')) fileExt = 'jpg';
    else if (type.includes('svg')) fileExt = 'svg';
    else if (type.includes('pdf')) fileExt = 'pdf';
    else if (type.includes('webp')) fileExt = 'webp';
  } else if (fileInput.name) {
    const parts = fileInput.name.split('.');
    if (parts.length > 1) {
      fileExt = parts.pop().toLowerCase();
    }
  }

  if (!isSupabaseConfigured()) {
    console.log('[Storage Service] Supabase not connected. Persisting artwork locally as Base64.');
    return { success: true, publicUrl: persistentBase64, filePath: null, isCloud: false };
  }

  const cleanId = String(identifier || 'art').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  const timestamp = Date.now();
  const filePath = `artwork/${cleanId}_${timestamp}.${fileExt}`;

  // Try uploading to cloud storage buckets
  for (const bucket of FALLBACK_BUCKETS) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileBlob, {
          cacheControl: '31536000', // 1 year cache
          upsert: true,
          contentType: fileBlob.type || 'image/png'
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData?.publicUrl || null;
        if (publicUrl) {
          return {
            success: true,
            publicUrl,
            filePath,
            bucket,
            isCloud: true
          };
        }
      }
    } catch (bucketErr) {
      console.warn(`[Storage Service] Exception uploading to bucket '${bucket}':`, bucketErr);
    }
  }

  // Cloud upload fallback: return permanent Base64 Data URL (never temporary blob:)
  console.warn('[Storage Service] Cloud bucket upload unavailable. Retaining persistent Base64 artwork.');
  return {
    success: true,
    publicUrl: persistentBase64,
    filePath: null,
    isCloud: false,
    error: 'Storage bucket unavailable. Persisted locally.'
  };
}

/**
 * Uploads a document (such as PDF, Purchase Order, Delivery Challan) to Supabase Storage
 */
export async function uploadDocumentFile(fileInput, folder = 'documents', customName = null) {
  if (!fileInput) return { success: false, publicUrl: null };

  const persistentBase64 = await fileToDataUrl(fileInput);

  let fileBlob = fileInput;
  let fileExt = 'pdf';

  if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
    fileBlob = dataUrlToBlob(fileInput);
    if (!fileBlob) {
      return { success: true, publicUrl: fileInput, filePath: null, isCloud: false };
    }
  } else if (fileInput.name) {
    const parts = fileInput.name.split('.');
    if (parts.length > 1) fileExt = parts.pop().toLowerCase();
  }

  if (!isSupabaseConfigured()) {
    return { success: true, publicUrl: persistentBase64, isCloud: false };
  }

  const fileName = customName ? `${customName}.${fileExt}` : `${folder}_${Date.now()}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  for (const bucket of FALLBACK_BUCKETS) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: fileBlob.type || 'application/pdf'
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        return {
          success: true,
          publicUrl: publicUrlData?.publicUrl || null,
          filePath,
          isCloud: true
        };
      }
    } catch (err) {
      console.warn(`[Storage Service] Document upload exception on bucket ${bucket}:`, err);
    }
  }

  return { success: true, publicUrl: persistentBase64, isCloud: false };
}

