import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { getMiscInspections } from "@/lib/misc-inspection-service"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("misc_inspection", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ pendingCount: 0 })
  }

  try {
    const allRecords = await getMiscInspections()
    const session = authRes.session

    const pending = allRecords.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.agency)) {
        return false
      }
      return rec.status === "PENDING_AGENCY" || rec.status === "IN_PROGRESS"
    })

    return NextResponse.json(
      { pendingCount: pending.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    )
  } catch (error) {
    return NextResponse.json({ pendingCount: 0 })
  }
})
