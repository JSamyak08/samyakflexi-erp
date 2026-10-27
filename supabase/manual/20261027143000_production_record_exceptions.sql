-- READ ONLY. This file is not a migration and must not be moved into supabase/migrations.
-- Running it does not INSERT, UPDATE, or DELETE any row.
-- It lists each production record and the Job Master checks that record fails.
-- Review the rows in the app. Do not correct them from this script.
--
-- Printing layer is job_masters.layers[0]. Print width is job_masters.print_width_mm.
-- A Job Master is used only when the record or order stores its id, or the SKU
-- matches one row, or the job name matches exactly one row. Otherwise the
-- check is "Job Master not found / ambiguous".

WITH jm AS (
  SELECT
    id,
    btrim(sku_code) AS sku_code,
    btrim(split_part(job_name, ' ||| ', 1)) AS job_name,
    print_width_mm,
    CASE
      WHEN layers IS NULL OR jsonb_typeof(layers) <> 'array' OR jsonb_array_length(layers) = 0 THEN NULL
      ELSE layers->0->>'filmType'
    END AS print_film_type,
    CASE
      WHEN layers IS NULL OR jsonb_typeof(layers) <> 'array' OR jsonb_array_length(layers) = 0 THEN NULL
      WHEN COALESCE(layers->0->>'micron', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (layers->0->>'micron')::numeric
      ELSE NULL
    END AS print_micron,
    CASE
      WHEN COALESCE(wastage_percentage, 0) > 0 THEN wastage_percentage
      ELSE 5
    END AS wastage_pct
  FROM public.job_masters
),
name_counts AS (
  SELECT lower(job_name) AS job_name_key, COUNT(*) AS name_count
  FROM jm
  WHERE job_name <> ''
  GROUP BY lower(job_name)
),
sku_counts AS (
  SELECT lower(sku_code) AS sku_key, COUNT(*) AS sku_count
  FROM jm
  WHERE sku_code <> ''
  GROUP BY lower(sku_code)
),
records AS (
  SELECT
    pr.id AS record_id,
    pr.order_id,
    pr.job_name,
    pr.client_name,
    pr.date_filled,
    pr.recorded_at,
    pr.gross_production_kg,
    pr.net_usable_kg,
    pr.total_wastage_kg,
    pr.wastage_percentage,
    pr.actual_meters_printed,
    pr.qty_slitting,
    pr.qty_pouching,
    pr.qty_dispatch,
    pr.qty_first_pass_l1,
    pr.printing_wastage_kg,
    pr.printing_plain_setting_wastage_kg,
    pr.job_code,
    pr.job_master_id AS record_job_master_id,
    pr.process_logs,
    o.order_qty_kg,
    o.job_master_id AS order_job_master_id,
    o.job_details->>'jobMasterId' AS order_details_job_master_id,
    btrim(split_part(o.job_name, ' ||| ', 1)) AS order_job_name
  FROM public.production_records pr
  LEFT JOIN public.orders o ON o.id = pr.order_id
),
resolved AS (
  SELECT
    r.*,
    COALESCE(NULLIF(r.record_job_master_id, ''), NULLIF(r.order_job_master_id, ''), NULLIF(r.order_details_job_master_id, '')) AS stored_jm_id,
    by_id.id AS id_match,
    by_sku.id AS sku_match,
    sku_counts.sku_count,
    by_name.id AS name_match,
    name_counts.name_count
  FROM records r
  LEFT JOIN jm by_id
    ON by_id.id = COALESCE(NULLIF(r.record_job_master_id, ''), NULLIF(r.order_job_master_id, ''), NULLIF(r.order_details_job_master_id, ''))
  LEFT JOIN sku_counts ON sku_counts.sku_key = lower(btrim(COALESCE(r.job_code, '')))
  LEFT JOIN LATERAL (
    SELECT id FROM jm
    WHERE COALESCE(sku_counts.sku_count, 0) = 1
      AND lower(jm.sku_code) = sku_counts.sku_key
    LIMIT 1
  ) by_sku ON true
  LEFT JOIN name_counts
    ON name_counts.job_name_key = lower(btrim(COALESCE(NULLIF(r.job_name, ''), r.order_job_name, '')))
  LEFT JOIN LATERAL (
    SELECT id FROM jm
    WHERE COALESCE(name_counts.name_count, 0) = 1
      AND lower(jm.job_name) = name_counts.job_name_key
    LIMIT 1
  ) by_name ON true
),
linked AS (
  SELECT
    z.*,
    CASE
      WHEN z.id_match IS NOT NULL THEN z.id_match
      WHEN COALESCE(z.sku_count, 0) = 1 THEN z.sku_match
      WHEN COALESCE(z.name_count, 0) = 1 THEN z.name_match
      ELSE NULL
    END AS job_master_id,
    CASE
      WHEN z.id_match IS NOT NULL THEN 'id'
      WHEN COALESCE(z.sku_count, 0) = 1 THEN 'sku'
      WHEN COALESCE(z.name_count, 0) = 1 THEN 'name'
      WHEN COALESCE(z.sku_count, 0) > 1 OR COALESCE(z.name_count, 0) > 1 THEN 'ambiguous'
      ELSE 'missing'
    END AS link_via
  FROM resolved z
),
spec AS (
  SELECT
    l.*,
    jm.print_film_type,
    jm.print_micron,
    jm.print_width_mm,
    jm.wastage_pct,
    jm.job_name AS job_master_name
  FROM linked l
  LEFT JOIN jm ON jm.id = l.job_master_id
),
roll_rows AS (
  SELECT
    s.record_id,
    s.job_master_id,
    s.link_via,
    s.print_film_type,
    s.print_micron,
    s.print_width_mm,
    COALESCE(roll->>'filmType', '') AS film_type,
    CASE
      WHEN COALESCE(roll->>'micron', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (roll->>'micron')::numeric
      ELSE NULL
    END AS micron,
    CASE
      WHEN COALESCE(roll->>'widthMm', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (roll->>'widthMm')::numeric
      ELSE NULL
    END AS width_mm,
    CASE
      WHEN COALESCE(roll->>'consumedWeightKg', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (roll->>'consumedWeightKg')::numeric
      ELSE NULL
    END AS consumed_kg,
    roll.ordinality AS roll_no
  FROM spec s
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN s.process_logs IS NULL OR jsonb_typeof(s.process_logs->'inputRollsList') <> 'array' THEN '[]'::jsonb
      ELSE s.process_logs->'inputRollsList'
    END
  ) WITH ORDINALITY AS roll(roll, ordinality) ON true
),
failures AS (
  SELECT record_id, 'order'::text AS rule, 'block'::text AS severity,
    'Record has no order.' AS detail
  FROM spec
  WHERE order_id IS NULL OR btrim(order_id) = ''

  UNION ALL
  SELECT record_id, 'job-master', 'block',
    'Job Master not found / ambiguous (' || link_via || ').'
  FROM spec
  WHERE link_via IN ('missing', 'ambiguous')

  UNION ALL
  SELECT record_id, 'negative', 'block',
    'A stored kg or meter column is negative.'
  FROM spec
  WHERE COALESCE(gross_production_kg, 0) < 0
     OR COALESCE(net_usable_kg, 0) < 0
     OR COALESCE(total_wastage_kg, 0) < 0
     OR COALESCE(actual_meters_printed, 0) < 0
     OR COALESCE(qty_first_pass_l1, 0) < 0
     OR COALESCE(qty_slitting, 0) < 0
     OR COALESCE(qty_pouching, 0) < 0
     OR COALESCE(qty_dispatch, 0) < 0
     OR COALESCE(printing_wastage_kg, 0) < 0
     OR COALESCE(printing_plain_setting_wastage_kg, 0) < 0

  UNION ALL
  SELECT record_id, 'blank-roll', 'block',
    'Roll ' || roll_no || ' is missing film type, micron, or width.'
  FROM roll_rows
  WHERE roll_no IS NOT NULL
    AND COALESCE(consumed_kg, 0) > 0
    AND (btrim(film_type) = '' OR micron IS NULL OR width_mm IS NULL)

  UNION ALL
  SELECT record_id, 'film-type', 'block',
    'Roll ' || roll_no || ' film ' || film_type || ' differs from Job Master ' || COALESCE(print_film_type, 'unknown') || '.'
  FROM roll_rows
  WHERE roll_no IS NOT NULL
    AND btrim(film_type) <> ''
    AND (
      print_film_type IS NULL
      OR btrim(print_film_type) = ''
      OR upper(regexp_replace(film_type, '[^A-Za-z0-9]', '', 'g')) NOT LIKE '%' || upper(regexp_replace(print_film_type, '[^A-Za-z0-9]', '', 'g')) || '%'
         AND upper(regexp_replace(print_film_type, '[^A-Za-z0-9]', '', 'g')) NOT LIKE '%' || upper(regexp_replace(film_type, '[^A-Za-z0-9]', '', 'g')) || '%'
    )

  UNION ALL
  SELECT record_id, 'micron', 'block',
    'Roll ' || roll_no || ' micron ' || micron || ' is more than 2 µ from Job Master ' || print_micron || '.'
  FROM roll_rows
  WHERE micron IS NOT NULL AND print_micron IS NOT NULL AND abs(micron - print_micron) > 2

  UNION ALL
  SELECT record_id, 'micron', 'warn',
    'Roll ' || roll_no || ' micron ' || micron || ' is more than 0.5 µ from Job Master ' || print_micron || '.'
  FROM roll_rows
  WHERE micron IS NOT NULL AND print_micron IS NOT NULL
    AND abs(micron - print_micron) > 0.5
    AND abs(micron - print_micron) <= 2

  UNION ALL
  SELECT record_id, 'width', 'block',
    'Roll ' || roll_no || ' width ' || width_mm || ' mm is narrower than print width ' || print_width_mm || ' mm.'
  FROM roll_rows
  WHERE width_mm IS NOT NULL AND print_width_mm IS NOT NULL AND width_mm < print_width_mm

  UNION ALL
  SELECT record_id, 'width', 'warn',
    'Roll ' || roll_no || ' width ' || width_mm || ' mm is more than 25 mm wider than ' || print_width_mm || ' mm.'
  FROM roll_rows
  WHERE width_mm IS NOT NULL AND print_width_mm IS NOT NULL AND width_mm - print_width_mm > 25

  UNION ALL
  SELECT record_id, 'quantity', 'block',
    'Net ' || net_usable_kg || ' kg is above 1.5× order ' || order_qty_kg || ' kg.'
  FROM spec
  WHERE order_qty_kg > 0 AND net_usable_kg > order_qty_kg * 1.5

  UNION ALL
  SELECT record_id, 'quantity', 'warn',
    'Net ' || net_usable_kg || ' kg is more than 10% above order ' || order_qty_kg || ' kg.'
  FROM spec
  WHERE order_qty_kg > 0
    AND net_usable_kg > order_qty_kg * 1.10
    AND net_usable_kg <= order_qty_kg * 1.5

  UNION ALL
  SELECT record_id, 'wastage', 'block',
    'Wastage ' || wastage_percentage || '% is above 30%.'
  FROM spec
  WHERE wastage_percentage > 30

  UNION ALL
  SELECT record_id, 'dispatch-default', 'warn',
    'Net usable kg equals gross production and slitting, pouching, and dispatch are empty, so net was likely copied from printing output.'
  FROM spec
  WHERE COALESCE(gross_production_kg, 0) > 0
    AND gross_production_kg = net_usable_kg
    AND COALESCE(qty_slitting, 0) = 0
    AND COALESCE(qty_pouching, 0) = 0
    AND COALESCE(qty_dispatch, 0) = 0
)
SELECT
  s.record_id,
  s.order_id,
  s.job_name,
  s.client_name,
  s.date_filled,
  s.link_via,
  s.job_master_id,
  s.job_master_name,
  s.print_film_type,
  s.print_micron,
  s.print_width_mm,
  f.rule,
  f.severity,
  f.detail
FROM spec s
JOIN failures f ON f.record_id = s.record_id
ORDER BY s.recorded_at NULLS LAST, s.record_id, f.severity, f.rule;
