-- Renumber one side of each shared cylinder-code number.
-- NOT a migration. Do not put this file in supabase/migrations.
-- This script was not executed by the agent. It ends in ROLLBACK.
--
-- Apply migration 20261116120000_cylinder_sku_cross_prefix.sql first.
-- allocate_cylinder_sku() issues each replacement as SKU-CYL-NNN, past every
-- trailing number already stored under SKU-CYL-, SKU-2026-, and CYL-2026-.
-- Take a backup first. Read the before/after SELECT previews. Change the
-- last line to COMMIT only after those previews have been read.
--
-- The seven shared numbers are 514, 420, 421, 425, 426, 427, and 428.
-- One side of each pair is kept. The other side, everywhere it is stored,
-- is rewritten to one new SKU-CYL code from the allocator.
--   514: keep SKU-CYL-514, renumber SKU-2026-514
--   421, 425, 426, 427, 428: keep SKU-CYL-4NN, renumber CYL-2026-04NN
--   420: CYL-2026-0420 against SKU-2026-420. The side whose earliest
--        cylinders/job_masters created_at is newer is renumbered.
--        If those timestamps are equal, or either side has no created_at,
--        SKU-2026-420 is the side that is renumbered, and the preview says so.
--        Production was not queried to hardcode which side that is.
-- A pair is skipped when either side is already absent, so a second run
-- does not allocate another code.
--
-- Columns that store a cylinder SKU, from the schema and the save paths.
-- Exact code values are rewritten. A longer string that only contains the
-- code (an artwork URL, a sentence in notes or a changelog) is left as it
-- is, because this script does not move storage objects.
-- JSON values are rewritten only when the whole string equals the old code.
-- The "name ||| {json}" envelope used on orders.job_name and
-- job_masters.job_name is split, and exact codes inside that JSON are rewritten.
--
--   public.cylinders.sku
--   public.cylinders.press_marks            jsonb, exact string values
--   public.cylinders.changelogs             jsonb, exact string values
--   public.cylinders.artwork_url            only when the whole value is the code
--   public.cylinders.job_card_file_url      only when the whole value is the code
--   public.cylinders.job_card_file_name     only when the whole value is the code
--   public.job_masters.sku_code
--   public.job_masters.cylinder_sku
--   public.job_masters.job_name             plain text or the ||| json envelope
--   public.job_masters.press_marks          jsonb, exact string values
--   public.job_masters.layers               jsonb, exact string values
--   public.job_masters.process_routing      jsonb, exact string values
--   public.job_masters.artwork_url          only when the whole value is the code
--   public.job_masters.job_card_file_url    only when the whole value is the code
--   public.job_masters.job_card_file_name   only when the whole value is the code
--   public.orders.job_name                  plain text or the ||| json envelope
--   public.orders.job_details               jsonb (skuCode, jobCode, cylinderSku, cylinderDetails.sku)
--   public.orders.raw_material_requirements jsonb, exact string values
--   public.orders.sfg_consumptions          jsonb, exact string values
--   public.orders.job_code                  only if the column exists (the app reads it; baseline has no orders.job_code)
--   public.orders.sku_code                  only if the column exists (the app reads it; baseline has no orders.sku_code)
--   public.order_confirmations.job_name
--   public.order_confirmations.payload      jsonb
--   public.job_datasheets.job_name
--   public.job_datasheets.job_id            only when the whole value is the code
--   public.production_schedules.job_name
--   public.production_records.job_name
--   public.production_records.job_code      only when the whole value is the code
--   public.production_records.materials_list, process_logs, stages, item_remarks,
--     output_rolls, rolls_breakdown, input_rolls_list, sfg_consumptions
--   public.sales_quotations.items           jsonb
--   public.sales_quotations.comments        only when the whole value is the code
--   public.sales_quotations.cylinder_terms  only when the whole value is the code
--   public.job_card_specs.id                jobcard_<old code> becomes jobcard_<new code>
--   public.job_card_specs.payload           jsonb
--   public.inventory_rolls.job_code         only when the whole value is the code
--   public.sfg_goods.job_code               only when the whole value is the code
--   public.fg_goods.job_code                only when the whole value is the code
--   public.packing_list_consumptions.job_code
--   public.packing_list_consumptions.job_name
--   public.inventory_ledger_entries.job_code
--   public.inventory_ledger_entries.job_name
--   public.dispatch_shipments.payload       jsonb, when that column exists
--   public.delivery_challans.payload        jsonb
-- public.barcode_registry is a view of cylinders.sku and is not updated itself.
--
-- cylinders_guard_sku is disabled only for the updates inside this
-- transaction, so several rows that already share one exact code can move
-- together. It is enabled again before the previews. ROLLBACK undoes that
-- too. Reservations created by the allocator are deleted here because the
-- trigger that normally consumes them is off during the update.

