-- Admin can resolve a bug report, and the plant changelog is Admin + Production Manager.
-- implemented_at values are the GitHub merge timestamps of the merged pull requests.
-- Omitted on purpose: #19 (a production deploy of #16), #28 (the same pellet fix as #16),
-- #35 (the same blank-GRN fix as #34), and #20 #22 #23 #24 #26 (path steps finished by #33).
-- seed count: 96

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

COMMENT ON COLUMN public.bug_reports.resolved_by IS
  'auth.uid() of the Admin who set Resolved or Won''t Fix. Cleared when the report is reopened.';

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
    NEW.resolved_by := NULL;
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

    IF NEW.status IN ('Resolved', 'Won''t Fix') THEN
      IF OLD.status IS DISTINCT FROM NEW.status OR OLD.resolved_at IS NULL THEN
        NEW.resolved_at := pg_catalog.now();
      ELSE
        NEW.resolved_at := OLD.resolved_at;
      END IF;
      NEW.resolved_by := coalesce(OLD.resolved_by, v_uid);
    ELSIF NEW.status IN ('New', 'In Progress') THEN
      NEW.resolved_at := NULL;
      NEW.resolved_by := NULL;
    ELSE
      NEW.resolved_at := OLD.resolved_at;
      NEW.resolved_by := OLD.resolved_by;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_bug_report() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implemented_at timestamptz NOT NULL,
  entry_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  pr_number integer,
  module text,
  bug_report_id uuid REFERENCES public.bug_reports (id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT changelog_entries_type_known CHECK (
    entry_type IN ('Added', 'Removed', 'Revised', 'Bug Fixed')
  ),
  CONSTRAINT changelog_entries_title_len CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 160
  ),
  CONSTRAINT changelog_entries_description_len CHECK (
    char_length(btrim(description)) BETWEEN 1 AND 400
  ),
  CONSTRAINT changelog_entries_pr_positive CHECK (
    pr_number IS NULL OR pr_number > 0
  ),
  CONSTRAINT changelog_entries_module_len CHECK (
    module IS NULL OR char_length(module) <= 80
  )
);

COMMENT ON TABLE public.changelog_entries IS
  'Plant changelog. Admin and Production Manager can read it. Only Admin can change it.';

CREATE UNIQUE INDEX IF NOT EXISTS changelog_entries_pr_number_uidx
  ON public.changelog_entries (pr_number)
  WHERE pr_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS changelog_entries_implemented_idx
  ON public.changelog_entries (implemented_at DESC);

CREATE OR REPLACE FUNCTION private.stamp_changelog_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND NOT ('Admin' = ANY (private.app_roles())) THEN
    RAISE EXCEPTION 'Only an Admin can change the changelog' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.title := pg_catalog.left(pg_catalog.btrim(coalesce(NEW.title, '')), 160);
  NEW.description := pg_catalog.left(
    regexp_replace(pg_catalog.btrim(coalesce(NEW.description, '')), '[[:space:]]+', ' ', 'g'),
    400
  );
  NEW.module := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(NEW.module, '')), 80), '');
  NEW.entry_type := pg_catalog.btrim(coalesce(NEW.entry_type, ''));
  IF NEW.pr_number IS NOT NULL AND NEW.pr_number <= 0 THEN
    NEW.pr_number := NULL;
  END IF;
  IF NEW.implemented_at IS NULL THEN
    NEW.implemented_at := pg_catalog.now();
  END IF;
  NEW.updated_at := pg_catalog.now();

  IF TG_OP = 'INSERT' THEN
    NEW.id := coalesce(NEW.id, pg_catalog.gen_random_uuid());
    NEW.created_at := coalesce(NEW.created_at, NEW.updated_at);
    IF v_uid IS NOT NULL THEN
      NEW.created_by := v_uid;
    END IF;
  ELSE
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_changelog_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS changelog_entries_stamp ON public.changelog_entries;
CREATE TRIGGER changelog_entries_stamp
  BEFORE INSERT OR UPDATE OR DELETE ON public.changelog_entries
  FOR EACH ROW
  EXECUTE FUNCTION private.stamp_changelog_entry();

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.changelog_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.changelog_entries TO authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.changelog_entries FROM authenticated, anon;

DROP POLICY IF EXISTS changelog_entries_select ON public.changelog_entries;
CREATE POLICY changelog_entries_select ON public.changelog_entries
  FOR SELECT TO authenticated
  USING (
    (SELECT 'Admin' = ANY (private.app_roles()))
    OR (SELECT 'Production Manager' = ANY (private.app_roles()))
  );

