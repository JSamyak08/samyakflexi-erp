-- Packing list numbers were taken from a browser copy of doc_prefixes.plCounter.
-- A fresh browser still has the default 606130, so Create Packing List
-- offered PL-2026-606130 and the save upserted that dispatch_id. The
-- existing list was replaced.
--
-- allocate_packing_list_no() issues the next PL-<calendar year>-NNNNNN
-- after the highest serial already stored or reserved for that year.
-- The year is the calendar year in Asia/Kolkata. A hash-style id such as
-- PL-2026-b8dd2a72 is not part of the series. A number from another year
-- does not move this year. Gaps below the max are left empty. A
-- reservation that is never inserted stays reserved until it is released,
-- so two saves at the same time cannot receive the same number.
--
-- suggestedDispatchId from the browser is ignored. Dispatch Packing
-- consumption that has to open a list uses the same allocator.
--
-- Saving a new list is an insert. Updating a list keeps its number and
-- its id. An insert or upsert that would replace an existing list is
-- rejected. Existing rows are not renumbered. A case-insensitive unique
-- index is added only when no duplicate numbers are already stored.
--
-- This file is 20261121130000, after 20261121120000_allow_accounts_role_in_users.sql.
-- Tables, functions, and columns that production already uses stay in place.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT USAGE ON SCHEMA private TO postgres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA private TO service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS private.packing_list_number_claims (
  number_key text PRIMARY KEY,
  packing_list_id text,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.packing_list_number_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.packing_list_year()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata'), 'YYYY');
$$;

REVOKE ALL ON FUNCTION private.packing_list_year() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.packing_list_serial(p_number text, p_year text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce(p_year, '') ~ '^[0-9]{4}$'
     AND lower(btrim(coalesce(p_number, ''))) ~ ('^pl-' || p_year || '-[0-9]+$')
    THEN (regexp_match(lower(btrim(p_number)), '[0-9]+$'))[1]::bigint
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.packing_list_serial(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.allocate_packing_list_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year text;
  serial bigint := 0;
  candidate text;
  key text;
  guard integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('samyak-pl-no'));
  v_year := private.packing_list_year();

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT private.packing_list_serial(s.dispatch_id, v_year) AS n
    FROM public.dispatch_shipments AS s
    UNION ALL
    SELECT private.packing_list_serial(s.payload ->> 'dispatchId', v_year)
    FROM public.dispatch_shipments AS s
    UNION ALL
    SELECT private.packing_list_serial(claim.number_key, v_year)
    FROM private.packing_list_number_claims AS claim
  ) AS used;

  LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate a packing list number';
    END IF;
    candidate := 'PL-' || v_year || '-' || lpad(serial::text, GREATEST(length(serial::text), 6), '0');
    key := lower(btrim(candidate));
    IF EXISTS (
      SELECT 1
      FROM public.dispatch_shipments AS s
      WHERE lower(btrim(s.dispatch_id)) = key
         OR lower(btrim(coalesce(s.payload ->> 'dispatchId', ''))) = key
    ) OR EXISTS (
      SELECT 1
      FROM private.packing_list_number_claims AS claim
      WHERE claim.number_key = key
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.packing_list_number_claims (number_key, packing_list_id)
    VALUES (key, NULL);
    RETURN candidate;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_packing_list_no() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.allocate_packing_list_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
    IF NOT private.can_any(ARRAY['dispatch']::text[]) THEN
      RAISE EXCEPTION 'This account cannot issue a packing list number'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN private.allocate_packing_list_no();
END;
$$;

CREATE OR REPLACE FUNCTION public.release_packing_list_no(p_number text)
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
  DELETE FROM private.packing_list_number_claims
  WHERE number_key = key
    AND packing_list_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.claim_packing_list_no(p_number text, p_row_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key text := lower(btrim(coalesce(p_number, '')));
  owner text;
  row_id text := nullif(btrim(coalesce(p_row_id, '')), '');
BEGIN
  IF key = '' OR row_id IS NULL THEN
    RAISE EXCEPTION 'Packing list number is required'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.dispatch_shipments AS s
    WHERE lower(btrim(s.dispatch_id)) = key
      AND btrim(coalesce(s.id, '')) IS DISTINCT FROM row_id
  ) THEN
    RAISE EXCEPTION 'Packing list number % is already used. Existing lists keep their numbers.', p_number
      USING ERRCODE = '23505';
  END IF;
  INSERT INTO private.packing_list_number_claims (number_key, packing_list_id)
  VALUES (key, row_id)
  ON CONFLICT (number_key) DO NOTHING;
  SELECT packing_list_id
    INTO owner
  FROM private.packing_list_number_claims
  WHERE number_key = key;
  IF owner IS NULL THEN
    UPDATE private.packing_list_number_claims
    SET packing_list_id = row_id
    WHERE number_key = key
      AND packing_list_id IS NULL;
    SELECT packing_list_id
      INTO owner
    FROM private.packing_list_number_claims
    WHERE number_key = key;
  END IF;
  IF owner IS DISTINCT FROM row_id THEN
    RAISE EXCEPTION 'Packing list number % is already used. Existing lists keep their numbers.', p_number
      USING ERRCODE = '23505';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.claim_packing_list_no(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.guard_packing_list_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key text;
  row_id text;
BEGIN
  key := lower(btrim(coalesce(NEW.dispatch_id, '')));
  IF key = '' THEN
    RAISE EXCEPTION 'Packing list number is required'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF lower(btrim(coalesce(OLD.dispatch_id, ''))) IS DISTINCT FROM key THEN
      RAISE EXCEPTION 'Packing list number % cannot be changed. Existing lists keep their numbers.', OLD.dispatch_id
        USING ERRCODE = '23505';
    END IF;
    IF nullif(btrim(coalesce(OLD.id, '')), '') IS NOT NULL
       AND btrim(coalesce(NEW.id, '')) IS DISTINCT FROM btrim(OLD.id) THEN
      RAISE EXCEPTION 'Saving a new packing list cannot overwrite %. Existing lists keep their numbers.', OLD.dispatch_id
        USING ERRCODE = '23505';
    END IF;
    NEW.dispatch_id := OLD.dispatch_id;
    IF nullif(btrim(coalesce(OLD.id, '')), '') IS NOT NULL THEN
      NEW.id := OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  row_id := coalesce(nullif(btrim(coalesce(NEW.id, '')), ''), btrim(NEW.dispatch_id));
  PERFORM private.claim_packing_list_no(NEW.dispatch_id, row_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_packing_list_write() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_packing_list_write ON public.dispatch_shipments;
CREATE TRIGGER guard_packing_list_write
  BEFORE INSERT OR UPDATE ON public.dispatch_shipments
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_packing_list_write();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.dispatch_shipments
    GROUP BY lower(btrim(dispatch_id))
    HAVING count(*) > 1
  ) THEN
    EXECUTE $index$
      CREATE UNIQUE INDEX IF NOT EXISTS dispatch_shipments_number_ci_uidx
      ON public.dispatch_shipments (lower(btrim(dispatch_id)))
    $index$;
  END IF;
END $$;

-- New lists opened by Dispatch Packing consumption take the next series
-- number. A browser suggestion is not used, including when that suggestion
-- is already stored.
CREATE OR REPLACE FUNCTION private.record_dispatch_packing_consumption(p_entry jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry_id text;
  v_order_id text;
  v_job_name text;
  v_consumed numeric;
  v_consumed_at timestamptz;
  v_target_id text;
  v_candidate text;
  v_created boolean := false;
BEGIN
  IF coalesce(private.app_role(), '') = ''
     OR NOT private.can_any(ARRAY['dispatch', 'sfg_store', 'production_records', 'inventory']) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'consumption entry is required';
  END IF;
  IF coalesce(p_entry->>'targetProcess', 'Dispatch Packing') <> 'Dispatch Packing' THEN
    RAISE EXCEPTION 'only Dispatch Packing consumption is recorded on a packing list';
  END IF;

  v_entry_id := btrim(coalesce(p_entry->>'id', ''));
  v_order_id := btrim(coalesce(p_entry->>'orderId', ''));
  v_job_name := btrim(coalesce(p_entry->>'jobName', ''));
  IF v_entry_id = '' THEN
    RAISE EXCEPTION 'consumption id is required';
  END IF;
  BEGIN
    v_consumed := round(coalesce((p_entry->>'consumedKg')::numeric, 0), 2);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'consumed weight must be greater than 0 kg';
  END;
  IF v_consumed <= 0 THEN
    RAISE EXCEPTION 'consumed weight must be greater than 0 kg';
  END IF;
  IF v_order_id = '' AND v_job_name = '' THEN
    RAISE EXCEPTION 'order or job is required';
  END IF;
  BEGIN
    v_consumed_at := coalesce(nullif(p_entry->>'consumedAt', '')::timestamptz, now());
  EXCEPTION WHEN others THEN
    v_consumed_at := now();
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(nullif(v_order_id, ''), lower(v_job_name)), 0));

  SELECT c.packing_list_id INTO v_target_id
  FROM public.packing_list_consumptions c
  WHERE c.id = v_entry_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'created', false,
      'dispatchId', v_target_id,
      'shipment', private.packing_shipment_json(v_target_id)
    );
  END IF;

  SELECT ds.dispatch_id INTO v_target_id
  FROM public.dispatch_shipments ds
  WHERE ds.packing_status = 'Open'
    AND (
      (v_order_id <> '' AND ds.order_id = v_order_id)
      OR (v_order_id = '' AND lower(ds.job_name) = lower(v_job_name))
    )
  ORDER BY ds.created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_target_id IS NULL THEN
    v_candidate := private.allocate_packing_list_no();
    INSERT INTO public.dispatch_shipments (
      dispatch_id, id, order_id, job_name, client_name, vehicle_no, lr_no,
      transporter_name, po_no, invoice_no, dispatch_date, total_rolls,
      total_net_weight_kg, total_gross_weight_kg, items, hide_branding,
      packing_status, payload, created_at, updated_at
    ) VALUES (
      v_candidate,
      'DISP-PL-' || v_entry_id,
      nullif(v_order_id, ''),
      coalesce(nullif(v_job_name, ''), 'Finished Goods Job'),
      coalesce(nullif(btrim(coalesce(p_entry->>'clientName', '')), ''), 'Customer'),
      '',
      '',
      '',
      coalesce(p_entry->>'poNo', ''),
      '',
      v_consumed_at,
      0,
      0,
      0,
      '[]'::jsonb,
      false,
      'Open',
      '{}'::jsonb,
      v_consumed_at,
      now()
    );
    v_target_id := v_candidate;
    v_created := true;
  END IF;

  INSERT INTO public.packing_list_consumptions (
    id, packing_list_id, order_id, job_name, job_code, barcode, consumed_kg,
    operator_name, consumed_by, consumed_at, shift, target_machine, notes
  ) VALUES (
    v_entry_id,
    v_target_id,
    nullif(v_order_id, ''),
    nullif(v_job_name, ''),
    nullif(btrim(coalesce(p_entry->>'jobCode', '')), ''),
    nullif(btrim(coalesce(p_entry->>'barcode', '')), ''),
    v_consumed,
    nullif(btrim(coalesce(p_entry->>'operatorName', '')), ''),
    nullif(btrim(coalesce(p_entry->>'consumedBy', '')), ''),
    v_consumed_at,
    nullif(btrim(coalesce(p_entry->>'shift', '')), ''),
    nullif(btrim(coalesce(p_entry->>'targetMachine', '')), ''),
    nullif(btrim(coalesce(p_entry->>'notes', '')), '')
  );

  UPDATE public.dispatch_shipments
  SET payload = private.packing_shipment_json(v_target_id),
      updated_at = now()
  WHERE dispatch_id = v_target_id;

  RETURN jsonb_build_object(
    'idempotent', false,
    'created', v_created,
    'dispatchId', v_target_id,
    'shipment', private.packing_shipment_json(v_target_id)
  );
EXCEPTION WHEN unique_violation THEN
  SELECT c.packing_list_id INTO v_target_id
  FROM public.packing_list_consumptions c
  WHERE c.id = v_entry_id;
  IF v_target_id IS NULL THEN
    RAISE;
  END IF;
  RETURN jsonb_build_object(
    'idempotent', true,
    'created', false,
    'dispatchId', v_target_id,
    'shipment', private.packing_shipment_json(v_target_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_packing_list_no() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_packing_list_no(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_packing_list_no() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_packing_list_no(text) TO authenticated, service_role;
