-- Scrap from SFG/FG is a weight record. It is not a barcode.
--
-- The barcode list is a view. This replaces that view so a scrap row is
-- listed only when it already carries a barcode-shaped code (an older sticker).
-- A production-record id, a scrapref id, or a print-scrap id is not a barcode.
--
-- No scrap row is updated or deleted. Raw-material rolls, SFG/FG batches,
-- balance rolls, and deleted barcodes are unchanged.

CREATE OR REPLACE FUNCTION public.scrap_code_is_legacy_barcode(code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT code IS NOT NULL
    AND btrim(code) <> ''
    AND (
      btrim(code) ~* '^(SFG|FG|RM|CON|QCHOLD|QC-HOLD|SCRAP|ADJ|BAR|CYL|SKU-CYL|FG-DISP)-'
      OR btrim(code) ~* '-BAL$'
    );
$$;

COMMENT ON FUNCTION public.scrap_code_is_legacy_barcode(text) IS
  'True only for a code that already looks like a plant barcode. Used so older scrap stickers stay on the barcode list.';

DO $$
BEGIN
  IF to_regclass('public.barcode_registry_sources') IS NULL
     AND to_regclass('public.barcode_registry') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.barcode_registry RENAME TO barcode_registry_sources';
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
  WHERE NOT (
    s.source_table = 'sfg_scrap_items'
    AND NOT public.scrap_code_is_legacy_barcode(s.barcode)
  )
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

COMMENT ON VIEW public.barcode_registry IS
  'Stored barcodes. Scrap rows are included only when they already have a barcode-shaped code.';

REVOKE ALL ON FUNCTION public.scrap_code_is_legacy_barcode(text) FROM PUBLIC;
REVOKE ALL ON TABLE public.barcode_registry FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.scrap_code_is_legacy_barcode(text) FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.barcode_registry FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.scrap_code_is_legacy_barcode(text) TO authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.barcode_registry TO authenticated';
  END IF;
END $$;
