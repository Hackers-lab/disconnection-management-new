import { NextRequest, NextResponse } from "next/server"
import { generateOtp, verifyOtp, createVerificationToken } from "@/lib/otp-service"

export const dynamic = "force-dynamic"

const ALLOWED_PHONE_EMAIL_HOSTS = new Set(["user.phone.email"])

function cleanEnv(value: string | undefined): string {
  return (value || "").replace(/^["']|["']$/g, "").trim()
}

/**
 * Strictly validates a Phone.Email user_json_url against an exact HTTPS host allowlist
 * to prevent SSRF, open redirects, or arbitrary outbound fetches.
 */
function parseSafePhoneEmailUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== "https:") return null
    if (!ALLOWED_PHONE_EMAIL_HOSTS.has(parsed.hostname.toLowerCase())) return null
    if (parsed.port !== "") return null
    if (!parsed.pathname.endsWith(".json") || parsed.pathname.includes("..")) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Fetches verified phone details from Phone.Email's user_json_url server-side.
 */
async function verifyPhoneEmailJsonUrl(
  rawUserJsonUrl: string,
  expectedMobile10?: string
): Promise<{ ok: boolean; verifiedMobile?: string; countryCode?: string; error?: string }> {
  const safeUrl = parseSafePhoneEmailUrl(rawUserJsonUrl)
  if (!safeUrl) {
    return { ok: false, error: "Invalid verification URL received from Phone.Email." }
  }

  try {
    const resp = await fetch(safeUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      return { ok: false, error: "Phone verification expired or could not be confirmed. Please try again." }
    }

    const data = await resp.json().catch(() => null)
    if (!data || typeof data !== "object") {
      return { ok: false, error: "Unexpected response from Phone.Email verification service." }
    }

    const rawPhone = String(data.user_phone_number || "").trim()
    const rawCountry = String(data.user_country_code || "+91").trim()
    const verifiedMobile10 = rawPhone.replace(/\D/g, "").slice(-10)

    if (!verifiedMobile10 || !/^\d{10}$/.test(verifiedMobile10)) {
      return { ok: false, error: "Could not read a valid 10-digit mobile number from Phone.Email." }
    }

    if (expectedMobile10 && verifiedMobile10 !== expectedMobile10) {
      const maskedExpected = `${expectedMobile10.slice(0, 3)}•••••${expectedMobile10.slice(-2)}`
      const maskedVerified = `${verifiedMobile10.slice(0, 3)}•••••${verifiedMobile10.slice(-2)}`
      return {
        ok: false,
        error: `You verified +91 ${maskedVerified}, which does not match the registered mobile (+91 ${maskedExpected}). Please verify with your registered number.`,
      }
    }

    return {
      ok: true,
      verifiedMobile: verifiedMobile10,
      countryCode: rawCountry,
    }
  } catch (err) {
    console.error("Phone.Email verification fetch error:", err)
    return { ok: false, error: "Could not reach Phone.Email verification server. Please try again." }
  }
}

/**
 * Verifies a Firebase Auth ID token server-side via Google's Identity Toolkit API
 * (retained for backwards compatibility if Firebase Phone Auth is used).
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
    const { action, mobileNumber, expectedMobileNumber, otp, firebaseIdToken, userJsonUrl } = body

    // 1. Verify via Phone.Email user_json_url (Primary OTP flow)
    if (action === "phone-email-verified") {
      if (!userJsonUrl || typeof userJsonUrl !== "string") {
        return NextResponse.json({ error: "Missing Phone.Email verification URL." }, { status: 400 })
      }

      const cleanExpected = expectedMobileNumber
        ? String(expectedMobileNumber).replace(/\D/g, "").slice(-10)
        : undefined
      if (expectedMobileNumber && (!cleanExpected || !/^\d{10}$/.test(cleanExpected))) {
        return NextResponse.json({ error: "Invalid expected mobile number." }, { status: 400 })
      }

      const result = await verifyPhoneEmailJsonUrl(userJsonUrl, cleanExpected)
      if (!result.ok || !result.verifiedMobile) {
        return NextResponse.json(
          { error: result.error || "Phone.Email verification failed." },
          { status: 401 }
        )
      }

      const verificationToken = createVerificationToken(result.verifiedMobile)
      return NextResponse.json({
        success: true,
        message: "Mobile number verified successfully.",
        verifiedMobile: result.verifiedMobile,
        countryCode: result.countryCode || "+91",
        verificationToken,
      })
    }

    const cleanMobile = String(mobileNumber || "").replace(/\D/g, "").slice(-10)
    if (!cleanMobile || !/^\d{10}$/.test(cleanMobile)) {
      return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 })
    }

    // 2. Send Server OTP (local development fallback)
    if (action === "send") {
      const { otp: generatedOtp, expiresAt } = generateOtp(cleanMobile)
      return NextResponse.json({
        success: true,
        message: `OTP sent successfully to +91 ${cleanMobile}.`,
        expiresAt,
        ...(process.env.NODE_ENV !== "production" ? { devOtp: generatedOtp } : {}),
      })
    }

    // 3. Server-side verification of Firebase Phone Auth ID token (Legacy compatibility)
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

    // 4. Verify Server OTP
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
