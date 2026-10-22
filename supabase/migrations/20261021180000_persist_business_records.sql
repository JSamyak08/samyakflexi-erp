-- Move business records out of browser storage and system_settings blobs.
-- Additive only: new tables, new columns, and INSERT ... ON CONFLICT DO NOTHING
-- copies. Existing rows and existing system_settings keys are left in place.
--
-- Overlap with draft PR #2 (cursor/fix-functional-bugs-7215):
-- that PR also creates pellet_inwards / pellet_consumptions, but only after the
-- unmerged RLS lockdown (private.can_any). This file creates the same columns
-- with the open policy the other live tables use today, so pellet saves work
-- before that lockdown. Both files use CREATE TABLE IF NOT EXISTS and
-- ADD COLUMN IF NOT EXISTS. PR #2 drops the open pellet policies when it runs.

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_details text;

ALTER TABLE public.sales_quotations ADD COLUMN IF NOT EXISTS terms_template_key text;

ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS transporter_name text;
ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS po_no text;
ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS invoice_no text;
ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS hide_branding boolean DEFAULT false;
ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.dispatch_shipments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.custom_barcodes (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.po_discrepancy_resolutions (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sfg_qc_hold_items (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sfg_scrap_items (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.material_indents (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.machine_issues (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consumables (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.store_issue_transactions (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.erp_notifications (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.job_card_specs (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.press_board (
  id text PRIMARY KEY,
  queue_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  machine_assignments jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_running_job jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pellet_inwards (
  id text PRIMARY KEY,
  grn_no text,
  inward_date date,
  inward_qty_kg numeric DEFAULT 0,
  unit_cost_per_kg numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pellet_consumptions (
  id text PRIMARY KEY,
  consumption_date date,
  consumed_qty_kg numeric DEFAULT 0,
  operating_hours numeric DEFAULT 0,
  reference_printing_done_kg numeric DEFAULT 0,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS grn_no text;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS inward_date date;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS inward_qty_kg numeric DEFAULT 0;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS unit_cost_per_kg numeric DEFAULT 0;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS consumption_date date;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS consumed_qty_kg numeric DEFAULT 0;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS operating_hours numeric DEFAULT 0;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS reference_printing_done_kg numeric DEFAULT 0;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_discrepancy_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sfg_qc_hold_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sfg_scrap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_indents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_issue_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_card_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.press_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pellet_inwards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pellet_consumptions ENABLE ROW LEVEL SECURITY;

-- Same open policy the other public tables use in production today.
-- supabase/manual/20261019120000_auth_rls_lockdown.sql replaces these when applied.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'stock_adjustments',
    'custom_barcodes',
    'po_discrepancy_resolutions',
    'sfg_qc_hold_items',
    'sfg_scrap_items',
    'material_indents',
    'machine_issues',
    'consumables',
    'store_issue_transactions',
    'erp_notifications',
    'job_card_specs',
    'press_board',
    'pellet_inwards',
    'pellet_consumptions'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated', t);
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        'Allow anon and auth full access',
        t
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._flexi_parse_setting(raw text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parsed jsonb;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    parsed := raw::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF jsonb_typeof(parsed) = 'string' THEN
    BEGIN
      parsed := (parsed #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  RETURN parsed;
END;
$$;

REVOKE ALL ON FUNCTION public._flexi_parse_setting(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._flexi_copy_payload_array(p_keys text[], p_table text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  raw text;
  doc jsonb;
  elem jsonb;
  rid text;
  k text;
BEGIN
  FOREACH k IN ARRAY p_keys LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN
      CONTINUE;
    END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value
    LOOP
      BEGIN
        rid := NULLIF(elem->>'id', '');
        IF rid IS NULL THEN
          rid := 'legacy-' || md5(elem::text);
        END IF;
        EXECUTE format(
          'INSERT INTO public.%I (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          p_table
        ) USING rid, elem;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip %.% : %', p_table, rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._flexi_copy_payload_array(text[], text) FROM PUBLIC;

SELECT public._flexi_copy_payload_array(ARRAY['stock_adjustments', 'samyak_erp_stock_adjustments'], 'stock_adjustments');
SELECT public._flexi_copy_payload_array(ARRAY['sfg_qc_hold_items'], 'sfg_qc_hold_items');
SELECT public._flexi_copy_payload_array(ARRAY['sfg_scrap_items'], 'sfg_scrap_items');
SELECT public._flexi_copy_payload_array(ARRAY['material_indents'], 'material_indents');
SELECT public._flexi_copy_payload_array(ARRAY['machine_issues'], 'machine_issues');
SELECT public._flexi_copy_payload_array(ARRAY['consumables'], 'consumables');
SELECT public._flexi_copy_payload_array(ARRAY['store_issue_transactions'], 'store_issue_transactions');

-- Object maps: { id: barcode } and { poNumber: resolution }.
DO $$
DECLARE
  raw text;
  doc jsonb;
  kv record;
  k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['custom_barcodes', 'samyak_erp_custom_barcodes'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
      CONTINUE;
    END IF;
    FOR kv IN SELECT key, value FROM jsonb_each(doc)
    LOOP
      BEGIN
        INSERT INTO public.custom_barcodes (id, payload)
        VALUES (
          kv.key,
          jsonb_build_object('id', kv.key, 'barcode', CASE WHEN jsonb_typeof(kv.value) = 'string' THEN kv.value #>> '{}' ELSE COALESCE(kv.value->>'barcode', kv.value::text) END)
        )
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip barcode %: %', kv.key, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['po_discrepancy_resolutions', 'samyak_po_discrepancy_resolutions'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
      CONTINUE;
    END IF;
    FOR kv IN SELECT key, value FROM jsonb_each(doc)
    LOOP
      BEGIN
        INSERT INTO public.po_discrepancy_resolutions (id, payload)
        VALUES (kv.key, CASE WHEN jsonb_typeof(kv.value) = 'object' THEN kv.value || jsonb_build_object('id', kv.key) ELSE jsonb_build_object('id', kv.key, 'value', kv.value) END)
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip resolution %: %', kv.key, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._flexi_insert_po(elem jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rid text;
  pono text;
  vname text;
  podate date;
BEGIN
  IF elem IS NULL OR jsonb_typeof(elem) <> 'object' THEN
    RETURN;
  END IF;
  rid := COALESCE(NULLIF(elem->>'id', ''), NULLIF(elem->>'poNumber', ''), NULLIF(elem->>'po_number', ''));
  pono := COALESCE(NULLIF(elem->>'poNumber', ''), NULLIF(elem->>'po_number', ''), rid);
  IF rid IS NULL OR pono IS NULL THEN
    RETURN;
  END IF;
  vname := COALESCE(
    NULLIF(elem->>'vendorName', ''),
    NULLIF(elem->>'vendor_name', ''),
    NULLIF(elem #>> '{vendor,companyName}', ''),
    NULLIF(elem #>> '{vendor,name}', ''),
    'Vendor'
  );
  BEGIN
    IF COALESCE(elem->>'poDate', elem->>'po_date', '') ~ '^\d{4}-\d{2}-\d{2}' THEN
      podate := left(COALESCE(elem->>'poDate', elem->>'po_date'), 10)::date;
    ELSE
      podate := CURRENT_DATE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    podate := CURRENT_DATE;
  END;
  INSERT INTO public.purchase_orders (
    id, po_number, po_date, delivery_date, promised_delivery_date, vendor_id, vendor_name, vendor_details, category, items,
    total_qty_kg, subtotal, tax_amount, total_amount, payment_terms, logistic_details,
    notes, remarks, status, source, linked_order_id, linked_order_name, linked_requirements, created_by
  )
  SELECT
    rid, pono, podate,
    CASE WHEN COALESCE(elem->>'deliveryDate', elem->>'delivery_date', '') ~ '^\d{4}-\d{2}-\d{2}'
      THEN left(COALESCE(elem->>'deliveryDate', elem->>'delivery_date'), 10)::date ELSE NULL END,
    CASE WHEN COALESCE(elem->>'promisedDeliveryDate', elem->>'promised_delivery_date', '') ~ '^\d{4}-\d{2}-\d{2}'
      THEN left(COALESCE(elem->>'promisedDeliveryDate', elem->>'promised_delivery_date'), 10)::date ELSE NULL END,
    NULLIF(COALESCE(elem->>'vendorId', elem->>'vendor_id', elem #>> '{vendor,id}'), ''),
    vname,
    CASE WHEN jsonb_typeof(elem->'vendor') = 'object' THEN elem->'vendor' ELSE '{}'::jsonb END,
    COALESCE(NULLIF(elem->>'category', ''), 'Film Substrates'),
    CASE WHEN jsonb_typeof(elem->'items') = 'array' THEN elem->'items' ELSE '[]'::jsonb END,
    COALESCE((NULLIF(elem->>'totalQtyKg', ''))::numeric, (NULLIF(elem->>'total_qty_kg', ''))::numeric, 0),
    COALESCE((NULLIF(elem->>'subtotal', ''))::numeric, 0),
    COALESCE((NULLIF(elem->>'taxAmount', ''))::numeric, (NULLIF(elem->>'tax_amount', ''))::numeric, 0),
    COALESCE((NULLIF(elem->>'totalAmount', ''))::numeric, (NULLIF(elem->>'total_amount', ''))::numeric, 0),
    COALESCE(NULLIF(elem->>'paymentTerms', ''), NULLIF(elem->>'payment_terms', ''), '30 Days Net'),
    NULLIF(COALESCE(elem->>'logisticDetails', elem->>'logistic_details'), ''),
    NULLIF(COALESCE(elem->>'notes', ''), ''),
    NULLIF(COALESCE(elem->>'remarks', ''), ''),
    COALESCE(NULLIF(elem->>'status', ''), 'Pending Delivery'),
    COALESCE(NULLIF(elem->>'source', ''), 'Imported from system_settings'),
    NULLIF(COALESCE(elem->>'linkedOrderId', elem->>'linked_order_id'), ''),
    NULLIF(COALESCE(elem->>'linkedOrderName', elem->>'linked_order_name'), ''),
    CASE WHEN jsonb_typeof(elem->'linkedRequirements') = 'array' THEN elem->'linkedRequirements'
         WHEN jsonb_typeof(elem->'linked_requirements') = 'array' THEN elem->'linked_requirements'
         ELSE '[]'::jsonb END,
    NULLIF(COALESCE(elem->>'createdBy', elem->>'created_by'), '')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.purchase_orders p WHERE p.id = rid OR p.po_number = pono
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skip purchase order %: %', pono, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public._flexi_insert_po(jsonb) FROM PUBLIC;

DO $$
DECLARE
  raw text;
  doc jsonb;
  elem jsonb;
  k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['purchase_orders', 'samyak_erp_issued_pos', 'issued_pos'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(doc) = 'array' THEN
      FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
        PERFORM public._flexi_insert_po(elem);
      END LOOP;
    ELSIF jsonb_typeof(doc) = 'object' THEN
      FOR elem IN SELECT value FROM jsonb_each(doc) AS t(key, value) LOOP
        PERFORM public._flexi_insert_po(elem);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Dispatch, challans, certificates, pellets, scrap, press board, and job cards.
DO $$
DECLARE
  raw text;
  doc jsonb;
  elem jsonb;
  k text;
  rid text;
  podate date;
BEGIN
  FOREACH k IN ARRAY ARRAY['dispatch_shipments'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN
      CONTINUE;
    END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
      BEGIN
        rid := COALESCE(NULLIF(elem->>'dispatchId', ''), NULLIF(elem->>'id', ''), 'legacy-' || md5(elem::text));
        INSERT INTO public.dispatch_shipments (
          dispatch_id, id, order_id, job_name, client_name, vehicle_no, lr_no,
          transporter_name, po_no, invoice_no, dispatch_date, total_rolls,
          total_net_weight_kg, total_gross_weight_kg, items, hide_branding, payload
        )
        SELECT
          rid, rid,
          NULLIF(COALESCE(elem->>'orderId', elem->>'order_id'), ''),
          COALESCE(NULLIF(elem->>'jobName', ''), NULLIF(elem->>'job_name', ''), '—'),
          COALESCE(NULLIF(elem->>'clientName', ''), NULLIF(elem->>'client_name', ''), '—'),
          NULLIF(COALESCE(elem->>'vehicleNo', elem->>'vehicle_no'), ''),
          NULLIF(COALESCE(elem->>'lrNo', elem->>'lr_no'), ''),
          NULLIF(COALESCE(elem->>'transporterName', elem->>'transporter_name'), ''),
          NULLIF(COALESCE(elem->>'poNo', elem->>'po_no'), ''),
          NULLIF(COALESCE(elem->>'invoiceNo', elem->>'invoice_no'), ''),
          COALESCE((NULLIF(COALESCE(elem->>'dispatchDate', elem->>'dispatch_date'), ''))::timestamptz, now()),
          COALESCE((NULLIF(COALESCE(elem->>'totalRolls', elem->>'total_rolls'), ''))::integer, 0),
          COALESCE((NULLIF(COALESCE(elem->>'totalNetWeightKg', elem->>'total_net_weight_kg'), ''))::numeric, 0),
          COALESCE((NULLIF(COALESCE(elem->>'totalGrossWeightKg', elem->>'total_gross_weight_kg'), ''))::numeric, 0),
          CASE WHEN jsonb_typeof(elem->'items') = 'array' THEN elem->'items' ELSE '[]'::jsonb END,
          COALESCE((elem->>'hideBranding')::boolean, false),
          elem
        WHERE NOT EXISTS (SELECT 1 FROM public.dispatch_shipments d WHERE d.dispatch_id = rid);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip dispatch %: %', rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['delivery_challans'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN CONTINUE; END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
      BEGIN
        rid := COALESCE(NULLIF(elem->>'id', ''), NULLIF(elem->>'challanNo', ''), 'legacy-' || md5(elem::text));
        INSERT INTO public.delivery_challans (id, challan_no, client_name, payload)
        SELECT rid,
          NULLIF(COALESCE(elem->>'challanNo', elem->>'challan_no'), ''),
          NULLIF(COALESCE(elem->>'clientName', elem->>'partyName', elem->>'client_name'), ''),
          elem
        WHERE NOT EXISTS (SELECT 1 FROM public.delivery_challans d WHERE d.id = rid);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip challan %: %', rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['certificate_of_analyses'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN CONTINUE; END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
      BEGIN
        rid := COALESCE(NULLIF(elem->>'id', ''), NULLIF(elem->>'coaNo', ''), 'legacy-' || md5(elem::text));
        INSERT INTO public.certificate_of_analyses (id, coa_no, job_name, customer_name, payload)
        SELECT rid,
          NULLIF(COALESCE(elem->>'coaNo', elem->>'coa_no'), ''),
          NULLIF(COALESCE(elem->>'jobName', elem->>'job_name'), ''),
          NULLIF(COALESCE(elem->>'customerName', elem->>'customer_name'), ''),
          elem
        WHERE NOT EXISTS (SELECT 1 FROM public.certificate_of_analyses c WHERE c.id = rid);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip coa %: %', rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['pellet_inwards'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN CONTINUE; END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
      BEGIN
        rid := COALESCE(NULLIF(elem->>'id', ''), 'legacy-' || md5(elem::text));
        INSERT INTO public.pellet_inwards (id, grn_no, inward_date, inward_qty_kg, unit_cost_per_kg, total_amount, payload)
        SELECT rid,
          NULLIF(COALESCE(elem->>'grnNo', elem->>'grn_no'), ''),
          CASE WHEN COALESCE(elem->>'inwardDate', elem->>'inward_date', '') ~ '^\d{4}-\d{2}-\d{2}'
            THEN left(COALESCE(elem->>'inwardDate', elem->>'inward_date'), 10)::date ELSE CURRENT_DATE END,
          COALESCE((NULLIF(COALESCE(elem->>'inwardQtyKg', elem->>'inward_qty_kg'), ''))::numeric, 0),
          COALESCE((NULLIF(COALESCE(elem->>'unitCostPerKg', elem->>'unit_cost_per_kg'), ''))::numeric, 0),
          COALESCE((NULLIF(COALESCE(elem->>'totalAmount', elem->>'total_amount'), ''))::numeric, 0),
          elem
        WHERE NOT EXISTS (SELECT 1 FROM public.pellet_inwards p WHERE p.id = rid);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip pellet inward %: %', rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['pellet_consumptions'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN CONTINUE; END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
      BEGIN
        rid := COALESCE(NULLIF(elem->>'id', ''), 'legacy-' || md5(elem::text));
        INSERT INTO public.pellet_consumptions (
          id, consumption_date, consumed_qty_kg, operating_hours, reference_printing_done_kg, payload
        )
        SELECT rid,
          CASE WHEN COALESCE(elem->>'consumptionDate', elem->>'consumption_date', '') ~ '^\d{4}-\d{2}-\d{2}'
            THEN left(COALESCE(elem->>'consumptionDate', elem->>'consumption_date'), 10)::date ELSE CURRENT_DATE END,
          COALESCE((NULLIF(COALESCE(elem->>'consumedQtyKg', elem->>'consumed_qty_kg'), ''))::numeric, 0),
          COALESCE((NULLIF(COALESCE(elem->>'operatingHours', elem->>'operating_hours'), ''))::numeric, 0),
          COALESCE((NULLIF(COALESCE(elem->>'referencePrintingDoneKg', elem->>'reference_printing_done_kg'), ''))::numeric, 0),
          elem
        WHERE NOT EXISTS (SELECT 1 FROM public.pellet_consumptions p WHERE p.id = rid);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip pellet consumption %: %', rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['scrap_disposals', 'samyak_erp_scrap_disposals'] LOOP
    SELECT setting_value INTO raw FROM public.system_settings WHERE setting_key = k;
    doc := public._flexi_parse_setting(raw);
    IF doc IS NULL OR jsonb_typeof(doc) <> 'array' THEN CONTINUE; END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(doc) AS value LOOP
      BEGIN
        rid := COALESCE(NULLIF(elem->>'id', ''), 'legacy-' || md5(elem::text));
        podate := CURRENT_DATE;
        IF COALESCE(elem->>'date', elem->>'disposed_date', elem->>'disposedDate', '') ~ '^\d{4}-\d{2}-\d{2}' THEN
          podate := left(COALESCE(elem->>'date', elem->>'disposed_date', elem->>'disposedDate'), 10)::date;
        END IF;
        INSERT INTO public.scrap_disposals (id, category, qty_kg, vendor, ref_no, disposed_date, disposed_by, notes)
        SELECT rid,
          COALESCE(NULLIF(elem->>'category', ''), 'Scrap'),
          COALESCE((NULLIF(COALESCE(elem->>'qtyKg', elem->>'qty_kg'), ''))::numeric, 0),
          COALESCE(NULLIF(elem->>'vendor', ''), 'Scrap Recycler'),
          NULLIF(COALESCE(elem->>'refNo', elem->>'ref_no'), ''),
          podate,
          NULLIF(COALESCE(elem->>'disposedBy', elem->>'disposed_by'), ''),
          NULLIF(COALESCE(elem->>'notes', ''), '')
        WHERE NOT EXISTS (SELECT 1 FROM public.scrap_disposals s WHERE s.id = rid);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip scrap %: %', rid, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.press_board WHERE id = 'plant') THEN
      INSERT INTO public.press_board (id, queue_order, machine_assignments, active_running_job)
      SELECT 'plant',
        COALESCE(public._flexi_parse_setting((SELECT setting_value FROM public.system_settings WHERE setting_key = 'printing_press_queue_order')), '[]'::jsonb),
        COALESCE(public._flexi_parse_setting((SELECT setting_value FROM public.system_settings WHERE setting_key = 'printing_press_machine_assignments')), '{}'::jsonb),
        public._flexi_parse_setting((SELECT setting_value FROM public.system_settings WHERE setting_key = 'printing_press_active_running_job'))
      WHERE EXISTS (
        SELECT 1 FROM public.system_settings
        WHERE setting_key IN (
          'printing_press_queue_order',
          'printing_press_machine_assignments',
          'printing_press_active_running_job'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip press board copy: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.job_card_specs (id, payload)
    SELECT s.setting_key, COALESCE(public._flexi_parse_setting(s.setting_value), '{}'::jsonb)
    FROM public.system_settings s
    WHERE s.setting_key LIKE 'jobcard_%'
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip job card copy: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.audit_logs (id, username, user_role, action_type, module, details, target_id, created_at)
    SELECT
      COALESCE(NULLIF(elem->>'id', ''), 'legacy-' || md5(elem::text)),
      COALESCE(NULLIF(elem->>'username', ''), 'System'),
      COALESCE(NULLIF(COALESCE(elem->>'userRole', elem->>'user_role'), ''), 'Admin'),
      COALESCE(NULLIF(COALESCE(elem->>'actionType', elem->>'action_type'), ''), 'UPDATE'),
      COALESCE(NULLIF(elem->>'module', ''), 'System'),
      COALESCE(elem->>'details', ''),
      NULLIF(COALESCE(elem->>'targetId', elem->>'target_id'), ''),
      COALESCE((NULLIF(COALESCE(elem->>'timestamp', elem->>'created_at'), ''))::timestamptz, now())
    FROM public.system_settings s
    CROSS JOIN LATERAL jsonb_array_elements(public._flexi_parse_setting(s.setting_value)) AS elem
    WHERE s.setting_key = 'audit_logs'
      AND public._flexi_parse_setting(s.setting_value) IS NOT NULL
      AND jsonb_typeof(public._flexi_parse_setting(s.setting_value)) = 'array'
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip audit log copy: %', SQLERRM;
  END;
END $$;

DROP FUNCTION IF EXISTS public._flexi_insert_po(jsonb);
DROP FUNCTION IF EXISTS public._flexi_copy_payload_array(text[], text);
DROP FUNCTION IF EXISTS public._flexi_parse_setting(text);
