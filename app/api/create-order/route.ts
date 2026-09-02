import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"
import { createSubscriptionOrder } from "@/lib/razorpay"
import { getPlanByAmount, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans"

export const dynamic = "force-dynamic"

/**
 * Endpoint to create a Razorpay Order strictly for vendor subscriptions.
 * POST /api/create-order
 *
 * Only accepts amounts that match predefined subscription plans.
 * The `days` field is derived server-side from the plan catalog — never from the client.
 */
export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: Please log in to continue" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { amount = 9900 } = body

    // Enforce that amount matches a predefined subscription plan
    const parsedAmount = typeof amount === "number" ? amount : parseInt(amount, 10)
    const plan = getPlanByAmount(parsedAmount)

    if (!plan) {
      return NextResponse.json(
        {
          error: `Invalid plan amount. Allowed plans: ${SUBSCRIPTION_PLANS.map((p) => `₹${(p.amount / 100).toFixed(0)} (${p.name})`).join(", ")}`,
        },
        { status: 400 }
      )
    }

    const orderData = await createSubscriptionOrder({
      amount: plan.amount,
      currency: "INR",
      receipt: `sub_${session.userId}_${Date.now()}`,
      notes: {
        userId: session.userId,
        username: session.username,
        role: session.role,
        cccCode: session.cccCode || "",
        planId: plan.id,
        planName: plan.name,
        days: String(plan.days),
      },
    })

    return NextResponse.json({
      success: true,
      ...orderData,
      planId: plan.id,
      planName: plan.name,
      days: plan.days,
    })
  } catch (error: any) {
    console.error("POST /api/create-order error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create payment order" },
      { status: 500 }
    )
  }
})
