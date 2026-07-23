// Server-only — imports @googleapis/sheets. Never import this in "use client" components.
// Client components should import types from lib/meter-types.ts instead.
import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { METER_TYPES } from "./meter-types"
import { updateNSCMeterIssued, updateNSCConnectionEffected, updateNSCMeterReturned } from "./nsc-service"
import { nowDate } from "./date-utils"
import { issueReplacement, syncStatusFromIssue } from "./meter-replacement-service"
import type {
  MeterStock, MeterIssue, StockSummary,
  MeterTypeLabel, MeterCondition, IssuePurpose, IssueStatus,
} from "./meter-types"

// Re-export so API routes only need one import
export { METER_TYPES }
export type { MeterStock, MeterIssue, StockSummary, MeterTypeLabel, MeterCondition, IssuePurpose, IssueStatus }

const sheets = googleSheets({ version: "v4", auth })

// ─── Sheet names ──────────────────────────────────────────────────────────────
export const STOCK_TAB  = "Meter_Stock"
export const ISSUES_TAB = "Meter_Issues"

const STOCK_HEADERS = [
  "Serial No", "Type Label", "Phase", "Ampere", "Smart",
  "Condition", "Received Date", "Batch Remarks", "Last Updated",
]
const ISSUES_HEADERS = [
  "Issue ID", "Issue Date", "Purpose", "Consumer ID", "NSC Receive No",
  "Consumer Name", "Agency", "Serial No", "Meter Type", "Status",
  "Before Image", "After Image", "Last Reading", "New Reading",
  "Completion Ref", "Completed At", "Completed By", "Remarks", "Installation No",
  "Address", "Mobile",
]

// ─── Shared cross-instance cache (Next.js Data Cache) ─────────────────────────
// Read paths use the cached wrappers; write paths use the raw fetch so row
// positions / next IDs are always computed against live data.
const METER_TAG = "meter"
const METER_REVALIDATE_S = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache
let tabsReady = false

