import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry, invalidateTenantCache } from "@/lib/tenant-resolver"
import { db } from "@/lib/db"
import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"


export const dynamic = "force-dynamic"

const getSheetsClient = () => {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return googleSheets({ version: "v4", auth })
}

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const tenantsMap = await getTenantRegistry().catch(() => ({}))
    const masterSheetId = process.env.MASTER_CONFIG_SHEET || ""

    // Fetch registered CCCs from Turso DB with rich registration info (contact person, mobile, registration timestamp)
    let dbTenants: any[] = []
    try {
      const res = await db.execute({
        sql: `SELECT c.id, c.ccc_code as cccCode, c.ccc_name as cccName, c.spreadsheet_id as spreadsheetId, 
                     c.drive_folder_id as driveFolderId, c.contact_person as contactPerson, 
                     c.mobile_number as mobileNumber, c.created_at as createdAt, c.updated_at as updatedAt,
                     u.username as adminUsername, u.full_name as adminFullName, u.mobile_number as adminMobile
              FROM ccc_registry c
              LEFT JOIN users u ON (u.ccc_id = c.id AND u.role = 'admin') OR (u.username = c.ccc_code AND u.role = 'admin')
              ORDER BY c.created_at DESC`,
        args: []
      })
      dbTenants = res.rows || []
    } catch (dbErr) {
      console.warn("Turso ccc_registry fetch notice in superuser:", dbErr)
    }

    // Merge DB tenants and Sheet tenants
    const mergedMap: Record<string, any> = {}

    // First populate from Sheet
    Object.values(tenantsMap).forEach((t: any) => {
      mergedMap[t.cccCode] = {
        ...t,
        contactPerson: "",
        mobileNumber: "",
        createdAt: "",
        adminUsername: "",
        isSelfRegistered: false
      }
    })

    // Overlay / add DB rows (DB has richer registration timestamps & contacts)
    dbTenants.forEach((r: any) => {
      const code = String(r.cccCode || "").trim().toUpperCase()
      if (!code) return
      const existing = mergedMap[code] || {}
      mergedMap[code] = {
        id: r.id,
        cccCode: code,
        cccName: String(r.cccName || existing.cccName || "").trim(),
        spreadsheetId: String(r.spreadsheetId || existing.spreadsheetId || "").trim(),
        driveFolderId: String(r.driveFolderId || existing.driveFolderId || "").trim(),
        googleDriveRefreshToken: Boolean(existing.googleDriveRefreshToken),
        contactPerson: String(r.contactPerson || r.adminFullName || existing.contactPerson || "").trim(),
        mobileNumber: String(r.mobileNumber || r.adminMobile || existing.mobileNumber || "").trim(),
        createdAt: String(r.createdAt || ""),
        updatedAt: String(r.updatedAt || ""),
        adminUsername: String(r.adminUsername || ""),
        isSelfRegistered: Boolean(r.createdAt || r.mobileNumber || r.contactPerson)
      }
    })

    const sortedTenants = Object.values(mergedMap).sort((a: any, b: any) => {
      const parseTime = (dateStr?: string) => {
        if (!dateStr) return 0
        const iso = dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z"
        const t = new Date(iso).getTime()
        return isNaN(t) ? 0 : t
      }
      const timeA = parseTime(a.createdAt)
      const timeB = parseTime(b.createdAt)
      if (timeA !== timeB) return timeB - timeA
      const idA = Number(a.id) || 0
      const idB = Number(b.id) || 0
      return idB - idA
    })

    return NextResponse.json({
      tenants: sortedTenants,
      masterSheetId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { cccCode, cccName, spreadsheetId, contactPerson, mobileNumber } = await request.json()
    if (!cccCode || !cccName) {
      return NextResponse.json({ error: "CCC Code and Name are required" }, { status: 400 })
    }

    const cleanCccCode = String(cccCode).trim().toUpperCase()
    const cleanCccName = String(cccName).trim()
    const cleanSpreadsheetId = String(spreadsheetId || "").trim()
    const cleanContact = String(contactPerson || "").trim() || "Station In-Charge"
    const cleanMobile = mobileNumber ? String(mobileNumber).replace(/\D/g, "").slice(-10) : ""

    // 1. Insert/Update into Turso DB
    try {
      await db.execute({
        sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, spreadsheet_id, contact_person, mobile_number)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(ccc_code) DO UPDATE SET 
                ccc_name = excluded.ccc_name,
                spreadsheet_id = CASE WHEN excluded.spreadsheet_id != '' THEN excluded.spreadsheet_id ELSE ccc_registry.spreadsheet_id END,
                contact_person = CASE WHEN excluded.contact_person != '' THEN excluded.contact_person ELSE ccc_registry.contact_person END,
                mobile_number = CASE WHEN excluded.mobile_number != '' THEN excluded.mobile_number ELSE ccc_registry.mobile_number END,
                updated_at = CURRENT_TIMESTAMP`,
        args: [cleanCccCode, cleanCccName, cleanSpreadsheetId, cleanContact, cleanMobile]
      })
    } catch (dbErr) {
      console.warn("Turso ccc_registry insert notice:", dbErr)
    }

    // 2. Dual-Write to Master Google Sheet tab
    try {
      const masterSheetId = process.env.MASTER_CONFIG_SHEET!
      const registryTab = "CCC_Registry"
      const sheets = getSheetsClient()
      
      const existingRes = await sheets.spreadsheets.values.get({
        spreadsheetId: masterSheetId,
        range: `${registryTab}!A:A`,
      }).catch(() => null)

      const existingCodes = (existingRes?.data?.values || []).map(r => String(r[0] || "").trim().toUpperCase())
      const existingIdx = existingCodes.findIndex(c => c === cleanCccCode)

      if (existingIdx >= 0) {
        const rowNum = existingIdx + 1
        await sheets.spreadsheets.values.update({
          spreadsheetId: masterSheetId,
          range: `${registryTab}!A${rowNum}:B${rowNum}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[cleanCccCode, cleanCccName]],
          },
        })
        if (cleanSpreadsheetId) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: masterSheetId,
            range: `${registryTab}!C${rowNum}`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [[cleanSpreadsheetId]],
            },
          })
        }
        await sheets.spreadsheets.values.update({
          spreadsheetId: masterSheetId,
          range: `${registryTab}!F${rowNum}:G${rowNum}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[cleanContact, cleanMobile]],
          },
        })
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId: masterSheetId,
          range: `${registryTab}!A:G`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[cleanCccCode, cleanCccName, cleanSpreadsheetId, "", "", cleanContact, cleanMobile]],
          },
        })
      }
    } catch (sheetErr) {
      console.warn("Sheet append notice:", sheetErr)
    }

    // Dual-write / upsert into Turso ccc_registry
    try {
      await db.execute({
        sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, spreadsheet_id, drive_folder_id, drive_refresh_token)
              VALUES (?, ?, ?, '', '')
              ON CONFLICT(ccc_code) DO UPDATE SET 
                ccc_name = excluded.ccc_name,
                spreadsheet_id = excluded.spreadsheet_id,
                updated_at = CURRENT_TIMESTAMP`,
        args: [cccCode.trim().toUpperCase(), cccName.trim(), spreadsheetId?.trim() || ""],
      })
    } catch (tursoErr) {
      console.warn("Superuser tenants: Failed to write to Turso ccc_registry:", tursoErr)
    }

    invalidateTenantCache()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
