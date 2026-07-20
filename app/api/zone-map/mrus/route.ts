import { NextRequest, NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(req: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const spreadsheetId = getSpreadsheetId()
    const consumers = await fetchConsumerData(spreadsheetId)
    const mruSet = new Set<string>()
    consumers.forEach(c => { if (c.mru) mruSet.add(c.mru.trim().toUpperCase()) })
    const sorted = Array.from(mruSet).sort()
    return NextResponse.json(sorted, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
})
