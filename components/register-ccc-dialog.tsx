"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Building2, Smartphone, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Eye, EyeOff, KeyRound, MapPin } from "lucide-react"
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

interface RegisterCccDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RegisterCccDialog({ open, onOpenChange, onSuccess }: RegisterCccDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1) // 1: OTP verification, 2: CCC details & password
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Step 1: Mobile & OTP state
  const [mobileNumber, setMobileNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [verificationToken, setVerificationToken] = useState("")
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)

  // Step 2: CCC station details
  const [cccCode, setCccCode] = useState("")
  const [cccName, setCccName] = useState("")
  const [contactPerson, setContactPerson] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1)
        setError(null)
        setSuccessMsg(null)
        setMobileNumber("")
        setOtp("")
        setOtpSent(false)
        setVerificationToken("")
        setConfirmationResult(null)
        setCccCode("")
        setCccName("")
        setContactPerson("")
        setPassword("")
        setConfirmPassword("")
        if (typeof window !== "undefined" && (window as any).registerRecaptchaVerifier) {
          try { (window as any).registerRecaptchaVerifier.clear() } catch {}
          ;(window as any).registerRecaptchaVerifier = null
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
      const container = document.getElementById("register-recaptcha-container")
      if (container && !(window as any).registerRecaptchaVerifier) {
        try {
          const verifier = new RecaptchaVerifier(firebaseAuth, "register-recaptcha-container", {
            size: "invisible",
            callback: () => {},
            "expired-callback": () => {
              try { (window as any).registerRecaptchaVerifier?.clear() } catch {}
              (window as any).registerRecaptchaVerifier = null
            },
          })
          await verifier.render()
          if (isMounted) {
            (window as any).registerRecaptchaVerifier = verifier
          }
        } catch (err) {
          console.warn("Failed to pre-warm register reCAPTCHA:", err)
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

  // 1. Send SMS OTP via Firebase Phone Auth (with Server fallback)
  const handleSendOtp = async () => {
    setError(null)
    const cleanMob = mobileNumber.replace(/\D/g, "").slice(-10)
    if (cleanMob.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.")
      return
    }

    try {
      setLoading(true)

      // Use pre-warmed reCAPTCHA verifier instance or instantiate if needed
      let appVerifier = typeof window !== "undefined" ? (window as any).registerRecaptchaVerifier : null
      if (!appVerifier && typeof window !== "undefined") {
        appVerifier = new RecaptchaVerifier(firebaseAuth, "register-recaptcha-container", {
          size: "invisible",
          callback: () => {},
          "expired-callback": () => {
            try { (window as any).registerRecaptchaVerifier?.clear() } catch {}
            (window as any).registerRecaptchaVerifier = null
            setError("reCAPTCHA expired. Please try sending OTP again.")
          },
        })
        await appVerifier.render()
        ;(window as any).registerRecaptchaVerifier = appVerifier
      }

      const formattedPhone = `+91${cleanMob}`
      const confirmation = await signInWithPhoneNumber(firebaseAuth, formattedPhone, appVerifier)
      setConfirmationResult(confirmation)

      setOtpSent(true)
      setCountdown(45)
      setSuccessMsg(`OTP sent to +91 ${cleanMob}.`)
    } catch (err: any) {
      console.error("Auth send OTP error:", err)
      const errorMsg = formatFriendlyError(err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // 2. Verify OTP code
  const handleVerifyOtp = async () => {
    setError(null)
    const cleanMob = mobileNumber.replace(/\D/g, "").slice(-10)
    const cleanOtp = otp.replace(/\D/g, "").slice(0, 6)

    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit OTP.")
      return
    }

    try {
      setLoading(true)

      if (confirmationResult) {
        // Verify via Firebase confirmation result
        await confirmationResult.confirm(cleanOtp)
        
        // Exchange with server for signed verification token
        const res = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "firebase-verified", mobileNumber: cleanMob })
        })
        const data = await res.json()
        setVerificationToken(data.verificationToken)
      } else {
        // Verify directly via server OTP endpoint
        const res = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", mobileNumber: cleanMob, otp: cleanOtp })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Invalid OTP code.")
        setVerificationToken(data.verificationToken)
      }

      setSuccessMsg("Mobile number verified successfully!")
      setTimeout(() => {
        setSuccessMsg(null)
        setStep(2)
      }, 700)
    } catch (err: any) {
      console.error("Auth verify error:", err)
      setError(formatFriendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  // 3. Register CCC Station
  const handleRegisterCcc = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanCode = cccCode.trim()
    const cleanName = cccName.trim().toUpperCase()
    const cleanContact = contactPerson.trim()

    if (!/^\d{7}$/.test(cleanCode)) {
      setError("CCC Code must be a 7-digit numeric code (e.g. 6612108).")
      return
    }

    if (cleanName.length < 3) {
      setError("Please enter a valid CCC Supply Office name (e.g. CHANCHAL CCC).")
      return
    }

    if (password.length < 4) {
      setError("Password must be at least 4 characters long.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    try {
      setLoading(true)
      const res = await fetch("/api/auth/register-ccc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cccCode: cleanCode,
          cccName: cleanName,
          contactPerson: cleanContact,
          mobileNumber: mobileNumber.replace(/\D/g, "").slice(-10),
          password,
          verificationToken,
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to register CCC station.")

      setSuccessMsg(data.message || "Station registered successfully! Redirecting...")
      setTimeout(() => {
        onOpenChange(false)
        if (onSuccess) onSuccess()
        router.push(data.redirectTo || "/dashboard")
      }, 1000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 bg-white/95 backdrop-blur-xl">
        {/* Strictly hidden container for Firebase reCAPTCHA */}
        <div id="register-recaptcha-container" className="hidden absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0" aria-hidden="true"></div>

        <DialogHeader className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 ring-4 ring-amber-50">
            <Building2 className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-slate-900">
            Register New CCC Office
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {step === 1
              ? "Verify your 10-digit mobile number via SMS OTP to create your station admin account."
              : "Enter your station details to complete registration."}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-1">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? "w-8 bg-amber-500" : "w-2 bg-emerald-500"}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? "w-8 bg-amber-500" : "w-2 bg-slate-200"}`} />
        </div>

        {error && (
          <Alert variant="destructive" className="py-2.5 rounded-2xl border-rose-200 bg-rose-50 text-rose-800 text-xs">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMsg && (
          <Alert className="py-2.5 rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}

        {/* ===================================================================== */}
        {/* STEP 1: MOBILE & OTP VERIFICATION */}
        {/* ===================================================================== */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">10-Digit Mobile Number <span className="text-rose-500">*</span></Label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                  type="tel"
                  maxLength={10}
                  disabled={otpSent}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Enter 10-digit phone"
                  className="pl-10 h-12 rounded-2xl font-mono text-sm border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>

            {!otpSent ? (
              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || mobileNumber.length !== 10}
                className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
                Send 6-Digit OTP via SMS
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Enter 6-Digit OTP <span className="text-rose-500">*</span></Label>
                  <Input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="• • • • • •"
                    className="h-12 text-center font-mono text-xl tracking-widest rounded-2xl border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 bg-amber-50/30"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between text-xs px-1">
                  <button
                    type="button"
                    disabled={countdown > 0 || loading}
                    onClick={handleSendOtp}
                    className="text-amber-600 hover:text-amber-700 font-bold disabled:text-slate-400 cursor-pointer transition-colors"
                  >
                    {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(""); }}
                    className="text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Change Number
                  </button>
                </div>

                <Button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Verify & Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* STEP 2: CCC DETAILS & PASSWORD CREATION */}
        {/* ===================================================================== */}
        {step === 2 && (
          <form onSubmit={handleRegisterCcc} className="space-y-4 pt-1">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Verified Phone: +91 {mobileNumber}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">7-Digit CCC Code <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  maxLength={7}
                  value={cccCode}
                  onChange={(e) => setCccCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  placeholder="e.g. 6612108"
                  className="h-11 font-mono text-sm rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Supply Name <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  value={cccName}
                  onChange={(e) => setCccName(e.target.value)}
                  placeholder="e.g. CHANCHAL CCC"
                  className="h-11 uppercase text-xs rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Station In-Charge Name / Designation</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. AE & Station Manager"
                className="h-11 text-xs rounded-xl border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Admin Password <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
                    className="h-11 pr-9 text-xs rounded-xl border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Confirm Password <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="h-11 text-xs rounded-xl border-slate-200"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !cccCode || cccCode.length !== 7 || !cccName || !password}
              className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all mt-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Complete Registration & Sign In
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
