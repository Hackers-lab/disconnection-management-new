import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { receiveReturnedOldMeter } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.isSubscribed) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 })
  }

  try {
    const body = await request.json()
    const { issueId, returnDate, condition, remarks } = body

    if (!issueId || !returnDate || !condition) {
      return NextResponse.json({ error: "Issue ID, return date, and condition are required" }, { status: 400 })
    }

    await receiveReturnedOldMeter({
      issueId,
      returnDate,
      receivedBy: session.username || session.role,
      condition,
      remarks: remarks || "",
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Return to office error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
