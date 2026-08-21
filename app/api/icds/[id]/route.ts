import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import {
  getIcdsRecordById,
  updateIcdsRecord,
  deleteIcdsRecord,
} from "@/lib/icds-service"
import type { IcdsRecord, IcdsStage } from "@/lib/icds-types"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = withTenant(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("icds", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    const record = await getIcdsRecordById(id)
    if (!record) {
      return NextResponse.json({ error: "ICDS record not found" }, { status: 404 })
    }

    if (isAgencyScopeRestricted(authRes.session, record.assignedAgency)) {
      return NextResponse.json({ error: "Forbidden: Agency scope restricted" }, { status: 403 })
    }

    return NextResponse.json(record)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})

export const PATCH = withTenant(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("icds", ["update", "inspect", "process", "execute", "install", "certify"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    const current = await getIcdsRecordById(id)
    if (!current) {
      return NextResponse.json({ error: "ICDS record not found" }, { status: 404 })
    }

    if (isAgencyScopeRestricted(authRes.session, current.assignedAgency)) {
      return NextResponse.json({ error: "Forbidden: Agency scope restricted" }, { status: 403 })
    }

    const body: Partial<IcdsRecord> = await req.json()
    const updated = await updateIcdsRecord(id, body)

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || req.headers.get("x-tenant-id") || "default"
    await appendDeltaPatch(tenantId, "icds", {
      action: "UPDATE",
      recordId: String(id),
      changes: updated,
    }).catch(e => console.warn("ICDS patch logging failed:", e))

    if (updated.assignedAgency) {
      await updateBadgeCounts(tenantId, "icds", updated.assignedAgency, 0).catch(e => console.warn("ICDS badge update failed:", e))
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})

export const DELETE = withTenant(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await checkApiPermission("icds", "delete")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  const { id } = await params
  try {
    await deleteIcdsRecord(id)

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || req.headers.get("x-tenant-id") || "default"
    await appendDeltaPatch(tenantId, "icds", {
      action: "DELETE",
      recordId: String(id),
    }).catch(e => console.warn("ICDS tombstone logging failed:", e))

    return NextResponse.json({ message: "ICDS record deleted successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})
