import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * This endpoint has been disabled.
 * All subscription payments must go through Razorpay (/api/create-order + /api/verify-payment).
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: "This endpoint has been disabled. Please use Razorpay checkout for subscription payments." },
    { status: 410 }
  )
}
