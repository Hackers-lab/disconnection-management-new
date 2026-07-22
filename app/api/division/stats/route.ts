import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { fetchConsumerData } from "@/lib/google-sheets"
import { fetchDDData } from "@/lib/dd-service"

export interface AgencyBreakdown {
  agencyName: string
  targetCount: number
  disconCount: number
  paidCount: number
  paidAmount: number
  recoveryPercent: number
}

export interface DDAgencyBreakdown {
  agencyName: string
  targetCount: number
  completedCount: number
  lockedCount: number
  pendingCount: number
  completionPercent: number
}

export interface CCCStatRow {
  cccCode: string
  cccName: string

  // Disconnection Metrics
  targetCount: number
  targetAmount: number
  disconCount: number
  disconAmount: number
  paidCount: number
  paidAmount: number
  pendingCount: number
  pendingAmount: number
  recoveryPercent: number
  agencyBreakdown: AgencyBreakdown[]

  // Deemed Visit Metrics (Separate)
  ddTargetCount: number
  ddTargetAmount: number
  ddCompletedCount: number
  ddCompletedAmount: number
  ddLockedCount: number
  ddLockedAmount: number
  ddPendingCount: number
  ddPendingAmount: number
  ddCompletionPercent: number
  ddAgencyBreakdown: DDAgencyBreakdown[]
}

