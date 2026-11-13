-- A leftover -BAL roll was inserted with a synthetic item name
-- ("… Remaining Balance Roll") and without the parent roll's vendor, batch,
-- rate, GRN, size, or original net weight. The sticker, the store list, and
-- the item ledger then showed dashes.
--
-- These triggers copy that identity from the parent (and the original inward
-- roll, when the parent is itself a leftover) at insert and update.
-- The leftover's own inward_datetime is the split time. It is not replaced.
-- FIFO age still walks to the parent; this migration does not change that.
-- Existing rows are not rewritten here. See
-- supabase/manual/20261113230000_backfill_balance_roll_parent_details.sql.

ALTER TABLE public.inventory_ledger_entries
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS batch_no text,
  ADD COLUMN IF NOT EXISTS purchase_rate numeric,
  ADD COLUMN IF NOT EXISTS grn_no text,
  ADD COLUMN IF NOT EXISTS parent_net_kg numeric,
  ADD COLUMN IF NOT EXISTS parent_inward_at timestamptz;

COMMENT ON COLUMN public.inventory_ledger_entries.vendor_name IS
  'Vendor copied from the original inward roll when this row is a balance receipt.';
COMMENT ON COLUMN public.inventory_ledger_entries.batch_no IS
  'Batch or heat number copied from the original inward roll when this row is a balance receipt.';
COMMENT ON COLUMN public.inventory_ledger_entries.purchase_rate IS
  'Rate per kg copied from the original roll or its inventory item.';
COMMENT ON COLUMN public.inventory_ledger_entries.grn_no IS
  'Original inward GRN number for a balance receipt.';
COMMENT ON COLUMN public.inventory_ledger_entries.parent_net_kg IS
  'Net weight of the original inward roll, not the leftover weight.';
COMMENT ON COLUMN public.inventory_ledger_entries.parent_inward_at IS
  'Original inward time. The receipt occurred_at stays the split time.';

CREATE OR REPLACE FUNCTION private.balance_json_number(p_obj jsonb, p_key text)
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
  raw := NULLIF(pg_catalog.btrim(p_obj ->> p_key), '');
  IF raw IS NULL OR raw !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RETURN NULL;
  END IF;
  RETURN raw::numeric;
END;
$$;

