-- Dry run. NOT a migration. Do not put this file in supabase/migrations.
--
-- Rehearse on the test project awtjvrhpoyzjwrfumhip.
-- Do not run this against production eamstsaqkbeiywfaanhi until the
-- screen fix is deployed and script_report has been reviewed.
--
-- The order list was computing Ready for Dispatch in the browser.
-- orders.status is not that badge. This script only rewrites a stored
-- status when the row itself says Ready for Dispatch and the order has
-- no finished-goods balance. It does not invent kilograms, and it does
-- not reverse a Partially Dispatched or Dispatched SFG balance.
--
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- on the test copy, and only after script_report looks right.
-- Safe to run again: a row that is already In Production or In Stock (WIP)
-- is not updated a second time.

BEGIN;

DROP TABLE IF EXISTS script_report;
CREATE TEMP TABLE script_report (
  ord integer NOT NULL,
  section text NOT NULL,
  detail text NOT NULL
);

DROP TABLE IF EXISTS stock_class;
CREATE TEMP TABLE stock_class AS
SELECT
  g.id,
  g.order_id,
  g.sfg_batch_code,
  g.sfg_type,
  g.status,
  g.storage_bay,
  COALESCE(g.total_net_kg, 0) AS total_net_kg,
  COALESCE(g.consumed_kg, 0) AS consumed_kg,
  COALESCE(
    g.available_kg,
    GREATEST(0, COALESCE(g.total_net_kg, 0) - COALESCE(g.consumed_kg, 0))
  ) AS available_kg,
  upper(btrim(COALESCE(
    CASE WHEN left(btrim(COALESCE(g.notes, '')), 1) = '{' THEN g.notes::jsonb ->> 'rollType' ELSE '' END,
    ''
  ))) AS roll_type,
  COALESCE(
    CASE WHEN left(btrim(COALESCE(g.notes, '')), 1) = '{' THEN g.notes::jsonb ->> 'category' ELSE '' END,
    ''
  ) AS category,
  g.notes
FROM public.sfg_goods g;

ALTER TABLE stock_class ADD COLUMN is_fg boolean;
UPDATE stock_class
SET is_fg = CASE
  WHEN roll_type IN ('SFG', 'SEMI_FINISHED_GOODS', 'SFG_PRINTED', 'SFG_LAMINATED')
    OR COALESCE(sfg_batch_code, '') ~* '^SFG-' THEN false
  WHEN (category || ' ' || COALESCE(sfg_type, '')) ~* 'semi[- ]?finished'
    AND NOT (
      roll_type IN ('FG', 'FINISHED_GOODS', 'FG_DISPATCH')
      OR COALESCE(sfg_batch_code, '') ~* '^FG-'
    ) THEN false
  WHEN roll_type IN ('FG', 'FINISHED_GOODS', 'FG_DISPATCH')
    OR COALESCE(sfg_batch_code, '') ~* '^FG-'
    OR (
      (category || ' ' || COALESCE(sfg_type, '')) ~* 'finished goods'
      AND (category || ' ' || COALESCE(sfg_type, '')) !~* 'semi[- ]?finished'
    ) THEN true
  ELSE false
END;

DROP TABLE IF EXISTS order_fg;
CREATE TEMP TABLE order_fg AS
SELECT
  order_id,
  COALESCE(sum(available_kg) FILTER (WHERE is_fg), 0) AS fg_available_kg
FROM stock_class
WHERE order_id IS NOT NULL AND btrim(order_id) <> ''
GROUP BY order_id;

INSERT INTO script_report (ord, section, detail)
SELECT 10, 'before-order',
  o.id || ' | stored=' || COALESCE(o.status, '')
  || ' | printing=' || COALESCE(o.printing_status, '')
  || ' | fg_kg=' || round(COALESCE(f.fg_available_kg, 0), 2)
FROM public.orders o
LEFT JOIN order_fg f ON f.order_id = o.id
WHERE o.status = 'Ready for Dispatch'
   OR o.status ILIKE '%ready for dispatch%';

INSERT INTO script_report (ord, section, detail)
SELECT 11, 'before-order', 'no order row is stored as Ready for Dispatch'
WHERE NOT EXISTS (
  SELECT 1 FROM public.orders WHERE status ILIKE '%ready for dispatch%'
);

