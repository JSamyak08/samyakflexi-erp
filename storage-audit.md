# FlexiERP storage audit

Date: 21 October 2026. Branch: `cursor/supabase-storage-audit-9a94`.

Supabase Auth session keys (`sb-*`), the connection override (`samyak_supabase_url`, `samyak_supabase_key`), the login lockout counters, the Admin role-preview flag, and the weighing-scale device config stay in the browser. No theme, sidebar-collapsed, or last-tab preference was found.

A hard refresh used to drop records because the screen updated first, the database write failed or saved a thinner row, and the next load replaced the screen with the table. Several modules also copied the same list into `system_settings` and then ignored that copy once the table had any older rows.

## What stays in the browser

| Key | What it is | Why it stays |
| --- | --- | --- |
| `sb-*` | Supabase Auth session | Required by the Auth client |
| `samyak_supabase_url`, `samyak_supabase_key` | Optional connection override | Not business data |
| `auth_failed_attempts`, `auth_lockout_until` | Login lockout | Session only |
| `samyak_erp_ui_role_preview` | Admin "view as role" | UI only |
| `samyak_erp_scale_config` | This workstation's scale | Device preference |
| `samyak_company_logo`, `samyak_authorised_signature`, `samyak_doc_prefixes`, `samyak_doc_terms`, `samyak_coa_signatories`, `samyak_material_cost_settings`, `samyak_processing_rates`, `samyak_inventory_ageing_settings`, `samyak_storage_bays_master`, `samyak_film_substrates_master`, `samyak_email_settings`, `samyak_email_templates` | Read-through cache of settings | Written only after the database save succeeds. The document-number counter is the exception: it advances in this cache immediately so two clicks in one session do not reuse a number, then the same value is saved to `system_settings`. A failed save shows an alert. |

`safeLocalStorageSet` now refuses business keys, including `samyak_cache_*` and `samyak_erp_jobcard_settings_*`, so they are not copied into IndexedDB either.

## Inventory

Risk is what happened before this change. "Refresh" means a hard refresh of the page.

| Module | Screen | Data | Where it lived | Survived refresh | Risk |
| --- | --- | --- | --- | --- | --- |
| Orders | Job punching, order list | Job orders | `orders` plus a minimal-row retry, and `samyak_cache_orders` | Only the columns the retry managed to store | Full job details vanished |
| Job masters / cylinders | Job card, cylinder directory | Job master, cylinder, job-card spec | Tables with a minimal retry; job-card spec in `localStorage` and `system_settings` `jobcard_*`; `Promise.allSettled` hid failures | Job master/cylinder sometimes; spec no | Spec and dropped columns vanished; the screen still said saved |
| Sales | Quotations | Quotation | `sales_quotations`, but the screen started from `samyak_erp_sales_quotations` | Yes, once the table write worked | Stale browser list shown first; `terms_template_key` was not a column |
| Clients | Client directory | Clients | `clients` | Yes | Low |
| Vendors | Vendor directory | Vendor, GSTIN, bank, payment terms | `vendors` without `payment_terms` or `bank_details`. On error the save retried with name fields only | Name and category only | GSTIN, contact, phone, email, and address were dropped. Blank bank details were filled with a fake HDFC account |
| Purchase | Purchase orders, order desk, ink desk | Purchase orders | `purchase_orders` and a second copy in `system_settings` (`purchase_orders`, `samyak_erp_issued_pos`). Delete ignored the database error. Ink dates were `dd/mm/yyyy` | Often, because the fetch merged both copies | The two copies diverged. A date that is not ISO failed once the settings copy was no longer a fallback |
| Inventory | GRN, stock ledger, barcodes, reconciliation | Stock adjustments, custom barcodes, PO rate resolutions, store issues | React state, `localStorage`, and `system_settings`. Reconciliation and bulk import never wrote the adjustment list | No | Adjustments and barcodes vanished |
| Inventory | Indents, consumables, machine issues | Those three lists | `system_settings` blobs, then copied into `samyak_cache_*` | Only while the blob write succeeded | A failed or oversized blob disappeared on refresh |
| Store | Issue / return | Issue transactions | Same settings blob | Same | Same |
| SFG / FG | QC hold and scrap | Hold tags and scrap items | State, `localStorage`, and `system_settings`. A mount effect wrote the current state, often `[]`, back to the server | No, and a refresh could wipe the server copy | Opening the screen could erase hold and scrap |
| Scrap analytics | Scrap store | Same scrap items | Read `localStorage` only | No | The scrap screen and the store screen diverged |
| Production | Scrap disposal | Disposal notes | `scrap_disposals` exists, but the screen wrote `localStorage` and `system_settings` | No | Disposals vanished |
| Printing | Scheduler queue | Queue, machine assignment, running job | `system_settings` keys `printing_press_*` | Only if that write succeeded | Queue vanished or lagged the table |
| Dispatch | Shipments, challans, CoA | Shipment, challan, certificate | Tables, but a failed write was copied to `system_settings` and the fetch ignored that copy when the table was non-empty. Dispatch was missing `payload` and several columns the client sent | Existing table rows only | New shipments, challans, and certificates vanished |
| Dispatch | CoA templates | Custom material templates | `samyak_coa_templates` only. `material_structure_templates` already existed | No | Custom templates vanished |
| Pellets | Fuel inward and consumption | Pellet GRN and burn log | No tables on `main`. Save fell back to `system_settings` and the fetch preferred the empty table | No | Every pellet entry vanished |
| HR | Employees, attendance, advances, payments | Payroll | Real tables. Settings copies are blocked | Yes | Old settings copies are not the live source |
| Users | User directory | Users | `users`, with a minimal retry. Leftover `USR-SETTING-*` rows have no JSON payload | Directory yes | A thin retry could drop fields. The leftover rows are not deleted |
| Settings | Document settings | Prefixes, terms, logo, signature, rates, ageing, bays, substrates, email templates, routing | `system_settings` or dedicated tables, but the browser was written first and remote errors were swallowed | Only if the remote write happened to work | The screen said saved when the database rejected it. SMTP password is not stored |
| Audit | Audit log | Audit entries | `localStorage`, then `audit_logs`, then a `system_settings` blob | Unreliable | A failed table write looked successful |
| Notifications | QC variance | In-app notices | `samyak_erp_notifications` only, and nothing in the UI reads them | No | Notices vanished. They are now stored in `erp_notifications` and are still not shown |
| Ink / film rates | Job punching | Processing rates | Settings, local first | Unreliable | A rate change could be lost |
| Auth | Login | Session and lockout | Auth localStorage and sessionStorage | Session yes | Left as-is |

