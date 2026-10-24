-- Read-only audit. No UPDATE, no DELETE, no INSERT.
-- Do not treat this as a backfill.
-- There is no query for an SFG/FG 110% production cap. That rule was removed.

-- Placeholder or invalid text on production records.
SELECT id, job_name, actual_ink_gsm, actual_adhesive_gsm, wastage_percentage
FROM public.production_records
WHERE actual_ink_gsm IS NULL
   OR actual_ink_gsm = 0
   OR actual_ink_gsm < 0
   OR actual_adhesive_gsm < 0
   OR wastage_percentage < 0
   OR wastage_percentage > 100
   OR COALESCE(process_logs::text, '') ~* '\[object Object\]|NaN|"dummy"|"placeholder"|"n/a"';

-- Orders that would auto-close: exact order id or exact clean job name,
-- challan kg within ±10% of order qty, and no leftover SFG/FG above 0.05 kg.
-- Expected on the current production snapshot: 0, because challans have no order id
-- and the five named challan jobs do not exactly match an order name.
WITH challan_kg AS (
  SELECT
    dc.id,
    NULLIF(dc.payload->>'orderId', '') AS order_id,
    NULLIF(split_part(COALESCE(dc.payload->>'jobName', ''), ' ||| ', 1), '') AS job_name,
    LOWER(COALESCE(dc.payload->>'status', '')) AS status,
    COALESCE((
      SELECT SUM(
        CASE
          WHEN LOWER(COALESCE(item->>'unit', 'kg')) IN ('kg', 'kgs', 'kilogram', 'kilograms', '')
            THEN COALESCE(NULLIF(item->>'quantity', '')::numeric, 0)
          ELSE COALESCE(NULLIF(item->>'netWeightKg', '')::numeric, 0)
        END
      )
      FROM jsonb_array_elements(COALESCE(dc.payload->'items', '[]'::jsonb)) item
    ), 0) AS kg
  FROM public.delivery_challans dc
),
open_stock AS (
  SELECT order_id, SUM(COALESCE(available_kg, 0)) AS available_kg
  FROM public.sfg_goods
  GROUP BY order_id
)
SELECT o.id, o.status, o.order_qty_kg, c.kg
FROM public.orders o
JOIN challan_kg c
  ON c.status NOT IN ('cancelled', 'canceled')
 AND (
   LOWER(c.order_id) = LOWER(o.id)
   OR LOWER(c.job_name) = LOWER(split_part(o.job_name, ' ||| ', 1))
 )
LEFT JOIN open_stock s ON s.order_id = o.id
WHERE o.order_qty_kg > 0
  AND c.kg BETWEEN o.order_qty_kg * 0.9 AND o.order_qty_kg * 1.1
  AND COALESCE(s.available_kg, 0) <= 0.05;
