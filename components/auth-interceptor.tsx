"use client"

import { useEffect } from "react"

export function AuthInterceptor() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await originalFetch(...args)
      if (res.status === 401) {
        // Clear cached permissions
        try {
          sessionStorage.removeItem("user_permissions")
        } catch (e) {
          // ignore
        }
        // Redirect to login page
        window.location.href = "/login"
      }
      return res
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