-- Orders stored as Ready for Dispatch with no FG balance go back to the
-- production status record_print_run already uses. Completed and cancelled
-- orders are left alone.
DROP TABLE IF EXISTS order_fix;
CREATE TEMP TABLE order_fix AS
SELECT
  o.id,
  o.status AS old_status,
  CASE
    WHEN lower(btrim(COALESCE(o.printing_status, ''))) IN ('completed', 'in production') THEN 'In Production'
    ELSE 'In Progress'
  END AS new_status
FROM public.orders o
LEFT JOIN order_fg f ON f.order_id = o.id
WHERE o.status ILIKE '%ready for dispatch%'
  AND COALESCE(o.close_mode, '') IS DISTINCT FROM 'manual'
  AND lower(btrim(COALESCE(o.status, ''))) NOT IN ('completed', 'cancelled', 'canceled', 'on hold')
  AND COALESCE(f.fg_available_kg, 0) <= 0.05;

INSERT INTO script_report (ord, section, detail)
SELECT 20, 'order-status',
  id || ' | ' || old_status || ' -> ' || new_status || ' (no finished-goods balance)'
FROM order_fix
UNION ALL
SELECT 21, 'order-status', 'no stored order status needs a correction'
WHERE NOT EXISTS (SELECT 1 FROM order_fix);

UPDATE public.orders o
SET status = fix.new_status
FROM order_fix fix
WHERE o.id = fix.id
  AND o.status IS DISTINCT FROM fix.new_status;

-- An SFG row labelled Ready for Dispatch, with the full net still available,
-- is a status label only. Put the label back to WIP. Do not touch weight.
DROP TABLE IF EXISTS sfg_status_fix;
CREATE TEMP TABLE sfg_status_fix AS
SELECT id, sfg_batch_code, order_id, status AS old_status
FROM stock_class
WHERE NOT is_fg
  AND status = 'Ready for Dispatch'
  AND consumed_kg <= 0.05
  AND abs(available_kg - total_net_kg) <= 0.05;

INSERT INTO script_report (ord, section, detail)
SELECT 30, 'sfg-status',
  sfg_batch_code || ' | ' || COALESCE(order_id, '') || ' | Ready for Dispatch -> In Stock (WIP)'
FROM sfg_status_fix
UNION ALL
SELECT 31, 'sfg-status', 'no untouched SFG row is labelled Ready for Dispatch'
WHERE NOT EXISTS (SELECT 1 FROM sfg_status_fix);

UPDATE public.sfg_goods g
SET
  status = 'In Stock (WIP)',
  notes = CASE
    WHEN left(btrim(COALESCE(g.notes, '')), 1) = '{'
      THEN jsonb_set(g.notes::jsonb, '{status}', to_jsonb('In Stock (WIP)'::text), true)::text
    ELSE g.notes
  END,
  updated_at = now()
FROM sfg_status_fix fix
WHERE g.id = fix.id
  AND g.status = 'Ready for Dispatch';

-- Dispatch weight already taken from WIP is listed and not reversed.
INSERT INTO script_report (ord, section, detail)
SELECT 40, 'sfg-dispatch-review',
  sfg_batch_code || ' | ' || COALESCE(order_id, '')
  || ' | status=' || COALESCE(status, '')
  || ' | available=' || round(available_kg, 2)
  || ' | net=' || round(total_net_kg, 2)
  || ' | left for a person to review; kilograms were not restored'
FROM stock_class
WHERE NOT is_fg
  AND status IN ('Partially Dispatched', 'Dispatched')
UNION ALL
SELECT 41, 'sfg-dispatch-review', 'no SFG row is marked dispatched'
WHERE NOT EXISTS (
  SELECT 1 FROM stock_class
  WHERE NOT is_fg AND status IN ('Partially Dispatched', 'Dispatched')
);

INSERT INTO script_report (ord, section, detail)
SELECT 50, 'after-order',
  o.id || ' | stored=' || o.status
FROM public.orders o
JOIN order_fix fix ON fix.id = o.id;

SELECT ord, section, detail
FROM script_report
ORDER BY ord, detail;

-- Dry run. Replace ROLLBACK with COMMIT only after reviewing script_report
-- on the test copy. Do not commit this on production.
ROLLBACK;
