import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import { getTenantContext } from "./tenant-context"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const AGENCY_SHEET_NAME = "Agencies"

// In-memory cache per CCC with 5-minute TTL to pick up direct sheet edits
let agenciesCache: Record<string, any[]> = {}
let agenciesCacheTimestamp: Record<string, number> = {}
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache TTL

export function invalidateAgencyCache(cccCode?: string) {
  if (cccCode) {
    delete agenciesCache[cccCode]
    delete agenciesCacheTimestamp[cccCode]
  } else {
    agenciesCache = {}
    agenciesCacheTimestamp = {}
  }
}

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

let tabReady = false
async function ensureTab() {
  if (tabReady) return
  if (!SHEET_ID) {
    throw new Error("MASTER_CONFIG_SHEET environment variable is not defined")
  }
  const sheets = await getSheetsClient()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = (meta.data.sheets || []).map(s => s.properties?.title)
  if (!existing.includes(AGENCY_SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: AGENCY_SHEET_NAME } } }],
      },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${AGENCY_SHEET_NAME}!A1:E1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["ID", "Name", "Description", "IsActive", "cccCode"]],
      },
    })
  }
  tabReady = true
}

export async function getAgencies() {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"
  const now = Date.now()

  // Serve from cache if not expired
  if (agenciesCache[cccCode] && (now - (agenciesCacheTimestamp[cccCode] || 0) < CACHE_TTL_MS)) {
    return agenciesCache[cccCode]
  }

  await ensureTab()
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A2:E`,
  })
  const rows = res.data.values || []
  
  let realRow = 2
  const processed = rows
    .map(row => {
      const agency = row[0]
        ? {
            id: row[0],
            name: row[1],
            description: row[2],
            isActive: String(row[3]).toLowerCase() === "true" || row[3] === true,
            cccCode: String(row[4] || "").trim(),
            _sheetRow: realRow,
          }
        : null
      realRow++
      return agency
    })
    .filter(Boolean)

  // Filter to keep only the agencies belonging to the active CCC subdivision
  const tenantAgencies = processed.filter(a => a && a.cccCode === cccCode)

  // Cache with timestamp
  agenciesCache[cccCode] = tenantAgencies
  agenciesCacheTimestamp[cccCode] = now
  return tenantAgencies
}

export async function addAgency({ name, description, isActive }: { name: string; description: string; isActive: boolean }) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"

  // Fetch all agencies to calculate correct auto-increment ID
  await ensureTab()
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A2:A`,
  })
  const ids = (res.data.values || []).map(r => Number(r[0])).filter(n => !isNaN(n))
  const newId = (Math.max(0, ...ids) + 1).toString()

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A:E`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[newId, name, description, isActive ? "true" : "false", cccCode]],
    },
  })
  
  // Bust the server cache — every user's next request gets the new list
  invalidateAgencyCache(cccCode)
  return { id: newId, name, description, isActive }
}

export async function updateAgency({ id, name, description, isActive }: { id: string; name: string; description: string; isActive: boolean }) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"

  // We need to fetch the raw list to find the correct spreadsheet row of this agency
  await ensureTab()
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A2:E`,
  })
  const rows = res.data.values || []
  let sheetRow = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i][0]) === id) {
      sheetRow = i + 2
      break
    }
  }

  if (sheetRow === -1) return null

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A${sheetRow}:E${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, name, description, isActive ? "true" : "false", cccCode]],
    },
  })
  
  // Bust the server cache — every user's next request gets the new list
  invalidateAgencyCache(cccCode)
  return { id, name, description, isActive }
}

export async function deleteAgency(id: string) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"

  await ensureTab()
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A2:E`,
  })
  const rows = res.data.values || []
  let sheetRow = -1
  let agency = null
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i][0]) === id) {
      sheetRow = i + 2
      agency = {
        id: String(rows[i][0]),
        name: String(rows[i][1] || ""),
        description: String(rows[i][2] || ""),
        isActive: String(rows[i][3]).toLowerCase() === "true",
        cccCode: String(rows[i][4] || ""),
      }
      break
    }
  }

  if (sheetRow === -1 || !agency) return null

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A${sheetRow}:E${sheetRow}`,
  })
  
  // Bust the server cache — every user's next request gets the new list
  invalidateAgencyCache(cccCode)
  return agency
}