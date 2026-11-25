-- Direct slitting converts one or more in-stock film rolls of one size into
-- other widths, a same-width length split, or SFG/FG for an order.
--
-- The production-record roll trigger is not used. These rows use new ledger
-- kinds, so realize_roll_issue does not mint a same-width balance for the
-- slit portion. Unslit kilograms become a -BAL roll of the original item.
-- Nothing here writes a production record, a job slitting quantity, or job wastage.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.roll_conversions (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  converted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by text,
  created_by_uid uuid,
  order_id text,
  film_type text,
  micron numeric,
  width_mm numeric,
  metallocene_pct text,
  density numeric,
  consumed_kg numeric NOT NULL DEFAULT 0,
  output_kg numeric NOT NULL DEFAULT 0,
  trim_scrap_kg numeric NOT NULL DEFAULT 0,
  setting_scrap_kg numeric NOT NULL DEFAULT 0,
  balance_kg numeric NOT NULL DEFAULT 0,
  variance_kg numeric NOT NULL DEFAULT 0,
  metres_pct numeric,
  metres_status text,
  override boolean NOT NULL DEFAULT false,
  override_reason text,
  override_by text,
  notes text,
  result jsonb,
  reversed_at timestamptz,
  reversed_by text,
  reversal_reason text
);

COMMENT ON TABLE public.roll_conversions IS
  'One posted direct slit. It does not change a job production record.';

CREATE TABLE IF NOT EXISTS public.roll_conversion_parents (
  id text PRIMARY KEY,
  conversion_id text NOT NULL REFERENCES public.roll_conversions (id),
  barcode text NOT NULL,
  stock_item_id text,
  film_type text,
  micron numeric,
  width_mm numeric,
  metallocene_pct text,
  available_before numeric NOT NULL,
  status_before text,
  consumed_kg numeric NOT NULL,
  balance_kg numeric NOT NULL DEFAULT 0,
  balance_barcode text,
  purchase_rate numeric,
  vendor_name text,
  batch_no text,
  grn_no text,
  length_meters numeric,
  UNIQUE (conversion_id, barcode)
);

CREATE TABLE IF NOT EXISTS public.roll_conversion_outputs (
  id text PRIMARY KEY,
  conversion_id text NOT NULL REFERENCES public.roll_conversions (id),
  line_no integer NOT NULL,
  destination text NOT NULL CHECK (destination IN ('inventory', 'sfg', 'fg')),
  barcode text NOT NULL,
  stock_item_id text,
  order_id text,
  sfg_batch_code text,
  width_mm numeric NOT NULL,
  length_meters numeric,
  net_kg numeric NOT NULL,
  gross_kg numeric,
  tare_kg numeric,
  lane_no integer NOT NULL,
  item_created boolean NOT NULL DEFAULT false,
  purchase_rate numeric,
  UNIQUE (conversion_id, barcode)
);

CREATE INDEX IF NOT EXISTS roll_conversions_order_idx
  ON public.roll_conversions (order_id);
CREATE INDEX IF NOT EXISTS roll_conversion_parents_barcode_idx
  ON public.roll_conversion_parents (lower(barcode));
CREATE INDEX IF NOT EXISTS roll_conversion_outputs_item_idx
  ON public.roll_conversion_outputs (stock_item_id);
CREATE INDEX IF NOT EXISTS roll_conversion_outputs_order_idx
  ON public.roll_conversion_outputs (order_id);

DO $$
DECLARE
  old_name text;
BEGIN
  IF to_regclass('public.inventory_ledger_entries') IS NULL THEN
    RAISE EXCEPTION 'inventory_ledger_entries is missing';
  END IF;
  FOR old_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.inventory_ledger_entries'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%entry_kind%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.inventory_ledger_entries DROP CONSTRAINT %I',
      old_name
    );
  END LOOP;
  ALTER TABLE public.inventory_ledger_entries
    ADD CONSTRAINT inventory_ledger_entries_entry_kind_check
    CHECK (entry_kind IN (
      'issue',
      'balance_receipt',
      'conversion_issue',
      'conversion_receipt',
      'conversion_balance'
    ));
END $$;

COMMENT ON CONSTRAINT inventory_ledger_entries_entry_kind_check
  ON public.inventory_ledger_entries IS
  'Job issues stay issue and balance_receipt. Direct slitting uses the conversion kinds and does not call realize_roll_issue.';

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.role_permissions
  SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('direct_slitting', true),
      updated_at = pg_catalog.now()
  WHERE role IN ('Admin', 'Plant Manager', 'Production Manager', 'Store Manager')
    AND NOT (COALESCE(permissions, '{}'::jsonb) ? 'direct_slitting');

  UPDATE public.role_permissions
  SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('direct_slitting', false),
      updated_at = pg_catalog.now()
  WHERE role NOT IN ('Admin', 'Plant Manager', 'Production Manager', 'Store Manager')
    AND NOT (COALESCE(permissions, '{}'::jsonb) ? 'direct_slitting');
END $$;

