import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { syncConsumersWithZoneMap } from "@/lib/zone-map-sync"

export const maxDuration = 60

// Re-apply the current Agency Zone Map to existing consumers WITHOUT a DC
// re-upload. Reassigns any consumer whose mapped agency differs from its
// current one, skipping consumers in a protected/field-work status.
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || session.cccCode || "default"
    const summary = await syncConsumersWithZoneMap({
      changedBy: session.userId || "admin",
      tenantId,
    })

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error: any) {
    console.error("zone-map resync error:", error)
    return NextResponse.json({ error: error?.message || "Re-sync failed" }, { status: 500 })
  }
})
