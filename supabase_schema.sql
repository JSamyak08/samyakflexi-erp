-- =========================================================================
-- SAMYAK FLEXI-ERP DATABASE SCHEMA FOR SUPABASE
-- Samyak International Ltd, Indore - Flexible Packaging Division
-- =========================================================================

-- 1. ORDERS / JOB PUNCHING TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    order_type TEXT DEFAULT 'Reel',
    order_qty_kg NUMERIC,
    delivery_date DATE,
    target_delivery_date DATE,
    status TEXT DEFAULT 'Scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    job_details JSONB,
    raw_material_requirements JSONB
);

-- 2. VENDORS TABLE
CREATE TABLE IF NOT EXISTS public.vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    address TEXT,
    rating NUMERIC DEFAULT 5.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INVENTORY TABLE (RAW MATERIALS & CONSUMABLES)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    item_code TEXT,
    item_name TEXT NOT NULL,
    category TEXT DEFAULT 'Film Substrates',
    film_type TEXT,
    micron NUMERIC,
    width_mm NUMERIC,
    stock_qty_kg NUMERIC DEFAULT 0,
    allocated_qty_kg NUMERIC DEFAULT 0,
    reorder_level_kg NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'Kg',
    density NUMERIC DEFAULT 1.0,
    location TEXT,
    last_vendor TEXT,
    last_batch TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GOODS RECEIPT NOTES (GRN) TABLE
