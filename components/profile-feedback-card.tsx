"use client"

import { useState, useEffect } from "react"
import { Star, MessageSquarePlus, Edit3, Loader2, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FeedbackDialog } from "@/components/feedback-dialog"
import type { FeedbackItem } from "@/lib/feedback-service"

export function ProfileFeedbackCard({ isDark = false }: { isDark?: boolean }) {
  const [feedback, setFeedback] = useState<FeedbackItem | null>(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const loadFeedback = () => {
    setIsLoading(true)
    fetch("/api/feedback")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setHasSubmitted(!!data.hasSubmitted)
          setFeedback(data.feedback || null)
        }
      })
      .catch((err) => console.warn("Failed to load user feedback:", err))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    loadFeedback()
  }, [])

  if (isLoading) {
    return (
      <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"} flex justify-center items-center py-6`}>
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isDark
          ? "bg-slate-900/90 border-slate-800 text-white"
          : "bg-white border-slate-200 text-slate-900 shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <MessageSquarePlus className="w-4 h-4 text-amber-500" />
          App Review & Feedback
        </h3>
        {hasSubmitted ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" /> Submitted
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 font-medium">Not provided yet</span>
        )}
      </div>

      {hasSubmitted && feedback ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= (feedback.rating || 5)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-300 dark:text-slate-700"
                  }`}
                />
              ))}
              <span className="ml-1.5 text-xs font-bold text-amber-500 font-mono">
                {feedback.rating}.0 / 5
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
              className="h-7 text-xs font-semibold gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Review
            </Button>
          </div>

          <p className="text-xs italic text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/80">
            "{feedback.comment}"
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Share your feedback to help us improve.
          </p>
          <Button
            size="sm"
            onClick={() => setEditDialogOpen(true)}
            className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Submit Feedback
          </Button>
        </div>
      )}

      {/* Controlled Feedback Dialog for Editing */}
      {editDialogOpen && (
        <FeedbackDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          initialRating={feedback?.rating || 5}
          initialComment={feedback?.comment || ""}
          onSuccess={() => {
            loadFeedback()
          }}
        />
      )}
    </div>
  )
}
