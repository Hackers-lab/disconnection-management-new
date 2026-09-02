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
