import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import {
  getIcdsRecords,
  fetchAllIcdsRecordsRaw,
  createIcdsRecord,
} from "@/lib/icds-service"
import type { CreateIcdsInput } from "@/lib/icds-types"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("icds", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const bypassCache = searchParams.get("bypassCache") === "true" || searchParams.get("refresh") === "true"
    const allRecords = bypassCache ? await fetchAllIcdsRecordsRaw() : await getIcdsRecords()
    const session = authRes.session

    // Filter by agency scope if restricted
    const filtered = allRecords.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.assignedAgency)) {
        return false
      }
      return true
    })

    return NextResponse.json(filtered, {
      headers: {
        "Cache-Control": bypassCache
          ? "no-store"
          : "private, s-maxage=30, stale-while-revalidate=120",
      },
    })
  } catch (error: any) {
    console.error("GET /api/icds error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch ICDS records" },
      { status: 500 }
    )
  }
})

export const POST = withTenant(async function POST(req: NextRequest) {
  const authRes = await checkApiPermission("icds", ["create", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const body: CreateIcdsInput = await req.json()
    
    if (!body.awcCode || !body.awcName || !body.blockName || !body.gpName) {
      return NextResponse.json(
        { error: "AWC Code, AWC Name, Block Name, and GP Name are required" },
        { status: 400 }
      )
    }

    const newRecord = await createIcdsRecord(body)

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || req.headers.get("x-tenant-id") || "default"
    await appendDeltaPatch(tenantId, "icds", {
      action: "UPDATE",
      recordId: String(newRecord.id),
      changes: newRecord,
    }).catch(e => console.warn("ICDS creation patch logging failed:", e))

    if (newRecord.assignedAgency) {
      await updateBadgeCounts(tenantId, "icds", newRecord.assignedAgency, 1).catch(e => console.warn("ICDS badge update failed:", e))
    }

    return NextResponse.json(newRecord, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/icds error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create ICDS record" },
      { status: 500 }
    )
  }
})

export const DELETE = withTenant(async function DELETE(req: NextRequest) {
  const authRes = await checkApiPermission("icds", ["delete", "create", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const clearAll = searchParams.get("clearAll") === "true" || searchParams.get("all") === "true"

    if (clearAll) {
      const { clearAllIcdsRecords } = await import("@/lib/icds-service")
      const clearedCount = await clearAllIcdsRecords()
      return NextResponse.json({
        success: true,
        message: `Successfully cleared ${clearedCount} test records.`,
        clearedCount,
      })
    }

    const id = searchParams.get("id")
    if (id) {
      const { deleteIcdsRecord } = await import("@/lib/icds-service")
      await deleteIcdsRecord(id)
      return NextResponse.json({ success: true, id })
    }

    return NextResponse.json({ error: "Missing 'id' or 'clearAll' parameter" }, { status: 400 })
  } catch (error: any) {
    console.error("DELETE /api/icds error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to delete ICDS records" },
      { status: 500 }
    )
  }
})
