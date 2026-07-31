/**
 * Unified Web Worker Sync Engine (lib/sync-worker.ts)
 * Offloads background delta patch polling, tombstone eviction, and cache merging
 * completely off the main UI thread to preserve 60fps rendering performance.
 */

export interface WorkerSyncMessage {
  type: "START_SYNC" | "STOP_SYNC" | "POLL_NOW"
  payload?: {
    moduleKey: string
    cacheKey: string
    fetchPatchUrl: string
    lastTs: number
    pollIntervalMs?: number
  }
}

export interface WorkerSyncResponse {
  type: "PATCH_UPDATED" | "SYNC_ERROR"
  moduleKey: string
  patchData: any[]
  tombstones: string[]
  serverTimestamp: number
}

const activeIntervals = new Map<string, number>()

self.onmessage = async (event: MessageEvent<WorkerSyncMessage>) => {
  const { type, payload } = event.data

  if (type === "START_SYNC" && payload) {
    const { moduleKey, fetchPatchUrl, lastTs, pollIntervalMs = 30000 } = payload

    if (activeIntervals.has(moduleKey)) {
      clearInterval(activeIntervals.get(moduleKey))
    }

    const runPoll = async () => {
      try {
        const url = `${fetchPatchUrl}${fetchPatchUrl.includes("?") ? "&" : "?"}since_ts=${lastTs || 0}`
        console.log(`[Web Worker Engine] ⚡ Off-thread background polling for module: "${moduleKey}"`)
        const res = await fetch(url)
        if (!res.ok) return

        const data = await res.json()
        const patchData = Array.isArray(data.patchData) ? data.patchData : []
        const tombstones = Array.isArray(data.tombstones) ? data.tombstones : []

        if (patchData.length > 0 || tombstones.length > 0) {
          console.log(`[Web Worker Engine] 📢 New patch detected off-thread for "${moduleKey}": ${patchData.length} patches, ${tombstones.length} tombstones`)
          const response: WorkerSyncResponse = {
            type: "PATCH_UPDATED",
            moduleKey,
            patchData,
            tombstones,
            serverTimestamp: data.serverTimestamp || Date.now(),
          }
          self.postMessage(response)
        }
      } catch (err: any) {
        console.warn(`[Web Worker Engine] ⚠️ Background sync error for "${moduleKey}":`, err.message)
        self.postMessage({
          type: "SYNC_ERROR",
          moduleKey,
          error: err.message || "Worker sync error",
        })
      }
    }

    // Run initial poll immediately, then schedule recurring interval
    await runPoll()
    const intervalId = self.setInterval(runPoll, pollIntervalMs) as unknown as number
    activeIntervals.set(moduleKey, intervalId)
  } else if (type === "STOP_SYNC" && payload) {
    const { moduleKey } = payload
    if (activeIntervals.has(moduleKey)) {
      clearInterval(activeIntervals.get(moduleKey))
      activeIntervals.delete(moduleKey)
    }
  }
}
