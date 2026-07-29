import { sheets as googleSheets } from "@googleapis/sheets"
import { revalidateTag, unstable_cache } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId, ensureHeaders, findColumn } from "./google-sheets-api"
import type {
  MiscInspectionRecord,
  CreateMiscInspectionInput,
  AgencyInspectionUpdateInput,
  AdminFinalizeInput,
  InspectionCategory,
  InspectionPriority,
  InspectionStatus,
  AgencyDecision,
  AdminDecision,
  DynamicCategoryFields,
} from "./misc-inspection-types"
import { nowTs, currentFY } from "./date-utils"

const sheets = googleSheets({ version: "v4", auth: auth as any })

export const MISC_INSPECTION_TAB = "Misc_Inspections"
export const MISC_INSPECTION_TAG = "misc_inspections"

export const MISC_INSPECTION_HEADERS = [
  "ID",
  "Reference No",
  "Reference Doc URL",
  "Category",
  "Title",
  "Description",
  "Consumer ID",
  "DTR ID",
  "Applicant Name",
  "Address",
  "Mobile",
  "Priority",
  "Agency",
  "Target Completion Date",
  "Status",
  "Created By",
  "Created At",
  "Inspected By",
  "Inspected At",
  "Agency Decision",
  "Agency Remarks",
  "Site Photo URL",
  "Meter Reading Photo URL",
  "Sketch Drawing URL",
  "Geo Coordinates",
  "Existing Meter No",
  "Meter Reading",
  "Measured Load (kW)",
  "Line Length (m)",
  "Category Fields JSON",
  "Admin Decision",
  "Admin Remarks",
  "Memo No",
  "Finalized By",
  "Finalized At",
] as const

let tabReady = new Set<string>()

async function initTab(spreadsheetId: string) {
  if (tabReady.has(spreadsheetId)) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existingTabs = (meta.data.sheets || []).map(s => s.properties?.title)
  if (!existingTabs.includes(MISC_INSPECTION_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: MISC_INSPECTION_TAB } } }],
      },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${MISC_INSPECTION_TAB}!A1:AH1`,
      valueInputOption: "RAW",
      requestBody: { values: [Array.from(MISC_INSPECTION_HEADERS)] },
    })
  } else {
    await ensureHeaders(spreadsheetId, MISC_INSPECTION_TAB, MISC_INSPECTION_HEADERS)
  }
  tabReady.add(spreadsheetId)
}

export function invalidateMiscInspectionCache() {
  revalidateTag(MISC_INSPECTION_TAG)
}

function parseRecordFromRow(headers: string[], row: any[]): MiscInspectionRecord {
  const getVal = (colName: string) => {
    const idx = findColumn(headers, [colName])
    return idx !== -1 && row[idx] ? String(row[idx]).trim() : ""
  }

  let categoryFields: DynamicCategoryFields | undefined
  const catFieldsJson = getVal("Category Fields JSON")
  if (catFieldsJson) {
    try {
      categoryFields = JSON.parse(catFieldsJson)
    } catch {
      categoryFields = {}
    }
  }

  return {
    id: getVal("ID"),
    referenceNo: getVal("Reference No"),
    referenceDocUrl: getVal("Reference Doc URL") || undefined,
    category: (getVal("Category") || "GENERAL") as InspectionCategory,
    title: getVal("Title"),
    description: getVal("Description"),
    consumerId: getVal("Consumer ID") || undefined,
    dtrId: getVal("DTR ID") || undefined,
    applicantName: getVal("Applicant Name") || undefined,
    address: getVal("Address") || undefined,
    mobile: getVal("Mobile") || undefined,
    priority: (getVal("Priority") || "MEDIUM") as InspectionPriority,
    agency: getVal("Agency"),
    targetCompletionDate: getVal("Target Completion Date") || undefined,
    status: (getVal("Status") || "PENDING_AGENCY") as InspectionStatus,
    createdBy: getVal("Created By"),
    createdAt: getVal("Created At"),
    inspectedBy: getVal("Inspected By") || undefined,
    inspectedAt: getVal("Inspected At") || undefined,
    agencyDecision: (getVal("Agency Decision") as AgencyDecision) || undefined,
    agencyRemarks: getVal("Agency Remarks") || undefined,
    sitePhotoUrl: getVal("Site Photo URL") || undefined,
    meterReadingPhotoUrl: getVal("Meter Reading Photo URL") || undefined,
    sketchDrawingUrl: getVal("Sketch Drawing URL") || undefined,
    geoCoordinates: getVal("Geo Coordinates") || undefined,
    existingMeterNo: getVal("Existing Meter No") || undefined,
    meterReading: getVal("Meter Reading") || undefined,
    measuredLoadKw: getVal("Measured Load (kW)") || undefined,
    lineLengthMeters: getVal("Line Length (m)") || undefined,
    categoryFields,
    adminDecision: (getVal("Admin Decision") as AdminDecision) || undefined,
    adminRemarks: getVal("Admin Remarks") || undefined,
    memoNo: getVal("Memo No") || undefined,
    finalizedBy: getVal("Finalized By") || undefined,
    finalizedAt: getVal("Finalized At") || undefined,
  }
}

export async function fetchAllMiscInspectionsRaw(spreadsheetId?: string): Promise<MiscInspectionRecord[]> {
  const id = spreadsheetId || getSpreadsheetId()
  await initTab(id)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${MISC_INSPECTION_TAB}!A1:ZZ`,
  })

  const rows = res.data.values || []
  if (rows.length < 2) return []

  const headers = rows[0].map(h => String(h || "").trim())
  const dataRows = rows.slice(1)

  return dataRows
    .map(row => parseRecordFromRow(headers, row))
    .filter(r => Boolean(r.id))
}

