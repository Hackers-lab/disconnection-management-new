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

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)

    // Use POST JSON body to avoid URL length limits (especially for patch_log arrays)
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([command.toUpperCase(), ...args.map((a) => String(a))]),
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

async function kvPipelineCall(commands: string[][]): Promise<any[] | null> {
  const { url: rawUrl, token } = getKvApiConfig()
  if (!rawUrl || !token || commands.length === 0) return null

  const baseUrl = rawUrl.replace(/\/$/, "")
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)

    const res = await fetch(`${baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data : null
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
      const result = await withTimeout(kvRestCall("GET", key), 1800, null)
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
        1800,
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
        await withTimeout(kvRestCall("SET", key, jsonVal, "EX", ttlSeconds), 2000, null)
      } else {
        await withTimeout(kvRestCall("SET", key, jsonVal), 2000, null)
      }
      return
    }

    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const jsonVal = JSON.stringify(value)
      const exp = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
      await withTimeout(
        turso.execute({
          sql: `INSERT INTO system_kv_store (key, value, expires_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
          args: [key, jsonVal, exp],
        }),
        2000,
        null
      )
    }
  } catch (err) {
    console.warn(`[kv-store] Error writing key "${key}":`, err)
  }
}

export async function incrKV(key: string): Promise<number> {
  const current = (await getKV<number>(key)) || 0
  const next = Number(current) + 1
  await setKV(key, next)
  return next
}

export async function deleteKV(key: string): Promise<void> {
  memoryStore.delete(key)
  try {
    if (hasExternalKV()) {
      await withTimeout(kvRestCall("DEL", key), 1800, null)
      return
    }

    const turso = getTursoClient()
    if (turso) {
      await withTimeout(turso.execute({ sql: "DELETE FROM system_kv_store WHERE key = ?", args: [key] }), 1800, null)
    }
  } catch (err) {
    console.warn(`[kv-store] Error deleting key "${key}":`, err)
  }
}

export async function getAllTenantKV(prefix = "tenant_"): Promise<Record<string, any>> {
  const result: Record<string, any> = {}

  // 1. Populate from in-memory store first (baseline fallback)
  for (const [k, v] of memoryStore.entries()) {
    if (k.startsWith(prefix)) {
      if (v.expiresAt && Date.now() > v.expiresAt) continue
      result[k] = v.value
    }
  }

  // 2. Query Turso store (used when external KV is absent or for legacy rows)
  try {
    const turso = getTursoClient()
    if (turso) {
      await ensureTursoTable(turso)
      const res = await withTimeout(
        turso.execute({
          sql: "SELECT key, value, expires_at FROM system_kv_store WHERE key LIKE ?",
          args: [`${prefix}%`],
        }),
        5000,
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

  // 3. Query External KV (Upstash / Vercel KV) if configured — authoritative source when enabled
  if (hasExternalKV()) {
    try {
      const matchedKeys = new Set<string>()
      let cursor = "0"
      const maxIterations = 25

      for (let i = 0; i < maxIterations; i++) {
        const scanRes = await withTimeout(
          kvRestCall("SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 500),
          4000,
          null
        )
        if (!Array.isArray(scanRes) || scanRes.length < 2) break
        const nextCursor = String(scanRes[0] ?? "0")
        const keysBatch = Array.isArray(scanRes[1]) ? scanRes[1] : []
        for (const k of keysBatch) {
          if (typeof k === "string" && k.startsWith(prefix)) {
            matchedKeys.add(k)
          }
        }
        cursor = nextCursor
        if (cursor === "0") break
      }

      const allKeys = Array.from(matchedKeys)
      const batchSize = 100
      for (let i = 0; i < allKeys.length; i += batchSize) {
        const slice = allKeys.slice(i, i + batchSize)
        const pipelineRes = await kvPipelineCall(slice.map((k) => ["GET", k]))
        if (!pipelineRes) continue

        for (let j = 0; j < slice.length; j++) {
          const raw = pipelineRes[j]?.result
          if (raw === null || raw === undefined) continue
          const key = slice[j]
          try {
            result[key] = typeof raw === "string" ? JSON.parse(raw) : raw
          } catch {
            result[key] = raw
          }
        }
      }
    } catch (err) {
      console.warn(`[kv-store] Error in getAllTenantKV External KV scan:`, err)
    }
  }

  return result
}
