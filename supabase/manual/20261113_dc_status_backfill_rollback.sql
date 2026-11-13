-- Guarded backfill. One transaction. Copies the orders it would change into
-- public.order_dispatch_status_backup, applies the status rule, then
-- ROLLBACK. Nothing is kept, including the backup table.
-- Do not remove the ROLLBACK. Do not run this against production until the
-- preview in 20261113_dc_status_preview.sql has been read.
--
-- Requires migration 20261113220000_delivery_challan_once.sql so
-- private.refresh_order_dispatch_status exists. The function uses the same
-- dispatched-kg rule as order close: finalised packing lists and delivery
-- challans, cancelled documents ignored, no double counting.
-- Existing challan numbers are not changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_dispatch_status_backup AS
SELECT id, status, close_mode, closed_by, closed_at, close_reason, over_dispatch_warning, now() AS backed_up_at
FROM public.orders
WHERE false;

TRUNCATE public.order_dispatch_status_backup;

INSERT INTO public.order_dispatch_status_backup (
  id, status, close_mode, closed_by, closed_at, close_reason, over_dispatch_warning, backed_up_at
)
SELECT id, status, close_mode, closed_by, closed_at, close_reason, over_dispatch_warning, now()
FROM public.orders;

DO $$
DECLARE
  order_id text;
BEGIN
  FOR order_id IN SELECT id FROM public.orders LOOP
    PERFORM private.refresh_order_dispatch_status(order_id);
  END LOOP;
END $$;

-- What the transaction would change. Inspect this result, then the ROLLBACK
-- throws the changes and the backup away.
SELECT
  before.id,
  split_part(o.job_name, ' ||| ', 1) AS job_name,
  before.status AS status_before,
  o.status AS status_after,
  before.close_mode AS close_mode_before,
  o.close_mode AS close_mode_after,
  o.over_dispatch_warning
FROM public.order_dispatch_status_backup AS before
JOIN public.orders AS o ON o.id = before.id
WHERE before.status IS DISTINCT FROM o.status
   OR before.close_mode IS DISTINCT FROM o.close_mode
   OR before.over_dispatch_warning IS DISTINCT FROM o.over_dispatch_warning
ORDER BY before.id;

ROLLBACK;
