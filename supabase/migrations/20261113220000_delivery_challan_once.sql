-- One Sale of Goods delivery challan per job order, and a unique challan
-- number for every new document.
--
-- Production already has repeated numbers (SIL/DC/26-27/102 three times,
-- 108, 124, and 179 twice). They were issued from a browser copy of
-- doc_prefixes.dcCounter, the same way order numbers used to collide.
-- This migration does not renumber those documents.
--
-- New numbers come from allocate_delivery_challan_no(). It takes the next
-- serial after the highest number already stored or reserved for the
-- current prefix. A number that already exists, including a legacy
-- duplicate, cannot be issued again.
--
-- Editing the challan that already covers an order is allowed. Adding an
-- order that already has another active Sale of Goods challan is not.
-- Returnable and job-work challans are not part of that rule.
-- A later packing list of balance rolls does not get a second Sale of
-- Goods challan for the same order.
--
-- When a challan or finalised packing list changes, the order status
-- follows the existing auto-close rule. Dispatched kg is
-- private.order_dispatched_kg: finalised packing-list roll net weights
-- and delivery-challan kg lines, cancelled documents ignored, and the
-- larger of the two totals kept so the same goods are not added twice.
-- Within the tolerance band and with no leftover stock (printed SFG-LOT-
-- lots do not count) the order becomes Completed. A smaller quantity
-- becomes Balance Dispatch Pending. Above the band the order stays open.
-- Cancelling the challan runs the same rule again.
--
-- Timestamp is after 20261113210000_wastage_pct_of_dispatch.sql.
-- private.order_dispatched_kg keeps that migration's rule for a document
-- whose lines do not name an order. When lines name an order or job, only
-- that order's lines are counted, so one packing list of two job orders
-- is not booked twice. Safe to run more than once.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.delivery_challan_number_claims (
  number_key text PRIMARY KEY,
  challan_id text,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.delivery_challan_number_claims FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.clean_job_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(split_part(coalesce(p_name, ''), ' ||| ', 1)));
$$;