export function invalidateMeterCache() { revalidateTag(METER_TAG) }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTabs(id: string) {
  if (tabsReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  const toCreate = [STOCK_TAB, ISSUES_TAB].filter(t => !existing.includes(t))
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: toCreate.map(t => ({ addSheet: { properties: { title: t } } })) },
    })
    for (const tab of toCreate) {
      const headers = tab === STOCK_TAB ? STOCK_HEADERS : ISSUES_HEADERS
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${tab}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      })
    }
  }
  tabsReady = true
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseStock(r: string[]): MeterStock {
  return {
    serialNo:     r[0]  || "",
    typeLabel:    (r[1]  || "") as MeterTypeLabel,
    phase:        r[2]  || "",
    ampere:       r[3]  || "",
    smart:        (r[4]  || "").toLowerCase() === "yes",
    condition:    (r[5]  || "available") as MeterCondition,
    receivedDate: r[6]  || "",
    batchRemarks: r[7]  || "",
    lastUpdated:  r[8]  || "",
  }
}
function parseIssue(r: string[]): MeterIssue {
  return {
    issueId:       r[0]  || "",
    issueDate:     r[1]  || "",
    purpose:       (r[2]  || "faulty_replacement") as IssuePurpose,
    consumerId:    r[3]  || "",
    nscReceiveNo:  r[4]  || "",
    consumerName:  r[5]  || "",
    agency:        r[6]  || "",
    serialNo:      r[7]  || "",
    meterType:     r[8]  || "",
    status:        (r[9]  || "issued") as IssueStatus,
    beforeImage:   r[10] || "",
    afterImage:    r[11] || "",
    lastReading:   r[12] || "",
    newReading:    r[13] || "",
    completionRef:  r[14] || "",
    completedAt:    r[15] || "",
    completedBy:    r[16] || "",
    remarks:        r[17] || "",
    installationNo: r[18] || "",
    address:        r[19] || "",
    mobile:         r[20] || "",
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────
export async function _fetchStockRaw(spreadsheetId: string): Promise<MeterStock[]> {
  await ensureTabs(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${STOCK_TAB}!A:I` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseStock(r.map(String)))
}

export async function _fetchIssuesRaw(spreadsheetId: string): Promise<MeterIssue[]> {
  await ensureTabs(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ISSUES_TAB}!A:U` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseIssue(r.map(String)))
}

export const fetchStock = (spreadsheetId: string) => unstable_cache(
  async () => _fetchStockRaw(spreadsheetId),
  ["meter-stock", spreadsheetId],
  { revalidate: METER_REVALIDATE_S, tags: [METER_TAG] },
)()

export const fetchIssues = (spreadsheetId: string) => unstable_cache(
  async () => _fetchIssuesRaw(spreadsheetId),
  ["meter-issues", spreadsheetId],
  { revalidate: METER_REVALIDATE_S, tags: [METER_TAG] },
)()

// ─── Stock summary ────────────────────────────────────────────────────────────
export async function getStockSummary(spreadsheetId: string): Promise<StockSummary[]> {
  const all = await fetchStock(spreadsheetId)
  return METER_TYPES.map(t => {
    const rows = all.filter(m => m.typeLabel === t.label)
    return {
      label:     t.label,
      available: rows.filter(m => m.condition === "available").length,
      issued:    rows.filter(m => m.condition === "issued").length,
      installed: rows.filter(m => m.condition === "installed").length,
      faulty:    rows.filter(m => m.condition === "faulty").length,
      total:     rows.length,
    }
  })
}

// ─── Add stock ────────────────────────────────────────────────────────────────
export async function addMeterStock(meters: Array<{
  serialNo:     string
  typeLabel:    MeterTypeLabel
  batchRemarks?: string
}>): Promise<number> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const typeMap = new Map(METER_TYPES.map(t => [t.label, t]))
  const today = nowDate()
  const rows = meters.map(m => {
    const t = typeMap.get(m.typeLabel)!
    return [m.serialNo, m.typeLabel, t.phase, t.ampere, t.smart ? "yes" : "no", "available", today, m.batchRemarks || "", today]
  })
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${STOCK_TAB}!A:I`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })
  invalidateMeterCache()
  return rows.length
}

// ─── Next Issue ID ────────────────────────────────────────────────────────────
async function nextIssueId(id: string): Promise<string> {
  const all = await _fetchIssuesRaw(id)
  const max = all.reduce((m, i) => {
    const n = parseInt(i.issueId.replace("MI-", ""), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `MI-${String(max + 1).padStart(4, "0")}`
}

// ─── Issue meter ──────────────────────────────────────────────────────────────
export async function issueMeter(req: {
  serialNo:     string
  purpose:      IssuePurpose
  consumerId:   string
  nscReceiveNo?: string
  consumerName: string
  agency:       string
  remarks?:     string
  address?:     string
  mobile?:      string
  replacementId?: string
}): Promise<string> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const stock = await _fetchStockRaw(id)
  const idx = stock.findIndex(m => m.serialNo === req.serialNo)
  if (idx === -1) throw new Error("Serial number not found in stock")
  if (stock[idx].condition !== "available") throw new Error("Meter is not available")
  const issueId = await nextIssueId(id)
  const today = nowDate()
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${ISSUES_TAB}!A:U`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[issueId, today, req.purpose, req.consumerId, req.nscReceiveNo || "",
        req.consumerName, req.agency, req.serialNo, stock[idx].typeLabel, "issued",
        "", "", "", "", "", "", "", req.remarks || "", "", req.address || "", req.mobile || ""]],
    },
  })
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${STOCK_TAB}!F${idx + 2}`, values: [["issued"]] },
        { range: `${STOCK_TAB}!I${idx + 2}`, values: [[today]] },
      ],
    },
  })
  invalidateMeterCache()
  if (req.purpose === "nsc" && req.nscReceiveNo) {
    await updateNSCMeterIssued(req.nscReceiveNo, req.serialNo, req.agency)
  }
  if (req.replacementId) {
    await issueReplacement(req.replacementId, req.serialNo, issueId)
  }
  return issueId
}

// ─── Agency: mark installation done (no completionRef yet) ───────────────────
export async function completeMeterInstallation(req: {
  issueId:          string
  afterImage:       string
  beforeImage?:      string
  lastReading?:      string
  newReading?:       string
  completedBy:       string
  remarks?:          string
  installationDate?: string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const issues = await _fetchIssuesRaw(id)
  const issueIdx = issues.findIndex(i => i.issueId === req.issueId)
  if (issueIdx === -1) throw new Error("Issue not found")
  const row = issueIdx + 2
  const now = req.installationDate || nowDate()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${ISSUES_TAB}!J${row}`, values: [["installation_done"]] },
        { range: `${ISSUES_TAB}!K${row}`, values: [[req.beforeImage || ""]] },
        { range: `${ISSUES_TAB}!L${row}`, values: [[req.afterImage]] },
        { range: `${ISSUES_TAB}!M${row}`, values: [[req.lastReading || ""]] },
        { range: `${ISSUES_TAB}!N${row}`, values: [[req.newReading || ""]] },
        { range: `${ISSUES_TAB}!P${row}`, values: [[now]] },
        { range: `${ISSUES_TAB}!Q${row}`, values: [[req.completedBy]] },
        { range: `${ISSUES_TAB}!R${row}`, values: [[req.remarks || ""]] },
      ],
    },
  })
  invalidateMeterCache()
  await syncStatusFromIssue(req.issueId, "installation_done")
}

