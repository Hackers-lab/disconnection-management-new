import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import {
  fetchMasterData,
  uploadMasterData,
  invalidateMasterCache,
  type ConsumerMasterRow,
} from "@/lib/consumer-master-service"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

// All roles can read the consumer master
export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { searchParams } = new URL(request.url)
    const isRefresh = searchParams.get("refresh") === "true"
    const offsetStr = searchParams.get("offset")
    const limitStr = searchParams.get("limit")

    if (isRefresh) {
      invalidateMasterCache()
    }

    const tenantConfig = await getTenantConfig(session.cccCode)
    const data = await fetchMasterData(tenantConfig.spreadsheetId)
    
    let result = data
    if (offsetStr !== null || limitStr !== null) {
      const offset = parseInt(offsetStr || "0", 10)
      const limit = parseInt(limitStr || "10000", 10)
      result = data.slice(offset, offset + limit)
    }

    return NextResponse.json(result, {
      headers: {
        'X-Total-Count': String(data.length),
        'Cache-Control': 'no-store',
      }
    })
  } catch (e: any) {
    console.error("Consumer master fetch error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

// Only admin can replace/upload the master data
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: "rows array required" }, { status: 400 })
    }
    const rows = body.rows as ConsumerMasterRow[]
    const clearExisting = body.clearExisting !== false

    const tenantConfig = await getTenantConfig(session.cccCode)
    const result = await uploadMasterData(rows, clearExisting, tenantConfig.spreadsheetId)
    return NextResponse.json({ success: true, count: result.count })
  } catch (e: any) {
    console.error("Consumer master upload error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
