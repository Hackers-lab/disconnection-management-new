import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import { decrypt } from "./encryption"

const MASTER_CONFIG_SHEET = process.env.MASTER_CONFIG_SHEET!
const REGISTRY_TAB = "CCC_Registry"

async function getSheetsClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
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
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache

export function invalidateTenantCache() {
  registryCache = null
}

export async function getTenantRegistry(bypassCache = false): Promise<Record<string, TenantConfig>> {
  if (!bypassCache && registryCache && Date.now() - registryCache.timestamp < CACHE_TTL_MS) {
    return registryCache.tenants
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
