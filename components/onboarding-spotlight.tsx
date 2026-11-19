"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  CheckCircle2,
  Building2,
  UserPlus,
  MapPin,
  FileSpreadsheet,
  Database,
  Lock,
  Sparkles,
  ArrowRight,
  X,
  Unlock,
  Compass,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export type OnboardingStepId = "agencies" | "users" | "zoneMap" | "dcList" | "masterData"

export interface OnboardingStepItem {
  id: OnboardingStepId
  stepNumber: number
  title: string
  description: string
  completed: boolean
  count: number
  targetView: string
  buttonText: string
}

export interface OnboardingChecklistData {
  cccCode: string
  cccName: string
  isLinked: boolean
  steps: OnboardingStepItem[]
  completedCount: number
  totalSteps: number
  allCompleted: boolean
  progressPercent: number
}

export interface OnboardingGuideState {
  loaded: boolean
  loading: boolean
  data: OnboardingChecklistData | null
  hasAgencies: boolean
  hasUsers: boolean
  hasZoneMap: boolean
  hasDcList: boolean
  hasMasterData: boolean
  /** True only for admins whose Google sheet is linked AND missing either 1st agency or 1st user */
  isCoreSetupLocked: boolean
  /** True while guided stepper & spotlight hints should be displayed */
  isGuiding: boolean
  /** Ordered next incomplete step */
  activeStepId: OnboardingStepId | null
  activeStep: OnboardingStepItem | null
  guideSkipped: boolean
  skipGuide: () => void
  resumeGuide: () => void
  refresh: (force?: boolean) => Promise<void>
}

const ONBOARDING_CACHE_KEY = "admin_onboarding_data"
const ONBOARDING_DONE_KEY = "admin_onboarding_completed"
const ONBOARDING_SKIPPED_KEY = "admin_onboarding_guide_skipped"
const ONBOARDING_EVENT = "onboarding-progress-updated"

/**
 * Call after creating an agency, creating a user, saving zone map,
 * uploading DC list, or uploading Consumer Master so every mounted
 * onboarding guide updates immediately.
 */
export function notifyOnboardingUpdated() {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(ONBOARDING_CACHE_KEY)
    sessionStorage.removeItem(ONBOARDING_DONE_KEY)
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT))
}

const STEP_ORDER: OnboardingStepId[] = ["agencies", "users", "zoneMap", "dcList", "masterData"]

