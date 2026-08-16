import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission } from "@/lib/permissions"
import {
  updateSafetyRectification,
  updateNoteSheetDetails,
  updatePODetails,
  markPONotRequired,
  updateSafetyAgency,
} from "@/lib/safety-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { action, safetyId } = body

    if (!safetyId) {
      return NextResponse.json({ error: "safetyId is required" }, { status: 400 })
    }

    const id = getSpreadsheetId()

    if (action === "assign_agency") {
      const permCheck = await checkApiPermission("safety", ["update", "create"])
      if (!permCheck.authorized) {
        return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
      }

      await updateSafetyAgency(id, safetyId, body.agency || "")
      return NextResponse.json({ success: true })
    }

    if (action === "rectify") {
      const permCheck = await checkApiPermission("safety", ["update", "create"])
      if (!permCheck.authorized) {
        return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
      }

      await updateSafetyRectification(id, {
        safetyId,
        afterImageUrl: body.afterImageUrl || "",
        completionRemarks: body.completionRemarks || "",
        drawingUrl: body.drawingUrl || "",
        completedBy: session.userName || session.role || "User",
      })

      return NextResponse.json({ success: true })
    }

    if (action === "notesheet") {
      const permCheck = await checkApiPermission("safety", ["approve_notesheet", "update"])
      if (!permCheck.authorized) {
        return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
      }

      await updateNoteSheetDetails(id, {
        safetyId,
        noteSheetNo: body.noteSheetNo,
        noteSheetDate: body.noteSheetDate,
        noteSheetAmount: body.noteSheetAmount,
        remarks: body.remarks,
      })

      return NextResponse.json({ success: true })
    }

    if (action === "po") {
      const permCheck = await checkApiPermission("safety", ["issue_po", "update"])
      if (!permCheck.authorized) {
        return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
      }

      await updatePODetails(id, {
        safetyId,
        poNumber: body.poNumber,
        poDate: body.poDate,
        poAmount: body.poAmount,
      })

      return NextResponse.json({ success: true })
    }

    if (action === "no_po") {
      const permCheck = await checkApiPermission("safety", ["finalize", "update"])
      if (!permCheck.authorized) {
        return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })
      }

      await markPONotRequired(id, safetyId)

      const tenantContext = getTenantContext()
      const tenantId = tenantContext?.cccCode || request.headers.get("x-tenant-id") || "default"
      await appendDeltaPatch(tenantId, "safety", {
        action: "UPDATE",
        recordId: String(safetyId),
        changes: body,
      }).catch(e => console.warn("Safety patch logging failed:", e))

      await updateBadgeCounts(tenantId, "safety", body.agency, 0).catch(e => console.warn("Safety badge update failed:", e))

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("Safety update POST error:", error)
    return NextResponse.json({ error: error.message || "Failed to update safety ticket" }, { status: 500 })
  }
})
