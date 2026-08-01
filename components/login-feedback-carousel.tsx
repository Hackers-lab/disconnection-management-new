"use client"

import { useState, useEffect, useRef } from "react"
import { Star, Building2, Quote, ChevronLeft, ChevronRight, Sparkles, UserCheck } from "lucide-react"
import type { FeedbackItem } from "@/lib/feedback-service"

export function LoginFeedbackCarousel() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const autoSlideTimerRef = useRef<NodeJS.Timeout | null>(null)

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
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Auto-slide effect every 4.5 seconds
  useEffect(() => {
    if (feedbacks.length <= 1 || isPaused) return

    autoSlideTimerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % feedbacks.length)
    }, 4500)

    return () => {
      if (autoSlideTimerRef.current) clearInterval(autoSlideTimerRef.current)
    }
  }, [feedbacks.length, isPaused])

  if (isLoading || feedbacks.length === 0) {
    return null
  }

  const current = feedbacks[currentIndex]

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + feedbacks.length) % feedbacks.length)
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % feedbacks.length)
  }

  return (
    <div
      className="w-full max-w-4xl mx-auto px-4 py-2 my-2 transition-all duration-500 ease-in-out"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-800/85 to-indigo-950/90 backdrop-blur-md border border-slate-700/60 shadow-2xl p-4 md:p-5 text-white group">
        
        {/* Ambient background glow element */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700" />
        <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-700" />

        {/* Carousel Content */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          
          {/* Main Feedback & Quote Section */}
          <div className="flex-1 min-w-0 space-y-2">
            
            {/* Header badges: Supply Office & User Rating */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-600/30 to-indigo-600/30 border border-blue-400/40 text-blue-200 shadow-sm animate-pulse">
                <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate max-w-[200px]">{current.supplyOffice}</span>
                {current.cccCode && <span className="opacity-75 font-mono">({current.cccCode})</span>}
              </span>

              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-400/40 text-amber-300">
                {Array.from({ length: current.rating || 5 }).map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                ))}
                <span className="ml-1 text-[11px] font-mono">{current.rating}.0</span>
              </div>

              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
                <Sparkles className="w-3 h-3 text-indigo-400" /> Verified User Feedback
              </span>
            </div>

            {/* Comment Text with animated typography */}
            <div className="flex items-start gap-2 pt-1">
              <Quote className="w-5 h-5 text-indigo-400 shrink-0 opacity-60 rotate-180" />
              <p className="text-sm md:text-base font-medium text-slate-100 leading-relaxed italic line-clamp-2 md:line-clamp-3 transition-all duration-300">
                "{current.comment}"
              </p>
            </div>

            {/* User & Office Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-300 pt-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-bold text-white tracking-wide">{current.name}</span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-slate-400">@{current.username}</span>
            </div>

          </div>

          {/* Navigation Controls & Slide Indicators */}
          <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/50">
            {/* Dots */}
            <div className="flex items-center gap-1.5">
              {feedbacks.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentIndex ? "w-6 bg-gradient-to-r from-blue-400 to-indigo-400" : "w-1.5 bg-slate-600 hover:bg-slate-400"
                  }`}
                  aria-label={`Go to feedback ${idx + 1}`}
                />
              ))}
            </div>

            {/* Prev / Next Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all"
                aria-label="Previous feedback"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all"
                aria-label="Next feedback"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
