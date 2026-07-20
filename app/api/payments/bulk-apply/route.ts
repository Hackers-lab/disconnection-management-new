import { NextResponse, type NextRequest } from "next/server"
import { sheets as googleSheets, type sheets_v4 } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import {
  ensureHeaders,
  findColumn,
  colLetter,
  getSpreadsheetId,
  getSheetName,
} from "@/lib/google-sheets-api"
import { EXPECTED_CONSUMER_HEADERS, invalidateConsumerCache } from "@/lib/google-sheets"
import { appendHistory, nowTimestamp, invalidateHistoryCache } from "@/lib/consumer-history"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"

export const maxDuration = 60

type PaymentRow = {
  consumerId: string
  paidAmount: number
  paidDate: string // YYYY-MM-DD or DD-MM-YYYY (passthrough)
}

type BulkPaymentRequest = {
  source: "Cash Desk" | "Portal" | string
  // Default next-payment-date = paidDate + 30 days when client didn't override.
  defaultNextPaymentOffsetDays?: number
  payments: PaymentRow[]
}

const sheets = googleSheets({ version: "v4", auth })

// Parse a date string of DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY etc. into a Date.
function parseFlexDate(dateStr: string): Date | null {
  if (!dateStr) return null
  let d: Date | null = null
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) d = new Date(dateStr)
  else if (/^\d{2}-\d{2}-\d{4}/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split("-")
    d = new Date(`${yyyy}-${mm}-${dd}`)
  } else {
    const parsed = new Date(dateStr)
    if (!isNaN(parsed.getTime())) d = parsed
  }
  return d && !isNaN(d.getTime()) ? d : null
}

