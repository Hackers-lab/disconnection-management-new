import { NextRequest, NextResponse } from "next/server"
import { verifySession, createSession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { withTenant } from "@/lib/tenant-context"
import { verifySubscriptionSignature, getRazorpayClient } from "@/lib/razorpay"
import { getPlanByAmount } from "@/lib/subscription-plans"
import { invalidateAgencyCache } from "@/lib/agency-storage"
import { db } from "@/lib/db"
import { randomUUID } from "crypto"

export const dynamic = "force-dynamic"

/**
 * Endpoint to verify Razorpay payment signature and activate vendor subscription.
 * POST /api/verify-payment
 *
 * 1. Cryptographically verifies Razorpay signature (HMAC-SHA256).
 * 2. Fetches Razorpay Order server-side to confirm the actual paid amount.
 * 3. Maps amount to predefined server-side plan catalog.
 * 4. Activates subscription for the entire Agency in that CCC (agencies table).
 * 5. Cascades active subscription to ALL users (supervisors, linemen, operators)
 *    belonging to that agency in that CCC.
 * 6. Records transaction with agency & CCC metadata in payment_transactions table.
 * 7. Re-issues active JWT session cookie for instant access without re-login.
 */
export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required payment verification parameters" },
        { status: 400 }
      )
    }

    // Step 1: Verify cryptographic signature
    const isValid = verifySubscriptionSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })

    if (!isValid) {
      console.warn(`⚠️ [Razorpay Fraud Alert] Signature mismatch for user ${session.username} (Order: ${razorpay_order_id})`)
      return NextResponse.json(
        { error: "Payment verification failed: Invalid payment signature" },
        { status: 400 }
      )
    }

    // Step 2: Fetch the Razorpay order to get the actual paid amount
    let orderAmount: number
    try {
      const razorpay = getRazorpayClient()
      const order = await razorpay.orders.fetch(razorpay_order_id)
      orderAmount = typeof order.amount === "number" ? order.amount : parseInt(String(order.amount), 10)
    } catch (fetchErr: any) {
      console.error(`[Razorpay] Failed to fetch order ${razorpay_order_id}:`, fetchErr)
      return NextResponse.json(
        { error: "Unable to verify order details with payment provider" },
        { status: 502 }
      )
    }

    // Step 3: Look up the plan from server-side catalog using the actual paid amount
    const plan = getPlanByAmount(orderAmount)
    if (!plan) {
      console.warn(`⚠️ [Razorpay] Order ${razorpay_order_id} has amount ${orderAmount} which doesn't match any plan`)
      return NextResponse.json(
        { error: "Payment amount does not match any subscription plan" },
        { status: 400 }
      )
    }

    // Step 4: Identify agency, vendor code, and CCC context
    const rawAgencies = session.agencies || []
    const agencyName = rawAgencies.length > 0 ? rawAgencies[0] : session.username
    const cccCode = session.cccCode || ""

    const now = new Date()
    let baseDate = new Date()
    let foundVendorCode = ""

    // Check if the agency already has an active subscription in the agencies table
    if (cccCode) {
      try {
        const agencyRes = await db.execute({
          sql: `SELECT a.id, a.vendor_code, a.subscription_expires_at, a.subscription_status
                FROM agencies a
                JOIN ccc_registry c ON a.ccc_id = c.id
                WHERE c.ccc_code = ? COLLATE NOCASE
                  AND (a.name = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE OR a.vendor_code = ? COLLATE NOCASE)
                LIMIT 1`,
          args: [cccCode, agencyName, session.username, agencyName]
        })

        if (agencyRes.rows && agencyRes.rows.length > 0) {
          const aRow: any = agencyRes.rows[0]
          if (aRow.vendor_code) foundVendorCode = String(aRow.vendor_code)
          if (aRow.subscription_expires_at) {
            const agExp = new Date(aRow.subscription_expires_at)
            if (!isNaN(agExp.getTime()) && agExp > now) {
              baseDate = agExp
            }
          }
        }
      } catch (agErr) {
        console.warn("[Agency Lookup Warning]:", agErr)
      }
    }

    // Fallback: check session expiration date
    if (session.subscriptionExpiresAt && baseDate.getTime() === now.getTime()) {
      const existingExp = new Date(session.subscriptionExpiresAt)
      if (!isNaN(existingExp.getTime()) && existingExp > now) {
        baseDate = existingExp
      }
    }

    baseDate.setDate(baseDate.getDate() + plan.days)
    const expiresAt = baseDate.toISOString().split("T")[0]

    // Step 5: Update database records
    // Update agency record in agencies table (Single Source of Truth)
    if (cccCode && agencyName) {
      try {
        await db.execute({
          sql: `UPDATE agencies
                SET subscription_status = 'active',
                    subscription_expires_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE ccc_id = (SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1)
                  AND (name = ? COLLATE NOCASE OR name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE)`,
          args: [expiresAt, cccCode, agencyName, session.username, agencyName]
        })
        invalidateAgencyCache(cccCode)
      } catch (agUpErr) {
        console.error("[Agency Subscription Update Error]:", agUpErr)
      }
    }

    // Step 6: Record payment transaction for immutable audit trail
    try {
      await db.execute({
        sql: `INSERT INTO payment_transactions (id, user_id, ccc_code, agency_name, vendor_code, razorpay_order_id, razorpay_payment_id, amount, currency, plan_id, plan_name, days_granted, subscription_expires_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          session.userId,
          cccCode,
          agencyName,
          foundVendorCode || null,
          razorpay_order_id,
          razorpay_payment_id,
          orderAmount,
          plan.id,
          plan.name,
          plan.days,
          expiresAt,
        ],
      })
    } catch (txErr) {
      console.error("[Payment Audit] Failed to record transaction:", txErr)
    }

    // Step 7: Refresh the JWT session cookie with updated subscription data
    try {
      await createSession(
        session.userId,
        session.username,
        session.role,
        session.agencies || [],
        session.cccCode,
        session.name || "",
        "active",
        expiresAt,
        session.bypassSubscription || false
      )
    } catch (sessionErr) {
      console.error("[Session Refresh] Failed to refresh JWT cookie:", sessionErr)
    }

    console.log(
      `🎉 [Razorpay Success] Vendor '${agencyName}' (User: ${session.username}, CCC: ${cccCode}) verified payment ${razorpay_payment_id}. Plan: ${plan.name}. Subscription active until ${expiresAt}.`
    )

    return NextResponse.json({
      success: true,
      verified: true,
      expiresAt,
      agencyName,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      planName: plan.name,
      message: `Agency subscription successfully activated until ${expiresAt}`,
    })
  } catch (error: any) {
    console.error("POST /api/verify-payment error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to verify payment" },
      { status: 500 }
    )
  }
})
