-- A signed-in person records their own audit row through public.record_audit_log.
--
-- The browser used to upsert audit_logs. Postgres checks the UPDATE policy
-- for INSERT ... ON CONFLICT DO UPDATE, and audit_logs_update allows only
-- Admin. A Printing Operator therefore saw "new row violates row-level
-- security policy" even for a brand-new id. The sign-in screen fired that
-- upsert for an AUTH row when nothing else had changed.
--
-- Direct INSERT is removed so the client cannot choose username, role, or
-- actor. The function derives those from auth.uid() and public.users, and
-- only a confirmed email may write. Admin SELECT, UPDATE, and DELETE
-- policies are unchanged.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id uuid;

COMMENT ON COLUMN public.audit_logs.actor_id IS
  'auth.uid() of the account that recorded the row. Set only by public.record_audit_log.';

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;

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

  SELECT
    coalesce(nullif(btrim(dir.full_name), ''), nullif(btrim(dir.username), ''), nullif(btrim(dir.email), ''), 'User'),
    coalesce(dir.role, ''),
    coalesce(dir.active, true)
      AND lower(coalesce(dir.status, 'Active')) = 'active'
      AND dir.id NOT LIKE 'USR-SETTING-%'
  INTO v_username, v_role, v_active
  FROM public.users AS dir
  WHERE dir.auth_user_id = v_uid
     OR (dir.auth_user_id IS NULL AND dir.id = v_uid::text)
  ORDER BY (dir.auth_user_id = v_uid) DESC
  LIMIT 1;

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
  'Append one audit row for auth.uid(). Username and actor_id come from the directory, not the client.';