CREATE OR REPLACE FUNCTION private.dispatch_item_kg(item jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN item IS NULL OR jsonb_typeof(item) IS DISTINCT FROM 'object' THEN 0::numeric
    WHEN lower(btrim(coalesce(item->>'unit', 'Kg'))) IN ('kg', 'kgs', 'kilogram', 'kilograms', '')
         AND btrim(coalesce(item->>'quantity', item->>'qtyKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN btrim(coalesce(item->>'quantity', item->>'qtyKg'))::numeric
    WHEN btrim(coalesce(item->>'netWeightKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN btrim(item->>'netWeightKg')::numeric
    ELSE 0::numeric
  END
$$;

CREATE OR REPLACE FUNCTION private.dispatch_document_counts(doc jsonb, column_packing_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN doc IS NULL OR jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN false
    WHEN lower(btrim(coalesce(doc->>'status', ''))) IN ('cancelled', 'canceled') THEN false
    WHEN lower(btrim(coalesce(doc->>'cancelled', ''))) IN ('true', 't') THEN false
    WHEN lower(btrim(coalesce(doc->>'isCancelled', ''))) IN ('true', 't') THEN false
    WHEN coalesce(
      nullif(btrim(doc->>'packingStatus'), ''),
      nullif(btrim(column_packing_status), ''),
      nullif(btrim(doc->>'packing_status'), '')
    ) = 'Open' THEN false
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION private.dispatch_document_kg(
  doc jsonb,
  column_net_kg numeric,
  column_packing_status text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  items jsonb;
  from_items numeric := 0;
BEGIN
  IF NOT private.dispatch_document_counts(doc, column_packing_status) THEN
    RETURN 0;
  END IF;
  items := doc->'items';
  IF jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0 THEN
    SELECT COALESCE(sum(private.dispatch_item_kg(value)), 0)
      INTO from_items
    FROM jsonb_array_elements(items) AS listed(value);
    IF from_items > 0 THEN
      RETURN from_items;
    END IF;
  END IF;
  IF btrim(coalesce(doc->>'totalNetWeightKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RETURN btrim(doc->>'totalNetWeightKg')::numeric;
  END IF;
  RETURN COALESCE(column_net_kg, 0);
END;
$$;

CREATE OR REPLACE FUNCTION private.dispatch_document_matches(
  doc jsonb,
  column_order_id text,
  column_job_name text,
  order_key text,
  job_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    (
      coalesce(order_key, '') <> ''
      AND lower(btrim(coalesce(nullif(btrim(doc->>'orderId'), ''), column_order_id, ''))) = order_key
    )
    OR
    (
      coalesce(job_key, '') <> ''
      AND private.clean_job_name(coalesce(nullif(btrim(doc->>'jobName'), ''), column_job_name, '')) = job_key
    )
$$;

-- Kilograms on one document for one order. Lines that name an order or job
-- are counted only for that order. A document whose lines do not name an
-- order still counts in full when its header matches, which is the
-- single-order challan already used by auto-close and wastage %.
CREATE OR REPLACE FUNCTION private.dispatch_kg_for_order(
  doc jsonb,
  column_net_kg numeric,
  column_packing_status text,
  column_order_id text,
  column_job_name text,
  order_key text,
  job_key text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  items jsonb;
  identified boolean := false;
  matched numeric := 0;
BEGIN
  IF NOT private.dispatch_document_counts(doc, column_packing_status) THEN
    RETURN 0;
  END IF;
  items := doc->'items';
  IF jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(items) AS listed(value)
      WHERE nullif(btrim(value->>'orderId'), '') IS NOT NULL
         OR nullif(btrim(value->>'jobName'), '') IS NOT NULL
    ) INTO identified;
    IF identified THEN
      SELECT COALESCE(sum(private.dispatch_item_kg(value)), 0)
        INTO matched
      FROM jsonb_array_elements(items) AS listed(value)
      WHERE (
        coalesce(order_key, '') <> ''
        AND lower(btrim(coalesce(value->>'orderId', ''))) = order_key
      ) OR (
        coalesce(job_key, '') <> ''
        AND private.clean_job_name(value->>'jobName') = job_key
      );
      RETURN COALESCE(matched, 0);
    END IF;
  END IF;
  IF NOT private.dispatch_document_matches(doc, column_order_id, column_job_name, order_key, job_key) THEN
    RETURN 0;
  END IF;
  RETURN private.dispatch_document_kg(doc, column_net_kg, column_packing_status);
END;
$$;

-- Same quantity the order-close rule and the dispatch wastage percentage use.
CREATE OR REPLACE FUNCTION private.order_dispatched_kg(p_order_id text, p_job_name text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_key text := lower(btrim(coalesce(p_order_id, '')));
  job_key text := private.clean_job_name(p_job_name);
  challan_kg numeric := 0;
  shipment_kg numeric := 0;
  result numeric := 0;
BEGIN
  IF to_regclass('public.delivery_challans') IS NOT NULL THEN
    SELECT COALESCE(sum(private.dispatch_kg_for_order(c.payload, NULL, NULL, NULL, NULL, order_key, job_key)), 0)
      INTO challan_kg
    FROM public.delivery_challans AS c;
  END IF;

  IF to_regclass('public.dispatch_shipments') IS NOT NULL THEN
    SELECT COALESCE(sum(
      private.dispatch_kg_for_order(
        CASE
          WHEN s.payload IS NOT NULL
               AND jsonb_typeof(s.payload) = 'object'
               AND s.payload <> '{}'::jsonb
            THEN s.payload
          ELSE jsonb_build_object(
            'orderId', s.order_id,
            'jobName', s.job_name,
            'items', COALESCE(s.items, '[]'::jsonb),
            'totalNetWeightKg', s.total_net_weight_kg,
            'packingStatus', s.packing_status
          )
        END,
        s.total_net_weight_kg,
        s.packing_status,
        s.order_id,
        s.job_name,
        order_key,
        job_key
      )
    ), 0)
      INTO shipment_kg
    FROM public.dispatch_shipments AS s;
  END IF;

  IF challan_kg > 0 AND shipment_kg > 0 THEN
    result := round(greatest(challan_kg, shipment_kg), 2);
  ELSE
    result := round(coalesce(challan_kg, 0) + coalesce(shipment_kg, 0), 2);
  END IF;
  IF result IS NULL OR result <= 0 THEN
    RETURN 0;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.challan_is_cancelled(payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(coalesce(payload->>'status', ''))) IN ('cancelled', 'canceled')
    OR lower(btrim(coalesce(payload->>'cancelled', ''))) IN ('true', 't')
    OR lower(btrim(coalesce(payload->>'isCancelled', ''))) IN ('true', 't');
$$;

CREATE OR REPLACE FUNCTION private.challan_is_sale(payload jsonb, column_nature text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(coalesce(
    nullif(btrim(payload->>'challanNature'), ''),
    nullif(btrim(payload->>'movementType'), ''),
    nullif(btrim(column_nature), ''),
    'Sale of Goods'
  ))) = 'sale of goods';
$$;

CREATE OR REPLACE FUNCTION private.orders_covered_by_document(doc jsonb)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF doc IS NULL OR jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH direct_keys AS (
    SELECT
      NULLIF(NULLIF(lower(btrim(doc->>'orderId')), ''), 'n/a') AS order_key,
      NULLIF(private.clean_job_name(doc->>'jobName'), '') AS job_key
    UNION ALL
    SELECT
      NULLIF(NULLIF(lower(btrim(item->>'orderId')), ''), 'n/a'),
      NULLIF(private.clean_job_name(item->>'jobName'), '')
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(doc->'items') = 'array' THEN doc->'items' ELSE '[]'::jsonb END
    ) AS listed(item)
    UNION ALL
    SELECT
      NULLIF(NULLIF(lower(btrim(s.order_id)), ''), 'n/a'),
      NULLIF(private.clean_job_name(s.job_name), '')
    FROM public.dispatch_shipments AS s
    WHERE to_regclass('public.dispatch_shipments') IS NOT NULL
      AND (
        lower(btrim(s.dispatch_id)) IN (
          SELECT lower(btrim(value))
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(doc->'linkedPackingListIds') = 'array' THEN doc->'linkedPackingListIds'
              ELSE '[]'::jsonb
            END
          ) AS linked(value)
        )
        OR lower(btrim(s.id)) IN (
          SELECT lower(btrim(value))
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(doc->'linkedPackingListIds') = 'array' THEN doc->'linkedPackingListIds'
              ELSE '[]'::jsonb
            END
          ) AS linked(value)
        )
      )
    UNION ALL
    SELECT
      NULLIF(NULLIF(lower(btrim(roll->>'orderId')), ''), 'n/a'),
      NULLIF(private.clean_job_name(roll->>'jobName'), '')
    FROM public.dispatch_shipments AS s
    CROSS JOIN jsonb_array_elements(
      CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END
    ) AS rolls(roll)
    WHERE to_regclass('public.dispatch_shipments') IS NOT NULL
      AND (
        lower(btrim(s.dispatch_id)) IN (
          SELECT lower(btrim(value))
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(doc->'linkedPackingListIds') = 'array' THEN doc->'linkedPackingListIds'
              ELSE '[]'::jsonb
            END
          ) AS linked(value)
        )
        OR lower(btrim(s.id)) IN (
          SELECT lower(btrim(value))
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(doc->'linkedPackingListIds') = 'array' THEN doc->'linkedPackingListIds'
              ELSE '[]'::jsonb
            END
          ) AS linked(value)
        )
      )
  )
  SELECT DISTINCT o.id
  FROM public.orders AS o
  JOIN direct_keys AS k
    ON (
      k.order_key IS NOT NULL AND lower(btrim(o.id)) = k.order_key
    ) OR (
      k.job_key IS NOT NULL AND private.clean_job_name(o.job_name) = k.job_key
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.dc_number_prefix()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw text;
  prefix text := 'SIL/DC/26-27/';
BEGIN
  IF to_regclass('public.system_settings') IS NULL THEN
    RETURN prefix;
  END IF;
  SELECT setting_value INTO raw
  FROM public.system_settings
  WHERE setting_key = 'doc_prefixes';
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN prefix;
  END IF;
  BEGIN
    IF jsonb_typeof(raw::jsonb) = 'object' AND btrim(coalesce(raw::jsonb->>'dcPrefix', '')) <> '' THEN
      prefix := btrim(raw::jsonb->>'dcPrefix');
    END IF;
  EXCEPTION WHEN others THEN
    prefix := 'SIL/DC/26-27/';
  END;
  RETURN prefix;
END;
$$;

CREATE OR REPLACE FUNCTION private.dc_serial(p_number text, p_prefix text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_number, ''))) LIKE lower(p_prefix) || '%'
     AND substring(lower(btrim(p_number)) FROM char_length(lower(p_prefix)) + 1) ~ '^[0-9]+$'
    THEN substring(lower(btrim(p_number)) FROM char_length(lower(p_prefix)) + 1)::bigint
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.allocate_delivery_challan_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prefix text;
  serial bigint := 0;
  candidate text;
  key text;
  guard integer := 0;
  end_user boolean := false;
  auth_present boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'SELECT auth.uid() IS NOT NULL' INTO auth_present;
  END IF;
  end_user := coalesce(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
    OR auth_present;
  IF end_user AND to_regprocedure('private.can_any(text[])') IS NOT NULL THEN
    IF NOT private.can_any(ARRAY['dispatch', 'sales', 'inventory']::text[]) THEN
      RAISE EXCEPTION 'This account cannot issue a delivery challan number'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('samyak-dc-no'));
  prefix := private.dc_number_prefix();

  SELECT COALESCE(MAX(n), 0) INTO serial
  FROM (
    SELECT private.dc_serial(c.challan_no, prefix) AS n
    FROM public.delivery_challans AS c
    UNION ALL
    SELECT private.dc_serial(claim.number_key, lower(prefix)) AS n
    FROM private.delivery_challan_number_claims AS claim
  ) AS used;

  LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate a delivery challan number';
    END IF;
    candidate := prefix || serial::text;
    key := lower(btrim(candidate));
    IF EXISTS (
      SELECT 1 FROM public.delivery_challans AS c
      WHERE lower(btrim(c.challan_no)) = key
    ) OR EXISTS (
      SELECT 1 FROM private.delivery_challan_number_claims AS claim
      WHERE claim.number_key = key
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.delivery_challan_number_claims (number_key, challan_id)
    VALUES (key, NULL);
    RETURN candidate;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_delivery_challan_no(p_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key text := lower(btrim(coalesce(p_number, '')));
BEGIN
  IF key = '' THEN
    RETURN;
  END IF;
  DELETE FROM private.delivery_challan_number_claims
  WHERE number_key = key
    AND challan_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.claim_delivery_challan_no(p_number text, p_challan_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key text := lower(btrim(coalesce(p_number, '')));
  owner text;
BEGIN
  IF key = '' THEN
    RAISE EXCEPTION 'Delivery challan number is required'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO private.delivery_challan_number_claims (number_key, challan_id)
  VALUES (key, p_challan_id)
  ON CONFLICT (number_key) DO NOTHING;
  SELECT challan_id INTO owner
  FROM private.delivery_challan_number_claims
  WHERE number_key = key;
  IF owner IS NULL THEN
    UPDATE private.delivery_challan_number_claims
    SET challan_id = p_challan_id
    WHERE number_key = key
      AND challan_id IS NULL;
    SELECT challan_id INTO owner
    FROM private.delivery_challan_number_claims
    WHERE number_key = key;
  END IF;
  IF owner IS DISTINCT FROM p_challan_id THEN
    RAISE EXCEPTION 'Delivery challan number % is already used. Existing documents keep their numbers.', p_number
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.patch_order_close_json(details jsonb, p_mode text, p_by text, p_at timestamptz, p_reason text, p_warning text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(details, '{}'::jsonb), '{closeMode}', CASE WHEN p_mode IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_mode) END, true),
          '{closedBy}', CASE WHEN p_by IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_by) END, true
        ),
        '{closedAt}', CASE WHEN p_at IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_at) END, true
      ),
      '{closeReason}', CASE WHEN p_reason IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_reason) END, true
    ),
    '{overDispatchWarning}', CASE WHEN p_warning IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_warning) END, true
  );
