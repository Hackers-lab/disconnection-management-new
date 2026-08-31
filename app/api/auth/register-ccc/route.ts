import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createSession } from "@/lib/session"
import { validateVerificationToken } from "@/lib/otp-service"
import { UserStorage } from "@/lib/user-storage"
import { invalidateTenantCache } from "@/lib/tenant-resolver"
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawMobile = searchParams.get("mobile") || ""
    const cleanMobile = rawMobile.replace(/\D/g, "").slice(-10)

    if (!cleanMobile || cleanMobile.length !== 10) {
      return NextResponse.json({ error: "Invalid mobile number format." }, { status: 400 })
    }

    // Check if mobile already exists in ccc_registry or users
    const cccRes = await db.execute({
      sql: `SELECT id, ccc_code, ccc_name, contact_person FROM ccc_registry WHERE mobile_number = ? LIMIT 1`,
      args: [cleanMobile]
    })

    if (cccRes.rows && cccRes.rows.length > 0) {
      const cccRow: any = cccRes.rows[0]
      return NextResponse.json({
        exists: true,
        error: `Mobile number +91 ${cleanMobile} is already registered for CCC station '${cccRow.ccc_name}' (${cccRow.ccc_code}). Please sign in or use 'Forgot Password' to recover your credentials.`,
        cccCode: cccRow.ccc_code,
        cccName: cccRow.ccc_name,
      })
    }

    const userRes = await db.execute({
      sql: `SELECT u.id, u.username, u.full_name, c.ccc_code, c.ccc_name 
            FROM users u
            LEFT JOIN ccc_registry c ON u.ccc_id = c.id
            WHERE u.mobile_number = ? OR u.username = ?
            LIMIT 1`,
      args: [cleanMobile, cleanMobile]
    })

    if (userRes.rows && userRes.rows.length > 0) {
      const userRow: any = userRes.rows[0]
      return NextResponse.json({
        exists: true,
        error: `Mobile number +91 ${cleanMobile} is already registered under account '${userRow.username}'${userRow.ccc_name ? ` (${userRow.ccc_name})` : ""}. Please sign in or use 'Forgot Password'.`,
        username: userRow.username,
      })
    }

    return NextResponse.json({ exists: false })
  } catch (error: any) {
    console.error("Check mobile registration error:", error)
    return NextResponse.json({ error: "Failed to check mobile number registration." }, { status: 500 })
  }
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

    // 3. Check for Collision in Turso DB (CCC Code, Name, or Mobile Number)
    const existingCccRes = await db.execute({
      sql: `SELECT id, ccc_code, ccc_name, mobile_number FROM ccc_registry WHERE ccc_code = ? OR ccc_name = ? OR mobile_number = ? LIMIT 1`,
      args: [cleanCccCode, cleanCccName, cleanMobile]
    })

    if (existingCccRes.rows && existingCccRes.rows.length > 0) {
      const match: any = existingCccRes.rows[0]
      if (match.mobile_number === cleanMobile) {
        return NextResponse.json({
          error: `Mobile number +91 ${cleanMobile} is already registered to station '${match.ccc_name}' (${match.ccc_code}). Please sign in or use 'Forgot Password'.`
        }, { status: 409 })
      }
      return NextResponse.json({
        error: `CCC Code '${cleanCccCode}' or name '${cleanCccName}' is already registered. If you are the Station Admin, please use 'Forgot Password' on the login screen.`
      }, { status: 409 })
    }

    const existingUserRes = await db.execute({
      sql: `SELECT id, username FROM users WHERE mobile_number = ? OR username = ? LIMIT 1`,
      args: [cleanMobile, cleanCccCode]
    })

    if (existingUserRes.rows && existingUserRes.rows.length > 0) {
      return NextResponse.json({
        error: `An account with this mobile number or username already exists. Please sign in or use 'Forgot Password'.`
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
    invalidateTenantCache()
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
    await createSession(
      userId,
      cleanCccCode,
      "admin",
      [],
      cleanCccCode,
      cleanContactPerson || cleanCccName,
      "active",
      "",
      true
    )

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
