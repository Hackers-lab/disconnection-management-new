import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { nowDate, nowTs } from "./date-utils"
import { PermanentDisconnection, PDMeterCondition, PDMeterReturnStatus, PermanentDisconnectionStatus } from "./permanent-disconnection-types"
import { appendDeltaPatch } from "./version-engine"
import { getTenantContext } from "./tenant-context"

const sheets = googleSheets({ version: "v4", auth: auth as any })

export const PD_TAB = "Permanent_Disconnection"

export const PD_HEADERS = [
  "PD ID",                   // A (0)
  "Consumer ID",             // B (1)
  "Consumer Name",           // C (2)
  "Address",                 // D (3)
  "Meter Number",            // E (4) - NEW COLUMN
  "Mobile",                  // F (5)
  "Live OSD Amount",         // G (6)
  "Status",                  // H (7)
  "Agency",                  // I (8)
  "Proposed Date",           // J (9)
  "Proposed By",             // K (10)
  "Issued Date",             // L (11)
  "Issued By",               // M (12)
  "Final Reading",           // N (13)
  "Removed Meter No",        // O (14)
  "Meter Condition",         // P (15)
  "Disconnection Date Time", // Q (16)
  "Latitude",                // R (17)
  "Longitude",               // S (18)
  "Evidence Photos",         // T (19)
  "Agency Remarks",          // U (20)
  "Meter Return Status",     // V (21)
  "Meter Return Date",       // W (22)
  "Meter Return Condition",  // X (23)
  "Meter Return Remarks",    // Y (24)
  "Note Sheet No",           // Z (25)
  "Note Sheet Date",         // AA (26)
  "Closed Remarks",          // AB (27)
]

const PD_TAG = "permanent-disconnection"
const REVAL_S = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache
let tabReady = false

export function invalidatePDCache() {
  try {
    revalidateTag(PD_TAG)
  } catch {
    // Next cache revalidate fallback
  }
}

export function indexToColLetter(index: number): string {
  let letter = ""
  let temp = index
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter
    temp = Math.floor(temp / 26) - 1
  }
  return letter
}

export function getPDHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  headers.forEach((h, i) => {
    const norm = String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    if (norm) map[norm] = i
  })
  return {
    pdId:                  map["pdid"] ?? 0,
    consumerId:            map["consumerid"] ?? 1,
    consumerName:          map["consumername"] ?? 2,
    address:               map["address"] ?? 3,
    meterNumber:           map["meternumber"] ?? map["meterno"] ?? (headers[4]?.toLowerCase().includes("meter") ? 4 : -1),
    mobile:                map["mobile"] ?? map["mobilenumber"] ?? (map["meternumber"] === -1 ? 4 : 5),
    liveOsdAmount:         map["liveosdamount"] ?? map["osdamount"] ?? map["liveosd"] ?? (map["meternumber"] === -1 ? 5 : 6),
    status:                map["status"] ?? (map["meternumber"] === -1 ? 6 : 7),
    agency:                map["agency"] ?? (map["meternumber"] === -1 ? 7 : 8),
    proposedDate:          map["proposeddate"] ?? (map["meternumber"] === -1 ? 8 : 9),
    proposedBy:            map["proposedby"] ?? (map["meternumber"] === -1 ? 9 : 10),
    issuedDate:            map["issueddate"] ?? (map["meternumber"] === -1 ? 10 : 11),
    issuedBy:              map["issuedby"] ?? (map["meternumber"] === -1 ? 11 : 12),
    finalReading:          map["finalreading"] ?? (map["meternumber"] === -1 ? 12 : 13),
    removedMeterNo:        map["removedmeterno"] ?? (map["meternumber"] === -1 ? 13 : 14),
    meterCondition:        map["metercondition"] ?? (map["meternumber"] === -1 ? 14 : 15),
    disconnectionDateTime: map["disconnectiondatetime"] ?? map["disconnectiondate"] ?? (map["meternumber"] === -1 ? 15 : 16),
    latitude:              map["latitude"] ?? (map["meternumber"] === -1 ? 16 : 17),
    longitude:             map["longitude"] ?? (map["meternumber"] === -1 ? 17 : 18),
    evidencePhotos:        map["evidencephotos"] ?? (map["meternumber"] === -1 ? 18 : 19),
    agencyRemarks:         map["agencyremarks"] ?? (map["meternumber"] === -1 ? 19 : 20),
    meterReturnStatus:     map["meterreturnstatus"] ?? (map["meternumber"] === -1 ? 20 : 21),
    meterReturnDate:       map["meterreturndate"] ?? (map["meternumber"] === -1 ? 21 : 22),
    meterReturnCondition:  map["meterreturncondition"] ?? (map["meternumber"] === -1 ? 22 : 23),
    meterReturnRemarks:    map["meterreturnremarks"] ?? (map["meternumber"] === -1 ? 23 : 24),
    noteSheetNo:           map["notesheetno"] ?? (map["meternumber"] === -1 ? 24 : 25),
    noteSheetDate:         map["notesheetdate"] ?? (map["meternumber"] === -1 ? 25 : 26),
    closedRemarks:         map["closedremarks"] ?? (map["meternumber"] === -1 ? 26 : 27),
  }
}

