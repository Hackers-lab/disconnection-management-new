"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KeyRound, Smartphone, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { firebaseAuth } from "@/lib/firebase-client"
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth"

function formatFriendlyError(err: any): string {
  const code = String(err?.code || "").toLowerCase()
  const msg = String(err?.message || "").toLowerCase()

  if (code.includes("invalid-verification-code") || code.includes("invalid-otp") || msg.includes("invalid-verification-code")) {
    return "Invalid OTP code. Please check the 6-digit code and try again."
  }
  if (code.includes("code-expired") || msg.includes("code-expired")) {
    return "OTP code has expired. Please request a new OTP."
  }
  if (code.includes("too-many-requests") || msg.includes("too-many-requests")) {
    return "Too many attempts from this device. Please wait a few minutes and try again."
  }
  if (code.includes("invalid-phone-number") || msg.includes("invalid-phone-number")) {
    return "Please enter a valid 10-digit mobile number."
  }
  if (code.includes("quota-exceeded") || msg.includes("quota-exceeded")) {
    return "SMS quota exceeded for today. Please try again later."
  }
  if (code.includes("captcha-check-failed") || msg.includes("captcha-check-failed")) {
    return "Security verification check failed. Please refresh the page and try again."
  }
  if (code.includes("network-request-failed") || msg.includes("network-request-failed")) {
    return "Network connection issue. Please check your internet connection."
  }

  // Strip any raw library error prefixes
  const raw = String(err?.message || "")
  const sanitized = raw.replace(/^Firebase:\s*Error\s*\((.*?)\)\.?/i, "").trim()
  return sanitized || "Verification failed. Please check the code and try again."
}

