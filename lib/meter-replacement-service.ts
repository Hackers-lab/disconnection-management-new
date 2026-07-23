import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { nowDate } from "./date-utils"

export interface MeterReplacement {
  replacementId: string
  consumerId: string
  consumerName: string
  address: string
  mobile: string
  agency: string
  purpose: string
  proposedDate: string
  status: "proposed" | "issued" | "updated" | "replaced"
  serialNo: string
  issueId: string
  remarks: string
  attachmentUrl: string
  oldMeterNo?: string
  workOrderNo?: string
}

const sheets = googleSheets({ version: "v4", auth })

export const REPLACEMENT_TAB = "Meter_Replacement"

const REPLACEMENT_HEADERS = [
  "Replacement ID", "Consumer ID", "Consumer Name", "Address", "Mobile",
  "Agency", "Purpose", "Proposed Date", "Status", "Serial No", "Issue ID", "Remarks", "Attachment URL",
  "Old Meter No", "Work Order No"
]

const REPLACEMENT_TAG = "meter-replacement"
const REVAL_S = 10 // 10 seconds TTL for fast sync
let tabReady = false

export function invalidateReplacementCache() {
  revalidateTag(REPLACEMENT_TAG)
}

async function ensureReplacementTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  if (!existing.includes(REPLACEMENT_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{ addSheet: { properties: { title: REPLACEMENT_TAB } } }]
      }
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${REPLACEMENT_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [REPLACEMENT_HEADERS] }
    })
  } else {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${REPLACEMENT_TAB}!A1:O1`
    })
    const currentHeaders = res.data.values?.[0] || []
    if (currentHeaders.length < REPLACEMENT_HEADERS.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${REPLACEMENT_TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [REPLACEMENT_HEADERS] }
      })
    }
  }
  tabReady = true
}

function parseReplacement(r: string[]): MeterReplacement {
  return {
    replacementId: r[0] || "",
    consumerId:    r[1] || "",
    consumerName:  r[2] || "",
    address:       r[3] || "",
    mobile:        r[4] || "",
    agency:        r[5] || "",
    purpose:       r[6] || "",
    proposedDate:  r[7] || "",
    status:        ((r[8] || "proposed").toLowerCase()) as any,
    serialNo:      r[9] || "",
    issueId:       r[10] || "",
    remarks:       r[11] || "",
    attachmentUrl: r[12] || "",
    oldMeterNo:    r[13] || "",
    workOrderNo:   r[14] || "",
  }
}

export async function _fetchReplacementsRaw(spreadsheetId: string): Promise<MeterReplacement[]> {
  await ensureReplacementTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${REPLACEMENT_TAB}!A:O`
  })
  return (res.data.values || [])
    .slice(1)
    .filter(r => r[0])
    .map(r => parseReplacement(r.map(String)))
}

export const fetchReplacements = (spreadsheetId: string) => unstable_cache(
  async () => _fetchReplacementsRaw(spreadsheetId),
  ["meter-replacements", spreadsheetId],
  { revalidate: REVAL_S, tags: [REPLACEMENT_TAG] }
)()

async function nextReplacementId(id: string): Promise<string> {
  const all = await _fetchReplacementsRaw(id)
  const max = all.reduce((m, r) => {
    const n = parseInt(r.replacementId.replace("MR-", ""), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `MR-${String(max + 1).padStart(4, "0")}`
}

export async function addReplacement(req: {
  consumerId: string
  consumerName: string
  address: string
  mobile?: string
  agency?: string
  purpose: string
  remarks?: string
  attachmentUrl?: string
  oldMeterNo?: string
}): Promise<string> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const replacementId = await nextReplacementId(id)
  const today = nowDate()
  const row = [
    replacementId,
    req.consumerId,
    req.consumerName,
    req.address,
    req.mobile || "",
    req.agency || "",
    req.purpose,
    today,
    "proposed",
    "", // serialNo
    "", // issueId
    req.remarks || "",
    req.attachmentUrl || "",
    req.oldMeterNo || "",
    "" // workOrderNo
  ]
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${REPLACEMENT_TAB}!A:O`,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  })
  invalidateReplacementCache()
  return replacementId
}

export async function addBulkReplacements(items: Array<{
  consumerId: string
  consumerName: string
  address: string
  mobile?: string
  agency?: string
  purpose: string
  remarks?: string
  attachmentUrl?: string
  oldMeterNo?: string
}>): Promise<{ added: number }> {
  if (items.length === 0) return { added: 0 }
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  
  const all = await _fetchReplacementsRaw(id)
  let max = all.reduce((m, r) => {
    const n = parseInt(r.replacementId.replace("MR-", ""), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)

  const today = nowDate()
  const rows = items.map(item => {
    max += 1
    const replacementId = `MR-${String(max).padStart(4, "0")}`
    return [
      replacementId,
      item.consumerId || "000000000",
      item.consumerName || "",
      item.address || "",
      item.mobile || "",
      item.agency || "",
      item.purpose || "faulty_replacement",
      today,
      "proposed",
      "", // serialNo
      "", // issueId
      item.remarks || "",
      item.attachmentUrl || "",
      item.oldMeterNo || "",
      "" // workOrderNo
    ]
  })

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${REPLACEMENT_TAB}!A:O`,
    valueInputOption: "RAW",
    requestBody: { values: rows }
  })
  invalidateReplacementCache()
  return { added: items.length }
}

export async function issueReplacement(
  replacementId: string,
  serialNo: string,
  issueId: string
): Promise<void> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const idx = all.findIndex(r => r.replacementId === replacementId)
  if (idx === -1) throw new Error("Replacement record not found")
  const rowNum = idx + 2
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [["issued"]] },
        { range: `${REPLACEMENT_TAB}!J${rowNum}`, values: [[serialNo]] },
        { range: `${REPLACEMENT_TAB}!K${rowNum}`, values: [[issueId]] },
      ]
    }
  })
  invalidateReplacementCache()
}

export async function syncStatusFromIssue(
  issueId: string,
  newStatus: "installation_done" | "installed" | "returned",
  completionRef?: string
): Promise<void> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const idx = all.findIndex(r => r.issueId === issueId)
  if (idx === -1) return // Not linked to any proposed replacement

  const rowNum = idx + 2
  let mappedStatus = "proposed"
  let updates = []

  if (newStatus === "installation_done") {
    mappedStatus = "updated"
    updates.push({ range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[mappedStatus]] })
  } else if (newStatus === "installed") {
    mappedStatus = "replaced"
    updates.push(
      { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[mappedStatus]] },
      { range: `${REPLACEMENT_TAB}!O${rowNum}`, values: [[completionRef || ""]] }
    )
  } else if (newStatus === "returned") {
    // Reset back to proposed
    mappedStatus = "proposed"
    updates.push(
      { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[mappedStatus]] },
      { range: `${REPLACEMENT_TAB}!J${rowNum}`, values: [[""]] },
      { range: `${REPLACEMENT_TAB}!K${rowNum}`, values: [[""]] },
      { range: `${REPLACEMENT_TAB}!O${rowNum}`, values: [[""]] }
    )
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: updates
      }
    })
    invalidateReplacementCache()
  }
}
