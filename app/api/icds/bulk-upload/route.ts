import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { bulkCreateIcdsRecords } from "@/lib/icds-service"
import type { CreateIcdsInput } from "@/lib/icds-types"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { appendDeltaPatch } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(req: NextRequest) {
  const authRes = await checkApiPermission("icds", ["create", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const { rows }: { rows: CreateIcdsInput[] } = await req.json()
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No valid rows provided for bulk upload" }, { status: 400 })
    }

    const result = await bulkCreateIcdsRecords(rows)

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || req.headers.get("x-tenant-id") || "default"
    await appendDeltaPatch(tenantId, "icds", {
      action: "UPDATE",
      recordId: "BULK_UPLOAD",
      changes: { count: result.createdCount },
    }).catch(e => console.warn("Bulk upload patch logging failed:", e))

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/icds/bulk-upload error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process bulk ICDS upload" },
      { status: 500 }
    )
  }
})
