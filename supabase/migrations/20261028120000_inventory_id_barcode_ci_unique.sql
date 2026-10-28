-- Inventory ids are already unique (inventory_pkey) and roll barcodes are
-- already unique (inventory_rolls_pkey). Those keys are case-sensitive, so
-- INVT-0001 and invt-0001 could both be inserted. These indexes close that
-- gap for new writes. If a case-insensitive duplicate is already stored, the
-- index is skipped and the app still refuses a generated id or barcode that
-- matches an existing value.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'inventory_id_ci_unique'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.inventory
    WHERE id IS NOT NULL
    GROUP BY lower(btrim(id))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX inventory_id_ci_unique
      ON public.inventory (lower(btrim(id)));
    COMMENT ON INDEX public.inventory_id_ci_unique IS
      'Case-insensitive uniqueness for generated inventory ids. inventory_pkey remains the primary key.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'inventory_rolls_barcode_ci_unique'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_rolls
    WHERE barcode_id IS NOT NULL
    GROUP BY lower(btrim(barcode_id))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX inventory_rolls_barcode_ci_unique
      ON public.inventory_rolls (lower(btrim(barcode_id)));
    COMMENT ON INDEX public.inventory_rolls_barcode_ci_unique IS
      'Case-insensitive uniqueness for roll barcodes. inventory_rolls_pkey remains the primary key.';
  END IF;
END $$;
