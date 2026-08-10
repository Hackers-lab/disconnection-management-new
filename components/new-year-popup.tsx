"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  FileText,
  Sparkles,
  MapPin,
  History,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"

// Bump key so it triggers on first login for every user
const STORAGE_KEY = "system_update_v4_aug2026_seen"

const OLD_KEYS = [
  "system_update_v3_july2026_seen",
  "modules_live_june2026_seen",
  "new_year_popup_seen",
  "new_update_seen",
  "new_year_2025_seen",
]

export function NewYearPopup({ userId }: { userId?: string }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Clear legacy keys so they don't bloat local storage
    OLD_KEYS.forEach((k) => localStorage.removeItem(k))

    if (!localStorage.getItem(STORAGE_KEY)) setIsOpen(true)
  }, [])

  const handleOk = () => {
    localStorage.setItem(STORAGE_KEY, "true")
    setIsOpen(false)
  }

  const updates = [
    {
      icon: FileText,
      label: "Downloadable NSC Report PDF",
      desc: "Generate official A4 PDF Inspection Reports for New Service Connections (NSC) complete with Pole Case status, attachment checkboxes, auto-straightening & print optimizations.",
      color: "bg-indigo-50/80 text-indigo-700 border-indigo-200/90",
      tag: "FEATURED",
      tagColor: "bg-indigo-600",
      isFeatured: true,
    },
    {
      icon: MapPin,
      label: "Live GPS & Photo Watermarking",
      desc: "Captures precise GPS Latitude & Longitude during NSC inspection and watermarks photo proof with field coordinates.",
      color: "bg-blue-50/70 text-blue-700 border-blue-200/80",
      tag: "NEW",
      tagColor: "bg-blue-600",
    },
    {
      icon: History,
      label: "Multi-Round Inspection Audit",
      desc: "Track full inspection history and disposal audit logs for single rows across multiple inspection rounds.",
      color: "bg-emerald-50/70 text-emerald-700 border-emerald-200/80",
      tag: "NEW",
      tagColor: "bg-emerald-600",
    },
    {
      icon: ShieldCheck,
      label: "DTR Verification & Map Radar",
      desc: "Verify distribution transformer parameters, view GPS radar distribution, and export agency reports.",
      color: "bg-purple-50/70 text-purple-700 border-purple-200/80",
      tag: "LIVE",
      tagColor: "bg-purple-600",
    },
    {
      icon: Zap,
      label: "Blazing Fast Performance",
      desc: "Ultra-fast sub-100ms loading with smart 30-day data caching and bandwidth-saving delta sync.",
      color: "bg-amber-50/70 text-amber-700 border-amber-200/80",
      tag: "FAST",
      tagColor: "bg-amber-600",
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md w-[92vw] sm:w-full p-0 overflow-hidden rounded-3xl border border-slate-800 shadow-2xl [&>button]:hidden max-h-[92vh] flex flex-col bg-white">
        <DialogTitle className="sr-only">New Feature Update: NSC Inspection PDF Report</DialogTitle>

        {/* --- MODERN GRADIENT HEADER --- */}
        <div className="relative bg-slate-900 text-white px-6 pt-6 pb-5 text-center shrink-0 border-b border-slate-800 overflow-hidden">
          {/* Subtle Ambient Glow Blobs */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-2xl mb-1">
              <Sparkles className="h-6 w-6 text-amber-300 animate-pulse" />
            </div>
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-600/30 border border-indigo-400/30 text-[10px] font-extrabold tracking-widest text-indigo-300 uppercase">
              System Release Announcement
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">
              NSC Inspection Report PDF Released!
            </h2>
            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
              Generate & download official PDF reports for New Service Connections directly from your dashboard.
            </p>
          </div>
        </div>

        {/* --- UPDATE FEATURE LIST --- */}
        <div className="px-5 py-4 space-y-3 bg-slate-50/50 overflow-y-auto flex-1">
          {updates.map(({ icon: Icon, label, desc, color, tag, tagColor, isFeatured }) => (
            <div
              key={label}
              className={`flex items-start gap-3.5 border rounded-2xl p-3.5 transition-all ${color} ${
                isFeatured ? "ring-2 ring-indigo-500/30 shadow-md bg-white" : ""
              }`}
            >
              <div className="shrink-0 mt-0.5 p-2 rounded-xl bg-white shadow-sm border border-slate-100">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">{label}</p>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full text-white tracking-wider ${tagColor}`}>
                    {tag}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* --- ACTION FOOTER --- */}
        <div className="px-5 pb-5 pt-3 bg-white border-t border-slate-100 shrink-0">
          <Button
            className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold shadow-lg shadow-slate-900/20 gap-2 flex items-center justify-center transition-all active:scale-[0.98]"
            onClick={handleOk}
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Got it, Explore Dashboard!
          </Button>
          <p className="text-center text-[10px] text-slate-400 mt-2 font-medium">
            This notice will automatically mark as read for your account.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
