import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { fetchGisCaptures } from "@/lib/gis-service"
import { verifySession } from "@/lib/session"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.isSubscribed) {
      return NextResponse.json({ error: "Subscription required" }, { status: 402 })
    }

    const allPhotos = await fetchGisCaptures(tenantId)

    const roleLower = (session?.role || "user").toLowerCase()
    const isAdmin =
      roleLower === "admin" ||
      roleLower === "superuser" ||
      roleLower === "monitor" ||
      roleLower === "division"

    // If Admin/Superuser/Monitor -> see all captures across CCC/tenant
    // If regular User/Agency -> see only their own uploads or matching agency
    const filtered = allPhotos.filter((p) => {
      if (isAdmin) return true

      const currentUsername = (session?.username || "").toLowerCase().trim()
      const currentName = (session?.name || "").toLowerCase().trim()
      const photoUser = (p.uploadedBy || "").toLowerCase().trim()
      const photoName = (p.uploadedByName || "").toLowerCase().trim()
      const userAgencies = (session?.agencies || []).map((a) => a.toLowerCase().trim())
      const photoAgency = (p.agency || "").toLowerCase().trim()

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

    return NextResponse.json(filtered, {
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
