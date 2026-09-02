import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { withTenant } from "@/lib/tenant-context"
import { verifySubscriptionSignature } from "@/lib/razorpay"

export const dynamic = "force-dynamic"

/**
 * Endpoint to verify Razorpay payment signature and activate vendor subscription.
 * POST /api/verify-payment
 */
export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, days = 30 } = body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required payment verification parameters" },
        { status: 400 }
      )
    }

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

    // Calculate extended expiration date
    const extensionDays = typeof days === "number" && days > 0 ? days : 30
    const now = new Date()
    let baseDate = new Date()

    if (session.subscriptionExpiresAt) {
      const existingExp = new Date(session.subscriptionExpiresAt)
      if (!isNaN(existingExp.getTime()) && existingExp > now) {
        baseDate = existingExp
      }
    }

    baseDate.setDate(baseDate.getDate() + extensionDays)
    const expiresAt = baseDate.toISOString().split("T")[0]

    // Update user subscription state in userStorage
    const updatedUser = await userStorage.updateUser(session.userId, {
      subscriptionStatus: "active",
      subscriptionExpiresAt: expiresAt,
    })

    if (!updatedUser) {
      return NextResponse.json({ error: "User record not found" }, { status: 404 })
    }

    console.log(
      `🎉 [Razorpay Success] Vendor ${session.username} (${session.userId}) verified payment ${razorpay_payment_id}. Subscription active until ${expiresAt}.`
    )

    return NextResponse.json({
      success: true,
      verified: true,
      expiresAt,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      message: `Vendor subscription successfully activated until ${expiresAt}`,
    })
  } catch (error: any) {
    console.error("POST /api/verify-payment error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to verify payment" },
      { status: 500 }
    )
  }
})
