import { NextRequest, NextResponse } from "next/server"
import { fetchDDData } from "@/lib/dd-service"
import { verifySession } from "@/lib/session"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const GET = withTenant(async function GET(req: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantConfig = await getTenantConfig(session.cccCode)
    const data = await fetchDDData(tenantConfig.spreadsheetId)
    
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
        "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
        "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
      },
    })
  } catch (error: any) {
    console.error("DD base fetch error:", error)
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 })
  }
})
