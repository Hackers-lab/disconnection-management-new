"use client"

import React, { useState, useEffect } from "react"
import { MessageSquarePlus, Star, X, Send, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface FeedbackFloatingButtonProps {
  username?: string
  onFeedbackSaved?: () => void
}

export function FeedbackFloatingButton({ username, onFeedbackSaved }: FeedbackFloatingButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [rating, setRating] = useState(5)
  const [category, setCategory] = useState("General")
  const [feedbackText, setFeedbackText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submittedSuccess, setSubmittedSuccess] = useState(false)

  const storageKey = username ? `feedback_submitted_${username.toLowerCase()}` : "feedback_submitted_guest"

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === "true") {
        setHasSubmitted(true)
      }
    } catch (e) {
      console.warn("LocalStorage error", e)
    }
  }, [storageKey])

  // If user has already submitted feedback, hide the floating button
  if (hasSubmitted) return null

  const handleSubmit = async () => {
    if (!feedbackText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, category, feedbackText }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to submit feedback")
      }

      localStorage.setItem(storageKey, "true")
      setHasSubmitted(true)
      setSubmittedSuccess(true)
      if (onFeedbackSaved) onFeedbackSaved()
      setTimeout(() => {
        setIsOpen(false)
        setSubmittedSuccess(false)
      }, 2000)
    } catch (e: any) {
      alert(e.message || "Failed to submit feedback")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 cursor-pointer font-medium text-sm border border-blue-400/30"
        title="Give App Feedback"
      >
        <MessageSquarePlus className="h-5 w-5 animate-pulse" />
        <span>Feedback</span>
      </button>

      {/* Feedback Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 border border-slate-100">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {submittedSuccess ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
                <h3 className="text-xl font-bold text-slate-800">Thank You!</h3>
                <p className="text-sm text-slate-500">Your feedback has been saved to the Master Registry.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                    <MessageSquarePlus className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">App Feedback</h3>
                    <p className="text-xs text-slate-500">Help us improve your user experience</p>
                  </div>
                </div>

                {/* Rating Stars */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Rating</Label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1 text-amber-400 hover:scale-110 transition-transform"
                      >
                        <Star className={`h-6 w-6 ${star <= rating ? "fill-amber-400" : "text-slate-200"}`} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feedback Text */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Your Comments / Suggestions</Label>
                  <Textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell us what's working well or what we should improve..."
                    rows={4}
                    className="rounded-xl border-slate-200 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Submit Action */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
                    onClick={handleSubmit}
                    disabled={submitting || !feedbackText.trim()}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
