"use client"

import { useState, useEffect } from "react"
import { Star, X, Gift } from "lucide-react"
import { FeedbackDialog } from "@/components/feedback-dialog"
import {
  FEEDBACK_REWARD_DAYS,
  FEEDBACK_REWARD_EVENT,
  type FeedbackRewardStatus,
} from "@/lib/feedback-reward-utils"

interface FloatingRatingPillProps {
  initialHasFeedback?: boolean
}

export function FloatingRatingPill({ initialHasFeedback = false }: FloatingRatingPillProps) {
  const [isVisible, setIsVisible] = useState(!initialHasFeedback)
  const [selectedStar, setSelectedStar] = useState<number>(5)
  const [hoveredStar, setHoveredStar] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rewardStatus, setRewardStatus] = useState<FeedbackRewardStatus | null>(null)

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

    fetch("/api/feedback", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return
        if (data.rewardStatus) {
          setRewardStatus(data.rewardStatus)
        }
        if (data.hasSubmitted) {
          setIsVisible(false)
        }
      })
      .catch(() => {})

    const handleRewardGranted = () => {
      if (isMounted) {
        setIsVisible(false)
      }
    }

    window.addEventListener(FEEDBACK_REWARD_EVENT, handleRewardGranted)
    return () => {
      isMounted = false
      window.removeEventListener(FEEDBACK_REWARD_EVENT, handleRewardGranted)
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
  const isRewardEligible = Boolean(rewardStatus?.eligible)
  const bonusDays = rewardStatus?.daysBonus ?? FEEDBACK_REWARD_DAYS

  return (
    <>
      <div
        className={`fixed bottom-20 sm:bottom-5 right-3 sm:right-5 z-40 flex items-center gap-1.5 bg-white/95 text-slate-800 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full border shadow-lg hover:shadow-xl backdrop-blur-md transition-all duration-200 animate-fade-slide-up group ${
          isRewardEligible
            ? "border-emerald-400/90 hover:border-emerald-500 ring-2 ring-emerald-500/15"
            : "border-amber-300/80 hover:border-amber-400"
        }`}
      >
        {isRewardEligible ? (
          <button
            type="button"
            onClick={() => handleStarClick(selectedStar || 5)}
            className="inline-flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs mr-0.5 cursor-pointer hover:from-emerald-700 hover:to-teal-700 transition-all"
            title={`Write a review and get +${bonusDays} free subscription days`}
          >
            <Gift className="w-3 h-3 shrink-0" />
            <span>+{bonusDays}d Free</span>
          </button>
        ) : (
          <span className="text-[11px] font-semibold text-slate-600 mr-1 hidden sm:inline">
            Rate App:
          </span>
        )}

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
          className={`text-[11px] font-bold transition-colors ml-0.5 underline cursor-pointer ${
            isRewardEligible
              ? "text-emerald-700 hover:text-emerald-800 decoration-emerald-400/60"
              : "text-amber-700 hover:text-amber-800 decoration-amber-400/50"
          }`}
          title={
            isRewardEligible
              ? `Write a brief review to unlock +${bonusDays} free days`
              : "Submit or update your feedback"
          }
        >
          {isRewardEligible ? "Claim" : "Review"}
        </button>

        {/* X Dismiss Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-0.5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
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
              fetch("/api/feedback", { cache: "no-store" })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                  if (data?.rewardStatus) {
                    setRewardStatus(data.rewardStatus)
                  }
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
