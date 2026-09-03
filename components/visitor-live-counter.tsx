"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface VisitorLiveCounterProps {
  className?: string
  activeModule?: string
  action?: string
  showUi?: boolean
  showLiveUsers?: boolean
}

export function VisitorLiveCounter({ className = "", activeModule, action, showUi = true, showLiveUsers = false }: VisitorLiveCounterProps) {
  const [stats, setStats] = useState<{ totalVisitors: number; liveUsers: number } | null>(null)
  const cidRef = useRef<string>("")
  const lastPingRef = useRef<number>(0)

  const sendPresencePing = useCallback(async (isNewVisit = false) => {
    const now = Date.now()
    // Avoid spamming faster than 60s unless it is a brand new session visit
    if (!isNewVisit && now - lastPingRef.current < 60_000) return
    lastPingRef.current = now

    if (!cidRef.current) {
      try {
        let cid = localStorage.getItem("_app_cid") || ""
        if (!cid) {
          cid = "c_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
          localStorage.setItem("_app_cid", cid)
        }
        cidRef.current = cid
      } catch {
        cidRef.current = "c_" + Math.random().toString(36).substring(2, 11)
      }
    }

    try {
      const initParam = isNewVisit ? "&init=1" : ""
      const modParam = activeModule ? `&module=${encodeURIComponent(activeModule)}` : ""
      const actParam = action ? `&action=${encodeURIComponent(action)}` : ""
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)
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
    } catch {
      // Silently ignore network failures
    }
  }, [activeModule, action])

  useEffect(() => {
    // 1. Initial check for new session visit
    let isNewVisit = false
    try {
      if (!sessionStorage.getItem("_app_visit_logged")) {
        isNewVisit = true
        sessionStorage.setItem("_app_visit_logged", "1")
      }
    } catch {
      isNewVisit = false
    }

    // Fire initial presence ping
    sendPresencePing(isNewVisit)

    // 2. Gentle periodic heartbeat every 4 minutes while tab is active
    // With 10-minute server presence window, 4 minutes ensures continuous live status
    // while reducing Vercel invocations by 75-80%!
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        sendPresencePing(false)
      }
    }, 240_000)

    // 3. Heartbeat when user switches back to tab (debounced to at most once per 2 minutes)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastPingRef.current > 120_000) {
        sendPresencePing(false)
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [sendPresencePing])

  if (!showUi) return null

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
      Total Visits: {total}
      {showLiveUsers && ` • Live Users: ${live}`}
    </div>
  )
}
