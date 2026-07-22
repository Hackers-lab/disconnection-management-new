import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { nowTs, parseTs } from "./date-utils"

const sheets = googleSheets({ version: "v4", auth })
const TAB = "Reconnection"

export const RECONNECTION_HEADERS = [
  "Request ID", "Created At", "Consumer ID", "Name", "Address",
  "Mobile", "Agency", "Device", "Source", "Status",
  "Updated At", "Updated By", "Image URL", "Request Image URL",
  "Reading", "Remarks",
]

export interface ReconnectionRequest {
  requestId: string
  createdAt: string
  consumerId: string
  name: string
  address: string
  mobile: string
  agency: string
  device: string
  source: "dc_list" | "manual"
  status: "pending" | "reconnected" | "door_locked" | "cancelled"
  updatedAt: string
  updatedBy: string
  imageUrl: string
  requestImageUrl: string
  reading: string
  remarks: string
}

// Shared cross-instance cache (Next.js Data Cache). Read paths use the cached
// wrapper; write paths use the raw fetch so row positions / next IDs are always
// computed against live data.
const RECONNECTION_TAG = "reconnection"
const RECONNECTION_REVALIDATE_S = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache
let tabReady = false

export function invalidateReconnectionCache() { revalidateTag(RECONNECTION_TAG) }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [RECONNECTION_HEADERS] },
    })
  }
  tabReady = true
}

// ─── Parse rows ───────────────────────────────────────────────────────────────
function parseRow(r: string[]): ReconnectionRequest {
  return {
    requestId:       r[0]  || "",
    createdAt:       r[1]  || "",
    consumerId:      r[2]  || "",
    name:            r[3]  || "",
    address:         r[4]  || "",
    mobile:          r[5]  || "",
    agency:          r[6]  || "",
    device:          r[7]  || "",
    source:         (r[8]  || "dc_list") as ReconnectionRequest["source"],
    status:         (r[9]  || "pending") as ReconnectionRequest["status"],
    updatedAt:       r[10] || "",
    updatedBy:       r[11] || "",
    imageUrl:        r[12] || "",
    requestImageUrl: r[13] || "",
    reading:         r[14] || "",
    remarks:         r[15] || "",
  }
}

// ─── Fetch all ────────────────────────────────────────────────────────────────
async function _fetchReconnectionDataRaw(spreadsheetId: string): Promise<ReconnectionRequest[]> {
  await ensureTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A:P` })
  const rows = (res.data.values || []).slice(1)
  return rows.filter(r => r[0]).map(r => parseRow(r.map(String)))
}

// Cached read for list/count endpoints (blocked-ids, notifications, GET).
export const fetchReconnectionData = unstable_cache(
  async (spreadsheetId: string) => _fetchReconnectionDataRaw(spreadsheetId),
  ["reconnection-data"],
  { revalidate: RECONNECTION_REVALIDATE_S, tags: [RECONNECTION_TAG] },
)

// ─── Next Request ID ──────────────────────────────────────────────────────────
async function nextRequestId(id: string): Promise<string> {
  const all = await _fetchReconnectionDataRaw(id)
  const max = all.reduce((m, r) => {
    const n = parseInt(r.requestId.replace("REC-", ""), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `REC-${String(max + 1).padStart(4, "0")}`
}

import { appendHistory, invalidateHistoryCache as invalidateConsumerHistoryCache } from "./consumer-history"

// ─── Create request ───────────────────────────────────────────────────────────
export async function createReconnectionRequest(
  req: Omit<ReconnectionRequest, "requestId" | "createdAt" | "status" | "updatedAt" | "updatedBy" | "imageUrl" | "reading">
): Promise<string> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const requestId = await nextRequestId(id)
  const now = nowTs()
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${TAB}!A:A`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        requestId, now, req.consumerId, req.name, req.address,
        req.mobile, req.agency, req.device, req.source, "pending",
        "", "", "", req.requestImageUrl || "", "", req.remarks || "",
      ]],
    },
  })
  invalidateReconnectionCache()

  // Log to DC_History (fire-and-forget)
  appendHistory([{
    timestamp: now,
    consumerId: req.consumerId,
    name: req.name || "",
    action: "reconnection_issued",
    oldStatus: "disconnected",
    newStatus: "reconnection_pending",
    oldOsd: "",
    oldNotes: req.remarks ? `Request Remarks: ${req.remarks}` : "",
    oldImageUrl: req.requestImageUrl || "",
    changedBy: req.agency || "system",
    eventDate: now.split(" ")[0],
  }], id).then(() => invalidateConsumerHistoryCache(id)).catch(e => console.warn("Reconnection create history append failed:", e))

  return requestId
}

