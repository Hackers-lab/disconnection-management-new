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
  status: "proposed" | "issued" | "updated" | "replaced" | "closed"
  serialNo: string
  issueId: string
  remarks: string
  attachmentUrl: string
  oldMeterNo?: string
  workOrderNo?: string
  noteSheetNo?: string
  closedRemarks?: string
  oldMeterReturnStatus?: "pending" | "returned" | "overdue"
  oldMeterReturnDate?: string
  oldMeterReturnReceivedBy?: string
  oldMeterReturnCondition?: "working" | "faulty" | "burnt"
  oldMeterReturnRemarks?: string
}

const sheets = googleSheets({ version: "v4", auth: auth as any })

export const REPLACEMENT_TAB = "Meter_Replacement"

const REPLACEMENT_HEADERS = [
  "Replacement ID", "Consumer ID", "Consumer Name", "Address", "Mobile",
  "Agency", "Purpose", "Proposed Date", "Status", "Serial No", "Issue ID", "Remarks", "Attachment URL",
  "Old Meter No", "Work Order No", "Note Sheet No", "Closed Remarks",
  "Old Meter Return Status", "Old Meter Return Date", "Old Meter Return Received By", "Old Meter Return Condition", "Old Meter Return Remarks"
]

const REPLACEMENT_TAG = "meter-replacement"
const REVAL_S = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache
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
      range: `${REPLACEMENT_TAB}!A1:V1`
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
    noteSheetNo:   r[15] || "",
    closedRemarks: r[16] || "",
    oldMeterReturnStatus:     (r[17] || "") as any,
    oldMeterReturnDate:       r[18] || "",
    oldMeterReturnReceivedBy: r[19] || "",
    oldMeterReturnCondition:  (r[20] || "") as any,
    oldMeterReturnRemarks:    r[21] || "",
  }
}

export async function _fetchReplacementsRaw(spreadsheetId: string): Promise<MeterReplacement[]> {
  await ensureReplacementTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${REPLACEMENT_TAB}!A:V`
  })
  return (res.data.values || [])
    .slice(1)
    .filter(r => r[0])
    .map(r => parseReplacement(r.map(String)))
}

export const fetchReplacements = unstable_cache(
  async (spreadsheetId: string) => _fetchReplacementsRaw(spreadsheetId),
  ["meter-replacements"],
  { revalidate: REVAL_S, tags: [REPLACEMENT_TAG] }
)

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
    const currentRec = all[idx]
    const existingWO = (currentRec.workOrderNo || completionRef || "").trim()
    if (existingWO) {
      mappedStatus = "replaced"
      updates.push(
        { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[mappedStatus]] },
        { range: `${REPLACEMENT_TAB}!O${rowNum}`, values: [[existingWO]] }
      )
    } else {
      mappedStatus = "updated"
      updates.push({ range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[mappedStatus]] })
    }
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

export async function syncOldMeterReturnToReplacement(
  issueId: string,
  returnDate: string,
  receivedBy: string,
  condition: "working" | "faulty" | "burnt",
  remarks?: string
): Promise<void> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const idx = all.findIndex(r => r.issueId === issueId)
  if (idx === -1) return // Not linked to any proposed replacement
  const rowNum = idx + 2

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${REPLACEMENT_TAB}!R${rowNum}`, values: [["returned"]] },
        { range: `${REPLACEMENT_TAB}!S${rowNum}`, values: [[returnDate]] },
        { range: `${REPLACEMENT_TAB}!T${rowNum}`, values: [[receivedBy]] },
        { range: `${REPLACEMENT_TAB}!U${rowNum}`, values: [[condition]] },
        { range: `${REPLACEMENT_TAB}!V${rowNum}`, values: [[remarks || ""]] },
      ]
    }
  })
  invalidateReplacementCache()
}

