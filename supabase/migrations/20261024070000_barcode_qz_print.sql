-- QZ Tray jobs for the TSC sticker printer.
-- The browser cannot write job_status = 'printed'. It asks the service role,
-- through the barcode-print-job Edge Function, to open a queued job and then
-- settle it from a Windows spooler status. printer = 'browser' still cannot
-- be stored as printed. A queued job does not count as Printed.

ALTER TABLE public.barcode_print_log DROP CONSTRAINT IF EXISTS barcode_print_log_status_check;
ALTER TABLE public.barcode_print_log
  ADD CONSTRAINT barcode_print_log_status_check
  CHECK (job_status IN ('printed', 'failed', 'cancelled', 'sent_to_browser', 'queued'));

ALTER TABLE public.barcode_print_log ADD COLUMN IF NOT EXISTS spooler_status text;

CREATE TABLE IF NOT EXISTS public.barcode_printer_allowlist (
  printer_name text PRIMARY KEY,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barcode_printer_allowlist_name_check
    CHECK (btrim(printer_name) <> '' AND lower(btrim(printer_name)) <> 'browser')
);

ALTER TABLE public.barcode_printer_allowlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.barcode_printer_allowlist FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.barcode_printer_allowlist TO authenticated;

DROP POLICY IF EXISTS barcode_printer_allowlist_rw ON public.barcode_printer_allowlist;
CREATE POLICY barcode_printer_allowlist_rw
  ON public.barcode_printer_allowlist
  FOR ALL
  TO authenticated
  USING (private.can_any(ARRAY['barcodes']::text[]))
  WITH CHECK (private.can_any(ARRAY['barcodes']::text[]));

CREATE OR REPLACE FUNCTION public.caller_has_barcodes()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.can_any(ARRAY['barcodes']::text[]);
$$;

REVOKE ALL ON FUNCTION public.caller_has_barcodes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_has_barcodes() TO authenticated;

