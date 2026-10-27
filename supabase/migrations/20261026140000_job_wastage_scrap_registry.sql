-- High scrap registry: a job is listed only when the sum of its stage wastage
-- (kg) is at least 5% of orders.order_qty_kg (kg). The previous view flagged
-- production_records.wastage_percentage, which is scrap as a percent of output.
-- Jobs under 5% are absent. Re-reading the view after an edit is the recalculation.
-- This migration does not update production rows.

CREATE TABLE IF NOT EXISTS public.high_scrap_registry (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.high_scrap_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.high_scrap_registry FROM anon, PUBLIC';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.high_scrap_registry TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS high_scrap_registry_access ON public.high_scrap_registry';
    EXECUTE 'DROP POLICY IF EXISTS "Allow anon and auth full access" ON public.high_scrap_registry';
    EXECUTE $policy$
      CREATE POLICY high_scrap_registry_access
      ON public.high_scrap_registry
      FOR ALL
      TO authenticated
      USING (private.can_any(ARRAY['scrap_analytics','sfg_store','production_records']))
      WITH CHECK (private.can_any(ARRAY['scrap_analytics','sfg_store','production_records']))
    $policy$;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.high_scrap_registry TO anon, authenticated';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'high_scrap_registry'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "Allow anon and auth full access"
        ON public.high_scrap_registry
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $policy$;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.job_wastage_json_kg(logs jsonb, key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN logs IS NULL OR jsonb_typeof(logs) <> 'object' THEN 0
    WHEN COALESCE(logs->>key, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (logs->>key)::numeric
    ELSE 0
  END
$$;

-- Prefer the numeric column. Use process_logs only when that column is still 0,
-- which is how lamination pass 2, pouching, slitting setting, and film trimming
-- were stored before they had a dedicated write.
CREATE OR REPLACE FUNCTION public.job_wastage_stage_kg(column_kg numeric, logs jsonb, key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(column_kg, 0) <> 0 THEN column_kg
    ELSE public.job_wastage_json_kg(logs, key)
  END
$$;

DROP VIEW IF EXISTS public.high_scrap_audit_registry;
CREATE VIEW public.high_scrap_audit_registry
WITH (security_invoker = true) AS
WITH stage_rows AS (
  SELECT
    pr.id AS record_id,
    pr.order_id,
    pr.job_name,
    pr.client_name,
    pr.operator_name,
    pr.shift,
    COALESCE(pr.date_filled, pr.recorded_at::date) AS record_date,
    pr.recorded_at,
    pr.status,
    public.job_wastage_stage_kg(pr.printing_plain_setting_wastage_kg, pr.process_logs, 'printingPlainSettingWastageKg') AS printing_plain_setting_wastage_kg,
    public.job_wastage_stage_kg(pr.printing_wastage_kg, pr.process_logs, 'printingWastageKg') AS printing_wastage_kg,
    public.job_wastage_json_kg(pr.process_logs, 'excessFilmWastageKg') AS excess_film_wastage_kg,
    public.job_wastage_stage_kg(pr.lamination_plain_substrate_wastage_kg, pr.process_logs, 'laminationPlainSubstrateWastageKg') AS lamination_plain_substrate_wastage_kg,
    public.job_wastage_stage_kg(pr.lamination_plain_substrate_wastage_l2_kg, pr.process_logs, 'laminationPlainSubstrateWastageL2Kg') AS lamination_plain_substrate_wastage_l2_kg,
    public.job_wastage_stage_kg(pr.laminate_wastage_kg, pr.process_logs, 'laminateWastageKg') AS laminate_wastage_kg,
    public.job_wastage_stage_kg(pr.printed_wastage_kg, pr.process_logs, 'printedWastageKg') AS printed_wastage_kg,
    public.job_wastage_stage_kg(pr.trim_wastage_kg, pr.process_logs, 'trimWastageKg') AS trim_wastage_kg,
    public.job_wastage_json_kg(pr.process_logs, 'slittingSettingWastageKg') AS slitting_setting_wastage_kg,
    public.job_wastage_stage_kg(pr.pouching_scrap_kg, pr.process_logs, 'pouchingScrapKg') AS pouching_scrap_kg
  FROM public.production_records pr
),
per_order AS (
  SELECT
    order_id,
    (array_agg(record_id ORDER BY recorded_at DESC NULLS LAST))[1] AS record_id,
    (array_agg(job_name ORDER BY recorded_at DESC NULLS LAST))[1] AS job_name,
    (array_agg(client_name ORDER BY recorded_at DESC NULLS LAST))[1] AS client_name,
    (array_agg(operator_name ORDER BY recorded_at DESC NULLS LAST))[1] AS operator_name,
    (array_agg(shift ORDER BY recorded_at DESC NULLS LAST))[1] AS shift,
    (array_agg(record_date ORDER BY recorded_at DESC NULLS LAST))[1] AS record_date,
    (array_agg(status ORDER BY recorded_at DESC NULLS LAST))[1] AS status,
    SUM(printing_plain_setting_wastage_kg) AS printing_plain_setting_wastage_kg,
    SUM(printing_wastage_kg) AS printing_wastage_kg,
    SUM(excess_film_wastage_kg) AS excess_film_wastage_kg,
    SUM(lamination_plain_substrate_wastage_kg) AS lamination_plain_substrate_wastage_kg,
    SUM(lamination_plain_substrate_wastage_l2_kg) AS lamination_plain_substrate_wastage_l2_kg,
    SUM(laminate_wastage_kg) AS laminate_wastage_kg,
    SUM(printed_wastage_kg) AS printed_wastage_kg,
    SUM(trim_wastage_kg) AS trim_wastage_kg,
    SUM(slitting_setting_wastage_kg) AS slitting_setting_wastage_kg,
    SUM(pouching_scrap_kg) AS pouching_scrap_kg
  FROM stage_rows
  WHERE order_id IS NOT NULL AND btrim(order_id) <> ''
  GROUP BY order_id
)
SELECT
  'high-scrap:' || p.order_id AS id,
  p.record_id,
  p.order_id,
  p.job_name,
  p.client_name,
  p.operator_name,
  p.shift,
  p.record_date,
  p.status,
  o.order_qty_kg,
  'kg'::text AS order_qty_unit,
  p.printing_plain_setting_wastage_kg,
  p.printing_wastage_kg,
  p.excess_film_wastage_kg,
  p.lamination_plain_substrate_wastage_kg,
  p.lamination_plain_substrate_wastage_l2_kg,
  p.laminate_wastage_kg,
  p.printed_wastage_kg,
  p.trim_wastage_kg,
  p.slitting_setting_wastage_kg,
  p.pouching_scrap_kg,
  (
    p.printing_plain_setting_wastage_kg
    + p.printing_wastage_kg
    + p.excess_film_wastage_kg
    + p.lamination_plain_substrate_wastage_kg
    + p.lamination_plain_substrate_wastage_l2_kg
    + p.laminate_wastage_kg
    + p.printed_wastage_kg
    + p.trim_wastage_kg
    + p.slitting_setting_wastage_kg
    + p.pouching_scrap_kg
  ) AS total_wastage_kg,
  round((
    (
      p.printing_plain_setting_wastage_kg
      + p.printing_wastage_kg
      + p.excess_film_wastage_kg
      + p.lamination_plain_substrate_wastage_kg
      + p.lamination_plain_substrate_wastage_l2_kg
      + p.laminate_wastage_kg
      + p.printed_wastage_kg
      + p.trim_wastage_kg
      + p.slitting_setting_wastage_kg
      + p.pouching_scrap_kg
    ) / o.order_qty_kg
  ) * 100, 2) AS wastage_percentage,
  true AS is_high_scrap_alert
FROM per_order p
JOIN public.orders o ON o.id = p.order_id
WHERE o.order_qty_kg > 0
  AND (
    (
      p.printing_plain_setting_wastage_kg
      + p.printing_wastage_kg
      + p.excess_film_wastage_kg
      + p.lamination_plain_substrate_wastage_kg
      + p.lamination_plain_substrate_wastage_l2_kg
      + p.laminate_wastage_kg
      + p.printed_wastage_kg
      + p.trim_wastage_kg
      + p.slitting_setting_wastage_kg
      + p.pouching_scrap_kg
    ) / o.order_qty_kg
  ) * 100 >= 5;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.job_wastage_json_kg(jsonb, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.job_wastage_stage_kg(numeric, jsonb, text) FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.job_wastage_json_kg(jsonb, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.job_wastage_stage_kg(numeric, jsonb, text) FROM anon';
    EXECUTE 'REVOKE ALL ON public.high_scrap_audit_registry FROM anon';
  END IF;
  EXECUTE 'REVOKE ALL ON public.high_scrap_audit_registry FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.job_wastage_json_kg(jsonb, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.job_wastage_stage_kg(numeric, jsonb, text) TO authenticated';
    EXECUTE 'GRANT SELECT ON public.high_scrap_audit_registry TO authenticated';
  END IF;
END $$;
