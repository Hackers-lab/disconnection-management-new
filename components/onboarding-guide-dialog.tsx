"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Check,
  X,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  PartyPopper,
} from "lucide-react"

export interface OnboardingStep {
  id: string
  stepNumber: number
  title: string
  completed: boolean
  targetView: string
}

export interface OnboardingData {
  cccCode: string
  cccName: string
  isLinked: boolean
  steps: OnboardingStep[]
  completedCount: number
  totalSteps: number
  allCompleted: boolean
  progressPercent: number
}

interface OnboardingGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (targetView: string) => void
  role: string
}

export function OnboardingGuideDialog({
  open,
  onOpenChange,
  onNavigate,
  role,
}: OnboardingGuideDialogProps) {
  const [data, setData] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [isCompletedCached, setIsCompletedCached] = useState(false)

  const fetchChecklist = useCallback(async (force = false) => {
    if (role !== "admin") return

    if (!force && typeof window !== "undefined") {
      const completed = sessionStorage.getItem("admin_onboarding_completed")
      if (completed === "true") {
        setIsCompletedCached(true)
        setLoading(false)
        setInitialized(true)
        return
      }
      const cached = sessionStorage.getItem("admin_onboarding_data")
      if (cached) {
        try {
          const json: OnboardingData = JSON.parse(cached)
          setData(json)
          setIsCompletedCached(!!json.allCompleted)
          setLoading(false)
          setInitialized(true)
          return
        } catch {
          sessionStorage.removeItem("admin_onboarding_data")
        }
      }
    }

    try {
      setLoading(true)
      const res = await fetch("/api/admin/onboarding-checklist", {
        cache: "no-store",
      })
      if (res.ok) {
        const json: OnboardingData = await res.json()
        setData(json)
        setIsCompletedCached(!!json.allCompleted)
        if (typeof window !== "undefined") {
          if (json.allCompleted) {
            sessionStorage.setItem("admin_onboarding_completed", "true")
            sessionStorage.removeItem("admin_onboarding_data")
            if (open) onOpenChange(false)
          } else {
            sessionStorage.removeItem("admin_onboarding_completed")
            sessionStorage.setItem("admin_onboarding_data", JSON.stringify(json))
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch onboarding checklist:", err)
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }, [role, open, onOpenChange])

  useEffect(() => {
    if (role !== "admin") return
    if (open) {
      fetchChecklist(true)
    } else {
      fetchChecklist(false)
    }
  }, [open, role, fetchChecklist])

  if (role !== "admin") return null

  const handleStepClick = (targetView: string) => {
    onOpenChange(false)
    onNavigate(targetView)
  }

  const defaultSteps: OnboardingStep[] = [
    {
      id: "agencies",
      stepNumber: 1,
      title: "Create Agency in Admin Panel",
      completed: false,
      targetView: "admin:agencies",
    },
    {
      id: "users",
      stepNumber: 2,
      title: "Create User & Assign Agency",
      completed: false,
      targetView: "admin:users",
    },
    {
      id: "zoneMap",
      stepNumber: 3,
      title: "Create Zone Map",
      completed: false,
      targetView: "admin:zoneMap",
    },
    {
      id: "dcList",
      stepNumber: 4,
      title: "Upload DC List",
      completed: false,
      targetView: "admin:dcList",
    },
    {
      id: "masterData",
      stepNumber: 5,
      title: "Upload Master Data",
      completed: false,
      targetView: "consumerMaster",
    },
  ]

  const rawSteps = data?.steps || []
  const steps: OnboardingStep[] = defaultSteps.map((ds) => {
    const found = rawSteps.find((s) => s.id === ds.id)
    return {
      ...ds,
      completed: found ? found.completed : ds.completed,
    }
  })

  const completedCount = data ? steps.filter((s) => s.completed).length : 0
  const totalSteps = steps.length
  const progressPercent = data ? Math.round((completedCount / totalSteps) * 100) : 0
  const allCompleted = isCompletedCached || (data !== null && (data.allCompleted || completedCount === totalSteps))

  // Hide completely when all steps are completed, or before the initial check resolves (when closed)
  if (allCompleted) return null
  if (!open && (!initialized || !data)) return null

  return (
    <>
      {/* --- FLOATING PILL WHEN MODAL IS CLOSED --- */}
      {!open && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 animate-bar-slide-up">
          <Button
            onClick={() => onOpenChange(true)}
            className="shadow-lg flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold border transition-all duration-200 interactive-tap bg-slate-900 text-white border-slate-700 hover:bg-slate-800"
          >
            <span className="inline-flex rounded-full h-2 w-2 bg-blue-500 animate-badge-pop" />
            <span>⚡ Setup ({completedCount}/{totalSteps})</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60 ml-0.5" />
          </Button>
        </div>
      )}

      {/* --- COMPACT SETUP GUIDE DIALOG --- */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="bg-slate-900 text-white px-4 pt-3.5 pb-3">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-sm md:text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>⚡ Setup Guide</span>
                  {data?.cccName && (
                    <span className="text-slate-400 text-xs font-normal truncate max-w-[180px]">
                      • {data.cccName}
                    </span>
                  )}
                </DialogTitle>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {loading && !data
                    ? "Checking setup progress..."
                    : `${completedCount} of ${totalSteps} completed (${progressPercent}%)`}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchChecklist(true)}
                disabled={loading}
                title="Refresh status"
                className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full interactive-tap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Progress Bar */}
            <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${data ? Math.max(5, progressPercent) : 0}%` }}
              />
            </div>
          </div>

          {/* Compact 5-Step Single-Line List */}
          <div className="p-3 space-y-1.5">
            {loading && !data ? (
              <div className="space-y-2 py-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded-xl bg-slate-100 animate-shimmer border border-slate-200/70"
                  />
                ))}
              </div>
            ) : (
              steps.map((step, idx) => {
                const isDone = step.completed
                return (
                  <div
                    key={step.id}
                    onClick={() => handleStepClick(step.targetView)}
                    className={`cursor-pointer group flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-150 interactive-tap animate-row-enter stagger-${idx + 1} ${
                      isDone
                        ? "bg-slate-50/80 hover:bg-emerald-50/60 border-slate-200/80"
                        : "bg-white hover:bg-blue-50/50 border-slate-200 hover:border-blue-300 shadow-xs"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      {isDone ? (
                        <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
                          <X className="h-3 w-3 stroke-[3]" />
                        </div>
                      )}
                      <span
                        className={`text-xs font-semibold truncate ${
                          isDone ? "text-slate-600" : "text-slate-900 font-bold"
                        }`}
                      >
                        {step.stepNumber}. {step.title}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStepClick(step.targetView)
                      }}
                      className={`h-6 px-2.5 text-[11px] font-bold rounded-lg shrink-0 gap-1 interactive-tap ${
                        isDone
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                          : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                      }`}
                    >
                      Go
                      <ArrowRight className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

