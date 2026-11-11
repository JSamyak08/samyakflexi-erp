-- QC approval posts each approved line into inventory in the same transaction
-- as the receipt. A multi-line GRN is not one lump on the first item.
--
-- The previous path saved the GRN as Approved (which then locks the receipt)
-- and added kilograms afterwards in the browser. If that second write failed,
-- the lab showed Approved and the stock item never received the quantity.
-- Reject, QC hold, and a deleted inspection still post nothing usable.
--
-- postStockOnApproval is sent only by the client that stops doing its own
-- stock add. An older client omits the flag, so this function does not also
-- add kilograms on top of that client's write.
--
-- A brand-new insert that is already Approved (a rotogravure cylinder receipt)
-- is not posted here. Cylinders never wait in the QC lab.
--
-- grn_qc_stock_posts makes the add idempotent per line. Saving the same
-- approved receipt again is already rejected by the QC lock.

CREATE TABLE IF NOT EXISTS public.grn_qc_stock_posts (
  grn_line_id text PRIMARY KEY,
  grn_id text NOT NULL,
  inventory_item_id text NOT NULL,
  posted_kg numeric NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grn_qc_stock_posts IS
  'Kilograms already added to an inventory item for one approved GRN line. A second approval cannot add them again.';

ALTER TABLE public.grn_qc_stock_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grn_qc_stock_posts_authenticated ON public.grn_qc_stock_posts;
CREATE POLICY grn_qc_stock_posts_authenticated
  ON public.grn_qc_stock_posts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.grn_qc_stock_posts TO authenticated;

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
  v_existing_status text;
  v_post_stock boolean := false;
  v_decision boolean := false;
  v_approved boolean := false;
  v_stock_posted boolean := false;
  v_posts jsonb := '[]'::jsonb;
  v_line record;
  v_item text;
  v_name_hits integer;
  v_kg numeric;
  v_rate numeric;
  v_batch text;
  v_new_qty numeric;
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

  SELECT status INTO v_existing_status FROM public.grns WHERE id = v_id;
  IF private.grn_is_deleted(v_existing_status) THEN
    RAISE EXCEPTION 'GRN % is deleted and cannot be approved or edited. Stock is not changed.', v_grn
      USING ERRCODE = 'check_violation';
  END IF;
  IF private.grn_is_qc_approved(v_existing_status) THEN
    RAISE EXCEPTION 'GRN % is QC-approved and cannot be edited or cancelled', v_grn
      USING ERRCODE = 'check_violation';
  END IF;

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

  IF private.normalize_invoice_no(v_invoice) <> '' AND EXISTS (
    SELECT 1
    FROM public.grns AS existing
    WHERE existing.id <> v_id
      AND private.normalize_invoice_no(existing.invoice_number) = private.normalize_invoice_no(v_invoice)
      AND lower(coalesce(existing.status, '')) NOT LIKE '%cancel%'
      AND lower(coalesce(existing.status, '')) NOT LIKE '%delet%'
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

  -- Lets this save rewrite lines after the header has just become approved.
  PERFORM set_config('flexierp.grn_line_rewrite', v_id, true);

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

  v_post_stock := lower(btrim(coalesce(p_grn->>'postStockOnApproval', ''))) IN ('true', 't', '1');
  IF v_post_stock
     AND v_existing_status IS NOT NULL
     AND NOT private.grn_is_deleted(v_existing_status)
     AND NOT private.grn_is_qc_approved(v_existing_status)
     AND NOT private.grn_is_deleted(v_status)
  THEN
    IF private.grn_is_qc_approved(v_status) THEN
      v_decision := true;
      v_approved := true;
    ELSIF lower(v_status) LIKE '%hold%' OR lower(v_status) LIKE '%reject%' THEN
      v_decision := true;
      v_approved := false;
    END IF;
  END IF;

  IF v_decision THEN
    v_stock_posted := true;
    FOR v_line IN
      SELECT *
      FROM public.grn_line_items
      WHERE grn_id = v_id
      ORDER BY line_no, id
    LOOP
      IF coalesce(v_line.category, '') ILIKE '%cylinder%' THEN
        CONTINUE;
      END IF;

      v_kg := round(COALESCE(v_line.net_weight_kg, 0), 2);
      IF v_kg < 0 THEN
        v_kg := 0;
      END IF;
      v_rate := COALESCE(v_line.purchase_rate, 0);
      v_batch := btrim(coalesce(v_line.batch_no, ''));
      v_item := NULLIF(btrim(coalesce(v_line.stock_item_id, '')), '');
      IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory WHERE id = v_item) THEN
        v_item := NULL;
      END IF;
      IF v_item IS NULL THEN
        v_item := NULLIF(btrim(coalesce(v_line.master_item_id, '')), '');
        IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory WHERE id = v_item) THEN
          v_item := NULL;
        END IF;
      END IF;
      IF v_item IS NULL AND v_approved AND v_kg > 0 THEN
        SELECT count(*) INTO v_name_hits
        FROM public.inventory
        WHERE btrim(coalesce(v_line.item_name, '')) <> ''
          AND lower(btrim(split_part(coalesce(item_name, ''), ' ||| ', 1))) = lower(btrim(v_line.item_name));
        IF v_name_hits = 1 THEN
          SELECT id INTO v_item
          FROM public.inventory
          WHERE lower(btrim(split_part(coalesce(item_name, ''), ' ||| ', 1))) = lower(btrim(v_line.item_name))
          LIMIT 1;
        ELSIF v_name_hits > 1 THEN
          RAISE EXCEPTION 'QC approval did not post stock for % because more than one inventory item has that name. The receipt was not approved.', v_line.item_name
            USING ERRCODE = 'check_violation';
        ELSE
          RAISE EXCEPTION 'QC approval did not post stock for % because no inventory item matches it. The receipt was not approved.', v_line.item_name
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      UPDATE public.inventory_rolls AS roll
      SET
        status = CASE WHEN v_approved THEN 'In Stock' ELSE 'QC Hold' END,
        qc_status = CASE WHEN v_approved THEN 'Approved' ELSE 'Rejected' END,
        location_bay = CASE
          WHEN NOT v_approved THEN 'QC Hold Store'
          WHEN coalesce(v_line.category, '') ILIKE '%film%' THEN 'Bay A'
          ELSE 'Consumables Store'
        END,
        item_id = COALESCE(v_item, NULLIF(roll.item_id, '')),
        item_name = COALESCE(NULLIF(v_line.item_name, ''), roll.item_name),
        batch_no = COALESCE(NULLIF(v_batch, ''), roll.batch_no),
        film_type = COALESCE(NULLIF(v_line.film_type, ''), roll.film_type),
        micron = COALESCE(v_line.micron, roll.micron),
        width_mm = COALESCE(v_line.width_mm, roll.width_mm),
        net_weight_kg = COALESCE(public._grn_to_numeric(elem->>'netWeightKg'), roll.net_weight_kg),
        available_weight_kg = COALESCE(public._grn_to_numeric(elem->>'netWeightKg'), roll.available_weight_kg),
        gross_weight_kg = COALESCE(public._grn_to_numeric(elem->>'grossWeightKg'), roll.gross_weight_kg),
        tare_weight_kg = COALESCE(public._grn_to_numeric(elem->>'tareWeightKg'), roll.tare_weight_kg),
        length_meters = COALESCE(public._grn_to_numeric(elem->>'lengthMeters'), roll.length_meters)
      FROM jsonb_array_elements(COALESCE(v_line.rolls, '[]'::jsonb)) AS elem
      WHERE roll.barcode_id = NULLIF(elem->>'barcodeId', '')
        AND lower(coalesce(roll.status, '')) NOT LIKE '%void%'
        AND lower(coalesce(roll.status, '')) NOT LIKE '%delet%'
        AND lower(coalesce(roll.status, '')) NOT LIKE '%consum%'
        AND lower(coalesce(roll.status, '')) NOT LIKE '%issued%'
        AND lower(coalesce(roll.status, '')) NOT LIKE '%written%';

      IF v_approved AND v_item IS NOT NULL AND v_kg > 0 THEN
        INSERT INTO public.grn_qc_stock_posts (grn_line_id, grn_id, inventory_item_id, posted_kg)
        VALUES (v_line.id, v_id, v_item, v_kg)
        ON CONFLICT (grn_line_id) DO NOTHING;
        IF FOUND THEN
          UPDATE public.inventory
          SET
            stock_qty_kg = round(COALESCE(stock_qty_kg, 0) + v_kg, 2),
            last_batch = COALESCE(NULLIF(v_batch, ''), last_batch),
            last_vendor = COALESCE(NULLIF(v_vendor_name, ''), last_vendor),
            last_updated = now(),
            unit_price = CASE WHEN v_rate > 0 THEN v_rate ELSE unit_price END,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'availableQtyKg', round(COALESCE(stock_qty_kg, 0) + v_kg, 2),
              'lastBatch', COALESCE(NULLIF(v_batch, ''), metadata->>'lastBatch'),
              'lastVendor', COALESCE(NULLIF(v_vendor_name, ''), metadata->>'lastVendor')
            )
          WHERE id = v_item
          RETURNING stock_qty_kg INTO v_new_qty;

          v_posts := v_posts || jsonb_build_array(jsonb_build_object(
            'itemId', v_item,
            'itemName', v_line.item_name,
            'lineId', v_line.id,
            'addKg', v_kg,
            'stockQtyKg', v_new_qty,
            'batchNo', v_batch,
            'vendorName', v_vendor_name
          ));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_line_count FROM public.grn_line_items WHERE grn_id = v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'grnNo', v_grn,
    'grn_number', v_grn,
    'lineCount', v_line_count,
    'receivedQtyKg', v_qty,
    'stockPosted', v_stock_posted,
    'posts', v_posts
  );