$$;

CREATE OR REPLACE FUNCTION private.write_order_dispatch_status(
  p_order_id text,
  p_status text,
  p_close_mode text,
  p_closed_by text,
  p_closed_at timestamptz,
  p_close_reason text,
  p_warning text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.orders%ROWTYPE;
  display_name text;
  envelope jsonb := '{}'::jsonb;
  raw_env text;
  delim_at integer;
  details jsonb;
  parsed boolean := false;
BEGIN
  SELECT * INTO row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF row.status IS NOT DISTINCT FROM p_status
     AND row.close_mode IS NOT DISTINCT FROM p_close_mode
     AND row.closed_by IS NOT DISTINCT FROM p_closed_by
     AND row.close_reason IS NOT DISTINCT FROM p_close_reason
     AND row.over_dispatch_warning IS NOT DISTINCT FROM p_warning
     AND (
       (p_closed_at IS NULL AND row.closed_at IS NULL)
       OR (p_closed_at IS NOT NULL AND row.closed_at IS NOT NULL)
     ) THEN
    RETURN;
  END IF;

  display_name := split_part(coalesce(row.job_name, ''), ' ||| ', 1);
  delim_at := position(' ||| ' IN coalesce(row.job_name, ''));
  IF delim_at > 0 THEN
    raw_env := substring(row.job_name FROM delim_at + 5);
    BEGIN
      envelope := raw_env::jsonb;
      parsed := jsonb_typeof(envelope) = 'object';
    EXCEPTION WHEN others THEN
      parsed := false;
    END;
  ELSE
    parsed := true;
  END IF;
  IF NOT parsed OR envelope IS NULL OR jsonb_typeof(envelope) IS DISTINCT FROM 'object' THEN
    envelope := '{}'::jsonb;
  END IF;
  details := private.patch_order_close_json(envelope->'jobDetails', p_close_mode, p_closed_by, p_closed_at, p_close_reason, p_warning);
  IF parsed THEN
    envelope := jsonb_set(envelope, '{jobDetails}', details, true);
  END IF;

  UPDATE public.orders
  SET status = p_status,
      close_mode = p_close_mode,
      closed_by = p_closed_by,
      closed_at = p_closed_at,
      close_reason = p_close_reason,
      over_dispatch_warning = p_warning,
      job_details = private.patch_order_close_json(
        CASE WHEN jsonb_typeof(job_details) = 'object' THEN job_details ELSE '{}'::jsonb END,
        p_close_mode, p_closed_by, p_closed_at, p_close_reason, p_warning
      ),
      job_name = CASE
        WHEN parsed THEN display_name || ' ||| ' || envelope::text
        ELSE job_name
      END
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_order_dispatch_status(p_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.orders%ROWTYPE;
  job_key text;
  enabled_raw text;
  tolerance_raw text;
  enabled boolean := true;
  tolerance numeric := 10;
  dispatched numeric := 0;
  leftover numeric := 0;
  low numeric;
  high numeric;
  ratio numeric;
  in_band boolean := false;
  qualifies boolean := false;
  short boolean := false;
  warning text := null;
  next_status text;
  next_mode text;
  next_by text;
  next_at timestamptz;
  next_reason text;
BEGIN
  SELECT * INTO row FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    SELECT setting_value INTO enabled_raw FROM public.system_settings WHERE setting_key = 'order_auto_close_enabled';
    SELECT setting_value INTO tolerance_raw FROM public.system_settings WHERE setting_key = 'order_close_tolerance_pct';
  END IF;
  IF lower(btrim(coalesce(enabled_raw, ''))) IN ('false', '0') THEN
    enabled := false;
  END IF;
  IF btrim(coalesce(tolerance_raw, '')) ~ '^[0-9]+(\.[0-9]+)?$' AND btrim(tolerance_raw)::numeric > 0 THEN
    tolerance := btrim(tolerance_raw)::numeric;
  END IF;
  IF NOT enabled THEN
    RETURN;
  END IF;
  IF coalesce(row.order_type, '') = 'Rotogravure Cylinder'
     OR coalesce(row.job_details->>'materialFormat', '') = 'Rotogravure Cylinder'
     OR coalesce(row.job_details->>'orderType', '') = 'Rotogravure Cylinder'
     OR lower(coalesce(row.job_details->>'isCylinderOrder', '')) IN ('true', 't') THEN
    RETURN;
  END IF;
  IF coalesce(row.close_mode, '') = 'manual'
     OR coalesce(row.job_details->>'closeMode', '') = 'manual' THEN
    RETURN;
  END IF;
  IF row.status = 'Cancelled' THEN
    RETURN;
  END IF;
  IF row.status = 'Completed' AND coalesce(row.close_mode, '') IS DISTINCT FROM 'auto' THEN
    RETURN;
  END IF;

  job_key := private.clean_job_name(row.job_name);
  dispatched := COALESCE(private.order_dispatched_kg(row.id, job_key), 0);
  IF to_regclass('public.sfg_goods') IS NOT NULL THEN
    SELECT COALESCE(sum(GREATEST(COALESCE(g.available_kg, GREATEST(COALESCE(g.total_net_kg, 0) - COALESCE(g.consumed_kg, 0), 0)), 0)), 0)
      INTO leftover
    FROM public.sfg_goods AS g
    WHERE GREATEST(COALESCE(g.available_kg, GREATEST(COALESCE(g.total_net_kg, 0) - COALESCE(g.consumed_kg, 0), 0)), 0) > 0.05
      AND COALESCE(g.sfg_batch_code, '') NOT LIKE 'SFG-LOT-%'
      AND (
        lower(btrim(regexp_replace(COALESCE(g.order_id, ''), '^(PR-|REC-)', '', 'i')))
          = lower(btrim(regexp_replace(row.id, '^(PR-|REC-)', '', 'i')))
        OR (
          job_key <> ''
          AND private.clean_job_name(g.job_name) = job_key
        )
      );
  END IF;

  low := 1 - (tolerance / 100);
  high := 1 + (tolerance / 100);
  IF COALESCE(row.order_qty_kg, 0) > 0 THEN
    ratio := dispatched / row.order_qty_kg;
  END IF;
  in_band := ratio IS NOT NULL AND ratio + 0.000000001 >= low AND ratio - 0.000000001 <= high;
  qualifies := dispatched > 0 AND in_band AND COALESCE(leftover, 0) <= 0.05 AND COALESCE(row.order_qty_kg, 0) > 0;
  short := dispatched > 0 AND COALESCE(row.order_qty_kg, 0) > 0 AND ratio IS NOT NULL AND ratio < low;
  IF ratio IS NOT NULL AND ratio > high AND dispatched > 0 THEN
    warning := 'Dispatched ' || trim(to_char(dispatched, 'FM999999990.00'))
      || ' kg is above ' || trim(to_char(tolerance, 'FM999990.00'))
      || '% of order quantity ' || trim(to_char(row.order_qty_kg, 'FM999999990.00'))
      || ' kg. The order stays open.';
  END IF;

  IF qualifies THEN
    PERFORM private.write_order_dispatch_status(
      row.id,
      'Completed',
      'auto',
      'auto-close',
      CASE WHEN row.close_mode = 'auto' AND row.closed_at IS NOT NULL THEN row.closed_at ELSE now() END,
      'Dispatched ' || trim(to_char(dispatched, 'FM999999990.00'))
        || ' kg is within ±' || trim(to_char(tolerance, 'FM999990.00'))
        || '% of order quantity ' || trim(to_char(row.order_qty_kg, 'FM999999990.00'))
        || ' kg. Any printed-lot balance stays in the SFG store.',
      NULL
    );
    RETURN;
  END IF;

  IF row.status = 'Completed' AND row.close_mode = 'auto' THEN
    next_status := CASE WHEN short THEN 'Balance Dispatch Pending' ELSE 'In Production' END;
    PERFORM private.write_order_dispatch_status(row.id, next_status, NULL, NULL, NULL, NULL, warning);
    RETURN;
  END IF;

  IF warning IS NOT NULL THEN
    next_status := row.status;
    IF row.status IN ('Balance Dispatch Pending', 'Partially Dispatched') THEN
      next_status := 'In Production';
    END IF;
    PERFORM private.write_order_dispatch_status(
      row.id, next_status, row.close_mode, row.closed_by, row.closed_at, row.close_reason, warning
    );
    RETURN;
  END IF;

  IF short AND row.status IS DISTINCT FROM 'On Hold' AND row.status IS DISTINCT FROM 'Balance Dispatch Pending' THEN
    PERFORM private.write_order_dispatch_status(row.id, 'Balance Dispatch Pending', NULL, NULL, NULL, NULL, NULL);
    RETURN;
  END IF;

  IF row.status IN ('Balance Dispatch Pending', 'Partially Dispatched') AND NOT short AND row.status IS DISTINCT FROM 'On Hold' THEN
    PERFORM private.write_order_dispatch_status(row.id, 'In Production', NULL, NULL, NULL, NULL, NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_orders_dispatch_status(p_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_id text;
BEGIN
  IF p_ids IS NULL THEN
    RETURN;
  END IF;
  FOREACH order_id IN ARRAY p_ids LOOP
    IF order_id IS NOT NULL AND btrim(order_id) <> '' THEN
      PERFORM private.refresh_order_dispatch_status(order_id);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_delivery_challan_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key text;
  others integer := 0;
  old_orders text[] := ARRAY[]::text[];
  new_orders text[] := ARRAY[]::text[];
  added text;
  existing_no text;
  existing_order text;
  order_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_orders := ARRAY(SELECT private.orders_covered_by_document(OLD.payload));
    PERFORM private.refresh_orders_dispatch_status(old_orders);
    RETURN OLD;
  END IF;

  key := lower(btrim(coalesce(NEW.challan_no, '')));
  IF key = '' THEN
    RAISE EXCEPTION 'Delivery challan number is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO others
  FROM public.delivery_challans AS c
  WHERE lower(btrim(c.challan_no)) = key
    AND c.id IS DISTINCT FROM NEW.id;

  IF TG_OP = 'INSERT' AND others > 0 THEN
    RAISE EXCEPTION 'Delivery challan number % is already used. Existing documents keep their numbers.', NEW.challan_no
      USING ERRCODE = '23505';
  END IF;
  IF TG_OP = 'UPDATE'
     AND lower(btrim(coalesce(OLD.challan_no, ''))) IS DISTINCT FROM key
     AND others > 0 THEN
    RAISE EXCEPTION 'Delivery challan number % is already used. Existing documents keep their numbers.', NEW.challan_no
      USING ERRCODE = '23505';
  END IF;
  IF others = 0 THEN
    PERFORM private.claim_delivery_challan_no(NEW.challan_no, NEW.id);
  END IF;
  IF TG_OP = 'UPDATE'
     AND lower(btrim(coalesce(OLD.challan_no, ''))) IS DISTINCT FROM key THEN
    DELETE FROM private.delivery_challan_number_claims
    WHERE number_key = lower(btrim(OLD.challan_no))
      AND (challan_id IS NULL OR challan_id = NEW.id);
  END IF;

  IF private.challan_is_sale(NEW.payload, NEW.challan_nature)
     AND NOT private.challan_is_cancelled(NEW.payload) THEN
    new_orders := ARRAY(SELECT private.orders_covered_by_document(NEW.payload));
    IF TG_OP = 'UPDATE'
       AND private.challan_is_sale(OLD.payload, OLD.challan_nature)
       AND NOT private.challan_is_cancelled(OLD.payload) THEN
      old_orders := ARRAY(SELECT private.orders_covered_by_document(OLD.payload));
    END IF;
    FOREACH added IN ARRAY new_orders LOOP
      IF added = ANY (old_orders) THEN
        CONTINUE;
      END IF;
      SELECT c.challan_no, o.id, private.clean_job_name(o.job_name)
        INTO existing_no, existing_order, order_label
      FROM public.delivery_challans AS c
      JOIN public.orders AS o ON o.id = added
      WHERE c.id IS DISTINCT FROM NEW.id
        AND private.challan_is_sale(c.payload, c.challan_nature)
        AND NOT private.challan_is_cancelled(c.payload)
        AND added IN (SELECT private.orders_covered_by_document(c.payload))
      LIMIT 1;
      IF existing_no IS NOT NULL THEN
        RAISE EXCEPTION 'Job order % (%) already has Sale of Goods delivery challan %. A second challan is not issued for the same order.',
          existing_order, order_label, existing_no
          USING ERRCODE = '23505';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_challan_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ids text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    ids := ids || ARRAY(SELECT private.orders_covered_by_document(OLD.payload));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    ids := ids || ARRAY(SELECT private.orders_covered_by_document(NEW.payload));
  END IF;
  PERFORM private.refresh_orders_dispatch_status(ids);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_dispatch_shipment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ids text[] := ARRAY[]::text[];
  doc jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    doc := CASE
      WHEN OLD.payload IS NOT NULL AND jsonb_typeof(OLD.payload) = 'object' AND OLD.payload <> '{}'::jsonb
        THEN OLD.payload
      ELSE jsonb_build_object('orderId', OLD.order_id, 'jobName', OLD.job_name, 'items', COALESCE(OLD.items, '[]'::jsonb))
    END;
    ids := ids || ARRAY(SELECT private.orders_covered_by_document(doc));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    doc := CASE
      WHEN NEW.payload IS NOT NULL AND jsonb_typeof(NEW.payload) = 'object' AND NEW.payload <> '{}'::jsonb
        THEN NEW.payload
      ELSE jsonb_build_object('orderId', NEW.order_id, 'jobName', NEW.job_name, 'items', COALESCE(NEW.items, '[]'::jsonb))
    END;
    ids := ids || ARRAY(SELECT private.orders_covered_by_document(doc));
  END IF;
  PERFORM private.refresh_orders_dispatch_status(ids);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_delivery_challan_write ON public.delivery_challans;
CREATE TRIGGER guard_delivery_challan_write
  BEFORE INSERT OR UPDATE ON public.delivery_challans
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_delivery_challan_write();

DROP TRIGGER IF EXISTS refresh_challan_order_status ON public.delivery_challans;
CREATE TRIGGER refresh_challan_order_status
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_challans
  FOR EACH ROW
  EXECUTE FUNCTION private.refresh_challan_order_status();

DROP TRIGGER IF EXISTS guard_dispatch_shipment_status ON public.dispatch_shipments;
CREATE TRIGGER guard_dispatch_shipment_status
  AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_shipments
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_dispatch_shipment_status();

REVOKE ALL ON FUNCTION private.clean_job_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_item_kg(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_document_counts(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_document_kg(jsonb, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_document_matches(jsonb, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_kg_for_order(jsonb, numeric, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.order_dispatched_kg(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.challan_is_cancelled(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.challan_is_sale(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.orders_covered_by_document(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dc_number_prefix() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dc_serial(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.claim_delivery_challan_no(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.patch_order_close_json(jsonb, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_order_dispatch_status(text, text, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_order_dispatch_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_orders_dispatch_status(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_delivery_challan_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_challan_order_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_dispatch_shipment_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_delivery_challan_no() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_delivery_challan_no(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.allocate_delivery_challan_no() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.release_delivery_challan_no(text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.order_dispatched_kg(text, text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.allocate_delivery_challan_no() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_delivery_challan_no(text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.order_dispatched_kg(text, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.allocate_delivery_challan_no() TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_delivery_challan_no(text) TO service_role';
  END IF;
END $$;
