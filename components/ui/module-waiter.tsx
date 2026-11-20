"use client"

import { useEffect, useState } from "react"
import { Zap, Sparkles, ShieldCheck, Layers } from "lucide-react"
import { SkeletonCard } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type WaiterAccent = "blue" | "red" | "amber" | "emerald" | "indigo" | "orange"

interface ModuleWaiterProps {
  title?: string
  subtitle?: string
  messages?: string[]
  accent?: WaiterAccent
  variant?: "module" | "inline" | "fullscreen"
  showSkeletonCards?: boolean
  skeletonCount?: number
  className?: string
}

const DEFAULT_MESSAGES = [
  "Connecting to CCC workspace...",
  "Syncing latest field records...",
  "Organizing cards & filters...",
  "Almost ready...",
]

const ACCENT_MAP: Record<
  WaiterAccent,
  {
    ringFrom: string
    ringTo: string
    iconBg: string
    iconText: string
    barBg: string
    pillBg: string
    pillText: string
    glow: string
  }
> = {
  blue: {
    ringFrom: "from-blue-500",
    ringTo: "to-indigo-600",
    iconBg: "bg-blue-50 border-blue-200/90",
    iconText: "text-blue-600",
    barBg: "from-blue-500 via-indigo-500 to-cyan-500",
    pillBg: "bg-blue-50 border-blue-200/80",
    pillText: "text-blue-700",
    glow: "bg-blue-500/15",
  },
  red: {
    ringFrom: "from-red-500",
    ringTo: "to-orange-500",
    iconBg: "bg-red-50 border-red-200/90",
    iconText: "text-red-600",
    barBg: "from-red-500 via-orange-500 to-amber-500",
    pillBg: "bg-red-50 border-red-200/80",
    pillText: "text-red-700",
    glow: "bg-red-500/15",
  },
  orange: {
    ringFrom: "from-orange-500",
    ringTo: "to-amber-500",
    iconBg: "bg-orange-50 border-orange-200/90",
    iconText: "text-orange-600",
    barBg: "from-orange-500 via-amber-500 to-yellow-500",
    pillBg: "bg-orange-50 border-orange-200/80",
    pillText: "text-orange-700",
    glow: "bg-orange-500/15",
  },
  amber: {
    ringFrom: "from-amber-500",
    ringTo: "to-orange-500",
    iconBg: "bg-amber-50 border-amber-200/90",
    iconText: "text-amber-600",
    barBg: "from-amber-500 via-orange-400 to-yellow-500",
    pillBg: "bg-amber-50 border-amber-200/80",
    pillText: "text-amber-800",
    glow: "bg-amber-500/15",
  },
  emerald: {
    ringFrom: "from-emerald-500",
    ringTo: "to-teal-600",
    iconBg: "bg-emerald-50 border-emerald-200/90",
    iconText: "text-emerald-600",
    barBg: "from-emerald-500 via-teal-500 to-cyan-500",
    pillBg: "bg-emerald-50 border-emerald-200/80",
    pillText: "text-emerald-700",
    glow: "bg-emerald-500/15",
  },
  indigo: {
    ringFrom: "from-indigo-500",
    ringTo: "to-violet-600",
    iconBg: "bg-indigo-50 border-indigo-200/90",
    iconText: "text-indigo-600",
    barBg: "from-indigo-500 via-blue-500 to-violet-500",
    pillBg: "bg-indigo-50 border-indigo-200/80",
    pillText: "text-indigo-700",
    glow: "bg-indigo-500/15",
  },
}

