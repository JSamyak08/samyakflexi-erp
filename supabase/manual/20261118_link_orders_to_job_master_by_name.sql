-- One-time link for active orders that match a Job Master only by job name.
-- Do not run this until a backup has been taken and the preview has been read.
-- The file ends in ROLLBACK, so executing it does not persist. After the
-- preview is accepted, run the BEGIN block on its own and change the final
-- ROLLBACK to COMMIT.
--
-- Matching is the plain job name, before the " ||| {json}" envelope.
-- An order with more than one Job Master of that name is ambiguous and is
-- not updated. Completed, cancelled, dispatched, delivered and closed orders
-- are not updated. Orders that already have a job_master_id are not updated.

-- PREVIEW. Read-only. One row per candidate. candidate_count > 1 is excluded.

WITH order_names AS (
  SELECT
    o.id AS order_id,
    btrim(split_part(o.job_name, ' ||| ', 1)) AS job_name,
    o.status,
    o.job_master_id
  FROM public.orders AS o
  WHERE (o.job_master_id IS NULL OR btrim(o.job_master_id) = '')
    AND lower(btrim(coalesce(o.status, ''))) NOT IN (
      'completed', 'cancelled', 'canceled', 'dispatched', 'delivered', 'closed'
    )
),
candidates AS (
  SELECT
    n.order_id,
    n.job_name,
    n.status,
    jm.id AS proposed_job_master_id
  FROM order_names AS n
  JOIN public.job_masters AS jm
    ON n.job_name <> ''
   AND lower(btrim(jm.job_name)) = lower(n.job_name)
),
counted AS (
  SELECT
    c.order_id,
    c.job_name,
    c.status,
    c.proposed_job_master_id,
    count(*) OVER (PARTITION BY c.order_id) AS candidate_count
  FROM candidates AS c
)
SELECT
  order_id,
  job_name,
  proposed_job_master_id,
  candidate_count,
  CASE
    WHEN candidate_count > 1 THEN 'ambiguous — excluded'
    ELSE 'unique — will link'
  END AS decision
FROM counted
ORDER BY candidate_count DESC, order_id, proposed_job_master_id;

-- APPLY. Transaction. Unique matches only. Ambiguous orders are excluded.
-- job_master_id is what the app reads first. The envelope and job_details
-- are updated to the same id so the next order save does not clear it.
-- A job_name envelope that is not JSON is left as stored.

BEGIN;

DO $$
DECLARE
  rec record;
  plain text;
  raw text;
  envelope jsonb;
  updated_name text;
BEGIN
  FOR rec IN
    WITH order_names AS (
      SELECT
        o.id AS order_id,
        o.job_name,
        btrim(split_part(o.job_name, ' ||| ', 1)) AS job_name_plain
      FROM public.orders AS o
      WHERE (o.job_master_id IS NULL OR btrim(o.job_master_id) = '')
        AND lower(btrim(coalesce(o.status, ''))) NOT IN (
          'completed', 'cancelled', 'canceled', 'dispatched', 'delivered', 'closed'
        )
    ),
    candidates AS (
      SELECT
        n.order_id,
        n.job_name,
        n.job_name_plain,
        jm.id AS job_master_id,
        count(*) OVER (PARTITION BY n.order_id) AS candidate_count
      FROM order_names AS n
      JOIN public.job_masters AS jm
        ON n.job_name_plain <> ''
       AND lower(btrim(jm.job_name)) = lower(n.job_name_plain)
    )
    SELECT order_id, job_name, job_name_plain, job_master_id
    FROM candidates
    WHERE candidate_count = 1
  LOOP
    plain := rec.job_name_plain;
    updated_name := rec.job_name;
    raw := NULL;
    IF position(' ||| ' IN rec.job_name) > 0 THEN
      raw := btrim(substr(rec.job_name, position(' ||| ' IN rec.job_name) + 5));
    END IF;
    IF raw IS NOT NULL AND left(raw, 1) = '{' THEN
      BEGIN
        envelope := raw::jsonb;
        IF envelope ? 'jobDetails' AND jsonb_typeof(envelope->'jobDetails') = 'object' THEN
          envelope := jsonb_set(envelope, '{jobDetails,jobMasterId}', to_jsonb(rec.job_master_id), true);
        ELSE
          envelope := jsonb_set(
            envelope,
            '{jobDetails}',
            coalesce(envelope->'jobDetails', '{}'::jsonb) || jsonb_build_object('jobMasterId', rec.job_master_id),
            true
          );
        END IF;
        updated_name := plain || ' ||| ' || envelope::text;
      EXCEPTION WHEN OTHERS THEN
        updated_name := rec.job_name;
      END;
    END IF;

    UPDATE public.orders
    SET job_master_id = rec.job_master_id,
        job_details = jsonb_set(
          coalesce(job_details, '{}'::jsonb),
          '{jobMasterId}',
          to_jsonb(rec.job_master_id),
          true
        ),
        job_name = updated_name
    WHERE id = rec.order_id
      AND (job_master_id IS NULL OR btrim(job_master_id) = '');
  END LOOP;
END $$;

-- Same shape as the preview, after the update and before the rollback.
-- Unique rows should now show the id on the order. Ambiguous rows stay blank.
SELECT
  o.id AS order_id,
  btrim(split_part(o.job_name, ' ||| ', 1)) AS job_name,
  o.job_master_id AS proposed_job_master_id
FROM public.orders AS o
WHERE lower(btrim(coalesce(o.status, ''))) NOT IN (
  'completed', 'cancelled', 'canceled', 'dispatched', 'delivered', 'closed'
)
ORDER BY o.id;

ROLLBACK;
