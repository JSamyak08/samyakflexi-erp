-- Soft-delete an inward QC inspection. Admin only.
--
-- public.grns.status is free text. There is no status enum and no check
-- constraint, so the value 'Deleted' does not need a constraint change.
-- The new columns are nullable and additive. No existing row is updated.
--
-- One inspection covers the whole receipt. grn_line_items has weights and
-- roll JSON, not a QC status, and the lab approves or rejects the header.
-- Deleting the inspection therefore marks the whole GRN Deleted. Lines stay
-- on the receipt so the history page can still open them.
--
-- The function does not insert inventory, rolls, barcodes, or item-ledger
-- rows. Pending, hold, and rejected rolls that were staged at inward are
-- voided with zero available weight so they cannot be posted later. A
-- receipt that is already QC-approved, or that already has a roll in stock,
-- is rejected and left unchanged.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.grn_is_qc_approved(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_status, '')) LIKE '%approved%';
$$;

CREATE OR REPLACE FUNCTION private.grn_is_deleted(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_status, '')) LIKE '%delet%';
$$;

CREATE OR REPLACE FUNCTION private.normalize_invoice_no(p_invoice text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_invoice, '')), '[\s_-]+', '', 'g'));
$$;

-- A roll already handed to the store. Pending QC, hold, and rejected rolls
-- are not posted stock.
CREATE OR REPLACE FUNCTION private.grn_roll_is_posted(p_status text, p_qc text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    lower(coalesce(p_status, '')) LIKE '%in stock%'
    OR (
      lower(coalesce(p_qc, '')) LIKE '%approved%'
      AND lower(coalesce(p_qc, '')) NOT LIKE '%pending%'
      AND lower(coalesce(p_status, '')) NOT LIKE '%pending%'
      AND lower(coalesce(p_status, '')) NOT LIKE '%hold%'
      AND lower(coalesce(p_status, '')) NOT LIKE '%reject%'
      AND lower(coalesce(p_status, '')) NOT LIKE '%void%'
      AND lower(coalesce(p_status, '')) NOT LIKE '%delet%'
    );
$$;

CREATE OR REPLACE FUNCTION private.grn_patch_deleted_item_name(
  p_item_name text,
  p_deleted_by text,
  p_deleted_at timestamptz,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw text := coalesce(p_item_name, '');
  marker integer;
  display_name text;
  payload text;
  parsed jsonb;
BEGIN
  marker := position('|||' IN raw);
  IF marker = 0 THEN
    display_name := btrim(raw);
    parsed := '{}'::jsonb;
  ELSE
    display_name := btrim(substring(raw FROM 1 FOR marker - 1));
    payload := btrim(substring(raw FROM marker + 3));
    BEGIN
      parsed := payload::jsonb;
    EXCEPTION WHEN others THEN
      parsed := '{}'::jsonb;
    END;
    IF parsed IS NULL OR jsonb_typeof(parsed) <> 'object' THEN
      parsed := '{}'::jsonb;
    END IF;
  END IF;

  parsed := parsed || jsonb_build_object(
    'status', 'Deleted',
    'qcStatus', 'Deleted',
    'deletedBy', coalesce(p_deleted_by, ''),
    'deletedAt', coalesce(to_char(p_deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
    'deleteReason', coalesce(p_reason, '')
  );

  RETURN display_name || ' ||| ' || parsed::text;
END;
$$;

ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS delete_reason text;

COMMENT ON COLUMN public.grns.deleted_by IS
  'Person who soft-deleted the inward QC inspection. Set only by delete_inward_qc_inspection.';
COMMENT ON COLUMN public.grns.deleted_at IS
  'When the inward QC inspection was soft-deleted.';
COMMENT ON COLUMN public.grns.delete_reason IS
  'Why the inward QC inspection was removed. The GRN stays on the history page.';

-- A deleted receipt cannot be edited back into the QC queue or approved.
CREATE OR REPLACE FUNCTION private.block_qc_approved_grn_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.grn_is_deleted(OLD.status) THEN
    RAISE EXCEPTION 'GRN % is deleted and cannot be approved or edited. Stock is not changed.', COALESCE(OLD.grn_number, OLD.id)
      USING ERRCODE = 'check_violation';
  END IF;
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
  IF private.grn_is_deleted(v_parent) THEN
    RAISE EXCEPTION 'GRN line is locked because receipt % is deleted', v_grn_id
      USING ERRCODE = 'check_violation';
  END IF;
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

-- Same save as 20261030200100, plus a deleted receipt cannot be rewritten
-- and does not keep its invoice number reserved.
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

CREATE OR REPLACE FUNCTION public.delete_inward_qc_inspection(
  p_grn_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text := btrim(coalesce(p_grn_id, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_uid uuid := auth.uid();
  v_id text;
  v_number text;
  v_status text;
  v_item_name text;
  v_name text;
  v_role text;
  v_at timestamptz := pg_catalog.now();
  v_meta text;
  v_voided jsonb := '[]'::jsonb;
  v_line_count integer := 0;
  v_audit_id text;
  v_posted boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Only an Admin can delete an inward QC inspection'
      USING ERRCODE = '42501';
  END IF;

  IF to_regprocedure('private.has_role(text[])') IS NULL
     OR NOT private.has_role(ARRAY['Admin']::text[]) THEN
    RAISE EXCEPTION 'Only an Admin can delete an inward QC inspection'
      USING ERRCODE = '42501';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'GRN was not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT header.id
    INTO v_id
  FROM public.grns AS header
  WHERE header.id = v_key OR header.grn_number = v_key
  ORDER BY (header.id = v_key) DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'GRN was not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flexierp-grn-delete'), hashtext(v_id));

  SELECT grn_number, status, item_name
    INTO v_number, v_status, v_item_name
  FROM public.grns
  WHERE id = v_id
  FOR UPDATE;

  SELECT
    coalesce(nullif(btrim(dir.full_name), ''), nullif(btrim(dir.username), ''), 'Admin'),
    coalesce(dir.role, 'Admin')
  INTO v_name, v_role
  FROM public.users AS dir
  WHERE dir.auth_user_id = v_uid
     OR (dir.auth_user_id IS NULL AND dir.id = v_uid::text)
  ORDER BY (dir.auth_user_id = v_uid) DESC
  LIMIT 1;

  IF v_name IS NULL THEN
    v_name := 'Admin';
    v_role := 'Admin';
  END IF;

  IF private.grn_is_deleted(v_status) THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', v_id,
      'grnNo', v_number,
      'status', 'Deleted',
      'qcStatus', 'Deleted',
      'deletedBy', v_name,
      'deletedAt', (SELECT deleted_at FROM public.grns WHERE id = v_id),
      'deleteReason', (SELECT delete_reason FROM public.grns WHERE id = v_id),
      'alreadyDeleted', true,
      'inventoryPosted', false,
      'voidedBarcodes', '[]'::jsonb,
      'lineCount', 0
    );
  END IF;

  IF length(v_reason) = 0 THEN
    RAISE EXCEPTION 'Deletion needs a reason.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'Deletion reason is too long.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF private.grn_is_qc_approved(v_status) THEN
    v_posted := true;
  END IF;

  IF position('|||' IN coalesce(v_item_name, '')) > 0 THEN
    BEGIN
      IF private.grn_is_qc_approved(
           (btrim(substring(v_item_name FROM position('|||' IN v_item_name) + 3)))::jsonb ->> 'status'
         )
         OR private.grn_is_qc_approved(
           (btrim(substring(v_item_name FROM position('|||' IN v_item_name) + 3)))::jsonb ->> 'qcStatus'
         ) THEN
        v_posted := true;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.inventory_rolls') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.inventory_rolls AS roll
    WHERE (
        roll.grn_id = v_id
        OR roll.grn_id = v_number
        OR coalesce(roll.metadata ->> 'grnNo', '') IN (v_id, v_number)
        OR roll.barcode_id IN (
          SELECT btrim(elem ->> 'barcodeId')
          FROM public.grn_line_items AS line
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
            CASE WHEN jsonb_typeof(line.rolls) = 'array' THEN line.rolls ELSE '[]'::jsonb END
          ) AS elem
          WHERE line.grn_id = v_id
            AND NULLIF(btrim(elem ->> 'barcodeId'), '') IS NOT NULL
        )
      )
      AND private.grn_roll_is_posted(roll.status, roll.qc_status)
  ) THEN
    v_posted := true;
  END IF;

  IF v_posted THEN
    RAISE EXCEPTION 'This GRN was already QC-approved and posted to inventory. It cannot be deleted, and stock is not reversed.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_meta := private.grn_patch_deleted_item_name(v_item_name, v_name, v_at, v_reason);

  UPDATE public.grns
  SET
    status = 'Deleted',
    item_name = v_meta,
    deleted_by = v_name,
    deleted_at = v_at,
    delete_reason = v_reason
  WHERE id = v_id;

  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    WITH line_codes AS (
      SELECT btrim(elem ->> 'barcodeId') AS barcode_id
      FROM public.grn_line_items AS line
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN jsonb_typeof(line.rolls) = 'array' THEN line.rolls ELSE '[]'::jsonb END
      ) AS elem
      WHERE to_regclass('public.grn_line_items') IS NOT NULL
        AND line.grn_id = v_id
        AND NULLIF(btrim(elem ->> 'barcodeId'), '') IS NOT NULL
    ),
    linked AS (
      SELECT roll.barcode_id
      FROM public.inventory_rolls AS roll
      WHERE roll.grn_id = v_id
         OR roll.grn_id = v_number
         OR coalesce(roll.metadata ->> 'grnNo', '') IN (v_id, v_number)
         OR roll.barcode_id IN (SELECT line_codes.barcode_id FROM line_codes)
    ),
    voided AS (
      UPDATE public.inventory_rolls AS roll
      SET
        status = 'Void',
        qc_status = 'Void',
        available_weight_kg = 0
      FROM linked
      WHERE roll.barcode_id = linked.barcode_id
        AND NOT private.grn_roll_is_posted(roll.status, roll.qc_status)
      RETURNING roll.barcode_id
    )
    SELECT coalesce(jsonb_agg(DISTINCT barcode_id ORDER BY barcode_id), '[]'::jsonb)
      INTO v_voided
    FROM voided;
  END IF;

  IF to_regclass('public.grn_line_items') IS NOT NULL THEN
    SELECT count(*)::integer INTO v_line_count
    FROM public.grn_line_items
    WHERE grn_id = v_id;
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    v_audit_id := 'LOG-' || to_char(v_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS')
      || '-' || substr(pg_catalog.md5(v_uid::text || v_id || pg_catalog.random()::text), 1, 8);
    INSERT INTO public.audit_logs (
      id, username, user_role, action_type, module, details, target_id, created_at, actor_id
    ) VALUES (
      v_audit_id,
      left(v_name, 120),
      left(coalesce(v_role, 'Admin'), 80),
      'DELETE',
      'QC Approval',
      left(
        'Deleted inward QC inspection for GRN ' || coalesce(v_number, v_id)
        || '. Reason: ' || v_reason
        || '. The receipt stays on the inward history and was not posted to inventory.',
        4000
      ),
      left(coalesce(v_number, v_id), 200),
      v_at,
      v_uid
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_id,
    'grnNo', v_number,
    'status', 'Deleted',
    'qcStatus', 'Deleted',
    'deletedBy', v_name,
    'deletedAt', v_at,
    'deleteReason', v_reason,
    'alreadyDeleted', false,
    'inventoryPosted', false,
    'voidedBarcodes', coalesce(v_voided, '[]'::jsonb),
    'lineCount', coalesce(v_line_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.grn_is_qc_approved(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grn_is_deleted(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.normalize_invoice_no(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grn_roll_is_posted(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grn_patch_deleted_item_name(text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.block_qc_approved_grn_header() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.block_qc_approved_grn_line() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_inward_qc_inspection(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.delete_inward_qc_inspection(text, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.grn_is_qc_approved(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.grn_is_deleted(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.normalize_invoice_no(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.grn_roll_is_posted(text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_header() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_line() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.delete_inward_qc_inspection(text, text) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION private.grn_is_qc_approved(text) TO service_role;
    GRANT EXECUTE ON FUNCTION private.grn_is_deleted(text) TO service_role;
    GRANT EXECUTE ON FUNCTION private.normalize_invoice_no(text) TO service_role;
    GRANT EXECUTE ON FUNCTION private.grn_roll_is_posted(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION private.grn_patch_deleted_item_name(text, text, timestamptz, text) TO service_role;
    GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_header() TO service_role;
    GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_line() TO service_role;
    GRANT EXECUTE ON FUNCTION public.delete_inward_qc_inspection(text, text) TO service_role;
  END IF;
END $$;

COMMENT ON FUNCTION public.delete_inward_qc_inspection(text, text) IS
  'Admin soft-deletes one inward QC inspection and its whole GRN. Pending rolls are voided. Approved stock is not reversed.';
