// Server-only — imports @googleapis/sheets. Never import in "use client" components.
import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth, renameDriveFile } from "./google-drive"
import { getSpreadsheetId, ensureHeaders, findColumn, colLetter } from "./google-sheets-api"
import type { NSCApplication } from "./nsc-types"
import { nowTs, currentFY } from "./date-utils"

export type { NSCApplication }

const sheets = googleSheets({ version: "v4", auth })

export const NSC_TAB = "NSC_Applications"

// 48 columns A–AV
const NSC_HEADERS = [
  "Receive No", "Received Date", "Applicant Name", "C/O", "Address",
  "Mobile", "Applied Class", "Phase", "Agency", "Status",
  "Created By", "Created At",
  // Inspection — verification
  "Verify Name", "Verify C/O", "Verify Address", "Verify Class",
  // Inspection — site conditions
  "Existing Meter", "Existing Meter No", "Existing Meter Image",
  "Valid Partition", "Partition Image", "Dispute",
  // Inspection — technical
  "Load (kW)", "Service Length (m)", "Pole Required", "Pole Drawing Image",
  "DTR Capacity", "DTR Load", "Site Image", "Inspection Form Image",
  // Inspection — decision
  "Agency Decision", "Agency Remarks", "Inspected At", "Inspected By",
  // Admin processing
  "Admin Decision", "Admin Remarks", "Final Action",
  "Memo No", "Application No", "Finalized At", "Finalized By",
  // Meter & connection milestones
  "Meter Issued At", "Connection Effected At", "Meter Serial No",
  // Added columns (AS–AV) — safe to append, never break existing data
  "Office Ref No", "Project ID", "Is Legacy", "Existing Consumer ID",
  "Application Form URL",
]

const NSC_FIELD_MAP: Record<keyof NSCApplication, string[]> = {
  receiveNo:         ["Receive No", "receiveNo", "receive_no"],
  receivedDate:      ["Received Date", "receivedDate", "received_date"],
  applicantName:     ["Applicant Name", "applicantName", "applicant_name"],
  careOf:            ["C/O", "careOf", "care_of"],
  address:           ["Address", "address"],
  mobile:            ["Mobile", "mobile"],
  appliedClass:      ["Applied Class", "appliedClass", "applied_class"],
  phase:             ["Phase", "phase"],
  agency:            ["Agency", "agency"],
  status:            ["Status", "status"],
  createdBy:         ["Created By", "createdBy", "created_by"],
  createdAt:         ["Created At", "createdAt", "created_at"],
  verifyName:        ["Verify Name", "verifyName", "verify_name"],
  verifyCO:          ["Verify C/O", "verifyCO", "verify_c_o", "verifyco"],
  verifyAddress:     ["Verify Address", "verifyAddress", "verify_address"],
  verifyClass:       ["Verify Class", "verifyClass", "verify_class"],
  existingMeter:     ["Existing Meter", "existingMeter", "existing_meter"],
  existingMeterNo:   ["Existing Meter No", "existingMeterNo", "existing_meter_no"],
  existingMeterImg:  ["Existing Meter Image", "existingMeterImg", "existing_meter_image"],
  validPartition:    ["Valid Partition", "validPartition", "valid_partition"],
  partitionImg:      ["Partition Image", "partitionImg", "partition_image"],
  dispute:           ["Dispute", "dispute"],
  load:              ["Load (kW)", "load", "load_kw"],
  serviceLength:     ["Service Length (m)", "serviceLength", "service_length"],
  poleRequired:      ["Pole Required", "poleRequired", "pole_required"],
  poleDrawingImg:    ["Pole Drawing Image", "poleDrawingImg", "pole_drawing_image"],
  dtrCapacity:       ["DTR Capacity", "dtrCapacity", "dtr_capacity"],
  dtrLoad:           ["DTR Load", "dtrLoad", "dtr_load"],
  siteImg:           ["Site Image", "siteImg", "site_image"],
  inspectionFormImg: ["Inspection Form Image", "inspectionFormImg", "inspection_form_image"],
  agencyDecision:    ["Agency Decision", "agencyDecision", "agency_decision"],
  agencyRemarks:     ["Agency Remarks", "agencyRemarks", "agency_remarks"],
  inspectedAt:       ["Inspected At", "inspectedAt", "inspected_at"],
  inspectedBy:       ["Inspected By", "inspectedBy", "inspected_by"],
  adminDecision:     ["Admin Decision", "adminDecision", "admin_decision"],
  adminRemarks:      ["Admin Remarks", "adminRemarks", "admin_remarks"],
  finalAction:       ["Final Action", "finalAction", "final_action"],
  memoNo:            ["Memo No", "memoNo", "memo_no"],
  applicationNo:     ["Application No", "applicationNo", "application_id", "application_no"],
  finalizedAt:          ["Finalized At", "finalizedAt", "finalized_at"],
  finalizedBy:          ["Finalized By", "finalizedBy", "finalized_by"],
  meterIssuedAt:        ["Meter Issued At", "meterIssuedAt", "meter_issued_at"],
  connectionEffectedAt: ["Connection Effected At", "connectionEffectedAt", "connection_effected_at"],
  meterSerialNo:        ["Meter Serial No", "meterSerialNo", "meter_serial_no"],
  officeRefNo:          ["Office Ref No", "officeRefNo", "office_ref_no"],
  projectId:            ["Project ID", "projectId", "project_id"],
  isLegacy:             ["Is Legacy", "isLegacy", "is_legacy"],
  existingConsumerId:   ["Existing Consumer ID", "existingConsumerId", "existing_consumer_id", "existingconsumerid"],
  applicationFormUrl:   ["Application Form URL", "applicationFormUrl", "application_form_url"],
}

