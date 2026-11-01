-- Printing Operator and Shop Floor Operator open only Inventory, Printing
-- Scheduler, and SFG / FG Store. Inventory and Printing Scheduler stay full
-- write. SFG / FG Store is view-only for those two roles.
--
-- The permission matrix is still boolean for every other module. sfg_store
-- may be true (edit), false (hidden), or the string "view" (open, no store
-- mutations). A generic view level was not added: private.can_any treats only
-- JSON true as access and the live grid is allow/block for every other row.
--
-- This rewrites only the Printing Operator and Shop Floor Operator rows.
-- Other roles are left as they are, including any Admin edits.
-- Safe to run more than once. Missing tables, columns, or auth helpers are
-- skipped instead of failing the migration.

DO $roles$
DECLARE
  has_updated boolean;
  target jsonb := $json$
  {
    "dashboard": false,
    "production_records": false,
    "sfg_store": "view",
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "purchase_orders": false,
    "inventory": true,
    "ink_management": false,
    "material_indents": false,
    "pellet_fuel": false,
    "barcodes": false,
    "dispatch": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "audit_logs": false
  }
  $json$::jsonb;
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'permissions'
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'updated_at'
  ) INTO has_updated;

  IF has_updated THEN
    UPDATE public.role_permissions AS rp
    SET permissions = target,
        updated_at = now()
    WHERE rp.role IN ('Printing Operator', 'Shop Floor Operator')
      AND rp.permissions IS DISTINCT FROM target;

    INSERT INTO public.role_permissions (role, permissions, updated_at)
    SELECT wanted.role_name, target, now()
    FROM (VALUES ('Printing Operator'), ('Shop Floor Operator')) AS wanted(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions AS rp WHERE rp.role = wanted.role_name
    );
  ELSE
    UPDATE public.role_permissions AS rp
    SET permissions = target
    WHERE rp.role IN ('Printing Operator', 'Shop Floor Operator')
      AND rp.permissions IS DISTINCT FROM target;

    INSERT INTO public.role_permissions (role, permissions)
    SELECT wanted.role_name, target
    FROM (VALUES ('Printing Operator'), ('Shop Floor Operator')) AS wanted(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions AS rp WHERE rp.role = wanted.role_name
    );
  END IF;
END
$roles$;

DO $access$
BEGIN
  IF to_regprocedure('private.app_roles()') IS NULL
     OR to_regprocedure('private.can_any(text[])') IS NULL THEN
    RAISE NOTICE 'operator sfg view: skipped store policies because private.app_roles or private.can_any is missing';
    RETURN;
  END IF;

  EXECUTE $edit$
CREATE OR REPLACE FUNCTION private.can_edit_sfg_store(modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(private.app_roles()) AS granted(role_name)
    WHERE granted.role_name = 'Admin'
       OR EXISTS (
         SELECT 1
         FROM public.role_permissions AS rp
         WHERE rp.role = granted.role_name
           AND (
             rp.permissions -> 'sfg_store' = 'true'::jsonb
             OR (
               coalesce(rp.permissions ->> 'sfg_store', '') IS DISTINCT FROM 'view'
               AND EXISTS (
                 SELECT 1
                 FROM unnest(modules) AS requested(module_key)
                 WHERE rp.permissions -> requested.module_key = 'true'::jsonb
               )
             )
           )
       )
  );
$fn$
$edit$;

  EXECUTE $read$
