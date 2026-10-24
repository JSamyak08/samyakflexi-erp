-- Removes the confirmed barcode print log. Registry rows are unchanged.

DROP VIEW IF EXISTS public.barcode_print_status;
DROP FUNCTION IF EXISTS public.record_barcode_print(text, text, text, text, timestamptz, text, text);
DROP FUNCTION IF EXISTS private.record_barcode_print(text, text, text, text, timestamptz, text, text);
DROP TABLE IF EXISTS public.barcode_print_log;
