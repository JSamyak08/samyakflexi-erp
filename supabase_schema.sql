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

-- 3. INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT,
    film_type TEXT,
    micron NUMERIC,
    width_mm NUMERIC,
    stock_qty_kg NUMERIC DEFAULT 0,
    reorder_level_kg NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    location TEXT,
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

-- Enable Row Level Security (RLS) & default access rules
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_datasheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_shipments ENABLE ROW LEVEL SECURITY;

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
    sku_code TEXT UNIQUE NOT NULL,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    pouch_width_mm NUMERIC,
    pouch_height_mm NUMERIC,
    repeat_length_mm NUMERIC,
    film_structure TEXT,
    colors_count INT DEFAULT 8,
    cylinder_cost TEXT,
    cost_borne_by TEXT,
    engraver_name TEXT,
    printing_process TEXT DEFAULT 'Rotogravure Reverse',
    target_gsm NUMERIC,
    artwork_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.printing_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_masters ENABLE ROW LEVEL SECURITY;

-- Anonymous/Public access policies for ERP client operations
CREATE POLICY "Allow public read-write for orders" ON public.orders FOR ALL USING (true);
CREATE POLICY "Allow public read-write for vendors" ON public.vendors FOR ALL USING (true);
CREATE POLICY "Allow public read-write for clients" ON public.clients FOR ALL USING (true);
CREATE POLICY "Allow public read-write for inventory" ON public.inventory FOR ALL USING (true);
CREATE POLICY "Allow public read-write for grns" ON public.grns FOR ALL USING (true);
CREATE POLICY "Allow public read-write for cylinders" ON public.cylinders FOR ALL USING (true);
CREATE POLICY "Allow public read-write for production_records" ON public.production_records FOR ALL USING (true);
CREATE POLICY "Allow public read-write for users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow public read-write for job_datasheets" ON public.job_datasheets FOR ALL USING (true);
CREATE POLICY "Allow public read-write for job_masters" ON public.job_masters FOR ALL USING (true);
CREATE POLICY "Allow public read-write for inventory_rolls" ON public.inventory_rolls FOR ALL USING (true);
CREATE POLICY "Allow public read-write for dispatch_shipments" ON public.dispatch_shipments FOR ALL USING (true);
CREATE POLICY "Allow public read-write for printing_machines" ON public.printing_machines FOR ALL USING (true);
CREATE POLICY "Allow public read-write for production_schedules" ON public.production_schedules FOR ALL USING (true);

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

