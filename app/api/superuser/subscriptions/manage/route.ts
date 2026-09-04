import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { db } from "@/lib/db"
import { getRazorpayClient } from "@/lib/razorpay"
import { invalidateAgencyCache } from "@/lib/agency-storage"

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, targetId, targetType, days, bypass, paymentId, refundAmount } = body

    if (action === "extend_days") {
      if (!targetId || !days || typeof days !== "number" || days <= 0) {
        return NextResponse.json({ error: "Invalid parameters for extending subscription" }, { status: 400 })
      }

      if (targetType === "agency") {
        const agId = targetId.replace("agency_", "")
        const agRes = await db.execute({
          sql: `SELECT id, name, ccc_id, subscription_expires_at FROM agencies WHERE id = ?`,
          args: [agId],
        })

        if (!agRes.rows || agRes.rows.length === 0) {
          return NextResponse.json({ error: "Agency not found" }, { status: 404 })
        }

        const agency: any = agRes.rows[0]
        const currentExp = agency.subscription_expires_at ? new Date(agency.subscription_expires_at) : new Date()
        const baseDate = isNaN(currentExp.getTime()) || currentExp < new Date() ? new Date() : currentExp
        baseDate.setDate(baseDate.getDate() + days)
        const newExpiryStr = baseDate.toISOString().split("T")[0]

        await db.execute({
          sql: `UPDATE agencies SET subscription_status = 'active', subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [newExpiryStr, agId],
        })

        // Invalidate in-memory cache
        invalidateAgencyCache()

        return NextResponse.json({
          success: true,
          message: `Extended ${agency.name} by ${days} days until ${newExpiryStr}`,
          newExpiry: newExpiryStr,
        })
      } else {
        const uId = targetId.replace("user_", "")
        const uRes = await db.execute({
          sql: `SELECT id, username, subscription_expires_at FROM users WHERE id = ?`,
          args: [uId],
        })

        if (!uRes.rows || uRes.rows.length === 0) {
          return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        const user: any = uRes.rows[0]
        const currentExp = user.subscription_expires_at ? new Date(user.subscription_expires_at) : new Date()
        const baseDate = isNaN(currentExp.getTime()) || currentExp < new Date() ? new Date() : currentExp
        baseDate.setDate(baseDate.getDate() + days)
        const newExpiryStr = baseDate.toISOString().split("T")[0]

        await db.execute({
          sql: `UPDATE users SET subscription_status = 'active', subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [newExpiryStr, uId],
        })

        return NextResponse.json({
          success: true,
          message: `Extended ${user.username} by ${days} days until ${newExpiryStr}`,
          newExpiry: newExpiryStr,
        })
      }
    } else if (action === "toggle_bypass") {
      const uId = targetId.replace("user_", "")
      const newBypass = bypass ? 1 : 0

      await db.execute({
        sql: `UPDATE users SET bypass_subscription = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [newBypass, uId],
      })

      return NextResponse.json({
        success: true,
        message: `Updated free pass bypass status to ${bypass ? "Enabled" : "Disabled"}`,
      })
    } else if (action === "refund_payment") {
      if (!paymentId) {
        return NextResponse.json({ error: "Payment ID is required to process refund" }, { status: 400 })
      }

      const razorpay = getRazorpayClient()
      const refundOptions: any = {
        notes: {
          refunded_by: session.username,
          reason: "Superadmin initiated refund",
        },
      }

      if (refundAmount && typeof refundAmount === "number" && refundAmount > 0) {
        refundOptions.amount = Math.round(refundAmount * 100) // in paise
      }

      const refund = await razorpay.payments.refund(paymentId, refundOptions)

      return NextResponse.json({
        success: true,
        message: `Refund of ₹${refund.amount / 100} initiated successfully (Refund ID: ${refund.id})`,
        refund,
      })
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error: any) {
    console.error("[Subscriptions Manage Error]:", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
