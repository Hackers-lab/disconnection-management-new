import { NextRequest, NextResponse } from "next/server"
import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId, getSheetName, findColumn, colLetter, ensureHeaders } from "@/lib/google-sheets-api"
import { _fetchMasterRaw } from "@/lib/consumer-master-service"
import { EXPECTED_CONSUMER_HEADERS, invalidateConsumerCache } from "@/lib/google-sheets"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"

export const maxDuration = 60

const sheets = googleSheets({ version: "v4", auth })

export const POST = withTenant(async function POST(req: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const sheetName = getSheetName()

    // 1. Load Consumer Master — bypass cache for freshest data
    const masterRows = await _fetchMasterRaw(spreadsheetId)
    if (masterRows.length === 0) {
      return NextResponse.json({ error: "Consumer Master is empty. Upload it first." }, { status: 400 })
    }

    // Build a quick lookup: consumerId → { latitude, longitude }
    const masterMap = new Map<string, { latitude: string; longitude: string }>()
    for (const row of masterRows) {
      if (row.consumerId) {
        masterMap.set(String(row.consumerId).trim(), {
          latitude: String(row.latitude || "").trim(),
          longitude: String(row.longitude || "").trim(),
        })
      }
    }

    // 2. Read full DC list from sheet
    const headers = await ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS)
    const idColIdx  = findColumn(headers, ["consumerId", "consumer id", "consumer_id"])
    const latColIdx = findColumn(headers, ["latitude", "lat"])
    const lngColIdx = findColumn(headers, ["longitude", "lng", "long"])

    if (idColIdx === -1)  throw new Error("Consumer ID column not found in DC sheet")
    if (latColIdx === -1) throw new Error("Latitude column not found in DC sheet")
    if (lngColIdx === -1) throw new Error("Longitude column not found in DC sheet")

    // Read the relevant columns only (ID, Lat, Lng)
    const [idCol, latCol, lngCol] = [idColIdx, latColIdx, lngColIdx]
    const maxCol = Math.max(idCol, latCol, lngCol)
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A2:${colLetter(maxCol)}`,
    })
    const rows = resp.data.values || []

    // 3. Build batchUpdate payloads — only write cells that need updating
    const data: { range: string; values: string[][] }[] = []
    let matched = 0
    let updated = 0
    let alreadyHad = 0
    let noMaster = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || []
      const consumerId = String(row[idCol] || "").trim()
      if (!consumerId) continue

      const master = masterMap.get(consumerId)
      if (!master) {
        noMaster++
        continue
      }
      matched++

      const existingLat = String(row[latCol] || "").trim()
      const existingLng = String(row[lngCol] || "").trim()

      // Skip if both are already populated
      if (existingLat && existingLng) {
        alreadyHad++
        continue
      }

      const newLat = master.latitude
      const newLng = master.longitude
      if (!newLat || !newLng) continue // master has no coords either

      // Sheet row number = i + 2 (1-indexed, skip header)
      const sheetRow = i + 2
      data.push({
        range: `'${sheetName}'!${colLetter(latCol)}${sheetRow}`,
        values: [[newLat]],
      })
      data.push({
        range: `'${sheetName}'!${colLetter(lngCol)}${sheetRow}`,
        values: [[newLng]],
      })
      updated++
    }

    // 4. Execute batchUpdate in chunks of 500 ranges (API limit safety)
    const CHUNK = 500
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK)
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: chunk },
      })
    }

    // Invalidate server-side cache so next read reflects updates
    if (updated > 0) invalidateConsumerCache()

    return NextResponse.json({
      success: true,
      summary: { matched, updated, alreadyHad, noMaster, masterTotal: masterRows.length },
    })
  } catch (err: any) {
    console.error("refresh-latlong error:", err)
    return NextResponse.json({ error: err.message || "Failed to refresh lat/long" }, { status: 500 })
  }
})
