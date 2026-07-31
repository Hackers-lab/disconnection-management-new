import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { fetchApplications } from "@/lib/nsc-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

import { parseTs } from "@/lib/date-utils"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("nsc", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 401 })
  }

  const { searchParams } = new URL(req.url)
  const sinceTs = parseInt(searchParams.get("since_ts") || "0", 10)

  try {
    const spreadsheetId = getSpreadsheetId()
    const allRecords = await fetchApplications(spreadsheetId)
    const session = authRes.session

    const modified = allRecords.filter((rec: any) => {
      if (isAgencyScopeRestricted(session, rec.agency)) return false
      if (!sinceTs) return true
      const recTs = Math.max(
        parseTs(rec.createdAt || ""),
        parseTs(rec.inspectedAt || ""),
        parseTs(rec.finalizedAt || ""),
        parseTs(rec.meterIssuedAt || ""),
        parseTs(rec.connectionEffectedAt || ""),
        parseTs(rec.receivedDate || "")
      )
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
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json({ patchCount: 0, patchData: [] }, { status: 500 })
  }
})
