"use client"

import { useState } from "react"
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

export function FeedbackDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const { toast } = useToast()

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
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to submit feedback")
      }

      setIsSubmitted(true)
      toast({
        title: "Feedback Submitted! 🎉",
        description: "Thank you! Your feedback will now be featured on the login screen.",
      })

      setTimeout(() => {
        setOpen(false)
        setIsSubmitted(false)
        setComment("")
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
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border-blue-500/30 text-blue-600 hover:text-blue-700 hover:border-blue-500"
          >
            <MessageSquarePlus className="w-4 h-4 text-blue-600" />
            <span>Give Feedback</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <MessageSquarePlus className="w-5 h-5 text-indigo-400" />
            Share Your Experience
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Your rating and review will be featured on the login screen showcase for your supply office team!
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-white">Thank You!</h3>
            <p className="text-sm text-slate-300">Your review has been published successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Star Rating Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Your Rating</label>
              <div className="flex items-center gap-1 bg-slate-900/80 p-3 rounded-xl border border-slate-800 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 text-amber-400 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= (hoverRating || rating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-600"
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-3 font-bold text-amber-300 font-mono text-sm">
                  {(hoverRating || rating)}.0 / 5
                </span>
              </div>
            </div>

            {/* Comment Area */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Your Review / Feedback</label>
              <Textarea
                placeholder="What do you like about the app? Any features or improvements to share?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="bg-slate-900/90 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 min-h-[100px] resize-none"
                maxLength={300}
              />
              <div className="text-right text-[11px] text-slate-500">
                {comment.length} / 300 characters
              </div>
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
                    Publish Feedback
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
