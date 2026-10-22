-- Automated mail that has no @samyakinternational.in recipient left is not
-- sent. Record that refusal on email_send_log with outcome = 'blocked'.
-- Blocked rows do not consume the daily send cap.
--
-- Additive only. claim_email_send keeps the 50 / 60 limits from
-- 20261020071726_raise_email_send_cap_to_50.sql and adds the outcome filter.
-- EXECUTE stays with service_role. The table stays closed to the browser.

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'sent';

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'email_send_log_outcome_check'
  ) THEN
    ALTER TABLE public.email_send_log
      ADD CONSTRAINT email_send_log_outcome_check
      CHECK (outcome IN ('sent', 'blocked'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'email_send_log_kind_check'
  ) THEN
    ALTER TABLE public.email_send_log
      ADD CONSTRAINT email_send_log_kind_check
      CHECK (kind IS NULL OR kind IN ('manual', 'automated'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_email_send(p_user uuid, p_to text, p_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  day_start timestamptz;
  user_count integer;
  global_count integer;
  new_id bigint;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('flexierp-email-cap'));

  day_start := date_trunc('day', pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')
    AT TIME ZONE 'Asia/Kolkata';

  SELECT count(*) INTO user_count
  FROM public.email_send_log
  WHERE auth_user_id = p_user
    AND sent_at >= day_start
    AND outcome IS DISTINCT FROM 'blocked';

  SELECT count(*) INTO global_count
  FROM public.email_send_log
  WHERE sent_at >= day_start
    AND outcome IS DISTINCT FROM 'blocked';

  IF user_count >= 50 THEN
    RETURN jsonb_build_object('status', 'user');
  END IF;

  IF global_count >= 60 THEN
    RETURN jsonb_build_object('status', 'global');
  END IF;

  INSERT INTO public.email_send_log (auth_user_id, recipient, subject, outcome)
  VALUES (
    p_user,
    left(coalesce(p_to, ''), 500),
    left(coalesce(p_subject, ''), 300),
    'sent'
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('status', 'ok', 'id', new_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_blocked_email_send(
  p_user uuid,
  p_to text,
  p_subject text,
  p_kind text DEFAULT 'automated'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  new_id bigint;
  stored_kind text;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  stored_kind := CASE WHEN p_kind = 'manual' THEN 'manual' ELSE 'automated' END;

  INSERT INTO public.email_send_log (auth_user_id, recipient, subject, outcome, kind)
  VALUES (
    p_user,
    left(coalesce(p_to, ''), 500),
    left(coalesce(p_subject, ''), 300),
    'blocked',
    stored_kind
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('status', 'blocked', 'id', new_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_email_send(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_send(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.log_blocked_email_send(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_blocked_email_send(uuid, text, text, text) TO service_role;
