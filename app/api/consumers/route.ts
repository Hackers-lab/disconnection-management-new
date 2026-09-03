import { NextRequest, NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"
import { verifySession } from "@/lib/session"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const GET = withTenant(async function GET(req: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!session.isSubscribed) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 })
  }

  try {
    const tenantConfig = await getTenantConfig(session.cccCode)
    const data = await fetchConsumerData(tenantConfig.spreadsheetId)
    //console.log(`✅ API: Successfully fetched ${data.length} consumers`)

    // Add some sample data to ensure the API works
    if (data.length === 0) {
      console.log("⚠️ No data from sheet — returning empty array")
      return NextResponse.json([], { status: 200 })
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
        "Vary": "Cookie, Authorization",
      },
    })
  } catch (error) {
    console.error("💥 API /consumers error:", error)
    return NextResponse.json(
      { error: "Failed to fetch consumer data" },
      { status: 500 }
    )
  }
})
