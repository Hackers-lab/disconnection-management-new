import { NextRequest, NextResponse } from "next/server"
import { generateOtp, verifyOtp, createVerificationToken } from "@/lib/otp-service"

export const dynamic = "force-dynamic"

function cleanEnv(value: string | undefined): string {
  return (value || "").replace(/^["']|["']$/g, "").trim()
}

/**
 * Verifies a Firebase Auth ID token server-side via Google's Identity Toolkit API
 * and ensures the verified phone number matches the expected 10-digit mobile number.
 */
async function verifyFirebasePhoneIdToken(
  idToken: string,
  expectedMobile10: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = cleanEnv(process.env.FIREBASE_API_KEY) || cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)
  if (!apiKey) {
    return { ok: false, error: "Firebase verification is not configured on the server." }
  }

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        cache: "no-store",
      }
    )

    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !Array.isArray(data.users) || data.users.length === 0) {
      return { ok: false, error: "Invalid or expired Firebase OTP verification token. Please verify again." }
    }

    const userPhoneRaw = String(data.users[0]?.phoneNumber || "")
    const userPhone10 = userPhoneRaw.replace(/\D/g, "").slice(-10)
    if (!userPhone10 || userPhone10 !== expectedMobile10) {
      return { ok: false, error: "Verified phone number does not match the requested mobile number." }
    }

    return { ok: true }
  } catch (err) {
    console.error("Firebase ID token lookup error:", err)
    return { ok: false, error: "Could not verify OTP with authentication service. Please try again." }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mobileNumber, otp, firebaseIdToken } = body

    const cleanMobile = String(mobileNumber || "").replace(/\D/g, "").slice(-10)
    if (!cleanMobile || !/^\d{10}$/.test(cleanMobile)) {
      return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 })
    }

    // 1. Send Server OTP (local development fallback)
    if (action === "send") {
      const { otp: generatedOtp, expiresAt } = generateOtp(cleanMobile)
      return NextResponse.json({
        success: true,
        message: `OTP sent successfully to +91 ${cleanMobile}.`,
        expiresAt,
        ...(process.env.NODE_ENV !== "production" ? { devOtp: generatedOtp } : {}),
      })
    }

    // 2. Server-side verification of Firebase Phone Auth ID token
    if (action === "firebase-verified") {
      if (!firebaseIdToken || typeof firebaseIdToken !== "string") {
        return NextResponse.json(
          { error: "Missing Firebase verification proof. Please verify your OTP again." },
          { status: 401 }
        )
      }

      const check = await verifyFirebasePhoneIdToken(firebaseIdToken, cleanMobile)
      if (!check.ok) {
        return NextResponse.json({ error: check.error || "Firebase OTP verification failed." }, { status: 401 })
      }

      const verificationToken = createVerificationToken(cleanMobile)
      return NextResponse.json({
        success: true,
        message: "Mobile number verified via Firebase.",
        verificationToken,
      })
    }

    // 3. Verify Server OTP
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

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error: any) {
    console.error("OTP API Error:", error)
    return NextResponse.json({ error: error?.message || "Failed to process OTP request." }, { status: 500 })
  }
}
