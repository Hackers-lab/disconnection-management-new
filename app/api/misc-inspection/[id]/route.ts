import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import {
  getMiscInspectionById,
  updateMiscInspectionByAgency,
  finalizeMiscInspection,
  deleteMiscInspection,
} from "@/lib/misc-inspection-service"
import { withTenant } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = withTenant(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("misc_inspection", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    const record = await getMiscInspectionById(id)
    if (!record) {
      return NextResponse.json({ error: "Inspection record not found" }, { status: 404 })
    }

    if (isAgencyScopeRestricted(authRes.session, record.agency)) {
      return NextResponse.json({ error: "Forbidden: Agency scope restricted" }, { status: 403 })
    }

    return NextResponse.json(record)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})

// Agency site inspection update
export const PUT = withTenant(async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("misc_inspection", ["inspect", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    const body = await req.json()
    const inspectedBy = authRes.session.userId || authRes.session.username || authRes.session.role || "Agency Inspector"
    
    const updated = await updateMiscInspectionByAgency(id, body, inspectedBy)
    if (!updated) {
      return NextResponse.json({ error: "Inspection record not found" }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})

// Admin finalization / approval / rejection
export const PATCH = withTenant(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("misc_inspection", ["finalize", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    const body = await req.json()
    const finalizedBy = authRes.session.userId || authRes.session.username || authRes.session.role || "Admin"
    
    const finalized = await finalizeMiscInspection(id, body, finalizedBy)
    if (!finalized) {
      return NextResponse.json({ error: "Inspection record not found" }, { status: 404 })
    }

    return NextResponse.json(finalized)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})

// Admin delete
export const DELETE = withTenant(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("misc_inspection", "delete")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    const success = await deleteMiscInspection(id)
    if (!success) {
      return NextResponse.json({ error: "Inspection record not found" }, { status: 404 })
    }

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || req.headers.get("x-tenant-id") || "default"
    await appendDeltaPatch(tenantId, "misc-inspection", {
      action: "DELETE",
      recordId: String(id),
    }).catch(e => console.warn("Tombstone logging failed:", e))

    await updateBadgeCounts(tenantId, "misc-inspection", undefined, -1).catch(e => console.warn("Badge count update failed:", e))

    return NextResponse.json({ message: "Inspection record deleted successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})