CREATE OR REPLACE FUNCTION private.can_read_sfg_store(modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT private.can_edit_sfg_store(modules)
      OR private.can_any(modules || ARRAY['sfg_store']::text[])
      OR EXISTS (
        SELECT 1
        FROM unnest(private.app_roles()) AS granted(role_name)
        JOIN public.role_permissions AS rp ON rp.role = granted.role_name
        WHERE rp.permissions ->> 'sfg_store' = 'view'
      );
$fn$
$read$;

  REVOKE ALL ON FUNCTION private.can_edit_sfg_store(text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION private.can_read_sfg_store(text[]) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.can_edit_sfg_store(text[]) FROM anon;
    REVOKE ALL ON FUNCTION private.can_read_sfg_store(text[]) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.can_edit_sfg_store(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_read_sfg_store(text[]) TO authenticated;
  END IF;
END
$access$;

DO $policies$
BEGIN
  IF to_regprocedure('private.can_edit_sfg_store(text[])') IS NULL
     OR to_regprocedure('private.can_read_sfg_store(text[])') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'operator sfg view: skipped store policies because authenticated is missing';
    RETURN;
  END IF;

  EXECUTE $guard$
CREATE OR REPLACE FUNCTION private.reject_sfg_view_only_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  -- save_printing_sfg_lot is security definer, so its writes run as the
  -- function owner rather than authenticated. Direct requests from the
  -- signed-in role are the ones this guard rejects.
  IF current_user IN ('authenticated', 'anon')
     AND NOT private.can_edit_sfg_store(TG_ARGV) THEN
    RAISE EXCEPTION 'SFG / FG Store is view-only for this account'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$
$guard$;

  REVOKE ALL ON FUNCTION private.reject_sfg_view_only_write() FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.reject_sfg_view_only_write() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA private TO authenticated;
    GRANT EXECUTE ON FUNCTION private.reject_sfg_view_only_write() TO authenticated;
  END IF;

  EXECUTE $installer$
CREATE OR REPLACE FUNCTION private._install_operator_sfg_policies(
  qualified regclass,
  read_modules text[],
  write_modules text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  pol record;
  short_name text := split_part(qualified::text, '.', 2);
  read_list text;
  write_list text;
  write_args text;
BEGIN
  SELECT 'ARRAY[' || string_agg(quote_literal(module_key), ',') || ']::text[]'
    INTO read_list
  FROM unnest(read_modules) AS requested(module_key);

  SELECT 'ARRAY[' || string_agg(quote_literal(module_key), ',') || ']::text[]'
    INTO write_list
  FROM unnest(write_modules) AS requested(module_key);

  SELECT string_agg(quote_literal(module_key), ', ')
    INTO write_args
  FROM unnest(write_modules) AS requested(module_key);

  FOR pol IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = short_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol.policyname, qualified::text);
  END LOOP;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qualified::text);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (private.can_read_sfg_store(%s))',
    short_name || '_select',
    qualified::text,
    read_list
  );
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR INSERT TO authenticated WITH CHECK (private.can_edit_sfg_store(%s))',
    short_name || '_insert',
    qualified::text,
    write_list
  );
  -- USING stays readable so a view-only update or delete targets the row.
  -- The BEFORE trigger then rejects it. A WITH CHECK of can_edit also rejects
  -- an update that the caller can see.
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR UPDATE TO authenticated USING (private.can_read_sfg_store(%s)) WITH CHECK (private.can_edit_sfg_store(%s))',
    short_name || '_update',
    qualified::text,
    read_list,
    write_list
  );
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR DELETE TO authenticated USING (private.can_read_sfg_store(%s))',
    short_name || '_delete',
    qualified::text,
    read_list
  );
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', short_name || '_view_only_write', qualified::text);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION private.reject_sfg_view_only_write(%s)',
    short_name || '_view_only_write',
    qualified::text,
    write_args
  );
END;
$fn$
$installer$;

  IF to_regclass('public.sfg_goods') IS NOT NULL THEN
    PERFORM private._install_operator_sfg_policies(
      'public.sfg_goods'::regclass,
      ARRAY['production_records','inventory','printing_scheduler','sfg_store'],
      ARRAY['production_records','inventory','printing_scheduler']
    );
  END IF;
  IF to_regclass('public.fg_goods') IS NOT NULL THEN
    PERFORM private._install_operator_sfg_policies(
      'public.fg_goods'::regclass,
      ARRAY['production_records','inventory','printing_scheduler','sfg_store'],
      ARRAY['production_records','inventory','printing_scheduler']
    );
  END IF;
  IF to_regclass('public.sfg_fg_store') IS NOT NULL THEN
    PERFORM private._install_operator_sfg_policies(
      'public.sfg_fg_store'::regclass,
      ARRAY['production_records','inventory','printing_scheduler','sfg_store'],
      ARRAY['production_records','inventory','printing_scheduler']
    );
  END IF;
  IF to_regclass('public.sfg_qc_hold_items') IS NOT NULL THEN
    PERFORM private._install_operator_sfg_policies(
      'public.sfg_qc_hold_items'::regclass,
      ARRAY['sfg_store','production_records'],
      ARRAY['production_records']
    );
  END IF;
  IF to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    PERFORM private._install_operator_sfg_policies(
      'public.sfg_scrap_items'::regclass,
      ARRAY['sfg_store','scrap_analytics','production_records'],
      ARRAY['scrap_analytics','production_records']
    );
  END IF;

  DROP FUNCTION private._install_operator_sfg_policies(regclass, text[], text[]);
END
$policies$;

