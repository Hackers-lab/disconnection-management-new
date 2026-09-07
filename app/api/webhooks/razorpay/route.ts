import { NextRequest, NextResponse } from "next/server"
import { reconcileCapturedPayment } from "@/lib/billing-reconcile"
import crypto from "crypto"

export const dynamic = "force-dynamic"

/**
 * Server-to-server Razorpay Webhook Endpoint
 * POST /api/webhooks/razorpay
 *
 * Automatically captures asynchronous payments (e.g. UPI Intent, Netbanking delays)
 * without requiring the user's mobile browser to stay open or call verify-payment.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-razorpay-signature") || ""

    // 1. Cryptographic signature check if webhook secret is configured
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex")

      const sigBuffer = Buffer.from(signature, "utf8")
      const expBuffer = Buffer.from(expectedSignature, "utf8")

      if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
        console.warn("⚠️ [Razorpay Webhook] Invalid webhook signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
      }
    }

    const event = JSON.parse(rawBody)
    const eventType = event.event

    console.log(`📡 [Razorpay Webhook Received] Event: ${eventType}`)

    // 2. Handle payment.captured or order.paid
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const paymentEntity = event.payload?.payment?.entity
      if (paymentEntity) {
        const result = await reconcileCapturedPayment(paymentEntity)
        console.log(`✅ [Razorpay Webhook Reconciled]:`, result)
        return NextResponse.json({ success: true, result })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("❌ [Razorpay Webhook Error]:", error)
    return NextResponse.json(
      { error: error?.message || "Internal webhook handler error" },
      { status: 500 }
    )
  }
}