END;
$$;

COMMENT ON FUNCTION public.save_grn_with_lines(jsonb) IS
  'Saves a GRN and its lines. When postStockOnApproval is true, a pending receipt that becomes Approved adds each line''s kilograms to its inventory item and marks those inward barcodes In Stock, in this same transaction. QC hold and rejection do not add usable stock.';

-- Read-only. Lists approved lines that have no post row and whose in-stock
-- rolls exceed the item balance by at least that line. A line whose kilograms
-- are already inside the balance is recommended at 0 kg so a repair cannot
-- double-post it. This function does not update anything.
CREATE OR REPLACE FUNCTION public.preview_unposted_qc_stock()
RETURNS TABLE (
  grn_id text,
  line_id text,
  line_no integer,
  item_id text,
  item_name text,
  line_kg numeric,
  stock_qty_kg numeric,
  usable_roll_kg numeric,
  gap_kg numeric,
  recommend_kg numeric,
  reason text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH usable AS (
    SELECT rolls.item_id, sum(rolls.available_weight_kg) AS usable_kg
    FROM public.inventory_rolls AS rolls
    WHERE lower(coalesce(rolls.status, '')) LIKE '%stock%'
      AND lower(coalesce(rolls.status, '')) NOT LIKE '%pending%'
      AND lower(coalesce(rolls.qc_status, '')) NOT LIKE '%pending%'
      AND lower(coalesce(rolls.qc_status, '')) NOT LIKE '%hold%'
      AND lower(coalesce(rolls.qc_status, '')) NOT LIKE '%reject%'
      AND lower(coalesce(rolls.status, '')) NOT LIKE '%void%'
      AND lower(coalesce(rolls.status, '')) NOT LIKE '%consum%'
      AND lower(coalesce(rolls.status, '')) NOT LIKE '%issued%'
      AND lower(coalesce(rolls.status, '')) NOT LIKE '%written%'
      AND coalesce(rolls.item_id, '') <> ''
    GROUP BY rolls.item_id
  )
  SELECT
    header.id,
    line.id,
    line.line_no,
    line.stock_item_id,
    line.item_name,
    COALESCE(line.net_weight_kg, 0),
    item.stock_qty_kg,
    COALESCE(usable.usable_kg, 0),
    round(COALESCE(usable.usable_kg, 0) - COALESCE(item.stock_qty_kg, 0), 2),
    CASE
      WHEN COALESCE(usable.usable_kg, 0) - COALESCE(item.stock_qty_kg, 0) >= COALESCE(line.net_weight_kg, 0) - 0.05
        THEN COALESCE(line.net_weight_kg, 0)
      ELSE 0
    END,
    CASE
      WHEN COALESCE(usable.usable_kg, 0) - COALESCE(item.stock_qty_kg, 0) >= COALESCE(line.net_weight_kg, 0) - 0.05
        THEN 'In-stock rolls exceed the item balance by at least this line. A reviewed repair may add it once.'
      ELSE 'Do not add. The item balance already covers this line, or the rolls are not sitting above the balance.'
    END
  FROM public.grn_line_items AS line
  JOIN public.grns AS header ON header.id = line.grn_id
  LEFT JOIN public.inventory AS item ON item.id = line.stock_item_id
  LEFT JOIN usable ON usable.item_id = line.stock_item_id
  WHERE private.grn_is_qc_approved(header.status)
    AND NOT private.grn_is_deleted(header.status)
    AND coalesce(line.category, '') NOT ILIKE '%cylinder%'
    AND NOT EXISTS (
      SELECT 1 FROM public.grn_qc_stock_posts AS posted WHERE posted.grn_line_id = line.id
    );
$$;

REVOKE ALL ON FUNCTION public.preview_unposted_qc_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_unposted_qc_stock() TO authenticated;

COMMENT ON FUNCTION public.preview_unposted_qc_stock() IS
  'Dry-run list of approved GRN lines that were never recorded in grn_qc_stock_posts. recommend_kg is 0 when adding the line would double-post. This function does not change stock.';