export async function closeReplacement(replacementId: string, remarks: string): Promise<void> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const idx = all.findIndex(r => r.replacementId === replacementId)
  if (idx === -1) throw new Error("Replacement record not found")
  const rec = all[idx]
  const rowNum = idx + 2
  const now = nowDate()

  const updates: Array<{ range: string; values: any[][] }> = [
    { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [["closed"]] },
    { range: `${REPLACEMENT_TAB}!Q${rowNum}`, values: [[remarks]] },
  ]

  // If a meter was issued to this replacement, free it in stock and mark issue returned
  if (rec.serialNo || rec.issueId) {
    try {
      const { STOCK_TAB, ISSUES_TAB, _fetchStockRaw, _fetchIssuesRaw, invalidateMeterCache } = await import("./meter-service")
      const [stock, issues] = await Promise.all([_fetchStockRaw(id), _fetchIssuesRaw(id)])

      // 1. Release Stock to "available"
      if (rec.serialNo) {
        const si = stock.findIndex(m => m.serialNo.toUpperCase() === rec.serialNo.toUpperCase())
        if (si !== -1) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: id,
            requestBody: {
              valueInputOption: "RAW",
              data: [
                { range: `${STOCK_TAB}!F${si + 2}`, values: [["available"]] },
                { range: `${STOCK_TAB}!H${si + 2}`, values: [[`Freed upon cancellation of proposal ${replacementId}: ${remarks}`]] },
                { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
              ]
            }
          })
        }
      }

      // 2. Mark issue record as returned / cancelled
      if (rec.issueId) {
        const ii = issues.findIndex(i => i.issueId === rec.issueId)
        if (ii !== -1) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: id,
            requestBody: {
              valueInputOption: "RAW",
              data: [
                { range: `${ISSUES_TAB}!J${ii + 2}`, values: [["returned"]] },
                { range: `${ISSUES_TAB}!R${ii + 2}`, values: [[`Proposal ${replacementId} closed/cancelled: ${remarks}`]] },
                { range: `${ISSUES_TAB}!P${ii + 2}`, values: [[now]] },
              ]
            }
          })
        }
      }

      invalidateMeterCache()
    } catch (stockErr) {
      console.error("Error freeing meter in stock on closeReplacement:", stockErr)
    }
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: updates
    }
  })
  invalidateReplacementCache()
}

export async function closeBulkReplacements(
  replacementIds: string[],
  remarks: string
): Promise<{ closedCount: number; freedMetersCount: number }> {
  if (replacementIds.length === 0) return { closedCount: 0, freedMetersCount: 0 }
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const now = nowDate()

  const repUpdates: Array<{ range: string; values: any[][] }> = []
  const serialsToFree = new Set<string>()
  const issueIdsToReturn = new Set<string>()
  let closedCount = 0

  for (const repId of replacementIds) {
    const idx = all.findIndex(r => r.replacementId === repId)
    if (idx === -1) continue
    const rec = all[idx]
    const rowNum = idx + 2
    repUpdates.push(
      { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [["closed"]] },
      { range: `${REPLACEMENT_TAB}!Q${rowNum}`, values: [[remarks]] }
    )
    closedCount++

    if (rec.serialNo) serialsToFree.add(rec.serialNo.toUpperCase().trim())
    if (rec.issueId) issueIdsToReturn.add(rec.issueId.trim())
  }

  if (repUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: repUpdates }
    })
    invalidateReplacementCache()
  }

  // Free meters in stock
  let freedMetersCount = 0
  if (serialsToFree.size > 0 || issueIdsToReturn.size > 0) {
    try {
      const { STOCK_TAB, ISSUES_TAB, _fetchStockRaw, _fetchIssuesRaw, invalidateMeterCache } = await import("./meter-service")
      const [stock, issues] = await Promise.all([_fetchStockRaw(id), _fetchIssuesRaw(id)])

      const stockUpdates: Array<{ range: string; values: any[][] }> = []
      for (const serial of serialsToFree) {
        const si = stock.findIndex(m => m.serialNo.toUpperCase().trim() === serial)
        if (si !== -1) {
          stockUpdates.push(
            { range: `${STOCK_TAB}!F${si + 2}`, values: [["available"]] },
            { range: `${STOCK_TAB}!H${si + 2}`, values: [[`Freed via bulk cancellation: ${remarks}`]] },
            { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] }
          )
          freedMetersCount++
        }
      }

      const issueUpdates: Array<{ range: string; values: any[][] }> = []
      for (const issueId of issueIdsToReturn) {
        const ii = issues.findIndex(i => i.issueId.trim() === issueId)
        if (ii !== -1) {
          issueUpdates.push(
            { range: `${ISSUES_TAB}!J${ii + 2}`, values: [["returned"]] },
            { range: `${ISSUES_TAB}!R${ii + 2}`, values: [[`Bulk proposal closed/cancelled: ${remarks}`]] },
            { range: `${ISSUES_TAB}!P${ii + 2}`, values: [[now]] }
          )
        }
      }

      if (stockUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: id,
          requestBody: { valueInputOption: "RAW", data: stockUpdates }
        })
      }
      if (issueUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: id,
          requestBody: { valueInputOption: "RAW", data: issueUpdates }
        })
      }
      invalidateMeterCache()
    } catch (err) {
      console.error("Error freeing bulk meters in stock:", err)
    }
  }

  return { closedCount, freedMetersCount }
}

