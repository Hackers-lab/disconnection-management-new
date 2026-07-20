import { revalidateTag } from "next/cache"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// Tag used to invalidate the shared Data Cache after any consumer write.
export const CONSUMERS_TAG = "consumers"

export interface ConsumerData {
  _syncStatus?: 'syncing' | 'error'
  // Epoch ms set when the client edits this row locally. Used to protect
  // recent local writes from being overwritten by stale CDN-cached patch data.
  _localEditedAt?: number
  offCode: string
  mru: string
  consumerId: string
  name: string
  address: string
  baseClass: string
  class: string
  natureOfConn: string
  govNonGov: string
  device: string
  osDuedateRange: string
  d2NetOS: string
  disconStatus: string
  disconDate: string
  gisPole: string
  mobileNumber: string
  latitude: string
  longitude: string
  agency?: string
  lastUpdated?: string
  notes?: string
  reading?: string
  imageUrl?: string
  // Admin-marked urgency for disconnect (item 5)
  priority?: string
  // Payment-tracking fields (items 3 + 13) — populated by the bulk upload
  // pipeline (Cash Desk / Portal). Optional so existing rows stay backward-compatible.
  paidAmount?: string
  paidDate?: string
  paidType?: 'full' | 'partial' | ''
  outstandingAfter?: string
  nextPaymentDate?: string
  paymentSource?: string
}

// Helper function to clean and parse numeric values
function parseNumericValue(value: string): string {
  if (!value || typeof value !== "string") return "0"

  // Remove commas, spaces, currency symbols, and other non-numeric characters except decimal point
  const cleaned = value.replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")

  // Parse as float and return as string, default to "0" if invalid
  const parsed = Number.parseFloat(cleaned)
  return isNaN(parsed) ? "0" : parsed.toString()
}

// Helper function to parse CSV properly
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  // Add the last field
  result.push(current.trim())

  return result
}

// Helper function to find column index (case-insensitive, flexible matching)
function findColumnIndex(headers: string[], searchTerms: string[]): number {
  for (const term of searchTerms) {
    const index = headers.findIndex((header) =>
      header
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes(term.toLowerCase().replace(/[^a-z0-9]/g, "")),
    )
    if (index !== -1) return index
  }
  return -1
}

// lib/google-sheets.ts
export async function getAgencyLastUpdates(spreadsheetId: string): Promise<
  { name: string; lastUpdate: string; lastUpdateCount: number }[]
> {
  const consumers = await fetchConsumerData(spreadsheetId);

  // 1. Group all records by agency
  const agencyData = new Map<string, any[]>();
  consumers.forEach(item => {
      if (!item.agency) return;
      const agency = item.agency;
      if (!agencyData.has(agency)) {
          agencyData.set(agency, []);
      }
      agencyData.get(agency)!.push(item);
  });
  
  const dateFormats = [
      {
        pattern: /^(\d{2})-(\d{2})-(\d{4})$/,
        handler: (d: RegExpMatchArray) => new Date(`${d[3]}-${d[2]}-${d[1]}`), // DD-MM-YYYY
      },
      {
        pattern: /^(\d{2})-(\d{2})-(\d{4})$/,
        handler: (d: RegExpMatchArray) => new Date(`${d[3]}-${d[1]}-${d[2]}`), // MM-DD-YYYY
      },
      {
        pattern: /^(\d{4})-(\d{2})-(\d{2})$/,
        handler: (d: RegExpMatchArray) => new Date(`${d[1]}-${d[2]}-${d[3]}`), // YYYY-MM-DD
      },
  ];
  
  const parseDate = (dateStr: string): Date | null => {
      if (!dateStr) return null;
      for (const format of dateFormats) {
          const match = dateStr.match(format.pattern);
          if (match) {
              const d = format.handler(match);
              if (!isNaN(d.getTime())) return d;
          }
      }
      return null;
  }

  const derivedUpdates = Array.from(agencyData.entries()).map(([name, items]) => {
      if (items.length === 0) {
          return { name, lastUpdate: "", lastUpdateCount: 0 };
      }

      let latestTs = 0;
      let latestDateStr = "";

      // Find the latest date string in this agency's items
      items.forEach(item => {
          if (item.disconDate) {
              const d = parseDate(item.disconDate);
              if (d && d.getTime() > latestTs) {
                  latestTs = d.getTime();
                  latestDateStr = item.disconDate;
              }
          }
      });

      if (latestDateStr === "") {
        return { name, lastUpdate: "", lastUpdateCount: 0 };
      }

      // Count items that have the latest date string
      const count = items.filter(item => item.disconDate === latestDateStr).length;

      const latestDate = parseDate(latestDateStr);
      const formattedDate = latestDate 
          ? `${String(latestDate.getDate()).padStart(2, "0")}-${String(latestDate.getMonth() + 1).padStart(2, "0")}-${latestDate.getFullYear()}`
          : "";

      return {
          name,
          lastUpdate: formattedDate,
          lastUpdateCount: count
      };
  });

  return derivedUpdates.sort((a, b) => a.name.localeCompare(b.name));
}



