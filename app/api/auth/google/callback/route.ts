import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { OAuth2Client, GoogleAuth } from "google-auth-library"
import { drive as googleDrive } from "@googleapis/drive"
import { sheets as googleSheets } from "@googleapis/sheets"
import { encrypt } from "@/lib/encryption"
import { invalidateTenantCache } from "@/lib/tenant-resolver"
import { createAppFolder, duplicateSpreadsheetTemplate } from "@/lib/provisioning"

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

    // 2. Fetch existing tenant sheet data from Master Registry using System credentials
    const defaultAuth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    const masterSheetId = process.env.MASTER_CONFIG_SHEET
    if (!masterSheetId) {
      return NextResponse.json({ error: "MASTER_CONFIG_SHEET environment variable is not defined." }, { status: 500 })
    }

    const registryTab = "CCC_Registry"
    const masterSheetsClient = googleSheets({ version: "v4", auth: defaultAuth })

    const listRes = await masterSheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: `${registryTab}!A:E`,
    })

    const rows = listRes.data.values || []
    const rowIndex = rows.findIndex(row => String(row[0]).trim().toUpperCase() === session.cccCode.toUpperCase())

    if (rowIndex === -1) {
      return NextResponse.json({ error: `CCC Code '${session.cccCode}' is not registered in the Master Config Registry.` }, { status: 404 })
    }

    const rowNum = rowIndex + 1
    const rowData = rows[rowIndex]
    const cccName = String(rowData[1] || "").trim()
    const existingSheetId = String(rowData[2] || "").trim()

    // 3. Duplicate spreadsheet template if not already present
    let sheetId = existingSheetId
    if (!sheetId) {
      sheetId = await duplicateSpreadsheetTemplate(cccName, driveClient, folderId)
    }

    // 4. Encrypt Refresh Token
    const encryptedToken = encrypt(refreshToken)

    // 5. Save Sheet ID, Folder ID, and Encrypted Refresh Token to Master Registry
    await masterSheetsClient.spreadsheets.values.update({
      spreadsheetId: masterSheetId,
      range: `${registryTab}!C${rowNum}:E${rowNum}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[sheetId, folderId, encryptedToken]],
      },
    })

    // Invalidate the cache to apply the changes immediately
    invalidateTenantCache()

    // Redirect back to dashboard with success query param
    return NextResponse.redirect(new URL("/dashboard?success=true", request.nextUrl.origin))
  } catch (error: any) {
    console.error("Google OAuth Callback Error:", error)
    return NextResponse.json({ error: error.message || "Failed to process Google OAuth callback." }, { status: 500 })
  }
}
