import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import { getTenantContext } from "./tenant-context"
import { db } from "./db"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const AGENCY_SHEET_NAME = "Agencies"

// In-memory cache per CCC with 5-minute TTL
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

let tabReady = false
async function ensureTab() {
  if (tabReady) return
  if (!SHEET_ID) return
  try {
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
        range: `${AGENCY_SHEET_NAME}!A1:G1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["ID", "Name", "Description", "IsActive", "cccCode", "vendorCode", "mobileNumber"]],
        },
      })
    }
    tabReady = true
  } catch (e) {}
}

export async function getAgencyById(id: string) {
  const cleanId = String(id || "").trim()
  if (!cleanId) return null

  try {
    const res = await db.execute({
      sql: `SELECT a.id, a.vendor_code as vendorCode, a.name, a.description, 
                   a.contact_person as contactPerson, a.mobile_number as mobileNumber,
                   a.is_active as isActive, c.ccc_code as cccCode
            FROM agencies a
            LEFT JOIN ccc_registry c ON a.ccc_id = c.id
            WHERE a.id = ?
            LIMIT 1`,
      args: [cleanId]
    })
    if (res.rows && res.rows.length > 0) {
      const r: any = res.rows[0]
      return {
        id: String(r.id),
        name: String(r.name || "").trim(),
        description: String(r.description || "").trim(),
        vendorCode: String(r.vendorCode || "").trim(),
        mobileNumber: String(r.mobileNumber || "").trim(),
        isActive: Boolean(r.isActive),
        cccCode: String(r.cccCode || ""),
      }
    }
  } catch (err) {
    console.warn("Turso getAgencyById notice:", err)
  }

  const agencies = await getAgencies()
  return agencies.find(a => String(a.id) === cleanId) || null
}

export async function getAgencies() {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"
  const isSystem = !cccCode || cccCode === "SYSTEM"
  const now = Date.now()

  // Serve from cache if not expired
  if (agenciesCache[cccCode] && (now - (agenciesCacheTimestamp[cccCode] || 0) < CACHE_TTL_MS)) {
    return agenciesCache[cccCode]
  }

  // 1. Try querying Turso agencies table first with indexed tenant scoping
  try {
    const res = await db.execute({
      sql: isSystem
        ? `SELECT a.id, a.vendor_code as vendorCode, a.name, a.description, 
                  a.contact_person as contactPerson, a.mobile_number as mobileNumber,
                  a.is_active as isActive, c.ccc_code as cccCode
           FROM agencies a
           LEFT JOIN ccc_registry c ON a.ccc_id = c.id
           ORDER BY a.name ASC`
        : `SELECT a.id, a.vendor_code as vendorCode, a.name, a.description, 
                  a.contact_person as contactPerson, a.mobile_number as mobileNumber,
                  a.is_active as isActive, c.ccc_code as cccCode
           FROM agencies a
           JOIN ccc_registry c ON a.ccc_id = c.id
           WHERE c.ccc_code = ? COLLATE NOCASE
           ORDER BY a.name ASC`,
      args: isSystem ? [] : [cccCode]
    })
    if (res.rows && res.rows.length > 0) {
      const agencies = res.rows.map((r: any) => ({
        id: String(r.id),
        name: String(r.name || "").trim(),
        description: String(r.description || "").trim(),
        vendorCode: String(r.vendorCode || "").trim(),
        mobileNumber: String(r.mobileNumber || "").trim(),
        isActive: Boolean(r.isActive),
        cccCode: String(r.cccCode || cccCode),
      }))
      agenciesCache[cccCode] = agencies
      agenciesCacheTimestamp[cccCode] = now
      return agencies
    }
  } catch (err) {
    console.warn("Turso agencies query notice, falling back to Sheets:", err)
  }

  // 2. Google Sheets Fallback (Optional Legacy)
  if (!SHEET_ID) {
    return []
  }

  try {
    await ensureTab()
    const sheets = await getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${AGENCY_SHEET_NAME}!A2:G`,
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
              vendorCode: String(row[5] || "").trim(),
              mobileNumber: String(row[6] || "").trim(),
              _sheetRow: realRow,
            }
          : null
        realRow++
        return agency
      })
      .filter(Boolean)

    const tenantAgencies = processed.filter(a => a && (a.cccCode === cccCode || cccCode === "SYSTEM"))
    agenciesCache[cccCode] = tenantAgencies
    agenciesCacheTimestamp[cccCode] = now
    return tenantAgencies
  } catch (sheetErr) {
    console.warn("Notice: Optional Master Agencies sheet fetch skipped:", sheetErr)
    return []
  }
}

