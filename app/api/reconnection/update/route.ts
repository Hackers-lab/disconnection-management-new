import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { updateReconnectionStatus, fetchReconnectionData } from "@/lib/reconnection-service"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { roleStorage } from "@/lib/role-storage"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("reconnection", "update")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const { requestId, status: newStatus, imageUrl, reading, remarks } = body

    if (!requestId || !newStatus) {
      return NextResponse.json({ error: "requestId and status required" }, { status: 400 })
    }

    const validStatuses = ["reconnected", "door_locked", "cancelled"]
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Load the request details to verify agency scoping
    const id = getSpreadsheetId()
    const allReqs = await fetchReconnectionData(id)
    const req = allReqs.find((r) => r.requestId === requestId)
    if (!req) {
      return NextResponse.json({ error: "Reconnection request not found" }, { status: 404 })
    }

    if (isAgencyScopeRestricted(session, req.agency)) {
      return NextResponse.json({ error: "Forbidden: Request is outside your agency scope" }, { status: 403 })
    }

    // Cancelled only if user has delete/cancel permission
    if (newStatus === "cancelled") {
      const isDeleteAllowed = session.role === "admin" || (await roleStorage.getPermissionsForRole(session.role))?.reconnection?.includes("delete")
      if (!isDeleteAllowed) {
        return NextResponse.json({ error: "Forbidden: No permission to cancel reconnection requests" }, { status: 403 })
      }
    }

    await updateReconnectionStatus({
      requestId,
      status: newStatus,
      updatedBy: `${session.role}:${session.username}`,
      imageUrl,
      reading,
      remarks,
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Reconnection update error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

