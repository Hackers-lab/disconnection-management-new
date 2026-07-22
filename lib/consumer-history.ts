import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "./google-drive"
import { fetchConsumerData } from "./google-sheets"
import { fetchReconnectionData } from "./reconnection-service"

const sheets = googleSheets({ version: "v4", auth })

export const HISTORY_TAB = "DC_History"

// Schema: Timestamp | ConsumerId | Name | Action | OldStatus | NewStatus | OldOSD | OldNotes | OldImageUrl | ChangedBy | Amount | EventDate
export const HISTORY_HEADERS = [
  "Timestamp", "Consumer Id", "Name", "Action",
  "Old Status", "New Status", "Old OSD", "Old Notes", "Old Image URL", "Changed By",
  "Amount", "Event Date",
]

export interface HistoryEntry {
  timestamp: string
  consumerId: string
  name: string
  action: string        // "in_new_list" | "removed_from_upload" | "status_changed" | "paid" | "reconnection_issued" | "reconnected" | ...
  oldStatus: string
  newStatus: string
  oldOsd: string
  oldNotes: string
  oldImageUrl: string
  changedBy: string
  amount?: string       // payment amount (for "paid" events)
  eventDate?: string    // date the event occurred (e.g. paid date, disconnect date)
}

// Warm-function in-memory cache per spreadsheet.
const HISTORY_MEMO_TTL_MS = 60_000
let historyMemo: Record<string, { at: number; data: HistoryEntry[] }> = {}

export function invalidateHistoryCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    delete historyMemo[spreadsheetId]
  } else {
    historyMemo = {}
  }
}

export function parseTimestampToMs(ts: string): number {
  if (!ts) return 0
  const clean = ts.trim()
  if (clean.includes("-") && clean.split("-")[0].length === 4) {
    const isoTime = Date.parse(clean)
    if (!isNaN(isoTime)) return isoTime
  }
  const parts = clean.split(" ")
  const datePart = parts[0]
  const timePart = parts[1] || "00:00"
  const sep = datePart.includes("-") ? "-" : datePart.includes("/") ? "/" : null
  if (sep) {
    const dParts = datePart.split(sep).map(Number)
    const tParts = timePart.split(":").map(Number)
    if (dParts.length === 3) {
      let day = dParts[0], month = dParts[1] - 1, year = dParts[2]
      if (dParts[0] > 1000) {
        year = dParts[0]; month = dParts[1] - 1; day = dParts[2]
      }
      const h = tParts[0] || 0, min = tParts[1] || 0
      return new Date(year, month, day, h, min).getTime()
    }
  }
  const fallback = Date.parse(clean)
  return isNaN(fallback) ? 0 : fallback
}

async function ensureHistoryTab(spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === HISTORY_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: HISTORY_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${HISTORY_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HISTORY_HEADERS] },
    })
    return
  }
  // Migration: if an existing tab still has the old 10-column header,
  // rewrite row 1 to include the new Amount / Event Date columns.
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `${HISTORY_TAB}!A1:L1`,
  })
  const currentHeader = headerResp.data.values?.[0] || []
  if (currentHeader.length < HISTORY_HEADERS.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${HISTORY_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HISTORY_HEADERS] },
    })
  }
}

