import { NextRequest, NextResponse } from "next/server"
import { DeemedVisitData, invalidateDDCache } from "@/lib/dd-service"
import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const body: DeemedVisitData = await request.json()
    
    const spreadsheetId = getSpreadsheetId()
    if (!spreadsheetId) {
      console.error("Missing spreadsheet ID")
      return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 })
    }

    const sheets = googleSheets({ version: "v4", auth })
    const sheetName = "DD" // Explicitly targeting the DD sheet
    
    // 1. Fetch only headers first to map columns (Optimized)
    const headerRange = `'${sheetName}'!1:1`
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: headerRange,
    })

    const headers = headerResponse.data.values?.[0]
    if (!headers || headers.length === 0) throw new Error("Sheet headers not found")
    
    // Helper to find column index by possible names
    const getColIndex = (name: string) => headers.findIndex((h: string) => 
      h.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, "")
    )

    // Find Consumer ID column
    let idColIndex = getColIndex("consumerid")
    if (idColIndex === -1) idColIndex = getColIndex("consumer id")
    
    if (idColIndex === -1) throw new Error("Consumer ID column not found")

    // Helper to convert 0-based index to A1 notation
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

    // 2. Fetch ONLY the Consumer ID column to find the row
    const idColumnResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!${idColLetter}:${idColLetter}`,
    })

    const idRows = idColumnResponse.data.values
    if (!idRows) throw new Error("No data in Consumer ID column")

    // Find the row index (0-based in array, 1-based in Sheet)
    const rowIndex = idRows.findIndex((row: string[]) => row[0] === body.consumerId)

    if (rowIndex === -1) {
      return NextResponse.json({ success: false, error: "Consumer not found in sheet" }, { status: 404 })
    }

    // 3. Prepare the updates
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

    // Execute updates in parallel
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
    
    // Check for permission error (403)
    if (error.code === 403 || (error.response && error.response.status === 403)) {
      console.error(`\n❌ PERMISSION ERROR: The service account does not have 'Editor' access to the sheet.`)
      console.error(`👉 Please share the Google Sheet with the service account email (check your .env file) as an 'Editor'.\n`)
    }

    return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 })
  }
})
