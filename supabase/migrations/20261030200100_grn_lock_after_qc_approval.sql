-- Lock a goods receipt once it is QC-approved.
-- Pending, QC-hold, and rejected receipts can still be edited or cancelled.
-- The first save that moves a receipt from pending to approved is allowed.
-- A later update or delete of that receipt, or of its lines, is rejected.
-- Invoice numbers match after spaces, hyphens, and underscores are removed,
-- so 2526008783_ is the same invoice as 2526008783. A cancelled receipt
-- does not keep the invoice number reserved.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.grn_is_qc_approved(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_status, '')) LIKE '%approved%';
$$;

CREATE OR REPLACE FUNCTION private.normalize_invoice_no(p_invoice text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_invoice, '')), '[\s_-]+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION private.block_qc_approved_grn_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.grn_is_qc_approved(OLD.status) THEN
    RAISE EXCEPTION 'GRN % is QC-approved and cannot be edited or deleted', COALESCE(OLD.grn_number, OLD.id)
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.block_qc_approved_grn_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grn_id text;
  v_parent text;
BEGIN
  v_grn_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.grn_id ELSE OLD.grn_id END;
  IF current_setting('flexierp.grn_line_rewrite', true) IS NOT DISTINCT FROM v_grn_id THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_parent FROM public.grns WHERE id = v_grn_id;
  IF private.grn_is_qc_approved(v_parent) THEN
    RAISE EXCEPTION 'GRN line is locked because receipt % is QC-approved', v_grn_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.grn_is_qc_approved(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.normalize_invoice_no(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.block_qc_approved_grn_header() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.block_qc_approved_grn_line() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.grn_is_qc_approved(text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.normalize_invoice_no(text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_header() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_line() TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.grn_is_qc_approved(text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.normalize_invoice_no(text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_header() TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_line() TO service_role';
  END IF;
END $$;

DROP TRIGGER IF EXISTS grns_lock_after_qc_approval ON public.grns;
CREATE TRIGGER grns_lock_after_qc_approval
  BEFORE UPDATE OR DELETE ON public.grns
  FOR EACH ROW
  EXECUTE FUNCTION private.block_qc_approved_grn_header();

DROP TRIGGER IF EXISTS grn_line_items_lock_after_qc_approval ON public.grn_line_items;
CREATE TRIGGER grn_line_items_lock_after_qc_approval
  BEFORE INSERT OR UPDATE OR DELETE ON public.grn_line_items
  FOR EACH ROW
  EXECUTE FUNCTION private.block_qc_approved_grn_line();

-- Same save as 20261024013000, plus the approval lock and normalised invoices.
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
    WHERE id = v_id AND private.grn_is_qc_approved(status)
  ) THEN
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
