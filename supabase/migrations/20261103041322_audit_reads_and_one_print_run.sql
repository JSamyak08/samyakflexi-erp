-- Audit reads, audit writes, and one open print run per machine.
--
-- Audit page showed nothing while the plant kept working.
-- * Writes from the browser go through public.record_audit_log. That
--   function only matched public.users.auth_user_id, and only fell back to
--   users.id when auth_user_id was null. Sign-in loads the directory row by
--   auth_user_id and then by id, so an Admin whose id is the login id and
--   whose auth_user_id points somewhere else could open the page and still
--   be invisible to the SELECT policy. The insert then failed the same way.
-- * The test database had never created record_audit_log, so the only client
--   write path was missing. Direct INSERT is not restored: a caller must not
--   choose the username.
-- * Key tables had no audit trigger, so a save that never called the client
--   helper left no row.
--
-- Printing allowed several open runs on one press.
-- * The screen treats the job-name envelope, then job_details, then the
--   printing columns as the press state. The earlier guard looked at the
--   columns only, so runs that lived in the JSON were invisible to it.
-- * Rows that are already open keep print_active_slot null. This migration
--   does not update orders and does not close those runs. A partial unique
--   index covers only a non-null slot, so creating it does not reject the
--   rows that are already open together. A later start still has to pass
--   the trigger, which sees those open runs.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT USAGE ON SCHEMA private TO postgres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA private TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA private TO authenticated;
  END IF;
END $$;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id uuid;

COMMENT ON COLUMN public.audit_logs.actor_id IS
  'auth.uid() of the account that recorded the row. Set by record_audit_log or the audit trigger.';

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

-- Same directory match the sign-in screen uses: auth_user_id, otherwise id.
CREATE OR REPLACE FUNCTION private.directory_for_uid(p_uid uuid)
RETURNS TABLE (username text, user_role text, is_active boolean, is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(u.username), ''), nullif(btrim(u.email), ''), 'User'),
    coalesce(u.role, ''),
    coalesce(u.active, true)
      AND lower(coalesce(u.status, 'Active')) = 'active',
    (
      u.role = 'Admin'
      OR 'Admin' = ANY (coalesce(u.assigned_roles, ARRAY[]::text[]))
    )
    AND coalesce(u.active, true)
    AND lower(coalesce(u.status, 'Active')) = 'active'
  FROM public.users AS u
  WHERE p_uid IS NOT NULL
    AND u.id NOT LIKE 'USR-SETTING-%'
    AND (u.auth_user_id = p_uid OR u.id = p_uid::text)
  ORDER BY (u.auth_user_id = p_uid) DESC, u.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.directory_for_uid(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.caller_can_read_audit_logs()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT d.is_admin
    FROM private.directory_for_uid(auth.uid()) AS d
  ), false);
$$;

REVOKE ALL ON FUNCTION private.caller_can_read_audit_logs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.caller_can_read_audit_logs() TO authenticated;

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (private.caller_can_read_audit_logs());

