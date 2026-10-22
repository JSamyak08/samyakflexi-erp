-- Attendance saves send overtime_start_time and overtime_end_time.
-- The baseline employee_attendance table has overtime hours and reason,
-- but not the time-window columns, so PostgREST rejected the upsert
-- (PGRST204) and the Daily Shift Register never stored the mark.
-- Additive and empty for existing rows.

ALTER TABLE public.employee_attendance ADD COLUMN IF NOT EXISTS overtime_start_time text;
ALTER TABLE public.employee_attendance ADD COLUMN IF NOT EXISTS overtime_end_time text;
