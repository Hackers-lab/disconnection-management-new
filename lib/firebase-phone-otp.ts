"use client"

import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth"
import { getFirebaseAuth, getFirebaseConfigError } from "@/lib/firebase-client"

export function clearRecaptchaVerifier(
  verifier: RecaptchaVerifier | null,
  containerId?: string
): null {
  if (verifier) {
    try {
      verifier.clear()
    } catch {
      // ignore cleanup errors if DOM node was already removed
    }
  }
  if (typeof document !== "undefined" && containerId) {
    const container = document.getElementById(containerId)
    if (container) {
      container.innerHTML = ""
    }
  }
  return null
}

/**
 * Safely creates a fresh invisible RecaptchaVerifier on a clean child mount node
 * using the REAL Firebase Auth instance (never a Proxy), then sends the SMS OTP.
 */
export async function sendFirebasePhoneOtp(
  containerId: string,
  mobile10Digits: string,
  previousVerifier: RecaptchaVerifier | null,
  onExpired?: () => void
): Promise<{ confirmationResult: ConfirmationResult; verifier: RecaptchaVerifier }> {
  const configError = getFirebaseConfigError()
  const auth = getFirebaseAuth()
  if (!auth) {
    const err = new Error(
      configError || "OTP SMS service is not configured. Please check Firebase authentication settings."
    ) as Error & { code?: string }
    err.code = "app/firebase-not-configured"
    throw err
  }

  // Always clear any previous verifier before sending/resending to avoid
  // "reCAPTCHA has already been rendered in this element" or stale token failures.
  clearRecaptchaVerifier(previousVerifier, containerId)

  const container = typeof document !== "undefined" ? document.getElementById(containerId) : null
  if (!container) {
    const err = new Error("Could not initialize security verification container. Please reopen the dialog and try again.") as Error & { code?: string }
    err.code = "app/recaptcha-container-missing"
    throw err
  }

  // Mount into a brand-new child node so Google reCAPTCHA never collides with prior widget IDs
  const mountNode = document.createElement("div")
  container.innerHTML = ""
  container.appendChild(mountNode)

  let verifier: RecaptchaVerifier | null = null
  try {
    verifier = new RecaptchaVerifier(auth, mountNode, {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {
        clearRecaptchaVerifier(verifier, containerId)
        onExpired?.()
      },
    })

    await verifier.render()
    const formattedPhone = `+91${mobile10Digits}`
    const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier)
    return { confirmationResult, verifier }
  } catch (err) {
    clearRecaptchaVerifier(verifier, containerId)
    throw err
  }
}

export function formatPhoneAuthError(err: any, stage: "send" | "verify" = "send"): string {
  const code = String(err?.code || "").toLowerCase()
  const msg = String(err?.message || "").toLowerCase()
  const combined = `${code} ${msg}`

  if (code === "app/firebase-not-configured" || code === "app/recaptcha-container-missing") {
    return err.message
  }
  if (combined.includes("invalid-verification-code") || combined.includes("invalid-otp")) {
    return "Invalid OTP code. Please check the 6-digit code and try again."
  }
  if (combined.includes("code-expired") || combined.includes("session-expired")) {
    return "OTP code has expired. Please request a new OTP."
  }
  if (combined.includes("too-many-requests")) {
    return "Too many OTP attempts from this device. Please wait a few minutes and try again."
  }
  if (combined.includes("invalid-phone-number") || combined.includes("missing-phone-number")) {
    return "Please enter a valid 10-digit mobile number."
  }
  if (combined.includes("quota-exceeded")) {
    return "Daily SMS OTP quota has been reached. Please try again later."
  }
  if (combined.includes("unauthorized-domain")) {
    const host = typeof window !== "undefined" ? window.location.hostname : "this domain"
    return `Domain '${host}' is not authorized for SMS OTP in Firebase Console. Please add it under Firebase Authentication → Settings → Authorized domains.`
  }
  if (combined.includes("billing-not-enabled")) {
    return "Firebase SMS OTP requires billing (Blaze plan) to be enabled on your Firebase project."
  }
  if (combined.includes("operation-not-allowed")) {
    return "Phone SMS sign-in is disabled in Firebase Console. Please enable Phone authentication in Firebase Authentication → Sign-in method."
  }
  if (combined.includes("invalid-api-key") || combined.includes("api-key-not-valid")) {
    return "Firebase API key is invalid. Please verify NEXT_PUBLIC_FIREBASE_API_KEY in environment settings."
  }
  if (combined.includes("app-not-authorized")) {
    return "This web app is not authorized to use Firebase Authentication. Please check your Firebase project settings."
  }
  if (combined.includes("captcha-check-failed") || combined.includes("invalid-app-credential") || combined.includes("missing-client-identifier")) {
    return "Security verification (reCAPTCHA) failed. Please disable ad blockers or refresh the page and try again."
  }
  if (combined.includes("network-request-failed")) {
    return "Network connection issue. Please check your internet connection and try again."
  }
  if (combined.includes("internal-error")) {
    return "SMS OTP service encountered an internal error. Please refresh the page and try again."
  }

  const raw = String(err?.message || "").trim()
  // Extract Firebase error code if present instead of wiping the message blank
  const fbCodeMatch = raw.match(/Firebase:\s*Error\s*\(([^)]+)\)/i)
  if (fbCodeMatch) {
    const fbCode = fbCodeMatch[1]
    return stage === "send"
      ? `Unable to send OTP (${fbCode}). Please try again or contact support.`
      : `OTP verification failed (${fbCode}). Please try again.`
  }

  if (raw) return raw

  return stage === "send"
    ? "Failed to send SMS OTP. Please try again."
    : "Verification failed. Please check the 6-digit code and try again."
}
