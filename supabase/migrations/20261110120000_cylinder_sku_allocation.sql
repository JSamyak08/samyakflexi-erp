-- Cylinder SKU codes stay unique for new rows, without renaming anything
-- already stored.
--
-- Production was checked read-only before this migration. These normalized
-- SKUs are already shared by more than one row, so a unique index would fail:
--   SKU-CYL-495 (six rows, same job) and CYL-2026-173 (two rows, same job).
-- Those codes are left exactly as they are. This trigger blocks a new
-- insert that repeats a code. An update that keeps the same code is
-- allowed, including rows that already share a code. Changing a code is
-- allowed only when no other cylinder already uses the new code, so one
-- set cannot be overwritten with another's SKU.
--
-- allocate_cylinder_sku() issues the next SKU-CYL serial after the highest
-- one in the whole cylinders table (every status), skipping any serial that
-- is already stored or already reserved. The advisory lock and the reservation
-- row make two callers receive different codes. A cancelled reservation is a
-- gap; gaps below the max are not filled.

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

CREATE TABLE IF NOT EXISTS private.cylinder_sku_reservations (
  sku text PRIMARY KEY,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.cylinder_sku_reservations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.normalize_cylinder_sku(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

REVOKE ALL ON FUNCTION private.normalize_cylinder_sku(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.cylinder_sku_serial(value text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN private.normalize_cylinder_sku(value) ~ '^sku-cyl-[0-9]+$'
      THEN (regexp_match(private.normalize_cylinder_sku(value), '^sku-cyl-([0-9]+)$'))[1]::bigint
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.cylinder_sku_serial(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.guard_cylinder_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  incoming text;
  prior text;
BEGIN
  incoming := private.normalize_cylinder_sku(NEW.sku);
  IF TG_OP = 'UPDATE' THEN
    prior := private.normalize_cylinder_sku(OLD.sku);
    IF incoming = prior THEN
      NEW.sku := OLD.sku;
      RETURN NEW;
    END IF;
  END IF;

  IF incoming = '' THEN
    RAISE EXCEPTION 'Cylinder SKU is required'
      USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cylinders AS existing
    WHERE private.normalize_cylinder_sku(existing.sku) = incoming
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'SKU Code "%" already exists for another cylinder set', btrim(NEW.sku)
      USING ERRCODE = '23505';
  END IF;

  DELETE FROM private.cylinder_sku_reservations AS reserved
  WHERE private.normalize_cylinder_sku(reserved.sku) = incoming;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_cylinder_sku() FROM PUBLIC;

DROP TRIGGER IF EXISTS cylinders_guard_sku ON public.cylinders;
CREATE TRIGGER cylinders_guard_sku
  BEFORE INSERT OR UPDATE ON public.cylinders
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_cylinder_sku();

CREATE OR REPLACE FUNCTION public.allocate_cylinder_sku(p_count integer DEFAULT 1)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested integer := LEAST(GREATEST(COALESCE(p_count, 1), 1), 500);
  issued text[] := ARRAY[]::text[];
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
  IF end_user AND to_regprocedure('private.has_role(text[])') IS NOT NULL THEN
    IF NOT private.has_role(ARRAY['Plant Manager']::text[]) THEN
      RAISE EXCEPTION 'This account cannot allocate a cylinder SKU'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('samyak-cylinder-sku'));

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT private.cylinder_sku_serial(c.sku) AS n
    FROM public.cylinders c
    UNION ALL
    SELECT private.cylinder_sku_serial(r.sku)
    FROM private.cylinder_sku_reservations r
  ) AS used;

  WHILE coalesce(array_length(issued, 1), 0) < requested LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate a cylinder SKU';
    END IF;
    candidate := 'SKU-CYL-' || lpad(serial::text, GREATEST(length(serial::text), 3), '0');
    IF EXISTS (
      SELECT 1
      FROM public.cylinders c
      WHERE private.normalize_cylinder_sku(c.sku) = private.normalize_cylinder_sku(candidate)
    ) OR EXISTS (
      SELECT 1
      FROM private.cylinder_sku_reservations r
      WHERE private.normalize_cylinder_sku(r.sku) = private.normalize_cylinder_sku(candidate)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.cylinder_sku_reservations (sku) VALUES (candidate);
    issued := issued || candidate;
  END LOOP;

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_cylinder_sku(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_cylinder_sku(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_cylinder_sku(p_sku text)
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
  IF end_user AND to_regprocedure('private.has_role(text[])') IS NOT NULL THEN
    IF NOT private.has_role(ARRAY['Plant Manager']::text[]) THEN
      RAISE EXCEPTION 'This account cannot release a cylinder SKU'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM private.cylinder_sku_reservations AS reserved
  WHERE private.normalize_cylinder_sku(reserved.sku) = private.normalize_cylinder_sku(p_sku)
    AND NOT EXISTS (
      SELECT 1
      FROM public.cylinders AS existing
      WHERE private.normalize_cylinder_sku(existing.sku) = private.normalize_cylinder_sku(p_sku)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.release_cylinder_sku(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_cylinder_sku(text) TO authenticated, service_role;

-- Job master ids were JM-2026-(row count + 101). That number is reused
-- whenever the loaded list is shorter than the highest id already stored,
-- so several cylinder sets were stamped with the same job master id.
-- allocate_job_master_id() issues the next free JM-2026 number after the
-- highest one in the whole job_masters table.

CREATE TABLE IF NOT EXISTS private.job_master_id_reservations (
  job_master_id text PRIMARY KEY,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.job_master_id_reservations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.allocate_job_master_id(p_count integer DEFAULT 1)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested integer := LEAST(GREATEST(COALESCE(p_count, 1), 1), 500);
  issued text[] := ARRAY[]::text[];
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
      OR private.can_any(ARRAY['job_masters', 'cylinders']::text[])
    ) THEN
      RAISE EXCEPTION 'This account cannot allocate a job master id'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('samyak-job-master-id'));

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT CASE
      WHEN lower(btrim(j.id)) ~ '^jm-2026-[0-9]+$'
        THEN (regexp_match(lower(btrim(j.id)), '^jm-2026-([0-9]+)$'))[1]::bigint
    END AS n
    FROM public.job_masters j
    UNION ALL
    SELECT CASE
      WHEN lower(btrim(r.job_master_id)) ~ '^jm-2026-[0-9]+$'
        THEN (regexp_match(lower(btrim(r.job_master_id)), '^jm-2026-([0-9]+)$'))[1]::bigint
    END
    FROM private.job_master_id_reservations r
  ) AS used;

  WHILE coalesce(array_length(issued, 1), 0) < requested LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate a job master id';
    END IF;
    candidate := 'JM-2026-' || lpad(serial::text, GREATEST(length(serial::text), 3), '0');
    IF EXISTS (
      SELECT 1 FROM public.job_masters j WHERE lower(btrim(j.id)) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM private.job_master_id_reservations r
      WHERE lower(btrim(r.job_master_id)) = lower(candidate)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.job_master_id_reservations (job_master_id) VALUES (candidate);
    issued := issued || candidate;
  END LOOP;

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_job_master_id(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_job_master_id(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.consume_job_master_id_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.job_master_id_reservations
  WHERE lower(btrim(job_master_id)) = lower(btrim(NEW.id));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_job_master_id_reservation() FROM PUBLIC;

DROP TRIGGER IF EXISTS job_masters_consume_id_reservation ON public.job_masters;
CREATE TRIGGER job_masters_consume_id_reservation
  AFTER INSERT ON public.job_masters
  FOR EACH ROW
  EXECUTE FUNCTION private.consume_job_master_id_reservation();
