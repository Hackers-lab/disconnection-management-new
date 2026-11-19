"use client"

import { useState, useEffect } from "react"
import { Star, X } from "lucide-react"
import { FeedbackDialog } from "@/components/feedback-dialog"

interface FloatingRatingPillProps {
  initialHasFeedback?: boolean
}

export function FloatingRatingPill({ initialHasFeedback = false }: FloatingRatingPillProps) {
  const [isVisible, setIsVisible] = useState(!initialHasFeedback)
  const [selectedStar, setSelectedStar] = useState<number>(5)
  const [hoveredStar, setHoveredStar] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (initialHasFeedback) {
      setIsVisible(false)
      return
    }

    let isMounted = true
    try {
      const dismissed = sessionStorage.getItem("feedback_pill_dismissed")
      if (dismissed === "true") {
        setIsVisible(false)
        return
      }
    } catch {
      // ignore
    }

    fetch("/api/feedback")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.hasSubmitted) {
          setIsVisible(false)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [initialHasFeedback])

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsVisible(false)
    try {
      sessionStorage.setItem("feedback_pill_dismissed", "true")
    } catch {
      // ignore
    }
  }

  const handleStarClick = (starValue: number) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    setSelectedStar(starValue)
    setDialogOpen(true)
  }

  if (!isVisible) return null

  const activePreview = hoveredStar ?? 5

  return (
    <>
      <div className="fixed bottom-20 sm:bottom-5 right-3 sm:right-5 z-40 flex items-center gap-1.5 bg-white/95 text-slate-800 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full border border-amber-300/80 shadow-lg hover:shadow-xl backdrop-blur-md hover:border-amber-400 transition-all duration-200 animate-fade-slide-up group">
        <span className="text-[11px] font-semibold text-slate-600 mr-1 hidden sm:inline">
          Rate App:
        </span>

        {/* 5 Interactive Stars — honors exact star chosen by user */}
        <div
          className="flex items-center gap-0.5"
          onMouseLeave={() => setHoveredStar(null)}
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = star <= activePreview
            return (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoveredStar(star)}
                onClick={() => handleStarClick(star)}
                className="p-1 hover:scale-125 active:scale-95 transition-transform focus:outline-none cursor-pointer"
                title={`Rate App ${star} Star${star > 1 ? "s" : ""}`}
                aria-label={`Rate App ${star} Star${star > 1 ? "s" : ""}`}
              >
                <Star
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    filled
                      ? "fill-amber-400 text-amber-400"
                      : "fill-transparent text-slate-300"
                  }`}
                />
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => handleStarClick(selectedStar || 5)}
          className="text-[11px] font-bold text-amber-700 hover:text-amber-800 transition-colors ml-1 underline decoration-amber-400/50 cursor-pointer"
          title="Submit or update your feedback"
        >
          Review
        </button>

        {/* X Dismiss Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-1 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Close rating prompt"
          aria-label="Close rating prompt"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Controlled Feedback Modal with exact clicked star */}
      {dialogOpen && (
        <FeedbackDialog
          initialRating={selectedStar}
          open={dialogOpen}
          onOpenChange={(openState) => {
            setDialogOpen(openState)
            if (!openState) {
              fetch("/api/feedback")
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                  if (data?.feedback) {
                    setIsVisible(false)
                  }
                })
                .catch(() => {})
            }
          }}
        />
      )}
    </>
  )
}
