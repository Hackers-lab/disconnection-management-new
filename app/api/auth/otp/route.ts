import { NextRequest, NextResponse } from "next/server"
import { generateOtp, verifyOtp } from "@/lib/otp-service"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mobileNumber, otp } = body

    if (!mobileNumber || !/^\d{10}$/.test(String(mobileNumber).trim())) {
      return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 })
    }

    const cleanMobile = String(mobileNumber).trim()

    // 1. Send OTP
    if (action === "send") {
      const { otp: generatedOtp, expiresAt } = generateOtp(cleanMobile)
      return NextResponse.json({
        success: true,
        message: `OTP sent successfully to +91 ${cleanMobile}.`,
        expiresAt,
        // In local development, return devOtp for convenience
        ...(process.env.NODE_ENV !== "production" ? { devOtp: generatedOtp } : {})
      })
    }

    // 2. Verify OTP
    if (action === "verify") {
      if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
        return NextResponse.json({ error: "Please enter a valid 6-digit OTP code." }, { status: 400 })
      }

      const verification = verifyOtp(cleanMobile, String(otp).trim())
      if (!verification.success) {
        return NextResponse.json({ error: verification.message || "OTP verification failed." }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: "Mobile number verified successfully.",
        verificationToken: verification.verificationToken,
      })
    }

    return NextResponse.json({ error: "Invalid action. Must be 'send' or 'verify'." }, { status: 400 })
  } catch (error: any) {
    console.error("OTP API Error:", error)
    return NextResponse.json({ error: error.message || "Failed to process OTP request." }, { status: 500 })
  }
}
