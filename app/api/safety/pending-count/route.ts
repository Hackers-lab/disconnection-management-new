import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { _fetchSafetyTicketsRaw } from "@/lib/safety-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const id = getSpreadsheetId()
    const tickets = await _fetchSafetyTicketsRaw(id).catch(() => [])

    const userRole = session.role
    const userAgencies = (session.agencies || []).map((a: string) => String(a || "").trim().toUpperCase())
    const isAgency = userRole === "agency"

    let pendingCount = 0

    if (isAgency) {
      // Pending for agency: tickets assigned to agency where physical work is pending
      pendingCount = tickets.filter(t =>
        t.physicalStatus === "pending" && userAgencies.includes((t.agency || "").trim().toUpperCase())
      ).length
    } else {
      // Pending for admin: tickets with physical site work pending + tickets rectified awaiting Note Sheet/PO review
      pendingCount = tickets.filter(t =>
        t.physicalStatus === "pending" ||
        (t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required")
      ).length
    }

    return NextResponse.json({ pendingCount }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (error: any) {
    console.error("Safety pending count error:", error)
    return NextResponse.json({ pendingCount: 0 })
  }
})
