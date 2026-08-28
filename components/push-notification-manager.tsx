"use client"

import { useEffect, useState } from "react"
import { Bell, BellRing, X, CheckCircle2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { triggerHaptic } from "@/lib/utils"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BLhrpLQ5VV3pPOXpzRjH0vKf8iisSztaRu5duHcpk86mPYNGjWksIgwygr7Oba5vUNSf3T9XW0gZWme1SVBKvlw"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function PushNotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [supported, setSupported] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return
    }

    setSupported(true)
    const currentPermission = Notification.permission
    setPermission(currentPermission)

    // Register service worker
    navigator.serviceWorker.register("/sw.js").then(reg => {
      // If already granted, auto-sync subscription
      if (currentPermission === "granted") {
        syncSubscription(reg)
      }
    }).catch(err => {
      console.warn("[sw] Registration failed:", err)
    })

    // Show prompt if default (not asked yet) after 4 seconds of usage
    const dismissed = localStorage.getItem("push_prompt_dismissed")
    if (currentPermission === "default" && !dismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [])

  const syncSubscription = async (reg: ServiceWorkerRegistration) => {
    try {
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        })
      }

      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub })
      })
    } catch (e) {
      console.warn("[push] Subscription sync error:", e)
    }
  }

  const handleEnablePush = async () => {
    setRegistering(true)
    triggerHaptic("tap")

    try {
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      setPermission(perm)

      if (perm === "granted") {
        const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        })

        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub })
        })

        triggerHaptic("success")
        setSuccess(true)
        setTimeout(() => {
          setShowPrompt(false)
        }, 2000)
      } else {
        triggerHaptic("warning")
        setShowPrompt(false)
      }
    } catch (err) {
      console.error("[push] Enable error:", err)
      triggerHaptic("error")
    } finally {
      setRegistering(false)
    }
  }

  const handleDismiss = () => {
    triggerHaptic("tap")
    localStorage.setItem("push_prompt_dismissed", "true")
    setShowPrompt(false)
  }

  if (!supported || !showPrompt || permission === "denied") {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white/95 backdrop-blur-md border border-blue-200/90 p-3.5 rounded-2xl shadow-xl space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 shrink-0">
              {success ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <BellRing className="h-5 w-5 animate-bounce" />}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                {success ? "Notifications Activated!" : "Enable Mobile Push Alerts"}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                {success
                  ? "You will now receive instant disconnection and office updates."
                  : "Receive instant updates on new DC lists, consumer payments, and office announcements on this device."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {!success && (
          <div className="flex items-center gap-2 pt-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-7 text-xs text-slate-500 hover:text-slate-700 px-2.5"
            >
              Later
            </Button>
            <Button
              size="sm"
              onClick={handleEnablePush}
              disabled={registering}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 rounded-lg shadow-sm"
            >
              {registering ? "Enabling..." : "Allow Alerts"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
