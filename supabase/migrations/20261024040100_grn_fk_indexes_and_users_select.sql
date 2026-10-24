-- Index cleanup and the users_select initplan.
--
-- grns_grn_number_key is the unique constraint on grn_number. grns_grn_number_uidx
-- is a second unique index on the same column and is not referenced by name
-- (no function, view, or ON CONFLICT target). Drop it only while the constraint
-- remains, so a database that has only the standalone index keeps its uniqueness.
--
-- Cover the unindexed foreign keys grns.vendor_id, inks.supplier_id, and
-- job_datasheets.job_id. IF NOT EXISTS keeps a second apply from failing.
--
-- users_select called auth.uid() once per row. (select auth.uid()) is evaluated
-- once per statement. The comparisons, the settings-row exclusion, and the
-- Admin branch are unchanged.

DO $$
BEGIN
  IF to_regclass('public.grns') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'grns_grn_number_key'
         AND conrelid = 'public.grns'::regclass
         AND contype = 'u'
     ) THEN
    DROP INDEX IF EXISTS public.grns_grn_number_uidx;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS grns_vendor_id_idx ON public.grns (vendor_id);
CREATE INDEX IF NOT EXISTS inks_supplier_id_idx ON public.inks (supplier_id);
CREATE INDEX IF NOT EXISTS job_datasheets_job_id_idx ON public.job_datasheets (job_id);

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    id NOT LIKE 'USR-SETTING-%'
    AND (
      auth_user_id = (select auth.uid())
      OR id = (select auth.uid())::text
      OR private.has_role(ARRAY['Admin'])
    )
  );
