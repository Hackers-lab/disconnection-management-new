import crypto from "crypto"

interface OtpEntry {
  code: string
  expiresAt: number
  attempts: number
}

// In-memory OTP storage with automatic TTL cleanup
const otpStore = new Map<string, OtpEntry>()

const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex")

function getOtpSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    EPHEMERAL_FALLBACK_SECRET
  )
}

/**
 * Generate a 6-digit random numeric OTP
 */
export function generateOtp(mobileNumber: string): { otp: string; expiresAt: number } {
  const cleanMobile = mobileNumber.replace(/\D/g, "").slice(-10)

  // Generate cryptographically secure 6-digit code
  const code = crypto.randomInt(100000, 1000000).toString()
  const expiresAt = Date.now() + OTP_TTL_MS

  otpStore.set(cleanMobile, {
    code,
    expiresAt,
    attempts: 0,
  })

  if (process.env.NODE_ENV !== "production") {
    console.log(`📱 [OTP GENERATED] Mobile: ${cleanMobile} | OTP: ${code} (Expires in 5 mins)`)
  }
  return { otp: code, expiresAt }
}

/**
 * Verify submitted OTP against stored code
 */
export function verifyOtp(mobileNumber: string, submittedCode: string): { success: boolean; message?: string; verificationToken?: string } {
  const cleanMobile = mobileNumber.replace(/\D/g, "").slice(-10)
  const entry = otpStore.get(cleanMobile)

  if (!entry) {
    return { success: false, message: "No active OTP request found. Please request a new OTP." }
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cleanMobile)
    return { success: false, message: "OTP has expired. Please request a new one." }
  }

  if (entry.attempts >= 5) {
    otpStore.delete(cleanMobile)
    return { success: false, message: "Too many failed attempts. Please request a new OTP." }
  }

  entry.attempts += 1

  const expectedBuf = Buffer.from(entry.code, "utf8")
  const submittedBuf = Buffer.from(submittedCode.trim(), "utf8")
  if (expectedBuf.length !== submittedBuf.length || !crypto.timingSafeEqual(expectedBuf, submittedBuf)) {
    return { success: false, message: "Invalid OTP code. Please check and try again." }
  }

  // OTP verified successfully! Clear stored entry and generate verification signature
  otpStore.delete(cleanMobile)
  const verificationToken = createVerificationToken(cleanMobile)

  return {
    success: true,
    verificationToken,
  }
}

/**
 * Creates an HMAC verification token valid for 15 minutes
 */
export function createVerificationToken(mobileNumber: string): string {
  const cleanMobile = mobileNumber.replace(/\D/g, "").slice(-10)
  const expires = Date.now() + 15 * 60 * 1000 // 15 minutes
  const payload = `${cleanMobile}:${expires}`
  const signature = crypto.createHmac("sha256", getOtpSecret()).update(payload).digest("hex")
  return Buffer.from(`${payload}:${signature}`).toString("base64")
}

/**
 * Verifies that the HMAC verification token is genuine and unexpired
 */
export function validateVerificationToken(mobileNumber: string, token: string): boolean {
  if (!token || typeof token !== "string") return false
  try {
    const cleanMobile = mobileNumber.replace(/\D/g, "").slice(-10)
    const decoded = Buffer.from(token, "base64").toString("utf8")
    const parts = decoded.split(":")
    if (parts.length !== 3) return false

    const [tokenMobile, expiresStr, signature] = parts
    if (tokenMobile !== cleanMobile) return false

    const expires = parseInt(expiresStr, 10)
    if (isNaN(expires) || Date.now() > expires) return false

    const expectedSignature = crypto.createHmac("sha256", getOtpSecret()).update(`${tokenMobile}:${expiresStr}`).digest("hex")
    const sigBuf = Buffer.from(signature, "utf8")
    const expBuf = Buffer.from(expectedSignature, "utf8")
    if (sigBuf.length !== expBuf.length) return false
    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}
