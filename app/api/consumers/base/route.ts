import { NextRequest, NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { checkApiPermission } from "@/lib/permissions"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const { authorized, error, status, session } = await checkApiPermission("disconnection", "read")
    if (!authorized) {
      return NextResponse.json({ error }, { status: status || 403 })
    }

    let data = []
    try {
      const spreadsheetId = getSpreadsheetId()
      data = await fetchConsumerData(spreadsheetId)

      // Filter by agency scoping if role has restricted agencies
      if (session?.agencies && session.agencies.length > 0) {
        const upperAgencies = session.agencies.map((a: string) => String(a || "").trim().toUpperCase())
        data = data.filter((c: any) => upperAgencies.includes(String(c.agency || "").trim().toUpperCase()))
      }
    } catch (e: any) {
      console.warn("Failed to fetch base consumer data (likely sheet not linked yet):", e.message || e)
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    const lastRow = data[data.length - 1]

    if (lastRow && lastRow.consumerId && !lastRow.agency) {
      return NextResponse.json(data, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error("💥 API /consumers/base error:", error)
    return NextResponse.json({ error: "Failed to fetch base data" }, { status: 500 })
  }
})
