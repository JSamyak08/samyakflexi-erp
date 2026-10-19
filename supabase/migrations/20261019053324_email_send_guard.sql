-- B-025. Count outbound ERP mail so the serverless function can stop
-- before the Hostinger mailbox (100 messages a day) is exhausted.
--
-- The log is not readable or writable from the browser. RLS is enabled and
-- there is no policy, so anon and authenticated are denied even if a later
-- migration grants table privileges (the lockdown migration grants DML on
-- every public table to authenticated). The service role bypasses RLS.
--
-- The functions stay in public because the Vercel handler calls them with
-- supabase.rpc(), and PostgREST only exposes public. EXECUTE is revoked
-- from PUBLIC, anon, and authenticated and granted only to service_role.
-- Moving them into private would hide them from that API call.

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS email_send_log_sent_at_idx
  ON public.email_send_log (sent_at);

CREATE INDEX IF NOT EXISTS email_send_log_user_sent_idx
  ON public.email_send_log (auth_user_id, sent_at);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_send_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_email_send(
  p_user uuid,
  p_to text,
  p_subject text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    AND sent_at >= day_start;

  SELECT count(*) INTO global_count
  FROM public.email_send_log
  WHERE sent_at >= day_start;

  IF user_count >= 20 THEN
    RETURN jsonb_build_object('status', 'user');
  END IF;

  IF global_count >= 60 THEN
    RETURN jsonb_build_object('status', 'global');
  END IF;

  INSERT INTO public.email_send_log (auth_user_id, recipient, subject)
  VALUES (
    p_user,
    left(coalesce(p_to, ''), 500),
    left(coalesce(p_subject, ''), 300)
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('status', 'ok', 'id', new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_email_send(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.email_send_log WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_send(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_email_send(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_send(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_email_send(bigint) TO service_role;
