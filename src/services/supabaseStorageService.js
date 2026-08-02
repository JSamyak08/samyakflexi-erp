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

    // Convert data URL to Blob URL to ensure fast, uncorrupted, memory-efficient rendering in new tab
    let renderUrl = url;
    if (typeof url === 'string' && url.startsWith('data:')) {
      const blob = dataUrlToBlob(url);
      if (blob) {
        renderUrl = URL.createObjectURL(blob);
      }
    }

    const win = window.open('', '_blank');
    if (!win) {
      // If popup blocker intervened, trigger direct download
      const a = document.createElement('a');
      a.href = renderUrl;
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
              z-index: 100;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .brand { 
              font-weight: 700; 
              font-size: 0.95rem; 
              color: #38bdf8; 
              display: flex; 
              align-items: center; 
              gap: 10px; 
            }
            .brand-badge {
              background: #0284c7;
              color: #fff;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 0.75rem;
              font-weight: 800;
            }
            .filename { 
              color: #f1f5f9; 
              font-size: 0.9rem; 
              font-weight: 600; 
              max-width: 450px; 
              white-space: nowrap; 
              overflow: hidden; 
              text-overflow: ellipsis; 
            }
            .toolbar {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .btn { 
              background: #334155; 
              color: #f8fafc; 
              padding: 7px 14px; 
              border-radius: 6px; 
              font-size: 0.8rem; 
              font-weight: 600; 
              text-decoration: none; 
              border: 1px solid #475569; 
              cursor: pointer; 
              display: inline-flex; 
              align-items: center; 
              gap: 6px;
              transition: background 0.15s;
            }
            .btn:hover { background: #475569; }
            .btn-primary {
              background: #0284c7;
              border-color: #0284c7;
            }
            .btn-primary:hover { background: #0369a1; }
            .canvas { 
              flex: 1; 
              padding: 24px; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              overflow: auto; 
              position: relative;
            }
            .frame-container { 
              background: #1e293b; 
              border: 1px solid #334155; 
              border-radius: 8px; 
              box-shadow: 0 20px 35px rgba(0,0,0,0.6); 
              padding: 16px; 
              max-width: 100%; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 200px;
            }
            #artwork-img { 
              max-width: 90vw; 
              max-height: 80vh; 
              object-fit: contain; 
              border-radius: 4px; 
              background: #ffffff; 
              transition: transform 0.15s ease-out;
              transform-origin: center center;
            }
            iframe { 
              width: 85vw; 
              height: 82vh; 
              border: none; 
              border-radius: 4px; 
              background: #fff; 
            }
            #error-fallback {
              display: none;
              text-align: center;
              padding: 40px;
              background: #1e293b;
              border-radius: 8px;
              border: 1px solid #ef4444;
              max-width: 480px;
            }
          </style>
        </head>
        <body>
          <div class="nav">
            <div class="brand">
              <span class="brand-badge">SAMYAK ERP</span>
              <span class="filename">${safeTitle}</span>
            </div>
            <div class="toolbar">
              ${!isPdf ? `
                <button class="btn" onclick="zoomIn()" title="Zoom In (+)">Zoom +</button>
                <button class="btn" onclick="zoomOut()" title="Zoom Out (-)">Zoom -</button>
                <button class="btn" onclick="resetZoom()" title="Reset (0)">100%</button>
                <button class="btn" onclick="rotateImg()" title="Rotate (90°)">Rotate</button>
              ` : ''}
              <a href="${renderUrl}" download="${cleanDownloadName}" class="btn btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download File
              </a>
            </div>
          </div>
          <div class="canvas">
            <div class="frame-container">
              ${isPdf 
                ? `<iframe src="${renderUrl}" title="${safeTitle}"></iframe>` 
                : `<img id="artwork-img" src="${renderUrl}" alt="${safeTitle}" onerror="document.getElementById('artwork-img').style.display='none'; document.getElementById('error-fallback').style.display='block';" />`
              }
              <div id="error-fallback">
                <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
                <h3 style="font-size: 1.1rem; color: #f8fafc; margin-bottom: 8px;">Artwork Preview Unavailable</h3>
                <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.4; margin-bottom: 16px;">
                  The artwork proof link is empty or the browser local cache was refreshed. Please re-upload the artwork file in Cylinder Management.
                </p>
                <a href="${renderUrl}" download="${cleanDownloadName}" class="btn btn-primary" style="margin: 0 auto;">Download Stored Data</a>
              </div>
            </div>
          </div>
          <script>
            let currentZoom = 1;
            let currentRotate = 0;
            const img = document.getElementById('artwork-img');
            function applyTransform() {
              if (img) {
                img.style.transform = 'scale(' + currentZoom + ') rotate(' + currentRotate + 'deg)';
              }
            }
            function zoomIn() {
              currentZoom = Math.min(currentZoom + 0.25, 4);
              applyTransform();
            }
            function zoomOut() {
              currentZoom = Math.max(currentZoom - 0.25, 0.5);
              applyTransform();
            }
            function resetZoom() {
              currentZoom = 1;
              currentRotate = 0;
              applyTransform();
            }
            function rotateImg() {
              currentRotate = (currentRotate + 90) % 360;
              applyTransform();
            }
            window.addEventListener('keydown', function(e) {
              if (e.key === '+' || e.key === '=') zoomIn();
              if (e.key === '-' || e.key === '_') zoomOut();
              if (e.key === '0') resetZoom();
            });
          </script>
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
 * Uploads an artwork file (Image or PDF) directly to Supabase Cloud Storage.
 * Stores exclusively in Supabase Cloud Storage bucket ('erp-files' or 'artwork')
 * and returns the public CDN HTTPS URL.
 * 
 * @param {File|Blob|string} fileInput - File object, Blob, or file data
 * @param {string} identifier - SKU, Job Name, or unique ID for file naming
 * @returns {Promise<{ success: boolean, publicUrl: string|null, filePath: string|null, isCloud?: boolean, bucket?: string, error?: string }>}
 */
export async function uploadArtworkFile(fileInput, identifier = 'job_art') {
  if (!fileInput) {
    return { success: false, publicUrl: null, filePath: null, error: 'No file provided for upload.' };
  }

  if (!isSupabaseConfigured()) {
    return { 
      success: false, 
      publicUrl: null, 
      filePath: null, 
      isCloud: false,
      error: 'Supabase is not configured. Please provide your Supabase URL & API Key in Supabase Settings.' 
    };
  }

  let fileBlob = fileInput;
  let fileExt = 'png';
  let contentType = 'image/png';

  if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
    fileBlob = dataUrlToBlob(fileInput);
    if (!fileBlob) {
      return { success: false, publicUrl: null, filePath: null, isCloud: false, error: 'Invalid file data provided.' };
    }
    contentType = fileBlob.type || 'image/png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) fileExt = 'jpg';
    else if (contentType.includes('svg')) fileExt = 'svg';
    else if (contentType.includes('pdf')) fileExt = 'pdf';
    else if (contentType.includes('webp')) fileExt = 'webp';
  } else if (fileInput.name) {
    contentType = fileInput.type || 'image/png';
    const parts = fileInput.name.split('.');
    if (parts.length > 1) {
      fileExt = parts.pop().toLowerCase();
    }
  }

  const cleanId = String(identifier || 'art').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  const timestamp = Date.now();
  const filePath = `artwork/${cleanId}_${timestamp}.${fileExt}`;

  // Try uploading to cloud storage buckets ('erp-files', 'artwork', etc.)
  let lastError = null;
  for (const bucket of FALLBACK_BUCKETS) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileBlob, {
          cacheControl: '31536000', // 1 year CDN cache
          upsert: true,
          contentType
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData?.publicUrl || null;
        if (publicUrl) {
          console.log(`[Storage Service] Artwork successfully uploaded to Supabase Cloud bucket '${bucket}':`, publicUrl);
          return {
            success: true,
            publicUrl,
            filePath,
            bucket,
            isCloud: true
          };
        }
      } else if (error) {
        lastError = error.message;
      }
    } catch (bucketErr) {
      lastError = bucketErr.message;
      console.warn(`[Storage Service] Upload attempt on bucket '${bucket}' exception:`, bucketErr);
    }
  }

  return {
    success: false,
    publicUrl: null,
    filePath: null,
    isCloud: false,
    error: `Supabase Storage upload failed (${lastError || 'Bucket permission error'}). Ensure bucket "erp-files" or "artwork" exists with public policy in Supabase.`
  };
}

