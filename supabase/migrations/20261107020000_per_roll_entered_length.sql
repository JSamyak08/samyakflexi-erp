-- Each printed roll and each balance roll keeps the meters the operator typed.
-- A job total is not copied onto a roll. Older rows with no length stay unknown.
-- Safe to run more than once. The ledger trigger is skipped when that table
-- is not installed yet.


CREATE OR REPLACE FUNCTION private.stamp_balance_roll_length()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payload jsonb;
  meters numeric;
BEGIN
  IF NEW.entry_kind IS DISTINCT FROM 'balance_receipt' THEN
    RETURN NEW;
  END IF;
  IF to_regclass('public.inventory_ledger_entries') IS NULL
     OR to_regclass('public.inventory_rolls') IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(issue.print_payload, issue.record_payload)
    INTO payload
  FROM public.inventory_ledger_entries AS issue
  WHERE issue.entry_kind = 'issue'
    AND issue.scope_key = NEW.scope_key
    AND lower(btrim(COALESCE(issue.barcode, ''))) = lower(btrim(COALESCE(NEW.parent_barcode, '')))
  ORDER BY issue.updated_at DESC NULLS LAST
  LIMIT 1;
  BEGIN
    meters := NULLIF(btrim(COALESCE(
      payload ->> 'balanceLengthMeters',
      ''
    )), '')::numeric;
  EXCEPTION WHEN others THEN
    meters := NULL;
  END;
  IF meters IS NOT NULL AND meters > 0 THEN
    UPDATE public.inventory_rolls
    SET length_meters = meters
    WHERE lower(btrim(barcode_id)) = lower(btrim(COALESCE(NEW.barcode, '')));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_balance_roll_length() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.stamp_balance_roll_length() TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.inventory_ledger_entries') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS stamp_balance_roll_length ON public.inventory_ledger_entries;
  CREATE TRIGGER stamp_balance_roll_length
    AFTER INSERT OR UPDATE ON public.inventory_ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION private.stamp_balance_roll_length();
END $$;