CREATE OR REPLACE FUNCTION private.settle_barcode_print_job(
  p_action text,
  p_job_id text,
  p_printer text,
  p_barcode text,
  p_spooler_status text,
  p_printed_by text,
  p_source_module text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := '';
  clean_action text := lower(btrim(coalesce(p_action, '')));
  clean_job_id text := btrim(coalesce(p_job_id, ''));
  clean_printer text := btrim(coalesce(p_printer, ''));
  clean_barcode text := btrim(coalesce(p_barcode, ''));
  clean_by text := btrim(coalesce(p_printed_by, ''));
  raw_spooler text := trim(both '_' from upper(regexp_replace(btrim(coalesce(p_spooler_status, '')), '[^[:alnum:]]+', '_', 'g')));
  next_status text;
  existing public.barcode_print_log%ROWTYPE;
BEGIN
  BEGIN
    actor_role := coalesce(auth.role(), '');
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      actor_role := '';
  END;

  IF actor_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'print jobs are settled by the print function'
      USING ERRCODE = '42501';
  END IF;

  IF clean_job_id = '' OR clean_printer = '' THEN
    RAISE EXCEPTION 'job id and printer are required'
      USING ERRCODE = '22023';
  END IF;

  IF lower(clean_printer) = 'browser' THEN
    RAISE EXCEPTION 'a browser print cannot be recorded as printed'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barcode_printer_allowlist AS allowed
    WHERE lower(btrim(allowed.printer_name)) = lower(clean_printer)
  ) THEN
    RAISE EXCEPTION 'printer % is not on the barcode printer allow list', clean_printer
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM public.barcode_print_log AS log
  WHERE log.job_id = clean_job_id;

  IF clean_action = 'open' THEN
    IF clean_barcode = '' OR clean_by = '' THEN
      RAISE EXCEPTION 'barcode and printed by are required'
        USING ERRCODE = '22023';
    END IF;
    IF FOUND THEN
      IF lower(btrim(existing.barcode)) IS DISTINCT FROM lower(clean_barcode) THEN
        RAISE EXCEPTION 'job id % is already recorded for a different barcode', clean_job_id
          USING ERRCODE = '23505';
      END IF;
      RETURN jsonb_build_object(
        'recorded', true,
        'duplicate', true,
        'counts_as_printed', existing.job_status = 'printed',
        'job_id', existing.job_id,
        'job_status', existing.job_status,
        'printer', existing.printer,
        'barcode', existing.barcode
      );
    END IF;

    INSERT INTO public.barcode_print_log (
      barcode, source_module, job_id, job_status, printer, printed_at, printed_by, spooler_status
    ) VALUES (
      clean_barcode,
      NULLIF(btrim(coalesce(p_source_module, '')), ''),
      clean_job_id,
      'queued',
      clean_printer,
      now(),
      clean_by,
      NULL
    )
    RETURNING * INTO existing;

    RETURN jsonb_build_object(
      'recorded', true,
      'duplicate', false,
      'counts_as_printed', false,
      'job_id', existing.job_id,
      'job_status', existing.job_status,
      'printer', existing.printer,
      'barcode', existing.barcode
    );
  END IF;

  IF clean_action IS DISTINCT FROM 'settle' THEN
    RAISE EXCEPTION 'action must be open or settle'
      USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job % has not been opened', clean_job_id
      USING ERRCODE = '22023';
  END IF;

  IF lower(btrim(existing.printer)) IS DISTINCT FROM lower(clean_printer) THEN
    RAISE EXCEPTION 'printer does not match the opened job'
      USING ERRCODE = '22023';
  END IF;

  IF existing.job_status IS DISTINCT FROM 'queued' THEN
    RETURN jsonb_build_object(
      'recorded', true,
      'duplicate', true,
      'counts_as_printed', existing.job_status = 'printed',
      'job_id', existing.job_id,
      'job_status', existing.job_status,
      'printer', existing.printer,
      'barcode', existing.barcode
    );
  END IF;

  -- Same words and priority as src/utils/qzJob.js. Error beats a leftover printed flag.
  IF raw_spooler ~ '(^|_)(ERROR|PAPEROUT|PAPER_OUT|OFFLINE|USER_INTERVENTION|FAILED)(_|$)' THEN
    next_status := 'failed';
  ELSIF raw_spooler ~ '(^|_)(DELETED|DELETING|CANCELED|CANCELLED)(_|$)' THEN
    next_status := 'cancelled';
  ELSIF raw_spooler ~ '(^|_)(PRINTED|COMPLETE|COMPLETED|SUCCESS)(_|$)' THEN
    next_status := 'printed';
  ELSE
    RAISE EXCEPTION 'spooler status % is not a finished job', coalesce(p_spooler_status, '')
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.barcode_print_log AS log
  SET job_status = next_status,
      spooler_status = raw_spooler,
      printed_at = now()
  WHERE log.job_id = clean_job_id
  RETURNING * INTO existing;

  RETURN jsonb_build_object(
    'recorded', true,
    'duplicate', false,
    'counts_as_printed', existing.job_status = 'printed',
    'job_id', existing.job_id,
    'job_status', existing.job_status,
    'printer', existing.printer,
    'barcode', existing.barcode,
    'spooler_status', existing.spooler_status
  );
END;
$$;

REVOKE ALL ON FUNCTION private.settle_barcode_print_job(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_barcode_print_job(
  p_action text,
  p_job_id text,
  p_printer text,
  p_barcode text,
  p_spooler_status text,
  p_printed_by text,
  p_source_module text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.settle_barcode_print_job(
    p_action,
    p_job_id,
    p_printer,
    p_barcode,
    p_spooler_status,
    p_printed_by,
    p_source_module
  );
$$;

REVOKE ALL ON FUNCTION public.settle_barcode_print_job(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_barcode_print_job(text, text, text, text, text, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.settle_barcode_print_job(text, text, text, text, text, text, text) TO service_role';
  END IF;
END $$;
