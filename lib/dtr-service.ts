import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"

const TAB = "DTR"
const DTR_TAG = "dtr-data"
const DTR_REVALIDATE = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache

const sheets = googleSheets({ version: "v4", auth })

export interface DTRRecord {
  dtrCode: string
  feederName: string
  locationName: string
  kvCapacity: string
  status: string
  actualFeeder: string
  actualRating: string
  actualLocation: string
  supplyOffice: string
  latlong: string
  long: string
  image: string
  // New fields
  painting: string
  kiosk: string
  la: string
  ne: string
  loadR: string
  loadY: string
  loadB: string
  loadN: string
  verifiedBy: string
  verifiedAt: string
  remarks: string
  paintingAgency: string
  auditAgency: string
  paintingImage: string
}

export const DTR_HEADERS = [
  "DTR Code", "Feeder Name", "Location Name", "KV Capacity", "STATUS",
  "ACTUAL FEEDER", "ACTUAL RATING", "ACTUAL LOCATION", "SUPPLY OFFICE", "LATLONG",
  "LONG", "IMAGE", "Painting", "Kiosk", "LA",
  "NE", "Load R", "Load Y", "Load B", "Load N",
  "Verified By", "Verified At", "Remarks", "Painting Agency", "Audit Agency", "Painting Image"
]

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

async function ensureHeaders(spreadsheetId: string) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const exists = meta.data.sheets?.some(s => s.properties?.title === TAB)
    if (!exists) {
      // Add sheet if missing
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [DTR_HEADERS] },
      })
      return
    }

    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${TAB}'!1:1`,
    })
    const existing = (headerResp.data.values?.[0] || []).map(String)
    const existingNorm = new Set(existing.map(norm))

    const missing = DTR_HEADERS.filter(h => !existingNorm.has(norm(h)))
    if (missing.length === 0) return

    // Ensure sheet has enough columns to accommodate the new headers
    const requiredCols = existing.length + missing.length
    try {
      const sheet = meta.data.sheets?.find((s) => s.properties?.title === TAB)
      if (sheet) {
        const currentCols = sheet.properties?.gridProperties?.columnCount || 0
        if (currentCols < requiredCols) {
          console.log(`Resizing sheet "${TAB}" columns from ${currentCols} to ${requiredCols}...`)
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: sheet.properties?.sheetId,
                      gridProperties: {
                        columnCount: requiredCols,
                      },
                    },
                    fields: "gridProperties.columnCount",
                  },
                },
              ],
            },
          })
        }
      }
    } catch (err: any) {
      console.error(`Failed to resize columns for sheet "${TAB}":`, err.message || err)
    }

    // Append missing headers
    const startCol = colLetter(existing.length)
    const endCol = colLetter(existing.length + missing.length - 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB}'!${startCol}1:${endCol}1`,
      valueInputOption: "RAW",
      requestBody: { values: [missing] },
    })
  } catch (err) {
    console.error("Failed to ensure DTR headers:", err)
  }
}

function colLetter(i: number) {
  let s = ""
  let t = i
  while (t >= 0) {
    s = String.fromCharCode((t % 26) + 65) + s
    t = Math.floor(t / 26) - 1
  }
  return s
}

function parseRow(r: string[]): DTRRecord {
  return {
    dtrCode:        r[0]  || "",
    feederName:     r[1]  || "",
    locationName:   r[2]  || "",
    kvCapacity:     r[3]  || "",
    status:         r[4]  || "",
    actualFeeder:   r[5]  || "",
    actualRating:   r[6]  || "",
    actualLocation: r[7]  || "",
    supplyOffice:   r[8]  || "",
    latlong:        r[9]  || "",
    long:           r[10] || "",
    image:          r[11] || "",
    painting:       r[12] || "",
    kiosk:          r[13] || "",
    la:             r[14] || "",
    ne:             r[15] || "",
    loadR:          r[16] || "",
    loadY:          r[17] || "",
    loadB:          r[18] || "",
    loadN:          r[19] || "",
    verifiedBy:     r[20] || "",
    verifiedAt:     r[21] || "",
    remarks:        r[22] || "",
    paintingAgency: r[23] || "",
    auditAgency:    r[24] || "",
    paintingImage:  r[25] || "",
  }
}

