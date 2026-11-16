-- OCN numbers and quotation numbers were taken from a browser copy of
-- doc_prefixes (ocnCounter / qtnCounter). That copy is written back as a
-- whole, so a second screen can move the series backwards. The quotation
-- counter is stuck at 501, and SIL/QTN/26-27/501 was issued twice.
-- Opening the convert window also spent an OCN number before anyone confirmed.
--
-- allocate_ocn_number() and allocate_quotation_number() issue the next
-- number after the highest serial already stored for the current Indian
-- financial year (1 April–31 March, Asia/Kolkata), or already reserved.
-- They do not read system_settings, localStorage, or the stuck counters.
-- A counter of 501 does not matter when SIL/QTN/26-27/501 already exists:
-- the next quotation number is SIL/QTN/26-27/502.
-- Gaps below the max are left empty. A reservation that is never inserted
-- stays reserved so that number cannot be issued again.
--
-- The prefix is SIL/OCN/YY-YY/ or SIL/QTN/YY-YY/. Only numbers with that
-- exact prefix count. A number from another year does not move this year.
--
-- Grants match allocate_order_id: SECURITY DEFINER, empty search_path,
-- EXECUTE for authenticated and service_role, nothing for anon or PUBLIC.
-- This file is later than 20261116120000, the latest migration when it
-- was added. It does not change existing rows.

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