DROP POLICY IF EXISTS changelog_entries_insert ON public.changelog_entries;
CREATE POLICY changelog_entries_insert ON public.changelog_entries
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT 'Admin' = ANY (private.app_roles())));

DROP POLICY IF EXISTS changelog_entries_update ON public.changelog_entries;
CREATE POLICY changelog_entries_update ON public.changelog_entries
  FOR UPDATE TO authenticated
  USING ((SELECT 'Admin' = ANY (private.app_roles())))
  WITH CHECK ((SELECT 'Admin' = ANY (private.app_roles())));

DROP POLICY IF EXISTS changelog_entries_delete ON public.changelog_entries;
CREATE POLICY changelog_entries_delete ON public.changelog_entries
  FOR DELETE TO authenticated
  USING ((SELECT 'Admin' = ANY (private.app_roles())));

INSERT INTO public.changelog_entries (implemented_at, entry_type, title, description, pr_number, module)
VALUES
  ('2026-10-19T07:28:29Z', 'Added', 'Sign-in and role access', 'The plant signs in with Supabase Auth, and each role only sees its own data.', 1, 'Access'),
  ('2026-10-24T02:43:23Z', 'Bug Fixed', 'Saves, boot, and on-screen values', 'Saves finish, the boot loader clears, and the figures on screen match the stored rows.', 2, 'Core'),
  ('2026-10-19T07:51:51Z', 'Bug Fixed', 'Boot loader after sign-in', 'A fresh sign-in finishes the boot loader instead of leaving it up.', 3, 'Access'),
  ('2026-10-20T05:09:08Z', 'Bug Fixed', 'Overdue QC mail loop', 'The overdue QC alert no longer resends in a loop, and a failed send frees its mail slot.', 4, 'Inventory'),
  ('2026-10-23T19:25:33Z', 'Revised', 'Daily email cap', 'Each account can send up to 50 emails a day.', 5, 'Email'),
  ('2026-10-22T00:56:42Z', 'Added', 'Plant data stored in Supabase', 'Orders, stock, production, and the other plant books are saved in Supabase tables.', 6, 'Core'),
  ('2026-10-22T02:00:04Z', 'Bug Fixed', 'Failed SFG saves', 'A semi-finished goods save that fails is reported instead of looking successful.', 7, 'SFG Store'),
  ('2026-10-22T05:12:31Z', 'Revised', 'Outbound mail and role changes', 'Mail goes out only from samyakinternational.in, and a user cannot promote their own role.', 8, 'Access'),
  ('2026-10-22T16:53:21Z', 'Bug Fixed', 'Daily shift attendance', 'Marking the daily shift register shows the employee as present.', 9, 'Employees'),
  ('2026-10-23T19:27:55Z', 'Revised', 'Active user names', 'The header switcher shows usernames.', 10, 'Access'),
  ('2026-10-23T18:30:20Z', 'Revised', 'Secrets and company identity', 'Mail, company identity, and purchase documents come from settings instead of baked-in values.', 11, 'Settings'),
  ('2026-10-23T18:36:59Z', 'Bug Fixed', 'Pellet fuel dialogs', 'Fuel receipt and consumption dialogs open on their own instead of replacing the page.', 12, 'Pellet Fuel'),
  ('2026-10-23T19:09:33Z', 'Added', 'GRN line items', 'A goods receipt can list several items, and older receipts were filled in.', 13, 'Inventory'),
  ('2026-10-23T18:33:49Z', 'Bug Fixed', 'Purchase order names', 'Create Purchase Order shows vendor and inventory names in the dropdowns.', 14, 'Purchase Orders'),
  ('2026-10-23T18:58:55Z', 'Bug Fixed', 'Barcode scan on numeric ids', 'Scanning a barcode no longer crashes when the stock id is numeric.', 15, 'Inventory'),
  ('2026-10-23T19:08:31Z', 'Bug Fixed', 'Pellet fuel receipts', 'Fuel receipts are stored without placeholder data.', 16, 'Pellet Fuel'),
  ('2026-10-23T19:07:03Z', 'Revised', 'Plant defaults in settings', 'The remaining plant defaults are edited in settings.', 17, 'Settings'),
  ('2026-10-23T19:13:54Z', 'Added', 'Job profile GSM and cylinder wear', 'The job profile shows the saved GSM and the live cylinder wear.', 18, 'Job Masters'),
  ('2026-10-23T20:21:53Z', 'Revised', 'Hidden modules and unknown links', 'A role cannot open a module it is not allowed, and an unknown link stays on a not-found page.', 21, 'Access'),
  ('2026-10-23T19:46:56Z', 'Added', 'Extra substrate and child rolls', 'Consume can take an optional second substrate and record child output rolls.', 25, 'Production'),
  ('2026-10-23T20:00:45Z', 'Added', 'Multi-item GRN save', 'Several items on one invoice save as a single goods receipt.', 27, 'Inventory'),
  ('2026-10-23T20:19:23Z', 'Revised', 'Role lockdown', 'Each role keeps the screens it already used, and nothing else was opened up.', 29, 'Access'),
  ('2026-10-24T02:38:44Z', 'Added', 'Production close rules', 'Production records are checked, an order within 10 percent closes itself, and only Admin can close one by hand.', 30, 'Production'),
  ('2026-10-24T02:38:29Z', 'Added', 'Editable GRN lines', 'Invoice lines on a goods receipt can be edited as a list.', 31, 'Inventory'),
  ('2026-10-23T20:31:58Z', 'Bug Fixed', 'Private storage migration', 'Private file buckets no longer stop the migration.', 32, 'Storage'),
  ('2026-10-23T21:05:23Z', 'Added', 'Module paths', 'Each screen has its own address, and the older links still open the same place.', 33, 'Navigation'),
  ('2026-10-24T02:57:48Z', 'Bug Fixed', 'Blank new GRN', 'A new goods receipt starts with vendor, category, and stock item empty.', 34, 'Inventory'),
  ('2026-10-24T04:03:56Z', 'Revised', 'A4 documents', 'Generated PDFs fit A4, and the signature stays with the last rows.', 36, 'Documents'),
  ('2026-10-24T04:06:59Z', 'Added', 'Barcode register', 'One screen lists every barcode stored in the plant.', 37, 'Barcodes'),
  ('2026-10-24T03:57:16Z', 'Bug Fixed', 'Inventory id and health checks', 'The inventory id crash is gone, anonymous health checks are skipped, and duplicate indexes were removed.', 38, 'Inventory'),
  ('2026-10-24T05:53:28Z', 'Revised', 'Letterhead spacing', 'A4 letterheads, signatures, and table spacing are tighter.', 40, 'Documents'),
  ('2026-10-24T11:10:20Z', 'Added', 'Salary advance stages', 'A salary advance moves through request, approval, and disbursal.', 41, 'Employees'),
  ('2026-10-24T11:32:53Z', 'Bug Fixed', 'Cylinder print', 'Printing a cylinder card no longer crashes.', 42, 'Cylinders'),
  ('2026-10-24T13:30:17Z', 'Bug Fixed', 'Salary advance saves', 'Approving or disbursing a salary advance saves.', 43, 'Employees'),
  ('2026-10-26T08:45:19Z', 'Bug Fixed', 'Quotation print', 'A sales quotation prints as a readable A4 page.', 44, 'Sales'),
  ('2026-10-26T09:13:33Z', 'Added', 'Quotation line description', 'Each sales quotation line can carry an optional description.', 45, 'Sales'),
  ('2026-10-26T10:14:15Z', 'Bug Fixed', 'Balance roll dates', 'End Job accepts the balance-roll date instead of rejecting it.', 46, 'Printing'),
  ('2026-10-26T10:18:02Z', 'Added', 'Plain setting and wastage', 'End Job records the plain setting and the wastage for the print.', 47, 'Printing'),
  ('2026-10-26T11:28:17Z', 'Bug Fixed', 'Sidebar on an open record', 'Sidebar links work while a production record is open.', 48, 'Navigation'),
  ('2026-10-26T15:45:56Z', 'Added', 'Purchase order amendments', 'A purchase order can be amended, and each revision is kept.', 49, 'Purchase Orders'),
  ('2026-10-27T01:56:38Z', 'Added', 'Reuse printed SFG', 'Printed semi-finished lots stay in stock and can be used on the next order.', 50, 'SFG Store'),
  ('2026-10-27T02:15:14Z', 'Added', 'Dispatch packing consumption', 'Packing consumption is recorded on the open packing list.', 51, 'Dispatch'),
  ('2026-10-27T01:52:58Z', 'Added', 'Scrap store and high scrap', 'Every job wastage appears in the scrap store, with a registry for scrap above 5 percent.', 52, 'Scrap'),
  ('2026-10-27T04:15:13Z', 'Revised', 'Consume machine from process', 'The consume target machine follows the process that was selected.', 53, 'Production'),
  ('2026-10-27T04:19:11Z', 'Added', 'Scrap filters and export', 'The scrap store filters by date in IST and exports a CSV.', 54, 'Scrap'),
  ('2026-10-27T05:41:44Z', 'Bug Fixed', 'Mass balance remainder', 'The leftover from a consume stays on the same lot.', 55, 'Production'),
  ('2026-10-28T03:37:52Z', 'Added', 'Job master guardrails', 'A production record cannot drift away from its job master.', 56, 'Job Masters'),
  ('2026-10-28T09:55:30Z', 'Revised', 'Bulk stock CSV', 'The bulk stock upload uses generated ids and records film rolls.', 57, 'Inventory'),
  ('2026-10-30T08:44:45Z', 'Added', 'Printing deadline reminder', 'The plant is reminded when an order is due before printing has started.', 58, 'Orders'),
  ('2026-10-30T09:18:35Z', 'Bug Fixed', 'Duplicate ledgers and QC lock', 'A stock item keeps one ledger, and a GRN locks after QC approval.', 59, 'Inventory'),
  ('2026-10-30T09:07:08Z', 'Bug Fixed', 'Raw material balance', 'The purchase balance for raw material no longer exceeds the gross requirement.', 60, 'Orders'),
  ('2026-10-30T08:50:05Z', 'Revised', 'Deadline reminder audience', 'The due-date reminder goes only to Admin and Sales Manager.', 61, 'Orders'),
  ('2026-10-30T09:41:19Z', 'Added', 'Several roles on one user', 'One person can be assigned more than one plant role.', 62, 'Access'),
  ('2026-10-30T09:34:44Z', 'Bug Fixed', 'Job punching form', 'The job punching form opens without a missing-icon crash.', 63, 'Job Punching'),
  ('2026-10-30T09:48:14Z', 'Revised', 'GRN purchase suggestion', 'A goods receipt suggests a vendor purchase order instead of filling it in.', 64, 'Inventory'),
  ('2026-10-30T18:09:04Z', 'Bug Fixed', 'Delivery challan print', 'The delivery challan fills an A4 page and no longer prints blank.', 65, 'Dispatch'),
  ('2026-10-31T04:17:28Z', 'Added', 'Roll weights on bulk CSV', 'Bulk stock rolls can include gross, tare, and core weight.', 66, 'Inventory'),
  ('2026-10-31T04:17:42Z', 'Added', 'Printing deadline escalation', 'Printing deadlines escalate with blockers and a daily summary.', 67, 'Printing'),
  ('2026-10-31T05:36:17Z', 'Revised', 'Printing deadline lists', 'The printing deadline lists collapse and page.', 68, 'Printing'),
  ('2026-10-31T06:02:01Z', 'Revised', 'Active user switch', 'Only the signed-in Admin can switch the active user.', 69, 'Access'),
  ('2026-10-31T06:10:38Z', 'Added', 'Consumables Excel', 'The consumables stock store downloads as Excel.', 70, 'Inventory'),
  ('2026-10-31T06:19:48Z', 'Bug Fixed', 'Ink HSN on purchase orders', 'A saved ink HSN is used on the purchase order instead of looking missing.', 71, 'Ink'),
  ('2026-10-31T06:27:53Z', 'Revised', 'Wastage source column', 'Record Source and ID sit at the end of the wastage table.', 72, 'Scrap'),
  ('2026-10-31T08:49:48Z', 'Bug Fixed', 'Ledger match and stock delete', 'The item ledger matches the stock, and deleting an item removes its rolls.', 73, 'Inventory'),
  ('2026-10-31T10:27:47Z', 'Revised', 'Archive used stock', 'A used stock item is archived so its history stays.', 74, 'Inventory'),
  ('2026-10-31T10:56:13Z', 'Added', 'Order CSV reports', 'Pending and overdue orders can be downloaded as CSV.', 75, 'Orders'),
  ('2026-10-31T11:17:13Z', 'Bug Fixed', 'Role landing and own audit', 'A restricted role lands on its own screen, and an audit row records that action.', 76, 'Access'),
  ('2026-10-31T12:45:19Z', 'Bug Fixed', 'Print run without closing the order', 'An operator can start and end a print run without closing the order.', 77, 'Printing'),
  ('2026-10-31T19:51:00Z', 'Bug Fixed', 'GRN rolls on the right item', 'Rolls on a goods receipt attach to the exact stock item.', 78, 'Inventory'),
  ('2026-11-01T17:24:01Z', 'Revised', 'Operator modules', 'Printing and shop-floor operators keep inventory and printing, and the SFG store is view-only.', 79, 'Access'),
  ('2026-11-02T03:27:29Z', 'Added', 'One print run and idle time', 'A machine has one active print run, and run and idle time are recorded.', 80, 'Printing'),
  ('2026-11-02T14:47:32Z', 'Added', 'Film consumption on the ledger', 'Film used by a print run is posted to the item ledger when the run ends.', 81, 'Inventory'),
  ('2026-11-03T04:15:10Z', 'Bug Fixed', 'QC mail on inventory open', 'Opening inventory no longer emails QC overdue alerts.', 82, 'Inventory'),
  ('2026-11-03T04:39:56Z', 'Bug Fixed', 'Barcode reads and Lock', 'The barcode register loads, mail auth holds, and the Lock control no longer crashes.', 83, 'Barcodes'),
  ('2026-11-03T04:53:55Z', 'Revised', 'Admin audit and a second print run', 'Admin actions are written to the audit log, and a second open print run is blocked.', 84, 'Printing'),
  ('2026-11-03T10:12:04Z', 'Revised', 'Write access by role', 'Indents, GRN QC, and pellet fuel can be changed only by the roles that own them.', 85, 'Access'),
  ('2026-11-03T10:14:58Z', 'Bug Fixed', 'SFG list search and paging', 'Search and paging on the SFG and FG store cover every batch.', 86, 'SFG Store'),
  ('2026-11-03T10:08:27Z', 'Bug Fixed', 'CCPET density on press end', 'Ending a press run works when the CCPET density is already on the stock item.', 87, 'Printing'),
  ('2026-11-03T10:30:00Z', 'Added', 'Recorded people on documents', 'The indent slip and other documents show the people who recorded them.', 88, 'Documents'),
  ('2026-11-03T11:15:09Z', 'Removed', 'Scrap barcodes', 'SFG and FG scrap no longer receive a barcode.', 89, 'Barcodes'),
  ('2026-11-03T11:19:28Z', 'Added', 'Operator print finish', 'An operator can finish a print run and see the output rolls.', 90, 'Printing'),
  ('2026-11-05T09:53:10Z', 'Added', 'Delete an inward QC inspection', 'Admin can delete an inward QC inspection.', 91, 'Inventory'),
  ('2026-11-05T10:12:50Z', 'Added', 'Password reset result', 'The screen says whether the password reset email was sent.', 92, 'Access'),
  ('2026-11-05T17:38:53Z', 'Revised', 'Barcode sticker weights', 'Barcode stickers show kilograms and the stored meters.', 93, 'Barcodes'),
  ('2026-11-05T17:43:36Z', 'Bug Fixed', 'Queue reorder', 'Reordering the press queue no longer opens the active print run.', 94, 'Printing'),
  ('2026-11-09T11:35:35Z', 'Added', 'Entered meters on rolls', 'Each printed roll and balance roll stores the meters that were entered.', 95, 'Printing'),
  ('2026-11-09T12:48:54Z', 'Bug Fixed', 'Ready for dispatch', 'Ready for dispatch counts finished goods only.', 96, 'Dispatch'),
  ('2026-11-09T18:24:52Z', 'Bug Fixed', 'Cylinder cost and artwork', 'Per-cylinder cost no longer inflates, artwork matches the job, and the default rate is ₹1.80.', 97, 'Cylinders'),
  ('2026-11-09T12:21:41Z', 'Added', 'Icon rail', 'The main menu collapses to an icon rail.', 98, 'Navigation'),
  ('2026-11-09T14:04:23Z', 'Added', 'In-app bug reports', 'Any signed-in user can file a bug with a screenshot and follow it under My Bug Reports.', 99, 'Bug Reports'),
  ('2026-11-09T14:32:11Z', 'Revised', 'Operator SFG view', 'Operators stay view-only in the SFG store, and balance receipts show on the item ledger.', 100, 'SFG Store'),
  ('2026-11-09T18:24:58Z', 'Revised', 'Newest SFG and FG first', 'The SFG and FG store lists the newest lots first.', 101, 'SFG Store'),
  ('2026-11-10T01:46:33Z', 'Revised', 'Report a Bug placement', 'One Report a Bug button sits at the bottom of the sidebar.', 102, 'Bug Reports'),
  ('2026-11-10T05:13:00Z', 'Bug Fixed', 'Consume mass balance', 'Lamination and printing count every input that stays in the roll.', 103, 'Production'),
  ('2026-11-10T06:59:31Z', 'Bug Fixed', 'Cylinder SKU allocation', 'The next SKU-CYL number follows the highest one, and a new row cannot reuse a code that is already stored.', 104, 'Cylinders'),
  ('2026-11-10T07:05:04Z', 'Revised', 'SFG and FG store layout', 'Expanded job-order rows keep barcodes, child rolls, weights, and actions readable. Store data and sort order stay the same.', 106, 'SFG Store')
ON CONFLICT DO NOTHING;
