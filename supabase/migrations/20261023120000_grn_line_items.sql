-- One invoice line per existing goods receipt.
--
-- public.grns stays the invoice header. Its columns (item_name, received_qty_kg,
-- metallocene_pct, stock_item_id, master_item_id, status, and the rest) are not
-- updated here, so current screens keep reading the same summary.
--
-- Specs that today live only inside item_name after "|||" are copied onto one
-- public.grn_line_items row. Rolls on inventory_rolls gain a nullable link to
-- that header (grn_id). grn_line_item_id is left null: a roll with no line id
-- belongs to the only line on that receipt.
--
-- Safe to run more than once. A receipt that already has a line is skipped.
-- A roll that already has grn_id is skipped.

CREATE OR REPLACE FUNCTION public._grn_to_numeric(raw text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF raw IS NULL OR btrim(raw) = '' OR btrim(raw) = '-' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(raw)::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Same split the app uses: text before the first "|||" is the display name,
-- and the remainder is one JSON object. Invalid JSON becomes an empty object.
CREATE OR REPLACE FUNCTION public._grn_unpack_item_name(raw text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  marker integer;
  display_name text;
  payload text;
  parsed jsonb;
BEGIN
  IF raw IS NULL THEN
    RETURN jsonb_build_object('itemName', '', 'meta', '{}'::jsonb);
  END IF;

  marker := position('|||' IN raw);
  IF marker = 0 THEN
    RETURN jsonb_build_object('itemName', btrim(raw), 'meta', '{}'::jsonb);
  END IF;

  display_name := btrim(substring(raw FROM 1 FOR marker - 1));
  payload := btrim(substring(raw FROM marker + 3));

  BEGIN
    parsed := payload::jsonb;
  EXCEPTION WHEN OTHERS THEN
    parsed := NULL;
  END;

  IF parsed IS NULL OR jsonb_typeof(parsed) <> 'object' THEN
    parsed := '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object('itemName', display_name, 'meta', parsed);
END;
$$;

REVOKE ALL ON FUNCTION public._grn_to_numeric(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._grn_unpack_item_name(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public._grn_to_numeric(text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public._grn_unpack_item_name(text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public._grn_to_numeric(text) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public._grn_unpack_item_name(text) FROM authenticated';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.grn_line_items (
  id text PRIMARY KEY,
  grn_id text NOT NULL,
  line_no integer NOT NULL,
  po_line_id text,
  category text,
  item_name text,
  film_type text,
  micron numeric,
  width_mm numeric,
  metallocene_pct text,
  unit text,
  stock_item_id text,
  master_item_id text,
  purchase_rate numeric,
  batch_no text,
  packaging_type text,
  rolls_received integer,
  gross_weight_kg numeric,
  tare_weight_kg numeric,
  net_weight_kg numeric,
  invoice_qty_kg numeric,
  remarks text,
  rolls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS grn_id text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS line_no integer;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS po_line_id text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS item_name text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS film_type text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS micron numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS width_mm numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS metallocene_pct text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS stock_item_id text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS master_item_id text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS purchase_rate numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS batch_no text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS packaging_type text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS rolls_received integer;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS gross_weight_kg numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS tare_weight_kg numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS net_weight_kg numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS invoice_qty_kg numeric;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS rolls jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.grn_line_items ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.grn_line_items
SET rolls = '[]'::jsonb
WHERE rolls IS NULL;

ALTER TABLE public.grn_line_items ALTER COLUMN rolls SET DEFAULT '[]'::jsonb;
ALTER TABLE public.grn_line_items ALTER COLUMN rolls SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grn_line_items_grn_id_fkey'
  ) THEN
    ALTER TABLE public.grn_line_items
      ADD CONSTRAINT grn_line_items_grn_id_fkey
      FOREIGN KEY (grn_id) REFERENCES public.grns(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS grn_line_items_grn_id_line_no_key
  ON public.grn_line_items (grn_id, line_no);
CREATE INDEX IF NOT EXISTS grn_line_items_grn_id_idx
  ON public.grn_line_items (grn_id);
CREATE INDEX IF NOT EXISTS grn_line_items_po_line_id_idx
  ON public.grn_line_items (po_line_id);
CREATE INDEX IF NOT EXISTS grn_line_items_stock_item_id_idx
  ON public.grn_line_items (stock_item_id);

ALTER TABLE public.grn_line_items ENABLE ROW LEVEL SECURITY;

-- Same open policy the other business tables use until the manual lockdown
-- script replaces it with inventory + purchase_orders access.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grn_line_items TO anon, authenticated';

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.grn_line_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      'Allow anon and auth full access'
    );
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.inventory_rolls ADD COLUMN IF NOT EXISTS grn_id text;
ALTER TABLE public.inventory_rolls ADD COLUMN IF NOT EXISTS grn_line_item_id text;
ALTER TABLE public.inventory_rolls ADD COLUMN IF NOT EXISTS line_no integer;
ALTER TABLE public.inventory_rolls ADD COLUMN IF NOT EXISTS vendor_roll_no text;
ALTER TABLE public.inventory_rolls ADD COLUMN IF NOT EXISTS unit_no integer;

CREATE INDEX IF NOT EXISTS inventory_rolls_grn_id_idx
  ON public.inventory_rolls (grn_id);
CREATE INDEX IF NOT EXISTS inventory_rolls_grn_line_item_id_idx
  ON public.inventory_rolls (grn_line_item_id);

INSERT INTO public.grn_line_items (
  id,
  grn_id,
  line_no,
  po_line_id,
  category,
  item_name,
  film_type,
  micron,
  width_mm,
  metallocene_pct,
  unit,
  stock_item_id,
  master_item_id,
  purchase_rate,
  batch_no,
  packaging_type,
  rolls_received,
  gross_weight_kg,
  tare_weight_kg,
  net_weight_kg,
  invoice_qty_kg,
  remarks,
  rolls,
  created_at
)
SELECT
  src.id || '-L1',
  src.id,
  1,
  NULLIF(src.meta->>'poLineId', ''),
  COALESCE(NULLIF(src.meta->>'category', ''), 'Film Substrates'),
  COALESCE(NULLIF(src.item_label, ''), 'Item'),
  COALESCE(
    NULLIF(src.meta->>'filmType', ''),
    NULLIF(split_part(COALESCE(src.item_label, ''), ' ', 1), ''),
    'PET'
  ),
  public._grn_to_numeric(src.meta->>'micron'),
  public._grn_to_numeric(src.meta->>'widthMm'),
  COALESCE(
    NULLIF(src.meta->>'metallocenePct', ''),
    NULLIF(src.meta->>'metallocene_pct', ''),
    NULLIF(src.metallocene_pct, '')
  ),
  COALESCE(NULLIF(src.meta->>'unit', ''), 'Kg'),
  COALESCE(NULLIF(src.meta->>'stockItemId', ''), NULLIF(src.stock_item_id, '')),
  COALESCE(NULLIF(src.meta->>'masterItemId', ''), NULLIF(src.master_item_id, '')),
  COALESCE(
    public._grn_to_numeric(src.meta->>'purchaseRatePerKg'),
    public._grn_to_numeric(src.meta->>'unitPrice'),
    public._grn_to_numeric(src.meta->>'purchaseRate'),
    0
  ),
  COALESCE(src.meta->>'batchNo', ''),
  COALESCE(NULLIF(src.meta->>'packagingType', ''), 'Roll'),
  CASE
    WHEN src.meta ? 'rollsReceived'
      AND public._grn_to_numeric(src.meta->>'rollsReceived') IS NOT NULL
      THEN public._grn_to_numeric(src.meta->>'rollsReceived')::integer
    WHEN src.roll_count > 0 THEN src.roll_count
    ELSE 0
  END,
  COALESCE(public._grn_to_numeric(src.meta->>'grossWeightKg'), 0),
  COALESCE(public._grn_to_numeric(src.meta->>'tareWeightKg'), 0),
  COALESCE(src.received_qty_kg, public._grn_to_numeric(src.meta->>'netWeightKg'), 0),
  NULL,
  COALESCE(src.meta->>'itemRemarks', src.meta->>'remarks', src.meta->>'notes', ''),
  src.rolls,
  COALESCE(src.created_at, now())
FROM (
  SELECT
    g.id,
    g.metallocene_pct,
    g.stock_item_id,
    g.master_item_id,
    g.received_qty_kg,
    g.created_at,
    parts.unpacked->>'itemName' AS item_label,
    parts.unpacked->'meta' AS meta,
    COALESCE(built.rolls, synthetic.rolls) AS rolls,
    COALESCE(built.roll_count, 0) AS roll_count
  FROM public.grns g
  CROSS JOIN LATERAL (
    SELECT public._grn_unpack_item_name(g.item_name) AS unpacked
  ) unpacked_row
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN jsonb_typeof(unpacked_row.unpacked->'meta'->'itemsBreakdown') = 'array'
          THEN unpacked_row.unpacked->'meta'->'itemsBreakdown'
        ELSE '[]'::jsonb
      END AS breakdown,
      unpacked_row.unpacked AS unpacked
  ) parts
  LEFT JOIN LATERAL (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'unitNo', COALESCE(
            (public._grn_to_numeric(elem->>'unitNo'))::integer,
            ordinality::integer
          ),
          'barcodeId', NULLIF(COALESCE(elem->>'barcodeId', elem->>'barcode_id'), ''),
          'grossWeightKg', COALESCE(public._grn_to_numeric(elem->>'grossWeightKg'), 0),
          'tareWeightKg', COALESCE(public._grn_to_numeric(elem->>'tareWeightKg'), 0),
          'netWeightKg', COALESCE(public._grn_to_numeric(elem->>'netWeightKg'), 0),
          'lengthMeters', COALESCE(public._grn_to_numeric(elem->>'lengthMeters'), 0),
          'vendorRollNo', COALESCE(elem->>'vendorRollNo', ''),
          'itemRemarks', COALESCE(elem->>'itemRemarks', elem->>'notes', elem->>'remarks', '')
        )
        ORDER BY ordinality
      ) AS rolls,
      COUNT(*)::integer AS roll_count
    FROM jsonb_array_elements(parts.breakdown) WITH ORDINALITY AS listed(elem, ordinality)
  ) built ON true
  CROSS JOIN LATERAL (
    SELECT jsonb_build_array(
      jsonb_build_object(
        'unitNo', 1,
        'barcodeId', NULL,
        'grossWeightKg', COALESCE(
          public._grn_to_numeric(parts.unpacked->'meta'->>'grossWeightKg'),
          g.received_qty_kg,
          0
        ),
        'tareWeightKg', COALESCE(public._grn_to_numeric(parts.unpacked->'meta'->>'tareWeightKg'), 0),
        'netWeightKg', COALESCE(g.received_qty_kg, 0),
        'lengthMeters', 0,
        'vendorRollNo', '',
        'itemRemarks', COALESCE(parts.unpacked->'meta'->>'itemRemarks', '')
      )
    ) AS rolls
  ) synthetic
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.grn_line_items existing
    WHERE existing.grn_id = g.id
       OR existing.id = g.id || '-L1'
  )
) src;

-- Link an existing roll to the receipt whose id or document number is stored
-- in metadata. Do not assign a line id; null means "the single backfilled line".
UPDATE public.inventory_rolls AS roll
SET grn_id = matched.grn_id
FROM (
  SELECT
    candidate.barcode_id,
    (
      SELECT header.id
      FROM public.grns AS header
      WHERE header.id = candidate.ref
         OR header.grn_number = candidate.ref
      ORDER BY
        CASE WHEN header.id = candidate.ref THEN 0 ELSE 1 END,
        header.created_at NULLS LAST,
        header.id
      LIMIT 1
    ) AS grn_id
  FROM (
    SELECT
      barcode_id,
      btrim(COALESCE(metadata->>'grnNo', metadata->>'grn_no', '')) AS ref
    FROM public.inventory_rolls
    WHERE grn_id IS NULL
      AND metadata IS NOT NULL
  ) AS candidate
  WHERE candidate.ref <> ''
) AS matched
WHERE roll.barcode_id = matched.barcode_id
  AND matched.grn_id IS NOT NULL
  AND roll.grn_id IS NULL;

-- Drop values that cannot satisfy the foreign keys (manual leftovers).
UPDATE public.inventory_rolls AS roll
SET grn_id = NULL
WHERE roll.grn_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.grns AS header WHERE header.id = roll.grn_id
  );

UPDATE public.inventory_rolls AS roll
SET grn_line_item_id = NULL
WHERE roll.grn_line_item_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.grn_line_items AS line WHERE line.id = roll.grn_line_item_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_rolls_grn_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_rolls
      ADD CONSTRAINT inventory_rolls_grn_id_fkey
      FOREIGN KEY (grn_id) REFERENCES public.grns(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_rolls_grn_line_item_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_rolls
      ADD CONSTRAINT inventory_rolls_grn_line_item_id_fkey
      FOREIGN KEY (grn_line_item_id) REFERENCES public.grn_line_items(id) ON DELETE SET NULL;
  END IF;
END $$;