export async function updateBulkPurpose(
  replacementIds: string[],
  newPurpose: "faulty_replacement" | "burnt_replacement" | "slow_fast"
): Promise<{ updatedCount: number }> {
  if (replacementIds.length === 0) return { updatedCount: 0 }
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)

  const updates: Array<{ range: string; values: any[][] }> = []
  const linkedIssueIds: string[] = []
  let updatedCount = 0

  for (const repId of replacementIds) {
    const idx = all.findIndex(r => r.replacementId === repId)
    if (idx === -1) continue
    const rec = all[idx]
    const rowNum = idx + 2
    updates.push({ range: `${REPLACEMENT_TAB}!G${rowNum}`, values: [[newPurpose]] })
    updatedCount++
    if (rec.issueId) {
      linkedIssueIds.push(rec.issueId)
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: updates }
    })
    invalidateReplacementCache()
  }

  // Also update linked Meter_Issues purpose if already issued
  if (linkedIssueIds.length > 0) {
    try {
      const { ISSUES_TAB, _fetchIssuesRaw, invalidateMeterCache } = await import("./meter-service")
      const issues = await _fetchIssuesRaw(id)
      const issueUpdates: Array<{ range: string; values: any[][] }> = []
      for (const issId of linkedIssueIds) {
        const ii = issues.findIndex(i => i.issueId === issId)
        if (ii !== -1) {
          issueUpdates.push({ range: `${ISSUES_TAB}!C${ii + 2}`, values: [[newPurpose]] })
        }
      }
      if (issueUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: id,
          requestBody: { valueInputOption: "RAW", data: issueUpdates }
        })
        invalidateMeterCache()
      }
    } catch (err) {
      console.error("Error syncing purpose to Meter_Issues:", err)
    }
  }

  return { updatedCount }
}

