import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { OAuth2Client, GoogleAuth } from "google-auth-library"
import { drive as googleDrive } from "@googleapis/drive"
import { sheets as googleSheets } from "@googleapis/sheets"
import { encrypt } from "@/lib/encryption"
import { invalidateTenantCache } from "@/lib/tenant-resolver"
import { createAppFolder, duplicateSpreadsheetTemplate } from "@/lib/provisioning"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing authorization code or state parameter." }, { status: 400 })
  }

  // Cross-tenant validation: state parameter must match admin's cccCode
  if (state !== session.cccCode) {
    return NextResponse.json({ error: "State parameter validation failed. Potential CSRF attack." }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  let redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!redirectUri) {
    const host = request.headers.get("host") || "localhost:3000"
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https"
    redirectUri = `${protocol}://${host}/api/auth/google/callback`
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth parameters are not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." }, { status: 500 })
  }

  try {
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    const refreshToken = tokens.refresh_token

    if (!refreshToken) {
      // Re-authorization may be needed if consent screen did not pop up
      return NextResponse.json(
        { error: "No refresh token returned. Please go to your Google Account permissions, remove this app, and try again." },
        { status: 400 }
      )
    }

    // Set credentials on oauth client to perform auto-provisioning
    oauth2Client.setCredentials(tokens)
    const driveClient = googleDrive({ version: "v3", auth: oauth2Client })

    // 1. Create App Storage Folder on admin's Drive
    const folderId = await createAppFolder(driveClient)

    // 2. Fetch existing tenant data from Turso DB
    const cccRes = await db.execute({
      sql: `SELECT id, ccc_code, ccc_name, spreadsheet_id FROM ccc_registry WHERE ccc_code = ? LIMIT 1`,
      args: [session.cccCode],
    })

    if (!cccRes.rows || cccRes.rows.length === 0) {
      return NextResponse.json({ error: `CCC Code '${session.cccCode}' is not registered in the system.` }, { status: 404 })
    }

    const cccRow = cccRes.rows[0]
    const cccName = String(cccRow.ccc_name || session.cccCode).trim()
    const existingSheetId = String(cccRow.spreadsheet_id || "").trim()

    // 3. Duplicate spreadsheet template if not already present
    let sheetId = existingSheetId
    if (!sheetId) {
      sheetId = await duplicateSpreadsheetTemplate(cccName, driveClient, folderId)
    }

    const defaultAuth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    })

    // 3b. Auto-Share: Share pre-existing spreadsheet with the linking Admin's email
    try {
      const aboutUser = await driveClient.about.get({ fields: "user" })
      const userEmail = aboutUser.data.user?.emailAddress
      if (userEmail && sheetId) {
        console.log(`🔗 Auto-sharing spreadsheet ${sheetId} with linking admin (${userEmail})...`)
        const serviceAccountDrive = googleDrive({ version: "v3", auth: defaultAuth })
        await serviceAccountDrive.permissions.create({
          fileId: sheetId,
          requestBody: {
            role: "writer",
            type: "user",
            emailAddress: userEmail,
          },
          sendNotificationEmail: false,
        })
      }
      
      // Also share Admin's Drive folder with Service Account
      if (folderId && process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
        await driveClient.permissions.create({
          fileId: folderId,
          requestBody: {
            role: "writer",
            type: "user",
            emailAddress: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
          },
          sendNotificationEmail: false,
        })
      }
    } catch (shareError: any) {
      console.warn("Auto-sharing permissions warning:", shareError?.message || shareError)
    }

    // 4. Encrypt Refresh Token
    const encryptedToken = encrypt(refreshToken)

<<<<<<< HEAD
    // 5. Save Sheet ID, Folder ID, and Encrypted Refresh Token to Master Google Sheet Registry
    await masterSheetsClient.spreadsheets.values.update({
      spreadsheetId: masterSheetId,
      range: `${registryTab}!C${rowNum}:E${rowNum}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[sheetId, folderId, encryptedToken]],
      },
=======
    // 5. Update Turso ccc_registry database table (Primary Single Source of Truth)
    await db.execute({
      sql: `UPDATE ccc_registry 
            SET spreadsheet_id = ?, drive_folder_id = ?, drive_refresh_token = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE ccc_code = ?`,
      args: [sheetId, folderId, encryptedToken, session.cccCode],
>>>>>>> d05a4e5 (fix(tenant): decouple onboarding and auth from master config sheet, sync directly with Turso DB)
    })
    console.log(`⚡ [Turso DB] Updated ccc_registry for tenant '${session.cccCode}'`)

    // 6. Optional legacy sync to Master Google Sheet if configured
    const masterSheetId = process.env.MASTER_CONFIG_SHEET
    if (masterSheetId) {
      try {
        const masterSheetsClient = googleSheets({ version: "v4", auth: defaultAuth })
        const registryTab = "CCC_Registry"
        const listRes = await masterSheetsClient.spreadsheets.values.get({
          spreadsheetId: masterSheetId,
          range: `${registryTab}!A:E`,
        })
        const rows = listRes.data.values || []
        const rowIndex = rows.findIndex(row => String(row[0]).trim().toUpperCase() === session.cccCode.toUpperCase())
        if (rowIndex !== -1) {
          const rowNum = rowIndex + 1
          await masterSheetsClient.spreadsheets.values.update({
            spreadsheetId: masterSheetId,
            range: `${registryTab}!C${rowNum}:E${rowNum}`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [[sheetId, folderId, encryptedToken]],
            },
          })
        }
      } catch (sheetSyncErr: any) {
        console.warn("Optional Master Sheet legacy sync ignored:", sheetSyncErr?.message)
      }
    }

    // 6. Dual-Write tokens to Turso DB ccc_registry
    try {
      const { db } = await import("@/lib/db")
      await db.execute({
        sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, spreadsheet_id, drive_folder_id, drive_refresh_token)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(ccc_code) DO UPDATE SET
                spreadsheet_id = excluded.spreadsheet_id,
                drive_folder_id = excluded.drive_folder_id,
                drive_refresh_token = excluded.drive_refresh_token,
                updated_at = CURRENT_TIMESTAMP`,
        args: [session.cccCode.toUpperCase(), cccName, sheetId, folderId, encryptedToken]
      })
    } catch (dbErr) {
      console.warn("Turso DB ccc_registry dual-write notice in oauth callback:", dbErr)
    }

    // Invalidate the cache to apply the changes immediately
    invalidateTenantCache()

    // Redirect back to dashboard with success query param
    return NextResponse.redirect(new URL("/dashboard?success=true", request.nextUrl.origin))
  } catch (error: any) {
    console.error("Google OAuth Callback Error:", error)
    return NextResponse.json({ error: error.message || "Failed to process Google OAuth callback." }, { status: 500 })
  }
}
