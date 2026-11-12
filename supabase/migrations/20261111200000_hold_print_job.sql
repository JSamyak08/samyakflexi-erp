-- Hold and restart a rotogravure print job.
--
-- Timestamped after 20261111183000 so this copy of record_print_run is the
-- one that remains when that progress freeze is also applied. A held job is
-- not Completed: printing_status is 'Hold on Printing', isPrintingCompleted
-- stays false, and restart is a new open run. Progress is a no-op while the
-- job is held or already has an end time, and the no-op response does not
-- claim the job is completed.
--
-- Usable print goes to the SFG store the same way End Job does. Unusable
-- print goes to the existing QC Hold Store. Input-roll consumption and the
-- balance barcode go through sync_job_roll_issues, which is also what End
-- Job uses, so the item ledger is updated once per roll and is not deducted
-- twice. The balance barcode is the existing parent || '-BAL' code.

CREATE OR REPLACE FUNCTION private.caller_can_hold_print()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(private.app_roles()) AS granted(role_name)
    WHERE granted.role_name IN (
      'Admin',
      'Plant Manager',
      'Production Manager',
      'Printing Operator',
      'Shop Floor Operator'
    )
    AND (
      granted.role_name = 'Admin'
      OR EXISTS (
        SELECT 1
        FROM public.role_permissions AS rp
        WHERE rp.role = granted.role_name
          AND rp.permissions -> 'printing_scheduler' = 'true'::jsonb
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.merge_hold_input_rolls(p_history jsonb, p_current jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  entry jsonb;
  roll jsonb;
  merged jsonb := '[]'::jsonb;
  barcode text;
BEGIN
  IF jsonb_typeof(p_history) = 'array' THEN
    FOR entry IN SELECT value FROM jsonb_array_elements(p_history) AS listed(value)
    LOOP
      IF jsonb_typeof(entry -> 'inputRolls') IS DISTINCT FROM 'array' THEN
        CONTINUE;
      END IF;
      FOR roll IN SELECT value FROM jsonb_array_elements(entry -> 'inputRolls') AS listed(value)
      LOOP
        barcode := lower(btrim(coalesce(roll ->> 'barcodeId', roll ->> 'barcode', '')));
        IF barcode = '' THEN
          CONTINUE;
        END IF;
        merged := (
          SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
          FROM jsonb_array_elements(merged) AS listed(item)
          WHERE lower(btrim(coalesce(item ->> 'barcodeId', item ->> 'barcode', ''))) IS DISTINCT FROM barcode
        ) || jsonb_build_array(roll);
      END LOOP;
    END LOOP;
  END IF;
  IF jsonb_typeof(p_current) = 'array' THEN
    FOR roll IN SELECT value FROM jsonb_array_elements(p_current) AS listed(value)
    LOOP
      barcode := lower(btrim(coalesce(roll ->> 'barcodeId', roll ->> 'barcode', '')));
      IF barcode = '' THEN
        CONTINUE;
      END IF;
      merged := (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM jsonb_array_elements(merged) AS listed(item)
        WHERE lower(btrim(coalesce(item ->> 'barcodeId', item ->> 'barcode', ''))) IS DISTINCT FROM barcode
      ) || jsonb_build_array(roll);
    END LOOP;
  END IF;
  RETURN merged;
END;
$$;

CREATE OR REPLACE FUNCTION private.print_job_name(
  p_job_name text,
  p_details jsonb,
  p_status text,
  p_completed boolean,
  p_machine_id text,
  p_input_rolls jsonb,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  delim_at integer;
  name_base text;
  raw_env text;
  envelope jsonb;
BEGIN
  delim_at := position(' ||| ' IN coalesce(p_job_name, ''));
  IF delim_at > 0 THEN
    name_base := substring(p_job_name FROM 1 FOR delim_at - 1);
    raw_env := substring(p_job_name FROM delim_at + 5);
  ELSE
    name_base := coalesce(p_job_name, '');
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
  envelope := jsonb_set(envelope, '{jobDetails}', coalesce(p_details, '{}'::jsonb), true);
  envelope := jsonb_set(envelope, '{printingStatus}', to_jsonb(coalesce(p_status, '')), true);
  envelope := jsonb_set(envelope, '{isPrintingCompleted}', to_jsonb(coalesce(p_completed, false)), true);
  envelope := jsonb_set(envelope, '{printingStartTime}', CASE WHEN p_start IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_start) END, true);
  envelope := jsonb_set(envelope, '{printingEndTime}', CASE WHEN p_end IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_end) END, true);
  IF p_machine_id IS NOT NULL THEN
    envelope := jsonb_set(envelope, '{machineId}', to_jsonb(p_machine_id), true);
  END IF;
  IF p_input_rolls IS NOT NULL AND jsonb_typeof(p_input_rolls) = 'array' THEN
    envelope := jsonb_set(envelope, '{inputRollsList}', p_input_rolls, true);
  END IF;
  RETURN name_base || ' ||| ' || envelope::text;
END;
$$;

CREATE OR REPLACE FUNCTION private.append_json_rolls(p_existing jsonb, p_added jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  roll jsonb;
  merged jsonb := CASE WHEN jsonb_typeof(p_existing) = 'array' THEN p_existing ELSE '[]'::jsonb END;
  barcode text;
BEGIN
  IF jsonb_typeof(p_added) IS DISTINCT FROM 'array' THEN
    RETURN merged;
  END IF;
  FOR roll IN SELECT value FROM jsonb_array_elements(p_added) AS listed(value)
  LOOP
    barcode := lower(btrim(coalesce(roll ->> 'barcodeId', roll ->> 'barcode', '')));
    IF barcode = '' THEN
      CONTINUE;
    END IF;
    merged := (
      SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
      FROM jsonb_array_elements(merged) AS listed(item)
      WHERE lower(btrim(coalesce(item ->> 'barcodeId', item ->> 'barcode', ''))) IS DISTINCT FROM barcode
    ) || jsonb_build_array(roll);
  END LOOP;
  RETURN merged;
END;
$$;

-- Extra printed rolls after a hold. Barcodes are per segment so a retry
-- updates the same rows, and earlier SFG rolls stay on the lot.
CREATE OR REPLACE FUNCTION private.post_additional_print_rolls(
  p_order_id text,
  p_patch jsonb,
  p_balance jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row record;
  roll jsonb;
  child jsonb;
  code_base text;
  seq integer := 0;
  weight numeric;
  meters numeric;
  roll_meters numeric;
  barcode text;
  lot_code text;
  printed jsonb := '[]'::jsonb;
  consumed jsonb := '[]'::jsonb;
  segment text;
  prefix text;
  job_name text := '';
  client_name text := '';
  job_code text := '';
  film text := '';
  micron numeric := 0;
  width_mm numeric := 0;
  storage text;
  input_codes jsonb := '[]'::jsonb;
  balance jsonb;
  existing public.sfg_goods%ROWTYPE;
  has_existing boolean := false;
  kept jsonb := '{}'::jsonb;
  editor boolean := false;
  consumed_kg numeric := 0;
  dispatched_kg numeric := 0;
  net_kg numeric := 0;
  available_kg numeric := 0;
  row_id uuid;
  notes jsonb;
  all_children jsonb := '[]'::jsonb;
  order_meters numeric := 0;
BEGIN
  IF NOT private.caller_can_print() THEN
    RAISE EXCEPTION 'Not allowed to record printed output from a print run'
      USING ERRCODE = '42501';
  END IF;
  p_patch := COALESCE(p_patch, '{}'::jsonb);
  balance := CASE WHEN jsonb_typeof(p_balance) = 'array' THEN p_balance ELSE '[]'::jsonb END;
  segment := coalesce(nullif(btrim(p_patch ->> 'outputSegmentId'), ''), 'end');
  prefix := CASE
    WHEN segment ~ '^hold-[0-9]+$' THEN 'H' || substring(segment FROM 6)
    ELSE 'E'
  END;
  meters := private.print_patch_number(p_patch, 'actualMetersPrinted');

  IF to_regclass('public.orders') IS NOT NULL THEN
    SELECT o.job_name, o.client_name, o.job_details, o.actual_meters_printed
      INTO order_row
    FROM public.orders AS o
    WHERE o.id = p_order_id;
    IF FOUND THEN
      job_name := split_part(coalesce(order_row.job_name, ''), ' ||| ', 1);
      client_name := coalesce(order_row.client_name, '');
      job_code := coalesce(order_row.job_details ->> 'jobCode', '');
      order_meters := COALESCE(order_row.actual_meters_printed, 0);
    END IF;
  END IF;

  job_name := coalesce(nullif(btrim(p_patch ->> 'jobName'), ''), nullif(job_name, ''), 'Untitled Job');
  client_name := coalesce(nullif(btrim(p_patch ->> 'clientName'), ''), client_name, '');
  job_code := coalesce(nullif(btrim(p_patch ->> 'jobCode'), ''), nullif(job_code, ''), coalesce(p_order_id, ''));
  film := coalesce(nullif(btrim(p_patch ->> 'filmType'), ''), '');
  micron := COALESCE(private.print_patch_number(p_patch, 'micron'), 0);
  width_mm := COALESCE(private.print_patch_number(p_patch, 'widthMm'), 0);
  storage := coalesce(nullif(btrim(p_patch ->> 'storageBay'), ''), 'SFG Store (Pre-Lamination)');
  code_base := regexp_replace(coalesce(nullif(job_code, ''), nullif(btrim(p_order_id), ''), 'ORD-000'), '[^A-Za-z0-9-]', '', 'g');
  IF code_base = '' THEN
    code_base := 'ORD-000';
  END IF;
  lot_code := 'SFG-LOT-' || coalesce(p_order_id, '');

  IF jsonb_typeof(p_patch -> 'inputRollsList') = 'array' THEN
    FOR roll IN SELECT value FROM jsonb_array_elements(p_patch -> 'inputRollsList') AS listed(value)
    LOOP
      barcode := btrim(coalesce(roll ->> 'barcodeId', roll ->> 'barcode', ''));
      IF barcode = '' THEN
        CONTINUE;
      END IF;
      input_codes := input_codes || jsonb_build_array(to_jsonb(barcode));
      consumed := consumed || jsonb_build_array(jsonb_build_object(
        'barcodeId', barcode,
        'consumedWeightKg', private.print_patch_number(roll, 'consumedWeightKg'),
        'initialWeightKg', COALESCE(private.print_patch_number(roll, 'initialWeightKg'), private.print_patch_number(roll, 'initialKg')),
        'filmType', coalesce(roll ->> 'filmType', '')
      ));
    END LOOP;
  END IF;

  IF jsonb_typeof(p_patch -> 'outputRolls') = 'array' THEN
    FOR roll IN SELECT value FROM jsonb_array_elements(p_patch -> 'outputRolls') AS listed(value)
    LOOP
      weight := COALESCE(private.print_patch_number(roll, 'netWeightKg'), private.print_patch_number(roll, 'totalNetKg'));
      IF weight IS NULL OR weight = 0 THEN
        CONTINUE;
      END IF;
      IF weight < 0 THEN
        RAISE EXCEPTION 'Printed roll weight cannot be negative'
          USING ERRCODE = '22023';
      END IF;
      seq := seq + 1;
      barcode := 'SFG-BC-' || code_base || '-' || prefix || '-' || seq::text;
      roll_meters := private.print_patch_number(roll, 'lengthMeters');
      printed := printed || jsonb_build_array(jsonb_build_object(
        'barcodeId', barcode,
        'rollNo', seq,
        'netWeightKg', round(weight, 2),
        'grossWeightKg', COALESCE(private.print_patch_number(roll, 'grossWeightKg'), weight),
        'tareWeightKg', COALESCE(private.print_patch_number(roll, 'tareWeightKg'), 0),
        'lengthMeters', roll_meters,
        'filmType', coalesce(nullif(btrim(roll ->> 'filmType'), ''), film),
        'micron', COALESCE(private.print_patch_number(roll, 'micron'), micron),
        'widthMm', COALESCE(private.print_patch_number(roll, 'widthMm'), width_mm),
        'itemName', coalesce(nullif(btrim(roll ->> 'itemName'), ''), job_name || ' - Printed SFG Roll ' || prefix || '-' || seq::text),
        'storageBay', coalesce(nullif(btrim(roll ->> 'storageBay'), ''), nullif(btrim(roll ->> 'locationBay'), ''), storage),
        'printSegment', segment
      ));
    END LOOP;
  END IF;

  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    FOR child IN SELECT value FROM jsonb_array_elements(printed) AS listed(value)
    LOOP
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, job_name, order_id,
        job_code, client_name, film_type, micron, width_mm,
        net_weight_kg, available_weight_kg, gross_weight_kg, tare_weight_kg,
        length_meters, status, qc_status, sfg_type, location_bay,
        machine_name, operator_name, shift, inward_datetime, production_date, metadata
      ) VALUES (
        child ->> 'barcodeId',
        'SEMI_FINISHED_GOODS',
        '',
        child ->> 'itemName',
        'Semi-Finished Goods (SFG)',
        job_name,
        p_order_id,
        job_code,
        client_name,
        NULLIF(child ->> 'filmType', ''),
        COALESCE((child ->> 'micron')::numeric, 0),
        COALESCE((child ->> 'widthMm')::numeric, 0),
        COALESCE((child ->> 'netWeightKg')::numeric, 0),
        COALESCE((child ->> 'netWeightKg')::numeric, 0),
        COALESCE((child ->> 'grossWeightKg')::numeric, 0),
        COALESCE((child ->> 'tareWeightKg')::numeric, 0),
        CASE
          WHEN NULLIF(btrim(child ->> 'lengthMeters'), '') IS NULL THEN NULL
          WHEN (child ->> 'lengthMeters')::numeric > 0 THEN (child ->> 'lengthMeters')::numeric
          ELSE NULL
        END,
        'In Stock (SFG)',
        'Approved',
        'Printed Rolls',
        child ->> 'storageBay',
        coalesce(p_patch ->> 'machineName', ''),
        coalesce(p_patch ->> 'operatorName', ''),
        coalesce(p_patch ->> 'shift', ''),
        pg_catalog.now(),
        (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::date,
        jsonb_build_object(
          'parentSfgBatchCode', lot_code,
          'orderId', p_order_id,
          'source', 'print_run',
          'printSegment', segment
        )
      )
      ON CONFLICT (barcode_id) DO UPDATE
      SET item_name = EXCLUDED.item_name,
          net_weight_kg = EXCLUDED.net_weight_kg,
          available_weight_kg = EXCLUDED.available_weight_kg,
          gross_weight_kg = EXCLUDED.gross_weight_kg,
          tare_weight_kg = EXCLUDED.tare_weight_kg,
          length_meters = COALESCE(EXCLUDED.length_meters, public.inventory_rolls.length_meters),
          film_type = COALESCE(EXCLUDED.film_type, public.inventory_rolls.film_type),
          status = 'In Stock (SFG)',
          order_id = EXCLUDED.order_id,
          job_name = EXCLUDED.job_name,
          job_code = EXCLUDED.job_code,
          metadata = COALESCE(public.inventory_rolls.metadata, '{}'::jsonb) || EXCLUDED.metadata;
      IF to_regprocedure('private.note_printed_barcode(text, text, text, text)') IS NOT NULL THEN
        PERFORM private.note_printed_barcode(child ->> 'barcodeId', p_order_id, child ->> 'itemName', 'printed_sfg');
      END IF;
    END LOOP;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'barcodeId', roll.barcode_id,
      'netWeightKg', roll.net_weight_kg,
      'lengthMeters', NULLIF(roll.length_meters, 0)
    ) ORDER BY roll.barcode_id), '[]'::jsonb)
      INTO all_children
    FROM public.inventory_rolls AS roll
    WHERE roll.order_id = p_order_id
      AND roll.roll_type = 'SEMI_FINISHED_GOODS'
      AND coalesce(roll.metadata ->> 'source', '') = 'print_run'
      AND coalesce(roll.status, '') NOT IN ('Reversed', 'Void');
  END IF;

  IF jsonb_typeof(balance) = 'array' AND to_regprocedure('private.note_printed_barcode(text, text, text, text)') IS NOT NULL THEN
    FOR child IN SELECT value FROM jsonb_array_elements(balance) AS listed(value)
    LOOP
      barcode := btrim(coalesce(child ->> 'barcodeId', child ->> 'barcode', ''));
      PERFORM private.note_printed_barcode(
        barcode,
        p_order_id,
        coalesce(nullif(btrim(child ->> 'itemName'), ''), barcode),
        'balance'
      );
    END LOOP;
  END IF;

  net_kg := COALESCE((
    SELECT sum(COALESCE((value ->> 'netWeightKg')::numeric, 0))
    FROM jsonb_array_elements(all_children) AS listed(value)
  ), 0);
  IF net_kg = 0 THEN
    net_kg := COALESCE((
      SELECT sum(COALESCE((value ->> 'netWeightKg')::numeric, 0))
      FROM jsonb_array_elements(printed) AS listed(value)
    ), 0);
    all_children := printed;
  END IF;

  IF to_regclass('public.sfg_goods') IS NOT NULL AND net_kg > 0 THEN
    IF to_regprocedure('private.can_edit_sfg_store(text[])') IS NOT NULL THEN
      editor := COALESCE(
        private.can_edit_sfg_store(ARRAY['production_records', 'inventory', 'printing_scheduler']::text[]),
        false
      );
    END IF;
    SELECT * INTO existing FROM public.sfg_goods WHERE sfg_batch_code = lot_code;
    has_existing := FOUND;
    IF has_existing AND existing.notes IS NOT NULL AND left(btrim(existing.notes), 1) = '{' THEN
      BEGIN
        kept := existing.notes::jsonb;
      EXCEPTION WHEN others THEN
        kept := '{}'::jsonb;
      END;
    END IF;
    IF kept IS NULL OR jsonb_typeof(kept) IS DISTINCT FROM 'object' THEN
      kept := '{}'::jsonb;
    END IF;
    IF editor THEN
      consumed_kg := 0;
      dispatched_kg := 0;
    ELSE
      consumed_kg := CASE WHEN has_existing THEN COALESCE(existing.consumed_kg, 0) ELSE 0 END;
      BEGIN
        dispatched_kg := COALESCE(NULLIF(kept ->> 'dispatchedKg', '')::numeric, 0);
      EXCEPTION WHEN others THEN
        dispatched_kg := 0;
      END;
    END IF;
    available_kg := greatest(0, net_kg - consumed_kg - dispatched_kg);
    row_id := CASE WHEN has_existing THEN existing.id ELSE gen_random_uuid() END;
    notes := jsonb_build_object(
      'isPrintedLot', true,
      'sfgBatchCode', lot_code,
      'orderId', p_order_id,
      'jobName', job_name,
      'jobCode', job_code,
      'clientName', client_name,
      'filmType', film,
      'category', 'Semi-Finished Goods (SFG)',
      'rollType', 'SFG',
      'sfgType', 'Printed Rolls',
      'totalNetKg', net_kg,
      'consumedKg', consumed_kg,
      'dispatchedKg', dispatched_kg,
      'availableKg', available_kg,
      'totalMeters', CASE WHEN order_meters > 0 THEN order_meters ELSE COALESCE(meters, 0) END,
      'rollsCount', jsonb_array_length(all_children),
      'childRolls', all_children,
      'runBalanceRolls', private.append_json_rolls(kept -> 'runBalanceRolls', balance),
      'runConsumedRolls', private.append_json_rolls(kept -> 'runConsumedRolls', consumed),
      'inputBarcodeIds', COALESCE(kept -> 'inputBarcodeIds', '[]'::jsonb) || input_codes,
      'consumptionHistory', COALESCE(kept -> 'consumptionHistory', '[]'::jsonb),
      'printedAllocations', COALESCE(kept -> 'printedAllocations', '[]'::jsonb)
    );
    INSERT INTO public.sfg_goods (
      id, sfg_batch_code, sfg_type, order_id, job_name, job_code, client_name,
      film_type, micron, width_mm, total_gross_kg, gross_weight_kg, tare_weight_kg,
      total_net_kg, consumed_kg, available_kg, total_meters, rolls_count,
      machine_name, operator_name, shift, storage_bay, production_date, status, notes, updated_at
    ) VALUES (
      row_id, lot_code, 'Printed Rolls', p_order_id, job_name, job_code, client_name,
      film, micron, width_mm, net_kg, net_kg, 0, net_kg, consumed_kg, available_kg,
      CASE WHEN order_meters > 0 THEN order_meters ELSE COALESCE(meters, 0) END,
      jsonb_array_length(all_children),
      coalesce(p_patch ->> 'machineName', ''),
      coalesce(p_patch ->> 'operatorName', ''),
      coalesce(p_patch ->> 'shift', ''),
      storage,
      (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::date,
      CASE
        WHEN consumed_kg > 0 AND available_kg <= 0 THEN 'Fully Consumed'
        WHEN consumed_kg > 0 THEN 'Partially Consumed'
        ELSE 'In Stock (WIP)'
      END,
      notes::text,
      pg_catalog.now()
    )
    ON CONFLICT (sfg_batch_code) DO UPDATE
    SET total_gross_kg = EXCLUDED.total_gross_kg,
        gross_weight_kg = EXCLUDED.gross_weight_kg,
        total_net_kg = EXCLUDED.total_net_kg,
        consumed_kg = EXCLUDED.consumed_kg,
        available_kg = EXCLUDED.available_kg,
        total_meters = EXCLUDED.total_meters,
        rolls_count = EXCLUDED.rolls_count,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = pg_catalog.now();
  END IF;

  RETURN jsonb_build_object(
    'printedRolls', printed,
    'balanceRolls', balance,
    'consumedRolls', consumed
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.post_print_qc_hold(
  p_order_id text,
  p_hold_id text,
  p_patch jsonb,
  p_reason text,
  p_note text,
  p_kg numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row record;
  job_name text := '';
  client_name text := '';
  job_code text := '';
  payload jsonb;
  reason_text text;
BEGIN
  IF NOT private.caller_can_hold_print() THEN
    RAISE EXCEPTION 'Not allowed to hold a print job'
      USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.sfg_qc_hold_items') IS NULL THEN
    RAISE EXCEPTION 'QC Hold Store is not available'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    SELECT o.job_name, o.client_name, o.job_details
      INTO order_row
    FROM public.orders AS o
    WHERE o.id = p_order_id;
    IF FOUND THEN
      job_name := split_part(coalesce(order_row.job_name, ''), ' ||| ', 1);
      client_name := coalesce(order_row.client_name, '');
      job_code := coalesce(order_row.job_details ->> 'jobCode', '');
    END IF;
  END IF;
  job_name := coalesce(nullif(btrim(p_patch ->> 'jobName'), ''), nullif(job_name, ''), 'Untitled Job');
  client_name := coalesce(nullif(btrim(p_patch ->> 'clientName'), ''), client_name, '');
  job_code := coalesce(nullif(btrim(p_patch ->> 'jobCode'), ''), nullif(job_code, ''), coalesce(p_order_id, ''));
  reason_text := p_reason;
  IF btrim(coalesce(p_note, '')) <> '' THEN
    reason_text := reason_text || ': ' || btrim(p_note);
  END IF;
  payload := jsonb_build_object(
    'id', p_hold_id,
    'barcodeId', p_hold_id,
    'sfgBatchCode', p_hold_id,
    'orderId', p_order_id,
    'jobName', job_name,
    'jobCode', job_code,
    'clientName', client_name,
    'filmType', coalesce(p_patch ->> 'filmType', ''),
    'micron', COALESCE(private.print_patch_number(p_patch, 'micron'), 0),
    'widthMm', COALESCE(private.print_patch_number(p_patch, 'widthMm'), 0),
    'totalHoldKg', round(p_kg, 2),
    'remainingHoldKg', round(p_kg, 2),
    'approvedKg', 0,
    'scrappedKg', 0,
    'numberOfRolls', 1,
    'rollWeights', jsonb_build_array(round(p_kg, 2)),
    'holdReason', reason_text,
    'targetProcess', 'QC Hold Store',
    'operatorName', coalesce(p_patch ->> 'operatorName', ''),
    'shift', coalesce(p_patch ->> 'shift', ''),
    'date', to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
    'timestamp', pg_catalog.now(),
    'status', 'QC_HOLD',
    'isQCHold', true,
    'approvalLogs', '[]'::jsonb,
    'scrapLogs', '[]'::jsonb,
    'source', 'print_hold'
  );
  INSERT INTO public.sfg_qc_hold_items (id, payload, updated_at)
  VALUES (p_hold_id, payload, pg_catalog.now())
  ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload,
      updated_at = pg_catalog.now();
  RETURN payload;
END;
$$;
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

  p_patch := COALESCE(p_patch, '{}'::jsonb);

  -- Hold is not Completed. Restart goes through restart_held_print_run so the
  -- hold history keeps the restart time and machine. A plain start must not
  -- clear the hold without that log.
  IF p_action = 'start' AND lower(btrim(COALESCE(row.printing_status, ''))) = 'hold on printing' THEN
    RAISE EXCEPTION 'Restart a held print job with restart_held_print_run'
      USING ERRCODE = '22023';
  END IF;

  -- A finished press run is closed. Progress is the live autosave, and a
  -- stale press tab must not replace the input rolls or any other run data
  -- after printing is Completed, after the run has an end time, or while the
  -- job is Hold on Printing. The returned flag stays false for a hold so a
  -- stale autosave cannot mark the job Completed. An open run still accepts
  -- progress.
  IF p_action = 'progress' AND (
    lower(btrim(COALESCE(row.printing_status, ''))) = 'completed'
    OR lower(btrim(COALESCE(row.job_details->>'isPrintingCompleted', ''))) IN ('true', 't')
    OR row.printing_end_time IS NOT NULL
    OR lower(btrim(COALESCE(row.printing_status, ''))) = 'hold on printing'
  ) THEN
    RETURN jsonb_build_object(
      'id', row.id,
      'status', row.status,
      'closeMode', row.close_mode,
      'printingStatus', row.printing_status,
      'printingStartTime', row.printing_start_time,
      'printingEndTime', row.printing_end_time,
      'isPrintingCompleted', (
        lower(btrim(COALESCE(row.printing_status, ''))) = 'completed'
        OR lower(btrim(COALESCE(row.job_details->>'isPrintingCompleted', ''))) IN ('true', 't')
      ) AND lower(btrim(COALESCE(row.printing_status, ''))) IS DISTINCT FROM 'hold on printing',
      'machineId', row.machine_id,
      'actualMetersPrinted', row.actual_meters_printed,
      'printedOutputKg', row.printed_output_kg,
      'inkGsmInSpeed', row.ink_gsm_in_speed,
      'printingNotes', row.printing_notes,
      'nextProcess', row.job_details->>'nextProcess',
      'inputRollsList', COALESCE(row.job_details->'inputRollsList', '[]'::jsonb),
      'printHoldHistory', COALESCE(row.job_details->'printHoldHistory', '[]'::jsonb),
      'holdReason', COALESCE(row.job_details->>'holdReason', ''),
      'balanceRolls', '[]'::jsonb
    );
  END IF;

  manual := public.order_is_manually_closed(row.close_mode, row.job_details);
  details := COALESCE(row.job_details, '{}'::jsonb);

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

  -- A job that was held keeps the earlier metres and kilograms. The end
  -- patch is this run only, so add it while the run is still open. A retry
  -- after Completed leaves the stored totals and the merged input rolls.
  IF p_action = 'end'
     AND jsonb_typeof(details->'printHoldHistory') = 'array'
     AND jsonb_array_length(details->'printHoldHistory') > 0 THEN
    IF public.order_print_run_is_active(row.printing_status, row.printing_start_time, row.printing_end_time) THEN
      IF p_patch ? 'inputRollsList' AND jsonb_typeof(p_patch->'inputRollsList') = 'array' THEN
        p_patch := jsonb_set(
          p_patch,
          '{inputRollsList}',
          private.merge_hold_input_rolls(details->'printHoldHistory', p_patch->'inputRollsList'),
          true
        );
      END IF;
      IF p_patch ? 'actualMetersPrinted' THEN
        meters := COALESCE(row.actual_meters_printed, 0) + COALESCE(meters, 0);
      END IF;
      IF p_patch ? 'printedOutputKg' THEN
        output_kg := COALESCE(row.printed_output_kg, 0) + COALESCE(output_kg, 0);
      END IF;
    ELSE
      meters := row.actual_meters_printed;
      output_kg := row.printed_output_kg;
      p_patch := p_patch - 'inputRollsList' - 'actualMetersPrinted' - 'printedOutputKg';
    END IF;
  END IF;

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
    'printHoldHistory', COALESCE(row.job_details->'printHoldHistory', '[]'::jsonb),
    'holdReason', COALESCE(row.job_details->>'holdReason', ''),
    'balanceRolls', COALESCE(balance_rolls, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_print_run(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_print_run(text, text, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.hold_print_run(
  p_order_id text,
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
  history jsonb;
  entry jsonb;
  roll jsonb;
  reason text;
  note text;
  usable boolean;
  meters numeric;
  printed_kg numeric;
  initial_kg numeric;
  consumed_kg numeric;
  balance_meters numeric;
  consumed_total numeric := 0;
  actor text;
  ended_at timestamptz := pg_catalog.now();
  segment text;
  hold_id text;
  merged jsonb;
  balance_rolls jsonb := '[]'::jsonb;
  outputs jsonb := '{}'::jsonb;
  qc_hold jsonb := NULL;
  empty_inputs jsonb := '[]'::jsonb;
  idx integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to hold a print job'
      USING ERRCODE = '42501';
  END IF;
  IF NOT private.caller_can_hold_print() THEN
    RAISE EXCEPTION 'Not allowed to hold a print job'
      USING ERRCODE = '42501';
  END IF;
  IF to_regprocedure('public.order_print_run_is_active(text, timestamptz, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Print run recording is not available'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.order_print_run_is_active(row.printing_status, row.printing_start_time, row.printing_end_time) THEN
    RAISE EXCEPTION 'Only a running print job can be held'
      USING ERRCODE = '22023';
  END IF;

  p_patch := COALESCE(p_patch, '{}'::jsonb);
  reason := btrim(coalesce(p_patch ->> 'holdReason', ''));
  note := btrim(coalesce(p_patch ->> 'holdNote', ''));
  IF reason NOT IN (
    'Cylinder Chroming Issue',
    'Cylinder Damage Issue',
    'Machine Maintenance',
    'Urgent Job Changeover',
    'Rubber Roller Issue',
    'Raw Material Issue',
    'Other Reason'
  ) THEN
    RAISE EXCEPTION 'Choose a hold reason'
      USING ERRCODE = '22023';
  END IF;
  IF reason = 'Other Reason' AND note = '' THEN
    RAISE EXCEPTION 'Other Reason needs a note'
      USING ERRCODE = '22023';
  END IF;
  IF NOT (p_patch ? 'printedUsable') THEN
    RAISE EXCEPTION 'Say whether the printed quantity is usable'
      USING ERRCODE = '22023';
  END IF;
  usable := lower(btrim(coalesce(p_patch ->> 'printedUsable', ''))) IN ('true', 't', 'yes', '1');
  meters := private.print_patch_number(p_patch, 'actualMetersPrinted');
  printed_kg := private.print_patch_number(p_patch, 'printedOutputKg');
  IF meters IS NULL OR meters <= 0 THEN
    RAISE EXCEPTION 'Enter the meters run before stop'
      USING ERRCODE = '22023';
  END IF;
  IF printed_kg IS NULL OR printed_kg <= 0 THEN
    RAISE EXCEPTION 'Enter the print quantity in kilograms'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_patch -> 'inputRollsList') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Enter the consumed weight for at least one input roll'
      USING ERRCODE = '22023';
  END IF;
  FOR roll IN SELECT value FROM jsonb_array_elements(p_patch -> 'inputRollsList') AS listed(value)
  LOOP
    consumed_kg := COALESCE(private.print_patch_number(roll, 'consumedWeightKg'), private.print_patch_number(roll, 'consumedKg'));
    initial_kg := COALESCE(private.print_patch_number(roll, 'initialWeightKg'), private.print_patch_number(roll, 'initialKg'));
    IF consumed_kg IS NOT NULL AND consumed_kg > 0 THEN
      consumed_total := consumed_total + consumed_kg;
    END IF;
    IF initial_kg IS NOT NULL AND consumed_kg IS NOT NULL AND initial_kg > consumed_kg AND consumed_kg > 0 THEN
      balance_meters := COALESCE(private.print_patch_number(roll, 'balanceLengthMeters'), private.print_patch_number(roll, 'lengthMeters'));
      IF balance_meters IS NULL OR balance_meters <= 0 THEN
        RAISE EXCEPTION 'Input roll has leftover film and needs the balance length in meters'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  IF consumed_total <= 0 THEN
    RAISE EXCEPTION 'Enter the consumed weight for at least one input roll'
      USING ERRCODE = '22023';
  END IF;

  details := COALESCE(row.job_details, '{}'::jsonb);
  history := CASE
    WHEN jsonb_typeof(details -> 'printHoldHistory') = 'array' THEN details -> 'printHoldHistory'
    ELSE '[]'::jsonb
  END;
  segment := 'hold-' || (jsonb_array_length(history) + 1)::text;
  hold_id := 'QCHOLD-PRINT-' || p_order_id || '-' || (jsonb_array_length(history) + 1)::text;
  actor := COALESCE(
    CASE
      WHEN to_regprocedure('private.current_print_operator_name()') IS NOT NULL THEN private.current_print_operator_name()
      ELSE NULL
    END,
    auth.uid()::text
  );
  IF usable AND (
    jsonb_typeof(p_patch -> 'outputRolls') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_patch -> 'outputRolls') = 0
  ) THEN
    p_patch := jsonb_set(p_patch, '{outputRolls}', jsonb_build_array(jsonb_build_object(
      'netWeightKg', printed_kg,
      'lengthMeters', meters,
      'filmType', coalesce(p_patch ->> 'filmType', '')
    )), true);
  END IF;
  p_patch := jsonb_set(p_patch, '{outputSegmentId}', to_jsonb(segment), true);

  entry := jsonb_build_object(
    'reason', reason,
    'note', note,
    'meters', meters,
    'printedKg', printed_kg,
    'usable', usable,
    'heldBy', actor,
    'heldAt', ended_at,
    'machineId', row.machine_id,
    'segmentStartedAt', row.printing_start_time,
    'inputRolls', p_patch -> 'inputRollsList',
    'segmentId', segment,
    'restartedAt', NULL,
    'restartMachineId', NULL,
    'restartedBy', NULL
  );
  history := history || jsonb_build_array(entry);
  merged := private.merge_hold_input_rolls(history, '[]'::jsonb);
  details := jsonb_set(details, '{printHoldHistory}', history, true);
  details := jsonb_set(details, '{holdReason}', to_jsonb(reason), true);
  details := jsonb_set(details, '{printingStatus}', to_jsonb('Hold on Printing'::text), true);
  details := jsonb_set(details, '{isPrintingCompleted}', to_jsonb(false), true);
  details := jsonb_set(details, '{printingEndTime}', to_jsonb(ended_at), true);
  details := jsonb_set(details, '{inputRollsList}', merged, true);
  details := jsonb_set(details, '{actualMetersPrinted}', to_jsonb(COALESCE(row.actual_meters_printed, 0) + meters), true);
  IF usable THEN
    details := jsonb_set(details, '{printedOutputKg}', to_jsonb(COALESCE(row.printed_output_kg, 0) + printed_kg), true);
  END IF;

  -- sync_job_roll_issues posts only when the column says Completed and the
  -- run has an end time. The status is flipped to Hold on Printing in this
  -- same transaction after the ledger posts, so the job is never stored as
  -- Completed.
  UPDATE public.orders
  SET
    printing_status = 'Completed',
    printing_end_time = ended_at,
    actual_meters_printed = COALESCE(row.actual_meters_printed, 0) + meters,
    printed_output_kg = CASE
      WHEN usable THEN COALESCE(row.printed_output_kg, 0) + printed_kg
      ELSE row.printed_output_kg
    END,
    job_details = details,
    job_name = private.print_job_name(
      row.job_name, details, 'Completed', false, row.machine_id, merged, row.printing_start_time, ended_at
    )
  WHERE id = p_order_id
  RETURNING * INTO row;

  IF to_regprocedure('private.sync_job_roll_issues(text, text, text)') IS NOT NULL THEN
    balance_rolls := private.sync_job_roll_issues(row.id, NULL, 'print_run');
  END IF;
  balance_rolls := COALESCE(balance_rolls, '[]'::jsonb);

  IF usable THEN
    outputs := private.post_additional_print_rolls(p_order_id, p_patch, balance_rolls);
  ELSE
    qc_hold := private.post_print_qc_hold(p_order_id, hold_id, p_patch, reason, note, printed_kg);
    outputs := jsonb_build_object(
      'printedRolls', '[]'::jsonb,
      'balanceRolls', balance_rolls,
      'consumedRolls', '[]'::jsonb
    );
  END IF;

  idx := jsonb_array_length(history) - 1;
  history := jsonb_set(history, ARRAY[idx::text, 'balanceRolls'], COALESCE(balance_rolls, '[]'::jsonb), true);
  history := jsonb_set(history, ARRAY[idx::text, 'printedRolls'], COALESCE(outputs -> 'printedRolls', '[]'::jsonb), true);
  IF qc_hold IS NOT NULL THEN
    history := jsonb_set(history, ARRAY[idx::text, 'qcHoldId'], to_jsonb(hold_id), true);
  END IF;
  details := jsonb_set(details, '{printHoldHistory}', history, true);
  details := jsonb_set(details, '{inputRollsList}', empty_inputs, true);
  details := jsonb_set(details, '{printingStatus}', to_jsonb('Hold on Printing'::text), true);
  details := jsonb_set(details, '{isPrintingCompleted}', to_jsonb(false), true);

  UPDATE public.orders
  SET
    printing_status = 'Hold on Printing',
    printing_end_time = ended_at,
    job_details = details,
    job_name = private.print_job_name(
      row.job_name, details, 'Hold on Printing', false, row.machine_id, empty_inputs, row.printing_start_time, ended_at
    )
  WHERE id = p_order_id
  RETURNING * INTO row;

  IF to_regprocedure('private.log_print_run_event(text, text, text, text, timestamptz, timestamptz, text)') IS NOT NULL THEN
    PERFORM private.log_print_run_event(
      'end',
      row.id,
      NULLIF(btrim(row.machine_id), ''),
      row.job_name,
      row.printing_start_time,
      row.printing_end_time,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'id', row.id,
    'status', row.status,
    'printingStatus', row.printing_status,
    'printingStartTime', row.printing_start_time,
    'printingEndTime', row.printing_end_time,
    'isPrintingCompleted', false,
    'machineId', row.machine_id,
    'actualMetersPrinted', row.actual_meters_printed,
    'printedOutputKg', row.printed_output_kg,
    'inputRollsList', empty_inputs,
    'printHoldHistory', history,
    'holdReason', reason,
    'balanceRolls', balance_rolls,
    'printedRolls', COALESCE(outputs -> 'printedRolls', '[]'::jsonb),
    'consumedRolls', COALESCE(outputs -> 'consumedRolls', '[]'::jsonb),
    'qcHold', qc_hold
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restart_held_print_run(
  p_order_id text,
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
  history jsonb;
  machine text;
  actor text;
  started_at timestamptz := pg_catalog.now();
  idx integer;
  empty_inputs jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to restart a print job'
      USING ERRCODE = '42501';
  END IF;
  IF NOT private.caller_can_hold_print() THEN
    RAISE EXCEPTION 'Not allowed to restart a held print job'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id
      USING ERRCODE = 'P0002';
  END IF;
  IF lower(btrim(COALESCE(row.printing_status, ''))) IS DISTINCT FROM 'hold on printing' THEN
    RAISE EXCEPTION 'Only a job on Hold on Printing can be restarted'
      USING ERRCODE = '22023';
  END IF;

  p_patch := COALESCE(p_patch, '{}'::jsonb);
  machine := NULLIF(btrim(coalesce(p_patch ->> 'machineId', row.machine_id, '')), '');
  IF machine IS NULL THEN
    RAISE EXCEPTION 'Choose a printing machine to restart'
      USING ERRCODE = '22023';
  END IF;

  details := COALESCE(row.job_details, '{}'::jsonb);
  history := CASE
    WHEN jsonb_typeof(details -> 'printHoldHistory') = 'array' THEN details -> 'printHoldHistory'
    ELSE '[]'::jsonb
  END;
  actor := COALESCE(
    CASE
      WHEN to_regprocedure('private.current_print_operator_name()') IS NOT NULL THEN private.current_print_operator_name()
      ELSE NULL
    END,
    auth.uid()::text
  );
  IF jsonb_array_length(history) > 0 THEN
    idx := jsonb_array_length(history) - 1;
    history := jsonb_set(history, ARRAY[idx::text, 'restartedAt'], to_jsonb(started_at), true);
    history := jsonb_set(history, ARRAY[idx::text, 'restartMachineId'], to_jsonb(machine), true);
    history := jsonb_set(history, ARRAY[idx::text, 'restartedBy'], to_jsonb(actor), true);
  END IF;
  details := jsonb_set(details, '{printHoldHistory}', history, true);
  details := jsonb_set(details, '{printingStatus}', to_jsonb('In Production'::text), true);
  details := jsonb_set(details, '{isPrintingCompleted}', to_jsonb(false), true);
  details := jsonb_set(details, '{printingStartTime}', to_jsonb(started_at), true);
  details := details - 'printingEndTime';
  details := jsonb_set(details, '{machineId}', to_jsonb(machine), true);
  details := jsonb_set(details, '{inputRollsList}', empty_inputs, true);

  UPDATE public.orders
  SET
    printing_status = 'In Production',
    printing_start_time = started_at,
    printing_end_time = NULL,
    machine_id = machine,
    job_details = details,
    job_name = private.print_job_name(
      row.job_name, details, 'In Production', false, machine, empty_inputs, started_at, NULL
    )
  WHERE id = p_order_id
  RETURNING * INTO row;

  IF to_regprocedure('private.log_print_run_event(text, text, text, text, timestamptz, timestamptz, text)') IS NOT NULL THEN
    PERFORM private.log_print_run_event(
      'start',
      row.id,
      machine,
      row.job_name,
      row.printing_start_time,
      NULL,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'id', row.id,
    'status', row.status,
    'printingStatus', row.printing_status,
    'printingStartTime', row.printing_start_time,
    'printingEndTime', row.printing_end_time,
    'isPrintingCompleted', false,
    'machineId', row.machine_id,
    'actualMetersPrinted', row.actual_meters_printed,
    'printedOutputKg', row.printed_output_kg,
    'inputRollsList', empty_inputs,
    'printHoldHistory', history,
    'holdReason', COALESCE(row.job_details ->> 'holdReason', '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_print_run(
  p_order_id text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  outputs jsonb;
  details jsonb;
  segment_patch jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a print run'
      USING ERRCODE = '42501';
  END IF;
  IF NOT private.caller_can_print() THEN
    RAISE EXCEPTION 'Not allowed to record printed output from a print run'
      USING ERRCODE = '42501';
  END IF;
  IF to_regprocedure('public.record_print_run(text, text, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Print run recording is not available'
      USING ERRCODE = 'P0001';
  END IF;

  result := public.record_print_run(p_order_id, 'end', COALESCE(p_patch, '{}'::jsonb));
  SELECT o.job_details INTO details FROM public.orders AS o WHERE o.id = p_order_id;
  IF jsonb_typeof(details -> 'printHoldHistory') = 'array'
     AND jsonb_array_length(details -> 'printHoldHistory') > 0 THEN
    segment_patch := COALESCE(p_patch, '{}'::jsonb)
      || jsonb_build_object('outputSegmentId', COALESCE(NULLIF(btrim(p_patch ->> 'outputSegmentId'), ''), 'end'));
    outputs := private.post_additional_print_rolls(
      p_order_id,
      segment_patch,
      COALESCE(result -> 'balanceRolls', '[]'::jsonb)
    );
  ELSE
    outputs := private.post_print_run_outputs(
      p_order_id,
      COALESCE(p_patch, '{}'::jsonb),
      COALESCE(result -> 'balanceRolls', '[]'::jsonb)
    );
  END IF;
  PERFORM public.record_printing_wastage(private.print_run_wastage_plan(p_order_id, COALESCE(p_patch, '{}'::jsonb)));
  RETURN COALESCE(result, '{}'::jsonb) || COALESCE(outputs, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION private.caller_can_hold_print() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.merge_hold_input_rolls(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.print_job_name(text, jsonb, text, boolean, text, jsonb, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.append_json_rolls(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.post_additional_print_rolls(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.post_print_qc_hold(text, text, jsonb, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hold_print_run(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restart_held_print_run(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_print_run(text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.caller_can_hold_print() FROM anon;
    REVOKE ALL ON FUNCTION private.merge_hold_input_rolls(jsonb, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION private.print_job_name(text, jsonb, text, boolean, text, jsonb, timestamptz, timestamptz) FROM anon;
    REVOKE ALL ON FUNCTION private.append_json_rolls(jsonb, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION private.post_additional_print_rolls(text, jsonb, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION private.post_print_qc_hold(text, text, jsonb, text, text, numeric) FROM anon;
    REVOKE ALL ON FUNCTION public.hold_print_run(text, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.restart_held_print_run(text, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.complete_print_run(text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.caller_can_hold_print() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.merge_hold_input_rolls(jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.print_job_name(text, jsonb, text, boolean, text, jsonb, timestamptz, timestamptz) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.append_json_rolls(jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.post_additional_print_rolls(text, jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.post_print_qc_hold(text, text, jsonb, text, text, numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.hold_print_run(text, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.restart_held_print_run(text, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.complete_print_run(text, jsonb) TO authenticated;
  END IF;
END $$;