export async function ensurePDTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  if (!existing.includes(PD_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{ addSheet: { properties: { title: PD_TAB } } }]
      }
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${PD_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [PD_HEADERS] }
    })
  } else {
    // Read existing tab data to inspect schema and auto-migrate if needed
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${PD_TAB}!A:ZZ`
    })
    const rows = res.data.values || []
    const currentHeaders = (rows[0] || []).map(String)
    
    // Check if sheet has old 27-col layout where Col 4 (E) is "Mobile"
    const hasOldMobileAtCol4 = (currentHeaders[4] || "").trim().toLowerCase() === "mobile"
    if (hasOldMobileAtCol4) {
      console.log("Migrating Permanent_Disconnection tab to 28-column layout (inserting Meter Number at Col E)...")
      const migratedRows: string[][] = []
      migratedRows.push(PD_HEADERS)
      
      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx] || []
        if (!row[0]) continue
        // Insert empty meter number at index 4
        const newRow = [
          row[0] || "",
          row[1] || "",
          row[2] || "",
          row[3] || "",
          "", // Meter Number
          ...row.slice(4)
        ]
        migratedRows.push(newRow.map(String))
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${PD_TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: migratedRows }
      })
    } else if (currentHeaders.length < PD_HEADERS.length || (currentHeaders[4] || "").trim().toLowerCase() !== "meter number") {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${PD_TAB}!A1:AB1`,
        valueInputOption: "RAW",
        requestBody: { values: [PD_HEADERS] }
      })
    }
  }
  tabReady = true
}

function parsePDRowWithMap(r: string[], map: Record<string, number>): PermanentDisconnection {
  const get = (key: string, def = ""): string => {
    const idx = map[key]
    if (idx === undefined || idx < 0 || idx >= r.length) return def
    return (r[idx] ?? "").trim()
  }

  const rawStatus = get("status", "proposed").toLowerCase()
  const validStatus: PermanentDisconnectionStatus =
    rawStatus === "closed" ? "closed" :
    rawStatus === "disconnected" ? "disconnected" :
    rawStatus === "issued" ? "issued" : "proposed"

  return {
    pdId:                  get("pdId"),
    consumerId:            get("consumerId"),
    consumerName:          get("consumerName"),
    address:               get("address"),
    meterNumber:           get("meterNumber"),
    mobile:                get("mobile"),
    liveOsdAmount:         parseFloat(get("liveOsdAmount", "0")) || 0,
    status:                validStatus,
    agency:                get("agency"),
    proposedDate:          get("proposedDate"),
    proposedBy:            get("proposedBy"),
    issuedDate:            get("issuedDate"),
    issuedBy:              get("issuedBy"),
    finalReading:          get("finalReading"),
    removedMeterNo:        get("removedMeterNo"),
    meterCondition:        (get("meterCondition") || undefined) as PDMeterCondition | undefined,
    disconnectionDateTime: get("disconnectionDateTime"),
    latitude:              get("latitude"),
    longitude:             get("longitude"),
    evidencePhotos:        get("evidencePhotos"),
    agencyRemarks:         get("agencyRemarks"),
    meterReturnStatus:     (get("meterReturnStatus", "pending") as PDMeterReturnStatus),
    meterReturnDate:       get("meterReturnDate"),
    meterReturnCondition:  (get("meterReturnCondition") || undefined) as PDMeterCondition | undefined,
    meterReturnRemarks:    get("meterReturnRemarks"),
    noteSheetNo:           get("noteSheetNo"),
    noteSheetDate:         get("noteSheetDate"),
    closedRemarks:         get("closedRemarks"),
  }
}

