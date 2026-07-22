import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { fetchConsumerData } from "@/lib/google-sheets"

export interface CCCStatRow {
  cccCode: string
  cccName: string
  targetCount: number
  targetAmount: number
  disconCount: number
  disconAmount: number
  paidCount: number
  paidAmount: number
  visitedCount: number
  pendingCount: number
  pendingAmount: number
  attendedPercent: number
}

export async function GET(request: Request) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  let divPrefix = searchParams.get("division") || ""

  // Extract division prefix from username if role is division_viewer or username ends with 000
  if (!divPrefix) {
    const uname = String(session.username || "").trim()
    if (/^\d{4}000$/.test(uname)) {
      divPrefix = uname.slice(0, 4)
    } else if (session.cccCode && session.cccCode.length >= 4) {
      divPrefix = session.cccCode.slice(0, 4)
    }
  }

  if (!divPrefix || divPrefix.length < 3) {
    return NextResponse.json({ error: "Invalid division code prefix" }, { status: 400 })
  }

  try {
    const registry = await getTenantRegistry()
    
    // Find all sub-divisional CCCs under this division (e.g. 6612xxx, 6634xxx)
    const childTenants = Object.values(registry).filter(t =>
      t.cccCode.startsWith(divPrefix) && t.cccCode !== `${divPrefix}000`
    ).sort((a, b) => a.cccCode.localeCompare(b.cccCode))

    if (childTenants.length === 0) {
      return NextResponse.json({
        divisionCode: divPrefix,
        rows: [],
        totals: {
          targetCount: 0, targetAmount: 0,
          disconCount: 0, disconAmount: 0,
          paidCount: 0, paidAmount: 0,
          visitedCount: 0,
          pendingCount: 0, pendingAmount: 0,
          attendedPercent: 0,
        }
      })
    }

    // Fetch consumer data for each child CCC in parallel
    const results = await Promise.allSettled(
      childTenants.map(async (tenant) => {
        const consumers = await fetchConsumerData(tenant.spreadsheetId)
        
        let targetCount = consumers.length
        let targetAmount = 0
        let disconCount = 0
        let disconAmount = 0
        let paidCount = 0
        let paidAmount = 0
        let visitedCount = 0
        let pendingCount = 0
        let pendingAmount = 0

        for (const c of consumers) {
          const os = parseFloat(c.d2NetOS || "0") || 0
          const pd = parseFloat(c.paidAmount || "0") || 0
          targetAmount += os

          const status = (c.disconStatus || "").toLowerCase()

          if (pd > 0 || status === "paid") {
            paidCount++
            paidAmount += pd > 0 ? pd : os
          } else if (status === "disconnected" || status === "meter_removed" || status === "rcd_done") {
            disconCount++
            disconAmount += os
          } else if (status === "deemed" || status === "door_locked" || status === "untraceable" || status === "premise_locked" || (c.notes && c.notes.trim().length > 0)) {
            visitedCount++
          } else {
            pendingCount++
            pendingAmount += os
          }
        }

        const attended = disconCount + paidCount + visitedCount
        const attendedPercent = targetCount > 0 ? Math.round((attended / targetCount) * 1000) / 10 : 0

        const row: CCCStatRow = {
          cccCode: tenant.cccCode,
          cccName: tenant.cccName || `CCC ${tenant.cccCode}`,
          targetCount,
          targetAmount: Math.round(targetAmount),
          disconCount,
          disconAmount: Math.round(disconAmount),
          paidCount,
          paidAmount: Math.round(paidAmount),
          visitedCount,
          pendingCount,
          pendingAmount: Math.round(pendingAmount),
          attendedPercent,
        }

        return row
      })
    )

    const rows: CCCStatRow[] = []
    let totalTargetCount = 0
    let totalTargetAmount = 0
    let totalDisconCount = 0
    let totalDisconAmount = 0
    let totalPaidCount = 0
    let totalPaidAmount = 0
    let totalVisitedCount = 0
    let totalPendingCount = 0
    let totalPendingAmount = 0

    for (const res of results) {
      if (res.status === "fulfilled") {
        const r = res.value
        rows.push(r)
        totalTargetCount += r.targetCount
        totalTargetAmount += r.targetAmount
        totalDisconCount += r.disconCount
        totalDisconAmount += r.disconAmount
        totalPaidCount += r.paidCount
        totalPaidAmount += r.paidAmount
        totalVisitedCount += r.visitedCount
        totalPendingCount += r.pendingCount
        totalPendingAmount += r.pendingAmount
      }
    }

    const grandAttended = totalDisconCount + totalPaidCount + totalVisitedCount
    const grandAttendedPercent = totalTargetCount > 0 ? Math.round((grandAttended / totalTargetCount) * 1000) / 10 : 0

    return NextResponse.json({
      divisionCode: divPrefix,
      rows,
      totals: {
        targetCount: totalTargetCount,
        targetAmount: totalTargetAmount,
        disconCount: totalDisconCount,
        disconAmount: totalDisconAmount,
        paidCount: totalPaidCount,
        paidAmount: totalPaidAmount,
        visitedCount: totalVisitedCount,
        pendingCount: totalPendingCount,
        pendingAmount: totalPendingAmount,
        attendedPercent: grandAttendedPercent,
      }
    })
  } catch (error: any) {
    console.error("Error in Division Stats API:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch division stats" }, { status: 500 })
  }
}
