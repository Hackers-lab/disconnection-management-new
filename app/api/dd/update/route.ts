import { NextRequest, NextResponse } from "next/server"
import { DeemedVisitData, invalidateDDCache, fetchDDData } from "@/lib/dd-service"
import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { withTenant } from "@/lib/tenant-context"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"

export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const { authorized, error, status, session } = await checkApiPermission("deemed", "update")
    if (!authorized) {
      return NextResponse.json({ success: false, error }, { status: status || 403 })
    }

    const body: DeemedVisitData = await request.json()
    
    const spreadsheetId = getSpreadsheetId()
    if (!spreadsheetId) {
      console.error("Missing spreadsheet ID")
      return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 })
    }

    // Scoping check for agency/executive roles
    const allVisits = await fetchDDData(spreadsheetId)
    const existing = allVisits.find((v) => v.consumerId === body.consumerId)
    
    if (
      isAgencyScopeRestricted(session, existing?.agency) ||
      isAgencyScopeRestricted(session, body.agency)
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Record is outside your assigned agency scope" },
        { status: 403 }
      )
    }

    const sheets = googleSheets({ version: "v4", auth })
    const sheetName = "DD" // Explicitly targeting the DD sheet
    
    // 1. Fetch only headers first to map columns
    const headerRange = `'${sheetName}'!1:1`
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: headerRange,
    })

    const headers = headerResponse.data.values?.[0]
    if (!headers || headers.length === 0) throw new Error("Sheet headers not found")
    
    const getColIndex = (name: string) => headers.findIndex((h: string) => 
      h.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, "")
    )

    let idColIndex = getColIndex("consumerid")
    if (idColIndex === -1) idColIndex = getColIndex("consumer id")
    
    if (idColIndex === -1) throw new Error("Consumer ID column not found")

    const getColumnLetter = (colIndex: number) => {
      let letter = '';
      let temp = colIndex;
      while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter;
        temp = Math.floor(temp / 26) - 1;
      }
      return letter;
    }

    const idColLetter = getColumnLetter(idColIndex)

    const idColumnResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!${idColLetter}:${idColLetter}`,
    })

    const idRows = idColumnResponse.data.values
    if (!idRows) throw new Error("No data in Consumer ID column")

    const rowIndex = idRows.findIndex((row: string[]) => row[0] === body.consumerId)

    if (rowIndex === -1) {
      return NextResponse.json({ success: false, error: "Consumer not found in sheet" }, { status: 404 })
    }

    const fieldMap: Partial<Record<keyof DeemedVisitData, string[]>> = {
      disconStatus: ["disconStatus", "disconnectionStatus", "status", "discon status"],
      remarks: ["remarks", "notes"],
      reading: ["reading", "meter reading", "meterreading"],
      lastUpdated: ["lastUpdated", "updatedAt", "last updated"],
      imageUrl: ["imageUrl", "image", "photo", "link", "url", "imageurl", "imagelink"],
      visitDate: ["visitDate", "visit date", "date of visit"],
    }

    const dataToUpdate: { range: string; values: string[][] }[] = []

    Object.entries(fieldMap).forEach(([key, headerNames]) => {
      let colIndex = -1
      for (const name of headerNames) {
        colIndex = getColIndex(name)
        if (colIndex !== -1) break
      }

      const val = body[key as keyof DeemedVisitData]
      
      if (colIndex !== -1 && val !== undefined && val !== null) {
        const colLetter = getColumnLetter(colIndex)
        dataToUpdate.push({
          range: `'${sheetName}'!${colLetter}${rowIndex + 1}`,
          values: [[String(val)]]
        })
      }
    })

    if (dataToUpdate.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: dataToUpdate
        }
      })
    }

    invalidateDDCache()
    return NextResponse.json({ success: true, message: "Sheet updated successfully" })
    
  } catch (error: any) {
    console.error("Update failed:", error)
    
    if (error.code === 403 || (error.response && error.response.status === 403)) {
      console.error(`\n❌ PERMISSION ERROR: The service account does not have 'Editor' access to the sheet.`)
    }

    return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 })
  }
})