CREATE OR REPLACE FUNCTION private.post_print_run_outputs(
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
  code_base text;
  seq integer := 0;
  weight numeric;
  meters numeric;
  roll_meters numeric;
  barcode text;
  lot_code text;
  printed jsonb := '[]'::jsonb;
  consumed jsonb := '[]'::jsonb;
  child jsonb;
  existing public.sfg_goods%ROWTYPE;
  has_existing boolean := false;
  editor boolean := false;
  kept jsonb := '{}'::jsonb;
  consumed_kg numeric := 0;
  dispatched_kg numeric := 0;
  net_kg numeric := 0;
  available_kg numeric := 0;
  row_id uuid;
  job_name text := '';
  client_name text := '';
  job_code text := '';
  film text := '';
  micron numeric := 0;
  width_mm numeric := 0;
  storage text;
  notes jsonb;
  input_codes jsonb := '[]'::jsonb;
  balance jsonb;
BEGIN
  IF NOT private.caller_can_print() THEN
    RAISE EXCEPTION 'Not allowed to record printed output from a print run'
      USING ERRCODE = '42501';
  END IF;

  p_patch := COALESCE(p_patch, '{}'::jsonb);
  balance := CASE WHEN jsonb_typeof(p_balance) = 'array' THEN p_balance ELSE '[]'::jsonb END;
  meters := private.print_patch_number(p_patch, 'actualMetersPrinted');

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

  job_name := coalesce(NULLIF(btrim(p_patch ->> 'jobName'), ''), NULLIF(job_name, ''), 'Untitled Job');
  client_name := coalesce(NULLIF(btrim(p_patch ->> 'clientName'), ''), client_name, '');
  job_code := coalesce(NULLIF(btrim(p_patch ->> 'jobCode'), ''), NULLIF(job_code, ''), coalesce(p_order_id, ''));
  film := coalesce(NULLIF(btrim(p_patch ->> 'filmType'), ''), '');
  micron := COALESCE(private.print_patch_number(p_patch, 'micron'), 0);
  width_mm := COALESCE(private.print_patch_number(p_patch, 'widthMm'), 0);
  storage := coalesce(NULLIF(btrim(p_patch ->> 'storageBay'), ''), 'SFG Store (Pre-Lamination)');
  code_base := regexp_replace(coalesce(NULLIF(job_code, ''), NULLIF(btrim(p_order_id), ''), 'ORD-000'), '[^A-Za-z0-9-]', '', 'g');
  IF code_base = '' THEN
    code_base := 'ORD-000';
  END IF;
  lot_code := 'SFG-LOT-' || coalesce(p_order_id, '');

  IF jsonb_typeof(p_patch -> 'inputRollsList') = 'array' THEN
    FOR roll IN
      SELECT value FROM jsonb_array_elements(p_patch -> 'inputRollsList') AS listed(value)
    LOOP
      barcode := btrim(coalesce(roll ->> 'barcodeId', roll ->> 'barcode', ''));
      IF barcode = '' THEN
        CONTINUE;
      END IF;
      input_codes := input_codes || jsonb_build_array(to_jsonb(barcode));
      consumed := consumed || jsonb_build_array(jsonb_build_object(
        'barcodeId', barcode,
        'consumedWeightKg', private.print_patch_number(roll, 'consumedWeightKg'),
        'initialWeightKg', COALESCE(
          private.print_patch_number(roll, 'initialWeightKg'),
          private.print_patch_number(roll, 'initialKg')
        ),
        'filmType', coalesce(roll ->> 'filmType', '')
      ));
    END LOOP;
  END IF;

  IF jsonb_typeof(p_patch -> 'outputRolls') = 'array' THEN
    FOR roll IN
      SELECT value FROM jsonb_array_elements(p_patch -> 'outputRolls') AS listed(value)
    LOOP
      weight := COALESCE(
        private.print_patch_number(roll, 'netWeightKg'),
        private.print_patch_number(roll, 'totalNetKg')
      );
      IF weight IS NULL OR weight = 0 THEN
        CONTINUE;
      END IF;
      IF weight < 0 THEN
        RAISE EXCEPTION 'Printed roll weight cannot be negative'
          USING ERRCODE = '22023';
      END IF;
      seq := seq + 1;
      barcode := 'SFG-BC-' || code_base || '-' || seq::text;
      roll_meters := private.print_patch_number(roll, 'lengthMeters');
      printed := printed || jsonb_build_array(jsonb_build_object(
        'barcodeId', barcode,
        'rollNo', seq,
        'netWeightKg', round(weight, 2),
        'grossWeightKg', COALESCE(private.print_patch_number(roll, 'grossWeightKg'), weight),
        'tareWeightKg', COALESCE(private.print_patch_number(roll, 'tareWeightKg'), 0),
        'lengthMeters', roll_meters,
        'filmType', coalesce(NULLIF(btrim(roll ->> 'filmType'), ''), film),
        'micron', COALESCE(private.print_patch_number(roll, 'micron'), micron),
        'widthMm', COALESCE(private.print_patch_number(roll, 'widthMm'), width_mm),
        'itemName', coalesce(NULLIF(btrim(roll ->> 'itemName'), ''), job_name || ' - Printed SFG Roll ' || seq::text),
        'storageBay', coalesce(NULLIF(btrim(roll ->> 'storageBay'), ''), NULLIF(btrim(roll ->> 'locationBay'), ''), storage)
      ));
    END LOOP;
  END IF;

  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    FOR child IN
      SELECT value FROM jsonb_array_elements(printed) AS listed(value)
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
          'source', 'print_run'
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
      PERFORM private.note_printed_barcode(child ->> 'barcodeId', p_order_id, child ->> 'itemName', 'printed_sfg');
    END LOOP;
  END IF;

  IF jsonb_typeof(balance) = 'array' THEN
    FOR child IN
      SELECT value FROM jsonb_array_elements(balance) AS listed(value)
    LOOP
      barcode := btrim(coalesce(child ->> 'barcodeId', child ->> 'barcode', ''));
      PERFORM private.note_printed_barcode(
        barcode,
        p_order_id,
        coalesce(NULLIF(btrim(child ->> 'itemName'), ''), barcode),
        'balance'
      );
    END LOOP;
  END IF;

  net_kg := COALESCE((
    SELECT sum(COALESCE((value ->> 'netWeightKg')::numeric, 0))
    FROM jsonb_array_elements(printed) AS listed(value)
  ), 0);

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
      'totalMeters', COALESCE(meters, 0),
      'rollsCount', jsonb_array_length(printed),
      'childRolls', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'barcodeId', value ->> 'barcodeId',
          'rollNo', COALESCE((value ->> 'rollNo')::integer, 1),
          'netWeightKg', COALESCE((value ->> 'netWeightKg')::numeric, 0),
          'lengthMeters', NULLIF(value ->> 'lengthMeters', '')::numeric
        )), '[]'::jsonb)
        FROM jsonb_array_elements(printed) AS listed(value)
      ),
      'runBalanceRolls', balance,
      'runConsumedRolls', consumed,
      'inputBarcodeIds', input_codes,
      'consumptionHistory', COALESCE(kept -> 'consumptionHistory', '[]'::jsonb),
      'printedAllocations', COALESCE(kept -> 'printedAllocations', '[]'::jsonb)
    );

    INSERT INTO public.sfg_goods (
      id, sfg_batch_code, sfg_type, order_id, job_name, job_code, client_name,
      film_type, micron, width_mm, total_gross_kg, gross_weight_kg, tare_weight_kg,
      total_net_kg, consumed_kg, available_kg, total_meters, rolls_count,
      machine_name, operator_name, shift, storage_bay, production_date, status, notes, updated_at
    ) VALUES (
      row_id,
      lot_code,
      'Printed Rolls',
      p_order_id,
      job_name,
      job_code,
      client_name,
      film,
      micron,
      width_mm,
      net_kg,
      net_kg,
      0,
      net_kg,
      consumed_kg,
      available_kg,
      COALESCE(meters, 0),
      jsonb_array_length(printed),
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
    SET sfg_type = EXCLUDED.sfg_type,
        order_id = EXCLUDED.order_id,
        job_name = EXCLUDED.job_name,
        job_code = EXCLUDED.job_code,
        client_name = EXCLUDED.client_name,
        film_type = EXCLUDED.film_type,
        micron = EXCLUDED.micron,
        width_mm = EXCLUDED.width_mm,
        total_gross_kg = EXCLUDED.total_gross_kg,
        gross_weight_kg = EXCLUDED.gross_weight_kg,
        total_net_kg = EXCLUDED.total_net_kg,
        consumed_kg = EXCLUDED.consumed_kg,
        available_kg = EXCLUDED.available_kg,
        total_meters = EXCLUDED.total_meters,
        rolls_count = EXCLUDED.rolls_count,
        machine_name = EXCLUDED.machine_name,
        operator_name = EXCLUDED.operator_name,
        shift = EXCLUDED.shift,
        storage_bay = EXCLUDED.storage_bay,
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

-- One transaction: end the run (balance rolls included), then the printed lot
-- and the printing scrap. A later error rolls the completion back.
