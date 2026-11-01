-- One active print run per printing machine, and the history used for run vs idle time.
--
-- Orders are not updated and open runs are not closed. print_active_slot stays
-- null on rows that were already active, so a partial unique index can be
-- created without rejecting the migration. Those duplicates stay visible in
-- print_run_duplicate_actives until someone ends them.
--
-- A run with a machine id occupies that machine. A run with no machine id
-- occupies the single plant-wide slot: it blocks every other start, and any
-- other active run blocks a start that has no machine.
--
-- print_runs is a copy of each start and end. The backfill inserts one row
-- per order that already has printing_start_time. It does not write orders.
-- role_permissions gets only the print_run_analytics key. Other flags stay.

CREATE OR REPLACE FUNCTION public.order_print_run_is_active(
  p_status text,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_end IS NULL
    AND p_start IS NOT NULL
    AND lower(btrim(coalesce(p_status, ''))) NOT IN ('completed', 'cancelled', 'canceled');
$$;

CREATE OR REPLACE FUNCTION public.print_run_job_label(p_job_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(
    CASE
      WHEN position(' ||| ' IN coalesce(p_job_name, '')) > 0
        THEN substring(p_job_name FROM 1 FOR position(' ||| ' IN p_job_name) - 1)
      ELSE p_job_name
    END
  ), ''), 'Untitled job');
$$;

