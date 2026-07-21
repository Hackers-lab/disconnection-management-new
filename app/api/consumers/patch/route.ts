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

    const spreadsheetId = getSpreadsheetId()
    let data = await fetchConsumerData(spreadsheetId)

    if (session?.agencies && session.agencies.length > 0) {
      const upperAgencies = session.agencies.map((a: string) => String(a || "").trim().toUpperCase())
      data = data.filter((c: any) => upperAgencies.includes(String(c.agency || "").trim().toUpperCase()))
    }

    if (data.length < 100) {
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      })
    }

    const fortyEightHoursAgo = new Date()
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48)

    const patchData = data.filter((consumer) => {
      if (!consumer.lastUpdated) return false
      
      let updatedDate: Date | null = null
      const dateStr = consumer.lastUpdated
    
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        updatedDate = new Date(dateStr)
      } else if (/^\d{2}-\d{2}-\d{4}/.test(dateStr)) {
        const [day, month, year] = dateStr.split(/[-/]/)
        updatedDate = new Date(`${year}-${month}-${day}`)
      } else {
        updatedDate = new Date(dateStr)
      }
      
      return updatedDate && !isNaN(updatedDate.getTime()) && updatedDate >= fortyEightHoursAgo
    })

    return NextResponse.json(patchData, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
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
