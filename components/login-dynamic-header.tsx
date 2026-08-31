"use client"

import { useState, useEffect } from "react"
import { Zap, RefreshCw, Gauge, ClipboardCheck, ShieldCheck } from "lucide-react"

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
  const [isFading, setIsFading] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setIsFading(true)
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % MODULES.length)
        setIsFading(false)
      }, 260)
    }, 2200)

    return () => clearInterval(timer)
  }, [])

  const current = MODULES[currentIndex]
  const IconComponent = current.icon

  return (
    <div className="text-center space-y-2 select-none">
      {/* Dynamic Animated Badge Icon */}
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15 ring-4 ring-white/80 transition-all duration-300 hover:scale-105">
        <div
          className={`transition-all duration-300 transform ${
            isFading ? "opacity-0 scale-75 rotate-12" : "opacity-100 scale-100 rotate-0"
          }`}
        >
          <IconComponent className={`w-6 h-6 transition-colors ${current.iconClass}`} />
        </div>
      </div>

      {/* Dynamic Animated Title (Fixed height container to avoid layout shift) */}
      <div className="h-8 flex items-center justify-center overflow-hidden">
        <h1
          className={`text-2xl sm:text-[26px] font-black tracking-tight animate-title-shimmer select-none drop-shadow-sm transition-all duration-300 transform ${
            isFading ? "opacity-0 -translate-y-2 scale-95" : "opacity-100 translate-y-0 scale-100"
          }`}
        >
          {current.title}
        </h1>
      </div>
    </div>
  )
}
