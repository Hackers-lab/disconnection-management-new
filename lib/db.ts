import { createClient, type Client } from "@libsql/client"
import path from "path"

// Singleton database connection client
let clientInstance: Client | null = null

export function getDb(): Client {
  if (clientInstance) return clientInstance

  const remoteUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  let url = remoteUrl || "file:turso_v4.db"
  if (!remoteUrl || remoteUrl.startsWith("file:")) {
    const rawFile = (remoteUrl || "file:turso_v4.db").replace(/^file:/, "")
    const absolutePath = path.isAbsolute(rawFile) ? rawFile : path.resolve(process.cwd(), rawFile)
    const normalizedPath = absolutePath.replace(/\\/g, "/")
    url = `file:${normalizedPath}`
  }

  clientInstance = createClient({
    url,
    authToken: url.startsWith("file:") ? undefined : authToken,
  })

  ensureIndexes(clientInstance)
  return clientInstance
}

function ensureIndexes(client: Client) {
  // Ensure essential tables exist (idempotent, non-blocking)
  client.execute(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ccc_code TEXT,
      agency_name TEXT,
      vendor_code TEXT,
      razorpay_order_id TEXT NOT NULL,
      razorpay_payment_id TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'INR',
      plan_id TEXT,
      plan_name TEXT,
      days_granted INTEGER,
      subscription_expires_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).catch(() => {})

  client.execute(`
    CREATE TABLE IF NOT EXISTS deleted_payment_transactions (
      razorpay_payment_id TEXT PRIMARY KEY,
      deleted_by TEXT,
      reason TEXT,
      deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {})

  // Ensure performance-critical indexes exist (idempotent, non-blocking)
  const idxStatements = [
    `CREATE INDEX IF NOT EXISTS idx_users_username_nocase ON users (username COLLATE NOCASE);`,
    `CREATE INDEX IF NOT EXISTS idx_users_mobile ON users (mobile_number);`,
    `CREATE INDEX IF NOT EXISTS idx_users_ccc_id ON users (ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);`,
    `CREATE INDEX IF NOT EXISTS idx_users_ccc_role ON users (ccc_id, role);`,
    `CREATE INDEX IF NOT EXISTS idx_ccc_code_nocase ON ccc_registry (ccc_code COLLATE NOCASE);`,
    `CREATE INDEX IF NOT EXISTS idx_ccc_name ON ccc_registry (ccc_name COLLATE NOCASE);`,
    `CREATE INDEX IF NOT EXISTS idx_agencies_ccc_id ON agencies (ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_agencies_ccc_active ON agencies (ccc_id, is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_agencies_ccc_name ON agencies (ccc_id, name COLLATE NOCASE);`,
    `CREATE INDEX IF NOT EXISTS idx_agencies_ccc_vendor ON agencies (ccc_id, vendor_code COLLATE NOCASE);`,
    `CREATE INDEX IF NOT EXISTS idx_master_ccc_con ON master_consumers (ccc_id, con_id);`,
    `CREATE INDEX IF NOT EXISTS idx_master_meter ON master_consumers (ccc_id, meter_no);`,
    `CREATE INDEX IF NOT EXISTS idx_discon_lookup ON disconnection_records (ccc_id, month_key, master_consumer_id);`,
    `CREATE INDEX IF NOT EXISTS idx_discon_status ON disconnection_records (ccc_id, discon_status);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_user_ccc ON user_feedbacks (username COLLATE NOCASE, ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_status_ccc ON user_feedbacks (status, ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_ccc ON user_feedbacks (ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_gis_captures_tenant ON GIS_captures (tenant_id, timestamp DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_user_presence_seen ON user_presence (last_seen DESC, is_online);`,
    `CREATE INDEX IF NOT EXISTS idx_role_overrides_ccc ON ccc_role_overrides (ccc_id, role);`,
    `CREATE INDEX IF NOT EXISTS idx_misc_ccc ON misc_inspections (ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_history_ccc_consumer ON field_history_logs (ccc_id, consumer_id);`,
    `CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions (user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_push_sub_target ON push_subscriptions (ccc_code, role);`,
    `CREATE INDEX IF NOT EXISTS idx_pt_user ON payment_transactions (user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_pt_ccc ON payment_transactions (ccc_code);`,
    `CREATE INDEX IF NOT EXISTS idx_pt_agency ON payment_transactions (agency_name);`,
    `CREATE INDEX IF NOT EXISTS idx_pt_rzp_order ON payment_transactions (razorpay_order_id);`,
  ]
  Promise.all(idxStatements.map(sql => client.execute(sql))).catch(() => {})
}

export const db = getDb()
