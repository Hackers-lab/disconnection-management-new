import { NextRequest, NextResponse } from "next/server"
import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = 'force-dynamic'

// Initialize the Google Sheets API client
const sheets = googleSheets({ version: "v4", auth })

export const GET = withTenant(async function GET(req: NextRequest) {
  const spreadsheetId = getSpreadsheetId()

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "Configuration Error: DISCONNECTION_SHEET environment variable is not set." },
      { status: 500 }
    )
  }

  let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`

  try {
    // Fetch spreadsheet metadata to get all sheet properties
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    // Find the sheet with the title "DD"
    const ddSheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title?.toUpperCase() === "DD"
    );

    if (ddSheet && ddSheet.properties?.sheetId !== undefined) {
      // If found, append the gid to the URL to open the specific sheet
      url += `#gid=${ddSheet.properties.sheetId}`;
    }
  } catch (error) {
    // Log the error but fall back to the base URL
    console.error("Could not fetch sheet GID for 'DD'. Please ensure the service account has access and the sheet name is correct.", error);
  }

  return NextResponse.redirect(url)
})
