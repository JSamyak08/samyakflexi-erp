-- Printing Operator still has sfg_store = true on the live matrix, so that
-- role can create, edit, and delete SFG / FG stock. Shop Floor Operator is
-- already the string "view". Both roles stay view-only on this store.
-- Inventory and Printing Scheduler are not rewritten.
--
-- private.can_edit_sfg_store no longer treats either operator role as a
-- store editor, even if the flag is later set back to true. Another
-- assigned role can still grant edit. Admin still can.
--
-- complete_print_run is unchanged. It stays security invoker. The printed
-- lot, the printed rolls, and the balance rolls are written by
-- security-definer helpers, which allow a caller who can use the printing
-- scheduler. Those writes run as the function owner, so the view-only
-- trigger does not reject them.
--
-- Safe to run more than once. A row that is already "view" is left alone,
-- including its updated_at. Missing tables or helpers are skipped.

DO $roles$
DECLARE
  has_updated boolean;
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'permissions'
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'updated_at'
  ) INTO has_updated;

  IF has_updated THEN
    UPDATE public.role_permissions AS rp
    SET permissions = jsonb_set(
          COALESCE(rp.permissions, '{}'::jsonb),
          '{sfg_store}',
          '"view"'::jsonb,
          true
        ),
        updated_at = now()
    WHERE rp.role IN ('Printing Operator', 'Shop Floor Operator')
      AND COALESCE(rp.permissions ->> 'sfg_store', '') IS DISTINCT FROM 'view';

    INSERT INTO public.role_permissions (role, permissions, updated_at)
    SELECT wanted.role_name,
           jsonb_build_object(
             'inventory', true,
             'printing_scheduler', true,
             'sfg_store', 'view'
           ),
           now()
    FROM (VALUES ('Printing Operator'), ('Shop Floor Operator')) AS wanted(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions AS existing WHERE existing.role = wanted.role_name
    );
  ELSE
    UPDATE public.role_permissions AS rp
    SET permissions = jsonb_set(
          COALESCE(rp.permissions, '{}'::jsonb),
          '{sfg_store}',
          '"view"'::jsonb,
          true
        )
    WHERE rp.role IN ('Printing Operator', 'Shop Floor Operator')
      AND COALESCE(rp.permissions ->> 'sfg_store', '') IS DISTINCT FROM 'view';

    INSERT INTO public.role_permissions (role, permissions)
    SELECT wanted.role_name,
           jsonb_build_object(
             'inventory', true,
             'printing_scheduler', true,
             'sfg_store', 'view'
           )
    FROM (VALUES ('Printing Operator'), ('Shop Floor Operator')) AS wanted(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions AS existing WHERE existing.role = wanted.role_name
    );
  END IF;
END
$roles$;

DO $access$
BEGIN
  IF to_regprocedure('private.app_roles()') IS NULL THEN
    RAISE NOTICE 'printing operator sfg view: skipped can_edit_sfg_store because private.app_roles is missing';
    RETURN;
  END IF;

  EXECUTE $edit$
CREATE OR REPLACE FUNCTION private.can_edit_sfg_store(modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(private.app_roles()) AS granted(role_name)
    WHERE granted.role_name = 'Admin'
       OR (
         granted.role_name NOT IN ('Printing Operator', 'Shop Floor Operator')
         AND EXISTS (
           SELECT 1
           FROM public.role_permissions AS rp
           WHERE rp.role = granted.role_name
             AND (
               rp.permissions -> 'sfg_store' = 'true'::jsonb
               OR (
                 coalesce(rp.permissions ->> 'sfg_store', '') IS DISTINCT FROM 'view'
                 AND EXISTS (
                   SELECT 1
                   FROM unnest(modules) AS requested(module_key)
                   WHERE rp.permissions -> requested.module_key = 'true'::jsonb
                 )
               )
             )
         )
       )
  );
$fn$
$edit$;

  REVOKE ALL ON FUNCTION private.can_edit_sfg_store(text[]) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.can_edit_sfg_store(text[]) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.can_edit_sfg_store(text[]) TO authenticated;
  END IF;
END
$access$;