CREATE TABLE IF NOT EXISTS public.grns (
    id TEXT PRIMARY KEY,
    grn_number TEXT UNIQUE NOT NULL,
    vendor_id TEXT REFERENCES public.vendors(id),
    po_number TEXT,
    invoice_number TEXT,
    received_date DATE DEFAULT CURRENT_DATE,
    item_name TEXT,
    received_qty_kg NUMERIC,
    status TEXT DEFAULT 'Pending QC',
    qc_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CYLINDERS TABLE
CREATE TABLE IF NOT EXISTS public.cylinders (
    id TEXT PRIMARY KEY,
    sku TEXT,
    job_name TEXT NOT NULL,
    colors_count INT,
    cylinder_cost TEXT,
    cost_per_cylinder TEXT,
    rate_per_sq_inch NUMERIC DEFAULT 1.6,
    engravures_name TEXT,
    cost_borne_by TEXT,
    cost_borne_type TEXT,
    client_group TEXT,
    circumference_mm NUMERIC,
    face_length_mm NUMERIC,
    layer1_printed_qty_kg NUMERIC DEFAULT 0,
    dispatched_qty NUMERIC DEFAULT 0,
    utilisation_limit NUMERIC DEFAULT 10000,
    status TEXT DEFAULT 'Active In-Use',
    artwork_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRODUCTION RECORDS TABLE
CREATE TABLE IF NOT EXISTS public.production_records (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id),
    job_name TEXT NOT NULL,
    operator_name TEXT,
    shift TEXT,
    gross_production_kg NUMERIC DEFAULT 0,
    net_usable_kg NUMERIC DEFAULT 0,
    total_wastage_kg NUMERIC DEFAULT 0,
    wastage_percentage NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Pending Plant Approval',
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    process_logs JSONB
);

-- 7. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    email TEXT,
    role TEXT NOT NULL,
    department TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. JOB DATA SHEETS TABLE
CREATE TABLE IF NOT EXISTS public.job_datasheets (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES public.orders(id),
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    completion_date DATE DEFAULT CURRENT_DATE,
    selling_price_per_kg NUMERIC DEFAULT 0,
    pre_cost_per_kg NUMERIC DEFAULT 0,
    post_cost_per_kg NUMERIC DEFAULT 0,
    profit_margin_pct NUMERIC DEFAULT 0,
    actual_ink_consumed_kg NUMERIC DEFAULT 0,
    actual_solvents_consumed_kg NUMERIC DEFAULT 0,
    actual_adhesive_consumed_kg NUMERIC DEFAULT 0,
    actual_scrap_wastage_kg NUMERIC DEFAULT 0,
    operator_notes TEXT,
    created_by TEXT DEFAULT 'Plant Manager',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. INVENTORY ROLLS & SFG BARCODES TABLE
CREATE TABLE IF NOT EXISTS public.inventory_rolls (
    barcode_id TEXT PRIMARY KEY,
    roll_type TEXT NOT NULL DEFAULT 'RAW_MATERIAL', -- 'RAW_MATERIAL', 'SFG_PRINTED', 'SFG_LAMINATED', 'FG_DISPATCH'
    item_id TEXT,
    item_name TEXT NOT NULL,
    category TEXT DEFAULT 'Film', -- 'Film', 'Ink', 'Solvent', 'Adhesive', 'SFG', 'FG'
    job_name TEXT,
    order_id TEXT,
    micron NUMERIC,
    width_mm NUMERIC,
    inward_datetime TIMESTAMPTZ DEFAULT NOW(),
    vendor_name TEXT,
    invoice_no TEXT,
    batch_no TEXT,
    net_weight_kg NUMERIC NOT NULL DEFAULT 0,
    available_weight_kg NUMERIC NOT NULL DEFAULT 0,
    input_barcode_ids JSONB DEFAULT '[]'::jsonb,
    station_id TEXT DEFAULT 'SCALE_1_INWARD', -- 'SCALE_1_INWARD', 'SCALE_2_PRINTING', 'SCALE_3_LAMINATION', 'SCALE_4_DISPATCH'
    location_bay TEXT DEFAULT 'Bay A',
    status TEXT DEFAULT 'In Stock'
);

-- 10. DISPATCH SHIPMENTS & PACKING LIST TABLE
CREATE TABLE IF NOT EXISTS public.dispatch_shipments (
    dispatch_id TEXT PRIMARY KEY,
    order_id TEXT,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    vehicle_no TEXT,
    lr_no TEXT,
    dispatch_date TIMESTAMPTZ DEFAULT NOW(),
    total_rolls INT DEFAULT 0,
    total_net_weight_kg NUMERIC DEFAULT 0,
    total_gross_weight_kg NUMERIC DEFAULT 0,
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PRINTING MACHINES TABLE
CREATE TABLE IF NOT EXISTS public.printing_machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'Rotogravure',
    colors INT DEFAULT 8,
    max_speed_mpm NUMERIC DEFAULT 250,
    max_width_mm NUMERIC DEFAULT 1200,
    status TEXT DEFAULT 'Active',
    operator TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PRODUCTION SCHEDULES TABLE
CREATE TABLE IF NOT EXISTS public.production_schedules (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    shift TEXT DEFAULT 'Day Shift',
    scheduled_date DATE DEFAULT CURRENT_DATE,
    start_time TEXT DEFAULT '08:00',
    order_qty_kg NUMERIC,
    width_mm NUMERIC,
    micron NUMERIC,
    film_type TEXT,
    max_speed_mpm NUMERIC,
    total_length_meters NUMERIC,
    run_time_mins NUMERIC,
    roll_changeover_mins NUMERIC,
    job_changeover_mins NUMERIC,
    total_duration_mins NUMERIC,
    end_time TEXT,
    status TEXT DEFAULT 'Scheduled',
    priority TEXT DEFAULT 'Normal',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gstin TEXT,
    address TEXT,
    payment_terms TEXT,
    contact_person TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. JOB MASTERS DIRECTORY TABLE
CREATE TABLE IF NOT EXISTS public.job_masters (
    id TEXT PRIMARY KEY,
    sku_code TEXT,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    structure TEXT,
    print_width_mm NUMERIC,
    repeat_length_mm NUMERIC,
    pouch_open_width NUMERIC,
    pouch_height NUMERIC,
    layers JSONB DEFAULT '[]'::jsonb,
    cylinder_sku TEXT,
    cylinder_cost TEXT,
    colors_count INT DEFAULT 6,
    engravures_name TEXT,
    cost_borne_by TEXT,
    utilisation_limit NUMERIC DEFAULT 10000,
    creation_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist on job_masters if table was previously created with older schema
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS sku_code TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS structure TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS print_width_mm NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS repeat_length_mm NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS pouch_open_width NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS pouch_height NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS layers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS cylinder_sku TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS cylinder_cost TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS colors_count INT DEFAULT 6;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS engravures_name TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS cost_borne_by TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS utilisation_limit NUMERIC DEFAULT 10000;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS creation_date DATE DEFAULT CURRENT_DATE;

-- Ensure all columns exist on inventory if table was previously created with older schema
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Film Substrates';
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS film_type TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS micron NUMERIC;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS width_mm NUMERIC;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS stock_qty_kg NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS allocated_qty_kg NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS reorder_level_kg NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Kg';
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS density NUMERIC DEFAULT 1.0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS last_vendor TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS last_batch TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();

-- 16. INKS MASTER & SOLID COSTING TABLE
CREATE TABLE IF NOT EXISTS public.inks (
    id TEXT PRIMARY KEY,
    product_code TEXT NOT NULL,
    shade TEXT NOT NULL,
    ink_type TEXT NOT NULL DEFAULT 'Reverse Ink',
    manufacturer TEXT,
    supplier_id TEXT REFERENCES public.vendors(id),
    supplier_name TEXT,
    solid_content_pct NUMERIC NOT NULL DEFAULT 40,
    solid_variation_pct NUMERIC DEFAULT 2,
    price_per_kg NUMERIC NOT NULL DEFAULT 0,
    stock_qty_kg NUMERIC DEFAULT 0,
    reorder_level_kg NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'Kg',
    solvent_type TEXT,
    notes TEXT,
    price_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW()
);


-- Enable Row Level Security (RLS) & Grant Permissive Access to Anon & Authenticated Roles for Internal ERP
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon and auth full access" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Allow anon and auth full access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

-- 15. STORAGE BUCKETS FOR PACKAGING ARTWORK & DOCUMENTS
INSERT INTO storage.buckets (id, name, public) 
VALUES ('erp-files', 'erp-files', true), ('artwork', 'artwork', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  -- Storage policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public uploads to erp-files' AND tablename = 'objects') THEN
    CREATE POLICY "Allow public uploads to erp-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('erp-files', 'artwork'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read from erp-files' AND tablename = 'objects') THEN
    CREATE POLICY "Allow public read from erp-files" ON storage.objects FOR SELECT USING (bucket_id IN ('erp-files', 'artwork'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update to erp-files' AND tablename = 'objects') THEN
    CREATE POLICY "Allow public update to erp-files" ON storage.objects FOR UPDATE USING (bucket_id IN ('erp-files', 'artwork'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public delete from erp-files' AND tablename = 'objects') THEN
    CREATE POLICY "Allow public delete from erp-files" ON storage.objects FOR DELETE USING (bucket_id IN ('erp-files', 'artwork'));
  END IF;
END $$;


-- 8. SUPABASE AUTH USER SYNC TRIGGER
-- Automatically creates a record in public.users when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, full_name, email, role, department, active)
  VALUES (
    NEW.id::text,
    LOWER(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Admin'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Executive Management'),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger firing on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

