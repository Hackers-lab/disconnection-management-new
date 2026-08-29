"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Building2, Smartphone, KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck, RefreshCw, Eye, EyeOff } from "lucide-react"

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
  const [devOtp, setDevOtp] = useState<string | null>(null)

  // Step 2: CCC station details
  const [cccCode, setCccCode] = useState("")
  const [cccName, setCccName] = useState("")
  const [contactPerson, setContactPerson] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Reset on close
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
        setCccCode("")
        setCccName("")
        setContactPerson("")
        setPassword("")
        setConfirmPassword("")
        setDevOtp(null)
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

  // 1. Send OTP
  const handleSendOtp = async () => {
    setError(null)
    const cleanMob = mobileNumber.replace(/\D/g, "").slice(-10)
    if (cleanMob.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.")
      return
    }

    try {
      setLoading(true)
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", mobileNumber: cleanMob })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send OTP.")

      setOtpSent(true)
      setCountdown(45)
      if (data.devOtp) setDevOtp(data.devOtp)
      setSuccessMsg(`OTP sent to +91 ${cleanMob}.`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 2. Verify OTP
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
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", mobileNumber: cleanMob, otp: cleanOtp })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "OTP verification failed.")

      setVerificationToken(data.verificationToken)
      setSuccessMsg("Mobile number verified successfully!")
      setTimeout(() => {
        setSuccessMsg(null)
        setStep(2)
      }, 700)
    } catch (err: any) {
      setError(err.message)
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600">
            <Building2 className="w-6 h-6" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Register New CCC Office
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-slate-500">
            {step === 1
              ? "Verify your 10-digit mobile number to create your station admin account."
              : "Enter station details to complete CCC registration."}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-1">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? "w-8 bg-amber-500" : "w-2 bg-emerald-500"}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? "w-8 bg-amber-500" : "w-2 bg-slate-200"}`} />
        </div>

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
        {/* STEP 1: MOBILE & OTP VERIFICATION */}
        {/* ===================================================================== */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">10-Digit Mobile Number <span className="text-rose-500">*</span></Label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="tel"
                  maxLength={10}
                  disabled={otpSent}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Enter 10-digit phone"
                  className="pl-10 h-11 rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            {!otpSent ? (
              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || mobileNumber.length !== 10}
                className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
                Send 6-Digit OTP
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">Enter 6-Digit OTP <span className="text-rose-500">*</span></Label>
                    {devOtp && (
                      <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Dev OTP: {devOtp}
                      </span>
                    )}
                  </div>
                  <Input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="• • • • • •"
                    className="h-12 text-center font-mono text-lg tracking-widest rounded-xl border-amber-300 focus:border-amber-500"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    disabled={countdown > 0 || loading}
                    onClick={handleSendOtp}
                    className="text-amber-600 hover:text-amber-700 font-semibold disabled:text-slate-400 cursor-pointer"
                  >
                    {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(""); }}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Change Number
                  </button>
                </div>

                <Button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md"
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
          <form onSubmit={handleRegisterCcc} className="space-y-3.5 pt-1">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Verified Mobile: +91 {mobileNumber}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">7-Digit CCC Code <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  maxLength={7}
                  value={cccCode}
                  onChange={(e) => setCccCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  placeholder="e.g. 6612108"
                  className="h-10 font-mono text-sm rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Supply Name <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  value={cccName}
                  onChange={(e) => setCccName(e.target.value)}
                  placeholder="e.g. CHANCHAL CCC"
                  className="h-10 uppercase text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Station In-Charge Name / Designation</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. AE & Station Manager"
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Admin Password <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
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

            <Button
              type="submit"
              disabled={loading || !cccCode || cccCode.length !== 7 || !cccName || !password}
              className="w-full h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl shadow-lg mt-2 cursor-pointer"
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
