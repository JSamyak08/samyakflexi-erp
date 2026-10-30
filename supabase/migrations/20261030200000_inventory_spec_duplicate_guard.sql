-- Block new inventory rows that repeat an existing name + category + micron + width.
-- Existing duplicate rows are left in place. There is no unique index: a unique
-- index cannot be NOT VALID, and it would fail until the manual merge runs.
-- Upsert of a row that already has this id is allowed, so saving a survivor
-- while its duplicate still exists does not raise.
--
-- After supabase/manual/2026-10-30_merge_duplicate_inventory_items.sql is
-- committed, a unique index can be added in a later migration.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.inventory_spec_key(
  p_item_name text,
  p_category text,
  p_micron numeric,
  p_width_mm numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(regexp_replace(split_part(coalesce(p_item_name, ''), ' ||| ', 1), '\s+', ' ', 'g')))
    || '|' || lower(btrim(coalesce(p_category, '')))
    || '|' || CASE WHEN p_micron IS NULL THEN '-1' ELSE trim_scale(p_micron)::text END
    || '|' || CASE WHEN p_width_mm IS NULL THEN '-1' ELSE trim_scale(p_width_mm)::text END;
$$;

CREATE OR REPLACE FUNCTION private.reject_new_duplicate_inventory_spec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory AS existing
    WHERE private.inventory_spec_key(existing.item_name, existing.category, existing.micron, existing.width_mm)
        = private.inventory_spec_key(NEW.item_name, NEW.category, NEW.micron, NEW.width_mm)
  ) THEN
    RAISE EXCEPTION 'Duplicate inventory item for this name, category, micron, and width'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.inventory_spec_key(text, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reject_new_duplicate_inventory_spec() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.inventory_spec_key(text, text, numeric, numeric) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.reject_new_duplicate_inventory_spec() TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.inventory_spec_key(text, text, numeric, numeric) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.reject_new_duplicate_inventory_spec() TO service_role';
  END IF;
END $$;

DROP TRIGGER IF EXISTS inventory_reject_new_duplicate_spec ON public.inventory;
CREATE TRIGGER inventory_reject_new_duplicate_spec
  BEFORE INSERT ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_new_duplicate_inventory_spec();
