-- Save one goods receipt and its item lines in a single transaction.
-- Safe to run more than once. Existing receipt rows are not rewritten.
-- A receipt number is taken from allocate_pellet_grn_number when the caller
-- does not already have one. The same invoice for the same supplier cannot
-- be saved as a second receipt.

CREATE OR REPLACE FUNCTION public.save_grn_with_lines(p_grn jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_grn text;
  v_prefix text;
  v_invoice text;
  v_vendor_name text;
  v_vendor_id text;
  v_date date;
  v_qty numeric;
  v_item_name text;
  v_status text;
  v_line_count integer;
BEGIN
  IF p_grn IS NULL OR jsonb_typeof(p_grn) <> 'object' THEN
    RAISE EXCEPTION 'GRN details are missing';
  END IF;
  IF p_grn->'lineItems' IS NULL OR jsonb_typeof(p_grn->'lineItems') <> 'array' OR jsonb_array_length(p_grn->'lineItems') < 1 THEN
    RAISE EXCEPTION 'A goods receipt needs at least one item';
  END IF;

  v_invoice := btrim(COALESCE(p_grn->>'invoiceNo', p_grn->>'invoice_number', ''));
  v_vendor_name := btrim(COALESCE(p_grn->>'vendorName', ''));
  v_prefix := NULLIF(btrim(COALESCE(p_grn->>'grnPrefix', '')), '');
  v_grn := NULLIF(btrim(COALESCE(p_grn->>'grnNo', p_grn->>'grn_number', '')), '');
  v_id := NULLIF(btrim(COALESCE(p_grn->>'id', '')), '');
  v_item_name := COALESCE(p_grn->>'itemName', '');
  v_status := COALESCE(NULLIF(btrim(COALESCE(p_grn->>'status', '')), ''), 'Pending QC Approval');
  v_qty := COALESCE(public._grn_to_numeric(p_grn->>'receivedQtyKg'), 0);

  BEGIN
    v_date := NULLIF(btrim(COALESCE(p_grn->>'receivedDate', '')), '')::date;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      v_date := CURRENT_DATE;
  END;
  IF v_date IS NULL THEN
    v_date := CURRENT_DATE;
  END IF;

  IF v_grn IS NULL THEN
    v_grn := public.allocate_pellet_grn_number(COALESCE(v_prefix, 'SIL/GRN/26-27/'));
  END IF;
  IF v_id IS NULL THEN
    v_id := v_grn;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flexierp-grn-save'), hashtext(v_grn));

  IF EXISTS (
    SELECT 1 FROM public.grns
    WHERE grn_number = v_grn AND id <> v_id
  ) THEN
    RAISE EXCEPTION 'GRN number % is already in use', v_grn;
  END IF;

  v_vendor_id := NULL;
  SELECT vendors.id INTO v_vendor_id
  FROM public.vendors
  WHERE vendors.id = NULLIF(btrim(COALESCE(p_grn->>'vendorId', '')), '')
  LIMIT 1;
  IF v_vendor_id IS NULL AND v_vendor_name <> '' THEN
    SELECT vendors.id INTO v_vendor_id
    FROM public.vendors
    WHERE lower(vendors.name) = lower(v_vendor_name)
    LIMIT 1;
  END IF;

  IF v_invoice <> '' AND EXISTS (
    SELECT 1
    FROM public.grns AS existing
    WHERE existing.invoice_number = v_invoice
      AND existing.id <> v_id
      AND (
        (v_vendor_id IS NOT NULL AND existing.vendor_id = v_vendor_id)
        OR (
          v_vendor_name <> ''
          AND lower(btrim(COALESCE(
            public._grn_unpack_item_name(existing.item_name)->'meta'->>'vendorName',
            ''
          ))) = lower(v_vendor_name)
        )
        OR (v_vendor_id IS NULL AND v_vendor_name = '')
      )
  ) THEN
    RAISE EXCEPTION 'Duplicate Inward GRN: invoice % is already on another GRN for this supplier', v_invoice;
  END IF;

  INSERT INTO public.grns (
    id, grn_number, vendor_id, po_number, invoice_number, received_date,
    item_name, received_qty_kg, status, qc_remarks, metallocene_pct,
    stock_item_id, master_item_id
  ) VALUES (
    v_id,
    v_grn,
    v_vendor_id,
    COALESCE(p_grn->>'poNumber', ''),
    v_invoice,
    v_date,
    v_item_name,
    v_qty,
    v_status,
    COALESCE(p_grn->>'qcRemarks', p_grn->>'qcNotes', ''),
    NULLIF(p_grn->>'metallocenePct', ''),
    NULLIF(p_grn->>'stockItemId', ''),
    NULLIF(p_grn->>'masterItemId', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    grn_number = EXCLUDED.grn_number,
    vendor_id = EXCLUDED.vendor_id,
    po_number = EXCLUDED.po_number,
    invoice_number = EXCLUDED.invoice_number,
    received_date = EXCLUDED.received_date,
    item_name = EXCLUDED.item_name,
    received_qty_kg = EXCLUDED.received_qty_kg,
    status = EXCLUDED.status,
    qc_remarks = EXCLUDED.qc_remarks,
    metallocene_pct = EXCLUDED.metallocene_pct,
    stock_item_id = EXCLUDED.stock_item_id,
    master_item_id = EXCLUDED.master_item_id;

  DELETE FROM public.grn_line_items WHERE grn_id = v_id;

  INSERT INTO public.grn_line_items (
    id, grn_id, line_no, po_line_id, category, item_name, film_type, micron,
    width_mm, metallocene_pct, unit, stock_item_id, master_item_id, purchase_rate,
    batch_no, packaging_type, rolls_received, gross_weight_kg, tare_weight_kg,
    net_weight_kg, invoice_qty_kg, remarks, rolls
  )
  SELECT
    COALESCE(NULLIF(btrim(line->>'id'), ''), v_id || '-L' || listed.line_no::text),
    v_id,
    listed.line_no,
    NULLIF(line->>'poLineId', ''),
    COALESCE(NULLIF(line->>'category', ''), 'Film Substrates'),
    COALESCE(NULLIF(line->>'itemName', ''), 'Item'),
    NULLIF(line->>'filmType', ''),
    public._grn_to_numeric(line->>'micron'),
    public._grn_to_numeric(line->>'widthMm'),
    NULLIF(line->>'metallocenePct', ''),
    COALESCE(NULLIF(line->>'unit', ''), 'Kg'),
    NULLIF(line->>'stockItemId', ''),
    NULLIF(line->>'masterItemId', ''),
    COALESCE(public._grn_to_numeric(line->>'purchaseRate'), 0),
    COALESCE(line->>'batchNo', ''),
    COALESCE(NULLIF(line->>'packagingType', ''), 'Roll'),
    COALESCE(
      public._grn_to_numeric(line->>'rollsReceived')::integer,
      CASE WHEN jsonb_typeof(line->'rolls') = 'array' THEN jsonb_array_length(line->'rolls') ELSE 0 END
    ),
    COALESCE(public._grn_to_numeric(line->>'grossWeightKg'), 0),
    COALESCE(public._grn_to_numeric(line->>'tareWeightKg'), 0),
    COALESCE(public._grn_to_numeric(line->>'netWeightKg'), 0),
    public._grn_to_numeric(line->>'invoiceQtyKg'),
    COALESCE(line->>'remarks', ''),
    CASE
      WHEN jsonb_typeof(line->'rolls') = 'array' THEN line->'rolls'
      ELSE '[]'::jsonb
    END
  FROM (
    SELECT
      line,
      COALESCE(public._grn_to_numeric(line->>'lineNo')::integer, ordinality::integer) AS line_no
    FROM jsonb_array_elements(p_grn->'lineItems') WITH ORDINALITY AS listed(line, ordinality)
  ) AS listed;

  UPDATE public.inventory_rolls AS roll
  SET
    grn_id = v_id,
    grn_line_item_id = NULLIF(link.link->>'grnLineItemId', ''),
    line_no = CASE
      WHEN COALESCE(link.link->>'lineNo', '') ~ '^[0-9]+$' THEN (link.link->>'lineNo')::integer
      ELSE roll.line_no
    END,
    vendor_roll_no = COALESCE(NULLIF(link.link->>'vendorRollNo', ''), roll.vendor_roll_no),
    unit_no = CASE
      WHEN COALESCE(link.link->>'unitNo', '') ~ '^[0-9]+$' THEN (link.link->>'unitNo')::integer
      ELSE roll.unit_no
    END
  FROM (
    SELECT elem AS link
    FROM jsonb_array_elements(COALESCE(p_grn->'rolls', '[]'::jsonb)) AS elem
    WHERE NULLIF(elem->>'barcodeId', '') IS NOT NULL
  ) AS link
  WHERE roll.barcode_id = link.link->>'barcodeId';

  SELECT count(*) INTO v_line_count FROM public.grn_line_items WHERE grn_id = v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'grnNo', v_grn,
    'grn_number', v_grn,
    'lineCount', v_line_count,
    'receivedQtyKg', v_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_grn_with_lines(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_grn_with_lines(jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_grn_with_lines(jsonb) TO authenticated';
  END IF;
END $$;

-- Pellet fuel still saves its one companion receipt, and now also writes
-- that receipt's single line when grn_line_items exists.
CREATE OR REPLACE FUNCTION public.save_pellet_inward_with_grn(p_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  pellet jsonb := COALESCE(p_record, '{}'::jsonb) - 'companionGrn';
  grn jsonb := p_record -> 'companionGrn';
  v_id text;
  v_grn text;
  v_prefix text;
  v_date date;
  v_qty numeric;
  v_rate numeric;
  v_total numeric;
  v_vehicle text;
  v_invoice text;
  v_vendor_id text;
  v_item_name text;
  v_stock_item text;
  v_status text;
  v_received numeric;
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'Pellet inward record is missing';
  END IF;
  IF grn IS NULL OR jsonb_typeof(grn) <> 'object' THEN
    RAISE EXCEPTION 'Pellet GRN details are missing';
  END IF;

  v_id := NULLIF(btrim(COALESCE(pellet ->> 'id', '')), '');
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Pellet inward id is missing';
  END IF;

  v_stock_item := NULLIF(btrim(COALESCE(grn ->> 'stockItemId', '')), '');
  v_item_name := NULLIF(btrim(COALESCE(grn ->> 'itemName', '')), '');
  IF v_stock_item IS NULL OR v_item_name IS NULL THEN
    RAISE EXCEPTION 'A pellet fuel inventory item is required';
  END IF;

  IF NULLIF(btrim(COALESCE(pellet ->> 'vendorId', '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(pellet ->> 'vendorName', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Pellet supplier is required';
  END IF;

  IF NULLIF(btrim(COALESCE(pellet ->> 'storageLocation', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Storage location is required';
  END IF;

  IF NULLIF(btrim(COALESCE(pellet ->> 'receivedBy', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Receiver name is required';
  END IF;

  BEGIN
    v_date := NULLIF(btrim(COALESCE(pellet ->> 'inwardDate', '')), '')::date;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Inward date is not a valid date';
  END;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Inward date is required';
  END IF;

  v_qty := COALESCE(NULLIF(pellet ->> 'inwardQtyKg', '')::numeric, 0);
  v_rate := COALESCE(NULLIF(pellet ->> 'unitCostPerKg', '')::numeric, 0);
  IF v_qty <= 0 OR v_rate <= 0 THEN
    RAISE EXCEPTION 'Inward quantity and rate must be greater than zero';
  END IF;
  v_total := ROUND(v_qty * v_rate, 2);
  v_vehicle := NULLIF(btrim(COALESCE(pellet ->> 'vehicleNo', '')), '');
  v_invoice := btrim(COALESCE(pellet ->> 'invoiceNo', grn ->> 'invoiceNo', ''));
  v_status := COALESCE(NULLIF(btrim(COALESCE(grn ->> 'status', pellet ->> 'status', '')), ''), 'Pending QC');
  v_received := COALESCE(NULLIF(grn ->> 'receivedQtyKg', '')::numeric, v_qty);
  v_grn := NULLIF(btrim(COALESCE(pellet ->> 'grnNo', grn ->> 'grnNo', '')), '');
  v_prefix := NULLIF(btrim(COALESCE(pellet ->> 'grnPrefix', '')), '');

  IF v_grn IS NULL THEN
    v_grn := public.allocate_pellet_grn_number(COALESCE(v_prefix, 'SIL/GRN/26-27/'));
  END IF;

  -- Hold this number until the pellet row and the GRN row both commit,
  -- so two saves cannot pass the "already in use" check together.
  PERFORM pg_advisory_xact_lock(hashtext('flexierp-pellet-grn-save'), hashtext(v_grn));

  IF EXISTS (
    SELECT 1 FROM public.grns
    WHERE grn_number = v_grn AND id <> v_id
  ) OR EXISTS (
    SELECT 1 FROM public.pellet_inwards
    WHERE grn_no = v_grn AND id <> v_id
  ) THEN
    RAISE EXCEPTION 'GRN number % is already in use. Reserve a new number and save again.', v_grn;
  END IF;

  IF v_invoice <> '' AND EXISTS (
    SELECT 1 FROM public.grns
    WHERE invoice_number = v_invoice AND id <> v_id
  ) THEN
    RAISE EXCEPTION 'Duplicate Inward GRN: invoice % is already on another GRN', v_invoice;
  END IF;

  v_vendor_id := NULL;
  SELECT vendors.id INTO v_vendor_id
  FROM public.vendors
  WHERE vendors.id = NULLIF(btrim(COALESCE(pellet ->> 'vendorId', grn ->> 'vendorId', '')), '')
  LIMIT 1;
  IF v_vendor_id IS NULL THEN
    SELECT vendors.id INTO v_vendor_id
    FROM public.vendors
    WHERE lower(vendors.name) = lower(btrim(COALESCE(pellet ->> 'vendorName', '')))
    LIMIT 1;
  END IF;

  pellet := pellet || jsonb_build_object(
    'id', v_id,
    'grnNo', v_grn,
    'inwardQtyKg', v_qty,
    'unitCostPerKg', v_rate,
    'totalAmount', v_total,
    'vehicleNo', COALESCE(v_vehicle, '')
  );

  INSERT INTO public.pellet_inwards (
    id, grn_no, inward_date, inward_qty_kg, unit_cost_per_kg, total_amount,
    vehicle_no, payload, updated_at
  ) VALUES (
    v_id, v_grn, v_date, v_qty, v_rate, v_total,
    v_vehicle, pellet, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    grn_no = EXCLUDED.grn_no,
    inward_date = EXCLUDED.inward_date,
    inward_qty_kg = EXCLUDED.inward_qty_kg,
    unit_cost_per_kg = EXCLUDED.unit_cost_per_kg,
    total_amount = EXCLUDED.total_amount,
    vehicle_no = EXCLUDED.vehicle_no,
    payload = EXCLUDED.payload,
    updated_at = now();

  INSERT INTO public.grns (
    id, grn_number, vendor_id, po_number, invoice_number, received_date,
    item_name, received_qty_kg, status, qc_remarks, stock_item_id
  ) VALUES (
    v_id,
    v_grn,
    v_vendor_id,
    COALESCE(grn ->> 'poNumber', ''),
    v_invoice,
    v_date,
    v_item_name,
    v_received,
    v_status,
    COALESCE(grn ->> 'qcNotes', ''),
    v_stock_item
  )
  ON CONFLICT (id) DO UPDATE SET
    grn_number = EXCLUDED.grn_number,
    vendor_id = EXCLUDED.vendor_id,
    po_number = EXCLUDED.po_number,
    invoice_number = EXCLUDED.invoice_number,
    received_date = EXCLUDED.received_date,
    item_name = EXCLUDED.item_name,
    received_qty_kg = EXCLUDED.received_qty_kg,
    status = EXCLUDED.status,
    qc_remarks = EXCLUDED.qc_remarks,
    stock_item_id = EXCLUDED.stock_item_id;

  IF to_regclass('public.grn_line_items') IS NOT NULL THEN
    INSERT INTO public.grn_line_items (
      id, grn_id, line_no, category, item_name, unit, stock_item_id,
      purchase_rate, packaging_type, rolls_received, gross_weight_kg,
      tare_weight_kg, net_weight_kg, invoice_qty_kg, remarks, rolls
    ) VALUES (
      v_id || '-L1',
      v_id,
      1,
      'Boiler Pellets / Fuel',
      v_item_name,
      'Kg',
      v_stock_item,
      v_rate,
      'Bag',
      1,
      v_received,
      0,
      v_received,
      NULL,
      COALESCE(grn->>'qcNotes', ''),
      jsonb_build_array(jsonb_build_object(
        'unitNo', 1,
        'barcodeId', NULL,
        'grossWeightKg', v_received,
        'tareWeightKg', 0,
        'netWeightKg', v_received,
        'lengthMeters', 0,
        'vendorRollNo', '',
        'itemRemarks', ''
      ))
    )
    ON CONFLICT (id) DO UPDATE SET
      grn_id = EXCLUDED.grn_id,
      item_name = EXCLUDED.item_name,
      stock_item_id = EXCLUDED.stock_item_id,
      purchase_rate = EXCLUDED.purchase_rate,
      net_weight_kg = EXCLUDED.net_weight_kg,
      gross_weight_kg = EXCLUDED.gross_weight_kg,
      rolls = EXCLUDED.rolls,
      remarks = EXCLUDED.remarks;
  END IF;

  RETURN jsonb_build_object(
    'pellet', pellet,
    'grn', grn || jsonb_build_object('id', v_id, 'grnNo', v_grn, 'grn_number', v_grn)
  );
END;
$$;