CREATE TABLE IF NOT EXISTS private.ocn_number_reservations (
  ocn_number text PRIMARY KEY,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.quotation_number_reservations (
  quotation_no text PRIMARY KEY,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.ocn_number_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.quotation_number_reservations FROM PUBLIC, anon, authenticated;

-- Indian financial year label, e.g. 26-27 for 16 Nov 2026 IST.
CREATE OR REPLACE FUNCTION private.doc_fy_suffix(at_time timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    lpad((
      (
        EXTRACT(YEAR FROM (at_time AT TIME ZONE 'Asia/Kolkata'))::int
        - CASE
            WHEN EXTRACT(MONTH FROM (at_time AT TIME ZONE 'Asia/Kolkata'))::int >= 4 THEN 0
            ELSE 1
          END
      ) % 100
    )::text, 2, '0')
    || '-'
    || lpad((
      (
        EXTRACT(YEAR FROM (at_time AT TIME ZONE 'Asia/Kolkata'))::int
        - CASE
            WHEN EXTRACT(MONTH FROM (at_time AT TIME ZONE 'Asia/Kolkata'))::int >= 4 THEN 0
            ELSE 1
          END
        + 1
      ) % 100
    )::text, 2, '0');
$$;

REVOKE ALL ON FUNCTION private.doc_fy_suffix(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.doc_series_serial(value text, prefix text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN prefix IS NOT NULL
     AND prefix <> ''
     AND lower(btrim(COALESCE(value, ''))) ~ ('^' || lower(prefix) || '[0-9]+$')
      THEN (regexp_match(lower(btrim(value)), '[0-9]+$'))[1]::bigint
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.doc_series_serial(text, text) FROM PUBLIC;

-- The job name envelope is "Title ||| {json}". A bad envelope is ignored
-- so one broken row cannot stop numbering. The same number is also stored
-- in orders.job_details, which is scanned separately.
CREATE OR REPLACE FUNCTION private.order_name_envelope(job_name text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw text;
BEGIN
  IF job_name IS NULL OR position(' ||| ' IN job_name) = 0 THEN
    RETURN NULL;
  END IF;
  raw := substring(job_name FROM position(' ||| ' IN job_name) + 5);
  BEGIN
    RETURN raw::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.order_name_envelope(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.caller_may_allocate_document()
RETURNS void
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
    IF NOT (
      private.has_role(ARRAY['Plant Manager']::text[])
      OR private.can_any(ARRAY[
        'job_punching', 'orders', 'sales', 'inventory', 'dispatch', 'cylinders'
      ]::text[])
    ) THEN
      RAISE EXCEPTION 'This account cannot allocate a document number'
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.caller_may_allocate_document() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.allocate_ocn_number(p_count integer DEFAULT 1)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested integer := LEAST(GREATEST(COALESCE(p_count, 1), 1), 500);
  issued text[] := ARRAY[]::text[];
  prefix text;
  serial bigint := 0;
  candidate text;
  guard integer := 0;
BEGIN
  PERFORM private.caller_may_allocate_document();
  PERFORM pg_advisory_xact_lock(hashtext('samyak-ocn-number'));

  prefix := 'SIL/OCN/' || private.doc_fy_suffix(now()) || '/';

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT private.doc_series_serial(c.ocn_number, prefix) AS n
    FROM public.order_confirmations c
    UNION ALL
    SELECT private.doc_series_serial(c.id, prefix)
    FROM public.order_confirmations c
    UNION ALL
    SELECT private.doc_series_serial(o.ocn_number, prefix)
    FROM public.orders o
    UNION ALL
    SELECT private.doc_series_serial(o.ocn_id, prefix)
    FROM public.orders o
    UNION ALL
    SELECT private.doc_series_serial(o.job_details ->> 'ocnNumber', prefix)
    FROM public.orders o
    UNION ALL
    SELECT private.doc_series_serial(o.job_details ->> 'ocnId', prefix)
    FROM public.orders o
    UNION ALL
    SELECT private.doc_series_serial(
      private.order_name_envelope(o.job_name) -> 'jobDetails' ->> 'ocnNumber',
      prefix
    )
    FROM public.orders o
    UNION ALL
    SELECT private.doc_series_serial(
      private.order_name_envelope(o.job_name) -> 'jobDetails' ->> 'ocnId',
      prefix
    )
    FROM public.orders o
    UNION ALL
    SELECT private.doc_series_serial(r.ocn_number, prefix)
    FROM private.ocn_number_reservations r
  ) AS used;

  WHILE coalesce(array_length(issued, 1), 0) < requested LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate an OCN number';
    END IF;
    candidate := prefix || serial::text;
    IF EXISTS (
      SELECT 1 FROM public.order_confirmations c
      WHERE lower(btrim(c.ocn_number)) = lower(candidate)
         OR lower(btrim(c.id)) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE lower(btrim(COALESCE(o.ocn_number, ''))) = lower(candidate)
         OR lower(btrim(COALESCE(o.ocn_id, ''))) = lower(candidate)
         OR lower(btrim(COALESCE(o.job_details ->> 'ocnNumber', ''))) = lower(candidate)
         OR lower(btrim(COALESCE(o.job_details ->> 'ocnId', ''))) = lower(candidate)
         OR lower(btrim(COALESCE(private.order_name_envelope(o.job_name) -> 'jobDetails' ->> 'ocnNumber', ''))) = lower(candidate)
         OR lower(btrim(COALESCE(private.order_name_envelope(o.job_name) -> 'jobDetails' ->> 'ocnId', ''))) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM private.ocn_number_reservations r
      WHERE lower(btrim(r.ocn_number)) = lower(candidate)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.ocn_number_reservations (ocn_number) VALUES (candidate);
    issued := issued || candidate;
  END LOOP;

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_ocn_number(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_ocn_number(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.allocate_quotation_number(p_count integer DEFAULT 1)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested integer := LEAST(GREATEST(COALESCE(p_count, 1), 1), 500);
  issued text[] := ARRAY[]::text[];
  prefix text;
  serial bigint := 0;
  candidate text;
  guard integer := 0;
BEGIN
  PERFORM private.caller_may_allocate_document();
  PERFORM pg_advisory_xact_lock(hashtext('samyak-quotation-number'));

  prefix := 'SIL/QTN/' || private.doc_fy_suffix(now()) || '/';

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT private.doc_series_serial(q.quotation_no, prefix) AS n
    FROM public.sales_quotations q
    UNION ALL
    SELECT private.doc_series_serial(r.quotation_no, prefix)
    FROM private.quotation_number_reservations r
  ) AS used;

  WHILE coalesce(array_length(issued, 1), 0) < requested LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate a quotation number';
    END IF;
    candidate := prefix || serial::text;
    IF EXISTS (
      SELECT 1 FROM public.sales_quotations q
      WHERE lower(btrim(q.quotation_no)) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM private.quotation_number_reservations r
      WHERE lower(btrim(r.quotation_no)) = lower(candidate)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.quotation_number_reservations (quotation_no) VALUES (candidate);
    issued := issued || candidate;
  END LOOP;

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_quotation_number(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_quotation_number(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.consume_ocn_number_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.ocn_number_reservations
  WHERE lower(btrim(ocn_number)) = lower(btrim(NEW.ocn_number))
     OR lower(btrim(ocn_number)) = lower(btrim(NEW.id));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_ocn_number_reservation() FROM PUBLIC;

DROP TRIGGER IF EXISTS order_confirmations_consume_number_reservation ON public.order_confirmations;
CREATE TRIGGER order_confirmations_consume_number_reservation
  AFTER INSERT ON public.order_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION private.consume_ocn_number_reservation();

CREATE OR REPLACE FUNCTION private.consume_quotation_number_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.quotation_number_reservations
  WHERE lower(btrim(quotation_no)) = lower(btrim(NEW.quotation_no));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_quotation_number_reservation() FROM PUBLIC;

DROP TRIGGER IF EXISTS sales_quotations_consume_number_reservation ON public.sales_quotations;
CREATE TRIGGER sales_quotations_consume_number_reservation
  AFTER INSERT OR UPDATE OF quotation_no ON public.sales_quotations
  FOR EACH ROW
  EXECUTE FUNCTION private.consume_quotation_number_reservation();
