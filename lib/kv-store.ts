import { createClient, Client } from "@libsql/client"
import { db } from "./db"

// In-memory fallback map for environments without configured external KV credentials
const memoryStore = new Map<string, { value: any; expiresAt?: number }>()

let tursoTableInitialized = false

function getTursoClient(): Client | null {
  return db as any
}

async function ensureTursoTable(client: Client) {
  if (tursoTableInitialized) return
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS system_kv_store (
        key TEXT PRIMARY KEY,
        value TEXT,
        expires_at INTEGER
      );
    `)
    tursoTableInitialized = true
  } catch (err) {
    console.warn("[kv-store] Error creating system_kv_store table in Turso:", err)
  }
}

function getKvApiConfig(): { url?: string; token?: string } {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN
  return { url, token }
}

function hasExternalKV(): boolean {
  const { url, token } = getKvApiConfig()
  return Boolean(url && token)
}

async function kvRestCall(command: string, ...args: (string | number)[]): Promise<any> {
  const { url: rawUrl, token } = getKvApiConfig()
  if (!rawUrl || !token) return null

  const baseUrl = rawUrl.replace(/\/$/, "")
  const url = `${baseUrl}/${command}/${args.map(a => encodeURIComponent(String(a))).join("/")}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.result
}

export function getTenantKey(tenantId: string, suffix: string): string {
  const cleanTenant = (tenantId || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
  const cleanSuffix = suffix.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_")
  return `tenant_${cleanTenant}:${cleanSuffix}`
}

export async function getKV<T>(key: string): Promise<T | null> {
  try {
    if (hasExternalKV()) {
      const result = await kvRestCall("get", key)
      if (result === null || result === undefined) return null
      try {
        return typeof result === "string" ? JSON.parse(result) : (result as T)
      } catch {
        return result as T
      }
    }

    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const res = await turso.execute({
        sql: "SELECT value, expires_at FROM system_kv_store WHERE key = ?",
        args: [key],
      })
      if (res.rows.length > 0) {
        const row = res.rows[0]
        const expiresAt = row.expires_at ? Number(row.expires_at) : undefined
        if (expiresAt && Date.now() > expiresAt) {
          await turso.execute({ sql: "DELETE FROM system_kv_store WHERE key = ?", args: [key] })
          return null
        }
        const valStr = String(row.value)
        try {
          return JSON.parse(valStr) as T
        } catch {
          return valStr as unknown as T
        }
      }
      return null
    }

    // Fallback to in-memory store
    const entry = memoryStore.get(key)
    if (entry) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        memoryStore.delete(key)
        return null
      }
      return entry.value as T
    }
    return null
  } catch (err) {
    console.warn(`[kv-store] Error reading key "${key}":`, err)
    return null
  }
}

export async function setKV<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  try {
    if (hasExternalKV()) {
      const jsonVal = JSON.stringify(value)
      if (ttlSeconds) {
        await kvRestCall("set", key, jsonVal, "EX", ttlSeconds)
      } else {
        await kvRestCall("set", key, jsonVal)
      }
      return
    }

    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const jsonVal = JSON.stringify(value)
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
      await turso.execute({
        sql: `INSERT INTO system_kv_store (key, value, expires_at) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
        args: [key, jsonVal, expiresAt],
      })
      return
    }

    // Fallback to in-memory store
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
    memoryStore.set(key, { value, expiresAt })
  } catch (err) {
    console.warn(`[kv-store] Error writing key "${key}":`, err)
  }
}

export async function incrKV(key: string): Promise<number> {
  try {
    if (hasExternalKV()) {
      const res = await kvRestCall("incr", key)
      return Number(res || 1)
    }

    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const current = (await getKV<number>(key)) || 0
      const next = current + 1
      await setKV(key, next)
      return next
    }

    // Fallback to in-memory store
    const current = (await getKV<number>(key)) || 0
    const next = current + 1
    await setKV(key, next)
    return next
  } catch (err) {
    console.warn(`[kv-store] Error incrementing key "${key}":`, err)
    return 1
  }
}

export async function deleteKV(key: string): Promise<void> {
  try {
    if (hasExternalKV()) {
      await kvRestCall("del", key)
      return
    }

    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      await turso.execute({ sql: "DELETE FROM system_kv_store WHERE key = ?", args: [key] })
      return
    }

    // Fallback to in-memory store
    memoryStore.delete(key)
  } catch (err) {
    console.warn(`[kv-store] Error deleting key "${key}":`, err)
  }
}
