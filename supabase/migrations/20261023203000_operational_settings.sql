-- Operational settings for GST, mail caps, costing defaults, and plain-film wastage.
-- Existing statutory company fields and existing document counters are not overwritten.
-- Missing keys are filled. Column defaults that restated source literals are removed.

DO $$
DECLARE
  raw text;
  doc jsonb;
BEGIN
  IF to_regclass('public.system_settings') IS NULL THEN
    RETURN;
  END IF;

  SELECT setting_value INTO raw
  FROM public.system_settings
  WHERE setting_key = 'company_profile';

  IF raw IS NULL THEN
    INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
    VALUES (
      'company_profile',
      '{"name":"SAMYAK INTERNATIONAL LTD.","bseSymbol":"SAMYAKINT","cin":"L67120MH1994PLC225907","gstin":"23AABCM3526F1ZY","address":"11-B, Kheda Industrial Area, Pithampur Sector - III, Dist. Dhar, Dhar (Madhya Pradesh- 23), India - 454775","contactPerson":"Samyak Jain","phones":"8889133133","email":"info@samyakinternational.in","placeOfSupply":"Dhar, Madhya Pradesh (23)","logoUrl":"/samyak-logo.svg","defaultGstRatePct":18,"timeZone":"Asia/Kolkata","locale":"en-IN","currency":"INR","financialYearStartMonth":4}',
      pg_catalog.now()
    );
    RETURN;
  END IF;

  BEGIN
    doc := raw::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'company_profile setting is not valid JSON';
  END;

  IF NOT (doc ? 'defaultGstRatePct') OR doc->>'defaultGstRatePct' IS NULL OR doc->>'defaultGstRatePct' = '' THEN
    doc := jsonb_set(doc, '{defaultGstRatePct}', '18'::jsonb, true);
  END IF;
  IF NOT (doc ? 'timeZone') OR doc->>'timeZone' IS NULL OR doc->>'timeZone' = '' THEN
    doc := jsonb_set(doc, '{timeZone}', '"Asia/Kolkata"'::jsonb, true);
  END IF;
  IF NOT (doc ? 'locale') OR doc->>'locale' IS NULL OR doc->>'locale' = '' THEN
    doc := jsonb_set(doc, '{locale}', '"en-IN"'::jsonb, true);
  END IF;
  IF NOT (doc ? 'currency') OR doc->>'currency' IS NULL OR doc->>'currency' = '' THEN
    doc := jsonb_set(doc, '{currency}', '"INR"'::jsonb, true);
  END IF;
  IF NOT (doc ? 'financialYearStartMonth') OR doc->>'financialYearStartMonth' IS NULL OR doc->>'financialYearStartMonth' = '' THEN
    doc := jsonb_set(doc, '{financialYearStartMonth}', '4'::jsonb, true);
  END IF;

  UPDATE public.system_settings
  SET setting_value = doc::text,
      updated_at = pg_catalog.now()
  WHERE setting_key = 'company_profile'
    AND setting_value IS DISTINCT FROM doc::text;
END $$;

INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
SELECT 'costing_settings',
       '{"wastageTiers":[{"minKg":2000,"reelPct":4.5,"pouchPct":5},{"minKg":1000,"reelPct":5,"pouchPct":6},{"minKg":501,"reelPct":6,"pouchPct":7.5},{"minKg":0,"reelPct":7,"pouchPct":8}],"ldExtraSlitMm":5,"cylinderUtilisationLimitKg":10000,"silLogoText":"Yes - ''Pkg Material Mfg by - Samyak International Ltd''"}',
       pg_catalog.now()
WHERE to_regclass('public.system_settings') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.system_settings WHERE setting_key = 'costing_settings'
  );

INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
SELECT 'purchasing_settings',
       '{"defaultLeadTimeDays":5}',
       pg_catalog.now()
WHERE to_regclass('public.system_settings') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.system_settings WHERE setting_key = 'purchasing_settings'
  );

INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
SELECT 'shift_master',
       '[{"id":"day","name":"Day Shift","start":"08:00","end":"20:00","hours":12}]',
       pg_catalog.now()
WHERE to_regclass('public.system_settings') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.system_settings WHERE setting_key = 'shift_master'
  );