// Add N days to a flexible date string. Returns DD-MM-YYYY (the app's display format).
function addDays(dateStr: string, days: number): string {
  const d = parseFlexDate(dateStr)
  if (!d) return ""
  d.setDate(d.getDate() + days)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}-${mm}-${d.getFullYear()}`
}

const cleanNumber = (s: string): number => {
  const n = parseFloat(String(s ?? "").replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, ""))
  return isNaN(n) ? 0 : n
}

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: BulkPaymentRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const source = (body.source || "Cash Desk").trim()
  const offsetDays = body.defaultNextPaymentOffsetDays ?? 30
  const payments = Array.isArray(body.payments) ? body.payments : []
  if (payments.length === 0) {
    return NextResponse.json({ error: "No payment rows supplied" }, { status: 400 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const sheetName = getSheetName()

    // 1. Auto-create any missing headers (item 10). Single read + ≤1 write.
    const headers = await ensureHeaders(
      spreadsheetId,
      sheetName,
      EXPECTED_CONSUMER_HEADERS
    )

    const idCol = findColumn(headers, ["consumerId", "consumer id", "consumer_id"])
    const osdCol = findColumn(headers, ["d2 net o/s", "d2 net os", "outstanding"])
    const nameColIdx = findColumn(headers, ["name", "consumer name"])
    const statusColIdx = findColumn(headers, ["discon status", "disconnection status", "status"])
    if (idCol === -1) {
      return NextResponse.json({ error: "Consumer ID column not found" }, { status: 500 })
    }

    // 2. Read Consumer ID + OSD (+ name/status for history) columns once so we can
    //    match and compute outstandingAfter without fetching the entire sheet.
    const readCols = [idCol, osdCol, nameColIdx, statusColIdx].filter(i => i !== -1)
    const ranges = readCols.map(i => `'${sheetName}'!${colLetter(i)}:${colLetter(i)}`)
    const sheetReadResp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    })
    const colData = (colIdx: number) => {
      const ri = readCols.indexOf(colIdx)
      return ri !== -1 ? (sheetReadResp.data.valueRanges?.[ri]?.values || []) : []
    }
    const idColumn = colData(idCol)
    const osdColumn = colData(osdCol)
    const nameColumn = colData(nameColIdx)
    const statusColumn = colData(statusColIdx)

    // Build a Map of consumerId -> { rowIndex, currentOSD, name, status }. row 1 = header.
    const idToRow = new Map<string, { row: number; osd: number; name: string; status: string }>()
    for (let i = 0; i < idColumn.length; i++) {
      const id = String(idColumn[i]?.[0] || "").trim()
      if (!id || i === 0) continue
      const osd = osdCol !== -1 ? cleanNumber(String(osdColumn[i]?.[0] || "0")) : 0
      idToRow.set(id, {
        row: i + 1, // sheet rows are 1-based
        osd,
        name: String(nameColumn[i]?.[0] || "").trim(),
        status: String(statusColumn[i]?.[0] || "").toLowerCase().trim(),
      })
    }

    // 3. Plan the writes.
    const todayDDMM = (() => {
      const d = new Date()
      const dd = String(d.getDate()).padStart(2, "0")
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      return `${dd}-${mm}-${d.getFullYear()}`
    })()

    const colMap = {
      disconStatus: findColumn(headers, ["discon status", "disconnection status", "status"]),
      disconDate: findColumn(headers, ["discon date", "disconnection date"]),
      lastUpdated: findColumn(headers, ["last updated", "updatedAt", "timestamp", "modified"]),
      paidAmount: findColumn(headers, ["paid amount", "paidamount", "amount paid"]),
      paidDate: findColumn(headers, ["paid date", "paiddate", "payment date"]),
      paidType: findColumn(headers, ["paid type", "paidtype", "payment type"]),
      outstandingAfter: findColumn(headers, ["outstanding after", "outstandingafter", "remaining outstanding"]),
      nextPaymentDate: findColumn(headers, ["next payment date", "nextpaymentdate", "next payment"]),
      paymentSource: findColumn(headers, ["payment source", "paymentsource", "payment mode"]),
    }

    const writes: sheets_v4.Schema$ValueRange[] = []
    const matched: string[] = []
    const notFound: string[] = []
    const historyEntries: Parameters<typeof appendHistory>[0] = []
    const ts = nowTimestamp()
    let fullCount = 0
    let partialCount = 0

    // Collapse duplicate rows for the same consumer: sum the amounts (installments
    // accumulate) and keep the latest paid date. This writes each consumer row
    // exactly once and computes outstanding against the full total paid.
    const aggregated = new Map<string, PaymentRow>()
    for (const raw of payments) {
      const id = String(raw.consumerId || "").trim()
      if (!id) continue
      const amt = Number(raw.paidAmount) || 0
      const existing = aggregated.get(id)
      if (!existing) {
        aggregated.set(id, { consumerId: id, paidAmount: amt, paidDate: raw.paidDate })
        continue
      }
      existing.paidAmount += amt
      const incoming = parseFlexDate(raw.paidDate)
      const current = parseFlexDate(existing.paidDate)
      if (incoming && (!current || incoming.getTime() > current.getTime())) {
        existing.paidDate = raw.paidDate
      }
    }

    for (const p of aggregated.values()) {
      const id = p.consumerId
      const target = idToRow.get(id)
      if (!target) {
        notFound.push(id)
        continue
      }
      matched.push(id)

      const paidAmount = Number(p.paidAmount) || 0
      const outstanding = target.osd
      const remaining = Math.max(0, outstanding - paidAmount)
      const paidType: "full" | "partial" = remaining <= 0.5 ? "full" : "partial"
      if (paidType === "full") fullCount++
      else partialCount++

      const nextDate = addDays(p.paidDate, offsetDays)

      // Record a "paid" history event (snapshot of state before this payment).
      historyEntries.push({
        timestamp: ts,
        consumerId: id,
        name: target.name,
        action: "paid",
        oldStatus: target.status,
        newStatus: "paid",
        oldOsd: String(outstanding),
        oldNotes: "",
        oldImageUrl: "",
        changedBy: "payment-import",
        amount: String(paidAmount),
        eventDate: p.paidDate || todayDDMM,
      })

      // Collect the cells to write for this row (skipping unresolved columns),
      // then coalesce adjacent columns into single contiguous ranges. When the
      // payment columns sit together (the common appended-at-end layout) one
      // consumer needs ~2-3 ValueRanges instead of 9 — ~5x smaller batchUpdate
      // payload, well clear of the 60s timeout and Sheets API size limits.
      const cells = [
        { col: colMap.disconStatus,     val: "paid" },
        { col: colMap.disconDate,       val: p.paidDate || todayDDMM },
        { col: colMap.lastUpdated,      val: todayDDMM },
        { col: colMap.paidAmount,       val: String(paidAmount) },
        { col: colMap.paidDate,         val: p.paidDate || todayDDMM },
        { col: colMap.paidType,         val: paidType },
        { col: colMap.outstandingAfter, val: String(remaining) },
        { col: colMap.nextPaymentDate,  val: nextDate },
        { col: colMap.paymentSource,    val: source },
      ]
        .filter(c => c.col !== -1)
        .sort((a, b) => a.col - b.col)

      for (let k = 0; k < cells.length; ) {
        const startCol = cells[k].col
        const run: string[] = [cells[k].val]
        let endCol = startCol
        let j = k + 1
        while (j < cells.length && cells[j].col === endCol + 1) {
          run.push(cells[j].val)
          endCol = cells[j].col
          j++
        }
        writes.push({
          range: `'${sheetName}'!${colLetter(startCol)}${target.row}:${colLetter(endCol)}${target.row}`,
          values: [run],
        })
        k = j
      }
    }

    // 4. Single batchUpdate regardless of how many rows.
    if (writes.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: writes,
        },
      })
    }

    // Invalidate the warm-function memo so subsequent /base or /patch reads
    // reflect the new payment state immediately in this container.
    invalidateConsumerCache()

    // Fire-and-forget history (non-critical, doesn't block response).
    if (historyEntries.length > 0) {
      appendHistory(historyEntries, spreadsheetId)
        .then(() => invalidateHistoryCache(spreadsheetId))
        .catch(e => console.warn("Payment history append failed (non-critical):", e))
    }

    return NextResponse.json({
      success: true,
      summary: {
        receivedRows: payments.length,
        uniqueConsumers: aggregated.size,
        matched: matched.length,
        notFound: notFound.length,
        fullPayments: fullCount,
        partialPayments: partialCount,
      },
      notFoundIds: notFound.slice(0, 50), // cap response size
    })
  } catch (error: any) {
    console.error("bulk-apply error:", error)
    return NextResponse.json(
      { error: error?.message || "Bulk apply failed" },
      { status: 500 }
    )
  }
})
