import { NextResponse, type NextRequest } from "next/server"
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

const HISTORY_TAB = "DC_History"

const ADMIN_HOLD_STATUSES = new Set(["bill dispute", "office team"])
const FIELD_WORK_STATUSES = new Set([
  "disconnected", "paid", "agency paid", "visited", "not found",
  "deemed disconnected", "temprory disconnected",
])

const sheets = googleSheets({ version: "v4", auth })

async function loadAgencyZoneMap(spreadsheetId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId, range: "AgencyZoneMap!A:B",
    })
    const rows = resp.data.values || []
    for (let i = 1; i < rows.length; i++) {
      // Store full MRU (no truncation)
      const mru = String(rows[i]?.[0] || "").trim().toUpperCase()
      const agency = String(rows[i]?.[1] || "").trim().toUpperCase()
      if (mru && agency) map.set(mru, agency)
    }
  } catch { /* tab not yet created */ }
  return map
}

async function getSheetTabId(spreadsheetId: string, sheetName: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const cleanName = sheetName.trim().toLowerCase()
  const found = meta.data.sheets?.find(s => s.properties?.title?.trim().toLowerCase() === cleanName)
  if (!found) {
    const available = meta.data.sheets?.map(s => s.properties?.title || "").join(", ") || "none"
    throw new Error(`Sheet tab named "${sheetName}" not found in spreadsheet. Available tabs: ${available}`)
  }
  const id = found.properties?.sheetId
  if (id === undefined || id === null) {
    throw new Error(`Sheet tab named "${sheetName}" does not have a valid sheetId.`)
  }
  return id
}

