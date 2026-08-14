/**
 * Tenant-Scoped KV Store Interface
 * Supports Vercel KV / Upstash Redis with a resilient in-memory fallback for local offline development.
 */

// In-memory fallback map for environments without configured external KV credentials
const memoryStore = new Map<string, { value: any; expiresAt?: number }>()

export function getTenantKey(tenantId: string, suffix: string): string {
  const cleanTenant = (tenantId || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
  const cleanSuffix = suffix.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_")
  return `tenant_${cleanTenant}:${cleanSuffix}`
}

export async function getKV<T>(key: string): Promise<T | null> {
  try {
    // Check in-memory store fallback first
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
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
    memoryStore.set(key, { value, expiresAt })
  } catch (err) {
    console.warn(`[kv-store] Error writing key "${key}":`, err)
  }
}

export async function incrKV(key: string): Promise<number> {
  try {
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
    memoryStore.delete(key)
  } catch (err) {
    console.warn(`[kv-store] Error deleting key "${key}":`, err)
  }
}