BEGIN;

DROP TABLE IF EXISTS cylinder_sku_renumber_preview;

DO $$
BEGIN
  IF to_regprocedure('private.cylinder_sku_serial(text)') IS NULL
     OR private.cylinder_sku_serial('SKU-2026-1') IS DISTINCT FROM 1
     OR private.cylinder_sku_serial('CYL-2026-0001') IS DISTINCT FROM 1
     OR to_regprocedure('public.allocate_cylinder_sku(integer)') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 20261116120000_cylinder_sku_cross_prefix.sql before this script';
  END IF;
END $$;

CREATE TEMP TABLE cylinder_sku_renumber_preview (
  shared_number bigint,
  action text,
  old_code text,
  new_code text,
  kept_code text,
  detail text
);

SELECT 'before' AS phase, source, id, code, created_at
FROM (
  SELECT 'cylinders.sku' AS source, c.id, c.sku AS code, c.created_at
  FROM public.cylinders c
  WHERE private.cylinder_sku_serial(c.sku) IN (514, 420, 421, 425, 426, 427, 428)
  UNION ALL
  SELECT 'job_masters.sku_code', j.id, j.sku_code, j.created_at
  FROM public.job_masters j
  WHERE private.cylinder_sku_serial(j.sku_code) IN (514, 420, 421, 425, 426, 427, 428)
  UNION ALL
  SELECT 'job_masters.cylinder_sku', j.id, j.cylinder_sku, j.created_at
  FROM public.job_masters j
  WHERE private.cylinder_sku_serial(j.cylinder_sku) IN (514, 420, 421, 425, 426, 427, 428)
) AS before_rows
ORDER BY code, source, id;

