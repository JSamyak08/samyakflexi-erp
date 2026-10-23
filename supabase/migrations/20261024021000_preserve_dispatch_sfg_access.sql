-- dispatch and sfg_store were forced on in the client for every role.
-- Keep that access by storing an explicit true. Other keys are left as they are.
-- Idempotent: a role that already has both keys true is not rewritten.

UPDATE public.role_permissions
SET permissions = COALESCE(permissions, '{}'::jsonb)
      || jsonb_build_object('dispatch', true, 'sfg_store', true),
    updated_at = now()
WHERE COALESCE(permissions -> 'dispatch', 'false'::jsonb) IS DISTINCT FROM 'true'::jsonb
   OR COALESCE(permissions -> 'sfg_store', 'false'::jsonb) IS DISTINCT FROM 'true'::jsonb;
