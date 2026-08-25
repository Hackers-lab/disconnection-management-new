import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { getModuleVersions, getDeltaPatchesSince } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const since = Number(searchParams.get("since") || 0)
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"

    const [patches, versions] = await Promise.all([
      getDeltaPatchesSince(tenantId, "gis", since),
      getModuleVersions(tenantId, "gis"),
    ])

    return NextResponse.json({
      baseVersion: versions.baseVersion,
      patchVersion: versions.patchVersion,
      patches,
    })
  } catch (error: any) {
    console.error("GET /api/gis/patch error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch GIS delta patches" },
      { status: 500 }
    )
  }
})
