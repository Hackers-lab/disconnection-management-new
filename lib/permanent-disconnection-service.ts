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
  "PD ID",                   // A
  "Consumer ID",             // B
  "Consumer Name",           // C
  "Address",                 // D
  "Mobile",                  // E
  "Live OSD Amount",         // F
  "Status",                  // G
  "Agency",                  // H
  "Proposed Date",           // I
  "Proposed By",             // J
  "Issued Date",             // K
  "Issued By",               // L
  "Final Reading",           // M
  "Removed Meter No",        // N
  "Meter Condition",         // O
  "Disconnection Date Time", // P
  "Latitude",                // Q
  "Longitude",               // R
  "Evidence Photos",         // S
  "Agency Remarks",          // T
  "Meter Return Status",     // U
  "Meter Return Date",       // V
  "Meter Return Condition",  // W
  "Meter Return Remarks",    // X
  "Note Sheet No",           // Y
  "Note Sheet Date",         // Z
  "Closed Remarks",          // AA
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
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${PD_TAB}!A1:AA1`
    })
    const currentHeaders = res.data.values?.[0] || []
    if (currentHeaders.length < PD_HEADERS.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${PD_TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [PD_HEADERS] }
      })
    }
  }
  tabReady = true
}

function parsePDRow(r: string[]): PermanentDisconnection {
  return {
    pdId:                  r[0] || "",
    consumerId:            r[1] || "",
    consumerName:          r[2] || "",
    address:               r[3] || "",
    mobile:                r[4] || "",
    liveOsdAmount:         parseFloat(r[5] || "0") || 0,
    status:                ((r[6] || "proposed").toLowerCase()) as PermanentDisconnectionStatus,
    agency:                r[7] || "",
    proposedDate:          r[8] || "",
    proposedBy:            r[9] || "",
    issuedDate:            r[10] || "",
    issuedBy:              r[11] || "",
    finalReading:          r[12] || "",
    removedMeterNo:        r[13] || "",
    meterCondition:        (r[14] || undefined) as PDMeterCondition | undefined,
    disconnectionDateTime: r[15] || "",
    latitude:              r[16] || "",
    longitude:             r[17] || "",
    evidencePhotos:        r[18] || "",
    agencyRemarks:         r[19] || "",
    meterReturnStatus:     (r[20] || "pending") as PDMeterReturnStatus,
    meterReturnDate:       r[21] || "",
    meterReturnCondition:  (r[22] || undefined) as PDMeterCondition | undefined,
    meterReturnRemarks:    r[23] || "",
    noteSheetNo:           r[24] || "",
    noteSheetDate:         r[25] || "",
    closedRemarks:         r[26] || "",
  }
}

export async function _fetchPDRaw(spreadsheetId: string): Promise<PermanentDisconnection[]> {
  await ensurePDTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PD_TAB}!A:AA`
  })
  return (res.data.values || [])
    .slice(1)
    .filter(r => r[0])
    .map(r => parsePDRow(r.map(String)))
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
  mobile?: string
  liveOsdAmount?: number
  agency?: string
  proposedBy?: string
}): Promise<{ pdId: string; record: PermanentDisconnection }> {
  const id = getSpreadsheetId()
  await ensurePDTab(id)
  const pdId = await nextPDId(id)
  const today = nowDate()
  const initialStatus: PermanentDisconnectionStatus = req.agency && req.agency.trim() ? "issued" : "proposed"
  const issuedDate = initialStatus === "issued" ? today : ""
  const issuedBy = initialStatus === "issued" ? (req.proposedBy || "") : ""

  const row = [
    pdId,
    req.consumerId,
    req.consumerName,
    req.address,
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
    range: `${PD_TAB}!A:AA`,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  })
  invalidatePDCache()

  const record: PermanentDisconnection = {
    pdId,
    consumerId: req.consumerId,
    consumerName: req.consumerName,
    address: req.address,
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
    changes: { status: initialStatus, consumerId: req.consumerId, consumerName: req.consumerName, agency: req.agency || "" }
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
  const all = await _fetchPDRaw(id)
  const today = nowDate()

  const dataUpdates: Array<{ range: string; values: any[][] }> = []

  for (const pdId of pdIds) {
    const idx = all.findIndex(r => r.pdId === pdId)
    if (idx !== -1) {
      const rowNum = idx + 2
      dataUpdates.push(
        { range: `${PD_TAB}!G${rowNum}`, values: [["issued"]] },
        { range: `${PD_TAB}!H${rowNum}`, values: [[agency]] },
        { range: `${PD_TAB}!K${rowNum}`, values: [[today]] },
        { range: `${PD_TAB}!L${rowNum}`, values: [[issuedBy || ""]] }
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
  const all = await _fetchPDRaw(id)
  const idx = all.findIndex(r => r.pdId === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${PD_TAB}!H${rowNum}`,
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
  const all = await _fetchPDRaw(id)
  const idx = all.findIndex(r => r.pdId === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2
  const dt = data.disconnectionDateTime || nowTs()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!G${rowNum}`, values: [["disconnected"]] },
        { range: `${PD_TAB}!M${rowNum}`, values: [[data.finalReading || ""]] },
        { range: `${PD_TAB}!N${rowNum}`, values: [[data.removedMeterNo || ""]] },
        { range: `${PD_TAB}!O${rowNum}`, values: [[data.meterCondition || "working"]] },
        { range: `${PD_TAB}!P${rowNum}`, values: [[dt]] },
        { range: `${PD_TAB}!Q${rowNum}`, values: [[data.latitude || ""]] },
        { range: `${PD_TAB}!R${rowNum}`, values: [[data.longitude || ""]] },
        { range: `${PD_TAB}!S${rowNum}`, values: [[data.evidencePhotos || ""]] },
        { range: `${PD_TAB}!T${rowNum}`, values: [[data.agencyRemarks || ""]] },
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
  const all = await _fetchPDRaw(id)
  const idx = all.findIndex(r => r.pdId === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2
  const retDate = data.returnDate || nowDate()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!U${rowNum}`, values: [["returned"]] },
        { range: `${PD_TAB}!V${rowNum}`, values: [[retDate]] },
        { range: `${PD_TAB}!W${rowNum}`, values: [[data.condition || "working"]] },
        { range: `${PD_TAB}!X${rowNum}`, values: [[data.remarks || ""]] },
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
  const all = await _fetchPDRaw(id)
  const idx = all.findIndex(r => r.pdId === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2
  const nsDate = data.noteSheetDate || nowDate()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!Y${rowNum}`, values: [[data.noteSheetNo]] },
        { range: `${PD_TAB}!Z${rowNum}`, values: [[nsDate]] },
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
  const all = await _fetchPDRaw(id)
  const idx = all.findIndex(r => r.pdId === pdId)
  if (idx === -1) throw new Error("PD record not found")
  const rowNum = idx + 2

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PD_TAB}!G${rowNum}`, values: [["closed"]] },
        { range: `${PD_TAB}!AA${rowNum}`, values: [[remarks || "Closed by Admin"]] },
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
