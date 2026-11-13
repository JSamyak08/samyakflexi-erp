-- Revert one SFG/FG consumption in a single transaction.
--
-- A consume from the SFG/FG store writes all of the following. Revert undoes
-- each of them, or refuses with a reason when a later step has already used
-- the result:
--   * sfg_goods consumed kg, available kg, status, and the notes history
--   * the source inventory roll's available kg and status
--   * an inventory item whose id or item code is that roll (stock and allocation)
--   * each Substrate 2 / Substrate 3 roll (available kg and status) and its -BAL roll
--   * the raw-material stock ledger issue and balance receipt for those substrates
--   * output child rolls in sfg_goods and inventory_rolls
--   * production-record stage kilograms, scrap, materials, output rolls, and the log
--   * scrap-store rows and the high-scrap registry entry fed by those kilograms
--   * an untouched QC hold created for this consumption
--   * an open dispatch packing line created for this consumption
--
-- The log is marked Reverted (who, when, reason). It is not deleted.
-- Reports skip that status. Admin, Plant Manager, and Production Manager only.
-- The consumption timestamp must be within 7 days.
-- Safe to re-run. Existing consumption rows are not rewritten.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.revert_num(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p_value)::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.revert_time(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p_value)::timestamptz;
EXCEPTION WHEN others THEN
  BEGIN
    RETURN (btrim(p_value)::date)::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION private.revert_log_reverted(p_log jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(coalesce(p_log->>'status', ''))) = 'reverted'
    OR lower(btrim(coalesce(p_log->>'reverted', ''))) IN ('true', 't')
    OR nullif(btrim(coalesce(p_log->>'revertedAt', '')), '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION private.revert_log_kg(p_log jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT round(COALESCE(
    CASE
      WHEN p_log ? 'stockDeductedKg' AND private.revert_num(p_log->>'stockDeductedKg') IS NOT NULL
        THEN private.revert_num(p_log->>'stockDeductedKg')
      ELSE private.revert_num(p_log->>'consumedKg')
    END,
    0
  ), 2);
$$;

CREATE OR REPLACE FUNCTION private.revert_log_found(p_logs jsonb, p_log_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_logs) = 'array' THEN p_logs ELSE '[]'::jsonb END) AS elem
    WHERE elem->>'id' = p_log_id
  );
$$;

CREATE OR REPLACE FUNCTION private.revert_output_codes(p_log jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(code), ARRAY[]::text[])
  FROM (
    SELECT DISTINCT nullif(btrim(coalesce(roll->>'barcode', roll->>'barcodeId', '')), '') AS code
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_log->'outputRolls') = 'array' AND jsonb_array_length(p_log->'outputRolls') > 0
          THEN p_log->'outputRolls'
        WHEN jsonb_typeof(p_log->'outputRoll') = 'object' THEN jsonb_build_array(p_log->'outputRoll')
        ELSE '[]'::jsonb
      END
    ) AS roll
  ) AS codes
  WHERE code IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION private.revert_substrates(p_log jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  rolls jsonb := '[]'::jsonb;
  roll jsonb;
  barcode text;
  consumed numeric;
  initial numeric;
  balance numeric;
BEGIN
  IF jsonb_typeof(p_log->'substrate2Rolls') = 'array' AND jsonb_array_length(p_log->'substrate2Rolls') > 0 THEN
    rolls := p_log->'substrate2Rolls';
  ELSIF jsonb_typeof(p_log->'substrate2') = 'object' THEN
    rolls := jsonb_build_array(p_log->'substrate2');
  END IF;
  IF jsonb_typeof(p_log->'substrate3Rolls') = 'array' AND jsonb_array_length(p_log->'substrate3Rolls') > 0 THEN
    rolls := rolls || (p_log->'substrate3Rolls');
  ELSIF jsonb_typeof(p_log->'substrate3') = 'object' THEN
    rolls := rolls || jsonb_build_array(p_log->'substrate3');
  END IF;

  FOR roll IN SELECT value FROM jsonb_array_elements(rolls)
  LOOP
    barcode := nullif(btrim(coalesce(roll->>'barcode', roll->>'barcodeId', '')), '');
    consumed := round(COALESCE(private.revert_num(roll->>'consumedKg'), private.revert_num(roll->>'consumedWeightKg'), 0), 2);
    IF barcode IS NULL OR consumed <= 0 THEN
      CONTINUE;
    END IF;
    initial := round(COALESCE(private.revert_num(roll->>'initialKg'), private.revert_num(roll->>'initialWeightKg'), consumed), 2);
    IF initial < consumed THEN
      initial := consumed;
    END IF;
    balance := round(GREATEST(initial - consumed, 0), 2);
    result := result || jsonb_build_array(jsonb_build_object(
      'barcode', barcode,
      'consumedKg', consumed,
      'initialKg', initial,
      'balanceKg', balance,
      'balanceBarcode', CASE WHEN balance > 0 THEN barcode || '-BAL' ELSE '' END
    ));
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.revert_mark_log(
  p_log jsonb,
  p_actor text,
  p_reason text,
  p_at timestamptz,
  p_strip boolean
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_strip, false) THEN
      (p_log - 'substrate2' - 'substrate2Rolls' - 'substrate3' - 'substrate3Rolls')
      || jsonb_build_object(
        'status', 'Reverted',
        'revertedAt', p_at,
        'revertedBy', p_actor,
        'revertReason', p_reason,
        'revertSnapshot', jsonb_strip_nulls(jsonb_build_object(
          'substrate2', p_log->'substrate2',
          'substrate2Rolls', p_log->'substrate2Rolls',
          'substrate3', p_log->'substrate3',
          'substrate3Rolls', p_log->'substrate3Rolls',
          'outputRoll', p_log->'outputRoll',
          'outputRolls', p_log->'outputRolls'
        ))
      )
    ELSE
      p_log || jsonb_build_object(
        'status', 'Reverted',
        'revertedAt', p_at,
        'revertedBy', p_actor,
        'revertReason', p_reason
      )
  END;
$$;

CREATE OR REPLACE FUNCTION private.revert_mark_history(
  p_logs jsonb,
  p_log_id text,
  p_actor text,
  p_reason text,
  p_at timestamptz,
  p_strip boolean
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem->>'id' = p_log_id THEN private.revert_mark_log(elem, p_actor, p_reason, p_at, p_strip)
      ELSE elem
    END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_logs) = 'array' THEN p_logs ELSE '[]'::jsonb END)
    WITH ORDINALITY AS listed(elem, ord);
$$;