export async function completeBulkReplacementsFromExcel(rows: Array<{
  replacementId?: string
  consumerId?: string
  serialNo?: string
  lastReading?: string
  newReading?: string
  installationDate?: string
  workOrderNo?: string
  noteSheetNo?: string
  remarks?: string
  completedBy: string
}>): Promise<{ succeeded: number; failed: Array<{ identifier: string; reason: string }> }> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const { STOCK_TAB, ISSUES_TAB, _fetchStockRaw, _fetchIssuesRaw, issueMeter, completeMeterInstallation, finalizeMeterInstallation, invalidateMeterCache } = await import("./meter-service")
  
  const [stock, issues] = await Promise.all([_fetchStockRaw(id), _fetchIssuesRaw(id)])
  const today = nowDate()
  let succeeded = 0
  const failed: Array<{ identifier: string; reason: string }> = []

  for (const row of rows) {
    const repId = (row.replacementId || "").trim()
    const consId = (row.consumerId || "").trim()
    const serial = (row.serialNo || "").trim()

    // Find proposal by Replacement ID or Consumer ID
    const idx = all.findIndex(r => (repId && r.replacementId === repId) || (consId && r.consumerId === consId))
    if (idx === -1) {
      failed.push({ identifier: repId || consId, reason: "Proposal record not found" })
      continue
    }

    const rec = all[idx]
    const rowNum = idx + 2
    const targetSerial = serial || rec.serialNo
    if (!targetSerial) {
      failed.push({ identifier: rec.replacementId, reason: "New meter serial number is missing" })
      continue
    }

    try {
      let activeIssueId = rec.issueId

      // Case A: Proposal is still 'proposed' (meter was not yet issued through UI)
      if (rec.status === "proposed" || !activeIssueId) {
        // Find meter in stock
        const sIdx = stock.findIndex(m => m.serialNo.toUpperCase() === targetSerial.toUpperCase())
        if (sIdx === -1) {
          failed.push({ identifier: rec.replacementId, reason: `Serial ${targetSerial} not found in Meter Stock` })
          continue
        }
        if (stock[sIdx].condition !== "available" && stock[sIdx].condition !== "issued") {
          failed.push({ identifier: rec.replacementId, reason: `Serial ${targetSerial} is ${stock[sIdx].condition} in Stock` })
          continue
        }

        activeIssueId = await issueMeter({
          serialNo: targetSerial,
          purpose: (rec.purpose as any) || "faulty_replacement",
          consumerId: rec.consumerId,
          consumerName: rec.consumerName,
          agency: rec.agency,
          remarks: row.remarks || rec.remarks || "Bulk completed via Excel",
          address: rec.address,
          mobile: rec.mobile,
          replacementId: rec.replacementId,
          workOrderNo: row.workOrderNo || rec.workOrderNo,
          existingMeterNo: rec.oldMeterNo,
        })
      }

      // Case B: Mark installation done
      const installDate = row.installationDate || today
      await completeMeterInstallation({
        issueId: activeIssueId,
        afterImage: "",
        beforeImage: "",
        lastReading: row.lastReading || "",
        newReading: row.newReading || "",
        completedBy: row.completedBy,
        remarks: row.remarks || "Bulk completed via Excel",
        installationDate: installDate,
      })

      // Case C: If work order or note sheet is provided, finalize installation directly
      if (row.workOrderNo || row.noteSheetNo) {
        await finalizeMeterInstallation({
          issueId: activeIssueId,
          completionRef: row.workOrderNo || "",
          finalizedBy: row.completedBy,
        })
      }

      // Update Meter_Replacement sheet row
      const repUpdates: Array<{ range: string; values: any[][] }> = [
        { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[row.workOrderNo ? "replaced" : "updated"]] },
        { range: `${REPLACEMENT_TAB}!J${rowNum}`, values: [[targetSerial]] },
        { range: `${REPLACEMENT_TAB}!K${rowNum}`, values: [[activeIssueId]] },
      ]
      if (row.workOrderNo) {
        repUpdates.push({ range: `${REPLACEMENT_TAB}!O${rowNum}`, values: [[row.workOrderNo]] })
      }
      if (row.noteSheetNo) {
        repUpdates.push({ range: `${REPLACEMENT_TAB}!P${rowNum}`, values: [[row.noteSheetNo]] })
      }
      if (row.remarks) {
        repUpdates.push({ range: `${REPLACEMENT_TAB}!L${rowNum}`, values: [[row.remarks]] })
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: id,
        requestBody: { valueInputOption: "RAW", data: repUpdates }
      })

      succeeded++
    } catch (err: any) {
      failed.push({ identifier: rec.replacementId, reason: err.message || "Failed to complete" })
    }
  }

  invalidateReplacementCache()
  invalidateMeterCache()
  return { succeeded, failed }
}

export async function updateReplacementNoteSheet(replacementId: string, noteSheetNo: string): Promise<void> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const idx = all.findIndex(r => r.replacementId === replacementId || r.issueId === replacementId)
  if (idx === -1) throw new Error("Replacement record not found")
  const rowNum = idx + 2
  const rec = all[idx]

  // Update status to 'replaced' if work order exists or status was updated/replaced
  const newStatus = (rec.workOrderNo || rec.status === "updated" || rec.status === "replaced") ? "replaced" : rec.status

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${REPLACEMENT_TAB}!P${rowNum}`, values: [[noteSheetNo]] },
        { range: `${REPLACEMENT_TAB}!I${rowNum}`, values: [[newStatus]] },
      ]
    }
  })
  invalidateReplacementCache()
}

export async function reassignAgency(replacementId: string, agency: string): Promise<void> {
  const id = getSpreadsheetId()
  await ensureReplacementTab(id)
  const all = await _fetchReplacementsRaw(id)
  const idx = all.findIndex(r => r.replacementId === replacementId)
  if (idx === -1) throw new Error("Replacement record not found")
  const rowNum = idx + 2

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${REPLACEMENT_TAB}!F${rowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [[agency]] }
  })
  invalidateReplacementCache()
}

