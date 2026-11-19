"use client"

import { useState, useEffect } from "react"
import {
  Zap,
  PowerOff,
  RefreshCw,
  Gauge,
  ClipboardCheck,
  ShieldCheck,
  Navigation,
  WifiOff,
  Building2,
  CheckCircle2,
  Sparkles,
} from "lucide-react"

interface ShowcaseModule {
  id: string
  title: string
  shortTitle: string
  tagline: string
  highlights: string[]
  icon: typeof Zap
  accent: string
  badgeBg: string
}

const SHOWCASE_MODULES: ShowcaseModule[] = [
  {
    id: "dc",
    title: "Disconnection Operations",
    shortTitle: "Disconnection",
    tagline: "Live OSD tracking, agency zone routing, and photo-verified field updates.",
    highlights: ["Real-time GPS consumer radar", "Zone & MRU agency assignment", "Instant Excel & PDF daily reports"],
    icon: Zap,
    accent: "text-amber-400",
    badgeBg: "bg-amber-500/15 border-amber-400/30 text-amber-300",
  },
  {
    id: "pd",
    title: "Permanent Disconnection",
    shortTitle: "Permanent DC",
    tagline: "End-to-end meter dismantling, store return logs, and note sheet generation.",
    highlights: ["Live OSD aging filters", "Meter return & seal tracking", "Printable note sheet & audit trail"],
    icon: PowerOff,
    accent: "text-rose-400",
    badgeBg: "bg-rose-500/15 border-rose-400/30 text-rose-300",
  },
  {
    id: "rc",
    title: "Reconnection Desk",
    shortTitle: "Reconnection",
    tagline: "Fast payment verification and SLA-monitored service restoration alerts.",
    highlights: ["Overdue reconnection alerts", "Receipt & UTR verification", "Zero-delay field dispatch"],
    icon: RefreshCw,
    accent: "text-emerald-400",
    badgeBg: "bg-emerald-500/15 border-emerald-400/30 text-emerald-300",
  },
  {
    id: "meter",
    title: "Meter Stock & Replacement",
    shortTitle: "Metering",
    tagline: "Track defective meters, agency stock allotments, and serial installations.",
    highlights: ["Agency-wise stock ledger", "Replacement pipeline tracking", "Serial number validation"],
    icon: Gauge,
    accent: "text-sky-400",
    badgeBg: "bg-sky-500/15 border-sky-400/30 text-sky-300",
  },
  {
    id: "nsc",
    title: "New Service Connections",
    shortTitle: "NSC & ICDS",
    tagline: "Monitor quotations, site feasibility inspections, and timely connection release.",
    highlights: ["Stage-wise pending tracker", "ICDS electrification workflow", "Geo-tagged inspection proof"],
    icon: ClipboardCheck,
    accent: "text-indigo-400",
    badgeBg: "bg-indigo-500/15 border-indigo-400/30 text-indigo-300",
  },
  {
    id: "dtr",
    title: "DTR & Safety Telemetry",
    shortTitle: "DTR & Safety",
    tagline: "Transformer health audits, GIS pole captures, and hazard ticket resolution.",
    highlights: ["DTR maintenance schedules", "Hazard & safety ticketing", "GIS asset coordinate capture"],
    icon: ShieldCheck,
    accent: "text-violet-400",
    badgeBg: "bg-violet-500/15 border-violet-400/30 text-violet-300",
  },
]

function toBengaliDigits(num: number): string {
  return String(num)
    .replace(/0/g, "০")
    .replace(/1/g, "১")
    .replace(/2/g, "২")
    .replace(/3/g, "৩")
    .replace(/4/g, "৪")
    .replace(/5/g, "৫")
    .replace(/6/g, "৬")
    .replace(/7/g, "৭")
    .replace(/8/g, "৮")
    .replace(/9/g, "৯")
}