export async function _fetchPDRaw(spreadsheetId: string): Promise<PermanentDisconnection[]> {
  await ensurePDTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PD_TAB}!A:ZZ`
  })
  const allRows = res.data.values || []
  if (allRows.length <= 1) return []

  const headerRow = (allRows[0] || []).map(String)
  const colMap = getPDHeaderMap(headerRow)

  return allRows
    .slice(1)
    .filter(r => r && r[0])
    .map(r => parsePDRowWithMap(r.map(String), colMap))
}

const _fetchPDCached = unstable_cache(
  async (spreadsheetId: string) => _fetchPDRaw(spreadsheetId),
  ["permanent-disconnections"],
  { revalidate: REVAL_S, tags: [PD_TAG] }
)

export async function fetchPermanentDisconnections(spreadsheetId?: string): Promise<PermanentDisconnection[]> {
  const id = typeof spreadsheetId === "string" && spreadsheetId.length > 5 ? spreadsheetId : getSpreadsheetId()
  return _fetchPDCached(id)
}

export async function nextPDId(id: string): Promise<string> {
  const all = await _fetchPDRaw(id)
  const year = new Date().getFullYear()
  const prefix = `PD-${year}-`
  let max = 0
  for (const item of all) {
    if (item.pdId && item.pdId.startsWith(prefix)) {
      const num = parseInt(item.pdId.replace(prefix, ""), 10)
      if (!isNaN(num) && num > max) max = num
    } else if (item.pdId && item.pdId.startsWith("PD-")) {
      const parts = item.pdId.split("-")
      const last = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(last) && last > max) max = last
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`
}

