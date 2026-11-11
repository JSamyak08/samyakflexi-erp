-- Manual repair. NOT a migration. Do not put this file in supabase/migrations.
--
-- ORD-2026-231 (Ashirwad Panda Inner) finished printing on 11 Nov 2026.
-- A later progress autosave replaced the order's input roll list with one
-- row whose barcode is blank. Production record PR-ORD-2026-231 still has
-- both rolls that were consumed:
--   RM-BC-20261029-1945N5ZG-BAL   142.80 kg of 142.80 kg
--   RM-BC-20261029-1945K3SY       363.40 kg of 363.40 kg
--
-- This copies that production-record list back onto the order, in
-- job_details and in the job_name envelope. It does not touch stock,
-- the ledger, or the production record.
--
-- Rehearse on the test project awtjvrhpoyzjwrfumhip only.
-- Do not run this against production eamstsaqkbeiywfaanhi until the
-- preview in script_report has been reviewed and Samyak approves.
--
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- after the preview shows both barcodes on the order and nowhere else.
-- Safe to run again: when the order list already matches the production
-- record, the update matches zero rows.

BEGIN;

DROP TABLE IF EXISTS script_report;
CREATE TEMP TABLE script_report (
  ord integer NOT NULL,
  section text NOT NULL,
  detail text NOT NULL
);

INSERT INTO script_report (ord, section, detail)
SELECT
  1,
  'before order job_details',
  COALESCE(o.job_details -> 'inputRollsList', 'null'::jsonb)::text
FROM public.orders o
WHERE o.id = 'ORD-2026-231';

INSERT INTO script_report (ord, section, detail)
SELECT
  2,
  'before order envelope',
  CASE
    WHEN position(' ||| ' IN COALESCE(o.job_name, '')) = 0 THEN '(no envelope)'
    ELSE (substring(o.job_name FROM position(' ||| ' IN o.job_name) + 5)::jsonb -> 'inputRollsList')::text
  END
FROM public.orders o
WHERE o.id = 'ORD-2026-231';

INSERT INTO script_report (ord, section, detail)
SELECT
  3,
  'source production record',
  COALESCE(r.input_rolls_list, 'null'::jsonb)::text
FROM public.production_records r
WHERE r.id = 'PR-ORD-2026-231';

WITH source AS (
  SELECT r.input_rolls_list AS rolls
  FROM public.production_records r
  WHERE r.id = 'PR-ORD-2026-231'
    AND r.order_id = 'ORD-2026-231'
    AND jsonb_typeof(r.input_rolls_list) = 'array'
    AND jsonb_array_length(r.input_rolls_list) > 0
),
target AS (
  SELECT
    o.id,
    o.job_details,
    o.job_name,
    source.rolls,
    CASE
      WHEN position(' ||| ' IN COALESCE(o.job_name, '')) > 0
        THEN substring(o.job_name FROM 1 FOR position(' ||| ' IN o.job_name) - 1)
      ELSE COALESCE(o.job_name, '')
    END AS name_base,
    CASE
      WHEN position(' ||| ' IN COALESCE(o.job_name, '')) > 0
        THEN substring(o.job_name FROM position(' ||| ' IN o.job_name) + 5)
      ELSE ''
    END AS raw_env
  FROM public.orders o
  CROSS JOIN source
  WHERE o.id = 'ORD-2026-231'
    AND lower(btrim(COALESCE(o.printing_status, ''))) = 'completed'
    AND o.job_details -> 'inputRollsList' IS DISTINCT FROM source.rolls
),
rewritten AS (
  SELECT
    target.id,
    target.name_base,
    jsonb_set(COALESCE(target.job_details, '{}'::jsonb), '{inputRollsList}', target.rolls, true) AS job_details,
    CASE
      WHEN target.raw_env = '' THEN '{}'::jsonb
      ELSE target.raw_env::jsonb
    END AS envelope,
    target.rolls
  FROM target
  WHERE target.raw_env = '' OR left(btrim(target.raw_env), 1) = '{'
)
UPDATE public.orders o
SET
  job_details = rewritten.job_details,
  job_name = rewritten.name_base || ' ||| ' || (
    jsonb_set(
      CASE
        WHEN jsonb_typeof(rewritten.envelope -> 'jobDetails') = 'object'
          THEN jsonb_set(rewritten.envelope, '{jobDetails,inputRollsList}', rewritten.rolls, true)
        ELSE rewritten.envelope
      END,
      '{inputRollsList}',
      rewritten.rolls,
      true
    )
  )::text
FROM rewritten
WHERE o.id = rewritten.id;

INSERT INTO script_report (ord, section, detail)
SELECT
  4,
  'after order job_details',
  COALESCE(o.job_details -> 'inputRollsList', 'null'::jsonb)::text
FROM public.orders o
WHERE o.id = 'ORD-2026-231';

INSERT INTO script_report (ord, section, detail)
SELECT
  5,
  'after order envelope',
  CASE
    WHEN position(' ||| ' IN COALESCE(o.job_name, '')) = 0 THEN '(no envelope)'
    ELSE (substring(o.job_name FROM position(' ||| ' IN o.job_name) + 5)::jsonb -> 'inputRollsList')::text
  END
FROM public.orders o
WHERE o.id = 'ORD-2026-231';

INSERT INTO script_report (ord, section, detail)
SELECT
  6,
  'order list matches production record',
  (
    SELECT count(*)::text
    FROM public.orders o
    JOIN public.production_records r ON r.id = 'PR-ORD-2026-231'
    WHERE o.id = 'ORD-2026-231'
      AND o.job_details -> 'inputRollsList' = r.input_rolls_list
  );

SELECT ord, section, detail FROM script_report ORDER BY ord;

-- Preview only. Switch this line to COMMIT after the report shows both
-- input barcodes on the order and Samyak has approved the write.
ROLLBACK;