DO $lot$
BEGIN
  IF to_regclass('public.sfg_goods') IS NULL THEN
    RETURN;
  END IF;
  IF to_regprocedure('private.can_edit_sfg_store(text[])') IS NULL
     OR to_regprocedure('private.can_any(text[])') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sfg_goods'
      AND column_name = 'consumed_kg'
  ) THEN
    RAISE NOTICE 'operator sfg view: skipped save_printing_sfg_lot because consumed_kg is missing';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.save_printing_sfg_lot(p_item jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  batch text;
  existing public.sfg_goods%ROWTYPE;
  has_existing boolean := false;
  editor boolean;
  notes_in jsonb;
  notes_kept jsonb;
  notes_out jsonb;
  net_kg numeric;
  consumed numeric;
  dispatched numeric;
  available numeric;
  next_status text;
  row_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a printed SFG lot'
      USING ERRCODE = '42501';
  END IF;

  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Printed SFG lot payload is missing'
      USING ERRCODE = '22023';
  END IF;

  batch := btrim(coalesce(p_item->>'sfg_batch_code', ''));
  IF batch !~ '^SFG-LOT-' THEN
    RAISE EXCEPTION 'Only a printed job lot can be saved from the printing scheduler'
      USING ERRCODE = '42501';
  END IF;

  editor := private.can_edit_sfg_store(ARRAY['production_records','inventory','printing_scheduler']::text[]);
  IF NOT editor AND NOT private.can_any(ARRAY['printing_scheduler']::text[]) THEN
    RAISE EXCEPTION 'SFG / FG Store is view-only for this account'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing
  FROM public.sfg_goods
  WHERE sfg_batch_code = batch;
  has_existing := FOUND;

  net_kg := coalesce(nullif(p_item->>'total_net_kg', '')::numeric, 0);

  BEGIN
    notes_in := coalesce(nullif(p_item->>'notes', ''), '{}')::jsonb;
  EXCEPTION WHEN others THEN
    notes_in := '{}'::jsonb;
  END;
  IF notes_in IS NULL OR jsonb_typeof(notes_in) <> 'object' THEN
    notes_in := '{}'::jsonb;
  END IF;

  IF editor THEN
    consumed := coalesce(nullif(p_item->>'consumed_kg', '')::numeric, 0);
    dispatched := coalesce(nullif(notes_in->>'dispatchedKg', '')::numeric, 0);
    notes_out := notes_in;
    available := coalesce(
      nullif(p_item->>'available_kg', '')::numeric,
      greatest(0, net_kg - consumed - dispatched)
    );
    next_status := coalesce(nullif(p_item->>'status', ''), 'In Stock (WIP)');
  ELSE
    consumed := CASE WHEN has_existing THEN coalesce(existing.consumed_kg, 0) ELSE 0 END;
    notes_kept := '{}'::jsonb;
    IF has_existing AND existing.notes IS NOT NULL AND left(btrim(existing.notes), 1) = '{' THEN
      BEGIN
        notes_kept := existing.notes::jsonb;
      EXCEPTION WHEN others THEN
        notes_kept := '{}'::jsonb;
      END;
    END IF;
    IF notes_kept IS NULL OR jsonb_typeof(notes_kept) <> 'object' THEN
      notes_kept := '{}'::jsonb;
    END IF;
    dispatched := coalesce(nullif(notes_kept->>'dispatchedKg', '')::numeric, 0);
    notes_out := notes_in || jsonb_build_object(
      'isPrintedLot', true,
      'sfgBatchCode', batch,
      'consumedKg', consumed,
      'dispatchedKg', dispatched,
      'consumptionHistory', coalesce(notes_kept->'consumptionHistory', '[]'::jsonb),
      'balanceReason', coalesce(notes_kept->>'balanceReason', ''),
      'balanceNote', coalesce(notes_kept->>'balanceNote', ''),
      'balanceKeptKg', coalesce(nullif(notes_kept->>'balanceKeptKg', '')::numeric, 0),
      'balanceQcHoldKg', coalesce(nullif(notes_kept->>'balanceQcHoldKg', '')::numeric, 0),
      'printedAllocations', coalesce(notes_kept->'printedAllocations', notes_in->'printedAllocations', '[]'::jsonb)
    );
    available := greatest(0, net_kg - consumed - dispatched);
    IF consumed > 0 AND available <= 0 THEN
      next_status := 'Fully Consumed';
    ELSIF consumed > 0 THEN
      next_status := 'Partially Consumed';
    ELSE
      next_status := 'In Stock (WIP)';
    END IF;
  END IF;

  row_id := CASE WHEN has_existing THEN existing.id ELSE NULL END;
  IF row_id IS NULL THEN
    BEGIN
      row_id := nullif(p_item->>'id', '')::uuid;
    EXCEPTION WHEN others THEN
      row_id := NULL;
    END;
  END IF;
  IF row_id IS NULL THEN
    row_id := gen_random_uuid();
  END IF;

  IF NOT has_existing THEN
    INSERT INTO public.sfg_goods (
      id, sfg_batch_code, sfg_type, job_id, order_id, job_name, job_code, client_name,
      structure, film_type, micron, width_mm, total_gross_kg, gross_weight_kg, tare_weight_kg,
      total_net_kg, consumed_kg, available_kg, total_meters, rolls_count, machine_name,
      operator_name, shift, storage_bay, production_date, status, notes, updated_at
    ) VALUES (
      row_id,
      batch,
      coalesce(nullif(p_item->>'sfg_type', ''), 'Printed Rolls'),
      nullif(p_item->>'job_id', ''),
      nullif(p_item->>'order_id', ''),
      coalesce(nullif(p_item->>'job_name', ''), 'Untitled Job'),
      coalesce(p_item->>'job_code', ''),
      coalesce(p_item->>'client_name', ''),
      coalesce(p_item->>'structure', ''),
      coalesce(p_item->>'film_type', ''),
      coalesce(nullif(p_item->>'micron', '')::numeric, 0),
      coalesce(nullif(p_item->>'width_mm', '')::numeric, 0),
      coalesce(nullif(p_item->>'total_gross_kg', '')::numeric, net_kg),
      coalesce(nullif(p_item->>'gross_weight_kg', '')::numeric, net_kg),
      coalesce(nullif(p_item->>'tare_weight_kg', '')::numeric, 0),
      net_kg,
      consumed,
      available,
      coalesce(nullif(p_item->>'total_meters', '')::numeric, 0),
      coalesce(nullif(p_item->>'rolls_count', '')::integer, 1),
      coalesce(p_item->>'machine_name', ''),
      coalesce(p_item->>'operator_name', ''),
      coalesce(p_item->>'shift', ''),
      coalesce(nullif(p_item->>'storage_bay', ''), 'SFG Store (Pre-Lamination)'),
      CASE
        WHEN coalesce(p_item->>'production_date', '') = '' THEN CURRENT_DATE
        ELSE (p_item->>'production_date')::date
      END,
      next_status,
      notes_out::text,
      now()
    );
  ELSE
    UPDATE public.sfg_goods SET
      sfg_type = coalesce(nullif(p_item->>'sfg_type', ''), sfg_type),
      job_id = nullif(p_item->>'job_id', ''),
      order_id = nullif(p_item->>'order_id', ''),
      job_name = coalesce(nullif(p_item->>'job_name', ''), job_name),
      job_code = coalesce(p_item->>'job_code', ''),
      client_name = coalesce(p_item->>'client_name', ''),
      structure = coalesce(p_item->>'structure', ''),
      film_type = coalesce(p_item->>'film_type', ''),
      micron = coalesce(nullif(p_item->>'micron', '')::numeric, 0),
      width_mm = coalesce(nullif(p_item->>'width_mm', '')::numeric, 0),
      total_gross_kg = coalesce(nullif(p_item->>'total_gross_kg', '')::numeric, net_kg),
      gross_weight_kg = coalesce(nullif(p_item->>'gross_weight_kg', '')::numeric, net_kg),
      tare_weight_kg = coalesce(nullif(p_item->>'tare_weight_kg', '')::numeric, 0),
      total_net_kg = net_kg,
      consumed_kg = consumed,
      available_kg = available,
      total_meters = coalesce(nullif(p_item->>'total_meters', '')::numeric, 0),
      rolls_count = coalesce(nullif(p_item->>'rolls_count', '')::integer, 1),
      machine_name = coalesce(p_item->>'machine_name', ''),
      operator_name = coalesce(p_item->>'operator_name', ''),
      shift = coalesce(p_item->>'shift', ''),
      storage_bay = coalesce(nullif(p_item->>'storage_bay', ''), storage_bay),
      production_date = CASE
        WHEN coalesce(p_item->>'production_date', '') = '' THEN production_date
        ELSE (p_item->>'production_date')::date
      END,
      status = next_status,
      notes = notes_out::text,
      updated_at = now()
    WHERE sfg_batch_code = batch;
  END IF;
END;
$body$
$fn$;

  REVOKE ALL ON FUNCTION public.save_printing_sfg_lot(jsonb) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.save_printing_sfg_lot(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.save_printing_sfg_lot(jsonb) TO authenticated;
  END IF;
END
$lot$;
