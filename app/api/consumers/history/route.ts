import { NextResponse, type NextRequest } from "next/server"
import { getHistoryForConsumer } from "@/lib/consumer-history"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(request: NextRequest) {
  // History is visible to all authenticated users (agency sees their own consumers).
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const consumerId = request.nextUrl.searchParams.get("id")
  if (!consumerId) {
    return NextResponse.json({ error: "Missing ?id=" }, { status: 400 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const entries = await getHistoryForConsumer(consumerId, spreadsheetId)
    return NextResponse.json(entries, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    console.error("History fetch error:", e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
})
