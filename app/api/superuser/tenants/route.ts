import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry, invalidateTenantCache } from "@/lib/tenant-resolver"
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
    const tenants = await getTenantRegistry()
    return NextResponse.json(Object.values(tenants))
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
    const { cccCode, cccName, spreadsheetId } = await request.json()
    if (!cccCode || !cccName) {
      return NextResponse.json({ error: "CCC Code and Name are required" }, { status: 400 })
    }

    const masterSheetId = process.env.MASTER_CONFIG_SHEET!
    const registryTab = "CCC_Registry"
    const sheets = getSheetsClient()

    // Append to CCC_Registry tab
    await sheets.spreadsheets.values.append({
      spreadsheetId: masterSheetId,
      range: `${registryTab}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[cccCode.trim().toUpperCase(), cccName.trim(), spreadsheetId?.trim() || "", "", ""]],
      },
    })

    invalidateTenantCache()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
