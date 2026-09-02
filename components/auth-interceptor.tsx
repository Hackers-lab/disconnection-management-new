"use client"

import { useEffect } from "react"

export function AuthInterceptor() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await originalFetch(...args)

      // Only redirect on strict 401 Unauthenticated responses from application APIs
      if (res.status === 401) {
        const urlStr = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || ""
        if (!urlStr.includes("/login") && !urlStr.includes("/api/auth/login") && (urlStr.includes("/api/auth/") || urlStr.includes("/api/system/"))) {
          try {
            sessionStorage.removeItem("user_permissions")
          } catch (e) {
            // ignore
          }
          window.location.href = "/login"
        }
      }

      // Handle 402 Subscription Required — reload to trigger the subscription paywall
      if (res.status === 402) {
        const urlStr = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || ""
        if (urlStr.includes("/api/") && !urlStr.includes("/api/create-order") && !urlStr.includes("/api/verify-payment") && !urlStr.includes("/api/billing/")) {
          // Dispatch a custom event that the dashboard can listen for
          window.dispatchEvent(new CustomEvent("subscription-required"))
        }
      }

      return res
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