export function LoginShowcasePanel({ tenantCount }: { tenantCount: number }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [langIndex, setLangIndex] = useState<0 | 1>(0)
  const [langFade, setLangFade] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % SHOWCASE_MODULES.length)
    }, 5500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timer = setInterval(() => {
      setLangFade(false)
      timeoutId = setTimeout(() => {
        setLangIndex((prev) => (prev === 0 ? 1 : 0))
        setLangFade(true)
      }, 240)
    }, 5000)
    return () => {
      clearInterval(timer)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  const activeMod = SHOWCASE_MODULES[activeIndex]
  const ActiveIcon = activeMod.icon

  return (
    <aside className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative flex-col justify-between bg-gradient-to-br from-slate-950 via-[#0e1b38] to-indigo-950 text-white p-10 xl:p-14 overflow-hidden select-none">
      {/* Subtle Architectural Grid Pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Ambient Atmospheric Glows */}
      <div className="pointer-events-none absolute -top-28 -left-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/40 ring-1 ring-white/20">
            <Zap className="h-5 w-5 text-white fill-white/90" />
          </div>
          <div>
            <div className="text-base font-extrabold tracking-tight text-white leading-tight">
              Utility Field Operations
            </div>
            <div className="text-[11px] font-medium text-sky-300/80">
              Multi-CCC Disconnection &amp; Metering Suite
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span
            className={`transition-opacity duration-200 ${langFade ? "opacity-100" : "opacity-0"} ${
              langIndex === 1 ? "font-[family-name:var(--font-bengali)]" : ""
            }`}
          >
            {langIndex === 0
              ? `Trusted by ${tenantCount}+ CCCs`
              : `${toBengaliDigits(tenantCount)}+ টি CCC-র বিশ্বস্ত সহযোগী`}
          </span>
        </div>
      </div>

      {/* Center Hero + Interactive Module Spotlight */}
      <div className="relative z-10 my-auto py-8 space-y-7 max-w-2xl">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Unified Power Distribution Command Center</span>
          </div>
          <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
            Coordinate field teams, consumers &amp; compliance from one screen.
          </h1>
          <p className="text-sm text-slate-300/90 leading-relaxed max-w-xl">
            Built for Care Centers and field agencies to run disconnections, reconnections, meter stock, and GPS consumer tracking seamlessly—online or offline.
          </p>
        </div>

        {/* Interactive Module Selector Pills */}
        <div className="flex flex-wrap gap-1.5">
          {SHOWCASE_MODULES.map((mod, idx) => {
            const Icon = mod.icon
            const isActive = idx === activeIndex
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer border ${
                  isActive
                    ? "bg-white text-slate-900 border-white shadow-md"
                    : "bg-white/[0.06] text-slate-300 border-white/10 hover:bg-white/[0.12] hover:text-white"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-blue-600" : mod.accent}`} />
                <span>{mod.shortTitle}</span>
              </button>
            )
          })}
        </div>

        {/* Active Module Spotlight Card */}
        <div
          key={activeMod.id}
          className="rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-md p-5 shadow-2xl space-y-4 animate-in fade-in duration-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${activeMod.badgeBg}`}>
                <ActiveIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">{activeMod.title}</h2>
                <p className="text-xs text-slate-300 mt-0.5">{activeMod.tagline}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded-md px-2 py-0.5 shrink-0">
              {String(activeIndex + 1).padStart(2, "0")} / {String(SHOWCASE_MODULES.length).padStart(2, "0")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {activeMod.highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-xl bg-slate-950/40 border border-white/10 px-3 py-2 text-[11px] font-medium text-slate-200"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom 3 Capability Pillars */}
      <div className="relative z-10 grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-500/15 border border-blue-400/25 flex items-center justify-center shrink-0">
            <Navigation className="h-4 w-4 text-sky-300" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">GPS Field Radar</div>
            <div className="text-[10px] text-slate-400 truncate">Locate nearest consumers</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center shrink-0">
            <WifiOff className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">Offline-First Cache</div>
            <div className="text-[10px] text-slate-400 truncate">Delta sync in low signal</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">CCC Data Isolation</div>
            <div className="text-[10px] text-slate-400 truncate">Dedicated tenant workspaces</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