async function fetchAllHistory(spreadsheetId: string): Promise<HistoryEntry[]> {
  await ensureHistoryTab(spreadsheetId)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${HISTORY_TAB}!A:L`,
  })
  const rows = (resp.data.values || []).slice(1) // skip header
  return rows.map(r => ({
    timestamp:   String(r[0] || ""),
    consumerId:  String(r[1] || ""),
    name:        String(r[2] || ""),
    action:      String(r[3] || ""),
    oldStatus:   String(r[4] || ""),
    newStatus:   String(r[5] || ""),
    oldOsd:      String(r[6] || ""),
    oldNotes:    String(r[7] || ""),
    oldImageUrl: String(r[8] || ""),
    changedBy:   String(r[9] || ""),
    amount:      String(r[10] || ""),
    eventDate:   String(r[11] || ""),
  }))
}

// Public read — synthesizes DC_History, Consumer Sheet disconnection state, and Reconnection requests.
export async function getHistoryForConsumer(consumerId: string, spreadsheetId: string): Promise<HistoryEntry[]> {
  const now = Date.now()
  const memo = historyMemo[spreadsheetId]
  let rawDcHistory: HistoryEntry[] = []

  if (memo && now - memo.at <= HISTORY_MEMO_TTL_MS) {
    rawDcHistory = memo.data.filter(h => h.consumerId === consumerId)
  } else {
    const all = await fetchAllHistory(spreadsheetId)
    historyMemo[spreadsheetId] = { at: now, data: all }
    rawDcHistory = all.filter(h => h.consumerId === consumerId)
  }

  const combinedEntries: HistoryEntry[] = [...rawDcHistory]

  // 1. Check Consumer Sheet for initial/current Disconnection record
  try {
    const allConsumers = await fetchConsumerData(spreadsheetId)
    const consumer = allConsumers.find(c => c.consumerId === consumerId)
    if (consumer) {
      const isDisconnected = consumer.disconStatus?.toLowerCase().includes("disconnect") || Boolean(consumer.disconDate)
      const hasDisconHistory = combinedEntries.some(h => 
        h.action === "disconnected" || 
        h.newStatus.toLowerCase().includes("disconnect") ||
        (h.action === "status_changed" && h.newStatus.toLowerCase().includes("disconnect"))
      )

      if (isDisconnected && !hasDisconHistory) {
        const disconDateStr = consumer.disconDate || consumer.lastUpdated || ""
        const disconTimestamp = disconDateStr
          ? (disconDateStr.includes(":") ? disconDateStr : `${disconDateStr} 00:00`)
          : nowTimestamp()

        combinedEntries.push({
          timestamp: disconTimestamp,
          consumerId: consumer.consumerId,
          name: consumer.name || "",
          action: "disconnected",
          oldStatus: "connected",
          newStatus: consumer.disconStatus || "disconnected",
          oldOsd: consumer.d2NetOS || "",
          oldNotes: consumer.notes || "",
          oldImageUrl: consumer.imageUrl || "",
          changedBy: consumer.agency || "field",
          eventDate: disconDateStr,
        })
      }
    }
  } catch (e) {
    console.warn("Failed to fetch consumer data for history synthesis:", e)
  }

  // 2. Check Reconnection Requests sheet tab
  try {
    const allReconnections = await fetchReconnectionData(spreadsheetId)
    const consumerReconnections = allReconnections.filter(r => r.consumerId === consumerId)

    for (const rec of consumerReconnections) {
      // Reconnection Issued event
      if (rec.createdAt) {
        combinedEntries.push({
          timestamp: rec.createdAt,
          consumerId: rec.consumerId,
          name: rec.name || "",
          action: "reconnection_issued",
          oldStatus: "disconnected",
          newStatus: "reconnection_pending",
          oldOsd: "",
          oldNotes: rec.remarks ? `Request Remarks: ${rec.remarks}` : "",
          oldImageUrl: rec.requestImageUrl || "",
          changedBy: rec.agency || "system",
          eventDate: rec.createdAt.split(" ")[0],
        })
      }

      // Reconnection Status update event (if completed, door locked, or cancelled)
      if (rec.status && rec.status !== "pending") {
        const notesParts = []
        if (rec.reading) notesParts.push(`Reading: ${rec.reading}`)
        if (rec.remarks) notesParts.push(`Remarks: ${rec.remarks}`)

        combinedEntries.push({
          timestamp: rec.updatedAt || rec.createdAt || nowTimestamp(),
          consumerId: rec.consumerId,
          name: rec.name || "",
          action: rec.status, // "reconnected" | "door_locked" | "cancelled"
          oldStatus: "reconnection_pending",
          newStatus: rec.status,
          oldOsd: "",
          oldNotes: notesParts.join(" | "),
          oldImageUrl: rec.imageUrl || rec.requestImageUrl || "",
          changedBy: rec.updatedBy || rec.agency || "system",
          eventDate: (rec.updatedAt || rec.createdAt || "").split(" ")[0],
        })
      }
    }
  } catch (e) {
    console.warn("Failed to fetch reconnection data for history synthesis:", e)
  }

  // Deduplicate and sort chronologically (newest first)
  const seen = new Set<string>()
  const deduplicated = combinedEntries.filter(e => {
    const key = `${e.consumerId}_${e.action}_${e.newStatus}_${(e.timestamp || "").slice(0, 10)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return deduplicated.sort((a, b) => parseTimestampToMs(b.timestamp) - parseTimestampToMs(a.timestamp))
}

// Public read — retrieves full history memoized
export async function getFullHistory(spreadsheetId: string): Promise<HistoryEntry[]> {
  const now = Date.now()
  const memo = historyMemo[spreadsheetId]
  if (!memo || now - memo.at > HISTORY_MEMO_TTL_MS) {
    const all = await fetchAllHistory(spreadsheetId)
    historyMemo[spreadsheetId] = { at: now, data: all }
  }
  return historyMemo[spreadsheetId].data.sort((a, b) => parseTimestampToMs(b.timestamp) - parseTimestampToMs(a.timestamp))
}

// Append history rows. Called from update route and bulk-upsert.
// Batches multiple entries into a single append call.
export async function appendHistory(entries: HistoryEntry[], spreadsheetId: string): Promise<void> {
  if (!entries.length) return
  await ensureHistoryTab(spreadsheetId)
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${HISTORY_TAB}!A:L`,
    valueInputOption: "RAW",
    requestBody: {
      values: entries.map(e => [
        e.timestamp, e.consumerId, e.name, e.action,
        e.oldStatus, e.newStatus, e.oldOsd, e.oldNotes, e.oldImageUrl, e.changedBy,
        e.amount ?? "", e.eventDate ?? "",
      ]),
    },
  })
  // Invalidate memo so the new entry shows on next read
  delete historyMemo[spreadsheetId]
}

export function nowTimestamp(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

