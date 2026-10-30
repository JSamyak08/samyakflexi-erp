-- MANUAL DATA CORRECTION. Not applied by the application deploy.
-- Do not run this against production until the statements have been reviewed
-- on a backup or the test project. This file was not executed.
--
-- Why: job punching used to assign requirement ids from REQ-100 through REQ-999.
-- Open orders share those ids. Example: ORD-2026-224 PET 710 mm is REQ-216 at
-- 136.82 kg, and ORD-2026-217 PET 835 mm is also REQ-216 at 521.61 kg.
-- The app now keys stock and PO selection by order id + requirement id, so
-- the screen is correct without this rewrite. Running it still removes the
-- shared ids so older exports and any id-only lookup stay unambiguous.
--
-- The app reads raw material lines from the job_name metadata envelope first,
-- then from orders.raw_material_requirements. Both are updated together.
-- printedSfgUse.printLineId is renamed when it points at a renamed line.
-- The earliest order (created_at, then id) keeps the original id.

BEGIN;

CREATE TEMP TABLE requirement_id_rename (
  order_id text NOT NULL,
  old_id text NOT NULL,
  new_id text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  ord record;
  source jsonb;
  rewritten jsonb;
  elem jsonb;
  idx int;
  old_id text;
  new_id text;
  seen text[];
  envelope jsonb;
  title text;
  job_details jsonb;
  renamed_print_line boolean;
  changed boolean;
BEGIN
  seen := ARRAY[]::text[];

  FOR ord IN
    SELECT id, job_name, job_details, raw_material_requirements, created_at
    FROM orders
    ORDER BY created_at NULLS LAST, id
  LOOP
    title := split_part(ord.job_name, ' ||| ', 1);
    envelope := NULL;
    IF position(' ||| ' in coalesce(ord.job_name, '')) > 0 THEN
      BEGIN
        envelope := split_part(ord.job_name, ' ||| ', 2)::jsonb;
      EXCEPTION WHEN others THEN
        envelope := NULL;
      END;
    END IF;

    source := CASE
      WHEN envelope IS NOT NULL AND jsonb_typeof(envelope->'raw_material_requirements') = 'array'
        THEN envelope->'raw_material_requirements'
      WHEN jsonb_typeof(ord.raw_material_requirements) = 'array'
        THEN ord.raw_material_requirements
      ELSE '[]'::jsonb
    END;

    rewritten := '[]'::jsonb;
    changed := false;
    idx := 0;
    FOR elem IN SELECT value FROM jsonb_array_elements(source)
    LOOP
      idx := idx + 1;
      old_id := coalesce(elem->>'id', '');
      new_id := old_id;
      IF old_id = '' OR old_id = ANY (seen) THEN
        new_id := 'REQ-' || ord.id || '-' || idx::text;
        IF new_id = ANY (seen) THEN
          new_id := new_id || '-' || substr(md5(ord.id || ':' || idx::text || ':' || old_id), 1, 6);
        END IF;
      END IF;
      seen := array_append(seen, new_id);
      IF old_id IS DISTINCT FROM new_id THEN
        changed := true;
        IF old_id <> '' THEN
          INSERT INTO requirement_id_rename (order_id, old_id, new_id)
          VALUES (ord.id, old_id, new_id);
        END IF;
      END IF;
      rewritten := rewritten || jsonb_build_array(jsonb_set(elem, '{id}', to_jsonb(new_id), true));
    END LOOP;

    job_details := coalesce(ord.job_details, '{}'::jsonb);
    new_id := NULL;
    renamed_print_line := false;
    IF coalesce(job_details#>>'{printedSfgUse,printLineId}', '') <> '' THEN
      SELECT r.new_id INTO new_id
      FROM requirement_id_rename r
      WHERE r.order_id = ord.id
        AND r.old_id = job_details#>>'{printedSfgUse,printLineId}'
      LIMIT 1;
      renamed_print_line := FOUND;
      IF renamed_print_line THEN
        job_details := jsonb_set(job_details, '{printedSfgUse,printLineId}', to_jsonb(new_id), true);
      END IF;
    END IF;

    IF NOT changed AND NOT renamed_print_line THEN
      CONTINUE;
    END IF;

    IF envelope IS NOT NULL THEN
      envelope := jsonb_set(envelope, '{raw_material_requirements}', rewritten, true);
      IF renamed_print_line AND jsonb_typeof(envelope->'jobDetails') = 'object'
         AND jsonb_typeof(envelope#>'{jobDetails,printedSfgUse}') = 'object' THEN
        envelope := jsonb_set(envelope, '{jobDetails,printedSfgUse,printLineId}', to_jsonb(new_id), true);
      END IF;
      UPDATE orders
      SET raw_material_requirements = rewritten,
          job_details = job_details,
          job_name = title || ' ||| ' || envelope::text
      WHERE id = ord.id;
    ELSE
      UPDATE orders
      SET raw_material_requirements = rewritten,
          job_details = job_details
      WHERE id = ord.id;
    END IF;
  END LOOP;
END $$;

-- Review the renames before committing. ROLLBACK leaves production unchanged.
SELECT order_id, old_id, new_id
FROM requirement_id_rename
ORDER BY order_id, old_id;

-- Change ROLLBACK to COMMIT only after the review looks right.
ROLLBACK;