// ─── Shared cross-instance cache (Next.js Data Cache) ─────────────────────────
// Read paths use the cached wrapper; write paths use the raw fetch so row
// positions / next receive numbers are always computed against live data.
const NSC_TAG = "nsc"
const NSC_REVALIDATE_S = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache
let tabReady = false

export function invalidateNSCCache() { revalidateTag(NSC_TAG) }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  if (!existing.includes(NSC_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: NSC_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${NSC_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [NSC_HEADERS] },
    })
  }
  tabReady = true
}

// ─── Parser ──────────────────────────────────────────────────────────────────
function parseRow(r: string[], headers: string[]): NSCApplication {
  const getVal = (field: keyof NSCApplication) => {
    const candidates = NSC_FIELD_MAP[field]
    if (!candidates) return ""
    const idx = findColumn(headers, candidates)
    if (idx === -1) return ""
    return r[idx] || ""
  }

  return {
    receiveNo:            getVal("receiveNo"),
    receivedDate:         getVal("receivedDate"),
    applicantName:        getVal("applicantName"),
    careOf:               getVal("careOf"),
    address:              getVal("address"),
    mobile:               getVal("mobile"),
    appliedClass:         getVal("appliedClass"),
    phase:                getVal("phase"),
    agency:               getVal("agency"),
    status:               getVal("status") || "pending",
    createdBy:            getVal("createdBy"),
    createdAt:            getVal("createdAt"),
    verifyName:           getVal("verifyName"),
    verifyCO:             getVal("verifyCO"),
    verifyAddress:        getVal("verifyAddress"),
    verifyClass:          getVal("verifyClass"),
    existingMeter:        getVal("existingMeter"),
    existingMeterNo:      getVal("existingMeterNo"),
    existingMeterImg:     getVal("existingMeterImg"),
    validPartition:       getVal("validPartition"),
    partitionImg:         getVal("partitionImg"),
    dispute:              getVal("dispute"),
    load:                 getVal("load"),
    serviceLength:        getVal("serviceLength"),
    poleRequired:         getVal("poleRequired"),
    poleDrawingImg:       getVal("poleDrawingImg"),
    dtrCapacity:          getVal("dtrCapacity"),
    dtrLoad:              getVal("dtrLoad"),
    siteImg:              getVal("siteImg"),
    inspectionFormImg:    getVal("inspectionFormImg"),
    agencyDecision:       getVal("agencyDecision"),
    agencyRemarks:        getVal("agencyRemarks"),
    inspectedAt:          getVal("inspectedAt"),
    inspectedBy:          getVal("inspectedBy"),
    adminDecision:        getVal("adminDecision"),
    adminRemarks:         getVal("adminRemarks"),
    finalAction:          getVal("finalAction"),
    memoNo:               getVal("memoNo"),
    applicationNo:        getVal("applicationNo"),
    finalizedAt:          getVal("finalizedAt"),
    finalizedBy:          getVal("finalizedBy"),
    meterIssuedAt:        getVal("meterIssuedAt"),
    connectionEffectedAt: getVal("connectionEffectedAt"),
    meterSerialNo:        getVal("meterSerialNo"),
    officeRefNo:          getVal("officeRefNo"),
    projectId:            getVal("projectId"),
    isLegacy:             getVal("isLegacy"),
    existingConsumerId:   getVal("existingConsumerId"),
    applicationFormUrl:   getVal("applicationFormUrl"),
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function _fetchApplicationsRaw(spreadsheetId: string): Promise<NSCApplication[]> {
  const headers = await ensureHeaders(spreadsheetId, NSC_TAB, NSC_HEADERS)
  const lastColLetter = colLetter(headers.length - 1)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${NSC_TAB}!A:${lastColLetter}` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseRow(r.map(String), headers))
}

// Cached read for list/count endpoints (notifications, GET).
export const fetchApplications = unstable_cache(
  async (spreadsheetId: string) => _fetchApplicationsRaw(spreadsheetId),
  ["nsc-data"],
  { revalidate: NSC_REVALIDATE_S, tags: [NSC_TAG] },
)

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────
// nextReceiveNo now embeds phase: NSC/26-27/1P/0001 or NSC/26-27/3P/0001
// Separate counters per phase per FY prevent gaps when one type is common.
async function nextReceiveNo(id: string, phase: string): Promise<string> {
  const all = await _fetchApplicationsRaw(id)
  const fy  = currentFY()
  // Support legacy format (no phase segment) AND new format
  const phaseSegment = phase === "3P" ? "3P" : "1P"
  const newPrefix    = `NSC/${fy}/${phaseSegment}/`
  const legacyPrefix = `NSC/${fy}/`
  // Count only rows matching the same phase prefix (new format)
  const newNums = all
    .filter(a => a.receiveNo.startsWith(newPrefix))
    .map(a => parseInt(a.receiveNo.slice(newPrefix.length), 10))
    .filter(n => !isNaN(n))
  // Also check legacy rows that don't have phase segment but same phase value
  const legacyNums = all
    .filter(a => a.receiveNo.startsWith(legacyPrefix) && !a.receiveNo.slice(legacyPrefix.length).includes("/") && a.phase === phase)
    .map(a => parseInt(a.receiveNo.slice(legacyPrefix.length), 10))
    .filter(n => !isNaN(n))
  const allNums = [...newNums, ...legacyNums]
  const max = allNums.length ? Math.max(...allNums) : 0
  return `${newPrefix}${String(max + 1).padStart(4, "0")}`
}

// ─── Create application ───────────────────────────────────────────────────────
export async function createApplication(req: {
  applicantName: string
  careOf:        string
  address:       string
  mobile:        string
  appliedClass:  string
  phase:         string
  agency:        string
  createdBy:     string
  officeRefNo?:  string
  applicationFormUrl?: string
}): Promise<string> {
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const receiveNo = await nextReceiveNo(id, req.phase)
  const now = nowTs()

  const row = new Array(headers.length).fill("")
  const setVal = (field: keyof NSCApplication, value: string) => {
    const idx = findColumn(headers, NSC_FIELD_MAP[field])
    if (idx !== -1) row[idx] = value
  }

  setVal("receiveNo", receiveNo)
  setVal("receivedDate", now.split(" ")[0])
  setVal("applicantName", req.applicantName)
  setVal("careOf", req.careOf)
  setVal("address", req.address)
  setVal("mobile", req.mobile)
  setVal("appliedClass", req.appliedClass)
  setVal("phase", req.phase)
  setVal("agency", req.agency)
  setVal("status", "pending")
  setVal("createdBy", req.createdBy)
  setVal("createdAt", now)
  setVal("officeRefNo", req.officeRefNo || "")
  setVal("applicationFormUrl", req.applicationFormUrl || "")

  const lastColLetter = colLetter(headers.length - 1)
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${NSC_TAB}!A:${lastColLetter}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  })

  // Rename Google Drive file to match REF or NSC App No (receiveNo)
  if (req.applicationFormUrl) {
    const match = req.applicationFormUrl.match(/id=([^&]+)/)
    const fileId = match ? match[1] : null
    if (fileId) {
      const rawName = req.officeRefNo?.trim() ? req.officeRefNo.trim() : receiveNo
      const cleanName = `${rawName.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`
      await renameDriveFile(fileId, cleanName)
    }
  }

  invalidateNSCCache()
  return receiveNo
}

// ─── Submit inspection (agency) ───────────────────────────────────────────────
export async function submitInspection(req: {
  receiveNo:         string
  verifyName:        string
  verifyCO:          string
  verifyAddress:     string
  verifyClass:       string
  existingMeter:     string
  existingMeterNo:   string
  existingMeterImg:  string
  validPartition:    string
  partitionImg:      string
  dispute:           string
  load:              string
  serviceLength:     string
  poleRequired:      string
  poleDrawingImg:    string
  dtrCapacity:       string
  dtrLoad:           string
  siteImg:           string
  inspectionFormImg: string
  agencyDecision:    string
  agencyRemarks:     string
  inspectedBy:       string
}): Promise<void> {
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === req.receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  const now = nowTs()

  const data: any[] = []
  const addUpdate = (field: keyof NSCApplication, value: string) => {
    const colIdx = findColumn(headers, NSC_FIELD_MAP[field])
    if (colIdx !== -1) {
      data.push({
        range: `${NSC_TAB}!${colLetter(colIdx)}${row}`,
        values: [[value]]
      })
    }
  }

  addUpdate("status", "inspected")
  addUpdate("verifyName", req.verifyName)
  addUpdate("verifyCO", req.verifyCO)
  addUpdate("verifyAddress", req.verifyAddress)
  addUpdate("verifyClass", req.verifyClass)
  addUpdate("existingMeter", req.existingMeter)
  addUpdate("existingMeterNo", req.existingMeterNo)
  addUpdate("existingMeterImg", req.existingMeterImg)
  addUpdate("validPartition", req.validPartition)
  addUpdate("partitionImg", req.partitionImg)
  addUpdate("dispute", req.dispute)
  addUpdate("load", req.load)
  addUpdate("serviceLength", req.serviceLength)
  addUpdate("poleRequired", req.poleRequired)
  addUpdate("poleDrawingImg", req.poleDrawingImg)
  addUpdate("dtrCapacity", req.dtrCapacity)
  addUpdate("dtrLoad", req.dtrLoad)
  addUpdate("siteImg", req.siteImg)
  addUpdate("inspectionFormImg", req.inspectionFormImg)
  addUpdate("agencyDecision", req.agencyDecision)
  addUpdate("agencyRemarks", req.agencyRemarks)
  addUpdate("inspectedAt", now)
  addUpdate("inspectedBy", req.inspectedBy)

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  })
  invalidateNSCCache()
}

// ─── Process application (admin/exec) ─────────────────────────────────────────
export async function processApplication(req: {
  receiveNo:          string
  adminDecision:      string
  adminRemarks:       string
  finalAction:        string   // "quotation" | "dispute_letter" | "reassign"
  memoNo?:            string
  applicationNo?:     string
  newAgency?:         string   // only for reassign
  existingConsumerId?: string
  finalizedBy:        string
}): Promise<void> {
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === req.receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  const now = nowTs()

  const newStatus =
    req.finalAction === "quotation"      ? "quotation_issued" :
    req.finalAction === "dispute_letter" ? "dispute_issued"   : "pending"

  const data: any[] = []
  const addUpdate = (field: keyof NSCApplication, value: string) => {
    const colIdx = findColumn(headers, NSC_FIELD_MAP[field])
    if (colIdx !== -1) {
      data.push({
        range: `${NSC_TAB}!${colLetter(colIdx)}${row}`,
        values: [[value]]
      })
    }
  }

  addUpdate("status", newStatus)
  addUpdate("adminDecision", req.adminDecision)
  addUpdate("adminRemarks", req.adminRemarks)
  addUpdate("finalAction", req.finalAction)
  addUpdate("finalizedAt", now)
  addUpdate("finalizedBy", req.finalizedBy)

  if (req.memoNo)            addUpdate("memoNo", req.memoNo)
  if (req.applicationNo)     addUpdate("applicationNo", req.applicationNo)
  if (req.newAgency)         addUpdate("agency", req.newAgency)
  if (req.existingConsumerId !== undefined)
    addUpdate("existingConsumerId", req.existingConsumerId)

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data },
  })
  invalidateNSCCache()
}
export async function updateNSCMeterIssued(receiveNo: string, serialNo: string, agency: string): Promise<void> {
  if (!receiveNo) return
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) return
  const row = idx + 2

  const data: any[] = []
  const addUpdate = (field: keyof NSCApplication, value: string) => {
    const colIdx = findColumn(headers, NSC_FIELD_MAP[field])
    if (colIdx !== -1) {
      data.push({
        range: `${NSC_TAB}!${colLetter(colIdx)}${row}`,
        values: [[value]]
      })
    }
  }

  addUpdate("status", "meter_issued")
  addUpdate("meterIssuedAt", nowTs())
  addUpdate("meterSerialNo", serialNo)
  addUpdate("agency", agency)

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  })
  invalidateNSCCache()
}

// ─── Called by meter-service when NSC meter installation is finalized ────────
export async function updateNSCConnectionEffected(receiveNo: string): Promise<void> {
  if (!receiveNo) return
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) return
  const row = idx + 2

  const data: any[] = []
  const addUpdate = (field: keyof NSCApplication, value: string) => {
    const colIdx = findColumn(headers, NSC_FIELD_MAP[field])
    if (colIdx !== -1) {
      data.push({
        range: `${NSC_TAB}!${colLetter(colIdx)}${row}`,
        values: [[value]]
      })
    }
  }

  addUpdate("status", "connection_effected")
  addUpdate("connectionEffectedAt", nowTs())

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  })
  invalidateNSCCache()
}

// ─── Called by meter-service when NSC meter is returned to stock ─────────────
export async function updateNSCMeterReturned(receiveNo: string): Promise<void> {
  if (!receiveNo) return
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) return
  const row = idx + 2
  const statusCol = findColumn(headers, NSC_FIELD_MAP["status"])
  if (statusCol !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${NSC_TAB}!${colLetter(statusCol)}${row}`,
      valueInputOption: "RAW",
      requestBody: { values: [["meter_returned"]] },
    })
  }
  invalidateNSCCache()
}

