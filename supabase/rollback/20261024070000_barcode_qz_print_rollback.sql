-- Removes the QZ Tray settle path. Confirmed print rows stay in barcode_print_log.

DROP FUNCTION IF EXISTS public.settle_barcode_print_job(text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS private.settle_barcode_print_job(text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.caller_has_barcodes();
DROP TABLE IF EXISTS public.barcode_printer_allowlist;

UPDATE public.barcode_print_log
SET job_status = 'cancelled'
WHERE job_status = 'queued';

ALTER TABLE public.barcode_print_log DROP CONSTRAINT IF EXISTS barcode_print_log_status_check;
ALTER TABLE public.barcode_print_log
  ADD CONSTRAINT barcode_print_log_status_check
  CHECK (job_status IN ('printed', 'failed', 'cancelled', 'sent_to_browser'));

ALTER TABLE public.barcode_print_log DROP COLUMN IF EXISTS spooler_status;
