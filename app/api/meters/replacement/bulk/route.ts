import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { addBulkReplacements } from "@/lib/meter-replacement-service"
import { checkApiPermission } from "@/lib/permissions"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("meter_replacement", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const { items } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No replacement items provided" }, { status: 400 })
    }

    const res = await addBulkReplacements(items)
    return NextResponse.json({ success: true, added: res.added })
  } catch (e: any) {
    console.error("Bulk create replacement error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
