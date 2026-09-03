"use client"

import { useState, useEffect } from "react"
import { Star, MessageSquarePlus, Send, Loader2, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"

interface FeedbackDialogProps {
  trigger?: React.ReactNode
  initialRating?: number
  initialComment?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
}

export function FeedbackDialog({
  trigger,
  initialRating = 5,
  initialComment = "",
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: FeedbackDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = typeof controlledOpen === "boolean"
  const open = isControlled ? controlledOpen : internalOpen

  const setOpen = (newOpen: boolean) => {
    if (isControlled && setControlledOpen) {
      setControlledOpen(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
  }

  const [rating, setRating] = useState(initialRating)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState("")
  const [suggestion, setSuggestion] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const { toast } = useToast()

  const [hasExisting, setHasExisting] = useState(false)
  const [isLoadingExisting, setIsLoadingExisting] = useState(false)

  useEffect(() => {
    if (initialRating) {
      setRating(initialRating)
    }
  }, [initialRating])

  useEffect(() => {
    if (!open) return
    let isMounted = true
    setIsLoadingExisting(true)
    fetch("/api/feedback")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.feedback) {
          if (data.feedback.rating) setRating(data.feedback.rating)
          if (data.feedback.feedbackText) setComment(data.feedback.feedbackText)
          setHasExisting(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingExisting(false)
      })

    return () => {
      isMounted = false
    }
  }, [open])

  const QUICK_CHIPS = [
    "⚡ Super Fast & Smooth",
    "📱 Easy on Mobile",
    "⏳ Saves a Lot of Time",
    "🎯 Very Helpful in Field",
    "👍 Best Tool for DC Work",
    "👌 Simple & User Friendly"
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let finalComment = comment.trim()
    if (!finalComment) {
      if (rating === 5) {
        finalComment = "Excellent app! Makes daily field operations very smooth, accurate and fast."
      } else if (rating === 4) {
        finalComment = "Very good and reliable app for daily disconnection and field work."
      } else {
        toast({
          title: "Feedback required",
          description: "Please write a brief note on what we can improve.",
          variant: "destructive",
        })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const fullComment = suggestion.trim()
        ? `${finalComment} (Suggestion: ${suggestion.trim()})`
        : finalComment

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: fullComment }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to submit feedback")
      }

      setIsSubmitted(true)
      if (onSuccess) onSuccess()
      toast({
        title: "Feedback Submitted! 🎉",
        description: "Thank you! Your feedback is now featured on the station login screen.",
      })

      setTimeout(() => {
        setOpen(false)
        setIsSubmitted(false)
        setComment("")
        setSuggestion("")
        setRating(5)
      }, 2000)
    } catch (err: any) {
      toast({
        title: "Submission Error",
        description: err.message || "Failed to submit feedback. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900">
        {/* Subtle Brand Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-blue-600" />

        <div className="p-5 sm:p-6 space-y-4">
          <DialogHeader className="text-left space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-500 shrink-0">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {hasExisting ? "Edit Your Feedback" : "Share Your Experience"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-normal">
                  {hasExisting
                    ? "Update your review and rating anytime."
                    : "Your review will be featured on the station login screen!"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isSubmitted ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs animate-in zoom-in-75 duration-200">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Thank You! 🎉</h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                Your rating and review have been recorded and will now be featured on the login screen.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Star Rating Section */}
              <div className="bg-slate-50/90 border border-slate-150 rounded-xl p-3 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 text-amber-400 hover:scale-115 transition-transform cursor-pointer focus:outline-none"
                      title={`Rate ${star} Star${star > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`w-7 h-7 transition-all ${
                          star <= (hoverRating || rating)
                            ? "fill-amber-400 text-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.35)]"
                            : "text-slate-200 fill-slate-100 hover:text-amber-200"
                        }`}
                      />
                    </button>
                  ))}
                </div>

                {/* Rating Badge */}
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                    (hoverRating || rating) === 5
                      ? "bg-amber-50 text-amber-800 border-amber-200/80"
                      : (hoverRating || rating) === 4
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                      : (hoverRating || rating) === 3
                      ? "bg-blue-50 text-blue-700 border-blue-200/80"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {(hoverRating || rating)}.0 / 5 •{" "}
                  {(hoverRating || rating) === 5
                    ? "★ Excellent"
                    : (hoverRating || rating) === 4
                    ? "★ Very Good"
                    : (hoverRating || rating) === 3
                    ? "★ Good"
                    : (hoverRating || rating) === 2
                    ? "★ Fair"
                    : "★ Needs Improvement"}
                </span>
              </div>

              {/* Quick 1-Tap Compliment Chips */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 text-[11px]">Quick Highlights</span>
                  <span className="text-[10px] text-blue-600 font-medium">1-tap auto fill</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CHIPS.map((chip) => {
                    const isSelected = comment.includes(chip)
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setComment((prev) =>
                              prev
                                .replace(chip, "")
                                .replace(/,\s*,/g, ",")
                                .replace(/^,\s*|,\s*$/g, "")
                                .trim()
                            )
                          } else {
                            setComment((prev) => (prev.trim() ? `${prev.trim()}, ${chip}` : chip))
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer select-none ${
                          isSelected
                            ? "bg-amber-500 text-white border-amber-500 font-semibold shadow-xs"
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700 hover:text-slate-900"
                        }`}
                      >
                        {chip}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Comment Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-700 text-[11px]">Your Review</label>
                  {rating >= 4 && !comment.trim() && (
                    <span className="text-[10px] text-emerald-600 font-medium">Optional for {rating}★</span>
                  )}
                </div>
                <Textarea
                  placeholder={
                    rating >= 4
                      ? "Optional: Add your thoughts or pick a quick highlight above..."
                      : "How can we make this app better for you?"
                  }
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-xs transition-all min-h-[64px] resize-none"
                  maxLength={300}
                />
              </div>

              {/* Minimalist Live Preview Card */}
              <div className="bg-gradient-to-br from-amber-50/60 via-orange-50/30 to-slate-50 border border-amber-200/50 rounded-xl p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between text-[10px] font-semibold text-amber-800">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    Preview on Station Login
                  </span>
                  <span className="text-slate-400 text-[9px] font-normal">Visible to staff</span>
                </div>
                <p className="text-slate-700 italic font-medium leading-relaxed line-clamp-2 text-[11px]">
                  &ldquo;
                  {comment.trim() ||
                    (rating === 5
                      ? "Excellent app! Makes daily field operations very smooth, accurate and fast."
                      : rating === 4
                      ? "Very good and reliable app for daily disconnection and field work."
                      : "Needs improvement in field operations.")}
                  &rdquo;
                </p>
              </div>

              {/* Optional Feature Suggestion */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                  <span>Any Feature Suggestions?</span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <Textarea
                  placeholder="Ideas or feature requests for upcoming updates..."
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-xs transition-all min-h-[44px] resize-none"
                  maxLength={200}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs h-9 px-3.5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs h-9 px-4 shadow-sm gap-1.5 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Submit Review
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
