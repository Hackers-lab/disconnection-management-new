"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getFromCache, saveToCache, getCccPrefix } from "@/lib/indexed-db"

export interface VersionSyncResult<T> {
  syncState: "idle" | "checking" | "patching" | "updated" | "error"
  patchCount: number
  checkVersion: (forceBypass?: boolean) => Promise<void>
}

const MODULE_ENDPOINT_MAP: Record<string, string> = {
  consumer: "/api/consumers/base",
  disconnection: "/api/consumers/base",
  dd: "/api/dd/base",
  safety: "/api/safety/base",
  reconnection: "/api/reconnection",
  "misc-inspection": "/api/misc-inspection",
  misc_inspection: "/api/misc-inspection",
  nsc: "/api/nsc",
  "meter-replacement": "/api/meters/replacement",
  meter: "/api/meters/stock",
  dtr: "/api/dtr",
  material: "/api/material",
  icds: "/api/icds/base",
  gis: "/api/gis/base",
  gis_captures: "/api/gis/base",
  "permanent-disconnection": "/api/permanent-disconnection",
  permanent_disconnection: "/api/permanent-disconnection",
  pd: "/api/permanent-disconnection",
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
  const defaultPath = MODULE_ENDPOINT_MAP[moduleKey] || `/api/${moduleKey}`
  const actualBaseUrl = typeof fetchBaseUrl === "string" ? fetchBaseUrl : `${defaultPath}?bypassCache=true`

  const callbackRef = useRef(actualCallback)
  useEffect(() => {
    callbackRef.current = actualCallback
  }, [actualCallback])

  const [syncState, setSyncState] = useState<"idle" | "checking" | "patching" | "updated" | "error">("idle")
  const [patchCount, setPatchCount] = useState(0)
  const isCheckingRef = useRef(false)

  // 1. Instant Cache Hydration on Mount (< 15ms)
  useEffect(() => {
    let isMounted = true
    const hydrateFromCache = async () => {
      try {
        const cached = await getFromCache<T[]>(cacheKey)
        if (isMounted && cached && Array.isArray(cached) && cached.length > 0) {
          if (callbackRef.current) {
            callbackRef.current(cached)
          }
        }
      } catch (e) {
        console.warn(`[useModuleVersionSync] ⚠️ Cache hydration error for "${moduleKey}":`, e)
      }
    }
    hydrateFromCache()
    return () => {
      isMounted = false
    }
  }, [cacheKey, moduleKey])

  const checkVersion = useCallback(
    async (forceBypass = false) => {
      if (isCheckingRef.current && !forceBypass) return
      isCheckingRef.current = true
      setSyncState("checking")
      try {
        const prefix = typeof window !== "undefined" ? getCccPrefix() : ""
        const patchVerKey = prefix ? `ver_${prefix}_${cacheKey}` : `ver_${cacheKey}`
        const baseVerKey = prefix ? `base_ver_${prefix}_${cacheKey}` : `base_ver_${cacheKey}`

        const cached = (await getFromCache<T[]>(cacheKey)) || []

        // Immediately ensure component has cached data before network query
        if (cached.length > 0 && !forceBypass && callbackRef.current) {
          callbackRef.current(cached)
        }

        // If local cache is completely empty, start version check from 0 to guarantee base download
        const storedPatchVersion = (cached.length > 0 && typeof window !== "undefined")
          ? Number(localStorage.getItem(patchVerKey) || 0)
          : 0
        const storedBaseVersion = (cached.length > 0 && typeof window !== "undefined")
          ? Number(localStorage.getItem(baseVerKey) || 1)
          : 1

        const url = `/api/system/version-check?moduleKey=${encodeURIComponent(moduleKey)}&clientPatchVersion=${storedPatchVersion}&clientBaseVersion=${storedBaseVersion}&force=${forceBypass || cached.length === 0}`
        const res = await fetch(url)
        if (!res.ok) {
          setSyncState("idle")
          return
        }

        const data = await res.json()
        const serverBaseVer = data.serverBaseVersion ?? 1
        const serverPatchVer = data.serverPatchVersion ?? 0
        const clientBaseVer = storedBaseVersion

        const localVerStr = `v${clientBaseVer}.${storedPatchVersion}`
        const serverVerStr = `v${serverBaseVer}.${serverPatchVer}`

        console.log(
          `[Version Sync] 🔍 Module: "${moduleKey}" | Local Ver: ${localVerStr} | Server Ver: ${serverVerStr} | Status: ${
            data.upToDate && !forceBypass && cached.length > 0 ? "MATCH (Up to Date)" : `MISMATCH (${data.syncMode || "BASE"})`
          }`
        )

        // Case 1: Already up-to-date AND has cached records
        if (data.upToDate && cached.length > 0 && !forceBypass) {
          console.log(`[Version Sync] ✅ "${moduleKey}" is already up-to-date (${localVerStr}). 0 bytes downloaded.`)
          if (callbackRef.current) callbackRef.current(cached)
          setSyncState("idle")
          return
        }

        // Case 2: Incremental Delta Patch (only if we already have the base cached)
        if (data.syncMode === "PATCH" && Array.isArray(data.patches) && data.patches.length > 0 && cached.length > 0) {
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
              console.log(`[Version Sync] 🗑️ Evicting Tombstone Record ID "${recordId}" from local cache "${cacheKey}".`)
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

          await saveToCache(cacheKey, updatedList)
          if (typeof window !== "undefined") {
            localStorage.setItem(patchVerKey, String(serverPatchVer))
            localStorage.setItem(baseVerKey, String(serverBaseVer))
          }
          setPatchCount(data.patches.length)
          if (callbackRef.current) callbackRef.current(updatedList)
          console.log(`[Version Sync] ✅ Successfully applied ${data.patches.length} patch(es) to "${cacheKey}". Local pointer updated to ${serverVerStr}.`)
          setSyncState("updated")
          setTimeout(() => setSyncState("idle"), 3000)
          return
        }

        // Case 3: Full BASE dataset download
        if (data.syncMode === "BASE" || forceBypass || cached.length === 0 || !data.upToDate) {
          console.log(`[Version Sync] 🔄 Action: Downloading full BASE dataset for "${moduleKey}" from ${actualBaseUrl}...`)
          const baseRes = await fetch(actualBaseUrl)
          if (baseRes.ok) {
            const result = await baseRes.json()
            const freshItems = (Array.isArray(result) ? result : (result.patchData || result.data || result.photos || result.records || result.items || [])) as T[]

            await saveToCache(cacheKey, freshItems)
            if (typeof window !== "undefined") {
              localStorage.setItem(patchVerKey, String(serverPatchVer))
              localStorage.setItem(baseVerKey, String(serverBaseVer))
            }
            if (callbackRef.current) callbackRef.current(freshItems)
            console.log(`[Version Sync] ✅ Downloaded BASE dataset for "${moduleKey}" (${freshItems.length} records). Updated local version to ${serverVerStr}.`)
            setSyncState("updated")
            setTimeout(() => setSyncState("idle"), 3000)
          } else {
            setSyncState("idle")
          }
        }
      } catch (err) {
        console.warn(`[useModuleVersionSync] Error syncing module "${moduleKey}":`, err)
        setSyncState("error")
        setTimeout(() => setSyncState("idle"), 3000)
      } finally {
        isCheckingRef.current = false
      }
    },
    [moduleKey, cacheKey, String(idKey), actualBaseUrl]
  )

  useEffect(() => {
    checkVersion()
  }, [checkVersion])

  return { syncState, patchCount, checkVersion }
}
