import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { fetchGisCaptures } from "@/lib/gis-service"
import { getModuleVersions } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"

    const [photos, versions] = await Promise.all([
      fetchGisCaptures(tenantId),
      getModuleVersions(tenantId, "gis"),
    ])

    return NextResponse.json(
      {
        baseVersion: versions.baseVersion,
        patchVersion: versions.patchVersion,
        photos,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    )
  } catch (error: any) {
    console.error("GET /api/gis/base error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch GIS base captures" },
      { status: 500 }
    )
  }
})
