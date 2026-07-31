import { getFromCache, saveToCache, notifyCacheUpdate } from "./indexed-db"

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
          const ts = typeof val === "number" ? val : new Date(String(val)).getTime()
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
        console.log(`[Sync Engine] 🔄 Polling Module: "${options.moduleKey}" | URL: ${url} | Last Timestamp: ${lastTs}`)
        const res = await fetch(url)
        if (!res.ok) {
          console.warn(`[Sync Engine] ❌ HTTP Error ${res.status} fetching patch for ${options.moduleKey}`)
          return (await getFromCache<T[]>(cacheKey)) || []
        }

        const data: PatchResponse<T> = await res.json()
        const patchData = Array.isArray(data.patchData) ? data.patchData : []
        const tombstones = Array.isArray(data.tombstones) ? data.tombstones : []

        console.log(`[Sync Engine] 📥 Server Response for "${options.moduleKey}": ${patchData.length} new/updated patches, ${tombstones.length} tombstones`)

        let existing = (await getFromCache<T[]>(cacheKey)) || []

        // 1. Process Tombstones (Remove deleted records from local IndexedDB cache)
        if (tombstones.length > 0) {
          const tombSet = new Set(tombstones.map((id) => String(id).trim()))
          const prevLen = existing.length
          existing = existing.filter((item) => {
            const keyVal = String((item && item[idKey]) || "").trim()
            return !tombSet.has(keyVal)
          })
          console.log(`[Sync Engine] 🪦 Evicted ${prevLen - existing.length} deleted tombstones from local cache for "${options.moduleKey}"`)
        }

        // 2. Merge incoming patch data
        const map = new Map<string, T>()
        existing.forEach((item) => {
          const keyVal = String((item && item[idKey]) || "").trim()
          if (keyVal) map.set(keyVal, item)
        })

        patchData.forEach((item) => {
          const keyVal = String((item && item[idKey]) || "").trim()
          if (keyVal) map.set(keyVal, item)
        })

        const merged = Array.from(map.values())
        console.log(`[Sync Engine] ✅ Merged Total: ${merged.length} items in local cache for "${options.moduleKey}"`)
        await saveToCache(cacheKey, merged)

        if (onMerged) onMerged(merged)
        return merged
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
