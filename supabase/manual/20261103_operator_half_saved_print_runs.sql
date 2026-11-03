-- READ ONLY. This file is not a migration and must not be applied automatically.
-- It does not INSERT, UPDATE, or DELETE.
--
-- Why a half-saved run can exist (code only; this session has no production database):
--
-- PR #79 (20261101180000) makes Printing Operator and Shop Floor Operator
-- sfg_store = 'view' and rejects their direct writes to sfg_scrap_items and
-- sfg_goods with "SFG / FG Store is view-only for this account".
-- PR #81 (20261102120000) ends the run inside record_print_run and, in that
-- same request, posts the input-roll issue and the -BAL balance roll.
-- The browser then saves the production record and inserts printing scrap.
-- When plain setting or printing wastage is above zero, the scrap insert hits
-- the view-only trigger. That happens after record_print_run has already
-- committed, and before save_printing_sfg_lot runs. The order is Completed,
-- a -BAL roll may exist, inventory_rolls may already hold the SFG-BC barcodes
-- the browser saved first, and the SFG-LOT-<order id> row is missing.
-- The "Ended printing job" audit line is written only after the lot save, so
-- a failed end often has no that audit row. print_runs.ended_by is set inside
-- record_print_run, so it is the reliable operator marker.
--
-- Adjust the timestamp if PR #81 reached production later than the migration clock.

WITH operator_ends AS (
  SELECT
    pr.id AS print_run_id,
    pr.order_id,
    pr.ended_at,
    pr.ended_by,
    pr.ended_operator_name,
    u.role AS user_role,
    u.assigned_roles
  FROM public.print_runs AS pr
  LEFT JOIN public.users AS u ON u.auth_user_id = pr.ended_by
  WHERE pr.ended_at IS NOT NULL
    AND pr.ended_at >= timestamptz '2026-11-02 12:00:00+00'
    AND (
      u.role IN ('Printing Operator', 'Shop Floor Operator')
      OR COALESCE(u.assigned_roles, ARRAY[]::text[]) && ARRAY['Printing Operator', 'Shop Floor Operator']::text[]
    )
),
input_remainders AS (
  SELECT
    e.order_id,
    btrim(coalesce(roll.value ->> 'barcodeId', roll.value ->> 'barcode', '')) AS parent_barcode,
    GREATEST(
      COALESCE(
        CASE WHEN coalesce(roll.value ->> 'initialWeightKg', roll.value ->> 'initialKg', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN coalesce(roll.value ->> 'initialWeightKg', roll.value ->> 'initialKg')::numeric
          ELSE 0
        END,
        0
      )
      - COALESCE(
        CASE WHEN coalesce(roll.value ->> 'consumedWeightKg', roll.value ->> 'consumedKg', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN coalesce(roll.value ->> 'consumedWeightKg', roll.value ->> 'consumedKg')::numeric
          ELSE 0
        END,
        0
      ),
      0
    ) AS remainder_kg
  FROM operator_ends AS e
  JOIN public.orders AS o ON o.id = e.order_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.job_details -> 'inputRollsList', '[]'::jsonb)) AS roll(value)
),
expected_balance AS (
  SELECT
    order_id,
    parent_barcode || '-BAL' AS balance_barcode,
    remainder_kg
  FROM input_remainders
  WHERE parent_barcode <> ''
    AND remainder_kg > 0.05
),
missing_balance AS (
  SELECT
    expected.order_id,
    string_agg(expected.balance_barcode, ', ' ORDER BY expected.balance_barcode) AS missing_balance_barcodes
  FROM expected_balance AS expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.inventory_ledger_entries AS entry
    WHERE entry.order_id = expected.order_id
      AND entry.entry_kind = 'balance_receipt'
      AND lower(btrim(entry.barcode)) = lower(expected.balance_barcode)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_rolls AS roll
    WHERE lower(btrim(roll.barcode_id)) = lower(expected.balance_barcode)
      AND COALESCE(roll.available_weight_kg, 0) > 0
  )
  GROUP BY expected.order_id
)
SELECT
  e.order_id,
  split_part(coalesce(o.job_name, ''), ' ||| ', 1) AS job_name,
  e.ended_at,
  e.ended_operator_name,
  e.user_role,
  e.ended_by,
  o.printing_status,
  o.printed_output_kg,
  EXISTS (
    SELECT 1
    FROM public.sfg_goods AS lot
    WHERE lot.sfg_batch_code = 'SFG-LOT-' || e.order_id
      AND COALESCE(lot.total_net_kg, 0) > 0
  ) AS sfg_lot_saved,
  (
    SELECT count(*)
    FROM public.inventory_rolls AS roll
    WHERE roll.order_id = e.order_id
      AND (
        roll.roll_type = 'SEMI_FINISHED_GOODS'
        OR roll.barcode_id LIKE 'SFG-BC-%'
      )
  ) AS printed_roll_rows,
  (
    SELECT count(*)
    FROM public.sfg_scrap_items AS scrap
    WHERE scrap.id LIKE 'print-scrap:' || e.order_id || ':%'
  ) AS printing_scrap_rows,
  COALESCE(missing.missing_balance_barcodes, '') AS missing_balance_barcodes,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.sfg_goods AS lot
      WHERE lot.sfg_batch_code = 'SFG-LOT-' || e.order_id
        AND COALESCE(lot.total_net_kg, 0) > 0
    ) AND COALESCE(missing.missing_balance_barcodes, '') <> '' THEN 'missing printed SFG lot and balance roll'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.sfg_goods AS lot
      WHERE lot.sfg_batch_code = 'SFG-LOT-' || e.order_id
        AND COALESCE(lot.total_net_kg, 0) > 0
    ) THEN 'missing printed SFG lot'
    ELSE 'missing balance roll'
  END AS half_saved_reason
FROM operator_ends AS e
JOIN public.orders AS o ON o.id = e.order_id
LEFT JOIN missing_balance AS missing ON missing.order_id = e.order_id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.sfg_goods AS lot
    WHERE lot.sfg_batch_code = 'SFG-LOT-' || e.order_id
      AND COALESCE(lot.total_net_kg, 0) > 0
  )
  OR COALESCE(missing.missing_balance_barcodes, '') <> ''
ORDER BY e.ended_at, e.order_id;
