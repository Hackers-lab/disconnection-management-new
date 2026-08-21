import { sheets as googleSheets } from "@googleapis/sheets"
import { revalidateTag, unstable_cache } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId, ensureHeaders, findColumn, colLetter } from "./google-sheets-api"
import type {
  IcdsRecord,
  CreateIcdsInput,
  IcdsInspectionInput,
  IcdsConnectionInput,
  IcdsEquipmentInput,
  IcdsCertificateInput,
  IcdsEditInput,
  IcdsStage,
  JurisdictionStatus,
  CsrEquipmentChecklist,
} from "./icds-types"
import { nowTs, currentFY } from "./date-utils"

const sheets = googleSheets({ version: "v4", auth: auth as any })

export const ICDS_TAB = "ICDS_Electrification"
export const ICDS_TAG = "icds_electrification"

export const ICDS_HEADERS = [
  "ID",
  "AWC Code",
  "AWC Name",
  "Block Name",
  "GP Name",
  "AWC Address",
  "Property Status",
  "AWW Name",
  "AWW Mobile",
  "CDPO Name",
  "Assigned Agency",
  "Jurisdiction Status",
  "Jurisdiction Office",
  "Stage",
  "Meter Exists",
  "Existing Meter No",
  "Existing Equipment Condition",
  "Existing Wiring Status",
  "Existing LED Bulbs Count",
  "Existing Fan Count",
  "New Wiring Required",
  "Infra Required",
  "Poles Required",
  "Cable Length M",
  "Service Line Length M",
  "Proposed DTR",
  "Route Drawing URL",
  "Inspect Geo Coordinates",
  "Inspect Date Time",
  "Inspected By",
  "Before Photo URL",
  "Inspection Remarks",
  "Booklet Received",
  "Booklet Received Date",
  "Booklet Scan URL",
  "Official Application No",
  "Quotation No",
  "Quotation Date",
  "Quotation Amount",
  "Work Order No",
  "Work Order Date",
  "Meter Issued No",
  "Meter Issued Date",
  "Smart Meter No",
  "Meter Install Date",
  "Meter Initial Reading",
  "Meter Installed By",
  "Meter Photo URL",
  "Equipment Package Installed",
  "Equipment Checklist JSON",
  "Equipment Install Date",
  "Equipment Agency",
  "After Photo URL",
  "Certificate Photo URL",
  "Certificate Signatory",
  "Certificate Signatory Designation",
  "Certificate Date",
  "Final Remarks",
  "Created At",
  "Updated At",
] as const

let tabReady = new Set<string>()

