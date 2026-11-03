-- Ending a press run was three separate requests.
--
-- record_print_run (PR #81) commits the completed order and the -BAL balance
-- roll. The browser then saves the production record and inserts printing
-- scrap into sfg_scrap_items. PR #79's reject_sfg_view_only_write trigger
-- raises "SFG / FG Store is view-only for this account" for a Printing
-- Operator or Shop Floor Operator, because sfg_store is the string "view"
-- and production_records / scrap_analytics are false. The printed SFG lot
-- is saved only after that insert, so it never runs, and the screen never
-- shows the rolls.
--
-- This does not grant sfg_store write. complete_print_run stays security
-- invoker, so the order update still obeys orders row security. The printed
-- lot, the printed inventory rolls, the print barcodes, and the printing
-- scrap rows are written by security definer helpers in the same transaction.
-- Those helpers allow the call only when the caller can use
-- printing_scheduler (Admin passes private.can_any). A store editor can
-- still record every scrap stage. An operator can record only the three
-- printing scrap kinds, and those rows get no barcode.
--
-- Safe to run more than once. Missing optional tables are skipped inside
-- the helpers instead of failing the migration.

CREATE SCHEMA IF NOT EXISTS private;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA private TO authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.print_patch_number(p_obj jsonb, p_key text)
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

CREATE OR REPLACE FUNCTION private.caller_can_print()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.can_any(ARRAY['printing_scheduler']::text[]), false);
$$;

