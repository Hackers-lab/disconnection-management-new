import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { fetchReplacements } from "@/lib/meter-replacement-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("meter_replacement", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 401 })
  }

  const { searchParams } = new URL(req.url)
  const sinceTs = parseInt(searchParams.get("since_ts") || "0", 10)

  try {
    const spreadsheetId = getSpreadsheetId()
    const allRecords = await fetchReplacements(spreadsheetId)
    const session = authRes.session

    const modified = allRecords.filter((rec: any) => {
      if (isAgencyScopeRestricted(session, rec.agency)) return false
      if (!sinceTs) return true
      const recTs = new Date(rec.updatedAt || rec.createdAt || 0).getTime()
      return recTs >= sinceTs
    })

    return NextResponse.json(
      {
        serverTimestamp: Date.now(),
        patchCount: modified.length,
        patchData: modified,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json({ patchCount: 0, patchData: [] }, { status: 500 })
  }
})
