import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { fetchDTRData } from "@/lib/dtr-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { parseTs } from "@/lib/date-utils"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  let authRes = await checkApiPermission("dtr", "read")
  if (!authRes.authorized) {
    authRes = await checkApiPermission("dtr_painting", "read")
  }
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 401 })
  }

  const { searchParams } = new URL(req.url)
  const sinceTs = parseInt(searchParams.get("since_ts") || "0", 10)

  try {
    const spreadsheetId = getSpreadsheetId()
    const allRecords = await fetchDTRData(spreadsheetId)
    const session = authRes.session

    const modified = allRecords.filter((rec: any) => {
      if (isAgencyScopeRestricted(session, rec.paintingAgency || rec.agency)) return false
      if (!sinceTs) return true
      const recTs = parseTs(rec.updatedAt || rec.verifiedAt || rec.createdAt || "")
      return recTs >= sinceTs
    })

    return NextResponse.json(
      {
        serverTimestamp: Date.now(),
        patchCount: modified.length,
        patchData: modified,
        tombstones: [],
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
          "Vary": "Cookie, Authorization",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json({ patchCount: 0, patchData: [] }, { status: 500 })
  }
})
