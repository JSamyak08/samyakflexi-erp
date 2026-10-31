-- Delete one stock item together with its rolls and ledger rows.
-- Roll barcodes are not removed. Each barcode that belonged only to the
-- deleted item is kept in public.deleted_barcodes and still listed by
-- public.barcode_registry, with status Deleted plus the reason, who, and when.
--
-- Existing leftover rows are not cleaned up here.
-- GRN headers stay. Only this item's GRN lines are removed.
-- The duplicate-spec trigger on inventory is unchanged.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.deleted_barcodes (
  id text PRIMARY KEY,
  barcode text NOT NULL,
  source_module text NOT NULL,
  description text,
  reference_no text,
  created_at timestamptz,
  status text NOT NULL DEFAULT 'Deleted',
  location text,
  source_table text,
  source_column text,
  deleted_reason text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by text NOT NULL DEFAULT 'System',
  item_id text,
  CONSTRAINT deleted_barcodes_status_deleted CHECK (status = 'Deleted')
);

CREATE INDEX IF NOT EXISTS deleted_barcodes_barcode_lower_idx
  ON public.deleted_barcodes (lower(btrim(barcode)));

ALTER TABLE public.deleted_barcodes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.deleted_barcodes IS
  'Roll and item barcodes kept after a stock item is deleted. They are not stock.';

-- The live registry view is kept under a new name so this migration can add
-- deleted_reason, deleted_at, and deleted_by without rewriting every source.
DO $$
BEGIN
  IF to_regclass('public.barcode_registry_sources') IS NULL
     AND to_regclass('public.barcode_registry') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.barcode_registry RENAME TO barcode_registry_sources';
  END IF;
  IF to_regclass('public.barcode_registry_sources') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW public.barcode_registry_sources
      WITH (security_invoker = true) AS
      SELECT
        NULL::text AS barcode,
        NULL::text AS source_module,
        NULL::text AS description,
        NULL::text AS reference_no,
        NULL::timestamptz AS created_at,
        NULL::text AS status,
        NULL::text AS location,
        NULL::text AS source_table,
        NULL::text AS source_column
      WHERE false
    $view$;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.barcode_registry
WITH (security_invoker = true) AS
SELECT DISTINCT ON (source_module, lower(barcode))
  barcode,
  source_module,
  description,
  reference_no,
  created_at,
  status,
  location,
  source_table,
  source_column,
  deleted_reason,
  deleted_at,
  deleted_by
FROM (
  SELECT
    s.barcode,
    s.source_module,
    s.description,
    s.reference_no,
    s.created_at,
    s.status,
    s.location,
    s.source_table,
    s.source_column,
    NULL::text AS deleted_reason,
    NULL::timestamptz AS deleted_at,
    NULL::text AS deleted_by
  FROM public.barcode_registry_sources AS s
  UNION ALL
  SELECT
    btrim(d.barcode),
    d.source_module,
    d.description,
    d.reference_no,
    d.created_at,
    'Deleted'::text,
    d.location,
    COALESCE(d.source_table, 'deleted_barcodes'),
    COALESCE(d.source_column, 'barcode'),
    d.deleted_reason,
    d.deleted_at,
    d.deleted_by
  FROM public.deleted_barcodes AS d
) AS merged
WHERE nullif(btrim(barcode), '') IS NOT NULL
  AND lower(btrim(barcode)) NOT IN ('null', 'undefined', 'n/a', 'na', '-')
  AND btrim(barcode) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND to_regprocedure('private.can_any(text[])') IS NOT NULL
  AND private.can_any(ARRAY['barcodes']::text[])
ORDER BY source_module, lower(barcode),
  CASE WHEN status = 'Deleted' THEN 0 ELSE 1 END,
  created_at DESC NULLS LAST;

COMMENT ON VIEW public.barcode_registry IS
  'Stored barcodes, including ones kept after their stock item was deleted.';

