"use client"

import { useState, useEffect } from "react"
import type { FeedbackItem } from "@/lib/feedback-service"

export function LoginFeedbackCarousel() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    fetch("/api/feedback/public")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FeedbackItem[]) => {
        if (isMounted && Array.isArray(data)) {
          setFeedbacks(data)
        }
      })
      .catch((err) => console.warn("Failed to load public feedbacks:", err))
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (isLoading || feedbacks.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-lg mx-auto overflow-hidden py-1 px-2 select-none">
      <div className="relative flex items-center overflow-hidden">
        {/* Right-to-left marquee container */}
        <div className="animate-marquee whitespace-nowrap flex items-center gap-8 py-1">
          {feedbacks.map((item, idx) => (
            <div
              key={item.id || idx}
              className="inline-flex items-center gap-2 text-xs md:text-sm font-medium text-slate-800 bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-full border border-slate-200 shadow-xs"
            >
              <span className="italic text-slate-700">"{item.comment}"</span>
              <span className="text-slate-400 font-normal">—</span>
              <span className="font-semibold text-slate-900">{item.name}</span>
              {item.supplyOffice && (
                <span className="text-slate-500 font-normal text-[11px]">
                  ({item.supplyOffice})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
