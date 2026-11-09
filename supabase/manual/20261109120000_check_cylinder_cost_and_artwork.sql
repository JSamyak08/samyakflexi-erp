-- Read-only check for two cylinder-directory defects.
-- Do not put this file in supabase/migrations.
-- Safe on production and on the test project awtjvrhpoyzjwrfumhip: it only SELECTs.
--
-- 1. Cost. Area is (face_length_mm * circumference_mm) / 100 square centimetres.
--    Per-cylinder cost is that area times the engraving rate (₹/cm²).
--    The set total is the per-cylinder amount times the colour count.
--    Amounts are stored as text. A save that deleted the decimal point turned
--    "₹ 5,139.00" into 513900, and a later save into a crore-scale figure,
--    while the set total could stay correct.
--
-- 2. Artwork. A file is suspect when its name embeds a different SKU-CYL code,
--    or when the same URL is stored on a different job.

-- ---------------------------------------------------------------------------
-- Cost rows whose stored per-cylinder or set total disagrees with the formula
-- or with each other by more than the rounding tolerance.
-- ---------------------------------------------------------------------------
WITH money AS (
  SELECT
    c.id,
    c.sku,
    c.job_name,
    c.job_master_id,
    GREATEST(COALESCE(c.colors_count, 1), 1) AS colors,
    c.face_length_mm,
    c.circumference_mm,
    c.rate_per_sq_inch,
    c.cylinder_cost,
    c.cost_per_cylinder,
    CASE
      WHEN regexp_replace(replace(COALESCE(c.cylinder_cost, ''), ',', ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN regexp_replace(replace(c.cylinder_cost, ',', ''), '[^0-9.]', '', 'g')::numeric
    END AS total_num,
    CASE
      WHEN regexp_replace(replace(COALESCE(c.cost_per_cylinder, ''), ',', ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN regexp_replace(replace(c.cost_per_cylinder, ',', ''), '[^0-9.]', '', 'g')::numeric
    END AS per_num,
    CASE
      WHEN c.face_length_mm > 0 AND c.circumference_mm > 0
        THEN round((c.face_length_mm * c.circumference_mm) / 100.0)
    END AS area_sq_cm
  FROM public.cylinders c
),
rated AS (
  SELECT
    money.*,
    CASE
      WHEN rate_per_sq_inch BETWEEN 0.2 AND 50 THEN rate_per_sq_inch
      ELSE 1.6
    END AS sane_rate
  FROM money
),
expected AS (
  SELECT
    rated.*,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * sane_rate) END AS expected_per,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * sane_rate) * colors END AS expected_total
  FROM rated
)
SELECT
  id,
  sku,
  job_name,
  colors,
  face_length_mm,
  circumference_mm,
  area_sq_cm,
  rate_per_sq_inch,
  cylinder_cost AS stored_total,
  cost_per_cylinder AS stored_per_cylinder,
  total_num,
  per_num,
  expected_per,
  expected_total,
  CASE
    WHEN expected_total IS NOT NULL AND total_num IS NOT NULL AND total_num > expected_total * 20 THEN 'set total is far above area x rate x colours'
    WHEN expected_per IS NOT NULL AND per_num IS NOT NULL AND per_num > expected_per * 20 THEN 'per-cylinder amount is far above area x rate'
    WHEN total_num > 0 AND per_num IS NOT NULL AND abs(per_num * colors - total_num) / total_num > 0.5 THEN 'per-cylinder amount does not match set total / colours'
    WHEN expected_total IS NOT NULL AND total_num IS NOT NULL AND total_num > expected_total * 50 THEN 'set total looks like a repeated decimal-point strip'
    ELSE 'review'
  END AS reason
FROM expected
WHERE
  (expected_per IS NOT NULL AND per_num IS NOT NULL AND per_num > expected_per * 20)
  OR (expected_total IS NOT NULL AND total_num IS NOT NULL AND total_num > expected_total * 20)
  OR (total_num > 0 AND per_num IS NOT NULL AND abs(per_num * colors - total_num) / NULLIF(total_num, 0) > 0.5)
ORDER BY sku NULLS LAST, job_name;

-- ---------------------------------------------------------------------------
-- Artwork links that likely belong to a different job.
-- ---------------------------------------------------------------------------
WITH files AS (
  SELECT
    c.id,
    c.sku,
    c.job_name,
    c.job_master_id,
    src.source,
    src.url,
    split_part(src.url, '?', 1) AS bare_url,
    upper((regexp_match(src.url, 'SKU-CYL-[0-9]+', 'i'))[1]) AS embedded_sku
  FROM public.cylinders c
  CROSS JOIN LATERAL (
    VALUES
      ('artwork_url', nullif(btrim(c.artwork_url), '')),
      ('job_card_file_url', nullif(btrim(c.job_card_file_url), ''))
  ) AS src(source, url)
  WHERE src.url IS NOT NULL
),
shared AS (
  SELECT
    bare_url,
    count(DISTINCT lower(COALESCE(sku, ''))) AS sku_count,
    count(DISTINCT lower(COALESCE(job_name, ''))) AS job_count
  FROM files
  GROUP BY bare_url
)
SELECT
  f.id,
  f.sku,
  f.job_name,
  f.job_master_id,
  f.source,
  f.url,
  f.embedded_sku,
  s.sku_count,
  s.job_count,
  CASE
    WHEN f.embedded_sku IS NOT NULL AND upper(COALESCE(f.sku, '')) <> f.embedded_sku
      THEN 'filename embeds a different SKU'
    WHEN s.job_count > 1 OR s.sku_count > 1
      THEN 'same file is stored on a different job'
    ELSE 'review'
  END AS reason
FROM files f
JOIN shared s ON s.bare_url = f.bare_url
WHERE
  (f.embedded_sku IS NOT NULL AND upper(COALESCE(f.sku, '')) <> f.embedded_sku)
  OR s.job_count > 1
  OR s.sku_count > 1
ORDER BY f.sku NULLS LAST, f.job_name, f.source;
