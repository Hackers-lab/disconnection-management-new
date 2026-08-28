import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { sendPushNotification } from "@/lib/web-push"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const isSuperuser = session.role === "superuser"
    const isAdmin = session.role === "admin" || session.role === "executive"

    if (!isSuperuser && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Only Superadmins and CCC Admins can broadcast notifications" }, { status: 403 })
    }

    const body = await req.json()
    const { title, message, url, targetCcc, targetUserId, targetRole, priority } = body

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 })
    }

    // Office Admins are strictly scoped to their own CCC
    let effectiveTargetCcc = targetCcc
    if (!isSuperuser) {
      effectiveTargetCcc = session.cccCode || "SYSTEM"
    }

    const result = await sendPushNotification({
      title: `${priority === "urgent" ? "🚨 " : "⚡ "}${title.trim()}`,
      body: message.trim(),
      url: url || "/dashboard",
      targetCcc: effectiveTargetCcc,
      targetUserId: targetUserId || undefined,
      targetRole: targetRole || undefined,
      senderName: session.username || "System Admin",
      tag: `wbsedcl-alert-${Date.now()}`
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send broadcast" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      sentCount: result.sentCount,
      totalSubscribers: result.totalSubscribers || 0,
      expiredRemoved: result.expiredRemoved || 0,
      message: `Successfully delivered notification to ${result.sentCount} connected device(s).`
    })
  } catch (err: any) {
    console.error("[api/notifications/send] Error:", err)
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
