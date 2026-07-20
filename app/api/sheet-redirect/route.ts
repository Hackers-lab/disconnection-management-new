import { NextRequest, NextResponse } from "next/server"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = 'force-dynamic'

export const GET = withTenant(async function GET(req: NextRequest) {
  const sheetId = getSpreadsheetId()

  if (!sheetId) {
    return NextResponse.json(
      { error: "Configuration Error: DISCONNECTION_SHEET environment variable is not set." },
      { status: 500 }
    )
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
  return NextResponse.redirect(url)
})
