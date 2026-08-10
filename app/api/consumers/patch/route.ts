import { NextRequest, NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { checkApiPermission } from "@/lib/permissions"
import { parseTs } from "@/lib/date-utils"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const { authorized, error, status, session } = await checkApiPermission("disconnection", "read")
    if (!authorized) {
      return NextResponse.json({ error }, { status: status || 403 })
    }

    const spreadsheetId = getSpreadsheetId()
    let data = await fetchConsumerData(spreadsheetId)

    if (session?.agencies && session.agencies.length > 0) {
      const upperAgencies = session.agencies.map((a: string) => String(a || "").trim().toUpperCase())
      data = data.filter((c: any) => upperAgencies.includes(String(c.agency || "").trim().toUpperCase()))
    }

    if (data.length < 100) {
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=59",
        },
      })
    }

    const sinceTs = parseInt(req.nextUrl.searchParams.get("since_ts") || "0", 10)

    const patchData = data.filter((consumer) => {
      if (!consumer.lastUpdated) return false
      const recTs = parseTs(consumer.lastUpdated)
      if (!sinceTs) return true
      return recTs >= sinceTs
    })

    return NextResponse.json(patchData, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=59",
      },
    })
  } catch (error) {
    console.error("💥 API /consumers/patch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch patch data" },
      { status: 500 }
    )
  }
})
