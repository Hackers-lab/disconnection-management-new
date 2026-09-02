import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { _fetchIssuesRaw } from "@/lib/meter-service"
import { _fetchReplacementsRaw } from "@/lib/meter-replacement-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.isSubscribed) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 })
  }

  try {
    const id = getSpreadsheetId()
    const [issues, replacements] = await Promise.all([
      _fetchIssuesRaw(id).catch(() => []),
      _fetchReplacementsRaw(id).catch(() => []),
    ])

    const userRole = session.role
    const userAgencies = (session.agencies || []).map((a: string) => String(a || "").trim().toUpperCase())
    const isAgency = userRole === "agency"

    let pendingCount = 0

    if (isAgency) {
      // Pending items for agency: issued meters awaiting installation
      pendingCount = issues.filter(i => i.status === "issued" && userAgencies.includes((i.agency || "").trim().toUpperCase())).length
    } else {
      // Pending items for admin/exec: proposed replacements + installation_done + active check meters
      const proposedReps = replacements.filter(r => (r.status || "").toLowerCase() === "proposed").length
      const pendingFinalize = issues.filter(i => i.status === "installation_done").length
      const pendingCheck = issues.filter(i => i.purpose === "slow_fast" && i.checkMeterStatus !== "finalized" && i.status !== "returned").length
      pendingCount = proposedReps + pendingFinalize + pendingCheck
    }

    return NextResponse.json({ pendingCount }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (e: any) {
    console.error("Pending count error:", e)
    return NextResponse.json({ pendingCount: 0 })
  }
})
