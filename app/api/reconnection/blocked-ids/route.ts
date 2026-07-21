import { NextRequest, NextResponse } from "next/server"
import { getBlockedConsumerIds } from "@/lib/reconnection-service"
import { withTenant } from "@/lib/tenant-context"

// Lightweight endpoint — returns just an array of consumer ID strings.
// consumer-list fetches this on mount to block the disconnection module for
// agencies whose reconnection has been pending for more than 30 hours.
//
// Optional query param:
//   ?agencies=AGENCY_A,AGENCY_B  — comma-separated list of agency names.
//   When provided, only overdue reconnections belonging to those agencies are
//   returned, so an agency user is never blocked by another agency's overdue work.
export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const agenciesParam = req.nextUrl.searchParams.get("agencies")
    const agencies = agenciesParam
      ? agenciesParam.split(",").map(a => a.trim()).filter(Boolean)
      : undefined

    const ids = await getBlockedConsumerIds(agencies)
    return NextResponse.json(ids, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    console.error("blocked-ids error:", e)
    return NextResponse.json([], { status: 500 })
  }
})