export function useOnboardingGuide(role: string): OnboardingGuideState {
  const isAdmin = (role || "").toLowerCase() === "admin"
  const [data, setData] = useState<OnboardingChecklistData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [guideSkipped, setGuideSkipped] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return sessionStorage.getItem(ONBOARDING_SKIPPED_KEY) === "true"
    } catch {
      return false
    }
  })

  const fetchProgress = useCallback(
    async (force = false) => {
      if (!isAdmin) {
        setLoaded(true)
        setData(null)
        return
      }

      if (!force && typeof window !== "undefined") {
        try {
          if (sessionStorage.getItem(ONBOARDING_DONE_KEY) === "true") {
            setData({
              cccCode: "",
              cccName: "",
              isLinked: true,
              steps: [],
              completedCount: 5,
              totalSteps: 5,
              allCompleted: true,
              progressPercent: 100,
            })
            setLoaded(true)
            return
          }
          const cached = sessionStorage.getItem(ONBOARDING_CACHE_KEY)
          if (cached) {
            const parsed = JSON.parse(cached) as OnboardingChecklistData
            if (parsed && Array.isArray(parsed.steps)) {
              setData(parsed)
              setLoaded(true)
              return
            }
          }
        } catch {
          try {
            sessionStorage.removeItem(ONBOARDING_CACHE_KEY)
          } catch {
            // ignore
          }
        }
      }

      setLoading(true)
      try {
        const res = await fetch("/api/admin/onboarding-checklist", { cache: "no-store" })
        if (res.ok) {
          const json: OnboardingChecklistData = await res.json()
          setData(json)
          if (typeof window !== "undefined") {
            try {
              if (json.allCompleted) {
                sessionStorage.setItem(ONBOARDING_DONE_KEY, "true")
                sessionStorage.removeItem(ONBOARDING_CACHE_KEY)
              } else {
                sessionStorage.removeItem(ONBOARDING_DONE_KEY)
                sessionStorage.setItem(ONBOARDING_CACHE_KEY, JSON.stringify(json))
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        console.warn("Onboarding progress check failed:", err)
      } finally {
        setLoading(false)
        setLoaded(true)
      }
    },
    [isAdmin]
  )

  useEffect(() => {
    fetchProgress(false)
  }, [fetchProgress])

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return
    const onProgressUpdate = () => {
      fetchProgress(true)
    }
    window.addEventListener(ONBOARDING_EVENT, onProgressUpdate)
    return () => window.removeEventListener(ONBOARDING_EVENT, onProgressUpdate)
  }, [isAdmin, fetchProgress])

  const skipGuide = useCallback(() => {
    setGuideSkipped(true)
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(ONBOARDING_SKIPPED_KEY, "true")
      } catch {
        // ignore
      }
    }
  }, [])

  const resumeGuide = useCallback(() => {
    setGuideSkipped(false)
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(ONBOARDING_SKIPPED_KEY)
      } catch {
        // ignore
      }
    }
  }, [])

  return useMemo(() => {
    const stepMap = new Map<OnboardingStepId, OnboardingStepItem>()
    if (data?.steps) {
      for (const s of data.steps) {
        stepMap.set(s.id, s)
      }
    }

    const allCompleted = Boolean(data?.allCompleted)
    const hasAgencies = allCompleted || Boolean(stepMap.get("agencies")?.completed)
    const hasUsers = allCompleted || Boolean(stepMap.get("users")?.completed)
    const hasZoneMap = allCompleted || Boolean(stepMap.get("zoneMap")?.completed)
    const hasDcList = allCompleted || Boolean(stepMap.get("dcList")?.completed)
    const hasMasterData = allCompleted || Boolean(stepMap.get("masterData")?.completed)

    const isLinked = Boolean(data?.isLinked)
    const isCoreSetupLocked = isAdmin && loaded && isLinked && !allCompleted && (!hasAgencies || !hasUsers)

    let activeStepId: OnboardingStepId | null = null
    if (isAdmin && loaded && isLinked && !allCompleted) {
      for (const id of STEP_ORDER) {
        const s = stepMap.get(id)
        if (s && !s.completed) {
          activeStepId = id
          break
        }
      }
    }

    const activeStep = activeStepId ? stepMap.get(activeStepId) || null : null
    const isGuiding = Boolean(
      isAdmin && loaded && isLinked && !allCompleted && activeStepId && (isCoreSetupLocked || !guideSkipped)
    )

    return {
      loaded,
      loading,
      data,
      hasAgencies,
      hasUsers,
      hasZoneMap,
      hasDcList,
      hasMasterData,
      isCoreSetupLocked,
      isGuiding,
      activeStepId,
      activeStep,
      guideSkipped,
      skipGuide,
      resumeGuide,
      refresh: fetchProgress,
    }
  }, [isAdmin, loaded, loading, data, guideSkipped, skipGuide, resumeGuide, fetchProgress])
}

/**
 * Animated pointing-hand gesture overlay with tap ripple and crisp step callout.
 * Uses pointer-events-none so it never blocks clicking the underlying card/button.
 */