-- editor: may write every scrap stage. printer: printing kinds only. none: denied.
CREATE OR REPLACE FUNCTION private.print_wastage_access()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  store_editor boolean := false;
BEGIN
  IF to_regprocedure('private.can_edit_sfg_store(text[])') IS NOT NULL THEN
    store_editor := COALESCE(
      private.can_edit_sfg_store(ARRAY['production_records', 'inventory', 'printing_scheduler']::text[]),
      false
    );
  END IF;
  IF store_editor
     OR COALESCE(private.can_any(ARRAY['production_records', 'scrap_analytics']::text[]), false) THEN
    RETURN 'editor';
  END IF;
  IF COALESCE(private.can_any(ARRAY['printing_scheduler']::text[]), false) THEN
    RETURN 'printer';
  END IF;
  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION private.note_printed_barcode(
  p_barcode text,
  p_order_id text,
  p_label text,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  code text := btrim(coalesce(p_barcode, ''));
BEGIN
  IF to_regclass('public.custom_barcodes') IS NULL OR code = '' THEN
    RETURN;
  END IF;
  IF NOT private.caller_can_print() THEN
    RAISE EXCEPTION 'Not allowed to record a printed barcode'
      USING ERRCODE = '42501';
  END IF;
  IF code !~ '^SFG-BC-[A-Za-z0-9-]+-[0-9]+$' AND code !~ '-BAL$' THEN
    RETURN;
  END IF;
  INSERT INTO public.custom_barcodes (id, payload, updated_at)
  VALUES (
    code,
    jsonb_build_object(
      'id', code,
      'barcode', code,
      'barcodeId', code,
      'orderId', coalesce(p_order_id, ''),
      'itemName', coalesce(NULLIF(btrim(p_label), ''), code),
      'source', 'print_run',
      'kind', coalesce(p_kind, '')
    ),
    pg_catalog.now()
  )
  ON CONFLICT (id) DO UPDATE
  SET payload = COALESCE(public.custom_barcodes.payload, '{}'::jsonb) || EXCLUDED.payload,
      updated_at = pg_catalog.now();
END;
$$;

CREATE OR REPLACE FUNCTION private.print_run_wastage_plan(p_order_id text, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row record;
  job_name text := '';
  client_name text := '';
  job_code text := '';
  order_qty numeric := 0;
  plain numeric;
  printed numeric;
  trim_kg numeric;
  total numeric := 0;
  upserts jsonb := '[]'::jsonb;
  deletes jsonb := '[]'::jsonb;
  stages jsonb := '[]'::jsonb;
  pct numeric;
  flagged boolean := false;
BEGIN
  p_patch := COALESCE(p_patch, '{}'::jsonb);
  IF to_regclass('public.orders') IS NOT NULL THEN
    SELECT o.job_name, o.client_name, o.order_qty_kg, o.job_details
      INTO order_row
    FROM public.orders AS o
    WHERE o.id = p_order_id;
    IF FOUND THEN
      job_name := split_part(coalesce(order_row.job_name, ''), ' ||| ', 1);
      client_name := coalesce(order_row.client_name, '');
      order_qty := COALESCE(order_row.order_qty_kg, 0);
      job_code := coalesce(order_row.job_details ->> 'jobCode', '');
    END IF;
  END IF;
  job_name := coalesce(NULLIF(btrim(p_patch ->> 'jobName'), ''), NULLIF(job_name, ''), '');
  client_name := coalesce(NULLIF(btrim(p_patch ->> 'clientName'), ''), client_name, '');
  job_code := coalesce(NULLIF(btrim(p_patch ->> 'jobCode'), ''), NULLIF(job_code, ''), p_order_id);
  IF private.print_patch_number(p_patch, 'orderQtyKg') IS NOT NULL THEN
    order_qty := private.print_patch_number(p_patch, 'orderQtyKg');
  END IF;

  plain := COALESCE(private.print_patch_number(p_patch, 'printingPlainSettingWastageKg'), 0);
  printed := COALESCE(private.print_patch_number(p_patch, 'printingWastageKg'), 0);
  trim_kg := COALESCE(private.print_patch_number(p_patch, 'excessFilmWastageKg'), 0);

  IF plain < 0 OR printed < 0 OR trim_kg < 0 THEN
    RAISE EXCEPTION 'Printing scrap kilograms cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  -- Kinds match src/utils/printingScrap.js and jobWastage.js. No barcode.
  WITH kinds AS (
    SELECT * FROM (VALUES
      ('plain-setting', 'Plain Setting', plain),
      ('printing-wastage', 'Printing Wastage', printed),
      ('film-trimming', 'Film Trimming Wastage', trim_kg)
    ) AS entry(kind, label, qty)
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', 'print-scrap:' || p_order_id || ':' || kind,
      'orderId', p_order_id,
      'jobNo', job_code,
      'jobCode', job_code,
      'jobName', job_name,
      'clientName', client_name,
      'scrapQtyKg', qty,
      'defectCategory', label,
      'type', label,
      'stage', 'Printing',
      'source', 'printing',
      'scrapReason', label || ' recorded at printing for ' || job_code,
      'scrappedBy', coalesce(NULLIF(btrim(p_patch ->> 'operatorName'), ''), 'Operator'),
      'date', to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
    )) FILTER (WHERE qty > 0), '[]'::jsonb),
    COALESCE(jsonb_agg(to_jsonb('print-scrap:' || p_order_id || ':' || kind)) FILTER (WHERE qty <= 0), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object(
      'stage', 'Printing',
      'type', label,
      'scrapQtyKg', qty
    )) FILTER (WHERE qty > 0), '[]'::jsonb),
    COALESCE(sum(qty), 0)
  INTO upserts, deletes, stages, total
  FROM kinds;

  pct := CASE WHEN order_qty > 0 THEN round((total / order_qty) * 100, 2) ELSE NULL END;
  flagged := pct IS NOT NULL AND pct >= 5;

  RETURN jsonb_build_object(
    'scrap', jsonb_build_object('upserts', upserts, 'deleteIds', deletes),
    'registry', CASE
      WHEN flagged THEN jsonb_build_object('upsert', jsonb_build_object(
        'id', 'high-scrap:' || p_order_id,
        'orderId', p_order_id,
        'jobNo', job_code,
        'jobName', job_name,
        'clientName', client_name,
        'orderQtyKg', order_qty,
        'orderQtyUnit', 'kg',
        'totalWastageKg', total,
        'wastagePct', pct,
        'thresholdPct', 5,
        'stages', stages,
        'source', 'high-scrap-registry',
        'operatorName', coalesce(p_patch ->> 'operatorName', '')
      ))
      ELSE jsonb_build_object('deleteId', 'high-scrap:' || p_order_id)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_printing_wastage(p_plan jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  access text;
  scrap jsonb;
  entry jsonb;
  entry_id text;
  order_id text;
  kind text;
  payload jsonb;
  previous jsonb;
  registry jsonb;
  reg_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record printing wastage'
      USING ERRCODE = '42501';
  END IF;

  access := private.print_wastage_access();
  IF access = 'none' THEN
    RAISE EXCEPTION 'Not allowed to record printing wastage'
      USING ERRCODE = '42501';
  END IF;

  IF p_plan IS NULL OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    RETURN;
  END IF;

  scrap := COALESCE(p_plan -> 'scrap', p_plan);

  IF to_regclass('public.sfg_scrap_items') IS NOT NULL
     AND jsonb_typeof(scrap -> 'deleteIds') = 'array' THEN
    FOR entry_id IN
      SELECT btrim(value)
      FROM jsonb_array_elements_text(scrap -> 'deleteIds') AS listed(value)
    LOOP
      kind := substring(entry_id FROM '^print-scrap:.+:(plain-setting|printing-wastage|film-trimming)$');
      IF access = 'printer' AND kind IS NULL THEN
        CONTINUE;
      END IF;
      DELETE FROM public.sfg_scrap_items WHERE id = entry_id;
    END LOOP;
  END IF;

  IF to_regclass('public.sfg_scrap_items') IS NOT NULL
     AND jsonb_typeof(scrap -> 'upserts') = 'array' THEN
    FOR entry IN
      SELECT value FROM jsonb_array_elements(scrap -> 'upserts') AS listed(value)
    LOOP
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN
        CONTINUE;
      END IF;
      entry_id := btrim(coalesce(entry ->> 'id', ''));
      order_id := btrim(coalesce(entry ->> 'orderId', ''));
      kind := substring(entry_id FROM '^print-scrap:.+:(plain-setting|printing-wastage|film-trimming)$');
      IF access = 'printer' THEN
        IF kind IS NULL OR entry_id IS DISTINCT FROM 'print-scrap:' || order_id || ':' || kind THEN
          CONTINUE;
        END IF;
        IF coalesce(entry ->> 'source', 'printing') IS DISTINCT FROM 'printing' THEN
          CONTINUE;
        END IF;
      ELSIF entry_id = '' THEN
        CONTINUE;
      END IF;
      -- Printing scrap is a weight. It does not receive a barcode. A barcode-shaped
      -- hold tag already on the row is kept as the source roll, not copied onto a new code.
      payload := entry
        - 'barcode' - 'barcodeId' - 'barcode_id'
        - 'sfgBatchCode' - 'sfg_batch_code'
        - 'fgBatchCode' - 'fg_batch_code';
      IF access = 'printer' THEN
        payload := payload || jsonb_build_object('source', 'printing');
      END IF;
      IF btrim(coalesce(payload ->> 'holdTagId', '')) ~* '^(SFG|FG|RM|CON|QCHOLD|QC-HOLD|SCRAP|ADJ|BAR|CYL|SKU-CYL|FG-DISP)-'
         OR btrim(coalesce(payload ->> 'holdTagId', '')) ~* '-BAL$' THEN
        IF btrim(coalesce(payload ->> 'sourceRollBarcode', '')) = '' THEN
          payload := payload || jsonb_build_object('sourceRollBarcode', btrim(payload ->> 'holdTagId'));
        END IF;
        payload := payload - 'holdTagId';
      END IF;
      payload := payload || jsonb_build_object('id', entry_id);
      previous := NULL;
      SELECT existing.payload INTO previous
      FROM public.sfg_scrap_items AS existing
      WHERE existing.id = entry_id;
      IF previous IS NOT NULL THEN
        IF btrim(coalesce(previous ->> 'barcode', '')) <> '' THEN
          payload := payload || jsonb_build_object('barcode', previous ->> 'barcode');
        END IF;
        IF btrim(coalesce(previous ->> 'barcodeId', '')) <> '' THEN
          payload := payload || jsonb_build_object('barcodeId', previous ->> 'barcodeId');
        END IF;
        IF btrim(coalesce(previous ->> 'barcode_id', '')) <> '' THEN
          payload := payload || jsonb_build_object('barcode_id', previous ->> 'barcode_id');
        END IF;
        IF btrim(coalesce(previous ->> 'sfgBatchCode', '')) <> '' THEN
          payload := payload || jsonb_build_object('sfgBatchCode', previous ->> 'sfgBatchCode');
        END IF;
        IF btrim(coalesce(previous ->> 'holdTagId', '')) <> '' THEN
          payload := payload || jsonb_build_object('holdTagId', previous ->> 'holdTagId');
        END IF;
      END IF;
      INSERT INTO public.sfg_scrap_items (id, payload, updated_at)
      VALUES (entry_id, payload, pg_catalog.now())
      ON CONFLICT (id) DO UPDATE
      SET payload = EXCLUDED.payload,
          updated_at = pg_catalog.now();
    END LOOP;
  END IF;

  registry := p_plan -> 'registry';
  IF to_regclass('public.high_scrap_registry') IS NULL OR jsonb_typeof(registry) IS DISTINCT FROM 'object' THEN
    RETURN;
  END IF;

  reg_id := NULLIF(btrim(coalesce(registry ->> 'deleteId', '')), '');
  IF reg_id IS NOT NULL THEN
    IF access = 'editor' OR reg_id ~ '^high-scrap:.+' THEN
      IF access = 'printer' AND EXISTS (
        SELECT 1 FROM public.high_scrap_registry AS existing
        WHERE existing.id = reg_id
          AND coalesce(existing.payload ->> 'source', '') NOT IN ('', 'high-scrap-registry', 'printing')
      ) THEN
        NULL;
      ELSE
        DELETE FROM public.high_scrap_registry WHERE id = reg_id;
      END IF;
    END IF;
  END IF;

  entry := registry -> 'upsert';
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN
    RETURN;
  END IF;
  entry_id := btrim(coalesce(entry ->> 'id', ''));
  order_id := btrim(coalesce(entry ->> 'orderId', ''));
  IF access = 'printer' THEN
    IF entry_id IS DISTINCT FROM 'high-scrap:' || order_id OR entry_id !~ '^high-scrap:.+' THEN
      RETURN;
    END IF;
  ELSIF entry_id = '' THEN
    RETURN;
  END IF;
  entry := entry
    - 'barcode' - 'barcodeId' - 'barcode_id'
    - 'sfgBatchCode' - 'sfg_batch_code'
    - 'fgBatchCode' - 'fg_batch_code'
    - 'holdTagId';
  entry := entry || jsonb_build_object('id', entry_id);
  INSERT INTO public.high_scrap_registry (id, payload, updated_at)
  VALUES (entry_id, entry, pg_catalog.now())
  ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload,
      updated_at = pg_catalog.now();
END;
$$;

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

  IF jsonb_array_length(printed) = 1
     AND private.print_patch_number(printed -> 0, 'lengthMeters') IS NULL
     AND meters IS NOT NULL AND meters > 0 THEN
    printed := jsonb_set(printed, '{0,lengthMeters}', to_jsonb(round(meters, 2)), true);
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
        COALESCE((child ->> 'lengthMeters')::numeric, 0),
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
          length_meters = EXCLUDED.length_meters,
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
  outputs := private.post_print_run_outputs(
    p_order_id,
    COALESCE(p_patch, '{}'::jsonb),
    COALESCE(result -> 'balanceRolls', '[]'::jsonb)
  );
  PERFORM public.record_printing_wastage(private.print_run_wastage_plan(p_order_id, COALESCE(p_patch, '{}'::jsonb)));
  RETURN COALESCE(result, '{}'::jsonb) || COALESCE(outputs, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION private.print_patch_number(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.caller_can_print() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.print_wastage_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.note_printed_barcode(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.print_run_wastage_plan(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.post_print_run_outputs(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_printing_wastage(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_print_run(text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.print_patch_number(jsonb, text) FROM anon;
    REVOKE ALL ON FUNCTION private.caller_can_print() FROM anon;
    REVOKE ALL ON FUNCTION private.print_wastage_access() FROM anon;
    REVOKE ALL ON FUNCTION private.note_printed_barcode(text, text, text, text) FROM anon;
    REVOKE ALL ON FUNCTION private.print_run_wastage_plan(text, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION private.post_print_run_outputs(text, jsonb, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.record_printing_wastage(jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.complete_print_run(text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.print_patch_number(jsonb, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.caller_can_print() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.print_wastage_access() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.note_printed_barcode(text, text, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.print_run_wastage_plan(text, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.post_print_run_outputs(text, jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.record_printing_wastage(jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.complete_print_run(text, jsonb) TO authenticated;
  END IF;
END $$;
