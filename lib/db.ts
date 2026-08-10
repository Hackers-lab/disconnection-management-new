import { createClient, Client } from "@libsql/client"

// Singleton database connection client
let clientInstance: Client | null = null

export function getDb(): Client {
  if (clientInstance) return clientInstance

  const url = process.env.TURSO_DATABASE_URL || "file:turso_v4.db"
  const authToken = process.env.TURSO_AUTH_TOKEN

  clientInstance = createClient({
    url,
    authToken,
  })

  return clientInstance
}

export const db = getDb()
