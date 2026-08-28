import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { savePushSubscription } from "@/lib/web-push"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { subscription } = body

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 })
    }

    const result = await savePushSubscription(subscription, {
      userId: session.userId,
      username: session.username || "user",
      cccCode: session.cccCode || "SYSTEM",
      role: session.role || "user"
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to save subscription" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Subscription saved successfully" })
  } catch (err: any) {
    console.error("[api/notifications/subscribe] Error:", err)
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
