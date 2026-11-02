-- Historical edits of a production record must not post consumption that this
-- trigger never posted. 20261102120000 may already be applied, so this
-- migration replaces the posting functions instead of editing that file.
--
-- An insert posts the record's rolls. An update posts only lines added since
-- the previous save, and lines this trigger already posted or warned about
-- for that record. Re-saving the same lines posts nothing more. Deleting a
-- line reverses only the ledger row this trigger posted for that record and
-- line. Lines that were already on the record, with no ledger row, stay
-- unposted.
--
-- A roll is posted only when its barcode or an explicit item id matches
-- exactly one inventory item. Micron and width are not wildcards, and the
-- item with the most stock is not a match. Anything else posts nothing and
-- leaves an open row in roll_consumption_exceptions.

ALTER TABLE public.inventory_ledger_entries
  ADD COLUMN IF NOT EXISTS line_key text;

COMMENT ON COLUMN public.inventory_ledger_entries.line_key IS
  'Lowercase barcode of the production-record or print-run line this row posts. Edits and reversals follow this key.';

UPDATE public.inventory_ledger_entries
SET line_key = lower(btrim(barcode))
WHERE line_key IS NULL
  AND NULLIF(btrim(barcode), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_ledger_entries_line_idx
  ON public.inventory_ledger_entries (production_record_id, line_key);

CREATE TABLE IF NOT EXISTS public.roll_consumption_exceptions (
  id text PRIMARY KEY,
  production_record_id text,
  order_id text,
  barcode text NOT NULL,
  line_key text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  resolved_at timestamptz
);

COMMENT ON TABLE public.roll_consumption_exceptions IS
  'A roll whose barcode or item id did not match exactly one inventory item. Nothing was posted. Open rows are waiting for a user to link the roll or mark the warning resolved.';

CREATE INDEX IF NOT EXISTS roll_consumption_exceptions_record_idx
  ON public.roll_consumption_exceptions (production_record_id, status);
CREATE INDEX IF NOT EXISTS roll_consumption_exceptions_order_idx
  ON public.roll_consumption_exceptions (order_id, status);

ALTER TABLE public.roll_consumption_exceptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('private.install_module_access(regclass, text[])') IS NOT NULL THEN
    PERFORM private.install_module_access(
      'public.roll_consumption_exceptions'::regclass,
      ARRAY['inventory', 'production_records', 'printing_scheduler']
    );
  ELSIF to_regprocedure('private.can_any(text[])') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS roll_consumption_exceptions_access ON public.roll_consumption_exceptions';
    EXECUTE $policy$
      CREATE POLICY roll_consumption_exceptions_access
      ON public.roll_consumption_exceptions
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory', 'production_records', 'printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['inventory', 'production_records', 'printing_scheduler']))
    $policy$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roll_consumption_exceptions TO authenticated;

CREATE OR REPLACE FUNCTION private.inventory_ids_for_token(p_token text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT item.id ORDER BY item.id), ARRAY[]::text[])
  FROM public.inventory AS item
  WHERE NULLIF(btrim(COALESCE(p_token, '')), '') IS NOT NULL
    AND (
      item.id = btrim(p_token)
      OR lower(item.id) = lower(btrim(p_token))
      OR lower(btrim(COALESCE(item.item_code, ''))) = lower(btrim(p_token))
    );
$$;

