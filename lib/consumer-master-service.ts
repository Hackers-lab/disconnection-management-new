// Server-only — imports @googleapis/sheets. Never import in "use client" components.
import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

const sheets = googleSheets({ version: "v4", auth })

export const MASTER_TAB = "Consumer_Master"
const MASTER_TAG        = "consumer-master"
const MASTER_REVALIDATE = 30 * 24 * 60 * 60 // 30 days — changes rarely

export const MASTER_HEADERS = [
  "Consumer ID", "Name", "C/O", "Address", "Class",
  "Meter No", "Zone", "Mobile", "Latitude", "Longitude",
]

export interface ConsumerMasterRow {
  consumerId:  string
  name:        string
  careOf:      string
  address:     string
  baseClass:   string
  meterNo:     string
  zone:        string
  mobile:      string
  latitude:    string
  longitude:   string
}

let tabReady: Record<string, boolean> = {}

async function ensureTab(id: string) {
  if (tabReady[id]) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = (meta.data.sheets || []).map(s => s.properties?.title)
  if (!existing.includes(MASTER_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: MASTER_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${MASTER_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [MASTER_HEADERS] },
    })
  }
  tabReady[id] = true
}

function parseRow(r: string[]): ConsumerMasterRow {
  return {
    consumerId: r[0] || "",
    name:       r[1] || "",
    careOf:     r[2] || "",
    address:    r[3] || "",
    baseClass:  r[4] || "",
    meterNo:    r[5] || "",
    zone:       r[6] || "",
    mobile:     r[7] || "",
    latitude:   r[8] || "",
    longitude:  r[9] || "",
  }
}

// ── Raw fetch (used by write paths so they see live data) ─────────────────────
// Exported so the refresh-latlong API can bypass the 30-day cache.
export async function _fetchMasterRaw(spreadsheetId: string): Promise<ConsumerMasterRow[]> {
  await ensureTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${MASTER_TAB}!A:J` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseRow(r.map(String)))
}

let memoryCache: Record<string, { data: ConsumerMasterRow[], timestamp: number }> = {}

// ── Cached read ───────────────────────────────────────────────────────────────
export async function fetchMasterData(spreadsheetId: string): Promise<ConsumerMasterRow[]> {
  const cached = memoryCache[spreadsheetId]
  // Cache for 30 days (or until invalidated) to match MASTER_REVALIDATE
  if (cached && Date.now() - cached.timestamp < MASTER_REVALIDATE * 1000) {
    return cached.data
  }

  const data = await _fetchMasterRaw(spreadsheetId)
  memoryCache[spreadsheetId] = { data, timestamp: Date.now() }
  return data
}

export function invalidateMasterCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    delete memoryCache[spreadsheetId]
  } else {
    memoryCache = {}
  }
  revalidateTag(MASTER_TAG)
}

// ── Upload (replaces entire sheet data) ──────────────────────────────────────
export async function uploadMasterData(rows: ConsumerMasterRow[], clearExisting: boolean = true, spreadsheetId: string): Promise<{ count: number }> {
  await ensureTab(spreadsheetId)

  // Ensure the sheet has enough rows to avoid grid limit errors on clear and append
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const sheet = (meta.data.sheets || []).find(s => s.properties?.title === MASTER_TAB)
    if (sheet) {
      const sheetId = sheet.properties?.sheetId
      const currentRows = sheet.properties?.gridProperties?.rowCount || 0
      
      let requiredRows = Math.max(2, rows.length + 1)
      if (!clearExisting) {
        // For appending, we fetch the existing raw count
        const existingData = await _fetchMasterRaw(spreadsheetId)
        requiredRows = existingData.length + rows.length + 1
      }

      if (currentRows < requiredRows) {
        console.log(`Resizing sheet "${MASTER_TAB}" rows from ${currentRows} to ${requiredRows}...`)
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId,
                    gridProperties: {
                      rowCount: requiredRows,
                    },
                  },
                  fields: "gridProperties.rowCount",
                },
              },
            ],
          },
        })
      }
    }
  } catch (err: any) {
    console.error(`Failed to resize rows for sheet "${MASTER_TAB}":`, err.message || err)
  }

  if (clearExisting) {
    // Clear existing data (keep header row)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${MASTER_TAB}!A2:J`,
    })
  }

  if (rows.length === 0) {
    invalidateMasterCache()
    return { count: 0 }
  }

  // Write in batches of 5000 to stay within API limits while minimising
  // the number of round-trips (and therefore rate-limit risk).
  // A 1-second pause between batches avoids the 60-writes/min/user quota.
  const BATCH = 5000
  let totalWritten = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const values = batch.map(r => [
      r.consumerId, r.name, r.careOf, r.address, r.baseClass,
      r.meterNo, r.zone, r.mobile, r.latitude, r.longitude,
    ])

    try {
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${MASTER_TAB}!A:A`,
        valueInputOption: "RAW",
        requestBody: { values },
      })
      // Google returns the number of rows it actually wrote
      const updatedRows = result.data.updates?.updatedRows ?? batch.length
      totalWritten += updatedRows
    } catch (err: any) {
      console.error(`Consumer master batch ${i}-${i + batch.length} failed:`, err?.message || err)
      // If we've written some batches already, report what we got. The caller
      // will see count < rows.length and can surface the partial failure.
      break
    }

    // Pause between batches to stay under Google Sheets API rate limits
    if (i + BATCH < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  invalidateMasterCache()
  return { count: totalWritten }
}

