"use client"

import { useState, useEffect } from "react"
import { Star, X } from "lucide-react"
import { FeedbackDialog } from "@/components/feedback-dialog"

interface FloatingRatingPillProps {
  initialHasFeedback?: boolean
}

export function FloatingRatingPill({ initialHasFeedback = false }: FloatingRatingPillProps) {
  const [isVisible, setIsVisible] = useState(!initialHasFeedback)
  const [selectedStar, setSelectedStar] = useState<number | null>(null)
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
    } catch (e) {
      // ignore
    }

    // Check if user has already submitted feedback via Turso DB (<1ms)
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
  }, [])

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsVisible(false)
    try {
      sessionStorage.setItem("feedback_pill_dismissed", "true")
    } catch (e) {
      // ignore
    }
  }

  const handleStarClick = () => {
    setSelectedStar(5)
    setDialogOpen(true)
  }

  if (!isVisible) return null

  return (
    <>
      <div className="fixed bottom-20 sm:bottom-5 right-3 sm:right-5 z-40 flex items-center gap-1.5 bg-slate-900/95 text-white px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full border border-amber-400/40 shadow-2xl backdrop-blur-md hover:border-amber-400 transition-all duration-300 group">
        <span className="text-[11px] font-semibold text-amber-300 mr-1 hidden sm:inline">
          ★ Rate App:
        </span>
        
        {/* 5 Stars - Clicking opens feedback form with 5 stars by default */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={handleStarClick}
              className="p-0.5 sm:p-1 hover:scale-125 transition-transform text-amber-400 focus:outline-none cursor-pointer"
              title="Rate App 5 Stars"
            >
              <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setSelectedStar(5)
            setDialogOpen(true)
          }}
          className="text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-colors ml-1 underline decoration-amber-400/50 cursor-pointer"
          title="Click to submit or update your feedback"
        >
          Review
        </button>

        {/* X Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="ml-1 p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Close rating prompt"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Controlled Feedback Modal */}
      {dialogOpen && (
        <FeedbackDialog
          initialRating={5}
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
