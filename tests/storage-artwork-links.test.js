import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

test('JobMasterDirectory, ProductionScheduler, ArtworkModal, and StorageService use signed URL viewer', () => {
  const jobMasterContent = fs.readFileSync('src/components/JobMasterDirectory.jsx', 'utf-8');
  const schedulerContent = fs.readFileSync('src/components/ProductionScheduler.jsx', 'utf-8');
  const modalContent = fs.readFileSync('src/components/ArtworkModal.jsx', 'utf-8');
  const storageContent = fs.readFileSync('src/services/supabaseStorageService.js', 'utf-8');

  // 1. JobMasterDirectory must import and call openArtworkViewer, never raw <a href=jobCardFileUrl>
  assert.ok(
    jobMasterContent.includes("import { openArtworkViewer } from '../services/supabaseStorageService';"),
    'JobMasterDirectory must import openArtworkViewer'
  );
  assert.ok(
    !jobMasterContent.includes('<a href={selectedJob.jobCardFileUrl}'),
    'JobMasterDirectory must not contain raw <a href={selectedJob.jobCardFileUrl}>'
  );
  assert.ok(
    jobMasterContent.includes('openArtworkViewer(selectedJob.jobCardFileUrl'),
    'JobMasterDirectory must call openArtworkViewer on View / Download click'
  );

  // 2. ProductionScheduler must import openArtworkViewer and not have raw <a href=activeRunningJob.artworkUrl>
  assert.ok(
    schedulerContent.includes("import { openArtworkViewer } from '../services/supabaseStorageService';"),
    'ProductionScheduler must import openArtworkViewer'
  );
  assert.ok(
    !schedulerContent.includes('<a \n                        href={activeRunningJob.artworkUrl}'),
    'ProductionScheduler must not have raw a href with activeRunningJob.artworkUrl'
  );
  assert.ok(
    schedulerContent.includes('openArtworkViewer(activeRunningJob.artworkUrl'),
    'ProductionScheduler must call openArtworkViewer on Save / View button'
  );

  // 3. ArtworkModal must use signed URL for download and openArtworkViewer
  assert.ok(
    modalContent.includes('const targetUrl = readableUrl || (await resolveReadableUrl(artworkUrl));'),
    'ArtworkModal must resolve signed URL before downloading'
  );
  assert.ok(
    modalContent.includes('openArtworkViewer(readableUrl || artworkUrl, title)'),
    'ArtworkModal must pass resolved URL to openArtworkViewer'
  );

  // 4. supabaseStorageService must have fallback buckets in resolveReadableUrl and open window synchronously
  assert.ok(
    storageContent.includes('FALLBACK_BUCKETS.includes(bucket)'),
    'supabaseStorageService must check FALLBACK_BUCKETS when resolving signed URLs'
  );
  assert.ok(
    storageContent.includes('const isUnresolvedPrivateUrl = typeof renderUrl === \'string\' && renderUrl.includes(\'/storage/v1/object/public/\');'),
    'supabaseStorageService must guard against unresolved private bucket URLs'
  );
});
