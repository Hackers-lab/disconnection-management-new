"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KeyRound, Smartphone, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Building2 } from "lucide-react"
import type { RecaptchaVerifier, ConfirmationResult } from "firebase/auth"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { sendFirebasePhoneOtp, clearRecaptchaVerifier, formatPhoneAuthError } from "@/lib/firebase-phone-otp"

interface ForgotPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialIdentifier?: string
  isFirstLogin?: boolean
}

export function ForgotPasswordDialog({ open, onOpenChange, initialIdentifier = "", isFirstLogin = false }: ForgotPasswordDialogProps) {
  const [step, setStep] = useState<1 | 2>(1) // 1: Request OTP via identifier, 2: OTP + New Password
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Step 1: Identifier & Accounts
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [mobileNumber, setMobileNumber] = useState("")
  const [mobileMasked, setMobileMasked] = useState("")
  const [username, setUsername] = useState("")
  const [countdown, setCountdown] = useState(0)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [matchedAccounts, setMatchedAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("all")
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string>("All Stations")

  // Step 2: OTP & New Password
  const [otp, setOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  // Reset / sync state on open change
  useEffect(() => {
    if (open && initialIdentifier) {
      setIdentifier(initialIdentifier)
    }
    if (!open) {
      recaptchaVerifierRef.current = clearRecaptchaVerifier(
        recaptchaVerifierRef.current,
        "forgot-recaptcha-container"
      )
      const timer = setTimeout(() => {
        setStep(1)
        setError(null)
        setSuccessMsg(null)
        setIdentifier("")
        setMobileNumber("")
        setMobileMasked("")
        setUsername("")
        setMatchedAccounts([])
        setSelectedAccount("all")
        setSelectedAccountLabel("All Stations")
        setOtp("")
        setNewPassword("")
        setConfirmPassword("")
        setConfirmationResult(null)
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [open, initialIdentifier])

  // Clean up reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current = clearRecaptchaVerifier(
        recaptchaVerifierRef.current,
        "forgot-recaptcha-container"
      )
    }
  }, [])

  // Countdown timer for Resend OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // 1. Request Reset OTP (Look up linked phone and send SMS via Firebase)
  const handleRequestOtp = async (e: React.FormEvent, accountChoice?: string) => {
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
        body: JSON.stringify({ 
          action: "request", 
          identifier: cleanIdent,
          selectedAccount: accountChoice
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to find account.")

      // If multiple accounts found and user hasn't made a choice, display the account picker
      if (data.requiresAccountSelection) {
        setMobileNumber(data.mobileNumber)
        setMobileMasked(data.mobileMasked)
        setMatchedAccounts(data.accounts || [])
        setSelectedAccount("all")
        setSelectedAccountLabel("All Stations")
        setLoading(false)
        return
      }

      const resolvedUsername = data.selectedAccount || data.username || ""
      setMobileNumber(data.mobileNumber)
      setMobileMasked(data.mobileMasked)
      setUsername(resolvedUsername)
      setSelectedAccount(resolvedUsername || "all")
      if (resolvedUsername && resolvedUsername !== "all" && !accountChoice) {
        setSelectedAccountLabel(resolvedUsername)
      }

      // Send SMS OTP via Firebase using real Auth instance and fresh reCAPTCHA mount
      const { confirmationResult: confirmation, verifier } = await sendFirebasePhoneOtp(
        "forgot-recaptcha-container",
        data.mobileNumber,
        recaptchaVerifierRef.current,
        () => {
          recaptchaVerifierRef.current = null
          setError("Security check expired. Please click Send OTP again.")
        }
      )
      recaptchaVerifierRef.current = verifier
      setConfirmationResult(confirmation)

      setCountdown(45)
      setSuccessMsg(`OTP sent to +91 ${data.mobileMasked}. If not received, please check your SMS Spam / Blocked folder.`)
      setTimeout(() => {
        setSuccessMsg(null)
        setStep(2)
      }, 600)
    } catch (err: any) {
      console.error("Auth request OTP error:", err)
      recaptchaVerifierRef.current = clearRecaptchaVerifier(
        recaptchaVerifierRef.current,
        "forgot-recaptcha-container"
      )
      setError(formatPhoneAuthError(err, "send"))
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
        // Verify OTP with Firebase and pass signed Firebase ID token to server
        const credential = await confirmationResult.confirm(cleanOtp)
        const firebaseIdToken = await credential.user.getIdToken()
        const verifyRes = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "firebase-verified", mobileNumber, firebaseIdToken })
        })
        const verifyData = await verifyRes.json().catch(() => ({}))
        if (!verifyRes.ok || !verifyData.verificationToken) {
          throw new Error(verifyData.error || "Failed to complete mobile verification. Please try again.")
        }
        verificationToken = verifyData.verificationToken
        getFirebaseAuth()?.signOut().catch(() => {})
      } else {
        // Verify with Server OTP
        const verifyRes = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", mobileNumber, otp: cleanOtp })
        })
        const verifyData = await verifyRes.json().catch(() => ({}))
        if (!verifyRes.ok || !verifyData.verificationToken) {
          throw new Error(verifyData.error || "Invalid OTP code.")
        }
        verificationToken = verifyData.verificationToken
      }

      // Execute Password Reset
      const resetRes = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          mobileNumber,
          username: selectedAccount === "all" ? "all" : (selectedAccount || username),
          selectedAccount,
          verificationToken,
          newPassword,
        })
      })

      const resetData = await resetRes.json().catch(() => ({}))
      if (!resetRes.ok) throw new Error(resetData.error || "Failed to reset password.")

      setSuccessMsg("Password reset successfully! You can now sign in.")
      setTimeout(() => {
        onOpenChange(false)
      }, 1500)
    } catch (err: any) {
      console.error("Auth reset password error:", err)
      setError(formatPhoneAuthError(err, "verify"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_22px_45px_-12px_rgba(15,23,42,0.14),0_8px_18px_-6px_rgba(15,23,42,0.06)] border border-slate-200/90 bg-white/95 backdrop-blur-xl"
      >
        {/* Non-hidden off-flow anchor for Firebase invisible reCAPTCHA */}
        <div id="forgot-recaptcha-container" aria-hidden="true"></div>

        <DialogHeader className="space-y-2 text-center pb-1">
          <div className="mx-auto w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/15 ring-4 ring-slate-100">
            <KeyRound className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
            {isFirstLogin ? "Set Up Your Permanent Password" : "Password Recovery"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isFirstLogin
              ? (step === 1 ? "First login detected! Click 'Send OTP' to verify your linked phone number." : `Enter the 6-digit OTP sent to +91 ${mobileMasked} and choose your new password.`)
              : (step === 1
                  ? (matchedAccounts.length > 1
                      ? `Select which supply station account password to reset.`
                      : "Enter your mobile number, username, or CCC code to receive an OTP.")
                  : `Enter the 6-digit OTP sent to +91 ${mobileMasked} and set your new password.`)}
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
        {/* STEP 1.5: MULTIPLE ACCOUNTS FOUND - SELECT SUPPLY STATION */}
        {/* ===================================================================== */}
        {step === 1 && matchedAccounts.length > 1 && (
          <div className="space-y-3 pt-1">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900">
              <p className="font-semibold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Multiple stations found for +91 {mobileMasked}
              </p>
              <p className="text-[11px] text-amber-700/90 mt-0.5">
                Select which station account password you want to reset:
              </p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <label
                onClick={() => {
                  setSelectedAccount("all")
                  setSelectedAccountLabel("All Stations")
                }}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedAccount === "all"
                    ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-900">🌐 All Stations (Recommended)</p>
                  <p className="text-[11px] text-slate-500">Apply this new password to all your linked stations</p>
                </div>
                <input
                  type="radio"
                  name="selectedAccount"
                  checked={selectedAccount === "all"}
                  onChange={() => {}}
                  className="w-4 h-4 text-slate-900 accent-slate-900"
                />
              </label>

              {matchedAccounts.map((acc) => {
                const isChecked = selectedAccount === acc.username
                return (
                  <label
                    key={acc.id || acc.username}
                    onClick={() => {
                      setSelectedAccount(acc.username)
                      setSelectedAccountLabel(`${acc.cccName || acc.cccCode} (${acc.username})`)
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isChecked
                        ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-900">{acc.cccName || acc.cccCode}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Username: <strong>{acc.username}</strong> • Role: {String(acc.role).toUpperCase()}
                      </p>
                    </div>
                    <input
                      type="radio"
                      name="selectedAccount"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 text-slate-900 accent-slate-900"
                    />
                  </label>
                )
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMatchedAccounts([])
                  setSelectedAccount("all")
                  setSelectedAccountLabel("All Stations")
                }}
                className="flex-1 h-10 rounded-xl text-xs cursor-pointer"
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={loading}
                onClick={(e) => handleRequestOtp(e, selectedAccount)}
                className="flex-2 h-10 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl text-xs cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
                Send OTP
              </Button>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* STEP 1: FIND ACCOUNT BY USERNAME / CCC / MOBILE */}
        {/* ===================================================================== */}
        {step === 1 && matchedAccounts.length <= 1 && (
          <form onSubmit={(e) => handleRequestOtp(e)} className="space-y-3.5 pt-1">
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
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200 font-medium">
              <span className="truncate max-w-[240px]">
                Target: <strong>{selectedAccount === "all" ? "All Stations" : (selectedAccountLabel || username)}</strong>
              </span>
              <span className="text-slate-500 font-mono shrink-0">+91 {mobileMasked}</span>
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
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg p-2 flex items-start gap-1.5 mt-1 leading-tight">
                <span className="shrink-0 text-amber-600">📩</span>
                <span><strong>Google Messages Note:</strong> Verification SMS may be placed in your <strong>Spam & Blocked</strong> folder. Please check there if OTP is delayed.</span>
              </p>
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
                onClick={(e) => handleRequestOtp(e, selectedAccount)}
                className="text-slate-800 hover:text-black font-semibold disabled:text-slate-400 cursor-pointer transition-colors"
              >
                {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setMatchedAccounts([])
                  setSelectedAccount("all")
                  setSelectedAccountLabel("All Stations")
                }}
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