export async function GET(request: Request) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  let divPrefix = searchParams.get("division") || ""

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
          pendingCount: 0, pendingAmount: 0,
          recoveryPercent: 0,
          ddTargetCount: 0, ddTargetAmount: 0,
          ddCompletedCount: 0, ddCompletedAmount: 0,
          ddLockedCount: 0, ddLockedAmount: 0,
          ddPendingCount: 0, ddPendingAmount: 0,
          ddCompletionPercent: 0,
        }
      })
    }

    // Process each child CCC in parallel
    const results = await Promise.allSettled(
      childTenants.map(async (tenant) => {
        // 1. Fetch Disconnection Consumers
        const consumers = await fetchConsumerData(tenant.spreadsheetId)
        
        let targetCount = consumers.length
        let targetAmount = 0
        let disconCount = 0
        let disconAmount = 0
        let paidCount = 0
        let paidAmount = 0
        let pendingCount = 0
        let pendingAmount = 0

        const agencyMap: Record<string, { targetCount: number; disconCount: number; paidCount: number; paidAmount: number; targetAmount: number }> = {}

        for (const c of consumers) {
          const os = parseFloat(c.d2NetOS || "0") || 0
          const pd = parseFloat(c.paidAmount || "0") || 0
          const ag = (c.agency || "Unallocated").trim().toUpperCase()

          targetAmount += os

          if (!agencyMap[ag]) {
            agencyMap[ag] = { targetCount: 0, disconCount: 0, paidCount: 0, paidAmount: 0, targetAmount: 0 }
          }
          agencyMap[ag].targetCount++
          agencyMap[ag].targetAmount += os

          const status = (c.disconStatus || "").toLowerCase()

          if (pd > 0 || status === "paid") {
            paidCount++
            const actualPaid = pd > 0 ? pd : os
            paidAmount += actualPaid
            agencyMap[ag].paidCount++
            agencyMap[ag].paidAmount += actualPaid
          } else if (status === "disconnected" || status === "meter_removed" || status === "rcd_done") {
            disconCount++
            disconAmount += os
            agencyMap[ag].disconCount++
          } else {
            pendingCount++
            pendingAmount += os
          }
        }

        const recoveryPercent = targetAmount > 0 ? Math.round((paidAmount / targetAmount) * 1000) / 10 : 0

        const agencyBreakdown: AgencyBreakdown[] = Object.entries(agencyMap).map(([ag, data]) => ({
          agencyName: ag,
          targetCount: data.targetCount,
          disconCount: data.disconCount,
          paidCount: data.paidCount,
          paidAmount: Math.round(data.paidAmount),
          recoveryPercent: data.targetAmount > 0 ? Math.round((data.paidAmount / data.targetAmount) * 1000) / 10 : 0
        })).sort((a, b) => b.targetCount - a.targetCount)

        // 2. Fetch Deemed Visit Data
        let ddTargetCount = 0
        let ddTargetAmount = 0
        let ddCompletedCount = 0
        let ddCompletedAmount = 0
        let ddLockedCount = 0
        let ddLockedAmount = 0
        let ddPendingCount = 0
        let ddPendingAmount = 0
        const ddAgencyMap: Record<string, { targetCount: number; completedCount: number; lockedCount: number; pendingCount: number }> = {}

        try {
          const ddList = await fetchDDData(tenant.spreadsheetId)
          ddTargetCount = ddList.length

          for (const d of ddList) {
            const arr = parseFloat(d.totalArrears || "0") || 0
            const ag = (d.agency || "Unallocated").trim().toUpperCase()
            ddTargetAmount += arr

            if (!ddAgencyMap[ag]) {
              ddAgencyMap[ag] = { targetCount: 0, completedCount: 0, lockedCount: 0, pendingCount: 0 }
            }
            ddAgencyMap[ag].targetCount++

            const st = (d.disconStatus || "").toLowerCase()
            if (st === "deemed" || st === "completed" || st === "visited" || (d.visitDate && d.visitDate.trim().length > 0)) {
              ddCompletedCount++
              ddCompletedAmount += arr
              ddAgencyMap[ag].completedCount++
            } else if (st === "door_locked" || st === "untraceable" || st === "premise_locked") {
              ddLockedCount++
              ddLockedAmount += arr
              ddAgencyMap[ag].lockedCount++
            } else {
              ddPendingCount++
              ddPendingAmount += arr
              ddAgencyMap[ag].pendingCount++
            }
          }
        } catch (ddErr) {
          // Ignore DD fetch failure for empty sheets
        }

        const ddCompletionPercent = ddTargetCount > 0 ? Math.round(((ddCompletedCount + ddLockedCount) / ddTargetCount) * 1000) / 10 : 0

        const ddAgencyBreakdown: DDAgencyBreakdown[] = Object.entries(ddAgencyMap).map(([ag, data]) => ({
          agencyName: ag,
          targetCount: data.targetCount,
          completedCount: data.completedCount,
          lockedCount: data.lockedCount,
          pendingCount: data.pendingCount,
          completionPercent: data.targetCount > 0 ? Math.round(((data.completedCount + data.lockedCount) / data.targetCount) * 1000) / 10 : 0
        })).sort((a, b) => b.targetCount - a.targetCount)

        const row: CCCStatRow = {
          cccCode: tenant.cccCode,
          cccName: tenant.cccName || `CCC ${tenant.cccCode}`,
          targetCount,
          targetAmount: Math.round(targetAmount),
          disconCount,
          disconAmount: Math.round(disconAmount),
          paidCount,
          paidAmount: Math.round(paidAmount),
          pendingCount,
          pendingAmount: Math.round(pendingAmount),
          recoveryPercent,
          agencyBreakdown,
          ddTargetCount,
          ddTargetAmount: Math.round(ddTargetAmount),
          ddCompletedCount,
          ddCompletedAmount: Math.round(ddCompletedAmount),
          ddLockedCount,
          ddLockedAmount: Math.round(ddLockedAmount),
          ddPendingCount,
          ddPendingAmount: Math.round(ddPendingAmount),
          ddCompletionPercent,
          ddAgencyBreakdown,
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
    let totalPendingCount = 0
    let totalPendingAmount = 0

    let totalDDTargetCount = 0
    let totalDDTargetAmount = 0
    let totalDDCompletedCount = 0
    let totalDDCompletedAmount = 0
    let totalDDLockedCount = 0
    let totalDDLockedAmount = 0
    let totalDDPendingCount = 0
    let totalDDPendingAmount = 0

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
        totalPendingCount += r.pendingCount
        totalPendingAmount += r.pendingAmount

        totalDDTargetCount += r.ddTargetCount
        totalDDTargetAmount += r.ddTargetAmount
        totalDDCompletedCount += r.ddCompletedCount
        totalDDCompletedAmount += r.ddCompletedAmount
        totalDDLockedCount += r.ddLockedCount
        totalDDLockedAmount += r.ddLockedAmount
        totalDDPendingCount += r.ddPendingCount
        totalDDPendingAmount += r.ddPendingAmount
      }
    }

    const grandRecoveryPercent = totalTargetAmount > 0 ? Math.round((totalPaidAmount / totalTargetAmount) * 1000) / 10 : 0
    const grandDDCompletionPercent = totalDDTargetCount > 0 ? Math.round(((totalDDCompletedCount + totalDDLockedCount) / totalDDTargetCount) * 1000) / 10 : 0

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
        pendingCount: totalPendingCount,
        pendingAmount: totalPendingAmount,
        recoveryPercent: grandRecoveryPercent,
        ddTargetCount: totalDDTargetCount,
        ddTargetAmount: totalDDTargetAmount,
        ddCompletedCount: totalDDCompletedCount,
        ddCompletedAmount: totalDDCompletedAmount,
        ddLockedCount: totalDDLockedCount,
        ddLockedAmount: totalDDLockedAmount,
        ddPendingCount: totalDDPendingCount,
        ddPendingAmount: totalDDPendingAmount,
        ddCompletionPercent: grandDDCompletionPercent,
      }
    })
  } catch (error: any) {
    console.error("Error in Division Stats API:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch division stats" }, { status: 500 })
  }
}