// ─── Admin/Executive: finalize with completionRef ────────────────────────────
export async function finalizeMeterInstallation(req: {
  issueId:        string
  completionRef:  string
  installationNo?: string
  finalizedBy:    string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const issues = await _fetchIssuesRaw(id)
  const issueIdx = issues.findIndex(i => i.issueId === req.issueId)
  if (issueIdx === -1) throw new Error("Issue not found")
  const issue = issues[issueIdx]
  const row = issueIdx + 2
  const now = nowDate()
  const updates: any[] = [
    { range: `${ISSUES_TAB}!J${row}`, values: [["installed"]] },
    { range: `${ISSUES_TAB}!O${row}`, values: [[req.completionRef]] },
    { range: `${ISSUES_TAB}!Q${row}`, values: [[req.finalizedBy]] },
  ]
  // Preserve original installation date if recorded; otherwise populate with now
  if (!issue.completedAt) {
    updates.push({ range: `${ISSUES_TAB}!P${row}`, values: [[now]] })
  }
  if (req.installationNo) {
    updates.push({ range: `${ISSUES_TAB}!S${row}`, values: [[req.installationNo]] })
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data: updates },
  })
  // Mark stock as installed
  const stock = await _fetchStockRaw(id)
  const si = stock.findIndex(m => m.serialNo === issue.serialNo)
  if (si !== -1) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${STOCK_TAB}!F${si + 2}`, values: [["installed"]] },
          { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
        ],
      },
    })
  }
  invalidateMeterCache()
  if (issue.purpose === "nsc" && issue.nscReceiveNo) {
    await updateNSCConnectionEffected(issue.nscReceiveNo)
  }
  await syncStatusFromIssue(req.issueId, "installed", req.completionRef)
}

// ─── Bulk finalize: one fetch, two batchUpdates total ────────────────────────
export async function bulkFinalizeMeterInstallations(req: {
  issueIds:        string[]
  completionRef:   string
  installationNo?: string
  finalizedBy:     string
}): Promise<{ succeeded: number; failed: string[] }> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const [issues, stock] = await Promise.all([_fetchIssuesRaw(id), _fetchStockRaw(id)])
  const now = nowDate()

  const issueUpdates: { range: string; values: any[][] }[] = []
  const stockUpdates: { range: string; values: any[][] }[] = []
  const failed: string[] = []
  const nscReceiveNos: string[] = []

  for (const issueId of req.issueIds) {
    const issueIdx = issues.findIndex(i => i.issueId === issueId)
    if (issueIdx === -1) { failed.push(issueId); continue }
    const issue = issues[issueIdx]
    const row = issueIdx + 2
    issueUpdates.push(
      { range: `${ISSUES_TAB}!J${row}`, values: [["installed"]] },
      { range: `${ISSUES_TAB}!O${row}`, values: [[req.completionRef]] },
      { range: `${ISSUES_TAB}!Q${row}`, values: [[req.finalizedBy]] },
    )
    // Preserve original installation date if recorded; otherwise populate with now
    if (!issue.completedAt) {
      issueUpdates.push({ range: `${ISSUES_TAB}!P${row}`, values: [[now]] })
    }
    if (req.installationNo) {
      issueUpdates.push({ range: `${ISSUES_TAB}!S${row}`, values: [[req.installationNo]] })
    }
    const si = stock.findIndex(m => m.serialNo === issue.serialNo)
    if (si !== -1) {
      stockUpdates.push(
        { range: `${STOCK_TAB}!F${si + 2}`, values: [["installed"]] },
        { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
      )
    }
    if (issue.purpose === "nsc" && issue.nscReceiveNo) {
      nscReceiveNos.push(issue.nscReceiveNo)
    }
  }

  if (issueUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: issueUpdates },
    })
  }
  if (stockUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: stockUpdates },
    })
  }
  invalidateMeterCache()
  if (nscReceiveNos.length > 0) {
    await Promise.all(nscReceiveNos.map(rcvNo => updateNSCConnectionEffected(rcvNo)))
  }
  await Promise.all(req.issueIds.map(issueId => syncStatusFromIssue(issueId, "installed", req.completionRef)))
  return { succeeded: req.issueIds.length - failed.length, failed }
}

// ─── Return to stock ──────────────────────────────────────────────────────────
export async function returnMeterToStock(req: {
  issueId: string
  remarks: string
  faulty:  boolean
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const issues = await _fetchIssuesRaw(id)
  const issueIdx = issues.findIndex(i => i.issueId === req.issueId)
  if (issueIdx === -1) throw new Error("Issue not found")
  const issue = issues[issueIdx]
  const row = issueIdx + 2
  const now = nowDate()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${ISSUES_TAB}!J${row}`, values: [["returned"]] },
        { range: `${ISSUES_TAB}!R${row}`, values: [[req.remarks]] },
        { range: `${ISSUES_TAB}!P${row}`, values: [[now]] },
      ],
    },
  })
  const stock = await _fetchStockRaw(id)
  const si = stock.findIndex(m => m.serialNo === issue.serialNo)
  if (si !== -1) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${STOCK_TAB}!F${si + 2}`, values: [[req.faulty ? "faulty" : "available"]] },
          { range: `${STOCK_TAB}!H${si + 2}`, values: [[req.remarks]] },
          { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
        ],
      },
    })
  }
  invalidateMeterCache()
  if (issue.purpose === "nsc" && issue.nscReceiveNo) {
    await updateNSCMeterReturned(issue.nscReceiveNo)
  }
  await syncStatusFromIssue(req.issueId, "returned")
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function expandSerialRange(prefix: string, start: string, end: string): string[] {
  const s = parseInt(start, 10), e = parseInt(end, 10)
  if (isNaN(s) || isNaN(e) || e < s) return []
  const pad = Math.max(start.length, end.length)
  const result: string[] = []
  for (let i = s; i <= e; i++) result.push(prefix + String(i).padStart(pad, "0"))
  return result
}
