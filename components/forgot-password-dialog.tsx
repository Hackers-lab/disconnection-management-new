"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KeyRound, Smartphone, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Building2, ArrowRight } from "lucide-react"
import { PhoneEmailButton } from "@/components/phone-email-button"

interface ForgotPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialIdentifier?: string
  isFirstLogin?: boolean
}

export function ForgotPasswordDialog({ open, onOpenChange, initialIdentifier = "", isFirstLogin = false }: ForgotPasswordDialogProps) {
  const [step, setStep] = useState<1 | 2>(1) // 1: Find Account, 2: Verify via Phone.Email + Set New Password
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Step 1: Identifier & Accounts
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [mobileNumber, setMobileNumber] = useState("")
  const [mobileMasked, setMobileMasked] = useState("")
  const [username, setUsername] = useState("")
  const [matchedAccounts, setMatchedAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("all")
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string>("All Stations")

  // Step 2: Verified token & New Password
  const [verificationToken, setVerificationToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Reset / sync state on open change
  useEffect(() => {
    if (open && initialIdentifier) {
      setIdentifier(initialIdentifier)
    }
    if (!open) {
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
        setVerificationToken("")
        setNewPassword("")
        setConfirmPassword("")
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [open, initialIdentifier])

  // 1. Find account & linked mobile number
  const handleFindAccount = async (e: React.FormEvent, accountChoice?: string) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    const cleanIdent = identifier.trim()

    if (!cleanIdent) {
      setError("Please enter your Mobile Number, Username, or CCC Code.")
      return
    }

    try {
      setLoading(true)
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          identifier: cleanIdent,
          selectedAccount: accountChoice,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to find account.")

      // If multiple accounts found and user hasn't made a choice, display the account picker
      if (data.requiresAccountSelection) {
        setMobileNumber(data.mobileNumber)
        setMobileMasked(data.mobileMasked)
        setMatchedAccounts(data.accounts || [])
        setSelectedAccount("all")
        setSelectedAccountLabel("All Stations")
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
      setVerificationToken("")
      setStep(2)
    } catch (err: any) {
      console.error("Forgot password account lookup error:", err)
      setError(err?.message || "Failed to find account.")
    } finally {
      setLoading(false)
    }
  }

  // 2. Handle Phone.Email verification callback (enforces match against linked account mobile)
  const handlePhoneEmailVerified = async (userJsonUrl: string) => {
    setError(null)
    setSuccessMsg(null)
    try {
      setLoading(true)
      const verifyRes = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "phone-email-verified",
          userJsonUrl,
          expectedMobileNumber: mobileNumber,
        }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok || !verifyData.verificationToken) {
        throw new Error(verifyData.error || "Failed to verify mobile number. Please try again.")
      }

      setVerificationToken(verifyData.verificationToken)
      setSuccessMsg(`Mobile +91 ${mobileMasked} verified! Now choose your new password below.`)
    } catch (err: any) {
      console.error("Phone.Email forgot-password verify error:", err)
      setError(err?.message || "Verification failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 3. Reset Password with verified token
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!verificationToken) {
      setError("Please verify your registered mobile number first.")
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
        }),
      })

      const resetData = await resetRes.json().catch(() => ({}))
      if (!resetRes.ok) throw new Error(resetData.error || "Failed to reset password.")

      setSuccessMsg("Password reset successfully! You can now sign in.")
      setTimeout(() => {
        onOpenChange(false)
      }, 1500)
    } catch (err: any) {
      console.error("Auth reset password error:", err)
      setError(err?.message || "Failed to reset password.")
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
        <DialogHeader className="space-y-2 text-center pb-1">
          <div className="mx-auto w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/15 ring-4 ring-slate-100">
            <KeyRound className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
            {isFirstLogin ? "Set Up Your Permanent Password" : "Password Recovery"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isFirstLogin
              ? (step === 1
                  ? "First login detected! Continue to verify your linked phone number."
                  : verificationToken
                    ? "Mobile verified! Choose your new permanent password."
                    : `Verify your linked mobile (+91 ${mobileMasked}) via SMS OTP to set your password.`)
              : (step === 1
                  ? (matchedAccounts.length > 1
                      ? "Select which supply station account password to reset."
                      : "Enter your mobile number, username, or CCC code to locate your account.")
                  : verificationToken
                    ? "Mobile verified! Set your new password below."
                    : `Verify your registered mobile (+91 ${mobileMasked}) via SMS OTP to reset your password.`)}
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
        {/* STEP 1.5: MULTIPLE ACCOUNTS FOUND - SELECT SUPPLY STATION             */}
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
                onClick={(e) => handleFindAccount(e, selectedAccount)}
                className="flex-2 h-10 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl text-xs cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                Continue to Verify
              </Button>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* STEP 1: FIND ACCOUNT BY USERNAME / CCC / MOBILE                       */}
        {/* ===================================================================== */}
        {step === 1 && matchedAccounts.length <= 1 && (
          <form onSubmit={(e) => handleFindAccount(e)} className="space-y-3.5 pt-1">
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
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              Continue
            </Button>
          </form>
        )}

        {/* ===================================================================== */}
        {/* STEP 2: VERIFY VIA PHONE.EMAIL & SET NEW PASSWORD                     */}
        {/* ===================================================================== */}
        {step === 2 && (
          <div className="space-y-3.5 pt-1">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200 font-medium">
              <span className="truncate max-w-[230px]">
                Target: <strong>{selectedAccount === "all" ? "All Stations" : (selectedAccountLabel || username)}</strong>
              </span>
              <span className="text-slate-500 font-mono shrink-0">+91 {mobileMasked}</span>
            </div>

            {!verificationToken ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Please verify your registered mobile number <strong>+91 {mobileMasked}</strong> using the button below to unlock password reset.
                  </p>
                </div>

                <PhoneEmailButton
                  onVerified={handlePhoneEmailVerified}
                  verifying={loading}
                  helperText={`Make sure you verify using +91 ${mobileMasked}.`}
                />

                <div className="flex justify-end text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1)
                      setError(null)
                      setSuccessMsg(null)
                      setMatchedAccounts([])
                      setSelectedAccount("all")
                      setSelectedAccountLabel("All Stations")
                    }}
                    className="text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Change Account
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Verified: +91 {mobileMasked}</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">New Password <span className="text-rose-500">*</span></Label>
                    <div className="relative">
                      <Input
                        required
                        autoFocus
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

                <Button
                  type="submit"
                  disabled={loading || !newPassword || newPassword !== confirmPassword}
                  className="w-full h-10 sm:h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl shadow transition-all mt-1 cursor-pointer text-xs sm:text-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Reset Password
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
