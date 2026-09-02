import Razorpay from "razorpay"
import crypto from "crypto"

/**
 * Razorpay client instance helper for Vendor Subscriptions.
 * Credentials must be provided via environment variables:
 * - RAZORPAY_KEY_ID or NEXT_PUBLIC_RAZORPAY_KEY_ID
 * - RAZORPAY_KEY_SECRET
 */
export function getRazorpayClient(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET

  if (!key_id || !key_secret) {
    throw new Error(
      "Razorpay credentials are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables."
    )
  }

  return new Razorpay({
    key_id,
    key_secret,
  })
}

export interface CreateOrderParams {
  amount: number // in paise (e.g. 9900 for ₹99)
  currency?: string
  receipt?: string
  notes?: Record<string, string>
}

/**
 * Creates a Razorpay Order strictly for vendor subscriptions.
 * Minimum amount is 100 paise (₹1).
 */
export async function createSubscriptionOrder(params: CreateOrderParams) {
  const { amount, currency = "INR", receipt, notes = {} } = params

  if (!amount || amount < 100) {
    throw new Error("Invalid order amount. Minimum amount is 100 paise (₹1).")
  }

  const razorpay = getRazorpayClient()
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID

  const orderOptions = {
    amount: Math.round(amount),
    currency,
    receipt: receipt || `rcpt_sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    notes: {
      purpose: "vendor_subscription",
      ...notes,
    },
  }

  const order = await razorpay.orders.create(orderOptions)

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id,
  }
}

export interface VerifySignatureParams {
  orderId: string
  paymentId: string
  signature: string
}

/**
 * Validates the Razorpay payment signature using HMAC-SHA256.
 * Signature verification prevents payment tampering.
 */
export function verifySubscriptionSignature(params: VerifySignatureParams): boolean {
  const { orderId, paymentId, signature } = params
  const key_secret = process.env.RAZORPAY_KEY_SECRET

  if (!key_secret) {
    console.error("[Razorpay] Missing RAZORPAY_KEY_SECRET in environment.")
    return false
  }

  if (!orderId || !paymentId || !signature) {
    return false
  }

  try {
    const generatedSignature = crypto
      .createHmac("sha256", key_secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex")

    // Use timingSafeEqual to protect against timing attacks
    const a = Buffer.from(generatedSignature, "utf8")
    const b = Buffer.from(signature, "utf8")

    if (a.length !== b.length) {
      return false
    }

    return crypto.timingSafeEqual(a, b)
  } catch (error) {
    console.error("[Razorpay Signature Verification Error]:", error)
    return false
  }
}
