-- Manual repair. NOT a migration. Do not put this file in supabase/migrations.
--
-- ALREADY COMMITTED ON PRODUCTION (eamstsaqkbeiywfaanhi). Kept here for the
-- record. It is idempotent: once a row's substrate is no longer the filler,
-- a later run updates nothing.
--
-- Packing list PL-2026-606130 (order ORD-2026-180, since deleted) saved
-- every roll substrate as the filler "Flexible Laminate". The packing-list
-- PDF hides that filler, so the substrate prints blank. The structure is
-- still on job master JM-2026-538.
--
-- This sets substrateSpec on that packing list only, and only on items whose
-- substrate is the filler. Other packing lists are not touched. Barcodes,
-- roll numbers, and weights are not touched.
--
-- The structure written is the one the job master screen shows: the layer
-- list when it has a row, otherwise job_masters.structure, otherwise
-- film_structure. A blank, an em dash, or "Flexible Laminate" is not used.
-- On the test project, sampled job masters store the same text in the
-- structure column and in layers. JM-2026-538 is not on the test project.
--
-- Rehearse on the test project awtjvrhpoyzjwrfumhip if you need to see the
-- preview again. Production has already been committed; the file still ends
-- in ROLLBACK so a casual re-run does not write.
--
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- after the preview shows the JM-2026-538 structure on the filler rows and
-- nowhere else. Safe to run again: once those rows are no longer the filler,
-- the update matches zero rows.

BEGIN;

DROP TABLE IF EXISTS script_report;
CREATE TEMP TABLE script_report (
  ord integer NOT NULL,
  section text NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.job_master_structure(
  p_layers jsonb,
  p_structure text,
  p_film_structure text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH layers AS (
    SELECT
      ordinality,
      btrim(concat_ws(
        ' ',
        NULLIF(btrim(COALESCE(elem->>'filmType', '')), ''),
        CASE
          WHEN NULLIF(btrim(COALESCE(elem->>'micron', '')), '') IS NOT NULL
            THEN btrim(elem->>'micron') || 'µ'
          ELSE NULL
        END
      )) AS piece
    FROM jsonb_array_elements(COALESCE(p_layers, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality)
  ),
  built AS (
    SELECT string_agg(piece, ' / ' ORDER BY ordinality) AS structure
    FROM layers
    WHERE piece <> ''
  ),
  candidates AS (
    SELECT 1 AS preference, structure AS value FROM built
    UNION ALL
    SELECT 2, NULLIF(btrim(COALESCE(p_structure, '')), '')
    UNION ALL
    SELECT 3, NULLIF(btrim(COALESCE(p_film_structure, '')), '')
  )
  SELECT value
  FROM candidates
  WHERE value IS NOT NULL
    AND value <> '—'
    AND lower(regexp_replace(value, '\s+', ' ', 'g')) <> 'flexible laminate'
  ORDER BY preference
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.item_substrate(item jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(COALESCE(item->>'substrateSpec', '')), '') IS NOT NULL
      THEN item->>'substrateSpec'
    ELSE COALESCE(item->>'structure', '')
  END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.is_filler_substrate(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(value, '')), '\s+', ' ', 'g')) = 'flexible laminate';
$$;

CREATE OR REPLACE FUNCTION pg_temp.rewrite_filler_items(items jsonb, structure text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN pg_temp.is_filler_substrate(pg_temp.item_substrate(item)) THEN
            item
            || jsonb_build_object('substrateSpec', structure)
            || CASE
                 WHEN pg_temp.is_filler_substrate(item->>'structure')
                   THEN jsonb_build_object('structure', structure)
                 ELSE '{}'::jsonb
               END
          ELSE item
        END
        ORDER BY ordinality
      )
      FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) WITH ORDINALITY AS t(item, ordinality)
    ),
    '[]'::jsonb
  );
$$;

