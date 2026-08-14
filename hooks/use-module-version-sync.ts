"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getFromCache, saveToCache } from "@/lib/indexed-db"

export interface VersionSyncResult<T> {
  syncState: "idle" | "checking" | "patching" | "updated" | "error"
  patchCount: number
  checkVersion: (forceBypass?: boolean) => Promise<void>
}

function getCccCodeFromCookie(): string {
  if (typeof document === "undefined") return "default"
  const match = document.cookie.match(/(?:^|; )cccCode=([^;]*)/)
  return match && match[1] ? decodeURIComponent(match[1]) : "default"
}

export function useModuleVersionSync<T extends Record<string, any>>(
  moduleKey: string,
  cacheKey: string,
  idKey: keyof T,
  fetchBaseUrl?: string | ((records: T[]) => void),
  onRecordsUpdated?: (records: T[]) => void
): VersionSyncResult<T> {
  // Support signature overload if fetchBaseUrl is omitted and callback is passed 4th
  const actualCallback = typeof fetchBaseUrl === "function" ? fetchBaseUrl : onRecordsUpdated
  const actualBaseUrl = typeof fetchBaseUrl === "string" ? fetchBaseUrl : `/api/${moduleKey}?bypassCache=true`

  const cccCode = typeof window !== "undefined" ? getCccCodeFromCookie() : "default"
  const scopedCacheKey = `${cccCode}_${cacheKey}`

  const callbackRef = useRef(actualCallback)
  useEffect(() => {
    callbackRef.current = actualCallback
  }, [actualCallback])

  const [syncState, setSyncState] = useState<"idle" | "checking" | "patching" | "updated" | "error">("idle")
  const [patchCount, setPatchCount] = useState(0)

  const checkVersion = useCallback(
    async (forceBypass = false) => {
      setSyncState("checking")
      try {
        const cached = (await getFromCache<T[]>(scopedCacheKey)) || []
        const storedPatchVersion = typeof window !== "undefined" ? Number(localStorage.getItem(`ver_${scopedCacheKey}`) || 0) : 0
        const storedBaseVersion = typeof window !== "undefined" ? Number(localStorage.getItem(`base_ver_${scopedCacheKey}`) || 1) : 1

        const url = `/api/system/version-check?moduleKey=${encodeURIComponent(moduleKey)}&clientPatchVersion=${storedPatchVersion}&clientBaseVersion=${storedBaseVersion}&force=${forceBypass}`
        const res = await fetch(url)
        if (!res.ok) {
          setSyncState("idle")
          return
        }

        const data = await res.json()
        const serverBaseVer = data.serverBaseVersion ?? 1
        const serverPatchVer = data.serverPatchVersion ?? 0
        const clientBaseVer = typeof window !== "undefined" ? Number(localStorage.getItem(`base_ver_${cacheKey}`) || 1) : 1

        const localVerStr = `v${clientBaseVer}.${storedPatchVersion}`
        const serverVerStr = `v${serverBaseVer}.${serverPatchVer}`

        console.log(
          `[Version Sync] 🔍 Module: "${moduleKey}" | Local Ver: ${localVerStr} | Server Ver: ${serverVerStr} | Status: ${
            data.upToDate && !forceBypass ? "MATCH (Up to Date)" : `MISMATCH (${data.syncMode || "BASE"})`
          }`
        )

        if (data.upToDate && cached.length > 0 && !forceBypass) {
          console.log(`[Version Sync] ✅ "${moduleKey}" is already up-to-date (${localVerStr}). 0 bytes downloaded.`)
          if (callbackRef.current) callbackRef.current(cached)
          setSyncState("idle")
          return
        }

        if (data.syncMode === "PATCH" && Array.isArray(data.patches) && data.patches.length > 0) {
          setSyncState("patching")
          const jsonString = JSON.stringify(data.patches)
          const patchSizeBytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(jsonString).length : jsonString.length

          console.log(
            `[Version Sync] ⚡ Action: Applying ${data.patches.length} Delta Patch(es) to "${moduleKey}" (Payload Size: ${patchSizeBytes} bytes)...`
          )

          let updatedList = [...cached]

          for (const patch of data.patches) {
            const recordId = patch.recordId
            if (patch.action === "DELETE") {
              console.log(`[Version Sync] 🗑️ Evicting Tombstone Record ID "${recordId}" from local cache "${scopedCacheKey}".`)
              updatedList = updatedList.filter(item => String(item[idKey]) !== String(recordId))
            } else if (patch.action === "UPDATE" && patch.changes) {
              const existingIdx = updatedList.findIndex(item => String(item[idKey]) === String(recordId))
              if (existingIdx !== -1) {
                updatedList[existingIdx] = { ...updatedList[existingIdx], ...patch.changes }
              } else {
                updatedList.unshift(patch.changes as T)
              }
            }
          }

          await saveToCache(scopedCacheKey, updatedList)
          if (typeof window !== "undefined") {
            localStorage.setItem(`ver_${scopedCacheKey}`, String(serverPatchVer))
            localStorage.setItem(`base_ver_${scopedCacheKey}`, String(serverBaseVer))
          }
          setPatchCount(data.patches.length)
          if (callbackRef.current) callbackRef.current(updatedList)
          console.log(`[Version Sync] ✅ Successfully applied ${data.patches.length} patch(es) to "${scopedCacheKey}". Local pointer updated to ${serverVerStr}.`)
          setSyncState("updated")
          setTimeout(() => setSyncState("idle"), 3000)
          return
        }

        if (data.syncMode === "BASE" || forceBypass || cached.length === 0) {
          console.log(`[Version Sync] 🔄 Action: Downloading full BASE dataset for "${moduleKey}" from ${actualBaseUrl}...`)
          const baseRes = await fetch(actualBaseUrl)
          if (baseRes.ok) {
            const result = await baseRes.json()
            const freshItems = (Array.isArray(result) ? result : (result.patchData || result.data || [])) as T[]

            await saveToCache(scopedCacheKey, freshItems)
            if (typeof window !== "undefined") {
              localStorage.setItem(`ver_${scopedCacheKey}`, String(serverPatchVer))
              localStorage.setItem(`base_ver_${scopedCacheKey}`, String(serverBaseVer))
            }
            if (callbackRef.current) callbackRef.current(freshItems)
            console.log(`[Version Sync] ✅ Downloaded BASE dataset for "${moduleKey}" (${freshItems.length} records). Updated local version to ${serverVerStr}.`)
          }
          setSyncState("idle")
        }
      } catch (err) {
        console.warn(`[useModuleVersionSync] Error syncing module "${moduleKey}":`, err)
        setSyncState("error")
        setTimeout(() => setSyncState("idle"), 3000)
      }
    },
    [moduleKey, cacheKey, String(idKey), actualBaseUrl]
  )

  useEffect(() => {
    checkVersion()
  }, [checkVersion])

  return { syncState, patchCount, checkVersion }
}
