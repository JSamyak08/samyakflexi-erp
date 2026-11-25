-- A deleted ORD-YYYY-NNN was issued again because allocate_order_id only
-- looked at live orders and unused reservations. The next save then found
-- SFG-LOT-{order id} from the deleted order and merged the new job into it.
--
-- Retired ids and a per-year high-water mark keep a used number from coming
-- back. A printed lot is updated only when it belongs to the current order
-- row. Deleting an order is refused while SFG/FG stock is still on hand.

CREATE TABLE IF NOT EXISTS private.retired_order_ids (
  order_id text PRIMARY KEY,
  retired_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  reason text NOT NULL DEFAULT 'deleted'
);

CREATE TABLE IF NOT EXISTS private.order_id_high_water (
  year integer PRIMARY KEY,
  serial bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

REVOKE ALL ON TABLE private.retired_order_ids FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.order_id_high_water FROM PUBLIC, anon, authenticated;
ALTER TABLE private.retired_order_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.order_id_high_water ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.order_id_serial(p_id text, p_year text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_id, ''))) ~ ('^ord-' || coalesce(p_year, '') || '-[0-9]+$')
      THEN (regexp_match(lower(btrim(p_id)), '^ord-[0-9]{4}-([0-9]+)$'))[1]::bigint
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.order_id_serial(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.note_retired_order_id(p_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year text;
  v_serial bigint;
BEGIN
  IF nullif(btrim(coalesce(p_order_id, '')), '') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO private.retired_order_ids (order_id, reason)
  VALUES (btrim(p_order_id), 'deleted')
  ON CONFLICT (order_id) DO NOTHING;
  v_year := substring(btrim(p_order_id) from 5 for 4);
  v_serial := private.order_id_serial(p_order_id, v_year);
  IF v_serial IS NOT NULL AND v_year ~ '^[0-9]{4}$' THEN
    INSERT INTO private.order_id_high_water (year, serial)
    VALUES (v_year::int, v_serial)
    ON CONFLICT (year) DO UPDATE
      SET serial = GREATEST(private.order_id_high_water.serial, EXCLUDED.serial),
          updated_at = pg_catalog.now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.note_retired_order_id(text) FROM PUBLIC;

-- Remember ids that already left the orders table. A stray barcode number
-- far above the real series (the ORD-2026-2259 typo) does not move the
-- high-water mark. Audit deletes do, because those numbers were issued.
DO $backfill$
DECLARE
  source record;
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL AND to_regclass('public.orders') IS NOT NULL THEN
    INSERT INTO private.retired_order_ids (order_id, reason)
    SELECT DISTINCT btrim(a.target_id), 'audit'
    FROM public.audit_logs a
    WHERE btrim(coalesce(a.target_id, '')) ~* '^ORD-[0-9]{4}-[0-9]+$'
      AND upper(coalesce(a.action_type, '')) IN ('DELETE', 'CREATE')
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE lower(btrim(o.id)) = lower(btrim(a.target_id))
      )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  IF to_regclass('public.orders') IS NULL THEN
    RETURN;
  END IF;

  FOR source IN
    SELECT * FROM (VALUES
      ('public.sfg_goods', 'order_id'),
      ('public.fg_goods', 'order_id'),
      ('public.print_runs', 'order_id'),
      ('public.production_records', 'order_id'),
      ('public.inventory_rolls', 'order_id')
    ) AS listed(regclass_name, column_name)
  LOOP
    IF to_regclass(source.regclass_name) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = split_part(source.regclass_name, '.', 1)
        AND table_name = split_part(source.regclass_name, '.', 2)
        AND column_name = source.column_name
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format($sql$
      INSERT INTO private.retired_order_ids (order_id, reason)
      SELECT DISTINCT btrim(src.%1$I), %2$L
      FROM %3$s AS src
      WHERE btrim(coalesce(src.%1$I, '')) ~* '^ORD-[0-9]{4}-[0-9]+$'
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE lower(btrim(o.id)) = lower(btrim(src.%1$I))
        )
        AND private.order_id_serial(src.%1$I, substring(btrim(src.%1$I) from 5 for 4))
            <= COALESCE((
              SELECT MAX(used.n) FROM (
                SELECT private.order_id_serial(o.id, substring(btrim(src.%1$I) from 5 for 4)) AS n
                FROM public.orders o
                UNION ALL
                SELECT private.order_id_serial(r.order_id, substring(btrim(src.%1$I) from 5 for 4))
                FROM private.retired_order_ids r
              ) AS used
            ), 0) + 100
      ON CONFLICT (order_id) DO NOTHING
    $sql$, source.column_name, source.regclass_name, source.regclass_name);
  END LOOP;

  INSERT INTO private.order_id_high_water (year, serial)
  SELECT year_num, MAX(serial_num)
  FROM (
    SELECT (regexp_match(lower(btrim(id)), '^ord-([0-9]{4})-([0-9]+)$'))[1]::int AS year_num,
           (regexp_match(lower(btrim(id)), '^ord-([0-9]{4})-([0-9]+)$'))[2]::bigint AS serial_num
    FROM public.orders
    WHERE id ~* '^ORD-[0-9]{4}-[0-9]+$'
    UNION ALL
    SELECT (regexp_match(lower(btrim(order_id)), '^ord-([0-9]{4})-([0-9]+)$'))[1]::int,
           (regexp_match(lower(btrim(order_id)), '^ord-([0-9]{4})-([0-9]+)$'))[2]::bigint
    FROM private.retired_order_ids
    WHERE order_id ~* '^ORD-[0-9]{4}-[0-9]+$'
    UNION ALL
    SELECT (regexp_match(lower(btrim(order_id)), '^ord-([0-9]{4})-([0-9]+)$'))[1]::int,
           (regexp_match(lower(btrim(order_id)), '^ord-([0-9]{4})-([0-9]+)$'))[2]::bigint
    FROM private.order_id_reservations
    WHERE order_id ~* '^ORD-[0-9]{4}-[0-9]+$'
  ) AS used
  WHERE year_num IS NOT NULL AND serial_num IS NOT NULL
  GROUP BY year_num
  ON CONFLICT (year) DO UPDATE
    SET serial = GREATEST(private.order_id_high_water.serial, EXCLUDED.serial),
        updated_at = pg_catalog.now();
