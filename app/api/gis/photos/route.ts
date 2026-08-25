import { NextRequest, NextResponse } from "next/server"
import { fetchGisCaptures, deleteGisCapture } from "@/lib/gis-service"
import { withTenant, getTenantContext } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  try {
    const context = getTenantContext()
    const tenantId = context?.cccCode || request.headers.get("x-tenant-id") || "default"
    const { searchParams } = new URL(request.url)
    const user = searchParams.get("user")
    const office = searchParams.get("office")
    const query = searchParams.get("q")?.toLowerCase()

    const photos = await fetchGisCaptures(tenantId)

    let filtered = photos

    if (user) {
      filtered = filtered.filter(p => (p.uploadedBy || "").toLowerCase() === user.toLowerCase())
    }

    if (office && office !== "ALL") {
      filtered = filtered.filter(p => (p.officeCode || "").toLowerCase() === office.toLowerCase())
    }

    if (query) {
      filtered = filtered.filter(p =>
        (p.note || "").toLowerCase().includes(query) ||
        (p.locationName || "").toLowerCase().includes(query) ||
        (p.uploadedBy || "").toLowerCase().includes(query) ||
        (p.uploadedByName || "").toLowerCase().includes(query) ||
        (p.dateFormatted || "").toLowerCase().includes(query)
      )
    }

    return NextResponse.json({
      success: true,
      photos: filtered,
      total: photos.length,
    })
  } catch (error: any) {
    console.error("GIS photos fetch error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to fetch GIS photos", photos: [] },
      { status: 500 }
    )
  }
})

export const DELETE = withTenant(async function DELETE(request: NextRequest) {
  try {
    const context = getTenantContext()
    const tenantId = context?.cccCode || request.headers.get("x-tenant-id") || "default"
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get("id")

    if (!photoId) {
      return NextResponse.json({ error: "Photo ID is required" }, { status: 400 })
    }

    const deleted = await deleteGisCapture(tenantId, photoId)

    return NextResponse.json({
      success: deleted,
      message: deleted ? "Photo deleted successfully" : "Photo not found",
    })
  } catch (error: any) {
    console.error("GIS photo delete error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to delete GIS photo" },
      { status: 500 }
    )
  }
})
