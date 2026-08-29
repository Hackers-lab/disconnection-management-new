"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KeyRound, Smartphone, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"
import { firebaseAuth } from "@/lib/firebase-client"
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth"

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
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

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
        if (recaptchaVerifierRef.current) {
          try { recaptchaVerifierRef.current.clear() } catch {}
          recaptchaVerifierRef.current = null
        }
      }, 300)
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
        if (typeof window !== "undefined") {
          if ((window as any).forgotRecaptchaVerifier) {
            try { (window as any).forgotRecaptchaVerifier.clear() } catch {}
          }
          (window as any).forgotRecaptchaVerifier = new RecaptchaVerifier(firebaseAuth, "forgot-recaptcha-container", {
            size: "invisible",
            callback: () => {},
            "expired-callback": () => {
              setError("reCAPTCHA expired. Please try sending OTP again.")
            }
          })
        }
        const formattedPhone = `+91${data.mobileNumber}`
        const appVerifier = (window as any).forgotRecaptchaVerifier
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
      setError(err.message)
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
        const credential = await confirmationResult.confirm(cleanOtp)
        const idToken = await credential.user.getIdToken()
        const verifyRes = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", mobileNumber, otp: cleanOtp })
        })
        const verifyData = await verifyRes.json()
        verificationToken = verifyData.verificationToken || idToken
      } else {
        // Verify with Server OTP
        const verifyRes = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", mobileNumber, otp: cleanOtp })
        })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok) throw new Error(verifyData.error || "OTP verification failed.")
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        {/* Invisible container for Firebase reCAPTCHA */}
        <div id="forgot-recaptcha-container"></div>

        <DialogHeader className="space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600">
            <KeyRound className="w-6 h-6" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Password Recovery
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-slate-500">
            {step === 1
              ? "Enter your mobile number, username, or CCC code to receive an SMS OTP."
              : `Enter the 6-digit OTP sent to +91 ${mobileMasked} and create your new password.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="py-2.5 rounded-xl border-rose-200 bg-rose-50 text-rose-800 text-xs">
            <AlertCircle className="w-4 h-4 mr-2" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMsg && (
          <Alert className="py-2.5 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}

        {/* ===================================================================== */}
        {/* STEP 1: FIND ACCOUNT BY USERNAME / CCC / MOBILE */}
        {/* ===================================================================== */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">
                Mobile Number, Username, or CCC Code <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  required
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. 9832123456 / 6612107 / Kushida"
                  className="pl-10 h-11 rounded-xl text-sm"
                  autoFocus
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !identifier.trim()}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl cursor-pointer shadow-md"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
              Send Password Reset OTP via SMS
            </Button>
          </form>
        )}

        {/* ===================================================================== */}
        {/* STEP 2: VERIFY OTP & SET NEW PASSWORD */}
        {/* ===================================================================== */}
        {step === 2 && (
          <form onSubmit={handleResetPassword} className="space-y-4 pt-1">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs text-blue-900">
              <span className="font-medium">Account: <strong>{username}</strong></span>
              <span>Linked: +91 {mobileMasked}</span>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Enter 6-Digit OTP <span className="text-rose-500">*</span></Label>
              <Input
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                className="h-11 text-center font-mono text-lg tracking-widest rounded-xl"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">New Password <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="h-10 pr-9 text-xs rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Confirm Password <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="h-10 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                disabled={countdown > 0 || loading}
                onClick={handleRequestOtp}
                className="text-blue-600 hover:text-blue-700 font-semibold disabled:text-slate-400 cursor-pointer"
              >
                {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-500 hover:text-slate-700"
              >
                Change Account
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading || otp.length !== 6 || !newPassword || newPassword !== confirmPassword}
              className="w-full h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl shadow-lg mt-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Update Password & Continue
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
