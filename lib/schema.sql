-- 1. CCC Registry Table (Includes Drive Refresh Token & Contact Mobile)
CREATE TABLE IF NOT EXISTS ccc_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_code TEXT UNIQUE NOT NULL,
    ccc_name TEXT NOT NULL,
    spreadsheet_id TEXT,
    drive_folder_id TEXT,
    drive_refresh_token TEXT,                 -- Extracted from Index 4 in CCC_Registry tab
    contact_person TEXT,
    mobile_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ccc_code ON ccc_registry (ccc_code);
CREATE INDEX IF NOT EXISTS idx_ccc_code_nocase ON ccc_registry (ccc_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_ccc_mobile ON ccc_registry (mobile_number);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users (mobile_number);

-- 2. System Default Roles & Permissions (Master Base Catalog)
CREATE TABLE IF NOT EXISTS system_default_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT UNIQUE NOT NULL,
    disconnection TEXT DEFAULT '',
    reconnection TEXT DEFAULT '',
    deemed TEXT DEFAULT '',
    dtr TEXT DEFAULT '',
    meter TEXT DEFAULT '',
    nsc TEXT DEFAULT '',
    consumer_master TEXT DEFAULT '',
    admin TEXT DEFAULT '',
    meter_replacement TEXT DEFAULT '',
    dtr_painting TEXT DEFAULT '',
    material TEXT DEFAULT '',
    osd TEXT DEFAULT '',
    safety TEXT DEFAULT '',
    misc_inspection TEXT DEFAULT '',
    icds TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2.1 CCC Role Overrides (Only stored when a specific CCC customizes/differs from default)
CREATE TABLE IF NOT EXISTS ccc_role_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    disconnection TEXT DEFAULT '',
    reconnection TEXT DEFAULT '',
    deemed TEXT DEFAULT '',
    dtr TEXT DEFAULT '',
    meter TEXT DEFAULT '',
    nsc TEXT DEFAULT '',
    consumer_master TEXT DEFAULT '',
    admin TEXT DEFAULT '',
    meter_replacement TEXT DEFAULT '',
    dtr_painting TEXT DEFAULT '',
    material TEXT DEFAULT '',
    osd TEXT DEFAULT '',
    safety TEXT DEFAULT '',
    misc_inspection TEXT DEFAULT '',
    icds TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ccc_id, role)
);
CREATE INDEX IF NOT EXISTS idx_role_overrides_ccc ON ccc_role_overrides (ccc_id, role);


-- 3. Agencies Table
CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_code TEXT UNIQUE,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    contact_person TEXT,
    mobile_number TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agencies_ccc_id ON agencies (ccc_id);
CREATE INDEX IF NOT EXISTS idx_agencies_vendor ON agencies (vendor_code);

-- 4. Agency Aliases Table
CREATE TABLE IF NOT EXISTS agency_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ccc_id, alias_name)
);
CREATE INDEX IF NOT EXISTS idx_agency_alias ON agency_aliases (ccc_id, alias_name);

-- 5. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    mobile_number TEXT UNIQUE,
    email TEXT UNIQUE,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    ccc_id INTEGER REFERENCES ccc_registry(id),
    agencies TEXT DEFAULT '',
    status TEXT DEFAULT 'ACTIVE',
    subscription_status TEXT DEFAULT 'active',
    subscription_expires_at TEXT,
    bypass_subscription BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_ccc_id ON users (ccc_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_username_nocase ON users (username COLLATE NOCASE);

-- 6. User Sessions Table (Refresh Tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT UNIQUE NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Master Consumer Table (Exact 16 Column SAP Schema)
CREATE TABLE IF NOT EXISTS master_consumers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    con_id TEXT NOT NULL,                   -- Consumer 9-Digit ID
    inst_no TEXT,                           -- Installation No
    name TEXT,
    address TEXT,
    date_of_co TEXT,                        -- Date of Connection
    base_class TEXT,
    conn_stat TEXT DEFAULT '',              -- ''=LIVE, 'TD', 'DD', 'PD'
    conn_phase TEXT,
    govt_stat TEXT,
    conn_load TEXT,
    mru TEXT,
    meter_no TEXT,
    dtr_number TEXT,
    reg_mob_no TEXT,
    zlatitude REAL,
    zlongitude REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ccc_id, con_id)
);
CREATE INDEX IF NOT EXISTS idx_master_ccc_con ON master_consumers (ccc_id, con_id);
CREATE INDEX IF NOT EXISTS idx_master_meter ON master_consumers (ccc_id, meter_no);