END
$backfill$;

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

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('samyak-order-id'));

  SELECT COALESCE(MAX(n), 0)
    INTO serial
  FROM (
    SELECT private.order_id_serial(j.id, v_year) AS n
    FROM public.orders j
    UNION ALL
    SELECT private.order_id_serial(r.order_id, v_year)
    FROM private.order_id_reservations r
    UNION ALL
    SELECT private.order_id_serial(d.order_id, v_year)
    FROM private.retired_order_ids d
    UNION ALL
    SELECT h.serial
    FROM private.order_id_high_water h
    WHERE h.year = v_year::int
  ) AS used;

  WHILE coalesce(pg_catalog.array_length(issued, 1), 0) < requested LOOP
    serial := serial + 1;
    guard := guard + 1;
    IF guard > 100000 THEN
      RAISE EXCEPTION 'Could not allocate an order id';
    END IF;
    candidate := 'ORD-' || v_year || '-' || pg_catalog.lpad(serial::text, GREATEST(pg_catalog.length(serial::text), 3), '0');
    IF EXISTS (
      SELECT 1 FROM public.orders j WHERE lower(btrim(j.id)) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM private.order_id_reservations r
      WHERE lower(btrim(r.order_id)) = lower(candidate)
    ) OR EXISTS (
      SELECT 1 FROM private.retired_order_ids d
      WHERE lower(btrim(d.order_id)) = lower(candidate)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO private.order_id_reservations (order_id) VALUES (candidate);
    issued := issued || candidate;
  END LOOP;

  INSERT INTO private.order_id_high_water (year, serial)
  VALUES (v_year::int, serial)
  ON CONFLICT (year) DO UPDATE
    SET serial = GREATEST(private.order_id_high_water.serial, EXCLUDED.serial),
        updated_at = pg_catalog.now();

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_order_id(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_order_id(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.sfg_fg_stock_blocking_order_delete(p_order_id text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lines text[] := ARRAY[]::text[];
  row record;
BEGIN
  IF to_regclass('public.sfg_goods') IS NOT NULL THEN
    FOR row IN
      SELECT s.sfg_batch_code AS code,
             s.job_name,
             COALESCE(s.available_kg, GREATEST(0, COALESCE(s.total_net_kg, 0) - COALESCE(s.consumed_kg, 0))) AS kg
      FROM public.sfg_goods s
      WHERE lower(btrim(coalesce(s.order_id, ''))) = lower(btrim(coalesce(p_order_id, '')))
        AND COALESCE(s.available_kg, GREATEST(0, COALESCE(s.total_net_kg, 0) - COALESCE(s.consumed_kg, 0))) > 0.009
    LOOP
      lines := lines || format('%s (%s kg)%s', row.code, pg_catalog.to_char(row.kg, 'FM999999990.00'),
        CASE WHEN nullif(btrim(coalesce(row.job_name, '')), '') IS NULL THEN '' ELSE ' — ' || row.job_name END);
    END LOOP;
  END IF;

  IF to_regclass('public.fg_goods') IS NOT NULL THEN
    FOR row IN
      EXECUTE $q$
        SELECT fg_batch_code AS code, job_name, COALESCE(total_net_kg, 0) AS kg, coalesce(status, '') AS status
        FROM public.fg_goods
        WHERE lower(btrim(coalesce(order_id, ''))) = lower(btrim(coalesce($1, '')))
          AND COALESCE(total_net_kg, 0) > 0.009
      $q$
      USING p_order_id
    LOOP
      IF row.status ~* 'consumed|dispatch' THEN
        CONTINUE;
      END IF;
      lines := lines || format('%s (%s kg)%s', row.code, pg_catalog.to_char(row.kg, 'FM999999990.00'),
        CASE WHEN nullif(btrim(coalesce(row.job_name, '')), '') IS NULL THEN '' ELSE ' — ' || row.job_name END);
    END LOOP;
  END IF;

  IF to_regclass('public.inventory') IS NOT NULL THEN
    FOR row IN
      SELECT i.id AS code, i.item_name AS job_name, COALESCE(i.stock_qty_kg, 0) AS kg, coalesce(i.category, '') AS category
      FROM public.inventory i
      WHERE lower(btrim(i.id)) IN (
          lower('SFG-ITEM-' || btrim(coalesce(p_order_id, ''))),
          lower('FG-ITEM-' || btrim(coalesce(p_order_id, '')))
        )
        AND COALESCE(i.stock_qty_kg, 0) > 0.009
    LOOP
      IF row.category !~* 'semi-finished|finished|sfg|fg'
         AND row.code !~* '^SFG-|^FG-' THEN
        CONTINUE;
      END IF;
      lines := lines || format('%s (%s kg)%s', row.code, pg_catalog.to_char(row.kg, 'FM999999990.00'),
        CASE WHEN nullif(btrim(coalesce(row.job_name, '')), '') IS NULL THEN '' ELSE ' — ' || row.job_name END);
    END LOOP;
  END IF;

  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    FOR row IN
      SELECT r.barcode_id AS code,
             r.item_name AS job_name,
             COALESCE(r.available_weight_kg, 0) AS kg,
             coalesce(r.roll_type, '') || ' ' || coalesce(r.category, '') || ' ' || coalesce(r.sfg_type, '') || ' ' || coalesce(r.fg_type, '') AS described,
             coalesce(r.status, '') AS status
      FROM public.inventory_rolls r
      WHERE lower(btrim(coalesce(r.order_id, ''))) = lower(btrim(coalesce(p_order_id, '')))
        AND COALESCE(r.available_weight_kg, 0) > 0.009
    LOOP
      IF row.status ~* 'reversed|void' THEN
        CONTINUE;
      END IF;
      IF row.described !~* 'semi.finished|finished|(^|[^a-z0-9])sfg([^a-z0-9]|$)|(^|[^a-z0-9])fg([^a-z0-9]|$)' THEN
        CONTINUE;
      END IF;
      lines := lines || format('%s (%s kg)%s', row.code, pg_catalog.to_char(row.kg, 'FM999999990.00'),
        CASE WHEN nullif(btrim(coalesce(row.job_name, '')), '') IS NULL THEN '' ELSE ' — ' || row.job_name END);
    END LOOP;
  END IF;

  RETURN lines;
END;
$$;

REVOKE ALL ON FUNCTION private.sfg_fg_stock_blocking_order_delete(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.retire_order_id_and_block_sfg_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lines text[];
  shown text;
BEGIN
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('samyak-order-id'));
  lines := private.sfg_fg_stock_blocking_order_delete(OLD.id);
  IF coalesce(pg_catalog.array_length(lines, 1), 0) > 0 THEN
    shown := pg_catalog.array_to_string(lines[1:12], '; ');
    IF pg_catalog.array_length(lines, 1) > 12 THEN
      shown := shown || ' and more';
    END IF;
    RAISE EXCEPTION 'Cannot delete order % while SFG/FG stock remains: %', OLD.id, shown
      USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.note_retired_order_id(OLD.id);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.retire_order_id_and_block_sfg_stock() FROM PUBLIC;

DROP TRIGGER IF EXISTS orders_retire_id_and_block_sfg_stock ON public.orders;
CREATE TRIGGER orders_retire_id_and_block_sfg_stock
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.retire_order_id_and_block_sfg_stock();

-- post_print_run_outputs and post_additional_print_rolls look up
-- SFG-LOT-{order id} and overwrite it. This trigger refuses that write when
-- the lot belongs to an earlier order with the same number, and it keeps the
-- lot metres as the sum of the child rolls.
CREATE OR REPLACE FUNCTION private.reject_foreign_printed_lot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_created timestamptz;
  order_job_name text;
  order_job_code text;
  order_job_master text;
  lot_job_master text;
  notes_json jsonb;
  child_count integer;
  with_meters integer;
  child_sum numeric;
  found_order boolean := false;
BEGIN
  IF TG_OP = 'INSERT'
     AND nullif(btrim(coalesce(NEW.order_id, '')), '') IS NOT NULL
     AND to_regclass('public.orders') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'This order no longer exists. The batch was not saved.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.sfg_batch_code IS NULL OR NEW.sfg_batch_code !~* '^SFG-LOT-' THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL AND nullif(btrim(coalesce(NEW.order_id, '')), '') IS NOT NULL THEN
    SELECT o.created_at,
           split_part(coalesce(o.job_name, ''), ' ||| ', 1),
           o.job_master_id,
           coalesce(
             nullif(btrim(o.job_details ->> 'jobCode'), ''),
             nullif(btrim(o.job_details #>> '{jobDetails,jobCode}'), '')
           )
      INTO order_created, order_job_name, order_job_master, order_job_code
    FROM public.orders o
    WHERE o.id = NEW.order_id;
    found_order := FOUND;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT found_order THEN
    IF NEW.job_name IS NOT DISTINCT FROM OLD.job_name
       AND NEW.client_name IS NOT DISTINCT FROM OLD.client_name
       AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id
       AND NEW.job_code IS NOT DISTINCT FROM OLD.job_code
       AND NEW.sfg_batch_code IS NOT DISTINCT FROM OLD.sfg_batch_code THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This order no longer exists. The batch was not saved.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' AND found_order THEN
    IF OLD.created_at IS NOT NULL AND order_created IS NOT NULL AND OLD.created_at < order_created THEN
      RAISE EXCEPTION 'A lot from an earlier order with this number exists. It was not merged.'
        USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(OLD.order_id, '')), '') IS NOT NULL
       AND lower(btrim(OLD.order_id)) IS DISTINCT FROM lower(btrim(coalesce(NEW.order_id, ''))) THEN
      RAISE EXCEPTION 'A lot from an earlier order with this number exists. It was not merged.'
        USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(OLD.job_code, '')), '') IS NOT NULL
       AND nullif(btrim(coalesce(order_job_code, '')), '') IS NOT NULL
       AND lower(btrim(OLD.job_code)) <> lower(btrim(order_job_code)) THEN
      RAISE EXCEPTION 'A lot from an earlier order with this number exists. It was not merged.'
        USING ERRCODE = 'P0001';
    END IF;
    lot_job_master := nullif(btrim(coalesce(OLD.job_id, '')), '');
    IF OLD.notes IS NOT NULL AND left(btrim(OLD.notes), 1) = '{' THEN
      BEGIN
        lot_job_master := coalesce(
          nullif(btrim((OLD.notes::jsonb) ->> 'jobMasterId'), ''),
          lot_job_master
        );
      EXCEPTION WHEN others THEN
        lot_job_master := lot_job_master;
      END;
    END IF;
    IF lot_job_master IS NOT NULL
       AND nullif(btrim(coalesce(order_job_master, '')), '') IS NOT NULL
       AND lot_job_master <> btrim(order_job_master) THEN
      RAISE EXCEPTION 'A lot from an earlier order with this number exists. It was not merged.'
        USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(OLD.job_code, '')), '') IS NULL
       AND nullif(btrim(coalesce(order_job_code, '')), '') IS NULL
       AND nullif(btrim(coalesce(OLD.job_name, '')), '') IS NOT NULL
       AND nullif(btrim(coalesce(order_job_name, '')), '') IS NOT NULL
       AND lower(btrim(OLD.job_name)) <> lower(btrim(order_job_name)) THEN
      RAISE EXCEPTION 'A lot from an earlier order with this number exists. It was not merged.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.notes IS NOT NULL AND left(btrim(NEW.notes), 1) = '{' THEN
    BEGIN
      notes_json := NEW.notes::jsonb;
      IF jsonb_typeof(notes_json -> 'childRolls') = 'array' THEN
        SELECT count(*),
               count(*) FILTER (WHERE coalesce((value ->> 'lengthMeters')::numeric, 0) > 0),
               coalesce(sum(coalesce((value ->> 'lengthMeters')::numeric, 0)), 0)
          INTO child_count, with_meters, child_sum
        FROM jsonb_array_elements(notes_json -> 'childRolls') AS listed(value);
        IF child_count > 0 AND with_meters = child_count THEN
          NEW.total_meters := round(child_sum, 2);
          notes_json := jsonb_set(notes_json, '{totalMeters}', to_jsonb(NEW.total_meters), true);
          NEW.notes := notes_json::text;
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reject_foreign_printed_lot() FROM PUBLIC;

DO $lot_trigger$
BEGIN
  IF to_regclass('public.sfg_goods') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS sfg_goods_reject_foreign_lot ON public.sfg_goods;
    CREATE TRIGGER sfg_goods_reject_foreign_lot
      BEFORE INSERT OR UPDATE ON public.sfg_goods
      FOR EACH ROW
      EXECUTE FUNCTION private.reject_foreign_printed_lot();
  END IF;
END
$lot_trigger$;