export async function proposePD(req: {
  consumerId: string
  consumerName: string
  address: string
  meterNumber?: string
  mobile?: string
  liveOsdAmount?: number
  agency?: string
  proposedBy?: string
}): Promise<{ pdId: string; record: PermanentDisconnection }> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)

  const cleanCid = String(req.consumerId).trim()

  // Single fetch of all raw rows for duplicate validation and next ID computation
  const all = await _fetchPDRaw(id)

  // 1. Strict Duplicate Check: Prevent duplicate active consumer proposals
  const existingActive = all.find(r => r.consumerId === cleanCid && r.status !== "closed")
  if (existingActive) {
    throw new Error(
      `Consumer ID ${cleanCid} already exists under active PD record ${existingActive.pdId} (Stage: ${existingActive.status}). A consumer cannot be proposed multiple times.`
    )
  }

  // 2. Compute Next PD ID in memory
  const year = new Date().getFullYear()
  const prefix = `PD-${year}-`
  let max = 0
  for (const item of all) {
    if (item.pdId && item.pdId.startsWith(prefix)) {
      const num = parseInt(item.pdId.replace(prefix, ""), 10)
      if (!isNaN(num) && num > max) max = num
    } else if (item.pdId && item.pdId.startsWith("PD-")) {
      const parts = item.pdId.split("-")
      const last = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(last) && last > max) max = last
    }
  }
  const pdId = `${prefix}${String(max + 1).padStart(4, "0")}`
  const today = nowDate()
  const initialStatus: PermanentDisconnectionStatus = "proposed"
  const issuedDate = ""
  const issuedBy = ""

  const row = [
    pdId,
    cleanCid,
    req.consumerName.trim(),
    req.address.trim(),
    (req.meterNumber || "").trim(),
    req.mobile || "",
    req.liveOsdAmount || 0,
    initialStatus,
    req.agency || "",
    today,
    req.proposedBy || "",
    issuedDate,
    issuedBy,
    "", // finalReading
    "", // removedMeterNo
    "", // meterCondition
    "", // disconnectionDateTime
    "", // latitude
    "", // longitude
    "", // evidencePhotos
    "", // agencyRemarks
    "pending", // meterReturnStatus
    "", // meterReturnDate
    "", // meterReturnCondition
    "", // meterReturnRemarks
    "", // noteSheetNo
    "", // noteSheetDate
    "", // closedRemarks
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${PD_TAB}!A:AB`,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  })
  invalidatePDCache()

  const record: PermanentDisconnection = {
    pdId,
    consumerId: cleanCid,
    consumerName: req.consumerName.trim(),
    address: req.address.trim(),
    meterNumber: (req.meterNumber || "").trim(),
    mobile: req.mobile || "",
    liveOsdAmount: req.liveOsdAmount || 0,
    status: initialStatus,
    agency: req.agency || "",
    proposedDate: today,
    proposedBy: req.proposedBy || "",
    issuedDate,
    issuedBy,
    finalReading: "",
    removedMeterNo: "",
    meterCondition: undefined,
    disconnectionDateTime: "",
    latitude: "",
    longitude: "",
    evidencePhotos: "",
    agencyRemarks: "",
    meterReturnStatus: "pending",
    meterReturnDate: "",
    meterReturnCondition: undefined,
    meterReturnRemarks: "",
    noteSheetNo: "",
    noteSheetDate: "",
    closedRemarks: "",
  }

  const tenant = getTenantContext()?.cccCode || "default"
  appendDeltaPatch(tenant, "permanent-disconnection", {
    action: "UPDATE",
    recordId: pdId,
    changes: { status: initialStatus, consumerId: cleanCid, consumerName: req.consumerName.trim(), agency: req.agency || "" }
  }).catch(() => {})

  return { pdId, record }
}

export async function issuePDs(
  pdIds: string[],
  agency: string,
  issuedBy?: string
): Promise<void> {
  if (!pdIds.length) return
  const id = getSpreadsheetId()
  await ensurePDTab(id)
  
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${PD_TAB}!A:ZZ` })
  const allRows = res.data.values || []
  if (allRows.length <= 1) return
  const colMap = getPDHeaderMap((allRows[0] || []).map(String))
  const today = nowDate()

  const dataUpdates: Array<{ range: string; values: any[][] }> = []

  for (const pdId of pdIds) {
    const idx = allRows.slice(1).findIndex(r => (r[colMap.pdId] || "").trim() === pdId)
    if (idx !== -1) {
      const rowNum = idx + 2
      dataUpdates.push(
        { range: `${PD_TAB}!${indexToColLetter(colMap.status)}${rowNum}`, values: [["issued"]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.agency)}${rowNum}`, values: [[agency]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.issuedDate)}${rowNum}`, values: [[today]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.issuedBy)}${rowNum}`, values: [[issuedBy || ""]] }
      )
    }
  }

  if (dataUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: dataUpdates
      }
    })
    invalidatePDCache()

    const tenant = getTenantContext()?.cccCode || "default"
    pdIds.forEach(pid => {
      appendDeltaPatch(tenant, "permanent-disconnection", {
        action: "UPDATE",
        recordId: pid,
        changes: { status: "issued", agency, issuedDate: today }
      }).catch(() => {})
    })
  }
}

export async function reassignPDAgency(
  pdId: string,
  agency: string
): Promise<void> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)
  
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${PD_TAB}!A:ZZ` })
  const allRows = res.data.values || []
  if (allRows.length <= 1) throw new Error("PD record not found")
  const colMap = getPDHeaderMap((allRows[0] || []).map(String))

  const idx = allRows.slice(1).findIndex(r => (r[colMap.pdId] || "").trim() === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${PD_TAB}!${indexToColLetter(colMap.agency)}${rowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [[agency]] }
  })
  invalidatePDCache()

  const tenant = getTenantContext()?.cccCode || "default"
  appendDeltaPatch(tenant, "permanent-disconnection", {
    action: "UPDATE",
    recordId: pdId,
    changes: { agency }
  }).catch(() => {})
}

