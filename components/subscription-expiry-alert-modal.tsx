"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { VendorSubscriptionCheckout } from "@/components/vendor-subscription-checkout"
import {
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Info,
} from "lucide-react"

interface SubscriptionExpiryAlertModalProps {
  userId?: string
  username?: string
  role?: string
  agencyName?: string
  subscriptionExpiresAt?: string
  onSubscriptionRenewed?: (result: { expiresAt: string; paymentId: string; planName?: string; amount?: number }) => void
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const parts = dateStr.split("T")[0].split("-")
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
  } catch (e) {}
  return dateStr
}

export function SubscriptionExpiryAlertModal({
  userId,
  username,
  role = "agency",
  agencyName,
  subscriptionExpiresAt,
  onSubscriptionRenewed,
}: SubscriptionExpiryAlertModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [formattedExpiryDate, setFormattedExpiryDate] = useState("")

  useEffect(() => {
    if (!subscriptionExpiresAt) return

    const exp = new Date(subscriptionExpiresAt)
    if (isNaN(exp.getTime())) return

    // Subscriptions are active through end-of-day (23:59:59.999)
    exp.setHours(23, 59, 59, 999)

    const now = new Date()
    const diffMs = exp.getTime() - now.getTime()
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    // Only alert when 0 <= daysRemaining <= 3
    if (days < 0 || days > 3) {
      return
    }

    setDaysRemaining(days)
    setFormattedExpiryDate(formatDateDisplay(subscriptionExpiresAt))

    // Track daily notification: only show on first login/open of each day
    const todayStr = new Date().toISOString().split("T")[0]
    const storageKey = `sub_expiry_alert_${userId || username || "user"}_${todayStr}`

    const alreadyShownToday = localStorage.getItem(storageKey)
    if (!alreadyShownToday) {
      setIsOpen(true)
    }
  }, [subscriptionExpiresAt, userId, username])

  const handleDismiss = () => {
    const todayStr = new Date().toISOString().split("T")[0]
    const storageKey = `sub_expiry_alert_${userId || username || "user"}_${todayStr}`
    try {
      localStorage.setItem(storageKey, "true")
    } catch (e) {}
    setIsOpen(false)
  }

  const handleCheckoutSuccess = (result: { expiresAt: string; paymentId: string; planName?: string; amount?: number }) => {
    handleDismiss()
    if (onSubscriptionRenewed) {
      onSubscriptionRenewed(result)
    }
  }

  if (!isOpen || daysRemaining === null) return null

  const isAdmin = role === "admin"
  const isLastDay = daysRemaining <= 0

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md w-[92vw] sm:w-full p-0 overflow-hidden rounded-3xl border border-amber-500/30 shadow-2xl [&>button]:hidden flex flex-col bg-white">
        <DialogTitle className="sr-only">Subscription Expiry Reminder</DialogTitle>

        {/* --- HEADER --- */}
        <div className="relative bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 text-white px-6 pt-6 pb-5 text-center shrink-0 border-b border-amber-500/20 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-orange-500/15 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center justify-center bg-amber-500/15 border border-amber-500/30 p-3 rounded-2xl mb-1 shadow-inner">
              <AlertTriangle className="h-7 w-7 text-amber-400 animate-bounce" />
            </div>

            <div>
              <span className="inline-block px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[11px] font-extrabold tracking-wider text-amber-300 uppercase">
                {isLastDay ? "Expires Today" : `Expires in ${daysRemaining} Day${daysRemaining > 1 ? "s" : ""}`}
              </span>
            </div>

            <h2 className="text-xl font-black tracking-tight text-white">
              {isAdmin ? "Office Trial Period Ending Soon" : "Agency Subscription Ending Soon"}
            </h2>

            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
              {isAdmin ? (
                <>
                  Free operational trial for your CCC expires after{" "}
                  <span className="font-bold text-amber-300">{formattedExpiryDate}</span>.
                </>
              ) : (
                <>
                  Your active access for{" "}
                  <span className="font-bold text-amber-300">{agencyName || "your agency"}</span> will expire after{" "}
                  <span className="font-bold text-amber-300">{formattedExpiryDate}</span>.
                </>
              )}
            </p>
          </div>
        </div>

        {/* --- BODY --- */}
        <div className="px-6 py-5 space-y-3.5 bg-slate-50/50">
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-left">
            <Clock className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-bold text-sm text-amber-900">
                Subscription Required After {formattedExpiryDate}
              </p>
              <p className="text-amber-800/90 leading-relaxed">
                {isAdmin
                  ? "Contractor agencies will need an active subscription (₹99/month) after this date to continue executing disconnections and field updates."
                  : "To prevent interruption to your disconnection lists and field work, renew your subscription before access closes."}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="h-4 w-4 text-slate-400" /> Expiry Date:
              </span>
              <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                {formattedExpiryDate}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldAlert className="h-4 w-4 text-slate-400" /> Grace Window:
              </span>
              <span className="font-semibold text-amber-700">
                Active until 11:59 PM IST
              </span>
            </div>
          </div>
        </div>

        {/* --- ACTIONS --- */}
        <div className="px-6 pb-6 pt-3 bg-white border-t border-slate-100 space-y-2.5">
          {!isAdmin && (
            <VendorSubscriptionCheckout
              amount={9900}
              planName="1 Month Vendor Access"
              days={30}
              buttonText="Renew Subscription Now (₹99)"
              className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-amber-600/25 justify-center"
              userPrefill={{
                name: agencyName || username,
              }}
              onSuccess={handleCheckoutSuccess}
            />
          )}

          <Button
            variant={isAdmin ? "default" : "outline"}
            className={`w-full h-11 rounded-2xl text-xs font-semibold ${
              isAdmin
                ? "bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10"
                : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
            onClick={handleDismiss}
          >
            {isAdmin ? "Got It, Continue to Dashboard" : "Remind Me Tomorrow & Continue"}
          </Button>
          
          <p className="text-center text-[10px] text-slate-400 font-medium">
            This notice appears once per day during the last 3 days of your subscription.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}