CREATE TEMP TABLE pl_substrate_fix ON COMMIT DROP AS
WITH jm AS (
  SELECT pg_temp.job_master_structure(layers, structure, film_structure) AS structure
  FROM public.job_masters
  WHERE id = 'JM-2026-538'
),
target AS (
  SELECT
    ds.dispatch_id,
    ds.items,
    ds.payload,
    jm.structure
  FROM public.dispatch_shipments ds
  LEFT JOIN jm ON true
  WHERE ds.dispatch_id = 'PL-2026-606130'
)
SELECT
  dispatch_id,
  items,
  payload,
  structure,
  CASE
    WHEN structure IS NULL THEN items
    ELSE pg_temp.rewrite_filler_items(items, structure)
  END AS new_items,
  CASE
    WHEN structure IS NULL THEN payload
    WHEN payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT (payload ? 'items') THEN payload
    ELSE jsonb_set(
      payload,
      '{items}',
      pg_temp.rewrite_filler_items(COALESCE(payload->'items', '[]'::jsonb), structure),
      true
    )
  END AS new_payload
FROM target;

INSERT INTO script_report (ord, section, detail)
SELECT
  1,
  'job master structure',
  COALESCE(
    (SELECT structure FROM pl_substrate_fix LIMIT 1),
    'JM-2026-538 has no usable structure; no row will change'
  );

INSERT INTO script_report (ord, section, detail)
SELECT
  2,
  'target list found',
  CASE
    WHEN EXISTS (SELECT 1 FROM pl_substrate_fix) THEN 'PL-2026-606130'
    ELSE 'PL-2026-606130 was not found; no row will change'
  END;

INSERT INTO script_report (ord, section, detail)
SELECT
  3,
  'filler rows before',
  COALESCE((
    SELECT count(*)::text
    FROM pl_substrate_fix fix,
      jsonb_array_elements(COALESCE(fix.items, '[]'::jsonb)) item
    WHERE pg_temp.is_filler_substrate(pg_temp.item_substrate(item))
  ), '0')
  || ' in items, '
  || COALESCE((
    SELECT count(*)::text
    FROM pl_substrate_fix fix,
      jsonb_array_elements(COALESCE(fix.payload->'items', '[]'::jsonb)) item
    WHERE pg_temp.is_filler_substrate(pg_temp.item_substrate(item))
  ), '0')
  || ' in payload.items';

INSERT INTO script_report (ord, section, detail)
SELECT
  4,
  'row to change',
  COALESCE(item->>'barcodeId', '') || ' substrate ' || COALESCE(pg_temp.item_substrate(item), '')
FROM pl_substrate_fix fix,
  jsonb_array_elements(COALESCE(fix.items, '[]'::jsonb)) item
WHERE pg_temp.is_filler_substrate(pg_temp.item_substrate(item))
  AND fix.structure IS NOT NULL;

UPDATE public.dispatch_shipments ds
SET
  items = fix.new_items,
  payload = fix.new_payload,
  updated_at = now()
FROM pl_substrate_fix fix
WHERE ds.dispatch_id = fix.dispatch_id
  AND ds.dispatch_id = 'PL-2026-606130'
  AND fix.structure IS NOT NULL
  AND (
    ds.items IS DISTINCT FROM fix.new_items
    OR ds.payload IS DISTINCT FROM fix.new_payload
  );

INSERT INTO script_report (ord, section, detail)
SELECT
  5,
  'rows updated',
  count(*)::text
FROM public.dispatch_shipments ds
JOIN pl_substrate_fix fix ON fix.dispatch_id = ds.dispatch_id
WHERE ds.items IS NOT DISTINCT FROM fix.new_items
  AND ds.payload IS NOT DISTINCT FROM fix.new_payload
  AND fix.items IS DISTINCT FROM fix.new_items;

INSERT INTO script_report (ord, section, detail)
SELECT
  6,
  'filler rows after',
  COALESCE((
    SELECT count(*)::text
    FROM public.dispatch_shipments ds,
      jsonb_array_elements(COALESCE(ds.items, '[]'::jsonb)) item
    WHERE ds.dispatch_id = 'PL-2026-606130'
      AND pg_temp.is_filler_substrate(pg_temp.item_substrate(item))
  ), '0');

SELECT ord, section, detail
FROM script_report
ORDER BY ord, detail;

-- Preview only. Change ROLLBACK to COMMIT after the report is reviewed.
ROLLBACK;
