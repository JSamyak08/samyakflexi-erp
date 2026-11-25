-- Direct slitting keeps each mother roll's own rate and values every new
-- roll, every -BAL roll, and scrap at the kg-weighted average of those rates.
-- The request shape is unchanged. An existing width item's unit_price is not
-- overwritten. A missing rate is stored as 0 and does not block the slit.

ALTER TABLE public.roll_conversions
  ADD COLUMN IF NOT EXISTS purchase_rate numeric;

COMMENT ON COLUMN public.roll_conversions.purchase_rate IS
  'Kg-weighted average rupees per kg applied to the new rolls, balance rolls, and scrap of this slit.';

CREATE OR REPLACE FUNCTION private.direct_slit_roll_rate(
  p_metadata jsonb,
  p_grn_line_item_id text,
  p_item_unit_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  raw text;
  rate numeric;
  grn_rate numeric;
BEGIN
  IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
    raw := NULLIF(pg_catalog.btrim(p_metadata ->> 'purchaseRatePerKg'), '');
    IF raw IS NOT NULL THEN
      BEGIN
        rate := raw::numeric;
      EXCEPTION WHEN invalid_text_representation THEN
        rate := NULL;
      END;
      IF rate IS NOT NULL AND rate > 0 THEN
        RETURN rate;
      END IF;
    END IF;
    raw := NULLIF(pg_catalog.btrim(p_metadata ->> 'unitPrice'), '');
    IF raw IS NOT NULL THEN
      BEGIN
        rate := raw::numeric;
      EXCEPTION WHEN invalid_text_representation THEN
        rate := NULL;
      END;
      IF rate IS NOT NULL AND rate > 0 THEN
        RETURN rate;
      END IF;
    END IF;
  END IF;

  IF p_grn_line_item_id IS NOT NULL
     AND pg_catalog.btrim(p_grn_line_item_id) <> ''
     AND to_regclass('public.grn_line_items') IS NOT NULL THEN
    EXECUTE 'SELECT purchase_rate FROM public.grn_line_items WHERE id = $1 LIMIT 1'
      INTO grn_rate
      USING pg_catalog.btrim(p_grn_line_item_id);
    IF grn_rate IS NOT NULL AND grn_rate > 0 THEN
      RETURN grn_rate;
    END IF;
  END IF;

  IF p_item_unit_price IS NOT NULL AND p_item_unit_price > 0 THEN
    RETURN p_item_unit_price;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_blend_rate(p_parents jsonb)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(round(
    SUM(COALESCE((value ->> 'consumedKg')::numeric, 0) * COALESCE((value ->> 'rate')::numeric, 0))
    / NULLIF(SUM(COALESCE((value ->> 'consumedKg')::numeric, 0)), 0)
  , 2), 0)
  FROM jsonb_array_elements(COALESCE(p_parents, '[]'::jsonb)) AS value;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_post(p_doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  actor text;
  conv_id text;
  existing_status text;
  existing_result jsonb;
  elem jsonb;
  parents jsonb := '[]'::jsonb;
  outputs jsonb := '[]'::jsonb;
  parent jsonb;
  output jsonb;
  barcode text;
  consumed numeric;
  roll public.inventory_rolls%ROWTYPE;
  item public.inventory%ROWTYPE;
  film text;
  micron numeric;
  width_mm numeric;
  meta text;
  density numeric;
  category text;
  price numeric;
  first boolean := true;
  trim_kg numeric;
  setting_kg numeric;
  line_no integer := 0;
  destination text;
  net_kg numeric;
  out_width numeric;
  lane integer;
  order_id text;
  header_order text;
  notes text;
  reason text;
  consumed_sum numeric := 0;
  output_sum numeric := 0;
  balance_sum numeric := 0;
  balance_kg numeric;
  variance numeric;
  parent_run numeric := 0;
  parent_area numeric := 0;
  output_area numeric := 0;
  scrap_area numeric := 0;
  lane_metres jsonb := '{}'::jsonb;
  lane_key text;
  lane_pct numeric := 0;
  area_pct numeric := 0;
  metres_pct numeric := 0;
  metres_status text := 'ok';
  this_run numeric;
  this_exact numeric;
  override boolean := false;
  warnings jsonb := '[]'::jsonb;
  summary jsonb;
  resolved jsonb;
  batches jsonb := '{}'::jsonb;
  batch_code text;
  batch_key text;
  child_code text;
  bal_code text;
  job_name text;
  job_code text;
  client_name text;
  order_json jsonb;
  stage_type text;
  roll_type text;
  roll_category text;
  roll_status text;
  sfg_status text;
  deduct jsonb := '{}'::jsonb;
  receipt jsonb := '{}'::jsonb;
  item_key text;
  scrap_id text;
  rate numeric;
  blend numeric := 0;
  parent_rate numeric;
  grn_line_id text;
  out_metres integer;
  gross_kg numeric;
  tare_kg numeric;
  blocked boolean;
  attempt integer;
  suffix text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.direct_slit_can_post() THEN
    RAISE EXCEPTION 'Not allowed to post a direct slit' USING ERRCODE = '42501';
  END IF;
  IF p_doc IS NULL OR jsonb_typeof(p_doc) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Direct slit details are missing' USING ERRCODE = '22023';
  END IF;

  actor := private.direct_slit_actor();
  conv_id := private.direct_slit_text(p_doc, 'id', 'conversionId');
  IF conv_id IS NOT NULL THEN
    IF conv_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$' THEN
      RAISE EXCEPTION 'Conversion id is not valid' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('direct-slit'), hashtext(conv_id));
    SELECT status, result INTO existing_status, existing_result
    FROM public.roll_conversions
    WHERE id = conv_id
    FOR UPDATE;
    IF FOUND AND existing_status = 'posted' THEN
      RETURN existing_result;
    END IF;
    IF FOUND THEN
      RAISE EXCEPTION 'Conversion % is already reversed', conv_id USING ERRCODE = '22023';
    END IF;
  END IF;

  header_order := private.direct_slit_text(p_doc, 'orderId', 'order_id');
  notes := private.direct_slit_text(p_doc, 'notes');
  reason := private.direct_slit_text(p_doc, 'overrideReason', 'override_reason');
  trim_kg := COALESCE(private.direct_slit_num(p_doc, 'trimScrapKg', 'trim_scrap_kg'), 0);
  setting_kg := COALESCE(private.direct_slit_num(p_doc, 'settingScrapKg', 'setting_scrap_kg'), 0);
  IF trim_kg < 0 OR setting_kg < 0 THEN
    RAISE EXCEPTION 'Scrap kilograms cannot be negative' USING ERRCODE = '22023';
  END IF;
  trim_kg := private.direct_slit_round(trim_kg);
  setting_kg := private.direct_slit_round(setting_kg);

  IF jsonb_typeof(p_doc -> 'parents') IS DISTINCT FROM 'array' OR jsonb_array_length(p_doc -> 'parents') < 1 THEN
    RAISE EXCEPTION 'Scan at least one parent roll' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_doc -> 'outputs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_doc -> 'outputs') < 1 THEN
    RAISE EXCEPTION 'Enter at least one output roll' USING ERRCODE = '22023';
  END IF;

  FOR elem IN
    SELECT value
    FROM jsonb_array_elements(p_doc -> 'parents') AS value
    ORDER BY lower(btrim(COALESCE(value ->> 'barcode', value ->> 'barcodeId', '')))
  LOOP
    barcode := COALESCE(private.direct_slit_text(elem, 'barcode', 'barcodeId'), '');
    consumed := private.direct_slit_round(private.direct_slit_num(elem, 'consumedKg', 'consumed_kg'));
    IF barcode = '' OR consumed IS NULL OR consumed <= 0 THEN
      RAISE EXCEPTION 'Each parent roll needs a barcode and kilograms consumed' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(parents) AS prior
      WHERE lower(prior ->> 'barcode') = lower(barcode)
    ) THEN
      RAISE EXCEPTION 'Roll % is listed twice', barcode USING ERRCODE = '22023';
    END IF;
    SELECT * INTO roll
    FROM public.inventory_rolls
    WHERE lower(btrim(barcode_id)) = lower(barcode)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Roll % is not in stock', barcode USING ERRCODE = '22023';
    END IF;
    barcode := roll.barcode_id;
    IF to_regprocedure('private.roll_barcode_blocked(text)') IS NOT NULL THEN
      EXECUTE 'SELECT private.roll_barcode_blocked($1)' INTO blocked USING barcode;
      IF blocked THEN
        RAISE EXCEPTION 'Roll % cannot be slit', barcode USING ERRCODE = '22023';
      END IF;
    END IF;
    IF COALESCE(roll.available_weight_kg, 0) <= 0
       OR lower(btrim(COALESCE(roll.status, ''))) LIKE 'issued%'
       OR lower(btrim(COALESCE(roll.status, ''))) IN ('written off', 'deleted', 'void', 'consumed', 'reversed')
       OR lower(btrim(COALESCE(roll.status, ''))) LIKE '%pending%'
       OR lower(btrim(COALESCE(roll.qc_status, ''))) LIKE '%pending%'
       OR lower(btrim(COALESCE(roll.status, ''))) LIKE '%reject%'
       OR lower(btrim(COALESCE(roll.qc_status, ''))) LIKE '%reject%' THEN
      RAISE EXCEPTION 'Roll % is not available to slit', barcode USING ERRCODE = '22023';
    END IF;
    IF consumed > roll.available_weight_kg + 0.001 THEN
      RAISE EXCEPTION 'Roll % only has % kg', barcode, private.direct_slit_round(roll.available_weight_kg)
        USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(COALESCE(roll.item_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Roll % is not linked to a stock item', barcode USING ERRCODE = '22023';
    END IF;
    SELECT * INTO item FROM public.inventory WHERE id = roll.item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock item for roll % was not found', barcode USING ERRCODE = '22023';
    END IF;
    IF COALESCE(item.is_active, true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Stock item % is archived', item.id USING ERRCODE = '22023';
    END IF;
    film := COALESCE(NULLIF(btrim(roll.film_type), ''), NULLIF(btrim(item.film_type), ''));
    micron := COALESCE(roll.micron, item.micron);
    width_mm := COALESCE(roll.width_mm, item.width_mm);
    meta := COALESCE(NULLIF(btrim(item.metallocene_pct), ''), NULLIF(btrim(roll.metallocene_pct), ''));
    IF film IS NULL OR micron IS NULL OR width_mm IS NULL THEN
      RAISE EXCEPTION 'Roll % has no film, micron, and width', barcode USING ERRCODE = '22023';
    END IF;
    IF first THEN
      density := CASE WHEN COALESCE(item.density, 0) > 0 THEN item.density ELSE 1.40 END;
      category := item.category;
      first := false;
    ELSE
      IF lower(btrim(film)) IS DISTINCT FROM lower(btrim(parents -> 0 ->> 'filmType'))
         AND private.direct_slit_film_code(film) IS DISTINCT FROM private.direct_slit_film_code(parents -> 0 ->> 'filmType') THEN
        RAISE EXCEPTION 'Parent rolls must be the same film' USING ERRCODE = '22023';
      END IF;
      IF micron IS DISTINCT FROM (parents -> 0 ->> 'micron')::numeric
         OR width_mm IS DISTINCT FROM (parents -> 0 ->> 'widthMm')::numeric
         OR private.direct_slit_meta_key(meta) IS DISTINCT FROM private.direct_slit_meta_key(parents -> 0 ->> 'metallocenePct') THEN
        RAISE EXCEPTION 'Parent rolls must be the same micron, grade, and width' USING ERRCODE = '22023';
      END IF;
      IF abs(COALESCE(CASE WHEN COALESCE(item.density, 0) > 0 THEN item.density ELSE 1.40 END, 0) - density) > 0.001 THEN
        RAISE EXCEPTION 'Parent rolls do not share a density' USING ERRCODE = '22023';
      END IF;
    END IF;
    balance_kg := private.direct_slit_round(roll.available_weight_kg - consumed);
    IF balance_kg < 0 THEN
      balance_kg := 0;
    END IF;
    grn_line_id := NULL;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inventory_rolls'
        AND column_name = 'grn_line_item_id'
    ) THEN
      EXECUTE 'SELECT grn_line_item_id::text FROM public.inventory_rolls WHERE barcode_id = $1'
        INTO grn_line_id
        USING roll.barcode_id;
    END IF;
    parent_rate := private.direct_slit_roll_rate(roll.metadata, grn_line_id, item.unit_price);
    parents := parents || jsonb_build_array(jsonb_build_object(
      'barcode', barcode,
      'itemId', item.id,
      'itemName', item.item_name,
      'filmType', film,
      'micron', micron,
      'widthMm', width_mm,
      'metallocenePct', meta,
      'category', item.category,
      'rate', parent_rate,
      'consumedKg', consumed,
      'balanceKg', balance_kg,
      'availableBefore', roll.available_weight_kg,
      'statusBefore', roll.status,
      'vendorName', roll.vendor_name,
      'batchNo', roll.batch_no,
      'grnNo', COALESCE(NULLIF(btrim(roll.metadata ->> 'grnNo'), ''), NULLIF(btrim(roll.grn_id), '')),
      'lengthMeters', roll.length_meters,
      'locationBay', roll.location_bay
    ));
    consumed_sum := private.direct_slit_round(consumed_sum + consumed);
    balance_sum := private.direct_slit_round(balance_sum + balance_kg);
    this_run := CASE
      WHEN COALESCE(roll.length_meters, 0) > 0 AND roll.available_weight_kg > 0
        THEN roll.length_meters * (consumed / roll.available_weight_kg)
      ELSE private.direct_slit_exact_metres(consumed, width_mm, micron, density)
    END;
    parent_run := parent_run + this_run;
    parent_area := parent_area + (width_mm * this_run);
  END LOOP;

  blend := private.direct_slit_blend_rate(parents);
  price := blend;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_doc -> 'outputs') AS value
  LOOP
    line_no := line_no + 1;
    destination := lower(COALESCE(private.direct_slit_text(elem, 'destination'), 'inventory'));
    IF destination NOT IN ('inventory', 'sfg', 'fg') THEN
      RAISE EXCEPTION 'Output % destination must be inventory, sfg, or fg', line_no USING ERRCODE = '22023';
    END IF;
    net_kg := private.direct_slit_round(private.direct_slit_num(elem, 'netKg', 'net_kg'));
    out_width := private.direct_slit_num(elem, 'widthMm', 'width_mm');
    IF net_kg IS NULL OR net_kg <= 0 OR out_width IS NULL OR out_width <= 0 THEN
      RAISE EXCEPTION 'Output % needs a net weight and a width', line_no USING ERRCODE = '22023';
    END IF;
    IF out_width > width_mm + 0.01 THEN
      RAISE EXCEPTION 'Output % is wider than the parent roll', line_no USING ERRCODE = '22023';
    END IF;
    gross_kg := private.direct_slit_num(elem, 'grossKg', 'gross_kg');
    tare_kg := private.direct_slit_num(elem, 'tareKg', 'tare_kg');
    IF gross_kg IS NOT NULL AND tare_kg IS NOT NULL AND gross_kg < tare_kg THEN
      RAISE EXCEPTION 'Output % gross weight is below its tare', line_no USING ERRCODE = '22023';
    END IF;
    lane := COALESCE(private.direct_slit_num(elem, 'lane', 'laneNo')::integer, line_no);
    IF lane < 1 THEN
      lane := line_no;
    END IF;
    order_id := COALESCE(private.direct_slit_text(elem, 'orderId', 'order_id'), header_order);
    IF destination IN ('sfg', 'fg') AND order_id IS NULL THEN
      RAISE EXCEPTION 'Output % needs an order', line_no USING ERRCODE = '22023';
    END IF;
    this_exact := private.direct_slit_exact_metres(net_kg, out_width, micron, density);
    output_area := output_area + (out_width * this_exact);
    lane_key := lane::text;
    lane_metres := jsonb_set(
      lane_metres,
      ARRAY[lane_key],
      to_jsonb(COALESCE((lane_metres ->> lane_key)::numeric, 0) + this_exact),
      true
    );
    outputs := outputs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'lineNo', line_no,
      'destination', destination,
      'netKg', net_kg,
      'widthMm', out_width,
      'grossKg', gross_kg,
      'tareKg', tare_kg,
      'lane', lane,
      'orderId', order_id,
      'stockItemId', private.direct_slit_text(elem, 'stockItemId', 'stock_item_id'),
      'stageType', private.direct_slit_text(elem, 'stageType', 'sfgType'),
      'lengthMeters', private.direct_slit_metres(net_kg, out_width, micron, density)
    )));
    output_sum := private.direct_slit_round(output_sum + net_kg);
  END LOOP;

  variance := private.direct_slit_round(consumed_sum - output_sum - trim_kg - setting_kg);
  scrap_area := CASE
    WHEN micron > 0 AND density > 0 THEN ((trim_kg + setting_kg) * 1000000) / (micron * density)
    ELSE 0
  END;
  IF parent_area > 0 THEN
    area_pct := (abs(output_area + scrap_area - parent_area) / parent_area) * 100;
  END IF;
  IF parent_run > 0 THEN
    FOR lane_key IN SELECT jsonb_object_keys(lane_metres)
    LOOP
      this_exact := (lane_metres ->> lane_key)::numeric;
      this_run := (abs(this_exact - parent_run) / parent_run) * 100;
      IF this_run > lane_pct THEN
        lane_pct := this_run;
      END IF;
    END LOOP;
  END IF;
  metres_pct := round(GREATEST(area_pct, lane_pct), 2);
  IF metres_pct > 25 THEN
    metres_status := 'block';
  ELSIF metres_pct > 8 THEN
    metres_status := 'warn';
    warnings := warnings || jsonb_build_array(
      'Running length is ' || metres_pct::text || '% away from the parent roll.'
    );
  END IF;

  IF abs(variance) > 0.50 OR metres_status = 'block' THEN
    IF NOT private.direct_slit_can_override() OR reason IS NULL THEN
      IF abs(variance) > 0.50 THEN
        RAISE EXCEPTION 'Mass balance is off by % kg. An Admin or Plant Manager can post it with a reason.', variance
          USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Running length is % percent away from the parent roll. An Admin or Plant Manager can post it with a reason.', metres_pct
        USING ERRCODE = '22023';
    END IF;
    override := true;
  END IF;

  IF conv_id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('direct-slit-id'), 1);
    SELECT COALESCE(MAX(substring(id FROM '[0-9]+$')::integer), 0) + 1
      INTO line_no
    FROM public.roll_conversions
    WHERE id LIKE 'CONV-' || to_char(pg_catalog.now(), 'YYYYMMDD') || '-%';
    conv_id := 'CONV-' || to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || lpad(line_no::text, 4, '0');
  END IF;

  INSERT INTO public.roll_conversions (
    id, status, created_by, created_by_uid, order_id, film_type, micron, width_mm,
    metallocene_pct, density, consumed_kg, output_kg, trim_scrap_kg, setting_scrap_kg,
    balance_kg, variance_kg, metres_pct, metres_status, override, override_reason,
    override_by, notes, purchase_rate
  ) VALUES (
    conv_id, 'posted', actor, auth.uid(), header_order, film, micron, width_mm,
    meta, density, consumed_sum, output_sum, trim_kg, setting_kg,
    balance_sum, variance, metres_pct, metres_status, override,
    CASE WHEN override THEN reason ELSE NULL END,
    CASE WHEN override THEN actor ELSE NULL END,
    notes, blend
  );

  FOR parent IN SELECT value FROM jsonb_array_elements(parents) AS value
  LOOP
    barcode := parent ->> 'barcode';
    consumed := (parent ->> 'consumedKg')::numeric;
    balance_kg := (parent ->> 'balanceKg')::numeric;
    bal_code := NULL;
    UPDATE public.inventory_rolls
    SET available_weight_kg = 0,
        status = 'Issued to Direct Slitting'
    WHERE barcode_id = barcode;
      IF balance_kg > 0 THEN
      bal_code := barcode || '-BAL';
      IF EXISTS (
        SELECT 1 FROM public.inventory_rolls
        WHERE lower(btrim(barcode_id)) = lower(bal_code)
          AND lower(btrim(COALESCE(status, ''))) LIKE 'in stock%'
          AND COALESCE(available_weight_kg, 0) > 0
      ) THEN
        RAISE EXCEPTION 'Balance barcode % already exists', bal_code USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, micron, width_mm, film_type,
        net_weight_kg, available_weight_kg, gross_weight_kg, status, qc_status, location_bay,
        inward_datetime, vendor_name, batch_no, length_meters, metallocene_pct, metadata
      ) VALUES (
        bal_code,
        'RAW_MATERIAL',
        parent ->> 'itemId',
        COALESCE(parent ->> 'itemName', film),
        COALESCE(parent ->> 'category', 'Film Substrates'),
        micron,
        width_mm,
        film,
        balance_kg,
        balance_kg,
        balance_kg,
        'In Stock (RM)',
        'Approved',
        COALESCE(parent ->> 'locationBay', 'RM Store - Substrate Rolls'),
        pg_catalog.now(),
        parent ->> 'vendorName',
        parent ->> 'batchNo',
        CASE
          WHEN COALESCE((parent ->> 'lengthMeters')::numeric, 0) > 0
            AND COALESCE((parent ->> 'availableBefore')::numeric, 0) > 0
            THEN round((parent ->> 'lengthMeters')::numeric * balance_kg / (parent ->> 'availableBefore')::numeric)
          ELSE private.direct_slit_metres(balance_kg, width_mm, micron, density)
        END,
        NULLIF(parent ->> 'metallocenePct', ''),
        jsonb_build_object(
          'balanceRoll', true,
          'parentBarcodeId', barcode,
          'conversionId', conv_id,
          'directSlitting', true,
          'purchaseRatePerKg', blend,
          'unitPrice', blend
        )
      )
      ON CONFLICT (barcode_id) DO UPDATE
      SET item_id = EXCLUDED.item_id,
          item_name = EXCLUDED.item_name,
          net_weight_kg = EXCLUDED.net_weight_kg,
          available_weight_kg = EXCLUDED.available_weight_kg,
          gross_weight_kg = EXCLUDED.gross_weight_kg,
          status = EXCLUDED.status,
          qc_status = EXCLUDED.qc_status,
          length_meters = EXCLUDED.length_meters,
          metadata = EXCLUDED.metadata,
          inward_datetime = EXCLUDED.inward_datetime;
    END IF;
    INSERT INTO public.roll_conversion_parents (
      id, conversion_id, barcode, stock_item_id, film_type, micron, width_mm, metallocene_pct,
      available_before, status_before, consumed_kg, balance_kg, balance_barcode,
      purchase_rate, vendor_name, batch_no, grn_no, length_meters
    ) VALUES (
      'parent:' || conv_id || ':' || lower(barcode),
      conv_id, barcode, parent ->> 'itemId', film, micron, width_mm, NULLIF(parent ->> 'metallocenePct', ''),
      (parent ->> 'availableBefore')::numeric, parent ->> 'statusBefore', consumed, balance_kg, bal_code,
      COALESCE((parent ->> 'rate')::numeric, 0), parent ->> 'vendorName', parent ->> 'batchNo',
      parent ->> 'grnNo', NULLIF(parent ->> 'lengthMeters', '')::numeric
    );
    INSERT INTO public.inventory_ledger_entries (
      id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, stock_item_id,
      order_id, qty_kg, consumed_kg, applied_stock_kg, qty_source, film_type, micron, width_mm,
      item_name, purchase_rate, vendor_name, batch_no, grn_no, occurred_at
    ) VALUES (
      'conv-issue:' || conv_id || ':' || lower(barcode),
      'conversion_issue', 'conv:' || conv_id, 'Direct Slitting', barcode, lower(barcode), barcode,
      parent ->> 'itemId', header_order, consumed, consumed, consumed, 'direct_slitting',
      film, micron, width_mm, parent ->> 'itemName', COALESCE((parent ->> 'rate')::numeric, 0),
      parent ->> 'vendorName', parent ->> 'batchNo', parent ->> 'grnNo', pg_catalog.now()
    );
    IF balance_kg > 0 THEN
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, balance_barcode,
        stock_item_id, order_id, qty_kg, consumed_kg, balance_kg, applied_stock_kg, qty_source,
        film_type, micron, width_mm, item_name, purchase_rate, vendor_name, batch_no, grn_no, occurred_at
      ) VALUES (
        'conv-balance:' || conv_id || ':' || lower(bal_code),
        'conversion_balance', 'conv:' || conv_id, 'Direct Slitting', bal_code, lower(bal_code),
        barcode, bal_code, parent ->> 'itemId', header_order, balance_kg, 0, balance_kg, 0,
        'direct_slitting', film, micron, width_mm,
        COALESCE(parent ->> 'itemName', film), blend,
        parent ->> 'vendorName', parent ->> 'batchNo', parent ->> 'grnNo',
        pg_catalog.now() + interval '1 second'
      );
    END IF;
    item_key := parent ->> 'itemId';
    deduct := jsonb_set(
      deduct,
      ARRAY[item_key],
      to_jsonb(COALESCE((deduct ->> item_key)::numeric, 0) + consumed),
      true
    );
  END LOOP;

  FOR output IN SELECT value FROM jsonb_array_elements(outputs) AS value
  LOOP
    destination := output ->> 'destination';
    net_kg := (output ->> 'netKg')::numeric;
    out_width := (output ->> 'widthMm')::numeric;
    lane := (output ->> 'lane')::integer;
    line_no := (output ->> 'lineNo')::integer;
    order_id := NULLIF(output ->> 'orderId', '');
    out_metres := (output ->> 'lengthMeters')::integer;
    gross_kg := NULLIF(output ->> 'grossKg', '')::numeric;
    tare_kg := NULLIF(output ->> 'tareKg', '')::numeric;
    rate := blend;

    IF destination = 'inventory' THEN
      resolved := private.direct_slit_resolve_item(
        output ->> 'stockItemId', film, micron, out_width, meta, category, density, price, parents -> 0 ->> 'itemId'
      );
      child_code := private.direct_slit_barcode('RM-BC');
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, micron, width_mm, film_type,
        net_weight_kg, available_weight_kg, gross_weight_kg, tare_weight_kg, status, qc_status,
        location_bay, inward_datetime, vendor_name, batch_no, length_meters, metallocene_pct,
        input_barcode_ids, metadata
      ) VALUES (
        child_code, 'RAW_MATERIAL', resolved ->> 'id', resolved ->> 'name',
        COALESCE(category, 'Film Substrates'), micron, out_width, film,
        net_kg, net_kg, COALESCE(gross_kg, net_kg), COALESCE(tare_kg, 0),
        'In Stock (RM)', 'Approved',
        COALESCE(parents -> 0 ->> 'locationBay', 'RM Store - Substrate Rolls'),
        pg_catalog.now(), parents -> 0 ->> 'vendorName', parents -> 0 ->> 'batchNo',
        out_metres, NULLIF(meta, ''),
        (SELECT jsonb_agg(p ->> 'barcode') FROM jsonb_array_elements(parents) AS p),
        jsonb_build_object(
          'directSlitting', true,
          'conversionId', conv_id,
          'parentBarcodeId', parents -> 0 ->> 'barcode',
          'lane', lane,
          'purchaseRatePerKg', rate,
          'unitPrice', rate
        )
      );
      item_key := resolved ->> 'id';
      receipt := jsonb_set(
        receipt,
        ARRAY[item_key],
        to_jsonb(COALESCE((receipt ->> item_key)::numeric, 0) + net_kg),
        true
      );
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, stock_item_id,
        order_id, qty_kg, consumed_kg, applied_stock_kg, qty_source, film_type, micron, width_mm,
        item_name, purchase_rate, vendor_name, batch_no, grn_no, occurred_at
      ) VALUES (
        'conv-receipt:' || conv_id || ':' || lower(child_code),
        'conversion_receipt', 'conv:' || conv_id, 'Direct Slitting', child_code, lower(child_code),
        parents -> 0 ->> 'barcode', item_key, header_order, net_kg, 0, net_kg, 'direct_slitting',
        film, micron, out_width, resolved ->> 'name', rate,
        parents -> 0 ->> 'vendorName', parents -> 0 ->> 'batchNo', parents -> 0 ->> 'grnNo',
        pg_catalog.now()
      );
      INSERT INTO public.roll_conversion_outputs (
        id, conversion_id, line_no, destination, barcode, stock_item_id, order_id,
        width_mm, length_meters, net_kg, gross_kg, tare_kg, lane_no, item_created, purchase_rate
      ) VALUES (
        'out:' || conv_id || ':' || line_no, conv_id, line_no, 'inventory', child_code, item_key,
        order_id, out_width, out_metres, net_kg, gross_kg, tare_kg, lane,
        COALESCE((resolved ->> 'created')::boolean, false), rate
      );
    ELSE
      IF to_regclass('public.orders') IS NULL OR to_regclass('public.sfg_goods') IS NULL THEN
        RAISE EXCEPTION 'SFG store is not available' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(o) INTO order_json FROM public.orders AS o WHERE o.id = order_id;
      IF order_json IS NULL THEN
        RAISE EXCEPTION 'Order % was not found', order_id USING ERRCODE = '22023';
      END IF;
      job_name := COALESCE(NULLIF(btrim(order_json ->> 'job_name'), ''), 'Direct slit');
      job_code := COALESCE(
        NULLIF(btrim(order_json ->> 'job_code'), ''),
        NULLIF(btrim(order_json #>> '{job_details,jobCode}'), ''),
        order_id
      );
      client_name := NULLIF(btrim(order_json ->> 'client_name'), '');
      batch_key := destination || ':' || order_id;
      IF batches ? batch_key THEN
        batch_code := batches ->> batch_key;
        UPDATE public.sfg_goods
        SET total_net_kg = COALESCE(total_net_kg, 0) + net_kg,
            available_kg = COALESCE(available_kg, 0) + net_kg,
            total_gross_kg = COALESCE(total_gross_kg, 0) + COALESCE(gross_kg, net_kg),
            gross_weight_kg = COALESCE(gross_weight_kg, 0) + COALESCE(gross_kg, net_kg),
            total_meters = COALESCE(total_meters, 0) + out_metres,
            rolls_count = COALESCE(rolls_count, 0) + 1,
            width_mm = CASE WHEN width_mm IS NOT DISTINCT FROM out_width THEN width_mm ELSE NULL END,
            updated_at = pg_catalog.now()
        WHERE sfg_batch_code = batch_code;
      ELSE
        suffix := right(regexp_replace(conv_id, '[^A-Za-z0-9]', '', 'g'), 6);
        batch_code := CASE WHEN destination = 'fg' THEN 'FG' ELSE 'SFG' END
          || '-DS-' || regexp_replace(upper(job_code), '[^A-Z0-9]', '', 'g') || '-' || suffix;
        stage_type := COALESCE(
          NULLIF(output ->> 'stageType', ''),
          CASE WHEN destination = 'fg' THEN 'Slitted Rolls' ELSE 'Direct Slit Film' END
        );
        sfg_status := CASE
          WHEN destination = 'fg' THEN 'In Stock (Ready for Dispatch)'
          ELSE 'In Stock (WIP)'
        END;
        INSERT INTO public.sfg_goods (
          id, sfg_batch_code, sfg_type, order_id, job_name, job_code, client_name,
          film_type, micron, width_mm, total_gross_kg, gross_weight_kg, tare_weight_kg,
          total_net_kg, consumed_kg, available_kg, total_meters, rolls_count,
          operator_name, storage_bay, production_date, unit_valuation_rate, status,
          notes, is_opening_balance, created_at, updated_at
        ) VALUES (
          pg_catalog.gen_random_uuid(), batch_code, stage_type, order_id, job_name, job_code, client_name,
          film, micron, out_width, COALESCE(gross_kg, net_kg), COALESCE(gross_kg, net_kg), COALESCE(tare_kg, 0),
          net_kg, 0, net_kg, out_metres, 1,
          actor, CASE WHEN destination = 'fg' THEN 'FG Warehouse' ELSE 'Bay A' END,
          (pg_catalog.now())::date, rate, sfg_status,
          jsonb_build_object('directSlitting', true, 'conversionId', conv_id)::text,
          false, pg_catalog.now(), pg_catalog.now()
        );
        batches := batches || jsonb_build_object(batch_key, batch_code);
      END IF;
      stage_type := COALESCE(
        NULLIF(output ->> 'stageType', ''),
        CASE WHEN destination = 'fg' THEN 'Slitted Rolls' ELSE 'Direct Slit Film' END
      );
      roll_type := CASE WHEN destination = 'fg' THEN 'FG' ELSE 'SEMI_FINISHED_GOODS' END;
      roll_category := CASE
        WHEN destination = 'fg' THEN 'Finished Goods (FG)'
        ELSE 'Semi-Finished Goods (SFG)'
      END;
      roll_status := CASE
        WHEN destination = 'fg' THEN 'In Stock (Ready for Dispatch)'
        ELSE 'In Stock (SFG)'
      END;
      child_code := NULL;
      FOR attempt IN 1..40 LOOP
        suffix := CASE WHEN destination = 'fg' THEN 'FG' ELSE 'SFG' END
          || '-SLT-' || regexp_replace(upper(job_code), '[^A-Z0-9]', '', 'g')
          || '-R' || lpad((line_no + attempt - 1)::text, 2, '0');
        IF attempt > 1 THEN
          suffix := suffix || '-' || right(regexp_replace(conv_id, '[^A-Za-z0-9]', '', 'g'), 4);
        END IF;
        IF suffix !~* '-BAL$' AND NOT EXISTS (
          SELECT 1 FROM public.inventory_rolls WHERE lower(btrim(barcode_id)) = lower(suffix)
        ) THEN
          child_code := suffix;
          EXIT;
        END IF;
      END LOOP;
      IF child_code IS NULL THEN
        RAISE EXCEPTION 'Could not allocate an SFG barcode' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_name, category, job_name, order_id, job_code, client_name,
        micron, width_mm, film_type, net_weight_kg, available_weight_kg, gross_weight_kg, tare_weight_kg,
        status, qc_status, location_bay, inward_datetime, length_meters, sfg_type, fg_type,
        input_barcode_ids, metadata
      ) VALUES (
        child_code, roll_type,
        stage_type || ' - ' || job_name || ' (Roll #' || line_no || ')',
        roll_category, job_name, order_id, job_code, client_name,
        micron, out_width, film, net_kg, net_kg, COALESCE(gross_kg, net_kg), COALESCE(tare_kg, 0),
        roll_status, 'Approved',
        CASE WHEN destination = 'fg' THEN 'FG Warehouse' ELSE 'Bay A' END,
        pg_catalog.now(), out_metres,
        CASE WHEN destination = 'sfg' THEN stage_type ELSE NULL END,
        CASE WHEN destination = 'fg' THEN stage_type ELSE NULL END,
        (SELECT jsonb_agg(p ->> 'barcode') FROM jsonb_array_elements(parents) AS p),
        jsonb_build_object(
          'directSlitting', true,
          'conversionId', conv_id,
          'parentBarcodeId', parents -> 0 ->> 'barcode',
          'parentSfgBatchCode', batch_code,
          'lane', lane,
          'purchaseRatePerKg', rate,
          'unitPrice', rate
        )
      );
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, order_id,
        job_name, job_code, qty_kg, consumed_kg, applied_stock_kg, qty_source,
        film_type, micron, width_mm, item_name, purchase_rate, occurred_at
      ) VALUES (
        'conv-receipt:' || conv_id || ':' || lower(child_code),
        'conversion_receipt', 'conv:' || conv_id, 'Direct Slitting', child_code, lower(child_code),
        parents -> 0 ->> 'barcode', order_id, job_name, job_code, net_kg, 0, 0, 'direct_slitting',
        film, micron, out_width, stage_type || ' - ' || job_name, rate, pg_catalog.now()
      );
      INSERT INTO public.roll_conversion_outputs (
        id, conversion_id, line_no, destination, barcode, order_id, sfg_batch_code,
        width_mm, length_meters, net_kg, gross_kg, tare_kg, lane_no, item_created, purchase_rate
      ) VALUES (
        'out:' || conv_id || ':' || line_no, conv_id, line_no, destination, child_code, order_id,
        batch_code, out_width, out_metres, net_kg, gross_kg, tare_kg, lane, false, rate
      );
    END IF;
  END LOOP;

  FOR item_key IN SELECT jsonb_object_keys(deduct)
  LOOP
    PERFORM private.direct_slit_move_stock(item_key, - (deduct ->> item_key)::numeric);
  END LOOP;
  FOR item_key IN SELECT jsonb_object_keys(receipt)
  LOOP
    PERFORM private.direct_slit_move_stock(item_key, (receipt ->> item_key)::numeric);
  END LOOP;

  rate := blend;
  IF trim_kg > 0 AND to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    scrap_id := 'direct-slit:' || conv_id || ':trim';
    INSERT INTO public.sfg_scrap_items (id, payload)
    VALUES (scrap_id, jsonb_build_object(
      'id', scrap_id,
      'stage', 'Direct Slitting',
      'type', 'Trim / Edge Scrap',
      'defectCategory', 'Trim / Edge Scrap',
      'source', 'direct-slitting',
      'scrapQtyKg', trim_kg,
      'orderId', header_order,
      'filmType', film,
      'micron', micron,
      'widthMm', width_mm,
      'ratePerKg', rate,
      'valueRs', round(trim_kg * rate, 2),
      'conversionId', conv_id,
      'sourceRollBarcode', parents -> 0 ->> 'barcode',
      'scrapReason', 'Direct Slitting / Trim / Edge Scrap',
      'scrappedBy', actor,
      'date', to_char((pg_catalog.now())::date, 'YYYY-MM-DD'),
      'timestamp', pg_catalog.now()
    ));
  END IF;
  IF setting_kg > 0 AND to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    scrap_id := 'direct-slit:' || conv_id || ':setting';
    INSERT INTO public.sfg_scrap_items (id, payload)
    VALUES (scrap_id, jsonb_build_object(
      'id', scrap_id,
      'stage', 'Direct Slitting',
      'type', 'Core / Setting Wastage',
      'defectCategory', 'Core / Setting Wastage',
      'source', 'direct-slitting',
      'scrapQtyKg', setting_kg,
      'orderId', header_order,
      'filmType', film,
      'micron', micron,
      'widthMm', width_mm,
      'ratePerKg', rate,
      'valueRs', round(setting_kg * rate, 2),
      'conversionId', conv_id,
      'sourceRollBarcode', parents -> 0 ->> 'barcode',
      'scrapReason', 'Direct Slitting / Core / Setting Wastage',
      'scrappedBy', actor,
      'date', to_char((pg_catalog.now())::date, 'YYYY-MM-DD'),
      'timestamp', pg_catalog.now()
    ));
  END IF;

  SELECT jsonb_build_object(
    'id', conv_id,
    'purchaseRate', blend,
    'varianceKg', variance,
    'metresPct', metres_pct,
    'metresStatus', metres_status,
    'override', override,
    'warnings', warnings,
    'consumedKg', consumed_sum,
    'outputKg', output_sum,
    'balanceKg', balance_sum,
    'trimScrapKg', trim_kg,
    'settingScrapKg', setting_kg,
    'parents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'barcode', row.barcode,
        'balanceBarcode', row.balance_barcode,
        'balanceKg', row.balance_kg,
        'consumedKg', row.consumed_kg,
        'stockItemId', row.stock_item_id,
        'purchaseRate', row.purchase_rate
      ) ORDER BY row.barcode)
      FROM public.roll_conversion_parents AS row
      WHERE row.conversion_id = conv_id
    ), '[]'::jsonb),
    'outputs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'barcode', row.barcode,
        'destination', row.destination,
        'stockItemId', row.stock_item_id,
        'orderId', row.order_id,
        'sfgBatchCode', row.sfg_batch_code,
        'widthMm', row.width_mm,
        'lengthMeters', row.length_meters,
        'netKg', row.net_kg,
        'itemCreated', row.item_created,
        'lane', row.lane_no,
        'purchaseRate', row.purchase_rate
      ) ORDER BY row.line_no)
      FROM public.roll_conversion_outputs AS row
      WHERE row.conversion_id = conv_id
    ), '[]'::jsonb)
  ) INTO summary;

  UPDATE public.roll_conversions AS saved
  SET result = summary,
      purchase_rate = blend
  WHERE saved.id = conv_id;
  RETURN summary;
END;
$$;


REVOKE ALL ON FUNCTION private.direct_slit_roll_rate(jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_blend_rate(jsonb) FROM PUBLIC, anon, authenticated;
