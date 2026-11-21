"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Building2, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react"
import { PhoneEmailButton } from "@/components/phone-email-button"

interface RegisterCccDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RegisterCccDialog({ open, onOpenChange, onSuccess }: RegisterCccDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1) // 1: Phone.Email OTP verification, 2: CCC details & password
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Step 1: Verified mobile & token
  const [mobileNumber, setMobileNumber] = useState("")
  const [verificationToken, setVerificationToken] = useState("")

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
      const timer = setTimeout(() => {
        setStep(1)
        setError(null)
        setSuccessMsg(null)
        setMobileNumber("")
        setVerificationToken("")
        setCccCode("")
        setCccName("")
        setContactPerson("")
        setPassword("")
        setConfirmPassword("")
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [open])

  // 1. Handle verified Phone.Email callback
  const handlePhoneEmailVerified = async (userJsonUrl: string) => {
    setError(null)
    setSuccessMsg(null)
    try {
      setLoading(true)

      // Exchange Phone.Email user_json_url server-side for verified mobile + signed token
      const verifyRes = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "phone-email-verified",
          userJsonUrl,
        }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok || !verifyData.verificationToken || !verifyData.verifiedMobile) {
        throw new Error(verifyData.error || "Mobile verification failed. Please try again.")
      }

      const verifiedMob = String(verifyData.verifiedMobile)

      // Check if this mobile number is already registered before moving to Step 2
      const checkRes = await fetch(`/api/auth/register-ccc?mobile=${encodeURIComponent(verifiedMob)}`, {
        cache: "no-store",
      })
      const checkData = await checkRes.json().catch(() => ({}))
      if (!checkRes.ok) {
        throw new Error(checkData.error || "Could not check mobile registration status.")
      }

      if (checkData.exists) {
        setError(
          checkData.error ||
            "This mobile number is already registered. Please sign in or use 'Forgot Password'."
        )
        return
      }

      setMobileNumber(verifiedMob)
      setVerificationToken(verifyData.verificationToken)
      setSuccessMsg(`Mobile +91 ${verifiedMob} verified successfully!`)
      setTimeout(() => {
        setSuccessMsg(null)
        setStep(2)
      }, 600)
    } catch (err: any) {
      console.error("Phone.Email register verify error:", err)
      setError(err?.message || "Failed to verify mobile number. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 2. Register CCC Station
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
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to register CCC station.")

      setSuccessMsg(data.message || "Station registered successfully! Redirecting...")
      setTimeout(() => {
        onOpenChange(false)
        if (onSuccess) onSuccess()
        router.push(data.redirectTo || "/dashboard")
      }, 1000)
    } catch (err: any) {
      setError(err?.message || "Failed to register CCC station.")
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
            <Building2 className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
            Register New CCC Office
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {step === 1
              ? "Verify your 10-digit mobile number via SMS OTP to create your station account."
              : "Enter your station details to complete registration."}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1.5 py-0.5">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? "w-6 bg-slate-900" : "w-2 bg-slate-400"}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? "w-6 bg-slate-900" : "w-2 bg-slate-200"}`} />
        </div>

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
        {/* STEP 1: MOBILE VERIFICATION VIA PHONE.EMAIL                           */}
        {/* ===================================================================== */}
        {step === 1 && (
          <div className="space-y-3.5 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Click the button below to verify your <strong>10-digit mobile number</strong> with a quick SMS OTP. Once verified, you can set up your CCC Station ID and password.
              </p>
            </div>

            <PhoneEmailButton
              onVerified={handlePhoneEmailVerified}
              verifying={loading}
              helperText="A secure Phone.Email popup will open to send & verify your SMS OTP."
            />
          </div>
        )}

        {/* ===================================================================== */}
        {/* STEP 2: CCC DETAILS & PASSWORD CREATION                               */}
        {/* ===================================================================== */}
        {step === 2 && (
          <form onSubmit={handleRegisterCcc} className="space-y-3.5 pt-1">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Verified: +91 {mobileNumber}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setVerificationToken("")
                  setMobileNumber("")
                  setError(null)
                }}
                className="text-[11px] text-slate-500 hover:text-slate-900 underline cursor-pointer"
              >
                Change
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">7-Digit CCC Code <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  maxLength={7}
                  value={cccCode}
                  onChange={(e) => setCccCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  placeholder="e.g. 6612108"
                  className="h-10 font-mono text-xs sm:text-sm rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Supply Name <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  value={cccName}
                  onChange={(e) => setCccName(e.target.value)}
                  placeholder="e.g. CHANCHAL CCC"
                  className="h-10 uppercase text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Station In-Charge Name / Designation</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. AE & Station Manager"
                className="h-10 text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Admin Password <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
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
              disabled={loading || !cccCode || cccCode.length !== 7 || !cccName || !password}
              className="w-full h-10 sm:h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl shadow transition-all duration-200 active:scale-[0.99] mt-1 cursor-pointer text-xs sm:text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Register CCC
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
