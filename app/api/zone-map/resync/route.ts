import { NextRequest, NextResponse } from "next/server"
import { sheets as googleSheets, type sheets_v4 } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import {
  ensureHeaders,
  findColumn,
  colLetter,
  getSpreadsheetId,
  getSheetName,
} from "@/lib/google-sheets-api"
import { EXPECTED_CONSUMER_HEADERS, invalidateConsumerCache } from "@/lib/google-sheets"
import { appendHistory, nowTimestamp, invalidateHistoryCache } from "@/lib/consumer-history"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"

export const maxDuration = 60

const sheets = googleSheets({ version: "v4", auth })

// Statuses an agency (or admin) has already acted on — re-sync must NOT move
// these consumers between agencies. Mirrors the protected set used elsewhere.
const PROTECTED_STATUSES = new Set([
  "disconnected", "paid", "agency paid", "visited", "not found",
  "deemed disconnected", "temprory disconnected", "bill dispute", "office team",
])

async function loadAgencyZoneMap(spreadsheetId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId, range: "AgencyZoneMap!A:B",
    })
    const rows = resp.data.values || []
    for (let i = 1; i < rows.length; i++) {
      const mru = String(rows[i]?.[0] || "").trim().toUpperCase()
      const agency = String(rows[i]?.[1] || "").trim().toUpperCase()
      if (mru && agency) map.set(mru, agency)
    }
  } catch { /* tab not yet created */ }
  return map
}

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`
}

// Re-apply the current Agency Zone Map to existing consumers WITHOUT a DC
// re-upload. Reassigns any consumer whose mapped agency differs from its
// current one, skipping consumers in a protected/field-work status.
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const sheetName = getSheetName()

    const headers = await ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS)

    const idColIndex      = findColumn(headers, ["consumerId","consumer id","consumer_id"])
    const mruColIndex     = findColumn(headers, ["mru"])
    const agencyColIndex  = findColumn(headers, ["agency"])
    const statusColIndex  = findColumn(headers, ["discon status","disconnection status","status"])
    const nameColIndex    = findColumn(headers, ["name","consumer name"])
    const lastUpdColIndex = findColumn(headers, ["last updated","lastupdated","updatedAt","timestamp"])

    if (idColIndex === -1 || mruColIndex === -1 || agencyColIndex === -1) {
      return NextResponse.json({ error: "Consumer ID, MRU or Agency column not found" }, { status: 500 })
    }

    const colIndicesToFetch = [idColIndex, mruColIndex, agencyColIndex, statusColIndex, nameColIndex]
      .filter(i => i !== -1)
    const ranges = colIndicesToFetch.map(i => `'${sheetName}'!${colLetter(i)}:${colLetter(i)}`)

    const [batchResp, zoneAgencyMap] = await Promise.all([
      sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges }),
      loadAgencyZoneMap(spreadsheetId),
    ])

    const colData = (colIdx: number) => {
      const rangeIdx = colIndicesToFetch.indexOf(colIdx)
      return rangeIdx !== -1 ? (batchResp.data.valueRanges?.[rangeIdx]?.values || []) : []
    }

    const idValues = colData(idColIndex)
    const ts = nowTimestamp()
    const date = todayStr()

    const updateWrites: sheets_v4.Schema$ValueRange[] = []
    const historyEntries: Parameters<typeof appendHistory>[0] = []
    let reassigned = 0
    let skippedProtected = 0
    let unchanged = 0
    let unmapped = 0

    for (let i = 1; i < idValues.length; i++) {
      const consumerId = String(idValues[i]?.[0] || "").trim()
      if (!consumerId) continue
      const rowNum = i + 1

      const mru = String(colData(mruColIndex)[i]?.[0] || "").trim().toUpperCase()
      const mappedAgency = zoneAgencyMap.get(mru) || ""
      if (!mappedAgency) { unmapped++; continue }

      const currentAgency = String(colData(agencyColIndex)[i]?.[0] || "").trim()
      if (currentAgency.toUpperCase() === mappedAgency) { unchanged++; continue }

      const status = String(colData(statusColIndex)[i]?.[0] || "").toLowerCase().trim()
      if (PROTECTED_STATUSES.has(status)) { skippedProtected++; continue }

      updateWrites.push({
        range: `'${sheetName}'!${colLetter(agencyColIndex)}${rowNum}`,
        values: [[mappedAgency]],
      })
      if (lastUpdColIndex !== -1) {
        updateWrites.push({
          range: `'${sheetName}'!${colLetter(lastUpdColIndex)}${rowNum}`,
          values: [[date]],
        })
      }
      historyEntries.push({
        timestamp: ts,
        consumerId,
        name: String(colData(nameColIndex)[i]?.[0] || "").trim(),
        action: "agency_resync",
        oldStatus: status,
        newStatus: "",
        oldOsd: "",
        oldNotes: `Agency: ${currentAgency || "—"} → ${mappedAgency}`,
        oldImageUrl: "",
        changedBy: session.userId || "admin",
      })
      reassigned++
    }

    if (updateWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: updateWrites },
      })
      invalidateConsumerCache()
    }

    if (historyEntries.length > 0) {
      appendHistory(historyEntries, spreadsheetId)
        .then(() => invalidateHistoryCache(spreadsheetId))
        .catch(e => console.warn("History append failed (non-critical):", e))
    }

    return NextResponse.json({
      success: true,
      summary: {
        scanned: Math.max(0, idValues.length - 1),
        reassigned,
        skippedProtected,
        unchanged,
        unmapped,
      },
    })
  } catch (error: any) {
    console.error("zone-map resync error:", error)
    return NextResponse.json({ error: error?.message || "Re-sync failed" }, { status: 500 })
  }
})
