"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { VendorSubscriptionCheckout } from "@/components/vendor-subscription-checkout"
import { ShieldAlert, CheckCircle2, Lock, LogOut, RefreshCw } from "lucide-react"
import { logout } from "@/app/actions/auth"

interface SubscriptionPaywallProps {
  session: {
    userId: string
    username: string
    name?: string
    role: string
    cccCode?: string
    cccName?: string
    agencies?: string[]
    subscriptionExpiresAt?: string
    subscriptionStatus?: string
  }
}

export function SubscriptionPaywall({ session }: SubscriptionPaywallProps) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const agencyName = (session.agencies && session.agencies.length > 0) ? session.agencies[0] : (session.name || session.username)

  const checkPaymentStatus = async (silent = false) => {
    if (!silent) setCheckingStatus(true)
    try {
      const res = await fetch("/api/billing/verify-status", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        if (data?.subscribed) {
          window.location.reload()
          return
        }
      }
    } catch {}
    if (!silent) setCheckingStatus(false)
  }

  // Auto-check when returning to tab from UPI app
  useEffect(() => {
    const handleFocus = () => checkPaymentStatus(true)
    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkPaymentStatus(true)
    })
    return () => {
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      try {
        sessionStorage.clear()
      } catch {}
      await logout()
    } catch {
      window.location.href = "/login"
    }
  }

  const plans = [
    {
      id: "monthly_79",
      amount: 7900,
      name: "1 Month Vendor Access",
      days: 30,
      label: "1 Month",
      price: "₹79",
      originalPrice: "₹199",
      badge: "60% OFF",
      subtext: "₹79 / mo",
    },
    {
      id: "quarterly_199",
      amount: 19900,
      name: "3 Month Vendor Access",
      days: 90,
      label: "3 Months",
      price: "₹199",
      originalPrice: "₹597",
      badge: "67% OFF",
      subtext: "₹66 / mo • Save ₹398",
      popular: true,
    },
    {
      id: "half_yearly_349",
      amount: 34900,
      name: "6 Month Vendor Access",
      days: 180,
      label: "6 Months",
      price: "₹349",
      originalPrice: "₹1,194",
      badge: "71% OFF",
      subtext: "₹58 / mo • Save ₹845",
    },
  ]

  const [selectedPlan, setSelectedPlan] = useState(plans[0])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6 text-center">
        
        {/* Top badge & Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Subscription Required</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Activate Vendor Workspace
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            Your agency access for <strong className="text-slate-200">{agencyName}</strong> (CCC: {session.cccCode || "N/A"}) is currently inactive or expired.
          </p>
        </div>

        {/* Multi-Plan Selection Grid */}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            {plans.map((p) => {
              const isSelected = selectedPlan.id === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p)}
                  className={`relative p-3 rounded-2xl border text-left flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-hidden ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500/15 shadow-md shadow-indigo-500/20 ring-1 ring-indigo-500"
                      : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/40"
                  }`}
                >
                  {p.badge && (
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider mb-1.5 self-start ${
                        p.popular
                          ? "bg-amber-500 text-slate-950"
                          : "bg-indigo-600/80 text-white"
                      }`}
                    >
                      {p.badge}
                    </span>
                  )}
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">{p.label}</span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-lg font-black text-white">{p.price}</span>
                      <span className="text-[10px] text-slate-500 line-through">{p.originalPrice}</span>
                    </div>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 font-medium">{p.subtext}</span>
                </button>
              )
            })}
          </div>

          <div className="p-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-indigo-950/30 to-slate-900/30 text-left space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Selected Plan:</span>
              <span className="font-bold text-indigo-300">{selectedPlan.name} ({selectedPlan.price})</span>
            </div>
            
            <div className="space-y-1.5 border-t border-slate-800/80 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Disconnection & Reconnection field processing</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Smart Meter Replacement & Stock Registry</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Multi-user technician access across all devices</span>
              </div>
            </div>

            {session.subscriptionExpiresAt && (
              <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-lg">
                Last session expired: {session.subscriptionExpiresAt}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pt-1">
          <VendorSubscriptionCheckout 
            amount={selectedPlan.amount}
            planName={selectedPlan.name}
            days={selectedPlan.days}
            buttonText={`Pay ${selectedPlan.price} with Razorpay & Activate`}
            userPrefill={{
              name: session.name || session.username,
              contact: session.username.replace(/\D/g, "").length >= 10 ? session.username.replace(/\D/g, "").slice(-10) : undefined,
            }}
            className="w-full h-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 text-sm"
          />

          <Button 
            onClick={() => checkPaymentStatus(false)}
            disabled={checkingStatus}
            variant="outline"
            className="w-full h-10 bg-slate-900/60 border-slate-800 text-indigo-300 hover:bg-indigo-950/40 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${checkingStatus ? "animate-spin text-indigo-400" : ""}`} />
            {checkingStatus ? "Checking Razorpay status..." : "Already Paid? Check Status & Refresh"}
          </Button>

          <Button 
            onClick={handleLogout}
            disabled={loggingOut}
            variant="outline"
            className="w-full h-11 bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {loggingOut ? "Logging out..." : "Logout & Switch Account"}
          </Button>
        </div>

        <p className="text-[11px] text-slate-500">
          Secured by Razorpay • Instant access across all devices
        </p>
      </div>
    </div>
  )
}
