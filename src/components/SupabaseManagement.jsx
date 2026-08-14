import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  Key, 
  Globe, 
  Server, 
  ShieldCheck, 
  AlertCircle,
  FileCode,
  Check,
  Zap,
  Layers,
  ArrowRight,
  Trash2,
  Cloud
} from 'lucide-react';
import { 
  isSupabaseConfigured, 
  checkSupabaseConnection, 
  saveSupabaseCredentials, 
  clearSupabaseCredentials,
  getSupabaseCredentials
} from '../services/supabaseClient';
import { seedAllDataToSupabase, clearAllSupabaseData } from '../services/supabaseDataService';
import { initializeStorageBuckets } from '../services/supabaseStorageService';

export default function SupabaseManagement() {
  const [urlInput, setUrlInput] = useState(() => {
    return getSupabaseCredentials().url || '';
  });
  const [keyInput, setKeyInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [initializingBuckets, setInitializingBuckets] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [connectionState, setConnectionState] = useState({
    checked: false,
    connected: false,
    message: '',
    error: null
  });

  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('status'); // 'status', 'config', 'schema', 'auth'

  const handleSeedData = async () => {
    setSeeding(true);
    setSeedResult(null);
    const res = await seedAllDataToSupabase();
    setSeeding(false);
    setSeedResult(res);
  };

  const handlePurgeSupabaseData = async () => {
    if (!window.confirm("Are you sure you want to purge all data from Supabase tables? This cannot be undone.")) return;
    setSeeding(true);
    setSeedResult(null);
    const res = await clearAllSupabaseData();
    setSeeding(false);
    setSeedResult(res);
  };

  const handleInitBuckets = async () => {
    setInitializingBuckets(true);
    setSeedResult(null);
    try {
      const res = await initializeStorageBuckets();
      const success = res.erpFiles.success || res.artwork.success;
      setSeedResult({
        success,
        message: success 
          ? `Storage Buckets ('erp-files' & 'artwork') verified/created successfully!` 
          : `Storage bucket initialization note: ${res.erpFiles.message || 'Please create bucket erp-files in Supabase Dashboard -> Storage'}`
      });
      runConnectionCheck();
    } catch (err) {
      setSeedResult({
        success: false,
        message: `Storage setup error: ${err.message}`
      });
    } finally {
      setInitializingBuckets(false);
    }
  };

  const runConnectionCheck = async () => {
    setLoading(true);
    const result = await checkSupabaseConnection();
    setConnectionState({
      checked: true,
      connected: result.connected,
      message: result.message,
      error: result.error || null
    });
    setLoading(false);
  };

  useEffect(() => {
    runConnectionCheck();
  }, []);

  const handleSaveConfig = (e) => {
    e.preventDefault();
    const effectiveKey = keyInput.trim() || getSupabaseCredentials().key;
    saveSupabaseCredentials(urlInput, effectiveKey);
    setKeyInput('');
    runConnectionCheck();
  };

  const handleClearConfig = () => {
    clearSupabaseCredentials();
    setUrlInput('');
    setKeyInput('');
    setConnectionState({
      checked: true,
      connected: false,
      message: 'Credentials cleared. Configure Supabase credentials to reconnect.',
      error: null
    });
  };

  const sqlSchemaSnippet = `-- =========================================================================
-- SAMYAK FLEXI-ERP DATABASE SCHEMA FOR SUPABASE
-- Samyak International Ltd, Indore - Flexible Packaging Division
-- Run this complete script in Supabase Dashboard -> SQL Editor -> New Query
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
    print_width_mm NUMERIC,
    layer1_printed_qty_kg NUMERIC DEFAULT 0,
    dispatched_qty NUMERIC DEFAULT 0,
    utilisation_limit NUMERIC DEFAULT 10000,
    status TEXT DEFAULT 'Active In-Use',
    artwork_url TEXT,
    job_card_file_url TEXT,
    job_card_file_name TEXT,
    structure TEXT,
    layers JSONB,
    pouch_open_width NUMERIC,
    pouch_height NUMERIC,
    job_master_id TEXT,
    assigned_press TEXT,
    variant TEXT DEFAULT 'Standard',
    printing TEXT DEFAULT 'Reverse',
    invoice_to TEXT DEFAULT 'Samyak International Ltd',
    shell_size TEXT,
    pet_size TEXT,
    sil_logo TEXT,
    arc_mark TEXT,
    slitting_mark TEXT,
    tracker_line TEXT,
    special_instructions TEXT,
    chk_eyemark BOOLEAN DEFAULT FALSE,
    chk_barcode BOOLEAN DEFAULT FALSE,
    chk_orientation BOOLEAN DEFAULT FALSE,
    chk_client_approval BOOLEAN DEFAULT FALSE,
    approved_by_head BOOLEAN DEFAULT FALSE,
    approved_head_name TEXT,
    approved_head_date TEXT,
    press_marks JSONB,
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
    roll_type TEXT NOT NULL DEFAULT 'RAW_MATERIAL',
    item_id TEXT,
    item_name TEXT NOT NULL,
    category TEXT DEFAULT 'Film',
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
    station_id TEXT DEFAULT 'SCALE_1_INWARD',
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
    sku_code TEXT UNIQUE NOT NULL,
    job_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    print_width_mm NUMERIC,
    face_length_mm NUMERIC,
    repeat_length_mm NUMERIC,
    pouch_open_width NUMERIC,
    pouch_height NUMERIC,
    pouch_width_mm NUMERIC,
    pouch_height_mm NUMERIC,
    film_structure TEXT,
    structure TEXT,
    layers JSONB,
    colors_count INT DEFAULT 8,
    cylinder_cost TEXT,
    cost_borne_by TEXT,
    engraver_name TEXT,
    engravures_name TEXT,
    cylinder_sku TEXT,
    utilisation_limit NUMERIC DEFAULT 10000,
    printing_process TEXT DEFAULT 'Rotogravure Reverse',
    target_gsm NUMERIC,
    artwork_url TEXT,
    job_card_file_url TEXT,
    job_card_file_name TEXT,
    variant TEXT DEFAULT 'Standard',
    printing TEXT DEFAULT 'Reverse',
    invoice_to TEXT DEFAULT 'Samyak International Ltd',
    shell_size TEXT,
    pet_size TEXT,
    sil_logo TEXT,
    arc_mark TEXT,
    slitting_mark TEXT,
    tracker_line TEXT,
    special_instructions TEXT,
    press_marks JSONB,
    chk_eyemark BOOLEAN DEFAULT FALSE,
    chk_barcode BOOLEAN DEFAULT FALSE,
    chk_orientation BOOLEAN DEFAULT FALSE,
    chk_client_approval BOOLEAN DEFAULT FALSE,
    approved_by_head BOOLEAN DEFAULT FALSE,
    approved_head_name TEXT,
    approved_head_date TEXT,
    creation_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. INKS MASTER TABLE
CREATE TABLE IF NOT EXISTS public.inks (
    id TEXT PRIMARY KEY,
    product_code TEXT UNIQUE NOT NULL,
    shade TEXT NOT NULL,
    ink_type TEXT DEFAULT 'Reverse Ink',
    manufacturer TEXT,
    supplier_id TEXT REFERENCES public.vendors(id) ON DELETE SET NULL,
    supplier_name TEXT,
    solid_content_pct NUMERIC DEFAULT 40,
    solid_variation_pct NUMERIC DEFAULT 2,
    price_per_kg NUMERIC DEFAULT 0,
    stock_qty_kg NUMERIC DEFAULT 0,
    reorder_level_kg NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'Kg',
    solvent_type TEXT,
    notes TEXT,
    price_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 16. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    username TEXT DEFAULT 'System',
    user_role TEXT DEFAULT 'Admin',
    action_type TEXT DEFAULT 'UPDATE',
    module TEXT DEFAULT 'System',
    details TEXT,
    target_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. SALES QUOTATIONS TABLE
CREATE TABLE IF NOT EXISTS public.sales_quotations (
    id TEXT PRIMARY KEY,
    quotation_no TEXT UNIQUE NOT NULL,
    revision_no INT DEFAULT 0,
    amendment_no TEXT DEFAULT 'Rev 00',
    enquiry_date DATE,
    estimated_delivery_date DATE,
    sales_manager TEXT,
    client_name TEXT NOT NULL,
    client_address TEXT,
    client_gstin TEXT,
    contact_person TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    payment_terms TEXT,
    cylinder_terms TEXT,
    transport_terms TEXT,
    status TEXT DEFAULT 'Sent to Client',
    ocn_ref_no TEXT,
    converted_date TIMESTAMPTZ,
    items JSONB DEFAULT '[]'::jsonb,
    terms_and_conditions JSONB DEFAULT '[]'::jsonb,
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. EMAIL SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.email_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    smtp_host TEXT,
    smtp_port INT DEFAULT 465,
    smtp_secure BOOLEAN DEFAULT true,
    smtp_user TEXT,
    smtp_pass TEXT,
    sender_name TEXT,
    admin_email TEXT,
    plant_manager_email TEXT,
    purchase_email TEXT,
    dispatch_email TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 20. EMAIL TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS public.email_templates (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    event_title TEXT,
    subject TEXT,
    badge_text TEXT,
    badge_bg_color TEXT DEFAULT '#0284c7',
    to_email TEXT,
    cc_email TEXT,
    enabled BOOLEAN DEFAULT true,
    content_html TEXT,
    footer_note TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Column migrations for scrap wastage, gross output & job master specifications
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS wastage_percentage NUMERIC DEFAULT 5;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS wastage_percentage NUMERIC DEFAULT 5;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS process_routing JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS approved_by_head BOOLEAN DEFAULT false;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS approved_head_name TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS approved_head_date TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS chk_eyemark BOOLEAN DEFAULT false;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS chk_barcode BOOLEAN DEFAULT false;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS chk_orientation BOOLEAN DEFAULT false;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS chk_client_approval BOOLEAN DEFAULT false;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS press_marks JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS job_card_file_name TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS job_card_file_url TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS artwork_url TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS face_length_mm NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS sil_logo TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS arc_mark TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS slitting_mark TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS tracker_line TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'Standard';
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS printing TEXT DEFAULT 'Reverse';
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS invoice_to TEXT DEFAULT 'Samyak International Ltd';
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS shell_size TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS pet_size TEXT;

-- Ensure all columns exist on cylinders
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS approved_by_head BOOLEAN DEFAULT false;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS approved_head_name TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS approved_head_date TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS chk_eyemark BOOLEAN DEFAULT false;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS chk_barcode BOOLEAN DEFAULT false;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS chk_orientation BOOLEAN DEFAULT false;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS chk_client_approval BOOLEAN DEFAULT false;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS press_marks JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS job_card_file_name TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS job_card_file_url TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS print_width_mm NUMERIC;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS pouch_open_width NUMERIC;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS pouch_height NUMERIC;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS structure TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS layers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS job_master_id TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS assigned_press TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS sil_logo TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS arc_mark TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS slitting_mark TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS tracker_line TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'Standard';
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS printing TEXT DEFAULT 'Reverse';
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS invoice_to TEXT DEFAULT 'Samyak International Ltd';
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS shell_size TEXT;
ALTER TABLE public.cylinders ADD COLUMN IF NOT EXISTS pet_size TEXT;

ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS date_filled DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS total_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS wastage_percentage NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS overall_scrap_pct_of_output NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS overall_scrap_pct_of_dispatch NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS gross_production_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS net_usable_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS printing_plain_setting_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS printing_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS lamination_plain_substrate_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS printed_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS laminate_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS trim_wastage_kg NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS total_material_cost_rs NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS processing_cost_per_kg NUMERIC DEFAULT 25;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS total_processing_cost_rs NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS final_production_cost_rs NUMERIC DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS filled_by TEXT;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS approval_date TEXT;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS materials_list JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS process_logs JSONB;

-- VIEW: HIGH SCRAP & WASTAGE AUDIT REGISTRY (threshold >= 5.0%)
CREATE OR REPLACE VIEW public.high_scrap_audit_registry AS
SELECT 
    pr.id AS record_id,
    pr.order_id,
    pr.job_name,
    pr.client_name,
    pr.operator_name,
    pr.shift,
    COALESCE(pr.date_filled, pr.recorded_at::date) AS record_date,
    pr.gross_production_kg,
    pr.net_usable_kg,
    pr.total_wastage_kg,
    pr.wastage_percentage,
    pr.overall_scrap_pct_of_output,
    pr.overall_scrap_pct_of_dispatch,
    pr.printing_plain_setting_wastage_kg,
    pr.printing_wastage_kg,
    pr.lamination_plain_substrate_wastage_kg,
    pr.printed_wastage_kg,
    pr.laminate_wastage_kg,
    pr.trim_wastage_kg,
    pr.final_production_cost_rs,
    pr.status,
    pr.filled_by,
    pr.approved_by,
    pr.notes,
    CASE 
        WHEN pr.wastage_percentage >= 5.0 THEN TRUE 
        ELSE FALSE 
    END AS is_high_scrap_alert
FROM public.production_records pr
ORDER BY pr.recorded_at DESC;

-- Enable Row Level Security (RLS) & default open access rules
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
ALTER TABLE public.printing_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read-write for orders" ON public.orders;
CREATE POLICY "Allow public read-write for orders" ON public.orders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for vendors" ON public.vendors;
CREATE POLICY "Allow public read-write for vendors" ON public.vendors FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for clients" ON public.clients;
CREATE POLICY "Allow public read-write for clients" ON public.clients FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for inventory" ON public.inventory;
CREATE POLICY "Allow public read-write for inventory" ON public.inventory FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for grns" ON public.grns;
CREATE POLICY "Allow public read-write for grns" ON public.grns FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for cylinders" ON public.cylinders;
CREATE POLICY "Allow public read-write for cylinders" ON public.cylinders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for production_records" ON public.production_records;
CREATE POLICY "Allow public read-write for production_records" ON public.production_records FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for users" ON public.users;
CREATE POLICY "Allow public read-write for users" ON public.users FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for job_datasheets" ON public.job_datasheets;
CREATE POLICY "Allow public read-write for job_datasheets" ON public.job_datasheets FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for job_masters" ON public.job_masters;
CREATE POLICY "Allow public read-write for job_masters" ON public.job_masters FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for inventory_rolls" ON public.inventory_rolls;
CREATE POLICY "Allow public read-write for inventory_rolls" ON public.inventory_rolls FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for dispatch_shipments" ON public.dispatch_shipments;
CREATE POLICY "Allow public read-write for dispatch_shipments" ON public.dispatch_shipments FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for printing_machines" ON public.printing_machines;
CREATE POLICY "Allow public read-write for printing_machines" ON public.printing_machines FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for production_schedules" ON public.production_schedules;
CREATE POLICY "Allow public read-write for production_schedules" ON public.production_schedules FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for inks" ON public.inks;
CREATE POLICY "Allow public read-write for inks" ON public.inks FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for audit_logs" ON public.audit_logs;
CREATE POLICY "Allow public read-write for audit_logs" ON public.audit_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for system_settings" ON public.system_settings;
CREATE POLICY "Allow public read-write for system_settings" ON public.system_settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for sales_quotations" ON public.sales_quotations;
CREATE POLICY "Allow public read-write for sales_quotations" ON public.sales_quotations FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for email_settings" ON public.email_settings;
CREATE POLICY "Allow public read-write for email_settings" ON public.email_settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read-write for email_templates" ON public.email_templates;
CREATE POLICY "Allow public read-write for email_templates" ON public.email_templates FOR ALL USING (true);

-- Column extensions & updates for backward compatibility
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

ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS structure TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS print_width_mm NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS repeat_length_mm NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS pouch_open_width NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS pouch_height NUMERIC;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS layers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS cylinder_sku TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS engravures_name TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS utilisation_limit NUMERIC DEFAULT 10000;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS job_card_file_name TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS job_card_file_url TEXT;
ALTER TABLE public.job_masters ADD COLUMN IF NOT EXISTS creation_date DATE;

-- STORAGE BUCKETS FOR PACKAGING ARTWORK & DOCUMENTS
INSERT INTO storage.buckets (id, name, public) 
VALUES ('erp-files', 'erp-files', true), ('artwork', 'artwork', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
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
END $$;`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlSchemaSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configured = isSupabaseConfigured();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner / Actions Bar */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', 
              padding: '14px', 
              borderRadius: '12px', 
              color: 'white',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
            }}>
              <Database size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Supabase Database Integration
                </h2>
                <span className={`badge ${connectionState.connected ? 'badge-us' : configured ? 'badge-warning' : 'badge-client'}`} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                  {connectionState.connected ? '● ONLINE' : configured ? '● UNVERIFIED' : '○ DISCONNECTED'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                Manage live PostgreSQL connection, API credentials, schema scripts, and cloud data synchronization
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={runConnectionCheck}
              disabled={loading}
              className="btn-primary"
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              onClick={handleInitBuckets}
              disabled={initializingBuckets || !isSupabaseConfigured()}
              className="btn-primary"
              style={{ background: '#0284c7', borderColor: '#0284c7', opacity: (!isSupabaseConfigured() || initializingBuckets) ? 0.6 : 1 }}
              title="Create or verify public storage bucket erp-files and artwork in Supabase"
            >
              <Cloud size={16} className={initializingBuckets ? 'animate-spin' : ''} />
              {initializingBuckets ? 'Configuring...' : 'Setup Storage Buckets'}
            </button>

            <button
              onClick={handlePurgeSupabaseData}
              disabled={seeding || !isSupabaseConfigured()}
              className="btn-secondary"
              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', opacity: (!isSupabaseConfigured() || seeding) ? 0.6 : 1 }}
              title="Wipe all data from Supabase tables"
            >
              <Trash2 size={15} />
              Purge Remote Data
            </button>
          </div>
        </div>
      </div>

      {/* Seed Operation Notification */}
      {seedResult && (
        <div style={{
          padding: '14px 20px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyInBetween: 'space-between',
          background: seedResult.success ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${seedResult.success ? '#a7f3d0' : '#fecaca'}`,
          color: seedResult.success ? '#047857' : '#b91c1c'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', fontWeight: '500' }}>
            {seedResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{seedResult.message}</span>
          </div>
          <button 
            onClick={() => setSeedResult(null)} 
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'inherit', fontWeight: '600' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Subtab Navigation Pills */}
      <div className="scrollable-tabs-container" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveSubTab('status')}
          className={`tab-pill ${activeSubTab === 'status' ? 'active' : ''}`}
        >
          <Server size={16} />
          Connection Overview
        </button>
        <button
          onClick={() => setActiveSubTab('config')}
          className={`tab-pill ${activeSubTab === 'config' ? 'active' : ''}`}
        >
          <Key size={16} />
          Credentials & API Setup
        </button>
        <button
          onClick={() => setActiveSubTab('schema')}
          className={`tab-pill ${activeSubTab === 'schema' ? 'active' : ''}`}
        >
          <FileCode size={16} />
          SQL Schema Script
        </button>
        <button
          onClick={() => setActiveSubTab('auth')}
          className={`tab-pill ${activeSubTab === 'auth' ? 'active' : ''}`}
        >
          <ShieldCheck size={16} />
          Supabase Auth & Roles
        </button>
      </div>

      {/* SUBTAB 1: CONNECTION OVERVIEW */}
      {activeSubTab === 'status' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          
          {/* Main Status & Health Panel */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} style={{ color: '#059669' }} />
                Supabase Status & Health
              </h3>
            </div>

            {/* Status Alert Banner */}
            <div style={{
              padding: '16px 20px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              background: connectionState.connected ? '#ecfdf5' : configured ? '#fffbeb' : '#fef2f2',
              border: `1px solid ${connectionState.connected ? '#a7f3d0' : configured ? '#fde68a' : '#fecaca'}`
            }}>
              {connectionState.connected ? (
                <CheckCircle2 size={24} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
              ) : configured ? (
                <AlertCircle size={24} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <XCircle size={24} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ 
                    fontWeight: '700', 
                    fontSize: '0.95rem',
                    color: connectionState.connected ? '#047857' : configured ? '#b45309' : '#b91c1c' 
                  }}>
                    {connectionState.connected
                      ? 'Database Live & Connected'
                      : configured
                      ? 'Credentials Configured (Verification Pending)'
                      : 'Supabase Not Configured'}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  {connectionState.message || 'Configure your Supabase URL & API key to connect to PostgreSQL.'}
                </p>
              </div>
            </div>

            {/* Quick Details Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="glass-card" style={{ padding: '16px', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Project URL
                </span>
                <span style={{ 
                  display: 'block', 
                  marginTop: '6px', 
                  fontSize: '0.85rem', 
                  fontFamily: 'monospace', 
                  fontWeight: '600',
                  color: urlInput ? '#047857' : 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {urlInput || 'Not configured'}
                </span>
              </div>

              <div className="glass-card" style={{ padding: '16px', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Anon API Key Status
                </span>
                <span style={{ 
                  display: 'block', 
                  marginTop: '6px', 
                  fontSize: '0.85rem', 
                  fontFamily: 'monospace', 
                  fontWeight: '600',
                  color: keyInput ? 'var(--text-primary)' : 'var(--text-muted)'
                }}>
                  {keyInput ? `${keyInput.substring(0, 18)}...` : 'Not configured'}
                </span>
              </div>
            </div>

            {/* Setup Guide */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                Quick Setup Instructions
              </h4>
              <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <li>
                  Create a free project on <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: '600', textDecoration: 'none' }}>Supabase.com</a>.
                </li>
                <li>
                  Go to <strong>Project Settings &gt; API</strong> and copy your <strong>Project URL</strong> and <strong>anon public key</strong>.
                </li>
                <li>
                  Paste them in the <strong>Credentials & API Setup</strong> tab or add them to your <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>.env</code> file as <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>VITE_SUPABASE_URL</code> and <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>VITE_SUPABASE_ANON_KEY</code>.
                </li>
                <li>
                  Run the SQL schema provided under the <strong>SQL Schema Script</strong> tab in your Supabase SQL Editor to create all 14 tables and access policies.
                </li>
                <li>
                  Go to <strong>Storage</strong> in Supabase Dashboard &gt; <strong>New bucket</strong> &gt; Name it <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a', fontWeight: '700' }}>erp-files</code> &gt; Toggle <strong>Public bucket</strong> to ON &gt; Save.
                </li>
              </ol>
            </div>

          </div>

          {/* Side Info / Quick Links Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} style={{ color: '#059669' }} />
                Supabase Console Links
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Quick shortcuts to manage tables, users, security policies, and SQL editor in your Supabase project.
              </p>

              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ justifyContent: 'space-between', width: '100%', textDecoration: 'none' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ExternalLink size={16} style={{ color: '#059669' }} />
                  Supabase Dashboard
                </span>
                <ArrowRight size={14} style={{ opacity: 0.6 }} />
              </a>

              <a
                href="https://supabase.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ justifyContent: 'space-between', width: '100%', textDecoration: 'none' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCode size={16} style={{ color: '#0d9488' }} />
                  Documentation & API
                </span>
                <ArrowRight size={14} style={{ opacity: 0.6 }} />
              </a>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} style={{ color: '#4f46e5' }} />
                Synced ERP Modules
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['Orders & POs', 'Vendors', 'Inventory & Stock', 'GRN & QC', 'Cylinders', 'Production Logs', 'User Accounts', 'Job Data Sheets'].map((mod, idx) => (
                  <span key={idx} style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: '500', 
                    background: '#f1f5f9', 
                    border: '1px solid var(--border-color)', 
                    padding: '4px 8px', 
                    borderRadius: '6px',
                    color: 'var(--text-secondary)'
                  }}>
                    ✓ {mod}
                  </span>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* SUBTAB 2: CREDENTIALS SETUP */}
      {activeSubTab === 'config' && (
        <div className="glass-panel" style={{ padding: '28px', maxWidth: '800px' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={20} style={{ color: '#059669' }} />
              Configure Supabase Credentials
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Credentials saved here are stored securely in browser LocalStorage and override environment defaults immediately.
            </p>
          </div>

          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Supabase Project URL <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '400' }}>(VITE_SUPABASE_URL)</code>
              </label>
              <input
                type="text"
                placeholder="https://your-project-id.supabase.co"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Supabase Anon Public API Key <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '400' }}>(VITE_SUPABASE_ANON_KEY)</code>
              </label>
              <input
                type="password"
                placeholder={isSupabaseConfigured() ? '•••••••••••••••• (Configured)' : 'Enter Supabase Anon API Key...'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
              <button
                type="submit"
                className="btn-primary"
                style={{ background: '#059669', borderColor: '#059669' }}
              >
                <Check size={16} /> Save & Test Credentials
              </button>
              <button
                type="button"
                onClick={handleClearConfig}
                className="btn-secondary"
              >
                Reset to Defaults
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 3: SQL SCHEMA */}
      {activeSubTab === 'schema' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={20} style={{ color: '#059669' }} />
                Database Tables & DDL Initialization Script
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Copy and run this SQL script inside your Supabase project's <strong>SQL Editor</strong> tab to set up required tables & policies.
              </p>
            </div>
            <button
              onClick={copySqlToClipboard}
              className="btn-secondary"
            >
              {copied ? <Check size={16} style={{ color: '#059669' }} /> : <Copy size={16} />}
              {copied ? 'Copied to Clipboard!' : 'Copy SQL Script'}
            </button>
          </div>

          <pre style={{
            background: '#0f172a',
            color: '#34d399',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            fontSize: '0.82rem',
            fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
            lineHeight: '1.6',
            overflowX: 'auto',
            maxHeight: '400px'
          }}>
            {sqlSchemaSnippet}
          </pre>
        </div>
      )}

      {/* SUBTAB 4: SUPABASE AUTH & ROLES */}
      {activeSubTab === 'auth' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} style={{ color: '#059669' }} />
                Supabase Authentication & Role Sync
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Automated Cloud User Authentication, JWT Tokens, and PostgreSQL User Sync Triggers
              </p>
            </div>
            <span className={`badge ${isSupabaseConfigured() ? 'badge-us' : 'badge-warning'}`} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              {isSupabaseConfigured() ? '✓ Supabase Auth Enabled' : '⚠ Local Auth Mode Active'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} style={{ color: '#059669' }} />
                1. Enable Email / Password Provider
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                In your Supabase project dashboard, navigate to <strong>Authentication &rarr; Providers &rarr; Email</strong> and confirm that <em>Enable Email Provider</em> is toggled <strong>ON</strong>.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: '#4f46e5' }} />
                2. Automated User Sync Trigger
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                When users register or log in via Supabase Auth, PostgreSQL trigger <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>on_auth_user_created</code> synchronizes profile and RBAC roles to <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>public.users</code>.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PostgreSQL User Sync Trigger SQL Function
            </h4>
            <pre style={{
              background: '#0f172a',
              color: '#34d399',
              padding: '18px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              fontSize: '0.8rem',
              fontFamily: 'Consolas, Monaco, monospace',
              lineHeight: '1.5',
              overflowX: 'auto'
            }}>
{`CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
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
$$ LANGUAGE plpgsql SECURITY DEFINER;`}
            </pre>
          </div>

        </div>
      )}

    </div>
  );
}
