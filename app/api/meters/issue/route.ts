import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchIssues, _fetchIssuesRaw, issueMeter } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = getSpreadsheetId()
  const bypass = request.nextUrl.searchParams.get("bypassCache") === "true" || request.nextUrl.searchParams.get("t") !== null
  const all = bypass ? await _fetchIssuesRaw(id) : await fetchIssues(id)

  if (session.role === "agency") {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(i => upper.includes(i.agency.toUpperCase())), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  }
  return NextResponse.json(all, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  })
})
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    const issueId = await issueMeter({
      serialNo:     body.serialNo,
      purpose:      body.purpose,
      consumerId:   body.consumerId  || "",
      nscReceiveNo: body.nscReceiveNo || "",
      consumerName: body.consumerName || "",
      agency:       body.agency,
      remarks:      body.remarks || "",
      address:      body.address || "",
      mobile:       body.mobile  || "",
      replacementId: body.replacementId || "",
    })
    return NextResponse.json({ success: true, issueId })
  } catch (e: any) {
    console.error("Issue meter error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
