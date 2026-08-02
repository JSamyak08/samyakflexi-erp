/**
 * Supabase Cloud Storage Service for Samyak Flexi-ERP
 * Handles uploading and managing artwork, job cards, PDF documents, and roll photos
 * securely in Supabase Storage with public CDN URLs.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

export const STORAGE_BUCKET = 'erp-files';
export const FALLBACK_BUCKET = 'artwork';

/**
 * Converts a data URL / base64 string to a Blob
 */
export function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:')) return null;

  try {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
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
 * Uploads an artwork file (Image or PDF) to Supabase Cloud Storage.
 * 
 * @param {File|Blob|string} fileInput - File object, Blob, or base64 dataUrl
 * @param {string} identifier - SKU, Job Name, or unique ID for file naming
 * @returns {Promise<{ success: boolean, publicUrl: string|null, filePath: string|null, error?: string }>}
 */
export async function uploadArtworkFile(fileInput, identifier = 'job_art') {
  if (!fileInput) {
    return { success: false, publicUrl: null, filePath: null, error: 'No file provided' };
  }

  let fileBlob = fileInput;
  let fileExt = 'png';

  if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
    fileBlob = dataUrlToBlob(fileInput);
    if (!fileBlob) {
      return { success: false, publicUrl: fileInput, filePath: null };
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
    console.warn('[Storage Service] Supabase is not configured. Using local preview.');
    const localUrl = fileInput instanceof Blob ? URL.createObjectURL(fileInput) : fileInput;
    return { success: true, publicUrl: localUrl, filePath: null };
  }

  const cleanId = String(identifier || 'art').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  const timestamp = Date.now();
  const filePath = `artwork/${cleanId}_${timestamp}.${fileExt}`;

  // Try primary bucket first, then fallback
  const bucketsToTry = [STORAGE_BUCKET, FALLBACK_BUCKET];

  for (const bucket of bucketsToTry) {
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
        return {
          success: true,
          publicUrl,
          filePath,
          bucket
        };
      }

      // If bucket does not exist or upload error, log and try next bucket
      console.warn(`[Storage Service] Upload to bucket '${bucket}' error:`, error?.message);
    } catch (bucketErr) {
      console.warn(`[Storage Service] Exception uploading to bucket '${bucket}':`, bucketErr);
    }
  }

  // If storage upload fails (e.g. storage bucket not yet initialized), fallback gracefully
  console.warn('[Storage Service] Cloud storage upload failed across buckets. Falling back to object URL.');
  const fallbackUrl = fileInput instanceof Blob ? URL.createObjectURL(fileBlob) : (typeof fileInput === 'string' ? fileInput : null);
  return {
    success: false,
    publicUrl: fallbackUrl,
    filePath,
    error: 'Storage bucket unavailable. Using local preview.'
  };
}

/**
 * Uploads a document (such as PDF, Purchase Order, Delivery Challan) to Supabase Storage
 */
export async function uploadDocumentFile(fileInput, folder = 'documents', customName = null) {
  if (!fileInput) return { success: false, publicUrl: null };

  let fileBlob = fileInput;
  let fileExt = 'pdf';

  if (fileInput.name) {
    const parts = fileInput.name.split('.');
    if (parts.length > 1) fileExt = parts.pop().toLowerCase();
  }

  if (!isSupabaseConfigured()) {
    const localUrl = fileInput instanceof Blob ? URL.createObjectURL(fileInput) : fileInput;
    return { success: true, publicUrl: localUrl };
  }

  const fileName = customName ? `${customName}.${fileExt}` : `${folder}_${Date.now()}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, fileBlob, {
        cacheControl: '3600',
        upsert: true,
        contentType: fileBlob.type || 'application/pdf'
      });

    if (error) {
      console.warn('[Storage Service] Upload document notice:', error.message);
      return { success: false, error: error.message };
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: publicUrlData?.publicUrl || null,
      filePath
    };
  } catch (err) {
    console.error('[Storage Service] Error uploading document:', err);
    return { success: false, error: err.message };
  }
}
