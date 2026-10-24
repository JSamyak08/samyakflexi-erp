-- Print log for barcode stickers.
-- The browser print dialog is not a confirmed print. window.print() and
-- afterprint also run when the operator cancels. A barcodes user may record
-- that the sticker was sent to the dialog as job_status = 'sent_to_browser'.
-- That row does not count. printer = 'browser' can never be stored as printed.
-- Printed is only job_status = 'printed', written by the service role when a
-- print agent reports a finished printer job.
-- Barcodes with no printed row stay Not printed. There is no backfill.

CREATE TABLE public.barcode_print_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  source_module text,
  job_id text NOT NULL,
  job_status text NOT NULL,
  printer text NOT NULL,
  printed_at timestamptz NOT NULL,
  printed_by text NOT NULL,
  auth_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barcode_print_log_job_id_key UNIQUE (job_id),
  CONSTRAINT barcode_print_log_status_check CHECK (job_status IN ('printed', 'failed', 'cancelled', 'sent_to_browser')),
  CONSTRAINT barcode_print_log_barcode_check CHECK (btrim(barcode) <> ''),
  CONSTRAINT barcode_print_log_job_id_check CHECK (btrim(job_id) <> ''),
  CONSTRAINT barcode_print_log_printer_check CHECK (btrim(printer) <> '')
);

CREATE INDEX barcode_print_log_confirmed_idx
  ON public.barcode_print_log (lower(btrim(barcode)), printed_at DESC)
  WHERE job_status = 'printed';

ALTER TABLE public.barcode_print_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.barcode_print_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.barcode_print_log TO authenticated;

DROP POLICY IF EXISTS barcode_print_log_select ON public.barcode_print_log;
CREATE POLICY barcode_print_log_select
  ON public.barcode_print_log
  FOR SELECT
  TO authenticated
  USING (private.can_any(ARRAY['barcodes']::text[]));

CREATE OR REPLACE FUNCTION private.record_barcode_print(
  p_barcode text,
  p_job_id text,
  p_job_status text,
  p_printer text,
  p_printed_at timestamptz,
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
  actor_id uuid := NULL;
  clean_barcode text := btrim(coalesce(p_barcode, ''));
  clean_job_id text := btrim(coalesce(p_job_id, ''));
  raw_status text := lower(btrim(coalesce(p_job_status, '')));
  clean_status text;
  clean_printer text := btrim(coalesce(p_printer, ''));
  clean_printed_by text := btrim(coalesce(p_printed_by, ''));
  existing public.barcode_print_log%ROWTYPE;
BEGIN
  BEGIN
    actor_role := coalesce(auth.role(), '');
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      actor_role := '';
  END;

  IF clean_barcode = '' OR clean_job_id = '' OR clean_printer = '' OR clean_printed_by = '' OR p_printed_at IS NULL THEN
    RAISE EXCEPTION 'barcode, job id, printer, printed at, and printed by are required'
      USING ERRCODE = '22023';
  END IF;

  IF raw_status IN ('printed', 'success') THEN
    clean_status := 'printed';
  ELSIF raw_status IN ('failed', 'error') THEN
    clean_status := 'failed';
  ELSIF raw_status IN ('cancelled', 'canceled') THEN
    clean_status := 'cancelled';
  ELSIF raw_status IN ('sent_to_browser', 'sent-to-browser') THEN
    clean_status := 'sent_to_browser';
  ELSE
    RAISE EXCEPTION 'job status % is not a printer result', coalesce(p_job_status, '')
      USING ERRCODE = '22023';
  END IF;

  IF clean_status = 'printed' AND lower(clean_printer) = 'browser' THEN
    RAISE EXCEPTION 'a browser print cannot be recorded as printed'
      USING ERRCODE = '22023';
  END IF;

  IF actor_role = 'service_role' THEN
    NULL;
  ELSIF actor_role = 'authenticated' AND private.can_any(ARRAY['barcodes']::text[]) THEN
    IF clean_status IS DISTINCT FROM 'sent_to_browser' THEN
      RAISE EXCEPTION 'only a print agent can record a confirmed printer result'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'barcode prints can only be recorded by a user with the barcodes permission'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    actor_id := auth.uid();
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      actor_id := NULL;
  END;

  SELECT * INTO existing
  FROM public.barcode_print_log AS log
  WHERE log.job_id = clean_job_id;

  IF FOUND THEN
    IF lower(btrim(existing.barcode)) IS DISTINCT FROM lower(clean_barcode) THEN
      RAISE EXCEPTION 'job id % is already recorded for a different barcode', clean_job_id
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'recorded', true,
      'duplicate', true,
      'counts_as_printed', existing.job_status = 'printed',
      'id', existing.id,
      'job_id', existing.job_id,
      'job_status', existing.job_status,
      'printer', existing.printer,
      'printed_at', existing.printed_at,
      'printed_by', existing.printed_by
    );
  END IF;

  INSERT INTO public.barcode_print_log (
    barcode, source_module, job_id, job_status, printer, printed_at, printed_by, auth_user_id
  ) VALUES (
    clean_barcode,
    NULLIF(btrim(coalesce(p_source_module, '')), ''),
    clean_job_id,
    clean_status,
    clean_printer,
    p_printed_at,
    clean_printed_by,
    actor_id
  )
  RETURNING * INTO existing;

  RETURN jsonb_build_object(
    'recorded', true,
    'duplicate', false,
    'counts_as_printed', existing.job_status = 'printed',
    'id', existing.id,
    'job_id', existing.job_id,
    'job_status', existing.job_status,
    'printer', existing.printer,
    'printed_at', existing.printed_at,
    'printed_by', existing.printed_by
  );