async function initTab(spreadsheetId: string) {
  if (tabReady.has(spreadsheetId)) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existingTabs = (meta.data.sheets || []).map(s => s.properties?.title)
  if (!existingTabs.includes(ICDS_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ICDS_TAB } } }],
      },
    })
    const endColLetter = colLetter(ICDS_HEADERS.length - 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ICDS_TAB}!A1:${endColLetter}1`,
      valueInputOption: "RAW",
      requestBody: { values: [Array.from(ICDS_HEADERS)] },
    })
  } else {
    await ensureHeaders(spreadsheetId, ICDS_TAB, ICDS_HEADERS)
  }
  tabReady.add(spreadsheetId)
}

export function invalidateIcdsCache() {
  revalidateTag(ICDS_TAG)
}

function parseRecordFromRow(headers: string[], row: any[]): IcdsRecord {
  const getVal = (colName: string) => {
    const idx = findColumn(headers, [colName])
    return idx !== -1 && row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : ""
  }

  let equipmentChecklist: CsrEquipmentChecklist | undefined
  const eqJson = getVal("Equipment Checklist JSON")
  if (eqJson) {
    try {
      equipmentChecklist = JSON.parse(eqJson)
    } catch {
      equipmentChecklist = undefined
    }
  }

  return {
    id: getVal("ID"),
    awcCode: getVal("AWC Code"),
    awcName: getVal("AWC Name"),
    blockName: getVal("Block Name"),
    gpName: getVal("GP Name"),
    awcAddress: getVal("AWC Address"),
    propertyStatus: getVal("Property Status") || "OWN_BUILDING",
    awwName: getVal("AWW Name"),
    awwMobile: getVal("AWW Mobile"),
    cdpoName: getVal("CDPO Name") || undefined,
    assignedAgency: getVal("Assigned Agency") || undefined,

    jurisdictionStatus: (getVal("Jurisdiction Status") || "UNDER_OFFICE") as JurisdictionStatus,
    jurisdictionOffice: getVal("Jurisdiction Office") || undefined,
    stage: (getVal("Stage") || "PENDING_INSPECTION") as IcdsStage,

    meterExists: getVal("Meter Exists").toUpperCase() === "YES",
    existingMeterNo: getVal("Existing Meter No") || undefined,
    existingEquipmentCondition: getVal("Existing Equipment Condition") || undefined,
    existingWiringStatus: (getVal("Existing Wiring Status") || undefined) as any,
    existingLedBulbsCount: getVal("Existing LED Bulbs Count") ? Number(getVal("Existing LED Bulbs Count")) : undefined,
    existingFanCount: getVal("Existing Fan Count") ? Number(getVal("Existing Fan Count")) : undefined,
    newWiringRequired: getVal("New Wiring Required") ? getVal("New Wiring Required").toUpperCase() === "YES" : undefined,
    infraRequired: getVal("Infra Required").toUpperCase() === "YES",
    polesRequired: getVal("Poles Required") ? Number(getVal("Poles Required")) : undefined,
    cableLengthM: getVal("Cable Length M") ? Number(getVal("Cable Length M")) : undefined,
    serviceLineLengthM: getVal("Service Line Length M") ? Number(getVal("Service Line Length M")) : undefined,
    proposedDtr: getVal("Proposed DTR") || undefined,
    routeDrawingUrl: getVal("Route Drawing URL") || undefined,
    inspectGeoCoordinates: getVal("Inspect Geo Coordinates") || undefined,
    inspectDateTime: getVal("Inspect Date Time") || undefined,
    inspectedBy: getVal("Inspected By") || undefined,
    beforePhotoUrl: getVal("Before Photo URL") || undefined,
    inspectionRemarks: getVal("Inspection Remarks") || undefined,

    bookletReceived: getVal("Booklet Received").toUpperCase() === "YES",
    bookletReceivedDate: getVal("Booklet Received Date") || undefined,
    bookletScanUrl: getVal("Booklet Scan URL") || undefined,
    officialApplicationNo: getVal("Official Application No") || undefined,
    quotationNo: getVal("Quotation No") || undefined,
    quotationDate: getVal("Quotation Date") || undefined,
    quotationAmount: getVal("Quotation Amount") ? Number(getVal("Quotation Amount")) : undefined,
    workOrderNo: getVal("Work Order No") || undefined,
    workOrderDate: getVal("Work Order Date") || undefined,
    meterIssuedNo: getVal("Meter Issued No") || undefined,
    meterIssuedDate: getVal("Meter Issued Date") || undefined,
    smartMeterNo: getVal("Smart Meter No") || undefined,
    meterInstallDate: getVal("Meter Install Date") || undefined,
    meterInitialReading: getVal("Meter Initial Reading") || undefined,
    meterInstalledBy: getVal("Meter Installed By") || undefined,
    meterPhotoUrl: getVal("Meter Photo URL") || undefined,

    equipmentPackageInstalled: getVal("Equipment Package Installed").toUpperCase() === "YES",
    equipmentChecklist,
    equipmentInstallDate: getVal("Equipment Install Date") || undefined,
    equipmentAgency: getVal("Equipment Agency") || undefined,

    afterPhotoUrl: getVal("After Photo URL") || undefined,
    certificatePhotoUrl: getVal("Certificate Photo URL") || undefined,
    certificateSignatory: getVal("Certificate Signatory") || undefined,
    certificateSignatoryDesignation: getVal("Certificate Signatory Designation") || undefined,
    certificateDate: getVal("Certificate Date") || undefined,
    finalRemarks: getVal("Final Remarks") || undefined,

    createdAt: getVal("Created At") || "",
    updatedAt: getVal("Updated At") || "",
  }
}

function formatRowFromRecord(headers: string[], record: IcdsRecord): any[] {
  const row = new Array(headers.length).fill("")
  const setVal = (colName: string, val: any) => {
    const idx = findColumn(headers, [colName])
    if (idx !== -1) {
      row[idx] = val !== undefined && val !== null ? String(val) : ""
    }
  }

  setVal("ID", record.id)
  setVal("AWC Code", record.awcCode)
  setVal("AWC Name", record.awcName)
  setVal("Block Name", record.blockName)
  setVal("GP Name", record.gpName)
  setVal("AWC Address", record.awcAddress)
  setVal("Property Status", record.propertyStatus)
  setVal("AWW Name", record.awwName)
  setVal("AWW Mobile", record.awwMobile)
  setVal("CDPO Name", record.cdpoName || "")
  setVal("Assigned Agency", record.assignedAgency || "")

  setVal("Jurisdiction Status", record.jurisdictionStatus)
  setVal("Jurisdiction Office", record.jurisdictionOffice || "")
  setVal("Stage", record.stage)

  setVal("Meter Exists", record.meterExists ? "YES" : "NO")
  setVal("Existing Meter No", record.existingMeterNo || "")
  setVal("Existing Equipment Condition", record.existingEquipmentCondition || "")
  setVal("Existing Wiring Status", record.existingWiringStatus || "")
  setVal("Existing LED Bulbs Count", record.existingLedBulbsCount ?? "")
  setVal("Existing Fan Count", record.existingFanCount ?? "")
  setVal("New Wiring Required", record.newWiringRequired !== undefined ? (record.newWiringRequired ? "YES" : "NO") : "")
  setVal("Infra Required", record.infraRequired ? "YES" : "NO")
  setVal("Poles Required", record.polesRequired ?? "")
  setVal("Cable Length M", record.cableLengthM ?? "")
  setVal("Service Line Length M", record.serviceLineLengthM ?? "")
  setVal("Proposed DTR", record.proposedDtr || "")
  setVal("Route Drawing URL", record.routeDrawingUrl || "")
  setVal("Inspect Geo Coordinates", record.inspectGeoCoordinates || "")
  setVal("Inspect Date Time", record.inspectDateTime || "")
  setVal("Inspected By", record.inspectedBy || "")
  setVal("Before Photo URL", record.beforePhotoUrl || "")
  setVal("Inspection Remarks", record.inspectionRemarks || "")

  setVal("Booklet Received", record.bookletReceived ? "YES" : "NO")
  setVal("Booklet Received Date", record.bookletReceivedDate || "")
  setVal("Booklet Scan URL", record.bookletScanUrl || "")
  setVal("Official Application No", record.officialApplicationNo || "")
  setVal("Quotation No", record.quotationNo || "")
  setVal("Quotation Date", record.quotationDate || "")
  setVal("Quotation Amount", record.quotationAmount ?? "")
  setVal("Work Order No", record.workOrderNo || "")
  setVal("Work Order Date", record.workOrderDate || "")
  setVal("Meter Issued No", record.meterIssuedNo || "")
  setVal("Meter Issued Date", record.meterIssuedDate || "")
  setVal("Smart Meter No", record.smartMeterNo || "")
  setVal("Meter Install Date", record.meterInstallDate || "")
  setVal("Meter Initial Reading", record.meterInitialReading || "")
  setVal("Meter Installed By", record.meterInstalledBy || "")
  setVal("Meter Photo URL", record.meterPhotoUrl || "")

  setVal("Equipment Package Installed", record.equipmentPackageInstalled ? "YES" : "NO")
  setVal("Equipment Checklist JSON", record.equipmentChecklist ? JSON.stringify(record.equipmentChecklist) : "")
  setVal("Equipment Install Date", record.equipmentInstallDate || "")
  setVal("Equipment Agency", record.equipmentAgency || "")

  setVal("After Photo URL", record.afterPhotoUrl || "")
  setVal("Certificate Photo URL", record.certificatePhotoUrl || "")
  setVal("Certificate Signatory", record.certificateSignatory || "")
  setVal("Certificate Signatory Designation", record.certificateSignatoryDesignation || "")
  setVal("Certificate Date", record.certificateDate || "")
  setVal("Final Remarks", record.finalRemarks || "")

  setVal("Created At", record.createdAt)
  setVal("Updated At", record.updatedAt)

  return row
}

export async function fetchAllIcdsRecordsRaw(): Promise<IcdsRecord[]> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ICDS_TAB}!A1:AZ`,
  })

  const rows = resp.data.values || []
  if (rows.length < 2) return []

  const headers = rows[0].map(h => String(h ?? "").trim())
  const records: IcdsRecord[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0 || !row[0]) continue
    const rec = parseRecordFromRow(headers, row)
    if (rec.id) records.push(rec)
  }

  return records
}

