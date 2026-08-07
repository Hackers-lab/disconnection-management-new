"use client"

import { useState, useEffect } from "react"
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react"
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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFading, setIsFading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

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

  useEffect(() => {
    if (isPaused || feedbacks.length <= 1) return

    const timer = setInterval(() => {
      handleNext()
    }, 4500)

    return () => clearInterval(timer)
  }, [currentIndex, isPaused, feedbacks.length])

  const handleNext = () => {
    setIsFading(true)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % feedbacks.length)
      setIsFading(false)
    }, 300)
  }

  const handlePrev = () => {
    setIsFading(true)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + feedbacks.length) % feedbacks.length)
      setIsFading(false)
    }, 300)
  }

  const currentItem = feedbacks[currentIndex] || feedbacks[0]

  return (
    <div
      className="w-full max-w-md mx-auto select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3.5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-300">
        {/* Navigation Arrows */}
        {feedbacks.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10 opacity-70 hover:opacity-100"
              title="Previous review"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10 opacity-70 hover:opacity-100"
              title="Next review"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Animated 2-Line Content Box */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            isFading
              ? "opacity-0 translate-y-1.5 scale-[0.98]"
              : "opacity-100 translate-y-0 scale-100"
          } px-4 py-0.5 space-y-1.5`}
        >
          {/* Line 1: Officer Name, Supply Office Badge & 5-Star Rating */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-slate-900 text-xs truncate">
                {currentItem.name}
              </span>
              {currentItem.supplyOffice && (
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 shrink-0">
                  {currentItem.supplyOffice}
                </span>
              )}
            </div>

            {/* Rating Stars */}
            <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${
                    i < (currentItem.rating || 5)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-200 fill-slate-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Line 2: Complete Feedback Comment */}
          <div className="flex items-start gap-1.5 text-slate-700 text-xs font-medium leading-snug pt-0.5">
            <Quote className="w-3.5 h-3.5 text-blue-400 shrink-0 rotate-180 mt-0.5" />
            <p className="line-clamp-2 italic text-slate-700">
              {currentItem.comment}
            </p>
          </div>
        </div>

        {/* Footer: Interactive Pagination Dots */}
        {feedbacks.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {feedbacks.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setIsFading(true)
                  setTimeout(() => {
                    setCurrentIndex(idx)
                    setIsFading(false)
                  }, 300)
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? "w-5 bg-blue-600"
                    : "w-1.5 bg-slate-300 hover:bg-slate-400"
                }`}
                title={`Go to review ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
