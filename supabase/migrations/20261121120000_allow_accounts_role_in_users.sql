-- Allow Accounts Manager and Accounts in public.users check constraint
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_allowed;
ALTER TABLE public.users ADD CONSTRAINT users_role_allowed CHECK (
  role IS NULL
  OR role IN (
    'Admin',
    'Plant Manager',
    'Production Manager',
    'Sales Manager',
    'Purchase Manager',
    'Store Manager',
    'QC Chemist',
    'Printing Operator',
    'Shop Floor Operator',
    'HR & Payroll Manager',
    'Accounts Manager',
    'Accounts',
    'System'
  )
);
