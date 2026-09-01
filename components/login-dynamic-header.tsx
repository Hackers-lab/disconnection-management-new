"use client"

import { useState, useEffect } from "react"
import { Zap, RefreshCw, Gauge, ClipboardCheck, ShieldCheck } from "lucide-react"
import { triggerHaptic } from "@/lib/haptics"

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
        triggerHaptic("tick")
      }, 280)
    }, 3800)

    return () => clearInterval(timer)
  }, [])

  const current = MODULES[currentIndex]
  const IconComponent = current.icon

  return (
    <div className="text-center space-y-2.5 select-none">
      {/* Dynamic Synchronized Rotating Badge Box */}
      <div
        className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/15 ring-4 ring-white/80 transition-all duration-500 hover:scale-105 ${
          isFading ? "scale-95 shadow-sm" : "scale-100 shadow-md"
        }`}
        style={{
          transform: `rotate(${currentIndex * 90}deg)`,
          transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          className={`transition-opacity duration-250 ${
            isFading ? "opacity-0" : "opacity-100"
          }`}
          style={{
            transform: `rotate(-${currentIndex * 90}deg)`,
          }}
        >
          <IconComponent className={`w-6 h-6 transition-colors ${current.iconClass}`} />
        </div>
      </div>

      {/* Dynamic Smooth Title (Fixed height container to prevent layout shift) */}
      <div className="h-8 flex items-center justify-center overflow-hidden">
        <h1
          className={`text-2xl sm:text-[26px] font-black tracking-tight text-slate-900 select-none drop-shadow-xs transition-opacity duration-300 ease-in-out ${
            isFading ? "opacity-0" : "opacity-100"
          }`}
        >
          {current.title}
        </h1>
      </div>
    </div>
  )
}
