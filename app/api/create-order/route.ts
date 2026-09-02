import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"
import { createSubscriptionOrder } from "@/lib/razorpay"

export const dynamic = "force-dynamic"

/**
 * Endpoint to create a Razorpay Order strictly for vendor subscriptions.
 * POST /api/create-order
 */
export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: Please log in to continue" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { amount = 9900, planName = "1 Month Vendor Access", days = 30 } = body

    // Enforce minimum 100 paise
    const parsedAmount = typeof amount === "number" ? amount : parseInt(amount, 10)
    if (isNaN(parsedAmount) || parsedAmount < 100) {
      return NextResponse.json(
        { error: "Invalid amount. Minimum subscription charge is 100 paise (₹1.00)" },
        { status: 400 }
      )
    }

    const orderData = await createSubscriptionOrder({
      amount: parsedAmount,
      currency: "INR",
      receipt: `sub_${session.userId}_${Date.now()}`,
      notes: {
        userId: session.userId,
        username: session.username,
        role: session.role,
        cccCode: session.cccCode || "",
        planName,
        days: String(days),
      },
    })

    return NextResponse.json({
      success: true,
      ...orderData,
    })
  } catch (error: any) {
    console.error("POST /api/create-order error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create payment order" },
      { status: 500 }
    )
  }
})