export const getMiscInspections = (spreadsheetId?: string) => {
  const id = spreadsheetId || getSpreadsheetId()
  return unstable_cache(
    async () => fetchAllMiscInspectionsRaw(id),
    ["misc_inspections_list", id],
    { tags: [MISC_INSPECTION_TAG], revalidate: 30 * 24 * 60 * 60 }
  )()
}

export async function getMiscInspectionById(id: string, spreadsheetId?: string): Promise<MiscInspectionRecord | null> {
  const records = await getMiscInspections(spreadsheetId)
  return records.find(r => r.id.toLowerCase() === id.toLowerCase()) || null
}

export async function createMiscInspection(
  input: CreateMiscInspectionInput,
  createdBy: string
): Promise<MiscInspectionRecord> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  let allRecords: MiscInspectionRecord[] = []
  try {
    allRecords = await fetchAllMiscInspectionsRaw()
  } catch (e) {
    allRecords = []
  }
  
  // Auto-generate ID: MISC-2026-0001
  const currentYear = new Date().getFullYear()
  const yearPrefix = `MISC-${currentYear}-`
  const existingIds = allRecords
    .map(r => r.id)
    .filter(id => id && id.startsWith(yearPrefix))
    .map(id => parseInt(id.replace(yearPrefix, ""), 10))
    .filter(n => !isNaN(n))
  
  const nextSeq = (Math.max(0, ...existingIds) + 1).toString().padStart(4, "0")
  const id = `${yearPrefix}${nextSeq}`
  const createdAt = nowTs()

  const record: MiscInspectionRecord = {
    id,
    referenceNo: input.referenceNo || id,
    referenceDocUrl: input.referenceDocUrl,
    category: input.category,
    title: input.title,
    description: input.description,
    consumerId: input.consumerId,
    dtrId: input.dtrId,
    applicantName: input.applicantName,
    address: input.address,
    mobile: input.mobile,
    priority: input.priority || "MEDIUM",
    agency: input.agency,
    targetCompletionDate: input.targetCompletionDate,
    status: "PENDING_AGENCY",
    createdBy,
    createdAt,
    categoryFields: input.categoryFields || {},
    existingMeterNo: input.categoryFields?.meterSerialNo,
    measuredLoadKw: input.categoryFields?.dtrCapacityKva,
    lineLengthMeters: input.categoryFields?.serviceLineLengthMeters,
  }

  // Header mapping for row write
  let headers: string[] = []
  try {
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${MISC_INSPECTION_TAB}!1:1`,
    })
    headers = (headerRes.data.values?.[0] || []).map(h => String(h || "").trim())
  } catch (e) {
    headers = []
  }

  if (headers.length === 0) {
    headers = Array.from(MISC_INSPECTION_HEADERS)
  }

  const newRow = new Array(headers.length).fill("")
  const setVal = (colName: string, val: string | undefined) => {
    const idx = findColumn(headers, [colName])
    if (idx !== -1 && val !== undefined) {
      newRow[idx] = val
    }
  }

  setVal("ID", record.id)
  setVal("Reference No", record.referenceNo)
  setVal("Reference Doc URL", record.referenceDocUrl)
  setVal("Category", record.category)
  setVal("Title", record.title)
  setVal("Description", record.description)
  setVal("Consumer ID", record.consumerId)
  setVal("DTR ID", record.dtrId)
  setVal("Applicant Name", record.applicantName)
  setVal("Address", record.address)
  setVal("Mobile", record.mobile)
  setVal("Priority", record.priority)
  setVal("Agency", record.agency)
  setVal("Target Completion Date", record.targetCompletionDate)
  setVal("Status", record.status)
  setVal("Created By", record.createdBy)
  setVal("Created At", record.createdAt)
  setVal("Existing Meter No", record.existingMeterNo)
  setVal("Category Fields JSON", JSON.stringify(record.categoryFields || {}))

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A:ZZ`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newRow] },
  })

  invalidateMiscInspectionCache()
  return record
}

