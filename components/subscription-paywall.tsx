"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { VendorSubscriptionCheckout } from "@/components/vendor-subscription-checkout"
import { ShieldAlert, CheckCircle2, Lock, LogOut } from "lucide-react"
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
  const agencyName = (session.agencies && session.agencies.length > 0) ? session.agencies[0] : (session.name || session.username)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      window.location.href = "/login"
    }
  }

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

        {/* Pricing Card */}
        <div className="p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/40 to-slate-900/40 relative overflow-hidden text-left space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">1 Month Full Access</span>
            <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Save 50%</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-white">₹99</span>
            <span className="text-xs text-slate-400">/ 30 days</span>
            <span className="text-xs text-slate-500 line-through">₹199</span>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Real-time Consumer Disconnection & Reconnection</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Smart Meter Replacement & Stock Registry</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Safety Tickets, Deemed DC & NSC Field Processing</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Multi-user access for all agency technicians</span>
            </div>
          </div>

          {session.subscriptionExpiresAt && (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
              Expired on: {session.subscriptionExpiresAt}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pt-2">
          <VendorSubscriptionCheckout 
            amount={9900}
            planName="1 Month Vendor Access"
            days={30}
            buttonText="Pay ₹99 with Razorpay & Activate"
            userPrefill={{
              name: session.name || session.username,
            }}
            className="w-full h-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 text-sm"
          />

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