REVOKE ALL ON FUNCTION public.order_print_run_is_active(text, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.print_run_job_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_print_run_is_active(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.print_run_job_label(text) TO authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_active_slot text;

COMMENT ON COLUMN public.orders.print_active_slot IS
  'Machine id of a print run that became active after this migration, or __GLOBAL__ when that run has no machine. Existing active runs stay null so they are reported and not closed.';

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_active_print_slot
  ON public.orders (print_active_slot)
  WHERE print_active_slot IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_active_print_run_idx
  ON public.orders (COALESCE(NULLIF(btrim(machine_id), ''), '__GLOBAL__'))
  WHERE public.order_print_run_is_active(printing_status, printing_start_time, printing_end_time);

CREATE OR REPLACE FUNCTION private.current_print_operator_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(btrim(u.full_name), ''),
    NULLIF(btrim(u.username), ''),
    NULLIF(btrim(u.email), '')
  )
  FROM public.users AS u
  WHERE auth.uid() IS NOT NULL
    AND u.id NOT LIKE 'USR-SETTING-%'
    AND (
      u.auth_user_id = auth.uid()
      OR (u.auth_user_id IS NULL AND u.id = (auth.uid())::text)
    )
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_print_operator_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_print_operator_name() TO authenticated;

CREATE OR REPLACE FUNCTION private.assert_single_active_print_run(
  p_order_id text,
  p_machine_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  slot text := COALESCE(NULLIF(btrim(p_machine_id), ''), '__GLOBAL__');
  conflict record;
  human text;
  payload jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('samyak-print-run'), pg_catalog.hashtext('__GLOBAL__'));
  IF slot <> '__GLOBAL__' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('samyak-print-run'), pg_catalog.hashtext(slot));
  END IF;

  SELECT
    o.id,
    public.print_run_job_label(o.job_name) AS job_label,
    NULLIF(btrim(o.machine_id), '') AS machine_id
  INTO conflict
  FROM public.orders AS o
  WHERE o.id IS DISTINCT FROM p_order_id
    AND public.order_print_run_is_active(o.printing_status, o.printing_start_time, o.printing_end_time)
    AND (
      slot = '__GLOBAL__'
      OR NULLIF(btrim(o.machine_id), '') IS NULL
      OR btrim(o.machine_id) = btrim(p_machine_id)
    )
  ORDER BY o.printing_start_time NULLS LAST, o.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  human := format(
    'Another print run is still active%s: %s (%s). End that run before starting another job.',
    CASE
      WHEN slot = '__GLOBAL__' THEN ' with no printing machine on the run'
      WHEN conflict.machine_id IS NULL THEN ' with no printing machine, which blocks every press'
      ELSE format(' on machine %s', btrim(p_machine_id))
    END,
    conflict.job_label,
    conflict.id
  );
  payload := jsonb_build_object(
    'orderId', conflict.id,
    'machineId', COALESCE(conflict.machine_id, ''),
    'jobName', conflict.job_label,
    'scope', CASE WHEN slot = '__GLOBAL__' OR conflict.machine_id IS NULL THEN 'global' ELSE 'machine' END
  );
  RAISE EXCEPTION '%', 'PRINT_RUN_BUSY ' || payload::text || E'\n' || human
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION private.assert_single_active_print_run(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.assert_single_active_print_run(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_one_active_print_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_key text;
  new_key text;
  new_active boolean;
  old_active boolean := false;
BEGIN
  new_active := public.order_print_run_is_active(NEW.printing_status, NEW.printing_start_time, NEW.printing_end_time);
  new_key := CASE
    WHEN new_active THEN COALESCE(NULLIF(btrim(NEW.machine_id), ''), '__GLOBAL__')
    ELSE NULL
  END;
  IF TG_OP = 'UPDATE' THEN
    old_active := public.order_print_run_is_active(OLD.printing_status, OLD.printing_start_time, OLD.printing_end_time);
    old_key := CASE
      WHEN old_active THEN COALESCE(NULLIF(btrim(OLD.machine_id), ''), '__GLOBAL__')
      ELSE NULL
    END;
  END IF;

  IF new_key IS NULL THEN
    NEW.print_active_slot := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND old_key IS NOT DISTINCT FROM new_key THEN
    NEW.print_active_slot := OLD.print_active_slot;
    RETURN NEW;
  END IF;

  PERFORM private.assert_single_active_print_run(NEW.id, NULLIF(btrim(NEW.machine_id), ''));
  NEW.print_active_slot := new_key;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_one_active_print_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.guard_one_active_print_run() TO authenticated;

DROP TRIGGER IF EXISTS guard_one_active_print_run ON public.orders;
CREATE TRIGGER guard_one_active_print_run
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_one_active_print_run();

CREATE TABLE IF NOT EXISTS public.print_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  machine_id text,
  job_name text,
  operator_name text,
  ended_operator_name text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  next_process text,
  started_by uuid,
  ended_by uuid,
  origin text NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS print_runs_slot_started_idx
  ON public.print_runs (COALESCE(NULLIF(btrim(machine_id), ''), '__GLOBAL__'), started_at);

CREATE INDEX IF NOT EXISTS print_runs_open_order_idx
  ON public.print_runs (order_id)
  WHERE ended_at IS NULL;

ALTER TABLE public.print_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.print_run_analytics_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.has_role(ARRAY['Admin', 'Plant Manager', 'Production Manager'])
    AND (
      private.has_role(ARRAY['Admin'])
      OR EXISTS (
        SELECT 1
        FROM unnest(private.app_roles()) AS granted(role_name)
        LEFT JOIN public.role_permissions AS rp ON rp.role = granted.role_name
        WHERE granted.role_name IN ('Plant Manager', 'Production Manager')
          AND COALESCE(rp.permissions -> 'print_run_analytics', 'true'::jsonb) = 'true'::jsonb
      )
    );
$$;

REVOKE ALL ON FUNCTION private.print_run_analytics_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.print_run_analytics_allowed() TO authenticated;

DROP POLICY IF EXISTS print_runs_select ON public.print_runs;
CREATE POLICY print_runs_select ON public.print_runs
  FOR SELECT TO authenticated
  USING (private.print_run_analytics_allowed());

REVOKE ALL ON TABLE public.print_runs FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.print_runs TO authenticated;

CREATE OR REPLACE FUNCTION private.log_print_run_event(
  p_action text,
  p_order_id text,
  p_machine_id text,
  p_job_name text,
  p_started timestamptz,
  p_ended timestamptz,
  p_next_process text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text := private.current_print_operator_name();
  label text := public.print_run_job_label(p_job_name);
  open_id uuid;
BEGIN
  SELECT id INTO open_id
  FROM public.print_runs
  WHERE order_id = p_order_id
    AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF p_action = 'end' THEN
    IF open_id IS NOT NULL THEN
      UPDATE public.print_runs
      SET
        ended_at = COALESCE(p_ended, pg_catalog.now()),
        machine_id = COALESCE(p_machine_id, machine_id),
        job_name = label,
        next_process = COALESCE(p_next_process, next_process),
        ended_by = actor,
        ended_operator_name = actor_name,
        operator_name = COALESCE(operator_name, actor_name)
      WHERE id = open_id;
    ELSIF p_started IS NOT NULL THEN
      INSERT INTO public.print_runs (
        order_id, machine_id, job_name, operator_name, ended_operator_name,
        started_at, ended_at, next_process, ended_by, origin
      ) VALUES (
        p_order_id, p_machine_id, label, actor_name, actor_name,
        p_started, COALESCE(p_ended, pg_catalog.now()), p_next_process, actor, 'recorded'
      );
    END IF;
    RETURN;
  END IF;

  IF p_action = 'start' THEN
    IF open_id IS NOT NULL THEN
      UPDATE public.print_runs
      SET
        machine_id = p_machine_id,
        job_name = label,
        started_at = COALESCE(p_started, started_at),
        operator_name = COALESCE(actor_name, operator_name),
        started_by = COALESCE(started_by, actor),
        ended_at = NULL
      WHERE id = open_id;
    ELSIF p_started IS NOT NULL THEN
      INSERT INTO public.print_runs (
        order_id, machine_id, job_name, operator_name, started_at, started_by, origin
      ) VALUES (
        p_order_id, p_machine_id, label, actor_name, p_started, actor, 'recorded'
      );
    END IF;
    RETURN;
  END IF;

  IF open_id IS NOT NULL THEN
    UPDATE public.print_runs
    SET
      machine_id = COALESCE(p_machine_id, machine_id),
      job_name = label
    WHERE id = open_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.log_print_run_event(text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.log_print_run_event(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;

-- Copy existing press times. Does not update public.orders.
INSERT INTO public.print_runs (
  order_id, machine_id, job_name, started_at, ended_at, next_process, origin
)
SELECT
  o.id,
  NULLIF(btrim(o.machine_id), ''),
  public.print_run_job_label(o.job_name),
  o.printing_start_time,
  CASE
    WHEN public.order_print_run_is_active(o.printing_status, o.printing_start_time, o.printing_end_time) THEN NULL
    ELSE COALESCE(o.printing_end_time, o.printing_start_time)
  END,
  NULLIF(o.job_details ->> 'nextProcess', ''),
  'backfill'
FROM public.orders AS o
WHERE o.printing_start_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.print_runs AS existing WHERE existing.order_id = o.id
  );

CREATE OR REPLACE VIEW public.print_run_duplicate_actives
WITH (security_invoker = true) AS
WITH active AS (
  SELECT
    o.id AS order_id,
    public.print_run_job_label(o.job_name) AS job_name,
    NULLIF(btrim(o.machine_id), '') AS machine_id,
    COALESCE(NULLIF(btrim(o.machine_id), ''), '__GLOBAL__') AS slot,
    o.printing_status,
    o.printing_start_time
  FROM public.orders AS o
  WHERE public.order_print_run_is_active(o.printing_status, o.printing_start_time, o.printing_end_time)
)
SELECT a.order_id, a.job_name, a.machine_id, a.slot, a.printing_status, a.printing_start_time
FROM active AS a
WHERE EXISTS (
  SELECT 1
  FROM active AS other
  WHERE other.order_id <> a.order_id
    AND (
      other.slot = a.slot
      OR a.slot = '__GLOBAL__'
      OR other.slot = '__GLOBAL__'
    )
);

COMMENT ON VIEW public.print_run_duplicate_actives IS
  'Active print runs that break the one-run rule. They are listed and left open.';

REVOKE ALL ON TABLE public.print_run_duplicate_actives FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.print_run_duplicate_actives TO authenticated;
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

  PERFORM private.log_print_run_event(
    p_action,
    row.id,
    NULLIF(btrim(row.machine_id), ''),
    row.job_name,
    row.printing_start_time,
    row.printing_end_time,
    NULLIF(row.job_details ->> 'nextProcess', '')
  );

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

CREATE OR REPLACE FUNCTION public.print_machine_run_idle(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_as_of timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  as_of timestamptz := COALESCE(p_as_of, pg_catalog.now());
  shifts jsonb;
  default_shifts jsonb := '[
    {"id":"day","name":"Day","start":"08:00","end":"20:00"},
    {"id":"night","name":"Night","start":"20:00","end":"08:00"}
  ]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to view print machine run and idle time'
      USING ERRCODE = '42501';
  END IF;
  IF NOT private.print_run_analytics_allowed() THEN
    RAISE EXCEPTION 'Print machine run and idle reports are limited to Admin, Plant Manager, and Production Manager'
      USING ERRCODE = '42501';
  END IF;
  IF p_range_end <= p_range_start THEN
    RAISE EXCEPTION 'The report end must be after the start'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    SELECT NULLIF(setting_value, '')::jsonb INTO shifts
    FROM public.system_settings
    WHERE setting_key = 'printing_shift_windows';
  EXCEPTION WHEN others THEN
    shifts := NULL;
  END;
  IF shifts IS NULL OR jsonb_typeof(shifts) IS DISTINCT FROM 'array' OR jsonb_array_length(shifts) = 0 THEN
    shifts := default_shifts;
  END IF;

  RETURN jsonb_build_object(
    'asOf', as_of,
    'shifts', shifts,
    'runs', COALESCE((
      WITH base AS (
        SELECT
          pr.order_id,
          NULLIF(btrim(pr.machine_id), '') AS machine_id,
          COALESCE(NULLIF(btrim(pr.machine_id), ''), '__GLOBAL__') AS slot,
          public.print_run_job_label(pr.job_name) AS job_name,
          pr.operator_name,
          pr.ended_operator_name,
          pr.started_at,
          pr.ended_at,
          CASE
            WHEN pr.ended_at IS NULL OR pr.ended_at > as_of THEN as_of
            ELSE pr.ended_at
          END AS effective_end
        FROM public.print_runs AS pr
        WHERE pr.started_at <= as_of
      ),
      overlap AS (
        SELECT * FROM base
        WHERE started_at < p_range_end
          AND effective_end > p_range_start
      ),
      previous AS (
        SELECT DISTINCT ON (slot) *
        FROM base
        WHERE effective_end <= p_range_start
        ORDER BY slot, effective_end DESC, started_at DESC
      ),
      following AS (
        SELECT DISTINCT ON (slot) *
        FROM base
        WHERE started_at >= p_range_end
        ORDER BY slot, started_at ASC
      ),
      selected AS (
        SELECT order_id, machine_id, job_name, operator_name, ended_operator_name, started_at, ended_at FROM overlap
        UNION
        SELECT order_id, machine_id, job_name, operator_name, ended_operator_name, started_at, ended_at FROM previous
        UNION
        SELECT order_id, machine_id, job_name, operator_name, ended_operator_name, started_at, ended_at FROM following
      )
      SELECT jsonb_agg(jsonb_build_object(
        'orderId', selected.order_id,
        'machineId', COALESCE(selected.machine_id, ''),
        'jobName', selected.job_name,
        'operatorName', COALESCE(selected.operator_name, ''),
        'endedOperatorName', COALESCE(selected.ended_operator_name, ''),
        'startedAt', selected.started_at,
        'endedAt', CASE WHEN selected.ended_at IS NULL OR selected.ended_at > as_of THEN NULL ELSE selected.ended_at END
      ))
      FROM selected
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.print_machine_run_idle(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.print_machine_run_idle(timestamptz, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_printing_shift_windows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  key text;
BEGIN
  key := lower(COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.setting_key ELSE NEW.setting_key END, ''));
  IF key <> 'printing_shift_windows' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF private.has_role(ARRAY['Admin']) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only an Admin can edit printing shift times'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_printing_shift_windows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_printing_shift_windows() TO authenticated;

DROP TRIGGER IF EXISTS system_settings_guard_printing_shifts ON public.system_settings;
CREATE TRIGGER system_settings_guard_printing_shifts
  BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_printing_shift_windows();

INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
VALUES (
  'printing_shift_windows',
  '[{"id":"day","name":"Day","start":"08:00","end":"20:00"},{"id":"night","name":"Night","start":"20:00","end":"08:00"}]',
  pg_catalog.now()
)
ON CONFLICT (setting_key) DO NOTHING;

DO $roles$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.role_permissions AS rp
  SET permissions = jsonb_set(
    COALESCE(rp.permissions, '{}'::jsonb),
    '{print_run_analytics}',
    to_jsonb(rp.role IN ('Admin', 'Plant Manager', 'Production Manager')),
    true
  )
  WHERE rp.permissions IS NULL
     OR NOT (rp.permissions ? 'print_run_analytics')
     OR (rp.permissions -> 'print_run_analytics') IS DISTINCT FROM to_jsonb(rp.role IN ('Admin', 'Plant Manager', 'Production Manager'));
END
$roles$;