-- 8. Disconnection Records Table (Includes gis_pole and priority '' or 'P')
CREATE TABLE IF NOT EXISTS disconnection_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    master_consumer_id INTEGER NOT NULL REFERENCES master_consumers(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,                  -- Short key e.g. '2608'
    d2_net_os REAL NOT NULL DEFAULT 0,        -- Financial Outstanding Amount
    discon_status TEXT NOT NULL DEFAULT '',   -- ''=Pending, 'DC', 'DD', 'P', 'O', 'DI', 'RC'
    discon_date TEXT,
    agency_id INTEGER REFERENCES agencies(id),
    executed_by_user_id TEXT REFERENCES users(id),
    notes TEXT,
    reading TEXT,
    image_id TEXT,                            -- Drive File ID only
    priority TEXT DEFAULT '',                 -- ''=Normal, 'P'=Priority
    gis_pole TEXT,                            -- GIS Pole location
    paid_amount REAL DEFAULT 0,
    paid_date TEXT,
    paid_type TEXT,
    outstanding_after REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_discon_lookup ON disconnection_records (ccc_id, month_key, master_consumer_id);
CREATE INDEX IF NOT EXISTS idx_discon_status ON disconnection_records (ccc_id, discon_status);

-- 9. Reconnection Records Table (Compact - device/source removed)
CREATE TABLE IF NOT EXISTS reconnection_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    master_consumer_id INTEGER NOT NULL REFERENCES master_consumers(id) ON DELETE CASCADE,
    agency_id INTEGER REFERENCES agencies(id),
    status TEXT DEFAULT '',                   -- ''=Pending, 'RC'=Reconnected
    updated_by_user_id TEXT REFERENCES users(id),
    image_id TEXT,                            -- Reconnection image Drive File ID
    reading TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Compact Deemed Visit Records Table (No request_id string)
CREATE TABLE IF NOT EXISTS deemed_visit_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    master_consumer_id INTEGER NOT NULL REFERENCES master_consumers(id) ON DELETE CASCADE,
    agency_id INTEGER REFERENCES agencies(id),
    status TEXT NOT NULL DEFAULT 'DD',
    reason TEXT,
    image_id TEXT,                            -- Drive File ID only
    executed_by_user_id TEXT REFERENCES users(id),
    visit_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. DTR Assets & Inspections Tables
CREATE TABLE IF NOT EXISTS dtr_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    dtr_code TEXT NOT NULL,
    name TEXT NOT NULL,
    capacity_kva REAL,
    substation TEXT,
    gis_pole TEXT,
    zlatitude REAL,
    zlongitude REAL,
    image_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ccc_id, dtr_code)
);

CREATE TABLE IF NOT EXISTS dtr_inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dtr_asset_id INTEGER NOT NULL REFERENCES dtr_assets(id) ON DELETE CASCADE,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    inspection_date DATE NOT NULL,
    oil_level TEXT,
    bushing_condition TEXT,
    painting_status TEXT,
    kiosk_condition TEXT,
    la_condition TEXT,
    ne_condition TEXT,
    image_id TEXT,
    inspected_by_user_id TEXT REFERENCES users(id),
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Meter Inventory Stock Table
CREATE TABLE IF NOT EXISTS meter_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    serial_no TEXT UNIQUE NOT NULL,
    type_label TEXT,
    phase TEXT,
    ampere TEXT,
    is_smart BOOLEAN DEFAULT 0,
    condition TEXT DEFAULT 'available',
    received_date TEXT,
    batch_remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. Meter Replacements & Work Orders Table
CREATE TABLE IF NOT EXISTS meter_replacements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    master_consumer_id INTEGER NOT NULL REFERENCES master_consumers(id) ON DELETE CASCADE,
    replacement_id TEXT,
    issue_id TEXT,
    purpose TEXT,
    old_meter_no TEXT,
    new_meter_no TEXT NOT NULL,
    installation_no TEXT,
    note_sheet_no TEXT,
    wo_number TEXT,
    wo_date TEXT,
    replacement_date DATE,
    initial_reading REAL DEFAULT 0,
    final_reading REAL DEFAULT 0,
    image_id TEXT,
    executed_by_user_id TEXT REFERENCES users(id),
    agency_id INTEGER REFERENCES agencies(id),
    status TEXT DEFAULT 'replaced',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Check Meter Testing Table
CREATE TABLE IF NOT EXISTS check_meters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_replacement_id INTEGER REFERENCES meter_replacements(id) ON DELETE CASCADE,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    cross_check_date_1 TEXT,
    existing_meter_reading_1 REAL,
    check_meter_reading_1 REAL,
    cross_check_date_2 TEXT,
    existing_meter_reading_2 REAL,
    check_meter_reading_2 REAL,
    calculated_diff_units REAL,
    accuracy_percentage REAL,
    outcome TEXT,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Complete 38-Column NSC Applications Table