CREATE OR REPLACE FUNCTION private.revert_drop_materials(p_list jsonb, p_log_id text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_list) = 'array' THEN p_list ELSE '[]'::jsonb END)
    WITH ORDINALITY AS listed(elem, ord)
  WHERE coalesce(elem->>'logId', '') IS DISTINCT FROM p_log_id
    AND NOT (
      coalesce(elem->>'ledgerSource', '') = 'lamination-substrate'
      AND strpos(coalesce(elem->>'id', ''), ':' || p_log_id || ':') > 0
    );
$$;

CREATE OR REPLACE FUNCTION private.revert_drop_outputs(p_list jsonb, p_codes text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_list) = 'array' THEN p_list ELSE '[]'::jsonb END)
    WITH ORDINALITY AS listed(elem, ord)
  WHERE NOT (
    lower(btrim(coalesce(elem->>'barcodeId', elem->>'rollId', elem->>'barcode', ''))) = ANY (
      SELECT lower(btrim(code)) FROM unnest(COALESCE(p_codes, ARRAY[]::text[])) AS code
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.revert_sub_key(p_obj jsonb, p_key text, p_delta numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_set(
    COALESCE(p_obj, '{}'::jsonb),
    ARRAY[p_key],
    to_jsonb(round(GREATEST(COALESCE(private.revert_num(p_obj->>p_key), 0) - COALESCE(p_delta, 0), 0), 2)),
    true
  );
$$;

CREATE OR REPLACE FUNCTION private.revert_sfg_consumption(
  p_batch text,
  p_log_id text,
  p_reason text,
  p_apply boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  good record;
  v_notes jsonb := '{}'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_log jsonb;
  v_actor text := 'User';
  v_at timestamptz := pg_catalog.now();
  v_blocks text[] := ARRAY[]::text[];
  v_lines text[] := ARRAY[]::text[];
  v_batch text := btrim(coalesce(p_batch, ''));
  v_log_id text := btrim(coalesce(p_log_id, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_at_log timestamptz;
  v_restored numeric := 0;
  v_consumed_before numeric := 0;
  v_available_before numeric := 0;
  v_consumed_after numeric := 0;
  v_available_after numeric := 0;
  v_status text;
  v_is_fg boolean := false;
  v_substrates jsonb := '[]'::jsonb;
  v_outputs text[] := ARRAY[]::text[];
  v_code text;
  v_elem jsonb;
  v_child record;
  v_roll record;
  v_child_notes jsonb;
  v_child_consumed numeric;
  v_child_status text;
  v_later text;
  v_balance_code text;
  v_initial numeric;
  v_balance_kg numeric;
  v_sub_consumed numeric;
  v_hold record;
  v_hold_kg numeric;
  v_pack record;
  v_ship record;
  v_rec record;
  v_process jsonb;
  v_old_logs jsonb;
  v_new_logs jsonb;
  v_materials jsonb;
  v_stage text;
  v_out_net numeric := 0;
  v_scrap jsonb;
  v_plain numeric;
  v_laminate numeric;
  v_adh numeric;
  v_trim numeric;
  v_setting numeric;
  v_pouch numeric;
  v_zip numeric;
  v_print_plain numeric;
  v_print_waste numeric;
  v_job text;
  v_order text;
  v_issue record;
  v_delta numeric;
  v_parent_status text;
  v_message text;
  v_scrap_id text;
  v_scrap_kg numeric;
  v_row record;
  v_record_ids text[] := ARRAY[]::text[];
  v_has_pack boolean := false;
BEGIN
  IF v_batch = '' OR v_log_id = '' THEN
    RAISE EXCEPTION 'A roll and a consumption are required.';
  END IF;

  IF to_regprocedure('private.has_role(text[])') IS NULL
     OR NOT private.has_role(ARRAY['Production Manager', 'Plant Manager']::text[]) THEN
    RAISE EXCEPTION 'Only Admin, Plant Manager, and Production Manager can revert a consumption.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(u.username), ''), nullif(btrim(u.email), ''), 'User')
    INTO v_actor
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
     OR (u.auth_user_id IS NULL AND u.id = auth.uid()::text)
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;
  v_actor := coalesce(v_actor, 'User');

  IF COALESCE(p_apply, false) THEN
    SELECT * INTO good
    FROM public.sfg_goods
    WHERE sfg_batch_code = v_batch OR id::text = v_batch
    ORDER BY (sfg_batch_code = v_batch) DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO good
    FROM public.sfg_goods
    WHERE sfg_batch_code = v_batch OR id::text = v_batch
    ORDER BY (sfg_batch_code = v_batch) DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roll % was not found.', v_batch;
  END IF;
  v_batch := good.sfg_batch_code;

  IF left(btrim(coalesce(good.notes, '')), 1) = '{' THEN
    BEGIN
      v_notes := good.notes::jsonb;
    EXCEPTION WHEN others THEN
      v_notes := '{}'::jsonb;
    END;
  END IF;

  IF private.revert_log_found(v_notes->'consumptionHistory', v_log_id) THEN
    v_history := v_notes->'consumptionHistory';
  ELSIF private.revert_log_found(good.consumption_history, v_log_id) THEN
    v_history := good.consumption_history;
  ELSE
    RAISE EXCEPTION 'Consumption % is not on roll %.', v_log_id, v_batch;
  END IF;

  SELECT elem INTO v_log
  FROM jsonb_array_elements(v_history) AS elem
  WHERE elem->>'id' = v_log_id
  LIMIT 1;

  IF private.revert_log_reverted(v_log) THEN
    v_blocks := array_append(v_blocks, 'This consumption has already been reverted.');
  END IF;

  v_restored := private.revert_log_kg(v_log);
  IF v_restored <= 0 THEN
    v_blocks := array_append(v_blocks, 'This entry did not remove stock, so there is nothing to revert.');
  END IF;

  v_at_log := coalesce(private.revert_time(v_log->>'timestamp'), private.revert_time(v_log->>'date'));
  IF v_at_log IS NULL THEN
    v_blocks := array_append(v_blocks, 'This consumption has no timestamp, so it cannot be reverted.');
  ELSIF v_at_log < v_at - interval '7 days' THEN
    v_blocks := array_append(v_blocks, 'Revert window (7 days) has passed');
  END IF;

  IF COALESCE(p_apply, false) AND v_reason = '' THEN
    v_blocks := array_append(v_blocks, 'A reason is required to revert a consumption.');
  END IF;

  v_consumed_before := round(COALESCE(private.revert_num(v_notes->>'consumedKg'), good.consumed_kg, 0), 2);
  v_available_before := round(COALESCE(private.revert_num(v_notes->>'availableKg'), good.available_kg, 0), 2);
  v_consumed_after := round(GREATEST(v_consumed_before - v_restored, 0), 2);
  v_available_after := round(v_available_before + v_restored, 2);
  v_is_fg := v_batch ILIKE 'FG-%'
    OR coalesce(v_notes->>'rollType', '') = 'FG'
    OR (
      coalesce(good.sfg_type, '') ILIKE '%finished goods%'
      AND coalesce(good.sfg_type, '') NOT ILIKE '%semi%'
    );
  IF v_consumed_after <= 0 THEN
    v_status := CASE WHEN v_is_fg THEN 'Ready for Dispatch' ELSE 'In Stock (WIP)' END;
  ELSIF v_available_after <= 0 THEN
    v_status := 'Fully Consumed';
  ELSE
    v_status := 'Partially Consumed';
  END IF;

  v_substrates := private.revert_substrates(v_log);
  v_outputs := private.revert_output_codes(v_log);
  v_stage := coalesce(v_log->>'targetProcess', '');
  v_scrap := COALESCE(v_log->'scrapBreakdown', '{}'::jsonb);
  v_job := coalesce(nullif(v_log->>'jobName', ''), good.job_name, '');
  v_order := coalesce(nullif(v_log->>'orderId', ''), good.order_id, '');

  SELECT COALESCE(sum(COALESCE(private.revert_num(roll->>'netWeightKg'), 0)), 0)
    INTO v_out_net
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(v_log->'outputRolls') = 'array' AND jsonb_array_length(v_log->'outputRolls') > 0 THEN v_log->'outputRolls'
      WHEN jsonb_typeof(v_log->'outputRoll') = 'object' THEN jsonb_build_array(v_log->'outputRoll')
      ELSE '[]'::jsonb
    END
  ) AS roll;
  v_out_net := round(COALESCE(v_out_net, 0), 2);

  IF COALESCE(p_apply, false) AND cardinality(v_outputs) > 0 THEN
    PERFORM 1 FROM public.sfg_goods WHERE sfg_batch_code = ANY (v_outputs) FOR UPDATE;
    PERFORM 1 FROM public.inventory_rolls
    WHERE lower(btrim(barcode_id)) IN (SELECT lower(btrim(code)) FROM unnest(v_outputs) AS code)
    FOR UPDATE;
  END IF;

  FOREACH v_code IN ARRAY v_outputs LOOP
    SELECT * INTO v_child FROM public.sfg_goods WHERE sfg_batch_code = v_code;
    v_child_notes := '{}'::jsonb;
    IF v_child.sfg_batch_code IS NOT NULL AND left(btrim(coalesce(v_child.notes, '')), 1) = '{' THEN
      BEGIN
        v_child_notes := v_child.notes::jsonb;
      EXCEPTION WHEN others THEN
        v_child_notes := '{}'::jsonb;
      END;
    END IF;
    v_child_consumed := round(COALESCE(private.revert_num(v_child_notes->>'consumedKg'), v_child.consumed_kg, 0), 2);
    v_child_status := lower(btrim(coalesce(v_child.status, v_child_notes->>'status', '')));
    SELECT elem->>'targetProcess' INTO v_later
    FROM jsonb_array_elements(COALESCE(v_child_notes->'consumptionHistory', '[]'::jsonb)) AS elem
    WHERE NOT private.revert_log_reverted(elem)
      AND private.revert_log_kg(elem) > 0
    LIMIT 1;

    IF v_child_consumed > 0 OR v_later IS NOT NULL THEN
      v_blocks := array_append(v_blocks, format(
        'Output roll %s has already been consumed%s. Revert that consumption first.',
        v_code,
        CASE WHEN v_later IS NULL THEN '' ELSE ' (' || v_later || ')' END
      ));
    ELSIF round(COALESCE(private.revert_num(v_child_notes->>'dispatchedKg'), 0), 2) > 0
       OR v_child_status IN ('dispatched', 'partially dispatched') THEN
      v_blocks := array_append(v_blocks, format(
        'Output roll %s has been dispatched. Reverse that dispatch before reverting this consumption.',
        v_code
      ));
    ELSIF v_child_status IN ('fully consumed', 'partially consumed', 'consumed', 'written off', 'deleted', 'void') THEN
      v_blocks := array_append(v_blocks, format('Output roll %s is %s. Revert that later step first.', v_code, coalesce(v_child.status, v_child_status)));
    ELSIF v_child_status <> '' AND v_child_status NOT IN (
      'in stock (wip)', 'in stock (sfg)', 'in stock', 'ready for dispatch', 'available', 'qc approved', 'approved'
    ) THEN
      v_blocks := array_append(v_blocks, format(
        'Output roll %s is %s. Revert that later step before this consumption.',
        v_code, coalesce(v_child.status, v_child_status)
      ));
    END IF;

    SELECT * INTO v_roll FROM public.inventory_rolls WHERE lower(btrim(barcode_id)) = lower(v_code);
    IF v_roll.barcode_id IS NOT NULL
       AND round(COALESCE(v_roll.net_weight_kg, 0) - COALESCE(v_roll.available_weight_kg, 0), 2) > 0.02
       AND lower(btrim(coalesce(v_roll.status, ''))) IN ('consumed', 'fully consumed', 'partially consumed', 'dispatched') THEN
      v_blocks := array_append(v_blocks, format(
        'Output roll %s has already been consumed. Revert that consumption first.', v_code
      ));
    END IF;

    IF to_regclass('public.packing_list_consumptions') IS NOT NULL THEN
      SELECT packing_list_id INTO v_later
      FROM public.packing_list_consumptions
      WHERE lower(btrim(coalesce(barcode, ''))) = lower(v_code)
      LIMIT 1;
      IF v_later IS NOT NULL THEN
        v_blocks := array_append(v_blocks, format(
          'Output roll %s is on packing list %s. Revert that packing consumption first.',
          v_code, v_later
        ));
      END IF;
    END IF;

    v_lines := array_append(v_lines, format(
      'Remove output roll %s%s.',
      v_code,
      CASE WHEN v_out_net > 0 AND cardinality(v_outputs) = 1 THEN format(' (%s kg)', to_char(v_out_net, 'FM999999990.00')) ELSE '' END
    ));
  END LOOP;

  IF COALESCE(p_apply, false) THEN
    PERFORM 1 FROM public.inventory_rolls
    WHERE lower(btrim(barcode_id)) IN (
      SELECT lower(btrim(elem->>'barcode')) FROM jsonb_array_elements(v_substrates) AS elem
      UNION
      SELECT lower(btrim(elem->>'balanceBarcode')) FROM jsonb_array_elements(v_substrates) AS elem
    )
    FOR UPDATE;
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_substrates)
  LOOP
    v_code := v_elem->>'barcode';
    v_initial := round(COALESCE(private.revert_num(v_elem->>'initialKg'), 0), 2);
    v_sub_consumed := round(COALESCE(private.revert_num(v_elem->>'consumedKg'), 0), 2);
    v_balance_kg := round(COALESCE(private.revert_num(v_elem->>'balanceKg'), 0), 2);
    v_balance_code := nullif(v_elem->>'balanceBarcode', '');

    SELECT * INTO v_roll FROM public.inventory_rolls WHERE lower(btrim(barcode_id)) = lower(v_code);
    IF v_roll.barcode_id IS NOT NULL AND round(COALESCE(v_roll.available_weight_kg, 0), 2) > 0.02 THEN
      v_blocks := array_append(v_blocks, format(
        'Substrate roll %s is no longer fully issued (available %s kg). Revert the later movement first.',
        v_code, to_char(round(v_roll.available_weight_kg, 2), 'FM999999990.00')
      ));
    END IF;

    IF v_balance_code IS NOT NULL THEN
      SELECT * INTO v_child FROM public.inventory_rolls WHERE lower(btrim(barcode_id)) = lower(v_balance_code);
      IF v_child.barcode_id IS NOT NULL THEN
        IF round(COALESCE(v_child.available_weight_kg, 0), 2) + 0.02 < round(COALESCE(v_child.net_weight_kg, 0), 2)
           OR lower(btrim(coalesce(v_child.status, ''))) NOT IN (
             'in stock (rm)', 'in stock', 'in stock (sfg)', 'available', 'qc approved', 'approved', ''
           ) THEN
          v_blocks := array_append(v_blocks, format(
            'Balance roll %s from substrate %s has already moved. Revert that later use first.',
            v_balance_code, v_code
          ));
        END IF;
      END IF;
    END IF;

    v_lines := array_append(v_lines, format(
      'Return substrate %s to %s kg available and add %s kg back to its raw-material stock.%s',
      v_code,
      to_char(v_initial, 'FM999999990.00'),
      to_char(v_sub_consumed, 'FM999999990.00'),
      CASE WHEN v_balance_code IS NULL THEN '' ELSE format(' Remove balance roll %s (%s kg).', v_balance_code, to_char(v_balance_kg, 'FM999999990.00')) END
    ));
  END LOOP;

  v_hold_kg := CASE
    WHEN v_stage = 'QC Hold Store' THEN v_restored
    WHEN coalesce(v_log->>'balanceReason', '') = 'QC Hold / Issue' THEN round(COALESCE(private.revert_num(v_log->>'balanceKeptKg'), 0), 2)
    ELSE 0
  END;

  IF v_hold_kg > 0 AND to_regclass('public.sfg_qc_hold_items') IS NOT NULL THEN
    FOR v_hold IN
      SELECT * FROM public.sfg_qc_hold_items
      WHERE coalesce(payload->>'parentSfgBatchCode', payload->>'parentSfgId', '') = v_batch
    LOOP
      IF abs(COALESCE(private.revert_num(v_hold.payload->>'totalHoldKg'), 0) - v_hold_kg) > 0.05 THEN
        CONTINUE;
      END IF;
      IF private.revert_time(v_hold.payload->>'timestamp') IS NOT NULL
         AND (
           private.revert_time(v_hold.payload->>'timestamp') < v_at_log - interval '2 minutes'
           OR private.revert_time(v_hold.payload->>'timestamp') > v_at_log + interval '30 minutes'
         ) THEN
        CONTINUE;
      END IF;
      IF round(COALESCE(private.revert_num(v_hold.payload->>'approvedKg'), 0), 2) > 0
         OR round(COALESCE(private.revert_num(v_hold.payload->>'scrappedKg'), 0), 2) > 0
         OR (
           COALESCE(private.revert_num(v_hold.payload->>'totalHoldKg'), 0) > 0
           AND COALESCE(private.revert_num(v_hold.payload->>'remainingHoldKg'), 0)
             + 0.02 < COALESCE(private.revert_num(v_hold.payload->>'totalHoldKg'), 0)
         )
         OR upper(coalesce(v_hold.payload->>'status', 'QC_HOLD')) <> 'QC_HOLD' THEN
        v_blocks := array_append(v_blocks, format(
          'QC hold %s from this consumption has already been approved or scrapped. Clear that hold movement before reverting.',
          v_hold.id
        ));
      ELSE
        v_lines := array_append(v_lines, format(
          'Remove QC hold %s (%s kg).',
          v_hold.id, to_char(v_hold_kg, 'FM999999990.00')
        ));
      END IF;
    END LOOP;
  END IF;

  IF to_regclass('public.packing_list_consumptions') IS NOT NULL THEN
    SELECT * INTO v_pack FROM public.packing_list_consumptions WHERE id = v_log_id;
    v_has_pack := v_pack.id IS NOT NULL;
    IF v_has_pack AND to_regclass('public.dispatch_shipments') IS NOT NULL THEN
      SELECT * INTO v_ship FROM public.dispatch_shipments WHERE dispatch_id = v_pack.packing_list_id;
      IF coalesce(v_ship.packing_status, 'Finalised') IS DISTINCT FROM 'Open'
         OR round(COALESCE(v_ship.total_net_weight_kg, 0), 2) > 0
         OR COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(v_ship.items) = 'array' THEN v_ship.items ELSE '[]'::jsonb END), 0) > 0 THEN
        v_blocks := array_append(v_blocks, format(
          'This consumption is on packing list %s, which has already moved on. Revert that packing list first.',
          v_pack.packing_list_id
        ));
      ELSE
        v_lines := array_append(v_lines, format('Remove this consumption from open packing list %s.', v_pack.packing_list_id));
      END IF;
    END IF;
  END IF;

  IF v_restored > 0 THEN
    v_lines := array_prepend(format(
      'Return %s kg to %s (available %s kg → %s kg).',
      to_char(v_restored, 'FM999999990.00'),
      v_batch,
      to_char(v_available_before, 'FM999999990.00'),
      to_char(v_available_after, 'FM999999990.00')
    ), v_lines);
  END IF;

  v_plain := round(COALESCE(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageKg'), 0), 2);
  v_laminate := round(COALESCE(private.revert_num(v_scrap->>'laminateWastageKg'), 0), 2);
  v_adh := round(COALESCE(
    CASE WHEN v_stage = 'Lamination (Pass 2)' THEN private.revert_num(v_scrap->>'adhesiveConsumedL2Kg')
         ELSE private.revert_num(v_scrap->>'adhesiveConsumedL1Kg') END, 0), 2);
  v_trim := round(COALESCE(private.revert_num(v_scrap->>'slittingTrimScrapKg'), 0), 2);
  v_setting := round(COALESCE(private.revert_num(v_scrap->>'slittingSettingWastageKg'), 0), 2);
  v_pouch := round(COALESCE(private.revert_num(v_scrap->>'pouchingScrapKg'), 0), 2);
  v_zip := round(COALESCE(private.revert_num(v_scrap->>'zipperConsumedKg'), 0), 2);
  v_print_plain := round(COALESCE(private.revert_num(v_scrap->>'printingPlainSettingWastageKg'), 0), 2);
  v_print_waste := round(COALESCE(private.revert_num(v_scrap->>'printingWastageKg'), 0), 2);

  IF v_stage = 'Lamination (Pass 1)' THEN
    IF v_plain > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of lamination plain substrate wastage from the job.', to_char(v_plain, 'FM999999990.00'))); END IF;
    IF v_laminate > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of laminate wastage from the job.', to_char(v_laminate, 'FM999999990.00'))); END IF;
  ELSIF v_stage = 'Lamination (Pass 2)' THEN
    IF round(COALESCE(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageL2Kg'), 0), 2) > 0 THEN
      v_lines := array_append(v_lines, format('Remove %s kg of lamination plain substrate wastage (pass 2) from the job.', to_char(round(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageL2Kg'), 2), 'FM999999990.00')));
    END IF;
    IF v_laminate > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of laminate wastage from the job.', to_char(v_laminate, 'FM999999990.00'))); END IF;
  ELSIF v_stage = 'Printing (Pass 2)' THEN
    IF v_print_plain > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of printing plain setting wastage from the job.', to_char(v_print_plain, 'FM999999990.00'))); END IF;
    IF v_print_waste > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of printing wastage from the job.', to_char(v_print_waste, 'FM999999990.00'))); END IF;
  ELSIF v_stage = 'Slitting & Rewinding' THEN
    IF v_trim > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of slitting trim from the job.', to_char(v_trim, 'FM999999990.00'))); END IF;
    IF v_setting > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of slitting setting wastage from the job.', to_char(v_setting, 'FM999999990.00'))); END IF;
  ELSIF v_stage = 'Pouching / Bag Making' THEN
    IF v_pouch > 0 THEN v_lines := array_append(v_lines, format('Remove %s kg of pouching scrap from the job.', to_char(v_pouch, 'FM999999990.00'))); END IF;
  END IF;

  IF cardinality(v_blocks) > 0 THEN
    IF COALESCE(p_apply, false) THEN
      RAISE EXCEPTION '%', array_to_string(v_blocks, ' ');
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'applied', false,
      'blocks', to_jsonb(v_blocks),
      'lines', to_jsonb(v_lines),
      'batch', v_batch,
      'logId', v_log_id,
      'restoredKg', v_restored
    );
  END IF;

  IF NOT COALESCE(p_apply, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'applied', false,
      'blocks', '[]'::jsonb,
      'lines', to_jsonb(v_lines),
      'batch', v_batch,
      'logId', v_log_id,
      'jobName', v_job,
      'restoredKg', v_restored,
      'consumedBefore', v_consumed_before,
      'consumedAfter', v_consumed_after,
      'availableBefore', v_available_before,
      'availableAfter', v_available_after,
      'statusAfter', v_status
    );
  END IF;

  -- Production record first, so the roll ledger trigger can reverse substrate
  -- issues. Parent rolls are corrected after that, because the trigger may
  -- have stored the already-issued weight as the "before" weight.
  FOR v_rec IN
    SELECT * FROM public.production_records
    WHERE private.revert_log_found(process_logs->'sfgConsumptions', v_log_id)
       OR private.revert_log_found(sfg_consumptions, v_log_id)
    FOR UPDATE
  LOOP
    v_record_ids := array_append(v_record_ids, v_rec.id);
    v_process := COALESCE(v_rec.process_logs, '{}'::jsonb);
    IF private.revert_log_found(v_process->'sfgConsumptions', v_log_id) THEN
      v_old_logs := v_process->'sfgConsumptions';
    ELSE
      v_old_logs := v_rec.sfg_consumptions;
    END IF;
    v_new_logs := private.revert_mark_history(v_old_logs, v_log_id, v_actor, v_reason, v_at, true);
    IF jsonb_typeof(v_rec.materials_list) = 'array' AND jsonb_array_length(v_rec.materials_list) > 0 THEN
      v_materials := private.revert_drop_materials(v_rec.materials_list, v_log_id);
    ELSE
      v_materials := private.revert_drop_materials(v_process->'materialsList', v_log_id);
    END IF;
    v_process := jsonb_set(v_process, '{sfgConsumptions}', v_new_logs, true);
    v_process := jsonb_set(v_process, '{materialsList}', v_materials, true);
    v_process := jsonb_set(v_process, '{outputRolls}', private.revert_drop_outputs(v_process->'outputRolls', v_outputs), true);
    v_process := jsonb_set(v_process, '{rollsBreakdown}', private.revert_drop_outputs(COALESCE(v_process->'rollsBreakdown', v_process->'outputRolls'), v_outputs), true);

    IF v_stage = 'Lamination (Pass 1)' THEN
      UPDATE public.production_records SET
        qty_lamination_l1 = round(GREATEST(COALESCE(qty_lamination_l1, 0) - v_out_net, 0), 2),
        adhesive_consumed_l1_kg = round(GREATEST(COALESCE(adhesive_consumed_l1_kg, 0) - v_adh, 0), 2),
        lamination_plain_substrate_wastage_kg = round(GREATEST(COALESCE(lamination_plain_substrate_wastage_kg, 0) - v_plain, 0), 2),
        laminate_wastage_kg = round(GREATEST(COALESCE(laminate_wastage_kg, 0) - v_laminate, 0), 2)
      WHERE id = v_rec.id;
      v_process := private.revert_sub_key(v_process, 'qtyLaminationL1', v_out_net);
      v_process := private.revert_sub_key(v_process, 'adhesiveConsumedL1Kg', v_adh);
      v_process := private.revert_sub_key(v_process, 'laminationPlainSubstrateWastageKg', v_plain);
      v_process := private.revert_sub_key(v_process, 'laminateWastageKg', v_laminate);
    ELSIF v_stage = 'Lamination (Pass 2)' THEN
      UPDATE public.production_records SET
        qty_second_pass_l2 = round(GREATEST(COALESCE(qty_second_pass_l2, 0) - v_out_net, 0), 2),
        adhesive_consumed_l2_kg = round(GREATEST(COALESCE(adhesive_consumed_l2_kg, 0) - v_adh, 0), 2),
        lamination_plain_substrate_wastage_l2_kg = round(GREATEST(COALESCE(lamination_plain_substrate_wastage_l2_kg, 0) - COALESCE(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageL2Kg'), 0), 0), 2),
        laminate_wastage_kg = round(GREATEST(COALESCE(laminate_wastage_kg, 0) - v_laminate, 0), 2)
      WHERE id = v_rec.id;
      v_process := private.revert_sub_key(v_process, 'qtySecondPassL2', v_out_net);
      v_process := private.revert_sub_key(v_process, 'adhesiveConsumedL2Kg', v_adh);
      v_process := private.revert_sub_key(v_process, 'laminationPlainSubstrateWastageL2Kg', COALESCE(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageL2Kg'), 0));
      v_process := private.revert_sub_key(v_process, 'laminateWastageKg', v_laminate);
    ELSIF v_stage = 'Printing (Pass 2)' THEN
      UPDATE public.production_records SET
        qty_first_pass_l1 = CASE WHEN v_out_net > 0 THEN round(GREATEST(COALESCE(qty_first_pass_l1, 0) - v_out_net, 0), 2) ELSE qty_first_pass_l1 END,
        printing_plain_setting_wastage_kg = round(GREATEST(COALESCE(printing_plain_setting_wastage_kg, 0) - v_print_plain, 0), 2),
        printing_wastage_kg = round(GREATEST(COALESCE(printing_wastage_kg, 0) - v_print_waste, 0), 2)
      WHERE id = v_rec.id;
      IF v_out_net > 0 THEN
        v_process := private.revert_sub_key(v_process, 'qtyFirstPassL1', v_out_net);
      END IF;
      v_process := private.revert_sub_key(v_process, 'printingPlainSettingWastageKg', v_print_plain);
      v_process := private.revert_sub_key(v_process, 'printingWastageKg', v_print_waste);
    ELSIF v_stage = 'Slitting & Rewinding' THEN
      UPDATE public.production_records SET
        qty_slitting = round(GREATEST(COALESCE(qty_slitting, 0) - v_out_net, 0), 2),
        trim_wastage_kg = round(GREATEST(COALESCE(trim_wastage_kg, 0) - v_trim, 0), 2)
      WHERE id = v_rec.id;
      v_process := private.revert_sub_key(v_process, 'qtySlitting', v_out_net);
      v_process := private.revert_sub_key(v_process, 'trimWastageKg', v_trim);
      v_process := private.revert_sub_key(v_process, 'slittingSettingWastageKg', v_setting);
    ELSIF v_stage = 'Pouching / Bag Making' THEN
      UPDATE public.production_records SET
        qty_pouching = round(GREATEST(COALESCE(qty_pouching, 0) - v_out_net, 0), 2),
        zipper_consumed_kg = round(GREATEST(COALESCE(zipper_consumed_kg, 0) - v_zip, 0), 2),
        pouching_scrap_kg = round(GREATEST(COALESCE(pouching_scrap_kg, 0) - v_pouch, 0), 2)
      WHERE id = v_rec.id;
      v_process := private.revert_sub_key(v_process, 'qtyPouching', v_out_net);
      v_process := private.revert_sub_key(v_process, 'zipperConsumedKg', v_zip);
      v_process := private.revert_sub_key(v_process, 'pouchingScrapKg', v_pouch);
    END IF;

    UPDATE public.production_records SET
      process_logs = v_process,
      sfg_consumptions = v_new_logs,
      materials_list = v_materials,
      output_rolls = private.revert_drop_outputs(output_rolls, v_outputs),
      rolls_breakdown = private.revert_drop_outputs(rolls_breakdown, v_outputs)
    WHERE id = v_rec.id;
  END LOOP;

  IF to_regclass('public.inventory_ledger_entries') IS NOT NULL THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_substrates)
    LOOP
      v_parent_status := NULL;
      FOR v_issue IN
        SELECT * FROM public.inventory_ledger_entries
        WHERE entry_kind = 'issue'
          AND lower(btrim(barcode)) = lower(v_elem->>'barcode')
          AND record_consumed IS NOT NULL
          AND (
            production_record_id = ANY (v_record_ids)
            OR coalesce(record_payload->>'logId', '') = v_log_id
            OR cardinality(v_record_ids) = 0
          )
        FOR UPDATE
      LOOP
        IF v_issue.parent_status_before IS NOT NULL THEN
          v_parent_status := v_issue.parent_status_before;
        END IF;
        v_delta := LEAST(COALESCE(v_issue.applied_stock_kg, 0), COALESCE(v_issue.record_consumed, 0));
        IF v_delta > 0 AND v_issue.stock_item_id IS NOT NULL AND to_regclass('public.inventory') IS NOT NULL THEN
          UPDATE public.inventory
          SET stock_qty_kg = round(COALESCE(stock_qty_kg, 0) + v_delta, 2),
              last_updated = pg_catalog.now()
          WHERE id = v_issue.stock_item_id;
        END IF;
        IF v_issue.print_consumed IS NULL THEN
          DELETE FROM public.inventory_ledger_entries
          WHERE id = v_issue.id
             OR id = 'roll-return:' || v_issue.scope_key || ':' || lower(btrim(v_issue.barcode));
        ELSE
          UPDATE public.inventory_ledger_entries
          SET record_consumed = NULL,
              record_initial = NULL,
              record_payload = NULL,
              applied_stock_kg = GREATEST(COALESCE(applied_stock_kg, 0) - v_delta, 0),
              qty_source = 'print_run',
              updated_at = pg_catalog.now()
          WHERE id = v_issue.id;
        END IF;
      END LOOP;

      UPDATE public.inventory_rolls
      SET available_weight_kg = round(COALESCE(private.revert_num(v_elem->>'initialKg'), 0), 2),
          status = CASE
            WHEN v_parent_status IS NOT NULL
             AND lower(btrim(v_parent_status)) IN ('in stock (rm)', 'in stock', 'available', 'qc approved', 'approved')
              THEN v_parent_status
            ELSE 'In Stock (RM)'
          END
      WHERE lower(btrim(barcode_id)) = lower(v_elem->>'barcode');

      IF nullif(v_elem->>'balanceBarcode', '') IS NOT NULL THEN
        UPDATE public.inventory_rolls
        SET available_weight_kg = 0,
            net_weight_kg = 0,
            status = 'Reversed'
        WHERE lower(btrim(barcode_id)) = lower(v_elem->>'balanceBarcode');
      END IF;
    END LOOP;
  ELSE
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_substrates)
    LOOP
      UPDATE public.inventory_rolls
      SET available_weight_kg = round(COALESCE(private.revert_num(v_elem->>'initialKg'), 0), 2),
          status = 'In Stock (RM)'
      WHERE lower(btrim(barcode_id)) = lower(v_elem->>'barcode');
      IF nullif(v_elem->>'balanceBarcode', '') IS NOT NULL THEN
        UPDATE public.inventory_rolls
        SET available_weight_kg = 0, net_weight_kg = 0, status = 'Reversed'
        WHERE lower(btrim(barcode_id)) = lower(v_elem->>'balanceBarcode');
      END IF;
    END LOOP;
  END IF;

  v_history := private.revert_mark_history(v_history, v_log_id, v_actor, v_reason, v_at, false);
  v_notes := jsonb_set(v_notes, '{consumptionHistory}', v_history, true);
  v_notes := jsonb_set(v_notes, '{consumedKg}', to_jsonb(v_consumed_after), true);
  v_notes := jsonb_set(v_notes, '{availableKg}', to_jsonb(v_available_after), true);
  v_notes := jsonb_set(v_notes, '{status}', to_jsonb(v_status), true);
  IF v_consumed_after <= 0 THEN
    v_notes := jsonb_set(v_notes, '{balanceKeptKg}', '0'::jsonb, true);
    v_notes := jsonb_set(v_notes, '{balanceQcHoldKg}', '0'::jsonb, true);
    v_notes := jsonb_set(v_notes, '{balanceReason}', '""'::jsonb, true);
    v_notes := jsonb_set(v_notes, '{balanceNote}', '""'::jsonb, true);
  END IF;

  UPDATE public.sfg_goods
  SET consumed_kg = v_consumed_after,
      available_kg = v_available_after,
      status = v_status,
      notes = v_notes::text,
      consumption_history = v_history,
      updated_at = v_at
  WHERE sfg_batch_code = v_batch;

  UPDATE public.inventory_rolls
  SET available_weight_kg = round(COALESCE(available_weight_kg, 0) + v_restored, 2),
      status = CASE
        WHEN round(COALESCE(available_weight_kg, 0) + v_restored, 2) <= 0 THEN status
        WHEN lower(btrim(coalesce(status, ''))) IN ('consumed', 'fully consumed') THEN
          CASE WHEN v_is_fg THEN 'Ready for Dispatch' ELSE 'In Stock (SFG)' END
        ELSE status
      END
  WHERE lower(btrim(barcode_id)) = lower(v_batch);

  IF to_regclass('public.inventory') IS NOT NULL THEN
    UPDATE public.inventory
    SET stock_qty_kg = round(COALESCE(stock_qty_kg, 0) + v_restored, 2),
        allocated_qty_kg = v_consumed_after,
        metadata = CASE
          WHEN jsonb_typeof(metadata) = 'object' THEN metadata || jsonb_build_object(
            'availableQtyKg', round(COALESCE(stock_qty_kg, 0) + v_restored, 2),
            'allocatedQtyKg', v_consumed_after
          )
          ELSE metadata
        END,
        last_updated = v_at
    WHERE id = v_batch OR lower(btrim(coalesce(item_code, ''))) = lower(v_batch);
  END IF;

  FOREACH v_code IN ARRAY v_outputs LOOP
    BEGIN
      DELETE FROM public.sfg_goods WHERE sfg_batch_code = v_code AND sfg_batch_code IS DISTINCT FROM v_batch;
    EXCEPTION WHEN foreign_key_violation THEN
      UPDATE public.sfg_goods
      SET status = 'Reverted',
          available_kg = 0,
          consumed_kg = 0,
          notes = jsonb_build_object('status', 'Reverted', 'sfgBatchCode', v_code, 'availableKg', 0, 'consumedKg', 0, 'revertedFrom', v_log_id)::text
      WHERE sfg_batch_code = v_code;
    END;
    BEGIN
      DELETE FROM public.inventory_rolls WHERE lower(btrim(barcode_id)) = lower(v_code);
    EXCEPTION WHEN foreign_key_violation THEN
      UPDATE public.inventory_rolls
      SET available_weight_kg = 0, net_weight_kg = 0, status = 'Reverted'
      WHERE lower(btrim(barcode_id)) = lower(v_code);
    END;
  END LOOP;

  IF v_order <> '' AND to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    FOR v_row IN
      SELECT * FROM (VALUES
        ('lamination-plain-substrate', CASE WHEN v_stage = 'Lamination (Pass 1)' THEN v_plain ELSE 0 END),
        ('lamination-plain-substrate-l2', CASE WHEN v_stage = 'Lamination (Pass 2)' THEN round(COALESCE(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageL2Kg'), 0), 2) ELSE 0 END),
        ('laminate-wastage', CASE WHEN v_stage LIKE 'Lamination%' THEN v_laminate ELSE 0 END),
        ('plain-setting', CASE WHEN v_stage = 'Printing (Pass 2)' THEN v_print_plain ELSE 0 END),
        ('printing-wastage', CASE WHEN v_stage = 'Printing (Pass 2)' THEN v_print_waste ELSE 0 END),
        ('trim-wastage', CASE WHEN v_stage = 'Slitting & Rewinding' THEN v_trim ELSE 0 END),
        ('slitting-setting', CASE WHEN v_stage = 'Slitting & Rewinding' THEN v_setting ELSE 0 END),
        ('pouching-scrap', CASE WHEN v_stage = 'Pouching / Bag Making' THEN v_pouch ELSE 0 END)
      ) AS scrap_delta(id_key, kg)
      WHERE kg > 0
    LOOP
      v_scrap_id := 'print-scrap:' || v_order || ':' || v_row.id_key;
      v_scrap_kg := v_row.kg;
      UPDATE public.sfg_scrap_items
      SET payload = jsonb_set(
            payload,
            '{scrapQtyKg}',
            to_jsonb(round(GREATEST(COALESCE(private.revert_num(payload->>'scrapQtyKg'), 0) - v_scrap_kg, 0), 2)),
            true
          ),
          updated_at = v_at
      WHERE id = v_scrap_id;
      DELETE FROM public.sfg_scrap_items
      WHERE id = v_scrap_id
        AND COALESCE(private.revert_num(payload->>'scrapQtyKg'), 0) <= 0;
    END LOOP;
  END IF;

  IF v_order <> '' AND to_regclass('public.high_scrap_registry') IS NOT NULL THEN
    v_scrap_kg := round(
      CASE WHEN v_stage = 'Lamination (Pass 1)' THEN v_plain + v_laminate ELSE 0 END
      + CASE WHEN v_stage = 'Lamination (Pass 2)' THEN COALESCE(private.revert_num(v_scrap->>'laminationPlainSubstrateWastageL2Kg'), 0) + v_laminate ELSE 0 END
      + CASE WHEN v_stage = 'Printing (Pass 2)' THEN v_print_plain + v_print_waste ELSE 0 END
      + CASE WHEN v_stage = 'Slitting & Rewinding' THEN v_trim + v_setting ELSE 0 END
      + CASE WHEN v_stage = 'Pouching / Bag Making' THEN v_pouch ELSE 0 END
    , 2);
    IF v_scrap_kg > 0 THEN
      UPDATE public.high_scrap_registry
      SET payload = jsonb_set(
            payload,
            '{totalWastageKg}',
            to_jsonb(round(GREATEST(COALESCE(private.revert_num(payload->>'totalWastageKg'), 0) - v_scrap_kg, 0), 2)),
            true
          ),
          updated_at = v_at
      WHERE id = 'high-scrap:' || v_order;
      DELETE FROM public.high_scrap_registry
      WHERE id = 'high-scrap:' || v_order
        AND COALESCE(private.revert_num(payload->>'totalWastageKg'), 0) <= 0;
    END IF;
  END IF;

  IF v_hold_kg > 0 AND to_regclass('public.sfg_qc_hold_items') IS NOT NULL THEN
    DELETE FROM public.sfg_qc_hold_items AS hold
    WHERE coalesce(hold.payload->>'parentSfgBatchCode', hold.payload->>'parentSfgId', '') = v_batch
      AND abs(COALESCE(private.revert_num(hold.payload->>'totalHoldKg'), 0) - v_hold_kg) <= 0.05
      AND upper(coalesce(hold.payload->>'status', 'QC_HOLD')) = 'QC_HOLD'
      AND COALESCE(private.revert_num(hold.payload->>'approvedKg'), 0) = 0
      AND COALESCE(private.revert_num(hold.payload->>'scrappedKg'), 0) = 0
      AND (
        private.revert_time(hold.payload->>'timestamp') IS NULL
        OR (
          private.revert_time(hold.payload->>'timestamp') >= v_at_log - interval '2 minutes'
          AND private.revert_time(hold.payload->>'timestamp') <= v_at_log + interval '30 minutes'
        )
      );
  END IF;

  IF v_has_pack AND to_regclass('public.packing_list_consumptions') IS NOT NULL THEN
    DELETE FROM public.packing_list_consumptions WHERE id = v_log_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.packing_list_consumptions WHERE packing_list_id = v_pack.packing_list_id
    ) AND v_ship.id = 'DISP-PL-' || v_log_id THEN
      DELETE FROM public.dispatch_shipments WHERE dispatch_id = v_pack.packing_list_id;
      IF to_regclass('public.packing_gain_loss') IS NOT NULL THEN
        DELETE FROM public.packing_gain_loss WHERE packing_list_id = v_pack.packing_list_id;
      END IF;
    ELSIF to_regprocedure('private.packing_shipment_json(text)') IS NOT NULL THEN
      UPDATE public.dispatch_shipments
      SET payload = private.packing_shipment_json(v_pack.packing_list_id),
          updated_at = v_at
      WHERE dispatch_id = v_pack.packing_list_id;
      IF to_regprocedure('private.refresh_packing_gain_loss(text)') IS NOT NULL THEN
        PERFORM private.refresh_packing_gain_loss(v_pack.packing_list_id);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE public.orders
    SET sfg_consumptions = private.revert_mark_history(sfg_consumptions, v_log_id, v_actor, v_reason, v_at, true)
    WHERE private.revert_log_found(sfg_consumptions, v_log_id);
  END IF;

  v_message := format(
    '%s reverted %s kg on roll %s (job %s). Reason: %s',
    v_actor,
    to_char(v_restored, 'FM999999990.00'),
    v_batch,
    coalesce(nullif(v_job, ''), 'unknown job'),
    v_reason
  );

  IF to_regclass('public.erp_notifications') IS NOT NULL THEN
    INSERT INTO public.erp_notifications (id, payload, created_at, updated_at)
    VALUES (
      'CONSUMPTION-REVERT-' || v_log_id,
      jsonb_build_object(
        'id', 'CONSUMPTION-REVERT-' || v_log_id,
        'type', 'CONSUMPTION_REVERTED',
        'audience', 'Admin',
        'title', 'Consumption reverted',
        'message', v_message,
        'barcode', v_batch,
        'jobName', v_job,
        'kgRestored', v_restored,
        'revertedBy', v_actor,
        'reason', v_reason,
        'logId', v_log_id,
        'read', false,
        'timestamp', v_at
      ),
      v_at,
      v_at
    )
    ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at;
  END IF;

  BEGIN
    PERFORM public.record_audit_log('UPDATE', 'SFG Store', left(v_message, 4000), v_batch);
  EXCEPTION WHEN others THEN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (id, username, user_role, action_type, module, details, target_id, created_at, actor_id)
      VALUES (
        'LOG-REV-' || substr(md5(v_log_id || v_at::text), 1, 16),
        v_actor,
        '',
        'UPDATE',
        'SFG Store',
        left(v_message, 4000),
        v_batch,
        v_at,
        auth.uid()
      );
    END IF;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'applied', true,
    'blocks', '[]'::jsonb,
    'lines', to_jsonb(v_lines),
    'batch', v_batch,
    'logId', v_log_id,
    'jobName', v_job,
    'restoredKg', v_restored,
    'consumedBefore', v_consumed_before,
    'consumedAfter', v_consumed_after,
    'availableBefore', v_available_before,
    'availableAfter', v_available_after,
    'statusAfter', v_status,
    'revertedBy', v_actor,
    'reason', v_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_sfg_consumption_revert(p_batch text, p_log_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.revert_sfg_consumption(p_batch, p_log_id, NULL, false);
$$;

CREATE OR REPLACE FUNCTION public.revert_sfg_consumption(p_batch text, p_log_id text, p_reason text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.revert_sfg_consumption(p_batch, p_log_id, p_reason, true);
$$;

REVOKE ALL ON FUNCTION private.revert_num(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_time(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_log_reverted(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_log_kg(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_log_found(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_output_codes(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_substrates(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_mark_log(jsonb, text, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_mark_history(jsonb, text, text, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_drop_materials(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_drop_outputs(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_sub_key(jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revert_sfg_consumption(text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.revert_sfg_consumption(text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_sfg_consumption_revert(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_sfg_consumption(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_sfg_consumption_revert(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_sfg_consumption(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.revert_sfg_consumption(text, text, text) IS
  'Undo one SFG/FG consumption and mark it Reverted. Admin, Plant Manager, and Production Manager only, within 7 days.';
