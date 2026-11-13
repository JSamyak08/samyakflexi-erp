-- Read-only preview. Do not update production.
-- Lists job orders that already have a non-cancelled Sale of Goods delivery
-- challan and whose order status is still a pre-dispatch status.
-- Suggested status uses the same auto-close band (default ±10%):
--   in band and no leftover stock -> Completed
--   dispatched kg below the band   -> Balance Dispatch Pending
--   above the band                  -> stays open (over dispatch)
-- Printed lots (SFG-LOT-) are not leftover. Cancelled challans are ignored.
-- A challan line that names an order is counted only for that order.
-- When the lines do not name an order, the whole challan counts if its
-- job name or order id matches. A finalised packing list is included the
-- same way. The larger of the challan kg and the packing-list kg is kept.

WITH sale AS (
  SELECT
    c.id,
    c.challan_no,
    c.payload,
    c.challan_nature
  FROM public.delivery_challans AS c
  WHERE lower(btrim(coalesce(
      nullif(c.payload->>'challanNature', ''),
      nullif(c.challan_nature, ''),
      'Sale of Goods'
    ))) = 'sale of goods'
    AND lower(btrim(coalesce(c.payload->>'status', ''))) NOT IN ('cancelled', 'canceled')
    AND lower(btrim(coalesce(c.payload->>'cancelled', ''))) NOT IN ('true', 't')
),
covered AS (
  SELECT DISTINCT s.id AS challan_id, s.challan_no, o.id AS order_id
  FROM sale AS s
  JOIN public.orders AS o
    ON lower(btrim(o.id)) = lower(btrim(coalesce(s.payload->>'orderId', '')))
    OR (
      btrim(split_part(coalesce(s.payload->>'jobName', ''), ' ||| ', 1)) <> ''
      AND lower(btrim(split_part(o.job_name, ' ||| ', 1)))
        = lower(btrim(split_part(s.payload->>'jobName', ' ||| ', 1)))
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items' ELSE '[]'::jsonb END) AS item(value)
      WHERE lower(btrim(coalesce(value->>'orderId', ''))) = lower(btrim(o.id))
         OR (
           btrim(coalesce(value->>'jobName', '')) <> ''
           AND lower(btrim(split_part(o.job_name, ' ||| ', 1))) = lower(btrim(value->>'jobName'))
         )
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_shipments AS sh
      WHERE (
        lower(btrim(sh.dispatch_id)) IN (
          SELECT lower(btrim(value))
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(s.payload->'linkedPackingListIds') = 'array'
              THEN s.payload->'linkedPackingListIds' ELSE '[]'::jsonb END
          ) AS linked(value)
        )
        OR lower(btrim(sh.id)) IN (
          SELECT lower(btrim(value))
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(s.payload->'linkedPackingListIds') = 'array'
              THEN s.payload->'linkedPackingListIds' ELSE '[]'::jsonb END
          ) AS linked(value)
        )
      )
      AND (
        lower(btrim(coalesce(sh.order_id, ''))) = lower(btrim(o.id))
        OR lower(btrim(split_part(coalesce(sh.job_name, ''), ' ||| ', 1)))
          = lower(btrim(split_part(o.job_name, ' ||| ', 1)))
      )
    )
),
line_kg AS (
  SELECT
    c.order_id,
    c.challan_id,
    COALESCE(sum(
      CASE
        WHEN lower(btrim(coalesce(item.value->>'unit', 'Kg'))) IN ('kg', 'kgs', 'kilogram', 'kilograms', '')
             AND btrim(coalesce(item.value->>'quantity', item.value->>'qtyKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN btrim(coalesce(item.value->>'quantity', item.value->>'qtyKg'))::numeric
        WHEN btrim(coalesce(item.value->>'netWeightKg', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN btrim(item.value->>'netWeightKg')::numeric
        ELSE 0
      END
    ), 0) AS kg
  FROM covered AS c
  JOIN sale AS s ON s.id = c.challan_id
  JOIN public.orders AS o ON o.id = c.order_id
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items' ELSE '[]'::jsonb END
  ) AS item(value) ON true
  WHERE (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items' ELSE '[]'::jsonb END) AS named(value)
      WHERE nullif(btrim(named.value->>'orderId'), '') IS NOT NULL
         OR nullif(btrim(named.value->>'jobName'), '') IS NOT NULL
    )
    AND (
      lower(btrim(coalesce(item.value->>'orderId', ''))) = lower(btrim(o.id))
      OR lower(btrim(coalesce(item.value->>'jobName', ''))) = lower(btrim(split_part(o.job_name, ' ||| ', 1)))
    )
  ) OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items' ELSE '[]'::jsonb END) AS named(value)
    WHERE nullif(btrim(named.value->>'orderId'), '') IS NOT NULL
       OR nullif(btrim(named.value->>'jobName'), '') IS NOT NULL
  )
  GROUP BY c.order_id, c.challan_id
),
challan_kg AS (
  SELECT order_id, sum(kg) AS kg, string_agg(DISTINCT challan_no, ', ' ORDER BY challan_no) AS challans
  FROM (
    SELECT l.order_id, l.kg, s.challan_no
    FROM line_kg AS l
    JOIN sale AS s ON s.id = l.challan_id
  ) AS named
  GROUP BY order_id
)
SELECT
  o.id AS order_id,
  split_part(o.job_name, ' ||| ', 1) AS job_name,
  o.status,
  o.order_qty_kg,
  round(COALESCE(k.kg, 0), 2) AS sale_challan_kg,
  k.challans,
  CASE
    WHEN o.close_mode = 'manual' THEN 'leave (manual close)'
    WHEN COALESCE(o.order_qty_kg, 0) <= 0 THEN 'review (no order quantity)'
    WHEN COALESCE(k.kg, 0) / o.order_qty_kg > 1.10 THEN 'leave open (over the +10% auto-close band)'
    WHEN COALESCE(k.kg, 0) / o.order_qty_kg >= 0.90 THEN 'Completed, if no leftover SFG/FG stock'
    ELSE 'Balance Dispatch Pending'
  END AS suggested_status
FROM public.orders AS o
JOIN challan_kg AS k ON k.order_id = o.id
WHERE COALESCE(o.status, '') NOT IN ('Completed', 'Balance Dispatch Pending', 'Cancelled')
ORDER BY o.id;
