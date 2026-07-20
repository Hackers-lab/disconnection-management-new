export interface DeemedVisitData {
  _syncStatus?: 'syncing' | 'error'
  _localEditedAt?: number
  consumerId: string
  name: string
  address: string
  mobileNumber: string
  totalArrears: string
  disconStatus: string
  disconDate?: string
  remarks?: string
  visitDate?: string
  reading?: string
  agency?: string
  lastUpdated?: string
  offCode?: string
  mru?: string
  baseClass?: string
  device?: string
  osDuedateRange?: string
  imageUrl?: string
}

// Warm-function in-memory cache per spreadsheet
const DD_MEMO_TTL_MS = 60_000
let ddMemo: Record<string, { at: number; data: DeemedVisitData[] }> = {}

export function invalidateDDCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    delete ddMemo[spreadsheetId]
  } else {
    ddMemo = {}
  }
}

const DD_COLUMN_MAPPINGS = {
  offCode:        ["off_code", "offcode", "office code"],
  mru:            ["mru"],
  consumerId:     ["consumer id", "consumerid", "consumer_id"],
  name:           ["name", "consumer name"],
  address:        ["address"],
  baseClass:      ["base class", "baseclass", "bclass", "bclass/phase"],
  device:         ["device", "meter"],
  osDuedateRange: ["o/s duedate range", "os duedate range", "o/s due date range", "due date range"],
  totalArrears:   ["d2 net o/s", "d2 net os", "outstanding", "d2netos"],
  disconStatus:   ["discon status", "disconnection status", "status"],
  disconDate:     ["discon date", "disconnection date"],
  mobileNumber:   ["mobile number", "mobile", "phone"],
  agency:         ["agency"],
  remarks:        ["remarks", "notes"],
  visitDate:      ["visit date", "visitdate"],
  reading:        ["reading", "meter reading", "meterreading"],
  imageUrl:       ["image", "photo", "imageurl", "imagelink", "url", "link"],
  lastUpdated:    ["last updated", "last_updated", "updated_at", "timestamp"],
}

async function getSheetsClient() {
  const { sheets: googleSheets } = await import("@googleapis/sheets")
  const { auth } = await import("./google-drive")
  return googleSheets({ version: "v4", auth })
}

function findColumnIndex(headers: string[], searchTerms: string[]): number {
  for (const term of searchTerms) {
    const idx = headers.findIndex(h =>
      h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(term.toLowerCase().replace(/[^a-z0-9]/g, ""))
    )
    if (idx !== -1) return idx
  }
  return -1
}

function parseNumericValue(value: string): string {
  if (!value || typeof value !== "string") return "0"
  const cleaned = value.replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? "0" : parsed.toString()
}

export async function fetchDDData(spreadsheetId: string): Promise<DeemedVisitData[]> {
  const memo = ddMemo[spreadsheetId]
  if (memo && Date.now() - memo.at < DD_MEMO_TTL_MS) {
    return memo.data
  }

  try {
    if (!spreadsheetId) throw new Error("spreadsheetId parameter is required")

    const sheets = await getSheetsClient()
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "DD",
      valueRenderOption: "FORMATTED_VALUE",
      majorDimension: "ROWS",
    })

    const rows = (response.data.values || []) as string[][]
    if (rows.length < 2) return []

    const headers = rows[0].map(h => String(h ?? "").trim())

    const colIdx: Record<string, number> = {}
    Object.entries(DD_COLUMN_MAPPINGS).forEach(([key, terms]) => {
      colIdx[key] = findColumnIndex(headers, terms)
    })

    const records: DeemedVisitData[] = []

    for (let i = 1; i < rows.length; i++) {
      try {
        const values = (rows[i] || []).map(v => String(v ?? ""))

        if (values.length === 0 || values.every(v => !v || v.trim() === "")) continue

        const consumerId = colIdx.consumerId >= 0 ? values[colIdx.consumerId]?.trim() || "" : ""
        if (!consumerId) continue

        // Normalize lastUpdated to YYYY-MM-DD for consistent date comparisons
        let lastUpdated = colIdx.lastUpdated >= 0 ? values[colIdx.lastUpdated] || "" : ""
        if (lastUpdated.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [d, m, y] = lastUpdated.split("-")
          lastUpdated = `${y}-${m}-${d}`
        }

        records.push({
          consumerId,
          name:           colIdx.name >= 0           ? values[colIdx.name] || ""           : "",
          address:        colIdx.address >= 0         ? values[colIdx.address] || ""         : "",
          mobileNumber:   colIdx.mobileNumber >= 0    ? values[colIdx.mobileNumber] || ""    : "",
          totalArrears:   parseNumericValue(colIdx.totalArrears >= 0 ? values[colIdx.totalArrears] || "0" : "0"),
          disconStatus:   colIdx.disconStatus >= 0    ? values[colIdx.disconStatus] || "Deemed Disconnected" : "Deemed Disconnected",
          disconDate:     colIdx.disconDate >= 0      ? values[colIdx.disconDate] || ""      : "",
          remarks:        colIdx.remarks >= 0         ? values[colIdx.remarks] || ""         : "",
          visitDate:      colIdx.visitDate >= 0       ? values[colIdx.visitDate] || ""       : "",
          reading:        colIdx.reading >= 0         ? values[colIdx.reading] || ""         : "",
          agency:         colIdx.agency >= 0          ? values[colIdx.agency] || ""          : "",
          lastUpdated,
          offCode:        colIdx.offCode >= 0         ? values[colIdx.offCode] || ""         : "",
          mru:            colIdx.mru >= 0             ? values[colIdx.mru] || ""             : "",
          baseClass:      colIdx.baseClass >= 0       ? values[colIdx.baseClass] || ""       : "",
          device:         colIdx.device >= 0          ? values[colIdx.device] || ""          : "",
          osDuedateRange: colIdx.osDuedateRange >= 0  ? values[colIdx.osDuedateRange] || ""  : "",
          imageUrl:       colIdx.imageUrl >= 0        ? values[colIdx.imageUrl] || ""        : "",
        })
      } catch {
        // Skip malformed rows silently
      }
    }

    ddMemo[spreadsheetId] = { at: Date.now(), data: records }
    return records
  } catch (error) {
    console.error("Error fetching DD data from Google Sheets:", error)
    return []
  }
}

export async function getDDUpdates(spreadsheetId: string): Promise<DeemedVisitData[]> {
  const allData = await fetchDDData(spreadsheetId)

  // 48-hour window — same as consumer patch, covers timezone differences
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)

  return allData.filter(d => {
    if (!d.lastUpdated) return false
    let updatedDate: Date | null = null
    const s = d.lastUpdated

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      updatedDate = new Date(s)
    } else if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
      const [day, month, year] = s.split(/[-/]/)
      updatedDate = new Date(`${year}-${month}-${day}`)
    } else {
      updatedDate = new Date(s)
    }

    return updatedDate && !isNaN(updatedDate.getTime()) && updatedDate >= cutoff
  })
}
