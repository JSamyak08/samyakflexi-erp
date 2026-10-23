-- Atomic insert of every child SFG/FG roll produced from one consume.
-- One transaction: all children are written, or none are.
-- Safe to re-run. It does not change existing stock unless the same parent
-- batch is saving the same child barcode again (a retry of this consume).
-- A barcode that already belongs to a different roll raises an error and
-- rolls the whole call back.
-- Row ids come from gen_random_uuid() on the server.
-- The function is SECURITY INVOKER, so it uses the caller's RLS, the same
-- as a direct insert from the app.

CREATE OR REPLACE FUNCTION public.save_consume_child_rolls(p_children jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  child jsonb;
  sfg jsonb;
  roll jsonb;
  parent_batch text;
  n integer := 0;
  existing_notes text;
  existing_parent text;
  existing_meta jsonb;
  existing_roll_parent text;
  sfg_id uuid;
BEGIN
  IF p_children IS NULL OR jsonb_typeof(p_children) <> 'array' OR jsonb_array_length(p_children) < 1 THEN
    RAISE EXCEPTION 'save_consume_child_rolls expects a non-empty JSON array';
  END IF;

  IF (
    SELECT COUNT(*) <> COUNT(DISTINCT lower(value->'sfg'->>'sfg_batch_code'))
       OR COUNT(*) <> COUNT(DISTINCT lower(value->'roll'->>'barcode_id'))
    FROM jsonb_array_elements(p_children)
  ) THEN
    RAISE EXCEPTION 'duplicate child roll barcodes in one save';
  END IF;

  FOR child IN SELECT value FROM jsonb_array_elements(p_children)
  LOOP
    sfg := child->'sfg';
    roll := child->'roll';
    parent_batch := coalesce(nullif(child->>'parent_batch', ''), nullif(sfg->>'parent_batch', ''), '');

    IF coalesce(sfg->>'sfg_batch_code', '') = '' OR coalesce(roll->>'barcode_id', '') = '' THEN
      RAISE EXCEPTION 'each child needs sfg.sfg_batch_code and roll.barcode_id';
    END IF;
    IF parent_batch = '' THEN
      RAISE EXCEPTION 'each child needs parent_batch';
    END IF;
    IF lower(sfg->>'sfg_batch_code') <> lower(roll->>'barcode_id') THEN
      RAISE EXCEPTION 'sfg batch code and inventory barcode must match';
    END IF;

    SELECT notes INTO existing_notes
    FROM public.sfg_goods
    WHERE sfg_batch_code = sfg->>'sfg_batch_code';
    IF FOUND THEN
      existing_parent := NULL;
      BEGIN
        existing_parent := existing_notes::jsonb->>'parentSfgBatchCode';
      EXCEPTION WHEN others THEN
        existing_parent := NULL;
      END;
      IF existing_parent IS DISTINCT FROM parent_batch THEN
        RAISE EXCEPTION 'sfg batch % already belongs to another roll', sfg->>'sfg_batch_code';
      END IF;

      UPDATE public.sfg_goods SET
        sfg_type = coalesce(sfg->>'sfg_type', sfg_type),
        job_id = nullif(sfg->>'job_id', ''),
        order_id = nullif(sfg->>'order_id', ''),
        job_name = coalesce(nullif(sfg->>'job_name', ''), job_name),
        job_code = coalesce(sfg->>'job_code', ''),
        client_name = coalesce(sfg->>'client_name', ''),
        structure = coalesce(sfg->>'structure', ''),
        film_type = coalesce(sfg->>'film_type', ''),
        micron = coalesce((sfg->>'micron')::numeric, 0),
        width_mm = coalesce((sfg->>'width_mm')::numeric, 0),
        total_gross_kg = coalesce((sfg->>'total_gross_kg')::numeric, 0),
        gross_weight_kg = coalesce((sfg->>'gross_weight_kg')::numeric, 0),
        tare_weight_kg = coalesce((sfg->>'tare_weight_kg')::numeric, 0),
        total_net_kg = coalesce((sfg->>'total_net_kg')::numeric, 0),
        consumed_kg = coalesce((sfg->>'consumed_kg')::numeric, 0),
        available_kg = coalesce((sfg->>'available_kg')::numeric, 0),
        total_meters = coalesce((sfg->>'total_meters')::numeric, 0),
        rolls_count = coalesce((sfg->>'rolls_count')::integer, 1),
        machine_name = coalesce(sfg->>'machine_name', ''),
        operator_name = coalesce(sfg->>'operator_name', ''),
        shift = coalesce(sfg->>'shift', ''),
        storage_bay = coalesce(sfg->>'storage_bay', ''),
        production_date = CASE
          WHEN coalesce(sfg->>'production_date', '') = '' THEN production_date
          ELSE (sfg->>'production_date')::date
        END,
        status = coalesce(sfg->>'status', status),
        notes = coalesce(sfg->>'notes', notes),
        updated_at = CASE
          WHEN coalesce(sfg->>'updated_at', '') = '' THEN now()
          ELSE (sfg->>'updated_at')::timestamptz
        END
      WHERE sfg_batch_code = sfg->>'sfg_batch_code';
    ELSE
      sfg_id := gen_random_uuid();
      INSERT INTO public.sfg_goods (
        id, sfg_batch_code, sfg_type, job_id, order_id, job_name, job_code, client_name,
        structure, film_type, micron, width_mm, total_gross_kg, gross_weight_kg, tare_weight_kg,
        total_net_kg, consumed_kg, available_kg, total_meters, rolls_count, machine_name,
        operator_name, shift, storage_bay, production_date, status, notes, updated_at
      ) VALUES (
        sfg_id,
        sfg->>'sfg_batch_code',
        coalesce(nullif(sfg->>'sfg_type', ''), 'Laminated / Processed Rolls'),
        nullif(sfg->>'job_id', ''),
        nullif(sfg->>'order_id', ''),
        coalesce(nullif(sfg->>'job_name', ''), 'Untitled Job'),
        coalesce(sfg->>'job_code', ''),
        coalesce(sfg->>'client_name', ''),
        coalesce(sfg->>'structure', ''),
        coalesce(sfg->>'film_type', ''),
        coalesce((sfg->>'micron')::numeric, 0),
        coalesce((sfg->>'width_mm')::numeric, 0),
        coalesce((sfg->>'total_gross_kg')::numeric, 0),
        coalesce((sfg->>'gross_weight_kg')::numeric, 0),
        coalesce((sfg->>'tare_weight_kg')::numeric, 0),
        coalesce((sfg->>'total_net_kg')::numeric, 0),
        coalesce((sfg->>'consumed_kg')::numeric, 0),
        coalesce((sfg->>'available_kg')::numeric, 0),
        coalesce((sfg->>'total_meters')::numeric, 0),
        coalesce((sfg->>'rolls_count')::integer, 1),
        coalesce(sfg->>'machine_name', ''),
        coalesce(sfg->>'operator_name', ''),
        coalesce(sfg->>'shift', ''),
        coalesce(sfg->>'storage_bay', ''),
        CASE
          WHEN coalesce(sfg->>'production_date', '') = '' THEN CURRENT_DATE
          ELSE (sfg->>'production_date')::date
        END,
        coalesce(nullif(sfg->>'status', ''), 'In Stock (WIP)'),
        coalesce(sfg->>'notes', ''),
        CASE
          WHEN coalesce(sfg->>'updated_at', '') = '' THEN now()
          ELSE (sfg->>'updated_at')::timestamptz
        END
      );
    END IF;

    SELECT metadata INTO existing_meta
    FROM public.inventory_rolls
    WHERE barcode_id = roll->>'barcode_id';
    IF FOUND THEN
      existing_roll_parent := NULL;
      IF existing_meta IS NOT NULL THEN
        existing_roll_parent := existing_meta->>'parentSfgBatchCode';
      END IF;
      IF existing_roll_parent IS DISTINCT FROM parent_batch THEN
        RAISE EXCEPTION 'inventory barcode % already belongs to another roll', roll->>'barcode_id';
      END IF;

      UPDATE public.inventory_rolls SET
        roll_type = coalesce(nullif(roll->>'roll_type', ''), roll_type),
        item_id = coalesce(roll->>'item_id', ''),
        item_name = coalesce(nullif(roll->>'item_name', ''), item_name),
        category = coalesce(roll->>'category', ''),
        job_name = coalesce(roll->>'job_name', ''),
        order_id = coalesce(roll->>'order_id', ''),
        micron = coalesce((roll->>'micron')::numeric, 0),
        width_mm = coalesce((roll->>'width_mm')::numeric, 0),
        inward_datetime = CASE
          WHEN coalesce(roll->>'inward_datetime', '') = '' THEN inward_datetime
          ELSE (roll->>'inward_datetime')::timestamptz
        END,
        production_date = CASE
          WHEN coalesce(roll->>'production_date', '') = '' THEN production_date
          ELSE (roll->>'production_date')::date
        END,
        gross_weight_kg = coalesce((roll->>'gross_weight_kg')::numeric, 0),
        tare_weight_kg = coalesce((roll->>'tare_weight_kg')::numeric, 0),
        net_weight_kg = coalesce((roll->>'net_weight_kg')::numeric, 0),
        available_weight_kg = coalesce((roll->>'available_weight_kg')::numeric, 0),
        length_meters = coalesce((roll->>'length_meters')::numeric, 0),
        joint_count = coalesce((roll->>'joint_count')::integer, 0),
        qc_status = coalesce(nullif(roll->>'qc_status', ''), qc_status),
        machine_name = coalesce(roll->>'machine_name', ''),
        operator_name = coalesce(roll->>'operator_name', ''),
        shift = coalesce(roll->>'shift', ''),
        remarks = coalesce(roll->>'remarks', ''),
        input_barcode_ids = coalesce(roll->'input_barcode_ids', '[]'::jsonb),
        location_bay = coalesce(roll->>'location_bay', ''),
        status = coalesce(nullif(roll->>'status', ''), status),
        sfg_type = nullif(roll->>'sfg_type', ''),
        job_code = coalesce(roll->>'job_code', ''),
        client_name = coalesce(roll->>'client_name', ''),
        structure = coalesce(roll->>'structure', ''),
        metadata = coalesce(roll->'metadata', '{}'::jsonb)
      WHERE barcode_id = roll->>'barcode_id';
    ELSE
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, job_name, order_id,
        micron, width_mm, inward_datetime, production_date, vendor_name, invoice_no, batch_no,
        gross_weight_kg, tare_weight_kg, net_weight_kg, available_weight_kg, length_meters,
        joint_count, qc_status, machine_name, operator_name, shift, remarks, core_dia,
        input_barcode_ids, station_id, location_bay, status, sfg_type, job_code, client_name,
        structure, metadata
      ) VALUES (
        roll->>'barcode_id',
        coalesce(nullif(roll->>'roll_type', ''), 'SEMI_FINISHED_GOODS'),
        coalesce(roll->>'item_id', ''),
        coalesce(nullif(roll->>'item_name', ''), 'Untitled Job'),
        coalesce(roll->>'category', ''),
        coalesce(roll->>'job_name', ''),
        coalesce(roll->>'order_id', ''),
        coalesce((roll->>'micron')::numeric, 0),
        coalesce((roll->>'width_mm')::numeric, 0),
        CASE
          WHEN coalesce(roll->>'inward_datetime', '') = '' THEN now()
          ELSE (roll->>'inward_datetime')::timestamptz
        END,
        CASE
          WHEN coalesce(roll->>'production_date', '') = '' THEN CURRENT_DATE
          ELSE (roll->>'production_date')::date
        END,
        coalesce(roll->>'vendor_name', ''),
        coalesce(roll->>'invoice_no', ''),
        coalesce(roll->>'batch_no', ''),
        coalesce((roll->>'gross_weight_kg')::numeric, 0),
        coalesce((roll->>'tare_weight_kg')::numeric, 0),
        coalesce((roll->>'net_weight_kg')::numeric, 0),
        coalesce((roll->>'available_weight_kg')::numeric, 0),
        coalesce((roll->>'length_meters')::numeric, 0),
        coalesce((roll->>'joint_count')::integer, 0),
        coalesce(nullif(roll->>'qc_status', ''), 'Approved'),
        coalesce(roll->>'machine_name', ''),
        coalesce(roll->>'operator_name', ''),
        coalesce(roll->>'shift', ''),
        coalesce(roll->>'remarks', ''),
        coalesce(roll->>'core_dia', ''),
        coalesce(roll->'input_barcode_ids', '[]'::jsonb),
        coalesce(roll->>'station_id', ''),
        coalesce(roll->>'location_bay', ''),
        coalesce(nullif(roll->>'status', ''), 'In Stock'),
        nullif(roll->>'sfg_type', ''),
        coalesce(roll->>'job_code', ''),
        coalesce(roll->>'client_name', ''),
        coalesce(roll->>'structure', ''),
        coalesce(roll->'metadata', '{}'::jsonb)
      );
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$fn$;

COMMENT ON FUNCTION public.save_consume_child_rolls(jsonb) IS
  'Writes every child SFG/FG roll from one consume in a single transaction.';

REVOKE ALL ON FUNCTION public.save_consume_child_rolls(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.save_consume_child_rolls(jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.save_consume_child_rolls(jsonb) TO authenticated;
  END IF;
END $$;
