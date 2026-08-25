const DB_NAME   = "DisconnectionAppDB"
const STORE_NAME = "keyval"

export function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror   = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export function getCccPrefix(): string {
  if (typeof window === "undefined") return ""
  let ccc = ""
  let user = ""
  let role = ""

  try {
    const matchCcc = document.cookie.match(/(^|;)\s*cccCode\s*=\s*([^;]+)/)
    if (matchCcc) ccc = decodeURIComponent(matchCcc[2]).trim()
  } catch (e) {}
  if (!ccc) {
    try {
      const local = localStorage.getItem("user_ccc_code") || sessionStorage.getItem("user_ccc_code")
      if (local) ccc = local.trim()
    } catch (e) {}
  }

  try {
    const matchRole = document.cookie.match(/(^|;)\s*userRole\s*=\s*([^;]+)/)
    if (matchRole) role = decodeURIComponent(matchRole[2]).trim().toLowerCase()
  } catch (e) {}
  if (!role) {
    try {
      const localRole = localStorage.getItem("user_role") || sessionStorage.getItem("user_permissions_role")
      if (localRole) role = localRole.trim().toLowerCase()
    } catch (e) {}
  }

  try {
    const matchUser = document.cookie.match(/(^|;)\s*username\s*=\s*([^;]+)/)
    if (matchUser) user = decodeURIComponent(matchUser[2]).trim().toLowerCase()
  } catch (e) {}
  if (!user) {
    try {
      const localUser = localStorage.getItem("user_username") || sessionStorage.getItem("user_username")
      if (localUser) user = localUser.trim().toLowerCase()
    } catch (e) {}
  }

  const isAdminOrExec = role === "admin" || role === "superuser" || role === "executive"
  const userTag = isAdminOrExec ? "admin" : user || "default"

  if (ccc && userTag) return `${ccc}_${userTag}`
  if (ccc) return ccc
  if (userTag) return userTag
  return ""
}

export async function getFromCache<T>(key: string): Promise<T | null> {
  const ccc = getCccPrefix()
  const prefixedKey = ccc ? `${ccc}_${key}` : key
  try {
    const db = await openDB()
    let result = await new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(prefixedKey)
      request.onerror   = () => reject(request.error)
      request.onsuccess = () => resolve((request.result as T) ?? null)
    })

    // Fallback: If not found under scoped prefix, check unscoped CCC key (e.g. KUSHIDA_consumers_data_cache)
    if (!result && ccc && ccc.includes("_")) {
      const baseCcc = ccc.split("_")[0]
      const fallbackKey = `${baseCcc}_${key}`
      result = await new Promise<T | null>((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readonly")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(fallbackKey)
        request.onerror   = () => resolve(null)
        request.onsuccess = () => resolve((request.result as T) ?? null)
      })
    }

    return result
  } catch (error) {
    console.warn(`[Cache Engine] ⚠️ Error reading ${prefixedKey} from cache:`, error)
    return null
  }
}

export function notifyCacheUpdate(key: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("badge_cache_updated", { detail: { key } }))
  }
}

// Saves data AND a `{key}_ts` timestamp in a single transaction so
// staleness can be checked without extra reads.
export async function saveToCache(key: string, data: any): Promise<void> {
  const ccc = getCccPrefix()
  const prefixedKey = ccc ? `${ccc}_${key}` : key
  try {
    const db  = await openDB()
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      store.put(data, prefixedKey)
      store.put(now,  `${prefixedKey}_ts`)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
    notifyCacheUpdate(key)
  } catch (error) {
    console.warn(`[Cache Engine] ⚠️ Error saving ${prefixedKey} to cache:`, error)
  }
}

// Returns how many milliseconds ago the key was last saved, or null if unknown.
export async function getCacheAgeMs(key: string): Promise<number | null> {
  const ts = await getFromCache<number>(`${key}_ts`)
  if (typeof ts !== "number") return null
  return Date.now() - ts
}

export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()
      request.onerror   = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (error) {
    console.error("Failed to clear cache", error)
    throw error
  }
}

/**
 * Merges a patch array of updated/new records into an existing IndexedDB cache key by unique ID,
 * then saves the updated merged list back to IndexedDB.
 */
export async function mergePatchToCache<T>(
  cacheKey: string,
  patchData: T[],
  idKey: keyof T
): Promise<T[]> {
  if (!Array.isArray(patchData) || patchData.length === 0) {
    const existing = (await getFromCache<T[]>(cacheKey)) || []
    return existing
  }

  const existing = (await getFromCache<T[]>(cacheKey)) || []
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
  await saveToCache(cacheKey, merged)
  return merged
}

export interface GisPhotoRecord {
  id: string
  dataUrl: string
  thumbnailUrl?: string
  driveUrl?: string
  driveFileId?: string
  cloudSynced?: boolean
  syncError?: string
  timestamp: number
  dateFormatted: string
  timeFormatted: string
  lat: number
  lng: number
  accuracy?: number
  altitude?: number
  heading?: number
  locationName: string
  officeCode: string
  agency: string
  note: string
  uploadedBy?: string
  uploadedByName?: string
  userRole?: string
}

const GIS_PHOTOS_KEY = "gis_camera_photos_store"

export async function getGisPhotos(): Promise<GisPhotoRecord[]> {
  try {
    const photos = await getFromCache<GisPhotoRecord[]>(GIS_PHOTOS_KEY)
    return Array.isArray(photos) ? photos : []
  } catch (err) {
    console.error("Failed to load GIS photos from cache:", err)
    return []
  }
}

export async function saveGisPhoto(photo: GisPhotoRecord): Promise<GisPhotoRecord[]> {
  try {
    const existing = await getGisPhotos()
    // Prepend latest photo first
    const updated = [photo, ...existing.filter(p => p.id !== photo.id)]
    // Keep up to 200 photos locally to manage storage smoothly
    const trimmed = updated.slice(0, 200)
    await saveToCache(GIS_PHOTOS_KEY, trimmed)
    return trimmed
  } catch (err) {
    console.error("Failed to save GIS photo:", err)
    throw err
  }
}

export async function deleteGisPhoto(id: string): Promise<GisPhotoRecord[]> {
  try {
    const existing = await getGisPhotos()
    const updated = existing.filter(p => p.id !== id)
    await saveToCache(GIS_PHOTOS_KEY, updated)
    return updated
  } catch (err) {
    console.error("Failed to delete GIS photo:", err)
    throw err
  }
}

export async function clearAllGisPhotos(): Promise<void> {
  try {
    await saveToCache(GIS_PHOTOS_KEY, [])
  } catch (err) {
    console.error("Failed to clear GIS photos:", err)
    throw err
  }
}
