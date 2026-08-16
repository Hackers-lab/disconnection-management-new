// Server-only — imports @googleapis/sheets. Never import in "use client" components.
import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { db } from "./db"
import { getTenantContext } from "./tenant-context"

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
let masterCountCache: Record<string, { count: number, timestamp: number }> = {}

// ── Cached read ───────────────────────────────────────────────────────────────
export async function fetchMasterData(spreadsheetId: string): Promise<ConsumerMasterRow[]> {
  const cached = memoryCache[spreadsheetId]
  // Cache for 30 days (or until invalidated) to match MASTER_REVALIDATE
  if (cached && Date.now() - cached.timestamp < MASTER_REVALIDATE * 1000) {
    return cached.data
  }

  // Try Turso SQL Database primary read
  try {
    const context = getTenantContext()
    const cccCode = context?.cccCode || "6612107"
    const res = await db.execute({
      sql: `SELECT consumer_id as consumerId, name, care_of as careOf, address, 
                   base_class as baseClass, meter_no as meterNo, zone, mobile, 
                   CAST(COALESCE(latitude, '') AS TEXT) as latitude, 
                   CAST(COALESCE(longitude, '') AS TEXT) as longitude 
            FROM master_consumers WHERE ccc_code = ?`,
      args: [cccCode]
    })

    if (res.rows && res.rows.length > 0) {
      const data: ConsumerMasterRow[] = res.rows.map((r: any) => ({
        consumerId: String(r.consumerId || ""),
        name: String(r.name || ""),
        careOf: String(r.careOf || ""),
        address: String(r.address || ""),
        baseClass: String(r.baseClass || ""),
        meterNo: String(r.meterNo || ""),
        zone: String(r.zone || ""),
        mobile: String(r.mobile || ""),
        latitude: String(r.latitude || ""),
        longitude: String(r.longitude || ""),
      }))
      memoryCache[spreadsheetId] = { data, timestamp: Date.now() }
      masterCountCache[spreadsheetId] = { count: data.length, timestamp: Date.now() }
      return data
    }
  } catch (err) {
    console.error("Turso master fetch error, falling back to Google Sheets:", err)
  }

  const data = await _fetchMasterRaw(spreadsheetId)
  memoryCache[spreadsheetId] = { data, timestamp: Date.now() }
  masterCountCache[spreadsheetId] = { count: data.length, timestamp: Date.now() }
  return data
}

// ── Lightweight row count (queries only Column A) ─────────────────────────────
export async function fetchMasterCount(spreadsheetId: string): Promise<number> {
  const fullCached = memoryCache[spreadsheetId]
  if (fullCached && Date.now() - fullCached.timestamp < MASTER_REVALIDATE * 1000) {
    return fullCached.data.length
  }

  const countCached = masterCountCache[spreadsheetId]
  if (countCached && Date.now() - countCached.timestamp < MASTER_REVALIDATE * 1000) {
    return countCached.count
  }

  // Try Turso SQL Database count
  try {
    const context = getTenantContext()
    const cccCode = context?.cccCode || "6612107"
    const res = await db.execute({
      sql: "SELECT COUNT(*) as count FROM master_consumers WHERE ccc_id = (SELECT id FROM ccc_registry WHERE ccc_code = ?)",
      args: [cccCode]
    })
    if (res.rows && res.rows[0]) {
      const count = Number(res.rows[0].count)
      if (count > 0) {
        masterCountCache[spreadsheetId] = { count, timestamp: Date.now() }
        return count
      }
    }
  } catch (err) {
    console.error("Turso master count error, falling back to Google Sheets:", err)
  }

  try {
    await ensureTab(spreadsheetId)
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${MASTER_TAB}!A:A` })
    const rows = res.data.values || []
    // Filter non-empty rows and exclude header (first row)
    const count = Math.max(0, rows.slice(1).filter(r => r && r[0] && String(r[0]).trim() !== "").length)
    masterCountCache[spreadsheetId] = { count, timestamp: Date.now() }
    return count
  } catch (error) {
    console.error("Failed to fetch lightweight master count, falling back to full fetch:", error)
    const fullData = await fetchMasterData(spreadsheetId)
    return fullData.length
  }
}

export function invalidateMasterCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    delete memoryCache[spreadsheetId]
    delete masterCountCache[spreadsheetId]
  } else {
    memoryCache = {}
    masterCountCache = {}
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