CREATE OR REPLACE FUNCTION private.direct_slit_round(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_value IS NULL THEN NULL ELSE round(p_value, 2) END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_num(p_obj jsonb, p_key text, p_key_2 text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw text;
BEGIN
  IF p_obj IS NULL OR jsonb_typeof(p_obj) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  raw := NULLIF(btrim(p_obj ->> p_key), '');
  IF raw IS NULL AND p_key_2 IS NOT NULL THEN
    raw := NULLIF(btrim(p_obj ->> p_key_2), '');
  END IF;
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::numeric;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION '% must be a number', COALESCE(p_key, 'value') USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_text(p_obj jsonb, p_key text, p_key_2 text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p_obj ->> p_key), ''),
    CASE WHEN p_key_2 IS NULL THEN NULL ELSE NULLIF(btrim(p_obj ->> p_key_2), '') END
  );
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_film_code(p_film text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  str text := upper(btrim(COALESCE(p_film, '')));
BEGIN
  IF str = '' THEN
    RETURN 'PET';
  END IF;
  IF str LIKE '%MATTA%' OR str LIKE '%ATTA%' THEN
    RETURN 'MATTA';
  END IF;
  IF str LIKE '%NMET%' OR (str LIKE '%NATURAL%' AND str LIKE '%METALLOCENE%') THEN
    RETURN 'NMET';
  END IF;
  IF str LIKE '%MMET%' OR (str LIKE '%MILKY%' AND str LIKE '%METALLOCENE%') THEN
    RETURN 'MMET';
  END IF;
  IF str LIKE '%MGP%' OR (str LIKE '%MILKY%' AND str LIKE '%GP%') THEN
    RETURN 'MGP';
  END IF;
  IF str LIKE '%NGP%' OR (str LIKE '%NATURAL%' AND str LIKE '%GP%') THEN
    RETURN 'NGP';
  END IF;
  str := regexp_replace(str, '[^A-Z0-9_-]', '', 'g');
  IF str = '' THEN
    RETURN 'PET';
  END IF;
  RETURN str;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_meta_eligible(p_film text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'MATTA', 'NMET', 'MMET', 'MGP', 'NGP', 'MILKY ATTA', 'NATURAL METALLOCENE',
      'MILKY METALLOCENE', 'MILKY GP', 'NATURAL GP', 'NATURAL GP LD',
      'NATURAL LD GP FILM', 'MILKY LD GP FILM', 'NATURAL LD METALLOCENE FILM',
      'MILKY LD METALLOCENE FILM', 'MILKY ATTA (HIGH DART) FILM'
    ]) AS candidate(name)
    WHERE upper(btrim(COALESCE(p_film, ''))) = candidate.name
       OR upper(btrim(COALESCE(p_film, ''))) LIKE '%' || candidate.name || '%'
       OR candidate.name LIKE '%' || upper(btrim(COALESCE(p_film, ''))) || '%'
  );
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_meta_key(p_meta text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(COALESCE(p_meta, ''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_item_name(
  p_film text,
  p_width numeric,
  p_micron numeric,
  p_meta text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  name text;
  pct text;
BEGIN
  name := private.direct_slit_film_code(p_film)
    || '-' || trim_scale(p_width)::text
    || '-' || trim_scale(p_micron)::text;
  IF private.direct_slit_meta_eligible(p_film) AND btrim(COALESCE(p_meta, '')) <> '' THEN
    pct := btrim(p_meta);
    IF right(pct, 1) <> '%' THEN
      pct := pct || '%';
    END IF;
    name := name || '-' || pct;
  END IF;
  RETURN name;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_metres(
  p_kg numeric,
  p_width numeric,
  p_micron numeric,
  p_density numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_kg, 0) <= 0 OR COALESCE(p_width, 0) <= 0
      OR COALESCE(p_micron, 0) <= 0 OR COALESCE(p_density, 0) <= 0
      THEN 0
    ELSE round((p_kg * 1000000) / (p_width * p_micron * p_density))
  END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_exact_metres(
  p_kg numeric,
  p_width numeric,
  p_micron numeric,
  p_density numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_kg, 0) <= 0 OR COALESCE(p_width, 0) <= 0
      OR COALESCE(p_micron, 0) <= 0 OR COALESCE(p_density, 0) <= 0
      THEN 0
    ELSE (p_kg * 1000000) / (p_width * p_micron * p_density)
  END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_actor()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(u.full_name), ''), NULLIF(btrim(u.username), ''), u.id)
  FROM public.users AS u
  WHERE auth.uid() IS NOT NULL
    AND (u.auth_user_id = auth.uid() OR (u.auth_user_id IS NULL AND u.id = auth.uid()::text))
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_can_post()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  roles text[];
  role_name text;
  perms jsonb;
BEGIN
  IF auth.uid() IS NULL OR to_regprocedure('private.app_roles()') IS NULL THEN
    RETURN false;
  END IF;
  roles := private.app_roles();
  IF roles IS NULL OR cardinality(roles) = 0 THEN
    RETURN false;
  END IF;
  IF 'Admin' = ANY (roles) THEN
    RETURN true;
  END IF;
  FOREACH role_name IN ARRAY roles LOOP
    perms := NULL;
    IF to_regclass('public.role_permissions') IS NOT NULL THEN
      SELECT rp.permissions INTO perms
      FROM public.role_permissions AS rp
      WHERE rp.role = role_name;
    END IF;
    IF perms IS NOT NULL AND perms ? 'direct_slitting' THEN
      IF perms -> 'direct_slitting' = 'true'::jsonb THEN
        RETURN true;
      END IF;
    ELSIF role_name IN ('Admin', 'Plant Manager', 'Production Manager', 'Store Manager') THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_can_override()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND to_regprocedure('private.app_roles()') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM unnest(private.app_roles()) AS granted(role_name)
      WHERE granted.role_name IN ('Admin', 'Plant Manager')
    );
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_can_reverse()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.direct_slit_can_post()
    AND EXISTS (
      SELECT 1
      FROM unnest(private.app_roles()) AS granted(role_name)
      WHERE granted.role_name IN ('Admin', 'Plant Manager', 'Store Manager')
    );
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_next_item_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  max_num integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('direct-slit-invt'), 1);
  SELECT COALESCE(MAX(substring(item.id FROM '[0-9]+')::integer), 0)
    INTO max_num
  FROM public.inventory AS item
  WHERE item.id ~* '^INVT-[0-9]+$';
  LOOP
    max_num := max_num + 1;
    found := 0;
    PERFORM 1 FROM public.inventory
    WHERE lower(btrim(id)) = lower('INVT-' || lpad(max_num::text, 4, '0'));
    IF NOT FOUND THEN
      RETURN 'INVT-' || lpad(max_num::text, 4, '0');
    END IF;
    IF max_num > 1000000 THEN
      RAISE EXCEPTION 'Could not allocate an inventory id';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_barcode(p_prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  code text;
  attempt integer := 0;
  taken boolean;
BEGIN
  LOOP
    attempt := attempt + 1;
    code := p_prefix || '-' || to_char(pg_catalog.now(), 'YYYYMMDD') || '-'
      || upper(substr(md5(pg_catalog.random()::text || clock_timestamp()::text || attempt::text), 1, 8));
    IF code ~* '-BAL$' THEN
      CONTINUE;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_rolls AS roll
      WHERE lower(btrim(roll.barcode_id)) = lower(code)
    ) INTO taken;
    IF NOT taken AND to_regclass('public.deleted_barcodes') IS NOT NULL THEN
      EXECUTE
        'SELECT EXISTS (SELECT 1 FROM public.deleted_barcodes WHERE lower(btrim(barcode)) = lower($1))'
        INTO taken
        USING code;
    END IF;
    IF NOT taken THEN
      RETURN code;
    END IF;
    IF attempt > 40 THEN
      RAISE EXCEPTION 'Could not allocate a roll barcode';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_resolve_item(
  p_hint text,
  p_film text,
  p_micron numeric,
  p_width numeric,
  p_meta text,
  p_category text,
  p_density numeric,
  p_price numeric,
  p_parent_item text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  DECLARE
  item public.inventory%ROWTYPE;
  wanted_name text;
  spec text;
  chosen text;
  active boolean;
  new_id text;
  meta_store text;
BEGIN
  wanted_name := private.direct_slit_item_name(p_film, p_width, p_micron, p_meta);
  meta_store := NULLIF(btrim(COALESCE(p_meta, '')), '');
  IF meta_store IS NOT NULL AND right(meta_store, 1) <> '%' THEN
    meta_store := meta_store || '%';
  END IF;
  IF to_regprocedure('private.inventory_spec_key(text, text, numeric, numeric)') IS NOT NULL THEN
    spec := private.inventory_spec_key(wanted_name, COALESCE(NULLIF(btrim(p_category), ''), 'Film Substrates'), p_micron, p_width);
    PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('direct-slit-spec'), hashtext(spec));
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      hashtext('direct-slit-spec'),
      hashtext(lower(COALESCE(p_film, '')) || '|' || COALESCE(p_micron::text, '') || '|' || COALESCE(p_width::text, ''))
    );
  END IF;

  IF NULLIF(btrim(COALESCE(p_hint, '')), '') IS NOT NULL THEN
    SELECT * INTO item
    FROM public.inventory
    WHERE id = btrim(p_hint) OR lower(btrim(COALESCE(item_code, ''))) = lower(btrim(p_hint))
    ORDER BY (id = btrim(p_hint)) DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock item % was not found', p_hint USING ERRCODE = '22023';
    END IF;
    IF COALESCE(item.is_active, true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Stock item % is archived', item.id USING ERRCODE = '22023';
    END IF;
    IF item.micron IS DISTINCT FROM p_micron OR item.width_mm IS DISTINCT FROM p_width
       OR private.direct_slit_meta_key(item.metallocene_pct) IS DISTINCT FROM private.direct_slit_meta_key(p_meta)
       OR (
         lower(btrim(COALESCE(item.film_type, ''))) IS DISTINCT FROM lower(btrim(COALESCE(p_film, '')))
         AND private.direct_slit_film_code(item.film_type) IS DISTINCT FROM private.direct_slit_film_code(p_film)
       ) THEN
      RAISE EXCEPTION 'Stock item % is not this film, micron, grade, and width', item.id
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', item.id, 'created', false, 'name', item.item_name, 'rate', item.unit_price);
  END IF;

  SELECT stock.id INTO chosen
  FROM public.inventory AS stock
  WHERE COALESCE(stock.is_active, true) IS TRUE
    AND stock.micron = p_micron
    AND stock.width_mm = p_width
    AND private.direct_slit_meta_key(stock.metallocene_pct) = private.direct_slit_meta_key(p_meta)
    AND (
      lower(btrim(COALESCE(stock.film_type, ''))) = lower(btrim(COALESCE(p_film, '')))
      OR private.direct_slit_film_code(stock.film_type) = private.direct_slit_film_code(p_film)
    )
  ORDER BY
    (lower(btrim(COALESCE(stock.category, ''))) = lower(btrim(COALESCE(p_category, '')))) DESC,
    CASE WHEN stock.id ~* '^INVT-[0-9]+$' THEN substring(stock.id FROM '[0-9]+')::integer ELSE 1000000000 END,
    stock.id
  LIMIT 1;
  IF chosen IS NOT NULL THEN
    RETURN jsonb_build_object('id', chosen, 'created', false, 'name', (SELECT item_name FROM public.inventory WHERE id = chosen));
  END IF;

  IF spec IS NOT NULL THEN
    SELECT existing.id, COALESCE(existing.is_active, true)
      INTO chosen, active
    FROM public.inventory AS existing
    WHERE private.inventory_spec_key(existing.item_name, existing.category, existing.micron, existing.width_mm) = spec
    ORDER BY COALESCE(existing.is_active, true) DESC, existing.id
    LIMIT 1;
    IF chosen IS NOT NULL AND active IS TRUE THEN
      RETURN jsonb_build_object('id', chosen, 'created', false, 'name', (SELECT item_name FROM public.inventory WHERE id = chosen));
    END IF;
    IF chosen IS NOT NULL THEN
      RAISE EXCEPTION 'Archived stock item % already has this width. Restore that item instead of creating another.', chosen
        USING ERRCODE = '22023';
    END IF;
  END IF;

  new_id := private.direct_slit_next_item_id();
  INSERT INTO public.inventory (
    id, item_code, item_name, stock_qty_kg, unit_price, category, film_type,
    micron, width_mm, unit, density, metallocene_pct, is_active, last_updated, metadata
  ) VALUES (
    new_id,
    new_id,
    wanted_name,
    0,
    COALESCE(p_price, 0),
    COALESCE(NULLIF(btrim(p_category), ''), 'Film Substrates'),
    p_film,
    p_micron,
    p_width,
    'Kg',
    p_density,
    meta_store,
    true,
    pg_catalog.now(),
    jsonb_build_object('createdBy', 'direct-slitting', 'parentItemId', p_parent_item)
  );
  RETURN jsonb_build_object('id', new_id, 'created', true, 'name', wanted_name, 'rate', COALESCE(p_price, 0));
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_move_stock(p_item_id text, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  moved numeric;
  need numeric;
BEGIN
  need := private.direct_slit_round(p_delta);
  IF need IS NULL OR need = 0 OR p_item_id IS NULL THEN
    RETURN;
  END IF;
  IF to_regprocedure('private.add_item_stock(text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'Stock cannot be posted because add_item_stock is missing';
  END IF;
  moved := private.add_item_stock(p_item_id, need);
  IF moved IS DISTINCT FROM need THEN
    RAISE EXCEPTION 'Not enough kilograms on stock item %', p_item_id USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_post(p_doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  actor text;
  conv_id text;
  existing_status text;
  existing_result jsonb;
  elem jsonb;
  parents jsonb := '[]'::jsonb;
  outputs jsonb := '[]'::jsonb;
  parent jsonb;
  output jsonb;
  barcode text;
  consumed numeric;
  roll public.inventory_rolls%ROWTYPE;
  item public.inventory%ROWTYPE;
  film text;
  micron numeric;
  width_mm numeric;
  meta text;
  density numeric;
  category text;
  price numeric;
  first boolean := true;
  trim_kg numeric;
  setting_kg numeric;
  line_no integer := 0;
  destination text;
  net_kg numeric;
  out_width numeric;
  lane integer;
  order_id text;
  header_order text;
  notes text;
  reason text;
  consumed_sum numeric := 0;
  output_sum numeric := 0;
  balance_sum numeric := 0;
  balance_kg numeric;
  variance numeric;
  parent_run numeric := 0;
  parent_area numeric := 0;
  output_area numeric := 0;
  scrap_area numeric := 0;
  lane_metres jsonb := '{}'::jsonb;
  lane_key text;
  lane_pct numeric := 0;
  area_pct numeric := 0;
  metres_pct numeric := 0;
  metres_status text := 'ok';
  this_run numeric;
  this_exact numeric;
  override boolean := false;
  warnings jsonb := '[]'::jsonb;
  summary jsonb;
  resolved jsonb;
  batches jsonb := '{}'::jsonb;
  batch_code text;
  batch_key text;
  child_code text;
  bal_code text;
  job_name text;
  job_code text;
  client_name text;
  order_json jsonb;
  stage_type text;
  roll_type text;
  roll_category text;
  roll_status text;
  sfg_status text;
  deduct jsonb := '{}'::jsonb;
  receipt jsonb := '{}'::jsonb;
  item_key text;
  scrap_id text;
  rate numeric;
  out_metres integer;
  gross_kg numeric;
  tare_kg numeric;
  blocked boolean;
  attempt integer;
  suffix text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.direct_slit_can_post() THEN
    RAISE EXCEPTION 'Not allowed to post a direct slit' USING ERRCODE = '42501';
  END IF;
  IF p_doc IS NULL OR jsonb_typeof(p_doc) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Direct slit details are missing' USING ERRCODE = '22023';
  END IF;

  actor := private.direct_slit_actor();
  conv_id := private.direct_slit_text(p_doc, 'id', 'conversionId');
  IF conv_id IS NOT NULL THEN
    IF conv_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$' THEN
      RAISE EXCEPTION 'Conversion id is not valid' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('direct-slit'), hashtext(conv_id));
    SELECT status, result INTO existing_status, existing_result
    FROM public.roll_conversions
    WHERE id = conv_id
    FOR UPDATE;
    IF FOUND AND existing_status = 'posted' THEN
      RETURN existing_result;
    END IF;
    IF FOUND THEN
      RAISE EXCEPTION 'Conversion % is already reversed', conv_id USING ERRCODE = '22023';
    END IF;
  END IF;

  header_order := private.direct_slit_text(p_doc, 'orderId', 'order_id');
  notes := private.direct_slit_text(p_doc, 'notes');
  reason := private.direct_slit_text(p_doc, 'overrideReason', 'override_reason');
  trim_kg := COALESCE(private.direct_slit_num(p_doc, 'trimScrapKg', 'trim_scrap_kg'), 0);
  setting_kg := COALESCE(private.direct_slit_num(p_doc, 'settingScrapKg', 'setting_scrap_kg'), 0);
  IF trim_kg < 0 OR setting_kg < 0 THEN
    RAISE EXCEPTION 'Scrap kilograms cannot be negative' USING ERRCODE = '22023';
  END IF;
  trim_kg := private.direct_slit_round(trim_kg);
  setting_kg := private.direct_slit_round(setting_kg);

  IF jsonb_typeof(p_doc -> 'parents') IS DISTINCT FROM 'array' OR jsonb_array_length(p_doc -> 'parents') < 1 THEN
    RAISE EXCEPTION 'Scan at least one parent roll' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_doc -> 'outputs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_doc -> 'outputs') < 1 THEN
    RAISE EXCEPTION 'Enter at least one output roll' USING ERRCODE = '22023';
  END IF;

  FOR elem IN
    SELECT value
    FROM jsonb_array_elements(p_doc -> 'parents') AS value
    ORDER BY lower(btrim(COALESCE(value ->> 'barcode', value ->> 'barcodeId', '')))
  LOOP
    barcode := COALESCE(private.direct_slit_text(elem, 'barcode', 'barcodeId'), '');
    consumed := private.direct_slit_round(private.direct_slit_num(elem, 'consumedKg', 'consumed_kg'));
    IF barcode = '' OR consumed IS NULL OR consumed <= 0 THEN
      RAISE EXCEPTION 'Each parent roll needs a barcode and kilograms consumed' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(parents) AS prior
      WHERE lower(prior ->> 'barcode') = lower(barcode)
    ) THEN
      RAISE EXCEPTION 'Roll % is listed twice', barcode USING ERRCODE = '22023';
    END IF;
    SELECT * INTO roll
    FROM public.inventory_rolls
    WHERE lower(btrim(barcode_id)) = lower(barcode)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Roll % is not in stock', barcode USING ERRCODE = '22023';
    END IF;
    barcode := roll.barcode_id;
    IF to_regprocedure('private.roll_barcode_blocked(text)') IS NOT NULL THEN
      EXECUTE 'SELECT private.roll_barcode_blocked($1)' INTO blocked USING barcode;
      IF blocked THEN
        RAISE EXCEPTION 'Roll % cannot be slit', barcode USING ERRCODE = '22023';
      END IF;
    END IF;
    IF COALESCE(roll.available_weight_kg, 0) <= 0
       OR lower(btrim(COALESCE(roll.status, ''))) LIKE 'issued%'
       OR lower(btrim(COALESCE(roll.status, ''))) IN ('written off', 'deleted', 'void', 'consumed', 'reversed')
       OR lower(btrim(COALESCE(roll.status, ''))) LIKE '%pending%'
       OR lower(btrim(COALESCE(roll.qc_status, ''))) LIKE '%pending%'
       OR lower(btrim(COALESCE(roll.status, ''))) LIKE '%reject%'
       OR lower(btrim(COALESCE(roll.qc_status, ''))) LIKE '%reject%' THEN
      RAISE EXCEPTION 'Roll % is not available to slit', barcode USING ERRCODE = '22023';
    END IF;
    IF consumed > roll.available_weight_kg + 0.001 THEN
      RAISE EXCEPTION 'Roll % only has % kg', barcode, private.direct_slit_round(roll.available_weight_kg)
        USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(COALESCE(roll.item_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Roll % is not linked to a stock item', barcode USING ERRCODE = '22023';
    END IF;
    SELECT * INTO item FROM public.inventory WHERE id = roll.item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock item for roll % was not found', barcode USING ERRCODE = '22023';
    END IF;
    IF COALESCE(item.is_active, true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Stock item % is archived', item.id USING ERRCODE = '22023';
    END IF;
    film := COALESCE(NULLIF(btrim(roll.film_type), ''), NULLIF(btrim(item.film_type), ''));
    micron := COALESCE(roll.micron, item.micron);
    width_mm := COALESCE(roll.width_mm, item.width_mm);
    meta := COALESCE(NULLIF(btrim(item.metallocene_pct), ''), NULLIF(btrim(roll.metallocene_pct), ''));
    IF film IS NULL OR micron IS NULL OR width_mm IS NULL THEN
      RAISE EXCEPTION 'Roll % has no film, micron, and width', barcode USING ERRCODE = '22023';
    END IF;
    IF first THEN
      density := CASE WHEN COALESCE(item.density, 0) > 0 THEN item.density ELSE 1.40 END;
      category := item.category;
      price := COALESCE(item.unit_price, 0);
      first := false;
    ELSE
      IF lower(btrim(film)) IS DISTINCT FROM lower(btrim(parents -> 0 ->> 'filmType'))
         AND private.direct_slit_film_code(film) IS DISTINCT FROM private.direct_slit_film_code(parents -> 0 ->> 'filmType') THEN
        RAISE EXCEPTION 'Parent rolls must be the same film' USING ERRCODE = '22023';
      END IF;
      IF micron IS DISTINCT FROM (parents -> 0 ->> 'micron')::numeric
         OR width_mm IS DISTINCT FROM (parents -> 0 ->> 'widthMm')::numeric
         OR private.direct_slit_meta_key(meta) IS DISTINCT FROM private.direct_slit_meta_key(parents -> 0 ->> 'metallocenePct') THEN
        RAISE EXCEPTION 'Parent rolls must be the same micron, grade, and width' USING ERRCODE = '22023';
      END IF;
      IF abs(COALESCE(CASE WHEN COALESCE(item.density, 0) > 0 THEN item.density ELSE 1.40 END, 0) - density) > 0.001 THEN
        RAISE EXCEPTION 'Parent rolls do not share a density' USING ERRCODE = '22023';
      END IF;
    END IF;
    balance_kg := private.direct_slit_round(roll.available_weight_kg - consumed);
    IF balance_kg < 0 THEN
      balance_kg := 0;
    END IF;
    parents := parents || jsonb_build_array(jsonb_build_object(
      'barcode', barcode,
      'itemId', item.id,
      'itemName', item.item_name,
      'filmType', film,
      'micron', micron,
      'widthMm', width_mm,
      'metallocenePct', meta,
      'category', item.category,
      'rate', COALESCE(item.unit_price, 0),
      'consumedKg', consumed,
      'balanceKg', balance_kg,
      'availableBefore', roll.available_weight_kg,
      'statusBefore', roll.status,
      'vendorName', roll.vendor_name,
      'batchNo', roll.batch_no,
      'grnNo', COALESCE(NULLIF(btrim(roll.metadata ->> 'grnNo'), ''), NULLIF(btrim(roll.grn_id), '')),
      'lengthMeters', roll.length_meters,
      'locationBay', roll.location_bay
    ));
    consumed_sum := private.direct_slit_round(consumed_sum + consumed);
    balance_sum := private.direct_slit_round(balance_sum + balance_kg);
    this_run := CASE
      WHEN COALESCE(roll.length_meters, 0) > 0 AND roll.available_weight_kg > 0
        THEN roll.length_meters * (consumed / roll.available_weight_kg)
      ELSE private.direct_slit_exact_metres(consumed, width_mm, micron, density)
    END;
    parent_run := parent_run + this_run;
    parent_area := parent_area + (width_mm * this_run);
  END LOOP;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_doc -> 'outputs') AS value
  LOOP
    line_no := line_no + 1;
    destination := lower(COALESCE(private.direct_slit_text(elem, 'destination'), 'inventory'));
    IF destination NOT IN ('inventory', 'sfg', 'fg') THEN
      RAISE EXCEPTION 'Output % destination must be inventory, sfg, or fg', line_no USING ERRCODE = '22023';
    END IF;
    net_kg := private.direct_slit_round(private.direct_slit_num(elem, 'netKg', 'net_kg'));
    out_width := private.direct_slit_num(elem, 'widthMm', 'width_mm');
    IF net_kg IS NULL OR net_kg <= 0 OR out_width IS NULL OR out_width <= 0 THEN
      RAISE EXCEPTION 'Output % needs a net weight and a width', line_no USING ERRCODE = '22023';
    END IF;
    IF out_width > width_mm + 0.01 THEN
      RAISE EXCEPTION 'Output % is wider than the parent roll', line_no USING ERRCODE = '22023';
    END IF;
    gross_kg := private.direct_slit_num(elem, 'grossKg', 'gross_kg');
    tare_kg := private.direct_slit_num(elem, 'tareKg', 'tare_kg');
    IF gross_kg IS NOT NULL AND tare_kg IS NOT NULL AND gross_kg < tare_kg THEN
      RAISE EXCEPTION 'Output % gross weight is below its tare', line_no USING ERRCODE = '22023';
    END IF;
    lane := COALESCE(private.direct_slit_num(elem, 'lane', 'laneNo')::integer, line_no);
    IF lane < 1 THEN
      lane := line_no;
    END IF;
    order_id := COALESCE(private.direct_slit_text(elem, 'orderId', 'order_id'), header_order);
    IF destination IN ('sfg', 'fg') AND order_id IS NULL THEN
      RAISE EXCEPTION 'Output % needs an order', line_no USING ERRCODE = '22023';
    END IF;
    this_exact := private.direct_slit_exact_metres(net_kg, out_width, micron, density);
    output_area := output_area + (out_width * this_exact);
    lane_key := lane::text;
    lane_metres := jsonb_set(
      lane_metres,
      ARRAY[lane_key],
      to_jsonb(COALESCE((lane_metres ->> lane_key)::numeric, 0) + this_exact),
      true
    );
    outputs := outputs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'lineNo', line_no,
      'destination', destination,
      'netKg', net_kg,
      'widthMm', out_width,
      'grossKg', gross_kg,
      'tareKg', tare_kg,
      'lane', lane,
      'orderId', order_id,
      'stockItemId', private.direct_slit_text(elem, 'stockItemId', 'stock_item_id'),
      'stageType', private.direct_slit_text(elem, 'stageType', 'sfgType'),
      'lengthMeters', private.direct_slit_metres(net_kg, out_width, micron, density)
    )));
    output_sum := private.direct_slit_round(output_sum + net_kg);
  END LOOP;

  variance := private.direct_slit_round(consumed_sum - output_sum - trim_kg - setting_kg);
  scrap_area := CASE
    WHEN micron > 0 AND density > 0 THEN ((trim_kg + setting_kg) * 1000000) / (micron * density)
    ELSE 0
  END;
  IF parent_area > 0 THEN
    area_pct := (abs(output_area + scrap_area - parent_area) / parent_area) * 100;
  END IF;
  IF parent_run > 0 THEN
    FOR lane_key IN SELECT jsonb_object_keys(lane_metres)
    LOOP
      this_exact := (lane_metres ->> lane_key)::numeric;
      this_run := (abs(this_exact - parent_run) / parent_run) * 100;
      IF this_run > lane_pct THEN
        lane_pct := this_run;
      END IF;
    END LOOP;
  END IF;
  metres_pct := round(GREATEST(area_pct, lane_pct), 2);
  IF metres_pct > 25 THEN
    metres_status := 'block';
  ELSIF metres_pct > 8 THEN
    metres_status := 'warn';
    warnings := warnings || jsonb_build_array(
      'Running length is ' || metres_pct::text || '% away from the parent roll.'
    );
  END IF;

  IF abs(variance) > 0.50 OR metres_status = 'block' THEN
    IF NOT private.direct_slit_can_override() OR reason IS NULL THEN
      IF abs(variance) > 0.50 THEN
        RAISE EXCEPTION 'Mass balance is off by % kg. An Admin or Plant Manager can post it with a reason.', variance
          USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Running length is % percent away from the parent roll. An Admin or Plant Manager can post it with a reason.', metres_pct
        USING ERRCODE = '22023';
    END IF;
    override := true;
  END IF;

  IF conv_id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('direct-slit-id'), 1);
    SELECT COALESCE(MAX(substring(id FROM '[0-9]+$')::integer), 0) + 1
      INTO line_no
    FROM public.roll_conversions
    WHERE id LIKE 'CONV-' || to_char(pg_catalog.now(), 'YYYYMMDD') || '-%';
    conv_id := 'CONV-' || to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || lpad(line_no::text, 4, '0');
  END IF;

  INSERT INTO public.roll_conversions (
    id, status, created_by, created_by_uid, order_id, film_type, micron, width_mm,
    metallocene_pct, density, consumed_kg, output_kg, trim_scrap_kg, setting_scrap_kg,
    balance_kg, variance_kg, metres_pct, metres_status, override, override_reason,
    override_by, notes
  ) VALUES (
    conv_id, 'posted', actor, auth.uid(), header_order, film, micron, width_mm,
    meta, density, consumed_sum, output_sum, trim_kg, setting_kg,
    balance_sum, variance, metres_pct, metres_status, override,
    CASE WHEN override THEN reason ELSE NULL END,
    CASE WHEN override THEN actor ELSE NULL END,
    notes
  );

  FOR parent IN SELECT value FROM jsonb_array_elements(parents) AS value
  LOOP
    barcode := parent ->> 'barcode';
    consumed := (parent ->> 'consumedKg')::numeric;
    balance_kg := (parent ->> 'balanceKg')::numeric;
    bal_code := NULL;
    UPDATE public.inventory_rolls
    SET available_weight_kg = 0,
        status = 'Issued to Direct Slitting'
    WHERE barcode_id = barcode;
      IF balance_kg > 0 THEN
      bal_code := barcode || '-BAL';
      IF EXISTS (
        SELECT 1 FROM public.inventory_rolls
        WHERE lower(btrim(barcode_id)) = lower(bal_code)
          AND lower(btrim(COALESCE(status, ''))) LIKE 'in stock%'
          AND COALESCE(available_weight_kg, 0) > 0
      ) THEN
        RAISE EXCEPTION 'Balance barcode % already exists', bal_code USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, micron, width_mm, film_type,
        net_weight_kg, available_weight_kg, gross_weight_kg, status, qc_status, location_bay,
        inward_datetime, vendor_name, batch_no, length_meters, metallocene_pct, metadata
      ) VALUES (
        bal_code,
        'RAW_MATERIAL',
        parent ->> 'itemId',
        COALESCE(parent ->> 'itemName', film),
        COALESCE(parent ->> 'category', 'Film Substrates'),
        micron,
        width_mm,
        film,
        balance_kg,
        balance_kg,
        balance_kg,
        'In Stock (RM)',
        'Approved',
        COALESCE(parent ->> 'locationBay', 'RM Store - Substrate Rolls'),
        pg_catalog.now(),
        parent ->> 'vendorName',
        parent ->> 'batchNo',
        CASE
          WHEN COALESCE((parent ->> 'lengthMeters')::numeric, 0) > 0
            AND COALESCE((parent ->> 'availableBefore')::numeric, 0) > 0
            THEN round((parent ->> 'lengthMeters')::numeric * balance_kg / (parent ->> 'availableBefore')::numeric)
          ELSE private.direct_slit_metres(balance_kg, width_mm, micron, density)
        END,
        NULLIF(parent ->> 'metallocenePct', ''),
        jsonb_build_object(
          'balanceRoll', true,
          'parentBarcodeId', barcode,
          'conversionId', conv_id,
          'directSlitting', true,
          'purchaseRatePerKg', COALESCE((parent ->> 'rate')::numeric, 0)
        )
      )
      ON CONFLICT (barcode_id) DO UPDATE
      SET item_id = EXCLUDED.item_id,
          item_name = EXCLUDED.item_name,
          net_weight_kg = EXCLUDED.net_weight_kg,
          available_weight_kg = EXCLUDED.available_weight_kg,
          gross_weight_kg = EXCLUDED.gross_weight_kg,
          status = EXCLUDED.status,
          qc_status = EXCLUDED.qc_status,
          length_meters = EXCLUDED.length_meters,
          metadata = EXCLUDED.metadata,
          inward_datetime = EXCLUDED.inward_datetime;
    END IF;
    INSERT INTO public.roll_conversion_parents (
      id, conversion_id, barcode, stock_item_id, film_type, micron, width_mm, metallocene_pct,
      available_before, status_before, consumed_kg, balance_kg, balance_barcode,
      purchase_rate, vendor_name, batch_no, grn_no, length_meters
    ) VALUES (
      'parent:' || conv_id || ':' || lower(barcode),
      conv_id, barcode, parent ->> 'itemId', film, micron, width_mm, NULLIF(parent ->> 'metallocenePct', ''),
      (parent ->> 'availableBefore')::numeric, parent ->> 'statusBefore', consumed, balance_kg, bal_code,
      COALESCE((parent ->> 'rate')::numeric, 0), parent ->> 'vendorName', parent ->> 'batchNo',
      parent ->> 'grnNo', NULLIF(parent ->> 'lengthMeters', '')::numeric
    );
    INSERT INTO public.inventory_ledger_entries (
      id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, stock_item_id,
      order_id, qty_kg, consumed_kg, applied_stock_kg, qty_source, film_type, micron, width_mm,
      item_name, purchase_rate, vendor_name, batch_no, grn_no, occurred_at
    ) VALUES (
      'conv-issue:' || conv_id || ':' || lower(barcode),
      'conversion_issue', 'conv:' || conv_id, 'Direct Slitting', barcode, lower(barcode), barcode,
      parent ->> 'itemId', header_order, consumed, consumed, consumed, 'direct_slitting',
      film, micron, width_mm, parent ->> 'itemName', COALESCE((parent ->> 'rate')::numeric, 0),
      parent ->> 'vendorName', parent ->> 'batchNo', parent ->> 'grnNo', pg_catalog.now()
    );
    IF balance_kg > 0 THEN
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, balance_barcode,
        stock_item_id, order_id, qty_kg, consumed_kg, balance_kg, applied_stock_kg, qty_source,
        film_type, micron, width_mm, item_name, purchase_rate, vendor_name, batch_no, grn_no, occurred_at
      ) VALUES (
        'conv-balance:' || conv_id || ':' || lower(bal_code),
        'conversion_balance', 'conv:' || conv_id, 'Direct Slitting', bal_code, lower(bal_code),
        barcode, bal_code, parent ->> 'itemId', header_order, balance_kg, 0, balance_kg, 0,
        'direct_slitting', film, micron, width_mm,
        COALESCE(parent ->> 'itemName', film), COALESCE((parent ->> 'rate')::numeric, 0),
        parent ->> 'vendorName', parent ->> 'batchNo', parent ->> 'grnNo',
        pg_catalog.now() + interval '1 second'
      );
    END IF;
    item_key := parent ->> 'itemId';
    deduct := jsonb_set(
      deduct,
      ARRAY[item_key],
      to_jsonb(COALESCE((deduct ->> item_key)::numeric, 0) + consumed),
      true
    );
  END LOOP;

  FOR output IN SELECT value FROM jsonb_array_elements(outputs) AS value
  LOOP
    destination := output ->> 'destination';
    net_kg := (output ->> 'netKg')::numeric;
    out_width := (output ->> 'widthMm')::numeric;
    lane := (output ->> 'lane')::integer;
    line_no := (output ->> 'lineNo')::integer;
    order_id := NULLIF(output ->> 'orderId', '');
    out_metres := (output ->> 'lengthMeters')::integer;
    gross_kg := NULLIF(output ->> 'grossKg', '')::numeric;
    tare_kg := NULLIF(output ->> 'tareKg', '')::numeric;
    rate := COALESCE((parents -> 0 ->> 'rate')::numeric, 0);

    IF destination = 'inventory' THEN
      resolved := private.direct_slit_resolve_item(
        output ->> 'stockItemId', film, micron, out_width, meta, category, density, price, parents -> 0 ->> 'itemId'
      );
      child_code := private.direct_slit_barcode('RM-BC');
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_id, item_name, category, micron, width_mm, film_type,
        net_weight_kg, available_weight_kg, gross_weight_kg, tare_weight_kg, status, qc_status,
        location_bay, inward_datetime, vendor_name, batch_no, length_meters, metallocene_pct,
        input_barcode_ids, metadata
      ) VALUES (
        child_code, 'RAW_MATERIAL', resolved ->> 'id', resolved ->> 'name',
        COALESCE(category, 'Film Substrates'), micron, out_width, film,
        net_kg, net_kg, COALESCE(gross_kg, net_kg), COALESCE(tare_kg, 0),
        'In Stock (RM)', 'Approved',
        COALESCE(parents -> 0 ->> 'locationBay', 'RM Store - Substrate Rolls'),
        pg_catalog.now(), parents -> 0 ->> 'vendorName', parents -> 0 ->> 'batchNo',
        out_metres, NULLIF(meta, ''),
        (SELECT jsonb_agg(p ->> 'barcode') FROM jsonb_array_elements(parents) AS p),
        jsonb_build_object(
          'directSlitting', true,
          'conversionId', conv_id,
          'parentBarcodeId', parents -> 0 ->> 'barcode',
          'lane', lane,
          'purchaseRatePerKg', rate
        )
      );
      item_key := resolved ->> 'id';
      receipt := jsonb_set(
        receipt,
        ARRAY[item_key],
        to_jsonb(COALESCE((receipt ->> item_key)::numeric, 0) + net_kg),
        true
      );
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, stock_item_id,
        order_id, qty_kg, consumed_kg, applied_stock_kg, qty_source, film_type, micron, width_mm,
        item_name, purchase_rate, vendor_name, batch_no, grn_no, occurred_at
      ) VALUES (
        'conv-receipt:' || conv_id || ':' || lower(child_code),
        'conversion_receipt', 'conv:' || conv_id, 'Direct Slitting', child_code, lower(child_code),
        parents -> 0 ->> 'barcode', item_key, header_order, net_kg, 0, net_kg, 'direct_slitting',
        film, micron, out_width, resolved ->> 'name', rate,
        parents -> 0 ->> 'vendorName', parents -> 0 ->> 'batchNo', parents -> 0 ->> 'grnNo',
        pg_catalog.now()
      );
      INSERT INTO public.roll_conversion_outputs (
        id, conversion_id, line_no, destination, barcode, stock_item_id, order_id,
        width_mm, length_meters, net_kg, gross_kg, tare_kg, lane_no, item_created, purchase_rate
      ) VALUES (
        'out:' || conv_id || ':' || line_no, conv_id, line_no, 'inventory', child_code, item_key,
        order_id, out_width, out_metres, net_kg, gross_kg, tare_kg, lane,
        COALESCE((resolved ->> 'created')::boolean, false), rate
      );
    ELSE
      IF to_regclass('public.orders') IS NULL OR to_regclass('public.sfg_goods') IS NULL THEN
        RAISE EXCEPTION 'SFG store is not available' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(o) INTO order_json FROM public.orders AS o WHERE o.id = order_id;
      IF order_json IS NULL THEN
        RAISE EXCEPTION 'Order % was not found', order_id USING ERRCODE = '22023';
      END IF;
      job_name := COALESCE(NULLIF(btrim(order_json ->> 'job_name'), ''), 'Direct slit');
      job_code := COALESCE(
        NULLIF(btrim(order_json ->> 'job_code'), ''),
        NULLIF(btrim(order_json #>> '{job_details,jobCode}'), ''),
        order_id
      );
      client_name := NULLIF(btrim(order_json ->> 'client_name'), '');
      batch_key := destination || ':' || order_id;
      IF batches ? batch_key THEN
        batch_code := batches ->> batch_key;
        UPDATE public.sfg_goods
        SET total_net_kg = COALESCE(total_net_kg, 0) + net_kg,
            available_kg = COALESCE(available_kg, 0) + net_kg,
            total_gross_kg = COALESCE(total_gross_kg, 0) + COALESCE(gross_kg, net_kg),
            gross_weight_kg = COALESCE(gross_weight_kg, 0) + COALESCE(gross_kg, net_kg),
            total_meters = COALESCE(total_meters, 0) + out_metres,
            rolls_count = COALESCE(rolls_count, 0) + 1,
            width_mm = CASE WHEN width_mm IS NOT DISTINCT FROM out_width THEN width_mm ELSE NULL END,
            updated_at = pg_catalog.now()
        WHERE sfg_batch_code = batch_code;
      ELSE
        suffix := right(regexp_replace(conv_id, '[^A-Za-z0-9]', '', 'g'), 6);
        batch_code := CASE WHEN destination = 'fg' THEN 'FG' ELSE 'SFG' END
          || '-DS-' || regexp_replace(upper(job_code), '[^A-Z0-9]', '', 'g') || '-' || suffix;
        stage_type := COALESCE(
          NULLIF(output ->> 'stageType', ''),
          CASE WHEN destination = 'fg' THEN 'Slitted Rolls' ELSE 'Direct Slit Film' END
        );
        sfg_status := CASE
          WHEN destination = 'fg' THEN 'In Stock (Ready for Dispatch)'
          ELSE 'In Stock (WIP)'
        END;
        INSERT INTO public.sfg_goods (
          id, sfg_batch_code, sfg_type, order_id, job_name, job_code, client_name,
          film_type, micron, width_mm, total_gross_kg, gross_weight_kg, tare_weight_kg,
          total_net_kg, consumed_kg, available_kg, total_meters, rolls_count,
          operator_name, storage_bay, production_date, unit_valuation_rate, status,
          notes, is_opening_balance, created_at, updated_at
        ) VALUES (
          pg_catalog.gen_random_uuid(), batch_code, stage_type, order_id, job_name, job_code, client_name,
          film, micron, out_width, COALESCE(gross_kg, net_kg), COALESCE(gross_kg, net_kg), COALESCE(tare_kg, 0),
          net_kg, 0, net_kg, out_metres, 1,
          actor, CASE WHEN destination = 'fg' THEN 'FG Warehouse' ELSE 'Bay A' END,
          (pg_catalog.now())::date, rate, sfg_status,
          jsonb_build_object('directSlitting', true, 'conversionId', conv_id)::text,
          false, pg_catalog.now(), pg_catalog.now()
        );
        batches := batches || jsonb_build_object(batch_key, batch_code);
      END IF;
      stage_type := COALESCE(
        NULLIF(output ->> 'stageType', ''),
        CASE WHEN destination = 'fg' THEN 'Slitted Rolls' ELSE 'Direct Slit Film' END
      );
      roll_type := CASE WHEN destination = 'fg' THEN 'FG' ELSE 'SEMI_FINISHED_GOODS' END;
      roll_category := CASE
        WHEN destination = 'fg' THEN 'Finished Goods (FG)'
        ELSE 'Semi-Finished Goods (SFG)'
      END;
      roll_status := CASE
        WHEN destination = 'fg' THEN 'In Stock (Ready for Dispatch)'
        ELSE 'In Stock (SFG)'
      END;
      child_code := NULL;
      FOR attempt IN 1..40 LOOP
        suffix := CASE WHEN destination = 'fg' THEN 'FG' ELSE 'SFG' END
          || '-SLT-' || regexp_replace(upper(job_code), '[^A-Z0-9]', '', 'g')
          || '-R' || lpad((line_no + attempt - 1)::text, 2, '0');
        IF attempt > 1 THEN
          suffix := suffix || '-' || right(regexp_replace(conv_id, '[^A-Za-z0-9]', '', 'g'), 4);
        END IF;
        IF suffix !~* '-BAL$' AND NOT EXISTS (
          SELECT 1 FROM public.inventory_rolls WHERE lower(btrim(barcode_id)) = lower(suffix)
        ) THEN
          child_code := suffix;
          EXIT;
        END IF;
      END LOOP;
      IF child_code IS NULL THEN
        RAISE EXCEPTION 'Could not allocate an SFG barcode' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.inventory_rolls (
        barcode_id, roll_type, item_name, category, job_name, order_id, job_code, client_name,
        micron, width_mm, film_type, net_weight_kg, available_weight_kg, gross_weight_kg, tare_weight_kg,
        status, qc_status, location_bay, inward_datetime, length_meters, sfg_type, fg_type,
        input_barcode_ids, metadata
      ) VALUES (
        child_code, roll_type,
        stage_type || ' - ' || job_name || ' (Roll #' || line_no || ')',
        roll_category, job_name, order_id, job_code, client_name,
        micron, out_width, film, net_kg, net_kg, COALESCE(gross_kg, net_kg), COALESCE(tare_kg, 0),
        roll_status, 'Approved',
        CASE WHEN destination = 'fg' THEN 'FG Warehouse' ELSE 'Bay A' END,
        pg_catalog.now(), out_metres,
        CASE WHEN destination = 'sfg' THEN stage_type ELSE NULL END,
        CASE WHEN destination = 'fg' THEN stage_type ELSE NULL END,
        (SELECT jsonb_agg(p ->> 'barcode') FROM jsonb_array_elements(parents) AS p),
        jsonb_build_object(
          'directSlitting', true,
          'conversionId', conv_id,
          'parentBarcodeId', parents -> 0 ->> 'barcode',
          'parentSfgBatchCode', batch_code,
          'lane', lane,
          'purchaseRatePerKg', rate
        )
      );
      INSERT INTO public.inventory_ledger_entries (
        id, entry_kind, scope_key, stage, barcode, line_key, parent_barcode, order_id,
        job_name, job_code, qty_kg, consumed_kg, applied_stock_kg, qty_source,
        film_type, micron, width_mm, item_name, purchase_rate, occurred_at
      ) VALUES (
        'conv-receipt:' || conv_id || ':' || lower(child_code),
        'conversion_receipt', 'conv:' || conv_id, 'Direct Slitting', child_code, lower(child_code),
        parents -> 0 ->> 'barcode', order_id, job_name, job_code, net_kg, 0, 0, 'direct_slitting',
        film, micron, out_width, stage_type || ' - ' || job_name, rate, pg_catalog.now()
      );
      INSERT INTO public.roll_conversion_outputs (
        id, conversion_id, line_no, destination, barcode, order_id, sfg_batch_code,
        width_mm, length_meters, net_kg, gross_kg, tare_kg, lane_no, item_created, purchase_rate
      ) VALUES (
        'out:' || conv_id || ':' || line_no, conv_id, line_no, destination, child_code, order_id,
        batch_code, out_width, out_metres, net_kg, gross_kg, tare_kg, lane, false, rate
      );
    END IF;
  END LOOP;

  FOR item_key IN SELECT jsonb_object_keys(deduct)
  LOOP
    PERFORM private.direct_slit_move_stock(item_key, - (deduct ->> item_key)::numeric);
  END LOOP;
  FOR item_key IN SELECT jsonb_object_keys(receipt)
  LOOP
    PERFORM private.direct_slit_move_stock(item_key, (receipt ->> item_key)::numeric);
  END LOOP;

  rate := COALESCE((parents -> 0 ->> 'rate')::numeric, 0);
  IF trim_kg > 0 AND to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    scrap_id := 'direct-slit:' || conv_id || ':trim';
    INSERT INTO public.sfg_scrap_items (id, payload)
    VALUES (scrap_id, jsonb_build_object(
      'id', scrap_id,
      'stage', 'Direct Slitting',
      'type', 'Trim / Edge Scrap',
      'defectCategory', 'Trim / Edge Scrap',
      'source', 'direct-slitting',
      'scrapQtyKg', trim_kg,
      'orderId', header_order,
      'filmType', film,
      'micron', micron,
      'widthMm', width_mm,
      'ratePerKg', rate,
      'valueRs', round(trim_kg * rate, 2),
      'conversionId', conv_id,
      'sourceRollBarcode', parents -> 0 ->> 'barcode',
      'scrapReason', 'Direct Slitting / Trim / Edge Scrap',
      'scrappedBy', actor,
      'date', to_char((pg_catalog.now())::date, 'YYYY-MM-DD'),
      'timestamp', pg_catalog.now()
    ));
  END IF;
  IF setting_kg > 0 AND to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    scrap_id := 'direct-slit:' || conv_id || ':setting';
    INSERT INTO public.sfg_scrap_items (id, payload)
    VALUES (scrap_id, jsonb_build_object(
      'id', scrap_id,
      'stage', 'Direct Slitting',
      'type', 'Core / Setting Wastage',
      'defectCategory', 'Core / Setting Wastage',
      'source', 'direct-slitting',
      'scrapQtyKg', setting_kg,
      'orderId', header_order,
      'filmType', film,
      'micron', micron,
      'widthMm', width_mm,
      'ratePerKg', rate,
      'valueRs', round(setting_kg * rate, 2),
      'conversionId', conv_id,
      'sourceRollBarcode', parents -> 0 ->> 'barcode',
      'scrapReason', 'Direct Slitting / Core / Setting Wastage',
      'scrappedBy', actor,
      'date', to_char((pg_catalog.now())::date, 'YYYY-MM-DD'),
      'timestamp', pg_catalog.now()
    ));
  END IF;

  SELECT jsonb_build_object(
    'id', conv_id,
    'varianceKg', variance,
    'metresPct', metres_pct,
    'metresStatus', metres_status,
    'override', override,
    'warnings', warnings,
    'consumedKg', consumed_sum,
    'outputKg', output_sum,
    'balanceKg', balance_sum,
    'trimScrapKg', trim_kg,
    'settingScrapKg', setting_kg,
    'parents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'barcode', row.barcode,
        'balanceBarcode', row.balance_barcode,
        'balanceKg', row.balance_kg,
        'consumedKg', row.consumed_kg,
        'stockItemId', row.stock_item_id
      ) ORDER BY row.barcode)
      FROM public.roll_conversion_parents AS row
      WHERE row.conversion_id = conv_id
    ), '[]'::jsonb),
    'outputs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'barcode', row.barcode,
        'destination', row.destination,
        'stockItemId', row.stock_item_id,
        'orderId', row.order_id,
        'sfgBatchCode', row.sfg_batch_code,
        'widthMm', row.width_mm,
        'lengthMeters', row.length_meters,
        'netKg', row.net_kg,
        'itemCreated', row.item_created,
        'lane', row.lane_no
      ) ORDER BY row.line_no)
      FROM public.roll_conversion_outputs AS row
      WHERE row.conversion_id = conv_id
    ), '[]'::jsonb)
  ) INTO summary;

  UPDATE public.roll_conversions AS saved
  SET result = summary
  WHERE saved.id = conv_id;
  RETURN summary;
