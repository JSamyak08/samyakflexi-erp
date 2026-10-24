-- Removes the barcode registry view and the barcodes permission key.
-- Other permission keys are left as they were.

DROP VIEW IF EXISTS public.barcode_registry;
DROP FUNCTION IF EXISTS public.barcode_codes_from_json(jsonb);
DROP FUNCTION IF EXISTS public.barcode_source_module(text);

UPDATE public.role_permissions
SET permissions = permissions - 'barcodes',
    updated_at = now()
WHERE permissions ? 'barcodes';