CREATE OR REPLACE FUNCTION private.note_roll_consumption_exception(
  p_record_id text,
  p_order_id text,
  p_barcode text,
  p_hint text,
  p_reason text,
  p_detail jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  roll_line text := lower(btrim(COALESCE(p_barcode, '')));
  exception_id text;
BEGIN
  IF roll_line = '' THEN
    RETURN;
  END IF;
  exception_id := 'roll-warn:'
    || COALESCE(NULLIF(btrim(COALESCE(p_record_id, '')), ''), NULLIF(btrim(COALESCE(p_order_id, '')), ''), 'none')
    || ':' || roll_line;
  INSERT INTO public.roll_consumption_exceptions (
    id, production_record_id, order_id, barcode, line_key, status, reason, detail, updated_at, resolved_at
  )
  VALUES (
    exception_id,
    NULLIF(btrim(COALESCE(p_record_id, '')), ''),
    NULLIF(btrim(COALESCE(p_order_id, '')), ''),
    btrim(p_barcode),
    roll_line,
    'open',
    p_reason,
    COALESCE(p_detail, '{}'::jsonb),
    pg_catalog.now(),
    NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET status = 'open',
      reason = EXCLUDED.reason,
      detail = EXCLUDED.detail,
      barcode = EXCLUDED.barcode,
      order_id = COALESCE(EXCLUDED.order_id, public.roll_consumption_exceptions.order_id),
      production_record_id = COALESCE(EXCLUDED.production_record_id, public.roll_consumption_exceptions.production_record_id),
      updated_at = pg_catalog.now(),
      resolved_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.clear_roll_consumption_exception(
  p_record_id text,
  p_order_id text,
  p_barcode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  roll_line text := lower(btrim(COALESCE(p_barcode, '')));
BEGIN
  IF roll_line = '' THEN
    RETURN;
  END IF;
  UPDATE public.roll_consumption_exceptions
  SET status = 'resolved',
      resolved_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE status = 'open'
    AND line_key = roll_line
    AND (
      (NULLIF(btrim(COALESCE(p_record_id, '')), '') IS NOT NULL AND production_record_id = p_record_id)
      OR (NULLIF(btrim(COALESCE(p_order_id, '')), '') IS NOT NULL AND order_id = p_order_id)
    );
END;
$$;

-- Barcodes that already had consumption on a production record. Used to tell a
-- newly added line from a line that was already saved. Blocked rolls are kept
-- in the set so a later status change does not look like a new line.
CREATE OR REPLACE FUNCTION private.record_consumption_line_keys(
  p_input_rolls jsonb,
  p_materials jsonb,
  p_logs jsonb
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  keys text[] := ARRAY[]::text[];
  elem jsonb;
  roll jsonb;
  barcode text;
  consumed numeric;
  returned numeric;
  issued numeric;
  logs jsonb;
  roll_list jsonb;
BEGIN
  IF jsonb_typeof(p_input_rolls) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(p_input_rolls)
    LOOP
      barcode := NULLIF(btrim(COALESCE(elem ->> 'barcodeId', elem ->> 'barcode', '')), '');
      consumed := COALESCE(private.json_number(elem, 'consumedWeightKg'), private.json_number(elem, 'consumedKg'));
      IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
        CONTINUE;
      END IF;
      IF lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' THEN
        CONTINUE;
      END IF;
      keys := array_append(keys, lower(barcode));
    END LOOP;
  END IF;

  IF jsonb_typeof(p_materials) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(p_materials)
    LOOP
      barcode := NULLIF(btrim(COALESCE(elem ->> 'barcode', elem ->> 'barcodeId', '')), '');
      returned := COALESCE(private.json_number(elem, 'returnQtyKg'), 0);
      issued := COALESCE(private.json_number(elem, 'issueQtyKg'), private.json_number(elem, 'netConsumedQtyKg'));
      consumed := COALESCE(private.json_number(elem, 'netConsumedQtyKg'), private.json_number(elem, 'consumedWeightKg'));
      IF consumed IS NULL AND issued IS NOT NULL THEN
        consumed := GREATEST(issued - returned, 0);
      END IF;
      IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
        CONTINUE;
      END IF;
      IF lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' OR lower(barcode) LIKE 'mat-%' THEN
        CONTINUE;
      END IF;
      keys := array_append(keys, lower(barcode));
    END LOOP;
  END IF;

  logs := CASE WHEN jsonb_typeof(p_logs) = 'array' THEN p_logs ELSE '[]'::jsonb END;
  FOR elem IN SELECT value FROM jsonb_array_elements(logs)
  LOOP
    roll_list := CASE
      WHEN jsonb_typeof(elem -> 'substrate2Rolls') = 'array' AND jsonb_array_length(elem -> 'substrate2Rolls') > 0
        THEN elem -> 'substrate2Rolls'
      WHEN jsonb_typeof(elem -> 'substrate2') = 'object' THEN jsonb_build_array(elem -> 'substrate2')
      ELSE '[]'::jsonb
    END;
    FOR roll IN SELECT value FROM jsonb_array_elements(roll_list)
    LOOP
      barcode := NULLIF(btrim(COALESCE(roll ->> 'barcode', roll ->> 'barcodeId', '')), '');
      consumed := COALESCE(private.json_number(roll, 'consumedKg'), private.json_number(roll, 'consumedWeightKg'));
      IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
        CONTINUE;
      END IF;
      IF lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' THEN
        CONTINUE;
      END IF;
      keys := array_append(keys, lower(barcode));
    END LOOP;
    roll_list := CASE
      WHEN jsonb_typeof(elem -> 'substrate3Rolls') = 'array' AND jsonb_array_length(elem -> 'substrate3Rolls') > 0
        THEN elem -> 'substrate3Rolls'
      WHEN jsonb_typeof(elem -> 'substrate3') = 'object' THEN jsonb_build_array(elem -> 'substrate3')
      ELSE '[]'::jsonb
    END;
    FOR roll IN SELECT value FROM jsonb_array_elements(roll_list)
    LOOP
      barcode := NULLIF(btrim(COALESCE(roll ->> 'barcode', roll ->> 'barcodeId', '')), '');
      consumed := COALESCE(private.json_number(roll, 'consumedKg'), private.json_number(roll, 'consumedWeightKg'));
      IF barcode IS NULL OR COALESCE(consumed, 0) <= 0 THEN
        CONTINUE;
      END IF;
      IF lower(barcode) LIKE 'sfg-%' OR lower(barcode) LIKE 'fg-%' THEN
        CONTINUE;
      END IF;
      keys := array_append(keys, lower(barcode));
    END LOOP;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT key), ARRAY[]::text[])
    INTO keys
  FROM unnest(keys) AS key;
  RETURN COALESCE(keys, ARRAY[]::text[]);
END;
$$;

-- Exact film, micron, and width only. A blank micron or width matches nothing,
-- and more than one item matches nothing. Stock quantity is not a tie break.
-- Posting does not call this. Barcode or an explicit item id is the only match.
-- is_active is applied only where that column exists.
CREATE OR REPLACE FUNCTION private.film_item_match(
  p_film text,
  p_micron numeric,
  p_width numeric
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  found text;
  active_filter text := '';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory'
      AND column_name = 'is_active'
  ) THEN
    active_filter := ' AND COALESCE(item.is_active, true) IS TRUE';
  END IF;

  EXECUTE
    'SELECT CASE WHEN count(*) = 1 THEN min(item.id) ELSE NULL END
     FROM public.inventory AS item
     WHERE NULLIF(btrim(COALESCE($1, '''')), '''') IS NOT NULL
       AND $2 IS NOT NULL
       AND $3 IS NOT NULL
       AND item.micron IS NOT NULL
       AND item.width_mm IS NOT NULL
       AND lower(btrim(COALESCE(item.film_type, ''''))) = lower(btrim($1))
       AND item.micron = $2
       AND item.width_mm = $3
       AND COALESCE(item.category, ''Film Substrates'') IN (''Film Substrates'', ''Film'', ''Raw Material (RM)'', ''Lamination Films'')'
    || active_filter
    INTO found
    USING p_film, p_micron, p_width;
  RETURN found;
END;
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
  barcode_ids text[] := ARRAY[]::text[];
  hint_ids text[] := ARRAY[]::text[];
  hint_text text;
BEGIN
  -- Film, micron, and width are ignored on purpose. They must not choose an item.
  IF p_existing IS NOT NULL AND EXISTS (SELECT 1 FROM public.inventory WHERE id = p_existing) THEN
    RETURN p_existing;
  END IF;

  IF NULLIF(btrim(COALESCE(p_barcode, '')), '') IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT found.id ORDER BY found.id), ARRAY[]::text[])
      INTO barcode_ids
    FROM (
      SELECT item.id
      FROM public.inventory_rolls AS roll
      JOIN public.inventory AS item ON item.id = roll.item_id
      WHERE lower(btrim(roll.barcode_id)) = lower(btrim(p_barcode))
        AND NULLIF(btrim(roll.item_id), '') IS NOT NULL
      UNION
      SELECT token_id
      FROM unnest(private.inventory_ids_for_token(p_barcode)) AS token_id
    ) AS found;
  END IF;

  hint_text := NULLIF(btrim(COALESCE(p_hint, '')), '');
  IF hint_text IS NOT NULL THEN
    hint_ids := private.inventory_ids_for_token(hint_text);
  END IF;

  IF cardinality(barcode_ids) > 1 OR cardinality(hint_ids) > 1 THEN
    RETURN NULL;
  END IF;

  IF cardinality(barcode_ids) = 1 AND cardinality(hint_ids) = 1 AND barcode_ids[1] IS DISTINCT FROM hint_ids[1] THEN
    RETURN NULL;
  END IF;

  IF cardinality(barcode_ids) = 1 THEN
    RETURN barcode_ids[1];
  END IF;

  IF cardinality(hint_ids) = 1 THEN
    RETURN hint_ids[1];
  END IF;

  RETURN NULL;
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
  hint := COALESCE(
    NULLIF(btrim(chosen_payload ->> 'itemId'), ''),
    NULLIF(btrim(chosen_payload ->> 'stockItemId'), ''),
    NULLIF(btrim(chosen_payload ->> 'item_id'), '')
  );
  -- Film, micron, and width are not identifiers. A previous post keeps its item
  -- so an edit adjusts that same stock movement. A new post has to match the
  -- barcode or an explicit item id.
  item_id := private.resolve_roll_stock_item(
    parent_barcode,
    hint,
    NULL,
    NULL,
    NULL,
    CASE WHEN COALESCE(entry.applied_stock_kg, 0) <> 0 THEN entry.stock_item_id ELSE NULL END
  );
  IF item_id IS NULL THEN
    PERFORM private.note_roll_consumption_exception(
      entry.production_record_id,
      entry.order_id,
      parent_barcode,
      hint,
      'Barcode ' || parent_barcode || ' did not match exactly one inventory item, so nothing was posted. Link that barcode to one inventory item, or set an item id that matches one item, then save again.',
      jsonb_build_object(
        'barcode', parent_barcode,
        'itemId', hint,
        'filmType', film,
        'micron', micron,
        'widthMm', width_mm
      )
    );
    IF COALESCE(entry.applied_stock_kg, 0) = 0 THEN
      DELETE FROM public.inventory_ledger_entries WHERE id IN (entry.id, receipt_id);
    END IF;
    RETURN;
  END IF;
  PERFORM private.clear_roll_consumption_exception(entry.production_record_id, entry.order_id, parent_barcode);
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
  p_origin text,
  p_prior_lines jsonb
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
  postable jsonb := '[]'::jsonb;
  roll_line text;
  hint_item text;
  resolved_item text;
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
    UPDATE public.roll_consumption_exceptions
    SET status = 'resolved',
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE production_record_id = p_record_id
      AND status = 'open';
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


    -- An update may only post lines this trigger already posted for the record,
    -- lines it already warned about, or lines that were not on the record before
    -- this save. Lines that were already on the record and were never posted stay
    -- unposted, so editing a historical job does not deduct them again.
    IF p_origin = 'production_record' AND p_prior_lines IS NOT NULL AND jsonb_typeof(p_prior_lines) = 'array' THEN
      FOR elem IN SELECT value FROM jsonb_array_elements(desired)
      LOOP
        roll_line := lower(btrim(COALESCE(elem ->> 'barcode', '')));
        IF roll_line = '' THEN
          CONTINUE;
        END IF;
        IF EXISTS (
          SELECT 1
          FROM public.inventory_ledger_entries AS issue
          WHERE issue.entry_kind = 'issue'
            AND issue.production_record_id = p_record_id
            AND COALESCE(issue.line_key, lower(btrim(issue.barcode))) = roll_line
            AND issue.record_consumed IS NOT NULL
        ) OR EXISTS (
          SELECT 1
          FROM public.roll_consumption_exceptions AS ex
          WHERE ex.production_record_id = p_record_id
            AND ex.line_key = roll_line
            AND ex.status = 'open'
        ) OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(p_prior_lines) AS prior(prior_key)
          WHERE prior.prior_key = roll_line
        ) THEN
          postable := postable || jsonb_build_array(elem);
        END IF;
      END LOOP;
    ELSE
      postable := desired;
    END IF;

    FOR elem IN SELECT value FROM jsonb_array_elements(postable)
    LOOP
      barcode := elem ->> 'barcode';
      stage := elem ->> 'stage';
      roll_line := lower(btrim(barcode));
      key := 'roll-issue:' || scope_key || ':' || roll_line;
      hint_item := COALESCE(
        NULLIF(btrim(elem #>> '{payload,itemId}'), ''),
        NULLIF(btrim(elem #>> '{payload,stockItemId}'), ''),
        NULLIF(btrim(elem #>> '{payload,item_id}'), '')
      );
      resolved_item := NULL;
      SELECT issue.stock_item_id
        INTO resolved_item
      FROM public.inventory_ledger_entries AS issue
      WHERE issue.id = key
        AND COALESCE(issue.applied_stock_kg, 0) <> 0;
      resolved_item := private.resolve_roll_stock_item(barcode, hint_item, NULL, NULL, NULL, resolved_item);
      IF resolved_item IS NULL THEN
        PERFORM private.note_roll_consumption_exception(
          CASE WHEN p_origin = 'production_record' THEN p_record_id ELSE NULL END,
          NULLIF(btrim(COALESCE(p_order_id, record_row.order_id, '')), ''),
          barcode,
          hint_item,
          'Barcode ' || barcode || ' did not match exactly one inventory item, so nothing was posted. Link that barcode to one inventory item, or set an item id that matches one item, then save again.',
          jsonb_strip_nulls(jsonb_build_object(
            'barcode', barcode,
            'itemId', hint_item,
            'filmType', elem #>> '{payload,filmType}',
            'micron', elem #>> '{payload,micron}',
            'widthMm', elem #>> '{payload,widthMm}'
          ))
        );
        DELETE FROM public.inventory_ledger_entries
        WHERE id IN (key, 'roll-return:' || scope_key || ':' || roll_line)
          AND COALESCE(applied_stock_kg, 0) = 0;
        CONTINUE;
      END IF;
      PERFORM private.clear_roll_consumption_exception(
        CASE WHEN p_origin = 'production_record' THEN p_record_id ELSE NULL END,
        NULLIF(btrim(COALESCE(p_order_id, record_row.order_id, '')), ''),
        barcode
      );
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, order_id, production_record_id,
        job_name, job_code, qty_kg, consumed_kg, applied_stock_kg, occurred_at,
        print_consumed, print_initial, print_payload, record_consumed, record_initial, record_payload, qty_source
      )
      VALUES (
        key, 'issue', scope_key, stage, barcode, roll_line,
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
          line_key = EXCLUDED.line_key,
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
      UPDATE public.roll_consumption_exceptions AS ex
      SET status = 'resolved',
          resolved_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      WHERE ex.production_record_id = p_record_id
        AND ex.status = 'open'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(desired) AS item
          WHERE lower(btrim(COALESCE(item ->> 'barcode', ''))) = ex.line_key
        );
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
BEGIN
  RETURN private.sync_job_roll_issues(p_order_id, p_record_id, p_origin, NULL::jsonb);
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
    PERFORM private.sync_job_roll_issues(OLD.order_id, OLD.id, 'production_record_delete', NULL::jsonb);
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

  IF TG_OP = 'UPDATE' THEN
    PERFORM private.sync_job_roll_issues(
      NEW.order_id,
      NEW.id,
      'production_record',
      to_jsonb(private.record_consumption_line_keys(
        OLD.input_rolls_list,
        OLD.materials_list,
        COALESCE(OLD.sfg_consumptions, OLD.process_logs -> 'sfgConsumptions')
      ))
    );
    RETURN NEW;
  END IF;

  PERFORM private.sync_job_roll_issues(NEW.order_id, NEW.id, 'production_record', NULL::jsonb);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.inventory_ids_for_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.note_roll_consumption_exception(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.clear_roll_consumption_exception(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_consumption_line_keys(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.film_item_match(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_roll_stock_item(text, text, text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_job_roll_issues(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.trg_production_record_roll_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_job_roll_issues(text, text, text) TO authenticated;
