-- Read-only. Do not put this file in supabase/migrations.
-- Lists orders the screen was treating as Ready for Dispatch because
-- "Semi-Finished" contains the word "Finished".
-- Finished goods are FG roll types, FG- barcodes, or a Finished Goods
-- label that is not semi-finished. Printed rolls, laminated WIP, slitting
-- WIP, and balance rolls are not dispatch-ready.
-- This script only reads. It does not change any row.
-- Safe on production eamstsaqkbeiywfaanhi and on the test copy
-- awtjvrhpoyzjwrfumhip.

WITH stock AS (
  SELECT
    g.order_id,
    g.sfg_batch_code,
    g.sfg_type,
    g.status,
    g.storage_bay,
    COALESCE(g.total_net_kg, 0) AS total_net_kg,
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
    ) AS category
  FROM public.sfg_goods g
),
marked AS (
  SELECT
    stock.*,
    (
      roll_type IN ('SFG', 'SEMI_FINISHED_GOODS', 'SFG_PRINTED', 'SFG_LAMINATED')
      OR COALESCE(sfg_batch_code, '') ~* '^SFG-'
    ) AS explicit_sfg,
    (
      roll_type IN ('FG', 'FINISHED_GOODS', 'FG_DISPATCH')
      OR COALESCE(sfg_batch_code, '') ~* '^FG-'
    ) AS explicit_fg,
    ((category || ' ' || COALESCE(sfg_type, '')) ~* 'semi[- ]?finished') AS semi_text,
    (
      (category || ' ' || COALESCE(sfg_type, '')) ~* 'finished goods'
      AND (category || ' ' || COALESCE(sfg_type, '')) !~* 'semi[- ]?finished'
    ) AS finished_text,
    (
      roll_type = 'FG'
      OR COALESCE(sfg_type, '') ILIKE '%Finished%'
      OR category ILIKE '%Finished%'
      OR COALESCE(sfg_batch_code, '') ILIKE 'FG-%'
      OR status = 'Ready for Dispatch'
    ) AS old_rule_would_count
  FROM stock
),
judged AS (
  SELECT
    marked.*,
    CASE
      WHEN explicit_sfg THEN false
      WHEN semi_text AND NOT explicit_fg THEN false
      WHEN explicit_fg OR finished_text THEN true
      ELSE false
    END AS is_fg
  FROM marked
),
per_order AS (
  SELECT
    order_id,
    COALESCE(sum(available_kg) FILTER (WHERE is_fg), 0) AS fg_available_kg,
    COALESCE(sum(available_kg) FILTER (WHERE NOT is_fg), 0) AS sfg_available_kg,
    COALESCE(sum(available_kg) FILTER (WHERE old_rule_would_count AND NOT is_fg), 0) AS false_ready_kg,
    bool_or(old_rule_would_count AND available_kg > 0.05 AND NOT is_fg) AS old_rule_hit,
    string_agg(
      sfg_batch_code || ' ' || COALESCE(sfg_type, '') || ' ' || round(available_kg, 2) || 'kg ' || COALESCE(storage_bay, ''),
      '; ' ORDER BY sfg_batch_code
    ) FILTER (WHERE NOT is_fg AND available_kg > 0.05) AS sfg_lots
  FROM judged
  WHERE order_id IS NOT NULL AND btrim(order_id) <> ''
  GROUP BY order_id
)
SELECT
  p.order_id,
  o.status AS stored_order_status,
  o.printing_status,
  split_part(o.job_name, ' ||| ', 1) AS job_name,
  round(p.fg_available_kg, 2) AS fg_available_kg,
  round(p.sfg_available_kg, 2) AS sfg_available_kg,
  round(p.false_ready_kg, 2) AS kilograms_the_old_screen_called_ready,
  CASE
    WHEN o.id IS NULL THEN 'SFG row has no matching order'
    WHEN p.fg_available_kg > 0.05 THEN 'Real FG is also in stock'
    ELSE 'Screen showed Ready for Dispatch from SFG only. Stored order status was not changed by this check.'
  END AS finding,
  p.sfg_lots
FROM per_order p
LEFT JOIN public.orders o ON o.id = p.order_id
WHERE p.old_rule_hit
  AND p.fg_available_kg <= 0.05
ORDER BY p.order_id;

-- SFG rows whose own status says they were dispatched, even though they are not FG.
-- Review these. The correction script does not put the kilograms back.
SELECT
  g.sfg_batch_code,
  g.order_id,
  g.sfg_type,
  g.status,
  g.storage_bay,
  g.total_net_kg,
  g.available_kg,
  'WIP stock carries a dispatch status. Do not auto-restore the kilograms.' AS finding
FROM public.sfg_goods g
WHERE g.status IN ('Ready for Dispatch', 'Partially Dispatched', 'Dispatched')
  AND (
    COALESCE(g.sfg_batch_code, '') ~* '^SFG-'
    OR COALESCE(g.sfg_type, '') ~* 'semi[- ]?finished|printed|laminat|slit|balance'
    OR (
      left(btrim(COALESCE(g.notes, '')), 1) = '{'
      AND COALESCE(g.notes::jsonb ->> 'category', '') ~* 'semi[- ]?finished'
    )
  )
ORDER BY g.order_id, g.sfg_batch_code;