// ─── Update office reference number (always editable) ────────────────────────
export async function updateOfficeRefNo(receiveNo: string, officeRefNo: string): Promise<void> {
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  const officeRefCol = findColumn(headers, NSC_FIELD_MAP["officeRefNo"])
  if (officeRefCol !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${NSC_TAB}!${colLetter(officeRefCol)}${row}`,
      valueInputOption: "RAW",
      requestBody: { values: [[officeRefNo]] },
    })
  }
  invalidateNSCCache()
}

// ─── Link an application to a project ────────────────────────────────────────
export async function updateNSCProjectLink(receiveNo: string, projectId: string, newStatus?: string): Promise<void> {
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const all = await _fetchApplicationsRaw(id)
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2

  const updates: any[] = []
  const addUpdate = (field: keyof NSCApplication, value: string) => {
    const colIdx = findColumn(headers, NSC_FIELD_MAP[field])
    if (colIdx !== -1) {
      updates.push({
        range: `${NSC_TAB}!${colLetter(colIdx)}${row}`,
        values: [[value]]
      })
    }
  }

  addUpdate("projectId", projectId)
  if (newStatus) addUpdate("status", newStatus)

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data: updates },
  })
  invalidateNSCCache()
}

// ─── Bulk legacy import ───────────────────────────────────────────────────────
export interface LegacyImportRow {
  applicantName: string
  careOf:        string
  address:       string
  mobile:        string
  appliedClass:  string
  phase:         string
  agency:        string
  officeRefNo:   string   // original serial from Excel
  receivedDate:  string   // original date (YYYY-MM-DD)
  status:        string   // current status if known
  createdBy:     string
}

export async function importLegacyApplications(rows: LegacyImportRow[]): Promise<number> {
  const id = getSpreadsheetId()
  const headers = await ensureHeaders(id, NSC_TAB, NSC_HEADERS)
  const existing = await _fetchApplicationsRaw(id)
  const fy = currentFY()
  const prefix = `NSC/${fy}/`
  const nums = existing
    .filter(a => a.receiveNo.startsWith(prefix))
    .map(a => parseInt(a.receiveNo.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  let counter = nums.length ? Math.max(...nums) : 0

  const values = rows.map(r => {
    counter++
    const receiveNo = `${prefix}${String(counter).padStart(4, "0")}`
    const row = new Array(headers.length).fill("")
    const setVal = (field: keyof NSCApplication, value: string) => {
      const colIdx = findColumn(headers, NSC_FIELD_MAP[field])
      if (colIdx !== -1) row[colIdx] = value
    }

    setVal("receiveNo", receiveNo)
    setVal("receivedDate", r.receivedDate)
    setVal("applicantName", r.applicantName)
    setVal("careOf", r.careOf)
    setVal("address", r.address)
    setVal("mobile", r.mobile)
    setVal("appliedClass", r.appliedClass)
    setVal("phase", r.phase)
    setVal("agency", r.agency)
    setVal("status", r.status || "pending")
    setVal("createdBy", r.createdBy)
    setVal("createdAt", nowTs())
    setVal("officeRefNo", r.officeRefNo)
    setVal("isLegacy", "true")
    return row
  })

  // Append in batches
  const BATCH = 200
  const lastColLetter = colLetter(headers.length - 1)
  for (let i = 0; i < values.length; i += BATCH) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${NSC_TAB}!A:${lastColLetter}`,
      valueInputOption: "RAW",
      requestBody: { values: values.slice(i, i + BATCH) },
    })
  }
  invalidateNSCCache()
  return values.length
}
