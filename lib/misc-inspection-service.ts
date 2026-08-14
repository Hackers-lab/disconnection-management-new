import { sheets as googleSheets } from "@googleapis/sheets"
import { revalidateTag, unstable_cache } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId, ensureHeaders, findColumn, colLetter } from "./google-sheets-api"
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
    const endColLetter = colLetter(MISC_INSPECTION_HEADERS.length - 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${MISC_INSPECTION_TAB}!A1:${endColLetter}1`,
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
    return idx !== -1 && row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : ""
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

/**
 * Removes any empty/blank rows in the Misc_Inspections tab to prevent gaps in Google Sheets.
 */
export async function cleanupBlankRows(spreadsheetId?: string): Promise<number> {
  try {
    const id = spreadsheetId || getSpreadsheetId()
    await initTab(id)

    const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
    const sheetObj = meta.data.sheets?.find(s => s.properties?.title === MISC_INSPECTION_TAB)
    if (!sheetObj) return 0
    const numericSheetId = sheetObj.properties?.sheetId ?? 0

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${MISC_INSPECTION_TAB}!A1:ZZ`,
    })

    const rows = res.data.values || []
    if (rows.length < 2) return 0

    const headers = rows[0].map(h => String(h || "").trim())
    const idColIdx = findColumn(headers, ["ID"])

    const blankRowIndices: number[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const isEmpty = !row || row.length === 0 || row.every(cell => !String(cell || "").trim())
      const hasNoId = idColIdx !== -1 && (!row[idColIdx] || !String(row[idColIdx]).trim())
      if (isEmpty || hasNoId) {
        blankRowIndices.push(i)
      }
    }

    if (blankRowIndices.length === 0) return 0

    const deleteRequests = blankRowIndices.reverse().map(idx => ({
      deleteDimension: {
        range: {
          sheetId: numericSheetId,
          dimension: "ROWS",
          startIndex: idx,
          endIndex: idx + 1,
        },
      },
    }))

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: deleteRequests },
    })

    invalidateMiscInspectionCache()
    return deleteRequests.length
  } catch (err) {
    console.warn("cleanupBlankRows error:", err)
    return 0
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
  const idColIdx = findColumn(headers, ["ID"])
  const dataRows = rows.slice(1)

  // Auto cleanup blank rows in background if any are present
  const hasBlankRows = dataRows.some(row => !row || row.length === 0 || (idColIdx !== -1 && !String(row[idColIdx] || "").trim()))
  if (hasBlankRows) {
    cleanupBlankRows(id).catch(e => console.warn("Background cleanup failed:", e))
  }

  return dataRows
    .map(row => parseRecordFromRow(headers, row))
    .filter(r => Boolean(r.id && r.id.trim()))
}

const cachedFetchMiscInspections = unstable_cache(
  async (id: string) => fetchAllMiscInspectionsRaw(id),
  ["misc_inspections_list"],
  { tags: [MISC_INSPECTION_TAG], revalidate: 30 * 24 * 60 * 60 }
)

export function getMiscInspections(spreadsheetId?: string) {
  const id = spreadsheetId || getSpreadsheetId()
  return cachedFetchMiscInspections(id)
}

export async function getMiscInspectionById(id: string, spreadsheetId?: string): Promise<MiscInspectionRecord | null> {
  const records = await getMiscInspections(spreadsheetId)
  return records.find(r => r.id.toLowerCase() === id.toLowerCase()) || null
}

export async function createMiscInspection(
  input: CreateMiscInspectionInput & { initialImageUrl?: string },
  createdBy: string
): Promise<MiscInspectionRecord> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  let allRecords: MiscInspectionRecord[] = []
  try {
    allRecords = await fetchAllMiscInspectionsRaw(spreadsheetId)
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
    sitePhotoUrl: input.initialImageUrl,
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
  const setVal = (colName: string, val: string | undefined | null) => {
    const idx = findColumn(headers, [colName])
    if (idx !== -1 && val !== undefined && val !== null) {
      newRow[idx] = String(val)
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
  setVal("Site Photo URL", record.sitePhotoUrl)
  setVal("Existing Meter No", record.existingMeterNo)
  setVal("Meter Reading", record.meterReading)
  setVal("Measured Load (kW)", record.measuredLoadKw)
  setVal("Line Length (m)", record.lineLengthMeters)
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

  // Batch update values
  const updates: { col: number; val: string }[] = []
  const pushUpdate = (colName: string, val: string | undefined | null) => {
    if (val === undefined || val === null) return
    const idx = findColumn(headers, [colName])
    if (idx !== -1) updates.push({ col: idx, val: String(val) })
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

  const maxCols = Math.max(headers.length, (rows[rowIndex - 1] || []).length)
  const currentRow = new Array(maxCols).fill("")
  const oldRow = rows[rowIndex - 1] || []
  for (let i = 0; i < oldRow.length; i++) {
    currentRow[i] = oldRow[i] !== undefined && oldRow[i] !== null ? String(oldRow[i]) : ""
  }

  for (const item of updates) {
    currentRow[item.col] = item.val
  }

  const endColLetter = colLetter(currentRow.length - 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A${rowIndex}:${endColLetter}${rowIndex}`,
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
  const pushUpdate = (colName: string, val: string | undefined | null) => {
    if (val === undefined || val === null) return
    const idx = findColumn(headers, [colName])
    if (idx !== -1) updates.push({ col: idx, val: String(val) })
  }

  pushUpdate("Admin Decision", input.adminDecision)
  pushUpdate("Admin Remarks", input.adminRemarks || "")
  pushUpdate("Memo No", input.memoNo || "")
  pushUpdate("Finalized By", finalizedBy)
  pushUpdate("Finalized At", finalizedAt)
  pushUpdate("Status", newStatus)

  const maxCols = Math.max(headers.length, (rows[rowIndex - 1] || []).length)
  const currentRow = new Array(maxCols).fill("")
  const oldRow = rows[rowIndex - 1] || []
  for (let i = 0; i < oldRow.length; i++) {
    currentRow[i] = oldRow[i] !== undefined && oldRow[i] !== null ? String(oldRow[i]) : ""
  }

  for (const item of updates) {
    currentRow[item.col] = item.val
  }

  const endColLetter = colLetter(currentRow.length - 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A${rowIndex}:${endColLetter}${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [currentRow] },
  })

  invalidateMiscInspectionCache()
  return parseRecordFromRow(headers, currentRow)
}

export async function deleteMiscInspection(id: string): Promise<boolean> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sheetObj = meta.data.sheets?.find(s => s.properties?.title === MISC_INSPECTION_TAB)
  const numericSheetId = sheetObj?.properties?.sheetId ?? 0

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${MISC_INSPECTION_TAB}!A1:ZZ`,
  })

  const rows = res.data.values || []
  if (rows.length < 2) {
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
      rowIndex = i // 0-based row index in rows (header is 0, first data row is 1)
      break
    }
  }

  if (rowIndex === -1) {
    invalidateMiscInspectionCache()
    return false
  }

  // Physically delete the row dimension from the sheet so no blank row remains
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: numericSheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  })

  invalidateMiscInspectionCache()
  return true
}
