"use client"

import { useState, useEffect, useMemo } from "react"
import { Star, ChevronLeft, ChevronRight, Quote, MessageSquare, ThumbsUp, Sparkles, X, Filter } from "lucide-react"
import type { FeedbackItem } from "@/lib/feedback-service"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const DEFAULT_FEEDBACKS: FeedbackItem[] = [
  {
    id: "def-1",
    username: "system",
    name: "Sub-Division Officer",
    supplyOffice: "Disconnection Team",
    cccCode: "MAIN",
    rating: 5,
    comment: "Fast real-time data sync & seamless disconnection tracking across all field teams!",
    createdAt: new Date().toISOString(),
    status: "approved",
  },
  {
    id: "def-2",
    username: "system",
    name: "Field Technician",
    supplyOffice: "NSC & Meter Cell",
    cccCode: "MAIN",
    rating: 5,
    comment: "Very easy to issue meters and track field updates directly on mobile devices without paperwork.",
    createdAt: new Date().toISOString(),
    status: "approved",
  },
]

interface LoginFeedbackCarouselProps {
  initialFeedbacks?: FeedbackItem[]
}

export function LoginFeedbackCarousel({ initialFeedbacks }: LoginFeedbackCarouselProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>(
    initialFeedbacks && initialFeedbacks.length > 0 ? initialFeedbacks : DEFAULT_FEEDBACKS
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFading, setIsFading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string>("all")

  useEffect(() => {
    if (initialFeedbacks && initialFeedbacks.length > 0) return

    let isMounted = true
    fetch("/api/feedback/public")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FeedbackItem[]) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setFeedbacks(data)
        }
      })
      .catch((err) => console.warn("Failed to load public feedbacks:", err))

    return () => {
      isMounted = false
    }
  }, [initialFeedbacks])

  useEffect(() => {
    if (isPaused || isModalOpen || feedbacks.length <= 1) return

    const timer = setInterval(() => {
      handleNext()
    }, 4800)

    return () => clearInterval(timer)
  }, [currentIndex, isPaused, isModalOpen, feedbacks.length])

  const handleNext = () => {
    setIsFading(true)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % feedbacks.length)
      setIsFading(false)
    }, 280)
  }

  const handlePrev = () => {
    setIsFading(true)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + feedbacks.length) % feedbacks.length)
      setIsFading(false)
    }, 280)
  }

  // Dynamic stars & statistics summary
  const { averageRating, totalCount, fiveStarCount } = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) {
      return { averageRating: 5.0, totalCount: 0, fiveStarCount: 0 }
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

  const currentItem = feedbacks[currentIndex] || feedbacks[0]

  return (
    <>
      <div
        className="w-full max-w-md mx-auto select-none group"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          onClick={() => setIsModalOpen(true)}
          className="relative bg-white/95 backdrop-blur-md border border-slate-200/90 hover:border-blue-300 rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
        >
          {/* Navigation Arrows (Prev / Next) */}
          {feedbacks.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePrev()
                }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10 opacity-70 hover:opacity-100"
                title="Previous review"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNext()
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10 opacity-70 hover:opacity-100"
                title="Next review"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Animated 3-Line Content Box */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              isFading
                ? "opacity-0 translate-y-1.5 scale-[0.98]"
                : "opacity-100 translate-y-0 scale-100"
            } px-4 py-0.5 space-y-1.5 min-h-[90px] flex flex-col justify-between`}
          >
            {/* Line 1: User / Officer Name, Supply Office Tag Badge & Dynamic Stars */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
              <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                <span className="font-bold text-slate-900 text-xs truncate">
                  {currentItem.name || currentItem.username || "Disconnection Officer"}
                </span>
                {currentItem.supplyOffice && (
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100/80 truncate shrink-0">
                    {currentItem.supplyOffice}
                  </span>
                )}
              </div>

              {/* Dynamic 5-Star Display */}
              <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${
                      i < (currentItem.rating || 5)
                        ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_2px_rgba(251,191,36,0.5)]"
                        : "text-slate-200 fill-slate-100"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Line 2 & 3: 3-Line Expanded Feedback Text */}
            <div className="flex items-start gap-1.5 text-slate-700 text-xs font-medium leading-relaxed pt-0.5 flex-1">
              <Quote className="w-3.5 h-3.5 text-blue-400 shrink-0 rotate-180 mt-0.5" />
              <p className="line-clamp-3 italic text-slate-700 text-left">
                {currentItem.comment}
              </p>
            </div>
          </div>

          {/* Footer: Pagination Dots + Click to view all prompt */}
          <div className="flex items-center justify-between px-3 pt-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1 text-slate-500 font-medium group-hover:text-blue-600 transition-colors">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>★ {averageRating} rating ({totalCount} reviews)</span>
            </span>

            {/* Pagination Dots */}
            {feedbacks.length > 1 && (
              <div className="flex items-center gap-1">
                {feedbacks.slice(0, 8).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsFading(true)
                      setTimeout(() => {
                        setCurrentIndex(idx)
                        setIsFading(false)
                      }, 280)
                    }}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentIndex
                        ? "w-4 bg-blue-600"
                        : "w-1.5 bg-slate-300 hover:bg-slate-400"
                    }`}
                    title={`Go to review ${idx + 1}`}
                  />
                ))}
              </div>
            )}

            <span className="text-[10px] text-blue-600 font-semibold group-hover:underline">
              View all →
            </span>
          </div>
        </div>
      </div>

      {/* Traditional Reviews Modal / Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden bg-slate-50">
          {/* Header Summary Banner */}
          <DialogHeader className="p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-xl font-bold text-white tracking-tight">
                    User Reviews & Feedback
                  </DialogTitle>
                  <span className="text-xs bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2.5 py-0.5 rounded-full font-medium">
                    Verified Officers
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Real feedback shared by CCC officers and technicians across power stations
                </p>
              </div>
            </div>

            {/* Overall Rating Stats Row */}
            <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-black text-white">{averageRating}</div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= Math.round(averageRating)
                            ? "fill-amber-400 text-amber-400"
                            : "fill-slate-600 text-slate-600"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium">
                    Based on {totalCount} verified officer reviews
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5" />
                  {Math.round((fiveStarCount / (totalCount || 1)) * 100)}% 5-Star Satisfaction
                </span>
              </div>
            </div>
          </DialogHeader>

          {/* Filter by Office / Tag */}
          {allTags.length > 1 && (
            <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                <Filter className="w-3 h-3" /> Filter:
              </span>
              <button
                type="button"
                onClick={() => setSelectedTag("all")}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                  selectedTag === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Offices ({feedbacks.length})
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                    selectedTag === tag
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Reviews List */}
          <div className="p-6 overflow-y-auto max-h-[55vh] space-y-3.5">
            {filteredFeedbacks.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                No reviews found for this filter.
              </div>
            ) : (
              filteredFeedbacks.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:border-slate-300 text-left"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">
                          {item.name || item.username || "Disconnection Officer"}
                        </h4>
                        {item.supplyOffice && (
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                            {item.supplyOffice}
                          </span>
                        )}
                        {item.cccCode && item.cccCode !== "MAIN" && (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            CCC {item.cccCode}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Verified Review"}
                      </p>
                    </div>

                    {/* Star Rating */}
                    <div className="flex items-center gap-0.5 text-amber-400 bg-amber-50/60 px-2 py-1 rounded-lg border border-amber-200/60 shrink-0">
                      <span className="text-xs font-bold text-amber-600 mr-1">
                        {item.rating || 5}.0
                      </span>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < (item.rating || 5)
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-200 fill-slate-100"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <p className="mt-3 text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                    {item.comment}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
