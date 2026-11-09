-- In-app bug reports.
-- Any active signed-in plant role can file a report and read their own.
-- Admin, including Admin granted through assigned_roles, can read every report
-- and change its status. Screenshots live in the private bug-screenshots bucket.

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

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_auth_id uuid NOT NULL,
  reporter_user_id text NOT NULL,
  reporter_name text NOT NULL,
  reporter_role text NOT NULL,
  title text,
  description text NOT NULL,
  page_url text NOT NULL,
  module text,
  severity text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'New',
  screenshot_paths text[] NOT NULL,
  user_agent text,
  screen_width integer,
  screen_height integer,
  app_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  resolved_at timestamptz,
  CONSTRAINT bug_reports_description_len CHECK (
    char_length(btrim(description)) >= 30
    AND char_length(description) <= 8000
  ),
  CONSTRAINT bug_reports_page_url_nonempty CHECK (
    char_length(btrim(page_url)) > 0
    AND char_length(page_url) <= 2000
  ),
  CONSTRAINT bug_reports_screenshot_required CHECK (
    screenshot_paths IS NOT NULL
    AND cardinality(screenshot_paths) BETWEEN 1 AND 5
    AND NOT ('' = ANY (screenshot_paths))
  ),
  CONSTRAINT bug_reports_severity_known CHECK (
    severity IN ('Low', 'Medium', 'High', 'Critical')
  ),
  CONSTRAINT bug_reports_status_known CHECK (
    status IN ('New', 'In Progress', 'Resolved', 'Won''t Fix')
  ),
  CONSTRAINT bug_reports_title_len CHECK (
    title IS NULL OR char_length(title) <= 160
  )
);

COMMENT ON TABLE public.bug_reports IS
  'Bug reports filed by signed-in staff. Identity columns are stamped from auth.uid().';

COMMENT ON COLUMN public.bug_reports.screenshot_paths IS
  'Object paths in the private bug-screenshots bucket. The first folder is auth.uid().';

CREATE INDEX IF NOT EXISTS bug_reports_reporter_created_idx
  ON public.bug_reports (reporter_auth_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx
  ON public.bug_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS bug_reports_severity_idx
  ON public.bug_reports (severity);

CREATE INDEX IF NOT EXISTS bug_reports_module_idx
  ON public.bug_reports (module);

CREATE OR REPLACE FUNCTION private.stamp_bug_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_roles text[] := private.app_roles();
  v_user_id text;
  v_name text;
  v_role text;
  v_path text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in before reporting a bug' USING ERRCODE = '42501';
  END IF;

  IF v_roles IS NULL OR cardinality(v_roles) = 0 THEN
    RAISE EXCEPTION 'This account cannot report bugs' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT
      u.id,
      coalesce(nullif(pg_catalog.btrim(u.full_name), ''), nullif(pg_catalog.btrim(u.username), ''), nullif(pg_catalog.btrim(u.email), ''), 'User'),
      coalesce(nullif(pg_catalog.btrim(u.role), ''), v_roles[1])
      INTO v_user_id, v_name, v_role
    FROM public.users AS u
    WHERE u.auth_user_id = v_uid
       OR (u.auth_user_id IS NULL AND u.id = v_uid::text)
    ORDER BY (u.auth_user_id = v_uid) DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'This account cannot report bugs' USING ERRCODE = '42501';
    END IF;

    NEW.id := coalesce(NEW.id, pg_catalog.gen_random_uuid());
    NEW.reporter_auth_id := v_uid;
    NEW.reporter_user_id := v_user_id;
    NEW.reporter_name := v_name;
    NEW.reporter_role := pg_catalog.left(v_role, 120);
    NEW.status := 'New';
    NEW.resolution_note := NULL;
    NEW.resolved_at := NULL;
    NEW.created_at := pg_catalog.now();
    NEW.updated_at := NEW.created_at;
    NEW.description := pg_catalog.btrim(coalesce(NEW.description, ''));
    NEW.page_url := pg_catalog.btrim(coalesce(NEW.page_url, ''));
    NEW.title := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(NEW.title, '')), 160), '');
    NEW.module := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(NEW.module, '')), 80), '');
    NEW.severity := coalesce(nullif(pg_catalog.btrim(coalesce(NEW.severity, '')), ''), 'Medium');
    NEW.user_agent := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(NEW.user_agent, '')), 1000), '');
    NEW.app_version := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(NEW.app_version, '')), 200), '');
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb);

    IF NEW.screenshot_paths IS NULL OR cardinality(NEW.screenshot_paths) < 1 THEN
      RAISE EXCEPTION 'At least one screenshot is required' USING ERRCODE = '23514';
    END IF;

    IF cardinality(NEW.screenshot_paths) > 5 THEN
      RAISE EXCEPTION 'At most five screenshots are allowed' USING ERRCODE = '23514';
    END IF;

    FOREACH v_path IN ARRAY NEW.screenshot_paths LOOP
      IF v_path IS NULL
         OR pg_catalog.btrim(v_path) = ''
         OR v_path LIKE '%..%'
         OR split_part(v_path, '/', 1) IS DISTINCT FROM v_uid::text
      THEN
        RAISE EXCEPTION 'Screenshots must be stored under your account' USING ERRCODE = '42501';
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT ('Admin' = ANY (v_roles)) THEN
      RAISE EXCEPTION 'Only an Admin can update a bug report' USING ERRCODE = '42501';
    END IF;

    NEW.id := OLD.id;
    NEW.reporter_auth_id := OLD.reporter_auth_id;
    NEW.reporter_user_id := OLD.reporter_user_id;
    NEW.reporter_name := OLD.reporter_name;
    NEW.reporter_role := OLD.reporter_role;
    NEW.title := OLD.title;
    NEW.description := OLD.description;
    NEW.page_url := OLD.page_url;
    NEW.module := OLD.module;
    NEW.severity := OLD.severity;
    NEW.screenshot_paths := OLD.screenshot_paths;
    NEW.user_agent := OLD.user_agent;
    NEW.screen_width := OLD.screen_width;
    NEW.screen_height := OLD.screen_height;
    NEW.app_version := OLD.app_version;
    NEW.metadata := OLD.metadata;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := pg_catalog.now();
    NEW.resolution_note := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(NEW.resolution_note, '')), 4000), '');

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Resolved', 'Won''t Fix') THEN
      NEW.resolved_at := pg_catalog.now();
    ELSIF NEW.status IN ('New', 'In Progress') THEN
      NEW.resolved_at := NULL;
    ELSE
      NEW.resolved_at := OLD.resolved_at;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_bug_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bug_reports_stamp ON public.bug_reports;
