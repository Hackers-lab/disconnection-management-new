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
    const { action, identifier, mobileNumber, username, verificationToken, newPassword } = body

    // =========================================================================
    // ACTION 1: Request Password Reset OTP
    // =========================================================================
    if (action === "request") {
      let cleanIdent = String(identifier || "").trim()
      if (!cleanIdent) {
        return NextResponse.json({ error: "Please enter your Mobile Number, Username, or CCC Code." }, { status: 400 })
      }

      // Normalize: if identifier looks like a phone number, extract 10 digits
      const identDigits = cleanIdent.replace(/\D/g, "")
      if (identDigits.length === 10) {
        cleanIdent = identDigits
      } else if (identDigits.length > 10 && identDigits.length <= 13) {
        // Handle +91, 091, 0 prefixes
        const last10 = identDigits.slice(-10)
        if (last10.length === 10) cleanIdent = last10
      }

      // Query user or CCC in Turso DB with multi-supply resolution
      const res = await db.execute({
        sql: `SELECT DISTINCT 
                u.id, 
                u.username, 
                u.full_name, 
                COALESCE(u.mobile_number, a.mobile_number, c.mobile_number) as userMobile, 
                u.role, 
                c.ccc_code, 
                c.ccc_name,
                c.mobile_number as cccMobile
              FROM users u
              JOIN ccc_registry c ON u.ccc_id = c.id
              LEFT JOIN agencies a ON u.ccc_id = a.ccc_id AND (
                u.username = a.name COLLATE NOCASE OR 
                u.full_name = a.name COLLATE NOCASE OR
                u.username = a.vendor_code COLLATE NOCASE OR
                u.agencies = a.name COLLATE NOCASE
              )
              WHERE u.username = ? COLLATE NOCASE
                 OR u.mobile_number = ?
                 OR (c.ccc_code = ? AND u.role = 'admin')
                 OR (a.mobile_number = ? AND (u.username = a.name COLLATE NOCASE OR u.full_name = a.name COLLATE NOCASE OR u.agencies = a.name COLLATE NOCASE))
              ORDER BY (CASE 
                WHEN u.username = ? COLLATE NOCASE THEN 1 
                WHEN u.mobile_number = ? THEN 2 
                ELSE 3 
              END)`,
        args: [cleanIdent, cleanIdent, cleanIdent, cleanIdent, cleanIdent, cleanIdent]
      })

      if (!res.rows || res.rows.length === 0) {
        return NextResponse.json({
          error: `No registered account found matching '${cleanIdent}'. Please check your credentials or register your CCC.`
        }, { status: 404 })
      }

      // Determine target mobile
      let targetMobile = ""
      for (const row of res.rows as any[]) {
        const mob = String(row.userMobile || row.cccMobile || "").replace(/\D/g, "").slice(-10)
        if (mob.length === 10) {
          targetMobile = mob
          break
        }
      }

      if (!targetMobile && cleanIdent.length === 10 && /^\d{10}$/.test(cleanIdent)) {
        targetMobile = cleanIdent
      }

      if (!targetMobile || targetMobile.length !== 10) {
        return NextResponse.json({
          error: `Account '${res.rows[0].username}' does not have a verified mobile number linked. Please contact your CCC Station Admin.`
        }, { status: 400 })
      }

      const masked = `${targetMobile.slice(0, 3)}•••••${targetMobile.slice(-2)}`

      // If multiple accounts found and user hasn't selected an account yet, return account list for user choice
      if (res.rows.length > 1 && !body.selectedAccount) {
        return NextResponse.json({
          requiresAccountSelection: true,
          mobileNumber: targetMobile,
          mobileMasked: masked,
          accounts: (res.rows as any[]).map((r) => ({
            id: r.id,
            username: r.username,
            fullName: r.full_name || r.username,
            role: r.role,
            cccCode: r.ccc_code,
            cccName: r.ccc_name,
          }))
        })
      }

      // User either has 1 account or explicitly picked an account: proceed to generate & send OTP
      const { otp: generatedOtp, expiresAt } = generateOtp(targetMobile)

      const chosenUsername = body.selectedAccount === "all" 
        ? "all" 
        : body.selectedAccount || res.rows[0].username

      return NextResponse.json({
        success: true,
        message: `OTP sent to linked mobile number (+91 ${masked}).`,
        mobileNumber: targetMobile,
        mobileMasked: masked,
        username: chosenUsername,
        selectedAccount: chosenUsername,
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
      const targetUsername = String(username || body.selectedAccount || "").trim()

      if (!cleanMobile || cleanMobile.length !== 10) {
        return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 })
      }

      if (!cleanNewPassword || cleanNewPassword.length < 4) {
        return NextResponse.json({ error: "Password must be at least 4 characters long." }, { status: 400 })
      }

      if (!validateVerificationToken(cleanMobile, verificationToken)) {
        return NextResponse.json({ error: "OTP verification expired or invalid. Please verify again." }, { status: 401 })
      }

      // Update in Turso DB users table: target specific username or all linked accounts
      let updateRes: any
      if (targetUsername && targetUsername !== "all") {
        updateRes = await db.execute({
          sql: `UPDATE users 
                SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE username = ? COLLATE NOCASE`,
          args: [cleanNewPassword, targetUsername]
        })
      } else {
        // Reset across all accounts linked to this phone number / vendor agencies
        updateRes = await db.execute({
          sql: `UPDATE users 
                SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE mobile_number = ? 
                   OR username = ?
                   OR id IN (
                     SELECT u2.id FROM users u2
                     JOIN agencies a2 ON u2.ccc_id = a2.ccc_id
                     WHERE a2.mobile_number = ? AND (u2.username = a2.name COLLATE NOCASE OR u2.full_name = a2.name COLLATE NOCASE OR u2.agencies = a2.name COLLATE NOCASE)
                   )`,
          args: [cleanNewPassword, cleanMobile, cleanMobile, cleanMobile]
        })
      }

      console.log(`🔑 [PASSWORD RESET SUCCESS] Updated password for mobile +91 ${cleanMobile}${targetUsername ? ` (User/Target: ${targetUsername})` : ""} in Turso DB (${updateRes.rowsAffected} rows affected)`)

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
