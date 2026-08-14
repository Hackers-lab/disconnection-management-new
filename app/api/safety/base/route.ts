import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission } from "@/lib/permissions"
import { _fetchSafetyTicketsRaw, createSafetyTicket } from "@/lib/safety-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const permCheck = await checkApiPermission("safety", "read")
  if (!permCheck.authorized) {
    return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
  }

  try {
    const id = getSpreadsheetId()
    const tickets = await _fetchSafetyTicketsRaw(id)
    return NextResponse.json(tickets, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (error: any) {
    console.error("Safety fetch GET error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch safety tickets" }, { status: 500 })
  }
})

export const POST = withTenant(async function POST(request: NextRequest) {
  const permCheck = await checkApiPermission("safety", ["create", "update"])
  if (!permCheck.authorized) {
    return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
  }

  try {
    const body = await request.json()
    const session = permCheck.session

    if (!body.address || !body.latitude || !body.longitude) {
      return NextResponse.json({ error: "Address and GPS Coordinates (Latitude, Longitude) are mandatory" }, { status: 400 })
    }

    const id = getSpreadsheetId()
    const safetyId = await createSafetyTicket(id, {
      reportedBy: session.userName || session.role || "User",
      offCode: session.offCode || body.offCode || "",
      hazardCategories: body.hazardCategories || [],
      severity: body.severity || "Medium",
      priority: body.priority || "normal",
      latitude: parseFloat(body.latitude),
      longitude: parseFloat(body.longitude),
      address: body.address,
      dtrCode: body.dtrCode || "",
      beforeImageUrl: body.beforeImageUrl || "",
      drawingUrl: body.drawingUrl || "",
      agency: body.agency || (session.role === "agency" ? session.agencies?.[0] || "" : ""),
      remarks: body.remarks || "",
    })

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || request.headers.get("x-tenant-id") || "default"
    appendDeltaPatch(tenantId, "safety", {
      action: "UPDATE",
      recordId: String(safetyId),
      changes: { safetyId, ...body },
    }).catch(e => console.warn("Safety creation patch logging failed:", e))

    if (body.agency) {
      updateBadgeCounts(tenantId, "safety", body.agency, 1).catch(e => console.warn("Safety badge update failed:", e))
    }

    return NextResponse.json({ success: true, safetyId })
  } catch (error: any) {
    console.error("Safety ticket creation POST error:", error)
    return NextResponse.json({ error: error.message || "Failed to create safety ticket" }, { status: 500 })
  }
})
