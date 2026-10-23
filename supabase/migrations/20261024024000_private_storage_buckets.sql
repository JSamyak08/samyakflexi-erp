-- Make erp-files and artwork private.
-- Signed-in staff with an active plant role may upload, replace, read, and delete.
-- Anonymous requests cannot. Idempotent.
-- Buckets stay private. The app stores the object path and mints a signed URL at read time.

-- ---------------------------------------------------------------------------
-- Storage. Private buckets. Signed URLs are minted for signed-in users.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow public uploads to erp-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from erp-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to erp-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from erp-files" ON storage.objects;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage.objects FROM anon;
REVOKE ALL ON storage.buckets FROM anon;

UPDATE storage.buckets
   SET public = false
 WHERE id IN ('erp-files', 'artwork');

DROP POLICY IF EXISTS erp_files_read ON storage.objects;
DROP POLICY IF EXISTS erp_files_insert ON storage.objects;
DROP POLICY IF EXISTS erp_files_update ON storage.objects;
DROP POLICY IF EXISTS erp_files_delete ON storage.objects;

CREATE POLICY erp_files_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );

CREATE POLICY erp_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );

CREATE POLICY erp_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  )
  WITH CHECK (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );

CREATE POLICY erp_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );
