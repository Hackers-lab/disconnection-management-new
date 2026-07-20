import { sheets as googleSheets, type sheets_v4 } from "@googleapis/sheets"
import { auth } from "./google-drive"
import { EXPECTED_CONSUMER_HEADERS, type ConsumerData } from "./google-sheets"
import { getTenantContext } from "./tenant-context"

const sheets = googleSheets({ version: "v4", auth })

// Loose name match (strips non-alphanumerics, lowercases).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
export const findColumn = (headers: string[], candidates: string[]) => {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => norm(h ?? "") === norm(c))
    if (idx !== -1) return idx
  }
  return -1
}

// 0-based index -> A1 column letter ("A", "Z", "AA", ...).
export const colLetter = (i: number) => {
  let s = ""
  let t = i
  while (t >= 0) {
    s = String.fromCharCode((t % 26) + 65) + s
    t = Math.floor(t / 26) - 1
  }
  return s
}

export function getSpreadsheetId() {
  const context = getTenantContext()
  if (context) {
    if (!context.spreadsheetId) {
      throw new Error("No Google Spreadsheet ID is configured for this Customer Care Center (CCC). Please complete Google Onboarding first.")
    }
    return context.spreadsheetId
  }

  const id =
    process.env.DISCONNECTION_SHEET?.trim() ||
    process.env.USERS_SHEET?.trim() ||
    process.env.GOOGLE_SHEET_ID?.trim()
  if (!id) throw new Error("DISCONNECTION_SHEET (or USERS_SHEET / GOOGLE_SHEET_ID) not set")
  if (id.includes("google.com") || id.includes("/")) {
    throw new Error("Sheet ID appears to be a URL. Use only the ID string.")
  }
  return id
}

export function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || "Sheet1"
}

// Item 10: read existing headers; append any expected ones that are missing
// so the rest of the pipeline (read + write) finds them. Single read + at most
// one append per cold path.
export async function ensureHeaders(
  spreadsheetId: string,
  sheetName: string,
  expected: readonly string[]
): Promise<string[]> {
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  })
  const existing = (headerResp.data.values?.[0] || []).map((h) => String(h ?? ""))
  const existingNorm = new Set(existing.map(norm))

  const missing = expected.filter((h) => !existingNorm.has(norm(h)))
  if (missing.length === 0) return existing

  // Ensure sheet has enough columns to accommodate the new headers
  const requiredCols = existing.length + missing.length
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
    if (sheet) {
      const currentCols = sheet.properties?.gridProperties?.columnCount || 0
      if (currentCols < requiredCols) {
        console.log(`Resizing sheet "${sheetName}" columns from ${currentCols} to ${requiredCols}...`)
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
    console.error(`Failed to resize columns for sheet "${sheetName}":`, err.message || err)
  }

  const startCol = colLetter(existing.length)
  const endCol = colLetter(existing.length + missing.length - 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!${startCol}1:${endCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [missing as string[]] },
  })

  return [...existing, ...missing]
}

// Field map shared by single-row update + bulk operations.
const FIELD_MAP: Partial<Record<keyof ConsumerData, string[]>> = {
  disconStatus: ["disconStatus", "disconnectionStatus", "status", "discon status"],
  disconDate: ["disconDate", "disconnectionDate", "discon date"],
  reading: ["reading", "meterReading", "meter reading"],
  notes: ["notes", "remarks", "comments"],
  imageUrl: ["imageUrl", "image", "photo", "url", "link"],
  lastUpdated: ["lastUpdated", "updatedAt", "last updated"],
  agency: ["agency"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
  // Item 5
  priority: ["priority"],
  // Items 3 + 13
  paidAmount: ["paid amount", "paidamount", "amount paid"],
  paidDate: ["paid date", "paiddate", "payment date"],
  paidType: ["paid type", "paidtype", "payment type"],
  outstandingAfter: ["outstanding after", "outstandingafter", "remaining outstanding"],
  nextPaymentDate: ["next payment date", "nextpaymentdate", "next payment"],
  paymentSource: ["payment source", "paymentsource", "payment mode"],
}

export async function updateConsumerInGoogleSheet(consumer: ConsumerData, spreadsheetId: string) {
  try {
    if (!spreadsheetId) throw new Error("spreadsheetId parameter is required")
    const sheetName = getSheetName()

    // 1. Ensure all expected columns exist.
    const headers = await ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS)

    const idColIndex = findColumn(headers, ["consumerId", "consumer id", "consumer_id"])
    if (idColIndex === -1) throw new Error("Consumer ID column not found")

    // 2. Find the row by reading just the Consumer ID column (1 API call).
    const idColResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!${colLetter(idColIndex)}:${colLetter(idColIndex)}`,
    })
    const idRows = idColResp.data.values
    if (!idRows) throw new Error("No data in Consumer ID column")
    const rowIndex = idRows.findIndex((row: string[]) => row[0] === consumer.consumerId)
    if (rowIndex === -1) throw new Error(`Consumer ID ${consumer.consumerId} not found`)

    // 3. Build per-cell update list.
    const dataToUpdate: sheets_v4.Schema$ValueRange[] = []
    Object.entries(FIELD_MAP).forEach(([key, names]) => {
      const colIndex = findColumn(headers, names!)
      const val = consumer[key as keyof ConsumerData]
      if (colIndex !== -1 && val !== undefined && val !== null) {
        dataToUpdate.push({
          range: `'${sheetName}'!${colLetter(colIndex)}${rowIndex + 1}`,
          values: [[String(val)]],
        })
      }
    })

    if (dataToUpdate.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: dataToUpdate },
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Sheet update error:", error)
    throw error
  }
}