export function ModuleWaiter({
  title = "Loading Workspace",
  subtitle = "Fetching live data for your CCC",
  messages = DEFAULT_MESSAGES,
  accent = "blue",
  variant = "module",
  showSkeletonCards = true,
  skeletonCount = 6,
  className,
}: ModuleWaiterProps) {
  const [msgIndex, setMsgIndex] = useState(0)
  const palette = ACCENT_MAP[accent] || ACCENT_MAP.blue
  const activeMessage = messages[msgIndex % messages.length] || DEFAULT_MESSAGES[0]

  useEffect(() => {
    if (!messages || messages.length <= 1) return
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length)
    }, 2000)
    return () => clearInterval(timer)
  }, [messages])

  if (variant === "fullscreen") {
    return (
      <div
        className={cn(
          "relative flex min-h-screen w-full items-center justify-center bg-[#eef2f7] overflow-hidden px-4 py-10 select-none",
          className
        )}
      >
        {/* Soft Ambient Aurora Blobs */}
        <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-24 right-1/4 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl animate-pulse" />

        <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.16)] p-7 sm:p-8 flex flex-col items-center text-center space-y-5 animate-fade-slide-up">
          {/* Animated Electric Emblem */}
          <div className="relative flex h-20 w-20 items-center justify-center animate-waiter-float">
            <div
              className={cn(
                "absolute inset-0 rounded-full bg-gradient-to-tr p-[3px] animate-spin",
                palette.ringFrom,
                palette.ringTo
              )}
              style={{ animationDuration: "2.4s" }}
            >
              <div className="h-full w-full rounded-full bg-white" />
            </div>
            <div className={cn("absolute h-14 w-14 rounded-full blur-lg opacity-70 animate-pulse", palette.glow)} />
            <div
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-2xl border shadow-xs",
                palette.iconBg,
                palette.iconText
              )}
            >
              <Zap className="h-6 w-6 fill-current" />
            </div>
          </div>

          {/* Title & Rotating Status */}
          <div className="space-y-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                palette.pillBg,
                palette.pillText
              )}
            >
              <Sparkles className="h-3 w-3" />
              Please Wait
            </span>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>

          {/* Smooth Indeterminate Progress Bar */}
          <div className="w-full space-y-2">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/80">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r animate-waiter-bar",
                  palette.barBg
                )}
              />
            </div>
            <p className="text-[11px] font-semibold text-slate-600 min-h-[16px] transition-opacity duration-300">
              {activeMessage}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Encrypted CCC Data Sync</span>
          </div>
        </div>
      </div>
    )
  }

  if (variant === "inline") {
    return (
      <div className={cn("space-y-5 animate-fade-slide-up", className)}>
        {/* Sleek Inline Waiter Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/95 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] p-4 sm:p-5">
          <div
            className={cn(
              "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl opacity-60",
              palette.glow
            )}
          />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Orbital Spinner Emblem */}
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
              <div
                className={cn(
                  "absolute inset-0 rounded-full bg-gradient-to-tr p-[2.5px] animate-spin",
                  palette.ringFrom,
                  palette.ringTo
                )}
                style={{ animationDuration: "2s" }}
              >
                <div className="h-full w-full rounded-full bg-white" />
              </div>
              <div
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-xl border",
                  palette.iconBg,
                  palette.iconText
                )}
              >
                <Zap className="h-4 w-4 fill-current" />
              </div>
            </div>

            {/* Text & Animated Progress Track */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                    {title}
                  </h3>
                  <p className="text-xs text-slate-500">{activeMessage}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0",
                    palette.pillBg,
                    palette.pillText
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
                  Syncing Live
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r animate-waiter-bar",
                    palette.barBg
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview Skeleton Cards */}
        {showSkeletonCards && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Default: "module" variant (used when switching between dashboard modules via next/dynamic)
  return (
    <div className={cn("max-w-6xl mx-auto py-4 sm:py-6 space-y-6 animate-fade-slide-up", className)}>
      <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/95 shadow-[0_8px_30px_-10px_rgba(15,23,42,0.12)] px-6 py-8 sm:py-10 flex flex-col items-center text-center space-y-4">
        <div
          className={cn(
            "pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-72 rounded-full blur-3xl opacity-70",
            palette.glow
          )}
        />

        <div className="relative flex h-16 w-16 items-center justify-center animate-waiter-float">
          <div
            className={cn(
              "absolute inset-0 rounded-full bg-gradient-to-tr p-[3px] animate-spin",
              palette.ringFrom,
              palette.ringTo
            )}
            style={{ animationDuration: "2.1s" }}
          >
            <div className="h-full w-full rounded-full bg-white" />
          </div>
          <div
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-2xl border shadow-2xs",
              palette.iconBg,
              palette.iconText
            )}
          >
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className="relative z-10 space-y-1 max-w-sm">
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="relative z-10 w-full max-w-xs space-y-2">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/80">
            <div
              className={cn(
                "absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r animate-waiter-bar",
                palette.barBg
              )}
            />
          </div>
          <p className="text-[11px] font-semibold text-slate-600 min-h-[16px]">
            {activeMessage}
          </p>
        </div>
      </div>

      {showSkeletonCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: Math.min(skeletonCount, 3) }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
    </div>
  )
}
