-- Printing deadline lead time is an Admin setting.
-- Deadline notices are readable and writable by Admin and Sales Manager
-- even when that role cannot open Inventory. Other notices stay on the
-- existing module policy. Existing order rows are not updated.

DO $$
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL
     AND to_regprocedure('private.has_role(text[])') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS system_settings_printing_lead_insert ON public.system_settings';
    EXECUTE 'DROP POLICY IF EXISTS system_settings_printing_lead_update ON public.system_settings';
    EXECUTE $policy$
      CREATE POLICY system_settings_printing_lead_insert
        ON public.system_settings
        AS RESTRICTIVE
        FOR INSERT
        TO authenticated
        WITH CHECK (
          setting_key IS DISTINCT FROM 'printing_deadline_lead_days'
          OR private.has_role(ARRAY['Admin'])
        )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY system_settings_printing_lead_update
        ON public.system_settings
        AS RESTRICTIVE
        FOR UPDATE
        TO authenticated
        USING (
          setting_key IS DISTINCT FROM 'printing_deadline_lead_days'
          OR private.has_role(ARRAY['Admin'])
        )
        WITH CHECK (
          setting_key IS DISTINCT FROM 'printing_deadline_lead_days'
          OR private.has_role(ARRAY['Admin'])
        )
    $policy$;
  END IF;

  IF to_regclass('public.erp_notifications') IS NOT NULL
     AND to_regprocedure('private.has_role(text[])') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS erp_notifications_printing_deadline ON public.erp_notifications';
    EXECUTE $policy$
      CREATE POLICY erp_notifications_printing_deadline
        ON public.erp_notifications
        FOR ALL
        TO authenticated
        USING (
          coalesce(payload->>'type', '') IN ('PRINTING_DEADLINE_STAGE', 'PRINTING_DEADLINE_SUMMARY')
          AND private.has_role(ARRAY['Sales Manager'])
        )
        WITH CHECK (
          coalesce(payload->>'type', '') IN ('PRINTING_DEADLINE_STAGE', 'PRINTING_DEADLINE_SUMMARY')
          AND private.has_role(ARRAY['Sales Manager'])
        )
    $policy$;
  END IF;
END $$;