END;
$$;

REVOKE ALL ON FUNCTION private.record_barcode_print(text, text, text, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_barcode_print(text, text, text, text, timestamptz, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_barcode_print(
  p_barcode text,
  p_job_id text,
  p_job_status text,
  p_printer text,
  p_printed_at timestamptz,
  p_printed_by text,
  p_source_module text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.record_barcode_print(
    p_barcode,
    p_job_id,
    p_job_status,
    p_printer,
    p_printed_at,
    p_printed_by,
    p_source_module
  );
$$;

REVOKE ALL ON FUNCTION public.record_barcode_print(text, text, text, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_barcode_print(text, text, text, text, timestamptz, text, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_barcode_print(text, text, text, text, timestamptz, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.record_barcode_print(text, text, text, text, timestamptz, text, text) TO service_role';
  END IF;
END $$;

DROP VIEW IF EXISTS public.barcode_print_status;
CREATE VIEW public.barcode_print_status
WITH (security_invoker = true) AS
SELECT DISTINCT ON (lower(btrim(log.barcode)))
  log.barcode,
  log.source_module,
  log.job_id,
  log.job_status,
  log.printer,
  log.printed_at,
  log.printed_by
FROM public.barcode_print_log AS log
WHERE log.job_status = 'printed'
ORDER BY lower(btrim(log.barcode)), log.printed_at DESC;

REVOKE ALL ON TABLE public.barcode_print_status FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.barcode_print_status TO authenticated;

DROP VIEW IF EXISTS public.barcode_print_attempts;
CREATE VIEW public.barcode_print_attempts
WITH (security_invoker = true) AS
SELECT DISTINCT ON (lower(btrim(log.barcode)))
  log.barcode,
  log.source_module,
  log.job_id,
  log.job_status,
  log.printer,
  log.printed_at,
  log.printed_by
FROM public.barcode_print_log AS log
ORDER BY lower(btrim(log.barcode)), log.printed_at DESC;

REVOKE ALL ON TABLE public.barcode_print_attempts FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.barcode_print_attempts TO authenticated;
