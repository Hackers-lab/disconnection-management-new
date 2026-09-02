"use client"

import { Button } from "@/components/ui/button"
import { useRazorpayCheckout } from "@/hooks/use-razorpay-checkout"
import { CreditCard, Loader2, Sparkles, ShieldCheck } from "lucide-react"

interface VendorSubscriptionCheckoutProps {
  amount?: number // in paise (e.g. 9900 = ₹99)
  planName?: string
  days?: number
  buttonText?: string
  className?: string
  userPrefill?: {
    name?: string
    email?: string
    contact?: string
  }
  onSuccess?: (result: { expiresAt: string; paymentId: string }) => void
}

export function VendorSubscriptionCheckout({
  amount = 9900,
  planName = "1 Month Vendor Access",
  days = 30,
  buttonText,
  className = "",
  userPrefill,
  onSuccess,
}: VendorSubscriptionCheckoutProps) {
  const { startCheckout, loading } = useRazorpayCheckout()

  const handlePayment = () => {
    startCheckout({
      amount,
      planName,
      days,
      prefill: userPrefill,
      onSuccess,
    })
  }

  const displayAmount = (amount / 100).toLocaleString("en-IN")

  return (
    <Button
      type="button"
      onClick={handlePayment}
      disabled={loading}
      className={`relative group overflow-hidden font-semibold transition-all duration-200 ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Opening Secure Gateway...
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4 mr-2 text-indigo-200" />
          {buttonText || `Pay ₹${displayAmount} & Subscribe`}
        </>
      )}
    </Button>
  )
}
