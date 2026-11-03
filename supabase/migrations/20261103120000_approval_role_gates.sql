-- Approval ceilings for material indents, QC decisions on GRNs, and pellet fuel.
--
-- The permission matrix stays boolean except sfg_store, which is the only
-- key that understands the string "view". private.can_any still treats only
-- JSON true as access. This migration does not rewrite role_permissions and
-- does not update material indents, GRNs, pellet rows, or any other data.
--
-- Material indents
--   Approve and reject stay with Admin. Roles whose material_indents flag is
--   true can still raise and edit a requisition. The inventory flag no longer
--   grants a write: QC Chemist and both operators have inventory and no
--   indent screen, so they must not insert or update indents. SELECT still
--   allows inventory so the Inventory issued-PO list can read an indent that
--   already became a PO. A trigger blocks a status of approved or rejected,
--   and the approval fields, unless the caller is Admin.
--
-- GRN QC
--   grns_access and grn_line_items_access stay on inventory and purchase_orders
--   so Store, Purchase, and the operators can still save drafts. A trigger
--   rejects a new QC decision (approved, rejected, or hold) unless the caller
--   is Admin, QC Chemist, Plant Manager, or Production Manager. Inserting a
--   Rotogravure Cylinders receipt as Approved stays allowed: that inward is
--   not the QC Approval Lab. private.block_qc_approved_grn_header is not
--   replaced. A receipt that is already QC-approved stays locked.
--
-- Pellet fuel
--   Writes on pellet_inwards and pellet_consumptions are Admin, Plant Manager,
--   Production Manager, and Store Manager. The inventory fallback is gone, so
--   an operator cannot record fuel. Purchase Manager, QC Chemist, Sales
--   Manager, and HR & Payroll Manager keep pellet_fuel = true where that row
--   already says true, and can still read. They cannot write. The matrix has
--   no generic view level, so those flags are not changed to the string
--   "view" (that value would hide the screen). Printing Operator and Shop
--   Floor Operator stay pellet_fuel = false; this file does not touch them.
--
--   pellet_grn_counters is the shared GRN number series used by Inventory and
--   Purchase as well as pellet inwards. Direct writes follow the pellet
--   recorders, with no inventory fallback. allocate_pellet_grn_number stays
--   callable by inventory and purchase_orders roles so an operator can still
--   number an inward GRN. The function is security definer, runs as its
--   owner, and does not open pellet_inwards or pellet_consumptions.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT USAGE ON SCHEMA private TO postgres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA private TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA private TO authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.material_indent_decision(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_status, ''))) LIKE '%approved%' THEN 'approved'
    WHEN lower(btrim(coalesce(p_status, ''))) LIKE '%reject%' THEN 'rejected'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.material_indent_approval_keys(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_object_agg(key, value)
      FROM jsonb_each(COALESCE(p_payload, '{}'::jsonb)) AS field(key, value)
      WHERE lower(key) IN (
        'approvedby',
        'approvedat',
        'rejectedby',
        'rejectedat',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'approvalnote',
        'approvalnotes',
        'approvalstatus'
      )
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION private.can_approve_material_indent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.has_role(ARRAY['Admin']::text[]), false);
$$;

