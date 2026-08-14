import { NextRequest, NextResponse } from "next/server"
import { withTenant } from "@/lib/tenant-context"
import { verifySession } from "@/lib/session"
import { getScopedBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    const tenantId = req.headers.get("x-tenant-id") || "default"

    const role = session?.role
    const agency = session?.agency

    const result = await getScopedBadgeCounts(tenantId, role, agency)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("GET /api/system/badge-counts error:", error)
    return NextResponse.json({ error: error.message || "Badge counts fetch failed" }, { status: 500 })
  }
})
