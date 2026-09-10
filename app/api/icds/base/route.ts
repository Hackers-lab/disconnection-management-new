import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { fetchAllIcdsRecordsRaw, createIcdsRecord } from "@/lib/icds-service"
import type { CreateIcdsInput } from "@/lib/icds-types"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("icds", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const allRecords = await fetchAllIcdsRecordsRaw()
    const session = authRes.session

    const filtered = allRecords.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.assignedAgency)) {
        return false
      }
      return true
    }).map(r => {
      const clean: Record<string, any> = {}
      for (const k in r) {
        const val = (r as any)[k]
        if (val !== "" && val !== null && val !== undefined) {
          clean[k] = val
        }
      }
      return clean
    })

    return NextResponse.json(filtered, {
      headers: { "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300, max-age=0, must-revalidate" },
    })
  } catch (error: any) {
    console.error("GET /api/icds/base error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch base ICDS records" },
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
      return NextResponse.json({ error: "AWC Code, Center Name, Block, and GP are mandatory" }, { status: 400 })
    }

    const newRecord = await createIcdsRecord(body)

    const tenantContext = getTenantContext()
    if (tenantContext?.tenantId) {
      await appendDeltaPatch(tenantContext.tenantId, "icds", {
        action: "UPDATE",
        recordId: newRecord.id,
        changes: newRecord,
      })
      await updateBadgeCounts(tenantContext.tenantId, "icds")
    }

    return NextResponse.json({ success: true, record: newRecord })
  } catch (error: any) {
    console.error("POST /api/icds/base error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create ICDS record" },
      { status: 500 }
    )
  }
})
