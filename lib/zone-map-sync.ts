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
import { appendHistory, nowTimestamp, invalidateHistoryCache, type HistoryEntry } from "@/lib/consumer-history"
import { compactBaseVersion } from "@/lib/version-engine"

const sheets = googleSheets({ version: "v4", auth })

// Statuses an agency (or admin) has already acted on — re-sync must NOT move
// these consumers between agencies.
export const PROTECTED_STATUSES = new Set([
  "disconnected", "paid", "agency paid", "visited", "not found",
  "deemed disconnected", "temprory disconnected", "bill dispute", "office team",
])

export interface SyncZoneSummary {
  scanned: number
  reassigned: number
  skippedProtected: number
  unchanged: number
  unmapped: number
}

async function loadAgencyZoneMapFromSheet(spreadsheetId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "AgencyZoneMap!A:B",
    })
    const rows = resp.data.values || []
    for (let i = 1; i < rows.length; i++) {
      const mru = String(rows[i]?.[0] || "").trim().toUpperCase()
      const agency = String(rows[i]?.[1] || "").trim().toUpperCase()
      if (mru && agency) map.set(mru, agency)
    }
  } catch {
    /* tab not yet created or empty */
  }
  return map
}

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`
}

/**
 * Re-applies the Agency Zone Map to existing consumers in the main consumer/disconnection sheet.
 * Reassigns any consumer whose mapped agency differs from their current agency,
 * skipping consumers in protected field-work statuses.
 * Automatically invalidates caches and bumps consumer base version so all devices refresh.
 */
export async function syncConsumersWithZoneMap(options?: {
  spreadsheetId?: string
  sheetName?: string
  changedBy?: string
  tenantId?: string
  zoneAgencyMap?: Map<string, string>
}): Promise<SyncZoneSummary> {
  const spreadsheetId = options?.spreadsheetId || getSpreadsheetId()
  const sheetName = options?.sheetName || getSheetName()
  const changedBy = options?.changedBy || "admin"
  const tenantId = options?.tenantId || "default"

  const headers = await ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS)

  const idColIndex = findColumn(headers, ["consumerId", "consumer id", "consumer_id"])
  const mruColIndex = findColumn(headers, ["mru"])
  const agencyColIndex = findColumn(headers, ["agency"])
  const statusColIndex = findColumn(headers, ["discon status", "disconnection status", "status"])
  const nameColIndex = findColumn(headers, ["name", "consumer name"])
  const lastUpdColIndex = findColumn(headers, ["last updated", "lastupdated", "updatedAt", "timestamp"])

  if (idColIndex === -1 || mruColIndex === -1 || agencyColIndex === -1) {
    throw new Error("Consumer ID, MRU or Agency column not found in Google Sheet")
  }

  const colIndicesToFetch = [idColIndex, mruColIndex, agencyColIndex, statusColIndex, nameColIndex].filter(
    i => i !== -1
  )
  const ranges = colIndicesToFetch.map(i => `'${sheetName}'!${colLetter(i)}:${colLetter(i)}`)

  const [batchResp, zoneAgencyMap] = await Promise.all([
    sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges }),
    options?.zoneAgencyMap || loadAgencyZoneMapFromSheet(spreadsheetId),
  ])

  const colData = (colIdx: number) => {
    const rangeIdx = colIndicesToFetch.indexOf(colIdx)
    return rangeIdx !== -1 ? batchResp.data.valueRanges?.[rangeIdx]?.values || [] : []
  }

  const idValues = colData(idColIndex)
  const ts = nowTimestamp()
  const date = todayStr()

  const updateWrites: sheets_v4.Schema$ValueRange[] = []
  const historyEntries: HistoryEntry[] = []
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
    if (!mappedAgency) {
      unmapped++
      continue
    }

    const currentAgency = String(colData(agencyColIndex)[i]?.[0] || "").trim()
    if (currentAgency.toUpperCase() === mappedAgency) {
      unchanged++
      continue
    }

    const status = String(colData(statusColIndex)[i]?.[0] || "").toLowerCase().trim()
    if (PROTECTED_STATUSES.has(status)) {
      skippedProtected++
      continue
    }

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
      changedBy,
    })
    reassigned++
  }

  if (updateWrites.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: updateWrites },
    })
    invalidateConsumerCache()

    // Refresh version so all clients/field agencies instantly fetch updated consumer assignments
    await Promise.allSettled([
      compactBaseVersion(tenantId, "consumer"),
      compactBaseVersion(tenantId, "disconnection"),
    ])
  }

  if (historyEntries.length > 0) {
    appendHistory(historyEntries, spreadsheetId)
      .then(() => invalidateHistoryCache(spreadsheetId))
      .catch(e => console.warn("History append failed (non-critical):", e))
  }

  return {
    scanned: Math.max(0, idValues.length - 1),
    reassigned,
    skippedProtected,
    unchanged,
    unmapped,
  }
}