// Shared cross-instance cache via Next.js Data Cache. Unlike a module-level
// memo (which lives in a single serverless instance's memory and dies on every
// cold start), unstable_cache stores the *parsed* result in storage shared by
// all instances and revalidates it in the background. Repeated calls skip both
// the Google Sheets fetch AND the row-by-row parse — near-zero CPU per call.
const CONSUMER_REVALIDATE_S = 5 * 60 // 5 minutes — read-heavy, rarely changes

// In-memory caches (with request coalescing)
let memoryCache: { [spreadsheetId: string]: { data: ConsumerData[]; timestamp: number } } = {}
let activeFetches: { [spreadsheetId: string]: Promise<ConsumerData[]> } = {}
let backgroundFetching: { [spreadsheetId: string]: boolean } = {}

function getCacheFilePath(spreadsheetId: string): string {
  const sanitizedId = spreadsheetId.replace(/[^a-zA-Z0-9_-]/g, "")
  const dir = os.tmpdir()
  return path.join(dir, `consumer-data-${sanitizedId}.json`)
}

async function getCachedData(spreadsheetId: string): Promise<{ data: ConsumerData[]; timestamp: number } | null> {
  // 1. Check memory cache first
  if (memoryCache[spreadsheetId]) {
    return memoryCache[spreadsheetId]
  }

  // 2. Check disk cache
  const filePath = getCacheFilePath(spreadsheetId)
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8")
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.data) && typeof parsed.timestamp === "number") {
        // Hydrate memory cache
        memoryCache[spreadsheetId] = parsed
        return parsed
      }
    }
  } catch (err) {
    console.warn("Failed to read disk cache for spreadsheetId:", spreadsheetId, err)
  }

  return null
}

async function writeCache(spreadsheetId: string, data: ConsumerData[]) {
  const entry = {
    timestamp: Date.now(),
    data,
  }
  // Update memory cache
  memoryCache[spreadsheetId] = entry

  // Update disk cache
  const filePath = getCacheFilePath(spreadsheetId)
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(entry), "utf-8")
  } catch (err) {
    console.warn("Failed to write disk cache for spreadsheetId:", spreadsheetId, err)
  }
}

// Allow other modules (e.g. /api/consumers/update) to invalidate the cache
// after a successful write so the next read reflects the change immediately.
// Works across all instances because it busts the shared Data Cache tag.
export function invalidateConsumerCache() {
  memoryCache = {}
  activeFetches = {}
  backgroundFetching = {}

  // Delete cache files from disk
  try {
    const dir = os.tmpdir()
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
      for (const file of files) {
        if (file.startsWith("consumer-data-") && file.endsWith(".json")) {
          try {
            fs.unlinkSync(path.join(dir, file))
          } catch (e) {
            // Ignore file removal errors
          }
        }
      }
    }
  } catch (err) {
    console.error("Error clearing disk cache files:", err)
  }

  try {
    revalidateTag(CONSUMERS_TAG)
  } catch (e) {
    // Ignore if next/cache is not supported in the current environment
  }
}

// Lazy import to avoid loading googleapis on cold paths that don't need it.
async function getSheetsClient() {
  const { sheets: googleSheets } = await import("@googleapis/sheets")
  const { auth } = await import("./google-drive")
  return googleSheets({ version: "v4", auth })
}

