import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateOtp, validateVerificationToken } from "@/lib/otp-service"
import { UserStorage } from "@/lib/user-storage"
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
    const { action, identifier, mobileNumber, verificationToken, newPassword } = body

    // =========================================================================
    // ACTION 1: Request Password Reset OTP
    // =========================================================================
    if (action === "request") {
      const cleanIdent = String(identifier || "").trim()
      if (!cleanIdent) {
        return NextResponse.json({ error: "Please enter your Mobile Number, Username, or CCC Code." }, { status: 400 })
      }

      // Query user or CCC in Turso DB
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.full_name, u.mobile_number as userMobile, u.role, c.mobile_number as cccMobile, c.ccc_code
              FROM users u
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE u.mobile_number = ?
                 OR u.username = ? COLLATE NOCASE
                 OR (c.ccc_code = ? AND u.role = 'admin')
                 OR c.mobile_number = ?
              LIMIT 1`,
        args: [cleanIdent, cleanIdent, cleanIdent, cleanIdent]
      })

      if (!res.rows || res.rows.length === 0) {
        return NextResponse.json({
          error: `No registered account found matching '${cleanIdent}'. Please check your credentials or register your CCC.`
        }, { status: 404 })
      }

      const userRow: any = res.rows[0]
      const targetMobile = String(userRow.userMobile || userRow.cccMobile || "").replace(/\D/g, "").slice(-10)

      if (!targetMobile || targetMobile.length !== 10) {
        return NextResponse.json({
          error: `Account '${userRow.username}' does not have a verified mobile number linked. Please contact your CCC Station Admin to link your mobile number.`
        }, { status: 400 })
      }

      // Generate & send OTP
      const { otp: generatedOtp, expiresAt } = generateOtp(targetMobile)
      const masked = `${targetMobile.slice(0, 3)}•••••${targetMobile.slice(-2)}`

      return NextResponse.json({
        success: true,
        message: `OTP sent to linked mobile number (+91 ${masked}).`,
        mobileNumber: targetMobile,
        mobileMasked: masked,
        username: userRow.username,
        expiresAt,
        ...(process.env.NODE_ENV !== "production" ? { devOtp: generatedOtp } : {})
      })
    }

    // =========================================================================
    // ACTION 2: Reset Password with Verified OTP Token
    // =========================================================================
    if (action === "reset") {
      const cleanMobile = String(mobileNumber || "").replace(/\D/g, "").slice(-10)
      const cleanNewPassword = String(newPassword || "").trim()

      if (!cleanMobile || cleanMobile.length !== 10) {
        return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 })
      }

      if (!cleanNewPassword || cleanNewPassword.length < 4) {
        return NextResponse.json({ error: "Password must be at least 4 characters long." }, { status: 400 })
      }

      if (!validateVerificationToken(cleanMobile, verificationToken)) {
        return NextResponse.json({ error: "OTP verification expired or invalid. Please verify again." }, { status: 401 })
      }

      // Update in Turso DB users table
      const updateRes = await db.execute({
        sql: `UPDATE users 
              SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE mobile_number = ? 
                 OR (ccc_id = (SELECT id FROM ccc_registry WHERE mobile_number = ? LIMIT 1) AND role = 'admin')`,
        args: [cleanNewPassword, cleanMobile, cleanMobile]
      })

      console.log(`🔑 [PASSWORD RESET SUCCESS] Updated password for mobile +91 ${cleanMobile} in Turso DB (${updateRes.rowsAffected} rows affected)`)

      UserStorage.getInstance().invalidateCache()

      // Dual-sync to Master Google Sheet in background
      if (SHEET_ID) {
        (async () => {
          try {
            const sheets = await getSheetsClient()
            const res = await sheets.spreadsheets.values.get({
              spreadsheetId: SHEET_ID,
              range: "'Master_Credentials'!A2:J",
            }).catch(() => null)
            const rows = (res?.data?.values || []) as string[][]
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i] || []
              const u = String(r[1] || "").trim()
              const c = String(r[4] || "").trim()
              if (u === cleanMobile || c === cleanMobile) {
                const sheetRow = i + 2
                await sheets.spreadsheets.values.update({
                  spreadsheetId: SHEET_ID,
                  range: `'Master_Credentials'!C${sheetRow}`,
                  valueInputOption: "USER_ENTERED",
                  requestBody: { values: [[cleanNewPassword]] },
                })
                break
              }
            }
          } catch (e) {}
        })()
      }

      return NextResponse.json({
        success: true,
        message: "Password updated successfully! You can now sign in using your new password."
      })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error: any) {
    console.error("Forgot Password API Error:", error)
    return NextResponse.json({ error: error.message || "Failed to process password recovery request." }, { status: 500 })
  }
}
