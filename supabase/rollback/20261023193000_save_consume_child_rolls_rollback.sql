-- Manual rollback for 20261023193000_save_consume_child_rolls.sql.
-- This directory is not applied by the GitHub migration integration.
-- Run this in the Supabase SQL editor only if the child-roll save function
-- must be removed. It does not delete sfg_goods or inventory_rolls rows.

DROP FUNCTION IF EXISTS public.save_consume_child_rolls(jsonb);