CREATE TABLE IF NOT EXISTS nsc_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    receive_no TEXT UNIQUE NOT NULL,
    application_no TEXT,
    received_date TEXT,
    applicant_name TEXT NOT NULL,
    care_of TEXT,
    address TEXT,
    mobile TEXT,
    applied_class TEXT,
    phase TEXT,
    load_requested_kw REAL,
    service_length_m REAL,
    pole_required TEXT,
    dtr_capacity TEXT,
    dtr_load TEXT,
    status TEXT DEFAULT 'SUBMITTED',
    assigned_agency_id INTEGER REFERENCES agencies(id),
    site_image_id TEXT,
    inspection_form_image_id TEXT,
    agency_decision TEXT,
    agency_remarks TEXT,
    inspected_at TEXT,
    inspected_by TEXT,
    admin_decision TEXT,
    admin_remarks TEXT,
    final_action TEXT,
    memo_no TEXT,
    office_ref_no TEXT,
    project_id TEXT,
    meter_serial_no TEXT,
    meter_issued_at TEXT,
    connection_effected_at TEXT,
    finalized_at TEXT,
    finalized_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Materials & Store Inventory Transactions Tables
CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    material_id TEXT,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    category TEXT,
    current_stock REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ccc_id, item_code)
);

CREATE TABLE IF NOT EXISTS material_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL,          -- 'RECEIVE', 'ISSUE'
    quantity REAL NOT NULL,
    agency_id INTEGER REFERENCES agencies(id),
    user_id TEXT REFERENCES users(id),
    recipient_name TEXT,
    purpose TEXT,
    reference_no TEXT,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 17. Complete Safety Inspections Table
CREATE TABLE IF NOT EXISTS safety_inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    safety_id TEXT,
    title TEXT NOT NULL,
    hazard_categories TEXT,
    severity TEXT,
    priority TEXT,
    location TEXT,
    address TEXT,
    dtr_code TEXT,
    zlatitude REAL,
    zlongitude REAL,
    agency_id INTEGER REFERENCES agencies(id),
    inspector_user_id TEXT REFERENCES users(id),
    physical_status TEXT,
    admin_status TEXT,
    note_sheet_no TEXT,
    po_number TEXT,
    before_image_id TEXT,
    after_image_id TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 18. Agency Zone Mappings Table
CREATE TABLE IF NOT EXISTS agency_zone_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    zone TEXT NOT NULL,
    agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ccc_id, zone)
);

-- 19. Subscriptions & Billing Tables
CREATE TABLE IF NOT EXISTS billing_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_name TEXT NOT NULL,
    price_per_agency_per_month REAL NOT NULL,
    included_actions INTEGER DEFAULT 5000,
    overage_rate REAL DEFAULT 0.50,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL UNIQUE REFERENCES ccc_registry(id) ON DELETE CASCADE,
    tier_type TEXT DEFAULT 'PRO',
    status TEXT DEFAULT 'ACTIVE',
    expires_at DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 20. User Feedbacks Table
CREATE TABLE IF NOT EXISTS user_feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id TEXT UNIQUE,
    user_id TEXT REFERENCES users(id),
    username TEXT NOT NULL,
    full_name TEXT,
    supply_office TEXT,
    ccc_id INTEGER REFERENCES ccc_registry(id),
    rating INTEGER DEFAULT 5,
    comment TEXT NOT NULL,
    status TEXT DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON user_feedbacks (status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_ccc ON user_feedbacks (username COLLATE NOCASE, ccc_id);

-- 21. Miscellaneous Inspections Table
CREATE TABLE IF NOT EXISTS misc_inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id TEXT UNIQUE,
    reference_no TEXT,
    reference_doc_url TEXT,
    category TEXT NOT NULL,                  -- SHIFTING, METER_CHECK, NETWORK_LINE, DTR_LOAD, NSC_DRAWING, GENERAL
    title TEXT NOT NULL,
    description TEXT,
    consumer_id TEXT,
    dtr_id TEXT,
    applicant_name TEXT,
    address TEXT,
    mobile TEXT,
    priority TEXT DEFAULT 'MEDIUM',
    agency_id INTEGER REFERENCES agencies(id),
    target_completion_date TEXT,
    status TEXT DEFAULT 'PENDING_AGENCY',
    created_by TEXT,
    site_image_ids_json TEXT,                -- Array of Drive Image IDs
    agency_decision TEXT,
    agency_remarks TEXT,
    inspected_at TEXT,
    inspected_by TEXT,
    admin_decision TEXT,
    admin_remarks TEXT,
    dynamic_fields_json TEXT,                -- Dynamic Category Specific Fields JSON
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_misc_ccc ON misc_inspections (ccc_id);

-- 22. Field Audit History Logs Table
CREATE TABLE IF NOT EXISTS field_history_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ccc_id INTEGER NOT NULL REFERENCES ccc_registry(id) ON DELETE CASCADE,
    consumer_id TEXT NOT NULL,
    name TEXT,
    action TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    old_osd REAL,
    old_notes TEXT,
    old_image_url TEXT,
    changed_by TEXT,
    event_date TEXT,
    timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_history_ccc_consumer ON field_history_logs (ccc_id, consumer_id);
