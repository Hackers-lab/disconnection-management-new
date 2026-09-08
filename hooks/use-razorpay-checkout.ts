"use client"

import { useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"

declare global {
  interface Window {
    Razorpay?: any
  }
}

export interface CheckoutOptions {
  amount?: number // amount in paise (e.g. 9900 for ₹99)
  planName?: string
  days?: number
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  onSuccess?: (result: { expiresAt: string; paymentId: string; planName?: string; amount?: number }) => void
  onError?: (error: any) => void
}

/**
 * Hook to handle Razorpay Standard Web Checkout for Vendor Subscriptions.
 */
export function useRazorpayCheckout() {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // Dynamically load Razorpay SDK script if not already on window
  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(false)
        return
      }

      if (window.Razorpay) {
        resolve(true)
        return
      }

      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.async = true
      script.onload = () => resolve(true)
      script.onerror = () => {
        console.error("Failed to load Razorpay SDK checkout script")
        resolve(false)
      }
      document.body.appendChild(script)
    })
  }, [])

  const startCheckout = useCallback(
    async (options: CheckoutOptions = {}) => {
      const {
        amount = 9900,
        planName = "1 Month Vendor Access",
        days = 30,
        prefill = {},
        onSuccess,
        onError,
      } = options

      setLoading(true)

      try {
        // Step 1: Ensure Razorpay SDK script is loaded
        const scriptLoaded = await loadRazorpayScript()
        if (!scriptLoaded || !window.Razorpay) {
          throw new Error("Unable to load Razorpay payment portal. Please check your internet connection.")
        }

        // Step 2: Create Order on Backend
        const orderRes = await fetch("/api/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, planName, days }),
        })

        if (!orderRes.ok) {
          const errData = await orderRes.json().catch(() => ({}))
          throw new Error(errData.error || "Failed to initialize subscription order")
        }

        const orderData = await orderRes.json()
        const { order_id, key_id, currency } = orderData

        // Step 3: Configure Razorpay Checkout Modal
        const razorpayOptions = {
          key: key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount,
          currency: currency || "INR",
          name: "Disconnection Suite",
          description: `Vendor Subscription: ${planName}`,
          order_id,
          prefill: {
            name: prefill.name || "",
            email: prefill.email || "",
            contact: prefill.contact || "",
          },
          config: {
            display: {
              sequence: ["block.upi", "block.other"],
              preferences: {
                show_default_blocks: true,
              },
              blocks: {
                upi: {
                  name: "Pay using UPI (PhonePe / Google Pay / Paytm / QR)",
                  instruments: [
                    {
                      method: "upi",
                    },
                  ],
                },
                other: {
                  name: "Cards, Netbanking & Wallets",
                  instruments: [
                    { method: "card" },
                    { method: "netbanking" },
                    { method: "wallet" },
                  ],
                },
              },
            },
          },
          theme: {
            color: "#4f46e5",
          },
          modal: {
            backdropclose: false,
            escape: true,
            handleback: true,
            confirm_close: true,
            ondismiss: () => {
              setLoading(false)
              toast({
                title: "Payment Dismissed",
                description: "You closed the payment window without completing the transaction.",
                variant: "default",
              })
            },
          },
          handler: async (response: {
            razorpay_payment_id: string
            razorpay_order_id: string
            razorpay_signature: string
          }) => {
            try {
              // Step 4: Verify Payment Signature on Backend
              const verifyRes = await fetch("/api/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  days,
                }),
              })

              if (!verifyRes.ok) {
                const verifyErr = await verifyRes.json().catch(() => ({}))
                throw new Error(verifyErr.error || "Payment signature verification failed")
              }

              const verifyData = await verifyRes.json()

              toast({
                title: "🎉 Subscription Activated!",
                description: `Your vendor subscription has been extended until ${verifyData.expiresAt}.`,
                variant: "default",
              })

              setLoading(false)

              if (onSuccess) {
                onSuccess({
                  expiresAt: verifyData.expiresAt,
                  paymentId: response.razorpay_payment_id,
                  planName: verifyData.planName || planName,
                  amount: amount ? amount / 100 : 99,
                })
              } else {
                // Default action: refresh page to activate full access
                setTimeout(() => {
                  window.location.reload()
                }, 1000)
              }
            } catch (err: any) {
              setLoading(false)
              console.error("Verification error:", err)
              toast({
                title: "Verification Failed",
                description: err.message || "Failed to confirm payment status with server",
                variant: "destructive",
              })
              if (onError) onError(err)
            }
          },
        }

        const rzp = new window.Razorpay(razorpayOptions)

        rzp.on("payment.failed", (failedRes: any) => {
          setLoading(false)
          console.error("Payment failed:", failedRes)
          toast({
            title: "Payment Failed",
            description:
              failedRes?.error?.description || "Payment could not be processed. Please try again.",
            variant: "destructive",
          })
          if (onError) onError(failedRes?.error)
        })

        rzp.open()
      } catch (error: any) {
        setLoading(false)
        console.error("Checkout error:", error)
        toast({
          title: "Payment Error",
          description: error.message || "Unable to start checkout",
          variant: "destructive",
        })
        if (onError) onError(error)
      }
    },
    [loadRazorpayScript, toast]
  )

  return {
    startCheckout,
    loading,
  }
}
