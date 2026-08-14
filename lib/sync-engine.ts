import { getFromCache, saveToCache, notifyCacheUpdate } from "./indexed-db"
import { parseTs } from "./date-utils"

export interface SyncPatchOptions<T> {
  moduleKey: string
  cacheKey: string
  idKey: keyof T
  fetchPatchUrl: string
  onMerged?: (items: T[]) => void
}

export interface PatchResponse<T> {
  serverTimestamp?: number
  patchCount?: number
  patchData?: T[]
  tombstones?: string[]
  error?: string
}

/**
 * Universal Sync Engine
 * Handles delta patch fetching, tombstone eviction of deleted records from IndexedDB,
 * local hold protection windows, and unified cache updates.
 */
export class PlatformSyncEngine {
  private static activeSyncs = new Map<string, Promise<any>>()

  /**
   * Calculates the highest timestamp present in local cache records.
   */
  static extractMaxTimestamp<T>(records: T[], timestampFields: (keyof T)[]): number {
    if (!Array.isArray(records) || records.length === 0) return 0
    let max = 0
    records.forEach((rec) => {
      timestampFields.forEach((field) => {
        const val = rec[field]
        if (val) {
          const ts = typeof val === "number" ? val : parseTs(String(val))
          if (!isNaN(ts) && ts > max) max = ts
        }
      })
    })
    return max
  }

  /**
   * Syncs a module using delta patch polling with tombstone deletion support.
   */
  static async syncModule<T>(options: SyncPatchOptions<T>, lastTs: number): Promise<T[]> {
    const { cacheKey, idKey, fetchPatchUrl, onMerged } = options

    // Prevent concurrent duplicate sync calls for the same cache key
    if (this.activeSyncs.has(cacheKey)) {
      return (await this.activeSyncs.get(cacheKey)) as T[]
    }

    const syncPromise = (async () => {
      try {
        const url = `${fetchPatchUrl}${fetchPatchUrl.includes("?") ? "&" : "?"}since_ts=${lastTs || 0}`
        const res = await fetch(url)
        if (!res.ok) {
          return (await getFromCache<T[]>(cacheKey)) || []
        }

        const data: PatchResponse<T> = await res.json()
        const patchData = Array.isArray(data.patchData) ? data.patchData : []
        const tombstones = Array.isArray(data.tombstones) ? data.tombstones : []

        let existing = (await getFromCache<T[]>(cacheKey)) || []

        // 1. Process Tombstones (Remove deleted records from local IndexedDB cache)
        if (tombstones.length > 0) {
          const tombSet = new Set(tombstones.map((id) => String(id).trim()))
          existing = existing.filter((item) => {
            const keyVal = String((item && item[idKey]) || "").trim()
            return !tombSet.has(keyVal)
          })
        }

        // 2. Merge Patches (Upsert new/updated records)
        if (patchData.length > 0) {
          const map = new Map<string, T>()
          existing.forEach((item) => {
            if (item && item[idKey]) map.set(String(item[idKey]).trim(), item)
          })
          patchData.forEach((item) => {
            if (item && item[idKey]) map.set(String(item[idKey]).trim(), item)
          })
          existing = Array.from(map.values())
        }

        if (tombstones.length > 0 || patchData.length > 0) {
          await saveToCache(cacheKey, existing)
          if (onMerged) onMerged(existing)
        }
        return existing
      } catch (error) {
        console.warn(`[Sync Engine] ⚠️ Sync failed for ${cacheKey}:`, error)
        return (await getFromCache<T[]>(cacheKey)) || []
      } finally {
        this.activeSyncs.delete(cacheKey)
      }
    })()

    this.activeSyncs.set(cacheKey, syncPromise)
    return syncPromise
  }

  /**
   * Syncs multiple modules concurrently using a single batch HTTP POST call to /api/system/sync.
   */
  static async syncBatch(
    subscriptions: Record<string, { cacheKey: string; idKey: string; lastTs: number }>
  ): Promise<Record<string, any[]>> {
    try {
      const payload = {
        subscriptions: Object.entries(subscriptions).reduce((acc, [key, sub]) => {
          acc[key] = { since_ts: sub.lastTs || 0 }
          return acc
        }, {} as Record<string, { since_ts: number }>),
      }

      const res = await fetch("/api/system/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) return {}
      const data = await res.json()
      const results: Record<string, any[]> = {}

      for (const [moduleKey, sub] of Object.entries(subscriptions)) {
        const moduleRes = data.results?.[moduleKey]
        if (moduleRes) {
          const patchData = Array.isArray(moduleRes.patchData) ? moduleRes.patchData : []
          const tombstones = Array.isArray(moduleRes.tombstones) ? moduleRes.tombstones : []
          let existing = (await getFromCache<any[]>(sub.cacheKey)) || []

          if (tombstones.length > 0) {
            const tombSet = new Set(tombstones.map((id: any) => String(id).trim()))
            existing = existing.filter((item) => {
              const keyVal = String((item && item[sub.idKey]) || "").trim()
              return !tombSet.has(keyVal)
            })
          }

          const map = new Map<string, any>()
          existing.forEach((item) => {
            const keyVal = String((item && item[sub.idKey]) || "").trim()
            if (keyVal) map.set(keyVal, item)
          })

          patchData.forEach((item: any) => {
            const keyVal = String((item && item[sub.idKey]) || "").trim()
            if (keyVal) map.set(keyVal, item)
          })

          const merged = Array.from(map.values())
          await saveToCache(sub.cacheKey, merged)
          notifyCacheUpdate(sub.cacheKey)
          results[moduleKey] = merged
        }
      }
      return results
    } catch (error) {
      console.warn("Batch sync failed:", error)
      return {}
    }
  }
}
