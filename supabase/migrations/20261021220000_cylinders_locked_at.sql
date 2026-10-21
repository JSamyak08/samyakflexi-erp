-- Cylinder saves send locked_at. The baseline cylinders table has is_locked
-- and locked_by, but not the lock timestamp, so the upsert was rejected.
-- Additive and empty for existing rows.

ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS locked_at text;
