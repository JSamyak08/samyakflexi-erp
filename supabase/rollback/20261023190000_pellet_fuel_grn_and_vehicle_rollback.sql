-- Rollback for 20261023190000_pellet_fuel_grn_and_vehicle.sql
-- This directory is not applied by the GitHub integration. Run it by hand
-- from the SQL editor only if this migration must be undone.
--
-- DROP COLUMN vehicle_no deletes vehicle numbers already stored on
-- pellet_inwards. Copy that column out first if those values are needed.
-- pellet_fuel permission flags are left in place so a rollback does not
-- lock staff out of the screen.

DROP FUNCTION IF EXISTS public.save_pellet_inward_with_grn(jsonb);
DROP FUNCTION IF EXISTS public.allocate_pellet_grn_number(text);
DROP INDEX IF EXISTS public.grns_grn_number_uidx;
DROP TABLE IF EXISTS public.pellet_grn_counters;
ALTER TABLE public.pellet_inwards DROP COLUMN IF EXISTS vehicle_no;
