import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"
import {
  fetchReconnectionData,
  createReconnectionRequest,
} from "@/lib/reconnection-service"

export const GET = withTenant(async function GET(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("reconnection", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  const id = getSpreadsheetId()
  const all = await fetchReconnectionData(id)

  // Filter by assigned agencies if user is restricted
  if (session.agencies && session.agencies.length > 0) {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(r => upper.includes((r.agency || "").toUpperCase())), {
      headers: { "Cache-Control": "no-store" },
    })
  }

  return NextResponse.json(all, {
    headers: { "Cache-Control": "no-store" },
  })
})
export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("reconnection", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()

    // Scoping check for creating reconnection requests
    if (isAgencyScopeRestricted(session, body.agency)) {
      return NextResponse.json({ error: "Forbidden: Target agency is outside your scope" }, { status: 403 })
    }

    const requestId = await createReconnectionRequest({
      consumerId:      body.consumerId || "",
      name:            body.name || "",
      address:         body.address || "",
      mobile:          body.mobile || "",
      agency:          body.agency || "",
      device:          body.device || "",
      source:          body.source || "dc_list",
      requestImageUrl: body.requestImageUrl || "",
      remarks:         body.remarks || "",
    })
    return NextResponse.json({ success: true, requestId })
  } catch (e: any) {
    console.error("Reconnection create error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

