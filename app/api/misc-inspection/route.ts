import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import {
  getMiscInspections,
  fetchAllMiscInspectionsRaw,
  createMiscInspection,
} from "@/lib/misc-inspection-service"
import type { CreateMiscInspectionInput } from "@/lib/misc-inspection-types"
import { withTenant } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("misc_inspection", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const bypassCache = searchParams.get("bypassCache") === "true" || searchParams.get("refresh") === "true"
    const allRecords = bypassCache ? await fetchAllMiscInspectionsRaw() : await getMiscInspections()
    const session = authRes.session

    // Filter by agency scope if restricted
    const filtered = allRecords.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.agency)) {
        return false
      }
      return true
    })

    return NextResponse.json(filtered)
  } catch (error: any) {
    console.error("GET /api/misc-inspection error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch misc inspections" },
      { status: 500 }
    )
  }
})

export const POST = withTenant(async function POST(req: NextRequest) {
  const authRes = await checkApiPermission("misc_inspection", ["create", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const body: CreateMiscInspectionInput = await req.json()
    
    if (!body.title || !body.category || !body.agency) {
      return NextResponse.json(
        { error: "Title, Category, and Agency are required" },
        { status: 400 }
      )
    }

    const createdBy = authRes.session.userId || authRes.session.username || authRes.session.role || "Admin"
    const newRecord = await createMiscInspection(body, createdBy)

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || req.headers.get("x-tenant-id") || "default"
    appendDeltaPatch(tenantId, "misc-inspection", {
      action: "UPDATE",
      recordId: String(newRecord.id),
      changes: newRecord,
    }).catch(e => console.warn("Misc inspection creation patch logging failed:", e))

    if (newRecord.agency) {
      updateBadgeCounts(tenantId, "misc_inspection", newRecord.agency, 1).catch(e => console.warn("Misc inspection badge update failed:", e))
    }

    return NextResponse.json(newRecord, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/misc-inspection error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create misc inspection" },
      { status: 500 }
    )
  }
})