const getCachedIcds = unstable_cache(
  async (spreadsheetId: string) => {
    return fetchAllIcdsRecordsRaw()
  },
  [ICDS_TAG],
  { tags: [ICDS_TAG], revalidate: 120 }
)

export async function getIcdsRecords(): Promise<IcdsRecord[]> {
  const spreadsheetId = getSpreadsheetId()
  return getCachedIcds(spreadsheetId)
}

export async function getIcdsRecordById(id: string): Promise<IcdsRecord | null> {
  const all = await getIcdsRecords()
  return all.find(r => r.id === id || r.awcCode === id) || null
}

export async function createIcdsRecord(input: CreateIcdsInput): Promise<IcdsRecord> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const now = nowTs()
  const year = new Date().getFullYear()
  const existing = await fetchAllIcdsRecordsRaw()
  
  // Check for duplicate AWC Code
  const duplicate = existing.find(r => r.awcCode === input.awcCode.trim())
  if (duplicate) {
    throw new Error(`Anganwadi Center code "${input.awcCode}" already exists (ID: ${duplicate.id})`)
  }

  const seq = String(existing.length + 1).padStart(4, "0")
  const id = `ICDS-${year}-${seq}`

  const newRecord: IcdsRecord = {
    id,
    awcCode: input.awcCode.trim(),
    awcName: input.awcName.trim(),
    blockName: input.blockName.trim(),
    gpName: input.gpName.trim(),
    awcAddress: input.awcAddress?.trim() || "",
    propertyStatus: input.propertyStatus || "OWN_BUILDING",
    awwName: input.awwName?.trim() || "",
    awwMobile: input.awwMobile?.trim() || "",
    cdpoName: input.cdpoName?.trim() || undefined,
    assignedAgency: input.assignedAgency?.trim() || undefined,

    jurisdictionStatus: input.jurisdictionStatus || "UNDER_OFFICE",
    jurisdictionOffice: input.jurisdictionOffice?.trim() || undefined,
    stage: input.stage || "PENDING_INSPECTION",

    meterExists: false,
    infraRequired: false,
    bookletReceived: false,
    equipmentPackageInstalled: false,

    createdAt: now,
    updatedAt: now,
  }

  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ICDS_TAB}!1:1`,
  })
  const headers = (headerResp.data.values?.[0] || []).map(h => String(h ?? "").trim())
  const rowValues = formatRowFromRecord(headers, newRecord)

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${ICDS_TAB}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowValues] },
  })

  invalidateIcdsCache()
  return newRecord
}

function getFlexibleField(row: any, ...keys: string[]): string {
  if (!row || typeof row !== "object") return ""
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return String(row[k]).trim()
    }
  }
  const rowKeys = Object.keys(row)
  for (const k of keys) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "")
    for (const rk of rowKeys) {
      if (rk.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanK) {
        if (row[rk] !== undefined && row[rk] !== null && String(row[rk]).trim() !== "") {
          return String(row[rk]).trim()
        }
      }
    }
  }
  return ""
}

export async function bulkCreateIcdsRecords(inputs: any[]): Promise<{ createdCount: number; errors: string[] }> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const now = nowTs()
  const year = new Date().getFullYear()
  const existing = await fetchAllIcdsRecordsRaw()
  const existingCodes = new Set(existing.map(r => r.awcCode))

  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ICDS_TAB}!1:1`,
  })
  const headers = (headerResp.data.values?.[0] || []).map(h => String(h ?? "").trim())

  const newRows: any[][] = []
  const errors: string[] = []
  let nextSeq = existing.length + 1

  for (const input of inputs) {
    if (!input || typeof input !== "object") continue

    const code = getFlexibleField(input, "awcCode", "AWC Code", "AWC_Code", "AWC CODE", "AWC ID", "Center Code", "Centre Code", "Anganwadi Code", "Code", "AWC NO", "AWC_NO")
    const name = getFlexibleField(input, "awcName", "AWC Name", "AWC_Name", "AWC NAME", "Center Name", "Centre Name", "Anganwadi Name", "Name of AWC", "Name of Center", "Name of Centre", "AWC")
    const block = getFlexibleField(input, "blockName", "Block Name", "Block", "BLOCK", "BLOCK NAME", "Name of Block")
    const gp = getFlexibleField(input, "gpName", "Gram Panchayat", "GP Name", "GP", "G.P.", "GRAM PANCHAYAT", "Name of GP", "Panchayat", "Grampanchayat")
    const address = getFlexibleField(input, "awcAddress", "Address", "Address / Landmark", "Location", "Village", "ADDRESS")
    const property = getFlexibleField(input, "propertyStatus", "Property Status", "Property", "Premises", "Building Type")
    const worker = getFlexibleField(input, "awwName", "AWW Name", "Worker Name", "Worker", "Name of Worker", "AWW", "Anganwadi Worker")
    const mobile = getFlexibleField(input, "awwMobile", "AWW Mobile", "Mobile", "Mobile Number", "Mobile No", "Phone", "Contact", "Contact No", "Worker Phone")
    const cdpo = getFlexibleField(input, "cdpoName", "CDPO Name", "CDPO", "Name of CDPO")
    const agency = getFlexibleField(input, "assignedAgency", "Assigned Agency", "Agency", "Agency Name", "Contractor", "Contractor Name")
    const jurisdiction = getFlexibleField(input, "jurisdictionStatus", "Jurisdiction", "Office Jurisdiction", "CCC", "Customer Care Center")
    const otherOffice = getFlexibleField(input, "jurisdictionOffice", "Other Office", "Other CCC", "Adjacent Office")

    // Automatically ignore blank / trailing rows
    if (!code && !name && !block && !gp && !worker) {
      continue
    }

    if (!code) {
      errors.push(`Row missing AWC Code: ${name || "Unnamed"}`)
      continue
    }

    if (existingCodes.has(code)) {
      errors.push(`Duplicate AWC Code skipped: ${code} (${name || code})`)
      continue
    }

    const id = `ICDS-${year}-${String(nextSeq++).padStart(4, "0")}`
    const record: IcdsRecord = {
      id,
      awcCode: code,
      awcName: name || `AWC ${code}`,
      blockName: block || "Unspecified Block",
      gpName: gp || "Unspecified GP",
      awcAddress: address || "",
      propertyStatus: property || "OWN_BUILDING",
      awwName: worker || "",
      awwMobile: mobile || "",
      cdpoName: cdpo || undefined,
      assignedAgency: agency || undefined,

      jurisdictionStatus: (jurisdiction.toLowerCase().includes("other") ? "OTHER_OFFICE" : "UNDER_OFFICE"),
      jurisdictionOffice: otherOffice || undefined,
      stage: "PENDING_INSPECTION",

      meterExists: false,
      infraRequired: false,
      bookletReceived: false,
      equipmentPackageInstalled: false,

      createdAt: now,
      updatedAt: now,
    }

    existingCodes.add(code)
    newRows.push(formatRowFromRecord(headers, record))
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${ICDS_TAB}!A:A`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: newRows },
    })
    invalidateIcdsCache()
  }

  return { createdCount: newRows.length, errors }
}

export async function updateIcdsRecord(id: string, patch: Partial<IcdsRecord>): Promise<IcdsRecord> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ICDS_TAB}!A1:AZ`,
  })

  const rows = resp.data.values || []
  if (rows.length < 2) throw new Error("ICDS sheet is empty")

  const headers = rows[0].map(h => String(h ?? "").trim())
  const idIdx = findColumn(headers, ["ID"])
  if (idIdx === -1) throw new Error("ID column not found")

  let targetRowIdx = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx] || "").trim() === id.trim()) {
      targetRowIdx = i + 1 // 1-indexed for Google Sheets
      break
    }
  }

  if (targetRowIdx === -1) {
    throw new Error(`ICDS record not found: ${id}`)
  }

  const currentRecord = parseRecordFromRow(headers, rows[targetRowIdx - 1])
  const updatedRecord: IcdsRecord = {
    ...currentRecord,
    ...patch,
    updatedAt: nowTs(),
  }

  const updatedRowValues = formatRowFromRecord(headers, updatedRecord)
  const endCol = colLetter(headers.length - 1)

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${ICDS_TAB}!A${targetRowIdx}:${endCol}${targetRowIdx}`,
    valueInputOption: "RAW",
    requestBody: { values: [updatedRowValues] },
  })

  invalidateIcdsCache()
  return updatedRecord
}

export async function deleteIcdsRecord(id: string): Promise<void> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ICDS_TAB}!A1:AZ`,
  })

  const rows = resp.data.values || []
  const headers = rows[0]?.map(h => String(h ?? "").trim()) || []
  const idIdx = findColumn(headers, ["ID"])
  if (idIdx === -1) return

  let targetRow0Index = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx] || "").trim() === id.trim()) {
      targetRow0Index = i
      break
    }
  }

  if (targetRow0Index === -1) return

  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const matchedSheet = meta.data.sheets?.find(
    s => (s.properties?.title || "").trim().toLowerCase() === ICDS_TAB.toLowerCase()
  )
  const sheetId = matchedSheet?.properties?.sheetId ?? 0

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: targetRow0Index,
              endIndex: targetRow0Index + 1,
            },
          },
        },
      ],
    },
  })

  invalidateIcdsCache()
}

export async function clearAllIcdsRecords(): Promise<number> {
  const spreadsheetId = getSpreadsheetId()
  await initTab(spreadsheetId)

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ICDS_TAB}!A1:AZ`,
  })

  const rows = resp.data.values || []
  if (rows.length <= 1) return 0

  const totalDataRows = rows.length - 1
  const endCol = colLetter(ICDS_HEADERS.length - 1)

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${ICDS_TAB}!A2:${endCol}${rows.length + 10}`,
  })

  invalidateIcdsCache()
  return totalDataRows
}