GRANT SELECT ON TABLE public.audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.record_audit_log(
  p_action_type text,
  p_module text,
  p_details text,
  p_target_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_confirmed timestamptz;
  v_username text;
  v_role text;
  v_active boolean;
  v_id text;
  v_action text;
  v_module text;
  v_details text;
  v_target text;
  v_at timestamptz := pg_catalog.now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in before recording an audit entry' USING ERRCODE = '42501';
  END IF;

  SELECT confirmed.email_confirmed_at
    INTO v_confirmed
  FROM auth.users AS confirmed
  WHERE confirmed.id = v_uid;

  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Verify your email before recording an audit entry' USING ERRCODE = '42501';
  END IF;

  SELECT d.username, d.user_role, d.is_active
    INTO v_username, v_role, v_active
  FROM private.directory_for_uid(v_uid) AS d;

  IF v_username IS NULL OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'This account cannot record audit entries' USING ERRCODE = '42501';
  END IF;

  v_action := left(coalesce(nullif(btrim(p_action_type), ''), 'UPDATE'), 40);
  v_module := left(coalesce(nullif(btrim(p_module), ''), 'System'), 80);
  v_details := left(coalesce(p_details, ''), 4000);
  v_target := nullif(left(coalesce(p_target_id, ''), 200), '');
  v_id := 'LOG-' || to_char(v_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS')
    || '-' || substr(pg_catalog.md5(v_uid::text || v_at::text || pg_catalog.random()::text), 1, 8);

  INSERT INTO public.audit_logs (
    id, username, user_role, action_type, module, details, target_id, created_at, actor_id
  ) VALUES (
    v_id, v_username, left(coalesce(v_role, ''), 80), v_action, v_module, v_details, v_target, v_at, v_uid
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_id,
    'username', v_username,
    'user_role', v_role,
    'action_type', v_action,
    'module', v_module,
    'details', v_details,
    'target_id', v_target,
    'created_at', v_at,
    'actor_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit_log(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_audit_log(text, text, text, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.record_audit_log(text, text, text, text) TO service_role;
  END IF;
END $$;

COMMENT ON FUNCTION public.record_audit_log(text, text, text, text) IS
  'Append one audit row for auth.uid(). The directory match is auth_user_id or users.id, the same lookup sign-in uses.';

CREATE OR REPLACE FUNCTION private.audit_data_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  v_username text := 'System';
  v_role text := '';
  action text;
  target text;
  row_json jsonb;
  module_name text;
  log_id text;
BEGIN
  IF uid IS NULL AND current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Press autosave rewrites job_details on every keystroke. Record the run
  -- itself (start, end, machine, order status), not each keystroke.
  IF TG_TABLE_NAME = 'orders' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.printing_status IS NOT DISTINCT FROM OLD.printing_status
       AND NEW.printing_start_time IS NOT DISTINCT FROM OLD.printing_start_time
       AND NEW.printing_end_time IS NOT DISTINCT FROM OLD.printing_end_time
       AND NEW.machine_id IS NOT DISTINCT FROM OLD.machine_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    action := 'CREATE';
    row_json := pg_catalog.to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    action := 'UPDATE';
    row_json := pg_catalog.to_jsonb(NEW);
  ELSE
    action := 'DELETE';
    row_json := pg_catalog.to_jsonb(OLD);
  END IF;

  target := coalesce(
    nullif(row_json->>'id', ''),
    nullif(row_json->>'dispatch_id', ''),
    nullif(row_json->>'sfg_batch_code', ''),
    nullif(row_json->>'grn_number', ''),
    TG_TABLE_NAME
  );
  module_name := CASE TG_TABLE_NAME
    WHEN 'orders' THEN 'Orders'
    WHEN 'clients' THEN 'Clients'
    WHEN 'vendors' THEN 'Vendors'
    WHEN 'inventory' THEN 'Inventory'
    WHEN 'grns' THEN 'GRN Inward'
    WHEN 'job_masters' THEN 'Job Masters'
    WHEN 'cylinders' THEN 'Cylinders'
    WHEN 'inks' THEN 'Ink Management'
    WHEN 'employees' THEN 'Employee Management'
    WHEN 'sfg_goods' THEN 'SFG Store'
    WHEN 'dispatch_shipments' THEN 'Dispatch'
    ELSE TG_TABLE_NAME
  END;

  IF uid IS NOT NULL THEN
    SELECT d.username, d.user_role
      INTO v_username, v_role
    FROM private.directory_for_uid(uid) AS d;
    IF v_username IS NULL THEN
      v_username := 'User';
      v_role := '';
    END IF;
  END IF;

  log_id := 'LOG-' || to_char(pg_catalog.now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSMS')
    || '-' || substr(pg_catalog.md5(coalesce(uid::text, 'system') || pg_catalog.random()::text), 1, 8);

  INSERT INTO public.audit_logs (
    id, username, user_role, action_type, module, details, target_id, created_at, actor_id
  ) VALUES (
    log_id,
    left(v_username, 200),
    left(coalesce(v_role, ''), 80),
    action,
    left(module_name, 80),
    left(action || ' ' || TG_TABLE_NAME || ' ' || target, 4000),
    left(target, 200),
    pg_catalog.now(),
    uid
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_data_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.audit_data_change() TO authenticated;

DO $audit$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'orders', 'clients', 'vendors', 'inventory', 'grns', 'job_masters',
    'cylinders', 'inks', 'employees', 'sfg_goods', 'dispatch_shipments'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS audit_data_change ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER audit_data_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_data_change()',
      tbl
    );
  END LOOP;
END
$audit$;

-- Press state in the same order the screen reads it.
CREATE OR REPLACE FUNCTION private.order_press_snapshot(
  p_status text,
  p_start timestamptz,
  p_end timestamptz,
  p_machine text,
  p_details jsonb,
  p_job_name text
)
RETURNS TABLE (active boolean, machine text, job_label text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  details jsonb := coalesce(p_details, '{}'::jsonb);
  envelope jsonb := '{}'::jsonb;
  env_details jsonb;
  raw text;
  delim integer;
  status text;
  started timestamptz;
  ended timestamptz;
  candidate text;
  texts text[];
BEGIN
  delim := position(' ||| ' IN coalesce(p_job_name, ''));
  IF delim > 0 THEN
    raw := substring(p_job_name FROM delim + 5);
    BEGIN
      envelope := raw::jsonb;
    EXCEPTION WHEN others THEN
      envelope := '{}'::jsonb;
    END;
    IF pg_catalog.jsonb_typeof(envelope) IS DISTINCT FROM 'object' THEN
      envelope := '{}'::jsonb;
    END IF;
  END IF;
  env_details := envelope->'jobDetails';
  IF pg_catalog.jsonb_typeof(env_details) IS DISTINCT FROM 'object' THEN
    env_details := '{}'::jsonb;
  END IF;

  status := coalesce(
    nullif(btrim(envelope->>'printingStatus'), ''),
    nullif(btrim(env_details->>'printingStatus'), ''),
    nullif(btrim(details->>'printingStatus'), ''),
    nullif(btrim(p_status), '')
  );
  machine := coalesce(
    nullif(btrim(envelope->>'machineId'), ''),
    nullif(btrim(env_details->>'machineId'), ''),
    nullif(btrim(details->>'machineId'), ''),
    nullif(btrim(p_machine), '')
  );

  texts := ARRAY[
    envelope->>'printingStartTime',
    env_details->>'printingStartTime',
    details->>'printingStartTime'
  ];
  FOREACH candidate IN ARRAY texts LOOP
    IF started IS NOT NULL THEN
      EXIT;
    END IF;
    IF nullif(btrim(candidate), '') IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      started := btrim(candidate)::timestamptz;
    EXCEPTION WHEN others THEN
      started := NULL;
    END;
  END LOOP;
  IF started IS NULL THEN
    started := p_start;
  END IF;

  texts := ARRAY[
    envelope->>'printingEndTime',
    env_details->>'printingEndTime',
    details->>'printingEndTime'
  ];
  FOREACH candidate IN ARRAY texts LOOP
    IF ended IS NOT NULL THEN
      EXIT;
    END IF;
    IF nullif(btrim(candidate), '') IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      ended := btrim(candidate)::timestamptz;
    EXCEPTION WHEN others THEN
      ended := NULL;
    END;
  END LOOP;
  IF ended IS NULL THEN
    ended := p_end;
  END IF;

  active := ended IS NULL
    AND lower(btrim(coalesce(status, ''))) NOT IN ('completed', 'cancelled', 'canceled')
    AND (
      lower(btrim(coalesce(status, ''))) IN ('in production', 'in progress', 'running', 'started')
      OR started IS NOT NULL
    );
  job_label := coalesce(nullif(btrim(
    CASE
      WHEN delim > 0 THEN substring(p_job_name FROM 1 FOR delim - 1)
      ELSE p_job_name
    END
  ), ''), 'Untitled job');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.order_press_snapshot(text, timestamptz, timestamptz, text, jsonb, text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_active_slot text;

COMMENT ON COLUMN public.orders.print_active_slot IS
  'Machine claimed by a print run that became active after the one-run guard. Runs that were already open stay null and are not closed by the migration.';

DO $slot$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orders_one_active_print_slot') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE print_active_slot IS NOT NULL
    GROUP BY print_active_slot
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'orders_one_active_print_slot was not created because print_active_slot already has duplicates';
  END IF;
  CREATE UNIQUE INDEX orders_one_active_print_slot
    ON public.orders (print_active_slot)
    WHERE print_active_slot IS NOT NULL;
END
$slot$;

CREATE OR REPLACE FUNCTION private.guard_one_active_print_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_snap record;
  new_snap record;
  old_key text;
  new_key text;
  conflict record;
  human text;
  payload jsonb;
BEGIN
  SELECT snap.active, snap.machine, snap.job_label
    INTO new_snap
  FROM private.order_press_snapshot(
    NEW.printing_status, NEW.printing_start_time, NEW.printing_end_time,
    NEW.machine_id, NEW.job_details, NEW.job_name
  ) AS snap;
  new_key := CASE WHEN new_snap.active THEN coalesce(new_snap.machine, '__GLOBAL__') ELSE NULL END;

  IF TG_OP = 'UPDATE' THEN
    SELECT snap.active, snap.machine, snap.job_label
      INTO old_snap
    FROM private.order_press_snapshot(
      OLD.printing_status, OLD.printing_start_time, OLD.printing_end_time,
      OLD.machine_id, OLD.job_details, OLD.job_name
    ) AS snap;
    old_key := CASE WHEN old_snap.active THEN coalesce(old_snap.machine, '__GLOBAL__') ELSE NULL END;
  END IF;

  IF new_key IS NULL THEN
    NEW.print_active_slot := NULL;
    RETURN NEW;
  END IF;

  -- Still the same open run. Leave a null slot null so rows that were already
  -- open together are not rewritten and can still be ended.
  IF TG_OP = 'UPDATE' AND old_key IS NOT DISTINCT FROM new_key THEN
    NEW.print_active_slot := OLD.print_active_slot;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('samyak-print-run'),
    pg_catalog.hashtext(new_key)
  );

  SELECT o.id, snap.job_label, snap.machine
    INTO conflict
  FROM public.orders AS o
  CROSS JOIN LATERAL private.order_press_snapshot(
    o.printing_status, o.printing_start_time, o.printing_end_time,
    o.machine_id, o.job_details, o.job_name
  ) AS snap
  WHERE o.id IS DISTINCT FROM NEW.id
    AND snap.active
    AND (
      new_key = '__GLOBAL__'
      OR snap.machine IS NULL
      OR snap.machine = new_snap.machine
    )
  ORDER BY o.printing_start_time NULLS LAST, o.id
  LIMIT 1;

  IF FOUND THEN
    human := format(
      'End the current run first. %s is still running %s (%s).',
      CASE
        WHEN new_key = '__GLOBAL__' OR conflict.machine IS NULL THEN 'A print run with no machine'
        ELSE format('Machine %s', coalesce(new_snap.machine, new_key))
      END,
      conflict.job_label,
      conflict.id
    );
    payload := pg_catalog.jsonb_build_object(
      'orderId', conflict.id,
      'machineId', coalesce(conflict.machine, ''),
      'jobName', conflict.job_label,
      'scope', CASE WHEN new_key = '__GLOBAL__' OR conflict.machine IS NULL THEN 'global' ELSE 'machine' END
    );
    RAISE EXCEPTION '%', 'PRINT_RUN_BUSY ' || payload::text || E'\n' || human
      USING ERRCODE = 'P0001';
  END IF;

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
