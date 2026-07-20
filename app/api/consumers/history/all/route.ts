import { NextRequest, NextResponse } from "next/server"
import { getFullHistory } from "@/lib/consumer-history"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const maxDuration = 60

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const allHistory = await getFullHistory(spreadsheetId)
    let filtered = allHistory

    // If role is agency, filter by their assigned agency
    if (session.role === "agency") {
      const userAgency = (session.agencies?.[0] || "").trim().toLowerCase()
      if (!userAgency) {
        return NextResponse.json([])
      }
      filtered = allHistory.filter(h => {
        const changedByLower = (h.changedBy || "").trim().toLowerCase()
        return (
          changedByLower === `agency:${userAgency}` ||
          changedByLower.startsWith(`agency:${userAgency}:`) ||
          changedByLower === userAgency
        )
      })
    }

    return NextResponse.json(filtered)
  } catch (error: any) {
    console.error("Error fetching full history:", error)
    return NextResponse.json({ error: error?.message || "Failed to load history" }, { status: 500 })
  }
})