CREATE OR REPLACE FUNCTION pg_temp.replace_json_code(value jsonb, old_code text, new_code text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  key text;
  elem jsonb;
  result jsonb;
BEGIN
  IF value IS NULL OR btrim(coalesce(old_code, '')) = '' THEN
    RETURN value;
  END IF;
  IF jsonb_typeof(value) = 'string' THEN
    IF lower(btrim(value #>> '{}')) = lower(btrim(old_code)) THEN
      RETURN to_jsonb(new_code);
    END IF;
    RETURN value;
  ELSIF jsonb_typeof(value) = 'array' THEN
    result := '[]'::jsonb;
    FOR elem IN SELECT item FROM jsonb_array_elements(value) AS item
    LOOP
      result := result || jsonb_build_array(pg_temp.replace_json_code(elem, old_code, new_code));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR key IN SELECT jsonb_object_keys(value)
    LOOP
      result := result || jsonb_build_object(key, pg_temp.replace_json_code(value -> key, old_code, new_code));
    END LOOP;
    RETURN result;
  END IF;
  RETURN value;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.replace_text_code(value text, old_code text, new_code text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  marker constant text := ' ||| ';
  split_at integer;
  head text;
  tail text;
  payload jsonb;
BEGIN
  IF value IS NULL OR btrim(coalesce(old_code, '')) = '' THEN
    RETURN value;
  END IF;
  IF lower(btrim(value)) = lower(btrim(old_code)) THEN
    RETURN new_code;
  END IF;
  split_at := position(marker IN value);
  IF split_at > 0 THEN
    head := substr(value, 1, split_at - 1);
    tail := substr(value, split_at + length(marker));
    BEGIN
      payload := tail::jsonb;
    EXCEPTION WHEN others THEN
      RETURN value;
    END;
    IF lower(btrim(head)) = lower(btrim(old_code)) THEN
      head := new_code;
    END IF;
    RETURN head || marker || pg_temp.replace_json_code(payload, old_code, new_code)::text;
  END IF;
  RETURN value;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.column_exists(tbl text, col text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = tbl
      AND column_name = col
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.side_codes(p_prefix text, p_serial bigint)
RETURNS TABLE (code text, created_at timestamptz)
LANGUAGE sql
AS $$
  SELECT btrim(src.code), src.created_at
  FROM (
    SELECT c.sku AS code, c.created_at FROM public.cylinders c
    UNION ALL
    SELECT j.sku_code, j.created_at FROM public.job_masters j
    UNION ALL
    SELECT j.cylinder_sku, j.created_at FROM public.job_masters j
  ) AS src
  WHERE private.cylinder_sku_serial(src.code) = p_serial
    AND private.normalize_cylinder_sku(src.code) ~ ('^' || p_prefix || '-[0-9]+$');
$$;

CREATE OR REPLACE PROCEDURE pg_temp.rewrite_text(tbl text, col text, old_code text, new_code text)
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT pg_temp.column_exists(tbl, col) THEN
    RETURN;
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET %I = pg_temp.replace_text_code(%I::text, $1, $2) WHERE %I IS NOT NULL AND position(lower($1) in lower(%I::text)) > 0',
    tbl, col, col, col, col
  ) USING old_code, new_code;
END;
$$;

CREATE OR REPLACE PROCEDURE pg_temp.rewrite_json(tbl text, col text, old_code text, new_code text)
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT pg_temp.column_exists(tbl, col) THEN
    RETURN;
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET %I = pg_temp.replace_json_code(%I, $1, $2) WHERE %I IS NOT NULL AND position(lower($1) in lower(%I::text)) > 0',
    tbl, col, col, col, col
  ) USING old_code, new_code;
END;
$$;

CREATE OR REPLACE PROCEDURE pg_temp.apply_code_renumber(old_code text, new_code text)
LANGUAGE plpgsql
AS $$
DECLARE
  spec_id text;
  next_id text;
BEGIN
  CALL pg_temp.rewrite_text('cylinders', 'sku', old_code, new_code);
  CALL pg_temp.rewrite_json('cylinders', 'press_marks', old_code, new_code);
  CALL pg_temp.rewrite_json('cylinders', 'changelogs', old_code, new_code);
  CALL pg_temp.rewrite_text('cylinders', 'artwork_url', old_code, new_code);
  CALL pg_temp.rewrite_text('cylinders', 'job_card_file_url', old_code, new_code);
  CALL pg_temp.rewrite_text('cylinders', 'job_card_file_name', old_code, new_code);

  CALL pg_temp.rewrite_text('job_masters', 'sku_code', old_code, new_code);
  CALL pg_temp.rewrite_text('job_masters', 'cylinder_sku', old_code, new_code);
  CALL pg_temp.rewrite_text('job_masters', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_json('job_masters', 'press_marks', old_code, new_code);
  CALL pg_temp.rewrite_json('job_masters', 'layers', old_code, new_code);
  CALL pg_temp.rewrite_json('job_masters', 'process_routing', old_code, new_code);
  CALL pg_temp.rewrite_text('job_masters', 'artwork_url', old_code, new_code);
  CALL pg_temp.rewrite_text('job_masters', 'job_card_file_url', old_code, new_code);
  CALL pg_temp.rewrite_text('job_masters', 'job_card_file_name', old_code, new_code);

  CALL pg_temp.rewrite_text('orders', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_json('orders', 'job_details', old_code, new_code);
  CALL pg_temp.rewrite_json('orders', 'raw_material_requirements', old_code, new_code);
  CALL pg_temp.rewrite_json('orders', 'sfg_consumptions', old_code, new_code);
  CALL pg_temp.rewrite_text('orders', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_text('orders', 'sku_code', old_code, new_code);

  CALL pg_temp.rewrite_text('order_confirmations', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_json('order_confirmations', 'payload', old_code, new_code);

  CALL pg_temp.rewrite_text('job_datasheets', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_text('job_datasheets', 'job_id', old_code, new_code);

  CALL pg_temp.rewrite_text('production_schedules', 'job_name', old_code, new_code);

  CALL pg_temp.rewrite_text('production_records', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_text('production_records', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'materials_list', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'process_logs', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'stages', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'item_remarks', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'output_rolls', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'rolls_breakdown', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'input_rolls_list', old_code, new_code);
  CALL pg_temp.rewrite_json('production_records', 'sfg_consumptions', old_code, new_code);

  CALL pg_temp.rewrite_json('sales_quotations', 'items', old_code, new_code);
  CALL pg_temp.rewrite_text('sales_quotations', 'comments', old_code, new_code);
  CALL pg_temp.rewrite_text('sales_quotations', 'cylinder_terms', old_code, new_code);

  CALL pg_temp.rewrite_text('inventory_rolls', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_text('sfg_goods', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_text('fg_goods', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_text('packing_list_consumptions', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_text('packing_list_consumptions', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_text('inventory_ledger_entries', 'job_code', old_code, new_code);
  CALL pg_temp.rewrite_text('inventory_ledger_entries', 'job_name', old_code, new_code);
  CALL pg_temp.rewrite_json('dispatch_shipments', 'payload', old_code, new_code);
  CALL pg_temp.rewrite_json('delivery_challans', 'payload', old_code, new_code);

  IF pg_temp.column_exists('job_card_specs', 'id') THEN
    FOR spec_id IN
      SELECT id FROM public.job_card_specs
      WHERE lower(id) = lower(old_code)
         OR lower(id) = lower('jobcard_' || old_code)
         OR (payload IS NOT NULL AND position(lower(old_code) IN lower(payload::text)) > 0)
    LOOP
      next_id := CASE
        WHEN lower(spec_id) = lower(old_code) THEN new_code
        WHEN lower(spec_id) = lower('jobcard_' || old_code) THEN 'jobcard_' || new_code
        ELSE spec_id
      END;
      IF next_id IS DISTINCT FROM spec_id AND EXISTS (
        SELECT 1 FROM public.job_card_specs WHERE id = next_id
      ) THEN
        RAISE NOTICE 'job_card_specs id % already exists; % keeps its id and its payload is updated', next_id, spec_id;
        next_id := spec_id;
      END IF;
      UPDATE public.job_card_specs
      SET id = next_id,
          payload = pg_temp.replace_json_code(payload, old_code, new_code)
      WHERE id = spec_id;
    END LOOP;
  END IF;
END;
$$;

DO $$
DECLARE
  pair record;
  renumber_prefix text;
  keep_prefix text;
  detail text;
  new_code text;
  old_code text;
  kept_code text;
  issued text[];
  left_at timestamptz;
  right_at timestamptz;
  has_left boolean;
  has_right boolean;
BEGIN
  ALTER TABLE public.cylinders DISABLE TRIGGER cylinders_guard_sku;

  FOR pair IN
    SELECT *
    FROM (VALUES
      (514::bigint, 'sku-2026', 'sku-cyl', 'keep the SKU-CYL code; renumber SKU-2026'),
      (421::bigint, 'cyl-2026', 'sku-cyl', 'keep the SKU-CYL code; renumber CYL-2026'),
      (425::bigint, 'cyl-2026', 'sku-cyl', 'keep the SKU-CYL code; renumber CYL-2026'),
      (426::bigint, 'cyl-2026', 'sku-cyl', 'keep the SKU-CYL code; renumber CYL-2026'),
      (427::bigint, 'cyl-2026', 'sku-cyl', 'keep the SKU-CYL code; renumber CYL-2026'),
      (428::bigint, 'cyl-2026', 'sku-cyl', 'keep the SKU-CYL code; renumber CYL-2026')
    ) AS rules(serial, renumber_prefix, keep_prefix, detail)
  LOOP
    SELECT EXISTS (SELECT 1 FROM pg_temp.side_codes(pair.renumber_prefix, pair.serial)) INTO has_left;
    SELECT EXISTS (SELECT 1 FROM pg_temp.side_codes(pair.keep_prefix, pair.serial)) INTO has_right;
    IF NOT has_left OR NOT has_right THEN
      RAISE NOTICE 'number % skipped; one side is already absent', pair.serial;
      CONTINUE;
    END IF;

    issued := public.allocate_cylinder_sku(1);
    new_code := issued[1];
    IF coalesce(btrim(new_code), '') = '' THEN
      RAISE EXCEPTION 'The database did not issue a replacement cylinder code';
    END IF;
    SELECT min(code) INTO kept_code FROM pg_temp.side_codes(pair.keep_prefix, pair.serial);

    FOR old_code IN
      SELECT DISTINCT code FROM pg_temp.side_codes(pair.renumber_prefix, pair.serial)
    LOOP
      CALL pg_temp.apply_code_renumber(old_code, new_code);
      INSERT INTO cylinder_sku_renumber_preview (shared_number, action, old_code, new_code, kept_code, detail)
      VALUES (pair.serial, 'renumber', old_code, new_code, kept_code, pair.detail);
    END LOOP;
  END LOOP;

  SELECT EXISTS (SELECT 1 FROM pg_temp.side_codes('cyl-2026', 420)) INTO has_left;
  SELECT EXISTS (SELECT 1 FROM pg_temp.side_codes('sku-2026', 420)) INTO has_right;
  IF has_left AND has_right THEN
    SELECT min(created_at) INTO left_at FROM pg_temp.side_codes('cyl-2026', 420);
    SELECT min(created_at) INTO right_at FROM pg_temp.side_codes('sku-2026', 420);
    IF left_at IS NOT NULL AND right_at IS NOT NULL AND left_at > right_at THEN
      renumber_prefix := 'cyl-2026';
      keep_prefix := 'sku-2026';
      detail := format(
        '420: earliest CYL-2026 created_at %s, earliest SKU-2026 created_at %s; CYL-2026 is newer and is renumbered',
        left_at::text,
        right_at::text
      );
    ELSIF left_at IS NOT NULL AND right_at IS NOT NULL AND right_at > left_at THEN
      renumber_prefix := 'sku-2026';
      keep_prefix := 'cyl-2026';
      detail := format(
        '420: earliest CYL-2026 created_at %s, earliest SKU-2026 created_at %s; SKU-2026 is newer and is renumbered',
        left_at::text,
        right_at::text
      );
    ELSE
      renumber_prefix := 'sku-2026';
      keep_prefix := 'cyl-2026';
      detail := format(
        '420: earliest CYL-2026 created_at %s, earliest SKU-2026 created_at %s; timestamps are missing or equal so SKU-2026 is renumbered',
        coalesce(left_at::text, 'none'),
        coalesce(right_at::text, 'none')
      );
    END IF;
    RAISE NOTICE '%', detail;

    issued := public.allocate_cylinder_sku(1);
    new_code := issued[1];
    IF coalesce(btrim(new_code), '') = '' THEN
      RAISE EXCEPTION 'The database did not issue a replacement cylinder code';
    END IF;
    SELECT min(code) INTO kept_code FROM pg_temp.side_codes(keep_prefix, 420);
    FOR old_code IN
      SELECT DISTINCT code FROM pg_temp.side_codes(renumber_prefix, 420)
    LOOP
      CALL pg_temp.apply_code_renumber(old_code, new_code);
      INSERT INTO cylinder_sku_renumber_preview (shared_number, action, old_code, new_code, kept_code, detail)
      VALUES (420, 'renumber', old_code, new_code, kept_code, detail);
    END LOOP;
  ELSE
    RAISE NOTICE 'number 420 skipped; one side is already absent';
  END IF;

  DELETE FROM private.cylinder_sku_reservations AS reserved
  WHERE private.normalize_cylinder_sku(reserved.sku) IN (
    SELECT private.normalize_cylinder_sku(preview.new_code)
    FROM cylinder_sku_renumber_preview AS preview
  );

  ALTER TABLE public.cylinders ENABLE TRIGGER cylinders_guard_sku;
END $$;

SELECT 'mapping' AS phase, shared_number, action, old_code, new_code, kept_code, detail
FROM cylinder_sku_renumber_preview
ORDER BY shared_number, old_code;

SELECT 'after' AS phase, source, id, code, created_at
FROM (
  SELECT 'cylinders.sku' AS source, c.id, c.sku AS code, c.created_at
  FROM public.cylinders c
  WHERE private.cylinder_sku_serial(c.sku) IN (514, 420, 421, 425, 426, 427, 428)
     OR c.sku IN (SELECT new_code FROM cylinder_sku_renumber_preview)
  UNION ALL
  SELECT 'job_masters.sku_code', j.id, j.sku_code, j.created_at
  FROM public.job_masters j
  WHERE private.cylinder_sku_serial(j.sku_code) IN (514, 420, 421, 425, 426, 427, 428)
     OR j.sku_code IN (SELECT new_code FROM cylinder_sku_renumber_preview)
  UNION ALL
  SELECT 'job_masters.cylinder_sku', j.id, j.cylinder_sku, j.created_at
  FROM public.job_masters j
  WHERE private.cylinder_sku_serial(j.cylinder_sku) IN (514, 420, 421, 425, 426, 427, 428)
     OR j.cylinder_sku IN (SELECT new_code FROM cylinder_sku_renumber_preview)
) AS after_rows
ORDER BY code, source, id;

ROLLBACK;