export async function addAgency({ 
  name, 
  description, 
  isActive, 
  vendorCode, 
  mobileNumber 
}: { 
  name: string
  description: string
  isActive: boolean
  vendorCode?: string
  mobileNumber?: string 
}) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"
  let newId = String(Date.now())

  // 1. Insert into Turso DB
  try {
    let cccId: number | null = null
    if (cccCode && cccCode !== "SYSTEM") {
      const cccRes = await db.execute({
        sql: "SELECT id FROM ccc_registry WHERE ccc_code = ? LIMIT 1",
        args: [cccCode]
      })
      cccId = (cccRes.rows[0]?.id as number) || null
    }

    if (cccId) {
      const insertRes = await db.execute({
        sql: `INSERT INTO agencies (vendor_code, ccc_id, name, description, mobile_number, is_active)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          vendorCode || null,
          cccId,
          name.toUpperCase().trim(),
          description || "",
          mobileNumber || null,
          isActive ? 1 : 0
        ]
      })
      newId = String(insertRes.lastInsertRowid || newId)
    }
  } catch (dbErr) {
    console.warn("Turso addAgency notice:", dbErr)
  }

  // 2. Dual-write to Google Sheets
  try {
    await ensureTab()
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${AGENCY_SHEET_NAME}!A:G`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[newId, name, description, isActive ? "true" : "false", cccCode, vendorCode || "", mobileNumber || ""]],
      },
    })
  } catch (e) {}
  
  invalidateAgencyCache(cccCode)
  return { id: newId, name, description, isActive, vendorCode, mobileNumber }
}

export async function updateAgency({ 
  id, 
  name, 
  description, 
  isActive, 
  vendorCode, 
  mobileNumber 
}: { 
  id: string
  name: string
  description: string
  isActive: boolean
  vendorCode?: string
  mobileNumber?: string 
}) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"

  // 1. Update in Turso DB
  try {
    await db.execute({
      sql: `UPDATE agencies 
            SET name = ?, description = ?, is_active = ?, vendor_code = ?, mobile_number = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [
        name.toUpperCase().trim(),
        description || "",
        isActive ? 1 : 0,
        vendorCode || null,
        mobileNumber || null,
        Number(id)
      ]
    })
  } catch (dbErr) {
    console.warn("Turso updateAgency notice:", dbErr)
  }

  // 2. Dual-write to Google Sheets
  try {
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

    if (sheetRow !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${AGENCY_SHEET_NAME}!A${sheetRow}:G${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[id, name, description, isActive ? "true" : "false", cccCode, vendorCode || "", mobileNumber || ""]],
        },
      })
    }
  } catch (e) {}
  
  invalidateAgencyCache(cccCode)
  return { id, name, description, isActive, vendorCode, mobileNumber }
}

export async function deleteAgency(id: string) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "SYSTEM"

  // 1. Delete from Turso DB
  try {
    await db.execute({
      sql: "DELETE FROM agencies WHERE id = ?",
      args: [Number(id)]
    })
  } catch (dbErr) {
    console.warn("Turso deleteAgency notice:", dbErr)
  }

  // 2. Google Sheets
  try {
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

    if (sheetRow !== -1 && agency) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${AGENCY_SHEET_NAME}!A${sheetRow}:G${sheetRow}`,
      })
    }
  } catch (e) {}
  
  invalidateAgencyCache(cccCode)
  return { id }
}