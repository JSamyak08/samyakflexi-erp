-- In-app notices when a job master or cylinder job card is copied onto
-- active orders. The browser calls public.record_structure_change_notice.
-- Direct insert stays on the inventory / production module policy, which a
-- sales or plant user may not have, so the function writes the row.
-- Admin, sales, production, plant, store and purchase roles can read and
-- mark the notice, including when the role is one of several assigned roles.
-- private.has_role already treats Admin as allowed and reads every assigned
-- role. No email is sent. Existing order rows are not updated.

CREATE OR REPLACE FUNCTION public.record_structure_change_notice(
  p_id text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text;
  v_payload jsonb;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before recording a structure change' USING ERRCODE = '42501';
  END IF;

  v_allowed := coalesce(private.can_any(ARRAY['job_masters', 'cylinders', 'printing_scheduler']), false)
    OR coalesce(private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Sales Manager', 'Store Manager', 'Purchase Manager']), false);

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'This account cannot record a structure change notice' USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public.erp_notifications') IS NULL THEN
    RAISE EXCEPTION 'Structure change notices are not available' USING ERRCODE = '42P01';
  END IF;

  v_id := left(coalesce(nullif(btrim(p_id), ''), 'STRUCT-' || to_char(pg_catalog.now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSMS')), 200);
  v_payload := coalesce(p_payload, '{}'::jsonb);
  v_payload := pg_catalog.jsonb_set(v_payload, '{type}', '"STRUCTURE_CHANGED"'::jsonb, true);
  IF coalesce(v_payload->>'read', '') = '' THEN
    v_payload := pg_catalog.jsonb_set(v_payload, '{read}', 'false'::jsonb, true);
  END IF;

  INSERT INTO public.erp_notifications (id, payload, created_at, updated_at)
  VALUES (v_id, v_payload, pg_catalog.now(), pg_catalog.now())
  ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at = pg_catalog.now();

  BEGIN
    PERFORM public.record_audit_log(
      'UPDATE',
      'Job Masters',
      left(coalesce(v_payload->>'message', 'Job structure synced to active orders'), 4000),
      left(coalesce(v_payload->>'jobMasterId', v_id), 200)
    );
  EXCEPTION WHEN OTHERS THEN
    -- The notice is the record of the change. An audit failure must not drop it.
    NULL;
  END;

  RETURN v_payload || pg_catalog.jsonb_build_object('id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_structure_change_notice(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_structure_change_notice(text, jsonb) TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.erp_notifications') IS NULL
     OR to_regprocedure('private.has_role(text[])') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS erp_notifications_structure_changed ON public.erp_notifications';
  EXECUTE $policy$
    CREATE POLICY erp_notifications_structure_changed
      ON public.erp_notifications
      FOR ALL
      TO authenticated
      USING (
        coalesce(payload->>'type', '') = 'STRUCTURE_CHANGED'
        AND private.has_role(ARRAY[
          'Sales Manager',
          'Production Manager',
          'Plant Manager',
          'Store Manager',
          'Purchase Manager'
        ])
      )
      WITH CHECK (
        coalesce(payload->>'type', '') = 'STRUCTURE_CHANGED'
        AND private.has_role(ARRAY[
          'Sales Manager',
          'Production Manager',
          'Plant Manager',
          'Store Manager',
          'Purchase Manager'
        ])
      )
  $policy$;
END $$;
