import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { getModuleVersions, getDeltaPatchesSince } from "@/lib/version-engine"
import { verifySession } from "@/lib/session"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const since = Number(searchParams.get("since") || 0)
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.isSubscribed) {
      return NextResponse.json({ error: "Subscription required" }, { status: 402 })
    }

    const [allPatches, versions] = await Promise.all([
      getDeltaPatchesSince(tenantId, "gis", since),
      getModuleVersions(tenantId, "gis"),
    ])

    const roleLower = (session?.role || "user").toLowerCase()
    const isAdmin =
      roleLower === "admin" ||
      roleLower === "superuser" ||
      roleLower === "monitor" ||
      roleLower === "division"

    const filteredPatches = allPatches.filter((p) => {
      if (isAdmin) return true
      if (p.action === "DELETE") return true

      const currentUsername = (session?.username || "").toLowerCase().trim()
      const currentName = (session?.name || "").toLowerCase().trim()
      const changes = p.changes || {}
      const photoUser = (changes.uploadedBy || "").toLowerCase().trim()
      const photoName = (changes.uploadedByName || "").toLowerCase().trim()
      const userAgencies = (session?.agencies || []).map((a) => a.toLowerCase().trim())
      const photoAgency = (changes.agency || "").toLowerCase().trim()

      if (currentUsername && (photoUser === currentUsername || photoUser.includes(currentUsername))) {
        return true
      }
      if (currentName && (photoName === currentName || photoName.includes(currentName))) {
        return true
      }
      if (photoAgency && userAgencies.includes(photoAgency)) {
        return true
      }

      return false
    })

    return NextResponse.json({
      baseVersion: versions.baseVersion,
      patchVersion: versions.patchVersion,
      patches: filteredPatches,
    })
  } catch (error: any) {
    console.error("GET /api/gis/patch error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch GIS delta patches" },
      { status: 500 }
    )
  }
})