CREATE OR REPLACE FUNCTION private.block_material_indent_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  old_decision text;
  new_decision text;
  old_keys jsonb;
  new_keys jsonb;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  new_decision := private.material_indent_decision(NEW.payload ->> 'status');
  new_keys := private.material_indent_approval_keys(NEW.payload);

  IF TG_OP = 'INSERT' THEN
    old_decision := NULL;
    old_keys := '{}'::jsonb;
  ELSE
    old_decision := private.material_indent_decision(OLD.payload ->> 'status');
    old_keys := private.material_indent_approval_keys(OLD.payload);
  END IF;

  IF (new_decision IS NOT NULL AND new_decision IS DISTINCT FROM old_decision)
     OR new_keys IS DISTINCT FROM old_keys THEN
    IF NOT private.can_approve_material_indent() THEN
      RAISE EXCEPTION 'Only an Admin can approve or reject a material indent'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.grn_qc_decision_token(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_status, ''))) LIKE '%approved%' THEN 'approved'
    WHEN lower(btrim(coalesce(p_status, ''))) LIKE '%reject%' THEN 'rejected'
    WHEN lower(btrim(coalesce(p_status, ''))) LIKE '%hold%' THEN 'hold'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.grn_qc_decision_key(p_status text, p_item_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  meta jsonb := '{}'::jsonb;
  unpacked jsonb;
  tokens text[] := ARRAY[]::text[];
  piece text;
  packed text;
BEGIN
  piece := private.grn_qc_decision_token(p_status);
  IF piece IS NOT NULL THEN
    tokens := tokens || piece;
  END IF;

  IF to_regprocedure('public._grn_unpack_item_name(text)') IS NOT NULL THEN
    unpacked := public._grn_unpack_item_name(p_item_name);
    meta := COALESCE(unpacked -> 'meta', '{}'::jsonb);
  ELSIF position('|||' IN coalesce(p_item_name, '')) > 0 THEN
    packed := btrim(substring(p_item_name FROM position('|||' IN p_item_name) + 3));
    BEGIN
      unpacked := packed::jsonb;
    EXCEPTION WHEN others THEN
      unpacked := '{}'::jsonb;
    END;
    IF jsonb_typeof(unpacked) = 'object' THEN
      meta := unpacked;
    END IF;
  END IF;

  piece := private.grn_qc_decision_token(meta ->> 'status');
  IF piece IS NOT NULL THEN
    tokens := tokens || piece;
  END IF;
  piece := private.grn_qc_decision_token(meta ->> 'qcStatus');
  IF piece IS NOT NULL THEN
    tokens := tokens || piece;
  END IF;

  SELECT COALESCE(string_agg(DISTINCT token, ',' ORDER BY token), '')
    INTO packed
  FROM unnest(tokens) AS token;
  RETURN packed;
END;
$$;

CREATE OR REPLACE FUNCTION private.grn_receipt_is_cylinder(p_item_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  meta jsonb := '{}'::jsonb;
  unpacked jsonb;
  display_name text := coalesce(p_item_name, '');
BEGIN
  IF to_regprocedure('public._grn_unpack_item_name(text)') IS NOT NULL THEN
    unpacked := public._grn_unpack_item_name(p_item_name);
    meta := COALESCE(unpacked -> 'meta', '{}'::jsonb);
    display_name := coalesce(unpacked ->> 'itemName', display_name);
  ELSIF position('|||' IN coalesce(p_item_name, '')) > 0 THEN
    BEGIN
      meta := btrim(substring(p_item_name FROM position('|||' IN p_item_name) + 3))::jsonb;
    EXCEPTION WHEN others THEN
      meta := '{}'::jsonb;
    END;
  END IF;
  RETURN lower(coalesce(meta ->> 'category', '')) = 'rotogravure cylinders'
      OR lower(display_name) LIKE '%rotogravure cylinder%';
END;
$$;

CREATE OR REPLACE FUNCTION private.can_decide_grn_qc()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    private.has_role(ARRAY['QC Chemist', 'Plant Manager', 'Production Manager']::text[]),
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.block_grn_qc_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  old_key text;
  new_key text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  new_key := private.grn_qc_decision_key(NEW.status, NEW.item_name);
  IF TG_OP = 'INSERT' THEN
    IF new_key <> ''
       AND NOT private.grn_receipt_is_cylinder(NEW.item_name)
       AND NOT private.can_decide_grn_qc() THEN
      RAISE EXCEPTION 'Only QC Chemist, Plant Manager, Production Manager, or Admin can approve, reject, or hold a GRN'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  old_key := private.grn_qc_decision_key(OLD.status, OLD.item_name);
  IF new_key IS DISTINCT FROM old_key
     AND NOT private.can_decide_grn_qc() THEN
    RAISE EXCEPTION 'Only QC Chemist, Plant Manager, Production Manager, or Admin can approve, reject, or hold a GRN'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_record_pellet_fuel()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Store Manager']::text[]),
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.reject_pellet_fuel_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT private.can_record_pellet_fuel() THEN
    RAISE EXCEPTION 'Only Admin, Plant Manager, Production Manager, or Store Manager can record pellet fuel'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Direct writes of the shared GRN series. allocate_pellet_grn_number is
-- security definer, so it runs as the function owner and this trigger lets
-- that path through. A signed-in role still has to be a pellet recorder.
CREATE OR REPLACE FUNCTION private.reject_pellet_counter_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT private.can_record_pellet_fuel() THEN
    RAISE EXCEPTION 'Only Admin, Plant Manager, Production Manager, or Store Manager can write the pellet number series directly'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.material_indent_decision(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.material_indent_approval_keys(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_approve_material_indent() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.block_material_indent_approval() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grn_qc_decision_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grn_qc_decision_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grn_receipt_is_cylinder(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_decide_grn_qc() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.block_grn_qc_decision() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_record_pellet_fuel() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reject_pellet_fuel_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reject_pellet_counter_write() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.material_indent_decision(text) FROM anon;
    REVOKE ALL ON FUNCTION private.material_indent_approval_keys(jsonb) FROM anon;
    REVOKE ALL ON FUNCTION private.can_approve_material_indent() FROM anon;
    REVOKE ALL ON FUNCTION private.block_material_indent_approval() FROM anon;
    REVOKE ALL ON FUNCTION private.grn_qc_decision_token(text) FROM anon;
    REVOKE ALL ON FUNCTION private.grn_qc_decision_key(text, text) FROM anon;
    REVOKE ALL ON FUNCTION private.grn_receipt_is_cylinder(text) FROM anon;
    REVOKE ALL ON FUNCTION private.can_decide_grn_qc() FROM anon;
    REVOKE ALL ON FUNCTION private.block_grn_qc_decision() FROM anon;
    REVOKE ALL ON FUNCTION private.can_record_pellet_fuel() FROM anon;
    REVOKE ALL ON FUNCTION private.reject_pellet_fuel_write() FROM anon;
    REVOKE ALL ON FUNCTION private.reject_pellet_counter_write() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.material_indent_decision(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.material_indent_approval_keys(jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_approve_material_indent() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.block_material_indent_approval() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.grn_qc_decision_token(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.grn_qc_decision_key(text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.grn_receipt_is_cylinder(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_decide_grn_qc() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.block_grn_qc_decision() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_record_pellet_fuel() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.reject_pellet_fuel_write() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.reject_pellet_counter_write() TO authenticated;
  END IF;
END $$;

DO $indent_policies$
BEGIN
  IF to_regclass('public.material_indents') IS NULL
     OR to_regprocedure('private.can_any(text[])') IS NULL THEN
    RAISE NOTICE 'approval gates: skipped material indent policies';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.material_indents ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS material_indents_access ON public.material_indents';
  EXECUTE 'DROP POLICY IF EXISTS material_indents_select ON public.material_indents';
  EXECUTE 'DROP POLICY IF EXISTS material_indents_insert ON public.material_indents';
  EXECUTE 'DROP POLICY IF EXISTS material_indents_update ON public.material_indents';
  EXECUTE 'DROP POLICY IF EXISTS material_indents_delete ON public.material_indents';
  EXECUTE $sql$
    CREATE POLICY material_indents_select ON public.material_indents
      FOR SELECT TO authenticated
      USING (private.can_any(ARRAY['material_indents', 'inventory']))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY material_indents_insert ON public.material_indents
      FOR INSERT TO authenticated
      WITH CHECK (private.can_any(ARRAY['material_indents']))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY material_indents_update ON public.material_indents
      FOR UPDATE TO authenticated
      USING (private.can_any(ARRAY['material_indents']))
      WITH CHECK (private.can_any(ARRAY['material_indents']))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY material_indents_delete ON public.material_indents
      FOR DELETE TO authenticated
      USING (private.can_any(ARRAY['material_indents']))
  $sql$;
  EXECUTE 'DROP TRIGGER IF EXISTS material_indents_approval_admin ON public.material_indents';
  EXECUTE $sql$
    CREATE TRIGGER material_indents_approval_admin
      BEFORE INSERT OR UPDATE ON public.material_indents
      FOR EACH ROW
      EXECUTE FUNCTION private.block_material_indent_approval()
  $sql$;
END
$indent_policies$;

DO $grn_trigger$
BEGIN
  IF to_regclass('public.grns') IS NULL
     OR to_regprocedure('private.can_decide_grn_qc()') IS NULL THEN
    RAISE NOTICE 'approval gates: skipped GRN QC trigger';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS grns_qc_decision_role ON public.grns';
  EXECUTE $sql$
    CREATE TRIGGER grns_qc_decision_role
      BEFORE INSERT OR UPDATE ON public.grns
      FOR EACH ROW
      EXECUTE FUNCTION private.block_grn_qc_decision()
  $sql$;
END
$grn_trigger$;

DO $pellet_policies$
DECLARE
  target text;
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NULL
     OR to_regprocedure('private.can_record_pellet_fuel()') IS NULL THEN
    RAISE NOTICE 'approval gates: skipped pellet policies';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  FOREACH target IN ARRAY ARRAY['pellet_inwards', 'pellet_consumptions']
  LOOP
    IF to_regclass('public.' || target) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_access', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_select', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_insert', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_update', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_delete', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.can_record_pellet_fuel() OR private.can_any(ARRAY[''pellet_fuel'']))',
      target || '_select',
      target
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.can_record_pellet_fuel())',
      target || '_insert',
      target
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.can_record_pellet_fuel()) WITH CHECK (private.can_record_pellet_fuel())',
      target || '_update',
      target
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.can_record_pellet_fuel())',
      target || '_delete',
      target
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', target || '_record_role', target);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.reject_pellet_fuel_write()',
      target || '_record_role',
      target
    );
  END LOOP;

  IF to_regclass('public.pellet_grn_counters') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.pellet_grn_counters ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS pellet_grn_counters_access ON public.pellet_grn_counters';
  EXECUTE 'DROP POLICY IF EXISTS pellet_grn_counters_select ON public.pellet_grn_counters';
  EXECUTE 'DROP POLICY IF EXISTS pellet_grn_counters_insert ON public.pellet_grn_counters';
  EXECUTE 'DROP POLICY IF EXISTS pellet_grn_counters_update ON public.pellet_grn_counters';
  EXECUTE 'DROP POLICY IF EXISTS pellet_grn_counters_delete ON public.pellet_grn_counters';
  EXECUTE $sql$
    CREATE POLICY pellet_grn_counters_select ON public.pellet_grn_counters
      FOR SELECT TO authenticated
      USING (
        private.can_record_pellet_fuel()
        OR private.can_any(ARRAY['pellet_fuel', 'inventory', 'purchase_orders'])
      )
  $sql$;
  EXECUTE $sql$
    CREATE POLICY pellet_grn_counters_insert ON public.pellet_grn_counters
      FOR INSERT TO authenticated
      WITH CHECK (private.can_record_pellet_fuel())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY pellet_grn_counters_update ON public.pellet_grn_counters
      FOR UPDATE TO authenticated
      USING (private.can_record_pellet_fuel())
      WITH CHECK (private.can_record_pellet_fuel())
  $sql$;
  EXECUTE $sql$
    CREATE POLICY pellet_grn_counters_delete ON public.pellet_grn_counters
      FOR DELETE TO authenticated
      USING (private.can_record_pellet_fuel())
  $sql$;
  EXECUTE 'DROP TRIGGER IF EXISTS pellet_grn_counters_record_role ON public.pellet_grn_counters';
  EXECUTE $sql$
    CREATE TRIGGER pellet_grn_counters_record_role
      BEFORE INSERT OR UPDATE OR DELETE ON public.pellet_grn_counters
      FOR EACH ROW
      EXECUTE FUNCTION private.reject_pellet_counter_write()
  $sql$;
END
$pellet_policies$;

-- Number series shared with Inventory GRNs. Security definer so the read of
-- existing pellet GRN numbers and the counter update do not require the
-- caller to hold pellet stock rights. The check below still requires
-- inventory, purchase orders, or a pellet recorder role.
CREATE OR REPLACE FUNCTION public.allocate_pellet_grn_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := btrim(COALESCE(p_prefix, ''));
  observed bigint := 0;
  configured bigint := NULL;
  raw_setting text;
  issued bigint;
  candidate text;
  end_user boolean;
BEGIN
  IF v_prefix = '' OR length(v_prefix) > 40 OR v_prefix !~ '^[A-Za-z0-9][A-Za-z0-9/_.-]{0,39}$' THEN
    RAISE EXCEPTION 'GRN prefix is missing or cannot be used in a document number';
  END IF;

  end_user := coalesce(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
    OR (
      to_regprocedure('auth.uid()') IS NOT NULL
      AND auth.uid() IS NOT NULL
    );
  IF end_user
     AND to_regprocedure('private.has_role(text[])') IS NOT NULL
     AND to_regprocedure('private.can_any(text[])') IS NOT NULL
     AND NOT (
       private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Store Manager']::text[])
       OR private.can_any(ARRAY['inventory', 'purchase_orders']::text[])
     ) THEN
    RAISE EXCEPTION 'This account cannot reserve a GRN number'
      USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.allocate_pellet_grn_number(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.allocate_pellet_grn_number(text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.allocate_pellet_grn_number(text) TO authenticated';
  END IF;
END $$;