export async function executePDDisconnection(
  pdId: string,
  data: {
    finalReading: string
    removedMeterNo: string
    meterCondition: PDMeterCondition
    evidencePhotos?: string
    latitude?: string
    longitude?: string
    disconnectionDateTime?: string
    agencyRemarks?: string
  }
): Promise<void> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${PD_TAB}!A:ZZ` })
  const allRows = res.data.values || []
  if (allRows.length <= 1) throw new Error("PD record not found")
  const colMap = getPDHeaderMap((allRows[0] || []).map(String))

  const idx = allRows.slice(1).findIndex(r => (r[colMap.pdId] || "").trim() === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2
  const dt = data.disconnectionDateTime || nowTs()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!${indexToColLetter(colMap.status)}${rowNum}`, values: [["disconnected"]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.finalReading)}${rowNum}`, values: [[data.finalReading || ""]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.removedMeterNo)}${rowNum}`, values: [[data.removedMeterNo || ""]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.meterCondition)}${rowNum}`, values: [[data.meterCondition || "working"]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.disconnectionDateTime)}${rowNum}`, values: [[dt]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.latitude)}${rowNum}`, values: [[data.latitude || ""]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.longitude)}${rowNum}`, values: [[data.longitude || ""]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.evidencePhotos)}${rowNum}`, values: [[data.evidencePhotos || ""]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.agencyRemarks)}${rowNum}`, values: [[data.agencyRemarks || ""]] },
      ]
    }
  })
  invalidatePDCache()

  const tenant = getTenantContext()?.cccCode || "default"
  appendDeltaPatch(tenant, "permanent-disconnection", {
    action: "UPDATE",
    recordId: pdId,
    changes: {
      status: "disconnected",
      finalReading: data.finalReading,
      removedMeterNo: data.removedMeterNo,
      disconnectionDateTime: dt
    }
  }).catch(() => {})
}

export async function returnPDMeterToStore(
  pdId: string,
  data: {
    returnDate?: string
    condition?: PDMeterCondition
    remarks?: string
  }
): Promise<void> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${PD_TAB}!A:ZZ` })
  const allRows = res.data.values || []
  if (allRows.length <= 1) throw new Error("PD record not found")
  const colMap = getPDHeaderMap((allRows[0] || []).map(String))

  const idx = allRows.slice(1).findIndex(r => (r[colMap.pdId] || "").trim() === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2
  const retDate = data.returnDate || nowDate()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!${indexToColLetter(colMap.meterReturnStatus)}${rowNum}`, values: [["returned"]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.meterReturnDate)}${rowNum}`, values: [[retDate]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.meterReturnCondition)}${rowNum}`, values: [[data.condition || "working"]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.meterReturnRemarks)}${rowNum}`, values: [[data.remarks || ""]] },
      ]
    }
  })
  invalidatePDCache()

  const tenant = getTenantContext()?.cccCode || "default"
  appendDeltaPatch(tenant, "permanent-disconnection", {
    action: "UPDATE",
    recordId: pdId,
    changes: {
      meterReturnStatus: "returned",
      meterReturnDate: retDate,
      meterReturnCondition: data.condition
    }
  }).catch(() => {})
}

export async function updatePDNoteSheet(
  pdId: string,
  data: {
    noteSheetNo: string
    noteSheetDate?: string
  }
): Promise<void> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${PD_TAB}!A:ZZ` })
  const allRows = res.data.values || []
  if (allRows.length <= 1) throw new Error("PD record not found")
  const colMap = getPDHeaderMap((allRows[0] || []).map(String))

  const idx = allRows.slice(1).findIndex(r => (r[colMap.pdId] || "").trim() === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2
  const nsDate = data.noteSheetDate || nowDate()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!${indexToColLetter(colMap.noteSheetNo)}${rowNum}`, values: [[data.noteSheetNo]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.noteSheetDate)}${rowNum}`, values: [[nsDate]] },
      ]
    }
  })
  invalidatePDCache()

  const tenant = getTenantContext()?.cccCode || "default"
  appendDeltaPatch(tenant, "permanent-disconnection", {
    action: "UPDATE",
    recordId: pdId,
    changes: {
      noteSheetNo: data.noteSheetNo,
      noteSheetDate: nsDate
    }
  }).catch(() => {})
}

export async function closePD(
  pdId: string,
  remarks: string
): Promise<void> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${PD_TAB}!A:ZZ` })
  const allRows = res.data.values || []
  if (allRows.length <= 1) throw new Error("PD record not found")
  const colMap = getPDHeaderMap((allRows[0] || []).map(String))

  const idx = allRows.slice(1).findIndex(r => (r[colMap.pdId] || "").trim() === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!${indexToColLetter(colMap.status)}${rowNum}`, values: [["closed"]] },
        { range: `${PD_TAB}!${indexToColLetter(colMap.closedRemarks)}${rowNum}`, values: [[remarks || "Closed by Admin"]] },
      ]
    }
  })
  invalidatePDCache()

  const tenant = getTenantContext()?.cccCode || "default"
  appendDeltaPatch(tenant, "permanent-disconnection", {
    action: "UPDATE",
    recordId: pdId,
    changes: {
      status: "closed",
      closedRemarks: remarks
    }
  }).catch(() => {})
}
