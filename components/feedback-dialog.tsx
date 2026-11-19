"use client"

import { useState, useEffect } from "react"
import {
  Star,
  Send,
  Loader2,
  CheckCircle2,
  Gift,
  Sparkles,
  CalendarCheck2,
  Info,
} from "lucide-react"
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
import {
  FEEDBACK_QUICK_CHIPS,
  FEEDBACK_MIN_WRITTEN_CHARS,
  FEEDBACK_REWARD_DAYS,
  FEEDBACK_REWARD_EVENT,
  computeGenuineWrittenLength,
  formatDisplayExpiryDate,
  type FeedbackRewardStatus,
  type FeedbackRewardGrantResult,
} from "@/lib/feedback-reward-utils"

interface FeedbackDialogProps {
  trigger?: React.ReactNode
  initialRating?: number
  initialComment?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
  onRewardGranted?: (reward: FeedbackRewardGrantResult) => void
}

export function FeedbackDialog({
  trigger,
  initialRating = 5,
  initialComment = "",
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
  onRewardGranted,
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
  const [comment, setComment] = useState(initialComment)
  const [suggestion, setSuggestion] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [lastRewardResult, setLastRewardResult] = useState<FeedbackRewardGrantResult | null>(null)
  const { toast } = useToast()

  const [hasExisting, setHasExisting] = useState(false)
  const [isLoadingExisting, setIsLoadingExisting] = useState(false)
  const [rewardStatus, setRewardStatus] = useState<FeedbackRewardStatus | null>(null)

  useEffect(() => {
    if (initialRating) {
      setRating(initialRating)
    }
  }, [initialRating])

  useEffect(() => {
    if (!open) {
      setIsSubmitted(false)
      setLastRewardResult(null)
      return
    }
    let isMounted = true
    setIsLoadingExisting(true)
    fetch("/api/feedback", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return
        if (data.feedback) {
          if (data.feedback.rating) setRating(data.feedback.rating)
          if (data.feedback.feedbackText) setComment(data.feedback.feedbackText)
          setHasExisting(true)
        }
        if (data.rewardStatus) {
          setRewardStatus(data.rewardStatus)
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

  const minChars = rewardStatus?.minWrittenChars ?? FEEDBACK_MIN_WRITTEN_CHARS
  const rewardDays = rewardStatus?.daysBonus ?? FEEDBACK_REWARD_DAYS
  const combinedWrittenText = [comment.trim(), suggestion.trim()].filter(Boolean).join(" ")
  const genuineWrittenChars = computeGenuineWrittenLength(combinedWrittenText)
  const isRewardEligible = Boolean(rewardStatus?.eligible)
  const meetsWrittenThreshold = genuineWrittenChars >= minChars
  const progressPct = Math.min(100, Math.round((genuineWrittenChars / Math.max(1, minChars)) * 100))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Capture authentic user-typed text BEFORE any blank auto-fill fallback
    const rawUserWrittenText = [comment.trim(), suggestion.trim()].filter(Boolean).join(" ")

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
        body: JSON.stringify({
          rating,
          comment: fullComment,
          userWrittenText: rawUserWrittenText,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to submit feedback")
      }

      const data = await res.json()
      const reward: FeedbackRewardGrantResult | null = data?.reward || null
      if (data?.rewardStatus) {
        setRewardStatus(data.rewardStatus)
      }
      setLastRewardResult(reward)
      setIsSubmitted(true)
      setHasExisting(true)
      if (onSuccess) onSuccess()

      if (reward?.granted) {
        const displayExpiry = formatDisplayExpiryDate(reward.newExpiresAt)
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(FEEDBACK_REWARD_EVENT, {
              detail: reward,
            })
          )
        }
        if (onRewardGranted) {
          onRewardGranted(reward)
        }
        toast({
          title: `+${reward.daysAdded} Free Days Added! 🎁`,
          description: displayExpiry
            ? `Thank you for your review! Your subscription is now active until ${displayExpiry}.`
            : "Thank you for your review! Your +7 day bonus is now active.",
        })
      } else if (reward?.reason === "comment_too_short") {
        toast({
          title: "Feedback Submitted! 🎉",
          description: `Saved! Add ${Math.max(1, minChars - reward.writtenChars)} more written characters anytime to unlock +${rewardDays} free days.`,
        })
        setTimeout(() => {
          setOpen(false)
        }, 2400)
      } else {
        toast({
          title: "Feedback Submitted! 🎉",
          description: "Thank you! Your feedback is now featured on the station login screen.",
        })
        setTimeout(() => {
          setOpen(false)
        }, 2000)
      }
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

      <DialogContent className="max-w-md w-[92vw] max-h-[92vh] overflow-y-auto p-0 bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900">
        {/* Subtle Brand Accent Bar */}
        <div
          className={`h-1.5 w-full ${
            isRewardEligible || lastRewardResult?.granted
              ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-400"
              : "bg-gradient-to-r from-amber-400 via-orange-400 to-blue-600"
          }`}
        />

        <div className="p-5 sm:p-6 space-y-3.5">
          <DialogHeader className="text-left space-y-1">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                  isRewardEligible || lastRewardResult?.granted
                    ? "bg-emerald-50 border-emerald-200/80 text-emerald-600"
                    : "bg-amber-50 border-amber-200/60 text-amber-500"
                }`}
              >
                {isRewardEligible || lastRewardResult?.granted ? (
                  <Gift className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                )}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                  <span>{hasExisting ? "Edit Your Feedback" : "Share Your Experience"}</span>
                  {isRewardEligible && !isSubmitted && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      +{rewardDays} Days Free
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-normal">
                  {isRewardEligible && !isSubmitted
                    ? `Write a brief review to extend your subscription by +${rewardDays} free days.`
                    : hasExisting
                      ? "Update your review and rating anytime."
                      : "Your review will be featured on the station login screen!"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isSubmitted ? (
            lastRewardResult?.granted ? (
              <div className="py-5 text-center space-y-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/25 animate-in zoom-in-75 duration-200">
                  <Gift className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                    <Sparkles className="w-3 h-3" />
                    +{lastRewardResult.daysAdded} Free Days Unlocked!
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Subscription Extended! 🎉
                  </h3>
                  <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                    Thank you for sharing your genuine review. Your personal account has been credited with{" "}
                    <span className="font-bold text-emerald-700">+{lastRewardResult.daysAdded} extra days</span>.
                  </p>
                </div>

                {lastRewardResult.newExpiresAt && (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-2.5 inline-flex items-center gap-2 text-xs text-emerald-900 font-semibold">
                    <CalendarCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Active Until:{" "}
                      <strong className="font-extrabold">
                        {formatDisplayExpiryDate(lastRewardResult.newExpiresAt)}
                      </strong>
                    </span>
                  </div>
                )}

                <div className="pt-1">
                  <Button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs h-10 shadow-sm"
                  >
                    Awesome, Continue to App
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-7 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs animate-in zoom-in-75 duration-200">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Thank You! 🎉</h3>
                <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                  Your rating and review have been recorded and will now be featured on the login screen.
                </p>
                {lastRewardResult?.reason === "comment_too_short" && (
                  <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 text-[11px] text-amber-900 max-w-xs mx-auto leading-relaxed">
                    <strong>Tip:</strong> Edit your review anytime with at least{" "}
                    <strong>{minChars} written characters</strong> (in your own words) to unlock your{" "}
                    <strong>+{rewardDays} free days</strong>!
                  </div>
                )}
              </div>
            )
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Contextual Reward Status Banner */}
              {!isLoadingExisting && rewardStatus?.reason === "eligible" && (
                <div
                  className={`rounded-xl border p-3 transition-colors ${
                    meetsWrittenThreshold
                      ? "bg-emerald-50/90 border-emerald-300/90"
                      : "bg-gradient-to-br from-emerald-50/80 via-teal-50/50 to-amber-50/60 border-emerald-200/80"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        meetsWrittenThreshold
                          ? "bg-emerald-600 text-white"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {meetsWrittenThreshold ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Gift className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-emerald-950 leading-snug">
                          {meetsWrittenThreshold
                            ? `Ready to unlock +${rewardDays} free days!`
                            : `Get +${rewardDays} Free Subscription Days`}
                        </p>
                        <span
                          className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-md ${
                            meetsWrittenThreshold
                              ? "bg-emerald-600 text-white"
                              : "bg-white/90 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {Math.min(genuineWrittenChars, minChars)}/{minChars} chars
                        </span>
                      </div>
                      <p className="text-[10.5px] text-emerald-900/80 leading-relaxed">
                        {meetsWrittenThreshold
                          ? "Submit your review now to instantly extend your individual subscription."
                          : `Write at least ${minChars} characters in your own words (quick chips don't count). One-time per agency.`}
                      </p>
                      <div className="h-1.5 w-full bg-white/80 rounded-full overflow-hidden border border-emerald-200/70">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            meetsWrittenThreshold ? "bg-emerald-600" : "bg-emerald-500/80"
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isLoadingExisting && rewardStatus?.reason === "already_claimed_by_user" && (
                <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 px-3 py-2 flex items-center gap-2 text-[11px] text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="leading-snug">
                    <span className="font-bold">+{rewardDays} Day Bonus Claimed</span>
                    {rewardStatus.newExpiresAt && (
                      <span className="text-emerald-800/90">
                        {" "}• Extended to {formatDisplayExpiryDate(rewardStatus.newExpiresAt)}
                      </span>
                    )}
                    <span className="block text-[10px] text-emerald-700/80">
                      You can still update your rating & review anytime.
                    </span>
                  </div>
                </div>
              )}

              {!isLoadingExisting && rewardStatus?.reason === "already_claimed_by_agency" && (
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 flex items-start gap-2 text-[11px] text-slate-700">
                  <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <span className="font-semibold text-slate-800">
                      Agency +7 day bonus already redeemed
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      The one-time feedback reward was already claimed for your agency. You can still submit or edit your review anytime!
                    </span>
                  </div>
                </div>
              )}

              {/* Star Rating Section */}
              <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3 flex flex-col items-center gap-2">
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
                  <span className="text-[10px] text-blue-600 font-medium">1-tap add</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FEEDBACK_QUICK_CHIPS.map((chip) => {
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
                  {isRewardEligible ? (
                    <span
                      className={`text-[10px] font-semibold ${
                        meetsWrittenThreshold ? "text-emerald-600" : "text-amber-700"
                      }`}
                    >
                      {meetsWrittenThreshold
                        ? `✓ Qualifies for +${rewardDays} free days`
                        : `${Math.max(0, minChars - genuineWrittenChars)} more chars for +${rewardDays}d bonus`}
                    </span>
                  ) : (
                    rating >= 4 &&
                    !comment.trim() && (
                      <span className="text-[10px] text-emerald-600 font-medium">
                        Optional for {rating}★
                      </span>
                    )
                  )}
                </div>
                <Textarea
                  placeholder={
                    isRewardEligible
                      ? "Tell us how this app helps your daily DC / field work (min 20 chars for +7 free days)..."
                      : rating >= 4
                        ? "Optional: Add your thoughts or pick a quick highlight above..."
                        : "How can we make this app better for you?"
                  }
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-xs transition-all min-h-[68px] resize-none"
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
                  className={`font-semibold rounded-xl text-xs h-9 px-4 shadow-sm gap-1.5 transition-all text-white ${
                    isRewardEligible && meetsWrittenThreshold
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : isRewardEligible && meetsWrittenThreshold ? (
                    <>
                      <Gift className="w-3.5 h-3.5" />
                      Submit &amp; Claim +{rewardDays} Days
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