interface ForgotPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ForgotPasswordDialog({ open, onOpenChange }: ForgotPasswordDialogProps) {
  const [step, setStep] = useState<1 | 2>(1) // 1: Request OTP via identifier, 2: OTP + New Password
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Step 1: Identifier
  const [identifier, setIdentifier] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [mobileMasked, setMobileMasked] = useState("")
  const [username, setUsername] = useState("")
  const [countdown, setCountdown] = useState(0)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)

  // Step 2: OTP & New Password
  const [otp, setOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1)
        setError(null)
        setSuccessMsg(null)
        setIdentifier("")
        setMobileNumber("")
        setMobileMasked("")
        setUsername("")
        setOtp("")
        setNewPassword("")
        setConfirmPassword("")
        setConfirmationResult(null)
        if (typeof window !== "undefined" && (window as any).forgotRecaptchaVerifier) {
          try { (window as any).forgotRecaptchaVerifier.clear() } catch {}
          ;(window as any).forgotRecaptchaVerifier = null
        }
      }, 300)
    }
  }, [open])

  // Pre-warm reCAPTCHA verifier as soon as dialog is opened
  useEffect(() => {
    if (!open) return
    let isMounted = true
    const initVerifier = async () => {
      if (typeof window === "undefined") return
      await new Promise((res) => setTimeout(res, 50))
      if (!isMounted) return
      const container = document.getElementById("forgot-recaptcha-container")
      if (container && !(window as any).forgotRecaptchaVerifier) {
        try {
          const verifier = new RecaptchaVerifier(firebaseAuth, "forgot-recaptcha-container", {
            size: "invisible",
            callback: () => {},
            "expired-callback": () => {
              try { (window as any).forgotRecaptchaVerifier?.clear() } catch {}
              (window as any).forgotRecaptchaVerifier = null
            },
          })
          await verifier.render()
          if (isMounted) {
            (window as any).forgotRecaptchaVerifier = verifier
          }
        } catch (err) {
          console.warn("Failed to pre-warm forgot-password reCAPTCHA:", err)
        }
      }
    }
    initVerifier()
    return () => {
      isMounted = false
    }
  }, [open])

  // Countdown timer for Resend OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // 1. Request Reset OTP (Look up linked phone and send SMS via Firebase)
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const cleanIdent = identifier.trim()

    if (!cleanIdent) {
      setError("Please enter your Mobile Number, Username, or CCC Code.")
      return
    }

    try {
      setLoading(true)
      // Look up linked account on server
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", identifier: cleanIdent })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to find account.")

      setMobileNumber(data.mobileNumber)
      setMobileMasked(data.mobileMasked)
      setUsername(data.username)

      // Send SMS OTP via Firebase
      try {
        let appVerifier = typeof window !== "undefined" ? (window as any).forgotRecaptchaVerifier : null
        if (!appVerifier && typeof window !== "undefined") {
          appVerifier = new RecaptchaVerifier(firebaseAuth, "forgot-recaptcha-container", {
            size: "invisible",
            callback: () => {},
            "expired-callback": () => {
              try { (window as any).forgotRecaptchaVerifier?.clear() } catch {}
              (window as any).forgotRecaptchaVerifier = null
              setError("reCAPTCHA expired. Please try sending OTP again.")
            },
          })
          await appVerifier.render()
          ;(window as any).forgotRecaptchaVerifier = appVerifier
        }

        const formattedPhone = `+91${data.mobileNumber}`
        const confirmation = await signInWithPhoneNumber(firebaseAuth, formattedPhone, appVerifier)
        setConfirmationResult(confirmation)
      } catch (fbErr: any) {
        console.error("Firebase Phone Auth error:", fbErr)
        throw new Error(fbErr.message || "Failed to send SMS OTP to linked phone number.")
      }

      setCountdown(45)
      setSuccessMsg(`OTP sent to +91 ${data.mobileMasked}.`)
      setTimeout(() => {
        setSuccessMsg(null)
        setStep(2)
      }, 600)
    } catch (err: any) {
      console.error("Auth request OTP error:", err)
      setError(formatFriendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  // 2. Verify OTP & Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanOtp = otp.replace(/\D/g, "").slice(0, 6)
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit OTP.")
      return
    }

    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters long.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    try {
      setLoading(true)
      let verificationToken = ""

      if (confirmationResult) {
        // Verify with Firebase
        await confirmationResult.confirm(cleanOtp)
        const verifyRes = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "firebase-verified", mobileNumber })
        })
        const verifyData = await verifyRes.json()
        verificationToken = verifyData.verificationToken
      } else {
        // Verify with Server OTP
        const verifyRes = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", mobileNumber, otp: cleanOtp })
        })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok) throw new Error(verifyData.error || "Invalid OTP code.")
        verificationToken = verifyData.verificationToken
      }

      // Execute Password Reset
      const resetRes = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          mobileNumber,
          verificationToken,
          newPassword,
        })
      })

      const resetData = await resetRes.json()
      if (!resetRes.ok) throw new Error(resetData.error || "Failed to reset password.")

      setSuccessMsg("Password reset successfully! You can now sign in.")
      setTimeout(() => {
        onOpenChange(false)
      }, 1500)
    } catch (err: any) {
      console.error("Auth reset password error:", err)
      setError(formatFriendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_22px_45px_-12px_rgba(15,23,42,0.14),0_8px_18px_-6px_rgba(15,23,42,0.06)] border border-slate-200/90 bg-white/95 backdrop-blur-xl">
        {/* Strictly hidden container for Firebase reCAPTCHA */}
        <div id="forgot-recaptcha-container" className="hidden absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0" aria-hidden="true"></div>

        <DialogHeader className="space-y-2 text-center pb-1">
          <div className="mx-auto w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/15 ring-4 ring-slate-100">
            <KeyRound className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
            Password Recovery
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {step === 1
              ? "Enter your mobile number, username, or CCC code to receive an OTP."
              : `Enter the 6-digit OTP sent to +91 ${mobileMasked} and set your new password.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="py-2 px-3 rounded-xl border-red-200 bg-red-50/80 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMsg && (
          <Alert className="py-2 px-3 rounded-xl border-emerald-200 bg-emerald-50/80 text-emerald-800 text-xs">
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}

        {/* ===================================================================== */}
        {/* STEP 1: FIND ACCOUNT BY USERNAME / CCC / MOBILE */}
        {/* ===================================================================== */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Mobile Number, Username, or CCC Code <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                  required
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. 9832123456 / 6612107 / Kushida"
                  className="pl-10 h-10 sm:h-11 rounded-xl text-xs sm:text-sm border-slate-200 bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !identifier.trim()}
              className="w-full h-10 sm:h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl cursor-pointer shadow transition-all duration-200 active:scale-[0.99] text-xs sm:text-sm mt-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
              Send OTP
            </Button>
          </form>
        )}

        {/* ===================================================================== */}
        {/* STEP 2: VERIFY OTP & SET NEW PASSWORD */}
        {/* ===================================================================== */}
        {step === 2 && (
          <form onSubmit={handleResetPassword} className="space-y-3.5 pt-1">
            <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs text-slate-800 font-medium">
              <span>Account: <strong>{username}</strong></span>
              <span className="text-slate-500">+91 {mobileMasked}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Enter 6-Digit OTP <span className="text-rose-500">*</span></Label>
              <Input
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                className="h-11 text-center font-mono text-lg tracking-widest rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">New Password <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="h-10 pr-8 text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Confirm Password <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="h-10 text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs px-0.5">
              <button
                type="button"
                disabled={countdown > 0 || loading}
                onClick={handleRequestOtp}
                className="text-slate-800 hover:text-black font-semibold disabled:text-slate-400 cursor-pointer transition-colors"
              >
                {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Change Account
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading || otp.length !== 6 || !newPassword || newPassword !== confirmPassword}
              className="w-full h-10 sm:h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl shadow transition-all mt-1 cursor-pointer text-xs sm:text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Reset Password
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
