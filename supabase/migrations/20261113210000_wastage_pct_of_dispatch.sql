-- High-scrap wastage % is total stage wastage (kg) divided by dispatched kg,
-- not orders.order_qty_kg.
--
-- Dispatched kg is the same quantity the order-close rule already uses:
-- finalised dispatch packing lists (each roll's weighed net kg) and delivery
-- challans. An open packing list is not dispatched. A cancelled document is
-- ignored. When a challan and a packing list both match the order, the larger
-- of the two totals is kept so the same goods are not added twice.
--
-- A job with no dispatched kg has no percentage. It is left out of this view
-- and out of high_scrap_registry. The screen shows those jobs as
-- "Not dispatched".
--
-- Timestamp is after 20261112140000_clients_email.sql.
-- Safe to run more than once. Scrap-store rows are not rewritten.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.dispatch_item_kg(item jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN item IS NULL OR jsonb_typeof(item) IS DISTINCT FROM 'object' THEN 0::numeric
    WHEN lower(btrim(coalesce(item->>'unit', 'Kg'))) IN ('kg', 'kgs', 'kilogram', 'kilograms', '')
         AND btrim(coalesce(item->>'quantity', item->>'qtyKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN btrim(coalesce(item->>'quantity', item->>'qtyKg'))::numeric
    WHEN btrim(coalesce(item->>'netWeightKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN btrim(item->>'netWeightKg')::numeric
    ELSE 0::numeric
  END
$$;

CREATE OR REPLACE FUNCTION private.dispatch_document_counts(doc jsonb, column_packing_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN doc IS NULL OR jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN false
    WHEN lower(btrim(coalesce(doc->>'status', ''))) IN ('cancelled', 'canceled') THEN false
    WHEN lower(btrim(coalesce(doc->>'cancelled', ''))) IN ('true', 't') THEN false
    WHEN lower(btrim(coalesce(doc->>'isCancelled', ''))) IN ('true', 't') THEN false
    WHEN coalesce(
      nullif(btrim(doc->>'packingStatus'), ''),
      nullif(btrim(column_packing_status), ''),
      nullif(btrim(doc->>'packing_status'), '')
    ) = 'Open' THEN false
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION private.dispatch_document_kg(
  doc jsonb,
  column_net_kg numeric,
  column_packing_status text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  items jsonb;
  from_items numeric := 0;
BEGIN
  IF NOT private.dispatch_document_counts(doc, column_packing_status) THEN
    RETURN 0;
  END IF;
  items := doc->'items';
  IF jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0 THEN
    SELECT COALESCE(sum(private.dispatch_item_kg(value)), 0)
      INTO from_items
    FROM jsonb_array_elements(items) AS listed(value);
    IF from_items > 0 THEN
      RETURN from_items;
    END IF;
  END IF;
  IF btrim(coalesce(doc->>'totalNetWeightKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RETURN btrim(doc->>'totalNetWeightKg')::numeric;
  END IF;
  RETURN COALESCE(column_net_kg, 0);
END;
$$;

CREATE OR REPLACE FUNCTION private.dispatch_document_matches(
  doc jsonb,
  column_order_id text,
  column_job_name text,
  order_key text,
  job_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    (
      coalesce(order_key, '') <> ''
      AND lower(btrim(coalesce(nullif(btrim(doc->>'orderId'), ''), column_order_id, ''))) = order_key
    )
    OR
    (
      coalesce(job_key, '') <> ''
      AND lower(btrim(split_part(
        coalesce(nullif(btrim(doc->>'jobName'), ''), column_job_name, ''),
        ' ||| ',
        1
      ))) = job_key
    )
$$;

-- Kilograms actually dispatched for one order. Zero when nothing has been dispatched.
CREATE OR REPLACE FUNCTION private.order_dispatched_kg(p_order_id text, p_job_name text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_key text := lower(btrim(coalesce(p_order_id, '')));
  job_key text := lower(btrim(split_part(coalesce(p_job_name, ''), ' ||| ', 1)));
  challan_kg numeric := 0;
  shipment_kg numeric := 0;
  result numeric := 0;
BEGIN
  IF to_regclass('public.delivery_challans') IS NOT NULL THEN
    SELECT COALESCE(sum(private.dispatch_document_kg(c.payload, NULL, NULL)), 0)
      INTO challan_kg
    FROM public.delivery_challans AS c
    WHERE private.dispatch_document_matches(c.payload, NULL, NULL, order_key, job_key);
  END IF;

  IF to_regclass('public.dispatch_shipments') IS NOT NULL THEN
    SELECT COALESCE(sum(weighed.kg), 0)
      INTO shipment_kg
    FROM (
      SELECT
        private.dispatch_document_kg(
          CASE
            WHEN s.payload IS NOT NULL
                 AND jsonb_typeof(s.payload) = 'object'
                 AND s.payload <> '{}'::jsonb
              THEN s.payload
            ELSE jsonb_build_object(
              'orderId', s.order_id,
              'jobName', s.job_name,
              'items', COALESCE(s.items, '[]'::jsonb),
              'totalNetWeightKg', s.total_net_weight_kg,
              'packingStatus', s.packing_status
            )
          END,
          s.total_net_weight_kg,
          s.packing_status
        ) AS kg,
        CASE
          WHEN s.payload IS NOT NULL
               AND jsonb_typeof(s.payload) = 'object'
               AND s.payload <> '{}'::jsonb
            THEN s.payload
          ELSE jsonb_build_object(
            'orderId', s.order_id,
            'jobName', s.job_name,
            'packingStatus', s.packing_status
          )
        END AS doc,
        s.order_id,
        s.job_name
      FROM public.dispatch_shipments AS s
    ) AS weighed
    WHERE private.dispatch_document_matches(weighed.doc, weighed.order_id, weighed.job_name, order_key, job_key);
  END IF;

  IF challan_kg > 0 AND shipment_kg > 0 THEN
    result := round(greatest(challan_kg, shipment_kg), 2);
  ELSE
    result := round(coalesce(challan_kg, 0) + coalesce(shipment_kg, 0), 2);
  END IF;
  IF result IS NULL OR result <= 0 THEN
    RETURN 0;
  END IF;
  RETURN result;
END;
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
),
rated AS (
  SELECT
    p.*,
    o.order_qty_kg,
    o.job_name AS order_job_name,
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
    private.order_dispatched_kg(p.order_id, coalesce(o.job_name, p.job_name)) AS dispatch_qty_kg
  FROM per_order p
  JOIN public.orders o ON o.id = p.order_id
)
SELECT
  'high-scrap:' || r.order_id AS id,
  r.record_id,
  r.order_id,
  r.job_name,
  r.client_name,
  r.operator_name,
  r.shift,
  r.record_date,
  r.status,
  r.order_qty_kg,
  'kg'::text AS order_qty_unit,
  r.printing_plain_setting_wastage_kg,
  r.printing_wastage_kg,
  r.excess_film_wastage_kg,
  r.lamination_plain_substrate_wastage_kg,
  r.lamination_plain_substrate_wastage_l2_kg,
  r.laminate_wastage_kg,
  r.printed_wastage_kg,
  r.trim_wastage_kg,
  r.slitting_setting_wastage_kg,
  r.pouching_scrap_kg,
  r.total_wastage_kg,
  round((r.total_wastage_kg / r.dispatch_qty_kg) * 100, 2) AS wastage_percentage,
  true AS is_high_scrap_alert,
  r.dispatch_qty_kg
FROM rated r
WHERE r.dispatch_qty_kg > 0
  AND (r.total_wastage_kg / r.dispatch_qty_kg) * 100 >= 5;

COMMENT ON VIEW public.high_scrap_audit_registry IS
  'Jobs whose total stage wastage is at least 5% of dispatched kg. Jobs with no dispatch are absent.';

-- Printing completion writes the same percentage. Order quantity stays on the
-- payload as the order size. It is not the denominator.
CREATE OR REPLACE FUNCTION private.print_run_wastage_plan(p_order_id text, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row record;
  job_name text := '';
  client_name text := '';
  job_code text := '';
  order_qty numeric := 0;
  dispatch_qty numeric := 0;
  plain numeric;
  printed numeric;
  trim_kg numeric;
  total numeric := 0;
  upserts jsonb := '[]'::jsonb;
  deletes jsonb := '[]'::jsonb;
  stages jsonb := '[]'::jsonb;
  raw_pct numeric;
  pct numeric;
  flagged boolean := false;
BEGIN
  p_patch := COALESCE(p_patch, '{}'::jsonb);
  IF to_regclass('public.orders') IS NOT NULL THEN
    SELECT o.job_name, o.client_name, o.order_qty_kg, o.job_details
      INTO order_row
    FROM public.orders AS o
    WHERE o.id = p_order_id;
    IF FOUND THEN
      job_name := split_part(coalesce(order_row.job_name, ''), ' ||| ', 1);
      client_name := coalesce(order_row.client_name, '');
      order_qty := COALESCE(order_row.order_qty_kg, 0);
      job_code := coalesce(order_row.job_details ->> 'jobCode', '');
    END IF;
  END IF;
  job_name := coalesce(NULLIF(btrim(p_patch ->> 'jobName'), ''), NULLIF(job_name, ''), '');
  client_name := coalesce(NULLIF(btrim(p_patch ->> 'clientName'), ''), client_name, '');
  job_code := coalesce(NULLIF(btrim(p_patch ->> 'jobCode'), ''), NULLIF(job_code, ''), p_order_id);
  IF private.print_patch_number(p_patch, 'orderQtyKg') IS NOT NULL THEN
    order_qty := private.print_patch_number(p_patch, 'orderQtyKg');
  END IF;
  dispatch_qty := COALESCE(private.order_dispatched_kg(p_order_id, job_name), 0);

  plain := COALESCE(private.print_patch_number(p_patch, 'printingPlainSettingWastageKg'), 0);
  printed := COALESCE(private.print_patch_number(p_patch, 'printingWastageKg'), 0);
  trim_kg := COALESCE(private.print_patch_number(p_patch, 'excessFilmWastageKg'), 0);

  IF plain < 0 OR printed < 0 OR trim_kg < 0 THEN
    RAISE EXCEPTION 'Printing scrap kilograms cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  WITH kinds AS (
    SELECT * FROM (VALUES
      ('plain-setting', 'Plain Setting', plain),
      ('printing-wastage', 'Printing Wastage', printed),
      ('film-trimming', 'Film Trimming Wastage', trim_kg)
    ) AS entry(kind, label, qty)
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', 'print-scrap:' || p_order_id || ':' || kind,
      'orderId', p_order_id,
      'jobNo', job_code,
      'jobCode', job_code,
      'jobName', job_name,
      'clientName', client_name,
      'scrapQtyKg', qty,
      'defectCategory', label,
      'type', label,
      'stage', 'Printing',
      'source', 'printing',
      'scrapReason', label || ' recorded at printing for ' || job_code,
      'scrappedBy', coalesce(NULLIF(btrim(p_patch ->> 'operatorName'), ''), 'Operator'),
      'date', to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
    )) FILTER (WHERE qty > 0), '[]'::jsonb),
    COALESCE(jsonb_agg(to_jsonb('print-scrap:' || p_order_id || ':' || kind)) FILTER (WHERE qty <= 0), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object(
      'stage', 'Printing',
      'type', label,
      'scrapQtyKg', qty
    )) FILTER (WHERE qty > 0), '[]'::jsonb),
    COALESCE(sum(qty), 0)
  INTO upserts, deletes, stages, total
  FROM kinds;

  raw_pct := CASE WHEN dispatch_qty > 0 THEN (total / dispatch_qty) * 100 ELSE NULL END;
  pct := CASE WHEN raw_pct IS NULL THEN NULL ELSE round(raw_pct, 2) END;
  flagged := raw_pct IS NOT NULL AND raw_pct >= 5;

  RETURN jsonb_build_object(
    'scrap', jsonb_build_object('upserts', upserts, 'deleteIds', deletes),
    'registry', CASE
      WHEN flagged THEN jsonb_build_object('upsert', jsonb_build_object(
        'id', 'high-scrap:' || p_order_id,
        'orderId', p_order_id,
        'jobNo', job_code,
        'jobName', job_name,
        'clientName', client_name,
        'orderQtyKg', order_qty,
        'orderQtyUnit', 'kg',
        'dispatchQtyKg', dispatch_qty,
        'dispatchQtyUnit', 'kg',
        'totalWastageKg', total,
        'wastagePct', pct,
        'thresholdPct', 5,
        'stages', stages,
        'source', 'high-scrap-registry',
        'operatorName', coalesce(p_patch ->> 'operatorName', '')
      ))
      ELSE jsonb_build_object('deleteId', 'high-scrap:' || p_order_id)
    END
  );
END;
$$;

-- Rewrite stored registry rows so a job flagged on order quantity is removed
-- when it is under 5% of dispatch, or not dispatched yet.
CREATE OR REPLACE FUNCTION private.refresh_high_scrap_registry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.high_scrap_registry') IS NULL
     OR to_regclass('public.high_scrap_audit_registry') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.high_scrap_registry AS existing
  WHERE existing.id ~ '^high-scrap:.+'
    AND coalesce(existing.payload ->> 'source', '') IN ('', 'high-scrap-registry', 'printing')
    AND NOT EXISTS (
      SELECT 1
      FROM public.high_scrap_audit_registry AS fresh
      WHERE fresh.id = existing.id
    );

  INSERT INTO public.high_scrap_registry (id, payload, updated_at)
  SELECT
    fresh.id,
    jsonb_build_object(
      'id', fresh.id,
      'orderId', fresh.order_id,
      'jobNo', fresh.order_id,
      'jobName', coalesce(fresh.job_name, ''),
      'clientName', coalesce(fresh.client_name, ''),
      'productionRecordId', coalesce(fresh.record_id, ''),
      'orderQtyKg', fresh.order_qty_kg,
      'orderQtyUnit', 'kg',
      'dispatchQtyKg', fresh.dispatch_qty_kg,
      'dispatchQtyUnit', 'kg',
      'totalWastageKg', fresh.total_wastage_kg,
      'wastagePct', fresh.wastage_percentage,
      'thresholdPct', 5,
      'stages', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'stage', line.stage,
          'type', line.kind,
          'scrapQtyKg', line.qty
        ) ORDER BY line.sort_order)
        FROM (VALUES
          (1, 'Printing', 'Plain Setting', fresh.printing_plain_setting_wastage_kg),
          (2, 'Printing', 'Printing Wastage', fresh.printing_wastage_kg),
          (3, 'Printing', 'Film Trimming Wastage', fresh.excess_film_wastage_kg),
          (4, 'Lamination', 'Lamination Plain Substrate', fresh.lamination_plain_substrate_wastage_kg),
          (5, 'Lamination', 'Lamination Plain Substrate (L2)', fresh.lamination_plain_substrate_wastage_l2_kg),
          (6, 'Lamination', 'Laminate Wastage', fresh.laminate_wastage_kg),
          (7, 'Inspection', 'Printed Defect Wastage', fresh.printed_wastage_kg),
          (8, 'Slitting', 'Trim Wastage', fresh.trim_wastage_kg),
          (9, 'Slitting', 'Slitting Setting Wastage', fresh.slitting_setting_wastage_kg),
          (10, 'Pouching', 'Pouching Scrap', fresh.pouching_scrap_kg)
        ) AS line(sort_order, stage, kind, qty)
        WHERE line.qty > 0
      ), '[]'::jsonb),
      'source', 'high-scrap-registry',
      'operatorName', coalesce(fresh.operator_name, ''),
      'shift', coalesce(fresh.shift, ''),
      'date', CASE
        WHEN fresh.record_date IS NULL THEN ''
        ELSE to_char(fresh.record_date, 'YYYY-MM-DD')
      END
    ),
    pg_catalog.now()
  FROM public.high_scrap_audit_registry AS fresh
  ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload,
      updated_at = EXCLUDED.updated_at;
END;
$$;

SELECT private.refresh_high_scrap_registry();

REVOKE ALL ON FUNCTION private.dispatch_item_kg(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_document_counts(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_document_kg(jsonb, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_document_matches(jsonb, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.order_dispatched_kg(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_high_scrap_registry() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.print_run_wastage_plan(text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION private.dispatch_item_kg(jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.dispatch_document_counts(jsonb, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.dispatch_document_kg(jsonb, numeric, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.dispatch_document_matches(jsonb, text, text, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.order_dispatched_kg(text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.refresh_high_scrap_registry() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.print_run_wastage_plan(text, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON public.high_scrap_audit_registry FROM anon';
  END IF;
  EXECUTE 'REVOKE ALL ON public.high_scrap_audit_registry FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.order_dispatched_kg(text, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.print_run_wastage_plan(text, jsonb) TO authenticated';
    EXECUTE 'GRANT SELECT ON public.high_scrap_audit_registry TO authenticated';
  END IF;
END $$;