export async function updateMiscInspectionByAgency(
  id: string,
  input: AgencyInspectionUpdateInput,
  inspectedBy: string
): Promise<MiscInspectionRecord | null> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A1:ZZ`,
  })

  const rows = res.data.values || []
  if (rows.length < 2) return null

  const headers = rows[0].map(h => String(h || "").trim())
  const idColIdx = findColumn(headers, ["ID"])
  if (idColIdx === -1) return null

  let rowIndex = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idColIdx] || "").trim().toLowerCase() === id.toLowerCase()) {
      rowIndex = i + 1 // 1-indexed row number
      break
    }
  }

  if (rowIndex === -1) return null

  const inspectedAt = nowTs()
  const status: InspectionStatus = "INSPECTED"

  const setVal = (colName: string, val: string | undefined) => {
    const idx = findColumn(headers, [colName])
    if (idx !== -1 && val !== undefined) {
      const colLetter = String.fromCharCode(65 + idx)
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${MISC_INSPECTION_TAB}!${colLetter}${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[val]] },
      })
    }
  }

  // Batch update values
  const updates: { col: number; val: string }[] = []
  const pushUpdate = (colName: string, val: string | undefined) => {
    if (val === undefined) return
    const idx = findColumn(headers, [colName])
    if (idx !== -1) updates.push({ col: idx, val })
  }

  pushUpdate("Inspected By", inspectedBy)
  pushUpdate("Inspected At", inspectedAt)
  pushUpdate("Agency Decision", input.agencyDecision)
  pushUpdate("Agency Remarks", input.agencyRemarks || "")
  pushUpdate("Site Photo URL", input.sitePhotoUrl || "")
  pushUpdate("Meter Reading Photo URL", input.meterReadingPhotoUrl || "")
  pushUpdate("Sketch Drawing URL", input.sketchDrawingUrl || "")
  if (input.referenceDocUrl) {
    pushUpdate("Reference Doc URL", input.referenceDocUrl)
  }
  pushUpdate("Geo Coordinates", input.geoCoordinates || "")
  pushUpdate("Existing Meter No", input.existingMeterNo || "")
  pushUpdate("Meter Reading", input.meterReading || "")
  pushUpdate("Measured Load (kW)", input.measuredLoadKw || "")
  pushUpdate("Line Length (m)", input.lineLengthMeters || "")
  pushUpdate("Status", status)
  if (input.categoryFields) {
    pushUpdate("Category Fields JSON", JSON.stringify(input.categoryFields))
  }

  const currentRow = [...rows[rowIndex - 1]]
  for (const item of updates) {
    currentRow[item.col] = item.val
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A${rowIndex}:ZZ${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [currentRow] },
  })

  invalidateMiscInspectionCache()
  return parseRecordFromRow(headers, currentRow)
}

export async function finalizeMiscInspection(
  id: string,
  input: AdminFinalizeInput,
  finalizedBy: string
): Promise<MiscInspectionRecord | null> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A1:ZZ`,
  })

  const rows = res.data.values || []
  if (rows.length < 2) return null

  const headers = rows[0].map(h => String(h || "").trim())
  const idColIdx = findColumn(headers, ["ID"])
  if (idColIdx === -1) return null

  let rowIndex = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idColIdx] || "").trim().toLowerCase() === id.toLowerCase()) {
      rowIndex = i + 1
      break
    }
  }

  if (rowIndex === -1) return null

  const finalizedAt = nowTs()
  let newStatus: InspectionStatus = "FINALIZED"
  if (input.adminDecision === "REJECTED") {
    newStatus = "REJECTED"
  } else if (input.adminDecision === "RE_INSPECT") {
    newStatus = "PENDING_AGENCY"
  }

  const updates: { col: number; val: string }[] = []
  const pushUpdate = (colName: string, val: string | undefined) => {
    if (val === undefined) return
    const idx = findColumn(headers, [colName])
    if (idx !== -1) updates.push({ col: idx, val })
  }

  pushUpdate("Admin Decision", input.adminDecision)
  pushUpdate("Admin Remarks", input.adminRemarks || "")
  pushUpdate("Memo No", input.memoNo || "")
  pushUpdate("Finalized By", finalizedBy)
  pushUpdate("Finalized At", finalizedAt)
  pushUpdate("Status", newStatus)

  const currentRow = [...rows[rowIndex - 1]]
  for (const item of updates) {
    currentRow[item.col] = item.val
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A${rowIndex}:ZZ${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [currentRow] },
  })

  invalidateMiscInspectionCache()
  return parseRecordFromRow(headers, currentRow)
}

export async function deleteMiscInspection(id: string): Promise<boolean> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A1:ZZ`,
  })

  const rows = res.data.values || []
  if (rows.length < 2) {
    // No data rows — still invalidate cache to clear any phantom records
    invalidateMiscInspectionCache()
    return false
  }

  const headers = rows[0].map(h => String(h || "").trim())
  const idColIdx = findColumn(headers, ["ID"])
  if (idColIdx === -1) {
    invalidateMiscInspectionCache()
    return false
  }

  let rowIndex = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idColIdx] || "").trim().toLowerCase() === id.toLowerCase()) {
      rowIndex = i + 1
      break
    }
  }

  if (rowIndex === -1) {
    // Record not in sheet but may exist in cache — invalidate so phantom disappears
    invalidateMiscInspectionCache()
    return false
  }

  // Clear row content
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A${rowIndex}:ZZ${rowIndex}`,
  })

  invalidateMiscInspectionCache()
  return true
}
