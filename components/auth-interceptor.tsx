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
        if (!urlStr.includes("/login") && !urlStr.includes("/api/auth/login")) {
          try {
            sessionStorage.removeItem("user_permissions")
          } catch (e) {
            // ignore
          }
          window.location.href = "/login"
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
