"use client"

import { useState, useEffect, useRef } from "react"

interface VisitorLiveCounterProps {
  className?: string
  activeModule?: string
  action?: string
}

export function VisitorLiveCounter({ className = "", activeModule, action }: VisitorLiveCounterProps) {
  const [stats, setStats] = useState<{ totalVisitors: number; liveUsers: number } | null>(null)
  const cidRef = useRef<string>("")
  const lastPingRef = useRef<number>(0)

  useEffect(() => {
    // 1. Get or generate persistent client ID
    let cid = ""
    try {
      cid = localStorage.getItem("_app_cid") || ""
      if (!cid) {
        cid = "c_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
        localStorage.setItem("_app_cid", cid)
      }
    } catch {
      cid = "c_" + Math.random().toString(36).substring(2, 11)
    }
    cidRef.current = cid

    // 2. Check if this is a new visit in this browser session
    let isNewVisit = false
    try {
      if (!sessionStorage.getItem("_app_visit_logged")) {
        isNewVisit = true
        sessionStorage.setItem("_app_visit_logged", "1")
      }
    } catch {
      isNewVisit = false
    }

    // 3. Heartbeat fetch function
    const sendHeartbeat = async (initial = false) => {
      try {
        const initParam = initial && isNewVisit ? "&init=1" : ""
        const modParam = activeModule ? `&module=${encodeURIComponent(activeModule)}` : ""
        const actParam = action ? `&action=${encodeURIComponent(action)}` : ""
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2500)
        const res = await fetch(`/api/system/presence?cid=${encodeURIComponent(cidRef.current)}${initParam}${modParam}${actParam}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        if (res.ok) {
          const data = await res.json()
          if (data && typeof data.totalVisitors === "number") {
            setStats(data)
          }
        }
        lastPingRef.current = Date.now()
      } catch {
        // Silently ignore network failures
      }
    }

    // Initial or module change ping
    sendHeartbeat(true)

    // 4. Periodic heartbeat interval (every 45 seconds while tab is active)
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        sendHeartbeat(false)
      }
    }, 45_000)

    // 5. Visibility change listener: immediately ping if returning to tab after > 30s
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastPingRef.current > 30_000) {
          sendHeartbeat(false)
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // 6. Cleanup on unload / tab close using sendBeacon
    const handleUnload = () => {
      if (typeof navigator !== "undefined" && navigator.sendBeacon && cidRef.current) {
        navigator.sendBeacon("/api/system/presence", JSON.stringify({ cid: cidRef.current }))
      }
    }
    window.addEventListener("pagehide", handleUnload)
    window.addEventListener("beforeunload", handleUnload)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handleUnload)
      window.removeEventListener("beforeunload", handleUnload)
    }
  }, [])

  // If not loaded yet, show a clean placeholder or fallback
  const total = stats ? stats.totalVisitors.toLocaleString() : "..."
  const live = stats ? stats.liveUsers : 1

  return (
    <div
      className={
        "text-center text-[11px] sm:text-xs text-slate-400 font-medium select-none tracking-tight " +
        className
      }
    >
      Total Visits: {total} • Live Users: {live}
    </div>
  )
}
