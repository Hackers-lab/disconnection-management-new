"use client"

import { useState, useEffect } from "react"
import { Zap, RefreshCw, Gauge, ClipboardCheck, ShieldCheck, PowerOff } from "lucide-react"

interface ModuleItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
}

const MODULES: ModuleItem[] = [
  {
    title: "Disconnection Management",
    icon: Zap,
    iconClass: "text-amber-400 fill-amber-400",
  },
  {
    title: "Permanent Disconnection",
    icon: PowerOff,
    iconClass: "text-rose-400",
  },
  {
    title: "Reconnection Management",
    icon: RefreshCw,
    iconClass: "text-emerald-400",
  },
  {
    title: "Meter Management",
    icon: Gauge,
    iconClass: "text-sky-400",
  },
  {
    title: "NSC Management",
    icon: ClipboardCheck,
    iconClass: "text-indigo-400",
  },
  {
    title: "DTR Management",
    icon: ShieldCheck,
    iconClass: "text-purple-400",
  },
]

export function LoginDynamicHeader() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timer = setInterval(() => {
      setIsTransitioning(true)
      timeoutId = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % MODULES.length)
        setIsTransitioning(false)
      }, 220)
    }, 5200)

    return () => {
      clearInterval(timer)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  const current = MODULES[currentIndex]
  const IconComponent = current.icon

  return (
    <div className="text-center space-y-2.5 select-none animate-fade-slide-up">
      {/* Calm, Authoritative Brand Badge (no 90deg spinning or timer haptics) */}
      <div
        className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/15 ring-4 ring-white/85 transition-transform duration-300 hover:scale-105 ${
          isTransitioning ? "scale-95" : "scale-100"
        }`}
      >
        <div
          className={`transition-all duration-200 ${
            isTransitioning ? "opacity-0 translate-y-1 scale-90" : "opacity-100 translate-y-0 scale-100"
          }`}
        >
          <IconComponent className={`w-6 h-6 transition-colors ${current.iconClass}`} />
        </div>
      </div>

      {/* Smooth Slide-Fade Title */}
      <div className="h-8 flex items-center justify-center overflow-hidden">
        <h1
          className={`text-2xl sm:text-[26px] font-black tracking-tight text-slate-900 select-none transition-all duration-200 ease-out ${
            isTransitioning ? "opacity-0 -translate-y-1.5" : "opacity-100 translate-y-0"
          }`}
        >
          {current.title}
        </h1>
      </div>

      {/* Subtle Progress Indicator Dots */}
      <div className="flex items-center justify-center gap-1.5 pt-0.5">
        {MODULES.map((m, idx) => (
          <button
            key={m.title}
            type="button"
            onClick={() => {
              setIsTransitioning(false)
              setCurrentIndex(idx)
            }}
            aria-label={m.title}
            className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
              idx === currentIndex
                ? "w-5 bg-slate-800"
                : "w-1.5 bg-slate-300 hover:bg-slate-400"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