## What changed

Business lists now have their own tables. Saves write that table and update the screen only after the write succeeds. A database error is shown. There is no second copy in `system_settings` and no "saved locally" success path.

On login, the browser reads any leftover business keys and `system_settings` blobs, inserts rows whose id (or PO number) is not already in the table, then deletes those browser keys. If the upload throws, the keys stay and the user is told. Vendor rows that already exist are updated only where GSTIN, payment terms, bank details, contact, phone, email, or address is blank.

The SQL migration does the same copy from `system_settings` into the tables. It does not delete the old keys, so a rollback can still see them. A second run does not duplicate rows.

## Migration

File: `supabase/migrations/20261021180000_persist_business_records.sql`

- `vendors.payment_terms`, `vendors.bank_details`
- `sales_quotations.terms_template_key`
- `dispatch_shipments.id`, `transporter_name`, `po_no`, `invoice_no`, `hide_branding`, `payload`, `updated_at`
- New tables, each `id text` primary key plus `payload jsonb`, with RLS enabled and the same open `anon` / `authenticated` policy the live tables use today: `stock_adjustments`, `custom_barcodes`, `po_discrepancy_resolutions`, `sfg_qc_hold_items`, `sfg_scrap_items`, `material_indents`, `machine_issues`, `consumables`, `store_issue_transactions`, `erp_notifications`, `job_card_specs`
- `press_board` for the printing queue
- `pellet_inwards` and `pellet_consumptions`
- One-time `INSERT ... WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING` from the old settings keys
- Helper functions are created for the copy and dropped at the end

`supabase/manual/20261019120000_auth_rls_lockdown.sql` lists the new tables in `install_module_access`. That file is still manual and is not a migration.

Existing migration files were not edited.

## Data-loss risk for records already entered

- A purchase order, shipment, or other row that already has the same id or PO number in its table is left as the server stored it. A newer copy that exists only in the browser or in `system_settings` is not applied over it.
- Vendor fields that are already filled are not overwritten. Blank GSTIN and the other blank contact fields are filled from the browser copy.
- If the SFG screen already saved an empty hold or scrap list over the previous blob, that previous list is gone. This change stops the wipe; it cannot restore a list that was overwritten.
- `USR-SETTING-*` rows in `users` are left in place. They have no JSON column, so they cannot be migrated.
- Old settings keys are left in place. New code refuses to write business keys there.
- If this app is deployed before the migration runs, saves that need the new columns or tables fail with an error instead of storing a partial row.

## Overlap with draft PR #2

PR #2 (`cursor/fix-functional-bugs-7215`) also creates `pellet_inwards` and `pellet_consumptions`, but its policies call `private.can_any` from the unmerged lockdown. This migration uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`, and the open policy. PR #2 drops that open pellet policy when it runs. Both branches edit `App.jsx`, `supabaseDataService.js`, and several of the same screens. This branch is based on `main`, not on PR #2. PR #5 (email cap) does not touch storage.

## What was tested

`npm test` runs six Node tests. Five check the browser-copy import (one row per id, vendor blank-fill, no duplicate PO, business keys refused). One applies `20261021180000_persist_business_records.sql` twice on embedded Postgres (PGlite) with stub tables: the vendor columns exist, the settings purchase order is copied once, the live purchase order is unchanged, RLS is on for the new pellet and press tables, and the helper functions are gone.

Docker and the Supabase CLI are not available here, so this was not run against `supabase start` and not in a browser. Production was not written to, and `/inventory`, `/api/send-email`, and `/api/recover-password` were not called. `vite build` completes.

## Other bugs noted, not all fixed here

- Vendor save claimed success before the database returned, and a blank bank line became a fake HDFC account. Both are fixed in this branch.
- RLS on the live tables is still the open anon policy (known B-003). The lockdown stays in `supabase/manual/`.
- Opening Inventory still sends QC-overdue emails (known B-026). That screen was not opened on production.
- Company GSTIN constants still disagree across files (known B-030). Not changed.
- In-app notices are now stored and still have no screen that lists them.
- `fetchFilmSubstratesFromSupabase` still reads `film_substrates_master` when the table is empty, so an old custom list remains visible. New saves go to `film_substrates` only.
