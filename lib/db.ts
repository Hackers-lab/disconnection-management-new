import { createClient, Client } from "@libsql/client"

// Singleton database connection client
let clientInstance: Client | null = null

export function getDb(): Client {
  if (clientInstance) return clientInstance

  const url = process.env.TURSO_DATABASE_URL || "file:turso_v4.db"
  const authToken = url.startsWith("file:") ? undefined : process.env.TURSO_AUTH_TOKEN

  clientInstance = createClient({
    url,
    authToken,
  })

  // Ensure performance-critical indexes exist (idempotent, non-blocking)
  const idxStatements = [
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);`,
    `CREATE INDEX IF NOT EXISTS idx_users_ccc_role ON users (ccc_id, role);`,
    `CREATE INDEX IF NOT EXISTS idx_agencies_ccc_active ON agencies (ccc_id, is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_status_ccc ON user_feedbacks (status, ccc_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_ccc ON user_feedbacks (ccc_id);`,
  ]
  Promise.all(idxStatements.map(sql => clientInstance!.execute(sql))).catch(() => {})

  return clientInstance
}

export const db = getDb()
