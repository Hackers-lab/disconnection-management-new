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
  ]
  Promise.all(idxStatements.map(sql => client.execute(sql))).catch(() => {})
}

export const db = getDb()