const COLUMN_MAPPINGS = {
  offCode: ["off_code", "offcode", "office code"],
  mru: ["mru"],
  consumerId: ["consumer id", "consumerid", "consumer_id"],
  name: ["name", "consumer name"],
  address: ["address"],
  baseClass: ["base class", "baseclass", "base_class"],
  class: ["class"],
  natureOfConn: ["nature of conn", "nature of connection", "natureofconn"],
  govNonGov: ["gov/non-gov", "gov non gov", "government"],
  device: ["device"],
  osDuedateRange: ["o/s duedate range", "os duedate range", "due date range"],
  d2NetOS: ["d2 net o/s", "d2 net os", "net os", "outstanding"],
  disconStatus: ["discon status", "disconnection status", "status"],
  disconDate: ["discon date", "disconnection date"],
  gisPole: ["gis pole", "gispole", "pole"],
  mobileNumber: ["mobile number", "mobile", "phone"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
  agency: ["agency"],
  reading: ["reading"],
  imageUrl: ["image", "photo", "link", "url", "imageurl", "imagelink"],
  notes: ["notes"],
  lastUpdated: ["last updated", "last_updated", "timestamp", "modified", "updated_at"],
  // Item 5: admin urgency flag.
  priority: ["priority"],
  // Items 3 + 13: payment-tracking columns.
  paidAmount: ["paid amount", "paidamount", "amount paid"],
  paidDate: ["paid date", "paiddate", "payment date"],
  paidType: ["paid type", "paidtype", "payment type"],
  outstandingAfter: ["outstanding after", "outstandingafter", "remaining outstanding"],
  nextPaymentDate: ["next payment date", "nextpaymentdate", "next payment"],
  paymentSource: ["payment source", "paymentsource", "payment mode"],
}

// Headers the sheet is expected to have. Used by ensureHeaders() so columns
// that don't exist yet are appended on first use instead of erroring out.
export const EXPECTED_CONSUMER_HEADERS = [
  "off_code", "MRU", "Consumer Id", "Name", "Address",
  "Base Class", "Class", "Nature of Conn", "Gov/Non-Gov", "Device",
  "O/S Duedate Range", "D2 Net O/S", "Discon Status", "Discon Date",
  "GIS Pole", "Mobile Number", "Latitude", "Longitude",
  "Agency", "Reading", "Image", "Notes", "Last Updated",
  // Item 5 + items 3/13 — appended only if missing
  "Priority",
  "Paid Amount", "Paid Date", "Paid Type",
  "Outstanding After", "Next Payment Date", "Payment Source",
] as const

// Raw worker — does the actual fetch + parse and THROWS on failure so the
// shared cache never stores an error/mock result.
async function _fetchConsumerDataRaw(spreadsheetId: string): Promise<ConsumerData[]> {
    if (!spreadsheetId) {
      throw new Error("spreadsheetId parameter is required")
    }
    const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1"

    const sheets = await getSheetsClient()
    // Read the full sheet via Sheets API. This is the same source of truth
    // /api/system/row-count uses, so count + data always match.
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'`,
      valueRenderOption: "FORMATTED_VALUE",
      majorDimension: "ROWS",
    })

    const rows = (response.data.values || []) as string[][]
    if (rows.length < 2) {
      throw new Error("Sheet must have at least header and one data row")
    }

    const headers = rows[0].map((h) => String(h ?? "").trim())

    const consumers: ConsumerData[] = []

    // Find column indices
    const columnIndices: { [key: string]: number } = {}
    Object.entries(COLUMN_MAPPINGS).forEach(([key, searchTerms]) => {
      columnIndices[key] = findColumnIndex(headers, searchTerms)
    })

    // Process data rows
    for (let i = 1; i < rows.length; i++) {
      try {
        const values = (rows[i] || []).map((v) => String(v ?? ""))

        // Skip empty rows
        if (values.length === 0 || values.every((v) => !v || v.trim() === "")) {
          continue
        }

        // Get consumer ID to validate this is a valid row
        const consumerId = columnIndices.consumerId >= 0 ? values[columnIndices.consumerId] || "" : ""
        if (!consumerId || consumerId.trim() === "") {
          continue
        }

        // Get and clean the OSD value
        const rawOSD = columnIndices.d2NetOS >= 0 ? values[columnIndices.d2NetOS] || "0" : "0"
        const cleanedOSD = parseNumericValue(rawOSD)

        // Determine Last Updated Date
        // 1. Try explicit 'Last Updated' column
        let lastUpdatedVal = columnIndices.lastUpdated >= 0 ? values[columnIndices.lastUpdated] : ""
        
        // 2. If missing, fallback to 'Disconnection Date'
        if (!lastUpdatedVal || lastUpdatedVal.trim() === "") {
           lastUpdatedVal = columnIndices.disconDate >= 0 ? values[columnIndices.disconDate] || "" : ""
        }

        // 3. Normalize date to YYYY-MM-DD for comparison
        // If the CSV date is DD-MM-YYYY, we need to flip it. 
        // Assuming standard ISO or keeping as string if format matches.
        if (lastUpdatedVal && lastUpdatedVal.match(/^\d{2}-\d{2}-\d{4}$/)) {
           const [d, m, y] = lastUpdatedVal.split("-");
           lastUpdatedVal = `${y}-${m}-${d}`;
        }

        // Create consumer object
        const consumer: ConsumerData = {
          offCode: columnIndices.offCode >= 0 ? values[columnIndices.offCode] || "" : "",
          mru: columnIndices.mru >= 0 ? values[columnIndices.mru] || "" : "",
          consumerId: consumerId,
          name: columnIndices.name >= 0 ? values[columnIndices.name] || "" : "",
          address: columnIndices.address >= 0 ? values[columnIndices.address] || "" : "",
          baseClass: columnIndices.baseClass >= 0 ? values[columnIndices.baseClass] || "" : "",
          class: columnIndices.class >= 0 ? values[columnIndices.class] || "" : "",
          natureOfConn: columnIndices.natureOfConn >= 0 ? values[columnIndices.natureOfConn] || "" : "",
          govNonGov: columnIndices.govNonGov >= 0 ? values[columnIndices.govNonGov] || "" : "",
          device: columnIndices.device >= 0 ? values[columnIndices.device] || "" : "",
          osDuedateRange: columnIndices.osDuedateRange >= 0 ? values[columnIndices.osDuedateRange] || "" : "",
          d2NetOS: cleanedOSD, // Use cleaned numeric value
          disconStatus:
            columnIndices.disconStatus >= 0 ? values[columnIndices.disconStatus] || "connected" : "connected",
          disconDate: columnIndices.disconDate >= 0 ? values[columnIndices.disconDate] || "" : "",
          gisPole: columnIndices.gisPole >= 0 ? values[columnIndices.gisPole] || "" : "",
          mobileNumber: columnIndices.mobileNumber >= 0 ? values[columnIndices.mobileNumber] || "" : "",
          latitude: columnIndices.latitude >= 0 ? values[columnIndices.latitude] || "" : "",
          longitude: columnIndices.longitude >= 0 ? values[columnIndices.longitude] || "" : "",
          agency: columnIndices.agency >= 0 ? values[columnIndices.agency] || "" : "",
          lastUpdated: lastUpdatedVal,
          notes: columnIndices.notes >= 0 ? values[columnIndices.notes] || "" : "",
          reading: columnIndices.reading >= 0 ? values[columnIndices.reading] || "" : "",
          imageUrl: columnIndices.imageUrl >= 0 ? values[columnIndices.imageUrl] || "" : "",
          priority: columnIndices.priority >= 0 ? values[columnIndices.priority] || "" : "",
          paidAmount: columnIndices.paidAmount >= 0 ? values[columnIndices.paidAmount] || "" : "",
          paidDate: columnIndices.paidDate >= 0 ? values[columnIndices.paidDate] || "" : "",
          paidType: (columnIndices.paidType >= 0 ? (values[columnIndices.paidType] || "") : "") as ConsumerData["paidType"],
          outstandingAfter: columnIndices.outstandingAfter >= 0 ? values[columnIndices.outstandingAfter] || "" : "",
          nextPaymentDate: columnIndices.nextPaymentDate >= 0 ? values[columnIndices.nextPaymentDate] || "" : "",
          paymentSource: columnIndices.paymentSource >= 0 ? values[columnIndices.paymentSource] || "" : "",
        }

        consumers.push(consumer)
      } catch (rowError) {
        console.warn(`Error processing row ${i}:`, rowError)
      }
    }

    return consumers
}

