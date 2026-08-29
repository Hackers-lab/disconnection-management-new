import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createSession } from "@/lib/session"
import { validateVerificationToken } from "@/lib/otp-service"
import { UserStorage } from "@/lib/user-storage"
import { invalidateTenantRegistryCache } from "@/lib/tenant-resolver"
import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"

export const dynamic = "force-dynamic"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!

async function getSheetsClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return googleSheets({ version: "v4", auth: auth as any })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cccCode, cccName, contactPerson, mobileNumber, password, verificationToken } = body

    // 1. Validation
    const cleanCccCode = String(cccCode || "").trim()
    const cleanCccName = String(cccName || "").trim().toUpperCase()
    const cleanContactPerson = String(contactPerson || "").trim()
    const cleanMobile = String(mobileNumber || "").replace(/\D/g, "").slice(-10)
    const cleanPassword = String(password || "").trim()

    if (!cleanCccCode || !/^\d{7}$/.test(cleanCccCode)) {
      return NextResponse.json({ error: "CCC Code must be a 7-digit numeric code." }, { status: 400 })
    }

    if (!cleanCccName || cleanCccName.length < 3) {
      return NextResponse.json({ error: "Please enter a valid CCC Supply Office Name." }, { status: 400 })
    }

    if (!cleanMobile || cleanMobile.length !== 10) {
      return NextResponse.json({ error: "Please provide a valid 10-digit mobile number." }, { status: 400 })
    }

    if (!cleanPassword || cleanPassword.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters long." }, { status: 400 })
    }

    // 2. Validate OTP Token
    if (!validateVerificationToken(cleanMobile, verificationToken)) {
      return NextResponse.json({ error: "Mobile verification expired or invalid. Please verify via OTP again." }, { status: 401 })
    }

    // 3. Check for Collision in Turso DB
    const existingCccRes = await db.execute({
      sql: `SELECT id, ccc_code, ccc_name FROM ccc_registry WHERE ccc_code = ? OR ccc_name = ? LIMIT 1`,
      args: [cleanCccCode, cleanCccName]
    })

    if (existingCccRes.rows && existingCccRes.rows.length > 0) {
      return NextResponse.json({
        error: `CCC Code '${cleanCccCode}' is already registered in the system. If you are the Station Admin, please use 'Forgot Password' on the login screen to recover your account.`
      }, { status: 409 })
    }

    // 4. Insert into ccc_registry
    const insertCccRes = await db.execute({
      sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, contact_person, mobile_number, spreadsheet_id)
            VALUES (?, ?, ?, ?, '')`,
      args: [cleanCccCode, cleanCccName, cleanContactPerson || "Station In-Charge", cleanMobile]
    })

    const cccId = Number(insertCccRes.lastInsertRowid)
    const userId = `u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

    // 5. Insert Admin User into users table
    await db.execute({
      sql: `INSERT INTO users (id, username, password_hash, role, full_name, mobile_number, ccc_id, subscription_status, bypass_subscription)
            VALUES (?, ?, ?, 'admin', ?, ?, ?, 'active', 1)`,
      args: [
        userId,
        cleanCccCode,
        cleanPassword,
        cleanContactPerson || `${cleanCccName} Admin`,
        cleanMobile,
        cccId
      ]
    })

    console.log(`⚡ [NEW CCC REGISTERED] Station '${cleanCccName}' (${cleanCccCode}) registered successfully by +91 ${cleanMobile}`)

    // 6. Invalidate server memory caches
    invalidateTenantRegistryCache()
    UserStorage.getInstance().invalidateCache()

    // 7. Dual-Write to Master Google Sheet in Background (Non-blocking)
    if (SHEET_ID) {
      (async () => {
        try {
          const sheets = await getSheetsClient()
          
          // Check existing rows in CCC_Registry to prevent duplicate entries
          const existingRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: "'CCC_Registry'!A:A",
          }).catch(() => null)

          const existingCodes = (existingRes?.data?.values || []).map(r => String(r[0] || "").trim().toUpperCase())
          const existingIdx = existingCodes.findIndex(c => c === cleanCccCode)

          if (existingIdx >= 0) {
            // Update existing row at existingIdx + 1 (keep column C, D, E intact if they have sheets/tokens)
            const rowNum = existingIdx + 1
            await sheets.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `'CCC_Registry'!A${rowNum}:B${rowNum}`,
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[cleanCccCode, cleanCccName]],
              },
            }).catch(() => {})
            
            await sheets.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `'CCC_Registry'!F${rowNum}:G${rowNum}`,
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[cleanContactPerson, cleanMobile]],
              },
            }).catch(() => {})
          } else {
            // Append new row if not present
            await sheets.spreadsheets.values.append({
              spreadsheetId: SHEET_ID,
              range: "'CCC_Registry'!A:G",
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[cleanCccCode, cleanCccName, "", "", "", cleanContactPerson, cleanMobile]],
              },
            }).catch(() => {})
          }

          // Check and append/update Master_Credentials tab
          const credRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: "'Master_Credentials'!B:B",
          }).catch(() => null)
          const credUsers = (credRes?.data?.values || []).map(r => String(r[0] || "").trim().toLowerCase())
          const credIdx = credUsers.findIndex(u => u === cleanCccCode.toLowerCase())

          if (credIdx >= 0) {
            const credRowNum = credIdx + 1
            await sheets.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `'Master_Credentials'!A${credRowNum}:J${credRowNum}`,
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[userId, cleanCccCode, cleanPassword, "admin", cleanCccCode, cleanContactPerson || cleanCccName, "", "active", "", "TRUE"]],
              },
            }).catch(() => {})
          } else {
            await sheets.spreadsheets.values.append({
              spreadsheetId: SHEET_ID,
              range: "'Master_Credentials'!A:J",
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[userId, cleanCccCode, cleanPassword, "admin", cleanCccCode, cleanContactPerson || cleanCccName, "", "active", "", "TRUE"]],
              },
            }).catch(() => {})
          }
        } catch (e) {
          console.warn("Dual write to master sheet notice:", e)
        }
      })()
    }

    // 8. Create authenticated session & return redirect
    await createSession(userId, cleanCccCode, "admin", [], cleanCccCode)

    return NextResponse.json({
      success: true,
      message: `Station ${cleanCccName} (${cleanCccCode}) registered successfully!`,
      redirectTo: "/dashboard",
    })
  } catch (error: any) {
    console.error("Register CCC API Error:", error)
    return NextResponse.json({ error: error.message || "Failed to register new CCC station." }, { status: 500 })
  }
}
