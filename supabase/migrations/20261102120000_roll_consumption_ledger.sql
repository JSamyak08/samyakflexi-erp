-- Film rolls consumed when a print run ends, or entered on a production
-- record, were not posted to the item ledger.
--
-- record_print_run stored the substrate list on the order and did not
-- change inventory.stock_qty_kg. The Item Ledger is assembled in the app
-- from production_records.materials_list, and those lines carry a made-up
-- item id (or no stock item at all), so they never match the stock item.
-- A partly used roll's ...-BAL barcode was created in the browser before
-- the run was ended, and that return never became a ledger receipt.
--
-- This migration does not rewrite historical stock. The next end of a run,
-- or the next save of a production record, posts that document. Older
-- consumption is listed by scripts/backfill-roll-consumption-ledger.sql,
-- which is not applied here.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.inventory_ledger_entries (
  id text PRIMARY KEY,
  entry_kind text NOT NULL CHECK (entry_kind IN ('issue', 'balance_receipt')),
  scope_key text NOT NULL,
  stage text NOT NULL DEFAULT 'Printing',
  barcode text NOT NULL,
  parent_barcode text,
  balance_barcode text,
  stock_item_id text,
  order_id text,
  production_record_id text,
  job_name text,
  job_code text,
  qty_kg numeric NOT NULL DEFAULT 0,
  consumed_kg numeric,
  initial_kg numeric,
  balance_kg numeric,
  applied_stock_kg numeric NOT NULL DEFAULT 0,
  print_consumed numeric,
  print_initial numeric,
  record_consumed numeric,
  record_initial numeric,
  qty_source text,
  film_type text,
  micron numeric,
  width_mm numeric,
  item_name text,
  parent_available_before numeric,
  parent_status_before text,
  print_payload jsonb,
  record_payload jsonb,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.inventory_ledger_entries IS
  'One issue per job and roll, plus a balance-roll receipt when the roll is only partly used. Net quantity is the consumed weight. Saving the same run again updates these rows.';

CREATE INDEX IF NOT EXISTS inventory_ledger_entries_item_idx
  ON public.inventory_ledger_entries (stock_item_id);
CREATE INDEX IF NOT EXISTS inventory_ledger_entries_order_idx
  ON public.inventory_ledger_entries (order_id);
CREATE INDEX IF NOT EXISTS inventory_ledger_entries_record_idx
  ON public.inventory_ledger_entries (production_record_id);
CREATE INDEX IF NOT EXISTS inventory_ledger_entries_scope_idx
  ON public.inventory_ledger_entries (scope_key, entry_kind);

ALTER TABLE public.inventory_ledger_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('private.install_module_access(regclass, text[])') IS NOT NULL THEN
    PERFORM private.install_module_access(
      'public.inventory_ledger_entries'::regclass,
      ARRAY['inventory', 'production_records', 'printing_scheduler']
    );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_ledger_entries TO authenticated;

CREATE OR REPLACE FUNCTION private.json_number(p_obj jsonb, p_key text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw text;
BEGIN
  IF p_obj IS NULL OR jsonb_typeof(p_obj) IS DISTINCT FROM 'object' OR NOT (p_obj ? p_key) THEN
    RETURN NULL;
  END IF;
  raw := NULLIF(btrim(p_obj ->> p_key), '');
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.round_kg(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_value IS NULL THEN NULL ELSE round(p_value, 2) END;
$$;

CREATE OR REPLACE FUNCTION private.job_label_text(p_job_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(
    CASE
      WHEN position(' ||| ' IN coalesce(p_job_name, '')) > 0
        THEN substring(p_job_name FROM 1 FOR position(' ||| ' IN p_job_name) - 1)
      ELSE p_job_name
    END
  ), ''), '');
$$;

CREATE OR REPLACE FUNCTION private.roll_status_blocked(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(lower(btrim(coalesce(p_status, ''))), '[_-]+', ' ', 'g')
    IN ('deleted', 'written off', 'archived');
$$;

CREATE OR REPLACE FUNCTION private.roll_barcode_blocked(p_barcode text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  roll_status text;
  tombstone text;
BEGIN
  IF NULLIF(btrim(coalesce(p_barcode, '')), '') IS NULL THEN
    RETURN true;
  END IF;

  SELECT roll.status
    INTO roll_status
  FROM public.inventory_rolls AS roll
  WHERE lower(btrim(roll.barcode_id)) = lower(btrim(p_barcode))
  LIMIT 1;

  IF private.roll_status_blocked(roll_status) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.deleted_barcodes') IS NOT NULL THEN
    EXECUTE
      'SELECT status FROM public.deleted_barcodes WHERE lower(btrim(barcode)) = lower(btrim($1)) AND status IN (''Deleted'', ''Written Off'') LIMIT 1'
      INTO tombstone
      USING p_barcode;
    IF tombstone IS NOT NULL THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.film_item_match(
  p_film text,
  p_micron numeric,
  p_width numeric
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT item.id
  FROM public.inventory AS item
  WHERE NULLIF(btrim(coalesce(p_film, '')), '') IS NOT NULL
    AND lower(btrim(coalesce(item.film_type, ''))) = lower(btrim(p_film))
    AND (p_micron IS NULL OR item.micron IS NULL OR item.micron = p_micron)
    AND (p_width IS NULL OR item.width_mm IS NULL OR item.width_mm = p_width)
    AND COALESCE(item.category, 'Film Substrates') IN ('Film Substrates', 'Film', 'Raw Material (RM)', 'Lamination Films')
    AND COALESCE(item.is_active, true) IS TRUE
  ORDER BY COALESCE(item.stock_qty_kg, 0) DESC, item.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.resolve_roll_stock_item(
  p_barcode text,
  p_hint text,
  p_film text,
  p_micron numeric,
  p_width numeric,
  p_existing text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  roll_item text;
  hint_item text;
  spec_item text;
BEGIN
  IF p_existing IS NOT NULL AND EXISTS (SELECT 1 FROM public.inventory WHERE id = p_existing) THEN
    RETURN p_existing;
  END IF;

  SELECT roll.item_id
    INTO roll_item
  FROM public.inventory_rolls AS roll
  WHERE lower(btrim(roll.barcode_id)) = lower(btrim(coalesce(p_barcode, '')))
  LIMIT 1;

  IF roll_item IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inventory
    WHERE id = roll_item
      AND COALESCE(category, 'Film Substrates') IN ('Film Substrates', 'Film', 'Raw Material (RM)', 'Lamination Films')
  ) THEN
    RETURN roll_item;
  END IF;

  spec_item := private.film_item_match(p_film, p_micron, p_width);
  IF spec_item IS NOT NULL THEN
    RETURN spec_item;
  END IF;

  IF roll_item IS NOT NULL AND EXISTS (SELECT 1 FROM public.inventory WHERE id = roll_item) THEN
    RETURN roll_item;
  END IF;

  hint_item := NULLIF(btrim(coalesce(p_hint, '')), '');
  IF hint_item IS NOT NULL AND EXISTS (SELECT 1 FROM public.inventory WHERE id = hint_item) THEN
    RETURN hint_item;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.add_item_stock(p_item_id text, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.inventory%ROWTYPE;
  old_qty numeric;
  new_qty numeric;
  base_name text;
  payload jsonb;
  delim integer;
BEGIN
  IF p_item_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO row FROM public.inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  old_qty := COALESCE(row.stock_qty_kg, 0);
  new_qty := GREATEST(0, old_qty + p_delta);

  base_name := row.item_name;
  delim := position(' ||| ' IN COALESCE(row.item_name, ''));
  IF delim > 0 THEN
    base_name := substring(row.item_name FROM 1 FOR delim - 1);
    BEGIN
      payload := substring(row.item_name FROM delim + 5)::jsonb;
    EXCEPTION WHEN others THEN
      payload := NULL;
    END;
    IF jsonb_typeof(payload) = 'object' THEN
      payload := jsonb_set(payload, '{availableQtyKg}', to_jsonb(new_qty), true);
      base_name := base_name || ' ||| ' || payload::text;
    ELSE
      base_name := row.item_name;
    END IF;
  END IF;

  UPDATE public.inventory
  SET stock_qty_kg = new_qty,
      item_name = base_name,
      last_updated = pg_catalog.now()
  WHERE id = p_item_id;

  RETURN new_qty - old_qty;
END;
$$;

CREATE OR REPLACE FUNCTION private.issued_roll_status(p_stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce(p_stage, '') ILIKE '%lamination%' THEN 'Issued to Lamination'
    WHEN coalesce(p_stage, '') ILIKE '%print%' THEN 'Issued to Printing'
    ELSE 'Issued to Production'
  END;
$$;

CREATE OR REPLACE FUNCTION private.realize_roll_issue(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  entry public.inventory_ledger_entries%ROWTYPE;
  chosen_consumed numeric;
  chosen_initial numeric;
  chosen_payload jsonb;
  next_balance numeric;
  outward_kg numeric;
  item_id text;
  hint text;
  film text;
  micron numeric;
  width_mm numeric;
  item_label text;
  parent_barcode text;
  next_bal_code text;
  old_consumed numeric;
  old_applied numeric;
  delta numeric;
  moved numeric;
  existing_parent text;
  parent_status text;
  parent_available numeric;
  blocked boolean;
  issue_status text;
  receipt_id text;
BEGIN
  SELECT * INTO entry FROM public.inventory_ledger_entries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR entry.entry_kind IS DISTINCT FROM 'issue' THEN
    RETURN;
  END IF;

  IF entry.qty_source = 'print_run' AND entry.print_consumed IS NOT NULL THEN
    chosen_consumed := entry.print_consumed;
    chosen_initial := entry.print_initial;
    chosen_payload := entry.print_payload;
  ELSIF entry.qty_source = 'production_record' AND entry.record_consumed IS NOT NULL THEN
    chosen_consumed := entry.record_consumed;
    chosen_initial := entry.record_initial;
    chosen_payload := entry.record_payload;
  ELSE
    chosen_consumed := COALESCE(entry.record_consumed, entry.print_consumed);
    IF entry.record_consumed IS NOT NULL AND (entry.print_consumed IS NULL OR entry.qty_source = 'production_record') THEN
      chosen_initial := entry.record_initial;
      chosen_payload := entry.record_payload;
    ELSE
      chosen_initial := COALESCE(entry.print_initial, entry.record_initial);
      chosen_payload := COALESCE(entry.print_payload, entry.record_payload);
    END IF;
  END IF;

  old_consumed := COALESCE(entry.consumed_kg, 0);
  old_applied := COALESCE(entry.applied_stock_kg, 0);
  parent_barcode := entry.barcode;
  receipt_id := 'roll-return:' || entry.scope_key || ':' || lower(btrim(parent_barcode));

  IF entry.print_consumed IS NULL AND entry.record_consumed IS NULL OR COALESCE(chosen_consumed, 0) <= 0 THEN
    IF old_applied <> 0 AND entry.stock_item_id IS NOT NULL THEN
      PERFORM private.add_item_stock(entry.stock_item_id, old_applied);
    END IF;
    IF entry.parent_status_before IS NOT NULL AND NOT private.roll_barcode_blocked(parent_barcode) THEN
      UPDATE public.inventory_rolls
      SET available_weight_kg = COALESCE(entry.parent_available_before, available_weight_kg),
          status = entry.parent_status_before
      WHERE lower(btrim(barcode_id)) = lower(btrim(parent_barcode));
    END IF;
    IF entry.balance_barcode IS NOT NULL THEN
      UPDATE public.inventory_rolls
      SET available_weight_kg = 0,
          net_weight_kg = 0,
          status = 'Reversed'
      WHERE lower(btrim(barcode_id)) = lower(btrim(entry.balance_barcode))
        AND NOT private.roll_status_blocked(status);
    END IF;
    DELETE FROM public.inventory_ledger_entries WHERE id IN (entry.id, receipt_id);
    RETURN;
  END IF;

  chosen_consumed := private.round_kg(GREATEST(chosen_consumed, 0));
  chosen_initial := private.round_kg(COALESCE(chosen_initial, chosen_consumed));
  IF chosen_initial < chosen_consumed THEN
    chosen_initial := chosen_consumed;
  END IF;
  next_balance := private.round_kg(GREATEST(chosen_initial - chosen_consumed, 0));
  outward_kg := CASE WHEN next_balance > 0 THEN chosen_initial ELSE chosen_consumed END;
  next_bal_code := CASE WHEN next_balance > 0 THEN parent_barcode || '-BAL' ELSE NULL END;

  film := NULLIF(btrim(COALESCE(chosen_payload ->> 'filmType', entry.film_type, '')), '');
  micron := COALESCE(private.json_number(chosen_payload, 'micron'), entry.micron);
  width_mm := COALESCE(private.json_number(chosen_payload, 'widthMm'), entry.width_mm);
  hint := COALESCE(NULLIF(btrim(chosen_payload ->> 'itemId'), ''), NULLIF(btrim(chosen_payload ->> 'stockItemId'), ''));
  item_id := private.resolve_roll_stock_item(parent_barcode, hint, film, micron, width_mm, entry.stock_item_id);
  item_label := NULLIF(btrim(COALESCE(
    chosen_payload ->> 'itemName',
    entry.item_name,
    film || ' roll'
  )), '');

  delta := chosen_consumed - old_consumed;
  IF item_id IS NOT NULL AND delta > 0 THEN
    moved := private.add_item_stock(item_id, -delta);
    old_applied := old_applied + (-moved);
  ELSIF item_id IS NOT NULL AND delta < 0 THEN
    moved := LEAST(-delta, old_applied);
    PERFORM private.add_item_stock(item_id, moved);
    old_applied := old_applied - moved;
  ELSIF item_id IS NULL THEN
    old_applied := 0;
  END IF;

  blocked := private.roll_barcode_blocked(parent_barcode);
  IF NOT blocked THEN
    SELECT roll.barcode_id, roll.status, roll.available_weight_kg
      INTO existing_parent, parent_status, parent_available
    FROM public.inventory_rolls AS roll
    WHERE lower(btrim(roll.barcode_id)) = lower(btrim(parent_barcode))
    LIMIT 1;

    IF existing_parent IS NOT NULL THEN
      IF entry.parent_status_before IS NULL THEN
        entry.parent_status_before := parent_status;
        entry.parent_available_before := parent_available;
      END IF;
      issue_status := private.issued_roll_status(COALESCE(chosen_payload ->> 'stage', entry.stage));
      UPDATE public.inventory_rolls
      SET available_weight_kg = 0,
          status = issue_status,
          order_id = COALESCE(NULLIF(entry.order_id, ''), order_id),
          job_name = COALESCE(NULLIF(entry.job_name, ''), job_name)
      WHERE barcode_id = existing_parent;
    END IF;

    IF next_balance > 0 THEN
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, job_name, order_id,
        micron, width_mm, film_type, net_weight_kg, available_weight_kg, gross_weight_kg,
        status, qc_status, location_bay, inward_datetime, metadata
      )
      VALUES (
        next_bal_code,
        'RAW_MATERIAL',
        item_id,
        COALESCE(item_label, film, 'Film') || ' - Remaining Balance Roll',
        'Raw Material (RM)',
        entry.job_name,
        entry.order_id,
        micron,
        width_mm,
        film,
        next_balance,
        next_balance,
        next_balance,
        'In Stock (RM)',
        'Approved',
        'RM Store - Substrate Rolls',
        pg_catalog.now(),
        jsonb_build_object(
          'parentBarcodeId', parent_barcode,
          'orderId', entry.order_id,
          'jobName', entry.job_name,
          'stage', entry.stage,
          'balanceRoll', true
        )
      )
      ON CONFLICT (barcode_id) DO UPDATE
      SET item_id = COALESCE(EXCLUDED.item_id, public.inventory_rolls.item_id),
          item_name = EXCLUDED.item_name,
          film_type = COALESCE(EXCLUDED.film_type, public.inventory_rolls.film_type),
          micron = COALESCE(EXCLUDED.micron, public.inventory_rolls.micron),
          width_mm = COALESCE(EXCLUDED.width_mm, public.inventory_rolls.width_mm),
          net_weight_kg = EXCLUDED.net_weight_kg,
          available_weight_kg = EXCLUDED.available_weight_kg,
          gross_weight_kg = EXCLUDED.gross_weight_kg,
          status = 'In Stock (RM)',
          order_id = COALESCE(EXCLUDED.order_id, public.inventory_rolls.order_id),
          job_name = COALESCE(EXCLUDED.job_name, public.inventory_rolls.job_name),
          metadata = COALESCE(public.inventory_rolls.metadata, '{}'::jsonb) || EXCLUDED.metadata
      WHERE NOT private.roll_status_blocked(public.inventory_rolls.status);
    ELSIF entry.balance_barcode IS NOT NULL OR parent_barcode || '-BAL' IS NOT NULL THEN
      UPDATE public.inventory_rolls
      SET available_weight_kg = 0,
          net_weight_kg = 0,
          status = 'Consumed'
      WHERE lower(btrim(barcode_id)) = lower(btrim(COALESCE(entry.balance_barcode, parent_barcode || '-BAL')))
        AND NOT private.roll_status_blocked(status);
    END IF;
  END IF;

  UPDATE public.inventory_ledger_entries
  SET stock_item_id = item_id,
      qty_kg = outward_kg,
      consumed_kg = chosen_consumed,
      initial_kg = chosen_initial,
      balance_kg = next_balance,
      balance_barcode = next_bal_code,
      applied_stock_kg = old_applied,
      film_type = film,
      micron = micron,
      width_mm = width_mm,
      item_name = item_label,
      stage = COALESCE(NULLIF(chosen_payload ->> 'stage', ''), stage),
      parent_available_before = entry.parent_available_before,
      parent_status_before = entry.parent_status_before,
      updated_at = pg_catalog.now()
  WHERE id = entry.id;

  IF next_balance > 0 THEN
    INSERT INTO public.inventory_ledger_entries (
      id, entry_kind, scope_key, stage, barcode, parent_barcode, balance_barcode,
      stock_item_id, order_id, production_record_id, job_name, job_code,
      qty_kg, consumed_kg, balance_kg, applied_stock_kg,
      film_type, micron, width_mm, item_name, occurred_at, updated_at
    )
    VALUES (
      receipt_id, 'balance_receipt', entry.scope_key, COALESCE(NULLIF(chosen_payload ->> 'stage', ''), entry.stage),
      next_bal_code, entry.barcode, next_bal_code,
      item_id, entry.order_id, entry.production_record_id, entry.job_name, entry.job_code,
      next_balance, 0, next_balance, 0,
      film, micron, width_mm,
      COALESCE(item_label, film, 'Film') || ' - Remaining Balance Roll',
      COALESCE(entry.occurred_at, pg_catalog.now()) + interval '1 second',
      pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE
    SET qty_kg = EXCLUDED.qty_kg,
        balance_kg = EXCLUDED.balance_kg,
        barcode = EXCLUDED.barcode,
        stock_item_id = EXCLUDED.stock_item_id,
        order_id = EXCLUDED.order_id,
        production_record_id = EXCLUDED.production_record_id,
        job_name = EXCLUDED.job_name,
        job_code = EXCLUDED.job_code,
        stage = EXCLUDED.stage,
        film_type = EXCLUDED.film_type,
        micron = EXCLUDED.micron,
        width_mm = EXCLUDED.width_mm,
        item_name = EXCLUDED.item_name,
        updated_at = pg_catalog.now();
  ELSE
    DELETE FROM public.inventory_ledger_entries WHERE id = receipt_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_job_roll_issues(
  p_order_id text,
  p_record_id text,
  p_origin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  desired jsonb := '[]'::jsonb;
  elem jsonb;
  roll jsonb;
  logs jsonb;
  order_row public.orders%ROWTYPE;
  record_row public.production_records%ROWTYPE;
  has_record boolean := false;
  active_run boolean := false;
  scope_key text;
  stage text;
  barcode text;
  consumed numeric;
  initial_kg numeric;
  returned numeric;
  issued numeric;
  payload jsonb;
  key text;
  existing_id text;
  affected text[] := ARRAY[]::text[];
  idx integer;
  balance_rows jsonb;
  job_name text;
  job_code text;
  occurred timestamptz;
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NOT NULL AND auth.uid() IS NOT NULL THEN
    IF NOT private.can_any(ARRAY['printing_scheduler', 'production_records', 'inventory']::text[]) THEN
      RAISE EXCEPTION 'Not allowed to post roll consumption'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_origin = 'production_record_delete' THEN
    FOR existing_id IN
      SELECT id FROM public.inventory_ledger_entries
      WHERE entry_kind = 'issue' AND production_record_id = p_record_id
    LOOP
      UPDATE public.inventory_ledger_entries
      SET record_consumed = NULL,
          record_initial = NULL,
          record_payload = NULL,
          qty_source = CASE WHEN print_consumed IS NOT NULL THEN 'print_run' ELSE qty_source END
      WHERE id = existing_id;
      affected := array_append(affected, existing_id);
    END LOOP;
  ELSE
    IF p_order_id IS NOT NULL THEN
      SELECT * INTO order_row FROM public.orders WHERE id = p_order_id;
      IF FOUND AND to_regprocedure('public.order_print_run_is_active(text, timestamptz, timestamptz)') IS NOT NULL THEN
        active_run := public.order_print_run_is_active(order_row.printing_status, order_row.printing_start_time, order_row.printing_end_time);
      ELSIF FOUND THEN
        active_run := order_row.printing_end_time IS NULL AND order_row.printing_start_time IS NOT NULL
          AND lower(btrim(coalesce(order_row.printing_status, ''))) NOT IN ('completed', 'cancelled', 'canceled');
      END IF;
    END IF;

    IF p_record_id IS NOT NULL AND p_origin = 'production_record' THEN
      SELECT * INTO record_row FROM public.production_records WHERE id = p_record_id;
      has_record := FOUND;
    END IF;

    job_name := private.job_label_text(COALESCE(record_row.job_name, order_row.job_name));
    job_code := NULLIF(btrim(COALESCE(record_row.job_code, order_row.job_details ->> 'jobCode', '')), '');
    occurred := COALESCE(order_row.printing_end_time, record_row.recorded_at, pg_catalog.now());
    scope_key := CASE
      WHEN NULLIF(btrim(COALESCE(p_order_id, record_row.order_id, '')), '') IS NOT NULL
        THEN 'ord:' || COALESCE(NULLIF(btrim(p_order_id), ''), record_row.order_id)
      ELSE 'rec:' || p_record_id
    END;

    IF p_origin = 'print_run' AND order_row.id IS NOT NULL THEN
      IF order_row.printing_end_time IS NULL
         OR lower(btrim(COALESCE(order_row.printing_status, ''))) IS DISTINCT FROM 'completed'
      THEN
        RETURN '[]'::jsonb;
      END IF;
      FOR elem IN
        SELECT value FROM jsonb_array_elements(COALESCE(order_row.job_details -> 'inputRollsList', '[]'::jsonb))
      LOOP
        barcode := NULLIF(btrim(COALESCE(elem ->> 'barcodeId', elem ->> 'barcode', '')), '');
        consumed := COALESCE(private.json_number(elem, 'consumedWeightKg'), private.json_number(elem, 'consumedKg'));
        initial_kg := COALESCE(private.json_number(elem, 'initialWeightKg'), private.json_number(elem, 'initialKg'), private.json_number(elem, 'netWeightKg'));
        IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
          CONTINUE;
        END IF;
        IF private.roll_barcode_blocked(barcode) THEN
          CONTINUE;
        END IF;
        IF lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' THEN
          CONTINUE;
        END IF;
        payload := elem || jsonb_build_object('stage', 'Printing', 'barcode', barcode);
        desired := (
          SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
          FROM jsonb_array_elements(desired) AS item
          WHERE lower(item ->> 'barcode') IS DISTINCT FROM lower(barcode)
        ) || jsonb_build_array(jsonb_build_object(
          'barcode', barcode,
          'stage', 'Printing',
          'consumed', private.round_kg(consumed),
          'initial', private.round_kg(COALESCE(initial_kg, consumed)),
          'payload', payload
        ));
      END LOOP;
    END IF;

    IF has_record THEN
      logs := COALESCE(record_row.sfg_consumptions, record_row.process_logs -> 'sfgConsumptions', '[]'::jsonb);
      IF jsonb_typeof(logs) IS DISTINCT FROM 'array' THEN
        logs := '[]'::jsonb;
      END IF;

      FOR elem IN
        SELECT value FROM jsonb_array_elements(COALESCE(record_row.input_rolls_list, '[]'::jsonb))
      LOOP
        barcode := NULLIF(btrim(COALESCE(elem ->> 'barcodeId', elem ->> 'barcode', '')), '');
        consumed := COALESCE(private.json_number(elem, 'consumedWeightKg'), private.json_number(elem, 'consumedKg'));
        initial_kg := COALESCE(private.json_number(elem, 'initialWeightKg'), private.json_number(elem, 'initialKg'), private.json_number(elem, 'netWeightKg'));
        IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
          CONTINUE;
        END IF;
        IF active_run AND p_origin IS DISTINCT FROM 'print_run' THEN
          CONTINUE;
        END IF;
        IF private.roll_barcode_blocked(barcode) OR lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' THEN
          CONTINUE;
        END IF;
        payload := elem || jsonb_build_object('stage', 'Printing', 'barcode', barcode);
        desired := (
          SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
          FROM jsonb_array_elements(desired) AS item
          WHERE lower(item ->> 'barcode') IS DISTINCT FROM lower(barcode)
        ) || jsonb_build_array(jsonb_build_object(
          'barcode', barcode,
          'stage', 'Printing',
          'consumed', private.round_kg(consumed),
          'initial', private.round_kg(COALESCE(initial_kg, consumed)),
          'payload', payload
        ));
      END LOOP;

      FOR elem IN
        SELECT value FROM jsonb_array_elements(COALESCE(record_row.materials_list, '[]'::jsonb))
      LOOP
        barcode := NULLIF(btrim(COALESCE(elem ->> 'barcode', elem ->> 'barcodeId', '')), '');
        returned := COALESCE(private.json_number(elem, 'returnQtyKg'), 0);
        issued := COALESCE(private.json_number(elem, 'issueQtyKg'), private.json_number(elem, 'netConsumedQtyKg'));
        consumed := COALESCE(private.json_number(elem, 'netConsumedQtyKg'), private.json_number(elem, 'consumedWeightKg'));
        IF consumed IS NULL AND issued IS NOT NULL THEN
          consumed := GREATEST(issued - returned, 0);
        END IF;
        initial_kg := COALESCE(private.json_number(elem, 'initialWeightKg'), private.json_number(elem, 'initialKg'));
        IF initial_kg IS NULL AND consumed IS NOT NULL THEN
          initial_kg := consumed + GREATEST(returned, 0);
        END IF;
        stage := COALESCE(NULLIF(btrim(elem ->> 'stage'), ''), NULLIF(btrim(elem ->> 'targetProcess'), ''));
        IF stage IS NULL THEN
          IF COALESCE(elem ->> 'ledgerSource', '') = 'printing-input-roll' OR COALESCE(elem ->> 'itemName', '') ILIKE '%input substrate%' THEN
            stage := 'Printing';
          ELSIF COALESCE(elem ->> 'itemName', '') ILIKE '%substrate 3%' THEN
            stage := 'Lamination (Pass 2)';
          ELSIF COALESCE(elem ->> 'itemName', '') ILIKE '%substrate 2%' OR COALESCE(elem ->> 'ledgerSource', '') = 'lamination-substrate' THEN
            stage := COALESCE(NULLIF(btrim(elem ->> 'stage'), ''), 'Lamination (Pass 1)');
          ELSE
            stage := 'Production';
          END IF;
        END IF;
        IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
          CONTINUE;
        END IF;
        IF lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' OR lower(barcode) LIKE 'mat-%' THEN
          CONTINUE;
        END IF;
        IF private.roll_barcode_blocked(barcode) THEN
          CONTINUE;
        END IF;
        IF active_run AND (
          stage = 'Printing'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(order_row.job_details -> 'inputRollsList', '[]'::jsonb)) AS active_roll
            WHERE lower(btrim(COALESCE(active_roll ->> 'barcodeId', active_roll ->> 'barcode', ''))) = lower(barcode)
          )
        ) THEN
          CONTINUE;
        END IF;
        IF EXISTS (
          SELECT 1 FROM jsonb_array_elements(desired) AS item
          WHERE lower(item ->> 'barcode') = lower(barcode)
        ) THEN
          CONTINUE;
        END IF;
        payload := elem || jsonb_build_object('stage', stage, 'barcode', barcode);
        desired := desired || jsonb_build_array(jsonb_build_object(
          'barcode', barcode,
          'stage', stage,
          'consumed', private.round_kg(consumed),
          'initial', private.round_kg(COALESCE(initial_kg, consumed)),
          'payload', payload
        ));
      END LOOP;

      FOR elem IN SELECT value FROM jsonb_array_elements(logs)
      LOOP
        FOR roll IN
          SELECT value
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(elem -> 'substrate2Rolls') = 'array' AND jsonb_array_length(elem -> 'substrate2Rolls') > 0
                THEN elem -> 'substrate2Rolls'
              WHEN jsonb_typeof(elem -> 'substrate2') = 'object' THEN jsonb_build_array(elem -> 'substrate2')
              ELSE '[]'::jsonb
            END
          )
        LOOP
          stage := COALESCE(NULLIF(btrim(elem ->> 'targetProcess'), ''), 'Lamination (Pass 1)');
          barcode := NULLIF(btrim(COALESCE(roll ->> 'barcode', roll ->> 'barcodeId', '')), '');
          consumed := COALESCE(private.json_number(roll, 'consumedKg'), private.json_number(roll, 'consumedWeightKg'));
          initial_kg := COALESCE(private.json_number(roll, 'initialKg'), private.json_number(roll, 'initialWeightKg'));
          IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 OR private.roll_barcode_blocked(barcode) THEN
            CONTINUE;
          END IF;
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(desired) AS item
            WHERE lower(item ->> 'barcode') = lower(barcode)
          ) THEN
            CONTINUE;
          END IF;
          payload := roll || jsonb_build_object('stage', stage, 'barcode', barcode);
          desired := desired || jsonb_build_array(jsonb_build_object(
            'barcode', barcode,
            'stage', stage,
            'consumed', private.round_kg(consumed),
            'initial', private.round_kg(COALESCE(initial_kg, consumed)),
            'payload', payload
          ));
        END LOOP;
        FOR roll IN
          SELECT value
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(elem -> 'substrate3Rolls') = 'array' AND jsonb_array_length(elem -> 'substrate3Rolls') > 0
                THEN elem -> 'substrate3Rolls'
              WHEN jsonb_typeof(elem -> 'substrate3') = 'object' THEN jsonb_build_array(elem -> 'substrate3')
              ELSE '[]'::jsonb
            END
          )
        LOOP
          stage := COALESCE(NULLIF(btrim(elem ->> 'targetProcess'), ''), 'Lamination (Pass 2)');
          barcode := NULLIF(btrim(COALESCE(roll ->> 'barcode', roll ->> 'barcodeId', '')), '');
          consumed := COALESCE(private.json_number(roll, 'consumedKg'), private.json_number(roll, 'consumedWeightKg'));
          initial_kg := COALESCE(private.json_number(roll, 'initialKg'), private.json_number(roll, 'initialWeightKg'));
          IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 OR private.roll_barcode_blocked(barcode) THEN
            CONTINUE;
          END IF;
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(desired) AS item
            WHERE lower(item ->> 'barcode') = lower(barcode)
          ) THEN
            CONTINUE;
          END IF;
          payload := roll || jsonb_build_object('stage', stage, 'barcode', barcode);
          desired := desired || jsonb_build_array(jsonb_build_object(
            'barcode', barcode,
            'stage', stage,
            'consumed', private.round_kg(consumed),
            'initial', private.round_kg(COALESCE(initial_kg, consumed)),
            'payload', payload
          ));
        END LOOP;
      END LOOP;
    END IF;

    FOR elem IN SELECT value FROM jsonb_array_elements(desired)
    LOOP
      barcode := elem ->> 'barcode';
      stage := elem ->> 'stage';
      key := 'roll-issue:' || scope_key || ':' || lower(btrim(barcode));
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, order_id, production_record_id,
        job_name, job_code, qty_kg, consumed_kg, applied_stock_kg, occurred_at,
        print_consumed, print_initial, print_payload, record_consumed, record_initial, record_payload, qty_source
      )
      VALUES (
        key, 'issue', scope_key, stage, barcode,
        NULLIF(btrim(COALESCE(p_order_id, record_row.order_id, '')), ''),
        CASE WHEN p_origin = 'production_record' THEN p_record_id ELSE NULL END,
        job_name, job_code, 0, 0, 0, occurred,
        CASE WHEN p_origin = 'print_run' THEN (elem ->> 'consumed')::numeric ELSE NULL END,
        CASE WHEN p_origin = 'print_run' THEN (elem ->> 'initial')::numeric ELSE NULL END,
        CASE WHEN p_origin = 'print_run' THEN elem -> 'payload' ELSE NULL END,
        CASE WHEN p_origin = 'production_record' THEN (elem ->> 'consumed')::numeric ELSE NULL END,
        CASE WHEN p_origin = 'production_record' THEN (elem ->> 'initial')::numeric ELSE NULL END,
        CASE WHEN p_origin = 'production_record' THEN elem -> 'payload' ELSE NULL END,
        p_origin
      )
      ON CONFLICT (id) DO UPDATE
      SET stage = EXCLUDED.stage,
          order_id = COALESCE(EXCLUDED.order_id, public.inventory_ledger_entries.order_id),
          production_record_id = CASE
            WHEN p_origin = 'production_record' THEN EXCLUDED.production_record_id
            ELSE public.inventory_ledger_entries.production_record_id
          END,
          job_name = COALESCE(NULLIF(EXCLUDED.job_name, ''), public.inventory_ledger_entries.job_name),
          job_code = COALESCE(EXCLUDED.job_code, public.inventory_ledger_entries.job_code),
          occurred_at = COALESCE(EXCLUDED.occurred_at, public.inventory_ledger_entries.occurred_at),
          print_consumed = CASE WHEN p_origin = 'print_run' THEN EXCLUDED.print_consumed ELSE public.inventory_ledger_entries.print_consumed END,
          print_initial = CASE WHEN p_origin = 'print_run' THEN EXCLUDED.print_initial ELSE public.inventory_ledger_entries.print_initial END,
          print_payload = CASE WHEN p_origin = 'print_run' THEN EXCLUDED.print_payload ELSE public.inventory_ledger_entries.print_payload END,
          record_consumed = CASE WHEN p_origin = 'production_record' THEN EXCLUDED.record_consumed ELSE public.inventory_ledger_entries.record_consumed END,
          record_initial = CASE WHEN p_origin = 'production_record' THEN EXCLUDED.record_initial ELSE public.inventory_ledger_entries.record_initial END,
          record_payload = CASE WHEN p_origin = 'production_record' THEN EXCLUDED.record_payload ELSE public.inventory_ledger_entries.record_payload END,
          qty_source = p_origin,
          updated_at = pg_catalog.now();
      affected := array_append(affected, key);
    END LOOP;

    IF p_origin = 'print_run' THEN
      FOR existing_id IN
        SELECT issue.id
        FROM public.inventory_ledger_entries AS issue
        WHERE issue.entry_kind = 'issue'
          AND issue.order_id = p_order_id
          AND issue.print_consumed IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(desired) AS item
            WHERE lower(item ->> 'barcode') = lower(issue.barcode)
              AND item ->> 'stage' = 'Printing'
          )
          AND NOT private.roll_barcode_blocked(issue.barcode)
      LOOP
        UPDATE public.inventory_ledger_entries
        SET print_consumed = NULL,
            print_initial = NULL,
            print_payload = NULL,
            qty_source = CASE WHEN record_consumed IS NOT NULL THEN 'production_record' ELSE qty_source END
        WHERE id = existing_id;
        affected := array_append(affected, existing_id);
      END LOOP;
    ELSIF p_origin = 'production_record' THEN
      FOR existing_id IN
        SELECT issue.id
        FROM public.inventory_ledger_entries AS issue
        WHERE issue.entry_kind = 'issue'
          AND issue.production_record_id = p_record_id
          AND issue.record_consumed IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(desired) AS item
            WHERE lower(item ->> 'barcode') = lower(issue.barcode)
          )
          AND NOT private.roll_barcode_blocked(issue.barcode)
      LOOP
        UPDATE public.inventory_ledger_entries
        SET record_consumed = NULL,
            record_initial = NULL,
            record_payload = NULL,
            qty_source = CASE WHEN print_consumed IS NOT NULL THEN 'print_run' ELSE qty_source END
        WHERE id = existing_id;
        affected := array_append(affected, existing_id);
      END LOOP;
    END IF;
  END IF;

  IF affected IS NOT NULL THEN
    FOREACH existing_id IN ARRAY affected LOOP
      PERFORM private.realize_roll_issue(existing_id);
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', receipt.barcode,
    'barcodeId', receipt.barcode,
    'parentBarcodeId', receipt.parent_barcode,
    'netWeightKg', receipt.qty_kg,
    'availableWeightKg', receipt.qty_kg,
    'grossWeightKg', receipt.qty_kg,
    'filmType', receipt.film_type,
    'micron', receipt.micron,
    'widthMm', receipt.width_mm,
    'itemName', receipt.item_name,
    'itemId', receipt.stock_item_id,
    'orderId', receipt.order_id,
    'jobName', receipt.job_name,
    'stage', receipt.stage,
    'status', 'In Stock (RM)',
    'rollType', 'RAW_MATERIAL',
    'category', 'Raw Material (RM)',
    'unit', 'Kg'
  ) ORDER BY receipt.barcode), '[]'::jsonb)
  INTO balance_rows
  FROM public.inventory_ledger_entries AS receipt
  WHERE receipt.entry_kind = 'balance_receipt'
    AND (
      (p_origin = 'print_run' AND receipt.order_id = p_order_id AND receipt.stage = 'Printing')
      OR (p_origin IN ('production_record', 'production_record_delete') AND receipt.production_record_id = p_record_id)
    );

  RETURN COALESCE(balance_rows, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_production_record_roll_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.sync_job_roll_issues(OLD.order_id, OLD.id, 'production_record_delete');
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.materials_list IS NOT DISTINCT FROM NEW.materials_list
     AND OLD.input_rolls_list IS NOT DISTINCT FROM NEW.input_rolls_list
     AND OLD.process_logs IS NOT DISTINCT FROM NEW.process_logs
     AND OLD.sfg_consumptions IS NOT DISTINCT FROM NEW.sfg_consumptions
     AND OLD.order_id IS NOT DISTINCT FROM NEW.order_id
     AND OLD.job_name IS NOT DISTINCT FROM NEW.job_name
     AND OLD.job_code IS NOT DISTINCT FROM NEW.job_code
  THEN
    RETURN NEW;
  END IF;

  PERFORM private.sync_job_roll_issues(NEW.order_id, NEW.id, 'production_record');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_record_roll_ledger ON public.production_records;
CREATE TRIGGER production_record_roll_ledger
  AFTER INSERT OR DELETE OR UPDATE OF materials_list, input_rolls_list, process_logs, sfg_consumptions, order_id, job_name, job_code
  ON public.production_records
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_production_record_roll_ledger();

REVOKE ALL ON FUNCTION private.json_number(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.round_kg(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.job_label_text(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.roll_status_blocked(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.roll_barcode_blocked(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.film_item_match(text, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.resolve_roll_stock_item(text, text, text, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.add_item_stock(text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.issued_roll_status(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.realize_roll_issue(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.sync_job_roll_issues(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.trg_production_record_roll_ledger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sync_job_roll_issues(text, text, text) TO authenticated;

-- Ending a run posts roll issues in the same transaction. Progress and start do not.
CREATE OR REPLACE FUNCTION public.record_print_run(
  p_order_id text,
  p_action text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  row public.orders;
  details jsonb;
  envelope jsonb;
  name_base text;
  raw_env text;
  delim_at integer;
  manual boolean;
  next_status text;
  next_printing_status text;
  start_time timestamptz;
  end_time timestamptz;
  duration_minutes numeric;
  meters numeric;
  output_kg numeric;
  next_ink_gsm numeric;
  close_key text;
  printing_done boolean;
  close_keys text[] := ARRAY[
    'closeMode', 'closedBy', 'closedAt', 'closeReason',
    'overDispatchWarning', 'reopenedBy', 'reopenedAt', 'reopenReason'
  ];
  balance_rolls jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a print run'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('start', 'end', 'progress') THEN
    RAISE EXCEPTION 'Unknown print run action'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  manual := public.order_is_manually_closed(row.close_mode, row.job_details);
  details := COALESCE(row.job_details, '{}'::jsonb);
  p_patch := COALESCE(p_patch, '{}'::jsonb);

  IF p_action = 'start' THEN
    next_printing_status := 'In Production';
    BEGIN
      start_time := COALESCE(NULLIF(p_patch->>'printingStartTime', '')::timestamptz, now());
    EXCEPTION WHEN others THEN
      start_time := COALESCE(row.printing_start_time, now());
    END;
    end_time := NULL;
    duration_minutes := NULL;
  ELSIF p_action = 'end' THEN
    next_printing_status := 'Completed';
    start_time := row.printing_start_time;
    BEGIN
      IF NULLIF(p_patch->>'printingStartTime', '') IS NOT NULL THEN
        start_time := NULLIF(p_patch->>'printingStartTime', '')::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      start_time := row.printing_start_time;
    END;
    BEGIN
      end_time := COALESCE(NULLIF(p_patch->>'printingEndTime', '')::timestamptz, now());
    EXCEPTION WHEN others THEN
      end_time := now();
    END;
    BEGIN
      duration_minutes := NULLIF(p_patch->>'printingDurationMinutes', '')::numeric;
    EXCEPTION WHEN others THEN
      duration_minutes := row.printing_duration_minutes;
    END;
  ELSE
    next_printing_status := COALESCE(NULLIF(details->>'printingStatus', ''), row.printing_status, 'In Production');
    start_time := row.printing_start_time;
    end_time := row.printing_end_time;
    duration_minutes := row.printing_duration_minutes;
  END IF;

  BEGIN
    meters := CASE
      WHEN p_patch ? 'actualMetersPrinted' THEN NULLIF(p_patch->>'actualMetersPrinted', '')::numeric
      ELSE row.actual_meters_printed
    END;
  EXCEPTION WHEN others THEN
    meters := row.actual_meters_printed;
  END;
  BEGIN
    output_kg := CASE
      WHEN p_patch ? 'printedOutputKg' THEN NULLIF(p_patch->>'printedOutputKg', '')::numeric
      ELSE row.printed_output_kg
    END;
  EXCEPTION WHEN others THEN
    output_kg := row.printed_output_kg;
  END;
  BEGIN
    next_ink_gsm := CASE
      WHEN p_patch ? 'inkGsmInSpeed' THEN NULLIF(p_patch->>'inkGsmInSpeed', '')::numeric
      ELSE row.ink_gsm_in_speed
    END;
  EXCEPTION WHEN others THEN
    next_ink_gsm := row.ink_gsm_in_speed;
  END;

  printing_done := CASE
    WHEN p_action = 'end' THEN true
    WHEN p_action = 'start' THEN false
    ELSE COALESCE(row.job_details->>'isPrintingCompleted', '') = 'true'
  END;

  details := jsonb_set(details, '{printingStatus}', to_jsonb(next_printing_status), true);
  details := jsonb_set(details, '{isPrintingCompleted}', to_jsonb(printing_done), true);
  IF start_time IS NOT NULL THEN
    details := jsonb_set(details, '{printingStartTime}', to_jsonb(start_time), true);
  ELSIF p_action = 'start' THEN
    details := details - 'printingStartTime';
  END IF;
  IF p_action = 'start' THEN
    details := details - 'printingEndTime';
  ELSIF end_time IS NOT NULL THEN
    details := jsonb_set(details, '{printingEndTime}', to_jsonb(end_time), true);
  END IF;
  IF p_patch ? 'machineId' THEN
    details := jsonb_set(details, '{machineId}', COALESCE(p_patch->'machineId', 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'inputRollsList' AND jsonb_typeof(p_patch->'inputRollsList') = 'array' THEN
    details := jsonb_set(details, '{inputRollsList}', p_patch->'inputRollsList', true);
  END IF;
  IF p_patch ? 'actualMetersPrinted' THEN
    details := jsonb_set(details, '{actualMetersPrinted}', COALESCE(to_jsonb(meters), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printedOutputKg' THEN
    details := jsonb_set(details, '{printedOutputKg}', COALESCE(to_jsonb(output_kg), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'inkGsmInSpeed' THEN
    details := jsonb_set(details, '{inkGsmInSpeed}', COALESCE(to_jsonb(next_ink_gsm), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printingNotes' THEN
    details := jsonb_set(details, '{printingNotes}', COALESCE(p_patch->'printingNotes', 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printingDurationMinutes' THEN
    details := jsonb_set(details, '{printingDurationMinutes}', COALESCE(to_jsonb(duration_minutes), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printingDurationFormatted' THEN
    details := jsonb_set(details, '{printingDurationFormatted}', COALESCE(p_patch->'printingDurationFormatted', 'null'::jsonb), true);
  END IF;
  IF p_action = 'end' AND p_patch ? 'nextProcess' THEN
    details := jsonb_set(details, '{nextProcess}', COALESCE(p_patch->'nextProcess', 'null'::jsonb), true);
  END IF;

  FOREACH close_key IN ARRAY close_keys LOOP
    IF row.job_details ? close_key THEN
      details := jsonb_set(details, ARRAY[close_key], row.job_details -> close_key, true);
    ELSE
      details := details - close_key;
    END IF;
  END LOOP;

  IF NOT manual
     AND p_action IN ('start', 'end')
     AND lower(btrim(COALESCE(row.status, ''))) NOT IN ('cancelled', 'canceled', 'on hold') THEN
    next_status := 'In Production';
  ELSE
    next_status := row.status;
  END IF;

  delim_at := position(' ||| ' IN COALESCE(row.job_name, ''));
  IF delim_at > 0 THEN
    name_base := substring(row.job_name FROM 1 FOR delim_at - 1);
    raw_env := substring(row.job_name FROM delim_at + 5);
  ELSE
    name_base := COALESCE(row.job_name, '');
    raw_env := '';
  END IF;
  BEGIN
    envelope := CASE WHEN raw_env = '' THEN '{}'::jsonb ELSE raw_env::jsonb END;
  EXCEPTION WHEN others THEN
    envelope := '{}'::jsonb;
  END;
  IF jsonb_typeof(envelope) IS DISTINCT FROM 'object' THEN
    envelope := '{}'::jsonb;
  END IF;
  envelope := jsonb_set(envelope, '{jobDetails}', details, true);
  envelope := jsonb_set(envelope, '{printingStatus}', to_jsonb(next_printing_status), true);
  envelope := jsonb_set(envelope, '{isPrintingCompleted}', to_jsonb(printing_done), true);
  IF p_patch ? 'inputRollsList' AND jsonb_typeof(p_patch->'inputRollsList') = 'array' THEN
    envelope := jsonb_set(envelope, '{inputRollsList}', p_patch->'inputRollsList', true);
  END IF;
  IF p_patch ? 'machineId' THEN
    envelope := jsonb_set(envelope, '{machineId}', COALESCE(p_patch->'machineId', 'null'::jsonb), true);
  END IF;

  UPDATE public.orders
  SET
    status = next_status,
    printing_status = next_printing_status,
    printing_start_time = CASE WHEN p_action = 'progress' THEN row.printing_start_time ELSE start_time END,
    printing_end_time = CASE WHEN p_action = 'progress' THEN row.printing_end_time WHEN p_action = 'start' THEN NULL ELSE end_time END,
    printing_duration_minutes = CASE WHEN p_action = 'end' THEN duration_minutes ELSE row.printing_duration_minutes END,
    printing_duration_formatted = CASE
      WHEN p_action = 'end' AND p_patch ? 'printingDurationFormatted' THEN NULLIF(p_patch->>'printingDurationFormatted', '')
      ELSE row.printing_duration_formatted
    END,
    actual_meters_printed = CASE WHEN p_patch ? 'actualMetersPrinted' THEN meters ELSE row.actual_meters_printed END,
    printed_output_kg = CASE WHEN p_patch ? 'printedOutputKg' THEN output_kg ELSE row.printed_output_kg END,
    ink_gsm_in_speed = CASE WHEN p_patch ? 'inkGsmInSpeed' THEN next_ink_gsm ELSE row.ink_gsm_in_speed END,
    printing_notes = CASE
      WHEN p_patch ? 'printingNotes' THEN NULLIF(p_patch->>'printingNotes', '')
      ELSE row.printing_notes
    END,
    machine_id = CASE
      WHEN p_patch ? 'machineId' THEN NULLIF(p_patch->>'machineId', '')
      ELSE row.machine_id
    END,
    job_master_id = CASE
      WHEN COALESCE(p_patch->>'jobMasterId', '') <> '' THEN p_patch->>'jobMasterId'
      ELSE row.job_master_id
    END,
    job_details = details,
    job_name = name_base || ' ||| ' || envelope::text
  WHERE id = p_order_id
  RETURNING * INTO row;

  PERFORM private.log_print_run_event(
    p_action,
    row.id,
    NULLIF(btrim(row.machine_id), ''),
    row.job_name,
    row.printing_start_time,
    row.printing_end_time,
    NULLIF(row.job_details ->> 'nextProcess', '')
  );

  IF p_action = 'end' THEN
    balance_rolls := private.sync_job_roll_issues(row.id, NULL, 'print_run');
  END IF;

  RETURN jsonb_build_object(
    'id', row.id,
    'status', row.status,
    'closeMode', row.close_mode,
    'printingStatus', row.printing_status,
    'printingStartTime', row.printing_start_time,
    'printingEndTime', row.printing_end_time,
    'isPrintingCompleted', COALESCE(row.job_details->>'isPrintingCompleted', '') = 'true',
    'machineId', row.machine_id,
    'actualMetersPrinted', row.actual_meters_printed,
    'printedOutputKg', row.printed_output_kg,
    'inkGsmInSpeed', row.ink_gsm_in_speed,
    'printingNotes', row.printing_notes,
    'nextProcess', row.job_details->>'nextProcess',
    'inputRollsList', COALESCE(row.job_details->'inputRollsList', '[]'::jsonb),
    'balanceRolls', COALESCE(balance_rolls, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_print_run(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_print_run(text, text, jsonb) TO authenticated;