END;
$$;

CREATE OR REPLACE FUNCTION private.direct_slit_reverse(p_id text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  conv public.roll_conversions%ROWTYPE;
  parent public.roll_conversion_parents%ROWTYPE;
  output public.roll_conversion_outputs%ROWTYPE;
  roll public.inventory_rolls%ROWTYPE;
  actor text;
  reason text;
  deduct jsonb := '{}'::jsonb;
  receipt jsonb := '{}'::jsonb;
  item_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.direct_slit_can_reverse() THEN
    RAISE EXCEPTION 'Not allowed to reverse a direct slit' USING ERRCODE = '42501';
  END IF;
  reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.roll_conversions WHERE id = btrim(COALESCE(p_id, '')) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversion was not found' USING ERRCODE = '22023';
  END IF;
  IF conv.status = 'reversed' THEN
    RETURN conv.result || jsonb_build_object('alreadyReversed', true);
  END IF;

  FOR output IN
    SELECT * FROM public.roll_conversion_outputs WHERE conversion_id = conv.id ORDER BY line_no
  LOOP
    SELECT * INTO roll FROM public.inventory_rolls WHERE barcode_id = output.barcode FOR UPDATE;
    IF NOT FOUND
       OR lower(btrim(COALESCE(roll.status, ''))) NOT LIKE 'in stock%'
       OR abs(COALESCE(roll.available_weight_kg, 0) - output.net_kg) > 0.01 THEN
      RAISE EXCEPTION 'Roll % has already been used', output.barcode USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR parent IN
    SELECT * FROM public.roll_conversion_parents
    WHERE conversion_id = conv.id AND balance_barcode IS NOT NULL
  LOOP
    SELECT * INTO roll FROM public.inventory_rolls WHERE barcode_id = parent.balance_barcode FOR UPDATE;
    IF NOT FOUND
       OR lower(btrim(COALESCE(roll.status, ''))) NOT LIKE 'in stock%'
       OR abs(COALESCE(roll.available_weight_kg, 0) - parent.balance_kg) > 0.01 THEN
      RAISE EXCEPTION 'Balance roll % has already been used', parent.balance_barcode USING ERRCODE = '22023';
    END IF;
  END LOOP;

  actor := private.direct_slit_actor();
  FOR parent IN SELECT * FROM public.roll_conversion_parents WHERE conversion_id = conv.id
  LOOP
    UPDATE public.inventory_rolls
    SET available_weight_kg = parent.available_before,
        status = parent.status_before
    WHERE barcode_id = parent.barcode;
    IF parent.balance_barcode IS NOT NULL THEN
      UPDATE public.inventory_rolls
      SET available_weight_kg = 0, status = 'Reversed'
      WHERE barcode_id = parent.balance_barcode;
    END IF;
    item_key := parent.stock_item_id;
    deduct := jsonb_set(
      deduct,
      ARRAY[item_key],
      to_jsonb(COALESCE((deduct ->> item_key)::numeric, 0) + parent.consumed_kg),
      true
    );
  END LOOP;

  FOR output IN SELECT * FROM public.roll_conversion_outputs WHERE conversion_id = conv.id
  LOOP
    UPDATE public.inventory_rolls
    SET available_weight_kg = 0, status = 'Reversed'
    WHERE barcode_id = output.barcode;
    IF output.destination = 'inventory' AND output.stock_item_id IS NOT NULL THEN
      receipt := jsonb_set(
        receipt,
        ARRAY[output.stock_item_id],
        to_jsonb(COALESCE((receipt ->> output.stock_item_id)::numeric, 0) + output.net_kg),
        true
      );
    END IF;
    IF output.sfg_batch_code IS NOT NULL THEN
      UPDATE public.sfg_goods
      SET available_kg = 0,
          status = 'Reversed',
          updated_at = pg_catalog.now()
      WHERE sfg_batch_code = output.sfg_batch_code;
    END IF;
  END LOOP;

  FOR item_key IN SELECT jsonb_object_keys(deduct)
  LOOP
    PERFORM private.direct_slit_move_stock(item_key, (deduct ->> item_key)::numeric);
  END LOOP;
  FOR item_key IN SELECT jsonb_object_keys(receipt)
  LOOP
    PERFORM private.direct_slit_move_stock(item_key, - (receipt ->> item_key)::numeric);
  END LOOP;

  IF to_regclass('public.sfg_scrap_items') IS NOT NULL THEN
    DELETE FROM public.sfg_scrap_items
    WHERE id IN (
      'direct-slit:' || conv.id || ':trim',
      'direct-slit:' || conv.id || ':setting'
    );
  END IF;
  DELETE FROM public.inventory_ledger_entries
  WHERE scope_key = 'conv:' || conv.id
    AND entry_kind IN ('conversion_issue', 'conversion_receipt', 'conversion_balance');

  UPDATE public.roll_conversions
  SET status = 'reversed',
      reversed_at = pg_catalog.now(),
      reversed_by = actor,
      reversal_reason = reason,
      result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('status', 'reversed', 'reversalReason', reason)
  WHERE id = conv.id;

  RETURN (SELECT result FROM public.roll_conversions WHERE id = conv.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_roll_conversion(p_doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed to post a direct slit' USING ERRCODE = '42501';
  END IF;
  RETURN private.direct_slit_post(p_doc);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_roll_conversion(p_id text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed to reverse a direct slit' USING ERRCODE = '42501';
  END IF;
  RETURN private.direct_slit_reverse(p_id, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION private.inventory_item_history(p_item_id text, p_item_code text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer := 0;
  extra integer := 0;
BEGIN
  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.inventory_rolls AS roll
    WHERE roll.item_id = p_item_id OR (p_item_code IS NOT NULL AND roll.item_id = p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.grn_line_items') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.grn_line_items AS line
    WHERE line.stock_item_id = p_item_id OR line.master_item_id = p_item_id
       OR (p_item_code IS NOT NULL AND (line.stock_item_id = p_item_code OR line.master_item_id = p_item_code));
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.grns') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.grns AS header
    WHERE header.stock_item_id = p_item_id OR header.master_item_id = p_item_id
       OR (p_item_code IS NOT NULL AND (header.stock_item_id = p_item_code OR header.master_item_id = p_item_code));
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.stock_adjustments') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.stock_adjustments AS row
    WHERE private.payload_mentions_item(row.payload, p_item_id, p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.store_issue_transactions') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.store_issue_transactions AS row
    WHERE private.payload_mentions_item(row.payload, p_item_id, p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.machine_issues') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.machine_issues AS row
    WHERE private.payload_mentions_item(row.payload, p_item_id, p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.production_records') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_records' AND column_name = 'materials_list'
  ) THEN
    SELECT count(*)::int INTO extra
    FROM public.production_records AS record
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(record.materials_list, '[]'::jsonb)) AS elem
    WHERE private.payload_mentions_item(elem, p_item_id, p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.roll_conversion_parents') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.roll_conversion_parents AS row
    WHERE row.stock_item_id = p_item_id
       OR (p_item_code IS NOT NULL AND row.stock_item_id = p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  IF to_regclass('public.roll_conversion_outputs') IS NOT NULL THEN
    SELECT count(*)::int INTO extra FROM public.roll_conversion_outputs AS row
    WHERE row.stock_item_id = p_item_id
       OR (p_item_code IS NOT NULL AND row.stock_item_id = p_item_code);
    n := n + coalesce(extra, 0);
  END IF;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION private.direct_slit_round(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_num(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_text(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_film_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_meta_eligible(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_meta_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_item_name(text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_metres(numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_exact_metres(numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_can_post() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_can_override() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_can_reverse() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_next_item_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_barcode(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_resolve_item(text, text, numeric, numeric, text, text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_move_stock(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_post(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.direct_slit_reverse(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_roll_conversion(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_roll_conversion(text, text) FROM PUBLIC, anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_roll_conversion(jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reverse_roll_conversion(text, text) TO authenticated';
  END IF;
END $$;

ALTER TABLE public.roll_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roll_conversion_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roll_conversion_outputs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target text;
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NULL THEN
    RETURN;
  END IF;
  FOREACH target IN ARRAY ARRAY['roll_conversions', 'roll_conversion_parents', 'roll_conversion_outputs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_select', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT private.can_any(ARRAY[''inventory'']::text[])))',
      target || '_select',
      target
    );
  END LOOP;
END $$;

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['roll_conversions', 'roll_conversion_parents', 'roll_conversion_outputs']
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', target);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', target);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', target);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', target);
    END IF;
  END LOOP;
END $$;
