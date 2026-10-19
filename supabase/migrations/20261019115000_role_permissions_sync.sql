-- Restore role_permissions to the live system_settings.role_permissions document
-- captured read-only on 2026-10-19. The prep migration had turned employees
-- and user_management off for roles the plant still has enabled.
--
-- This does not change RLS. Employee, attendance, and salary rows stay
-- limited to Admin and HR & Payroll Manager in the lockdown migration.
-- A matrix flag only controls the screen.
--
-- dispatch, sfg_store, pellet_fuel, and audit_logs are left as the prep
-- migration wrote them when the live document does not mention them.
-- purchase_orders is set afterwards: the live document omitted it for most
-- roles, and a missing key would hide the screen.

UPDATE public.role_permissions AS rp
SET permissions = rp.permissions || live.permissions,
    updated_at = now()
FROM (
  SELECT key AS role, value AS permissions
  FROM jsonb_each($live$
{
  "Admin": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": true,
    "user_management": true,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": true,
    "doc_settings": true,
    "scrap_analytics": true
  },
  "Plant Manager": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": true,
    "user_management": true,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": true,
    "doc_settings": true,
    "scrap_analytics": true
  },
  "HR & Payroll Manager": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": true,
    "user_management": true,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": true,
    "doc_settings": true,
    "scrap_analytics": true,
    "purchase_orders": false
  },
  "Production Manager": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": true,
    "user_management": false,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": true
  },
  "Store Manager": {
    "dashboard": true,
    "production_records": false,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false
  },
  "QC Chemist": {
    "dashboard": true,
    "production_records": true,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "inventory": true,
    "ink_management": true,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "purchase_orders": false
  },
  "Purchase Manager": {
    "dashboard": true,
    "production_records": false,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "purchase_orders": true
  },
  "Sales Manager": {
    "dashboard": true,
    "production_records": false,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": false,
    "vendors": false,
    "inventory": false,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "purchase_orders": false
  },
  "Printing Operator": {
    "dashboard": true,
    "production_records": false,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "inventory": false,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "purchase_orders": false
  },
  "Shop Floor Operator": {
    "dashboard": true,
    "production_records": true,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "inventory": false,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "purchase_orders": false
  }
}
$live$::jsonb)
) AS live
WHERE rp.role = live.role;

-- The running app shows Purchase Orders when the key is missing or true.
-- Admin, Plant Manager, Production Manager, Store Manager, and Purchase
-- Manager are those roles. Roles that stored an explicit false stay hidden.
UPDATE public.role_permissions
SET permissions = permissions || jsonb_build_object(
      'purchase_orders', role IN (
        'Admin',
        'Plant Manager',
        'Production Manager',
        'Store Manager',
        'Purchase Manager'
      )
    ),
    updated_at = now();

-- Admin opens every screen. A missing key would hide it.
UPDATE public.role_permissions
SET permissions = permissions || jsonb_build_object(
      'dashboard', true,
      'production_records', true,
      'sales', true,
      'job_punching', true,
      'orders', true,
      'clients', true,
      'job_masters', true,
      'vendors', true,
      'purchase_orders', true,
      'inventory', true,
      'ink_management', true,
      'material_indents', true,
      'employees', true,
      'user_management', true,
      'cylinders', true,
      'printing_scheduler', true,
      'supabase', true,
      'doc_settings', true,
      'scrap_analytics', true,
      'dispatch', true,
      'sfg_store', true,
      'pellet_fuel', true,
      'audit_logs', true
    ),
    updated_at = now()
WHERE role = 'Admin';