CREATE TRIGGER bug_reports_stamp
  BEFORE INSERT OR UPDATE ON public.bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION private.stamp_bug_report();

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bug_reports FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bug_reports TO authenticated;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.bug_reports FROM authenticated, anon;

DROP POLICY IF EXISTS bug_reports_select ON public.bug_reports;
CREATE POLICY bug_reports_select ON public.bug_reports
  FOR SELECT TO authenticated
  USING (
    reporter_auth_id = (SELECT auth.uid())
    OR (SELECT 'Admin' = ANY (private.app_roles()))
  );

DROP POLICY IF EXISTS bug_reports_insert ON public.bug_reports;
CREATE POLICY bug_reports_insert ON public.bug_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT cardinality(private.app_roles()) > 0)
    AND reporter_auth_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS bug_reports_update ON public.bug_reports;
CREATE POLICY bug_reports_update ON public.bug_reports
  FOR UPDATE TO authenticated
  USING ((SELECT 'Admin' = ANY (private.app_roles())))
  WITH CHECK ((SELECT 'Admin' = ANY (private.app_roles())));

DROP POLICY IF EXISTS bug_reports_delete ON public.bug_reports;

-- Private screenshot bucket. No public read. Owners read their folder.
-- Admin reads every object in this bucket only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-screenshots',
  'bug-screenshots',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      name = EXCLUDED.name;

DROP POLICY IF EXISTS bug_screenshots_select ON storage.objects;
CREATE POLICY bug_screenshots_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-screenshots'
    AND (
      (SELECT 'Admin' = ANY (private.app_roles()))
      OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS bug_screenshots_insert ON storage.objects;
CREATE POLICY bug_screenshots_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-screenshots'
    AND (SELECT cardinality(private.app_roles()) > 0)
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS bug_screenshots_delete ON storage.objects;
CREATE POLICY bug_screenshots_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bug-screenshots'
    AND (SELECT cardinality(private.app_roles()) > 0)
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS bug_screenshots_update ON storage.objects;
