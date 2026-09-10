import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { getMiscInspections } from "@/lib/misc-inspection-service"
import { fetchSafetyTickets } from "@/lib/safety-service"
import { fetchReplacements } from "@/lib/meter-replacement-service"
import { fetchDTRData } from "@/lib/dtr-service"
import { getIcdsRecords } from "@/lib/icds-service"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("disconnection", "read")
  if (!authRes.authorized) {
    return NextResponse.json({
      miscPending: 0,
      safetyPending: 0,
      meterPending: 0,
      dtrPaintingPending: 0,
      dtrPending: 0,
      icdsPending: 0,
    })
  }

  const session = authRes.session
  const spreadsheetId = getSpreadsheetId()

  try {
    const [miscRecords, safetyRecords, meterRecords, dtrRecords, icdsRecords] = await Promise.all([
      getMiscInspections(spreadsheetId).catch(() => []),
      fetchSafetyTickets(spreadsheetId).catch(() => []),
      fetchReplacements(spreadsheetId).catch(() => []),
      fetchDTRData(spreadsheetId).catch(() => []),
      getIcdsRecords().catch(() => []),
    ])

    const miscPending = miscRecords.filter((r: any) => {
      if (isAgencyScopeRestricted(session, r.agency)) return false
      return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
    }).length

    const safetyPending = safetyRecords.filter((r: any) => {
      if (isAgencyScopeRestricted(session, r.agency)) return false
      return r.physicalStatus === "pending" || r.actionStatus === "pending_inspection"
    }).length

    const meterPending = meterRecords.filter((r: any) => {
      if (isAgencyScopeRestricted(session, r.agency)) return false
      return r.status === "proposed"
    }).length

    const dtrPaintingPending = dtrRecords.filter((r: any) => {
      if (isAgencyScopeRestricted(session, r.paintingAgency)) return false
      return (r.painting || "").toLowerCase() !== "done"
    }).length

    const icdsPending = icdsRecords.filter((r: any) => {
      if (isAgencyScopeRestricted(session, r.assignedAgency)) return false
      return r.stage !== "COMPLETED"
    }).length

    return NextResponse.json(
      {
        miscPending,
        safetyPending,
        meterPending,
        dtrPaintingPending,
        dtrPending: dtrRecords.filter((r: any) => (r.status || "").toUpperCase() !== "EXIST").length,
        icdsPending,
      },
      {
        headers: {
          "Cache-Control": "private, s-maxage=60, stale-while-revalidate=180, max-age=30",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { miscPending: 0, safetyPending: 0, meterPending: 0, dtrPaintingPending: 0, dtrPending: 0 },
      { status: 500 }
    )
  }
})
