import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { _fetchSafetyTicketsRaw } from "@/lib/safety-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { isAgencyScopeRestricted } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sinceTs = parseInt(searchParams.get("since_ts") || "0", 10)

  try {
    const id = getSpreadsheetId()
    const tickets = await _fetchSafetyTicketsRaw(id).catch(() => [])

    const modified = tickets.filter((t: any) => {
      if (isAgencyScopeRestricted(session, t.agency)) return false
      if (!sinceTs) return true
      const recTs = new Date(t.updatedAt || t.createdAt || 0).getTime()
      return recTs >= sinceTs
    })

    return NextResponse.json({
      serverTimestamp: Date.now(),
      patchCount: modified.length,
      patchData: modified,
      tombstones: [],
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (error: any) {
    return NextResponse.json({ patchCount: 0, patchData: [] }, { status: 500 })
  }
})