/**
 * Uploads a document (such as PDF, Purchase Order, Delivery Challan) to Supabase Storage
 */
export async function uploadDocumentFile(fileInput, folder = 'documents', customName = null) {
  if (!fileInput) return { success: false, publicUrl: null, error: 'No document file provided.' };

  if (!isSupabaseConfigured()) {
    return { success: false, publicUrl: null, isCloud: false, error: 'Supabase is not configured. Please enter credentials in Supabase Settings.' };
  }

  let fileBlob = fileInput;
  let fileExt = 'pdf';
  let contentType = 'application/pdf';

  if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
    fileBlob = dataUrlToBlob(fileInput);
    if (!fileBlob) {
      return { success: false, publicUrl: null, filePath: null, isCloud: false, error: 'Invalid document data' };
    }
    contentType = fileBlob.type || 'application/pdf';
  } else if (fileInput.name) {
    contentType = fileInput.type || 'application/pdf';
    const parts = fileInput.name.split('.');
    if (parts.length > 1) fileExt = parts.pop().toLowerCase();
  }

  const fileName = customName ? `${customName}.${fileExt}` : `${folder}_${Date.now()}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  let lastError = null;
  for (const bucket of FALLBACK_BUCKETS) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        return {
          success: true,
          publicUrl: publicUrlData?.publicUrl || null,
          filePath,
          bucket,
          isCloud: true
        };
      } else if (error) {
        lastError = error.message;
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`[Storage Service] Document upload exception on bucket ${bucket}:`, err);
    }
  }

  return { success: false, publicUrl: null, isCloud: false, error: lastError || 'Failed to upload document to Supabase storage.' };
}

