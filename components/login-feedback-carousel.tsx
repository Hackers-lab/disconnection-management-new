"use client"

import { useState, useEffect } from "react"
import type { FeedbackItem } from "@/lib/feedback-service"

const DEFAULT_FEEDBACKS: FeedbackItem[] = [
  {
    id: "def-1",
    username: "system",
    name: "Sub-Division Officer",
    supplyOffice: "Disconnection Team",
    cccCode: "MAIN",
    rating: 5,
    comment: "Fast real-time data sync & seamless disconnection tracking!",
    createdAt: new Date().toISOString(),
    status: "approved",
  },
  {
    id: "def-2",
    username: "system",
    name: "Field Technician",
    supplyOffice: "NSC & Meter Cell",
    cccCode: "MAIN",
    rating: 5,
    comment: "Very easy to issue meters and track field updates on mobile.",
    createdAt: new Date().toISOString(),
    status: "approved",
  },
]

export function LoginFeedbackCarousel() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>(DEFAULT_FEEDBACKS)

  useEffect(() => {
    let isMounted = true
    fetch("/api/feedback/public")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FeedbackItem[]) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setFeedbacks(data)
        }
      })
      .catch((err) => console.warn("Failed to load public feedbacks:", err))

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden py-1 px-2 select-none">
      <div className="relative flex items-center overflow-hidden">
        {/* Right-to-left marquee container */}
        <div className="animate-marquee whitespace-nowrap flex items-center gap-6 py-1">
          {feedbacks.map((item, idx) => (
            <div
              key={item.id || idx}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 bg-white/90 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-slate-200 shadow-sm"
            >
              <span className="italic text-slate-700">"{item.comment}"</span>
              <span className="text-slate-400 font-normal">—</span>
              <span className="font-bold text-slate-900">{item.name}</span>
              {item.supplyOffice && (
                <span className="text-blue-600 font-semibold text-[10px]">
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
