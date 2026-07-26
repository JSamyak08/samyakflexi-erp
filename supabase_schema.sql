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

-- Enable Row Level Security (RLS) & default access rules
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_datasheets ENABLE ROW LEVEL SECURITY;

-- Anonymous/Public access policies for ERP client operations
CREATE POLICY "Allow public read-write for orders" ON public.orders FOR ALL USING (true);
CREATE POLICY "Allow public read-write for vendors" ON public.vendors FOR ALL USING (true);
CREATE POLICY "Allow public read-write for inventory" ON public.inventory FOR ALL USING (true);
CREATE POLICY "Allow public read-write for grns" ON public.grns FOR ALL USING (true);
CREATE POLICY "Allow public read-write for cylinders" ON public.cylinders FOR ALL USING (true);
CREATE POLICY "Allow public read-write for production_records" ON public.production_records FOR ALL USING (true);
CREATE POLICY "Allow public read-write for users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow public read-write for job_datasheets" ON public.job_datasheets FOR ALL USING (true);


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