CREATE OR REPLACE FUNCTION private.json_number(value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(value)::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.payload_mentions_item(payload jsonb, item_id text, item_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT payload IS NOT NULL
    AND jsonb_typeof(payload) = 'object'
    AND EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        payload->>'itemId',
        payload->>'item_id',
        payload->>'stockItemId',
        payload->>'stock_item_id',
        payload->>'masterItemId',
        payload->>'master_item_id',
        payload->>'itemCode',
        payload->>'item_code',
        payload->>'inventoryId',
        payload->>'inventory_id'
      ]) AS candidate
      WHERE nullif(btrim(candidate), '') IS NOT NULL
        AND (
          btrim(candidate) = btrim(item_id)
          OR (item_code IS NOT NULL AND btrim(item_code) <> '' AND btrim(candidate) = btrim(item_code))
        )
    );
$$;

CREATE OR REPLACE FUNCTION private.roll_barcode_module(p_code text, p_roll_type text, p_metadata jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_code ILIKE 'FG-DISP-%' THEN 'Dispatch / challans'
    WHEN coalesce(p_metadata->>'parentSfgBatchCode', '') <> ''
      OR p_code ~* '^(SFG|FG)-.*-R[0-9]+$'
      THEN 'Consume child rolls'
    WHEN p_roll_type = 'FG' OR p_code ILIKE 'FG-%' THEN 'FG rolls'
    WHEN p_roll_type = 'SFG' OR p_code ILIKE 'SFG-%' THEN 'SFG rolls'
    ELSE 'Raw material / GRN'
  END;
$$;

CREATE OR REPLACE FUNCTION private.barcode_text_ok(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(btrim(coalesce(p_code, '')), '') IS NOT NULL
    AND lower(btrim(p_code)) NOT IN ('null', 'undefined', 'n/a', 'na', '-')
    AND btrim(p_code) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

CREATE OR REPLACE FUNCTION private.inventory_delete_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NULL THEN
    RETURN false;
  END IF;
  RETURN coalesce(private.can_any(ARRAY[
    'inventory',
    'material_indents',
    'purchase_orders',
    'production_records',
    'printing_scheduler'
  ]::text[]), false);
END;
$$;

CREATE OR REPLACE FUNCTION private.inventory_delete_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_name text := 'System';
  actor_role text := '';
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN actor_name;
  END IF;
  EXECUTE $sql$
    SELECT coalesce(nullif(btrim(u.name), ''), nullif(btrim(u.username), ''), nullif(btrim(u.email), ''), 'System'),
           coalesce(u.role, '')
    FROM public.users AS u
    WHERE u.auth_user_id = auth.uid()
       OR (u.auth_user_id IS NULL AND u.id = auth.uid()::text)
    ORDER BY (u.auth_user_id = auth.uid()) DESC
    LIMIT 1
  $sql$
  INTO actor_name, actor_role;
  actor_name := coalesce(nullif(btrim(actor_name), ''), 'System');
  IF nullif(btrim(actor_role), '') IS NOT NULL THEN
    RETURN actor_name || ' (' || btrim(actor_role) || ')';
  END IF;
  RETURN actor_name;
END;
$$;

CREATE OR REPLACE FUNCTION private.barcode_still_in_use(p_code text, p_item_id text, p_item_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.barcode_text_ok(p_code) THEN
    RETURN true;
  END IF;
  IF to_regclass('public.inventory_rolls') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.inventory_rolls AS roll
    WHERE (
        lower(btrim(roll.barcode_id)) = lower(btrim(p_code))
        OR lower(btrim(coalesce(roll.barcode, ''))) = lower(btrim(p_code))
      )
      AND roll.item_id IS DISTINCT FROM p_item_id
      AND (p_item_code IS NULL OR btrim(p_item_code) = '' OR roll.item_id IS DISTINCT FROM btrim(p_item_code))
  ) THEN
    RETURN true;
  END IF;
  IF to_regclass('public.inventory') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.inventory AS item
    WHERE item.id IS DISTINCT FROM p_item_id
      AND (p_item_code IS NULL OR btrim(p_item_code) = '' OR item.id IS DISTINCT FROM btrim(p_item_code))
      AND lower(btrim(coalesce(item.barcode, ''))) = lower(btrim(p_code))
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.inventory_delete_snapshot(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text;
  v_code text;
  v_name text;
  v_rolls integer := 0;
  v_roll_kg numeric := 0;
  v_adj_kg numeric := 0;
  v_ledger integer := 0;
  v_consumed integer := 0;
  v_extra integer := 0;
  v_snap jsonb := '[]'::jsonb;
  v_barcodes integer := 0;
BEGIN
  SELECT item.id, nullif(btrim(item.item_code), ''), item.item_name
    INTO v_id, v_code, v_name
  FROM public.inventory AS item
  WHERE item.id = btrim(p_item_id)
     OR (nullif(btrim(item.item_code), '') IS NOT NULL AND btrim(item.item_code) = btrim(p_item_id))
  ORDER BY (item.id = btrim(p_item_id)) DESC
  LIMIT 1;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    SELECT count(*)::int,
           coalesce(sum(coalesce(roll.net_weight_kg, 0)), 0),
           count(*) FILTER (
             WHERE nullif(btrim(roll.order_id), '') IS NOT NULL
                OR nullif(btrim(roll.job_name), '') IS NOT NULL
                OR nullif(btrim(roll.job_code), '') IS NOT NULL
                OR lower(coalesce(roll.status, '')) ~ '(consum|issued|issue|job)'
                OR (
                  coalesce(roll.net_weight_kg, 0) > 0
                  AND coalesce(roll.available_weight_kg, roll.net_weight_kg) < roll.net_weight_kg
                )
           )::int
      INTO v_rolls, v_roll_kg, v_consumed
    FROM public.inventory_rolls AS roll
    WHERE roll.item_id = v_id
       OR (v_code IS NOT NULL AND roll.item_id = v_code);

    SELECT coalesce(jsonb_agg(row_to_json(src)::jsonb), '[]'::jsonb)
      INTO v_snap
    FROM (
      SELECT DISTINCT ON (source_module, lower(btrim(barcode)))
        btrim(barcode) AS barcode,
        source_module,
        description,
        reference_no,
        created_at,
        location,
        source_table,
        source_column
      FROM (
        SELECT
          roll.barcode_id AS barcode,
          private.roll_barcode_module(roll.barcode_id, roll.roll_type, roll.metadata) AS source_module,
          coalesce(nullif(btrim(roll.item_name), ''), nullif(btrim(roll.film_type), ''), 'Roll') AS description,
          coalesce(nullif(btrim(roll.order_id), ''), nullif(btrim(roll.metadata->>'grnNo'), ''), nullif(btrim(roll.job_name), ''), roll.barcode_id) AS reference_no,
          roll.inward_datetime AS created_at,
          nullif(btrim(roll.location_bay), '') AS location,
          'inventory_rolls' AS source_table,
          'barcode_id' AS source_column
        FROM public.inventory_rolls AS roll
        WHERE (roll.item_id = v_id OR (v_code IS NOT NULL AND roll.item_id = v_code))
          AND private.barcode_text_ok(roll.barcode_id)
          AND NOT private.barcode_still_in_use(roll.barcode_id, v_id, v_code)
        UNION ALL
        SELECT
          roll.barcode,
          private.roll_barcode_module(roll.barcode, roll.roll_type, roll.metadata),
          coalesce(nullif(btrim(roll.item_name), ''), 'Roll'),
          coalesce(nullif(btrim(roll.order_id), ''), roll.barcode_id),
          roll.inward_datetime,
          nullif(btrim(roll.location_bay), ''),
          'inventory_rolls',
          'barcode'
        FROM public.inventory_rolls AS roll
        WHERE (roll.item_id = v_id OR (v_code IS NOT NULL AND roll.item_id = v_code))
          AND private.barcode_text_ok(roll.barcode)
          AND lower(btrim(roll.barcode)) IS DISTINCT FROM lower(btrim(coalesce(roll.barcode_id, '')))
          AND NOT private.barcode_still_in_use(roll.barcode, v_id, v_code)
        UNION ALL
        SELECT
          item.barcode,
          'Inventory items',
          coalesce(nullif(btrim(item.item_name), ''), 'Inventory item'),
          coalesce(nullif(btrim(item.item_code), ''), item.id),
          item.last_updated,
          nullif(btrim(item.location), ''),
          'inventory',
          'barcode'
        FROM public.inventory AS item
        WHERE item.id = v_id
          AND private.barcode_text_ok(item.barcode)
          AND NOT private.barcode_still_in_use(item.barcode, v_id, v_code)
      ) AS codes
      ORDER BY source_module, lower(btrim(barcode)), created_at DESC NULLS LAST
    ) AS src;
  END IF;

  IF to_regclass('public.stock_adjustments') IS NOT NULL THEN
    SELECT count(*)::int
      INTO v_extra
    FROM public.stock_adjustments AS row
    WHERE private.payload_mentions_item(row.payload, v_id, v_code);
    v_ledger := v_ledger + coalesce(v_extra, 0);

    SELECT coalesce(sum(
      abs(coalesce(
        private.json_number(row.payload->>'qtyKg'),
        private.json_number(row.payload->>'qty_kg'),
        0
      ))
    ), 0)
      INTO v_adj_kg
    FROM public.stock_adjustments AS row
    WHERE private.payload_mentions_item(row.payload, v_id, v_code)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_snap) AS snap
        WHERE lower(btrim(snap->>'barcode')) = lower(btrim(coalesce(row.payload->>'barcode', '')))
          AND nullif(btrim(coalesce(row.payload->>'barcode', '')), '') IS NOT NULL
      );

    SELECT v_snap || coalesce(jsonb_agg(jsonb_build_object(
      'barcode', btrim(row.payload->>'barcode'),
      'source_module', 'Stock adjustments',
      'description', coalesce(nullif(btrim(row.payload->>'itemName'), ''), nullif(btrim(row.payload->>'reason'), ''), 'Stock adjustment'),
      'reference_no', coalesce(nullif(btrim(row.payload->>'itemId'), ''), row.id),
      'created_at', row.created_at,
      'location', NULL,
      'source_table', 'stock_adjustments',
      'source_column', 'payload'
    )), '[]'::jsonb)
      INTO v_snap
    FROM public.stock_adjustments AS row
    WHERE private.payload_mentions_item(row.payload, v_id, v_code)
      AND private.barcode_text_ok(row.payload->>'barcode')
      AND NOT private.barcode_still_in_use(row.payload->>'barcode', v_id, v_code);
  END IF;

  IF to_regclass('public.store_issue_transactions') IS NOT NULL THEN
    SELECT count(*)::int INTO v_extra
    FROM public.store_issue_transactions AS row
    WHERE private.payload_mentions_item(row.payload, v_id, v_code);
    v_ledger := v_ledger + coalesce(v_extra, 0);

    SELECT v_snap || coalesce(jsonb_agg(jsonb_build_object(
      'barcode', btrim(coalesce(row.payload->>'barcode', row.payload->>'barcodeId')),
      'source_module', 'Store issues',
      'description', coalesce(nullif(btrim(row.payload->>'itemName'), ''), 'Store issue'),
      'reference_no', row.id,
      'created_at', row.created_at,
      'location', NULL,
      'source_table', 'store_issue_transactions',
      'source_column', 'payload'
    )), '[]'::jsonb)
      INTO v_snap
    FROM public.store_issue_transactions AS row
    WHERE private.payload_mentions_item(row.payload, v_id, v_code)
      AND private.barcode_text_ok(coalesce(row.payload->>'barcode', row.payload->>'barcodeId'))
      AND NOT private.barcode_still_in_use(coalesce(row.payload->>'barcode', row.payload->>'barcodeId'), v_id, v_code);
  END IF;

  IF to_regclass('public.machine_issues') IS NOT NULL THEN
    SELECT count(*)::int INTO v_extra
    FROM public.machine_issues AS row
    WHERE private.payload_mentions_item(row.payload, v_id, v_code);
    v_ledger := v_ledger + coalesce(v_extra, 0);
  END IF;

  IF to_regclass('public.grn_line_items') IS NOT NULL THEN
    SELECT count(*)::int INTO v_extra
    FROM public.grn_line_items AS line
    WHERE line.stock_item_id = v_id
       OR line.master_item_id = v_id
       OR (v_code IS NOT NULL AND (line.stock_item_id = v_code OR line.master_item_id = v_code));
    v_ledger := v_ledger + coalesce(v_extra, 0);
  END IF;

  IF to_regclass('public.production_records') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'production_records'
         AND column_name = 'materials_list'
     ) THEN
    SELECT count(*)::int INTO v_extra
    FROM public.production_records AS record
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(record.materials_list, '[]'::jsonb)) AS elem
    WHERE private.payload_mentions_item(elem, v_id, v_code);
    v_ledger := v_ledger + coalesce(v_extra, 0);
  END IF;

  SELECT count(DISTINCT lower(btrim(elem->>'barcode')))::int
    INTO v_barcodes
  FROM jsonb_array_elements(coalesce(v_snap, '[]'::jsonb)) AS elem
  WHERE private.barcode_text_ok(elem->>'barcode');

  RETURN jsonb_build_object(
    'itemId', v_id,
    'itemCode', v_code,
    'itemName', v_name,
    'rolls', v_rolls,
    'rollKg', round(v_roll_kg, 2),
    'adjustmentKg', round(coalesce(v_adj_kg, 0), 2),
    'totalKg', round(v_roll_kg + coalesce(v_adj_kg, 0), 2),
    'ledgerEntries', v_ledger,
    'barcodes', coalesce(v_barcodes, 0),
    'consumedOrIssuedRolls', v_consumed,
    'consumedOrIssued', v_consumed > 0,
    'snap', coalesce(v_snap, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.raise_inventory_delete_denied()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.inventory_delete_allowed() THEN
    RAISE EXCEPTION 'You are not allowed to delete inventory items';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.normalize_item_ids(p_item_ids text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT btrim(item_id)), ARRAY[]::text[])
  FROM unnest(coalesce(p_item_ids, ARRAY[]::text[])) AS item_id
  WHERE nullif(btrim(item_id), '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION private.preview_delete_inventory_items(p_item_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[] := private.normalize_item_ids(p_item_ids);
  v_id text;
  v_one jsonb;
  v_items jsonb := '[]'::jsonb;
  v_rolls integer := 0;
  v_barcodes integer := 0;
  v_ledger integer := 0;
  v_kg numeric := 0;
  v_consumed integer := 0;
BEGIN
  PERFORM private.raise_inventory_delete_denied();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    v_one := private.inventory_delete_snapshot(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_items := v_items || jsonb_build_array(v_one - 'snap');
    v_rolls := v_rolls + coalesce((v_one->>'rolls')::int, 0);
    v_barcodes := v_barcodes + coalesce((v_one->>'barcodes')::int, 0);
    v_ledger := v_ledger + coalesce((v_one->>'ledgerEntries')::int, 0);
    v_kg := v_kg + coalesce((v_one->>'totalKg')::numeric, 0);
    v_consumed := v_consumed + coalesce((v_one->>'consumedOrIssuedRolls')::int, 0);
  END LOOP;
  RETURN jsonb_build_object(
    'rolls', v_rolls,
    'barcodes', v_barcodes,
    'ledgerEntries', v_ledger,
    'totalKg', round(v_kg, 2),
    'consumedOrIssuedRolls', v_consumed,
    'consumedOrIssued', v_consumed > 0,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.delete_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[] := private.normalize_item_ids(p_item_ids);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor text;
  v_id text;
  v_code text;
  v_one jsonb;
  v_items jsonb := '[]'::jsonb;
  v_marked jsonb := '[]'::jsonb;
  v_rolls integer := 0;
  v_barcodes integer := 0;
  v_ledger integer := 0;
  v_kg numeric := 0;
  v_consumed integer := 0;
  v_removed integer := 0;
  v_elem jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.raise_inventory_delete_denied();
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to delete a stock item';
  END IF;
  IF length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'The delete reason must be 2000 characters or less';
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  v_actor := private.inventory_delete_actor();

  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('flexierp-inventory-delete'),
      pg_catalog.hashtext(v_id)
    );
    v_one := private.inventory_delete_snapshot(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_id := v_one->>'itemId';
    v_code := nullif(v_one->>'itemCode', '');

    FOR v_elem IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_one->'snap', '[]'::jsonb)) AS value
    LOOP
      INSERT INTO public.deleted_barcodes (
        id, barcode, source_module, description, reference_no, created_at,
        status, location, source_table, source_column,
        deleted_reason, deleted_at, deleted_by, item_id
      ) VALUES (
        (v_elem->>'source_module') || '|' || lower(btrim(v_elem->>'barcode')),
        btrim(v_elem->>'barcode'),
        v_elem->>'source_module',
        v_elem->>'description',
        v_elem->>'reference_no',
        CASE WHEN nullif(v_elem->>'created_at', '') IS NULL THEN NULL ELSE (v_elem->>'created_at')::timestamptz END,
        'Deleted',
        nullif(v_elem->>'location', ''),
        coalesce(v_elem->>'source_table', 'deleted_barcodes'),
        coalesce(v_elem->>'source_column', 'barcode'),
        v_reason,
        v_now,
        v_actor,
        v_id
      )
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        reference_no = EXCLUDED.reference_no,
        status = 'Deleted',
        deleted_reason = EXCLUDED.deleted_reason,
        deleted_at = EXCLUDED.deleted_at,
        deleted_by = EXCLUDED.deleted_by,
        item_id = EXCLUDED.item_id;

      v_marked := v_marked || jsonb_build_array(jsonb_build_object(
        'barcode', btrim(v_elem->>'barcode'),
        'sourceModule', v_elem->>'source_module',
        'description', v_elem->>'description',
        'referenceNo', v_elem->>'reference_no',
        'createdAt', v_elem->>'created_at',
        'status', 'Deleted',
        'location', v_elem->>'location',
        'sourceTable', 'deleted_barcodes',
        'sourceColumn', 'barcode',
        'deletedReason', v_reason,
        'deletedAt', v_now,
        'deletedBy', v_actor
      ));
    END LOOP;

    IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
      DELETE FROM public.inventory_rolls AS roll
      WHERE roll.item_id = v_id
         OR (v_code IS NOT NULL AND roll.item_id = v_code);
    END IF;

    IF to_regclass('public.stock_adjustments') IS NOT NULL THEN
      DELETE FROM public.stock_adjustments AS row
      WHERE private.payload_mentions_item(row.payload, v_id, v_code);
    END IF;

    IF to_regclass('public.store_issue_transactions') IS NOT NULL THEN
      DELETE FROM public.store_issue_transactions AS row
      WHERE private.payload_mentions_item(row.payload, v_id, v_code);
    END IF;

    IF to_regclass('public.machine_issues') IS NOT NULL THEN
      DELETE FROM public.machine_issues AS row
      WHERE private.payload_mentions_item(row.payload, v_id, v_code);
    END IF;

    IF to_regclass('public.production_records') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'production_records'
           AND column_name = 'materials_list'
       ) THEN
      UPDATE public.production_records AS record
      SET materials_list = coalesce((
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(coalesce(record.materials_list, '[]'::jsonb)) AS elem
        WHERE NOT private.payload_mentions_item(elem, v_id, v_code)
      ), '[]'::jsonb)
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(record.materials_list, '[]'::jsonb)) AS elem
        WHERE private.payload_mentions_item(elem, v_id, v_code)
      );
    END IF;

    IF to_regclass('public.grn_line_items') IS NOT NULL AND to_regclass('public.grns') IS NOT NULL THEN
      UPDATE public.grns AS header
      SET stock_item_id = CASE
            WHEN header.stock_item_id = v_id OR (v_code IS NOT NULL AND header.stock_item_id = v_code)
              THEN coalesce(nullif(btrim(replacement.stock_item_id), ''), header.stock_item_id)
            ELSE header.stock_item_id
          END,
          master_item_id = CASE
            WHEN header.master_item_id = v_id OR (v_code IS NOT NULL AND header.master_item_id = v_code)
              THEN coalesce(nullif(btrim(replacement.master_item_id), ''), nullif(btrim(replacement.stock_item_id), ''), header.master_item_id)
            ELSE header.master_item_id
          END
      FROM (
        SELECT DISTINCT ON (line.grn_id)
          line.grn_id,
          line.stock_item_id,
          line.master_item_id
        FROM public.grn_line_items AS line
        WHERE NOT (
          line.stock_item_id = v_id
          OR line.master_item_id = v_id
          OR (v_code IS NOT NULL AND (line.stock_item_id = v_code OR line.master_item_id = v_code))
        )
        ORDER BY line.grn_id, line.line_no
      ) AS replacement
      WHERE header.id = replacement.grn_id
        AND (
          header.stock_item_id = v_id
          OR header.master_item_id = v_id
          OR (v_code IS NOT NULL AND (header.stock_item_id = v_code OR header.master_item_id = v_code))
        );

      DELETE FROM public.grn_line_items AS line
      WHERE line.stock_item_id = v_id
         OR line.master_item_id = v_id
         OR (v_code IS NOT NULL AND (line.stock_item_id = v_code OR line.master_item_id = v_code));
    END IF;

    DELETE FROM public.inventory WHERE id = v_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    IF v_removed <> 1 THEN
      RAISE EXCEPTION 'Stock item % was not deleted', v_id;
    END IF;

    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (id, username, user_role, action_type, module, details, target_id, created_at)
      VALUES (
        'LOG-INVDEL-' || v_id || '-' || substr(pg_catalog.md5(v_id || v_now::text || pg_catalog.random()::text), 1, 12),
        v_actor,
        '',
        'DELETE',
        'Inventory',
        format(
          'Deleted stock item %s (%s). Reason: %s. Rolls %s, barcodes marked Deleted %s, ledger entries %s, total kg %s. Consumed or issued rolls: %s.',
          coalesce(v_one->>'itemName', v_id),
          v_id,
          v_reason,
          coalesce(v_one->>'rolls', '0'),
          coalesce(v_one->>'barcodes', '0'),
          coalesce(v_one->>'ledgerEntries', '0'),
          coalesce(v_one->>'totalKg', '0'),
          coalesce(v_one->>'consumedOrIssuedRolls', '0')
        ),
        v_id,
        v_now
      );
    END IF;

    v_items := v_items || jsonb_build_array(v_one - 'snap');
    v_rolls := v_rolls + coalesce((v_one->>'rolls')::int, 0);
    v_barcodes := v_barcodes + coalesce((v_one->>'barcodes')::int, 0);
    v_ledger := v_ledger + coalesce((v_one->>'ledgerEntries')::int, 0);
    v_kg := v_kg + coalesce((v_one->>'totalKg')::numeric, 0);
    v_consumed := v_consumed + coalesce((v_one->>'consumedOrIssuedRolls')::int, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'rolls', v_rolls,
    'barcodes', v_barcodes,
    'ledgerEntries', v_ledger,
    'totalKg', round(v_kg, 2),
    'consumedOrIssuedRolls', v_consumed,
    'consumedOrIssued', v_consumed > 0,
    'reason', v_reason,
    'deletedBy', v_actor,
    'items', v_items,
    'barcodesMarked', v_marked
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.list_deleted_barcodes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT (
      private.inventory_delete_allowed()
      OR (
        to_regprocedure('private.can_any(text[])') IS NOT NULL
        AND coalesce(private.can_any(ARRAY['barcodes']::text[]), false)
      )
    ) THEN '[]'::jsonb
    ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'barcode', d.barcode,
        'sourceModule', d.source_module,
        'description', d.description,
        'referenceNo', d.reference_no,
        'createdAt', d.created_at,
        'status', 'Deleted',
        'location', d.location,
        'sourceTable', 'deleted_barcodes',
        'sourceColumn', 'barcode',
        'deletedReason', d.deleted_reason,
        'deletedAt', d.deleted_at,
        'deletedBy', d.deleted_by
      ) ORDER BY d.deleted_at DESC)
      FROM public.deleted_barcodes AS d
    ), '[]'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION private.deleted_barcode_hits(p_codes text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT (
      private.inventory_delete_allowed()
      OR (
        to_regprocedure('private.can_any(text[])') IS NOT NULL
        AND coalesce(private.can_any(ARRAY['barcodes']::text[]), false)
      )
    ) THEN '[]'::jsonb
    ELSE coalesce((
      SELECT jsonb_agg(hit)
      FROM (
        SELECT DISTINCT ON (lower(btrim(d.barcode)))
          jsonb_build_object(
            'barcode', d.barcode,
            'sourceModule', d.source_module,
            'description', d.description,
            'status', 'Deleted',
            'deletedReason', d.deleted_reason,
            'deletedAt', d.deleted_at,
            'deletedBy', d.deleted_by
          ) AS hit
        FROM public.deleted_barcodes AS d
        JOIN unnest(coalesce(p_codes, ARRAY[]::text[])) AS code ON lower(btrim(d.barcode)) = lower(btrim(code))
        WHERE nullif(btrim(code), '') IS NOT NULL
        ORDER BY lower(btrim(d.barcode)), d.deleted_at DESC
      ) AS matches
    ), '[]'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION private.reject_deleted_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hit text;
BEGIN
  SELECT d.barcode INTO hit
  FROM public.deleted_barcodes AS d
  WHERE lower(btrim(d.barcode)) IN (
    lower(btrim(coalesce(NEW.barcode_id, ''))),
    lower(btrim(coalesce(NEW.barcode, '')))
  )
    AND btrim(d.barcode) <> ''
  LIMIT 1;
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'Barcode % was deleted and cannot be received, issued, or consumed', hit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_rolls_reject_deleted_barcode ON public.inventory_rolls;
CREATE TRIGGER inventory_rolls_reject_deleted_barcode
  BEFORE INSERT OR UPDATE OF barcode_id, barcode
  ON public.inventory_rolls
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_deleted_barcode();

CREATE OR REPLACE FUNCTION public.preview_delete_inventory_items(p_item_ids text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.preview_delete_inventory_items(p_item_ids);
$$;

CREATE OR REPLACE FUNCTION public.delete_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.delete_inventory_items(p_item_ids, p_reason);
$$;

CREATE OR REPLACE FUNCTION public.list_deleted_barcodes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.list_deleted_barcodes();
$$;

CREATE OR REPLACE FUNCTION public.deleted_barcode_hits(p_codes text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.deleted_barcode_hits(p_codes);
$$;

REVOKE ALL ON FUNCTION private.json_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.payload_mentions_item(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.roll_barcode_module(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.barcode_text_ok(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inventory_delete_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inventory_delete_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.barcode_still_in_use(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inventory_delete_snapshot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.raise_inventory_delete_denied() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.normalize_item_ids(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.preview_delete_inventory_items(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.delete_inventory_items(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.list_deleted_barcodes() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.deleted_barcode_hits(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reject_deleted_barcode() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.preview_delete_inventory_items(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_inventory_items(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_deleted_barcodes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deleted_barcode_hits(text[]) FROM PUBLIC;
REVOKE ALL ON TABLE public.deleted_barcodes FROM PUBLIC;
REVOKE ALL ON TABLE public.barcode_registry FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.preview_delete_inventory_items(text[]) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.delete_inventory_items(text[], text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.list_deleted_barcodes() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.deleted_barcode_hits(text[]) FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.deleted_barcodes FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.barcode_registry FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.preview_delete_inventory_items(text[]) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_inventory_items(text[], text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_deleted_barcodes() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.deleted_barcode_hits(text[]) TO authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.deleted_barcodes TO authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.barcode_registry TO authenticated';
  END IF;
END $$;

DROP POLICY IF EXISTS deleted_barcodes_select ON public.deleted_barcodes;
CREATE POLICY deleted_barcodes_select ON public.deleted_barcodes
  FOR SELECT TO authenticated
  USING (
    private.inventory_delete_allowed()
    OR private.can_any(ARRAY['barcodes']::text[])
  );