export function HandGesturePointer({
  label,
  placement = "bottom-right",
  compact = false,
}: {
  label?: string
  placement?: "bottom-right" | "top-right" | "bottom-center" | "left"
  compact?: boolean
}) {
  const positionClasses =
    placement === "top-right"
      ? "top-2 right-2"
      : placement === "bottom-center"
      ? "-bottom-3 left-1/2 -translate-x-1/2"
      : placement === "left"
      ? "top-1/2 -left-3 -translate-y-1/2"
      : "bottom-2.5 right-2.5"

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-30 flex items-center gap-1.5 select-none ${positionClasses}`}
    >
      {label && (
        <span
          className={`whitespace-nowrap rounded-full bg-slate-900/95 text-white font-semibold shadow-lg border border-white/15 backdrop-blur-sm ${
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
          }`}
        >
          {label}
        </span>
      )}

      <div className="relative flex items-center justify-center">
        {/* Expanding tap ripple right at the fingertip */}
        <span className="animate-tap-ripple absolute -top-1 -left-1 h-5 w-5 rounded-full bg-blue-500/45 border border-blue-400" />
        <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 shadow-xs" />

        {/* Crisp illustrated pointing hand SVG */}
        <div
          className={`animate-hand-tap relative flex items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-blue-600/80 ${
            compact ? "h-8 w-8" : "h-10 w-10"
          }`}
        >
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={compact ? "h-5 w-5" : "h-6 w-6"}
          >
            {/* Pointing hand icon styled cleanly */}
            <path
              d="M12.5 5.5C12.5 4.39543 13.3954 3.5 14.5 3.5C15.6046 3.5 16.5 4.39543 16.5 5.5V14H17.5C18.6046 14 19.5 14.8954 19.5 16V15.5C19.5 14.3954 20.3954 13.5 21.5 13.5C22.6046 13.5 23.5 14.3954 23.5 15.5V16.5C23.5 15.6716 24.1716 15 25 15C25.8284 15 26.5 15.6716 26.5 16.5V21.5C26.5 25.366 23.366 28.5 19.5 28.5H15.5C12.8 28.5 10.6 26.9 9.2 24.4L6.3 19.3C5.7 18.25 6.05 16.9 7.1 16.3C8.1 15.72 9.4 16.05 10.05 17.05L12.5 20.5V5.5Z"
              fill="#FDE68A"
              stroke="#1E293B"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M16.5 14V18.5M19.5 15.5V19M23.5 16.5V19.5"
              stroke="#1E293B"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

const STEP_META: Record<
  OnboardingStepId,
  {
    shortLabel: string
    icon: typeof Building2
    instruction: string
    actionLabel: string
    phase: "core" | "data"
  }
> = {
  agencies: {
    shortLabel: "1. Add Agency",
    icon: Building2,
    instruction: "Add your first contractor agency in Admin Panel to begin workspace setup.",
    actionLabel: "Open Manage Agencies",
    phase: "core",
  },
  users: {
    shortLabel: "2. Create User",
    icon: UserPlus,
    instruction: "Create at least one field/agency login user to unlock all dashboard modules.",
    actionLabel: "Open Manage Users",
    phase: "core",
  },
  zoneMap: {
    shortLabel: "3. Zone Map",
    icon: MapPin,
    instruction: "Map MRU / Zone codes to agencies so uploaded DC lists auto-assign cleanly.",
    actionLabel: "Configure Zone Map",
    phase: "data",
  },
  dcList: {
    shortLabel: "4. DC List",
    icon: FileSpreadsheet,
    instruction: "Upload your Disconnection List (Excel/CSV) so agencies can start field work.",
    actionLabel: "Upload DC List",
    phase: "data",
  },
  masterData: {
    shortLabel: "5. Consumer Master",
    icon: Database,
    instruction: "Upload the Consumer Master file for instant search, GPS coordinates & lookup.",
    actionLabel: "Open Consumer Master",
    phase: "data",
  },
}

/**
 * Clean 5-step guided journey bar shown at the top of Dashboard & Admin Panel.
 */
export function GuidedJourneyBar({
  onboarding,
  onNavigateToStep,
  context = "dashboard",
}: {
  onboarding: OnboardingGuideState
  onNavigateToStep?: (targetView: string) => void
  context?: "dashboard" | "admin"
}) {
  if (!onboarding.isGuiding || !onboarding.data || !onboarding.activeStepId) return null

  const { data, activeStepId, isCoreSetupLocked, skipGuide } = onboarding
  const meta = STEP_META[activeStepId]
  const currentStep = onboarding.activeStep
  const completedCount = data.completedCount || 0
  const totalSteps = data.totalSteps || 5

  return (
    <div className="animate-fade-slide-up rounded-2xl border border-blue-200/90 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/70 p-3.5 sm:p-4 shadow-sm">
      {/* Top Row: Heading + Progress Pill + Optional Skip (only after core unlock) */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
              isCoreSetupLocked
                ? "bg-blue-600 text-white"
                : "bg-emerald-600 text-white"
            }`}
          >
            {isCoreSetupLocked ? (
              <Compass className="h-4 w-4" />
            ) : (
              <Unlock className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-[15px] font-bold text-slate-900 leading-tight">
                {isCoreSetupLocked
                  ? "Quick Workspace Setup"
                  : "Workspace Unlocked — Finish Data Setup"}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200/80 tabular-nums">
                {completedCount}/{totalSteps} Done
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 leading-snug">
              {meta.instruction}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onNavigateToStep && currentStep && (
            <Button
              size="sm"
              onClick={() => onNavigateToStep(currentStep.targetView)}
              className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs interactive-tap cursor-pointer"
            >
              {context === "dashboard" && isCoreSetupLocked ? "Start Step" : meta.actionLabel}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {!isCoreSetupLocked && (
            <button
              type="button"
              onClick={skipGuide}
              title="Hide setup guide for this session"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Skip Guide</span>
            </button>
          )}
        </div>
      </div>

      {/* 5-Step Horizontal Visual Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
        {STEP_ORDER.map((stepId, idx) => {
          const stepInfo = data.steps.find((s) => s.id === stepId)
          const stepMeta = STEP_META[stepId]
          const Icon = stepMeta.icon
          const isCompleted = Boolean(stepInfo?.completed)
          const isCurrent = stepId === activeStepId
          const isLockedFuture = isCoreSetupLocked && idx >= 2

          return (
            <button
              key={stepId}
              type="button"
              disabled={isLockedFuture || !onNavigateToStep || !stepInfo}
              onClick={() => {
                if (!isLockedFuture && onNavigateToStep && stepInfo) {
                  onNavigateToStep(stepInfo.targetView)
                }
              }}
              className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                isCompleted
                  ? "bg-emerald-50/90 border-emerald-200 text-emerald-900"
                  : isCurrent
                  ? "bg-blue-600 border-blue-700 text-white shadow-sm ring-2 ring-blue-300/60"
                  : isLockedFuture
                  ? "bg-slate-50/80 border-slate-200/70 text-slate-400 cursor-not-allowed"
                  : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50/40"
              } ${!isLockedFuture && onNavigateToStep ? "cursor-pointer interactive-tap" : ""}`}
            >
              <div
                className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                  isCompleted
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                    ? "bg-white/20 text-white"
                    : isLockedFuture
                    ? "bg-slate-200/70 text-slate-400"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : isLockedFuture ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[11px] font-bold truncate leading-tight ${
                    isCurrent ? "text-white" : isCompleted ? "text-emerald-900" : isLockedFuture ? "text-slate-400" : "text-slate-700"
                  }`}
                >
                  {stepMeta.shortLabel}
                </p>
                <p
                  className={`text-[9.5px] truncate leading-tight mt-0.5 ${
                    isCurrent ? "text-blue-100" : isCompleted ? "text-emerald-700" : "text-slate-400"
                  }`}
                >
                  {isCompleted
                    ? stepInfo && stepInfo.count > 0
                      ? `${stepInfo.count.toLocaleString()} added`
                      : "Completed"
                    : isCurrent
                    ? "Do this next"
                    : isLockedFuture
                    ? "Unlocks after Step 2"
                    : "Pending"}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact pill to resume the skipped post-unlock guide if user wants it back.
 */
export function ResumeGuideBanner({ onboarding }: { onboarding: OnboardingGuideState }) {
  if (!onboarding.loaded || !onboarding.data?.isLinked || onboarding.data.allCompleted) return null
  if (onboarding.isCoreSetupLocked || !onboarding.guideSkipped) return null

  return (
    <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-slate-100/90 border border-slate-200/80 text-xs text-slate-600">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" />
        <span className="truncate">
          Setup progress: <strong className="text-slate-900">{onboarding.data.completedCount}/{onboarding.data.totalSteps}</strong> steps completed
        </span>
      </div>
      <button
        type="button"
        onClick={onboarding.resumeGuide}
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold shrink-0 cursor-pointer"
      >
        <RotateCcw className="h-3 w-3" />
        Show Guide
      </button>
    </div>
  )
}

/**
 * Preview strip shown below Admin Panel while Step 1 & 2 are incomplete,
 * explaining what unlocks as soon as 1 Agency and 1 User are created.
 */
export function LockedModulesPreview({
  modules,
  hasAgencies,
  hasUsers,
}: {
  modules: { id: string; title: string; icon: any }[]
  hasAgencies: boolean
  hasUsers: boolean
}) {
  const lockedList = modules.filter((m) => m.id !== "admin")
  if (lockedList.length === 0) return null

  const remainingText = !hasAgencies
    ? "Create 1 Agency and 1 User in Admin Panel to unlock all operational modules."
    : !hasUsers
    ? "Agency added! Create 1 User in Admin Panel to immediately unlock all operational modules."
    : "Setup complete!"

  return (
    <section className="animate-fade-slide-up rounded-2xl border border-dashed border-slate-300/90 bg-slate-50/70 p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-slate-200/80 text-slate-600 flex items-center justify-center shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-700">
              {lockedList.length} Operational Modules Waiting to Unlock
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              {remainingText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${
              hasAgencies
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            {hasAgencies ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            1 Agency
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${
              hasUsers
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            {hasUsers ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            1 User
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {lockedList.map((mod) => {
          const Icon = mod.icon
          return (
            <div
              key={mod.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/70 border border-slate-200/70 text-slate-400 select-none"
            >
              <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <span className="text-xs font-medium truncate flex-1">{mod.title}</span>
              <Lock className="h-3 w-3 text-slate-300 shrink-0" />
            </div>
          )
        })}
      </div>
    </section>
  )
}
