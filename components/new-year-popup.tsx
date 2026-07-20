"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  BarChart3,
  Sparkles,
  RefreshCw,
  ClipboardCheck,
  Gauge,
  Wrench,
  Shield,
} from "lucide-react"

// Bump this key whenever you want to re-show the popup to all users.
const STORAGE_KEY = "system_update_v3_july2026_seen"

// Old keys from previous popups — cleared on first mount so they don't interfere.
const OLD_KEYS = [
  "modules_live_june2026_seen",
  "new_year_popup_seen",
  "new_update_seen",
  "new_year_2025_seen",
]

export function NewYearPopup({ userId }: { userId?: string }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Remove stale popup keys so they don't accumulate in localStorage.
    OLD_KEYS.forEach((k) => localStorage.removeItem(k))

    if (!localStorage.getItem(STORAGE_KEY)) setIsOpen(true)
  }, [])

  const handleOk = () => {
    localStorage.setItem(STORAGE_KEY, "true")
    setIsOpen(false)
  }

  const updates = [
    {
      icon: BarChart3,
      label: "Agency Updates Report",
      desc: "Date-wise performance matrix — see how many consumers each agency updated per day, with PDF & Excel export.",
      color: "bg-indigo-50 text-indigo-600 border-indigo-200",
      tag: "New",
      tagColor: "bg-indigo-600",
    },
    {
      icon: RefreshCw,
      label: "Reconnection Module",
      desc: "Track and manage consumer reconnections end-to-end with approval workflow.",
      color: "bg-blue-50 text-blue-600 border-blue-200",
      tag: "Live",
      tagColor: "bg-blue-500",
    },
    {
      icon: ClipboardCheck,
      label: "NSC Inspection",
      desc: "New Service Connection applications, site inspection & processing.",
      color: "bg-green-50 text-green-600 border-green-200",
      tag: "Live",
      tagColor: "bg-green-500",
    },
    {
      icon: Gauge,
      label: "Meter Management",
      desc: "Stock tracking, meter issuance, installation & finalization.",
      color: "bg-purple-50 text-purple-600 border-purple-200",
      tag: "Live",
      tagColor: "bg-purple-500",
    },
    {
      icon: Wrench,
      label: "Meter Replacement",
      desc: "Faulty, burnt & slow-fast meter replacements with image evidence.",
      color: "bg-orange-50 text-orange-600 border-orange-200",
      tag: "Live",
      tagColor: "bg-orange-500",
    },
    {
      icon: Shield,
      label: "Smart Cache & Sync",
      desc: "Offline-capable data with background sync — faster loads, fewer API calls.",
      color: "bg-teal-50 text-teal-600 border-teal-200",
      tag: "Improved",
      tagColor: "bg-teal-500",
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm w-full p-0 overflow-hidden rounded-2xl [&>button]:hidden max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">System Updates</DialogTitle>

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 via-blue-600 to-blue-500 px-6 pt-6 pb-5 text-white text-center shrink-0">
          <div className="flex justify-center mb-3">
            <div className="bg-white/20 rounded-full p-3">
              <Sparkles className="h-7 w-7 text-yellow-300" />
            </div>
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">What's New</h2>
          <p className="text-sm text-white/80 mt-1">Latest updates &amp; features ready for you</p>
        </div>

        {/* Update list */}
        <div className="px-4 py-3 space-y-2.5 bg-white overflow-y-auto flex-1">
          {updates.map(({ icon: Icon, label, desc, color, tag, tagColor }) => (
            <div key={label} className={`flex items-start gap-3 border rounded-xl p-3 ${color}`}>
              <div className="shrink-0 mt-0.5">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold">{label}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${tagColor}`}>
                    {tag}
                  </span>
                </div>
                <p className="text-xs opacity-75 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 shrink-0">
          <Button
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold"
            onClick={handleOk}
          >
            Got it, Let's Go!
          </Button>
          <p className="text-center text-[10px] text-gray-400 mt-2">
            This message won't appear again on this device.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
