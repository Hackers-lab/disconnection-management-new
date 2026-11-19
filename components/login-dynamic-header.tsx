"use client"

import { useState, useEffect } from "react"
import { Zap, RefreshCw, Gauge, ClipboardCheck, ShieldCheck, PowerOff } from "lucide-react"

interface ModuleItem {
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
}

const MODULES: ModuleItem[] = [
  {
    title: "Disconnection Management",
    subtitle: "Live OSD tracking & agency zone sync",
    icon: Zap,
    iconClass: "text-amber-300 fill-amber-300/90",
  },
  {
    title: "Permanent Disconnection",
    subtitle: "Meter dismantling & note sheet workflow",
    icon: PowerOff,
    iconClass: "text-rose-300",
  },
  {
    title: "Reconnection Desk",
    subtitle: "Payment verification & SLA tracking",
    icon: RefreshCw,
    iconClass: "text-emerald-300",
  },
  {
    title: "Meter Management",
    subtitle: "Stock allotments & defective replacements",
    icon: Gauge,
    iconClass: "text-sky-300",
  },
  {
    title: "NSC & ICDS Operations",
    subtitle: "New service connections & field inspections",
    icon: ClipboardCheck,
    iconClass: "text-indigo-300",
  },
  {
    title: "DTR & Safety Audits",
    subtitle: "Transformer health & hazard resolution",
    icon: ShieldCheck,
    iconClass: "text-violet-300",
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
      }, 200)
    }, 5200)

    return () => {
      clearInterval(timer)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  const current = MODULES[currentIndex]
  const IconComponent = current.icon

  return (
    <div className="text-center space-y-2 select-none">
      <div
        className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 text-white shadow-lg shadow-blue-900/15 ring-4 ring-white transition-transform duration-300 ${
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

      <div className="space-y-0.5">
        <div className="min-h-[30px] flex items-center justify-center overflow-hidden">
          <h1
            className={`text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 transition-all duration-200 ease-out ${
              isTransitioning ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"
            }`}
          >
            {current.title}
          </h1>
        </div>
        <p
          className={`text-xs text-slate-500 font-medium transition-opacity duration-200 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          {current.subtitle}
        </p>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
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
                ? "w-5 bg-blue-600"
                : "w-1.5 bg-slate-300 hover:bg-slate-400"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
