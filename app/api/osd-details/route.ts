import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission } from "@/lib/permissions"
import { fetchLiveOsdData } from "@/lib/live-osd-service"

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const permCheck = await checkApiPermission(["osd", "permanent_disconnection", "consumer", "disconnection", "reconnection", "meter_replacement"], "read")
    if (!permCheck.authorized) {
      return NextResponse.json({ error: permCheck.error || "Forbidden" }, { status: permCheck.status || 403 })
    }

    const { searchParams } = new URL(request.url)
    const consumerId = searchParams.get("consumerId")?.trim()

    // Must be exactly 9 digits
    if (!consumerId || !/^\d{9}$/.test(consumerId)) {
      return NextResponse.json(
        { error: "Invalid Consumer ID. Consumer ID must be a 9-digit number." },
        { status: 400 }
      )
    }

    const result = await fetchLiveOsdData(consumerId, { includePdfBase64: true })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to fetch live OSD details",
          portalOffline: result.portalOffline ?? false,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error: any) {
    console.error("Error fetching OSD details:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process OSD details request" },
      { status: 500 }
    )
  }
}
