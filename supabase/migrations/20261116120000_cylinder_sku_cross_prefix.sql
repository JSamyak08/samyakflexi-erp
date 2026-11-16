-- New cylinder codes are SKU-CYL-NNN, and the number is one past the
-- highest trailing number already stored under any of these prefixes:
--   SKU-CYL-, SKU-2026-, CYL-2026-
-- on cylinders.sku, job_masters.sku_code, job_masters.cylinder_sku,
-- or a reservation. SKU-2026-514 and SKU-CYL-514 are the same number.
-- CYL-2026-0420 is number 420. Gaps below the max are not filled.
-- Job master ids (JM-2026-NNN) are not part of this series.
--
-- Existing rows are not renamed. An update that keeps the same SKU is
-- allowed, including rows that already share a number. A new code, or a
-- code changed onto a number that another cylinder or job master already
-- uses under a different prefix, is rejected. A cylinder may still be
-- saved with the same normalized code its job master already has.
--
-- This file is later than 20261114020000, the latest migration on main
-- when it was added. It replaces the allocator and the guard from
-- 20261110120000. It does not add a unique index.

ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS cylinder_sku text;

CREATE OR REPLACE FUNCTION private.cylinder_sku_serial(value text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN private.normalize_cylinder_sku(value) ~ '^sku-cyl-[0-9]+$'
      THEN (regexp_match(private.normalize_cylinder_sku(value), '^sku-cyl-([0-9]+)$'))[1]::bigint
    WHEN private.normalize_cylinder_sku(value) ~ '^sku-2026-[0-9]+$'
      THEN (regexp_match(private.normalize_cylinder_sku(value), '^sku-2026-([0-9]+)$'))[1]::bigint
    WHEN private.normalize_cylinder_sku(value) ~ '^cyl-2026-[0-9]+$'
      THEN (regexp_match(private.normalize_cylinder_sku(value), '^cyl-2026-([0-9]+)$'))[1]::bigint
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.cylinder_sku_serial(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.cylinder_sku_in_use()
RETURNS TABLE (used_sku text, used_serial bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT src.sku AS used_sku, private.cylinder_sku_serial(src.sku) AS used_serial
  FROM (
    SELECT c.sku FROM public.cylinders c
    UNION ALL
    SELECT j.sku_code FROM public.job_masters j
    UNION ALL
    SELECT j.cylinder_sku FROM public.job_masters j
    UNION ALL
    SELECT r.sku FROM private.cylinder_sku_reservations r
  ) AS src(sku)
  WHERE private.cylinder_sku_serial(src.sku) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION private.cylinder_sku_in_use() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.guard_cylinder_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  incoming text;
  prior text;
  incoming_serial bigint;
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

  incoming_serial := private.cylinder_sku_serial(NEW.sku);
  IF incoming_serial IS NOT NULL AND EXISTS (
    SELECT 1
    FROM (
      SELECT private.cylinder_sku_serial(c.sku) AS n,
             private.normalize_cylinder_sku(c.sku) AS code
      FROM public.cylinders c
      WHERE c.id IS DISTINCT FROM NEW.id
      UNION ALL
      SELECT private.cylinder_sku_serial(j.sku_code),
             private.normalize_cylinder_sku(j.sku_code)
      FROM public.job_masters j
      UNION ALL
      SELECT private.cylinder_sku_serial(j.cylinder_sku),
             private.normalize_cylinder_sku(j.cylinder_sku)
      FROM public.job_masters j
      UNION ALL
      SELECT private.cylinder_sku_serial(r.sku),
             private.normalize_cylinder_sku(r.sku)
      FROM private.cylinder_sku_reservations r
      WHERE private.normalize_cylinder_sku(r.sku) IS DISTINCT FROM incoming
    ) AS used
    WHERE used.n = incoming_serial
      AND used.code IS NOT NULL
      AND used.code IS DISTINCT FROM incoming
  ) THEN
    RAISE EXCEPTION 'SKU number % is already used by another cylinder code', incoming_serial
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
  next_serial bigint := 0;
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

  SELECT COALESCE(MAX(used.used_serial), 0)
    INTO next_serial
  FROM private.cylinder_sku_in_use() AS used;

  WHILE coalesce(array_length(issued, 1), 0) < requested LOOP
    next_serial := next_serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate a cylinder SKU';
    END IF;
    candidate := 'SKU-CYL-' || lpad(next_serial::text, GREATEST(length(next_serial::text), 3), '0');
    IF EXISTS (
      SELECT 1
      FROM private.cylinder_sku_in_use() AS taken
      WHERE taken.used_serial = next_serial
         OR private.normalize_cylinder_sku(taken.used_sku) = private.normalize_cylinder_sku(candidate)
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
