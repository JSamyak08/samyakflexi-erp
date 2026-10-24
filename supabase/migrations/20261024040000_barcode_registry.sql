-- Read-only list of barcodes already stored by each module.
-- security_invoker keeps the caller's RLS on the source tables.
-- private.can_any(ARRAY['barcodes']) returns no rows unless that role
-- has the barcodes screen. anon is not granted.
--
-- Pellet fuel has no barcode column and is not included.
-- The barcodes key is filled only when the row does not already have it,
-- so an explicit true or false is left alone and other keys are not rewritten.

UPDATE public.role_permissions
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
      'barcodes', role IN (
        'Admin',
        'Plant Manager',
        'HR & Payroll Manager',
        'Production Manager',
        'Store Manager',
        'QC Chemist',
        'Purchase Manager'
      )
    ),
    updated_at = now()
WHERE NOT (COALESCE(permissions, '{}'::jsonb) ? 'barcodes');

CREATE OR REPLACE FUNCTION public.barcode_source_module(code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN code IS NULL OR btrim(code) = '' THEN NULL
    WHEN code ILIKE 'FG-DISP-%' THEN 'Dispatch / challans'
    WHEN code ~* '^(SFG|FG)-.*-R[0-9]+$' THEN 'Consume child rolls'
    WHEN code ILIKE 'FG-%' THEN 'FG rolls'
    WHEN code ILIKE 'SFG-%' THEN 'SFG rolls'
    WHEN code ILIKE 'QCHOLD-%' OR code ILIKE 'SCRAP-%' THEN 'SFG QC hold'
    WHEN code ILIKE 'RM-%' OR code ILIKE 'CON-%' THEN 'Raw material / GRN'
    WHEN code ILIKE 'ADJ-%' OR code ILIKE 'BAR-%' THEN 'Stock adjustments'
    WHEN code ILIKE 'CYL-%' OR code ILIKE 'SKU-CYL%' THEN 'Cylinders'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.barcode_codes_from_json(value jsonb)
RETURNS TABLE (barcode text, description text, status text, location text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH elems AS (
    SELECT elem
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
    ) AS elem
  ),
  codes AS (
    SELECT
      btrim(coalesce(
        CASE WHEN jsonb_typeof(elem) = 'string' THEN elem #>> '{}' ELSE NULL END,
        elem->>'barcodeId',
        elem->>'barcode_id',
        elem->>'barcode',
        elem->>'sfgBatchCode',
        elem->>'sfg_batch_code',
        elem->>'fgBatchCode',
        elem->>'fg_batch_code',
        elem->>'holdTagId'
      )) AS barcode,
      NULLIF(btrim(coalesce(
        elem->>'itemName', elem->>'item_name', elem->>'jobName', elem->>'job_name',
        elem->>'filmType', elem->>'film_type', elem->>'description', ''
      )), '') AS description,
      NULLIF(btrim(coalesce(elem->>'status', elem->>'qcStatus', elem->>'qc_status', '')), '') AS status,
      NULLIF(btrim(coalesce(
        elem->>'locationBay', elem->>'location_bay', elem->>'storageBay',
        elem->>'storage_bay', elem->>'location', ''
      )), '') AS location
    FROM elems
    UNION ALL
    SELECT
      btrim(elem->'substrate2'->>'barcode'),
      NULLIF(btrim(coalesce(elem->'substrate2'->>'filmType', 'Substrate 2')), ''),
      NULL,
      NULL
    FROM elems
    WHERE jsonb_typeof(elem) = 'object'
    UNION ALL
    SELECT
      btrim(elem->'substrate3'->>'barcode'),
      NULLIF(btrim(coalesce(elem->'substrate3'->>'filmType', 'Substrate 3')), ''),
      NULL,
      NULL
    FROM elems
    WHERE jsonb_typeof(elem) = 'object'
    UNION ALL
    SELECT
      btrim(coalesce(elem->'outputRoll'->>'barcodeId', elem->'outputRoll'->>'barcode')),
      NULLIF(btrim(coalesce(elem->'outputRoll'->>'filmType', 'Output roll')), ''),
      NULLIF(btrim(coalesce(elem->'outputRoll'->>'status', '')), ''),
      NULL
    FROM elems
    WHERE jsonb_typeof(elem) = 'object'
  )
  SELECT barcode, description, status, location
  FROM codes
  WHERE barcode IS NOT NULL AND barcode <> '';
$$;

DROP VIEW IF EXISTS public.barcode_registry;
CREATE VIEW public.barcode_registry
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
  source_column
FROM (
  SELECT
    btrim(roll.barcode_id) AS barcode,
    CASE
      WHEN roll.barcode_id ILIKE 'FG-DISP-%' THEN 'Dispatch / challans'
      WHEN coalesce(roll.metadata->>'parentSfgBatchCode', '') <> ''
        OR roll.barcode_id ~* '^(SFG|FG)-.*-R[0-9]+$'
        THEN 'Consume child rolls'
      WHEN roll.roll_type = 'FG' OR roll.barcode_id ILIKE 'FG-%' THEN 'FG rolls'
      WHEN roll.roll_type = 'SFG' OR roll.barcode_id ILIKE 'SFG-%' THEN 'SFG rolls'
      ELSE 'Raw material / GRN'
    END AS source_module,
    coalesce(nullif(btrim(roll.item_name), ''), nullif(btrim(roll.film_type), ''), 'Roll') AS description,
    coalesce(nullif(btrim(roll.order_id), ''), nullif(btrim(roll.metadata->>'grnNo'), ''), nullif(btrim(roll.job_name), ''), roll.barcode_id) AS reference_no,
    roll.inward_datetime AS created_at,
    coalesce(nullif(btrim(roll.status), ''), nullif(btrim(roll.qc_status), '')) AS status,
    nullif(btrim(roll.location_bay), '') AS location,
    'inventory_rolls' AS source_table,
    'barcode_id' AS source_column
  FROM public.inventory_rolls AS roll
  WHERE nullif(btrim(roll.barcode_id), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(roll.barcode),
    CASE
      WHEN roll.barcode ILIKE 'FG-DISP-%' THEN 'Dispatch / challans'
      WHEN roll.barcode ~* '^(SFG|FG)-.*-R[0-9]+$' THEN 'Consume child rolls'
      WHEN roll.roll_type = 'FG' OR roll.barcode ILIKE 'FG-%' THEN 'FG rolls'
      WHEN roll.roll_type = 'SFG' OR roll.barcode ILIKE 'SFG-%' THEN 'SFG rolls'
      ELSE 'Raw material / GRN'
    END,
    coalesce(nullif(btrim(roll.item_name), ''), 'Roll'),
    coalesce(nullif(btrim(roll.order_id), ''), nullif(btrim(roll.job_name), ''), roll.barcode_id),
    roll.inward_datetime,
    nullif(btrim(roll.status), ''),
    nullif(btrim(roll.location_bay), ''),
    'inventory_rolls',
    'barcode'
  FROM public.inventory_rolls AS roll
  WHERE nullif(btrim(roll.barcode), '') IS NOT NULL
    AND lower(btrim(roll.barcode)) IS DISTINCT FROM lower(btrim(coalesce(roll.barcode_id, '')))

  UNION ALL
  SELECT
    code.barcode,
    coalesce(public.barcode_source_module(code.barcode), 'Linked input barcodes'),
    coalesce(code.description, nullif(btrim(roll.item_name), ''), 'Input barcode'),
    coalesce(nullif(btrim(roll.order_id), ''), roll.barcode_id),
    roll.inward_datetime,
    coalesce(code.status, nullif(btrim(roll.status), '')),
    coalesce(code.location, nullif(btrim(roll.location_bay), '')),
    'inventory_rolls',
    'input_barcode_ids'
  FROM public.inventory_rolls AS roll
  CROSS JOIN LATERAL public.barcode_codes_from_json(roll.input_barcode_ids) AS code

  UNION ALL
  SELECT
    btrim(item.barcode),
    'Inventory items',
    coalesce(nullif(btrim(item.item_name), ''), 'Inventory item'),
    coalesce(nullif(btrim(item.item_code), ''), item.id),
    item.last_updated,
    nullif(btrim(item.category), ''),
    nullif(btrim(item.location), ''),
    'inventory',
    'barcode'
  FROM public.inventory AS item
  WHERE nullif(btrim(item.barcode), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(sfg.sfg_batch_code),
    CASE
      WHEN sfg.sfg_batch_code ILIKE 'FG-DISP-%' THEN 'Dispatch / challans'
      WHEN coalesce(sfg.notes, '') ILIKE '%parentSfgBatchCode%'
        OR sfg.sfg_batch_code ~* '^(SFG|FG)-.*-R[0-9]+$'
        THEN 'Consume child rolls'
      WHEN sfg.sfg_batch_code ILIKE 'FG-%' OR coalesce(sfg.sfg_type, '') ILIKE '%finish%' THEN 'FG rolls'
      ELSE 'SFG rolls'
    END,
    coalesce(nullif(btrim(sfg.job_name), ''), nullif(btrim(sfg.sfg_type), ''), 'SFG roll'),
    coalesce(nullif(btrim(sfg.order_id), ''), nullif(btrim(sfg.job_name), ''), sfg.sfg_batch_code),
    sfg.created_at,
    nullif(btrim(sfg.status), ''),
    nullif(btrim(sfg.storage_bay), ''),
    'sfg_goods',
    'sfg_batch_code'
  FROM public.sfg_goods AS sfg
  WHERE nullif(btrim(sfg.sfg_batch_code), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(fg.fg_batch_code),
    CASE
      WHEN fg.fg_batch_code ILIKE 'FG-DISP-%' THEN 'Dispatch / challans'
      WHEN fg.fg_batch_code ~* '^(SFG|FG)-.*-R[0-9]+$' THEN 'Consume child rolls'
      ELSE 'FG rolls'
    END,
    coalesce(nullif(btrim(fg.job_name), ''), nullif(btrim(fg.fg_type), ''), 'FG roll'),
    coalesce(nullif(btrim(fg.order_id), ''), nullif(btrim(fg.job_name), ''), fg.fg_batch_code),
    fg.created_at,
    nullif(btrim(fg.status), ''),
    nullif(btrim(fg.storage_bay), ''),
    'fg_goods',
    'fg_batch_code'
  FROM public.fg_goods AS fg
  WHERE nullif(btrim(fg.fg_batch_code), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(store.batch_no),
    CASE
      WHEN store.item_type ILIKE 'FG%' OR store.batch_no ILIKE 'FG-%' THEN 'FG rolls'
      ELSE 'SFG / FG store'
    END,
    coalesce(nullif(btrim(store.job_name), ''), 'Store batch'),
    coalesce(nullif(btrim(store.job_card_no), ''), store.id),
    store.created_at,
    nullif(btrim(store.status), ''),
    nullif(btrim(store.location_rack), ''),
    'sfg_fg_store',
    'batch_no'
  FROM public.sfg_fg_store AS store
  WHERE nullif(btrim(store.batch_no), '') IS NOT NULL

  UNION ALL
  SELECT
    code.barcode,
    'Raw material / GRN',
    coalesce(code.description, nullif(btrim(line.item_name), ''), 'GRN line'),
    line.grn_id,
    line.created_at,
    code.status,
    code.location,
    'grn_line_items',
    'rolls'
  FROM public.grn_line_items AS line
  CROSS JOIN LATERAL public.barcode_codes_from_json(line.rolls) AS code

  UNION ALL
  SELECT
    code.barcode,
    'Dispatch / challans',
    coalesce(code.description, nullif(btrim(shipment.job_name), ''), 'Dispatch roll'),
    coalesce(nullif(btrim(shipment.dispatch_id), ''), nullif(btrim(shipment.order_id), '')),
    coalesce(shipment.dispatch_date, shipment.created_at),
    coalesce(code.status, nullif(btrim(shipment.challan_nature), '')),
    coalesce(code.location, nullif(btrim(shipment.vehicle_no), '')),
    'dispatch_shipments',
    'items'
  FROM public.dispatch_shipments AS shipment
  CROSS JOIN LATERAL public.barcode_codes_from_json(shipment.items) AS code

  UNION ALL
  SELECT
    code.barcode,
    'Dispatch / challans',
    coalesce(code.description, nullif(btrim(challan.payload->>'jobName'), ''), 'Challan line'),
    coalesce(nullif(btrim(challan.challan_no), ''), nullif(btrim(challan.payload->>'orderId'), ''), challan.id),
    challan.created_at,
    coalesce(code.status, nullif(btrim(challan.payload->>'returnStatus'), '')),
    coalesce(code.location, nullif(btrim(challan.payload->>'vehicleNo'), '')),
    'delivery_challans',
    'payload'
  FROM public.delivery_challans AS challan
  CROSS JOIN LATERAL public.barcode_codes_from_json(
    CASE
      WHEN jsonb_typeof(challan.payload -> 'items') = 'array' THEN challan.payload -> 'items'
      ELSE '[]'::jsonb
    END
  ) AS code

  UNION ALL
  SELECT
    btrim(coalesce(row.payload->>'barcode', row.payload->>'barcodeId')),
    'Barcode print',
    coalesce(nullif(btrim(row.payload->>'itemName'), ''), 'Printed barcode'),
    row.id,
    row.created_at,
    NULL,
    NULL,
    'custom_barcodes',
    'payload'
  FROM public.custom_barcodes AS row
  WHERE nullif(btrim(coalesce(row.payload->>'barcode', row.payload->>'barcodeId')), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(row.payload->>'barcode'),
    'Stock adjustments',
    coalesce(nullif(btrim(row.payload->>'itemName'), ''), nullif(btrim(row.payload->>'reason'), ''), 'Stock adjustment'),
    coalesce(nullif(btrim(row.payload->>'itemId'), ''), row.id),
    row.created_at,
    nullif(btrim(row.payload->>'type'), ''),
    NULL,
    'stock_adjustments',
    'payload'
  FROM public.stock_adjustments AS row
  WHERE nullif(btrim(row.payload->>'barcode'), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(coalesce(row.payload->>'barcodeId', row.payload->>'barcode', row.payload->>'sfgBatchCode', row.payload->>'holdTagId')),
    'SFG QC hold',
    coalesce(nullif(btrim(row.payload->>'itemName'), ''), nullif(btrim(row.payload->>'jobName'), ''), 'QC hold'),
    coalesce(nullif(btrim(row.payload->>'orderId'), ''), nullif(btrim(row.payload->>'parentSfgBatchCode'), ''), row.id),
    row.created_at,
    coalesce(nullif(btrim(row.payload->>'status'), ''), 'QC Hold'),
    nullif(btrim(row.payload->>'storageBay'), ''),
    'sfg_qc_hold_items',
    'payload'
  FROM public.sfg_qc_hold_items AS row
  WHERE nullif(btrim(coalesce(row.payload->>'barcodeId', row.payload->>'barcode', row.payload->>'sfgBatchCode', row.payload->>'holdTagId')), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(coalesce(row.payload->>'holdTagId', row.payload->>'barcodeId', row.payload->>'barcode')),
    'SFG scrap',
    coalesce(nullif(btrim(row.payload->>'itemName'), ''), 'Scrap'),
    coalesce(nullif(btrim(row.payload->>'orderId'), ''), row.id),
    row.created_at,
    coalesce(nullif(btrim(row.payload->>'status'), ''), 'Scrap'),
    nullif(btrim(row.payload->>'storageBay'), ''),
    'sfg_scrap_items',
    'payload'
  FROM public.sfg_scrap_items AS row
  WHERE nullif(btrim(coalesce(row.payload->>'holdTagId', row.payload->>'barcodeId', row.payload->>'barcode')), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(coalesce(row.payload->>'barcode', row.payload->>'barcodeId')),
    'Store issues',
    coalesce(nullif(btrim(row.payload->>'itemName'), ''), 'Store issue'),
    row.id,
    row.created_at,
    nullif(btrim(row.payload->>'status'), ''),
    nullif(btrim(row.payload->>'location'), ''),
    'store_issue_transactions',
    'payload'
  FROM public.store_issue_transactions AS row
  WHERE nullif(btrim(coalesce(row.payload->>'barcode', row.payload->>'barcodeId')), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(cylinder.sku),
    'Cylinders',
    coalesce(nullif(btrim(cylinder.job_name), ''), 'Cylinder'),
    cylinder.id,
    cylinder.created_at,
    nullif(btrim(cylinder.status), ''),
    nullif(btrim(cylinder.assigned_press), ''),
    'cylinders',
    'sku'
  FROM public.cylinders AS cylinder
  WHERE nullif(btrim(cylinder.sku), '') IS NOT NULL

  UNION ALL
  SELECT
    btrim(cylinder.id),
    'Cylinders',
    coalesce(nullif(btrim(cylinder.job_name), ''), 'Cylinder'),
    nullif(btrim(cylinder.sku), ''),
    cylinder.created_at,
    nullif(btrim(cylinder.status), ''),
    nullif(btrim(cylinder.assigned_press), ''),
    'cylinders',
    'id'
  FROM public.cylinders AS cylinder
  WHERE nullif(btrim(cylinder.id), '') IS NOT NULL
    AND lower(btrim(cylinder.id)) IS DISTINCT FROM lower(btrim(coalesce(cylinder.sku, '')))

  UNION ALL
  SELECT
    code.barcode,
    'Production records',
    coalesce(code.description, nullif(btrim(record.job_name), ''), 'Production record'),
    coalesce(nullif(btrim(record.order_id), ''), nullif(btrim(record.job_name), ''), record.id),
    record.recorded_at,
    coalesce(code.status, nullif(btrim(record.status), '')),
    code.location,
    'production_records',
    src.source_column
  FROM public.production_records AS record
  CROSS JOIN LATERAL (
    VALUES
      (record.materials_list, 'materials_list'),
      (record.output_rolls, 'output_rolls'),
      (record.input_rolls_list, 'input_rolls_list'),
      (record.sfg_consumptions, 'sfg_consumptions'),
      (record.process_logs -> 'outputRolls', 'process_logs'),
      (record.process_logs -> 'inputRollsList', 'process_logs'),
      (record.process_logs -> 'materialsList', 'process_logs'),
      (record.process_logs -> 'createdBalanceRolls', 'process_logs'),
      (record.process_logs -> 'sfgConsumptions', 'process_logs'),
      (record.process_logs -> 'stages' -> 'printing' -> 'outputRolls', 'process_logs'),
      (record.process_logs -> 'stages' -> 'printing' -> 'inputRollsList', 'process_logs')
  ) AS src(payload, source_column)
  CROSS JOIN LATERAL public.barcode_codes_from_json(src.payload) AS code
) AS raw
WHERE private.can_any(ARRAY['barcodes']::text[])
  AND nullif(btrim(barcode), '') IS NOT NULL
  AND lower(btrim(barcode)) NOT IN ('null', 'undefined', 'n/a', 'na', '-')
  AND btrim(barcode) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY source_module, lower(barcode), created_at DESC NULLS LAST;

REVOKE ALL ON FUNCTION public.barcode_source_module(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.barcode_codes_from_json(jsonb) FROM PUBLIC;
REVOKE ALL ON TABLE public.barcode_registry FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.barcode_source_module(text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.barcode_codes_from_json(jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.barcode_registry FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.barcode_source_module(text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.barcode_codes_from_json(jsonb) TO authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.barcode_registry FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.barcode_registry TO authenticated';
  END IF;
END $$;
