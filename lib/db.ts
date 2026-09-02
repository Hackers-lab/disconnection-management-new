import { createClient, Client } from "@libsql/client"
import path from "path"
import fs from "fs"

// Singleton database connection client
let clientInstance: Client | null = null

export function getDb(): Client {
  if (clientInstance) return clientInstance

  const remoteUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  // If no remote URL is configured or if explicitly using local file
  if (!remoteUrl || remoteUrl.startsWith("file:")) {
    clientInstance = createClient({
      url: remoteUrl || "file:turso_v4.db",
    })
    ensureIndexes(clientInstance)
    return clientInstance
  }

  // Determine local replica file path (/tmp on Vercel/serverless, .turso locally)
  const isVercel = process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  const localDir = isVercel ? "/tmp" : path.join(process.cwd(), ".turso")
  if (!fs.existsSync(localDir)) {
    try { fs.mkdirSync(localDir, { recursive: true }) } catch {}
  }
  const localDbPath = `file:${path.join(localDir, "turso_embedded.db")}`

  try {
    clientInstance = createClient({
      url: localDbPath,
      syncUrl: remoteUrl,
      authToken: authToken,
      syncInterval: 60,
    })

    // Perform non-blocking initial sync
    clientInstance.sync().catch(err => {
      console.warn("[Turso] Initial replica sync warning:", err.message)
    })
  } catch (e: any) {
    console.warn("[Turso] Embedded sync setup failed, falling back to direct cloud connection:", e.message)
    clientInstance = createClient({
      url: remoteUrl,
      authToken,
    })
  }

  ensureIndexes(clientInstance)
  return clientInstance
}

function ensureIndexes(client: Client) {
  // Ensure performance-critical indexes exist (idempotent, non-blocking)
  const idxStatements = [
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);`,
    `CREATE INDEX IF NOT EXISTS idx_users_ccc_role ON users (ccc_id, role);`,
    `CREATE INDEX IF NOT EXISTS idx_agencies_ccc_active ON agencies (ccc_id, is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_status_ccc ON user_feedbacks (status, ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_ccc ON user_feedbacks (ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_ccc_name ON ccc_registry (ccc_name COLLATE NOCASE);`,
    `CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions (user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_push_sub_target ON push_subscriptions (ccc_code, role);`,
  ]
  Promise.all(idxStatements.map(sql => client.execute(sql))).catch(() => {})
}

export const db = getDb()
