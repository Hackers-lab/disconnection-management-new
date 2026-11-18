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
          sql: `SELECT a.id, a.name, a.vendor_code, a.ccc_id, a.subscription_expires_at, c.ccc_code 
                FROM agencies a
                LEFT JOIN ccc_registry c ON a.ccc_id = c.id
                WHERE a.id = ?`,
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

        // Also update corresponding agency user in users table
        try {
          await db.execute({
            sql: `UPDATE users 
                  SET subscription_status = 'active', 
                      subscription_expires_at = ?, 
                      updated_at = CURRENT_TIMESTAMP 
                  WHERE ccc_id = ? AND role = 'agency' AND (
                    full_name = ? COLLATE NOCASE 
                    OR username = ? COLLATE NOCASE 
                    OR agencies LIKE ?
                  )`,
            args: [newExpiryStr, agency.ccc_id, agency.name, agency.name, `%${agency.name}%`]
          })
        } catch (uSyncErr) {
          console.warn("[Extend Subscription] User sync warning:", uSyncErr)
        }

        // Invalidate in-memory cache
        invalidateAgencyCache(agency.ccc_code)

        return NextResponse.json({
          success: true,
          message: `Extended ${agency.name} by ${days} days until ${newExpiryStr}`,
          newExpiry: newExpiryStr,
        })
      } else {
        const uId = targetId.replace("user_", "")
        const uRes = await db.execute({
          sql: `SELECT u.id, u.username, u.full_name, u.ccc_id, u.agencies, u.subscription_expires_at, c.ccc_code 
                FROM users u
                LEFT JOIN ccc_registry c ON u.ccc_id = c.id
                WHERE u.id = ?`,
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

        // Also update corresponding agency in agencies table
        try {
          const userAgencies = user.agencies ? String(user.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
          const agencyCandidates = userAgencies.length > 0 ? userAgencies : [user.full_name || user.username]
          for (const ag of agencyCandidates) {
            if (!ag) continue
            await db.execute({
              sql: `UPDATE agencies 
                    SET subscription_status = 'active', 
                        subscription_expires_at = ?, 
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE ccc_id = ? AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE)`,
              args: [newExpiryStr, user.ccc_id, ag, ag]
            })
          }
          invalidateAgencyCache(user.ccc_code)
        } catch (agSyncErr) {
          console.warn("[Extend Subscription] Agency sync warning:", agSyncErr)
        }

        return NextResponse.json({
          success: true,
          message: `Extended ${user.username} by ${days} days until ${newExpiryStr}`,
          newExpiry: newExpiryStr,
        })
      }
    } else if (action === "expire_now") {
      const today = new Date().toISOString().split("T")[0]
      if (targetType === "agency") {
        const agId = targetId.replace("agency_", "")
        const agRes = await db.execute({
          sql: `SELECT a.id, a.name, a.ccc_id, c.ccc_code FROM agencies a LEFT JOIN ccc_registry c ON a.ccc_id = c.id WHERE a.id = ?`,
          args: [agId],
        })
        if (!agRes.rows || agRes.rows.length === 0) {
          return NextResponse.json({ error: "Agency not found" }, { status: 404 })
        }
        const agency: any = agRes.rows[0]
        await db.execute({
          sql: `UPDATE agencies SET subscription_status = 'expired', subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [today, agId],
        })
        try {
          await db.execute({
            sql: `UPDATE users SET subscription_status = 'expired', subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP 
                  WHERE ccc_id = ? AND role = 'agency' AND (full_name = ? COLLATE NOCASE OR username = ? COLLATE NOCASE OR agencies LIKE ?)`,
            args: [today, agency.ccc_id, agency.name, agency.name, `%${agency.name}%`]
          })
        } catch (e) {}
        invalidateAgencyCache(agency.ccc_code)
        return NextResponse.json({
          success: true,
          message: `Subscription for ${agency.name} has been expired immediately`,
        })
      } else {
        const uId = targetId.replace("user_", "")
        const uRes = await db.execute({
          sql: `SELECT u.id, u.username, u.full_name, u.ccc_id, u.agencies, c.ccc_code FROM users u LEFT JOIN ccc_registry c ON u.ccc_id = c.id WHERE u.id = ?`,
          args: [uId],
        })
        if (!uRes.rows || uRes.rows.length === 0) {
          return NextResponse.json({ error: "User not found" }, { status: 404 })
        }
        const user: any = uRes.rows[0]
        await db.execute({
          sql: `UPDATE users SET subscription_status = 'expired', subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [today, uId],
        })
        try {
          const userAgencies = user.agencies ? String(user.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
          const agencyCandidates = userAgencies.length > 0 ? userAgencies : [user.full_name || user.username]
          for (const ag of agencyCandidates) {
            if (!ag) continue
            await db.execute({
              sql: `UPDATE agencies SET subscription_status = 'expired', subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE ccc_id = ? AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE)`,
              args: [today, user.ccc_id, ag, ag]
            })
          }
          invalidateAgencyCache(user.ccc_code)
        } catch (e) {}
        return NextResponse.json({
          success: true,
          message: `Subscription for ${user.username} has been expired immediately`,
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
      const refAmt = typeof refund?.amount === "number" ? refund.amount / 100 : 0

      return NextResponse.json({
        success: true,
        message: `Refund of ₹${refAmt} initiated successfully (Refund ID: ${refund.id})`,
        refund,
      })
    } else if (action === "delete_payment") {
      if (!paymentId) {
        return NextResponse.json({ error: "Payment ID is required to remove transaction" }, { status: 400 })
      }

      // Record in deleted_payment_transactions so auto-reconciliation ignores it permanently
      try {
        await db.execute({
          sql: `INSERT OR REPLACE INTO deleted_payment_transactions (razorpay_payment_id, deleted_by, reason) VALUES (?, ?, ?)`,
          args: [paymentId, session.username || "superadmin", "Removed test payment"],
        })
      } catch (delLogErr) {
        console.warn("[Subscriptions Manage] Note logging deleted payment:", delLogErr)
      }

      // Delete from payment_transactions
      await db.execute({
        sql: `DELETE FROM payment_transactions WHERE razorpay_payment_id = ? OR id = ?`,
        args: [paymentId, paymentId],
      })

      return NextResponse.json({
        success: true,
        message: `Payment ${paymentId} removed successfully`,
      })
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error: any) {
    console.error("[Subscriptions Manage Error]:", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
