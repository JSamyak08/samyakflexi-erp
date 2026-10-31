-- Standard ERP master-data rules replace the cascade delete from
-- 20261031082246_delete_inventory_item_keep_barcodes.sql.
--
-- An item with any history is archived, not deleted. Stock on hand must be
-- written off first. A true delete is only for an item that was never used.
-- Existing Deleted barcodes are left as they are. This file does not clean
-- leftover rows.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text,
  ADD COLUMN IF NOT EXISTS archive_reason text;

COMMENT ON COLUMN public.inventory.is_active IS
  'False when the stock item is archived. History, rolls, and barcodes stay.';

ALTER TABLE public.deleted_barcodes DROP CONSTRAINT IF EXISTS deleted_barcodes_status_deleted;
ALTER TABLE public.deleted_barcodes DROP CONSTRAINT IF EXISTS deleted_barcodes_status_check;
ALTER TABLE public.deleted_barcodes
  ADD CONSTRAINT deleted_barcodes_status_check
  CHECK (status IN ('Deleted', 'Written Off'));

-- Keep the source view from the previous migration and show the tombstone
-- status (Deleted or Written Off) instead of forcing every tombstone to Deleted.
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
    d.status,
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
  CASE WHEN status IN ('Deleted', 'Written Off') THEN 0 ELSE 1 END,
  created_at DESC NULLS LAST;

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
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION private.roll_is_on_hand(p_status text, p_qc text, p_available numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_available, 0) > 0
    AND lower(btrim(coalesce(p_status, ''))) NOT IN ('written off', 'deleted', 'void', 'consumed')
    AND (
      lower(btrim(coalesce(p_status, ''))) LIKE 'in stock%'
      OR lower(btrim(coalesce(p_status, ''))) LIKE '%qc hold%'
      OR lower(btrim(coalesce(p_status, ''))) LIKE '%pending qc%'
      OR lower(btrim(coalesce(p_qc, ''))) LIKE '%hold%'
      OR lower(btrim(coalesce(p_qc, ''))) LIKE '%pending%'
    );
$$;