// Raw fetch for updates
async function _fetchDTRDataRaw(spreadsheetId: string): Promise<DTRRecord[]> {
  await ensureHeaders(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB}'!A:Z`,
  })
  const values = res.data.values || []
  if (values.length <= 1) return []
  return values.slice(1).filter(r => r[0]).map(r => parseRow(r.map(String)))
}

// Cached read
export const fetchDTRData = unstable_cache(
  async (spreadsheetId: string) => _fetchDTRDataRaw(spreadsheetId),
  ["dtr-list-data"],
  { revalidate: DTR_REVALIDATE, tags: [DTR_TAG] }
)

export function invalidateDTRCache() {
  revalidateTag(DTR_TAG)
}

export async function updateDTRRecord(record: DTRRecord, originalDtrCode: string | undefined, spreadsheetId: string): Promise<void> {
  await ensureHeaders(spreadsheetId)
  
  // Find row by reading DTR Code column
  const codesResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB}'!A:A`,
  })
  const codes = (codesResp.data.values || []).map(r => String(r[0] || ""))
  const lookupCode = originalDtrCode || record.dtrCode
  const rowIndex = codes.findIndex(code => code.toUpperCase().trim() === lookupCode.toUpperCase().trim())
  
  const rowNum = rowIndex !== -1 ? rowIndex + 1 : codes.length + 1

  const values = [
    record.dtrCode,
    record.feederName,
    record.locationName,
    record.kvCapacity,
    record.status,
    record.actualFeeder,
    record.actualRating,
    record.actualLocation,
    record.supplyOffice,
    record.latlong,
    record.long,
    record.image,
    record.painting,
    record.kiosk,
    record.la,
    record.ne,
    record.loadR,
    record.loadY,
    record.loadB,
    record.loadN,
    record.verifiedBy,
    record.verifiedAt,
    record.remarks,
    record.paintingAgency || "",
    record.auditAgency || "",
    record.paintingImage || "",
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB}'!A${rowNum}:Z${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  })

  invalidateDTRCache()
}

export async function uploadDTRData(rows: Omit<DTRRecord, "verifiedBy" | "verifiedAt">[], clearExisting: boolean, spreadsheetId: string): Promise<number> {
  await ensureHeaders(spreadsheetId)

  if (clearExisting) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${TAB}'!A2:Z`,
    })
  }

  if (rows.length === 0) return 0

  const values = rows.map(r => [
    r.dtrCode,
    r.feederName,
    r.locationName,
    r.kvCapacity,
    r.status || "",
    r.actualFeeder || "",
    r.actualRating || "",
    r.actualLocation || "",
    r.supplyOffice || "",
    r.latlong || "",
    r.long || "",
    r.image || "",
    r.painting || "Pending",
    r.kiosk || "Good",
    r.la || "Good",
    r.ne || "Good",
    r.loadR || "",
    r.loadY || "",
    r.loadB || "",
    r.loadN || "",
    "", // verifiedBy
    "", // verifiedAt
    r.remarks || "",
    r.paintingAgency || "",
    r.auditAgency || "",
    r.paintingImage || "",
  ])

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${TAB}'!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  })

  invalidateDTRCache()
  return res.data.updates?.updatedRows || rows.length
}

export async function updateDTRPainting(
  dtrCode: string,
  painting: string,
  image: string,
  remarks: string,
  verifiedBy: string,
  spreadsheetId: string
): Promise<void> {
  await ensureHeaders(spreadsheetId)

  // Find row by reading DTR Code column
  const codesResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB}'!A:A`,
  })
  const codes = (codesResp.data.values || []).map(r => String(r[0] || ""))
  const rowIndex = codes.findIndex(code => code.toUpperCase().trim() === dtrCode.toUpperCase().trim())
  if (rowIndex === -1) throw new Error("DTR Code not found in sheet")

  const rowNum = rowIndex + 1

  // Format timestamp: DD-MM-YYYY HH:mm
  const d = new Date()
  const timestamp = `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`

  // Update Painting Status (col M/13)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB}'!M${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[painting]] },
  })

  // Update Painting Image (col Z/26)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB}'!Z${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[image]] },
  })

  // Update Verified By (col U/21), Verified At (col V/22), Remarks (col W/23)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB}'!U${rowNum}:W${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[verifiedBy, timestamp, remarks]] },
  })

  invalidateDTRCache()
}
