import { NextRequest, NextResponse } from "next/server"
import { getDDUpdates } from "@/lib/dd-service"
import { verifySession } from "@/lib/session"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const GET = withTenant(async function GET(req: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantConfig = await getTenantConfig(session.cccCode)
    const updates = await getDDUpdates(tenantConfig.spreadsheetId)

    return NextResponse.json(updates, {
      headers: {
        // CDN-cache 15s with SWR so concurrent tabs share one origin call.
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    })
  } catch (error: any) {
    console.error("DD patch fetch error:", error)
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 })
  }
})
