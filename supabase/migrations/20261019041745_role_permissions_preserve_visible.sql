-- dispatch, sfg_store and pellet_fuel are not in the live
-- system_settings.role_permissions JSON. The current app treats a missing
-- key as visible, so every role sees those screens. The prep seed stored
-- false for several roles, which the new app would hide.
--
-- Set the three keys true on every role. Leave audit_logs unchanged:
-- the sidebar shows it only for Admin, and that flag is already true
-- only on the Admin row.
--
-- Other keys were compared with the live JSON and the current sidebar.
-- Explicit true and false values already match what the current app
-- shows. user_management stays as the sync migration left it; the
-- sidebar still opens that screen only for Admin.

UPDATE public.role_permissions
SET permissions = permissions || jsonb_build_object(
      'dispatch', true,
      'sfg_store', true,
      'pellet_fuel', true
    ),
    updated_at = now();