async function ensureHistoryTab(spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === HISTORY_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: HISTORY_TAB } } }] },
    })
  }
}

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`
}

type UpsertRequest = {
  sheetName?: string
  rows: string[][]
  newCycle?: boolean
  // Per-consumer conflict decisions chosen by the user in the UI.
  // "replace" → overwrite existing (incl. status reset); "keep" → protect existing.
  // Unset consumers fall back to the default newCycle/protection logic.
  overrides?: Record<string, "keep" | "replace">
  isChunk?: boolean
  isLastChunk?: boolean
  allUploadIds?: string[]
}

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: UpsertRequest
  try { body = await request.json() }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const newCycle = !!body.newCycle
  const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {}
  const uploadRows = Array.isArray(body.rows) ? body.rows : []
  const isChunk = !!body.isChunk
  const isLastChunk = !!body.isLastChunk
  const allUploadIds = Array.isArray(body.allUploadIds) ? new Set(body.allUploadIds.map(String)) : null
  if (uploadRows.length === 0) {
    return NextResponse.json({ error: "No rows supplied" }, { status: 400 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const sheetName = body.sheetName || getSheetName()

    // 1. Parallel: ensure headers, ensure history tab, get sheetTabId (needed for row deletion).
    const [headers, sheetTabId] = await Promise.all([
      ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS),
      getSheetTabId(spreadsheetId, sheetName),
      ensureHistoryTab(spreadsheetId),
    ])

    // 2. Find needed column indices.
    const idColIndex      = findColumn(headers, ["consumerId","consumer id","consumer_id"])
    const statusColIndex  = findColumn(headers, ["discon status","disconnection status","status"])
    const agencyColIndex  = findColumn(headers, ["agency"])
    const notesColIndex   = findColumn(headers, ["notes","remarks","comments"])
    const osdColIndex     = findColumn(headers, ["d2 net o/s","d2 net os","outstanding"])
    const lastUpdColIndex = findColumn(headers, ["last updated","lastupdated","updatedAt","timestamp"])
    const nameColIndex    = findColumn(headers, ["name","consumer name"])
    const imageColIndex   = findColumn(headers, ["image","image url","imageurl","photo","evidence"])

    if (idColIndex === -1) {
      return NextResponse.json({ error: "Consumer ID column not found" }, { status: 500 })
    }

    // 3. BatchGet all needed columns in one call (ID + status + OSD + agency + notes + name + image).
    const colIndicesToFetch = [idColIndex, statusColIndex, osdColIndex, agencyColIndex, notesColIndex, nameColIndex, imageColIndex]
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

    type ExistingRow = { row: number; status: string; osd: string; agency: string; notes: string; name: string; image: string }
    const existingMap = new Map<string, ExistingRow>()
    for (let i = 1; i < idValues.length; i++) {
      const id = String(idValues[i]?.[0] || "").trim()
      if (!id) continue
      existingMap.set(id, {
        row: i + 1,
        status: String(colData(statusColIndex)[i]?.[0]  || "").toLowerCase().trim(),
        osd:    String(colData(osdColIndex)[i]?.[0]     || "").trim(),
        agency: String(colData(agencyColIndex)[i]?.[0]  || "").trim(),
        notes:  String(colData(notesColIndex)[i]?.[0]   || "").trim(),
        name:   String(colData(nameColIndex)[i]?.[0]    || "").trim(),
        image:  String(colData(imageColIndex)[i]?.[0]   || "").trim(),
      })
    }

    // 4. Upload column → sheet column mapping.
    // Upload order: off_code, MRU, Consumer Id, Name, Address,
    //               Base Class, Device, O/S Duedate Range, D2 Net O/S, Mobile Number,
    //               Latitude, Longitude
    const uploadColCandidates: string[][] = [
      ["off_code","offcode"],
      ["mru"],
      ["consumer id","consumerid","consumer_id"],
      ["name","consumer name"],
      ["address"],
      ["base class","baseclass"],
      ["device"],
      ["o/s duedate range","os duedate range","due date range"],
      ["d2 net o/s","d2 net os","outstanding"],
      ["mobile number","mobile","phone"],
      ["latitude","lat","lat_coord","lat coord"],
      ["longitude","long","lng","lon","long_coord","long coord"],
    ]
    const uploadToSheetCol = uploadColCandidates.map(cands => findColumn(headers, cands))
    // Base-only indices — safe to update even for protected statuses (includes 10=lat, 11=long)
    const BASE_FIELD_UPLOAD_INDICES = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] // skip 2 (ID)

    const todayStr = today()
    const updateWrites: sheets_v4.Schema$ValueRange[] = []
    const insertRows: string[][] = []
    const historyEntries: Parameters<typeof appendHistory>[0] = []
    const uploadIdSet = new Set<string>()
    let protectedCount = 0
    let autoAssignedCount = 0
    const ts = nowTimestamp()

    for (const uploadRow of uploadRows) {
      const consumerId = String(uploadRow[2] || "").trim()
      if (!consumerId) continue
      uploadIdSet.add(consumerId)

      // Full MRU lookup (no truncation)
      const mru = String(uploadRow[1] || "").trim().toUpperCase()
      const mappedAgency = zoneAgencyMap.get(mru) || ""

      const existing = existingMap.get(consumerId)

      if (!existing) {
        // INSERT: new consumer
        const newRow: string[] = new Array(headers.length).fill("")
        uploadRow.forEach((val, i) => {
          const sc = uploadToSheetCol[i]
          if (sc !== -1) newRow[sc] = val ?? ""
        })
        if (statusColIndex !== -1) newRow[statusColIndex] = "connected"
        if (agencyColIndex !== -1 && mappedAgency) { newRow[agencyColIndex] = mappedAgency; autoAssignedCount++ }
        if (lastUpdColIndex !== -1) newRow[lastUpdColIndex] = todayStr
        insertRows.push(newRow)
      } else {
        // UPDATE: existing consumer
        const isAdminHold  = ADMIN_HOLD_STATUSES.has(existing.status)
        const isFieldWork  = FIELD_WORK_STATUSES.has(existing.status)
        const newOsd = uploadRow[8] ?? ""
        const osdChanged = newOsd && existing.osd &&
          String(parseFloat(newOsd.replace(/,/g,"")) || 0) !== String(parseFloat(existing.osd.replace(/,/g,"")) || 0)

        // Snapshot for history — capture state before any change
        if (isFieldWork) {
          historyEntries.push({
            timestamp: ts,
            consumerId,
            name: existing.name,
            action: osdChanged ? "in_new_list_osd_changed" : "in_new_list",
            oldStatus: existing.status,
            newStatus: "",
            oldOsd: existing.osd,
            oldNotes: existing.notes,
            oldImageUrl: existing.image,
            changedBy: "upload",
          })
        }

        // User's explicit per-consumer decision from the conflict UI (if any).
        const decision = overrides[consumerId]
        const forceReplace = decision === "replace"
        const forceKeep = decision === "keep"

        // Status reset happens on a new cycle (visited/not found/osd-changed) OR
        // when the user explicitly chose to replace this consumer.
        const shouldReset = forceReplace || (
          !isAdminHold && newCycle && isFieldWork && (
            existing.status === "visited" || existing.status === "not found" || osdChanged
          )
        )

        // Take the protected (base-only) path when:
        //  - user forced keep, OR
        //  - (no explicit decision) the default protection logic applies.
        const useProtectedPath = !forceReplace && (
          forceKeep || isAdminHold || (isFieldWork && !shouldReset)
        )

        if (useProtectedPath) {
          protectedCount++
          BASE_FIELD_UPLOAD_INDICES.forEach(i => {
            const sc = uploadToSheetCol[i]
            const val = uploadRow[i] ?? ""
            if (sc !== -1 && val) {
              updateWrites.push({ range: `'${sheetName}'!${colLetter(sc)}${existing.row}`, values: [[val]] })
            }
          })
          if (osdColIndex !== -1 && newOsd) {
            updateWrites.push({ range: `'${sheetName}'!${colLetter(osdColIndex)}${existing.row}`, values: [[newOsd]] })
          }
        } else {
          uploadRow.forEach((val, i) => {
            const sc = uploadToSheetCol[i]
            if (sc !== -1) {
              updateWrites.push({ range: `'${sheetName}'!${colLetter(sc)}${existing.row}`, values: [[val ?? ""]] })
            }
          })
          if (shouldReset && statusColIndex !== -1) {
            updateWrites.push({ range: `'${sheetName}'!${colLetter(statusColIndex)}${existing.row}`, values: [["connected"]] })
            const snap = historyEntries.slice().reverse().find(h => h.consumerId === consumerId)
            if (snap) snap.newStatus = "connected"
          }
          if (agencyColIndex !== -1 && mappedAgency && !existing.agency) {
            updateWrites.push({ range: `'${sheetName}'!${colLetter(agencyColIndex)}${existing.row}`, values: [[mappedAgency]] })
            autoAssignedCount++
          }
        }
        if (lastUpdColIndex !== -1) {
          updateWrites.push({ range: `'${sheetName}'!${colLetter(lastUpdColIndex)}${existing.row}`, values: [[todayStr]] })
        }
      }
    }

    // 5. Consumers NOT in new upload → save to history then DELETE the row entirely.
    const rowsToDelete: number[] = []
    let deletedCount = 0
    if (!isChunk || isLastChunk) {
      const checkSet = allUploadIds || uploadIdSet
      existingMap.forEach((existing, consumerId) => {
        if (checkSet.has(consumerId)) return
        // Record history before deletion
        historyEntries.push({
          timestamp: ts,
          consumerId,
          name: existing.name,
          action: "removed_from_upload",
          oldStatus: existing.status,
          newStatus: "deleted",
          oldOsd: existing.osd,
          oldNotes: existing.notes,
          oldImageUrl: existing.image,
          changedBy: "upload",
        })
        rowsToDelete.push(existing.row)
      })
      deletedCount = rowsToDelete.length
    }

    // 6. Write updates + inserts first (before row indices shift due to deletions).
    if (updateWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: updateWrites },
      })
    }
    if (insertRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:A`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: insertRows },
      })
    }

    // 7. Delete removed-consumer rows. Must sort DESCENDING so deleting row N
    //    doesn't shift row N+1's index before we delete it.
    if (rowsToDelete.length > 0) {
      const sortedDesc = [...rowsToDelete].sort((a, b) => b - a)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: sortedDesc.map(rowNum => ({
            deleteDimension: {
              range: {
                sheetId: sheetTabId,
                dimension: "ROWS",
                startIndex: rowNum - 1, // 0-based
                endIndex: rowNum,       // exclusive
              },
            },
          })),
        },
      })
    }

    invalidateConsumerCache()

    // 8. Fire-and-forget history (non-critical, doesn't block response)
    if (historyEntries.length > 0) {
      appendHistory(historyEntries, spreadsheetId)
        .then(() => invalidateHistoryCache(spreadsheetId))
        .catch(e => console.warn("History append failed (non-critical):", e))
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: uploadRows.length,
        inserted: insertRows.length,
        updated: uploadRows.length - insertRows.length,
        protectedStatusSkipped: protectedCount,
        autoAssigned: autoAssignedCount,
        deletedNotInUpload: deletedCount,
      },
    })
  } catch (error: any) {
    console.error("bulk-upsert error:", error)
    return NextResponse.json({ error: error?.message || "Bulk upsert failed" }, { status: 500 })
  }
})
