"use client"

import { useState, useMemo } from "react"
import { Star, ThumbsUp, Filter, MessageSquareQuote } from "lucide-react"
import type { FeedbackItem } from "@/lib/feedback-service"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface LoginFeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feedbacks: FeedbackItem[]
}

export function LoginFeedbackDialog({ open, onOpenChange, feedbacks }: LoginFeedbackDialogProps) {
  const [selectedTag, setSelectedTag] = useState<string>("all")

  // Dynamic stars & statistics summary
  const { averageRating, totalCount, fiveStarCount } = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) {
      return { averageRating: 4.9, totalCount: 0, fiveStarCount: 0 }
    }
    const sum = feedbacks.reduce((acc, curr) => acc + (Number(curr.rating) || 5), 0)
    const avg = sum / feedbacks.length
    const fiveStars = feedbacks.filter((f) => Number(f.rating) >= 5).length
    return {
      averageRating: Number(avg.toFixed(1)),
      totalCount: feedbacks.length,
      fiveStarCount: fiveStars,
    }
  }, [feedbacks])

  // Extract unique tags/supply offices for filtering
  const allTags = useMemo(() => {
    const set = new Set<string>()
    feedbacks.forEach((f) => {
      if (f.supplyOffice && f.supplyOffice.trim()) {
        set.add(f.supplyOffice.trim())
      }
    })
    return Array.from(set)
  }, [feedbacks])

  const filteredFeedbacks = useMemo(() => {
    if (selectedTag === "all") return feedbacks
    return feedbacks.filter((f) => f.supplyOffice?.trim().toLowerCase() === selectedTag.toLowerCase())
  }, [feedbacks, selectedTag])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-2xl">
        {/* Header Summary Banner */}
        <DialogHeader className="p-5 sm:p-6 bg-slate-900 text-white border-b border-slate-800 shrink-0 text-left">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold text-white tracking-tight">
                  Officer Feedback & Ratings
                </DialogTitle>
                <span className="text-[10px] bg-slate-800 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-full font-medium">
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Feedback shared by CCC officers and field staff
              </p>
            </div>
          </div>

          {/* Overall Rating Stats Row */}
          <div className="mt-4 pt-3.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-black text-white">{averageRating}</div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-0.5 text-white">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= Math.round(averageRating)
                          ? "fill-white text-white"
                          : "fill-slate-700 text-slate-700"
                      }`}
                    />
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  Based on {totalCount} verified reviews
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5">
                <ThumbsUp className="w-3 h-3 text-white" />
                {Math.round((fiveStarCount / (totalCount || 1)) * 100)}% 5-Star Rating
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Filter by Office / Tag */}
        {allTags.length > 1 && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag("all")}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                selectedTag === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              All ({feedbacks.length})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                  selectedTag === tag
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Reviews List */}
        <div className="p-4 sm:p-5 overflow-y-auto max-h-[50vh] space-y-2.5">
          {filteredFeedbacks.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No reviews found for this filter.
            </div>
          ) : (
            filteredFeedbacks.map((item, idx) => (
              <div
                key={item.id || idx}
                className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3.5 shadow-sm text-left"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-900 text-xs sm:text-sm">
                        {item.name || item.username || "Disconnection Officer"}
                      </h4>
                      {item.supplyOffice && (
                        <span className="text-[10px] font-semibold text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded-md">
                          {item.supplyOffice}
                        </span>
                      )}
                      {item.cccCode && item.cccCode !== "MAIN" && (
                        <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                          CCC {item.cccCode}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "Verified Review"}
                    </p>
                  </div>

                  {/* Monochrome Star Rating */}
                  <div className="flex items-center gap-0.5 text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                    <span className="text-[11px] font-bold text-slate-900 mr-1">
                      {item.rating || 5}.0
                    </span>
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 ${
                          i < (item.rating || 5)
                            ? "fill-black text-black"
                            : "text-slate-200 fill-slate-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Comment */}
                <div className="mt-2 flex items-start gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-line">
                    {item.comment}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

