"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Building2, AlertTriangle, CheckCircle2, LogOut, ArrowRight, Loader2, ShieldAlert } from "lucide-react"
import { logout } from "@/app/actions/auth"

interface AgencyProfileIncompleteProps {
  session: {
    userId: string
    username: string
    name?: string
    role: string
    cccCode?: string
    cccName?: string
    agencies?: string[]
  }
  agencyName: string
  existingVendorCode?: string
  existingMobileNumber?: string
  missingFields: {
    vendorCode: boolean
    mobileNumber: boolean
  }
}

export function AgencyProfileIncomplete({
  session,
  agencyName,
  existingVendorCode = "",
  existingMobileNumber = "",
  missingFields,
}: AgencyProfileIncompleteProps) {
  const [vendorCode, setVendorCode] = useState(existingVendorCode)
  const [mobileNumber, setMobileNumber] = useState(existingMobileNumber)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      window.location.href = "/login"
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const cleanVendor = vendorCode.trim()
    const cleanMobile = mobileNumber.replace(/\D/g, "").slice(-10)

    if (!cleanVendor || !/^\d{6}$/.test(cleanVendor)) {
      setError("Please enter a valid 6-digit Vendor Code (e.g. 701254).")
      return
    }

    if (!cleanMobile || cleanMobile.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorCode: cleanVendor,
          mobileNumber: cleanMobile,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile details.")
      }

      setSuccess(true)
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glow matching subscription paywall theme */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6 text-center">
        {/* Top badge & Icon */}
        <div className="space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
            <Building2 className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Profile Incomplete</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Complete Agency Profile
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            Enter your Vendor Code and mobile number to activate field operations for <strong className="text-slate-200">{agencyName}</strong>.
          </p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-left">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Profile updated! Activating workspace...</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="vendorCode" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Vendor Code</span>
              {missingFields.vendorCode && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Required</span>
              )}
            </Label>
            <Input
              id="vendorCode"
              type="text"
              maxLength={6}
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit Vendor Code (e.g. 701254)"
              disabled={loading || success}
              className="bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500 text-sm font-mono tracking-wider h-11"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mobileNumber" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Contractor Mobile Number</span>
              {missingFields.mobileNumber && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Required</span>
              )}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">+91</span>
              <Input
                id="mobileNumber"
                type="tel"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit phone number"
                disabled={loading || success}
                className="bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500 pl-11 text-sm font-mono tracking-wider h-11"
                required
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <Button
              type="submit"
              disabled={loading || success}
              className="w-full h-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 text-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-white" />
                  Activated! Loading Workspace...
                </>
              ) : (
                <>
                  <span>Save & Activate Workspace</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut || loading}
              variant="outline"
              className="w-full h-11 bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {loggingOut ? "Logging out..." : "Logout & Switch Account"}
            </Button>
          </div>

          <p className="text-[11px] text-slate-500 text-center pt-1">
            Station Admins can also update these credentials from the CCC Admin Panel
          </p>
        </form>
      </div>
    </div>
  )
}
