"use client"

import { useState, useEffect, useRef } from "react"

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

    // 3. Single fetch for visitor count (no repeated interval polling)
    const fetchVisitCount = async () => {
      try {
        const initParam = isNewVisit ? "&init=1" : ""
        const modParam = activeModule ? `&module=${encodeURIComponent(activeModule)}` : ""
        const actParam = action ? `&action=${encodeURIComponent(action)}` : ""
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
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
    }

    fetchVisitCount()
  }, [activeModule, action])

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
