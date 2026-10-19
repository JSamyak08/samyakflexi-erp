-- Baseline public schema for FlexiERP, captured read-only from project
-- eamstsaqkbeiywfaanhi on 2026-10-19. Tables already exist in production;
-- statements are idempotent and do not grant access or recreate policies.
-- The view high_scrap_audit_registry is created in the lockdown migration
-- as security_invoker. Do not add anon policies to this file.

CREATE SCHEMA IF NOT EXISTS public;

DO $$ BEGIN
  CREATE TYPE public.sfg_process_type AS ENUM (
    'Printed Rolls',
    'Laminated Rolls (First Pass) for Roll Form',
    'Laminated Rolls (First Pass) for Pouch Form',
    'Laminated Rolls (Second Pass) for Pouch Form'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fg_process_type AS ENUM (
    'Laminated Rolls (First Pass) for Roll Form',
    'Laminated Rolls (Second Pass) for Roll Form'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public."Samyak International Ltd" (
  "id" bigint PRIMARY KEY,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public."Samyak International Ltd" ADD COLUMN IF NOT EXISTS "id" bigint;
ALTER TABLE public."Samyak International Ltd" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."Samyak International Ltd" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."audit_logs" (
  "id" text PRIMARY KEY,
  "username" text DEFAULT 'System'::text,
  "user_role" text DEFAULT 'Admin'::text,
  "action_type" text DEFAULT 'UPDATE'::text,
  "module" text DEFAULT 'System'::text,
  "details" text DEFAULT ''::text,
  "target_id" text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "user_role" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "action_type" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "module" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "details" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "target_id" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."certificate_of_analyses" (
  "id" text PRIMARY KEY,
  "coa_no" text,
  "job_name" text,
  "customer_name" text,
  "payload" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "coa_no" text;
ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "customer_name" text;
ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."certificate_of_analyses" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."certificate_of_analyses" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."clients" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "gstin" text,
  "address" text,
  "payment_terms" text,
  "contact_person" text,
  "phone" text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "gstin" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "payment_terms" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "contact_person" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."clients" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."coa_reports" (
  "id" text PRIMARY KEY,
  "coa_no" text NOT NULL,
  "test_date" text,
  "customer_name" text,
  "job_name" text,
  "invoice_ref_no" text,
  "batch_lot_no" text,
  "film_type" text,
  "net_weight" text,
  "structure_specification" text,
  "size_width" text,
  "thickness_micron" text,
  "overall_status" text DEFAULT 'PASSED & APPROVED'::text,
  "qc_inspector" text,
  "approved_by_head" text,
  "remarks" text,
  "parameters" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "coa_no" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "test_date" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "customer_name" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "invoice_ref_no" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "batch_lot_no" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "net_weight" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "structure_specification" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "size_width" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "thickness_micron" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "overall_status" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "qc_inspector" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "approved_by_head" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "remarks" text;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "parameters" jsonb;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."coa_reports" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."coa_reports" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."cylinders" (
  "id" text PRIMARY KEY,
  "sku" text,
  "job_name" text NOT NULL,
  "colors_count" integer,
  "cylinder_cost" text,
  "cost_per_cylinder" text,
  "rate_per_sq_inch" numeric DEFAULT 1.6,
  "engravures_name" text,
  "cost_borne_by" text,
  "cost_borne_type" text,
  "client_group" text,
  "circumference_mm" numeric,
  "face_length_mm" numeric,
  "layer1_printed_qty_kg" numeric DEFAULT 0,
  "dispatched_qty" numeric DEFAULT 0,
  "utilisation_limit" numeric DEFAULT 10000,
  "status" text DEFAULT 'Active In-Use'::text,
  "artwork_url" text,
  "created_at" timestamptz DEFAULT now(),
  "sil_logo" text DEFAULT 'Yes - ''Pkg Material Mfg by - Samyak International Ltd'''::text,
  "arc_mark" text DEFAULT 'Yes'::text,
  "slitting_mark" text DEFAULT 'Yes'::text,
  "tracker_line" text DEFAULT 'Yes'::text,
  "special_instructions" text DEFAULT ''::text,
  "press_marks" jsonb DEFAULT '{}'::jsonb,
  "layers" jsonb DEFAULT '[]'::jsonb,
  "structure" text,
  "pouch_open_width" numeric,
  "pouch_height" numeric,
  "job_master_id" text,
  "assigned_press" text,
  "approved_by_head" boolean DEFAULT false,
  "approved_head_name" text,
  "approved_head_date" text,
  "chk_eyemark" boolean DEFAULT false,
  "chk_barcode" boolean DEFAULT false,
  "chk_orientation" boolean DEFAULT false,
  "chk_client_approval" boolean DEFAULT false,
  "job_card_file_name" text,
  "job_card_file_url" text,
  "print_width_mm" numeric,
  "variant" text DEFAULT 'Standard'::text,
  "printing" text DEFAULT 'Reverse'::text,
  "invoice_to" text DEFAULT 'Samyak International Ltd'::text,
  "shell_size" text,
  "pet_size" text,
  "is_locked" boolean DEFAULT false,
  "locked_by" text,
  "changelogs" jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "sku" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "colors_count" integer;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "cylinder_cost" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "cost_per_cylinder" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "rate_per_sq_inch" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "engravures_name" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "cost_borne_by" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "cost_borne_type" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "client_group" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "circumference_mm" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "face_length_mm" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "layer1_printed_qty_kg" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "dispatched_qty" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "utilisation_limit" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "artwork_url" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "sil_logo" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "arc_mark" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "slitting_mark" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "tracker_line" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "special_instructions" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "press_marks" jsonb;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "layers" jsonb;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "structure" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "pouch_open_width" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "pouch_height" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "job_master_id" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "assigned_press" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "approved_by_head" boolean;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "approved_head_name" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "approved_head_date" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "chk_eyemark" boolean;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "chk_barcode" boolean;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "chk_orientation" boolean;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "chk_client_approval" boolean;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "job_card_file_name" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "job_card_file_url" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "print_width_mm" numeric;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "variant" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "printing" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "invoice_to" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "shell_size" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "pet_size" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "is_locked" boolean;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "locked_by" text;
ALTER TABLE public."cylinders" ADD COLUMN IF NOT EXISTS "changelogs" jsonb;
ALTER TABLE public."cylinders" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."delivery_challans" (
  "id" text PRIMARY KEY,
  "challan_no" text,
  "client_name" text,
  "payload" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "party_type" text DEFAULT 'Client'::text,
  "challan_nature" text DEFAULT 'Returnable Material'::text,
  "freight_charges" numeric DEFAULT 0,
  "return_status" text DEFAULT 'Outbound (Pending Return)'::text,
  "total_returned_qty" numeric DEFAULT 0
);

ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "challan_no" text;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "party_type" text;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "challan_nature" text;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "freight_charges" numeric;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "return_status" text;
ALTER TABLE public."delivery_challans" ADD COLUMN IF NOT EXISTS "total_returned_qty" numeric;
ALTER TABLE public."delivery_challans" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."dispatch_shipments" (
  "dispatch_id" text PRIMARY KEY,
  "order_id" text,
  "job_name" text NOT NULL,
  "client_name" text NOT NULL,
  "vehicle_no" text,
  "lr_no" text,
  "dispatch_date" timestamptz DEFAULT now(),
  "total_rolls" integer DEFAULT 0,
  "total_net_weight_kg" numeric DEFAULT 0,
  "total_gross_weight_kg" numeric DEFAULT 0,
  "items" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "party_name" text,
  "challan_nature" text DEFAULT 'Sale of Goods'::text,
  "purpose_of_movement" text,
  "uom" text DEFAULT 'Kg'::text,
  "return_inward_history" jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "dispatch_id" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "vehicle_no" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "lr_no" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "dispatch_date" timestamptz;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "total_rolls" integer;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "total_net_weight_kg" numeric;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "total_gross_weight_kg" numeric;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "items" jsonb;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "party_name" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "challan_nature" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "purpose_of_movement" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "uom" text;
ALTER TABLE public."dispatch_shipments" ADD COLUMN IF NOT EXISTS "return_inward_history" jsonb;
ALTER TABLE public."dispatch_shipments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."email_settings" (
  "id" text PRIMARY KEY,
  "smtp_host" text DEFAULT 'smtp.hostinger.com'::text NOT NULL,
  "smtp_port" integer DEFAULT 465 NOT NULL,
  "smtp_secure" boolean DEFAULT true NOT NULL,
  "smtp_user" text DEFAULT 'admin@samyakinternational.in'::text NOT NULL,
  "smtp_pass" text DEFAULT ''::text NOT NULL,
  "sender_name" text DEFAULT 'Samyak International ERP'::text NOT NULL,
  "admin_email" text DEFAULT 'admin@samyakinternational.in'::text,
  "plant_manager_email" text DEFAULT 'plant.manager@plant.com'::text,
  "purchase_email" text DEFAULT 'purchase@samyakinternational.in'::text,
  "dispatch_email" text DEFAULT 'dispatch@samyakinternational.in'::text,
  "created_at" timestamptz DEFAULT now(),
  "last_updated" timestamptz DEFAULT now()
);

ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "smtp_host" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "smtp_port" integer;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "smtp_secure" boolean;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "smtp_user" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "smtp_pass" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "sender_name" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "admin_email" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "plant_manager_email" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "purchase_email" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "dispatch_email" text;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."email_settings" ADD COLUMN IF NOT EXISTS "last_updated" timestamptz;
ALTER TABLE public."email_settings" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."email_templates" (
  "key" text PRIMARY KEY,
  "name" text NOT NULL,
  "event_title" text NOT NULL,
  "subject" text NOT NULL,
  "badge_text" text,
  "badge_bg_color" text DEFAULT '#0284c7'::text,
  "to_email" text,
  "cc_email" text,
  "enabled" boolean DEFAULT true,
  "content_html" text NOT NULL,
  "footer_note" text,
  "created_at" timestamptz DEFAULT now(),
  "last_updated" timestamptz DEFAULT now()
);

ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "key" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "event_title" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "subject" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "badge_text" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "badge_bg_color" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "to_email" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "cc_email" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "enabled" boolean;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "content_html" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "footer_note" text;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."email_templates" ADD COLUMN IF NOT EXISTS "last_updated" timestamptz;
ALTER TABLE public."email_templates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."employee_attendance" (
  "id" text PRIMARY KEY,
  "employee_id" text NOT NULL,
  "date" date NOT NULL,
  "shift_type" text,
  "shift_hours" numeric DEFAULT 12,
  "status" text NOT NULL,
  "check_in" text,
  "check_out" text,
  "total_hours_worked" numeric DEFAULT 0,
  "overtime_hours" numeric DEFAULT 0,
  "overtime_reason" text,
  "overtime_status" text DEFAULT 'Pending Approval'::text,
  "overtime_approved_by" text,
  "overtime_approved_date" text,
  "dinner_allowance_eligible" boolean DEFAULT false,
  "marked_by" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "pto_hours" numeric DEFAULT 0
);

ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "employee_id" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "date" date;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "shift_type" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "shift_hours" numeric;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "check_in" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "check_out" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "total_hours_worked" numeric;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "overtime_hours" numeric;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "overtime_reason" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "overtime_status" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "overtime_approved_by" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "overtime_approved_date" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "dinner_allowance_eligible" boolean;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "marked_by" text;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."employee_attendance" ADD COLUMN IF NOT EXISTS "pto_hours" numeric;
ALTER TABLE public."employee_attendance" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."employees" (
  "id" text PRIMARY KEY,
  "emp_code" text NOT NULL,
  "full_name" text NOT NULL,
  "gender" text,
  "dob" text,
  "phone" text,
  "email" text,
  "department" text NOT NULL,
  "designation" text NOT NULL,
  "joining_date" text,
  "status" text DEFAULT 'Active'::text,
  "shift_duration_hours" numeric DEFAULT 12,
  "default_shift" text DEFAULT 'Shift A: Day (08:00 - 20:00)'::text,
  "address" text,
  "aadhar_no" text,
  "pan_no" text,
  "uan_no" text,
  "esic_no" text,
  "emergency_contact" text,
  "bank_details" jsonb DEFAULT '{}'::jsonb,
  "salary_structure" jsonb DEFAULT '{}'::jsonb,
  "offboarding" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "emp_code" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "gender" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "dob" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "designation" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "joining_date" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "shift_duration_hours" numeric;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "default_shift" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "aadhar_no" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "pan_no" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "uan_no" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "esic_no" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "emergency_contact" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "bank_details" jsonb;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "salary_structure" jsonb;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "offboarding" jsonb;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."employees" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."fg_goods" (
  "id" uuid PRIMARY KEY,
  "fg_batch_code" text NOT NULL,
  "fg_type" text NOT NULL,
  "job_id" text,
  "order_id" text,
  "job_name" text NOT NULL,
  "job_code" text,
  "client_name" text,
  "structure" text,
  "film_type" text,
  "micron" numeric DEFAULT 0,
  "width_mm" numeric DEFAULT 0,
  "total_gross_kg" numeric DEFAULT 0,
  "total_net_kg" numeric DEFAULT 0,
  "total_meters" numeric DEFAULT 0,
  "rolls_count" integer DEFAULT 1,
  "machine_name" text,
  "operator_name" text,
  "shift" text,
  "storage_bay" text,
  "production_date" date DEFAULT CURRENT_DATE,
  "unit_valuation_rate" numeric DEFAULT 0,
  "status" text DEFAULT 'In Stock (Ready for Dispatch)'::text,
  "notes" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "id" uuid;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "fg_batch_code" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "fg_type" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "job_id" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "job_code" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "structure" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "micron" numeric;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "width_mm" numeric;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "total_gross_kg" numeric;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "total_net_kg" numeric;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "total_meters" numeric;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "rolls_count" integer;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "machine_name" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "operator_name" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "shift" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "storage_bay" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "production_date" date;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "unit_valuation_rate" numeric;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."fg_goods" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."fg_goods" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."film_substrates" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "density" numeric DEFAULT 1.0000 NOT NULL,
  "category" text DEFAULT 'Film Substrates'::text,
  "description" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "density" numeric;
ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."film_substrates" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."film_substrates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."grns" (
  "id" text PRIMARY KEY,
  "grn_number" text NOT NULL,
  "vendor_id" text,
  "po_number" text,
  "invoice_number" text,
  "received_date" date DEFAULT CURRENT_DATE,
  "item_name" text,
  "received_qty_kg" numeric,
  "status" text DEFAULT 'Pending QC'::text,
  "qc_remarks" text,
  "created_at" timestamptz DEFAULT now(),
  "metallocene_pct" text,
  "stock_item_id" text,
  "master_item_id" text
);

ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "grn_number" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "vendor_id" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "po_number" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "invoice_number" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "received_date" date;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "item_name" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "received_qty_kg" numeric;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "qc_remarks" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "metallocene_pct" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "stock_item_id" text;
ALTER TABLE public."grns" ADD COLUMN IF NOT EXISTS "master_item_id" text;
ALTER TABLE public."grns" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."inks" (
  "id" text PRIMARY KEY,
  "product_code" text NOT NULL,
  "shade" text NOT NULL,
  "ink_type" text DEFAULT 'Reverse Ink'::text,
  "manufacturer" text,
  "supplier_id" text,
  "supplier_name" text,
  "solid_content_pct" numeric DEFAULT 40,
  "solid_variation_pct" numeric DEFAULT 2,
  "price_per_kg" numeric DEFAULT 0,
  "stock_qty_kg" numeric DEFAULT 0,
  "reorder_level_kg" numeric DEFAULT 0,
  "unit" text DEFAULT 'Kg'::text,
  "solvent_type" text,
  "notes" text,
  "price_history" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "last_updated" timestamptz DEFAULT now()
);

ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "product_code" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "shade" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "ink_type" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "supplier_id" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "supplier_name" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "solid_content_pct" numeric;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "solid_variation_pct" numeric;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "price_per_kg" numeric;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "stock_qty_kg" numeric;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "reorder_level_kg" numeric;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "solvent_type" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "price_history" jsonb;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."inks" ADD COLUMN IF NOT EXISTS "last_updated" timestamptz;
ALTER TABLE public."inks" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."inventory" (
  "id" text PRIMARY KEY,
  "item_code" text NOT NULL,
  "item_name" text NOT NULL,
  "stock_qty_kg" numeric DEFAULT 0,
  "unit_price" numeric DEFAULT 0,
  "category" text DEFAULT 'Film Substrates'::text,
  "film_type" text,
  "micron" numeric,
  "width_mm" numeric,
  "allocated_qty_kg" numeric DEFAULT 0,
  "reorder_level_kg" numeric DEFAULT 0,
  "unit" text DEFAULT 'Kg'::text,
  "density" numeric DEFAULT 1.0,
  "location" text,
  "last_vendor" text,
  "last_batch" text,
  "last_updated" timestamptz DEFAULT now(),
  "metallocene_pct" text,
  "master_item_id" text,
  "remark" text,
  "item_remark" text,
  "lot_number" text,
  "inward_date" date,
  "barcode" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "item_code" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "item_name" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "stock_qty_kg" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "unit_price" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "micron" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "width_mm" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "allocated_qty_kg" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "reorder_level_kg" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "density" numeric;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "last_vendor" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "last_batch" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "last_updated" timestamptz;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "metallocene_pct" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "master_item_id" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "remark" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "item_remark" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "lot_number" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "inward_date" date;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "barcode" text;
ALTER TABLE public."inventory" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE public."inventory" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."inventory_rolls" (
  "barcode_id" text PRIMARY KEY,
  "roll_type" text DEFAULT 'RAW_MATERIAL'::text NOT NULL,
  "item_id" text,
  "item_name" text NOT NULL,
  "category" text DEFAULT 'Film'::text,
  "job_name" text,
  "order_id" text,
  "micron" numeric,
  "width_mm" numeric,
  "inward_datetime" timestamptz DEFAULT now(),
  "vendor_name" text,
  "invoice_no" text,
  "batch_no" text,
  "net_weight_kg" numeric DEFAULT 0 NOT NULL,
  "available_weight_kg" numeric DEFAULT 0 NOT NULL,
  "input_barcode_ids" jsonb DEFAULT '[]'::jsonb,
  "station_id" text DEFAULT 'SCALE_1_INWARD'::text,
  "location_bay" text DEFAULT 'Bay A'::text,
  "status" text DEFAULT 'In Stock'::text,
  "sfg_type" text,
  "fg_type" text,
  "sub_type" text,
  "job_code" text,
  "client_name" text,
  "structure" text,
  "gross_weight_kg" numeric DEFAULT 0,
  "tare_weight_kg" numeric DEFAULT 0,
  "length_meters" numeric DEFAULT 0,
  "core_dia" text DEFAULT '3 Inch'::text,
  "joint_count" integer DEFAULT 0,
  "qc_status" text DEFAULT 'Passed'::text,
  "machine" text,
  "operator" text,
  "shift" text,
  "production_date" date,
  "machine_name" text,
  "operator_name" text,
  "remarks" text,
  "metallocene_pct" text,
  "remark" text,
  "item_remark" text,
  "barcode" text,
  "lot_number" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "film_type" text
);

ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "barcode_id" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "roll_type" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "item_id" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "item_name" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "micron" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "width_mm" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "inward_datetime" timestamptz;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "vendor_name" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "invoice_no" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "batch_no" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "net_weight_kg" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "available_weight_kg" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "input_barcode_ids" jsonb;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "station_id" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "location_bay" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "sfg_type" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "fg_type" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "sub_type" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "job_code" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "structure" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "gross_weight_kg" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "tare_weight_kg" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "length_meters" numeric;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "core_dia" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "joint_count" integer;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "qc_status" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "machine" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "operator" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "shift" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "production_date" date;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "machine_name" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "operator_name" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "remarks" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "metallocene_pct" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "remark" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "item_remark" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "barcode" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "lot_number" text;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE public."inventory_rolls" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."inventory_rolls" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."job_datasheets" (
  "id" text PRIMARY KEY,
  "job_id" text,
  "job_name" text NOT NULL,
  "client_name" text NOT NULL,
  "completion_date" date DEFAULT CURRENT_DATE,
  "selling_price_per_kg" numeric DEFAULT 0,
  "pre_cost_per_kg" numeric DEFAULT 0,
  "post_cost_per_kg" numeric DEFAULT 0,
  "profit_margin_pct" numeric DEFAULT 0,
  "actual_ink_consumed_kg" numeric DEFAULT 0,
  "actual_solvents_consumed_kg" numeric DEFAULT 0,
  "actual_adhesive_consumed_kg" numeric DEFAULT 0,
  "actual_scrap_wastage_kg" numeric DEFAULT 0,
  "operator_notes" text,
  "created_by" text DEFAULT 'Plant Manager'::text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "job_id" text;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "completion_date" date;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "selling_price_per_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "pre_cost_per_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "post_cost_per_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "profit_margin_pct" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "actual_ink_consumed_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "actual_solvents_consumed_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "actual_adhesive_consumed_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "actual_scrap_wastage_kg" numeric;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "operator_notes" text;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE public."job_datasheets" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."job_datasheets" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."job_masters" (
  "id" text PRIMARY KEY,
  "sku_code" text NOT NULL,
  "job_name" text NOT NULL,
  "client_name" text NOT NULL,
  "pouch_width_mm" numeric,
  "pouch_height_mm" numeric,
  "repeat_length_mm" numeric,
  "film_structure" text,
  "colors_count" integer DEFAULT 8,
  "cylinder_cost" text,
  "cost_borne_by" text,
  "engraver_name" text,
  "printing_process" text DEFAULT 'Rotogravure Reverse'::text,
  "target_gsm" numeric,
  "artwork_url" text,
  "created_at" timestamptz DEFAULT now(),
  "structure" text,
  "print_width_mm" numeric,
  "pouch_open_width" numeric,
  "pouch_height" numeric,
  "layers" jsonb DEFAULT '[]'::jsonb,
  "cylinder_sku" text,
  "engravures_name" text,
  "utilisation_limit" numeric DEFAULT 10000,
  "job_card_file_name" text,
  "job_card_file_url" text,
  "creation_date" date,
  "sil_logo" text DEFAULT 'Yes - ''Pkg Material Mfg by - Samyak International Ltd'''::text,
  "arc_mark" text DEFAULT 'Yes'::text,
  "slitting_mark" text DEFAULT 'Yes'::text,
  "tracker_line" text DEFAULT 'Yes'::text,
  "special_instructions" text DEFAULT ''::text,
  "press_marks" jsonb DEFAULT '{}'::jsonb,
  "wastage_percentage" numeric DEFAULT 5,
  "approved_by_head" boolean DEFAULT false,
  "approved_head_name" text,
  "approved_head_date" text,
  "chk_eyemark" boolean DEFAULT false,
  "chk_barcode" boolean DEFAULT false,
  "chk_orientation" boolean DEFAULT false,
  "chk_client_approval" boolean DEFAULT false,
  "face_length_mm" numeric,
  "variant" text DEFAULT 'Standard'::text,
  "printing" text DEFAULT 'Reverse'::text,
  "invoice_to" text DEFAULT 'Samyak International Ltd'::text,
  "shell_size" text,
  "pet_size" text,
  "process_routing" jsonb DEFAULT '[]'::jsonb,
  "ink_gsm" numeric DEFAULT 1.5,
  "adhesive_gsm" numeric DEFAULT 1.5,
  "metallocene_pct" text
);

ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "sku_code" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "pouch_width_mm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "pouch_height_mm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "repeat_length_mm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "film_structure" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "colors_count" integer;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "cylinder_cost" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "cost_borne_by" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "engraver_name" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "printing_process" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "target_gsm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "artwork_url" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "structure" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "print_width_mm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "pouch_open_width" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "pouch_height" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "layers" jsonb;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "cylinder_sku" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "engravures_name" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "utilisation_limit" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "job_card_file_name" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "job_card_file_url" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "creation_date" date;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "sil_logo" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "arc_mark" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "slitting_mark" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "tracker_line" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "special_instructions" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "press_marks" jsonb;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "wastage_percentage" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "approved_by_head" boolean;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "approved_head_name" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "approved_head_date" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "chk_eyemark" boolean;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "chk_barcode" boolean;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "chk_orientation" boolean;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "chk_client_approval" boolean;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "face_length_mm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "variant" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "printing" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "invoice_to" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "shell_size" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "pet_size" text;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "process_routing" jsonb;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "ink_gsm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "adhesive_gsm" numeric;
ALTER TABLE public."job_masters" ADD COLUMN IF NOT EXISTS "metallocene_pct" text;
ALTER TABLE public."job_masters" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."material_structure_templates" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "is_built_in" boolean DEFAULT false,
  "specification" text,
  "film_type" text,
  "thickness_micron" text,
  "parameters" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "is_built_in" boolean;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "specification" text;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "thickness_micron" text;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "parameters" jsonb;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."material_structure_templates" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."material_structure_templates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."orders" (
  "id" text PRIMARY KEY,
  "job_name" text NOT NULL,
  "client_name" text NOT NULL,
  "order_type" text DEFAULT 'Reel'::text,
  "order_qty_kg" numeric,
  "target_delivery_date" date,
  "status" text DEFAULT 'Scheduled'::text,
  "created_at" timestamptz DEFAULT now(),
  "wastage_percentage" numeric DEFAULT 5,
  "printing_status" text DEFAULT 'Pending'::text,
  "printing_start_time" timestamptz,
  "printing_end_time" timestamptz,
  "printing_duration_minutes" numeric,
  "printing_duration_formatted" text,
  "actual_meters_printed" numeric,
  "ink_gsm_in_speed" numeric,
  "printed_output_kg" numeric,
  "printing_notes" text,
  "machine_id" text,
  "ink_gsm" numeric DEFAULT 1.5,
  "adhesive_gsm" numeric DEFAULT 1.5,
  "metallocene_pct" text,
  "delivery_date" date,
  "job_details" jsonb,
  "raw_material_requirements" jsonb,
  "sfg_consumptions" jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "order_type" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "order_qty_kg" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "target_delivery_date" date;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "wastage_percentage" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printing_status" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printing_start_time" timestamptz;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printing_end_time" timestamptz;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printing_duration_minutes" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printing_duration_formatted" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "actual_meters_printed" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "ink_gsm_in_speed" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printed_output_kg" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "printing_notes" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "machine_id" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "ink_gsm" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "adhesive_gsm" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "metallocene_pct" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_date" date;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "job_details" jsonb;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "raw_material_requirements" jsonb;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "sfg_consumptions" jsonb;
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."printing_machines" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "type" text DEFAULT 'Rotogravure'::text,
  "colors" integer DEFAULT 8,
  "max_speed_mpm" numeric DEFAULT 250,
  "max_width_mm" numeric DEFAULT 1200,
  "status" text DEFAULT 'Active'::text,
  "operator" text,
  "location" text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "type" text;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "colors" integer;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "max_speed_mpm" numeric;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "max_width_mm" numeric;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "operator" text;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE public."printing_machines" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."printing_machines" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."production_records" (
  "id" text PRIMARY KEY,
  "order_id" text,
  "job_name" text NOT NULL,
  "operator_name" text,
  "shift" text,
  "gross_production_kg" numeric DEFAULT 0,
  "net_usable_kg" numeric DEFAULT 0,
  "total_wastage_kg" numeric DEFAULT 0,
  "wastage_percentage" numeric DEFAULT 0,
  "status" text DEFAULT 'Pending Plant Approval'::text,
  "recorded_at" timestamptz DEFAULT now(),
  "process_logs" jsonb,
  "overall_scrap_pct_of_output" numeric DEFAULT 0,
  "overall_scrap_pct_of_dispatch" numeric DEFAULT 0,
  "client_name" text,
  "date_filled" date DEFAULT CURRENT_DATE,
  "printing_plain_setting_wastage_kg" numeric DEFAULT 0,
  "printing_wastage_kg" numeric DEFAULT 0,
  "lamination_plain_substrate_wastage_kg" numeric DEFAULT 0,
  "printed_wastage_kg" numeric DEFAULT 0,
  "laminate_wastage_kg" numeric DEFAULT 0,
  "trim_wastage_kg" numeric DEFAULT 0,
  "total_material_cost_rs" numeric DEFAULT 0,
  "processing_cost_per_kg" numeric DEFAULT 25,
  "total_processing_cost_rs" numeric DEFAULT 0,
  "final_production_cost_rs" numeric DEFAULT 0,
  "filled_by" text,
  "approved_by" text,
  "approval_date" text,
  "notes" text,
  "materials_list" jsonb DEFAULT '[]'::jsonb,
  "printing_status" text DEFAULT 'Pending'::text,
  "printing_start_time" timestamptz,
  "printing_end_time" timestamptz,
  "printing_duration_minutes" numeric,
  "printing_duration_formatted" text,
  "actual_meters_printed" numeric,
  "ink_gsm_in_speed" numeric,
  "qty_first_pass_l1" numeric DEFAULT 0,
  "stages" jsonb DEFAULT '{}'::jsonb,
  "actual_ink_gsm" numeric,
  "actual_adhesive_gsm" numeric,
  "target_ink_gsm" numeric DEFAULT 1.5,
  "target_adhesive_gsm" numeric DEFAULT 1.5,
  "item_remarks" jsonb DEFAULT '[]'::jsonb,
  "remarks" text,
  "job_code" text,
  "qty_printing" numeric DEFAULT 0,
  "qty_inspection" numeric DEFAULT 0,
  "qty_lamination_l1" numeric DEFAULT 0,
  "qty_second_pass_l2" numeric DEFAULT 0,
  "qty_slitting" numeric DEFAULT 0,
  "qty_pouching" numeric DEFAULT 0,
  "qty_dispatch" numeric DEFAULT 0,
  "adhesive_consumed_l1_kg" numeric DEFAULT 0,
  "adhesive_consumed_l2_kg" numeric DEFAULT 0,
  "zipper_consumed_kg" numeric DEFAULT 0,
  "paper_core_consumed_kg" numeric DEFAULT 0,
  "adhesive_cost_per_kg" numeric DEFAULT 270,
  "paper_core_cost_per_kg" numeric DEFAULT 45,
  "adhesive_cost_rs" numeric DEFAULT 0,
  "paper_core_cost_rs" numeric DEFAULT 0,
  "lamination_plain_substrate_wastage_l2_kg" numeric DEFAULT 0,
  "pouching_scrap_kg" numeric DEFAULT 0,
  "output_rolls" jsonb DEFAULT '[]'::jsonb,
  "rolls_breakdown" jsonb DEFAULT '[]'::jsonb,
  "input_rolls_list" jsonb DEFAULT '[]'::jsonb,
  "sfg_consumptions" jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "operator_name" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "shift" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "gross_production_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "net_usable_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "total_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "wastage_percentage" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "recorded_at" timestamptz;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "process_logs" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "overall_scrap_pct_of_output" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "overall_scrap_pct_of_dispatch" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "date_filled" date;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_plain_setting_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "lamination_plain_substrate_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printed_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "laminate_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "trim_wastage_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "total_material_cost_rs" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "processing_cost_per_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "total_processing_cost_rs" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "final_production_cost_rs" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "filled_by" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "approved_by" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "approval_date" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "materials_list" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_status" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_start_time" timestamptz;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_end_time" timestamptz;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_duration_minutes" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "printing_duration_formatted" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "actual_meters_printed" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "ink_gsm_in_speed" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_first_pass_l1" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "stages" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "actual_ink_gsm" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "actual_adhesive_gsm" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "target_ink_gsm" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "target_adhesive_gsm" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "item_remarks" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "remarks" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "job_code" text;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_printing" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_inspection" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_lamination_l1" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_second_pass_l2" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_slitting" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_pouching" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "qty_dispatch" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "adhesive_consumed_l1_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "adhesive_consumed_l2_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "zipper_consumed_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "paper_core_consumed_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "adhesive_cost_per_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "paper_core_cost_per_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "adhesive_cost_rs" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "paper_core_cost_rs" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "lamination_plain_substrate_wastage_l2_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "pouching_scrap_kg" numeric;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "output_rolls" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "rolls_breakdown" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "input_rolls_list" jsonb;
ALTER TABLE public."production_records" ADD COLUMN IF NOT EXISTS "sfg_consumptions" jsonb;
ALTER TABLE public."production_records" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."production_schedules" (
  "id" text PRIMARY KEY,
  "order_id" text NOT NULL,
  "job_name" text NOT NULL,
  "client_name" text NOT NULL,
  "machine_id" text NOT NULL,
  "shift" text DEFAULT 'Day Shift'::text,
  "scheduled_date" date DEFAULT CURRENT_DATE,
  "start_time" text DEFAULT '08:00'::text,
  "order_qty_kg" numeric,
  "width_mm" numeric,
  "micron" numeric,
  "film_type" text,
  "max_speed_mpm" numeric,
  "total_length_meters" numeric,
  "run_time_mins" numeric,
  "roll_changeover_mins" numeric,
  "job_changeover_mins" numeric,
  "total_duration_mins" numeric,
  "end_time" text,
  "status" text DEFAULT 'Scheduled'::text,
  "priority" text DEFAULT 'Normal'::text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "machine_id" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "shift" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "scheduled_date" date;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "start_time" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "order_qty_kg" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "width_mm" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "micron" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "max_speed_mpm" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "total_length_meters" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "run_time_mins" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "roll_changeover_mins" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "job_changeover_mins" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "total_duration_mins" numeric;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "end_time" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "priority" text;
ALTER TABLE public."production_schedules" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."production_schedules" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."purchase_orders" (
  "id" text PRIMARY KEY,
  "po_number" text NOT NULL,
  "po_date" date DEFAULT CURRENT_DATE,
  "delivery_date" date,
  "promised_delivery_date" date,
  "vendor_id" text,
  "vendor_name" text NOT NULL,
  "vendor_details" jsonb DEFAULT '{}'::jsonb,
  "category" text DEFAULT 'Film Substrates'::text,
  "items" jsonb DEFAULT '[]'::jsonb,
  "total_qty_kg" numeric DEFAULT 0,
  "subtotal" numeric DEFAULT 0,
  "tax_amount" numeric DEFAULT 0,
  "total_amount" numeric DEFAULT 0,
  "payment_terms" text DEFAULT '30 Days Net'::text,
  "logistic_details" text DEFAULT 'Freight Included within Indore'::text,
  "notes" text,
  "remarks" text,
  "status" text DEFAULT 'Pending Delivery'::text,
  "source" text DEFAULT 'Direct PO Module'::text,
  "linked_order_id" text,
  "linked_order_name" text,
  "linked_requirements" jsonb DEFAULT '[]'::jsonb,
  "created_by" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "po_number" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "po_date" date;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "delivery_date" date;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "promised_delivery_date" date;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "vendor_id" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "vendor_name" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "vendor_details" jsonb;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "items" jsonb;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "total_qty_kg" numeric;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "subtotal" numeric;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "tax_amount" numeric;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "total_amount" numeric;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "payment_terms" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "logistic_details" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "remarks" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "linked_order_id" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "linked_order_name" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "linked_requirements" jsonb;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."purchase_orders" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."role_permissions" (
  "role" text PRIMARY KEY,
  "permissions" jsonb,
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."role_permissions" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE public."role_permissions" ADD COLUMN IF NOT EXISTS "permissions" jsonb;
ALTER TABLE public."role_permissions" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."role_permissions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."salary_advances" (
  "id" text PRIMARY KEY,
  "employee_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "department" text,
  "request_date" date NOT NULL,
  "advance_amount" numeric NOT NULL,
  "repayment_tenure_months" numeric DEFAULT 1,
  "monthly_emi_amount" numeric NOT NULL,
  "reason" text,
  "status" text DEFAULT 'Pending Approval'::text,
  "approved_by" text,
  "approved_date" text,
  "disbursed_date" text,
  "total_recovered_amount" numeric DEFAULT 0,
  "remaining_balance" numeric DEFAULT 0,
  "deduction_history" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "employee_id" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "employee_name" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "request_date" date;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "advance_amount" numeric;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "repayment_tenure_months" numeric;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "monthly_emi_amount" numeric;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "approved_by" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "approved_date" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "disbursed_date" text;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "total_recovered_amount" numeric;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "remaining_balance" numeric;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "deduction_history" jsonb;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."salary_advances" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."salary_advances" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."salary_payments" (
  "id" text PRIMARY KEY,
  "month_key" text NOT NULL,
  "employee_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "emp_code" text,
  "department" text,
  "net_amount_paid" numeric NOT NULL,
  "payment_date" date NOT NULL,
  "payment_time" text NOT NULL,
  "payment_timestamp" timestamptz NOT NULL,
  "payment_mode" text DEFAULT 'Bank Transfer (NEFT)'::text,
  "transaction_reference" text,
  "bank_name" text,
  "account_number" text,
  "status" text DEFAULT 'Paid'::text,
  "disbursed_by" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "month_key" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "employee_id" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "employee_name" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "emp_code" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "net_amount_paid" numeric;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "payment_date" date;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "payment_time" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "payment_timestamp" timestamptz;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "payment_mode" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "transaction_reference" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "bank_name" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "account_number" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "disbursed_by" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."salary_payments" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."salary_payments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."sales_quotations" (
  "id" text PRIMARY KEY,
  "quotation_no" text,
  "revision_no" integer DEFAULT 0,
  "amendment_no" text DEFAULT 'Rev 00'::text,
  "enquiry_date" date,
  "estimated_delivery_date" date,
  "sales_manager" text,
  "client_name" text,
  "client_address" text,
  "client_gstin" text,
  "contact_person" text,
  "contact_phone" text,
  "contact_email" text,
  "payment_terms" text,
  "cylinder_terms" text,
  "transport_terms" text,
  "status" text DEFAULT 'Draft'::text,
  "ocn_ref_no" text DEFAULT ''::text,
  "converted_date" text DEFAULT ''::text,
  "items" jsonb DEFAULT '[]'::jsonb,
  "terms_and_conditions" jsonb DEFAULT '[]'::jsonb,
  "comments" text DEFAULT ''::text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "quotation_no" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "revision_no" integer;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "amendment_no" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "enquiry_date" date;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "estimated_delivery_date" date;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "sales_manager" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "client_address" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "client_gstin" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "contact_person" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "contact_phone" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "contact_email" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "payment_terms" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "cylinder_terms" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "transport_terms" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "ocn_ref_no" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "converted_date" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "items" jsonb;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "terms_and_conditions" jsonb;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "comments" text;
ALTER TABLE public."sales_quotations" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."sales_quotations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."scrap_disposals" (
  "id" text PRIMARY KEY,
  "category" text NOT NULL,
  "qty_kg" numeric DEFAULT 0 NOT NULL,
  "vendor" text DEFAULT 'Scrap Recycler'::text,
  "ref_no" text,
  "disposed_date" date DEFAULT CURRENT_DATE,
  "disposed_by" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "qty_kg" numeric;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "vendor" text;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "ref_no" text;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "disposed_date" date;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "disposed_by" text;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."scrap_disposals" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."scrap_disposals" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."sfg_fg_store" (
  "id" text PRIMARY KEY,
  "batch_no" text NOT NULL,
  "job_card_no" text,
  "job_name" text,
  "client_name" text,
  "item_type" text DEFAULT 'SFG'::text,
  "stage_name" text,
  "net_weight_kg" numeric DEFAULT 0,
  "gross_weight_kg" numeric DEFAULT 0,
  "rolls_count" integer DEFAULT 1,
  "location_rack" text,
  "status" text DEFAULT 'In Store'::text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "batch_no" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "job_card_no" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "item_type" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "stage_name" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "net_weight_kg" numeric;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "gross_weight_kg" numeric;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "rolls_count" integer;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "location_rack" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."sfg_fg_store" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."sfg_fg_store" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."sfg_goods" (
  "id" uuid PRIMARY KEY,
  "sfg_batch_code" text NOT NULL,
  "sfg_type" text NOT NULL,
  "job_id" text,
  "order_id" text,
  "job_name" text NOT NULL,
  "job_code" text,
  "client_name" text,
  "structure" text,
  "film_type" text,
  "micron" numeric DEFAULT 0,
  "width_mm" numeric DEFAULT 0,
  "total_gross_kg" numeric DEFAULT 0,
  "total_net_kg" numeric DEFAULT 0,
  "total_meters" numeric DEFAULT 0,
  "rolls_count" integer DEFAULT 1,
  "machine_name" text,
  "operator_name" text,
  "shift" text,
  "storage_bay" text,
  "production_date" date DEFAULT CURRENT_DATE,
  "unit_valuation_rate" numeric DEFAULT 0,
  "status" text DEFAULT 'In Stock (WIP)'::text,
  "notes" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "gross_weight_kg" numeric DEFAULT 0,
  "tare_weight_kg" numeric DEFAULT 0,
  "consumed_kg" numeric DEFAULT 0,
  "available_kg" numeric DEFAULT 0,
  "consumption_history" jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "id" uuid;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "sfg_batch_code" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "sfg_type" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "job_id" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "job_name" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "job_code" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "structure" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "film_type" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "micron" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "width_mm" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "total_gross_kg" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "total_net_kg" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "total_meters" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "rolls_count" integer;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "machine_name" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "operator_name" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "shift" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "storage_bay" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "production_date" date;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "unit_valuation_rate" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "gross_weight_kg" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "tare_weight_kg" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "consumed_kg" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "available_kg" numeric;
ALTER TABLE public."sfg_goods" ADD COLUMN IF NOT EXISTS "consumption_history" jsonb;
ALTER TABLE public."sfg_goods" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."system_settings" (
  "setting_key" text PRIMARY KEY,
  "setting_value" text,
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "setting_key" text;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "setting_value" text;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
ALTER TABLE public."system_settings" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."users" (
  "id" text PRIMARY KEY,
  "username" text NOT NULL,
  "full_name" text,
  "email" text,
  "role" text NOT NULL,
  "department" text,
  "active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "password_hash" text DEFAULT ''::text,
  "status" text DEFAULT 'Active'::text
);

ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "active" boolean;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."vendors" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "category" text,
  "contact_person" text,
  "phone" text,
  "email" text,
  "gstin" text,
  "address" text,
  "rating" numeric DEFAULT 5.0,
  "created_at" timestamptz DEFAULT now()
);

ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "contact_person" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "gstin" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "rating" numeric;
ALTER TABLE public."vendors" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;
ALTER TABLE public."vendors" ENABLE ROW LEVEL SECURITY;

-- Unique and foreign keys. Skip when the constraint already exists.
DO $$ BEGIN
  ALTER TABLE public."coa_reports" ADD CONSTRAINT "coa_reports_coa_no_key" UNIQUE (coa_no);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."employee_attendance" ADD CONSTRAINT "unique_emp_attendance_date" UNIQUE (employee_id, date);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."employees" ADD CONSTRAINT "employees_emp_code_key" UNIQUE (emp_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."fg_goods" ADD CONSTRAINT "fg_goods_fg_batch_code_key" UNIQUE (fg_batch_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."film_substrates" ADD CONSTRAINT "film_substrates_name_key" UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."grns" ADD CONSTRAINT "grns_grn_number_key" UNIQUE (grn_number);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."inks" ADD CONSTRAINT "inks_product_code_key" UNIQUE (product_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."job_masters" ADD CONSTRAINT "job_masters_sku_code_key" UNIQUE (sku_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_po_number_key" UNIQUE (po_number);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."salary_payments" ADD CONSTRAINT "unique_emp_month_payment" UNIQUE (employee_id, month_key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."sfg_goods" ADD CONSTRAINT "sfg_goods_sfg_batch_code_key" UNIQUE (sfg_batch_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."users" ADD CONSTRAINT "users_username_key" UNIQUE (username);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."employee_attendance" ADD CONSTRAINT "employee_attendance_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."grns" ADD CONSTRAINT "grns_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."inks" ADD CONSTRAINT "inks_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."job_datasheets" ADD CONSTRAINT "job_datasheets_job_id_fkey" FOREIGN KEY (job_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."production_records" ADD CONSTRAINT "production_records_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."salary_advances" ADD CONSTRAINT "salary_advances_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."salary_payments" ADD CONSTRAINT "salary_payments_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
