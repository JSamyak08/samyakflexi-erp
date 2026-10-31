-- Close columns already exist in production. Create them where an older database
-- has the printing columns but not the close columns yet.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS close_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS close_mode text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS over_dispatch_warning text;

-- Print-run writes must not be read as a manual order close or reopen.
--
-- guard_manual_order_close used `close_mode = 'manual'`. When close_mode is
-- NULL that comparison is NULL, and `NULL OR false` stays NULL. The early
-- return then becomes NULL (not true) when either:
--   * the new close mode is a real non-manual value ('auto' or ''), because
--     NULL is distinct from false, or
--   * status moves off Completed while close_mode is still NULL, because
--     `NOT (NULL AND ...)` is NULL.
-- A non-admin update then raises "Only an Admin can manually close or reopen
-- an order" even though nobody changed a manual close.
--
-- Printing start, end, and substrate-roll autosave upsert the whole order
-- row, so those operator writes hit this guard. record_print_run updates
-- press progress only and leaves close columns to the guard.

CREATE OR REPLACE FUNCTION public.order_is_manually_closed(p_close_mode text, p_job_details jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(btrim(p_close_mode), '') = 'manual'
    OR COALESCE(btrim(p_job_details->>'closeMode'), '') = 'manual';
$$;

REVOKE ALL ON FUNCTION public.order_is_manually_closed(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_is_manually_closed(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_manual_order_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed boolean;
  new_manual boolean;
  old_manual boolean;
  old_completed boolean;
  new_completed boolean;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  new_manual := public.order_is_manually_closed(NEW.close_mode, NEW.job_details);
  old_manual := TG_OP = 'UPDATE' AND public.order_is_manually_closed(OLD.close_mode, OLD.job_details);
  old_completed := TG_OP = 'UPDATE' AND lower(btrim(COALESCE(OLD.status, ''))) = 'completed';
  new_completed := lower(btrim(COALESCE(NEW.status, ''))) = 'completed';

  IF new_manual = old_manual AND NOT (old_manual AND old_completed AND NOT new_completed) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE auth.uid() IS NOT NULL
      AND u.id NOT LIKE 'USR-SETTING-%'
      AND (
        u.auth_user_id = auth.uid()
        OR (u.auth_user_id IS NULL AND u.id = (auth.uid())::text)
      )
      AND u.role = 'Admin'
      AND u.active IS NOT FALSE
      AND (u.status IS NULL OR u.status = 'Active')
  ) INTO allowed;

  IF allowed IS TRUE THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an Admin can manually close or reopen an order'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_manual_order_close() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_manual_order_close() TO authenticated;

DROP TRIGGER IF EXISTS guard_manual_order_close ON public.orders;
CREATE TRIGGER guard_manual_order_close
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_manual_order_close();

CREATE OR REPLACE FUNCTION public.record_print_run(
  p_order_id text,
  p_action text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  row public.orders;
  details jsonb;
  envelope jsonb;
  name_base text;
  raw_env text;
  delim_at integer;
  manual boolean;
  next_status text;
  next_printing_status text;
  start_time timestamptz;
  end_time timestamptz;
  duration_minutes numeric;
  meters numeric;
  output_kg numeric;
  next_ink_gsm numeric;
  close_key text;
  printing_done boolean;
  close_keys text[] := ARRAY[
    'closeMode', 'closedBy', 'closedAt', 'closeReason',
    'overDispatchWarning', 'reopenedBy', 'reopenedAt', 'reopenReason'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a print run'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('start', 'end', 'progress') THEN
    RAISE EXCEPTION 'Unknown print run action'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  manual := public.order_is_manually_closed(row.close_mode, row.job_details);
  details := COALESCE(row.job_details, '{}'::jsonb);
  p_patch := COALESCE(p_patch, '{}'::jsonb);

  IF p_action = 'start' THEN
    next_printing_status := 'In Production';
    BEGIN
      start_time := COALESCE(NULLIF(p_patch->>'printingStartTime', '')::timestamptz, now());
    EXCEPTION WHEN others THEN
      start_time := COALESCE(row.printing_start_time, now());
    END;
    end_time := NULL;
    duration_minutes := NULL;
  ELSIF p_action = 'end' THEN
    next_printing_status := 'Completed';
    start_time := row.printing_start_time;
    BEGIN
      IF NULLIF(p_patch->>'printingStartTime', '') IS NOT NULL THEN
        start_time := NULLIF(p_patch->>'printingStartTime', '')::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      start_time := row.printing_start_time;
    END;
    BEGIN
      end_time := COALESCE(NULLIF(p_patch->>'printingEndTime', '')::timestamptz, now());
    EXCEPTION WHEN others THEN
      end_time := now();
    END;
    BEGIN
      duration_minutes := NULLIF(p_patch->>'printingDurationMinutes', '')::numeric;
    EXCEPTION WHEN others THEN
      duration_minutes := row.printing_duration_minutes;
    END;
  ELSE
    next_printing_status := COALESCE(NULLIF(details->>'printingStatus', ''), row.printing_status, 'In Production');
    start_time := row.printing_start_time;
    end_time := row.printing_end_time;
    duration_minutes := row.printing_duration_minutes;
  END IF;

  BEGIN
    meters := CASE
      WHEN p_patch ? 'actualMetersPrinted' THEN NULLIF(p_patch->>'actualMetersPrinted', '')::numeric
      ELSE row.actual_meters_printed
    END;
  EXCEPTION WHEN others THEN
    meters := row.actual_meters_printed;
  END;
  BEGIN
    output_kg := CASE
      WHEN p_patch ? 'printedOutputKg' THEN NULLIF(p_patch->>'printedOutputKg', '')::numeric
      ELSE row.printed_output_kg
    END;
  EXCEPTION WHEN others THEN
    output_kg := row.printed_output_kg;
  END;
  BEGIN
    next_ink_gsm := CASE
      WHEN p_patch ? 'inkGsmInSpeed' THEN NULLIF(p_patch->>'inkGsmInSpeed', '')::numeric
      ELSE row.ink_gsm_in_speed
    END;
  EXCEPTION WHEN others THEN
    next_ink_gsm := row.ink_gsm_in_speed;
  END;

  printing_done := CASE
    WHEN p_action = 'end' THEN true
    WHEN p_action = 'start' THEN false
    ELSE COALESCE(row.job_details->>'isPrintingCompleted', '') = 'true'
  END;

  details := jsonb_set(details, '{printingStatus}', to_jsonb(next_printing_status), true);
  details := jsonb_set(details, '{isPrintingCompleted}', to_jsonb(printing_done), true);
  IF start_time IS NOT NULL THEN
    details := jsonb_set(details, '{printingStartTime}', to_jsonb(start_time), true);
  ELSIF p_action = 'start' THEN
    details := details - 'printingStartTime';
  END IF;
  IF p_action = 'start' THEN
    details := details - 'printingEndTime';
  ELSIF end_time IS NOT NULL THEN
    details := jsonb_set(details, '{printingEndTime}', to_jsonb(end_time), true);
  END IF;
  IF p_patch ? 'machineId' THEN
    details := jsonb_set(details, '{machineId}', COALESCE(p_patch->'machineId', 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'inputRollsList' AND jsonb_typeof(p_patch->'inputRollsList') = 'array' THEN
    details := jsonb_set(details, '{inputRollsList}', p_patch->'inputRollsList', true);
  END IF;
  IF p_patch ? 'actualMetersPrinted' THEN
    details := jsonb_set(details, '{actualMetersPrinted}', COALESCE(to_jsonb(meters), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printedOutputKg' THEN
    details := jsonb_set(details, '{printedOutputKg}', COALESCE(to_jsonb(output_kg), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'inkGsmInSpeed' THEN
    details := jsonb_set(details, '{inkGsmInSpeed}', COALESCE(to_jsonb(next_ink_gsm), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printingNotes' THEN
    details := jsonb_set(details, '{printingNotes}', COALESCE(p_patch->'printingNotes', 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printingDurationMinutes' THEN
    details := jsonb_set(details, '{printingDurationMinutes}', COALESCE(to_jsonb(duration_minutes), 'null'::jsonb), true);
  END IF;
  IF p_patch ? 'printingDurationFormatted' THEN
    details := jsonb_set(details, '{printingDurationFormatted}', COALESCE(p_patch->'printingDurationFormatted', 'null'::jsonb), true);
  END IF;
  IF p_action = 'end' AND p_patch ? 'nextProcess' THEN
    details := jsonb_set(details, '{nextProcess}', COALESCE(p_patch->'nextProcess', 'null'::jsonb), true);
  END IF;

  FOREACH close_key IN ARRAY close_keys LOOP
    IF row.job_details ? close_key THEN
      details := jsonb_set(details, ARRAY[close_key], row.job_details -> close_key, true);
    ELSE
      details := details - close_key;
    END IF;
  END LOOP;

  IF NOT manual
     AND p_action IN ('start', 'end')
     AND lower(btrim(COALESCE(row.status, ''))) NOT IN ('cancelled', 'canceled', 'on hold') THEN
    next_status := 'In Production';
  ELSE
    next_status := row.status;
  END IF;

  delim_at := position(' ||| ' IN COALESCE(row.job_name, ''));
  IF delim_at > 0 THEN
    name_base := substring(row.job_name FROM 1 FOR delim_at - 1);
    raw_env := substring(row.job_name FROM delim_at + 5);
  ELSE
    name_base := COALESCE(row.job_name, '');
    raw_env := '';
  END IF;
  BEGIN
    envelope := CASE WHEN raw_env = '' THEN '{}'::jsonb ELSE raw_env::jsonb END;
  EXCEPTION WHEN others THEN
    envelope := '{}'::jsonb;
  END;
  IF jsonb_typeof(envelope) IS DISTINCT FROM 'object' THEN
    envelope := '{}'::jsonb;
  END IF;
  envelope := jsonb_set(envelope, '{jobDetails}', details, true);
  envelope := jsonb_set(envelope, '{printingStatus}', to_jsonb(next_printing_status), true);
  envelope := jsonb_set(envelope, '{isPrintingCompleted}', to_jsonb(printing_done), true);
  IF p_patch ? 'inputRollsList' AND jsonb_typeof(p_patch->'inputRollsList') = 'array' THEN
    envelope := jsonb_set(envelope, '{inputRollsList}', p_patch->'inputRollsList', true);
  END IF;
  IF p_patch ? 'machineId' THEN
    envelope := jsonb_set(envelope, '{machineId}', COALESCE(p_patch->'machineId', 'null'::jsonb), true);
  END IF;

  UPDATE public.orders
  SET
    status = next_status,
    printing_status = next_printing_status,
    printing_start_time = CASE WHEN p_action = 'progress' THEN row.printing_start_time ELSE start_time END,
    printing_end_time = CASE WHEN p_action = 'progress' THEN row.printing_end_time WHEN p_action = 'start' THEN NULL ELSE end_time END,
    printing_duration_minutes = CASE WHEN p_action = 'end' THEN duration_minutes ELSE row.printing_duration_minutes END,
    printing_duration_formatted = CASE
      WHEN p_action = 'end' AND p_patch ? 'printingDurationFormatted' THEN NULLIF(p_patch->>'printingDurationFormatted', '')
      ELSE row.printing_duration_formatted
    END,
    actual_meters_printed = CASE WHEN p_patch ? 'actualMetersPrinted' THEN meters ELSE row.actual_meters_printed END,
    printed_output_kg = CASE WHEN p_patch ? 'printedOutputKg' THEN output_kg ELSE row.printed_output_kg END,
    ink_gsm_in_speed = CASE WHEN p_patch ? 'inkGsmInSpeed' THEN next_ink_gsm ELSE row.ink_gsm_in_speed END,
    printing_notes = CASE
      WHEN p_patch ? 'printingNotes' THEN NULLIF(p_patch->>'printingNotes', '')
      ELSE row.printing_notes
    END,
    machine_id = CASE
      WHEN p_patch ? 'machineId' THEN NULLIF(p_patch->>'machineId', '')
      ELSE row.machine_id
    END,
    job_master_id = CASE
      WHEN COALESCE(p_patch->>'jobMasterId', '') <> '' THEN p_patch->>'jobMasterId'
      ELSE row.job_master_id
    END,
    job_details = details,
    job_name = name_base || ' ||| ' || envelope::text
  WHERE id = p_order_id
  RETURNING * INTO row;

  RETURN jsonb_build_object(
    'id', row.id,
    'status', row.status,
    'closeMode', row.close_mode,
    'printingStatus', row.printing_status,
    'printingStartTime', row.printing_start_time,
    'printingEndTime', row.printing_end_time,
    'isPrintingCompleted', COALESCE(row.job_details->>'isPrintingCompleted', '') = 'true',
    'machineId', row.machine_id,
    'actualMetersPrinted', row.actual_meters_printed,
    'printedOutputKg', row.printed_output_kg,
    'inkGsmInSpeed', row.ink_gsm_in_speed,
    'printingNotes', row.printing_notes,
    'nextProcess', row.job_details->>'nextProcess',
    'inputRollsList', COALESCE(row.job_details->'inputRollsList', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_print_run(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_print_run(text, text, jsonb) TO authenticated;
