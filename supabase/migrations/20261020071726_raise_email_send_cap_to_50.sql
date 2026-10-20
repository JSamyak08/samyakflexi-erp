-- Raise the per-account daily email send cap from 20 to 50.
-- Only the user_count threshold changes. The plant-wide cap (60), security
-- definer, search_path, and grants are unchanged (CREATE OR REPLACE keeps the
-- existing owner and EXECUTE privileges).
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
    AND sent_at >= day_start;

  SELECT count(*) INTO global_count
  FROM public.email_send_log
  WHERE sent_at >= day_start;

  IF user_count >= 50 THEN
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
$function$;
