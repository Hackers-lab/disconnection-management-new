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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) {
      toast({
        title: "Feedback required",
        description: "Please write a brief comment before submitting.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const fullComment = suggestion.trim()
        ? `${comment.trim()} (Suggestion: ${suggestion.trim()})`
        : comment.trim()

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
        description: "Thank you! Your feedback will now be featured on the login screen.",
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

      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <MessageSquarePlus className="w-5 h-5 text-indigo-400" />
            {hasExisting ? "Edit Your Feedback" : "Share Your Experience"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {hasExisting
              ? "You can view or update your submitted rating and review below."
              : "Your rating and review will be featured on the login screen for your supply office!"}
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-white">Thank You!</h3>
            <p className="text-sm text-slate-300">Your review has been recorded successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Star Rating Selection - Defaults to 5 Stars, Reducible by User */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <label className="text-xs font-semibold text-slate-300">Your Rating</label>
                <span className="text-xs font-bold text-amber-300 font-mono">
                  {(hoverRating || rating)}.0 / 5 {rating === 5 ? "★ Excellent" : rating === 4 ? "★ Very Good" : rating === 3 ? "★ Good" : rating === 2 ? "★ Fair" : "★ Needs Improvement"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900/80 p-3 rounded-xl border border-slate-800 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 text-amber-400 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                    title={`Select ${star} Star${star > 1 ? "s" : ""}`}
                  >
                    <Star
                      className={`w-7 h-7 transition-all ${
                        star <= (hoverRating || rating)
                          ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                          : "text-slate-700 fill-slate-900"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Comment Area */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Feedback / Review</label>
              <Textarea
                placeholder="What do you like about the app? Any thoughts to share?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="bg-slate-900/90 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 min-h-[80px] resize-none"
                maxLength={300}
              />
            </div>

            {/* Optional Suggestions */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                <span>Feature Suggestions</span>
                <span className="text-[10px] text-slate-500 font-normal">(Optional)</span>
              </label>
              <Textarea
                placeholder="Any feature suggestions or ideas for improvement?"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                className="bg-slate-900/90 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 min-h-[60px] resize-none"
                maxLength={200}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold gap-2 shadow-lg shadow-indigo-600/25"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Feedback
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