REVOKE ALL ON FUNCTION private.balance_json_number(jsonb, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION private.balance_item_name_placeholder(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.btrim(p_name), '') = ''
    OR pg_catalog.btrim(split_part(p_name, ' ||| ', 1)) ~* 'remaining balance roll'
    OR pg_catalog.btrim(split_part(p_name, ' ||| ', 1)) ~* 'balance roll$';
$$;

REVOKE ALL ON FUNCTION private.balance_item_name_placeholder(text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION private.inherit_balance_roll_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent public.inventory_rolls%ROWTYPE;
  walked public.inventory_rolls%ROWTYPE;
  root public.inventory_rolls%ROWTYPE;
  cursor_code text;
  next_code text;
  steps integer := 0;
  real_name text;
  stock_name text;
  stock_vendor text;
  stock_batch text;
  stock_rate numeric;
  copied_rate numeric;
  root_grn text;
  meta jsonb;
  existing_rate numeric;
BEGIN
  IF NEW.barcode_id IS NULL OR NEW.barcode_id !~* '-BAL$' THEN
    RETURN NEW;
  END IF;

  -- The leftover's own inward time is the moment it was split. FIFO reads the
  -- parent for age. Do not copy inward_datetime or production_date.
  cursor_code := NULLIF(pg_catalog.btrim(COALESCE(NEW.metadata ->> 'parentBarcodeId', NEW.metadata ->> 'parentBarcode', '')), '');
  IF cursor_code IS NULL OR cursor_code ~* '-BAL$' AND lower(cursor_code) = lower(NEW.barcode_id) THEN
    cursor_code := pg_catalog.regexp_replace(NEW.barcode_id, '-BAL$', '', 'i');
  END IF;

  SELECT * INTO parent
  FROM public.inventory_rolls
  WHERE lower(pg_catalog.btrim(barcode_id)) = lower(pg_catalog.btrim(cursor_code))
  LIMIT 1;

  root := parent;
  WHILE root.barcode_id IS NOT NULL AND root.barcode_id ~* '-BAL$' AND steps < 8 LOOP
    steps := steps + 1;
    next_code := NULLIF(pg_catalog.btrim(COALESCE(root.metadata ->> 'parentBarcodeId', root.metadata ->> 'parentBarcode', '')), '');
    IF next_code IS NULL OR lower(next_code) = lower(root.barcode_id) THEN
      next_code := pg_catalog.regexp_replace(root.barcode_id, '-BAL$', '', 'i');
    END IF;
    EXIT WHEN next_code IS NULL OR lower(next_code) = lower(root.barcode_id);
    SELECT * INTO walked
    FROM public.inventory_rolls
    WHERE lower(pg_catalog.btrim(barcode_id)) = lower(pg_catalog.btrim(next_code))
    LIMIT 1;
    EXIT WHEN NOT FOUND;
    root := walked;
  END LOOP;

  IF parent.barcode_id IS NULL THEN
    meta := COALESCE(NEW.metadata, '{}'::jsonb);
    NEW.metadata := meta || jsonb_build_object(
      'balanceRoll', true,
      'parentBarcodeId', cursor_code
    );
    RETURN NEW;
  END IF;

  IF root.barcode_id IS NULL THEN
    root := parent;
  END IF;

  real_name := NULLIF(pg_catalog.btrim(split_part(COALESCE(parent.item_name, ''), ' ||| ', 1)), '');
  IF private.balance_item_name_placeholder(real_name) THEN
    real_name := NULLIF(pg_catalog.btrim(split_part(COALESCE(root.item_name, ''), ' ||| ', 1)), '');
  END IF;

  SELECT
    NULLIF(pg_catalog.btrim(split_part(COALESCE(item.item_name, ''), ' ||| ', 1)), ''),
    NULLIF(pg_catalog.btrim(item.last_vendor), ''),
    NULLIF(pg_catalog.btrim(item.last_batch), ''),
    CASE WHEN COALESCE(item.unit_price, 0) > 0 THEN item.unit_price ELSE NULL END
  INTO stock_name, stock_vendor, stock_batch, stock_rate
  FROM public.inventory AS item
  WHERE item.id = COALESCE(NULLIF(pg_catalog.btrim(NEW.item_id), ''), NULLIF(pg_catalog.btrim(parent.item_id), ''), NULLIF(pg_catalog.btrim(root.item_id), ''))
  LIMIT 1;

  IF private.balance_item_name_placeholder(real_name) THEN
    real_name := stock_name;
  END IF;

  IF real_name IS NOT NULL AND private.balance_item_name_placeholder(NEW.item_name) THEN
    NEW.item_name := real_name;
  END IF;

  IF NULLIF(pg_catalog.btrim(NEW.vendor_name), '') IS NULL THEN
    NEW.vendor_name := COALESCE(NULLIF(pg_catalog.btrim(root.vendor_name), ''), NULLIF(pg_catalog.btrim(parent.vendor_name), ''), stock_vendor);
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.batch_no), '') IS NULL THEN
    NEW.batch_no := COALESCE(NULLIF(pg_catalog.btrim(root.batch_no), ''), NULLIF(pg_catalog.btrim(parent.batch_no), ''), stock_batch);
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.invoice_no), '') IS NULL THEN
    NEW.invoice_no := COALESCE(NULLIF(pg_catalog.btrim(root.invoice_no), ''), NULLIF(pg_catalog.btrim(parent.invoice_no), ''));
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.film_type), '') IS NULL THEN
    NEW.film_type := COALESCE(NULLIF(pg_catalog.btrim(root.film_type), ''), NULLIF(pg_catalog.btrim(parent.film_type), ''));
  END IF;
  IF COALESCE(NEW.micron, 0) = 0 THEN
    NEW.micron := COALESCE(NULLIF(root.micron, 0), NULLIF(parent.micron, 0), NEW.micron);
  END IF;
  IF COALESCE(NEW.width_mm, 0) = 0 THEN
    NEW.width_mm := COALESCE(NULLIF(root.width_mm, 0), NULLIF(parent.width_mm, 0), NEW.width_mm);
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.item_id), '') IS NULL THEN
    NEW.item_id := COALESCE(NULLIF(pg_catalog.btrim(parent.item_id), ''), NULLIF(pg_catalog.btrim(root.item_id), ''));
  END IF;
  IF NEW.grn_id IS NULL THEN
    NEW.grn_id := root.grn_id;
  END IF;
  IF NEW.grn_line_item_id IS NULL THEN
    NEW.grn_line_item_id := root.grn_line_item_id;
  END IF;
  IF NEW.vendor_roll_no IS NULL THEN
    NEW.vendor_roll_no := COALESCE(root.vendor_roll_no, parent.vendor_roll_no);
  END IF;

  copied_rate := private.balance_json_number(root.metadata, 'purchaseRatePerKg');
  IF copied_rate IS NULL OR copied_rate <= 0 THEN
    copied_rate := private.balance_json_number(root.metadata, 'unitPrice');
  END IF;
  IF copied_rate IS NULL OR copied_rate <= 0 THEN
    copied_rate := private.balance_json_number(parent.metadata, 'purchaseRatePerKg');
  END IF;
  IF copied_rate IS NULL OR copied_rate <= 0 THEN
    copied_rate := stock_rate;
  END IF;

  root_grn := COALESCE(
    NULLIF(pg_catalog.btrim(root.metadata ->> 'grnNo'), ''),
    NULLIF(pg_catalog.btrim(root.metadata ->> 'grn_no'), ''),
    NULLIF(pg_catalog.btrim(parent.metadata ->> 'grnNo'), '')
  );
  meta := COALESCE(NEW.metadata, '{}'::jsonb);
  existing_rate := private.balance_json_number(meta, 'purchaseRatePerKg');
  NEW.metadata := meta || jsonb_build_object(
    'balanceRoll', true,
    'parentBarcodeId', parent.barcode_id,
    'parentNetWeightKg', CASE WHEN root.barcode_id !~* '-BAL$' THEN root.net_weight_kg ELSE parent.net_weight_kg END,
    'parentInwardDatetime', CASE WHEN root.barcode_id !~* '-BAL$' THEN root.inward_datetime ELSE parent.inward_datetime END,
    'grnNo', COALESCE(NULLIF(pg_catalog.btrim(meta ->> 'grnNo'), ''), root_grn, ''),
    'purchaseRatePerKg', CASE
      WHEN existing_rate IS NOT NULL AND existing_rate > 0 THEN existing_rate
      ELSE COALESCE(copied_rate, 0)
    END,
    'unitPrice', CASE
      WHEN existing_rate IS NOT NULL AND existing_rate > 0 THEN existing_rate
      ELSE COALESCE(copied_rate, 0)
    END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.inherit_balance_roll_parent() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS inherit_balance_roll_parent ON public.inventory_rolls;
CREATE TRIGGER inherit_balance_roll_parent
  BEFORE INSERT OR UPDATE ON public.inventory_rolls
  FOR EACH ROW
  EXECUTE FUNCTION private.inherit_balance_roll_parent();

CREATE OR REPLACE FUNCTION private.inherit_balance_receipt_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  bal public.inventory_rolls%ROWTYPE;
  parent public.inventory_rolls%ROWTYPE;
  parent_code text;
BEGIN
  IF NEW.entry_kind IS DISTINCT FROM 'balance_receipt' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO bal
  FROM public.inventory_rolls
  WHERE lower(pg_catalog.btrim(barcode_id)) = lower(pg_catalog.btrim(NEW.barcode))
  LIMIT 1;

  parent_code := NULLIF(pg_catalog.btrim(COALESCE(NEW.parent_barcode, '')), '');
  IF parent_code IS NULL AND bal.barcode_id IS NOT NULL THEN
    parent_code := NULLIF(pg_catalog.btrim(COALESCE(bal.metadata ->> 'parentBarcodeId', '')), '');
  END IF;
  IF parent_code IS NULL AND NEW.barcode ~* '-BAL$' THEN
    parent_code := pg_catalog.regexp_replace(NEW.barcode, '-BAL$', '', 'i');
  END IF;

  IF parent_code IS NOT NULL THEN
    SELECT * INTO parent
    FROM public.inventory_rolls
    WHERE lower(pg_catalog.btrim(barcode_id)) = lower(pg_catalog.btrim(parent_code))
    LIMIT 1;
  END IF;

  IF bal.barcode_id IS NOT NULL AND NOT private.balance_item_name_placeholder(bal.item_name) THEN
    NEW.item_name := bal.item_name;
  ELSIF parent.barcode_id IS NOT NULL AND NOT private.balance_item_name_placeholder(parent.item_name) THEN
    NEW.item_name := split_part(parent.item_name, ' ||| ', 1);
  END IF;

  IF NULLIF(pg_catalog.btrim(NEW.vendor_name), '') IS NULL THEN
    NEW.vendor_name := COALESCE(NULLIF(pg_catalog.btrim(bal.vendor_name), ''), NULLIF(pg_catalog.btrim(parent.vendor_name), ''));
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.batch_no), '') IS NULL THEN
    NEW.batch_no := COALESCE(NULLIF(pg_catalog.btrim(bal.batch_no), ''), NULLIF(pg_catalog.btrim(parent.batch_no), ''));
  END IF;
  IF NEW.purchase_rate IS NULL OR NEW.purchase_rate <= 0 THEN
    NEW.purchase_rate := COALESCE(
      private.balance_json_number(bal.metadata, 'purchaseRatePerKg'),
      private.balance_json_number(parent.metadata, 'purchaseRatePerKg')
    );
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.grn_no), '') IS NULL THEN
    NEW.grn_no := COALESCE(
      NULLIF(pg_catalog.btrim(bal.metadata ->> 'grnNo'), ''),
      NULLIF(pg_catalog.btrim(parent.metadata ->> 'grnNo'), '')
    );
  END IF;
  IF NEW.parent_net_kg IS NULL OR NEW.parent_net_kg <= 0 THEN
    NEW.parent_net_kg := COALESCE(
      private.balance_json_number(bal.metadata, 'parentNetWeightKg'),
      CASE WHEN parent.barcode_id IS NOT NULL AND parent.barcode_id !~* '-BAL$' THEN parent.net_weight_kg ELSE NULL END
    );
  END IF;
  IF NEW.parent_inward_at IS NULL THEN
    NEW.parent_inward_at := COALESCE(
      NULLIF(pg_catalog.btrim(bal.metadata ->> 'parentInwardDatetime'), '')::timestamptz,
      CASE WHEN parent.barcode_id IS NOT NULL AND parent.barcode_id !~* '-BAL$' THEN parent.inward_datetime ELSE NULL END
    );
  END IF;
  IF COALESCE(NEW.micron, 0) = 0 THEN
    NEW.micron := COALESCE(NULLIF(bal.micron, 0), NULLIF(parent.micron, 0), NEW.micron);
  END IF;
  IF COALESCE(NEW.width_mm, 0) = 0 THEN
    NEW.width_mm := COALESCE(NULLIF(bal.width_mm, 0), NULLIF(parent.width_mm, 0), NEW.width_mm);
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.film_type), '') IS NULL THEN
    NEW.film_type := COALESCE(NULLIF(pg_catalog.btrim(bal.film_type), ''), NULLIF(pg_catalog.btrim(parent.film_type), ''));
  END IF;
  IF NULLIF(pg_catalog.btrim(NEW.parent_barcode), '') IS NULL THEN
    NEW.parent_barcode := parent_code;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.inherit_balance_receipt_parent() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS inherit_balance_receipt_parent ON public.inventory_ledger_entries;
CREATE TRIGGER inherit_balance_receipt_parent
  BEFORE INSERT OR UPDATE ON public.inventory_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION private.inherit_balance_receipt_parent();