DO $$
BEGIN
  IF to_regclass('public.email_settings') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS user_daily_cap integer;
  ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS plant_daily_cap integer;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_host DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_port DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_secure DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_user DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN sender_name DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN admin_email DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN plant_manager_email DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN purchase_email DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN dispatch_email DROP DEFAULT;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_host DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_port DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_secure DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_user DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN smtp_pass DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN sender_name DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN admin_email DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN plant_manager_email DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN purchase_email DROP NOT NULL;
  ALTER TABLE public.email_settings ALTER COLUMN dispatch_email DROP NOT NULL;

  INSERT INTO public.email_settings (id, user_daily_cap, plant_daily_cap)
  VALUES ('default', 50, 60)
  ON CONFLICT (id) DO UPDATE
  SET user_daily_cap = COALESCE(public.email_settings.user_daily_cap, EXCLUDED.user_daily_cap),
      plant_daily_cap = COALESCE(public.email_settings.plant_daily_cap, EXCLUDED.plant_daily_cap);
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
  user_cap integer;
  plant_cap integer;
  tz text;
  profile jsonb;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  SELECT user_daily_cap, plant_daily_cap
    INTO user_cap, plant_cap
  FROM public.email_settings
  WHERE id = 'default';

  BEGIN
    SELECT setting_value::jsonb INTO profile
    FROM public.system_settings
    WHERE setting_key = 'company_profile';
  EXCEPTION WHEN others THEN
    profile := NULL;
  END;

  tz := profile->>'timeZone';

  IF user_cap IS NULL OR plant_cap IS NULL OR tz IS NULL OR tz = '' THEN
    RETURN jsonb_build_object(
      'status', 'config',
      'message', 'Email caps or company_profile.timeZone are not configured.'
    );
  END IF;

  BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('flexierp-email-cap'));
    day_start := date_trunc('day', pg_catalog.now() AT TIME ZONE tz) AT TIME ZONE tz;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object(
      'status', 'config',
      'message', 'company_profile.timeZone is not a valid time zone.'
    );
  END;

  SELECT count(*) INTO user_count
  FROM public.email_send_log
  WHERE auth_user_id = p_user
    AND sent_at >= day_start
    AND outcome IS DISTINCT FROM 'blocked';

  SELECT count(*) INTO global_count
  FROM public.email_send_log
  WHERE sent_at >= day_start
    AND outcome IS DISTINCT FROM 'blocked';

  IF user_count >= user_cap THEN
    RETURN jsonb_build_object('status', 'user', 'userDailyCap', user_cap, 'plantDailyCap', plant_cap);
  END IF;

  IF global_count >= plant_cap THEN
    RETURN jsonb_build_object('status', 'global', 'userDailyCap', user_cap, 'plantDailyCap', plant_cap);
  END IF;

  INSERT INTO public.email_send_log (auth_user_id, recipient, subject, outcome)
  VALUES (
    p_user,
    left(coalesce(p_to, ''), 500),
    left(coalesce(p_subject, ''), 300),
    'sent'
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('status', 'ok', 'id', new_id, 'userDailyCap', user_cap, 'plantDailyCap', plant_cap);
END;
$function$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_masters' AND column_name = 'wastage_percentage'
  ) THEN
    EXECUTE 'ALTER TABLE public.job_masters ALTER COLUMN wastage_percentage DROP DEFAULT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_masters' AND column_name = 'ink_gsm'
  ) THEN
    EXECUTE 'ALTER TABLE public.job_masters ALTER COLUMN ink_gsm DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.job_masters ALTER COLUMN adhesive_gsm DROP DEFAULT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'wastage_percentage'
  ) THEN
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN wastage_percentage DROP DEFAULT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'ink_gsm'
  ) THEN
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN ink_gsm DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN adhesive_gsm DROP DEFAULT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_records' AND column_name = 'processing_cost_per_kg'
  ) THEN
    EXECUTE 'ALTER TABLE public.production_records ALTER COLUMN processing_cost_per_kg DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.production_records ALTER COLUMN target_ink_gsm DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.production_records ALTER COLUMN target_adhesive_gsm DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.production_records ALTER COLUMN adhesive_cost_per_kg DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.production_records ALTER COLUMN paper_core_cost_per_kg DROP DEFAULT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cylinders' AND column_name = 'utilisation_limit'
  ) THEN
    EXECUTE 'ALTER TABLE public.cylinders ALTER COLUMN utilisation_limit DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.cylinders ALTER COLUMN sil_logo DROP DEFAULT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_records' AND column_name = 'printing_plain_setting_wastage_kg'
  ) THEN
    EXECUTE $comment$COMMENT ON COLUMN public.production_records.printing_plain_setting_wastage_kg IS 'Kilograms of plain substrate wasted at printing. End job writes the sum of each input roll plainSubstrateWastageKg. A later Printing (Pass 2) scrap addition is kept when it is larger than that press sum. This is not a percentage.'$comment$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_records' AND column_name = 'input_rolls_list'
  ) THEN
    EXECUTE $comment$COMMENT ON COLUMN public.production_records.input_rolls_list IS 'Input rolls for the press. Each roll may include plainSubstrateWastageKg. Balance stays initialWeightKg minus consumedWeightKg. Plain wastage is not subtracted again.'$comment$;
  END IF;
END $$;
