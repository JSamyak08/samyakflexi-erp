-- Pellet fuel GRN numbers, vehicle column, and one-transaction inward + GRN save.
-- Additive. Existing pellet rows keep their values. vehicle_no starts null.
-- Safe to run more than once.

ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS vehicle_no text;

-- Number series for pellet GRNs. RLS is left off on purpose: the manual
-- lockdown drops every public policy and would leave an enabled-but-policy-less
-- table unreachable. The counter only hands out document numbers. Stock rows
-- stay on pellet_inwards and grns, where the caller's RLS still applies.
CREATE TABLE IF NOT EXISTS public.pellet_grn_counters (
  prefix text PRIMARY KEY,
  last_value bigint NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.allocate_pellet_grn_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_prefix text := btrim(COALESCE(p_prefix, ''));
  observed bigint := 0;
  configured bigint := NULL;
  raw_setting text;
  issued bigint;
  candidate text;
BEGIN
  IF v_prefix = '' OR length(v_prefix) > 40 OR v_prefix !~ '^[A-Za-z0-9][A-Za-z0-9/_.-]{0,39}$' THEN
    RAISE EXCEPTION 'GRN prefix is missing or cannot be used in a document number';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flexierp-pellet-grn'), hashtext(v_prefix));

  SELECT COALESCE(MAX(tail), 0)
    INTO observed
  FROM (
    SELECT (substring(grn_number FROM char_length(v_prefix) + 1))::bigint AS tail
    FROM public.grns
    WHERE starts_with(grn_number, v_prefix)
      AND substring(grn_number FROM char_length(v_prefix) + 1) ~ '^[0-9]+$'
    UNION ALL
    SELECT (substring(grn_no FROM char_length(v_prefix) + 1))::bigint
    FROM public.pellet_inwards
    WHERE grn_no IS NOT NULL
      AND starts_with(grn_no, v_prefix)
      AND substring(grn_no FROM char_length(v_prefix) + 1) ~ '^[0-9]+$'
  ) AS used;

  BEGIN
    SELECT setting_value INTO raw_setting
    FROM public.system_settings
    WHERE setting_key = 'doc_prefixes';
    IF raw_setting IS NOT NULL AND btrim(raw_setting) <> '' THEN
      configured := NULLIF(raw_setting::jsonb ->> 'grnCounter', '')::bigint;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation THEN
      configured := NULL;
  END;

  INSERT INTO public.pellet_grn_counters (prefix, last_value)
  VALUES (v_prefix, GREATEST(observed, COALESCE(configured, 1) - 1, 0))
  ON CONFLICT (prefix) DO UPDATE
    SET last_value = GREATEST(
      public.pellet_grn_counters.last_value,
      EXCLUDED.last_value
    );

  UPDATE public.pellet_grn_counters
     SET last_value = last_value + 1
   WHERE prefix = v_prefix
  RETURNING last_value INTO issued;

  candidate := v_prefix || issued::text;
  WHILE EXISTS (SELECT 1 FROM public.grns WHERE grn_number = candidate)
     OR EXISTS (SELECT 1 FROM public.pellet_inwards WHERE grn_no = candidate)
  LOOP
    UPDATE public.pellet_grn_counters
       SET last_value = last_value + 1
     WHERE prefix = v_prefix
    RETURNING last_value INTO issued;
    candidate := v_prefix || issued::text;
  END LOOP;

  RETURN candidate;
END;
$$;

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

  RETURN jsonb_build_object(
    'pellet', pellet,
    'grn', grn || jsonb_build_object('id', v_id, 'grnNo', v_grn, 'grn_number', v_grn)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_pellet_grn_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_pellet_inward_with_grn(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.pellet_grn_counters TO authenticated;
    GRANT EXECUTE ON FUNCTION public.allocate_pellet_grn_number(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.save_pellet_inward_with_grn(jsonb) TO authenticated;
  END IF;
END $$;

-- Unique GRN numbers only when the live table has no duplicates.
-- A failing unique index would stop this migration and block later deploys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'grns'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'grns_grn_number_uidx'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.grns
    WHERE grn_number IS NOT NULL AND btrim(grn_number) <> ''
    GROUP BY grn_number
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX grns_grn_number_uidx ON public.grns (grn_number);
  END IF;
END $$;

-- Grant the pellet screen to the roles that receive and consume fuel.
-- Does not change any other permission key, and does not turn the flag off
-- for a role that already has it.
UPDATE public.role_permissions
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('pellet_fuel', true),
    updated_at = now()
WHERE role IN (
  'Admin',
  'Plant Manager',
  'HR & Payroll Manager',
  'Production Manager',
  'Store Manager',
  'Purchase Manager',
  'QC Chemist',
  'Shop Floor Operator'
)
AND COALESCE(permissions -> 'pellet_fuel', 'false'::jsonb) IS DISTINCT FROM 'true'::jsonb;
