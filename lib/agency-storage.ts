import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import { getTenantContext } from "./tenant-context"
import { db } from "./db"
import { isBillingActive } from "./billing-config"

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
                   a.is_active as isActive, a.subscription_status as subscriptionStatus,
                   a.subscription_expires_at as subscriptionExpiresAt, c.ccc_code as cccCode
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
        subscriptionStatus: String(r.subscriptionStatus || "active"),
        subscriptionExpiresAt: String(r.subscriptionExpiresAt || ""),
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
                  a.is_active as isActive, a.subscription_status as subscriptionStatus,
                  a.subscription_expires_at as subscriptionExpiresAt, c.ccc_code as cccCode
           FROM agencies a
           LEFT JOIN ccc_registry c ON a.ccc_id = c.id
           ORDER BY a.name ASC`
        : `SELECT a.id, a.vendor_code as vendorCode, a.name, a.description, 
                  a.contact_person as contactPerson, a.mobile_number as mobileNumber,
                  a.is_active as isActive, a.subscription_status as subscriptionStatus,
                  a.subscription_expires_at as subscriptionExpiresAt, c.ccc_code as cccCode
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
        subscriptionStatus: String(r.subscriptionStatus || "active"),
        subscriptionExpiresAt: String(r.subscriptionExpiresAt || ""),
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
  mobileNumber,
  subscriptionExpiresAt
}: { 
  name: string
  description: string
  isActive: boolean
  vendorCode?: string
  mobileNumber?: string
  subscriptionExpiresAt?: string
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
        sql: `INSERT INTO agencies (vendor_code, ccc_id, name, description, mobile_number, is_active, subscription_status, subscription_expires_at)
              VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        args: [
          vendorCode || null,
          cccId,
          name.toUpperCase().trim(),
          description || "",
          mobileNumber || null,
          isActive ? 1 : 0,
          subscriptionExpiresAt || null
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
  return { id: newId, name, description, isActive, vendorCode, mobileNumber, subscriptionStatus: "active", subscriptionExpiresAt }
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

export async function updateAgencySubscription(
  cccCode: string,
  agencyNameOrCode: string,
  expiresAt: string,
  status: string = "active"
) {
  try {
    const res = await db.execute({
      sql: `UPDATE agencies
            SET subscription_status = ?,
                subscription_expires_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE ccc_id = (SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1)
              AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE)`,
      args: [status, expiresAt, cccCode, agencyNameOrCode, agencyNameOrCode]
    })
    invalidateAgencyCache(cccCode)
    return res.rowsAffected > 0
  } catch (err) {
    console.error("Failed to update agency subscription in DB:", err)
    return false
  }
}

/**
 * Automatically starts the 90-day operational trial when a CCC uploads its FIRST DC list.
 * Idempotent: If first_dc_upload_at is already recorded, this is a NO-OP so daily/weekly uploads
 * never reset or extend the trial period.
 */
export async function triggerFirstDcUploadTrial(cccCode: string): Promise<string | null> {
  if (!cccCode) return null
  try {
    const cccRes = await db.execute({
      sql: `SELECT id, first_dc_upload_at FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1`,
      args: [cccCode]
    })
    if (!cccRes.rows || cccRes.rows.length === 0) return null
    const cccRow: any = cccRes.rows[0]

    // If first upload timestamp already exists, do NOT reset or extend!
    if (cccRow.first_dc_upload_at) {
      return null
    }

    const trialDays = 90
    const newExpiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    // 1. Record first upload timestamp (ensures it only fires once ever)
    await db.execute({
      sql: `UPDATE ccc_registry 
            SET first_dc_upload_at = CURRENT_TIMESTAMP 
            WHERE id = ?`,
      args: [cccRow.id]
    })

    // 2. Grant 90 days from today to all agencies in this CCC
    await db.execute({
      sql: `UPDATE agencies 
            SET subscription_expires_at = ?, subscription_status = 'active', updated_at = CURRENT_TIMESTAMP 
            WHERE ccc_id = ?`,
      args: [newExpiresAt, cccRow.id]
    })

    // 3. Grant 90 days from today to all users in this CCC
    await db.execute({
      sql: `UPDATE users 
            SET subscription_expires_at = ?, subscription_status = 'active' 
            WHERE ccc_id = ?`,
      args: [newExpiresAt, cccRow.id]
    })

    invalidateAgencyCache(cccCode)
    console.log(`🎉 [FIRST DC LIST UPLOAD] Activated 90-day operational trial for CCC ${cccCode} until ${newExpiresAt}`)
    return newExpiresAt
  } catch (err) {
    console.warn("triggerFirstDcUploadTrial error:", err)
    return null
  }
}

/**
 * Checks if a specific agency has an active subscription in the given CCC.
 * The agencies table is the single source of truth for subscriptions.
 *
 * SECURITY: Fails CLOSED — on any error or unknown agency, access is denied.
 * The only fail-open path is the pre-billing trial period.
 */
export async function isAgencySubscribed(
  cccCode: string,
  agencyNameOrVendor: string
): Promise<{ subscribed: boolean; reason?: string; expiresAt?: string; agencyName?: string }> {
  // Pre-billing trial period: everyone is subscribed
  if (!isBillingActive()) {
    return { subscribed: true, reason: "trial" }
  }

  const cleanName = String(agencyNameOrVendor || "").trim()
  if (!cleanName) {
    // No agency name provided — fail closed
    return { subscribed: false, reason: "no_agency" }
  }

  try {
    const agencies = await getAgencies()
    const matched = agencies.find(
      (a) =>
        a.name.toUpperCase() === cleanName.toUpperCase() ||
        (a.vendorCode && a.vendorCode.toUpperCase() === cleanName.toUpperCase())
    )

    if (!matched) {
      // Agency not found in database — fail closed
      return { subscribed: false, reason: "not_found" }
    }

    if (!matched.isActive) {
      return {
        subscribed: false,
        reason: "inactive",
        agencyName: matched.name,
      }
    }

    if (matched.subscriptionStatus !== "active") {
      return {
        subscribed: false,
        reason: "unsubscribed",
        agencyName: matched.name,
        expiresAt: matched.subscriptionExpiresAt,
      }
    }

    if (matched.subscriptionExpiresAt) {
      const expDate = new Date(matched.subscriptionExpiresAt)
      expDate.setHours(23, 59, 59, 999)
      if (Date.now() > expDate.getTime()) {
        return {
          subscribed: false,
          reason: "expired",
          agencyName: matched.name,
          expiresAt: matched.subscriptionExpiresAt,
        }
      }
    }

    return {
      subscribed: true,
      agencyName: matched.name,
      expiresAt: matched.subscriptionExpiresAt,
    }
  } catch (err) {
    // SECURITY: Fail CLOSED on any DB error — do NOT grant access
    console.error("isAgencySubscribed check FAILED (denying access):", err)
    return { subscribed: false, reason: "lookup_error" }
  }
}