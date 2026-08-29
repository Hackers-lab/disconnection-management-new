import { createClient, type Client } from "@libsql/client"
import { db } from "./db"

// In-memory fallback map for environments without configured external KV credentials
const memoryStore = new Map<string, { value: any; expiresAt?: number }>()

let tursoTableInitialized = false

// Helper: Wrap any promise with a strict timeout (default 1200ms)
function withTimeout<T>(promise: Promise<T>, timeoutMs = 1200, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(fallback)
      }
    }, timeoutMs)

    promise
      .then((res) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(res)
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          console.warn("[kv-store] operation error, using fallback:", err?.message || err)
          resolve(fallback)
        }
      })
  })
}

function getTursoClient(): Client | null {
  return db as any
}

async function ensureTursoTable(client: Client) {
  if (tursoTableInitialized) return
  try {
    const p = client.execute(`
      CREATE TABLE IF NOT EXISTS system_kv_store (
        key TEXT PRIMARY KEY,
        value TEXT,
        expires_at INTEGER
      );
    `)
    await withTimeout(p, 1000, null)
    tursoTableInitialized = true

    // Create index on expires_at if not exists for lightning-fast queries
    client.execute(`CREATE INDEX IF NOT EXISTS idx_kv_expires ON system_kv_store (expires_at);`).catch(() => {})
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
  
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    return data.result
  } catch {
    return null
  }
}

export function getTenantKey(tenantId: string, suffix: string): string {
  const cleanTenant = (tenantId || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
  const cleanSuffix = suffix.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_")
  return `tenant_${cleanTenant}:${cleanSuffix}`
}

export async function getKV<T>(key: string): Promise<T | null> {
  try {
    // 1. Fast in-memory cache check (< 0.1ms, 0 DB reads)
    const entry = memoryStore.get(key)
    if (entry) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        memoryStore.delete(key)
      } else {
        return entry.value as T
      }
    }

    if (hasExternalKV()) {
      const result = await withTimeout(kvRestCall("get", key), 1200, null)
      if (result !== null && result !== undefined) {
        try {
          const parsed = typeof result === "string" ? JSON.parse(result) : (result as T)
          memoryStore.set(key, { value: parsed, expiresAt: Date.now() + 10_000 })
          return parsed
        } catch {
          memoryStore.set(key, { value: result, expiresAt: Date.now() + 10_000 })
          return result as T
        }
      }
    }

    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const res = await withTimeout(
        turso.execute({
          sql: "SELECT value, expires_at FROM system_kv_store WHERE key = ?",
          args: [key],
        }),
        1200,
        null
      )
      if (res && res.rows && res.rows.length > 0) {
        const row = res.rows[0]
        const expiresAt = row.expires_at ? Number(row.expires_at) : undefined
        if (expiresAt && Date.now() > expiresAt) {
          withTimeout(turso.execute({ sql: "DELETE FROM system_kv_store WHERE key = ?", args: [key] }), 800, null).catch(() => {})
          return null
        }
        const valStr = String(row.value)
        let parsed: T
        try {
          parsed = JSON.parse(valStr) as T
        } catch {
          parsed = valStr as unknown as T
        }
        // Cache in memory for 10 seconds or remaining TTL to prevent repeat reads
        const memTtl = expiresAt ? Math.min(expiresAt, Date.now() + 10_000) : Date.now() + 10_000
        memoryStore.set(key, { value: parsed, expiresAt: memTtl })
        return parsed
      }
    }

    return null
  } catch (err) {
    console.warn(`[kv-store] Error reading key "${key}":`, err)
    return null
  }
}

export async function setKV<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  // Always update memory store immediately
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
  memoryStore.set(key, { value, expiresAt })

  try {
    if (hasExternalKV()) {
      const jsonVal = JSON.stringify(value)
      if (ttlSeconds) {
        withTimeout(kvRestCall("set", key, jsonVal, "EX", ttlSeconds), 1200, null).catch(() => {})
      } else {
        withTimeout(kvRestCall("set", key, jsonVal), 1200, null).catch(() => {})
      }
      return
    }

    const turso = getTursoClient()
    if (turso) {
      ensureTursoTable(turso).then(() => {
        const jsonVal = JSON.stringify(value)
        const exp = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
        withTimeout(
          turso.execute({
            sql: `INSERT INTO system_kv_store (key, value, expires_at) VALUES (?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
            args: [key, jsonVal, exp],
          }),
          1200,
          null
        ).catch(() => {})
      }).catch(() => {})
    }
  } catch (err) {
    console.warn(`[kv-store] Error writing key "${key}":`, err)
  }
}

export async function incrKV(key: string): Promise<number> {
  const current = (await getKV<number>(key)) || 0
  const next = current + 1
  setKV(key, next).catch(() => {})
  return next
}

export async function deleteKV(key: string): Promise<void> {
  memoryStore.delete(key)
  try {
    if (hasExternalKV()) {
      withTimeout(kvRestCall("del", key), 1200, null).catch(() => {})
      return
    }

    const turso = getTursoClient()
    if (turso) {
      withTimeout(turso.execute({ sql: "DELETE FROM system_kv_store WHERE key = ?", args: [key] }), 1200, null).catch(() => {})
    }
  } catch (err) {
    console.warn(`[kv-store] Error deleting key "${key}":`, err)
  }
}

export async function getAllTenantKV(prefix = "tenant_"): Promise<Record<string, any>> {
  const result: Record<string, any> = {}

  // Populate from memory store first
  for (const [k, v] of memoryStore.entries()) {
    if (k.startsWith(prefix)) {
      if (v.expiresAt && Date.now() > v.expiresAt) continue
      result[k] = v.value
    }
  }

  try {
    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const res = await withTimeout(
        turso.execute({
          sql: "SELECT key, value, expires_at FROM system_kv_store WHERE key LIKE ?",
          args: [`${prefix}%`],
        }),
        1200,
        null
      )
      if (res && res.rows) {
        for (const row of res.rows) {
          const expiresAt = row.expires_at ? Number(row.expires_at) : undefined
          if (expiresAt && Date.now() > expiresAt) continue
          const key = String(row.key)
          const valStr = String(row.value)
          try {
            result[key] = JSON.parse(valStr)
          } catch {
            result[key] = valStr
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[kv-store] Error in getAllTenantKV Turso query:`, err)
  }

  return result
}