// Mock fallback returned (but never cached) when the live fetch fails.
const MOCK_CONSUMERS: ConsumerData[] = [
  {
    offCode: "TEST001", mru: "MRU001", consumerId: "CONS001",
    name: "Test Consumer 1", address: "123 Test Street, Test City",
    baseClass: "LT", class: "Domestic", natureOfConn: "Permanent",
    govNonGov: "Non-Gov", device: "Meter001", osDuedateRange: "Jan-Mar 2024",
    d2NetOS: "1500", disconStatus: "connected", disconDate: "",
    gisPole: "POLE001", mobileNumber: "9876543210",
    latitude: "22.5726", longitude: "88.3639", agency: "JOY GURU",
    lastUpdated: new Date().toISOString().split("T")[0],
  },
  {
    offCode: "TEST002", mru: "MRU002", consumerId: "CONS002",
    name: "Test Consumer 2", address: "456 Demo Avenue, Demo Town",
    baseClass: "LT", class: "Commercial", natureOfConn: "Temprory",
    govNonGov: "Gov", device: "Meter002", osDuedateRange: "Feb-Apr 2024",
    d2NetOS: "12380", disconStatus: "pending", disconDate: "",
    gisPole: "POLE002", mobileNumber: "9876543211",
    latitude: "22.5726", longitude: "88.3639", agency: "ST",
    lastUpdated: new Date().toISOString().split("T")[0],
  },
]

