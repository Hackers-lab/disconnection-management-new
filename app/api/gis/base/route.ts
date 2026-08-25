import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { fetchGisCaptures } from "@/lib/gis-service"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"

    const photos = await fetchGisCaptures(tenantId)

    return NextResponse.json(photos, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (error: any) {
    console.error("GET /api/gis/base error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch GIS base captures" },
      { status: 500 }
    )
  }
})