// ─── Update status ────────────────────────────────────────────────────────────
export async function updateReconnectionStatus(update: {
  requestId: string
  status: "reconnected" | "door_locked" | "cancelled"
  updatedBy: string
  imageUrl?: string
  reading?: string
  remarks?: string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchReconnectionDataRaw(id)
  const idx = all.findIndex(r => r.requestId === update.requestId)
  if (idx === -1) throw new Error("Request not found")
  const req = all[idx]
  const sheetRow = idx + 2 // 1-based + header
  const now = nowTs()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${TAB}!J${sheetRow}`, values: [[update.status]] },
        { range: `${TAB}!K${sheetRow}`, values: [[now]] },
        { range: `${TAB}!L${sheetRow}`, values: [[update.updatedBy]] },
        { range: `${TAB}!M${sheetRow}`, values: [[update.imageUrl || ""]] },
        { range: `${TAB}!O${sheetRow}`, values: [[update.reading || ""]] },
        { range: `${TAB}!P${sheetRow}`, values: [[update.remarks || ""]] },
      ],
    },
  })
  invalidateReconnectionCache()

  // Log to DC_History (fire-and-forget)
  const notesParts = []
  if (update.reading) notesParts.push(`Reading: ${update.reading}`)
  if (update.remarks) notesParts.push(`Remarks: ${update.remarks}`)

  appendHistory([{
    timestamp: now,
    consumerId: req.consumerId,
    name: req.name || "",
    action: update.status,
    oldStatus: "reconnection_pending",
    newStatus: update.status,
    oldOsd: "",
    oldNotes: notesParts.join(" | "),
    oldImageUrl: update.imageUrl || req.requestImageUrl || "",
    changedBy: update.updatedBy || req.agency || "system",
    eventDate: now.split(" ")[0],
  }], id).then(() => invalidateConsumerHistoryCache(id)).catch(e => console.warn("Reconnection update history append failed:", e))
}

// ─── Blocked consumer IDs (pending > 30 hours, or door locked > 144 hours) ────
// Pass `agencies` to scope results to a specific agency (or set of agencies).
// When omitted, ALL overdue consumer IDs across every agency are returned
// (used by admin/executive warning banners).
export async function getBlockedConsumerIds(agencies?: string[]): Promise<string[]> {
  const id = getSpreadsheetId()
  const all = await fetchReconnectionData(id)
  const agenciesUpper = agencies?.map(a => a.trim().toUpperCase())
  const now = Date.now()
  return all
    .filter(r => {
      if (agenciesUpper !== undefined && !agenciesUpper.includes(r.agency.trim().toUpperCase())) {
        return false
      }
      if (r.status === "pending") {
        const hrs = (now - parseTs(r.createdAt)) / 3_600_000
        return hrs > 30
      }
      if (r.status === "door_locked") {
        const hrs = (now - parseTs(r.updatedAt || r.createdAt)) / 3_600_000
        return hrs > 144 // Moved to pending after 72h, overdue after another 72h (total 144h)
      }
      return false
    })
    .map(r => r.consumerId)
}