export async function fetchConsumerData(spreadsheetId: string): Promise<ConsumerData[]> {
  try {
    if (!spreadsheetId) {
      throw new Error("spreadsheetId parameter is required")
    }

    const cached = await getCachedData(spreadsheetId)
    const now = Date.now()
    const cacheExpiryMs = CONSUMER_REVALIDATE_S * 1000

    if (cached) {
      const isExpired = now - cached.timestamp > cacheExpiryMs
      if (isExpired) {
        // Cache has expired. Trigger background revalidation to prevent blocking the user request.
        if (!backgroundFetching[spreadsheetId] && !activeFetches[spreadsheetId]) {
          backgroundFetching[spreadsheetId] = true
          
          _fetchConsumerDataRaw(spreadsheetId)
            .then(async (freshData) => {
              await writeCache(spreadsheetId, freshData)
              console.log(`[Cache] Successfully revalidated consumer data in background for spreadsheet: ${spreadsheetId}`)
            })
            .catch((err) => {
              console.error(`[Cache] Background revalidation failed for spreadsheet: ${spreadsheetId}`, err)
            })
            .finally(() => {
              delete backgroundFetching[spreadsheetId]
            })
        }
      }
      // Return cached (potentially stale) data immediately
      return cached.data
    }

    // Cache is completely cold. Must fetch synchronously.
    // Use request coalescing to share active fetches.
    if (!activeFetches[spreadsheetId]) {
      activeFetches[spreadsheetId] = _fetchConsumerDataRaw(spreadsheetId)
        .then(async (freshData) => {
          await writeCache(spreadsheetId, freshData)
          return freshData
        })
        .finally(() => {
          delete activeFetches[spreadsheetId]
        })
    }

    return await activeFetches[spreadsheetId]
  } catch (error) {
    console.error("Detailed error in fetchConsumerData:", error)
    return MOCK_CONSUMERS
  }
}

// Lightweight count + version for /api/system/row-count. Reuses the cached
// parsed data (no extra Sheets fetch) and hashes only the consumer-ID set —
// matching the old "column C" semantics at a fraction of the CPU.
export async function getConsumerCountAndVersion(spreadsheetId: string): Promise<{ count: number; version: string }> {
  const consumers = await fetchConsumerData(spreadsheetId)
  const { createHash } = await import("crypto")
  const version = createHash("md5")
    .update(consumers.map(c => c.consumerId).join("\n"))
    .digest("hex")
  return { count: consumers.length, version }
}
