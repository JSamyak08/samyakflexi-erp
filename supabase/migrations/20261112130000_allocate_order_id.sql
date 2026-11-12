-- Order numbers were taken from a browser copy of doc_prefixes.orderCounter.
-- That copy defaults to 101 and the whole settings object is written back,
-- so a second screen can move the series backwards and the next save
-- upserts over a real ORD-YYYY-NNN row.
--
-- allocate_order_id() issues the next ORD-<calendar year>-NNN after the
-- highest serial already stored for that year, or already reserved.
-- It does not read system_settings, localStorage, or orderCounter.
-- A serial of 102 in settings does not matter when ORD-2026-185 exists:
-- the next number is ORD-2026-186.
-- Gaps below the max are left empty. A reservation that is never inserted
-- stays reserved so that number cannot be issued again.
--
-- Grants match allocate_job_master_id: SECURITY DEFINER, empty search_path,
-- EXECUTE for authenticated and service_role, nothing for anon or PUBLIC.

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

CREATE TABLE IF NOT EXISTS private.order_id_reservations (
  order_id text PRIMARY KEY,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.order_id_reservations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.allocate_order_id(p_count integer DEFAULT 1)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested integer := LEAST(GREATEST(COALESCE(p_count, 1), 1), 500);
  issued text[] := ARRAY[]::text[];
  v_year text := EXTRACT(YEAR FROM CURRENT_DATE)::int::text;
  year_pattern text;
  serial bigint := 0;
  candidate text;
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
    IF NOT (
      private.has_role(ARRAY['Plant Manager']::text[])
      OR private.can_any(ARRAY[
        'job_punching', 'orders', 'sales', 'inventory', 'dispatch', 'cylinders'
      ]::text[])
    ) THEN
      RAISE EXCEPTION 'This account cannot allocate an order id'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('samyak-order-id'));

  year_pattern := '^ord-' || v_year || '-[0-9]+$';

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT CASE
      WHEN lower(btrim(j.id)) ~ year_pattern
        THEN (regexp_match(lower(btrim(j.id)), '^ord-[0-9]{4}-([0-9]+)$'))[1]::bigint
    END AS n
    FROM public.orders j
    UNION ALL
    SELECT CASE
      WHEN lower(btrim(r.order_id)) ~ year_pattern
        THEN (regexp_match(lower(btrim(r.order_id)), '^ord-[0-9]{4}-([0-9]+)$'))[1]::bigint
    END
    FROM private.order_id_reservations r
  ) AS used;

  WHILE coalesce(array_length(issued, 1), 0) < requested LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate an order id';
    END IF;
    candidate := 'ORD-' || v_year || '-' || lpad(serial::text, GREATEST(length(serial::text), 3), '0');
    IF EXISTS (
      SELECT 1 FROM public.orders j WHERE lower(btrim(j.id)) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM private.order_id_reservations r
      WHERE lower(btrim(r.order_id)) = lower(candidate)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.order_id_reservations (order_id) VALUES (candidate);
    issued := issued || candidate;
  END LOOP;

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_order_id(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_order_id(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.consume_order_id_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.order_id_reservations
  WHERE lower(btrim(order_id)) = lower(btrim(NEW.id));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_order_id_reservation() FROM PUBLIC;

DROP TRIGGER IF EXISTS orders_consume_id_reservation ON public.orders;
CREATE TRIGGER orders_consume_id_reservation
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.consume_order_id_reservation();
