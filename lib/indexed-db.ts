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
  try {
    const match = document.cookie.match(/(^|;)\s*cccCode\s*=\s*([^;]+)/)
    if (match) {
      const val = decodeURIComponent(match[2]).trim()
      if (val) return val
    }
  } catch (e) {}
  try {
    const local = localStorage.getItem("user_ccc_code")
    if (local) {
      const val = local.trim()
      if (val) return val
    }
  } catch (e) {}
  try {
    const session = sessionStorage.getItem("user_ccc_code")
    if (session) {
      const val = session.trim()
      if (val) return val
    }
  } catch (e) {}
  return ""
}

export async function getFromCache<T>(key: string): Promise<T | null> {
  const ccc = getCccPrefix()
  const prefixedKey = ccc ? `${ccc}_${key}` : key
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(prefixedKey)
      request.onerror   = () => reject(request.error)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  } catch (error) {
    console.warn(`Error reading ${prefixedKey} from cache:`, error)
    return null
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
  } catch (error) {
    console.warn(`Error saving ${prefixedKey} to cache:`, error)
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