CREATE OR REPLACE FUNCTION private.require_inventory_reason(p_reason text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM private.raise_inventory_delete_denied();
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'The reason must be 2000 characters or less';
  END IF;
  RETURN v_reason;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_inventory_item(p_item_id text)
RETURNS public.inventory
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.inventory;
BEGIN
  SELECT * INTO v_row
  FROM public.inventory AS item
  WHERE item.id = btrim(p_item_id)
     OR (nullif(btrim(item.item_code), '') IS NOT NULL AND btrim(item.item_code) = btrim(p_item_id))
  ORDER BY (item.id = btrim(p_item_id)) DESC
  LIMIT 1;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.inventory_item_preview(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.inventory;
  v_id text;
  v_code text;
  v_history integer;
  v_on_hand integer := 0;
  v_on_hand_kg numeric := 0;
  v_loose numeric := 0;
  v_rolls jsonb := '[]'::jsonb;
BEGIN
  v_row := private.resolve_inventory_item(p_item_id);
  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_id := v_row.id;
  v_code := nullif(btrim(v_row.item_code), '');
  v_history := private.inventory_item_history(v_id, v_code);
  IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
    SELECT count(*)::int, coalesce(sum(coalesce(roll.available_weight_kg, roll.net_weight_kg, 0)), 0)
      INTO v_on_hand, v_on_hand_kg
    FROM public.inventory_rolls AS roll
    WHERE (roll.item_id = v_id OR (v_code IS NOT NULL AND roll.item_id = v_code))
      AND private.roll_is_on_hand(roll.status, roll.qc_status, coalesce(roll.available_weight_kg, roll.net_weight_kg, 0));
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'barcode', roll.barcode_id,
      'kg', coalesce(roll.available_weight_kg, roll.net_weight_kg, 0),
      'status', roll.status
    ) ORDER BY roll.barcode_id), '[]'::jsonb)
      INTO v_rolls
    FROM public.inventory_rolls AS roll
    WHERE (roll.item_id = v_id OR (v_code IS NOT NULL AND roll.item_id = v_code))
      AND private.roll_is_on_hand(roll.status, roll.qc_status, coalesce(roll.available_weight_kg, roll.net_weight_kg, 0));
  END IF;
  v_loose := greatest(0, coalesce(v_row.stock_qty_kg, 0) - coalesce(v_on_hand_kg, 0));
  RETURN jsonb_build_object(
    'itemId', v_id,
    'itemCode', v_code,
    'itemName', split_part(coalesce(v_row.item_name, ''), ' ||| ', 1),
    'isActive', coalesce(v_row.is_active, true),
    'history', v_history > 0,
    'historyCount', v_history,
    'canDelete', v_history = 0 AND v_on_hand = 0 AND v_loose = 0 AND coalesce(v_row.stock_qty_kg, 0) = 0,
    'onHandRolls', v_on_hand,
    'onHandKg', round(coalesce(v_on_hand_kg, 0) + v_loose, 2),
    'looseKg', round(v_loose, 2),
    'rolls', coalesce(v_rolls, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.mark_barcode_written_off(
  p_barcode text,
  p_item_id text,
  p_description text,
  p_reason text,
  p_actor text,
  p_when timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.barcode_text_ok(p_barcode) THEN
    RETURN;
  END IF;
  IF private.barcode_still_in_use(p_barcode, p_item_id, NULL) THEN
    RETURN;
  END IF;
  INSERT INTO public.deleted_barcodes (
    id, barcode, source_module, description, reference_no, created_at,
    status, source_table, source_column, deleted_reason, deleted_at, deleted_by, item_id
  ) VALUES (
    'Written Off|' || lower(btrim(p_barcode)),
    btrim(p_barcode),
    coalesce(private.roll_barcode_module(p_barcode, 'RAW_MATERIAL', '{}'::jsonb), 'Raw material / GRN'),
    coalesce(nullif(btrim(p_description), ''), 'Roll'),
    p_item_id,
    p_when,
    'Written Off',
    'inventory_rolls',
    'barcode_id',
    p_reason,
    p_when,
    p_actor,
    p_item_id
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'Written Off',
    deleted_reason = EXCLUDED.deleted_reason,
    deleted_at = EXCLUDED.deleted_at,
    deleted_by = EXCLUDED.deleted_by,
    item_id = EXCLUDED.item_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.write_audit(
  p_action text,
  p_item_id text,
  p_details text,
  p_actor text,
  p_when timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_logs (id, username, user_role, action_type, module, details, target_id, created_at)
  VALUES (
    'LOG-INV-' || p_action || '-' || p_item_id || '-' || substr(pg_catalog.md5(p_item_id || p_when::text || pg_catalog.random()::text), 1, 12),
    p_actor,
    '',
    p_action,
    'Inventory',
    p_details,
    p_item_id,
    p_when
  );
END;
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
  v_on_hand integer := 0;
  v_kg numeric := 0;
  v_history boolean := false;
  v_can_delete boolean := true;
BEGIN
  PERFORM private.raise_inventory_delete_denied();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    v_one := private.inventory_item_preview(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_items := v_items || jsonb_build_array(v_one);
    v_on_hand := v_on_hand + coalesce((v_one->>'onHandRolls')::int, 0);
    v_kg := v_kg + coalesce((v_one->>'onHandKg')::numeric, 0);
    v_history := v_history OR coalesce((v_one->>'history')::boolean, false);
    v_can_delete := v_can_delete AND coalesce((v_one->>'canDelete')::boolean, false);
  END LOOP;
  RETURN jsonb_build_object(
    'mode', CASE
      WHEN v_kg > 0 OR v_on_hand > 0 THEN 'write_off'
      WHEN v_history OR NOT v_can_delete THEN 'archive'
      ELSE 'delete'
    END,
    'canDelete', v_can_delete,
    'history', v_history,
    'onHandRolls', v_on_hand,
    'onHandKg', round(v_kg, 2),
    'items', v_items
  );
END;
$$;

-- True delete: unused master only. History is never removed.
CREATE OR REPLACE FUNCTION private.delete_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[] := private.normalize_item_ids(p_item_ids);
  v_reason text;
  v_actor text;
  v_id text;
  v_one jsonb;
  v_items jsonb := '[]'::jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_removed integer;
BEGIN
  v_reason := private.require_inventory_reason(p_reason);
  v_actor := private.inventory_delete_actor();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('flexierp-inventory-delete'), pg_catalog.hashtext(v_id));
    v_one := private.inventory_item_preview(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_id := v_one->>'itemId';
    IF coalesce((v_one->>'onHandKg')::numeric, 0) > 0 OR coalesce((v_one->>'onHandRolls')::int, 0) > 0 THEN
      RAISE EXCEPTION 'Stock must be zero before this item can be removed. Write off, scrap, or transfer the remaining stock first.';
    END IF;
    IF NOT coalesce((v_one->>'canDelete')::boolean, false) THEN
      RAISE EXCEPTION 'This item has transactions and cannot be deleted. Archive it instead.';
    END IF;
    DELETE FROM public.inventory WHERE id = v_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    IF v_removed <> 1 THEN
      RAISE EXCEPTION 'Stock item % was not deleted', v_id;
    END IF;
    PERFORM private.write_audit(
      'DELETE',
      v_id,
      format('Deleted unused stock item %s (%s). Reason: %s. No rolls, receipts, or ledger entries were removed.', coalesce(v_one->>'itemName', v_id), v_id, v_reason),
      v_actor,
      v_now
    );
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'itemId', v_id,
      'itemCode', v_one->>'itemCode',
      'action', 'deleted',
      'isActive', true
    ));
  END LOOP;
  RETURN jsonb_build_object('action', 'deleted', 'items', v_items, 'barcodesMarked', '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.archive_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[] := private.normalize_item_ids(p_item_ids);
  v_reason text;
  v_actor text;
  v_id text;
  v_one jsonb;
  v_items jsonb := '[]'::jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  v_reason := private.require_inventory_reason(p_reason);
  v_actor := private.inventory_delete_actor();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('flexierp-inventory-delete'), pg_catalog.hashtext(v_id));
    v_one := private.inventory_item_preview(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_id := v_one->>'itemId';
    IF coalesce((v_one->>'onHandKg')::numeric, 0) > 0 OR coalesce((v_one->>'onHandRolls')::int, 0) > 0 THEN
      RAISE EXCEPTION 'Stock must be zero before this item can be archived. Write off, scrap, or transfer the remaining %s kg first.', coalesce(v_one->>'onHandKg', '0');
    END IF;
    UPDATE public.inventory
    SET is_active = false,
        archived_at = v_now,
        archived_by = v_actor,
        archive_reason = v_reason
    WHERE id = v_id;
    PERFORM private.write_audit(
      'ARCHIVE',
      v_id,
      format('Archived stock item %s (%s). Reason: %s. Rolls, barcodes, and ledger entries were kept.', coalesce(v_one->>'itemName', v_id), v_id, v_reason),
      v_actor,
      v_now
    );
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'itemId', v_id,
      'itemCode', v_one->>'itemCode',
      'action', 'archived',
      'isActive', false,
      'archivedAt', v_now,
      'archivedBy', v_actor,
      'archiveReason', v_reason,
      'stockQtyKg', 0
    ));
  END LOOP;
  RETURN jsonb_build_object('action', 'archived', 'items', v_items, 'barcodesMarked', '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.reactivate_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[] := private.normalize_item_ids(p_item_ids);
  v_reason text;
  v_actor text;
  v_id text;
  v_one jsonb;
  v_items jsonb := '[]'::jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  v_reason := private.require_inventory_reason(p_reason);
  v_actor := private.inventory_delete_actor();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    v_one := private.inventory_item_preview(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_id := v_one->>'itemId';
    UPDATE public.inventory
    SET is_active = true,
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL
    WHERE id = v_id;
    PERFORM private.write_audit(
      'REACTIVATE',
      v_id,
      format('Reactivated stock item %s (%s). Reason: %s.', coalesce(v_one->>'itemName', v_id), v_id, v_reason),
      v_actor,
      v_now
    );
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'itemId', v_id,
      'itemCode', v_one->>'itemCode',
      'action', 'reactivated',
      'isActive', true
    ));
  END LOOP;
  RETURN jsonb_build_object('action', 'reactivated', 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION private.write_off_inventory_items(
  p_item_ids text[],
  p_reason text,
  p_barcodes text[],
  p_archive boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[] := private.normalize_item_ids(p_item_ids);
  v_reason text;
  v_actor text;
  v_id text;
  v_code text;
  v_one jsonb;
  v_items jsonb := '[]'::jsonb;
  v_marked jsonb := '[]'::jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_roll record;
  v_kg numeric;
  v_written numeric := 0;
  v_loose numeric;
  v_left integer;
  v_name text;
  v_selected boolean := p_barcodes IS NOT NULL AND cardinality(p_barcodes) > 0;
BEGIN
  v_reason := private.require_inventory_reason(p_reason);
  v_actor := private.inventory_delete_actor();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one stock item';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('flexierp-inventory-delete'), pg_catalog.hashtext(v_id));
    v_one := private.inventory_item_preview(v_id);
    IF v_one IS NULL THEN
      RAISE EXCEPTION 'Stock item not found: %', v_id;
    END IF;
    v_id := v_one->>'itemId';
    v_code := nullif(v_one->>'itemCode', '');
    v_name := coalesce(v_one->>'itemName', v_id);
    v_loose := coalesce((v_one->>'looseKg')::numeric, 0);
    v_written := 0;

    IF to_regclass('public.inventory_rolls') IS NOT NULL THEN
      FOR v_roll IN
        SELECT roll.barcode_id, roll.item_name, coalesce(roll.available_weight_kg, roll.net_weight_kg, 0) AS kg
        FROM public.inventory_rolls AS roll
        WHERE (roll.item_id = v_id OR (v_code IS NOT NULL AND roll.item_id = v_code))
          AND private.roll_is_on_hand(roll.status, roll.qc_status, coalesce(roll.available_weight_kg, roll.net_weight_kg, 0))
          AND (
            NOT v_selected
            OR lower(btrim(roll.barcode_id)) IN (SELECT lower(btrim(code)) FROM unnest(p_barcodes) AS code)
          )
      LOOP
        v_kg := coalesce(v_roll.kg, 0);
        v_written := v_written + v_kg;
        INSERT INTO public.stock_adjustments (id, payload, created_at)
        VALUES (
          'WO-' || v_id || '-' || substr(pg_catalog.md5(v_roll.barcode_id || v_now::text), 1, 10),
          jsonb_build_object(
            'id', 'WO-' || v_id || '-' || substr(pg_catalog.md5(v_roll.barcode_id || v_now::text), 1, 10),
            'itemId', v_id,
            'itemCode', coalesce(v_code, v_id),
            'itemName', v_name,
            'qtyKg', -1 * v_kg,
            'type', 'Write Off',
            'reason', v_reason,
            'barcode', v_roll.barcode_id,
            'adjustedBy', v_actor,
            'date', v_now
          ),
          v_now
        );
        UPDATE public.inventory_rolls
        SET status = 'Written Off',
            available_weight_kg = 0,
            qc_status = 'Void'
        WHERE barcode_id = v_roll.barcode_id;
        PERFORM private.mark_barcode_written_off(v_roll.barcode_id, v_id, v_roll.item_name, v_reason, v_actor, v_now);
        v_marked := v_marked || jsonb_build_array(jsonb_build_object(
          'barcode', v_roll.barcode_id,
          'sourceModule', 'Raw material / GRN',
          'description', v_roll.item_name,
          'status', 'Written Off',
          'deletedReason', v_reason,
          'deletedAt', v_now,
          'deletedBy', v_actor
        ));
      END LOOP;
    END IF;

    IF v_loose > 0 AND NOT v_selected THEN
      INSERT INTO public.stock_adjustments (id, payload, created_at)
      VALUES (
        'WO-' || v_id || '-LOOSE-' || substr(pg_catalog.md5(v_id || v_now::text), 1, 8),
        jsonb_build_object(
          'itemId', v_id,
          'itemCode', coalesce(v_code, v_id),
          'itemName', v_name,
          'qtyKg', -1 * v_loose,
          'type', 'Write Off',
          'reason', v_reason,
          'barcode', '',
          'adjustedBy', v_actor,
          'date', v_now
        ),
        v_now
      );
      v_written := v_written + v_loose;
    END IF;

    UPDATE public.inventory
    SET stock_qty_kg = CASE
      WHEN v_selected THEN greatest(0, coalesce(stock_qty_kg, 0) - v_written)
      ELSE 0
    END
    WHERE id = v_id;

    SELECT count(*)::int INTO v_left
    FROM public.inventory_rolls AS roll
    WHERE to_regclass('public.inventory_rolls') IS NOT NULL
      AND (roll.item_id = v_id OR (v_code IS NOT NULL AND roll.item_id = v_code))
      AND private.roll_is_on_hand(roll.status, roll.qc_status, coalesce(roll.available_weight_kg, roll.net_weight_kg, 0));
    IF coalesce(p_archive, false) AND (
      coalesce(v_left, 0) > 0
      OR EXISTS (SELECT 1 FROM public.inventory WHERE id = v_id AND coalesce(stock_qty_kg, 0) > 0)
    ) THEN
      RAISE EXCEPTION 'Stock must be zero before this item can be archived. Write off, scrap, or transfer the remaining stock first.';
    END IF;

    PERFORM private.write_audit(
      'WRITE_OFF',
      v_id,
      format('Wrote off %s kg of stock item %s (%s). Reason: %s. Barcodes stay marked Written Off.', round(v_written, 2), v_name, v_id, v_reason),
      v_actor,
      v_now
    );

    IF coalesce(p_archive, false) THEN
      UPDATE public.inventory
      SET is_active = false, archived_at = v_now, archived_by = v_actor, archive_reason = v_reason, stock_qty_kg = 0
      WHERE id = v_id;
      PERFORM private.write_audit(
        'ARCHIVE',
        v_id,
        format('Archived stock item %s (%s) after write-off. Reason: %s.', v_name, v_id, v_reason),
        v_actor,
        v_now
      );
    END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'itemId', v_id,
      'itemCode', v_code,
      'action', CASE WHEN coalesce(p_archive, false) THEN 'archived' ELSE 'written_off' END,
      'isActive', NOT coalesce(p_archive, false),
      'archivedAt', CASE WHEN coalesce(p_archive, false) THEN to_jsonb(v_now) ELSE 'null'::jsonb END,
      'archivedBy', CASE WHEN coalesce(p_archive, false) THEN v_actor ELSE '' END,
      'archiveReason', CASE WHEN coalesce(p_archive, false) THEN v_reason ELSE '' END,
      'stockQtyKg', CASE WHEN coalesce(p_archive, false) OR NOT v_selected THEN 0 ELSE greatest(0, coalesce((v_one->>'onHandKg')::numeric, 0)) END,
      'writtenOffKg', round(v_written, 2)
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'action', CASE WHEN coalesce(p_archive, false) THEN 'archived' ELSE 'written_off' END,
    'items', v_items,
    'barcodesMarked', v_marked
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_delete_inventory_items(p_item_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.preview_delete_inventory_items(p_item_ids); $$;

CREATE OR REPLACE FUNCTION public.delete_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.delete_inventory_items(p_item_ids, p_reason); $$;

CREATE OR REPLACE FUNCTION public.archive_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.archive_inventory_items(p_item_ids, p_reason); $$;

CREATE OR REPLACE FUNCTION public.reactivate_inventory_items(p_item_ids text[], p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.reactivate_inventory_items(p_item_ids, p_reason); $$;

CREATE OR REPLACE FUNCTION public.write_off_inventory_items(p_item_ids text[], p_reason text, p_barcodes text[], p_archive boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.write_off_inventory_items(p_item_ids, p_reason, p_barcodes, p_archive); $$;

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
        'status', d.status,
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

CREATE OR REPLACE FUNCTION public.list_deleted_barcodes()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.list_deleted_barcodes(); $$;

REVOKE ALL ON FUNCTION public.archive_inventory_items(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_inventory_items(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_off_inventory_items(text[], text, text[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inventory_item_history(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.roll_is_on_hand(text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.require_inventory_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolve_inventory_item(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inventory_item_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.mark_barcode_written_off(text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_audit(text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.archive_inventory_items(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reactivate_inventory_items(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_off_inventory_items(text[], text, text[], boolean) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.archive_inventory_items(text[], text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.reactivate_inventory_items(text[], text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.write_off_inventory_items(text[], text, text[], boolean) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.archive_inventory_items(text[], text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reactivate_inventory_items(text[], text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.write_off_inventory_items(text[], text, text[], boolean) TO authenticated';
  END IF;
END $$;
