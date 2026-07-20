import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "./google-drive"

const HISTORY_TAB = "DTR_History"

const sheets = googleSheets({ version: "v4", auth })

export interface DTRHistoryEntry {
  timestamp: string
  dtrCode: string
  feederName: string
  painting: string
  kiosk: string
  la: string
  ne: string
  loadCurrents: string // String containing R, Y, B, N details
  verifiedBy: string
  remarks: string
  imageUrl: string
  locationName: string
}

export const DTR_HISTORY_HEADERS = [
  "Timestamp", "DTR Code", "Feeder Name", "Painting", "Kiosk", "LA", "NE",
  "Load Currents", "Verified By", "Remarks", "Image URL", "Location Name"
]

async function ensureDTRHistoryTab(spreadsheetId: string) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const exists = meta.data.sheets?.some(s => s.properties?.title === HISTORY_TAB)
    if (!exists) {
      // Add DTR History tab if missing
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: HISTORY_TAB } } }] },
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${HISTORY_TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [DTR_HISTORY_HEADERS] },
      })
    }
  } catch (err) {
    console.error("Failed to ensure DTR history headers:", err)
  }
}

export async function fetchDTRHistory(dtrCode: string, spreadsheetId: string): Promise<DTRHistoryEntry[]> {
  try {
    await ensureDTRHistoryTab(spreadsheetId)
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${HISTORY_TAB}!A:L`,
    })
    const rows = resp.data.values || []
    if (rows.length <= 1) return []
    
    return rows.slice(1)
      .map(r => ({
        timestamp:    String(r[0] || ""),
        dtrCode:      String(r[1] || ""),
        feederName:   String(r[2] || ""),
        painting:     String(r[3] || ""),
        kiosk:        String(r[4] || ""),
        la:           String(r[5] || ""),
        ne:           String(r[6] || ""),
        loadCurrents: String(r[7] || ""),
        verifiedBy:   String(r[8] || ""),
        remarks:      String(r[9] || ""),
        imageUrl:     String(r[10] || ""),
        locationName: String(r[11] || ""),
      }))
      .filter(h => h.dtrCode.toUpperCase().trim() === dtrCode.toUpperCase().trim())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)) // newest first
  } catch (err) {
    console.error("Failed to fetch DTR history:", err)
    return []
  }
}

export async function appendDTRHistory(entry: DTRHistoryEntry, spreadsheetId: string): Promise<void> {
  try {
    await ensureDTRHistoryTab(spreadsheetId)
    
    const values = [[
      entry.timestamp,
      entry.dtrCode,
      entry.feederName,
      entry.painting,
      entry.kiosk,
      entry.la,
      entry.ne,
      entry.loadCurrents,
      entry.verifiedBy,
      entry.remarks,
      entry.imageUrl,
      entry.locationName
    ]]

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${HISTORY_TAB}!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    })
  } catch (err) {
    console.error("Failed to append DTR history:", err)
  }
}
