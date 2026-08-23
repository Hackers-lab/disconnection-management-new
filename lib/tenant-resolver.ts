import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import { decrypt } from "./encryption"
import { db } from "./db"

const MASTER_CONFIG_SHEET = process.env.MASTER_CONFIG_SHEET!
const REGISTRY_TAB = "CCC_Registry"

function getPrivateKey() {
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY
  if (!key) return undefined
  return key.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim()
}

async function getSheetsClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: getPrivateKey(),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return googleSheets({ version: "v4", auth })
}

export interface TenantConfig {
  cccCode: string
  cccName: string
  spreadsheetId: string
  driveFolderId: string
  googleDriveRefreshToken: string // Decrypted
}

type CachedRegistry = {
  tenants: Record<string, TenantConfig>
  timestamp: number
}

let registryCache: CachedRegistry | null = null
const CACHE_TTL_MS = 15 * 1000 // 15 seconds cache

export function invalidateTenantCache() {
  registryCache = null
}

export async function getTenantRegistry(bypassCache = false): Promise<Record<string, TenantConfig>> {
  if (!bypassCache && registryCache && Date.now() - registryCache.timestamp < CACHE_TTL_MS) {
    return registryCache.tenants
  }

  // 1. Try querying Turso ccc_registry table first
  try {
    const res = await db.execute("SELECT ccc_code, ccc_name, spreadsheet_id, drive_folder_id, drive_refresh_token FROM ccc_registry")
    if (res.rows && res.rows.length > 0) {
      const tenants: Record<string, TenantConfig> = {}
      for (const row of res.rows) {
        const cccCode = String(row.ccc_code || "").trim()
        if (!cccCode) continue
        const encryptedToken = String(row.drive_refresh_token || "").trim()
        let googleDriveRefreshToken = ""
        if (encryptedToken) {
          try {
            googleDriveRefreshToken = decrypt(encryptedToken)
          } catch {
            googleDriveRefreshToken = encryptedToken // Raw token if unencrypted
          }
        }
        tenants[cccCode] = {
          cccCode,
          cccName: String(row.ccc_name || "").trim(),
          spreadsheetId: String(row.spreadsheet_id || "").trim(),
          driveFolderId: String(row.drive_folder_id || "").trim(),
          googleDriveRefreshToken,
        }
      }
      if (Object.keys(tenants).length > 0) {
        console.log(`⚡ [Turso SQL] Loaded ${Object.keys(tenants).length} CCC Tenants from ccc_registry table`)
        registryCache = { tenants, timestamp: Date.now() }
        return tenants
      }
    }
  } catch (err) {
    console.warn("Turso ccc_registry lookup failed, falling back to Master Sheet:", err)
  }

  if (!MASTER_CONFIG_SHEET) {
    throw new Error("MASTER_CONFIG_SHEET environment variable is not defined")
  }

  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_CONFIG_SHEET,
    range: `${REGISTRY_TAB}!A2:E`,
  })

  const rows = res.data.values || []
  const tenants: Record<string, TenantConfig> = {}

  for (const row of rows) {
    if (!row || !row[0]) continue
    const cccCode = String(row[0]).trim()
    const cccName = String(row[1] || "").trim()
    const spreadsheetId = String(row[2] || "").trim()
    const driveFolderId = String(row[3] || "").trim()
    const encryptedToken = String(row[4] || "").trim()

    let googleDriveRefreshToken = ""
    if (encryptedToken) {
      try {
        googleDriveRefreshToken = decrypt(encryptedToken)
      } catch (err) {
        console.error(`Failed to decrypt Google Drive OAuth token for CCC ${cccCode}:`, err)
      }
    }

    tenants[cccCode] = {
      cccCode,
      cccName,
      spreadsheetId,
      driveFolderId,
      googleDriveRefreshToken,
    }
  }

  registryCache = { tenants, timestamp: Date.now() }
  return tenants
}

export async function getTenantConfig(cccCode: string, bypassCache = false): Promise<TenantConfig> {
  const registry = await getTenantRegistry(bypassCache)
  let tenant = registry[cccCode]
  if (!tenant && cccCode === "SYSTEM") {
    const firstCode = Object.keys(registry)[0]
    if (firstCode) {
      tenant = registry[firstCode]
      console.log(`🔧 [Superuser Tenant Fallback] Resolving SYSTEM cccCode to tenant '${firstCode}'`)
    }
  }
  if (!tenant) {
    throw new Error(`CCC Code '${cccCode}' is not registered in the Master Config Registry`)
  }
  return tenant
}
